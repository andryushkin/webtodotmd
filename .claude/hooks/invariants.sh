#!/usr/bin/env bash
# Paste the invariant sheet for the subsystem an edit is about to touch.
#
# The sheets in docs/invariants/ used to be path-scoped CLAUDE.md files, which
# Claude Code loaded on its own; they are one guide per subsystem again, and
# nothing loads them. This hook is the net under the rule in CLAUDE.md: an agent
# that did not open the sheet still sees it before the first edit under its path.
# Once per session per sheet — the second edit does not pay for it again.
set -uo pipefail
cd "$(dirname "$0")/../.."

input=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
session=$(printf '%s' "$input" | jq -r '.session_id // "nosession"')
[ -n "$path" ] || exit 0

# Compare against the repository-relative path, so an absolute file_path and a
# relative one reach the same sheet.
rel=${path#"$PWD"/}
case "$rel" in
    core/*) sheet=core ;;
    src/content/*) sheet=content ;;
    src/sidepanel/*) sheet=sidepanel ;;
    src/background/*) sheet=background ;;
    *) exit 0 ;;
esac

file=docs/invariants/$sheet.md
[ -f "$file" ] || exit 0

# The sheet itself is only worth its size once; after that the reminder is the
# agent's own context. A stamp keyed by session and sheet is what tells them
# apart — /clear starts a new session and the sheet is pasted again.
stamp=${TMPDIR:-/tmp}/claude-invariants-$session-$sheet
[ -e "$stamp" ] && exit 0
: >"$stamp"

jq -n --arg body "$(cat "$file")" --arg file "$file" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: ("The invariants for the directory this edit touches (" + $file +
      "). Every rule in it has already cost a bug; read it before editing, and " +
      "update it in the same change if you alter behavior it describes.\n\n" + $body)
  }
}'
