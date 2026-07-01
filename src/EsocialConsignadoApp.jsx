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

function formatBRL(value) {
  if (!value) return '';
  const numeric = parseFloat(value);
  if (isNaN(numeric)) return '';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(numeric);
}

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
  if (!r.vlParcela) {
    errs.push(`${tag}: Valor da parcela é obrigatório.`);
  } else if (!/^\d+\.\d{2}$/.test(r.vlParcela)) {
    errs.push(`${tag}: Valor da parcela deve estar no formato 99999.99.`);
  }
  if (!r.nrCompetenciaDesconto) {
    errs.push(`${tag}: Competência é obrigatória.`);
  } else if (!/^\d{6}$/.test(r.nrCompetenciaDesconto)) {
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
  if (!r.dtInicioEmprestimo) {
    errs.push(`${tag}: Data início é obrigatória.`);
  } else if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.dtInicioEmprestimo)) {
    errs.push(`${tag}: Data início deve estar no formato AAAA-MM-DD HH:mm:ss.`);
  }
  return errs;
}

// ---- Importação via JSON colado -------------------------------------------

// Converte "MM/YYYY" ou "MMYYYY" (ordem mês-ano usada pelo sistema de origem)
// para o formato interno "YYYYMM".
function parseCompetenciaExterna(raw) {
  const s = String(raw ?? '').trim();
  const comBarra = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (comBarra) {
    const [, mm, yyyy] = comBarra;
    return `${yyyy}${mm.padStart(2, '0')}`;
  }
  if (/^\d{6}$/.test(s)) {
    return `${s.slice(2)}${s.slice(0, 2)}`;
  }
  return onlyDigits(s).slice(0, 6);
}

// Converte "DD/MM/YYYY" para o formato interno "YYYY-MM-DD HH:mm:ss".
function parseDataExterna(raw) {
  const m = String(raw ?? '')
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')} 00:00:00`;
}

function mapExternalRecord(item) {
  const empDigits = onlyDigits(String(item?.numeroInscricaoEmpregador ?? ''));
  const empDescricao = String(item?.['inscricaoEmpregador.descricao'] ?? '').toUpperCase();
  const tpInscricao = empDescricao.includes('CNPJ')
    ? '1'
    : empDescricao.includes('CPF')
    ? '2'
    : empDigits.length === 11
    ? '2'
    : '1';

  const valorParcelaNum = Number(item?.valorParcela);
  const vlParcela = item?.valorParcela != null && !isNaN(valorParcelaNum) ? valorParcelaNum.toFixed(2) : '';

  return {
    nrCpfTrabalhador: onlyDigits(String(item?.cpf ?? '')),
    cdMatricula: String(item?.matricula ?? '').slice(0, 30),
    tpInscricao,
    nrInscricao: empDigits,
    nrContratoEmprestimo: String(item?.contrato ?? '').slice(0, 15),
    nrInstituicaoFinanceiro: onlyDigits(String(item?.['ifConcessora.codigo'] ?? '')).slice(0, 3),
    vlParcela,
    nrCompetenciaDesconto: parseCompetenciaExterna(item?.competencia ?? item?.competenciaInicioDesconto),
    cdCategoria: String(item?.['categoriaTrabalhador.codigo'] ?? ''),
    dtInicioEmprestimo: parseDataExterna(item?.dataInicioContrato),
  };
}

// ---- Componentes de UI ----------------------------------------------------

