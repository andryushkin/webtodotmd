#!/usr/bin/env bash
# Static, read-only public-repository gate. See docs/audit.md.
set -uo pipefail
cd "$(dirname "$0")/.."

fails=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() {
    local name=$1
    shift
    printf 'FAIL  %s\n' "$name"
    [ "$#" -gt 0 ] && printf '      %s\n' "$@"
    fails=$((fails + 1))
}

# 1. Relative Markdown links in public docs.
if python3 - <<'PY'
from pathlib import Path
import re
import sys

bad = []
files = [
    Path("README.md"),
    Path("CONTRIBUTING.md"),
    Path("THIRD_PARTY_NOTICES.md"),
    *Path("docs").glob("*.md"),
    # The core package publishes its own docs from this repository.
    Path("core/README.md"),
    *Path("core/docs").glob("*.md"),
]
def prose_only(text):
    # Links inside code are examples of syntax, not references to files — the
    # library spec is full of them.
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"~~~.*?~~~", "", text, flags=re.S)
    return re.sub(r"`[^`\n]*`", "", text)


for path in files:
    for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", prose_only(path.read_text())):
        if target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        relative = target.split("#", 1)[0]
        if relative and not (path.parent / relative).exists() and not Path(relative).exists():
            bad.append(f"{path}->{target}")
if bad:
    print(" ".join(bad))
    sys.exit(1)
PY
then pass "doc-links-resolve"; else fail "doc-links-resolve"; fi

# 2. Secret-shaped values in the current tree and every exposed ref.
secret_re='ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(ant|proj|live)-[A-Za-z0-9_-]{10,}|AKIA[0-9A-Z]{16}|xox[bp]-[0-9A-Za-z-]{10,}|BEGIN [A-Z ]*PRIVATE KEY'
current=$(git grep -I -l -E "$secret_re" 2>/dev/null)
history_count=0
history_example=""
while IFS= read -r commit; do
    found=$(git grep -I -l -E "$secret_re" "$commit" -- 2>/dev/null)
    if [ -n "$found" ]; then
        history_count=$((history_count + $(printf '%s\n' "$found" | wc -l)))
        [ -z "$history_example" ] && history_example=$(printf '%s\n' "$found" | head -1)
    fi
done < <(git rev-list --all)
if [ -z "$current" ] && [ "$history_count" -eq 0 ]; then
    pass "no-secret-patterns-current-or-history"
else
    fail "no-secret-patterns-current-or-history" \
        "current=${current:-none} history_hits=$history_count first=${history_example:-none}"
fi

# 3. Machine-local and agent-only material must not remain in public history.
internal_re='/Users/[A-Za-z0-9._-]+/(Server|\.claude|\.codex)/|(redacted)|\.claude/skills/wrap/'
internal_count=0
internal_example=""
while IFS= read -r commit; do
    found=$(git grep -I -l -E "$internal_re" "$commit" -- . \
        ':(exclude)scripts/audit.sh' 2>/dev/null)
    if [ -n "$found" ]; then
        internal_count=$((internal_count + $(printf '%s\n' "$found" | wc -l)))
        [ -z "$internal_example" ] && internal_example=$(printf '%s\n' "$found" | head -1)
    fi
done < <(git rev-list --all)
if [ "$internal_count" -eq 0 ]; then
    pass "no-internal-history"
else
    fail "no-internal-history" \
        "history_hits=$internal_count first=$internal_example"
fi

# 4. Manifest/package versions and locale key sets.
if python3 - <<'PY'
import json
from pathlib import Path
import sys

manifest = json.loads(Path("manifest.json").read_text())
package = json.loads(Path("package.json").read_text())
if manifest["version"] != package["version"]:
    print(f"manifest={manifest['version']} package={package['version']}")
    sys.exit(1)

root = Path("public/_locales")
english = list(json.loads((root / "en/messages.json").read_text()))
bad = []
for path in sorted(root.glob("*/messages.json")):
    keys = list(json.loads(path.read_text()))
    if keys != english:
        bad.append(path.parent.name)
if bad:
    print("locale key/order mismatch:", " ".join(bad))
    sys.exit(1)
PY
then pass "version-and-locales"; else fail "version-and-locales"; fi

