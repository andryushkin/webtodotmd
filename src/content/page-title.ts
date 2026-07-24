// Page titles come from site metadata, and that metadata is not always clean.
// gazeta.ru ships <meta name="twitter:title" content="10&amp;nbsp;самых…">:
// the HTML parser decodes the attribute once, so getAttribute() hands us a
// literal "&nbsp;" that would end up in the YAML front matter and in the
// download file name. Decode one more level and normalise the whitespace.

// Generated from https://html.spec.whatwg.org/entities.json, limited to the
// blocks that realistically show up in titles: ASCII, Latin-1, Latin Extended-A,
// Greek, general punctuation, currency and letterlike symbols. Names outside
// those blocks (&boxDL;, &NotEqualTilde;) are left as written — decoding them
// would cost 16 KB in the content script for symbols no page title carries.
// Format: "name:hexCodePoint", a leading "*" marking the names HTML also
// accepts without the trailing semicolon ("&nbsp", "&eacute").
const ENTITY_TABLE =
  '*AElig:c6 *AMP:26 *Aacute:c1 Abreve:102 *Acirc:c2 *Agrave:c0 Alpha:391 Amacr:100 Aogon:104 ' +
  '*Aring:c5 *Atilde:c3 *Auml:c4 Beta:392 *COPY:a9 Cacute:106 Ccaron:10c *Ccedil:c7 Ccirc:108 ' +
  'Cdot:10a Cedilla:b8 CenterDot:b7 Chi:3a7 CloseCurlyDoubleQuote:201d CloseCurlyQuote:2019 ' +
  'Dagger:2021 Dcaron:10e Delta:394 DiacriticalAcute:b4 DiacriticalTilde:2dc Dot:a8 DoubleDot:a8 ' +
  'Dstrok:110 ENG:14a *ETH:d0 *Eacute:c9 Ecaron:11a *Ecirc:ca Edot:116 *Egrave:c8 Emacr:112 ' +
  'Eogon:118 Epsilon:395 Eta:397 *Euml:cb *GT:3e Gamma:393 Gbreve:11e Gcedil:122 Gcirc:11c Gdot:120 ' +
  'Hcirc:124 Hstrok:126 IJlig:132 *Iacute:cd *Icirc:ce Idot:130 *Igrave:cc Imacr:12a Iogon:12e ' +
  'Iota:399 Itilde:128 *Iuml:cf Jcirc:134 Kappa:39a Kcedil:136 *LT:3c Lacute:139 Lambda:39b ' +
  'Lcaron:13d Lcedil:13b Lmidot:13f Lstrok:141 Mu:39c Nacute:143 Ncaron:147 Ncedil:145 ' +
  'NonBreakingSpace:a0 *Ntilde:d1 Nu:39d OElig:152 *Oacute:d3 *Ocirc:d4 Odblac:150 *Ograve:d2 ' +
  'Omacr:14c Omega:3a9 Omicron:39f OpenCurlyDoubleQuote:201c OpenCurlyQuote:2018 *Oslash:d8 ' +
  '*Otilde:d5 *Ouml:d6 Phi:3a6 Pi:3a0 PlusMinus:b1 Popf:2119 Prime:2033 Psi:3a8 *QUOT:22 Qopf:211a ' +
  '*REG:ae Racute:154 Rcaron:158 Rcedil:156 Re:211c Rfr:211c Rho:3a1 Ropf:211d Rscr:211b Sacute:15a ' +
  'Scaron:160 Scedil:15e Scirc:15c Sigma:3a3 *THORN:de TRADE:2122 Tau:3a4 Tcaron:164 Tcedil:162 ' +
  'Theta:398 Tstrok:166 *Uacute:da Ubreve:16c *Ucirc:db Udblac:170 *Ugrave:d9 Umacr:16a Uogon:172 ' +
  'Upsilon:3a5 Uring:16e Utilde:168 *Uuml:dc Verbar:2016 Vert:2016 Wcirc:174 Xi:39e *Yacute:dd ' +
  'Ycirc:176 Yuml:178 Zacute:179 Zcaron:17d Zdot:17b Zeta:396 *aacute:e1 abreve:103 *acirc:e2 ' +
  '*acute:b4 *aelig:e6 *agrave:e0 alpha:3b1 amacr:101 *amp:26 angst:c5 aogon:105 apos:27 *aring:e5 ' +
  '*atilde:e3 *auml:e4 backprime:2035 bdquo:201e beta:3b2 bprime:2035 *brvbar:a6 bull:2022 ' +
  'bullet:2022 cacute:107 ccaron:10d *ccedil:e7 ccirc:109 cdot:10b *cedil:b8 *cent:a2 centerdot:b7 ' +
  'chi:3c7 circ:2c6 circledR:ae *copy:a9 copysr:2117 *curren:a4 dagger:2020 dash:2010 dcaron:10f ' +
  'ddagger:2021 *deg:b0 delta:3b4 die:a8 div:f7 *divide:f7 dstrok:111 *eacute:e9 ecaron:11b ' +
  '*ecirc:ea edot:117 *egrave:e8 emacr:113 eng:14b eogon:119 epsi:3b5 epsilon:3b5 eta:3b7 *eth:f0 ' +
  '*euml:eb euro:20ac fnof:192 *frac12:bd *frac14:bc *frac34:be gamma:3b3 gbreve:11f gcirc:11d ' +
  'gdot:121 *gt:3e half:bd hcirc:125 hellip:2026 horbar:2015 hstrok:127 hyphen:2010 *iacute:ed ' +
  '*icirc:ee *iexcl:a1 *igrave:ec ijlig:133 imacr:12b imath:131 inodot:131 iogon:12f iota:3b9 ' +
  '*iquest:bf itilde:129 *iuml:ef jcirc:135 kappa:3ba kcedil:137 kgreen:138 lacute:13a lambda:3bb ' +
  '*laquo:ab lcaron:13e lcedil:13c ldquo:201c ldquor:201e lmidot:140 lsaquo:2039 lsquo:2018 ' +
  'lsquor:201a lstrok:142 *lt:3c *macr:af mdash:2014 *micro:b5 *middot:b7 mldr:2026 mu:3bc ' +
  'nacute:144 napos:149 *nbsp:a0 ncaron:148 ncedil:146 ndash:2013 nldr:2025 *not:ac *ntilde:f1 ' +
  'nu:3bd numero:2116 *oacute:f3 *ocirc:f4 odblac:151 oelig:153 *ograve:f2 ohm:3a9 omacr:14d ' +
  'omega:3c9 omicron:3bf *ordf:aa *ordm:ba *oslash:f8 *otilde:f5 *ouml:f6 *para:b6 permil:2030 ' +
  'pertenk:2031 phi:3c6 pi:3c0 *plusmn:b1 pm:b1 *pound:a3 prime:2032 primes:2119 psi:3c8 *quot:22 ' +
  'racute:155 *raquo:bb rationals:211a rcaron:159 rcedil:157 rdquo:201d rdquor:201d real:211c ' +
  'realine:211b realpart:211c reals:211d *reg:ae rho:3c1 rsaquo:203a rsquo:2019 rsquor:2019 rx:211e ' +
  'sacute:15b sbquo:201a scaron:161 scedil:15f scirc:15d *sect:a7 *shy:ad sigma:3c3 sigmaf:3c2 ' +
  'sigmav:3c2 strns:af *sup1:b9 *sup2:b2 *sup3:b3 *szlig:df tau:3c4 tcaron:165 tcedil:163 theta:3b8 ' +
  '*thorn:fe tilde:2dc *times:d7 tprime:2034 trade:2122 tstrok:167 *uacute:fa ubreve:16d *ucirc:fb ' +
  'udblac:171 *ugrave:f9 umacr:16b *uml:a8 uogon:173 upsi:3c5 upsilon:3c5 uring:16f utilde:169 ' +
  '*uuml:fc varsigma:3c2 wcirc:175 weierp:2118 wp:2118 xi:3be *yacute:fd ycirc:177 *yen:a5 *yuml:ff ' +
  'zacute:17a zcaron:17e zdot:17c zeta:3b6';

const NAMED = new Map<string, number>();
const SEMICOLONLESS = new Set<string>();
for (const entry of ENTITY_TABLE.split(' ')) {
  const sep = entry.lastIndexOf(':');
  const legacy = entry[0] === '*';
  const name = entry.slice(legacy ? 1 : 0, sep);
  NAMED.set(name, parseInt(entry.slice(sep + 1), 16));
  if (legacy) SEMICOLONLESS.add(name);
}

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

// One pass only: "&amp;lt;" must stay "&lt;" rather than collapse into "<".
// Unknown names ("AT&T", "R&D") are left exactly as they were.
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
      const code = NAMED.get(body);
      // Without the semicolon only the legacy names decode, as in HTML itself.
      if (code === undefined || (!semicolon && !SEMICOLONLESS.has(body))) return match;
      return String.fromCodePoint(code);
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
