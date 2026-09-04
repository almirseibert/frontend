import React from 'react';
import { Clock, AlertTriangle, Users } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// ObraCard — capa da obra na Gestão de Obras (Análise Gerencial).
//
// Hierarquia (de cima para baixo), fixada com o usuário:
//   1. IDENTIDADE  — órgão contratante em destaque + nome da obra
//   2. FINANCEIRO  — valor de contrato por extenso; abaixo dele, a divisão entre
//                    execução própria (MAK) e o que está comprometido com terceiros
//   3. FÍSICO      — uma única linha: % e horas juntos
//   4. SINAIS      — badges de risco + previsão em rodapé
//
// ALINHAMENTO: todo card renderiza EXATAMENTE as mesmas seções, com a mesma
// altura, independentemente dos dados. Obra sem terceiro mostra "R$ 0 · 0%" em
// vez de esconder o bloco — ausência de terceirização é informação, e esconder
// o bloco quebrava o alinhamento da grade inteira. O nome tem altura reservada
// de 2 linhas pelo mesmo motivo.
//
// Fora da capa (continuam ao abrir a obra): responsável, fiscal, gasto realizado.
// Margem foi REMOVIDA: derivada de percentual de conclusão × valor de contrato,
// ela produz números irreais quando o apontamento passa de 100% (visto em obra
// com 17.167% de conclusão → margem de -10.309.180%).
// ─────────────────────────────────────────────────────────────────────────────

// Valor monetário por extenso, no formato brasileiro: "R$ 1.234.567,89".
const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const STATUS_ACCENT = {
    green:  'bg-emerald-500',
    yellow: 'bg-yellow-400',
    violet: 'bg-purple-500',
    red:    'bg-red-600',
};

