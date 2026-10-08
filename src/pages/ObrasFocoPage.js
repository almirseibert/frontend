import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Loader, RefreshCw, Fuel, Gauge, CalendarClock, Shuffle, ArrowRight, Layers } from 'lucide-react';

// Tela de gestão: usada no dia a dia e projetada para o diretor quando
// preciso. Quatro colunas, número grande, nome da obra, nada de prosa — tem que
// ser lida de relance, inclusive de longe. Cada coluna rola por dentro para que
// a página nunca cresça além de uma tela.
//
// Cor é sinal, não decoração: só o número da obra que passou do corte crítico
// fica vermelho, e o corte está escrito no cabeçalho na unidade do indicador.
// Cada obra mostra também os outros indicadores em que aparece — a mesma obra
// em três colunas é a conversa a ter, mais do que qualquer número isolado.
const ICONES = {
    diesel: Fuel,
    ritmo: Gauge,
    duracao: CalendarClock,
    outro_grupo: Shuffle,
};

const ROTULO_CURTO = {
    diesel: 'Diesel',
    ritmo: 'Ritmo',
    duracao: 'Duração',
    outro_grupo: 'Outro grupo',
};

const fmt1 = (v) => (v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const fmtData = (d) => (d ? d.split('-').reverse().slice(0, 2).join('/') : '');

const TONS_CHIP = {
    neutro: 'bg-stone-100 text-stone-600',
    critico: 'bg-red-50 text-red-700',
};

// O que faz uma obra ficar vermelha, dito na unidade do indicador.
const corteCritico = ({ id, escala }) => {
    if (!escala) return null;
    switch (id) {
        case 'diesel': return `acima de ${fmt1(escala.critico)}% da receita`;
        case 'ritmo': return `abaixo de ${fmt1(escala.critico)} h/dia por veículo`;
        case 'duracao': return `acima de ${fmt1(escala.critico)} dias`;
        case 'outro_grupo': return `em curso (lançamento nos últimos ${escala.emCursoDias} dias)`;
        default: return null;
    }
};

const Chip = ({ children, tom = 'neutro' }) => (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums ${TONS_CHIP[tom]}`}>
        {children}
    </span>
);

const Progresso = ({ pct }) => (pct == null ? null : <Chip>obra {Math.round(pct)}%</Chip>);

// O que sustenta o número grande, específico de cada indicador.
const Detalhe = ({ indicadorId, obra }) => {
    switch (indicadorId) {
        case 'diesel':
            return (
                <>
                    <div className="flex flex-wrap gap-1 mt-2">
                        <Chip>{obra.projetado ? 'projetado' : 'medido'}</Chip>
                        {obra.projetado && obra.dieselAtual != null && <Chip>hoje {Math.round(obra.dieselAtual)}%</Chip>}
                        <Progresso pct={obra.percentConcluido} />
                    </div>
                </>
            );
        case 'ritmo':
            return (
                <>
                    <div className="flex flex-wrap gap-1 mt-2">
                        <Chip>{obra.veiculos} veículo{obra.veiculos > 1 ? 's' : ''}</Chip>
                        {obra.horas != null && <Chip>{fmt1(obra.horas)} h apontadas</Chip>}
                        <Progresso pct={obra.percentConcluido} />
                    </div>
                </>
            );
        case 'duracao':
            return (
                <>
                    <div className="flex flex-wrap gap-1 mt-2">
                        {obra.inicio && <Chip>desde {obra.inicio.split('-').reverse().join('/')}</Chip>}
                        <Progresso pct={obra.percentConcluido} />
                    </div>
                </>
            );
        case 'outro_grupo': {
            const pares = obra.pares || [];
            return (
                <ul className="mt-2 space-y-1">
                    {pares.map((p, i) => (
                        <li key={i} className="text-[11px] text-stone-600">
                            <div className="flex items-center gap-1 min-w-0">
                                <span className="font-medium text-stone-800 truncate">
                                    {p.veiculos > 1 ? `${p.veiculos}× ` : ''}{p.grupoVeiculo}
                                </span>
                                <ArrowRight size={11} className="flex-shrink-0 text-stone-400" />
                                <span className="truncate flex-1">{p.itemKey}</span>
                                <span className="tabular-nums font-semibold text-stone-700 whitespace-nowrap">{fmt1(p.horas)} h</span>
                            </div>
                        </li>
                    ))}
                    {obra.ultimoLancamento && (
                        <li className="pt-0.5">
                            <Chip tom={obra.critico ? 'critico' : 'neutro'}>
                                {obra.critico ? 'em curso' : 'último lançamento'} · {fmtData(obra.ultimoLancamento)}
                            </Chip>
                        </li>
                    )}
                </ul>
            );
        }
        default:
            return obra.apoio ? <span className="block text-[11px] text-stone-400 truncate mt-1">{obra.apoio}</span> : null;
    }
};

// Ícones dos indicadores em que a obra (também) aparece.
const Recorrencia = ({ indicadores }) => {
    if (!indicadores || indicadores.length === 0) return null;
    return (
        <span
            className="flex items-center gap-0.5 flex-shrink-0"
            title={`Também em: ${indicadores.map(o => ROTULO_CURTO[o.id] || o.id).join(', ')}`}
        >
            {indicadores.map(o => {
                const Icone = ICONES[o.id] || Gauge;
                return (
                    <span key={o.id} className="p-0.5 rounded bg-stone-100 text-stone-500">
                        <Icone size={11} />
                    </span>
                );
            })}
        </span>
    );
};

const Coluna = ({ indicador, presenca, destaque, setDestaque, onAbrirFicha }) => {
    const Icone = ICONES[indicador.id] || Gauge;
    const vazio = indicador.obras.length === 0;
    const corte = corteCritico(indicador);

    return (
        <section className="bg-white rounded-xl border border-stone-200 flex flex-col overflow-hidden h-[calc(100vh-330px)] min-h-[420px]">
            <header className="px-4 py-3 border-b border-stone-100">
                <div className="flex items-start gap-3">
                    <span className="p-2 rounded-lg flex-shrink-0 bg-stone-100 text-stone-500">
                        <Icone size={18} />
                    </span>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-[15px] font-semibold text-stone-900 leading-tight">{indicador.titulo}</h2>
                        <p className="text-[11px] text-stone-500 mt-0.5 min-h-[30px]">{indicador.criterio}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                        <div className="text-4xl font-bold leading-none tabular-nums text-stone-900">
                            {indicador.total}
                        </div>
                        <div className="text-[10px] text-stone-400 uppercase tracking-wide mt-0.5">obras</div>
                    </div>
                </div>

                {!vazio && corte && (
                    <p className="text-[12px] text-stone-600 mt-2.5 pl-[44px] truncate">
                        <span className={`font-bold tabular-nums ${indicador.criticos > 0 ? 'text-red-600' : 'text-stone-900'}`}>
                            {indicador.criticos}
                        </span>{' '}
                        {corte}
                    </p>
                )}
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto">
                {vazio ? (
                    <p className="text-sm text-stone-400 text-center py-10">Nenhuma obra neste critério.</p>
                ) : (
                    <ul className="divide-y divide-stone-100">
                        {indicador.obras.map(o => {
                            const k = String(o.obraId);
                            const outros = (presenca.get(k) || []).filter(p => p.id !== indicador.id);
                            return (
                                <li key={o.obraId}>
                                    <button
                                        onClick={() => onAbrirFicha && onAbrirFicha(o.obraId)}
                                        onMouseEnter={() => setDestaque(k)}
                                        onMouseLeave={() => setDestaque(null)}
                                        className={`w-full text-left px-4 py-3 transition-colors ${
                                            destaque === k ? 'bg-yellow-50' : 'hover:bg-stone-50'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                                <span className="text-[15px] font-medium text-stone-900 truncate leading-tight">
                                                    {o.obraNome}
                                                </span>
                                                <Recorrencia indicadores={outros} />
                                            </div>
                                            <span className={`text-xl font-bold tabular-nums whitespace-nowrap leading-none ${
                                                o.critico ? 'text-red-600' : 'text-stone-800'
                                            }`}>
                                                {o.rotulo}
                                            </span>
                                        </div>
                                        <Detalhe indicadorId={indicador.id} obra={o} />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

        </section>
    );
};

// Faixa do topo: obras que aparecem em mais de um indicador.
const Recorrentes = ({ lista, destaque, setDestaque, onAbrirFicha }) => {
    if (lista.length === 0) return null;
    return (
        <section className="bg-white rounded-xl border border-stone-200 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
                <Layers size={15} className="text-stone-500" />
                <h2 className="text-[13px] font-semibold text-stone-800">Em mais de um indicador</h2>
                <span className="text-xs font-bold text-stone-900 tabular-nums bg-stone-100 rounded px-1.5">{lista.length}</span>
            </div>
            <div className="flex flex-wrap gap-2 max-h-[76px] overflow-y-auto">
                {lista.map(r => (
                    <button
                        key={r.obraId}
                        onClick={() => onAbrirFicha && onAbrirFicha(r.obraId)}
                        onMouseEnter={() => setDestaque(r.obraId)}
                        onMouseLeave={() => setDestaque(null)}
                        className={`inline-flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-lg border text-[13px] transition-colors ${
                            destaque === r.obraId
                                ? 'border-yellow-300 bg-yellow-50'
                                : 'border-stone-200 hover:bg-stone-50'
                        } text-stone-900`}
                    >
                        <span className="font-medium">{r.obraNome}</span>
                        <Recorrencia indicadores={r.indicadores} />
                    </button>
                ))}
            </div>
        </section>
    );
};

const ObrasFocoPage = ({ apiClient, navigate, navigateToFicha }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [destaque, setDestaque] = useState(null);

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

    // obraId -> indicadores em que a obra aparece, com a gravidade em cada um.
    const presenca = useMemo(() => {
        const mapa = new Map();
        (data?.indicadores || []).forEach(ind => {
            ind.obras.forEach(o => {
                const k = String(o.obraId);
                if (!mapa.has(k)) mapa.set(k, []);
                mapa.get(k).push({ id: ind.id, critico: !!o.critico, obraNome: o.obraNome });
            });
        });
        return mapa;
    }, [data]);

    const recorrentes = useMemo(() => [...presenca.entries()]
        .filter(([, inds]) => inds.length > 1)
        .map(([obraId, inds]) => ({
            obraId,
            obraNome: inds[0].obraNome,
            indicadores: inds,
            criticos: inds.filter(i => i.critico).length,
        }))
        .sort((a, b) => b.indicadores.length - a.indicadores.length
            || b.criticos - a.criticos
            || a.obraNome.localeCompare(b.obraNome, 'pt-BR')),
    [presenca]);

    const abrirFicha = navigateToFicha ? (id) => navigateToFicha(id, 'obras_foco') : null;

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
                            {data.obrasEmProducao} obras em produção · {presenca.size} em algum indicador · atualizado {
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
                <>
                    <Recorrentes lista={recorrentes} destaque={destaque} setDestaque={setDestaque} onAbrirFicha={abrirFicha} />
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        {data.indicadores.map(ind => (
                            <Coluna
                                key={ind.id}
                                indicador={ind}
                                presenca={presenca}
                                destaque={destaque}
                                setDestaque={setDestaque}
                                onAbrirFicha={abrirFicha}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default ObrasFocoPage;
