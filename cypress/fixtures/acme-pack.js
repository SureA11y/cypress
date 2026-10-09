'use strict';

// A pack (@surea11y/core/pack, plain object form) for the withPacks() tests:
// a rule, a 7:1 variant of contrast-minimum, and a checklist profile with one
// item. The plugin (src/plugin.js) loads it in Node.
module.exports = {
  name: '@acme/a11y-rules',
  version: '1.0.0',
  namespace: 'acme',
  core: '*',
  title: 'Acme policy',
  rules: [
    {
      id: 'acme-no-widget',
      meta: { title: 'No widget', tags: ['house-rules'] },
      runInPage(ctx) {
        const el = ctx.document.querySelector('.my-widget');
        return el ? { outcome: 'fail', occurrences: [{ __node: el }] } : { outcome: 'pass' };
      }
    }
  ],
  variants: [
    {
      id: 'acme-contrast-enhanced',
      from: 'contrast-minimum',
      config: { normalTextRatio: 7, largeTextRatio: 4.5 },
      meta: {
        title: 'Text contrast is at least 7:1',
        tags: ['house-rules'],
        i18n: { titleKey: 'acmeContrastEnhanced_title', descriptionKey: 'acmeContrastEnhanced_description' }
      }
    }
  ],
  dictionaries: {
    en: {
      acmeContrastEnhanced_title: 'Text contrast is at least 7:1',
      acmeContrastEnhanced_description: 'Checks text contrast at 7:1.'
    }
  },
  profiles: { 'acme-1': { tags: ['wcag2a', 'wcag2aa', 'house-rules'] } },
  rollups: [{ id: 'acme-text', title: 'Text', checksIds: ['contrast-minimum', 'acme-contrast-enhanced'] }]
};
