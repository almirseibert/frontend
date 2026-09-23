// components/modals/ComboioSaidaModal.js
//
// Saída do comboio (abastecimento de uma máquina/veículo) — registro direto.
//
// As travas são as mesmas da ordem de abastecimento e são aplicadas NO SERVIDOR:
// leitura fora da regra ou obra acima de 20% do contrato não impedem o registro
// (o diesel já saiu do tanque), mas a saída fica BLOQUEADA até um admin liberar.
// Aqui só avisamos antes. A antiga "liberação por senha" não funcionava: o
// backend recusava do mesmo jeito.
import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader, AlertTriangle, Lock, TrendingUp, Droplet, Fuel } from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import SearchableObraSelect from '../SearchableObraSelect';
import { getAllowedReadingTypes, getGroupForType } from '../../utils/vehicleRules';
import { getComboioTanks, toComboioTankKey } from '../../utils/fuelTypes';
import { todayBRT, ymdBRT, withTimeBRT } from '../../utils/dateBRT';

const fmtL = (n, d = 1) => `${(Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: d })} L`;
const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Medidor de consumo da obra: a cor carrega a severidade, a trilha é um tom
// claro da mesma rampa. A severidade sempre vem com texto — nunca só a cor.
const LIMITE_ORCAMENTO = 20;
const ObraOrcamentoMeter = ({ status }) => {
    if (!status || !(status.valorContrato > 0)) return null;
    const pct = Number(status.percentual) || 0;
    const nivel = pct >= LIMITE_ORCAMENTO
        ? { fill: '#d03b3b', track: '#f6dada', texto: 'Acima do limite de 20% — a saída ficará bloqueada', Icon: Lock }
        : pct >= LIMITE_ORCAMENTO * 0.75
            ? { fill: '#fab219', track: '#fdefc8', texto: 'Próximo do limite de 20%', Icon: AlertTriangle }
            : { fill: '#9E7A42', track: '#efe4d2', texto: 'Dentro do limite', Icon: TrendingUp };
    const { Icon } = nivel;
    return (
        <div className="rounded-lg p-2.5" style={{ background: '#faf9f7', border: '1px solid #f0ebe3' }}>
            <div className="flex justify-between items-center" style={{ fontSize: 11, color: '#3d3528' }}>
                <span className="flex items-center gap-1 font-bold"><Icon size={12} /> Combustível da obra</span>
                <span className="font-bold">{pct.toFixed(1)}% do contrato</span>
            </div>
            <div
                className="mt-1.5 w-full rounded-full overflow-hidden"
                style={{ height: 6, background: nivel.track }}
                role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
                aria-label="Combustível da obra em relação ao contrato"
            >
                <div style={{ width: `${Math.min(pct / LIMITE_ORCAMENTO, 1) * 100}%`, height: '100%', background: nivel.fill, borderRadius: 9999 }} />
            </div>
            <div className="flex justify-between mt-1" style={{ fontSize: 10, color: '#6a5e4e' }}>
                <span>{nivel.texto}</span>
                <span>{fmtBRL(status.totalGasto)} de {fmtBRL(status.valorContrato)}</span>
            </div>
        </div>
    );
};

