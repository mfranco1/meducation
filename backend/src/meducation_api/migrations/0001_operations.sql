-- Fixed search paths and explicit grants are the operational write boundary.
CREATE FUNCTION content.release_documents(target uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, content, pg_temp AS $$
SELECT jsonb_build_array(
    jsonb_build_object('schemaVersion',4,
      'subjects',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'accent',accent) ORDER BY position) FROM content.subjects WHERE release_id=target),'[]'),
      'quizzes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'subjectId',subject_id,'name',name) ORDER BY position) FROM content.quizzes WHERE release_id=target),'[]'),
      'questions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'quizId',quiz_id,'stem',stem,'choices',choices,'rationale',rationale) ||
          jsonb_strip_nulls(jsonb_build_object('answer',answer,'verifiedAnswer',verified_answer,'answerNote',answer_note,'rationaleMeta',rationale_meta,'choiceExplanations',choice_explanations,'pearls',pearls,'metadata',metadata)) ORDER BY position)
          FROM content.questions WHERE release_id=target),'[]')),
    jsonb_build_object('schemaVersion',2,
      'decks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'subjectId',subject_id,'name',name) || jsonb_strip_nulls(jsonb_build_object('description',description)) ORDER BY position) FROM content.decks WHERE release_id=target),'[]'),
      'cards',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'deckId',deck_id,'front',front,'back',back) || jsonb_strip_nulls(jsonb_build_object('sources',sources,'reviewNote',review_note)) ORDER BY position) FROM content.flashcards WHERE release_id=target),'[]')))
$$;
CREATE FUNCTION content.checked_artifacts(qtext text, ftext text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE q json; f json; subjects text;
BEGIN
    q := qtext::json; f := ftext::json;
    IF qtext IS NULL OR ftext IS NULL OR NOT content.json_clean(q) OR NOT content.json_clean(f) OR
       (q->'schemaVersion')::text IS DISTINCT FROM '4' OR (f->'schemaVersion')::text IS DISTINCT FROM '2' OR
       qtext IS DISTINCT FROM content.pretty_json(q) || E'\n' OR ftext IS DISTINCT FROM content.pretty_json(f) || E'\n' THEN
        RAISE EXCEPTION 'Artifacts require canonical serialization, integer versions and unique non-null fields';
    END IF;
    PERFORM content.validate_pair(q::jsonb, f::jsonb);
    SELECT '[' || coalesce(string_agg('{"id":' || to_json(v->>'id')::text || ',"name":' || to_json(v->>'name')::text || ',"accent":' || to_json(v->>'accent')::text || '}', ',' ORDER BY n), '') || ']'
        INTO subjects FROM json_array_elements(q->'subjects') WITH ORDINALITY e(v,n);
    RETURN jsonb_build_object('quiz_revision','sha256-' || encode(sha256(convert_to(qtext,'UTF8')),'hex'),
        'flashcard_revision','sha256-' || encode(sha256(convert_to(E'flashcards-v2\n' || subjects || E'\n' || ftext,'UTF8')),'hex'));
END $$;
CREATE FUNCTION content.validate_release(r content.releases) RETURNS void
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
        SELECT count(*),min(position),max(position) FROM content.quizzes WHERE release_id=r.release_id UNION ALL
        SELECT count(*),min(position),max(position) FROM content.questions WHERE release_id=r.release_id UNION ALL
        SELECT count(*),min(position),max(position) FROM content.decks WHERE release_id=r.release_id UNION ALL
        SELECT count(*),min(position),max(position) FROM content.flashcards WHERE release_id=r.release_id
    ) ordinals WHERE n>0 AND (lo<>0 OR hi<>n-1)) THEN RAISE EXCEPTION 'Noncontiguous collection ordinals'; END IF;
