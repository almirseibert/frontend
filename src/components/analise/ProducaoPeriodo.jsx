import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Clock, Users, Building2, Truck, FileDown, FileText, HardHat, AlertTriangle, ChevronDown, ChevronRight, History, CalendarRange, Loader,
} from 'lucide-react';
import { C, fmtH, fmtDateBR } from './shared/tokens';
import { KpiCard, StateBlock, Card } from './shared/ui';
import { downloadCSV } from './shared/exportUtils';
import { gerarPdfProducao } from './producaoPdf';
import EstadiaRetroativaModal from '../EstadiaRetroativaModal';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { getAllowedReadingTypes } from '../../utils/vehicleRules';

// ============================================================================
// Aba "Produção" (principal de Desempenho do negócio): o que foi executado no
// período, por obra e por máquina, frota própria × terceiros.
// Regras do cálculo (h/dia por dia útil ALOCADO etc.) vivem no backend:
// frotasmak/services/producaoPeriodoService.js.
// ============================================================================

const fmtHd = (v) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const nomeMaquina = (m) => m.registroInterno || m.placa || m.modelo || '—';
const origemLabel = (m) => (m.origem === 'terceiro' ? (m.locadora || 'Terceiro') : 'Próprio');

const TOP_MAQUINAS = 15;

const OrigemPill = ({ m }) => {
    const cor = m.origem === 'terceiro' ? C.terceiro : C.proprio;
    return (
        <span className="px-2 py-0.5 rounded-md whitespace-nowrap"
            style={{ fontSize: 11, fontWeight: 600, color: cor, background: `${cor}1f` }}>
            {origemLabel(m)}
        </span>
    );
};

const Legenda = () => (
    <span className="flex items-center gap-3" style={{ fontSize: 11, color: C.textSub }}>
        <span className="flex items-center gap-1"><span style={{ width: 9, height: 9, borderRadius: 2, background: C.proprio, display: 'inline-block' }} />Próprio</span>
        <span className="flex items-center gap-1"><span style={{ width: 9, height: 9, borderRadius: 2, background: C.terceiro, display: 'inline-block' }} />Terceiro</span>
    </span>
);

// Barra empilhada próprio + terceiro, em escala relativa ao maior total.
const BarraEmpilhada = ({ proprio, terceiro, max, height = 12 }) => (
    <div className="w-full flex overflow-hidden" style={{ height, borderRadius: 3, background: C.goldLt }}>
        <div style={{ width: `${max > 0 ? (proprio / max) * 100 : 0}%`, background: C.proprio }} />
        <div style={{ width: `${max > 0 ? (terceiro / max) * 100 : 0}%`, background: C.terceiro }} />
    </div>
);

const BarraSimples = ({ valor, max, cor }) => (
    <div className="flex-1 overflow-hidden" style={{ height: 7, borderRadius: 3, background: C.goldLt }}>
        <div style={{ height: 7, width: `${max > 0 && valor ? Math.min(100, (valor / max) * 100) : 0}%`, background: cor }} />
    </div>
);

