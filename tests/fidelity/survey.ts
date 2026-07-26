// Phase 0 measurement: run the oracle over generated documents and report the
// distinct defect classes, not the individual seeds.
//
//   bun tests/fidelity/survey.ts [seedCount]
//
// This is a survey, not a gate. It answers the question that made the plan
// necessary — how large is the tail — so the decision about phase 3 rests on a
// number instead of on how many defects the last review happened to notice.
import { installDOMAdapter, roundTrip, type RoundTrip } from './oracle';
import { generate, renderDoc, shrink, type Doc } from './generator';

installDOMAdapter();

function check(doc: Doc): RoundTrip | null {
  const html = renderDoc(doc);
  try {
    const trip = roundTrip(html);
    return trip.faithful ? null : trip;
  } catch (error) {
    // A crash is a failure too, and one worth telling apart in the report.
    return {
      markdown: `<threw> ${(error as Error).message}`,
      rendered: '',
      expected: '',
      actual: '',
      faithful: false,
    };
  }
}

interface DefectClass {
  html: string;
  markdown: string;
  expected: string;
  actual: string;
  seeds: number[];
}

// Which of the three axes of non-locality a minimal case belongs to. The point of
// the survey is the shape of the tail, not a list of 67 examples: a defect that
// only exists because the serializer ignores CommonMark's flanking rules is a
// different repair from one where two text nodes concatenated into markup.
const AXES = [
  // Checked first: inside the HTML table fallback Markdown is not parsed at all,
  // so `**x**` in a cell reaches the reader as asterisks. That is the target-
  // language axis, not the flanking one, and it needs a different repair.
  ['html-fallback', (html: string, c: DefectClass) => c.markdown.startsWith('<table')],
  ['link-text', (html: string) => html.includes('<a ')],
  [
    'emphasis-flanking',
    (html: string) => /<(i|em|b|strong|sub|code)>/.test(html),
  ],
  [
    'block-start',
    (_html: string, c: DefectClass) => /^\s*(#{1,6}|[-+*]|\d+\.|>|-{3,}|={2,})/.test(c.expected),
  ],
  ['concatenation', (html: string) => (html.match(/<\/(span|i|em|b|strong|sub|code|a)>/g) ?? []).length > 0],
] as const;

function axisOf(c: DefectClass): string {
  for (const [name, test] of AXES) if (test(c.html, c)) return name;
  return 'other';
}

function survey(seedCount: number): Map<string, DefectClass> {
  const classes = new Map<string, DefectClass>();

  for (let seed = 0; seed < seedCount; seed++) {
    const doc = generate(seed);
    if (!check(doc)) continue;

    const minimal = shrink(doc, (candidate) => check(candidate) !== null);
    const html = renderDoc(minimal);
    const trip = check(minimal)!;

    const existing = classes.get(html);
    if (existing) existing.seeds.push(seed);
    else
      classes.set(html, {
        html,
        markdown: trip.markdown,
        expected: trip.expected,
        actual: trip.actual,
        seeds: [seed],
      });
  }
  return classes;
}

const seedCount = Number(process.argv[2] ?? 500);

{
  const classes = survey(seedCount);
  const failing = [...classes.values()].reduce((n, c) => n + c.seeds.length, 0);

  console.log(`\n${'='.repeat(78)}`);
  console.log(`${failing}/${seedCount} seeds failed, ${classes.size} distinct classes`);
  console.log('='.repeat(78));

  const byAxis = new Map<string, DefectClass[]>();
  for (const c of classes.values()) {
    const axis = axisOf(c);
    byAxis.set(axis, [...(byAxis.get(axis) ?? []), c]);
  }

  console.log('\nby axis:');
  for (const [axis, list] of [...byAxis.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const seeds = list.reduce((n, c) => n + c.seeds.length, 0);
    console.log(`  ${axis.padEnd(20)} ${String(list.length).padStart(3)} classes, ${seeds} seeds`);
  }

  for (const [axis, list] of [...byAxis.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n--- ${axis} ---`);
    for (const c of list.sort((a, b) => b.seeds.length - a.seeds.length).slice(0, 6)) {
      console.log(`\n[${c.seeds.length} seeds] ${c.html}`);
      console.log(`  md:       ${JSON.stringify(c.markdown)}`);
      console.log(`  expected: ${JSON.stringify(c.expected)}`);
      console.log(`  actual:   ${JSON.stringify(c.actual)}`);
    }
    if (list.length > 6) console.log(`\n  … and ${list.length - 6} more classes on this axis`);
  }
}