const ComboioSaidaModal = ({
    user,
    comboios = [],
    defaultComboioId = '',
    transactionData = null,
    vehicles = [],
    obras = [],
    employees = [],
    onClose,
    setAlertMessage,
    apiClient,
    onSaved,
    onGeneratePDF,
}) => {
    const isEditing = !!transactionData;

    const [form, setForm] = useState(() => ({
        comboioVehicleId: transactionData?.comboioVehicleId || defaultComboioId || '',
        receivingVehicleId: transactionData?.receivingVehicleId || '',
        obraId: transactionData?.obraId || '',
        employeeId: transactionData?.employeeId || '',
        tankKey: toComboioTankKey(transactionData?.fuelType) || '',
        liters: transactionData?.liters ? String(transactionData.liters) : '',
        date: transactionData?.date ? ymdBRT(transactionData.date) : todayBRT(),
        odometro: transactionData?.odometro ? String(transactionData.odometro) : '',
        horimetro: transactionData?.horimetro ? String(transactionData.horimetro) : '',
    }));
    const [isSaving, setIsSaving] = useState(false);
    const [obraStatus, setObraStatus] = useState(null);
    const [gerarPdf, setGerarPdf] = useState(false);

    const set = (patch) => setForm(prev => ({ ...prev, ...patch }));

    const comboio = useMemo(() => comboios.find(c => c.id === form.comboioVehicleId) || null, [comboios, form.comboioVehicleId]);
    const tanques = useMemo(() => getComboioTanks(comboio), [comboio]);

    const maquinas = useMemo(
        () => vehicles.filter(v => !v.isComboioVehicle).sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')),
        [vehicles]
    );
    const veiculo = useMemo(() => vehicles.find(v => v.id === form.receivingVehicleId) || null, [vehicles, form.receivingVehicleId]);
    const sortedEmployees = useMemo(() => [...employees].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')), [employees]);
    const obrasAtivas = useMemo(
        () => obras.filter(o => ['ativa', 'mobilizacao'].includes(o.status) || o.id === form.obraId),
        [obras, form.obraId]
    );

    // Na criação: tanque com saldo, obra e motorista vêm do comboio/veículo.
    useEffect(() => {
        if (isEditing || !comboio) return;
        setForm(prev => {
            if (prev.tankKey) return prev;
            const comSaldo = getComboioTanks(comboio).filter(t => t.litros > 0);
            return comSaldo.length === 1 ? { ...prev, tankKey: comSaldo[0].key } : prev;
        });
    }, [comboio, isEditing]);

    useEffect(() => {
        if (isEditing || !veiculo) return;
        setForm(prev => ({
            ...prev,
            obraId: prev.obraId || veiculo.obraAtualId || '',
            employeeId: prev.employeeId || veiculo.operationalAssignment?.employeeId || '',
        }));
    }, [veiculo, isEditing]);

    useEffect(() => {
        if (!form.obraId) { setObraStatus(null); return undefined; }
        let cancelado = false;
        apiClient.getObraFuelStatus(form.obraId)
            .then(st => { if (!cancelado) setObraStatus(st || null); })
            .catch(() => { if (!cancelado) setObraStatus(null); });
        return () => { cancelado = true; };
    }, [form.obraId, apiClient]);

    const campoLeitura = veiculo
        ? (getAllowedReadingTypes(veiculo.tipo).includes('odometro') ? 'odometro' : 'horimetro')
        : null;

    // Mesmo critério do backend (avaliarSaida). Leitura INFERIOR à atual não
    // bloqueia — há abastecimentos antigos sendo lançados agora — só avisa; a
    // leitura do veículo não recua. Salto excessivo bloqueia.
    const leituraInformada = useMemo(() => {
        if (!veiculo || !campoLeitura || veiculo.isOutsourced || veiculo.permiteMultiplosAbastecimentos) return null;
        const atual = parseFloat(form[campoLeitura]);
        const anteriorOriginal = parseFloat(transactionData?.[campoLeitura]);
        if (!(atual > 0)) return null;
        if (isEditing && atual === anteriorOriginal) return null;
        const ultimo = parseFloat(veiculo[campoLeitura] || 0);
        if (!(ultimo > 0)) return null;
        return { atual, ultimo };
    }, [veiculo, campoLeitura, form, isEditing, transactionData]);

    const alertaInferior = leituraInformada && leituraInformada.atual < leituraInformada.ultimo
        ? `${campoLeitura === 'odometro' ? 'Odômetro' : 'Horímetro'} (${leituraInformada.atual}) inferior ao atual do veículo (${leituraInformada.ultimo}). `
          + `O lançamento é permitido, mas o ${campoLeitura === 'odometro' ? 'odômetro' : 'horímetro'} do veículo não será alterado.`
        : null;

    const avisoLeitura = useMemo(() => {
        if (!leituraInformada) return null;
        const { atual, ultimo } = leituraInformada;
        if (campoLeitura === 'odometro') {
            const limite = getGroupForType(veiculo.tipo) === 'Caminhões de Trecho' ? 2000 : 1000;
            if (atual - ultimo > limite) return `Salto de ${atual - ultimo} Km (máximo ${limite} Km).`;
        } else if (atual - ultimo > 50) {
            return `Salto de ${(atual - ultimo).toFixed(1)} h (máximo 50 h).`;
        }
        return null;
    }, [leituraInformada, campoLeitura, veiculo]);

    const orcamentoEstourado = !veiculo?.isOutsourced && obraStatus?.valorContrato > 0 && Number(obraStatus.percentual) >= LIMITE_ORCAMENTO;
    const vaiBloquear = !!avisoLeitura || orcamentoEstourado;

    const tanqueSel = tanques.find(t => t.key === form.tankKey);
    // Na edição o saldo atual já está sem os litros desta saída.
    const saldoDisponivel = tanqueSel
        ? tanqueSel.litros + (isEditing && toComboioTankKey(transactionData.fuelType) === form.tankKey ? (parseFloat(transactionData.liters) || 0) : 0)
        : null;
    const litros = parseFloat(form.liters);
    const semSaldo = saldoDisponivel != null && litros > saldoDisponivel + 1;

    const handleSubmit = async (e) => {
        e?.preventDefault();
        if (!form.comboioVehicleId || !form.receivingVehicleId || !form.obraId || !form.tankKey || !form.employeeId) {
            setAlertMessage('Preencha comboio, veículo, obra, combustível e motorista.');
            return;
        }
        if (!(litros > 0)) {
            setAlertMessage('Informe a quantidade de litros.');
            return;
        }
        if (semSaldo) {
            setAlertMessage(`Saldo insuficiente no comboio: ${fmtL(saldoDisponivel)} disponíveis. Dê baixa na entrada antes de distribuir.`);
            return;
        }
        if (campoLeitura && !isEditing && !(parseFloat(form[campoLeitura]) > 0)) {
            setAlertMessage(`Informe o ${campoLeitura === 'odometro' ? 'odômetro' : 'horímetro'} do veículo.`);
            return;
        }

        const payload = {
            comboioVehicleId: form.comboioVehicleId,
            receivingVehicleId: form.receivingVehicleId,
            obraId: form.obraId,
            employeeId: form.employeeId,
            fuelType: form.tankKey,
            liters: litros,
            date: withTimeBRT(form.date),
            odometro: campoLeitura === 'odometro' ? (parseFloat(form.odometro) || null) : null,
            horimetro: campoLeitura === 'horimetro' ? (parseFloat(form.horimetro) || null) : null,
            createdBy: { id: user?.id, userEmail: user?.email, name: user?.name || user?.nome },
        };

        setIsSaving(true);
        try {
            const res = isEditing
                ? await apiClient.updateComboioTransaction(transactionData.id, payload)
                : await apiClient.createComboioSaida(payload);

            setAlertMessage(res?.message || (isEditing ? 'Saída atualizada.' : 'Saída registrada.'));

            if (gerarPdf && onGeneratePDF) {
                const obra = obras.find(o => o.id === form.obraId);
                onGeneratePDF({
                    ...(transactionData || {}),
                    ...payload,
                    id: res?.id || transactionData?.id,
                    authNumber: res?.refuelingOrder?.authNumber || transactionData?.authNumber,
                    obraName: obra?.nome || transactionData?.obraName,
                    status: res?.status || 'Concluída',
                    motivoBloqueio: res?.motivoBloqueio,
                    responsibleUserEmail: user?.email,
                }).catch(() => {});
            }
            onSaved?.();
            onClose();
        } catch (error) {
            setAlertMessage(error.message || 'Erro ao registrar a saída.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="mak-modal-backdrop">
            <div className="mak-modal" style={{ maxWidth: 580 }}>
                <div className="mak-modal-header">
                    <div>
                        <h2 className="mak-modal-title">
                            {isEditing ? `Editar Saída Nº ${String(transactionData.authNumber || '').padStart(6, '0')}` : 'Registrar Saída do Comboio'}
                        </h2>
                        <p className="mak-modal-subtitle">Diesel distribuído pelo comboio a uma máquina ou veículo.</p>
                    </div>
                    <button type="button" className="mak-modal-close" onClick={onClose} disabled={isSaving}><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="mak-modal-body space-y-4">
                    {vaiBloquear && (
                        <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: '#fdf0ec', border: '1px solid #e8c8bc', color: '#b03828', fontSize: 12 }}>
                            <Lock size={14} className="mt-0.5 flex-shrink-0" />
                            <div>
                                <strong>Esta saída será salva BLOQUEADA</strong> e aguardará a liberação de um administrador.
                                {avisoLeitura && <div>Leitura: {avisoLeitura}</div>}
                                {orcamentoEstourado && <div>Obra acima de 20% do contrato em combustível.</div>}
                            </div>
                        </div>
                    )}
                    {alertaInferior && (
                        <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', fontSize: 12 }}>
                            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                            <div>{alertaInferior}</div>
                        </div>
                    )}
                    {veiculo?.naoPodeCircular && (
                        <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', fontSize: 12 }}>
                            <AlertTriangle size={14} /> Veículo marcado como NÃO PODE CIRCULAR.
                        </div>
                    )}

                    <div className="mak-form-section"><Droplet size={12} /> Origem</div>
                    <div className="flex flex-col gap-1">
                        <label className="mak-label">Comboio *</label>
                        <SearchableSelect
                            items={comboios}
                            value={form.comboioVehicleId}
                            onChange={(item) => set({ comboioVehicleId: item?.id || '', tankKey: '' })}
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
                                const vazio = t.litros <= 0 && !(isEditing && toComboioTankKey(transactionData.fuelType) === t.key);
                                return (
                                    <button
                                        key={t.key}
                                        type="button"
                                        role="radio"
                                        aria-checked={ativo}
                                        disabled={vazio}
                                        onClick={() => set({ tankKey: t.key })}
                                        className="text-left rounded-lg p-2.5 transition disabled:opacity-50"
                                        style={{
                                            border: `1px solid ${ativo ? '#9E7A42' : '#e8e0d4'}`,
                                            background: ativo ? '#fdf8f0' : '#ffffff',
                                            boxShadow: ativo ? '0 0 0 3px rgba(158,122,66,0.15)' : 'none',
                                        }}
                                    >
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e1a14' }}>{t.label}</div>
                                        <div style={{ fontSize: 11, color: '#6a5e4e' }}>{vazio ? 'Tanque vazio' : `Saldo ${fmtL(t.litros)}`}</div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="mak-form-section"><Fuel size={12} /> Destino</div>
                    <div className="flex flex-col gap-1">
                        <label className="mak-label">Veículo abastecido *</label>
                        <SearchableSelect
                            items={maquinas}
                            value={form.receivingVehicleId}
                            onChange={(item) => set({ receivingVehicleId: item?.id || '' })}
                            getLabel={(v) => `${v.registroInterno} — ${v.modelo || ''}`.trim()}
                            getSubLabel={(v) => v.placa || ''}
                            placeholder="Selecione o veículo..."
                            disabled={isEditing}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {campoLeitura && (
                            <div className="flex flex-col gap-1">
                                <label className="mak-label">{campoLeitura === 'odometro' ? 'Odômetro (Km) *' : 'Horímetro (h) *'}</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    className={`w-full mak-input-mono ${avisoLeitura ? 'mak-input-error' : ''}`}
                                    value={form[campoLeitura]}
                                    onChange={(e) => set({ [campoLeitura]: e.target.value })}
                                    placeholder={`Atual: ${veiculo?.[campoLeitura] || 0}`}
                                />
                                {avisoLeitura && <span className="mak-error">{avisoLeitura}</span>}
                                {!avisoLeitura && alertaInferior && (
                                    <span style={{ fontSize: 11, color: '#92400e' }}>Leitura inferior à atual: o veículo não será alterado.</span>
                                )}
                            </div>
                        )}
                        <div className="flex flex-col gap-1">
                            <label className="mak-label">Litros *</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                className={`w-full ${semSaldo ? 'mak-input-error' : ''}`}
                                value={form.liters}
                                onChange={(e) => set({ liters: e.target.value })}
                            />
                            {saldoDisponivel != null && (
                                <span className={semSaldo ? 'mak-error' : ''} style={semSaldo ? undefined : { fontSize: 11, color: '#9a8a78' }}>
                                    Disponível no tanque: {fmtL(saldoDisponivel)}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="mak-label">Obra (centro de custo) *</label>
                        <SearchableObraSelect
                            obras={obrasAtivas}
                            value={form.obraId}
                            onChange={(obra) => set({ obraId: obra?.id || '' })}
                            placeholder="Selecione a obra..."
                            includeInactive
                        />
                    </div>
                    <ObraOrcamentoMeter status={veiculo?.isOutsourced ? null : obraStatus} />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="mak-label">Operador/Motorista *</label>
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
                </form>

                <div className="mak-modal-footer" style={{ justifyContent: 'space-between' }}>
                    <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12, color: '#6a5e4e' }}>
                        <input type="checkbox" checked={gerarPdf} onChange={(e) => setGerarPdf(e.target.checked)} />
                        Baixar comprovante
                    </label>
                    <div className="flex gap-2">
                        <button type="button" className="mak-btn mak-btn-cancel" onClick={onClose} disabled={isSaving}>Cancelar</button>
                        <button
                            type="button"
                            className={`mak-btn ${vaiBloquear ? 'mak-btn-danger' : 'mak-btn-primary'}`}
                            onClick={handleSubmit}
                            disabled={isSaving || semSaldo}
                        >
                            {isSaving ? <Loader size={14} className="animate-spin" /> : (vaiBloquear ? <Lock size={14} /> : <Droplet size={14} />)}
                            {vaiBloquear ? 'Registrar bloqueada' : (isEditing ? 'Salvar' : 'Registrar saída')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ComboioSaidaModal;
