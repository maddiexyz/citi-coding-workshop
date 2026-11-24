// Critical paths: an assignee updates the status of their own deliverable; changing your own password.
describe('Assignee status and account', () => {
  it('lets a viewer who is the assignee change only the status', () => {
    const ids = Cypress.env('USER_IDS');
    cy.api('admin', 'POST', '/resources', { full_name: 'E2E Viewer Person', user_id: ids.viewer }).then((me) => {
      cy.api('project_manager', 'POST', '/projects', { code: 'E2E-ASG', name: 'E2E Assigned', status: 'active' }).then((project) => {
        cy.api('project_manager', 'POST', '/deliverables', { project_id: project.id, title: 'E2E my task', assignee_resource_id: me.id });
        cy.wrap(project.id).as('projectId');
      });
    });
    cy.signIn('viewer');
    cy.get('@projectId').then((id) => cy.visit(`/projects/${id}?tab=deliverables`));
    cy.get('tr[aria-label="Open E2E my task"]').should('contain', 'E2E Viewer Person (you)').click();
    cy.get('[role="dialog"]').within(() => {
      cy.contains('h2', 'Update status');
      cy.findField(/^Title/).should('be.disabled');
    });
    cy.pick('Status', 'Done');
    cy.get('[role="dialog"]').contains('button', 'Save').click();
    cy.contains('Updated E2E my task');
    cy.get('tr[aria-label="Open E2E my task"]').should('contain', 'Done');
  });

  it('changes your own password from the Account page', () => {
    cy.signIn('viewer');
    cy.visit('/my-work');
    cy.get('button[aria-label^="Account menu for"]').click();
    cy.contains('[role="menuitem"]', 'Account').click();
    cy.location('pathname').should('eq', '/account');
    cy.findField(/Current password/).type('not-my-password');
    cy.findField(/^New password/).type('E2E-new-password-1');
    cy.findField(/Repeat new password/).type('E2E-new-password-1');
    cy.contains('button', 'Change password').click();
    cy.contains('Incorrect password');
    cy.findField(/Current password/).clear().type(Cypress.env('E2E_PASSWORD'), { log: false });
    cy.contains('button', 'Change password').click();
    cy.contains('Password changed');
    // Put it back so the rest of the run can sign in as the viewer
    cy.findField(/Current password/).type('E2E-new-password-1');
    cy.findField(/^New password/).type(Cypress.env('E2E_PASSWORD'), { log: false });
    cy.findField(/Repeat new password/).type(Cypress.env('E2E_PASSWORD'), { log: false });
    cy.contains('button', 'Change password').click();
    cy.contains('Password changed');
  });
});
