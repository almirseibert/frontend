import React, { useState, useMemo } from 'react';
import {
    PlusCircle,
    ChevronsUpDown,
    UserX,
    UserCheck,
    Edit,
    Clock,
    ShieldAlert, // Ícone de Multas restaurado
    Trash2,
    Users,
    Loader,
    RefreshCw,
    Search,
    Filter,
    MapPin,
    Phone,
    FileText
} from 'lucide-react';

// Imports dos Modais
import EmployeeModal from '../components/modals/EmployeeModal';
import EmployeeHistoryModal from '../components/modals/EmployeeHistoryModal';
import EmployeeFinesModal from '../components/modals/EmployeeFinesModal';
import StatusChangeModal from '../components/modals/StatusChangeModal';

import apiClient from '../services/apiClient';

// ===================================================================================
// COMPONENTE LOCAL DE PROTEÇÃO
// ===================================================================================
const ProtectedComponent = ({ requiredPermission, user, children }) => {
    if (!user || !user.user_type) return null;
    
    const userRole = user.user_type.toLowerCase();
    const requiredRole = requiredPermission.toLowerCase();

    if (requiredRole === 'admin' && userRole !== 'admin') {
        return null;
    }
    if (requiredRole === 'editor' && !['admin', 'editor'].includes(userRole)) {
        return null;
    }
    
    return <>{children}</>;
};

