# Changelog

## Unreleased (next major)

### Breaking

- **`@surea11y/core` is a peer dependency** (`^1.12.0 || ^2.0.0`), no longer a regular one, so the binding, your project and any pack share one copy of core. Install it beside the binding: `npm install @surea11y/core @surea11y/cypress cypress`. npm 7 and later install a missing peer themselves; Yarn, npm 6 and npm with `legacy-peer-deps` don't, and without core the binding fails to load.

  As a regular dependency, core was nested under the binding whenever the project's own core fell outside the binding's range. With core's next major, which moves EN 301 549 into [`@surea11y/pack-en301549`](https://github.com/SureA11y/pack-en301549), the binding then ran the nested 1.x core, which has EN 301 549 built in and skipped the pack (`results.skippedPacks`, a `'pack-skipped'` scan gap).

### Changed

- README: the install line names `@surea11y/core`, and [Checking against EN 301 549](README.md#checking-against-en-301-549) scans with `@surea11y/pack-en301549` under core's next major. The plugin already built the packs' script with `packScript()`, and read the catalog, from the core it resolves itself, the same one the spec bundles, so the code is unchanged.
- `tests/en301549-pack.cy.js` scans with `@surea11y/pack-en301549` under the `en301549-v4.1.1` and `en301549-v3.2.1` profiles and with `mappings: ['en301549']`, and `tests/en301549-pack.test.js` checks that the builder, the plugin, binding-base and the pack resolve one core. Until core's next major is released, the dev dependencies take core and the pack from their `en301549-pack` branches on GitHub.
