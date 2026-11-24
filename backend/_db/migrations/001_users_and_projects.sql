-- Increment 1: users and projects.
-- Applied by bin/migrate.sh inside a single transaction.

CREATE TYPE user_role AS ENUM ('admin', 'project_manager', 'team_lead', 'viewer');

CREATE TYPE project_status AS ENUM ('planned', 'active', 'on_hold', 'completed', 'cancelled');

CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Emails are stored lowercased so the UNIQUE constraint is case-insensitive
    email         TEXT        NOT NULL UNIQUE CHECK (email = lower(email)),
    password_hash TEXT        NOT NULL,
    full_name     TEXT        NOT NULL CHECK (length(trim(full_name)) > 0),
    role          user_role   NOT NULL DEFAULT 'viewer',
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        TEXT           NOT NULL UNIQUE,
    name        TEXT           NOT NULL CHECK (length(trim(name)) > 0),
    description TEXT,
    -- RESTRICT: a user who owns projects cannot be deleted by accident
    owner_id    BIGINT         NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    status      project_status NOT NULL DEFAULT 'planned',
    start_date  DATE,
    end_date    DATE,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT projects_dates_check
        CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX projects_owner_id_idx ON projects (owner_id);
CREATE INDEX projects_status_idx ON projects (status);
