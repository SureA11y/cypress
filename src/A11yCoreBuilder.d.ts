/// <reference types="cypress" />

import type * as Core from '@surea11y/core';
import type { Outcome, Severity, Confidence } from '@surea11y/core';
import type { ScanResultLike } from '@surea11y/binding-base';

// The result shapes are @surea11y/core's own types (shipped with core since
// 1.9.0, and checked by core's tests against real scan results), so they
// can't fall behind the engine the way a hand-written copy did. This file
// only adds what this binding puts on top: the `element` on each
// occurrence with .elementRef(true), and the `{ topFrame, frames }` shape
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
}

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
  /** Merge arbitrary engineOptions (locale, contrast.mode, policyContract, ...). */
  options(partialEngineOptions: Record<string, unknown>): this;
  /** Register one or more custom rules for just this scan. Call multiple times to accumulate. */
  withCustomRules(rules: CustomRuleDescriptor | CustomRuleDescriptor[]): this;
  /** Post-filter checksResults down to only the given outcomes. */
  reportOnly(outcomes: Outcome | Outcome[]): this;
  /** Opt in to also scanning every same-origin sub-frame reachable from the top window. */
  frames(enabled?: boolean): this;
  /** Opt in to resolving each fail/cantTell occurrence's selector to a live DOM Element. */
  elementRef(enabled?: boolean): this;

  /**
   * Runs the scan. Returns a Cypress chainable -- use `.then()`, never
   * `await` (see this class's own header comment in A11yCoreBuilder.js).
   * Resolves to `{ topFrame, frames }` instead of a single result when
   * `.frames(true)` was used.
   */
  analyze(): Cypress.Chainable<A11yCoreResult | A11yCoreMultiFrameResult>;
}

/**
 * Formats a result's findings into a short, human-readable block -- one
 * entry per occurrence, not per rule. Meant for an assertion library's
 * failure-message parameter, e.g.
 * `expect(results.checksResults.length, formatFailures(results)).to.equal(0)`.
 * Given the whole result, it also lists what the scan left out (a scope
 * that matched nothing, custom rules that did not run) and ends with the
 * @surea11y/core release that produced it. Given a checksResults array, only the findings. Throws a TypeError
 * for anything else, such as the `{ topFrame, frames }` of a
 * `.frames(true)` scan: format `topFrame` and each frame on its own.
 */
export function formatFailures(
  input: A11yCoreResult | ScanResultLike | ReadonlyArray<CheckResult>,
  opts?: { outcomes?: Outcome[] }
): string;

