#!/usr/bin/env bash
# Remove o comando global `esocial-consignado` instalado via install.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PKG_NAME="$(node -p "require('./package.json').name")"

echo "==> Removendo comando global ($PKG_NAME)..."
npm rm --global "$PKG_NAME"

echo "Comando global removido."
