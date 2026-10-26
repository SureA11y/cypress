'use strict';

// The plugin's tasks, called as Cypress calls them, in Node.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const surea11yPlugin = require('../plugin.js');

function tasks() {
  const registered = {};
  surea11yPlugin((event, handlers) => { if (event === 'task') Object.assign(registered, handlers); }, { projectRoot: path.join(__dirname, '..') });
  return registered;
}

test('plugin: the planned task lists the rules and criteria a selection gives, with a pack named by its module and a custom rule as source', () => {
  const planned = tasks()[surea11yPlugin.PLANNED_TASK];
  const checks = planned({
    kind: 'checks',
    runOnly: { includeRuleIds: ['acme-no-widget', 'img-alt-present', 'my-rule'] },
    engineOptions: {
      customRules: [{ id: 'my-rule', meta: { title: 'Mine', tags: ['custom'] }, runInPage: 'function (ctx) { return { outcome: "pass", occurrences: [] }; }' }]
    },
    packs: ['./cypress/fixtures/acme-pack.js']
  });
  assert.deepStrictEqual(checks.map((c) => c.ruleId).sort(), ['acme-no-widget', 'img-alt-present', 'my-rule']);

  const criteria = planned({ kind: 'criteria', runOnly: { includeRuleIds: ['contrast-computable'] }, engineOptions: { wcagLevel: 'AA' }, packs: [] });
  assert.deepStrictEqual(criteria.map((r) => r.id), ['wcag-1.4.3-contrast-minimum']);
});

test('plugin: registers its tasks under their names', () => {
  const registered = tasks();
  assert.deepStrictEqual(Object.keys(registered).sort(), ['surea11y:howToCheck', 'surea11y:packScript', 'surea11y:planned']);
  assert.strictEqual(surea11yPlugin.TASK, 'surea11y:packScript');
  assert.strictEqual(surea11yPlugin.PLANNED_TASK, 'surea11y:planned');
  assert.strictEqual(surea11yPlugin.HOW_TO_CHECK_TASK, 'surea11y:howToCheck');
});

test('plugin: returns the config with its key, in expose where Cypress has it and in env before', () => {
  const on = () => {};
  const withExpose = { projectRoot: '.', env: {}, expose: { mine: 1 } };
  assert.strictEqual(surea11yPlugin(on, withExpose), withExpose);
  assert.deepStrictEqual(withExpose.expose, { mine: 1, surea11yPlugin: true });
  assert.deepStrictEqual(withExpose.env, {});

  const older = { projectRoot: '.', env: { mine: 1 } };
  assert.strictEqual(surea11yPlugin(on, older), older);
  assert.deepStrictEqual(older.env, { mine: 1, surea11yPlugin: true });
  assert.strictEqual(surea11yPlugin.PLUGIN_KEY, 'surea11yPlugin');
});

test('plugin: the steps task gives each question its howToCheck, and leaves the rest as sent', () => {
  const howToCheck = tasks()[surea11yPlugin.HOW_TO_CHECK_TASK];
  const question = {
    ruleId: 'heading-order',
    outcome: 'cantTell',
    i18n: { titleKey: 'headingOrder_title' },
    occurrences: [{ selector: 'h3', data: { details: { reasonCode: 'HEADING_ORDER_SKIPPED_LEVEL' } } }]
  };
  const sent = [{ engine: { locale: { requested: 'en', resolved: 'en' } }, checksResults: [question] }];
  const [answered] = howToCheck({ results: sent, packs: [] });
  const how = answered.checksResults[0].occurrences[0].howToCheck;
  assert.ok(Array.isArray(how.steps) && how.steps.length, JSON.stringify(answered));
  assert.strictEqual(typeof how.passWhen, 'string');
  assert.strictEqual(typeof how.failWhen, 'string');
  assert.strictEqual(sent[0].checksResults[0].occurrences[0].howToCheck, undefined, 'what was sent is not changed');
  assert.deepStrictEqual(howToCheck({ results: [], packs: [] }), []);
});