END $$;
CREATE FUNCTION content.guard_release() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, content, pg_temp AS $$
BEGIN
    IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.state='finalized') THEN RAISE EXCEPTION 'Finalized releases cannot be changed or deleted'; END IF;
    IF TG_OP='INSERT' AND NEW.state<>'building' THEN RAISE EXCEPTION 'Release must be built transactionally'; END IF;
    IF TG_OP='UPDATE' AND NEW.release_id IS DISTINCT FROM OLD.release_id THEN RAISE EXCEPTION 'Release identity is immutable'; END IF;
    IF NEW.state='finalized' THEN PERFORM content.validate_release(NEW); END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER release_guard BEFORE INSERT OR UPDATE OR DELETE ON content.releases FOR EACH ROW EXECUTE FUNCTION content.guard_release();
CREATE FUNCTION content.guard_content_row() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE target uuid; current_state text;
BEGIN
    target := CASE WHEN TG_OP='DELETE' THEN OLD.release_id ELSE NEW.release_id END;
    IF TG_OP='UPDATE' AND NEW.release_id IS DISTINCT FROM OLD.release_id THEN RAISE EXCEPTION 'Cross-release row move forbidden'; END IF;
    SELECT state INTO current_state FROM content.releases WHERE release_id=target FOR UPDATE;
    IF current_state IS DISTINCT FROM 'building' THEN RAISE EXCEPTION 'Only a building release can accept row writes'; END IF;
    IF TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM content.entity_ids WHERE kind=NEW.kind AND id=NEW.id AND materialized) THEN RAISE EXCEPTION 'Content row requires an established identity'; END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER subject_guard BEFORE INSERT OR UPDATE OR DELETE ON content.subjects FOR EACH ROW EXECUTE FUNCTION content.guard_content_row();
CREATE TRIGGER quiz_guard BEFORE INSERT OR UPDATE OR DELETE ON content.quizzes FOR EACH ROW EXECUTE FUNCTION content.guard_content_row();
CREATE TRIGGER question_guard BEFORE INSERT OR UPDATE OR DELETE ON content.questions FOR EACH ROW EXECUTE FUNCTION content.guard_content_row();
CREATE TRIGGER deck_guard BEFORE INSERT OR UPDATE OR DELETE ON content.decks FOR EACH ROW EXECUTE FUNCTION content.guard_content_row();
CREATE TRIGGER card_guard BEFORE INSERT OR UPDATE OR DELETE ON content.flashcards FOR EACH ROW EXECUTE FUNCTION content.guard_content_row();
CREATE FUNCTION content.require_finalized() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, content, pg_temp AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM content.releases WHERE release_id=NEW.release_id AND state<>'finalized') THEN RAISE EXCEPTION 'Building release cannot be committed'; END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER release_complete AFTER INSERT OR UPDATE ON content.releases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION content.require_finalized();
CREATE FUNCTION content.append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, content, pg_temp AS $$
BEGIN RAISE EXCEPTION 'History is append-only'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON content.audit_events FOR EACH ROW EXECUTE FUNCTION content.append_only();
CREATE TRIGGER import_immutable BEFORE UPDATE OR DELETE ON content.import_events FOR EACH ROW EXECUTE FUNCTION content.append_only();
CREATE TRIGGER publication_immutable BEFORE UPDATE OR DELETE ON content.publication_events FOR EACH ROW EXECUTE FUNCTION content.append_only();
CREATE TRIGGER reservation_immutable BEFORE UPDATE OR DELETE ON content.id_reservations FOR EACH ROW EXECUTE FUNCTION content.append_only();
CREATE FUNCTION content.guard_registry() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, content, pg_temp AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Allocated identities cannot be removed'; END IF;
    IF TG_TABLE_NAME='id_counters' THEN
        IF NEW.kind<>OLD.kind OR NEW.next_number<OLD.next_number THEN RAISE EXCEPTION 'Allocation counter cannot rewind'; END IF;
    ELSE
        IF (to_jsonb(NEW)-'materialized') IS DISTINCT FROM (to_jsonb(OLD)-'materialized') OR (OLD.materialized AND NOT NEW.materialized) THEN RAISE EXCEPTION 'Registered identity cannot be reassigned'; END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER counter_monotonic BEFORE UPDATE OR DELETE ON content.id_counters FOR EACH ROW EXECUTE FUNCTION content.guard_registry();
