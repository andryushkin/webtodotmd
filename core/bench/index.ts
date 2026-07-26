import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

setDOMAdapter((html) => parseHTML(html).document as unknown as Document);

function generateSampleHTML(targetBytes: number): string {
  const block = `
<article>
  <h2>Section Title</h2>
  <p>This is a paragraph with <strong>bold text</strong>, <em>italic text</em>, and a
  <a href="https://example.com">link to example</a>. It also contains
  <code>inline code</code> snippets.</p>
  <ul>
    <li>First item with some content</li>
    <li>Second item with <strong>emphasis</strong></li>
    <li>Third item with a <a href="https://example.com/page">link</a></li>
  </ul>
  <pre><code class="language-typescript">function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
const msg = greet('World');
console.log(msg);</code></pre>
  <blockquote><p>A notable quote from someone important.</p></blockquote>
</article>`;

  let html = '';
  while (html.length < targetBytes) {
    html += block;
  }
  return html;
}

const html = generateSampleHTML(10_000);
const RUNS = 500;

// Warm up
for (let i = 0; i < 10; i++) toMarkdown(html);

const start = performance.now();
for (let i = 0; i < RUNS; i++) {
  toMarkdown(html);
}
const elapsed = (performance.now() - start) / RUNS;

console.log(`Input size:     ${html.length} bytes`);
console.log(`Runs:           ${RUNS}`);
console.log(`Avg per run:    ${elapsed.toFixed(3)} ms`);

const TARGET_MS = 30;
if (elapsed <= TARGET_MS) {
  console.log(`Result:         ✓ within ${TARGET_MS} ms target`);
} else {
  console.warn(`Result:         ⚠ exceeds ${TARGET_MS} ms target (Bun+linkedom)`);
}
