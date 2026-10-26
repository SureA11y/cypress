'use strict';

// A style sheet from another origin, which the page can't read: the
// binding fetches it in the page, where its server shares it (CORS), and
// core reads it, so css-orientation-lock finds the lock in it instead of
// asking.

const { A11yCoreBuilder } = require('../src/index.js');

const LOCK = '@media (orientation: portrait) { body { transform: rotate(90deg); } }';
const lock = (results) => results.checksResults.find((c) => c.ruleId === 'css-orientation-lock');

describe('style sheets from another origin', () => {
  beforeEach(() => {
    cy.intercept('https://cdn.other.test/site.css', {
      headers: { 'content-type': 'text/css', 'access-control-allow-origin': '*' },
      body: LOCK
    });
    cy.viewport(800, 1200);
    cy.visit('cypress/fixtures/cross-origin-stylesheet.html');
  });

  it('fetches a shared sheet the page cannot read, and finds the lock in it', () => {
    new A11yCoreBuilder()
      .withRules('css-orientation-lock')
      .analyze()
      .then((results) => expect(lock(results).outcome).to.equal('fail'));
  });

  it('with fetchStyleSheets(false), asks as before', () => {
    new A11yCoreBuilder()
      .withRules('css-orientation-lock')
      .fetchStyleSheets(false)
      .analyze()
      .then((results) => expect(lock(results).outcome).to.equal('cantTell'));
  });
});
