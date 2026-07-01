#!/usr/bin/env bash
# Instala o app como comando global: `esocial-consignado`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Instalando dependências..."
npm install

echo "==> Gerando build de produção..."
npm run build

echo "==> Registrando comando global (npm link)..."
npm link

echo
echo "Instalação concluída. Rode de qualquer diretório:"
echo "  esocial-consignado             # inicia em http://localhost:3000"
echo "  esocial-consignado -p 4000     # porta customizada"
echo "  esocial-consignado --dev       # modo desenvolvimento"
echo "  esocial-consignado --help      # opções"
echo
echo "Para desinstalar: ./uninstall.sh"
