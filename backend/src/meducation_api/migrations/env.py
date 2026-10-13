"""Only the explicit operator command supplies a migration connection."""

from alembic import context

connection = context.config.attributes["connection"]
context.configure(
    connection=connection,
    target_metadata=None,
    version_table_schema="content",
    compare_type=True,
)
with context.begin_transaction():
    context.run_migrations()
