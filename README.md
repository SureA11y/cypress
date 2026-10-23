# @surea11y/cypress

A Cypress binding for [`@surea11y/core`](https://github.com/SureA11y/core) — scans a real, already-rendered page for accessibility issues using surea11y's DOM-rules engine.

## Install

```bash
npm install @surea11y/core @surea11y/cypress cypress
```

`@surea11y/core` 1.12.0 or later, the engine, comes with the binding as a regular dependency, so a project that doesn't list it still works. List it in your own `package.json` too, as the line above does: your project and the binding then share one copy, so whatever you do with core directly, writing a SARIF log or an HTML report (`@surea11y/core/sarif`, `/report`), reading the rule catalogue or keeping a baseline, reads results with the same core that produced them. When your core can't match the binding's range, as with a linked checkout (`file:../core`) or a fork, add `"overrides": { "@surea11y/core": "$@surea11y/core" }` beside it.

**Coming in 2.0:** core becomes a peer dependency, so the binding will no longer install it for you, and the `overrides` entry is no longer needed. Add `@surea11y/core` to your `package.json` now and 2.0 needs no change.

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

`results` is `@surea11y/core`'s own native result shape (and `results.engine.version` says which core release produced it, for example `"1.12.0"`; from 1.4.0 this package needs core 1.12.0 or later, see [What changes with `@surea11y/core` 1.12](#what-changes-with-surea11ycore-112)) — see [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md) — not the `violations`/`passes`/`incomplete`/`inapplicable` shape used by other popular accessibility testing tools for Cypress. The builder's *method names* are modeled on common conventions in this space for migration familiarity; the richer result schema is kept as-is.

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

`.withWcag(version, level)` selects by conformance target: `.withWcag('2.2', 'AA')` runs the rules for WCAG 2.2's Level A and AA criteria, by the level each criterion has in that version (4.1.1 Parsing, which 2.2 removed, is part of a `'2.1'` target and not of a `'2.2'` one). `.withBestPractices()` adds the rules that name no WCAG criterion, such as `region` and `heading-order`; on its own it runs only those. `.withRules()` and `.withTags()` add to a target's rules, and the disable methods apply after. The level is read in any case (`'aa'` is `'AA'`). A version other than `'2.0'`, `'2.1'` or `'2.2'`, or a level other than A, AA or AAA, throws a `TypeError` with `code: 'INVALID_RUN_ONLY'` at the call. Both need `@surea11y/core` 1.11 or later.

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

Without `.wcagLevel('AA')`, that scan reports 1.4.6 as well, so a site that meets AA can show a failing AAA criterion it never aimed for. With it, the scan reports 1.4.3 alone, and `results.engine.wcagLevel` says `'AA'`. A `.withWcag()` target already implies its level; `.wcagLevel()` is for selections that don't, and wins when both are given, as it does over a level given through `.options()`. `'A'`, `'AA'` or `'AAA'` in any case is accepted. Anything else throws a `TypeError` with `code: 'INVALID_ENGINE_OPTIONS'` at the call, and `null` clears it. Needs `@surea11y/core` 1.12.0 or later.

`.plannedChecks()` and `.plannedCriteria()` say what a scan *will* check before you run it: the rules it runs (entries with `ruleId`) and the criteria it reports in `rulesResults` (entries with `id`), from core's catalog with the same selection and options. The catalog is read in Node, so they go through `@surea11y/cypress/plugin` (register it as [for packs](#scanning-with-packs-standards-checklists-and-your-own-rules)) and return a chainable, like `.analyze()`. Use them to record what a run covered, or to catch a selection that runs nothing, which would otherwise look like a clean scan:

```js
const builder = new A11yCoreBuilder().withTags('forms').withRules('contrast-computable');
builder.plannedChecks().then((checks) => {
  expect(checks, 'This selection runs no rule. Did you mean .includeMode("or")?').not.to.be.empty;
});
builder.analyze().then((results) => { /* ... */ });
```

Packs named in `.withPacks()` and custom rules, live functions included, count as they do in the scan.

`.exclude(selector)` above excludes globally. Pass a second argument to scope it to specific rule IDs instead: `.exclude('.mat-select', { rules: ['aria-required-children'] })` skips `.mat-select` for that rule only — every other rule still sees it. Global and rule-scoped `.exclude()` calls compose freely.

### Errors for input the engine can't use

Since `@surea11y/core` 1.10.0 the scan fails, instead of quietly running every rule or none, when it is given something it can't use. The error carries a `code`:

- `INVALID_RUN_ONLY`: none of the rule IDs given to `.withRules()`, or none of the tags given to `.withTags()`, is one the engine knows (a typo such as `'wcag2.2aa'` for `'wcag22aa'`). An unknown value beside known ones is ignored with a `console.warn`. `.withTags()`/`.disableTags()`/`.withRules()`/`.disableRules()` also throw a `TypeError` with this code at the call itself for anything but a non-empty string or an array of them (an `undefined` from a missing config value, say).
- `INVALID_CONTEXT_SELECTOR`: an `.include()` selector the browser can't parse; the error's `selector` names it.
- `INVALID_ENGINE_OPTIONS` (core 1.11 and later): with `.options({ strictOptions: true })`, an option the engine doesn't read or a value it can't use. The message names each, with the closest known option (`lcoale`: did you mean `locale`?). Without `strictOptions`, a likely typo is only warned about in the page's console.
- `PAGE_BUILTINS_BROKEN` (core 1.11 and later): the page's own scripts broke a JavaScript built-in the engine relies on (`Array.prototype.filter`, `Map`, `JSON.stringify`, ...), so no result it gave could be trusted. The message names each one.

The scan runs in the application's own window, and Cypress fails the test with the engine's error object as thrown, `code` included, so `cy.on('fail', (err) => err.code)` can tell them apart.

**Create one builder per scan.** `A11yCoreBuilder` is a mutable object with no reset between `.analyze()` calls — `include()`/`exclude()`/`withRules()`/`disableRules()`/`withTags()`/`disableTags()`/`options()`/`withCustomRules()`/`withPacks()` all push onto or merge into internal state that persists for the instance's lifetime. Calling one of them again before a second `.analyze()` call *accumulates* on top of the first scan's scope rather than replacing it (this is exactly what makes "call `.include()` several times for one scan," above, work — the same accumulation just also applies across separate scans if you reuse an instance). `.reportOnly()`/`.frames()`/`.elementRef()`/`.screenshots()`/`.withWcag()`/`.withBestPractices()`/`.includeMode()`/`.wcagLevel()` are the exception: each call replaces the previous value instead of merging with it.

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

`getScanGaps(result)` lists what one scan result says it left out, which its `checksResults` alone would pass over as clean: `{ kind: 'context-not-found' }` when the `.include()` scope matched no element, `'context-partly-not-found'` when some of several did not, one `'custom-rule-skipped'` (with `rule: { id, reason }`) per custom rule the engine did not run (a custom rule you excluded yourself with `.disableRules()` is listed in `skippedCustomRules` with `excluded: true`, and isn't a gap), and one `'pack-skipped'` (with `pack: { name, reason }`, from `results.skippedPacks`) per pack the page did not run (see [Scanning with packs](#scanning-with-packs-standards-checklists-and-your-own-rules)). Each has a `message`. For a `.frames(true)` scan, call it on `topFrame` and on each scanned frame.

`getScanNotes(result)` says how the page was scanned, which a gap doesn't cover, and nothing was left out: `'forced-colors'` when the page was shown in [forced colors](#forced-colors), `'internals-hook'` when the scan asked about web components it could have read with the [internals hook](#web-components-the-internals-hook), and `'listener-hook'` when it asked about handlers whose keyboard equivalent the [listener hook](#listeners-added-from-script-the-listener-hook) would have let it see.

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

Scanned with @surea11y/core 1.12.0.: expected 2 to equal 0
```

Before the version line, it also prints the result's notes (`getScanNotes()`), such as a page shown in forced colors.

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
surea11y scan note  1 custom element was asked about because the scan could not read the name or states ...
```

Click any `surea11y error!` row to highlight the flagged element(s) in the app preview (`$el`, each occurrence looked up in the scanned document, through its shadow hosts when it is inside a shadow tree), and its `consoleProps` (open the browser DevTools console after clicking the row) prints the full check object — `ruleId`/`severity`/`occurrences`/etc.

This gives failing scans a readable, per-rule Command Log trace, rather than a bare `window`/`then` step. Entries are named `'surea11y error!'`/`'surea11y violation summary'` — distinguishable from similarly-named entries other accessibility plugins produce at a glance when multiple specs run in the same suite, while staying visually parallel enough to read as the same kind of thing.

A `surea11y scan gap` entry (its `consoleProps` is the gap, as `getScanGaps()` returns it) appears when the `.include()` scope, or part of it, matched no element, or a custom rule or a pack did not run. Without it, a scan that scanned nothing would log nothing, like a clean one. A `surea11y scan note` entry appears once per scan when the scan asked about web components it could have read with the [internals hook](#web-components-the-internals-hook).

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

### A picture of each failing element

Opt in with `.screenshots()`, and each occurrence the scan flags gets a `screenshot` field. It holds a PNG of the element, with a box drawn around it, that `cy.screenshot()` saved under Cypress's screenshots folder, or the reason there is none:

```js
new A11yCoreBuilder()
  .screenshots({ padding: 16 })
  .analyze()
  .then((results) => {
    const [first] = results.checksResults.filter((r) => r.outcome === 'fail');
    first.occurrences[0].screenshot;
    // { path: '.../cypress/screenshots/a11y.cy.js/surea11y/element-3f9a1c07.png', box: { x: 16, y: 16, width: 120, height: 40 } }
  });
```

| Option | Default | |
|---|---|---|
| `dir` | `surea11y` | The folder under Cypress's screenshots folder (`screenshotsFolder`, per spec) the pictures go in. |
| `outcomes` | `['fail']` | Which occurrences to picture. For contrast, `['fail', 'cantTell']` shows the background the engine couldn't judge. |
| `padding` | `0` | CSS pixels of context around the element. |
| `highlight` | `true` | Draw a box around the element, over the page; the element itself is never restyled. |
| `max` | `50` | At most this many pictures per scan, frames included. |

- **One picture per element.** Several rules can flag the same element. It's pictured once, and each of their occurrences carries the same `screenshot`. A file is named after where the element is, as `element-<hash>.png`, and is overwritten on the next run, so it keeps its name. `formatFailures()` names it under each finding (`   screenshot: …/element-3f9a1c07.png`).
- **`path` is the file Cypress wrote.** There is no `buffer`, as in the other bindings: a spec runs in the browser. Read a picture in Node through a `cy.task()` if you need its bytes.
- **`box`** is where the element shows in the picture, in CSS pixels; the PNG is larger by the device pixel ratio. `cropped: true` says only part of it shows, as for an element taller than the viewport, which is pictured from its top-left corner.
- **No picture, and why.** `{ skipped }` with:
  - `'no-element'`: no selector, or nothing matches it any more;
  - `'page-level'`: a finding about the whole page, on `<html>`, `<head>` or `<body>`;
  - `'not-rendered'`: such as `display: none`;
  - `'zero-size'`;
  - `'off-screen'`: such as `left: -9999px`;
  - `'max-reached'`;
  - `'capture-failed'`, with the `error`: something on the page went wrong, such as an `<iframe>` that is gone.
- **The page is put back.** Each element is scrolled into view for its picture. Afterwards every scroll position is restored and the box removed. Something drawn over the element, such as a sticky header, shows as it does on screen.
- **Frames.** With `.frames(true)`, an element in a same-origin `<iframe>` is pictured on the page as it shows there. Cross-origin frames aren't scanned in Cypress (see [Scanning every frame](#scanning-every-frame-including-same-origin-iframes)).
- **Off by default.** Pictures of real pages can hold personal data, and they end up as CI artifacts.

Each picture is a `cy.screenshot({ capture: 'viewport', clip })` of the element's box, taken right after the scan, before `.reportOnly()` trims the result. `.screenshots()` combines with `.elementRef(true)`. Unlike the other bindings, a `cy.screenshot()` that fails fails the test, as any Cypress command does, and does so before the page is put back. Focus, hover, animations or content that loads late can still differ from what the scan saw. An option it can't use throws a `TypeError` with `code: 'INVALID_ENGINE_OPTIONS'` at the call, and so does `.analyze()` with `options({ output: { includeSelector: false } })`, since each element is found by its selector.

### Web components: the internals hook

Many web components keep their `ElementInternals` in a private field and name themselves, set their states or give themselves a role through it:

```js
class SubscribeCheckbox extends HTMLElement {
  #internals = this.attachInternals();
  constructor() {
    super();
    this.#internals.ariaLabel = 'Subscribe';
    this.#internals.ariaChecked = 'false';
  }
}
```

The browser exposes that name, but no page script can read it back, so by default the scan asks about such a component (`cantTell`) instead of judging it. A component that's a `switch` only through `this.#internals.role` isn't even asked about: the scan doesn't see its role, so it isn't checked at all.

`installInternalsHook()` installs `@surea11y/core`'s opt-in hook, which records each component's internals for the scan to read. It has to run before the app's scripts. Call it once in your support file, and every visit from then on gets it, through Cypress's `window:before:load`:

```js
// cypress/support/e2e.js
import { installInternalsHook } from '@surea11y/cypress';

installInternalsHook();
```

Or for one visit, as `onBeforeLoad`:

```js
cy.visit('/settings', { onBeforeLoad: installInternalsHook });
new A11yCoreBuilder().analyze().then((results) => {
  expect(results.engine.environment.internalsHook).to.equal('early'); // the hook ran before the app's scripts
});
```

With it, the checkbox above passes, an unnamed component that attaches internals fails like any unnamed control, and the switch is checked as a switch, so it fails without a name. `A11yCoreBuilder.installInternalsHook()` is the same function, as every binding's builder has it.

- **Content Security Policy.** It runs the script with the app window's `eval`, which works because Cypress strips the app's Content Security Policy by default. If yours keeps it (`experimentalCspAllowList`) and forbids `eval`, the hook can't run.
- **Frames inside the app don't get it**; `window:before:load` fires for the app's own window.
- **For test and audit runs.** The hook wraps `HTMLElement.prototype.attachInternals` (components get the same internals back), adds a stack frame to errors thrown through it, and keeps its record under a global symbol, where any script on the page can read every component's internals. That's why it's opt-in.
- **Without it**, the Command Log shows a `surea11y scan note` when the scan asked about such components, and `getScanNotes()` gives that note as `kind: 'internals-hook'`.

### Listeners added from script: the listener hook

The keyboard rules read inline handlers (`onclick="…"`) from the markup. Most apps add theirs from script, which no page script can list afterwards:

```js
document.querySelector('#save').addEventListener('click', save); // on a <div role="button" tabindex="0">
```

The browser fires `click` from Enter and Space only on native controls, so this button does nothing from the keyboard. By default the scan can't see the listener, so it doesn't report the element.

`installListenerHook()` (`@surea11y/core` 1.14.0 and later) installs core's opt-in hook, which records the click, key, focus and mouse listeners the app adds with `addEventListener` or an `onclick`-style property. It's called as `installInternalsHook()` is, once in your support file for every visit, or as `onBeforeLoad` for one; the two can be installed together:

```js
// cypress/support/e2e.js
import { installInternalsHook, installListenerHook } from '@surea11y/cypress';

installInternalsHook();
installListenerHook();
```

```js
cy.visit('/settings', { onBeforeLoad: installListenerHook });
new A11yCoreBuilder().analyze().then((results) => {
  expect(results.engine.environment.listenerHook).to.equal('early'); // the hook ran before the app's scripts
});
```

With it:

- **The button above fails** `click-handler-keyboard-operable` (`CLICK_HANDLER_NO_KEY_LISTENER`): it's a focusable control with no key listener on it, inside it, above it, on the document or on the window. Once it listens for `keydown`, it passes.
- **A key listener only above the element** (on an ancestor, the document or the window) is asked about: it may handle this element's keys, or only others'.
- **A click listener on a container**, as a framework that delegates events from its root adds, makes no element inside it a candidate, so delegated handlers never fail.
- **Pointer listeners** added from script are asked about by `mouse-only-event-handlers`, unless the element also has a keyboard equivalent.

`A11yCoreBuilder.installListenerHook()` is the same function. The internals hook's limits apply: it needs Cypress's default Content Security Policy stripping, and frames inside the app don't get it.

- **For test and audit runs.** The hook wraps `addEventListener`, `removeEventListener` and the `on…` property setters (listeners themselves aren't wrapped, and run as before), and keeps its record under a global symbol. That's why it's opt-in.
- **Without it**, the Command Log shows a `surea11y scan note` when the scan asked about an inline click or pointer handler whose keyboard equivalent may have been added from script, and `getScanNotes()` gives that note as `kind: 'listener-hook'`.

### Status messages: the live-region hook

A status message ("Saved", "3 results") reaches a screen reader when a live region's content changes while the screen reader can reach it (WCAG 4.1.3). A scan sees the page at one moment, after the message came, so by itself it can only judge the live regions that are there: `live-region-announcements` asks about one hidden from assistive technology with `aria-hidden` or `inert`, or left `aria-busy`.

`installLiveRegionHook()`, from `@surea11y/cypress`, (`@surea11y/core` 1.14.0 and later) installs core's opt-in hook, which records what live regions are given from the load event on. Call it **before** the page loads, as the other hooks. `getAnnouncements()` then yields what the app made available to announce, in order:

```js
// cypress/support/e2e.js: every visit from then on gets it
import { installLiveRegionHook, getAnnouncements } from '@surea11y/cypress';
installLiveRegionHook();

// In a spec
cy.visit('/');
cy.get('#save').click();

getAnnouncements().then((said) => {
  expect(said.map((a) => a.text)).to.include('Saved');
});
// [{ text: 'Saved', politeness: 'polite', time: 1834 }]
```

With it, `live-region-announcements` also asks about a region the page added with its text already in it (`LIVE_REGION_INSERTED_WITH_CONTENT`; `role="alert"` is left out, since an alert added that way is announced) and a hidden region shown and filled at once (`LIVE_REGION_SHOWN_AND_FILLED`), even if it has left the page since, like a toast. The result records the hook in `engine.environment.liveRegionHook`.

- **What it says.** `getAnnouncements()` is what the page made available to announce: the text a shown live region, reachable by assistive technology, was given. Not what a screen reader said, which depends on the screen reader. It returns `null` without the hook.
- **For test and audit runs.** The hook only observes, with one `MutationObserver`, and keeps its record under a global symbol. That's why it's opt-in.
- **For one visit.** `cy.visit(url, { onBeforeLoad: installLiveRegionHook })` installs it for that visit only, as the other hooks.

### Forced colors

A page shown in forced colors (Windows high contrast) draws in the user's colors, not its own. `results.engine.environment.forcedColors` says which it was: `'active'` or `'none'`. To check a page under forced colors on purpose, emulate it through the DevTools protocol before visiting, in Chrome, Edge or Electron:

```js
// Cypress.automation() runs as soon as it's called, so put it in the command queue
cy.then(() => Cypress.automation('remote:debugger:protocol', {
  command: 'Emulation.setEmulatedMedia',
  params: { features: [{ name: 'forced-colors', value: 'active' }] }
}));
cy.visit('/');
new A11yCoreBuilder().analyze().then((results) => {
  expect(results.engine.environment.forcedColors).to.equal('active');
});
```

`remote:debugger:protocol` is only there in Chromium-family browsers, so not in Firefox. The contrast rules still measure the page's own colors under forced colors, since WCAG judges contrast in those, so results match a scan with forced colors off; a contrast finding the engine couldn't measure that way carries `details.forcedColors: true`. When forced colors were active, `formatFailures()` adds a line saying so, since it's easy to miss on a CI agent with high contrast turned on.

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

Install a published pack in your project, beside core and this package:

```bash
npm install @surea11y/core @surea11y/cypress cypress @acme/a11y-policy
```

Your project, this package and the pack then share one copy of core, so the core that checks the pack is the one that runs it. With two copies, a scan can skip the pack (see "When a pack doesn't run" below). In Cypress the plugin loads the pack in Node by the name `.withPacks()` is given, so that package has to be installed in the project.

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

**When a pack doesn't run.** The plugin builds the page's script with the `@surea11y/core` this binding loads, and checks each pack as it does: for a pack that core can't run, such as one whose `core` range leaves out the installed core, or whose profile names a rule that doesn't exist, the test fails before scanning, with core's message naming the pack. A pack the page then doesn't run (one named with a raw `.options({ packs })` and never registered, or a page running another core version, when two copies of core are installed) is listed in `results.skippedPacks` with the reason. `getScanGaps()` reports that as `'pack-skipped'`, and the Command Log shows a `surea11y scan gap` entry, so a test gate that asserts on `getScanGaps(results)` fails rather than passing with the pack's checks never run.

### Style sheets from another origin

A page's script can't read the rules of a style sheet served from another origin (a CDN, a fonts service), so a check that reads the CSS, such as `css-orientation-lock`, can't tell whether it holds an orientation lock and asks about it. With `@surea11y/core` 1.14.0 or later, `analyze()` first fetches, in the page, every such sheet whose server shares it (CORS), as axe does, and gives core its text, which it then checks. A spec runs in the browser, so a sheet whose server doesn't share it stays unread, and the check asks as before (the other bindings fetch those from Node). It's on by default; each request is given up after five seconds. To send no request but the page's own:

```js
new A11yCoreBuilder().fetchStyleSheets(false).analyze();
```

### Element addressing beyond a CSS selector

Every occurrence already carries `selector` and (with `.elementRef(true)`, above) a live `Element`. It also carries `structuralPath` — a sibling-index path from the document root down to the flagged element (e.g. `[1, 0, 2]`) — a more robust identity than a selector string alone, since it survives some DOM changes a selector wouldn't. No opt-in needed.

An occurrence inside a shadow tree also carries `shadowHostSelectors`: the selectors of the shadow hosts leading to it, outermost first, each resolved in the tree that holds it. Its `selector` then holds only inside the last host's shadow root, so `document.querySelector(selector)` finds another element or none, and its `structuralPath` is `null`. `.elementRef(true)`, the Command Log and `formatFailures()` all follow the hosts (`@surea11y/core` 1.10.0 and later). See [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md) for the full field description.

## What changes with `@surea11y/core` 1.14

With `@surea11y/core` 1.14.0, what a scan through this binding shows differently (core's [`CHANGELOG.md`](https://github.com/SureA11y/core/blob/main/CHANGELOG.md) has the full list):

- **Status messages.** `live-region-announcements` (4.1.3) asks about a live region hidden with `aria-hidden` or `inert`, or left `aria-busy`. With [`installLiveRegionHook()`](#status-messages-the-live-region-hook) it also asks about one added with its text or shown and filled at once, and `getAnnouncements()` reads what the page made available to announce.
- **Listeners added from script.** With [`installListenerHook()`](#listeners-added-from-script-the-listener-hook), `click-handler-keyboard-operable` judges a click listener added with `addEventListener` as an inline `onclick`, and fails a focusable control that no key listener can reach (`CLICK_HANDLER_NO_KEY_LISTENER`); `mouse-only-event-handlers` asks about pointer listeners added from script. Both rules' messages now say "click handler" rather than "onclick handler".
- **Roles that depend on context.** `aria-allowed-attr` no longer fails `aria-expanded` on a text input whose `list` names a `<datalist>` (a combobox), and now judges `<td>`: `cell` in a table, `gridcell` in a grid. `label-in-name` checks a `<td>` in a grid. `heading-order` and `page-has-heading-one` count a heading marked `role="none"` that can take focus or has a global ARIA attribute, as browsers do.
- **Style sheets from another origin are checked.** `analyze()` fetches, in the page, the style sheets it can't read whose server shares them, and core checks them, so `css-orientation-lock` finds a lock in a CDN's CSS instead of asking (`.fetchStyleSheets(false)` turns it off). [More](#style-sheets-from-another-origin).
- **Criteria are `notApplicable` only where the rules see every case.** A WCAG rollup whose rules all found nothing is now `cantTell` (`reasonCode` `composite.rollup.cantTell.partialCoverage`), except for 1.3.5, 2.4.3, 2.4.4, 2.4.7, 2.4.9, 2.5.3, 2.5.8, 3.3.2 and 4.1.1, whose rules find every link, field, focusable element, target or id. A gate that asserted a criterion `notApplicable` now sees `cantTell`.
- **New checks.** `click-handler-keyboard-operable` (2.1.1, 2.1.3) fails an inline `onclick` on an element the keyboard can't reach, and asks about one that has no key handler. `moving-content-pausable` (2.2.2) asks about content that moves by itself for more than five seconds.
- **Placeholders below the contrast ratio fail** when the page chose their colours; in the browser's own colours they pass. They used to be questions.
- **More questions in some places**, fewer in others: `css-hidden-focus` asks about a link in a closed off-canvas menu or a container clipped to nothing; contrast is measured over solid backgrounds, empty background layers, `::before` strips and drop shadows it used to ask about; `link-name-quality` knows more French generic phrases.
- **Some reason codes are split by cause**, so a baseline entry for one of those findings comes back once as new: `LIST_ITEM_ROLE_OVERRIDDEN`, `LIST_ROLE_OVERRIDDEN`, `DUPLICATE_ID_IN_SHADOW_TREE`, `DEFAULT_LANG_INVALID`, `IMAGE_ONLY_CONTROL_CONTENT`, `HEADING_LIKE_NUMBER`, `HEADING_LIKE_LINK`.

## What changes with `@surea11y/core` 1.12

This release needs `@surea11y/core` 1.12.0. What a scan through this binding shows differently (core's [`CHANGELOG.md`](https://github.com/SureA11y/core/blob/main/CHANGELOG.md) has the full list):

- **An empty heading now fails an unscoped scan.** `empty-heading` used to ask about a heading with no accessible name; it now fails it. It's a best practice, so it runs in a scan that selects nothing and with `.withBestPractices()`, not under `.withWcag()`, tags or a profile. A gate on a page with `<h2></h2>` that asserted no failures now fails: fix the heading, or scan a WCAG target.
- **Scans that pick rules report their criteria.** `.withRules('img-alt-present')`, a non-WCAG tag or `.withBestPractices()` now fill `rulesResults` with the WCAG criteria those rules belong to, where it was empty. A criterion whose other rules weren't selected is `cantTell` (`reasonCode` `composite.rollup.cantTell.notSelectedChild`), and each check's `rollupIds` names the criteria it was added for. `.wcagLevel()` keeps those criteria to a level.
- **Four rules count towards more criteria**, as W3C's ACT rules map them: `input-image-alt-present` adds 4.1.2, `aria-roles-valid` 1.3.1, `link-name-present` 2.4.9 (AAA), and `meta-refresh-timing-absent` 2.2.4 and 3.2.5 (AAA). The findings don't change; the 1.3.1 and 4.1.2 rollups can now fail where they passed.
- **Unnamed custom elements are questions.** A defined custom element with no visible name may name itself through `ElementInternals`, so it's `cantTell` (`name_internals`) where it used to fail. [`installInternalsHook()`](#web-components-the-internals-hook) lets the engine decide.
- **`engine.wcagLevel`** records the level a scan was gated by, and [`.wcagLevel()`](#usage) sets it.
- **`engine.environment.forcedColors`** records whether the page was in [forced colors](#forced-colors).
- **A custom rule you exclude** isn't a scan gap any more, so `.disableRules()` of one logs no `surea11y scan gap`.
- **Rule IDs in another case select their rule**: `.withRules('IMG-ALT-PRESENT')` used to throw `INVALID_RUN_ONLY` or be ignored.
- **`runOnly.optInTags` on its own throws** `INVALID_RUN_ONLY`; it was accepted and did nothing. Opt-in rules are unlocked with `.options({ optInRules })`.
- **A finding in a shadow tree is located through its hosts**, as `#card >>> img`, in core's HTML report, SARIF, JUnit and baselines, as `formatFailures()` already did.
- **An inline `policyContract`** with an unknown value in `allowedOutcomes` or `allowedConfidence` drops that value with a warning, where it turned every check into `cantTell`.

## What changes with `@surea11y/core` 1.11

The binding passes rule IDs, tags and options through to the engine, so these show in results without a change here (see core's [`CHANGELOG.md`](https://github.com/SureA11y/core/blob/main/CHANGELOG.md) for the full list):

- **Messages are reworded** in all five languages to say plainly what is wrong and what to do (`This <img> has no alt attribute.`). Message keys, rule IDs, reason codes and baselines are unchanged; a test that matches message text needs the new wording.
- **Contrast and target size measure what is on screen.** In a browser, the contrast rules check only text a reader can see, measure it against what is painted under it, and measure form field values and placeholders. `target-size-minimum` measures the area a pointer can hit, and exempts only links in a sentence. Expect new findings, and some old ones gone.
- **`aria-hidden-focus` maps to 4.1.2 only**, no longer to 2.4.7 Focus Visible, so `.withTags('wcag2aa')` alone no longer selects it.
- **A custom rule counts toward its WCAG criterion.** A `.withCustomRules()` rule with `meta.wcagSc` (or a WCAG `normativeMappings` entry) fails that criterion's rollup when it fails, and custom rules run after core's.
- **On/off options read as meant**: `.options({ perfStats: 'false' })` is off, where it was on. `.options({ strictOptions: true })` rejects any option the engine doesn't read (see [Errors for input the engine can't use](#errors-for-input-the-engine-cant-use)).

## TypeScript

`src/A11yCoreBuilder.d.ts` (re-exported from `src/index.d.ts`, wired up via `package.json`'s `types` field) ships types for the whole builder API, `formatFailures()`, `getScanGaps()` and `formatOccurrenceLocation()`. The result shapes (`A11yCoreResult`, `CheckResult`, `Occurrence`, `CompositeResult`, etc.) are built on the types `@surea11y/core` ships, which follow [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md), adding only `occurrence.element` (for `.elementRef(true)`), `occurrence.screenshot` (for `.screenshots()`, `CypressScreenshot`, with its options as `CypressScreenshotOptions`) and the `.frames(true)` shapes. `EngineErrorCode`, `ScanGap`, `ScanNote` and the other names are exported too, and so are `withWcag()` and `wcagLevel()` (`WcagVersion`, `WcagLevelInput`), `plannedChecks()`/`plannedCriteria()` (chainables of `PlannedCheck[]` and `PlannedCriterion[]`), `getScanNotes()`, `installInternalsHook()`, `installListenerHook()`, and `withPacks()`, which takes module names; `@surea11y/cypress/plugin` has its own types. Code that handles every `ScanGap` kind it knows and treats the rest in an `else` branch needs a branch for `'pack-skipped'`, which carries `pack` rather than `selectors`. `tests/types.test.js` compiles a typical spec against them. `analyze()` is typed `Cypress.Chainable<A11yCoreResult | A11yCoreMultiFrameResult>` — narrow on `'topFrame' in results` (or cast, if you already know which mode you called) to get the specific shape back.

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
