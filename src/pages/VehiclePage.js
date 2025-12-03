import React, { useState, useEffect, useMemo } from 'react';
import {
    HardHat, Users, Wrench, ShieldAlert, Edit, Clock, Trash2, PlusCircle, 
    Upload, Download, ChevronsUpDown, Info, AlertTriangle, Briefcase, Truck
} from 'lucide-react';

import ProtectedComponent from '../components/ProtectedComponent';
import VehicleModal from '../components/VehicleModal'; 
import MaintenanceModal from '../components/MaintenanceModal';
import VehicleFinesModal from '../components/VehicleFinesModal'; 
import VehicleDetailModal from '../components/VehicleDetailModal';
import OperationalAssignmentModal from '../components/OperationalAssignmentModal';
import ObraAllocationModal from '../components/ObraAllocationModal';
import HistoryModal from '../components/HistoryModal';

import { getVehicleMainReading, checkVehicleRestrictions } from '../utils/vehicleRules';

const VehiclePage = ({ user, vehicles = [], obras = [], revisions = [], employees = [], fines = [], setAlertMessage, initialFilter, PasswordConfirmationModal, vehicleGroups = {}, operationalSubGroups = [], apiClient, reloadData }) => {
    
    // --- Configurações Iniciais ---
    const vehicleTypes = useMemo(() => {
        const existingTypes = (vehicles || []).map(v => v.tipo).filter(Boolean);
        const predefinedTypes = Object.values(vehicleGroups || {}).flat();
        return [...new Set([...existingTypes, ...predefinedTypes])].sort();
    }, [vehicles, vehicleGroups]);

    // --- Estados ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isObraAllocationModalOpen, setIsObraAllocationModalOpen] = useState(false);
    const [isOperationalModalOpen, setIsOperationalModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isFinesModalOpen, setIsFinesModalOpen] = useState(false);
    const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);

    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [filters, setFilters] = useState({ type: 'todos', status: 'todos', search: '', group: 'todos' });
    
    // Regra 5: Ordenação Padrão Alfabética
    const [sortConfig, setSortConfig] = useState({ key: 'registroInterno', direction: 'ascending' });

    useEffect(() => { if (initialFilter) { setFilters(prev => ({ ...prev, ...initialFilter })); } }, [initialFilter]);
    const handleFilterChange = (e) => { const { name, value } = e.target; setFilters(prev => ({ ...prev, [name]: value })); };

    // --- Processamento de Dados (Regra 4: Alertas e Status) ---
    const processedVehicles = useMemo(() => {
        return (vehicles || []).map(v => {
            let currentStatus = v.status;
            // Normaliza status
            if (!currentStatus || currentStatus === 'Disponível') {
                if (v.obraAtualId) currentStatus = 'Em Obra';
                else if (v.operationalAssignment) currentStatus = 'Em Operação';
                else if (v.maintenanceLocation) currentStatus = 'Em Manutenção';
                else currentStatus = 'Disponível';
            }
             
             const readingData = getVehicleMainReading(v);
             // Verifica restrições (Regra 4)
             const restrictions = checkVehicleRestrictions(v, revisions);
             
             // Encontra a obra se existir
             const obra = v.obraAtualId ? obras.find(o => o.id === v.obraAtualId) : null;

            return { 
                ...v, 
                computedStatus: currentStatus,
                obra, // Anexa o objeto obra para uso no display
                vehicleReading: `${readingData.value ?? 'N/A'} ${readingData.unit}`,
                vehicleReadingRaw: readingData.raw,
                restrictions: restrictions // Array de problemas
            };
        });
    }, [vehicles, revisions, obras]); 

    // --- Filtragem e Ordenação ---
    const filteredVehicles = useMemo(() => {
        let items = processedVehicles.filter(v => {
            const groups = vehicleGroups || {};
            const searchLower = filters.search.toLowerCase();
            
            const searchMatch = (v.placa || '').toLowerCase().includes(searchLower) ||
                                (v.registroInterno || '').toLowerCase().includes(searchLower) ||
                                (v.marca || '').toLowerCase().includes(searchLower) ||
                                (v.modelo || '').toLowerCase().includes(searchLower);
            
            const typeMatch = filters.type === 'todos' || v.tipo === filters.type;
            const statusMatch = filters.status === 'todos' || v.computedStatus === filters.status;
            const groupMatch = filters.group === 'todos' || (groups[filters.group] && groups[filters.group].includes(v.tipo));
            
            return searchMatch && typeMatch && statusMatch && groupMatch;
        });

        // Ordenação
        items.sort((a, b) => {
            if (sortConfig.key === 'vehicleReading') {
                 return sortConfig.direction === 'ascending' 
                    ? (a.vehicleReadingRaw - b.vehicleReadingRaw) 
                    : (b.vehicleReadingRaw - a.vehicleReadingRaw);
            }
            const valA = String(a[sortConfig.key] || '').toLowerCase();
            const valB = String(b[sortConfig.key] || '').toLowerCase();
            
            // Ordem numérica inteligente para registros (ex: RE1 < RE10)
            const numA = parseInt(valA.replace(/\D/g, '')) || 0;
            const numB = parseInt(valB.replace(/\D/g, '')) || 0;
            
            if (valA.startsWith('re') && valB.startsWith('re') && numA !== numB) {
                return sortConfig.direction === 'ascending' ? numA - numB : numB - numA;
            }

            return sortConfig.direction === 'ascending' 
                ? valA.localeCompare(valB) 
                : valB.localeCompare(valA);
        });

        return items;
    }, [processedVehicles, filters, vehicleGroups, sortConfig]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
        setSortConfig({ key, direction });
    };

    // --- Helpers Visuais ---
    const getRowStyle = (vehicle) => {
        // Regra 7: Terceirizados
        if (vehicle.isOutsourced) return 'bg-purple-50 hover:bg-purple-100 border-l-4 border-purple-500';
        
        // Alertas de Regra 4
        const critical = vehicle.restrictions.some(r => r.type === 'bloqueio' || r.type === 'vencido');
        const warning = vehicle.restrictions.some(r => r.type === 'aviso');

        if (critical) return 'bg-red-50 hover:bg-red-100 border-l-4 border-red-500';
        if (warning) return 'bg-yellow-50 hover:bg-yellow-100 border-l-4 border-yellow-400';

        return 'bg-white hover:bg-gray-50 border-l-4 border-transparent'; // Padrão
    };

    // --- Ações ---
    const handleEdit = (v) => { setSelectedVehicle(v); setIsModalOpen(true); };
    const handleNew = () => { setSelectedVehicle(null); setIsModalOpen(true); };
    const handleDelete = async () => {
        try {
            await apiClient.deleteVehicle(selectedVehicle.id);
            setAlertMessage('Veículo excluído com sucesso.');
            reloadData(); 
        } catch (error) {
            setAlertMessage('Erro ao excluir: ' + error.message);
        } finally {
            setIsDeleteModalOpen(false);
        }
    };
    
    // Exportar CSV
    const exportToCSV = () => {
        const headers = ['Registro', 'Placa', 'Marca', 'Modelo', 'Tipo', 'Leitura', 'Status', 'Terceiro?'];
        const rows = filteredVehicles.map(v => [
            v.registroInterno, v.placa, v.marca, v.modelo, v.tipo, v.vehicleReading, v.computedStatus, v.isOutsourced ? 'SIM' : 'NÃO'
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(","))].join("\n");
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", "veiculos_frotasmak.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const truncateText = (text, limit = 22) => {
        if (!text) return '';
        if (text.length <= limit) return text;
        return text.substring(0, limit) + '...';
    };

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                        <Truck className="text-yellow-500"/> Gestão da Frota
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Gerencie veículos, máquinas e caminhões.</p>
                </div>
                
                <ProtectedComponent requiredPermission="editor">
                    <div className="flex gap-2">
                        <button onClick={exportToCSV} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg shadow-sm hover:bg-gray-50 transition text-sm">
                            <Download size={18} /> CSV
                        </button>
                        <button onClick={handleNew} className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-gray-900 font-bold rounded-lg shadow-md hover:bg-yellow-500 transition text-sm transform hover:-translate-y-0.5">
                            <PlusCircle size={18} /> Novo Veículo
                        </button>
                    </div>
                </ProtectedComponent>
            </div>

             {/* Filtros */}
            <div className="mb-6 p-4 bg-white rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                <input type="text" name="search" placeholder="🔍 Buscar Placa, Registro..." value={filters.search} onChange={handleFilterChange} className="w-full px-4 py-2.5 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-yellow-400 outline-none transition" />
                <select name="group" value={filters.group} onChange={handleFilterChange} className="w-full px-4 py-2.5 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-yellow-400 outline-none cursor-pointer">
                    <option value="todos">📂 Todos os Grupos</option>
                    {Object.keys(vehicleGroups).map(g => <option key={g} value={g}>{g}</option>)}
                 </select>
                <select name="type" value={filters.type} onChange={handleFilterChange} className="w-full px-4 py-2.5 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-yellow-400 outline-none cursor-pointer">
                    <option value="todos">🚜 Todos os Tipos</option>
                    {vehicleTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select name="status" value={filters.status} onChange={handleFilterChange} className="w-full px-4 py-2.5 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-yellow-400 outline-none cursor-pointer">
                    <option value="todos">📊 Todos os Status</option>
                    {['Disponível', 'Em Obra', 'Em Operação', 'Em Manutenção'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>

            {/* Tabela Restaurada */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="hidden md:grid grid-cols-12 gap-4 p-4 font-semibold text-xs text-gray-600 border-b bg-gray-50 uppercase tracking-wider items-center">
                    <div className="col-span-4 cursor-pointer hover:text-gray-900" onClick={() => requestSort('registroInterno')}>Veículo <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="col-span-1 cursor-pointer hover:text-gray-900" onClick={() => requestSort('placa')}>Placa <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="col-span-1 cursor-pointer hover:text-gray-900" onClick={() => requestSort('registroInterno')}>Reg. <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="col-span-2 text-right cursor-pointer hover:text-gray-900" onClick={() => requestSort('vehicleReading')}>Leitura <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="col-span-2 text-center cursor-pointer hover:text-gray-900" onClick={() => requestSort('status')}>Status<ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="col-span-2 text-center">Ações</div>
                </div>

                <div className="divide-y divide-gray-100">
                    {filteredVehicles.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">Nenhum veículo encontrado.</div>
                    ) : filteredVehicles.map(vehicle => {
                        const statusColors = {
                            'Em Manutenção': 'bg-red-100 text-red-800',
                            'Aguardando Manutenção': 'bg-red-100 text-red-800 animate-pulse', // Restaurado
                            'Em Obra': 'bg-green-100 text-green-800',
                            'Em Operação': 'bg-blue-100 text-blue-800',
                            'Disponível': 'bg-gray-100 text-gray-800'
                        };
                        
                        // Lógica restaurada para texto de status com localização
                        const statusText = vehicle.computedStatus === 'Disponível'
                            ? `${vehicle.computedStatus} - ${vehicle.localizacaoAtual || 'Pátio'}`
                            : vehicle.computedStatus === 'Em Obra' && vehicle.obra
                                ? `Obra: ${vehicle.obra.nome}`
                                : vehicle.computedStatus;

                        const hasCritical = vehicle.restrictions.some(r => r.type === 'bloqueio' || r.type === 'vencido');
                        
                        return (
                            <div key={vehicle.id} className={`grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 items-center p-3 md:p-4 transition-all ${getRowStyle(vehicle)}`}>
                                {/* Info Veículo */}
                                <div className="md:col-span-4 flex items-center gap-3">
                                    <div className="relative shrink-0 cursor-pointer group" onClick={() => { setSelectedVehicle(vehicle); setIsDetailModalOpen(true); }}>
                                        <div className="w-16 h-12 bg-gray-200 rounded-md overflow-hidden shadow-sm">
                                            <img src={vehicle.fotoURL ? (vehicle.fotoURL.startsWith('http') ? vehicle.fotoURL : `${(process.env.REACT_APP_API_URL || '').replace('/api','')}${vehicle.fotoURL}`) : 'https://placehold.co/100?text=Foto'} 
                                                 alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform"/>
                                        </div>
                                        {hasCritical && (
                                            <div className="absolute -top-2 -left-2 bg-red-500 text-white rounded-full p-1 shadow-lg animate-bounce" title="Atenção Necessária">
                                                <AlertTriangle size={12} fill="white" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="overflow-hidden">
                                        <div className="flex items-center gap-2">
                                            <span className="font-extrabold text-gray-900 text-base">{vehicle.registroInterno}</span>
                                            {vehicle.isOutsourced && <span className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded border border-purple-200 font-bold uppercase">Terceiro</span>}
                                        </div>
                                        <p className="text-sm text-gray-600 font-medium truncate" title={`${vehicle.marca} ${vehicle.modelo}`}>{vehicle.marca} {vehicle.modelo}</p>
                                        <p className="text-xs text-gray-400">{vehicle.tipo}</p>
                                    </div>
                                </div>

                                <div className="md:col-span-1 text-sm font-mono text-gray-700 md:block hidden truncate" title={vehicle.placa}>
                                    {vehicle.placa}
                                </div>
                                <div className="md:col-span-1 text-sm font-mono text-gray-700 md:block hidden truncate">
                                    {vehicle.registroInterno}
                                </div>

                                <div className="md:col-span-2 text-right text-sm font-bold text-gray-800 md:block flex justify-between">
                                    <span className="md:hidden font-bold text-gray-500">Leitura:</span>
                                    {vehicle.vehicleReading}
                                </div>

                                <div className="md:col-span-2 flex justify-center md:justify-center justify-between items-center">
                                    <span className="md:hidden font-bold text-gray-500 text-sm">Status:</span>
                                    <div className={`px-2 py-0.5 rounded-full text-xs font-semibold inline-block whitespace-nowrap max-w-full truncate ${statusColors[vehicle.computedStatus] || 'bg-gray-100 text-gray-800'}`} title={statusText}>
                                        {truncateText(statusText, 25)}
                                    </div>
                                </div>

                                {/* Botões de Ação - Atualizado para flex-wrap */}
                                <div className="md:col-span-2 flex flex-wrap gap-1 justify-start md:justify-center items-center">
                                    <button onClick={() => { setSelectedVehicle(vehicle); setIsFinesModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-md transition" title="Multas"><ShieldAlert size={14}/></button>
                                    <button onClick={() => { setSelectedVehicle(vehicle); setIsHistoryModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition" title="Histórico"><Clock size={14}/></button>
                                    
                                    <ProtectedComponent requiredPermission="editor">
                                        <button onClick={() => handleEdit(vehicle)} className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-md transition" title="Editar"><Edit size={14}/></button>
                                        
                                        {/* Ações Dinâmicas */}
                                        {vehicle.computedStatus === 'Disponível' && (
                                            <>
                                                <button onClick={() => { setSelectedVehicle(vehicle); setIsObraAllocationModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-md transition" title="Alocar Obra"><HardHat size={14}/></button>
                                                <button onClick={() => { setSelectedVehicle(vehicle); setIsOperationalModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-md transition" title="Alocar Operação"><Users size={14}/></button>
                                                <button onClick={() => { setSelectedVehicle(vehicle); setIsMaintenanceModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition" title="Manutenção"><Wrench size={14}/></button>
                                            </>
                                        )}
                                        {vehicle.computedStatus === 'Em Obra' && (
                                            <button onClick={() => { setSelectedVehicle(vehicle); setIsObraAllocationModalOpen(true); }} className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-md transition border border-red-200" title="Desalocar"><HardHat size={14}/></button>
                                        )}
                                        {vehicle.computedStatus === 'Em Operação' && (
                                            <button onClick={() => { setSelectedVehicle(vehicle); setIsOperationalModalOpen(true); }} className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-md transition border border-red-200" title="Desalocar"><Users size={14}/></button>
                                        )}
                                        {(vehicle.computedStatus === 'Em Manutenção' || vehicle.computedStatus === 'Aguardando Manutenção') && (
                                            <button onClick={() => { setSelectedVehicle(vehicle); setIsMaintenanceModalOpen(true); }} className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-md transition border border-green-200" title="Finalizar"><Wrench size={14}/></button>
                                        )}
                                    </ProtectedComponent>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* --- Modais --- */}
            {isModalOpen && <VehicleModal user={user} vehicle={selectedVehicle} vehicles={vehicles} onClose={() => setIsModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} PasswordConfirmationModal={PasswordConfirmationModal} />}
            
            {isObraAllocationModalOpen && (
                <ObraAllocationModal user={user} vehicle={selectedVehicle} obras={obras} employees={employees} revisions={revisions} onClose={() => setIsObraAllocationModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} vehicles={vehicles} PasswordConfirmationModal={PasswordConfirmationModal} />
            )}
            
            {isOperationalModalOpen && (
                <OperationalAssignmentModal user={user} vehicle={selectedVehicle} employees={employees} revisions={revisions} onClose={() => setIsOperationalModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} operationalSubGroups={operationalSubGroups} PasswordConfirmationModal={PasswordConfirmationModal} />
            )}

            {isHistoryModalOpen && <HistoryModal vehicle={selectedVehicle} onClose={() => setIsHistoryModalOpen(false)} obras={obras} />}
            {isDetailModalOpen && <VehicleDetailModal vehicle={selectedVehicle} revision={revisions.find(r => r.vehicleId === selectedVehicle?.id)} onClose={() => setIsDetailModalOpen(false)} vehicleGroups={vehicleGroups} />}
            {isFinesModalOpen && <VehicleFinesModal vehicle={selectedVehicle} fines={fines} onClose={() => setIsFinesModalOpen(false)} />}
            {isMaintenanceModalOpen && <MaintenanceModal user={user} vehicle={selectedVehicle} onClose={() => setIsMaintenanceModalOpen(false)} apiClient={apiClient} setAlertMessage={setAlertMessage} reloadData={reloadData} />}
            
            {isDeleteModalOpen && (
                <PasswordConfirmationModal 
                    message={`Tem certeza que deseja excluir o veículo ${selectedVehicle?.registroInterno}? Esta ação é irreversível.`} 
                    onConfirm={handleDelete} 
                    onClose={() => setIsDeleteModalOpen(false)} 
                    apiClient={apiClient} 
                />
            )}
        </div>
    );
};

export default VehiclePage;