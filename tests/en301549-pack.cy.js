'use strict';

// EN 301 549 as a pack (@surea11y/pack-en301549), with a core that no longer
// has it built in. Core is a peer of this binding and of the pack, so the
// core bundled into the spec, whose scan runs in the app's window, and the
// one whose packScript() the plugin runs in Node are one installation.
// Under a core with EN 301 549 built in (1.12 and earlier, as the Compat
// workflow installs from npm) the page skips the pack, so these are skipped.

const { A11yCoreBuilder, getScanGaps } = require('../src/index.js');

const EN301549 = '@surea11y/pack-en301549';
const NAME = `${EN301549}@0.1.0`;

describe('@surea11y/pack-en301549', () => {
  beforeEach(function () {
    cy.task('coreHasEn301549', null, { log: false }).then((builtIn) => {
      if (builtIn) this.skip();
    });
    cy.visit('cypress/fixtures/en301549.html');
  });

  it('withPacks() with the en301549-v4.1.1 profile reports its clauses, and no gap', () => {
    new A11yCoreBuilder().withPacks(EN301549).options({ profile: 'en301549-v4.1.1' }).analyze().then((results) => {
      expect(results.engine.packs).to.deep.equal([NAME]);
      expect(results.engine.profile).to.equal('en301549-v4.1.1');
      expect(results.skippedPacks, JSON.stringify(results.skippedPacks)).to.equal(undefined);
      expect(getScanGaps(results)).to.deep.equal([]);
      const ids = results.rulesResults.map((r) => r.ruleId);
      expect(ids).to.include('en301549-V4.1.1-9.1.1.1');
      expect(ids.filter((id) => !id.startsWith('en301549-V4.1.1-'))).to.deep.equal([]);
      expect(results.rulesResults.find((r) => r.ruleId === 'en301549-V4.1.1-9.1.1.1').outcome).to.equal('fail');
    });
  });

  it('withPacks() with the en301549-v3.2.1 profile reports its clauses, 9.4.1.1 included', () => {
    new A11yCoreBuilder().withPacks(EN301549).options({ profile: 'en301549-v3.2.1' }).analyze().then((results) => {
      expect(results.skippedPacks, JSON.stringify(results.skippedPacks)).to.equal(undefined);
      expect(getScanGaps(results)).to.deep.equal([]);
      const ids = results.rulesResults.map((r) => r.ruleId);
      expect(ids).to.include('en301549-V3.2.1-9.4.1.1');
      expect(ids.filter((id) => !id.startsWith('en301549-V3.2.1-'))).to.deep.equal([]);
    });
  });

  it("withPacks() with mappings: ['en301549'] names the clauses on a WCAG scan", () => {
    new A11yCoreBuilder().withPacks(EN301549).withWcag('2.2').options({ mappings: ['en301549'] }).analyze().then((results) => {
      expect(results.skippedPacks, JSON.stringify(results.skippedPacks)).to.equal(undefined);
      expect(getScanGaps(results)).to.deep.equal([]);
      const img = results.checksResults.find((r) => r.ruleId === 'img-alt-present');
      const clauses = img.meta.normativeMappings.filter((m) => m.standard === 'EN 301 549').map((m) => `${m.version} ${m.requirement}`);
      expect(clauses).to.include('V4.1.1 9.1.1.1');
    });
  });
});
