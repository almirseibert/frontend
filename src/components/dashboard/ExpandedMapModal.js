import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { X, MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet Icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const AllocationMap = ({ obras = [], vehicles = [], isExpanded = false }) => {
    const validObras = useMemo(() => {
        return obras.filter(o => 
            o.status === 'ativa' && 
            o.latitude && o.longitude && 
            !isNaN(parseFloat(o.latitude)) && !isNaN(parseFloat(o.longitude))
        );
    }, [obras]);

    const getActiveVehiclesList = (obraId) => {
        if (!Array.isArray(obras)) return [];
        const obra = obras.find(o => o.id === obraId);
        if (!obra || !Array.isArray(obra.historicoVeiculos)) return [];
        return obra.historicoVeiculos
            .filter(h => !h.dataSaida)
            .map(h => {
                const vehicle = vehicles.find(v => v.id === h.veiculoId);
                return vehicle ? `${vehicle.tipo} - ${vehicle.registroInterno}` : 'Veículo Desconhecido';
            });
    };

    const mapCenter = [-29.6914, -53.8008]; // RS Center

    return (
        <MapContainer center={mapCenter} zoom={isExpanded ? 8 : 7} style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {validObras.map(obra => {
                const activeVehiclesList = getActiveVehiclesList(obra.id);
                return (
                    <Marker key={obra.id} position={[parseFloat(obra.latitude), parseFloat(obra.longitude)]}>
                        <Popup>
                            <div className="min-w-[200px]">
                                <strong className="block text-sm text-gray-900 uppercase mb-1">{obra.nome}</strong>
                                <span className="text-xs text-gray-500 block mb-2">{obra.cliente || 'Cliente N/A'}</span>
                                <div className="text-xs">
                                    <div className="font-semibold mb-1 text-blue-700">{activeVehiclesList.length} Veículo(s):</div>
                                    <ul className="list-disc list-inside max-h-32 overflow-y-auto">
                                        {activeVehiclesList.length > 0 ? activeVehiclesList.map((v, i) => <li key={i}>{v}</li>) : <li className="italic text-gray-400">Vazio</li>}
                                    </ul>
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                );
            })}
        </MapContainer>
    );
};

export const ExpandedMapModal = ({ obras, vehicles, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full h-full max-w-7xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <MapPin className="text-blue-600" /> Mapa de Alocação Expandido
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={24} /></button>
                </div>
                <div className="flex-1 relative bg-gray-100">
                    <AllocationMap obras={obras} vehicles={vehicles} isExpanded={true} />
                </div>
            </div>
        </div>
    );
};

export default AllocationMap;