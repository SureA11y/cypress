'use strict';

// Core is a peer of this binding and of @surea11y/pack-en301549, so the core
// the spec bundles (resolved from src/), the plugin's (packScript() and the
// catalog, in Node), binding-base's and the pack's are one installation.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const coreFrom = (dir) => require.resolve('@surea11y/core', { paths: [dir] });
const dirOf = (pkg) => path.dirname(require.resolve(`${pkg}/package.json`));

test('the builder, the plugin, binding-base and the pack load one @surea11y/core', () => {
  const core = coreFrom(path.join(__dirname, '..', 'src'));
  assert.strictEqual(coreFrom(path.join(__dirname, '..')), core);
  assert.strictEqual(coreFrom(dirOf('@surea11y/binding-base')), core);
  assert.strictEqual(coreFrom(dirOf('@surea11y/pack-en301549')), core);
});
