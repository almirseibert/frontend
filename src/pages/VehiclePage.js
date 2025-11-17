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
    AlertTriangle
} from 'lucide-react';

import ProtectedComponent from '../components/ProtectedComponent';
// Importa todos os modais extraídos
import VehicleModal from '../components/VehicleModal'; 
import MaintenanceModal from '../components/MaintenanceModal';
import VehicleFinesModal from '../components/VehicleFinesModal';
import VehicleDetailModal from '../components/VehicleDetailModal';
import OperationalAssignmentModal from '../components/OperationalAssignmentModal';
import ObraAllocationModal from '../components/ObraAllocationModal';
import HistoryModal from '../components/HistoryModal';
// import { PasswordConfirmationModal, ConfirmationModal } from '../App'; // Assumindo que vêm do App.js

// --- PÁGINA DE VEÍCULOS ---
const VehiclePage = ({ user, vehicles = [], obras = [], revisions = [], employees = [], fines = [], navigate, setAlertMessage, initialFilter, PasswordConfirmationModal, ConfirmationModal, vehicleGroups = {}, operationalSubGroups = [], apiClient, reloadData }) => {
    // Lista de tipos de veículos (pode vir do backend no futuro)
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

    // Aplica filtro inicial
    useEffect(() => { if (initialFilter) { setFilters(prev => ({ ...prev, ...initialFilter })); } }, [initialFilter]);
    const handleFilterChange = (e) => { const { name, value } = e.target; setFilters(prev => ({ ...prev, [name]: value })); };

    // Veículos processados com status consistente e regras O/H
    const processedVehicles = useMemo(() => {
        return (vehicles || []).map(v => {
            // Status
            let currentStatus = v.status;
            if (!currentStatus) {
                if (v.obraAtualId) currentStatus = 'Em Obra';
                else if (v.operationalAssignment) currentStatus = 'Em Operação';
                else if (v.maintenanceLocation) currentStatus = 'Em Manutenção';
                else currentStatus = 'Disponível';
            }
             // Obra
             const obra = v.obraAtualId ? obras.find(o => o.id === v.obraAtualId) : null;
             
             // --- LÓGICA DE LEITURA PRINCIPAL (NOVAS REGRAS O/H) ---
             const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
             const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(v.tipo));
             
             let vehicleReading = 'N/A';
             let readingSuffix = '';

             if (vehicleGroup === 'Máquinas Pesadas') {
                 // Regra: Máquinas Pesadas usam Horímetro (Digital > Analógico > Legado)
                 vehicleReading = v.horimetroDigital ?? v.horimetroAnalogico ?? v.horimetro ?? 'N/A';
                 readingSuffix = ' Hr';
             } else if (vehicleGroup === 'Caminhões') {
                 if (v.tipo === 'Caminhões Prancha') {
                     // Exceção: Caminhão de Trecho usa Odômetro
                     vehicleReading = v.odometro ?? v.horimetro ?? 'N/A'; 
                     readingSuffix = v.odometro != null ? ' Km' : (v.horimetro != null ? ' Hr' : '');
                 } else {
                     // Padrão: Caminhão usa Horímetro
                     vehicleReading = v.horimetro ?? v.odometro ?? 'N/A';
                     readingSuffix = v.horimetro != null ? ' Hr' : (v.odometro != null ? ' Km' : '');
                 }
             } else { // Leves ou outros
                 vehicleReading = v.odometro ?? 'N/A';
                 readingSuffix = ' Km';
             }
             
             const formattedReading = vehicleReading === 'N/A' ? 'N/A' : `${vehicleReading}${readingSuffix}`;
             // --- FIM LÓGICA LEITURA ---

            return { ...v, status: currentStatus, obra, vehicleReading: formattedReading };
        }).filter(Boolean);
    }, [vehicles, obras, vehicleGroups]);

    // Ordena os veículos processados
    const sortedVehicles = useMemo(() => {
        let sortableItems = [...processedVehicles];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                // Ordenação numérica para leituras
                if (sortConfig.key === 'vehicleReading') {
                     const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
                     
                     const getSortableReading = (v) => {
                        const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(v.tipo));
                        if (vehicleGroup === 'Máquinas Pesadas') {
                            return v.horimetroDigital ?? v.horimetroAnalogico ?? v.horimetro ?? 0;
                        } else if (vehicleGroup === 'Caminhões') {
                            if (v.tipo === 'Caminhões Prancha') {
                                return v.odometro ?? v.horimetro ?? 0;
                            } else {
                                return v.horimetro ?? v.odometro ?? 0;
                            }
                        } else {
                            return v.odometro ?? 0;
                        }
                     };
                     
                     const numA = getSortableReading(a);
                     const numB = getSortableReading(b);
                     const comparison = (numA || 0) - (numB || 0);
                     return sortConfig.direction === 'ascending' ? comparison : -comparison;
                }
                
                // Ordenação de string para outros campos
                const valA = a[sortConfig.key] ?? '';
                const valB = b[sortConfig.key] ?? '';
                const comparison = String(valA).toLowerCase().localeCompare(String(valB).toLowerCase());
                return sortConfig.direction === 'ascending' ? comparison : -comparison;
            });
        }
        return sortableItems;
    }, [processedVehicles, sortConfig, vehicleGroups]); 


    // Função para requisitar ordenação
    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // Calcula status da revisão (com regras O/H)
    const getRevisionStatus = (vehicle) => {
        const revision = (revisions || []).find(r => r.vehicleId === vehicle.id);
        if (!revision) return { status: 'ok', text: '' }; 

        const now = new Date();
        const proximaData = revision.proximaRevisaoData ? new Date(revision.proximaRevisaoData) : null;

        const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
        const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(vehicle.tipo));
        
        let currentReading = 0;
        // --- APLICA NOVAS REGRAS O/H ---
        if(vehicleGroup === 'Máquinas Pesadas') {
            currentReading = vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro ?? 0;
        } else if(vehicleGroup === 'Caminhões') {
            if (vehicle.tipo === 'Caminhões Prancha') {
                currentReading = vehicle.odometro ?? 0;
            } else {
                currentReading = vehicle.horimetro ?? 0;
            }
        } else { // Leves
            currentReading = vehicle.odometro ?? 0;
        }
        // --- FIM REGRAS O/H ---

        const proximoOdometro = revision.proximaRevisaoOdometro || 0; 
        const avisoKmHr = revision.avisoAntecedenciaKmHr || 0;
        const avisoDias = revision.avisoAntecedenciaDias || 0;

        // Vencidos
        if (proximoOdometro > 0 && currentReading >= proximoOdometro) return { status: 'danger', text: 'Leitura Vencida' };
        if (proximaData && now >= proximaData) return { status: 'danger', text: 'Data Vencida' };

        // Próximos
        if (proximoOdometro > 0 && avisoKmHr > 0 && currentReading >= proximoOdometro - avisoKmHr) return { status: 'warning', text: 'Leitura Próxima' };
        if (proximaData && avisoDias > 0) {
            const warningDate = new Date(proximaData);
            warningDate.setDate(warningDate.getDate() - avisoDias);
            if (now >= warningDate) return { status: 'warning', text: 'Data Próxima' };
        }

        return { status: 'ok', text: '' };
    };


    // Memoiza veículos com multas pendentes
    const vehiclesWithPendingFines = useMemo(() => {
        const vehicleIds = new Set();
        (fines || []).forEach(fine => {
            if (fine.status === 'Pendente') {
                vehicleIds.add(fine.vehicleId);
            }
        });
        return vehicleIds;
    }, [fines]);

    // Define classe da linha
    const getVehicleRowClass = (vehicle) => {
        if (vehicle.canCirculate === false) {
            return 'bg-red-100 border-l-4 border-red-500'; 
        }
        const revisionInfo = getRevisionStatus(vehicle);
        const revisionStatusClasses = { ok: '', warning: 'bg-yellow-50', danger: 'bg-red-50' };
        return revisionStatusClasses[revisionInfo.status];
    };

    // Filtra os veículos ordenados
    const filteredVehicles = useMemo(() => sortedVehicles.filter(v => {
        const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
        const searchMatch = (v.placa || '').toLowerCase().includes(filters.search.toLowerCase()) ||
                            (v.registroInterno || '').toLowerCase().includes(filters.search.toLowerCase()) ||
                            (v.marca || '').toLowerCase().includes(filters.search.toLowerCase()) ||
                            (v.modelo || '').toLowerCase().includes(filters.search.toLowerCase());
        const typeMatch = filters.type === 'todos' || v.tipo === filters.type;
        const statusMatch = filters.status === 'todos' || v.status === filters.status;
        const groupMatch = filters.group === 'todos' || (groups[filters.group] && groups[filters.group].includes(v.tipo));
        return searchMatch && typeMatch && statusMatch && groupMatch;
    }), [sortedVehicles, filters, vehicleGroups]);

    // Funções para abrir modais
    const openModal = (v = null) => { setEditingVehicle(v); setIsModalOpen(true); };
    const openObraAllocationModal = (v) => { setVehicleForObraAllocation(v); setIsObraAllocationModalOpen(true); };
    const openOperationalModal = (v) => { setVehicleForOperational(v); setIsOperationalModalOpen(true); };
    const openHistoryModal = (v) => { setVehicleForHistory(v); setIsHistoryModalOpen(true); };
    const openDeleteModal = (id) => { setItemToDelete({id}); setIsDeleteModalOpen(true); };
    const openDetailModal = (v) => { setVehicleForDetail(v); setIsDetailModalOpen(true); };
    const openFinesModal = (v) => { setVehicleForFines(v); setIsFinesModalOpen(true); };

    // Abre modal de manutenção
    const handleMaintenanceClick = (vehicle) => {
        if (vehicle.obraAtualId || vehicle.operationalAssignment) {
            setAlertMessage('Este veículo está alocado. Desaloque-o primeiro para enviá-lo para manutenção.');
            return;
        }
        setVehicleForMaintenance(vehicle);
        setIsMaintenanceModalOpen(true);
    };

    // Função de exclusão
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

    // Upload CSV
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
                    // Adicione outros mapeamentos...
                };
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
                             if (['odometro', 'horimetro', 'horimetroDigital', 'horimetroAnalogico', 'fuelCapacity'].includes(apiKey)) {
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

                setAlertMessage(`Importando ${data.length} veículos...`);
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
            reader.onerror = () => setAlertMessage("Erro ao ler o arquivo CSV.");
            reader.readAsText(file);
        }
        event.target.value = null;
    };


    // Exportar CSV
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
             if (typeof value === 'boolean') return value ? 'true' : 'false';
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

    // ... Renderização principal ...
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

             {/* Filtros */}
            <div className="mb-6 p-4 bg-white rounded-lg shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                <input type="text" name="search" placeholder="Buscar Placa, Registro, Marca..." value={filters.search} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg bg-gray-50 focus:ring-yellow-500" />
                <select name="group" value={filters.group} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg bg-gray-50 focus:ring-yellow-500">
                    <option value="todos">Todos os Grupos</option>
                    {(vehicleGroups && typeof vehicleGroups === 'object' ? Object.keys(vehicleGroups) : []).map(group => <option key={group} value={group}>{group}</option>)}
                    <option value="Outros">Outros</option>
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

            {/* Tabela de Veículos */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                {/* Cabeçalho Tabela Desktop */}
                <div className="hidden md:grid grid-cols-7 gap-4 p-4 font-semibold text-xs text-gray-600 border-b bg-gray-50 uppercase tracking-wider">
                    <div className="col-span-2 cursor-pointer hover:text-gray-900" onClick={() => requestSort('registroInterno')}>Veículo <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="cursor-pointer hover:text-gray-900" onClick={() => requestSort('placa')}>Placa <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="cursor-pointer hover:text-gray-900" onClick={() => requestSort('registroInterno')}>Registro <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="text-right cursor-pointer hover:text-gray-900" onClick={() => requestSort('vehicleReading')}>Leitura <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="cursor-pointer hover:text-gray-900" onClick={() => requestSort('status')}>Status <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="text-center">Ações</div>
                </div>
                {/* Linhas da Tabela (Mobile First) */}
                {filteredVehicles.map(vehicle => {
                    const revisionInfo = getRevisionStatus(vehicle);
                    const hasPendingFine = vehiclesWithPendingFines.has(vehicle.id);
                    // Classes de status
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
                    
                    const apiBaseUrl = (process.env.REACT_APP_API_URL || 'http://localhost:3001/api').replace('/api', '');
                    const imageUrl = vehicle.fotoURL 
                        ? (vehicle.fotoURL.startsWith('http') ? vehicle.fotoURL : `${apiBaseUrl}${vehicle.fotoURL}`)
                        : 'https://placehold.co/80x60/e2e8f0/cbd5e0?text=S/Foto';

                    return (
                        <div key={vehicle.id} className={`grid grid-cols-1 md:grid-cols-7 gap-2 md:gap-4 items-center p-3 md:p-4 border-b last:border-b-0 hover:bg-gray-50 text-sm ${getVehicleRowClass(vehicle)}`}>
                            {/* Coluna Veículo (com imagem) */}
                            <div className="md:col-span-2 flex items-center gap-3">
                                <div className="relative shrink-0">
                                    <button onClick={() => openDetailModal(vehicle)} className="cursor-pointer block">
                                        <img
                                            src={imageUrl} 
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
                                </div>
                            </div>
                            {/* Placa */}
                            <div className="text-gray-700 md:block hidden">{vehicle.placa}</div>
                            {/* Registro */}
                            <div className="text-gray-700 md:block hidden">{vehicle.registroInterno}</div>
                            {/* Leitura */}
                            <div className="text-gray-700 text-right md:block hidden">{vehicle.vehicleReading}</div>
                             {/* Status */}
                            <div>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${statusClasses[vehicle.status] || 'bg-gray-100 text-gray-800'}`}>
                                    {statusText}
                                </span>
                            </div>
                            {/* Ações */}
                            <div className="flex flex-wrap gap-1 justify-start md:justify-center items-center">
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

            {/* Modais (agora importados) */}
            {isModalOpen && <VehicleModal user={user} vehicle={editingVehicle} vehicles={vehicles} vehicleTypes={vehicleTypes} onClose={() => setIsModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} vehicleGroups={vehicleGroups} />}
            {isObraAllocationModalOpen && <ObraAllocationModal user={user} vehicle={vehicleForObraAllocation} obras={obras} employees={employees} onClose={() => setIsObraAllocationModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} vehicles={vehicles} vehicleGroups={vehicleGroups} />}
            {isOperationalModalOpen && <OperationalAssignmentModal user={user} vehicle={vehicleForOperational} employees={employees} onClose={() => setIsOperationalModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} operationalSubGroups={operationalSubGroups} />}
            {isHistoryModalOpen && <HistoryModal vehicle={vehicleForHistory} onClose={() => setIsHistoryModalOpen(false)} obras={obras} />}
            {isDeleteModalOpen && <PasswordConfirmationModal message="Tem certeza que deseja excluir este veículo? Todas as revisões associadas também serão removidas." onConfirm={handleDelete} onClose={() => setIsDeleteModalOpen(false)} apiClient={apiClient} />}
            {isDetailModalOpen && <VehicleDetailModal vehicle={vehicleForDetail} revision={revisions.find(r => r.vehicleId === vehicleForDetail?.id)} onClose={() => setIsDetailModalOpen(false)} vehicleGroups={vehicleGroups} />}
            {isFinesModalOpen && <VehicleFinesModal vehicle={vehicleForFines} fines={fines} onClose={() => setIsFinesModalOpen(false)} />}
            {isMaintenanceModalOpen && <MaintenanceModal user={user} vehicle={vehicleForMaintenance} onClose={() => setIsMaintenanceModalOpen(false)} apiClient={apiClient} setAlertMessage={setAlertMessage} reloadData={reloadData} />}
        </div>
    );
};

// --- MODAIS FORAM MOVIDOS PARA /components ---

export default VehiclePage;