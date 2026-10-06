'use strict';

// src/*.d.ts is written by hand on top of @surea11y/core's own types.
// Compile a typical spec-file use of it, so a declaration that doesn't fit
// core's, or a field core renames, fails here rather than in a user's
// project.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('the .d.ts files compile against @surea11y/core\'s and Cypress\'s types', () => {
  const tsc = require.resolve('typescript/bin/tsc');
  const file = path.join(__dirname, 'types', 'usage.ts');
  try {
    execFileSync(process.execPath, [tsc, '--noEmit', '--strict', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--lib', 'es2022,dom', '--types', 'cypress', file], { stdio: 'pipe' });
  } catch (e) {
    assert.fail(String(e.stdout) + String(e.stderr));
  }
});
