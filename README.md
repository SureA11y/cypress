# a11y-core-cypress

A Cypress binding for [`a11y-core`](../a11y-core) — scans a real, already-rendered page for accessibility issues using a11y-core's DOM-rules engine.

**Status: not yet implemented.** This is a fresh project scaffold — see `ROADMAP.md` for the complete design plan, the key technical findings already worked out (in particular §2b, the realm-boundary behavior that makes this binding different from the other four), and the reading order for picking this up. There is nothing under `src/` yet.

This is a **separate project/package** from `a11y-core`, kept as a sibling directory (`../a11y-core`), the same pattern `../a11y-core-playwright`, `../a11y-core-puppeteer`, `../a11y-core-selenium`, and `../a11y-core-webdriverio` already use — see those projects and this one's `ROADMAP.md` for the reasoning.
