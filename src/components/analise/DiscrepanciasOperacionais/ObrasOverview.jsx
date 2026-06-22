import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Loader, AlertTriangle, ChevronRight, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { useData } from '../../../contexts/DataContext';

const fmtMin = (min) => {
    if (!min) return '0h';
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return `${m}min`;
    if (!m) return `${h}h`;
    return `${h}h${String(m).padStart(2, '0')}`;
};

const TIPO_META = {
    maquina_alem_do_faturado:     { label: 'Rodou além do faturado',   dot: 'bg-red-500',     text: 'text-red-700',     border: 'border-red-200' },
    faturado_alem_da_maquina:     { label: 'Faturado sem rastreador',  dot: 'bg-orange-500',  text: 'text-orange-700',  border: 'border-orange-200' },
    sem_lancamento_com_atividade: { label: 'Sem lançamento',            dot: 'bg-amber-500',   text: 'text-amber-700',   border: 'border-amber-200' },
    gap_ponto_maquina_inicio:     { label: 'Gap ponto → máquina',      dot: 'bg-purple-500',  text: 'text-purple-700',  border: 'border-purple-200' },
    gap_ponto_maquina_fim:        { label: 'Máquina parou cedo',        dot: 'bg-purple-500',  text: 'text-purple-700',  border: 'border-purple-200' },
};

const TIPOS_ORDEM = [
    'maquina_alem_do_faturado',
    'faturado_alem_da_maquina',
    'sem_lancamento_com_atividade',
    'gap_ponto_maquina_inicio',
    'gap_ponto_maquina_fim',
];

// job: null | { jobId, status, processed, total, discrepancias, error }
const MAX_DIAS = 90;

