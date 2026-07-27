import { describe, test, expect } from 'bun:test';
import { joinFragments } from '../join-fragments.ts';

// What the converter really hands over: `normalize()` ends every document with a
// single newline, so a test that writes fragments without one is not testing the
// join this function exists for.
const converted = (text: string): string => `${text}\n`;

describe('joining captured fragments', () => {
  test('one blank line between fragments, not two', () => {
    expect(joinFragments([converted('First paragraph.'), converted('Second paragraph.')])).toBe(
      'First paragraph.\n\nSecond paragraph.\n',
    );
  });

  test('a fragment of several blocks keeps its own blank lines', () => {
    expect(
      joinFragments([converted('## Heading\n\nBody text.'), converted('- one\n- two')]),
    ).toBe('## Heading\n\nBody text.\n\n- one\n- two\n');
  });

  test('a single fragment comes back as it was', () => {
    expect(joinFragments([converted('Only this.')])).toBe('Only this.\n');
  });

  test('an empty fragment adds no gap of its own', () => {
    expect(joinFragments([converted('First.'), '\n', converted('Third.')])).toBe(
      'First.\n\nThird.\n',
    );
  });

  test('nothing captured is the empty string, not a newline', () => {
    expect(joinFragments([])).toBe('');
    expect(joinFragments(['\n', '   \n'])).toBe('');
  });

  test('a fenced block at a fragment edge keeps its fence', () => {
    expect(joinFragments([converted('```js\nconst x = 1;\n```'), converted('After.')])).toBe(
      '```js\nconst x = 1;\n```\n\nAfter.\n',
    );
  });
});
