import { SERPRO_BASE_URL } from '../../../src/serproConfig.js';

// Proxy server-side para GET /consultarlote no SERPRO.
// Roda em Node (não no navegador), então a resposta não passa por CORS.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const nrInscricaoEmpregador = searchParams.get('nrInscricaoEmpregador') || '';
  const nrLote = searchParams.get('nrLote') || '';
  const authorization = request.headers.get('authorization') || '';

  const upstreamUrl = `${SERPRO_BASE_URL}/consultarlote?nrInscricaoEmpregador=${encodeURIComponent(
    nrInscricaoEmpregador
  )}&nrLote=${encodeURIComponent(nrLote)}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
      },
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
