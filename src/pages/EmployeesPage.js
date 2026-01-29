import React, { useState, useMemo } from 'react';
import {
    PlusCircle,
    ChevronsUpDown,
    UserX,
    UserCheck,
    Edit,
    Clock,
    Trash2,
    Users,
    Loader,
    RefreshCw // Ícone para o botão de sincronização
} from 'lucide-react';

// Imports dos Modais
// Certifique-se de que estes arquivos existem nestes caminhos
import EmployeeModal from '../components/modals/EmployeeModal';
import EmployeeHistoryModal from '../components/modals/EmployeeHistoryModal';
import EmployeeFinesModal from '../components/modals/EmployeeFinesModal';
import StatusChangeModal from '../components/modals/StatusChangeModal';

import apiClient from '../services/apiClient';

// ===================================================================================
// COMPONENTE LOCAL DE PROTEÇÃO
// (Substitui a importação para garantir funcionamento sem erros de caminho)
// ===================================================================================
const ProtectedComponent = ({ requiredPermission, user, children }) => {
    if (!user || !user.user_type) return null;
    
    const userRole = user.user_type.toLowerCase();
    const requiredRole = requiredPermission.toLowerCase();

    // Se requer admin e não é admin -> nulo
    if (requiredRole === 'admin' && userRole !== 'admin') {
        return null;
    }
    // Se requer editor e não é admin nem editor -> nulo
    if (requiredRole === 'editor' && !['admin', 'editor'].includes(userRole)) {
        return null;
    }
    
    return <>{children}</>;
};

