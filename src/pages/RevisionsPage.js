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

    // Combina veículos com seus planos de revisão
    const combinedData = useMemo(() => {
        const validVehicles = Array.isArray(vehicles) ? vehicles : [];
        const validRevisions = Array.isArray(revisions) ? revisions : [];

        // Ordenação por registro interno conforme solicitado
        const sortedVehicles = [...validVehicles].sort((a, b) => {
            const regA = a.registroInterno || '';
            const regB = b.registroInterno || '';
            // Tenta ordenação numérica se possível, senão alfabética
            const numA = parseInt(regA.replace(/\D/g, ''));
            const numB = parseInt(regB.replace(/\D/g, ''));
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return regA.localeCompare(regB);
        });

        return sortedVehicles.map(vehicle => {
            if (!vehicle) return null;
            // Busca o plano de revisão associado OU cria um objeto vazio para não quebrar a UI
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
        
        // REGRA GLOBAL: Caminhões e Máquinas Pesadas usam Horímetro. Leves/Trecho usam Odometro.
        let reading;
        if (unit === 'Hr') {
            reading = revision.proximaRevisaoHorimetro;
            // Fallback visual caso venha de migração antiga com dados em odometro
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
                {/* Header da Tabela */}
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
                    
                    // Validação de Restrições (VehicleRules)
                    const issues = checkVehicleRestrictions(vehicle, [revision]);
                    
                    // Separação de Categorias de Alerta (Regra Global 4)
                    const maintenanceIssues = issues.filter(i => i.category === 'manutencao');
                    const docIssues = issues.filter(i => i.category === 'documentacao' || i.category === 'legal');
                    
                    // Verifica severidade
                    const isMaintOverdue = maintenanceIssues.some(i => i.type === 'error');
                    const isMaintWarning = maintenanceIssues.some(i => i.type === 'warning');
                    
                    const isDocOverdue = docIssues.some(i => i.type === 'error');
                    const isDocWarning = docIssues.some(i => i.type === 'warning');

                    // Definição de Cores da Linha (Prioridade para Erros)
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
                            
                            {/* Coluna Veículo */}
                            <div className="md:col-span-3">
                                <div className="flex items-center gap-3">
                                    {/* Ícones de Alerta Distintos */}
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

                            {/* Dados de Leitura e Datas */}
                            <div className="md:col-span-2 text-left md:text-right font-mono font-semibold text-blue-700">{currentReadingStr}</div>
                            <div className="md:col-span-2 text-left md:text-center text-gray-700">{nextDateStr}</div>
                            <div className="md:col-span-2 text-left md:text-right text-gray-700">{nextReadingStr}</div>
                            
                            {/* Descrição */}
                            <div className="md:col-span-2 text-gray-600 truncate italic" title={description}>{description}</div>
                            
                            {/* Ações */}
                            <div className="md:col-span-1 flex gap-2 justify-start md:justify-center flex-wrap mt-2 md:mt-0">
                                <ProtectedComponent requiredPermission="editor">
                                    <button 
                                        onClick={() => setEditingRevision(item)} 
                                        className="p-1.5 text-gray-500 hover:text-yellow-600 hover:bg-white rounded shadow-sm border border-transparent hover:border-gray-200 transition-all" 
                                        title="Agendar/Editar Plano"
                                    >
                                        <Edit size={16} />
                                    </button>
                                     <button 
                                        onClick={() => setCompletingRevision(item)} 
                                        className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-white rounded shadow-sm border border-transparent hover:border-gray-200 transition-all" 
                                        title="Concluir Revisão (Baixa)"
                                    >
                                        <CheckCircle size={16} />
                                    </button>
                                </ProtectedComponent>
                                <button 
                                    onClick={() => setHistoryModalVehicle(item)} 
                                    className={`p-1.5 rounded shadow-sm border border-transparent hover:border-gray-200 transition-all ${historyIconClass}`} 
                                    title="Ver Histórico"
                                >
                                    <History size={16} />
                                </button>
                            </div>
                        </div>
                    );
                })}

                 {combinedData.length === 0 && (
                     <div className="p-10 text-center flex flex-col items-center justify-center text-gray-400">
                        <Info size={48} className="mb-4 opacity-50"/>
                        <p className="text-lg">Nenhum veículo encontrado.</p>
                        <p className="text-sm">Tente ajustar os filtros de busca.</p>
                     </div>
                 )}
            </div>
            
            {/* Modal de Conclusão */}
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
            
            {/* Modal de Histórico */}
            {historyModalVehicle && (
                <RevisionHistoryModal 
                    vehicle={historyModalVehicle} 
                    onClose={() => setHistoryModalVehicle(null)} 
                />
            )}
        </div>
    );
};

