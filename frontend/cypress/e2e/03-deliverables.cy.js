// Critical path: deliverables, dependencies with cycle detection, team lead rights.
describe('Deliverables and dependencies', () => {
  it('builds a dependency chain, rejects a cycle and lets the assigned team lead edit but not delete', () => {
    cy.api('project_manager', 'POST', '/projects', {
      code: 'E2E-DEL', name: 'E2E Deliverables', status: 'active', team_lead_id: Cypress.env('USER_IDS').team_lead,
    }).then((project) => {
      ['A', 'B', 'C'].forEach((title) => cy.api('project_manager', 'POST', '/deliverables', { project_id: project.id, title }));
      cy.wrap(project.id).as('projectId');
    });

    cy.get('@projectId').then((id) => {
      cy.signIn('team_lead');
      cy.visit(`/projects/${id}?tab=deliverables`);
    });
    cy.get('table[aria-label="Deliverables"]').should('contain', 'A');
    cy.get('button[aria-label^="Delete"]').should('not.exist');

    // A depends on B, B depends on C
    [['A', 'B'], ['B', 'C']].forEach(([from, to]) => {
      cy.get(`tr[aria-label="Open ${from}"]`).click();
      cy.get('[role="dialog"]').within(() => {
        cy.findField('Add a dependency').click();
      });
      cy.contains('[role="option"]', new RegExp(`^${to}$`)).click();
      cy.get('[role="dialog"]').contains('button', /^Add$/).click();
      cy.get('[role="dialog"]').contains('Depends on').parent().should('contain', to);
      cy.get('[role="dialog"]').contains('button', 'Cancel').click();
    });
    cy.get('tr[aria-label="Open A"]').should('contain', 'Blocked');

    // C depends on A would close the loop
    cy.get('tr[aria-label="Open C"]').click();
    cy.get('[role="dialog"]').within(() => cy.findField('Add a dependency').click());
    cy.contains('[role="option"]', /^A$/).click();
    cy.get('[role="dialog"]').contains('button', /^Add$/).click();
    cy.get('[role="dialog"]').should('contain', 'C → A → B → C');
    cy.get('[role="dialog"]').contains('button', 'Cancel').click();

    // The team lead finishes C, which unblocks B
    cy.get('tr[aria-label="Open C"]').click();
    cy.pick('Status', 'Done');
    cy.get('[role="dialog"]').contains('button', 'Save').click();
    cy.contains('Updated C');
    cy.get('tr[aria-label="Open B"]').should('not.contain', 'Blocked');
  });
});
