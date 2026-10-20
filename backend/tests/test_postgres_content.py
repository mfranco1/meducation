"""Real PG17 integration; resets only the launcher's disposable content schema."""

import copy
import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest
from alembic import command
from sqlalchemy import Engine, make_url, text
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.db.bootstrap import RolePasswords, bootstrap
from meducation_api.db.draft import reset_draft
from meducation_api.db.engine import ContentDatabaseError, create_database_engine
from meducation_api.db.migrate import migration_config, migration_head, upgrade
from meducation_api.db.operations import activate_release, paired_artifacts, store_release
from meducation_api.db.recovery import advance_ids

pytestmark = pytest.mark.postgres
ROOT = Path(__file__).resolve().parents[2]
ACTOR = "local-test-operator"
REASON = "Disposable content integration fixture"


@dataclass
class Database:
    admin: Engine
    migrator: Engine
    operator: Engine
    reader: Engine
    backup: Engine
    session: Engine
    editor: Engine


@pytest.fixture
def db():
    value = os.environ.get("MEDUCATION_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Run scripts/containers/test-postgres-content.py for isolated real-PG17 tests")
    url = make_url(value)
    if (
        url.host != "127.0.0.1"
        or not (url.database or "").startswith("meducation_test_")
        or url.username != "meducation_bootstrap"
    ):
        raise RuntimeError("Integration tests require the launcher's disposable loopback database")
    passwords = RolePasswords(_env_file=None)
    engines = [create_database_engine(url, operator=True)]
    for role in ("migrator", "operator", "reader", "backup", "session", "editor"):
        engines.append(
            create_database_engine(
                url.set(
                    username="meducation_" + role,
                    password=getattr(passwords, role + "_password").get_secret_value(),
                ),
                operator=True,
            )
        )
    database = Database(*engines)
    try:
        with database.admin.begin() as connection:
            connection.exec_driver_sql("DROP SCHEMA IF EXISTS admin_auth CASCADE")
            connection.exec_driver_sql("DROP SCHEMA IF EXISTS content CASCADE")
        bootstrap(database.admin, passwords)
        upgrade(database.migrator)
        yield database
    finally:
        for engine in engines:
            engine.dispose()


def banks():
    q = json.loads((ROOT / "tests/fixtures/bank-contract-cases.json").read_text())["base"]
    f = {
        "schemaVersion": 4,
        "decks": [
            {
                "id": "dlegacy-X",
                "topicId": q["topics"][0]["id"],
                "name": "Deck β",
                "description": "",
            }
        ],
        "cards": [
            {
                "id": "flegacy-X",
                "deckId": "dlegacy-X",
                "front": "**Front** $x^2$\n",
                "back": "Back β",
                "sources": "",
            }
        ],
    }
    q["questions"][0].update(
        {
            "metadata": {"topic": "β", "tags": []},
            "pearls": [],
        }
    )
    return q, f


def artifacts(q=None, f=None):
    base_q, base_f = banks()
    return paired_artifacts(
        json.dumps(base_q if q is None else q, ensure_ascii=False),
        json.dumps(base_f if f is None else f, ensure_ascii=False),
    )


def store(db, op=None, q=None, f=None):
    qt, ft = artifacts(q, f)
    with db.operator.begin() as connection:
        return store_release(
            connection,
            operation_id=op or uuid4(),
            quiz_text=qt,
            flashcard_text=ft,
            source_hashes={
                "quiz": hashlib.sha256(qt.encode()).hexdigest(),
                "flashcard": hashlib.sha256(ft.encode()).hexdigest(),
            },
            actor=ACTOR,
            reason=REASON,
        )


def publish(db, release, expected=0, op=None):
    with db.operator.begin() as connection:
        return activate_release(
            connection,
            operation_id=op or uuid4(),
            release_id=release.release_id,
            expected_sequence=expected,
            actor=ACTOR,
            reason=REASON,
        )


def seed(db, q=None, f=None):
    """Store and activate a release, load it into the draft and move the ID sequences past it."""
    release = store(db, q=q, f=f)
    sequence = scalar(db.reader, "SELECT publication_sequence FROM content.active_publication")
    publish(db, release, expected=sequence)
    with db.editor.begin() as connection:
        reset_draft(connection, release.release_id)
    with db.migrator.begin() as connection:
        advance_ids(connection, 0)
    return release


STATE_TABLES = (
    "active_publication", "releases", "operations", "audit_events", "publication_events",
    "draft_subjects", "draft_topics", "draft_quizzes", "draft_questions",
    "draft_decks", "draft_flashcards", "draft_changes", "draft_state",
)


def content_state(db):
    return {
        table: scalar(
            db.backup,
            f"SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM content.{table} t",
        )
        for table in STATE_TABLES
    }


def scalar(engine, statement, parameters=None):
    with engine.connect() as connection:
        return connection.execute(text(statement), parameters or {}).scalar_one()


def owner_execute(db, statement, parameters=None):
    with db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        connection.execute(text(statement), parameters or {})


def test_migration_upgrade_repeat_and_role_boundary(db):
    assert migration_head() == "0012_unique_names"
    upgrade(db.migrator)
    assert scalar(db.reader, "SELECT version_num FROM content.schema_version") == migration_head()
    assert scalar(db.reader, "SELECT count(*) FROM content.published_releases") == 0
    for engine in (db.reader, db.backup, db.operator):
        for sql in (
            "CREATE TABLE content.forbidden(id int)",
            "SET ROLE meducation_owner",
            "UPDATE content.draft_state SET published_change_id=2",
        ):
            with pytest.raises(SQLAlchemyError), engine.begin() as connection:
                connection.exec_driver_sql(sql)
    for sql in (
        "SELECT * FROM content.draft_state",
        "SELECT * FROM content.releases",
        "SELECT * FROM content.audit_events",
        "SELECT content.claim_operation(NULL,NULL,NULL,NULL,NULL)",
    ):
        with pytest.raises(SQLAlchemyError), db.reader.connect() as connection:
            connection.exec_driver_sql(sql)
    assert scalar(db.backup, "SELECT count(*) FROM content.draft_state") == 1
    with pytest.raises(RuntimeError, match="unsupported"), db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        config = migration_config()
        config.attributes["connection"] = connection
        command.downgrade(config, "base")
    assert scalar(db.reader, "SELECT version_num FROM content.schema_version") == "0012_unique_names"


def test_release_omission_order_and_digest(db):
    release = store(db)
    qt, ft = artifacts()
    assert release.quiz_revision == "sha256-" + hashlib.sha256(qt.encode()).hexdigest()
    registry = [
        json.dumps(json.loads(qt)[key], ensure_ascii=False, separators=(",", ":"))
        for key in ("subjects", "topics")
    ]
    payload = "\n".join(["flashcards-v3", *registry, ft])
    assert release.flashcard_revision == "sha256-" + hashlib.sha256(payload.encode()).hexdigest()
    with db.backup.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT stem, choices, answer, metadata, pearls FROM content.questions WHERE release_id=:id"
            ),
            {"id": release.release_id},
        ).one()
        question = json.loads(qt)["questions"][0]
        assert rows == (
            question["stem"],
            question["choices"],
            question["answer"],
            question["metadata"],
            [],
        )
        assert connection.execute(
            text("SELECT rationale_meta IS NULL FROM content.questions WHERE release_id=:id"),
            {"id": release.release_id},
        ).scalar_one()
    assert scalar(db.reader, "SELECT count(*) FROM content.published_questions") == 1
    assert (
        scalar(
            db.reader,
            "SELECT count(*) FROM content.active_publication WHERE release_id IS NOT NULL",
        )
        == 0
    )


def test_import_replay_duplicate_pair_and_conflicting_operation(db):
    operation = uuid4()
    first = store(db, operation)
    assert store(db, operation) == first
    assert store(db) == first
    assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 1
    assert scalar(db.operator, "SELECT count(*) FROM content.import_events") == 2
    assert scalar(db.operator, "SELECT count(*) FROM content.publication_events") == 0
    q, f = banks()
    q["questions"][0]["stem"] += "Changed"
    with pytest.raises(ContentDatabaseError):
        store(db, operation, q, f)
    assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 1


def test_transaction_failure_preserves_active_and_rolls_back_new_release(db):
    first = store(db)
    active = publish(db, first)
    q, f = banks()
    q["subjects"].append({"id": "s500", "name": "Disposable", "accent": "#123456"})
    qt, ft = artifacts(q, f)
    with pytest.raises(RuntimeError, match="injected"), db.operator.begin() as connection:
        store_release(
            connection,
            operation_id=uuid4(),
            quiz_text=qt,
            flashcard_text=ft,
            source_hashes={"quiz": "a" * 64, "flashcard": "b" * 64},
            actor=ACTOR,
            reason=REASON,
        )
        raise RuntimeError("injected failure before commit")
    assert (
        scalar(db.reader, "SELECT publication_sequence FROM content.active_publication")
        == active.publication_sequence
    )
    assert scalar(db.operator, "SELECT count(*) FROM content.subjects WHERE id='s500'") == 0
    assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 1


def test_immutable_release_rows_and_append_only_history(db):
    release = store(db)
    publish(db, release)
    for table in (
        "releases",
        "subjects",
        "topics",
        "quizzes",
        "questions",
        "decks",
        "flashcards",
        "audit_events",
        "import_events",
        "publication_events",
        "operations",
    ):
        with pytest.raises(SQLAlchemyError):
            owner_execute(db, "DELETE FROM content." + table)
    for statement in (
        "UPDATE content.questions SET stem='Changed'",
        "UPDATE content.releases SET quiz_revision=quiz_revision",
        "UPDATE content.audit_events SET reason='Changed'",
        "UPDATE content.publication_events SET prior_sequence=1",
    ):
        with pytest.raises(SQLAlchemyError):
            owner_execute(db, statement)