const ObrasOverview = ({ apiClient, range, setRange, onSelectObra, setAlertMessage }) => {
    const { socket } = useData();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [job, setJob] = useState(null);
    const [tipoFiltro, setTipoFiltro] = useState(null);
    const pollRef = useRef(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiClient.getAnaliseObrasOverview(range);
            setData(res);
        } catch (e) {
            setAlertMessage?.(e.message || 'Erro ao carregar obras.');
            setData({ obras: [] });
        } finally {
            setLoading(false);
        }
    }, [apiClient, range, setAlertMessage]);

    useEffect(() => {
        const re = /^\d{4}-\d{2}-\d{2}$/;
        if (!re.test(range.startDate) || !re.test(range.endDate)) return;
        if (range.startDate > range.endDate) return;
        const id = setTimeout(fetchData, 350);
        return () => clearTimeout(id);
    }, [fetchData, range.startDate, range.endDate]);

    // Escuta progresso via Socket.io e faz polling de fallback
    useEffect(() => {
        if (!job || job.status !== 'running') {
            clearInterval(pollRef.current);
            return;
        }

        const handleProgress = (payload) => {
            if (payload.jobId !== job.jobId) return;
            setJob(prev => ({ ...prev, ...payload }));
            if (payload.status === 'done') fetchData();
        };

        socket?.on('reprocessar:progresso', handleProgress);

        // Polling de fallback caso o socket não esteja disponível
        pollRef.current = setInterval(async () => {
            try {
                const status = await apiClient.getReprocessarStatus(job.jobId);
                setJob(prev => ({ ...prev, ...status }));
                if (status.status !== 'running') {
                    clearInterval(pollRef.current);
                    if (status.status === 'done') fetchData();
                }
            } catch (_) {}
        }, 3000);

        return () => {
            socket?.off('reprocessar:progresso', handleProgress);
            clearInterval(pollRef.current);
        };
    }, [job?.jobId, job?.status, socket, apiClient, fetchData]);

    const diffDias = range.startDate && range.endDate
        ? Math.round((new Date(range.endDate) - new Date(range.startDate)) / 86400000) + 1
        : 0;

    const handleReprocess = async () => {
        if (diffDias > MAX_DIAS) {
            setAlertMessage?.(`Período máximo para reprocessamento é ${MAX_DIAS} dias. Selecione um intervalo menor.`);
            return;
        }
        try {
            const { jobId } = await apiClient.reprocessarAnaliseDiscrepancias(range);
            setJob({ jobId, status: 'running', processed: 0, total: 0, discrepancias: 0 });
        } catch (e) {
            setAlertMessage?.(e.message || 'Erro ao iniciar reprocessamento.');
        }
    };

    const obras = data?.obras || [];

    // Tipos presentes no período (para montar as pills)
    const tiposPresentes = useMemo(() => {
        const set = new Set();
        for (const o of obras) {
            for (const t of Object.keys(o.porTipo || {})) {
                if (o.porTipo[t].qtd > 0) set.add(t);
            }
        }
        return TIPOS_ORDEM.filter(t => set.has(t));
    }, [obras]);

    // Totais por tipo (global) — usados nas pills
    const totaisPorTipo = useMemo(() => {
        const acc = {};
        for (const o of obras) {
            for (const [t, v] of Object.entries(o.porTipo || {})) {
                if (!acc[t]) acc[t] = { qtd: 0, gap: 0, obras: 0 };
                acc[t].qtd  += v.qtd;
                acc[t].gap  += v.gap;
                acc[t].obras += v.qtd > 0 ? 1 : 0;
            }
        }
        return acc;
    }, [obras]);

    // Obras filtradas (e re-ordenadas pelo gap do tipo filtrado, quando há filtro)
    const obrasFiltradas = useMemo(() => {
        if (!tipoFiltro) return obras;
        return obras
            .filter(o => (o.porTipo?.[tipoFiltro]?.qtd || 0) > 0)
            .sort((a, b) =>
                (b.porTipo[tipoFiltro]?.gap || 0) - (a.porTipo[tipoFiltro]?.gap || 0)
            );
    }, [obras, tipoFiltro]);

    // Totais agregados do que está visível
    const totaisVisiveis = useMemo(() => obrasFiltradas.reduce((acc, o) => {
        if (tipoFiltro) {
            return {
                discrepancias: acc.discrepancias + (o.porTipo[tipoFiltro]?.qtd || 0),
                gap: acc.gap + (o.porTipo[tipoFiltro]?.gap || 0),
            };
        }
        return {
            discrepancias: acc.discrepancias + o.totalDiscrepancias,
            gap: acc.gap + o.gapAcumuladoMin,
        };
    }, { discrepancias: 0, gap: 0 }), [obrasFiltradas, tipoFiltro]);

    return (
        <div className="p-6">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-800 mb-1">Divergências Operacionais</h1>
                <p className="text-sm text-slate-500">
                    Obras com lacunas detectadas entre faturamento e atividade do rastreador.
                    Selecione uma obra para investigar.
                </p>
            </div>

            {/* Filtros de data */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex flex-wrap items-end gap-4">
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">De</label>
                    <input
                        type="date"
                        value={range.startDate}
                        onChange={e => setRange(r => ({ ...r, startDate: e.target.value }))}
                        className="border border-slate-300 rounded px-2 py-1 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Até</label>
                    <input
                        type="date"
                        value={range.endDate}
                        onChange={e => setRange(r => ({ ...r, endDate: e.target.value }))}
                        className="border border-slate-300 rounded px-2 py-1 text-sm"
                    />
                </div>
                <button
                    onClick={handleReprocess}
                    disabled={job?.status === 'running' || loading || diffDias > MAX_DIAS}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-slate-600 border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                    title={diffDias > MAX_DIAS ? `Máximo ${MAX_DIAS} dias por reprocessamento` : 'Recalcular discrepâncias do período'}
                >
                    {job?.status === 'running'
                        ? <Loader size={12} className="animate-spin" />
                        : <RefreshCw size={12} />
                    }
                    Reprocessar
                </button>

                {/* Barra de progresso do job */}
                {job && (
                    <div className="flex items-center gap-2 ml-2">
                        {job.status === 'running' && (
                            <>
                                <div className="w-32 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-amber-500 rounded-full transition-all duration-500"
                                        style={{ width: job.total > 0 ? `${Math.round((job.processed / job.total) * 100)}%` : '5%' }}
                                    />
                                </div>
                                <span className="text-xs text-slate-500">
                                    {job.total > 0
                                        ? `${job.processed}/${job.total}`
                                        : 'Iniciando…'}
                                </span>
                            </>
                        )}
                        {job.status === 'done' && (
                            <span className="flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                                <CheckCircle size={12} />
                                {job.discrepancias} discrepâncias — <button className="underline" onClick={() => setJob(null)}>fechar</button>
                            </span>
                        )}
                        {job.status === 'error' && (
                            <span className="flex items-center gap-1 text-xs text-red-600 font-semibold">
                                <XCircle size={12} />
                                Erro: {job.error} — <button className="underline" onClick={() => setJob(null)}>fechar</button>
                            </span>
                        )}
                    </div>
                )}

                {!loading && (
                    <div className="ml-auto flex gap-6 text-xs text-slate-500">
                        <div>
                            <div className="font-bold text-slate-800 text-lg">{obrasFiltradas.length}</div>
                            <div>{tipoFiltro ? 'obras com esse tipo' : 'obras com discrepância'}</div>
                        </div>
                        <div>
                            <div className="font-bold text-slate-800 text-lg">{totaisVisiveis.discrepancias}</div>
                            <div>discrepâncias</div>
                        </div>
                        <div>
                            <div className="font-bold text-amber-700 text-lg">{fmtMin(totaisVisiveis.gap)}</div>
                            <div>gap acumulado</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Pills de filtro por tipo */}
            {tiposPresentes.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                    <FilterPill
                        active={tipoFiltro === null}
                        onClick={() => setTipoFiltro(null)}
                        label="Todos os tipos"
                        count={obras.length}
                    />
                    {tiposPresentes.map(t => {
                        const meta = TIPO_META[t];
                        const total = totaisPorTipo[t];
                        return (
                            <FilterPill
                                key={t}
                                active={tipoFiltro === t}
                                onClick={() => setTipoFiltro(tipoFiltro === t ? null : t)}
                                label={meta.label}
                                count={total.obras}
                                gap={total.gap}
                                dot={meta.dot}
                            />
                        );
                    })}
                </div>
            )}

            {/* Grid de cards */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader className="animate-spin" size={32} style={{ color: '#9E7A42' }} />
                </div>
            ) : obrasFiltradas.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm py-16 text-center">
                    <AlertTriangle className="mx-auto text-slate-300 mb-3" size={42} />
                    <p className="text-slate-500 font-semibold">
                        {tipoFiltro
                            ? 'Nenhuma obra com esse tipo no período.'
                            : 'Nenhuma discrepância no período selecionado.'}
                    </p>
                    <p className="text-slate-400 text-sm mt-1">
                        Tente outro filtro ou amplie o intervalo de datas.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {obrasFiltradas.map(obra => (
                        <ObraCard
                            key={obra.obraId || '__none__'}
                            obra={obra}
                            tipoFiltro={tipoFiltro}
                            onClick={() => onSelectObra({
                                obraId: obra.obraId || '__none__',
                                obraNome: obra.obraNome,
                            })}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const FilterPill = ({ active, onClick, label, count, gap, dot }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            active ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
        }`}
    >
        {dot && <span className={`w-2 h-2 rounded-full ${active ? 'bg-white' : dot}`} />}
        <span>{label}</span>
        <span className={`px-1.5 py-0 rounded-full text-[10px] ${
            active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
        }`}>
            {count}
        </span>
        {gap !== undefined && (
            <span className={`text-[10px] ${active ? 'text-white/80' : 'text-amber-700'}`}>
                {fmtMin(gap)}
            </span>
        )}
    </button>
);

const ObraCard = ({ obra, tipoFiltro, onClick }) => {
    // Linhas a exibir: se há filtro, só o tipo filtrado; senão todos os presentes na obra
    const tiposDaObra = TIPOS_ORDEM.filter(t => obra.porTipo?.[t]?.qtd > 0);
    const tiposExibidos = tipoFiltro
        ? tiposDaObra.filter(t => t === tipoFiltro)
        : tiposDaObra;

    return (
        <button
            onClick={onClick}
            className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all p-4 text-left flex flex-col gap-3 border border-transparent hover:border-amber-300"
        >
            <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-800 text-sm leading-tight line-clamp-2 flex-1">
                    {obra.obraNome}
                </h3>
                <ChevronRight size={16} className="text-slate-400 shrink-0 mt-0.5" />
            </div>

            {/* Breakdown por tipo */}
            <ul className="space-y-1 pt-2 border-t border-slate-100">
                {tiposExibidos.map(t => {
                    const meta = TIPO_META[t];
                    const v = obra.porTipo[t];
                    return (
                        <li key={t} className="flex items-center gap-2 text-xs">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                            <span className="text-slate-600 truncate flex-1">{meta.label}</span>
                            <span className="text-slate-400 text-[10px]">{v.qtd}×</span>
                            <span className={`font-bold ${meta.text} min-w-[44px] text-right`}>
                                {fmtMin(v.gap)}
                            </span>
                        </li>
                    );
                })}
            </ul>

            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-100 uppercase tracking-wide">
                <span>{obra.maquinasEnvolvidas} {obra.maquinasEnvolvidas === 1 ? 'máquina' : 'máquinas'}</span>
                <span className="font-bold text-slate-700 normal-case tracking-normal">
                    Total: {fmtMin(
                        tipoFiltro
                            ? (obra.porTipo[tipoFiltro]?.gap || 0)
                            : obra.gapAcumuladoMin
                    )}
                </span>
            </div>
        </button>
    );
};

export default ObrasOverview;
