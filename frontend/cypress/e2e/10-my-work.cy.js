// Critical path: My work (allocations, assigned deliverables, my projects) and the Mine filter.
describe('My work and Mine', () => {
  it('lands a team lead on My work with their allocations, deliverables and projects', () => {
    const ids = Cypress.env('USER_IDS');
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    cy.api('admin', 'POST', '/resources', { full_name: 'E2E Lead Person', weekly_hours: 10, user_id: ids.team_lead }).then((me) => {
      cy.api('project_manager', 'POST', '/projects', {
        code: 'E2E-MINE', name: 'E2E Led project', status: 'active', team_lead_id: ids.team_lead,
      }).then((project) => {
        cy.api('project_manager', 'POST', '/deliverables', {
          project_id: project.id, title: 'E2E late task', due_date: yesterday, assignee_resource_id: me.id,
        });
        const monday = new Date();
        monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
        const iso = (d) => d.toISOString().slice(0, 10);
        cy.api('admin', 'POST', '/allocations', {
          project_id: project.id, resource_id: me.id, hours_per_week: 15,
          start_date: iso(monday), end_date: iso(new Date(monday.getTime() + 13 * 86400000)),
        });
      });
    });

    // The API calls above signed in through cy.request, which left a refresh cookie
    cy.clearAllCookies();
    cy.visit('/login');
    cy.findField(/email/i).type('e2e-team_lead@acme.test');
    cy.findField(/password/i).type(Cypress.env('E2E_PASSWORD'), { log: false });
    cy.contains('button', 'Sign in').click();
    cy.location('pathname').should('eq', '/my-work');
    cy.get('nav[aria-label="Main"] a').first().should('have.text', 'My work');
    cy.get('ul[aria-label="Overdue"]').should('contain', 'E2E late task');
    cy.get('ul[aria-label="My allocations"]').should('contain', 'E2E-MINE');
    cy.contains(/beyond your capacity/);                               // 15 h against 10 h
    cy.get('ul[aria-label="My projects"]').should('contain', 'E2E Led project').and('contain', 'Team lead');
  });

  it('lets a project manager filter the projects they own, kept in the URL', () => {
    cy.api('project_manager', 'POST', '/projects', { code: 'E2E-OWN', name: 'E2E Owned' });
    cy.api('admin', 'POST', '/projects', { code: 'E2E-NOTMINE', name: 'E2E Not mine' });
    cy.signIn('project_manager');
    cy.visit('/projects');
    cy.contains('button', 'Owned by me').click();
    cy.location('search').should('eq', '?mine=1');
    cy.contains('E2E Owned');
    cy.contains('E2E Not mine').should('not.exist');
    cy.reload();
    cy.contains('button', 'Owned by me').should('have.attr', 'aria-pressed', 'true');
    cy.signIn('viewer');
    cy.visit('/projects');
    cy.contains('button', 'Owned by me').should('not.exist');
  });
});
