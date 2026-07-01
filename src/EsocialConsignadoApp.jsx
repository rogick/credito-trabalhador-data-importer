'use client';

import React, { useState } from 'react';

/**
 * Consumer da API eSocial Consignado (SERPRO) — Produção Restrita.
 *
 * App com duas abas:
 *  - Receber Lote   (POST /api/receberlote  -> servidor Next.js -> SERPRO)
 *  - Consultar Lote (GET  /api/consultarlote -> servidor Next.js -> SERPRO)
 *
 * As chamadas à API do SERPRO são feitas pelas API Routes do Next.js
 * (server-side, ver app/api/*), não diretamente pelo navegador — assim
 * evita-se o bloqueio de CORS que a API do governo impõe a chamadas
 * browser-direct.
 *
 * Autenticação via Bearer JWT informado pelo usuário.
 * Sem bibliotecas externas além de Tailwind (classes base).
 * Sem <form>, sem localStorage — todo estado em useState.
 */

// Tabela 01 do eSocial (categorias de trabalhador) — subconjunto mais usado.
const CATEGORIAS = [
  ['101', '101 - Empregado - Geral'],
  ['102', '102 - Empregado - Trabalhador rural por pequeno prazo'],
  ['103', '103 - Empregado - Aprendiz'],
  ['104', '104 - Empregado - Doméstico'],
  ['105', '105 - Empregado - Contrato a termo (Lei 9.601/98)'],
  ['106', '106 - Trabalhador temporário (Lei 6.019/74)'],
  ['111', '111 - Empregado - Contrato de trabalho intermitente'],
  ['721', '721 - Contribuinte individual - Diretor não empregado (FGTS)'],
  ['722', '722 - Contribuinte individual - Diretor não empregado (sem FGTS)'],
];

const emptyRecord = () => ({
  nrCpfTrabalhador: '',
  cdMatricula: '',
  tpInscricao: '1',
  nrInscricao: '',
  nrContratoEmprestimo: '',
  nrInstituicaoFinanceiro: '',
  vlParcela: '',
  nrCompetenciaDesconto: '',
  cdCategoria: '',
  dtInicioEmprestimo: '',
});

// ---- Helpers de validação -------------------------------------------------

const onlyDigits = (s) => (s || '').replace(/\D/g, '');

function validateEmpregador(nrInscricaoEmpregador) {
  const v = onlyDigits(nrInscricaoEmpregador);
  if (v.length !== 8 && v.length !== 14) {
    return 'nrInscricaoEmpregador deve ter 8 (CNPJ raiz) ou 14 dígitos.';
  }
  return null;
}

function validateRecord(r, idx) {
  const errs = [];
  const tag = `Registro ${idx + 1}`;

  if (onlyDigits(r.nrCpfTrabalhador).length !== 11) {
    errs.push(`${tag}: CPF do trabalhador deve ter 11 dígitos.`);
  }
  if (!r.cdMatricula.trim()) {
    errs.push(`${tag}: Matrícula é obrigatória.`);
  } else if (r.cdMatricula.length > 30) {
    errs.push(`${tag}: Matrícula excede 30 caracteres.`);
  }
  if (r.tpInscricao !== '1' && r.tpInscricao !== '2') {
    errs.push(`${tag}: Tipo de inscrição inválido.`);
  } else {
    const insc = onlyDigits(r.nrInscricao);
    const expected = r.tpInscricao === '1' ? 14 : 11;
    // tpInscricao 1=CNPJ (14), 2=CPF (11). O plano cita "8 ou 14"; aceitamos 8/14 p/ CNPJ.
    if (r.tpInscricao === '1' && insc.length !== 8 && insc.length !== 14) {
      errs.push(`${tag}: Nº inscrição (CNPJ) deve ter 8 ou 14 dígitos.`);
    } else if (r.tpInscricao === '2' && insc.length !== 11) {
      errs.push(`${tag}: Nº inscrição (CPF) deve ter 11 dígitos.`);
    }
    void expected;
  }
  if (!r.nrContratoEmprestimo.trim()) {
    errs.push(`${tag}: Nº do contrato é obrigatório.`);
  } else if (r.nrContratoEmprestimo.length > 15) {
    errs.push(`${tag}: Nº do contrato excede 15 caracteres.`);
  }
  if (!/^\d{1,3}$/.test(r.nrInstituicaoFinanceiro)) {
    errs.push(`${tag}: Nº da instituição financeira deve ter até 3 dígitos (ex: 001).`);
  }
  if (!/^\d+\.\d{2}$/.test(r.vlParcela)) {
    errs.push(`${tag}: Valor da parcela deve estar no formato 99999.99.`);
  }
  if (!/^\d{6}$/.test(r.nrCompetenciaDesconto)) {
    errs.push(`${tag}: Competência deve estar no formato AAAAMM.`);
  } else {
    const mm = Number(r.nrCompetenciaDesconto.slice(4));
    if (mm < 1 || mm > 13) {
      errs.push(`${tag}: Mês da competência inválido.`);
    }
  }
  if (!r.cdCategoria.trim()) {
    errs.push(`${tag}: Categoria é obrigatória.`);
  }
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.dtInicioEmprestimo)) {
    errs.push(`${tag}: Data início deve estar no formato AAAA-MM-DD HH:mm:ss.`);
  }
  return errs;
}

