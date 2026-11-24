// Critical path: sign in, stay signed in, sign out; protected pages; rate limit.
describe('Sign-in and sessions', () => {
  it('sends visitors to the login page and rejects a wrong password', () => {
    cy.visit('/projects');
    cy.location('pathname').should('eq', '/login');
    cy.findField(/email/i).type('e2e-viewer@acme.test');
    cy.findField(/password/i).type('not-the-password');
    cy.contains('button', 'Sign in').click();
    cy.get('[role="alert"]').should('contain', 'Invalid email or password');
  });

  it('signs in to My work and keeps the session in a new visit', () => {
    cy.visit('/login');
    cy.findField(/email/i).type('e2e-project_manager@acme.test');
    cy.findField(/password/i).type(Cypress.env('E2E_PASSWORD'), { log: false });
    cy.contains('button', 'Sign in').click();
    cy.location('pathname').should('eq', '/my-work');
    cy.contains('h1', 'My work');
    cy.getCookie('acme_refresh', { domain: 'localhost' }).should('have.property', 'httpOnly', true);

    // A new tab has no token in sessionStorage: the refresh cookie restores the session
    cy.window().then((win) => win.sessionStorage.clear());
    cy.visit('/projects');
    cy.contains('h1', 'Projects');
  });

  it('refreshes an expired access token without bothering the user', () => {
    cy.signIn('viewer');
    cy.visit('/dashboard');
    cy.contains('h1', 'Dashboard');
    cy.window().then((win) => win.sessionStorage.setItem('acme.token', 'expired.token.value'));
    cy.get('nav[aria-label="Main"]').contains('a', 'Projects').click();
    cy.contains('h1', 'Projects');
    cy.window().its('sessionStorage').invoke('getItem', 'acme.token').should('not.eq', 'expired.token.value');
  });

  it('signs out and ends the session', () => {
    cy.signIn('viewer');
    cy.visit('/dashboard');
    cy.signOut();
    cy.location('pathname').should('eq', '/login');
    cy.visit('/dashboard');
    cy.location('pathname').should('eq', '/login');
  });

  it('explains the rate limit after repeated failures', () => {
    cy.visit('/login');
    cy.findField(/email/i).type('e2e-ratelimit@acme.test');
    for (let i = 0; i < 6; i += 1) {
      cy.findField(/password/i).clear().type(`wrong-${i}`);
      cy.contains('button', 'Sign in').click();
      cy.get('[role="alert"]').should('be.visible');
    }
    cy.get('[role="alert"]').should('contain', 'Too many failed sign-in attempts');
  });
});
