'use strict';

const { runa11yCoreInPage } = require('a11y-core');
const { A11yCoreBuilderBase } = require('a11y-core-binding-base');

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
 * Extends `A11yCoreBuilderBase` (from `a11y-core-binding-base`), which owns
 * every method with no driver-specific work at all -- `include()`/
 * `exclude()`/`withTags()`/`disableTags()`/`withRules()`/`disableRules()`/
 * `options()`/`reportOnly()`/`elementRef()`/`frames()`/`withCustomRules()`'s
 * validation, and `_buildEngineArgs()`. This class adds exactly the parts
 * that are genuinely Cypress-specific: `analyze()`'s injection mechanics,
 * frame traversal, `_attachElementRefs()`, and (see below) opting out of the
 * base's default customRules stringification. See
 * `../a11y-core-binding-base/README.md` for what's shared and why.
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
 * `withCustomRules()`. See `_normalizeCustomRule()` below.
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
 * `analyze()` also writes one `Cypress.log()` entry per fail/cantTell rule
 * plus a trailing summary entry to the Command Log -- parity with
 * `cypress-axe`'s `checkA11y()`, which does the same for axe's violations.
 * See `_logFindings()` below for the full rationale (including why this
 * binding needed it added explicitly, unlike axe where it ships built in).
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
class A11yCoreBuilder extends A11yCoreBuilderBase {
  /**
   * @param {{ url?: string }} [opts] `url` overrides the URL a11y-core
   *   reports for the *top* frame's result (`result.url`) -- rarely needed;
   *   when omitted, a11y-core falls back to the top window's own
   *   `document.location.href` itself (see a11y-core's src/core.js). Each
   *   sub-frame (with `.frames(true)`) always reports its own URL this same
   *   way, regardless of this option.
   */
  constructor({ url } = {}) {
    super({ url });
  }

  /**
   * Overrides A11yCoreBuilderBase's default (which stringifies a live
   * runInPage/applicability function via toReconstructableSource() -- correct
   * for every sibling binding, since their drivers cross a real serialization
   * boundary). Cypress needs no such conversion: a live function defined in
   * the spec file is invoked directly, cross-realm, exactly like a11y-core's
   * own built-in rules are -- see this class's own header comment and
   * ../ROADMAP.md §2b/§2f. A function-source string is still accepted too
   * (a11y-core reconstructs it the same way its built-ins are
   * reconstructed), for parity with the sibling bindings' accepted input.
   */
  _normalizeCustomRule(rule) {
    return { ...rule };
  }

  /**
   * Runs the scan and returns a Cypress chainable resolving to a11y-core's
   * native result object (or `{ topFrame, frames }` when `.frames(true)`
   * was used). Do not `await` this -- use `.then()`, same as any other
   * `cy.*` command (see this class's own header comment).
   * @returns {Cypress.Chainable<object>} see a11y-core's docs/OUTPUT_SCHEMA.md
   */
  analyze() {
    const { contextSelector, engineOptions, runOnly } = this._buildEngineArgs();

    // cy.window() gives a live reference to the AUT's real `window` -- see
    // this class's own header comment for why that alone isn't enough to
    // scan it correctly, and what _runInWindow() does about it. Everything
    // below is synchronous DOM work, so a plain .then() (no nested
    // cy-command chaining) is all that's needed.
    return cy.window().then((win) => {
      const topFrame = this._applyReportOnly(this._runInWindow(win, this._url, contextSelector, engineOptions, runOnly));
      this._logFindings(topFrame, win);

      if (!this._scanFrames) return topFrame;

      const frames = [];
      this._collectFrames(win, contextSelector, engineOptions, runOnly, frames);
      return { topFrame, frames };
    });
  }

