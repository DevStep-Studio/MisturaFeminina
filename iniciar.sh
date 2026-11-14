#!/usr/bin/env bash
set -euo pipefail
cd -- "$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo 'Instale Node.js 22.12+ para iniciar o projeto.' >&2
  exit 1
fi
exec node scripts/dev.mjs "$@"