# 5. The conversion core must be present, licensed, and reachable from the
# content script — it is a package in this repository, not a submodule.
# Reached from anywhere in the content script's own directory, not from
# `content-script.ts` alone: the import moved into `capture.ts` — which that file
# imports — and the check went on naming the older shape.
if [ -f core/src/browser.ts ] \
    && [ -f core/LICENSE ] \
    && [ -f core/package.json ] \
    && git grep -q "core/src/browser" -- src/content; then
    pass "conversion-core"
else
    fail "conversion-core" "core/src/browser.ts, core/LICENSE, core/package.json or the import"
fi

# 6. Exact vendored license texts must exist and be copied by build.sh.
license_files=(
    vendor/licenses/marked-LICENSE.md
    vendor/licenses/dompurify-LICENSE
    vendor/licenses/katex-LICENSE
    vendor/licenses/mathml-to-latex-LICENSE.md
    vendor/licenses/definitelytyped-LICENSE
)
missing=""
for path in "${license_files[@]}"; do
    [ -s "$path" ] || missing="$missing $path"
done
grep -q 'vendor/licenses/\*' build.sh || missing="$missing build-copy"
# The conversion core is first-party: covered by the root LICENSE, not a
# third-party notice. Its own LICENSE file is checked in the core node above.
if [ -z "$missing" ]; then
    pass "third-party-licenses"
else
    fail "third-party-licenses" "$missing"
fi

# 7. Keep startup guides compact.
claude_lines=$(wc -l < CLAUDE.md)
agent_lines=$(wc -l < AGENTS.md)
# Path-scoped guides are counted too: moving a section into one is how the root
# budget would otherwise be met without saying anything less.
# `core/` has a budget of its own, and a much larger one: it is not only the
# guide for a subdirectory but the constraint sheet of a library published from
# this repository, and every line in it is a defect somebody already paid for
# with the reason that makes it stick. The root norm allows this in as many
# words — earn the space by saying less, *or raise the budget* — and raising it
# knowingly beats trimming the reasons, which is the half that does the work.
scoped_over=""
for guide in docs/invariants/*.md; do
    [ -f "$guide" ] || continue
    lines=$(wc -l < "$guide")
    case "$guide" in
        docs/invariants/core.md) limit=480 ;;
        *) limit=210 ;;
    esac
    [ "$lines" -gt "$limit" ] && scoped_over="$scoped_over $guide=$lines(>$limit)"
done
if [ "$claude_lines" -le 195 ] && [ "$agent_lines" -le 45 ] && [ -z "$scoped_over" ]; then
    pass "guide-budget (CLAUDE<=195 AGENTS<=45 core<=480 invariants<=210)"
else
    fail "guide-budget" "CLAUDE.md=$claude_lines AGENTS.md=$agent_lines$scoped_over"
fi

# 8. No generated junk is tracked.
junk=$(git ls-files | grep -E '(^|/)\.DS_Store$|(^|/)node_modules/|(^|/)dist/|\.log$|\.smotr|\.zip$')
if [ -z "$junk" ]; then pass "no-junk-tracked"; else fail "no-junk-tracked" "$junk"; fi

# 9. Whitespace in worktree, index, and outgoing range.
base=""
if [ -n "${AUDIT_BASE:-}" ]; then
    git rev-parse --verify --quiet "$AUDIT_BASE" >/dev/null && base=$AUDIT_BASE || base="__invalid__"
elif git rev-parse --verify --quiet '@{upstream}' >/dev/null; then
    base='@{upstream}'
else
    branch=$(git branch --show-current)
    git rev-parse --verify --quiet "origin/$branch" >/dev/null && base="origin/$branch"
fi
if [ "$base" = "__invalid__" ]; then
    fail "git-diff-check" "AUDIT_BASE='$AUDIT_BASE' does not resolve"
elif [ -z "$base" ]; then
    fail "git-diff-check" "no audit base; set upstream or AUDIT_BASE"
else
    whitespace=""
    git diff --check >/dev/null 2>&1 || whitespace="worktree"
    git diff --check --cached >/dev/null 2>&1 || whitespace="$whitespace staged"
    git diff --check "$base" HEAD >/dev/null 2>&1 || whitespace="$whitespace outgoing($base)"
    if [ -z "$whitespace" ]; then
        pass "git-diff-check (base: $base)"
    else
        fail "git-diff-check" "$whitespace"
    fi
fi

echo
if [ "$fails" -eq 0 ]; then
    echo "AUDIT: all mechanical checks passed."
else
    echo "AUDIT: $fails check(s) failed."
    exit 1
fi
