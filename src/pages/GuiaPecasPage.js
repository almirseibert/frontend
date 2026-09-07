import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Plus, Edit2, Trash2, Package, Loader, Filter, Droplet, Wrench, ChevronRight } from 'lucide-react';
import { canUserAccessPage } from '../utils/permissions';
import PartCatalogModelModal from '../components/modals/PartCatalogModelModal';
import PartCatalogItemModal, { CATEGORIAS, categoriaLabel, STATUS_META } from '../components/modals/PartCatalogItemModal';

const GRUPOS = [
    { id: 'filtros', label: 'Filtros', icon: Filter },
    { id: 'oleos', label: 'Óleos & Fluidos', icon: Droplet },
    { id: 'outros', label: 'Outros', icon: Wrench },
];
const grupoDaCategoria = (cat) => CATEGORIAS.find(c => c.value === cat)?.grupo || 'outros';

const formatIntervalo = (it) => {
    const parts = [];
    if (it.intervalo_km) parts.push(`${Number(it.intervalo_km).toLocaleString('pt-BR')} km`);
    if (it.intervalo_horas) parts.push(`${Number(it.intervalo_horas).toLocaleString('pt-BR')} h`);
    if (it.intervalo_meses) parts.push(`${it.intervalo_meses} ${it.intervalo_meses === 1 ? 'mês' : 'meses'}`);
    return parts.join(' / ');
};

