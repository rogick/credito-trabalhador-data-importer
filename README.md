# credito-trabalhador-data-importer

Consumer (React/Next.js) da API **eSocial Consignado** do SERPRO para
recepção e consulta de lotes de contrato de empréstimo consignado (Crédito
do Trabalhador).

Ambiente alvo: **Produção Restrita**
(`producaorestrita-esocialconsignado.df-1.estaleiro.serpro.gov.br`).

## Arquitetura

A API do SERPRO **não envia cabeçalhos CORS**, então chamadas diretas do
navegador são bloqueadas (`Failed to fetch`). Por isso o app é um projeto
**Next.js**: a UI (client component) chama endpoints locais same-origin,
e são as **API Routes** do Next.js — rodando em Node no servidor — que de
fato conversam com o SERPRO. CORS não se aplica a chamadas servidor-a-servidor.

```
navegador  --(same-origin)-->  API Routes Next.js  --(server-side)-->  SERPRO
```

- UI: [`src/EsocialConsignadoApp.jsx`](src/EsocialConsignadoApp.jsx) —
  toda a lógica de formulário/validação/exibição, renderizado por
  [`app/page.jsx`](app/page.jsx).
- Proxy server-side:
  - [`app/api/receberlote/route.js`](app/api/receberlote/route.js) → `POST /receberlote`
  - [`app/api/consultarlote/route.js`](app/api/consultarlote/route.js) → `GET /consultarlote`

Duas abas na UI:

- **Receber Lote** — lote de 1 a 10 registros.
- **Consultar Lote** — exibe `retornoLote[]` em tabela.

Configuração compartilhada (sempre visível): **JWT Token** (Bearer) e
**nrInscricaoEmpregador**. O JWT é enviado pelo navegador ao endpoint local,
que o repassa ao SERPRO via header `Authorization`.

## Como rodar

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start   # build de produção
```

## Observações

- **Autenticação:** o JWT é obtido externamente e informado pelo usuário.
  Não há persistência (`localStorage`) — o estado vive apenas em memória do
  navegador; as API Routes não armazenam o token, apenas o repassam.
- Os dados **não são mockados**: o app chama a API real do SERPRO.
