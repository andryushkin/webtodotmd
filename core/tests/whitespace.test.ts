import { describe, it, expect, beforeAll } from 'vitest';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';
import { normalize } from '../src/core/normalizer.js';
import { extractFlankingWhitespace } from '../src/utils/flanking.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('whitespace phase 1 — DOM collapsing', () => {
  it('collapses multiple spaces', () => {
    expect(toMarkdown('<p>hello   world</p>')).toBe('hello world\n');
  });

  it('collapses newlines inside p into spaces', () => {
    expect(toMarkdown('<p>line1\nline2</p>')).toBe('line1 line2\n');
  });

  it('collapses tabs inside p into spaces', () => {
    expect(toMarkdown('<p>word1\t\tword2</p>')).toBe('word1 word2\n');
  });
});

describe('whitespace phase 3 — output normalization', () => {
  it('collapses 3+ newlines to 2', () => {
    expect(normalize('\n\n\ntext\n\n\n')).toBe('text\n');
  });

  it('removes trailing spaces per line', () => {
    expect(normalize('text   \nmore')).toBe('text\nmore\n');
  });

  it('adds final newline', () => {
    expect(normalize('text')).toBe('text\n');
  });

  it('converts &nbsp; (\\u00A0) to regular space', () => {
    expect(normalize('Цена:\u00A0100')).toBe('Цена: 100\n');
  });

  it('removes leading newlines', () => {
    expect(normalize('\n\ntext')).toBe('text\n');
  });
});

describe('whitespace phase 2 — flanking utility', () => {
  it('extracts leading and trailing whitespace', () => {
    expect(extractFlankingWhitespace(' hello ')).toEqual({
      leading: ' ',
      trimmed: 'hello',
      trailing: ' ',
    });
  });

  it('returns empty strings when no whitespace', () => {
    expect(extractFlankingWhitespace('text')).toEqual({
      leading: '',
      trimmed: 'text',
      trailing: '',
    });
  });

  it('handles only whitespace', () => {
    const result = extractFlankingWhitespace('   ');
    expect(result.trimmed).toBe('');
  });

  it('handles empty string', () => {
    expect(extractFlankingWhitespace('')).toEqual({
      leading: '',
      trimmed: '',
      trailing: '',
    });
  });
});
