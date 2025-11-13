import React, { useState, useMemo } from 'react';
// REMOVIDO: Imports do Firebase Firestore
import {
    PlusCircle,
    Edit,
    Trash2,
    X,
    Loader,
    ChevronsUpDown // *** ADICIONADO para classificação ***
} from 'lucide-react';
import apiClient from '../services/apiClient'; // Importa apiClient

// Importa componentes necessários
import ProtectedComponent from '../components/ProtectedComponent'; // Ajuste o caminho se necessário
import { useAuth } from '../contexts/AuthContext'; // Para obter dados do usuário

// ===================================================================================
// FUNÇÃO AUXILIAR PARA FORMATAR DATAS
// ===================================================================================
/**
 * Formata uma string de data (ex: '2025-11-12') para o formato 'dd/mm/aaaa'.
 * @param {string} dateString - A string de data do banco de dados (MySQL DATE type).
 * @returns {string} - A data formatada ou 'N/A'.
 */
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    // O BD envia 'YYYY-MM-DD'. new Date() interpreta isso como UTC.
    // Usamos timeZone: 'UTC' para formatar a data 'como está',
    // ignorando o fuso horário local do navegador (que causaria "Invalid Date" ou dia -1).
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Data Inválida';
    return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};


// ===================================================================================
// MODAL PARA EDITAR/ADICIONAR MULTA (Sem alterações, já estava OK)
// ===================================================================================
const FineModal = ({
    user,              // Usuário logado
    fine,              // Multa sendo editada (null se for nova)
    vehicles,          // Lista de veículos
    employees,         // Lista de funcionários
    onClose,           // Função para fechar o modal
    setAlertMessage,   // Função para exibir alertas
    apiClient,         // Cliente API
    reloadData         // Função para recarregar dados
}) => {
    // Estado inicial do formulário (usa new Date() para datas)
    const [formData, setFormData] = useState({
        vehicleId: fine?.vehicleId || '',
        employeeId: fine?.employeeId || '',
        // Formata data da API ou usa data atual
        dataInfração: fine?.dataInfração ? new Date(fine.dataInfração).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        local: fine?.local || '',
        codigoInfração: fine?.codigoInfração || '',
        descricao: fine?.descricao || '',
        valor: fine?.valor?.toString() || '', // Garante string
        // Formata data da API ou usa vazio
        dataVencimento: fine?.dataVencimento ? new Date(fine.dataVencimento).toISOString().split('T')[0] : '',
        status: fine?.status || 'Pendente', // Padrão
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const fineStatusOptions = ['Pendente', 'Paga', 'Em Recurso', 'Cancelada'];
    const isEditing = !!fine;

    // Handler para mudanças no formulário (mantido)
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Handler para submissão (USA API)
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        // Validação básica
        if (!formData.vehicleId || !formData.employeeId || !formData.descricao || !formData.valor || !formData.dataInfração) {
            setError('Veículo, condutor, data da infração, descrição e valor são obrigatórios.');
            return;
        }
        setIsSaving(true);

        const vehicle = vehicles?.find(v => v.id === formData.vehicleId);
        const employee = employees?.find(e => e.id === formData.employeeId);

        if (!vehicle || !employee) {
             setError('Veículo ou funcionário selecionado inválido.');
             setIsSaving(false);
             return;
        }

        // Prepara dados para a API (envia datas como string YYYY-MM-DD)
        const dataToSave = {
            ...formData,
            valor: parseFloat(formData.valor.replace(',', '.')) || 0, // Aceita vírgula
            dataInfração: formData.dataInfração, // Já está YYYY-MM-DD
            dataVencimento: formData.dataVencimento || null, // Envia null se vazio
            // O backend deve cuidar de popular vehicleInfo/employeeInfo
        };

        try {
            if (isEditing) {
                // Chama API para ATUALIZAR
                await apiClient.updateFine(fine.id, dataToSave);
                setAlertMessage('Multa atualizada com sucesso!');
            } else {
                // Chama API para CRIAR
                await apiClient.createFine(dataToSave);
                setAlertMessage('Multa registrada com sucesso!');
            }
            reloadData(); // Recarrega os dados na página principal
            onClose(); // Fecha o modal
        } catch (err) {
            console.error("Erro ao salvar multa via API:", err);
            setError(err.message || "Ocorreu um erro ao salvar a multa.");
        } finally {
            setIsSaving(false);
        }
    };

    // Filtra funcionários ativos
     const activeEmployees = useMemo(() => (employees || []).filter(e => e.status === 'ativo').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [employees]);
     // Ordena veículos
     const sortedVehicles = useMemo(() => (vehicles || []).sort((a,b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);


    // Renderização do Modal
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[95vh] flex flex-col my-auto">
                {/* Cabeçalho */}
                <div className="p-4 sm:p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <h2 className="text-xl sm:text-2xl font-bold">{isEditing ? 'Editar Multa' : 'Registrar Nova Multa'}</h2>
                    <button onClick={onClose} className="p-2 rounded-full text-gray-500 hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                </div>
                {/* Formulário */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                    <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        {/* Select Veículo */}
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Veículo Infrator*</label>
                            <select name="vehicleId" value={formData.vehicleId} onChange={handleChange} className="w-full p-2 border rounded bg-white" required>
                                <option value="">Selecione...</option>
                                {sortedVehicles.map(v =>
                                    <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa}</option>
                                )}
                            </select>
                        </div>
                        {/* Select Condutor */}
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Condutor*</label>
                            <select name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full p-2 border rounded bg-white" required>
                                <option value="">Selecione...</option>
                                {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                            </select>
                        </div>
                        {/* Data Infração */}
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Data da Infração*</label>
                            <input name="dataInfração" type="date" value={formData.dataInfração} onChange={handleChange} className="w-full p-2 border rounded bg-white" required />
                        </div>
                        {/* Data Vencimento */}
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Data de Vencimento</label>
                            <input name="dataVencimento" type="date" value={formData.dataVencimento} onChange={handleChange} className="w-full p-2 border rounded bg-white" />
                        </div>
                        {/* Local */}
                        <div className="md:col-span-2">
                            <label className="block font-medium text-gray-700 mb-1">Local da Infração</label>
                            <input name="local" value={formData.local} onChange={handleChange} placeholder="Ex: BR-386, Km 345, Lajeado-RS" className="w-full p-2 border rounded bg-white" />
                        </div>
                        {/* Descrição */}
                        <div className="md:col-span-2">
                            <label className="block font-medium text-gray-700 mb-1">Descrição da Infração*</label>
                            <input name="descricao" value={formData.descricao} onChange={handleChange} placeholder="Ex: Excesso de velocidade" className="w-full p-2 border rounded bg-white" required />
                        </div>
                        {/* Código */}
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Código da Infração</label>
                            <input name="codigoInfração" value={formData.codigoInfração} onChange={handleChange} placeholder="Ex: 7455-0" className="w-full p-2 border rounded bg-white" />
                        </div>
                        {/* Valor */}
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Valor (R$)*</label>
                            <input name="valor" type="text" inputMode="decimal" value={formData.valor} onChange={handleChange} placeholder="Ex: 195,23" className="w-full p-2 border rounded bg-white" required />
                        </div>
                        {/* Status */}
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Status*</label>
                            <select name="status" value={formData.status} onChange={handleChange} className="w-full p-2 border rounded bg-white" required>
                                {fineStatusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                        {/* Erro */}
                        {error && <p className="text-sm text-red-600 md:col-span-2 bg-red-50 p-3 rounded border border-red-200">{error}</p>}
                    </div>
                    {/* Rodapé */}
                    <div className="p-4 bg-gray-50 border-t flex flex-col sm:flex-row justify-end gap-2 sticky bottom-0 z-10">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium w-full sm:w-auto" disabled={isSaving}>Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 text-sm w-full sm:w-auto">
                            {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar Multa'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// ===================================================================================
// PÁGINA PRINCIPAL DE MULTAS (Usa props e apiClient)
// ===================================================================================
const FinesPage = ({
    user, fines = [], vehicles = [], employees = [], // Dados via props
    PasswordConfirmationModal, apiClient, setAlertMessage, reloadData // API e funções via props
}) => {
    // Estados da UI
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [editingFine, setEditingFine] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null); // Guarda o ID
    const [filters, setFilters] = useState({ search: '', status: 'Pendente' }); // Filtro padrão 'Pendente'
    
    // *** ADICIONADO: Estado de Classificação ***
    const [sortConfig, setSortConfig] = useState({ key: 'dataInfração', direction: 'descending' });

    // *** ADICIONADO: Função de Classificação ***
    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // Handler para filtros
    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    // Abrir modais
    const openModal = (fine = null) => {
        setEditingFine(fine);
        setIsModalOpen(true);
    };
    const openDeleteModal = (id) => {
        setItemToDelete(id);
        setIsDeleteModalOpen(true);
    };

    // Handler para DELETAR (Usa API)
    const handleDelete = async () => {
        if (!itemToDelete) return;
        try {
            await apiClient.deleteFine(itemToDelete);
            setAlertMessage('Multa excluída com sucesso.');
            reloadData(); // Recarrega dados
        } catch (error) {
            console.error("Erro ao excluir multa via API:", error);
            setAlertMessage(error.message || 'Falha ao excluir multa.');
        } finally {
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        }
    };

    // *** ATUALIZADO: Filtra E Classifica multas ***
    const processedFines = useMemo(() => {
        if (!Array.isArray(fines)) return [];
        
        // 1. Filtra
        let filtered = fines.filter(fine => {
            const searchLower = filters.search.toLowerCase();
            // Garante que campos existem
            const searchMatch = !searchLower ||
                (fine.vehicleInfo?.placa || '').toLowerCase().includes(searchLower) ||
                (fine.vehicleInfo?.registroInterno || '').toLowerCase().includes(searchLower) ||
                (fine.employeeInfo?.nome || '').toLowerCase().includes(searchLower) ||
                (fine.descricao || '').toLowerCase().includes(searchLower);
            const statusMatch = filters.status === 'todos' || fine.status === filters.status;
            return searchMatch && statusMatch;
        });
        
        // 2. Classifica
        if (sortConfig.key) {
            filtered.sort((a, b) => {
                let valA, valB;
                
                // Define as chaves de classificação
                switch (sortConfig.key) {
                    case 'vehicle':
                        valA = a.vehicleInfo?.registroInterno || '';
                        valB = b.vehicleInfo?.registroInterno || '';
                        break;
                    case 'employee':
                         valA = a.employeeInfo?.nome || '';
                         valB = b.employeeInfo?.nome || '';
                        break;
                    case 'valor':
                        valA = a.valor || 0;
                        valB = b.valor || 0;
                        break;
                    case 'dataInfração':
                         valA = a.dataInfração || '';
                         valB = b.dataInfração || '';
                         break;
                    default:
                        valA = a[sortConfig.key] || '';
                        valB = b[sortConfig.key] || '';
                }
                
                let comparison = 0;
                if (typeof valA === 'number' && typeof valB === 'number') {
                    comparison = valA - valB;
                } else {
                    comparison = String(valA).localeCompare(String(valB), 'pt-BR', { sensitivity: 'base' });
                }
                
                return sortConfig.direction === 'ascending' ? comparison : -comparison;
            });
        }

        return filtered;
    }, [fines, filters, sortConfig]); // Adiciona sortConfig como dependência

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

    // Renderização Principal
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-6 font-sans">
            {/* Cabeçalho */}
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Gerenciamento de Multas</h1>
                <ProtectedComponent requiredPermission="editor">
                    <button onClick={() => openModal()} className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg shadow hover:bg-yellow-500 transition text-sm">
                        <PlusCircle size={18} />Registrar Multa
                    </button>
                </ProtectedComponent>
            </div>

            {/* Filtros */}
            <div className="mb-6 p-4 bg-white rounded-lg shadow-md border border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <input
                    type="text"
                    name="search"
                    placeholder="Buscar por placa, condutor, descrição..."
                    value={filters.search}
                    onChange={handleFilterChange}
                    className="w-full px-4 py-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400"
                 />
                <select
                    name="status"
                    value={filters.status}
                    onChange={handleFilterChange}
                    className="w-full px-4 py-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400"
                >
                    <option value="todos">Todos os Status</option>
                    <option value="Pendente">Pendente</option>
                    <option value="Paga">Paga</option>
                    <option value="Em Recurso">Em Recurso</option>
                    <option value="Cancelada">Cancelada</option>
                </select>
            </div>

            {/* Tabela */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-600 min-w-[700px]">
                         {/* *** CABEÇALHO ATUALIZADO *** */}
                         <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                            <tr>
                                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('vehicle')}>
                                    Veículo
                                    <ChevronsUpDown size={12} className="inline ml-1 opacity-50"/>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('employee')}>
                                    Condutor
                                    <ChevronsUpDown size={12} className="inline ml-1 opacity-50"/>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('dataInfração')}>
                                    Infração
                                    <ChevronsUpDown size={12} className="inline ml-1 opacity-50"/>
                                </th>
                                <th className="px-6 py-3 text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort('valor')}>
                                    Valor
                                    <ChevronsUpDown size={12} className="inline ml-1 opacity-50"/>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('status')}>
                                    Status
                                    <ChevronsUpDown size={12} className="inline ml-1 opacity-50"/>
                                </th>
                                <th className="px-6 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* *** CORPO DA TABELA ATUALIZADO *** */}
                            {processedFines.map(fine => (
                                <tr key={fine.id} className="bg-white border-b hover:bg-gray-50 transition-colors duration-150">
                                    {/* Veículo */}
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">
                                            {fine.vehicleInfo?.registroInterno || 'N/A'}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {fine.vehicleInfo?.placa || 'N/A'}
                                        </div>
                                    </td>
                                    {/* Condutor */}
                                    {/* *** MELHORIA: Adicionado 'max-w-xs' para forçar a quebra (truncate) *** */}
                                    <td className="px-4 py-4 max-w-8">
                                        <div className="font-medium text-gray-900 truncate" title={fine.employeeInfo?.nome}>
                                            {fine.employeeInfo?.nome || 'N/A'}
                                        </div>
                                    </td>
                                    {/* Infração */}
                                    {/* *** MELHORIA: Mantido 'max-w-sm' para forçar a quebra (truncate) *** */}
                                    <td className="px-4 py-4 max-w-8">
                                        <div className="font-medium text-gray-800 truncate" title={fine.descricao}>{fine.descricao || 'N/A'}</div>
                                        <div className="text-xs text-gray-500">
                                            {/* *** CORREÇÃO DA DATA APLICADA *** */}
                                            Data: {formatDate(fine.dataInfração)}
                                        </div>
                                         {fine.local && <div className="text-xs text-gray-500 truncate" title={fine.local}>Local: {fine.local}</div>}
                                    </td>
                                    {/* Valor */}
                                    {/* *** MELHORIA: Adicionado 'whitespace-nowrap' *** */}
                                    <td className="px-5 py-4 text-right font-bold text-red-600 whitespace-nowrap">
                                        R$ {(parseFloat(fine.valor) || 0).toFixed(2)}
                                    </td>
                                     {/* Status */}
                                    {/* *** MELHORIA: Adicionado 'whitespace-nowrap' *** */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${getStatusBadge(fine.status)}`}>
                                            {fine.status || 'N/A'}
                                        </span>
                                         {fine.status === 'Pendente' && fine.dataVencimento && (
                                             <div className="text-[11px] text-gray-500 mt-1">
                                                 {/* *** CORREÇÃO DA DATA APLICADA *** */}
                                                 Vence: {formatDate(fine.dataVencimento)}
                                             </div>
                                         )}
                                    </td>
                                     {/* Ações */}
                                    {/* *** MELHORIA: Adicionado 'whitespace-nowrap' *** */}
                                    <td className="px-6 py-4 text-center whitespace-nowrap">
                                        <div className="flex justify-center items-center gap-1">
                                            <ProtectedComponent requiredPermission="editor">
                                                <button onClick={() => openModal(fine)} title="Editar" className="p-1 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-full transition"><Edit size={16} /></button>
                                            </ProtectedComponent>
                                            <ProtectedComponent requiredPermission="admin">
                                                <button onClick={() => openDeleteModal(fine.id)} title="Excluir" className="p-1 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-full transition"><Trash2 size={16} /></button>
                                            </ProtectedComponent>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {/* Vazio */}
                            {processedFines.length === 0 && (
                                <tr><td colSpan="6" className="text-center p-6 text-gray-500 italic">Nenhuma multa encontrada.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modais */}
            {isModalOpen && <FineModal user={user} fine={editingFine} vehicles={vehicles} employees={employees} onClose={() => setIsModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} />}
            {isDeleteModalOpen && itemToDelete &&
                <PasswordConfirmationModal
                    message="Confirme sua senha para EXCLUIR esta multa."
                    onConfirm={handleDelete}
                    onClose={() => setIsDeleteModalOpen(false)}
                    apiClient={apiClient} // Passa apiClient
                />}
        </div>
    );
};

export default FinesPage;