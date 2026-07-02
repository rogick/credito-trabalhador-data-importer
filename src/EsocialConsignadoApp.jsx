'use client';

import React, { useState, useEffect } from 'react';

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

// ---- Helpers para o Assistente Passo a Passo (Wizard) ---------------------

function calculateInstallment(vlEmprestimo, numParcelas, taxaJurosMensal) {
  const PV = parseFloat(vlEmprestimo);
  const n = parseInt(numParcelas, 10);
  const i = parseFloat(taxaJurosMensal) / 100;

  if (isNaN(PV) || PV <= 0 || isNaN(n) || n <= 0) return '0.00';
  if (isNaN(i) || i <= 0) {
    return (PV / n).toFixed(2);
  }

  // Fórmula Price: PMT = PV * (i * (1 + i)^n) / ((1 + i)^n - 1)
  const pmt = PV * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
  return isNaN(pmt) ? '0.00' : pmt.toFixed(2);
}

function getNextCompetency(startCompetency, index) {
  const cleanComp = startCompetency.replace(/\D/g, '');
  if (cleanComp.length !== 6) return '';
  const yyyy = parseInt(cleanComp.slice(0, 4), 10);
  const mm = parseInt(cleanComp.slice(4), 10);

  const totalMonths = yyyy * 12 + (mm - 1) + index;
  const nextY = Math.floor(totalMonths / 12);
  const nextM = (totalMonths % 12) + 1;

  return `${nextY}${String(nextM).padStart(2, '0')}`;
}

function generateInstallmentsList(wizardRecord, vlEmprestimo, numParcelas, taxaJuros, dtInicioEmprestimo, competenciaInicio) {
  const pmt = calculateInstallment(vlEmprestimo, numParcelas, taxaJuros);
  const n = parseInt(numParcelas, 10);
  const cleanComp = (competenciaInicio || '').replace(/\D/g, '');
  if (!cleanComp || cleanComp.length !== 6 || isNaN(n) || n <= 0) return [];

  const results = [];
  for (let i = 0; i < n; i++) {
    const comp = getNextCompetency(cleanComp, i);
    results.push({
      ...wizardRecord,
      vlParcela: pmt,
      nrCompetenciaDesconto: comp,
      dtInicioEmprestimo: dtInicioEmprestimo ? `${dtInicioEmprestimo.slice(0, 10)} 00:00:00` : '',
    });
  }
  return results;
}

function validateWizardStep1(r) {
  const errs = [];
  if (onlyDigits(r.nrCpfTrabalhador).length !== 11) {
    errs.push('CPF do trabalhador deve ter 11 dígitos.');
  }
  if (!r.cdMatricula.trim()) {
    errs.push('Matrícula é obrigatória.');
  } else if (r.cdMatricula.length > 30) {
    errs.push('Matrícula excede 30 caracteres.');
  }
  if (r.tpInscricao !== '1' && r.tpInscricao !== '2') {
    errs.push('Tipo de inscrição inválido.');
  } else {
    const insc = onlyDigits(r.nrInscricao);
    if (r.tpInscricao === '1' && insc.length !== 8 && insc.length !== 14) {
      errs.push('Nº inscrição (CNPJ) deve ter 8 ou 14 dígitos.');
    } else if (r.tpInscricao === '2' && insc.length !== 11) {
      errs.push('Nº inscrição (CPF) deve ter 11 dígitos.');
    }
  }
  if (!r.nrContratoEmprestimo.trim()) {
    errs.push('Nº do contrato é obrigatório.');
  } else if (r.nrContratoEmprestimo.length > 15) {
    errs.push('Nº do contrato excede 15 caracteres.');
  }
  if (!/^\d{1,3}$/.test(r.nrInstituicaoFinanceiro)) {
    errs.push('Nº da instituição financeira deve ter até 3 dígitos (ex: 001).');
  }
  if (!r.cdCategoria.trim()) {
    errs.push('Categoria é obrigatória.');
  }
  return errs;
}

function validateWizardStep2(vlEmp, numParc, taxaJ, dtInicio, compInicio) {
  const errs = [];
  const val = parseFloat(vlEmp);
  if (isNaN(val) || val <= 0) {
    errs.push('Valor do empréstimo deve ser maior que zero.');
  }
  const n = parseInt(numParc, 10);
  if (isNaN(n) || n <= 0 || n > 100) {
    errs.push('Número de parcelas deve ser entre 1 e 100.');
  }
  const tax = parseFloat(taxaJ);
  if (isNaN(tax) || tax < 0) {
    errs.push('Taxa de juros deve ser igual ou maior que zero.');
  }
  if (!dtInicio) {
    errs.push('Data de início do contrato é obrigatória.');
  } else if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dtInicio)) {
    errs.push('Data início deve estar no formato AAAA-MM-DD.');
  }
  if (!compInicio) {
    errs.push('Competência de início é obrigatória.');
  } else {
    const cleanComp = compInicio.replace(/\D/g, '');
    if (!/^\d{6}$/.test(cleanComp)) {
      errs.push('Competência deve estar no formato AAAA-MM.');
    } else {
      const mm = Number(cleanComp.slice(4));
      if (mm < 1 || mm > 13) {
        errs.push('Mês da competência inválido.');
      }
    }
  }
  return errs;
}

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