def test_cross_release_foreign_key_and_global_ordinal_constraints(db):
    first = store(db)
    q, f = banks()
    q["subjects"][0]["id"] = "s2"
    q["topics"][0]["subjectId"] = "s2"
    second = store(db, q=q, f=f)
    # Disable only immutability inside a transaction rolled back on the FK/ordinal failure.
    with pytest.raises(SQLAlchemyError), db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        connection.exec_driver_sql("ALTER TABLE content.topics DISABLE TRIGGER topic_guard")
        connection.execute(
            text("UPDATE content.topics SET subject_id='s1' WHERE release_id=:id"),
            {"id": second.release_id},
        )
    with pytest.raises(SQLAlchemyError), db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        connection.exec_driver_sql("ALTER TABLE content.subjects DISABLE TRIGGER subject_guard")
        connection.execute(
            text(
                "INSERT INTO content.subjects(release_id,id,position,name,accent) VALUES(:id,'s99',0,'Test','#123456')"
            ),
            {"id": first.release_id},
        )


def test_building_release_and_incomplete_operation_cannot_commit(db):
    op = uuid4()
    with pytest.raises(SQLAlchemyError), db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        connection.execute(
            text(
                "INSERT INTO content.operations VALUES(:op,'fixture',:fingerprint,'operator','fixture','{}',clock_timestamp())"
            ),
            {"op": op, "fingerprint": "a" * 64},
        )
        connection.execute(
            text(
                "INSERT INTO content.releases(state,quiz_revision,flashcard_revision,quiz_artifact,flashcard_artifact,originating_operation_id) VALUES('building',:q,:f,'{}','{}',:op)"
            ),
            {"q": "sha256-" + "a" * 64, "f": "sha256-" + "b" * 64, "op": op},
        )
    assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 0
    with pytest.raises(SQLAlchemyError):
        owner_execute(
            db,
            "INSERT INTO content.operations(operation_id,action,fingerprint,actor,reason) VALUES(:op,'fixture',:signature,'operator','fixture')",
            {"op": uuid4(), "signature": "a" * 64},
        )


def test_activation_rollback_replay_and_stale_preconditions(db):
    first = store(db)
    op = uuid4()
    one = publish(db, first, op=op)
    q, f = banks()
    q["questions"][0]["stem"] += " changed"
    second = store(db, q=q, f=f)
    two = publish(db, second, one.publication_sequence)
    assert publish(db, first, 0, op) == one
    assert (
        scalar(db.reader, "SELECT publication_sequence FROM content.active_publication")
        == two.publication_sequence
    )
    back = publish(db, first, two.publication_sequence)
    assert back.publication_sequence > two.publication_sequence
    assert first.quiz_revision == scalar(
        db.reader,
        "SELECT quiz_revision FROM content.published_releases WHERE release_id=:id",
        {"id": first.release_id},
    )
    with pytest.raises(ContentDatabaseError):
        publish(db, second, one.publication_sequence)
    with pytest.raises(ContentDatabaseError), db.operator.begin() as connection:
        activate_release(
            connection,
            operation_id=uuid4(),
            release_id=uuid4(),
            expected_sequence=back.publication_sequence,
            actor=ACTOR,
            reason=REASON,
        )


def test_concurrent_duplicate_stores_share_one_release(db):
    gate = Barrier(4)

    def concurrent_import():
        gate.wait()
        return store(db)

    with ThreadPoolExecutor(max_workers=4) as executor:
        releases = list(executor.map(lambda _: concurrent_import(), range(4)))
    assert len({r.release_id for r in releases}) == 1


def test_competing_publications_only_one_precondition_wins(db):
    release = store(db)
    gate = Barrier(4)

    def activate():
        gate.wait()
        try:
            return publish(db, release)
        except ContentDatabaseError:
            return None

    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _: activate(), range(4)))
    assert sum(r is not None for r in results) == 1
    assert scalar(db.operator, "SELECT count(*) FROM content.publication_events") == 1


def test_database_function_accepts_validated_pair(db):
    qt, ft = artifacts()
    with db.operator.begin() as connection:
        try:
            result = connection.execute(
                text(
                    "SELECT content.store_release(:op,:q,:f,CAST(:hashes AS jsonb),:actor,:reason)"
                ),
                {
                    "op": uuid4(),
                    "q": qt,
                    "f": ft,
                    "hashes": json.dumps({"quiz": "a" * 64, "flashcard": "b" * 64}),
                    "actor": ACTOR,
                    "reason": REASON,
                },
            ).scalar_one()
        except SQLAlchemyError as error:
            # This suite uses synthetic data; retain the fixed function diagnostic, never SQL/parameters.
            raise AssertionError(error.orig.diag.message_primary) from None
        assert result["quiz_revision"].startswith("sha256-")


@pytest.mark.parametrize(
    "mutate",
    [
        "null",
        "wrong-version",
        "duplicate-id",
        "broken-deck",
        "blank-tabs",
        "blank-unicode",
        "blank-control",
    ],
)
def test_release_constraints_reject_invalid_pairs_without_events(db, mutate):
    q, f = banks()
    if mutate == "null":
        q["questions"][0]["metadata"] = None
    elif mutate == "wrong-version":
        q["schemaVersion"] = 5.0
    elif mutate == "duplicate-id":
        q["subjects"].append(copy.deepcopy(q["subjects"][0]))
    elif mutate.startswith("blank-"):
        q["questions"][0]["stem"] = {
            "blank-tabs": " \t\r\n",
            "blank-unicode": "\u00a0\u2003\u3000",
            "blank-control": "\x1c\x1d\x1e\x1f",
        }[mutate]
    else:
        f["decks"][0]["topicId"] = "t999"
    qt, ft = [json.dumps(value, ensure_ascii=False, indent=2) + "\n" for value in (q, f)]
    with pytest.raises(SQLAlchemyError), db.operator.begin() as connection:
        connection.execute(
            text("SELECT content.store_release(:op,:q,:f,CAST(:hashes AS jsonb),:actor,:reason)"),
            {
                "op": uuid4(),
                "q": qt,
                "f": ft,
                "hashes": json.dumps({"quiz": "a" * 64, "flashcard": "b" * 64}),
                "actor": ACTOR,
                "reason": REASON,
            },
        )
    assert scalar(db.operator, "SELECT count(*) FROM content.operations") == 0
    assert scalar(db.operator, "SELECT count(*) FROM content.audit_events") == 0


def test_sql_boundary_rejects_duplicate_keys_and_noncanonical_artifacts(db):
    qt, ft = artifacts()
    for raw in [
        qt.replace('"schemaVersion": 6', '"schemaVersion": 6, "schemaVersion": 6', 1),
        json.dumps(json.loads(qt)),
    ]:
        with pytest.raises(SQLAlchemyError), db.operator.begin() as connection:
            connection.execute(
                text(
                    "SELECT content.store_release(:op,:q,:f,CAST(:hashes AS jsonb),:actor,:reason)"
                ),
                {
                    "op": uuid4(),
                    "q": raw,
                    "f": ft,
                    "hashes": json.dumps({"quiz": "a" * 64, "flashcard": "b" * 64}),
                    "actor": ACTOR,
                    "reason": REASON,
                },
            )
    assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 0


def test_runtime_schema_ready_requires_explicit_activation_and_disposes(db):
    from meducation_api.db.runtime import PostgresRuntime
    from meducation_api.settings import Settings

    settings = Settings(
        _env_file=None,
        content_source="postgres",
        database_environment="local",
        database_url=db.reader.url.render_as_string(hide_password=False),
    )
    with pytest.raises(ContentDatabaseError), PostgresRuntime(settings):
        pytest.fail("Schema without active release cannot initialize")
    publish(db, store(db))
    with PostgresRuntime(settings) as runtime:
        assert runtime.engine.pool.checkedout() == 0
    assert runtime.engine.pool.checkedout() == 0
    assert runtime.engine.pool.checkedin() == 0


def test_global_order_independent_of_parent_and_object_key_order(db):
    q, f = banks()
    q["subjects"].insert(0, {"accent": "#112233", "name": "Second subject", "id": "s2"})
    q["topics"].insert(0, {"name": "Second topic", "subjectId": "s2", "id": "t2"})
    q["quizzes"].insert(0, {"name": "Second quiz", "topicId": "t2", "id": "q2"})
    q["questions"].append({**copy.deepcopy(q["questions"][0]), "id": "i2", "quizId": "q2"})
    f["decks"].insert(0, {"id": "d2", "topicId": "t2", "name": "Second deck"})
    f["cards"].append({"id": "f2", "deckId": "d2", "front": "Second", "back": "Answer"})
    release = store(db, q=q, f=f)
    with db.reader.connect() as connection:
        for table, expected in [
            ("subjects", ["s2", "s1"]),
            ("topics", ["t2", "t1"]),
            ("quizzes", ["q2", "q1"]),
            ("questions", ["i1", "i2"]),
            ("decks", ["d2", "dlegacy-X"]),
            ("flashcards", ["flegacy-X", "f2"]),
        ]:
            actual = (
                connection.execute(
                    text(
                        "SELECT id FROM content.published_"
                        + table
                        + " WHERE release_id=:id ORDER BY position"
                    ),
                    {"id": release.release_id},
                )
                .scalars()
                .all()
            )
            assert actual == expected
    qt, ft = artifacts(q, f)
    subjects = [
        {key: s[key] for key in ("id", "name", "accent", "description") if key in s}
        for s in q["subjects"]
    ]
    topics = [
        {key: t[key] for key in ("id", "subjectId", "name", "description") if key in t}
        for t in q["topics"]
    ]
    registry = [json.dumps(v, ensure_ascii=False, separators=(",", ":")) for v in (subjects, topics)]
    assert (
        release.flashcard_revision
        == "sha256-"
        + hashlib.sha256("\n".join(["flashcards-v3", *registry, ft]).encode()).hexdigest()
    )
    assert release.quiz_revision == "sha256-" + hashlib.sha256(qt.encode()).hexdigest()


