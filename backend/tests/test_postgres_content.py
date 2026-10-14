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
from meducation_api.db.engine import ContentDatabaseError, create_database_engine
from meducation_api.db.migrate import migration_config, migration_head, upgrade
from meducation_api.db.operations import (
    activate_release,
    paired_artifacts,
    reserve_ids,
    save_draft,
    store_release,
)

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
        "schemaVersion": 2,
        "decks": [
            {
                "id": "dlegacy-X",
                "subjectId": q["subjects"][0]["id"],
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
                "reviewNote": "Review",
            }
        ],
    }
    q["questions"][0].update(
        {
            "verifiedAnswer": "B",
            "answerNote": "",
            "metadata": {"topic": "β", "tags": []},
            "pearls": [],
            "choiceExplanations": {},
        }
    )
    return q, f


def artifacts(q=None, f=None):
    base_q, base_f = banks()
    return paired_artifacts(
        json.dumps(base_q if q is None else q, ensure_ascii=False),
        json.dumps(base_f if f is None else f, ensure_ascii=False),
    )


def store(db, op=None, q=None, f=None, reservations=()):
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
            reservations=reservations,
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


def reserve(db, op=None, counts=None, draft=0, publication=0):
    return reserve_ids(
        db.operator,
        operation_id=op or uuid4(),
        counts={"i": 2} if counts is None else counts,
        expected_draft_revision=draft,
        expected_publication_sequence=publication,
        intent="Create fixture records",
        actor=ACTOR,
        reason=REASON,
    )


def scalar(engine, statement, parameters=None):
    with engine.connect() as connection:
        return connection.execute(text(statement), parameters or {}).scalar_one()


def owner_execute(db, statement, parameters=None):
    with db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        connection.execute(text(statement), parameters or {})


def test_migration_upgrade_repeat_and_role_boundary(db):
    assert migration_head() == "0006_allocation_fence"
    upgrade(db.migrator)
    assert scalar(db.reader, "SELECT version_num FROM content.schema_version") == migration_head()
    assert scalar(db.reader, "SELECT count(*) FROM content.published_releases") == 0
    for engine in (db.reader, db.backup, db.operator):
        for sql in (
            "CREATE TABLE content.forbidden(id int)",
            "SET ROLE meducation_owner",
            "UPDATE content.draft SET revision=2",
        ):
            with pytest.raises(SQLAlchemyError), engine.begin() as connection:
                connection.exec_driver_sql(sql)
    for sql in (
        "SELECT * FROM content.draft",
        "SELECT * FROM content.releases",
        "SELECT * FROM content.audit_events",
        "SELECT * FROM content.entity_ids",
        "SELECT content.claim_operation(NULL,NULL,NULL,NULL,NULL)",
    ):
        with pytest.raises(SQLAlchemyError), db.reader.connect() as connection:
            connection.exec_driver_sql(sql)
    assert scalar(db.backup, "SELECT count(*) FROM content.draft") == 1
    with pytest.raises(RuntimeError, match="destructive"), db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        config = migration_config()
        config.attributes["connection"] = connection
        command.downgrade(config, "base")
    assert scalar(db.reader, "SELECT version_num FROM content.schema_version") == "0006_allocation_fence"


def test_release_omission_provenance_order_and_digest(db):
    release = store(db)
    qt, ft = artifacts()
    assert release.quiz_revision == "sha256-" + hashlib.sha256(qt.encode()).hexdigest()
    subjects = [
        {key: subject[key] for key in ("id", "name", "accent")}
        for subject in json.loads(qt)["subjects"]
    ]
    payload = (
        "flashcards-v2\n"
        + json.dumps(subjects, ensure_ascii=False, separators=(",", ":"))
        + "\n"
        + ft
    )
    assert release.flashcard_revision == "sha256-" + hashlib.sha256(payload.encode()).hexdigest()
    with db.backup.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT stem, choices, answer, verified_answer, answer_note, metadata, pearls FROM content.questions WHERE release_id=:id"
            ),
            {"id": release.release_id},
        ).one()
        question = json.loads(qt)["questions"][0]
        assert rows == (
            question["stem"],
            question["choices"],
            question["answer"],
            "B",
            "",
            question["metadata"],
            [],
        )
        assert connection.execute(
            text("SELECT rationale_meta IS NULL FROM content.questions WHERE release_id=:id"),
            {"id": release.release_id},
        ).scalar_one()
    assert (
        scalar(
            db.operator,
            "SELECT count(*) FROM content.entity_ids WHERE origin='imported' AND materialized",
        )
        == 5
    )
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


def test_transaction_failure_preserves_active_and_rolls_back_new_ids(db):
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
    assert scalar(db.operator, "SELECT count(*) FROM content.entity_ids WHERE id='s500'") == 0
    assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 1
    assert scalar(db.operator, "SELECT next_number FROM content.id_counters WHERE kind='s'") == 2


def test_immutable_release_rows_and_append_only_history(db):
    release = store(db)
    publish(db, release)
    reserve(db)
    for table in (
        "releases",
        "subjects",
        "quizzes",
        "questions",
        "decks",
        "flashcards",
        "audit_events",
        "import_events",
        "publication_events",
        "id_reservations",
        "entity_ids",
        "operations",
    ):
        with pytest.raises(SQLAlchemyError):
            owner_execute(db, "DELETE FROM content." + table)
    for statement in (
        "UPDATE content.questions SET stem='Changed'",
        "UPDATE content.releases SET quiz_revision=quiz_revision",
        "UPDATE content.audit_events SET reason='Changed'",
        "UPDATE content.id_counters SET next_number=1 WHERE kind='i'",
        "UPDATE content.entity_ids SET materialized=false",
        "UPDATE content.publication_events SET prior_sequence=1",
    ):
        with pytest.raises(SQLAlchemyError):
            owner_execute(db, statement)


def test_cross_release_foreign_key_and_global_ordinal_constraints(db):
    first = store(db)
    q, f = banks()
    q["subjects"][0]["id"] = "s2"
    q["quizzes"][0]["subjectId"] = "s2"
    f["decks"][0]["subjectId"] = "s2"
    second = store(db, q=q, f=f)
    # Disable only immutability inside a transaction rolled back on the FK/ordinal failure.
    with pytest.raises(SQLAlchemyError), db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        connection.exec_driver_sql("ALTER TABLE content.quizzes DISABLE TRIGGER quiz_guard")
        connection.execute(
            text("UPDATE content.quizzes SET subject_id='s1' WHERE release_id=:id"),
            {"id": second.release_id},
        )
    with pytest.raises(SQLAlchemyError), db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        connection.exec_driver_sql("ALTER TABLE content.subjects DISABLE TRIGGER subject_guard")
        connection.exec_driver_sql(
            "INSERT INTO content.entity_ids(kind,id,origin,materialized) VALUES('s','s99','imported',true)"
        )
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


def test_reservations_durable_idempotent_seeded_across_rollback(db):
    store(db)
    op = uuid4()
    assert reserve(db, op) == {"i": ["i2", "i3"]}
    assert reserve(db, op) == {"i": ["i2", "i3"]}
    with pytest.raises(ContentDatabaseError):
        reserve(db, op, {"i": 3})
    q, f = banks()
    q["questions"].append({**copy.deepcopy(q["questions"][0]), "id": "i2"})
    with pytest.raises(ContentDatabaseError):
        store(db, q=q, f=f)
    release = store(db, q=q, f=f, reservations=[op])
    published = publish(db, release)
    base = store(db)
    publish(db, base, published.publication_sequence)
    assert reserve(
        db,
        publication=scalar(
            db.reader, "SELECT publication_sequence FROM content.active_publication"
        ),
    ) == {"i": ["i4", "i5"]}


def test_failed_apply_keeps_separately_committed_reservation(db):
    store(db)
    op = uuid4()
    reserve(db, op)
    q, f = banks()
    q["questions"].append({**copy.deepcopy(q["questions"][0]), "id": "i2"})
    qt, ft = artifacts(q, f)
    with pytest.raises(RuntimeError), db.operator.begin() as connection:
        store_release(
            connection,
            operation_id=uuid4(),
            quiz_text=qt,
            flashcard_text=ft,
            source_hashes={"quiz": "a" * 64, "flashcard": "b" * 64},
            actor=ACTOR,
            reason=REASON,
            reservations=[op],
        )
        raise RuntimeError("rollback apply")
    assert (
        scalar(
            db.operator,
            "SELECT count(*) FROM content.id_reservations WHERE operation_id=:id",
            {"id": op},
        )
        == 1
    )
    assert reserve(db) == {"i": ["i4", "i5"]}
    assert scalar(db.operator, "SELECT materialized FROM content.entity_ids WHERE id='i2'") is False


def test_private_draft_save_reset_and_reserved_new_ids(db):
    release = store(db)
    publication = publish(db, release)
    qt, ft = artifacts()
    op = uuid4()
    with db.operator.begin() as connection:
        assert (
            save_draft(
                connection,
                operation_id=op,
                quiz_text=qt,
                flashcard_text=ft,
                expected_revision=0,
                base_sequence=publication.publication_sequence,
                actor=ACTOR,
                reason=REASON,
            )
            == 1
        )
        assert (
            save_draft(
                connection,
                operation_id=op,
                quiz_text=qt,
                flashcard_text=ft,
                expected_revision=0,
                base_sequence=publication.publication_sequence,
                actor=ACTOR,
                reason=REASON,
            )
            == 1
        )
    reservation = uuid4()
    ids = reserve(db, reservation, {"i": 1}, draft=1, publication=publication.publication_sequence)
    q, f = banks()
    q["questions"].append({**copy.deepcopy(q["questions"][0]), "id": ids["i"][0]})
    changed_q, changed_f = artifacts(q, f)
    with db.operator.begin() as connection:
        assert (
            save_draft(
                connection,
                operation_id=uuid4(),
                quiz_text=changed_q,
                flashcard_text=changed_f,
                expected_revision=1,
                base_sequence=publication.publication_sequence,
                actor=ACTOR,
                reason=REASON,
                reservations=[reservation],
            )
            == 2
        )
    assert scalar(db.reader, "SELECT count(*) FROM content.published_questions") == 1
    with pytest.raises(ContentDatabaseError), db.operator.begin() as connection:
        save_draft(
            connection,
            operation_id=uuid4(),
            quiz_text=qt,
            flashcard_text=ft,
            expected_revision=1,
            base_sequence=publication.publication_sequence,
            actor=ACTOR,
            reason=REASON,
        )
    with db.operator.begin() as connection:
        assert (
            save_draft(
                connection,
                operation_id=uuid4(),
                quiz_text=qt,
                flashcard_text=ft,
                expected_revision=2,
                base_sequence=publication.publication_sequence,
                actor=ACTOR,
                reason=REASON,
            )
            == 3
        )
    assert reserve(db, counts={"i": 1}, draft=3, publication=publication.publication_sequence) == {
        "i": ["i3"]
    }
    assert (
        scalar(db.operator, "SELECT count(*) FROM content.audit_events WHERE event_type='draft'")
        == 3
    )


