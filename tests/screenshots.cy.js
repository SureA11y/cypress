'use strict';

// .screenshots() through Cypress's own commands: each picture is a PNG
// cy.screenshot() saved, checked by its pixels in Node (the pngColourAt
// task in cypress.config.js): the element's own colour where the element is.

const { A11yCoreBuilder, formatFailures } = require('../src/index.js');

// The colour each flagged image is, by where core says it is.
const COLOURS = {
  '#top': [255, 165, 0],
  '#inner': [0, 128, 0],
  'html > body > main > x-card >>> img': [128, 0, 128],
  '#framed': [0, 128, 128]
};

// Core reports no finding on what CSS hides, so a rule of the test's own
// flags #hidden, to be pictured as not-rendered.
const FLAGS_HIDDEN = {
  id: 'test-flags-hidden',
  meta: { title: 'Flags #hidden', tags: ['test'] },
  runInPage(ctx) {
    const el = ctx.document.getElementById('hidden');
    return el ? { outcome: 'fail', occurrences: [{ __node: el }] } : { outcome: 'notApplicable', occurrences: [] };
  }
};

function where(occurrence) {
  return (occurrence.shadowHostSelectors || []).concat(occurrence.selector).join(' >>> ');
}

// The picture's colour at the middle of the element. `box` is in CSS
// pixels; the PNG has the device pixel ratio's more (2 on a Retina Mac).
function colourAtElement(screenshot) {
  const { box } = screenshot;
  return cy.window({ log: false }).then((win) => {
    const scale = win.devicePixelRatio || 1;
    return cy.task('pngColourAt', { path: screenshot.path, x: (box.x + box.width / 2) * scale, y: (box.y + box.height / 2) * scale }, { log: false });
  });
}

// The pixel at the element is that element's colour: nearer to it than to
// any other image's, and not the page's white. Not an exact match: Electron
// on macOS converts a screenshot to the display's colour space.
function expectColour(screenshot, name) {
  expect(screenshot, name).to.have.property('path');
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return colourAtElement(screenshot).then(({ colour }) => {
    const nearest = Object.keys(COLOURS).sort((a, b) => distance(colour, COLOURS[a]) - distance(colour, COLOURS[b]))[0];
    expect(nearest, `${name}: ${colour} at the element`).to.equal(name);
    expect(distance(colour, [255, 255, 255]), `${name}: ${colour} is not the page`).to.be.above(60);
  });
}

// What the page looks like from outside: scroll positions and markup.
function pageState() {
  return cy.window({ log: false }).then((win) => [
    win.scrollX,
    win.scrollY,
    win.document.getElementById('scroller').scrollTop,
    win.document.documentElement.outerHTML
  ]);
}

describe('A11yCoreBuilder.screenshots()', () => {
  beforeEach(() => {
    cy.viewport(800, 600);
    cy.visit('cypress/fixtures/screenshots.html');
    cy.window().then((win) => {
      win.scrollTo(0, 37);
      win.document.getElementById('scroller').scrollTop = 11;
    });
  });

  it('pictures each flagged element in its own colour, in frames too, says why for the rest, and leaves the page as it was', () => {
    pageState().then((before) => {
      new A11yCoreBuilder()
        .withCustomRules(FLAGS_HIDDEN)
        .withRules(['img-alt-present', 'test-flags-hidden'])
        .screenshots({ padding: 8 })
        .frames(true)
        .analyze()
        .then((results) => {
          const top = results.topFrame.checksResults.find((c) => c.ruleId === 'img-alt-present');
          const found = new Map(top.occurrences.map((o) => [where(o), o]));
          const get = (name) => {
            expect([...found.keys()], 'findings').to.include(name);
            return found.get(name);
          };
          for (const name of ['#top', '#inner', 'html > body > main > x-card >>> img']) {
            const shot = get(name).screenshot;
            expect(shot.path, name).to.match(/surea11y[\\/]element-[0-9a-f]{8}\.png$/);
            expectColour(shot, name);
          }
          expect(get('#away').screenshot).to.deep.equal({ skipped: 'off-screen' });
          const hidden = results.topFrame.checksResults.find((c) => c.ruleId === 'test-flags-hidden').occurrences[0];
          expect(hidden.screenshot).to.deep.equal({ skipped: 'not-rendered' });

          // The image in the same-origin frame, placed on the app's page.
          expect(results.frames).to.have.length(1);
          const framed = results.frames[0].checksResults.find((c) => c.ruleId === 'img-alt-present').occurrences[0];
          expectColour(framed.screenshot, '#framed');

          pageState().then((after) => expect(after).to.deep.equal(before));
          cy.window({ log: false }).then((win) => {
            expect(win.document.querySelectorAll('surea11y-highlight'), 'the box is removed').to.have.length(0);
            expect(Object.getOwnPropertySymbols(win).map(String)).to.not.include('Symbol(surea11y.screenshots)');
          });
        });
    });
  });

  it('dir: one file per element, named after it and kept from run to run, which formatFailures() points to; reportOnly() and elementRef() still apply', () => {
    const run = () => new A11yCoreBuilder()
      .withRules(['img-alt-present'])
      .screenshots({ dir: 'a11y-shots' })
      .reportOnly(['fail'])
      .elementRef(true)
      .analyze();

    run().then((results) => {
      const [check] = results.checksResults;
      const occurrence = check.occurrences.find((o) => o.selector === '#top');
      expect(occurrence.element, 'elementRef() still attaches the element').to.exist;
      expect(occurrence.screenshot.path).to.match(/a11y-shots[\\/]element-[0-9a-f]{8}\.png$/);
      expect(formatFailures(results)).to.include(`   screenshot: ${occurrence.screenshot.path}`);
      run().then((again) => {
        const same = again.checksResults[0].occurrences.find((o) => o.selector === '#top');
        expect(same.screenshot.path, 'the same file, overwritten').to.equal(occurrence.screenshot.path);
      });
    });
  });

  it('max caps the pictures a scan takes, frames included', () => {
    new A11yCoreBuilder()
      .withRules('img-alt-present')
      .screenshots({ max: 2 })
      .frames(true)
      .analyze()
      .then((results) => {
        const shots = [results.topFrame, ...results.frames]
          .flatMap((r) => r.checksResults[0].occurrences)
          .map((o) => o.screenshot);
        expect(shots.filter((s) => s.path)).to.have.length(2);
        expect(shots.some((s) => s.skipped === 'max-reached')).to.equal(true);
      });
  });

  it('is off unless asked; with selectors turned off, it throws before scanning', () => {
    new A11yCoreBuilder().withRules('img-alt-present').analyze().then((results) => {
      expect(results.checksResults[0].occurrences[0]).to.not.have.property('screenshot');
    });
    // By name: binding-base's TypeError can come from another realm than the spec's.
    expect(() => new A11yCoreBuilder().options({ output: { includeSelector: false } }).screenshots().analyze())
      .to.throw()
      .and.to.include({ name: 'TypeError', code: 'INVALID_ENGINE_OPTIONS' });
    expect(() => new A11yCoreBuilder().screenshots({ padding: -1 }))
      .to.throw()
      .and.to.include({ name: 'TypeError', code: 'INVALID_ENGINE_OPTIONS' });
  });
});
