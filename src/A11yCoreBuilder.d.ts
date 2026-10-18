/// <reference types="cypress" />

import type * as Core from '@surea11y/core';
import type { Outcome, Severity, Confidence } from '@surea11y/core';
import type { ScanGap, ScanNote, OccurrenceLocation, ScanResultLike, WcagVersion, WcagLevel, WcagLevelInput, PlannedCheck, PlannedCriterion, ScreenshotBox, ScreenshotSkip } from '@surea11y/binding-base';

// The result shapes are @surea11y/core's own types (shipped with core since
// 1.9.0, and checked by core's tests against real scan results), so they
// can't fall behind the engine the way a hand-written copy did. This file
// only adds what this binding puts on top: the `element` on each
// occurrence with .elementRef(true), its `screenshot` with .screenshots(),
// and the `{ topFrame, frames }` shape
// of a .frames(true) scan. The names exported here are kept from earlier
// releases of this package; see surea11y's docs/OUTPUT_SCHEMA.md for what
// each field means.

export type {
  Outcome,
  OutcomeNormalized,
  Severity,
  Confidence,
  RuleType,
  LocaleResolution,
  EngineInfo,
  RenderingEnvironment,
  NormativeMapping,
  VisibilityFilter,
  Uncertainty,
  Margin,
  ContextMatch,
  CompositeResult,
  EngineErrorCode
} from '@surea11y/core';

export type { ScanGap, ScanNote, OccurrenceLocation, WcagVersion, WcagLevel, WcagLevelInput, PlannedCheck, PlannedCriterion };

export type Category = Core.RuleMeta['category'];
/** An open set: core can add a value in a minor release. */
export type LocaleResolutionReason = Core.LocaleResolution['reason'];
export type CheckResultMeta = Core.RuleMeta;
export type CompositeResultDetails = Core.CompositeResult['data']['details'];

export interface Occurrence extends Core.Occurrence {
  /**
   * Only present when `.elementRef(true)` was used. `null` when this
   * occurrence has no single resolvable target element (e.g. `selector` was
   * `""`) -- see A11yCoreBuilder#elementRef. Found through
   * `shadowHostSelectors` for an element in a shadow tree. A plain DOM
   * `Element`, not a Cypress chainable -- wrap it yourself with
   * `cy.wrap(occurrence.element)` when you need one.
   */
  element?: Element | null;
  /**
   * Only present when `.screenshots()` was used and this occurrence's own
   * outcome is one it pictures: the PNG Cypress saved, or why there is none.
   * The occurrences about the same element share one object.
   */
  screenshot?: CypressScreenshot;
}

/** What `.screenshots()` asks for in Cypress: no buffer form, since a spec runs in the browser. */
export interface CypressScreenshotOptions {
  /** The folder under Cypress's screenshots folder; `surea11y` by default. */
  dir?: string;
  /** Which occurrences to picture, by their own outcome. Default `['fail']`. */
  outcomes?: Outcome[];
  /** CSS pixels of context around the element. Default 0. */
  padding?: number;
  /** Draw a box around the element, over the page. Default true. */
  highlight?: boolean;
  /** At most this many pictures per scan, frames included. Default 50. */
  max?: number;
}

/**
 * An occurrence's picture in Cypress: the file Cypress wrote (`path`, as
 * cy.screenshot() reports it) and where the element shows in it (`box`, CSS
 * pixels; the PNG has the device pixel ratio's more), or why there is none.
 */
export type CypressScreenshot =
  | { path: string; box: ScreenshotBox; cropped?: true }
  | { skipped: ScreenshotSkip; error?: string };

export interface CheckResult extends Omit<Core.CheckResult, 'occurrences'> {
  occurrences: Occurrence[];
}

/** surea11y's native top-level result shape -- see docs/OUTPUT_SCHEMA.md. */
export interface A11yCoreResult extends Omit<Core.ScanResult, 'checksResults'> {
  checksResults: CheckResult[];
}

/** A sub-frame that couldn't be scanned (cross-origin, detached, or sandboxed). */
export interface A11yCoreFrameError {
  url: string | null;
  error: string;
}

/** Returned by analyze() when .frames(true) is enabled, instead of a single A11yCoreResult. */
export interface A11yCoreMultiFrameResult {
  topFrame: A11yCoreResult;
  frames: Array<A11yCoreResult | A11yCoreFrameError>;
}

/**
 * A runtime-registered rule descriptor for `.withCustomRules()` -- the same
 * shape as an internal surea11y rule module's own export (see surea11y's
 * docs/ENGINE_OPTIONS.md). Unlike the sibling bindings, `runInPage`/
 * `applicability` may be a real, live function with no `.toString()`
 * conversion needed -- there's no page.evaluate()-style boundary to cross in
 * Cypress. A function-source string is still
 * accepted too.
 */
