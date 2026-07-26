/**
 * Elements that carry meaning without carrying text. Both emptiness checks — the
 * sanitizer's wrapper pass and the selection fragment's — must agree: when they
 * did not, a page that wrapped a <br> in a styling span lost the break on one
 * path and kept it on the other.
 */
export const CONTENTFUL_TAGS = [
  'img',
  'video',
  'audio',
  'canvas',
  'picture',
  'figure',
  'br',
  'hr',
  'input',
] as const;
