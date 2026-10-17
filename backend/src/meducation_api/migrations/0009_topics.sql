-- Topics sit between subjects and quizzes/decks: quiz schema v5, flashcard schema v3.
-- Earlier v4/v2 releases stay readable as history but can no longer be activated.

-- Release rows -------------------------------------------------------------------
ALTER TABLE content.releases
    DROP CONSTRAINT releases_quiz_schema_version_check,
    DROP CONSTRAINT releases_flashcard_schema_version_check,
    ADD CHECK (quiz_schema_version IN (4, 5)),
    ADD CHECK (flashcard_schema_version IN (2, 3)),
    ALTER quiz_schema_version SET DEFAULT 5,
    ALTER flashcard_schema_version SET DEFAULT 3;

CREATE TABLE content.topics (
    release_id uuid NOT NULL REFERENCES content.releases ON DELETE RESTRICT,
    id text NOT NULL CHECK (id ~ '^t[1-9][0-9]*$'),
    position integer NOT NULL CHECK (position >= 0),
    subject_id text NOT NULL, name text NOT NULL CHECK (content.nonblank(name)),
    PRIMARY KEY (release_id, id), UNIQUE (release_id, position),
    FOREIGN KEY (release_id, subject_id) REFERENCES content.subjects ON DELETE RESTRICT
);
CREATE INDEX ON content.topics (release_id, subject_id, position);
CREATE TRIGGER topic_guard BEFORE INSERT OR UPDATE OR DELETE ON content.topics FOR EACH ROW EXECUTE FUNCTION content.guard_content_row();

-- v4/v2 rows keep subject_id; v5/v3 rows use topic_id.
ALTER TABLE content.quizzes ALTER subject_id DROP NOT NULL, ADD topic_id text,
    ADD FOREIGN KEY (release_id, topic_id) REFERENCES content.topics ON DELETE RESTRICT,
    ADD CHECK (num_nonnulls(subject_id, topic_id) = 1);
ALTER TABLE content.decks ALTER subject_id DROP NOT NULL, ADD topic_id text,
    ADD FOREIGN KEY (release_id, topic_id) REFERENCES content.topics ON DELETE RESTRICT,
    ADD CHECK (num_nonnulls(subject_id, topic_id) = 1);
CREATE INDEX ON content.quizzes (release_id, topic_id, position);
CREATE INDEX ON content.decks (release_id, topic_id, position);

-- e.* views fix their column list at creation; recreate them to expose topic_id.
CREATE OR REPLACE VIEW content.published_quizzes WITH (security_barrier=true) AS SELECT e.* FROM content.quizzes e JOIN content.releases r USING(release_id) WHERE r.state='finalized';
CREATE OR REPLACE VIEW content.published_decks WITH (security_barrier=true) AS SELECT e.* FROM content.decks e JOIN content.releases r USING(release_id) WHERE r.state='finalized';
CREATE VIEW content.published_topics WITH (security_barrier=true) AS SELECT e.* FROM content.topics e JOIN content.releases r USING(release_id) WHERE r.state='finalized';

CREATE OR REPLACE FUNCTION content.release_documents(target uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, content, pg_temp AS $$
SELECT jsonb_build_array(
    jsonb_build_object('schemaVersion',5,
      'subjects',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'accent',accent) ORDER BY position) FROM content.subjects WHERE release_id=target),'[]'),
      'topics',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'subjectId',subject_id,'name',name) ORDER BY position) FROM content.topics WHERE release_id=target),'[]'),
      'quizzes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'topicId',topic_id,'name',name) ORDER BY position) FROM content.quizzes WHERE release_id=target),'[]'),
      'questions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'quizId',quiz_id,'stem',stem,'choices',choices,'rationale',rationale) ||
          jsonb_strip_nulls(jsonb_build_object('answer',answer,'verifiedAnswer',verified_answer,'answerNote',answer_note,'rationaleMeta',rationale_meta,'choiceExplanations',choice_explanations,'pearls',pearls,'metadata',metadata)) ORDER BY position)
          FROM content.questions WHERE release_id=target),'[]')),
    jsonb_build_object('schemaVersion',3,
      'decks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'topicId',topic_id,'name',name) || jsonb_strip_nulls(jsonb_build_object('description',description)) ORDER BY position) FROM content.decks WHERE release_id=target),'[]'),
      'cards',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'deckId',deck_id,'front',front,'back',back) || jsonb_strip_nulls(jsonb_build_object('sources',sources,'reviewNote',review_note)) ORDER BY position) FROM content.flashcards WHERE release_id=target),'[]')))
