"""Fixture-only retained publication and installed application rollback drills."""

import hashlib
import json
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from compose_support import docker
from meducation_api.db.migrate import migration_head
from meducation_api.db.operations import activate_release
from meducation_api.db.transfer import capture_pair, import_pair
from meducation_api.repositories.postgres import PostgresContentSource

PRIOR_REF = "bb8f354971cf5914eaad50feb24671b833ae679c"


def prepare_retained_pair(operator, pair, folder, root):
    changed_q, changed_f = (
        json.loads(pair.quiz_artifact),
        json.loads(pair.flashcard_artifact),
    )
    changed_q["questions"][0]["stem"] += "\nRetained-release fixture only."
    changed_f["cards"][0]["front"] += "\nRetained-release fixture only."
    qp, fp = folder / "rollback-q.json", folder / "rollback-f.json"
    qp.write_text(json.dumps(changed_q))
    fp.write_text(json.dumps(changed_f))
    changed = import_pair(
        operator,
        capture_pair(qp, fp, repository=root),
        operation_id=uuid.uuid4(),
        actor="local-rollback-probe",
        reason="Disposable later paired release",
    )
    return changed, changed_q, changed_f


def retained_release(operator, settings, pair, original, prepared, snapshot, admin):
    started = time.monotonic()
    changed, changed_q, changed_f = prepared
    before = snapshot(admin)
    events = []

    def activate(release, expected):
        began = time.monotonic()
        with operator.begin() as connection:
            publication = activate_release(
                connection,
                operation_id=uuid.uuid4(),
                release_id=release.release_id,
                expected_sequence=expected,
                actor="local-rollback-probe",
                reason="Retained release drill",
            )
        events.append(
            {
                "release_id": str(release.release_id),
                "publication_sequence": publication.publication_sequence,
                "quiz_digest": release.quiz_revision,
                "flashcard_digest": release.flashcard_revision,
                "seconds": time.monotonic() - began,
            }
        )
        return publication

    def bodies(view):
        quiz = changed_q["questions"][0]["quizId"]
        deck = changed_f["cards"][0]["deckId"]
        return (
            [
                q.model_dump(exclude_unset=True)
                for q in view.questions.list_questions(quiz)
            ],
            [
                c.model_dump(exclude_unset=True)
                for c in view.flashcards.list_cards(deck)
            ],
        )

    with operator.connect() as connection:
        start_sequence = connection.exec_driver_sql(
            "SELECT publication_sequence FROM content.active_publication"
        ).scalar_one()
    activate(changed, start_sequence)
    with PostgresContentSource(settings) as source, source.view() as pinned:
        pinned_bodies = bodies(pinned)
        pinned_revisions = (pinned.questions.revision, pinned.flashcards.revision)
        assert pinned.release_id == changed.release_id
        activate(original, start_sequence + 1)
        with source.view() as fresh:
            assert (
                fresh.release_id == original.release_id
                and fresh.publication_sequence == start_sequence + 2
            )
            restored_bodies = bodies(fresh)
            assert restored_bodies != pinned_bodies
            assert (
                restored_bodies[0][0]["stem"]
                == json.loads(pair.quiz_artifact)["questions"][0]["stem"]
            )
            assert (
                restored_bodies[1][0]["front"]
                == json.loads(pair.flashcard_artifact)["cards"][0]["front"]
            )
        activate(changed, start_sequence + 2)
        with source.view() as fresh:
            assert (
                fresh.release_id == changed.release_id
                and fresh.publication_sequence == start_sequence + 3
            )
            assert bodies(fresh) == pinned_bodies
        assert bodies(pinned) == pinned_bodies
        assert (
            pinned.questions.revision,
            pinned.flashcards.revision,
        ) == pinned_revisions
        assert pinned.publication_sequence == start_sequence + 1
    activate(
        original, start_sequence + 3
    )  # Leave the archive pair active for existing parity/recovery checks.
    after = snapshot(admin)
    allowed = {
        "content.operations",
        "content.audit_events",
        "content.publication_events",
        "content.active_publication",
        "sequences",
    }
    assert {k: v for k, v in before.items() if k not in allowed} == {
        k: v for k, v in after.items() if k not in allowed
    }, "Activation changed protected content/history/allocation state"
    return {
        "result": "pass",
        "seconds": time.monotonic() - started,
        "activations": events,
        "protected_before": {k: v for k, v in before.items() if k not in allowed},
        "protected_after": {k: v for k, v in after.items() if k not in allowed},
        "inflight_release_and_bodies_preserved": True,
        "later_release_retained": True,
    }


