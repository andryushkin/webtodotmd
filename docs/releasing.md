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

## Versioning

Semantic versioning, read from the user's side rather than the code's — the
question is what a person who already has the extension installed would need to
be told:

| Bump | When |
| --- | --- |
| **Patch** `1.2.x` | Bug fixes, conversion corrections, translation and copy fixes, internal refactors. Nothing new to learn. |
| **Minor** `1.x.0` | A new capability or a visible behavior change: a button, a capture mode, a shortcut, a setting. |
| **Major** `x.0.0` | The output or the workflow changes in a way that breaks existing habits — front matter shape, default capture behavior, settings that do not carry over. |

Two rules the Chrome Web Store enforces, and one this repository does:

- **Versions must strictly increase.** A number that has been uploaded is burnt
  even if that submission was rejected — bump again rather than re-uploading.
- **Four dot-separated integers maximum**, each 0–65535, no leading zeros, no
  suffixes. `1.2.2` is fine; `1.2.2-beta` is not.
- **`manifest.json` and `package.json` must agree.** `scripts/audit.sh` fails
  if they drift.

### Release commit

The version bump, the `CHANGELOG.md` entry and the tag describe one release and
belong together:

```bash
# after the bump is committed
git tag -a v1.2.3 -m "1.2.3"
git push --follow-tags
```

Tag the commit that was actually packaged and uploaded — if fixes land after
the bump commit and ship in the same submission, the tag goes on the last of
them, not on the bump.

### Changelog entries

One `## X.Y.Z — YYYY-MM-DD` section per published version, newest first, dated
by submission. Write what changed for the user and why it matters; leave out
refactors, dependency bumps and repository chores that nobody outside notices.
If a release is nothing but internal work, it does not need a section — and
probably does not need a submission either.

## Package

```bash
rm -f tomd-*.zip
cd dist && zip -r ../tomd-X.Y.Z.zip .
```

Delete the old archive first. `zip` updates an existing archive instead of
replacing it, which yields a zip with two `manifest.json` entries and a store
rejection. The archives are gitignored — they are build output, not source.

## GitHub release

The same archive is published as a GitHub Release, so the build that is in
review — or already in the store — can be downloaded and loaded unpacked
without rebuilding it:

```bash
gh release list                                  # what is there now
gh release delete vX.Y.Z --yes                   # the previous one, tag kept
gh release create v1.3.0 tomd-1.3.0.zip \
  --title "1.3.0" --notes "$(...)"               # notes: this version's CHANGELOG section
```

Two rules:

- **One release at a time.** The previous release is deleted before the new one
  is created, so the releases page never offers a choice between builds. This
  does break links to older archives — the trade-off is deliberate, the store
  is where old versions live.
- **Never `--cleanup-tag`.** The release goes, the tag stays: tags are the
  record of what was packaged, and `CHANGELOG.md` points at them.

The tag has to exist and be pushed first, which means the release comes after
the submission, not before it — see [Release commit](#release-commit).

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