def test_stale_reservation_context(db):
    store(db)
    op = uuid4()
    reserve(db, op, draft=99)
    q, f = banks()
    q["questions"].append({**copy.deepcopy(q["questions"][0]), "id": "i2"})
    with pytest.raises(ContentDatabaseError):
        store(db, q=q, f=f, reservations=[op])


def test_concurrent_duplicate_import_and_allocation(db):
    gate = Barrier(4)

    def concurrent_import():
        gate.wait()
        return store(db)

    with ThreadPoolExecutor(max_workers=4) as executor:
        releases = list(executor.map(lambda _: concurrent_import(), range(4)))
    assert len({r.release_id for r in releases}) == 1
    gate = Barrier(8)

    def concurrent_reserve():
        gate.wait()
        return reserve(db, counts={"i": 1})["i"][0]

    with ThreadPoolExecutor(max_workers=8) as executor:
        allocated = list(executor.map(lambda _: concurrent_reserve(), range(8)))
    assert set(allocated) == {"i" + str(n) for n in range(2, 10)}
    op = uuid4()
    gate = Barrier(4)

    def same_operation():
        gate.wait()
        return reserve(db, op, counts={"d": 1})

    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _: same_operation(), range(4)))
    assert results == [{"d": ["d1"]}] * 4


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


@pytest.mark.parametrize(
    "counts", [{}, {"x": 1}, {"i": -1}, {"i": 0}, {"i": True}, {"i": 1.5}, {"i": 10001}]
)
def test_invalid_reservation_requests_do_not_mutate(db, counts):
    with pytest.raises(ContentDatabaseError):
        reserve(db, counts=counts)
    assert scalar(db.operator, "SELECT count(*) FROM content.id_reservations") == 0
    assert scalar(db.operator, "SELECT next_number FROM content.id_counters WHERE kind='i'") == 1


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
        "unknown-field",
        "null",
        "invalid-choice",
        "wrong-version",
        "duplicate-id",
        "broken-deck",
        "blank-tabs",
        "blank-unicode",
        "blank-control",
    ],
)
def test_sql_boundary_rejects_invalid_pairs_without_events(db, mutate):
    q, f = banks()
    if mutate == "unknown-field":
        q["questions"][0]["legacyHint"] = "invalid"
    elif mutate == "null":
        q["questions"][0]["metadata"] = None
    elif mutate == "invalid-choice":
        q["questions"][0]["choices"][0]["id"] = "Z"
    elif mutate == "wrong-version":
        q["schemaVersion"] = 4.0
    elif mutate == "duplicate-id":
        q["subjects"].append(copy.deepcopy(q["subjects"][0]))
    elif mutate.startswith("blank-"):
        q["questions"][0]["stem"] = {
            "blank-tabs": " \t\r\n",
            "blank-unicode": "\u00a0\u2003\u3000",
            "blank-control": "\x1c\x1d\x1e\x1f",
        }[mutate]
    else:
        f["decks"][0]["subjectId"] = "s999"
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
        qt.replace('"schemaVersion": 4', '"schemaVersion": 4, "schemaVersion": 4', 1),
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


def test_allocation_exhaustion_and_opaque_id_preservation(db):
    q, f = banks()
    q["questions"][0]["id"] = "i9007199254740991"
    store(db, q=q, f=f)
    with pytest.raises(ContentDatabaseError):
        reserve(db, counts={"i": 1})
    assert (
        scalar(db.operator, "SELECT next_number FROM content.id_counters WHERE kind='i'")
        == 9007199254740992
    )
    assert (
        scalar(
            db.operator,
            "SELECT count(*) FROM content.entity_ids WHERE id IN ('dlegacy-X','flegacy-X')",
        )
        == 2
    )
    assert scalar(db.operator, "SELECT count(*) FROM content.id_reservations") == 0


def test_concurrent_import_and_reservation_do_not_collide(db):
    q, f = banks()
    q["subjects"][0]["id"] = "s100"
    q["quizzes"][0]["subjectId"] = "s100"
    f["decks"][0]["subjectId"] = "s100"
    gate = Barrier(2)

    def importing():
        gate.wait()
        return store(db, q=q, f=f)

    def allocating():
        gate.wait()
        return reserve(db, counts={"s": 1})

    with ThreadPoolExecutor(max_workers=2) as executor:
        future = executor.submit(importing)
        allocated = executor.submit(allocating).result()
        future.result()
    assert allocated["s"][0] in ("s1", "s101")
    assert reserve(db, counts={"s": 1})["s"][0] in ("s101", "s102")
    assert scalar(db.operator, "SELECT count(*) FROM content.entity_ids WHERE kind='s'") == 3


