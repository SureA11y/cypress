'use strict';

const { A11yCoreBuilder, installInternalsHook } = require('./A11yCoreBuilder');
const { formatFailures } = require('./formatFailures');
const { getScanGaps, getScanNotes, formatOccurrenceLocation } = require('@surea11y/binding-base');

module.exports = { A11yCoreBuilder, installInternalsHook, formatFailures, getScanGaps, getScanNotes, formatOccurrenceLocation };
