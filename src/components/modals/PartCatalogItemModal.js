import React, { useState } from 'react';
import { X, Loader, Plus, Trash2 } from 'lucide-react';

// Catálogo de categorias do Guia de Peças. Exportado para a página agrupar/rotular.
export const CATEGORIAS = [
    { value: 'filtro_oleo',            label: 'Filtro de óleo',              grupo: 'filtros' },
    { value: 'filtro_ar',              label: 'Filtro de ar',                grupo: 'filtros' },
    { value: 'filtro_combustivel',     label: 'Filtro de combustível',       grupo: 'filtros' },
    { value: 'filtro_separador_agua',  label: 'Filtro separador de água',    grupo: 'filtros' },
    { value: 'filtro_cabine',          label: 'Filtro de cabine',            grupo: 'filtros' },
    { value: 'filtro_hidraulico',      label: 'Filtro hidráulico',           grupo: 'filtros' },
    { value: 'filtro_transmissao',     label: 'Filtro de transmissão',       grupo: 'filtros' },
    { value: 'oleo_motor',             label: 'Óleo do motor',               grupo: 'oleos' },
    { value: 'oleo_hidraulico',        label: 'Óleo hidráulico',             grupo: 'oleos' },
    { value: 'oleo_transmissao',       label: 'Óleo da transmissão',         grupo: 'oleos' },
    { value: 'oleo_diferencial',       label: 'Óleo do diferencial',         grupo: 'oleos' },
    { value: 'fluido_arrefecimento',   label: 'Fluido de arrefecimento',     grupo: 'oleos' },
    { value: 'arla32',                 label: 'ARLA 32',                     grupo: 'oleos' },
    { value: 'correia',                label: 'Correia',                     grupo: 'outros' },
    { value: 'pastilha_freio',         label: 'Pastilha de freio',           grupo: 'outros' },
    { value: 'bateria',                label: 'Bateria',                     grupo: 'outros' },
    { value: 'pneu',                   label: 'Pneu',                        grupo: 'outros' },
    { value: 'outro',                  label: 'Outro',                       grupo: 'outros' },
];

export const categoriaLabel = (value) =>
    CATEGORIAS.find(c => c.value === value)?.label || value || '—';

export const STATUS_META = {
    referencia: { label: 'Referência', badge: 'bg-yellow-100 text-yellow-800 border border-yellow-300' },
    confirmado: { label: 'Confirmado', badge: 'bg-green-100 text-green-800 border border-green-300' },
    revisar:    { label: 'Revisar',    badge: 'bg-red-100 text-red-800 border border-red-300' },
};