def test_store_and_activation_failure_roll_back_as_one_transaction(db):
    first = store(db)
    publish(db, first)
    q, f = banks()
    q["questions"][0]["stem"] += " changed"
    qt, ft = artifacts(q, f)
    with pytest.raises(ContentDatabaseError), db.operator.begin() as connection:
        second = store_release(
            connection,
            operation_id=uuid4(),
            quiz_text=qt,
            flashcard_text=ft,
            source_hashes={"quiz": "a" * 64, "flashcard": "b" * 64},
            actor=ACTOR,
            reason=REASON,
        )
        activate_release(
            connection,
            operation_id=uuid4(),
            release_id=second.release_id,
            expected_sequence=0,
            actor=ACTOR,
            reason=REASON,
        )
    assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 1
    assert scalar(db.operator, "SELECT count(*) FROM content.operations") == 2
    assert scalar(db.operator, "SELECT count(*) FROM content.audit_events") == 2
    assert (
        scalar(db.reader, "SELECT release_id FROM content.active_publication") == first.release_id
    )


def test_other_transaction_cannot_extend_uncommitted_or_finalized_release(db):
    from threading import Event

    ready = Event()
    finish = Event()
    target = {}
    qt, ft = artifacts()

    def constructing():
        with db.operator.begin() as connection:
            release = store_release(
                connection,
                operation_id=uuid4(),
                quiz_text=qt,
                flashcard_text=ft,
                source_hashes={"quiz": "a" * 64, "flashcard": "b" * 64},
                actor=ACTOR,
                reason=REASON,
            )
            target["id"] = release.release_id
            ready.set()
            assert finish.wait(10), "Concurrent write probe did not finish"
        return release

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(constructing)
        try:
            assert ready.wait(10)
            with pytest.raises(SQLAlchemyError):
                owner_execute(
                    db,
                    "INSERT INTO content.subjects(release_id,id,position,name,accent) VALUES(:id,'s1',9,'Unauthorized','#123456')",
                    {"id": target["id"]},
                )
        finally:
            finish.set()
        release = future.result()
    with pytest.raises(SQLAlchemyError):
        owner_execute(
            db,
            "INSERT INTO content.subjects(release_id,id,position,name,accent) VALUES(:id,'s1',9,'Unauthorized','#123456')",
            {"id": release.release_id},
        )
    assert scalar(db.reader, "SELECT count(*) FROM content.published_subjects") == 1


def test_export_roundtrips_stored_artifacts_and_refuses_overwrite(db, tmp_path):
    from meducation_api.db.transfer import export_release

    q, f = banks()
    q["subjects"][0] = dict(reversed(list(q["subjects"][0].items())))
    q["subjects"].append({"id": "s2", "name": "Other subject", "accent": "#fff"})
    q["topics"].append({"id": "t2", "subjectId": "s2", "name": "Other topic"})
    q["quizzes"].insert(0, {"id": "q2", "topicId": "t2", "name": "First catalog quiz"})
    second = copy.deepcopy(q["questions"][0])
    second.update({"id": "i2", "quizId": "q2"})
    q["questions"].append(second)
    q["questions"][0]["stem"] = 'Unicode β **bold** $x^2$\nEscaped "quote" and \\ slash'
    f["decks"].append({"id": "dempty", "topicId": q["topics"][0]["id"], "name": "Empty"})
    f["decks"].reverse()
    qt, ft = artifacts(q, f)
    release = store(db, q=q, f=f)
    publication = publish(db, release)
    output = tmp_path / "export"
    manifest = export_release(db.operator, release.release_id, output)
    assert (output / "questionBank.json").read_text() == qt
    assert (output / "flashcardBank.json").read_text() == ft
    assert manifest["revisions"] == {
        "quiz": release.quiz_revision,
        "flashcard": release.flashcard_revision,
    }
    assert manifest["publication"]["observedActiveSequence"] == publication.publication_sequence
    assert manifest["publication"]["selectedReleaseSequences"] == [publication.publication_sequence]
    assert json.loads((output / "manifest.json").read_text()) == manifest
    with pytest.raises(ContentDatabaseError):
        export_release(db.operator, release.release_id, output)
    assert (output / "questionBank.json").read_text() == qt


def test_export_rejects_owner_corruption_without_repair_or_files(db, tmp_path):
    from meducation_api.db.transfer import export_release, reconstruct_release

    release = store(db)
    with db.admin.begin() as connection:
        connection.exec_driver_sql("ALTER TABLE content.questions DISABLE TRIGGER question_guard")
        connection.execute(
            text("UPDATE content.questions SET stem='corrupt fixture' WHERE release_id=:id"),
            {"id": release.release_id},
        )
        with pytest.raises(ContentDatabaseError, match="value differs"):
            reconstruct_release(connection, release.release_id)
        assert (
            connection.execute(
                text("SELECT stem FROM content.questions WHERE release_id=:id"),
                {"id": release.release_id},
            ).scalar_one()
            == "corrupt fixture"
        )
        connection.rollback()
    with pytest.raises(ContentDatabaseError):
        export_release(db.operator, uuid4(), tmp_path / "unknown")
    assert not (tmp_path / "unknown").exists()


def test_cli_activate_export_and_stale_replay(db, tmp_path):
    import subprocess
    import sys

    release = str(store(db).release_id)
    env = {k: v for k, v in os.environ.items() if not k.startswith("MEDUCATION_")}
    env.update(
        {
            "PYTHONPATH": str(ROOT / "backend/src"),
            "MEDUCATION_DATABASE_ENVIRONMENT": "local",
            "MEDUCATION_OPERATOR_DATABASE_URL": db.operator.url.render_as_string(
                hide_password=False
            ),
        }
    )

    def invoke(*args):
        return subprocess.run(
            [sys.executable, "-m", "meducation_api.db.cli", *map(str, args)],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )

    def activation(op, sequence=0):
        return (
            "activate",
            "--release-id",
            release,
            "--expected-sequence",
            sequence,
            "--operation-id",
            op,
            "--actor",
            ACTOR,
            "--reason",
            REASON,
        )

    op = uuid4()
    activated = invoke(*activation(op))
    assert activated.returncode == 0, activated.stderr
    assert invoke(*activation(op)).stdout == activated.stdout
    stale = invoke(*activation(uuid4()))
    assert stale.returncode == 1 and "SQL" not in stale.stdout
    assert db.operator.url.password not in stale.stderr + stale.stdout
    output = tmp_path / "cli-export"
    assert invoke("export-release", "--release-id", release, "--output", output).returncode == 0
    assert invoke("export-release", "--release-id", release, "--output", output).returncode == 1


def test_export_write_failure_cleans_only_new_output(db, tmp_path, monkeypatch):
    from meducation_api.db.transfer import export_release

    release = store(db)
    output = tmp_path / "failed-export"
    unrelated = tmp_path / "keep.json"
    unrelated.write_text("keep")
    original_open = Path.open

    def fail_manifest(path, *args, **kwargs):
        if path == output / "manifest.json":
            raise OSError("Injected disk failure")
        return original_open(path, *args, **kwargs)

    monkeypatch.setattr(Path, "open", fail_manifest)
    with pytest.raises(ContentDatabaseError):
        export_release(db.operator, release.release_id, output)
    assert not output.exists()
    assert unrelated.read_text() == "keep"
    assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 1


def reader_settings(db):
    from meducation_api.settings import Settings

    return Settings(
        _env_file=None,
        content_source="postgres",
        database_environment="local",
        database_url=db.reader.url.render_as_string(hide_password=False),
    )


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/subjects",
        "/api/v1/subjects/s1/quizzes",
        "/api/v1/quizzes/q1",
        "/api/v1/quizzes/q1/questions",
        "/api/v1/flashcards/subjects",
        "/api/v1/flashcards/subjects/s1/catalog",
        "/api/v1/flashcards/decks/dlegacy-X/cards",
    ],
)
def test_postgres_learner_routes_match_protocol_and_release_connections(db, tmp_path, path):
    from fastapi.testclient import TestClient

    from meducation_api.main import create_app

    q, f = banks()
    f["decks"].append({"id": "dempty", "topicId": "t1", "name": "Empty"})
    for key in ("subjects", "topics", "quizzes"):
        q[key][0]["description"] = "Short text"
    release = store(db, q=q, f=f)
    publish(db, release)
    from fixture_content import fixture_app
    reference_app = fixture_app(q, f)
    pg_app = create_app(reader_settings(db))
    with TestClient(reference_app) as expected, TestClient(pg_app) as actual:
        source = pg_app.state.source
        reference = expected.get(path)
        result = actual.get(path)
        assert result.status_code == reference.status_code == 200
        assert result.json() == reference.json()
        assert ("Short text" in result.text) == (not path.endswith(("questions", "cards")))
        assert result.headers["etag"] == reference.headers["etag"]
        assert result.headers["cache-control"] == "no-cache"
        assert source.runtime.engine.pool.checkedout() == 0
        for headers in (
            {"If-None-Match": result.headers["etag"]},
            {"If-Match": '"wrong"'},
            {"If-Match": result.headers["etag"]},
        ):
            got, wanted = actual.get(path, headers=headers), expected.get(path, headers=headers)
            assert got.status_code == wanted.status_code
            assert got.content == wanted.content or got.json() == wanted.json()
            assert source.runtime.engine.pool.checkedout() == 0
        assert actual.get(path + "?revision=wrong").status_code == 409
        assert source.runtime.engine.pool.checkedout() == 0
        assert (
            actual.get(
                path, headers={"If-Match": "wrong", "If-None-Match": result.headers["etag"]}
            ).status_code
            == 409
        )
        for missing in (
            "/api/v1/subjects/unknown/quizzes",
            "/api/v1/quizzes/unknown",
            "/api/v1/quizzes/unknown/questions",
            "/api/v1/flashcards/subjects/unknown/catalog",
            "/api/v1/flashcards/decks/unknown/cards",
        ):
            got = actual.get(missing + "?revision=wrong")
            assert got.status_code == 404
            assert got.json() == expected.get(missing + "?revision=wrong").json()
            assert source.runtime.engine.pool.checkedout() == 0
        assert actual.get("/api/v1/flashcards/decks/dempty/cards").json()["cards"] == []
    assert source.runtime.engine.pool.checkedout() == source.runtime.engine.pool.checkedin() == 0
    assert pg_app.state.source is None


