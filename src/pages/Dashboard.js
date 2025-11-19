import React, { useState, useEffect, useMemo } from 'react';
import {
    Building, Truck, HardHat, Users, CheckCircle, Wrench,
    ShieldAlert, Bell, Badge, TrendingUp, TrendingDown,
    Filter, Info, AlertTriangle, Clock, X, Loader, MapPin,
    Activity, Maximize2
} from 'lucide-react';
import apiClient from '../services/apiClient'; 

// --- IMPORTS DO MAPA ---
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- CORREÇÃO DE ÍCONES DO LEAFLET ---
const fixLeafletIcon = () => {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
};
fixLeafletIcon();

// ===================================================================================
// COMPONENTE: MODAL DE MAPA EXPANDIDO
// ===================================================================================
const ExpandedMapModal = ({ obras, vehicles, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full h-full max-w-7xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <MapPin className="text-blue-600" /> Mapa de Alocação Expandido
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
                        <X size={24} />
                    </button>
                </div>
                <div className="flex-1 relative">
                    <AllocationMap obras={obras} vehicles={vehicles} isExpanded={true} />
                </div>
            </div>
        </div>
    );
};

// ===================================================================================
// COMPONENTE: MODAL DE INATIVIDADE
// ===================================================================================
const InactivityAlertModal = ({ alert, onClose, onObserve, onProlong, apiClient, setAlertMessage }) => {
    const [prolongDays, setProlongDays] = useState(7);
    const [observation, setObservation] = useState(alert.observation || '');
    const [isSaving, setIsSaving] = useState(false);

    const { obra, operator, vehicle } = alert;

    const handleObserve = async () => {
        if (!observation) {
            setAlertMessage("Por favor, adicione uma observação antes de marcar como observado.");
            return;
        }
        setIsSaving(true);
        try {
            await apiClient.updateInactivityAlert(alert.id, {
                status: 'Observado',
                observation,
                dismissedAt: new Date().toISOString(),
            });
            setAlertMessage("Alerta marcado como observado.");
            onObserve();
        } catch (error) {
            console.error("Erro ao marcar como observado via API:", error);
            setAlertMessage(error.message || "Falha ao marcar como observado.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleProlong = async () => {
        const days = parseInt(prolongDays, 10);
        if (isNaN(days) || days <= 0) {
            setAlertMessage("Por favor, insira um número de dias válido maior que zero.");
            return;
        }

        setIsSaving(true);
        try {
            const newAlertUntilDate = new Date();
            newAlertUntilDate.setDate(newAlertUntilDate.getDate() + days);

            await apiClient.updateInactivityAlert(alert.id, {
                status: 'Prolongado',
                observation: observation || `Prolongado por ${days} dia(s).`,
                prolongedUntil: newAlertUntilDate.toISOString(),
                prolongedByDays: days,
            });
            setAlertMessage(`Alerta prolongado por ${days} dia(s).`);
            onProlong();
        } catch (error) {
            console.error("Erro ao prorrogar alerta via API:", error);
            setAlertMessage(error.message || "Falha ao prorrogar alerta.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                <div className="p-6 border-b flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold">Alerta de Inatividade</h2>
                        <p className="text-gray-600 font-semibold">{vehicle?.registroInterno} - {vehicle?.modelo}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 text-yellow-800 border border-yellow-200">
                        <Info size={24} className="flex-shrink-0"/>
                        <p className="font-medium text-sm">Este veículo está alocado em obra ({obra?.nome || 'N/A'}) e não foi abastecido nos últimos 7 dias.</p>
                    </div>
                    <p className="text-sm"><strong>Último Abastecimento:</strong> {alert.lastRefuelingDate ? new Date(alert.lastRefuelingDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</p>
                    <p className="text-sm"><strong>Obra Atual:</strong> {obra?.nome || 'Não especificada'}</p>
                    <p className="text-sm"><strong>Operador Designado:</strong> {operator?.nome || 'Não especificado'}</p>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Observação *</label>
                        <textarea
                            value={observation}
                            onChange={e => setObservation(e.target.value)}
                            rows="3"
                            className="w-full p-2 border rounded mt-1 bg-gray-50 focus:ring-yellow-500 focus:border-yellow-500 text-sm"
                            placeholder="Ex: 'em espera devido a tempo chuvoso'"
                            required
                        />
                    </div>

                    <div className="flex items-end gap-2 pt-2 border-t border-gray-200">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700">Prolongar Aviso por (dias)</label>
                            <input
                                type="number"
                                value={prolongDays}
                                onChange={e => setProlongDays(e.target.value)}
                                min="1"
                                className="w-full p-2 border rounded mt-1 bg-gray-50 focus:ring-yellow-500 focus:border-yellow-500 text-sm"
                            />
                        </div>
                        <button onClick={handleProlong} disabled={isSaving || !prolongDays || prolongDays <= 0} className="px-3 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 disabled:bg-blue-300 flex items-center gap-1 text-sm">
                            {isSaving ? <Loader size={16} className="animate-spin"/> : <Clock size={16}/>}
                            {isSaving ? '...' : 'Prolongar'}
                        </button>
                    </div>
                </div>
                <div className="p-4 bg-gray-50 border-t flex justify-end gap-4">
                    <button onClick={handleObserve} disabled={isSaving || !observation} className="px-4 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 disabled:bg-green-300 flex items-center gap-1 text-sm">
                         {isSaving ? <Loader size={16} className="animate-spin"/> : <CheckCircle size={16}/>}
                        {isSaving ? '...' : 'Marcar Observado'}
                    </button>
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm" disabled={isSaving}>Fechar</button>
                </div>
            </div>
        </div>
    );
};

// ===================================================================================
// COMPONENTE: MAPA DE ALOCAÇÃO (Versão Real)
// ===================================================================================
const AllocationMap = ({ obras = [], vehicles = [], isExpanded = false }) => {
    // Filtra apenas obras ativas que possuem coordenadas válidas
    const validObras = useMemo(() => {
        return obras.filter(o => 
            o.status === 'ativa' && 
            o.latitude && 
            o.longitude && 
            !isNaN(parseFloat(o.latitude)) && 
            !isNaN(parseFloat(o.longitude))
        );
    }, [obras]);

    // Retorna a lista de veículos ativos na obra
    const getActiveVehiclesList = (obraId) => {
        if (!Array.isArray(obras)) return [];
        const obra = obras.find(o => o.id === obraId);
        if (!obra || !Array.isArray(obra.historicoVeiculos)) return [];
        
        // Filtra veículos ativos (sem dataSaida) e mapeia para o formato desejado
        return obra.historicoVeiculos
            .filter(h => !h.dataSaida)
            .map(h => {
                const vehicle = vehicles.find(v => v.id === h.veiculoId);
                return vehicle ? `${vehicle.tipo} - ${vehicle.registroInterno}` : 'Veículo Desconhecido';
            });
    };

    // Centro do mapa: Aproximadamente o centro do Rio Grande do Sul ou Santa Maria
    const mapCenter = [-29.6914, -53.8008]; 

    return (
        <div className="h-full w-full rounded-xl overflow-hidden relative z-0">
            <MapContainer 
                center={mapCenter} 
                zoom={isExpanded ? 8 : 7} 
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={isExpanded} // Permite zoom com scroll apenas se expandido
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                
                {validObras.map(obra => {
                    const activeVehiclesList = getActiveVehiclesList(obra.id);
                    return (
                        <Marker 
                            key={obra.id} 
                            position={[parseFloat(obra.latitude), parseFloat(obra.longitude)]}
                        >
                            <Popup className="custom-popup">
                                <div className="min-w-[200px]">
                                    <div className="border-b pb-1 mb-2">
                                        <strong className="block text-sm text-gray-900 uppercase">{obra.nome}</strong>
                                        <span className="text-xs text-gray-500">{obra.cliente || 'Cliente N/A'}</span>
                                    </div>
                                    
                                    <div className="text-xs">
                                        <div className="font-semibold mb-1 text-blue-700">
                                            {activeVehiclesList.length} Veículo(s) Ativo(s):
                                        </div>
                                        {activeVehiclesList.length > 0 ? (
                                            <ul className="list-disc list-inside space-y-0.5 text-gray-700 max-h-32 overflow-y-auto custom-scrollbar">
                                                {activeVehiclesList.map((vStr, idx) => (
                                                    <li key={idx}>{vStr}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <span className="text-gray-400 italic">Nenhum veículo no momento.</span>
                                        )}
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}

                {validObras.length === 0 && (
                     <div className="absolute bottom-4 left-4 bg-white/90 p-2 rounded shadow text-xs text-gray-600 z-[1000]">
                        Nenhuma obra com coordenadas cadastradas.
                    </div>
                )}
            </MapContainer>
        </div>
    );
};

// ===================================================================================
// COMPONENTE: RANKING DE CONSUMO (ATUALIZADO: Listas Lado a Lado)
// ===================================================================================
const FuelEfficiencyRanking = ({ vehicles = [], refuelings = [], vehicleGroups = {} }) => {
    const [selectedType, setSelectedType] = useState('todos');
    const [selectedVehicleId, setSelectedVehicleId] = useState('');

    const vehicleTypes = useMemo(() => {
        if (!Array.isArray(vehicles)) return ['todos'];
        const types = new Set(vehicles.map(v => v.tipo).filter(Boolean));
        return ['todos', ...Array.from(types).sort()];
    }, [vehicles]);

    const rankings = useMemo(() => {
        if (!Array.isArray(vehicles) || !Array.isArray(refuelings) || !vehicleGroups || Object.keys(vehicleGroups).length === 0) {
             return { all: [], best: [], worst: [] };
        }

        const filteredVehicles = selectedType === 'todos'
            ? vehicles
            : vehicles.filter(v => v.tipo === selectedType);

        const vehicleAverages = filteredVehicles.map(vehicle => {
            const history = (refuelings || [])
                .filter(r => r.vehicleId === vehicle.id && r.status === 'Concluída')
                .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

            if (history.length < 2) return null;

            let unit = 'Km/L';
            const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
            if (vehicle.mediaCalculo === 'horimetro' || vehicleGroup === 'Máquinas Pesadas' || (vehicleGroup === 'Caminhões' && vehicle.mediaCalculo !== 'odometro')) {
                unit = 'L/Hr';
            }

            const firstRefuel = history[0];
            const lastRefuel = history[history.length - 1];
            const totalLiters = history.slice(1).reduce((sum, item) => sum + (parseFloat(item.litrosAbastecidos) || 0), 0);
            let startReading = 0, endReading = 0;

            if (unit === 'Km/L') {
                startReading = parseFloat(firstRefuel.odometro || 0);
                endReading = parseFloat(lastRefuel.odometro || 0);
            } else {
                 const getHorimetro = (refuel) => parseFloat(refuel.horimetroDigital ?? refuel.horimetroAnalogico ?? refuel.horimetro ?? 0);
                 startReading = getHorimetro(firstRefuel);
                 endReading = getHorimetro(lastRefuel);
            }

            const totalReadingDiff = endReading - startReading;
            let overallAverage = null;

            if (unit === 'Km/L') {
                if (totalLiters > 0 && totalReadingDiff > 0) overallAverage = totalReadingDiff / totalLiters;
            } else { 
                if (totalReadingDiff > 0 && totalLiters > 0) overallAverage = totalLiters / totalReadingDiff;
            }

            return overallAverage !== null && isFinite(overallAverage) ? { ...vehicle, average: overallAverage, unit } : null;
        }).filter(Boolean);

        const sortedAverages = [...vehicleAverages].sort((a, b) => {
            if (a.unit === 'L/Hr') return a.average - b.average;
            return b.average - a.average;
        });

        const best = sortedAverages.slice(0, 5);
        const worst = [...sortedAverages].reverse().slice(0, 5);

        return { all: vehicleAverages, best, worst };
    }, [vehicles, refuelings, vehicleGroups, selectedType]);

    const selectedVehicleData = useMemo(() => {
        return rankings.all.find(v => v.id === selectedVehicleId);
    }, [rankings.all, selectedVehicleId]);

    const renderRankList = (data, title, icon, colorClass) => (
        <div className="flex flex-col h-full">
            <h3 className={`font-semibold text-md mb-3 flex items-center gap-2 ${colorClass}`}>
                {icon} {title}
            </h3>
            <ul className="space-y-2 text-sm flex-1">
                {data.length > 0 ? data.map(v => (
                    <li key={v.id} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors">
                        <div className="min-w-0 overflow-hidden">
                            <p className="truncate font-medium text-gray-700" title={`${v.registroInterno} - ${v.modelo}`}>
                                {v.registroInterno}
                            </p>
                            <p className="text-[10px] text-gray-500 truncate">{v.modelo}</p>
                        </div>
                        <span className="font-bold flex-shrink-0 ml-2 text-gray-800">{(v.average || 0).toFixed(2)} <span className="text-[10px] font-normal text-gray-500">{v.unit}</span></span>
                    </li>
                )) : <li className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded border border-dashed border-gray-200">Dados insuficientes.</li>}
            </ul>
        </div>
    );

    return (
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-md border border-gray-200">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4 border-b border-gray-100 pb-4">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Activity className="text-indigo-600" size={20} />
                    Ranking de Consumo
                </h2>
                <div className="flex items-center gap-2">
                    <Filter size={16} className="text-gray-400" />
                    <select
                        value={selectedType}
                        onChange={e => { setSelectedType(e.target.value); setSelectedVehicleId(''); }}
                        className="py-1.5 pl-2 pr-8 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    >
                        {vehicleTypes.map(type => (
                            <option key={type} value={type}>{type === 'todos' ? 'Todos os Tipos' : type}</option>
                        ))}
                    </select>
                </div>
            </div>

            {selectedType !== 'todos' && rankings.all.length > 0 && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Comparar outro veículo ({selectedType}):</label>
                    <select
                        value={selectedVehicleId}
                        onChange={e => setSelectedVehicleId(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-lg bg-gray-50 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">Selecione para ver detalhes...</option>
                        {rankings.all
                            .sort((a, b) => a.unit === 'L/Hr' ? a.average - b.average : b.average - a.average)
                            .map(v => (
                            <option key={v.id} value={v.id}>
                                {v.registroInterno} - {v.modelo} ({(v.average || 0).toFixed(2)} {v.unit})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* GRID ATUALIZADO: 3 COLUNAS (Melhores | Piores | Detalhes) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Coluna 1: Melhores */}
                <div className="bg-green-50/30 p-3 rounded-xl border border-green-100">
                    {renderRankList(rankings.best, 'Melhores Médias', <TrendingUp size={18}/>, 'text-green-600')}
                </div>
                
                {/* Coluna 2: Piores */}
                <div className="bg-red-50/30 p-3 rounded-xl border border-red-100">
                    {renderRankList(rankings.worst, 'Piores Médias', <TrendingDown size={18}/>, 'text-red-600')}
                </div>

                {/* Coluna 3: Detalhes */}
                <div className="flex flex-col h-full">
                    <h3 className="font-semibold text-md mb-3 flex items-center gap-2 text-blue-600">
                        <Info size={18} /> Detalhes
                    </h3>
                    {selectedVehicleData ? (
                        <div className="flex-1 p-4 bg-blue-50 rounded-xl border border-blue-200 flex flex-col justify-center space-y-3 shadow-sm">
                            <div className="flex items-center gap-3 border-b border-blue-200 pb-3">
                                <div className="p-2 bg-white rounded-full shadow-sm text-blue-600">
                                    <Truck size={20} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-800 text-lg leading-tight">{selectedVehicleData.registroInterno}</h4>
                                    <p className="text-xs text-gray-500">{selectedVehicleData.modelo}</p>
                                </div>
                            </div>
                            
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Tipo:</span>
                                    <span className="font-medium text-gray-700">{selectedVehicleData.tipo}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Placa:</span>
                                    <span className="font-medium text-gray-700">{selectedVehicleData.placa || 'N/A'}</span>
                                </div>
                            </div>

                            <div className="mt-auto pt-3 border-t border-blue-200 text-center">
                                <p className="text-xs text-blue-600 mb-1 font-medium uppercase tracking-wide">Média Calculada</p>
                                <span className={`text-2xl font-bold ${selectedVehicleData.unit === 'L/Hr' ? 'text-gray-800' : 'text-gray-800'}`}>
                                    {selectedVehicleData.average.toFixed(2)}
                                    <span className="text-sm font-normal text-gray-500 ml-1">{selectedVehicleData.unit}</span>
                                </span>
                            </div>
                        </div>
                    ) : (
                         <div className="flex-1 p-6 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center h-full">
                            <Truck size={32} className="text-gray-300 mb-2" />
                            <p className="text-sm text-gray-400 font-medium">Selecione um veículo na lista ou no filtro acima para visualizar o desempenho detalhado.</p>
                         </div>
                    )}
                </div>
            </div>
        </div>
    );
};


// ===================================================================================
// COMPONENTE: PAINEL DE PROGRESSO DA OBRA
// ===================================================================================
const ObraProgressBI = ({ obras = [], vehicles = [], vehicleGroups = {}, equipmentTypesForHours = [] }) => {
    const [selectedObraId, setSelectedObraId] = useState('');

    const activeObrasWithContractData = useMemo(() => {
        if (!Array.isArray(obras)) return [];
        return obras.filter(obra => {
            if (obra.status !== 'ativa') return false;
            const currentContractType = obra.contractType || 'horas';
            if (currentContractType === 'horas') {
                const totalContratado = Object.values(obra.horasContratadasPorTipo || {}).reduce((sum, h) => sum + (parseFloat(h) || 0), 0);
                return totalContratado > 0;
            } else if (currentContractType === 'metrosQuadrados') {
                const totalKmContratado = (obra.sectors || []).reduce((sum, s) => sum + (parseFloat(s.kmContratado) || 0), 0);
                return totalKmContratado > 0;
            } else if (currentContractType === 'prancha') {
                 return (parseFloat(obra.kmContratadoPrancha) || 0) > 0;
            }
            return false;
        }).sort((a,b) => (a.nome || '').localeCompare(b.nome || ''));
    }, [obras]);

    const calculateExecuted = useMemo(() => (obra) => {
        let totalExecutadoHoras = 0;
        let totalExecutadoKmPrancha = parseFloat(obra.kmConcluidoPrancha) || 0;
        let horasExecutadasPorTipo = {};
        const equipmentTypes = Array.isArray(equipmentTypesForHours) ? equipmentTypesForHours : [];
        equipmentTypes.forEach(type => { horasExecutadasPorTipo[type] = 0; });
        if (!horasExecutadasPorTipo['Caminhão']) horasExecutadasPorTipo['Caminhão'] = 0;

        (Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : []).forEach(hist => {
            const vehicle = vehicles.find(v => v.id === hist.veiculoId);
            if (!vehicle) return;
            const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
            const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(vehicle.tipo));
            const equipType = equipmentTypes.find(t => vehicle.tipo === t);

            let startReading = parseFloat(hist.details?.horimetroEntrada ?? hist.details?.odometroEntrada ?? 0);
            let endReading = parseFloat(hist.details?.horimetroSaida ?? hist.details?.odometroSaida ?? 0);
            let useOdometroForPrancha = false;

            if (!hist.endDate) {
                if (vehicleGroup === 'Máquinas Pesadas') {
                     endReading = parseFloat(vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro ?? 0);
                     if (endReading > 0 && hist.details?.horimetroEntrada == null) startReading = 0;
                } else if (vehicleGroup === 'Caminhões') {
                    if (obra.contractType === 'prancha') {
                         endReading = parseFloat(vehicle.odometro || 0);
                         startReading = parseFloat(hist.details?.odometroEntrada || 0);
                         useOdometroForPrancha = true;
                    } else {
                         endReading = parseFloat(vehicle.horimetro || 0);
                         startReading = parseFloat(hist.details?.horimetroEntrada || 0); 
                         if (endReading > 0 && hist.details?.horimetroEntrada == null) startReading = 0;
                    }
                } else { 
                    endReading = parseFloat(vehicle.odometro || 0);
                    startReading = parseFloat(hist.details?.odometroEntrada || 0);
                    if (endReading > 0 && hist.details?.odometroEntrada == null) startReading = 0;
                }
            }

            if (endReading >= startReading) {
                 const diff = endReading - startReading;
                 if (useOdometroForPrancha) {
                     totalExecutadoKmPrancha += diff;
                 } else if (equipType && obra.contractType !== 'prancha' && vehicleGroup !== 'Veículos Leves') {
                      horasExecutadasPorTipo[equipType] = (horasExecutadasPorTipo[equipType] || 0) + diff;
                 }
                 else if (vehicleGroup === 'Caminhões' && !useOdometroForPrancha && obra.contractType !== 'prancha') {
                     horasExecutadasPorTipo['Caminhão'] = (horasExecutadasPorTipo['Caminhão'] || 0) + diff;
                 }
            }
        });

        const truckManualHours = parseFloat(obra.horasAdicionaisCaminhao || 0);
        if (horasExecutadasPorTipo['Caminhão'] !== undefined && obra.contractType !== 'prancha') {
             horasExecutadasPorTipo['Caminhão'] += truckManualHours;
        }

        totalExecutadoHoras = Object.values(horasExecutadasPorTipo).reduce((sum, h) => sum + (h || 0), 0);

        return {
             totalHoras: totalExecutadoHoras,
             totalKmPrancha: totalExecutadoKmPrancha,
             porTipo: horasExecutadasPorTipo,
        };
    }, [vehicles, vehicleGroups, equipmentTypesForHours]);

    const allObrasProgress = useMemo(() => {
        if (!activeObrasWithContractData || !vehicles) {
            return { totalContracted: 0, totalExecuted: 0, unit: 'hrs' };
        }
        let totalContratado = 0, totalExecutado = 0, primaryUnit = 'hrs';

        activeObrasWithContractData.forEach(obra => {
            const currentContractType = obra.contractType || 'horas';
            const executed = calculateExecuted(obra);

            if (currentContractType === 'horas') {
                totalContratado += Object.values(obra.horasContratadasPorTipo || {}).reduce((sum, h) => sum + (parseFloat(h) || 0), 0);
                totalExecutado += executed.totalHoras;
                primaryUnit = 'hrs';
            } else if (currentContractType === 'metrosQuadrados') {
                const sectors = Array.isArray(obra.sectors) ? obra.sectors : [];
                totalContratado += sectors.reduce((sum, s) => sum + (parseFloat(s.kmContratado) || 0), 0);
                totalExecutado += sectors.reduce((sum, s) => sum + (parseFloat(s.kmConcluido) || 0), 0);
                primaryUnit = 'm²';
             } else if (currentContractType === 'prancha') {
                 totalContratado += parseFloat(obra.kmContratadoPrancha) || 0;
                 totalExecutado += executed.totalKmPrancha;
                 primaryUnit = 'km';
            }
        });
        return { totalContracted: totalContratado || 0, totalExecuted: totalExecutado || 0, unit: primaryUnit };
    }, [activeObrasWithContractData, vehicles, calculateExecuted]);

    const obraData = useMemo(() => {
        if (!selectedObraId || !activeObrasWithContractData || !vehicles) return null;
        const obra = activeObrasWithContractData.find(o => o.id === selectedObraId);
        if (!obra) return null;

        const currentContractType = obra.contractType || 'horas';
        const executed = calculateExecuted(obra);
        const equipmentTypes = Array.isArray(equipmentTypesForHours) ? equipmentTypesForHours : [];
        const allEquipmentTypes = [...new Set([...equipmentTypes, 'Caminhão'])];

        if (currentContractType === 'horas') {
            const horasContratadas = obra.horasContratadasPorTipo || {};
            const totalContratado = Object.values(horasContratadas).reduce((sum, h) => sum + (parseFloat(h) || 0), 0);
            const breakdownMap = {};
            allEquipmentTypes.forEach(type => {
                breakdownMap[type] = {
                    tipo: type,
                    contratado: parseFloat(horasContratadas[type] || 0),
                    executado: parseFloat((executed.porTipo[type] || 0).toFixed(1)),
                };
            });
            return { type: 'horas', nome: obra.nome, totalContratado, totalExecutado: executed.totalHoras, unit: 'hrs', breakdown: Object.values(breakdownMap) };
        } else if (currentContractType === 'metrosQuadrados') {
            const sectors = Array.isArray(obra.sectors) ? obra.sectors : [];
            const totalKmContratado = sectors.reduce((sum, s) => sum + (parseFloat(s.kmContratado) || 0), 0);
            const totalKmConcluido = sectors.reduce((sum, s) => sum + (parseFloat(s.kmConcluido) || 0), 0);
            return { type: 'metrosQuadrados', nome: obra.nome, totalKmContratado, totalKmConcluido, unit: 'm²', sectors: sectors.map(s => ({...s, kmContratado: parseFloat(s.kmContratado || 0), kmConcluido: parseFloat(s.kmConcluido || 0)})) };
         } else if (currentContractType === 'prancha') {
             const totalKmContratado = parseFloat(obra.kmContratadoPrancha) || 0;
             return { type: 'prancha', nome: obra.nome, totalKmContratado, totalKmConcluido: executed.totalKmPrancha, unit: 'km' };
        }
        return null;
    }, [selectedObraId, activeObrasWithContractData, vehicles, calculateExecuted, equipmentTypesForHours]);

    const ProgressBar = ({ value, max, color = 'bg-yellow-400' }) => {
        const numericValue = parseFloat(value) || 0;
        const numericMax = parseFloat(max) || 0;
        const percentage = numericMax > 0 ? (numericValue / numericMax) * 100 : 0;
        const displayPercentage = Math.min(percentage, 100).toFixed(0);

        return (
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden my-1">
                <div
                    className={`${color} h-3 rounded-full text-gray-900 text-[9px] flex items-center justify-center font-bold transition-width duration-500 ease-in-out`}
                    style={{ width: `${displayPercentage}%` }}
                 >
                    {percentage > 15 ? `${displayPercentage}%` : ''}
                </div>
            </div>
        );
    };

    const individualObrasProgress = useMemo(() => {
        if (!activeObrasWithContractData || !vehicles) return [];
        return activeObrasWithContractData.map(obra => {
            const currentContractType = obra.contractType || 'horas';
            let totalContratado = 0, totalExecutado = 0, unit = 'hrs';
            const executed = calculateExecuted(obra);

            if (currentContractType === 'horas') {
                totalContratado = Object.values(obra.horasContratadasPorTipo || {}).reduce((sum, h) => sum + (parseFloat(h) || 0), 0);
                totalExecutado = executed.totalHoras;
                unit = 'hrs';
            } else if (currentContractType === 'metrosQuadrados') {
                const sectors = Array.isArray(obra.sectors) ? obra.sectors : [];
                totalContratado = sectors.reduce((sum, s) => sum + (parseFloat(s.kmContratado) || 0), 0);
                totalExecutado = sectors.reduce((sum, s) => sum + (parseFloat(s.kmConcluido) || 0), 0);
                unit = 'm²';
             } else if (currentContractType === 'prancha') {
                 totalContratado = parseFloat(obra.kmContratadoPrancha) || 0;
                 totalExecutado = executed.totalKmPrancha;
                 unit = 'km';
            }

            const percentage = totalContratado > 0 ? (totalExecutado / totalContratado) * 100 : 0;
            return { id: obra.id, nome: obra.nome, totalContratado, totalExecutado, percentage: percentage || 0, unit, cliente: obra.cliente };
        }).sort((a,b) => b.percentage - a.percentage);
    }, [activeObrasWithContractData, vehicles, calculateExecuted]);

    return (
        // CORREÇÃO: Removemos o h-full deste container para evitar conflitos de altura com elementos externos
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-md border border-gray-200">
            <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
                <h2 className="text-xl font-bold text-gray-900">Progresso / Alocação</h2>
                <select
                     onChange={(e) => setSelectedObraId(e.target.value)}
                     value={selectedObraId}
                     className="p-1 border rounded-lg bg-gray-50 text-sm focus:ring-yellow-500 focus:border-yellow-500"
                 >
                    <option value="">Visão Geral (Todas)</option>
                    {activeObrasWithContractData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
            </div>

            {!obras || !vehicles ? (
                 <p className="text-center text-gray-500 py-10">Carregando...</p>
            ) : !selectedObraId ? ( 
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto custom-scrollbar pr-1">
                        {individualObrasProgress.length > 0 ? individualObrasProgress.map(obraProg => {
                            const barColor = obraProg.percentage < 75 ? 'bg-blue-500' : obraProg.percentage < 95 ? 'bg-yellow-500' : 'bg-red-500';
                            const progressText = `${(obraProg.totalExecutado || 0).toFixed(1)} ${obraProg.unit}`;

                            return (
                                <div key={obraProg.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-white hover:shadow-sm transition-all group flex flex-col justify-between h-full">
                                    <div>
                                        <div className="flex items-center mb-2">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-2 shrink-0">
                                                <HardHat size={14} />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-xs font-bold text-gray-800 truncate" title={obraProg.nome}>
                                                    {obraProg.nome}
                                                </h4>
                                                <p className="text-[10px] text-gray-500 truncate">{obraProg.cliente || 'Cliente N/A'}</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-2">
                                        <div className="flex justify-between text-[10px] font-medium text-gray-600 mb-1">
                                            <span>{progressText}</span>
                                            <span>{(obraProg.percentage || 0).toFixed(0)}%</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                            <div className={`h-full ${barColor} rounded-full`} style={{ width: `${Math.min(obraProg.percentage, 100)}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            );
                        }) : <p className="text-xs text-gray-500 col-span-3 text-center py-4 italic">Nenhuma obra ativa com dados.</p>}
                    </div>
                    
                    <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                        <div className="text-xs text-gray-500 italic">Total de {individualObrasProgress.length} obras listadas.</div>
                        <div className="text-xs font-medium text-gray-700">
                            Progresso Geral: {(allObrasProgress.totalExecuted || 0).toFixed(1)} / {(allObrasProgress.totalContracted || 0).toFixed(1)} {allObrasProgress.unit}
                        </div>
                    </div>
                </div>
            ) : selectedObraId && obraData ? ( 
                <div className="space-y-3">
                    <div>
                        <div className="flex justify-between mb-0.5 text-xs font-medium">
                            <span>Progresso Total ({obraData.unit})</span>
                            <span>
                                {((obraData.type === 'horas' ? obraData.totalExecutado : obraData.totalKmConcluido) || 0).toFixed(1)} /
                                {((obraData.type === 'horas' ? obraData.totalContratado : obraData.totalKmContratado) || 0).toFixed(1)} {obraData.unit}
                            </span>
                        </div>
                        <ProgressBar value={obraData.type === 'horas' ? obraData.totalExecutado : obraData.totalKmConcluido} max={obraData.type === 'horas' ? obraData.totalContratado : obraData.totalKmContratado} />
                    </div>
                    
                    {obraData.type === 'horas' && obraData.breakdown && (
                        <div className="space-y-1 pt-1 border-t border-gray-200">
                            <h3 className="text-xs font-semibold text-gray-700">Detalhes por Equipamento:</h3>
                            {obraData.breakdown.filter(e => e.contratado > 0 || e.executado > 0).length > 0 ? (
                                obraData.breakdown.filter(e => e.contratado > 0 || e.executado > 0)
                                    .sort((a,b) => a.tipo.localeCompare(b.tipo))
                                    .map(entry => (
                                        <div key={entry.tipo}>
                                            <div className="flex justify-between mb-0.5 text-[11px] font-medium text-gray-600">
                                                <span>{entry.tipo}</span>
                                                <span>{(entry.executado || 0).toFixed(1)} / {(entry.contratado || 0).toFixed(1)} hrs</span>
                                            </div>
                                            <ProgressBar value={entry.executado} max={entry.contratado} color="bg-blue-400" />
                                        </div>
                                ))
                            ) : <p className="text-xs text-gray-500 italic">Sem horas contratadas/executadas.</p>}
                        </div>
                    )}
                     {/* Código Omitido para brevidade mas lógica mantida */}
                     {obraData.type === 'metrosQuadrados' && obraData.sectors && (
                        <div className="space-y-1 pt-1 border-t border-gray-200">
                             <h3 className="text-xs font-semibold text-gray-700">Progresso por Setor ({obraData.unit}):</h3>
                             {obraData.sectors.length > 0 ? obraData.sectors.map(sector => (
                                <div key={sector.name}>
                                    <div className="flex justify-between mb-0.5 text-[11px] font-medium text-gray-600">
                                        <span>{sector.name || 'Setor s/ nome'}</span>
                                        <span>{(sector.kmConcluido || 0).toFixed(1)} / {(sector.kmContratado || 0).toFixed(1)} {obraData.unit}</span>
                                    </div>
                                    <ProgressBar value={sector.kmConcluido} max={sector.kmContratado} color="bg-green-400" />
                                </div>
                            )) : <p className="text-xs text-gray-500 italic">Nenhum setor definido.</p>}
                        </div>
                     )}
                     {obraData.type === 'prancha' && (
                         <div className="pt-1 border-t border-gray-200">
                             <div className="flex justify-between mb-0.5 text-xs font-medium text-gray-600">
                                 <span>Deslocamento Prancha ({obraData.unit})</span>
                                 <span>{(obraData.totalKmConcluido || 0).toFixed(1)} / {(obraData.totalKmContratado || 0).toFixed(1)} {obraData.unit}</span>
                             </div>
                             <ProgressBar value={obraData.totalKmConcluido} max={obraData.totalKmContratado} color="bg-indigo-400" />
                         </div>
                     )}
                </div>
            ) : <p className="text-gray-500 text-center py-10 italic">Selecione uma obra ou verifique os dados de contrato.</p>}
        </div>
    );
};

// ===================================================================================
// COMPONENTE PRINCIPAL (Painel de Controle)
// ===================================================================================
const Dashboard = ({
    navigate,
    vehicles = [], obras = [], revisions = [], refuelings = [], employees = [], fines = [],
    vehicleGroups = {}, equipmentTypesForHours = [],
    apiClient,
    setAlertMessage,
    reloadData
}) => {
    const [selectedInactivityAlert, setSelectedInactivityAlert] = useState(null);
    const [isMapExpanded, setIsMapExpanded] = useState(false); // Estado para controlar o modal do mapa
    
     const [inactivityAlerts, setInactivityAlerts] = useState([]);
     const [loadingAlerts, setLoadingAlerts] = useState(true);

     useEffect(() => {
         const fetchInactivityAlerts = async () => {
             setLoadingAlerts(true);
             try {
                 const alertsData = await apiClient.getInactivityAlerts();
                 setInactivityAlerts(alertsData || []);
             } catch (error) {
                 console.error("Erro ao buscar alertas de inatividade:", error);
                 setInactivityAlerts([]);
             } finally {
                 setLoadingAlerts(false);
             }
         };
         fetchInactivityAlerts();
         const intervalId = setInterval(fetchInactivityAlerts, 5 * 60 * 1000);
         return () => clearInterval(intervalId);
     }, [apiClient]);


    const alerts = useMemo(() => {
        const vehicleAlerts = (vehicles || []).filter(v => v?.possuiAviso).map(v => ({
            id: `vehicle-${v.id}`,
            type: 'Aviso Veículo',
            vehicle: v,
            text: v.avisoTexto || 'Verificar veículo',
            isDanger: (v.avisoTexto || '').includes('Vencida!') || v.canCirculate === false,
            date: new Date().toLocaleDateString('pt-BR')
        }));

        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(now.getDate() + 30);
        
        const cnhAlerts = (employees || []).map(emp => {
            if (emp.cnhVencimento) {
                try {
                    const vencimento = new Date(emp.cnhVencimento + 'T12:00:00Z');
                    if (!isNaN(vencimento)) {
                        if (vencimento < now) {
                            return { id: `cnh-${emp.id}`, type: 'CNH', employee: emp, text: `Vencida em ${vencimento.toLocaleDateString('pt-BR')}`, isDanger: true, date: vencimento.toLocaleDateString('pt-BR') };
                        } else if (vencimento <= thirtyDaysFromNow) {
                            return { id: `cnh-${emp.id}`, type: 'CNH', employee: emp, text: `Vence em ${vencimento.toLocaleDateString('pt-BR')}`, isDanger: false, date: vencimento.toLocaleDateString('pt-BR') };
                        }
                    }
                } catch { }
            }
            return null;
        }).filter(Boolean);

         const processedInactivityAlerts = (inactivityAlerts || []).map(alert => {
             const vehicle = vehicles.find(v => v.id === alert.vehicleId);
             const obra = obras.find(o => o.id === alert.obraId);
             const operator = employees.find(e => e.id === alert.operatorId);

             if (!vehicle || !obra || !operator) return null;

             const isProlongedActive = alert.status === 'Prolongado' && new Date(alert.prolongedUntil) > now;
             if (alert.status === 'Observado' || isProlongedActive) return null;

             return {
                 ...alert,
                 id: `inactive-${alert.id}`,
                 type: 'Inatividade',
                 vehicle, obra, operator,
                 isDanger: true,
                 text: `Inativo na obra ${obra.nome}`,
                 date: new Date().toLocaleDateString('pt-BR')
             };
         }).filter(Boolean);

        const combinedAlerts = [...vehicleAlerts, ...cnhAlerts, ...processedInactivityAlerts]
            .sort((a, b) => (b.isDanger - a.isDanger));

        return combinedAlerts;
    }, [vehicles, employees, inactivityAlerts, obras]);

    const stats = useMemo(() => {
        const validVehicles = Array.isArray(vehicles) ? vehicles : [];
        const validObras = Array.isArray(obras) ? obras : [];
        const validFines = Array.isArray(fines) ? fines : [];
        const processedVehicles = validVehicles.map(v => ({...v, status: v?.status || 'Disponível'}));
        const maintenanceStatuses = ['Em Manutenção', 'Aguardando Manutenção'];

        return {
            totalVehicles: processedVehicles.length,
            totalObras: validObras.filter(o => o?.status === 'ativa').length,
            vehiclesInObra: processedVehicles.filter(v => v.status === 'Em Obra').length,
            vehiclesInOperation: processedVehicles.filter(v => v.status === 'Em Operação').length,
            availableVehicles: processedVehicles.filter(v => v.status === 'Disponível').length,
            vehiclesInMaintenance: processedVehicles.filter(v => maintenanceStatuses.includes(v.status)).length,
            pendingFines: validFines.filter(f => f?.status === 'Pendente').length,
        };
    }, [vehicles, obras, fines]);

    const handleInactivityAlertClick = (alert) => setSelectedInactivityAlert(alert);
    const handleInactivityModalClose = () => setSelectedInactivityAlert(null);
    const handleAlertAction = () => {
        setSelectedInactivityAlert(null);
        if (reloadData) reloadData();
    };

    const StatCard = ({ title, value, icon: Icon, colorClass, subtext, onClick }) => (
        <div onClick={onClick} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex items-start justify-between transition-all hover:shadow-md cursor-pointer hover:-translate-y-0.5">
            <div>
                <p className="text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">{title}</p>
                <h3 className="text-2xl font-bold text-gray-800">{value}</h3>
                {subtext && <p className="text-[10px] text-gray-400 mt-1">{subtext}</p>}
            </div>
            <div className={`p-2 rounded-lg ${colorClass}`}>
                <Icon size={20} />
            </div>
        </div>
    );

    return (
        <>
            <div className="space-y-6">
                {/* Header - Painel de Controle */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
                            <Activity className="text-indigo-600" />
                            Painel de Controle
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Visão geral operacional • {new Date().toLocaleDateString('pt-BR')}
                        </p>
                    </div>
                     <div className="flex items-center gap-3">
                        <div className="hidden md:flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            <span className="text-xs font-medium text-gray-600">Sistema Online</span>
                        </div>
                        <button onClick={() => navigate('obras')} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2 text-sm font-medium">
                            <Building size={16} />
                            <span>Gerenciar Obras</span>
                        </button>
                    </div>
                </header>

                {/* Grid de Estatísticas */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    <StatCard title="Total Frota" value={stats.totalVehicles} icon={Truck} colorClass="bg-blue-100 text-blue-600" onClick={() => navigate('vehicles')} />
                    <StatCard title="Obras Ativas" value={stats.totalObras} icon={Building} colorClass="bg-gray-100 text-gray-600" onClick={() => navigate('obras', { status: 'ativa' })} />
                    <StatCard title="Em Obra" value={stats.vehiclesInObra} icon={HardHat} colorClass="bg-green-100 text-green-600" onClick={() => navigate('vehicles', { status: 'Em Obra' })} />
                    <StatCard title="Operação" value={stats.vehiclesInOperation} icon={Users} colorClass="bg-blue-100 text-blue-600" onClick={() => navigate('vehicles', { status: 'Em Operação' })} />
                    <StatCard title="Disponíveis" value={stats.availableVehicles} icon={CheckCircle} colorClass="bg-teal-100 text-teal-600" onClick={() => navigate('vehicles', { status: 'Disponível' })} />
                    <StatCard title="Manutenção" value={stats.vehiclesInMaintenance} icon={Wrench} colorClass="bg-red-100 text-red-600" onClick={() => navigate('vehicles', { status: 'Em Manutenção' })} />
                    <StatCard title="Multas" value={stats.pendingFines} icon={ShieldAlert} colorClass="bg-orange-100 text-orange-600" onClick={() => navigate('fines', { status: 'Pendente' })} />
                </div>

                {/* Layout Principal Assimétrico */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Coluna Esquerda (2/3) */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Seção do Mapa (AGORA REAL) */}
                        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <div>
                                    <h2 className="text-md font-bold text-gray-800">Geolocalização da Frota</h2>
                                    <p className="text-xs text-gray-500">Distribuição atual no RS</p>
                                </div>
                                {/* BOTÃO EXPANDIR MAPA AGORA FUNCIONAL */}
                                <button 
                                    onClick={() => setIsMapExpanded(true)}
                                    className="text-gray-400 hover:text-indigo-600 transition-colors p-1 rounded hover:bg-gray-100"
                                    title="Expandir Mapa"
                                >
                                    <Maximize2 size={18} />
                                </button>
                            </div>
                            <div className="h-[300px] bg-gray-100 relative z-0">
                                {/* Renderiza o mapa com os dados de obras e veículos */}
                                <AllocationMap obras={obras} vehicles={vehicles} />
                            </div>
                        </section>

                        {/* Progresso Obra */}
                        <ObraProgressBI
                            obras={obras}
                            vehicles={vehicles}
                            vehicleGroups={vehicleGroups}
                            equipmentTypesForHours={equipmentTypesForHours}
                        />
                    </div>

                    {/* Coluna Direita (1/3) */}
                    <div className="space-y-6">
                        {/* Quadro de Avisos (Expandido) */}
                        <section className="bg-white rounded-xl shadow-sm border border-gray-200 h-[940px] flex flex-col">
                            <div className="p-4 border-b border-gray-100 bg-indigo-50/50 rounded-t-xl">
                                <h2 className="text-md font-bold text-gray-800 flex items-center gap-2">
                                    <Bell size={18} className="text-indigo-600" />
                                    Quadro de Avisos
                                </h2>
                            </div>
                            <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3">
                                {loadingAlerts ? (
                                    <div className="flex justify-center py-10"><Loader className="animate-spin text-indigo-300"/></div>
                                ) : alerts.length > 0 ? alerts.map(alert => {
                                    // Estilização dinâmica
                                    const style = alert.isDanger 
                                        ? { border: 'border-red-500', icon: 'text-red-500', bg: 'bg-white', title: 'text-gray-800' }
                                        : { border: 'border-blue-400', icon: 'text-blue-500', bg: 'bg-white', title: 'text-gray-800' };
                                    
                                    let Icon = Bell;
                                    if (alert.type === 'CNH') Icon = Badge;
                                    if (alert.type === 'Inatividade') Icon = Clock;
                                    if (alert.isDanger) Icon = AlertTriangle;

                                    return (
                                        <div 
                                            key={alert.id} 
                                            onClick={() => {
                                                if (alert.type === 'Inatividade') handleInactivityAlertClick(alert);
                                                else if (alert.vehicle) navigate('vehicles', { search: alert.vehicle.registroInterno });
                                                else if (alert.employee) navigate('employees', { search: alert.employee.nome });
                                            }}
                                            className={`p-3 rounded-lg border-l-4 shadow-sm flex items-start gap-3 cursor-pointer hover:bg-gray-50 transition-colors ${style.border} ${style.bg}`}
                                        >
                                            <div className={`mt-1 ${style.icon}`}><Icon size={16} /></div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start">
                                                    <h4 className={`text-xs font-bold truncate ${style.title}`}>
                                                        {alert.vehicle ? alert.vehicle.registroInterno : alert.employee?.nome}
                                                    </h4>
                                                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                                        {alert.date}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] font-semibold text-gray-500 uppercase mt-0.5">{alert.type}</p>
                                                <p className="text-xs text-gray-600 mt-1 leading-relaxed">{alert.text}</p>
                                            </div>
                                        </div>
                                    );
                                }) : <p className="text-gray-400 text-sm text-center py-10 italic">Tudo tranquilo por aqui.</p>}
                            </div>
                        </section>
                    </div>
                </div>

                {/* Ranking Consumo (Rodapé) */}
                {/* CORREÇÃO DE LAYOUT: Removemos classes de altura fixa que poderiam causar sobreposição */}
                <div className="mt-6">
                    <FuelEfficiencyRanking
                        vehicles={vehicles}
                        refuelings={refuelings}
                        vehicleGroups={vehicleGroups}
                    />
                </div>
            </div>

             {/* Modal Inatividade */}
            {selectedInactivityAlert && (
                <InactivityAlertModal
                    alert={selectedInactivityAlert}
                    onClose={handleInactivityModalClose}
                    onObserve={handleAlertAction}
                    onProlong={handleAlertAction}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                />
            )}

            {/* Modal de Mapa Expandido */}
            {isMapExpanded && (
                <ExpandedMapModal 
                    obras={obras} 
                    vehicles={vehicles} 
                    onClose={() => setIsMapExpanded(false)} 
                />
            )}
        </>
    );
};

export default Dashboard;