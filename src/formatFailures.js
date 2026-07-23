'use strict';

/**
 * Turns a11y-core's checksResults array into a short, human-readable block
 * -- one entry per occurrence, not per rule, since a single rule can flag
 * several elements. Meant to be handed to an assertion library's own
 * failure-message parameter, e.g.:
 *
 *   new A11yCoreBuilder().reportOnly(['fail']).analyze().then((results) => {
 *     expect(results.checksResults.length, formatFailures(results.checksResults)).to.equal(0);
 *   });
 *
 * Deliberately a plain function, not a custom Cypress/Chai assertion -- it
 * has no dependency on any particular assertion library, matching every
 * sibling binding's own formatFailures.js byte-for-byte (see this project's
 * ROADMAP.md §2a -- copied verbatim, zero driver-specific code in here).
 *
 * @param {Array<object>} checksResults a11y-core's checksResults array (or
 *   any subset of it, e.g. already passed through .reportOnly()) -- see
 *   ../a11y-core/docs/OUTPUT_SCHEMA.md for the shape.
 * @param {{ outcomes?: string[] }} [opts] Which outcomes to include.
 *   Defaults to ['fail', 'cantTell'] -- the two outcomes that ever carry
 *   occurrences (see OUTPUT_SCHEMA.md's note on `pass`/`notApplicable`
 *   always having occurrences: []).
 * @returns {string}
 */
function formatFailures(checksResults, { outcomes = ['fail', 'cantTell'] } = {}) {
  const relevant = checksResults.filter((r) => outcomes.includes(r.outcome));

  const lines = [];
  let n = 0;
  for (const check of relevant) {
    if (!check.occurrences.length) {
      // A thrown rule surfaces as outcome: "cantTell" with occurrences: []
      // and error set to the exception message (see OUTPUT_SCHEMA.md) --
      // still worth surfacing rather than silently dropping.
      n += 1;
      lines.push(`${n}) ${check.ruleId} (${check.severity}): ${check.error || check.title}`);
      continue;
    }
    for (const occurrence of check.occurrences) {
      n += 1;
      lines.push(`${n}) ${check.ruleId} (${check.severity}): ${occurrence.summary}`);
      if (occurrence.selector) lines.push(`   at ${occurrence.selector}`);
      if (occurrence.hint) lines.push(`   ${occurrence.hint}`);
    }
  }

  return lines.length ? lines.join('\n') : 'No accessibility violations found.';
}

module.exports = { formatFailures };
