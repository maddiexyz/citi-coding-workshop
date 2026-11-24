-- Increment C: project budgets.
-- budget_planned is one approved amount per project; budget_entries record
-- actual spend only. Burn, remaining and over-budget are computed in
-- project_details, never stored. Amounts are exact decimals, never floats.

ALTER TABLE projects
    ADD COLUMN budget_planned NUMERIC(12,2) CHECK (budget_planned >= 0);

CREATE TYPE spend_category AS ENUM ('labor', 'software', 'hardware', 'travel', 'other');

CREATE TABLE budget_entries (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  BIGINT         NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    category    spend_category NOT NULL,
    amount      NUMERIC(12,2)  NOT NULL CHECK (amount >= 0),
    spent_on    DATE           NOT NULL,
    description TEXT,
    created_by  BIGINT         REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX budget_entries_project_idx ON budget_entries (project_id, spent_on);

-- Rebuild project_details with budget figures and child counts (used to
-- explain what a delete removes). New columns cannot be inserted into an
-- existing view, hence DROP + CREATE.
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
LEFT JOIN (
    SELECT project_id, sum(amount) AS actual, count(*) AS entries
    FROM budget_entries GROUP BY project_id
) spend ON spend.project_id = p.id;
