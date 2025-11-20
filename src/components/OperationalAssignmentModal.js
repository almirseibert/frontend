import React, { useState, useMemo } from 'react';
import { Loader, X, AlertTriangle, Shield } from 'lucide-react';
import { getVehicleMainReading } from '../utils/vehicleRules';

// --- Modal de Alocação Operacional ---
const OperationalAssignmentModal = ({ user, vehicle, employees = [], revisions = [], onClose, setAlertMessage, apiClient, reloadData, operationalSubGroups = [], PasswordConfirmationModal }) => {
    let currentAssignment = null;
    if (vehicle.operationalAssignment) {
        if (typeof vehicle.operationalAssignment === 'string') {
            try { currentAssignment = JSON.parse(vehicle.operationalAssignment); } catch { }
        } else {
            currentAssignment = vehicle.operationalAssignment;
        }
    }

    const [subGroup, setSubGroup] = useState(currentAssignment?.subGroup || '');
    const [employeeId, setEmployeeId] = useState(currentAssignment?.employeeId || '');
    const [observacoes, setObservacoes] = useState(currentAssignment?.observacoes || ''); 
    const [isSaving, setIsSaving] = useState(false);
    const [locationAfterUnassign, setLocationAfterUnassign] = useState('Pátio MAK Lajeado');

    // --- ESTADOS DE SEGURANÇA ---
    const [restrictionAlert, setRestrictionAlert] = useState(null);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

    const availableEmployees = useMemo(() =>
        (employees || [])
            .filter(e => e.status !== 'inativo')
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [employees]);

    // --- VERIFICAÇÃO DE RESTRIÇÕES (REFINADA) ---
    const checkRestrictions = () => {
        const issues = [];
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        
        const thirtyDaysFromNow = new Date(now);
        thirtyDaysFromNow.setDate(now.getDate() + 30);

        // 1. Bloqueio direto
        if (vehicle.canCirculate === false) {
            issues.push("• O veículo está marcado como 'NÃO PODE CIRCULAR'.");
        }

        // 2. Revisões
        const revision = revisions?.find(r => r.vehicleId === vehicle.id);
        if (revision) {
            // Datas
            const proximaData = revision.proximaRevisaoData ? new Date(revision.proximaRevisaoData) : null;
            const avisoDias = parseInt(revision.avisoAntecedenciaDias || 0);

            if (proximaData) {
                proximaData.setHours(0, 0, 0, 0);
                
                if (now >= proximaData) {
                    issues.push(`• Revisão VENCIDA por data (${proximaData.toLocaleDateString('pt-BR')}).`);
                } 
                else if (avisoDias > 0) {
                    const dataAviso = new Date(proximaData);
                    dataAviso.setDate(dataAviso.getDate() - avisoDias);
                    if (now >= dataAviso) {
                        issues.push(`• Revisão PRÓXIMA do vencimento por data (${proximaData.toLocaleDateString('pt-BR')}).`);
                    }
                }
            }

            // Leituras
            const mainReading = getVehicleMainReading(vehicle); 
            const current = mainReading.raw || 0;
            const proximoOdo = parseFloat(revision.proximaRevisaoOdometro || 0);
            const aviso = parseFloat(revision.avisoAntecedenciaKmHr || 0);
            
            if (proximoOdo > 0) {
                if (current >= proximoOdo) {
                    issues.push(`• Revisão VENCIDA por leitura (Atual: ${current}).`);
                } 
                else if (aviso > 0 && current >= (proximoOdo - aviso)) {
                    issues.push(`• Revisão PRÓXIMA do vencimento por leitura (Faltam ${proximoOdo - current}).`);
                }
            }
        }

        // 3. Documentos
        if (vehicle.tipo && (vehicle.tipo.includes('Caminhão') || vehicle.tipo.includes('Caminhões'))) {
             [{ n: 'Tacógrafo', d: vehicle.validadeTacografo }, { n: 'AET DAER', d: vehicle.validadeAET_DAER }, { n: 'AET DNIT', d: vehicle.validadeAET_DNIT }].forEach(doc => {
                if (doc.d) {
                    const docDate = new Date(doc.d);
                    docDate.setHours(0, 0, 0, 0);
                    docDate.setHours(12); // Margem UTC

                    if (docDate < now) {
                        issues.push(`• ${doc.n} VENCIDO (${docDate.toLocaleDateString('pt-BR')}).`);
                    } else if (docDate <= thirtyDaysFromNow) {
                        issues.push(`• ${doc.n} próximo do vencimento (${docDate.toLocaleDateString('pt-BR')}).`);
                    }
                }
            });
        }
        return issues;
    };

    const handleAssignClick = () => {
        if (!subGroup || !employeeId) {
            setAlertMessage("Selecione o subgrupo e o funcionário.");
            return;
        }
        
        // Verifica restrições
        const issues = checkRestrictions();
        if (issues.length > 0) {
            setRestrictionAlert(issues);
            return; // PARE AQUI
        }

        executeAssign();
    };

    const executeAssign = async () => {
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
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                    <div className="p-6 border-b flex justify-between items-center bg-blue-50">
                        <h2 className="text-xl font-bold text-blue-800">Alocação Operacional</h2>
                         <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                    </div>

                    {/* ALERTA DE RESTRIÇÃO */}
                    {restrictionAlert && !currentAssignment && (
                        <div className="p-4 bg-red-50 border-b border-red-100 animate-fade-in">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="text-red-600 shrink-0 mt-1" />
                                <div>
                                    <h3 className="font-bold text-red-700 text-sm uppercase">Restrições Detectadas</h3>
                                    <div className="text-red-600 text-sm mt-1 space-y-1">
                                        {restrictionAlert.map((issue, idx) => <p key={idx}>{issue}</p>)}
                                    </div>
                                    <p className="text-xs text-red-500 mt-3 font-semibold">Autorização com senha necessária.</p>
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
                         <p className="text-sm mb-4"><strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo}</p>
                        {/* DESALOCAR */}
                        {currentAssignment ? (
                            <div className="space-y-4">
                                <p className="text-sm">Este veículo está alocado para <strong>{currentAssignment.subGroup || 'N/A'}</strong> com <strong>{currentAssignment.employeeName || 'N/A'}</strong>.</p>
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
                             // ALOCAR
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
                                <button 
                                    onClick={handleAssignClick} 
                                    disabled={isSaving || !subGroup || !employeeId || restrictionAlert !== null} 
                                    className="w-full px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm"
                                >
                                    {isSaving ? <><Loader className="animate-spin" size={18}/> Alocando...</> : "Alocar Veículo"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* MODAL DE SENHA */}
            {showPasswordConfirm && PasswordConfirmationModal && (
                <PasswordConfirmationModal
                    message="Veículo com restrições. Digite sua senha para liberar a alocação."
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