import React, { useState, useMemo } from 'react';
import { Loader, X, AlertTriangle, Shield } from 'lucide-react';
import FinishObraModal from './FinishObraModal';
import { getAllowedReadingTypes, getVehicleMainReading, checkVehicleRestrictions, checkReadingConsistency } from '../utils/vehicleRules';

const ObraAllocationModal = ({ 
    user, 
    vehicle, 
    obras = [], 
    employees = [], 
    revisions = [], 
    onClose, 
    setAlertMessage, 
    apiClient, 
    reloadData, 
    vehicles = [], 
    vehicleGroups = {}, 
    PasswordConfirmationModal 
}) => {
    // Verifica se o veículo já está em obra
    const currentObraAllocation = (Array.isArray(vehicle.history) ? vehicle.history : [])
                                    .find(h => (h.type === 'obra' || h.historyType === 'obra') && !h.endDate && !h.dataSaida);

    const [obraId, setObraId] = useState(currentObraAllocation ? vehicle.obraAtualId : '');
    const [employeeId, setEmployeeId] = useState(currentObraAllocation?.details?.employeeId || '');
    const [dataEntrada, setDataEntrada] = useState(currentObraAllocation ? new Date(currentObraAllocation.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    const [dataSaida, setDataSaida] = useState(new Date().toISOString().split('T')[0]); 
    const [locationAfterDeallocate, setLocationAfterDeallocate] = useState('Pátio MAK Lajeado');
    const [isSaving, setIsSaving] = useState(false);

    // Estados de Segurança e Alertas
    const [restrictionAlert, setRestrictionAlert] = useState(null);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
    const [blockedAction, setBlockedAction] = useState(null); 

    // --- LÓGICA DE LEITURA CENTRALIZADA ---
    const allowedTypes = getAllowedReadingTypes(vehicle.tipo); 
    const readingType = allowedTypes.includes('horimetro') ? 'horimetro' : 'odometro';
    const readingLabel = readingType === 'horimetro' ? 'Horímetro' : 'Odômetro';
    
    // Define leitura inicial
    const initialReading = currentObraAllocation
                            ? (currentObraAllocation.details?.[`${readingType}Entrada`] || '') 
                            : (getVehicleMainReading(vehicle).value || '');

    const [readingValue, setReadingValue] = useState(initialReading.toString());

    const activeObras = useMemo(() => obras.filter(o => o.status === 'ativa').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);
    const availableEmployees = useMemo(() =>
        (employees || [])
            .filter(e => e.status !== 'inativo' && (e.funcao === 'Operador de Máquina' || e.funcao === 'Motorista'))
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [employees]);

    const [isFinishObraModalOpen, setIsFinishObraModalOpen] = useState(false);
    const [obraToFinalize, setObraToFinalize] = useState(null);

    // --- VERIFICAÇÃO DE RESTRIÇÕES ---
    const validateRestrictions = () => {
        setRestrictionAlert(null);
        const staticIssues = checkVehicleRestrictions(vehicle, revisions);
        const consistencyIssue = checkReadingConsistency(vehicle, readingValue);
        if (consistencyIssue) {
            staticIssues.push(consistencyIssue);
        }

        const blockingIssues = staticIssues.filter(i => i.type === 'bloqueio' || i.type === 'vencido');
        const warningIssues = staticIssues.filter(i => i.type === 'aviso');

        if (blockingIssues.length > 0 || warningIssues.length > 0) {
            setRestrictionAlert(staticIssues.map(i => i.message));
            return false; 
        }
        return true; 
    };

    const handleAllocateClick = (e) => {
        e.preventDefault();
        const readingFloat = parseFloat(readingValue);

        if (!obraId || !employeeId || readingValue === '' || isNaN(readingFloat)) {
            setAlertMessage(`Preencha a Obra, Funcionário e ${readingLabel} de Entrada.`);
            return;
        }

        if (!validateRestrictions()) {
            setBlockedAction(() => executeAllocate); 
            return; 
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
            console.error(error);
            setAlertMessage("Erro ao alocar veículo: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeallocate = async (shouldFinalizeObra = false, dataFimObra = null) => {
         if (!validateRestrictions()) {
            setBlockedAction(() => () => executeDeallocate(shouldFinalizeObra, dataFimObra));
            return;
         }
         executeDeallocate(shouldFinalizeObra, dataFimObra);
    };

    const executeDeallocate = async (shouldFinalizeObra, dataFimObra) => {
        const readingFloat = parseFloat(readingValue);
        
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
        const readingFloat = parseFloat(readingValue);
        if (readingValue === '' || isNaN(readingFloat)) {
            setAlertMessage(`Preencha o ${readingLabel} de Saída.`);
            return;
        }

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
            {/* Fundo escuro */}
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                {/* Container Modal: flex-col e max-h-[90vh] para garantir que cabe na tela */}
                <div className="bg-white rounded-lg shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
                    
                    {/* 1. CABEÇALHO FIXO */}
                    <div className="p-6 border-b flex justify-between items-center bg-gray-50 flex-none rounded-t-lg">
                        <h2 className="text-xl font-bold text-gray-800">Alocação de Veículo em Obra</h2>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                    </div>

                    {/* 2. ÁREA DE ROLAGEM (Alertas + Formulário) */}
                    <div className="flex-1 overflow-y-auto">
                        
                        {/* Painel de Alerta (dentro da rolagem) */}
                        {restrictionAlert && restrictionAlert.length > 0 && (
                            <div className="bg-red-50 p-4 border-b border-red-100 animate-pulse-once">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="text-red-600 shrink-0 mt-1" size={24} />
                                    <div className="flex-1">
                                        <h3 className="font-bold text-red-800 text-sm uppercase tracking-wide mb-1">Atenção: Restrições Detectadas</h3>
                                        <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                                            {restrictionAlert.map((msg, idx) => (
                                                <li key={idx}>{msg}</li>
                                            ))}
                                        </ul>
                                        <div className="mt-3 bg-white bg-opacity-50 p-2 rounded text-xs text-red-800 font-semibold border border-red-100">
                                            É necessária autorização de supervisor (Senha) para prosseguir.
                                        </div>
                                        <button 
                                            type="button"
                                            onClick={() => setShowPasswordConfirm(true)}
                                            className="mt-3 w-full py-2 bg-red-600 text-white rounded font-bold text-sm hover:bg-red-700 shadow-sm flex items-center justify-center gap-2 transition-all"
                                        >
                                            <Shield size={16} /> AUTORIZAR AÇÃO
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Formulário */}
                        <div className="p-6 space-y-4">
                            <div className="text-sm text-gray-600 mb-2 bg-gray-100 p-2 rounded">
                                <strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo} ({vehicle.placa})
                            </div>

                            {currentObraAllocation ? (
                                // --- MODO DESALOCAR ---
                                <div className="space-y-4">
                                    <div className="p-3 bg-blue-50 rounded border border-blue-100 text-blue-800 text-sm">
                                        Alocado na obra: <strong>{obras.find(o => o.id === vehicle.obraAtualId)?.nome || 'Desconhecida'}</strong>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Data de Saída *</label>
                                        <input type="date" value={dataSaida} onChange={e => setDataSaida(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-sm" required/>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{readingLabel} de Saída *</label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={readingValue}
                                            onChange={e => setReadingValue(e.target.value)}
                                            placeholder={currentObraAllocation.details?.[`${readingType}Entrada`] ? `Entrada: ${currentObraAllocation.details[`${readingType}Entrada`]}` : ''}
                                            className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-sm"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Local de Disponibilidade após Saída *</label>
                                         <input
                                             type="text"
                                             value={locationAfterDeallocate}
                                             onChange={e => setLocationAfterDeallocate(e.target.value)}
                                             placeholder="Ex: Pátio MAK Lajeado"
                                             className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-sm"
                                             required
                                         />
                                    </div>
                                    <button 
                                        onClick={checkAndDeallocate} 
                                        disabled={isSaving || !dataSaida || readingValue === '' || !locationAfterDeallocate || restrictionAlert !== null} 
                                        className="w-full px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-gray-400 flex items-center justify-center gap-2 text-sm"
                                    >
                                         {isSaving ? <><Loader className="animate-spin" size={18}/> Finalizando...</> : "Finalizar Alocação"}
                                    </button>
                                </div>
                            ) : (
                                // --- MODO ALOCAR ---
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Obra Destino *</label>
                                        <select value={obraId} onChange={(e) => setObraId(e.target.value)} className="w-full p-2 border rounded bg-white focus:ring-2 focus:ring-green-500 text-sm" required>
                                            <option value="">Selecione...</option>
                                            {activeObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Funcionário Responsável *</label>
                                        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full p-2 border rounded bg-white focus:ring-2 focus:ring-green-500 text-sm" required>
                                            <option value="">Selecione...</option>
                                            {availableEmployees.map(e => <option key={e.id} value={e.id}>{e.nome} ({e.funcao})</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Data de Entrada *</label>
                                        <input type="date" value={dataEntrada} onChange={e => setDataEntrada(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-green-500 text-sm" required/>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{readingLabel} de Entrada *</label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={readingValue} 
                                            onChange={e => setReadingValue(e.target.value)}
                                            placeholder="Leitura atual"
                                            className="w-full p-2 border rounded focus:ring-2 focus:ring-green-500 text-sm"
                                            required
                                        />
                                    </div>
                                    <button 
                                        onClick={handleAllocateClick} 
                                        disabled={isSaving || !obraId || !employeeId || readingValue === '' || restrictionAlert !== null} 
                                        className="w-full px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm transition-colors"
                                    >
                                        {isSaving ? <><Loader className="animate-spin" size={18}/> Alocando...</> : "Alocar Veículo"}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* 3. RODAPÉ FIXO */}
                    <div className="p-4 bg-gray-50 border-t flex justify-end flex-none rounded-b-lg">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-300" disabled={isSaving}>Fechar</button>
                    </div>
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

            {showPasswordConfirm && PasswordConfirmationModal && (
                <PasswordConfirmationModal
                    message="ATENÇÃO: Existem restrições ou inconsistências de leitura. Digite sua senha de supervisor para CONFIRMAR."
                    onConfirm={async () => {
                        if (blockedAction) {
                            await blockedAction();
                        }
                        setShowPasswordConfirm(false);
                        setBlockedAction(null);
                    }}
                    onClose={() => {
                        setShowPasswordConfirm(false);
                        setBlockedAction(null);
                    }}
                />
            )}
        </>
    );
};

export default ObraAllocationModal;