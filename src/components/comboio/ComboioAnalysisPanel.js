// components/comboio/ComboioAnalysisPanel.js
//
// "Análise Detalhada por Comboio" — equivalente ao painel por veículo da tela
// de Abastecimento. Todos os números vêm agregados do banco
// (GET /comboioTransactions/resumo); nada de baixar a tabela inteira.
//
// Regras de visualização (skill dataviz):
//   - filtros numa linha acima de tudo que eles afetam; período primeiro;
//   - KPIs como stat tiles, não gráfico;
//   - movimentação diária em colunas agrupadas (2 séries, paleta validada:
//     azul #2a78d6 / laranja #eb6834), legenda sempre presente, tooltip por dia,
//     alvo de hover = a faixa inteira do dia, visão em tabela disponível;
//   - rankings em barras horizontais de uma série (sem legenda, título nomeia);
//   - recarregar mantém o quadro anterior com opacidade reduzida.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, AlertTriangle, CheckCircle2, Table2, Loader } from 'lucide-react';
import { COMBOIO_TANKS } from '../../utils/fuelTypes';
import { todayBRT, ymdBRT, formatDateBRT } from '../../utils/dateBRT';

const SERIES = [
    { key: 'entradas', label: 'Entradas', color: '#2a78d6' },
    { key: 'saidas', label: 'Saídas', color: '#eb6834' },
];
const INK = { primary: '#1e1a14', secondary: '#6a5e4e', muted: '#9a8a78', grid: '#f0ebe3', surface: '#ffffff' };

const fmtNum = (n, d = 0) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: d });
const fmtCompact = (n) => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1000) return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return fmtNum(v);
};
const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const PRESETS = [
    { dias: 7, label: '7 dias' },
    { dias: 30, label: '30 dias' },
    { dias: 90, label: '90 dias' },
];

const diasAtras = (n) => ymdBRT(new Date(Date.now() - (n - 1) * 86400000));

// Escala "redonda" para o eixo Y: 0 / 500 / 1.000 …
const niceMax = (max) => {
    if (max <= 0) return 100;
    const pot = Math.pow(10, Math.floor(Math.log10(max)));
    for (const m of [1, 2, 2.5, 5, 10]) {
        if (m * pot >= max) return m * pot;
    }
    return 10 * pot;
};

const StatTile = ({ label, value, detail }) => (
    <div className="rounded-lg p-3" style={{ background: '#faf9f7', border: '1px solid #f0ebe3' }}>
        <div style={{ fontSize: 11, color: INK.secondary }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: INK.primary, lineHeight: 1.2, marginTop: 2 }}>{value}</div>
        {detail && <div style={{ fontSize: 11, color: INK.muted, marginTop: 2 }}>{detail}</div>}
    </div>
);

// Caminho de coluna com topo arredondado (4px) e base reta na linha zero.
const colunaPath = (x, y, w, h) => {
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
};

