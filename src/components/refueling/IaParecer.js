// src/components/refueling/IaParecer.js
//
// Apresentação do parecer da IA sobre uma solicitação de abastecimento.
// Compartilhado entre a tela do gestor (AdminSolicitacoesPage) e — na versão
// resumida e sem motivos — o app do operador.
//
// Ver backend/docs/aceite-automatico-ia.md.
//
// REGRA DE CONTEÚDO: a IA nunca "nega". Ela só deixa de liberar sozinha. Por
// isso nenhum texto aqui usa "negado" ou "reprovado" — esses termos ficam
// reservados ao status NEGADO, que é decisão humana e tem motivo_negativa.
// Misturar os dois faria o operador achar que perdeu o abastecimento.

import React, { useState } from 'react';
import { Sparkles, ShieldCheck, ShieldAlert, Clock, RefreshCw, AlertCircle } from 'lucide-react';

// MySQL devolve TINYINT(1) ora como número, ora como string, dependendo do
// driver e da query. `ehVerdadeiro` normaliza sem recorrer a `==` frouxo.
export const ehVerdadeiro = (v) => v === 1 || v === '1' || v === true;

// ─── Estado do parecer ───────────────────────────────────────────────────────

export const ESTADO_IA = {
    SEM_ANALISE: 'sem_analise',
    ANALISANDO: 'analisando',
    LIBERARIA: 'liberaria',
    REVISAO: 'revisao',
    ERRO: 'erro',
    CUPOM_OK: 'cupom_ok',
    CUPOM_REVISAO: 'cupom_revisao',
};

/**
 * Normaliza as colunas ia_* numa descrição única de estado.
 * @param {object} s linha de solicitacoes_abastecimento
 */
export const resumoIa = (s) => {
    if (!s) return { estado: ESTADO_IA.SEM_ANALISE };

    if (s.ia_status === 'CUPOM_OK') return { estado: ESTADO_IA.CUPOM_OK };
    if (s.ia_status === 'CUPOM_REVISAO') return { estado: ESTADO_IA.CUPOM_REVISAO };
    if (s.ia_decisao === 'ERRO' || s.ia_status === 'ERRO') return { estado: ESTADO_IA.ERRO };

    if (s.ia_decisao === 'AUTO_LIBERADO' || s.ia_decisao === 'AUTO_LIBERADO_SIMULADO') {
        return {
            estado: ESTADO_IA.LIBERARIA,
            // Simulado = modo sombra: a IA teria liberado, mas quem decide ainda é o humano.
            simulado: s.ia_decisao === 'AUTO_LIBERADO_SIMULADO',
            liberouDeFato: ehVerdadeiro(s.liberacao_automatica),
        };
    }
    if (s.ia_decisao === 'MANUAL') return { estado: ESTADO_IA.REVISAO };

    // Solicitação recém-criada: a análise roda logo após o commit, então há uma
    // janela de alguns segundos em que ainda não há parecer.
    if (s.status === 'PENDENTE') return { estado: ESTADO_IA.ANALISANDO };
    return { estado: ESTADO_IA.SEM_ANALISE };
};

const APARENCIA = {
    [ESTADO_IA.LIBERARIA]: {
        Icone: ShieldCheck,
        classe: 'bg-green-100 text-green-800 border-green-200',
        rotulo: 'IA liberaria',
    },
    [ESTADO_IA.REVISAO]: {
        Icone: ShieldAlert,
        classe: 'bg-amber-100 text-amber-800 border-amber-200',
        rotulo: 'IA encaminhou',
    },
    [ESTADO_IA.ANALISANDO]: {
        Icone: Clock,
        classe: 'bg-gray-100 text-gray-600 border-gray-200',
        rotulo: 'analisando…',
    },
    [ESTADO_IA.ERRO]: {
        Icone: AlertCircle,
        classe: 'bg-red-50 text-red-700 border-red-200',
        rotulo: 'IA falhou',
    },
    [ESTADO_IA.CUPOM_OK]: {
        Icone: ShieldCheck,
        classe: 'bg-blue-100 text-blue-800 border-blue-200',
        rotulo: 'cupom lido',
    },
    [ESTADO_IA.CUPOM_REVISAO]: {
        Icone: ShieldAlert,
        classe: 'bg-amber-100 text-amber-800 border-amber-200',
        rotulo: 'cupom p/ conferir',
    },
};

