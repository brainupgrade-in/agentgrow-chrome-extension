#!/usr/bin/env bash
# PostToolUse hook: after an edit to app/src/**/*.ts(x), run the TypeScript check.
# Exit 2 sends the errors back to Claude so it fixes them before moving on.
f="$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')"
case "$f" in
  */app/src/*.ts|*/app/src/*.tsx) ;;
  *) exit 0 ;;
esac
root="$(git -C "$(dirname "$f")" rev-parse --show-toplevel 2>/dev/null)" || exit 0
if ! out="$(pnpm -C "$root/app" exec tsc --noEmit 2>&1)"; then
  echo "typecheck failed after editing $f:" >&2
  echo "$out" | grep -E 'error TS' | head -20 >&2
  exit 2
fi
