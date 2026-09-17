import React, { useState, useMemo, useEffect } from 'react';
import { Loader, X, Truck, ArrowRightLeft, Trash2, Recycle } from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import { getAllowedReadingTypes, getVehicleMainReading } from '../../utils/vehicleRules';
import { COMBOIO_TANKS, toComboioTankKey } from '../../utils/fuelTypes';
import { todayBRT, withTimeBRT } from '../../utils/dateBRT';

const recDate = (r) => new Date(r?.data || r?.date || 0).getTime();

const DESTINOS = [
    { key: 'comboio', label: 'Comboio', icon: Truck, desc: 'Devolve ao tanque do comboio' },
    { key: 'transfusao', label: 'Transfusão', icon: ArrowRightLeft, desc: 'Abastece outro equipamento' },
    { key: 'eliminado', label: 'Eliminado', icon: Trash2, desc: 'Combustível contaminado, descartado (vira custo da obra)' },
];

const ComboioDrenagemModal = ({
    user,
    vehicles = [],
    defaultComboioId = '',
    onClose,
    setAlertMessage,
    apiClient,
    onSaved,
    reloadData,
}) => {
    const [formData, setFormData] = useState({
        destino: 'comboio',
        drainingVehicleId: '',
        comboioVehicleId: defaultComboioId || '',
        receivingVehicleId: '',
        liters: '',
        date: todayBRT(),
        fuelType: '',
        reason: '',
        odometro: '',
        horimetro: '',
    });
    const [isSaving, setIsSaving] = useState(false);

    const set = (patch) => setFormData(prev => ({ ...prev, ...patch }));

    // Listas
    const comboioVehicles = useMemo(
        () => vehicles.filter(v => v.isComboioVehicle).sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')),
        [vehicles]
    );
    const drainableVehicles = useMemo(
        () => vehicles.filter(v => !v.isComboioVehicle).sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')),
        [vehicles]
    );
    const selectedDrainingVehicle = useMemo(
        () => drainableVehicles.find(v => v.id === formData.drainingVehicleId),
        [formData.drainingVehicleId, drainableVehicles]
    );
    // Receptores da transfusão: qualquer equipamento diferente da origem
    const receivingVehicles = useMemo(
        () => vehicles.filter(v => v.id !== formData.drainingVehicleId)
            .sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')),
        [vehicles, formData.drainingVehicleId]
    );
    const selectedReceivingVehicle = useMemo(
        () => receivingVehicles.find(v => v.id === formData.receivingVehicleId),
        [formData.receivingVehicleId, receivingVehicles]
    );

    // Abastecimentos do veículo de origem — buscados sob demanda (escopados),
    // em vez de depender da tabela inteira de refuelings.
    const [drainRefuelings, setDrainRefuelings] = useState([]);
    useEffect(() => {
        let cancel = false;
        if (!formData.drainingVehicleId || !apiClient?.getRefuelingsByVehicle) { setDrainRefuelings([]); return undefined; }
        apiClient.getRefuelingsByVehicle(formData.drainingVehicleId)
            .then(rows => { if (!cancel) setDrainRefuelings(Array.isArray(rows) ? rows : []); })
            .catch(() => { if (!cancel) setDrainRefuelings([]); });
        return () => { cancel = true; };
    }, [formData.drainingVehicleId, apiClient]);

    // Abastecimentos da origem, mais recentes primeiro
    const originRefuelings = useMemo(() => {
        return (drainRefuelings || [])
            .filter(r => parseFloat(r.litrosAbastecidos) > 0)
            .sort((a, b) => recDate(b) - recDate(a));
    }, [drainRefuelings]);

    // Auto-seleciona o combustível pela abastecida mais recente da origem
    useEffect(() => {
        if (originRefuelings.length > 0) {
            const key = toComboioTankKey(originRefuelings[0].fuelType);
            if (key) setFormData(prev => ({ ...prev, fuelType: key }));
        }
    }, [originRefuelings]);

    // Pré-preenche a leitura do receptor com o valor atual do veículo
    useEffect(() => {
        if (selectedReceivingVehicle) {
            setFormData(prev => ({
                ...prev,
                odometro: selectedReceivingVehicle.odometro ?? '',
                horimetro: selectedReceivingVehicle.horimetro ?? '',
            }));
        }
    }, [selectedReceivingVehicle]);

    // Disponível para drenagem = soma das 2 últimas abastecidas do combustível escolhido
    const disponivel = useMemo(() => {
        if (!formData.fuelType) return null;
        const matching = originRefuelings.filter(r => toComboioTankKey(r.fuelType) === formData.fuelType);
        const last2 = matching.slice(0, 2);
        if (last2.length === 0) return 0;
        return last2.reduce((s, r) => s + (parseFloat(r.litrosAbastecidos) || 0), 0);
    }, [originRefuelings, formData.fuelType]);

    const handleChange = (e) => set({ [e.target.name]: e.target.value });

    // Campo de leitura do receptor (odômetro OU horímetro conforme o tipo)
    const receiverReading = useMemo(() => {
        if (!selectedReceivingVehicle) return null;
        const usesKm = getAllowedReadingTypes(selectedReceivingVehicle.tipo).includes('odometro');
        return usesKm ? { name: 'odometro', label: 'Odômetro (Km)' } : { name: 'horimetro', label: 'Horímetro (h)' };
    }, [selectedReceivingVehicle]);

    const handleSubmit = async (e) => {
        e?.preventDefault();
        const { destino, drainingVehicleId, comboioVehicleId, receivingVehicleId, liters, fuelType } = formData;

        if (!drainingVehicleId || !liters || !fuelType) {
            setAlertMessage("Preencha origem, combustível e litros.");
            return;
        }
        if (destino === 'comboio' && !comboioVehicleId) {
            setAlertMessage("Selecione o comboio de destino.");
            return;
        }
        if (destino === 'transfusao' && !receivingVehicleId) {
            setAlertMessage("Selecione o equipamento receptor.");
            return;
        }

        const litersVal = parseFloat(liters);
        if (!(litersVal > 0)) {
            setAlertMessage("Informe uma litragem válida.");
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                destino,
                drainingVehicleId,
                liters: litersVal,
                date: withTimeBRT(formData.date),
                fuelType,
                reason: formData.reason,
                createdBy: { id: user?.id, userEmail: user?.email, name: user?.name || user?.nome },
            };
            if (destino === 'comboio') {
                payload.comboioVehicleId = comboioVehicleId;
            } else if (destino === 'transfusao') {
                payload.receivingVehicleId = receivingVehicleId;
                payload.obraId = selectedReceivingVehicle?.obraAtualId || selectedDrainingVehicle?.obraAtualId || null;
                if (receiverReading?.name === 'odometro') payload.odometro = parseFloat(formData.odometro) || null;
                if (receiverReading?.name === 'horimetro') payload.horimetro = parseFloat(formData.horimetro) || null;
            }
            await apiClient.createComboioDrenagem(payload);
            setAlertMessage("Drenagem registrada com sucesso.");
            (onSaved || reloadData)?.();
            onClose();
        } catch (error) {
            setAlertMessage(error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="mak-modal-backdrop">
            <div className="mak-modal" style={{ maxWidth: 520 }}>
                <div className="mak-modal-header">
                    <div>
                        <h2 className="mak-modal-title">Registrar Drenagem</h2>
                        <p className="mak-modal-subtitle">Retira combustível de um veículo. O destino define para onde ele vai.</p>
                    </div>
                    <button type="button" className="mak-modal-close" onClick={onClose} disabled={isSaving}><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="mak-modal-body space-y-4">
                    {/* DESTINO */}
                    <div className="flex flex-col gap-1">
                        <label className="mak-label">Destino *</label>
                        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Destino da drenagem">
                            {DESTINOS.map(({ key, label, icon: Icon, desc }) => {
                                const ativo = formData.destino === key;
                                return (
                                    <button
                                        type="button"
                                        key={key}
                                        role="radio"
                                        aria-checked={ativo}
                                        onClick={() => set({ destino: key })}
                                        className="flex flex-col items-center gap-1 p-2 rounded-lg transition"
                                        style={{
                                            border: `1px solid ${ativo ? '#9E7A42' : '#e8e0d4'}`,
                                            background: ativo ? '#fdf8f0' : '#ffffff',
                                            color: ativo ? '#9E7A42' : '#6a5e4e',
                                            boxShadow: ativo ? '0 0 0 3px rgba(158,122,66,0.15)' : 'none',
                                            fontSize: 12,
                                        }}
                                        title={desc}
                                    >
                                        <Icon size={16} />
                                        <span className="font-semibold">{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <span style={{ fontSize: 11, color: '#9a8a78' }}>{DESTINOS.find(d => d.key === formData.destino)?.desc}</span>
                    </div>

                    {/* ORIGEM */}
                    <div className="flex flex-col gap-1">
                        <label className="mak-label">Drenar de (origem) *</label>
                        <SearchableSelect
                            items={drainableVehicles}
                            value={formData.drainingVehicleId}
                            onChange={(item) => set({ drainingVehicleId: item?.id || '' })}
                            getLabel={(v) => `${v.registroInterno} - ${v.modelo || ''}`.trim()}
                            getSubLabel={(v) => v.placa || ''}
                            placeholder="Selecione o veículo de origem..."
                            required
                        />
                    </div>

                    {/* DESTINO: COMBOIO */}
                    {formData.destino === 'comboio' && (
                        <div className="flex flex-col gap-1">
                            <label className="mak-label">Para o comboio *</label>
                            <SearchableSelect
                                items={comboioVehicles}
                                value={formData.comboioVehicleId}
                                onChange={(item) => set({ comboioVehicleId: item?.id || '' })}
                                getLabel={(v) => `${v.registroInterno} — ${v.placa || ''}`}
                                getSubLabel={(v) => v.modelo || ''}
                                placeholder="Selecione o comboio destino..."
                                required
                            />
                        </div>
                    )}

                    {/* DESTINO: TRANSFUSÃO */}
                    {formData.destino === 'transfusao' && (
                        <>
                            <div className="flex flex-col gap-1">
                                <label className="mak-label">Transferir para (receptor) *</label>
                                <SearchableSelect
                                    items={receivingVehicles}
                                    value={formData.receivingVehicleId}
                                    onChange={(item) => set({ receivingVehicleId: item?.id || '' })}
                                    getLabel={(v) => `${v.registroInterno} - ${v.modelo || ''}`.trim()}
                                    getSubLabel={(v) => v.placa || ''}
                                    placeholder="Selecione o equipamento receptor..."
                                    required
                                />
                            </div>
                            {receiverReading && (
                                <div className="flex flex-col gap-1">
                                    <label className="mak-label">{receiverReading.label} do receptor *</label>
                                    <input
                                        name={receiverReading.name}
                                        type="number"
                                        step="0.1"
                                        value={formData[receiverReading.name]}
                                        onChange={handleChange}
                                        className="w-full mak-input-mono"
                                        required
                                    />
                                    <span style={{ fontSize: 11, color: '#9a8a78' }}>
                                        Leitura atual: {getVehicleMainReading(selectedReceivingVehicle).value} {getVehicleMainReading(selectedReceivingVehicle).unit}
                                    </span>
                                </div>
                            )}
                        </>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="mak-label">Combustível *</label>
                            <select name="fuelType" value={formData.fuelType} onChange={handleChange} className="w-full" required>
                                <option value="">Selecione</option>
                                {COMBOIO_TANKS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="mak-label">Litros *</label>
                            <input name="liters" type="number" step="0.1" min="0" value={formData.liters} onChange={handleChange} className="w-full" required />
                        </div>
                    </div>

                    {/* DISPONÍVEL (informativo) */}
                    {formData.drainingVehicleId && formData.fuelType && (
                        <div className="p-2 rounded-lg" style={{ background: '#faf9f7', border: '1px solid #f0ebe3', fontSize: 12, color: '#6a5e4e' }}>
                            Referência (2 últimas abastecidas da origem): <strong style={{ color: '#1e1a14' }}>{Number(disponivel || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L</strong> — não bloqueia.
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="mak-label">Data *</label>
                            <input name="date" type="date" value={formData.date} onChange={handleChange} className="w-full" required />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="mak-label">Motivo {formData.destino === 'eliminado' && '(contaminação)'}</label>
                            <input name="reason" type="text" value={formData.reason} onChange={handleChange} className="w-full" placeholder="Opcional" />
                        </div>
                    </div>
                </form>

                <div className="mak-modal-footer">
                    <button type="button" onClick={onClose} className="mak-btn mak-btn-cancel" disabled={isSaving}>Cancelar</button>
                    <button type="button" onClick={handleSubmit} disabled={isSaving} className="mak-btn mak-btn-dark">
                        {isSaving ? <Loader className="animate-spin" size={14} /> : <Recycle size={14} />} Registrar drenagem
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ComboioDrenagemModal;
