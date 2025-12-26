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
    // --- ESTADOS E CARREGAMENTO DE DADOS COMPLETOS ---
    const [fullVehicleData, setFullVehicleData] = useState(vehicle);
    const [isLoadingData, setIsLoadingData] = useState(false);
    
    // Efeito para garantir que temos o histórico completo para detectar alocação
    useEffect(() => {
        const fetchFullData = async () => {
            // Se o veículo veio da lista, pode não ter history. Buscamos.
            if (vehicle && (!vehicle.history || vehicle.history.length === 0) && apiClient) {
                setIsLoadingData(true);
                try {
                    const data = await apiClient.getVehicleById(vehicle.id);
                    if (data) setFullVehicleData(data);
                } catch (err) {
                    console.error("Erro ao buscar detalhes do veículo para alocação:", err);
                } finally {
                    setIsLoadingData(false);
                }
            }
        };
        fetchFullData();
    }, [vehicle, apiClient]);


    // Lógica de Alocação Ativa baseada nos dados completos
    const currentObraAllocation = useMemo(() => {
        const history = fullVehicleData?.history || [];
        return history.find(h => (h.type === 'obra' || h.historyType === 'obra') && !h.endDate && !h.dataSaida);
    }, [fullVehicleData]);

    const isDeallocating = !!currentObraAllocation;

    // --- ESTADOS DO FORMULÁRIO ---
    const [obraId, setObraId] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [dataEntrada, setDataEntrada] = useState(new Date().toISOString().split('T')[0]);
    const [dataSaida, setDataSaida] = useState(new Date().toISOString().split('T')[0]); 
    const [leituraEntrada, setLeituraEntrada] = useState('');
    const [observacoes, setObservacoes] = useState('');
    
    // Atualiza formulário quando detecta alocação (após load)
    useEffect(() => {
        if (currentObraAllocation) {
            setObraId(fullVehicleData.obraAtualId || '');
            setEmployeeId(currentObraAllocation.details?.employeeId || '');
            setDataEntrada(currentObraAllocation.startDate ? new Date(currentObraAllocation.startDate).toISOString().split('T')[0] : '');
        } else {
             // Defaults para nova alocação
             const reading = getVehicleMainReading(fullVehicleData);
             setLeituraEntrada(reading.value || '');
        }
    }, [currentObraAllocation, fullVehicleData]);


    const [isSaving, setIsSaving] = useState(false);
    const [isFinishObraModalOpen, setIsFinishObraModalOpen] = useState(false);

    // Estados de Segurança (Bloqueios e Senha)
    const [restrictionAlert, setRestrictionAlert] = useState(null);
    const [readingWarning, setReadingWarning] = useState(null);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
    const [blockedAction, setBlockedAction] = useState(null); // Guarda a função a ser executada após senha

    // Verifica restrições ao abrir (apenas se for alocar)
    useEffect(() => {
        if (!isDeallocating) {
            const issues = checkVehicleRestrictions(fullVehicleData, revisions);
            if (issues.length > 0) {
                setRestrictionAlert(issues);
            } else {
                setRestrictionAlert(null);
            }
        }
    }, [fullVehicleData, revisions, isDeallocating]);

    // Handlers
    const handleAllocate = async () => {
        // Validação de Leitura na Entrada
        const readingCheck = checkReadingConsistency(fullVehicleData, leituraEntrada, fullVehicleData.mediaCalculo || 'odometro');
        
        if (readingCheck.status === 'bloqueio') {
            setReadingWarning(readingCheck.message);
            setBlockedAction(() => executeAllocate); // Guarda a ação para depois da senha
            setShowPasswordConfirm(true);
            return;
        }

        await executeAllocate();
    };

    const executeAllocate = async () => {
        setIsSaving(true);
        try {
            await apiClient.allocateToObra(fullVehicleData.id, {
                obraId,
                employeeId,
                dataEntrada,
                leituraEntrada,
                observacoes
            });
            setAlertMessage("Veículo alocado com sucesso!");
            reloadData();
            onClose();
        } catch (error) {
            console.error(error);
            setAlertMessage("Erro ao alocar veículo.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeallocate = async (confirm, dataFim) => {
        if (!confirm) return;
        setIsSaving(true);
        try {
            await apiClient.deallocateFromObra(fullVehicleData.id, {
                dataSaida: dataFim || dataSaida
            });
            setAlertMessage("Veículo desalocado com sucesso!");
            reloadData();
            onClose();
        } catch (error) {
            console.error(error);
            setAlertMessage("Erro ao desalocar veículo.");
        } finally {
            setIsSaving(false);
        }
    };

    // Renderização
    if (isLoadingData) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                <div className="bg-white p-6 rounded-xl shadow-lg flex items-center gap-3">
                    <Loader className="animate-spin text-yellow-500" />
                    <span>Carregando dados da alocação...</span>
                </div>
            </div>
        );
    }

    const modalTitle = isDeallocating ? "Finalizar Alocação (Desalocar)" : "Alocar Veículo em Obra";
    const readingUnit = getVehicleMainReading(fullVehicleData).unit;

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
                    
                    {/* Header */}
                    <div className={`p-4 border-b flex justify-between items-center ${isDeallocating ? 'bg-red-50' : 'bg-gray-50'}`}>
                        <h3 className={`text-lg font-bold ${isDeallocating ? 'text-red-800' : 'text-gray-800'}`}>{modalTitle}</h3>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 text-gray-500"><X size={20}/></button>
                    </div>

                    <div className="p-6">
                        {/* Info Veículo */}
                        <div className="mb-4 p-3 bg-gray-50 rounded-lg border flex justify-between items-center">
                            <div>
                                <span className="text-xs font-bold text-gray-500 uppercase">Veículo</span>
                                <p className="font-bold text-gray-800">{fullVehicleData.registroInterno} - {fullVehicleData.placa}</p>
                            </div>
                            <div className="text-right">
                                <span className="text-xs font-bold text-gray-500 uppercase">Leitura Atual</span>
                                <p className="font-bold text-gray-800">{getVehicleMainReading(fullVehicleData).value} {readingUnit}</p>
                            </div>
                        </div>

                        {/* Alerta de Restrição */}
                        {restrictionAlert && !isDeallocating && (
                            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2 text-red-800 font-bold">
                                    <Shield size={18}/> Veículo com Restrições
                                </div>
                                <ul className="list-disc list-inside text-xs text-red-700 space-y-1">
                                    {restrictionAlert.map((issue, idx) => (
                                        <li key={idx}>{issue.message}</li>
                                    ))}
                                </ul>
                                <p className="text-xs mt-2 font-medium text-red-800">A alocação exigirá senha de supervisor.</p>
                            </div>
                        )}

                        {/* Modo DESALOCAÇÃO */}
                        {isDeallocating ? (
                            <div className="space-y-4">
                                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                                    <p className="font-bold mb-1">Status Atual: EM OBRA</p>
                                    <p>Este veículo está alocado desde <strong>{new Date(dataEntrada).toLocaleDateString('pt-BR')}</strong>.</p>
                                    <p>Deseja finalizar esta alocação e retorná-lo para 'Disponível'?</p>
                                </div>
                                <button 
                                    onClick={() => setIsFinishObraModalOpen(true)}
                                    className="w-full py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-md flex justify-center items-center gap-2"
                                >
                                    {isSaving ? <Loader className="animate-spin"/> : "Confirmar Desalocação"}
                                </button>
                            </div>
                        ) : (
                            /* Modo ALOCAÇÃO (Novo) */
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Obra de Destino *</label>
                                    <select 
                                        value={obraId} 
                                        onChange={(e) => setObraId(e.target.value)} 
                                        className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none bg-white"
                                    >
                                        <option value="">Selecione a Obra...</option>
                                        {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Data Início *</label>
                                        <input type="date" value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Leitura Inicial ({readingUnit}) *</label>
                                        <input type="number" value={leituraEntrada} onChange={(e) => setLeituraEntrada(e.target.value)} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Responsável (Opcional)</label>
                                    <select 
                                        value={employeeId} 
                                        onChange={(e) => setEmployeeId(e.target.value)} 
                                        className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none bg-white"
                                    >
                                        <option value="">Selecione...</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                                    <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" rows="2"></textarea>
                                </div>

                                <button 
                                    onClick={() => {
                                        if (restrictionAlert) {
                                            setBlockedAction(() => handleAllocate);
                                            setShowPasswordConfirm(true);
                                        } else {
                                            handleAllocate();
                                        }
                                    }}
                                    disabled={isSaving || !obraId || !dataEntrada || !leituraEntrada}
                                    className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-md flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? <Loader className="animate-spin"/> : "Confirmar Alocação"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isFinishObraModalOpen && (
                <FinishObraModal
                    obra={obras.find(o => o.id === fullVehicleData.obraAtualId)} // Passa objeto obra correto
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
                    message={readingWarning ? `ATENÇÃO: ${readingWarning}` : "ATENÇÃO: Existem restrições ou inconsistências. Digite senha de supervisor."}
                    onConfirm={async () => {
                        if (blockedAction) {
                            await blockedAction();
                        }
                        setShowPasswordConfirm(false);
                        setBlockedAction(null);
                        setReadingWarning(null);
                    }}
                    onClose={() => {
                        setShowPasswordConfirm(false);
                        setBlockedAction(null);
                        setReadingWarning(null);
                    }}
                />
            )}
        </>
    );
};

export default ObraAllocationModal;