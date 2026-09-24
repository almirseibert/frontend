import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Loader, RefreshCw, Fuel, Gauge, CalendarClock } from 'lucide-react';

// Tela de gestão: usada no dia a dia e projetada para o diretor quando
// preciso. Três colunas, número grande, nome da obra, nada de prosa — tem que
// ser lida de relance, inclusive de longe. Cada coluna rola por dentro para que
// a página nunca cresça além de uma tela.
const ICONES = {
    diesel: Fuel,
    ritmo: Gauge,
    duracao: CalendarClock,
};

const Coluna = ({ indicador, onAbrirFicha }) => {
    const Icone = ICONES[indicador.id] || Gauge;
    const vazio = indicador.obras.length === 0;

    return (
        <section className="bg-white rounded-xl border border-stone-200 flex flex-col overflow-hidden">
            <header className="px-4 py-3 border-b border-stone-100 flex items-start gap-3">
                <span className={`p-2 rounded-lg flex-shrink-0 ${
                    indicador.criticos > 0 ? 'bg-red-50 text-red-600' : 'bg-stone-100 text-stone-500'
                }`}>
                    <Icone size={18} />
                </span>
                <div className="flex-1 min-w-0">
                    <h2 className="text-[15px] font-semibold text-stone-900 leading-tight">{indicador.titulo}</h2>
                    <p className="text-[11px] text-stone-500 mt-0.5">{indicador.criterio}</p>
                </div>
                <div className="text-right flex-shrink-0">
                    <div className={`text-3xl font-bold leading-none ${
                        indicador.criticos > 0 ? 'text-red-600' : 'text-stone-900'
                    }`}>
                        {indicador.total}
                    </div>
                    <div className="text-[10px] text-stone-400 uppercase tracking-wide mt-0.5">obras</div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto max-h-[calc(100vh-300px)] min-h-[140px]">
                {vazio ? (
                    <p className="text-sm text-stone-400 text-center py-10">Nenhuma obra neste critério.</p>
                ) : (
                    <ul className="divide-y divide-stone-100">
                        {indicador.obras.map(o => (
                            <li key={o.obraId}>
                                <button
                                    onClick={() => onAbrirFicha && onAbrirFicha(o.obraId)}
                                    className="w-full text-left px-4 py-2.5 hover:bg-stone-50 transition-colors flex items-center gap-3"
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                        o.critico ? 'bg-red-500' : 'bg-amber-400'
                                    }`} />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-[15px] text-stone-900 truncate leading-tight">
                                            {o.obraNome}
                                        </span>
                                        <span className="block text-[11px] text-stone-400 truncate">{o.apoio}</span>
                                    </span>
                                    <span className={`text-lg font-bold tabular-nums whitespace-nowrap ${
                                        o.critico ? 'text-red-600' : 'text-stone-700'
                                    }`}>
                                        {o.rotulo}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
};

const ObrasFocoPage = ({ apiClient, navigate, navigateToFicha }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        try {
            setError(null);
            setLoading(true);
            setData(await apiClient.getDashboardObrasFoco());
        } catch (e) {
            console.error('Erro carregando obras em foco:', e);
            setError(e.message || 'Erro ao carregar o painel.');
        } finally {
            setLoading(false);
        }
    }, [apiClient]);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="space-y-3 pb-4">
            <header className="flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-baseline gap-3 flex-wrap">
                    <button
                        onClick={() => navigate && navigate('dashboard')}
                        className="text-xs text-stone-500 hover:text-stone-800 inline-flex items-center gap-1"
                    >
                        <ArrowLeft size={12} /> Painel
                    </button>
                    <h1 className="text-xl font-semibold text-stone-900">Obras em foco</h1>
                    {data && (
                        <span className="text-xs text-stone-500">
                            {data.obrasEmProducao} obras em produção · atualizado {
                                new Date(data.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                            }
                        </span>
                    )}
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-2 disabled:opacity-50"
                >
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar
                </button>
            </header>

            {loading && !data && (
                <div className="flex items-center justify-center py-20 text-stone-500">
                    <Loader size={20} className="animate-spin mr-2" /> Carregando…
                </div>
            )}

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                    {error} <button onClick={load} className="underline ml-2">Tentar novamente</button>
                </div>
            )}

            {data && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
                    {data.indicadores.map(ind => (
                        <Coluna
                            key={ind.id}
                            indicador={ind}
                            onAbrirFicha={navigateToFicha ? (id) => navigateToFicha(id, 'obras_foco') : null}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default ObrasFocoPage;