const EmployeesPage = ({ 
    user, 
    employees = [], 
    fines = [], // Recebe multas via props (se disponível no App.js)
    apiClient, 
    setAlertMessage, 
    reloadData, 
    PasswordConfirmationModal 
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'nome', direction: 'ascending' });
    
    // Controle dos Modais
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isFinesModalOpen, setIsFinesModalOpen] = useState(false);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Estados de Seleção (Qual funcionário está sendo manipulado)
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [employeeForHistory, setEmployeeForHistory] = useState(null);
    const [employeeForFines, setEmployeeForFines] = useState(null);
    const [employeeForStatusChange, setEmployeeForStatusChange] = useState(null);
    const [employeeToDelete, setEmployeeToDelete] = useState(null);

    // Estado de Carregamento para a Sincronização
    const [isSyncing, setIsSyncing] = useState(false);

    // --- LÓGICA DE ORDENAÇÃO E FILTRO ---
    
    const sortedEmployees = useMemo(() => {
        let sortableItems = [...employees];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                // Tratamento seguro para nulos
                const valA = a[sortConfig.key] ? a[sortConfig.key].toString().toLowerCase() : '';
                const valB = b[sortConfig.key] ? b[sortConfig.key].toString().toLowerCase() : '';

                if (valA < valB) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (valA > valB) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [employees, sortConfig]);

    const filteredEmployees = sortedEmployees.filter(employee =>
        (employee.nome && employee.nome.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (employee.cpf && employee.cpf.includes(searchTerm)) ||
        (employee.funcao && employee.funcao.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // --- AÇÕES DO USUÁRIO ---

    const handleDelete = async () => {
        if (employeeToDelete) {
            try {
                await apiClient.deleteEmployee(employeeToDelete.id);
                setAlertMessage('Funcionário excluído com sucesso.');
                setIsDeleteModalOpen(false);
                setEmployeeToDelete(null);
                reloadData();
            } catch (error) {
                setAlertMessage('Erro ao excluir funcionário: ' + (error.message || 'Erro desconhecido'));
            }
        }
    };

    const handleConfirmStatusChange = async (date) => {
        if (employeeForStatusChange) {
            try {
                const currentStatus = employeeForStatusChange.status ? employeeForStatusChange.status.toLowerCase() : '';
                const newStatus = (currentStatus === 'ativo') ? 'inativo' : 'ativo';
                
                // Chama a rota específica de alteração de status
                await apiClient.put(`/employees/${employeeForStatusChange.id}/status`, {
                    status: newStatus,
                    date: date
                });

                setAlertMessage(`Status alterado para ${newStatus.toUpperCase()}.`);
                setIsStatusModalOpen(false);
                setEmployeeForStatusChange(null);
                reloadData();
            } catch (error) {
                setAlertMessage('Erro ao alterar status: ' + (error.message || 'Erro desconhecido'));
            }
        }
    };

    // --- NOVA FUNÇÃO: SINCRONIZAR (MIGRAR) USUÁRIOS ---
    const handleSyncUsers = async () => {
        if (!window.confirm("Esta ação criará um login para todos os funcionários ativos que ainda não possuem acesso ao sistema.\n\nRegras:\n- Login (Email): CPF@frotamak.com\n- Senha: CPF (apenas números)\n\nDeseja continuar?")) {
            return;
        }
        
        setIsSyncing(true);
        try {
            // Chama a rota criada no backend: POST /employees/sync-users
            const response = await apiClient.post('/employees/sync-users', {});
            setAlertMessage(`Sincronização concluída! ${response.details || response.message}`);
        } catch (error) {
            console.error("Erro na sincronização:", error);
            setAlertMessage("Erro ao sincronizar usuários: " + (error.message || "Erro desconhecido"));
        } finally {
            setIsSyncing(false);
        }
    };

    // --- RENDERIZAÇÃO ---

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 animate-fadeIn">
            {/* Header com Botões de Ação */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Users className="text-yellow-500" /> Gestão de Funcionários
                    </h1>
                    <p className="text-gray-500 text-sm">Gerencie cadastros, documentos e alocações.</p>
                </div>
                
                <div className="flex gap-2 flex-wrap justify-center md:justify-end">
                    
                    {/* Botão de Sincronização (Visível apenas para Admin) */}
                    <ProtectedComponent requiredPermission="admin" user={user}>
                        <button 
                            onClick={handleSyncUsers}
                            disabled={isSyncing}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg shadow hover:bg-blue-700 transition disabled:opacity-50"
                            title="Criar usuários de sistema para funcionários ativos automaticamente"
                        >
                            {isSyncing ? <Loader className="animate-spin" size={20}/> : <RefreshCw size={20} />}
                            <span className="hidden md:inline">Sincronizar Acessos</span>
                        </button>
                    </ProtectedComponent>

                    {/* Botão Novo Funcionário (Visível para Editor/Admin) */}
                    <ProtectedComponent requiredPermission="editor" user={user}>
                        <button 
                            onClick={() => { setEditingEmployee(null); setIsModalOpen(true); }}
                            className="flex items-center gap-2 px-6 py-3 bg-yellow-400 text-gray-900 font-bold rounded-lg shadow hover:bg-yellow-500 transition active:scale-95"
                        >
                            <PlusCircle size={20} /> Novo Funcionário
                        </button>
                    </ProtectedComponent>
                </div>
            </div>

            {/* Barra de Busca e Tabela */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b bg-gray-50">
                    <input 
                        type="text" 
                        placeholder="Buscar funcionário por nome, CPF ou função..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full max-w-md p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-100 text-gray-600 uppercase text-xs font-bold">
                            <tr>
                                <th className="p-4 cursor-pointer" onClick={() => requestSort('nome')}>
                                    Nome <ChevronsUpDown size={14} className="inline"/>
                                </th>
                                <th className="p-4">Função</th>
                                <th className="p-4">CPF / Contato</th>
                                <th className="p-4 text-center">Status</th>
                                <th className="p-4 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {filteredEmployees.map(emp => {
                                const statusLower = emp.status ? emp.status.toLowerCase() : '';
                                const isInactive = statusLower === 'inativo';
                                
                                return (
                                    <tr key={emp.id} className={`hover:bg-gray-50 ${isInactive ? 'opacity-60 bg-gray-50' : ''}`}>
                                        <td className="p-4 font-bold text-gray-800">{emp.nome}</td>
                                        <td className="p-4 text-gray-600">{emp.funcao}</td>
                                        <td className="p-4 text-gray-500">
                                            <div>{emp.cpf}</div>
                                            <div className="text-xs">{emp.telefone}</div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${isInactive ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                {isInactive ? 'INATIVO' : 'ATIVO'}
                                            </span>
                                        </td>
                                        <td className="p-4 flex justify-center gap-2">
                                            <button 
                                                onClick={() => { setEmployeeForHistory(emp); setIsHistoryModalOpen(true); }} 
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" 
                                                title="Histórico"
                                            >
                                                <Clock size={18}/>
                                            </button>
                                            
                                            {/* Botão de Multas (Opcional, descomente se usar) */}
                                            {/* <button onClick={() => { setEmployeeForFines(emp); setIsFinesModalOpen(true); }} className="p-1.5 text-orange-600 hover:bg-orange-50 rounded" title="Multas"><ShieldAlert size={18}/></button> */}

                                            <ProtectedComponent requiredPermission="editor" user={user}>
                                                <button 
                                                    onClick={() => { setEditingEmployee(emp); setIsModalOpen(true); }} 
                                                    className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded" 
                                                    title="Editar"
                                                >
                                                    <Edit size={18}/>
                                                </button>
                                                <button 
                                                    onClick={() => { setEmployeeForStatusChange(emp); setIsStatusModalOpen(true); }} 
                                                    className="p-1.5 text-gray-600 hover:bg-gray-100 rounded" 
                                                    title="Alterar Status"
                                                >
                                                    {isInactive ? <UserCheck size={18}/> : <UserX size={18}/>}
                                                </button>
                                            </ProtectedComponent>
                                            
                                            <ProtectedComponent requiredPermission="admin" user={user}>
                                                <button 
                                                    onClick={() => { setEmployeeToDelete(emp); setIsDeleteModalOpen(true); }} 
                                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded" 
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={18}/>
                                                </button>
                                            </ProtectedComponent>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredEmployees.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="text-center p-6 text-gray-500">Nenhum funcionário encontrado.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modais */}
            
            {isModalOpen && (
                <EmployeeModal 
                    user={user} 
                    employee={editingEmployee} 
                    employees={employees} 
                    apiClient={apiClient} 
                    onClose={() => setIsModalOpen(false)} 
                    setAlertMessage={setAlertMessage} 
                    reloadData={reloadData}
                />
            )}
            
            {isHistoryModalOpen && (
                <EmployeeHistoryModal 
                    employee={employeeForHistory} 
                    onClose={() => setIsHistoryModalOpen(false)} 
                    apiClient={apiClient} 
                />
            )}
            
            {isFinesModalOpen && (
                <EmployeeFinesModal 
                    employee={employeeForFines} 
                    fines={fines} 
                    onClose={() => setIsFinesModalOpen(false)} 
                />
            )}
            
            {isStatusModalOpen && employeeForStatusChange && (
                <StatusChangeModal 
                    employee={employeeForStatusChange} 
                    onClose={() => setIsStatusModalOpen(false)} 
                    onConfirm={handleConfirmStatusChange} 
                />
            )}

            {isDeleteModalOpen && PasswordConfirmationModal && (
                <PasswordConfirmationModal 
                    message="Confirme sua senha para EXCLUIR este funcionário e seu acesso ao sistema." 
                    onConfirm={handleDelete} 
                    onClose={() => setIsDeleteModalOpen(false)} 
                    apiClient={apiClient} 
                />
            )}
        </div>
    );
};

export default EmployeesPage;