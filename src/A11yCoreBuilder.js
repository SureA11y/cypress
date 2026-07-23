'use strict';

const { runa11yCoreInPage } = require('a11y-core');

// See a11y-core's docs/OUTPUT_SCHEMA.md -- the only valid `outcome` values a
// checksResults entry can carry.
const VALID_OUTCOMES = ['pass', 'fail', 'cantTell', 'notApplicable'];

/**
 * Cypress binding for a11y-core -- scans a real, already-rendered page.
 *
 * new A11yCoreBuilder()
 *   .include('#main')
 *   .exclude('.cookie-banner')
 *   .withTags(['wcag2a', 'wcag2aa'])
 *   .disableRules(['a11ycore-meta-refresh-no-exceptions'])
 *   .options({ contrast: { mode: 'auditorAssist' } })
 *   .analyze()
 *   .then((results) => {
 *     expect(results.checksResults.filter((r) => r.outcome === 'fail')).to.have.length(0);
 *   });
 *
 * `results` is a11y-core's own native result shape (checksResults /
 * rulesResults -- see a11y-core's docs/OUTPUT_SCHEMA.md), not axe-core's
 * violations/passes/incomplete/inapplicable shape. Method names are modeled
 * on axe-core's AxeBuilder (and this package's own sibling bindings) for
 * migration ease, but the richer native schema is kept as-is.
 *
 * No `{ page }`/`{ browser }`/`{ driver }` constructor argument, unlike every
 * sibling binding (Playwright/Puppeteer/Selenium/WebdriverIO) -- there's no
 * such handle in Cypress. `cy` is ambient in every spec file and *is* the
 * driver; this class calls `cy.window()` itself inside `analyze()`.
 *
 * ## `analyze()` returns a Cypress chainable, not a Promise
 *
 * `cy.*` commands are queued, not `await`able -- mixing `async`/`await` with
 * them breaks Cypress's retry/ordering guarantees (see ../ROADMAP.md §2c).
 * So, unlike every sibling binding's `async analyze()`, this one ends its
 * internal chain with `cy.window().then(...)` and returns that chainable
 * directly. Use `.then()` to get the result, the way every other `cy.*`
 * command works -- never `await new A11yCoreBuilder().analyze()`.
 *
 * ## The realm boundary (see ../ROADMAP.md §2b for the full story)
 *
 * Cypress test code and the application-under-test (AUT) run in the same
 * browser tab, so there's no network/IPC serialization boundary the way
 * there is for Playwright/Puppeteer/Selenium/WebdriverIO's `page.evaluate()`
 * equivalent -- but the AUT still lives in its own nested iframe, a distinct
 * JS *realm* from the spec file's own top-level code. `runa11yCoreInPage`
 * references ambient `document`/`window` in its body; naively calling it
 * with `.call(win, ...)` only rebinds `this`, it does NOT relocate which
 * realm's globals the function's own body closes over -- it would silently
 * keep scanning the Cypress runner's own chrome, not the AUT. This class
 * instead reconstructs the function's *source* inside the target window's
 * own realm via `win.eval(...)`, so its internal `document`/`window`
 * references resolve correctly. Verified against a real Cypress run, not
 * just reasoned about -- see ../ROADMAP.md §2b.
 *
 * Because of that same realm access, a live `customRules` function (defined
 * back in the spec's own realm) can be passed straight through with no
 * `.toString()` conversion -- unlike every sibling binding's
 * `withCustomRules()`. See `withCustomRules()` below.
 *
 * ## Scanning every frame, including same-origin nested iframes
 *
 * `.frames(true)` recurses into every same-origin `<iframe>` reachable from
 * the top window (and their own nested iframes), the same
 * `{ topFrame, frames }` shape the sibling bindings return. **Genuinely
 * cross-origin iframes are a real, honest limitation here** -- unlike the
 * other four bindings (which reach every frame via CDP/WebDriver at the
 * automation-process level, outside the browser's same-origin policy),
 * Cypress spec code runs as ordinary in-page JavaScript and is fully subject
 * to it. Reading a cross-origin iframe's `contentWindow.document` throws a
 * real `SecurityError`, verified empirically against `https://example.org/`
 * embedded in an unrelated-origin fixture (see ../ROADMAP.md §2d and
 * tests/builder.cy.js) -- there is no escape hatch for this today (`cy.origin()`
 * switches Cypress's *entire* primary browsing context to a different origin
 * for a whole callback block; it doesn't grant access into an already-loaded
 * cross-origin iframe nested inside the *current* origin's page). A
 * cross-origin sub-frame is reported as `{ url, error }` in the `frames`
 * array, the same shape a detached/sandboxed frame gets in the sibling
 * bindings, rather than aborting the whole scan.
 *
 * By default `analyze()` returns every rule's outcome, including
 * `pass`/`notApplicable` -- a11y-core's own deliberate "not a
 * violations-only list" design (see a11y-core's docs/OUTPUT_SCHEMA.md).
 * Opt in to a lighter payload with `.reportOnly(['fail', 'cantTell'])`.
 *
 * Opt in to a live DOM `Element` per occurrence (instead of just a CSS
 * selector string) with `.elementRef(true)`, so you can act on the flagged
 * element directly -- e.g. `cy.wrap(occurrence.element).click()` -- rather
 * than re-resolving its selector yourself. Unlike the sibling bindings
 * (which hand back a driver-native `ElementHandle`/`WebElement`), Cypress
 * has no such object of its own; this attaches the raw `Element`
 * (`occurrence.element`), and you wrap it in a Cypress chainable yourself
 * with `cy.wrap(...)` when you need one (see ../ROADMAP.md §2e).
 *
 * Register your own rule(s) for just this scan with `.withCustomRules()`
 * (a11y-core's `engineOptions.customRules` escape hatch, axe's
 * `configure({ rules })` equivalent -- see a11y-core's docs/ENGINE_OPTIONS.md).
 *
 * Create one builder per scan. This is a mutable object with no reset
 * between analyze() calls: include()/exclude()/withRules()/disableRules()/
 * withTags()/disableTags()/options()/withCustomRules() all push onto or
 * merge into internal state that persists for the instance's lifetime, so
 * calling one of them again before a second analyze() call accumulates on
 * top of the first scan's scope rather than replacing it (intentional for
 * "call include() several times for one scan" -- but a footgun if you hold
 * one instance across multiple assertions). reportOnly()/frames()/
 * elementRef() are the exception: each call replaces the previous value.
 */
