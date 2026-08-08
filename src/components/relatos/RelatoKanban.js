import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Loader2, ChevronRight, ChevronLeft, AlertTriangle, Clock, Eye } from 'lucide-react';
import { GravidadeBadge } from './GravidadeBadge';
import { ITEM_STATUS, ITEM_STATUS_TERMINAL } from '../../utils/relatoGravidade';

// Acompanhamento dos serviços em execução, nas MESMAS quatro colunas do quadro
// "USO EXCLUSIVO DA MANUTENÇÃO / OFICINA" da ficha FRM-MAN-001.
//
// Os cards são ITENS, não relatos: um equipamento pode ter o freio pronto e a
// mangueira ainda esperando peça, e é isso que a oficina precisa enxergar.
//
// Sem biblioteca de drag-and-drop: os botões < > movem entre colunas. É mais
// confiável no touch dos tablets da oficina e não adiciona dependência.

const COLUNAS = ITEM_STATUS.filter(s => s !== 'Cancelado');

const COLUNA_ESTILO = {
    'Em Análise':      { cabecalho: 'bg-gray-100 text-gray-700', borda: 'border-gray-300' },
    'Aguardando Peça': { cabecalho: 'bg-orange-100 text-orange-800', borda: 'border-orange-300' },
    'Em Execução':     { cabecalho: 'bg-blue-100 text-blue-800', borda: 'border-blue-300' },
    'Concluído':       { cabecalho: 'bg-green-100 text-green-800', borda: 'border-green-300' },
};

