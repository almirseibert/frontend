import React, { useState, useMemo } from 'react';
import { Loader, X, AlertTriangle, Shield } from 'lucide-react';
import FinishObraModal from './FinishObraModal';
import { getVehicleMainReading } from '../utils/vehicleRules';

// --- Modal de Alocação em Obra ---
const ObraAllocationModal = ({ user, vehicle, obras = [], employees = [], revisions = [], onClose, setAlertMessage, apiClient, reloadData, vehicles = [], vehicleGroups = {}, PasswordConfirmationModal }) => {
    const currentObraAllocation = (Array.isArray(vehicle.history) ? vehicle.history : [])
                                    .find(h => (h.type === 'obra' || h.historyType === 'obra') && !h.endDate && !h.dataSaida);

    const [obraId, setObraId] = useState(currentObraAllocation ? vehicle.obraAtualId : '');
    const [employeeId, setEmployeeId] = useState(currentObraAllocation?.details?.employeeId || '');
    const [dataEntrada, setDataEntrada] = useState(currentObraAllocation ? new Date(currentObraAllocation.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    const [dataSaida, setDataSaida] = useState(new Date().toISOString().split('T')[0]); 
    const [locationAfterDeallocate, setLocationAfterDeallocate] = useState('Pátio MAK Lajeado');
    const [isSaving, setIsSaving] = useState(false);

    // --- ESTADOS DE SEGURANÇA ---
    const [restrictionAlert, setRestrictionAlert] = useState(null);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

    // --- LÓGICA DE LEITURA (NOVAS REGRAS O/H) ---
    const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
    const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(vehicle.tipo));
    
    let readingType;
    if (vehicleGroup === 'Caminhões de Trecho' || (vehicleGroup === 'Caminhões' && vehicle.tipo === 'Caminhões Prancha')) {
        readingType = 'odometro';
    } else if (vehicleGroup === 'Caminhões' || vehicleGroup === 'Máquinas Pesadas') {
        readingType = 'horimetro';
    } else {
        readingType = 'odometro';
    }

    const readingLabel = readingType === 'horimetro' ? 'Horímetro' : 'Odômetro';
    
    const initialReading = currentObraAllocation
                            ? (currentObraAllocation.details?.[`${readingType}Entrada`] || '') 
                            : (vehicle[readingType] || '');

    const [readingValue, setReadingValue] = useState(initialReading.toString());

    const activeObras = useMemo(() => obras.filter(o => o.status === 'ativa').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);
    const availableEmployees = useMemo(() =>
        (employees || [])
            .filter(e => e.status !== 'inativo' && (e.funcao === 'Operador de Máquina' || e.funcao === 'Motorista'))
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [employees]);

    const [isFinishObraModalOpen, setIsFinishObraModalOpen] = useState(false);
    const [obraToFinalize, setObraToFinalize] = useState(null);

    // --- LÓGICA DE VERIFICAÇÃO DE RESTRIÇÕES ---
    const checkRestrictions = () => {
        const issues = [];
        const now = new Date();
        const thirtyDays = new Date(); thirtyDays.setDate(now.getDate() + 30);

        // 1. Bloqueio direto
        if (vehicle.canCirculate === false) {
            issues.push("• O veículo está marcado como 'NÃO PODE CIRCULAR'.");
        }

        // 2. Revisões
        const revision = revisions?.find(r => r.vehicleId === vehicle.id);
        if (revision) {
            const proximaData = revision.proximaRevisaoData ? new Date(revision.proximaRevisaoData) : null;
            const proximoOdo = revision.proximaRevisaoOdometro || 0;
            const mainReading = getVehicleMainReading(vehicle); 
            const current = mainReading.raw || parseFloat(readingValue || 0);
            const aviso = revision.avisoAntecedenciaKmHr || 0;
            
            if (proximaData && now >= proximaData) issues.push("• Revisão VENCIDA por data.");
            if (proximoOdo > 0 && current >= proximoOdo) issues.push("• Revisão VENCIDA por leitura.");
            else if (proximoOdo > 0 && aviso > 0 && current >= (proximoOdo - aviso)) issues.push("• Revisão PRÓXIMA do vencimento.");
        }

        // 3. Documentos (Caminhões)
        if (['Caminhão', 'Caminhões'].some(t => vehicle.tipo?.includes(t))) {
            [{ n: 'Tacógrafo', d: vehicle.validadeTacografo }, { n: 'AET DAER', d: vehicle.validadeAET_DAER }, { n: 'AET DNIT', d: vehicle.validadeAET_DNIT }].forEach(doc => {
                if (doc.d) {
                    const d = new Date(doc.d);
                    if (d < now) issues.push(`• ${doc.n} VENCIDO.`);
                    else if (d <= thirtyDays) issues.push(`• ${doc.n} próximo do vencimento.`);
                }
            });
        }
        return issues;
    };

    const handleAllocateClick = () => {
        const readingFloat = parseFloat(readingValue);
        if (!obraId || !employeeId || readingValue === '' || isNaN(readingFloat)) {
            setAlertMessage(`Preencha a Obra, Funcionário e ${readingLabel} de Entrada.`);
            return;
        }

        // Verifica restrições antes de prosseguir
        const issues = checkRestrictions();
        if (issues.length > 0) {
            setRestrictionAlert(issues);
            return; // PARE AQUI
        }

        executeAllocate();
    };

    const executeAllocate = async () => {
        setIsSaving(true);
        try {
            await apiClient.allocateVehicleToObra(vehicle.id, {
                obraId,
                employeeId,
                dataEntrada: dataEntrada,
                readingType: readingType,
                readingValue: parseFloat(readingValue)
            });
            setAlertMessage("Veículo alocado com sucesso!");
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao alocar veículo:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao alocar o veículo.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeallocate = async (shouldFinalizeObra = false, dataFimObra = null) => {
        const readingFloat = parseFloat(readingValue);
         if (readingValue === '' || isNaN(readingFloat)) {
             setAlertMessage(`Preencha o ${readingLabel} de Saída.`);
             return;
         }
         const entryReading = currentObraAllocation?.details?.[`${readingType}Entrada`] || 0;
         if (currentObraAllocation && readingFloat < entryReading) {
             setAlertMessage(`A leitura de saída (${readingFloat}) não pode ser menor que a leitura de entrada (${entryReading}).`);
             return;
         }

        setIsSaving(true);
        try {
            await apiClient.deallocateVehicleFromObra(vehicle.id, {
                dataSaida: dataSaida,
                readingType: readingType,
                readingValue: readingFloat,
                location: locationAfterDeallocate,
                shouldFinalizeObra: shouldFinalizeObra,
                dataFimObra: dataFimObra,
                obraId: vehicle.obraAtualId
            });
            setAlertMessage(`Veículo desalocado ${shouldFinalizeObra ? 'e obra finalizada' : ''} com sucesso!`);
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao desalocar veículo:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao desalocar o veículo.");
        } finally {
            setIsSaving(false);
        }
    };

    const checkAndDeallocate = () => {
        const obraData = obras.find(o => o.id === vehicle.obraAtualId);
        if (!obraData) { 
            handleDeallocate();
            return;
        }
         const historico = Array.isArray(obraData.historicoVeiculos) ? obraData.historicoVeiculos : [];
        const otherActiveVehicles = historico.filter(h => h.veiculoId !== vehicle.id && !h.dataSaida);

        if (otherActiveVehicles.length === 0) { 
            setObraToFinalize(obraData);
            setIsFinishObraModalOpen(true); 
        } else {
            handleDeallocate(false); 
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                    <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                        <h2 className="text-xl font-bold">Alocação de Veículo em Obra</h2>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                    </div>

                     {/* ALERTA DE RESTRIÇÃO (Se houver) */}
                     {restrictionAlert && !currentObraAllocation && (
                        <div className="p-4 bg-red-50 border-b border-red-100">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="text-red-600 shrink-0 mt-1" />
                                <div>
                                    <h3 className="font-bold text-red-700 text-sm uppercase">Restrições Detectadas</h3>
                                    <div className="text-red-600 text-sm mt-1 space-y-1">
                                        {restrictionAlert.map((issue, idx) => (
                                            <p key={idx}>{issue}</p>
                                        ))}
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => setShowPasswordConfirm(true)}
                                        className="mt-3 w-full py-2 bg-red-600 text-white rounded font-bold text-sm hover:bg-red-700 flex items-center justify-center gap-2"
                                    >
                                        <Shield size={16} /> Autorizar com Senha
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="p-6">
                         <p className="text-sm mb-4"><strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo} ({vehicle.placa})</p>
                        {/* DESALOCAR */}
                        {currentObraAllocation ? (
                            <div className="space-y-4">
                                <p className="text-sm">Alocado na obra: <strong>{obras.find(o => o.id === vehicle.obraAtualId)?.nome || 'Desconhecida'}</strong>.</p>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Data de Saída *</label>
                                    <input type="date" value={dataSaida} onChange={e => setDataSaida(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm" required/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">{readingLabel} de Saída *</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={readingValue}
                                        onChange={e => setReadingValue(e.target.value)}
                                        placeholder={currentObraAllocation.details?.[`${readingType}Entrada`] ? `Leitura de entrada: ${currentObraAllocation.details[`${readingType}Entrada`]}` : ''}
                                        className="mt-1 w-full p-2 border rounded-md text-sm"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Local de Disponibilidade após Saída *</label>
                                     <input
                                         type="text"
                                         value={locationAfterDeallocate}
                                         onChange={e => setLocationAfterDeallocate(e.target.value)}
                                         placeholder="Ex: Pátio MAK Lajeado"
                                         className="mt-1 w-full p-2 border rounded-md text-sm"
                                         required
                                     />
                                </div>
                                <button onClick={checkAndDeallocate} disabled={isSaving || !dataSaida || readingValue === '' || !locationAfterDeallocate} className="w-full px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-red-300 flex items-center justify-center gap-2 text-sm">
                                     {isSaving ? <><Loader className="animate-spin" size={18}/> Finalizando...</> : "Finalizar Alocação"}
                                </button>
                            </div>
                        ) : (
                             // ALOCAR
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Alocar na Obra *</label>
                                    <select value={obraId} onChange={(e) => setObraId(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm bg-white" required>
                                        <option value="">Selecione...</option>
                                        {activeObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Alocar Funcionário *</label>
                                    <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm bg-white" required>
                                        <option value="">Selecione...</option>
                                        {availableEmployees.map(e => <option key={e.id} value={e.id}>{e.nome} ({e.funcao})</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Data de Entrada *</label>
                                    <input type="date" value={dataEntrada} onChange={e => setDataEntrada(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm" required/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">{readingLabel} de Entrada *</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={readingValue} 
                                        onChange={e => setReadingValue(e.target.value)}
                                        className="mt-1 w-full p-2 border rounded-md text-sm"
                                        required
                                    />
                                </div>
                                <button 
                                    onClick={handleAllocateClick} 
                                    disabled={isSaving || !obraId || !employeeId || readingValue === '' || restrictionAlert !== null} 
                                    className="w-full px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-gray-300 flex items-center justify-center gap-2 text-sm"
                                >
                                    {isSaving ? <><Loader className="animate-spin" size={18}/> Alocando...</> : "Alocar Veículo"}
                                </button>
                            </div>
                        )}
                    </div>
                     
                     <div className="p-4 bg-gray-50 border-t flex justify-end">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Fechar</button>
                    </div>
                </div>

                {isFinishObraModalOpen && (
                    <FinishObraModal
                        obra={obraToFinalize}
                        onClose={() => {
                            setIsFinishObraModalOpen(false);
                            handleDeallocate(false);
                        }}
                        onConfirm={(dataFim) => {
                            setIsFinishObraModalOpen(false);
                            handleDeallocate(true, dataFim);
                        }}
                    />
                )}

                {/* MODAL DE SENHA */}
                {showPasswordConfirm && PasswordConfirmationModal && (
                    <PasswordConfirmationModal
                        message="Este veículo possui restrições (documentos, revisão ou bloqueio de circulação). Digite sua senha para autorizar a alocação excepcional."
                        onConfirm={async () => {
                            await executeAllocate();
                            setShowPasswordConfirm(false);
                        }}
                        onClose={() => setShowPasswordConfirm(false)}
                    />
                )}
            </div>
        </>
    );
};

export default ObraAllocationModal;