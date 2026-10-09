# @surea11y/cypress

A Cypress binding for [`@surea11y/core`](https://github.com/SureA11y/core) — scans a real, already-rendered page for accessibility issues using surea11y's DOM-rules engine.

## Install

```bash
npm install @surea11y/cypress cypress
```

`cypress` is a `peerDependencies` entry — consumers need their own Cypress install for the types/runtime to resolve, same as they already do to write any Cypress spec in the first place.

```bash
npm test
```

## Usage

```js
// cypress/e2e/my-page.cy.js
const { A11yCoreBuilder } = require('@surea11y/cypress');

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

`results` is `@surea11y/core`'s own native result shape (and `results.engine.version` says which core release produced it) — see [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md) — not the `violations`/`passes`/`incomplete`/`inapplicable` shape used by other popular accessibility testing tools for Cypress. The builder's *method names* are modeled on common conventions in this space for migration familiarity; the richer result schema is kept as-is.

**No `{ page }`/`{ browser }`/`{ driver }` constructor argument**, unlike most driver-based bindings — there's no such handle in Cypress. `cy` is ambient in every spec file and *is* the driver; `A11yCoreBuilder` calls `cy.window()` itself inside `analyze()`.

### `analyze()` returns a Cypress chainable — never `await` it

```js
// Right:
new A11yCoreBuilder().analyze().then((results) => { /* ... */ });

// Wrong -- cy.* commands are queued, not Promises; mixing async/await with
// them breaks Cypress's retry/ordering guarantees:
const results = await new A11yCoreBuilder().analyze(); // don't do this
```

`cy.*` calls return chainables, not Promises, and Cypress explicitly warns against mixing `async`/`await` with them — so `analyze()` ends its internal chain with `cy.window().then(...)` and returns that chainable directly rather than being an `async` method.

Also see `examples/basic-scan.cy.js` for a runnable scan-and-log spec (`npm run example -- --env SCAN_URL=https://example.com/`) and `examples/e2e-test-example.cy.js` for the accessibility-gate pattern below (`npm run example:e2e`).

`.include(selector)` scopes the scan to the elements it matches. A selector that matches no element scans nothing: every rule reports `notApplicable`, `results.contextMatch` says the scope was not found (`{ elementCount: 0, unmatchedSelectors: ['#main'] }`), and the Command Log shows a `surea11y scan gap` entry (see below). With several `.include()` calls, one that matches nothing is named there while the others are scanned. Before `@surea11y/core` 1.10.0 such a scope silently fell back to the whole page.

`withTags()`/`disableRules()` above have counterparts: `.withRules([...])` (only run these specific rule IDs) and `.disableTags([...])` (never run rules carrying any of these tags). All four compose the same way similar allow/deny-list options do in other accessibility testing tools, with one non-obvious rule worth knowing: a "disable" always wins over a "with" on the same ID/tag, and combining `.withRules()` **and** `.withTags()` together requires a rule to satisfy *both* (`@surea11y/core`'s default `includeMode: 'and'` — see [`ENGINE_OPTIONS.md`](https://github.com/SureA11y/core/blob/main/docs/ENGINE_OPTIONS.md)), not either one.

`.exclude(selector)` above excludes globally. Pass a second argument to scope it to specific rule IDs instead: `.exclude('.mat-select', { rules: ['aria-required-children'] })` skips `.mat-select` for that rule only — every other rule still sees it. Global and rule-scoped `.exclude()` calls compose freely.

### Errors for input the engine can't use

Since `@surea11y/core` 1.10.0 the scan fails, instead of quietly running every rule or none, when it is given something it can't use. The error carries a `code`:

- `INVALID_RUN_ONLY`: none of the rule IDs given to `.withRules()`, or none of the tags given to `.withTags()`, is one the engine knows (a typo such as `'wcag2.2aa'` for `'wcag22aa'`). An unknown value beside known ones is ignored with a `console.warn`. `.withTags()`/`.disableTags()`/`.withRules()`/`.disableRules()` also throw a `TypeError` with this code at the call itself for anything but a non-empty string or an array of them (an `undefined` from a missing config value, say).
- `INVALID_CONTEXT_SELECTOR`: an `.include()` selector the browser can't parse; the error's `selector` names it.

The scan runs in the application's own window, and Cypress fails the test with the engine's error object as thrown, `code` included, so `cy.on('fail', (err) => err.code)` can tell them apart.

**Create one builder per scan.** `A11yCoreBuilder` is a mutable object with no reset between `.analyze()` calls — `include()`/`exclude()`/`withRules()`/`disableRules()`/`withTags()`/`disableTags()`/`options()`/`withCustomRules()` all push onto or merge into internal state that persists for the instance's lifetime. Calling one of them again before a second `.analyze()` call *accumulates* on top of the first scan's scope rather than replacing it (this is exactly what makes "call `.include()` several times for one scan," above, work — the same accumulation just also applies across separate scans if you reuse an instance). `.reportOnly()`/`.frames()`/`.elementRef()` are the exception: each call replaces the previous value instead of merging with it.

### Using it as an E2E accessibility gate

```js
const { A11yCoreBuilder, formatFailures, getScanGaps } = require('@surea11y/cypress');

it('has no accessibility violations', () => {
  cy.visit('https://example.com/');

  new A11yCoreBuilder().include('#main').reportOnly(['fail']).analyze().then((results) => {
    expect(results.checksResults.length, formatFailures(results)).to.equal(0);
    // A scope that matched nothing scans nothing and finds nothing: make
    // that fail the gate too, not pass it.
    expect(getScanGaps(results), formatFailures(results)).to.be.empty;
  });
});
```

`getScanGaps(result)` lists what one scan result says it left out, which its `checksResults` alone would pass over as clean: `{ kind: 'context-not-found' }` when the `.include()` scope matched no element, `'context-partly-not-found'` when some of several did not, and one `'custom-rule-skipped'` (with `rule: { id, reason }`) per custom rule the engine did not run. Each has a `message`. For a `.frames(true)` scan, call it on `topFrame` and on each scanned frame.

### Readable console/CI output on failure

A bare length/equality assertion alone gets you a *working* gate, but the failure message is a raw, deeply-nested object diff. `formatFailures(results)` turns that into a short, scannable block (one entry per occurrence, numbered, with rule ID/severity/location/hint) that you hand to Chai's own failure-message parameter, as above. Given the whole result, it then lists what the scan left out and ends with the `@surea11y/core` release that produced the result, for a bug report to quote. A real failure then prints:

```
AssertionError: 1) button-name-present (serious): This button has no accessible name.
   at #main > button
   Provide visible button text or a programmatic accessible-name mechanism (for example aria-label) so assistive technologies can identify the button.
2) img-alt-present (serious): Missing alt attribute on <img>.
   at #main > img
   Add an alt attribute (use alt="" only for decorative images).

Part of the scan scope was not scanned: no element matched "#sidebar".

Scanned with @surea11y/core 1.10.0.: expected 2 to equal 0
```

An occurrence inside a shadow tree is located through its shadow hosts, as `#card >>> img`; `formatOccurrenceLocation(occurrence)` gives that same text for a message of your own. It is for a person to read, not a selector `document.querySelector()` takes.

`formatFailures(results.checksResults)` still works and prints just the findings. It throws a `TypeError` for the `{ topFrame, frames }` of a `.frames(true)` scan: format `results.topFrame` and each frame on its own.

Deliberately a plain function, not a custom Cypress/Chai assertion — no dependency on any particular assertion library. Defaults to the `fail`/`cantTell` outcomes, the ones that report something found (a `notApplicable` rule may carry one occurrence saying why it had nothing to judge, which is not a finding); pass `{ outcomes: [...] }` to narrow further. A thrown rule (`occurrences: []`, `error` set — see [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md)) is still surfaced using its `error` message rather than silently dropped.

### Command Log entries, automatically

Every `.analyze()` call also writes straight to the Cypress Command Log, with no opt-in needed: one entry per fail/cantTell rule, plus a trailing summary, and one entry per thing the scan left out, e.g.

```
surea11y error!  button-name-present (serious): on 1 Node
surea11y error!  img-alt-present (serious): on 1 Node
surea11y violation summary   2 accessibility issues were detected
surea11y scan gap   Part of the scan scope was not scanned: no element matched "#sidebar".
```

Click any `surea11y error!` row to highlight the flagged element(s) in the app preview (`$el`, each occurrence looked up in the scanned document, through its shadow hosts when it is inside a shadow tree), and its `consoleProps` (open the browser DevTools console after clicking the row) prints the full check object — `ruleId`/`severity`/`occurrences`/etc.

This gives failing scans a readable, per-rule Command Log trace, rather than a bare `window`/`then` step. Entries are named `'surea11y error!'`/`'surea11y violation summary'` — distinguishable from similarly-named entries other accessibility plugins produce at a glance when multiple specs run in the same suite, while staying visually parallel enough to read as the same kind of thing.

A `surea11y scan gap` entry (its `consoleProps` is the gap, as `getScanGaps()` returns it) appears when the `.include()` scope, or part of it, matched no element, or a custom rule did not run. Without it, a scan that scanned nothing would log nothing, like a clean one.

Purely additive to the Command Log — it never touches the value `.analyze()` resolves to, so it can't change any assertion's pass/fail outcome, and there's nothing to configure or disable. Combines with `.frames(true)`: each sub-frame's own findings are logged separately, scoped to that frame's own document (not the top page's).

Only Cypress gets this — see "Relationship to the sibling bindings" below for why.

### Scanning every frame, including same-origin iframes

```js
new A11yCoreBuilder().frames(true).analyze().then((results) => {
  console.log(results.topFrame.checksResults.filter((r) => r.outcome === 'fail'));   // the top-level page
  for (const frame of results.frames) {
    console.log(frame.checksResults.filter((r) => r.outcome === 'fail'));            // each sub-frame, same result shape
  }
});
```

`.frames(true)` recurses into every same-origin `<iframe>` reachable from the top window — including nested iframes (a child's own children) — and flattens them into one `frames` array, verified against a real top→child→grandchild fixture (see `tests/builder.cy.js`).

`.include()` scopes the top frame only: each sub-frame is scanned whole (its result has `contextSelector: null`), as `@surea11y/core`'s own `runa11yCoreAcrossFrames` does. A frame's document rarely has the elements the top page's selectors name, and since core 1.10.0 a selector that matches nothing scans nothing. `.exclude()` still applies in every frame. An `INVALID_RUN_ONLY` or `INVALID_CONTEXT_SELECTOR` error fails the scan from the top frame, before any sub-frame is scanned.

**Genuinely cross-origin iframes are a real, honest limitation here — unlike driver-based bindings that operate outside the browser's same-origin policy (e.g. via CDP/WebDriver).** Cypress spec code runs as ordinary in-page JavaScript and is fully subject to the same-origin policy: reading a cross-origin iframe's `contentWindow.document` throws a real `SecurityError`, confirmed empirically against `https://example.org/` embedded in an unrelated-origin fixture. There is no escape hatch for this today — `cy.origin()` switches Cypress's entire primary browsing context to a different origin for a whole callback block (built for OAuth-redirect-style flows), it does not grant access into an already-loaded cross-origin iframe nested inside the *current* page. A cross-origin sub-frame shows up in `results.frames` as `{ url, error }` instead of aborting the whole scan.

### Trimming the result to just violations

```js
new A11yCoreBuilder().reportOnly(['fail', 'cantTell']).analyze().then((results) => {
  console.log(results.checksResults); // only fail/cantTell entries, pass/notApplicable dropped
});
```

By default `analyze()` returns every rule's outcome, including `pass`/`notApplicable` — `@surea11y/core`'s own deliberate "not a violations-only list" design (see [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md)). Valid outcome values are `'pass'`, `'fail'`, `'cantTell'`, `'notApplicable'`. Pure binding-layer filtering — the engine itself still computes every rule. Combines with `.frames(true)`: the filter is applied to `results.topFrame` and each entry of `results.frames` independently.

### Getting a live element, not just a selector string

```js
new A11yCoreBuilder().elementRef(true).analyze().then((results) => {
  const [failing] = results.checksResults.filter((r) => r.outcome === 'fail');
  cy.wrap(failing.occurrences[0].element).click();
});
```

Unlike driver-based bindings (which hand back a driver-native `ElementHandle`/`WebElement`), Cypress has no such object of its own — its idiom is wrapping a raw DOM element with `cy.wrap(el)` to get a chainable back. `.elementRef(true)` resolves each occurrence to the AUT's own live `Element` (`occurrence.element`, a plain DOM `Element`, not a Cypress chainable) by looking its `selector` up in the scanned document, through its `shadowHostSelectors` first when it is inside a shadow tree, and you `cy.wrap()` it yourself when you need one. Combines with `.frames(true)`: each frame's occurrences resolve against that frame's own document. Not every occurrence has one target element — a page-wide finding can carry `selector: ""`, in which case `occurrence.element` is `null`.

### Registering a custom rule at runtime

```js
new A11yCoreBuilder()
  .withCustomRules({
    id: 'my-org-custom-rule',
    meta: { title: 'My custom rule', tags: ['custom'], defaultSeverity: 'serious' },
    // A real, live function -- no .toString() conversion needed here (see
    // "Why this needs no stringification" below).
    runInPage(ctx) {
      const el = ctx.document.querySelector('.my-widget');
      return el ? { outcome: 'fail', occurrences: [{ __node: el }] } : { outcome: 'notApplicable', occurrences: [] };
    }
  })
  .analyze();
```

A custom rule descriptor is the same shape as one of `@surea11y/core`'s own internal rule modules (`{ id, meta, runInPage, applicability?, data? }`) — see [`ENGINE_OPTIONS.md`](https://github.com/SureA11y/core/blob/main/docs/ENGINE_OPTIONS.md) for the full contract. Results appear in `checksResults` exactly like a built-in rule's. Registered per-scan only, and a custom rule whose `id` collides with a built-in one overrides it for that scan.

Pass an array to register several at once, or call `.withCustomRules()` again to add more — it accumulates rather than replacing:

```js
new A11yCoreBuilder()
  .withCustomRules([firstRule, secondRule])
  .withCustomRules(thirdRule) // adds a third, doesn't replace the first two
  .analyze();
```

**Why this needs no stringification, unlike driver-based bindings**: those bindings drive a *separate* JS realm (a browser process/page, different from the Node test process), so anything crossing their `page.evaluate()`-equivalent gets structurally cloned/JSON-serialized — a live function reference can't survive that, which is why their `withCustomRules()` calls `.toString()` on your function for you. Cypress test code runs **in the same browser tab** as the application-under-test, so there's no such network/IPC boundary. There *is* still a JS-realm boundary (the AUT lives in its own nested iframe), so `A11yCoreBuilder` reconstructs the engine's entry point inside that realm via `win.eval(...)` — but once crossed, a live cross-realm function call passes real object/function references; only `postMessage`/`structuredClone`-style APIs clone, and this isn't one. A function-source string is still accepted too, for parity with other bindings' accepted input.

Invalid input (a missing/empty `id`, or a `runInPage`/`applicability` that's neither a function nor a non-empty string) throws immediately from `.withCustomRules()` itself, rather than surfacing later as a silently-skipped rule.

### Scanning with packs

A pack brings rules, variants of core's rules, a standard or a checklist, and their profiles and messages, from a package of its own (see core's [`ENGINE_OPTIONS.md`, "Packs"](https://github.com/SureA11y/core/blob/main/docs/ENGINE_OPTIONS.md#packs--rules-and-standards-from-outside-core)). A pack is prepared in Node, and a Cypress spec runs in the browser, so register the plugin in `setupNodeEvents` and name each pack by its module, a package name or a path from the project root. `.withPacks()` registers them in the page, and in every frame with `.frames(true)`, before scanning; a profile of theirs runs through `.options({ profile })`. Packs need `@surea11y/core` 1.11 or later.

```js
// cypress.config.js
const surea11y = require('@surea11y/cypress/plugin');
module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      surea11y(on, config);
    }
  }
});
```

```js
// a spec
new A11yCoreBuilder()
  .withPacks('@surea11y/pack-rgaa')
  .options({ profile: 'rgaa-4.1.2' })
  .analyze()
  .then((result) => {
    expect(result.engine.packs).to.deep.equal(['@surea11y/pack-rgaa@1.0.0']);
  });
```

Without the plugin, `cy.task` fails with Cypress's own message that the task `surea11y:packScript` was not handled.

### Element addressing beyond a CSS selector

Every occurrence already carries `selector` and (with `.elementRef(true)`, above) a live `Element`. It also carries `structuralPath` — a sibling-index path from the document root down to the flagged element (e.g. `[1, 0, 2]`) — a more robust identity than a selector string alone, since it survives some DOM changes a selector wouldn't. No opt-in needed.

An occurrence inside a shadow tree also carries `shadowHostSelectors`: the selectors of the shadow hosts leading to it, outermost first, each resolved in the tree that holds it. Its `selector` then holds only inside the last host's shadow root, so `document.querySelector(selector)` finds another element or none, and its `structuralPath` is `null`. `.elementRef(true)`, the Command Log and `formatFailures()` all follow the hosts (`@surea11y/core` 1.10.0 and later). See [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md) for the full field description.

## Rule changes in @surea11y/core 1.10.0

Nothing to change in a spec, but results differ:

- `landmark-role-name-present` is new: an element given `role="region"` or `role="form"` with no accessible name. It reports `cantTell` (a best practice, not a WCAG failure), so a `.reportOnly(['fail'])` gate is unaffected.
- `label-title-only` is deprecated in favour of `form-control-programmatic-label-quality`, which reports every field it did. It now reports `notApplicable`; its id keeps resolving until core 2.0.0, so `.withRules()`/`.disableRules()` with it still work.
- Several rules, the landmark rules among them, now report `pass` where they checked something and found it fine, instead of `notApplicable`. Under `.include()`, rules that compare elements across the page (`landmark-unique`, `heading-order` and others) report `notApplicable`, since a scope can't see the rest of the page.

See core's [`CHANGELOG.md`](https://github.com/SureA11y/core/blob/main/CHANGELOG.md) for the full list.

## TypeScript

`src/A11yCoreBuilder.d.ts` (re-exported from `src/index.d.ts`, wired up via `package.json`'s `types` field) ships types for the whole builder API, `formatFailures()`, `getScanGaps()` and `formatOccurrenceLocation()`. The result shapes (`A11yCoreResult`, `CheckResult`, `Occurrence`, `CompositeResult`, etc.) are built on the types `@surea11y/core` ships, which follow [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md), adding only `occurrence.element` (for `.elementRef(true)`) and the `.frames(true)` shapes. `EngineErrorCode`, `ScanGap` and the other names are exported too; `tests/types.test.js` compiles a typical spec against them. `analyze()` is typed `Cypress.Chainable<A11yCoreResult | A11yCoreMultiFrameResult>` — narrow on `'topFrame' in results` (or cast, if you already know which mode you called) to get the specific shape back.

## Relationship to the sibling bindings

This binding's builder API is deliberately close to `@surea11y/playwright`'s, `@surea11y/puppeteer`'s, `@surea11y/selenium`'s, and `@surea11y/webdriverio`'s — same method names, same mutability contract, same result shapes wherever Cypress's own architecture allows it. `A11yCoreBuilder` here extends `A11yCoreBuilderBase` from [`@surea11y/binding-base`](https://github.com/SureA11y/binding-base), a small shared package all of these bindings depend on for their common, non-driver-specific logic (`include`/`exclude`/`withTags`/`disableTags`/`withRules`/`disableRules`/`options`/`reportOnly`/`elementRef`/`frames`, `withCustomRules()`'s validation, `formatFailures()`, `getScanGaps()`, and finding an occurrence through its shadow hosts). The real differences, all driven by Cypress's fundamentally different architecture (test code runs in-browser, not as a separate automation-process driver), stay local to this project's own `A11yCoreBuilder.js`:

- No `{ page }`/`{ browser }`/`{ driver }` constructor argument (see above).
- `analyze()` returns a Cypress chainable, not a `Promise`.
- `withCustomRules()` needs no function-to-string conversion.
- An engine error reaches the test as thrown, with its `code`; the driver-based bindings rebuild it on the Node side.
- `.elementRef(true)` attaches a plain `Element`, not a driver-native handle.
- `.frames(true)` cannot reach genuinely cross-origin iframes — an honest, real limitation the driver-based bindings don't have.
- `analyze()` writes `Cypress.log()` Command Log entries automatically — the driver-based bindings run as plain Node test processes (Jest/Mocha/etc.) with no equivalent live-reporter object to write to; their readable-output story is `formatFailures()` instead (same package, shared across bindings — see "Readable console/CI output on failure" above), which is what this binding also falls back to for a plain-text/CI failure message.

Also see `@surea11y/core`'s [`BINDING_AUTHORS_GUIDE.md`](https://github.com/SureA11y/core/blob/main/docs/BINDING_AUTHORS_GUIDE.md) — a reference for building a binding like this one.

## Maintainer

Maintained by [Jorge Rumoroso](https://github.com/rumoroso).

## License

MIT — see [`LICENSE`](./LICENSE).

This package depends on [`@surea11y/core`](https://github.com/SureA11y/core), which is MPL-2.0. MPL-2.0's copyleft is file-level and applies only to `@surea11y/core`'s own source files; consuming it as a normal package dependency doesn't affect this package's license.
</content>
</invoke>
