'use strict';

/**
 * Demonstrates the pattern that actually matters for E2E test suites: using
 * A11yCoreBuilder as an accessibility gate inside a real Cypress spec.
 *
 * Run: npx cypress run --spec examples/e2e-test-example.cy.js
 *      (also covered by `npm run example:e2e`)
 */

const { A11yCoreBuilder, formatFailures } = require('../src/index.js');

describe('accessibility gate example', () => {
  it('flags real accessibility issues (unlabeled button, missing alt)', () => {
    cy.visit('cypress/fixtures/basic.html');

    new A11yCoreBuilder().reportOnly(['fail']).analyze().then((results) => {
      const failedRuleIds = results.checksResults.map((r) => r.ruleId);
      expect(failedRuleIds).to.include('img-alt-present');
      expect(failedRuleIds).to.include('button-name-present');
    });
  });

  it('a well-formed page has no accessibility violations', () => {
    cy.visit('cypress/fixtures/well-formed.html');

    new A11yCoreBuilder().reportOnly(['fail']).analyze().then((results) => {
      // The real assertion shape you'd use as an accessibility gate in CI --
      // formatFailures() turns checksResults into a readable block (rule,
      // severity, selector, hint per occurrence) instead of a bare
      // not-equal-to-[] diff, so a failure is scannable straight from CI/
      // terminal output.
      expect(results.checksResults.length, formatFailures(results.checksResults)).to.equal(0);
    });
  });
});
