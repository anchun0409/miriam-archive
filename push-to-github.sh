#!/bin/bash
# Push this project to https://github.com/anchun0409/miriam-live
set -euo pipefail
cd "$(dirname "$0")"

export GIT_DIR="$(pwd)/.repo.git"
export GIT_WORK_TREE="$(pwd)"

if [[ ! -d "$GIT_DIR" ]]; then
  echo "Missing .repo.git — run setup first."
  exit 1
fi

# Prefer SSH; fall back to HTTPS if SSH fails
git remote set-url origin git@github.com:anchun0409/miriam-live.git
echo "Pushing to github.com/anchun0409/miriam-live (SSH)..."
if ! git push -u origin main; then
  echo "SSH failed — trying HTTPS (GitHub will prompt for login/token)..."
  git remote set-url origin https://github.com/anchun0409/miriam-live.git
  git push -u origin main
fi

echo
echo "Done."
git log -1 --oneline
git status
echo
echo "Repo: https://github.com/anchun0409/miriam-live"
