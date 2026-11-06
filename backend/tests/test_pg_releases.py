"""Real PG17: migration, role boundaries, release storage, activation and export."""

import copy
import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest
from alembic import command
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from support import (
    ACTOR,
    REASON,
    ROOT,
    artifacts,
    banks,
    owner_execute,
    publish,
    scalar,
    store,
)

from meducation_api.content.releases import activate_release, store_release
from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.migrate import migration_config, migration_head, upgrade

pytestmark = pytest.mark.postgres


def test_migration_upgrade_repeat_and_role_boundary(db):
    assert migration_head() == "0014_single_release_copy"
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
        "SELECT * FROM content.publication_events",
        "SELECT content.store_release(NULL,NULL,NULL,NULL)",
    ):
        with pytest.raises(SQLAlchemyError), db.reader.connect() as connection:
            connection.exec_driver_sql(sql)
    assert scalar(db.backup, "SELECT count(*) FROM content.draft_state") == 1
    with pytest.raises(RuntimeError, match="unsupported"), db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        config = migration_config()
        config.attributes["connection"] = connection
        command.downgrade(config, "base")
    assert scalar(db.reader, "SELECT version_num FROM content.schema_version") == "0014_single_release_copy"


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


def test_transaction_failure_preserves_active_and_rolls_back_new_release(db):
    first = store(db)
    active = publish(db, first)
    q, f = banks()
    q["subjects"].append({"id": "s500", "name": "Disposable", "accent": "#123456"})
    qt, ft = artifacts(q, f)
    with pytest.raises(RuntimeError, match="injected"), db.operator.begin() as connection:
        store_release(connection, quiz_text=qt, flashcard_text=ft)
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
        "publication_events",
    ):
        with pytest.raises(SQLAlchemyError):
            owner_execute(db, "DELETE FROM content." + table)
    for statement in (
        "UPDATE content.questions SET stem='Changed'",
        "UPDATE content.releases SET quiz_revision=quiz_revision",
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


def test_building_release_cannot_commit(db):
    with pytest.raises(SQLAlchemyError), db.migrator.begin() as connection:
        connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
        connection.execute(
            text(
                "INSERT INTO content.releases(state,quiz_revision,flashcard_revision) VALUES('building',:q,:f)"
            ),
            {"q": "sha256-" + "a" * 64, "f": "sha256-" + "b" * 64},
        )
    assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 0


def test_activation_rollback_and_stale_preconditions(db):
    first = store(db)
    one = publish(db, first)
    q, f = banks()
    q["questions"][0]["stem"] += " changed"
    second = store(db, q=q, f=f)
    two = publish(db, second, one.publication_sequence)
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
            release_id=uuid4(),
            expected_sequence=back.publication_sequence,
            actor=ACTOR,
            reason=REASON,
        )


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
    "mutate",
    [
        "null",
        "duplicate-id",
        "broken-deck",
        "blank-tabs",
        "blank-unicode",
        "blank-control",
    ],
)
def test_release_constraints_reject_invalid_pairs(db, mutate):
    q, f = banks()
    if mutate == "null":
        q["questions"][0]["metadata"] = None
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
            text("SELECT content.store_release(:q,:f,:qr,:fr)"),
            {"q": qt, "f": ft, "qr": "sha256-" + "a" * 64, "fr": "sha256-" + "b" * 64},
        )
    assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 0


def test_runtime_schema_ready_requires_explicit_activation_and_disposes(db):
    from meducation_api.repositories.postgres import PostgresRuntime
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
            connection, quiz_text=qt, flashcard_text=ft
        )
        activate_release(
            connection,
            release_id=second.release_id,
            expected_sequence=0,
            actor=ACTOR,
            reason=REASON,
        )
    assert scalar(db.operator, "SELECT count(*) FROM content.releases") == 1
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
            release = store_release(connection, quiz_text=qt, flashcard_text=ft)
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


def test_export_is_canonical_and_refuses_overwrite(db, tmp_path):
    from meducation_api.content.transfer import export_release

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


def test_export_of_unknown_release_creates_no_files(db, tmp_path):
    from meducation_api.content.transfer import export_release

    with pytest.raises(ContentDatabaseError):
        export_release(db.operator, uuid4(), tmp_path / "unknown")
    assert not (tmp_path / "unknown").exists()


def test_cli_activate_export_and_stale_precondition(db, tmp_path):
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

    def activation(sequence=0):
        return (
            "activate",
            "--release-id",
            release,
            "--expected-sequence",
            sequence,
            "--actor",
            ACTOR,
            "--reason",
            REASON,
        )

    activated = invoke(*activation())
    assert activated.returncode == 0, activated.stderr
    stale = invoke(*activation())
    assert stale.returncode == 1 and "SQL" not in stale.stdout
    assert db.operator.url.password not in stale.stderr + stale.stdout
    output = tmp_path / "cli-export"
    assert invoke("export-release", "--release-id", release, "--output", output).returncode == 0
    assert invoke("export-release", "--release-id", release, "--output", output).returncode == 1


def test_export_write_failure_cleans_only_new_output(db, tmp_path, monkeypatch):
    from meducation_api.content.transfer import export_release

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
