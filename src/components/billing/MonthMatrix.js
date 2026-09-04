import React, { useMemo } from 'react';
import TerceirizadoBadge from '../ui/TerceirizadoBadge';

// Conferência da obra inteira: equipamentos nas linhas, dias nas colunas.
// É a mesma leitura que o PDF Resumo imprime — a tela deixa de ser uma lista
// corrida de lançamentos e passa a mostrar o que vai ser conferido/faturado.
//
// Célula vazia  → dia ainda não lançado
// "—"           → dia lançado sem operação (justificativa)
// "·"           → equipamento não estava na obra naquele dia
// Clicar na célula abre o Controle Diário naquele equipamento e naquele dia.

const MonthMatrix = ({
    days = [],                 // ['2026-08-01', ...]
    vehicles = [],             // getObraVehicles
    logIndex = new Map(),      // Map(`${vehicleId}|${date}` -> log)
    allocationRange,           // (vehicle, dateStr) => boolean
    onCellClick,
    formatHours,
    isWeekend,
    dayLabel,                  // (dateStr) => 'Seg'
}) => {
    const { rows, dayTotals, grandTotal } = useMemo(() => {
        const dayTotals = days.map(() => 0);
        let grandTotal = 0;

        const rows = vehicles.map((v) => {
            let total = 0;
            const cells = days.map((d, i) => {
                const log = logIndex.get(`${v.id}|${d}`);
                const dentro = allocationRange ? allocationRange(v, d) : true;
                const horas = log && !log.justificativaTipo ? parseFloat(log.totalHours || 0) : 0;
                total += horas;
                dayTotals[i] += horas;
                return {
                    date: d,
                    horas,
                    dentro,
                    justificativa: log?.justificativaTipo || null,
                    observation: log?.observation || '',
                };
            });
            grandTotal += total;
            return { vehicle: v, cells, total };
        });

        return { rows, dayTotals, grandTotal };
    }, [days, vehicles, logIndex, allocationRange]);

    if (!vehicles.length) {
        return (
            <div className="bg-white rounded-lg shadow p-10 text-center text-sm text-gray-400">
                Nenhum equipamento nesta obra no período.
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="border-collapse" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                    <tr>
                        <th
                            className="sticky left-0 z-20 bg-gray-50 text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500 border-b border-r"
                            style={{ minWidth: 190 }}
                        >
                            Equipamento
                        </th>
                        {days.map((d) => (
                            <th
                                key={d}
                                className={`px-1 py-2 text-[11px] font-mono font-bold text-center border-b border-r ${
                                    isWeekend(d) ? 'bg-gray-100 text-gray-400' : 'bg-gray-50 text-gray-500'
                                }`}
                                style={{ minWidth: 42 }}
                                title={dayLabel(d)}
                            >
                                {d.slice(8, 10)}
                            </th>
                        ))}
                        <th
                            className="sticky right-0 z-20 bg-gray-50 text-right px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500 border-b"
                            style={{ minWidth: 90 }}
                        >
                            Total
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ vehicle, cells, total }) => (
                        <tr key={vehicle.id}>
                            <td className="sticky left-0 z-10 bg-white px-4 py-1.5 border-b border-r whitespace-nowrap">
                                <span className="font-semibold text-sm text-gray-800">
                                    {vehicle.registroInterno}
                                </span>
                                <span className="text-[11px] text-gray-400 ml-2">{vehicle.tipo}</span>
                                <TerceirizadoBadge vehicle={vehicle} className="ml-2" />
                            </td>
                            {cells.map((c) => (
                                <td
                                    key={c.date}
                                    className={`p-0 border-b border-r text-center ${
                                        isWeekend(c.date) ? 'bg-gray-50' : ''
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => c.dentro && onCellClick(vehicle.id, c.date)}
                                        disabled={!c.dentro}
                                        title={[
                                            `${vehicle.registroInterno} · ${c.date.split('-').reverse().join('/')}`,
                                            c.justificativa || '',
                                            c.observation || '',
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        className={`w-full px-1 py-1.5 text-xs font-mono ${
                                            c.dentro
                                                ? 'hover:bg-[#fdf8f0] cursor-pointer text-gray-700'
                                                : 'text-gray-300 cursor-default'
                                        }`}
                                    >
                                        {!c.dentro
                                            ? '·'
                                            : c.horas > 0
                                            ? formatHours(c.horas)
                                            : c.justificativa
                                            ? '—'
                                            : ''}
                                    </button>
                                </td>
                            ))}
                            <td className="sticky right-0 z-10 bg-white px-4 py-1.5 border-b text-right font-mono text-sm font-bold text-gray-800">
                                {total > 0 ? formatHours(total) : '—'}
                            </td>
                        </tr>
                    ))}
                    <tr>
                        <td className="sticky left-0 z-10 bg-gray-50 px-4 py-2 border-r text-xs font-bold text-gray-600">
                            Total do dia
                        </td>
                        {dayTotals.map((t, i) => (
                            <td
                                key={days[i]}
                                className="px-1 py-2 border-r text-center text-[11px] font-mono font-bold text-gray-600 bg-gray-50"
                            >
                                {t > 0 ? formatHours(t) : ''}
                            </td>
                        ))}
                        <td className="sticky right-0 z-10 bg-gray-50 px-4 py-2 text-right font-mono text-sm font-bold text-gray-800">
                            {formatHours(grandTotal)}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default MonthMatrix;
