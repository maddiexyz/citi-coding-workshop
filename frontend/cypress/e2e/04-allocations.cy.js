// Critical path: people, allocations, over-allocation flagged (never blocked).
describe('People and allocations', () => {
  it('saves an over-allocating allocation and explains the warning', () => {
    cy.api('admin', 'POST', '/resources', { full_name: 'E2E Busy Person', weekly_hours: 40 });
    cy.api('admin', 'POST', '/projects', { code: 'E2E-AL2', name: 'E2E Other', status: 'active' }).then((other) => {
      cy.api('admin', 'GET', '/resources?q=E2E%20Busy').then((body) => {
        cy.api('admin', 'POST', '/allocations', {
          project_id: other.id, resource_id: body.items[0].id, hours_per_week: 30,
          start_date: '2030-01-07', end_date: '2030-01-13',
        });
      });
    });
    cy.api('project_manager', 'POST', '/projects', {
      code: 'E2E-AL1', name: 'E2E Allocations', status: 'active', start_date: '2030-01-01', end_date: '2030-12-31',
    }).then((project) => {
      cy.signIn('project_manager');
      cy.visit(`/projects/${project.id}?tab=allocations`);
    });

    cy.contains('button', 'Allocate').click();
    cy.findField(/^Person/).click();
    cy.contains('[role="option"]', 'E2E Busy Person').click();
    cy.findField(/Hours per week/).type('81');
    cy.findField(/^Start/).clear().type('2030-01-07');
    cy.findField(/^End/).clear().type('2030-01-13');
    cy.get('[role="dialog"]').contains('button', 'Save').click();
    cy.contains('Must be more than 0 and at most 80');
    cy.findField(/Hours per week/).clear().type('20');
    cy.get('[role="dialog"]').contains('button', 'Save').click();
    cy.contains('Saved, but E2E Busy Person is over-allocated in the week of Jan 7, 2030: 50 h of 40 h (+10 h).');
    cy.get('table[aria-label="Allocations"]').should('contain', 'E2E Busy Person');

    cy.contains('a', 'E2E Busy Person').click();
    cy.get('table[aria-label="Weekly load"]').should('exist');
  });

  it('lets only admins manage people', () => {
    cy.signIn('project_manager');
    cy.visit('/resources');
    cy.contains('h1', 'People');
    cy.contains('button', 'New person').should('not.exist');

    cy.signIn('admin');
    cy.visit('/resources');
    cy.contains('button', 'New person').click();
    cy.findField(/^Name/).type('E2E New Person');
    cy.findField(/Weekly hours/).clear().type('61');
    cy.get('[role="dialog"]').contains('button', 'Save').click();
    cy.contains('Must be more than 0 and at most 60');
    cy.findField(/Weekly hours/).clear().type('32');
    cy.get('[role="dialog"]').contains('button', 'Save').click();
    cy.contains('Created E2E New Person');
  });
});
