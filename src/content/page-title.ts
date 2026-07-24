// Page titles come from site metadata, and that metadata is not always clean.
// gazeta.ru ships <meta name="twitter:title" content="10&amp;nbsp;самых…">:
// the HTML parser decodes the attribute once, so getAttribute() hands us a
// literal "&nbsp;" that would end up in the YAML front matter and in the
// download file name. Decode one more level and normalise the whitespace.

import { ENTITY_KEYS, MAX_ENTITY_KEY_LEN } from './html-entities';

// Numeric references in the C1 range are what a Windows-1252 authoring tool
// meant, not the control characters they name; HTML parsers remap them and so
// do we — "&#146;" is a right single quote, not U+0092.
const C1_REMAP: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020,
  0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152,
  0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

// Decoding follows the HTML tokenizer: the longest reference the table knows
// wins, which is why "&notit;" is "¬it;" and "&copy2026" is "©2026", and why
// html-entities.ts ships the whole set. One pass only, so "&amp;lt;" stays
// "&lt;" rather than collapsing into "<"; unmatched runs ("AT&T", "R&D") are
// left exactly as they were written.
export function decodeEntities(text: string): string {
  return text.replace(
    /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*)(;?)/g,
    (match, body: string, semicolon: string) => {
      if (body[0] === '#') {
        const raw = body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
        const code = C1_REMAP[raw] ?? raw;
        // Surrogates and out-of-range values would throw; keep the source text.
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
        if (code >= 0xd800 && code <= 0xdfff) return match;
        return String.fromCodePoint(code);
      }
      // The semicolon is part of the reference, so match against the run with
      // it attached and hand back whatever the shorter match did not consume.
      const run = body + semicolon;
      for (let len = Math.min(run.length, MAX_ENTITY_KEY_LEN); len >= 2; len--) {
        const chars = ENTITY_KEYS.get(run.slice(0, len));
        if (chars !== undefined) return chars + run.slice(len);
      }
      return match;
    },
  );
}

const TITLE_MAX = 200;

let segmenter: Intl.Segmenter | undefined;

// Slicing by code units would cut a surrogate pair or a ZWJ sequence in half
// and leave a broken character in the front matter and the file name, so walk
// grapheme clusters and stop before the budget is exceeded.
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const budget = max - 1; // the ellipsis takes one code unit
  const clusters: Iterable<string> = typeof Intl.Segmenter === 'function'
    ? [...(segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })).segment(text)]
        .map(s => s.segment)
    : Array.from(text); // code points: still never splits a surrogate pair
  let out = '';
  for (const cluster of clusters) {
    if (out.length + cluster.length > budget) break;
    out += cluster;
  }
  return out + '…';
}

export function normalizePageTitle(raw: string): string {
  const clean = decodeEntities(raw)
    .replace(/[\n\r\t\u2028\u2029]+/g, ' ')
    // No-break variants read as spaces but break file names and search.
    .replace(/[\u00a0\u2007\u202f\ufeff]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  return truncate(clean, TITLE_MAX);
}
