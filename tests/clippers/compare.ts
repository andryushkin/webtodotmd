// Scores two clips of the same page against a fixed list of checks.
//
// Both files come from ⌘A on docs/test_conversion_spec_page_compact.html — one
// made by this extension, one by another clipper. Every check below is a yes/no
// question about the resulting Markdown, answerable by looking at the file and
// nothing else, so the score can be re-derived by anyone holding the two clips.
//
// The list is the argument. It was written from the *page's* cases, not from
// either file's behaviour, and it is published for that reason: a percentage
// whose checks were chosen after seeing the answers is a percentage about the
// person who chose them. Adding a check is fine; adding one because it flatters
// a side is not.
//
//   bun store/research/compare-clippers.ts inbox/webtomd.md inbox/obsidian.md
//
// Output goes nowhere but stdout; nothing here is part of the build.

type Check = {
  /** What the page asked for, in the reader's terms. */
  readonly asks: string;
  /** True when the clip did what the page asked. */
  readonly holds: (md: string) => boolean;
};

/** Text the reader never saw must not reach the file. */
const HIDDEN_PAYLOADS = [
  'HIDDEN_ATTRIBUTE', 'DISPLAY_NONE', 'VISIBILITY_HIDDEN', 'OPACITY_ZERO',
  'SCREEN_READER_ONLY', 'CLIP_PATH', 'OFFSCREEN', 'TEXT_INDENT',
  'STANDBY_OVERLAY', 'IFRAME_PAYLOAD', 'OBJECT_PAYLOAD', 'SVG_PAYLOAD',
  'FOLDED_BODY', 'FOLDED_ITEM', 'HIDDEN_FORMULA', 'HIDDEN_PARENT_TEXT',
  'HIDDEN_SIBLING', 'WRONG_PROPERTY_TRANSITION',
] as const;

// A payload may arrive escaped (`HIDDEN\_ATTRIBUTE`), which is still the reader
// meeting text they never saw.
const absent = (md: string, needle: string) =>
  !new RegExp(needle.replaceAll('_', '\\\\?_')).test(md);

const CHECKS: readonly Check[] = [
  // One check, not eighteen. The page hides text in eighteen ways, and scoring
  // each separately would put half the weight of the whole list on a single
  // question — a percentage engineered rather than measured. A clipper that
  // keeps one hidden payload has already broken the promise; the count of which
  // ones is diagnosis, printed below, not score.
  {
    asks: `no text hidden from the reader reaches the file (${HIDDEN_PAYLOADS.length} ways on the page)`,
    holds: (md: string) => HIDDEN_PAYLOADS.every((name) => absent(md, name)),
  },
  {
    asks: 'visible text behind a hidden parent survives',
    holds: (md) => md.includes('Visible descendant survives'),
  },
  {
    asks: 'a javascript: or data:text/html url is not carried into the file',
    holds: (md) => !/javascript:|data:text\/html/.test(md),
  },
  {
    asks: 'no raw iframe, svg or object tag in the output',
    holds: (md) => !/<(iframe|svg|object)\b/.test(md),
  },
  {
    asks: 'a heading stated by role="heading" is a heading',
    holds: (md) => /^#{2,6} Section stated by role$/m.test(md),
  },
  {
    asks: 'aria-level is the heading rank',
    holds: (md) => /^#{4,6} Subsection stated by role$/m.test(md),
  },
  {
    asks: 'a role heading with no level reads as level two',
    holds: (md) => /^## Level not stated, read as two$/m.test(md),
  },
  {
    asks: 'a level past six clamps at six',
    holds: (md) => /^###### Level nine is clamped to six$/m.test(md),
  },
  {
    asks: 'text inside an open shadow root is captured',
    holds: (md) => md.includes('shadow root'),
  },
  {
    asks: 'a task list arrives as a task list',
    holds: (md) => /^\s*[-*] \[[ xX]\]/m.test(md),
  },
  {
    asks: 'a fenced block keeps its language label',
    holds: (md) => (md.match(/^```\w+/gm) ?? []).length >= 10,
  },
  {
    asks: 'a pipe inside a cell is escaped, not dropped',
    holds: (md) => /Alpha \\\| Beta/.test(md),
  },
  {
    asks: 'a table with merged cells stays one table',
    holds: (md) => /<table[\s\S]{0,400}colspan/.test(md),
  },
  {
    asks: 'a table inside a cell does not collapse into run-together words',
    holds: (md) => !/PackageCompatibilityParser/.test(md),
  },
  {
    asks: 'a MathJax v2 formula survives',
    holds: (md) => /MathJax v2:\s*\$/.test(md),
  },
  {
    asks: 'raised text is written as text, not left as a sup tag',
    holds: (md) => !/<su[pb]\b/.test(md),
  },
  {
    asks: 'an image path is absolute, so it resolves outside the page',
    holds: (md) => !/!\[[^\]]*\]\((?!https?:|data:)[^)]+\)/.test(md),
  },
  {
    asks: 'a lazy image resolves to the real source, not the placeholder',
    holds: (md) => !/!\[News photograph\]\(data:/.test(md),
  },
  {
    asks: 'a highlight is one mark, not two',
    holds: (md) => md.includes('==marked phrase==') && !md.includes('===='),
  },
  {
    asks: "the page's own == is escaped so it paints nothing",
    holds: (md) => /x\\=\\=y/.test(md),
  },
  {
    asks: 'front matter records where the note came from',
    holds: (md) => /^---[\s\S]{0,400}^source:/m.test(md),
  },
];

const files = process.argv.slice(2);
if (files.length < 2) {
  console.error('usage: bun compare-clippers.ts <ours.md> <theirs.md> …');
  process.exit(1);
}

const scores = await Promise.all(files.map(async (path) => {
  const md = await Bun.file(path).text();
  const held = CHECKS.filter((check) => check.holds(md));
  return { path, held: held.length, failed: CHECKS.filter((c) => !c.holds(md)) };
}));

const width = Math.max(...scores.map((s) => s.path.length));
for (const { path, held } of scores) {
  const percent = ((held / CHECKS.length) * 100).toFixed(0);
  console.log(`${path.padEnd(width)}  ${String(held).padStart(2)}/${CHECKS.length}  ${percent.padStart(3)}%`);
}

for (const { path, failed } of scores) {
  if (failed.length === 0) continue;
  console.log(`\n${path} misses:`);
  for (const check of failed) console.log(`  · ${check.asks}`);
}
