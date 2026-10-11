'use strict';

// acme-pack.js for a core range that leaves out the installed core.
module.exports = { ...require('./acme-pack.js'), name: '@acme/a11y-rules-next', core: '^2.0.0' };
