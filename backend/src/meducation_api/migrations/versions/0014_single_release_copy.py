"""Store each release once (rows only) and keep one publishing ledger."""

from typing import Any

from alembic import op
from sqlalchemy import text

from meducation_api.content.draft import QUIZ_SCHEMA, build_documents, revisions

revision = "0014_single_release_copy"
down_revision = "0013_prune_releases"
branch_labels = None
depends_on = None

DROP = r"""
DROP TABLE content.audit_events, content.import_events;
ALTER TABLE content.publication_events DROP COLUMN operation_id;
ALTER TABLE content.releases DROP CONSTRAINT releases_pruned_check;
ALTER TABLE content.releases DROP COLUMN quiz_artifact, DROP COLUMN flashcard_artifact, DROP COLUMN originating_operation_id;
DROP TABLE content.operations;
ALTER TABLE content.draft_subjects DROP COLUMN field_order;
ALTER TABLE content.draft_topics DROP COLUMN field_order;
ALTER TABLE content.draft_quizzes DROP COLUMN field_order;
ALTER TABLE content.draft_questions DROP COLUMN field_order;
ALTER TABLE content.draft_decks DROP COLUMN field_order;
ALTER TABLE content.draft_flashcards DROP COLUMN field_order;

DROP FUNCTION content.store_release(uuid, text, text, jsonb, text, text);
DROP FUNCTION content.activate_release(uuid, uuid, bigint, text, text);
DROP FUNCTION content.claim_operation(uuid, text, jsonb, text, text);
DROP FUNCTION content.finish_operation(uuid, jsonb, uuid, bigint);
DROP FUNCTION content.guard_operation();
DROP FUNCTION content.require_operation_result();
DROP FUNCTION content.checked_artifacts(text, text);
DROP FUNCTION content.pretty_json(json, integer);
DROP FUNCTION content.release_documents(uuid);
DROP FUNCTION content.json_clean(json);
DROP FUNCTION content.fields(jsonb, text[], text[]);
DROP FUNCTION content.text_fields(jsonb, text[], text[]);
"""

