-- Opt-in before authority cutover; existing JSON-authoritative fixtures retain their mode.
CREATE TABLE content.allocation_fence (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 lineage uuid NOT NULL DEFAULT gen_random_uuid(),
 required boolean NOT NULL DEFAULT false,
 paused boolean NOT NULL DEFAULT false,
 generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0),
 record_digest text CHECK(record_digest ~ '^[0-9a-f]{64}$'),
 ceilings jsonb NOT NULL DEFAULT '{}',
 CHECK ((generation=0)=(record_digest IS NULL))
);
INSERT INTO content.allocation_fence(singleton) VALUES(true);
CREATE TABLE content.allocation_fence_events (
 generation bigint PRIMARY KEY CHECK(generation>0),
 record_digest text NOT NULL UNIQUE CHECK(record_digest ~ '^[0-9a-f]{64}$'),
 floors jsonb NOT NULL, ceilings jsonb NOT NULL,
 recovery boolean NOT NULL, reason text NOT NULL CHECK(content.nonblank(reason)),
 actor text NOT NULL DEFAULT session_user,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER fence_events_immutable BEFORE UPDATE OR DELETE ON content.allocation_fence_events
 FOR EACH ROW EXECUTE FUNCTION content.append_only();
GRANT SELECT ON content.allocation_fence,content.allocation_fence_events TO meducation_operator,meducation_backup;
CREATE FUNCTION content.check_allocation_fence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,content,pg_temp AS $$
DECLARE fence content.allocation_fence; n numeric;
BEGIN
 SELECT * INTO STRICT fence FROM content.allocation_fence WHERE singleton FOR SHARE;
 IF NOT fence.required THEN RETURN NEW; END IF;
 IF fence.paused OR NEW.origin<>'allocated' OR NOT fence.ceilings ? NEW.kind
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
CREATE TRIGGER allocation_fence_guard BEFORE INSERT ON content.entity_ids
 FOR EACH ROW EXECUTE FUNCTION content.check_allocation_fence();
