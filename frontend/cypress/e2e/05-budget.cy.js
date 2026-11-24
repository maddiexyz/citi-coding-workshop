// Critical path: planned vs actual budget, roles, audit trail.
describe('Budget and activity', () => {
  it('tracks spend against the plan and records the change history', () => {
    cy.api('project_manager', 'POST', '/projects', {
      code: 'E2E-BUD', name: 'E2E Budget', status: 'active', budget_planned: '1000',
    }).as('project');

    cy.get('@project').then((project) => {
      cy.signIn('project_manager');
      cy.visit(`/projects/${project.id}?tab=budget`);
    });
    cy.contains('₹1,000.00');
    cy.contains('button', 'Record spend').click();
    cy.findField(/Amount/).type('1.234');
    cy.get('[role="dialog"]').contains('button', 'Save').click();
    cy.contains('Enter an amount of 0 or more, with at most 2 decimals');
    cy.findField(/Amount/).clear().type('1200.50');
    cy.get('[role="dialog"]').contains('button', 'Save').click();
    cy.contains('Recorded ₹1,200.50 of labor spend');
    cy.contains('Over budget');
    cy.contains('120.1%');
    cy.get('button[aria-label^="Delete spend"]').should('not.exist');   // only admins delete spend

    cy.contains('[role="tab"]', 'Activity').click();
    cy.get('ul[aria-label="Activity"]').should('contain', 'Recorded 1200.50 INR of labor spend')
      .and('contain', 'Created project E2E-BUD');

    cy.get('@project').then((project) => {
      cy.signIn('viewer');
      cy.visit(`/projects/${project.id}?tab=budget`);
    });
    cy.contains('Spend by category');
    cy.contains('button', 'Record spend').should('not.exist');
    cy.contains('Spend entries').should('not.exist');
  });

  it('stops the owning PM from deleting a project that has spend', () => {
    cy.api('project_manager', 'POST', '/projects', { code: 'E2E-SPENT', name: 'E2E Spent', status: 'active' }).then((project) => {
      cy.api('project_manager', 'POST', '/budget', { project_id: project.id, category: 'other', amount: '5', spent_on: '2030-01-01' });
    });
    cy.signIn('project_manager');
    cy.visit('/projects');
    cy.get('a[aria-label="Edit E2E-SPENT"]').should('exist');
    cy.get('button[aria-label="Delete E2E-SPENT"]').should('not.exist');
  });
});
