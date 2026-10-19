-- Optional plain-text descriptions on subjects, topics and quizzes, as decks have.
-- Absent descriptions stay omitted from artifacts, so earlier releases still validate.

ALTER TABLE content.subjects ADD description text;
ALTER TABLE content.topics ADD description text;
ALTER TABLE content.quizzes ADD description text;
ALTER TABLE content.draft_subjects ADD description text;
ALTER TABLE content.draft_topics ADD description text;
ALTER TABLE content.draft_quizzes ADD description text;

-- e.* views fix their column list at creation; recreate them to expose description.
CREATE OR REPLACE VIEW content.published_subjects WITH (security_barrier=true) AS SELECT e.* FROM content.subjects e JOIN content.releases r USING(release_id) WHERE r.state='finalized';
CREATE OR REPLACE VIEW content.published_topics WITH (security_barrier=true) AS SELECT e.* FROM content.topics e JOIN content.releases r USING(release_id) WHERE r.state='finalized';
CREATE OR REPLACE VIEW content.published_quizzes WITH (security_barrier=true) AS SELECT e.* FROM content.quizzes e JOIN content.releases r USING(release_id) WHERE r.state='finalized';

CREATE OR REPLACE FUNCTION content.release_documents(target uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, content, pg_temp AS $$
SELECT jsonb_build_array(
    jsonb_build_object('schemaVersion',5,
      'subjects',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'accent',accent) || jsonb_strip_nulls(jsonb_build_object('description',description)) ORDER BY position) FROM content.subjects WHERE release_id=target),'[]'),
      'topics',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'subjectId',subject_id,'name',name) || jsonb_strip_nulls(jsonb_build_object('description',description)) ORDER BY position) FROM content.topics WHERE release_id=target),'[]'),
      'quizzes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'topicId',topic_id,'name',name) || jsonb_strip_nulls(jsonb_build_object('description',description)) ORDER BY position) FROM content.quizzes WHERE release_id=target),'[]'),
      'questions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'quizId',quiz_id,'stem',stem,'choices',choices,'rationale',rationale) ||
          jsonb_strip_nulls(jsonb_build_object('answer',answer,'verifiedAnswer',verified_answer,'answerNote',answer_note,'rationaleMeta',rationale_meta,'choiceExplanations',choice_explanations,'pearls',pearls,'metadata',metadata)) ORDER BY position)
          FROM content.questions WHERE release_id=target),'[]')),
    jsonb_build_object('schemaVersion',3,
      'decks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'topicId',topic_id,'name',name) || jsonb_strip_nulls(jsonb_build_object('description',description)) ORDER BY position) FROM content.decks WHERE release_id=target),'[]'),
      'cards',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'deckId',deck_id,'front',front,'back',back) || jsonb_strip_nulls(jsonb_build_object('sources',sources,'reviewNote',review_note)) ORDER BY position) FROM content.flashcards WHERE release_id=target),'[]')))
$$;

-- The flashcard API serves subjects and topics, so their descriptions join the
-- flashcard revision; absent descriptions keep earlier digests unchanged.
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
    SELECT '[' || coalesce(string_agg('{"id":' || to_json(v->>'id')::text || ',"name":' || to_json(v->>'name')::text || ',"accent":' || to_json(v->>'accent')::text || coalesce(',"description":' || to_json(v->>'description')::text, '') || '}', ',' ORDER BY n), '') || ']'
        INTO subjects FROM json_array_elements(q->'subjects') WITH ORDINALITY e(v,n);
    SELECT '[' || coalesce(string_agg('{"id":' || to_json(v->>'id')::text || ',"subjectId":' || to_json(v->>'subjectId')::text || ',"name":' || to_json(v->>'name')::text || coalesce(',"description":' || to_json(v->>'description')::text, '') || '}', ',' ORDER BY n), '') || ']'
        INTO topics FROM json_array_elements(q->'topics') WITH ORDINALITY e(v,n);
    RETURN jsonb_build_object('quiz_revision','sha256-' || encode(sha256(convert_to(qtext,'UTF8')),'hex'),
        'flashcard_revision','sha256-' || encode(sha256(convert_to(E'flashcards-v3\n' || subjects || E'\n' || topics || E'\n' || ftext,'UTF8')),'hex'));
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
        INSERT INTO content.subjects(release_id,id,position,name,accent,description) SELECT target,v->>'id',n-1,v->>'name',v->>'accent',v->>'description' FROM jsonb_array_elements(q->'subjects') WITH ORDINALITY e(v,n);
        INSERT INTO content.topics(release_id,id,position,subject_id,name,description) SELECT target,v->>'id',n-1,v->>'subjectId',v->>'name',v->>'description' FROM jsonb_array_elements(q->'topics') WITH ORDINALITY e(v,n);
        INSERT INTO content.quizzes(release_id,id,position,topic_id,name,description) SELECT target,v->>'id',n-1,v->>'topicId',v->>'name',v->>'description' FROM jsonb_array_elements(q->'quizzes') WITH ORDINALITY e(v,n);
        INSERT INTO content.questions(release_id,id,position,quiz_id,stem,choices,answer,verified_answer,answer_note,rationale,rationale_meta,choice_explanations,pearls,metadata)
            SELECT target,v->>'id',n-1,v->>'quizId',v->>'stem',v->'choices',v->>'answer',v->>'verifiedAnswer',v->>'answerNote',v->>'rationale',v->'rationaleMeta',v->'choiceExplanations',v->'pearls',v->'metadata' FROM jsonb_array_elements(q->'questions') WITH ORDINALITY e(v,n);
        INSERT INTO content.decks(release_id,id,position,topic_id,name,description) SELECT target,v->>'id',n-1,v->>'topicId',v->>'name',v->>'description' FROM jsonb_array_elements(f->'decks') WITH ORDINALITY e(v,n);
        INSERT INTO content.flashcards(release_id,id,position,deck_id,front,back,sources,review_note) SELECT target,v->>'id',n-1,v->>'deckId',v->>'front',v->>'back',v->>'sources',v->>'reviewNote' FROM jsonb_array_elements(f->'cards') WITH ORDINALITY e(v,n);
        UPDATE content.releases SET state='finalized',finalized_at=clock_timestamp() WHERE release_id=target;
    END IF;
    INSERT INTO content.import_events(operation_id,release_id,quiz_source_sha256,flashcard_source_sha256,actor,reason) VALUES(op_id,target,source_hashes->>'quiz',source_hashes->>'flashcard',who,why);
    RETURN content.finish_operation(op_id,jsonb_build_object('release_id',target)||revisions,target);
END $$;
