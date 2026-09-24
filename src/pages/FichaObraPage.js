import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, RefreshCw, MapPin, User, ClipboardList, ChevronRight, X } from 'lucide-react';
import apiClient from '../services/apiClient';
import { useData, useEnsureResources } from '../contexts/DataContext';
import { formatObraNome } from '../utils/obraFormat';
import FichaAproveitamento from './FichaAproveitamento';
import FichaFaturamento from './FichaFaturamento';
import FichaEvidencias from './FichaEvidencias';
import FichaTerceiros from '../components/analise/FichaTerceiros';

import { fmtBRLouTraco } from '../utils/currency';
// ─────────────────────────────────────────────────────────────────────────────
// Ficha da Obra — aba "Visão geral" (Fase 1)
//
// Consolida numa única superfície de leitura em Z o que antes exigia abrir 3–4
// telas (Gestão de Obras, Projeção, Aproveitamento). NÃO cria backend novo:
//   • getProjecaoObra        → progresso físico, projeção de prazo, combustível
//   • getObraAnalytics        → capacidade líquida vs. horas apontadas (frota)
//   • expenses (DataContext)  → gasto real para a margem
//
// Princípios (fixados com o usuário): página completa, nada colapsa; hierarquia
// por posição e tipografia, não por cor; o sistema mostra o fato, não o conselho.
// Cadência mantida QUINZENAL (o engine atual é quinzenal). Sem histórico de
// alocação ("desde"/"já saíram") — não há tabela fiel para isso ainda.
// ─────────────────────────────────────────────────────────────────────────────

const C = {
    bg:      '#f5f3ef',
    surface: '#ffffff',
    border:  '#e5e0d8',
    ink:     '#1e1a14',
    inkMid:  '#5a4e3a',
    inkSub:  '#9a8c7a',
    gold:    '#9E7A42',
    goldBg:  '#faf6ee',
    // Cor é exceção pontual — só para o limite de combustível e desvio de prazo.
    red:     '#b03828',
    green:   '#2e7d5b',
};

const LIMITE_COMBUSTIVEL = 20; // % interno sobre o faturamento
const META_DIAS = 45;

