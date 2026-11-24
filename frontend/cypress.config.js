import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { defineConfig } from 'cypress';

/*
 * End-to-end tests against the running local stack (bin/start-dev.sh):
 * the React app on :3000, the API proxy on :3001 and PostgreSQL on :5432.
 *
 * Each run creates throwaway users e2e-<role>@acme.test with a random
 * password straight in the local database, and removes everything they
 * created afterwards. Never point this at the cloud database.
 */
const PASSWORD = `${randomBytes(12).toString('base64url')}Aa1!`;
const PG = {
  PGHOST: process.env.PGHOST ?? 'localhost',
  PGPORT: process.env.PGPORT ?? '5432',
  PGUSER: process.env.PGUSER ?? 'postgres',
  PGPASSWORD: process.env.PGPASSWORD ?? 'postgres123',
  PGDATABASE: process.env.PGDATABASE ?? 'postgres',
};

function psql(sql, vars = {}) {
  const args = ['-qAt', '-v', 'ON_ERROR_STOP=1'];
  Object.entries(vars).forEach(([name, value]) => args.push('-v', `${name}=${value}`));
  return execFileSync('psql', [...args, '-f', '-'], { input: sql, env: { ...process.env, ...PG } }).toString().trim();
}

const CLEANUP = `
  DELETE FROM projects WHERE code LIKE 'E2E-%';
  DELETE FROM resources WHERE full_name LIKE 'E2E %';
  DELETE FROM departments WHERE name LIKE 'E2E %';
  DELETE FROM audit_log WHERE actor_name LIKE 'E2E %';
  DELETE FROM login_attempts WHERE email_lower LIKE 'e2e-%';
  DELETE FROM users WHERE email LIKE 'e2e-%@acme.test';
`;

export default defineConfig({
  video: false,
  screenshotOnRunFailure: true,
  viewportWidth: 1280,
  viewportHeight: 900,
  defaultCommandTimeout: 15000,
  e2e: {
    // npm run e2e serves a production build on :4173; cypress open uses the dev server
    baseUrl: 'http://localhost:3000',
    env: { API_URL: 'http://localhost:3001/api', E2E_PASSWORD: PASSWORD },
    setupNodeEvents(on) {
      on('task', {
        /** Fresh e2e users, one per role (removes leftovers from an earlier run first). */
        seedUsers() {
          psql(CLEANUP);
          for (const role of ['admin', 'project_manager', 'team_lead', 'viewer']) {
            psql(`INSERT INTO users (email, password_hash, full_name, role)
                  VALUES (:'email', crypt(:'password', gen_salt('bf', 4)), :'name', :'role');`,
            { email: `e2e-${role}@acme.test`, password: PASSWORD, name: `E2E ${role.replace('_', ' ')}`, role });
          }
          return psql("SELECT json_object_agg(role, id) FROM users WHERE email LIKE 'e2e-%@acme.test'");
        },
        cleanup() {
          psql(CLEANUP);
          return null;
        },
        log(message) {
          console.log(message);
          return null;
        },
      });
    },
  },
});
