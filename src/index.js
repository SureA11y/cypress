'use strict';

const { A11yCoreBuilder, installInternalsHook, installListenerHook, installLiveRegionHook } = require('./A11yCoreBuilder');
const { formatFailures } = require('./formatFailures');
const { getScanGaps, getScanNotes: baseGetScanNotes, formatOccurrenceLocation, getGatingFailures, SEVERITIES } = require('@surea11y/binding-base');
const { HOOK_REASON_CODES } = require('@surea11y/core/how-to-check');

// binding-base's getScanNotes(), given core's HOOK_REASON_CODES from this
// bundle, so it has the listener and live-region notes in a spec, where
// binding-base can't load core itself. `options.hookReasonCodes` still wins.
function getScanNotes(result, options) {
  return baseGetScanNotes(result, { hookReasonCodes: HOOK_REASON_CODES, ...(options && typeof options === 'object' ? options : {}) });
}

module.exports = {
  A11yCoreBuilder,
  installInternalsHook,
  installListenerHook,
  installLiveRegionHook,
  formatFailures,
  getScanGaps,
  getScanNotes,
  formatOccurrenceLocation,
  getGatingFailures,
  SEVERITIES
};