CREATE TRIGGER registry_immutable BEFORE UPDATE OR DELETE ON content.entity_ids FOR EACH ROW EXECUTE FUNCTION content.guard_registry();
CREATE FUNCTION content.guard_operation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, content, pg_temp AS $$
BEGIN
    IF TG_OP='DELETE' OR OLD.result IS NOT NULL OR (to_jsonb(NEW)-'result') IS DISTINCT FROM (to_jsonb(OLD)-'result') THEN RAISE EXCEPTION 'Completed operation is immutable'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER operation_immutable BEFORE UPDATE OR DELETE ON content.operations FOR EACH ROW EXECUTE FUNCTION content.guard_operation();
CREATE FUNCTION content.require_operation_result() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, content, pg_temp AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM content.operations WHERE operation_id=NEW.operation_id AND result IS NULL) THEN RAISE EXCEPTION 'Incomplete operation cannot commit'; END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER operation_complete AFTER INSERT OR UPDATE ON content.operations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION content.require_operation_result();
CREATE FUNCTION content.claim_operation(op_id uuid, operation_action text, payload jsonb, who text, why text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE signature text; existing content.operations;
BEGIN
    signature := encode(sha256(convert_to(jsonb_build_object('action',operation_action,'payload',payload,'actor',who,'reason',why)::text,'UTF8')),'hex');
    INSERT INTO content.operations(operation_id,action,fingerprint,actor,reason) VALUES(op_id,operation_action,signature,who,why) ON CONFLICT DO NOTHING;
    SELECT * INTO STRICT existing FROM content.operations WHERE operation_id=op_id FOR UPDATE;
    IF existing.fingerprint<>signature OR existing.action<>operation_action THEN RAISE EXCEPTION 'Operation ID reused with different intent'; END IF;
    RETURN existing.result;
END $$;
CREATE FUNCTION content.finish_operation(op_id uuid, outcome jsonb, target uuid DEFAULT NULL, draft_version bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, content, pg_temp AS $$
BEGIN
    UPDATE content.operations SET result=outcome WHERE operation_id=op_id;
    INSERT INTO content.audit_events(operation_id,event_type,actor,reason,release_id,draft_revision)
        SELECT operation_id,action,actor,reason,target,draft_version FROM content.operations WHERE operation_id=op_id;
    RETURN outcome;
END $$;
CREATE FUNCTION content.reserve_ids(op_id uuid, counts jsonb, expected_draft bigint, expected_publication bigint, intent text, who text, why text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE outcome jsonb; k text; amount integer; current_number bigint; allocated jsonb := '{}'; ids jsonb; n integer; entry text;
BEGIN
    IF counts IS NULL OR NOT content.fields(counts,'{}',ARRAY['s','q','i','d','f']) OR counts='{}' OR expected_draft IS NULL OR expected_draft<0 OR expected_publication IS NULL OR expected_publication<0 OR intent IS NULL OR NOT content.nonblank(intent) THEN RAISE EXCEPTION 'Invalid reservation context'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(counts) e WHERE jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^[0-9]+$' OR e.value::numeric>10000) OR
       (SELECT sum(value::text::integer) FROM jsonb_each(counts)) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid allocation counts'; END IF;
    outcome := content.claim_operation(op_id,'reserve',jsonb_build_object('counts',counts,'draft',expected_draft,'publication',expected_publication,'intent',intent),who,why);
    IF outcome IS NOT NULL THEN RETURN outcome; END IF;
    FOREACH k IN ARRAY ARRAY['s','q','i','d','f'] LOOP
        IF NOT counts ? k THEN CONTINUE; END IF;
        SELECT next_number INTO STRICT current_number FROM content.id_counters WHERE kind=k FOR UPDATE;
        amount := (counts->>k)::integer; ids := '[]';
        FOR n IN 1..amount LOOP
            WHILE EXISTS (SELECT 1 FROM content.entity_ids WHERE kind=k AND id=k||current_number::text) LOOP current_number:=current_number+1; END LOOP;
            IF current_number>9007199254740991 THEN RAISE EXCEPTION 'ID allocation exhausted'; END IF;
            ids:=ids||jsonb_build_array(k||current_number::text); current_number:=current_number+1;
        END LOOP;
        UPDATE content.id_counters SET next_number=current_number WHERE kind=k;
        allocated:=allocated||jsonb_build_object(k,ids);
    END LOOP;
    INSERT INTO content.id_reservations VALUES(op_id,expected_draft,expected_publication,allocated);
    FOR k,ids IN SELECT key,value FROM jsonb_each(allocated) LOOP
        FOR entry IN SELECT jsonb_array_elements_text(ids) LOOP
            INSERT INTO content.entity_ids(kind,id,origin,allocation_operation_id) VALUES(k,entry,'allocated',op_id);
        END LOOP;
    END LOOP;
    RETURN content.finish_operation(op_id,allocated);
END $$;
CREATE FUNCTION content.register_ids(q jsonb, f jsonb, reservations uuid[], importing boolean) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE k text; records jsonb; v jsonb; registered content.entity_ids; seed bigint; allocated content.id_reservations;
BEGIN
    -- Fixed counter lock order is shared with reservations. Existing IDs are identity continuity.
    FOREACH k IN ARRAY ARRAY['s','q','i','d','f'] LOOP
        PERFORM 1 FROM content.id_counters WHERE kind=k FOR UPDATE;
        records := CASE k WHEN 's' THEN q->'subjects' WHEN 'q' THEN q->'quizzes' WHEN 'i' THEN q->'questions' WHEN 'd' THEN f->'decks' ELSE f->'cards' END;
        FOR v IN SELECT value FROM jsonb_array_elements(records) LOOP
            SELECT * INTO registered FROM content.entity_ids WHERE kind=k AND id=v->>'id' FOR UPDATE;
            IF NOT FOUND THEN
                IF NOT importing THEN RAISE EXCEPTION 'Draft creates require reserved IDs'; END IF;
                INSERT INTO content.entity_ids(kind,id,origin,materialized) VALUES(k,v->>'id','imported',true);
            ELSIF NOT registered.materialized THEN
                IF NOT coalesce(registered.allocation_operation_id=ANY(reservations),false) THEN RAISE EXCEPTION 'ID belongs to an unconsumed reservation'; END IF;
                SELECT * INTO STRICT allocated FROM content.id_reservations WHERE operation_id=registered.allocation_operation_id;
                IF allocated.expected_draft_revision<>(SELECT revision FROM content.draft) OR
                   allocated.expected_publication_sequence<>(SELECT publication_sequence FROM content.active_publication) THEN RAISE EXCEPTION 'Reservation context is stale'; END IF;
                UPDATE content.entity_ids SET materialized=true WHERE kind=k AND id=v->>'id';
            END IF;
            IF v->>'id' ~ ('^'||k||'[1-9][0-9]*$') THEN
                seed := CASE WHEN length(v->>'id')>17 THEN 9007199254740992 ELSE least(substring(v->>'id' FROM 2)::numeric+1,9007199254740992)::bigint END;
                UPDATE content.id_counters SET next_number=greatest(next_number,seed) WHERE kind=k;
            END IF;
        END LOOP;
    END LOOP;
END $$;
CREATE FUNCTION content.store_release(op_id uuid, qtext text, ftext text, source_hashes jsonb, who text, why text, reservations uuid[] DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE outcome jsonb; revisions jsonb; existing content.releases; target uuid; q jsonb; f jsonb;
BEGIN
    IF NOT content.fields(source_hashes,ARRAY['quiz','flashcard']) OR NOT content.text_fields(source_hashes,ARRAY['quiz','flashcard']) OR
       source_hashes->>'quiz' !~ '^[0-9a-f]{64}$' OR source_hashes->>'flashcard' !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid captured source hashes'; END IF;
    revisions:=content.checked_artifacts(qtext,ftext); q:=qtext::jsonb; f:=ftext::jsonb;
    outcome:=content.claim_operation(op_id,'store',jsonb_build_object('quiz',qtext,'flashcard',ftext,'hashes',source_hashes,'reservations',reservations),who,why);
    IF outcome IS NOT NULL THEN RETURN outcome; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended((revisions->>'quiz_revision')||(revisions->>'flashcard_revision'),0));
    SELECT * INTO existing FROM content.releases WHERE quiz_revision=revisions->>'quiz_revision' AND flashcard_revision=revisions->>'flashcard_revision';
    IF FOUND THEN
        IF existing.state<>'finalized' OR existing.quiz_artifact<>qtext OR existing.flashcard_artifact<>ftext THEN RAISE EXCEPTION 'Digest collision or incomplete release'; END IF;
        PERFORM content.validate_release(existing); target:=existing.release_id;
    ELSE
        PERFORM content.register_ids(q,f,reservations,true);
        INSERT INTO content.releases(state,quiz_revision,flashcard_revision,quiz_artifact,flashcard_artifact,originating_operation_id)
            VALUES('building',revisions->>'quiz_revision',revisions->>'flashcard_revision',qtext,ftext,op_id) RETURNING release_id INTO target;
        INSERT INTO content.subjects(release_id,id,position,name,accent) SELECT target,v->>'id',n-1,v->>'name',v->>'accent' FROM jsonb_array_elements(q->'subjects') WITH ORDINALITY e(v,n);
        INSERT INTO content.quizzes(release_id,id,position,subject_id,name) SELECT target,v->>'id',n-1,v->>'subjectId',v->>'name' FROM jsonb_array_elements(q->'quizzes') WITH ORDINALITY e(v,n);
        INSERT INTO content.questions(release_id,id,position,quiz_id,stem,choices,answer,verified_answer,answer_note,rationale,rationale_meta,choice_explanations,pearls,metadata)
            SELECT target,v->>'id',n-1,v->>'quizId',v->>'stem',v->'choices',v->>'answer',v->>'verifiedAnswer',v->>'answerNote',v->>'rationale',v->'rationaleMeta',v->'choiceExplanations',v->'pearls',v->'metadata' FROM jsonb_array_elements(q->'questions') WITH ORDINALITY e(v,n);
        INSERT INTO content.decks(release_id,id,position,subject_id,name,description) SELECT target,v->>'id',n-1,v->>'subjectId',v->>'name',v->>'description' FROM jsonb_array_elements(f->'decks') WITH ORDINALITY e(v,n);
        INSERT INTO content.flashcards(release_id,id,position,deck_id,front,back,sources,review_note) SELECT target,v->>'id',n-1,v->>'deckId',v->>'front',v->>'back',v->>'sources',v->>'reviewNote' FROM jsonb_array_elements(f->'cards') WITH ORDINALITY e(v,n);
        UPDATE content.releases SET state='finalized',finalized_at=clock_timestamp() WHERE release_id=target;
    END IF;
    INSERT INTO content.import_events(operation_id,release_id,quiz_source_sha256,flashcard_source_sha256,actor,reason) VALUES(op_id,target,source_hashes->>'quiz',source_hashes->>'flashcard',who,why);
    RETURN content.finish_operation(op_id,jsonb_build_object('release_id',target)||revisions,target);
END $$;
CREATE FUNCTION content.activate_release(op_id uuid, target uuid, expected_sequence bigint, who text, why text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE outcome jsonb; prior bigint; new_sequence bigint;
BEGIN
    outcome:=content.claim_operation(op_id,'activate',jsonb_build_object('release',target,'expected',expected_sequence),who,why);
    IF outcome IS NOT NULL THEN RETURN outcome; END IF;
    SELECT publication_sequence INTO STRICT prior FROM content.active_publication FOR UPDATE;
    IF expected_sequence IS NULL OR prior<>expected_sequence THEN RAISE EXCEPTION 'Publication precondition is stale'; END IF;
    IF NOT EXISTS(SELECT 1 FROM content.releases WHERE release_id=target AND state='finalized') THEN RAISE EXCEPTION 'Release is not finalized'; END IF;
    INSERT INTO content.publication_events(release_id,prior_sequence,operation_id,actor,reason) VALUES(target,prior,op_id,who,why) RETURNING publication_sequence INTO new_sequence;
    UPDATE content.active_publication SET release_id=target,publication_sequence=new_sequence;
    RETURN content.finish_operation(op_id,jsonb_build_object('release_id',target,'publication_sequence',new_sequence),target);
END $$;
CREATE FUNCTION content.save_draft(op_id uuid, qtext text, ftext text, expected_revision bigint, base_sequence bigint, who text, why text, reservations uuid[] DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE outcome jsonb; current_revision bigint; base_release uuid;
BEGIN
    PERFORM content.checked_artifacts(qtext,ftext);
    outcome:=content.claim_operation(op_id,'draft',jsonb_build_object('quiz',qtext,'flashcard',ftext,'expected',expected_revision,'base',base_sequence,'reservations',reservations),who,why);
    IF outcome IS NOT NULL THEN RETURN outcome; END IF;
    SELECT revision INTO STRICT current_revision FROM content.draft FOR UPDATE;
    IF expected_revision IS NULL OR expected_revision<>current_revision THEN RAISE EXCEPTION 'Draft precondition is stale'; END IF;
    IF base_sequence IS NULL OR base_sequence<0 THEN RAISE EXCEPTION 'Invalid draft base'; END IF;
    IF base_sequence>0 THEN
        SELECT release_id INTO base_release FROM content.publication_events WHERE publication_sequence=base_sequence;
        IF NOT FOUND THEN RAISE EXCEPTION 'Unknown draft base publication'; END IF;
    END IF;
    PERFORM content.register_ids(qtext::jsonb,ftext::jsonb,reservations,false);
    UPDATE content.draft SET quiz_document=qtext,flashcard_document=ftext,revision=revision+1,base_release_id=base_release,base_publication_sequence=base_sequence,updated_at=clock_timestamp();
    RETURN content.finish_operation(op_id,jsonb_build_object('draft_revision',current_revision+1),NULL,current_revision+1);
END $$;

CREATE VIEW content.schema_version AS SELECT version_num FROM content.alembic_version;
CREATE VIEW content.published_releases WITH (security_barrier=true) AS SELECT release_id,quiz_schema_version,flashcard_schema_version,quiz_revision,flashcard_revision,created_at,finalized_at FROM content.releases WHERE state='finalized';
CREATE VIEW content.published_subjects WITH (security_barrier=true) AS SELECT e.* FROM content.subjects e JOIN content.releases r USING(release_id) WHERE r.state='finalized';
CREATE VIEW content.published_quizzes WITH (security_barrier=true) AS SELECT e.* FROM content.quizzes e JOIN content.releases r USING(release_id) WHERE r.state='finalized';
CREATE VIEW content.published_questions WITH (security_barrier=true) AS SELECT e.* FROM content.questions e JOIN content.releases r USING(release_id) WHERE r.state='finalized';
CREATE VIEW content.published_decks WITH (security_barrier=true) AS SELECT e.* FROM content.decks e JOIN content.releases r USING(release_id) WHERE r.state='finalized';
CREATE VIEW content.published_flashcards WITH (security_barrier=true) AS SELECT e.* FROM content.flashcards e JOIN content.releases r USING(release_id) WHERE r.state='finalized';
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA content FROM PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA content TO meducation_operator;
GRANT SELECT ON content.schema_version,content.active_publication,content.published_releases,content.published_subjects,content.published_quizzes,content.published_questions,content.published_decks,content.published_flashcards TO meducation_reader;
GRANT EXECUTE ON FUNCTION content.reserve_ids(uuid,jsonb,bigint,bigint,text,text,text),content.store_release(uuid,text,text,jsonb,text,text,uuid[]),content.activate_release(uuid,uuid,bigint,text,text),content.save_draft(uuid,text,text,bigint,bigint,text,text,uuid[]) TO meducation_operator;