const THEMES = {
  blue: {
    bg: 'bg-slate-50 text-slate-900 min-h-screen transition-colors duration-200 pb-12',
    card: 'bg-white border border-slate-200 shadow-sm rounded-xl p-5',
    cardHeader: 'bg-slate-50 border-b border-slate-200 px-4 py-3 rounded-t-xl',
    input: 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all text-slate-900',
    btnPrimary: 'bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm focus:ring-2 focus:ring-indigo-200',
    btnSecondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium py-2 px-4 rounded-lg shadow-sm transition-all text-sm focus:ring-2 focus:ring-slate-100',
    btnDanger: 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-medium py-2 px-4 rounded-lg transition-all text-sm focus:ring-2 focus:ring-red-200',
    tabActive: 'border-indigo-600 text-indigo-600 font-semibold border-b-2 px-4 py-2 text-sm transition-all',
    tabInactive: 'text-slate-500 hover:text-slate-700 px-4 py-2 text-sm transition-all',
    badgeOk: 'bg-green-50 text-green-700 border border-green-200',
    badgeErr: 'bg-red-50 text-red-700 border-red-200',
    th: 'bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 px-4 py-3 text-left text-xs uppercase tracking-wider',
    td: 'border-b border-slate-100 px-4 py-3 align-middle text-sm text-slate-800',
    trEven: 'bg-white hover:bg-slate-50/50 transition-colors',
    trOdd: 'bg-slate-50/30 hover:bg-slate-50/55 transition-colors',
    textMuted: 'text-slate-500 text-xs mt-1',
    label: 'font-medium text-slate-700 text-sm mb-1',
  },
  emerald: {
    bg: 'bg-zinc-50 text-zinc-900 min-h-screen transition-colors duration-200 pb-12',
    card: 'bg-white border border-zinc-200 shadow-sm rounded-xl p-5',
    cardHeader: 'bg-zinc-50 border-b border-zinc-200 px-4 py-3 rounded-t-xl',
    input: 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all text-zinc-900',
    btnPrimary: 'bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm focus:ring-2 focus:ring-emerald-200',
    btnSecondary: 'bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-300 font-medium py-2 px-4 rounded-lg shadow-sm transition-all text-sm focus:ring-2 focus:ring-zinc-100',
    btnDanger: 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-medium py-2 px-4 rounded-lg transition-all text-sm focus:ring-2 focus:ring-red-200',
    tabActive: 'border-emerald-600 text-emerald-600 font-semibold border-b-2 px-4 py-2 text-sm transition-all',
    tabInactive: 'text-zinc-500 hover:text-zinc-700 px-4 py-2 text-sm transition-all',
    badgeOk: 'bg-green-50 text-green-700 border border-green-200',
    badgeErr: 'bg-red-50 text-red-700 border-red-200',
    th: 'bg-zinc-50 text-zinc-700 font-semibold border-b border-zinc-200 px-4 py-3 text-left text-xs uppercase tracking-wider',
    td: 'border-b border-zinc-100 px-4 py-3 align-middle text-sm text-zinc-800',
    trEven: 'bg-white hover:bg-zinc-50/50 transition-colors',
    trOdd: 'bg-zinc-50/30 hover:bg-zinc-50/55 transition-colors',
    textMuted: 'text-zinc-500 text-xs mt-1',
    label: 'font-medium text-zinc-700 text-sm mb-1',
  },
  dark: {
    bg: 'bg-zinc-950 text-zinc-100 min-h-screen transition-colors duration-200 pb-12',
    card: 'bg-zinc-900 border border-zinc-800 shadow-md rounded-xl p-5',
    cardHeader: 'bg-zinc-900/50 border-b border-zinc-850 px-4 py-3 rounded-t-xl',
    input: 'w-full rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-950 transition-all placeholder:text-zinc-500',
    btnPrimary: 'bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-bold py-2 px-4 rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm focus:ring-2 focus:ring-cyan-300',
    btnSecondary: 'bg-zinc-800 hover:bg-zinc-750 text-zinc-205 border border-zinc-700 font-medium py-2 px-4 rounded-lg shadow-sm transition-all text-sm focus:ring-2 focus:ring-zinc-700 text-zinc-200',
    btnDanger: 'bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-900/50 font-medium py-2 px-4 rounded-lg transition-all text-sm focus:ring-2 focus:ring-red-900',
    tabActive: 'border-cyan-400 text-cyan-400 font-semibold border-b-2 px-4 py-2 text-sm transition-all',
    tabInactive: 'text-zinc-400 hover:text-zinc-200 px-4 py-2 text-sm transition-all',
    badgeOk: 'bg-green-950/50 text-green-400 border-green-900/50',
    badgeErr: 'bg-red-950/50 text-red-400 border-red-900/50',
    th: 'bg-zinc-900 text-zinc-300 font-semibold border-b border-zinc-800 px-4 py-3 text-left text-xs uppercase tracking-wider',
    td: 'border-b border-zinc-800 px-4 py-3 align-middle text-sm text-zinc-300',
    trEven: 'bg-zinc-900 hover:bg-zinc-800/50 transition-colors',
    trOdd: 'bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors',
    textMuted: 'text-zinc-500 text-xs mt-1',
    label: 'font-medium text-zinc-300 text-sm mb-1',
  },
  amber: {
    bg: 'bg-stone-50 text-stone-900 min-h-screen transition-colors duration-200 pb-12',
    card: 'bg-white border border-stone-200 shadow-sm rounded-xl p-5',
    cardHeader: 'bg-stone-50 border-b border-stone-200 px-4 py-3 rounded-t-xl',
    input: 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all text-stone-900',
    btnPrimary: 'bg-amber-600 hover:bg-amber-700 text-white font-medium py-2 px-4 rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm focus:ring-2 focus:ring-amber-200',
    btnSecondary: 'bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 font-medium py-2 px-4 rounded-lg shadow-sm transition-all text-sm focus:ring-2 focus:ring-stone-100',
    btnDanger: 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-medium py-2 px-4 rounded-lg transition-all text-sm focus:ring-2 focus:ring-red-200',
    tabActive: 'border-amber-600 text-amber-600 font-semibold border-b-2 px-4 py-2 text-sm transition-all',
    tabInactive: 'text-stone-505 hover:text-stone-700 px-4 py-2 text-sm transition-all',
    badgeOk: 'bg-green-50 text-green-700 border border-green-200',
    badgeErr: 'bg-red-50 text-red-700 border-red-200',
    th: 'bg-stone-50 text-stone-700 font-semibold border-b border-stone-200 px-4 py-3 text-left text-xs uppercase tracking-wider',
    td: 'border-b border-stone-100 px-4 py-3 align-middle text-sm text-stone-850',
    trEven: 'bg-white hover:bg-stone-50/50 transition-colors',
    trOdd: 'bg-stone-50/30 hover:bg-stone-50/55 transition-colors',
    textMuted: 'text-stone-500 text-xs mt-1',
    label: 'font-medium text-stone-700 text-sm mb-1',
  }
};

