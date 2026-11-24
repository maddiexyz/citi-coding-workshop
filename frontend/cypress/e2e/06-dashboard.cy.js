// Critical path: the dashboard explains which projects are at risk and why.
describe('Dashboard', () => {
  it('flags a late project with its reasons and a separate over-budget flag', () => {
    const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    cy.api('project_manager', 'POST', '/projects', {
      code: 'E2E-LATE', name: 'E2E Late project', status: 'active', end_date: lastWeek, budget_planned: '100',
    }).then((project) => {
      cy.api('project_manager', 'POST', '/budget', { project_id: project.id, category: 'other', amount: '150', spent_on: lastWeek });
    });
    cy.signIn('viewer');
    cy.visit('/dashboard');
    cy.findField(/Search projects/).type('E2E-LATE');
    cy.get('ul[aria-label="Projects at risk"]').within(() => {
      cy.contains('High risk');
      cy.contains('Past its end date by 7 days');
      cy.contains('150.0% · over budget');
    });
    cy.contains('a', 'E2E Late project').click();
    cy.location('pathname').should('match', /^\/projects\/\d+$/);
  });
});