def image_fingerprint(image, ref, root):
    script = """import hashlib,json,meducation_api
from pathlib import Path
p=Path(meducation_api.__file__).parent
print(json.dumps({str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest()
for f in sorted(p.rglob('*')) if f.suffix in ('.py','.sql')}))"""
    installed = json.loads(
        docker(
            "run",
            "--rm",
            "--network",
            "none",
            "--entrypoint",
            "python",
            image,
            "-c",
            script,
        )
    )
    expected = {}
    for name in subprocess.check_output(
        ["git", "ls-tree", "-r", "--name-only", ref, "backend/src/meducation_api"],
        cwd=root,
        text=True,
    ).splitlines():
        path = Path(name)
        if path.suffix in (".py", ".sql"):
            expected[str(path.relative_to("backend/src/meducation_api"))] = (
                hashlib.sha256(
                    subprocess.check_output(["git", "show", ref + ":" + name], cwd=root)
                ).hexdigest()
            )
    assert installed == expected, (
        "Installed rollback image differs from selected source revision"
    )
    head = docker(
        "run",
        "--rm",
        "--network",
        "none",
        "--entrypoint",
        "python",
        image,
        "-c",
        "from meducation_api.db.migrate import migration_head;print(migration_head())",
    )
    return {
        "image_id": docker("image", "inspect", "--format", "{{.Id}}", image),
        "source_commit": ref,
        "schema_head": head,
        "installed_source_sha256": installed,
    }


