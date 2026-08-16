'use strict';

const { A11yCoreBuilder, formatFailures } = require('../src/index.js');

// Shared across the customRules tests below -- reported outcome depends on
// whether ctx.document has a .my-widget element. Unlike every sibling
// binding, runInPage can be a real, LIVE function here -- no
// page.evaluate()-style JSON boundary to cross.
const MY_ORG_CUSTOM_RULE = {
  id: 'my-org-custom-rule',
  meta: { title: 'My custom rule', tags: ['custom'], defaultSeverity: 'serious' },
  runInPage(ctx) {
    const el = ctx.document.querySelector('.my-widget');
    return el ? { outcome: 'fail', occurrences: [{ __node: el }] } : { outcome: 'notApplicable', occurrences: [] };
  }
};

// Same rule, but pre-stringified -- proves a function-source string (the
// only form the sibling bindings accept) still works here too.
const MY_ORG_CUSTOM_RULE_STRING = {
  id: 'my-org-custom-rule',
  meta: { title: 'My custom rule', tags: ['custom'], defaultSeverity: 'serious' },
  runInPage: (function (ctx) {
    const el = ctx.document.querySelector('.my-widget');
    return el ? { outcome: 'fail', occurrences: [{ __node: el }] } : { outcome: 'notApplicable', occurrences: [] };
  }).toString()
};

// A second, distinct rule ID -- proves withCustomRules() can register more
// than one rule at once (array form) and accumulates across calls.
const SECOND_CUSTOM_RULE = {
  id: 'my-org-second-custom-rule',
  meta: { title: 'My second custom rule', tags: ['custom'] },
  runInPage(ctx) {
    const el = ctx.document.querySelector('.my-other-widget');
    return el ? { outcome: 'fail', occurrences: [{ __node: el }] } : { outcome: 'notApplicable', occurrences: [] };
  }
};

// Exercises the optional `applicability` field. When applicability returns
// false, surea11y reports 'notApplicable' WITHOUT ever invoking runInPage;
// runInPage here always reports 'pass' so the two outcomes are unambiguous
// proof of which path ran.
const CUSTOM_RULE_WITH_APPLICABILITY = {
  id: 'my-org-conditional-custom-rule',
  meta: { title: 'Conditional custom rule', tags: ['custom'] },
  applicability(ctx) {
    return !!ctx.document.querySelector('.applicability-gate');
  },
  runInPage() {
    return { outcome: 'pass', occurrences: [] };
  }
};

