/**
 * The HTML this library is allowed to emit — the whole of it.
 *
 * `src/rules/tables.ts` produces markup only from this set. It is exported as its
 * own entry point for consumers that must tell this library's output from a
 * page's text; the extension used to be one, escaping everything else before
 * rendering, until the escaping moved into the conversion itself, where the
 * origin of the text is still known.
 *
 * Kept dependency-free so importing it costs nothing.
 */

/** Emitted by the serializer itself, plus what it lifts out of a cell. */
export const FALLBACK_TAGS = ['table', 'caption', 'tr', 'th', 'td', 'pre', 'code'] as const;

/**
 * Inline tags the converter can emit anywhere, cell or not. `sub`, `sup` and `br`
 * have no Markdown spelling at all; `em`, `strong` and `del` are the fallback for
 * emphasis whose delimiters CommonMark's flanking rules would leave as text
 * (`core/src/utils/flanking.ts`).
 */
export const FALLBACK_INLINE_TAGS = [
  'sub', 'sup', 'br', 'em', 'strong', 'del', 'a', 'code',
] as const;

/** Of the above, the ones that never close. */
export const FALLBACK_VOID_TAGS = ['br'] as const;

/**
 * Every attribute the serializer writes onto a cell: a span, always numeric. Used
 * by `tables.ts` to check its own output before emitting it, so keep it tight —
 * widening it only weakens that assertion. A link's `href` does not pass through
 * here; `inline.ts` writes it, and checks the scheme itself.
 */
export const FALLBACK_ATTR_PATTERN = /^(?:\s+(?:colspan|rowspan)="\d{1,5}")*$/;
