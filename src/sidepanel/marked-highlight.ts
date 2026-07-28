/**
 * `==highlight==` for the preview.
 *
 * The core writes this marker because the file's destination understands it, and
 * `marked` does not: without the extension the panel showed a reader the four
 * `=` characters it had just put in their file, which reads as a defect in the
 * capture rather than as a marker the previewer lacks.
 *
 * Its own module because `sidepanel.ts` cannot be imported by a test — it touches
 * the DOM and Chrome APIs at the top level.
 */

interface HighlightToken {
  type: 'highlight';
  raw: string;
  text: string;
  tokens: unknown[];
}

/**
 * A pair, not a run: `==` opens only where a non-space follows and closes only
 * where a non-space precedes, which is what keeps `x\=\=y and C\=\=C++` — the
 * escaped comparisons the core writes — from pairing if a backslash is ever lost,
 * and what stops a lone `==` in the middle of a sentence eating the rest of the
 * line looking for a partner.
 */
const HIGHLIGHT = /^==(?=[^\s=])([\s\S]*?[^\s=])==/;

export const markedHighlight = {
  name: 'highlight',
  level: 'inline' as const,
  // `marked` calls this to find where the next token of this kind might begin, so
  // it can skip the text in front of it in one step rather than testing every
  // character against every extension.
  start(src: string): number | undefined {
    const at = src.indexOf('==');
    return at === -1 ? undefined : at;
  },
  tokenizer(this: { lexer: { inlineTokens: (s: string) => unknown[] } }, src: string) {
    const match = HIGHLIGHT.exec(src);
    if (!match) return undefined;
    const text = match[1] ?? '';
    return {
      type: 'highlight',
      raw: match[0],
      text,
      // The content is markdown like any other inline content: a page can mark a
      // phrase that holds a link or a bolded word, and dropping to plain text
      // would show that markup as characters.
      tokens: this.lexer.inlineTokens(text),
    } satisfies HighlightToken;
  },
  renderer(
    this: { parser: { parseInline: (t: unknown[]) => string } },
    token: HighlightToken,
  ): string {
    return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;
  },
};
