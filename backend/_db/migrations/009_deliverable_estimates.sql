-- v2: completion-date forecasting.
-- Deliverables carry an estimate (working days of duration), an optional
-- earliest start and a progress percentage. The forecast itself (dates,
-- critical path, SPI) is computed at query time and never stored.

ALTER TABLE deliverables
    ADD COLUMN estimate_days INTEGER CHECK (estimate_days BETWEEN 1 AND 365),
    ADD COLUMN earliest_start DATE,
    ADD COLUMN progress_pct SMALLINT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100);

UPDATE deliverables SET progress_pct = 100 WHERE status = 'done';

-- Rebuild deliverable_details with the new columns (new columns cannot be
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
    d.estimate_days,
    d.earliest_start,
    d.progress_pct,
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
