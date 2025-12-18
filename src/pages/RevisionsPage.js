import React, { useState, useMemo, useEffect } from 'react';
import apiClient from '../services/apiClient';
import {
    Edit,
    Clock,
    CheckCircle,
    X,
    Loader,
    AlertTriangle,
    Info,
    History
} from 'lucide-react';

import ProtectedComponent from '../components/ProtectedComponent';
// IMPORTA AS REGRAS CENTRALIZADAS (Consistência e Validação)
import { checkReadingConsistency, checkVehicleRestrictions, getVehicleMainReading } from '../utils/vehicleRules';

const isValidDbDate = (dateString) => {
    return dateString && dateString.length > 8 && !dateString.startsWith('0000');
};

const RevisionsPage = ({
    user, vehicles = [], revisions = [],
    setAlertMessage, vehicleGroups = {}, apiClient, reloadData,
    PasswordConfirmationModal
}) => {
    const [editingRevision, setEditingRevision] = useState(null);
    const [completingRevision, setCompletingRevision] = useState(null);
    const [historyModalVehicle, setHistoryModalVehicle] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const combinedData = useMemo(() => {
        const validVehicles = Array.isArray(vehicles) ? vehicles : [];
        const validRevisions = Array.isArray(revisions) ? revisions : [];

        const sortedVehicles = [...validVehicles].sort((a, b) => (a?.registroInterno || '').localeCompare(b?.registroInterno || ''));

        return sortedVehicles.map(vehicle => {
            if (!vehicle) return null;
            const revision = validRevisions.find(r => r.vehicleId === vehicle.id) || { vehicleId: vehicle.id, historico: [] };
            return { ...vehicle, revision };
        }).filter(item => {
            if (!item) return false;
            const searchLower = searchTerm.toLowerCase();
            return !searchLower ||
                   (item.placa || '').toLowerCase().includes(searchLower) ||
                   (item.registroInterno || '').toLowerCase().includes(searchLower) ||
                   (item.marca || '').toLowerCase().includes(searchLower) ||
                   (item.modelo || '').toLowerCase().includes(searchLower);
        });
    }, [vehicles, revisions, searchTerm]);

     const formatNextRevisionDate = (dateString) => {
         if (!isValidDbDate(dateString)) return 'N/A';
         try {
             const date = new Date(dateString);
             return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()).toLocaleDateString('pt-BR');
         } catch (e) { return 'Inválida'; }
     };

     const formatNextRevisionReading = (revision, vehicle) => {
        if (!revision) return 'N/A';
        const readingInfo = getVehicleMainReading(vehicle);
        const unit = readingInfo.unit;
        
        let reading;
        if (unit === 'Hr') {
            reading = revision.proximaRevisaoHorimetro;
            // Fallback visual para legado
            if (!reading && revision.proximaRevisaoOdometro > 0 && vehicle.mediaCalculo === 'horimetro') {
                 reading = revision.proximaRevisaoOdometro;
            }
        } else {
            reading = revision.proximaRevisaoOdometro;
        }

        if (reading == null || reading <= 0) return 'N/A';
        return `${parseFloat(reading).toFixed(1)} ${unit}`;
     };

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Agendamento de Revisões</h1>
            <div className="mb-6 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
                <input
                    type="text"
                    placeholder="Buscar por registro, placa, marca ou modelo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 focus:ring-yellow-500 text-sm"
                />
            </div>
            <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
                <div className="hidden md:grid grid-cols-8 gap-4 p-4 font-semibold text-xs text-gray-600 border-b bg-gray-50 uppercase tracking-wider">
                    <div className="col-span-2">Veículo</div>
                    <div className="text-right">Leitura Atual</div>
                    <div className="text-center">Próx. Data</div>
                    <div className="text-right">Próx. Leitura</div>
                    <div className="col-span-2">Descrição</div>
                    <div className="text-center">Ações</div>
                </div>
                {combinedData.map(item => {
                    if (!item || !item.revision) return null;
                    
                    const { revision, ...vehicle } = item;
                    const issues = checkVehicleRestrictions(vehicle, [revision]);
                    
                    // Filtrar apenas alertas de manutenção
                    const maintenanceIssues = issues.filter(i => i.category === 'manutencao');
                    
                    const isOverdue = maintenanceIssues.some(i => i.type === 'error'); // error = vencido
                    const isWarning = maintenanceIssues.some(i => i.type === 'warning'); // warning = aviso
                    const alertMessage = maintenanceIssues.map(i => i.message).join('\n');

                    let rowBgClass = 'bg-white hover:bg-gray-50'; 
                    if (isOverdue) rowBgClass = 'bg-red-50 hover:bg-red-100 border-l-4 border-red-500'; 
                    else if (isWarning) rowBgClass = 'bg-yellow-50 hover:bg-yellow-100 border-l-4 border-yellow-400'; 

                    const readingInfo = getVehicleMainReading(vehicle);
                    const currentReadingStr = `${parseFloat(readingInfo.raw).toFixed(1)} ${readingInfo.unit}`;
                    const nextDateStr = formatNextRevisionDate(revision.proximaRevisaoData);
                    const nextReadingStr = formatNextRevisionReading(revision, vehicle);
                    const hasScheduledRevision = nextDateStr !== 'N/A' || nextReadingStr !== 'N/A';
                    const description = revision.descricao || '-'; 
                    
                    const hasHistory = revision.historico && revision.historico.length > 0;
                    const historyIconClass = hasHistory ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-blue-600';

                    return (
                        <div key={vehicle.id} className={`grid grid-cols-1 md:grid-cols-8 gap-y-2 gap-x-4 items-center p-3 md:p-4 border-b last:border-b-0 text-sm relative ${rowBgClass}`}>
                            {(isOverdue || isWarning) && (
                                <div className="absolute top-2 right-2 md:hidden">
                                    {isOverdue ? <AlertTriangle size={16} className="text-red-600"/> : <Info size={16} className="text-yellow-600"/>}
                                </div>
                            )}

                            <div className="md:col-span-2">
                                <div className="flex items-center gap-2">
                                    {isOverdue && <AlertTriangle size={14} className="text-red-500 hidden md:block" title={alertMessage}/>}
                                    {isWarning && <Info size={14} className="text-yellow-500 hidden md:block" title={alertMessage}/>}
                                    <div>
                                        <p className="font-bold text-gray-900">{vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo}</p>
                                        <p className="text-xs text-gray-500">{vehicle.placa}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="text-left md:text-right font-semibold text-blue-600">{currentReadingStr}</div>
                            <div className="text-left md:text-center">{nextDateStr}</div>
                            <div className="text-left md:text-right">{nextReadingStr}</div>
                            <div className="md:col-span-2 text-gray-700 truncate" title={description}>{description}</div>
                            <div className="flex gap-1 justify-start md:justify-center flex-wrap mt-2 md:mt-0">
                                <ProtectedComponent requiredPermission="editor">
                                    <button onClick={() => setEditingRevision(item)} className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-full transition-colors" title="Agendar/Editar"><Edit size={14} /></button>
                                     {hasScheduledRevision && <button onClick={() => setCompletingRevision(item)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-gray-100 rounded-full transition-colors" title="Concluir"><CheckCircle size={14} /></button>}
                                </ProtectedComponent>
                                <button onClick={() => setHistoryModalVehicle(item)} className={`p-1.5 hover:bg-gray-100 rounded-full transition-colors ${historyIconClass}`} title="Histórico"><Clock size={14} /></button>
                            </div>
                        </div>
                    );
                })}
                 {combinedData.length === 0 && (
                     <p className="p-6 text-center text-gray-500 italic">Nenhum veículo encontrado.</p>
                 )}
            </div>
            
            {/* Modal de Conclusão */}
            {completingRevision && <CompleteRevisionModal user={user} vehicle={completingRevision} onClose={() => setCompletingRevision(null)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} PasswordConfirmationModal={PasswordConfirmationModal} />}
            
            {/* Modal de Histórico */}
            {historyModalVehicle && <RevisionHistoryModal vehicle={historyModalVehicle} onClose={() => setHistoryModalVehicle(null)} />}
        </div>
    );
};

