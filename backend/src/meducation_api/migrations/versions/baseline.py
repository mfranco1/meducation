"""Baseline content and admin_auth schemas.

The revision id stays at the last pre-squash head so existing databases need no stamp.
"""

from pathlib import Path

from alembic import op

revision = "0012_unique_names"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    resource = Path(__file__).resolve().parents[1] / "baseline.sql"
    op.get_bind().exec_driver_sql(resource.read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Content downgrade is unsupported; restore a separate database.")
