'use strict';

const { A11yCoreBuilder } = require('./A11yCoreBuilder');
const { formatFailures } = require('./formatFailures');
const { getScanGaps, formatOccurrenceLocation } = require('@surea11y/binding-base');

module.exports = { A11yCoreBuilder, formatFailures, getScanGaps, formatOccurrenceLocation };