def test_postgres_repository_protocols_and_unknown_parents(db, tmp_path):
    from fixture_content import FixtureFlashcardRepository, FixtureQuestionRepository

    from meducation_api.repositories.postgres import PostgresContentSource

    q, f = banks()
    release = store(db)
    publish(db, release)
    reference = FixtureQuestionRepository(q)
    flashcards = FixtureFlashcardRepository(f, reference)
    with PostgresContentSource(reader_settings(db)) as source, source.view() as view:
        bank = view.questions
        cards = view.flashcards
        assert bank.revision == reference.revision and cards.revision == flashcards.revision
        assert bank.list_subjects() == reference.list_subjects()
        for subject in ("s1", "unknown"):
            assert bank.has_subject(subject) == reference.has_subject(subject)
            assert bank.subject_quiz_summary(subject) == reference.subject_quiz_summary(subject)
            assert bank.list_quizzes(subject) == reference.list_quizzes(subject)
            assert cards.has_subject(subject) == flashcards.has_subject(subject)
            assert cards.list_catalog(subject) == flashcards.list_catalog(subject)
        for quiz in ("q1", "unknown"):
            assert bank.get_quiz(quiz) == reference.get_quiz(quiz)
            assert bank.list_question_ids(quiz) == reference.list_question_ids(quiz)
            assert bank.list_questions(quiz) == reference.list_questions(quiz)
        assert cards.list_subjects() == flashcards.list_subjects()
        for deck in ("dlegacy-X", "unknown"):
            assert cards.has_deck(deck) == flashcards.has_deck(deck)
            assert cards.list_cards(deck) == flashcards.list_cards(deck)


def test_publication_during_api_body_build_keeps_one_release(db, monkeypatch):
    from fastapi.testclient import TestClient

    from meducation_api.main import create_app
    from meducation_api.repositories.postgres import PostgresQuestionBankRepository

    old = store(db)
    first = publish(db, old)
    q, f = banks()
    q["subjects"][0]["name"] = "Changed subject"
    q["questions"][0]["stem"] = "New stem"
    new = store(db, q=q, f=f)
    original = PostgresQuestionBankRepository.get_quiz
    switched = False

    def interleave(self, quiz_id):
        nonlocal switched
        found = original(self, quiz_id)
        if not switched:
            publish(db, new, expected=first.publication_sequence)
            switched = True
        return found

    monkeypatch.setattr(PostgresQuestionBankRepository, "get_quiz", interleave)
    app = create_app(reader_settings(db))
    with TestClient(app) as client:
        body = client.get("/api/v1/quizzes/q1/questions").json()
        assert body["revision"] == old.quiz_revision
        assert body["questions"][0]["stem"] != "New stem"
        assert (
            client.get("/api/v1/quizzes/q1/questions").json()["questions"][0]["stem"] == "New stem"
        )
        assert client.get("/api/v1/subjects").json()["subjects"][0]["name"] == "Changed subject"
        assert (
            client.get("/api/v1/flashcards/subjects").json()["revision"] == new.flashcard_revision
        )
        assert new.flashcard_revision != old.flashcard_revision
        assert app.state.source.runtime.engine.pool.checkedout() == 0


def test_release_cache_bounded_eviction_and_reactivation_preserve_inflight_view(db):
    from meducation_api.repositories.postgres import PostgresContentSource

    old = store(db)
    pub = publish(db, old)
    with PostgresContentSource(reader_settings(db)) as source, source.view() as pinned:
        for name in ("Second", "Third", "Fourth"):
            q, f = banks()
            q["subjects"][0]["name"] = name
            f["cards"][0]["front"] = name
            release = store(db, q=q, f=f)
            pub = publish(db, release, expected=pub.publication_sequence)
            with source.view() as fresh:
                assert fresh.release_id == release.release_id
                assert fresh.flashcards.list_cards("dlegacy-X")[0].front == name
                changed = fresh.questions.list_subjects()
                changed[0].name = "mutated returned copy"
                assert fresh.questions.list_subjects()[0].name == name
            assert len(source._catalogs) <= 2
        assert pinned.release_id == old.release_id
        assert pinned.questions.revision == old.quiz_revision
        assert pinned.flashcards.list_cards("dlegacy-X")[0].front != "Fourth"
        rollback = publish(db, old, expected=pub.publication_sequence)
        with source.view() as refreshed:
            assert refreshed.release_id == old.release_id
            assert refreshed.publication_sequence == rollback.publication_sequence
            assert refreshed.questions.revision == old.quiz_revision
            assert refreshed.flashcards.revision == old.flashcard_revision
            assert refreshed.questions.list_subjects()[0].name != "Fourth"


def test_database_outage_returns_unavailable_even_on_cached_conditional_requests(db):
    from fastapi.testclient import TestClient
    from sqlalchemy import event

    from meducation_api.main import create_app

    release = store(db)
    publish(db, release)
    app = create_app(reader_settings(db))
    with TestClient(app) as client:
        response = client.get("/api/v1/subjects")
        etag = response.headers["etag"]
        engine = app.state.source.runtime.engine
        observed = []

        def fail_query(connection, cursor, statement, parameters, context, many):
            observed.append(statement)
            raise SQLAlchemyError("secret SQL and credential fixture")

        event.listen(engine, "before_cursor_execute", fail_query)
        try:
            assert client.get("/health/live").status_code == 200
            assert client.get("/health/ready").status_code == 200
            assert observed == []
            for path in (
                "/api/v1/subjects",
                "/api/v1/flashcards/subjects",
                "/api/v1/quizzes/q1/questions",
            ):
                result = client.get(path, headers={"If-None-Match": etag})
                assert result.status_code == 503
                assert result.json() == {"detail": {"code": "content_unavailable"}}
                assert "secret" not in result.text and engine.pool.checkedout() == 0
        finally:
            event.remove(engine, "before_cursor_execute", fail_query)
        assert client.get("/api/v1/subjects", headers={"If-None-Match": etag}).status_code == 304


@pytest.mark.parametrize("failure", ["catalog", "body", "connect"])
def test_reader_failure_cleanup_before_and_after_view_yield(db, failure):
    from fastapi.testclient import TestClient
    from sqlalchemy import event
    from sqlalchemy.exc import OperationalError

    from meducation_api.main import create_app

    release = store(db)
    publish(db, release)
    app = create_app(reader_settings(db))
    with TestClient(app) as client:
        engine = app.state.source.runtime.engine
        if failure != "catalog":
            assert client.get("/api/v1/quizzes/q1/questions").status_code == 200
        if failure == "connect":
            engine.dispose()

            def fail_connect(*args):
                raise OperationalError(
                    "private connection SQL", {}, Exception("private credential")
                )

            listener, event_name = fail_connect, "do_connect"
        else:

            def fail_statement(connection, cursor, statement, params, context, many):
                target = "published_subjects" if failure == "catalog" else "published_questions"
                if "SELECT * FROM content." + target in statement:
                    raise SQLAlchemyError("private body/catalog SQL")

            listener, event_name = fail_statement, "before_cursor_execute"
        event.listen(engine, event_name, listener)
        try:
            result = client.get("/api/v1/quizzes/q1/questions")
            assert result.status_code == 503 and result.json() == {
                "detail": {"code": "content_unavailable"}
            }
            assert "private" not in result.text and engine.pool.checkedout() == 0
        finally:
            event.remove(engine, event_name, listener)
        assert client.get("/api/v1/quizzes/q1/questions").status_code == 200
        assert engine.pool.checkedout() == 0


@pytest.mark.parametrize("fault", ["terminated", "aborted-transaction"])
def test_real_reader_socket_and_transaction_failure_return_503_then_recover(db, monkeypatch, fault):
    from fastapi.testclient import TestClient

    from meducation_api.main import create_app
    from meducation_api.repositories.postgres import PostgresQuestionBankRepository

    release = store(db)
    publish(db, release)
    original = PostgresQuestionBankRepository.list_questions
    fired = False

    def fail_once(self, quiz_id):
        nonlocal fired
        if not fired:
            fired = True
            if fault == "terminated":
                pid = self.connection.exec_driver_sql("SELECT pg_backend_pid()").scalar_one()
                with db.admin.begin() as connection:
                    connection.execute(text("SELECT pg_terminate_backend(:pid)"), {"pid": pid})
            else:
                self.connection.exec_driver_sql("SELECT 1/0")
        return original(self, quiz_id)

    monkeypatch.setattr(PostgresQuestionBankRepository, "list_questions", fail_once)
    app = create_app(reader_settings(db))
    with TestClient(app) as client:
        result = client.get("/api/v1/quizzes/q1/questions")
        assert result.status_code == 503 and result.json() == {
            "detail": {"code": "content_unavailable"}
        }
        assert app.state.source.runtime.engine.pool.checkedout() == 0
        assert client.get("/api/v1/quizzes/q1/questions").status_code == 200
        assert app.state.source.runtime.engine.pool.checkedout() == 0


def auth_app(db, harness=None, *, postgres=False, **changes):
    from types import SimpleNamespace

    from fastapi.testclient import TestClient
    from test_auth import Harness, config

    from meducation_api.auth.store import SessionStore
    from meducation_api.main import create_app
    from meducation_api.settings import Settings

    cfg = config(
        session_database_url=db.session.url.render_as_string(hide_password=False),
        editor_database_url=db.editor.url.render_as_string(hide_password=False),
        **changes,
    )
    h = harness or Harness(cfg)
    runtime = SimpleNamespace(
        config=cfg,
        store=SessionStore(db.session, cfg, clock=lambda: h.now),
        oidc=h.client,
        close=lambda: None,
    )
    settings = Settings(
        _env_file=None,
        database_environment="local",
        content_source="postgres",
        database_url=db.reader.url.render_as_string(hide_password=False),
    )
    from fixture_content import FixtureContentSource
    app = create_app(settings, auth_settings=cfg, auth_factory=lambda _: runtime, source_factory=None if postgres else lambda _: FixtureContentSource(json.loads((ROOT / "e2e/fixtures/bank.json").read_text()), json.loads((ROOT / "e2e/fixtures/flashcard-bank.json").read_text())))
    return TestClient(app, base_url=cfg.origin, follow_redirects=False), runtime, h