const ProducaoPeriodo = ({ active = true, range, refreshKey = 0, apiClient, setAlertMessage }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [obraAberta, setObraAberta] = useState(null);
    const [filtroOrigem, setFiltroOrigem] = useState('todas');
    const [todasMaquinas, setTodasMaquinas] = useState(false);
    const [avisoAberto, setAvisoAberto] = useState(false);
    const [trechoAlocando, setTrechoAlocando] = useState(null); // linha de "horas sem alocação" virando estadia retroativa
    const [trechoAjustando, setTrechoAjustando] = useState(null); // linha cuja correção é estender/antecipar a alocação da obra
    const [salvandoAjuste, setSalvandoAjuste] = useState(false);
    const [recarga, setRecarga] = useState(0);
    const lastKey = useRef(null);
    const { vehicles, obras, employees } = useData();
    const { isEditor } = useAuth();

    // Busca só quando a aba está ativa e a chave mudou (evita refetch ao alternar).
    useEffect(() => {
        if (!active) return;
        if (!range?.start || !range?.end || range.start > range.end) return;
        const key = `${range.start}|${range.end}|${refreshKey}|${recarga}`;
        if (key === lastKey.current) return;
        lastKey.current = key;
        setLoading(true);
        setError(null);
        apiClient.getProducaoPeriodo({ startDate: range.start, endDate: range.end })
            .then((d) => { setData(d); setObraAberta(null); })
            .catch(err => {
                console.error(err);
                setError('Falha ao calcular a produção do período.');
                setAlertMessage?.('Falha ao calcular a produção do período.');
            })
            .finally(() => setLoading(false));
    }, [active, range?.start, range?.end, refreshKey, recarga, apiClient, setAlertMessage]);

    const hasData = !!(data && data.resumo.maquinas > 0);

    const maquinasFiltradas = useMemo(() => {
        if (!data) return [];
        return filtroOrigem === 'todas' ? data.porMaquina : data.porMaquina.filter(m => m.origem === filtroOrigem);
    }, [data, filtroOrigem]);

    const periodoLabel = data ? `${fmtDateBR(data.range.startDate)} a ${fmtDateBR(data.range.endDate)}` : '';

    // ─── Export ──────────────────────────────────────────────────────────────
    const handlePDF = () => {
        if (!hasData) return;
        gerarPdfProducao(data);
    };

    const handleCSV = () => {
        if (!hasData) return;
        const rows = [
            ['Produção do período', periodoLabel],
            [],
            ['Obra', 'Próprio (h)', 'Terceiro (h)', 'Total (h)', '% terceiro'],
            ...data.porObra.map(o => [o.nome, o.horasProprio, o.horasTerceiro, o.total, o.pctTerceiro]),
            [],
            ['Tipo', 'Próprio h/dia', 'Próprio máquinas', 'Terceiro h/dia', 'Terceiro máquinas', 'Diferença %'],
            ...data.porTipo.map(t => [t.grupo, t.proprio.hDia ?? '', t.proprio.maquinas, t.terceiro.hDia ?? '', t.terceiro.maquinas, t.diffPct ?? '']),
            [],
            ['Máquina', 'Tipo', 'Origem', 'Obra(s)', 'Dias alocados', 'Horas', 'Horas na alocação', 'h/dia', 'Último lançamento', 'Dias úteis sem lançar no fim'],
            ...data.porMaquina.map(m => [
                nomeMaquina(m), m.grupo, origemLabel(m), m.obras.map(o => o.nome).join(' / '),
                m.diasAlocados, m.horas, m.horasAlocadas, m.hDia ?? '', m.ultimoLancamento ? fmtDateBR(m.ultimoLancamento) : '', m.diasSemLancarNoFim,
            ]),
        ];
        downloadCSV(`producao_${data.range.startDate}_${data.range.endDate}.csv`, rows);
    };

    const thBase = 'p-2.5 uppercase text-[10px] tracking-wider font-bold text-left';
    const headStyle = { background: C.goldLt, color: C.textMid };

    return (
        <div className="px-6 pt-2 pb-6">
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

            {loading || error || !hasData ? (
                <StateBlock
                    loading={loading}
                    error={error}
                    empty={!loading && !error && !hasData}
                    loadingText="Somando a produção do período…"
                    emptyText="Nenhuma hora lançada nem máquina alocada no período selecionado."
                    emptyIcon={HardHat}
                />
            ) : (
                <div className="space-y-4">
                    {/* ── Números do período ─────────────────────────────── */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <KpiCard icon={Clock} label="Horas executadas"
                            value={fmtH(data.resumo.horasTotal)}
                            delta={data.resumo.deltaPct != null ? { value: data.resumo.deltaPct, good: true } : null}
                            sub={data.resumo.deltaPct != null ? 'vs. período anterior' : null} />
                        <div className="rounded-xl border p-3.5" style={{ background: C.surface, borderColor: C.border }}>
                            <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: C.textSub, fontWeight: 600 }}>
                                <Users size={13} style={{ color: C.gold }} /> Próprio × terceiro
                            </div>
                            <div style={{ fontSize: 23, fontWeight: 800, marginTop: 4, lineHeight: 1.1 }}>
                                <span style={{ color: C.proprio }}>{Math.round(100 - data.resumo.pctTerceiro)}%</span>
                                <span style={{ color: C.textSub, fontSize: 16, fontWeight: 500 }}> / </span>
                                <span style={{ color: C.terceiro }}>{Math.round(data.resumo.pctTerceiro)}%</span>
                            </div>
                            <div className="mt-1.5">
                                <BarraEmpilhada proprio={data.resumo.horasProprio} terceiro={data.resumo.horasTerceiro}
                                    max={data.resumo.horasTotal} height={6} />
                            </div>
                        </div>
                        <KpiCard icon={Building2} label="Obras atendidas"
                            value={data.resumo.obras}
                            sub={`${data.resumo.obrasComTerceiro} com terceiros`} />
                        <KpiCard icon={Truck} label="Máquinas no período"
                            value={data.resumo.maquinas}
                            sub={`${data.resumo.maquinasProprias} próprias · ${data.resumo.maquinasTerceiras} terceiras`} />
                    </div>

                    {/* ── Aviso de cadastro ──────────────────────────────── */}
                    {/* Alocada sem lançar fica na Central Operacional; aqui só o
                        que tira horas da média: lançamento em dia sem estadia. */}
                    {data.resumo.horasSemAlocacao > 0 && (
                        <div className="rounded-xl border p-3" style={{ background: '#fefce8', borderColor: '#fde68a' }}>
                            <button onClick={() => setAvisoAberto(v => !v)} className="flex items-start gap-2 w-full text-left">
                                <AlertTriangle size={16} style={{ color: C.yellow, marginTop: 1, flexShrink: 0 }} />
                                <span className="flex-1" style={{ fontSize: 12, color: '#713f12' }}>
                                    <b>Cadastro afeta a média h/dia.</b>{' '}
                                    {fmtH(data.resumo.horasSemAlocacao)} foram lançadas em dias sem alocação e ficam fora da média.
                                    {isEditor && ' Registre a estadia de cada trecho para corrigir.'}
                                </span>
                                {avisoAberto ? <ChevronDown size={16} style={{ color: '#713f12' }} /> : <ChevronRight size={16} style={{ color: '#713f12' }} />}
                            </button>
                            {avisoAberto && (
                                <div className="mt-3" style={{ fontSize: 12, color: '#713f12' }}>
                                    {data.semAlocacao.map(s => (
                                        <div key={`${s.vehicleId}|${s.obraId}|${s.primeiroDia}`} className="flex items-center gap-3 py-1" style={{ borderTop: '1px solid #fde68a' }}>
                                            <span className="flex-1 min-w-0">{nomeMaquina(s)} · {s.obraNome}</span>
                                            <span className="whitespace-nowrap">
                                                {s.primeiroDia === s.ultimoDia
                                                    ? fmtDateBR(s.primeiroDia).slice(0, 5)
                                                    : `${fmtDateBR(s.primeiroDia).slice(0, 5)} a ${fmtDateBR(s.ultimoDia).slice(0, 5)}`}
                                            </span>
                                            <span className="whitespace-nowrap text-right" style={{ width: 120 }}>{fmtH(s.horas)} em {s.dias} dia(s)</span>
                                            {isEditor && s.acao && (
                                                <button onClick={() => setTrechoAjustando(s)}
                                                    className="flex items-center gap-1 px-2 py-0.5 rounded border font-semibold hover:bg-amber-100 whitespace-nowrap"
                                                    style={{ borderColor: '#fcd34d', fontSize: 11 }}
                                                    title="A máquina seguiu lançando na mesma obra: corrigir a alocação que já existe">
                                                    <CalendarRange size={12} />
                                                    {s.acao.tipo === 'estender'
                                                        ? `Estender até ${fmtDateBR(s.acao.novaSaida).slice(0, 5)}`
                                                        : `Antecipar para ${fmtDateBR(s.acao.novaEntrada).slice(0, 5)}`}
                                                </button>
                                            )}
                                            {isEditor && (
                                                <button onClick={() => setTrechoAlocando(s)}
                                                    disabled={!s.obraId || !vehicles.some(v => String(v.id) === String(s.vehicleId))}
                                                    className={s.acao
                                                        ? 'px-1 underline whitespace-nowrap disabled:opacity-40'
                                                        : 'flex items-center gap-1 px-2 py-0.5 rounded border font-semibold hover:bg-amber-100 disabled:opacity-40'}
                                                    style={{ borderColor: '#fcd34d', fontSize: 11 }}
                                                    title="Registrar a estadia retroativa só desse trecho">
                                                    {s.acao ? 'só o trecho' : <><History size={12} /> Alocar</>}
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Por obra ───────────────────────────────────────── */}
                    <Card className="p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-bold flex items-center gap-2" style={{ color: C.text }}>
                                <Building2 size={18} style={{ color: C.gold }} /> Por obra
                            </h3>
                            <Legenda />
                        </div>
                        {(() => {
                            const obrasComHoras = data.porObra.filter(o => o.total > 0);
                            const max = obrasComHoras[0]?.total || 0;
                            return obrasComHoras.map(o => {
                                const aberta = obraAberta === o.obraId;
                                return (
                                    <div key={o.obraId} style={{ borderTop: `1px solid ${C.border}` }}>
                                        <button onClick={() => setObraAberta(aberta ? null : o.obraId)}
                                            className="w-full grid items-center gap-3 py-2 text-left hover:bg-amber-50/40"
                                            style={{ gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr) 72px 56px', fontSize: 13 }}>
                                            <span className="flex items-center gap-1 truncate" style={{ color: C.text }}>
                                                {aberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                <span className="truncate" title={o.nome}>{o.nome}</span>
                                            </span>
                                            <BarraEmpilhada proprio={o.horasProprio} terceiro={o.horasTerceiro} max={max} />
                                            <span className="text-right font-semibold" style={{ color: C.text }}>{fmtH(o.total)}</span>
                                            <span className="text-right" style={{ color: o.pctTerceiro > 0 ? C.terceiro : C.textSub, fontWeight: 600 }}>
                                                {Math.round(o.pctTerceiro)}%
                                            </span>
                                        </button>
                                        {aberta && (
                                            <div className="pb-3 pl-6">
                                                <table className="w-full" style={{ fontSize: 12 }}>
                                                    <tbody>
                                                        {o.maquinas.map(m => (
                                                            <tr key={m.vehicleId} style={{ borderTop: `1px solid ${C.border}` }}>
                                                                <td className="py-1.5" style={{ color: C.text }}>{nomeMaquina(m)}</td>
                                                                <td className="py-1.5" style={{ color: C.textMid }}>{m.grupo}</td>
                                                                <td className="py-1.5"><OrigemPill m={m} /></td>
                                                                <td className="py-1.5 text-right font-semibold" style={{ color: m.horas > 0 ? C.text : C.textSub }}>{fmtH(m.horas)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            });
                        })()}
                    </Card>

                    {/* ── Próprio × terceiro por tipo ────────────────────── */}
                    <Card className="p-5">
                        <div className="flex items-start justify-between mb-1 gap-3 flex-wrap">
                            <h3 className="text-base font-bold flex items-center gap-2" style={{ color: C.text }}>
                                <Users size={18} style={{ color: C.gold }} /> Nossa máquina rende como a alugada?
                            </h3>
                            <Legenda />
                        </div>
                        <p className="mb-3" style={{ fontSize: 12, color: C.textSub }}>
                            Horas por dia útil em que a máquina esteve alocada, no mesmo tipo de equipamento. Sábado soma horas, não dias.
                        </p>
                        {(() => {
                            const max = Math.max(...data.porTipo.flatMap(t => [t.proprio.hDia || 0, t.terceiro.hDia || 0]), 1);
                            return (
                                <table className="w-full" style={{ fontSize: 12 }}>
                                    <thead>
                                        <tr style={headStyle}>
                                            <th className={thBase} style={{ width: '32%' }}>Tipo</th>
                                            <th className={thBase}>h por dia alocado</th>
                                            <th className={thBase} style={{ width: 90 }}>Máquinas</th>
                                            <th className={thBase} style={{ width: 90 }}>Diferença</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.porTipo.map(t => {
                                            const corDiff = t.diffPct == null ? C.textSub : t.diffPct >= 5 ? C.green : t.diffPct <= -5 ? C.orange : C.textSub;
                                            return (
                                                <tr key={t.grupo} style={{ borderTop: `1px solid ${C.border}` }}>
                                                    <td className="p-2.5" style={{ color: C.text }}>{t.grupo}</td>
                                                    <td className="p-2.5">
                                                        <div className="flex items-center gap-2">
                                                            <BarraSimples valor={t.proprio.hDia} max={max} cor={C.proprio} />
                                                            <span className="w-8 text-right" style={{ color: C.text }}>{t.proprio.maquinas ? fmtHd(t.proprio.hDia) : '—'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <BarraSimples valor={t.terceiro.hDia} max={max} cor={C.terceiro} />
                                                            <span className="w-8 text-right" style={{ color: C.text }}>{t.terceiro.maquinas ? fmtHd(t.terceiro.hDia) : '—'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-2.5" style={{ color: C.textMid }}>{t.proprio.maquinas} · {t.terceiro.maquinas}</td>
                                                    <td className="p-2.5">
                                                        {t.diffPct != null ? (
                                                            <span style={{ color: corDiff, fontWeight: 700 }}>{t.diffPct >= 0 ? '+' : ''}{Math.round(t.diffPct)}%</span>
                                                        ) : (
                                                            <span style={{ color: C.textSub }}>{t.terceiro.maquinas ? 'sem base' : 'só próprio'}</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            );
                        })()}
                        <p className="mt-2" style={{ fontSize: 11, color: C.textSub }}>
                            Diferença = próprio em relação ao terceiro. Máquinas = próprias · terceiras.
                        </p>
                    </Card>

                    {/* ── Por máquina ────────────────────────────────────── */}
                    <Card className="p-5">
                        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                            <h3 className="text-base font-bold flex items-center gap-2" style={{ color: C.text }}>
                                <Truck size={18} style={{ color: C.gold }} /> Por máquina
                            </h3>
                            <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: C.goldLt }}>
                                {[['todas', 'Todas'], ['proprio', 'Só próprias'], ['terceiro', 'Só terceiras']].map(([id, label]) => (
                                    <button key={id} onClick={() => setFiltroOrigem(id)}
                                        className="text-xs font-bold px-3 py-1 rounded-md"
                                        style={filtroOrigem === id ? { background: C.gold, color: '#fff' } : { color: C.textMid }}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full" style={{ fontSize: 12 }}>
                                <thead>
                                    <tr style={headStyle}>
                                        <th className={thBase}>Máquina</th>
                                        <th className={thBase}>Tipo</th>
                                        <th className={thBase}>Origem</th>
                                        <th className={thBase}>Obra(s)</th>
                                        <th className={`${thBase} text-right`}>Dias aloc.</th>
                                        <th className={`${thBase} text-right`}>Horas</th>
                                        <th className={`${thBase} text-right`}>h/dia</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(todasMaquinas ? maquinasFiltradas : maquinasFiltradas.slice(0, TOP_MAQUINAS)).map(m => (
                                        <tr key={m.vehicleId} style={{ borderTop: `1px solid ${C.border}` }}>
                                            <td className="p-2.5" style={{ color: C.text, fontWeight: 600 }}>
                                                {nomeMaquina(m)}
                                                {m.paradaAlocada && (
                                                    <span className="block" style={{ fontSize: 10, color: C.yellow, fontWeight: 600 }}
                                                        title={m.ultimoLancamento ? `Último lançamento em ${fmtDateBR(m.ultimoLancamento)}` : 'Nenhum lançamento no período'}>
                                                        sem lançar há {m.diasSemLancarNoFim} dias úteis
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-2.5" style={{ color: C.textMid }}>{m.grupo}</td>
                                            <td className="p-2.5"><OrigemPill m={m} /></td>
                                            <td className="p-2.5" style={{ color: C.textMid }}>
                                                {m.obras.length > 1 ? `${m.obras.length} obras` : (m.obras[0]?.nome || '—')}
                                            </td>
                                            <td className="p-2.5 text-right" style={{ color: C.textMid }}>{m.diasAlocados}</td>
                                            <td className="p-2.5 text-right font-semibold" style={{ color: C.text }}>{fmtH(m.horas)}</td>
                                            <td className="p-2.5 text-right font-bold" style={{ color: m.hDia == null ? C.textSub : C.text }}>{fmtHd(m.hDia)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {maquinasFiltradas.length > TOP_MAQUINAS && (
                            <button onClick={() => setTodasMaquinas(v => !v)} className="mt-3 text-xs font-bold" style={{ color: C.gold }}>
                                {todasMaquinas ? 'Mostrar só as 15 primeiras' : `Ver todas as ${maquinasFiltradas.length} máquinas`}
                            </button>
                        )}
                    </Card>

                    <p style={{ fontSize: 11, color: C.textSub }}>
                        Horas = lançamentos de horas do período, sem dias justificados (não é horímetro). h/dia = horas dentro da alocação ÷ dias úteis alocados.
                    </p>
                </div>
            )}

            {trechoAjustando && (() => {
                const s = trechoAjustando;
                const a = s.acao;
                const dia = (d) => (d ? fmtDateBR(d) : 'em aberto');
                const confirmar = async () => {
                    setSalvandoAjuste(true);
                    try {
                        await apiClient.updateObraHistoryEntry(a.obraId, a.historyId,
                            a.tipo === 'estender' ? { dataSaida: a.novaSaida } : { dataEntrada: a.novaEntrada });
                        setAlertMessage?.(`Alocação de ${nomeMaquina(s)} em ${s.obraNome} ajustada.`);
                        setTrechoAjustando(null);
                        setRecarga(n => n + 1);
                    } catch (err) {
                        setAlertMessage?.(`Não foi possível ajustar a alocação: ${err.message}`);
                    } finally {
                        setSalvandoAjuste(false);
                    }
                };
                return (
                    <div className="mak-modal-backdrop backdrop-blur-sm">
                        <div className="mak-modal max-w-md">
                            <div className="p-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-t-xl">
                                <h2 className="text-base font-bold flex items-center gap-2">
                                    <CalendarRange size={17} /> {a.tipo === 'estender' ? 'Estender alocação' : 'Antecipar alocação'}
                                </h2>
                                <p className="text-xs opacity-90 mt-0.5">{nomeMaquina(s)} · {s.obraNome}</p>
                            </div>
                            <div className="p-5 space-y-3 text-sm text-gray-700">
                                {a.tipo === 'estender' ? (
                                    <>
                                        <p>
                                            Alocada de <b>{dia(a.entrada)}</b> a <b>{dia(a.saidaAtual)}</b>, mas seguiu lançando horas na obra depois disso.
                                        </p>
                                        <p>
                                            A saída passa para <b>{dia(a.novaSaida)}</b>
                                            {a.proxima && a.novaSaida === a.proxima.inicio
                                                ? <>, quando entrou em <b>{a.proxima.obraNome}</b>.</>
                                                : ', o último dia com lançamento na obra.'}
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p>
                                            Alocada a partir de <b>{dia(a.entradaAtual)}</b>, mas já lançava horas na obra antes.
                                        </p>
                                        <p>A entrada passa para <b>{dia(a.novaEntrada)}</b>, o primeiro dia com lançamento.</p>
                                    </>
                                )}
                                <p className="text-xs text-gray-500">
                                    Só a data da alocação muda — nenhuma hora lançada é alterada. Confira com quem acompanha a obra se a máquina não saiu de lá no período.
                                </p>
                                <div className="flex gap-3 pt-1">
                                    <button onClick={() => setTrechoAjustando(null)} disabled={salvandoAjuste}
                                        className="flex-1 py-2.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold rounded-lg text-sm">
                                        Cancelar
                                    </button>
                                    <button onClick={confirmar} disabled={salvandoAjuste}
                                        className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-bold rounded-lg text-sm flex items-center justify-center gap-2">
                                        {salvandoAjuste ? <Loader className="animate-spin" size={16} /> : 'Confirmar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {trechoAlocando && (() => {
                const vehicle = vehicles.find(v => String(v.id) === String(trechoAlocando.vehicleId));
                const readingType = getAllowedReadingTypes(vehicle.tipo).includes('horimetro') ? 'horimetro' : 'odometro';
                return (
                    <EstadiaRetroativaModal
                        vehicle={vehicle}
                        currentObra={obras.find(o => String(o.id) === String(vehicle.obraAtualId))}
                        obras={obras}
                        employees={employees}
                        readingType={readingType}
                        readingLabel={readingType === 'horimetro' ? 'Horímetro' : 'Odômetro'}
                        inicial={{
                            obraId: trechoAlocando.obraId,
                            employeeId: trechoAlocando.operadorId,
                            dataEntrada: trechoAlocando.primeiroDia,
                            dataSaida: trechoAlocando.ultimoDia,
                            observacoes: 'Horas lançadas sem alocação',
                            horas: trechoAlocando.horas,
                        }}
                        onClose={() => setTrechoAlocando(null)}
                        setAlertMessage={setAlertMessage}
                        apiClient={apiClient}
                        reloadData={() => setRecarga(n => n + 1)}
                    />
                );
            })()}
        </div>
    );
};

export default ProducaoPeriodo;
