-- Increment A: project team lead, deliverables and dependencies.
-- Derived values (blocked, overdue, progress) are computed in views, never stored.

-- The team lead assigned to a project (must be a user with the team_lead
-- role; checked by the API). Set to NULL if the user is deleted.
ALTER TABLE projects
    ADD COLUMN team_lead_id BIGINT REFERENCES users (id) ON DELETE SET NULL;
CREATE INDEX projects_team_lead_id_idx ON projects (team_lead_id);

CREATE TYPE deliverable_status AS ENUM ('not_started', 'in_progress', 'done', 'cancelled');

CREATE TABLE deliverables (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Deleting a project deletes its deliverables
    project_id   BIGINT             NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    title        TEXT               NOT NULL CHECK (length(trim(title)) > 0),
    description  TEXT,
    status       deliverable_status NOT NULL DEFAULT 'not_started',
    due_date     DATE,
    -- Set when the status becomes done, cleared when it leaves done
    completed_at TIMESTAMPTZ,
    created_by   BIGINT             REFERENCES users (id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ        NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ        NOT NULL DEFAULT now()
);

CREATE INDEX deliverables_project_id_idx ON deliverables (project_id);
CREATE INDEX deliverables_due_date_idx ON deliverables (due_date);

-- "deliverable_id depends on depends_on_id": it cannot finish before its
-- predecessor. Both must be in the same project and the graph must stay
-- acyclic; the API checks both inside a transaction.
CREATE TABLE deliverable_dependencies (
    deliverable_id BIGINT      NOT NULL REFERENCES deliverables (id) ON DELETE CASCADE,
    depends_on_id  BIGINT      NOT NULL REFERENCES deliverables (id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (deliverable_id, depends_on_id),
    CONSTRAINT deliverable_dependencies_not_self CHECK (deliverable_id <> depends_on_id)
);

CREATE INDEX deliverable_dependencies_depends_on_idx ON deliverable_dependencies (depends_on_id);

-- Deliverables with their computed flags, as returned by the deliverables API.
-- blocked: at least one predecessor is not done (cancelled predecessors do not block).
-- overdue: due date has passed and the deliverable is not done or cancelled.
CREATE VIEW deliverable_details AS
SELECT
    d.id,
    d.project_id,
    p.code AS project_code,
    p.name AS project_name,
    d.title,
    d.description,
    d.status,
    d.due_date,
    d.completed_at,
    EXISTS (
        SELECT 1
        FROM deliverable_dependencies dep
        JOIN deliverables pre ON pre.id = dep.depends_on_id
        WHERE dep.deliverable_id = d.id AND pre.status NOT IN ('done', 'cancelled')
    ) AS is_blocked,
    (d.due_date < current_date AND d.status NOT IN ('done', 'cancelled')) AS is_overdue,
    (SELECT count(*) FROM deliverable_dependencies dep WHERE dep.deliverable_id = d.id) AS predecessor_count,
    (SELECT count(*) FROM deliverable_dependencies dep WHERE dep.depends_on_id = d.id) AS successor_count,
    d.created_by,
    d.created_at,
    d.updated_at
FROM deliverables d
JOIN projects p ON p.id = d.project_id;

-- Rebuild project_details with the team lead and deliverable progress.
-- (DROP + CREATE: new columns cannot be inserted into an existing view.)
DROP VIEW project_details;
CREATE VIEW project_details AS
SELECT
    p.id,
    p.code,
    p.name,
    p.description,
    p.status,
    p.start_date,
    p.end_date,
    p.owner_id,
    u.full_name AS owner_name,
    p.team_lead_id,
    tl.full_name AS team_lead_name,
    -- Progress counts ignore cancelled deliverables
    (SELECT count(*) FROM deliverables d
      WHERE d.project_id = p.id AND d.status <> 'cancelled') AS deliverables_total,
    (SELECT count(*) FROM deliverables d
      WHERE d.project_id = p.id AND d.status = 'done') AS deliverables_done,
    p.created_at,
    p.updated_at
FROM projects p
JOIN users u ON u.id = p.owner_id
LEFT JOIN users tl ON tl.id = p.team_lead_id;
