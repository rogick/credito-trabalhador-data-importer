import { SERPRO_BASE_URL } from '../../../src/serproConfig.js';

// Proxy server-side para POST /receberlote no SERPRO.
// Roda em Node (não no navegador), então a resposta não passa por CORS.
export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const nrInscricaoEmpregador = searchParams.get('nrInscricaoEmpregador') || '';
  const authorization = request.headers.get('authorization') || '';
  const body = await request.text();

  const upstreamUrl = `${SERPRO_BASE_URL}/receberlote?nrInscricaoEmpregador=${encodeURIComponent(
    nrInscricaoEmpregador
  )}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
      },
    });
  } catch (err) {
    return Response.json(
      { title: 'Falha ao contatar o SERPRO', detail: err?.message || 'Erro desconhecido' },
      { status: 502 }
    );
  }
}
