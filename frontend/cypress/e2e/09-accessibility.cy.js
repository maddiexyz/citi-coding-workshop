// Accessibility: no WCAG 2 A/AA violations found by axe on any page, in light and dark mode.
// The stored mode is applied from the first render (noSsr in theme.js); the
// background check makes sure axe looks at the scheme under test.
const BACKGROUND = { light: 'rgb(255, 255, 255)', dark: 'rgb(18, 18, 18)' };
const visitIn = (mode, path) => {
  cy.visit(path, { onBeforeLoad: (win) => win.localStorage.setItem('mui-mode', mode) });
  cy.get('body').should('have.css', 'background-color', BACKGROUND[mode]);
};

['light', 'dark'].forEach((mode) => {
  describe(`Accessibility (axe, WCAG 2 A/AA) in ${mode} mode`, () => {
    it('login page', () => {
      visitIn(mode, '/login');
      cy.get('button[aria-label^="Colour theme"]').should('have.attr', 'aria-label').and('contain', mode === 'light' ? 'Light' : 'Dark');
      cy.checkPage();
    });

    it('every signed-in page and project tab', () => {
      cy.api('project_manager', 'POST', '/projects', {
        code: `E2E-A11Y-${mode.toUpperCase()}`, name: 'E2E Accessibility', status: 'active', budget_planned: '100',
      }).as('project');
      // Two estimated deliverables in a chain, so the forecast card and the timeline chart have something to draw
      cy.get('@project').then((project) => {
        cy.api('project_manager', 'POST', '/deliverables', { project_id: project.id, title: 'E2E first', estimate_days: 3, due_date: '2031-01-10' })
          .then((first) => cy.api('project_manager', 'POST', '/deliverables', { project_id: project.id, title: 'E2E second', estimate_days: 5 })
            .then((second) => cy.api('project_manager', 'POST', `/deliverables/${second.id}/dependencies`, { depends_on_id: first.id })));
      });
      cy.signIn('admin');
      ['/my-work', '/dashboard', '/projects', '/projects/new', '/resources', '/users', '/account'].forEach((path) => {
        visitIn(mode, path);
        cy.get('h1').should('be.visible');
        cy.get('[aria-label^="Loading"]').should('not.exist');
        cy.checkPage();
      });
      cy.get('@project').then((project) => {
        ['overview', 'deliverables', 'timeline', 'allocations', 'budget', 'activity'].forEach((tab) => {
          visitIn(mode, `/projects/${project.id}?tab=${tab}`);
          cy.get('[role="tabpanel"]').should('be.visible');
          cy.get('[aria-label^="Loading"]').should('not.exist');
          if (tab === 'overview') cy.contains('h3', 'Critical path').should('be.visible');
          if (tab === 'timeline') cy.get('svg[role="img"][aria-label^="Timeline of 2"]').should('be.visible');
          cy.checkPage();
        });
        // The timeline's table view
        visitIn(mode, `/projects/${project.id}?tab=timeline`);
        cy.contains('button', 'Table').click();
        cy.get('table[aria-label="Timeline"]').should('contain', 'E2E second');
        cy.checkPage();
      });
    });
  });
});