FUNCTIONS = r"""
CREATE OR REPLACE FUNCTION content.validate_release(r content.releases) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM (
        SELECT count(*) n,min(position) lo,max(position) hi FROM content.subjects WHERE release_id=r.release_id UNION ALL
        SELECT count(*),min(position),max(position) FROM content.topics WHERE release_id=r.release_id UNION ALL
        SELECT count(*),min(position),max(position) FROM content.quizzes WHERE release_id=r.release_id UNION ALL
        SELECT count(*),min(position),max(position) FROM content.questions WHERE release_id=r.release_id UNION ALL
        SELECT count(*),min(position),max(position) FROM content.decks WHERE release_id=r.release_id UNION ALL
        SELECT count(*),min(position),max(position) FROM content.flashcards WHERE release_id=r.release_id
    ) ordinals WHERE n>0 AND (lo<>0 OR hi<>n-1)) THEN RAISE EXCEPTION 'Noncontiguous collection ordinals'; END IF;
END $$;

CREATE OR REPLACE FUNCTION content.guard_release() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
BEGIN
    IF TG_OP='UPDATE' AND OLD.state='finalized' AND NEW.state='pruned' AND
       (to_jsonb(NEW)-'state') = (to_jsonb(OLD)-'state') THEN RETURN NEW; END IF;
    IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.state<>'building') THEN RAISE EXCEPTION 'Finalized releases cannot be changed or deleted'; END IF;
    IF TG_OP='INSERT' AND NEW.state<>'building' THEN RAISE EXCEPTION 'Release must be built transactionally'; END IF;
    IF TG_OP='UPDATE' AND NEW.release_id IS DISTINCT FROM OLD.release_id THEN RAISE EXCEPTION 'Release identity is immutable'; END IF;
    IF NEW.state='pruned' THEN RAISE EXCEPTION 'Only a finalized release can be pruned'; END IF;
    IF NEW.state='finalized' THEN PERFORM content.validate_release(NEW); END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION content.store_release(qtext text, ftext text, quiz_rev text, flashcard_rev text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $_$
DECLARE target uuid; q jsonb := qtext::jsonb; f jsonb := ftext::jsonb;
BEGIN
    INSERT INTO content.releases(state,quiz_revision,flashcard_revision) VALUES('building',quiz_rev,flashcard_rev) RETURNING release_id INTO target;
    INSERT INTO content.subjects(release_id,id,position,name,accent,description) SELECT target,v->>'id',n-1,v->>'name',v->>'accent',v->>'description' FROM jsonb_array_elements(q->'subjects') WITH ORDINALITY e(v,n);
    INSERT INTO content.topics(release_id,id,position,subject_id,name,description) SELECT target,v->>'id',n-1,v->>'subjectId',v->>'name',v->>'description' FROM jsonb_array_elements(q->'topics') WITH ORDINALITY e(v,n);
    INSERT INTO content.quizzes(release_id,id,position,topic_id,name,description) SELECT target,v->>'id',n-1,v->>'topicId',v->>'name',v->>'description' FROM jsonb_array_elements(q->'quizzes') WITH ORDINALITY e(v,n);
    INSERT INTO content.questions(release_id,id,position,quiz_id,stem,choices,answer,rationale,rationale_meta,pearls,metadata)
        SELECT target,v->>'id',n-1,v->>'quizId',v->>'stem',v->'choices',v->>'answer',v->>'rationale',v->'rationaleMeta',v->'pearls',v->'metadata' FROM jsonb_array_elements(q->'questions') WITH ORDINALITY e(v,n);
    INSERT INTO content.decks(release_id,id,position,topic_id,name,description) SELECT target,v->>'id',n-1,v->>'topicId',v->>'name',v->>'description' FROM jsonb_array_elements(f->'decks') WITH ORDINALITY e(v,n);
    INSERT INTO content.flashcards(release_id,id,position,deck_id,front,back,sources) SELECT target,v->>'id',n-1,v->>'deckId',v->>'front',v->>'back',v->>'sources' FROM jsonb_array_elements(f->'cards') WITH ORDINALITY e(v,n);
    UPDATE content.releases SET state='finalized',finalized_at=clock_timestamp() WHERE release_id=target;
    RETURN target;
END $_$;

CREATE FUNCTION content.activate_release(target uuid, expected_sequence bigint, who text, why text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
DECLARE prior bigint; new_sequence bigint;
BEGIN
    SELECT publication_sequence INTO STRICT prior FROM content.active_publication FOR UPDATE;
    IF expected_sequence IS NULL OR prior<>expected_sequence THEN RAISE EXCEPTION 'Publication precondition is stale'; END IF;
    IF NOT EXISTS(SELECT 1 FROM content.releases WHERE release_id=target AND state='finalized' AND quiz_schema_version=6 AND flashcard_schema_version=4) THEN RAISE EXCEPTION 'Release is not finalized at the current schema'; END IF;
    INSERT INTO content.publication_events(release_id,prior_sequence,actor,reason) VALUES(target,prior,who,why) RETURNING publication_sequence INTO new_sequence;
    UPDATE content.active_publication SET release_id=target,publication_sequence=new_sequence;
    RETURN new_sequence;
END $$;

REVOKE ALL ON FUNCTION content.store_release(text,text,text,text), content.activate_release(uuid,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION content.store_release(text,text,text,text), content.activate_release(uuid,bigint,text,text) TO meducation_operator, meducation_editor;
-- The editor loads a release's rows into the draft.
GRANT SELECT ON content.subjects, content.topics, content.quizzes, content.questions,
    content.decks, content.flashcards TO meducation_editor;

CREATE OR REPLACE FUNCTION content.prune_releases(keep integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
DECLARE pruned uuid[];
BEGIN
    IF keep IS NULL OR keep < 0 THEN RAISE EXCEPTION 'Invalid keep count'; END IF;
    WITH active AS (SELECT release_id FROM content.active_publication),
    kept AS (
        SELECT release_id FROM active
        UNION SELECT base_release_id FROM content.draft_state
        UNION (SELECT r.release_id FROM content.releases r JOIN content.publication_events p USING(release_id)
               WHERE r.state='finalized' AND r.quiz_schema_version=6 AND r.flashcard_schema_version=4
                 AND r.release_id IS DISTINCT FROM (SELECT release_id FROM active)
               GROUP BY r.release_id ORDER BY max(p.publication_sequence) DESC LIMIT keep)),
    done AS (
        UPDATE content.releases SET state='pruned'
        WHERE state='finalized' AND release_id NOT IN (SELECT release_id FROM kept WHERE release_id IS NOT NULL)
        RETURNING release_id)
    SELECT array_agg(release_id) INTO pruned FROM done;
    IF pruned IS NULL THEN RETURN 0; END IF;
    DELETE FROM content.flashcards WHERE release_id=ANY(pruned);
    DELETE FROM content.decks WHERE release_id=ANY(pruned);
    DELETE FROM content.questions WHERE release_id=ANY(pruned);
    DELETE FROM content.quizzes WHERE release_id=ANY(pruned);
    DELETE FROM content.topics WHERE release_id=ANY(pruned);
    DELETE FROM content.subjects WHERE release_id=ANY(pruned);
    RETURN cardinality(pruned);
END $$;
"""


def upgrade() -> None:
    connection = op.get_bind()
    connection.exec_driver_sql(DROP)
    connection.exec_driver_sql(FUNCTIONS)
    # Revisions now hash the canonical documents built from release rows.
    ids: Any = (
        connection.execute(
            text(
                "SELECT release_id FROM content.releases WHERE state='finalized' "
                "AND quiz_schema_version=:schema"
            ),
            {"schema": QUIZ_SCHEMA},
        )
        .scalars()
        .all()
    )
    connection.exec_driver_sql("ALTER TABLE content.releases DISABLE TRIGGER release_guard")
    for release_id in ids:
        found = revisions(*build_documents(connection, release_id))
        connection.execute(
            text(
                "UPDATE content.releases SET quiz_revision=:q,flashcard_revision=:f WHERE release_id=:r"
            ),
            {"q": found["quizRevision"], "f": found["flashcardRevision"], "r": release_id},
        )
    connection.exec_driver_sql("SET CONSTRAINTS ALL IMMEDIATE")  # fire deferred checks first
    connection.exec_driver_sql("ALTER TABLE content.releases ENABLE TRIGGER release_guard")


def downgrade() -> None:
    raise RuntimeError("Content downgrade is unsupported; restore a separate database.")