class A11yCoreBuilder {
  /**
   * @param {{ url?: string }} [opts] `url` overrides the URL a11y-core
   *   reports for the *top* frame's result (`result.url`) -- rarely needed;
   *   when omitted, a11y-core falls back to the top window's own
   *   `document.location.href` itself (see a11y-core's src/core.js). Each
   *   sub-frame (with `.frames(true)`) always reports its own URL this same
   *   way, regardless of this option.
   */
  constructor({ url } = {}) {
    this._url = url || null;
    this._scanFrames = false;
    this._includeSelectors = [];
    this._excludeSelectors = [];
    this._includeRuleIds = [];
    this._excludeRuleIds = [];
    this._tags = [];
    this._excludeTags = [];
    this._engineOptions = {};
    this._reportOutcomes = null;
    this._elementRef = false;
    this._customRules = [];
  }

  /**
   * Scope the scan to one region. Call multiple times to scan several,
   * possibly disjoint regions in one run (a11y-core's contextSelector
   * accepts an array of selectors for exactly this -- see a11y-core's
   * docs/ENGINE_OPTIONS.md).
   */
  include(selector) {
    if (selector) this._includeSelectors.push(selector);
    return this;
  }

  /** Skip elements matching this selector anywhere in the scanned scope. */
  exclude(selector) {
    if (selector) this._excludeSelectors.push(selector);
    return this;
  }

