import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, RefreshCw, MapPin, User, ClipboardList } from 'lucide-react';
import apiClient from '../services/apiClient';
import { useData, useEnsureResources } from '../contexts/DataContext';
import { formatObraNome } from '../utils/obraFormat';
import FichaAproveitamento from './FichaAproveitamento';
import FichaFaturamento from './FichaFaturamento';

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
const fmtBRL = (v) =>
    v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
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

function Card({ title, children, right }) {
    return (
        <div className="rounded-xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            {(title || right) && (
                <div className="flex items-center justify-between mb-2">
                    <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.inkSub }}>{title}</h3>
                    {right}
                </div>
            )}
            {children}
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

// ── Componente principal ──────────────────────────────────────────────────────

const FichaObraPage = ({ obraId, onBack, obras = [], vehicles = [], setAlertMessage }) => {
    useEnsureResources(['expenses']);
    const { expenses } = useData();

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
            gastoReal, despesasPorCategoria, margemRS, margemPct, custoPorHora, valorContrato, saldoContrato,
            ritmoPctQuinzena, faltaPara100, conclusaoProjetada, inicio, metaEncerramento, diaAtual, desvioDias,
            quinzenas, comb,
            ritmoHorasDia: f.ritmoHorasPorDia, diasComLancamento: f.diasComLancamento,
        };
    }, [proj, expenses, obraId, obra]);

    const frota = useMemo(() => {
        const linhas = (analytics?.porVeiculo || []).filter(v => v.estado !== 'sucata');
        return {
            linhas,
            alocados: linhas.length,
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
                                    {/* 2 ── Físico & financeiro | Projeção · Despesas | Combustível
                                        Grade por linha (não por coluna): cada par alinha o topo na
                                        mesma régua. items-start evita esticar o card mais curto. */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                                        <FisicoFinanceiro d={d} />
                                        <Projecao d={d} />
                                        <DespesasPorCategoria itens={d.despesasPorCategoria} total={d.gastoReal} />
                                        <Combustivel d={d} />
                                    </div>

                                    {/* 3 ── Frota nesta obra ─────────────────────────────── */}
                                    <FrotaTabela frota={frota} anErro={anErro} loading={loading && !analytics} />

                                    {/* 4 ── Evolução física (quinzenal) ──────────────────── */}
                                    <EvolucaoQuinzenal quinzenas={d.quinzenas} />
                                </>
                            )}
                        </>
                    ) : aba === 'aproveitamento' ? (
                        <FichaAproveitamento
                            obraId={obraId}
                            dataInicio={d?.inicio || proj?.obra?.dataInicio || null}
                            setAlertMessage={setAlertMessage}
                        />
                    ) : (
                        <FichaFaturamento obra={obra} vehicles={vehicles} obraId={obraId} />
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
function FisicoFinanceiro({ d }) {
    return (
        <Card title="Físico & financeiro">
            <div className="mb-3">
                <div className="flex items-baseline justify-between mb-1.5">
                    <span style={{ fontSize: 13, color: C.inkMid }}>
                        {fmtH(d.horasLancadas)} de {d.horasContratadas ? fmtH(d.horasContratadas) : '—'} lançadas
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{fmtPct(d.pctFisico)}</span>
                </div>
                <ProgressBar pct={d.pctFisico} />
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

// ── 2b. Projeção contra a meta de 45 dias ─────────────────────────────────────
function Projecao({ d }) {
    const atrasada = d.desvioDias != null && d.desvioDias > 0;
    return (
        <Card title={`Projeção · meta ${META_DIAS} dias`}>
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

// ── 2c. Combustível vs faturamento ────────────────────────────────────────────
function Combustivel({ d }) {
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
        <Card title="Combustível vs faturamento">
            <Stat label="% atual sobre faturado" value={fmtPct(c.percentualAtual, 1)} />
            <Stat label="Projeção ao final"
                value={fmtPct(c.projecaoFinalPercent, 1)}
                valueColor={acimaLimite ? C.red : C.green} />
            <Stat label="Custo de combustível" value={fmtBRL(c.totalCustoRS)} hint={c.totalLitros ? `${Number(c.totalLitros).toLocaleString('pt-BR')} L` : null} />
            <p style={{ fontSize: 10.5, color: C.inkSub, marginTop: 8 }}>
                Limite interno: {LIMITE_COMBUSTIVEL}% do faturamento.
            </p>
        </Card>
    );
}

// ── 2d. Despesas por categoria ────────────────────────────────────────────────
function DespesasPorCategoria({ itens = [], total = 0 }) {
    if (!itens.length) {
        return (
            <Card title="Despesas por categoria">
                <p style={{ fontSize: 12.5, color: C.inkSub }}>Nenhuma despesa registrada nesta obra.</p>
            </Card>
        );
    }
    const max = itens[0]?.total || 1;
    return (
        <Card title="Despesas por categoria">
            <div className="space-y-2.5">
                {itens.map((c) => {
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
            <div className="flex justify-between mt-3 pt-2" style={{ borderTop: `1px solid ${C.border}`, fontSize: 12.5 }}>
                <span style={{ color: C.inkMid }}>Total de despesas</span>
                <span style={{ fontWeight: 700, color: C.ink }}>{fmtBRL(total)}</span>
            </div>
        </Card>
    );
}

// ── 3. Frota nesta obra ───────────────────────────────────────────────────────
function FrotaTabela({ frota, anErro, loading }) {
    return (
        <Card title="Frota nesta obra"
            right={frota.alocados > 0 ? (
                <span style={{ fontSize: 11.5, color: C.inkSub }}>
                    {frota.alocados} alocado{frota.alocados !== 1 ? 's' : ''}
                    {frota.aproveitamentoMedio != null && ` · aproveitamento médio ${fmtPct(frota.aproveitamentoMedio)}`}
                </span>
            ) : null}
        >
            {loading ? (
                <p style={{ fontSize: 12.5, color: C.inkSub }}>Carregando frota…</p>
            ) : anErro ? (
                <p style={{ fontSize: 12.5, color: C.inkSub }}>{anErro}</p>
            ) : frota.linhas.length === 0 ? (
                <p style={{ fontSize: 12.5, color: C.inkSub }}>Nenhum veículo alocado nesta obra no momento.</p>
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
function EvolucaoQuinzenal({ quinzenas = [] }) {
    if (!quinzenas.length) {
        return (
            <Card title="Evolução física por quinzena">
                <p style={{ fontSize: 12.5, color: C.inkSub }}>Sem lançamentos registrados.</p>
            </Card>
        );
    }
    const maxDelta = Math.max(...quinzenas.map(q => q.deltaPercent || 0), 1);
    return (
        <Card title="Evolução física por quinzena">
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

export default FichaObraPage;
