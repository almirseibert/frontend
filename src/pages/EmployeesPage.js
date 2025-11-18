import React, { useState, useMemo, useEffect } from 'react';
import {
    PlusCircle,
    Upload,
    Download,
    ChevronsUpDown,
    UserX,
    UserCheck,
    Edit,
    Clock,
    ShieldAlert,
    Trash2,
    X,
    Users,
    Info,
    Loader,
    Calendar, // Ícone para datas
    Briefcase // Ícone para admissão
} from 'lucide-react';
import Papa from 'papaparse'; 

import ProtectedComponent from '../components/ProtectedComponent';
// import { useAuth } from '../contexts/AuthContext'; // (Não usado diretamente aqui, vem via props se precisar)
import apiClient from '../services/apiClient';

// ===================================================================================
// MODAL PARA EDITAR/ADICIONAR FUNCIONÁRIO
// ===================================================================================
const EmployeeModal = ({ user, employee, employees, apiClient, onClose, setAlertMessage, reloadData }) => {
    const [formData, setFormData] = useState({
        nome: employee?.nome || '',
        vulgo: employee?.vulgo || '',
        funcao: employee?.funcao || 'Motorista', 
        registroInterno: employee?.registroInterno || '',
        cpf: employee?.cpf || '',
        endereco: employee?.endereco || '',
        cidade: employee?.cidade || '',
        contato: employee?.contato || '',
        cnhNumero: employee?.cnhNumero || '',
        cnhCategoria: employee?.cnhCategoria || '',
        cnhVencimento: employee?.cnhVencimento ? new Date(employee.cnhVencimento).toISOString().split('T')[0] : '',
        podeAcessarAbastecimento: employee?.podeAcessarAbastecimento || false,
        // Usa dataAdmissao se existir, senão tenta dataContratacao (legado), senão vazio
        dataAdmissao: employee?.dataAdmissao 
            ? new Date(employee.dataAdmissao).toISOString().split('T')[0] 
            : (employee?.dataContratacao ? new Date(employee.dataContratacao).toISOString().split('T')[0] : ''),
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const isEditing = !!employee;

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setError('');

        // Validação de duplicidade
        const internalIdExists = (employees || []).some(emp =>
            emp.registroInterno === formData.registroInterno && emp.id !== employee?.id
        );
        if (internalIdExists && formData.registroInterno) {
            setError('Já existe um funcionário com este registro interno.');
            setIsSaving(false);
            return;
        }
         if (!formData.nome || !formData.registroInterno) {
            setError('Nome e Registro Interno são obrigatórios.');
            setIsSaving(false);
            return;
        }

        const dataToSave = {
            ...formData,
            podeAcessarAbastecimento: formData.podeAcessarAbastecimento,
            cnhVencimento: formData.cnhVencimento || null,
            dataAdmissao: formData.dataAdmissao || null, 
        };
        
        // Limpeza de campos vazios
        Object.keys(dataToSave).forEach(key => {
            if (dataToSave[key] === '' && typeof dataToSave[key] !== 'boolean') {
                dataToSave[key] = null;
            }
        });

        try {
            if (isEditing) {
                await apiClient.updateEmployee(employee.id, dataToSave);
                setAlertMessage('Funcionário atualizado com sucesso!');
            } else {
                dataToSave.id = crypto.randomUUID(); // Gera ID no frontend para o MySQL
                dataToSave.status = 'ativo'; // Garante status ativo ao criar
                await apiClient.createEmployee(dataToSave);
                setAlertMessage('Funcionário adicionado com sucesso!');
            }
            reloadData(); 
            onClose(); 
        } catch (err) {
            console.error("Erro ao salvar funcionário via API:", err);
            setError(err.message || "Ocorreu um erro ao salvar o funcionário.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[95vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <h2 className="text-2xl font-bold">{isEditing ? 'Editar Funcionário' : 'Adicionar Funcionário'}</h2>
                     <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-gray-200"><X size={20}/></button>
                </div>
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700">Nome Completo*</label><input name="nome" value={formData.nome} onChange={handleChange} placeholder="Nome Completo" required className="mt-1 w-full p-2 border rounded bg-gray-50"/></div>
                        <div><label className="block font-medium text-gray-700">Vulgo</label><input name="vulgo" value={formData.vulgo} onChange={handleChange} placeholder="Apelido" className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>
                        <div><label className="block font-medium text-gray-700">Registro Interno*</label><input name="registroInterno" value={formData.registroInterno} onChange={handleChange} placeholder="Registro Interno" required className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>
                        
                        {/* CAMPO DATA DE ADMISSÃO */}
                        <div>
                            <label className="block font-medium text-gray-700 flex items-center gap-1">
                                <Briefcase size={14}/> Data de Admissão
                            </label>
                            <input name="dataAdmissao" type="date" value={formData.dataAdmissao} onChange={handleChange} className="mt-1 w-full p-2 border rounded bg-gray-50" />
                        </div>
                        
                        <div><label className="block font-medium text-gray-700">CPF</label><input name="cpf" value={formData.cpf} onChange={handleChange} placeholder="000.000.000-00" className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>
                        <div><label className="block font-medium text-gray-700">Função</label><select name="funcao" value={formData.funcao} onChange={handleChange} className="mt-1 w-full p-2 border rounded bg-gray-50"><option value="Motorista">Motorista</option><option value="Operador de Máquina">Operador de Máquina</option><option value="Mecânico">Mecânico</option><option value="Administrativo">Administrativo</option><option value="Outro">Outro</option></select></div>
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700">Endereço</label><input name="endereco" value={formData.endereco} onChange={handleChange} placeholder="Rua, Número, Bairro" className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>
                        <div><label className="block font-medium text-gray-700">Cidade</label><input name="cidade" value={formData.cidade} onChange={handleChange} placeholder="Cidade" className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>
                        <div><label className="block font-medium text-gray-700">Telefone / Contato</label><input name="contato" value={formData.contato} onChange={handleChange} placeholder="(XX) XXXXX-XXXX" className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>

                        <div className="md:col-span-2 border-t pt-4 mt-2">
                            <h3 className="text-lg font-semibold text-gray-800 mb-2">Dados da CNH</h3>
                        </div>
                        <div><label className="block font-medium text-gray-700">Número CNH</label><input name="cnhNumero" value={formData.cnhNumero} onChange={handleChange} placeholder="Número da CNH" className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>
                        <div><label className="block font-medium text-gray-700">Categoria CNH</label><input name="cnhCategoria" value={formData.cnhCategoria} onChange={handleChange} placeholder="Ex: AE" className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>
                        <div><label className="block font-medium text-gray-700">Vencimento CNH</label><input name="cnhVencimento" type="date" value={formData.cnhVencimento} onChange={handleChange} className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>

                        <div className="md:col-span-2 border-t pt-4 mt-2">
                             <h3 className="text-lg font-semibold text-gray-800 mb-2">Permissões</h3>
                             <div className="flex items-center">
                                 <input
                                     id="podeAcessarAbastecimento"
                                     name="podeAcessarAbastecimento"
                                     type="checkbox"
                                     checked={formData.podeAcessarAbastecimento}
                                     onChange={handleChange}
                                     className="h-4 w-4 text-yellow-600 focus:ring-yellow-500 border-gray-300 rounded"
                                 />
                                 <label htmlFor="podeAcessarAbastecimento" className="ml-2 block text-sm text-gray-900">
                                     Pode acessar o módulo de Abastecimento/Comboio
                                 </label>
                             </div>
                         </div>

                        {error && <p className="text-sm text-red-600 md:col-span-2 bg-red-50 p-3 rounded border border-red-200">{error}</p>}
                    </div>
                    <div className="p-6 bg-gray-50 border-t flex justify-end gap-4 sticky bottom-0 z-10">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm font-medium" disabled={isSaving}>Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1 text-sm">
                             {isSaving ? <><Loader size={16} className="animate-spin"/> Salvando...</> : 'Salvar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ===================================================================================
// NOVO: MODAL PARA MUDANÇA DE STATUS (ATIVAR/INATIVAR COM DATA)
// ===================================================================================
const StatusChangeModal = ({ employee, onClose, onConfirm }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [isLoading, setIsLoading] = useState(false);
    
    // Corrigindo lógica de detecção de status para ser case-insensitive e robusta
    const currentStatus = (employee.status || 'inativo').toLowerCase();
    const isActivating = currentStatus === 'inativo';
    
    const actionText = isActivating ? 'Readmitir/Ativar Funcionário' : 'Desligar/Inativar Funcionário';
    const dateLabel = isActivating ? 'Data de Readmissão (Novo Contrato)' : 'Data de Desligamento';
    const message = isActivating 
        ? `Deseja realmente reativar ${employee.nome}?`
        : `Deseja realmente inativar ${employee.nome}?`;
    const subMessage = isActivating
        ? "Esta data será registrada como a nova Data de Admissão e o histórico anterior será preservado."
        : "Esta data será registrada como Data de Desligamento e o funcionário ficará inativo.";

    const handleConfirm = async () => {
        if (!date) {
            alert('Por favor, informe a data.');
            return;
        }
        setIsLoading(true);
        await onConfirm(employee, date);
        setIsLoading(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 border-t-4 border-yellow-400">
                <h3 className="text-xl font-bold mb-2 text-gray-800">{actionText}</h3>
                <p className="text-gray-700 font-medium mb-1">{message}</p>
                <p className="text-gray-500 text-sm mb-6">{subMessage}</p>
                
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">{dateLabel} *</label>
                    <input 
                        type="date" 
                        value={date} 
                        onChange={(e) => setDate(e.target.value)} 
                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none"
                        required
                    />
                </div>

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} disabled={isLoading} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium text-sm transition">Cancelar</button>
                    <button onClick={handleConfirm} disabled={isLoading} className={`px-4 py-2 text-white rounded-lg font-medium text-sm transition flex items-center gap-2 ${isActivating ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                        {isLoading ? <Loader size={16} className="animate-spin"/> : null}
                        Confirmar {isActivating ? 'Readmissão' : 'Desligamento'}
                    </button>
                </div>
            </div>
        </div>
    );
};


// ===================================================================================
// MODAL HISTÓRICO (ATUALIZADO COM EVENTOS DE RH)
// ===================================================================================
const EmployeeHistoryModal = ({ employee, onClose, apiClient }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (employee) {
            const fetchHistory = async () => {
                setLoading(true);
                try {
                    // Chama API para buscar histórico completo (RH + Obras)
                    const data = await apiClient.getEmployeeHistory(employee.id);
                    setHistory(data || []);
                } catch (error) {
                    console.error("Erro ao buscar histórico:", error);
                } finally {
                    setLoading(false);
                }
            };
            fetchHistory();
        }
    }, [employee, apiClient]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold">Histórico Completo</h2>
                        <p className="text-gray-600 text-sm">{employee?.nome || 'Funcionário'}</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-gray-200"><X size={20}/></button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="text-center py-10 text-gray-500 flex flex-col items-center"><Loader className="animate-spin mb-2" /> Carregando histórico...</div>
                    ) : history.length > 0 ? (
                        <table className="w-full text-left table-auto border-collapse text-sm">
                            <thead className="bg-gray-100 sticky top-0 text-gray-600 uppercase text-xs">
                                <tr>
                                    <th className="p-3 border-b font-semibold">Tipo</th>
                                    <th className="p-3 border-b font-semibold">Detalhes</th>
                                    <th className="p-3 border-b font-semibold">Data / Período</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((h, index) => {
                                    // Formata data para exibição
                                    const dateStr = h.type === 'rh' 
                                        ? new Date(h.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
                                        : `${new Date(h.dateStart).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} - ${h.dateEnd ? new Date(h.dateEnd).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Atual'}`;

                                    // Estilos condicionais
                                    let rowClass = 'hover:bg-gray-50 border-b';
                                    let icon = <Clock size={16} className="text-blue-500" />;
                                    let typeLabel = 'Obra';

                                    if (h.type === 'rh') {
                                        typeLabel = 'RH';
                                        if (h.eventType === 'desligamento') {
                                            rowClass += ' bg-red-50 hover:bg-red-100 text-red-700';
                                            icon = <UserX size={16} />;
                                        } else {
                                            rowClass += ' bg-green-50 hover:bg-green-100 text-green-700';
                                            icon = <UserCheck size={16} />;
                                        }
                                    }

                                    return (
                                        <tr key={index} className={rowClass}>
                                            <td className="p-3 flex items-center gap-2 font-medium">
                                                {icon} {typeLabel}
                                            </td>
                                            <td className="p-3">
                                                {h.type === 'rh' 
                                                    ? <span className="font-medium">{h.description}</span>
                                                    : <span><span className="font-medium">{h.obraName}</span> - {h.vehicle}</span>}
                                            </td>
                                            <td className="p-3 font-mono text-xs whitespace-nowrap">{dateStr}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <p className="text-gray-500 text-center py-10 italic">Nenhum histórico encontrado.</p>
                    )}
                </div>
                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};


// ... (EmployeeFinesModal sem alterações - mas incluído para integridade) ...
const EmployeeFinesModal = ({ employee, fines, onClose }) => {
    const employeeFines = useMemo(() => {
        if (!employee || !Array.isArray(fines)) return [];
        return fines
            .filter(fine => fine.employeeId === employee.id)
            .sort((a, b) => (b.dataInfração || '').localeCompare(a.dataInfração || ''));
    }, [fines, employee]);

    const getStatusBadge = (status) => {
        switch (status) {
            case 'Paga': return 'bg-green-100 text-green-700 border-green-200';
            case 'Pendente': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            case 'Em Recurso': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'Cancelada': return 'bg-gray-100 text-gray-700 border-gray-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold">Histórico de Multas</h2>
                        <p className="text-gray-600 text-sm">{employee?.nome || 'Funcionário'}</p>
                    </div>
                     <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-gray-200"><X size={20}/></button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    {employeeFines.length > 0 ? (
                        <ul className="space-y-3">
                            {employeeFines.map(fine => (
                                <li key={fine.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                    <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                                        <div className="flex-1">
                                            <p className="font-semibold text-sm">{fine.descricao || 'Descrição não informada'}</p>
                                            <p className="text-xs text-gray-600">Veículo: {fine.vehicleInfo?.registroInterno || 'N/A'} - {fine.vehicleInfo?.placa || 'N/A'}</p>
                                            <p className="text-xs text-gray-600">Data: {fine.dataInfração ? new Date(fine.dataInfração).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</p>
                                        </div>
                                        <div className="text-left sm:text-right flex-shrink-0">
                                            <p className="font-bold text-red-600">R$ {(parseFloat(fine.valor) || 0).toFixed(2)}</p>
                                            <span className={`mt-1 inline-block px-2 py-0.5 text-xs font-bold rounded-full border ${getStatusBadge(fine.status)}`}>
                                                {fine.status || 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500 text-center py-10 text-sm italic">Nenhuma multa registrada para este funcionário.</p>
                    )}
                </div>
                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};

// ===================================================================================
// PÁGINA PRINCIPAL (ATUALIZADA)
// ===================================================================================
const EmployeesPage = ({
    user, apiClient, 
    employees = [], vehicles = [], obras = [], fines = [], 
    PasswordConfirmationModal, setAlertMessage, reloadData,
    vehicleGroups
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isFinesModalOpen, setIsFinesModalOpen] = useState(false);
    
    // ** Estado para modal de status **
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [employeeForStatusChange, setEmployeeForStatusChange] = useState(null);

    const [employeeForFines, setEmployeeForFines] = useState(null);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [employeeForHistory, setEmployeeForHistory] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'nome', direction: 'ascending' });
    const [isMigrating, setIsMigrating] = useState(false);
    const [filter, setFilter] = useState('ativos');

    // *** FILTRAGEM ROBUSTA ***
    // Garante que compara strings com strings e lida com possíveis erros de dados antigos
    const activeEmployees = useMemo(() => 
        (employees || []).filter(e => {
            const s = (e.status || '').toLowerCase();
            // Se o status vier corrompido como JSON string, tenta limpar ou assume inativo
            if (s.includes('{')) return false; 
            return s === 'ativo';
        }), 
    [employees]);

    const inactiveEmployees = useMemo(() => 
        (employees || []).filter(e => {
            const s = (e.status || '').toLowerCase();
            // Se for 'inativo' OU se for algo estranho (para não perder o registro)
            if (s.includes('{')) return true; 
            return s !== 'ativo';
        }), 
    [employees]);

    // ... (cálculo de alocações e tempo disponível) ...
    const employeeAllocations = useMemo(() => {
        const allocations = new Map();
        (obras || []).forEach(obra => {
            (Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : []).forEach(historyEntry => {
                const isCurrentAllocation = !historyEntry.dataSaida; 
                if (isCurrentAllocation && historyEntry.employeeId) {
                    const employeeId = historyEntry.employeeId;
                    if (!allocations.has(employeeId)) {
                        allocations.set(employeeId, []);
                    }
                    const vehicle = vehicles?.find(v => v.id === historyEntry.veiculoId);
                    if (vehicle) {
                        allocations.get(employeeId).push(vehicle);
                    }
                }
            });
        });
        (vehicles || []).forEach(vehicle => {
            if (vehicle.operationalAssignment && vehicle.operationalAssignment.employeeId) {
                const employeeId = vehicle.operationalAssignment.employeeId;
                 if (!allocations.has(employeeId)) {
                    allocations.set(employeeId, []);
                }
                 allocations.get(employeeId).push(vehicle);
            }
        });
        return allocations;
    }, [obras, vehicles]);

    const availableTimeData = useMemo(() => {
        const data = {};
        const now = new Date();
        activeEmployees.forEach(emp => {
            if (!employeeAllocations.has(emp.id)) {
                let lastDeallocationDate = null;
                (obras || []).forEach(obra => {
                    const latestHistoryEntry = (Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : [])
                        .filter(h => h.employeeId === emp.id && h.dataSaida)
                        .sort((a, b) => new Date(b.dataSaida).getTime() - new Date(a.dataSaida).getTime())[0];
                    if (latestHistoryEntry) {
                        const deallocDate = new Date(latestHistoryEntry.dataSaida);
                        if (!lastDeallocationDate || deallocDate > lastDeallocationDate) lastDeallocationDate = deallocDate;
                    }
                });
                if (lastDeallocationDate) {
                    const diffTime = Math.abs(now - lastDeallocationDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    data[emp.id] = { daysAvailable: diffDays, lastDeallocationDate: lastDeallocationDate.toLocaleDateString('pt-BR') };
                } else {
                    data[emp.id] = { daysAvailable: Infinity, lastDeallocationDate: 'N/A' };
                }
            }
        });
        return data;
    }, [activeEmployees, obras, employeeAllocations]);

    // ... (employeesToDisplay) ...
    const employeesToDisplay = useMemo(() => {
        const listToFilter = filter === 'ativos' ? activeEmployees : inactiveEmployees;
        if (!Array.isArray(listToFilter)) return [];

        let sortableItems = [...listToFilter];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                let comparison = 0;
                if (sortConfig.key === 'status') {
                    const statusA = employeeAllocations.has(a.id) ? 2 : (availableTimeData[a.id]?.daysAvailable === Infinity ? 0 : 1);
                    const statusB = employeeAllocations.has(b.id) ? 2 : (availableTimeData[b.id]?.daysAvailable === Infinity ? 0 : 1);
                    comparison = statusA - statusB;
                    if (comparison === 0 && statusA === 1) {
                         const daysA = availableTimeData[a.id]?.daysAvailable || 0;
                         const daysB = availableTimeData[b.id]?.daysAvailable || 0;
                         comparison = daysB - daysA;
                    }
                    if (comparison === 0) comparison = (a.nome || '').localeCompare(b.nome || '');
                } else {
                    const valA = a[sortConfig.key] || '';
                    const valB = b[sortConfig.key] || '';
                    comparison = String(valA).localeCompare(String(valB), 'pt-BR', { sensitivity: 'base' });
                }
                return sortConfig.direction === 'ascending' ? comparison : -comparison;
            });
        }

        const searchTermLower = searchTerm.toLowerCase();
        return sortableItems.filter(emp =>
            !searchTermLower ||
            (emp.nome || '').toLowerCase().includes(searchTermLower) ||
            (emp.vulgo || '').toLowerCase().includes(searchTermLower) ||
            (emp.funcao || '').toLowerCase().includes(searchTermLower) ||
            (emp.cidade || '').toLowerCase().includes(searchTermLower) ||
            (emp.registroInterno || '').toLowerCase().includes(searchTermLower)
        );
    }, [activeEmployees, inactiveEmployees, searchTerm, sortConfig, filter, availableTimeData, employeeAllocations]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
        setSortConfig({ key, direction });
    };

    const openModal = (employee = null) => { setEditingEmployee(employee); setIsModalOpen(true); };
    const openHistoryModal = (employee) => { setEmployeeForHistory(employee); setIsHistoryModalOpen(true); };
    const openFinesModal = (employee) => { setEmployeeForFines(employee); setIsFinesModalOpen(true); };
    const openDeleteModal = (id) => { setItemToDelete(id); setIsDeleteModalOpen(true); };

    // *** HANDLER PARA ABRIR MODAL DE STATUS ***
    const handleOpenStatusModal = (employee) => {
        if (employeeAllocations.has(employee.id) && employee.status === 'ativo') {
             setAlertMessage("Não é possível inativar um funcionário alocado.");
             return;
        }
        setEmployeeForStatusChange(employee);
        setIsStatusModalOpen(true);
    };

    // *** HANDLER PARA CONFIRMAR MUDANÇA DE STATUS ***
    const handleConfirmStatusChange = async (employee, date) => {
        const currentStatus = (employee.status || '').toLowerCase();
        const newStatus = currentStatus === 'ativo' ? 'inativo' : 'ativo';
        
        try {
            // Chama a rota específica no backend que trata status + data + histórico
            await apiClient.updateEmployeeStatus(employee.id, { status: newStatus, date: date });
            
            setAlertMessage(`Funcionário ${employee.nome} foi ${newStatus === 'ativo' ? 'readmitido' : 'desligado'} com sucesso.`);
            
            // Recarrega os dados para refletir a mudança nas listas e no histórico
            reloadData();
            
            setIsStatusModalOpen(false);
            setEmployeeForStatusChange(null);
        } catch(error) {
             console.error("Erro ao atualizar status:", error);
             setAlertMessage(error.message || `Falha ao alterar status.`);
        }
    };

    const handleDelete = async () => {
        if (!itemToDelete) return;
        try {
            await apiClient.deleteEmployee(itemToDelete);
            setAlertMessage('Funcionário excluído com sucesso.');
            reloadData();
        } catch (error) {
            console.error("Erro ao excluir funcionário via API:", error);
            setAlertMessage(error.message || 'Falha ao excluir funcionário.');
        } finally {
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        }
    };

    // ... (handleFileUpload e handleMigrateUsers mantidos) ...
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const data = results.data;
                 if (!data || data.length === 0) {
                    setAlertMessage("Arquivo CSV vazio.");
                    return;
                }
                setIsMigrating(true);
                setAlertMessage(`Importando ${data.length} funcionários...`);
                let successCount = 0;
                let errorCount = 0;
                for (const item of data) {
                    const employeeData = {
                        nome: item.Nome || item.nome || '',
                        vulgo: item.Vulgo || item.vulgo || '',
                        funcao: item.Função || item.funcao || 'Outro',
                        cpf: item.CPF || item.cpf || null,
                        endereco: item.Endereço || item.endereco || null,
                        cidade: item.Cidade || item.cidade || null,
                        contato: item.Contato || item.contato || null,
                        registroInterno: item['Registro Interno'] || item.registroInterno || '',
                        cnhNumero: item.cnhNumero || null,
                        cnhCategoria: item.cnhCategoria || null,
                        cnhVencimento: item.cnhVencimento || null,
                         status: 'ativo', podeAcessarAbastecimento: false,
                    };
                    if (!employeeData.nome || !employeeData.registroInterno) { errorCount++; continue; }
                    employeeData.id = crypto.randomUUID();
                    try { await apiClient.createEmployee(employeeData); successCount++; } 
                    catch (error) { errorCount++; }
                }
                setIsMigrating(false);
                setAlertMessage(`Importação: ${successCount} sucesso(s), ${errorCount} erro(s).`);
                if (successCount > 0) reloadData();
            }
        });
        event.target.value = null;
    };

    const handleMigrateUsers = async () => {
        setIsMigrating(true);
        setAlertMessage("Iniciando migração de usuários...");
        try {
            const result = await apiClient.adminMigrateUsers();
            setAlertMessage(result.message || "Migração solicitada.");
            reloadData();
        } catch (error) { setAlertMessage(error.message || `Falha na migração.`); } 
        finally { setIsMigrating(false); }
    };

    // ... (exportToCSV com novas colunas) ...
    const exportToCSV = () => {
        if (!employeesToDisplay || employeesToDisplay.length === 0) { setAlertMessage("Sem dados para exportar."); return; }
        const headers = ['Nome', 'Vulgo', 'Função', 'Registro', 'CPF', 'Endereço', 'Cidade', 'Contato', 'Status', 'Admissão', 'Desligamento', 'CNH', 'Acesso Abastecimento'];
        const rows = employeesToDisplay.map(emp => [
            emp.nome, emp.vulgo, emp.funcao, emp.registroInterno, emp.cpf, emp.endereco, emp.cidade, emp.contato, emp.status,
            emp.dataAdmissao ? new Date(emp.dataAdmissao).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '',
            emp.dataDesligamento ? new Date(emp.dataDesligamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '',
            `${emp.cnhCategoria || ''} - ${emp.cnhVencimento ? new Date(emp.cnhVencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : ''}`,
            emp.podeAcessarAbastecimento ? 'Sim' : 'Não'
        ]);
        const csv = Papa.unparse({ fields: headers, data: rows });
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `funcionarios_${filter}.csv`);
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };


    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-6 font-sans">
             <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Gerenciamento de Funcionários</h1>
                <ProtectedComponent requiredPermission="editor">
                    <div className="flex flex-wrap gap-2">
                        <ProtectedComponent requiredPermission="admin">
                            <button onClick={handleMigrateUsers} disabled={isMigrating} className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white font-semibold rounded-lg shadow hover:bg-purple-700 transition disabled:opacity-50 text-sm">{isMigrating ? <Loader size={16} className="animate-spin"/> : <Users size={16} />} Migrar Usuários</button>
                        </ProtectedComponent>
                        <label className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white font-semibold rounded-lg shadow hover:bg-green-600 transition cursor-pointer text-sm"><Upload size={16} /> Importar CSV<input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" /></label>
                        <button onClick={exportToCSV} className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow hover:bg-blue-600 transition text-sm"><Download size={16} />Exportar CSV</button>
                        <button onClick={() => openModal()} className="flex items-center gap-2 px-3 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg shadow hover:bg-yellow-500 transition text-sm"><PlusCircle size={16} />Adicionar</button>
                    </div>
                </ProtectedComponent>
            </div>

             <div className="mb-4 flex border-b border-gray-300">
                <button onClick={() => setFilter('ativos')} className={`py-2 px-4 font-semibold text-sm transition-colors ${filter === 'ativos' ? 'border-b-2 border-yellow-500 text-yellow-600' : 'text-gray-500 hover:text-gray-700'}`}>Ativos ({activeEmployees.length})</button>
                <button onClick={() => setFilter('inativos')} className={`py-2 px-4 font-semibold text-sm transition-colors ${filter === 'inativos' ? 'border-b-2 border-yellow-500 text-yellow-600' : 'text-gray-500 hover:text-gray-700'}`}>Inativos ({inactiveEmployees.length})</button>
            </div>

            <div className="mb-6"><input type="text" placeholder="Buscar por nome, vulgo, função, cidade ou registro..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-4 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-yellow-400 shadow-sm text-sm" /></div>

            <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-600">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                            <tr>
                                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('nome')}>Nome / Registro <ChevronsUpDown size={12} className="inline ml-1 opacity-50"/></th>
                                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('funcao')}>Função <ChevronsUpDown size={12} className="inline ml-1 opacity-50"/></th>
                                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('cidade')}>Cidade <ChevronsUpDown size={12} className="inline ml-1 opacity-50"/></th>
                                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('status')}>Status <ChevronsUpDown size={12} className="inline ml-1 opacity-50"/></th>
                                <th className="px-6 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employeesToDisplay.map(employee => {
                                const allocatedVehicles = employeeAllocations.get(employee.id) || [];
                                const isAllocated = allocatedVehicles.length > 0;
                                let allocationStatus = employee.status === 'inativo' ? 'Inativo' : (isAllocated ? 'Alocado' : 'Disponível');
                                
                                let allocationDetails = '';
                                let fullAllocationTitle = '';
                                if (isAllocated) {
                                    const vehicleNames = allocatedVehicles.map(v => v.registroInterno);
                                    fullAllocationTitle = vehicleNames.join(', ');
                                    allocationDetails = vehicleNames.length > 4 ? vehicleNames.slice(0, 4).join(', ') + ' ...' : fullAllocationTitle;
                                }
                                
                                const desligamentoInfo = employee.status === 'inativo' && employee.dataDesligamento 
                                    ? new Date(employee.dataDesligamento).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) 
                                    : null;

                                const statusColor = allocationStatus === 'Alocado' ? 'bg-green-100 text-green-700' : allocationStatus === 'Inativo' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700';

                                return (
                                    <tr key={employee.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900 flex items-center gap-1">{employee.nome} {employee.vulgo && <span className="text-gray-500">({employee.vulgo})</span>}</div>
                                            <div className="text-xs text-gray-500">Reg: {employee.registroInterno || 'N/A'}</div>
                                        </td>
                                        <td className="px-6 py-4">{employee.funcao || 'N/A'}</td>
                                        <td className="px-6 py-4">{employee.cidade || 'N/A'}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${statusColor}`}>{allocationStatus}</span>
                                            {isAllocated && <p className="text-[11px] text-gray-500 mt-1 truncate" title={fullAllocationTitle}>Em: {allocationDetails}</p>}
                                            {desligamentoInfo && <p className="text-[11px] text-red-600 mt-1">Desligado: {desligamentoInfo}</p>}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex justify-center items-center gap-1 flex-wrap">
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => handleOpenStatusModal(employee)} title={employee.status === 'ativo' ? 'Inativar (Desligar)' : 'Ativar (Readmitir)'} className={`p-1 rounded-full hover:bg-gray-200 transition`}>
                                                        {employee.status === 'ativo' ? <UserX size={16} className="text-red-500"/> : <UserCheck size={16} className="text-green-500"/>}
                                                    </button>
                                                </ProtectedComponent>
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => openModal(employee)} title="Editar" className="p-1 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-full transition"><Edit size={16} /></button>
                                                </ProtectedComponent>
                                                <button onClick={() => openHistoryModal(employee)} title="Histórico" className="p-1 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-full transition"><Clock size={16} /></button>
                                                <button onClick={() => openFinesModal(employee)} title="Multas" className="p-1 text-gray-400 hover:text-orange-600 hover:bg-gray-100 rounded-full transition"><ShieldAlert size={16} /></button>
                                                <ProtectedComponent requiredPermission="admin">
                                                    <button onClick={() => openDeleteModal(employee.id)} title="Excluir" className="p-1 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-full transition"><Trash2 size={16} /></button>
                                                </ProtectedComponent>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {employeesToDisplay.length === 0 && <tr><td colSpan="5" className="text-center p-6 text-gray-500">Nenhum funcionário encontrado.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modais */}
            {isModalOpen && <EmployeeModal user={user} employee={editingEmployee} employees={employees} apiClient={apiClient} onClose={() => setIsModalOpen(false)} setAlertMessage={setAlertMessage} reloadData={reloadData}/>}
            {isHistoryModalOpen && <EmployeeHistoryModal employee={employeeForHistory} onClose={() => setIsHistoryModalOpen(false)} apiClient={apiClient} />}
            {isFinesModalOpen && <EmployeeFinesModal employee={employeeForFines} fines={fines} onClose={() => setIsFinesModalOpen(false)} />}
            
            {isStatusModalOpen && employeeForStatusChange && (
                <StatusChangeModal 
                    employee={employeeForStatusChange} 
                    onClose={() => setIsStatusModalOpen(false)} 
                    onConfirm={handleConfirmStatusChange} 
                />
            )}

            {isDeleteModalOpen && <PasswordConfirmationModal message="Confirme sua senha para EXCLUIR este funcionário." onConfirm={handleDelete} onClose={() => setIsDeleteModalOpen(false)} apiClient={apiClient} />}
        </div>
    );
};

export default EmployeesPage;