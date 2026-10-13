"""Immutable paired content, private draft and controlled operator functions."""

from pathlib import Path

from alembic import op

revision = "0001_content"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    resources = Path(__file__).resolve().parents[1]
    for name in ("0001_schema.sql", "0001_operations.sql"):
        op.get_bind().exec_driver_sql((resources / name).read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError(
        "Content downgrade is destructive and unsupported. Use a disposable database "
        "or a deliberate compatible app/schema recovery into a separate database."
    )
