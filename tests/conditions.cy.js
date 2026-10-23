'use strict';

// .conditions(): the page as it is, then in dark mode and at a phone width,
// merged into one result. The fixture reads well in the light scheme; in the
// dark one its text is #444 on #222. A color scheme needs a Chromium-family
// browser (the default Electron is one).

const { A11yCoreBuilder } = require('../src/index.js');

const isDark = () => cy.window({ log: false }).then((win) => win.matchMedia('(prefers-color-scheme: dark)').matches);

describe('A11yCoreBuilder.conditions()', () => {
  // The scheme the test chose, set and cleared through the DevTools
  // protocol, as .conditions() sets it: '' hands it back to the system.
  const emulateScheme = (value) =>
    cy.then(() =>
      Cypress.automation('remote:debugger:protocol', {
        command: 'Emulation.setEmulatedMedia',
        params: { features: value ? [{ name: 'prefers-color-scheme', value }] : [] }
      })
    );

  it('fails a rule that fails only in dark mode, labels its occurrences, and puts the page back', () => {
    cy.viewport(1024, 700);
    cy.visit('cypress/fixtures/dark-contrast.html');
    // Light, whatever the desktop's scheme.
    emulateScheme('light');
    new A11yCoreBuilder()
      .withRules('contrast-minimum')
      .conditions([{ colorScheme: 'dark' }, { width: 320 }])
      .analyze()
      .then((results) => {
        const check = results.checksResults.find((r) => r.ruleId === 'contrast-minimum');
        expect(check.outcome).to.equal('fail');
        expect(check.occurrences.length).to.be.greaterThan(0);
        for (const o of check.occurrences) expect(o.conditions).to.deep.equal(['dark']);
        expect(results.conditionRuns.map((r) => [r.condition, r.environment.colorScheme, r.environment.viewport.width])).to.deep.equal([
          ['default', 'light', 1024],
          ['dark', 'dark', 1024],
          ['width 320', 'light', 320]
        ]);
      });
    cy.window({ log: false }).its('innerWidth').should('equal', 1024);
    isDark().should('equal', false);
    emulateScheme('');
  });

  it('keeps a dark scheme the page had, and scans a width-only condition in it', () => {
    cy.visit('cypress/fixtures/dark-contrast.html');
    emulateScheme('dark');
    isDark().should('equal', true);
    new A11yCoreBuilder()
      .withRules('contrast-minimum')
      .conditions([{ colorScheme: 'light' }, { width: 320 }])
      .analyze()
      .then((results) => {
        expect(results.conditionRuns.map((r) => [r.condition, r.environment.colorScheme])).to.deep.equal([
          ['default', 'dark'],
          ['light', 'light'],
          ['width 320', 'dark']
        ]);
      });
    isDark().should('equal', true);
    emulateScheme('');
  });

  it('refuses .frames(true) beside it, and checks its list', () => {
    expect(() => new A11yCoreBuilder().conditions([{ colorScheme: 'sepia' }])).to.throw('colorScheme must be');
    expect(() => new A11yCoreBuilder().conditions([{ width: 320 }]).frames(true).analyze()).to.throw("can't be combined yet");
  });
});
