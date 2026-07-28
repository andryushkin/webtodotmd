/**
 * The vendored libraries, declared rather than typed.
 *
 * `vendor/` holds published builds copied into the repository — there is no
 * `node_modules` at build time and no `@types` package to resolve against, so
 * every import of one was an implicit `any` that `tsc --noEmit` refused. That
 * refusal was the whole of what kept the type check out of the audit, and with
 * it went the class of defect the tests cannot see: a `NodeList` iterated where
 * the DOM lib does not say it is iterable, an object literal missing a field its
 * own type requires.
 *
 * Declared as `any` deliberately and not modelled further. A hand-written shape
 * for marked or KaTeX would be a second definition of somebody else's API, free
 * to drift from the build sitting beside it — and the value here is not in
 * checking these four calls, it is in checking the thousands of lines that stop
 * being checked when one import fails to resolve.
 */

declare module '*/vendor/marked.esm.js' {
  export const marked: any;
}

declare module '*/vendor/purify.esm.mjs' {
  const DOMPurify: any;
  export default DOMPurify;
}

declare module '*/vendor/katex.mjs' {
  const katex: any;
  export default katex;
}

declare module '*/vendor/mathml-to-latex.mjs' {
  export const MathMLToLaTeX: any;
}
