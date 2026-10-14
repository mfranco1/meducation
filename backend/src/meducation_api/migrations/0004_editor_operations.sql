-- Deferred integrity checks run after the definer call returns. They need owner
-- reads without exposing raw ledgers/normalized rows to the editor role.
ALTER FUNCTION content.require_operation_result() SECURITY DEFINER;
ALTER FUNCTION content.require_finalized() SECURITY DEFINER;
CREATE TABLE content.draft_control (
    singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
    epoch bigint NOT NULL DEFAULT 0,
    observed_revision bigint NOT NULL,
    observed_publication bigint NOT NULL,
    undo_ids bigint[] NOT NULL DEFAULT '{}'
);
INSERT INTO content.draft_control(observed_revision,observed_publication)
    SELECT d.revision,p.publication_sequence FROM content.draft d CROSS JOIN content.active_publication p;
CREATE TABLE content.draft_history (
    history_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operation_id uuid NOT NULL REFERENCES content.operations ON DELETE RESTRICT,
    phase text NOT NULL CHECK(phase IN ('before','after')),
    epoch bigint NOT NULL, revision bigint NOT NULL,
    quiz_document text NOT NULL, flashcard_document text NOT NULL,
    digests jsonb NOT NULL, base_release_id uuid REFERENCES content.releases,
    base_sequence bigint NOT NULL, publication_release_id uuid REFERENCES content.releases,
    publication_sequence bigint NOT NULL,
    actor text NOT NULL, reason text NOT NULL, action text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(operation_id,phase)
);
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON content.draft_history FOR EACH ROW EXECUTE FUNCTION content.append_only();
CREATE TABLE content.editor_reservations (
    reservation_id uuid PRIMARY KEY REFERENCES content.id_reservations ON DELETE RESTRICT,
    intent jsonb NOT NULL
);
CREATE TRIGGER intents_immutable BEFORE UPDATE OR DELETE ON content.editor_reservations FOR EACH ROW EXECUTE FUNCTION content.append_only();
CREATE TABLE content.editor_slots (
    reservation_id uuid NOT NULL REFERENCES content.id_reservations ON DELETE RESTRICT,
    kind text NOT NULL, id text NOT NULL, parent_id text,
    PRIMARY KEY(reservation_id,kind,id),
    FOREIGN KEY(kind,id) REFERENCES content.entity_ids ON DELETE RESTRICT
);
CREATE TRIGGER slots_immutable BEFORE UPDATE OR DELETE ON content.editor_slots FOR EACH ROW EXECUTE FUNCTION content.append_only();
GRANT SELECT ON content.draft_history,content.draft_control,content.editor_slots,content.editor_reservations TO meducation_operator,meducation_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA content TO meducation_backup;

