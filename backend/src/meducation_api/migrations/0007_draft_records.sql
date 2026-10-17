-- Per-record draft. The paired draft document, reservations, history and editor
-- functions stay in place until step 4c; the editor no longer needs them.
-- Nested values use json (not jsonb) so authored key order survives byte for byte.
-- field_order holds a record's top-level key order only when it is not canonical.
CREATE TABLE content.draft_subjects (
    id text PRIMARY KEY CHECK (id ~ '^s[1-9][0-9]*$'),
    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    position numeric NOT NULL UNIQUE,
    field_order text[],
    name text NOT NULL CHECK (content.nonblank(name)),
    accent text NOT NULL
);
CREATE TABLE content.draft_quizzes (
    id text PRIMARY KEY CHECK (id ~ '^q[1-9][0-9]*$'),
    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    position numeric NOT NULL UNIQUE,
    field_order text[],
    subject_id text NOT NULL REFERENCES content.draft_subjects ON DELETE RESTRICT,
    name text NOT NULL CHECK (content.nonblank(name))
);
CREATE TABLE content.draft_questions (
    id text PRIMARY KEY CHECK (id ~ '^i[1-9][0-9]*$'),
    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    position numeric NOT NULL UNIQUE,
    field_order text[],
    quiz_id text NOT NULL REFERENCES content.draft_quizzes ON DELETE RESTRICT,
    stem text NOT NULL CHECK (content.nonblank(stem)),
    choices json NOT NULL CHECK (json_typeof(choices) = 'array' AND json_array_length(choices) >= 2),
    answer text, verified_answer text, answer_note text,
    rationale text NOT NULL CHECK (content.nonblank(rationale)),
    rationale_meta json CHECK (json_typeof(rationale_meta) = 'object'),
    choice_explanations json CHECK (json_typeof(choice_explanations) = 'object'),
    pearls json CHECK (json_typeof(pearls) = 'array'),
    metadata json CHECK (json_typeof(metadata) = 'object' AND metadata::jsonb <> '{}')
);
CREATE TABLE content.draft_decks (
    id text PRIMARY KEY CHECK (id ~ '^d[a-zA-Z0-9-]+$'),
    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    position numeric NOT NULL UNIQUE,
    field_order text[],
    subject_id text NOT NULL REFERENCES content.draft_subjects ON DELETE RESTRICT,
    name text NOT NULL CHECK (content.nonblank(name)),
    description text
);
CREATE TABLE content.draft_flashcards (
    id text PRIMARY KEY CHECK (id ~ '^f[a-zA-Z0-9-]+$'),
    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    position numeric NOT NULL UNIQUE,
    field_order text[],
    deck_id text NOT NULL REFERENCES content.draft_decks ON DELETE RESTRICT,
    front text NOT NULL CHECK (content.nonblank(front)),
    back text NOT NULL CHECK (content.nonblank(back)),
    sources text, review_note text
);
CREATE INDEX ON content.draft_quizzes (subject_id);
CREATE INDEX ON content.draft_questions (quiz_id);
CREATE INDEX ON content.draft_decks (subject_id);
CREATE INDEX ON content.draft_flashcards (deck_id);

CREATE TABLE content.draft_changes (
    change_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    actor text NOT NULL CHECK (content.nonblank(actor) AND length(actor) <= 1024),
    kind text NOT NULL CHECK (kind IN ('subjects', 'quizzes', 'questions', 'decks', 'cards')),
    entity_id text NOT NULL,
    action text NOT NULL CHECK (action IN ('create', 'update', 'delete', 'move')),
    before json CHECK (json_typeof(before) = 'object'),
    after json CHECK (json_typeof(after) = 'object'),
    CHECK ((action = 'create') = (before IS NULL)),
    CHECK ((action = 'delete') = (after IS NULL))
);
CREATE INDEX ON content.draft_changes (kind, entity_id, change_id);
CREATE TRIGGER draft_changes_immutable BEFORE UPDATE OR DELETE ON content.draft_changes
    FOR EACH ROW EXECUTE FUNCTION content.append_only();
CREATE TABLE content.draft_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    base_release_id uuid REFERENCES content.releases ON DELETE RESTRICT,
    published_change_id bigint NOT NULL DEFAULT 0 CHECK (published_change_id >= 0)
);

CREATE SEQUENCE content.draft_subject_ids AS bigint MINVALUE 1;
CREATE SEQUENCE content.draft_quiz_ids AS bigint MINVALUE 1;
CREATE SEQUENCE content.draft_question_ids AS bigint MINVALUE 1;

-- Publication registers draft IDs as trusted identities; the editor-reservation fence
-- no longer applies to them (operator reservations stay fenced until step 4c).
CREATE OR REPLACE FUNCTION content.check_allocation_fence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,content,pg_temp AS $$
DECLARE fence content.allocation_fence; n numeric;
BEGIN
 IF NEW.origin='imported' THEN RETURN NEW; END IF;
 SELECT * INTO STRICT fence FROM content.allocation_fence WHERE singleton FOR SHARE;
 IF NOT fence.required THEN RETURN NEW; END IF;
 IF fence.paused OR NOT fence.ceilings ? NEW.kind
    OR jsonb_typeof(fence.ceilings->NEW.kind) IS DISTINCT FROM 'number'
    OR (fence.ceilings->>NEW.kind) !~ '^[1-9][0-9]*$'
 THEN RAISE EXCEPTION 'Allocation recovery required' USING ERRCODE='P5031'; END IF;
 IF NEW.id !~ ('^'||NEW.kind||'[1-9][0-9]*$')
 THEN RAISE EXCEPTION 'Allocation identity invalid' USING ERRCODE='P5031'; END IF;
 n:=substring(NEW.id FROM 2)::numeric;
 IF n >= (fence.ceilings->>NEW.kind)::numeric
 THEN RAISE EXCEPTION 'Allocation range exhausted' USING ERRCODE='P5031'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION content.check_allocation_fence() FROM PUBLIC;

GRANT SELECT,INSERT,UPDATE,DELETE ON content.draft_subjects,content.draft_quizzes,
    content.draft_questions,content.draft_decks,content.draft_flashcards TO meducation_editor;
GRANT SELECT,INSERT ON content.draft_changes TO meducation_editor;
GRANT SELECT,UPDATE ON content.draft_state TO meducation_editor;
GRANT USAGE,SELECT ON SEQUENCE content.draft_subject_ids,content.draft_quiz_ids,
    content.draft_question_ids,content.draft_changes_change_id_seq TO meducation_editor;
GRANT SELECT ON content.releases,content.publication_events,content.entity_ids TO meducation_editor;
GRANT EXECUTE ON FUNCTION content.nonblank(text),
    content.store_release(uuid,text,text,jsonb,text,text,uuid[]),
    content.activate_release(uuid,uuid,bigint,text,text) TO meducation_editor;
GRANT SELECT ON content.draft_subjects,content.draft_quizzes,content.draft_questions,
    content.draft_decks,content.draft_flashcards,content.draft_changes,content.draft_state
    TO meducation_operator,meducation_backup;
GRANT SELECT ON SEQUENCE content.draft_subject_ids,content.draft_quiz_ids,
    content.draft_question_ids,content.draft_changes_change_id_seq TO meducation_backup;
