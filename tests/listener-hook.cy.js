'use strict';

// installListenerHook() with no argument, as a support file calls it: every
// visit from then on gets the hook before the app's scripts. In a spec of its
// own, since it applies to every later visit. Needs @surea11y/core 1.14.0;
// skipped with older ones.

const { A11yCoreBuilder, installListenerHook } = require('../src/index.js');

const HAS_LISTENER_HOOK = typeof require('@surea11y/core').listenerHookScript === 'function';

if (HAS_LISTENER_HOOK) {
  installListenerHook();
  installListenerHook(); // registering again does nothing
}

(HAS_LISTENER_HOOK ? describe : describe.skip)('installListenerHook() for every visit', () => {
  const outcomeOf = (result) => result.checksResults.find((r) => r.ruleId === 'click-handler-keyboard-operable').outcome;

  it('the first visit has it', () => {
    cy.visit('cypress/fixtures/listener-button.html');
    new A11yCoreBuilder().include('#scripted').withRules('click-handler-keyboard-operable').analyze().then((results) => {
      expect(results.engine.environment.listenerHook).to.equal('early');
      expect(outcomeOf(results)).to.equal('fail');
    });
  });

  it('a later visit has it too', () => {
    cy.visit('cypress/fixtures/listener-button.html');
    new A11yCoreBuilder().include('#keyed').withRules('click-handler-keyboard-operable').analyze().then((results) => {
      expect(results.engine.environment.listenerHook).to.equal('early');
      expect(outcomeOf(results)).to.equal('pass');
    });
  });
});
