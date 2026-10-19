"""One answer per question; drop review and provenance fields."""

from pathlib import Path

from alembic import op

revision = "0011_simple_answers"
down_revision = "0010_descriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    resource = Path(__file__).resolve().parents[1] / "0011_simple_answers.sql"
    op.get_bind().exec_driver_sql(resource.read_text())


def downgrade() -> None:
    raise RuntimeError(
        "Simple-answer downgrade is destructive and unsupported; restore a separate database."
    )
