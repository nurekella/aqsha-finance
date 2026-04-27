#!/usr/bin/env bash
# Создаёт первого администратора в работающем деплое Aqsha.
# Использование: ./create-admin.sh <email> <password>

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <email> <password>" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

docker compose run --rm api node dist/cli/create-admin.js "$1" "$2"