const fmtData = (ymd) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('pt-BR') : null);
const hojeYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const RelatoKanban = ({ relatos = [], vehicles = [], apiClient, onAbrirRelato, onChanged, setAlertMessage }) => {
    const [carregando, setCarregando] = useState(true);
    const [movendo, setMovendo] = useState(null);
    const [erro, setErro] = useState('');
    const [detalhes, setDetalhes] = useState([]);

    const veiculoPorId = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles]);

    // A listagem de relatos não traz os itens; o kanban precisa deles.
    const emExecucao = useMemo(
        () => relatos.filter(r => r.status === 'Em Execução').map(r => r.id),
        [relatos]
    );

    const carregar = useCallback(async () => {
        if (emExecucao.length === 0) { setDetalhes([]); setCarregando(false); return; }
        setCarregando(true);
        setErro('');
        try {
            setDetalhes(await Promise.all(emExecucao.map(id => apiClient.getRelatoById(id))));
        } catch (e) {
            setErro(e.message || 'Erro ao carregar os serviços em execução.');
        } finally {
            setCarregando(false);
        }
    }, [apiClient, emExecucao]);

    useEffect(() => { carregar(); }, [carregar]);

    // Achata para cards, carregando o contexto do relato em cada um.
    const cards = useMemo(() => {
        const lista = [];
        for (const r of detalhes) {
            const v = veiculoPorId.get(r.vehicleId);
            for (const item of (r.itens || [])) {
                if (item.status === 'Cancelado') continue;
                lista.push({
                    ...item,
                    relatoId: r.id,
                    relatoNumero: r.numero,
                    osMc: r.osMc,
                    equipamento: r.veiculoFrota || v?.registroInterno || r.veiculoPlaca || '—',
                });
            }
        }
        return lista;
    }, [detalhes, veiculoPorId]);

    const porColuna = useMemo(() => {
        const mapa = Object.fromEntries(COLUNAS.map(c => [c, []]));
        for (const card of cards) {
            if (mapa[card.status]) mapa[card.status].push(card);
        }
        // Mais urgente primeiro: gravidade, depois prazo mais próximo.
        for (const col of COLUNAS) {
            mapa[col].sort((a, b) =>
                String(a.gravidade).localeCompare(String(b.gravidade))
                || String(a.dataConclusaoPrevista || '9999').localeCompare(String(b.dataConclusaoPrevista || '9999'))
            );
        }
        return mapa;
    }, [cards]);

    const mover = async (card, direcao) => {
        const idx = COLUNAS.indexOf(card.status);
        const destino = COLUNAS[idx + direcao];
        if (!destino) return;

        setMovendo(card.id);
        setErro('');
        try {
            await apiClient.updateRelatoItemStatus(card.relatoId, card.id, { status: destino });
            await carregar();
            onChanged?.();
            if (ITEM_STATUS_TERMINAL.includes(destino)) {
                setAlertMessage?.(`Item "${card.itemComponente}" marcado como ${destino.toLowerCase()}.`);
            }
        } catch (e) {
            setErro(e.message || 'Erro ao mover o item.');
        } finally {
            setMovendo(null);
        }
    };

    if (carregando) {
        return (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-12">
                <Loader2 size={16} className="animate-spin" /> Carregando serviços em execução...
            </div>
        );
    }

    if (cards.length === 0) {
        return (
            <div className="text-center text-sm text-gray-400 py-12 bg-white rounded-lg border border-gray-200">
                Nenhum serviço em execução. Feche um relato digitado para gerar as ordens e acompanhar aqui.
            </div>
        );
    }

    const hoje = hojeYmd();

    return (
        <div className="space-y-3">
            {erro && (
                <div className="p-3 bg-red-50 border border-red-300 text-red-800 rounded-lg text-xs font-bold flex items-center gap-2">
                    <AlertTriangle size={14} /> {erro}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {COLUNAS.map(coluna => {
                    const estilo = COLUNA_ESTILO[coluna];
                    const itens = porColuna[coluna];
                    return (
                        <div key={coluna} className={`bg-white rounded-lg border ${estilo.borda} overflow-hidden flex flex-col`}>
                            <div className={`px-3 py-2 ${estilo.cabecalho} flex items-center justify-between`}>
                                <span className="text-xs font-bold uppercase tracking-wide">{coluna}</span>
                                <span className="text-xs font-bold bg-white/60 px-1.5 rounded">{itens.length}</span>
                            </div>
                            <div className="p-2 space-y-2 flex-1 min-h-[80px]">
                                {itens.length === 0 && (
                                    <p className="text-[11px] text-gray-300 text-center py-4">Nada aqui</p>
                                )}
                                {itens.map(card => {
                                    const atrasado = card.dataConclusaoPrevista
                                        && card.dataConclusaoPrevista < hoje
                                        && !ITEM_STATUS_TERMINAL.includes(card.status);
                                    return (
                                        <div
                                            key={card.id}
                                            className={`border rounded-lg p-2 space-y-1.5 ${
                                                atrasado ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
                                            }`}
                                        >
                                            <div className="flex items-start gap-1.5">
                                                <GravidadeBadge gravidade={card.gravidade} size="sm" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-medium text-gray-800 leading-tight">{card.itemComponente}</p>
                                                    <p className="text-[10px] text-gray-500 truncate">
                                                        {card.equipamento} · Relato #{card.relatoNumero}
                                                    </p>
                                                </div>
                                            </div>

                                            {card.servicoDescricao && (
                                                <p className="text-[10px] text-gray-500 leading-snug">{card.servicoDescricao}</p>
                                            )}

                                            <div className="flex items-center justify-between gap-1 text-[10px]">
                                                <span className={`flex items-center gap-1 ${atrasado ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                                                    <Clock size={10} />
                                                    {card.dataConclusaoReal
                                                        ? `feito ${fmtData(card.dataConclusaoReal)}`
                                                        : fmtData(card.dataConclusaoPrevista) || 'sem prazo'}
                                                </span>
                                                {card.executorNome && (
                                                    <span className="text-gray-400 truncate max-w-[90px]" title={card.executorNome}>
                                                        {card.executorNome}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between gap-1 pt-1 border-t border-gray-100">
                                                <button
                                                    onClick={() => mover(card, -1)}
                                                    disabled={movendo === card.id || COLUNAS.indexOf(card.status) === 0}
                                                    className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-20"
                                                    title="Voltar etapa"
                                                >
                                                    <ChevronLeft size={13} />
                                                </button>
                                                <button
                                                    onClick={() => onAbrirRelato?.(card.relatoId)}
                                                    className="p-1 rounded hover:bg-blue-50 text-blue-500"
                                                    title="Abrir a ficha"
                                                >
                                                    {movendo === card.id ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                                                </button>
                                                <button
                                                    onClick={() => mover(card, 1)}
                                                    disabled={movendo === card.id || COLUNAS.indexOf(card.status) === COLUNAS.length - 1}
                                                    className="p-1 rounded hover:bg-green-50 text-green-600 disabled:opacity-20"
                                                    title="Avançar etapa"
                                                >
                                                    <ChevronRight size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            <p className="text-[11px] text-gray-400">
                Quando todos os itens de um relato ficam concluídos, o relato fecha e o equipamento
                volta para a frota — desde que não haja outro relato aberto para ele.
            </p>
        </div>
    );
};

export default RelatoKanban;
