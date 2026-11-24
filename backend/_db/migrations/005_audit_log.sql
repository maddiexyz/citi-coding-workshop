-- Increment C: a generic audit log of every change made through the API.
-- Written by backend/_common/audit.py in the same transaction as the change,
-- so a change and its audit entry are saved together or not at all.

CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete');

CREATE TABLE audit_log (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actor_user_id BIGINT       REFERENCES users (id) ON DELETE SET NULL,
    -- Kept as text so the entry still says who did it after the user is deleted
    actor_name    TEXT,
    action        audit_action NOT NULL,
    entity_type   TEXT         NOT NULL,
    entity_id     BIGINT       NOT NULL,
    -- No foreign key: entries must outlive the project they describe
    project_id    BIGINT,
    summary       TEXT,
    -- For updates only the changed fields; for create/delete the whole record
    old_values    JSONB,
    new_values    JSONB,
    -- Extra context, e.g. what a project delete removed with it
    details       JSONB
);

CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
CREATE INDEX audit_log_project_idx ON audit_log (project_id, occurred_at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id);
CREATE INDEX audit_log_occurred_idx ON audit_log (occurred_at DESC);
