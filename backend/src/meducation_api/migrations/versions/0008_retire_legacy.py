"""Drop the whole-pair draft, ID reservation, allocation fence and editor-function objects."""

from pathlib import Path

from alembic import op

revision = "0008_retire_legacy"
down_revision = "0007_draft_records"
branch_labels = None
depends_on = None


def upgrade() -> None:
    resource = Path(__file__).resolve().parents[1] / "0008_retire_legacy.sql"
    op.get_bind().exec_driver_sql(resource.read_text())


def downgrade() -> None:
    raise RuntimeError(
        "Legacy retirement is destructive and unsupported; restore a separate database."
    )
