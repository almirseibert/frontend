import React, { useState, useMemo, useEffect } from 'react';
import { Loader, X, AlertTriangle, Shield } from 'lucide-react';
import FinishObraModal from './FinishObraModal';
import { checkVehicleRestrictions, checkReadingConsistency, getVehicleMainReading } from '../utils/vehicleRules';

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
    PasswordConfirmationModal 
}) => {
    // Verifica se o veículo já está em obra (Lógica de Alocação Ativa)
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

    // --- LÓGICA DE LEITURA UNIFICADA (V2.0) ---
    // Grupo A (Km): Veículos Leves e Caminhões de Trecho
    // Grupo B (Hr): Caminhões Pesados e Máquinas
    const isKmVehicle = ['Veículos Leves', 'Caminhões de Trecho', 'Automóvel', 'Camionete', 'Caminhão Prancha'].includes(vehicle.tipo);
    const readingType = isKmVehicle ? 'odometro' : 'horimetro';
    const readingLabel = isKmVehicle ? 'Odômetro (Km)' : 'Horímetro (Hr)';
    
    // Define leitura atual (Fallback para a leitura principal do veículo se não houver entrada registrada)
    // Se estiver desalocando, sugere a leitura de entrada + um delta ou vazio
    const currentVehicleReading = getVehicleMainReading(vehicle).value || 0;
    
    // Se for edição/saída, tenta pegar o valor de entrada salvo, senão usa o atual do veículo
    const initialReading = currentObraAllocation 
                            ? (currentVehicleReading) // Na saída, sugerimos a leitura ATUAL do veículo
                            : (currentVehicleReading); // Na entrada, sugerimos a leitura ATUAL

    const [readingValue, setReadingValue] = useState(initialReading.toString());

    // Filtragem de Listas
    const activeObras = useMemo(() => obras.filter(o => o.status === 'ativa').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);
    
    const availableEmployees = useMemo(() =>
        (employees || [])
            .filter(e => e.status !== 'inativo' && (e.funcao === 'Operador de Máquina' || e.funcao === 'Motorista'))
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [employees]);

    const [isFinishObraModalOpen, setIsFinishObraModalOpen] = useState(false);
    const [obraToFinalize, setObraToFinalize] = useState(null);

    // --- VALIDAÇÃO DE RESTRIÇÕES E CONSISTÊNCIA ---
    const validateRestrictions = () => {
        setRestrictionAlert(null);
        
        // 1. Checagem de Documentos e Manutenção
        const staticIssues = checkVehicleRestrictions(vehicle, revisions);
        
        // 2. Checagem de Consistência de Leitura (Anti-Regressão e Salto)
        // Passamos o valor novo e o veículo para comparar com o banco
        const consistencyIssue = checkReadingConsistency(vehicle, readingValue);
        
        if (consistencyIssue) {
            staticIssues.push(consistencyIssue);
        }

        const blockingIssues = staticIssues.filter(i => i.type === 'bloqueio' || i.type === 'vencido' || i.type === 'erro_leitura');
        const warningIssues = staticIssues.filter(i => i.type === 'aviso');

        if (blockingIssues.length > 0 || warningIssues.length > 0) {
            setRestrictionAlert(staticIssues.map(i => i.message));
            return false; // Bloqueia fluxo normal
        }
        return true; // Sem restrições
    };

    const handleAllocateClick = (e) => {
        e.preventDefault();
        const readingFloat = parseFloat(readingValue);

        if (!obraId || !employeeId || readingValue === '' || isNaN(readingFloat)) {
            setAlertMessage(`Preencha a Obra, Funcionário e ${readingLabel} de Entrada.`);
            return;
        }

        // Se houver restrições, pede senha
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
                readingType: readingType, // 'odometro' ou 'horimetro'
                readingValue: parseFloat(readingValue)
            });
            setAlertMessage("Veículo alocado com sucesso!");
            reloadData();
            onClose();
        } catch (error) {
            console.error(error);
            setAlertMessage("Erro ao alocar veículo: " + (error.response?.data?.message || error.message));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeallocate = async (shouldFinalizeObra = false, dataFimObra = null) => {
         // Valida leitura na saída também
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
        
        // Verifica se é o último veículo ativo na obra
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
                <div className="bg-white rounded-lg shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
                    
                    {/* 1. CABEÇALHO */}
                    <div className="p-6 border-b flex justify-between items-center bg-gray-50 flex-none rounded-t-lg">
                        <h2 className="text-xl font-bold text-gray-800">Alocação de Veículo em Obra</h2>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                    </div>

                    {/* 2. CONTEÚDO */}
                    <div className="flex-1 overflow-y-auto">
                        
                        {/* Alertas de Restrição */}
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
                            <div className="text-sm text-gray-600 mb-2 bg-gray-100 p-2 rounded flex justify-between items-center">
                                <span><strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.placa}</span>
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-bold">{isKmVehicle ? 'Controle Km' : 'Controle Horas'}</span>
                            </div>

                            {currentObraAllocation ? (
                                // --- MODO DESALOCAR (SAÍDA) ---
                                <div className="space-y-4">
                                    <div className="p-3 bg-blue-50 rounded border border-blue-100 text-blue-800 text-sm">
                                        Alocado na obra: <strong>{obras.find(o => o.id === vehicle.obraAtualId)?.nome || 'Desconhecida'}</strong>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Data de Saída *</label>
                                            <input type="date" value={dataSaida} onChange={e => setDataSaida(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-sm" required/>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">{readingLabel} Final *</label>
                                            <input
                                                type="number"
                                                step="any"
                                                value={readingValue}
                                                onChange={e => setReadingValue(e.target.value)}
                                                placeholder={`Atual: ${currentVehicleReading}`}
                                                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                                                required
                                            />
                                        </div>
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
                                        className="w-full px-4 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-gray-400 flex items-center justify-center gap-2 text-sm shadow-md"
                                    >
                                         {isSaving ? <><Loader className="animate-spin" size={18}/> Finalizando...</> : "Finalizar Alocação"}
                                    </button>
                                </div>
                            ) : (
                                // --- MODO ALOCAR (ENTRADA) ---
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
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Data de Entrada *</label>
                                            <input type="date" value={dataEntrada} onChange={e => setDataEntrada(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-green-500 text-sm" required/>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">{readingLabel} Inicial *</label>
                                            <input
                                                type="number"
                                                step="any"
                                                value={readingValue} 
                                                onChange={e => setReadingValue(e.target.value)}
                                                placeholder="Leitura atual"
                                                className="w-full p-2 border rounded focus:ring-2 focus:ring-green-500 text-sm font-mono"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <button 
                                        onClick={handleAllocateClick} 
                                        disabled={isSaving || !obraId || !employeeId || readingValue === '' || restrictionAlert !== null} 
                                        className="w-full px-4 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm transition-colors shadow-md"
                                    >
                                        {isSaving ? <><Loader className="animate-spin" size={18}/> Alocando...</> : "Confirmar Alocação"}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* 3. RODAPÉ */}
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