export interface CustomRuleDescriptor {
  id: string;
  meta?: {
    title?: string;
    description?: string;
    tags?: string[];
    defaultSeverity?: Severity;
    defaultConfidence?: Confidence;
    [key: string]: unknown;
  };
  runInPage: ((ctx: unknown) => unknown) | string;
  applicability?: ((ctx: unknown) => boolean) | string;
  data?: Record<string, unknown>;
}

export class A11yCoreBuilder {
  /**
   * @param opts.url Overrides the URL surea11y reports for the *top*
   *   frame's result. Rarely needed -- omitted, surea11y falls back to the
   *   top window's own `document.location.href` itself.
   */
  constructor(opts?: { url?: string });

  /** The same as the exported installInternalsHook(). */
  static installInternalsHook(win?: Window): void;

  /**
   * Scope the scan to one region. Call multiple times for a multi-region
   * union. A selector that matches no element scans nothing (the result's
   * `contextMatch` says so, and analyze() logs a scan gap); one the browser
   * can't parse fails the scan with `code: 'INVALID_CONTEXT_SELECTOR'`.
   * With `.frames(true)` it scopes the top frame only.
   */
  include(selector: string): this;
  /**
   * Skip elements matching this selector anywhere in the scanned scope.
   * With `opts.rules`, scopes the exclusion to just the named rule ID(s)
   * instead of globally -- on top of, not instead of, any global exclusions
   * from other `.exclude(selector)` calls.
   */
  exclude(selector: string, opts?: { rules?: string | string[] }): this;
  /**
   * Only run rules carrying at least one of these tags. When none of them is
   * a tag the engine knows, the scan fails with `code: 'INVALID_RUN_ONLY'`.
   * Throws a TypeError with that code at the call for anything but a
   * non-empty string or an array of them (as do the three methods below).
   */
  withTags(tags: string | string[]): this;
  /** Never run rules carrying any of these tags (applied after withTags). */
  disableTags(tags: string | string[]): this;
  /**
   * Only run these specific rule IDs (accepts with or without the
   * `a11ycore-` prefix). When none of them is a rule the engine knows, the
   * scan fails with `code: 'INVALID_RUN_ONLY'`.
   */
  withRules(ruleIds: string | string[]): this;
  /** Never run these specific rule IDs (applied after withRules). */
  disableRules(ruleIds: string | string[]): this;
  /**
   * Run the rules for a WCAG conformance target: `withWcag('2.2', 'AA')`
   * runs those of WCAG 2.2's A and AA criteria. withTags()/withRules() add
   * to them. A later call replaces the target.
   */
  withWcag(version: WcagVersion | 2.0 | 2.1 | 2.2, level?: WcagLevelInput): this;
  /** Also run the best-practice rules, those that name no WCAG criterion. */
  withBestPractices(enabled?: boolean): this;
  /**
   * Fetch, in the page, the style sheets it can't read (another origin's)
   * that their server shares (CORS), and give core their text, so checks
   * that read the CSS can check them. On by default; needs @surea11y/core
   * 1.14.0 or later.
   */
  fetchStyleSheets(enabled?: boolean): this;
  /**
   * How withRules() and withTags() combine when both are given: 'and' (the
   * default) runs the rules matching both, 'or' those matching either. A
   * later call replaces the mode.
   */
  includeMode(mode: 'and' | 'or'): this;
  /**
   * The WCAG level of the criteria the scan reports, without changing which
   * rules run: `.withRules('contrast-computable').wcagLevel('AA')` reports
   * 1.4.3 and not 1.4.6. Any case; null clears it. A later call replaces it.
   */
  wcagLevel(level: WcagLevelInput | null): this;
  /**
   * Where the driver-based bindings send their scan-gap warnings. This
   * binding prints none (the Command Log shows each gap), so it changes
   * nothing here; it is typed so shared code that calls it compiles.
   */
  logger(fn: ((entry: ScanGap | ScanNote, result: A11yCoreResult) => void) | null): this;
  /** Merge arbitrary engineOptions (locale, contrast.mode, policyContract, ...). */
  options(partialEngineOptions: Record<string, unknown>): this;
  /** Register one or more custom rules for just this scan. Call multiple times to accumulate. */
  withCustomRules(rules: CustomRuleDescriptor | CustomRuleDescriptor[]): this;
  /**
   * Packs from `@surea11y/core/pack` (core 1.11 or later), named by module: a
   * package name, or a path from the project root. `@surea11y/cypress/plugin`,
   * registered in setupNodeEvents, prepares them in Node.
   */
  withPacks(packs: string | string[]): this;
  /** Post-filter checksResults down to only the given outcomes. */
  reportOnly(outcomes: Outcome | Outcome[]): this;
  /** Opt in to also scanning every same-origin sub-frame reachable from the top window. */
  frames(enabled?: boolean): this;
  /** Opt in to resolving each fail/cantTell occurrence's selector to a live DOM Element. */
  elementRef(enabled?: boolean): this;
  /**
   * Opt in to a picture of each element the scan flags, on its occurrences'
   * `screenshot` field: a PNG cy.screenshot() saves under Cypress's
   * screenshots folder, in `dir` or `surea11y/`. `false` turns them off.
   * Throws a TypeError with code 'INVALID_ENGINE_OPTIONS' for an option it
   * can't use.
   */
  screenshots(options?: CypressScreenshotOptions | boolean): this;