const EmployeesPage = ({ 
    user, 
    employees = [], 
    vehicles = [], // Recebe veículos para identificar alocação atual
    fines = [], 
    apiClient, 
    setAlertMessage, 
    reloadData, 
    PasswordConfirmationModal 
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('ativos'); // 'ativos' | 'inativos'
    const [sortConfig, setSortConfig] = useState({ key: 'nome', direction: 'ascending' });
    
    // Controle dos Modais
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isFinesModalOpen, setIsFinesModalOpen] = useState(false);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Estados de Seleção
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [employeeForHistory, setEmployeeForHistory] = useState(null);
    const [employeeForFines, setEmployeeForFines] = useState(null);
    const [employeeForStatusChange, setEmployeeForStatusChange] = useState(null);
    const [employeeToDelete, setEmployeeToDelete] = useState(null);

    // Estado de Sincronização
    const [isSyncing, setIsSyncing] = useState(false);

    // --- LÓGICA DE DADOS ---

    // 1. Filtragem Inicial (Busca + Abas)
    const processedEmployees = useMemo(() => {
        return employees.filter(emp => {
            // Filtro de Texto (Nome, Função, Cidade/Endereço, Registro/CPF, Telefone)
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = 
                (emp.nome && emp.nome.toLowerCase().includes(searchLower)) ||
                (emp.funcao && emp.funcao.toLowerCase().includes(searchLower)) ||
                (emp.endereco && emp.endereco.toLowerCase().includes(searchLower)) ||
                (emp.cpf && emp.cpf.includes(searchLower)) ||
                (emp.telefone && emp.telefone.includes(searchLower));

            if (!matchesSearch) return false;

            // Filtro de Aba (Status)
            const statusLower = emp.status ? emp.status.toLowerCase() : 'ativo';
            const isInactive = statusLower === 'inativo' || statusLower === 'desligado';
            
            if (activeTab === 'ativos') return !isInactive;
            if (activeTab === 'inativos') return isInactive;
            
            return true;
        });
    }, [employees, searchTerm, activeTab]);

    // 2. Ordenação
    const sortedEmployees = useMemo(() => {
        let sortableItems = [...processedEmployees];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                const valA = a[sortConfig.key] ? a[sortConfig.key].toString().toLowerCase() : '';
                const valB = b[sortConfig.key] ? b[sortConfig.key].toString().toLowerCase() : '';

                if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [processedEmployees, sortConfig]);

    // Contagens para as abas
    const counts = useMemo(() => {
        const inativos = employees.filter(e => {
            const s = e.status ? e.status.toLowerCase() : '';
            return s === 'inativo' || s === 'desligado';
        }).length;
        return {
            ativos: employees.length - inativos,
            inativos: inativos
        };
    }, [employees]);

    // Helper: Encontrar Veículo Atual (Alocado)
    const getCurrentVehicle = (employeeId) => {
        // Tenta encontrar um veículo onde este funcionário esteja marcado como motorista/operador atual
        // Ajuste conforme a estrutura do seu objeto 'vehicle' (ex: driverId, employeeId, operadorId)
        const vehicle = vehicles.find(v => 
            v.driverId === employeeId || 
            v.operatorId === employeeId || 
            (v.currentDriver && v.currentDriver.id === employeeId)
        );
        return vehicle ? vehicle.registroInterno : null;
    };

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // --- AÇÕES ---

    const handleDelete = async () => {
        if (employeeToDelete) {
            try {
                await apiClient.deleteEmployee(employeeToDelete.id);
                setAlertMessage('Funcionário excluído com sucesso.');
                setIsDeleteModalOpen(false);
                setEmployeeToDelete(null);
                reloadData();
            } catch (error) {
                setAlertMessage('Erro ao excluir: ' + (error.message || 'Erro desconhecido'));
            }
        }
    };

    const handleConfirmStatusChange = async (date) => {
        if (employeeForStatusChange) {
            try {
                const currentStatus = employeeForStatusChange.status ? employeeForStatusChange.status.toLowerCase() : '';
                const newStatus = (currentStatus === 'ativo') ? 'inativo' : 'ativo';
                
                await apiClient.put(`/employees/${employeeForStatusChange.id}/status`, {
                    status: newStatus,
                    date: date
                });

                setAlertMessage(`Status alterado para ${newStatus.toUpperCase()}.`);
                setIsStatusModalOpen(false);
                setEmployeeForStatusChange(null);
                reloadData();
            } catch (error) {
                setAlertMessage('Erro ao alterar status: ' + error.message);
            }
        }
    };

    const handleSyncUsers = async () => {
        if (!window.confirm("Esta ação criará logins para todos os funcionários ativos sem acesso.\nLogin: CPF@frotamak.com | Senha: CPF\n\nContinuar?")) {
            return;
        }
        setIsSyncing(true);
        try {
            const response = await apiClient.post('/employees/sync-users', {});
            setAlertMessage(`Sincronização concluída! ${response.details || response.message}`);
        } catch (error) {
            setAlertMessage("Erro ao sincronizar: " + (error.message || "Erro desconhecido"));
        } finally {
            setIsSyncing(false);
        }
    };

    // --- RENDERIZAÇÃO ---

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 animate-fadeIn space-y-6">
            
            {/* Cabeçalho */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Users className="text-yellow-500" /> Gestão de Funcionários
                    </h1>
                    <p className="text-gray-500 text-sm">Gerencie cadastros, alocações e documentos.</p>
                </div>
                
                <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                    <ProtectedComponent requiredPermission="admin" user={user}>
                        <button 
                            onClick={handleSyncUsers}
                            disabled={isSyncing}
                            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg shadow hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                        >
                            {isSyncing ? <Loader className="animate-spin" size={16}/> : <RefreshCw size={16} />}
                            Sincronizar Acessos
                        </button>
                    </ProtectedComponent>

                    <ProtectedComponent requiredPermission="editor" user={user}>
                        <button 
                            onClick={() => { setEditingEmployee(null); setIsModalOpen(true); }}
                            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-2 bg-yellow-400 text-gray-900 font-bold rounded-lg shadow hover:bg-yellow-500 transition active:scale-95 text-sm"
                        >
                            <PlusCircle size={18} /> Novo Funcionário
                        </button>
                    </ProtectedComponent>
                </div>
            </div>

            {/* Controles: Abas e Busca */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="flex flex-col md:flex-row border-b border-gray-100">
                    {/* Abas */}
                    <div className="flex w-full md:w-auto">
                        <button
                            onClick={() => setActiveTab('ativos')}
                            className={`flex-1 md:flex-none px-6 py-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                                activeTab === 'ativos' 
                                ? 'border-yellow-400 text-gray-900 bg-yellow-50' 
                                : 'border-transparent text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            Ativos
                            <span className="bg-gray-200 text-gray-600 text-xs py-0.5 px-2 rounded-full">{counts.ativos}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('inativos')}
                            className={`flex-1 md:flex-none px-6 py-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                                activeTab === 'inativos' 
                                ? 'border-red-400 text-red-900 bg-red-50' 
                                : 'border-transparent text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            Inativos
                            <span className="bg-gray-200 text-gray-600 text-xs py-0.5 px-2 rounded-full">{counts.inativos}</span>
                        </button>
                    </div>

                    {/* Barra de Busca */}
                    <div className="flex-1 p-3 md:border-l border-gray-100 flex items-center">
                        <div className="relative w-full max-w-md mx-auto md:mr-auto md:ml-4">
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                            <input 
                                type="text" 
                                placeholder="Buscar por nome, função, cidade ou registro..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none text-sm transition-all"
                            />
                        </div>
                    </div>
                </div>

                {/* Tabela */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold tracking-wider">
                            <tr>
                                <th className="p-4 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('nome')}>
                                    Nome / Registro <ChevronsUpDown size={14} className="inline ml-1 text-gray-400"/>
                                </th>
                                <th className="p-4 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('funcao')}>
                                    Função <ChevronsUpDown size={14} className="inline ml-1 text-gray-400"/>
                                </th>
                                <th className="p-4">Cidade / Endereço</th>
                                <th className="p-4">Contato</th>
                                <th className="p-4 text-center">Status / Alocação</th>
                                <th className="p-4 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {sortedEmployees.map(emp => {
                                const currentVehicle = getCurrentVehicle(emp.id);
                                const isInactive = emp.status && (emp.status.toLowerCase() === 'inativo' || emp.status.toLowerCase() === 'desligado');
                                
                                return (
                                    <tr key={emp.id} className={`hover:bg-gray-50 transition-colors ${isInactive ? 'bg-gray-50/50' : ''}`}>
                                        
                                        {/* Coluna Nome e Registro */}
                                        <td className="p-4 align-top">
                                            <div className="font-bold text-gray-800 text-base">{emp.nome}</div>
                                            <div className="text-xs text-gray-500 font-mono mt-0.5 flex items-center gap-1" title="Registro / CPF">
                                                <FileText size={10} />
                                                {emp.cpf || 'S/ Registro'}
                                            </div>
                                        </td>

                                        {/* Coluna Função */}
                                        <td className="p-4 align-top text-gray-700 font-medium">
                                            {emp.funcao || '-'}
                                        </td>

                                        {/* Coluna Cidade (Extraída do Endereço) */}
                                        <td className="p-4 align-top text-gray-600">
                                            <div className="flex items-start gap-1.5">
                                                <MapPin size={14} className="mt-0.5 text-gray-400 shrink-0"/>
                                                <span className="line-clamp-2" title={emp.endereco}>
                                                    {emp.endereco || '-'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Coluna Contato */}
                                        <td className="p-4 align-top text-gray-600">
                                            {emp.telefone ? (
                                                <div className="flex items-center gap-1.5">
                                                    <Phone size={14} className="text-gray-400"/>
                                                    {emp.telefone}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 italic text-xs">Sem contato</span>
                                            )}
                                        </td>

                                        {/* Coluna Status e Alocação */}
                                        <td className="p-4 align-top text-center">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                                                isInactive 
                                                ? 'bg-red-100 text-red-700' 
                                                : 'bg-green-100 text-green-700'
                                            }`}>
                                                {isInactive ? 'Inativo' : 'Ativo'}
                                            </span>
                                            
                                            {/* Exibe Veículo Atual se Ativo e Alocado */}
                                            {!isInactive && currentVehicle && (
                                                <div className="mt-2 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 inline-block">
                                                    RE: {currentVehicle}
                                                </div>
                                            )}
                                        </td>

                                        {/* Coluna Ações */}
                                        <td className="p-4 align-top">
                                            <div className="flex justify-center gap-1">
                                                <button 
                                                    onClick={() => { setEmployeeForHistory(emp); setIsHistoryModalOpen(true); }} 
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                                                    title="Histórico Completo"
                                                >
                                                    <Clock size={18}/>
                                                </button>
                                                
                                                <button 
                                                    onClick={() => { setEmployeeForFines(emp); setIsFinesModalOpen(true); }} 
                                                    className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" 
                                                    title="Visualizar Multas"
                                                >
                                                    <ShieldAlert size={18}/>
                                                </button>

                                                <ProtectedComponent requiredPermission="editor" user={user}>
                                                    <button 
                                                        onClick={() => { setEditingEmployee(emp); setIsModalOpen(true); }} 
                                                        className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors" 
                                                        title="Editar Cadastro"
                                                    >
                                                        <Edit size={18}/>
                                                    </button>
                                                    
                                                    <button 
                                                        onClick={() => { setEmployeeForStatusChange(emp); setIsStatusModalOpen(true); }} 
                                                        className={`p-2 rounded-lg transition-colors ${
                                                            isInactive 
                                                            ? 'text-green-600 hover:bg-green-50' 
                                                            : 'text-gray-500 hover:bg-gray-100'
                                                        }`}
                                                        title={isInactive ? "Reativar Funcionário" : "Inativar Funcionário"}
                                                    >
                                                        {isInactive ? <UserCheck size={18}/> : <UserX size={18}/>}
                                                    </button>
                                                </ProtectedComponent>
                                                
                                                <ProtectedComponent requiredPermission="admin" user={user}>
                                                    <button 
                                                        onClick={() => { setEmployeeToDelete(emp); setIsDeleteModalOpen(true); }} 
                                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" 
                                                        title="Excluir Definitivamente"
                                                    >
                                                        <Trash2 size={18}/>
                                                    </button>
                                                </ProtectedComponent>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {sortedEmployees.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="text-center p-8 text-gray-400 italic">
                                        Nenhum funcionário encontrado com os filtros atuais.
                                    </td>
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
                    message="ATENÇÃO: Confirme sua senha para EXCLUIR este funcionário permanentemente." 
                    onConfirm={handleDelete} 
                    onClose={() => setIsDeleteModalOpen(false)} 
                    apiClient={apiClient} 
                />
            )}
        </div>
    );
};

export default EmployeesPage;