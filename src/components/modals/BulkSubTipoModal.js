import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader, Check, AlertTriangle, Layers } from 'lucide-react';

// Cadastro de SUBGRUPO em lote.
//
// O plano de trabalho das obras é escrito em subgrupo, mas a maior parte da
// frota está cadastrada só até o grupo — por isso a execução não encontra o item
// do plano e a obra aparece com 0% naquele item. Corrigir de um em um são
// dezenas de aberturas de modal por grupo; na prática não acontece.
//
// O fluxo aqui é: escolher o grupo → ver quem está sem subgrupo → marcar →
// aplicar. A lista de subgrupos vem restrita ao grupo escolhido, então não dá
// para reintroduzir a inconsistência pela própria tela de correção.

const BulkSubTipoModal = ({ vehicles = [], onClose, apiClient, setAlertMessage, reloadData }) => {
    const [taxonomia, setTaxonomia] = useState([]);
    const [subgrupos, setSubgrupos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);

    const [grupo, setGrupo] = useState('');
    const [subEscolhido, setSubEscolhido] = useState('');
    const [soSemSubgrupo, setSoSemSubgrupo] = useState(true);
    const [marcados, setMarcados] = useState(() => new Set());

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const [tree, subs] = await Promise.all([
                    apiClient.getVehicleTaxonomy(),
                    apiClient.getVehicleSubTypes(),
                ]);
                if (!vivo) return;
                setTaxonomia(Array.isArray(tree) ? tree : []);
                setSubgrupos(Array.isArray(subs) ? subs : []);
            } catch (e) {
                if (vivo) setErro(e.message || 'Erro ao carregar a taxonomia.');
            } finally {
                if (vivo) setLoading(false);
            }
        })();
        return () => { vivo = false; };
    }, [apiClient]);

    const gruposTaxonomia = useMemo(
        () => taxonomia.flatMap(c => (c.tipos || []).map(t => ({ id: t.id, nome: t.nome, categoria: c.nome }))),
        [taxonomia]
    );
    const grupoAtual = useMemo(
        () => gruposTaxonomia.find(g => g.nome === grupo) || null,
        [gruposTaxonomia, grupo]
    );

    // Só os subgrupos vinculados ao grupo escolhido — é a regra da taxonomia
    // aplicada na origem, em vez de erro depois do envio.
    const subsDoGrupo = useMemo(() => {
        if (!grupoAtual) return [];
        return subgrupos.filter(s => (s.grupos || []).includes(grupoAtual.id));
    }, [subgrupos, grupoAtual]);

    // Sucata e inativos ficam de fora: a listagem principal os esconde atras de
    // toggles, entao "Marcar todos" os pegaria sem ninguem ver. Classificar uma
    // sucata infla a contagem por subgrupo — justamente o numero que a tela de
    // taxonomia usa para decidir se um subgrupo pode ser excluido.
    const elegivel = (v) => v.status !== 'Sucata' && v.ativo !== 0 && v.ativo !== false;

    const daFrotaDoGrupo = useMemo(
        () => vehicles.filter(v => v.tipo === grupo && elegivel(v)),
        [vehicles, grupo]
    );
    const excluidosPorStatus = useMemo(
        () => vehicles.filter(v => v.tipo === grupo && !elegivel(v)).length,
        [vehicles, grupo]
    );

    const candidatos = useMemo(() => {
        if (!grupo) return [];
        return daFrotaDoGrupo
            .filter(v => (soSemSubgrupo ? !v.sub_tipo : true))
            .sort((a, b) => String(a.registroInterno || a.placa || '')
                .localeCompare(String(b.registroInterno || b.placa || ''), 'pt-BR'));
    }, [daFrotaDoGrupo, grupo, soSemSubgrupo]);

    const semSubgrupoNoGrupo = useMemo(
        () => daFrotaDoGrupo.filter(v => !v.sub_tipo).length,
        [daFrotaDoGrupo]
    );

    const trocarGrupo = (nome) => {
        setGrupo(nome);
        setSubEscolhido('');
        setMarcados(new Set());
    };
    const alternar = (id) => setMarcados(prev => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id); else s.add(id);
        return s;
    });
    const marcarTodos = () => setMarcados(
        marcados.size === candidatos.length ? new Set() : new Set(candidatos.map(v => v.id))
    );

    const aplicar = async () => {
        if (!subEscolhido || marcados.size === 0) return;
        setSalvando(true);
        setErro('');
        try {
            const marcadosArr = [...marcados];
            const r = await apiClient.bulkSetVehicleSubTipo({
                ids: marcadosArr,
                sub_tipo: subEscolhido,
            });

            // O servidor informa quantos foram de fato atualizados e quantos ids da
            // selecao ja nao existiam. Fechar dizendo "pronto" quando parte da
            // selecao nao foi tocada deixa o buraco para aparecer depois, como item
            // de plano ainda sem execucao.
            const atualizados = Number(r?.atualizados ?? marcadosArr.length);
            const parcial = atualizados < marcadosArr.length;
            if (parcial) {
                setErro(`${atualizados} de ${marcadosArr.length} veiculos foram atualizados. `
                    + `${marcadosArr.length - atualizados} nao foram encontrados — provavelmente `
                    + 'excluidos em outra sessao. Recarregue e confira antes de fechar.');
                await reloadData?.();
                setMarcados(new Set());
                return;
            }

            setAlertMessage?.(r?.message || 'Subgrupo aplicado.');
            await reloadData?.();
            onClose();
        } catch (e) {
            setErro(e.message || 'Erro ao aplicar o subgrupo.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">

                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                        <Layers size={18} className="text-gray-500" />
                        <h2 className="font-bold text-gray-800">Definir subgrupo em lote</h2>
                    </div>
                    <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700">
                        <X size={18} />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
                        <Loader size={18} className="animate-spin" /> Carregando taxonomia…
                    </div>
                ) : (
                    <>
                        <div className="px-5 py-4 space-y-3 border-b border-gray-200 bg-gray-50">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label htmlFor="bulkGrupo" className="block text-[10px] font-mono uppercase tracking-wider text-gray-400">
                                        Grupo
                                    </label>
                                    <select
                                        id="bulkGrupo" value={grupo} onChange={e => trocarGrupo(e.target.value)}
                                        className="w-full text-sm px-2 py-2 border border-gray-300 rounded bg-white"
                                    >
                                        <option value="">Selecione…</option>
                                        {gruposTaxonomia.map(g => (
                                            <option key={g.id} value={g.nome}>{g.nome} · {g.categoria}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label htmlFor="bulkSub" className="block text-[10px] font-mono uppercase tracking-wider text-gray-400">
                                        Subgrupo a aplicar
                                    </label>
                                    <select
                                        id="bulkSub" value={subEscolhido} disabled={!grupo}
                                        onChange={e => setSubEscolhido(e.target.value)}
                                        className="w-full text-sm px-2 py-2 border border-gray-300 rounded bg-white disabled:bg-gray-100"
                                    >
                                        <option value="">Selecione…</option>
                                        {subsDoGrupo.map(s => (
                                            <option key={s.id} value={s.nome}>{s.nome}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {grupo && subsDoGrupo.length === 0 && (
                                <p className="flex items-start gap-2 text-sm text-amber-800">
                                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                                    Nenhum subgrupo está vinculado ao grupo <b>{grupo}</b>. Vincule na aba
                                    Taxonomia de Equipamentos antes de cadastrar em lote.
                                </p>
                            )}

                            {grupo && (
                                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input
                                            type="checkbox" checked={soSemSubgrupo}
                                            onChange={e => { setSoSemSubgrupo(e.target.checked); setMarcados(new Set()); }}
                                            className="accent-amber-700"
                                        />
                                        Mostrar só quem está sem subgrupo
                                    </label>
                                    <span className="text-gray-400 tabular-nums">
                                        {semSubgrupoNoGrupo} de {daFrotaDoGrupo.length} sem subgrupo neste grupo
                                        {excluidosPorStatus > 0 && ` · ${excluidosPorStatus} sucata/inativo fora da lista`}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-3">
                            {!grupo && (
                                <p className="py-10 text-center text-sm text-gray-400 italic">
                                    Escolha um grupo para ver os veículos.
                                </p>
                            )}
                            {grupo && candidatos.length === 0 && (
                                <p className="py-10 text-center text-sm text-gray-400 italic">
                                    Nenhum veículo neste filtro.
                                </p>
                            )}
                            {candidatos.length > 0 && (
                                <>
                                    <button
                                        type="button" onClick={marcarTodos}
                                        className="text-xs font-semibold text-amber-700 hover:text-amber-800 mb-2"
                                    >
                                        {marcados.size === candidatos.length ? 'Desmarcar todos' : `Marcar todos (${candidatos.length})`}
                                    </button>
                                    <ul className="space-y-0.5">
                                        {candidatos.map(v => (
                                            <li key={v.id}>
                                                <label className={`flex items-center gap-3 px-2.5 py-2 rounded border cursor-pointer ${
                                                    marcados.has(v.id) ? 'bg-amber-50 border-amber-200' : 'border-transparent hover:bg-gray-50'
                                                }`}>
                                                    <input
                                                        type="checkbox" checked={marcados.has(v.id)}
                                                        onChange={() => alternar(v.id)}
                                                        className="accent-amber-700"
                                                    />
                                                    <span className="font-mono text-xs text-gray-500 w-16 shrink-0">
                                                        {v.registroInterno || '—'}
                                                    </span>
                                                    <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">
                                                        {v.modelo || '—'}
                                                    </span>
                                                    <span className="font-mono text-xs text-gray-400 shrink-0">{v.placa || ''}</span>
                                                    <span className={`text-xs shrink-0 ${v.sub_tipo ? 'text-gray-500' : 'text-gray-300 italic'}`}>
                                                        {v.sub_tipo || 'sem subgrupo'}
                                                    </span>
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </div>

                        {erro && (
                            <div className="mx-5 mb-3 flex items-start gap-2 p-3 rounded border border-red-200 bg-red-50 text-red-700 text-sm">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {erro}
                            </div>
                        )}

                        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-gray-200 bg-gray-50">
                            <span className="text-xs text-gray-500 tabular-nums">
                                {marcados.size} veículo{marcados.size !== 1 ? 's' : ''} marcado{marcados.size !== 1 ? 's' : ''}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    type="button" onClick={onClose}
                                    className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-600"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button" onClick={aplicar}
                                    disabled={salvando || !subEscolhido || marcados.size === 0}
                                    className="flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded bg-amber-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {salvando ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                                    Aplicar subgrupo
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default BulkSubTipoModal;
