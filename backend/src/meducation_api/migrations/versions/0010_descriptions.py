"""Optional descriptions on subjects, topics and quizzes."""

from pathlib import Path

from alembic import op

revision = "0010_descriptions"
down_revision = "0009_topics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    resource = Path(__file__).resolve().parents[1] / "0010_descriptions.sql"
    op.get_bind().exec_driver_sql(resource.read_text())


def downgrade() -> None:
    raise RuntimeError(
        "Description downgrade is destructive and unsupported; restore a separate database."
    )
