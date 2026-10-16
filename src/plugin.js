'use strict';

/**
 * The Node side of withPacks() and of the planned lists in Cypress. A pack
 * is prepared in Node (@surea11y/core/pack reads core's rule modules from
 * disk), and core's catalog is read there, but a Cypress spec runs in the
 * browser. Register this plugin in setupNodeEvents: analyze() asks it,
 * through cy.task, for the script that registers the packs in the page, and
 * plannedChecks()/plannedCriteria() for what a scan will check:
 *
 *   // cypress.config.js
 *   const surea11y = require('@surea11y/cypress/plugin');
 *   module.exports = defineConfig({ e2e: { setupNodeEvents(on, config) { surea11y(on, config); } } });
 *
 * Each pack is named by its module, as withPacks() received it: a package
 * name, or a path from the project root.
 */

const path = require('path');

const TASK = 'surea11y:packScript';
const PLANNED_TASK = 'surea11y:planned';

function surea11yPlugin(on, config) {
  const root = (config && config.projectRoot) || process.cwd();
  const loadPacks = (packs) => packs.map((spec) => {
    const isPath = /^[./\\]/.test(spec) || path.isAbsolute(spec);
    const resolved = isPath
      ? path.resolve(root, spec)
      : require.resolve(spec, { paths: [root, __dirname] });
    const mod = require(resolved);
    return mod && mod.default && typeof mod.default === 'object' ? mod.default : mod;
  });
  on('task', {
    [TASK]({ packs }) {
      const { packScript } = require('@surea11y/core/pack');
      const loaded = loadPacks(packs);
      return {
        script: packScript(loaded),
        names: loaded.map((p) => `${p.name}@${p.version}`)
      };
    },
    // What a scan will run ('checks') or report ('criteria'), from core's
    // catalog, with the builder's selection and options. Packs, named by
    // module, are passed to core as the pack objects.
    [PLANNED_TASK]({ kind, runOnly, engineOptions, packs }) {
      const core = require('@surea11y/core');
      const options = { ...(engineOptions || {}) };
      if (packs && packs.length) {
        const existing = Array.isArray(options.packs) ? options.packs : [];
        options.packs = existing.concat(loadPacks(packs));
      }
      const list = kind === 'criteria'
        ? core.getRulesForRunOnly(runOnly || null, options)
        : core.getChecksForRunOnly(runOnly || null, options);
      // cy.task answers in JSON.
      return JSON.parse(JSON.stringify(list));
    }
  });
}

module.exports = surea11yPlugin;
module.exports.TASK = TASK;
module.exports.PLANNED_TASK = PLANNED_TASK;