  /** Only run rules carrying at least one of these tags. */
  withTags(tags) {
    this._tags = this._tags.concat(Array.isArray(tags) ? tags : [tags]);
    return this;
  }

  /** Never run rules carrying any of these tags (applied after withTags). */
  disableTags(tags) {
    this._excludeTags = this._excludeTags.concat(Array.isArray(tags) ? tags : [tags]);
    return this;
  }

  /** Only run these specific rule IDs (accepts with or without the a11ycore- prefix). */
  withRules(ruleIds) {
    this._includeRuleIds = this._includeRuleIds.concat(Array.isArray(ruleIds) ? ruleIds : [ruleIds]);
    return this;
  }

  /** Never run these specific rule IDs (applied after withRules). */
  disableRules(ruleIds) {
    this._excludeRuleIds = this._excludeRuleIds.concat(Array.isArray(ruleIds) ? ruleIds : [ruleIds]);
    return this;
  }

  /** Merge arbitrary engineOptions (locale, contrast.mode, policyContract, ...) -- see a11y-core's docs/ENGINE_OPTIONS.md. */
  options(partialEngineOptions) {
    this._engineOptions = { ...this._engineOptions, ...(partialEngineOptions || {}) };
    return this;
  }

  /**
   * Register one or more custom rules for just this scan (a11y-core's
   * engineOptions.customRules escape hatch -- see a11y-core's
   * docs/ENGINE_OPTIONS.md -- axe's configure({ rules }) equivalent). A
   * descriptor is { id, meta?, runInPage, applicability?, data? }, the same
   * shape as an internal a11y-core rule module's own export. Call multiple
   * times to register several rules across one scan (accumulates, same as
   * withRules()/withTags(), rather than replacing).
   *
   * Unlike every sibling binding's withCustomRules(), `runInPage`/
   * `applicability` need **no** `.toString()` conversion here, live or not:
   * there is no page.evaluate()-style JSON boundary to cross in Cypress --
   * spec code and the reconstructed in-page function share real object/
   * function references once the realm-boundary trick (see this class's own
   * header comment, and ../ROADMAP.md §2b) has been applied. A live function
   * defined in the spec file is invoked directly, cross-realm, exactly like
   * a11y-core's own built-in rules are. A function-source string is still
   * accepted too (a11y-core reconstructs it the same way its built-ins are
   * reconstructed), for parity with the sibling bindings' accepted input.
   *
   * A descriptor whose `id` collides with a built-in rule overrides it for
   * that scan only (a11y-core's own semantics, matching axe's configure()
   * override behavior) -- nothing here persists past this one analyze() call
   * or mutates a11y-core's static rule catalog.
   */
  withCustomRules(rules) {
    const list = Array.isArray(rules) ? rules : [rules];

    // Validate the whole batch before pushing any of it, so one invalid
    // descriptor later in the array can't leave an earlier valid one
    // partially registered.
    for (const rule of list) {
      if (!rule || typeof rule.id !== 'string' || !rule.id) {
        throw new Error('A11yCoreBuilder.withCustomRules(): each custom rule descriptor requires a non-empty string `id`.');
      }
      if (typeof rule.runInPage !== 'function' && (typeof rule.runInPage !== 'string' || !rule.runInPage)) {
        throw new Error(`A11yCoreBuilder.withCustomRules(): custom rule "${rule.id}" requires a \`runInPage\` function or function-source string.`);
      }
      if (rule.applicability !== undefined && typeof rule.applicability !== 'function' && (typeof rule.applicability !== 'string' || !rule.applicability)) {
        throw new Error(`A11yCoreBuilder.withCustomRules(): custom rule "${rule.id}"'s \`applicability\` must be a function or function-source string when provided.`);
      }
    }

    this._customRules.push(...list);
    return this;
  }

