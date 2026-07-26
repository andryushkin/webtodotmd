import { describe, it, expect, beforeAll } from 'vitest';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('smoke', () => {
  it('returns a string', () => {
    const md = toMarkdown('<p>test</p>');
    expect(typeof md).toBe('string');
  });
});