// modelId ou vehicleId identificam onde o item será gravado (um ou outro).
const PartCatalogItemModal = ({ item, modelId, vehicleId, apiClient, onClose, onSaved, setAlertMessage }) => {
    const isEdit = Boolean(item?.id);
    const [form, setForm] = useState({
        categoria: item?.categoria || 'filtro_oleo',
        descricao: item?.descricao || '',
        especificacao: item?.especificacao || '',
        capacidade: item?.capacidade || '',
        quantidade: item?.quantidade || '',
        codigo_oem: item?.codigo_oem || '',
        intervalo_km: item?.intervalo_km ?? '',
        intervalo_horas: item?.intervalo_horas ?? '',
        intervalo_meses: item?.intervalo_meses ?? '',
        status_validacao: item?.status_validacao || 'referencia',
        fonte: item?.fonte || '',
        observacoes: item?.observacoes || '',
    });
    const [equivalentes, setEquivalentes] = useState(
        Array.isArray(item?.codigos_equivalentes) ? item.codigos_equivalentes.map(e => ({ marca: e.marca || '', codigo: e.codigo || '' })) : []
    );
    const [saving, setSaving] = useState(false);

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const addEq = () => setEquivalentes(prev => [...prev, { marca: '', codigo: '' }]);
    const setEq = (i, k, v) => setEquivalentes(prev => prev.map((e, idx) => idx === i ? { ...e, [k]: v } : e));
    const rmEq = (i) => setEquivalentes(prev => prev.filter((_, idx) => idx !== i));

    const toIntOrNull = (v) => {
        if (v === '' || v == null) return null;
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.descricao.trim()) {
            setAlertMessage?.('Informe a descrição do item.');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                ...form,
                intervalo_km: toIntOrNull(form.intervalo_km),
                intervalo_horas: toIntOrNull(form.intervalo_horas),
                intervalo_meses: toIntOrNull(form.intervalo_meses),
                codigos_equivalentes: equivalentes.filter(e => e.marca.trim() || e.codigo.trim()),
            };
            if (isEdit) {
                await apiClient.partCatalog.updateItem(item.id, payload);
            } else {
                await apiClient.partCatalog.createItem({ ...payload, model_id: modelId || null, vehicle_id: vehicleId || null });
            }
            onSaved?.();
            onClose();
        } catch (err) {
            setAlertMessage?.(err.message || 'Erro ao salvar o item.');
        } finally {
            setSaving(false);
        }
    };

    const inputCls = 'w-full p-2 border rounded focus:ring-2 focus:ring-yellow-400 outline-none text-sm';
    const labelCls = 'block text-xs font-semibold text-gray-600 mb-1';

    return (
        <div className="mak-modal-backdrop backdrop-blur-sm" style={{ zIndex: 60 }}>
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
                <div className="mak-modal-header">
                    <h2 className="mak-modal-title">{isEdit ? 'Editar item' : 'Novo item'}</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 text-gray-500" disabled={saving}><X size={22} /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>Categoria *</label>
                            <select className={inputCls} value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Status de validação</label>
                            <select className={inputCls} value={form.status_validacao} onChange={e => set('status_validacao', e.target.value)}>
                                <option value="referencia">Referência (a validar)</option>
                                <option value="confirmado">Confirmado (manual oficial)</option>
                                <option value="revisar">Revisar</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className={labelCls}>Descrição *</label>
                        <input className={inputCls} value={form.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Ex.: Filtro de óleo — Tecfil PEL726" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>Especificação</label>
                            <input className={inputCls} value={form.especificacao} onChange={e => set('especificacao', e.target.value)} placeholder="Ex.: 15W-40 API CI-4" />
                        </div>
                        <div>
                            <label className={labelCls}>Código OEM</label>
                            <input className={inputCls} value={form.codigo_oem} onChange={e => set('codigo_oem', e.target.value)} placeholder="Número original, se conhecido" />
                        </div>
                        <div>
                            <label className={labelCls}>Capacidade</label>
                            <input className={inputCls} value={form.capacidade} onChange={e => set('capacidade', e.target.value)} placeholder="Ex.: 28 L" />
                        </div>
                        <div>
                            <label className={labelCls}>Quantidade</label>
                            <input className={inputCls} value={form.quantidade} onChange={e => set('quantidade', e.target.value)} placeholder="Ex.: 2 un" />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className={labelCls}>Intervalo (km)</label>
                            <input type="number" min="0" className={inputCls} value={form.intervalo_km} onChange={e => set('intervalo_km', e.target.value)} />
                        </div>
                        <div>
                            <label className={labelCls}>Intervalo (horas)</label>
                            <input type="number" min="0" className={inputCls} value={form.intervalo_horas} onChange={e => set('intervalo_horas', e.target.value)} />
                        </div>
                        <div>
                            <label className={labelCls}>Intervalo (meses)</label>
                            <input type="number" min="0" className={inputCls} value={form.intervalo_meses} onChange={e => set('intervalo_meses', e.target.value)} />
                        </div>
                    </div>

                    {/* Equivalentes aftermarket */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className={labelCls} style={{ marginBottom: 0 }}>Equivalentes (aftermarket)</label>
                            <button type="button" onClick={addEq} className="text-xs flex items-center gap-1 text-yellow-700 hover:text-yellow-800 font-semibold">
                                <Plus size={14} /> Adicionar
                            </button>
                        </div>
                        <div className="space-y-2">
                            {equivalentes.length === 0 && (
                                <p className="text-xs text-gray-400 italic">Nenhum equivalente cadastrado.</p>
                            )}
                            {equivalentes.map((eq, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                    <input className={inputCls} placeholder="Marca (ex.: Mann)" value={eq.marca} onChange={e => setEq(i, 'marca', e.target.value)} />
                                    <input className={inputCls} placeholder="Código (ex.: W950)" value={eq.codigo} onChange={e => setEq(i, 'codigo', e.target.value)} />
                                    <button type="button" onClick={() => rmEq(i)} className="p-2 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>Fonte</label>
                            <input className={inputCls} value={form.fonte} onChange={e => set('fonte', e.target.value)} placeholder="Manual, catálogo, nota fiscal…" />
                        </div>
                        <div>
                            <label className={labelCls}>Observações</label>
                            <input className={inputCls} value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
                        </div>
                    </div>

                    <div className="mak-modal-footer" style={{ paddingLeft: 0, paddingRight: 0 }}>
                        <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-semibold">Cancelar</button>
                        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-bold flex items-center gap-2">
                            {saving && <Loader size={16} className="animate-spin" />} Salvar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PartCatalogItemModal;