def test_global_order_independent_of_parent_and_object_key_order(db):
    q, f = banks()
    q["subjects"].insert(0, {"accent": "#112233", "name": "Second subject", "id": "s2"})
    q["quizzes"].insert(0, {"name": "Second quiz", "subjectId": "s2", "id": "q2"})
    q["questions"].append({**copy.deepcopy(q["questions"][0]), "id": "i2", "quizId": "q2"})
    f["decks"].insert(0, {"id": "d2", "subjectId": "s2", "name": "Second deck"})
    f["cards"].append({"id": "f2", "deckId": "d2", "front": "Second", "back": "Answer"})
    release = store(db, q=q, f=f)
    with db.reader.connect() as connection:
        for table, expected in [
            ("subjects", ["s2", "s1"]),
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
    subjects = [{key: s[key] for key in ("id", "name", "accent")} for s in q["subjects"]]
    assert (
        release.flashcard_revision
        == "sha256-"
        + hashlib.sha256(
            (
                "flashcards-v2\n"
                + json.dumps(subjects, ensure_ascii=False, separators=(",", ":"))
                + "\n"
                + ft
            ).encode()
        ).hexdigest()
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


from test_bank_contract import FIXTURES, bank_for


@pytest.mark.parametrize("case", FIXTURES["cases"], ids=lambda case: case["id"])
def test_shared_stored_contract_cases_at_sql_boundary(db, case):
    q = bank_for(case["change"])
    f = {"schemaVersion": 2, "decks": [], "cards": []}
    qt, ft = [json.dumps(v, ensure_ascii=False, indent=2) + "\n" for v in (q, f)]

    def invoke():
        with db.operator.begin() as connection:
            return connection.execute(
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

    if case["valid"]:
        assert invoke()["quiz_revision"].startswith("sha256-")
    else:
        with pytest.raises(SQLAlchemyError):
            invoke()
        assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 0


def test_file_import_export_exact_roundtrip_and_replay(db, tmp_path):
    from meducation_api.db.transfer import capture_pair, export_release, import_pair

    q, f = banks()
    q["subjects"][0] = dict(reversed(list(q["subjects"][0].items())))
    q["subjects"].append({"id": "s2", "name": "Other subject", "accent": "#fff"})
    q["quizzes"].insert(0, {"id": "q2", "subjectId": "s2", "name": "First catalog quiz"})
    second = copy.deepcopy(q["questions"][0])
    second.update({"id": "i2", "quizId": "q2"})
    q["questions"].append(second)
    q["questions"][0]["stem"] = 'Unicode β **bold** $x^2$\nEscaped "quote" and \\ slash'
    f["decks"].append({"id": "dempty", "subjectId": q["subjects"][0]["id"], "name": "Empty"})
    f["decks"].reverse()
    paths = tmp_path / "source-q.json", tmp_path / "source-f.json"
    for path, value in zip(paths, (q, f), strict=True):
        path.write_text(json.dumps(value, ensure_ascii=False))
    before = [p.read_bytes() for p in paths]
    pair = capture_pair(*paths, repository=ROOT)
    op = uuid4()
    release = import_pair(db.operator, pair, operation_id=op, actor=ACTOR, reason=REASON)
    assert import_pair(db.operator, pair, operation_id=op, actor=ACTOR, reason=REASON) == release
    assert scalar(db.operator, "SELECT count(*) FROM content.publication_events") == 0
    publication = publish(db, release)
    output = tmp_path / "export"
    manifest = export_release(db.operator, release.release_id, output)
    assert (output / "questionBank.json").read_text() == pair.quiz_artifact
    assert (output / "flashcardBank.json").read_text() == pair.flashcard_artifact
    assert manifest["revisions"] == {
        "quiz": release.quiz_revision,
        "flashcard": release.flashcard_revision,
    }
    assert manifest["publication"]["observedActiveSequence"] == publication.publication_sequence
    assert manifest["publication"]["selectedReleaseSequences"] == [publication.publication_sequence]
    assert json.loads((output / "manifest.json").read_text()) == manifest
    reimport = capture_pair(
        output / "questionBank.json", output / "flashcardBank.json", repository=ROOT
    )
    assert (
        import_pair(db.operator, reimport, operation_id=uuid4(), actor=ACTOR, reason=REASON)
        == release
    )
    assert [p.read_bytes() for p in paths] == before
    with pytest.raises(ContentDatabaseError):
        export_release(db.operator, release.release_id, output)
    assert (output / "questionBank.json").read_text() == pair.quiz_artifact


def test_captured_pair_not_reread_and_concurrent_file_import_is_idempotent(db, tmp_path):
    from meducation_api.db.transfer import capture_pair, import_pair

    q, f = banks()
    paths = tmp_path / "q.json", tmp_path / "f.json"
    for path, value in zip(paths, (q, f), strict=True):
        path.write_text(json.dumps(value))
    pair = capture_pair(*paths, repository=ROOT)
    paths[1].write_text("invalid after validation")
    with ThreadPoolExecutor(max_workers=2) as executor:
        releases = list(
            executor.map(
                lambda _: import_pair(
                    db.operator, pair, operation_id=uuid4(), actor=ACTOR, reason=REASON
                ),
                range(2),
            )
        )
    assert releases[0] == releases[1]
    assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 1
    assert scalar(db.operator, "SELECT count(*) FROM content.import_events") == 2
    assert scalar(db.operator, "SELECT count(*) FROM content.publication_events") == 0
    assert (
        scalar(db.operator, "SELECT DISTINCT flashcard_source_sha256 FROM content.import_events")
        == pair.flashcard_source_sha256
    )


def test_file_import_failure_preserves_source_and_active_state(db, tmp_path, monkeypatch):
    from meducation_api.db import transfer

    original = store(db)
    publish(db, original)
    q, f = banks()
    q["questions"][0]["stem"] = "Different fixture"
    paths = tmp_path / "q.json", tmp_path / "f.json"
    for path, value in zip(paths, (q, f), strict=True):
        path.write_text(json.dumps(value))
    pair = transfer.capture_pair(*paths, repository=ROOT)
    before = [p.read_bytes() for p in paths]
    real_store = transfer.store_release

    def fail_after_rows(*args, **kwargs):
        real_store(*args, **kwargs)
        raise RuntimeError("Injected mid-import failure")

    monkeypatch.setattr(transfer, "store_release", fail_after_rows)
    with pytest.raises(RuntimeError, match="Injected"):
        transfer.import_pair(db.operator, pair, operation_id=uuid4(), actor=ACTOR, reason=REASON)
    assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 1
    assert scalar(db.operator, "SELECT count(*) FROM content.import_events") == 1
    assert (
        scalar(db.operator, "SELECT release_id FROM content.active_publication")
        == original.release_id
    )
    assert [p.read_bytes() for p in paths] == before
    paths[1].write_text("null")
    with pytest.raises(ContentDatabaseError):
        transfer.capture_pair(*paths, repository=ROOT)
    paths[1].write_text(json.dumps(f))
    q["questions"][0]["stem"] = "<script>private()</script>"
    paths[0].write_text(json.dumps(q))
    with pytest.raises(ContentDatabaseError, match="repository content validation"):
        transfer.capture_pair(*paths, repository=ROOT)
    assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 1


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


def test_cli_validate_import_activate_export_and_stale_replay(db, tmp_path):
    import subprocess
    import sys

    q, f = banks()
    paths = tmp_path / "q.json", tmp_path / "f.json"
    for path, value in zip(paths, (q, f), strict=True):
        path.write_text(json.dumps(value))
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

    files = ("--quiz-file", paths[0], "--flashcard-file", paths[1], "--repository", ROOT)
    op = uuid4()
    intent = ("--operation-id", op, "--actor", ACTOR, "--reason", REASON)
    assert invoke("validate-pair", *files).returncode == 0
    first = invoke("import-pair", *files, *intent)
    assert first.returncode == 0, first.stderr
    replay = invoke("import-pair", *files, *intent)
    assert json.loads(replay.stdout) == json.loads(first.stdout)
    release = json.loads(first.stdout)["releaseId"]
    activation = (
        "--release-id",
        release,
        "--expected-sequence",
        0,
        "--operation-id",
        uuid4(),
        "--actor",
        ACTOR,
        "--reason",
        REASON,
    )
    activated = invoke("activate", *activation)
    assert activated.returncode == 0, activated.stderr
    assert invoke("activate", *activation).stdout == activated.stdout
    stale = invoke(
        "activate",
        "--release-id",
        release,
        "--expected-sequence",
        0,
        "--operation-id",
        uuid4(),
        "--actor",
        ACTOR,
        "--reason",
        REASON,
    )
    assert stale.returncode == 1 and "SQL" not in stale.stdout
    exported = invoke(
        "export-release", "--release-id", release, "--output", tmp_path / "cli-export"
    )
    assert exported.returncode == 0, exported.stderr
    assert (
        invoke(
            "export-release", "--release-id", release, "--output", tmp_path / "cli-export"
        ).returncode
        == 1
    )
    paths[1].write_text("null")
    failed = invoke(
        "import-pair", *files, "--operation-id", uuid4(), "--actor", ACTOR, "--reason", REASON
    )
    assert failed.returncode == 1
    assert db.operator.url.password not in failed.stderr + failed.stdout
    assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 1


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
def test_postgres_learner_routes_match_json_and_release_connections(db, tmp_path, path):
    from fastapi.testclient import TestClient

    from meducation_api.main import create_app
    from meducation_api.settings import Settings

    q, f = banks()
    f["decks"].append({"id": "dempty", "subjectId": "s1", "name": "Empty"})
    release = store(db, q=q, f=f)
    publish(db, release)
    qp, fp = tmp_path / "q.json", tmp_path / "f.json"
    qp.write_text(json.dumps(q, ensure_ascii=False))
    fp.write_text(json.dumps(f, ensure_ascii=False))
    json_app = create_app(Settings(_env_file=None, bank_path=qp, flashcard_bank_path=fp))
    pg_app = create_app(reader_settings(db))
    with TestClient(json_app) as expected, TestClient(pg_app) as actual:
        source = pg_app.state.source
        reference = expected.get(path)
        result = actual.get(path)
        assert result.status_code == reference.status_code == 200
        assert result.json() == reference.json()
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
    from meducation_api.repositories.postgres import PostgresContentSource
    from meducation_api.repositories.question_bank import (
        JsonFlashcardCatalogRepository,
        JsonQuestionBankRepository,
    )

    q, f = banks()
    release = store(db)
    publish(db, release)
    qp, fp = tmp_path / "q.json", tmp_path / "f.json"
    qp.write_text(json.dumps(q))
    fp.write_text(json.dumps(f))
    reference = JsonQuestionBankRepository(qp)
    flashcards = JsonFlashcardCatalogRepository(fp, reference.list_subjects())
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


def test_authoring_policy_rejection_preserves_draft_release_audit_and_burned_ids(db):
    """The new request policy rejects before SQL; independent reservations survive."""
    release = store(db)
    with db.operator.begin() as connection:
        publication = activate_release(connection, operation_id=uuid4(), release_id=release.release_id,
                                       expected_sequence=0, actor=ACTOR, reason=REASON)
    operation = uuid4()
    allocated = reserve_ids(db.operator, operation_id=operation, counts={"i": 1},
                            expected_draft_revision=0,
                            expected_publication_sequence=publication.publication_sequence,
                            intent="policy-failure-fixture", actor=ACTOR, reason=REASON)
    def state():
        with db.admin.connect() as connection:
            return {table: [dict(row) for row in connection.execute(text(f"SELECT * FROM content.{table}")).mappings()]
                    for table in ("draft", "active_publication", "releases", "audit_events", "operations", "id_reservations", "id_counters", "entity_ids")}
    before = state()
    q, f = banks()
    q["questions"][0]["stem"] = '<img src="/content/x" alt="x" onerror="private">'
    with pytest.raises(ContentDatabaseError, match="policy validation"), db.operator.begin() as connection:
        save_draft(connection, operation_id=uuid4(), quiz_text=json.dumps(q),
                   flashcard_text=json.dumps(f), expected_revision=0,
                   base_sequence=publication.publication_sequence,
                   actor=ACTOR, reason=REASON, reservations=[operation])
    assert state() == before
    next_ids = reserve_ids(db.operator, operation_id=uuid4(), counts={"i": 1},
                           expected_draft_revision=0,
                           expected_publication_sequence=publication.publication_sequence,
                           intent="next-policy-fixture", actor=ACTOR, reason=REASON)
    assert allocated["i"][0] != next_ids["i"][0]


def authoring_service(db, *, actor=ACTOR, validator=None):
    from meducation_api.admin.authoring import PairedAuthoringService

    original = store(db)
    current = publish(db, original)
    q, f = artifacts()
    with db.operator.begin() as connection:
        save_draft(connection, operation_id=uuid4(), quiz_text=q, flashcard_text=f,
                   expected_revision=0, base_sequence=current.publication_sequence,
                   actor=actor, reason=REASON)
    return PairedAuthoringService(db.operator, actor=actor, validator=validator), original


def authoring_state(db):
    tables = ("draft", "active_publication", "releases", "subjects", "quizzes", "questions",
              "decks", "flashcards", "audit_events", "operations", "import_events",
              "authored_events", "publication_events", "id_reservations", "id_counters", "entity_ids", "draft_control", "draft_history", "editor_slots", "editor_reservations")
    with db.admin.connect() as connection:
        return {table: connection.execute(text(f"SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM content.{table} t")).scalar_one()
                for table in tables}


def saved_pair(service):
    context = service.load()
    return {"quizzes": json.loads(context.quiz_document), "flashcards": json.loads(context.flashcard_document)}


def test_authoring_preview_save_publish_preserves_exact_pair_and_records_authored_provenance(db):
    from meducation_api.db.transfer import reconstruct_release

    service, original = authoring_service(db)
    pair = saved_pair(service)
    pair["quizzes"]["subjects"][0]["name"] = "Paired subject β"
    pair["quizzes"]["questions"][0]["stem"] = "Reviewed **stem** $x^2$"
    pair["flashcards"]["cards"][0]["back"] = "Reviewed card β"
    context = service.load()
    before = authoring_state(db)
    preview = service.preview(pair, expected_revision=context.revision,
                              expected_sequence=context.publication_sequence, reason=REASON)
    assert authoring_state(db) == before
    assert service.save(preview, operation_id=uuid4()) == context.revision + 1
    assert scalar(db.reader, "SELECT release_id FROM content.active_publication") == original.release_id
    context = service.load()
    before = authoring_state(db)
    reviewed = service.publish_preview(expected_revision=context.revision,
                                       expected_sequence=context.publication_sequence, reason=REASON)
    assert authoring_state(db) == before
    outcome = service.publish(reviewed, operation_id=uuid4())
    with db.operator.connect() as connection:
        q, f, _ = reconstruct_release(connection, outcome.release.release_id)
    assert q == reviewed.pair.quiz_artifact and f == reviewed.pair.flashcard_artifact
    assert json.loads(q)["questions"][0]["answer"] == "A"
    assert json.loads(q)["questions"][0]["verifiedAnswer"] == "B"
    assert scalar(db.operator, "SELECT count(*) FROM content.import_events") == 1
    assert scalar(db.operator, "SELECT count(*) FROM content.authored_events") == 1
    assert scalar(db.operator, "SELECT count(*) FROM content.audit_events WHERE event_type='publish'") == 1
    current = service.load()
    assert current.revision == outcome.draft_revision == context.revision + 1
    assert current.base_publication_sequence == current.publication_sequence == outcome.publication_sequence
    assert current.base_release_id == current.published_release_id == outcome.release.release_id
    assert current.quiz_document == q and current.flashcard_document == f


@pytest.mark.parametrize("action", ["preview", "save", "publish-preview", "publish"])
def test_authoring_invalid_content_rejected_without_mutation_and_reservations_stay_burned(db, action):
    from meducation_api.admin.authoring import AuthoringPreview, _binding
    from meducation_api.content_policy import ContentPolicyError, ValidatedPair

    service, _ = authoring_service(db)
    context = service.load()
    allocated = reserve(db, counts={"i": 1}, draft=context.revision, publication=context.publication_sequence)
    pair = saved_pair(service)
    pair["quizzes"]["questions"][0]["stem"] = '<img src="/content/x" alt="x" onerror="PRIVATE_SENTINEL">'
    invalid = ValidatedPair(json.dumps(pair["quizzes"], ensure_ascii=False, indent=2) + "\n",
                            json.dumps(pair["flashcards"], ensure_ascii=False, indent=2) + "\n", 1, 0)
    if action in ("publish-preview", "publish"):
        # Simulate legacy/restored structurally-valid content through the trusted SQL
        # maintenance boundary; the authored path must still validate rich policy.
        with db.operator.begin() as connection:
            connection.execute(text("SELECT content.save_draft(:op,:q,:f,:revision,:base,:actor,:reason)"),
                               {"op": uuid4(), "q": invalid.quiz_artifact, "f": invalid.flashcard_artifact,
                                "revision": context.revision, "base": context.base_publication_sequence,
                                "actor": ACTOR, "reason": "Explicit unsafe fixture, never canonical content"})
        context = service.load()
    before = authoring_state(db)
    with pytest.raises(ContentPolicyError) as caught:
        if action == "preview":
            service.preview(pair, expected_revision=context.revision, expected_sequence=context.publication_sequence, reason=REASON)
        elif action == "publish-preview":
            service.publish_preview(expected_revision=context.revision, expected_sequence=context.publication_sequence, reason=REASON)
        else:
            kind = "save" if action == "save" else "publish"
            # An internal preview object is not a validation permission. Even a
            # constructed fingerprint cannot skip the mutation's fresh validator.
            preview = AuthoringPreview(kind, context, invalid, REASON, (),
                                       _binding(kind, context, invalid, ACTOR, REASON, ()))
            getattr(service, kind)(preview, operation_id=uuid4())
    assert caught.value.status == 422
    assert "PRIVATE_SENTINEL" not in json.dumps(caught.value.response())
    assert authoring_state(db) == before
    next_ids = reserve(db, counts={"i": 1}, draft=context.revision, publication=context.publication_sequence)
    assert next_ids["i"][0] != allocated["i"][0]


def test_authored_publication_replay_identical_releases_stale_context_and_importer_reuse(db):
    from dataclasses import replace

    from meducation_api.admin.authoring import _binding

    service, original = authoring_service(db)
    context = service.load()
    preview = service.publish_preview(expected_revision=context.revision,
                                      expected_sequence=context.publication_sequence, reason=REASON)
    operation = uuid4()
    first = service.publish(preview, operation_id=operation)
    assert first.release.release_id != original.release_id
    assert first.release.quiz_revision == original.quiz_revision
    context = service.load()
    later = service.publish(service.publish_preview(expected_revision=context.revision,
                            expected_sequence=context.publication_sequence, reason=REASON), operation_id=uuid4())
    assert later.release.release_id != first.release.release_id
    assert later.release.quiz_revision == first.release.quiz_revision
    before = authoring_state(db)
    assert service.publish(preview, operation_id=operation) == first
    assert authoring_state(db) == before
    with pytest.raises(ContentDatabaseError):
        service.publish(preview, operation_id=uuid4())
    changed = replace(preview, reason="Different reason")
    changed = replace(changed, fingerprint=_binding("publish", changed.context, changed.pair, ACTOR, changed.reason, ()))
    with pytest.raises(ContentDatabaseError):
        service.publish(changed, operation_id=operation)
    assert authoring_state(db) == before
    # File import retains its original earliest-release deduplication/provenance path.
    assert store(db) == original


@pytest.mark.parametrize("boundary", ["finalize", "authored", "publication", "draft", "audit", "commit"])
def test_authored_publication_failure_rolls_back_all_content_and_audit_boundaries(db, boundary):
    service, _ = authoring_service(db)
    context = service.load()
    preview = service.publish_preview(expected_revision=context.revision,
                                      expected_sequence=context.publication_sequence, reason=REASON)
    owner_execute(db, """CREATE FUNCTION content.fail_authored_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected authored boundary failure'; END $$""")
    event, table = {"finalize": ("BEFORE UPDATE OF state", "releases"),
                    "authored": ("BEFORE INSERT", "authored_events"),
                    "publication": ("BEFORE INSERT", "publication_events"),
                    "draft": ("BEFORE UPDATE", "draft"),
                    "audit": ("BEFORE INSERT", "audit_events"),
                    "commit": ("AFTER INSERT", "authored_events")}[boundary]
    if boundary == "commit":
        owner_execute(db, f"CREATE CONSTRAINT TRIGGER fail_authored {event} ON content.{table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION content.fail_authored_fixture()")
    else:
        owner_execute(db, f"CREATE TRIGGER fail_authored {event} ON content.{table} FOR EACH ROW EXECUTE FUNCTION content.fail_authored_fixture()")
    before = authoring_state(db)
    with pytest.raises(ContentDatabaseError):
        service.publish(preview, operation_id=uuid4())
    assert authoring_state(db) == before


def test_reviewed_save_reservation_owner_replay_and_stale_publication(db):
    from meducation_api.admin.authoring import PairedAuthoringService

    service, original = authoring_service(db)
    context = service.load()
    reservation = uuid4()
    ids = reserve(db, op=reservation, counts={"i": 1}, draft=context.revision, publication=context.publication_sequence)
    pair = saved_pair(service)
    pair["quizzes"]["questions"].append({**copy.deepcopy(pair["quizzes"]["questions"][0]), "id": ids["i"][0]})
    preview = service.preview(pair, expected_revision=context.revision,
                              expected_sequence=context.publication_sequence, reason=REASON, reservation_ids=[reservation])
    other = PairedAuthoringService(db.operator, actor="different-test-editor")
    foreign = other.preview(pair, expected_revision=context.revision,
                            expected_sequence=context.publication_sequence, reason=REASON, reservation_ids=[reservation])
    before = authoring_state(db)
    with pytest.raises(ContentDatabaseError):
        other.save(foreign, operation_id=uuid4())
    assert authoring_state(db) == before
    operation = uuid4()
    revision = service.save(preview, operation_id=operation)
    before = authoring_state(db)
    assert service.save(preview, operation_id=operation) == revision
    assert authoring_state(db) == before
    with pytest.raises(ContentDatabaseError):
        service.save(preview, operation_id=uuid4())
    context = service.load()
    stale = service.preview(saved_pair(service), expected_revision=context.revision,
                            expected_sequence=context.publication_sequence, reason=REASON)
    publish(db, original, expected=context.publication_sequence)
    before = authoring_state(db)
    with pytest.raises(ContentDatabaseError):
        service.save(stale, operation_id=uuid4())
    with pytest.raises(ContentDatabaseError):
        service.publish_preview(expected_revision=context.revision,
                                expected_sequence=context.publication_sequence + 1, reason=REASON)
    assert authoring_state(db) == before


def test_concurrent_authored_publications_and_read_role_denial(db):
    service, _ = authoring_service(db)
    context = service.load()
    preview = service.publish_preview(expected_revision=context.revision,
                                      expected_sequence=context.publication_sequence, reason=REASON)
    barrier = Barrier(2)
    def run():
        barrier.wait(timeout=10)
        try:
            return service.publish(preview, operation_id=uuid4())
        except ContentDatabaseError:
            return None
    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(lambda _: run(), range(2)))
    assert sum(value is not None for value in outcomes) == 1
    assert scalar(db.operator, "SELECT count(*) FROM content.authored_events") == 1
    for engine in (db.reader, db.backup):
        with pytest.raises(SQLAlchemyError), engine.begin() as connection:
            connection.execute(text("SELECT content.publish_draft(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)"))
    with pytest.raises(SQLAlchemyError), db.reader.connect() as connection:
        connection.execute(text("SELECT * FROM content.authored_events"))


def test_upgrade_populated_l3_schema_preserves_content_and_protected_history(db):
    # Rebuild only this launcher's disposable schema at the original packaged head.
    with db.admin.begin() as connection:
        connection.exec_driver_sql("DROP SCHEMA admin_auth CASCADE")
        connection.exec_driver_sql("DROP SCHEMA content CASCADE")
    bootstrap(db.admin, RolePasswords(_env_file=None))
    with db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        config = migration_config()
        config.attributes["connection"] = connection
        command.upgrade(config, "0001_content")
    original = store(db)
    publication = publish(db, original)
    reserve(db, draft=0, publication=publication.publication_sequence)
    tables = ("draft", "active_publication", "releases", "operations", "audit_events",
              "import_events", "publication_events", "entity_ids", "id_counters", "id_reservations")
    def snapshot():
        return {table: scalar(db.operator, f"SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM content.{table} t") for table in tables}
    before = snapshot()
    upgrade(db.migrator)
    assert snapshot() == before
    assert migration_head() == scalar(db.reader, "SELECT version_num FROM content.schema_version")
    assert store(db) == original


def test_reviewed_save_cannot_restore_deleted_ids_without_a_controlled_reset(db):
    service, _ = authoring_service(db)
    pair = saved_pair(service)
    original_pair = copy.deepcopy(pair)
    pair["flashcards"]["cards"] = []
    context = service.load()
    deleted = service.preview(pair, expected_revision=context.revision,
                              expected_sequence=context.publication_sequence, reason=REASON)
    service.save(deleted, operation_id=uuid4())
    context = service.load()
    resurrect = service.preview(original_pair, expected_revision=context.revision,
                                expected_sequence=context.publication_sequence, reason=REASON)
    before = authoring_state(db)
    with pytest.raises(ContentDatabaseError):
        service.save(resurrect, operation_id=uuid4())
    assert authoring_state(db) == before


def test_concurrent_reviewed_save_and_publish_never_overwrite_each_other(db):
    service, _ = authoring_service(db)
    context = service.load()
    pair = saved_pair(service)
    pair["flashcards"]["cards"][0]["back"] = "Concurrent unpublished update"
    save_preview = service.preview(pair, expected_revision=context.revision,
                                   expected_sequence=context.publication_sequence, reason=REASON)
    publish_preview = service.publish_preview(expected_revision=context.revision,
                                              expected_sequence=context.publication_sequence, reason=REASON)
    barrier = Barrier(2)
    def run(action):
        barrier.wait(timeout=10)
        try:
            return getattr(service, action)(save_preview if action == "save" else publish_preview,
                                           operation_id=uuid4())
        except ContentDatabaseError:
            return None
    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(run, ("save", "publish")))
    assert sum(value is not None for value in outcomes) == 1
    assert service.load().revision == context.revision + 1
    assert scalar(db.operator, "SELECT count(*) FROM content.authored_events") == (1 if outcomes[1] is not None else 0)


# Private auth uses the same disposable database, with separate actual role connections.
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
        content_source="postgres" if postgres else "json",
        database_url=db.reader.url.render_as_string(hide_password=False) if postgres else None,
        bank_path=ROOT / "e2e/fixtures/bank.json",
        flashcard_bank_path=ROOT / "e2e/fixtures/flashcard-bank.json",
    )
    # Fixture filename follows existing content-source tests.
    app = create_app(settings, auth_settings=cfg, auth_factory=lambda _: runtime)
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
            "INSERT INTO content.entity_ids(kind,id,materialized) VALUES('i','ibypass',true)",
            "SELECT content.store_release(NULL,NULL,NULL,NULL,NULL,NULL,NULL)",
            "UPDATE content.draft SET revision=999",
        ):
            with pytest.raises(SQLAlchemyError), engine.begin() as c:
                c.execute(text(statement))
    assert scalar(db.backup, "SELECT count(*) FROM admin_auth.sessions") == 1


