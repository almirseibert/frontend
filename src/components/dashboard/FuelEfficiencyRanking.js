import React, { useState, useMemo } from 'react';
import { Activity, TrendingUp, TrendingDown, Filter } from 'lucide-react';
import { getAllowedReadingTypes } from '../../utils/vehicleRules';

const FuelEfficiencyRanking = ({ vehicles = [], refuelings = [] }) => {
    const [filterType, setFilterType] = useState('todos');

    const types = useMemo(() => {
        const uniqueTypes = [...new Set(vehicles.map(v => v.tipo))].sort();
        return ['todos', ...uniqueTypes];
    }, [vehicles]);

    const rankingData = useMemo(() => {
        if (!vehicles.length || !refuelings.length) return { best: [], worst: [] };

        const stats = vehicles.map(vehicle => {
            const allowedTypes = getAllowedReadingTypes(vehicle.tipo);
            const isKm = allowedTypes.includes('odometro');
            const unit = isKm ? 'Km/L' : 'L/Hr';

            const history = refuelings
                .filter(r => r.vehicleId === vehicle.id && r.status === 'Concluída')
                .sort((a,b) => new Date(a.date) - new Date(b.date));

            if (history.length < 2) return null;

            const totalLiters = history.slice(1).reduce((acc, r) => acc + (parseFloat(r.litrosAbastecidos) || 0), 0);
            
            let startReading = 0, endReading = 0;
            if (isKm) {
                const first = history[0];
                const last = history[history.length - 1];
                startReading = parseFloat(first.odometro || 0);
                endReading = parseFloat(last.odometro || 0);
            } else {
                const first = history[0];
                const last = history[history.length - 1];
                startReading = parseFloat(first.horimetroDigital || first.horimetro || 0);
                endReading = parseFloat(last.horimetroDigital || last.horimetro || 0);
            }

            const diff = endReading - startReading;
            if (diff <= 0 || totalLiters <= 0) return null;

            let average = 0;
            if (isKm) {
                average = diff / totalLiters; // Km por Litro (Maior = Melhor)
            } else {
                average = totalLiters / diff; // Litros por Hora (Menor = Melhor)
            }

            return {
                id: vehicle.id,
                code: vehicle.registroInterno,
                model: vehicle.modelo,
                type: vehicle.tipo,
                average,
                unit,
                isKm 
            };
        }).filter(Boolean);

        const filteredStats = filterType === 'todos' ? stats : stats.filter(s => s.type === filterType);

        const sorted = [...filteredStats].sort((a, b) => {
            if (a.unit !== b.unit) return a.unit.localeCompare(b.unit); 
            if (a.isKm) return b.average - a.average; 
            return a.average - b.average; 
        });

        return {
            best: sorted.slice(0, 5),
            worst: sorted.reverse().slice(0, 5)
        };

    }, [vehicles, refuelings, filterType]);

    const ListItem = ({ item, rank, isBest }) => (
        <div className="flex justify-between items-center p-1.5 bg-gray-50 rounded border border-gray-100 text-xs hover:bg-white hover:shadow-sm transition-all">
            <div className="flex items-center gap-2 overflow-hidden">
                <span className={`font-bold w-3 shrink-0 ${isBest ? 'text-green-600' : 'text-red-600'}`}>{rank}</span>
                <div className="min-w-0">
                    <p className="font-bold text-gray-700 truncate">{item.code}</p>
                    <p className="text-[9px] text-gray-400 truncate">{item.model}</p>
                </div>
            </div>
            <div className="text-right shrink-0 ml-1">
                <span className={`font-bold block ${isBest ? 'text-green-700' : 'text-red-700'}`}>
                    {item.average.toFixed(2)} <span className="text-[9px] font-normal text-gray-500">{item.unit}</span>
                </span>
            </div>
        </div>
    );

    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 h-full flex flex-col">
            <div className="flex justify-between items-center mb-3 border-b pb-2 shrink-0">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm">
                    <Activity className="text-indigo-600" size={18} /> Ranking de Eficiência
                </h3>
                <div className="flex items-center gap-1 bg-gray-50 rounded px-1.5 py-0.5 border border-gray-200">
                    <Filter size={12} className="text-gray-400" />
                    <select 
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                        className="bg-transparent border-none text-[10px] font-semibold text-gray-600 focus:ring-0 cursor-pointer p-0"
                    >
                        <option value="todos">Todos</option>
                        {types.filter(t=>t!=='todos').map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 flex-1 overflow-hidden">
                <div className="bg-green-50/30 p-2 rounded-lg border border-green-100 flex flex-col">
                    <h4 className="text-[10px] font-bold text-green-700 uppercase mb-2 flex items-center gap-1 shrink-0">
                        <TrendingUp size={12}/> Mais Econômicos
                    </h4>
                    <div className="space-y-1 overflow-y-auto custom-scrollbar flex-1">
                        {rankingData.best.length > 0 ? rankingData.best.map((item, idx) => (
                            <ListItem key={item.id} item={item} rank={idx+1} isBest={true} />
                        )) : <p className="text-[10px] text-gray-400 italic text-center py-4">Sem dados</p>}
                    </div>
                </div>

                <div className="bg-red-50/30 p-2 rounded-lg border border-red-100 flex flex-col">
                    <h4 className="text-[10px] font-bold text-red-700 uppercase mb-2 flex items-center gap-1 shrink-0">
                        <TrendingDown size={12}/> Maior Consumo
                    </h4>
                    <div className="space-y-1 overflow-y-auto custom-scrollbar flex-1">
                         {rankingData.worst.length > 0 ? rankingData.worst.map((item, idx) => (
                            <ListItem key={item.id} item={item} rank={idx+1} isBest={false} />
                        )) : <p className="text-[10px] text-gray-400 italic text-center py-4">Sem dados</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FuelEfficiencyRanking;