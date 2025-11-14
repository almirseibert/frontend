import React, { useState, useEffect, useMemo } from 'react';
import apiClient from '../services/apiClient'; // Importa apiClient
import {
    HardHat,
    Users,
    Wrench,
    ShieldAlert,
    Edit,
    Clock,
    Trash2,
    PlusCircle,
    Upload,
    Download,
    ChevronsUpDown,
    X,
    TrafficCone,
    CheckCircle,
    Info,
    Loader, 
    ImageOff, 
    AlertTriangle,
    Camera // <-- Ícone para upload de foto
} from 'lucide-react';

import ProtectedComponent from '../components/ProtectedComponent'; 

// --- Função Auxiliar: Novas Regras de Leitura (14/11/2025) ---
/**
 * Retorna a informação de leitura principal com base nas novas regras de negócio.
 * @param {object} vehicle - O objeto do veículo.
 * @param {object} vehicleGroups - O mapeamento de grupos (ex: { 'Máquinas Pesadas': ['TRATOR'] }).
 * @returns {object} { label, value, type, unit }
 */
const getPrincipalReadingInfo = (vehicle, vehicleGroups = {}) => {
    const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
    const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(vehicle?.tipo));
    
    // Regra Específica: "Caminhões Prancha" são parte do grupo "Caminhões de Trecho" e usam Odômetro
    const isPrancha = vehicle?.tipo === 'Caminhões Prancha';

    if (vehicleGroup === 'Máquinas Pesadas') {
        return {
            label: 'Horímetro',
            // Regra: Digital tem preferência sobre Analógico, que tem preferência sobre o campo 'horimetro' legado
            value: vehicle?.horimetroDigital ?? vehicle?.horimetroAnalogico ?? vehicle?.horimetro ?? 0,
            type: 'horimetro',
            unit: 'Hr'
        };
    } else if (vehicleGroup === 'Caminhões' && !isPrancha) {
        // Regra: Caminhões (exceto Prancha) usam APENAS Horímetro
        return {
            label: 'Horímetro',
            value: vehicle?.horimetro ?? 0,
            type: 'horimetro',
            unit: 'Hr'
        };
    } else {
        // Regra: Veículos Leves, Caminhões Prancha e outros usam Odômetro
        return {
            label: 'Odômetro',
            value: vehicle?.odometro ?? 0,
            type: 'odometro',
            unit: 'Km'
        };
    }
};


