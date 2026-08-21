import React, { useEffect, useState, useRef } from 'react';
import {
    BarChart2, Clock, AlertTriangle, Activity, Gauge, Truck, FileDown, FileText,
} from 'lucide-react';
import DrillDownDiaModal from './DrillDownDiaModal';
import {
    C, fmtH, fmtPct, fmtDateBR, utilTone, aproveitamentoColor,
} from './shared/tokens';
import { KpiCard, UtilBar, StateBlock, Card } from './shared/ui';
import { downloadCSV, downloadPDF } from './shared/exportUtils';

// ============================================================================
// Aba "Visão física" (aproveitamento produtivo). Período/obra vêm do shell.
// Visão sempre global (a análise por obra vive no card da obra) → obraId fixo.
// ============================================================================
const AproveitamentoProdutivo = ({ active = true, range, refreshKey = 0, apiClient, setAlertMessage }) => {
    const filtroObra = 'geral';
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [drillDate, setDrillDate] = useState(null);
    const [hoverIdx, setHoverIdx] = useState(null);
    const lastKey = useRef(null);

    // Busca só quando a aba está ativa e a chave mudou (evita refetch ao alternar).
    useEffect(() => {
        if (!active) return;
        if (!range?.start || !range?.end || range.start > range.end) return;
        const key = `${range.start}|${range.end}|${refreshKey}`;
        if (key === lastKey.current) return;
        lastKey.current = key;
        setLoading(true);
        setError(null);
        apiClient.get(`/supervisor/analytics?obraId=${filtroObra}&startDate=${range.start}&endDate=${range.end}`)
            .then(setData)
            .catch(err => {
                console.error(err);
                setError('Falha ao processar dados de produtividade.');
                setAlertMessage?.('Falha ao processar dados de produtividade.');
            })
            .finally(() => setLoading(false));
    }, [active, range?.start, range?.end, refreshKey, apiClient, setAlertMessage]);

    const hasData = !!(data && (data.summary?.qtdVeiculos > 0 || data.summary?.horasExecutadas > 0));

    // ─── Export (via helpers compartilhados) ─────────────────────────────────
    const handleCSV = () => {
        if (!hasData) return;
        const rows = [
            ['Aproveitamento Produtivo'],
            ['Período', `${fmtDateBR(data.range.startDate)} a ${fmtDateBR(data.range.endDate)}`],
            ['Dias úteis', data.range.diasUteis],
            [],
            ['Resumo'],
            ['Capacidade líquida', fmtH(data.summary.capPeriodoLiquida)],
            ['Horas executadas', fmtH(data.summary.horasExecutadas)],
            ['Aproveitamento', fmtPct(data.summary.aproveitamento)],
            ['Horas perdidas', fmtH(data.summary.horasPerdidasTotal)],
            [],
        ];
        if (data.porObra?.length) {
            rows.push(['Ranking por obra (pior → melhor)']);
            rows.push(['Obra', 'Responsável', 'Fiscal', 'Veículos', 'Capacidade', 'Executado', 'Aproveitamento', 'Perdidas']);
            data.porObra.forEach(o => rows.push([
                o.obraNome, o.responsavel || '', o.fiscal || '', o.qtdVeiculos,
                fmtH(o.capPeriodo), fmtH(o.horas_executadas), fmtPct(o.aproveitamento), fmtH(o.horas_perdidas),
            ]));
            rows.push([]);
        }
        rows.push(['Ranking por máquina (pior → melhor)']);
        rows.push(['Registro', 'Modelo', 'Tipo', 'Obra atual', 'Capacidade', 'Executado', 'Aproveitamento', 'Perdidas']);
        data.porVeiculo.forEach(v => rows.push([
            v.registroInterno || '', v.modelo || '', v.tipo || '', v.obraNome || '',
            fmtH(v.capPeriodo), fmtH(v.horas_executadas), fmtPct(v.aproveitamento), fmtH(v.horas_perdidas),
        ]));
        downloadCSV(`aproveitamento_${data.range.startDate}_${data.range.endDate}.csv`, rows);
    };

    const handlePDF = () => {
        if (!hasData) return;
        const tables = [{
            head: ['Indicador', 'Valor'],
            body: [
                ['Capacidade líquida no período', fmtH(data.summary.capPeriodoLiquida)],
                ['Horas executadas', fmtH(data.summary.horasExecutadas)],
                ['Aproveitamento', fmtPct(data.summary.aproveitamento)],
                ['Horas perdidas', fmtH(data.summary.horasPerdidasTotal)],
                ['Delta de aproveitamento vs. período anterior', `${data.comparativo.delta.aproveitamento >= 0 ? '+' : ''}${data.comparativo.delta.aproveitamento.toFixed(1)} pp`],
            ],
        }];
        if (data.porObra?.length) {
            tables.push({
                head: ['Obra', 'Responsável', 'Veículos', 'Executado', 'Aprov.'],
                body: data.porObra.map(o => [o.obraNome, o.responsavel || '—', o.qtdVeiculos, fmtH(o.horas_executadas), fmtPct(o.aproveitamento)]),
            });
        }
        tables.push({
            head: ['Máquina', 'Tipo', 'Obra atual', 'Executado', 'Aprov.'],
            body: data.porVeiculo.map(v => [v.registroInterno || v.modelo || '—', v.tipo || '—', v.obraNome || '—', fmtH(v.horas_executadas), fmtPct(v.aproveitamento)]),
        });
        downloadPDF({
            filename: `aproveitamento_${data.range.startDate}_${data.range.endDate}.pdf`,
            title: 'MAK Frotas — Aproveitamento Produtivo',
            subtitle: `Período: ${fmtDateBR(data.range.startDate)} a ${fmtDateBR(data.range.endDate)}  •  ${data.range.diasUteis} dias úteis  •  Visão geral da frota`,
            tables,
        });
    };

    // Cabeçalho de tabela quente reutilizado
    const thBase = 'p-3 uppercase text-[10px] tracking-wider font-bold';
    const headStyle = { background: C.goldLt, color: C.textMid };

    return (
        <div className="px-6 pt-2 pb-6">
            {/* Ações de export (filtro vem do shell) */}
            <div className="flex justify-end gap-2 mb-3">
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

            <p className="text-[11px] mb-4" style={{ color: C.textSub }}>
                Capacidade líquida desconta fins de semana e máquinas em manutenção.
            </p>

            {loading || error || !hasData ? (
                <StateBlock
                    loading={loading}
                    error={error}
                    empty={!loading && !error && !hasData}
                    loadingText="Processando produtividade…"
                    emptyText="Sem frota produtiva ou horas apontadas no período selecionado."
                    emptyIcon={Gauge}
                />
            ) : (
                <div className="space-y-4">
                    {/* KPIs principais */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <KpiCard icon={Gauge} label="Aproveitamento"
                            value={fmtPct(data.summary.aproveitamento)}
                            valueColor={aproveitamentoColor(data.summary.aproveitamento)}
                            sub={`${fmtH(data.summary.horasExecutadas)} de ${fmtH(data.summary.capPeriodoLiquida)} possíveis`}
                            delta={{ value: data.comparativo.delta.aproveitamento, good: true, suffix: ' pp' }} />
                        <KpiCard icon={Clock} label="Capacidade líquida"
                            value={`${data.summary.capDiariaLiquida}h/dia`}
                            sub={`${data.summary.qtdVeiculos} veículos • ${data.summary.qtdManutencao} em manutenção • ${data.range.diasUteis} dias úteis`} />
                        <KpiCard icon={Activity} label="Média executada"
                            value={`${data.summary.mediaExecutadaDiasUteis.toFixed(1)}h`}
                            sub="por dia útil no período" />
                        <KpiCard icon={AlertTriangle} label="Horas perdidas"
                            value={fmtH(data.summary.horasPerdidasTotal)} valueColor={C.red}
                            sub={`Sendo ${fmtH(data.summary.horasPerdidasManutencao)} em manutenção`}
                            delta={{ value: -data.comparativo.delta.horasPerdidasTotal, good: true, suffix: 'h' }} />
                    </div>

                    {/* Gráfico — diário em janelas curtas, mensal em janelas longas */}
                    {(() => {
                        const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
                        const daily = data.chartData || [];
                        const monthly = daily.length > 62;
                        const capRef = data.summary.capDiariaLiquida;

                        let bars;
                        if (monthly) {
                            const map = new Map();
                            daily.forEach(d => {
                                const ym = d.date.slice(0, 7);
                                const o = map.get(ym) || { key: ym, horas: 0, cap: 0 };
                                o.horas += d.horas_faturadas;
                                o.cap += d.capacidade_dia;
                                map.set(ym, o);
                            });
                            bars = [...map.values()].map(o => {
                                const [yy, mm] = o.key.split('-');
                                const label = `${NOMES_MES[+mm - 1]}/${yy.slice(2)}`;
                                return { ...o, label, full: label, isBiz: true, date: null, pct: o.cap > 0 ? (o.horas / o.cap) * 100 : 0 };
                            });
                        } else {
                            bars = daily.map(d => {
                                const full = fmtDateBR(d.date);
                                return {
                                    key: d.date, label: full.slice(0, 5), full,
                                    horas: d.horas_faturadas, cap: d.capacidade_dia, isBiz: d.is_business_day, date: d.date,
                                    pct: capRef > 0 && d.is_business_day ? (d.horas_faturadas / capRef) * 100 : 0,
                                };
                            });
                        }

                        const maxVal = Math.max(...bars.map(b => b.horas), monthly ? 0 : capRef, 10) * 1.15;
                        const hb = hoverIdx != null ? bars[hoverIdx] : null;

                        return (
                            <Card className="p-5">
                                <div className="flex flex-wrap justify-between items-start mb-2 gap-2">
                                    <h3 className="text-base font-bold flex items-center gap-2" style={{ color: C.text }}>
                                        <BarChart2 size={18} style={{ color: C.gold }} />
                                        {monthly ? 'Produção mensal vs. capacidade' : 'Produção diária vs. capacidade'}
                                    </h3>
                                    {/* Readout ao vivo — fora da área com scroll, então nunca é cortado */}
                                    <div className="text-xs px-3 py-1.5 rounded-lg" style={{ background: C.goldLt, color: C.textMid, minHeight: 30 }}>
                                        {hb ? (
                                            <span>
                                                <b style={{ color: C.text }}>{hb.full}</b>
                                                {' · '}Executado <b style={{ color: C.text }}>{fmtH(hb.horas)}</b>
                                                {hb.isBiz
                                                    ? <> · Aproveitamento <b style={{ color: aproveitamentoColor(hb.pct) }}>{fmtPct(hb.pct)}</b></>
                                                    : <span style={{ color: C.textSub }}> · fim de semana</span>}
                                            </span>
                                        ) : (
                                            <span style={{ color: C.textSub }}>
                                                {monthly ? 'Barras por mês — passe o mouse para os detalhes.' : 'Cinza = fim de semana · clique num dia para o detalhamento.'}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="relative h-72 flex items-end gap-1.5 p-2 pb-0 overflow-x-auto"
                                    onMouseLeave={() => setHoverIdx(null)}
                                    style={{ borderBottom: `1px solid ${C.border}`, borderLeft: `1px solid ${C.border}` }}>
                                    {!monthly && capRef > 0 && (
                                        <div className="absolute left-0 w-full border-t-[3px] border-dashed z-0 pointer-events-none"
                                            style={{ bottom: `${(capRef / maxVal) * 100}%`, borderColor: C.green }}>
                                            <span className="absolute -top-6 left-2 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border"
                                                style={{ color: C.green, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                                                Capacidade líquida: {capRef}h/dia
                                            </span>
                                        </div>
                                    )}
                                    {bars.map((b, i) => {
                                        const height = (b.horas / maxVal) * 100;
                                        const tone = utilTone(b.pct);
                                        const clickable = !!b.date;
                                        return (
                                            <button key={b.key}
                                                onClick={clickable ? () => setDrillDate(b.date) : undefined}
                                                onMouseEnter={() => setHoverIdx(i)}
                                                className={`flex-1 flex flex-col justify-end items-center relative h-full z-10 ${monthly ? 'min-w-[46px]' : 'min-w-[24px]'} ${clickable ? 'cursor-pointer' : 'cursor-default'}`}>
                                                {!b.isBiz && (
                                                    <div className="absolute inset-x-0 bottom-6 top-0 -z-10" style={{ background: C.goldLt }} />
                                                )}
                                                <div className={`w-full rounded-t transition-all shadow-sm ${monthly ? 'max-w-[54px]' : 'max-w-[40px]'} ${b.isBiz ? tone.bg : ''}`}
                                                    style={{ height: `${height}%`, minHeight: height > 0 ? '4px' : '0', opacity: hoverIdx === i ? 1 : 0.85, background: b.isBiz ? undefined : '#cbd5e1', outline: hoverIdx === i ? `2px solid ${C.gold}` : 'none' }} />
                                                <span className="text-[9px] mt-2 h-6 text-center font-medium" style={{ color: C.textSub }}>{b.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="flex flex-wrap justify-center gap-6 mt-4 text-[11px] font-semibold" style={{ color: C.textMid }}>
                                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />≥80%</span>
                                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-yellow-500 inline-block" />60–79%</span>
                                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-500 inline-block" />40–59%</span>
                                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />&lt;40%</span>
                                    {!monthly && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#cbd5e1' }} />Fim de semana</span>}
                                </div>
                            </Card>
                        );
                    })()}

                    {/* Ranking por obra */}
                    {data.porObra && data.porObra.length > 0 && (
                        <Card className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-base font-bold flex items-center gap-2" style={{ color: C.text }}>
                                    <Truck size={18} style={{ color: C.gold }} /> Ranking por obra
                                </h3>
                                <span className="text-[11px]" style={{ color: C.textSub }}>Pior → melhor aproveitamento. Quem cobrar.</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead style={headStyle}>
                                        <tr>
                                            <th className={`${thBase} text-left`}>Obra</th>
                                            <th className={`${thBase} text-left`}>Responsável</th>
                                            <th className={`${thBase} text-left`}>Fiscal</th>
                                            <th className={`${thBase} text-center`}>Veículos</th>
                                            <th className={`${thBase} text-right`}>Executado</th>
                                            <th className={`${thBase} text-left w-[24%]`}>Aproveitamento</th>
                                            <th className={`${thBase} text-right`}>Perdidas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y" style={{ borderColor: C.border }}>
                                        {data.porObra.map(o => {
                                            const tone = utilTone(o.aproveitamento);
                                            return (
                                                <React.Fragment key={o.obraId}>
                                                    <tr className="hover:bg-slate-50" style={{ borderTop: `1px solid ${C.border}` }}>
                                                        <td className="p-3 font-bold" style={{ color: C.text }}>{o.obraNome}</td>
                                                        <td className="p-3" style={{ color: C.textMid }}>{o.responsavel || <span style={{ color: C.textSub }} className="italic">—</span>}</td>
                                                        <td className="p-3" style={{ color: C.textMid }}>{o.fiscal || <span style={{ color: C.textSub }} className="italic">—</span>}</td>
                                                        <td className="p-3 text-center" style={{ color: C.textMid }}>{o.qtdVeiculos}</td>
                                                        <td className="p-3 text-right font-semibold" style={{ color: C.textMid }}>{fmtH(o.horas_executadas)}</td>
                                                        <td className="p-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex-1"><UtilBar pct={o.aproveitamento} /></div>
                                                                <span className={`font-bold min-w-[52px] text-right ${tone.text}`}>{fmtPct(o.aproveitamento)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-right font-semibold" style={{ color: C.red }}>{fmtH(o.horas_perdidas)}</td>
                                                    </tr>
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}

                    {/* Aproveitamento por categoria */}
                    <Card className="p-6">
                        <h3 className="text-base font-bold flex items-center gap-2 mb-4" style={{ color: C.text }}>
                            <Truck size={18} style={{ color: C.gold }} /> Aproveitamento por categoria
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead style={headStyle}>
                                    <tr>
                                        <th className={`${thBase} text-left`}>Categoria</th>
                                        <th className={`${thBase} text-center`}>Qtd.</th>
                                        <th className={`${thBase} text-center`}>Em manut.</th>
                                        <th className={`${thBase} text-center`}>Executado</th>
                                        <th className={`${thBase} text-left w-[28%]`}>Aproveitamento</th>
                                        <th className={`${thBase} text-right`}>Perdidas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data.frotaPorTipo || []).map(c => {
                                        const tone = utilTone(c.aproveitamento);
                                        return (
                                            <tr key={c.tipo} className="hover:bg-slate-50" style={{ borderTop: `1px solid ${C.border}` }}>
                                                <td className="p-3 font-bold" style={{ color: C.text }}>{c.tipo}</td>
                                                <td className="p-3 text-center" style={{ color: C.textMid }}>{c.qtd}</td>
                                                <td className="p-3 text-center font-semibold" style={{ color: C.gold }}>{c.qtdManutencao || 0}</td>
                                                <td className="p-3 text-center font-semibold" style={{ color: C.textMid }}>{fmtH(c.horas_executadas)}</td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex-1"><UtilBar pct={c.aproveitamento} /></div>
                                                        <span className={`font-bold min-w-[52px] text-right ${tone.text}`}>{fmtPct(c.aproveitamento)}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-right font-semibold" style={{ color: C.red }}>{fmtH(c.horas_perdidas)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* Ranking por máquina individual */}
                    <Card className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold flex items-center gap-2" style={{ color: C.text }}>
                                <Activity size={18} style={{ color: C.gold }} /> Máquinas individualmente
                            </h3>
                            <span className="text-[11px]" style={{ color: C.textSub }}>Da menos aproveitada para a mais aproveitada</span>
                        </div>
                        <div className="overflow-x-auto max-h-[480px]">
                            <table className="w-full text-sm">
                                <thead style={{ ...headStyle, position: 'sticky', top: 0 }}>
                                    <tr>
                                        <th className={`${thBase} text-left`}>Máquina</th>
                                        <th className={`${thBase} text-left`}>Tipo</th>
                                        <th className={`${thBase} text-left`}>Obra atual</th>
                                        <th className={`${thBase} text-right`}>Executado</th>
                                        <th className={`${thBase} text-left w-[24%]`}>Aproveitamento</th>
                                        <th className={`${thBase} text-right`}>Perdidas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.porVeiculo.map(v => {
                                        const isManut = v.estado === 'manutencao';
                                        const tone = utilTone(v.aproveitamento);
                                        return (
                                            <tr key={v.id} className="hover:bg-slate-50" style={{ borderTop: `1px solid ${C.border}` }}>
                                                <td className="p-3 font-bold" style={{ color: C.text }}>
                                                    {v.registroInterno || v.modelo}
                                                    {v.registroInterno && v.modelo && (
                                                        <span className="font-normal text-xs" style={{ color: C.textSub }}> — {v.modelo}</span>
                                                    )}
                                                </td>
                                                <td className="p-3" style={{ color: C.textMid }}>{v.tipo}</td>
                                                <td className="p-3" style={{ color: C.textMid }}>{v.obraNome || '—'}</td>
                                                <td className="p-3 text-right font-semibold" style={{ color: C.textMid }}>{fmtH(v.horas_executadas)}</td>
                                                <td className="p-3">
                                                    {isManut ? (
                                                        <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ color: C.gold, background: C.goldLt }}>
                                                            Em manutenção
                                                        </span>
                                                    ) : (
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex-1"><UtilBar pct={v.aproveitamento} /></div>
                                                            <span className={`font-bold min-w-[52px] text-right ${tone.text}`}>{fmtPct(v.aproveitamento)}</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right font-semibold" style={{ color: C.red }}>{isManut ? '—' : fmtH(v.horas_perdidas)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {drillDate && (
                <DrillDownDiaModal
                    apiClient={apiClient}
                    date={drillDate}
                    obraId={filtroObra}
                    onClose={() => setDrillDate(null)}
                />
            )}
        </div>
    );
};

export default AproveitamentoProdutivo;
