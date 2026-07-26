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

/** Emitted by the converter inside a cell's Markdown. */
export const FALLBACK_INLINE_TAGS = ['sub', 'sup', 'br'] as const;

/** Of the above, the ones that never close. */
export const FALLBACK_VOID_TAGS = ['br'] as const;

/** Every attribute the serializer writes: a cell's span, always numeric. */
export const FALLBACK_ATTR_PATTERN = /^(?:\s+(?:colspan|rowspan)="\d{1,5}")*$/;