// ── Formatação ────────────────────────────────────────────────────────────────
const fmtBRL = (v) => fmtBRLouTraco(v);
const fmtPct = (v, dec = 0) => (v == null || Number.isNaN(v) ? '—' : `${Number(v).toFixed(dec)}%`);
const fmtH   = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`);

const fmtData = (iso) => {
    if (!iso) return '—';
    const s = String(iso).slice(0, 10);
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
};

// ── Datas (locais, sem UTC) ───────────────────────────────────────────────────
const todayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDays = (iso, n) => {
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const diffDays = (isoA, isoB) => {
    const a = new Date(String(isoA).slice(0, 10) + 'T12:00:00').getTime();
    const b = new Date(String(isoB).slice(0, 10) + 'T12:00:00').getTime();
    return Math.round((a - b) / 86400000);
};

// ── Blocos de UI ──────────────────────────────────────────────────────────────

// Linha rótulo → valor (densidade > chrome).
function Stat({ label, value, valueColor, hint }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-1.5" style={{ borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12.5, color: C.inkMid }}>{label}</span>
            <span className="text-right">
                <span style={{ fontSize: 14, fontWeight: 700, color: valueColor || C.ink }}>{value}</span>
                {hint && <span style={{ fontSize: 11, color: C.inkSub, marginLeft: 6 }}>{hint}</span>}
            </span>
        </div>
    );
}

// Um card com `onDetalhe` vira superfície clicável: o clique abre o painel de
// detalhamento daquele bloco. Sem `onDetalhe` ele segue sendo um card comum —
// nada de afordância falsa em bloco que não tem detalhe a mostrar.
function Card({ title, children, right, onDetalhe }) {
    const clicavel = typeof onDetalhe === 'function';
    return (
        <div
            className={`rounded-xl p-4 flex flex-col h-full ${clicavel ? 'cursor-pointer transition-shadow hover:shadow-md' : ''}`}
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
            onClick={clicavel ? onDetalhe : undefined}
            role={clicavel ? 'button' : undefined}
            tabIndex={clicavel ? 0 : undefined}
            onKeyDown={clicavel ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDetalhe(); }
            } : undefined}
            title={clicavel ? 'Ver detalhamento' : undefined}
        >
            {(title || right || clicavel) && (
                <div className="flex items-center justify-between mb-2 gap-2">
                    <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.inkSub }}>{title}</h3>
                    <span className="flex items-center gap-1.5 shrink-0">
                        {right}
                        {clicavel && <ChevronRight size={14} style={{ color: C.inkSub }} />}
                    </span>
                </div>
            )}
            {children}
        </div>
    );
}

// ── Painel lateral de detalhamento ────────────────────────────────────────────
// Detalhe não cabe na grade: ele é longo, tem tabelas e memória de cálculo. Em
// vez de expandir o card (e quebrar o alinhamento da grade inteira), abre aqui.
function PainelDetalhe({ titulo, subtitulo, onFechar, children }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onFechar(); };
        window.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, [onFechar]);

    return (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={titulo}>
            <div className="absolute inset-0" style={{ background: 'rgba(30,26,20,0.35)' }} onClick={onFechar} />
            <div className="relative h-full w-full sm:max-w-xl overflow-y-auto shadow-2xl"
                style={{ background: C.bg, borderLeft: `1px solid ${C.border}` }}>
                <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-4 sm:px-5 py-4"
                    style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                    <div className="min-w-0">
                        <h2 style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{titulo}</h2>
                        {subtitulo && <p style={{ fontSize: 12, color: C.inkSub, marginTop: 2 }}>{subtitulo}</p>}
                    </div>
                    <button onClick={onFechar} className="p-1.5 -mr-1 rounded-lg hover:bg-black/5 transition-colors" title="Fechar (Esc)">
                        <X size={18} style={{ color: C.inkMid }} />
                    </button>
                </div>
                <div className="p-4 sm:p-5 space-y-4">{children}</div>
            </div>
        </div>
    );
}

// Bloco interno do painel — mesma linguagem visual do Card, sem clique.
function Bloco({ titulo, children, nota }) {
    return (
        <div className="rounded-xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            {titulo && (
                <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.inkSub, marginBottom: 8 }}>
                    {titulo}
                </h3>
            )}
            {children}
            {nota && <p style={{ fontSize: 10.5, color: C.inkSub, marginTop: 10, fontStyle: 'italic' }}>{nota}</p>}
        </div>
    );
}

// Barra de progresso = a própria razão de horas (uma só definição de progresso).
function ProgressBar({ pct }) {
    const w = Math.min(Math.max(pct || 0, 0), 100);
    return (
        <div className="w-full h-2.5 rounded-full" style={{ background: C.bg }}>
            <div className="h-2.5 rounded-full" style={{ width: `${w}%`, background: C.gold }} />
        </div>
    );
}

// Uma leitura de progresso: rótulo, percentual, detalhe e barra.
function Progresso({ rotulo, pct, detalhe }) {
    const indisponivel = pct == null || Number.isNaN(pct);
    return (
        <div>
            <div className="flex items-baseline justify-between gap-2 mb-1">
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.inkSub }}>
                    {rotulo}
                </span>
                <span style={{ fontSize: 17, fontWeight: 800, color: indisponivel ? C.inkSub : C.ink }}>
                    {indisponivel ? '—' : fmtPct(pct)}
                </span>
            </div>
            <ProgressBar pct={indisponivel ? 0 : pct} />
            <div style={{ fontSize: 11.5, color: C.inkMid, marginTop: 3 }}>{detalhe}</div>
        </div>
    );
}

// ── Componente principal ──────────────────────────────────────────────────────

const FichaObraPage = ({ obraId, onBack, obras = [], vehicles = [], setAlertMessage }) => {
    useEnsureResources(['expenses']);
    const { expenses } = useData();

    // Painel aberto: { chave, item? }. `item` só existe quando a linha de um
    // item do contrato foi clicada — o detalhe dali é o dia a dia daquele item.
    const [detalhe, setDetalhe] = useState(null);
    const [aba, setAba] = useState('visao'); // 'visao' | 'aproveitamento' | 'faturamento'
    const obra = useMemo(() => obras.find(o => String(o.id) === String(obraId)) || null, [obras, obraId]);

    const [proj, setProj]         = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading]   = useState(true);
    const [projErro, setProjErro] = useState(null);
    const [anErro, setAnErro]     = useState(null);

    const carregar = useCallback(async () => {
        if (!obraId) return;
        setLoading(true);
        setProjErro(null);
        setAnErro(null);

        // Projeção (progresso/prazo/combustível) — fonte principal da Ficha.
        const pProj = apiClient.getProjecaoObra(obraId)
            .then(setProj)
            .catch(e => { setProj(null); setProjErro(e.message || 'Erro ao carregar projeção da obra.'); });

        // Analytics (aproveitamento da frota) — janela inicial de 45 dias; é
        // refinada para o início operacional → hoje quando a projeção o revela.
        const hoje = todayLocal();
        const pAn = apiClient.getObraAnalytics(obraId, { startDate: addDays(hoje, -META_DIAS), endDate: hoje })
            .then(setAnalytics)
            .catch(e => { setAnalytics(null); setAnErro(e.message || 'Aproveitamento indisponível.'); });

        await Promise.allSettled([pProj, pAn]);
        setLoading(false);
    }, [obraId]);

    useEffect(() => { carregar(); }, [carregar]);

    // Reajusta a janela de analytics para o início operacional assim que a
    // projeção revela a data de início (1º lançamento), evitando somar dias
    // úteis vazios anteriores à obra na capacidade líquida.
    useEffect(() => {
        const inicio = proj?.obra?.dataInicio;
        if (!inicio || !obraId) return;
        apiClient.getObraAnalytics(obraId, { startDate: inicio, endDate: todayLocal() })
            .then(setAnalytics)
            .catch(() => { /* mantém o resultado da janela ampla */ });
    }, [proj?.obra?.dataInicio, obraId]);

    // ── Derivados ────────────────────────────────────────────────────────────
    const d = useMemo(() => {
        if (!proj) return null;
        const f = proj.faturamento || {};
        const comb = proj.combustivel || {};
        const temValores = proj.obra?.temValoresPorTipo;

        const horasContratadas = proj.obra?.horasContratadas || 0;
        const horasLancadas     = f.totalHorasFaturadas || 0;
        const pctFisico         = f.percentualConcluido || 0;
        const valorProduzido    = temValores ? (f.totalRS || 0) : null;

        // Gasto real = todas as despesas da obra (combustível já incluso em expenses).
        // Mesma base do "total_despesas" da tela de supervisor (SUM(amount) por obra).
        const despesasObra = (expenses || []).filter(e => String(e.obraId) === String(obraId));
        const gastoReal = despesasObra.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

        // Detalhamento por categoria (mesmo agrupamento da página atual).
        const catMap = {};
        despesasObra.forEach(e => {
            const cat = e.category || 'Outros';
            catMap[cat] = (catMap[cat] || 0) + (parseFloat(e.amount) || 0);
        });
        const despesasPorCategoria = Object.entries(catMap)
            .map(([category, total]) => ({ category, total }))
            .sort((a, b) => b.total - a.total);

        // Lancamento a lancamento - so o painel de detalhe consome.
        const despesasLista = [...despesasObra].sort(
            (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        );

        const margemRS  = valorProduzido != null ? valorProduzido - gastoReal : null;
        const margemPct = valorProduzido && valorProduzido > 0 ? (margemRS / valorProduzido) * 100 : null;
        const custoPorHora = horasLancadas > 0 ? gastoReal / horasLancadas : null;

        const valorContrato = parseFloat(obra?.valorTotalContrato) || null;
        const saldoContrato = valorContrato != null && valorProduzido != null ? valorContrato - valorProduzido : null;

        // Ritmo médio por quinzena (só quinzenas encerradas com lançamento).
        const quinzenas = f.quinzenas || [];
        const encerradasComLanc = quinzenas.filter(q => q.encerrada && q.horasLancadas > 0);
        const ritmoPctQuinzena = encerradasComLanc.length
            ? encerradasComLanc.reduce((s, q) => s + q.deltaPercent, 0) / encerradasComLanc.length
            : null;

        const faltaPara100 = Math.max(0, 100 - pctFisico);
        const hoje = todayLocal();
        const conclusaoProjetada = f.diasParaFinalizar != null ? addDays(hoje, f.diasParaFinalizar) : null;

        const inicio = proj.obra?.dataInicio || (obra?.dataInicio ? String(obra.dataInicio).slice(0, 10) : null);
        const metaEncerramento = inicio ? addDays(inicio, META_DIAS) : null;
        const diaAtual = inicio ? diffDays(hoje, inicio) + 1 : null;
        // Desvio: dias entre a conclusão projetada e a meta de 45 dias.
        const desvioDias = conclusaoProjetada && metaEncerramento ? diffDays(conclusaoProjetada, metaEncerramento) : null;

        return {
            temValores, horasContratadas, horasLancadas, pctFisico, valorProduzido,
            gastoReal, despesasPorCategoria, despesasLista, margemRS, margemPct, custoPorHora, valorContrato, saldoContrato,
            ritmoPctQuinzena, faltaPara100, conclusaoProjetada, inicio, metaEncerramento, diaAtual, desvioDias,
            quinzenas, comb, porItem: proj.faturamento?.porItem || [],
            ritmoHorasDia: f.ritmoHorasPorDia, diasComLancamento: f.diasComLancamento,
        };
    }, [proj, expenses, obraId, obra]);

    const frota = useMemo(() => {
        // linhas = tudo que trabalhou na obra no período; `alocados` conta só quem
        // continua na obra hoje (o backend marca alocadaAtualmente=false em quem saiu).
        const linhas = (analytics?.porVeiculo || []).filter(v => v.estado !== 'sucata');
        return {
            linhas,
            alocados: linhas.filter(v => v.alocadaAtualmente !== false).length,
            jaSairam: linhas.filter(v => v.alocadaAtualmente === false).length,
            aproveitamentoMedio: analytics?.summary?.aproveitamento ?? null,
        };
    }, [analytics]);

    // ── Estados de tela ──────────────────────────────────────────────────────
    if (!obra) {
        return (
            <div className="h-full overflow-y-auto" style={{ background: C.bg }}>
                <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
                    <TopRow onBack={onBack} onRefresh={null} loading={false} />
                    <div className="flex items-center justify-center py-24" style={{ color: C.inkSub, fontSize: 14 }}>
                        Obra não encontrada.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto" style={{ background: C.bg }}>
            <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">

                    {/* 0 ── Navegação (rola junto com o conteúdo — sem barra fixa) */}
                    <TopRow onBack={onBack} onRefresh={carregar} loading={loading} />

                    {/* 1 ── Cabeçalho (comum a todas as abas) ─────────────────── */}
                    <Cabecalho obra={obra} d={d} />

                    {/* Abas — só quando a pergunta muda (princípio do usuário) */}
                    <Abas aba={aba} setAba={setAba} />

                    {aba === 'visao' ? (
                        <>
                            {loading && !proj && (
                                <div className="flex items-center justify-center py-16" style={{ color: C.inkSub, fontSize: 13 }}>
                                    <RefreshCw size={16} className="animate-spin mr-2" /> Montando a ficha…
                                </div>
                            )}

                            {projErro && (
                                <div className="rounded-xl px-4 py-3" style={{ background: '#fdf0ec', border: `1px solid #f2c9bf`, color: C.red, fontSize: 13 }}>
                                    {projErro}
                                </div>
                            )}

                            {d && (
                                <>
                                    {/* 2 ── Grade por PARES de peso parecido, cada linha com a
                                        mesma altura (items-stretch + h-full no Card):
                                          linha 1: números da obra    | projeção
                                          linha 2: itens do contrato  | despesas  (duas listas)
                                        Combustível sai da grade: com 3 números ele nunca
                                        empatava a altura de um vizinho em lista — vira faixa
                                        larga e rasa. */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                                        <FisicoFinanceiro d={d} onDetalhe={() => setDetalhe({ chave: 'financeiro' })} />
                                        <Projecao d={d} onDetalhe={() => setDetalhe({ chave: 'projecao' })} />
                                        <ProgressoPorItem itens={d.porItem} horasContratadas={d.horasContratadas} horasLancadas={d.horasLancadas}
                                            onDetalhe={d.porItem.length ? () => setDetalhe({ chave: 'itens' }) : null}
                                            onItem={(it) => setDetalhe({ chave: 'item', item: it })} />
                                        <DespesasPorCategoria itens={d.despesasPorCategoria} total={d.gastoReal}
                                            onDetalhe={d.despesasPorCategoria.length ? () => setDetalhe({ chave: 'despesas' }) : null} />
                                    </div>
                                    <Combustivel d={d} onDetalhe={d.comb?.semDados ? null : () => setDetalhe({ chave: 'combustivel' })} />

                                    {/* 3 ── Terceiros nesta obra (some quando não há) ────── */}
                                    <FichaTerceiros obraId={obraId} />

                                    {/* 4 ── Frota nesta obra ─────────────────────────────── */}
                                    <FrotaTabela frota={frota} anErro={anErro} loading={loading && !analytics}
                                        onDetalhe={frota.linhas.length ? () => setDetalhe({ chave: 'frota' }) : null} />

                                    {/* 5 ── Evolução física (quinzenal) ──────────────────── */}
                                    <EvolucaoQuinzenal quinzenas={d.quinzenas}
                                        onDetalhe={d.quinzenas.length ? () => setDetalhe({ chave: 'quinzenas' }) : null} />

                                    {detalhe && (
                                        <DetalheDoCard chave={detalhe.chave} item={detalhe.item} d={d} frota={frota} obra={obra}
                                            onFechar={() => setDetalhe(null)} />
                                    )}
                                </>
                            )}
                        </>
                    ) : aba === 'aproveitamento' ? (
                        <FichaAproveitamento
                            obraId={obraId}
                            dataInicio={d?.inicio || proj?.obra?.dataInicio || null}
                            setAlertMessage={setAlertMessage}
                        />
                    ) : aba === 'faturamento' ? (
                        <FichaFaturamento obra={obra} vehicles={vehicles} obraId={obraId} />
                    ) : (
                        <FichaEvidencias obraId={obraId} obra={obra}
                            dataInicio={d?.inicio || proj?.obra?.dataInicio || null}
                            setAlertMessage={setAlertMessage} />
                    )}
            </div>
        </div>
    );
};