// --- PÁGINA DE VEÍCULOS ---
const VehiclePage = ({ user, vehicles = [], obras = [], revisions = [], employees = [], fines = [], navigate, setAlertMessage, initialFilter, PasswordConfirmationModal, ConfirmationModal, vehicleGroups = {}, operationalSubGroups = [], apiClient, reloadData }) => {
    
    const vehicleTypes = useMemo(() => [...new Set(vehicles.map(v => v.tipo).filter(Boolean))].sort(), [vehicles]);

    // Estados dos Modais
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isObraAllocationModalOpen, setIsObraAllocationModalOpen] = useState(false);
    const [isOperationalModalOpen, setIsOperationalModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isFinesModalOpen, setIsFinesModalOpen] = useState(false);
    const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false); 

    // Estados para dados dos Modais
    const [itemToDelete, setItemToDelete] = useState(null);
    const [editingVehicle, setEditingVehicle] = useState(null);
    const [vehicleForObraAllocation, setVehicleForObraAllocation] = useState(null);
    const [vehicleForOperational, setVehicleForOperational] = useState(null);
    const [vehicleForHistory, setVehicleForHistory] = useState(null);
    const [vehicleForDetail, setVehicleForDetail] = useState(null);
    const [vehicleForFines, setVehicleForFines] = useState(null);
    const [vehicleForMaintenance, setVehicleForMaintenance] = useState(null);

    // Estados de Filtro e Ordenação
    const [filters, setFilters] = useState({ type: 'todos', status: 'todos', search: '', group: 'todos' });
    const [sortConfig, setSortConfig] = useState({ key: 'registroInterno', direction: 'ascending' }); 

    useEffect(() => { if (initialFilter) { setFilters(prev => ({ ...prev, ...initialFilter })); } }, [initialFilter]);
    const handleFilterChange = (e) => { const { name, value } = e.target; setFilters(prev => ({ ...prev, [name]: value })); };

    // Veículos processados (Usa a nova função de leitura)
    const processedVehicles = useMemo(() => {
        return (vehicles || []).map(v => {
            let currentStatus = v.status;
            if (!currentStatus) { 
                if (v.obraAtualId) currentStatus = 'Em Obra';
                else if (v.operationalAssignment) currentStatus = 'Em Operação';
                else if (v.maintenanceLocation) currentStatus = 'Em Manutenção'; 
                else currentStatus = 'Disponível';
            }
             const obra = v.obraAtualId ? obras.find(o => o.id === v.obraAtualId) : null;
             
             // --- ATUALIZAÇÃO O/H ---
             // Usa a nova função helper
             const readingInfo = getPrincipalReadingInfo(v, vehicleGroups);
             const vehicleReading = `${parseFloat(readingInfo.value).toFixed(1)} ${readingInfo.unit}`;
             // --- FIM ATUALIZAÇÃO ---

            return { ...v, status: currentStatus, obra, vehicleReading };
        }).filter(Boolean);
    }, [vehicles, obras, vehicleGroups]);

    // Ordena os veículos processados (sem mudança)
    const sortedVehicles = useMemo(() => {
        let sortableItems = [...processedVehicles];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                const valA = a[sortConfig.key] ?? ''; 
                const valB = b[sortConfig.key] ?? '';
                if (sortConfig.key === 'vehicleReading' || sortConfig.key === 'odometro' || sortConfig.key === 'horimetro') {
                     const numA = parseFloat(valA.toString().split(' ')[0]) || 0; 
                     const numB = parseFloat(valB.toString().split(' ')[0]) || 0;
                     const comparison = numA - numB;
                     return sortConfig.direction === 'ascending' ? comparison : -comparison;
                }
                const comparison = String(valA).toLowerCase().localeCompare(String(valB).toLowerCase());
                return sortConfig.direction === 'ascending' ? comparison : -comparison;
            });
        }
        return sortableItems;
    }, [processedVehicles, sortConfig]);


    // Função para requisitar ordenação (mantida)
    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // Calcula status da revisão (Usa a nova função de leitura)
    const getRevisionStatus = (vehicle) => {
        const revision = (revisions || []).find(r => r.vehicleId === vehicle.id); 
        if (!revision) return { status: 'ok', text: '' }; 

        const now = new Date();
        const proximaData = revision.proximaRevisaoData ? new Date(revision.proximaRevisaoData) : null;

        // --- ATUALIZAÇÃO O/H ---
        const { value: currentReading, type: readingType } = getPrincipalReadingInfo(vehicle, vehicleGroups);
        const proximaLeitura = (readingType === 'horimetro') 
            ? (revision.proximaRevisaoHorimetro || 0) 
            : (revision.proximaRevisaoOdometro || 0);
        // --- FIM ATUALIZAÇÃO ---
        
        const avisoKmHr = revision.avisoAntecedenciaKmHr || 0;
        const avisoDias = revision.avisoAntecedenciaDias || 0;

        // Verifica vencidos primeiro
        if (proximaLeitura > 0 && currentReading >= proximaLeitura) return { status: 'danger', text: 'Leitura Vencida' };
        if (proximaData && now >= proximaData) return { status: 'danger', text: 'Data Vencida' };

        // Verifica próximos do vencimento
        if (proximaLeitura > 0 && avisoKmHr > 0 && currentReading >= proximaLeitura - avisoKmHr) return { status: 'warning', text: 'Leitura Próxima' };
        if (proximaData && avisoDias > 0) {
            const warningDate = new Date(proximaData);
            warningDate.setDate(warningDate.getDate() - avisoDias); 
            if (now >= warningDate) return { status: 'warning', text: 'Data Próxima' };
        }

        return { status: 'ok', text: '' };
    };


    // Memoiza veículos com multas pendentes (mantido)
    const vehiclesWithPendingFines = useMemo(() => {
        const vehicleIds = new Set();
        (fines || []).forEach(fine => { 
            if (fine.paymentStatus === 'Pendente') { // Corrigido de fine.status para fine.paymentStatus (baseado no FinesPage)
                vehicleIds.add(fine.vehicleId);
            }
        });
        return vehicleIds;
    }, [fines]);

    // Define classe da linha baseado em canCirculate e revisão (mantido)
    const getVehicleRowClass = (vehicle) => {
        if (vehicle.canCirculate === false) {
            return 'bg-red-100 border-l-4 border-red-500'; 
        }
        const revisionInfo = getRevisionStatus(vehicle);
        const revisionStatusClasses = { ok: '', warning: 'bg-yellow-50', danger: 'bg-red-50' };
        return revisionStatusClasses[revisionInfo.status];
    };

    // Filtra os veículos ordenados (mantido)
    const filteredVehicles = useMemo(() => sortedVehicles.filter(v => {
        const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
        const searchMatch = (v.placa || '').toLowerCase().includes(filters.search.toLowerCase()) ||
                            (v.registroInterno || '').toLowerCase().includes(filters.search.toLowerCase()) ||
                            (v.marca || '').toLowerCase().includes(filters.search.toLowerCase()) ||
                            (v.modelo || '').toLowerCase().includes(filters.search.toLowerCase());
        const typeMatch = filters.type === 'todos' || v.tipo === filters.type;
        const statusMatch = filters.status === 'todos' || v.status === filters.status;
        
        // --- ATUALIZAÇÃO O/H (Filtro de Grupo) ---
        let groupMatch = false;
        if (filters.group === 'todos') {
            groupMatch = true;
        } else if (filters.group === 'Caminhões de Trecho') {
            // Regra especial para "Caminhões de Trecho"
            groupMatch = v.tipo === 'Caminhões Prancha';
        } else if (groups[filters.group]) {
            // Regra normal para outros grupos
            groupMatch = groups[filters.group].includes(v.tipo);
            // Garante que "Caminhões Prancha" não apareça em "Caminhões"
            if (filters.group === 'Caminhões' && v.tipo === 'Caminhões Prancha') {
                groupMatch = false;
            }
        }
        // --- FIM ATUALIZAÇÃO ---

        return searchMatch && typeMatch && statusMatch && groupMatch;
    }), [sortedVehicles, filters, vehicleGroups]);

    // Funções para abrir modais (mantidas)
    const openModal = (v = null) => { setEditingVehicle(v); setIsModalOpen(true); };
    const openObraAllocationModal = (v) => { setVehicleForObraAllocation(v); setIsObraAllocationModalOpen(true); };
    const openOperationalModal = (v) => { setVehicleForOperational(v); setIsOperationalModalOpen(true); };
    const openHistoryModal = (v) => { setVehicleForHistory(v); setIsHistoryModalOpen(true); };
    const openDeleteModal = (id) => { setItemToDelete({id}); setIsDeleteModalOpen(true); };
    const openDetailModal = (v) => { setVehicleForDetail(v); setIsDetailModalOpen(true); };
    const openFinesModal = (v) => { setVehicleForFines(v); setIsFinesModalOpen(true); };

    // Abre modal de manutenção (mantido)
    const handleMaintenanceClick = (vehicle) => {
        if (vehicle.obraAtualId || vehicle.operationalAssignment) {
            setAlertMessage('Este veículo está alocado. Desaloque-o primeiro para enviá-lo para manutenção.');
            return;
        }
        setVehicleForMaintenance(vehicle);
        setIsMaintenanceModalOpen(true);
    };

    // Função de exclusão (adaptada para API)
    const handleDelete = async () => {
        if (!itemToDelete) return;
        try {
            await apiClient.deleteVehicle(itemToDelete.id);
            setAlertMessage('Veículo excluído com sucesso.');
            reloadData(); 
        } catch (error) {
            console.error("Erro ao excluir veículo:", error);
            setAlertMessage(error.response?.data?.message || 'Falha ao excluir o veículo.');
        } finally {
            setItemToDelete(null);
            setIsDeleteModalOpen(false);
        }
    };

    // Upload CSV (mantido)
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const text = e.target.result;
                const lines = text.split(/[\r\n]+/).filter(line => line.trim() !== ''); 
                if (lines.length < 2) {
                    setAlertMessage("Arquivo CSV vazio ou inválido (precisa de cabeçalho e pelo menos uma linha de dados).");
                    return;
                }
                const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                const headerMapping = {
                    'registroInterno': 'registroInterno', 
                    'Placa': 'placa',
                    'Marca': 'marca',
                    'Modelo': 'modelo',
                    'Tipo': 'tipo',
                    'Odometro': 'odometro', 
                    'Horimetro': 'horimetro', 
                };
                const apiHeaders = headers.map(h => headerMapping[h]).filter(Boolean);
                const data = lines.slice(1).map(line => {
                     const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(v => v.trim().replace(/^"|"$/g, '')) || [];
                     if (values.length !== headers.length) {
                         console.warn("Linha com número incorreto de colunas:", line);
                         return null; 
                     }
                    return headers.reduce((obj, header, index) => {
                         const apiKey = headerMapping[header]; 
                         if (apiKey) { 
                             let value = values[index] || '';
                             if (['odometro', 'horimetro', 'horimetroDigital', 'horimetroAnalogico', 'fuelCapacity', 'consumoMedioFabricante'].includes(apiKey)) {
                                 value = parseFloat(value.replace(',', '.')) || 0;
                             }
                             obj[apiKey] = value;
                         }
                        return obj;
                    }, {});
                }).filter(Boolean); 

                if (data.length === 0) {
                     setAlertMessage("Nenhum dado válido encontrado no arquivo CSV.");
                     return;
                 }
                setAlertMessage(`Importando ${data.length} veículos... Isso pode levar um tempo.`);
                let successCount = 0;
                let errorCount = 0;
                for (const item of data) {
                    try {
                        const payload = { ...item, status: 'Disponível', canCirculate: item.canCirculate !== undefined ? item.canCirculate : true };
                        await apiClient.createVehicle(payload);
                        successCount++;
                    } catch (error) {
                        console.error("Erro ao importar veículo:", item.registroInterno || item.placa, error);
                        errorCount++;
                    }
                }
                setAlertMessage(`${successCount} veículos importados com sucesso. ${errorCount} falharam.`);
                if (successCount > 0) reloadData(); 
            };
            reader.onerror = () => { setAlertMessage("Erro ao ler o arquivo CSV."); };
            reader.readAsText(file);
        }
        event.target.value = null;
    };


    // Exportar CSV (mantido)
    const exportToCSV = () => {
        if (filteredVehicles.length === 0) {
             setAlertMessage("Nenhum veículo para exportar com os filtros atuais.");
             return;
         }
        const headers = ['registroInterno', 'placa', 'marca', 'modelo', 'tipo', 'odometro', 'horimetro', 'horimetroDigital', 'horimetroAnalogico', 'status', 'localizacaoAtual', 'canCirculate', 'validadeTacografo', 'validadeAET_DAER', 'validadeAET_DNIT'];
        const rows = filteredVehicles.map(v => headers.map(header => {
            let value = v[header];
            if (['validadeTacografo', 'validadeAET_DAER', 'validadeAET_DNIT'].includes(header) && value) {
                 try { return new Date(value).toISOString().split('T')[0]; } catch { return ''; }
             }
             if (typeof value === 'boolean') { return value ? 'true' : 'false'; }
            return value ?? ''; 
        }));
        let csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(',') + "\n"
            + rows.map(e => e.map(i => `"${String(i).replace(/"/g, '""')}"`).join(",")).join("\n"); 
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "veiculos.csv");
        document.body.appendChild(link); 
        link.click();
        document.body.removeChild(link);
    };

    // ... (Renderização principal - JSX) ...
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            {/* Cabeçalho e Botões */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Gerenciamento de Veículos</h1>
                <ProtectedComponent requiredPermission="editor">
                    <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
                        <label className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white font-semibold rounded-lg shadow hover:bg-green-600 transition cursor-pointer text-sm">
                            <Upload size={18} /> Importar CSV
                            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                        </label>
                        <button onClick={exportToCSV} className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow hover:bg-blue-600 transition text-sm"><Download size={18} />Exportar CSV</button>
                        <button onClick={() => openModal()} className="flex items-center gap-2 px-3 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg shadow hover:bg-yellow-500 transition text-sm"><PlusCircle size={18} />Adicionar Veículo</button>
                    </div>
                </ProtectedComponent>
            </div>

             {/* Filtros (Atualizado com novo grupo) */}
            <div className="mb-6 p-4 bg-white rounded-lg shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                <input type="text" name="search" placeholder="Buscar Placa, Registro, Marca..." value={filters.search} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg bg-gray-50 focus:ring-yellow-500" />
                <select name="group" value={filters.group} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg bg-gray-50 focus:ring-yellow-500">
                    <option value="todos">Todos os Grupos</option>
                    {(vehicleGroups && typeof vehicleGroups === 'object' ? Object.keys(vehicleGroups) : []).map(group => (
                        <option key={group} value={group}>{group}</option>
                    ))}
                    {/* --- ATUALIZAÇÃO O/H: Adiciona grupo novo --- */}
                    <option value="Caminhões de Trecho">Caminhões de Trecho</option>
                    {/* --- FIM ATUALIZAÇÃO --- */}
                 </select>
                <select name="type" value={filters.type} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg bg-gray-50 focus:ring-yellow-500">
                    <option value="todos">Todos os Tipos</option>
                    {[...new Set((vehicles || []).map(v => v.tipo).filter(Boolean))].sort().map(type => <option key={type} value={type}>{type}</option>)}
                </select>
                <select name="status" value={filters.status} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg bg-gray-50 focus:ring-yellow-500">
                    <option value="todos">Todos os Status</option>
                    {[...new Set((vehicles || []).map(v => v.status).filter(Boolean))].sort().map(status => <option key={status} value={status}>{status}</option>)}
                     {!vehicles.some(v => v.status === 'Disponível') && <option value="Disponível">Disponível</option>}
                     {!vehicles.some(v => v.status === 'Em Obra') && <option value="Em Obra">Em Obra</option>}
                </select>
            </div>

            {/* Tabela de Veículos (Atualizado com Leitura Principal) */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                {/* Cabeçalho Tabela Desktop */}
                <div className="hidden md:grid grid-cols-6 gap-4 p-4 font-semibold text-xs text-gray-600 border-b bg-gray-50 uppercase tracking-wider">
                    <div className="col-span-2 cursor-pointer hover:text-gray-900" onClick={() => requestSort('registroInterno')}>Veículo <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="text-right cursor-pointer hover:text-gray-900" onClick={() => requestSort('vehicleReading')}>Leitura Principal <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="cursor-pointer hover:text-gray-900" onClick={() => requestSort('status')}>Status <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="col-span-2 text-center">Ações</div>
                </div>
                {/* Linhas da Tabela (Mobile First) */}
                {filteredVehicles.map(vehicle => {
                    const revisionInfo = getRevisionStatus(vehicle);
                    const hasPendingFine = vehiclesWithPendingFines.has(vehicle.id);
                    const statusClasses = {
                        'Em Manutenção': 'bg-red-100 text-red-800',
                        'Aguardando Manutenção': 'bg-red-100 text-red-800 animate-pulse',
                        'Em Obra': 'bg-green-100 text-green-800',
                        'Em Operação': 'bg-blue-100 text-blue-800',
                        'Disponível': 'bg-gray-100 text-gray-800'
                    };
                    const statusText = vehicle.status === 'Disponível'
                        ? `${vehicle.status} - ${vehicle.localizacaoAtual || 'Pátio'}`
                        : vehicle.status === 'Em Obra' && vehicle.obra
                            ? `Obra: ${vehicle.obra.nome}`
                            : vehicle.status;

                    return (
                        <div key={vehicle.id} className={`grid grid-cols-1 md:grid-cols-6 gap-2 md:gap-4 items-center p-3 md:p-4 border-b last:border-b-0 hover:bg-gray-50 text-sm ${getVehicleRowClass(vehicle)}`}>
                            {/* Coluna Veículo (com imagem) */}
                            <div className="md:col-span-2 flex items-center gap-3">
                                <div className="relative shrink-0">
                                    <button onClick={() => openDetailModal(vehicle)} className="cursor-pointer block">
                                        <img
                                            src={vehicle.fotoURL || 'https://placehold.co/80x60/e2e8f0/cbd5e0?text=S/Foto'}
                                            alt={`${vehicle.marca || ''} ${vehicle.modelo || ''}`}
                                            className="w-20 h-15 object-cover rounded"
                                            onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/80x60/e2e8f0/cbd5e0?text=Erro'; }}
                                        />
                                    </button>
                                     {/* Ícones de Alerta */}
                                     {vehicle.canCirculate === false && <span className="absolute -top-1.5 -right-1.5 p-0.5 bg-red-600 border-2 border-white rounded-full text-white tooltip" data-tip="Não pode circular"><TrafficCone size={12} /></span>}
                                     {revisionInfo.status === 'warning' && <span className="absolute -top-1.5 -left-1.5 p-0.5 bg-yellow-500 border-2 border-white rounded-full text-white tooltip" data-tip={`Revisão: ${revisionInfo.text}`}><Info size={12} /></span>}
                                     {revisionInfo.status === 'danger' && <span className="absolute -top-1.5 -left-1.5 p-0.5 bg-red-600 border-2 border-white rounded-full text-white tooltip" data-tip={`Revisão: ${revisionInfo.text}`}><AlertTriangle size={12} /></span>}
                                     {hasPendingFine && <span className="absolute -bottom-1.5 -right-1.5 p-0.5 bg-orange-500 border-2 border-white rounded-full text-white tooltip" data-tip="Multa pendente"><ShieldAlert size={12} /></span>}
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900">{vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo}</p>
                                    <p className="text-xs text-gray-500">{vehicle.tipo}</p>
                                    <p className="text-xs text-gray-700 md:hidden">Placa: {vehicle.placa}</p>
                                </div>
                            </div>
                            
                            {/* Leitura (Atualizado) */}
                            <div className="text-left md:text-right font-semibold">
                                <span className="md:hidden text-xs text-gray-500 font-medium">Leitura: </span>
                                {vehicle.vehicleReading}
                            </div>
                            
                             {/* Status */}
                            <div>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${statusClasses[vehicle.status] || 'bg-gray-100 text-gray-800'}`}>
                                    {statusText}
                                </span>
                            </div>
                            {/* Ações (Atualizado) */}
                            <div className="md:col-span-2 flex flex-wrap gap-1 justify-start md:justify-center items-center">
                                {/* Agrupa botões comuns */}
                                <button onClick={() => openFinesModal(vehicle)} title="Histórico de Multas" className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-gray-100 rounded-md"><ShieldAlert size={14} /></button>
                                <button onClick={() => openHistoryModal(vehicle)} title="Histórico" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-md"><Clock size={14} /></button>
                                <ProtectedComponent requiredPermission="editor">
                                    <button onClick={() => openModal(vehicle)} title="Editar" className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-md"><Edit size={14} /></button>
                                     {vehicle.status === 'Disponível' && (
                                         <>
                                            <button onClick={() => openObraAllocationModal(vehicle)} title="Alocar em Obra" className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-gray-100 rounded-md"><HardHat size={14} /></button>
                                            <button onClick={() => openOperationalModal(vehicle)} title="Alocar em Operação" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-md"><Users size={14} /></button>
                                            <button onClick={() => handleMaintenanceClick(vehicle)} title="Manutenção" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-md"><Wrench size={14} /></button>
                                         </>
                                     )}
                                     {vehicle.status === 'Em Obra' && <button onClick={() => openObraAllocationModal(vehicle)} title="Desalocar da Obra" className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-md"><HardHat size={14} /></button>}
                                     {vehicle.status === 'Em Operação' && <button onClick={() => openOperationalModal(vehicle)} title="Desalocar da Operação" className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-md"><Users size={14} /></button>}
                                     {(vehicle.status === 'Em Manutenção' || vehicle.status === 'Aguardando Manutenção') && <button onClick={() => handleMaintenanceClick(vehicle)} title="Finalizar Manutenção" className="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-100 rounded-md"><Wrench size={14} /></button>}
                                </ProtectedComponent>
                                <ProtectedComponent requiredPermission="admin">
                                    <button onClick={() => openDeleteModal(vehicle.id)} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-md"><Trash2 size={14} /></button>
                                </ProtectedComponent>
                            </div>
                        </div>
                    );
                })}
                 {filteredVehicles.length === 0 && (
                    <p className="p-4 text-center text-gray-500 italic">Nenhum veículo encontrado com os filtros selecionados.</p>
                 )}
            </div>

            {/* Modais (Atualizados para O/H) */}
            {isModalOpen && <VehicleModal user={user} vehicle={editingVehicle} vehicles={vehicles} vehicleTypes={vehicleTypes} onClose={() => setIsModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} vehicleGroups={vehicleGroups} />}
            {isObraAllocationModalOpen && <ObraAllocationModal user={user} vehicle={vehicleForObraAllocation} obras={obras} employees={employees} onClose={() => setIsObraAllocationModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} vehicles={vehicles} vehicleGroups={vehicleGroups} />}
            {isOperationalModalOpen && <OperationalAssignmentModal user={user} vehicle={vehicleForOperational} employees={employees} onClose={() => setIsOperationalModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} operationalSubGroups={operationalSubGroups} />}
            {isHistoryModalOpen && <HistoryModal vehicle={vehicleForHistory} onClose={() => setIsHistoryModalOpen(false)} obras={obras} vehicleGroups={vehicleGroups} />}
            {isDeleteModalOpen && <PasswordConfirmationModal message="Tem certeza que deseja excluir este veículo? Todas as revisões e históricos associados também serão removidos." onConfirm={handleDelete} onClose={() => setIsDeleteModalOpen(false)} apiClient={apiClient} />}
            {isDetailModalOpen && <VehicleDetailModal vehicle={vehicleForDetail} revision={revisions.find(r => r.vehicleId === vehicleForDetail?.id)} onClose={() => setIsDetailModalOpen(false)} vehicleGroups={vehicleGroups} />}
            {isFinesModalOpen && <VehicleFinesModal vehicle={vehicleForFines} fines={fines} onClose={() => setIsFinesModalOpen(false)} />}
            {isMaintenanceModalOpen && <MaintenanceModal user={user} vehicle={vehicleForMaintenance} onClose={() => setIsMaintenanceModalOpen(false)} apiClient={apiClient} setAlertMessage={setAlertMessage} reloadData={reloadData} />}
        </div>
    );
};

// --- MODAIS E SUB-COMPONENTES (ADAPTADOS PARA API E REGRAS O/H) ---

// Modal de Manutenção (sem mudança)
const MaintenanceModal = ({ user, vehicle, onClose, apiClient, setAlertMessage, reloadData }) => {
    const isCurrentlyInMaintenance = vehicle.status === 'Em Manutenção' || vehicle.status === 'Aguardando Manutenção';
    const [status, setStatus] = useState(isCurrentlyInMaintenance ? vehicle.status : 'Aguardando Manutenção');
    const [location, setLocation] = useState(vehicle.maintenanceLocation?.details || 'Pátio MAK Lajeado');
    const [isSaving, setIsSaving] = useState(false);
    const [endLocation, setEndLocation] = useState('Pátio MAK Lajeado');

    const handleSubmit = async () => {
        setIsSaving(true);
        try {
            await apiClient.startVehicleMaintenance(vehicle.id, { status, location });
            setAlertMessage(`Status de manutenção atualizado para "${status}".`);
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao iniciar manutenção:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao atualizar o status de manutenção.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleEndMaintenance = async () => {
        setIsSaving(true);
        try {
            await apiClient.endVehicleMaintenance(vehicle.id, { location: endLocation }); 
            setAlertMessage("Veículo liberado da manutenção.");
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao finalizar manutenção:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao finalizar a manutenção.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Gerir Manutenção</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                </div>
                <div className="p-6 space-y-4">
                     <p className="text-sm"><strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.placa}</p>
                    {!isCurrentlyInMaintenance ? (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Definir Status *</label>
                                <select value={status} onChange={e => setStatus(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm bg-white" required>
                                    <option value="Aguardando Manutenção">Aguardando Manutenção</option>
                                    <option value="Em Manutenção">Em Manutenção</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Localização da Manutenção *</label>
                                <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Ex: Oficina Terceirizada ou Pátio MAK Lajeado" className="mt-1 w-full p-2 border rounded-md text-sm" required />
                            </div>
                        </>
                    ) : (
                        <div>
                            <p className="mb-2">O veículo está atualmente: <strong>{vehicle.status}</strong>.</p>
                            <p className="mb-4">Localização: <strong>{vehicle.maintenanceLocation?.details || 'Não informado'}</strong>.</p>
                            <hr className="my-4"/>
                            <label className="block text-sm font-medium text-gray-700">Local de Disponibilidade após Manutenção *</label>
                            <input type="text" value={endLocation} onChange={e => setEndLocation(e.target.value)} placeholder="Ex: Pátio MAK Lajeado" className="mt-1 w-full p-2 border rounded-md text-sm" required />
                        </div>
                    )}
                </div>
                <div className="p-4 bg-gray-50 border-t flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Cancelar</button>
                    {isCurrentlyInMaintenance ? (
                        <button onClick={handleEndMaintenance} disabled={isSaving || !endLocation} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-green-300 flex items-center justify-center gap-2 text-sm">
                            {isSaving ? <><Loader className="animate-spin" size={18}/> Finalizando...</> : "Finalizar Manutenção"}
                        </button>
                    ) : (
                        <button onClick={handleSubmit} disabled={isSaving || !status || !location} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm">
                            {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : "Confirmar Status"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};


// Modal de Multas do Veículo (Corrigido para paymentStatus)
const VehicleFinesModal = ({ vehicle, fines = [], onClose }) => { 
    const vehicleFines = useMemo(() => {
        return (fines || [])
            .filter(fine => fine.vehicleId === vehicle.id)
            .sort((a, b) => new Date(b.dataInfração) - new Date(a.dataInfração)); // Corrigido: dataInfração
    }, [fines, vehicle]);

    const getStatusBadge = (status) => {
        switch (status) {
            case 'Paga': return 'bg-green-100 text-green-800';
            case 'Pendente': return 'bg-yellow-100 text-yellow-800';
            case 'Em Recurso': return 'bg-blue-100 text-blue-800';
            case 'Cancelada': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold">Histórico de Multas do Veículo</h2>
                        <p className="text-gray-600 text-sm">{vehicle.registroInterno} - {vehicle.placa}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={18}/></button>
                </div>
                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    {vehicleFines.length > 0 ? (
                        <ul className="space-y-3">
                            {vehicleFines.map(fine => (
                                <li key={fine.id} className="p-4 bg-gray-50 rounded-lg border">
                                    <div className="flex flex-col sm:flex-row justify-between items-start">
                                        <div className="mb-2 sm:mb-0">
                                            <p className="font-semibold text-sm">{fine.descricao || 'Descrição não informada'}</p>
                                            <p className="text-xs text-gray-600 mt-1">Condutor: {fine.employeeInfo?.nome || 'Não informado'}</p>
                                            <p className="text-xs text-gray-600">Data: {fine.dataInfração ? new Date(fine.dataInfração).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'N/A'}</p>
                                        </div>
                                        <div className="text-left sm:text-right w-full sm:w-auto">
                                            <p className="font-bold text-red-600">R$ {(fine.valor || 0).toFixed(2)}</p>
                                            <span className={`mt-1 inline-block px-2 py-0.5 text-xs font-bold rounded-full ${getStatusBadge(fine.paymentStatus)}`}>
                                                {fine.paymentStatus || 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500 text-center italic">Nenhuma multa registrada para este veículo.</p>
                    )}
                </div>
                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};


// Modal de Criação/Edição de Veículo (Atualizado com O/H e Upload de Imagem)
const VehicleModal = ({ user, vehicle, vehicles = [], vehicleTypes = [], onClose, setAlertMessage, apiClient, reloadData, vehicleGroups = {} }) => {
    
    // --- Lógica O/H para estado inicial ---
    const [currentGroup, setCurrentGroup] = useState('Veículos Leves');
    
    // Estado inicial
    const [formData, setFormData] = useState({
        placa: vehicle?.placa || '',
        registroInterno: vehicle?.registroInterno || '',
        capacidade: vehicle?.capacidade?.toString() || '', 
        tipo: vehicle?.tipo || (vehicleTypes.length > 0 ? vehicleTypes[0] : ''), 
        marca: vehicle?.marca || '',
        modelo: vehicle?.modelo || '',
        odometro: vehicle?.odometro?.toString() || '0', 
        horimetro: vehicle?.horimetro?.toString() || '0',
        horimetroDigital: vehicle?.horimetroDigital?.toString() || '0',
        horimetroAnalogico: vehicle?.horimetroAnalogico?.toString() || '0',
        possuiHorimetroAnalogico: vehicle?.possuiHorimetroAnalogico || false,
        mediaCalculo: vehicle?.mediaCalculo || 'odometro', 
        isComboioVehicle: vehicle?.isComboioVehicle || false,
        fuelCapacity: vehicle?.fuelCapacity?.toString() || '',
        ano_fabricacao: vehicle?.ano_fabricacao?.toString() || '', 
        ano_modelo: vehicle?.ano_modelo?.toString() || '',
        chassi: vehicle?.chassi || '',
        validadeTacografo: vehicle?.validadeTacografo ? new Date(vehicle.validadeTacografo).toISOString().split('T')[0] : '', // YYYY-MM-DD
        validadeAET_DAER: vehicle?.validadeAET_DAER ? new Date(vehicle.validadeAET_DAER).toISOString().split('T')[0] : '',
        validadeAET_DNIT: vehicle?.validadeAET_DNIT ? new Date(vehicle.validadeAET_DNIT).toISOString().split('T')[0] : '',
        canCirculate: vehicle?.canCirculate !== undefined ? vehicle.canCirculate : true,
    });

    // --- Lógica de Upload de Imagem ---
    const [fotoFile, setFotoFile] = useState(null); // Arquivo para upload
    const [fotoPreview, setFotoPreview] = useState(vehicle?.fotoURL || null); // URL para preview
    // --- Fim Lógica de Upload ---

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    // Atualiza o grupo (para UI) e o 'mediaCalculo' (lógica) quando o TIPO muda
    useEffect(() => {
        const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
        const newGroup = Object.keys(groups).find(group => groups[group]?.includes(formData.tipo)) || 'Veículos Leves';
        setCurrentGroup(newGroup);

        // Atualiza 'mediaCalculo' com base no grupo
        setFormData(prev => {
            let newMediaCalculo = prev.mediaCalculo;
            // Regra: "Caminhões Prancha" (grupo "Caminhões de Trecho") usa odometro
            if (formData.tipo === 'Caminhões Prancha') {
                newMediaCalculo = 'odometro';
            }
            // Regra: "Máquinas Pesadas" e "Caminhões" (outros) usam horimetro
            else if (newGroup === 'Máquinas Pesadas' || newGroup === 'Caminhões') {
                newMediaCalculo = 'horimetro';
            }
            // Regra: "Veículos Leves" usam odometro
            else {
                newMediaCalculo = 'odometro';
            }
            return { ...prev, mediaCalculo: newMediaCalculo };
        });

    }, [formData.tipo, vehicleGroups]);


    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
         if (name === 'possuiHorimetroAnalogico' && !checked) {
            setFormData(prev => ({ ...prev, horimetroAnalogico: '0' }));
        }
    };

    // --- Handler para o arquivo de imagem ---
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFotoFile(file); // Armazena o arquivo
            setFotoPreview(URL.createObjectURL(file)); // Cria um preview local
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const isEditing = !!vehicle;

        // Validações
        if (!formData.placa || !formData.registroInterno || !formData.tipo || !formData.marca || !formData.modelo) {
             setError('Placa, Registro Interno, Tipo, Marca e Modelo são obrigatórios.');
             return;
         }
        const plateExists = vehicles.some(v => v.placa === formData.placa && v.id !== vehicle?.id);
        if (plateExists) {
            setError('Já existe um veículo com esta placa.');
            return;
        }
        const internalIdExists = vehicles.some(v => v.registroInterno === formData.registroInterno && v.id !== vehicle?.id);
        if (internalIdExists) {
            setError('Já existe um veículo com este registro interno.');
            return;
        }

        setIsSaving(true);

        // Prepara dados para API
        const dataToSave = {
            ...formData,
            odometro: parseFloat(formData.odometro) || null,
            horimetro: parseFloat(formData.horimetro) || null,
            horimetroDigital: parseFloat(formData.horimetroDigital) || null,
            horimetroAnalogico: formData.possuiHorimetroAnalogico ? (parseFloat(formData.horimetroAnalogico) || null) : null,
            fuelCapacity: parseFloat(formData.fuelCapacity) || null,
            ano_fabricacao: parseInt(formData.ano_fabricacao, 10) || null, 
            ano_modelo: parseInt(formData.ano_modelo, 10) || null,       
            capacidade: parseFloat(formData.capacidade) || null, 
            validadeTacografo: formData.validadeTacografo || null,
            validadeAET_DAER: formData.validadeAET_DAER || null,
            validadeAET_DNIT: formData.validadeAET_DNIT || null,
        };

        try {
            let savedVehicleId = null;

            if (isEditing) {
                await apiClient.updateVehicle(vehicle.id, dataToSave);
                savedVehicleId = vehicle.id;
                setAlertMessage(`Veículo ${formData.registroInterno} atualizado com sucesso!`);
            } else {
                const dataWithDefaults = { ...dataToSave, status: 'Disponível' };
                // Captura o retorno da API (que inclui o ID gerado)
                const newVehicle = await apiClient.createVehicle(dataWithDefaults);
                savedVehicleId = newVehicle.id;
                setAlertMessage(`Veículo ${formData.registroInterno} adicionado com sucesso!`);
            }

            // --- Lógica de Upload de Imagem ---
            // Se um arquivo foi selecionado, faz o upload *após* salvar os dados
            if (fotoFile && savedVehicleId) {
                const uploadFormData = new FormData();
                uploadFormData.append('fotoFile', fotoFile); // O nome 'fotoFile' deve bater com o da rota

                // Usa o token do apiClient (assumindo que ele tem um método getToken())
                const token = apiClient.getToken ? apiClient.getToken() : '';
                
                // Faz o POST para a nova rota /:id/upload-image
                await fetch(`${apiClient.defaults.baseURL}/vehicles/${savedVehicleId}/upload-image`, {
                    method: 'POST',
                    body: uploadFormData,
                    headers: {
                        // Não defina 'Content-Type', o browser faz isso para FormData
                        'Authorization': `Bearer ${token}`
                    }
                });
            }
            // --- Fim da Lógica de Upload ---

            reloadData(); 
            onClose();
        } catch (err) {
            console.error("Erro ao salvar veículo:", err);
            setError(err.response?.data?.message || "Ocorreu um erro ao salvar os dados.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            {/* Modal Content */}
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col my-auto">
                 {/* Cabeçalho Fixo */}
                <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                    <h2 className="text-xl sm:text-2xl font-bold">{vehicle ? 'Editar Veículo' : 'Adicionar Veículo'}</h2>
                     <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                </div>
                 {/* Conteúdo Rolável */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                    <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                        
                        {/* --- Coluna 1: Imagem e Dados Principais --- */}
                        <div className="space-y-4">
                            {/* --- Upload de Imagem --- */}
                            <div>
                                <label className="block font-medium text-gray-700 mb-1">Foto do Veículo</label>
                                <div className="mt-1 flex items-center gap-4">
                                    {/* Preview da Imagem */}
                                    <div className="w-24 h-20 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                                        {fotoPreview ? (
                                            <img src={fotoPreview} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageOff className="text-gray-400" size={32} />
                                        )}
                                    </div>
                                    <label className="cursor-pointer bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500">
                                        <Camera size={16} className="inline-block mr-2" />
                                        <span>Alterar Foto</span>
                                        <input id="file-upload" name="fotoFile" type="file" className="sr-only" accept="image/*" onChange={handleFileChange} />
                                    </label>
                                </div>
                            </div>
                            {/* --- Fim Upload --- */}

                             <div>
                                <label className="block font-medium text-gray-700 mb-1">Placa *</label>
                                <input name="placa" value={formData.placa} onChange={handleChange} placeholder="ABC1D23" required className="p-2 border rounded w-full" />
                            </div>
                             <div>
                                <label className="block font-medium text-gray-700 mb-1">Registro Interno *</label>
                                <input name="registroInterno" value={formData.registroInterno} onChange={handleChange} placeholder="Ex: C01, M05" required className="p-2 border rounded w-full" />
                            </div>
                             <div>
                                <label className="block font-medium text-gray-700 mb-1">Tipo *</label>
                                <select name="tipo" value={formData.tipo} onChange={handleChange} className="p-2 border rounded w-full bg-white" required>
                                    {(vehicleTypes || []).map(type => <option key={type} value={type}>{type}>{type}</option>)}
                                </select>
                             </div>
                             <div>
                                <label className="block font-medium text-gray-700 mb-1">Marca *</label>
                                <input name="marca" value={formData.marca} onChange={handleChange} placeholder="Ex: Volvo" required className="p-2 border rounded w-full" />
                            </div>
                             <div>
                                <label className="block font-medium text-gray-700 mb-1">Modelo *</label>
                                <input name="modelo" value={formData.modelo} onChange={handleChange} placeholder="Ex: FH 540" required className="p-2 border rounded w-full" />
                            </div>
                              <div>
                                 <label className="block font-medium text-gray-700 mb-1">Capacidade (m³)</label>
                                 <input name="capacidade" value={formData.capacidade} onChange={handleChange} placeholder="Ex: 12" type="number" step="any" className="p-2 border rounded w-full" />
                             </div>
                        </div>

                         {/* --- Coluna 2: Leituras (Lógica O/H Aplicada) --- */}
                        <div className="space-y-4">
                            {/* --- ATUALIZAÇÃO O/H: UI Condicional --- */}

                            {/* Grupo: Máquinas Pesadas */}
                            {currentGroup === 'Máquinas Pesadas' && (
                                <>
                                    <div>
                                        <label className="block font-medium text-gray-700 mb-1">Horímetro Digital (Hrs)</label>
                                        <input name="horimetroDigital" value={formData.horimetroDigital} onChange={handleChange} type="number" step="0.1" className="p-2 border rounded w-full" />
                                    </div>
                                    <div className="flex items-center">
                                        <input name="possuiHorimetroAnalogico" id="possuiHorimetroAnalogico" type="checkbox" checked={formData.possuiHorimetroAnalogico} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"/>
                                        <label htmlFor="possuiHorimetroAnalogico" className="ml-2 block text-gray-900 cursor-pointer">Possui Horímetro Analógico?</label>
                                    </div>
                                    {formData.possuiHorimetroAnalogico && (
                                        <div>
                                            <label className="block font-medium text-gray-700 mb-1">Horímetro Analógico (Hrs)</label>
                                            <input name="horimetroAnalogico" value={formData.horimetroAnalogico} onChange={handleChange} type="number" step="0.1" className="p-2 border rounded w-full" />
                                        </div>
                                    )}
                                    {/* Campo 'horimetro' legado para Máquinas que não têm digital nem analógico */}
                                    {!formData.possuiHorimetroAnalogico && (
                                        <div>
                                            <label className="block font-medium text-gray-700 mb-1">Horímetro (Padrão/Legado) (Hrs)</label>
                                            <input name="horimetro" value={formData.horimetro} onChange={handleChange} type="number" step="0.1" className="p-2 border rounded w-full" />
                                        </div>
                                    )}
                                    {/* Esconde Odômetro */}
                                    <input name="odometro" value="0" type="hidden" /> 
                                </>
                            )}

                            {/* Grupo: Caminhões (Exceto Prancha) */}
                            {currentGroup === 'Caminhões' && formData.tipo !== 'Caminhões Prancha' && (
                                <>
                                     <div>
                                        <label className="block font-medium text-gray-700 mb-1">Horímetro (Hrs) *</label>
                                        <input name="horimetro" value={formData.horimetro} onChange={handleChange} type="number" step="0.1" className="p-2 border rounded w-full" required/>
                                    </div>
                                    {/* Esconde Odômetro */}
                                    <input name="odometro" value="0" type="hidden" />
                                    {/* Esconde digitais/analógicos */}
                                    <input name="horimetroDigital" value="0" type="hidden" />
                                    <input name="horimetroAnalogico" value="0" type="hidden" />
                                </>
                            )}

                            {/* Grupo: Veículos Leves OU Caminhões de Trecho (Prancha) */}
                            {(currentGroup === 'Veículos Leves' || formData.tipo === 'Caminhões Prancha' || !currentGroup) && ( 
                                <div>
                                    <label className="block font-medium text-gray-700 mb-1">Odômetro (Km) *</label>
                                    <input name="odometro" value={formData.odometro} onChange={handleChange} type="number" step="any" className="p-2 border rounded w-full" required/>
                                    {/* Esconde Horímetros */}
                                    <input name="horimetro" value="0" type="hidden" />
                                    <input name="horimetroDigital" value="0" type="hidden" />
                                    <input name="horimetroAnalogico" value="0" type="hidden" />
                                </div>
                            )}
                            
                            {/* Campo 'mediaCalculo' é definido automaticamente no useEffect, não precisa de input manual */}
                            <input name="mediaCalculo" value={formData.mediaCalculo} type="hidden" />

                            {/* --- FIM ATUALIZAÇÃO O/H --- */}


                             {/* Ano Fab/Modelo */}
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-medium text-gray-700 mb-1">Ano Fabric.</label>
                                    <input name="ano_fabricacao" value={formData.ano_fabricacao} onChange={handleChange} placeholder="AAAA" type="number" className="p-2 border rounded w-full" />
                                </div>
                                <div>
                                    <label className="block font-medium text-gray-700 mb-1">Ano Modelo</label>
                                    <input name="ano_modelo" value={formData.ano_modelo} onChange={handleChange} placeholder="AAAA" type="number" className="p-2 border rounded w-full" />
                                </div>
                            </div>
                            {/* Chassi */}
                             <div>
                                <label className="block font-medium text-gray-700 mb-1">Chassi</label>
                                <input name="chassi" value={formData.chassi} onChange={handleChange} placeholder="Nº do Chassi" className="p-2 border rounded w-full" />
                            </div>
                            {/* Capacidade Tanque */}
                            <div>
                                <label className="block font-medium text-gray-700 mb-1">Capacidade Tanque (L)</label>
                                <input name="fuelCapacity" value={formData.fuelCapacity} onChange={handleChange} placeholder="Ex: 300" type="number" step="any" className="p-2 border rounded w-full" />
                            </div>

                        </div>

                         {/* --- Coluna 3: Checkboxes e Datas (Lógica O/H aplicada) --- */}
                        <div className="space-y-4">
                             {/* Comboio */}
                             <div className="flex items-center pt-1">
                                <input name="isComboioVehicle" id="isComboioVehicle" type="checkbox" checked={formData.isComboioVehicle} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"/>
                                <label htmlFor="isComboioVehicle" className="ml-2 block font-medium text-gray-900 cursor-pointer">É um veículo Comboio?</label>
                            </div>
                             {/* Pode Circular */}
                            <div className="flex items-center">
                                <input name="canCirculate" id="canCirculate" type="checkbox" checked={formData.canCirculate} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"/>
                                <label htmlFor="canCirculate" className="ml-2 block font-medium text-gray-900 cursor-pointer">Pode Circular / Rodar?</label>
                            </div>

                            {/* Datas (Condicional) */}
                            {/* --- ATUALIZAÇÃO O/H: Mostra para Caminhões (todos) E Prancha --- */}
                            {(currentGroup === 'Caminhões' || formData.tipo === 'Caminhões Prancha') && (
                                <div className="mt-4 pt-4 border-t space-y-4">
                                     <h3 className="font-semibold text-gray-700">Validades</h3>
                                     <div>
                                        <label className="block font-medium text-gray-700 mb-1">Tacógrafo</label>
                                        <input name="validadeTacografo" value={formData.validadeTacografo} onChange={handleChange} type="date" className="p-2 border rounded w-full" />
                                    </div>
                                     <div>
                                        <label className="block font-medium text-gray-700 mb-1">AET DAER/RS</label>
                                        <input name="validadeAET_DAER" value={formData.validadeAET_DAER} onChange={handleChange} type="date" className="p-2 border rounded w-full" />
                                    </div>
                                     <div>
                                        <label className="block font-medium text-gray-700 mb-1">AET DNIT</label>
                                        <input name="validadeAET_DNIT" value={formData.validadeAET_DNIT} onChange={handleChange} type="date" className="p-2 border rounded w-full" />
                                    </div>
                                </div>
                            )}
                            {/* --- FIM ATUALIZAÇÃO O/H --- */}


                             {/* Erro */}
                             {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
                        </div>
                    </div>

                    {/* Rodapé Fixo */}
                    <div className="p-4 bg-gray-50 border-t flex flex-col sm:flex-row justify-end gap-2 sticky bottom-0 z-10">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium w-full sm:w-auto" disabled={isSaving}>Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm w-full sm:w-auto">
                            {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// Modal de Detalhes do Veículo (Atualizado com O/H)
const VehicleDetailModal = ({ vehicle, revision, onClose, vehicleGroups = {} }) => { 
    if (!vehicle) return null;

     // --- ATUALIZAÇÃO O/H ---
    const { label: readingLabel, value: readingValueNum, unit: readingUnit } = getPrincipalReadingInfo(vehicle, vehicleGroups);
    const readingValue = `${parseFloat(readingValueNum).toFixed(1)} ${readingUnit}`;
    
    // Determina unidade de consumo
    let consumptionUnit = 'Km/L'; // Default (Leves, Prancha)
    if (readingUnit === 'Hr') {
        consumptionUnit = 'L/Hr'; // Máquinas, Caminhões
    }
    // --- FIM ATUALIZAÇÃO ---

    const formatDate = (dateString) => {
        if (!dateString || dateString.startsWith('0000')) return 'N/A';
        try { return new Date(dateString).toLocaleDateString('pt-BR', { timeZone: 'UTC' }); } 
        catch { return 'Inválida'; }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[95vh] flex flex-col my-auto">
                <div className="p-4 sm:p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <h2 className="text-xl sm:text-2xl font-bold">{vehicle.marca} {vehicle.modelo}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={20}/></button>
                </div>
                <div className="p-4 sm:p-6 overflow-y-auto">
                    <div className="mb-6 aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                        <img
                            src={vehicle.fotoURL || 'https://placehold.co/600x400/e2e8f0/cbd5e0?text=S/Foto'}
                            alt={`Foto de ${vehicle.marca || ''} ${vehicle.modelo || ''}`}
                            className="w-full h-full object-contain rounded-lg"
                            onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/600x400/e2e8f0/cbd5e0?text=Erro'; }}
                        />
                         {!vehicle.fotoURL && <ImageOff className="text-gray-400" size={48} />}
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:text-base">
                        <div className="font-semibold text-gray-600">Registro Interno:</div>
                        <div className="text-gray-800 font-medium">{vehicle.registroInterno || 'N/A'}</div>

                        <div className="font-semibold text-gray-600">Placa:</div>
                        <div className="text-gray-800 font-medium">{vehicle.placa || 'N/A'}</div>

                        <div className="font-semibold text-gray-600">Tipo:</div>
                        <div className="text-gray-800 font-medium">{vehicle.tipo || 'N/A'}</div>

                        {/* --- ATUALIZAÇÃO O/H --- */}
                        <div className="font-semibold text-gray-600">{readingLabel}:</div>
                        <div className="text-gray-800 font-medium">{readingValue}</div>
                        {/* --- FIM ATUALIZAÇÃO --- */}


                        <div className="col-span-2 border-t my-2"></div>
                         {(vehicle.ano_fabricacao || vehicle.ano_modelo) && (<>
                            <div className="font-semibold text-gray-600">Ano Fab./Modelo:</div>
                            <div className="text-gray-800 font-medium">{vehicle.ano_fabricacao || 'N/A'} / {vehicle.ano_modelo || 'N/A'}</div>
                        </>)}

                        {vehicle.chassi && (<>
                            <div className="font-semibold text-gray-600">Chassi:</div>
                            <div className="text-gray-800 font-medium break-all">{vehicle.chassi}</div>
                        </>)}

                         {/* --- ATUALIZAÇÃO O/H --- */}
                        {(readingUnit === 'Hr' || vehicle.tipo === 'Caminhões Prancha') && (<>
                            <div className="font-semibold text-gray-600">Cálculo de Média:</div>
                            <div className="text-gray-800 font-medium">{consumptionUnit}</div>
                        </>)}
                        {/* --- FIM ATUALIZAÇÃO --- */}


                        {vehicle.capacidade && (
                            <>
                                <div className="font-semibold text-gray-600">Capacidade (m³):</div>
                                <div className="text-gray-800 font-medium">{vehicle.capacidade}</div>
                            </>
                        )}
                         {vehicle.fuelCapacity && (
                            <>
                                <div className="font-semibold text-gray-600">Capacidade Tanque (L):</div>
                                <div className="text-gray-800 font-medium">{vehicle.fuelCapacity}</div>
                            </>
                        )}

                         {/* --- ATUALIZAÇÃO O/H: Condicional de Validades --- */}
                         {(vehicleGroups['Caminhões']?.includes(vehicle.tipo) || vehicle.tipo === 'Caminhões Prancha') && (
                            <>
                                <div className="col-span-2 border-t my-2"></div>
                                <div className="font-semibold text-gray-600">Validade Tacógrafo:</div>
                                <div className={`font-medium ${new Date(vehicle.validadeTacografo) < new Date() ? 'text-red-600' : 'text-gray-800'}`}>{formatDate(vehicle.validadeTacografo)}</div>

                                <div className="font-semibold text-gray-600">Validade AET DAER:</div>
                                 <div className={`font-medium ${new Date(vehicle.validadeAET_DAER) < new Date() ? 'text-red-600' : 'text-gray-800'}`}>{formatDate(vehicle.validadeAET_DAER)}</div>

                                <div className="font-semibold text-gray-600">Validade AET DNIT:</div>
                                <div className={`font-medium ${new Date(vehicle.validadeAET_DNIT) < new Date() ? 'text-red-600' : 'text-gray-800'}`}>{formatDate(vehicle.validadeAET_DNIT)}</div>
                            </>
                         )}
                         {/* --- FIM ATUALIZAÇÃO --- */}


                        {/* Revisão (Atualizado O/H) */}
                        <div className="col-span-2 border-t my-2 pt-2">
                             <h3 className="font-semibold text-gray-700 mb-1">Próxima Revisão Agendada</h3>
                        </div>
                        <div className="font-semibold text-gray-600">Data:</div>
                        <div className="text-gray-800 font-medium">{formatDate(revision?.proximaRevisaoData)}</div>

                        <div className="font-semibold text-gray-600">Leitura ({readingUnit}):</div>
                        <div className="text-gray-800 font-medium">
                            {(readingUnit === 'Hr' ? revision?.proximaRevisaoHorimetro : revision?.proximaRevisaoOdometro) || 'N/A'}
                        </div>

                         <div className="font-semibold text-gray-600">Descrição:</div>
                         <div className="text-gray-800 font-medium col-span-2">{revision?.descricao || 'Nenhuma descrição'}</div>
                    </div>
                </div>
                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-6 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};

// Modal de Alocação Operacional (sem mudança)
const OperationalAssignmentModal = ({ user, vehicle, employees = [], onClose, setAlertMessage, apiClient, reloadData, operationalSubGroups = [] }) => {
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

    const availableEmployees = useMemo(() =>
        (employees || [])
            .filter(e => e.status !== 'inativo') 
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [employees]);

    const handleAssign = async () => {
        if (!subGroup || !employeeId) {
            setAlertMessage("Selecione o subgrupo e o funcionário.");
            return;
        }
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Alocação Operacional</h2>
                     <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                </div>
                <div className="p-6">
                     <p className="text-sm mb-4"><strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo}</p>
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
                            <button onClick={handleAssign} disabled={isSaving || !subGroup || !employeeId} className="w-full px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm">
                                {isSaving ? <><Loader className="animate-spin" size={18}/> Alocando...</> : "Alocar Veículo"}
                            </button>
                        </div>
                    )}
                </div>
                 <div className="p-4 bg-gray-50 border-t flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Fechar</button>
                </div>
            </div>
        </div>
    );
};

// Modal de Alocação em Obra (Atualizado com O/H)
const ObraAllocationModal = ({ user, vehicle, obras = [], employees = [], onClose, setAlertMessage, apiClient, reloadData, vehicles = [], vehicleGroups = {} }) => {
    const currentObraAllocation = (Array.isArray(vehicle.history) ? vehicle.history : [])
                                    .find(h => (h.type === 'obra' || h.historyType === 'obra') && !h.endDate && !h.dataSaida);

    const [obraId, setObraId] = useState(currentObraAllocation ? vehicle.obraAtualId : '');
    const [employeeId, setEmployeeId] = useState(currentObraAllocation?.details?.employeeId || '');
    const [dataEntrada, setDataEntrada] = useState(currentObraAllocation ? new Date(currentObraAllocation.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    const [dataSaida, setDataSaida] = useState(new Date().toISOString().split('T')[0]); 
    const [locationAfterDeallocate, setLocationAfterDeallocate] = useState('Pátio MAK Lajeado');
    const [isSaving, setIsSaving] = useState(false);

    // --- ATUALIZAÇÃO O/H ---
    const { label: readingLabel, value: currentReadingValue, type: readingType } = getPrincipalReadingInfo(vehicle, vehicleGroups);
    // Leitura inicial: se estiver alocado, pega a de entrada; senão, pega a atual
    const initialReading = currentObraAllocation
                            ? (currentObraAllocation.details?.[`${readingType}Entrada`] || currentReadingValue)
                            : (currentReadingValue);
    // --- FIM ATUALIZAÇÃO ---

    const [readingValue, setReadingValue] = useState(initialReading.toString()); 

    const activeObras = useMemo(() => obras.filter(o => o.status === 'ativa').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);
    const availableEmployees = useMemo(() =>
        (employees || [])
            .filter(e => e.status !== 'inativo' && (e.funcao === 'Operador de Máquina' || e.funcao === 'Motorista')) 
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [employees]);

    const [isFinishObraModalOpen, setIsFinishObraModalOpen] = useState(false);
    const [obraToFinalize, setObraToFinalize] = useState(null);


    const handleAllocate = async () => {
        const readingFloat = parseFloat(readingValue);
        if (!obraId || !employeeId || readingValue === '' || isNaN(readingFloat)) {
            setAlertMessage(`Preencha a Obra, Funcionário e ${readingLabel} de Entrada.`);
            return;
        }
        const selectedEmployee = employees.find(e => e.id === employeeId);
        let employeeAllocationInfo = null;
        if (selectedEmployee?.alocadoEm) {
             if (typeof selectedEmployee.alocadoEm === 'string') {
                 try { employeeAllocationInfo = JSON.parse(selectedEmployee.alocadoEm); } catch {}
             } else {
                 employeeAllocationInfo = selectedEmployee.alocadoEm;
             }
             if (employeeAllocationInfo?.veiculoId && employeeAllocationInfo.veiculoId !== vehicle.id) {
                console.warn(`Atenção: ${selectedEmployee.nome} já está alocado em outro veículo/obra.`);
            }
        }
        setIsSaving(true);
        try {
            await apiClient.allocateVehicleToObra(vehicle.id, {
                obraId,
                employeeId,
                dataEntrada: dataEntrada, 
                readingType: readingType, // 'odometro' ou 'horimetro'
                readingValue: readingFloat
            });
            setAlertMessage("Veículo alocado com sucesso!");
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao alocar veículo:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao alocar o veículo.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeallocate = async (shouldFinalizeObra = false, dataFimObra = null) => {
        const readingFloat = parseFloat(readingValue);
         if (readingValue === '' || isNaN(readingFloat)) {
             setAlertMessage(`Preencha o ${readingLabel} de Saída.`);
             return;
         }
         const readingEntrada = (currentObraAllocation?.details?.[`${readingType}Entrada`] || 0);
         if (currentObraAllocation && readingFloat < readingEntrada) {
             setAlertMessage(`A leitura de saída (${readingFloat}) não pode ser menor que a leitura de entrada (${readingEntrada}).`);
             return;
         }

        setIsSaving(true);
        try {
            await apiClient.deallocateVehicleFromObra(vehicle.id, {
                dataSaida: dataSaida, 
                readingType: readingType,
                readingValue: readingFloat,
                location: locationAfterDeallocate, 
                shouldFinalizeObra: shouldFinalizeObra,
                dataFimObra: dataFimObra, 
                obraId: vehicle.obraAtualId 
            });
            setAlertMessage(`Veículo desalocado ${shouldFinalizeObra ? 'e obra finalizada' : ''} com sucesso!`);
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao desalocar veículo:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao desalocar o veículo.");
        } finally {
            setIsSaving(false);
        }
    };

    const checkAndDeallocate = () => {
        const obraData = obras.find(o => o.id === vehicle.obraAtualId);
        if (!obraData) { 
            handleDeallocate();
            return;
        }
        // Busca veículos alocados *agora* (pela prop 'vehicles')
        const otherActiveVehicles = vehicles.filter(v => v.id !== vehicle.id && v.obraAtualId === vehicle.obraAtualId);

        if (otherActiveVehicles.length === 0) { // Se este é o último
            setObraToFinalize(obraData);
            setIsFinishObraModalOpen(true); 
        } else {
            handleDeallocate(false); 
        }
    };


    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Alocação de Veículo em Obra</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                </div>
                <div className="p-6">
                     <p className="text-sm mb-4"><strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo} ({vehicle.placa})</p>
                    {currentObraAllocation ? (
                        <div className="space-y-4">
                            <p className="text-sm">Alocado na obra: <strong>{obras.find(o => o.id === vehicle.obraAtualId)?.nome || 'Desconhecida'}</strong>.</p>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Data de Saída *</label>
                                <input type="date" value={dataSaida} onChange={e => setDataSaida(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm" required/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">{readingLabel} de Saída *</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={readingValue} 
                                    onChange={e => setReadingValue(e.target.value)}
                                    className="mt-1 w-full p-2 border rounded-md text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Local de Disponibilidade após Saída *</label>
                                 <input
                                     type="text"
                                     value={locationAfterDeallocate}
                                     onChange={e => setLocationAfterDeallocate(e.target.value)}
                                     placeholder="Ex: Pátio MAK Lajeado"
                                     className="mt-1 w-full p-2 border rounded-md text-sm"
                                     required
                                 />
                            </div>
                            <button onClick={checkAndDeallocate} disabled={isSaving || !dataSaida || readingValue === '' || !locationAfterDeallocate} className="w-full px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-red-300 flex items-center justify-center gap-2 text-sm">
                                 {isSaving ? <><Loader className="animate-spin" size={18}/> Finalizando...</> : "Finalizar Alocação"}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Alocar na Obra *</label>
                                <select value={obraId} onChange={(e) => setObraId(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm bg-white" required>
                                    <option value="">Selecione...</option>
                                    {activeObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Alocar Funcionário *</label>
                                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm bg-white" required>
                                    <option value="">Selecione...</option>
                                    {availableEmployees.map(e => <option key={e.id} value={e.id}>{e.nome} ({e.funcao})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Data de Entrada *</label>
                                <input type="date" value={dataEntrada} onChange={e => setDataEntrada(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm" required/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">{readingLabel} de Entrada *</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={readingValue} 
                                    onChange={e => setReadingValue(e.target.value)}
                                    className="mt-1 w-full p-2 border rounded-md text-sm"
                                    required
                                />
                            </div>
                            <button onClick={handleAllocate} disabled={isSaving || !obraId || !employeeId || readingValue === ''} className="w-full px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm">
                                {isSaving ? <><Loader className="animate-spin" size={18}/> Alocando...</> : "Alocar Veículo"}
                            </button>
                        </div>
                    )}
                </div>
                 <div className="p-4 bg-gray-50 border-t flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Fechar</button>
                </div>
            </div>

            {isFinishObraModalOpen && (
                <FinishObraModal
                    obra={obraToFinalize}
                    onClose={() => {
                        setIsFinishObraModalOpen(false);
                        handleDeallocate(false); 
                    }}
                    onConfirm={(dataFim) => {
                        setIsFinishObraModalOpen(false); 
                        handleDeallocate(true, dataFim); 
                    }}
                />
            )}
        </div>
    );
};


// Modal para perguntar se deseja finalizar a obra (sem mudança)
const FinishObraModal = ({ obra, onClose, onConfirm }) => {
    const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4"> 
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-6 border-b">
                    <h2 className="text-xl font-bold">Finalizar Obra?</h2>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-gray-700 text-sm">Este é o último veículo ativo na obra "{obra?.nome || ''}". Deseja marcar a obra como finalizada ao desalocar este veículo?</p>
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Data de Finalização da Obra</label>
                        <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-full p-2 border rounded mt-1 text-sm" />
                    </div>
                </div>
                <div className="p-4 bg-gray-50 border-t flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Não, Manter Obra Ativa</button>
                    <button onClick={() => onConfirm(dataFim)} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 text-sm">Sim, Finalizar Obra</button>
                </div>
            </div>
        </div>
    );
};


// Modal de Histórico (Atualizado com O/H)
const HistoryModal = ({ vehicle, onClose, obras = [], vehicleGroups = {} }) => { 
    
    // --- ATUALIZAÇÃO O/H ---
    const { label: readingLabel, unit: readingUnit, type: readingType } = getPrincipalReadingInfo(vehicle, vehicleGroups);
    // --- FIM ATUALIZAÇÃO ---

    const history = useMemo(() => {
        if (!vehicle || !Array.isArray(vehicle.history)) return [];
        return [...vehicle.history].sort((a,b) => {
            const dateA = a.startDate ? new Date(a.startDate) : 0;
            const dateB = b.startDate ? new Date(b.startDate) : 0;
            return dateB - dateA; 
        });
    }, [vehicle]);

    const renderHistoryDetail = (h) => {
        const details = h.details || {};
         const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleString('pt-BR') : 'N/A';
        const startDate = formatDate(h.startDate);
        const endDate = h.endDate ? formatDate(h.endDate) : 'Presente';

        switch(h.historyType || h.type) { 
            case 'obra':
                 // --- ATUALIZAÇÃO O/H ---
                 // O 'readingType' vem da função helper (baseado no veículo)
                 const readingIn = details[`${readingType}Entrada`] ?? 'N/A';
                 const readingOut = details[`${readingType}Saida`] ?? 'N/A';
                 // --- FIM ATUALIZAÇÃO ---

                return (
                    <>
                        <p className="font-semibold">Alocação em Obra: {details.obraNome || 'Não informado'}</p>
                        <p className="text-xs text-gray-600 mt-0.5">Funcionário: {details.employeeName || 'Não informado'}</p>
                        <p className="text-xs text-gray-600">Período: {startDate} - {endDate}</p>
                        <p className="text-xs text-gray-500 mt-1">{readingLabel} Entrada: {readingIn}</p>
                        {h.endDate && <p className="text-xs text-gray-500">{readingLabel} Saída: {readingOut}</p>}
                    </>
                );
            case 'operacional':
                return (
                     <>
                        <p className="font-semibold">Alocação Operacional: {details.subGroup || 'Não informado'}</p>
                        <p className="text-xs text-gray-600 mt-0.5">Funcionário: {details.employeeName || 'Não informado'}</p>
                        <p className="text-xs text-gray-600">Período: {startDate} - {endDate}</p>
                        {details.observacoes && <p className="text-xs text-gray-500 italic mt-1">Obs: "{details.observacoes}"</p>}
                    </>
                );
            case 'manutencao':
                 return (
                     <>
                        <p className="font-semibold">Manutenção</p>
                        <p className="text-xs text-gray-600 mt-0.5">Período: {startDate} - {endDate}</p>
                        {details && typeof details === 'string' && <p className="text-xs text-gray-500 mt-1">{details}</p>}
                         {details && typeof details === 'object' && details.details && <p className="text-xs text-gray-500 mt-1">{details.details}</p>}
                    </>
                );
            default:
                return <p className="text-xs italic text-gray-400">Registro de tipo: {h.historyType || h.type || 'Desconhecido'}</p>;
        }
    };

    const getHistoryStyle = (type) => {
         const historyType = type || 'desconhecido'; 
        switch(historyType.toLowerCase()) {
            case 'obra': return 'bg-green-50 border-l-4 border-green-500';
            case 'operacional': return 'bg-blue-50 border-l-4 border-blue-500';
            case 'manutencao': return 'bg-red-50 border-l-4 border-red-500';
            default: return 'bg-gray-100 border-l-4 border-gray-400';
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold">Histórico Completo do Veículo</h2>
                        <p className="text-gray-600 text-sm">{vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo}</p>
                    </div>
                     <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={18}/></button>
                </div>
                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    {history.length > 0 ? (
                        <ul className="space-y-3">
                            {history.map((h, index) => (
                                <li key={h.id || `${vehicle.id}-${h.startDate || index}`} className={`p-3 rounded-r-lg ${getHistoryStyle(h.historyType || h.type)}`}>
                                    {renderHistoryDetail(h)}
                                </li>
                             ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500 text-center italic">Nenhum histórico encontrado para este veículo.</p>
                    )}
                </div>
                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};


export default VehiclePage;