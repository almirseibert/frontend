import React from 'react';
import TerceirizadoBadge from '../ui/TerceirizadoBadge';

// Lista de equipamentos da obra, sempre visível ao lado da tabela de dias.
// Substitui o <select> de equipamento: mostra todos de uma vez, com o total
// de horas do mês de cada um, e troca de máquina sem fechar nada.

// Item fora do componente pelo mesmo motivo do Row em ObraStartList.
const Item = ({ v, dim, selectedVehicleId, totalsByVehicle, formatHours, onSelect }) => {
    const total = totalsByVehicle[v.id] || 0;
    const on = v.id === selectedVehicleId;
    return (
        <button
            onClick={() => onSelect(v.id)}
            className={`w-full text-left px-3 py-2 rounded-lg border transition flex items-start justify-between gap-2 ${
                on
                    ? 'bg-[#fdf8f0] border-[#9E7A42]'
                    : 'bg-transparent border-transparent hover:bg-white hover:border-gray-200'
            }`}
        >
            <span className="min-w-0">
                <span
                    className={`block text-sm font-semibold truncate ${
                        dim ? 'text-gray-400' : 'text-gray-800'
                    }`}
                >
                    {v.registroInterno}
                    <TerceirizadoBadge vehicle={v} />
                </span>
                <span className="block text-[11px] text-gray-400 truncate">{v.tipo}</span>
            </span>
            <span
                className={`text-xs font-mono shrink-0 pt-0.5 ${
                    total > 0 ? 'text-gray-600' : 'text-gray-300'
                }`}
            >
                {total > 0 ? formatHours(total) : '—'}
            </span>
        </button>
    );
};

const EquipmentRail = ({
    vehicles = [],
    selectedVehicleId,
    onSelect,
    totalsByVehicle = {},   // { [vehicleId]: horasDecimais }
    formatHours,
}) => {
    const presentes = vehicles.filter((v) => v.statusNaObra === 'presente');
    const historico = vehicles.filter((v) => v.statusNaObra === 'historico');

    const itemProps = { selectedVehicleId, totalsByVehicle, formatHours, onSelect };

    return (
        <div className="bg-white rounded-lg shadow p-2">
            <p className="px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Equipamentos na obra
            </p>
            <div className="space-y-0.5">
                {presentes.map((v) => (
                    <Item key={v.id} v={v} {...itemProps} />
                ))}
                {presentes.length === 0 && (
                    <p className="px-2 py-3 text-xs text-gray-400">Nenhum equipamento presente.</p>
                )}
            </div>

            {historico.length > 0 && (
                <>
                    <p className="px-2 pt-4 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Saíram da obra
                    </p>
                    <div className="space-y-0.5">
                        {historico.map((v) => (
                            <Item key={v.id} v={v} dim {...itemProps} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default EquipmentRail;
