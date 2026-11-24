// Critical path: a project whose estimates do not fit before its end date is
// forecast late, flagged at risk, and shows its critical path and timeline.
const iso = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

describe('Completion forecast', () => {
  it('forecasts a late project, flags it, and follows the estimates when they change', () => {
    cy.api('project_manager', 'POST', '/projects', {
      code: 'E2E-FC', name: 'E2E Forecast', status: 'active', start_date: iso(-10), end_date: iso(5),
    }).then((project) => {
      cy.wrap(project.id).as('projectId');
      cy.api('project_manager', 'POST', '/deliverables', { project_id: project.id, title: 'E2E design', estimate_days: 6 })
        .then((design) => cy.api('project_manager', 'POST', '/deliverables', { project_id: project.id, title: 'E2E build', estimate_days: 9 })
          .then((build) => cy.api('project_manager', 'POST', `/deliverables/${build.id}/dependencies`, { depends_on_id: design.id })));
      cy.api('project_manager', 'POST', '/deliverables', { project_id: project.id, title: 'E2E docs', estimate_days: 2 });
    });

    cy.signIn('project_manager');
    cy.get('@projectId').then((id) => cy.visit(`/projects/${id}`));
    cy.contains('section', 'Completion forecast').within(() => {
      cy.contains(/\d+ days late/).should('be.visible');
      cy.contains('High confidence').should('be.visible');
      cy.contains('3 of 3 remaining deliverables have an estimate').should('be.visible');
      cy.get('ol li').should('have.length', 2).first().should('contain', 'E2E design');
      cy.get('ol li').last().should('contain', 'E2E build');
    });

    // Critical chips in the list, bars in the timeline
    cy.contains('[role="tab"]', 'Deliverables').click();
    cy.contains('tr', 'E2E build').should('contain', 'Critical').and('contain', '9 d');
    cy.contains('tr', 'E2E docs').should('not.contain', 'Critical');
    cy.contains('[role="tab"]', 'Timeline').click();
    cy.get('svg[role="img"][aria-label^="Timeline of 3 remaining deliverables"]').should('be.visible');
    cy.contains('button', 'Table').click();
    cy.contains('table[aria-label="Timeline"] tr', 'E2E docs').should('contain', 'No');

    // The projects list and the dashboard carry the forecast too
    cy.visit('/projects');
    cy.contains('th', 'Forecast end').should('be.visible');
    cy.contains('tr', 'E2E-FC').contains(/\d+ days late/).should('be.visible');
    cy.visit('/dashboard');
    cy.findField(/Search projects/).type('E2E-FC');
    cy.get('ul[aria-label="Projects at risk"]').contains(/Forecast to finish \d+ days after its end date/);

    // Smaller estimates entered in the form bring the forecast back before the end date
    cy.get('@projectId').then((id) => cy.visit(`/projects/${id}?tab=deliverables`));
    cy.contains('tr', 'E2E build').click();
    cy.findField('Estimate (working days)').clear().type('1');
    cy.findField('Progress %').clear().type('50');
    cy.contains('button', 'Save').click();
    cy.contains('tr', 'E2E build').should('contain', '1 d').and('contain', '50%');
    cy.contains('tr', 'E2E design').click();
    cy.findField('Estimate (working days)').clear().type('1');
    cy.contains('button', 'Save').click();
    cy.contains('tr', 'E2E design').should('contain', '1 d');
    cy.contains('[role="tab"]', 'Overview').click();
    cy.contains('section', 'Completion forecast').contains(/On time|days? early/).should('be.visible');
  });
});
