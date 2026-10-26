// Types for @surea11y/cypress/plugin (src/plugin.js).

/**
 * Registers the tasks that prepare withPacks()'s packs, list what a scan
 * will check and give each question its steps, in Node. Returns `config`
 * with PLUGIN_KEY set (in `expose`, or `env` in a Cypress without it), which
 * tells the spec the tasks are there: return it from setupNodeEvents.
 */
declare function surea11yPlugin<C extends { projectRoot?: string; env?: Record<string, any>; expose?: Record<string, any> } | undefined>(
  on: (event: 'task', tasks: Record<string, (arg: any) => unknown>) => void,
  config?: C
): C;

declare namespace surea11yPlugin {
  const TASK: 'surea11y:packScript';
  const PLANNED_TASK: 'surea11y:planned';
  const HOW_TO_CHECK_TASK: 'surea11y:howToCheck';
  const PLUGIN_KEY: 'surea11yPlugin';
}

export = surea11yPlugin;
