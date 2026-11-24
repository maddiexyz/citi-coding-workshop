import 'cypress-axe';
import './commands';

// Fresh users for the whole run; everything they create is removed at the end
before(() => {
  cy.task('seedUsers').then((ids) => Cypress.env('USER_IDS', JSON.parse(ids)));
});

after(() => {
  cy.task('cleanup');
});