@pytest.mark.parametrize(
    "path",
    [
        "/draft",
        "/reservations",
        "/draft/preview",
        "/draft/save",
        "/draft/undo",
        "/draft/reset",
        "/publish/preview",
        "/publish",
        "/releases",
        "/releases/any/activation-preview",
        "/releases/any/activate",
        "/exports",
        "/operations/any",
    ],
)
def test_every_private_operation_is_guarded_before_lookup(db, path):
    client, runtime, _h = auth_app(db)
    with client:
        response = (
            client.get("/api/admin" + path)
            if path in ("/draft", "/releases", "/operations/any")
            else client.post(
                "/api/admin" + path, json={}, headers={"Origin": runtime.config.origin}
            )
        )
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
                "/api/admin/publish",
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
            with db.operator.begin() as c:
                c.execute(
                    text("SELECT content.save_draft(:op,:q,:f,0,0,:actor,:reason,'{}')"),
                    {
                        "op": uuid4(),
                        "q": artifacts()[0],
                        "f": artifacts()[1],
                        "actor": p.actor,
                        "reason": REASON,
                    },
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
    assert scalar(db.operator, "SELECT revision FROM content.draft") == 1
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
    paths=['/draft','/reservations','/draft/preview','/draft/save','/draft/undo','/draft/reset','/publish/preview','/publish','/releases','/releases/any/activation-preview','/releases/any/activate','/exports','/operations/any']
    before=authoring_state(db)
    with client:
        identity=h.client.verify(h.token(),nonce=h.nonce)
        for field,value in [('revoked',True),('epoch','restored-old-epoch'),('subject','wrong-editor'),('last_activity',h.now-1801),('expires',h.now-1)]:
            token,csrf=runtime.store.issue(identity)
            with db.session.begin() as c:
                c.execute(text(f'UPDATE admin_auth.sessions SET {field}=:v WHERE token_hash=:h'),{'v':value,'h':hashlib.sha256(token.encode()).hexdigest()})
            for path in paths:
                headers={'Cookie':runtime.config.cookie+'='+token,'Origin':runtime.config.origin,'X-CSRF-Token':csrf}
                response=client.get('/api/admin'+path,headers=headers) if path in ('/draft','/releases','/operations/any') else client.post('/api/admin'+path,json={},headers=headers)
                assert response.status_code==401,(field,path,response.text)
                assert response.headers['cache-control']=='no-store'
        assert authoring_state(db)==before


def editor_post(client,path,value):
    csrf=client.get('/api/admin/session').json()['csrfToken']
    return client.post('/api/admin'+path,json=value,headers={'Origin':str(client.base_url).rstrip('/'),'X-CSRF-Token':csrf})


def editor_expected(snapshot):
    return {'draftRevision':snapshot['draft']['revision'],'publicationSequence':snapshot['publication']['sequence']}


def editor_save(client,snapshot,pair=None,reservations=None,op=None):
    value={'expected':editor_expected(snapshot),'reason':REASON,'pair':pair or snapshot['pair'],'reservationIds':[], 'intent':{'reservations':[]}}
    if reservations:
        value['reservationIds']=[reservations['id']]; value['intent']['reservations']=[{'reservationId':reservations['id'],'slots':reservations['slots']}]
    preview=editor_post(client,'/draft/preview',value)
    assert preview.status_code==200,preview.text
    request={**value,'operationId':str(op or uuid4()),'previewFingerprint':preview.json()['previewFingerprint']}
    result=editor_post(client,'/draft/save',request)
    assert result.status_code==200,result.text
    return result.json(),request


def test_editor_http_save_publish_undo_reset_export_and_original_replay(db):
    import io
    import zipfile
    authoring_service(db)
    client,runtime,h=auth_app(db)
    with client:
        login,_=auth_login(client,runtime,h);assert login.status_code==303
        start=client.get('/api/admin/draft');assert start.status_code==200,start.text
        initial=start.json(); pair=copy.deepcopy(initial['pair'])
        pair['quizzes']['questions'][0]['stem']='**Saved** Unicode β'
        pair['flashcards']['cards'][0]['front']='Saved paired 🌿'
        saved,request=editor_save(client,initial,pair)
        snapshot=saved['snapshot']; assert snapshot['undo']['available']
        assert snapshot['publication']==initial['publication']
        assert snapshot['pair']==pair
        second,_=editor_save(client,snapshot)
        replay=editor_post(client,'/draft/save',request)
        assert replay.status_code==200 and replay.json()==saved
        assert client.get('/api/admin/draft').json()['draft']['revision']==second['snapshot']['draft']['revision']
        lookup=client.get('/api/admin/operations/'+request['operationId']);assert lookup.status_code==200
        assert lookup.json()['result']['draftRevision']==snapshot['draft']['revision']
        undo=editor_post(client,'/draft/undo',{'operationId':str(uuid4()),'expected':editor_expected(second['snapshot']),'reason':REASON,'targetRevision':second['snapshot']['undo']['targetRevision']})
        assert undo.status_code==200,undo.text
        current=undo.json()['snapshot']; assert current['pair']==pair
        publication_request={'expected':editor_expected(current),'reason':REASON}
        preview=editor_post(client,'/publish/preview',publication_request);assert preview.status_code==200,preview.text
        publication_request.update(operationId=str(uuid4()),previewFingerprint=preview.json()['previewFingerprint'])
        published=editor_post(client,'/publish',publication_request);assert published.status_code==200,published.text
        after=published.json()['snapshot'];assert not after['undo']['available']
        assert after['draft']['baseReleaseId']==after['publication']['releaseId']
        assert scalar(db.operator,'SELECT count(*) FROM content.authored_events')==1
        assert scalar(db.operator,'SELECT count(*) FROM content.import_events')==1
        release=after['publication']['releaseId']
        archive=editor_post(client,'/exports',{'target':'release','releaseId':release});assert archive.status_code==200,archive.text
        assert archive.content==editor_post(client,'/exports',{'target':'release','releaseId':release}).content
        with zipfile.ZipFile(io.BytesIO(archive.content)) as zipped:
            manifest=json.loads(zipped.read('manifest.json')); assert manifest['target']=='release' and manifest['publication']['selectedIsCurrent']
            assert 'session' not in manifest and 'csrf' not in manifest and 'actor' not in manifest
            assert json.loads(zipped.read('questionBank.generated.json'))==pair['quizzes']
            assert json.loads(zipped.read('flashcardBank.generated.json'))==pair['flashcards']
        draft_zip=editor_post(client,'/exports',{'target':'draft','draftRevision':after['draft']['revision'],'expected':editor_expected(after)})
        assert draft_zip.status_code==200
        with zipfile.ZipFile(io.BytesIO(draft_zip.content)) as zipped:assert json.loads(zipped.read('manifest.json'))['unpublished']
        changed=copy.deepcopy(pair);changed['flashcards']['cards'][0]['back']='Displaced unpublished content'
        saved2,_=editor_save(client,after,changed)
        reset=editor_post(client,'/draft/reset',{'operationId':str(uuid4()),'expected':editor_expected(saved2['snapshot']),'reason':REASON})
        assert reset.status_code==200,reset.text
        assert reset.json()['snapshot']['pair']==pair
        assert not reset.json()['snapshot']['undo']['available']
        assert scalar(db.operator,'SELECT count(*) FROM content.draft_history')==12
        with pytest.raises(SQLAlchemyError),db.operator.begin() as c:c.execute(text('DELETE FROM content.draft_history'))


def test_editor_reservations_destination_context_ownership_and_burned_rejection(db):
    authoring_service(db)
    client,runtime,h=auth_app(db)
    with client:
        auth_login(client,runtime,h)
        start=client.get('/api/admin/draft').json()
        slots=[{'kind':'f','count':2,'parentId':'dlegacy-X'}]
        request={'operationId':str(uuid4()),'expected':editor_expected(start),'reason':REASON,'counts':{'f':2},'intent':{'slots':slots}}
        reserved=editor_post(client,'/reservations',request);assert reserved.status_code==200,reserved.text
        assert reserved.json()==editor_post(client,'/reservations',request).json()
        assert client.get('/api/admin/draft').json()['draft']['revision']==start['draft']['revision']
        ids=reserved.json()['result']['allocatedIds']['f']
        candidate=copy.deepcopy(start['pair'])
        candidate['flashcards']['cards'] += [{'id':id,'deckId':'dlegacy-X','front':'Reserved front','back':'Reserved back'} for id in ids]
        malicious=copy.deepcopy(candidate);malicious['flashcards']['cards'][-1]['front']='<script>PRIVATE_SENTINEL</script>'
        invalid={'expected':editor_expected(start),'reason':REASON,'pair':malicious,'reservationIds':[request['operationId']],
            'intent':{'reservations':[{'reservationId':request['operationId'],'slots':slots}]}}
        before=authoring_state(db)
        rejected=editor_post(client,'/draft/preview',invalid);assert rejected.status_code==422,rejected.text
        assert 'PRIVATE_SENTINEL' not in rejected.text and authoring_state(db)==before
        wrong=copy.deepcopy(invalid);wrong['pair']=candidate;wrong['intent']['reservations'][0]['slots'][0]['count']=1
        assert editor_post(client,'/draft/preview',wrong).status_code==422
        result,_=editor_save(client,start,candidate,{'id':request['operationId'],'slots':slots})
        assert result['snapshot']['pair']==candidate
        assert scalar(db.operator,'SELECT count(*) FROM content.editor_slots')==2
        stale={**request,'operationId':str(uuid4())}
        assert editor_post(client,'/reservations',stale).status_code==409
        with pytest.raises(SQLAlchemyError),db.editor.connect() as c:
            c.execute(text("SELECT content.editor_apply('unknown','unknown','[\"forged\",\"actor\"]',:id,'reserve',CAST(:r AS jsonb),1)"),{'id':uuid4(),'r':json.dumps(stale)})
        assert scalar(db.operator,'SELECT count(*) FROM content.editor_slots')==2


def test_editor_undo_bound_activation_stale_base_and_mutation_role_denial(db):
    _,original=authoring_service(db)
    client,runtime,h=auth_app(db)
    with client:
        auth_login(client,runtime,h)
        current=client.get('/api/admin/draft').json()
        for index in range(12):
            pair=copy.deepcopy(current['pair']);pair['flashcards']['cards'][0]['back']='Batch '+str(index)
            result,_=editor_save(client,current,pair);current=result['snapshot']
        assert current['undo']['depth']==10
        expected=editor_expected(current); request={'expected':expected,'reason':REASON}
        target=str(original.release_id)
        preview=editor_post(client,'/releases/'+target+'/activation-preview',request);assert preview.status_code==200,preview.text
        activation=editor_post(client,'/releases/'+target+'/activate',{**request,'operationId':str(uuid4()),'previewFingerprint':preview.json()['previewFingerprint']})
        assert activation.status_code==200,activation.text
        after=activation.json()['snapshot'];assert after['pair']==current['pair'] and after['draft']['revision']==current['draft']['revision']
        assert not after['undo']['available']
        assert editor_post(client,'/publish/preview',{'expected':editor_expected(after),'reason':REASON}).status_code==409
        assert editor_post(client,'/draft/undo',{'operationId':str(uuid4()),'expected':editor_expected(after),'reason':REASON,'targetRevision':current['undo']['targetRevision']}).status_code==409
        reset=editor_post(client,'/draft/reset',{'operationId':str(uuid4()),'expected':editor_expected(after),'reason':REASON});assert reset.status_code==200,reset.text
        assert reset.json()['snapshot']['draft']['baseReleaseId']==target
        assert scalar(db.operator,'SELECT count(*) FROM content.draft_history')==28
    for engine in (db.editor,db.reader,db.backup,db.session):
        with pytest.raises(SQLAlchemyError),engine.connect() as c:
            c.execute(text("SELECT content.editor_internal_publish_draft(NULL,NULL,NULL,0,0,1,NULL,NULL,NULL)"))


@pytest.mark.parametrize('boundary',['history','audit','commit'])
def test_editor_save_failure_rolls_back_history_and_ledger(db,boundary):
    authoring_service(db)
    client,runtime,h=auth_app(db)
    owner_execute(db,"CREATE FUNCTION content.fail_editor_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected editor failure'; END $$")
    table='draft_history' if boundary in ('history','commit') else 'audit_events'
    if boundary=='commit':owner_execute(db,f'CREATE CONSTRAINT TRIGGER fail_editor AFTER INSERT ON content.{table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION content.fail_editor_fixture()')
    else:owner_execute(db,f'CREATE TRIGGER fail_editor BEFORE INSERT ON content.{table} FOR EACH ROW EXECUTE FUNCTION content.fail_editor_fixture()')
    with client:
        auth_login(client,runtime,h)
        current=client.get('/api/admin/draft').json();value={'expected':editor_expected(current),'reason':REASON,'pair':current['pair'],'reservationIds':[],'intent':{'reservations':[]}}
        preview=editor_post(client,'/draft/preview',value);assert preview.status_code==200,preview.text
        before=authoring_state(db)
        result=editor_post(client,'/draft/save',{**value,'operationId':str(uuid4()),'previewFingerprint':preview.json()['previewFingerprint']})
        assert result.status_code==503,result.text
        assert authoring_state(db)==before
        assert scalar(db.operator,'SELECT count(*) FROM content.draft_history')==0


def test_editor_publish_visibility_and_same_digest_rollback_without_worker_restart(db):
    _,original=authoring_service(db)
    client,runtime,h=auth_app(db,postgres=True)
    with client:
        auth_login(client,runtime,h)
        initial=client.get('/api/admin/draft').json()
        original_public=client.get('/api/v1/quizzes/q1/questions').json()
        pair=copy.deepcopy(initial['pair']);pair['quizzes']['questions'][0]['stem']='Published after request-driven selection'
        pair['flashcards']['cards'][0]['front']='Paired publication front'
        saved,_=editor_save(client,initial,pair)
        assert client.get('/api/v1/quizzes/q1/questions').json()==original_public
        args={'expected':editor_expected(saved['snapshot']),'reason':REASON}
        preview=editor_post(client,'/publish/preview',args)
        request={**args,'operationId':str(uuid4()),'previewFingerprint':preview.json()['previewFingerprint']}
        published=editor_post(client,'/publish',request);assert published.status_code==200,published.text
        assert client.get('/api/v1/quizzes/q1/questions').json()['questions'][0]['stem']==pair['quizzes']['questions'][0]['stem']
        assert client.get('/api/v1/flashcards/decks/dlegacy-X/cards').json()['cards'][0]['front']==pair['flashcards']['cards'][0]['front']
        current=published.json()['snapshot'];target=str(original.release_id)
        for _ in range(2):
            args={'expected':editor_expected(current),'reason':REASON}
            preview=editor_post(client,'/releases/'+target+'/activation-preview',args)
            activated=editor_post(client,'/releases/'+target+'/activate',{**args,'operationId':str(uuid4()),'previewFingerprint':preview.json()['previewFingerprint']})
            assert activated.status_code==200,activated.text
            current=activated.json()['snapshot']
            assert client.get('/api/v1/quizzes/q1/questions').json()==original_public
        before=authoring_state(db)
        replay=editor_post(client,'/publish',request);assert replay.status_code==200 and replay.json()==published.json()
        assert authoring_state(db)==before
        assert current['pair']==pair  # Rollback never overwrites unpublished draft content.
        assert editor_post(client,'/publish/preview',{'expected':editor_expected(current),'reason':REASON}).status_code==409


def test_editor_freshness_derived_from_bulk_deletes_and_checked_after_validation(db):
    authoring_service(db)
    client,runtime,h=auth_app(db)
    with client:
        auth_login(client,runtime,h)
        initial=client.get('/api/admin/draft').json()
        request={'operationId':str(uuid4()),'expected':editor_expected(initial),'reason':REASON,'counts':{'f':2},'intent':{'slots':[{'kind':'f','count':2,'parentId':'dlegacy-X'}]}}
        reserved=editor_post(client,'/reservations',request).json()['result']['allocatedIds']['f']
        pair=copy.deepcopy(initial['pair']);pair['flashcards']['cards'] += [{'id':id,'deckId':'dlegacy-X','front':'Extra front','back':'Extra back'} for id in reserved]
        saved,_=editor_save(client,initial,pair,{'id':request['operationId'],'slots':request['intent']['slots']})
        # Keep the session live but make the factor older than fifteen minutes in both clocks.
        with db.session.begin() as c:c.execute(text('UPDATE admin_auth.sessions SET auth_time=:old'),{'old':h.now-901})
        candidate=copy.deepcopy(saved['snapshot']['pair']);candidate['flashcards']['cards']=candidate['flashcards']['cards'][:1]
        args={'expected':editor_expected(saved['snapshot']),'reason':REASON,'pair':candidate,'reservationIds':[],'intent':{'reservations':[]}}
        preview=editor_post(client,'/draft/preview',args);assert preview.status_code==200
        assert preview.json()['requiresFreshAuthentication']
        before=authoring_state(db)
        result=editor_post(client,'/draft/save',{**args,'operationId':str(uuid4()),'previewFingerprint':preview.json()['previewFingerprint']})
        assert result.status_code==403 and authoring_state(db)==before
        # Single-record edits still work with a live older-factor session.
        single=copy.deepcopy(saved['snapshot']['pair']);single['flashcards']['cards'][0]['back']='Ordinary single update'
        saved2,_=editor_save(client,saved['snapshot'],single)
        assert saved2['snapshot']['pair']==single
        # A validator delay crossing absolute expiry cannot commit after its initial guard.
        with db.session.begin() as c:c.execute(text('UPDATE admin_auth.sessions SET auth_time=:now'),{'now':h.now})
        from meducation_api.admin.service import EditorService
        from meducation_api.auth.oidc import AuthError
        from meducation_api.content_policy import PairedContentValidator
        token=client.cookies.get(runtime.config.cookie)
        class Delayed(PairedContentValidator):
            def validate(self,pair):
                result=super().validate(pair);h.now+=28801;return result
        with runtime.store.guard(token,interactive=False) as principal:
            svc=EditorService(client.app.state.editor_engine,runtime.store,principal,Delayed())
            args={'expected':editor_expected(saved2['snapshot']),'reason':REASON,'pair':single,'reservationIds':[],'intent':{'reservations':[]},'previewFingerprint':'a'*64,'operationId':str(uuid4())}
            before=authoring_state(db)
            with pytest.raises(AuthError):svc.mutate('save',args)
            assert authoring_state(db)==before


@pytest.mark.parametrize('action', ['save', 'publish'])
def test_concurrent_guarded_editor_saves_and_reservations_are_context_safe(db, action):
    from meducation_api.admin.service import EditorService
    authoring_service(db)
    client,runtime,h=auth_app(db)
    with client:
        auth_login(client,runtime,h)
        current=client.get('/api/admin/draft').json()
        args={'expected':editor_expected(current),'reason':REASON,'pair':current['pair'],'reservationIds':[],'intent':{'reservations':[]}}
        if action == 'publish':
            args = {'expected': editor_expected(current), 'reason': REASON}
        preview=editor_post(client,'/draft/preview' if action == 'save' else '/publish/preview',args).json()['previewFingerprint']
        identity=h.client.verify(h.token(),nonce=h.nonce)
        tokens=[runtime.store.issue(identity)[0] for _ in range(2)]
        barrier=Barrier(2)
        def save(token):
            from meducation_api.auth.oidc import AuthError
            try:
                with runtime.store.guard(token) as principal:
                    svc=EditorService(client.app.state.editor_engine,runtime.store,principal)
                    barrier.wait(timeout=5)
                    return svc.mutate(action,{**args,'operationId':str(uuid4()),'previewFingerprint':preview})
            except AuthError as error:return error.status
        with ThreadPoolExecutor(2) as pool:results=list(pool.map(save,tokens))
        assert sum(isinstance(result,dict) for result in results)==1
        assert 409 in results
        assert scalar(db.operator,'SELECT count(*) FROM content.draft_history')==2


@pytest.mark.parametrize('boundary', ['finalize', 'authored', 'publication', 'draft', 'history', 'audit', 'commit'])
def test_guarded_publish_failure_preserves_every_paired_history_audit_boundary(db, boundary):
    authoring_service(db)
    client, runtime, h = auth_app(db)
    with client:
        auth_login(client, runtime, h)
        current = client.get('/api/admin/draft').json()
        args = {'expected': editor_expected(current), 'reason': REASON}
        preview = editor_post(client, '/publish/preview', args)
        assert preview.status_code == 200, preview.text
        owner_execute(db, "CREATE FUNCTION content.fail_editor_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected editor failure'; END $$")
        table = {'finalize': 'releases', 'authored': 'authored_events', 'publication': 'publication_events', 'draft': 'draft', 'history': 'draft_history', 'audit': 'audit_events', 'commit': 'authored_events'}[boundary]
        if boundary == 'commit':
            owner_execute(db, f'CREATE CONSTRAINT TRIGGER fail_editor AFTER INSERT ON content.{table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION content.fail_editor_fixture()')
        else:
            event = 'UPDATE' if boundary in ('finalize', 'draft') else 'INSERT'
            owner_execute(db, f'CREATE TRIGGER fail_editor BEFORE {event} ON content.{table} FOR EACH ROW EXECUTE FUNCTION content.fail_editor_fixture()')
        before = authoring_state(db)
        result = editor_post(client, '/publish', {**args, 'operationId': str(uuid4()), 'previewFingerprint': preview.json()['previewFingerprint']})
        assert result.status_code == 503, result.text
        assert authoring_state(db) == before


def test_guarded_reader_pins_both_banks_while_editor_publishes(db):
    authoring_service(db)
    client, runtime, h = auth_app(db, postgres=True)
    with client:
        auth_login(client, runtime, h)
        current = client.get('/api/admin/draft').json()
        pair = copy.deepcopy(current['pair'])
        pair['quizzes']['questions'][0]['stem'] = 'New paired stem'
        pair['flashcards']['cards'][0]['front'] = 'New paired front'
        saved, _ = editor_save(client, current, pair)
        args = {'expected': editor_expected(saved['snapshot']), 'reason': REASON}
        preview = editor_post(client, '/publish/preview', args)
        with client.app.state.source.view() as pinned:
            old = (pinned.questions.list_questions('q1'), pinned.flashcards.list_cards('dlegacy-X'))
            result = editor_post(client, '/publish', {**args, 'operationId': str(uuid4()), 'previewFingerprint': preview.json()['previewFingerprint']})
            assert result.status_code == 200, result.text
            assert (pinned.questions.list_questions('q1'), pinned.flashcards.list_cards('dlegacy-X')) == old
        with client.app.state.source.view() as newer:
            assert (newer.questions.list_questions('q1'), newer.flashcards.list_cards('dlegacy-X')) != old


def test_editor_envelope_pagination_and_uninitialized_draft_errors_are_safe(db):
    client, runtime, h = auth_app(db)
    with client:
        auth_login(client, runtime, h)
        assert client.get('/api/admin/draft').status_code == 409
        assert client.get('/api/admin/releases?limit=51').status_code == 400
        assert client.get('/api/admin/releases?cursor=invalid').status_code == 400
        assert client.get('/api/admin/operations/' + str(uuid4())).status_code == 404
        before = authoring_state(db)
        result = editor_post(client, '/reservations', {'actor': 'PRIVATE_SENTINEL'})
        assert result.status_code == 400 and 'PRIVATE_SENTINEL' not in result.text
        assert authoring_state(db) == before


def test_reservation_save_race_never_allocates_against_changed_context(db):
    from meducation_api.admin.service import EditorService
    from meducation_api.auth.oidc import AuthError
    authoring_service(db)
    client, runtime, h = auth_app(db)
    with client:
        auth_login(client, runtime, h)
        current = client.get('/api/admin/draft').json()
        args = {'expected': editor_expected(current), 'reason': REASON, 'pair': current['pair'], 'reservationIds': [], 'intent': {'reservations': []}}
        preview = editor_post(client, '/draft/preview', args).json()['previewFingerprint']
        identity = h.client.verify(h.token(), nonce=h.nonce)
        tokens = [runtime.store.issue(identity)[0] for _ in range(2)]
        barrier = Barrier(2)
        def run(index):
            try:
                with runtime.store.guard(tokens[index]) as principal:
                    svc = EditorService(client.app.state.editor_engine, runtime.store, principal)
                    value = {**args, 'operationId': str(uuid4()), 'previewFingerprint': preview} if index == 0 else {'operationId': str(uuid4()), 'expected': editor_expected(current), 'reason': REASON, 'counts': {'f': 1}, 'intent': {'slots': [{'kind': 'f', 'count': 1, 'parentId': 'dlegacy-X'}]}}
                    barrier.wait(timeout=5)
                    return svc.mutate('save' if index == 0 else 'reserve', value)
            except AuthError as error:
                return error.status
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(run, range(2)))
        assert isinstance(results[0], dict)
        assert isinstance(results[1], dict) or results[1] == 409
        assert scalar(db.operator, 'SELECT revision FROM content.draft') == int(current['draft']['revision']) + 1
        assert scalar(db.operator, 'SELECT count(*) FROM content.editor_slots') == int(isinstance(results[1], dict))


