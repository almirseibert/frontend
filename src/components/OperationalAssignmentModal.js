import React, { useState, useMemo } from 'react';
import { Loader, X, AlertTriangle, Shield } from 'lucide-react';
import { checkVehicleRestrictions } from '../utils/vehicleRules';

// --- Modal de Alocação Operacional ---
const OperationalAssignmentModal = ({ user, vehicle, employees = [], revisions = [], onClose, setAlertMessage, apiClient, reloadData, operationalSubGroups = [], PasswordConfirmationModal }) => {
    // Tenta obter dados da alocação atual
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
    const [observacoes, setObservacoes] = useState(currentAssignment?.observacoes || ''); 
    const [isSaving, setIsSaving] = useState(false);
    const [locationAfterUnassign, setLocationAfterUnassign] = useState('Pátio MAK Lajeado');

    // Estados de Segurança
    const [restrictionAlert, setRestrictionAlert] = useState(null);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

    // Filtra funcionários disponíveis
    const availableEmployees = useMemo(() =>
        (employees || [])
            .filter(e => e.status !== 'inativo') 
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [employees]);

    // --- VERIFICAÇÃO DE RESTRIÇÕES ---
    const validateRestrictions = () => {
        const issues = checkVehicleRestrictions(vehicle, revisions);
        if (issues.length > 0) {
            setRestrictionAlert(issues.map(i => `• ${i.message}`));
            return false;
        }
        return true;
    };

    const handleAssignClick = () => {
        if (!subGroup || !employeeId) {
            setAlertMessage("Selecione o subgrupo e o funcionário.");
            return;
        }
        
        // Valida antes de prosseguir
        if (!validateRestrictions()) {
            return; // Bloqueia e mostra alerta
        }

        executeAssign();
    };

    const executeAssign = async () => {
        setIsSaving(true);
        try {
            await apiClient.assignVehicleToOperational(vehicle.id, { subGroup, employeeId, observacoes });
            setAlertMessage("Veículo alocado para operação com sucesso!");
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao alocar veículo para operação:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao alocar o veículo.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleUnassign = async () => {
        if (!locationAfterUnassign) {
            setAlertMessage("Informe o local de disponibilidade.");
            return;
        }
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
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                    <div className="p-6 border-b flex justify-between items-center bg-blue-50">
                        <h2 className="text-xl font-bold text-blue-800">Alocação Operacional</h2>
                         <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                    </div>

                    {/* --- ALERTA DE RESTRIÇÃO --- */}
                    {restrictionAlert && !currentAssignment && (
                        <div className="p-4 bg-red-50 border-b border-red-100 animate-fade-in">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="text-red-600 shrink-0 mt-1" />
                                <div>
                                    <h3 className="font-bold text-red-700 text-sm uppercase">Restrições Detectadas</h3>
                                    <div className="text-red-600 text-sm mt-1 space-y-1">
                                        {restrictionAlert.map((issue, idx) => <p key={idx}>{issue}</p>)}
                                    </div>
                                    <p className="text-xs text-red-500 mt-2 font-semibold">Autorização necessária.</p>
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
                            <strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo}
                        </div>

                        {currentAssignment ? (
                             // --- MODO DESALOCAR ---
                            <div className="space-y-4">
                                <div className="p-3 bg-blue-50 rounded border border-blue-100 text-blue-800 text-sm">
                                    <p>Alocado no grupo: <strong>{currentAssignment.subGroup || 'N/A'}</strong></p>
                                    <p>Responsável: <strong>{currentAssignment.employeeName || 'N/A'}</strong></p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Local de Disponibilidade após Desalocar *</label>
                                    <input
                                         type="text"
                                         value={locationAfterUnassign}
                                         onChange={e => setLocationAfterUnassign(e.target.value)}
                                         placeholder="Ex: Pátio MAK Lajeado"
                                         className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-sm"
                                         required
                                     />
                                </div>
                                <button onClick={handleUnassign} disabled={isSaving || !locationAfterUnassign} className="w-full px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-red-300 flex items-center justify-center gap-2 text-sm">
                                    {isSaving ? <Loader className="animate-spin" size={18}/> : "Finalizar Operação"}
                                </button>
                            </div>
                        ) : (
                             // --- MODO ALOCAR ---
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Alocar no Grupo *</label>
                                    <select value={subGroup} onChange={e => setSubGroup(e.target.value)} className="w-full p-2 border rounded bg-white focus:ring-2 focus:ring-blue-500 text-sm" required>
                                        <option value="">Selecione...</option>
                                        {(operationalSubGroups || []).map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Alocar para Funcionário *</label>
                                    <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="w-full p-2 border rounded bg-white focus:ring-2 focus:ring-blue-500 text-sm" required>
                                        <option value="">Selecione...</option>
                                        {availableEmployees.map(e => <option key={e.id} value={e.id}>{e.nome} ({e.funcao})</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                                    <textarea
                                        value={observacoes}
                                        onChange={e => setObservacoes(e.target.value)}
                                        rows="3"
                                        className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-sm"
                                        placeholder="Detalhes adicionais..."
                                    />
                                </div>
                                <button 
                                    onClick={handleAssignClick} 
                                    disabled={isSaving || !subGroup || !employeeId || restrictionAlert !== null} 
                                    className="w-full px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                                >
                                    {isSaving ? <Loader className="animate-spin" size={18}/> : "Alocar Veículo"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal de Senha */}
            {showPasswordConfirm && PasswordConfirmationModal && (
                <PasswordConfirmationModal
                    message="Veículo com restrições (revisão, documentos ou bloqueio). Digite sua senha para liberar a alocação."
                    onConfirm={async () => {
                        await executeAssign();
                        setShowPasswordConfirm(false);
                    }}
                    onClose={() => setShowPasswordConfirm(false)}
                />
            )}
        </>
    );
};

export default OperationalAssignmentModal;