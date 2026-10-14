-- Application rich-content validation precedes this trusted operator boundary.
-- No public/editor role is enabled here; authentication remains a separate gate.
ALTER TABLE content.releases DROP CONSTRAINT releases_quiz_revision_flashcard_revision_key;
CREATE INDEX releases_content_digests ON content.releases(quiz_revision,flashcard_revision,created_at,release_id);

CREATE TABLE content.authored_events (
    operation_id uuid PRIMARY KEY REFERENCES content.operations ON DELETE RESTRICT,
    release_id uuid NOT NULL UNIQUE REFERENCES content.releases ON DELETE RESTRICT,
    captured_draft_revision bigint NOT NULL CHECK (captured_draft_revision >= 0),
    base_publication_sequence bigint NOT NULL CHECK (base_publication_sequence >= 0),
    validation_policy_version integer NOT NULL CHECK (validation_policy_version > 0),
    preview_fingerprint text NOT NULL CHECK (preview_fingerprint ~ '^[0-9a-f]{64}$'),
    actor text NOT NULL, reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER authored_immutable BEFORE UPDATE OR DELETE ON content.authored_events FOR EACH ROW EXECUTE FUNCTION content.append_only();
GRANT SELECT ON content.authored_events TO meducation_operator,meducation_backup;

CREATE FUNCTION content.authored_publish_payload(qtext text, ftext text, expected_draft bigint, expected_publication bigint, policy_version integer, preview text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, content, pg_temp AS $$
    SELECT jsonb_build_object('quiz',qtext,'flashcard',ftext,'expectedDraftRevision',expected_draft,
        'expectedPublicationSequence',expected_publication,'validationPolicyVersion',policy_version,'previewFingerprint',preview)
$$;
CREATE FUNCTION content.authored_publish_result(op_id uuid, qtext text, ftext text, expected_draft bigint, expected_publication bigint, policy_version integer, preview text, who text, why text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE existing content.operations; signature text;
BEGIN
    SELECT * INTO existing FROM content.operations WHERE operation_id=op_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    signature := encode(sha256(convert_to(jsonb_build_object('action','publish','payload',content.authored_publish_payload(qtext,ftext,expected_draft,expected_publication,policy_version,preview),'actor',who,'reason',why)::text,'UTF8')),'hex');
    IF existing.action<>'publish' OR existing.fingerprint<>signature THEN RAISE EXCEPTION 'Operation ID reused with different intent'; END IF;
    RETURN existing.result;
END $$;
CREATE FUNCTION content.publish_draft(op_id uuid, qtext text, ftext text, expected_draft bigint, expected_publication bigint, policy_version integer, preview text, who text, why text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE outcome jsonb; captured content.draft; active content.active_publication;
    revisions jsonb; target uuid; new_sequence bigint; q jsonb; f jsonb;
BEGIN
    IF policy_version IS NULL OR policy_version<1 OR preview IS NULL OR preview !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid validation context'; END IF;
    outcome := content.claim_operation(op_id,'publish',content.authored_publish_payload(qtext,ftext,expected_draft,expected_publication,policy_version,preview),who,why);
    IF outcome IS NOT NULL THEN RETURN outcome; END IF;
    -- Lock order agrees with draft writes: draft, publication, then ID counters.
    SELECT * INTO STRICT captured FROM content.draft FOR UPDATE;
    SELECT * INTO STRICT active FROM content.active_publication FOR UPDATE;
    IF expected_draft IS NULL OR expected_publication IS NULL OR
       captured.revision<>expected_draft OR active.publication_sequence<>expected_publication OR
       captured.base_publication_sequence<>active.publication_sequence OR
       captured.base_release_id IS DISTINCT FROM active.release_id THEN RAISE EXCEPTION 'Draft/publication context is stale'; END IF;
    IF captured.quiz_document IS DISTINCT FROM qtext OR captured.flashcard_document IS DISTINCT FROM ftext THEN RAISE EXCEPTION 'Captured draft differs from validated content'; END IF;
    revisions := content.checked_artifacts(qtext,ftext); q:=qtext::jsonb; f:=ftext::jsonb;
    -- Saved identities only: authored publication never registers unseen IDs.
    PERFORM content.register_ids(q,f,'{}',false);
    -- Every authored event receives a distinct immutable release, even identical content.
    INSERT INTO content.releases(state,quiz_revision,flashcard_revision,quiz_artifact,flashcard_artifact,originating_operation_id)
        VALUES('building',revisions->>'quiz_revision',revisions->>'flashcard_revision',qtext,ftext,op_id) RETURNING release_id INTO target;
    INSERT INTO content.subjects(release_id,id,position,name,accent) SELECT target,v->>'id',n-1,v->>'name',v->>'accent' FROM jsonb_array_elements(q->'subjects') WITH ORDINALITY e(v,n);
    INSERT INTO content.quizzes(release_id,id,position,subject_id,name) SELECT target,v->>'id',n-1,v->>'subjectId',v->>'name' FROM jsonb_array_elements(q->'quizzes') WITH ORDINALITY e(v,n);
    INSERT INTO content.questions(release_id,id,position,quiz_id,stem,choices,answer,verified_answer,answer_note,rationale,rationale_meta,choice_explanations,pearls,metadata)
        SELECT target,v->>'id',n-1,v->>'quizId',v->>'stem',v->'choices',v->>'answer',v->>'verifiedAnswer',v->>'answerNote',v->>'rationale',v->'rationaleMeta',v->'choiceExplanations',v->'pearls',v->'metadata' FROM jsonb_array_elements(q->'questions') WITH ORDINALITY e(v,n);
    INSERT INTO content.decks(release_id,id,position,subject_id,name,description) SELECT target,v->>'id',n-1,v->>'subjectId',v->>'name',v->>'description' FROM jsonb_array_elements(f->'decks') WITH ORDINALITY e(v,n);
    INSERT INTO content.flashcards(release_id,id,position,deck_id,front,back,sources,review_note) SELECT target,v->>'id',n-1,v->>'deckId',v->>'front',v->>'back',v->>'sources',v->>'reviewNote' FROM jsonb_array_elements(f->'cards') WITH ORDINALITY e(v,n);
    UPDATE content.releases SET state='finalized',finalized_at=clock_timestamp() WHERE release_id=target;
    INSERT INTO content.authored_events(operation_id,release_id,captured_draft_revision,base_publication_sequence,validation_policy_version,preview_fingerprint,actor,reason)
        VALUES(op_id,target,captured.revision,captured.base_publication_sequence,policy_version,preview,who,why);
    INSERT INTO content.publication_events(release_id,prior_sequence,operation_id,actor,reason)
        VALUES(target,active.publication_sequence,op_id,who,why) RETURNING publication_sequence INTO new_sequence;
    UPDATE content.active_publication SET release_id=target,publication_sequence=new_sequence;
    UPDATE content.draft SET base_release_id=target,base_publication_sequence=new_sequence,revision=revision+1,updated_at=clock_timestamp();
    RETURN content.finish_operation(op_id,jsonb_build_object('release_id',target,'publication_sequence',new_sequence,'draft_revision',captured.revision+1)||revisions,target,captured.revision+1);
END $$;
REVOKE ALL ON FUNCTION content.authored_publish_payload(text,text,bigint,bigint,integer,text),content.authored_publish_result(uuid,text,text,bigint,bigint,integer,text,text,text),content.publish_draft(uuid,text,text,bigint,bigint,integer,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION content.authored_publish_result(uuid,text,text,bigint,bigint,integer,text,text,text),content.publish_draft(uuid,text,text,bigint,bigint,integer,text,text,text) TO meducation_operator;

CREATE FUNCTION content.reviewed_save_payload(qtext text, ftext text, expected_draft bigint, expected_publication bigint, base_sequence bigint, policy_version integer, preview text, reservations uuid[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, content, pg_temp AS $$
    SELECT jsonb_build_object('quiz',qtext,'flashcard',ftext,'expectedDraftRevision',expected_draft,
        'expectedPublicationSequence',expected_publication,'basePublicationSequence',base_sequence,
        'validationPolicyVersion',policy_version,'previewFingerprint',preview,'reservations',reservations)
$$;
CREATE FUNCTION content.reviewed_save_result(op_id uuid, qtext text, ftext text, expected_draft bigint, expected_publication bigint, base_sequence bigint, policy_version integer, preview text, reservations uuid[], who text, why text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE existing content.operations; signature text;
BEGIN
    SELECT * INTO existing FROM content.operations WHERE operation_id=op_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    signature := encode(sha256(convert_to(jsonb_build_object('action','save','payload',content.reviewed_save_payload(qtext,ftext,expected_draft,expected_publication,base_sequence,policy_version,preview,reservations),'actor',who,'reason',why)::text,'UTF8')),'hex');
    IF existing.action<>'save' OR existing.fingerprint<>signature THEN RAISE EXCEPTION 'Operation ID reused with different intent'; END IF;
    RETURN existing.result;
END $$;
CREATE FUNCTION content.save_reviewed_draft(op_id uuid, qtext text, ftext text, expected_draft bigint, expected_publication bigint, base_sequence bigint, policy_version integer, preview text, reservations uuid[], who text, why text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE outcome jsonb; captured content.draft; active content.active_publication;
    q jsonb; f jsonb; old_q jsonb; old_f jsonb; k text; records jsonb; prior_records jsonb;
    entity jsonb; registered content.entity_ids;
BEGIN
    IF policy_version IS NULL OR policy_version<1 OR preview IS NULL OR preview !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid validation context'; END IF;
    outcome := content.claim_operation(op_id,'save',content.reviewed_save_payload(qtext,ftext,expected_draft,expected_publication,base_sequence,policy_version,preview,reservations),who,why);
    IF outcome IS NOT NULL THEN RETURN outcome; END IF;
    SELECT * INTO STRICT captured FROM content.draft FOR UPDATE;
    SELECT * INTO STRICT active FROM content.active_publication FOR UPDATE;
    IF expected_draft IS NULL OR expected_publication IS NULL OR base_sequence IS NULL OR
       captured.revision<>expected_draft OR active.publication_sequence<>expected_publication OR
       captured.base_publication_sequence<>base_sequence THEN RAISE EXCEPTION 'Draft/publication context is stale'; END IF;
    PERFORM content.checked_artifacts(qtext,ftext);
    q:=qtext::jsonb; f:=ftext::jsonb; old_q:=captured.quiz_document::jsonb; old_f:=captured.flashcard_document::jsonb;
    IF reservations IS NULL OR cardinality(reservations)>10000 OR
       EXISTS(SELECT 1 FROM unnest(reservations) r LEFT JOIN content.operations o ON o.operation_id=r WHERE o.actor IS DISTINCT FROM who OR o.action IS DISTINCT FROM 'reserve') THEN RAISE EXCEPTION 'Reservation is not owned'; END IF;
    FOREACH k IN ARRAY ARRAY['s','q','i','d','f'] LOOP
        records := CASE k WHEN 's' THEN q->'subjects' WHEN 'q' THEN q->'quizzes' WHEN 'i' THEN q->'questions' WHEN 'd' THEN f->'decks' ELSE f->'cards' END;
        prior_records := CASE k WHEN 's' THEN old_q->'subjects' WHEN 'q' THEN old_q->'quizzes' WHEN 'i' THEN old_q->'questions' WHEN 'd' THEN old_f->'decks' ELSE old_f->'cards' END;
        FOR entity IN SELECT n.value FROM jsonb_array_elements(records) n(value)
            LEFT JOIN jsonb_array_elements(prior_records) old(value) ON old.value->>'id'=n.value->>'id'
            WHERE old.value IS NULL LOOP
            SELECT * INTO registered FROM content.entity_ids WHERE kind=k AND id=entity->>'id';
            IF NOT FOUND OR registered.materialized OR NOT coalesce(registered.allocation_operation_id=ANY(reservations),false) THEN RAISE EXCEPTION 'Creates require owned reservations; historical resurrection is not an ordinary save'; END IF;
        END LOOP;
    END LOOP;
    PERFORM content.register_ids(q,f,reservations,false);
    UPDATE content.draft SET quiz_document=qtext,flashcard_document=ftext,revision=revision+1,updated_at=clock_timestamp();
    RETURN content.finish_operation(op_id,jsonb_build_object('draft_revision',captured.revision+1),NULL,captured.revision+1);
END $$;
REVOKE ALL ON FUNCTION content.reviewed_save_payload(text,text,bigint,bigint,bigint,integer,text,uuid[]),content.reviewed_save_result(uuid,text,text,bigint,bigint,bigint,integer,text,uuid[],text,text),content.save_reviewed_draft(uuid,text,text,bigint,bigint,bigint,integer,text,uuid[],text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION content.reviewed_save_result(uuid,text,text,bigint,bigint,bigint,integer,text,uuid[],text,text),content.save_reviewed_draft(uuid,text,text,bigint,bigint,bigint,integer,text,uuid[],text,text) TO meducation_operator;
