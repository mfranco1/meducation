"""Explicit owner maintenance after portable no-ACL restoration; never called by workers."""

from sqlalchemy import Connection

from meducation_api.db.draft import advance_id_sequences
from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.migrate import migration_head


def advance_ids(connection: Connection, by: int) -> dict[str, int]:
    """After restoring an older backup, skip IDs that may have been issued since."""
    connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
    if (
        connection.exec_driver_sql("SELECT version_num FROM content.alembic_version").scalar_one()
        != migration_head()
    ):
        raise ContentDatabaseError("Schema head is unsupported; sequences not changed.")
    return advance_id_sequences(connection, by)


def invalidate_restored_sessions(connection: Connection) -> dict[str, int]:
    """Quarantine restored credentials before workers start; retain revoked session evidence.

    The operator must also rotate MEDUCATION_ADMIN_EPOCH outside the database.
    Clearing outstanding login ciphertext prevents pre-restore callbacks from creating
    new sessions even if an old configuration is accidentally reused.
    """
    connection.exec_driver_sql("SET LOCAL ROLE meducation_owner")
    if (
        connection.exec_driver_sql("SELECT version_num FROM content.alembic_version").scalar_one()
        != migration_head()
    ):
        raise ContentDatabaseError("Restored schema head is unsupported; sessions not changed.")
    connection.exec_driver_sql(
        "LOCK TABLE admin_auth.sessions,admin_auth.logins IN ACCESS EXCLUSIVE MODE"
    )
    revoked = connection.exec_driver_sql(
        "UPDATE admin_auth.sessions SET revoked=true WHERE NOT revoked"
    ).rowcount
    cleared = connection.exec_driver_sql("DELETE FROM admin_auth.logins").rowcount
    connection.exec_driver_sql("UPDATE content.allocation_fence SET paused=true WHERE required")
    return {"revokedSessions": revoked, "clearedLoginTransactions": cleared}


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
content.save_draft(uuid,text,text,bigint,bigint,text,text,uuid[]),
content.authored_publish_result(uuid,text,text,bigint,bigint,integer,text,text,text),
content.publish_draft(uuid,text,text,bigint,bigint,integer,text,text,text),
content.reviewed_save_result(uuid,text,text,bigint,bigint,bigint,integer,text,uuid[],text,text),
content.save_reviewed_draft(uuid,text,text,bigint,bigint,bigint,integer,text,uuid[],text,text) TO meducation_operator;
REVOKE ALL ON SCHEMA admin_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA admin_auth TO meducation_session,meducation_backup;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA admin_auth TO meducation_session;
GRANT SELECT ON ALL TABLES IN SCHEMA admin_auth TO meducation_backup;
GRANT USAGE ON SCHEMA content TO meducation_editor;
GRANT SELECT ON content.draft,content.active_publication,content.published_releases TO meducation_editor;
GRANT EXECUTE ON FUNCTION content.editor_read(text,text,text,text,jsonb),content.editor_replay(text,text,text,uuid,text,jsonb),content.editor_apply(text,text,text,uuid,text,jsonb,integer),content.editor_check_creates(text,text,text,text,text,uuid[],jsonb,bigint,bigint) TO meducation_editor;
GRANT SELECT,INSERT,UPDATE,DELETE ON content.draft_subjects,content.draft_quizzes,
content.draft_questions,content.draft_decks,content.draft_flashcards TO meducation_editor;
GRANT SELECT,INSERT ON content.draft_changes TO meducation_editor;
GRANT SELECT,UPDATE ON content.draft_state TO meducation_editor;
GRANT USAGE,SELECT ON SEQUENCE content.draft_subject_ids,content.draft_quiz_ids,
content.draft_question_ids,content.draft_changes_change_id_seq TO meducation_editor;
GRANT SELECT ON content.releases,content.publication_events,content.entity_ids TO meducation_editor;
GRANT EXECUTE ON FUNCTION content.nonblank(text),
content.store_release(uuid,text,text,jsonb,text,text,uuid[]),
content.activate_release(uuid,uuid,bigint,text,text) TO meducation_editor;
""")
