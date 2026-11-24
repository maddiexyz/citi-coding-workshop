const api = (path) => `${Cypress.env('API_URL')}${path}`;
const email = (role) => `e2e-${role}@acme.test`;

/** Sign in through the login form (cached per role with cy.session). */
Cypress.Commands.add('signIn', (role) => {
  cy.session(role, () => {
    cy.visit('/login');
    cy.findField(/email/i).type(email(role));
    cy.findField(/password/i).type(Cypress.env('E2E_PASSWORD'), { log: false });
    cy.contains('button', 'Sign in').click();
    cy.location('pathname').should('eq', '/dashboard');
  }, { validate: () => cy.window().its('sessionStorage').invoke('getItem', 'acme.token').should('exist') });
});

/** An access token for setting up data through the API. */
Cypress.Commands.add('apiToken', (role) => cy.request('POST', api('/auth/login'), {
  email: email(role), password: Cypress.env('E2E_PASSWORD'),
}).its('body.token'));

/** Call the API as a role, e.g. cy.api('project_manager', 'POST', '/projects', {...}). */
Cypress.Commands.add('api', (role, method, path, body) => cy.apiToken(role).then((token) => cy.request({
  method, url: api(path), body, headers: { Authorization: `Bearer ${token}` },
}).its('body')));

/** A form field by its label text (MUI renders <label for=...>). */
Cypress.Commands.add('findField', (label) => cy.contains('label', label).invoke('attr', 'for').then((id) => cy.get(`#${CSS.escape(id)}`)));

/**
 * Pick an option in an MUI select by its label. MUI labels a select with
 * aria-labelledby (not a <label>), so find the combobox whose label matches.
 */
Cypress.Commands.add('pick', (label, option) => {
  cy.get('[role="combobox"][aria-labelledby]').filter((_, el) => {
    const id = el.getAttribute('aria-labelledby').split(' ')[0];
    const text = el.ownerDocument.getElementById(id)?.textContent ?? '';
    return text.replace(/\s*\*$/, '').trim() === label;
  }).last().click();   // the last match is in an open dialog (MUI renders dialogs at the end of <body>)
  cy.contains('[role="option"]', option).click();
});

/** Check the page for WCAG 2 A/AA violations, logging each one. */
Cypress.Commands.add('checkPage', () => {
  cy.injectAxe();
  cy.checkA11y(null, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }, (violations) => {
    violations.forEach((v) => cy.task('log', `${v.id}: ${v.help} (${v.nodes.length}) -> ${v.nodes.map((n) => `${n.target.join(' ')} [${n.any.map((a) => a.message).join('; ')}]`).join(' | ')}`, { log: false }));
  });
});
