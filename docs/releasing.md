# Releasing

## Build

```bash
bash build.sh
```

Produces the unpacked extension in `dist/`. Load it via `chrome://extensions`
▸ Developer mode ▸ Load unpacked, and reload it there after each rebuild.

Before packaging, check that `bun test src` passes and that the panel, the
options page and a capture on an ordinary page all work with no console
errors.

## Version bump

The version lives in exactly two places that must agree:

- `manifest.json` → `version`
- `package.json` → `version`

Add the release to [CHANGELOG.md](../CHANGELOG.md) in the same commit.

## Package

```bash
rm -f tomd-*.zip
cd dist && zip -r ../tomd-X.Y.Z.zip .
```

Delete the old archive first. `zip` updates an existing archive instead of
replacing it, which yields a zip with two `manifest.json` entries and a store
rejection. The archives are gitignored — they are build output, not source.

## Chrome Web Store submission

Listing material is **not in this repository**. It lives in a gitignored
`store/` directory next to the source, because it is Developer Dashboard input
rather than part of the extension:

| Path | Contents |
| --- | --- |
| `store/lang/description/` | Long descriptions, one plain text file per locale, 4500 characters max. Edit `en.txt` first, then regenerate the rest |
| `store/img/` | Icon, banner sources and screenshots |
| `store/permissions-justification.md` | The text to paste into the review form; keep it in sync when permissions change |

- The store listing's **translations are managed in the Developer Dashboard**,
  not in `_locales/`. `public/_locales/` only affects how Chrome itself labels
  the extension (tooltip, extensions page).
- Do not add `host_permissions: ["*://*/*"]` back to the manifest — it makes
  review flag broad host permissions and delays approval.
  `content_scripts.matches` plus `scripting`/`activeTab` already cover both
  injection paths. Review still warns about `content_scripts.matches` itself,
  which is normal for a universal clipper.

## Post-install pages

New installs open `https://2md.site/<locale>/welcome`. Updates open
`https://2md.site/<locale>/changelog`, but only when
`SHOW_CHANGELOG_ON_UPDATE` is flipped to `true` in
`src/background/service-worker.ts` — set it for meaningful releases and back to
`false` afterwards. See
[website-welcome-changelog.md](website-welcome-changelog.md) for the URL
contract.

## Locale completeness

Every locale carries the same key set. Check before shipping:

```bash
python3 -c "
import json, os
d = 'public/_locales'
en = set(json.load(open(d + '/en/messages.json')))
for l in sorted(os.listdir(d)):
    p = f'{d}/{l}/messages.json'
    if not os.path.exists(p):
        continue
    missing = sorted(en - set(json.load(open(p))))
    print(l, 'MISSING', missing) if missing else print(l, 'OK')
"
```

A present key is not a correct key: nine locales once shipped an
`appDescription` that was plausible text rather than a translation of the
English one. When auditing, print `appDescription.message` for every locale and
read them.