CREATE FUNCTION content.editor_guard(session_hash text, policy_epoch text, who text, fresh boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,content,pg_temp AS $$
DECLARE s admin_auth.sessions; now_time double precision := extract(epoch FROM clock_timestamp());
BEGIN
    SELECT * INTO s FROM admin_auth.sessions WHERE token_hash=session_hash FOR NO KEY UPDATE;
    IF NOT FOUND OR s.revoked OR s.epoch IS DISTINCT FROM policy_epoch OR
        s.assurance_policy<>'synthetic-fresh-factor-v1' OR s.expires<=now_time OR s.last_activity+1800<=now_time OR
        s.created>now_time+60 OR s.auth_time>now_time+60 THEN RAISE EXCEPTION 'Session unavailable' USING ERRCODE='P4010'; END IF;
    IF who::jsonb IS DISTINCT FROM jsonb_build_array(s.issuer,s.subject) THEN RAISE EXCEPTION 'Actor denied' USING ERRCODE='P4030'; END IF;
    IF fresh AND now_time-s.auth_time>900 THEN RAISE EXCEPTION 'Fresh authentication required' USING ERRCODE='P4031'; END IF;
END $$;

CREATE FUNCTION content.editor_context() RETURNS jsonb
LANGUAGE sql SET search_path=pg_catalog,content,pg_temp AS $$
SELECT jsonb_build_object('revision',d.revision::text,'baseReleaseId',d.base_release_id,'baseSequence',d.base_publication_sequence::text,
    'quizDocument',d.quiz_document,'flashcardDocument',d.flashcard_document,'digests',content.checked_artifacts(d.quiz_document,d.flashcard_document),
    'releaseId',p.release_id,'sequence',p.publication_sequence::text,
    'publishedDigests',CASE WHEN r.release_id IS NULL THEN NULL ELSE jsonb_build_object('quiz_revision',r.quiz_revision,'flashcard_revision',r.flashcard_revision) END,
    'undo',CASE WHEN c.observed_revision=d.revision AND c.observed_publication=p.publication_sequence AND cardinality(c.undo_ids)>0
        THEN jsonb_build_object('available',true,'targetRevision',h.revision::text,'depth',cardinality(c.undo_ids))
        ELSE jsonb_build_object('available',false,'targetRevision',NULL,'depth',0) END)
FROM content.draft d CROSS JOIN content.active_publication p CROSS JOIN content.draft_control c
LEFT JOIN content.releases r ON r.release_id=p.release_id
LEFT JOIN content.draft_history h ON h.history_id=c.undo_ids[cardinality(c.undo_ids)]
$$;
CREATE FUNCTION content.editor_history(op uuid, phase_name text, who text, why text, action_name text) RETURNS bigint
LANGUAGE plpgsql SET search_path=pg_catalog,content,pg_temp AS $$
DECLARE id bigint;
BEGIN
    INSERT INTO content.draft_history(operation_id,phase,epoch,revision,quiz_document,flashcard_document,digests,base_release_id,base_sequence,publication_release_id,publication_sequence,actor,reason,action)
        SELECT op,phase_name,c.epoch,d.revision,d.quiz_document,d.flashcard_document,content.checked_artifacts(d.quiz_document,d.flashcard_document),d.base_release_id,d.base_publication_sequence,p.release_id,p.publication_sequence,who,why,action_name
        FROM content.draft d CROSS JOIN content.active_publication p CROSS JOIN content.draft_control c RETURNING history_id INTO id;
    RETURN id;
END $$;

CREATE FUNCTION content.editor_creates(qtext text,ftext text,reservations uuid[],who text,intent jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,content,pg_temp AS $$
DECLARE k text; old_records jsonb; records jsonb; entity jsonb; slot content.editor_slots; old_q jsonb; old_f jsonb;
BEGIN
    SELECT quiz_document::jsonb,flashcard_document::jsonb INTO old_q,old_f FROM content.draft;
    IF reservations IS NULL OR cardinality(reservations)>10000 OR
       EXISTS(SELECT 1 FROM unnest(reservations) r LEFT JOIN content.operations o ON o.operation_id=r LEFT JOIN content.id_reservations a ON a.operation_id=r
         WHERE o.actor IS DISTINCT FROM who OR o.action IS DISTINCT FROM 'reserve' OR a.expected_draft_revision IS DISTINCT FROM (SELECT revision FROM content.draft) OR a.expected_publication_sequence IS DISTINCT FROM (SELECT publication_sequence FROM content.active_publication)) THEN
        RAISE EXCEPTION 'Reservation invalid' USING ERRCODE='P4220'; END IF;
    IF jsonb_typeof(intent->'reservations') IS DISTINCT FROM 'array' OR jsonb_array_length(intent->'reservations')<>cardinality(reservations) OR
       EXISTS(SELECT 1 FROM jsonb_array_elements(intent->'reservations') e LEFT JOIN content.editor_reservations r ON r.reservation_id=(e->>'reservationId')::uuid
         WHERE r.reservation_id IS NULL OR NOT r.reservation_id=ANY(reservations) OR r.intent IS DISTINCT FROM jsonb_build_object('slots',e->'slots')) THEN
        RAISE EXCEPTION 'Creation intent differs' USING ERRCODE='P4220'; END IF;
    FOREACH k IN ARRAY ARRAY['s','q','i','d','f'] LOOP
        records:=CASE k WHEN 's' THEN qtext::jsonb->'subjects' WHEN 'q' THEN qtext::jsonb->'quizzes' WHEN 'i' THEN qtext::jsonb->'questions' WHEN 'd' THEN ftext::jsonb->'decks' ELSE ftext::jsonb->'cards' END;
        old_records:=CASE k WHEN 's' THEN old_q->'subjects' WHEN 'q' THEN old_q->'quizzes' WHEN 'i' THEN old_q->'questions' WHEN 'd' THEN old_f->'decks' ELSE old_f->'cards' END;
        FOR entity IN SELECT n.value FROM jsonb_array_elements(records) n(value) LEFT JOIN jsonb_array_elements(old_records) o(value) ON o.value->>'id'=n.value->>'id' WHERE o.value IS NULL LOOP
            SELECT * INTO slot FROM content.editor_slots WHERE reservation_id=ANY(reservations) AND kind=k AND id=entity->>'id';
            IF NOT FOUND OR slot.parent_id IS DISTINCT FROM (CASE k WHEN 'q' THEN entity->>'subjectId' WHEN 'd' THEN entity->>'subjectId' WHEN 'i' THEN entity->>'quizId' WHEN 'f' THEN entity->>'deckId' ELSE NULL END) THEN
                RAISE EXCEPTION 'Create destination is not reserved' USING ERRCODE='P4220'; END IF;
        END LOOP;
    END LOOP;
END $$;
CREATE FUNCTION content.editor_destructive(qtext text,ftext text) RETURNS boolean
LANGUAGE sql SET search_path=pg_catalog,content,pg_temp AS $$
WITH prior AS (SELECT quiz_document::jsonb q,flashcard_document::jsonb f FROM content.draft),
old_ids AS (SELECT k||':'||(v->>'id') id FROM prior CROSS JOIN LATERAL (VALUES('s',q->'subjects'),('q',q->'quizzes'),('i',q->'questions'),('d',f->'decks'),('f',f->'cards')) a(k,items) CROSS JOIN LATERAL jsonb_array_elements(items) e(v)),
new_ids AS (SELECT k||':'||(v->>'id') id FROM (VALUES('s',qtext::jsonb->'subjects'),('q',qtext::jsonb->'quizzes'),('i',qtext::jsonb->'questions'),('d',ftext::jsonb->'decks'),('f',ftext::jsonb->'cards')) a(k,items) CROSS JOIN LATERAL jsonb_array_elements(items) e(v))
SELECT count(*)>1 FROM old_ids LEFT JOIN new_ids USING(id) WHERE new_ids.id IS NULL
$$;

CREATE FUNCTION content.editor_replay(session_hash text,policy_epoch text,who text,op uuid,action_name text,request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,content,pg_temp AS $$
DECLARE entry content.operations; signature text;
BEGIN
    PERFORM content.editor_guard(session_hash,policy_epoch,who);
    SELECT * INTO entry FROM content.operations WHERE operation_id=op;
    IF NOT FOUND THEN RETURN NULL; END IF;
    signature:=encode(sha256(convert_to(jsonb_build_object('action',action_name,'payload',CASE WHEN action_name='save' THEN request ELSE request-'quizDocument'-'flashcardDocument' END,'actor',who,'reason',request->>'reason')::text,'UTF8')),'hex');
    IF entry.actor<>who OR entry.action<>action_name OR entry.fingerprint<>signature OR entry.result->>'editorContract' IS DISTINCT FROM '1' THEN
        RAISE EXCEPTION 'Operation reused' USING ERRCODE='P4091'; END IF;
    PERFORM content.editor_guard(session_hash,policy_epoch,who,coalesce((entry.result->>'requiresFresh')::boolean,false));
    RETURN entry.result;
END $$;

CREATE FUNCTION content.editor_read(session_hash text,policy_epoch text,who text,kind text,arg jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,content,pg_temp AS $$
DECLARE value jsonb; entry content.operations; h content.draft_history;
BEGIN
    PERFORM content.editor_guard(session_hash,policy_epoch,who,kind='export');
    IF kind='context' THEN RETURN content.editor_context();
    ELSIF kind='operation' THEN
        SELECT * INTO entry FROM content.operations WHERE operation_id=(arg->>'operationId')::uuid AND actor=who AND result->>'editorContract'='1';
        IF NOT FOUND THEN RAISE EXCEPTION 'Operation not found' USING ERRCODE='P4040'; END IF;
        RETURN jsonb_build_object('action',entry.action,'fingerprint',entry.fingerprint,'result',entry.result);
    ELSIF kind='operationPair' THEN
        SELECT * INTO h FROM content.draft_history WHERE operation_id=(arg->>'operationId')::uuid AND phase='after' AND actor=who;
        IF NOT FOUND THEN RAISE EXCEPTION 'Snapshot not found' USING ERRCODE='P4040'; END IF;
        RETURN jsonb_build_object('quizDocument',h.quiz_document,'flashcardDocument',h.flashcard_document);
    ELSIF kind='undoPair' THEN
        SELECT h0.* INTO h FROM content.draft_history h0 CROSS JOIN content.draft_control c CROSS JOIN content.draft d CROSS JOIN content.active_publication p
          WHERE h0.history_id=c.undo_ids[cardinality(c.undo_ids)] AND c.observed_revision=d.revision AND c.observed_publication=p.publication_sequence AND h0.revision=(arg->>'targetRevision')::bigint;
        IF NOT FOUND THEN RAISE EXCEPTION 'Undo stale' USING ERRCODE='P4092'; END IF;
        RETURN jsonb_build_object('quizDocument',h.quiz_document,'flashcardDocument',h.flashcard_document);
    ELSIF kind='release' THEN
        SELECT jsonb_build_object('releaseId',release_id,'quizDocument',quiz_artifact,'flashcardDocument',flashcard_artifact,'digests',jsonb_build_object('quiz_revision',quiz_revision,'flashcard_revision',flashcard_revision)) INTO value FROM content.releases WHERE release_id=(arg->>'releaseId')::uuid AND state='finalized';
        IF value IS NULL THEN RAISE EXCEPTION 'Release not found' USING ERRCODE='P4040'; END IF;
        RETURN value;
    ELSIF kind='releases' THEN
        SELECT jsonb_build_object('releases',coalesce(jsonb_agg(to_jsonb(r)),'[]')) INTO value FROM (
            SELECT release_id AS "releaseId",quiz_revision AS "quizRevision",flashcard_revision AS "flashcardRevision",created_at AS "createdAt",
                CASE WHEN EXISTS(SELECT 1 FROM content.authored_events a WHERE a.release_id=t.release_id) THEN 'authored' ELSE 'imported' END AS origin,
                (SELECT publication_sequence::text FROM content.publication_events p WHERE p.release_id=t.release_id ORDER BY publication_sequence DESC LIMIT 1) AS "latestPublicationSequence"
            FROM content.releases t WHERE state='finalized' AND ((arg->>'cursor') IS NULL OR (created_at,release_id)<(SELECT created_at,release_id FROM content.releases WHERE release_id=(arg->>'cursor')::uuid))
            ORDER BY created_at DESC,release_id DESC LIMIT least(50,greatest(1,(arg->>'limit')::int))) r;
        RETURN value;
    ELSE RAISE EXCEPTION 'Read kind invalid' USING ERRCODE='P4220'; END IF;
END $$;

CREATE FUNCTION content.editor_apply(session_hash text,policy_epoch text,who text,op uuid,action_name text,request jsonb,policy_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,content,pg_temp AS $$
DECLARE outcome jsonb; captured content.draft; active content.active_publication; control content.draft_control;
    replay jsonb; before_id bigint; after_id bigint; qtext text:=request->>'quizDocument'; ftext text:=request->>'flashcardDocument';
    why text:=request->>'reason'; expected_draft bigint:=(request->'expected'->>'draftRevision')::bigint; expected_publication bigint:=(request->'expected'->>'publicationSequence')::bigint;
    reservations uuid[]:=ARRAY(SELECT jsonb_array_elements_text(coalesce(request->'reservationIds','[]'))::uuid);
    target uuid; history content.draft_history; fresh boolean; slots jsonb; slot jsonb; k text; amount integer; i integer; offsets jsonb:='{}'; allocated jsonb; id text; parent text;
BEGIN
    PERFORM content.editor_guard(session_hash,policy_epoch,who);
    IF action_name NOT IN ('reserve','save','undo','reset','publish','activate') OR why IS NULL OR NOT content.nonblank(why) OR length(why)>2000 OR policy_version IS NULL OR policy_version<1 THEN RAISE EXCEPTION 'Invalid command' USING ERRCODE='P4220'; END IF;
    replay:=content.editor_replay(session_hash,policy_epoch,who,op,action_name,request);
    IF replay IS NOT NULL THEN RETURN replay; END IF;
    outcome:=content.claim_operation(op,action_name,CASE WHEN action_name='save' THEN request ELSE request-'quizDocument'-'flashcardDocument' END,who,why);
    -- A concurrent identical command may have committed while claim waited.
    IF outcome IS NOT NULL THEN
        PERFORM content.editor_guard(session_hash,policy_epoch,who,coalesce((outcome->>'requiresFresh')::boolean,false));
        RETURN outcome;
    END IF;
    SELECT * INTO STRICT captured FROM content.draft FOR UPDATE;
    SELECT * INTO STRICT active FROM content.active_publication FOR UPDATE;
    SELECT * INTO STRICT control FROM content.draft_control FOR UPDATE;
    IF captured.revision=0 THEN RAISE EXCEPTION 'Draft uninitialized' USING ERRCODE='P4094'; END IF;
    IF expected_draft IS NULL OR expected_publication IS NULL OR captured.revision<>expected_draft OR active.publication_sequence<>expected_publication THEN RAISE EXCEPTION 'Context stale' USING ERRCODE='P4090'; END IF;
    IF action_name='reserve' THEN
        slots:=request->'intent'->'slots';
        IF jsonb_typeof(slots)<>'array' OR jsonb_array_length(slots) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid slots' USING ERRCODE='P4220'; END IF;
        FOR slot IN SELECT jsonb_array_elements(slots) LOOP
            k:=slot->>'kind'; parent:=slot->>'parentId';
            IF k NOT IN ('s','q','i','d','f') OR slot->>'count' !~ '^[1-9][0-9]*$' OR (slot->>'count')::numeric>10000 THEN RAISE EXCEPTION 'Invalid slot' USING ERRCODE='P4220'; END IF;
            amount:=(slot->>'count')::int;
            IF k='s' AND parent IS NOT NULL OR k IN ('q','d') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(captured.quiz_document::jsonb->'subjects') e WHERE e->>'id'=parent) OR k='i' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(captured.quiz_document::jsonb->'quizzes') e WHERE e->>'id'=parent) OR k='f' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(captured.flashcard_document::jsonb->'decks') e WHERE e->>'id'=parent) THEN RAISE EXCEPTION 'Destination unavailable' USING ERRCODE='P4220'; END IF;
            offsets:=offsets||jsonb_build_object(k,coalesce((offsets->>k)::int,0)+amount);
        END LOOP;
        IF offsets IS DISTINCT FROM request->'counts' THEN RAISE EXCEPTION 'Slot counts differ' USING ERRCODE='P4220'; END IF;
        allocated:=content.editor_internal_reserve_ids(op,request->'counts',expected_draft,expected_publication,(request->'intent')::text,who,why); offsets:='{}';
        INSERT INTO content.editor_reservations VALUES(op,request->'intent');
        FOR slot IN SELECT jsonb_array_elements(slots) LOOP
            k:=slot->>'kind'; amount:=(slot->>'count')::int;
            FOR i IN 0..amount-1 LOOP
                id:=allocated->k->>(coalesce((offsets->>k)::int,0)+i);
                INSERT INTO content.editor_slots VALUES(op,k,id,slot->>'parentId');
            END LOOP;
            offsets:=offsets||jsonb_build_object(k,coalesce((offsets->>k)::int,0)+amount);
        END LOOP;
        outcome:=jsonb_build_object('editorContract',1,'requiresFresh',false,'result',jsonb_build_object('reservationId',op,'allocatedIds',allocated,'intentDigest',encode(sha256(convert_to((request->'intent')::text,'UTF8')),'hex'),'expected',request->'expected'));
        RETURN content.finish_operation(op,outcome);
    END IF;
    IF control.observed_revision<>captured.revision OR control.observed_publication<>active.publication_sequence THEN
        UPDATE content.draft_control SET epoch=epoch+1,undo_ids='{}'; control.undo_ids:='{}';
    END IF;
    IF action_name='undo' THEN
        SELECT * INTO history FROM content.draft_history WHERE history_id=control.undo_ids[cardinality(control.undo_ids)];
        IF NOT FOUND OR history.revision IS DISTINCT FROM (request->>'targetRevision')::bigint OR history.quiz_document IS DISTINCT FROM qtext OR history.flashcard_document IS DISTINCT FROM ftext THEN RAISE EXCEPTION 'Undo stale' USING ERRCODE='P4092'; END IF;
    ELSIF action_name IN ('reset','activate') THEN
        target:=CASE WHEN action_name='reset' THEN active.release_id ELSE (request->>'releaseId')::uuid END;
        IF target IS NULL OR NOT EXISTS(SELECT 1 FROM content.releases WHERE release_id=target AND state='finalized' AND quiz_artifact=qtext AND flashcard_artifact=ftext) THEN RAISE EXCEPTION 'Release unavailable' USING ERRCODE='P4040'; END IF;
    ELSIF action_name='publish' AND (captured.base_publication_sequence<>active.publication_sequence OR captured.base_release_id IS DISTINCT FROM active.release_id) THEN RAISE EXCEPTION 'Draft base stale' USING ERRCODE='P4093'; END IF;
    PERFORM content.checked_artifacts(qtext,ftext);
    fresh:=action_name IN ('reset','publish','activate') OR action_name IN ('save','undo') AND content.editor_destructive(qtext,ftext);
    PERFORM content.editor_guard(session_hash,policy_epoch,who,fresh);
    before_id:=content.editor_history(op,'before',who,why,action_name);
    IF action_name='save' THEN
        PERFORM content.editor_creates(qtext,ftext,reservations,who,request->'intent');
        outcome:=content.editor_internal_save_reviewed_draft(op,qtext,ftext,expected_draft,expected_publication,captured.base_publication_sequence,policy_version,request->>'previewFingerprint',reservations,who,why);
        UPDATE content.draft_control SET undo_ids=(undo_ids||ARRAY[before_id])[greatest(1,cardinality(undo_ids)+1-9):cardinality(undo_ids)+1];
    ELSIF action_name='publish' THEN
        outcome:=content.editor_internal_publish_draft(op,qtext,ftext,expected_draft,expected_publication,policy_version,request->>'previewFingerprint',who,why);
        UPDATE content.draft_control SET undo_ids='{}',epoch=epoch+1;
    ELSIF action_name='activate' THEN
        outcome:=content.editor_internal_activate_release(op,target,expected_publication,who,why);
        UPDATE content.draft_control SET undo_ids='{}',epoch=epoch+1;
    ELSE
        PERFORM content.register_ids(qtext::jsonb,ftext::jsonb,'{}',false);
        UPDATE content.draft SET quiz_document=qtext,flashcard_document=ftext,revision=revision+1,
            base_release_id=CASE WHEN action_name='reset' THEN active.release_id ELSE base_release_id END,
            base_publication_sequence=CASE WHEN action_name='reset' THEN active.publication_sequence ELSE base_publication_sequence END,updated_at=clock_timestamp();
        IF action_name='undo' THEN UPDATE content.draft_control SET undo_ids=undo_ids[1:cardinality(undo_ids)-1];
        ELSE UPDATE content.draft_control SET undo_ids='{}',epoch=epoch+1; END IF;
        outcome:=jsonb_build_object('draft_revision',captured.revision+1);
    END IF;
    UPDATE content.draft_control SET observed_revision=(SELECT revision FROM content.draft),observed_publication=(SELECT publication_sequence FROM content.active_publication);
    after_id:=content.editor_history(op,'after',who,why,action_name);
    replay:=content.editor_context()-'quizDocument'-'flashcardDocument';
    outcome:=jsonb_build_object('editorContract',1,'requiresFresh',fresh,'result',outcome,'snapshot',replay);
    RETURN content.finish_operation(op,outcome,(outcome->'result'->>'release_id')::uuid,(SELECT revision FROM content.draft));
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA content FROM PUBLIC;
GRANT EXECUTE ON FUNCTION content.editor_read(text,text,text,text,jsonb),content.editor_replay(text,text,text,uuid,text,jsonb),content.editor_apply(text,text,text,uuid,text,jsonb,integer) TO meducation_editor;
CREATE FUNCTION content.editor_check_creates(session_hash text,policy_epoch text,who text,qtext text,ftext text,reservations uuid[],intent jsonb,expected_draft bigint,expected_publication bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,content,pg_temp AS $$
BEGIN
    PERFORM content.editor_guard(session_hash,policy_epoch,who);
    IF expected_draft<>(SELECT revision FROM content.draft) OR expected_publication<>(SELECT publication_sequence FROM content.active_publication) THEN RAISE EXCEPTION 'Context stale' USING ERRCODE='P4090'; END IF;
    PERFORM content.editor_creates(qtext,ftext,reservations,who,intent);
    RETURN true;
END $$;
REVOKE ALL ON FUNCTION content.editor_check_creates(text,text,text,text,text,uuid[],jsonb,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION content.editor_check_creates(text,text,text,text,text,uuid[],jsonb,bigint,bigint) TO meducation_editor;
