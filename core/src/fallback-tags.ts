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
 * Inline tags the converter can emit anywhere, cell or not. `br` has no Markdown
 * spelling in an HTML block, where the hard break's trailing backslash is only a
 * backslash; `em`, `strong` and `del` are the fallback for emphasis whose
 * delimiters CommonMark's flanking rules would leave as text
 * (`core/src/utils/flanking.ts`); `a` and `code` are what the link and code-span
 * rules write where their delimiters would not be parsed either.
 *
 * `sub` and `sup` were here while they wrote their own tags and are not any more:
 * a raised or lowered run shifts into Unicode instead (`H₂O`, `x²`), so no rule
 * emits either tag (`core/src/rules/inline.ts`). Naming a tag this library never
 * writes is not a harmless surplus — a consumer uses this list to tell the
 * library's output from the page's, so it would keep a `<sup>` the page itself
 * displayed alive rather than escaping it back into the characters a reader saw.
 */
export const FALLBACK_INLINE_TAGS = ['br', 'em', 'strong', 'del', 'a', 'code'] as const;

/** Of the above, the ones that never close. */
export const FALLBACK_VOID_TAGS = ['br'] as const;

/**
 * Every attribute the serializer writes onto a cell: a span, always numeric. Used
 * by `tables.ts` to check its own output before emitting it, so keep it tight —
 * widening it only weakens that assertion. A link's `href` does not pass through
 * here; `inline.ts` writes it, and checks the scheme itself.
 */
export const FALLBACK_ATTR_PATTERN = /^(?:\s+(?:colspan|rowspan)="\d{1,5}")*$/;
