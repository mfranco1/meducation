"""Per-record draft tables, change history and ID sequences.

Databases that already held content passed this revision before topics existed; this
copy only initializes an empty draft. Upgrade an older database with content using a
checkout from before 0009_topics.
"""

from pathlib import Path

from alembic import op
from sqlalchemy import text

from meducation_api.db.engine import ContentDatabaseError

revision = "0007_draft_records"
down_revision = "0006_allocation_fence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    resources = Path(__file__).resolve().parents[1]
    connection.exec_driver_sql((resources / "0007_draft_records.sql").read_text())
    if connection.execute(text("SELECT base_release_id FROM content.draft")).scalar_one():
        raise ContentDatabaseError(
            "Migration 0007 refused: the draft has content. Upgrade it with a checkout "
            "from before 0009_topics."
        )
    connection.execute(text("INSERT INTO content.draft_state(base_release_id) VALUES(NULL)"))


def downgrade() -> None:
    raise RuntimeError(
        "Draft-record downgrade is destructive and unsupported; restore a separate database."
    )
