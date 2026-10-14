"""Reviewed continuation of the interrupted first cutover metadata rehearsal."""

import hashlib
import json
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend/src"))
from backup import main as retain_backup
from dotenv import dotenv_values
from meducation_api.admin.authoring import PairedAuthoringService
from meducation_api.db.allocation_fence import digest, read_journal
from meducation_api.db.engine import create_database_engine, database_url
from meducation_api.db.migrate import migration_head
from meducation_api.db.transfer import capture_pair, export_release, reconstruct_release
from pydantic import SecretStr


def main():
    home = ROOT / "var/local-authority"
    state = json.loads((home / "state.json").read_text())
    if state["phase"] != "initializing":
        raise RuntimeError("No interrupted initialization to continue")
    env = dotenv_values(home / "operator.env")
    engine = create_database_engine(
        database_url(
            SecretStr(env["MEDUCATION_OPERATOR_DATABASE_URL"]),
            role="meducation_operator",
            local=True,
        ),
        operator=True,
    )
    try:
        pair = capture_pair(
            ROOT / "src/content/questionBank.generated.json",
            ROOT / "src/content/flashcardBank.generated.json",
            repository=ROOT,
        )
        if not (pair.source_hashes == state["sourceSha256"]):
            raise RuntimeError("Local cutover verification failed")
        original = {
            "quizzes": json.loads(pair.quiz_artifact),
            "flashcards": json.loads(pair.flashcard_artifact),
        }
        modified = json.loads(json.dumps(original))
        modified["quizzes"]["subjects"][0]["name"] += " (cutover rehearsal)"
        service = PairedAuthoringService(engine, actor="local-cutover-rehearsal")
        context = service.load()
        current = {
            "quizzes": json.loads(context.quiz_document),
            "flashcards": json.loads(context.flashcard_document),
        }
        if not (
            current == modified
            and context.publication_sequence == 2
            and (context.revision == 3)
        ):
            raise RuntimeError("Local cutover verification failed")
        first = str(context.published_release_id)
        preview = service.preview(
            original,
            expected_revision=context.revision,
            expected_sequence=context.publication_sequence,
            reason="Restore exact reviewed subject label after interrupted cutover rehearsal",
        )
        service.save(preview, operation_id=uuid4())
        context = service.load()
        preview = service.publish_preview(
            expected_revision=context.revision,
            expected_sequence=context.publication_sequence,
            reason="Restore exact reviewed subject label after interrupted cutover rehearsal",
        )
        publication = service.publish(preview, operation_id=uuid4())
        final = publication.release.release_id
        with engine.connect() as c:
            qt, ft, _ = reconstruct_release(c, final)
            if not ((qt, ft) == (pair.quiz_artifact, pair.flashcard_artifact)):
                raise RuntimeError("Local cutover verification failed")
        export = export_release(
            engine, final, ROOT / "var/backups/postgres/cutover-export"
        )
        archive = retain_backup()
        journal = read_journal(ROOT / "var/backups/postgres/allocation-primary")
        if not (
            journal == read_journal(ROOT / "var/backups/postgres/allocation-local-copy")
        ):
            raise RuntimeError("Local cutover verification failed")
        context = service.load()
        state.update(
            phase="initialized",
            schema=migration_head(),
            releaseId=str(final),
            publicationSequence=context.publication_sequence,
            draftRevision=context.revision,
            rehearsalPublications=[first, str(final)],
            backupPath=str(archive.relative_to(ROOT)),
            backupSha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
            export=export,
            fence={
                "generation": journal[-1]["generation"],
                "recordSha256": digest(journal[-1]),
                "retention": "local-only; off-device deferred",
            },
            interruption="First publication committed; incorrect result field corrected; reviewed continuation restored exact original metadata without reimport",
        )
        (home / "state.json").write_text(json.dumps(state, indent=2) + "\n")
        print(
            "Reviewed continuation complete; exact original restored, export and full backup retained.",
            flush=True,
        )
    finally:
        engine.dispose()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 - redact driver errors
        print(
            "Continuation stopped ("
            + type(error).__name__
            + "); preserve private state.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
