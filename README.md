# @surea11y/cypress

A Cypress binding for [`@surea11y/core`](https://github.com/SureA11y/core) — scans a real, already-rendered page for accessibility issues using surea11y's DOM-rules engine.

## Install

```bash
npm install @surea11y/cypress cypress
```

`@surea11y/core` 1.11.1 or later comes with it as a peer dependency, as Cypress does: npm 7 and later, and pnpm 8 and later, install it for you, so the line above is all you need. With Yarn 1 or npm 6, which don't install peers, add `@surea11y/core` to that line.

Being a peer means your project and this binding share one copy of core. That matters as soon as your project uses core directly, to write a SARIF log or an HTML report (`@surea11y/core/sarif`, `/report`), read the rule catalogue, or keep a baseline: those read results with the same core that produced them, so a report never labels a finding with another release's rules. It holds when you bring your own core too: a linked checkout (`file:../core`), a monorepo, a fork, or a pinned release. Before 1.4.0, core was a regular dependency, and a project whose core differed from the binding's got a second copy without a word; such a project needed `"overrides": { "@surea11y/core": "$@surea11y/core" }` in its `package.json`, which it can now drop.

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
    .withWcag('2.2', 'AA')         // the rules for WCAG 2.2's A and AA criteria
    .disableRules(['meta-refresh-no-exceptions'])
    .options({ contrast: { mode: 'auditorAssist' } })
    .analyze()
    .then((results) => {
      const fails = results.checksResults.filter((r) => r.outcome === 'fail');
      expect(fails).to.have.length(0);
    });
});
```

`results` is `@surea11y/core`'s own native result shape (and `results.engine.version` says which core release produced it, for example `"1.11.1"`) — see [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md) — not the `violations`/`passes`/`incomplete`/`inapplicable` shape used by other popular accessibility testing tools for Cypress. The builder's *method names* are modeled on common conventions in this space for migration familiarity; the richer result schema is kept as-is.

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

Also see `examples/basic-scan.cy.js` for a runnable scan-and-log spec (`npm run example -- --env SCAN_URL=https://example.com/`), `examples/e2e-test-example.cy.js` for the accessibility-gate pattern below (`npm run example:e2e`), and `examples/scan-with-pack.cy.js` for a scan against a pack (`npm run example:pack`).

`.include(selector)` scopes the scan to the elements it matches. A selector that matches no element scans nothing: every rule reports `notApplicable`, `results.contextMatch` says the scope was not found (`{ elementCount: 0, unmatchedSelectors: ['#main'] }`), and the Command Log shows a `surea11y scan gap` entry (see below). With several `.include()` calls, one that matches nothing is named there while the others are scanned. Before `@surea11y/core` 1.10.0 such a scope silently fell back to the whole page.

`.withWcag(version, level)` selects by conformance target: `.withWcag('2.2', 'AA')` runs the rules for WCAG 2.2's Level A and AA criteria, by the level each criterion has in that version (4.1.1 Parsing, which 2.2 removed, is part of a `'2.1'` target and not of a `'2.2'` one). `.withBestPractices()` adds the rules that name no WCAG criterion, such as `region` and `heading-order`; on its own it runs only those. `.withRules()` and `.withTags()` add to a target's rules, and the disable methods apply after. A version other than `'2.0'`, `'2.1'` or `'2.2'`, or a level other than `'A'`, `'AA'` or `'AAA'`, throws a `TypeError` with `code: 'INVALID_RUN_ONLY'` at the call. Both need `@surea11y/core` 1.11 or later.