// ── Navegação (linha enxuta, rola junto com o conteúdo) ───────────────────────
// Sem barra branca fixa: a identidade da obra já vive no Cabeçalho logo abaixo,
// então aqui basta o "voltar" e o "atualizar" (densidade > chrome).
function TopRow({ onBack, onRefresh, loading }) {
    return (
        <div className="flex items-center justify-between">
            <button onClick={onBack}
                className="flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-lg hover:bg-black/5 transition-colors"
                style={{ color: C.inkMid, fontSize: 13 }}
                title="Voltar à lista de obras">
                <ArrowLeft size={16} /> Voltar
            </button>
            {onRefresh && (
                <button onClick={onRefresh} disabled={loading}
                    className="p-1.5 rounded-lg hover:bg-black/5 transition-colors" title="Atualizar">
                    <RefreshCw size={14} style={{ color: C.inkSub }} className={loading ? 'animate-spin' : ''} />
                </button>
            )}
        </div>
    );
}

// ── Barra de abas ─────────────────────────────────────────────────────────────
function Abas({ aba, setAba }) {
    const itens = [
        { id: 'visao', label: 'Visão geral' },
        { id: 'aproveitamento', label: 'Aproveitamento' },
        { id: 'faturamento', label: 'Faturamento' },
        { id: 'evidencias', label: 'Evidências' },
    ];
    return (
        <div className="flex items-center gap-1" style={{ borderBottom: `1px solid ${C.border}` }}>
            {itens.map((it) => {
                const ativo = aba === it.id;
                return (
                    <button key={it.id} onClick={() => setAba(it.id)}
                        style={{
                            fontSize: 13.5, fontWeight: ativo ? 700 : 500,
                            color: ativo ? C.ink : C.inkSub,
                            padding: '8px 14px',
                            borderBottom: `2px solid ${ativo ? C.gold : 'transparent'}`,
                            marginBottom: -1, background: 'transparent', cursor: 'pointer',
                        }}>
                        {it.label}
                    </button>
                );
            })}
        </div>
    );
}

// ── 1. Cabeçalho ──────────────────────────────────────────────────────────────
function Cabecalho({ obra, d }) {
    const meta = [
        obra.regiao && { icon: <MapPin size={13} />, txt: obra.regiao },
        obra.responsavel && { icon: <User size={13} />, txt: `Líder: ${obra.responsavel}` },
        obra.fiscal && { icon: <ClipboardList size={13} />, txt: `Fiscal: ${obra.fiscal}` },
    ].filter(Boolean);

    return (
        <div className="rounded-xl p-4 sm:p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                {/* Esquerda: identificação */}
                <div className="min-w-0">
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: C.ink, lineHeight: 1.15 }}>{formatObraNome(obra)}</h1>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                        {meta.map((m, i) => (
                            <span key={i} className="flex items-center gap-1" style={{ fontSize: 12.5, color: C.inkMid }}>
                                {m.icon}{m.txt}
                            </span>
                        ))}
                    </div>
                    {d?.inicio && (
                        <div style={{ fontSize: 12, color: C.inkSub, marginTop: 6 }}>
                            Início operacional em {fmtData(d.inicio)}
                            {d.diaAtual != null && ` · dia ${d.diaAtual}`}
                        </div>
                    )}
                </div>

                {/* Direita: contrato e prazo-meta */}
                <div className="shrink-0 md:text-right">
                    <div style={{ fontSize: 11, color: C.inkSub, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Valor de contrato</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: C.ink }}>{fmtBRL(d?.valorContrato)}</div>
                    <div className="mt-2 flex flex-col md:items-end gap-0.5" style={{ fontSize: 12, color: C.inkMid }}>
                        <span>Meta: {META_DIAS} dias{d?.metaEncerramento ? ` · encerra ${fmtData(d.metaEncerramento)}` : ''}</span>
                        <span style={{ color: C.inkSub }}>Hoje: {fmtData(todayLocal())}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── 2a. Físico & financeiro ───────────────────────────────────────────────────
function FisicoFinanceiro({ d, onDetalhe }) {
    return (
        <Card title="Físico & financeiro" onDetalhe={onDetalhe}>
            <div className="mb-3">
                <Progresso
                    rotulo="Progresso físico"
                    pct={d.pctFisico}
                    detalhe={`${fmtH(d.horasLancadas)} de ${d.horasContratadas ? fmtH(d.horasContratadas) : '—'} contratadas`}
                />
            </div>

            <Stat label="Valor produzido" value={d.temValores ? fmtBRL(d.valorProduzido) : '—'}
                hint={d.temValores ? null : 'sem preços por tipo'} />
            <Stat label="Gasto acumulado" value={fmtBRL(d.gastoReal)} />
            <Stat label="Margem"
                value={d.margemRS != null ? fmtBRL(d.margemRS) : '—'}
                valueColor={d.margemRS != null && d.margemRS < 0 ? C.red : C.ink}
                hint={d.margemPct != null ? fmtPct(d.margemPct) : null} />
            <Stat label="Custo por hora lançada" value={d.custoPorHora != null ? fmtBRL(d.custoPorHora) : '—'} />
            <Stat label="Saldo de contrato" value={d.saldoContrato != null ? fmtBRL(d.saldoContrato) : '—'} />
        </Card>
    );
}