def auth_login(client, runtime, h, *, stepup=False):
    from urllib.parse import parse_qs, urlsplit

    csrf = client.get("/api/admin/session").json()["csrfToken"]
    path = "/api/admin/auth/reauthenticate" if stepup else "/api/admin/auth/login"
    response = client.post(
        path, json={}, headers={"Origin": runtime.config.origin, "X-CSRF-Token": csrf}
    )
    assert response.status_code == 200, response.text
    fields = parse_qs(urlsplit(response.json()["authorizationUrl"]).query)
    h.nonce = fields["nonce"][0]
    h.code = "disposable-single-use-code"
    row = scalar(
        runtime.store.engine,
        "SELECT ciphertext FROM admin_auth.logins WHERE NOT consumed ORDER BY expires DESC LIMIT 1",
    )
    h.verifier = json.loads(runtime.store.cipher.decrypt(row.encode()))["verifier"]
    return client.get(
        "/api/admin/auth/callback", params={"state": fields["state"][0], "code": h.code}
    ), fields


def test_auth_role_isolation_and_cookie_login_logout(db):
    client, runtime, h = auth_app(db)
    with client:
        assert client.get("/api/admin/access").status_code == 401
        result, fields = auth_login(client, runtime, h)
        assert result.status_code == 303, result.text
        cookie = result.headers["set-cookie"]
        assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/" in cookie
        assert "Domain=" not in cookie and "__Host-" not in cookie
        assert result.headers["location"] == runtime.config.origin + "/admin.html"
        assert result.headers["cache-control"] == "no-store"
        assert client.get("/api/admin/access").status_code == 200
        assert (
            client.get(
                "/api/admin/auth/callback", params={"state": fields["state"][0], "code": "replay"}
            ).status_code
            == 401
        )
        assert (
            client.get("/api/admin/access").status_code == 200
        )  # callback failure retains valid session
        info = client.get("/api/admin/session").json()
        assert info["authenticated"]
        assert (
            client.post(
                "/api/admin/auth/logout", json={}, headers={"Origin": runtime.config.origin}
            ).status_code
            == 403
        )
        cookie_value = client.cookies.get(runtime.config.cookie)
        response = client.post(
            "/api/admin/auth/logout",
            json={},
            headers={"Origin": runtime.config.origin, "X-CSRF-Token": info["csrfToken"]},
        )
        assert response.status_code == 200
        assert (
            client.get(
                "/api/admin/access", headers={"Cookie": runtime.config.cookie + "=" + cookie_value}
            ).status_code
            == 401
        )
        assert (
            client.get(
                "/api/v1/subjects", headers={"Cookie": runtime.config.cookie + "=malicious"}
            ).status_code
            == 200
        )
    for engine in (db.reader, db.operator, db.editor):
        with pytest.raises(SQLAlchemyError), engine.connect() as c:
            c.execute(text("SELECT * FROM admin_auth.sessions"))
    for engine in (db.session, db.editor):
        for statement in (
            "SET ROLE meducation_owner",
            "INSERT INTO content.subjects(release_id,id,position,name,accent) VALUES(gen_random_uuid(),'s9',0,'x','#fff')",
            "SELECT content.store_release(NULL,NULL,NULL,NULL,NULL,NULL)",
            "UPDATE content.draft_changes SET actor='bypass'",
        ):
            with pytest.raises(SQLAlchemyError), engine.begin() as c:
                c.execute(text(statement))
    assert scalar(db.backup, "SELECT count(*) FROM admin_auth.sessions") == 1


PRIVATE_ROUTES = [
    ("GET", "/draft"),
    ("GET", "/draft/changes"),
    ("POST", "/draft/changes/1/revert"),
    ("POST", "/draft/discard"),
    ("POST", "/draft/publish"),
    ("POST", "/draft/subjects"),
    ("PUT", "/draft/questions/i1"),
    ("DELETE", "/draft/decks/d1"),
    ("POST", "/draft/cards/f1/move"),
    ("POST", "/draft/quizzes/q1/questions/bulk"),
    ("POST", "/draft/decks/d1/cards/bulk"),
    ("GET", "/releases"),
    ("POST", "/releases/any/activate"),
    ("POST", "/exports"),
]


def private_request(client, method, path, headers=None):
    if method == "GET":
        return client.get("/api/admin" + path, headers=headers)
    return client.request(method, "/api/admin" + path, json={}, headers=headers)


@pytest.mark.parametrize(("method", "path"), PRIVATE_ROUTES)
def test_every_private_operation_is_guarded_before_lookup(db, method, path):
    client, runtime, _h = auth_app(db)
    with client:
        response = private_request(client, method, path, {"Origin": runtime.config.origin})
        assert response.status_code == 401
        assert response.headers["cache-control"] == "no-store"
        assert "draft" not in response.text


@pytest.mark.parametrize(
    "fault", ["origin", "sibling", "csrf", "content-type", "host", "oversize", "duplicate", "encoding", "nonascii"]
)
def test_auth_http_transport_denies_bad_browser_requests(db, fault):
    client, runtime, _h = auth_app(db)
    with client:
        csrf = client.get("/api/admin/session").json()["csrfToken"]
        headers = {
            "Origin": runtime.config.origin,
            "X-CSRF-Token": csrf,
            "Content-Type": "application/json",
        }
        body = "{}"
        if fault == "origin":
            del headers["Origin"]
        elif fault == "sibling":
            headers["Origin"] = "http://localhost:4173"
        elif fault == "csrf":
            headers["X-CSRF-Token"] = "forged"
        elif fault == "content-type":
            headers["Content-Type"] = "text/plain"
        elif fault == "host":
            headers["Host"] = "evil.example"
        elif fault == "nonascii":
            headers["X-CSRF-Token"]=b"\xff"
        elif fault == "encoding":
            headers["Content-Encoding"]="gzip"
        elif fault == "oversize":
            body = " " * 8193
        elif fault == "duplicate":
            body = '{"x":1,"x":2}'
        result = client.post("/api/admin/auth/login", content=body, headers=headers)
        assert result.status_code in (400, 403, 413, 415)
        assert scalar(db.session, "SELECT count(*) FROM admin_auth.logins") == 0
        assert result.headers["x-frame-options"] == "DENY"
        assert result.headers["content-security-policy"].startswith("default-src 'none'")
        assert "access-control-allow-origin" not in result.headers


def test_auth_expiry_epoch_wrong_editor_and_session_store_outage(db):
    from meducation_api.auth.oidc import AuthError

    client, runtime, h = auth_app(db)
    with client:
        result, _ = auth_login(client, runtime, h)
        assert result.status_code == 303
        token = client.cookies.get(runtime.config.cookie)
        for changes in ({"epoch": "different-external-epoch"}, {"editor_subject": "other-editor"}):
            _alternate, other, _ = auth_app(db, **changes)
            with pytest.raises(AuthError), other.store.guard(token):
                pytest.fail("Old session granted access")
        h.now += 901
        csrf = client.get("/api/admin/session").json()["csrfToken"]
        assert (
            client.post(
                "/api/admin/draft/publish",
                json={},
                headers={"Origin": runtime.config.origin, "X-CSRF-Token": csrf},
            ).status_code
            == 403
        )
        # Session bootstrap is polling; it must not extend idle lifetime.
        h.now += 900
        assert not client.get("/api/admin/session").json()["authenticated"]
        h.now -= 1801
        token2, _ = runtime.store.issue(h.client.verify(h.token(), nonce=h.nonce))
        h.now += 28801
        with pytest.raises(AuthError), runtime.store.guard(token2):
            pytest.fail("Absolute expiry bypass")
        h.now -= 28801
        owner_execute(db, "REVOKE USAGE ON SCHEMA admin_auth FROM meducation_session")
        result = client.get(
            "/api/admin/session", headers={"Cookie": runtime.config.cookie + "=" + token2}
        )
        assert result.status_code == 503
        assert "admin_auth" not in result.text
        assert client.get("/api/v1/subjects").status_code == 200


def test_auth_rotation_cancelled_stepup_and_logout_prevents_reissue(db):
    from meducation_api.auth.oidc import AuthError

    client, runtime, h = auth_app(db)
    with client:
        result, _ = auth_login(client, runtime, h)
        assert result.status_code == 303
        old = client.cookies.get(runtime.config.cookie)
        old_csrf = client.get("/api/admin/session").json()["csrfToken"]
        h.now += 6
        result, _ = auth_login(client, runtime, h, stepup=True)
        assert result.status_code == 303
        new = client.cookies.get(runtime.config.cookie)
        assert new != old
        assert client.get("/api/admin/session").json()["csrfToken"] != old_csrf
        with pytest.raises(AuthError), runtime.store.guard(old):
            pytest.fail("Rotated cookie remained active")
        h.now += 6
        h.token_changes = {"sub": "other-editor"}
        result, _ = auth_login(client, runtime, h, stepup=True)
        assert result.status_code == 403
        assert client.get("/api/admin/access").status_code == 200
        identity = h.client.verify(h.token(), nonce=h.nonce)
        with runtime.store.guard(new, interactive=False) as principal:
            runtime.store.revoke(principal)
        with pytest.raises(AuthError):
            runtime.store.issue(identity, previous=hashlib.sha256(new.encode()).hexdigest())
        assert scalar(db.session, "SELECT count(*) FROM admin_auth.sessions WHERE NOT revoked") == 0
        live, _ = runtime.store.issue(identity)
        runtime.store.begin_login("b"*43)
        h.fail=True  # Emergency revoke must not contact the provider.
        runtime.store.revoke_all()
        assert scalar(db.session,"SELECT count(*) FROM admin_auth.logins")==0
        with pytest.raises(AuthError), runtime.store.guard(live):
            pytest.fail("Emergency revocation did not persist")


