"""Draft names are unique per parent."""

from pathlib import Path

from alembic import op

revision = "0012_unique_names"
down_revision = "0011_simple_answers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    resource = Path(__file__).resolve().parents[1] / "0012_unique_names.sql"
    op.get_bind().exec_driver_sql(resource.read_text())


def downgrade() -> None:
    raise RuntimeError("Unique-name downgrade is unsupported; restore a separate database.")