// ── 2b. Progresso por item do contrato ────────────────────────────────────────
// O contrato é fechado item a item (subgrupo: "Escavadeira 13t" ≠ "26t"). Um
// progresso agregado de 91% pode ser um item em 130% e outro em 20% — leitura
// que a Ficha não entregava. Horas apontadas em item que o contrato não prevê
// aparecem no topo como "fora do contrato": não é ruído a esconder, é sujeira de
// dado a corrigir, e enquanto existir ela infla o total.
function ProgressoPorItem({ itens = [], horasContratadas = 0, horasLancadas = 0, onDetalhe, onItem }) {
    if (!itens.length) {
        // Lista vazia tem três causas e elas pedem ações diferentes. Afirmar
        // "não tem plano" para todas era errado: obra COM plano e COM horas só
        // cai aqui quando a resposta do backend não traz a quebra por item.
        const temPlano = horasContratadas > 0;
        const temHoras = horasLancadas > 0;
        const msg = (temPlano || temHoras)
            ? 'Quebra por item indisponível nesta resposta do servidor. Se o plano por item existe, reinicie o backend para publicar o campo.'
            : 'Esta obra não tem plano de horas por item nem apontamento classificado.';
        return (
            <Card title="Progresso por item do contrato">
                <p style={{ fontSize: 12.5, color: C.inkSub }}>{msg}</p>
            </Card>
        );
    }
    const fora = itens.filter((i) => i.foraDoContrato);
    const horasFora = fora.reduce((a, i) => a + i.horasExecutadas, 0);

    return (
        <Card title="Progresso por item do contrato" onDetalhe={onDetalhe}
            right={<span style={{ fontSize: 11, color: C.inkSub }}>{itens.length - fora.length} {itens.length - fora.length === 1 ? 'item' : 'itens'}</span>}>
            <div className="space-y-2.5">
                {itens.map((i) => {
                    const estourou = i.percentual != null && i.percentual > 100;
                    const cor = i.foraDoContrato || estourou ? C.red : C.gold;
                    // A linha é a unidade de interesse: cada item tem história
                    // própria (dia a dia, frota). Clicar nela abre esse detalhe,
                    // sem disparar o detalhe do card inteiro.
                    const abrir = onItem ? (e) => { e.stopPropagation(); onItem(i); } : undefined;
                    return (
                        <div key={i.key}
                            onClick={abrir}
                            role={abrir ? 'button' : undefined}
                            tabIndex={abrir ? 0 : undefined}
                            onKeyDown={abrir ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onItem(i); }
                            } : undefined}
                            title={abrir ? `Ver evolução de ${i.key}` : undefined}
                            className={abrir ? 'rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-black/[0.035] transition-colors cursor-pointer' : undefined}>
                            <div className="flex items-baseline justify-between gap-2 mb-1">
                                <span className="truncate" style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>
                                    {i.key}
                                    {i.foraDoContrato && (
                                        <span style={{ fontSize: 10.5, color: C.red, marginLeft: 6, fontWeight: 700 }}>fora do contrato</span>
                                    )}
                                </span>
                                <span className="shrink-0" style={{ fontSize: 12.5 }}>
                                    <span style={{ fontWeight: 700, color: estourou || i.foraDoContrato ? C.red : C.ink }}>
                                        {i.percentual != null ? fmtPct(i.percentual) : '—'}
                                    </span>
                                    <span style={{ color: C.inkSub, marginLeft: 6, fontSize: 11 }}>
                                        {fmtH(i.horasExecutadas)}{i.horasContratadas > 0 ? ` / ${fmtH(i.horasContratadas)}` : ''}
                                    </span>
                                </span>
                            </div>
                            <div className="w-full h-2 rounded-full" style={{ background: C.bg }}>
                                <div className="h-2 rounded-full"
                                    style={{ width: `${Math.min(i.percentual ?? 100, 100)}%`, background: cor }} />
                            </div>
                        </div>
                    );
                })}
            </div>
            {onItem && (
                <p style={{ fontSize: 10.5, color: C.inkSub, marginTop: 10 }}>
                    Clique em um item para ver a evolução dia a dia.
                </p>
            )}
            {horasFora > 0 && (
                <p style={{ fontSize: 10.5, color: C.inkSub, marginTop: 6, fontStyle: 'italic' }}>
                    {fmtH(horasFora)} apontadas em item que não está no contrato — corrigir o item da alocação
                    devolve essas horas ao item certo.
                </p>
            )}
        </Card>
    );
}

// ── 2c. Projeção contra a meta de 45 dias ─────────────────────────────────────
function Projecao({ d, onDetalhe }) {
    const atrasada = d.desvioDias != null && d.desvioDias > 0;
    return (
        <Card title={`Projeção · meta ${META_DIAS} dias`} onDetalhe={onDetalhe}>
            <Stat label="Ritmo médio" value={d.ritmoPctQuinzena != null ? fmtPct(d.ritmoPctQuinzena, 1) : '—'} hint="por quinzena" />
            <Stat label="Ritmo médio em horas" value={d.ritmoHorasDia != null ? fmtH(d.ritmoHorasDia) : '—'} hint="por dia com lançamento" />
            <Stat label="Falta para 100%" value={fmtPct(d.faltaPara100, 1)} />
            <Stat label="Conclusão projetada" value={fmtData(d.conclusaoProjetada)} />
            <Stat label="Desvio contra a meta"
                value={d.desvioDias != null ? `${d.desvioDias > 0 ? '+' : ''}${d.desvioDias} d` : '—'}
                valueColor={d.desvioDias == null ? C.ink : atrasada ? C.red : C.green} />
            <p style={{ fontSize: 10.5, color: C.inkSub, marginTop: 8, fontStyle: 'italic' }}>
                Conclusão estimada pelo ritmo médio de horas nos dias com lançamento.
            </p>
        </Card>
    );
}

