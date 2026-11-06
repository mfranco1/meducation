"""Prune old releases: keep the row and history, drop artifacts and content rows."""

from alembic import op

revision = "0013_prune_releases"
down_revision = "0012_unique_names"
branch_labels = None
depends_on = None

SQL = r"""
-- Pruned releases keep their row and history; their artifacts and content rows are removed.
ALTER TABLE content.releases DROP CONSTRAINT releases_state_check;
ALTER TABLE content.releases ADD CONSTRAINT releases_state_check CHECK (state IN ('building','finalized','pruned'));
ALTER TABLE content.releases DROP CONSTRAINT releases_check;
ALTER TABLE content.releases ADD CONSTRAINT releases_check CHECK ((state <> 'building') = (finalized_at IS NOT NULL));
ALTER TABLE content.releases ALTER COLUMN quiz_artifact DROP NOT NULL, ALTER COLUMN flashcard_artifact DROP NOT NULL;
ALTER TABLE content.releases ADD CONSTRAINT releases_pruned_check CHECK ((state = 'pruned') = (quiz_artifact IS NULL AND flashcard_artifact IS NULL));

CREATE OR REPLACE FUNCTION content.guard_release() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
BEGIN
    IF TG_OP='UPDATE' AND OLD.state='finalized' AND NEW.state='pruned' AND NEW.quiz_artifact IS NULL AND NEW.flashcard_artifact IS NULL AND
       (to_jsonb(NEW)-ARRAY['state','quiz_artifact','flashcard_artifact']) = (to_jsonb(OLD)-ARRAY['state','quiz_artifact','flashcard_artifact']) THEN RETURN NEW; END IF;
    IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.state<>'building') THEN RAISE EXCEPTION 'Finalized releases cannot be changed or deleted'; END IF;
    IF TG_OP='INSERT' AND NEW.state<>'building' THEN RAISE EXCEPTION 'Release must be built transactionally'; END IF;
    IF TG_OP='UPDATE' AND NEW.release_id IS DISTINCT FROM OLD.release_id THEN RAISE EXCEPTION 'Release identity is immutable'; END IF;
    IF NEW.state='pruned' THEN RAISE EXCEPTION 'Only a finalized release can be pruned'; END IF;
    IF NEW.state='finalized' THEN PERFORM content.validate_release(NEW); END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION content.guard_content_row() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
DECLARE target uuid; current_state text;
BEGIN
    target := CASE WHEN TG_OP='DELETE' THEN OLD.release_id ELSE NEW.release_id END;
    IF TG_OP='UPDATE' AND NEW.release_id IS DISTINCT FROM OLD.release_id THEN RAISE EXCEPTION 'Cross-release row move forbidden'; END IF;
    SELECT state INTO current_state FROM content.releases WHERE release_id=target FOR UPDATE;
    IF TG_OP='DELETE' AND current_state='pruned' THEN RETURN OLD; END IF;
    IF current_state IS DISTINCT FROM 'building' THEN RAISE EXCEPTION 'Only a building release can accept row writes'; END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION content.require_finalized() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM content.releases WHERE release_id=NEW.release_id AND state='building') THEN RAISE EXCEPTION 'Building release cannot be committed'; END IF;
    RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION content.store_release(op_id uuid, qtext text, ftext text, source_hashes jsonb, who text, why text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $_$
DECLARE outcome jsonb; revisions jsonb; existing content.releases; target uuid; q jsonb; f jsonb;
BEGIN
    IF NOT content.fields(source_hashes,ARRAY['quiz','flashcard']) OR NOT content.text_fields(source_hashes,ARRAY['quiz','flashcard']) OR
       source_hashes->>'quiz' !~ '^[0-9a-f]{64}$' OR source_hashes->>'flashcard' !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid captured source hashes'; END IF;
    revisions:=content.checked_artifacts(qtext,ftext); q:=qtext::jsonb; f:=ftext::jsonb;
    outcome:=content.claim_operation(op_id,'store',jsonb_build_object('quiz',qtext,'flashcard',ftext,'hashes',source_hashes),who,why);
    IF outcome IS NOT NULL THEN RETURN outcome; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended((revisions->>'quiz_revision')||(revisions->>'flashcard_revision'),0));
    SELECT * INTO existing FROM content.releases WHERE quiz_revision=revisions->>'quiz_revision' AND flashcard_revision=revisions->>'flashcard_revision' AND state<>'pruned' ORDER BY created_at,release_id LIMIT 1;
    IF FOUND THEN
        IF existing.state<>'finalized' OR existing.quiz_artifact<>qtext OR existing.flashcard_artifact<>ftext THEN RAISE EXCEPTION 'Digest collision or incomplete release'; END IF;
        PERFORM content.validate_release(existing); target:=existing.release_id;
    ELSE
        INSERT INTO content.releases(state,quiz_revision,flashcard_revision,quiz_artifact,flashcard_artifact,originating_operation_id)
            VALUES('building',revisions->>'quiz_revision',revisions->>'flashcard_revision',qtext,ftext,op_id) RETURNING release_id INTO target;
        INSERT INTO content.subjects(release_id,id,position,name,accent,description) SELECT target,v->>'id',n-1,v->>'name',v->>'accent',v->>'description' FROM jsonb_array_elements(q->'subjects') WITH ORDINALITY e(v,n);
        INSERT INTO content.topics(release_id,id,position,subject_id,name,description) SELECT target,v->>'id',n-1,v->>'subjectId',v->>'name',v->>'description' FROM jsonb_array_elements(q->'topics') WITH ORDINALITY e(v,n);
        INSERT INTO content.quizzes(release_id,id,position,topic_id,name,description) SELECT target,v->>'id',n-1,v->>'topicId',v->>'name',v->>'description' FROM jsonb_array_elements(q->'quizzes') WITH ORDINALITY e(v,n);
        INSERT INTO content.questions(release_id,id,position,quiz_id,stem,choices,answer,rationale,rationale_meta,pearls,metadata)
            SELECT target,v->>'id',n-1,v->>'quizId',v->>'stem',v->'choices',v->>'answer',v->>'rationale',v->'rationaleMeta',v->'pearls',v->'metadata' FROM jsonb_array_elements(q->'questions') WITH ORDINALITY e(v,n);
        INSERT INTO content.decks(release_id,id,position,topic_id,name,description) SELECT target,v->>'id',n-1,v->>'topicId',v->>'name',v->>'description' FROM jsonb_array_elements(f->'decks') WITH ORDINALITY e(v,n);
        INSERT INTO content.flashcards(release_id,id,position,deck_id,front,back,sources) SELECT target,v->>'id',n-1,v->>'deckId',v->>'front',v->>'back',v->>'sources' FROM jsonb_array_elements(f->'cards') WITH ORDINALITY e(v,n);
        UPDATE content.releases SET state='finalized',finalized_at=clock_timestamp() WHERE release_id=target;
    END IF;
    INSERT INTO content.import_events(operation_id,release_id,quiz_source_sha256,flashcard_source_sha256,actor,reason) VALUES(op_id,target,source_hashes->>'quiz',source_hashes->>'flashcard',who,why);
    RETURN content.finish_operation(op_id,jsonb_build_object('release_id',target)||revisions,target);
END $_$;

-- Keep the active release, the draft's base and the `keep` most recently active current-schema releases.
CREATE FUNCTION content.prune_releases(keep integer) RETURNS integer
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
        UPDATE content.releases SET state='pruned',quiz_artifact=NULL,flashcard_artifact=NULL
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
REVOKE ALL ON FUNCTION content.prune_releases(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION content.prune_releases(integer) TO meducation_operator, meducation_editor;

SELECT content.prune_releases(1);
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(SQL)


def downgrade() -> None:
    raise RuntimeError("Content downgrade is unsupported; restore a separate database.")
