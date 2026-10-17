"""Per-record draft tables, change history and ID sequences, copied from the base release."""

from pathlib import Path

from alembic import op
from sqlalchemy import text

from meducation_api.db.draft import (
    advance_id_sequences,
    build_documents,
    first_difference,
    load_release,
)
from meducation_api.db.engine import ContentDatabaseError

revision = "0007_draft_records"
down_revision = "0006_allocation_fence"
branch_labels = None
depends_on = None

EMPTY = (
    '{\n  "schemaVersion": 4,\n  "subjects": [],\n  "quizzes": [],\n  "questions": []\n}\n',
    '{\n  "schemaVersion": 2,\n  "decks": [],\n  "cards": []\n}\n',
)


def upgrade() -> None:
    connection = op.get_bind()
    resources = Path(__file__).resolve().parents[1]
    connection.exec_driver_sql((resources / "0007_draft_records.sql").read_text())
    draft = connection.execute(
        text(
            "SELECT d.base_release_id,d.quiz_document,d.flashcard_document,"
            "r.quiz_artifact,r.flashcard_artifact FROM content.draft d "
            "LEFT JOIN content.releases r ON r.release_id=d.base_release_id"
        )
    ).one()
    base, documents, artifacts = draft[0], tuple(draft[1:3]), tuple(draft[3:5])
    if base is None:
        if documents != EMPTY:
            raise ContentDatabaseError(
                "Migration 0007 refused: the draft has content but no base release."
            )
    else:
        if documents != artifacts:
            raise ContentDatabaseError(
                "Migration 0007 refused: the draft has unpublished changes. "
                "Publish or reset the draft with the previous version first."
            )
        load_release(connection, base)
        difference = first_difference(build_documents(connection), artifacts)
        if difference is not None:
            raise ContentDatabaseError(
                "Migration 0007 refused: rebuilt documents differ from the base release at "
                + difference
                + "."
            )
    connection.execute(
        text("INSERT INTO content.draft_state(base_release_id) VALUES(:base)"), {"base": base}
    )
    advance_id_sequences(connection, 0)


def downgrade() -> None:
    raise RuntimeError(
        "Draft-record downgrade is destructive and unsupported; restore a separate database."
    )
