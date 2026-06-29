# credito-trabalhador-data-importer

Consumer (React) da API **eSocial Consignado** do SERPRO para recepção e
consulta de lotes de contrato de empréstimo consignado (Crédito do Trabalhador).

Ambiente alvo: **Produção Restrita**
(`producaorestrita-esocialconsignado.df-1.estaleiro.serpro.gov.br`).

## App

Toda a lógica do app está em um único arquivo:
[`src/EsocialConsignadoApp.jsx`](src/EsocialConsignadoApp.jsx).

Duas abas:

- **Receber Lote** — `POST /receberlote` com lote de 1 a 10 registros.
- **Consultar Lote** — `GET /consultarlote`, exibindo `retornoLote[]` em tabela.

Configuração compartilhada (sempre visível): **JWT Token** (Bearer) e
**nrInscricaoEmpregador**.

## Como rodar

### Opção A — Standalone (sem build)

Abra [`standalone.html`](standalone.html) diretamente no navegador. Tudo
(React, Babel e Tailwind) é carregado via CDN e o app é transformado no
próprio navegador — não precisa de `npm` nem de servidor.

### Opção B — Com build (Vite)

```bash
npm install
npm run dev      # servidor de desenvolvimento (Vite)
npm run build    # build de produção em dist/
```

Os arquivos `index.html`, `src/main.jsx`, `vite.config.js` e `package.json`
são apenas o scaffold de build/dev (Vite + Tailwind via CDN). A lógica
permanece inteiramente no `.jsx` único.

## Observações

- **CORS:** a API do governo pode bloquear chamadas diretas do navegador.
  Nesse caso, use um proxy backend. O app exibe um aviso no topo.
- **Autenticação:** o JWT é obtido externamente e informado pelo usuário.
  Não há persistência (`localStorage`) — o estado vive apenas em memória.
- Os dados **não são mockados**: o app chama a API real.
