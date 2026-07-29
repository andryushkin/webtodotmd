# Welcome and changelog pages — 2md.site

The contract between the extension and the site it opens after install and
update. The extension side is implemented; this file is what the site has to
honor.

**Two domains, for now.** The product's own page moved to `dotmd.tools`
(`/html-to-md`, linked from the options page), which is English-only: measured
2026-07-29, `/html-to-md/<locale>` is a 404 in all 52. These two pages stay on
`2md.site`, where all 52 locales of `/welcome` and `/changelog` answer 200. They
move when the new site can answer them — and not before, because the URL is
compiled into a released extension and a 404 is the first thing a new install
would see. There is no localized home page on either domain: `2md.site/<locale>/`
is a 404 in all 52, which is what the options page pointed at for one commit.

## URLs

| Event | URL |
| --- | --- |
| First install | `https://2md.site/<locale>/welcome` |
| Extension update | `https://2md.site/<locale>/changelog` |

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

- `/<locale>/welcome` — thank the user for installing, show the three capture
  modes (selection, highlighter, shortcuts), and end with a call to action:
  open the panel and try it on a page. A short GIF or screenshot helps.
- `/<locale>/changelog` — what changed in the current release. The version can
  be read from `manifest.json`. The notes themselves are English in every
  locale: the prefix exists so that no language gets a 404, not because release
  notes are translated.

The privacy policy is the other page linked from inside the extension, and it
follows the same locale scheme.

`/<locale>/feedback` is no longer part of the contract. The rating widget used
to send scores of three stars or less there instead of to the store; every star
now opens the Chrome Web Store review form (`src/shared/store-links.ts`). The
extension links nothing to `/feedback` — whether the site keeps the page is its
own decision.
