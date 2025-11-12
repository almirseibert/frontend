import React, { useState, useMemo, useEffect } from 'react';
// REMOVIDO: Imports do Firebase (firestore, functions)
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
    Loader // Adicionado Loader
} from 'lucide-react';
import Papa from 'papaparse'; // Biblioteca para parsear CSV

// Importa o componente de proteção e hook/componentes necessários
import ProtectedComponent from '../components/ProtectedComponent';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../services/apiClient'; // Importa apiClient

// ===================================================================================
// MODAL PARA EDITAR/ADICIONAR FUNCIONÁRIO (ATUALIZADO PARA API)
// ===================================================================================
const EmployeeModal = ({ user, employee, employees, apiClient, onClose, setAlertMessage, reloadData }) => {
    // Estado inicial do formulário (mantido)
    const [formData, setFormData] = useState({
        nome: employee?.nome || '',
        vulgo: employee?.vulgo || '',
        funcao: employee?.funcao || 'Motorista', // Padrão
        registroInterno: employee?.registroInterno || '',
        cpf: employee?.cpf || '',
        endereco: employee?.endereco || '',
        cidade: employee?.cidade || '',
        contato: employee?.contato || '',
        cnhNumero: employee?.cnhNumero || '',
        cnhCategoria: employee?.cnhCategoria || '',
        // Converte data da API (se existir) para formato YYYY-MM-DD
        cnhVencimento: employee?.cnhVencimento ? new Date(employee.cnhVencimento).toISOString().split('T')[0] : '',
        podeAcessarAbastecimento: employee?.podeAcessarAbastecimento || false, // Checkbox
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const isEditing = !!employee;

    // Handler para mudanças (mantido, adicionado checkbox)
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    // Handler para submissão (USA API)
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setError('');

        // Validação de Registro Interno duplicado
        const internalIdExists = (employees || []).some(emp =>
            emp.registroInterno === formData.registroInterno && emp.id !== employee?.id
        );
        if (internalIdExists && formData.registroInterno) { // Só valida se não estiver vazio
            setError('Já existe um funcionário com este registro interno.');
            setIsSaving(false);
            return;
        }
        // Validação básica de nome e registro
         if (!formData.nome || !formData.registroInterno) {
            setError('Nome e Registro Interno são obrigatórios.');
            setIsSaving(false);
            return;
        }

        // Prepara dados para a API
        const dataToSave = {
            ...formData,
            // Backend deve definir 'status' inicial se não editando
            podeAcessarAbastecimento: formData.podeAcessarAbastecimento,
            // Garante que a data CNH é enviada corretamente ou null
             cnhVencimento: formData.cnhVencimento || null,
        };
        // Remove campos vazios (exceto booleanos) para não sobrescrever com ""
        Object.keys(dataToSave).forEach(key => {
            if (dataToSave[key] === '' && typeof dataToSave[key] !== 'boolean') {
                dataToSave[key] = null;
            }
        });


        try {
            if (isEditing) {
                // Chama API para ATUALIZAR
                await apiClient.updateEmployee(employee.id, dataToSave);
                setAlertMessage('Funcionário atualizado com sucesso!');
            } else {
                // *** CORREÇÃO DO ERRO 500 ***
                // Gera um ID (string) no frontend, pois o banco de dados (varchar) espera por ele.
                dataToSave.id = crypto.randomUUID();
                
                // Chama API para CRIAR
                await apiClient.createEmployee(dataToSave);
                setAlertMessage('Funcionário adicionado com sucesso!');
            }
            reloadData(); // Chama a função para recarregar dados no App.js
            onClose(); // Fecha o modal
        } catch (err) {
            console.error("Erro ao salvar funcionário via API:", err);
            setError(err.message || "Ocorreu um erro ao salvar o funcionário.");
        } finally {
            setIsSaving(false);
        }
    };

    // Renderização do Modal (ajustada com checkbox)
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[95vh] flex flex-col">
                {/* Cabeçalho */}
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <h2 className="text-2xl font-bold">{isEditing ? 'Editar Funcionário' : 'Adicionar Funcionário'}</h2>
                     <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-gray-200"><X size={20}/></button>
                </div>
                {/* Formulário */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        {/* Campos */}
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700">Nome Completo*</label><input name="nome" value={formData.nome} onChange={handleChange} placeholder="Nome Completo" required className="mt-1 w-full p-2 border rounded bg-gray-50"/></div>
                        <div><label className="block font-medium text-gray-700">Vulgo</label><input name="vulgo" value={formData.vulgo} onChange={handleChange} placeholder="Apelido" className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>
                        <div><label className="block font-medium text-gray-700">Registro Interno*</label><input name="registroInterno" value={formData.registroInterno} onChange={handleChange} placeholder="Registro Interno" required className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>
                        <div><label className="block font-medium text-gray-700">CPF</label><input name="cpf" value={formData.cpf} onChange={handleChange} placeholder="000.000.000-00" className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>
                        <div><label className="block font-medium text-gray-700">Função</label><select name="funcao" value={formData.funcao} onChange={handleChange} className="mt-1 w-full p-2 border rounded bg-gray-50"><option value="Motorista">Motorista</option><option value="Operador de Máquina">Operador de Máquina</option><option value="Mecânico">Mecânico</option><option value="Administrativo">Administrativo</option><option value="Outro">Outro</option></select></div>
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700">Endereço</label><input name="endereco" value={formData.endereco} onChange={handleChange} placeholder="Rua, Número, Bairro" className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>
                        <div><label className="block font-medium text-gray-700">Cidade</label><input name="cidade" value={formData.cidade} onChange={handleChange} placeholder="Cidade" className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>
                        <div><label className="block font-medium text-gray-700">Telefone / Contato</label><input name="contato" value={formData.contato} onChange={handleChange} placeholder="(XX) XXXXX-XXXX" className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>

                        {/* Dados da CNH */}
                        <div className="md:col-span-2 border-t pt-4 mt-2">
                            <h3 className="text-lg font-semibold text-gray-800 mb-2">Dados da CNH</h3>
                        </div>
                        <div><label className="block font-medium text-gray-700">Número CNH</label><input name="cnhNumero" value={formData.cnhNumero} onChange={handleChange} placeholder="Número da CNH" className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>
                        <div><label className="block font-medium text-gray-700">Categoria CNH</label><input name="cnhCategoria" value={formData.cnhCategoria} onChange={handleChange} placeholder="Ex: AE" className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>
                        <div><label className="block font-medium text-gray-700">Vencimento CNH</label><input name="cnhVencimento" type="date" value={formData.cnhVencimento} onChange={handleChange} className="mt-1 w-full p-2 border rounded bg-gray-50" /></div>

                        {/* Permissão de Abastecimento */}
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

                        {/* Mensagem de erro */}
                        {error && <p className="text-sm text-red-600 md:col-span-2 bg-red-50 p-3 rounded border border-red-200">{error}</p>}
                    </div>
                    {/* Rodapé */}
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
// MODAL HISTÓRICO (Usa props, ajustado para datas API)
// ===================================================================================
const EmployeeHistoryModal = ({ employee, obras, onClose }) => {
    // Calcula histórico
    const employeeHistory = useMemo(() => {
        if (!employee || !Array.isArray(obras)) return [];
        const history = [];
        obras.forEach(obra => {
            // Garante que historicoVeiculos é um array
            (Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : []).forEach(h => {
                if (h.details?.employeeId === employee.id) { // Verifica employeeId dentro de details
                    
                    // *** CORREÇÃO DO PERÍODO: Mudar de startDate/endDate para dataEntrada/dataSaida ***
                    // O backend (obraController) envia 'dataEntrada' e 'dataSaida'
                    const dataEntrada = h.dataEntrada ? new Date(h.dataEntrada).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A';
                    const dataSaida = h.dataSaida ? new Date(h.dataSaida).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Presente';
                    
                    history.push({
                        obraNome: obra.nome || 'Obra sem nome',
                        veiculo: `${h.details?.vehicleRegistroInterno || 'Veículo N/A'}`,
                        dataEntrada,
                        dataSaida,
                        // Adiciona data de entrada como Date para ordenação
                        entryDateObj: h.dataEntrada ? new Date(h.dataEntrada) : new Date(0) // *** CORREÇÃO AQUI TAMBÉM ***
                    });
                }
            });
        });
        // Ordena por data de entrada mais recente
        return history.sort((a,b) => b.entryDateObj - a.entryDateObj);
    }, [employee, obras]);

    // Renderização do modal
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                {/* Cabeçalho */}
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold">Histórico de Trabalho</h2>
                        <p className="text-gray-600 text-sm">{employee?.nome || 'Funcionário'}</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-gray-200"><X size={20}/></button>
                </div>
                {/* Tabela */}
                <div className="p-6 overflow-y-auto">
                    {employeeHistory.length > 0 ? (
                        <table className="w-full text-left table-auto border-collapse text-sm">
                            <thead className="bg-gray-100 sticky top-0">
                                <tr>
                                    <th className="p-2 border-b">Obra</th>
                                    <th className="p-2 border-b">Veículo</th>
                                    <th className="p-2 border-b">Período</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employeeHistory.map((h, index) => (
                                    <tr key={index} className="border-b hover:bg-gray-50">
                                        <td className="p-2">{h.obraNome}</td>
                                        <td className="p-2">{h.veiculo}</td>
                                        <td className="p-2">{h.dataEntrada} - {h.dataSaida}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="text-gray-500 text-center py-10">Nenhum histórico de trabalho encontrado.</p>
                    )}
                </div>
                {/* Rodapé */}
                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};


// ===================================================================================
// MODAL DE MULTAS (Usa props, ajustado para datas API)
// ===================================================================================
const EmployeeFinesModal = ({ employee, fines, onClose }) => {
    // Filtra e ordena multas
    const employeeFines = useMemo(() => {
        if (!employee || !Array.isArray(fines)) return [];
        return fines
            .filter(fine => fine.employeeId === employee.id)
            // Ordena por data da infração mais recente
            .sort((a, b) => (b.dataInfração || '').localeCompare(a.dataInfração || ''));
    }, [fines, employee]);

    // Badge de status
    const getStatusBadge = (status) => {
        switch (status) {
            case 'Paga': return 'bg-green-100 text-green-700 border-green-200';
            case 'Pendente': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            case 'Em Recurso': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'Cancelada': return 'bg-gray-100 text-gray-700 border-gray-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    // Renderização do modal
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                {/* Cabeçalho */}
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold">Histórico de Multas</h2>
                        <p className="text-gray-600 text-sm">{employee?.nome || 'Funcionário'}</p>
                    </div>
                     <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-gray-200"><X size={20}/></button>
                </div>
                 {/* Lista de Multas */}
                <div className="p-6 overflow-y-auto">
                    {employeeFines.length > 0 ? (
                        <ul className="space-y-3">
                            {employeeFines.map(fine => (
                                <li key={fine.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                    <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                                        {/* Detalhes */}
                                        <div className="flex-1">
                                            <p className="font-semibold text-sm">{fine.descricao || 'Descrição não informada'}</p>
                                            <p className="text-xs text-gray-600">Veículo: {fine.vehicleInfo?.registroInterno || 'N/A'} - {fine.vehicleInfo?.placa || 'N/A'}</p>
                                            <p className="text-xs text-gray-600">Data: {fine.dataInfração ? new Date(fine.dataInfração).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</p>
                                        </div>
                                         {/* Valor e Status */}
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
                        <p className="text-gray-500 text-center py-10 text-sm">Nenhuma multa registrada para este funcionário.</p>
                    )}
                </div>
                 {/* Rodapé */}
                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};

// ===================================================================================
// PÁGINA PRINCIPAL (ATUALIZADA PARA API e props)
// ===================================================================================
const EmployeesPage = ({
    user, apiClient, // Recebe apiClient e user
    employees = [], vehicles = [], obras = [], fines = [], // Dados via props
    PasswordConfirmationModal, setAlertMessage, reloadData, // Funções/Componentes via props
    vehicleGroups // Constantes globais
}) => {
    // Estados da UI (mantidos)
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isFinesModalOpen, setIsFinesModalOpen] = useState(false);
    const [employeeForFines, setEmployeeForFines] = useState(null);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [employeeForHistory, setEmployeeForHistory] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null); // Guarda o ID
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'nome', direction: 'ascending' });
    const [isMigrating, setIsMigrating] = useState(false); // Estado para migração
    const [filter, setFilter] = useState('ativos'); // Filtro Ativos/Inativos

    // Memoização de listas (mantida)
    const activeEmployees = useMemo(() => (employees || []).filter(e => e.status === 'ativo'), [employees]);
    const inactiveEmployees = useMemo(() => (employees || []).filter(e => e.status === 'inativo'), [employees]);

     // Mapa de alocação (Usa new Date() e estrutura de 'details')
    const employeeAllocations = useMemo(() => {
        const allocations = new Map();
        const now = new Date();

        (obras || []).forEach(obra => {
            (Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : []).forEach(historyEntry => {
                // Verifica se a alocação está ativa (sem dataSaida)
                // *** CORREÇÃO: Usa dataSaida ao invés de endDate ***
                const isCurrentAllocation = !historyEntry.dataSaida; 
                if (isCurrentAllocation && historyEntry.details?.employeeId) {
                    const employeeId = historyEntry.details.employeeId;
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
        // Inclui alocações operacionais (do campo 'operationalAssignment' do veículo)
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

     // Mapa de tempo disponível (Usa new Date() e estrutura de 'details')
    const availableTimeData = useMemo(() => {
        const data = {};
        const now = new Date();
        activeEmployees.forEach(emp => {
            if (!employeeAllocations.has(emp.id)) { // Só calcula se não estiver alocado
                let lastDeallocationDate = null;
                // Verifica histórico de obras
                (obras || []).forEach(obra => {
                    const latestHistoryEntry = (Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : [])
                        // *** CORREÇÃO: Usa dataSaida ao invés de endDate ***
                        .filter(h => h.details?.employeeId === emp.id && h.dataSaida) // Com data de saída
                        .sort((a, b) => new Date(b.dataSaida).getTime() - new Date(a.dataSaida).getTime())[0]; // Ordena
                    if (latestHistoryEntry) {
                        const deallocDate = new Date(latestHistoryEntry.dataSaida);
                        if (!lastDeallocationDate || deallocDate > lastDeallocationDate) {
                            lastDeallocationDate = deallocDate;
                        }
                    }
                });
                 // TODO: Adicionar verificação de histórico de alocação operacional (se o backend fornecer)

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
    }, [activeEmployees, obras, employeeAllocations]); // Depende de employeeAllocations


    // Filtra e ordena funcionários para exibição (sem mudanças na lógica)
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
                    if (comparison === 0) {
                         comparison = (a.nome || '').localeCompare(b.nome || '');
                    }
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

    // IDs de funcionários com multas pendentes (usa 'fines' prop)
    const employeesWithPendingFines = useMemo(() => {
        const employeeIds = new Set();
        (fines || []).forEach(fine => {
            if (fine.status === 'Pendente') {
                employeeIds.add(fine.employeeId);
            }
        });
        return employeeIds;
    }, [fines]);

    // Mudar ordenação (sem mudanças)
    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // Abrir modais (sem mudanças)
    const openModal = (employee = null) => { setEditingEmployee(employee); setIsModalOpen(true); };
    const openHistoryModal = (employee) => { setEmployeeForHistory(employee); setIsHistoryModalOpen(true); };
    const openFinesModal = (employee) => { setEmployeeForFines(employee); setIsFinesModalOpen(true); };
    const openDeleteModal = (id) => { setItemToDelete(id); setIsDeleteModalOpen(true); };

    // Handler para DELETAR (Usa apiClient)
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

    // Handler para ATIVAR/INATIVAR (Usa apiClient)
    const handleToggleEmployeeStatus = async (employee) => {
        if (employeeAllocations.has(employee.id) && employee.status === 'ativo') {
             setAlertMessage("Não é possível inativar um funcionário alocado.");
             return;
        }
        const newStatus = employee.status === 'ativo' ? 'inativo' : 'ativo';
        try {
            // Usa a rota específica 'updateEmployeeStatus'
            await apiClient.updateEmployeeStatus(employee.id, newStatus); // Envia string
            setAlertMessage(`Funcionário ${employee.nome} foi ${newStatus === 'ativo' ? 'ativado' : 'inativado'}.`);
            reloadData();
        } catch(error) {
             console.error("Erro ao atualizar status do funcionário via API:", error);
             setAlertMessage(error.message || `Falha ao ${newStatus === 'ativo' ? 'ativar' : 'inativar'} funcionário.`);
        }
    };

    // Handler para IMPORTAR CSV (Usa apiClient)
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const data = results.data;
                 if (!data || data.length === 0) {
                    setAlertMessage("Arquivo CSV vazio ou inválido.");
                    return;
                }

                setIsMigrating(true);
                setAlertMessage(`Importando ${data.length} funcionários...`);
                let successCount = 0;
                let errorCount = 0;
                let errorMessages = [];

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
                         status: 'ativo', // Padrão
                         podeAcessarAbastecimento: false, // Padrão
                    };

                    if (!employeeData.nome || !employeeData.registroInterno) {
                        console.warn("Linha ignorada (nome ou registro ausente):", item);
                        errorCount++;
                        errorMessages.push(`Linha ${successCount + errorCount}: Nome ou Registro Interno ausente.`);
                        continue;
                    }
                    
                    // *** CORREÇÃO: Adiciona ID aqui também para importação ***
                    employeeData.id = crypto.randomUUID();

                    try {
                        await apiClient.createEmployee(employeeData);
                        successCount++;
                    } catch (error) {
                        console.error("Erro ao importar funcionário:", item, error);
                        errorCount++;
                        errorMessages.push(`Linha ${successCount + errorCount} (${employeeData.nome}): ${error.message}`);
                    }
                }

                setIsMigrating(false);
                let summaryMessage = `Importação concluída: ${successCount} sucesso(s), ${errorCount} erro(s).`;
                if(errorCount > 0) {
                    summaryMessage += "\n\nErros (primeiros 5):\n" + errorMessages.slice(0, 5).join("\n");
                }
                setAlertMessage(summaryMessage); // Usa <pre> no CustomAlert para formatar
                if (successCount > 0) reloadData();

            },
            error: (error) => {
                console.error("Erro ao parsear CSV:", error);
                setAlertMessage("Erro ao ler o arquivo CSV.");
            }
        });

        event.target.value = null;
    };

    // Handler para EXPORTAR CSV (sem mudanças)
    const exportToCSV = () => {
        if (!employeesToDisplay || employeesToDisplay.length === 0) {
             setAlertMessage("Não há funcionários para exportar.");
             return;
        }
        const headers = ['Nome', 'Vulgo', 'Função', 'Registro Interno', 'CPF', 'Endereço', 'Cidade', 'Contato', 'Status', 'CNH Numero', 'CNH Categoria', 'CNH Vencimento', 'Acesso Abastecimento'];
        const rows = employeesToDisplay.map(emp => [
            emp.nome, emp.vulgo, emp.funcao, emp.registroInterno, emp.cpf, emp.endereco, emp.cidade, emp.contato, emp.status,
            emp.cnhNumero, emp.cnhCategoria, emp.cnhVencimento, emp.podeAcessarAbastecimento ? 'Sim' : 'Não'
        ]);
        const csvContent = Papa.unparse({ fields: headers, data: rows }, { delimiter: ',' });

        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `funcionarios_${filter}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Handler para MIGRAR USUÁRIOS (Usa apiClient)
    const handleMigrateUsers = async () => {
        // Confirmação
        // REMOVIDO: window.confirm (usar modal se quiser)
        // Por agora, executa direto ou assume que um modal de confirmação seria passado
        // if (!window.confirm("...")) { return; }

        setIsMigrating(true);
        setAlertMessage("Iniciando migração de usuários...");

        try {
            // Chama a nova função do apiClient
            const result = await apiClient.adminMigrateUsers();
            setAlertMessage(result.message || "Migração solicitada. Pode levar alguns minutos.");
            reloadData(); // Recarrega para ver novos 'userIds'
        } catch (error) {
            console.error("Erro ao executar a migração via API:", error);
            setAlertMessage(error.message || `Falha na migração.`);
        } finally {
            setIsMigrating(false);
        }
    };

    // Renderização Principal
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-6 font-sans">
            {/* Cabeçalho */}
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Gerenciamento de Funcionários</h1>
                <ProtectedComponent requiredPermission="editor">
                    <div className="flex flex-wrap gap-2">
                        <ProtectedComponent requiredPermission="admin">
                            <button
                                onClick={handleMigrateUsers}
                                disabled={isMigrating}
                                className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white font-semibold rounded-lg shadow hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                title="Cria usuários no sistema para funcionários que ainda não possuem login."
                            >
                                {isMigrating ? <Loader size={16} className="animate-spin"/> : <Users size={16} />}
                                {isMigrating ? 'Migrando...' : 'Migrar Usuários'}
                            </button>
                        </ProtectedComponent>
                        <label className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white font-semibold rounded-lg shadow hover:bg-green-600 transition cursor-pointer text-sm">
                            <Upload size={16} /> Importar CSV
                            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                        </label>
                        <button onClick={exportToCSV} className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow hover:bg-blue-600 transition text-sm"><Download size={16} />Exportar CSV</button>
                        <button onClick={() => openModal()} className="flex items-center gap-2 px-3 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg shadow hover:bg-yellow-500 transition text-sm">
                            <PlusCircle size={16} />Adicionar
                        </button>
                    </div>
                </ProtectedComponent>
            </div>

            {/* Abas Ativos/Inativos */}
            <div className="mb-4 flex border-b border-gray-300">
                <button
                    onClick={() => setFilter('ativos')}
                    className={`py-2 px-4 font-semibold text-sm transition-colors duration-150 ${filter === 'ativos' ? 'border-b-2 border-yellow-500 text-yellow-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Ativos ({activeEmployees.length})
                </button>
                <button
                    onClick={() => setFilter('inativos')}
                    className={`py-2 px-4 font-semibold text-sm transition-colors duration-150 ${filter === 'inativos' ? 'border-b-2 border-yellow-500 text-yellow-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Inativos ({inactiveEmployees.length})
                </button>
            </div>

            {/* Busca */}
            <div className="mb-6">
                <input
                    type="text"
                    placeholder="Buscar por nome, vulgo, função, cidade ou registro..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 shadow-sm text-sm"
                />
            </div>

            {/* Tabela */}
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
                                let allocationStatus = 'Disponível';
                                
                                // *** CORREÇÃO: Lógica de exibição dos veículos alocados (Limite de 4 + "...") ***
                                let allocationDetails = ''; // O que aparece na tela
                                let fullAllocationTitle = ''; // O que aparece no tooltip
                                
                                if (employee.status === 'inativo') {
                                    allocationStatus = 'Inativo';
                                } else if (isAllocated) {
                                    allocationStatus = 'Alocado';
                                    
                                    const vehicleNames = allocatedVehicles.map(v => v.registroInterno);
                                    fullAllocationTitle = vehicleNames.join(', '); // O tooltip sempre mostra todos

                                    if (vehicleNames.length > 4) {
                                        // Limita a 4 e adiciona "..."
                                        allocationDetails = vehicleNames.slice(0, 4).join(', ') + ' ...';
                                    } else {
                                        // Mostra todos se for 4 ou menos
                                        allocationDetails = fullAllocationTitle;
                                    }
                                }

                                const hasPendingFine = employeesWithPendingFines.has(employee.id);
                                const availableData = availableTimeData[employee.id];
                                const isInactiveAlert = allocationStatus === 'Disponível' && availableData && availableData.daysAvailable > 7 && availableData.daysAvailable !== Infinity; // Alerta após 7 dias

                                let statusColor = 'bg-gray-100 text-gray-700 border-gray-200';
                                if (allocationStatus === 'Alocado') statusColor = 'bg-green-100 text-green-700 border-green-200';
                                if (allocationStatus === 'Inativo') statusColor = 'bg-red-100 text-red-700 border-red-200';
                                if (isInactiveAlert) statusColor = 'bg-orange-100 text-orange-700 border-orange-200';
                                if (allocationStatus === 'Disponível' && !isInactiveAlert && availableData?.daysAvailable !== Infinity) statusColor = 'bg-blue-100 text-blue-700 border-blue-200'; // Disponível normal


                                return (
                                    <tr key={employee.id} className="bg-white border-b hover:bg-gray-50 transition-colors duration-150">
                                        {/* Nome/Registro */}
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900 flex items-center gap-1">
                                                {employee.nome || 'Nome não informado'}
                                                {employee.vulgo && <span className="text-gray-500">({employee.vulgo})</span>}
                                                {hasPendingFine && <ShieldAlert size={14} className="text-orange-500 flex-shrink-0" title="Possui multas pendentes"/>}
                                            </div>
                                            <div className="text-xs text-gray-500">Reg: {employee.registroInterno || 'N/A'}</div>
                                        </td>
                                        {/* Função */}
                                        <td className="px-6 py-4">{employee.funcao || 'N/A'}</td>
                                        {/* Cidade */}
                                        <td className="px-6 py-4">{employee.cidade || 'N/A'}</td>
                                         {/* Status */}
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${statusColor}`}>
                                                {allocationStatus}
                                            </span>
                                            {/* *** CORREÇÃO: Aplica as variáveis (com limite) e o tooltip (completo) *** */}
                                            {isAllocated && allocationDetails &&
                                                 <p className="text-[11px] text-gray-500 mt-1 truncate" title={`Alocado em: ${fullAllocationTitle}`}>
                                                     {`Em: ${allocationDetails}`}
                                                 </p>}
                                            {isInactiveAlert &&
                                                <p className="text-[11px] text-orange-700 mt-1 font-medium" title={`Disponível desde ${availableData.lastDeallocationDate}`}>
                                                    {`Há ${availableData.daysAvailable} dias`}
                                                </p>}
                                             {allocationStatus === 'Disponível' && !isInactiveAlert && availableData?.daysAvailable !== Infinity &&
                                                <p className="text-[11px] text-blue-700 mt-1 font-medium" title={`Disponível desde ${availableData.lastDeallocationDate}`}>
                                                     {`Há ${availableData.daysAvailable} dias`}
                                                </p>}
                                        </td>
                                        {/* Ações */}
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex justify-center items-center gap-1 flex-wrap">
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => handleToggleEmployeeStatus(employee)} title={employee.status === 'ativo' ? 'Inativar' : 'Ativar'} className={`p-1 rounded-full hover:bg-gray-200 transition`}>
                                                        {employee.status === 'ativo' ? <UserX size={16} className="text-red-500"/> : <UserCheck size={16} className="text-green-500"/>}
                                                    </button>
                                                </ProtectedComponent>
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => openModal(employee)} title="Editar" className="p-1 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-full transition"><Edit size={16} /></button>
                                                </ProtectedComponent>
                                                <button onClick={() => openHistoryModal(employee)} title="Histórico de Trabalho" className="p-1 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-full transition"><Clock size={16} /></button>
                                                <button onClick={() => openFinesModal(employee)} title="Histórico de Multas" className="p-1 text-gray-400 hover:text-orange-600 hover:bg-gray-100 rounded-full transition"><ShieldAlert size={16} /></button>
                                                <ProtectedComponent requiredPermission="admin">
                                                    <button onClick={() => openDeleteModal(employee.id)} title="Excluir" className="p-1 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-full transition"><Trash2 size={16} /></button>
                                                </ProtectedComponent>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {employeesToDisplay.length === 0 && (
                                <tr><td colSpan="5" className="text-center p-6 text-gray-500">Nenhum funcionário encontrado para os filtros selecionados.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modais */}
            {isModalOpen && <EmployeeModal user={user} employee={editingEmployee} employees={employees} apiClient={apiClient} onClose={() => setIsModalOpen(false)} setAlertMessage={setAlertMessage} reloadData={reloadData}/>}
            {isHistoryModalOpen && <EmployeeHistoryModal employee={employeeForHistory} obras={obras} onClose={() => setIsHistoryModalOpen(false)} />}
            {isFinesModalOpen && <EmployeeFinesModal employee={employeeForFines} fines={fines} onClose={() => setIsFinesModalOpen(false)} />}
            {isDeleteModalOpen &&
                <PasswordConfirmationModal
                     message="Confirme sua senha para EXCLUIR este funcionário. Esta ação não pode ser desfeita."
                     onConfirm={handleDelete}
                     onClose={() => setIsDeleteModalOpen(false)}
                     apiClient={apiClient} // Passa apiClient
                 />}
        </div>
    );
};

export default EmployeesPage;