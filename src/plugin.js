'use strict';

/**
 * The Node side of withPacks() in Cypress. A pack is prepared in Node
 * (@surea11y/core/pack reads core's rule modules from disk), but a Cypress
 * spec runs in the browser. Register this plugin in setupNodeEvents, and
 * analyze() asks it, through cy.task, for the script that registers the packs
 * in the page:
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

function surea11yPlugin(on, config) {
  const root = (config && config.projectRoot) || process.cwd();
  on('task', {
    [TASK]({ packs }) {
      const { packScript } = require('@surea11y/core/pack');
      const loaded = packs.map((spec) => {
        const isPath = /^[./\\]/.test(spec) || path.isAbsolute(spec);
        const resolved = isPath
          ? path.resolve(root, spec)
          : require.resolve(spec, { paths: [root, __dirname] });
        const mod = require(resolved);
        return mod && mod.default && typeof mod.default === 'object' ? mod.default : mod;
      });
      return {
        script: packScript(loaded),
        names: loaded.map((p) => `${p.name}@${p.version}`)
      };
    }
  });
}

module.exports = surea11yPlugin;
module.exports.TASK = TASK;
