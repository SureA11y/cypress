'use strict';

// Scans a page against acme-policy-pack.js's checklist, prepared in Node by the plugin cypress.config.js registers.
// Run: npm run example:pack -- --env SCAN_URL=<url> (a small fixture page by default)

const { A11yCoreBuilder, formatFailures, getScanGaps } = require('../src/index.js');

const url = Cypress.env('SCAN_URL') || 'cypress/fixtures/acme-launch.html';

describe('scan-with-pack example', () => {
  it(`scans ${url} against the Acme web policy`, () => {
    cy.visit(url);

    new A11yCoreBuilder()
      .withPacks('./examples/acme-policy-pack.js')
      .options({ profile: 'acme-web-2026' })
      .analyze()
      .then((results) => {
        const lines = [`Scanned with ${results.engine.packs.join(', ')}, profile ${results.engine.profile}`, ''];
        for (const item of results.rulesResults.filter((r) => r.meta && r.meta.standard === 'Acme web policy')) {
          lines.push(`${item.outcome.padEnd(13)} ${item.title}`);
        }
        lines.push('', formatFailures(results, { outcomes: ['fail'] }));
        for (const line of lines) if (line) cy.log(line);
        // eslint-disable-next-line no-console
        console.log(lines.join('\n'));

        // A pack the page didn't run (a page on another core) is a gap, not a pass.
        expect(getScanGaps(results), formatFailures(results)).to.be.empty;
      });
  });
});
