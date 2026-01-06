import React, { useState, useMemo } from 'react';
import { Loader, X, AlertTriangle, Shield, Calendar, Gauge, MapPin } from 'lucide-react';
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
    PasswordConfirmationModal 
}) => {
    // --- LÓGICA CORRIGIDA: Detecção de Estado ---
    const isAllocated = !!vehicle.obraAtualId;
    
    // Tenta achar o registro histórico aberto correspondente
    const currentObraAllocation = useMemo(() => {
        return (Array.isArray(vehicle.history) ? vehicle.history : [])
            .find(h => (h.type === 'obra' || h.historyType === 'obra') && !h.endDate && !h.dataSaida);
    }, [vehicle.history]);

    // Estados Iniciais
    const [obraId, setObraId] = useState(isAllocated ? vehicle.obraAtualId : '');
    const [employeeId, setEmployeeId] = useState(currentObraAllocation?.details?.employeeId || '');
    
    const today = new Date().toISOString().split('T')[0];
    const [dataEntrada, setDataEntrada] = useState(currentObraAllocation ? new Date(currentObraAllocation.startDate).toISOString().split('T')[0] : today);
    const [dataSaida, setDataSaida] = useState(today); 
    
    const [locationAfterDeallocate, setLocationAfterDeallocate] = useState('Pátio MAK Lajeado');
    const [observacoes, setObservacoes] = useState('');

    const [isSaving, setIsSaving] = useState(false);

    // Estados de Segurança e Alertas
    const [restrictionAlert, setRestrictionAlert] = useState(null);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
    const [blockedAction, setBlockedAction] = useState(null); 

    // --- LEITURA ---
    const allowedTypes = getAllowedReadingTypes(vehicle.tipo); 
    const readingType = allowedTypes.includes('horimetro') ? 'horimetro' : 'odometro';
    const readingLabel = readingType === 'horimetro' ? 'Horímetro' : 'Odômetro';
    const currentVehicleReading = getVehicleMainReading(vehicle).value || '';
    const [readingValue, setReadingValue] = useState(currentVehicleReading.toString());

    // Listas filtradas
    const activeObras = useMemo(() => obras.filter(o => o.status === 'ativa').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);
    const availableEmployees = useMemo(() =>
        (employees || [])
            .filter(e => e.status !== 'inativo' && (e.funcao === 'Operador de Máquina' || e.funcao === 'Motorista'))
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [employees]);

    const [isFinishObraModalOpen, setIsFinishObraModalOpen] = useState(false);
    const [obraToFinalize, setObraToFinalize] = useState(null);

    // --- VALIDAÇÃO ---
    const validateRestrictions = () => {
        setRestrictionAlert(null);
        const staticIssues = checkVehicleRestrictions(vehicle, revisions);
        
        // Passa readingType ('horimetro' ou 'odometro') para ativar as travas específicas
        const consistencyIssue = checkReadingConsistency(vehicle, readingValue, readingType);
        if (consistencyIssue.status === 'bloqueio') {
            staticIssues.push({ type: 'bloqueio', message: consistencyIssue.message });
        }

        const blockingIssues = staticIssues.filter(i => i.type === 'bloqueio' || i.type === 'vencido' || i.category === 'bloqueio');
        const warningIssues = staticIssues.filter(i => i.type === 'aviso' || i.type === 'warning');

        if (blockingIssues.length > 0 || warningIssues.length > 0) {
            setRestrictionAlert(staticIssues.map(i => i.message));
            return false; 
        }
        return true; 
    };

    // --- AÇÕES ---
    const handleAllocateClick = (e) => {
        e.preventDefault();
        const readingFloat = parseFloat(readingValue);
        if (!obraId || !employeeId || readingValue === '' || isNaN(readingFloat)) {
            setAlertMessage(`Preencha todos os campos obrigatórios.`);
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
        const selectedEmployee = employees.find(e => e.id.toString() === employeeId.toString());
        const employeeName = selectedEmployee ? selectedEmployee.nome : 'N/A';
        const val = parseFloat(readingValue);

        try {
            // CORREÇÃO CRÍTICA (Erro 400/500):
            // Não usamos parseInt nos IDs pois podem ser UUIDs (strings alfanuméricas).
            // Enviamos os dados crus e deixamos o backend (SQL) lidar.
            const payload = {
                obraId: obraId, 
                employeeId: employeeId,
                employeeName,
                dataEntrada,
                readingType,
                readingValue: val,
                observacoes: observacoes || '',
                
                // Mapeamento específico para a tabela 'obras_historico_veiculos'
                // Enviamos 0 para campos numéricos não usados (SQL strict mode)
                horimetroEntrada: readingType === 'horimetro' ? val : 0, 
                odometroEntrada: readingType === 'odometro' ? val : 0, 
                
                // Compatibilidade com lógica legada
                horimetro: readingType === 'horimetro' ? val : 0,
                odometro: readingType === 'odometro' ? val : 0
            };

            await apiClient.allocateVehicleToObra(vehicle.id, payload);
            setAlertMessage("Veículo alocado com sucesso!");
            reloadData();
            onClose();
        } catch (error) {
            setAlertMessage("Erro ao alocar: " + (error.response?.data?.message || error.message));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeallocateClick = () => {
         const readingFloat = parseFloat(readingValue);
         if (readingValue === '' || isNaN(readingFloat)) {
             setAlertMessage(`Informe a leitura de saída.`);
             return;
         }
         if (!validateRestrictions()) {
            setBlockedAction(() => checkAndDeallocate);
            return;
         }
         checkAndDeallocate();
    };

    const checkAndDeallocate = () => {
        const obraData = obras.find(o => o.id === vehicle.obraAtualId);
        if (!obraData) { 
            executeDeallocate(false, null);
            return;
        }
        
        // Verifica se é o último veículo da obra
        const historico = Array.isArray(obraData.historicoVeiculos) ? obraData.historicoVeiculos : [];
        const otherActiveVehicles = historico.filter(h => h.veiculoId !== vehicle.id && !h.dataSaida);

        if (otherActiveVehicles.length === 0) { 
            setObraToFinalize(obraData);
            setIsFinishObraModalOpen(true); 
        } else {
            executeDeallocate(false, null); 
        }
    };

    const executeDeallocate = async (shouldFinalizeObra, dataFimObra) => {
        setIsSaving(true);
        const val = parseFloat(readingValue);

        try {
            // CORREÇÃO CRÍTICA: IDs como string/original
            const payload = {
                dataSaida,
                readingType,
                readingValue: val,
                location: locationAfterDeallocate,
                shouldFinalizeObra,
                dataFimObra,
                obraId: vehicle.obraAtualId, // Envia original (pode ser UUID)
                observacoes: observacoes || '',
                
                // Mapeamento específico
                horimetroSaida: readingType === 'horimetro' ? val : 0,
                odometroSaida: readingType === 'odometro' ? val : 0,

                // Compatibilidade
                horimetro: readingType === 'horimetro' ? val : 0,
                odometro: readingType === 'odometro' ? val : 0
            };

            await apiClient.deallocateVehicleFromObra(vehicle.id, payload);
            setAlertMessage(`Desalocado com sucesso!`);
            reloadData();
            onClose();
        } catch (error) {
            setAlertMessage(error.response?.data?.message || "Erro ao desalocar.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-lg flex flex-col max-h-[90vh] animate-scale-in">
                    
                    {/* CABEÇALHO */}
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                        <h2 className="text-lg font-bold text-gray-800">
                            {isAllocated ? 'Desalocar Veículo da Obra' : 'Alocar Veículo em Obra'}
                        </h2>
                        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                    </div>

                    {/* CONTEÚDO SCROLLÁVEL */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                        
                        {/* Alerta de Restrição Compacto */}
                        {restrictionAlert && (
                            <div className="bg-red-50 p-3 mb-4 rounded border border-red-200 flex items-start gap-3">
                                <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={18} />
                                <div className="flex-1">
                                    <h3 className="font-bold text-red-800 text-xs uppercase mb-1">Restrições</h3>
                                    <ul className="list-disc list-inside text-xs text-red-700 mb-2">
                                        {restrictionAlert.map((msg, i) => <li key={i}>{msg}</li>)}
                                    </ul>
                                    <button onClick={() => setShowPasswordConfirm(true)} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded font-bold flex items-center gap-2 hover:bg-red-700 w-full justify-center">
                                        <Shield size={12} /> LIBERAR COM SENHA
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="text-xs text-gray-500 mb-3 bg-gray-50 p-2 rounded border border-gray-100 flex justify-between items-center">
                            <span><strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.placa}</span>
                            <span>{readingLabel} Atual: <strong>{currentVehicleReading}</strong></span>
                        </div>

                        {isAllocated ? (
                            // --- FORMULÁRIO DESALOCAÇÃO (COMPACTO) ---
                            <div className="space-y-3">
                                <div className="p-2 bg-blue-50 rounded border border-blue-100 text-xs text-blue-800 grid grid-cols-2 gap-2">
                                    <span>Obra: <strong>{obras.find(o => o.id === vehicle.obraAtualId)?.nome || '...'}</strong></span>
                                    <span>Func: <strong>{currentObraAllocation?.details?.employeeName || '...'}</strong></span>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1"><Calendar size={12}/> Data Saída</label>
                                        <input type="date" value={dataSaida} onChange={e => setDataSaida(e.target.value)} className="w-full p-2 border rounded text-sm focus:ring-1 focus:ring-blue-500" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1"><Gauge size={12}/> {readingLabel} Saída</label>
                                        <input type="number" step="any" value={readingValue} onChange={e => setReadingValue(e.target.value)} className="w-full p-2 border rounded text-sm focus:ring-1 focus:ring-blue-500" placeholder="Leitura final" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1"><MapPin size={12}/> Destino (Pátio/Local)</label>
                                    <input type="text" value={locationAfterDeallocate} onChange={e => setLocationAfterDeallocate(e.target.value)} className="w-full p-2 border rounded text-sm focus:ring-1 focus:ring-blue-500" placeholder="Ex: Pátio Sede" />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Observações</label>
                                    <textarea rows="2" value={observacoes} onChange={e => setObservacoes(e.target.value)} className="w-full p-2 border rounded text-sm focus:ring-1 focus:ring-blue-500" placeholder="Obs sobre a saída..." />
                                </div>

                                <button onClick={handleDeallocateClick} disabled={isSaving} className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded shadow-sm text-sm flex items-center justify-center gap-2 mt-2">
                                     {isSaving ? <Loader className="animate-spin" size={16}/> : "Finalizar & Desalocar"}
                                </button>
                            </div>
                        ) : (
                            // --- FORMULÁRIO ALOCAÇÃO (COMPACTO) ---
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Obra Destino</label>
                                    <select value={obraId} onChange={(e) => setObraId(e.target.value)} className="w-full p-2 border rounded text-sm bg-white focus:ring-1 focus:ring-green-500">
                                        <option value="">Selecione...</option>
                                        {activeObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Funcionário</label>
                                    <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full p-2 border rounded text-sm bg-white focus:ring-1 focus:ring-green-500">
                                        <option value="">Selecione...</option>
                                        {availableEmployees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1"><Calendar size={12}/> Data Entrada</label>
                                        <input type="date" value={dataEntrada} onChange={e => setDataEntrada(e.target.value)} className="w-full p-2 border rounded text-sm focus:ring-1 focus:ring-green-500" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1"><Gauge size={12}/> {readingLabel} Entrada</label>
                                        <input type="number" step="any" value={readingValue} onChange={e => setReadingValue(e.target.value)} className="w-full p-2 border rounded text-sm focus:ring-1 focus:ring-green-500" placeholder="Leitura inicial" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Observações</label>
                                    <textarea rows="2" value={observacoes} onChange={e => setObservacoes(e.target.value)} className="w-full p-2 border rounded text-sm focus:ring-1 focus:ring-green-500" placeholder="Obs iniciais..." />
                                </div>

                                <button onClick={handleAllocateClick} disabled={isSaving} className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded shadow-sm text-sm flex items-center justify-center gap-2 mt-2">
                                    {isSaving ? <Loader className="animate-spin" size={16}/> : "Confirmar Alocação"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isFinishObraModalOpen && (
                <FinishObraModal
                    obra={obraToFinalize}
                    onClose={() => { setIsFinishObraModalOpen(false); executeDeallocate(false, null); }}
                    onConfirm={(dataFim) => { setIsFinishObraModalOpen(false); executeDeallocate(true, dataFim); }}
                />
            )}

            {showPasswordConfirm && PasswordConfirmationModal && (
                <PasswordConfirmationModal
                    message="Autorizar ação com restrições?"
                    onConfirm={async () => {
                        if (blockedAction) await blockedAction();
                        setShowPasswordConfirm(false);
                        setBlockedAction(null);
                    }}
                    onClose={() => { setShowPasswordConfirm(false); setBlockedAction(null); }}
                />
            )}
        </>
    );
};

export default ObraAllocationModal;