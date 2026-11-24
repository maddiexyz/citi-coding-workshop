/**
 * Build the app, serve the production build and run the Cypress suite
 * against it (the API is the running local stack on :3001).
 *
 * Testing the build, not the Vite dev server, means the e2e run sees exactly
 * what is deployed, and avoids the dev server's on-demand dependency
 * re-optimisation, which reloads the page mid-test.
 *
 * Usage: npm run e2e [-- --spec cypress/e2e/02-projects.cy.js]
 */
import cypress from 'cypress';
import { build, preview } from 'vite';

const PORT = 4173;
await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const specIndex = process.argv.indexOf('--spec');
try {
  const result = await cypress.run({
    config: { baseUrl: `http://localhost:${PORT}` },
    ...(specIndex > 0 ? { spec: process.argv[specIndex + 1] } : {}),
  });
  process.exitCode = result.status === 'failed' ? 1 : (result.totalFailed ?? 0) > 0 ? 1 : 0;
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
