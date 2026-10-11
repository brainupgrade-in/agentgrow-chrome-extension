#!/usr/bin/env bash
# Prepare a git worktree of this repo for development.
#   Usage (from anywhere inside the worktree): bash app/scripts/setup-worktree.sh
# Copies the gitignored internal docs listed in .worktreeinclude from the main
# checkout, then installs dependencies. Safe to re-run.
set -euo pipefail

wt_root="$(git rev-parse --show-toplevel)"
main_root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"

if [[ "$wt_root" != "$main_root" ]]; then
  grep -vE '^\s*(#|$)' "$wt_root/.worktreeinclude" | while read -r f; do
    if [[ -e "$main_root/$f" && ! -e "$wt_root/$f" ]]; then
      cp -r "$main_root/$f" "$wt_root/$f" && echo "copied $f"
    fi
  done
fi

pnpm -C "$wt_root/app" install --frozen-lockfile

echo
echo "Worktree ready: $wt_root"
echo "  Build:  pnpm -C app build   -> $wt_root/dist (load unpacked as a separate extension)"
echo "  Dev:    VITE_PORT=5174 pnpm -C app dev   (pick a free port per worktree)"
echo "  Note:   Google sign-in fails with 'bad client id' in any unpacked build — expected, see CLAUDE.md."
