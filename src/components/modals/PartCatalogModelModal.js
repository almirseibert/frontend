import React, { useState } from 'react';
import { X, Loader } from 'lucide-react';

const CATEGORIA_VEICULO = [
    { value: '', label: '—' },
    { value: 'caminhao', label: 'Caminhão' },
    { value: 'maquina', label: 'Máquina pesada' },
    { value: 'leve', label: 'Leve' },
];

const PartCatalogModelModal = ({ model, apiClient, onClose, onSaved, setAlertMessage }) => {
    const isEdit = Boolean(model?.id);
    const [form, setForm] = useState({
        marca: model?.marca || '',
        modelo: model?.modelo || '',
        variante: model?.variante || '',
        categoria_veiculo: model?.categoria_veiculo || '',
        ano_inicio: model?.ano_inicio ?? '',
        ano_fim: model?.ano_fim ?? '',
        fonte: model?.fonte || '',
        observacoes: model?.observacoes || '',
    });
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.marca.trim() || !form.modelo.trim()) {
            setAlertMessage?.('Marca e modelo são obrigatórios.');
            return;
        }
        setSaving(true);
        try {
            const toIntOrNull = (v) => (v === '' || v == null ? null : (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : null));
            const payload = {
                ...form,
                ano_inicio: toIntOrNull(form.ano_inicio),
                ano_fim: toIntOrNull(form.ano_fim),
            };
            if (isEdit) {
                await apiClient.partCatalog.updateModel(model.id, payload);
            } else {
                await apiClient.partCatalog.createModel(payload);
            }
            onSaved?.();
            onClose();
        } catch (err) {
            setAlertMessage?.(err.message || 'Erro ao salvar o modelo.');
        } finally {
            setSaving(false);
        }
    };

    const inputCls = 'w-full p-2 border rounded focus:ring-2 focus:ring-yellow-400 outline-none text-sm';
    const labelCls = 'block text-xs font-semibold text-gray-600 mb-1';

    return (
        <div className="mak-modal-backdrop backdrop-blur-sm" style={{ zIndex: 60 }}>
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
                <div className="mak-modal-header">
                    <h2 className="mak-modal-title">{isEdit ? 'Editar modelo' : 'Novo modelo'}</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 text-gray-500" disabled={saving}><X size={22} /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>Marca *</label>
                            <input className={inputCls} value={form.marca} onChange={e => set('marca', e.target.value)} placeholder="Ex.: XCMG" />
                        </div>
                        <div>
                            <label className={labelCls}>Modelo *</label>
                            <input className={inputCls} value={form.modelo} onChange={e => set('modelo', e.target.value)} placeholder="Ex.: LW300" />
                        </div>
                        <div>
                            <label className={labelCls}>Variante</label>
                            <input className={inputCls} value={form.variante} onChange={e => set('variante', e.target.value)} placeholder="Ex.: Pá carregadeira" />
                        </div>
                        <div>
                            <label className={labelCls}>Categoria do veículo</label>
                            <select className={inputCls} value={form.categoria_veiculo} onChange={e => set('categoria_veiculo', e.target.value)}>
                                {CATEGORIA_VEICULO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Ano início</label>
                            <input type="number" className={inputCls} value={form.ano_inicio} onChange={e => set('ano_inicio', e.target.value)} placeholder="Ex.: 2015" />
                        </div>
                        <div>
                            <label className={labelCls}>Ano fim</label>
                            <input type="number" className={inputCls} value={form.ano_fim} onChange={e => set('ano_fim', e.target.value)} placeholder="Deixe vazio se atual" />
                        </div>
                    </div>

                    <div>
                        <label className={labelCls}>Fonte</label>
                        <input className={inputCls} value={form.fonte} onChange={e => set('fonte', e.target.value)} placeholder="Manual, catálogo do fabricante…" />
                    </div>
                    <div>
                        <label className={labelCls}>Observações</label>
                        <textarea className={inputCls} rows={2} value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
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

export default PartCatalogModelModal;
