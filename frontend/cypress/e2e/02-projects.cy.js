// Critical path: project CRUD with validation, search/filter, roles.
describe('Projects', () => {
  it('lets a project manager create, find, edit and delete a project', () => {
    cy.signIn('project_manager');
    cy.visit('/projects');
    cy.contains('a', 'New project').click();
    cy.contains('button', 'Save project').click();
    cy.contains('Code is required');
    cy.contains('Name is required');

    cy.findField(/^Code/).type('e2e-web');
    cy.findField(/^Name/).type('E2E Website');
    cy.pick('Status', 'Active');
    cy.pick('Team lead', 'E2E team lead');
    cy.findField(/Planned budget/).type('5000');
    cy.findField(/Start date/).type('2030-01-01');
    cy.findField(/End date/).type('2029-12-31');
    cy.contains('button', 'Save project').click();
    cy.contains('End date must be on or after the start date');
    cy.findField(/End date/).clear().type('2030-12-31');
    cy.contains('button', 'Save project').click();
    cy.contains('Created E2E-WEB');

    cy.findField(/Search/).type('e2e-web');
    cy.get('table[aria-label="Projects"]').should('contain', 'E2E Website').and('contain', '0.0% spent');
    cy.get('a[aria-label="Edit E2E-WEB"]').click();
    cy.findField(/^Name/).clear().type('E2E Website v2');
    cy.contains('button', 'Save project').click();
    cy.contains('Updated E2E-WEB');

    cy.get('button[aria-label="Delete E2E-WEB"]').click();
    cy.get('[role="dialog"]').should('contain', 'To retire a project, set its status');
    cy.get('[role="dialog"]').contains('button', 'Delete').click();
    cy.contains('Deleted E2E-WEB');
  });

  it('rejects a duplicate code next to the field', () => {
    cy.api('project_manager', 'POST', '/projects', { code: 'E2E-DUP', name: 'E2E Dup' });
    cy.signIn('project_manager');
    cy.visit('/projects/new');
    cy.findField(/^Code/).type('E2E-DUP');
    cy.findField(/^Name/).type('Again');
    cy.contains('button', 'Save project').click();
    cy.contains('This code is already in use');
  });

  it('keeps viewers read-only', () => {
    cy.api('project_manager', 'POST', '/projects', { code: 'E2E-RO', name: 'E2E Read only', status: 'active' });
    cy.signIn('viewer');
    cy.visit('/projects');
    cy.contains('E2E Read only');
    cy.contains('a', 'New project').should('not.exist');
    cy.get('button[aria-label="Delete E2E-RO"]').should('not.exist');
    cy.contains('a', 'E2E Read only').click();
    cy.contains('a', 'Edit project').should('not.exist');
    cy.contains('[role="tab"]', 'Activity').should('not.exist');
  });
});
