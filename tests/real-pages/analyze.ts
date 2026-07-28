// Reads a real-page capture and asks the fidelity question of it:
//
//   what the browser said the selection covered  ==  what the file renders to
//
// The generated survey asks the same thing of documents this project wrote. This
// asks it of markup nobody here wrote, which is the only way to find the cases
// the generator does not know to generate. The comparison is word by word, run
// through `git diff`, because a page is tens of thousands of words and the
// interesting part is the handful that moved.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installDOMAdapter, normalizeVisible, render, visibleText } from '../fidelity/oracle';

installDOMAdapter();

export interface PageReport {
  id: string;
  note: string;
  /** Every component's text on the page, run together for a substring test. */
  components: string;
  pageWords: number;
  fileWords: number;
  lost: number;
  added: number;
  hunks: Hunk[];
}

export interface Hunk {
  /** Words the page showed and the file does not. */
  lost: string[];
  /** Words the file carries and the page never showed. */
  added: string[];
  /** The words just before the change, for reading it in place. */
  before: string[];
}

/**
 * What kind of difference this is — the whole point of running the oracle over
 * pages nobody here wrote is that most of what it reports is expected, and the
 * expected kinds have to be nameable before the rest can be read.
 */
export type Kind = 'maths' | 'weld' | 'split' | 'markup-shown' | 'shadow' | 'lost' | 'added' | 'moved';

