-- v2.1: AI project briefings. One row each time a user is handed the signed
-- facts for a briefing, for the per-user hourly limit (see the projects
-- service, POST /{id}/briefing-facts). The briefing itself is never stored.
CREATE TABLE ai_usage (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    project_id BIGINT      NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_user_idx ON ai_usage (user_id, created_at);
