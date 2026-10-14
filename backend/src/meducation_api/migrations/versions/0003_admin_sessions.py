"""Private sessions and separate restricted editor/session roles."""

from pathlib import Path

from alembic import op

revision = "0003_admin_sessions"
down_revision = "0002_authored_publish"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().exec_driver_sql(
        (Path(__file__).resolve().parents[1] / "0003_admin_sessions.sql").read_text()
    )


def downgrade() -> None:
    raise RuntimeError(
        "Auth/content downgrade is destructive and unsupported; restore a separate database and rotate auth epoch."
    )