const StatusBadge = ({ status }) => {
    const meta = STATUS_META[status] || STATUS_META.referencia;
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${meta.badge}`}>{meta.label}</span>;
};

const GuiaPecasPage = ({ apiClient, socket, setAlertMessage, user, vehicles = [], initialFilter }) => {
    const canManage = useMemo(() => canUserAccessPage(user, 'guia_pecas'), [user]);

    const [search, setSearch] = useState({ q: '', marca: '', modelo: '', ano: '' });
    const [models, setModels] = useState([]);
    const [loadingList, setLoadingList] = useState(false);

    const [selectedId, setSelectedId] = useState(null);
    const [detail, setDetail] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    const [modelModal, setModelModal] = useState(null);   // { model } | { model: null } (novo)
    const [itemModal, setItemModal] = useState(null);     // { item, modelId }

    const fetchModels = useCallback(async () => {
        setLoadingList(true);
        try {
            const params = {
                q: search.q || undefined,
                marca: search.marca || undefined,
                modelo: search.modelo || undefined,
                ano: search.ano || undefined,
            };
            const data = await apiClient.partCatalog.getModels(params);
            setModels(Array.isArray(data) ? data : []);
        } catch (err) {
            setAlertMessage?.(err.message || 'Erro ao buscar modelos.');
        } finally {
            setLoadingList(false);
        }
    }, [apiClient, search, setAlertMessage]);

    const fetchDetail = useCallback(async (id) => {
        if (!id) { setDetail(null); return; }
        setLoadingDetail(true);
        try {
            const data = await apiClient.partCatalog.getModel(id);
            setDetail(data);
        } catch (err) {
            setAlertMessage?.(err.message || 'Erro ao carregar o modelo.');
        } finally {
            setLoadingDetail(false);
        }
    }, [apiClient, setAlertMessage]);

    // Busca ao montar e quando os filtros mudam (debounce simples).
    useEffect(() => {
        const t = setTimeout(fetchModels, 250);
        return () => clearTimeout(t);
    }, [fetchModels]);

    // Pré-filtro por veículo (vindo da ficha do veículo → "abrir guia completo").
    useEffect(() => {
        if (initialFilter?.vehicleId) {
            const v = vehicles.find(x => String(x.id) === String(initialFilter.vehicleId));
            if (v) setSearch(s => ({ ...s, marca: v.marca || '', modelo: v.modelo || '', q: '' }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialFilter?.vehicleId]);

    useEffect(() => { fetchDetail(selectedId); }, [selectedId, fetchDetail]);

    // Socket: recarrega lista + detalhe quando o catálogo muda em qualquer cliente.
    useEffect(() => {
        if (!socket) return;
        const handler = ({ targets } = {}) => {
            if (Array.isArray(targets) && targets.includes('partCatalog')) {
                fetchModels();
                if (selectedId) fetchDetail(selectedId);
            }
        };
        socket.on('server:sync', handler);
        return () => socket.off('server:sync', handler);
    }, [socket, fetchModels, fetchDetail, selectedId]);

    const handleDeleteModel = async (model) => {
        if (!window.confirm(`Excluir o modelo "${model.marca} ${model.modelo}" e todos os seus itens?`)) return;
        try {
            await apiClient.partCatalog.deleteModel(model.id);
            if (selectedId === model.id) { setSelectedId(null); setDetail(null); }
            fetchModels();
        } catch (err) {
            setAlertMessage?.(err.message || 'Erro ao excluir o modelo.');
        }
    };

    const handleDeleteItem = async (it) => {
        if (!window.confirm(`Excluir o item "${it.descricao}"?`)) return;
        try {
            await apiClient.partCatalog.deleteItem(it.id);
            fetchDetail(selectedId);
        } catch (err) {
            setAlertMessage?.(err.message || 'Erro ao excluir o item.');
        }
    };

    const itensAgrupados = useMemo(() => {
        const items = detail?.items || [];
        const map = { filtros: [], oleos: [], outros: [] };
        items.forEach(it => { map[grupoDaCategoria(it.categoria)].push(it); });
        return map;
    }, [detail]);

    return (
        <div className="p-4 md:p-6 h-full flex flex-col">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <Package className="text-yellow-500" size={22} />
                    <h1 className="text-xl font-bold text-gray-800">Guia de Peças e Reposição</h1>
                </div>
                {canManage && (
                    <button onClick={() => setModelModal({ model: null })}
                        className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-2 rounded-lg text-sm font-bold">
                        <Plus size={16} /> Novo modelo
                    </button>
                )}
            </div>

            {/* Busca */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                <div className="relative col-span-2 md:col-span-1">
                    <Search size={15} className="absolute left-2.5 top-2.5 text-gray-400" />
                    <input className="w-full pl-8 p-2 border rounded text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                        placeholder="Buscar (marca/modelo)" value={search.q}
                        onChange={e => setSearch(s => ({ ...s, q: e.target.value }))} />
                </div>
                <input className="p-2 border rounded text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                    placeholder="Marca" value={search.marca} onChange={e => setSearch(s => ({ ...s, marca: e.target.value }))} />
                <input className="p-2 border rounded text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                    placeholder="Modelo" value={search.modelo} onChange={e => setSearch(s => ({ ...s, modelo: e.target.value }))} />
                <input type="number" className="p-2 border rounded text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                    placeholder="Ano" value={search.ano} onChange={e => setSearch(s => ({ ...s, ano: e.target.value }))} />
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 min-h-0">
                {/* Lista de modelos */}
                <div className="md:col-span-1 bg-white rounded-lg border border-gray-200 overflow-y-auto">
                    {loadingList ? (
                        <div className="flex justify-center items-center h-32 text-gray-400"><Loader className="animate-spin" size={20} /></div>
                    ) : models.length === 0 ? (
                        <div className="p-6 text-center text-sm text-gray-400">Nenhum modelo encontrado.</div>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {models.map(m => (
                                <li key={m.id}>
                                    <button onClick={() => setSelectedId(m.id)}
                                        className={`w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-yellow-50 transition ${selectedId === m.id ? 'bg-yellow-50 border-l-4 border-yellow-500' : ''}`}>
                                        <div className="min-w-0">
                                            <div className="font-semibold text-sm text-gray-800 truncate">{m.marca} {m.modelo}</div>
                                            <div className="text-xs text-gray-500 truncate">
                                                {[m.variante, m.ano_inicio ? `${m.ano_inicio}${m.ano_fim ? `–${m.ano_fim}` : '+'}` : null].filter(Boolean).join(' · ') || '—'}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{m.itemCount} itens</span>
                                            <ChevronRight size={14} className="text-gray-300" />
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Detalhe do modelo */}
                <div className="md:col-span-2 bg-white rounded-lg border border-gray-200 overflow-y-auto">
                    {!selectedId ? (
                        <div className="p-8 text-center text-sm text-gray-400">Selecione um modelo para ver as peças.</div>
                    ) : loadingDetail ? (
                        <div className="flex justify-center items-center h-40 text-gray-400"><Loader className="animate-spin" size={22} /></div>
                    ) : detail ? (
                        <div className="p-4">
                            <div className="flex items-start justify-between mb-4 pb-3 border-b border-gray-100">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-800">{detail.marca} {detail.modelo}</h2>
                                    <p className="text-xs text-gray-500">
                                        {[detail.variante, detail.categoria_veiculo, detail.ano_inicio ? `${detail.ano_inicio}${detail.ano_fim ? `–${detail.ano_fim}` : '+'}` : null].filter(Boolean).join(' · ')}
                                    </p>
                                    {detail.observacoes && <p className="text-xs text-gray-400 mt-1 italic">{detail.observacoes}</p>}
                                </div>
                                {canManage && (
                                    <div className="flex gap-1.5 shrink-0">
                                        <button onClick={() => setItemModal({ item: null, modelId: detail.id })}
                                            className="flex items-center gap-1 bg-yellow-500 hover:bg-yellow-600 text-white px-2.5 py-1.5 rounded text-xs font-bold">
                                            <Plus size={14} /> Item
                                        </button>
                                        <button onClick={() => setModelModal({ model: detail })} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"><Edit2 size={15} /></button>
                                        <button onClick={() => handleDeleteModel(detail)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={15} /></button>
                                    </div>
                                )}
                            </div>

                            {(detail.items || []).length === 0 ? (
                                <p className="text-sm text-gray-400 py-6 text-center">Nenhum item cadastrado neste modelo.</p>
                            ) : GRUPOS.map(g => {
                                const list = itensAgrupados[g.id];
                                if (!list || list.length === 0) return null;
                                const Icon = g.icon;
                                return (
                                    <div key={g.id} className="mb-5">
                                        <div className="flex items-center gap-1.5 mb-2 text-gray-700">
                                            <Icon size={15} className="text-yellow-600" />
                                            <h3 className="text-sm font-bold uppercase tracking-wide">{g.label}</h3>
                                        </div>
                                        <div className="space-y-2">
                                            {list.map(it => (
                                                <div key={it.id} className="border border-gray-100 rounded-lg p-2.5 hover:border-yellow-200 transition">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-semibold text-sm text-gray-800">{it.descricao}</span>
                                                                <StatusBadge status={it.status_validacao} />
                                                                <span className="text-[10px] text-gray-400">{categoriaLabel(it.categoria)}</span>
                                                            </div>
                                                            <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                                                                {it.especificacao && <span><strong>Spec:</strong> {it.especificacao}</span>}
                                                                {it.capacidade && <span><strong>Cap.:</strong> {it.capacidade}</span>}
                                                                {it.quantidade && <span><strong>Qtd.:</strong> {it.quantidade}</span>}
                                                                {it.codigo_oem && <span><strong>OEM:</strong> {it.codigo_oem}</span>}
                                                                {formatIntervalo(it) && <span><strong>Troca:</strong> {formatIntervalo(it)}</span>}
                                                            </div>
                                                            {Array.isArray(it.codigos_equivalentes) && it.codigos_equivalentes.length > 0 && (
                                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                                    {it.codigos_equivalentes.map((eq, i) => (
                                                                        <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                                                            {eq.marca}{eq.marca && eq.codigo ? ' ' : ''}{eq.codigo}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {canManage && (
                                                            <div className="flex gap-1 shrink-0">
                                                                <button onClick={() => setItemModal({ item: it, modelId: detail.id })} className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"><Edit2 size={14} /></button>
                                                                <button onClick={() => handleDeleteItem(it)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
            </div>

            {modelModal && (
                <PartCatalogModelModal
                    model={modelModal.model}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    onClose={() => setModelModal(null)}
                    onSaved={() => { fetchModels(); if (selectedId) fetchDetail(selectedId); }}
                />
            )}
            {itemModal && (
                <PartCatalogItemModal
                    item={itemModal.item}
                    modelId={itemModal.modelId}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    onClose={() => setItemModal(null)}
                    onSaved={() => fetchDetail(selectedId)}
                />
            )}
        </div>
    );
};

export default GuiaPecasPage;