def test_editor_grouped_reservations_require_owned_same_context_parent(db):
    authoring_service(db)
    client, runtime, h = auth_app(db)
    with client:
        auth_login(client, runtime, h)
        current = client.get('/api/admin/draft').json()
        receipts = []
        def reserve(kind, parent=None):
            slots = [{'kind': kind, 'count': 1, **({'parentId': parent} if parent else {})}]
            op = str(uuid4())
            response = editor_post(client, '/reservations', {'operationId': op, 'expected': editor_expected(current), 'reason': REASON, 'counts': {kind: 1}, 'intent': {'slots': slots}})
            assert response.status_code == 200, response.text
            receipts.append({'reservationId': op, 'slots': slots})
            return response.json()['result']['allocatedIds'][kind][0]
        subject = reserve('s')
        quiz = reserve('q', subject)
        deck = reserve('d', subject)
        question = reserve('i', quiz)
        card = reserve('f', deck)
        pair = copy.deepcopy(current['pair'])
        pair['quizzes']['subjects'].append({'id': subject, 'name': 'Grouped subject', 'accent': '#bc531e'})
        pair['quizzes']['quizzes'].append({'id': quiz, 'subjectId': subject, 'name': 'Grouped quiz'})
        item = copy.deepcopy(pair['quizzes']['questions'][0]); item.update(id=question, quizId=quiz)
        pair['quizzes']['questions'].append(item)
        pair['flashcards']['decks'].append({'id': deck, 'subjectId': subject, 'name': 'Grouped deck'})
        pair['flashcards']['cards'].append({'id': card, 'deckId': deck, 'front': 'Grouped front', 'back': 'Grouped back'})
        args = {'expected': editor_expected(current), 'reason': REASON, 'pair': pair, 'reservationIds': [r['reservationId'] for r in receipts], 'intent': {'reservations': receipts}}
        preview = editor_post(client, '/draft/preview', args)
        assert preview.status_code == 200, preview.text
        result = editor_post(client, '/draft/save', {**args, 'operationId': str(uuid4()), 'previewFingerprint': preview.json()['previewFingerprint']})
        assert result.status_code == 200, result.text
        assert result.json()['snapshot']['pair'] == pair
        stale = editor_post(client, '/reservations', {'operationId': str(uuid4()), 'expected': editor_expected(result.json()['snapshot']), 'reason': REASON, 'counts': {'q': 1}, 'intent': {'slots': [{'kind': 'q', 'count': 1, 'parentId': 'missing-parent'}]}})
        assert stale.status_code == 422


