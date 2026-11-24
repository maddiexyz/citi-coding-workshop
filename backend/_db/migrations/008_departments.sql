-- v1.1: departments as a table instead of free text on resources.
--
-- One department is created per distinct existing resources.department value,
-- compared trimmed and case-insensitively ("Finance" and "finance " are the
-- same department). The spelling kept is the most used one; ties prefer
-- Title Case ("Finance" over "finance"/"FINANCE"), then byte order, so the
-- result doesn't depend on the database's collation. Every resource is then linked by id, and the
-- migration stops before dropping the text column if any non-blank value
-- was left unmapped, so nothing is lost.

CREATE TABLE departments (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       TEXT        NOT NULL CHECK (length(btrim(name)) > 0 AND name = btrim(name)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique regardless of case
CREATE UNIQUE INDEX departments_name_lower_idx ON departments (lower(name));

INSERT INTO departments (name)
SELECT DISTINCT ON (lower(spelling)) spelling
FROM (
    SELECT btrim(department) AS spelling, count(*) AS uses
    FROM resources
    WHERE department IS NOT NULL AND btrim(department) <> ''
    GROUP BY btrim(department)
) spellings
ORDER BY lower(spelling), uses DESC, (spelling = initcap(spelling)) DESC, spelling COLLATE "C";

-- RESTRICT: a department that is still in use can't be deleted (the API returns 409)
ALTER TABLE resources ADD COLUMN department_id BIGINT REFERENCES departments (id) ON DELETE RESTRICT;
CREATE INDEX resources_department_idx ON resources (department_id);

UPDATE resources r
SET department_id = d.id
FROM departments d
WHERE lower(d.name) = lower(btrim(r.department));

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM resources
               WHERE department IS NOT NULL AND btrim(department) <> '' AND department_id IS NULL) THEN
        RAISE EXCEPTION 'Department mapping incomplete: not dropping resources.department';
    END IF;
END $$;

ALTER TABLE resources DROP COLUMN department;

ALTER TABLE projects ADD COLUMN department_id BIGINT REFERENCES departments (id) ON DELETE RESTRICT;
CREATE INDEX projects_department_idx ON projects (department_id);

-- Rebuild project_details with the department (new columns cannot be
-- inserted into an existing view).
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
    p.department_id,
    dep.name AS department_name,
    -- Progress counts ignore cancelled deliverables
    (SELECT count(*) FROM deliverables d
      WHERE d.project_id = p.id AND d.status <> 'cancelled') AS deliverables_total,
    (SELECT count(*) FROM deliverables d
      WHERE d.project_id = p.id AND d.status = 'done') AS deliverables_done,
    p.budget_planned,
    coalesce(spend.actual, 0)::numeric(12,2) AS actual_spend,
    -- With no budget set (NULL or 0) there is nothing to burn against
    CASE WHEN p.budget_planned > 0
         THEN (p.budget_planned - coalesce(spend.actual, 0))::numeric(12,2) END AS remaining,
    CASE WHEN p.budget_planned > 0
         THEN round(coalesce(spend.actual, 0) * 100 / p.budget_planned, 1) END AS burn_pct,
    coalesce(p.budget_planned > 0 AND spend.actual > p.budget_planned, false) AS over_budget,
    (SELECT count(*) FROM deliverables d WHERE d.project_id = p.id) AS deliverable_count,
    (SELECT count(*) FROM allocations a WHERE a.project_id = p.id) AS allocation_count,
    coalesce(spend.entries, 0) AS budget_entry_count,
    p.created_at,
    p.updated_at
FROM projects p
JOIN users u ON u.id = p.owner_id
LEFT JOIN users tl ON tl.id = p.team_lead_id
LEFT JOIN departments dep ON dep.id = p.department_id
LEFT JOIN (
    SELECT project_id, sum(amount) AS actual, count(*) AS entries
    FROM budget_entries GROUP BY project_id
) spend ON spend.project_id = p.id;
