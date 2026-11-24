-- Increment B: resources (people who do the work), allocations of their
-- weekly hours to projects, and deliverable assignees.
-- Over-allocation is computed by resource_weekly_load(); it is flagged, never blocked.

-- Lets the overlap rule below combine "=" on ids with "&&" on date ranges
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- A resource is separate from a user: not everyone who works on a project
-- signs in. user_id optionally links the two (at most one resource per user).
CREATE TABLE resources (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name    TEXT         NOT NULL CHECK (length(trim(full_name)) > 0),
    email        TEXT         UNIQUE CHECK (email = lower(email)),
    department   TEXT,
    title        TEXT,
    user_id      BIGINT       UNIQUE REFERENCES users (id) ON DELETE SET NULL,
    -- Capacity; the 60-hour cap only catches typos
    weekly_hours NUMERIC(5,2) NOT NULL DEFAULT 40 CHECK (weekly_hours > 0 AND weekly_hours <= 60),
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE allocations (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id     BIGINT       NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    -- RESTRICT: a resource with allocations cannot be deleted (deactivate it instead)
    resource_id    BIGINT       NOT NULL REFERENCES resources (id) ON DELETE RESTRICT,
    -- The 80-hour cap only catches typos; exceeding capacity is a warning
    hours_per_week NUMERIC(5,2) NOT NULL CHECK (hours_per_week > 0 AND hours_per_week <= 80),
    start_date     DATE         NOT NULL,
    end_date       DATE         NOT NULL,
    note           TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT allocations_dates_check CHECK (end_date >= start_date),
    -- One allocation per resource per project per period: edit it instead of adding another
    CONSTRAINT allocations_no_overlap EXCLUDE USING gist (
        project_id WITH =,
        resource_id WITH =,
        daterange(start_date, end_date, '[]') WITH &&
    )
);

CREATE INDEX allocations_resource_dates_idx ON allocations (resource_id, start_date, end_date);
CREATE INDEX allocations_project_id_idx ON allocations (project_id);

ALTER TABLE deliverables
    ADD COLUMN assignee_resource_id BIGINT REFERENCES resources (id) ON DELETE SET NULL;
CREATE INDEX deliverables_assignee_idx ON deliverables (assignee_resource_id);

-- Hours each resource is allocated per week (weeks start on Monday) between
-- two dates. An allocation counts its full hours_per_week in every week it
-- overlaps, even partly. Cancelled projects do not count. Computed at query
-- time, never stored.
CREATE FUNCTION resource_weekly_load(from_date DATE, to_date DATE)
RETURNS TABLE (
    resource_id  BIGINT,
    week_start   DATE,
    total_hours  NUMERIC,
    weekly_hours NUMERIC,
    over_by      NUMERIC
)
LANGUAGE sql STABLE AS $$
    WITH weeks AS (
        SELECT generate_series(
            date_trunc('week', from_date)::date,
            date_trunc('week', to_date)::date,
            interval '7 days'
        )::date AS week_start
    )
    SELECT r.id,
           w.week_start,
           sum(a.hours_per_week),
           r.weekly_hours,
           greatest(sum(a.hours_per_week) - r.weekly_hours, 0)
    FROM weeks w
    JOIN allocations a ON a.start_date <= w.week_start + 6 AND a.end_date >= w.week_start
    JOIN projects p ON p.id = a.project_id AND p.status <> 'cancelled'
    JOIN resources r ON r.id = a.resource_id
    GROUP BY r.id, w.week_start, r.weekly_hours
$$;

-- Rebuild deliverable_details with the assignee (new columns cannot be
-- inserted into an existing view).
DROP VIEW deliverable_details;
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
    d.assignee_resource_id,
    r.full_name AS assignee_name,
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
JOIN projects p ON p.id = d.project_id
LEFT JOIN resources r ON r.id = d.assignee_resource_id;