def test_session_lock_serializes_protected_work_and_logout_across_workers(db):
    from threading import Event

    from meducation_api.auth.oidc import AuthError
    from meducation_api.auth.store import SessionStore

    store(db)
    _, runtime, h = auth_app(db)
    token, _ = runtime.store.issue(h.client.verify(h.token(), nonce=h.nonce))
    other = SessionStore(db.session, runtime.config, clock=lambda: h.now)
    entered = Event()
    release = Event()
    revoked = Event()

    def protected():
        with runtime.store.guard(token) as p:
            p.connection.execute(text("SELECT token_hash FROM admin_auth.sessions WHERE token_hash=:h FOR NO KEY UPDATE"),{"h":p.token_hash})
            entered.set()
            assert release.wait(5)
            # Commit a representative protected content write before releasing auth lock.
            with db.editor.begin() as c:
                c.execute(
                    text(
                        "INSERT INTO content.draft_subjects(id,position,name,accent) "
                        "VALUES('s900',900,'Locked write','#123456')"
                    )
                )

    def logout():
        assert entered.wait(5)
        with other.guard(token) as p:
            other.revoke(p)
        revoked.set()

    with ThreadPoolExecutor(2) as pool:
        work = pool.submit(protected)
        out = pool.submit(logout)
        assert entered.wait(5)
        assert not revoked.wait(0.1)
        release.set()
        work.result(timeout=5)
        out.result(timeout=5)
    assert scalar(db.operator, "SELECT count(*) FROM content.draft_subjects WHERE id='s900'") == 1
    with pytest.raises(AuthError), runtime.store.guard(token):
        pytest.fail("Revoked session accepted")


def test_loopback_oidc_flow_exchanges_real_http_code_pkce_and_stepup(db):
    """A disposable synthetic issuer exercises sockets/redirects, not real MFA."""
    import base64
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from threading import Thread
    from urllib.parse import parse_qs, urlencode, urlsplit

    import httpx2

    from meducation_api.auth.oidc import OIDCClient

    _client,runtime,h=auth_app(db)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):
            pass  # Never log synthetic codes either.
        def do_GET(self):
            if urlsplit(self.path).path=='/authorize':
                fields=parse_qs(urlsplit(self.path).query)
                assert fields['response_type']==['code'] and fields['code_challenge_method']==['S256']
                assert fields['redirect_uri']==[runtime.config.callback] and fields['scope']==['openid']
                h.nonce=fields['nonce'][0]; h.code='once-only-loopback-code'; self.server.challenge=fields['code_challenge'][0]
                self.send_response(302); self.send_header('Location',runtime.config.callback+'?'+urlencode({'code':h.code,'state':fields['state'][0]})); self.end_headers()
            else:
                result=h.request(httpx2.Request('GET',runtime.config.issuer+self.path))
                self.send_response(result.status_code); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(result.content)
        def do_POST(self):
            data=self.rfile.read(int(self.headers['Content-Length']))
            verifier=parse_qs(data.decode())['code_verifier'][0]
            assert base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')==self.server.challenge
            h.verifier=verifier
            result=h.request(httpx2.Request('POST',runtime.config.token_endpoint,content=data,headers={'Authorization':self.headers['Authorization']}))
            self.send_response(result.status_code); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(result.content)
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    thread=Thread(target=server.serve_forever,daemon=True); thread.start()
    issuer='http://127.0.0.1:'+str(server.server_address[1])
    cfg=runtime.config.model_copy(update={'issuer':issuer,'authorization_endpoint':issuer+'/authorize','token_endpoint':issuer+'/token','jwks_uri':issuer+'/jwks'})
    # Rebuild the app with the same private DB and a real (non-mocked) client.
    actual,rt,h=auth_app(db,issuer=issuer,authorization_endpoint=cfg.authorization_endpoint,token_endpoint=cfg.token_endpoint,jwks_uri=cfg.jwks_uri)
    rt.oidc=OIDCClient(rt.config,clock=lambda:h.now)
    runtime=rt
    try:
        with actual,httpx2.Client(follow_redirects=False,trust_env=False) as browser:
            old=None
            for path in ('/api/admin/auth/login','/api/admin/auth/reauthenticate'):
                csrf=actual.get('/api/admin/session').json()['csrfToken']
                login=actual.post(path,json={},headers={'Origin':rt.config.origin,'X-CSRF-Token':csrf})
                assert login.status_code==200
                authorize=browser.get(login.json()['authorizationUrl'])
                assert authorize.status_code==302
                result=actual.get(authorize.headers['Location'])
                assert result.status_code==303,result.text
                token=actual.cookies.get(rt.config.cookie); assert token and token!=old; old=token
                assert actual.get('/api/admin/access').status_code==200
                h.now+=6
    finally:
        rt.oidc.close(); server.shutdown(); server.server_close(); thread.join(timeout=2)


@pytest.mark.parametrize('fault',['browser','state','duplicate','expired','cancel','missing-mfa','wrong-issuer','wrong-purpose'])
def test_login_callback_faults_create_no_session(db,fault):
    from urllib.parse import parse_qs, urlsplit
    client,runtime,h=auth_app(db)
    with client:
        csrf=client.get('/api/admin/session').json()['csrfToken']
        login=client.post('/api/admin/auth/login',json={},headers={'Origin':runtime.config.origin,'X-CSRF-Token':csrf})
        fields=parse_qs(urlsplit(login.json()['authorizationUrl']).query)
        h.nonce=fields['nonce'][0]; h.code='disposable-code'
        h.verifier=json.loads(runtime.store.cipher.decrypt(scalar(db.session,'SELECT ciphertext FROM admin_auth.logins').encode()))['verifier']
        params=[('state',fields['state'][0]),('code',h.code)]
        if fault=='browser': client.cookies.clear()
        elif fault=='state': params[0]=('state','x'*43)
        elif fault=='duplicate': params.append(params[0])
        elif fault=='expired': h.now+=601
        elif fault=='cancel': params=[('state',fields['state'][0]),('error','access_denied')]
        elif fault=='missing-mfa': h.token_changes={'amr':['pwd']}
        elif fault=='wrong-issuer': h.token_changes={'iss':'http://untrusted.invalid'}
        elif fault=='wrong-purpose': h.token_changes={'token_use':'logout'}
        result=client.get('/api/admin/auth/callback',params=params)
        assert result.status_code in (303,400,401,403)
        assert scalar(db.session,'SELECT count(*) FROM admin_auth.sessions')==0
        assert client.get('/api/admin/access').status_code==401
        assert 'disposable-code' not in result.text
        assert result.headers['cache-control']=='no-store'


def test_auth_login_rate_limit_and_no_header_identity_bypass(db):
    client,runtime,h=auth_app(db)
    with client:
        csrf=client.get('/api/admin/session').json()['csrfToken']
        for _ in range(6):
            response=client.post('/api/admin/auth/login',json={},headers={'Origin':runtime.config.origin,'X-CSRF-Token':csrf})
            assert response.status_code==200
        response=client.post('/api/admin/auth/login',json={},headers={'Origin':runtime.config.origin,'X-CSRF-Token':csrf})
        assert response.status_code==429
        assert scalar(db.session,'SELECT count(*) FROM admin_auth.logins')==6
        assert client.get('/api/admin/access',headers={'Authorization':'Bearer '+h.token(),'X-Editor-Subject':runtime.config.editor_subject}).status_code==401
        assert client.get('/api/v1/subjects').status_code==200


def test_all_private_paths_reject_revoked_expired_wrong_editor_and_old_epoch(db):
    client,runtime,h=auth_app(db)
    before=content_state(db)
    with client:
        identity=h.client.verify(h.token(),nonce=h.nonce)
        for field,value in [('revoked',True),('epoch','restored-old-epoch'),('subject','wrong-editor'),('last_activity',h.now-1801),('expires',h.now-1)]:
            token,csrf=runtime.store.issue(identity)
            with db.session.begin() as c:
                c.execute(text(f'UPDATE admin_auth.sessions SET {field}=:v WHERE token_hash=:h'),{'v':value,'h':hashlib.sha256(token.encode()).hexdigest()})
            for method,path in PRIVATE_ROUTES:
                headers={'Cookie':runtime.config.cookie+'='+token,'Origin':runtime.config.origin,'X-CSRF-Token':csrf}
                response=private_request(client,method,path,headers)
                assert response.status_code==401,(field,path,response.text)
                assert response.headers['cache-control']=='no-store'
        assert content_state(db)==before


def editor_post(client,path,value):
    csrf=client.get('/api/admin/session').json()['csrfToken']
    return client.post('/api/admin'+path,json=value,headers={'Origin':str(client.base_url).rstrip('/'),'X-CSRF-Token':csrf})


def test_recovery_invalidates_restored_sessions_and_pending_callbacks_without_content_loss(db):
    from meducation_api.db.recovery import invalidate_restored_sessions

    seed(db)
    client, runtime, h = auth_app(db)
    with client:
        login, _ = auth_login(client, runtime, h)
        assert login.status_code == 303
        pending = runtime.store.begin_login('recovery-browser')
        before = content_state(db)
        with db.migrator.begin() as connection:
            result = invalidate_restored_sessions(connection)
        assert result == {'revokedSessions': 1, 'clearedLoginTransactions': 1}
        assert client.get('/api/admin/draft').status_code == 401
        from meducation_api.auth.oidc import AuthError
        with pytest.raises(AuthError):
            runtime.store.consume(pending['state'], 'recovery-browser')
        assert content_state(db) == before
        with db.migrator.begin() as connection:
            assert invalidate_restored_sessions(connection) == {
                'revokedSessions': 0, 'clearedLoginTransactions': 0,
            }
        for engine in (db.editor, db.session, db.operator, db.reader):
            with pytest.raises(SQLAlchemyError), engine.begin() as connection:
                invalidate_restored_sessions(connection)


