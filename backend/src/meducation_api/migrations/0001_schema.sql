-- PG17 only. All objects are created as meducation_owner by the explicit migration job.
-- Match Python str.strip without changing any authored strings.
CREATE FUNCTION content.nonblank(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, content, pg_temp AS $$
    SELECT btrim(value, U&'\0009\000A\000B\000C\000D\001C\001D\001E\001F\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000') <> ''
$$;
CREATE TABLE content.operations (
    operation_id uuid PRIMARY KEY,
    action text NOT NULL,
    fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
    actor text NOT NULL CHECK (content.nonblank(actor) AND length(actor) <= 256),
    reason text NOT NULL CHECK (content.nonblank(reason) AND length(reason) <= 4096),
    result jsonb,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE content.releases (
    release_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    state text NOT NULL CHECK (state IN ('building', 'finalized')),
    quiz_schema_version integer NOT NULL DEFAULT 4 CHECK (quiz_schema_version = 4),
    flashcard_schema_version integer NOT NULL DEFAULT 2 CHECK (flashcard_schema_version = 2),
    quiz_revision text NOT NULL CHECK (quiz_revision ~ '^sha256-[0-9a-f]{64}$'),
    flashcard_revision text NOT NULL CHECK (flashcard_revision ~ '^sha256-[0-9a-f]{64}$'),
    quiz_artifact text NOT NULL,
    flashcard_artifact text NOT NULL,
    originating_operation_id uuid NOT NULL REFERENCES content.operations ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    finalized_at timestamptz,
    CHECK ((state = 'finalized') = (finalized_at IS NOT NULL)),
    UNIQUE (quiz_revision, flashcard_revision)
);
CREATE TABLE content.audit_events (
    event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id uuid NOT NULL REFERENCES content.operations ON DELETE RESTRICT,
    event_type text NOT NULL,
    actor text NOT NULL,
    reason text NOT NULL,
    release_id uuid REFERENCES content.releases ON DELETE RESTRICT,
    draft_revision bigint,
    detail jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(detail) = 'object' AND octet_length(detail::text) <= 8192),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (operation_id, event_type)
);
CREATE TABLE content.id_reservations (
    operation_id uuid PRIMARY KEY REFERENCES content.operations ON DELETE RESTRICT,
    expected_draft_revision bigint NOT NULL CHECK (expected_draft_revision >= 0),
    expected_publication_sequence bigint NOT NULL CHECK (expected_publication_sequence >= 0),
    allocated_ids jsonb NOT NULL CHECK (jsonb_typeof(allocated_ids) = 'object')
);
CREATE TABLE content.entity_ids (
    kind text NOT NULL CHECK (kind IN ('s', 'q', 'i', 'd', 'f')),
    id text NOT NULL,
    origin text NOT NULL CHECK (origin IN ('imported', 'allocated')),
    allocation_operation_id uuid REFERENCES content.id_reservations ON DELETE RESTRICT,
    materialized boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (kind, id),
    CHECK ((origin = 'allocated') = (allocation_operation_id IS NOT NULL)),
    CHECK ((kind IN ('s', 'q', 'i') AND id ~ ('^' || kind || '[1-9][0-9]*$')) OR
           (kind IN ('d', 'f') AND id ~ ('^' || kind || '[a-zA-Z0-9-]+$')))
);
CREATE TABLE content.id_counters (
    kind text PRIMARY KEY CHECK (kind IN ('s', 'q', 'i', 'd', 'f')),
    next_number bigint NOT NULL CHECK (next_number BETWEEN 1 AND 9007199254740992)
);
INSERT INTO content.id_counters SELECT unnest(ARRAY['s', 'q', 'i', 'd', 'f']), 1;

CREATE TABLE content.subjects (
    release_id uuid NOT NULL REFERENCES content.releases ON DELETE RESTRICT,
    id text NOT NULL, kind text NOT NULL DEFAULT 's' CHECK (kind = 's'),
    position integer NOT NULL CHECK (position >= 0),
    name text NOT NULL CHECK (content.nonblank(name)), accent text NOT NULL,
    PRIMARY KEY (release_id, id), UNIQUE (release_id, position),
    FOREIGN KEY (kind, id) REFERENCES content.entity_ids ON DELETE RESTRICT
);
CREATE TABLE content.quizzes (
    release_id uuid NOT NULL REFERENCES content.releases ON DELETE RESTRICT,
    id text NOT NULL, kind text NOT NULL DEFAULT 'q' CHECK (kind = 'q'),
    position integer NOT NULL CHECK (position >= 0),
    subject_id text NOT NULL, name text NOT NULL CHECK (content.nonblank(name)),
    PRIMARY KEY (release_id, id), UNIQUE (release_id, position),
    FOREIGN KEY (kind, id) REFERENCES content.entity_ids ON DELETE RESTRICT,
    FOREIGN KEY (release_id, subject_id) REFERENCES content.subjects ON DELETE RESTRICT
);
CREATE TABLE content.questions (
    release_id uuid NOT NULL REFERENCES content.releases ON DELETE RESTRICT,
    id text NOT NULL, kind text NOT NULL DEFAULT 'i' CHECK (kind = 'i'),
    position integer NOT NULL CHECK (position >= 0), quiz_id text NOT NULL,
    stem text NOT NULL CHECK (content.nonblank(stem)),
    choices jsonb NOT NULL CHECK (jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) >= 2),
    answer text, verified_answer text, answer_note text,
    rationale text NOT NULL CHECK (content.nonblank(rationale)),
    rationale_meta jsonb CHECK (jsonb_typeof(rationale_meta) = 'object'),
    choice_explanations jsonb CHECK (jsonb_typeof(choice_explanations) = 'object'),
    pearls jsonb CHECK (jsonb_typeof(pearls) = 'array'),
    metadata jsonb CHECK (jsonb_typeof(metadata) = 'object' AND metadata <> '{}'),
    PRIMARY KEY (release_id, id), UNIQUE (release_id, position),
    FOREIGN KEY (kind, id) REFERENCES content.entity_ids ON DELETE RESTRICT,
    FOREIGN KEY (release_id, quiz_id) REFERENCES content.quizzes ON DELETE RESTRICT
);
CREATE TABLE content.decks (
    release_id uuid NOT NULL REFERENCES content.releases ON DELETE RESTRICT,
    id text NOT NULL, kind text NOT NULL DEFAULT 'd' CHECK (kind = 'd'),
    position integer NOT NULL CHECK (position >= 0),
    subject_id text NOT NULL, name text NOT NULL CHECK (content.nonblank(name)), description text,
    PRIMARY KEY (release_id, id), UNIQUE (release_id, position),
    FOREIGN KEY (kind, id) REFERENCES content.entity_ids ON DELETE RESTRICT,
    FOREIGN KEY (release_id, subject_id) REFERENCES content.subjects ON DELETE RESTRICT
);
CREATE TABLE content.flashcards (
    release_id uuid NOT NULL REFERENCES content.releases ON DELETE RESTRICT,
    id text NOT NULL, kind text NOT NULL DEFAULT 'f' CHECK (kind = 'f'),
    position integer NOT NULL CHECK (position >= 0), deck_id text NOT NULL,
    front text NOT NULL CHECK (content.nonblank(front)), back text NOT NULL CHECK (content.nonblank(back)),
    sources text, review_note text,
    PRIMARY KEY (release_id, id), UNIQUE (release_id, position),
    FOREIGN KEY (kind, id) REFERENCES content.entity_ids ON DELETE RESTRICT,
    FOREIGN KEY (release_id, deck_id) REFERENCES content.decks ON DELETE RESTRICT
);
CREATE INDEX ON content.quizzes (release_id, subject_id, position);
CREATE INDEX ON content.questions (release_id, quiz_id, position);
CREATE INDEX ON content.decks (release_id, subject_id, position);
CREATE INDEX ON content.flashcards (release_id, deck_id, position);