// ---- Importação via CSV ---------------------------------------------------

const CSV_HEADER_MAP = {
  cpf: 'nrCpfTrabalhador',
  cpftrabalhador: 'nrCpfTrabalhador',
  nrcpftrabalhador: 'nrCpfTrabalhador',

  matricula: 'cdMatricula',
  cdmatricula: 'cdMatricula',

  tpinscricao: 'tpInscricao',
  tipoinscricao: 'tpInscricao',

  nrinscricao: 'nrInscricao',
  ninscricao: 'nrInscricao',
  numeroinscricaoempregador: 'nrInscricao',
  inscricaoempregador: 'nrInscricao',

  contrato: 'nrContratoEmprestimo',
  ncontrato: 'nrContratoEmprestimo',
  nrcontrato: 'nrContratoEmprestimo',
  nrcontratoemprestimo: 'nrContratoEmprestimo',

  instituicao: 'nrInstituicaoFinanceiro',
  instfinanceira: 'nrInstituicaoFinanceiro',
  instituicaofinanceira: 'nrInstituicaoFinanceiro',
  nrinstituicaofinanceiro: 'nrInstituicaoFinanceiro',
  'ifconcessora.codigo': 'nrInstituicaoFinanceiro',

  valor: 'vlParcela',
  valorparcela: 'vlParcela',
  vlparcela: 'vlParcela',

  competencia: 'nrCompetenciaDesconto',
  competenciadesconto: 'nrCompetenciaDesconto',
  nrcompetenciadesconto: 'nrCompetenciaDesconto',

  categoria: 'cdCategoria',
  cdcategoria: 'cdCategoria',
  'categoriatrabalhador.codigo': 'cdCategoria',

  datainicio: 'dtInicioEmprestimo',
  dtinicioemprestimo: 'dtInicioEmprestimo',
  datainiciocontrato: 'dtInicioEmprestimo',
};

const normalizeHeader = (h) => {
  return String(h ?? '')
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]/g, '')
    .trim();
};

function parseCSVLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map(val => val.replace(/^"|"$/g, '').trim());
}

function parseValorParcela(raw) {
  if (!raw) return '';
  let s = String(raw).trim().replace(/[R$\s]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const num = Number(s);
  return isNaN(num) ? '' : num.toFixed(2);
}

function parseDataCSV(raw) {
  const s = String(raw ?? '').trim();
  const mBarra = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mBarra) {
    const [, dd, mm, yyyy] = mBarra;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')} 00:00:00`;
  }
  const mBarraHora = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (mBarraHora) {
    const [, dd, mm, yyyy, hh, min, ss] = mBarraHora;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')} ${hh}:${min}:${ss}`;
  }
  const mHifen = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (mHifen) {
    return `${s} 00:00:00`;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    return s;
  }
  return '';
}

