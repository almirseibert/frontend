import React, { useState, useMemo } from 'react';
import { Activity, TrendingUp, TrendingDown, Filter, Truck } from 'lucide-react';
import { getAllowedReadingTypes } from '../../utils/vehicleRules';

const FuelEfficiencyRanking = ({ vehicles = [], refuelings = [] }) => {
    const [filterType, setFilterType] = useState('todos');

    // Categorias de filtro baseadas na regra de negócio
    const types = useMemo(() => {
        const uniqueTypes = [...new Set(vehicles.map(v => v.tipo))].sort();
        return ['todos', ...uniqueTypes];
    }, [vehicles]);

    const rankingData = useMemo(() => {
        if (!vehicles.length || !refuelings.length) return { best: [], worst: [] };

        const stats = vehicles.map(vehicle => {
            // Regra 1 e 7: Determinar unidade correta (Km/L ou L/Hr)
            const allowedTypes = getAllowedReadingTypes(vehicle.tipo);
            const isKm = allowedTypes.includes('odometro');
            const unit = isKm ? 'Km/L' : 'L/Hr';

            // Filtrar abastecimentos do veículo
            const history = refuelings
                .filter(r => r.vehicleId === vehicle.id && r.status === 'Concluída')
                .sort((a,b) => new Date(a.date) - new Date(b.date));

            if (history.length < 2) return null;

            // Calcular média acumulada
            const first = history[0];
            const last = history[history.length - 1];
            
            // Soma litros abastecidos (exceto o primeiro, pois o primeiro é o "tanque cheio inicial" ou referência)
            // Na verdade, para média, usamos (Leitura Final - Leitura Inicial) / Total Litros consumidos no intervalo
            const totalLiters = history.slice(1).reduce((acc, r) => acc + (parseFloat(r.litrosAbastecidos) || 0), 0);
            
            let startReading = 0, endReading = 0;
            if (isKm) {
                startReading = parseFloat(first.odometro || 0);
                endReading = parseFloat(last.odometro || 0);
            } else {
                startReading = parseFloat(first.horimetroDigital || first.horimetro || 0);
                endReading = parseFloat(last.horimetroDigital || last.horimetro || 0);
            }

            const diff = endReading - startReading;
            if (diff <= 0 || totalLiters <= 0) return null;

            // Cálculo da Média
            // Km/L = Distância / Litros (Maior é melhor)
            // L/Hr = Litros / Tempo (Menor é melhor)
            let average = 0;
            if (isKm) {
                average = diff / totalLiters;
            } else {
                average = totalLiters / diff;
            }

            return {
                id: vehicle.id,
                code: vehicle.registroInterno,
                model: vehicle.modelo,
                type: vehicle.tipo,
                average,
                unit,
                isKm // Flag para ordenação
            };
        }).filter(Boolean);

        // Filtragem por tipo selecionado
        const filteredStats = filterType === 'todos' ? stats : stats.filter(s => s.type === filterType);

        // Ordenação
        // Para Km/L: Descrescente (Maior melhor)
        // Para L/Hr: Crescente (Menor melhor)
        // Se misturado, separamos ou mostramos lista geral. Aqui vamos separar por unidade visualmente.
        
        // Vamos criar duas listas baseadas na eficiência relativa
        // Como misturar Km/L e L/Hr num top 5 é confuso, vamos focar no tipo selecionado ou separar logica
        
        // Estratégia simples: Ordenar por "Melhor Eficiência"
        const sorted = [...filteredStats].sort((a, b) => {
            if (a.unit !== b.unit) return a.unit.localeCompare(b.unit); // Agrupa unidades
            if (a.isKm) return b.average - a.average; // Km/L: Maior -> topo
            return a.average - b.average; // L/Hr: Menor -> topo
        });

        return {
            best: sorted.slice(0, 5),
            worst: sorted.reverse().slice(0, 5) // Inverte para pegar os piores
        };

    }, [vehicles, refuelings, filterType]);

    const ListItem = ({ item, rank, isBest }) => (
        <div className="flex justify-between items-center p-2 bg-gray-50 rounded border border-gray-100 text-sm">
            <div className="flex items-center gap-2">
                <span className={`font-bold w-4 ${isBest ? 'text-green-600' : 'text-red-600'}`}>{rank}</span>
                <div>
                    <p className="font-bold text-gray-700">{item.code}</p>
                    <p className="text-[10px] text-gray-500">{item.model}</p>
                </div>
            </div>
            <div className="text-right">
                <span className={`font-bold block ${isBest ? 'text-green-700' : 'text-red-700'}`}>
                    {item.average.toFixed(2)} <span className="text-[10px] font-normal text-gray-500">{item.unit}</span>
                </span>
            </div>
        </div>
    );

    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 h-full">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <Activity className="text-indigo-600" size={20} /> Ranking de Eficiência
                </h3>
                <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-2 py-1">
                    <Filter size={14} className="text-gray-400" />
                    <select 
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                        className="bg-transparent border-none text-xs font-semibold text-gray-700 focus:ring-0 cursor-pointer"
                    >
                        <option value="todos">Todos</option>
                        {types.filter(t=>t!=='todos').map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50/50 p-3 rounded-lg border border-green-100">
                    <h4 className="text-xs font-bold text-green-700 uppercase mb-2 flex items-center gap-1">
                        <TrendingUp size={14}/> Mais Econômicos
                    </h4>
                    <div className="space-y-2">
                        {rankingData.best.length > 0 ? rankingData.best.map((item, idx) => (
                            <ListItem key={item.id} item={item} rank={idx+1} isBest={true} />
                        )) : <p className="text-xs text-gray-400 italic text-center py-4">Sem dados suficientes</p>}
                    </div>
                </div>

                <div className="bg-red-50/50 p-3 rounded-lg border border-red-100">
                    <h4 className="text-xs font-bold text-red-700 uppercase mb-2 flex items-center gap-1">
                        <TrendingDown size={14}/> Maior Consumo
                    </h4>
                    <div className="space-y-2">
                         {rankingData.worst.length > 0 ? rankingData.worst.map((item, idx) => (
                            <ListItem key={item.id} item={item} rank={idx+1} isBest={false} />
                        )) : <p className="text-xs text-gray-400 italic text-center py-4">Sem dados suficientes</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FuelEfficiencyRanking;