function Field({ label, hint, children, t }) {
  const labelClass = t?.label || 'font-medium text-gray-700 text-sm';
  const textMutedClass = t?.textMuted || 'text-xs text-gray-400';
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className={textMutedClass}>{hint}</span>}
    </label>
  );
}

function formatDateBRL(raw) {
  if (!raw) return '';
  const datePart = raw.slice(0, 10);
  const parts = datePart.split('-');
  if (parts.length !== 3) return raw;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function StatusBadge({ status, ok, t }) {
  if (status == null) return null;
  const color = ok
    ? t?.badgeOk || 'bg-green-100 text-green-800 border-green-300'
    : t?.badgeErr || 'bg-red-100 text-red-800 border-red-300';
  return (
    <span className={`inline-block rounded-lg border px-2.5 py-1 text-xs font-semibold ${color}`}>
      HTTP {status}
    </span>
  );
}

const FRIENDLY_LABELS = {
  nrcpftrabalhador: 'CPF do Trabalhador',
  cdmatricula: 'Matrícula',
  tpinscricao: 'Tipo Inscrição',
  nrinscricao: 'Nº Inscrição',
  nrcontratoemprestimo: 'Nº Contrato',
  nrinstituicaofinanceiro: 'Inst. Financeira',
  vlparcela: 'Valor Parcela',
  nrcompetenciadesconto: 'Competência',
  cdcategoria: 'Categoria',
  dtinicioemprestimo: 'Data Início',
};

function getFriendlyHeader(key) {
  const norm = key.toLowerCase();
  return FRIENDLY_LABELS[norm] || key;
}

function formatFriendlyCell(key, value) {
  if (value == null) return '';
  const norm = key.toLowerCase();
  
  switch (norm) {
    case 'nrcpftrabalhador': {
      const clean = String(value).replace(/\D/g, '');
      if (clean.length === 11) {
        return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
      }
      return clean || String(value);
    }
    
    case 'tpinscricao': {
      if (String(value) === '1') return '1 - CNPJ';
      if (String(value) === '2') return '2 - CPF';
      return String(value);
    }
    
    case 'nrinscricao': {
      const clean = String(value).replace(/\D/g, '');
      if (clean.length === 14) {
        return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12)}`;
      }
      if (clean.length === 11) {
        return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
      }
      return clean || String(value);
    }
    
    case 'vlparcela': {
      return formatBRL(value);
    }
    
    case 'nrcompetenciadesconto': {
      const clean = String(value).replace(/\D/g, '');
      if (clean.length === 6) {
        return `${clean.slice(4)}/${clean.slice(0, 4)}`;
      }
      return clean || String(value);
    }
    
    case 'cdcategoria': {
      const categoryCode = String(value).trim();
      const match = CATEGORIAS.find(([code]) => code === categoryCode);
      return match ? match[1] : categoryCode;
    }
    
    case 'dtinicioemprestimo': {
      const rawDate = String(value);
      if (rawDate.includes('T')) {
        const parts = rawDate.split('T')[0].split('-');
        if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }
      const cleanDate = rawDate.slice(0, 10);
      const parts = cleanDate.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return rawDate;
    }
    
    default:
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
  }
}

function DynamicTable({ rows, t, theme }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((k) => set.add(k));
      return set;
    }, new Set())
  );
  return (
    <div className={`overflow-x-auto rounded-xl border ${theme === 'dark' ? 'border-zinc-800' : 'border-slate-200'} shadow-sm`}>
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} className={t?.th || 'border border-gray-300 px-2 py-1 font-semibold'}>
                {getFriendlyHeader(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? t?.trEven : t?.trOdd}>
              {columns.map((c) => (
                <td key={c} className={t?.td || 'border border-gray-300 px-2 py-1 align-top'}>
                  {formatFriendlyCell(c, row?.[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatFriendlyErrorDetail(d) {
  if (!d) return null;
  let registro = d.Registro || d.registro || '';
  let mensagem = d.Mensagem || d.mensagem || '';
  
  if (registro.toLowerCase().startsWith('lote:')) {
    const num = registro.split(':')[1];
    registro = `Lote nº ${num}`;
  }
  
  const lowerMsg = mensagem.toLowerCase().trim();
  if (lowerMsg === 'lote nao encontrado' || lowerMsg === 'lote não encontrado') {
    mensagem = 'Lote não encontrado no sistema SERPRO.';
  } else if (lowerMsg === 'lote em processamento') {
    mensagem = 'O lote ainda está sendo processado.';
  }
  
  return { registro, mensagem };
}

function ResponseView({ result, t, theme }) {
  if (!result) return null;
  const { status, ok, data, error } = result;

  if (error) {
    return (
      <div className={`mt-4 rounded-xl border p-4 text-sm ${t?.badgeErr || 'border-red-300 bg-red-50 text-red-800'}`}>
        <p className="font-semibold">Falha na requisição</p>
        <p className="mt-1">{error}</p>
        <p className="mt-2 text-xs opacity-75">
          Possíveis causas: servidor Next.js fora do ar, indisponibilidade da API do SERPRO,
          token inválido ou ausência de conectividade com o ambiente de produção restrita.
        </p>
      </div>
    );
  }

  const businessFailure = Boolean(data?.title) && /falha|erro/i.test(data.title);
  const errorDetails = businessFailure && Array.isArray(data?.details) ? data.details : null;

  const rows = Array.isArray(data?.retornoLote)
    ? data.retornoLote
    : !businessFailure && Array.isArray(data?.details)
    ? data.details
    : null;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={status} ok={ok && !businessFailure} t={t} />
        {data?.title && (
          <span className={`font-semibold ${businessFailure ? 'text-red-600' : ''}`}>
            {businessFailure ? '⚠️ ' : ''}
            {data.title}
          </span>
        )}
      </div>

      {data?.traceId && (
        <p className="text-xs opacity-60">
          traceId: <code className={`rounded px-1.5 py-0.5 ${theme === 'dark' ? 'bg-zinc-800 text-zinc-300' : 'bg-gray-150 text-gray-700'}`}>{data.traceId}</code>
        </p>
      )}

      {errorDetails && (
        <div className={`rounded-xl border p-4 text-sm space-y-2.5 ${t?.badgeErr || 'border-red-300 bg-red-50 text-red-800'}`}>
          <div className="flex items-center gap-2 font-bold border-b border-red-200/40 pb-2 mb-2 opacity-90">
            <span>⚠️</span>
            <span>Detalhes da Falha no Processamento:</span>
          </div>
          <div className="space-y-2">
            {errorDetails.map((d, i) => {
              const friendly = formatFriendlyErrorDetail(d);
              if (!friendly) return null;
              return (
                <div key={i} className="flex flex-col md:flex-row md:items-start gap-1 md:gap-2 pt-1 first:pt-0">
                  {friendly.registro && (
                    <span className="font-bold min-w-[100px] text-red-700 dark:text-red-300">
                      [{friendly.registro}]
                    </span>
                  )}
                  <span className="opacity-95">{friendly.mensagem}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {rows && <DynamicTable rows={rows} t={t} theme={theme} />}

      <details className={`rounded-xl border ${theme === 'dark' ? 'border-zinc-800 bg-zinc-900/30' : 'border-gray-200 bg-gray-50'}`}>
        <summary className={`cursor-pointer select-none px-4 py-3 text-sm font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-gray-700'}`}>
          Raw JSON
        </summary>
        <pre className="overflow-x-auto px-4 pb-4 text-xs font-mono opacity-85">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

// ---- App principal --------------------------------------------------------

export default function EsocialConsignadoApp() {
  const [theme, setTheme] = useState('blue');
  const [jwtToken, setJwtToken] = useState('');
  const [nrInscricaoEmpregador, setNrInscricaoEmpregador] = useState('');
  const [activeTab, setActiveTab] = useState('send'); // 'send' | 'query'

  // Aba "Enviar Dados em Lote"
  const [nrLote, setNrLote] = useState('');
  const [lote, setLote] = useState([]);

  // Controle de CRUD
  const [editingIndex, setEditingIndex] = useState(null); // null = fechado, -1 = inserindo, >= 0 = editando
  const [formRecord, setFormRecord] = useState(emptyRecord());
  const [formValidationErrors, setFormValidationErrors] = useState([]);

  // Aba "Consultar Lote"
  const [queryNrLote, setQueryNrLote] = useState('');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);

  // Importação via JSON colado
  const [jsonPaste, setJsonPaste] = useState('');
  const [jsonImportMsg, setJsonImportMsg] = useState(null); // { ok: bool, text: string }

  const handleImportJson = () => {
    let parsed;
    try {
      parsed = JSON.parse(jsonPaste);
    } catch (e) {
      setJsonImportMsg({ ok: false, text: `JSON inválido: ${e.message}` });
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      setJsonImportMsg({ ok: false, text: 'O conteúdo colado deve ser um array JSON não vazio.' });
      return;
    }

    const truncated = parsed.length > 10;
    const mapped = parsed.slice(0, 10).map(mapExternalRecord);
    setLote(mapped);
    setEditingIndex(null);
    setFormValidationErrors([]);

    const firstEmp = onlyDigits(String(parsed[0]?.numeroInscricaoEmpregador ?? ''));
    if (firstEmp) setNrInscricaoEmpregador(firstEmp);

    setJsonImportMsg({
      ok: true,
      text: truncated
        ? `${parsed.length} registros encontrados; apenas os 10 primeiros foram importados (limite da API).`
        : `${mapped.length} registro(s) importado(s) com sucesso.`,
    });
  };

  // -- Manipulação do CRUD em lote --
  const removeRecord = (idx) => {
    setLote((prev) => prev.filter((_, i) => i !== idx));
    if (editingIndex === idx) {
      setEditingIndex(null);
      setFormValidationErrors([]);
    } else if (editingIndex !== null && editingIndex > idx) {
      setEditingIndex((prev) => prev - 1);
    }
  };

  const handleNewClick = () => {
    if (lote.length >= 10) return;
    setFormRecord(emptyRecord());
    setFormValidationErrors([]);
    setEditingIndex(-1);
  };

  const handleEditClick = (idx) => {
    setFormRecord({ ...lote[idx] });
    setFormValidationErrors([]);
    setEditingIndex(idx);
  };

  const handleFormCancel = () => {
    setEditingIndex(null);
    setFormValidationErrors([]);
  };

  const handleFormSave = () => {
    const idx = editingIndex === -1 ? lote.length : editingIndex;
    const errs = validateRecord(formRecord, idx);
    if (errs.length > 0) {
      setFormValidationErrors(errs);
      return;
    }
    setFormValidationErrors([]);
    if (editingIndex === -1) {
      setLote((prev) => [...prev, formRecord]);
    } else {
      setLote((prev) => prev.map((item, i) => (i === editingIndex ? formRecord : item)));
    }
    setEditingIndex(null);
  };

  const updateFormRecord = (field, value) => {
    setFormRecord((prev) => ({ ...prev, [field]: value }));
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
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {}
        }
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
  const t = THEMES[theme];

  return (
    <div className={t.bg}>
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        
        {/* Header da Página com Theme Switcher */}
        <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-4 ${theme === 'dark' ? 'border-zinc-800' : 'border-slate-200'}`}>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">eSocial Consignado — Enviar Dados em Lote</h1>
            <p className="text-sm opacity-70">
              Ambiente: Produção Restrita (SERPRO) · Crédito do Trabalhador
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-80">Tema:</span>
            <div className={`flex items-center gap-1 rounded-lg border p-1 ${theme === 'dark' ? 'bg-zinc-900 border-zinc-850' : 'bg-white border-slate-200'} shadow-sm`}>
              {Object.entries({
                blue: { label: 'Blue', dot: 'bg-indigo-600' },
                emerald: { label: 'Mint', dot: 'bg-emerald-600' },
                dark: { label: 'Dark', dot: 'bg-zinc-400 border border-zinc-650' },
                amber: { label: 'Amber', dot: 'bg-amber-600' },
              }).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setTheme(k)}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all ${
                    theme === k
                      ? (theme === 'dark' ? 'bg-zinc-800 text-white shadow-sm' : 'bg-slate-100 text-slate-900 shadow-sm')
                      : (theme === 'dark' ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-500 hover:text-slate-800')
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${v.dot}`} />
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Configuração compartilhada */}
        <div className={t.card}>
          <h2 className="text-sm font-bold uppercase tracking-wider mb-3 opacity-75">Configurações de Autenticação & Empregador</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="JWT Token (Bearer)" hint="Token obtido externamente." t={t}>
              <textarea
                className={`${t.input} h-20 font-mono`}
                value={jwtToken}
                onChange={(e) => setJwtToken(e.target.value)}
                placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6..."
              />
            </Field>
            <Field label="nrInscricaoEmpregador" hint="8 (CNPJ raiz) ou 14 dígitos." t={t}>
              <input
                className={t.input}
                value={nrInscricaoEmpregador}
                onChange={(e) => setNrInscricaoEmpregador(e.target.value)}
                placeholder="00000000000000"
                inputMode="numeric"
              />
            </Field>
          </div>
        </div>

        {/* Abas */}
        <div className={`flex gap-2 border-b ${theme === 'dark' ? 'border-zinc-800' : 'border-slate-200'}`}>
          <button
            onClick={() => setActiveTab('send')}
            className={activeTab === 'send' ? t.tabActive : t.tabInactive}
          >
            Enviar Dados em Lote
          </button>
          <button
            onClick={() => setActiveTab('query')}
            className={activeTab === 'query' ? t.tabActive : t.tabInactive}
          >
            Consultar Lote
          </button>
        </div>

        {/* Erros de validação do envio */}
        {validationErrors.length > 0 && (
          <ul className={`list-inside list-disc rounded-xl border p-4 text-sm ${t.badgeErr}`}>
            {validationErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}

        {/* Conteúdo das abas */}
        {activeTab === 'send' ? (
          <section className="space-y-6">
            
            {/* Importar via JSON */}
            <details className={`${t.card} group`}>
              <summary className="cursor-pointer select-none font-bold text-sm uppercase tracking-wider opacity-80 focus:outline-none flex justify-between items-center">
                <span>Importar registros colando um array JSON</span>
                <span className="text-xs opacity-60 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="space-y-3 pt-3">
                <textarea
                  className={`${t.input} h-32 w-full font-mono`}
                  value={jsonPaste}
                  onChange={(e) => setJsonPaste(e.target.value)}
                  placeholder='[ { "cpf": "...", "matricula": "...", ... } ]'
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleImportJson}
                    className={t.btnSecondary}
                  >
                    Importar JSON
                  </button>
                  {jsonImportMsg && (
                    <p className={`text-sm ${jsonImportMsg.ok ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}`}>
                      {jsonImportMsg.text}
                    </p>
                  )}
                </div>
              </div>
            </details>

            {/* Controle do Lote e Grid */}
            <div className={`${t.card} space-y-4`}>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-3 border-inherit">
                <div className="flex items-end gap-3">
                  <Field label="nrLote" hint="Inteiro, 2 dígitos." t={t}>
                    <input
                      className={`${t.input} w-24`}
                      value={nrLote}
                      onChange={(e) => setNrLote(onlyDigits(e.target.value).slice(0, 2))}
                      placeholder="01"
                      inputMode="numeric"
                    />
                  </Field>
                </div>
                <div className="text-sm font-semibold opacity-80">
                  Registros no Lote: <span className="text-lg font-bold text-indigo-600 dark:text-cyan-400">{lote.length}</span> / 10
                </div>
              </div>

              {/* Grid de Registros */}
              {lote.length === 0 ? (
                <div className={`p-8 text-center rounded-xl border-2 border-dashed ${theme === 'dark' ? 'border-zinc-800 text-zinc-400' : 'border-slate-200 text-slate-500'}`}>
                  <p className="font-medium">Nenhum registro adicionado ao lote ainda.</p>
                  <p className="text-xs opacity-75 mt-1">Adicione um novo registro pelo botão abaixo ou cole um JSON para importar.</p>
                </div>
              ) : (
                <div className={`overflow-x-auto rounded-xl border ${theme === 'dark' ? 'border-zinc-800' : 'border-slate-200'} shadow-sm`}>
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={t.th}>#</th>
                        <th className={t.th}>CPF</th>
                        <th className={t.th}>Matrícula</th>
                        <th className={t.th}>Contrato</th>
                        <th className={t.th}>Valor Parcela</th>
                        <th className={t.th}>Competência</th>
                        <th className={t.th}>Data Início</th>
                        <th className={`${t.th} text-right`}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lote.map((r, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? t.trEven : t.trOdd}>
                          <td className={t.td}>{idx + 1}</td>
                          <td className={t.td}>{r.nrCpfTrabalhador}</td>
                          <td className={t.td}>{r.cdMatricula}</td>
                          <td className={t.td}>{r.nrContratoEmprestimo}</td>
                          <td className={t.td}>{formatBRL(r.vlParcela)}</td>
                          <td className={t.td}>
                            {r.nrCompetenciaDesconto && r.nrCompetenciaDesconto.length === 6
                              ? `${r.nrCompetenciaDesconto.slice(4)}/${r.nrCompetenciaDesconto.slice(0, 4)}`
                              : r.nrCompetenciaDesconto}
                          </td>
                          <td className={t.td}>
                            {r.dtInicioEmprestimo ? formatDateBRL(r.dtInicioEmprestimo) : ''}
                          </td>
                          <td className={`${t.td} text-right space-x-2`}>
                            <button
                              onClick={() => handleEditClick(idx)}
                              className="text-indigo-600 dark:text-cyan-400 hover:underline font-semibold text-xs"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => removeRecord(idx)}
                              className="text-red-500 hover:underline font-semibold text-xs"
                            >
                              Excluir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Botões de Ação do Grid */}
              <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
                <button
                  onClick={handleNewClick}
                  disabled={lote.length >= 10}
                  className={t.btnSecondary}
                >
                  + Adicionar Registro
                </button>
                <button
                  onClick={handleSend}
                  disabled={loading || lote.length === 0}
                  className={t.btnPrimary}
                >
                  {loading ? 'Enviando…' : 'Enviar Lote'}
                </button>
              </div>
            </div>

            {/* Formulário do CRUD (Inserir/Editar) */}
            {editingIndex !== null && (
              <div className={`${t.card} border-2 border-indigo-500/25 dark:border-cyan-400/25 scroll-mt-6`}>
                <div className="flex justify-between items-center border-b pb-3 mb-4 border-inherit">
                  <h3 className="font-bold text-lg">
                    {editingIndex === -1 ? 'Novo Registro' : `Editar Registro #${editingIndex + 1}`}
                  </h3>
                  <button
                    onClick={handleFormCancel}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg focus:outline-none"
                  >
                    ✕
                  </button>
                </div>

                {/* Erros de validação específicos do formulário */}
                {formValidationErrors.length > 0 && (
                  <div className={`mb-4 rounded-lg border p-3 text-sm ${t.badgeErr}`}>
                    <p className="font-semibold mb-1">Erros no formulário:</p>
                    <ul className="list-inside list-disc space-y-0.5">
                      {formValidationErrors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <Field label="CPF do Trabalhador" hint="11 dígitos." t={t}>
                    <input
                      className={t.input}
                      value={formRecord.nrCpfTrabalhador}
                      onChange={(e) =>
                        updateFormRecord('nrCpfTrabalhador', onlyDigits(e.target.value).slice(0, 11))
                      }
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Matrícula" hint="Até 30 caracteres." t={t}>
                    <input
                      className={t.input}
                      value={formRecord.cdMatricula}
                      onChange={(e) => updateFormRecord('cdMatricula', e.target.value.slice(0, 30))}
                    />
                  </Field>
                  <Field label="Tipo Inscrição" t={t}>
                    <select
                      className={t.input}
                      value={formRecord.tpInscricao}
                      onChange={(e) => updateFormRecord('tpInscricao', e.target.value)}
                    >
                      <option value="1">1 - CNPJ</option>
                      <option value="2">2 - CPF</option>
                    </select>
                  </Field>
                  <Field
                    label="Nº Inscrição Empregador"
                    hint={formRecord.tpInscricao === '1' ? 'CNPJ: 8 ou 14 dígitos.' : 'CPF: 11 dígitos.'}
                    t={t}
                  >
                    <input
                      className={t.input}
                      value={formRecord.nrInscricao}
                      onChange={(e) =>
                        updateFormRecord('nrInscricao', onlyDigits(e.target.value).slice(0, 14))
                      }
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Nº Contrato" hint="Até 15 caracteres." t={t}>
                    <input
                      className={t.input}
                      value={formRecord.nrContratoEmprestimo}
                      onChange={(e) =>
                        updateFormRecord('nrContratoEmprestimo', e.target.value.slice(0, 15))
                      }
                    />
                  </Field>
                  <Field label="Nº Inst. Financeira" hint="Ex: 001." t={t}>
                    <input
                      className={t.input}
                      value={formRecord.nrInstituicaoFinanceiro}
                      onChange={(e) =>
                        updateFormRecord('nrInstituicaoFinanceiro', onlyDigits(e.target.value).slice(0, 3))
                      }
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Valor da Parcela" hint="Preenchimento automático como moeda." t={t}>
                    <input
                      className={`${t.input} text-right`}
                      value={formatBRL(formRecord.vlParcela)}
                      onChange={(e) => {
                        const digits = onlyDigits(e.target.value);
                        if (!digits) {
                          updateFormRecord('vlParcela', '');
                          return;
                        }
                        const cents = parseInt(digits, 10);
                        const decimalValue = (cents / 100).toFixed(2);
                        updateFormRecord('vlParcela', decimalValue);
                      }}
                      placeholder="R$ 0,00"
                    />
                  </Field>
                  <Field label="Competência Desconto" hint="Selecione o mês/ano." t={t}>
                    <input
                      type="month"
                      className={t.input}
                      value={
                        formRecord.nrCompetenciaDesconto && formRecord.nrCompetenciaDesconto.length === 6
                          ? `${formRecord.nrCompetenciaDesconto.slice(0, 4)}-${formRecord.nrCompetenciaDesconto.slice(4)}`
                          : ''
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        const apiVal = val ? val.replace('-', '') : '';
                        updateFormRecord('nrCompetenciaDesconto', apiVal);
                      }}
                    />
                  </Field>
                  <Field label="Categoria" hint="Tabela 01 do eSocial." t={t}>
                    <select
                      className={t.input}
                      value={formRecord.cdCategoria}
                      onChange={(e) => updateFormRecord('cdCategoria', e.target.value)}
                    >
                      <option value="">— selecione —</option>
                      {CATEGORIAS.map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Data Início" hint="Selecione a data de início." t={t}>
                    <input
                      type="date"
                      className={t.input}
                      value={formRecord.dtInicioEmprestimo ? formRecord.dtInicioEmprestimo.slice(0, 10) : ''}
                      onChange={(e) => {
                        const dateVal = e.target.value;
                        updateFormRecord('dtInicioEmprestimo', dateVal ? `${dateVal} 00:00:00` : '');
                      }}
                    />
                  </Field>
                </div>

                <div className="flex gap-3 mt-6 justify-end border-t pt-4 border-inherit">
                  <button
                    onClick={handleFormCancel}
                    className={t.btnSecondary}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleFormSave}
                    className={t.btnPrimary}
                  >
                    Salvar
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-4">
            <div className={t.card}>
              <Field label="nrLote" hint="Inteiro." t={t}>
                <input
                  className={`${t.input} w-40`}
                  value={queryNrLote}
                  onChange={(e) => setQueryNrLote(onlyDigits(e.target.value))}
                  placeholder="1"
                  inputMode="numeric"
                />
              </Field>
              <div className="mt-4">
                <button
                  onClick={handleQuery}
                  disabled={loading}
                  className={t.btnPrimary}
                >
                  {loading ? 'Consultando…' : 'Consultar'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Resposta */}
        <ResponseView result={result} t={t} theme={theme} />
      </div>
    </div>
  );
}
