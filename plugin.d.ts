// Types for @surea11y/cypress/plugin (src/plugin.js).

/** Registers the task that prepares withPacks()'s packs in Node. */
declare function surea11yPlugin(
  on: (event: 'task', tasks: Record<string, (arg: any) => unknown>) => void,
  config?: { projectRoot?: string }
): void;

declare namespace surea11yPlugin {
  const TASK: 'surea11y:packScript';
}

export = surea11yPlugin;
