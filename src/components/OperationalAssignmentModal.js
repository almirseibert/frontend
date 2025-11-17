import React, { useState, useMemo } from 'react';
import { Loader, X } from 'lucide-react';

// --- Modal de Alocação Operacional ---
// Extraído de VehiclePage.js
const OperationalAssignmentModal = ({ user, vehicle, employees = [], onClose, setAlertMessage, apiClient, reloadData, operationalSubGroups = [] }) => {
    // Tenta obter dados da alocação atual (pode ser string JSON ou objeto)
    let currentAssignment = null;
    if (vehicle.operationalAssignment) {
        if (typeof vehicle.operationalAssignment === 'string') {
            try { currentAssignment = JSON.parse(vehicle.operationalAssignment); } catch { /* ignora erro */ }
        } else {
            currentAssignment = vehicle.operationalAssignment;
        }
    }

    const [subGroup, setSubGroup] = useState(currentAssignment?.subGroup || '');
    const [employeeId, setEmployeeId] = useState(currentAssignment?.employeeId || '');
    const [observacoes, setObservacoes] = useState(currentAssignment?.observacoes || ''); // Observações da alocação atual
    const [isSaving, setIsSaving] = useState(false);
    // Local para onde o veículo irá APÓS desalocar
    const [locationAfterUnassign, setLocationAfterUnassign] = useState('Pátio MAK Lajeado');

    // Filtra funcionários disponíveis
    const availableEmployees = useMemo(() =>
        (employees || [])
            .filter(e => e.status !== 'inativo') // Somente ativos
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [employees]);

    // Função para Alocar
    const handleAssign = async () => {
        if (!subGroup || !employeeId) {
            setAlertMessage("Selecione o subgrupo e o funcionário.");
            return;
        }
        setIsSaving(true);
        try {
            await apiClient.assignVehicleToOperational(vehicle.id, { subGroup, employeeId, observacoes });
            setAlertMessage("Veículo alocado para operação com sucesso.");
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao alocar veículo para operação:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao alocar o veículo.");
        } finally {
            setIsSaving(false);
        }
    };

    // Função para Desalocar
    const handleUnassign = async () => {
        setIsSaving(true);
        try {
            await apiClient.unassignVehicleFromOperational(vehicle.id, { location: locationAfterUnassign });
            setAlertMessage("Alocação operacional finalizada.");
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao finalizar alocação:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao finalizar a alocação.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Alocação Operacional</h2>
                     <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                </div>
                <div className="p-6">
                     <p className="text-sm mb-4"><strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo}</p>
                    {/* Se já estiver alocado, mostra opção de desalocar */}
                    {currentAssignment ? (
                        <div className="space-y-4">
                            <p className="text-sm">Este veículo está alocado para <strong>{currentAssignment.subGroup || 'N/A'}</strong> com <strong>{currentAssignment.employeeName || 'N/A'}</strong>.</p>
                             {/* Campo para definir o local após desalocar */}
                             <div>
                                <label className="block text-sm font-medium text-gray-700">Local de Disponibilidade após Desalocar *</label>
                                <input
                                     type="text"
                                     value={locationAfterUnassign}
                                     onChange={e => setLocationAfterUnassign(e.target.value)}
                                     placeholder="Ex: Pátio MAK Lajeado"
                                     className="mt-1 w-full p-2 border rounded-md text-sm"
                                     required
                                 />
                            </div>
                            <button onClick={handleUnassign} disabled={isSaving || !locationAfterUnassign} className="w-full px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-red-300 flex items-center justify-center gap-2 text-sm">
                                {isSaving ? <><Loader className="animate-spin" size={18}/> Finalizando...</> : "Finalizar Alocação"}
                            </button>
                        </div>
                    ) : (
                         // Se não estiver alocado, mostra formulário para alocar
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Alocar no Grupo *</label>
                                <select value={subGroup} onChange={e => setSubGroup(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm bg-white" required>
                                    <option value="">Selecione...</option>
                                    {(operationalSubGroups || []).map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Alocar para Funcionário *</label>
                                <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm bg-white" required>
                                    <option value="">Selecione...</option>
                                    {availableEmployees.map(e => <option key={e.id} value={e.id}>{e.nome} ({e.funcao})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Observações</label>
                                <textarea
                                    value={observacoes}
                                    onChange={e => setObservacoes(e.target.value)}
                                    rows="2"
                                    className="mt-1 w-full p-2 border rounded-md text-sm"
                                    placeholder="Detalhes adicionais..."
                                />
                            </div>
                            <button onClick={handleAssign} disabled={isSaving || !subGroup || !employeeId} className="w-full px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm">
                                {isSaving ? <><Loader className="animate-spin" size={18}/> Alocando...</> : "Alocar Veículo"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OperationalAssignmentModal;