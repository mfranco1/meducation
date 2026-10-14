"""Permit owned same-context reserved parents for one atomic grouped editor save."""

from alembic import op

revision = "0005_reserved_parents"
down_revision = "0004_editor_operations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().exec_driver_sql("""
CREATE FUNCTION content.editor_parent_available(k text,parent text,who text,draft_revision bigint,publication_sequence bigint) RETURNS boolean
LANGUAGE sql SET search_path=pg_catalog,content,pg_temp AS $$
SELECT EXISTS(
 SELECT 1 FROM content.editor_slots s
 JOIN content.operations o ON o.operation_id=s.reservation_id
 JOIN content.id_reservations r ON r.operation_id=s.reservation_id
 WHERE s.kind=CASE k WHEN 'q' THEN 's' WHEN 'd' THEN 's' WHEN 'i' THEN 'q' WHEN 'f' THEN 'd' END
 AND s.id=parent AND o.actor=who AND o.action='reserve'
 AND r.expected_draft_revision=draft_revision AND r.expected_publication_sequence=publication_sequence
)
$$;
REVOKE ALL ON FUNCTION content.editor_parent_available(text,text,text,bigint,bigint) FROM PUBLIC;
DO $migration$
DECLARE body text;
BEGIN
 SELECT pg_get_functiondef('content.editor_apply(text,text,text,uuid,text,jsonb,integer)'::regprocedure) INTO body;
 body:=replace(body, 'OR k IN (''q'',''d'') AND NOT EXISTS', 'OR k IN (''q'',''d'') AND NOT content.editor_parent_available(k,parent,who,expected_draft,expected_publication) AND NOT EXISTS');
 body:=replace(body, 'OR k=''i'' AND NOT EXISTS', 'OR k=''i'' AND NOT content.editor_parent_available(k,parent,who,expected_draft,expected_publication) AND NOT EXISTS');
 body:=replace(body, 'OR k=''f'' AND NOT EXISTS', 'OR k=''f'' AND NOT content.editor_parent_available(k,parent,who,expected_draft,expected_publication) AND NOT EXISTS');
 IF position('content.editor_parent_available' IN body)=0 THEN RAISE EXCEPTION 'Editor destination check changed'; END IF;
 body:=replace(body, 'RETURN content.finish_operation(op,outcome', 'PERFORM content.editor_guard(session_hash,policy_epoch,who,coalesce(fresh,false)); RETURN content.finish_operation(op,outcome');
 EXECUTE body;
END $migration$;
""")


def downgrade() -> None:
    raise RuntimeError(
        "Reserved-parent downgrade is destructive and unsupported; restore a separate database."
    )
