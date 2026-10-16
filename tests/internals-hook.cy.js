'use strict';

// installInternalsHook() with no argument, as a support file calls it: every
// visit from then on gets the hook before the app's scripts. In a spec of its
// own, since it applies to every later visit.

const { A11yCoreBuilder, installInternalsHook } = require('../src/index.js');

installInternalsHook();
installInternalsHook(); // registering again does nothing

describe('installInternalsHook() for every visit', () => {
  const outcomeOf = (result, ruleId) => result.checksResults.find((r) => r.ruleId === ruleId).outcome;

  it('the first visit has it', () => {
    cy.visit('cypress/fixtures/internals-components.html');
    new A11yCoreBuilder().include('#check').withRules('binary-control-name-present').analyze().then((results) => {
      expect(results.engine.environment.internalsHook).to.equal('early');
      expect(outcomeOf(results, 'binary-control-name-present')).to.equal('pass');
    });
  });

  it('a later visit has it too', () => {
    cy.visit('cypress/fixtures/internals-components.html');
    new A11yCoreBuilder().include('#toggle').withRules('binary-control-name-present').analyze().then((results) => {
      expect(results.engine.environment.internalsHook).to.equal('early');
      expect(outcomeOf(results, 'binary-control-name-present')).to.equal('fail');
    });
  });
});
