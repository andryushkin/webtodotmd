// Chrome Web Store links used by the rating widget in the side panel and in
// the options page. The slug in a store URL is decorative — Chrome resolves the
// item by id — and it goes stale on every rename, so link without it.
const EXTENSION_ID = 'gkplehkbkofmdjhafgbclcmfcficoego';

// Every star opens the store's own review form, whatever the score. Sending low
// ratings to a private form instead suppressed the two inputs the store's
// ranking heuristic reads — rating volume and review engagement — and collected
// nothing in return: the form held zero entries over the product's lifetime.
export const CWS_REVIEWS_URL = `https://chromewebstore.google.com/detail/${EXTENSION_ID}/reviews`;
