'use strict';

/**
 * Scans a page against a pack's checklist (see acme-policy-pack.js) and
 * prints each checklist item's result, then any finding. The pack is named
 * by its path from the project root: @surea11y/cypress/plugin, registered in
 * cypress.config.js, prepares it in Node.
 *
 * Run: npm run example:pack -- --env SCAN_URL=https://example.com/
 *      (defaults to a small fixture page when --env SCAN_URL isn't given)
 */

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
