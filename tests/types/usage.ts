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
  getScanNotes,
  installInternalsHook,
  installListenerHook,
  installLiveRegionHook,
  formatOccurrenceLocation,
  type LocatedAnnouncement,
  type ReviewGroup,
  type A11yCoreResult,
  type A11yCoreMultiFrameResult,
  type CheckResult,
  type EngineErrorCode,
  type ScanGap,
  type WcagVersion,
  getGatingFailures,
  SEVERITIES
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
for (const note of getScanNotes(result)) {
  if (note.kind === 'internals-hook') note.elementCount.toFixed();
  else note.message.toUpperCase();
}

installInternalsHook();
A11yCoreBuilder.installInternalsHook();
cy.visit('/', { onBeforeLoad: installInternalsHook });
installListenerHook();
installLiveRegionHook();
A11yCoreBuilder.installListenerHook();
A11yCoreBuilder.installLiveRegionHook();
cy.visit('/', { onBeforeLoad: (win) => { installListenerHook(win); installLiveRegionHook(win); } });
A11yCoreBuilder.announcements({ includeBehindModal: true }).then((said: LocatedAnnouncement[] | null) => {
  const regions: Array<string | null> = (said ?? []).map((a) => a.selector);
  void regions;
});
const group: ReviewGroup = 'leanFail';
const review: string = formatFailures(result, { outcomes: ['fail', group, 'open'], howToCheck: true, hookReasonCodes: null });
for (const note of getScanNotes(result, { hookReasonCodes: null })) {
  if (note.kind === 'listener-hook' || note.kind === 'live-region-hook') note.rules.join(', ');
}
const steps: string[] | undefined = occurrence.howToCheck?.steps;
const leans: 'fail' | 'pass' | undefined = occurrence.lean?.toward;

const code: EngineErrorCode = 'INVALID_ENGINE_OPTIONS';
const wcag: WcagVersion = '2.2';

const config = defineConfig({
  e2e: {
    setupNodeEvents(on, cfg) {
      return surea11yPlugin(on, cfg);
    }
  }
});
const task: 'surea11y:packScript' = surea11yPlugin.TASK;
const plannedTask: 'surea11y:planned' = surea11yPlugin.PLANNED_TASK;
const stepsTask: 'surea11y:howToCheck' = surea11yPlugin.HOW_TO_CHECK_TASK;
const pluginKey: 'surea11yPlugin' = surea11yPlugin.PLUGIN_KEY;

new A11yCoreBuilder()
  .include('main')
  .withWcag(wcag, 'AA')
  .withBestPractices()
  .includeMode('or')
  .wcagLevel('AA')
  .wcagLevel('aa')
  .logger((entry, frame) => { void `${frame.url}: ${entry.kind} ${entry.message}`; })
  .withTags(['wcag2a', 'wcag2aa'])
  .withPacks(['@acme/a11y-policy', './packs/house-rules.js'])
  .elementRef(true)
  .screenshots({ dir: 'a11y-shots', outcomes: ['fail', 'cantTell'], padding: 8, highlight: true, max: 20 })
  .analyze()
  .then((r: A11yCoreResult | A11yCoreMultiFrameResult) => {
    if (!('topFrame' in r)) {
      const shot = r.checksResults[0].occurrences[0].screenshot;
      if (shot && 'path' in shot) void `${shot.path} ${shot.box.width} ${shot.cropped ?? false}`;
      else if (shot) void `${shot.skipped} ${shot.error ?? ''}`;
    }
    if ('topFrame' in r) {
      formatFailures(r.topFrame);
      for (const frame of r.frames) if ('checksResults' in frame) getScanGaps(frame);
    } else {
      formatFailures(r);
    }
  });

new A11yCoreBuilder().withWcag('2.2', 'aa').plannedChecks().then((checks) => checks.map((c) => c.ruleId));
new A11yCoreBuilder().withWcag('2.2', 'aa').plannedCriteria().then((criteria) => criteria.map((r) => r.id));

export { plannedTask, stepsTask, pluginKey, review, steps, leans, asCore, version, scanned, skipped, hosts, path, element, headroom, message, where, code, config, task };

declare const gateResult: Parameters<typeof getGatingFailures>[0];
const gatingIds: string[] = getGatingFailures(gateResult, { failOnSeverity: SEVERITIES[2] }).map((c) => c.ruleId);

declare const conditionResult: A11yCoreResult;
const seenIn: string[] = (conditionResult.checksResults[0].occurrences[0].conditions || []).concat((conditionResult.conditionRuns || []).map((r) => r.condition));
