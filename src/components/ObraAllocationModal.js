import React, { useState, useMemo, useEffect } from 'react';
import { Loader, X, Shield, ArrowRight } from 'lucide-react';
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
    // --- DADOS COMPLETOS E ESTADO ---
    const [fullVehicleData, setFullVehicleData] = useState(vehicle);
    const [isLoadingData, setIsLoadingData] = useState(false);
    
    // Busca dados atualizados para garantir que sabemos se está em obra
    useEffect(() => {
        const fetchFullData = async () => {
            if (vehicle && apiClient) {
                // Se não tem history ou queremos garantir status fresco
                setIsLoadingData(true);
                try {
                    const data = await apiClient.getVehicleById(vehicle.id);
                    if (data) setFullVehicleData(data);
                } catch (err) {
                    console.error("Erro ao buscar detalhes:", err);
                } finally {
                    setIsLoadingData(false);
                }
            }
        };
        fetchFullData();
    }, [vehicle, apiClient]);


    // Detecta se está alocado (Deallocation Mode)
    const currentObraAllocation = useMemo(() => {
        const history = fullVehicleData?.history || [];
        return history.find(h => (h.type === 'obra' || h.historyType === 'obra') && !h.endDate && !h.dataSaida);
    }, [fullVehicleData]);

    const isDeallocating = !!currentObraAllocation;

    // --- FORMULÁRIO ---
    const [obraId, setObraId] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [dataEntrada, setDataEntrada] = useState(new Date().toISOString().split('T')[0]);
    const [leituraEntrada, setLeituraEntrada] = useState('');
    const [observacoes, setObservacoes] = useState('');
    
    // Preenche form
    useEffect(() => {
        if (currentObraAllocation) {
            setObraId(fullVehicleData.obraAtualId || '');
            setDataEntrada(currentObraAllocation.startDate ? new Date(currentObraAllocation.startDate).toISOString().split('T')[0] : '');
        } else {
             const reading = getVehicleMainReading(fullVehicleData);
             setLeituraEntrada(reading.value || '');
        }
    }, [currentObraAllocation, fullVehicleData]);

    const [isSaving, setIsSaving] = useState(false);
    const [isFinishObraModalOpen, setIsFinishObraModalOpen] = useState(false);
    
    // Segurança
    const [restrictionAlert, setRestrictionAlert] = useState(null);
    const [readingWarning, setReadingWarning] = useState(null);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
    const [blockedAction, setBlockedAction] = useState(null);

    // Verifica restrições
    useEffect(() => {
        if (!isDeallocating) {
            const issues = checkVehicleRestrictions(fullVehicleData, revisions);
            setRestrictionAlert(issues.length > 0 ? issues : null);
        }
    }, [fullVehicleData, revisions, isDeallocating]);

    // Handlers
    const handleAllocate = async () => {
        const readingCheck = checkReadingConsistency(fullVehicleData, leituraEntrada, fullVehicleData.mediaCalculo || 'odometro');
        if (readingCheck.status === 'bloqueio') {
            setReadingWarning(readingCheck.message);
            setBlockedAction(() => executeAllocate);
            setShowPasswordConfirm(true);
            return;
        }
        await executeAllocate();
    };

    const executeAllocate = async () => {
        setIsSaving(true);
        try {
            await apiClient.allocateToObra(fullVehicleData.id, {
                obraId, employeeId, dataEntrada, leituraEntrada, observacoes
            });
            setAlertMessage("Veículo alocado!");
            reloadData(); onClose();
        } catch (error) {
            console.error(error); setAlertMessage("Erro ao alocar.");
        } finally { setIsSaving(false); }
    };

    const handleDeallocate = async (confirm, dataFim) => {
        if (!confirm) return;
        setIsSaving(true);
        try {
            await apiClient.deallocateFromObra(fullVehicleData.id, { dataSaida: dataFim });
            setAlertMessage("Veículo desalocado!");
            reloadData(); onClose();
        } catch (error) {
            console.error(error); setAlertMessage("Erro ao desalocar.");
        } finally { setIsSaving(false); }
    };

    if (isLoadingData) {
        return <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><Loader className="animate-spin text-white"/></div>;
    }

    const modalTitle = isDeallocating ? "Finalizar Alocação" : "Alocar em Obra";
    const readingUnit = getVehicleMainReading(fullVehicleData).unit;

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden animate-scale-in flex flex-col max-h-[95vh]">
                    
                    {/* Header Compacto */}
                    <div className={`px-3 py-2 border-b flex justify-between items-center ${isDeallocating ? 'bg-red-50' : 'bg-gray-50'}`}>
                        <h3 className={`text-sm font-bold ${isDeallocating ? 'text-red-800' : 'text-gray-800'}`}>{modalTitle}</h3>
                        <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 text-gray-500"><X size={16}/></button>
                    </div>

                    <div className="p-3 overflow-y-auto custom-scrollbar">
                        {/* Info Veículo Mini */}
                        <div className="mb-2 p-1.5 bg-gray-50 rounded border flex justify-between items-center text-xs">
                            <div>
                                <span className="font-bold text-gray-500 uppercase block text-[10px]">Veículo</span>
                                <span className="font-bold text-gray-800">{fullVehicleData.registroInterno}</span>
                            </div>
                            <div className="text-right">
                                <span className="font-bold text-gray-500 uppercase block text-[10px]">Leitura</span>
                                <span className="font-bold text-gray-800">{getVehicleMainReading(fullVehicleData).value} {readingUnit}</span>
                            </div>
                        </div>

                        {restrictionAlert && !isDeallocating && (
                            <div className="mb-2 bg-red-50 border border-red-200 rounded p-1.5">
                                <div className="flex items-center gap-1 mb-0.5 text-red-800 font-bold text-xs">
                                    <Shield size={12}/> Restrições
                                </div>
                                <ul className="list-disc list-inside text-[10px] text-red-700">
                                    {restrictionAlert.map((issue, idx) => <li key={idx}>{issue.message}</li>)}
                                </ul>
                            </div>
                        )}

                        {isDeallocating ? (
                            <div className="space-y-3">
                                <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                                    <p className="font-bold mb-0.5">Veículo atualmente EM OBRA</p>
                                    <p>Alocado em: <strong>{new Date(dataEntrada).toLocaleDateString('pt-BR')}</strong></p>
                                </div>
                                
                                {/* Info de Destino Solicitada */}
                                <div className="flex items-center justify-between p-2 border rounded bg-gray-50">
                                    <div className="text-[10px] text-gray-500 font-bold uppercase">Destino</div>
                                    <div className="text-xs font-bold text-gray-800 flex items-center gap-1">
                                        Pátio Central <ArrowRight size={12} className="text-green-500"/>
                                    </div>
                                </div>

                                <button 
                                    onClick={() => setIsFinishObraModalOpen(true)}
                                    className="w-full py-2 bg-red-600 text-white font-bold rounded hover:bg-red-700 text-xs flex justify-center items-center gap-1.5"
                                >
                                    {isSaving ? <Loader size={14} className="animate-spin"/> : "Desalocar Veículo"}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Obra de Destino *</label>
                                    <select 
                                        value={obraId} 
                                        onChange={(e) => setObraId(e.target.value)} 
                                        className="w-full p-1.5 border rounded focus:ring-1 focus:ring-yellow-400 outline-none bg-white text-xs"
                                    >
                                        <option value="">Selecione...</option>
                                        {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Data Início *</label>
                                        <input type="date" value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} className="w-full p-1.5 border rounded focus:ring-1 focus:ring-yellow-400 outline-none text-xs" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Leitura ({readingUnit}) *</label>
                                        <input type="number" value={leituraEntrada} onChange={(e) => setLeituraEntrada(e.target.value)} className="w-full p-1.5 border rounded focus:ring-1 focus:ring-yellow-400 outline-none text-xs" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Responsável</label>
                                    <select 
                                        value={employeeId} 
                                        onChange={(e) => setEmployeeId(e.target.value)} 
                                        className="w-full p-1.5 border rounded focus:ring-1 focus:ring-yellow-400 outline-none bg-white text-xs"
                                    >
                                        <option value="">Selecione...</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Observações</label>
                                    <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className="w-full p-1.5 border rounded focus:ring-1 focus:ring-yellow-400 outline-none text-xs" rows="2"></textarea>
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
                                    className="w-full py-2 bg-green-600 text-white font-bold rounded hover:bg-green-700 text-xs flex justify-center items-center gap-1.5 disabled:opacity-50"
                                >
                                    {isSaving ? <Loader size={14} className="animate-spin"/> : "Confirmar Alocação"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isFinishObraModalOpen && (
                <FinishObraModal
                    obra={obras.find(o => o.id === fullVehicleData.obraAtualId)}
                    onClose={() => { setIsFinishObraModalOpen(false); handleDeallocate(false); }}
                    onConfirm={(dataFim) => { setIsFinishObraModalOpen(false); handleDeallocate(true, dataFim); }}
                />
            )}

            {showPasswordConfirm && PasswordConfirmationModal && (
                <PasswordConfirmationModal
                    message={readingWarning || "Restrições detectadas. Senha de supervisor necessária."}
                    onConfirm={async () => {
                        if (blockedAction) await blockedAction();
                        setShowPasswordConfirm(false); setBlockedAction(null); setReadingWarning(null);
                    }}
                    onClose={() => { setShowPasswordConfirm(false); setBlockedAction(null); setReadingWarning(null); }}
                />
            )}
        </>
    );
};

export default ObraAllocationModal;