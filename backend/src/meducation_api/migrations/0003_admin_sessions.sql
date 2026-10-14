-- Roles are created by the explicit bootstrap job, never an API worker.
REVOKE ALL ON SCHEMA admin_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA admin_auth TO meducation_session, meducation_backup;
CREATE TABLE admin_auth.sessions (
    token_hash text PRIMARY KEY CHECK (length(token_hash)=64),
    csrf text NOT NULL, issuer text NOT NULL, subject text NOT NULL, provider_sid text,
    epoch text NOT NULL, assurance_policy text NOT NULL,
    auth_time double precision NOT NULL, created double precision NOT NULL,
    last_activity double precision NOT NULL, expires double precision NOT NULL,
    revoked boolean NOT NULL DEFAULT false
);
CREATE TABLE admin_auth.logins (
    state_hash text PRIMARY KEY CHECK (length(state_hash)=64),
    browser_hash text NOT NULL, ciphertext text NOT NULL,
    epoch text NOT NULL, expires double precision NOT NULL, consumed boolean NOT NULL DEFAULT false
);
CREATE TABLE admin_auth.rate_limits (
    bucket text PRIMARY KEY, window_start double precision NOT NULL, count integer NOT NULL
);
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA admin_auth TO meducation_session;
GRANT SELECT ON ALL TABLES IN SCHEMA admin_auth TO meducation_backup;
GRANT USAGE ON SCHEMA content TO meducation_editor;
-- No arbitrary DML, importer, allocation or mutation functions. Step 4 adds
-- session-bound controlled functions only after its ownership/intent contracts.
GRANT SELECT ON content.draft,content.active_publication,content.published_releases TO meducation_editor;
