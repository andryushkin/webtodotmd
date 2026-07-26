/**
 * The HTML the table fallback is allowed to emit — the whole of it.
 *
 * `src/rules/tables.ts` produces markup only from this set, and consumers that
 * have to tell this library's own output from a page's text (the extension's
 * preview escaper, for one) read the set from here rather than restating it. A
 * restatement drifts: when it does, a table missing one tag is not partially
 * escaped, it is escaped whole and shown to the user as markup.
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
export const FALLBACK_INLINE_TAGS = ['sub', 'sup', 'br', 'em', 'strong', 'del'] as const;

/** Of the above, the ones that never close. */
export const FALLBACK_VOID_TAGS = ['br'] as const;

/** Every attribute the serializer writes: a cell's span, always numeric. */
export const FALLBACK_ATTR_PATTERN = /^(?:\s+(?:colspan|rowspan)="\d{1,5}")*$/;