  /**
   * Post-filter `checksResults` down to only the given outcomes (e.g.
   * .reportOnly(['fail', 'cantTell']) to drop pass/notApplicable noise).
   * Binding-layer only -- a11y-core itself always computes every rule; this
   * just trims what analyze() hands back. Applied per-frame when combined
   * with .frames(true).
   */
  reportOnly(outcomes) {
    const list = Array.isArray(outcomes) ? outcomes : [outcomes];
    for (const outcome of list) {
      if (!VALID_OUTCOMES.includes(outcome)) {
        throw new Error(`A11yCoreBuilder.reportOnly(): invalid outcome "${outcome}" -- must be one of ${VALID_OUTCOMES.join(', ')}.`);
      }
    }
    this._reportOutcomes = list;
    return this;
  }

  /**
   * Opt in to attaching each fail/cantTell occurrence's resolved DOM
   * `Element` (as `occurrence.element`), so you can act on the flagged
   * element directly -- e.g. `cy.wrap(occurrence.element).should(...)` --
   * instead of re-resolving `occurrence.selector` yourself. Default off.
   * Combines with `.frames(true)`: each frame's occurrences are resolved
   * against that frame's own document, not the top page's. Not every
   * occurrence resolves to one element -- a page-wide finding (e.g. some
   * manual/cantTell rules) can carry `selector: ""`, in which case
   * `occurrence.element` is `null` rather than an Element.
   */
  elementRef(enabled = true) {
    this._elementRef = !!enabled;
    return this;
  }

  /**
   * Opt in to also scanning every same-origin sub-frame reachable from the
   * top window (recursively -- a nested iframe's own iframes are included
   * too), flattened into one `frames` array alongside `topFrame`. Default
   * off; when off, analyze() returns the same single native result object
   * it always has. Genuinely cross-origin iframes cannot be reached this
   * way -- see this class's own header comment and ../ROADMAP.md §2d; each
   * shows up in `frames` as `{ url, error }` instead of aborting the scan.
   */
  frames(enabled = true) {
    this._scanFrames = !!enabled;
    return this;
  }

  /**
   * Runs the scan and returns a Cypress chainable resolving to a11y-core's
   * native result object (or `{ topFrame, frames }` when `.frames(true)`
   * was used). Do not `await` this -- use `.then()`, same as any other
   * `cy.*` command (see this class's own header comment).
   * @returns {Cypress.Chainable<object>} see a11y-core's docs/OUTPUT_SCHEMA.md
   */
  analyze() {
    const contextSelector = this._includeSelectors.length
      ? (this._includeSelectors.length === 1 ? this._includeSelectors[0] : this._includeSelectors)
      : null;

    const engineOptions = { ...this._engineOptions };
    if (this._customRules.length) {
      // Concatenated with, not replaced by, any customRules already present
      // via a raw .options({ customRules }) call, so the two ways of
      // registering a custom rule compose rather than one silently
      // clobbering the other.
      const existing = Array.isArray(this._engineOptions.customRules) ? this._engineOptions.customRules : [];
      engineOptions.customRules = existing.concat(this._customRules);
    }
    if (this._excludeSelectors.length) {
      engineOptions.excludeSelectors = this._excludeSelectors;
    }

    const hasRunOnly = this._includeRuleIds.length || this._excludeRuleIds.length || this._tags.length || this._excludeTags.length;
    const runOnly = hasRunOnly
      ? {
        includeRuleIds: this._includeRuleIds.length ? this._includeRuleIds : undefined,
        excludeRuleIds: this._excludeRuleIds.length ? this._excludeRuleIds : undefined,
        tags: this._tags.length ? this._tags : undefined,
        excludeTags: this._excludeTags.length ? this._excludeTags : undefined
      }
      : null;

    // cy.window() gives a live reference to the AUT's real `window` -- see
    // this class's own header comment for why that alone isn't enough to
    // scan it correctly, and what _runInWindow() does about it. Everything
    // below is synchronous DOM work, so a plain .then() (no nested
    // cy-command chaining) is all that's needed.
    return cy.window().then((win) => {
      const topFrame = this._applyReportOnly(this._runInWindow(win, this._url, contextSelector, engineOptions, runOnly));

      if (!this._scanFrames) return topFrame;

      const frames = [];
      this._collectFrames(win, contextSelector, engineOptions, runOnly, frames);
      return { topFrame, frames };
    });
  }

