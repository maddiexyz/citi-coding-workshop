-- Projects joined with their owner's name, as returned by the projects API.
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
    p.created_at,
    p.updated_at
FROM projects p
JOIN users u ON u.id = p.owner_id;
