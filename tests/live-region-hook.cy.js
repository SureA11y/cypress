'use strict';

// installLiveRegionHook() with no argument, as a support file calls it: every
// visit from then on gets the hook before the app's scripts, and
// getAnnouncements() yields what the app's live regions were given. In a
// spec of its own, since it applies to every later visit. Needs
// @surea11y/core 1.14.0; skipped with older ones.

const { A11yCoreBuilder, installLiveRegionHook, getAnnouncements } = require('../src/index.js');

const HAS_LIVE_REGION_HOOK = typeof require('@surea11y/core').liveRegionHookScript === 'function';

if (HAS_LIVE_REGION_HOOK) {
  installLiveRegionHook();
  installLiveRegionHook(); // registering again does nothing
}

(HAS_LIVE_REGION_HOOK ? describe : describe.skip)('installLiveRegionHook() for every visit', () => {
  it('records what a live region is given, and asks about a region added with its text', () => {
    cy.visit('cypress/fixtures/live-regions.html');
    cy.get('#save').click();
    cy.get('#copy').click();
    getAnnouncements().then((said) => {
      expect(said.map((a) => [a.text, a.politeness])).to.deep.equal([['Saved', 'polite']]);
      expect(said[0].time).to.be.a('number');
    });
    new A11yCoreBuilder().withRules('live-region-announcements').analyze().then((results) => {
      expect(results.engine.environment.liveRegionHook).to.equal('early');
      const check = results.checksResults.find((r) => r.ruleId === 'live-region-announcements');
      expect(check.occurrences.map((o) => [o.data.details.reasonCode, o.data.details.text])).to.deep.equal([
        ['LIVE_REGION_INSERTED_WITH_CONTENT', 'Copied']
      ]);
    });
  });

  it('a later visit starts a new record', () => {
    cy.visit('cypress/fixtures/live-regions.html');
    A11yCoreBuilder.getAnnouncements().then((said) => {
      expect(said).to.deep.equal([]);
    });
  });
});