  /**
   * The rules this scan will run, worked out in Node by
   * @surea11y/cypress/plugin (core's getChecksForRunOnly()). A chainable,
   * as analyze() is.
   */
  plannedChecks(): Cypress.Chainable<PlannedCheck[]>;
  /** The criteria this scan will report in rulesResults (core's getRulesForRunOnly()), through the plugin. A chainable. */
  plannedCriteria(): Cypress.Chainable<PlannedCriterion[]>;

  /**
   * Runs the scan. Returns a Cypress chainable -- use `.then()`, never
   * `await` (see this class's own header comment in A11yCoreBuilder.js).
   * Resolves to `{ topFrame, frames }` instead of a single result when
   * `.frames(true)` was used. Fails the test with the engine's error when
   * it refuses its input, its `code` one of: `INVALID_RUN_ONLY`,
   * `INVALID_CONTEXT_SELECTOR`, `INVALID_ENGINE_OPTIONS` (an option
   * `strictOptions: true` rejects) or `PAGE_BUILTINS_BROKEN` (the page's
   * scripts broke a JavaScript built-in the engine relies on).
   */
  analyze(): Cypress.Chainable<A11yCoreResult | A11yCoreMultiFrameResult>;
}

/**
 * Formats a result's findings into a short, human-readable block -- one
 * entry per occurrence, not per rule. Meant for an assertion library's
 * failure-message parameter, e.g.
 * `expect(results.checksResults.length, formatFailures(results)).to.equal(0)`.
 * Given the whole result, it also lists what the scan left out (a scope
 * that matched nothing, custom rules or packs that did not run) and ends with the
 * @surea11y/core release that produced it. Given a checksResults array, only the findings. Throws a TypeError
 * for anything else, such as the `{ topFrame, frames }` of a
 * `.frames(true)` scan: format `topFrame` and each frame on its own.
 */
export function formatFailures(
  input: A11yCoreResult | ScanResultLike | ReadonlyArray<CheckResult>,
  opts?: { outcomes?: Outcome[] }
): string;

/**
 * What one scan result says it left out, which its checksResults alone
 * would pass over as clean: an include() scope that matched no element
 * (`context-not-found`, nothing was scanned), part of one that matched
 * nothing (`context-partly-not-found`), each custom rule that did not run
 * (`custom-rule-skipped`), and each pack that did not run
 * (`pack-skipped`). Empty when the scan left nothing out. For a
 * `.frames(true)` scan, call it on `topFrame` and on each scanned frame.
 */
export function getScanGaps(result: A11yCoreResult | ScanResultLike): ScanGap[];

/**
 * An occurrence's location for a person to read: its `selector`, after each
 * of its shadow hosts, as `host >>> selector`. Not a selector
 * `document.querySelector()` takes; use `.elementRef(true)` for the element.
 */
export function formatOccurrenceLocation(occurrence: OccurrenceLocation | null | undefined): string;

/**
 * How one scan result's page was scanned, which a gap doesn't cover:
 * `forced-colors` when it was shown in forced colors, and `internals-hook`
 * when the scan asked about web components it could have read with the
 * internals hook.
 */
export function getScanNotes(result: A11yCoreResult | ScanResultLike): ScanNote[];

/**
 * Installs @surea11y/core's opt-in internals hook, so a scan can read the
 * names, states and roles web components set through a private
 * ElementInternals. With no argument (in the support file), on every visit
 * from then on, before the app's scripts; with a window, in that window, for
 * `cy.visit(url, { onBeforeLoad: installInternalsHook })`.
 */
export function installInternalsHook(win?: Window): void;
