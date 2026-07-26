import type { DOMAdapterFn, MarkItDownOptions } from './types.js';
import { setDOMAdapter as _setDOMAdapter, getAdapter } from './core/adapter.js';
import { sanitize } from './core/sanitizer.js';
import { convertChildren } from './core/parser.js';
import { normalize } from './core/normalizer.js';
import { collectFootnoteDefs, buildFootnotesSection } from './core/footnotes.js';

export type { DOMAdapterFn, Rule, MarkItDownOptions } from './types.js';

export function toMarkdown(input: string | Node, options: MarkItDownOptions = {}): string {
  let root: Element | Document;
  if (typeof input === 'string') {
    const adapter = options.domAdapter ?? getAdapter();
    root = adapter(input);
  } else {
    root = input as Element;
  }

  const footnoteDefs = options.footnotes ? collectFootnoteDefs(root, options) : undefined;

  sanitize(root, 'full', options.math);
  const raw = convertChildren(root as Element, options);
  let result = normalize(raw);

  if (footnoteDefs && footnoteDefs.size > 0) {
    result = result.trimEnd() + '\n\n' + buildFootnotesSection(footnoteDefs);
  }
  return result;
}

export function setDOMAdapter(adapter: DOMAdapterFn): void {
  _setDOMAdapter(adapter);
}
