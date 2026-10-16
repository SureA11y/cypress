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

test('plugin: registers both tasks under their names', () => {
  const registered = tasks();
  assert.deepStrictEqual(Object.keys(registered).sort(), ['surea11y:packScript', 'surea11y:planned']);
  assert.strictEqual(surea11yPlugin.TASK, 'surea11y:packScript');
  assert.strictEqual(surea11yPlugin.PLANNED_TASK, 'surea11y:planned');
});
