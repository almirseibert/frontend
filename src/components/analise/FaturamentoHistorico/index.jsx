import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Activity, Info, Layers, MapPin, Calculator, Scale, AlertTriangle,
    SlidersHorizontal, FileDown, FileText,
} from 'lucide-react';
import apiClient from '../../../services/apiClient';
import {
    C, fmtBRL, fmtBRLCompact, fmtPct, fmtH, fmtReal2, fmtDateBR, margemColor,
} from '../shared/tokens';
import { KpiCard, DeltaBadge, HBar, StateBlock, Card } from '../shared/ui';
import { downloadCSV, downloadPDF } from '../shared/exportUtils';
import ContractOverviewCard from './ContractOverviewCard';

// ─── Helpers locais (datas/parse) ────────────────────────────────────────────
const toISO = (d) => d.toISOString().slice(0, 10);
const today = () => toISO(new Date());
const currentYm = () => today().slice(0, 7);
const parseNum = (s) => {
    const n = Number(String(s).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
};

// ─── HERO: Receita produzida × Custo, mês a mês (barras agrupadas) ───────────
const RCChart = ({ series, partialYm }) => {
    if (!series.length) return null;
    const W = 1400, H = 300, padL = 56, padB = 28, padT = 10;
    const plotW = W - padL - 10, plotH = H - padB - padT;
    const rawMax = Math.max(1, ...series.map(s => Math.max(s.receita_produzida, s.custo)));
    const step = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const yMax = Math.ceil(rawMax / step) * step;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => yMax * f);
    const Y = (v) => padT + plotH - (v / yMax) * plotH;
    const gw = plotW / series.length;
    const bw = Math.min(34, gw * 0.30);

    return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%"
            style={{ height: 'auto', display: 'block' }} role="img"
            aria-label="Barras de receita produzida e custo por mês">
            {ticks.map((t, i) => (
                <g key={i}>
                    <line x1={padL} y1={Y(t)} x2={W - 6} y2={Y(t)} stroke={i === 0 ? '#c3c2b7' : C.goldLt} />
                    <text x={padL - 6} y={Y(t) + 3} textAnchor="end" fontSize="10" fill={C.textSub}>{fmtBRLCompact(t)}</text>
                </g>
            ))}
            {series.map((s, i) => {
                const cx = padL + gw * i + gw / 2;
                const pc = s.ym === partialYm;
                return (
                    <g key={s.ym}>
                        <rect x={cx - bw - 1} y={Y(s.receita_produzida)} width={bw} height={padT + plotH - Y(s.receita_produzida)}
                            rx="2" fill={C.receita} opacity={pc ? 0.45 : 1}>
                            <title>{`${s.label}${pc ? ' (parcial)' : ''} · Receita ${fmtBRL(s.receita_produzida)}`}</title>
                        </rect>
                        <rect x={cx + 1} y={Y(s.custo)} width={bw} height={padT + plotH - Y(s.custo)}
                            rx="2" fill={C.custo} opacity={pc ? 0.45 : 1}>
                            <title>{`${s.label}${pc ? ' (parcial)' : ''} · Custo ${fmtBRL(s.custo)}`}</title>
                        </rect>
                        <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill={pc ? C.gold : C.textSub}>
                            {s.label}{pc ? ' *' : ''}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

// ─── Custo por R$ produzido, mês a mês (linha + média) ───────────────────────
const RatioChart = ({ points }) => {
    if (points.length < 2) return (
        <div style={{ fontSize: 12, color: C.textSub, padding: '24px 0' }}>
            Precisa de ao menos 2 meses com receita para traçar a evolução.
        </div>
    );
    const W = 380, H = 150, padL = 40, padB = 22, padT = 8;
    const plotW = W - padL - 8, plotH = H - padB - padT;
    const vals = points.map(p => p.val);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const yMin = Math.max(0, Math.floor((lo - 5) / 10) * 10);
    const yMax = Math.ceil((hi + 5) / 10) * 10;
    const range = (yMax - yMin) || 1;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const X = (i) => padL + (plotW / (points.length - 1)) * i;
    const Y = (v) => padT + plotH - ((v - yMin) / range) * plotH;
    const ticks = [yMin, (yMin + yMax) / 2, yMax];

    return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
            aria-label="Linha de custo por real produzido ao longo dos meses">
            {ticks.map((t, i) => (
                <g key={i}>
                    <line x1={padL} y1={Y(t)} x2={W - 8} y2={Y(t)} stroke={C.goldLt} />
                    <text x={padL - 5} y={Y(t) + 3} textAnchor="end" fontSize="10" fill={C.textSub}>{t.toFixed(0)}%</text>
                </g>
            ))}
            <line x1={padL} y1={Y(avg)} x2={W - 8} y2={Y(avg)} stroke="#cbb99a" strokeDasharray="4 3" />
            <polyline points={points.map((p, i) => `${X(i)},${Y(p.val)}`).join(' ')}
                fill="none" stroke={C.text} strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {points.map((p, i) => {
                const spike = p.val > avg * 1.12;
                return (
                    <g key={p.ym}>
                        <circle cx={X(i)} cy={Y(p.val)} r={spike ? 4 : 3} fill={spike ? C.red : C.text}>
                            <title>{`${p.label} · ${fmtReal2(p.val / 100)} de custo por R$ produzido`}</title>
                        </circle>
                        {i % 2 === 0 && <text x={X(i)} y={H - 7} textAnchor="middle" fontSize="9" fill={C.textSub}>{p.label}</text>}
                    </g>
                );
            })}
        </svg>
    );
};

// ─── Componente principal ────────────────────────────────────────────────────
// Estado de período/obra vem do shell (props). Só busca quando `active`.
const FaturamentoHistorico = ({ obras = [], active = true, range, obraId = 'all', refreshKey = 0 }) => {
    const startDate = range?.start;
    const endDate = range?.end;

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Lente de custo: 'lancado' (real, incompleto) × 'simulado' (custo fixo informado)
    const [costMode, setCostMode] = useState('lancado');
    const [simOp, setSimOp] = useState(0);
    const [simAdmin, setSimAdmin] = useState(0);
    const simTouched = useRef(false);
    const lastKey = useRef(null);

    const fetchData = useCallback(async () => {
        if (!startDate || !endDate) return;
        setLoading(true);
        setError(null);
        try {
            const res = await apiClient.getFinancialHistory({ startDate, endDate, obraId });
            setData(res);
        } catch (e) {
            setError(e.message || 'Erro ao carregar histórico financeiro.');
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, obraId]);

    // Só busca quando a aba está ativa e a chave mudou (evita refetch ao trocar de aba).
    useEffect(() => {
        if (!active) return;
        const key = `${startDate}|${endDate}|${obraId}|${refreshKey}`;
        if (key === lastKey.current) return;
        lastKey.current = key;
        fetchData();
    }, [active, startDate, endDate, obraId, refreshKey, fetchData]);

    const nMeses = data?.series?.length || 0;
    const custoLancadoMes = nMeses ? (data.totais.custo / nMeses) : 0;

    // Semente da simulação: chuta o custo lançado/mês só pra sair de zero.
    useEffect(() => {
        if (!data || simTouched.current) return;
        setSimOp(Math.round(custoLancadoMes));
        setSimAdmin(0);
    }, [data, custoLancadoMes]);

    const custoSimMes = simOp + simAdmin;

    const view = useMemo(() => {
        if (!data) return null;
        const base = data.series;
        if (costMode !== 'simulado') {
            return { series: base, totais: data.totais };
        }
        const series = base.map(s => {
            const margem = s.receita_produzida - custoSimMes;
            return {
                ...s,
                custo: custoSimMes,
                margem,
                margem_pct: s.receita_produzida > 0 ? Math.round((margem / s.receita_produzida) * 1000) / 10 : null,
            };
        });
        const receita = data.totais.receita_produzida;
        const custo = custoSimMes * base.length;
        const margem = receita - custo;
        return {
            series,
            totais: {
                receita_produzida: receita, custo, margem,
                margem_pct: receita > 0 ? Math.round((margem / receita) * 1000) / 10 : null,
                horas: data.totais.horas,
            },
        };
    }, [data, costMode, custoSimMes]);

    const t = view?.totais;
    const hasCmp = costMode === 'lancado'
        && !!(data?.comparativo?.anterior && data.comparativo.anterior.receita_produzida > 0);
    const cmp = hasCmp ? data.comparativo.delta : null;
    const ant = hasCmp ? data.comparativo.anterior : null;
    const obraNome = useMemo(
        () => (obraId === 'all' ? 'Todas as obras' : (obras.find(o => String(o.id) === String(obraId))?.nome || 'Obra')),
        [obraId, obras]
    );

    const receitaMes = nMeses ? (data.totais.receita_produzida / nMeses) : 0;
    const receitaPorHora = data?.totais.horas > 0 ? data.totais.receita_produzida / data.totais.horas : null;
    const partialYm = (data && endDate >= currentYm() + '-01') ? currentYm() : null;

    const custoPorReal = t && t.receita_produzida > 0 ? t.custo / t.receita_produzida : null;
    const custoPorRealAnt = ant && ant.receita_produzida > 0 ? ant.custo / ant.receita_produzida : null;
    const ratioPoints = useMemo(() => {
        if (!view) return [];
        return view.series
            .filter(s => s.ym !== partialYm && s.receita_produzida > 0)
            .map(s => ({ ym: s.ym, label: s.label, val: (s.custo / s.receita_produzida) * 100 }));
    }, [view, partialYm]);

    const folgaMes = receitaMes - custoSimMes;
    const gapMes = custoSimMes - custoLancadoMes;
    const gapPct = custoSimMes > 0 ? (gapMes / custoSimMes) * 100 : 0;
    const mesesVermelho = view ? view.series.filter(s => s.margem < 0).length : 0;
    const setSim = (setter) => (e) => { simTouched.current = true; setter(parseNum(e.target.value)); };

    // ─── Export (paridade com a aba física) ──────────────────────────────────
    const exportRows = () => {
        const rows = [
            ['Desempenho do negócio — Visão financeira'],
            ['Escopo', obraNome],
            ['Período', `${fmtDateBR(startDate)} a ${fmtDateBR(endDate)}`],
            ['Lente de custo', costMode === 'simulado' ? 'Simulação' : 'Lançado'],
            [],
            ['Mês', 'Receita produzida', 'Custo', 'Margem R$', 'Margem %', 'Horas'],
            ...view.series.map(s => [
                s.label, s.receita_produzida, s.custo, s.margem,
                s.margem_pct == null ? '' : s.margem_pct, s.horas,
            ]),
            ['Total', t.receita_produzida, t.custo, t.margem, t.margem_pct ?? '', t.horas],
        ];
        return rows;
    };
    const handleCSV = () => downloadCSV(`faturamento_${startDate}_${endDate}.csv`, exportRows());
    const handlePDF = () => downloadPDF({
        filename: `faturamento_${startDate}_${endDate}.pdf`,
        title: 'MAK Frotas — Desempenho do negócio (financeiro)',
        subtitle: `${obraNome}  •  ${fmtDateBR(startDate)} a ${fmtDateBR(endDate)}  •  ${costMode === 'simulado' ? 'Simulação' : 'Lançado'}`,
        tables: [{
            head: ['Mês', 'Receita', 'Custo', 'Margem R$', 'Margem %', 'Horas'],
            body: [
                ...view.series.map(s => [
                    s.label, fmtBRL(s.receita_produzida), fmtBRL(s.custo),
                    fmtBRL(s.margem), fmtPct(s.margem_pct), fmtH(s.horas),
                ]),
                ['Total', fmtBRL(t.receita_produzida), fmtBRL(t.custo), fmtBRL(t.margem), fmtPct(t.margem_pct), fmtH(t.horas)],
            ],
        }],
    });

    const hasData = t && data.series.some(s => s.receita_produzida || s.custo);

    return (
        <div className="p-6 pt-2">
            {/* Sub-cabeçalho: escopo + export (filtro vem do shell) */}
            <div className="flex items-center justify-between gap-3 mb-4">
                <p style={{ fontSize: 12, color: C.textSub }}>Visão histórica · {obraNome}</p>
                <div className="flex gap-2">
                    <button onClick={handleCSV} disabled={!hasData}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border hover:bg-slate-50 disabled:opacity-50"
                        style={{ borderColor: C.border, color: C.textMid }} title="Exportar CSV">
                        <FileDown size={14} /> CSV
                    </button>
                    <button onClick={handlePDF} disabled={!hasData}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        style={{ background: C.text }} title="Exportar PDF">
                        <FileText size={14} /> PDF
                    </button>
                </div>
            </div>

            {loading || error ? (
                <StateBlock
                    loading={loading}
                    error={error}
                    onRetry={fetchData}
                    loadingText="Calculando série histórica…"
                />
            ) : (
                <>
                    {!hasData && (
                        <>
                            <StateBlock
                                empty
                                emptyText="Sem lançamentos de receita ou custo no período selecionado."
                                emptyIcon={Activity}
                            />
                            {/* Visão contratual é global — não depende de horas lançadas no
                                período, então continua útil mesmo quando a série acima está vazia. */}
                            <ContractOverviewCard active={active} />
                        </>
                    )}

                    {hasData && (
                    <>
                    {/* ── Faixa única de KPIs (custo e margem refletem a lente) — indicadores
                        primários da aba, sempre no topo. ─────────────────────────────── */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                        <KpiCard label="Receita produzida" dot={C.receita} value={fmtBRLCompact(t.receita_produzida)}
                            delta={cmp ? { value: cmp.receita_pct, good: true } : null}
                            sub={`~${fmtBRLCompact(receitaMes)}/mês`} />
                        <KpiCard label={costMode === 'simulado' ? 'Custo simulado' : 'Custo lançado'} dot={C.custo} value={fmtBRLCompact(t.custo)}
                            delta={cmp ? { value: cmp.custo_pct, good: false } : null}
                            sub={costMode === 'simulado' ? `${fmtBRLCompact(custoSimMes)}/mês` : `${nMeses} meses`} />
                        <KpiCard label="Margem" value={fmtPct(t.margem_pct)} valueColor={margemColor(t.margem_pct)}
                            delta={cmp ? { value: cmp.margem_pct_pp, good: true, suffix: ' pp' } : null}
                            sub={fmtBRLCompact(t.margem)} />
                        <KpiCard label="Receita / hora" value={receitaPorHora == null ? '—' : `${fmtBRL(receitaPorHora)}/h`}
                            sub={`${fmtH(data.totais.horas)} apontadas`} />
                    </div>

                    {/* ── Lente de custo: Lançado × Simulação ─────────────────────── */}
                    <Card className="p-5 mb-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSub }}>
                                Custo &amp; margem · escolha a lente
                            </span>
                            <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: C.goldLt }}>
                                <button onClick={() => setCostMode('lancado')} className="text-xs font-bold px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
                                    style={costMode === 'lancado' ? { background: C.gold, color: '#fff' } : { color: C.textMid }}>
                                    <Layers size={13} /> Custo lançado
                                </button>
                                <button onClick={() => setCostMode('simulado')} className="text-xs font-bold px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
                                    style={costMode === 'simulado' ? { background: C.gold, color: '#fff' } : { color: C.textMid }}>
                                    <SlidersHorizontal size={13} /> Simulação
                                </button>
                            </div>
                        </div>

                        {costMode === 'lancado' && (
                            <p className="flex items-center gap-1.5 mt-2.5" style={{ color: '#9a3412', fontSize: 11.5 }}>
                                <AlertTriangle size={13} className="shrink-0" />
                                <span>Margem <b>otimista</b>: custo operacional/administrativo chega incompleto. Use a <b>Simulação</b> para o número real.</span>
                            </p>
                        )}

                        {costMode === 'simulado' && (
                            <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    <div className="lg:col-span-1">
                                        <div className="flex items-center gap-1.5 mb-2" style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                                            <Calculator size={14} style={{ color: C.gold }} /> Custo mensal real (você informa)
                                        </div>
                                        <label className="block mb-2">
                                            <span style={{ fontSize: 11, color: C.textSub }}>Operacional · R$/mês</span>
                                            <input inputMode="numeric" value={simOp} onChange={setSim(setSimOp)}
                                                className="w-full border rounded-md px-3 py-2 mt-0.5 outline-none" style={{ borderColor: C.border, fontSize: 14, fontWeight: 700, color: C.text }} />
                                        </label>
                                        <label className="block mb-2">
                                            <span style={{ fontSize: 11, color: C.textSub }}>Administrativo · R$/mês</span>
                                            <input inputMode="numeric" value={simAdmin} onChange={setSim(setSimAdmin)}
                                                className="w-full border rounded-md px-3 py-2 mt-0.5 outline-none" style={{ borderColor: C.border, fontSize: 14, fontWeight: 700, color: C.text }} />
                                        </label>
                                        <div className="flex items-center justify-between px-1" style={{ fontSize: 12 }}>
                                            <span style={{ color: C.textSub }}>Total simulado</span>
                                            <span style={{ color: C.text, fontWeight: 800 }}>{fmtBRL(custoSimMes)}/mês</span>
                                        </div>
                                        <p style={{ fontSize: 10.5, color: C.textSub, marginTop: 8 }}>
                                            Simulação local e temporária — não grava nada. Custo fixo aplicado a todos os {nMeses} meses.
                                        </p>
                                    </div>

                                    <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                                            <div className="flex items-center gap-1.5 mb-1" style={{ fontSize: 11, fontWeight: 700, color: C.textMid }}>
                                                <Scale size={13} style={{ color: C.gold }} /> Ponto de equilíbrio
                                            </div>
                                            <div style={{ fontSize: 13, color: C.text }}>
                                                Com <b>{fmtBRLCompact(receitaMes)}/mês</b> de receita, você empata custando até <b>{fmtBRLCompact(receitaMes)}/mês</b>.
                                            </div>
                                            <div style={{ fontSize: 13, marginTop: 6, fontWeight: 700, color: folgaMes >= 0 ? C.green : C.red }}>
                                                {folgaMes >= 0
                                                    ? `Folga de ${fmtBRLCompact(folgaMes)}/mês`
                                                    : `Estouro de ${fmtBRLCompact(Math.abs(folgaMes))}/mês`}
                                                <span style={{ color: C.textSub, fontWeight: 500 }}> · margem {fmtPct(t.margem_pct)}</span>
                                            </div>
                                        </div>

                                        <div className="rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                                            <div className="flex items-center gap-1.5 mb-1" style={{ fontSize: 11, fontWeight: 700, color: C.textMid }}>
                                                <AlertTriangle size={13} style={{ color: C.gold }} /> Buraco de lançamento
                                            </div>
                                            <div style={{ fontSize: 13, color: C.text }}>
                                                Sistema tem <b>{fmtBRLCompact(custoLancadoMes)}/mês</b> lançado. Você diz <b>{fmtBRLCompact(custoSimMes)}/mês</b>.
                                            </div>
                                            <div style={{ fontSize: 13, marginTop: 6, fontWeight: 700, color: gapMes > 0 ? C.red : C.textMid }}>
                                                {gapMes > 0
                                                    ? `${fmtBRLCompact(gapMes)}/mês (${gapPct.toFixed(0)}%) não estão sendo lançados`
                                                    : 'Lançamento cobre o custo informado'}
                                            </div>
                                        </div>

                                        <div className="rounded-lg p-3 sm:col-span-2" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                                            <div style={{ fontSize: 13, color: C.text }}>
                                                Com esse custo, <b style={{ color: mesesVermelho ? C.red : C.green }}>{mesesVermelho} de {nMeses} meses</b> fecham no vermelho
                                                <span style={{ color: C.textSub }}> — veja quais no gráfico e na tabela abaixo.</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* ── HERO: Receita produzida × Custo, mês a mês ──────────────── */}
                    <Card className="p-5 mb-5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Receita produzida × custo, mês a mês</h3>
                            <div className="flex items-center gap-3.5" style={{ fontSize: 12, color: C.textMid }}>
                                <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 2, background: C.receita }} /> Receita</span>
                                <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 2, background: C.custo }} /> Custo</span>
                            </div>
                        </div>
                        <p style={{ fontSize: 11, color: C.textSub, marginBottom: 8 }}>
                            O gasto acompanha a produção? {partialYm && 'O mês em andamento aparece esmaecido (parcial).'}
                        </p>
                        <RCChart series={view.series} partialYm={partialYm} />
                    </Card>

                    {/* ── Mais produção = mais gasto? ─────────────────────────────── */}
                    <Card className="p-5 mb-5">
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Mais produção = mais gasto?</h3>
                        <p style={{ fontSize: 11, color: C.textSub, marginBottom: 10 }}>
                            {costMode === 'simulado'
                                ? 'Com custo simulado fixo, a curva reflete só a variação da receita — não a eficiência real do gasto.'
                                : 'Custo por R$ produzido. Linha plana = gasto escala proporcional. Subindo = perdendo eficiência.'}
                        </p>
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-5 items-center">
                            <RatioChart points={ratioPoints} />
                            <div>
                                <div style={{ fontSize: 11, color: C.textSub }}>No período, a cada R$ 1 produzido</div>
                                <div style={{ fontSize: 34, fontWeight: 800, color: C.text, lineHeight: 1.1 }}>{fmtReal2(custoPorReal)}</div>
                                <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>
                                    de custo{custoPorRealAnt != null && (
                                        <> · ant. {fmtReal2(custoPorRealAnt)} <DeltaBadge value={-(custoPorReal - custoPorRealAnt) / custoPorRealAnt * 100} good suffix="%" /></>
                                    )}
                                </div>
                                {costMode === 'lancado' && (
                                    <div className="mt-3 p-2.5 rounded-lg flex items-start gap-2" style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: 11.5 }}>
                                        <Info size={13} className="mt-0.5 shrink-0" />
                                        <span>Sobre o custo lançado — subestima. Na Simulação a curva reflete o custo real que você informar.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>

                    {/* ── Composição: categoria + região (só no custo lançado) ────── */}
                    {costMode === 'lancado' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                            <Card className="p-5">
                                <h3 className="flex items-center gap-2 mb-1" style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                                    <Layers size={16} style={{ color: C.gold }} /> Custo por categoria
                                </h3>
                                <p style={{ fontSize: 11, color: C.textSub, marginBottom: 14 }}>
                                    Só o que passou pelo Frotas · {fmtBRL(data.totais.custo)} no período.
                                </p>
                                {!(data.custoPorCategoria || []).length ? (
                                    <p style={{ fontSize: 12, color: C.textSub }}>Sem despesas categorizadas no período.</p>
                                ) : (
                                    data.custoPorCategoria.map(c => (
                                        <HBar key={c.categoria} nome={c.categoria} valor={fmtBRLCompact(c.total)} sub={fmtPct(c.pct)} pct={c.pct} color={C.custo} />
                                    ))
                                )}
                            </Card>

                            <Card className="p-5">
                                <h3 className="flex items-center gap-2 mb-1" style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                                    <MapPin size={16} style={{ color: C.gold }} /> Por região
                                </h3>
                                <p style={{ fontSize: 11, color: C.textSub, marginBottom: 14 }}>
                                    Receita, custo e margem por região.
                                </p>
                                {!(data.porRegiao || []).length ? (
                                    <p style={{ fontSize: 12, color: C.textSub }}>Sem dados de região no período.</p>
                                ) : (
                                    data.porRegiao.map(r => (
                                        <HBar key={r.regiao} nome={r.regiao}
                                            valor={fmtBRLCompact(r.receita_produzida)}
                                            sub={`margem ${fmtPct(r.margem_pct)}`}
                                            pct={data.totais.receita_produzida > 0 ? (r.receita_produzida / data.totais.receita_produzida) * 100 : 0}
                                            color={C.receita} valColor={C.text} />
                                    ))
                                )}
                            </Card>
                        </div>
                    )}

                    {/* ── Tabela mensal (reflete a lente) ─────────────────────────── */}
                    <Card className="overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr style={{ background: C.goldLt, color: C.textMid }}>
                                        <th className="text-left px-4 py-2.5 font-bold">Mês</th>
                                        <th className="text-right px-4 py-2.5 font-bold">Receita produzida</th>
                                        <th className="text-right px-4 py-2.5 font-bold">{costMode === 'simulado' ? 'Custo simulado' : 'Custo'}</th>
                                        <th className="text-right px-4 py-2.5 font-bold">Margem R$</th>
                                        <th className="text-right px-4 py-2.5 font-bold">Margem %</th>
                                        <th className="text-right px-4 py-2.5 font-bold">Horas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {view.series.map((s, i) => (
                                        <tr key={s.ym} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 ? '#fff' : C.surface }}>
                                            <td className="px-4 py-2 font-semibold" style={{ color: C.text }}>
                                                {s.label}{s.ym === partialYm && <span style={{ color: C.gold, fontWeight: 700 }}> · parcial</span>}
                                            </td>
                                            <td className="px-4 py-2 text-right" style={{ color: C.textMid }}>{fmtBRL(s.receita_produzida)}</td>
                                            <td className="px-4 py-2 text-right" style={{ color: C.textMid }}>{fmtBRL(s.custo)}</td>
                                            <td className="px-4 py-2 text-right font-semibold" style={{ color: margemColor(s.margem_pct) }}>{fmtBRL(s.margem)}</td>
                                            <td className="px-4 py-2 text-right font-bold" style={{ color: margemColor(s.margem_pct) }}>{fmtPct(s.margem_pct)}</td>
                                            <td className="px-4 py-2 text-right" style={{ color: C.textSub }}>{fmtH(s.horas)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: `2px solid ${C.gold}`, background: C.goldLt }}>
                                        <td className="px-4 py-2.5 font-extrabold" style={{ color: C.text }}>Total</td>
                                        <td className="px-4 py-2.5 text-right font-extrabold" style={{ color: C.text }}>{fmtBRL(t.receita_produzida)}</td>
                                        <td className="px-4 py-2.5 text-right font-extrabold" style={{ color: C.text }}>{fmtBRL(t.custo)}</td>
                                        <td className="px-4 py-2.5 text-right font-extrabold" style={{ color: margemColor(t.margem_pct) }}>{fmtBRL(t.margem)}</td>
                                        <td className="px-4 py-2.5 text-right font-extrabold" style={{ color: margemColor(t.margem_pct) }}>{fmtPct(t.margem_pct)}</td>
                                        <td className="px-4 py-2.5 text-right font-extrabold" style={{ color: C.textMid }}>{fmtH(t.horas)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </Card>

                    {/* ── Visão contratual: bloco à parte, depois do histórico por horas.
                        Pergunta diferente (contrato, não produção) — mas nunca antes do
                        conteúdo principal da aba. ─────────────────────────────────────── */}
                    <ContractOverviewCard active={active} />

                    {/* Nota metodológica */}
                    <div className="flex items-start gap-2 mt-4 p-3 rounded-lg" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.textSub, fontSize: 11 }}>
                        <Info size={14} className="mt-0.5 shrink-0" style={{ color: C.gold }} />
                        <span>
                            <b>Receita produzida</b> é estimada (horas ÷ horas contratadas × valor do contrato), capada em 100% — confiável, mas não é faturamento emitido.
                            <b> Custo lançado</b> usa a data de lançamento da despesa e vem incompleto (parte fica em sistemas paralelos).
                            <b> Simulação</b> substitui o custo por um valor fixo mensal que você informa — cálculo local, não grava.
                            O <b>mês em andamento</b> aparece parcial: ainda vai mudar até fechar. Obras ocultas e centros de custo ficam de fora.
                        </span>
                    </div>
                    </>
                    )}
                </>
            )}
        </div>
    );
};

export default FaturamentoHistorico;
