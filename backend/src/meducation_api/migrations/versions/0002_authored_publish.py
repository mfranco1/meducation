"""Private authored publication, distinct release identities and replay lookup."""

from pathlib import Path

from alembic import op

revision = "0002_authored_publish"
down_revision = "0001_content"
branch_labels = None
depends_on = None


def upgrade() -> None:
    resources = Path(__file__).resolve().parents[1]
    op.get_bind().exec_driver_sql((resources / "0002_authored_publish.sql").read_text())
    # Preserve the packaged L3 migration and its importer contract. Once authored
    # releases can repeat a digest, imports reuse the earliest matching release.
    previous = (resources / "0001_operations.sql").read_text()
    importer = previous[
        previous.index("CREATE FUNCTION content.store_release(") : previous.index(
            "CREATE FUNCTION content.activate_release("
        )
    ]
    importer = importer.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)
    importer = importer.replace(
        "AND flashcard_revision=revisions->>'flashcard_revision';",
        "AND flashcard_revision=revisions->>'flashcard_revision' ORDER BY created_at,release_id LIMIT 1;",
    )
    op.get_bind().exec_driver_sql(importer)


def downgrade() -> None:
    raise RuntimeError(
        "Content downgrade is destructive and unsupported; restore a separate database."
    )
