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

## CORS — obrigatório usar proxy

A API do SERPRO **não envia cabeçalhos CORS**, então o navegador bloqueia
qualquer chamada direta (`Failed to fetch`). É preciso um **proxy do lado do
servidor** que faça a requisição e devolva com CORS liberado. O campo
**"URL base da API (ou proxy)"** no topo do app permite apontar para o proxy
sem mexer no código.

### Com Vite (`npm run dev`) — proxy embutido

O `vite.config.js` já encaminha o prefixo `/esocial-api` para o SERPRO. Basta
preencher o campo **URL base da API** com:

```
/esocial-api/recepcaolote/api/ContratoEmprestimoConsignado
```

As chamadas saem same-origin para o Vite, que repassa ao SERPRO (sem CORS).

### Com o standalone — proxy Node (sem dependências)

Rode o proxy incluso e mantenha o `standalone.html` aberto:

```bash
node proxy-server.mjs          # escuta em http://localhost:8080
# PORT=9000 node proxy-server.mjs   # porta alternativa
```

No app, preencha **URL base da API** com:

```
http://localhost:8080/recepcaolote/api/ContratoEmprestimoConsignado
```

> Os proxies são ferramentas de desenvolvimento/teste. Para produção, use um
> backend próprio com as devidas regras de segurança.

## Observações

- **Autenticação:** o JWT é obtido externamente e informado pelo usuário.
  Não há persistência (`localStorage`) — o estado vive apenas em memória.
- Os dados **não são mockados**: o app chama a API real (via proxy).
