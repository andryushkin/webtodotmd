// Page titles come from site metadata, and that metadata is not always clean.
// gazeta.ru ships <meta name="twitter:title" content="10&amp;nbsp;самых…">:
// the HTML parser decodes the attribute once, so getAttribute() hands us a
// literal "&nbsp;" that would end up in the YAML front matter and in the
// download file name. Decode one more level and normalise the whitespace.

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ', shy: '',
  mdash: '—', ndash: '–', hellip: '…', bull: '•', middot: '·',
  laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  deg: '°', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥',
  sect: '§', para: '¶', dagger: '†', plusmn: '±', times: '×', divide: '÷',
};

// One pass only: "&amp;lt;" must stay "&lt;" rather than collapse into "<".
// Unknown names ("AT&T", "R&D") are left exactly as they were.
export function decodeEntities(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);?/g, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      // Surrogates and out-of-range values would throw; keep the source text.
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      if (code >= 0xd800 && code <= 0xdfff) return match;
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

const TITLE_MAX = 200;

export function normalizePageTitle(raw: string): string {
  const clean = decodeEntities(raw)
    .replace(/[\n\r\t\u2028\u2029]+/g, ' ')
    // No-break variants read as spaces but break file names and search.
    .replace(/[\u00a0\u2007\u202f\ufeff]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  return clean.length > TITLE_MAX ? clean.slice(0, TITLE_MAX - 1) + '…' : clean;
}
