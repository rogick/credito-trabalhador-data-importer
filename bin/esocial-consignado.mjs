#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Uso: esocial-consignado [opções]

  -p, --port <n>   Porta HTTP (padrão: 3000, ou variável PORT)
  --dev            Roda em modo desenvolvimento (next dev)
  --build          Força regerar o build de produção antes de iniciar
  -h, --help       Mostra esta ajuda
`);
  process.exit(0);
}

const isDev = args.includes('--dev');
const forceBuild = args.includes('--build');
const portFlagIdx = args.findIndex((a) => a === '--port' || a === '-p');
const port = portFlagIdx !== -1 ? args[portFlagIdx + 1] : process.env.PORT || '3000';

function runNext(subArgs) {
  const result = spawnSync('npx', ['--no-install', 'next', ...subArgs], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    console.error('[esocial-consignado] Falha ao executar Next.js:', result.error.message);
    process.exit(1);
  }
  return result.status ?? 0;
}

if (isDev) {
  console.log(`[esocial-consignado] Modo desenvolvimento em http://localhost:${port}`);
  process.exit(runNext(['dev', '-p', port]));
}

const buildIdFile = path.join(projectRoot, '.next', 'BUILD_ID');
if (forceBuild || !existsSync(buildIdFile)) {
  console.log('[esocial-consignado] Gerando build de produção (primeira execução)...');
  const buildStatus = runNext(['build']);
  if (buildStatus !== 0) process.exit(buildStatus);
}

console.log(`[esocial-consignado] Iniciando em http://localhost:${port}`);
process.exit(runNext(['start', '-p', port]));