function parseCompetenciaCSV(raw) {
  const s = String(raw ?? '').trim();
  const mBarra = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (mBarra) {
    const [, mm, yyyy] = mBarra;
    return `${yyyy}${mm.padStart(2, '0')}`;
  }
  const mHifen = s.match(/^(\d{4})-(\d{1,2})$/);
  if (mHifen) {
    const [, yyyy, mm] = mHifen;
    return `${yyyy}${mm.padStart(2, '0')}`;
  }
  const mMMYYYY = s.match(/^(\d{2})(\d{4})$/);
  if (mMMYYYY) {
    const [, mm, yyyy] = mMMYYYY;
    return `${yyyy}${mm}`;
  }
  if (/^\d{6}$/.test(s)) {
    const first4 = Number(s.slice(0, 4));
    if (first4 >= 2000 && first4 <= 2100) {
      return s;
    }
    return `${s.slice(2)}${s.slice(0, 2)}`;
  }
  return onlyDigits(s).slice(0, 6);
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
  const [theme, setTheme] = useState('system');
  const [systemIsDark, setSystemIsDark] = useState(false);

  // Carrega o tema do localStorage ao montar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('esocial-consignado-theme');
      if (saved && ['system', 'blue', 'emerald', 'dark', 'amber'].includes(saved)) {
        setTheme(saved);
      }
    }
  }, []);

  // Salva o tema no localStorage ao mudar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('esocial-consignado-theme', theme);
    }
  }, [theme]);

  // Escuta mudanças no esquema de cores do sistema
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemIsDark(mediaQuery.matches);

    const handler = (e) => {
      setSystemIsDark(e.matches);
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const getActiveTheme = () => {
    if (theme !== 'system') return theme;
    return systemIsDark ? 'dark' : 'blue';
  };

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

  // Estado para controle do Assistente Passo a Passo (Wizard)
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1); // 1 = Dados Cadastrais, 2 = Condições do Empréstimo, 3 = Resumo/Confirmação
  const [wizardRecord, setWizardRecord] = useState(emptyRecord());
  const [wizardVlEmprestimo, setWizardVlEmprestimo] = useState('');
  const [wizardNumParcelas, setWizardNumParcelas] = useState('6'); // default 6
  const [wizardTaxaJuros, setWizardTaxaJuros] = useState('2.00'); // default 2.00%
  const [wizardCompetenciaInicio, setWizardCompetenciaInicio] = useState('');
  const [wizardValidationErrors, setWizardValidationErrors] = useState([]);

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

  // Importação via CSV (Texto ou Arquivo)
  const [csvPaste, setCsvPaste] = useState('');
  const [csvImportMsg, setCsvImportMsg] = useState(null); // { ok: bool, text: string }

  const handleImportCSVText = (text) => {
    if (!text.trim()) {
      setCsvImportMsg({ ok: false, text: 'O conteúdo colado está vazio.' });
      return;
    }

    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length < 2) {
      setCsvImportMsg({ ok: false, text: 'O CSV deve conter pelo menos uma linha de cabeçalho e uma linha de dados.' });
      return;
    }

    // Detectar o delimitador (ponto e vírgula é preferencial no Brasil)
    const headerLine = lines[0];
    const semicolonCount = (headerLine.match(/;/g) || []).length;
    const commaCount = (headerLine.match(/,/g) || []).length;
    const delimiter = semicolonCount >= commaCount ? ';' : ',';

    const headers = parseCSVLine(headerLine, delimiter).map(normalizeHeader);

    // Mapear cabeçalhos para os índices correspondentes
    const headerIndices = {};
    headers.forEach((h, idx) => {
      const mappedField = CSV_HEADER_MAP[h];
      if (mappedField) {
        headerIndices[mappedField] = idx;
      }
    });

    const mappedKeys = Object.keys(headerIndices);
    if (mappedKeys.length === 0) {
      setCsvImportMsg({
        ok: false,
        text: 'Não foi possível identificar nenhuma coluna correspondente no cabeçalho do CSV. Verifique os nomes das colunas.'
      });
      return;
    }

    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const rowValues = parseCSVLine(lines[i], delimiter);
      if (rowValues.length === 0 || (rowValues.length === 1 && rowValues[0] === '')) {
        continue;
      }

      const rawRecord = {};
      mappedKeys.forEach(field => {
        const idx = headerIndices[field];
        rawRecord[field] = rowValues[idx] || '';
      });

      const nrInscricao = onlyDigits(rawRecord.nrInscricao || '');
      let tpInscricao = String(rawRecord.tpInscricao || '').trim().toLowerCase();
      if (tpInscricao.includes('cnpj') || tpInscricao === '1') {
        tpInscricao = '1';
      } else if (tpInscricao.includes('cpf') || tpInscricao === '2') {
        tpInscricao = '2';
      } else {
        tpInscricao = nrInscricao.length === 11 ? '2' : '1';
      }

      const record = {
        nrCpfTrabalhador: onlyDigits(rawRecord.nrCpfTrabalhador || ''),
        cdMatricula: String(rawRecord.cdMatricula || '').slice(0, 30),
        tpInscricao,
        nrInscricao,
        nrContratoEmprestimo: String(rawRecord.nrContratoEmprestimo || '').slice(0, 15),
        nrInstituicaoFinanceiro: onlyDigits(rawRecord.nrInstituicaoFinanceiro || '').slice(0, 3),
        vlParcela: parseValorParcela(rawRecord.vlParcela || ''),
        nrCompetenciaDesconto: parseCompetenciaCSV(rawRecord.nrCompetenciaDesconto || ''),
        cdCategoria: String(rawRecord.cdCategoria || ''),
        dtInicioEmprestimo: parseDataCSV(rawRecord.dtInicioEmprestimo || ''),
      };

      results.push(record);
    }

    if (results.length === 0) {
      setCsvImportMsg({ ok: false, text: 'Nenhum registro válido pôde ser extraído do CSV.' });
      return;
    }

    const truncated = results.length > 10;
    const mapped = results.slice(0, 10);
    setLote(mapped);
    setEditingIndex(null);
    setFormValidationErrors([]);

    // Se o primeiro registro tem a inscrição do empregador, sugere como default
    const firstEmp = mapped[0]?.nrInscricao;
    if (firstEmp) setNrInscricaoEmpregador(firstEmp);

    setCsvImportMsg({
      ok: true,
      text: truncated
        ? `${results.length} registros encontrados; apenas os 10 primeiros foram importados (limite da API).`
        : `${mapped.length} registro(s) importado(s) com sucesso.`,
    });
  };

  const handleImportCSVFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text === 'string') {
        handleImportCSVText(text);
      }
    };
    reader.onerror = () => {
      setCsvImportMsg({ ok: false, text: 'Erro ao ler o arquivo CSV.' });
    };
    reader.readAsText(file, 'UTF-8');
    // Limpar o input para permitir selecionar o mesmo arquivo novamente
    e.target.value = '';
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
    setWizardOpen(false); // Fecha o wizard se aberto
    setFormRecord(emptyRecord());
    setFormValidationErrors([]);
    setEditingIndex(-1);
  };

  const handleEditClick = (idx) => {
    setWizardOpen(false); // Fecha o wizard se aberto
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

  // -- Controle do Assistente Passo a Passo (Wizard) --
  const handleWizardOpen = () => {
    // Fecha a edição padrão se estiver aberta
    setEditingIndex(null);
    setFormValidationErrors([]);

    const initialRecord = emptyRecord();
    // Sugere os dados cadastrais do empregador se já definidos no formulário principal
    if (nrInscricaoEmpregador) {
      initialRecord.nrInscricao = onlyDigits(nrInscricaoEmpregador);
      initialRecord.tpInscricao = initialRecord.nrInscricao.length === 11 ? '2' : '1';
    }

    setWizardRecord(initialRecord);
    setWizardStep(1);
    setWizardVlEmprestimo('');
    setWizardNumParcelas('6');
    setWizardTaxaJuros('2.00');
    setWizardCompetenciaInicio('');
    setWizardValidationErrors([]);
    setWizardOpen(true);
  };

  const handleWizardCancel = () => {
    setWizardOpen(false);
    setWizardValidationErrors([]);
  };

  const updateWizardRecord = (field, value) => {
    setWizardRecord((prev) => {
      const updated = { ...prev, [field]: value };
      // Preenchimento automático da competência de início caso data do contrato seja alterada
      if (field === 'dtInicioEmprestimo' && value) {
        const year = parseInt(value.slice(0, 4), 10);
        if (year > 1900) {
          const datePart = value.slice(0, 7).replace('-', ''); // YYYYMM
          setWizardCompetenciaInicio(datePart);
        }
      }
      return updated;
    });
  };

  const handleWizardNextStep = () => {
    if (wizardStep === 1) {
      const errs = validateWizardStep1(wizardRecord);
      if (errs.length > 0) {
        setWizardValidationErrors(errs);
        return;
      }
      setWizardValidationErrors([]);
      setWizardStep(2);
    } else if (wizardStep === 2) {
      const errs = validateWizardStep2(
        wizardVlEmprestimo,
        wizardNumParcelas,
        wizardTaxaJuros,
        wizardRecord.dtInicioEmprestimo,
        wizardCompetenciaInicio
      );
      if (errs.length > 0) {
        setWizardValidationErrors(errs);
        return;
      }
      setWizardValidationErrors([]);
      setWizardStep(3);
    }
  };

  const handleWizardPrevStep = () => {
    setWizardValidationErrors([]);
    setWizardStep((prev) => Math.max(1, prev - 1));
  };

  const handleWizardConfirm = (replace) => {
    const list = generateInstallmentsList(
      wizardRecord,
      wizardVlEmprestimo,
      wizardNumParcelas,
      wizardTaxaJuros,
      wizardRecord.dtInicioEmprestimo,
      wizardCompetenciaInicio
    );

    if (replace) {
      setLote(list);
    } else {
      setLote((prev) => [...prev, ...list]);
    }

    // Se o empregador da tela principal ainda não estava definido, preenche com o do wizard
    if (wizardRecord.nrInscricao && !nrInscricaoEmpregador) {
      setNrInscricaoEmpregador(wizardRecord.nrInscricao);
    }

    setWizardOpen(false);
    setWizardValidationErrors([]);
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
          } catch { }
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
  const activeTheme = getActiveTheme();
  const t = THEMES[activeTheme];

  return (
    <div className={t.bg}>
      <div className="mx-auto max-w-5xl p-6 space-y-6">

        {/* Header da Página com Theme Switcher */}
        <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-4 ${activeTheme === 'dark' ? 'border-zinc-800' : 'border-slate-200'}`}>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">eSocial Crédtio do Trabalhador — Enviar Dados em Lote</h1>
            <p className="text-sm opacity-70">
              Ambiente: Produção Restrita (SERPRO) · Crédito do Trabalhador
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-80">Tema:</span>
            <div className={`flex items-center gap-1 rounded-lg border p-1 ${activeTheme === 'dark' ? 'bg-zinc-900 border-zinc-850' : 'bg-white border-slate-200'} shadow-sm`}>
              {Object.entries({
                system: { label: 'Auto', dot: 'bg-gradient-to-r from-blue-500 to-zinc-500' },
                blue: { label: 'Blue', dot: 'bg-indigo-600' },
                emerald: { label: 'Mint', dot: 'bg-emerald-600' },
                dark: { label: 'Dark', dot: 'bg-zinc-400 border border-zinc-650' },
                amber: { label: 'Amber', dot: 'bg-amber-600' },
              }).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setTheme(k)}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all ${theme === k
                      ? (activeTheme === 'dark' ? 'bg-zinc-800 text-white shadow-sm' : 'bg-slate-100 text-slate-900 shadow-sm')
                      : (activeTheme === 'dark' ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-500 hover:text-slate-800')
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
        <div className={`flex gap-2 border-b ${activeTheme === 'dark' ? 'border-zinc-800' : 'border-slate-200'}`}>
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

            {/* Importar via CSV */}
            <details className={`${t.card} group`}>
              <summary className="cursor-pointer select-none font-bold text-sm uppercase tracking-wider opacity-80 focus:outline-none flex justify-between items-center">
                <span>Importar registros via CSV</span>
                <span className="text-xs opacity-60 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="space-y-4 pt-3">
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                  <div className="w-full md:w-auto">
                    <label className={`${t.btnSecondary} block text-center cursor-pointer`}>
                      📁 Selecionar Arquivo CSV
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleImportCSVFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="text-xs opacity-75">
                    Selecione um arquivo .csv contendo os cabeçalhos apropriados.
                  </div>
                </div>

                <div className="space-y-2">
                  <span className={t.label}>Ou cole o conteúdo CSV abaixo:</span>
                  <textarea
                    className={`${t.input} h-32 w-full font-mono`}
                    value={csvPaste}
                    onChange={(e) => setCsvPaste(e.target.value)}
                    placeholder="cpf;matricula;contrato;valor;competencia;categoria;datainicio&#10;12345678901;MATR123;CONTR456;150,00;2026-07;101;02/07/2026"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleImportCSVText(csvPaste)}
                    className={t.btnSecondary}
                  >
                    Importar CSV
                  </button>
                  {csvImportMsg && (
                    <p className={`text-sm ${csvImportMsg.ok ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}`}>
                      {csvImportMsg.text}
                    </p>
                  )}
                </div>

                <div className={`rounded-lg p-3 text-xs border ${activeTheme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                  <p className="font-semibold mb-1">ℹ️ Cabeçalhos Suportados (Separados por vírgula ou ponto-e-vírgula):</p>
                  <ul className="list-disc list-inside space-y-0.5 opacity-90">
                    <li><strong>CPF:</strong> <code>cpf</code>, <code>cpfTrabalhador</code></li>
                    <li><strong>Matrícula:</strong> <code>matricula</code></li>
                    <li><strong>Nº Contrato:</strong> <code>contrato</code>, <code>nrContrato</code></li>
                    <li><strong>Valor da Parcela:</strong> <code>valor</code>, <code>valorParcela</code> (ex: <code>150,00</code> ou <code>1.250,50</code>)</li>
                    <li><strong>Competência:</strong> <code>competencia</code> (ex: <code>07/2026</code> ou <code>2026-07</code>)</li>
                    <li><strong>Categoria:</strong> <code>categoria</code> (ex: <code>101</code>)</li>
                    <li><strong>Data Início:</strong> <code>dataInicio</code> (ex: <code>02/07/2026</code>)</li>
                    <li><strong>Inscrição Empregador (Opcional):</strong> <code>nrInscricao</code> (para preencher automaticamente o campo da empresa)</li>
                  </ul>
                </div>
              </div>
            </details>

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
                <div className={`p-8 text-center rounded-xl border-2 border-dashed ${activeTheme === 'dark' ? 'border-zinc-800 text-zinc-400' : 'border-slate-200 text-slate-500'}`}>
                  <p className="font-medium">Nenhum registro adicionado ao lote ainda.</p>
                  <p className="text-xs opacity-75 mt-1">Adicione um novo registro pelo botão abaixo ou cole um JSON para importar.</p>
                </div>
              ) : (
                <div className={`overflow-x-auto rounded-xl border ${activeTheme === 'dark' ? 'border-zinc-800' : 'border-slate-200'} shadow-sm`}>
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
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleNewClick}
                    disabled={lote.length >= 10}
                    className={t.btnSecondary}
                  >
                    + Adicionar Registro
                  </button>
                  <button
                    onClick={handleWizardOpen}
                    className="bg-indigo-50 hover:bg-indigo-100 dark:bg-cyan-950/40 dark:hover:bg-cyan-900/40 text-indigo-700 dark:text-cyan-400 border border-indigo-200 dark:border-cyan-900/50 font-medium py-2 px-4 rounded-lg transition-all text-sm focus:ring-2 focus:ring-indigo-200 dark:focus:ring-cyan-900"
                  >
                    ✨ Assistente Passo a Passo
                  </button>
                </div>
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

            {/* Assistente Passo a Passo (Wizard) */}
            {wizardOpen && (
              <div className={`${t.card} border-2 border-indigo-500/25 dark:border-cyan-400/25 scroll-mt-6 space-y-6`}>
                
                {/* Cabeçalho do Wizard com Step Indicator */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <span>✨ Assistente de Empréstimo</span>
                      <span className="text-xs font-normal bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-zinc-800 dark:text-cyan-400 dark:border-zinc-700 px-2 py-0.5 rounded-full">
                        Passo a Passo
                      </span>
                    </h3>
                    <button
                      onClick={handleWizardCancel}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg focus:outline-none"
                    >
                      ✕
                    </button>
                  </div>
                  
                  {/* Step Indicator */}
                  <div className="flex flex-wrap items-center justify-between border-t border-b py-3 border-inherit bg-slate-50/50 dark:bg-zinc-900/30 px-3 rounded-lg gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        wizardStep === 1
                          ? 'bg-indigo-600 text-white dark:bg-cyan-500 dark:text-zinc-950'
                          : wizardStep > 1
                            ? 'bg-green-600 text-white dark:bg-green-500 dark:text-zinc-950'
                            : 'bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}>
                        {wizardStep > 1 ? '✓' : '1'}
                      </div>
                      <span className={`text-xs font-semibold ${wizardStep === 1 ? 'text-indigo-600 dark:text-cyan-400' : 'text-slate-500 dark:text-zinc-400'}`}>
                        Dados Cadastrais
                      </span>
                    </div>
                    <div className="h-0.5 flex-1 min-w-[20px] bg-slate-200 dark:bg-zinc-800" />
                    <div className="flex items-center gap-2">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        wizardStep === 2
                          ? 'bg-indigo-600 text-white dark:bg-cyan-500 dark:text-zinc-950'
                          : wizardStep > 2
                            ? 'bg-green-600 text-white dark:bg-green-500 dark:text-zinc-950'
                            : 'bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}>
                        {wizardStep > 2 ? '✓' : '2'}
                      </div>
                      <span className={`text-xs font-semibold ${wizardStep === 2 ? 'text-indigo-600 dark:text-cyan-400' : 'text-slate-500 dark:text-zinc-400'}`}>
                        Financiamento
                      </span>
                    </div>
                    <div className="h-0.5 flex-1 min-w-[20px] bg-slate-200 dark:bg-zinc-800" />
                    <div className="flex items-center gap-2">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        wizardStep === 3
                          ? 'bg-indigo-600 text-white dark:bg-cyan-500 dark:text-zinc-950'
                          : 'bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}>
                        3
                      </div>
                      <span className={`text-xs font-semibold ${wizardStep === 3 ? 'text-indigo-600 dark:text-cyan-400' : 'text-slate-500 dark:text-zinc-400'}`}>
                        Resumo & Confirmar
                      </span>
                    </div>
                  </div>
                </div>

                {/* Mensagens de erro de validação do Wizard */}
                {wizardValidationErrors.length > 0 && (
                  <div className={`rounded-lg border p-3 text-sm ${t.badgeErr}`}>
                    <p className="font-semibold mb-1">Ajuste os dados antes de prosseguir:</p>
                    <ul className="list-inside list-disc space-y-0.5">
                      {wizardValidationErrors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Conteúdo do Step 1: Dados Cadastrais */}
                {wizardStep === 1 && (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Field label="CPF do Trabalhador" hint="11 dígitos." t={t}>
                      <input
                        className={t.input}
                        value={wizardRecord.nrCpfTrabalhador}
                        onChange={(e) =>
                          updateWizardRecord('nrCpfTrabalhador', onlyDigits(e.target.value).slice(0, 11))
                        }
                        inputMode="numeric"
                        placeholder="000.000.000-00"
                      />
                    </Field>
                    <Field label="Matrícula" hint="Até 30 caracteres." t={t}>
                      <input
                        className={t.input}
                        value={wizardRecord.cdMatricula}
                        onChange={(e) => updateWizardRecord('cdMatricula', e.target.value.slice(0, 30))}
                        placeholder="MATR123456"
                      />
                    </Field>
                    <Field label="Categoria" hint="Tabela 01 do eSocial." t={t}>
                      <select
                        className={t.input}
                        value={wizardRecord.cdCategoria}
                        onChange={(e) => updateWizardRecord('cdCategoria', e.target.value)}
                      >
                        <option value="">— selecione —</option>
                        {CATEGORIAS.map(([code, label]) => (
                          <option key={code} value={code}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Tipo Inscrição Empregador" t={t}>
                      <select
                        className={t.input}
                        value={wizardRecord.tpInscricao}
                        onChange={(e) => updateWizardRecord('tpInscricao', e.target.value)}
                      >
                        <option value="1">1 - CNPJ</option>
                        <option value="2">2 - CPF</option>
                      </select>
                    </Field>
                    <Field
                      label="Nº Inscrição Empregador"
                      hint={wizardRecord.tpInscricao === '1' ? 'CNPJ: 8 ou 14 dígitos.' : 'CPF: 11 dígitos.'}
                      t={t}
                    >
                      <input
                        className={t.input}
                        value={wizardRecord.nrInscricao}
                        onChange={(e) =>
                          updateWizardRecord('nrInscricao', onlyDigits(e.target.value).slice(0, 14))
                        }
                        inputMode="numeric"
                        placeholder="00.000.000/0000-00"
                      />
                    </Field>
                    <Field label="Nº Contrato de Empréstimo" hint="Até 15 caracteres." t={t}>
                      <input
                        className={t.input}
                        value={wizardRecord.nrContratoEmprestimo}
                        onChange={(e) =>
                          updateWizardRecord('nrContratoEmprestimo', e.target.value.slice(0, 15))
                        }
                        placeholder="CONTRATO456"
                      />
                    </Field>
                    <Field label="Nº Inst. Financeira" hint="Ex: 001." t={t}>
                      <input
                        className={t.input}
                        value={wizardRecord.nrInstituicaoFinanceiro}
                        onChange={(e) =>
                          updateWizardRecord('nrInstituicaoFinanceiro', onlyDigits(e.target.value).slice(0, 3))
                        }
                        inputMode="numeric"
                        placeholder="341"
                      />
                    </Field>
                  </div>
                )}

                {/* Conteúdo do Step 2: Condições do Empréstimo */}
                {wizardStep === 2 && (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Field label="Valor Total do Empréstimo" hint="Valor total contratado." t={t}>
                      <input
                        className={`${t.input} text-right font-semibold`}
                        value={formatBRL(wizardVlEmprestimo)}
                        onChange={(e) => {
                          const digits = onlyDigits(e.target.value);
                          if (!digits) {
                            setWizardVlEmprestimo('');
                            return;
                          }
                          const cents = parseInt(digits, 10);
                          const decimalValue = (cents / 100).toFixed(2);
                          setWizardVlEmprestimo(decimalValue);
                        }}
                        placeholder="R$ 0,00"
                      />
                    </Field>
                    <Field label="Número de Parcelas" hint="Quantidade de descontos mensais." t={t}>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        className={t.input}
                        value={wizardNumParcelas}
                        onChange={(e) => setWizardNumParcelas(onlyDigits(e.target.value).slice(0, 3))}
                        inputMode="numeric"
                        placeholder="6"
                      />
                    </Field>
                    <Field label="Taxa de Juros (% a.m.)" hint="Default: 2.00% a.m." t={t}>
                      <div className="relative">
                        <input
                          type="text"
                          className={t.input}
                          value={wizardTaxaJuros}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            setWizardTaxaJuros(val);
                          }}
                          placeholder="2.00"
                        />
                        <span className="absolute right-3 top-2 text-sm opacity-60">% a.m.</span>
                      </div>
                    </Field>
                    <Field label="Data de Início do Contrato" hint="Data de assinatura." t={t}>
                      <input
                        type="date"
                        className={t.input}
                        value={wizardRecord.dtInicioEmprestimo ? wizardRecord.dtInicioEmprestimo.slice(0, 10) : ''}
                        onChange={(e) => {
                          const dateVal = e.target.value;
                          updateWizardRecord('dtInicioEmprestimo', dateVal ? `${dateVal} 00:00:00` : '');
                        }}
                      />
                    </Field>
                    <Field label="Competência do Primeiro Desconto" hint="Mês/Ano para início da cobrança." t={t}>
                      <input
                        type="month"
                        className={t.input}
                        value={
                          wizardCompetenciaInicio && wizardCompetenciaInicio.length === 6
                            ? `${wizardCompetenciaInicio.slice(0, 4)}-${wizardCompetenciaInicio.slice(4)}`
                            : ''
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          const apiVal = val ? val.replace('-', '') : '';
                          setWizardCompetenciaInicio(apiVal);
                        }}
                      />
                    </Field>
                  </div>
                )}

                {/* Conteúdo do Step 3: Resumo & Confirmação */}
                {wizardStep === 3 && (
                  <div className="space-y-6">
                    {/* Resumo Financeiro */}
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider opacity-75 mb-2.5">
                        Resumo Financeiro (Tabela Price)
                      </h4>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className={`p-4 rounded-xl border ${activeTheme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>
                          <p className="text-xs opacity-70">Valor da Parcela</p>
                          <p className="text-lg font-extrabold text-indigo-600 dark:text-cyan-400">
                            {formatBRL(calculateInstallment(wizardVlEmprestimo, wizardNumParcelas, wizardTaxaJuros))}
                          </p>
                          <p className="text-[10px] opacity-50 mt-1">PMT Constante</p>
                        </div>
                        <div className={`p-4 rounded-xl border ${activeTheme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>
                          <p className="text-xs opacity-70">Total a Pagar</p>
                          <p className="text-lg font-bold">
                            {formatBRL(
                              (
                                parseFloat(calculateInstallment(wizardVlEmprestimo, wizardNumParcelas, wizardTaxaJuros)) *
                                parseInt(wizardNumParcelas, 10)
                              ).toFixed(2)
                            )}
                          </p>
                          <p className="text-[10px] opacity-50 mt-1">Valor Principal + Juros</p>
                        </div>
                        <div className={`p-4 rounded-xl border ${activeTheme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>
                          <p className="text-xs opacity-70">Total de Juros</p>
                          <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                            {formatBRL(
                              Math.max(
                                0,
                                parseFloat(
                                  (
                                    parseFloat(calculateInstallment(wizardVlEmprestimo, wizardNumParcelas, wizardTaxaJuros)) *
                                    parseInt(wizardNumParcelas, 10)
                                  ).toFixed(2)
                                ) - parseFloat(wizardVlEmprestimo)
                              ).toFixed(2)
                            )}
                          </p>
                          <p className="text-[10px] opacity-50 mt-1">Acúmulo com taxa de {wizardTaxaJuros}% a.m.</p>
                        </div>
                      </div>
                    </div>

                    {/* Lista Prévia das Parcelas */}
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider opacity-75 mb-2">
                        Cronograma das Parcelas Geradas ({wizardNumParcelas})
                      </h4>
                      <div className={`max-h-56 overflow-y-auto rounded-xl border ${activeTheme === 'dark' ? 'border-zinc-800' : 'border-slate-200'} shadow-inner`}>
                        <table className="min-w-full text-xs">
                          <thead className={`sticky top-0 ${activeTheme === 'dark' ? 'bg-zinc-900' : 'bg-slate-100'}`}>
                            <tr>
                              <th className={`${t.th} py-2`}># Parcela</th>
                              <th className={`${t.th} py-2`}>Competência de Desconto</th>
                              <th className={`${t.th} py-2`}>Valor da Parcela</th>
                              <th className={`${t.th} py-2`}>Data Início Contrato</th>
                            </tr>
                          </thead>
                          <tbody>
                            {generateInstallmentsList(
                              wizardRecord,
                              wizardVlEmprestimo,
                              wizardNumParcelas,
                              wizardTaxaJuros,
                              wizardRecord.dtInicioEmprestimo,
                              wizardCompetenciaInicio
                            ).map((item, idx) => (
                              <tr key={idx} className={idx % 2 === 0 ? t.trEven : t.trOdd}>
                                <td className={`${t.td} py-1.5`}>{idx + 1} de {wizardNumParcelas}</td>
                                <td className={`${t.td} py-1.5 font-mono font-semibold`}>
                                  {item.nrCompetenciaDesconto.slice(4)}/{item.nrCompetenciaDesconto.slice(0, 4)}
                                </td>
                                <td className={`${t.td} py-1.5`}>{formatBRL(item.vlParcela)}</td>
                                <td className={`${t.td} py-1.5 opacity-85`}>
                                  {formatDateBRL(item.dtInicioEmprestimo)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Aviso de Limites do eSocial */}
                    {parseInt(wizardNumParcelas, 10) > 10 && (
                      <div className="flex gap-2.5 p-3 rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300">
                        <span className="text-sm">⚠️</span>
                        <div>
                          <p className="font-bold">Aviso sobre o Limite de Registros por Lote</p>
                          <p className="opacity-90">
                            A API do eSocial Consignado suporta o envio de no máximo <strong>10 registros por lote</strong>.
                            Como você gerou {wizardNumParcelas} parcelas, você precisará enviar esses dados divididos em
                            lotes separados.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Rodapé com botões de ação e navegação do Wizard */}
                <div className="flex flex-wrap gap-3 mt-6 justify-between border-t pt-4 border-inherit">
                  <div>
                    <button
                      onClick={handleWizardCancel}
                      className={t.btnSecondary}
                    >
                      Cancelar
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {wizardStep > 1 && (
                      <button
                        onClick={handleWizardPrevStep}
                        className={t.btnSecondary}
                      >
                        Voltar
                      </button>
                    )}
                    {wizardStep < 3 ? (
                      <button
                        onClick={handleWizardNextStep}
                        className={t.btnPrimary}
                      >
                        Avançar
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleWizardConfirm(false)}
                          className={t.btnSecondary}
                        >
                          Adicionar ao Lote
                        </button>
                        <button
                          onClick={() => handleWizardConfirm(true)}
                          className={t.btnPrimary}
                        >
                          Substituir Lote
                        </button>
                      </>
                    )}
                  </div>
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
        <ResponseView result={result} t={t} theme={activeTheme} />
      </div>
    </div>
  );
}
