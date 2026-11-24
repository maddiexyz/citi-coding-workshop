// Critical path: the main lists work as cards on a phone-sized screen.
describe('Mobile layout', () => {
  beforeEach(() => cy.viewport(390, 844));

  it('shows cards instead of tables', () => {
    cy.api('project_manager', 'POST', '/projects', { code: 'E2E-MOB', name: 'E2E Mobile', status: 'active' }).then((project) => {
      cy.api('project_manager', 'POST', '/deliverables', { project_id: project.id, title: 'E2E card deliverable' });
      cy.wrap(project.id).as('projectId');
    });
    cy.signIn('viewer');
    cy.visit('/projects');
    cy.get('ul[aria-label="Projects"]').should('contain', 'E2E Mobile');
    cy.get('table').should('not.exist');
    cy.get('@projectId').then((id) => cy.visit(`/projects/${id}?tab=deliverables`));
    cy.get('ul[aria-label="Deliverables"]').should('contain', 'E2E card deliverable');
    cy.visit('/resources');
    cy.get('table').should('not.exist');
  });
});
