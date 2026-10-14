"""Independently retained allocation ceilings and fail-closed restore quarantine."""

from pathlib import Path

from alembic import op

revision = "0006_allocation_fence"
down_revision = "0005_reserved_parents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    resource = Path(__file__).resolve().parents[1] / "0006_allocation_fence.sql"
    op.get_bind().exec_driver_sql(resource.read_text())


def downgrade() -> None:
    raise RuntimeError(
        "Allocation protection downgrade is destructive and unsupported; restore a separate database."
    )
