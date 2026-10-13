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
    for role in ("migrator", "operator", "reader", "backup"):
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
    assert migration_head() == "0001_content"
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
    assert scalar(db.reader, "SELECT version_num FROM content.schema_version") == "0001_content"


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
