'use strict';

/**
 * The Node side of withPacks(), of the planned lists and of the steps for
 * questions in Cypress. A pack is prepared in Node (@surea11y/core/pack
 * reads core's rule modules from disk), and core's catalog and its review
 * dictionaries are read there, but a Cypress spec runs in the browser.
 * Register this plugin in setupNodeEvents and return the config it returns:
 * analyze() asks it, through cy.task, for the script that registers the
 * packs in the page and for the steps that answer each question, and
 * plannedChecks()/plannedCriteria() for what a scan will check:
 *
 *   // cypress.config.js
 *   const surea11y = require('@surea11y/cypress/plugin');
 *   module.exports = defineConfig({ e2e: { setupNodeEvents(on, config) { return surea11y(on, config); } } });
 *
 * The config it returns carries PLUGIN_KEY (in `expose` where Cypress has
 * it, in `env` before), which tells the spec the tasks are registered: a
 * spec can't ask, and a task that isn't registered fails the test. Without
 * it, analyze() gives no steps, as before the plugin had them.
 *
 * Each pack is named by its module, as withPacks() received it: a package
 * name, or a path from the project root.
 */

const path = require('path');

const TASK = 'surea11y:packScript';
const PLANNED_TASK = 'surea11y:planned';
const HOW_TO_CHECK_TASK = 'surea11y:howToCheck';
const PLUGIN_KEY = 'surea11yPlugin';

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
    },
    // Each result, as analyze() sends it, with howToCheck on its questions
    // from core's addHowToCheck() (1.14.0 and later), in the scan's locale,
    // the packs adding their rules' steps; as sent with an older core.
    [HOW_TO_CHECK_TASK]({ results, packs }) {
      const { addHowToCheck } = require('@surea11y/core');
      const list = Array.isArray(results) ? results : [];
      if (typeof addHowToCheck !== 'function') return list;
      const options = packs && packs.length ? { packs: loadPacks(packs) } : undefined;
      return JSON.parse(JSON.stringify(list.map((result) => addHowToCheck(result, options))));
    }
  });
  // What tells the spec the tasks are here; setupNodeEvents returns it.
  if (!config || typeof config !== 'object') return config;
  if (config.expose && typeof config.expose === 'object') config.expose[PLUGIN_KEY] = true;
  else config.env = { ...(config.env || {}), [PLUGIN_KEY]: true };
  return config;
}

module.exports = surea11yPlugin;
module.exports.TASK = TASK;
module.exports.PLANNED_TASK = PLANNED_TASK;
module.exports.HOW_TO_CHECK_TASK = HOW_TO_CHECK_TASK;
module.exports.PLUGIN_KEY = PLUGIN_KEY;