describe('A11yCoreBuilder', () => {
  it('analyze() scans the AUT and returns surea11y\'s native result shape -- not the Cypress runner\'s own chrome', () => {
    cy.visit('cypress/fixtures/basic.html');

    new A11yCoreBuilder().analyze().then((results) => {
      expect(results.checksResults).to.be.an('array');
      // Proves this really scanned the fixture page, not some other
      // document -- the single most important claim this whole binding
      // rests on.
      expect(results.title).to.equal('basic scan fixture');

      const fails = results.checksResults.filter((r) => r.outcome === 'fail');
      expect(fails.some((r) => r.ruleId === 'button-name-present')).to.be.true;
      expect(fails.some((r) => r.ruleId === 'img-alt-present')).to.be.true;
    });
  });

  it('include() scopes the scan to one region', () => {
    cy.visit('cypress/fixtures/regions-scope-b-pass.html');

    new A11yCoreBuilder().include('#b').analyze().then((results) => {
      const rule = results.checksResults.find((r) => r.ruleId === 'img-alt-present');
      expect(rule.outcome).to.equal('pass');
    });
  });

  it('include() called twice scans the union of both regions', () => {
    cy.visit('cypress/fixtures/regions-union-two.html');

    new A11yCoreBuilder().include('#a').include('#b').analyze().then((results) => {
      const rule = results.checksResults.find((r) => r.ruleId === 'img-alt-present');
      expect(rule.outcome).to.equal('fail');
      expect(rule.occurrences).to.have.length(2); // #a and #b's images, not #c's
    });
  });

  it('scoping methods (include/exclude/withRules/etc.) accumulate across analyze() calls on the same instance -- create one builder per scan', () => {
    cy.visit('cypress/fixtures/regions-union-two.html');

    // The builder is a mutable object with no reset between analyze() calls.
    // Intentional for "call include() multiple times within ONE scan" (see
    // the test above), but the same accumulation applies across separate
    // analyze() calls if you reuse an instance -- documented here as a
    // known, tested behavior. See README.md's own note.
    const builder = new A11yCoreBuilder();
    builder.include('#a').analyze().then((first) => {
      const firstRule = first.checksResults.find((r) => r.ruleId === 'img-alt-present');
      expect(firstRule.occurrences.map((o) => o.selector)).to.deep.equal(['#a > img']);

      builder.include('#b').analyze().then((second) => { // scope is now #a AND #b, not just #b
        const secondRule = second.checksResults.find((r) => r.ruleId === 'img-alt-present');
        expect(secondRule.occurrences.map((o) => o.selector)).to.deep.equal(['#a > img', '#b > img']);
      });
    });
  });

  it('reportOnly()/frames()/elementRef() overwrite on repeated calls, unlike the accumulating scoping methods above', () => {
    cy.visit('cypress/fixtures/basic.html');

    const builder = new A11yCoreBuilder().reportOnly(['fail']);
    builder.analyze().then(() => {
      // Calling reportOnly() again REPLACES the previous outcomes list
      // rather than merging with it -- unlike include()/withRules()/etc.
      builder.reportOnly(['pass']).analyze().then((results) => {
        expect(results.checksResults.length).to.be.greaterThan(0);
        expect(results.checksResults.every((r) => r.outcome === 'pass')).to.be.true;
      });
    });
  });

  it('exclude() skips elements inside the excluded subtree', () => {
    cy.visit('cypress/fixtures/exclude.html');

    new A11yCoreBuilder().exclude('#excluded').analyze().then((results) => {
      const rule = results.checksResults.find((r) => r.ruleId === 'img-alt-present');
      expect(rule.outcome).to.equal('pass');
    });
  });

  it('include() and exclude() combined -- scoped to a region, minus a sub-part of it', () => {
    cy.visit('cypress/fixtures/include-exclude-combined.html');

    new A11yCoreBuilder().include('#scope').exclude('#excluded').analyze().then((results) => {
      const rule = results.checksResults.find((r) => r.ruleId === 'img-alt-present');
      expect(rule.outcome).to.equal('fail');
      expect(rule.occurrences.map((o) => o.selector)).to.deep.equal(['#scope > img']);
    });
  });

  it('disableRules() removes a rule from the result entirely', () => {
    cy.visit('cypress/fixtures/basic.html');

    new A11yCoreBuilder().disableRules(['button-name-present']).analyze().then((results) => {
      const rule = results.checksResults.find((r) => r.ruleId === 'button-name-present');
      expect(rule).to.be.undefined;
    });
  });

  it('withRules() only runs the given rule IDs', () => {
    cy.visit('cypress/fixtures/basic.html');

    new A11yCoreBuilder().withRules(['img-alt-present']).analyze().then((results) => {
      expect(results.checksResults.map((r) => r.ruleId)).to.deep.equal(['img-alt-present']);
    });
  });

  it('withRules() and disableRules() combined on the same rule ID -- disableRules wins', () => {
    cy.visit('cypress/fixtures/basic.html');

    // surea11y applies excludeRuleIds *after* includeRuleIds (see
    // ../surea11y/docs/ENGINE_OPTIONS.md).
    new A11yCoreBuilder()
      .withRules(['img-alt-present', 'button-name-present'])
      .disableRules(['img-alt-present'])
      .analyze()
      .then((results) => {
        expect(results.checksResults.map((r) => r.ruleId)).to.deep.equal(['button-name-present']);
      });
  });

  it('disableTags() never runs rules carrying any of the given tags', () => {
    cy.visit('cypress/fixtures/basic.html');

    // button-name-present carries wcag412 -- disabling that tag removes it.
    new A11yCoreBuilder().disableTags(['wcag412']).analyze().then((results) => {
      expect(results.checksResults.some((r) => r.ruleId === 'button-name-present')).to.be.false;
    });
  });

  it('withTags() only runs rules carrying at least one of the given tags', () => {
    cy.visit('cypress/fixtures/basic.html');

    new A11yCoreBuilder().withTags(['wcag412']).analyze().then((results) => {
      expect(results.checksResults.length).to.be.greaterThan(0);
      expect(results.checksResults.some((r) => r.ruleId === 'button-name-present')).to.be.true;
    });
  });

  it('withTags() and disableTags() combined on the same tag -- disableTags wins, leaving nothing', () => {
    cy.visit('cypress/fixtures/basic.html');

    new A11yCoreBuilder().withTags(['wcag412']).disableTags(['wcag412']).analyze().then((results) => {
      expect(results.checksResults).to.deep.equal([]);
    });
  });

  it('withRules() and withTags() combined require BOTH to match (surea11y\'s default "and" includeMode)', () => {
    cy.visit('cypress/fixtures/basic.html');

    // img-alt-present doesn't carry wcag412, so this combination yields
    // nothing even though img-alt-present alone matches withRules() and
    // button-name-present alone matches wcag412.
    new A11yCoreBuilder()
      .withRules(['img-alt-present'])
      .withTags(['wcag412'])
      .analyze()
      .then((results) => {
        expect(results.checksResults).to.deep.equal([]);
      });
  });

  it('options() merges into engineOptions and is actually applied', () => {
    cy.visit('cypress/fixtures/basic.html');

    new A11yCoreBuilder().options({ locale: 'fr' }).analyze().then((results) => {
      const rule = results.checksResults.find((r) => r.ruleId === 'button-name-present');
      expect(rule, 'button-name-present should be present in the result').to.exist;
      // Each result echoes back the *resolved* engineOptions it actually ran
      // under (see surea11y's docs/OUTPUT_SCHEMA.md).
      expect(rule.engineOptions.locale).to.equal('fr');
    });
  });

  it('options({ customRules }) registers a runtime custom rule via surea11y\'s engineOptions passthrough', () => {
    cy.visit('cypress/fixtures/custom-widget-single.html');

    new A11yCoreBuilder().options({ customRules: [MY_ORG_CUSTOM_RULE] }).analyze().then((results) => {
      const custom = results.checksResults.find((r) => r.ruleId === 'my-org-custom-rule');
      expect(custom, 'custom rule should appear in checksResults like a built-in rule').to.exist;
      expect(custom.outcome).to.equal('fail');
      expect(custom.occurrences[0].selector).to.equal('html > body > div');
    });
  });

  it('withCustomRules() registers a runtime custom rule from a live function -- no stringification needed, unlike every sibling binding', () => {
    cy.visit('cypress/fixtures/custom-widget-single.html');

    new A11yCoreBuilder().withCustomRules(MY_ORG_CUSTOM_RULE).analyze().then((results) => {
      const custom = results.checksResults.find((r) => r.ruleId === 'my-org-custom-rule');
      expect(custom, 'custom rule should appear in checksResults like a built-in rule').to.exist;
      expect(custom.outcome).to.equal('fail');
      expect(custom.occurrences[0].selector).to.equal('html > body > div');
    });
  });

  it('withCustomRules() still accepts an already-stringified runInPage, same as every sibling binding requires', () => {
    cy.visit('cypress/fixtures/custom-widget.html');

    new A11yCoreBuilder().withCustomRules(MY_ORG_CUSTOM_RULE_STRING).analyze().then((results) => {
      const custom = results.checksResults.find((r) => r.ruleId === 'my-org-custom-rule');
      expect(custom.outcome).to.equal('fail');
    });
  });

  it('withCustomRules() accepts an array to register multiple rules in one call', () => {
    cy.visit('cypress/fixtures/custom-widget.html');

    new A11yCoreBuilder().withCustomRules([MY_ORG_CUSTOM_RULE, SECOND_CUSTOM_RULE]).analyze().then((results) => {
      expect(results.checksResults.find((r) => r.ruleId === 'my-org-custom-rule').outcome).to.equal('fail');
      expect(results.checksResults.find((r) => r.ruleId === 'my-org-second-custom-rule').outcome).to.equal('fail');
    });
  });

  it('withCustomRules() accumulates across repeated calls, like withRules()/withTags()', () => {
    cy.visit('cypress/fixtures/custom-widget.html');

    new A11yCoreBuilder()
      .withCustomRules(MY_ORG_CUSTOM_RULE)
      .withCustomRules(SECOND_CUSTOM_RULE) // adds a second rule, doesn't replace the first
      .analyze()
      .then((results) => {
        expect(results.checksResults.find((r) => r.ruleId === 'my-org-custom-rule').outcome).to.equal('fail');
        expect(results.checksResults.find((r) => r.ruleId === 'my-org-second-custom-rule').outcome).to.equal('fail');
      });
  });

  it('withCustomRules() composes with a raw options({ customRules }) call rather than clobbering it', () => {
    cy.visit('cypress/fixtures/custom-widget.html');

    new A11yCoreBuilder()
      .options({ customRules: [MY_ORG_CUSTOM_RULE] })
      .withCustomRules(SECOND_CUSTOM_RULE)
      .analyze()
      .then((results) => {
        expect(results.checksResults.find((r) => r.ruleId === 'my-org-custom-rule').outcome).to.equal('fail');
        expect(results.checksResults.find((r) => r.ruleId === 'my-org-second-custom-rule').outcome).to.equal('fail');
      });
  });

  it('withCustomRules() converts respects a live applicability function\'s true/false result', () => {
    cy.visit('cypress/fixtures/custom-widget.html');
    new A11yCoreBuilder().withCustomRules(CUSTOM_RULE_WITH_APPLICABILITY).analyze().then((results) => {
      expect(results.checksResults.find((r) => r.ruleId === 'my-org-conditional-custom-rule').outcome).to.equal('pass');
    });
  });

  it('withCustomRules() applicability returning false reports notApplicable without invoking runInPage', () => {
    cy.visit('cypress/fixtures/custom-widget-no-gate.html');
    new A11yCoreBuilder().withCustomRules(CUSTOM_RULE_WITH_APPLICABILITY).analyze().then((results) => {
      expect(results.checksResults.find((r) => r.ruleId === 'my-org-conditional-custom-rule').outcome).to.equal('notApplicable');
    });
  });

  it('withCustomRules() throws synchronously on a missing/empty id, instead of failing silently deep in the page', () => {
    expect(() => new A11yCoreBuilder().withCustomRules({ runInPage: () => ({}) }))
      .to.throw('requires a non-empty string');
    expect(() => new A11yCoreBuilder().withCustomRules({ id: '', runInPage: () => ({}) }))
      .to.throw('requires a non-empty string');
  });

  it('withCustomRules() throws synchronously when runInPage is missing or not a function/string', () => {
    expect(() => new A11yCoreBuilder().withCustomRules({ id: 'no-run-fn' }))
      .to.throw('requires a `runInPage` function or function-source string');
    expect(() => new A11yCoreBuilder().withCustomRules({ id: 'bad-run-fn', runInPage: 123 }))
      .to.throw('requires a `runInPage` function or function-source string');
    expect(() => new A11yCoreBuilder().withCustomRules({ id: 'empty-run-fn', runInPage: '' }))
      .to.throw('requires a `runInPage` function or function-source string');
  });

  it('withCustomRules() throws synchronously when applicability is provided but not a function/string', () => {
    expect(() => new A11yCoreBuilder().withCustomRules({
      id: 'bad-applicability',
      runInPage: () => ({}),
      applicability: 123
    })).to.throw('`applicability` must be a function or function-source string');
  });

  it('withCustomRules() rejects the whole call (no partial registration) when one descriptor in an array is invalid', () => {
    const builder = new A11yCoreBuilder();
    expect(() => builder.withCustomRules([MY_ORG_CUSTOM_RULE, { id: '', runInPage: () => ({}) }]))
      .to.throw('requires a non-empty string');
    expect(builder._customRules).to.have.length(0);
  });

  it('reportOnly() filters checksResults down to the given outcomes', () => {
    cy.visit('cypress/fixtures/basic.html');

    new A11yCoreBuilder().reportOnly(['fail']).analyze().then((results) => {
      expect(results.checksResults.length).to.be.greaterThan(0);
      expect(results.checksResults.every((r) => r.outcome === 'fail')).to.be.true;
      expect(results.checksResults.some((r) => r.ruleId === 'button-name-present')).to.be.true;
    });
  });

  it('reportOnly() rejects an invalid outcome value', () => {
    expect(() => new A11yCoreBuilder().reportOnly(['nope'])).to.throw('invalid outcome "nope"');
  });

  it('elementRef(true) attaches a live, usable DOM Element to each fail/cantTell occurrence', () => {
    cy.visit('cypress/fixtures/basic.html');

    new A11yCoreBuilder().elementRef(true).analyze().then((results) => {
      const rule = results.checksResults.find((r) => r.ruleId === 'img-alt-present');
      expect(rule.outcome).to.equal('fail');
      const [occurrence] = rule.occurrences;
      expect(occurrence.element, 'occurrence should carry a live Element').to.exist;
      expect(occurrence.element.id).to.equal('pic');
      // Prove it's usable via cy.wrap(), the idiomatic Cypress way to act on
      // a raw element handed back by a plugin.
      cy.wrap(occurrence.element).should('have.id', 'pic');
    });
  });

  it('reportOnly() and elementRef(true) combined -- surviving occurrences still carry a usable Element', () => {
    cy.visit('cypress/fixtures/basic.html');

    new A11yCoreBuilder().reportOnly(['fail']).elementRef(true).analyze().then((results) => {
      expect(results.checksResults.every((r) => r.outcome === 'fail')).to.be.true;
      const rule = results.checksResults.find((r) => r.ruleId === 'img-alt-present');
      expect(rule.occurrences[0].element.id).to.equal('pic');
    });
  });

  it('elementRef(true) leaves element null for an occurrence with no resolvable selector, instead of throwing', () => {
    cy.visit('cypress/fixtures/manual-rule-only.html');

    // contrast-enhanced can report a page-wide occurrence with
    // selector: "" (no single target element) -- confirms .elementRef(true)
    // doesn't crash calling querySelector("") on it (an invalid CSS
    // selector) and instead leaves element null.
    new A11yCoreBuilder().elementRef(true).analyze().then((results) => {
      const rule = results.checksResults.find((r) => r.ruleId === 'contrast-enhanced');
      expect(rule, 'expected contrast-enhanced to be present on this fixture').to.exist;
      const occurrence = rule.occurrences.find((o) => o.selector === '');
      expect(occurrence, 'expected an occurrence with an empty selector on this page').to.exist;
      expect(occurrence.element).to.equal(null);
    });
  });

  it('frames(true) with no sub-frames returns { topFrame, frames: [] }', () => {
    cy.visit('cypress/fixtures/basic.html');

    new A11yCoreBuilder().frames(true).analyze().then((results) => {
      expect(results.topFrame.checksResults).to.be.an('array');
      expect(results.topFrame.checksResults.some((r) => r.ruleId === 'button-name-present' && r.outcome === 'fail')).to.be.true;
      expect(results.frames).to.deep.equal([]);
    });
  });

  it('frames(true) scans a same-origin sub-frame and keeps its findings separate from the top frame', () => {
    cy.visit('cypress/fixtures/frame-parent-same-origin.html');

    new A11yCoreBuilder().frames(true).analyze().then((results) => {
      const topButtonRule = results.topFrame.checksResults.find((r) => r.ruleId === 'button-name-present');
      expect(topButtonRule.outcome).to.equal('pass'); // top button has real text

      expect(results.frames).to.have.length(1);
      const frameImgRule = results.frames[0].checksResults.find((r) => r.ruleId === 'img-alt-present');
      expect(frameImgRule.outcome).to.equal('fail');
      expect(results.frames[0].title).to.equal('frame child (same-origin)');
    });
  });

  it('frames(true) recurses into a nested (grandchild) same-origin iframe, flattening every depth into one frames array', () => {
    cy.visit('cypress/fixtures/frame-nested-top.html');

    new A11yCoreBuilder().frames(true).analyze().then((results) => {
      expect(results.frames).to.have.length(2); // child + grandchild, flattened
      const childResult = results.frames.find((f) => f.title === 'nested frames -- child');
      const grandchildResult = results.frames.find((f) => f.title === 'nested frames -- grandchild');
      expect(childResult, 'child frame result should be present').to.exist;
      expect(grandchildResult, 'grandchild frame result should be present').to.exist;
      expect(childResult.checksResults.find((r) => r.ruleId === 'img-alt-present').outcome).to.equal('fail');
      expect(grandchildResult.checksResults.find((r) => r.ruleId === 'button-name-present').outcome).to.equal('fail');
    });
  });

  it('frames(true) reports a genuinely cross-origin iframe as { url, error } instead of aborting the scan (honest limitation)', () => {
    cy.visit('cypress/fixtures/frame-parent-cross-origin.html');
    cy.wait(2000); // let the cross-origin iframe actually finish loading

    new A11yCoreBuilder().frames(true).analyze().then((results) => {
      expect(results.topFrame.checksResults).to.be.an('array');
      expect(results.frames).to.have.length(1);
      expect(results.frames[0].error, 'cross-origin frame should be reported as an error, not scanned').to.be.a('string');
      expect(results.frames[0].error).to.match(/[Cc]ross-origin/);
      expect(results.frames[0].url).to.equal('https://example.org/');
      expect(results.frames[0].checksResults).to.be.undefined;
    });
  });

  it('options({ customRules }) combined with frames(true) -- the custom rule runs in every reachable frame', () => {
    cy.visit('cypress/fixtures/frame-parent-same-origin.html');

    new A11yCoreBuilder().frames(true).options({ customRules: [MY_ORG_CUSTOM_RULE] }).analyze().then((results) => {
      expect(results.topFrame.checksResults.find((r) => r.ruleId === 'my-org-custom-rule').outcome).to.equal('fail');
      expect(results.frames[0].checksResults.find((r) => r.ruleId === 'my-org-custom-rule').outcome).to.equal('fail');
    });
  });

  it('withCustomRules() runs the rule in every frame when combined with frames(true)', () => {
    cy.visit('cypress/fixtures/frame-parent-same-origin.html');

    new A11yCoreBuilder().frames(true).withCustomRules(MY_ORG_CUSTOM_RULE).analyze().then((results) => {
      expect(results.topFrame.checksResults.find((r) => r.ruleId === 'my-org-custom-rule').outcome).to.equal('fail');
      expect(results.frames[0].checksResults.find((r) => r.ruleId === 'my-org-custom-rule').outcome).to.equal('fail');
    });
  });

  it('reportOnly() applies per-frame when combined with frames(true)', () => {
    cy.visit('cypress/fixtures/frame-parent-same-origin.html');

    new A11yCoreBuilder().frames(true).reportOnly(['fail']).analyze().then((results) => {
      expect(results.topFrame.checksResults.every((r) => r.outcome === 'fail')).to.be.true;
      expect(results.frames[0].checksResults.every((r) => r.outcome === 'fail')).to.be.true;
      expect(results.frames[0].checksResults.some((r) => r.ruleId === 'img-alt-present')).to.be.true;
    });
  });

  it('elementRef(true) resolves against each frame\'s own document when combined with frames(true)', () => {
    cy.visit('cypress/fixtures/frame-parent-same-origin.html');

    new A11yCoreBuilder().frames(true).elementRef(true).analyze().then((results) => {
      const rule = results.frames[0].checksResults.find((r) => r.ruleId === 'img-alt-present');
      expect(rule.outcome).to.equal('fail');
      expect(rule.occurrences[0].element.id).to.equal('inner');
    });
  });

  it('formatFailures() works end-to-end against a real scan\'s checksResults', () => {
    cy.visit('cypress/fixtures/basic.html');

    new A11yCoreBuilder().reportOnly(['fail']).analyze().then((results) => {
      const output = formatFailures(results.checksResults);
      expect(output).to.include('img-alt-present');
      expect(output).to.include('button-name-present');
      expect(output).to.include('#pic'); // surea11y prefers an ID selector when the element has one
    });
  });

  // Readable per-violation Command Log entries (why this was added, why the
  // log names are what they are, why it isn't ported to the sibling
  // bindings).
  describe('Cypress.log() Command Log entries', () => {
    it('analyze() logs one \'surea11y error!\' entry per fail rule plus a trailing summary entry', () => {
      cy.visit('cypress/fixtures/basic.html');
      const logSpy = cy.spy(Cypress, 'log').log(false); // .log(false): don't recursively log the spy's own invocations

      // reportOnly(['fail']) scopes this down to just basic.html's
      // deterministic fails -- unscoped, this fixture (missing a <main>/<h1>
      // like every other minimal test fixture here) also carries several
      // genuine 'cantTell' manual-review findings, which _logFindings()
      // logs too (same outcomes formatFailures() covers) but aren't this
      // test's concern.
      new A11yCoreBuilder().reportOnly(['fail']).analyze().then((results) => {
        // basic.html's known fails: button-name-present and img-alt-present,
        // both used elsewhere in this file.
        expect(results.checksResults, 'sanity check: basic.html has known fails').to.have.length(2);

        const errorCalls = logSpy.getCalls().filter((c) => c.args[0].name === 'surea11y error!');
        const summaryCalls = logSpy.getCalls().filter((c) => c.args[0].name === 'surea11y violation summary');

        expect(errorCalls, 'one log entry per fail rule').to.have.length(2);
        expect(errorCalls.map((c) => c.args[0].message)).to.include.members([
          'button-name-present (serious): on 1 Node',
          'img-alt-present (serious): on 1 Node',
        ]);

        expect(summaryCalls, 'exactly one trailing summary entry').to.have.length(1);
        expect(summaryCalls[0].args[0].message).to.equal('2 accessibility issues were detected');
      });
    });

    it('analyze() logs nothing when there are no fail/cantTell findings', () => {
      cy.visit('cypress/fixtures/well-formed.html');
      const logSpy = cy.spy(Cypress, 'log').log(false);

      // well-formed.html still carries a handful of genuine 'cantTell'
      // manual-review findings (contrast-computable, page-title-patterns,
      // etc.) -- reportOnly(['fail']) here isn't just trimming the payload,
      // it's what makes checksResults (and so _logFindings' own input)
      // actually empty, the same way the "no detectable violations" gate in
      // the consuming UI project's own clean-views spec only asserts on
      // 'fail', not 'cantTell'.
      new A11yCoreBuilder().reportOnly(['fail']).analyze().then((results) => {
        expect(results.checksResults, 'sanity check: well-formed.html has no fails').to.have.length(0);
        expect(logSpy.getCalls().filter((c) => c.args[0].name === 'surea11y error!')).to.have.length(0);
        expect(logSpy.getCalls().filter((c) => c.args[0].name === 'surea11y violation summary')).to.have.length(0);
      });
    });

    it('frames(true) logs each same-origin sub-frame\'s findings separately from the top frame\'s', () => {
      cy.visit('cypress/fixtures/frame-parent-same-origin.html');
      const logSpy = cy.spy(Cypress, 'log').log(false);

      new A11yCoreBuilder().frames(true).analyze().then(() => {
        const errorCalls = logSpy.getCalls().filter((c) => c.args[0].name === 'surea11y error!');
        // Top frame's own button has real text (passes); only the child
        // frame's img-alt-present should have logged.
        expect(errorCalls.some((c) => c.args[0].message.startsWith('img-alt-present'))).to.be.true;
        expect(errorCalls.some((c) => c.args[0].message.startsWith('button-name-present'))).to.be.false;
      });
    });
  });
});
