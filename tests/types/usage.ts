// Compiled, not run, by tests/types.test.js: this package's hand-written
// types as a spec file uses them, beside @surea11y/core's own.
/// <reference types="cypress" />
import type { ScanResult } from '@surea11y/core';
import { defineConfig } from 'cypress';
import surea11yPlugin = require('../../plugin');
import {
  A11yCoreBuilder,
  formatFailures,
  getScanGaps,
  formatOccurrenceLocation,
  type A11yCoreResult,
  type A11yCoreMultiFrameResult,
  type CheckResult,
  type EngineErrorCode,
  type ScanGap,
  type WcagVersion
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

const gaps: ScanGap[] = getScanGaps(result);
for (const gap of gaps) {
  if (gap.kind === 'custom-rule-skipped') gap.rule.reason.toUpperCase();
  else if (gap.kind === 'pack-skipped') gap.pack.reason.toUpperCase();
  else gap.selectors.join(', ');
}
const where: string = formatOccurrenceLocation(occurrence);

const code: EngineErrorCode = 'INVALID_ENGINE_OPTIONS';
const wcag: WcagVersion = '2.2';

const config = defineConfig({
  e2e: {
    setupNodeEvents(on, cfg) {
      surea11yPlugin(on, cfg);
    }
  }
});
const task: 'surea11y:packScript' = surea11yPlugin.TASK;

new A11yCoreBuilder()
  .include('main')
  .withWcag(wcag, 'AA')
  .withBestPractices()
  .withTags(['wcag2a', 'wcag2aa'])
  .withPacks(['@acme/a11y-policy', './packs/house-rules.js'])
  .elementRef(true)
  .analyze()
  .then((r: A11yCoreResult | A11yCoreMultiFrameResult) => {
    if ('topFrame' in r) {
      formatFailures(r.topFrame);
      for (const frame of r.frames) if ('checksResults' in frame) getScanGaps(frame);
    } else {
      formatFailures(r);
    }
  });

export { asCore, version, scanned, skipped, hosts, path, element, headroom, message, where, code, config, task };
