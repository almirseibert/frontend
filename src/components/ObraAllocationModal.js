import React, { useState, useMemo } from 'react';
import { Loader, X, AlertTriangle, Shield } from 'lucide-react';
import FinishObraModal from './FinishObraModal';
import { getAllowedReadingTypes, getVehicleMainReading, checkVehicleRestrictions } from '../utils/vehicleRules';

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

    // Estados de Segurança
    const [restrictionAlert, setRestrictionAlert] = useState(null);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

    // --- LÓGICA DE LEITURA CENTRALIZADA ---
    // Usa a regra central para definir se pede Km ou Hr
    const allowedTypes = getAllowedReadingTypes(vehicle.tipo); 
    const readingType = allowedTypes.includes('horimetro') ? 'horimetro' : 'odometro';
    const readingLabel = readingType === 'horimetro' ? 'Horímetro' : 'Odômetro';
    
    // Define leitura inicial (da alocação atual ou do veículo)
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

    // --- VERIFICAÇÃO DE RESTRIÇÕES (USANDO UTILITÁRIO CENTRAL) ---
    const validateRestrictions = () => {
        // Chama a função central que verifica datas, km, checkbox e documentos
        const issues = checkVehicleRestrictions(vehicle, revisions);
        
        if (issues.length > 0) {
            // Formata as mensagens para exibir no alerta
            setRestrictionAlert(issues.map(i => `• ${i.message}`));
            return false; // Bloqueia
        }
        return true; // Permite
    };

    const handleAllocateClick = (e) => {
        e.preventDefault();
        const readingFloat = parseFloat(readingValue);

        if (!obraId || !employeeId || readingValue === '' || isNaN(readingFloat)) {
            setAlertMessage(`Preencha a Obra, Funcionário e ${readingLabel} de Entrada.`);
            return;
        }

        // Executa validação antes de prosseguir
        const isValid = validateRestrictions();
        if (!isValid) {
            return; // Se inválido, o estado restrictionAlert foi setado e o UI vai mudar
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
        const readingFloat = parseFloat(readingValue);
         if (readingValue === '' || isNaN(readingFloat)) {
             setAlertMessage(`Preencha o ${readingLabel} de Saída.`);
             return;
         }
         
         // Validação básica de leitura de saída >= entrada
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
        // Verifica se há outros veículos ativos nesta obra
        const otherActiveVehicles = historico.filter(h => h.veiculoId !== vehicle.id && !h.dataSaida);

        if (otherActiveVehicles.length === 0) { 
            // Se for o último veículo, sugere finalizar a obra
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
                        <h2 className="text-xl font-bold text-gray-800">Alocação de Veículo em Obra</h2>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                    </div>

                    {/* --- ALERTA DE RESTRIÇÃO E BLOQUEIO --- */}
                    {restrictionAlert && !currentObraAllocation && (
                        <div className="p-4 bg-red-50 border-b border-red-100 animate-fade-in">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="text-red-600 shrink-0 mt-1" />
                                <div>
                                    <h3 className="font-bold text-red-700 text-sm uppercase">Restrições Detectadas</h3>
                                    <div className="text-red-600 text-sm mt-1 space-y-1">
                                        {restrictionAlert.map((issue, idx) => (
                                            <p key={idx}>{issue}</p>
                                        ))}
                                    </div>
                                    <p className="text-xs text-red-500 mt-2 font-semibold">
                                        É necessário autorização via senha para prosseguir.
                                    </p>
                                    <button 
                                        type="button"
                                        onClick={() => setShowPasswordConfirm(true)}
                                        className="mt-3 w-full py-2 bg-red-600 text-white rounded font-bold text-sm hover:bg-red-700 flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <Shield size={16} /> Autorizar com Senha
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="p-6 space-y-4">
                        <div className="text-sm text-gray-600 mb-2">
                            <strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo} ({vehicle.placa})
                        </div>

                        {/* --- MODO DESALOCAR --- */}
                        {currentObraAllocation ? (
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
                                <button onClick={checkAndDeallocate} disabled={isSaving || !dataSaida || readingValue === '' || !locationAfterDeallocate} className="w-full px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-red-300 flex items-center justify-center gap-2 text-sm">
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
                                    // Desabilita botão se houver restrição ativa que não foi autorizada
                                    disabled={isSaving || !obraId || !employeeId || readingValue === '' || restrictionAlert !== null} 
                                    className="w-full px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                                >
                                    {isSaving ? <><Loader className="animate-spin" size={18}/> Alocando...</> : "Alocar Veículo"}
                                </button>
                            </div>
                        )}
                    </div>
                    
                    {/* Rodapé Padrão */}
                    <div className="p-4 bg-gray-50 border-t flex justify-end">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-300" disabled={isSaving}>Fechar</button>
                    </div>
                </div>
            </div>

            {/* Modal de Confirmação para Finalizar Obra */}
            {isFinishObraModalOpen && (
                <FinishObraModal
                    obra={obraToFinalize}
                    onClose={() => {
                        setIsFinishObraModalOpen(false);
                        handleDeallocate(false); // Apenas desaloca se o usuário cancelar a finalização da obra
                    }}
                    onConfirm={(dataFim) => {
                        setIsFinishObraModalOpen(false);
                        handleDeallocate(true, dataFim); // Desaloca E finaliza obra
                    }}
                />
            )}

            {/* Modal de Senha para Autorização Excepcional */}
            {showPasswordConfirm && PasswordConfirmationModal && (
                <PasswordConfirmationModal
                    message="Este veículo possui restrições (documentos vencidos, revisão pendente ou bloqueio de circulação). Digite sua senha para autorizar a alocação."
                    onConfirm={async () => {
                        await executeAllocate(); // Executa a ação bloqueada
                        setShowPasswordConfirm(false);
                    }}
                    onClose={() => setShowPasswordConfirm(false)}
                />
            )}
        </>
    );
};

export default ObraAllocationModal;