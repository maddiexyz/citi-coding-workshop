// Critical path: a project manager asks for an AI briefing of a late project.
// The signed facts come from the real projects service; the model call
// (/api/ai/briefing) is stubbed, so the run needs no API key and costs nothing.
const iso = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const BACKGROUND = { light: 'rgb(255, 255, 255)', dark: 'rgb(18, 18, 18)' };

/** A reply like the ai service's, citing facts from the signed bundle the browser sent. */
const reply = (bundle) => ({
  project_id: bundle.project_id,
  status: bundle.status,
  headline: 'E2E: forecast to finish after its end date.',
  points: [{ text: 'The forecast is past the planned end.', sources: ['forecast'] },
    { text: 'The build sets the date.', sources: ['critical_path'] }],
  actions: [{ text: 'Split the build.', sources: ['critical_path'] }],
  facts: bundle.facts,
  model: 'claude-haiku-5-5',
  generated_at: new Date().toISOString(),
});

describe('AI briefing', () => {
  before(() => {
    cy.api('project_manager', 'POST', '/projects', {
      code: 'E2E-AI', name: 'E2E Briefing', status: 'active', start_date: iso(-10), end_date: iso(5),
    }).then((project) => {
      Cypress.env('BRIEFING_PROJECT', project.id);
      cy.api('project_manager', 'POST', '/deliverables', { project_id: project.id, title: 'E2E plan', estimate_days: 6 })
        .then((plan) => cy.api('project_manager', 'POST', '/deliverables', { project_id: project.id, title: 'E2E build', estimate_days: 9 })
          .then((build) => cy.api('project_manager', 'POST', `/deliverables/${build.id}/dependencies`, { depends_on_id: plan.id })));
    });
  });

  ['light', 'dark'].forEach((mode) => {
    it(`generates a grounded briefing from signed facts (${mode} mode, axe-clean)`, () => {
      cy.intercept('POST', '**/api/ai/briefing', (req) => req.reply(reply(req.body.bundle))).as('briefing');
      cy.signIn('project_manager');
      cy.visit(`/projects/${Cypress.env('BRIEFING_PROJECT')}`, { onBeforeLoad: (win) => win.localStorage.setItem('mui-mode', mode) });
      cy.get('body').should('have.css', 'background-color', BACKGROUND[mode]);
      cy.contains('section', 'AI briefing').within(() => {
        cy.contains('button', 'Generate AI briefing').click();
        cy.contains('E2E: forecast to finish after its end date.').should('be.visible');
        cy.contains('Late').should('be.visible');
        cy.get('ul[aria-label="Why"] li').should('have.length', 2);
        cy.get('ol[aria-labelledby="briefing-actions-heading"] li').should('contain', 'Split the build.');
        cy.contains('.MuiChip-root', 'Critical path').first().focus();
      });
      cy.get('[role="tooltip"]').should('contain', 'E2E plan → E2E build');
      cy.wait('@briefing').its('request.body').then((body) => {
        cy.wrap(body.token).should('match', /^\d+\.[0-9a-f]{64}$/);
        cy.wrap(body.bundle.status).should('eq', 'late');
      });
      cy.get('[aria-label^="Loading"]').should('not.exist');
      cy.checkPage();
    });
  });

  it('is not offered to viewers, and the facts endpoint refuses them', () => {
    cy.signIn('viewer');
    cy.visit(`/projects/${Cypress.env('BRIEFING_PROJECT')}`);
    cy.contains('h2', 'Completion forecast').should('be.visible');
    cy.contains('h2', 'AI briefing').should('not.exist');
    cy.apiToken('viewer').then((token) => cy.request({
      method: 'POST', url: `${Cypress.env('API_URL')}/projects/${Cypress.env('BRIEFING_PROJECT')}/briefing-facts`,
      headers: { Authorization: `Bearer ${token}` }, failOnStatusCode: false,
    })).its('status').should('eq', 403);
  });
});
