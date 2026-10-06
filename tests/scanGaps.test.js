'use strict';

// getScanGaps() and formatOccurrenceLocation() come from
// @surea11y/binding-base, which tests them in full; these check that this
// package exports them and that they read a result as core 1.10.0 writes it.

const test = require('node:test');
const assert = require('node:assert');
const { getScanGaps, formatOccurrenceLocation } = require('../src/index.js');

test('getScanGaps(): a scope that matched nothing, and a custom rule that did not run', () => {
  const gaps = getScanGaps({
    checksResults: [],
    contextMatch: { elementCount: 0, unmatchedSelectors: ['#main'] },
    skippedCustomRules: [{ id: 'my-rule', reason: 'meta failed validation' }]
  });
  assert.deepStrictEqual(gaps.map((g) => g.kind), ['context-not-found', 'custom-rule-skipped']);
  assert.strictEqual(gaps[0].message, 'Nothing was scanned: the scan scope matched no element ("#main").');
  assert.strictEqual(gaps[1].message, 'Custom rule "my-rule" did not run: meta failed validation.');
});

test('getScanGaps(): nothing for a scan that left nothing out', () => {
  assert.deepStrictEqual(getScanGaps({ checksResults: [], contextMatch: null, skippedCustomRules: [] }), []);
});

test('getScanGaps(): throws for the { topFrame, frames } of a frames(true) scan', () => {
  assert.throws(() => getScanGaps({ topFrame: { checksResults: [] }, frames: [] }), TypeError);
});

test('formatOccurrenceLocation(): an occurrence in a shadow tree reads through its hosts', () => {
  assert.strictEqual(formatOccurrenceLocation({ selector: 'img', shadowHostSelectors: ['#app', 'photo-card'] }), '#app >>> photo-card >>> img');
  assert.strictEqual(formatOccurrenceLocation({ selector: '#pic' }), '#pic');
  assert.strictEqual(formatOccurrenceLocation({ selector: '' }), '');
});
