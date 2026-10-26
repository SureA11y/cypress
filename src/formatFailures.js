'use strict';

// Re-exported from @surea11y/binding-base, which now holds the single
// canonical copy shared across every surea11y binding -- see
// ../binding-base/README.md for the full rationale. Kept as a
// real file here (not just re-exporting straight from src/index.js) so
// `require('@surea11y/cypress/src/formatFailures')` keeps working for
// anyone importing the submodule path directly.
//
// Given core's HOOK_REASON_CODES from this bundle, as getScanNotes() is
// (src/index.js), so it prints the listener and live-region notes in a
// spec, where binding-base can't load core itself.
// `opts.hookReasonCodes` still wins.
const { formatFailures: baseFormatFailures } = require('@surea11y/binding-base');
const { HOOK_REASON_CODES } = require('@surea11y/core/how-to-check');

function formatFailures(input, opts) {
  if (opts !== undefined && (!opts || typeof opts !== 'object')) return baseFormatFailures(input, opts);
  return baseFormatFailures(input, { hookReasonCodes: HOOK_REASON_CODES, ...(opts || {}) });
}

module.exports = { formatFailures };