def test_recovery_reapplied_acl_preserves_editor_and_session_role_boundaries(db):
    from meducation_api.db.recovery import restore_content_permissions

    seed(db)
    owner_execute(db, 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA content FROM meducation_editor')
    owner_execute(db, 'REVOKE ALL ON ALL TABLES IN SCHEMA content FROM meducation_editor')
    owner_execute(db, 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA content FROM meducation_editor')
    owner_execute(db, 'REVOKE ALL ON ALL TABLES IN SCHEMA admin_auth FROM meducation_session')
    with db.migrator.begin() as connection:
        restore_content_permissions(connection)
    client, runtime, h = auth_app(db)
    with client:
        login, _ = auth_login(client, runtime, h)
        assert login.status_code == 303
        assert client.get('/api/admin/draft').status_code == 200
    for engine in (db.editor, db.reader, db.operator):
        with pytest.raises(SQLAlchemyError), engine.connect() as connection:
            connection.execute(text('SELECT * FROM admin_auth.sessions'))
    for engine in (db.editor, db.session, db.backup, db.reader):
        with pytest.raises(SQLAlchemyError), engine.begin() as connection:
            connection.execute(text("UPDATE content.draft_changes SET actor='bypass'"))
    assert scalar(db.backup, 'SELECT count(*) FROM admin_auth.sessions') == 1


@pytest.mark.parametrize('target', ['draft', 'release'])
def test_recovery_tools_check_real_deterministic_http_exports(db, tmp_path, target):
    import io
    import zipfile

    from meducation_api.db.export_tools import inspect_export

    original = seed(db)
    client, runtime, h = auth_app(db)
    with client:
        login, _ = auth_login(client, runtime, h)
        assert login.status_code == 303
        snapshot = client.get('/api/admin/draft').json()
        value = {'target': target}
        if target == 'release':
            value['releaseId'] = str(original.release_id)
        response = editor_post(client, '/exports', value)
        assert response.status_code == 200
        assert response.content == editor_post(client, '/exports', value).content
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            archive.extractall(tmp_path)
        report = inspect_export(tmp_path, repository=ROOT, audit=True)
        assert report['context']['target'] == target
        assert report['context']['unpublished'] is (target == 'draft')
        assert report['explanations']['questions'] == len(snapshot['questions'])
        serialized = json.dumps(report)
        assert runtime.config.epoch not in serialized
        assert runtime.config.client_secret.get_secret_value() not in serialized


@pytest.mark.parametrize('role', ['reader', 'session', 'editor'])
def test_l5_stale_idle_pool_connection_is_repaired_before_work(db, role):
    from sqlalchemy import event
    engine = create_database_engine(getattr(db, role).url)
    opened = []
    event.listen(engine, 'connect', lambda *_: opened.append(True))
    try:
        with engine.connect() as connection:
            old = connection.exec_driver_sql('SELECT pg_backend_pid()').scalar_one()
        with db.admin.begin() as connection:
            assert connection.execute(text('SELECT pg_terminate_backend(:pid)'), {'pid': old}).scalar_one()
        with engine.connect() as connection:
            assert connection.exec_driver_sql('SELECT 1').scalar_one() == 1
        assert len(opened) == 2
        assert engine.pool.checkedout() == 0
    finally:
        engine.dispose()


def test_l5_reader_lock_timeout_returns_safe_error_and_leaves_pool_clean(db, caplog):
    from fastapi.testclient import TestClient

    from meducation_api.main import create_app
    from meducation_api.repositories.postgres import PostgresQuestionBankRepository
    release = store(db)
    publish(db, release)
    app = create_app(reader_settings(db))
    with TestClient(app) as client:
        assert client.get('/api/v1/quizzes/q1/questions').status_code == 200
        engine = app.state.source.runtime.engine
        with app.state.source.view() as view:
            assert isinstance(view.questions, PostgresQuestionBankRepository)
            c = view.questions.connection
            assert c.exec_driver_sql('SHOW statement_timeout').scalar_one() == '10s'
            assert c.exec_driver_sql('SHOW lock_timeout').scalar_one() == '3s'
        with db.admin.begin() as held:
            held.exec_driver_sql('LOCK TABLE content.questions IN ACCESS EXCLUSIVE MODE')
            result = client.get('/api/v1/quizzes/q1/questions')
            assert result.status_code == 503
            assert result.json() == {'detail': {'code': 'content_unavailable'}}
            assert l5_events(caplog)[-1]['failure_category'] == 'sql_timeout'
            assert engine.pool.checkedout() == 0
        assert client.get('/api/v1/quizzes/q1/questions').status_code == 200
        assert 'reader' in l5_events(caplog)[-1]['recovered_dependencies']
        assert engine.pool.checkedout() == 0


def test_l5_database_stop_start_keeps_health_query_free_and_recovers_reader(db):
    import subprocess
    import sys

    from fastapi.testclient import TestClient
    from sqlalchemy import event

    from meducation_api.main import create_app
    container = os.environ.get('MEDUCATION_TEST_RESTART_CONTAINER')
    if not container:
        pytest.skip('Run the isolated launcher with --restartable --keyword l5')
    def control(action):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/containers/control-resilience-fixture.py'),
                                 '--container', container, '--port', str(db.admin.url.port),
                                 '--action', action], capture_output=True, text=True, timeout=60, check=False)
        assert result.returncode == 0, 'Owned fixture control failed'
    release = store(db)
    publish(db, release)
    app = create_app(reader_settings(db))
    with TestClient(app) as client:
        first = client.get('/api/v1/quizzes/q1/questions')
        assert first.status_code == 200
        engine = app.state.source.runtime.engine
        checkouts = []
        event.listen(engine, 'checkout', lambda *_: checkouts.append(True))
        try:
            control('stop')
            assert client.get('/health/live').status_code == 200
            assert client.get('/health/ready').status_code == 200
            assert checkouts == []
            unavailable = client.get('/api/v1/quizzes/q1/questions')
            assert unavailable.status_code == 503
            assert unavailable.json() == {'detail': {'code': 'content_unavailable'}}
            assert engine.pool.checkedout() == 0
        finally:
            control('start')
        recovered = client.get('/api/v1/quizzes/q1/questions')
        assert recovered.status_code == 200
        assert recovered.json() == first.json()
        assert recovered.headers['etag'] == first.headers['etag']
        assert engine.pool.checkedout() == 0


def test_l5_independent_sources_observe_other_bank_publication_and_a_b_a(db):
    from meducation_api.repositories.postgres import PostgresContentSource

    old = store(db)
    first = publish(db, old)
    q, f = banks()
    f['cards'][0]['front'] = 'L5 only flashcards changed'
    changed = store(db, q=q, f=f)
    assert changed.quiz_revision == old.quiz_revision
    assert changed.flashcard_revision != old.flashcard_revision
    with (PostgresContentSource(reader_settings(db)) as one,
          PostgresContentSource(reader_settings(db)) as two):
        for source in (one, two):
            with source.view() as view:
                assert view.release_id == old.release_id
        second = publish(db, changed, expected=first.publication_sequence)
        for source in (one, two):
            with source.view() as view:
                assert view.release_id == changed.release_id
                assert view.publication_sequence == second.publication_sequence
                assert view.questions.revision == old.quiz_revision
                assert view.flashcards.list_cards('dlegacy-X')[0].front == 'L5 only flashcards changed'
        third = publish(db, old, expected=second.publication_sequence)
        for source in (one, two):
            with source.view() as view:
                assert view.release_id == old.release_id
                assert view.publication_sequence == third.publication_sequence
                assert view.flashcards.revision == old.flashcard_revision
            assert source.runtime.engine.pool.checkedout() == 0


@pytest.mark.parametrize('bank', ['quiz', 'flashcard'])
def test_l5_launch_http_sql_counts_include_pre_ping_and_sql_free_health(db, monkeypatch, bank):
    from fastapi.testclient import TestClient
    from sqlalchemy import event

    from meducation_api.main import create_app

    release = store(db)
    publish(db, release)
    app = create_app(reader_settings(db))
    with TestClient(app) as client:
        engine = app.state.source.runtime.engine
        counts = {'sql': 0, 'pointer': 0, 'ping': 0}

        def statement(_connection, _cursor, sql, *_args):
            counts['sql'] += 1
            counts['pointer'] += int('FROM content.active_publication' in sql)

        ping = engine.dialect.do_ping

        def counted_ping(connection):
            counts['ping'] += 1
            return ping(connection)

        event.listen(engine, 'before_cursor_execute', statement)
        monkeypatch.setattr(engine.dialect, 'do_ping', counted_ping)
        app.state.source._catalogs.clear()
        if bank == 'quiz':
            subjects = '/api/v1/subjects'
            membership = '/api/v1/subjects/s1/quizzes'
            body = '/api/v1/quizzes/q1/questions'
            revision = release.quiz_revision
        else:
            subjects = '/api/v1/flashcards/subjects'
            membership = '/api/v1/flashcards/subjects/s1/catalog'
            body = '/api/v1/flashcards/decks/dlegacy-X/cards'
            revision = release.flashcard_revision
        # Startup catalog, selected membership, launch check, uncached body.
        for path in (subjects, membership + '?revision=' + revision, subjects,
                     body + '?revision=' + revision):
            assert client.get(path).status_code == 200
        assert counts == {'sql': 19 if bank == 'quiz' else 20, 'pointer': 4, 'ping': 4}
        counts.update(sql=0, pointer=0, ping=0)
        # A fully cached browser launch sends only the fresh subjects check.
        assert client.get(subjects).status_code == 200
        assert counts == {'sql': 3, 'pointer': 1, 'ping': 1}
        counts.update(sql=0, pointer=0, ping=0)
        assert client.get('/health/live').status_code == 200
        assert client.get('/health/ready').status_code == 200
        assert counts == {'sql': 0, 'pointer': 0, 'ping': 0}
        assert engine.pool.checkedout() == 0


def l5_bounded_session(runtime, db):
    # auth_app normally uses an unpooled test role. Exercise the real worker pool.
    engine = create_database_engine(db.session.url)
    runtime.store.engine = engine
    return engine


def l5_events(caplog):
    return [json.loads(r.getMessage()) for r in caplog.records if r.name == 'meducation.operations']


