import React, { useState, useEffect, useMemo } from 'react';
import apiClient from '../services/apiClient'; 
import {
    HardHat, Users, Wrench, ShieldAlert, Edit, Clock, Trash2, PlusCircle, Upload, Download, ChevronsUpDown, TrafficCone, Info, AlertTriangle, UserCheck
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

const VehiclePage = ({ user, vehicles = [], obras = [], revisions = [], employees = [], fines = [], navigate, setAlertMessage, initialFilter, PasswordConfirmationModal, ConfirmationModal, vehicleGroups = {}, operationalSubGroups = [], apiClient, reloadData }) => {
    
    // Lista de tipos única e ordenada
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

    // Veículo em foco
    const [itemToDelete, setItemToDelete] = useState(null);
    const [editingVehicle, setEditingVehicle] = useState(null);
    const [vehicleForAction, setVehicleForAction] = useState(null); // Genérico para modais de ação

    // Filtros
    const [filters, setFilters] = useState({ type: 'todos', status: 'todos', search: '', group: 'todos' });
    const [sortConfig, setSortConfig] = useState({ key: 'registroInterno', direction: 'ascending' });

    useEffect(() => { if (initialFilter) { setFilters(prev => ({ ...prev, ...initialFilter })); } }, [initialFilter]);
    const handleFilterChange = (e) => { const { name, value } = e.target; setFilters(prev => ({ ...prev, [name]: value })); };

    // --- Processamento de Dados (Visual) ---
    const processedVehicles = useMemo(() => {
        return (vehicles || []).map(v => {
             const obra = v.obraAtualId ? obras.find(o => o.id === v.obraAtualId) : null;
             const readingData = getVehicleMainReading(v);
             const formattedReading = `${readingData.value ?? 0} ${readingData.unit}`;
             
             // REQ 4: Verifica restrições para gerar alertas
             const restrictions = checkVehicleRestrictions(v, revisions);
             
            return { 
                ...v, 
                obra, 
                vehicleReading: formattedReading,
                vehicleReadingRaw: readingData.raw,
                restrictions // Array de problemas
            };
        });
    }, [vehicles, obras, revisions]); 

    // --- Ordenação (REQ 5: Alfabética/Padrão) ---
    const sortedVehicles = useMemo(() => {
        let items = [...processedVehicles];
        if (sortConfig.key) {
            items.sort((a, b) => {
                if (sortConfig.key === 'vehicleReading') {
                     return sortConfig.direction === 'ascending' 
                        ? (a.vehicleReadingRaw - b.vehicleReadingRaw) 
                        : (b.vehicleReadingRaw - a.vehicleReadingRaw);
                }
                const valA = String(a[sortConfig.key] || '').toLowerCase();
                const valB = String(b[sortConfig.key] || '').toLowerCase();
                return sortConfig.direction === 'ascending' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            });
        }
        return items;
    }, [processedVehicles, sortConfig]); 

    const requestSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending'
        }));
    };

    // --- Lógica Visual de Alertas ---
    const getRowStyle = (vehicle) => {
        // REQ 7: Visual Diferente para Terceiros
        if (vehicle.isThirdParty) {
            return { className: 'bg-purple-50 border-l-4 border-purple-500', isThirdParty: true };
        }

        // Verifica bloqueios ou avisos
        const hasCritical = vehicle.restrictions.some(r => r.type === 'bloqueio' || r.type === 'vencido');
        const hasWarning = vehicle.restrictions.some(r => r.type === 'aviso');

        if (hasCritical) return { className: 'bg-red-50 border-l-4 border-red-500' };
        if (hasWarning) return { className: 'bg-yellow-50 border-l-4 border-yellow-400' };

        return { className: 'bg-white hover:bg-gray-50' };
    };

    // Filtragem Final
    const filteredVehicles = useMemo(() => sortedVehicles.filter(v => {
        const groups = vehicleGroups || {};
        const searchLower = filters.search.toLowerCase();
        
        const searchMatch = (v.placa || '').toLowerCase().includes(searchLower) ||
                            (v.registroInterno || '').toLowerCase().includes(searchLower) ||
                            (v.marca || '').toLowerCase().includes(searchLower);
        
        const typeMatch = filters.type === 'todos' || v.tipo === filters.type;
        const statusMatch = filters.status === 'todos' || v.status === filters.status;
        const groupMatch = filters.group === 'todos' || (groups[filters.group] && groups[filters.group].includes(v.tipo));
        
        return searchMatch && typeMatch && statusMatch && groupMatch;
    }), [sortedVehicles, filters, vehicleGroups]);

    // Actions
    const handleDelete = async () => {
        if (!itemToDelete) return;
        try {
            await apiClient.deleteVehicle(itemToDelete.id);
            setAlertMessage('Veículo excluído com sucesso.');
            reloadData(); 
        } catch (error) {
            setAlertMessage('Erro ao excluir: ' + error.message);
        } finally {
            setIsDeleteModalOpen(false);
        }
    };

    const handleMaintenance = (v) => {
        if (v.obraAtualId || v.operationalAssignment) {
            setAlertMessage('Veículo alocado! Desaloque antes de enviar para manutenção.');
            return;
        }
        setVehicleForAction(v);
        setIsMaintenanceModalOpen(true);
    };

    return (
        <div className="container mx-auto p-4 md:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                    <Truck className="text-yellow-500" /> Gestão de Frota
                </h1>
                <ProtectedComponent requiredPermission="editor">
                    <div className="flex gap-2">
                        <button onClick={() => { setEditingVehicle(null); setIsModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-gray-900 font-bold rounded-lg shadow hover:bg-yellow-500 transition">
                            <PlusCircle size={18} /> Novo Veículo
                        </button>
                    </div>
                </ProtectedComponent>
            </div>

            {/* Filtros */}
            <div className="mb-6 bg-white p-4 rounded-lg shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
                <input name="search" placeholder="Buscar por Placa ou Registro..." value={filters.search} onChange={handleFilterChange} className="border rounded-lg px-3 py-2 focus:ring-2 focus:ring-yellow-400 outline-none" />
                <select name="group" value={filters.group} onChange={handleFilterChange} className="border rounded-lg px-3 py-2 bg-white">
                    <option value="todos">Todos os Grupos</option>
                    {Object.keys(vehicleGroups).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <select name="status" value={filters.status} onChange={handleFilterChange} className="border rounded-lg px-3 py-2 bg-white">
                    <option value="todos">Todos os Status</option>
                    {['Disponível', 'Em Obra', 'Em Operação', 'Em Manutenção'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="flex items-center justify-end text-sm text-gray-500">
                    {filteredVehicles.length} veículos encontrados
                </div>
            </div>

            {/* Tabela */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="grid grid-cols-12 bg-gray-100 p-3 font-bold text-xs text-gray-600 uppercase tracking-wider border-b">
                    <div className="col-span-4 cursor-pointer hover:text-black" onClick={() => requestSort('registroInterno')}>Veículo <ChevronsUpDown size={12} className="inline"/></div>
                    <div className="col-span-2 md:block hidden cursor-pointer" onClick={() => requestSort('placa')}>Placa</div>
                    <div className="col-span-2 text-right md:block hidden cursor-pointer" onClick={() => requestSort('vehicleReading')}>Leitura</div>
                    <div className="col-span-2 text-center md:block hidden cursor-pointer" onClick={() => requestSort('status')}>Status</div>
                    <div className="col-span-2 text-center">Ações</div>
                </div>

                {filteredVehicles.map(vehicle => {
                    const rowStyle = getRowStyle(vehicle);
                    const alertMsg = vehicle.restrictions.map(r => r.message).join('\n');
                    const hasAlert = vehicle.restrictions.length > 0;
                    
                    const apiBaseUrl = (process.env.REACT_APP_API_URL || 'http://localhost:3001/api').replace('/api', '');
                    const imageUrl = vehicle.fotoURL 
                        ? (vehicle.fotoURL.startsWith('http') ? vehicle.fotoURL : `${apiBaseUrl}${vehicle.fotoURL}`)
                        : 'https://placehold.co/80x60/e2e8f0/cbd5e0?text=Sem+Foto';

                    return (
                        <div key={vehicle.id} className={`grid grid-cols-1 md:grid-cols-12 gap-2 p-3 items-center border-b hover:shadow-md transition-all ${rowStyle.className} relative`}>
                            
                            {/* Coluna 1: Info Principal */}
                            <div className="col-span-4 flex items-center gap-3">
                                <div className="relative shrink-0 cursor-pointer" onClick={() => { setVehicleForAction(vehicle); setIsDetailModalOpen(true); }}>
                                    <img src={imageUrl} alt={vehicle.modelo} className="w-16 h-12 object-cover rounded shadow-sm" />
                                    {/* Icone de Alerta Flutuante */}
                                    {hasAlert && (
                                        <div className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow border border-white z-10" title={alertMsg}>
                                            <AlertTriangle size={12} />
                                        </div>
                                    )}
                                </div>
                                <div className="overflow-hidden">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-900 text-sm">{vehicle.registroInterno}</span>
                                        {vehicle.isThirdParty && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 font-bold">TERCEIRO</span>}
                                    </div>
                                    <p className="text-xs text-gray-600 truncate">{vehicle.marca} {vehicle.modelo}</p>
                                    <p className="text-[10px] text-gray-400 uppercase">{vehicle.tipo}</p>
                                </div>
                            </div>

                            {/* Coluna 2: Placa */}
                            <div className="col-span-2 md:block hidden text-sm font-mono text-gray-700">{vehicle.placa}</div>

                            {/* Coluna 3: Leitura */}
                            <div className="col-span-2 md:block hidden text-right text-sm font-semibold text-gray-800">{vehicle.vehicleReading}</div>

                            {/* Coluna 4: Status */}
                            <div className="col-span-2 md:block flex justify-between items-center">
                                <span className="md:hidden text-xs font-bold text-gray-500">Status:</span>
                                <div className={`text-center text-xs px-2 py-1 rounded-full font-bold truncate 
                                    ${vehicle.status === 'Disponível' ? 'bg-green-100 text-green-700' : 
                                      vehicle.status === 'Em Manutenção' ? 'bg-red-100 text-red-700' : 
                                      'bg-blue-100 text-blue-700'}`}>
                                    {vehicle.status}
                                </div>
                            </div>

                            {/* Coluna 5: Ações */}
                            <div className="col-span-2 flex justify-center gap-1">
                                <button onClick={() => { setVehicleForAction(vehicle); setIsHistoryModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded" title="Histórico"><Clock size={16}/></button>
                                <button onClick={() => { setVehicleForAction(vehicle); setIsFinesModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-gray-100 rounded" title="Multas"><ShieldAlert size={16}/></button>
                                
                                <ProtectedComponent requiredPermission="editor">
                                    <button onClick={() => { setEditingVehicle(vehicle); setIsModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded" title="Editar"><Edit size={16}/></button>
                                    
                                    {/* Botões Dinâmicos de Alocação */}
                                    {vehicle.status === 'Disponível' && (
                                        <>
                                            <button onClick={() => { setVehicleForAction(vehicle); setIsObraAllocationModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-gray-100 rounded" title="Alocar Obra"><HardHat size={16}/></button>
                                            <button onClick={() => { setVehicleForAction(vehicle); setIsOperationalModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded" title="Alocar Operação"><Users size={16}/></button>
                                            <button onClick={() => handleMaintenance(vehicle)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded" title="Manutenção"><Wrench size={16}/></button>
                                        </>
                                    )}
                                    {vehicle.status === 'Em Obra' && (
                                        <button onClick={() => { setVehicleForAction(vehicle); setIsObraAllocationModalOpen(true); }} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded" title="Desalocar"><HardHat size={16}/></button>
                                    )}
                                </ProtectedComponent>

                                <ProtectedComponent requiredPermission="admin">
                                    <button onClick={() => { setItemToDelete(vehicle); setIsDeleteModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded" title="Excluir"><Trash2 size={16}/></button>
                                </ProtectedComponent>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* --- MODAIS --- */}
            
            {/* Modal de Edição/Criação (Passando PasswordConfirmationModal) */}
            {isModalOpen && (
                <VehicleModal 
                    user={user} 
                    vehicle={editingVehicle} 
                    vehicles={vehicles} 
                    vehicleTypes={vehicleTypes} 
                    onClose={() => setIsModalOpen(false)} 
                    setAlertMessage={setAlertMessage} 
                    apiClient={apiClient} 
                    reloadData={reloadData} 
                    vehicleGroups={vehicleGroups} 
                    PasswordConfirmationModal={PasswordConfirmationModal} // IMPORTANTE: Passando a prop
                />
            )}

            {/* Outros Modais (Mantidos) */}
            {isObraAllocationModalOpen && (
                <ObraAllocationModal 
                    user={user} 
                    vehicle={vehicleForAction} 
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
                    vehicle={vehicleForAction} 
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

            {isMaintenanceModalOpen && <MaintenanceModal user={user} vehicle={vehicleForAction} onClose={() => setIsMaintenanceModalOpen(false)} apiClient={apiClient} setAlertMessage={setAlertMessage} reloadData={reloadData} />}
            {isHistoryModalOpen && <HistoryModal vehicle={vehicleForAction} onClose={() => setIsHistoryModalOpen(false)} obras={obras} />}
            {isDetailModalOpen && <VehicleDetailModal vehicle={vehicleForAction} revision={revisions.find(r => r.vehicleId === vehicleForAction?.id)} onClose={() => setIsDetailModalOpen(false)} vehicleGroups={vehicleGroups} />}
            {isFinesModalOpen && <VehicleFinesModal vehicle={vehicleForAction} fines={fines} onClose={() => setIsFinesModalOpen(false)} />}
            
            {isDeleteModalOpen && (
                <PasswordConfirmationModal 
                    message={`Tem certeza que deseja excluir o veículo ${itemToDelete?.registroInterno}?`} 
                    onConfirm={handleDelete} 
                    onClose={() => setIsDeleteModalOpen(false)} 
                    apiClient={apiClient} 
                />
            )}
        </div>
    );
};

export default VehiclePage;