def application_rollback(
    *,
    current_image,
    prior_image,
    current_ref,
    pg,
    origin,
    envfile,
    admin,
    pair,
    folder,
    root,
    snapshot,
):
    started = time.monotonic()
    images = {
        "current": image_fingerprint(current_image, current_ref, root),
        "prior": image_fingerprint(prior_image, PRIOR_REF, root),
    }
    assert (
        images["current"]["schema_head"]
        == images["prior"]["schema_head"]
        == migration_head()
    )
    before = snapshot(admin)
    qbank, fbank = json.loads(pair.quiz_artifact), json.loads(pair.flashcard_artifact)
    qid, did = qbank["questions"][0]["quizId"], fbank["cards"][0]["deckId"]
    rounds = []
    name = pg + "-rollback-api"
    running = False

    def get(path):
        with urllib.request.urlopen(origin + path, timeout=3) as response:
            assert response.status == 200
            return json.load(response)

    def stop():
        nonlocal running
        if running:
            owned = json.loads(docker("inspect", name))[0]
            assert owned["Config"]["Labels"]["meducation.rollback-fixture"] == pg
            docker("rm", "--force", name)
            running = False

    def launch(image, compatible=True):
        nonlocal running
        began = time.monotonic()
        docker(
            "run",
            "--detach",
            "--name",
            name,
            "--label",
            "meducation.rollback-fixture=" + pg,
            "--network",
            "container:" + pg,
            "--env-file",
            str(envfile),
            "--read-only",
            "--tmpfs",
            "/tmp",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges:true",
            image,
        )
        running = True
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            state = json.loads(docker("inspect", "--format", "{{json .State}}", name))
            if not state["Running"]:
                assert not compatible and state["ExitCode"] != 0, (
                    "Compatible rollback API failed startup"
                )
                try:
                    get("/api/v1/subjects")
                except (OSError, urllib.error.URLError):
                    return {
                        "startup": "refused",
                        "exit_code": state["ExitCode"],
                        "seconds": time.monotonic() - began,
                    }
                raise AssertionError("Incompatible API served content")
            if compatible:
                try:
                    if get("/health/ready") == {"status": "ready"}:
                        return {"startup": "ready", "seconds": time.monotonic() - began}
                except (OSError, urllib.error.URLError):
                    pass
            time.sleep(0.2)
        raise AssertionError("Application rollback startup deadline exceeded")

    try:
        for kind, image in (
            ("current-before", current_image),
            ("prior", prior_image),
            ("current-after", current_image),
        ):
            observation = launch(image)
            qcatalog, fcatalog = (
                get("/api/v1/subjects"),
                get("/api/v1/flashcards/subjects"),
            )
            qsubject = next(q["subjectId"] for q in qbank["quizzes"] if q["id"] == qid)
            fsubject = next(d["subjectId"] for d in fbank["decks"] if d["id"] == did)
            qmembers = get(f"/api/v1/subjects/{qsubject}/quizzes")
            fmembers = get(f"/api/v1/flashcards/subjects/{fsubject}/catalog")
            qmember = next(q for q in qmembers["quizzes"] if q["id"] == qid)
            fmember = next(d for d in fmembers["decks"] if d["id"] == did)
            assert (
                qmembers["revision"] == qcatalog["revision"]
                and fmembers["revision"] == fcatalog["revision"]
            )
            assert qmember["questionIds"] == [
                q["id"] for q in qbank["questions"] if q["quizId"] == qid
            ]
            assert fmember["cardIds"] == [
                c["id"] for c in fbank["cards"] if c["deckId"] == did
            ]
            assert qmember["questionCount"] == len(qmember["questionIds"])
            assert fmember["cardCount"] == len(fmember["cardIds"])
            qbody, fbody = (
                get(f"/api/v1/quizzes/{qid}/questions"),
                get(f"/api/v1/flashcards/decks/{did}/cards"),
            )
            assert (
                qbody["revision"] == qcatalog["revision"]
                and fbody["revision"] == fcatalog["revision"]
            )
            assert qbody["questions"] == [
                q for q in qbank["questions"] if q["quizId"] == qid
            ]
            assert fbody["cards"] == [c for c in fbank["cards"] if c["deckId"] == did]
            assert snapshot(admin) == before, (
                "Application rollback changed authoring or allocation state"
            )
            rounds.append(
                {
                    "phase": kind,
                    **observation,
                    "quiz_revision": qcatalog["revision"],
                    "flashcard_revision": fcatalog["revision"],
                }
            )
            stop()
        # Test-only schema marker corruption. No migration or data downgrade is performed.
        with admin.begin() as connection:
            connection.exec_driver_sql(
                "UPDATE content.alembic_version SET version_num='l5_incompatible_fixture'"
            )
        try:
            rounds.append(
                {"phase": "incompatible", **launch(current_image, compatible=False)}
            )
        finally:
            stop()
            with admin.begin() as connection:
                connection.exec_driver_sql(
                    "UPDATE content.alembic_version SET version_num='"
                    + migration_head()
                    + "'"
                )
        rounds.append({"phase": "roll-forward", **launch(current_image)})
        assert get(f"/api/v1/quizzes/{qid}/questions")["questions"] == [
            q for q in qbank["questions"] if q["quizId"] == qid
        ]
        assert snapshot(admin) == before
    finally:
        stop()
    return {
        "result": "pass",
        "seconds": time.monotonic() - started,
        "images": images,
        "phases": rounds,
        "before": before,
        "after": snapshot(admin),
        "schema_downgrade": False,
        "newer_authoring_preserved": True,
    }
