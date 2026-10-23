'use strict';

const {
  A11yCoreBuilder,
  installInternalsHook,
  installListenerHook,
  installLiveRegionHook,
  getAnnouncements
} = require('./A11yCoreBuilder');
const { formatFailures } = require('./formatFailures');
const { getScanGaps, getScanNotes, formatOccurrenceLocation } = require('@surea11y/binding-base');

module.exports = { A11yCoreBuilder, installInternalsHook, installListenerHook, installLiveRegionHook, getAnnouncements, formatFailures, getScanGaps, getScanNotes, formatOccurrenceLocation };
