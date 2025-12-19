import React, { useState, useMemo, useEffect } from 'react';
import {
    Edit,
    Clock,
    CheckCircle,
    X,
    Loader,
    AlertTriangle,
    Info,
    History,
    FileText,
    Wrench
} from 'lucide-react';

// --- IMPORTAÇÕES ORIGINAIS (Descomente em Produção) ---
import ProtectedComponent from '../components/ProtectedComponent';
import { checkReadingConsistency, checkVehicleRestrictions, getVehicleMainReading } from '../utils/vehicleRules';

// --- IMPLEMENTAÇÕES LOCAIS PARA PREVIEW (Remova este bloco em Produção) ---
/*
// Mock do componente de permissão (assume permissão total no preview)
const ProtectedComponent = ({ children }) => <>{children}</>;

// Regras de Leitura baseadas na descrição do sistema
const getVehicleMainReading = (vehicle) => {
    if (!vehicle) return { raw: 0, unit: 'Km', label: 'Odômetro' };
    
    // Regra Global 1: Somente leves e caminhões de trecho usam Km. O resto usa Horímetro.
    const isOdometroBased = 
        vehicle.categoria === 'veiculos_leves' || 
        vehicle.categoria === 'caminhoes_trecho' ||
        vehicle.mediaCalculo === 'odometro'; 

    if (isOdometroBased) {
        return { raw: vehicle.odometro || 0, unit: 'Km', label: 'Odômetro' };
    }
    
    return { raw: vehicle.horimetro || 0, unit: 'Hr', label: 'Horímetro' };
};

const checkReadingConsistency = (vehicle, newValueStr, type) => {
    const newValue = parseFloat(newValueStr);
    if (isNaN(newValue)) return { status: 'erro', message: 'Valor inválido.' };

    const current = type === 'horimetro' ? (vehicle.horimetro || 0) : (vehicle.odometro || 0);
    
    if (newValue < current) {
        return { 
            status: 'bloqueio', 
            message: `A nova leitura (${newValue}) não pode ser menor que a atual (${current}).` 
        };
    }

    const diff = newValue - current;
    if (type === 'odometro' && diff > 1000) {
        return { 
            status: 'bloqueio', 
            message: `Diferença de ${diff} Km é suspeita (Limite: 1000 Km).` 
        };
    }
    if (type === 'horimetro' && diff > 50) {
        return { 
            status: 'bloqueio', 
            message: `Diferença de ${diff} Horas é suspeita (Limite: 50h).` 
        };
    }

    return { status: 'ok' };
};

const checkVehicleRestrictions = (vehicle, revisions = []) => {
    const issues = [];
    const reading = getVehicleMainReading(vehicle);
    
    if (vehicle.status === 'manutencao') {
        issues.push({ category: 'manutencao', type: 'error', message: 'Veículo em manutenção' });
    }
    
    const revision = revisions[0]; 
    if (revision) {
        if (revision.proximaRevisaoData && new Date(revision.proximaRevisaoData) < new Date()) {
            issues.push({ category: 'manutencao', type: 'error', message: 'Revisão Vencida por Data' });
        }
        
        const nextReading = reading.unit === 'Km' ? revision.proximaRevisaoOdometro : revision.proximaRevisaoHorimetro;
        if (nextReading && reading.raw >= nextReading) {
            issues.push({ category: 'manutencao', type: 'error', message: 'Revisão Vencida por Leitura' });
        }
    }

    return issues;
};
*/
// --- FIM DAS IMPLEMENTAÇÕES LOCAIS ---

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

    // Combina veículos com seus planos de revisão
    const combinedData = useMemo(() => {
        const validVehicles = Array.isArray(vehicles) ? vehicles : [];
        const validRevisions = Array.isArray(revisions) ? revisions : [];

        // Ordenação por registro interno
        const sortedVehicles = [...validVehicles].sort((a, b) => {
            const regA = a.registroInterno || '';
            const regB = b.registroInterno || '';
            const numA = parseInt(regA.replace(/\D/g, ''));
            const numB = parseInt(regB.replace(/\D/g, ''));
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return regA.localeCompare(regB);
        });

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
            if ((reading === null || reading === undefined) && revision.proximaRevisaoOdometro > 0) {
                 reading = revision.proximaRevisaoOdometro;
            }
        } else {
            reading = revision.proximaRevisaoOdometro;
        }

        if (reading == null || reading <= 0) return 'N/A';
        return `${parseFloat(reading).toFixed(1)} ${unit}`;
     };

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 animate-fadeIn">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Controle de Revisões e Manutenção</h1>
            
            <div className="mb-6 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
                <input
                    type="text"
                    placeholder="Buscar por registro, placa, marca ou modelo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm outline-none transition-all"
                />
            </div>

            <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
                <div className="hidden md:grid grid-cols-12 gap-4 p-4 font-semibold text-xs text-gray-600 border-b bg-gray-50 uppercase tracking-wider">
                    <div className="col-span-3">Veículo</div>
                    <div className="col-span-2 text-right">Leitura Atual</div>
                    <div className="col-span-2 text-center">Próx. Data</div>
                    <div className="col-span-2 text-right">Próx. Leitura</div>
                    <div className="col-span-2">Descrição / Status</div>
                    <div className="col-span-1 text-center">Ações</div>
                </div>

                {combinedData.map(item => {
                    if (!item || !item.revision) return null;
                    
                    const { revision, ...vehicle } = item;
                    const issues = checkVehicleRestrictions(vehicle, [revision]);
                    
                    const maintenanceIssues = issues.filter(i => i.category === 'manutencao');
                    const docIssues = issues.filter(i => i.category === 'documentacao' || i.category === 'legal');
                    
                    const isMaintOverdue = maintenanceIssues.some(i => i.type === 'error');
                    const isMaintWarning = maintenanceIssues.some(i => i.type === 'warning');
                    
                    const isDocOverdue = docIssues.some(i => i.type === 'error');
                    const isDocWarning = docIssues.some(i => i.type === 'warning');

                    let rowBgClass = 'bg-white hover:bg-gray-50'; 
                    let borderClass = 'border-l-4 border-transparent';

                    if (isMaintOverdue || isDocOverdue) {
                        rowBgClass = 'bg-red-50 hover:bg-red-100'; 
                        borderClass = 'border-l-4 border-red-500';
                    } else if (isMaintWarning || isDocWarning) {
                        rowBgClass = 'bg-yellow-50 hover:bg-yellow-100'; 
                        borderClass = 'border-l-4 border-yellow-400';
                    }

                    const readingInfo = getVehicleMainReading(vehicle);
                    const currentReadingStr = `${parseFloat(readingInfo.raw || 0).toFixed(1)} ${readingInfo.unit}`;
                    const nextDateStr = formatNextRevisionDate(revision.proximaRevisaoData);
                    const nextReadingStr = formatNextRevisionReading(revision, vehicle);
                    const description = revision.descricao || '-'; 
                    
                    const hasHistory = revision.historico && revision.historico.length > 0;
                    const historyIconClass = hasHistory ? 'text-blue-600 hover:text-blue-800' : 'text-gray-300 hover:text-gray-500';

                    return (
                        <div key={vehicle.id} className={`grid grid-cols-1 md:grid-cols-12 gap-y-2 gap-x-4 items-center p-3 md:p-4 border-b last:border-b-0 text-sm relative transition-colors ${rowBgClass} ${borderClass}`}>
                            <div className="md:col-span-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col gap-1 min-w-[20px]">
                                        {(isMaintOverdue || isMaintWarning) && (
                                            <div className="group relative">
                                                <Wrench size={16} className={isMaintOverdue ? "text-red-600 animate-pulse" : "text-yellow-600"} />
                                                <span className="absolute left-6 top-0 hidden group-hover:block bg-gray-800 text-white text-xs p-1 rounded z-10 w-48 shadow-lg">
                                                    {maintenanceIssues.map(i => i.message).join(', ')}
                                                </span>
                                            </div>
                                        )}
                                        {(isDocOverdue || isDocWarning) && (
                                            <div className="group relative">
                                                <FileText size={16} className={isDocOverdue ? "text-red-600" : "text-yellow-600"} />
                                                <span className="absolute left-6 top-0 hidden group-hover:block bg-gray-800 text-white text-xs p-1 rounded z-10 w-48 shadow-lg">
                                                    {docIssues.map(i => i.message).join(', ')}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <p className="font-bold text-gray-900">{vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo}</p>
                                        <p className="text-xs text-gray-500 font-mono">{vehicle.placa}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="md:col-span-2 text-left md:text-right font-mono font-semibold text-blue-700">{currentReadingStr}</div>
                            <div className="md:col-span-2 text-left md:text-center text-gray-700">{nextDateStr}</div>
                            <div className="md:col-span-2 text-left md:text-right text-gray-700">{nextReadingStr}</div>
                            <div className="md:col-span-2 text-gray-600 truncate italic" title={description}>{description}</div>
                            
                            <div className="md:col-span-1 flex gap-2 justify-start md:justify-center flex-wrap mt-2 md:mt-0">
                                <ProtectedComponent requiredPermission="editor">
                                    <button onClick={() => setEditingRevision(item)} className="p-1.5 text-gray-500 hover:text-yellow-600 hover:bg-white rounded shadow-sm border border-transparent hover:border-gray-200 transition-all" title="Agendar/Editar Plano">
                                        <Edit size={16} />
                                    </button>
                                     <button onClick={() => setCompletingRevision(item)} className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-white rounded shadow-sm border border-transparent hover:border-gray-200 transition-all" title="Concluir Revisão (Baixa)">
                                        <CheckCircle size={16} />
                                    </button>
                                </ProtectedComponent>
                                <button onClick={() => setHistoryModalVehicle(item)} className={`p-1.5 rounded shadow-sm border border-transparent hover:border-gray-200 transition-all ${historyIconClass}`} title="Ver Histórico">
                                    <History size={16} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {completingRevision && (
                <CompleteRevisionModal 
                    user={user} 
                    vehicle={completingRevision} 
                    onClose={() => setCompletingRevision(null)} 
                    setAlertMessage={setAlertMessage} 
                    apiClient={apiClient} 
                    reloadData={reloadData} 
                    PasswordConfirmationModal={PasswordConfirmationModal} 
                />
            )}
            
            {historyModalVehicle && (
                <RevisionHistoryModal 
                    vehicle={historyModalVehicle} 
                    onClose={() => setHistoryModalVehicle(null)} 
                />
            )}
        </div>
    );
};

// --- Modal de Conclusão de Revisão (Compacto e Corrigido) ---
const CompleteRevisionModal = ({ user, vehicle, onClose, setAlertMessage, apiClient, reloadData, PasswordConfirmationModal }) => {
    const readingInfo = useMemo(() => getVehicleMainReading(vehicle), [vehicle]);
    
    // Sugestão Visual
    const suggestedNextReading = useMemo(() => {
        const current = parseFloat(readingInfo.raw || 0);
        const increment = readingInfo.unit === 'Hr' ? 250 : 10000;
        return (current + increment).toFixed(0);
    }, [readingInfo]);

    const [formData, setFormData] = useState({
        realizadaEm: new Date().toISOString().split('T')[0],
        leituraRealizada: readingInfo.raw ? readingInfo.raw.toString() : '',
        descricao: vehicle.revision?.descricao || '', // Pré-preenche apenas como sugestão
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
        if (!vehicle || !vehicle.id) {
            setAlertMessage("Erro Crítico: ID inválido.");
            return;
        }

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
            // CORREÇÃO ERRO 400: Envia apenas o payload. O apiClient deve lidar com a URL.
            const payload = {
                vehicleId: vehicle.id,
                ...formData,
                realizadaPor: user.email || 'Sistema'
            };

            console.log("Enviando payload:", payload);

            if (apiClient && apiClient.completeRevision) {
                // Tenta chamar com um único argumento (objeto), pois a assinatura provável é completeRevision(data)
                // Se a API esperasse (id, data), o código anterior teria funcionado ou a URL no log teria o ID.
                await apiClient.completeRevision(payload); 
                
                // CORREÇÃO ERRO #31: Envia String, não objeto
                setAlertMessage("Sucesso: Manutenção registrada!");
                
                if (reloadData) reloadData();
                onClose();
            } else {
                console.log("Mock API Call:", payload);
                alert("Simulação: Revisão concluída!");
                onClose();
            }
        } catch (error) {
            console.error("Erro ao salvar:", error);
            // CORREÇÃO ERRO #31: Envia String
            setAlertMessage(`Erro: ${error.message || "Falha ao concluir"}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-fadeInUp">
                <div className="px-4 py-3 border-b bg-green-50 flex justify-between items-center">
                    <h2 className="text-base font-bold text-green-800 flex items-center gap-2">
                        <CheckCircle size={18} className="text-green-600"/> Concluir Manutenção
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
                </div>
                
                <div className="p-4 space-y-3">
                    <div className="bg-blue-50 px-3 py-2 rounded border border-blue-100 flex justify-between items-center">
                        <div className="overflow-hidden">
                            <p className="text-sm font-bold text-gray-800 truncate">{vehicle.registroInterno} - {vehicle.placa}</p>
                        </div>
                        <div className="text-right whitespace-nowrap ml-2">
                             <span className="text-[10px] text-gray-500 block uppercase">Atual</span>
                             <span className="font-mono font-bold text-blue-700 text-sm">
                                 {parseFloat(readingInfo.raw || 0).toFixed(1)} {readingInfo.unit}
                             </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Data Realização *</label>
                            <input type="date" name="realizadaEm" value={formData.realizadaEm} onChange={handleChange} className="w-full p-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-green-500 outline-none" required/>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Nova Leitura ({readingInfo.unit}) *</label>
                            <input 
                                type="number" 
                                name="leituraRealizada" 
                                value={formData.leituraRealizada} 
                                onChange={handleChange} 
                                className="w-full p-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-green-500 outline-none" 
                                placeholder={readingInfo.label} 
                                required
                            />
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Histórico: O que foi feito?</label>
                        <textarea name="descricao" value={formData.descricao} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-green-500 outline-none resize-none" rows="2" placeholder="Troca de óleo, filtros..."></textarea>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Custo Total (R$)</label>
                            <input type="number" step="0.01" name="custo" value={formData.custo} onChange={handleChange} className="w-full p-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-green-500 outline-none" placeholder="0.00"/>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Nota Fiscal</label>
                            <input type="text" name="notaFiscal" value={formData.notaFiscal} onChange={handleChange} className="w-full p-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-green-500 outline-none" placeholder="Nº NF"/>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-3 rounded border border-gray-200 mt-1">
                        <div className="text-[10px] font-bold text-gray-500 uppercase border-b border-gray-200 pb-1 mb-2 flex items-center gap-1">
                            <Clock size={12}/> Próxima Revisão (Meta)
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-medium text-gray-600 mb-1">Data Meta</label>
                                <input type="date" name="proximaRevisaoData" value={formData.proximaRevisaoData} onChange={handleChange} className="w-full p-1.5 border border-gray-300 rounded text-xs focus:border-blue-500 outline-none"/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-medium text-gray-600 mb-1">Leitura Meta</label>
                                <input type="number" name="proximaRevisaoLeitura" value={formData.proximaRevisaoLeitura} onChange={handleChange} className="w-full p-1.5 border border-gray-300 rounded text-xs focus:border-blue-500 outline-none" placeholder={`Sug: ${suggestedNextReading}`}/>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-3 gap-2 border-t">
                        <button onClick={onClose} className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 transition">Cancelar</button>
                        <button onClick={handlePreSubmit} disabled={isSaving} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-bold hover:bg-green-700 flex items-center gap-1 shadow hover:shadow-md transition">
                            {isSaving ? <Loader size={14} className="animate-spin"/> : <CheckCircle size={14}/>} 
                            Confirmar
                        </button>
                    </div>
                </div>
            </div>
            
            {showPassword && (
                <PasswordConfirmationModal 
                    message={`Inconsistência:\n${blockMessage}\nSenha de supervisor necessária.`}
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
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-fadeIn">
                <div className="p-3 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2"><History size={16}/> Histórico</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
                </div>
                <div className="p-4 overflow-y-auto flex-1 space-y-3 custom-scrollbar bg-gray-50">
                    {history.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                            <p className="text-sm">Nenhum registro.</p>
                        </div>
                    ) : (
                        history.map((h, i) => (
                            <div key={i} className="p-3 border border-gray-200 rounded bg-white shadow-sm text-sm">
                                <div className="flex justify-between font-bold text-gray-800 border-b pb-1 mb-1">
                                    <span>{new Date(h.data).toLocaleDateString('pt-BR')}</span>
                                    <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded border">
                                        {h.km} {getVehicleMainReading(vehicle).unit}
                                    </span>
                                </div>
                                <p className="text-gray-700 mb-1">{h.descricao}</p>
                                <div className="flex justify-between text-xs text-gray-500">
                                    <span>{h.realizadaPor || 'Sistema'}</span>
                                    {h.notaFiscal && <span>NF: {h.notaFiscal}</span>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default RevisionsPage;