const ObraCard = ({ obra, onClick }) => {
    const { kpi, nome, orgao_contratante: orgao, previsao } = obra;

    const status = kpi?.status_cor || 'green';
    const percentual = Number(kpi?.percentual_conclusao) || 0;
    const horasContratadas = Number(kpi?.horas_contratadas) || 0;
    const horasExecutadas = Number(kpi?.horas_executadas) || 0;

    const valorTotal = Number(kpi?.valor_total_contrato) || 0;
    const valorTerceiros = Number(kpi?.valor_terceiros) || 0;
    const qtdContratos = Number(kpi?.qtd_contratos_terceiros) || 0;
    const pctTerceiros = valorTotal > 0 ? (valorTerceiros / valorTotal) * 100 : 0;
    const execucaoPropria = valorTotal - valorTerceiros;
    const temTerceiros = valorTerceiros > 0;

    // Metade ou mais do contrato destinada a terceiros muda a leitura de
    // "contrato bom" — é o único ponto do card que ganha cor de alerta.
    const comprometimentoAlto = pctTerceiros >= 50;
    const corTerceiros = !temTerceiros ? 'text-slate-400'
        : comprometimentoAlto ? 'text-orange-700'
        : 'text-slate-800';

    const diasRestantes = Number(kpi?.dias_restantes_estimados) || 0;
    const dataTermino = previsao?.data_termino_estimada
        ? new Date(previsao.data_termino_estimada).toLocaleDateString('pt-BR')
        : null;

    const fmtH = (h) => h.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

    return (
        <div
            onClick={onClick}
            className="bg-white rounded-xl shadow-sm border border-slate-200 cursor-pointer relative flex h-full overflow-hidden hover:shadow-md transition-shadow group"
        >
            {/* Faixa de status */}
            <div className={`w-1 shrink-0 ${STATUS_ACCENT[status] || STATUS_ACCENT.green}`} />

            <div className="flex flex-col flex-1 min-w-0 p-4">
                {/* ── 1. Identidade — altura reservada de 2 linhas ─────────── */}
                <div className="pr-7">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 truncate">
                        {orgao || <span className="text-slate-300">Sem órgão contratante</span>}
                    </div>
                    <h3
                        className="font-bold text-[15px] text-slate-800 leading-snug mt-0.5 line-clamp-2 min-h-[2.6rem] break-words"
                        title={nome}
                    >
                        {nome}
                    </h3>
                </div>

                {/* ── 2. Financeiro ───────────────────────────────────────── */}
                <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Valor de contrato
                    </div>
                    <div className="text-xl font-bold text-slate-900 leading-tight mt-0.5 tabular-nums">
                        {valorTotal > 0 ? fmtBRL(valorTotal) : '—'}
                    </div>

                    {/* Divisão do contrato — sempre presente, para a grade não
                        mudar de forma entre obras com e sem terceiro. A ordem
                        (execução própria à esquerda) espelha as colunas abaixo. */}
                    <div className="flex w-full h-1.5 rounded-full overflow-hidden bg-slate-100 mt-2.5">
                        <div className="bg-slate-800" style={{ width: `${Math.max(100 - pctTerceiros, 0)}%` }} />
                        {temTerceiros && (
                            <div className={`flex-1 ${comprometimentoAlto ? 'bg-orange-500' : 'bg-amber-400'}`} />
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-wide text-slate-400 flex items-center gap-1">
                                <span className="inline-block w-2 h-2 rounded-sm bg-slate-800 shrink-0" />
                                Execução própria
                            </div>
                            <div className="text-[13px] font-bold text-slate-800 tabular-nums truncate" title={fmtBRL(execucaoPropria)}>
                                {fmtBRL(execucaoPropria)}
                            </div>
                            <div className="text-[10px] text-slate-400 tabular-nums">
                                {(100 - pctTerceiros).toFixed(0)}% do contrato
                            </div>
                        </div>
                        <div className="min-w-0 text-right">
                            <div className="text-[10px] uppercase tracking-wide text-slate-400 flex items-center justify-end gap-1">
                                Terceiros
                                <span className={`inline-block w-2 h-2 rounded-sm shrink-0 ${
                                    !temTerceiros ? 'bg-slate-200' : comprometimentoAlto ? 'bg-orange-500' : 'bg-amber-400'
                                }`} />
                            </div>
                            <div className={`text-[13px] font-bold tabular-nums truncate ${corTerceiros}`} title={fmtBRL(valorTerceiros)}>
                                {fmtBRL(valorTerceiros)}
                            </div>
                            <div className={`text-[10px] tabular-nums ${comprometimentoAlto ? 'text-orange-600' : 'text-slate-400'}`}>
                                {pctTerceiros.toFixed(0)}% do contrato
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── 3. Progresso físico ─────────────────────────────────── */}
                <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-baseline justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Progresso físico
                        </span>
                        <span className="text-[11px] text-slate-600 tabular-nums">
                            <b className="text-slate-900 text-sm">{percentual.toFixed(0)}%</b>
                            <span className="mx-1 text-slate-300">·</span>
                            {fmtH(horasExecutadas)} / {fmtH(horasContratadas)} h
                        </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                            className={`h-2 rounded-full transition-all duration-700 ${STATUS_ACCENT[status] || STATUS_ACCENT.green}`}
                            style={{ width: `${Math.min(percentual, 100)}%` }}
                        />
                    </div>
                </div>

                {/* ── 4. Sinais + previsão ────────────────────────────────── */}
                <div className="mt-auto pt-3 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex flex-wrap gap-1.5">
                        {percentual > 90 && (
                            <span className="flex items-center bg-red-50 text-red-700 px-2 py-0.5 rounded border border-red-100 text-[10px] font-bold">
                                <AlertTriangle size={11} className="mr-1" />
                                Zona de Aditivo
                            </span>
                        )}
                        {diasRestantes < 15 && diasRestantes > 0 && percentual <= 90 && (
                            <span className="flex items-center bg-orange-50 text-orange-700 px-2 py-0.5 rounded border border-orange-100 text-[10px] font-bold">
                                <Clock size={11} className="mr-1" />
                                Prazo Curto
                            </span>
                        )}
                        {qtdContratos > 0 && (
                            <span className="flex items-center bg-slate-50 text-slate-600 px-2 py-0.5 rounded border border-slate-200 text-[10px] font-bold">
                                <Users size={11} className="mr-1" />
                                {qtdContratos} {qtdContratos === 1 ? 'terceiro' : 'terceiros'}
                            </span>
                        )}
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-auto">
                        {dataTermino ? `Previsão ${dataTermino}` : 'Sem previsão'}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ObraCard;
