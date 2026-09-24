// components/modals/ComboioEntradaOrderModal.js
//
// Ordem ao posto para ENCHER o tanque de estoque do comboio.
// Mesmo fluxo da ordem de abastecimento: emite (número + envio ao posto com
// selo de entrega) e, depois de abastecido, dá-se baixa com litros reais, preço
// e NF no ConfirmRefuelingModal (variant="comboioEntrada").
import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader, FileText, Droplet, Info } from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import DeliveryPreflightBanner, { useDeliveryPreflight } from '../refueling/DeliveryPreflightBanner';
import { getPartnerDisplayName } from '../../utils/partners';
import { COMBOIO_TANKS, getComboioTanks, toComboioTankKey, getPartnerFuelPrice } from '../../utils/fuelTypes';
import { todayBRT, ymdBRT, withTimeBRT } from '../../utils/dateBRT';

import { fmtBRLLitro } from '../../utils/currency';
const fmtL = (n) => `${(Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L`;

const ComboioEntradaOrderModal = ({
    user,
    comboios = [],
    defaultComboioId = '',
    orderToEdit = null,
    partners = [],
    employees = [],
    apiClient,
    setAlertMessage,
    onClose,
    onSaved,
    onGeneratePDF,
}) => {
    const isEditing = !!orderToEdit;
    const preflight = useDeliveryPreflight(apiClient);

    const [form, setForm] = useState(() => ({
        comboioVehicleId: orderToEdit?.vehicleId || defaultComboioId || '',
        partnerId: orderToEdit?.partnerId || '',
        tankKey: toComboioTankKey(orderToEdit?.fuelType) || 'dieselS10',
        isFillUp: !!orderToEdit?.isFillUp,
        litrosLiberados: orderToEdit?.litrosLiberados ? String(orderToEdit.litrosLiberados) : '',
        employeeId: orderToEdit?.employeeId || '',
        date: orderToEdit?.data ? ymdBRT(orderToEdit.data) : todayBRT(),
        outros: orderToEdit?.outros || '',
    }));
    const [isSaving, setIsSaving] = useState(false);
    const [gerarPdf, setGerarPdf] = useState(!isEditing);

    const set = (patch) => setForm(prev => ({ ...prev, ...patch }));

    const comboio = useMemo(() => comboios.find(c => c.id === form.comboioVehicleId) || null, [comboios, form.comboioVehicleId]);
    const tanques = useMemo(() => getComboioTanks(comboio), [comboio]);
    const tanque = tanques.find(t => t.key === form.tankKey);
    const livre = tanque?.capacidade ? Math.max(0, tanque.capacidade - tanque.litros) : null;

    const postos = useMemo(() =>
        [...partners]
            .filter(p => p.tipo_parceiro === 'posto'
                && p.status_operacional !== 'Bloqueado'
                && p.status_operacional !== 'BLOQUEADO')
            .sort((a, b) => (getPartnerDisplayName(a) || '').localeCompare(getPartnerDisplayName(b) || ''))
    , [partners]);
    const posto = postos.find(p => p.id === form.partnerId) || partners.find(p => p.id === form.partnerId);
    const orderKey = COMBOIO_TANKS.find(t => t.key === form.tankKey)?.orderKey;
    const precoCadastrado = getPartnerFuelPrice(posto, orderKey);

    const sortedEmployees = useMemo(
        () => [...employees].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
        [employees]
    );

    // Motorista do comboio vem da alocação atual, quando houver.
    useEffect(() => {
        if (isEditing || !comboio) return;
        const motorista = comboio.operationalAssignment?.employeeId;
        if (motorista) setForm(prev => (prev.employeeId ? prev : { ...prev, employeeId: motorista }));
    }, [comboio, isEditing]);

    const sugerirCapacidadeLivre = () => {
        if (livre != null && livre > 0) set({ litrosLiberados: String(Math.floor(livre)), isFillUp: false });
    };

    const handleSubmit = async (e) => {
        e?.preventDefault();
        if (!form.comboioVehicleId || !form.partnerId || !form.tankKey || !form.employeeId) {
            setAlertMessage('Preencha comboio, posto, combustível e motorista.');
            return;
        }
        const litros = parseFloat(form.litrosLiberados);
        if (!form.isFillUp && !(litros > 0)) {
            setAlertMessage('Informe os litros liberados ou marque "Completar tanque".');
            return;
        }
        if (!form.isFillUp && livre != null && litros > livre * 1.05 + 1) {
            setAlertMessage(`Os ${litros} L liberados não cabem no tanque: capacidade livre de ${fmtL(livre)}.`);
            return;
        }

        const payload = {
            vehicleId: form.comboioVehicleId,
            partnerId: form.partnerId,
            partnerName: posto?.razaoSocial || null,
            fuelType: orderKey,
            isFillUp: form.isFillUp,
            litrosLiberados: form.isFillUp ? 0 : litros,
            employeeId: form.employeeId,
            date: withTimeBRT(form.date),
            outros: form.outros || null,
            createdBy: { id: user?.id, userEmail: user?.email, name: user?.name || user?.nome },
        };

        setIsSaving(true);
        try {
            const res = isEditing
                ? await apiClient.updateComboioEntradaOrder(orderToEdit.id, payload)
                : await apiClient.createComboioEntradaOrder(payload);

            const authNumber = isEditing ? orderToEdit.authNumber : res?.authNumber;
            setAlertMessage(isEditing
                ? `Ordem de entrada Nº ${String(authNumber).padStart(6, '0')} atualizada e reenviada ao posto.`
                : `Ordem de entrada Nº ${String(authNumber).padStart(6, '0')} emitida e enviada ao posto.`);

            if (gerarPdf && onGeneratePDF && authNumber) {
                onGeneratePDF({
                    ...(orderToEdit || {}),
                    ...payload,
                    id: res?.id || orderToEdit?.id,
                    authNumber,
                    data: payload.date,
                    comboioEntrada: 1,
                    createdBy: payload.createdBy,
                }).catch(() => {});
            }
            onSaved?.();
            onClose();
        } catch (error) {
            setAlertMessage(error.message || 'Erro ao salvar a ordem de entrada.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="mak-modal-backdrop">
            <div className="mak-modal" style={{ maxWidth: 560 }}>
                <div className="mak-modal-header">
                    <div>
                        <h2 className="mak-modal-title">
                            {isEditing ? `Editar Ordem de Entrada Nº ${String(orderToEdit.authNumber).padStart(6, '0')}` : 'Emitir Ordem de Entrada'}
                        </h2>
                        <p className="mak-modal-subtitle">Autoriza o posto a encher o tanque de estoque do comboio. A baixa é feita depois, com a NF.</p>
                    </div>
                    <button type="button" className="mak-modal-close" onClick={onClose} disabled={isSaving}><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="mak-modal-body space-y-4">
                    <DeliveryPreflightBanner preflight={preflight} />

                    <div className="mak-form-section"><Droplet size={12} /> Comboio e combustível</div>

                    <div className="flex flex-col gap-1">
                        <label className="mak-label">Comboio *</label>
                        <SearchableSelect
                            items={comboios}
                            value={form.comboioVehicleId}
                            onChange={(item) => set({ comboioVehicleId: item?.id || '' })}
                            getLabel={(v) => `${v.registroInterno} — ${v.placa || ''}`}
                            getSubLabel={(v) => v.modelo || ''}
                            placeholder="Selecione o comboio..."
                            disabled={isEditing}
                            required
                        />
                    </div>

                    {comboio && (
                        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tanque">
                            {tanques.map(t => {
                                const ativo = form.tankKey === t.key;
                                return (
                                    <button
                                        key={t.key}
                                        type="button"
                                        role="radio"
                                        aria-checked={ativo}
                                        onClick={() => set({ tankKey: t.key })}
                                        className="text-left rounded-lg p-2.5 transition"
                                        style={{
                                            border: `1px solid ${ativo ? '#9E7A42' : '#e8e0d4'}`,
                                            background: ativo ? '#fdf8f0' : '#ffffff',
                                            boxShadow: ativo ? '0 0 0 3px rgba(158,122,66,0.15)' : 'none',
                                        }}
                                    >
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e1a14' }}>{t.label}</div>
                                        <div style={{ fontSize: 11, color: '#6a5e4e' }}>
                                            Saldo {fmtL(t.litros)}{t.capacidade ? ` de ${fmtL(t.capacidade)}` : ''}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <label className="mak-label">Posto *</label>
                        <SearchableSelect
                            items={postos}
                            value={form.partnerId}
                            onChange={(item) => set({ partnerId: item?.id || '' })}
                            getLabel={(p) => getPartnerDisplayName(p)}
                            getSubLabel={(p) => [p.nomeFantasia ? p.razaoSocial : null, p.cidade].filter(Boolean).join(' · ')}
                            placeholder="Selecione o posto..."
                            required
                        />
                        {posto && (
                            <span style={{ fontSize: 11, color: '#9a8a78' }}>
                                {precoCadastrado > 0
                                    ? `Preço cadastrado: ${fmtBRLLitro(precoCadastrado)}/L`
                                    : 'Posto sem preço cadastrado para este combustível.'}
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="mak-label">Litros liberados {form.isFillUp ? '' : '*'}</label>
                            <input
                                type="number"
                                step="1"
                                min="0"
                                className="w-full"
                                value={form.isFillUp ? '' : form.litrosLiberados}
                                onChange={(e) => set({ litrosLiberados: e.target.value })}
                                disabled={form.isFillUp}
                                placeholder={form.isFillUp ? 'Completar tanque' : '0'}
                            />
                            {livre != null && !form.isFillUp && (
                                <button type="button" onClick={sugerirCapacidadeLivre} className="self-start" style={{ fontSize: 11, color: '#9E7A42', fontWeight: 600 }}>
                                    Usar capacidade livre ({fmtL(livre)})
                                </button>
                            )}
                        </div>
                        <label className="flex items-center gap-2 sm:mt-6 cursor-pointer" style={{ fontSize: 13, color: '#3d3528' }}>
                            <input type="checkbox" checked={form.isFillUp} onChange={(e) => set({ isFillUp: e.target.checked })} />
                            Completar tanque
                        </label>
                    </div>

                    <div className="mak-form-section">Motorista e data</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="mak-label">Motorista *</label>
                            <SearchableSelect
                                items={sortedEmployees}
                                value={form.employeeId}
                                onChange={(item) => set({ employeeId: item?.id || '' })}
                                getLabel={(e) => e.nome || ''}
                                getSubLabel={(e) => e.profissao || ''}
                                placeholder="Selecione..."
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="mak-label">Data *</label>
                            <input type="date" className="w-full" value={form.date} onChange={(e) => set({ date: e.target.value })} required />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="mak-label">Observação para o posto</label>
                        <input type="text" className="w-full" value={form.outros} onChange={(e) => set({ outros: e.target.value })} placeholder="Opcional" />
                    </div>

                    {isEditing && orderToEdit.status === 'Concluída' && (
                        <div className="flex items-start gap-2 p-2 rounded" style={{ background: '#fdf8f0', border: '1px solid #e8d8b8', fontSize: 11, color: '#6a5e4e' }}>
                            <Info size={13} className="mt-0.5 flex-shrink-0" />
                            Esta ordem já teve baixa. Para corrigir litros, preço ou NF use "Corrigir baixa".
                        </div>
                    )}
                </form>

                <div className="mak-modal-footer" style={{ justifyContent: 'space-between' }}>
                    <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12, color: '#6a5e4e' }}>
                        <input type="checkbox" checked={gerarPdf} onChange={(e) => setGerarPdf(e.target.checked)} />
                        Baixar PDF
                    </label>
                    <div className="flex gap-2">
                        <button type="button" className="mak-btn mak-btn-cancel" onClick={onClose} disabled={isSaving}>Cancelar</button>
                        <button type="button" className="mak-btn mak-btn-primary" onClick={handleSubmit} disabled={isSaving}>
                            {isSaving ? <Loader size={14} className="animate-spin" /> : <FileText size={14} />}
                            {isEditing ? 'Salvar e reenviar' : 'Emitir ordem'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ComboioEntradaOrderModal;