const DailyChart = ({ serie, startDate, endDate }) => {
    const wrapRef = useRef(null);
    const [width, setWidth] = useState(720);
    const [hover, setHover] = useState(null);

    useEffect(() => {
        const el = wrapRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Um ponto por dia do período, inclusive os sem movimento.
    const dias = useMemo(() => {
        const porDia = new Map(serie.map(s => [s.dia, s]));
        const out = [];
        const fim = new Date(`${endDate}T12:00:00-03:00`);
        for (let d = new Date(`${startDate}T12:00:00-03:00`); d <= fim && out.length < 400; d = new Date(d.getTime() + 86400000)) {
            const key = ymdBRT(d);
            out.push(porDia.get(key) || { dia: key, entradas: 0, saidas: 0, drenagens: 0 });
        }
        return out;
    }, [serie, startDate, endDate]);

    const height = 220;
    const margin = { top: 12, right: 8, bottom: 26, left: 48 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const maxY = niceMax(Math.max(0, ...dias.map(d => Math.max(d.entradas, d.saidas))));
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * maxY);
    const band = dias.length ? plotW / dias.length : plotW;
    const barW = Math.max(1, Math.min(24, (band - 6) / 2 - 1));
    const yOf = (v) => margin.top + plotH - (v / maxY) * plotH;
    const passoRotulo = Math.max(1, Math.ceil(dias.length / Math.max(2, Math.floor(plotW / 70))));

    const hovered = hover != null ? dias[hover] : null;
    const tooltipLeft = hover != null ? Math.min(Math.max(margin.left + hover * band + band / 2 - 80, 0), width - 160) : 0;

    return (
        <div ref={wrapRef} className="relative w-full">
            <svg width={width} height={height} role="img" aria-label="Litros de entrada e saída por dia" style={{ display: 'block' }}>
                {ticks.map((t, i) => (
                    <g key={i}>
                        <line x1={margin.left} x2={width - margin.right} y1={yOf(t)} y2={yOf(t)} stroke={INK.grid} strokeWidth="1" />
                        <text x={margin.left - 6} y={yOf(t) + 3} textAnchor="end" fontSize="10" fill={INK.muted}>{fmtCompact(t)}</text>
                    </g>
                ))}
                {dias.map((d, i) => {
                    const x0 = margin.left + i * band + (band - (barW * 2 + 2)) / 2;
                    return (
                        <g key={d.dia}>
                            {SERIES.map((s, si) => {
                                const v = d[s.key];
                                const h = (v / maxY) * plotH;
                                return (
                                    <path
                                        key={s.key}
                                        d={colunaPath(x0 + si * (barW + 2), yOf(v), barW, h)}
                                        fill={s.color}
                                        opacity={hover != null && hover !== i ? 0.45 : 1}
                                    />
                                );
                            })}
                            {i % passoRotulo === 0 && (
                                <text x={margin.left + i * band + band / 2} y={height - 8} textAnchor="middle" fontSize="10" fill={INK.muted}>
                                    {formatDateBRT(d.dia).slice(0, 5)}
                                </text>
                            )}
                            {/* Alvo de hover/foco: a faixa inteira do dia. */}
                            <rect
                                x={margin.left + i * band}
                                y={margin.top}
                                width={band}
                                height={plotH}
                                fill="transparent"
                                tabIndex={0}
                                aria-label={`${formatDateBRT(d.dia)}: entradas ${fmtNum(d.entradas)} litros, saídas ${fmtNum(d.saidas)} litros`}
                                onMouseEnter={() => setHover(i)}
                                onMouseLeave={() => setHover(null)}
                                onFocus={() => setHover(i)}
                                onBlur={() => setHover(null)}
                                style={{ outline: 'none', cursor: 'default' }}
                            />
                        </g>
                    );
                })}
                <line x1={margin.left} x2={width - margin.right} y1={yOf(0)} y2={yOf(0)} stroke="#d8d3c8" strokeWidth="1" />
            </svg>
            {hovered && (
                <div
                    className="absolute pointer-events-none rounded-lg"
                    style={{ left: tooltipLeft, top: 0, width: 160, background: '#ffffff', border: '1px solid #e8e0d4', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '6px 8px' }}
                >
                    <div style={{ fontSize: 11, color: INK.muted, marginBottom: 2 }}>{formatDateBRT(hovered.dia)}</div>
                    {SERIES.map(s => (
                        <div key={s.key} className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
                            <span className="flex items-center gap-1.5" style={{ color: INK.secondary }}>
                                <span style={{ width: 10, height: 2, background: s.color, display: 'inline-block' }} />{s.label}
                            </span>
                            <strong style={{ color: INK.primary }}>{fmtNum(hovered[s.key])} L</strong>
                        </div>
                    ))}
                    {hovered.drenagens > 0 && (
                        <div className="flex justify-between" style={{ fontSize: 11, color: INK.secondary }}>
                            <span>Drenagem</span><strong style={{ color: INK.primary }}>{fmtNum(hovered.drenagens)} L</strong>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const RankingBars = ({ titulo, itens, rotulo, vazio }) => {
    const max = Math.max(1, ...itens.map(i => i.litros));
    return (
        <div>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: INK.primary, marginBottom: 8 }}>{titulo}</h3>
            {itens.length === 0 ? (
                <p style={{ fontSize: 12, color: INK.muted }} className="italic">{vazio}</p>
            ) : (
                <ul className="space-y-2">
                    {itens.map((it, idx) => (
                        <li key={idx} title={`${rotulo(it)}: ${fmtNum(it.litros)} L em ${it.qtd} saída(s)`}>
                            <div className="flex justify-between gap-2" style={{ fontSize: 11 }}>
                                <span className="truncate" style={{ color: INK.secondary }}>{rotulo(it)}</span>
                                <span style={{ color: INK.primary, fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                    {fmtNum(it.litros)} L <span style={{ color: INK.muted, fontWeight: 400 }}>· {it.qtd}</span>
                                </span>
                            </div>
                            <div className="mt-1" style={{ height: 6 }}>
                                <div style={{ width: `${(it.litros / max) * 100}%`, height: '100%', background: '#2a78d6', borderRadius: '0 4px 4px 0', minWidth: 2 }} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

const ComboioAnalysisPanel = ({ apiClient, comboioVehicleId, refreshKey = 0 }) => {
    const [presetDias, setPresetDias] = useState(30);
    const [periodo, setPeriodo] = useState(() => ({ startDate: diasAtras(30), endDate: todayBRT() }));
    const [resumo, setResumo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState(null);
    const [verTabela, setVerTabela] = useState(false);

    const aplicarPreset = (dias) => {
        setPresetDias(dias);
        setPeriodo({ startDate: diasAtras(dias), endDate: todayBRT() });
    };

    useEffect(() => {
        if (!comboioVehicleId) { setResumo(null); return undefined; }
        let cancelado = false;
        setLoading(true);
        setErro(null);
        apiClient.getComboioResumo({ comboioVehicleId, ...periodo })
            .then(r => { if (!cancelado) setResumo(r); })
            .catch(e => { if (!cancelado) setErro(e.message || 'Falha ao carregar o resumo.'); })
            .finally(() => { if (!cancelado) setLoading(false); });
        return () => { cancelado = true; };
    }, [apiClient, comboioVehicleId, periodo, refreshKey]);

    if (!comboioVehicleId) {
        return <p style={{ fontSize: 13, color: INK.muted }} className="italic">Selecione um comboio para ver a análise.</p>;
    }

    const t = resumo?.totais || {};
    const conferencia = COMBOIO_TANKS.map(tank => {
        const fisico = Number(resumo?.comboio?.fuelLevels?.[tank.key]) || 0;
        const teorico = Number(resumo?.saldoTeorico?.[tank.key]) || 0;
        return { ...tank, fisico, teorico, diff: fisico - teorico };
    });

    return (
        <div className="space-y-5">
            {/* Filtros — uma linha, período primeiro */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid #e8e0d4' }} role="group" aria-label="Período">
                    {PRESETS.map(p => (
                        <button
                            key={p.dias}
                            type="button"
                            onClick={() => aplicarPreset(p.dias)}
                            aria-pressed={presetDias === p.dias}
                            className="px-3 py-1.5"
                            style={{
                                fontSize: 12, fontWeight: 600,
                                background: presetDias === p.dias ? '#9E7A42' : '#ffffff',
                                color: presetDias === p.dias ? '#ffffff' : INK.secondary,
                            }}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                <input type="date" value={periodo.startDate} max={periodo.endDate}
                    onChange={(e) => { setPresetDias(null); setPeriodo(p => ({ ...p, startDate: e.target.value })); }}
                    aria-label="Data inicial" style={{ fontSize: 12 }} />
                <span style={{ fontSize: 12, color: INK.muted }}>até</span>
                <input type="date" value={periodo.endDate} min={periodo.startDate}
                    onChange={(e) => { setPresetDias(null); setPeriodo(p => ({ ...p, endDate: e.target.value })); }}
                    aria-label="Data final" style={{ fontSize: 12 }} />
                {loading && <Loader size={14} className="animate-spin" style={{ color: INK.muted }} />}
            </div>

            {erro && <p className="mak-error">{erro}</p>}

            {resumo && (
                <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.2s' }} className="space-y-5">
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                        <StatTile label="Entradas" value={`${fmtCompact(t.entradaLitros)} L`} detail={`${t.entradaQtd} baixa(s) · ${fmtBRL(t.entradaValor)}`} />
                        <StatTile label="Saídas" value={`${fmtCompact(t.saidaLitros)} L`} detail={`${t.saidaQtd} abastecimento(s) · ${fmtBRL(t.saidaValor)}`} />
                        <StatTile label="Drenagens" value={`${fmtCompact(t.drenagemLitros)} L`} detail={`${t.drenagemQtd} registro(s)`} />
                        <StatTile label="Veículos atendidos" value={fmtNum(t.veiculosAtendidos)} detail={`${fmtNum(t.obrasAtendidas)} obra(s)`} />
                        <StatTile
                            label="Pendências"
                            value={fmtNum((t.bloqueadas || 0) + (resumo.entradasAbertas || 0))}
                            detail={`${resumo.entradasAbertas || 0} ordem(ns) sem baixa · ${t.bloqueadas || 0} bloqueada(s)`}
                        />
                    </div>

                    <div>
                        <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                            <h3 className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 700, color: INK.primary }}>
                                <BarChart3 size={14} style={{ color: '#2d5a8a' }} /> Movimentação diária (litros)
                            </h3>
                            <div className="flex items-center gap-3">
                                {SERIES.map(s => (
                                    <span key={s.key} className="flex items-center gap-1.5" style={{ fontSize: 11, color: INK.secondary }}>
                                        <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2, display: 'inline-block' }} />{s.label}
                                    </span>
                                ))}
                                <button type="button" onClick={() => setVerTabela(v => !v)} className="flex items-center gap-1"
                                    style={{ fontSize: 11, color: '#9E7A42', fontWeight: 600 }} aria-pressed={verTabela}>
                                    <Table2 size={12} /> {verTabela ? 'Ver gráfico' : 'Ver tabela'}
                                </button>
                            </div>
                        </div>
                        {verTabela ? (
                            <div className="overflow-x-auto max-h-64 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0" style={{ background: '#faf9f7' }}>
                                        <tr>
                                            {['Dia', 'Entradas (L)', 'Saídas (L)', 'Drenagens (L)'].map(h => (
                                                <th key={h} className="p-2 text-left" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: INK.muted }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {resumo.serie.length === 0 && (
                                            <tr><td colSpan="4" className="p-3 text-center italic" style={{ color: INK.muted }}>Sem movimentação no período.</td></tr>
                                        )}
                                        {resumo.serie.map(s => (
                                            <tr key={s.dia}>
                                                <td className="p-2">{formatDateBRT(s.dia)}</td>
                                                <td className="p-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(s.entradas, 1)}</td>
                                                <td className="p-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(s.saidas, 1)}</td>
                                                <td className="p-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(s.drenagens, 1)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <DailyChart serie={resumo.serie} startDate={resumo.periodo.startDate} endDate={resumo.periodo.endDate} />
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <RankingBars
                            titulo="Obras atendidas"
                            itens={resumo.porObra}
                            rotulo={(o) => o.obraName || 'Sem obra'}
                            vazio="Nenhuma saída no período."
                        />
                        <RankingBars
                            titulo="Veículos que mais receberam"
                            itens={resumo.porVeiculo}
                            rotulo={(v) => [v.registroInterno, v.modelo].filter(Boolean).join(' — ') || 'Veículo'}
                            vazio="Nenhuma saída no período."
                        />
                    </div>

                    <div>
                        <h3 style={{ fontSize: 12, fontWeight: 700, color: INK.primary, marginBottom: 6 }}>Conferência de estoque</h3>
                        <p style={{ fontSize: 11, color: INK.muted, marginBottom: 8 }}>
                            Nível do tanque comparado ao saldo calculado pelas movimentações (entradas + drenagens − saídas, todo o histórico).
                            Diferença indica lançamento faltando ou nível alterado à mão no cadastro do veículo.
                        </p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead style={{ background: '#faf9f7' }}>
                                    <tr>
                                        {['Tanque', 'Nível no cadastro', 'Saldo calculado', 'Diferença', ''].map((h, i) => (
                                            <th key={i} className="p-2 text-left" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: INK.muted }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {conferencia.map(c => {
                                        const divergente = Math.abs(c.diff) > 5;
                                        return (
                                            <tr key={c.key}>
                                                <td className="p-2 font-semibold">{c.label}</td>
                                                <td className="p-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(c.fisico, 1)} L</td>
                                                <td className="p-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(c.teorico, 1)} L</td>
                                                <td className="p-2" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: divergente ? 700 : 400 }}>
                                                    {c.diff > 0 ? '+' : ''}{fmtNum(c.diff, 1)} L
                                                </td>
                                                <td className="p-2">
                                                    {divergente ? (
                                                        <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: INK.secondary }}>
                                                            <AlertTriangle size={12} style={{ color: '#ec835a' }} /> Divergente
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: INK.secondary }}>
                                                            <CheckCircle2 size={12} style={{ color: '#0ca30c' }} /> Confere
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ComboioAnalysisPanel;
