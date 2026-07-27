// Drives real pages through the capture path and writes down what came back.
//
// One Chrome, one context per page: goto → settle → evaluate the harness bundle
// over CDP — which no page CSP can refuse, the way an injected <script> can be —
// → select → convert → save. Nothing here judges the result; `analyze.ts` does
// that against `visible.txt`, so a capture can be re-judged without re-fetching
// seventeen sites.
//
//   bun add -d playwright          # once; the repository does not depend on it
//   bun build tests/real-pages/harness.ts --target=browser --format=iife \
//     --outfile=/tmp/harness.js
//   bun tests/real-pages/run.ts tests/real-pages/targets.json /tmp/harness.js out/
import { chromium, type Browser, type Page } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Target {
  id: string;
  url: string;
  /** What this page is here to catch. */
  note: string;
  /** Wait for this before capturing — a renderer that runs after load. */
  waitFor?: string;
  /** Capture the contents of this element instead of the whole body. */
  selector?: string;
  /** Extra settle time in ms for pages that keep working after load. */
  settle?: number;
}

interface PageCapture {
  md: string;
  visibleText: string;
  selectionText: string;
  componentTexts: string[];
  title: string;
  url: string;
  ms: number;
  error?: string;
}

async function capturePage(browser: Browser, target: Target, harness: string, out: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const page: Page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  try {
    await page.goto(target.url, { waitUntil: 'load', timeout: 60_000 });
    if (target.waitFor) await page.waitForSelector(target.waitFor, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(target.settle ?? 2500);
    await page.evaluate(harness);
    const result = (await page.evaluate(
      ([selector]) => window.__s2md.capture(selector as string | null),
      [target.selector ?? null],
    )) as PageCapture;

    const dir = join(out, target.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'out.md'), result.md);
    await writeFile(join(dir, 'visible.txt'), result.visibleText);
    await writeFile(join(dir, 'selection.txt'), result.selectionText);
    await writeFile(join(dir, 'components.txt'), result.componentTexts.join('\n'));
    await writeFile(
      join(dir, 'meta.json'),
      JSON.stringify(
        {
          id: target.id, note: target.note, url: result.url, title: result.title,
          ms: Math.round(result.ms), error: result.error ?? null,
          mdChars: result.md.length, visibleChars: result.visibleText.length,
          consoleErrors: consoleErrors.slice(0, 5),
        },
        null,
        2,
      ),
    );
    await page.screenshot({ path: join(dir, 'above-the-fold.png') }).catch(() => {});
    return { id: target.id, ok: !result.error, ms: Math.round(result.ms), mdChars: result.md.length, error: result.error?.split('\n')[0] };
  } catch (err) {
    return { id: target.id, ok: false, ms: 0, mdChars: 0, error: String(err).slice(0, 200) };
  } finally {
    await context.close();
  }
}

const [targetsFile, harnessFile, out, ...only] = process.argv.slice(2);
if (!targetsFile || !harnessFile || !out) {
  console.error('usage: bun run.ts <targets.json> <harness.js> <out-dir> [id ...]');
  process.exit(1);
}
const wanted = new Set(only);
const all: Target[] = JSON.parse(await readFile(targetsFile, 'utf8'));
const targets = wanted.size ? all.filter((t) => wanted.has(t.id)) : all;

const harness = await readFile(harnessFile, 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true });

const results: Awaited<ReturnType<typeof capturePage>>[] = [];
const CONCURRENCY = 3;
for (let i = 0; i < targets.length; i += CONCURRENCY) {
  const batch = targets.slice(i, i + CONCURRENCY);
  for (const r of await Promise.all(batch.map((t) => capturePage(browser, t, harness, out)))) {
    results.push(r);
    console.log(
      `${r.ok ? 'ok  ' : 'FAIL'} ${r.id.padEnd(30)} ${String(r.ms).padStart(5)}ms  md=${r.mdChars}${r.error ? '  ' + r.error : ''}`,
    );
  }
}

await browser.close();
await writeFile(join(out, 'run.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} captured → ${out}`);
