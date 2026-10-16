// Types for @surea11y/cypress/plugin (src/plugin.js).

/** Registers the tasks that prepare withPacks()'s packs, and list what a scan will check, in Node. */
declare function surea11yPlugin(
  on: (event: 'task', tasks: Record<string, (arg: any) => unknown>) => void,
  config?: { projectRoot?: string }
): void;

declare namespace surea11yPlugin {
  const TASK: 'surea11y:packScript';
  const PLANNED_TASK: 'surea11y:planned';
}

export = surea11yPlugin;
