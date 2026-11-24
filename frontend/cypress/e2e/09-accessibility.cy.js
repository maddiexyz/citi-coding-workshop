// Accessibility: no WCAG 2 A/AA violations found by axe on any page.
describe('Accessibility (axe, WCAG 2 A/AA)', () => {
  it('login page', () => {
    cy.visit('/login');
    cy.checkPage();
  });

  it('every signed-in page and project tab', () => {
    cy.api('project_manager', 'POST', '/projects', {
      code: 'E2E-A11Y', name: 'E2E Accessibility', status: 'active', budget_planned: '100',
    }).as('project');
    cy.signIn('admin');
    ['/dashboard', '/projects', '/projects/new', '/resources', '/users'].forEach((path) => {
      cy.visit(path);
      cy.get('h1').should('be.visible');
      cy.checkPage();
    });
    cy.get('@project').then((project) => {
      ['overview', 'deliverables', 'allocations', 'budget', 'activity'].forEach((tab) => {
        cy.visit(`/projects/${project.id}?tab=${tab}`);
        cy.get('[role="tabpanel"]').should('be.visible');
        cy.get('[aria-label^="Loading"]').should('not.exist');
        cy.checkPage();
      });
    });
  });
});
