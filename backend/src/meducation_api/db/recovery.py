"""Explicit owner maintenance after portable no-ACL restoration; never called by workers."""

from sqlalchemy import Connection

from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.migrate import migration_head


def restore_content_permissions(connection: Connection) -> None:
    connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
    if (
        connection.exec_driver_sql("SELECT version_num FROM content.alembic_version").scalar_one()
        != migration_head()
    ):
        raise ContentDatabaseError("Restored schema head is unsupported; permissions not applied.")
    connection.exec_driver_sql("""
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA content FROM PUBLIC;
GRANT USAGE ON SCHEMA content TO meducation_reader,meducation_backup,meducation_operator;
GRANT SELECT ON ALL TABLES IN SCHEMA content TO meducation_operator,meducation_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA content TO meducation_backup;
GRANT SELECT ON content.schema_version,content.active_publication,content.published_releases,
content.published_subjects,content.published_quizzes,content.published_questions,
content.published_decks,content.published_flashcards TO meducation_reader;
GRANT EXECUTE ON FUNCTION content.reserve_ids(uuid,jsonb,bigint,bigint,text,text,text),
content.store_release(uuid,text,text,jsonb,text,text,uuid[]),
content.activate_release(uuid,uuid,bigint,text,text),
content.save_draft(uuid,text,text,bigint,bigint,text,text,uuid[]) TO meducation_operator;
""")
