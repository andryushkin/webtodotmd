# Welcome and changelog pages — dotmd.tools

The contract between the extension and the site it opens after install and
update. The extension side is implemented; this file is what the site has to
honor.

**One domain from 1.4.10, two for as long as older installs live.** The pages
are authored in `~/Server/dotmdtools` as
`content/html-to-md/{welcome,changelog}/<locale>.md` and built to
`/<locale>/html-to-md/…` — the locale comes *first*, and all 52 answer 200
(measured 2026-07-29). Every build up to 1.4.9 asks `2md.site/<locale>/welcome`
instead, and those installs do not update their compiled-in URL, so that site
has to keep answering — either with its own copy (`src/pages/{Welcome,
Changelog}.tsx` in `~/Server/2mdsite`) or with a redirect here. The product's own
page, `dotmd.tools/html-to-md`, is English-only and carries no locale prefix.

**Static assets have no fallback routing.** A locale the site did not build is a
404, not English — unlike the old Worker, which resolved an unknown locale at
request time. `locales.all` in the site's `site.yaml` must therefore stay a
superset of `SITE_LOCALES` in `src/shared/site-links.ts`; a test in
`src/shared/__tests__/site-links.test.ts` asserts every locale the extension can
ask for is one the site builds. Twenty of the 52 are translated; the rest are
built from the English source, so they are pages rather than errors.

## URLs

| Event | URL |
| --- | --- |
| First install | `https://dotmd.tools/<locale>/html-to-md/welcome` |
| Extension update | `https://dotmd.tools/<locale>/html-to-md/changelog` |
| Removal | `https://dotmd.tools/<locale>/html-to-md/uninstall` |

The removal page is registered with `chrome.runtime.setUninstallURL` on every
worker start and again whenever the interface language changes — it has to be
in place *before* the removal, and by the time Chrome opens it there is no
extension left to ask which language to use. The language chosen in settings
wins over the browser's; `auto` falls back to the browser's.

Updates only open a page when `SHOW_CHANGELOG_ON_UPDATE` is `true` in
`src/background/service-worker.ts`; it is off by default and turned on by hand
for meaningful releases.

## Locales

`siteLocale()` in `src/shared/site-links.ts` resolves a language tag against this
set — one module, because the worker and the options page both need it and a
second spelling would drift with nothing to show for it but readers sent to the
wrong language. The worker passes `chrome.i18n.getUILanguage()`; the options page
passes the language the reader chose in it, which is the more specific answer:

```
en, de, fr, es, es-419, it, nl, sv, da, no, fi, ar, he, fa, id, ru,
pt-PT, pt-BR, ja, fil, vi, tr, th, ko, bg, cs, hr, pl, ro, sk, sl, sr,
uk, zh-CN, zh-TW, el, hu, hi, ms, et, lt, lv, ca, bn, gu, kn, ml, mr,
ta, te, am, sw
```

Resolution order: exact match on the normalized tag (`pt_PT` → `pt-PT`), then
the special cases below, then the base language, then `en`.

| Chrome UI language | URL locale |
| --- | --- |
| `en-US`, `en-GB` | `en` |
| `pt-PT` | `pt-PT` |
| `pt`, `pt-BR` | `pt-BR` |
| `zh-TW` | `zh-TW` |
| `zh`, other `zh-*` | `zh-CN` |
| `nb`, `nn` | `no` |
| anything unlisted | `en` |

## What the site must provide

**Every locale in the set must return a page, not a 404.** Untranslated locales
should serve the English content rather than fail.

- `/<locale>/html-to-md/welcome` — thank the user for installing, show the three
  capture modes (selection, highlighter, shortcuts), and end with a call to
  action: open the panel and try it on a page. A short GIF or screenshot helps.
- `/<locale>/html-to-md/changelog` — what changed in the current release. The version can
  be read from `manifest.json`. The notes themselves are English in every
  locale: the prefix exists so that no language gets a 404, not because release
  notes are translated.
- `/<locale>/html-to-md/uninstall` — the one question worth asking someone who
  has left: which page the converter got wrong. An address is reproducible; a
  rating is not. The form must stay optional, must send nothing until it is
  submitted, and must say plainly that only what was typed is sent. It posts to
  `2md.site/api/feedback`, the same collector the extension's counters use,
  because the new site is static assets with no Worker of its own.

The privacy policy is the other page linked from inside the extension, and it
follows the same locale scheme.

`/<locale>/feedback` is no longer part of the contract. The rating widget used
to send scores of three stars or less there instead of to the store; every star
now opens the Chrome Web Store review form (`src/shared/store-links.ts`). The
extension links nothing to `/feedback` — whether the site keeps the page is its
own decision.
