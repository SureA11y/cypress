'use strict';

const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    // No baseUrl: fixtures are plain local HTML files under cypress/fixtures,
    // visited via their project-relative path (Cypress serves them itself,
    // no app server needed for this project's own tests/examples).
    supportFile: 'cypress/support/e2e.js',
    // Specs live under tests/ and examples/ (not the cypress/e2e/ default)
    // to mirror the sibling bindings' own file layout -- see ROADMAP.md §3.
    specPattern: ['tests/**/*.cy.js', 'examples/**/*.cy.js'],
    video: false,
    screenshotOnRunFailure: false
  }
});
