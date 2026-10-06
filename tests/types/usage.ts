// Compiled, not run, by tests/types.test.js: this package's hand-written
// types as a spec file uses them, beside @surea11y/core's own.
/// <reference types="cypress" />
import type { ScanResult } from '@surea11y/core';
import {
  A11yCoreBuilder,
  formatFailures,
  type A11yCoreResult,
  type A11yCoreMultiFrameResult,
  type CheckResult,
  type EngineErrorCode
} from '../../src/index';

declare const result: A11yCoreResult;

// The binding's result is core's own, plus `element` on each occurrence.
const asCore: ScanResult = result;
const version: string = result.engine.version;
const scanned: number | undefined = result.contextMatch?.elementCount;
const skipped: Array<string | null> = result.skippedCustomRules.map((r) => r.id);
const check: CheckResult = result.checksResults[0];
const occurrence = check.occurrences[0];
const hosts: string[] | undefined = occurrence.shadowHostSelectors;
const path: number[] | null = occurrence.structuralPath;
const element: Element | null | undefined = occurrence.element;
const headroom: number | undefined = check.margin?.headroom;

const message: string =
  formatFailures(result) +
  formatFailures(result.checksResults) +
  formatFailures(result.checksResults.filter((r) => r.outcome === 'fail'), { outcomes: ['fail'] });


const code: EngineErrorCode = 'INVALID_RUN_ONLY';

new A11yCoreBuilder()
  .include('main')
  .withTags(['wcag2a', 'wcag2aa'])
  .elementRef(true)
  .analyze()
  .then((r: A11yCoreResult | A11yCoreMultiFrameResult) => {
    if ('topFrame' in r) {
      formatFailures(r.topFrame);
      for (const frame of r.frames) if ('checksResults' in frame) formatFailures(frame);
    } else {
      formatFailures(r);
    }
  });

export { asCore, version, scanned, skipped, hosts, path, element, headroom, message, code };