def test_editor_rechecks_session_after_sql_writes_before_finishing_receipt(db):
    authoring_service(db)
    client, runtime, h = auth_app(db)
    with client:
        auth_login(client, runtime, h)
        current = client.get('/api/admin/draft').json()
        value = {'expected': editor_expected(current), 'reason': REASON, 'pair': current['pair'], 'reservationIds': [], 'intent': {'reservations': []}}
        preview = editor_post(client, '/draft/preview', value)
        assert preview.status_code == 200
        owner_execute(db, "CREATE FUNCTION content.expire_during_sql_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE admin_auth.sessions SET expires=0; RETURN NEW; END $$")
        owner_execute(db, 'CREATE TRIGGER expire_during_sql AFTER INSERT ON content.draft_history FOR EACH ROW EXECUTE FUNCTION content.expire_during_sql_fixture()')
        before = authoring_state(db)
        response = editor_post(client, '/draft/save', {**value, 'operationId': str(uuid4()), 'previewFingerprint': preview.json()['previewFingerprint']})
        assert response.status_code == 401, response.text
        assert authoring_state(db) == before
        assert scalar(db.session, 'SELECT count(*) FROM admin_auth.sessions WHERE expires>0') == 1  # Expiry injection rolled back; 401 clears the browser cookie.