  /**
   * Reconstructs runa11yCoreInPage's source inside `win`'s own realm (via
   * `win.eval`) and runs it there -- see this class's own header comment and
   * ../ROADMAP.md §2b for why `.call(win, ...)` alone would silently scan
   * the wrong document.
   */
  _runInWindow(win, url, contextSelector, engineOptions, runOnly) {
    const reconstructed = win.eval('(' + runa11yCoreInPage.toString() + ')');
    const result = reconstructed(url, contextSelector, engineOptions, runOnly);
    return this._elementRef ? this._attachElementRefs(win, result) : result;
  }

  /**
   * Depth-first walk of every `<iframe>` reachable from `win`, pushing one
   * entry per frame onto the flat `out` array (topFrame is not included --
   * that's returned separately by analyze()). A cross-origin frame's
   * `contentWindow.document` throws a real SecurityError (verified against a
   * real cross-origin page -- see ../ROADMAP.md §2d); caught here and
   * reported as `{ url, error }` using the iframe's own `src` attribute
   * (always readable, it's just a DOM attribute on the accessible parent
   * document) rather than the frame's own location, which is exactly what's
   * blocked.
   */
  _collectFrames(win, contextSelector, engineOptions, runOnly, out) {
    const iframeEls = win.document.querySelectorAll('iframe');
    for (const el of iframeEls) {
      let childWin = null;
      let accessError = null;
      try {
        childWin = el.contentWindow;
        void childWin.document; // force the SecurityError here, not deeper inside _runInWindow
      } catch (e) {
        accessError = e;
      }

      if (accessError) {
        out.push({
          url: el.getAttribute('src') || null,
          error: 'Cross-origin iframe: contentDocument is not accessible from Cypress spec code ' +
            '(browser same-origin policy -- see ../ROADMAP.md §2d). ' + (accessError.message || String(accessError))
        });
        continue;
      }

      try {
        // pageUrl: null -- let a11y-core self-detect each frame's own URL
        // via its own document.location.href fallback (see src/core.js),
        // rather than this binding re-deriving it itself.
        out.push(this._applyReportOnly(this._runInWindow(childWin, null, contextSelector, engineOptions, runOnly)));
      } catch (e) {
        out.push({
          url: (childWin.location && childWin.location.href) || null,
          error: (e && e.message) || String(e)
        });
        continue;
      }

      this._collectFrames(childWin, contextSelector, engineOptions, runOnly, out);
    }
  }

  /** Filters a single native result object's checksResults per .reportOnly(), if set. */
  _applyReportOnly(result) {
    if (!this._reportOutcomes || !Array.isArray(result.checksResults)) return result;
    return {
      ...result,
      checksResults: result.checksResults.filter((r) => this._reportOutcomes.includes(r.outcome))
    };
  }

  /**
   * Resolves occurrence.selector to a live DOM Element for every
   * fail/cantTell occurrence, scoped to win's own document. Mutates and
   * returns the same result object -- it's a fresh object from this scan,
   * not shared external state.
   */
  _attachElementRefs(win, result) {
    if (!Array.isArray(result.checksResults)) return result;
    for (const check of result.checksResults) {
      if (!Array.isArray(check.occurrences) || !check.occurrences.length) continue;
      for (const occurrence of check.occurrences) {
        // Most occurrences carry a concrete element selector, but a
        // page-wide finding with no single target element (e.g. some
        // manual/cantTell rules) can carry "" -- not every occurrence
        // resolves to one element, so leave element null rather than
        // passing "" to querySelector() (which throws on empty string).
        occurrence.element = occurrence.selector ? win.document.querySelector(occurrence.selector) : null;
      }
    }
    return result;
  }
}

module.exports = { A11yCoreBuilder };
