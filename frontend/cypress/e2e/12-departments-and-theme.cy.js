// Critical paths: departments (admin dialog, grouping on People) and the colour theme toggle.
describe('Departments and colour theme', () => {
  it('groups people by department with load and over-allocation', () => {
    cy.signIn('admin');
    cy.visit('/resources');
    cy.contains('button', 'Departments').click();
    cy.get('[role="dialog"]').within(() => {
      cy.findField('New department').type('E2E Research');
      cy.contains('button', 'Add').click();
      cy.contains('E2E Research');
      cy.contains('button', 'Close').click();
    });
    cy.api('admin', 'GET', '/departments?q=E2E%20Research').then((body) => {
      cy.api('admin', 'POST', '/resources', { full_name: 'E2E Researcher', weekly_hours: 30, department_id: body.items[0].id });
    });
    cy.reload();
    cy.get('label').contains('Group by department').click();
    cy.get('section[aria-label="E2E Research"]').should('contain', '1 person · 0 h allocated of 30 h capacity this week · 0 over-allocated')
      .and('contain', 'E2E Researcher');
    cy.pick('Department', 'E2E Research');
    cy.get('section').should('have.length', 1);
  });

  it('switches light → dark → system and remembers the choice', () => {
    cy.visit('/login');
    cy.window().then((win) => win.localStorage.removeItem('mui-mode'));
    cy.reload();
    cy.get('button[aria-label^="Colour theme: System"]').click();
    cy.get('button[aria-label^="Colour theme: Light"]').click();
    cy.get('button[aria-label^="Colour theme: Dark"]');
    cy.get('body').should('have.css', 'background-color', 'rgb(11, 18, 32)');
    cy.reload();
    cy.get('button[aria-label^="Colour theme: Dark"]');
    cy.window().its('localStorage').invoke('getItem', 'mui-mode').should('eq', 'dark');
  });
});
