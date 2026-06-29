// Proxy CORS sem dependências para a API eSocial Consignado (SERPRO).
//
// A API do governo não envia cabeçalhos CORS, então o navegador bloqueia
// chamadas diretas. Este proxy recebe as requisições do app, encaminha ao
// SERPRO do lado do servidor (onde CORS não se aplica) e devolve a resposta
// com os cabeçalhos CORS liberados.
//
// Uso:
//   node proxy-server.mjs            # escuta em http://localhost:8080
//   PORT=9000 node proxy-server.mjs  # porta customizada
//
// No app, defina o campo "URL base da API (ou proxy)" como:
//   http://localhost:8080/recepcaolote/api/ContratoEmprestimoConsignado
//
// Atenção: ferramenta de desenvolvimento/teste. Não exponha publicamente.

import http from 'node:http';
import https from 'node:https';

const PORT = Number(process.env.PORT) || 8080;
const TARGET_HOST =
  'producaorestrita-esocialconsignado.df-1.estaleiro.serpro.gov.br';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

const server = http.createServer((req, res) => {
  // Preflight CORS.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Encaminha apenas os cabeçalhos relevantes para o SERPRO.
  const fwdHeaders = {};
  if (req.headers['authorization']) fwdHeaders['Authorization'] = req.headers['authorization'];
  if (req.headers['content-type']) fwdHeaders['Content-Type'] = req.headers['content-type'];
  fwdHeaders['Accept'] = 'application/json';

  const upstream = https.request(
    {
      host: TARGET_HOST,
      port: 443,
      method: req.method,
      path: req.url, // mantém /recepcaolote/api/... e a query string
      headers: fwdHeaders,
    },
    (upRes) => {
      res.writeHead(upRes.statusCode || 502, {
        ...CORS_HEADERS,
        'Content-Type': upRes.headers['content-type'] || 'application/json',
      });
      upRes.pipe(res);
    }
  );

  upstream.on('error', (err) => {
    console.error('[proxy] erro upstream:', err.message);
    res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ title: 'Falha no proxy ao contatar o SERPRO', detail: err.message }));
  });

  req.pipe(upstream);
});

server.listen(PORT, () => {
  console.log(`Proxy eSocial Consignado em http://localhost:${PORT}`);
  console.log(`Encaminhando para https://${TARGET_HOST}`);
  console.log(
    `No app, use a URL base: http://localhost:${PORT}/recepcaolote/api/ContratoEmprestimoConsignado`
  );
});