$$;

-- The flashcard revision covers the subject and topic registry decks hang from.
CREATE OR REPLACE FUNCTION content.checked_artifacts(qtext text, ftext text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE q json; f json; subjects text; topics text;
BEGIN
    q := qtext::json; f := ftext::json;
    IF qtext IS NULL OR ftext IS NULL OR NOT content.json_clean(q) OR NOT content.json_clean(f) OR
       (q->'schemaVersion')::text IS DISTINCT FROM '5' OR (f->'schemaVersion')::text IS DISTINCT FROM '3' OR
       qtext IS DISTINCT FROM content.pretty_json(q) || E'\n' OR ftext IS DISTINCT FROM content.pretty_json(f) || E'\n' THEN
        RAISE EXCEPTION 'Artifacts require canonical serialization, integer versions and unique non-null fields';
    END IF;
    SELECT '[' || coalesce(string_agg('{"id":' || to_json(v->>'id')::text || ',"name":' || to_json(v->>'name')::text || ',"accent":' || to_json(v->>'accent')::text || '}', ',' ORDER BY n), '') || ']'
        INTO subjects FROM json_array_elements(q->'subjects') WITH ORDINALITY e(v,n);
    SELECT '[' || coalesce(string_agg('{"id":' || to_json(v->>'id')::text || ',"subjectId":' || to_json(v->>'subjectId')::text || ',"name":' || to_json(v->>'name')::text || '}', ',' ORDER BY n), '') || ']'
        INTO topics FROM json_array_elements(q->'topics') WITH ORDINALITY e(v,n);
    RETURN jsonb_build_object('quiz_revision','sha256-' || encode(sha256(convert_to(qtext,'UTF8')),'hex'),
        'flashcard_revision','sha256-' || encode(sha256(convert_to(E'flashcards-v3\n' || subjects || E'\n' || topics || E'\n' || ftext,'UTF8')),'hex'));
END $$;

CREATE OR REPLACE FUNCTION content.validate_release(r content.releases) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE docs jsonb; revisions jsonb;
BEGIN
    revisions := content.checked_artifacts(r.quiz_artifact,r.flashcard_artifact);
    docs := content.release_documents(r.release_id);
    IF docs IS DISTINCT FROM jsonb_build_array(r.quiz_artifact::jsonb,r.flashcard_artifact::jsonb) OR
       r.quiz_revision IS DISTINCT FROM revisions->>'quiz_revision' OR
       r.flashcard_revision IS DISTINCT FROM revisions->>'flashcard_revision' THEN RAISE EXCEPTION 'Release rows/artifacts/revisions differ'; END IF;
    IF EXISTS (SELECT 1 FROM (
        SELECT count(*) n,min(position) lo,max(position) hi FROM content.subjects WHERE release_id=r.release_id UNION ALL
        SELECT count(*),min(position),max(position) FROM content.topics WHERE release_id=r.release_id UNION ALL
        SELECT count(*),min(position),max(position) FROM content.quizzes WHERE release_id=r.release_id UNION ALL
        SELECT count(*),min(position),max(position) FROM content.questions WHERE release_id=r.release_id UNION ALL
        SELECT count(*),min(position),max(position) FROM content.decks WHERE release_id=r.release_id UNION ALL
        SELECT count(*),min(position),max(position) FROM content.flashcards WHERE release_id=r.release_id
    ) ordinals WHERE n>0 AND (lo<>0 OR hi<>n-1)) THEN RAISE EXCEPTION 'Noncontiguous collection ordinals'; END IF;
END $$;

CREATE OR REPLACE FUNCTION content.store_release(op_id uuid, qtext text, ftext text, source_hashes jsonb, who text, why text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE outcome jsonb; revisions jsonb; existing content.releases; target uuid; q jsonb; f jsonb;
BEGIN
    IF NOT content.fields(source_hashes,ARRAY['quiz','flashcard']) OR NOT content.text_fields(source_hashes,ARRAY['quiz','flashcard']) OR
       source_hashes->>'quiz' !~ '^[0-9a-f]{64}$' OR source_hashes->>'flashcard' !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid captured source hashes'; END IF;
    revisions:=content.checked_artifacts(qtext,ftext); q:=qtext::jsonb; f:=ftext::jsonb;
    outcome:=content.claim_operation(op_id,'store',jsonb_build_object('quiz',qtext,'flashcard',ftext,'hashes',source_hashes),who,why);
    IF outcome IS NOT NULL THEN RETURN outcome; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended((revisions->>'quiz_revision')||(revisions->>'flashcard_revision'),0));
    SELECT * INTO existing FROM content.releases WHERE quiz_revision=revisions->>'quiz_revision' AND flashcard_revision=revisions->>'flashcard_revision' ORDER BY created_at,release_id LIMIT 1;
    IF FOUND THEN
        IF existing.state<>'finalized' OR existing.quiz_artifact<>qtext OR existing.flashcard_artifact<>ftext THEN RAISE EXCEPTION 'Digest collision or incomplete release'; END IF;
        PERFORM content.validate_release(existing); target:=existing.release_id;
    ELSE
        INSERT INTO content.releases(state,quiz_revision,flashcard_revision,quiz_artifact,flashcard_artifact,originating_operation_id)
            VALUES('building',revisions->>'quiz_revision',revisions->>'flashcard_revision',qtext,ftext,op_id) RETURNING release_id INTO target;
        INSERT INTO content.subjects(release_id,id,position,name,accent) SELECT target,v->>'id',n-1,v->>'name',v->>'accent' FROM jsonb_array_elements(q->'subjects') WITH ORDINALITY e(v,n);
        INSERT INTO content.topics(release_id,id,position,subject_id,name) SELECT target,v->>'id',n-1,v->>'subjectId',v->>'name' FROM jsonb_array_elements(q->'topics') WITH ORDINALITY e(v,n);
        INSERT INTO content.quizzes(release_id,id,position,topic_id,name) SELECT target,v->>'id',n-1,v->>'topicId',v->>'name' FROM jsonb_array_elements(q->'quizzes') WITH ORDINALITY e(v,n);
        INSERT INTO content.questions(release_id,id,position,quiz_id,stem,choices,answer,verified_answer,answer_note,rationale,rationale_meta,choice_explanations,pearls,metadata)
            SELECT target,v->>'id',n-1,v->>'quizId',v->>'stem',v->'choices',v->>'answer',v->>'verifiedAnswer',v->>'answerNote',v->>'rationale',v->'rationaleMeta',v->'choiceExplanations',v->'pearls',v->'metadata' FROM jsonb_array_elements(q->'questions') WITH ORDINALITY e(v,n);
        INSERT INTO content.decks(release_id,id,position,topic_id,name,description) SELECT target,v->>'id',n-1,v->>'topicId',v->>'name',v->>'description' FROM jsonb_array_elements(f->'decks') WITH ORDINALITY e(v,n);
        INSERT INTO content.flashcards(release_id,id,position,deck_id,front,back,sources,review_note) SELECT target,v->>'id',n-1,v->>'deckId',v->>'front',v->>'back',v->>'sources',v->>'reviewNote' FROM jsonb_array_elements(f->'cards') WITH ORDINALITY e(v,n);
        UPDATE content.releases SET state='finalized',finalized_at=clock_timestamp() WHERE release_id=target;
    END IF;
    INSERT INTO content.import_events(operation_id,release_id,quiz_source_sha256,flashcard_source_sha256,actor,reason) VALUES(op_id,target,source_hashes->>'quiz',source_hashes->>'flashcard',who,why);
    RETURN content.finish_operation(op_id,jsonb_build_object('release_id',target)||revisions,target);
END $$;

CREATE OR REPLACE FUNCTION content.activate_release(op_id uuid, target uuid, expected_sequence bigint, who text, why text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE outcome jsonb; prior bigint; new_sequence bigint;
BEGIN
    outcome:=content.claim_operation(op_id,'activate',jsonb_build_object('release',target,'expected',expected_sequence),who,why);
    IF outcome IS NOT NULL THEN RETURN outcome; END IF;
    SELECT publication_sequence INTO STRICT prior FROM content.active_publication FOR UPDATE;
    IF expected_sequence IS NULL OR prior<>expected_sequence THEN RAISE EXCEPTION 'Publication precondition is stale'; END IF;
    IF NOT EXISTS(SELECT 1 FROM content.releases WHERE release_id=target AND state='finalized' AND quiz_schema_version=5) THEN RAISE EXCEPTION 'Release is not finalized at the current schema'; END IF;
    INSERT INTO content.publication_events(release_id,prior_sequence,operation_id,actor,reason) VALUES(target,prior,op_id,who,why) RETURNING publication_sequence INTO new_sequence;
    UPDATE content.active_publication SET release_id=target,publication_sequence=new_sequence;
    RETURN content.finish_operation(op_id,jsonb_build_object('release_id',target,'publication_sequence',new_sequence),target);
END $$;

-- Draft rows ---------------------------------------------------------------------
CREATE TABLE content.draft_topics (
    id text PRIMARY KEY CHECK (id ~ '^t[1-9][0-9]*$'),
    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    position numeric NOT NULL UNIQUE,
    field_order text[],
    subject_id text NOT NULL REFERENCES content.draft_subjects ON DELETE RESTRICT,
    name text NOT NULL CHECK (content.nonblank(name))
);
CREATE INDEX ON content.draft_topics (subject_id);
CREATE SEQUENCE content.draft_topic_ids AS bigint MINVALUE 1;

-- Default grouping: one "Practice Tests" topic per subject with quizzes and one
-- "Flashcards" topic per subject with decks. Editors regroup through the editor.
INSERT INTO content.draft_topics(id,position,subject_id,name)
SELECT 't' || n, n - 1, subject_id, name FROM (
    SELECT row_number() OVER (ORDER BY s.position, g.k) n, s.id subject_id, g.name
    FROM content.draft_subjects s CROSS JOIN (VALUES (0, 'Practice Tests'), (1, 'Flashcards')) g(k, name)
    WHERE (g.k = 0 AND EXISTS (SELECT 1 FROM content.draft_quizzes q WHERE q.subject_id = s.id))
       OR (g.k = 1 AND EXISTS (SELECT 1 FROM content.draft_decks d WHERE d.subject_id = s.id))
) grouped;
SELECT setval('content.draft_topic_ids', count(*), true) FROM content.draft_topics HAVING count(*) > 0;

-- Moved records get a new version so editors holding the old one must reload.
ALTER TABLE content.draft_quizzes ADD topic_id text REFERENCES content.draft_topics ON DELETE RESTRICT;
UPDATE content.draft_quizzes q SET topic_id = t.id, version = q.version + 1,
    field_order = array_replace(q.field_order, 'subjectId', 'topicId')
    FROM content.draft_topics t WHERE t.subject_id = q.subject_id AND t.name = 'Practice Tests';
ALTER TABLE content.draft_quizzes ALTER topic_id SET NOT NULL, DROP COLUMN subject_id;
CREATE INDEX ON content.draft_quizzes (topic_id);

ALTER TABLE content.draft_decks ADD topic_id text REFERENCES content.draft_topics ON DELETE RESTRICT;
UPDATE content.draft_decks d SET topic_id = t.id, version = d.version + 1,
    field_order = array_replace(d.field_order, 'subjectId', 'topicId')
    FROM content.draft_topics t WHERE t.subject_id = d.subject_id AND t.name = 'Flashcards';
ALTER TABLE content.draft_decks ALTER topic_id SET NOT NULL, DROP COLUMN subject_id;
CREATE INDEX ON content.draft_decks (topic_id);

ALTER TABLE content.draft_changes DROP CONSTRAINT draft_changes_kind_check,
    ADD CHECK (kind IN ('subjects', 'topics', 'quizzes', 'questions', 'decks', 'cards'));

-- Grants -------------------------------------------------------------------------
GRANT SELECT ON content.topics,content.draft_topics TO meducation_operator,meducation_backup;
GRANT SELECT ON content.published_topics TO meducation_reader;
GRANT SELECT,INSERT,UPDATE,DELETE ON content.draft_topics TO meducation_editor;
GRANT USAGE,SELECT ON SEQUENCE content.draft_topic_ids TO meducation_editor;
GRANT SELECT ON SEQUENCE content.draft_topic_ids TO meducation_backup;
