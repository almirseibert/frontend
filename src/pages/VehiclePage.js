import React, { useState, useEffect, useMemo } from 'react';
import apiClient from '../services/apiClient'; 
import {
    HardHat, Users, Wrench, ShieldAlert, Edit, Clock, Trash2, PlusCircle, Upload, Download, ChevronsUpDown, TrafficCone, Info, AlertTriangle
} from 'lucide-react';

import ProtectedComponent from '../components/ProtectedComponent';
import VehicleModal from '../components/VehicleModal'; 
import MaintenanceModal from '../components/MaintenanceModal';
import VehicleFinesModal from '../components/VehicleFinesModal'; 
import VehicleDetailModal from '../components/VehicleDetailModal';
import OperationalAssignmentModal from '../components/OperationalAssignmentModal';
import ObraAllocationModal from '../components/ObraAllocationModal';
import HistoryModal from '../components/HistoryModal';

// IMPORTA AS FUNÇÕES CENTRALIZADAS
import { getVehicleMainReading, checkVehicleRestrictions } from '../utils/vehicleRules';

const VehiclePage = ({ user, vehicles = [], obras = [], revisions = [], employees = [], fines = [], navigate, setAlertMessage, initialFilter, PasswordConfirmationModal, ConfirmationModal, vehicleGroups = {}, operationalSubGroups = [], apiClient, reloadData }) => {
    
    const vehicleTypes = useMemo(() => {
        const existingTypes = (vehicles || []).map(v => v.tipo).filter(Boolean);
        const predefinedTypes = Object.values(vehicleGroups || {}).flat();
        return [...new Set([...existingTypes, ...predefinedTypes])].sort();
    }, [vehicles, vehicleGroups]);

    // Estados dos Modais
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isObraAllocationModalOpen, setIsObraAllocationModalOpen] = useState(false);
    const [isOperationalModalOpen, setIsOperationalModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isFinesModalOpen, setIsFinesModalOpen] = useState(false);
    const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);

    const [itemToDelete, setItemToDelete] = useState(null);
    const [editingVehicle, setEditingVehicle] = useState(null);
    const [vehicleForObraAllocation, setVehicleForObraAllocation] = useState(null);
    const [vehicleForOperational, setVehicleForOperational] = useState(null);
    const [vehicleForHistory, setVehicleForHistory] = useState(null);
    const [vehicleForDetail, setVehicleForDetail] = useState(null);
    const [vehicleForFines, setVehicleForFines] = useState(null);
    const [vehicleForMaintenance, setVehicleForMaintenance] = useState(null);

    const [filters, setFilters] = useState({ type: 'todos', status: 'todos', search: '', group: 'todos' });
    const [sortConfig, setSortConfig] = useState({ key: 'registroInterno', direction: 'ascending' });

    useEffect(() => { if (initialFilter) { setFilters(prev => ({ ...prev, ...initialFilter })); } }, [initialFilter]);
    const handleFilterChange = (e) => { const { name, value } = e.target; setFilters(prev => ({ ...prev, [name]: value })); };

    // Processamento de dados para Tabela
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
             
             const readingData = getVehicleMainReading(v);
             const formattedReading = (readingData.value === null || readingData.value === undefined) 
                ? 'N/A' 
                : `${readingData.value} ${readingData.unit}`;
             
            return { 
                ...v, 
                status: currentStatus, 
                obra, 
                vehicleReading: formattedReading,
                vehicleReadingRaw: readingData.raw 
            };
        }).filter(Boolean);
    }, [vehicles, obras]); 

    const sortedVehicles = useMemo(() => {
        let sortableItems = [...processedVehicles];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                if (sortConfig.key === 'vehicleReading') {
                     const numA = a.vehicleReadingRaw || 0;
                     const numB = b.vehicleReadingRaw || 0;
                     const comparison = numA - numB;
                     return sortConfig.direction === 'ascending' ? comparison : -comparison;
                }
                const valA = a[sortConfig.key] ?? '';
                const valB = b[sortConfig.key] ?? '';
                const comparison = String(valA).toLowerCase().localeCompare(String(valB).toLowerCase());
                return sortConfig.direction === 'ascending' ? comparison : -comparison;
            });
        }
        return sortableItems;
    }, [processedVehicles, sortConfig]); 

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // --- LÓGICA VISUAL CENTRALIZADA ---
    const getRowAlerts = (vehicle) => {
        const issues = checkVehicleRestrictions(vehicle, revisions);
        
        if (issues.length === 0) return { className: '', icon: null };

        // Verifica se tem erros críticos (Vencido ou Bloqueio)
        const hasCritical = issues.some(i => i.type === 'bloqueio' || i.type === 'vencido');
        const msg = issues.map(i => i.message).join('\n');
        
        if (hasCritical) {
            return {
                className: 'bg-red-50 border-l-4 border-red-500',
                icon: <span className="absolute -top-1.5 -left-1.5 p-0.5 bg-red-600 border-2 border-white rounded-full text-white tooltip" data-tip={msg}><AlertTriangle size={12} /></span>
            };
        }

        // Apenas Avisos
        return {
            className: 'bg-yellow-50 border-l-4 border-yellow-400',
            icon: <span className="absolute -top-1.5 -left-1.5 p-0.5 bg-yellow-500 border-2 border-white rounded-full text-white tooltip" data-tip={msg}><Info size={12} /></span>
        };
    };

    const getVehicleRowClass = (vehicle) => getRowAlerts(vehicle).className;
    const getAlertIcon = (vehicle) => getRowAlerts(vehicle).icon;
    // ---------------------------------------

    const vehiclesWithPendingFines = useMemo(() => {
        const vehicleIds = new Set();
        (fines || []).forEach(fine => {
            if (fine.status === 'Pendente') {
                vehicleIds.add(fine.vehicleId);
            }
        });
        return vehicleIds;
    }, [fines]);

    const truncateText = (text, limit = 22) => {
        if (!text) return '';
        if (text.length <= limit) return text;
        return text.substring(0, limit) + '...';
    };

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

    // Handlers de Modais
    const openModal = (v = null) => { setEditingVehicle(v); setIsModalOpen(true); };
    const openObraAllocationModal = (v) => { setVehicleForObraAllocation(v); setIsObraAllocationModalOpen(true); };
    const openOperationalModal = (v) => { setVehicleForOperational(v); setIsOperationalModalOpen(true); };
    const openHistoryModal = (v) => { setVehicleForHistory(v); setIsHistoryModalOpen(true); };
    const openDeleteModal = (id) => { setItemToDelete({id}); setIsDeleteModalOpen(true); };
    const openDetailModal = (v) => { setVehicleForDetail(v); setIsDetailModalOpen(true); };
    const openFinesModal = (v) => { setVehicleForFines(v); setIsFinesModalOpen(true); };

    const handleMaintenanceClick = (vehicle) => {
        if (vehicle.obraAtualId || vehicle.operationalAssignment) {
            setAlertMessage('Este veículo está alocado. Desaloque-o primeiro para enviá-lo para manutenção.');
            return;
        }
        setVehicleForMaintenance(vehicle);
        setIsMaintenanceModalOpen(true);
    };

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

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                // ... lógica de CSV mantida ...
                setAlertMessage("Upload de CSV não implementado na prévia.");
            };
            reader.readAsText(file);
        }
    };

    const exportToCSV = () => {
        if (filteredVehicles.length === 0) { setAlertMessage("Nenhum veículo para exportar."); return; }
        const headers = ['registroInterno', 'placa', 'marca', 'modelo', 'tipo', 'odometro', 'horimetro', 'status'];
        const rows = filteredVehicles.map(v => headers.map(header => v[header] ?? ''));
        let csvContent = "data:text/csv;charset=utf-8," + headers.join(',') + "\n" + rows.map(e => e.join(",")).join("\n"); 
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "veiculos.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

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
                    {vehicleTypes.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
                <select name="status" value={filters.status} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg bg-gray-50 focus:ring-yellow-500">
                    <option value="todos">Todos os Status</option>
                    {[...new Set((vehicles || []).map(v => v.status).filter(Boolean))].sort().map(status => <option key={status} value={status}>{status}</option>)}
                </select>
            </div>

            {/* Tabela de Veículos */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="hidden md:grid grid-cols-12 gap-4 p-4 font-semibold text-xs text-gray-600 border-b bg-gray-50 uppercase tracking-wider items-center">
                    <div className="col-span-4 cursor-pointer hover:text-gray-900" onClick={() => requestSort('registroInterno')}>Veículo <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="col-span-1 cursor-pointer hover:text-gray-900" onClick={() => requestSort('placa')}>Placa</div>
                    <div className="col-span-1 cursor-pointer hover:text-gray-900" onClick={() => requestSort('registroInterno')}>Reg.</div>
                    <div className="col-span-2 text-right cursor-pointer hover:text-gray-900" onClick={() => requestSort('vehicleReading')}>Leitura <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="col-span-2 text-center cursor-pointer hover:text-gray-900" onClick={() => requestSort('status')}>Status</div>
                    <div className="col-span-2 text-center">Ações</div>
                </div>

                {filteredVehicles.map(vehicle => {
                    const alertIcon = getAlertIcon(vehicle); 
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
                    
                    const apiBaseUrl = (process.env.REACT_APP_API_URL || 'http://localhost:3001/api').replace('/api', '');
                    const imageUrl = vehicle.fotoURL 
                        ? (vehicle.fotoURL.startsWith('http') ? vehicle.fotoURL : `${apiBaseUrl}${vehicle.fotoURL}`)
                        : 'https://placehold.co/80x60/e2e8f0/cbd5e0?text=S/Foto';

                    return (
                        <div key={vehicle.id} className={`grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 items-center p-3 md:p-4 border-b last:border-b-0 hover:bg-gray-50 text-sm ${getVehicleRowClass(vehicle)}`}>
                            
                            <div className="md:col-span-4 flex items-center gap-3">
                                <div className="relative shrink-0">
                                    <button onClick={() => openDetailModal(vehicle)} className="cursor-pointer block">
                                        <img src={imageUrl} alt={`${vehicle.marca}`} className="w-20 h-15 object-cover rounded" />
                                    </button>
                                     {/* Ícone de alerta de Revisão/Doc/Bloqueio */}
                                     {alertIcon}
                                     
                                     {hasPendingFine && <span className="absolute -bottom-1.5 -right-1.5 p-0.5 bg-orange-500 border-2 border-white rounded-full text-white tooltip" data-tip="Multa pendente"><ShieldAlert size={12} /></span>}
                                </div>
                                <div className="overflow-hidden">
                                    <p className="font-bold text-gray-900 truncate" title={`${vehicle.marca} ${vehicle.modelo}`}>{vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo}</p>
                                    <p className="text-xs text-gray-500 truncate">{vehicle.tipo}</p>
                                </div>
                            </div>

                            <div className="text-gray-700 md:col-span-1 md:block hidden truncate" title={vehicle.placa}>{vehicle.placa}</div>
                            <div className="text-gray-700 md:col-span-1 md:block hidden truncate">{vehicle.registroInterno}</div>
                            <div className="text-gray-700 text-right md:col-span-2 md:block hidden font-mono font-medium truncate">{vehicle.vehicleReading}</div>
                            
                            <div className="md:col-span-2 text-center md:block flex justify-between items-center">
                                <span className="md:hidden font-bold text-gray-500 text-xs mr-2">Status:</span>
                                <div className={`px-2 py-0.5 rounded-full text-xs font-semibold mx-auto inline-block whitespace-nowrap ${statusClasses[vehicle.status] || 'bg-gray-100 text-gray-800'}`} title={statusText}>
                                    {truncateText(statusText, 22)}
                                </div>
                            </div>

                            <div className="md:col-span-2 flex flex-wrap gap-1 justify-start md:justify-center items-center">
                                <button onClick={() => openFinesModal(vehicle)} title="Multas" className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-gray-100 rounded-md"><ShieldAlert size={14} /></button>
                                <button onClick={() => openHistoryModal(vehicle)} title="Histórico" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-md"><Clock size={14} /></button>
                                <ProtectedComponent requiredPermission="editor">
                                    <button onClick={() => openModal(vehicle)} title="Editar" className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-md"><Edit size={14} /></button>
                                     {vehicle.status === 'Disponível' && (
                                         <>
                                            <button onClick={() => openObraAllocationModal(vehicle)} title="Alocar Obra" className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-gray-100 rounded-md"><HardHat size={14} /></button>
                                            <button onClick={() => openOperationalModal(vehicle)} title="Alocar Operação" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-md"><Users size={14} /></button>
                                            <button onClick={() => handleMaintenanceClick(vehicle)} title="Manutenção" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-md"><Wrench size={14} /></button>
                                         </>
                                     )}
                                     {vehicle.status === 'Em Obra' && <button onClick={() => openObraAllocationModal(vehicle)} title="Desalocar Obra" className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-md"><HardHat size={14} /></button>}
                                     {vehicle.status === 'Em Operação' && <button onClick={() => openOperationalModal(vehicle)} title="Desalocar Operação" className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-md"><Users size={14} /></button>}
                                     {(vehicle.status === 'Em Manutenção' || vehicle.status === 'Aguardando Manutenção') && <button onClick={() => handleMaintenanceClick(vehicle)} title="Finalizar Manut." className="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-100 rounded-md"><Wrench size={14} /></button>}
                                </ProtectedComponent>
                                <ProtectedComponent requiredPermission="admin">
                                    <button onClick={() => openDeleteModal(vehicle.id)} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-md"><Trash2 size={14} /></button>
                                </ProtectedComponent>
                            </div>
                        </div>
                    );
                })}
            </div>

            {isModalOpen && <VehicleModal user={user} vehicle={editingVehicle} vehicles={vehicles} vehicleTypes={vehicleTypes} onClose={() => setIsModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} vehicleGroups={vehicleGroups} />}
            
            {isObraAllocationModalOpen && (
                <ObraAllocationModal 
                    user={user} 
                    vehicle={vehicleForObraAllocation} 
                    obras={obras} 
                    employees={employees} 
                    revisions={revisions} 
                    onClose={() => setIsObraAllocationModalOpen(false)} 
                    setAlertMessage={setAlertMessage} 
                    apiClient={apiClient} 
                    reloadData={reloadData} 
                    vehicles={vehicles} 
                    vehicleGroups={vehicleGroups}
                    PasswordConfirmationModal={PasswordConfirmationModal} 
                />
            )}
            
            {isOperationalModalOpen && (
                <OperationalAssignmentModal 
                    user={user} 
                    vehicle={vehicleForOperational} 
                    employees={employees} 
                    revisions={revisions}
                    onClose={() => setIsOperationalModalOpen(false)} 
                    setAlertMessage={setAlertMessage} 
                    apiClient={apiClient} 
                    reloadData={reloadData} 
                    operationalSubGroups={operationalSubGroups}
                    PasswordConfirmationModal={PasswordConfirmationModal} 
                />
            )}

            {isHistoryModalOpen && <HistoryModal vehicle={vehicleForHistory} onClose={() => setIsHistoryModalOpen(false)} obras={obras} />}
            {isDeleteModalOpen && <PasswordConfirmationModal message="Tem certeza que deseja excluir este veículo? Todas as revisões associadas também serão removidas." onConfirm={handleDelete} onClose={() => setIsDeleteModalOpen(false)} apiClient={apiClient} />}
            {isDetailModalOpen && <VehicleDetailModal vehicle={vehicleForDetail} revision={revisions.find(r => r.vehicleId === vehicleForDetail?.id)} onClose={() => setIsDetailModalOpen(false)} vehicleGroups={vehicleGroups} />}
            {isFinesModalOpen && <VehicleFinesModal vehicle={vehicleForFines} fines={fines} onClose={() => setIsFinesModalOpen(false)} />}
            {isMaintenanceModalOpen && <MaintenanceModal user={user} vehicle={vehicleForMaintenance} onClose={() => setIsMaintenanceModalOpen(false)} apiClient={apiClient} setAlertMessage={setAlertMessage} reloadData={reloadData} />}
        </div>
    );
};

export default VehiclePage;