# esocial-credito-trab-client

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

### Modo desenvolvimento (dentro do repositório)

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start   # build de produção
```

### Instalação global (comando `esocial-credito-trab-client`)

Para rodar o app como um comando disponível em qualquer diretório:

```bash
./install.sh
```

O script instala as dependências, gera o build de produção e registra o
comando globalmente via `npm link`. Depois disso, de qualquer pasta:

```bash
esocial-credito-trab-client             # inicia em http://localhost:3000
esocial-credito-trab-client -p 4000     # porta customizada (ou defina PORT=4000)
esocial-credito-trab-client --dev       # modo desenvolvimento (next dev)
esocial-credito-trab-client --build     # força regerar o build antes de iniciar
esocial-credito-trab-client --help      # lista as opções
```

Para desinstalar o comando global:

```bash
./uninstall.sh
```

> `npm link` cria um symlink global apontando para esta pasta do repositório
> — não copia os arquivos. Se você mover ou apagar o diretório do projeto, o
> comando global para de funcionar até rodar `./install.sh` novamente.

## Como obter o token JWT

O aplicativo requer um token JWT válido para se comunicar com a API do SERPRO.
Para saber como obtê-lo no portal do eSocial (Produção Restrita), consulte o
guia passo a passo:

📖 **[Como obter o token](docs/como-obter-token.md)**

## Observações

- **Autenticação:** o JWT é obtido externamente e informado pelo usuário.
  Não há persistência (`localStorage`) — o estado vive apenas em memória do
  navegador; as API Routes não armazenam o token, apenas o repassam.
- Os dados **não são mockados**: o app chama a API real do SERPRO.
