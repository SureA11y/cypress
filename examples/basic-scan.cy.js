'use strict';

/**
 * Minimal runnable example: scans a real page in a real (headless) browser
 * and prints every rule outcome that failed.
 *
 * Unlike the sibling bindings' examples/basic-scan.js (a standalone Node
 * script you run with `node examples/basic-scan.js <url>`), Cypress has no
 * standalone-script mode -- everything runs as a spec through the Cypress
 * test runner. This is the closest Cypress-idiomatic equivalent: a real spec
 * that visits a page and logs the scan results, runnable on its own.
 *
 * Run: npm run example -- --env SCAN_URL=https://example.com/
 *      (defaults to https://example.com/ when --env SCAN_URL isn't given)
 */

const { A11yCoreBuilder } = require('../src/index.js');

const url = Cypress.env('SCAN_URL') || 'https://example.com/';

describe('basic-scan example', () => {
  it(`scans ${url} and logs every failed rule`, () => {
    cy.visit(url);

    new A11yCoreBuilder().analyze().then((results) => {
      const fails = results.checksResults.filter((r) => r.outcome === 'fail');

      cy.log(`Scanned ${url}`);
      cy.log(`${results.checksResults.length} rules evaluated, ${fails.length} failed.`);

      for (const f of fails) {
        cy.log(`${f.ruleId} (${f.severity}): ${f.occurrences.length} occurrence(s)`);
        for (const occ of f.occurrences.slice(0, 3)) {
          cy.log(`  - ${occ.selector}`);
        }
      }

      // eslint-disable-next-line no-console
      console.log(`Scanned ${url}\n${results.checksResults.length} rules evaluated, ${fails.length} failed.\n`);
      for (const f of fails) {
        // eslint-disable-next-line no-console
        console.log(`${f.ruleId} (${f.severity}): ${f.occurrences.length} occurrence(s)`);
      }
    });
  });
});