// ---- Componentes de UI ----------------------------------------------------

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

const inputClass =
  'rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

function StatusBadge({ status, ok }) {
  if (status == null) return null;
  const color = ok
    ? 'bg-green-100 text-green-800 border-green-300'
    : 'bg-red-100 text-red-800 border-red-300';
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-sm font-semibold ${color}`}>
      HTTP {status}
    </span>
  );
}

function DynamicTable({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((k) => set.add(k));
      return set;
    }, new Set())
  );
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr className="bg-gray-100 text-left">
            {columns.map((c) => (
              <th key={c} className="border border-gray-300 px-2 py-1 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="odd:bg-white even:bg-gray-50">
              {columns.map((c) => (
                <td key={c} className="border border-gray-300 px-2 py-1 align-top">
                  {formatCell(row?.[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v) {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function ResponseView({ result }) {
  if (!result) return null;
  const { status, ok, data, error } = result;

  if (error) {
    return (
      <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
        <p className="font-semibold">Falha na requisição</p>
        <p className="mt-1">{error}</p>
        <p className="mt-2 text-xs text-red-600">
          Possíveis causas: servidor Next.js fora do ar, indisponibilidade da API do SERPRO,
          token inválido ou ausência de conectividade com o ambiente de produção restrita.
        </p>
      </div>
    );
  }

  const rows = Array.isArray(data?.retornoLote)
    ? data.retornoLote
    : Array.isArray(data?.details)
    ? data.details
    : null;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={status} ok={ok} />
        {data?.title && <span className="font-semibold text-gray-800">{data.title}</span>}
      </div>

      {data?.traceId && (
        <p className="text-xs text-gray-500">
          traceId: <code className="rounded bg-gray-100 px-1">{data.traceId}</code>
        </p>
      )}

      {rows && <DynamicTable rows={rows} />}

      <details className="rounded border border-gray-200 bg-gray-50">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700">
          Raw JSON
        </summary>
        <pre className="overflow-x-auto px-3 pb-3 text-xs text-gray-800">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

// ---- App principal --------------------------------------------------------

export default function EsocialConsignadoApp() {
  const [jwtToken, setJwtToken] = useState('');
  const [nrInscricaoEmpregador, setNrInscricaoEmpregador] = useState('');
  const [activeTab, setActiveTab] = useState('send'); // 'send' | 'query'

  // Aba "Receber Lote"
  const [nrLote, setNrLote] = useState('');
  const [lote, setLote] = useState([emptyRecord()]);

  // Aba "Consultar Lote"
  const [queryNrLote, setQueryNrLote] = useState('');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);

  // -- Manipulação do lote --
  const addRecord = () => {
    setLote((prev) => (prev.length >= 10 ? prev : [...prev, emptyRecord()]));
  };
  const removeRecord = (idx) => {
    setLote((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };
  const updateRecord = (idx, field, value) => {
    setLote((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const authHeaders = () => ({
    Authorization: `Bearer ${jwtToken}`,
    'Content-Type': 'application/json',
  });

  // -- Enviar lote (POST) --
  const handleSend = async () => {
    const errs = [];
    if (!jwtToken.trim()) errs.push('Informe o JWT Token.');
    const empErr = validateEmpregador(nrInscricaoEmpregador);
    if (empErr) errs.push(empErr);
    if (!/^\d{1,2}$/.test(String(nrLote))) {
      errs.push('nrLote deve ser um inteiro de até 2 dígitos.');
    }
    if (lote.length < 1 || lote.length > 10) {
      errs.push('O lote deve conter entre 1 e 10 registros.');
    }
    lote.forEach((r, i) => errs.push(...validateRecord(r, i)));

    setValidationErrors(errs);
    if (errs.length > 0) return;

    const body = {
      nrLote: Number(nrLote),
      Lote: lote.map((r) => ({
        nrCpfTrabalhador: onlyDigits(r.nrCpfTrabalhador),
        cdMatricula: r.cdMatricula,
        tpInscricao: r.tpInscricao,
        nrInscricao: onlyDigits(r.nrInscricao),
        nrContratoEmprestimo: r.nrContratoEmprestimo,
        nrInstituicaoFinanceiro: r.nrInstituicaoFinanceiro,
        vlParcela: r.vlParcela,
        nrCompetenciaDesconto: r.nrCompetenciaDesconto,
        cdCategoria: r.cdCategoria,
        dtInicioEmprestimo: r.dtInicioEmprestimo,
      })),
    };

    const url = `/api/receberlote?nrInscricaoEmpregador=${encodeURIComponent(
      onlyDigits(nrInscricaoEmpregador)
    )}`;

    await doRequest(() =>
      fetch(url, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
    );
  };

  // -- Consultar lote (GET) --
  const handleQuery = async () => {
    const errs = [];
    if (!jwtToken.trim()) errs.push('Informe o JWT Token.');
    const empErr = validateEmpregador(nrInscricaoEmpregador);
    if (empErr) errs.push(empErr);
    if (!/^\d+$/.test(String(queryNrLote))) {
      errs.push('nrLote deve ser um inteiro.');
    }
    setValidationErrors(errs);
    if (errs.length > 0) return;

    const url = `/api/consultarlote?nrInscricaoEmpregador=${encodeURIComponent(
      onlyDigits(nrInscricaoEmpregador)
    )}&nrLote=${encodeURIComponent(queryNrLote)}`;

    await doRequest(() => fetch(url, { method: 'GET', headers: authHeaders() }));
  };

  const doRequest = async (fetcher) => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetcher();
      let data = null;
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }
      setResult({ status: res.status, ok: res.ok, data });
    } catch (e) {
      setResult({ error: e?.message || 'Erro de rede desconhecido.' });
    } finally {
      setLoading(false);
    }
  };

  // -- Render --
  return (
    <div className="mx-auto max-w-5xl p-4 text-gray-900">
      <h1 className="text-xl font-bold">eSocial Consignado — Recepção de Lote</h1>
      <p className="text-sm text-gray-500">
        Ambiente: Produção Restrita (SERPRO) · Crédito do Trabalhador
      </p>

      {/* Aviso CORS */}
      <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
        ⚠️ Esta API exige proxy backend por restrições de CORS. As requisições abaixo passam
        pelas API Routes deste servidor Next.js (<code>/api/receberlote</code>,{' '}
        <code>/api/consultarlote</code>), que repassam ao SERPRO — o navegador nunca chama a
        API do governo diretamente.
      </div>

      {/* Configuração compartilhada */}
      <div className="mt-4 grid gap-3 rounded border border-gray-200 bg-gray-50 p-3 md:grid-cols-2">
        <Field label="JWT Token (Bearer)" hint="Token obtido externamente.">
          <textarea
            className={`${inputClass} h-20 font-mono`}
            value={jwtToken}
            onChange={(e) => setJwtToken(e.target.value)}
            placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6..."
          />
        </Field>
        <Field label="nrInscricaoEmpregador" hint="8 (CNPJ raiz) ou 14 dígitos.">
          <input
            className={inputClass}
            value={nrInscricaoEmpregador}
            onChange={(e) => setNrInscricaoEmpregador(e.target.value)}
            placeholder="00000000000000"
            inputMode="numeric"
          />
        </Field>
      </div>

      {/* Abas */}
      <div className="mt-4 flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('send')}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'send'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Receber Lote
        </button>
        <button
          onClick={() => setActiveTab('query')}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'query'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Consultar Lote
        </button>
      </div>

      {/* Erros de validação */}
      {validationErrors.length > 0 && (
        <ul className="mt-3 list-inside list-disc rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {validationErrors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      {/* Conteúdo das abas */}
      {activeTab === 'send' ? (
        <section className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="nrLote" hint="Inteiro, 2 dígitos, sequencial por empregador.">
              <input
                className={`${inputClass} w-28`}
                value={nrLote}
                onChange={(e) => setNrLote(onlyDigits(e.target.value).slice(0, 2))}
                placeholder="01"
                inputMode="numeric"
              />
            </Field>
            <span className="text-sm text-gray-500">
              {lote.length} / 10 registro(s)
            </span>
          </div>

          {lote.map((r, idx) => (
            <div key={idx} className="relative rounded border border-gray-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-600">
                  Registro {idx + 1}
                </span>
                <button
                  onClick={() => removeRecord(idx)}
                  disabled={lote.length <= 1}
                  className="rounded px-2 py-0.5 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-300"
                  title="Remover registro"
                >
                  ✕
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Field label="CPF do Trabalhador" hint="11 dígitos.">
                  <input
                    className={inputClass}
                    value={r.nrCpfTrabalhador}
                    onChange={(e) =>
                      updateRecord(idx, 'nrCpfTrabalhador', onlyDigits(e.target.value).slice(0, 11))
                    }
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Matrícula" hint="Até 30 caracteres.">
                  <input
                    className={inputClass}
                    value={r.cdMatricula}
                    onChange={(e) => updateRecord(idx, 'cdMatricula', e.target.value.slice(0, 30))}
                  />
                </Field>
                <Field label="Tipo Inscrição">
                  <select
                    className={inputClass}
                    value={r.tpInscricao}
                    onChange={(e) => updateRecord(idx, 'tpInscricao', e.target.value)}
                  >
                    <option value="1">1 - CNPJ</option>
                    <option value="2">2 - CPF</option>
                  </select>
                </Field>
                <Field
                  label="Nº Inscrição Empregador"
                  hint={r.tpInscricao === '1' ? 'CNPJ: 8 ou 14 dígitos.' : 'CPF: 11 dígitos.'}
                >
                  <input
                    className={inputClass}
                    value={r.nrInscricao}
                    onChange={(e) =>
                      updateRecord(idx, 'nrInscricao', onlyDigits(e.target.value).slice(0, 14))
                    }
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Nº Contrato" hint="Até 15 caracteres.">
                  <input
                    className={inputClass}
                    value={r.nrContratoEmprestimo}
                    onChange={(e) =>
                      updateRecord(idx, 'nrContratoEmprestimo', e.target.value.slice(0, 15))
                    }
                  />
                </Field>
                <Field label="Nº Inst. Financeira" hint="Ex: 001.">
                  <input
                    className={inputClass}
                    value={r.nrInstituicaoFinanceiro}
                    onChange={(e) =>
                      updateRecord(
                        idx,
                        'nrInstituicaoFinanceiro',
                        onlyDigits(e.target.value).slice(0, 3)
                      )
                    }
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Valor da Parcela" hint="Formato 99999.99.">
                  <input
                    className={inputClass}
                    value={r.vlParcela}
                    onChange={(e) => updateRecord(idx, 'vlParcela', e.target.value)}
                    placeholder="1234.56"
                  />
                </Field>
                <Field label="Competência Desconto" hint="Formato AAAAMM.">
                  <input
                    className={inputClass}
                    value={r.nrCompetenciaDesconto}
                    onChange={(e) =>
                      updateRecord(
                        idx,
                        'nrCompetenciaDesconto',
                        onlyDigits(e.target.value).slice(0, 6)
                      )
                    }
                    placeholder="202606"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Categoria" hint="Tabela 01 do eSocial.">
                  <select
                    className={inputClass}
                    value={r.cdCategoria}
                    onChange={(e) => updateRecord(idx, 'cdCategoria', e.target.value)}
                  >
                    <option value="">— selecione —</option>
                    {CATEGORIAS.map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Data Início" hint="Formato AAAA-MM-DD HH:mm:ss.">
                  <input
                    className={inputClass}
                    value={r.dtInicioEmprestimo}
                    onChange={(e) => updateRecord(idx, 'dtInicioEmprestimo', e.target.value)}
                    placeholder="2026-06-29 00:00:00"
                  />
                </Field>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={addRecord}
              disabled={lote.length >= 10}
              className="rounded border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-300"
            >
              + Adicionar Registro
            </button>
            <button
              onClick={handleSend}
              disabled={loading}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? 'Enviando…' : 'Enviar Lote'}
            </button>
          </div>
        </section>
      ) : (
        <section className="mt-4 space-y-4">
          <Field label="nrLote" hint="Inteiro.">
            <input
              className={`${inputClass} w-40`}
              value={queryNrLote}
              onChange={(e) => setQueryNrLote(onlyDigits(e.target.value))}
              placeholder="1"
              inputMode="numeric"
            />
          </Field>
          <button
            onClick={handleQuery}
            disabled={loading}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'Consultando…' : 'Consultar'}
          </button>
        </section>
      )}

      {/* Resposta */}
      <ResponseView result={result} />
    </div>
  );
}
