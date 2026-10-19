-- One answer per question: quiz schema v6, flashcard schema v4. Verified answers,
-- answer and review notes, rationale provenance, choice explanations and card review
-- notes are removed. Earlier releases stay readable as history but can no longer be
-- activated. Questions whose answer key was under review are deleted from the draft.

-- Release rows -------------------------------------------------------------------
-- Old release columns stay so earlier releases keep their exact rows.
ALTER TABLE content.releases
    DROP CONSTRAINT releases_quiz_schema_version_check,
    DROP CONSTRAINT releases_flashcard_schema_version_check,
    ADD CHECK (quiz_schema_version IN (4, 5, 6)),
    ADD CHECK (flashcard_schema_version IN (2, 3, 4)),
    ALTER quiz_schema_version SET DEFAULT 6,
    ALTER flashcard_schema_version SET DEFAULT 4;

CREATE OR REPLACE FUNCTION content.release_documents(target uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, content, pg_temp AS $$
SELECT jsonb_build_array(
    jsonb_build_object('schemaVersion',6,
      'subjects',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'accent',accent) || jsonb_strip_nulls(jsonb_build_object('description',description)) ORDER BY position) FROM content.subjects WHERE release_id=target),'[]'),
      'topics',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'subjectId',subject_id,'name',name) || jsonb_strip_nulls(jsonb_build_object('description',description)) ORDER BY position) FROM content.topics WHERE release_id=target),'[]'),
      'quizzes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'topicId',topic_id,'name',name) || jsonb_strip_nulls(jsonb_build_object('description',description)) ORDER BY position) FROM content.quizzes WHERE release_id=target),'[]'),
      'questions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'quizId',quiz_id,'stem',stem,'choices',choices,'answer',answer,'rationale',rationale) ||
          jsonb_strip_nulls(jsonb_build_object('rationaleMeta',rationale_meta,'pearls',pearls,'metadata',metadata)) ORDER BY position)
          FROM content.questions WHERE release_id=target),'[]')),
    jsonb_build_object('schemaVersion',4,
      'decks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'topicId',topic_id,'name',name) || jsonb_strip_nulls(jsonb_build_object('description',description)) ORDER BY position) FROM content.decks WHERE release_id=target),'[]'),
      'cards',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'deckId',deck_id,'front',front,'back',back) || jsonb_strip_nulls(jsonb_build_object('sources',sources)) ORDER BY position) FROM content.flashcards WHERE release_id=target),'[]')))
$$;

-- The flashcard API serves subjects and topics, so their descriptions join the
-- flashcard revision; absent descriptions keep earlier digests unchanged.
CREATE OR REPLACE FUNCTION content.checked_artifacts(qtext text, ftext text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE q json; f json; subjects text; topics text;
BEGIN
    q := qtext::json; f := ftext::json;
    IF qtext IS NULL OR ftext IS NULL OR NOT content.json_clean(q) OR NOT content.json_clean(f) OR
       (q->'schemaVersion')::text IS DISTINCT FROM '6' OR (f->'schemaVersion')::text IS DISTINCT FROM '4' OR
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
        INSERT INTO content.questions(release_id,id,position,quiz_id,stem,choices,answer,rationale,rationale_meta,pearls,metadata)
            SELECT target,v->>'id',n-1,v->>'quizId',v->>'stem',v->'choices',v->>'answer',v->>'rationale',v->'rationaleMeta',v->'pearls',v->'metadata' FROM jsonb_array_elements(q->'questions') WITH ORDINALITY e(v,n);
        INSERT INTO content.decks(release_id,id,position,topic_id,name,description) SELECT target,v->>'id',n-1,v->>'topicId',v->>'name',v->>'description' FROM jsonb_array_elements(f->'decks') WITH ORDINALITY e(v,n);
        INSERT INTO content.flashcards(release_id,id,position,deck_id,front,back,sources) SELECT target,v->>'id',n-1,v->>'deckId',v->>'front',v->>'back',v->>'sources' FROM jsonb_array_elements(f->'cards') WITH ORDINALITY e(v,n);
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
    IF NOT EXISTS(SELECT 1 FROM content.releases WHERE release_id=target AND state='finalized' AND quiz_schema_version=6 AND flashcard_schema_version=4) THEN RAISE EXCEPTION 'Release is not finalized at the current schema'; END IF;
    INSERT INTO content.publication_events(release_id,prior_sequence,operation_id,actor,reason) VALUES(target,prior,op_id,who,why) RETURNING publication_sequence INTO new_sequence;
    UPDATE content.active_publication SET release_id=target,publication_sequence=new_sequence;
    RETURN content.finish_operation(op_id,jsonb_build_object('release_id',target,'publication_sequence',new_sequence),target);
END $$;

-- Draft rows ---------------------------------------------------------------------
-- An answer under review is not graded today; without the note it would be.
DELETE FROM content.draft_questions WHERE rationale_meta::jsonb ? 'answerReviewNote';

-- Changed records get a new version so editors holding the old one must reload.
UPDATE content.draft_questions SET
    answer = coalesce(verified_answer, answer),
    rationale_meta = CASE WHEN rationale_meta::jsonb ? 'sources'
        THEN json_build_object('sources', rationale_meta->>'sources') END,
    field_order = array_remove(array_remove(array_remove(field_order, 'verifiedAnswer'), 'answerNote'), 'choiceExplanations'),
    version = version + 1
WHERE verified_answer IS NOT NULL OR answer_note IS NOT NULL OR choice_explanations IS NOT NULL
   OR (rationale_meta IS NOT NULL AND rationale_meta::jsonb - 'sources' <> '{}'::jsonb)
   OR field_order && ARRAY['verifiedAnswer', 'answerNote', 'choiceExplanations'];
ALTER TABLE content.draft_questions
    DROP COLUMN verified_answer, DROP COLUMN answer_note, DROP COLUMN choice_explanations,
    ALTER answer SET NOT NULL;

UPDATE content.draft_flashcards SET field_order = array_remove(field_order, 'reviewNote'), version = version + 1
WHERE review_note IS NOT NULL OR 'reviewNote' = ANY(field_order);
ALTER TABLE content.draft_flashcards DROP COLUMN review_note;
