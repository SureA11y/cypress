'use strict';

const { A11yCoreBuilder, installInternalsHook, installListenerHook } = require('./A11yCoreBuilder');
const { formatFailures } = require('./formatFailures');
const { getScanGaps, getScanNotes, formatOccurrenceLocation } = require('@surea11y/binding-base');

module.exports = { A11yCoreBuilder, installInternalsHook, installListenerHook, formatFailures, getScanGaps, getScanNotes, formatOccurrenceLocation };
