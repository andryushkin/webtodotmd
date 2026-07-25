// Slicing by code units cuts surrogate pairs and ZWJ sequences in half. A lone
// surrogate reaches the front matter and the download name, and makes
// encodeURIComponent() throw URIError — which is how it broke the editmd://
// hand-off. Every truncation in the extension walks grapheme clusters instead.

let segmenter: Intl.Segmenter | undefined;

// `max` is a budget in UTF-16 code units, the unit the callers' limits are
// written in; a cluster that would exceed it is dropped whole.
export function truncateGraphemes(text: string, max: number): string {
  if (text.length <= max) return text;
  const clusters: Iterable<string> = typeof Intl.Segmenter === 'function'
    ? [...(segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })).segment(text)]
        .map(s => s.segment)
    : Array.from(text); // code points: still never splits a surrogate pair
  let out = '';
  for (const cluster of clusters) {
    if (out.length + cluster.length > max) break;
    out += cluster;
  }
  return out;
}
