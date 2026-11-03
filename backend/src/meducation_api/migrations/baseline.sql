-- Content and admin_auth schemas at revision 0012_unique_names (pg_dump format).
-- Bootstrap creates the roles and both schemas; the migration job runs this as meducation_owner.
SET LOCAL check_function_bodies = false;

-- Function: activate_release(uuid, uuid, bigint, text, text)

CREATE FUNCTION content.activate_release(op_id uuid, target uuid, expected_sequence bigint, who text, why text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
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

-- Function: append_only()

CREATE FUNCTION content.append_only() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
BEGIN RAISE EXCEPTION 'History is append-only'; END $$;

-- Function: checked_artifacts(text, text)

CREATE FUNCTION content.checked_artifacts(qtext text, ftext text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
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

-- Function: claim_operation(uuid, text, jsonb, text, text)

CREATE FUNCTION content.claim_operation(op_id uuid, operation_action text, payload jsonb, who text, why text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
DECLARE signature text; existing content.operations;
BEGIN
    signature := encode(sha256(convert_to(jsonb_build_object('action',operation_action,'payload',payload,'actor',who,'reason',why)::text,'UTF8')),'hex');
    INSERT INTO content.operations(operation_id,action,fingerprint,actor,reason) VALUES(op_id,operation_action,signature,who,why) ON CONFLICT DO NOTHING;
    SELECT * INTO STRICT existing FROM content.operations WHERE operation_id=op_id FOR UPDATE;
    IF existing.fingerprint<>signature OR existing.action<>operation_action THEN RAISE EXCEPTION 'Operation ID reused with different intent'; END IF;
    RETURN existing.result;
END $$;

-- Function: fields(jsonb, text[], text[])

CREATE FUNCTION content.fields(value jsonb, required text[], optional text[] DEFAULT '{}'::text[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
    SELECT coalesce(jsonb_typeof(value) = 'object' AND value ?& required AND
        NOT EXISTS (SELECT 1 FROM jsonb_object_keys(value) k WHERE NOT k = ANY(required || optional)), false)
$$;

-- Function: finish_operation(uuid, jsonb, uuid, bigint)

CREATE FUNCTION content.finish_operation(op_id uuid, outcome jsonb, target uuid DEFAULT NULL::uuid, draft_version bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
BEGIN
    UPDATE content.operations SET result=outcome WHERE operation_id=op_id;
    INSERT INTO content.audit_events(operation_id,event_type,actor,reason,release_id,draft_revision)
        SELECT operation_id,action,actor,reason,target,draft_version FROM content.operations WHERE operation_id=op_id;
    RETURN outcome;
END $$;

-- Function: guard_content_row()

CREATE FUNCTION content.guard_content_row() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
DECLARE target uuid; current_state text;
BEGIN
    target := CASE WHEN TG_OP='DELETE' THEN OLD.release_id ELSE NEW.release_id END;
    IF TG_OP='UPDATE' AND NEW.release_id IS DISTINCT FROM OLD.release_id THEN RAISE EXCEPTION 'Cross-release row move forbidden'; END IF;
    SELECT state INTO current_state FROM content.releases WHERE release_id=target FOR UPDATE;
    IF current_state IS DISTINCT FROM 'building' THEN RAISE EXCEPTION 'Only a building release can accept row writes'; END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

-- Function: guard_operation()

CREATE FUNCTION content.guard_operation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
BEGIN
    IF TG_OP='DELETE' OR OLD.result IS NOT NULL OR (to_jsonb(NEW)-'result') IS DISTINCT FROM (to_jsonb(OLD)-'result') THEN RAISE EXCEPTION 'Completed operation is immutable'; END IF;
    RETURN NEW;
END $$;

-- Function: guard_release()

CREATE FUNCTION content.guard_release() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
BEGIN
    IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.state='finalized') THEN RAISE EXCEPTION 'Finalized releases cannot be changed or deleted'; END IF;
    IF TG_OP='INSERT' AND NEW.state<>'building' THEN RAISE EXCEPTION 'Release must be built transactionally'; END IF;
    IF TG_OP='UPDATE' AND NEW.release_id IS DISTINCT FROM OLD.release_id THEN RAISE EXCEPTION 'Release identity is immutable'; END IF;
    IF NEW.state='finalized' THEN PERFORM content.validate_release(NEW); END IF;
    RETURN NEW;
END $$;

-- Function: json_clean(json)

CREATE FUNCTION content.json_clean(value json) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE STRICT
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
BEGIN
    CASE json_typeof(value)
    WHEN 'null' THEN RETURN false;
    WHEN 'object' THEN
        RETURN (SELECT count(*) = count(DISTINCT key) AND coalesce(bool_and(content.json_clean(v)), true) FROM json_each(value) e(key, v));
    WHEN 'array' THEN
        RETURN (SELECT coalesce(bool_and(content.json_clean(v)), true) FROM json_array_elements(value) e(v));
    ELSE RETURN true;
    END CASE;
END $$;

-- Function: nonblank(text)

CREATE FUNCTION content.nonblank(value text) RETURNS boolean
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
    SELECT btrim(value, U&'\0009\000A\000B\000C\000D\001C\001D\001E\001F\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000') <> ''
$$;

-- Function: pretty_json(json, integer)

CREATE FUNCTION content.pretty_json(value json, depth integer DEFAULT 0) RETURNS text
    LANGUAGE plpgsql IMMUTABLE STRICT
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
DECLARE rendered text;
BEGIN
    CASE json_typeof(value)
    WHEN 'object' THEN
        SELECT string_agg(repeat(' ', (depth + 1) * 2) || to_json(key)::text || ': ' || content.pretty_json(v, depth + 1), E',\n' ORDER BY n) INTO rendered FROM json_each(value) WITH ORDINALITY e(key, v, n);
        RETURN CASE WHEN rendered IS NULL THEN '{}' ELSE E'{\n' || rendered || E'\n' || repeat(' ', depth * 2) || '}' END;
    WHEN 'array' THEN
        SELECT string_agg(repeat(' ', (depth + 1) * 2) || content.pretty_json(v, depth + 1), E',\n' ORDER BY n) INTO rendered FROM json_array_elements(value) WITH ORDINALITY e(v, n);
        RETURN CASE WHEN rendered IS NULL THEN '[]' ELSE E'[\n' || rendered || E'\n' || repeat(' ', depth * 2) || ']' END;
    WHEN 'string' THEN RETURN to_json(value #>> '{}')::text;
    ELSE RETURN value::text;
    END CASE;
END $$;

-- Function: release_documents(uuid)

CREATE FUNCTION content.release_documents(target uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
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

-- Function: require_finalized()

CREATE FUNCTION content.require_finalized() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM content.releases WHERE release_id=NEW.release_id AND state<>'finalized') THEN RAISE EXCEPTION 'Building release cannot be committed'; END IF;
    RETURN NULL;
END $$;

-- Function: require_operation_result()

CREATE FUNCTION content.require_operation_result() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM content.operations WHERE operation_id=NEW.operation_id AND result IS NULL) THEN RAISE EXCEPTION 'Incomplete operation cannot commit'; END IF;
    RETURN NULL;
END $$;

-- Function: store_release(uuid, text, text, jsonb, text, text)

CREATE FUNCTION content.store_release(op_id uuid, qtext text, ftext text, source_hashes jsonb, who text, why text) RETURNS jsonb
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
END $_$;

-- Function: text_fields(jsonb, text[], text[])

CREATE FUNCTION content.text_fields(value jsonb, required text[], optional text[] DEFAULT '{}'::text[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
    SELECT NOT EXISTS (SELECT 1 FROM unnest(required || optional) k WHERE
        (k = ANY(required) OR value ? k) AND jsonb_typeof(value -> k) IS DISTINCT FROM 'string')
$$;

-- Table: releases

CREATE TABLE content.releases (
    release_id uuid DEFAULT gen_random_uuid() NOT NULL,
    state text NOT NULL,
    quiz_schema_version integer DEFAULT 6 NOT NULL,
    flashcard_schema_version integer DEFAULT 4 NOT NULL,
    quiz_revision text NOT NULL,
    flashcard_revision text NOT NULL,
    quiz_artifact text NOT NULL,
    flashcard_artifact text NOT NULL,
    originating_operation_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    finalized_at timestamp with time zone,
    CONSTRAINT releases_check CHECK (((state = 'finalized'::text) = (finalized_at IS NOT NULL))),
    CONSTRAINT releases_flashcard_revision_check CHECK ((flashcard_revision ~ '^sha256-[0-9a-f]{64}$'::text)),
    CONSTRAINT releases_flashcard_schema_version_check CHECK ((flashcard_schema_version = ANY (ARRAY[2, 3, 4]))),
    CONSTRAINT releases_quiz_revision_check CHECK ((quiz_revision ~ '^sha256-[0-9a-f]{64}$'::text)),
    CONSTRAINT releases_quiz_schema_version_check CHECK ((quiz_schema_version = ANY (ARRAY[4, 5, 6]))),
    CONSTRAINT releases_state_check CHECK ((state = ANY (ARRAY['building'::text, 'finalized'::text])))
);

-- Function: validate_release(content.releases)

CREATE FUNCTION content.validate_release(r content.releases) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'content', 'pg_temp'
    AS $$
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

-- Table: logins

CREATE TABLE admin_auth.logins (
    state_hash text NOT NULL,
    browser_hash text NOT NULL,
    ciphertext text NOT NULL,
    epoch text NOT NULL,
    expires double precision NOT NULL,
    consumed boolean DEFAULT false NOT NULL,
    CONSTRAINT logins_state_hash_check CHECK ((length(state_hash) = 64))
);

-- Table: rate_limits

CREATE TABLE admin_auth.rate_limits (
    bucket text NOT NULL,
    window_start double precision NOT NULL,
    count integer NOT NULL
);

-- Table: sessions

CREATE TABLE admin_auth.sessions (
    token_hash text NOT NULL,
    csrf text NOT NULL,
    issuer text NOT NULL,
    subject text NOT NULL,
    provider_sid text,
    epoch text NOT NULL,
    assurance_policy text NOT NULL,
    auth_time double precision NOT NULL,
    created double precision NOT NULL,
    last_activity double precision NOT NULL,
    expires double precision NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    CONSTRAINT sessions_token_hash_check CHECK ((length(token_hash) = 64))
);

-- Table: active_publication

CREATE TABLE content.active_publication (
    singleton boolean DEFAULT true NOT NULL,
    release_id uuid,
    publication_sequence bigint DEFAULT 0 NOT NULL,
    CONSTRAINT active_publication_check CHECK ((((release_id IS NULL) AND (publication_sequence = 0)) OR ((release_id IS NOT NULL) AND (publication_sequence > 0)))),
    CONSTRAINT active_publication_singleton_check CHECK (singleton)
);

-- Table: audit_events

CREATE TABLE content.audit_events (
    event_id uuid DEFAULT gen_random_uuid() NOT NULL,
    operation_id uuid NOT NULL,
    event_type text NOT NULL,
    actor text NOT NULL,
    reason text NOT NULL,
    release_id uuid,
    draft_revision bigint,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT audit_events_detail_check CHECK (((jsonb_typeof(detail) = 'object'::text) AND (octet_length((detail)::text) <= 8192)))
);

-- Table: decks

CREATE TABLE content.decks (
    release_id uuid NOT NULL,
    id text NOT NULL,
    kind text DEFAULT 'd'::text NOT NULL,
    "position" integer NOT NULL,
    subject_id text,
    name text NOT NULL,
    description text,
    topic_id text,
    CONSTRAINT decks_check CHECK ((num_nonnulls(subject_id, topic_id) = 1)),
    CONSTRAINT decks_kind_check CHECK ((kind = 'd'::text)),
    CONSTRAINT decks_name_check CHECK (content.nonblank(name)),
    CONSTRAINT decks_position_check CHECK (("position" >= 0))
);

-- Table: draft_changes

CREATE TABLE content.draft_changes (
    change_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    actor text NOT NULL,
    kind text NOT NULL,
    entity_id text NOT NULL,
    action text NOT NULL,
    before json,
    after json,
    CONSTRAINT draft_changes_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'move'::text]))),
    CONSTRAINT draft_changes_actor_check CHECK ((content.nonblank(actor) AND (length(actor) <= 1024))),
    CONSTRAINT draft_changes_after_check CHECK ((json_typeof(after) = 'object'::text)),
    CONSTRAINT draft_changes_before_check CHECK ((json_typeof(before) = 'object'::text)),
    CONSTRAINT draft_changes_check CHECK (((action = 'create'::text) = (before IS NULL))),
    CONSTRAINT draft_changes_check1 CHECK (((action = 'delete'::text) = (after IS NULL))),
    CONSTRAINT draft_changes_kind_check CHECK ((kind = ANY (ARRAY['subjects'::text, 'topics'::text, 'quizzes'::text, 'questions'::text, 'decks'::text, 'cards'::text])))
);

-- Sequence: draft_changes_change_id_seq

ALTER TABLE content.draft_changes ALTER COLUMN change_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME content.draft_changes_change_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- Table: draft_decks

CREATE TABLE content.draft_decks (
    id text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "position" numeric NOT NULL,
    field_order text[],
    name text NOT NULL,
    description text,
    topic_id text NOT NULL,
    CONSTRAINT draft_decks_id_check CHECK ((id ~ '^d[a-zA-Z0-9-]+$'::text)),
    CONSTRAINT draft_decks_name_check CHECK (content.nonblank(name)),
    CONSTRAINT draft_decks_version_check CHECK ((version >= 1))
);

-- Table: draft_flashcards

CREATE TABLE content.draft_flashcards (
    id text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "position" numeric NOT NULL,
    field_order text[],
    deck_id text NOT NULL,
    front text NOT NULL,
    back text NOT NULL,
    sources text,
    CONSTRAINT draft_flashcards_back_check CHECK (content.nonblank(back)),
    CONSTRAINT draft_flashcards_front_check CHECK (content.nonblank(front)),
    CONSTRAINT draft_flashcards_id_check CHECK ((id ~ '^f[a-zA-Z0-9-]+$'::text)),
    CONSTRAINT draft_flashcards_version_check CHECK ((version >= 1))
);

-- Sequence: draft_question_ids

CREATE SEQUENCE content.draft_question_ids
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Table: draft_questions

CREATE TABLE content.draft_questions (
    id text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "position" numeric NOT NULL,
    field_order text[],
    quiz_id text NOT NULL,
    stem text NOT NULL,
    choices json NOT NULL,
    answer text NOT NULL,
    rationale text NOT NULL,
    rationale_meta json,
    pearls json,
    metadata json,
    CONSTRAINT draft_questions_choices_check CHECK (((json_typeof(choices) = 'array'::text) AND (json_array_length(choices) >= 2))),
    CONSTRAINT draft_questions_id_check CHECK ((id ~ '^i[1-9][0-9]*$'::text)),
    CONSTRAINT draft_questions_metadata_check CHECK (((json_typeof(metadata) = 'object'::text) AND ((metadata)::jsonb <> '{}'::jsonb))),
    CONSTRAINT draft_questions_pearls_check CHECK ((json_typeof(pearls) = 'array'::text)),
    CONSTRAINT draft_questions_rationale_check CHECK (content.nonblank(rationale)),
    CONSTRAINT draft_questions_rationale_meta_check CHECK ((json_typeof(rationale_meta) = 'object'::text)),
    CONSTRAINT draft_questions_stem_check CHECK (content.nonblank(stem)),
    CONSTRAINT draft_questions_version_check CHECK ((version >= 1))
);

-- Sequence: draft_quiz_ids

CREATE SEQUENCE content.draft_quiz_ids
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Table: draft_quizzes

CREATE TABLE content.draft_quizzes (
    id text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "position" numeric NOT NULL,
    field_order text[],
    name text NOT NULL,
    topic_id text NOT NULL,
    description text,
    CONSTRAINT draft_quizzes_id_check CHECK ((id ~ '^q[1-9][0-9]*$'::text)),
    CONSTRAINT draft_quizzes_name_check CHECK (content.nonblank(name)),
    CONSTRAINT draft_quizzes_version_check CHECK ((version >= 1))
);

-- Table: draft_state

CREATE TABLE content.draft_state (
    singleton boolean DEFAULT true NOT NULL,
    base_release_id uuid,
    published_change_id bigint DEFAULT 0 NOT NULL,
    CONSTRAINT draft_state_published_change_id_check CHECK ((published_change_id >= 0)),
    CONSTRAINT draft_state_singleton_check CHECK (singleton)
);

-- Sequence: draft_subject_ids

CREATE SEQUENCE content.draft_subject_ids
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Table: draft_subjects

CREATE TABLE content.draft_subjects (
    id text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "position" numeric NOT NULL,
    field_order text[],
    name text NOT NULL,
    accent text NOT NULL,
    description text,
    CONSTRAINT draft_subjects_id_check CHECK ((id ~ '^s[1-9][0-9]*$'::text)),
    CONSTRAINT draft_subjects_name_check CHECK (content.nonblank(name)),
    CONSTRAINT draft_subjects_version_check CHECK ((version >= 1))
);

-- Sequence: draft_topic_ids

CREATE SEQUENCE content.draft_topic_ids
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Table: draft_topics

CREATE TABLE content.draft_topics (
    id text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "position" numeric NOT NULL,
    field_order text[],
    subject_id text NOT NULL,
    name text NOT NULL,
    description text,
    CONSTRAINT draft_topics_id_check CHECK ((id ~ '^t[1-9][0-9]*$'::text)),
    CONSTRAINT draft_topics_name_check CHECK (content.nonblank(name)),
    CONSTRAINT draft_topics_version_check CHECK ((version >= 1))
);

-- Table: flashcards

CREATE TABLE content.flashcards (
    release_id uuid NOT NULL,
    id text NOT NULL,
    kind text DEFAULT 'f'::text NOT NULL,
    "position" integer NOT NULL,
    deck_id text NOT NULL,
    front text NOT NULL,
    back text NOT NULL,
    sources text,
    review_note text,
    CONSTRAINT flashcards_back_check CHECK (content.nonblank(back)),
    CONSTRAINT flashcards_front_check CHECK (content.nonblank(front)),
    CONSTRAINT flashcards_kind_check CHECK ((kind = 'f'::text)),
    CONSTRAINT flashcards_position_check CHECK (("position" >= 0))
);

-- Table: import_events

CREATE TABLE content.import_events (
    operation_id uuid NOT NULL,
    release_id uuid NOT NULL,
    quiz_source_sha256 text NOT NULL,
    flashcard_source_sha256 text NOT NULL,
    actor text NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT import_events_flashcard_source_sha256_check CHECK ((flashcard_source_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT import_events_quiz_source_sha256_check CHECK ((quiz_source_sha256 ~ '^[0-9a-f]{64}$'::text))
);

-- Table: operations

CREATE TABLE content.operations (
    operation_id uuid NOT NULL,
    action text NOT NULL,
    fingerprint text NOT NULL,
    actor text NOT NULL,
    reason text NOT NULL,
    result jsonb,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT operations_actor_check CHECK ((content.nonblank(actor) AND (length(actor) <= 256))),
    CONSTRAINT operations_fingerprint_check CHECK ((fingerprint ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT operations_reason_check CHECK ((content.nonblank(reason) AND (length(reason) <= 4096)))
);

-- Table: publication_events

CREATE TABLE content.publication_events (
    publication_sequence bigint NOT NULL,
    release_id uuid NOT NULL,
    prior_sequence bigint NOT NULL,
    operation_id uuid NOT NULL,
    actor text NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT publication_events_prior_sequence_check CHECK ((prior_sequence >= 0))
);

-- Sequence: publication_events_publication_sequence_seq

ALTER TABLE content.publication_events ALTER COLUMN publication_sequence ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME content.publication_events_publication_sequence_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- View: published_decks

CREATE VIEW content.published_decks WITH (security_barrier='true') AS
 SELECT e.release_id,
    e.id,
    e.kind,
    e."position",
    e.subject_id,
    e.name,
    e.description,
    e.topic_id
   FROM (content.decks e
     JOIN content.releases r USING (release_id))
  WHERE (r.state = 'finalized'::text);

-- View: published_flashcards

CREATE VIEW content.published_flashcards WITH (security_barrier='true') AS
 SELECT e.release_id,
    e.id,
    e.kind,
    e."position",
    e.deck_id,
    e.front,
    e.back,
    e.sources,
    e.review_note
   FROM (content.flashcards e
     JOIN content.releases r USING (release_id))
  WHERE (r.state = 'finalized'::text);

-- Table: questions

CREATE TABLE content.questions (
    release_id uuid NOT NULL,
    id text NOT NULL,
    kind text DEFAULT 'i'::text NOT NULL,
    "position" integer NOT NULL,
    quiz_id text NOT NULL,
    stem text NOT NULL,
    choices jsonb NOT NULL,
    answer text,
    verified_answer text,
    answer_note text,
    rationale text NOT NULL,
    rationale_meta jsonb,
    choice_explanations jsonb,
    pearls jsonb,
    metadata jsonb,
    CONSTRAINT questions_choice_explanations_check CHECK ((jsonb_typeof(choice_explanations) = 'object'::text)),
    CONSTRAINT questions_choices_check CHECK (((jsonb_typeof(choices) = 'array'::text) AND (jsonb_array_length(choices) >= 2))),
    CONSTRAINT questions_kind_check CHECK ((kind = 'i'::text)),
    CONSTRAINT questions_metadata_check CHECK (((jsonb_typeof(metadata) = 'object'::text) AND (metadata <> '{}'::jsonb))),
    CONSTRAINT questions_pearls_check CHECK ((jsonb_typeof(pearls) = 'array'::text)),
    CONSTRAINT questions_position_check CHECK (("position" >= 0)),
    CONSTRAINT questions_rationale_check CHECK (content.nonblank(rationale)),
    CONSTRAINT questions_rationale_meta_check CHECK ((jsonb_typeof(rationale_meta) = 'object'::text)),
    CONSTRAINT questions_stem_check CHECK (content.nonblank(stem))
);

-- View: published_questions

CREATE VIEW content.published_questions WITH (security_barrier='true') AS
 SELECT e.release_id,
    e.id,
    e.kind,
    e."position",
    e.quiz_id,
    e.stem,
    e.choices,
    e.answer,
    e.verified_answer,
    e.answer_note,
    e.rationale,
    e.rationale_meta,
    e.choice_explanations,
    e.pearls,
    e.metadata
   FROM (content.questions e
     JOIN content.releases r USING (release_id))
  WHERE (r.state = 'finalized'::text);

-- Table: quizzes

CREATE TABLE content.quizzes (
    release_id uuid NOT NULL,
    id text NOT NULL,
    kind text DEFAULT 'q'::text NOT NULL,
    "position" integer NOT NULL,
    subject_id text,
    name text NOT NULL,
    topic_id text,
    description text,
    CONSTRAINT quizzes_check CHECK ((num_nonnulls(subject_id, topic_id) = 1)),
    CONSTRAINT quizzes_kind_check CHECK ((kind = 'q'::text)),
    CONSTRAINT quizzes_name_check CHECK (content.nonblank(name)),
    CONSTRAINT quizzes_position_check CHECK (("position" >= 0))
);

-- View: published_quizzes

CREATE VIEW content.published_quizzes WITH (security_barrier='true') AS
 SELECT e.release_id,
    e.id,
    e.kind,
    e."position",
    e.subject_id,
    e.name,
    e.topic_id,
    e.description
   FROM (content.quizzes e
     JOIN content.releases r USING (release_id))
  WHERE (r.state = 'finalized'::text);

-- View: published_releases

CREATE VIEW content.published_releases WITH (security_barrier='true') AS
 SELECT release_id,
    quiz_schema_version,
    flashcard_schema_version,
    quiz_revision,
    flashcard_revision,
    created_at,
    finalized_at
   FROM content.releases
  WHERE (state = 'finalized'::text);

-- Table: subjects

CREATE TABLE content.subjects (
    release_id uuid NOT NULL,
    id text NOT NULL,
    kind text DEFAULT 's'::text NOT NULL,
    "position" integer NOT NULL,
    name text NOT NULL,
    accent text NOT NULL,
    description text,
    CONSTRAINT subjects_kind_check CHECK ((kind = 's'::text)),
    CONSTRAINT subjects_name_check CHECK (content.nonblank(name)),
    CONSTRAINT subjects_position_check CHECK (("position" >= 0))
);

-- View: published_subjects

CREATE VIEW content.published_subjects WITH (security_barrier='true') AS
 SELECT e.release_id,
    e.id,
    e.kind,
    e."position",
    e.name,
    e.accent,
    e.description
   FROM (content.subjects e
     JOIN content.releases r USING (release_id))
  WHERE (r.state = 'finalized'::text);

-- Table: topics

CREATE TABLE content.topics (
    release_id uuid NOT NULL,
    id text NOT NULL,
    "position" integer NOT NULL,
    subject_id text NOT NULL,
    name text NOT NULL,
    description text,
    CONSTRAINT topics_id_check CHECK ((id ~ '^t[1-9][0-9]*$'::text)),
    CONSTRAINT topics_name_check CHECK (content.nonblank(name)),
    CONSTRAINT topics_position_check CHECK (("position" >= 0))
);

-- View: published_topics

CREATE VIEW content.published_topics WITH (security_barrier='true') AS
 SELECT e.release_id,
    e.id,
    e."position",
    e.subject_id,
    e.name,
    e.description
   FROM (content.topics e
     JOIN content.releases r USING (release_id))
  WHERE (r.state = 'finalized'::text);

-- View: schema_version

CREATE VIEW content.schema_version AS
 SELECT version_num
   FROM content.alembic_version;

-- Constraint: logins logins_pkey

ALTER TABLE ONLY admin_auth.logins
    ADD CONSTRAINT logins_pkey PRIMARY KEY (state_hash);

-- Constraint: rate_limits rate_limits_pkey

ALTER TABLE ONLY admin_auth.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (bucket);

-- Constraint: sessions sessions_pkey

ALTER TABLE ONLY admin_auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (token_hash);

-- Constraint: active_publication active_publication_pkey

ALTER TABLE ONLY content.active_publication
    ADD CONSTRAINT active_publication_pkey PRIMARY KEY (singleton);

-- Constraint: audit_events audit_events_operation_id_event_type_key

ALTER TABLE ONLY content.audit_events
    ADD CONSTRAINT audit_events_operation_id_event_type_key UNIQUE (operation_id, event_type);

-- Constraint: audit_events audit_events_pkey

ALTER TABLE ONLY content.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (event_id);

-- Constraint: decks decks_pkey

ALTER TABLE ONLY content.decks
    ADD CONSTRAINT decks_pkey PRIMARY KEY (release_id, id);

-- Constraint: decks decks_release_id_position_key

ALTER TABLE ONLY content.decks
    ADD CONSTRAINT decks_release_id_position_key UNIQUE (release_id, "position");

-- Constraint: draft_changes draft_changes_pkey

ALTER TABLE ONLY content.draft_changes
    ADD CONSTRAINT draft_changes_pkey PRIMARY KEY (change_id);

-- Constraint: draft_decks draft_decks_pkey

ALTER TABLE ONLY content.draft_decks
    ADD CONSTRAINT draft_decks_pkey PRIMARY KEY (id);

-- Constraint: draft_decks draft_decks_position_key

ALTER TABLE ONLY content.draft_decks
    ADD CONSTRAINT draft_decks_position_key UNIQUE ("position");

-- Constraint: draft_flashcards draft_flashcards_pkey

ALTER TABLE ONLY content.draft_flashcards
    ADD CONSTRAINT draft_flashcards_pkey PRIMARY KEY (id);

-- Constraint: draft_flashcards draft_flashcards_position_key

ALTER TABLE ONLY content.draft_flashcards
    ADD CONSTRAINT draft_flashcards_position_key UNIQUE ("position");

-- Constraint: draft_questions draft_questions_pkey

ALTER TABLE ONLY content.draft_questions
    ADD CONSTRAINT draft_questions_pkey PRIMARY KEY (id);

-- Constraint: draft_questions draft_questions_position_key

ALTER TABLE ONLY content.draft_questions
    ADD CONSTRAINT draft_questions_position_key UNIQUE ("position");

-- Constraint: draft_quizzes draft_quizzes_pkey

ALTER TABLE ONLY content.draft_quizzes
    ADD CONSTRAINT draft_quizzes_pkey PRIMARY KEY (id);

-- Constraint: draft_quizzes draft_quizzes_position_key

ALTER TABLE ONLY content.draft_quizzes
    ADD CONSTRAINT draft_quizzes_position_key UNIQUE ("position");

-- Constraint: draft_state draft_state_pkey

ALTER TABLE ONLY content.draft_state
    ADD CONSTRAINT draft_state_pkey PRIMARY KEY (singleton);

-- Constraint: draft_subjects draft_subjects_pkey

ALTER TABLE ONLY content.draft_subjects
    ADD CONSTRAINT draft_subjects_pkey PRIMARY KEY (id);

-- Constraint: draft_subjects draft_subjects_position_key

ALTER TABLE ONLY content.draft_subjects
    ADD CONSTRAINT draft_subjects_position_key UNIQUE ("position");

-- Constraint: draft_topics draft_topics_pkey

ALTER TABLE ONLY content.draft_topics
    ADD CONSTRAINT draft_topics_pkey PRIMARY KEY (id);

-- Constraint: draft_topics draft_topics_position_key

ALTER TABLE ONLY content.draft_topics
    ADD CONSTRAINT draft_topics_position_key UNIQUE ("position");

-- Constraint: flashcards flashcards_pkey

ALTER TABLE ONLY content.flashcards
    ADD CONSTRAINT flashcards_pkey PRIMARY KEY (release_id, id);

-- Constraint: flashcards flashcards_release_id_position_key

ALTER TABLE ONLY content.flashcards
    ADD CONSTRAINT flashcards_release_id_position_key UNIQUE (release_id, "position");

-- Constraint: import_events import_events_pkey

ALTER TABLE ONLY content.import_events
    ADD CONSTRAINT import_events_pkey PRIMARY KEY (operation_id);

-- Constraint: operations operations_pkey

ALTER TABLE ONLY content.operations
    ADD CONSTRAINT operations_pkey PRIMARY KEY (operation_id);

-- Constraint: publication_events publication_events_operation_id_key

ALTER TABLE ONLY content.publication_events
    ADD CONSTRAINT publication_events_operation_id_key UNIQUE (operation_id);

-- Constraint: publication_events publication_events_pkey

ALTER TABLE ONLY content.publication_events
    ADD CONSTRAINT publication_events_pkey PRIMARY KEY (publication_sequence);

-- Constraint: publication_events publication_events_publication_sequence_release_id_key

ALTER TABLE ONLY content.publication_events
    ADD CONSTRAINT publication_events_publication_sequence_release_id_key UNIQUE (publication_sequence, release_id);

-- Constraint: questions questions_pkey

ALTER TABLE ONLY content.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (release_id, id);

-- Constraint: questions questions_release_id_position_key

ALTER TABLE ONLY content.questions
    ADD CONSTRAINT questions_release_id_position_key UNIQUE (release_id, "position");

-- Constraint: quizzes quizzes_pkey

ALTER TABLE ONLY content.quizzes
    ADD CONSTRAINT quizzes_pkey PRIMARY KEY (release_id, id);

-- Constraint: quizzes quizzes_release_id_position_key

ALTER TABLE ONLY content.quizzes
    ADD CONSTRAINT quizzes_release_id_position_key UNIQUE (release_id, "position");

-- Constraint: releases releases_pkey

ALTER TABLE ONLY content.releases
    ADD CONSTRAINT releases_pkey PRIMARY KEY (release_id);

-- Constraint: subjects subjects_pkey

ALTER TABLE ONLY content.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (release_id, id);

-- Constraint: subjects subjects_release_id_position_key

ALTER TABLE ONLY content.subjects
    ADD CONSTRAINT subjects_release_id_position_key UNIQUE (release_id, "position");

-- Constraint: topics topics_pkey

ALTER TABLE ONLY content.topics
    ADD CONSTRAINT topics_pkey PRIMARY KEY (release_id, id);

-- Constraint: topics topics_release_id_position_key

ALTER TABLE ONLY content.topics
    ADD CONSTRAINT topics_release_id_position_key UNIQUE (release_id, "position");

-- Index: decks_release_id_subject_id_position_idx

CREATE INDEX decks_release_id_subject_id_position_idx ON content.decks USING btree (release_id, subject_id, "position");

-- Index: decks_release_id_topic_id_position_idx

CREATE INDEX decks_release_id_topic_id_position_idx ON content.decks USING btree (release_id, topic_id, "position");

-- Index: draft_changes_kind_entity_id_change_id_idx

CREATE INDEX draft_changes_kind_entity_id_change_id_idx ON content.draft_changes USING btree (kind, entity_id, change_id);

-- Index: draft_decks_name_key

CREATE UNIQUE INDEX draft_decks_name_key ON content.draft_decks USING btree (topic_id, lower(btrim(name)));

-- Index: draft_decks_topic_id_idx

CREATE INDEX draft_decks_topic_id_idx ON content.draft_decks USING btree (topic_id);

-- Index: draft_flashcards_deck_id_idx

CREATE INDEX draft_flashcards_deck_id_idx ON content.draft_flashcards USING btree (deck_id);

-- Index: draft_questions_quiz_id_idx

CREATE INDEX draft_questions_quiz_id_idx ON content.draft_questions USING btree (quiz_id);

-- Index: draft_quizzes_name_key

CREATE UNIQUE INDEX draft_quizzes_name_key ON content.draft_quizzes USING btree (topic_id, lower(btrim(name)));

-- Index: draft_quizzes_topic_id_idx

CREATE INDEX draft_quizzes_topic_id_idx ON content.draft_quizzes USING btree (topic_id);

-- Index: draft_subjects_name_key

CREATE UNIQUE INDEX draft_subjects_name_key ON content.draft_subjects USING btree (lower(btrim(name)));

-- Index: draft_topics_name_key

CREATE UNIQUE INDEX draft_topics_name_key ON content.draft_topics USING btree (subject_id, lower(btrim(name)));

-- Index: draft_topics_subject_id_idx

CREATE INDEX draft_topics_subject_id_idx ON content.draft_topics USING btree (subject_id);

-- Index: flashcards_release_id_deck_id_position_idx

CREATE INDEX flashcards_release_id_deck_id_position_idx ON content.flashcards USING btree (release_id, deck_id, "position");

-- Index: questions_release_id_quiz_id_position_idx

CREATE INDEX questions_release_id_quiz_id_position_idx ON content.questions USING btree (release_id, quiz_id, "position");

-- Index: quizzes_release_id_subject_id_position_idx

CREATE INDEX quizzes_release_id_subject_id_position_idx ON content.quizzes USING btree (release_id, subject_id, "position");

-- Index: quizzes_release_id_topic_id_position_idx

CREATE INDEX quizzes_release_id_topic_id_position_idx ON content.quizzes USING btree (release_id, topic_id, "position");

-- Index: releases_content_digests

CREATE INDEX releases_content_digests ON content.releases USING btree (quiz_revision, flashcard_revision, created_at, release_id);

-- Index: topics_release_id_subject_id_position_idx

CREATE INDEX topics_release_id_subject_id_position_idx ON content.topics USING btree (release_id, subject_id, "position");

-- Trigger: audit_events audit_immutable

CREATE TRIGGER audit_immutable BEFORE DELETE OR UPDATE ON content.audit_events FOR EACH ROW EXECUTE FUNCTION content.append_only();

-- Trigger: flashcards card_guard

CREATE TRIGGER card_guard BEFORE INSERT OR DELETE OR UPDATE ON content.flashcards FOR EACH ROW EXECUTE FUNCTION content.guard_content_row();

-- Trigger: decks deck_guard

CREATE TRIGGER deck_guard BEFORE INSERT OR DELETE OR UPDATE ON content.decks FOR EACH ROW EXECUTE FUNCTION content.guard_content_row();

-- Trigger: draft_changes draft_changes_immutable

CREATE TRIGGER draft_changes_immutable BEFORE DELETE OR UPDATE ON content.draft_changes FOR EACH ROW EXECUTE FUNCTION content.append_only();

-- Trigger: import_events import_immutable

CREATE TRIGGER import_immutable BEFORE DELETE OR UPDATE ON content.import_events FOR EACH ROW EXECUTE FUNCTION content.append_only();

-- Trigger: operations operation_complete

CREATE CONSTRAINT TRIGGER operation_complete AFTER INSERT OR UPDATE ON content.operations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION content.require_operation_result();

-- Trigger: operations operation_immutable

CREATE TRIGGER operation_immutable BEFORE DELETE OR UPDATE ON content.operations FOR EACH ROW EXECUTE FUNCTION content.guard_operation();

-- Trigger: publication_events publication_immutable

CREATE TRIGGER publication_immutable BEFORE DELETE OR UPDATE ON content.publication_events FOR EACH ROW EXECUTE FUNCTION content.append_only();

-- Trigger: questions question_guard

CREATE TRIGGER question_guard BEFORE INSERT OR DELETE OR UPDATE ON content.questions FOR EACH ROW EXECUTE FUNCTION content.guard_content_row();

-- Trigger: quizzes quiz_guard

CREATE TRIGGER quiz_guard BEFORE INSERT OR DELETE OR UPDATE ON content.quizzes FOR EACH ROW EXECUTE FUNCTION content.guard_content_row();

-- Trigger: releases release_complete

CREATE CONSTRAINT TRIGGER release_complete AFTER INSERT OR UPDATE ON content.releases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION content.require_finalized();

-- Trigger: releases release_guard

CREATE TRIGGER release_guard BEFORE INSERT OR DELETE OR UPDATE ON content.releases FOR EACH ROW EXECUTE FUNCTION content.guard_release();

-- Trigger: subjects subject_guard

CREATE TRIGGER subject_guard BEFORE INSERT OR DELETE OR UPDATE ON content.subjects FOR EACH ROW EXECUTE FUNCTION content.guard_content_row();

-- Trigger: topics topic_guard

CREATE TRIGGER topic_guard BEFORE INSERT OR DELETE OR UPDATE ON content.topics FOR EACH ROW EXECUTE FUNCTION content.guard_content_row();

-- Fk Constraint: active_publication active_publication_publication_sequence_release_id_fkey

ALTER TABLE ONLY content.active_publication
    ADD CONSTRAINT active_publication_publication_sequence_release_id_fkey FOREIGN KEY (publication_sequence, release_id) REFERENCES content.publication_events(publication_sequence, release_id) ON DELETE RESTRICT;

-- Fk Constraint: audit_events audit_events_operation_id_fkey

ALTER TABLE ONLY content.audit_events
    ADD CONSTRAINT audit_events_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES content.operations(operation_id) ON DELETE RESTRICT;

-- Fk Constraint: audit_events audit_events_release_id_fkey

ALTER TABLE ONLY content.audit_events
    ADD CONSTRAINT audit_events_release_id_fkey FOREIGN KEY (release_id) REFERENCES content.releases(release_id) ON DELETE RESTRICT;

-- Fk Constraint: decks decks_release_id_fkey

ALTER TABLE ONLY content.decks
    ADD CONSTRAINT decks_release_id_fkey FOREIGN KEY (release_id) REFERENCES content.releases(release_id) ON DELETE RESTRICT;

-- Fk Constraint: decks decks_release_id_subject_id_fkey

ALTER TABLE ONLY content.decks
    ADD CONSTRAINT decks_release_id_subject_id_fkey FOREIGN KEY (release_id, subject_id) REFERENCES content.subjects(release_id, id) ON DELETE RESTRICT;

-- Fk Constraint: decks decks_release_id_topic_id_fkey

ALTER TABLE ONLY content.decks
    ADD CONSTRAINT decks_release_id_topic_id_fkey FOREIGN KEY (release_id, topic_id) REFERENCES content.topics(release_id, id) ON DELETE RESTRICT;

-- Fk Constraint: draft_decks draft_decks_topic_id_fkey

ALTER TABLE ONLY content.draft_decks
    ADD CONSTRAINT draft_decks_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES content.draft_topics(id) ON DELETE RESTRICT;

-- Fk Constraint: draft_flashcards draft_flashcards_deck_id_fkey

ALTER TABLE ONLY content.draft_flashcards
    ADD CONSTRAINT draft_flashcards_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES content.draft_decks(id) ON DELETE RESTRICT;

-- Fk Constraint: draft_questions draft_questions_quiz_id_fkey

ALTER TABLE ONLY content.draft_questions
    ADD CONSTRAINT draft_questions_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES content.draft_quizzes(id) ON DELETE RESTRICT;

-- Fk Constraint: draft_quizzes draft_quizzes_topic_id_fkey

ALTER TABLE ONLY content.draft_quizzes
    ADD CONSTRAINT draft_quizzes_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES content.draft_topics(id) ON DELETE RESTRICT;

-- Fk Constraint: draft_state draft_state_base_release_id_fkey

ALTER TABLE ONLY content.draft_state
    ADD CONSTRAINT draft_state_base_release_id_fkey FOREIGN KEY (base_release_id) REFERENCES content.releases(release_id) ON DELETE RESTRICT;

-- Fk Constraint: draft_topics draft_topics_subject_id_fkey

ALTER TABLE ONLY content.draft_topics
    ADD CONSTRAINT draft_topics_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES content.draft_subjects(id) ON DELETE RESTRICT;

-- Fk Constraint: flashcards flashcards_release_id_deck_id_fkey

ALTER TABLE ONLY content.flashcards
    ADD CONSTRAINT flashcards_release_id_deck_id_fkey FOREIGN KEY (release_id, deck_id) REFERENCES content.decks(release_id, id) ON DELETE RESTRICT;

-- Fk Constraint: flashcards flashcards_release_id_fkey

ALTER TABLE ONLY content.flashcards
    ADD CONSTRAINT flashcards_release_id_fkey FOREIGN KEY (release_id) REFERENCES content.releases(release_id) ON DELETE RESTRICT;

-- Fk Constraint: import_events import_events_operation_id_fkey

ALTER TABLE ONLY content.import_events
    ADD CONSTRAINT import_events_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES content.operations(operation_id) ON DELETE RESTRICT;

-- Fk Constraint: import_events import_events_release_id_fkey

ALTER TABLE ONLY content.import_events
    ADD CONSTRAINT import_events_release_id_fkey FOREIGN KEY (release_id) REFERENCES content.releases(release_id) ON DELETE RESTRICT;

-- Fk Constraint: publication_events publication_events_operation_id_fkey

ALTER TABLE ONLY content.publication_events
    ADD CONSTRAINT publication_events_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES content.operations(operation_id) ON DELETE RESTRICT;

-- Fk Constraint: publication_events publication_events_release_id_fkey

ALTER TABLE ONLY content.publication_events
    ADD CONSTRAINT publication_events_release_id_fkey FOREIGN KEY (release_id) REFERENCES content.releases(release_id) ON DELETE RESTRICT;

-- Fk Constraint: questions questions_release_id_fkey

ALTER TABLE ONLY content.questions
    ADD CONSTRAINT questions_release_id_fkey FOREIGN KEY (release_id) REFERENCES content.releases(release_id) ON DELETE RESTRICT;

-- Fk Constraint: questions questions_release_id_quiz_id_fkey

ALTER TABLE ONLY content.questions
    ADD CONSTRAINT questions_release_id_quiz_id_fkey FOREIGN KEY (release_id, quiz_id) REFERENCES content.quizzes(release_id, id) ON DELETE RESTRICT;

-- Fk Constraint: quizzes quizzes_release_id_fkey

ALTER TABLE ONLY content.quizzes
    ADD CONSTRAINT quizzes_release_id_fkey FOREIGN KEY (release_id) REFERENCES content.releases(release_id) ON DELETE RESTRICT;

-- Fk Constraint: quizzes quizzes_release_id_subject_id_fkey

ALTER TABLE ONLY content.quizzes
    ADD CONSTRAINT quizzes_release_id_subject_id_fkey FOREIGN KEY (release_id, subject_id) REFERENCES content.subjects(release_id, id) ON DELETE RESTRICT;

-- Fk Constraint: quizzes quizzes_release_id_topic_id_fkey

ALTER TABLE ONLY content.quizzes
    ADD CONSTRAINT quizzes_release_id_topic_id_fkey FOREIGN KEY (release_id, topic_id) REFERENCES content.topics(release_id, id) ON DELETE RESTRICT;

-- Fk Constraint: releases releases_originating_operation_id_fkey

ALTER TABLE ONLY content.releases
    ADD CONSTRAINT releases_originating_operation_id_fkey FOREIGN KEY (originating_operation_id) REFERENCES content.operations(operation_id) ON DELETE RESTRICT;

-- Fk Constraint: subjects subjects_release_id_fkey

ALTER TABLE ONLY content.subjects
    ADD CONSTRAINT subjects_release_id_fkey FOREIGN KEY (release_id) REFERENCES content.releases(release_id) ON DELETE RESTRICT;

-- Fk Constraint: topics topics_release_id_fkey

ALTER TABLE ONLY content.topics
    ADD CONSTRAINT topics_release_id_fkey FOREIGN KEY (release_id) REFERENCES content.releases(release_id) ON DELETE RESTRICT;

-- Fk Constraint: topics topics_release_id_subject_id_fkey

ALTER TABLE ONLY content.topics
    ADD CONSTRAINT topics_release_id_subject_id_fkey FOREIGN KEY (release_id, subject_id) REFERENCES content.subjects(release_id, id) ON DELETE RESTRICT;

-- Acl: SCHEMA admin_auth

GRANT USAGE ON SCHEMA admin_auth TO meducation_session;
GRANT USAGE ON SCHEMA admin_auth TO meducation_backup;

-- Acl: SCHEMA content

GRANT USAGE ON SCHEMA content TO meducation_reader;
GRANT USAGE ON SCHEMA content TO meducation_backup;
GRANT USAGE ON SCHEMA content TO meducation_operator;
GRANT USAGE ON SCHEMA content TO meducation_editor;

-- Acl: FUNCTION activate_release(op_id uuid, target uuid, expected_sequence bigint, who text, why text)

REVOKE ALL ON FUNCTION content.activate_release(op_id uuid, target uuid, expected_sequence bigint, who text, why text) FROM PUBLIC;
GRANT ALL ON FUNCTION content.activate_release(op_id uuid, target uuid, expected_sequence bigint, who text, why text) TO meducation_operator;
GRANT ALL ON FUNCTION content.activate_release(op_id uuid, target uuid, expected_sequence bigint, who text, why text) TO meducation_editor;

-- Acl: FUNCTION append_only()

REVOKE ALL ON FUNCTION content.append_only() FROM PUBLIC;

-- Acl: FUNCTION checked_artifacts(qtext text, ftext text)

REVOKE ALL ON FUNCTION content.checked_artifacts(qtext text, ftext text) FROM PUBLIC;

-- Acl: FUNCTION claim_operation(op_id uuid, operation_action text, payload jsonb, who text, why text)

REVOKE ALL ON FUNCTION content.claim_operation(op_id uuid, operation_action text, payload jsonb, who text, why text) FROM PUBLIC;

-- Acl: FUNCTION fields(value jsonb, required text[], optional text[])

REVOKE ALL ON FUNCTION content.fields(value jsonb, required text[], optional text[]) FROM PUBLIC;

-- Acl: FUNCTION finish_operation(op_id uuid, outcome jsonb, target uuid, draft_version bigint)

REVOKE ALL ON FUNCTION content.finish_operation(op_id uuid, outcome jsonb, target uuid, draft_version bigint) FROM PUBLIC;

-- Acl: FUNCTION guard_content_row()

REVOKE ALL ON FUNCTION content.guard_content_row() FROM PUBLIC;

-- Acl: FUNCTION guard_operation()

REVOKE ALL ON FUNCTION content.guard_operation() FROM PUBLIC;

-- Acl: FUNCTION guard_release()

REVOKE ALL ON FUNCTION content.guard_release() FROM PUBLIC;

-- Acl: FUNCTION json_clean(value json)

REVOKE ALL ON FUNCTION content.json_clean(value json) FROM PUBLIC;

-- Acl: FUNCTION nonblank(value text)

REVOKE ALL ON FUNCTION content.nonblank(value text) FROM PUBLIC;
GRANT ALL ON FUNCTION content.nonblank(value text) TO meducation_editor;

-- Acl: FUNCTION pretty_json(value json, depth integer)

REVOKE ALL ON FUNCTION content.pretty_json(value json, depth integer) FROM PUBLIC;

-- Acl: FUNCTION release_documents(target uuid)

REVOKE ALL ON FUNCTION content.release_documents(target uuid) FROM PUBLIC;

-- Acl: FUNCTION require_finalized()

REVOKE ALL ON FUNCTION content.require_finalized() FROM PUBLIC;

-- Acl: FUNCTION require_operation_result()

REVOKE ALL ON FUNCTION content.require_operation_result() FROM PUBLIC;

-- Acl: FUNCTION store_release(op_id uuid, qtext text, ftext text, source_hashes jsonb, who text, why text)

REVOKE ALL ON FUNCTION content.store_release(op_id uuid, qtext text, ftext text, source_hashes jsonb, who text, why text) FROM PUBLIC;
GRANT ALL ON FUNCTION content.store_release(op_id uuid, qtext text, ftext text, source_hashes jsonb, who text, why text) TO meducation_operator;
GRANT ALL ON FUNCTION content.store_release(op_id uuid, qtext text, ftext text, source_hashes jsonb, who text, why text) TO meducation_editor;

-- Acl: FUNCTION text_fields(value jsonb, required text[], optional text[])

REVOKE ALL ON FUNCTION content.text_fields(value jsonb, required text[], optional text[]) FROM PUBLIC;

-- Acl: TABLE releases

GRANT SELECT ON TABLE content.releases TO meducation_backup;
GRANT SELECT ON TABLE content.releases TO meducation_operator;
GRANT SELECT ON TABLE content.releases TO meducation_editor;

-- Acl: FUNCTION validate_release(r content.releases)

REVOKE ALL ON FUNCTION content.validate_release(r content.releases) FROM PUBLIC;

-- Acl: TABLE logins

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE admin_auth.logins TO meducation_session;
GRANT SELECT ON TABLE admin_auth.logins TO meducation_backup;

-- Acl: TABLE rate_limits

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE admin_auth.rate_limits TO meducation_session;
GRANT SELECT ON TABLE admin_auth.rate_limits TO meducation_backup;

-- Acl: TABLE sessions

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE admin_auth.sessions TO meducation_session;
GRANT SELECT ON TABLE admin_auth.sessions TO meducation_backup;

-- Acl: TABLE alembic_version (Alembic creates it before this script runs)

GRANT SELECT ON TABLE content.alembic_version TO meducation_operator;

-- Acl: TABLE active_publication

GRANT SELECT ON TABLE content.active_publication TO meducation_backup;
GRANT SELECT ON TABLE content.active_publication TO meducation_operator;
GRANT SELECT ON TABLE content.active_publication TO meducation_reader;
GRANT SELECT ON TABLE content.active_publication TO meducation_editor;

-- Acl: TABLE audit_events

GRANT SELECT ON TABLE content.audit_events TO meducation_backup;
GRANT SELECT ON TABLE content.audit_events TO meducation_operator;

-- Acl: TABLE decks

GRANT SELECT ON TABLE content.decks TO meducation_backup;
GRANT SELECT ON TABLE content.decks TO meducation_operator;

-- Acl: TABLE draft_changes

GRANT SELECT ON TABLE content.draft_changes TO meducation_backup;
GRANT SELECT,INSERT ON TABLE content.draft_changes TO meducation_editor;
GRANT SELECT ON TABLE content.draft_changes TO meducation_operator;

-- Acl: SEQUENCE draft_changes_change_id_seq

GRANT SELECT ON SEQUENCE content.draft_changes_change_id_seq TO meducation_backup;
GRANT SELECT,USAGE ON SEQUENCE content.draft_changes_change_id_seq TO meducation_editor;

-- Acl: TABLE draft_decks

GRANT SELECT ON TABLE content.draft_decks TO meducation_backup;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE content.draft_decks TO meducation_editor;
GRANT SELECT ON TABLE content.draft_decks TO meducation_operator;

-- Acl: TABLE draft_flashcards

GRANT SELECT ON TABLE content.draft_flashcards TO meducation_backup;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE content.draft_flashcards TO meducation_editor;
GRANT SELECT ON TABLE content.draft_flashcards TO meducation_operator;

-- Acl: SEQUENCE draft_question_ids

GRANT SELECT ON SEQUENCE content.draft_question_ids TO meducation_backup;
GRANT SELECT,USAGE ON SEQUENCE content.draft_question_ids TO meducation_editor;

-- Acl: TABLE draft_questions

GRANT SELECT ON TABLE content.draft_questions TO meducation_backup;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE content.draft_questions TO meducation_editor;
GRANT SELECT ON TABLE content.draft_questions TO meducation_operator;

-- Acl: SEQUENCE draft_quiz_ids

GRANT SELECT ON SEQUENCE content.draft_quiz_ids TO meducation_backup;
GRANT SELECT,USAGE ON SEQUENCE content.draft_quiz_ids TO meducation_editor;

-- Acl: TABLE draft_quizzes

GRANT SELECT ON TABLE content.draft_quizzes TO meducation_backup;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE content.draft_quizzes TO meducation_editor;
GRANT SELECT ON TABLE content.draft_quizzes TO meducation_operator;

-- Acl: TABLE draft_state

GRANT SELECT ON TABLE content.draft_state TO meducation_backup;
GRANT SELECT,UPDATE ON TABLE content.draft_state TO meducation_editor;
GRANT SELECT ON TABLE content.draft_state TO meducation_operator;

-- Acl: SEQUENCE draft_subject_ids

GRANT SELECT ON SEQUENCE content.draft_subject_ids TO meducation_backup;
GRANT SELECT,USAGE ON SEQUENCE content.draft_subject_ids TO meducation_editor;

-- Acl: TABLE draft_subjects

GRANT SELECT ON TABLE content.draft_subjects TO meducation_backup;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE content.draft_subjects TO meducation_editor;
GRANT SELECT ON TABLE content.draft_subjects TO meducation_operator;

-- Acl: SEQUENCE draft_topic_ids

GRANT SELECT ON SEQUENCE content.draft_topic_ids TO meducation_backup;
GRANT SELECT,USAGE ON SEQUENCE content.draft_topic_ids TO meducation_editor;

-- Acl: TABLE draft_topics

GRANT SELECT ON TABLE content.draft_topics TO meducation_backup;
GRANT SELECT ON TABLE content.draft_topics TO meducation_operator;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE content.draft_topics TO meducation_editor;

-- Acl: TABLE flashcards

GRANT SELECT ON TABLE content.flashcards TO meducation_backup;
GRANT SELECT ON TABLE content.flashcards TO meducation_operator;

-- Acl: TABLE import_events

GRANT SELECT ON TABLE content.import_events TO meducation_backup;
GRANT SELECT ON TABLE content.import_events TO meducation_operator;

-- Acl: TABLE operations

GRANT SELECT ON TABLE content.operations TO meducation_backup;
GRANT SELECT ON TABLE content.operations TO meducation_operator;

-- Acl: TABLE publication_events

GRANT SELECT ON TABLE content.publication_events TO meducation_backup;
GRANT SELECT ON TABLE content.publication_events TO meducation_operator;
GRANT SELECT ON TABLE content.publication_events TO meducation_editor;

-- Acl: SEQUENCE publication_events_publication_sequence_seq

GRANT SELECT ON SEQUENCE content.publication_events_publication_sequence_seq TO meducation_backup;

-- Acl: TABLE published_decks

GRANT SELECT ON TABLE content.published_decks TO meducation_backup;
GRANT SELECT ON TABLE content.published_decks TO meducation_operator;
GRANT SELECT ON TABLE content.published_decks TO meducation_reader;

-- Acl: TABLE published_flashcards

GRANT SELECT ON TABLE content.published_flashcards TO meducation_backup;
GRANT SELECT ON TABLE content.published_flashcards TO meducation_operator;
GRANT SELECT ON TABLE content.published_flashcards TO meducation_reader;

-- Acl: TABLE questions

GRANT SELECT ON TABLE content.questions TO meducation_backup;
GRANT SELECT ON TABLE content.questions TO meducation_operator;

-- Acl: TABLE published_questions

GRANT SELECT ON TABLE content.published_questions TO meducation_backup;
GRANT SELECT ON TABLE content.published_questions TO meducation_operator;
GRANT SELECT ON TABLE content.published_questions TO meducation_reader;

-- Acl: TABLE quizzes

GRANT SELECT ON TABLE content.quizzes TO meducation_backup;
GRANT SELECT ON TABLE content.quizzes TO meducation_operator;

-- Acl: TABLE published_quizzes

GRANT SELECT ON TABLE content.published_quizzes TO meducation_backup;
GRANT SELECT ON TABLE content.published_quizzes TO meducation_operator;
GRANT SELECT ON TABLE content.published_quizzes TO meducation_reader;

-- Acl: TABLE published_releases

GRANT SELECT ON TABLE content.published_releases TO meducation_backup;
GRANT SELECT ON TABLE content.published_releases TO meducation_operator;
GRANT SELECT ON TABLE content.published_releases TO meducation_reader;
GRANT SELECT ON TABLE content.published_releases TO meducation_editor;

-- Acl: TABLE subjects

GRANT SELECT ON TABLE content.subjects TO meducation_backup;
GRANT SELECT ON TABLE content.subjects TO meducation_operator;

-- Acl: TABLE published_subjects

GRANT SELECT ON TABLE content.published_subjects TO meducation_backup;
GRANT SELECT ON TABLE content.published_subjects TO meducation_operator;
GRANT SELECT ON TABLE content.published_subjects TO meducation_reader;

-- Acl: TABLE topics

GRANT SELECT ON TABLE content.topics TO meducation_backup;
GRANT SELECT ON TABLE content.topics TO meducation_operator;

-- Acl: TABLE published_topics

GRANT SELECT ON TABLE content.published_topics TO meducation_backup;
GRANT SELECT ON TABLE content.published_topics TO meducation_reader;

-- Acl: TABLE schema_version

GRANT SELECT ON TABLE content.schema_version TO meducation_backup;
GRANT SELECT ON TABLE content.schema_version TO meducation_operator;
GRANT SELECT ON TABLE content.schema_version TO meducation_reader;

-- Singleton rows
INSERT INTO content.active_publication VALUES (true, NULL, 0);
INSERT INTO content.draft_state VALUES (true, NULL, 0);
