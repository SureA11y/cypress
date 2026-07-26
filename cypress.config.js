'use strict';

const { defineConfig } = require('cypress');
const webpackPreprocessor = require('@cypress/webpack-batteries-included-preprocessor');

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
    screenshotOnRunFailure: false,
    setupNodeEvents(on) {
      // @surea11y/core and @surea11y/binding-base are `file:../...`
      // dependencies, installed as symlinks into node_modules (this is a
      // multi-package repo -- see ../ROADMAP.md §3). Webpack resolves
      // symlinks to their real, out-of-node_modules path by default, which
      // slips them past babel-loader's `exclude: [/node_modules/]` regex
      // (a path match, not a package-boundary check) and into Babel's
      // object-rest-spread transform. That transform rewrites `{ ...x }`
      // into a call to a `_objectSpread` helper declared once per bundled
      // module -- fine for ordinary bundled code, but `A11yCoreBuilder`'s
      // `_runInWindow()` reconstructs `runa11yCoreInPage` from just that one
      // function's own `.toString()` source via `win.eval()` (see its
      // header comment), which has no such helper in scope, throwing
      // `ReferenceError: _objectSpread is not defined`. `resolve.symlinks:
      // false` keeps the reported module path as the symlink path (still
      // under node_modules), so the exclude regex matches it correctly and
      // it's left untouched, same as any other installed dependency.
      const options = webpackPreprocessor.defaultOptions;
      options.webpackOptions.resolve.symlinks = false;
      on('file:preprocessor', webpackPreprocessor(options));
    }
  }
});