// --- Modal de Conclusão de Revisão (Atualizado) ---
const CompleteRevisionModal = ({ user, vehicle, onClose, setAlertMessage, apiClient, reloadData, PasswordConfirmationModal }) => {
    const readingInfo = useMemo(() => getVehicleMainReading(vehicle), [vehicle]);
    
    const [formData, setFormData] = useState({
        realizadaEm: new Date().toISOString().split('T')[0],
        leituraRealizada: readingInfo.raw.toString(),
        descricao: vehicle.revision?.descricao || '',
        custo: '',
        notaFiscal: '',
        proximaRevisaoData: '',
        proximaRevisaoLeitura: ''
    });

    const [isSaving, setIsSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [blockMessage, setBlockMessage] = useState('');

    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handlePreSubmit = () => {
        // Validação de Leitura (Unificada)
        // Se unit for 'Km', valida como odometro. Se 'Hr', valida como horimetro.
        const fieldType = readingInfo.unit === 'Km' ? 'odometro' : 'horimetro';
        const check = checkReadingConsistency(vehicle, formData.leituraRealizada, fieldType);
        
        if (check.status === 'bloqueio') {
            setBlockMessage(check.message);
            setShowPassword(true);
        } else {
            executeSave();
        }
    };

    const executeSave = async () => {
        setIsSaving(true);
        setShowPassword(false);
        try {
            await apiClient.completeRevision(vehicle.id, {
                ...formData,
                realizadaPor: user.email || 'Sistema'
            });
            setAlertMessage("Revisão concluída com sucesso!");
            reloadData();
            onClose();
        } catch (error) {
            setAlertMessage(error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
                <div className="p-4 border-b bg-green-50 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-green-900 flex items-center gap-2"><CheckCircle size={20}/> Concluir Revisão</h2>
                    <button onClick={onClose}><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Data Realização</label>
                            <input type="date" name="realizadaEm" value={formData.realizadaEm} onChange={handleChange} className="w-full p-2 border rounded"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Leitura ({readingInfo.unit})</label>
                            <input type="number" name="leituraRealizada" value={formData.leituraRealizada} onChange={handleChange} className="w-full p-2 border rounded" placeholder={readingInfo.label}/>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium mb-1">Descrição do Serviço</label>
                        <textarea name="descricao" value={formData.descricao} onChange={handleChange} className="w-full p-2 border rounded" rows="2"></textarea>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded border">
                        <div className="col-span-2 text-xs font-bold text-gray-500 uppercase">Agendar Próxima</div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Data Meta</label>
                            <input type="date" name="proximaRevisaoData" value={formData.proximaRevisaoData} onChange={handleChange} className="w-full p-2 border rounded"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Leitura Meta</label>
                            <input type="number" name="proximaRevisaoLeitura" value={formData.proximaRevisaoLeitura} onChange={handleChange} className="w-full p-2 border rounded" placeholder={`Ex: ${parseFloat(readingInfo.raw) + 250}`}/>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <button onClick={handlePreSubmit} disabled={isSaving} className="px-4 py-2 bg-green-600 text-white rounded font-bold hover:bg-green-700 flex items-center gap-2">
                            {isSaving && <Loader size={16} className="animate-spin"/>} Confirmar Conclusão
                        </button>
                    </div>
                </div>
            </div>
            {showPassword && (
                <PasswordConfirmationModal 
                    message={`Inconsistência de Leitura:\n${blockMessage}\nÉ necessário autorização de supervisor.`}
                    onConfirm={executeSave}
                    onClose={() => setShowPassword(false)}
                    apiClient={apiClient}
                />
            )}
        </div>
    );
};

const RevisionHistoryModal = ({ vehicle, onClose }) => {
    const history = vehicle?.revision?.historico || [];
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center"><h3 className="font-bold">Histórico de Revisões</h3><button onClick={onClose}><X size={20}/></button></div>
                <div className="p-4 overflow-y-auto flex-1 space-y-3">
                    {history.length === 0 ? <p className="text-gray-500 text-center">Nenhum histórico.</p> : history.map((h, i) => (
                        <div key={i} className="p-3 border rounded bg-gray-50 text-sm">
                            <div className="flex justify-between font-bold"><span>{new Date(h.data).toLocaleDateString('pt-BR')}</span><span>{h.km}</span></div>
                            <p>{h.descricao}</p>
                            {h.realizadaPor && <p className="text-xs text-gray-500 mt-1">Por: {h.realizadaPor}</p>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default RevisionsPage;