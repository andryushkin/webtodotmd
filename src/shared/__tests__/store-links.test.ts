import { describe, test, expect } from 'bun:test';
import { CWS_REVIEWS_URL, getRatingUrl } from '../store-links';

describe('CWS_REVIEWS_URL', () => {
  test('points at the store review form for this item', () => {
    expect(CWS_REVIEWS_URL).toBe(
      'https://chromewebstore.google.com/detail/gkplehkbkofmdjhafgbclcmfcficoego/reviews',
    );
  });
});

describe('getRatingUrl', () => {
  // The regression this pins: low scores used to open a private form on the
  // developer site, which held zero entries while suppressing the public rating
  // volume the store's ranking heuristic reads.
  test.each([1, 2, 3, 4, 5])('a %i-star click opens the store review form', (stars) => {
    expect(getRatingUrl(stars)).toBe(CWS_REVIEWS_URL);
  });

  test('no score routes to the developer site', () => {
    for (const stars of [1, 2, 3, 4, 5]) {
      expect(getRatingUrl(stars)).not.toContain('2md.site');
    }
  });
});
