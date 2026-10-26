'use strict';

// installListenerHook() and installLiveRegionHook() with no argument, as a
// support file calls them: every visit from then on gets the hooks before
// the app's scripts. In a spec of its own, since they apply to every later
// visit.

const { A11yCoreBuilder, installListenerHook, installLiveRegionHook } = require('../src/index.js');

installListenerHook();
installLiveRegionHook();
installListenerHook(); // registering again does nothing
A11yCoreBuilder.installLiveRegionHook();

describe('installListenerHook() and installLiveRegionHook() for every visit', () => {
  it('the first visit has both', () => {
    cy.visit('cypress/fixtures/scripted-button.html');
    new A11yCoreBuilder().include('#scripted').withRules('click-handler-keyboard-operable').analyze().then((results) => {
      expect(results.engine.environment.listenerHook).to.equal('early');
      expect(results.engine.environment.liveRegionHook).to.equal('early');
      expect(results.checksResults[0].outcome).to.equal('fail');
    });
  });

  it('a button with its own key listener passes', () => {
    cy.visit('cypress/fixtures/scripted-button.html');
    new A11yCoreBuilder().include('#keyed').withRules('click-handler-keyboard-operable').analyze().then((results) => {
      expect(results.checksResults[0].outcome).to.equal('pass');
    });
  });

  it('a later visit has them too', () => {
    cy.visit('cypress/fixtures/live-region.html');
    cy.get('#save').click();
    cy.get('#copy').click();
    A11yCoreBuilder.announcements().then((said) => {
      expect(said.map((a) => a.text)).to.deep.equal(['Saved']);
    });
    new A11yCoreBuilder().withRules('live-region-announcements').analyze().then((results) => {
      expect(results.engine.environment.listenerHook).to.equal('early');
      expect(results.engine.environment.liveRegionHook).to.equal('early');
      // The region added with its text already in it is asked about.
      expect(results.checksResults[0].occurrences.map((o) => [o.data.details.reasonCode, o.data.details.text])).to.deep.equal([
        ['LIVE_REGION_INSERTED_WITH_CONTENT', 'Copied']
      ]);
    });
  });

  it('a later visit starts a new record', () => {
    cy.visit('cypress/fixtures/live-region.html');
    A11yCoreBuilder.announcements().then((said) => {
      expect(said).to.deep.equal([]);
    });
  });
});