/** Chip compacto para listas. Não renderiza nada quando não há parecer. */
export const IaBadge = ({ solicitacao, className = '' }) => {
    const { estado, simulado } = resumoIa(solicitacao);
    const ap = APARENCIA[estado];
    if (!ap) return null;

    const { Icone } = ap;
    const titulo = simulado
        ? 'Modo sombra: a IA teria liberado, mas a decisão continua sendo do setor.'
        : undefined;

    return (
        <span
            title={titulo}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold ${ap.classe} ${className}`}
        >
            <Icone size={10} />
            {ap.rotulo}
            {simulado && <span className="opacity-70">(sombra)</span>}
        </span>
    );
};

// ─── Painel de detalhe (tela do gestor) ──────────────────────────────────────

const CORES_PORTAO = {
    ok: 'text-green-700 bg-green-50 border-green-200',
    falha: 'text-red-700 bg-red-50 border-red-200',
    indeterminado: 'text-amber-700 bg-amber-50 border-amber-200',
};

const SIMBOLO_PORTAO = { ok: '✓', falha: '✕', indeterminado: '?' };

// Nomes técnicos dos portões traduzidos para quem opera a tela.
const ROTULO_PORTAO = {
    G0_elegibilidade: 'Escopo do piloto',
    G1_regras_soberanas: 'Regras de abastecimento',
    G2_media: 'Média de consumo',
    G3_necessidade: 'Necessidade de abastecer',
    G4_visao: 'Leitura da foto',
    G5_teto: 'Teto de valor',
};

const parseMotivos = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v : [];
    } catch { return []; }
};

/**
 * Painel completo: leitura extraída, confiança e cada portão com seu veredito.
 * Só para a tela do gestor — o operador não vê os motivos (ver doc).
 */
export const IaPainel = ({ solicitacao, onReprocessar, reprocessando }) => {
    const [aberto, setAberto] = useState(true);
    const { estado, simulado } = resumoIa(solicitacao);
    const portoes = parseMotivos(solicitacao?.ia_motivos);

    if (estado === ESTADO_IA.SEM_ANALISE && portoes.length === 0) {
        return (
            <div className="bg-white p-2 rounded border shadow-sm">
                <h5 className="text-[10px] font-bold text-gray-400 uppercase mb-1 flex items-center gap-1">
                    <Sparkles size={11} /> Análise da IA
                </h5>
                <p className="text-[10px] text-gray-500">
                    Sem parecer para esta solicitação.
                </p>
                {onReprocessar && (
                    <button
                        onClick={onReprocessar}
                        disabled={reprocessando}
                        className="mt-1.5 text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 disabled:opacity-50"
                    >
                        <RefreshCw size={10} className={reprocessando ? 'animate-spin' : ''} /> Analisar agora
                    </button>
                )}
            </div>
        );
    }

    const leitura = solicitacao?.ia_leitura_extraida;
    const confianca = solicitacao?.ia_confianca;
    const informado = solicitacao?.odometro_informado || solicitacao?.horimetro_informado;
    const unidade = solicitacao?.odometro_informado ? 'Km' : 'h';

    return (
        <div className="bg-white p-2 rounded border shadow-sm">
            <button
                onClick={() => setAberto((v) => !v)}
                className="w-full flex justify-between items-center mb-1"
            >
                <h5 className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                    <Sparkles size={11} /> Análise da IA
                </h5>
                <IaBadge solicitacao={solicitacao} />
            </button>

            {simulado && (
                <div className="bg-purple-50 border border-purple-200 rounded p-1.5 mb-1.5">
                    <p className="text-[9px] text-purple-800 leading-tight">
                        <span className="font-bold">Modo sombra.</span> A IA teria liberado esta
                        solicitação, mas nada foi liberado — a decisão continua sendo sua. Este
                        registro alimenta a taxa de concordância.
                    </p>
                </div>
            )}

            {aberto && (
                <>
                    {leitura != null && (
                        <div className="grid grid-cols-3 gap-2 text-xs mb-1.5 bg-gray-50 rounded p-1.5">
                            <div>
                                <p className="text-[9px] text-gray-500">Lido na foto</p>
                                <p className="font-bold text-purple-700">{leitura} {unidade}</p>
                            </div>
                            <div>
                                <p className="text-[9px] text-gray-500">Digitado</p>
                                <p className="font-bold text-blue-700">{informado} {unidade}</p>
                            </div>
                            <div>
                                <p className="text-[9px] text-gray-500">Confiança</p>
                                <p className="font-bold text-gray-700">
                                    {confianca != null ? `${(parseFloat(confianca) * 100).toFixed(0)}%` : '—'}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-1">
                        {portoes.map((p) => (
                            <div
                                key={p.nome}
                                className={`flex items-start gap-1.5 text-[10px] leading-tight p-1 rounded border ${CORES_PORTAO[p.status] || 'text-gray-600 bg-gray-50 border-gray-200'}`}
                            >
                                <span className="font-bold shrink-0">{SIMBOLO_PORTAO[p.status] || '·'}</span>
                                <span className="font-bold shrink-0 w-32">{ROTULO_PORTAO[p.nome] || p.nome}</span>
                                <span className="flex-1">{p.detalhe}</span>
                            </div>
                        ))}
                    </div>

                    {solicitacao?.ia_analisado_em && (
                        <p className="text-[9px] text-gray-400 mt-1.5">
                            Analisado em {new Date(solicitacao.ia_analisado_em).toLocaleString('pt-BR')}
                        </p>
                    )}

                    {onReprocessar && (
                        <button
                            onClick={onReprocessar}
                            disabled={reprocessando}
                            className="mt-1.5 text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 disabled:opacity-50"
                        >
                            <RefreshCw size={10} className={reprocessando ? 'animate-spin' : ''} /> Reprocessar análise
                        </button>
                    )}
                </>
            )}
        </div>
    );
};

// ─── Faixa para o app do operador ────────────────────────────────────────────

/**
 * Versão do operador: diz apenas o desfecho, NUNCA o motivo.
 *
 * Dois cuidados deliberados:
 *  - em modo sombra não aparece nada. A decisão ainda é simulada; anunciar
 *    "liberado pela IA" enquanto um humano ainda vai decidir seria mentira.
 *  - o motivo do encaminhamento fica só na tela do gestor. Dizer "sua leitura
 *    não bateu com a foto" ensina a contornar o portão.
 */
export const IaFaixaOperador = ({ solicitacao }) => {
    const { estado, simulado, liberouDeFato } = resumoIa(solicitacao);

    // Modo sombra: invisível para o operador.
    if (simulado) return null;

    if (estado === ESTADO_IA.LIBERARIA && liberouDeFato) {
        return (
            <div className="mt-2 bg-green-50 text-green-800 text-xs p-2 rounded flex items-center gap-1.5 font-bold border border-green-200">
                <ShieldCheck size={13} /> Liberado automaticamente — ordem já emitida
            </div>
        );
    }
    if (estado === ESTADO_IA.REVISAO) {
        return (
            <div className="mt-2 bg-amber-50 text-amber-800 text-xs p-2 rounded flex items-center gap-1.5 font-medium border border-amber-200">
                <ShieldAlert size={13} /> Enviado ao setor de abastecimento para conferência
            </div>
        );
    }
    if (estado === ESTADO_IA.ANALISANDO) {
        return (
            <div className="mt-2 bg-gray-50 text-gray-600 text-xs p-2 rounded flex items-center gap-1.5 border border-gray-200">
                <Clock size={13} className="animate-pulse" /> Analisando a foto do painel…
            </div>
        );
    }
    if (estado === ESTADO_IA.CUPOM_OK || estado === ESTADO_IA.CUPOM_REVISAO) {
        return (
            <div className="mt-2 bg-blue-50 text-blue-800 text-xs p-2 rounded flex items-center gap-1.5 border border-blue-200">
                <Sparkles size={13} /> Cupom recebido — aguardando conferência do setor
            </div>
        );
    }
    return null;
};

export default IaPainel;