// --- Modal de Conclusão de Revisão (Correção Erro 400 + Regras de Horímetro) ---
const CompleteRevisionModal = ({ user, vehicle, onClose, setAlertMessage, apiClient, reloadData, PasswordConfirmationModal }) => {
    const readingInfo = useMemo(() => getVehicleMainReading(vehicle), [vehicle]);
    
    // Calcula sugestão de próxima leitura baseada na regra padrão (ex: +250hr ou +10000km)
    // Isso é visual, a regra exata pode variar.
    const suggestedNextReading = useMemo(() => {
        const current = parseFloat(readingInfo.raw || 0);
        const increment = readingInfo.unit === 'Hr' ? 250 : 10000;
        return (current + increment).toFixed(0);
    }, [readingInfo]);

    const [formData, setFormData] = useState({
        realizadaEm: new Date().toISOString().split('T')[0],
        leituraRealizada: readingInfo.raw ? readingInfo.raw.toString() : '',
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
        // Validação de Segurança (Id do Veículo)
        if (!vehicle || !vehicle.id) {
            setAlertMessage("Erro Crítico: Identificador do veículo inválido.");
            return;
        }

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
            // CORREÇÃO CRÍTICA DO ERRO 400:
            // Garantir que vehicleId é enviado explicitamente no corpo da requisição.
            const payload = {
                vehicleId: vehicle.id, // OBRIGATÓRIO
                ...formData,
                realizadaPor: user.email || 'Sistema'
            };

            console.log("Enviando payload de conclusão:", payload); // Debug

            await apiClient.completeRevision(vehicle.id, payload);
            
            setAlertMessage({ type: 'success', text: "Revisão concluída com sucesso!" });
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao salvar:", error);
            setAlertMessage({ type: 'error', text: error.message || "Erro ao concluir revisão." });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fadeInUp">
                <div className="p-5 border-b bg-gradient-to-r from-green-50 to-white flex justify-between items-center">
                    <h2 className="text-xl font-bold text-green-800 flex items-center gap-2">
                        <CheckCircle size={24} className="text-green-600"/> Concluir Manutenção
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><X size={24}/></button>
                </div>
                
                <div className="p-6 space-y-5">
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex justify-between items-center">
                        <div>
                            <p className="text-xs text-blue-600 uppercase font-bold tracking-wide">Veículo Selecionado</p>
                            <p className="text-lg font-bold text-gray-800">{vehicle.registroInterno}</p>
                            <p className="text-sm text-gray-600">{vehicle.marca} {vehicle.modelo} ({vehicle.placa})</p>
                        </div>
                        <div className="text-right">
                             <span className="text-xs text-gray-500 block">Leitura Atual</span>
                             <span className="font-mono font-bold text-blue-700 text-lg">
                                 {parseFloat(readingInfo.raw || 0).toFixed(1)} {readingInfo.unit}
                             </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Data Realização *</label>
                            <input type="date" name="realizadaEm" value={formData.realizadaEm} onChange={handleChange} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" required/>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Nova Leitura ({readingInfo.unit}) *</label>
                            <input 
                                type="number" 
                                name="leituraRealizada" 
                                value={formData.leituraRealizada} 
                                onChange={handleChange} 
                                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" 
                                placeholder={readingInfo.label} 
                                required
                            />
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Descrição do Serviço</label>
                        <textarea name="descricao" value={formData.descricao} onChange={handleChange} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" rows="2" placeholder="Descreva o que foi feito..."></textarea>
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Custo Total (R$)</label>
                            <input type="number" step="0.01" name="custo" value={formData.custo} onChange={handleChange} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="0.00"/>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Nota Fiscal</label>
                            <input type="text" name="notaFiscal" value={formData.notaFiscal} onChange={handleChange} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="Nº NF"/>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-2">
                        <div className="text-xs font-bold text-gray-500 uppercase border-b border-gray-200 pb-2 mb-3 flex items-center gap-1">
                            <Clock size={14}/> Agendar Próxima Revisão
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Data Meta</label>
                                <input type="date" name="proximaRevisaoData" value={formData.proximaRevisaoData} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded text-sm focus:border-blue-500 outline-none"/>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Leitura Meta ({readingInfo.unit})</label>
                                <input type="number" name="proximaRevisaoLeitura" value={formData.proximaRevisaoLeitura} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded text-sm focus:border-blue-500 outline-none" placeholder={`Sug: ${suggestedNextReading}`}/>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 gap-3 border-t">
                        <button onClick={onClose} className="px-5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition">Cancelar</button>
                        <button onClick={handlePreSubmit} disabled={isSaving} className="px-5 py-2.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 flex items-center gap-2 shadow-lg hover:shadow-xl transition transform active:scale-95">
                            {isSaving ? <Loader size={18} className="animate-spin"/> : <CheckCircle size={18}/>} 
                            Confirmar Conclusão
                        </button>
                    </div>
                </div>
            </div>
            
            {showPassword && (
                <PasswordConfirmationModal 
                    message={`Bloqueio de Inconsistência:\n${blockMessage}\nÉ necessária autorização de supervisor para confirmar esta leitura.`}
                    onConfirm={executeSave}
                    onClose={() => setShowPassword(false)}
                    apiClient={apiClient}
                />
            )}
        </div>
    );
};

// --- Modal de Histórico ---
const RevisionHistoryModal = ({ vehicle, onClose }) => {
    const history = vehicle?.revision?.historico || [];
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-fadeIn">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2"><History size={20}/> Histórico de Manutenção</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
                </div>
                <div className="p-4 bg-blue-50 text-sm text-blue-800 border-b border-blue-100">
                    Veículo: <strong>{vehicle.registroInterno}</strong> - {vehicle.placa}
                </div>
                <div className="p-4 overflow-y-auto flex-1 space-y-3 custom-scrollbar bg-gray-100">
                    {history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                            <Clock size={40} className="mb-2 opacity-30"/>
                            <p>Nenhum histórico registrado.</p>
                        </div>
                    ) : (
                        history.map((h, i) => (
                            <div key={i} className="p-4 border border-gray-200 rounded-lg bg-white shadow-sm hover:shadow-md transition">
                                <div className="flex justify-between font-bold text-gray-800 border-b pb-2 mb-2">
                                    <span className="flex items-center gap-1"><Clock size={14} className="text-blue-500"/> {new Date(h.data).toLocaleDateString('pt-BR')}</span>
                                    <span className="bg-gray-100 px-2 py-0.5 rounded text-xs border border-gray-300">
                                        {h.km} {getVehicleMainReading(vehicle).unit}
                                    </span>
                                </div>
                                <p className="text-gray-700 mb-2 font-medium">{h.descricao}</p>
                                <div className="flex justify-between text-xs text-gray-500 mt-2 pt-2 border-t border-dashed border-gray-200">
                                    <span>Resp: {h.realizadaPor || 'Sistema'}</span>
                                    {h.notaFiscal && <span className="font-mono bg-yellow-50 px-1 rounded text-yellow-700 border border-yellow-200">NF: {h.notaFiscal}</span>}
                                    {h.custo > 0 && <span className="font-bold text-green-700">R$ {parseFloat(h.custo).toFixed(2)}</span>}
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