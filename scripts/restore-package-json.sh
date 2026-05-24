#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Ошибка: запустите скрипт из git-репозитория" >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

status_output="$(git status --porcelain package.json || true)"

if [[ -z "$status_output" ]]; then
  echo "Локальных изменений package.json не обнаружено."
  exit 0
fi

echo "Обнаружены локальные изменения в package.json:" >&2
echo "$status_output" >&2

echo "Восстанавливаю package.json до состояния репозитория..." >&2
if ! git restore --worktree --staged package.json >/dev/null 2>&1; then
  git checkout -- package.json
fi

echo "Файл восстановлен. Теперь можно выполнить git pull или git merge." >&2
