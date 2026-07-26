// Chrome Web Store links used by the rating widget in the side panel and in
// the options page. The slug in a store URL is decorative — Chrome resolves the
// item by id — and it goes stale on every rename, so link without it.
const EXTENSION_ID = 'gkplehkbkofmdjhafgbclcmfcficoego';

export const CWS_REVIEWS_URL = `https://chromewebstore.google.com/detail/${EXTENSION_ID}/reviews`;

/**
 * Where a click on the Nth star goes. Every star opens the store's own review
 * form, whatever the score: sending low ratings to a private form instead
 * suppressed the two inputs the store's ranking heuristic reads — rating volume
 * and review engagement — and collected nothing in return, since that form held
 * zero entries over the product's lifetime.
 *
 * The score is taken and deliberately ignored. Both call sites live in modules
 * a test cannot import (`sidepanel.ts` and `settings.ts` call Chrome APIs at
 * the top level), so this is the one place where branching on the score could
 * reappear and be caught.
 */
export function getRatingUrl(_stars: number): string {
  return CWS_REVIEWS_URL;
}
