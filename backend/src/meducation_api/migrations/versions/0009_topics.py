"""Topics between subjects and quizzes/decks (quiz schema v5, flashcard schema v3)."""

from pathlib import Path

from alembic import op

revision = "0009_topics"
down_revision = "0008_retire_legacy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    resource = Path(__file__).resolve().parents[1] / "0009_topics.sql"
    op.get_bind().exec_driver_sql(resource.read_text())


def downgrade() -> None:
    raise RuntimeError(
        "Topic downgrade is destructive and unsupported; restore a separate database."
    )