CREATE TABLE content.import_events (
    operation_id uuid PRIMARY KEY REFERENCES content.operations ON DELETE RESTRICT,
    release_id uuid NOT NULL REFERENCES content.releases ON DELETE RESTRICT,
    quiz_source_sha256 text NOT NULL CHECK (quiz_source_sha256 ~ '^[0-9a-f]{64}$'),
    flashcard_source_sha256 text NOT NULL CHECK (flashcard_source_sha256 ~ '^[0-9a-f]{64}$'),
    actor text NOT NULL, reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE content.publication_events (
    publication_sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    release_id uuid NOT NULL REFERENCES content.releases ON DELETE RESTRICT,
    prior_sequence bigint NOT NULL CHECK (prior_sequence >= 0),
    operation_id uuid NOT NULL UNIQUE REFERENCES content.operations ON DELETE RESTRICT,
    actor text NOT NULL, reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (publication_sequence, release_id)
);
CREATE TABLE content.active_publication (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    release_id uuid, publication_sequence bigint NOT NULL DEFAULT 0,
    CHECK ((release_id IS NULL AND publication_sequence = 0) OR
           (release_id IS NOT NULL AND publication_sequence > 0)),
    FOREIGN KEY (publication_sequence, release_id) REFERENCES content.publication_events (publication_sequence, release_id) ON DELETE RESTRICT
);
INSERT INTO content.active_publication DEFAULT VALUES;
CREATE TABLE content.draft (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    base_release_id uuid, base_publication_sequence bigint NOT NULL DEFAULT 0,
    revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
    quiz_document text NOT NULL, flashcard_document text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK ((base_release_id IS NULL AND base_publication_sequence = 0) OR
           (base_release_id IS NOT NULL AND base_publication_sequence > 0)),
    FOREIGN KEY (base_publication_sequence, base_release_id) REFERENCES content.publication_events (publication_sequence, release_id) ON DELETE RESTRICT
);
INSERT INTO content.draft (quiz_document, flashcard_document) VALUES
    (E'{\n  "schemaVersion": 4,\n  "subjects": [],\n  "quizzes": [],\n  "questions": []\n}\n',
     E'{\n  "schemaVersion": 2,\n  "decks": [],\n  "cards": []\n}\n');

CREATE FUNCTION content.json_clean(value json) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog, content, pg_temp AS $$
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
CREATE FUNCTION content.pretty_json(value json, depth integer DEFAULT 0) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog, content, pg_temp AS $$
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
CREATE FUNCTION content.fields(value jsonb, required text[], optional text[] DEFAULT '{}') RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, content, pg_temp AS $$
    SELECT coalesce(jsonb_typeof(value) = 'object' AND value ?& required AND
        NOT EXISTS (SELECT 1 FROM jsonb_object_keys(value) k WHERE NOT k = ANY(required || optional)), false)
$$;
CREATE FUNCTION content.text_fields(value jsonb, required text[], optional text[] DEFAULT '{}') RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, content, pg_temp AS $$
    SELECT NOT EXISTS (SELECT 1 FROM unnest(required || optional) k WHERE
        (k = ANY(required) OR value ? k) AND jsonb_typeof(value -> k) IS DISTINCT FROM 'string')
$$;
CREATE FUNCTION content.string_array(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, content, pg_temp AS $$
    SELECT coalesce(jsonb_typeof(value) = 'array' AND NOT EXISTS
        (SELECT 1 FROM jsonb_array_elements(value) v WHERE jsonb_typeof(v) <> 'string'), false)
$$;

CREATE FUNCTION content.validate_pair(q jsonb, f jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, content, pg_temp AS $$
DECLARE v jsonb; choice jsonb; meta jsonb; ids text[];
BEGIN
    IF NOT content.fields(q, ARRAY['schemaVersion','subjects','quizzes','questions']) OR
       NOT content.fields(f, ARRAY['schemaVersion','decks','cards']) OR
       q->'schemaVersion' <> '4'::jsonb OR f->'schemaVersion' <> '2'::jsonb THEN
        RAISE EXCEPTION 'Invalid paired bank envelope';
    END IF;
    IF NOT content.json_clean(q::json) OR NOT content.json_clean(f::json) THEN RAISE EXCEPTION 'Stored null is forbidden'; END IF;
    IF jsonb_typeof(q->'subjects') <> 'array' OR jsonb_typeof(q->'quizzes') <> 'array' OR
       jsonb_typeof(q->'questions') <> 'array' OR jsonb_typeof(f->'decks') <> 'array' OR jsonb_typeof(f->'cards') <> 'array' THEN
        RAISE EXCEPTION 'Invalid bank collections';
    END IF;
    FOR v IN SELECT value FROM jsonb_array_elements(q->'subjects') LOOP
        IF NOT content.fields(v, ARRAY['id','name','accent']) OR NOT content.text_fields(v, ARRAY['id','name','accent']) OR
           v->>'id' !~ '^s[1-9][0-9]*$' OR NOT content.nonblank(v->>'name') THEN RAISE EXCEPTION 'Invalid subject'; END IF;
    END LOOP;
    FOR v IN SELECT value FROM jsonb_array_elements(q->'quizzes') LOOP
        IF NOT content.fields(v, ARRAY['id','subjectId','name']) OR NOT content.text_fields(v, ARRAY['id','subjectId','name']) OR
           v->>'id' !~ '^q[1-9][0-9]*$' OR NOT content.nonblank(v->>'name') THEN RAISE EXCEPTION 'Invalid quiz'; END IF;
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(q->'subjects') s WHERE s->>'id' = v->>'subjectId') OR
           NOT EXISTS (SELECT 1 FROM jsonb_array_elements(q->'questions') i WHERE i->>'quizId' = v->>'id') THEN RAISE EXCEPTION 'Invalid quiz relationships'; END IF;
    END LOOP;
    FOR v IN SELECT value FROM jsonb_array_elements(q->'questions') LOOP
        IF NOT content.fields(v, ARRAY['id','quizId','stem','choices','rationale'], ARRAY['answer','verifiedAnswer','answerNote','rationaleMeta','choiceExplanations','pearls','metadata']) OR
           NOT content.text_fields(v, ARRAY['id','quizId','stem','rationale'], ARRAY['answer','verifiedAnswer','answerNote']) OR
           v->>'id' !~ '^i[1-9][0-9]*$' OR NOT content.nonblank(v->>'stem') OR NOT content.nonblank(v->>'rationale') OR
           jsonb_typeof(v->'choices') <> 'array' OR jsonb_array_length(v->'choices') < 2 THEN RAISE EXCEPTION 'Invalid question'; END IF;
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(q->'quizzes') t WHERE t->>'id' = v->>'quizId') THEN RAISE EXCEPTION 'Invalid question parent'; END IF;
        ids := '{}';
        FOR choice IN SELECT value FROM jsonb_array_elements(v->'choices') LOOP
            IF NOT content.fields(choice, ARRAY['id','text']) OR NOT content.text_fields(choice, ARRAY['id','text']) OR
               choice->>'id' !~ '^[A-Z]$' OR NOT content.nonblank(choice->>'text') OR choice->>'id' = ANY(ids) THEN RAISE EXCEPTION 'Invalid choices'; END IF;
            ids := array_append(ids, choice->>'id');
        END LOOP;
        IF coalesce(v->>'verifiedAnswer', v->>'answer') IS NULL OR
           ((v ? 'answer') AND NOT (v->>'answer' = ANY(ids))) OR
           ((v ? 'verifiedAnswer') AND NOT (v->>'verifiedAnswer' = ANY(ids))) THEN RAISE EXCEPTION 'Invalid answer provenance'; END IF;
        IF v ? 'choiceExplanations' THEN
            IF jsonb_typeof(v->'choiceExplanations') <> 'object' OR EXISTS
                (SELECT 1 FROM jsonb_each(v->'choiceExplanations') e WHERE NOT e.key = ANY(ids) OR jsonb_typeof(e.value) <> 'string') THEN RAISE EXCEPTION 'Invalid choice explanations'; END IF;
        END IF;
        IF v ? 'pearls' AND NOT content.string_array(v->'pearls') THEN RAISE EXCEPTION 'Invalid pearls'; END IF;
        IF v ? 'metadata' THEN
            meta := v->'metadata';
            IF NOT content.fields(meta, '{}', ARRAY['topic','subtopic','system','difficulty','questionType','tags']) OR
               NOT content.text_fields(meta, '{}', ARRAY['topic','subtopic','system','difficulty','questionType']) OR
               NOT EXISTS (SELECT 1 FROM jsonb_each(meta) e WHERE e.value NOT IN ('""'::jsonb, '[]'::jsonb)) OR
               (meta ? 'tags' AND NOT content.string_array(meta->'tags')) OR
               (meta ? 'difficulty' AND meta->>'difficulty' NOT IN ('easy','medium','hard')) THEN RAISE EXCEPTION 'Invalid metadata'; END IF;
        END IF;
        IF v ? 'rationaleMeta' THEN
            meta := v->'rationaleMeta';
            IF NOT content.fields(meta, '{}', ARRAY['sources','answerReviewNote','provenance','reviewedAt','reviewNote']) OR
               NOT content.text_fields(meta, '{}', ARRAY['sources','answerReviewNote','provenance','reviewedAt','reviewNote']) OR
               (meta ? 'provenance' AND meta->>'provenance' NOT IN ('source_migrated','ai_draft_reviewed')) OR
               (meta->>'provenance' = 'ai_draft_reviewed' AND (coalesce(meta->>'reviewedAt','') = '' OR coalesce(meta->>'reviewNote','') = '')) THEN RAISE EXCEPTION 'Invalid rationale metadata'; END IF;
        END IF;
    END LOOP;
    FOR v IN SELECT value FROM jsonb_array_elements(f->'decks') LOOP
        IF NOT content.fields(v, ARRAY['id','subjectId','name'], ARRAY['description']) OR NOT content.text_fields(v, ARRAY['id','subjectId','name'], ARRAY['description']) OR
           v->>'id' !~ '^d[a-zA-Z0-9-]+$' OR NOT content.nonblank(v->>'name') OR
           NOT EXISTS (SELECT 1 FROM jsonb_array_elements(q->'subjects') s WHERE s->>'id' = v->>'subjectId') THEN RAISE EXCEPTION 'Invalid deck'; END IF;
    END LOOP;
    FOR v IN SELECT value FROM jsonb_array_elements(f->'cards') LOOP
        IF NOT content.fields(v, ARRAY['id','deckId','front','back'], ARRAY['sources','reviewNote']) OR NOT content.text_fields(v, ARRAY['id','deckId','front','back'], ARRAY['sources','reviewNote']) OR
           v->>'id' !~ '^f[a-zA-Z0-9-]+$' OR NOT content.nonblank(v->>'front') OR NOT content.nonblank(v->>'back') OR
           NOT EXISTS (SELECT 1 FROM jsonb_array_elements(f->'decks') d WHERE d->>'id' = v->>'deckId') THEN RAISE EXCEPTION 'Invalid flashcard'; END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(q->'questions') WITH ORDINALITY e(v, n) GROUP BY e.v->>'quizId' HAVING max(n)-min(n)+1 <> count(*)) THEN RAISE EXCEPTION 'Noncontiguous questions'; END IF;
    IF EXISTS (
        SELECT 1 FROM (SELECT q->'subjects' a UNION ALL SELECT q->'quizzes' UNION ALL SELECT q->'questions' UNION ALL SELECT f->'decks' UNION ALL SELECT f->'cards') lists
        WHERE (SELECT count(*) FROM jsonb_array_elements(a)) <> (SELECT count(DISTINCT e.v->>'id') FROM jsonb_array_elements(a) e(v))
    ) THEN RAISE EXCEPTION 'Duplicate entity IDs'; END IF;
END $$;