`.withTags()`/`.disableRules()` have counterparts: `.withRules([...])` (only run these specific rule IDs) and `.disableTags([...])` (never run rules carrying any of these tags). All four compose the same way similar allow/deny-list options do in other accessibility testing tools, with one non-obvious rule worth knowing: a "disable" always wins over a "with" on the same ID/tag, and combining `.withRules()` **and** `.withTags()` together requires a rule to satisfy *both* (`@surea11y/core`'s default `includeMode: 'and'` — see [`ENGINE_OPTIONS.md`](https://github.com/SureA11y/core/blob/main/docs/ENGINE_OPTIONS.md)), not either one, unless you ask for that with `.includeMode('or')` (below).

`.includeMode(mode)` decides how `.withRules()` and `.withTags()` combine when both are given: `'and'`, the default, runs only the rules that match both, and `'or'` runs those that match either. That's what lets a scan say "this area, plus these checks". A team that owns a design system's form components, say, can run every rule about forms and the contrast check too, in one scan:

```js
new A11yCoreBuilder()
  .withTags('forms')
  .withRules('contrast-computable')
  .includeMode('or')             // every forms rule, plus the contrast check
  .analyze()
  .then((results) => { /* ... */ });
```

Without `.includeMode('or')`, the same lines run no rule at all, since `contrast-computable` isn't tagged `forms`, and a scan of no rules looks clean. The same goes for a WCAG level tag beside a best practice: `.withTags('wcag2a').withRules('region')` runs nothing, and with `'or'` runs the `wcag2a` rules plus `region`. On its own, with no other selection, it changes nothing. A value other than `'and'` or `'or'` throws a `TypeError` with `code: 'INVALID_RUN_ONLY'` at the call. A `.withWcag()` target doesn't need it: its rules are always added to what tags and rules select.

`.wcagLevel(level)` sets the WCAG level of the criteria a scan reports, without changing which rules run: criteria above it are left out of `results.rulesResults`, while every selected rule still runs and reports in `results.checksResults`. It's what lets a scan that names a few checks say it is meant as WCAG AA. A team that gates each pull request on colour contrast alone, say, runs one check, which covers both 1.4.3 (AA) and 1.4.6 (AAA):

```js
new A11yCoreBuilder()
  .withRules('contrast-computable')
  .wcagLevel('AA')               // report 1.4.3, not the AAA 1.4.6
  .analyze()
  .then((results) => { /* ... */ });
```

Without `.wcagLevel('AA')`, that scan reports 1.4.6 as well, so a site that meets AA can show a failing AAA criterion it never aimed for. With it, the scan reports 1.4.3 alone, and `results.engine.wcagLevel` says `'AA'`. A `.withWcag()` target already implies its level; `.wcagLevel()` is for selections that don't, and wins when both are given, as it does over a level given through `.options()`. `'A'`, `'AA'` or `'AAA'` in any case is accepted. Anything else throws a `TypeError` with `code: 'INVALID_ENGINE_OPTIONS'` at the call, and `null` clears it. Needs the `@surea11y/core` release after 1.11.1.

`.exclude(selector)` above excludes globally. Pass a second argument to scope it to specific rule IDs instead: `.exclude('.mat-select', { rules: ['aria-required-children'] })` skips `.mat-select` for that rule only — every other rule still sees it. Global and rule-scoped `.exclude()` calls compose freely.

### Errors for input the engine can't use

Since `@surea11y/core` 1.10.0 the scan fails, instead of quietly running every rule or none, when it is given something it can't use. The error carries a `code`:

- `INVALID_RUN_ONLY`: none of the rule IDs given to `.withRules()`, or none of the tags given to `.withTags()`, is one the engine knows (a typo such as `'wcag2.2aa'` for `'wcag22aa'`). An unknown value beside known ones is ignored with a `console.warn`. `.withTags()`/`.disableTags()`/`.withRules()`/`.disableRules()` also throw a `TypeError` with this code at the call itself for anything but a non-empty string or an array of them (an `undefined` from a missing config value, say).
- `INVALID_CONTEXT_SELECTOR`: an `.include()` selector the browser can't parse; the error's `selector` names it.
- `INVALID_ENGINE_OPTIONS` (core 1.11 and later): with `.options({ strictOptions: true })`, an option the engine doesn't read or a value it can't use. The message names each, with the closest known option (`lcoale`: did you mean `locale`?). Without `strictOptions`, a likely typo is only warned about in the page's console.
- `PAGE_BUILTINS_BROKEN` (core 1.11 and later): the page's own scripts broke a JavaScript built-in the engine relies on (`Array.prototype.filter`, `Map`, `JSON.stringify`, ...), so no result it gave could be trusted. The message names each one.

The scan runs in the application's own window, and Cypress fails the test with the engine's error object as thrown, `code` included, so `cy.on('fail', (err) => err.code)` can tell them apart.

**Create one builder per scan.** `A11yCoreBuilder` is a mutable object with no reset between `.analyze()` calls — `include()`/`exclude()`/`withRules()`/`disableRules()`/`withTags()`/`disableTags()`/`options()`/`withCustomRules()`/`withPacks()` all push onto or merge into internal state that persists for the instance's lifetime. Calling one of them again before a second `.analyze()` call *accumulates* on top of the first scan's scope rather than replacing it (this is exactly what makes "call `.include()` several times for one scan," above, work — the same accumulation just also applies across separate scans if you reuse an instance). `.reportOnly()`/`.frames()`/`.elementRef()`/`.withWcag()`/`.withBestPractices()`/`.includeMode()`/`.wcagLevel()` are the exception: each call replaces the previous value instead of merging with it.

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

`getScanGaps(result)` lists what one scan result says it left out, which its `checksResults` alone would pass over as clean: `{ kind: 'context-not-found' }` when the `.include()` scope matched no element, `'context-partly-not-found'` when some of several did not, one `'custom-rule-skipped'` (with `rule: { id, reason }`) per custom rule the engine did not run, and one `'pack-skipped'` (with `pack: { name, reason }`, from `results.skippedPacks`) per pack the page did not run (see [Scanning with packs](#scanning-with-packs-standards-checklists-and-your-own-rules)). Each has a `message`. For a `.frames(true)` scan, call it on `topFrame` and on each scanned frame.

### Readable console/CI output on failure

A bare length/equality assertion alone gets you a *working* gate, but the failure message is a raw, deeply-nested object diff. `formatFailures(results)` turns that into a short, scannable block (one entry per occurrence, numbered, with rule ID/severity/location/hint) that you hand to Chai's own failure-message parameter, as above. Given the whole result, it then lists what the scan left out and ends with the `@surea11y/core` release that produced the result, for a bug report to quote. A real failure then prints:

```
AssertionError: 1) button-name-present (serious): This button has no accessible name.
   at #main > button
   Give the button visible text, or name it with aria-label, so screen reader users know what it does.
2) img-alt-present (serious): This <img> has no alt attribute.
   at #main > img
   Add an alt attribute that says what the image shows, or alt="" if the image is purely decorative.

Part of the scan scope was not scanned: no element matched "#sidebar".

Scanned with @surea11y/core 1.11.1.: expected 2 to equal 0
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

A `surea11y scan gap` entry (its `consoleProps` is the gap, as `getScanGaps()` returns it) appears when the `.include()` scope, or part of it, matched no element, or a custom rule or a pack did not run. Without it, a scan that scanned nothing would log nothing, like a clean one.

Purely additive to the Command Log — it never touches the value `.analyze()` resolves to, so it can't change any assertion's pass/fail outcome, and there's nothing to configure or disable. Combines with `.frames(true)`: each sub-frame's own findings are logged separately, scoped to that frame's own document (not the top page's).

The driver-based bindings also print each scan gap with `console.warn`, and take a `.logger(fn)` to send those lines elsewhere. This binding prints none, since the Command Log entry above already shows each gap in the runner, so `.logger()` changes nothing here. To act on gaps in a test, read `getScanGaps(results)`.

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

`.include()` scopes the top frame only: each sub-frame is scanned whole (its result has `contextSelector: null`), as `@surea11y/core`'s own `runa11yCoreAcrossFrames` does. A frame's document rarely has the elements the top page's selectors name, and since core 1.10.0 a selector that matches nothing scans nothing. `.exclude()` still applies in every frame. An engine error (above) fails the scan from the top frame, before any sub-frame is scanned.

`@surea11y/core`'s reporters take this result as it is (core 1.11.1 and later): `renderSarifReport(results)`, `renderJunitReport(results)`, `renderHtmlReport(results)` and the baseline functions report every frame's findings, and a frame that couldn't be scanned as not scanned, so it never reads as a pass. Run them in Node, from a task, since a spec runs in the browser and the SARIF reporter uses Node's `crypto`:

```js
// cypress.config.js, in setupNodeEvents(on, config)
const fs = require('node:fs');
const { renderSarifReport } = require('@surea11y/core/sarif');
on('task', {
  writeSarif({ file, results }) {
    fs.writeFileSync(file, renderSarifReport(results));
    return null;
  }
});
```

```js
// a spec
new A11yCoreBuilder().frames(true).analyze().then((results) => {
  cy.task('writeSarif', { file: 'a11y.sarif', results });
});
```

A task's argument is serialized on its way to Node, so leave out `.elementRef(true)` for a result sent there: each `element` would arrive as `{}`.

**Genuinely cross-origin iframes are a real, honest limitation here — unlike driver-based bindings that operate outside the browser's same-origin policy (e.g. via CDP/WebDriver).** Cypress spec code runs as ordinary in-page JavaScript and is fully subject to the same-origin policy: reading a cross-origin iframe's `contentWindow.document` throws a real `SecurityError`, confirmed empirically against `https://example.org/` embedded in an unrelated-origin fixture. There is no escape hatch for this today — `cy.origin()` switches Cypress's entire primary browsing context to a different origin for a whole callback block (built for OAuth-redirect-style flows), it does not grant access into an already-loaded cross-origin iframe nested inside the *current* page. A cross-origin sub-frame shows up in `results.frames` as `{ url, error }` instead of aborting the whole scan.

### Trimming the result to just violations

```js
new A11yCoreBuilder().reportOnly(['fail', 'cantTell']).analyze().then((results) => {
  console.log(results.checksResults); // only fail/cantTell entries, pass/notApplicable dropped
});
```

By default `analyze()` returns every rule's outcome, including `pass`/`notApplicable` — `@surea11y/core`'s own deliberate "not a violations-only list" design (see [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md)). Valid outcome values are `'pass'`, `'fail'`, `'cantTell'`, `'notApplicable'`. Pure binding-layer filtering — the engine itself still computes every rule. Combines with `.frames(true)`: the filter is applied to `results.topFrame` and each entry of `results.frames` independently.

A result trimmed this way is no longer the whole scan to `@surea11y/core`'s reporters: JUnit counts one test per rule it finds, and EARL makes one assertion per rule. To keep a result small and still hand it to them, ask the engine for a compact one instead, with `.options({ output: { detail: 'findings' } })`: a rule that passed or did not apply keeps only its outcome, and every reporter reads it as the full result. An almost empty page's result goes from about 238 KB to 83 KB.

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

### Checking against EN 301 549

EN 301 549, the standard the European Accessibility Act refers to, restates WCAG's Level A and AA criteria in its chapter 9. `.options({ profile })` runs the rules for its version, and each finding carries its EN 301 549 clause beside its WCAG criterion, in `meta.normativeMappings` (WCAG 1.1.1 is clause 9.1.1.1):

```js
// EN 301 549 V4.1.1 (WCAG 2.2 A and AA); 'en301549-v3.2.1' for V3.2.1 (WCAG 2.1 A and AA)
new A11yCoreBuilder()
  .options({ profile: 'en301549-v4.1.1' })
  .analyze()
  .then((results) => {
    results.engine.profile; // 'en301549-v4.1.1'
  });
```

`.withWcag()`, `.withRules()` and `.withTags()` select rules instead of a profile, so leave them out when scanning with one. As with any target, a scan with no failures means no rule found a violation, not that the page conforms: most criteria need a person to check them. A profile name core doesn't know is not an error: the scan runs without it, core warns in the page's console, and `results.engine.profile` is left out.

### Scanning with packs: standards, checklists and your own rules

A pack brings rules, variants of core's rules, a standard or a checklist, and their profiles and messages, from a package of its own: a national standard such as RGAA, or your organisation's accessibility policy. `@surea11y/core` runs a pack as it runs its own rules and standards, so its results, rollups and report entries look like core's. Packs need `@surea11y/core` 1.11.1 or later.

A pack is prepared in Node, where `@surea11y/core/pack` reads core's rule modules, and a Cypress spec runs in the browser. So in Cypress `.withPacks()` takes each pack's module name, a package name or a path from the project root, and the binding's plugin prepares the pack in Node. Register the plugin in `setupNodeEvents`:

```js
// cypress.config.js
const { defineConfig } = require('cypress');
const surea11y = require('@surea11y/cypress/plugin');

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      surea11y(on, config);
    }
  }
});
```

`.analyze()` then asks the plugin, through `cy.task`, for the script that registers the packs, and runs it in the page, and in every same-origin frame with `.frames(true)`, before the scan. A pack's profile is chosen with `.options({ profile })`:

```js
new A11yCoreBuilder()
  .withPacks('@acme/a11y-policy') // a pack, by its package name
  .options({ profile: 'acme-web-2026' })
  .analyze()
  .then((results) => {
    results.engine.packs;   // ['@acme/a11y-policy@1.0.0']
    results.engine.profile; // 'acme-web-2026'

    // A checklist's items, each one result, beside core's WCAG rollups:
    results.rulesResults.filter((r) => r.meta && r.meta.standard === 'Acme web policy');
  });
```

A pack's own rules appear in `checksResults` like core's, with ids that start with its namespace (`acme-no-autoplay`). Without its profile, a pack's rules run only when selected, with `.withRules()` or by a tag. `@surea11y/core`'s HTML, SARIF and JUnit reports show a standard's or a checklist's items in a section of their own. Pass an array, or call `.withPacks()` again, to scan with several packs.

The plugin loads a pack with Node's `require`, from the project root, and keeps it for the rest of the run, so a change to a pack's file shows on the next `cypress run`, or after restarting `cypress open`. A pack object, as the other bindings take, throws at `.withPacks()`: it can't be prepared in the browser. Without the plugin, the test fails with Cypress's own message that the task `surea11y:packScript` was not handled.

**Writing a pack.** A pack is an object made with `definePack` from `@surea11y/core/pack`. [`examples/acme-policy-pack.js`](./examples/acme-policy-pack.js) is a small one: a house rule, a checklist profile (WCAG 2.2 A and AA, `region`, and the house rule) and two checklist items. `npm run example:pack` scans a page with it, naming it by its path (`'./examples/acme-policy-pack.js'`), and [`examples/e2e-test-example.cy.js`](./examples/e2e-test-example.cy.js) uses it as a test gate. For a pack of your own, `npx surea11y-pack new <folder>` (from `@surea11y/core`) writes a package that works as generated, with its tests, docs and lint; core's [`PACKS.md`](https://github.com/SureA11y/core/blob/main/docs/PACKS.md) is the guide.

**When a pack doesn't run.** The plugin builds the page's script with the `@surea11y/core` this binding loads, and checks each pack as it does: for a pack that core can't run, such as one whose `core` range leaves out the installed core, or whose profile names a rule that doesn't exist, the test fails before scanning, with core's message naming the pack. A pack the page then doesn't run (one named with a raw `.options({ packs })` and never registered, or a page running another core version, when two copies of core are installed) is listed in `results.skippedPacks` with the reason. `getScanGaps()` reports that as `'pack-skipped'`, and the Command Log shows a `surea11y scan gap` entry, so a test gate that asserts on `getScanGaps(results)` fails rather than passing with the pack's checks never run. Install the pack beside the binding, so npm resolves one core for both.

### Element addressing beyond a CSS selector

Every occurrence already carries `selector` and (with `.elementRef(true)`, above) a live `Element`. It also carries `structuralPath` — a sibling-index path from the document root down to the flagged element (e.g. `[1, 0, 2]`) — a more robust identity than a selector string alone, since it survives some DOM changes a selector wouldn't. No opt-in needed.

An occurrence inside a shadow tree also carries `shadowHostSelectors`: the selectors of the shadow hosts leading to it, outermost first, each resolved in the tree that holds it. Its `selector` then holds only inside the last host's shadow root, so `document.querySelector(selector)` finds another element or none, and its `structuralPath` is `null`. `.elementRef(true)`, the Command Log and `formatFailures()` all follow the hosts (`@surea11y/core` 1.10.0 and later). See [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md) for the full field description.

## What changes with `@surea11y/core` 1.11

The binding passes rule IDs, tags and options through to the engine, so these show in results without a change here (see core's [`CHANGELOG.md`](https://github.com/SureA11y/core/blob/main/CHANGELOG.md) for the full list):

- **Messages are reworded** in all five languages to say plainly what is wrong and what to do (`This <img> has no alt attribute.`). Message keys, rule IDs, reason codes and baselines are unchanged; a test that matches message text needs the new wording.
- **Contrast and target size measure what is on screen.** In a browser, the contrast rules check only text a reader can see, measure it against what is painted under it, and measure form field values and placeholders. `target-size-minimum` measures the area a pointer can hit, and exempts only links in a sentence. Expect new findings, and some old ones gone.
- **`aria-hidden-focus` maps to 4.1.2 only**, no longer to 2.4.7 Focus Visible, so `.withTags('wcag2aa')` alone no longer selects it.
- **A custom rule counts toward its WCAG criterion.** A `.withCustomRules()` rule with `meta.wcagSc` (or a WCAG `normativeMappings` entry) fails that criterion's rollup when it fails, and custom rules run after core's.
- **On/off options read as meant**: `.options({ perfStats: 'false' })` is off, where it was on. `.options({ strictOptions: true })` rejects any option the engine doesn't read (see [Errors for input the engine can't use](#errors-for-input-the-engine-cant-use)).

## TypeScript

`src/A11yCoreBuilder.d.ts` (re-exported from `src/index.d.ts`, wired up via `package.json`'s `types` field) ships types for the whole builder API, `formatFailures()`, `getScanGaps()` and `formatOccurrenceLocation()`. The result shapes (`A11yCoreResult`, `CheckResult`, `Occurrence`, `CompositeResult`, etc.) are built on the types `@surea11y/core` ships, which follow [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md), adding only `occurrence.element` (for `.elementRef(true)`) and the `.frames(true)` shapes. `EngineErrorCode`, `ScanGap` and the other names are exported too, and so are `withWcag()` (`WcagVersion`, `WcagLevel`) and `withPacks()`, which takes module names; `@surea11y/cypress/plugin` has its own types. Code that handles every `ScanGap` kind it knows and treats the rest in an `else` branch needs a branch for `'pack-skipped'`, which carries `pack` rather than `selectors`. `tests/types.test.js` compiles a typical spec against them. `analyze()` is typed `Cypress.Chainable<A11yCoreResult | A11yCoreMultiFrameResult>` — narrow on `'topFrame' in results` (or cast, if you already know which mode you called) to get the specific shape back.

## Relationship to the sibling bindings

This binding's builder API is deliberately close to `@surea11y/playwright`'s, `@surea11y/puppeteer`'s, `@surea11y/selenium`'s, and `@surea11y/webdriverio`'s — same method names, same mutability contract, same result shapes wherever Cypress's own architecture allows it. `A11yCoreBuilder` here extends `A11yCoreBuilderBase` from [`@surea11y/binding-base`](https://github.com/SureA11y/binding-base), a small shared package all of these bindings depend on for their common, non-driver-specific logic (`include`/`exclude`/`withTags`/`disableTags`/`withRules`/`disableRules`/`withWcag`/`withBestPractices`/`includeMode`/`wcagLevel`/`options`/`reportOnly`/`elementRef`/`frames`, `withCustomRules()`'s validation, `formatFailures()`, `getScanGaps()`, and finding an occurrence through its shadow hosts). The real differences, all driven by Cypress's fundamentally different architecture (test code runs in-browser, not as a separate automation-process driver), stay local to this project's own `A11yCoreBuilder.js`:

- No `{ page }`/`{ browser }`/`{ driver }` constructor argument (see above).
- `analyze()` returns a Cypress chainable, not a `Promise`.
- `withCustomRules()` needs no function-to-string conversion.
- `withPacks()` takes module names, which the plugin prepares in Node, rather than pack objects.
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
