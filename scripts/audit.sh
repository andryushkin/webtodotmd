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
]
for path in files:
    for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", path.read_text()):
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

# 5. The public conversion submodule must be pinned, checked out, and licensed.
gitlink=$(git ls-files -s vendor/htmltodotmd | awk '$1 == 160000 {print $2}')
submodule_status=$(git submodule status vendor/htmltodotmd 2>/dev/null)
if [ -n "$gitlink" ] \
    && [ "${submodule_status#-}" = "$submodule_status" ] \
    && [ -f vendor/htmltodotmd/LICENSE ]; then
    pass "htmltodotmd-submodule"
else
    fail "htmltodotmd-submodule" "missing/uninitialized gitlink or LICENSE"
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
grep -q 'vendor/htmltodotmd/LICENSE' build.sh || missing="$missing submodule-license-copy"
if [ -z "$missing" ]; then
    pass "third-party-licenses"
else
    fail "third-party-licenses" "$missing"
fi

# 7. Keep startup guides compact.
claude_lines=$(wc -l < CLAUDE.md)
agent_lines=$(wc -l < AGENTS.md)
if [ "$claude_lines" -le 130 ] && [ "$agent_lines" -le 45 ]; then
    pass "guide-budget (CLAUDE<=130 AGENTS<=45)"
else
    fail "guide-budget" "CLAUDE.md=$claude_lines AGENTS.md=$agent_lines"
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
