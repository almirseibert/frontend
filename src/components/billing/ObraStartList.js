import React from 'react';
import { formatObraNome } from '../../utils/obraFormat';

// Estado inicial da página: em vez de um campo de busca vazio, a lista das obras
// já com o que interessa para decidir onde entrar — quantos equipamentos e
// quantas horas já foram lançadas no mês em contexto. A escolha da obra deixa
// de ser feita de memória.

// Row fica fora do componente: definida dentro, o React trata cada render como
// um tipo novo e remonta todas as linhas da lista.
const Row = ({ obra, dim, totalsByObra, equipCountByObra, loading, formatHours, onPick }) => {
    const horas = totalsByObra[obra.id] || 0;
    const equipes = equipCountByObra[obra.id] || 0;
    return (
        <tr
            onClick={() => onPick(obra)}
            className="cursor-pointer hover:bg-[#fdf8f0] transition-colors"
            style={{ borderBottom: '1px solid #f5f2ed' }}
        >
            <td className="px-4 py-2.5">
                <span className={`text-sm font-semibold ${dim ? 'text-gray-400' : 'text-gray-800'}`}>
                    {formatObraNome(obra)}
                </span>
                {dim && <span className="ml-2 text-[10px] text-gray-400">(finalizada)</span>}
            </td>
            <td className="px-4 py-2.5 text-center text-sm text-gray-600 font-mono">
                {equipes || '—'}
            </td>
            <td className="px-4 py-2.5 text-right text-sm font-mono text-gray-700">
                {loading ? '…' : horas > 0 ? formatHours(horas) : '—'}
            </td>
        </tr>
    );
};

const ObraStartList = ({
    obras = [],
    inactiveObras = [],
    equipCountByObra = {},
    totalsByObra = {},
    monthLabel,
    loading = false,
    formatHours = (h) => String(h),
    onPick,
}) => {
    const rowProps = { totalsByObra, equipCountByObra, loading, formatHours, onPick };

    return (
        <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ background: '#faf9f7', borderBottom: '1px solid #f0ebe3' }}>
                        <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            Obra
                        </th>
                        <th className="px-4 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            Equipamentos
                        </th>
                        <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            Horas em {monthLabel}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {obras.map((o) => (
                        <Row key={o.id} obra={o} {...rowProps} />
                    ))}
                    {inactiveObras.length > 0 && (
                        <tr>
                            <td
                                colSpan={3}
                                className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400"
                            >
                                Finalizadas
                            </td>
                        </tr>
                    )}
                    {inactiveObras.map((o) => (
                        <Row key={o.id} obra={o} dim {...rowProps} />
                    ))}
                    {obras.length === 0 && inactiveObras.length === 0 && (
                        <tr>
                            <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">
                                Nenhuma obra cadastrada.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default ObraStartList;