// ── 2d. Combustível vs faturamento ────────────────────────────────────────────
function Combustivel({ d, onDetalhe }) {
    const c = d.comb || {};
    if (c.semDados) {
        return (
            <Card title="Combustível vs faturamento">
                <p style={{ fontSize: 12.5, color: C.inkSub }}>Nenhum abastecimento vinculado a esta obra.</p>
            </Card>
        );
    }
    const acimaLimite = c.projecaoFinalPercent != null && c.projecaoFinalPercent > LIMITE_COMBUSTIVEL;
    return (
        <Card title="Combustível vs faturamento" onDetalhe={onDetalhe}>
            {/* Três números em linha: o card é largo e raso de propósito — em
                coluna ele ficava com metade da altura do vizinho e a grade
                parecia quebrada. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6">
                <Stat label="% atual sobre faturado" value={fmtPct(c.percentualAtual, 1)} />
                <Stat label="Projeção ao final"
                    value={fmtPct(c.projecaoFinalPercent, 1)}
                    hint={c.custoProjetadoRS != null ? fmtBRL(c.custoProjetadoRS) : null}
                    valueColor={acimaLimite ? C.red : C.green} />
                <Stat label="Custo de combustível" value={fmtBRL(c.totalCustoRS)} hint={c.totalLitros ? `${Number(c.totalLitros).toLocaleString('pt-BR')} L` : null} />
            </div>
            <p style={{ fontSize: 10.5, color: C.inkSub, marginTop: 8 }}>
                Limite interno: {LIMITE_COMBUSTIVEL}% do faturamento.
            </p>
        </Card>
    );
}

// ── 2e. Despesas por categoria ────────────────────────────────────────────────
function DespesasPorCategoria({ itens = [], total = 0, onDetalhe }) {
    if (!itens.length) {
        return (
            <Card title="Despesas por categoria">
                <p style={{ fontSize: 12.5, color: C.inkSub }}>Nenhuma despesa registrada nesta obra.</p>
            </Card>
        );
    }
    const max = itens[0]?.total || 1;
    // Teto de linhas: sem ele uma obra com 15 categorias fazia este card ficar
    // com o dobro da altura do vizinho e desalinhava a grade inteira.
    const TETO = 8;
    const visiveis = itens.length > TETO ? itens.slice(0, TETO) : itens;
    const resto = itens.slice(visiveis.length);
    const totalResto = resto.reduce((a, c) => a + c.total, 0);
    return (
        <Card title="Despesas por categoria" onDetalhe={onDetalhe}>
            <div className="space-y-2.5">
                {visiveis.map((c) => {
                    const share = total > 0 ? (c.total / total) * 100 : 0;
                    return (
                        <div key={c.category}>
                            <div className="flex items-baseline justify-between mb-1" style={{ fontSize: 12.5 }}>
                                <span style={{ color: C.inkMid }} className="truncate pr-2">{c.category}</span>
                                <span>
                                    <span style={{ fontWeight: 700, color: C.ink }}>{fmtBRL(c.total)}</span>
                                    <span style={{ color: C.inkSub, marginLeft: 6, fontSize: 11 }}>{fmtPct(share, 1)}</span>
                                </span>
                            </div>
                            <div className="w-full h-2 rounded-full" style={{ background: C.bg }}>
                                <div className="h-2 rounded-full" style={{ width: `${Math.min((c.total / max) * 100, 100)}%`, background: C.gold }} />
                            </div>
                        </div>
                    );
                })}
            </div>
            {resto.length > 0 && (
                <div className="flex justify-between mt-2.5" style={{ fontSize: 12, color: C.inkSub }}>
                    <span>+ {resto.length} outras categorias</span>
                    <span>{fmtBRL(totalResto)}</span>
                </div>
            )}
            <div className="flex justify-between mt-auto pt-2" style={{ borderTop: `1px solid ${C.border}`, fontSize: 12.5, marginTop: 12 }}>
                <span style={{ color: C.inkMid }}>Total de despesas</span>
                <span style={{ fontWeight: 700, color: C.ink }}>{fmtBRL(total)}</span>
            </div>
        </Card>
    );
}

// ── 3. Frota nesta obra ───────────────────────────────────────────────────────
function FrotaTabela({ frota, anErro, loading, onDetalhe }) {
    return (
        <Card title="Frota nesta obra" onDetalhe={onDetalhe}
            right={frota.linhas.length > 0 ? (
                <span style={{ fontSize: 11.5, color: C.inkSub }}>
                    {frota.alocados} alocado{frota.alocados !== 1 ? 's' : ''}
                    {frota.jaSairam > 0 && ` · ${frota.jaSairam} já ${frota.jaSairam === 1 ? 'saiu' : 'saíram'}`}
                    {frota.aproveitamentoMedio != null && ` · aproveitamento médio ${fmtPct(frota.aproveitamentoMedio)}`}
                </span>
            ) : null}
        >
            {loading ? (
                <p style={{ fontSize: 12.5, color: C.inkSub }}>Carregando frota…</p>
            ) : anErro ? (
                <p style={{ fontSize: 12.5, color: C.inkSub }}>{anErro}</p>
            ) : frota.linhas.length === 0 ? (
                <p style={{ fontSize: 12.5, color: C.inkSub }}>Nenhuma máquina com apontamento nesta obra no período.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                <Th>Veículo</Th>
                                <Th>Tipo</Th>
                                <Th right>Horas lançadas</Th>
                                <Th right>Aproveitamento</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {frota.linhas.map((v) => (
                                <tr key={v.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                                    <td style={{ padding: '8px 10px', fontSize: 13 }}>
                                        <span style={{ fontWeight: 700, color: C.ink }}>{v.registroInterno || '—'}</span>
                                        {v.modelo && <span style={{ color: C.inkSub, marginLeft: 6, fontSize: 12 }}>{v.modelo}</span>}
                                        {v.estado === 'manutencao' && <span style={{ color: C.inkSub, marginLeft: 6, fontSize: 11 }}>· em manutenção</span>}
                                        {v.alocadaAtualmente === false && <span style={{ color: C.inkSub, marginLeft: 6, fontSize: 11 }}>· já saiu</span>}
                                    </td>
                                    <td style={{ padding: '8px 10px', fontSize: 12.5, color: C.inkMid }}>{v.tipo || '—'}</td>
                                    <td style={{ padding: '8px 10px', fontSize: 13, textAlign: 'right', color: C.ink }}>{fmtH(v.horas_executadas)}</td>
                                    <td style={{ padding: '8px 10px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: C.ink }}>
                                        {v.capPeriodo > 0 ? fmtPct(v.aproveitamento) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

function Th({ children, right }) {
    return (
        <th style={{ padding: '6px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.inkSub, textAlign: right ? 'right' : 'left' }}>
            {children}
        </th>
    );
}

// ── 4. Evolução física por quinzena ───────────────────────────────────────────
function EvolucaoQuinzenal({ quinzenas = [], onDetalhe }) {
    if (!quinzenas.length) {
        return (
            <Card title="Evolução física por quinzena">
                <p style={{ fontSize: 12.5, color: C.inkSub }}>Sem lançamentos registrados.</p>
            </Card>
        );
    }
    const maxDelta = Math.max(...quinzenas.map(q => q.deltaPercent || 0), 1);
    return (
        <Card title="Evolução física por quinzena" onDetalhe={onDetalhe}>
            <div className="space-y-2.5">
                {quinzenas.map((q) => (
                    <div key={q.numero} className="flex items-center gap-3">
                        <span style={{ fontSize: 11, color: C.inkSub, width: 96, flexShrink: 0 }}>
                            {q.numero}ª · {fmtData(q.dataInicio).slice(0, 5)}–{fmtData(q.dataFim).slice(0, 5)}
                        </span>
                        <div className="flex-1 h-2 rounded-full" style={{ background: C.bg }}>
                            <div className="h-2 rounded-full" style={{ width: `${Math.min((q.deltaPercent / maxDelta) * 100, 100)}%`, background: C.gold }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, width: 56, textAlign: 'right' }}>
                            {q.deltaPercent > 0 ? `+${fmtPct(q.deltaPercent, 1)}` : '—'}
                        </span>
                        <span style={{ fontSize: 11, color: C.inkSub, width: 52, textAlign: 'right' }}>
                            {fmtPct(q.percentualAcumulado)}
                        </span>
                    </div>
                ))}
            </div>
            <div className="flex justify-between mt-3 pt-2" style={{ borderTop: `1px solid ${C.border}`, fontSize: 10.5, color: C.inkSub }}>
                <span>Δ por quinzena</span>
                <span>% acumulado do contratado</span>
            </div>
        </Card>
    );
}

// ── Detalhamento de um card ───────────────────────────────────────────────────
// Cada card da Visão geral responde "quanto?". O detalhe responde "de onde
// vem?": a lista completa (sem teto de linhas) e a memória de cálculo. Nenhum
// número novo do backend — só o que a Ficha já tem, aberto.
function DetalheDoCard({ chave, item, d, frota, obra, onFechar }) {
    const conf = {
        financeiro:  { titulo: 'Físico & financeiro',        sub: 'Como cada número é formado' },
        projecao:    { titulo: `Projeção · meta ${META_DIAS} dias`, sub: 'Ritmo, datas e as quinzenas que entram na conta' },
        itens:       { titulo: 'Progresso por item do contrato', sub: 'Todos os itens, com horas e saldo' },
        despesas:    { titulo: 'Despesas por categoria',     sub: 'Categorias completas e lançamento a lançamento' },
        combustivel: { titulo: 'Combustível vs faturamento', sub: `Limite interno de ${LIMITE_COMBUSTIVEL}% do faturamento` },
        frota:       { titulo: 'Frota nesta obra',           sub: 'Horas, capacidade líquida e ociosidade por máquina' },
        quinzenas:   { titulo: 'Evolução física por quinzena', sub: 'Horas e avanço de cada quinzena' },
        item:        { titulo: item?.key || 'Item do contrato', sub: 'Evolução dia a dia, frota e ritmo deste item' },
    }[chave] || { titulo: 'Detalhamento', sub: null };

    return (
        <PainelDetalhe titulo={conf.titulo} subtitulo={conf.sub} onFechar={onFechar}>
            <p style={{ fontSize: 12, color: C.inkSub }}>{formatObraNome(obra)}</p>
            {chave === 'financeiro'  && <DetFinanceiro d={d} />}
            {chave === 'projecao'    && <DetProjecao d={d} />}
            {chave === 'itens'       && <DetItens d={d} />}
            {chave === 'despesas'    && <DetDespesas d={d} />}
            {chave === 'combustivel' && <DetCombustivel d={d} />}
            {chave === 'frota'       && <DetFrota frota={frota} />}
            {chave === 'quinzenas'   && <DetQuinzenas d={d} />}
            {chave === 'item'        && <DetItemUnico item={item} d={d} />}
        </PainelDetalhe>
    );
}

// Tabela enxuta reaproveitada pelos detalhes.
function Tabela({ cols, linhas }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {cols.map((c, i) => <Th key={i} right={c.right}>{c.label}</Th>)}
                    </tr>
                </thead>
                <tbody>
                    {linhas.map((l, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                            {l.celulas.map((cel, j) => (
                                <td key={j} style={{
                                    padding: '7px 10px', fontSize: 12.5,
                                    textAlign: cols[j].right ? 'right' : 'left',
                                    color: cel.cor || C.ink, fontWeight: cel.forte ? 700 : 400,
                                }}>
                                    {cel.v}
                                    {cel.sub && <span style={{ color: C.inkSub, marginLeft: 6, fontSize: 11 }}>{cel.sub}</span>}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function DetFinanceiro({ d }) {
    const horasFalta = Math.max(0, (d.horasContratadas || 0) - (d.horasLancadas || 0));
    return (
        <>
            <Bloco titulo="Horas">
                <Stat label="Contratadas" value={d.horasContratadas ? fmtH(d.horasContratadas) : '—'} />
                <Stat label="Lançadas" value={fmtH(d.horasLancadas)} hint={fmtPct(d.pctFisico)} />
                <Stat label="A lançar" value={fmtH(horasFalta)} hint={fmtPct(d.faltaPara100, 1)} />
            </Bloco>

            <Bloco titulo="Receita" nota="Valor produzido = horas lançadas × preço do tipo no contrato. É estimativa de produção, não nota emitida.">
                <Stat label="Valor de contrato" value={fmtBRL(d.valorContrato)} />
                <Stat label="Valor produzido" value={d.temValores ? fmtBRL(d.valorProduzido) : '—'}
                    hint={d.temValores ? null : 'sem preços por tipo'} />
                <Stat label="Saldo de contrato" value={d.saldoContrato != null ? fmtBRL(d.saldoContrato) : '—'} />
            </Bloco>

            <Bloco titulo="Custo e margem" nota="Gasto acumulado = soma de todas as despesas lançadas nesta obra (combustível incluso).">
                <Stat label="Gasto acumulado" value={fmtBRL(d.gastoReal)} />
                <Stat label="Margem" value={d.margemRS != null ? fmtBRL(d.margemRS) : '—'}
                    valueColor={d.margemRS != null && d.margemRS < 0 ? C.red : C.ink}
                    hint={d.margemPct != null ? fmtPct(d.margemPct) : null} />
                <Stat label="Custo por hora lançada" value={d.custoPorHora != null ? fmtBRL(d.custoPorHora) : '—'}
                    hint={d.horasLancadas > 0 ? `${fmtBRL(d.gastoReal)} ÷ ${fmtH(d.horasLancadas)}` : null} />
                {d.temValores && d.horasLancadas > 0 && (
                    <Stat label="Receita por hora lançada" value={fmtBRL((d.valorProduzido || 0) / d.horasLancadas)} />
                )}
            </Bloco>

            {d.despesasPorCategoria.length > 0 && (
                <Bloco titulo="Composição do gasto">
                    <Tabela
                        cols={[{ label: 'Categoria' }, { label: 'Valor', right: true }, { label: '% do gasto', right: true }]}
                        linhas={d.despesasPorCategoria.map((c) => ({
                            celulas: [
                                { v: c.category },
                                { v: fmtBRL(c.total), forte: true },
                                { v: fmtPct(d.gastoReal > 0 ? (c.total / d.gastoReal) * 100 : 0, 1), cor: C.inkSub },
                            ],
                        }))}
                    />
                </Bloco>
            )}
        </>
    );
}

function DetProjecao({ d }) {
    const usadas = (d.quinzenas || []).filter((q) => q.encerrada && q.horasLancadas > 0);
    const atrasada = d.desvioDias != null && d.desvioDias > 0;
    return (
        <>
            <Bloco titulo="Linha do tempo">
                <Stat label="Início operacional" value={fmtData(d.inicio)} hint={d.diaAtual != null ? `dia ${d.diaAtual}` : null} />
                <Stat label="Hoje" value={fmtData(todayLocal())} />
                <Stat label={`Meta (${META_DIAS} dias)`} value={fmtData(d.metaEncerramento)} />
                <Stat label="Conclusão projetada" value={fmtData(d.conclusaoProjetada)} />
                <Stat label="Desvio contra a meta"
                    value={d.desvioDias != null ? `${d.desvioDias > 0 ? '+' : ''}${d.desvioDias} d` : '—'}
                    valueColor={d.desvioDias == null ? C.ink : atrasada ? C.red : C.green} />
            </Bloco>

            <Bloco titulo="Ritmo"
                nota="A conclusão projetada usa o ritmo de horas por dia COM lançamento — dia sem apontamento não entra na média, então a data assume que a obra segue lançando na mesma cadência.">
                <Stat label="Ritmo médio" value={d.ritmoPctQuinzena != null ? fmtPct(d.ritmoPctQuinzena, 1) : '—'} hint="por quinzena" />
                <Stat label="Ritmo médio em horas" value={d.ritmoHorasDia != null ? fmtH(d.ritmoHorasDia) : '—'} hint="por dia com lançamento" />
                <Stat label="Dias com lançamento" value={d.diasComLancamento != null ? d.diasComLancamento : '—'} />
                <Stat label="Falta para 100%" value={fmtPct(d.faltaPara100, 1)}
                    hint={d.horasContratadas ? fmtH(Math.max(0, d.horasContratadas - d.horasLancadas)) : null} />
            </Bloco>

            <Bloco titulo="Quinzenas que entram no ritmo médio"
                nota="Só quinzenas encerradas E com lançamento. A quinzena em curso fica de fora até fechar.">
                {usadas.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: C.inkSub }}>Nenhuma quinzena encerrada com lançamento ainda.</p>
                ) : (
                    <Tabela
                        cols={[{ label: 'Quinzena' }, { label: 'Período' }, { label: 'Horas', right: true }, { label: 'Δ %', right: true }]}
                        linhas={usadas.map((q) => ({
                            celulas: [
                                { v: `${q.numero}ª`, forte: true },
                                { v: `${fmtData(q.dataInicio)} – ${fmtData(q.dataFim)}`, cor: C.inkMid },
                                { v: fmtH(q.horasLancadas) },
                                { v: fmtPct(q.deltaPercent, 1), forte: true },
                            ],
                        }))}
                    />
                )}
            </Bloco>
        </>
    );
}

function DetItens({ d }) {
    const itens = d.porItem || [];
    const dentro = itens.filter((i) => !i.foraDoContrato);
    const fora = itens.filter((i) => i.foraDoContrato);
    const cols = [{ label: 'Item' }, { label: 'Contratadas', right: true }, { label: 'Executadas', right: true }, { label: 'Saldo', right: true }, { label: '%', right: true }];
    const linhasDe = (arr) => arr.map((i) => {
        const saldo = i.horasContratadas > 0 ? i.horasContratadas - i.horasExecutadas : null;
        const estourou = i.percentual != null && i.percentual > 100;
        return {
            celulas: [
                { v: i.key, forte: true },
                { v: i.horasContratadas > 0 ? fmtH(i.horasContratadas) : '—', cor: C.inkMid },
                { v: fmtH(i.horasExecutadas) },
                { v: saldo == null ? '—' : fmtH(saldo), cor: saldo != null && saldo < 0 ? C.red : C.inkMid },
                { v: i.percentual != null ? fmtPct(i.percentual) : '—', forte: true, cor: estourou || i.foraDoContrato ? C.red : C.ink },
            ],
        };
    });

    return (
        <>
            <Bloco titulo="Itens do contrato">
                {dentro.length === 0
                    ? <p style={{ fontSize: 12.5, color: C.inkSub }}>Nenhum item previsto no contrato.</p>
                    : <Tabela cols={cols} linhas={linhasDe(dentro)} />}
            </Bloco>

            {fora.length > 0 && (
                <Bloco titulo="Fora do contrato"
                    nota="Horas apontadas em item que o contrato não prevê. Enquanto existirem, inflam o total — corrigir o item da alocação devolve essas horas ao item certo.">
                    <Tabela cols={cols} linhas={linhasDe(fora)} />
                </Bloco>
            )}

            <Bloco titulo="Totais">
                <Stat label="Horas contratadas" value={d.horasContratadas ? fmtH(d.horasContratadas) : '—'} />
                <Stat label="Horas executadas" value={fmtH(d.horasLancadas)} />
                <Stat label="Progresso físico" value={fmtPct(d.pctFisico)} />
            </Bloco>
        </>
    );
}

function DetDespesas({ d }) {
    const lista = d.despesasLista || [];
    return (
        <>
            <Bloco titulo="Por categoria">
                <Tabela
                    cols={[{ label: 'Categoria' }, { label: 'Valor', right: true }, { label: '%', right: true }]}
                    linhas={d.despesasPorCategoria.map((c) => ({
                        celulas: [
                            { v: c.category },
                            { v: fmtBRL(c.total), forte: true },
                            { v: fmtPct(d.gastoReal > 0 ? (c.total / d.gastoReal) * 100 : 0, 1), cor: C.inkSub },
                        ],
                    }))}
                />
                <div className="flex justify-between mt-3 pt-2" style={{ borderTop: `1px solid ${C.border}`, fontSize: 12.5 }}>
                    <span style={{ color: C.inkMid }}>Total de despesas</span>
                    <span style={{ fontWeight: 700, color: C.ink }}>{fmtBRL(d.gastoReal)}</span>
                </div>
            </Bloco>

            <Bloco titulo={`Lançamentos (${lista.length})`} nota="Data do registro da despesa no sistema.">
                {lista.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: C.inkSub }}>Nenhum lançamento.</p>
                ) : (
                    <Tabela
                        cols={[{ label: 'Data' }, { label: 'Descrição' }, { label: 'Categoria' }, { label: 'Valor', right: true }]}
                        linhas={lista.map((e) => ({
                            celulas: [
                                { v: e.createdAt ? new Date(e.createdAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—', cor: C.inkSub },
                                { v: e.description || 'Sem descrição' },
                                { v: e.category || 'Outros', cor: C.inkMid },
                                { v: fmtBRL(parseFloat(e.amount) || 0), forte: true },
                            ],
                        }))}
                    />
                )}
            </Bloco>
        </>
    );
}

function DetCombustivel({ d }) {
    const c = d.comb || {};
    const acima = c.projecaoFinalPercent != null && c.projecaoFinalPercent > LIMITE_COMBUSTIVEL;
    const precoLitro = c.totalLitros > 0 && c.totalCustoRS != null ? c.totalCustoRS / c.totalLitros : null;
    const porHora = d.horasLancadas > 0 && c.totalCustoRS != null ? c.totalCustoRS / d.horasLancadas : null;
    const litrosHora = d.horasLancadas > 0 && c.totalLitros > 0 ? c.totalLitros / d.horasLancadas : null;

    const abast = c.abastecimentos || [];
    const totalLista = abast.reduce(
        (acc, a) => ({ litros: acc.litros + (a.litros || 0), valor: acc.valor + (a.valorRS || 0) }),
        { litros: 0, valor: 0 },
    );
    // Consolida por máquina — "quem bebeu" é a leitura que a lista crua esconde.
    const porVeiculo = Object.values(abast.reduce((acc, a) => {
        const k = a.veiculo || '(sem veículo)';
        if (!acc[k]) acc[k] = { veiculo: a.veiculo, modelo: a.modelo, qtd: 0, litros: 0, valor: 0 };
        acc[k].qtd += 1;
        acc[k].litros += a.litros || 0;
        acc[k].valor += a.valorRS || 0;
        return acc;
    }, {})).sort((x, y) => y.litros - x.litros);

    return (
        <>
            <Bloco titulo="Consumo acumulado"
                nota="Liberado é o que foi autorizado na ordem; abastecido é o que a máquina recebeu de fato. Os dois convivem porque nem todo registro traz ambos — a diferença entre eles é ordem aberta ou litro não informado, não perda.">
                <Stat label="Custo de combustível" value={fmtBRL(c.totalCustoRS)} />
                <Stat label="Litros liberados" value={c.totalLitros != null ? `${Number(c.totalLitros).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L` : '—'} />
                <Stat label="Litros abastecidos" value={`${totalLista.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L`}
                    hint={`${abast.length} registro${abast.length === 1 ? '' : 's'}`} />
                <Stat label="Preço médio por litro"
                    value={totalLista.litros > 0 && totalLista.valor > 0 ? fmtBRL(totalLista.valor / totalLista.litros) : (precoLitro != null ? fmtBRL(precoLitro) : '—')} />
            </Bloco>

            <Bloco titulo="Contra o faturamento"
                nota={`Limite interno: ${LIMITE_COMBUSTIVEL}% do faturamento. A projeção estende o custo atual até 100% das horas contratadas e compara com o faturamento do contrato inteiro (horas × valor hora) — diferença contra o atual vem do mix de itens que falta executar.`}>
                <Stat label="% atual sobre faturado" value={fmtPct(c.percentualAtual, 1)} />
                <Stat label="Projeção ao final"
                    value={fmtPct(c.projecaoFinalPercent, 1)} valueColor={acima ? C.red : C.green} />
                {c.custoProjetadoRS != null && (
                    <Stat label="Combustível projetado ao final" value={fmtBRL(c.custoProjetadoRS)} />
                )}
                <Stat label="Folga contra o limite"
                    value={c.projecaoFinalPercent != null ? fmtPct(LIMITE_COMBUSTIVEL - c.projecaoFinalPercent, 1) : '—'}
                    valueColor={acima ? C.red : C.green} />
            </Bloco>

            <Bloco titulo="Por hora lançada">
                <Stat label="Custo de combustível por hora" value={porHora != null ? fmtBRL(porHora) : '—'} />
                <Stat label="Litros por hora" value={litrosHora != null ? `${litrosHora.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L/h` : '—'} />
                <Stat label="Peso no gasto total"
                    value={d.gastoReal > 0 && c.totalCustoRS != null ? fmtPct((c.totalCustoRS / d.gastoReal) * 100, 1) : '—'} />
            </Bloco>

            {porVeiculo.length > 0 && (
                <Bloco titulo="Consumo por máquina"
                    nota="Litros abastecidos por veículo nesta obra, do maior para o menor.">
                    <Tabela
                        cols={[{ label: 'Veículo' }, { label: 'Abast.', right: true }, { label: 'Litros', right: true }, { label: 'Valor', right: true }]}
                        linhas={porVeiculo.map((v) => ({
                            celulas: [
                                { v: v.veiculo || '—', forte: true, sub: v.modelo },
                                { v: v.qtd, cor: C.inkMid },
                                { v: `${v.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L` },
                                { v: v.valor > 0 ? fmtBRL(v.valor) : '—', forte: true },
                            ],
                        }))}
                    />
                </Bloco>
            )}

            <Bloco titulo={`Abastecimentos (${abast.length})`}
                nota="O custo oficial da obra vem das despesas lançadas (inclui comboio e ajustes manuais). A conferência abaixo mostra o quanto esta lista explica desse total.">
                {abast.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: C.inkSub }}>Nenhum abastecimento vinculado.</p>
                ) : (
                    <Tabela
                        cols={[{ label: 'Data' }, { label: 'Veículo' }, { label: 'Posto' }, { label: 'Litros', right: true }, { label: 'R$/L', right: true }, { label: 'Valor', right: true }]}
                        linhas={abast.map((a) => ({
                            celulas: [
                                { v: a.data ? `${a.data.slice(8, 10)}/${a.data.slice(5, 7)}` : '—', cor: C.inkSub, sub: a.data ? a.data.slice(11) : null },
                                {
                                    v: a.veiculo || '—', forte: true,
                                    sub: [a.tanqueCheio ? '· cheio' : null, a.status && a.status !== 'Concluída' ? `· ${a.status}` : null]
                                        .filter(Boolean).join(' ') || null,
                                },
                                { v: a.posto || '—', cor: C.inkMid },
                                { v: `${a.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L` },
                                { v: a.precoLitro != null ? fmtBRL(a.precoLitro) : '—', cor: C.inkSub },
                                { v: a.valorRS != null ? fmtBRL(a.valorRS) : '—', forte: true },
                            ],
                        }))}
                    />
                )}
                {abast.length > 0 && (
                    <div className="mt-3 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                        <Stat label="Soma desta lista" value={fmtBRL(totalLista.valor)}
                            hint={`${totalLista.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L`} />
                        <Stat label="Custo lançado em despesas" value={fmtBRL(c.totalCustoRS)} />
                        <Stat label="Diferença"
                            value={c.totalCustoRS != null ? fmtBRL(totalLista.valor - c.totalCustoRS) : '—'}
                            valueColor={c.totalCustoRS != null && Math.abs(totalLista.valor - c.totalCustoRS) > 1 ? C.red : C.green}
                            hint={c.totalCustoRS != null && Math.abs(totalLista.valor - c.totalCustoRS) <= 1
                                ? 'a lista explica o custo' : 'há custo fora desta lista'} />
                    </div>
                )}
            </Bloco>
        </>
    );
}

function DetFrota({ frota }) {
    const linhas = frota.linhas || [];
    const totalHoras = linhas.reduce((a, v) => a + (Number(v.horas_executadas) || 0), 0);
    const totalCap = linhas.reduce((a, v) => a + (Number(v.capPeriodo) || 0), 0);
    return (
        <>
            <Bloco titulo="Resumo">
                <Stat label="Máquinas com apontamento" value={linhas.length} />
                <Stat label="Alocadas hoje" value={frota.alocados}
                    hint={frota.jaSairam > 0 ? `${frota.jaSairam} já ${frota.jaSairam === 1 ? 'saiu' : 'saíram'}` : null} />
                <Stat label="Horas lançadas" value={fmtH(totalHoras)} />
                <Stat label="Capacidade líquida" value={fmtH(totalCap)} />
                <Stat label="Aproveitamento médio" value={frota.aproveitamentoMedio != null ? fmtPct(frota.aproveitamentoMedio) : '—'} />
            </Bloco>

            <Bloco titulo="Por máquina"
                nota="Ociosas = capacidade líquida do período menos horas apontadas. Ordenado do pior aproveitamento para o melhor.">
                <Tabela
                    cols={[{ label: 'Veículo' }, { label: 'Tipo' }, { label: 'Horas', right: true }, { label: 'Capacidade', right: true }, { label: 'Ociosas', right: true }, { label: 'Aprov.', right: true }]}
                    linhas={[...linhas]
                        .sort((a, b) => (a.aproveitamento ?? 999) - (b.aproveitamento ?? 999))
                        .map((v) => {
                            const ociosas = Number(v.capPeriodo) > 0 ? Number(v.capPeriodo) - Number(v.horas_executadas || 0) : null;
                            return {
                                celulas: [
                                    {
                                        v: v.registroInterno || '—', forte: true,
                                        sub: v.alocadaAtualmente === false ? '· já saiu' : (v.estado === 'manutencao' ? '· manutenção' : null),
                                    },
                                    { v: v.tipo || '—', cor: C.inkMid },
                                    { v: fmtH(v.horas_executadas) },
                                    { v: Number(v.capPeriodo) > 0 ? fmtH(v.capPeriodo) : '—', cor: C.inkMid },
                                    { v: ociosas == null ? '—' : fmtH(Math.max(0, ociosas)), cor: C.inkMid },
                                    { v: Number(v.capPeriodo) > 0 ? fmtPct(v.aproveitamento) : '—', forte: true },
                                ],
                            };
                        })}
                />
            </Bloco>
        </>
    );
}

function DetQuinzenas({ d }) {
    const qs = d.quinzenas || [];
    return (
        <Bloco titulo="Quinzena a quinzena"
            nota="Δ % é o avanço daquela quinzena sobre o total contratado; o acumulado é a soma até ali.">
            <Tabela
                cols={[{ label: 'Quinzena' }, { label: 'Período' }, { label: 'Horas', right: true }, { label: 'Δ %', right: true }, { label: 'Acumulado', right: true }]}
                linhas={qs.map((q) => ({
                    celulas: [
                        { v: `${q.numero}ª`, forte: true, sub: q.encerrada ? null : '· em curso' },
                        { v: `${fmtData(q.dataInicio)} – ${fmtData(q.dataFim)}`, cor: C.inkMid },
                        { v: fmtH(q.horasLancadas) },
                        { v: q.deltaPercent > 0 ? `+${fmtPct(q.deltaPercent, 1)}` : '—', forte: true },
                        { v: fmtPct(q.percentualAcumulado), cor: C.inkSub },
                    ],
                }))}
            />
        </Bloco>
    );
}

// ── Detalhe de UM item do contrato ────────────────────────────────────────────
// O card diz "58% do item". A pergunta seguinte é sempre "avançou quando, e com
// o quê?" — que só o dia a dia responde. Aqui entram a série diária (barras +
// acumulado), o ritmo e as máquinas que apontaram naquele item.
function DetItemUnico({ item, d }) {
    const serie = item?.serieDiaria || [];
    const veiculos = item?.veiculos || [];
    const saldo = item?.horasContratadas > 0 ? item.horasContratadas - item.horasExecutadas : null;
    const estourou = item?.percentual != null && item.percentual > 100;
    const mediaDia = serie.length ? item.horasExecutadas / serie.length : null;

    // Ritmo dos últimos 7 dias COM lançamento — é o que diz se o item acelerou
    // ou parou, coisa que a média do período inteiro esconde.
    const ult7 = serie.slice(-7);
    const mediaUlt7 = ult7.length ? ult7.reduce((a, x) => a + x.horas, 0) / ult7.length : null;
    const ultimoDia = serie.length ? serie[serie.length - 1].data : null;
    const diasParado = ultimoDia ? diffDays(todayLocal(), ultimoDia) : null;

    // Projeção do próprio item pelo ritmo dele (não pelo ritmo da obra).
    const diasParaFechar = saldo != null && saldo > 0 && mediaDia > 0 ? Math.ceil(saldo / mediaDia) : null;

    const maxHoras = Math.max(...serie.map((x) => x.horas), 1);

    return (
        <>
            {item?.foraDoContrato && (
                <div className="rounded-xl px-4 py-3"
                    style={{ background: '#fdf0ec', border: '1px solid #f2c9bf', color: C.red, fontSize: 12.5 }}>
                    <strong>Fora do contrato.</strong> Estas horas foram apontadas num item que o plano
                    desta obra não prevê — elas inflam o total sem ter meta contra a qual medir.
                </div>
            )}

            <Bloco titulo="Onde este item está">
                <Stat label="Horas contratadas" value={item?.horasContratadas > 0 ? fmtH(item.horasContratadas) : '—'} />
                <Stat label="Horas executadas" value={fmtH(item?.horasExecutadas)} />
                <Stat label="Saldo" value={saldo == null ? '—' : fmtH(saldo)}
                    valueColor={saldo != null && saldo < 0 ? C.red : C.ink}
                    hint={saldo != null && saldo < 0 ? 'estourado' : null} />
                <Stat label="Progresso do item" value={item?.percentual != null ? fmtPct(item.percentual) : '—'}
                    valueColor={estourou ? C.red : C.ink} />
            </Bloco>

            <Bloco titulo="Ritmo deste item"
                nota="A média usa só os dias em que houve lançamento neste item — dia parado não dilui o ritmo, mas aparece como dias sem apontamento.">
                <Stat label="Dias com lançamento" value={serie.length || '—'} />
                <Stat label="Média por dia lançado" value={mediaDia != null ? fmtH(mediaDia) : '—'} />
                <Stat label="Média nos últimos 7 dias lançados" value={mediaUlt7 != null ? fmtH(mediaUlt7) : '—'}
                    valueColor={mediaUlt7 != null && mediaDia != null && mediaUlt7 < mediaDia * 0.7 ? C.red : C.ink}
                    hint={mediaUlt7 != null && mediaDia != null
                        ? (mediaUlt7 >= mediaDia ? 'acelerando' : 'desacelerando') : null} />
                <Stat label="Último apontamento" value={fmtData(ultimoDia)}
                    hint={diasParado != null ? (diasParado === 0 ? 'hoje' : `há ${diasParado} d`) : null}
                    valueColor={diasParado != null && diasParado > 7 ? C.red : C.ink} />
                {diasParaFechar != null && (
                    <Stat label="Dias para fechar no ritmo atual" value={`${diasParaFechar} d`} />
                )}
            </Bloco>

            <Bloco titulo="Evolução dia a dia"
                nota="Barra = horas lançadas no dia. A linha à direita é o acumulado do item sobre o contratado.">
                {serie.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: C.inkSub }}>Nenhum lançamento neste item.</p>
                ) : (
                    <div className="space-y-1.5">
                        {serie.map((x) => (
                            <div key={x.data} className="flex items-center gap-2">
                                <span style={{ fontSize: 11, color: C.inkSub, width: 62, flexShrink: 0 }}>
                                    {fmtData(x.data).slice(0, 5)}
                                </span>
                                <div className="flex-1 h-2.5 rounded-full" style={{ background: C.bg }}>
                                    <div className="h-2.5 rounded-full"
                                        style={{ width: `${Math.max((x.horas / maxHoras) * 100, 2)}%`, background: C.gold }} />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, width: 58, textAlign: 'right' }}>
                                    {fmtH(x.horas)}
                                </span>
                                <span style={{ fontSize: 11, color: C.inkSub, width: 52, textAlign: 'right' }}>
                                    {x.percentualAcumulado != null ? fmtPct(x.percentualAcumulado) : fmtH(x.horasAcumuladas)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
                {serie.length > 0 && (
                    <div className="flex justify-between mt-3 pt-2"
                        style={{ borderTop: `1px solid ${C.border}`, fontSize: 10.5, color: C.inkSub }}>
                        <span>horas no dia</span>
                        <span>{item?.horasContratadas > 0 ? '% acumulado do item' : 'horas acumuladas'}</span>
                    </div>
                )}
            </Bloco>

            <Bloco titulo="Máquinas que apontaram neste item"
                nota="A classificação segue o subgrupo do veículo. Máquina sem subgrupo cai no grupo — é o que joga horas para fora do contrato.">
                {veiculos.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: C.inkSub }}>Nenhuma máquina registrada.</p>
                ) : (
                    <Tabela
                        cols={[{ label: 'Veículo' }, { label: 'Subgrupo' }, { label: 'Período' }, { label: 'Lanç.', right: true }, { label: 'Horas', right: true }]}
                        linhas={veiculos.map((v) => ({
                            celulas: [
                                { v: v.registroInterno || '—', forte: true, sub: v.modelo },
                                { v: v.subgrupo || '(sem subgrupo)', cor: v.subgrupo ? C.inkMid : C.red },
                                { v: `${fmtData(v.primeiroDia).slice(0, 5)}–${fmtData(v.ultimoDia).slice(0, 5)}`, cor: C.inkSub },
                                { v: v.lancamentos, cor: C.inkMid },
                                { v: fmtH(v.horas), forte: true },
                            ],
                        }))}
                    />
                )}
            </Bloco>

            <Bloco titulo="Peso dentro da obra">
                <Stat label="Horas deste item" value={fmtH(item?.horasExecutadas)} />
                <Stat label="Horas da obra" value={fmtH(d.horasLancadas)} />
                <Stat label="Participação"
                    value={d.horasLancadas > 0 ? fmtPct((item.horasExecutadas / d.horasLancadas) * 100, 1) : '—'} />
                {d.custoPorHora != null && (
                    <Stat label="Custo estimado deste item"
                        value={fmtBRL(item.horasExecutadas * d.custoPorHora)}
                        hint={`${fmtH(item.horasExecutadas)} × ${fmtBRL(d.custoPorHora)}`} />
                )}
            </Bloco>
        </>
    );
}

export default FichaObraPage;
