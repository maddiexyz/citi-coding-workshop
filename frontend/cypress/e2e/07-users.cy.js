// Critical path: admin user management, with self-protection.
describe('User management', () => {
  it('lets an admin create a user who can then sign in', () => {
    cy.signIn('admin');
    cy.visit('/users');
    cy.contains('button', 'New user').click();
    cy.findField(/^Name/).type('E2E Created');
    cy.findField(/^Email/).type('e2e-created@acme.test');
    cy.pick('Role', 'Project manager');
    cy.findField(/Initial password/).type('long-enough-pass-1');
    cy.get('[role="dialog"]').contains('button', 'Save').click();
    cy.contains('Created E2E Created');

    cy.contains('button', 'Delete E2E admin').should('not.exist');      // never yourself
    cy.get('button[aria-label="Edit E2E admin"]').click();
    cy.contains('You can’t change your own role');
    cy.get('[role="dialog"]').contains('button', 'Cancel').click();

    cy.signOut();
    cy.findField(/email/i).type('e2e-created@acme.test');
    cy.findField(/password/i).type('long-enough-pass-1');
    cy.contains('button', 'Sign in').click();
    // Signing in returns to the page you were on (/users), which a project manager may not use
    cy.location('pathname').should('eq', '/users');
    cy.contains('Only admins can manage users.');
    cy.get('nav[aria-label="Main"]').contains('a', 'Users').should('not.exist');
  });

  it('keeps the Users page from non-admins', () => {
    cy.signIn('project_manager');
    cy.visit('/users');
    cy.contains('Only admins can manage users.');
  });
});