def test_l5_diagnostics_guard_readonly_concurrency_and_pool_cleanup(db):
    from sqlalchemy import event

    seed(db)
    client, runtime, h = auth_app(db, postgres=True)
    session_engine = l5_bounded_session(runtime, db)
    try:
        with client:
            assert client.post('/api/admin/diagnostics', json={}, headers={'Origin': runtime.config.origin}).status_code == 401
            auth_login(client, runtime, h)
            csrf = client.get('/api/admin/session').json()['csrfToken']
            for headers in ({'Origin': 'http://elsewhere.invalid', 'X-CSRF-Token': csrf}, {'Origin': runtime.config.origin, 'X-CSRF-Token': 'wrong'}):
                denied = client.post('/api/admin/diagnostics', json={}, headers=headers)
                assert denied.status_code == 403
                assert denied.headers['cache-control'] == 'no-store'
                assert 'dependencies' not in denied.json()
            assert editor_post(client, '/diagnostics', {'extra': 'secret authored body'}).status_code == 400
            engines = [session_engine, client.app.state.source.runtime.engine, client.app.state.editor_engine]
            sql, session_checkouts = [], []
            for engine in engines:
                event.listen(engine, 'before_cursor_execute', lambda _c, _cur, statement, *_: sql.append(statement))
            event.listen(session_engine, 'checkout', lambda *_: session_checkouts.append(True))
            barrier = Barrier(2)
            def synchronize(*_):
                barrier.wait(timeout=10)
            event.listen(engines[2], 'checkout', synchronize)
            def run(_):
                return client.post('/api/admin/diagnostics', json={}, headers={'Origin': runtime.config.origin, 'X-CSRF-Token': csrf})
            try:
                with ThreadPoolExecutor(max_workers=2) as executor:
                    responses = list(executor.map(run, range(2)))
            finally:
                event.remove(engines[2], 'checkout', synchronize)
            assert all(r.status_code == 200 for r in responses)
            assert responses[0].json() == {'dependencies': {'reader': {'connectivity': 'ok', 'schema': 'ok', 'publication': 'ok'}, 'session': 'ok', 'editor': 'ok'}}
            assert len(session_checkouts) == 2  # no activity write or nested checkout
            assert all(statement.lstrip().split()[0].upper() in {'SET', 'SELECT', 'SHOW'} for statement in sql)
            assert all(engine.pool.checkedout() == 0 for engine in engines)
            assert all(engine.pool.size() == 2 for engine in engines)
    finally:
        session_engine.dispose()


@pytest.mark.parametrize('role', ['reader', 'session', 'editor'])
@pytest.mark.parametrize('fault', ['pool_timeout', 'connection_failure'])
def test_l5_diagnostic_dependency_failure_events_redaction_and_recovery(db, caplog, role, fault):
    from sqlalchemy import event
    from sqlalchemy.exc import OperationalError

    seed(db)
    client, runtime, h = auth_app(db, postgres=True)
    session_engine = l5_bounded_session(runtime, db)
    canary = 'L5-private-password-cookie-code-authored-text'
    try:
        with client:
            auth_login(client, runtime, h)
            csrf = client.get('/api/admin/session').json()['csrfToken']
            engine = {'reader': client.app.state.source.runtime.engine, 'session': session_engine, 'editor': client.app.state.editor_engine}[role]
            def fail(*_):
                raise OperationalError(canary, {'token': canary}, RuntimeError(canary), connection_invalidated=True)
            held = []
            try:
                if fault == 'pool_timeout':
                    engine.pool._timeout = 0.05
                    held = [engine.connect(), engine.connect()]
                else:
                    event.listen(engine, 'checkout', fail)
                response = client.post('/api/admin/diagnostics?code='+canary, json={}, headers={'Origin': runtime.config.origin, 'X-CSRF-Token': csrf, 'X-Request-ID': canary})
                assert response.status_code == 503
                if role == 'session':
                    assert response.json()['error']['code'] == 'session_unavailable'
                    assert 'dependencies' not in response.json()
                else:
                    outcome = response.json()['dependencies'][role]
                    assert outcome == 'unavailable' if role == 'editor' else outcome['connectivity'] == 'unavailable'
                event_record = l5_events(caplog)[-1]
                assert event_record['request_id'] == response.headers['x-request-id']
                assert event_record['dependencies'][role] == fault
                assert event_record['failure_category'] == fault
                assert canary not in json.dumps(l5_events(caplog)) + response.text
                if role in ('reader', 'editor'):
                    path = '/api/v1/subjects' if role == 'reader' else '/api/admin/draft'
                    ordinary = client.get(path)
                    assert ordinary.status_code == 503
                    assert l5_events(caplog)[-1]['dependencies'][role] == fault
                    assert canary not in json.dumps(l5_events(caplog)) + ordinary.text
            finally:
                for connection in held:
                    connection.close()
                if fault == 'connection_failure':
                    event.remove(engine, 'checkout', fail)
            assert client.post('/api/admin/diagnostics', json={}, headers={'Origin': runtime.config.origin, 'X-CSRF-Token': csrf}).status_code == 200
            assert role in l5_events(caplog)[-1]['recovered_dependencies']
            assert engine.pool.checkedout() == 0
    finally:
        session_engine.dispose()


def test_l5_diagnostics_reject_schema_and_missing_publication_without_mutating(db, monkeypatch):
    from meducation_api.admin import diagnostics

    release = store(db)
    # Boot initialized with a release; then change fixture state only.
    publish(db, release)
    client, runtime, h = auth_app(db, postgres=True)
    with client:
        auth_login(client, runtime, h)
        with monkeypatch.context() as patch:
            patch.setattr(diagnostics, 'migration_head', lambda: 'unsupported-test-head')
            result = editor_post(client, '/diagnostics', {})
            assert result.status_code == 503
            assert result.json()['dependencies']['reader'] == {'connectivity': 'ok', 'schema': 'unsupported', 'publication': 'not_checked'}
        with db.admin.begin() as c:
            c.exec_driver_sql('UPDATE content.active_publication SET release_id=NULL, publication_sequence=0')
        result = editor_post(client, '/diagnostics', {})
        assert result.status_code == 503
        assert result.json()['dependencies']['reader']['publication'] == 'missing'
        for path in ('/health/live', '/health/ready'):
            assert client.get(path).status_code == 200


def test_l5_diagnostics_actual_db_outage_keeps_auth_closed_health_sql_free_and_recovers(db, caplog):
    import subprocess
    import sys

    from sqlalchemy import event

    container = os.environ.get('MEDUCATION_TEST_RESTART_CONTAINER')
    if not container:
        pytest.skip('Dedicated --restartable --keyword l5 gate')
    seed(db)
    client, runtime, h = auth_app(db, postgres=True)
    session_engine = l5_bounded_session(runtime, db)
    def control(action):
        result = subprocess.run([sys.executable, str(ROOT/'scripts/containers/control-resilience-fixture.py'), '--container', container, '--port', str(db.admin.url.port), '--action', action], capture_output=True, timeout=60, check=False)
        assert result.returncode == 0, 'Owned fixture control failed'
    try:
        with client:
            auth_login(client, runtime, h)
            csrf = client.get('/api/admin/session').json()['csrfToken']
            headers = {'Origin': runtime.config.origin, 'X-CSRF-Token': csrf}
            assert client.post('/api/admin/diagnostics', json={}, headers=headers).status_code == 200
            engines = [session_engine, client.app.state.source.runtime.engine, client.app.state.editor_engine]
            work = []
            for engine in engines:
                event.listen(engine, 'checkout', lambda *_: work.append(True))
            try:
                control('stop')
                assert client.get('/health/live').status_code == 200
                assert client.get('/health/ready').status_code == 200
                assert not work
                failed = client.post('/api/admin/diagnostics', json={}, headers=headers)
                assert failed.status_code == 503
                assert failed.json()['error']['code'] == 'session_unavailable'
                assert l5_events(caplog)[-1]['dependencies']['session'] == 'connection_failure'
                assert all(engine.pool.checkedout() == 0 for engine in engines)
            finally:
                control('start')
            assert client.post('/api/admin/diagnostics', json={}, headers=headers).status_code == 200
            assert 'session' in l5_events(caplog)[-1]['recovered_dependencies']
            assert all(engine.pool.checkedout() == 0 for engine in engines)
    finally:
        session_engine.dispose()


def test_l5_retained_restore_requires_source_writer_retirement(db, monkeypatch):
    import importlib.util

    monkeypatch.syspath_prepend(str(ROOT / "scripts/local-authoring"))
    spec = importlib.util.spec_from_file_location(
        "retained_restore_guard", ROOT / "scripts/local-authoring/verify-backup.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    require_retired = module.require_retired_writers
    writers = ("meducation_operator", "meducation_editor", "meducation_session",
               "meducation_migrator", "meducation_owner")
    with db.admin.connect() as connection:
        database = connection.dialect.identifier_preparer.quote(connection.engine.url.database)
        original = {role: connection.execute(
            text("SELECT has_database_privilege(:role,current_database(),'CONNECT')"),
            {"role": role}).scalar_one() for role in writers}
    def grant(role, enable):
        with db.admin.begin() as connection:
            connection.exec_driver_sql(
                ("GRANT CONNECT ON DATABASE " + database + " TO " if enable
                 else "REVOKE CONNECT ON DATABASE " + database + " FROM ") + role)
    with pytest.raises(RuntimeError, match="Retire source writer"):
        require_retired(db.admin)
    try:
        # Revoking CONNECT alone does not retire an already open source writer.
        with db.operator.connect():
            for role in writers:
                grant(role, False)
            with pytest.raises(RuntimeError, match="Retire source writer"):
                require_retired(db.admin)
        require_retired(db.admin)
        # Every writer role, including inherited owner access, must stay retired.
        for role in writers:
            grant(role, True)
            with pytest.raises(RuntimeError, match="Retire source writer"):
                require_retired(db.admin)
            grant(role, False)
        # The source can still be backed up and read; neither role can author.
        with db.backup.connect(), db.reader.connect():
            require_retired(db.admin)
    finally:
        for role, enabled in original.items():
            grant(role, enabled)

    # One source may admit only one writable verification clone at a time.
    with module.source_rehearsal_lock(db.admin), pytest.raises(
        RuntimeError, match="Another retained-backup rehearsal"
    ), module.source_rehearsal_lock(db.admin):
        pass
    with module.source_rehearsal_lock(db.admin):
        pass  # The admission lock is released after normal completion.
    with pytest.raises(RuntimeError, match="fixture interruption"), module.source_rehearsal_lock(db.admin):
        raise RuntimeError("fixture interruption")
    with module.source_rehearsal_lock(db.admin):
        pass  # Interruption also releases admission.
