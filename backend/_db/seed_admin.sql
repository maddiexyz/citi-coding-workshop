-- Seed the first admin user. Run by bin/migrate.sh with psql variables:
--   psql -v admin_email=... -v admin_password=... -v admin_name=...
-- :'var' makes psql quote each value as a SQL literal, so input is never
-- spliced into the statement as raw SQL.
--
-- crypt(..., gen_salt('bf')) produces a standard bcrypt hash that the
-- Python bcrypt library verifies at login.
-- ON CONFLICT DO NOTHING: re-running never overwrites an existing password.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (email, password_hash, full_name, role)
VALUES (
    lower(:'admin_email'),
    crypt(:'admin_password', gen_salt('bf', 12)),
    :'admin_name',
    'admin'
)
ON CONFLICT (email) DO NOTHING;