const MARKUP_RE = /^(\[|!\[|\]\(|https?:\/\/|\$|```|\|)|\]\(/;

export function classify(hunk: Hunk, components = ''): Kind {
  const lost = hunk.lost.join(' ');
  const added = hunk.added.join(' ');
  // A formula leaves the page as glyphs and comes back as LaTeX: the conversion
  // the product is for, not a difference in what it says.
  if (/\$/.test(added)) return 'maths';
  const lostChars = lost.replace(/\s/g, '');
  const addedChars = added.replace(/\s/g, '');
  // The same characters, differently spaced: a blank the file lost welded two
  // words together, or one it invented split one word in two.
  if (lostChars === addedChars && lostChars !== '') {
    return hunk.added.length < hunk.lost.length ? 'weld' : 'split';
  }
  // A component draws its text inside a shadow tree, which the page text cannot
  // reach at all (`harness.ts`), so the file carrying it is right and the
  // comparison is what is short.
  if (addedChars !== '' && components.includes(addedChars)) return 'shadow';
  // Markdown the reader is shown as characters — a link that failed to parse, a
  // fence, a pipe: the file says it, the render still prints it.
  if (MARKUP_RE.test(added)) return 'markup-shown';
  if (lostChars !== '' && addedChars !== '') return 'moved';
  return lostChars !== '' ? 'lost' : 'added';
}

function words(text: string): string[] {
  return text.split(' ').filter((w) => w !== '');
}

async function wordDiff(expected: string[], actual: string[], scratch: string): Promise<Hunk[]> {
  const a = join(scratch, 'page.words');
  const b = join(scratch, 'file.words');
  await writeFile(a, expected.join('\n') + '\n');
  await writeFile(b, actual.join('\n') + '\n');
  const proc = Bun.spawnSync(['git', 'diff', '--no-index', '--unified=3', '--no-color', '--', a, b]);
  const out = new TextDecoder().decode(proc.stdout);

  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  let context: string[] = [];
  for (const line of out.split('\n')) {
    if (line.startsWith('@@')) {
      if (current) hunks.push(current);
      current = null;
      context = [];
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) continue;
    if (line.startsWith(' ')) {
      if (current) { hunks.push(current); current = null; }
      context.push(line.slice(1));
      if (context.length > 6) context.shift();
      continue;
    }
    if (line.startsWith('-') || line.startsWith('+')) {
      current ??= { lost: [], added: [], before: [...context] };
      (line.startsWith('-') ? current.lost : current.added).push(line.slice(1));
    }
  }
  if (current) hunks.push(current);
  return hunks;
}

export async function analyze(dir: string, id: string, scratch: string): Promise<PageReport> {
  const [md, pageText, metaRaw, componentsRaw] = await Promise.all([
    readFile(join(dir, id, 'out.md'), 'utf8'),
    readFile(join(dir, id, 'visible.txt'), 'utf8'),
    readFile(join(dir, id, 'meta.json'), 'utf8'),
    readFile(join(dir, id, 'components.txt'), 'utf8').catch(() => ''),
  ]);
  const meta = JSON.parse(metaRaw) as { note: string };
  const expected = words(normalizeVisible(pageText));
  const actual = words(visibleText(render(md)));
  const hunks = await wordDiff(expected, actual, scratch);
  return {
    id,
    note: meta.note,
    components: normalizeVisible(componentsRaw).replace(/\s/g, ''),
    pageWords: expected.length,
    fileWords: actual.length,
    lost: hunks.reduce((n, h) => n + h.lost.length, 0),
    added: hunks.reduce((n, h) => n + h.added.length, 0),
    hunks,
  };
}

function describe(hunk: Hunk, width = 14): string {
  const cut = (list: string[]) =>
    list.length > width ? `${list.slice(0, width).join(' ')} … (+${list.length - width})` : list.join(' ');
  const lines: string[] = [];
  if (hunk.before.length) lines.push(`  …${hunk.before.slice(-6).join(' ')}`);
  if (hunk.lost.length) lines.push(`  − ${cut(hunk.lost)}`);
  if (hunk.added.length) lines.push(`  + ${cut(hunk.added)}`);
  return lines.join('\n');
}

if (import.meta.main) {
  // Relative to the repository, not to whoever wrote it: the default used to be
  // one machine's absolute path, which the public-repo gate reads as internal
  // material and which nobody else could run.
  const dir = process.argv[2] ?? 'store/research/real-pages';
  const scratch = process.argv[3] ?? '/private/tmp';
  const only = new Set(process.argv.slice(4));
  const ids = (await readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && (only.size === 0 || only.has(e.name)))
    .map((e) => e.name)
    .sort();

  const reports: PageReport[] = [];
  for (const id of ids) {
    const report = await analyze(dir, id, scratch);
    reports.push(report);
    const body = report.hunks.map((h) => describe(h, 40)).join('\n\n');
    await writeFile(join(dir, id, 'diff.txt'), body + '\n');
  }

  const KINDS: Kind[] = ['maths', 'shadow', 'weld', 'split', 'markup-shown', 'moved', 'lost', 'added'];
  const tally = (report: PageReport) => {
    const counts = new Map<Kind, number>();
    for (const h of report.hunks) {
      const kind = classify(h, report.components);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return counts;
  };

  console.log(
    'page                          words  ' + KINDS.map((k) => k.padStart(13 - 1)).join(' '),
  );
  const totals = new Map<Kind, number>();
  for (const r of reports) {
    const counts = tally(r);
    for (const k of KINDS) totals.set(k, (totals.get(k) ?? 0) + (counts.get(k) ?? 0));
    console.log(
      `${r.id.padEnd(28)} ${String(r.pageWords).padStart(6)}  ` +
        KINDS.map((k) => String(counts.get(k) ?? 0).padStart(12)).join(' '),
    );
  }
  console.log(
    `${'TOTAL'.padEnd(28)} ${String(reports.reduce((n, r) => n + r.pageWords, 0)).padStart(6)}  ` +
      KINDS.map((k) => String(totals.get(k) ?? 0).padStart(12)).join(' '),
  );

  const wanted = new Set<Kind>((process.env.KINDS?.split(',') as Kind[]) ?? ['weld', 'split', 'markup-shown', 'moved', 'lost', 'added']);
  const perPage = Number(process.env.SHOW ?? 6);
  console.log('\n--- differences by kind ---');
  for (const r of reports) {
    const worst = r.hunks
      .filter((h) => wanted.has(classify(h, r.components)))
      .sort((a, b) => b.lost.length + b.added.length - a.lost.length - a.added.length)
      .slice(0, perPage);
    if (worst.length === 0) continue;
    console.log(`\n== ${r.id} — ${r.note}`);
    for (const h of worst) console.log(`[${classify(h, r.components)}]\n${describe(h)}`);
  }
}