def test_recovery_invalidates_restored_sessions_and_pending_callbacks_without_content_loss(db):
    from meducation_api.db.recovery import invalidate_restored_sessions

    authoring_service(db)
    client, runtime, h = auth_app(db)
    with client:
        login, _ = auth_login(client, runtime, h)
        assert login.status_code == 303
        pending = runtime.store.begin_login('recovery-browser')
        before = authoring_state(db)
        with db.migrator.begin() as connection:
            result = invalidate_restored_sessions(connection)
        assert result == {'revokedSessions': 1, 'clearedLoginTransactions': 1}
        assert client.get('/api/admin/draft').status_code == 401
        from meducation_api.auth.oidc import AuthError
        with pytest.raises(AuthError):
            runtime.store.consume(pending['state'], 'recovery-browser')
        assert authoring_state(db) == before
        with db.migrator.begin() as connection:
            assert invalidate_restored_sessions(connection) == {
                'revokedSessions': 0, 'clearedLoginTransactions': 0,
            }
        for engine in (db.editor, db.session, db.operator, db.reader):
            with pytest.raises(SQLAlchemyError), engine.begin() as connection:
                invalidate_restored_sessions(connection)


def test_recovery_reapplied_acl_preserves_editor_and_session_role_boundaries(db):
    from meducation_api.db.recovery import restore_content_permissions

    authoring_service(db)
    owner_execute(db, 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA content FROM meducation_editor')
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
            connection.execute(text('UPDATE content.draft SET revision=999'))
    assert scalar(db.backup, 'SELECT count(*) FROM admin_auth.sessions') == 1


@pytest.mark.parametrize('target', ['draft', 'release'])
def test_recovery_tools_check_real_deterministic_http_exports(db, tmp_path, target):
    import io
    import zipfile

    from meducation_api.db.export_tools import inspect_export

    _service, original = authoring_service(db)
    client, runtime, h = auth_app(db)
    with client:
        login, _ = auth_login(client, runtime, h)
        assert login.status_code == 303
        snapshot = client.get('/api/admin/draft').json()
        value = {'target': target}
        if target == 'release':
            value['releaseId'] = str(original.release_id)
        else:
            value.update(expected=editor_expected(snapshot), draftRevision=snapshot['draft']['revision'])
        response = editor_post(client, '/exports', value)
        assert response.status_code == 200
        assert response.content == editor_post(client, '/exports', value).content
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            archive.extractall(tmp_path)
        report = inspect_export(tmp_path, repository=ROOT, audit=True)
        assert report['context']['target'] == target
        assert report['context']['unpublished'] is (target == 'draft')
        assert report['explanations']['questions'] == len(snapshot['pair']['quizzes']['questions'])
        serialized = json.dumps(report)
        assert runtime.config.epoch not in serialized
        assert runtime.config.client_secret.get_secret_value() not in serialized


def allocation_journals(tmp_path):
    primary, independent = tmp_path / 'primary', tmp_path / 'independent'
    primary.mkdir(mode=0o700)
    independent.mkdir(mode=0o700)
    return primary, independent


def allocation_range(db, journals, *, recovery=False, size=2):
    from meducation_api.db.allocation_fence import issue_range
    return issue_range(db.migrator, primary=journals[0], independent=journals[1],
                       size=size, recovery=recovery, reason='Isolated allocation fixture', rehearsal=True)


def allocation_reserve(db, count=1):
    return reserve_ids(db.operator, operation_id=uuid4(), counts={'i': count},
                       expected_draft_revision=0, expected_publication_sequence=0,
                       intent='Independent range fixture', actor=ACTOR, reason=REASON)


def test_allocation_fence_exhaustion_rolls_back_and_extension_burns_unused_tails(db, tmp_path):
    journals = allocation_journals(tmp_path)
    admitted = allocation_range(db, journals)
    allocated = allocation_reserve(db, 2)['i']
    assert max(int(value[1:]) for value in allocated) < admitted['ceilings']['i']
    before = authoring_state(db)
    with pytest.raises(ContentDatabaseError):
        allocation_reserve(db)
    assert authoring_state(db) == before
    # No explicit DML/function privilege can bypass the fence through a reader/editor.
    for engine in (db.editor, db.reader, db.operator, db.session, db.backup):
        with pytest.raises(SQLAlchemyError), engine.begin() as c:
            c.execute(text('UPDATE content.allocation_fence SET required=false'))
    second = allocation_range(db, journals)
    ids = allocation_reserve(db)['i']
    assert int(ids[0][1:]) >= admitted['ceilings']['i']
    assert second['generation'] == 2
    assert scalar(db.backup, 'SELECT count(*) FROM content.allocation_fence_events') == 2


def test_allocation_fence_blocks_editor_and_trusted_new_id_import(db, tmp_path):
    authoring_service(db)
    journals = allocation_journals(tmp_path)
    allocation_range(db, journals, size=1)
    allocation_reserve(db)
    client, runtime, h = auth_app(db)
    with client:
        login, _ = auth_login(client, runtime, h)
        assert login.status_code == 303
        snapshot = client.get('/api/admin/draft').json()
        command = {'operationId': str(uuid4()), 'expected': editor_expected(snapshot),
                   'reason': REASON, 'counts': {'i': 1}, 'intent': {'slots': [{
                       'kind': 'i', 'count': 1, 'parentId': snapshot['pair']['quizzes']['quizzes'][0]['id']}]}}
        before = authoring_state(db)
        response = editor_post(client, '/reservations', command)
        assert response.status_code == 503
        assert response.json()['error']['code'] == 'allocation_recovery_required'
        assert authoring_state(db) == before
    q, _f = banks()
    q['subjects'][0]['id'] = 's999'
    q['quizzes'][0]['subjectId'] = 's999'
    with pytest.raises(ContentDatabaseError):
        store(db, q=q, f={"schemaVersion": 2, "decks": [], "cards": []})
    assert authoring_state(db) == before


def test_allocation_fence_partial_independent_write_never_admits_range(db, tmp_path, monkeypatch):
    from meducation_api.db import allocation_fence as fence
    journals = allocation_journals(tmp_path)
    append = fence.append_record
    def fail_second(folder, record):
        if folder == journals[1]:
            raise OSError('independent destination unavailable')
        append(folder, record)
    before = authoring_state(db)
    with monkeypatch.context() as patch:
        patch.setattr(fence, 'append_record', fail_second)
        with pytest.raises(ContentDatabaseError):
            allocation_range(db, journals)
    assert authoring_state(db) == before
    assert scalar(db.operator, 'SELECT required FROM content.allocation_fence') is False
    with pytest.raises(ContentDatabaseError, match='differ'):
        allocation_range(db, journals)
    # Reviewed completion of the second immutable copy repairs evidence only.
    append(journals[1], fence.read_journal(journals[0])[0])
    with pytest.raises(ContentDatabaseError, match='explicit recovery'):
        allocation_range(db, journals)
    recovered = allocation_range(db, journals, recovery=True)
    assert recovered['generation'] == 2
    assert int(allocation_reserve(db)['i'][0][1:]) >= 3


def test_allocation_fence_missing_old_foreign_and_divergent_evidence_fail_closed(db, tmp_path):
    from meducation_api.db.allocation_fence import append_record
    from meducation_api.db.recovery import invalidate_restored_sessions
    journals = allocation_journals(tmp_path)
    allocation_range(db, journals)
    allocation_range(db, journals)
    with db.migrator.begin() as c:
        invalidate_restored_sessions(c)
    before = authoring_state(db)
    with pytest.raises(ContentDatabaseError):
        allocation_reserve(db)
    # Both copies are stale: DB digest/generation detects the missing latest record.
    for folder in journals:
        (folder / '00000000000000000002.json').unlink()
    with pytest.raises(ContentDatabaseError, match='older'):
        allocation_range(db, journals, recovery=True)
    for folder in journals:
        (folder / '00000000000000000001.json').unlink()
    with pytest.raises(ContentDatabaseError, match='missing'):
        allocation_range(db, journals, recovery=True)
    # Evidence copied from another lineage must never reset this database's identity.
    for folder in journals:
        append_record(folder, {'version': 1, 'lineage': str(uuid4()), 'generation': 1,
                              'previous': None, 'schemaHead': migration_head(), 'recovery': False,
                              'floors': dict.fromkeys(('s','q','i','d','f'), 1),
                              'ceilings': dict.fromkeys(('s','q','i','d','f'), 5)})
    with pytest.raises(ContentDatabaseError):
        allocation_range(db, journals, recovery=True)
    assert authoring_state(db) == before
    assert scalar(db.operator, 'SELECT paused FROM content.allocation_fence') is True


def test_allocation_fence_commit_failure_leaves_ahead_evidence_for_explicit_recovery(db, tmp_path):
    from meducation_api.db.recovery import invalidate_restored_sessions
    journals = allocation_journals(tmp_path)
    first = allocation_range(db, journals)
    owner_execute(db, "CREATE FUNCTION content.fail_fence_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fixture deferred failure'; END $$")
    owner_execute(db, 'CREATE CONSTRAINT TRIGGER fail_fence AFTER INSERT ON content.allocation_fence_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION content.fail_fence_fixture()')
    before = authoring_state(db)
    with pytest.raises(ContentDatabaseError):
        allocation_range(db, journals)
    assert authoring_state(db) == before
    assert scalar(db.operator, 'SELECT generation FROM content.allocation_fence') == 1
    owner_execute(db, 'DROP TRIGGER fail_fence ON content.allocation_fence_events')
    with pytest.raises(ContentDatabaseError, match='explicit recovery'):
        allocation_range(db, journals)
    with db.migrator.begin() as c:
        invalidate_restored_sessions(c)
    recovered = allocation_range(db, journals, recovery=True)
    assert recovered['generation'] == 3
    assert int(allocation_reserve(db)['i'][0][1:]) >= first['ceilings']['i'] + 2


def test_concurrent_allocation_fence_boundary_has_one_atomic_winner(db, tmp_path):
    allocation_range(db, allocation_journals(tmp_path), size=1)
    def allocate():
        try:
            return allocation_reserve(db)
        except ContentDatabaseError:
            return None
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda _: allocate(), range(2)))
    assert sum(value is not None for value in outcomes) == 1
    assert scalar(db.operator, 'SELECT count(*) FROM content.id_reservations') == 1


def test_allocation_fence_prefix_fsync_failure_cannot_admit_another_range(db, tmp_path, monkeypatch):
    from meducation_api.db import allocation_fence as fence
    journals = allocation_journals(tmp_path)
    allocation_range(db, journals)
    before = authoring_state(db)
    generation = scalar(db.operator, 'SELECT generation FROM content.allocation_fence')
    with monkeypatch.context() as patch:
        patch.setattr(fence.os, 'fsync', lambda _: (_ for _ in ()).throw(OSError('flush failed')))
        with pytest.raises(ContentDatabaseError):
            allocation_range(db, journals)
    assert scalar(db.operator, 'SELECT generation FROM content.allocation_fence') == generation
    assert authoring_state(db) == before
    assert len(fence.read_journal(journals[0])) == len(fence.read_journal(journals[1])) == 1