  /**
   * Emits Cypress Command Log entries for this result's fail/cantTell
   * findings -- parity with `cypress-axe`'s `checkA11y()`, which does the
   * same via its own internal `Cypress.log()` calls (see
   * `node_modules/cypress-axe/dist/index.js`: a `violations.forEach(...)`
   * loop logging one `'a11y error!'` entry per rule, `message: '<id> on N
   * Node(s)'`, followed by an `'a11y violation summary'` entry). Before this
   * method existed, `analyze()`'s only command-log trace was a bare
   * `window`/`then` step -- a real, user-noticed gap found by comparing this
   * project's own `a11y-core.cy.ts` spec side-by-side with `axe.cy.ts` in a
   * consuming project: axe's Command Log named every violated rule and node
   * count inline; a11y-core's showed nothing beyond whatever `cy.task(...)`
   * the test itself happened to add, plus Chai's own truncated `Array(12)`
   * failure message on assertion failure.
   *
   * Named `'a11y-core error!'` / `'a11y-core violation summary'` -- distinct
   * from axe's exact `'a11y error!'` / `'a11y violation summary'` so the two
   * are tell-apart-able at a glance in a Command Log where both bindings'
   * specs run side by side (as they do in at least one consuming project),
   * while staying visually parallel enough to read as "the same kind of
   * thing".
   *
   * One log entry per RULE, not per occurrence -- like axe's, since a single
   * rule can flag several elements at once (hence "on N Nodes"). Unlike axe,
   * a rule can also report zero occurrences: a thrown rule surfaces as
   * `outcome: 'cantTell'` with `occurrences: []` and `error` set (see
   * `../a11y-core/docs/OUTPUT_SCHEMA.md`) -- `formatFailures()` already
   * special-cases this (falls back to `error`/`title` instead of an
   * occurrence-derived message), and this method mirrors that same fallback
   * so the two stay consistent with each other.
   *
   * `$el` is resolved with `win.document` as jQuery's context argument
   * (`Cypress.$(selectors, win.document)`), not left to jQuery's default --
   * axe's own equivalent (`Cypress.$(selectors)`, no context arg) always
   * resolves against the top AUT document, which would silently
   * mis-highlight or fail to highlight a sub-frame's own occurrences when
   * called from `_collectFrames()` below for a `.frames(true)` scan.
   *
   * Runs unconditionally inside `analyze()` (not opt-in) -- same as
   * `cypress-axe`, which logs regardless of `skipFailures`. Purely additive
   * to the Command Log; never touches the returned result object or throws,
   * so it can't change any existing assertion's pass/fail outcome.
   *
   * @param {object} result one result object (`{ checksResults, ... }`) --
   *   either `topFrame` or one entry of `frames`, never the outer
   *   `{ topFrame, frames }` wrapper.
   * @param {Window} win the window that result was scanned from, used only
   *   to scope `$el` resolution to the right document.
   */
  _logFindings(result, win) {
    const relevant = result.checksResults.filter((r) => r.outcome === 'fail' || r.outcome === 'cantTell');
    if (!relevant.length) return;

    for (const check of relevant) {
      const n = check.occurrences.length;
      const selectors = check.occurrences.map((o) => o.selector).filter(Boolean).join(', ');
      // Same "no occurrences -- fall back to error/title" case formatFailures()
      // handles (see its own comment) -- a thrown rule has nothing else to
      // point at.
      const detail = n ? `on ${n} Node${n === 1 ? '' : 's'}` : (check.error || check.title);

      Cypress.log({
        $el: selectors ? Cypress.$(selectors, win.document) : undefined,
        name: 'a11y-core error!',
        consoleProps: () => check,
        message: `${check.ruleId} (${check.severity}): ${detail}`,
      });
    }

    Cypress.log({
      name: 'a11y-core violation summary',
      message: `${relevant.length} accessibility issue${relevant.length === 1 ? '' : 's'} ${relevant.length === 1 ? 'was' : 'were'} detected`,
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
        const frameResult = this._applyReportOnly(this._runInWindow(childWin, null, contextSelector, engineOptions, runOnly));
        // childWin, not win/the top window -- see _logFindings()'s own
        // comment on why $el must be scoped to the frame that was actually
        // scanned.
        this._logFindings(frameResult, childWin);
        out.push(frameResult);
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
