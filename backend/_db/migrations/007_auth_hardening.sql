-- Increment D: refresh tokens and sign-in rate limiting.

-- Refresh tokens are long random strings kept in an HttpOnly cookie; only
-- their SHA-256 hash is stored. Each use rotates the token: the old row is
-- revoked and points at its replacement.
CREATE TABLE refresh_tokens (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at  TIMESTAMPTZ,
    replaced_by BIGINT      REFERENCES refresh_tokens (id) ON DELETE SET NULL
);

CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

-- Every sign-in attempt, for rate limiting by email and by IP. Rows older
-- than a day are removed on each sign-in.
CREATE TABLE login_attempts (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email_lower  TEXT        NOT NULL,
    ip           TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    succeeded    BOOLEAN     NOT NULL
);

CREATE INDEX login_attempts_email_idx ON login_attempts (email_lower, attempted_at);
CREATE INDEX login_attempts_ip_idx ON login_attempts (ip, attempted_at);
