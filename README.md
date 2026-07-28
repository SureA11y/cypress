# surea11y-cypress

A Cypress binding for [`surea11y`](../surea11y) — scans a real, already-rendered page for accessibility issues using surea11y's DOM-rules engine.

This is a **separate project/package** from `surea11y` and its sibling bindings ([`surea11y-playwright`](../surea11y-playwright), [`surea11y-puppeteer`](../surea11y-puppeteer), [`surea11y-selenium`](../surea11y-selenium), [`surea11y-webdriverio`](../surea11y-webdriverio)), kept as its own sibling directory — see `ROADMAP.md` §1 for the reasoning (same reasoning every sibling binding already used).

## Install (local development)

`surea11y` isn't published to npm yet, so this package depends on it via a relative `file:` path (see `package.json`):

```json
"dependencies": { "@surea11y/core": "file:../core" }
```

That means this project must stay a sibling of `surea11y` (or you update the path) for `npm install`/`yarn install` to resolve it.

```bash
yarn install   # or npm install
npm test
```

`cypress` is both a `devDependency` (so `npm test` works out of the box) and a `peerDependency` (consumers of this package need their own Cypress install, same rationale as the sibling bindings' driver peerDependency).

## Usage

```js
// cypress/e2e/my-page.cy.js
const { A11yCoreBuilder } = require('surea11y-cypress');

it('has no accessibility violations', () => {
  cy.visit('https://example.com/');

  new A11yCoreBuilder()
    .include('#main')            // optional -- call multiple times for multi-region scans
    .exclude('.cookie-banner')    // optional
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['meta-refresh-no-exceptions'])
    .options({ contrast: { mode: 'auditorAssist' } })
    .analyze()
    .then((results) => {
      const fails = results.checksResults.filter((r) => r.outcome === 'fail');
      expect(fails).to.have.length(0);
    });
});
```

`results` is surea11y's own native result shape — see [`../surea11y/docs/OUTPUT_SCHEMA.md`](../surea11y/docs/OUTPUT_SCHEMA.md) — not the `violations`/`passes`/`incomplete`/`inapplicable` shape used by other popular accessibility testing tools for Cypress. The builder's *method names* are modeled on common conventions in this space (and this package's own sibling bindings) for migration familiarity; the richer result schema is kept as-is.

**No `{ page }`/`{ browser }`/`{ driver }` constructor argument**, unlike every sibling binding — there's no such handle in Cypress. `cy` is ambient in every spec file and *is* the driver; `A11yCoreBuilder` calls `cy.window()` itself inside `analyze()`.

### `analyze()` returns a Cypress chainable — never `await` it

```js
// Right:
new A11yCoreBuilder().analyze().then((results) => { /* ... */ });

// Wrong -- cy.* commands are queued, not Promises; mixing async/await with
// them breaks Cypress's retry/ordering guarantees:
const results = await new A11yCoreBuilder().analyze(); // don't do this
```

See `ROADMAP.md` §2c for why.

Also see `examples/basic-scan.cy.js` for a runnable scan-and-log spec (`npm run example -- --env SCAN_URL=https://example.com/`) and `examples/e2e-test-example.cy.js` for the accessibility-gate pattern below (`npm run example:e2e`).

`withTags()`/`disableRules()` above have counterparts: `.withRules([...])` (only run these specific rule IDs) and `.disableTags([...])` (never run rules carrying any of these tags). All four compose the same way similar allow/deny-list options do in other accessibility testing tools, with one non-obvious rule worth knowing: a "disable" always wins over a "with" on the same ID/tag, and combining `.withRules()` **and** `.withTags()` together requires a rule to satisfy *both* (surea11y's default `includeMode: 'and'` — see `../surea11y/docs/ENGINE_OPTIONS.md`), not either one.

`.exclude(selector)` above excludes globally. Pass a second argument to scope it to specific rule IDs instead: `.exclude('.mat-select', { rules: ['aria-required-children'] })` skips `.mat-select` for that rule only — every other rule still sees it. Global and rule-scoped `.exclude()` calls compose freely.

**Create one builder per scan.** `A11yCoreBuilder` is a mutable object with no reset between `.analyze()` calls — `include()`/`exclude()`/`withRules()`/`disableRules()`/`withTags()`/`disableTags()`/`options()`/`withCustomRules()` all push onto or merge into internal state that persists for the instance's lifetime. Calling one of them again before a second `.analyze()` call *accumulates* on top of the first scan's scope rather than replacing it (this is exactly what makes "call `.include()` several times for one scan," above, work — the same accumulation just also applies across separate scans if you reuse an instance). `.reportOnly()`/`.frames()`/`.elementRef()` are the exception: each call replaces the previous value instead of merging with it.

### Using it as an E2E accessibility gate

```js
const { A11yCoreBuilder, formatFailures } = require('surea11y-cypress');

it('has no accessibility violations', () => {
  cy.visit('https://example.com/');

  new A11yCoreBuilder().reportOnly(['fail']).analyze().then((results) => {
    expect(results.checksResults.length, formatFailures(results.checksResults)).to.equal(0);
  });
});
```

### Readable console/CI output on failure

A bare length/equality assertion alone gets you a *working* gate, but the failure message is a raw, deeply-nested object diff. `formatFailures(checksResults)` turns that into a short, scannable block (one entry per occurrence, numbered, with rule ID/severity/selector/hint) that you hand to Chai's own failure-message parameter, as above. A real failure then prints:

```
AssertionError: 1) button-name-present (serious): This button has no accessible name.
   at html > body > button
   Provide visible button text or a programmatic accessible-name mechanism (for example aria-label) so assistive technologies can identify the button.
2) img-alt-present (serious): Missing alt attribute on <img>.
   at html > body > img
   Add an alt attribute (use alt="" only for decorative images).
: expected 2 to equal 0
```

Deliberately a plain function, not a custom Cypress/Chai assertion — no dependency on any particular assertion library. Defaults to `fail`/`cantTell` outcomes (the only two that ever carry occurrences); pass `{ outcomes: [...] }` to narrow further. A thrown rule (`occurrences: []`, `error` set — see `../surea11y/docs/OUTPUT_SCHEMA.md`) is still surfaced using its `error` message rather than silently dropped.

### Command Log entries, automatically

Every `.analyze()` call also writes straight to the Cypress Command Log, with no opt-in needed: one entry per fail/cantTell rule, plus a trailing summary, e.g.

```
surea11y error!  button-name-present (serious): on 1 Node
surea11y error!  img-alt-present (serious): on 1 Node
surea11y violation summary   2 accessibility issues were detected
```

Click any `surea11y error!` row to highlight the flagged element(s) in the app preview (`$el`, resolved via the occurrences' selectors), and its `consoleProps` (open the browser DevTools console after clicking the row) prints the full check object — `ruleId`/`severity`/`occurrences`/etc.

This exists to give failing scans a readable, per-rule Command Log trace — before this was added, `.analyze()`'s only Command Log trace was a bare `window`/`then` step, noticeably less informative side-by-side with another accessibility plugin's spec testing the same page (found by exactly that side-by-side comparison in a consuming project). Entries are named `'surea11y error!'`/`'surea11y violation summary'` — distinguishable from similarly-named entries other accessibility plugins produce at a glance when multiple specs run in the same suite, while staying visually parallel enough to read as the same kind of thing.

Purely additive to the Command Log — it never touches the value `.analyze()` resolves to, so it can't change any assertion's pass/fail outcome, and there's nothing to configure or disable. Combines with `.frames(true)`: each sub-frame's own findings are logged separately, scoped to that frame's own document (not the top page's).

Only Cypress gets this — see "Relationship to the sibling bindings" below for why the other four bindings don't have (and don't need) an equivalent.

### Scanning every frame, including same-origin iframes

```js
new A11yCoreBuilder().frames(true).analyze().then((results) => {
  console.log(results.topFrame.checksResults.filter((r) => r.outcome === 'fail'));   // the top-level page
  for (const frame of results.frames) {
    console.log(frame.checksResults.filter((r) => r.outcome === 'fail'));            // each sub-frame, same result shape
  }
});
```

`.frames(true)` recurses into every same-origin `<iframe>` reachable from the top window — including nested iframes (a child's own children) — and flattens them into one `frames` array, verified against a real top→child→grandchild fixture (see `ROADMAP.md` §2d, `tests/builder.cy.js`).

**Genuinely cross-origin iframes are a real, honest limitation here — unlike every sibling binding.** Playwright/Puppeteer/Selenium/WebdriverIO all reach cross-origin frames "for free," because their automation protocol (CDP/WebDriver) operates outside the browser's same-origin policy entirely. Cypress spec code runs as ordinary in-page JavaScript and is fully subject to it: reading a cross-origin iframe's `contentWindow.document` throws a real `SecurityError`, confirmed empirically against `https://example.org/` embedded in an unrelated-origin fixture. There is no escape hatch for this today — `cy.origin()` switches Cypress's entire primary browsing context to a different origin for a whole callback block (built for OAuth-redirect-style flows), it does not grant access into an already-loaded cross-origin iframe nested inside the *current* page. A cross-origin sub-frame shows up in `results.frames` as `{ url, error }` instead of aborting the whole scan — the same shape a detached/sandboxed frame gets in the sibling bindings. See `ROADMAP.md` §2d for the full investigation.

### Trimming the result to just violations

```js
new A11yCoreBuilder().reportOnly(['fail', 'cantTell']).analyze().then((results) => {
  console.log(results.checksResults); // only fail/cantTell entries, pass/notApplicable dropped
});
```

By default `analyze()` returns every rule's outcome, including `pass`/`notApplicable` — surea11y's own deliberate "not a violations-only list" design (see `../surea11y/docs/OUTPUT_SCHEMA.md`). Valid outcome values are `'pass'`, `'fail'`, `'cantTell'`, `'notApplicable'`. Pure binding-layer filtering — surea11y itself still computes every rule. Combines with `.frames(true)`: the filter is applied to `results.topFrame` and each entry of `results.frames` independently.

### Getting a live element, not just a selector string

```js
new A11yCoreBuilder().elementRef(true).analyze().then((results) => {
  const [failing] = results.checksResults.filter((r) => r.outcome === 'fail');
  cy.wrap(failing.occurrences[0].element).click();
});
```

Unlike the sibling bindings (which hand back a driver-native `ElementHandle`/`WebElement`), Cypress has no such object of its own — its idiom is wrapping a raw DOM element with `cy.wrap(el)` to get a chainable back. `.elementRef(true)` resolves `occurrence.selector` to the AUT's own live `Element` (`occurrence.element`, a plain DOM `Element`, not a Cypress chainable) via `win.document.querySelector(selector)`, and you `cy.wrap()` it yourself when you need one. Combines with `.frames(true)`: each frame's occurrences resolve against that frame's own document. Not every occurrence has one target element — a page-wide finding can carry `selector: ""`, in which case `occurrence.element` is `null`.

### Registering a custom rule at runtime

```js
new A11yCoreBuilder()
  .withCustomRules({
    id: 'my-org-custom-rule',
    meta: { title: 'My custom rule', tags: ['custom'], defaultSeverity: 'serious' },
    // A real, live function -- no .toString() conversion needed, unlike
    // every sibling binding's withCustomRules(). See "Why this needs no
    // stringification" below.
    runInPage(ctx) {
      const el = ctx.document.querySelector('.my-widget');
      return el ? { outcome: 'fail', occurrences: [{ __node: el }] } : { outcome: 'notApplicable', occurrences: [] };
    }
  })
  .analyze();
```

A custom rule descriptor is the same shape as one of surea11y's own internal rule modules (`{ id, meta, runInPage, applicability?, data? }`) — see `../surea11y/docs/ENGINE_OPTIONS.md` for the full contract. Results appear in `checksResults` exactly like a built-in rule's. Registered per-scan only, and a custom rule whose `id` collides with a built-in one overrides it for that scan.

Pass an array to register several at once, or call `.withCustomRules()` again to add more — it accumulates rather than replacing:

```js
new A11yCoreBuilder()
  .withCustomRules([firstRule, secondRule])
  .withCustomRules(thirdRule) // adds a third, doesn't replace the first two
  .analyze();
```

**Why this needs no stringification, unlike every sibling binding**: Playwright/Puppeteer/Selenium/WebdriverIO all drive a *separate* JS realm (a browser process/page, different from the Node test process), so anything crossing their `page.evaluate()`-equivalent gets structurally cloned/JSON-serialized — a live function reference can't survive that, which is why their `withCustomRules()` calls `.toString()` on your function for you. Cypress test code runs **in the same browser tab** as the application-under-test, so there's no such network/IPC boundary. There *is* still a JS-realm boundary (the AUT lives in its own nested iframe — see `ROADMAP.md` §2b for the full mechanics of how this binding crosses it), but once crossed, a live cross-realm function call passes real object/function references — only `postMessage`/`structuredClone`-style APIs clone, and this isn't one. A function-source string is still accepted too, for parity with the sibling bindings' accepted input.

Invalid input (a missing/empty `id`, or a `runInPage`/`applicability` that's neither a function nor a non-empty string) throws immediately from `.withCustomRules()` itself, rather than surfacing later as a silently-skipped rule.

### Element addressing beyond a CSS selector

Every occurrence already carries `selector` and (with `.elementRef(true)`, above) a live `Element`. It also carries `structuralPath` — a sibling-index path from the document root down to the flagged element (e.g. `[1, 0, 2]`) — a more robust identity than a selector string alone, since it survives some DOM changes a selector wouldn't. No opt-in needed. See `../surea11y/docs/OUTPUT_SCHEMA.md` for the full field description.

## TypeScript

`src/A11yCoreBuilder.d.ts` (re-exported from `src/index.d.ts`, wired up via `package.json`'s `types` field) ships hand-written types for the whole builder API plus surea11y's native result shapes (`A11yCoreResult`, `CheckResult`, `Occurrence`, `CompositeResult`, etc.), mirrored from `../surea11y/docs/OUTPUT_SCHEMA.md`. `analyze()` is typed `Cypress.Chainable<A11yCoreResult | A11yCoreMultiFrameResult>` — narrow on `'topFrame' in results` (or cast, if you already know which mode you called) to get the specific shape back.

## Relationship to the sibling bindings

This binding's builder API is deliberately close to [`surea11y-playwright`](../surea11y-playwright)'s and [`surea11y-puppeteer`](../surea11y-puppeteer)'s — same method names, same mutability contract, same result shapes wherever Cypress's own architecture allows it. As of this package's own `ROADMAP.md` §8, that's no longer just convention: `A11yCoreBuilder` here extends `A11yCoreBuilderBase` from [`../surea11y-binding-base`](../surea11y-binding-base), a small shared package every one of the five bindings now depends on for their common, non-driver-specific logic (`include`/`exclude`/`withTags`/`disableTags`/`withRules`/`disableRules`/`options`/`reportOnly`/`elementRef`/`frames`, `withCustomRules()`'s validation, and `formatFailures()`). The real differences, all driven by Cypress's fundamentally different architecture (test code runs in-browser, not as a separate automation-process driver — see `ROADMAP.md` §1–§2), stay local to this project's own `A11yCoreBuilder.js`:

- No `{ page }`/`{ browser }`/`{ driver }` constructor argument (§2c/README above).
- `analyze()` returns a Cypress chainable, not a `Promise` (§2c).
- `withCustomRules()` needs no function-to-string conversion (§2b/§2f).
- `.elementRef(true)` attaches a plain `Element`, not a driver-native handle (§2e).
- `.frames(true)` cannot reach genuinely cross-origin iframes — an honest, real limitation the other four bindings don't have (§2d).
- `analyze()` writes `Cypress.log()` Command Log entries automatically (§9) — the other four bindings run as plain Node test processes (Jest/Mocha/etc.) with no equivalent live-reporter object to write to; their readable-output story is `formatFailures()` instead (same package, shared by all five — see "Readable console/CI output on failure" above), which is what this binding also falls back to for a plain-text/CI failure message.

Also see [`../surea11y/docs/BINDING_AUTHORS_GUIDE.md`](../surea11y/docs/BINDING_AUTHORS_GUIDE.md) — `surea11y`'s own reference for building a binding like this one.

## Status and what's next

See `ROADMAP.md` — it documents what's built, what's verified (against real Cypress runs, not just reasoned about), and what's still open.
