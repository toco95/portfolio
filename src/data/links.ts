/**
 * Single source of truth for external URLs used across the site.
 * Add new entries here rather than inlining hrefs in components.
 */

export const links = {
  social: {
    linkedin: 'https://linkedin.com/in/thomascochet',
    github: 'https://github.com/toco95',
  },
  scheduling: {
    cal: 'https://cal.com/thomas-cochet/15min',
  },
  work: {
    hyperline: 'https://www.hyperline.co/',
    recccords: 'https://www.recccords.com/',
    shine: 'https://shine.fr/',
  },
  paris: {
    cafes: 'https://maps.app.goo.gl/mLesFoBuNwaPnWQx5',
    restaurants: 'https://maps.app.goo.gl/5YiWAMvi7t5zSoSs9',
    bars: 'https://maps.app.goo.gl/fkMvokywvqLVYfWx7',
  },
} as const;
