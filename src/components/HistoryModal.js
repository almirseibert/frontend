import React, { useMemo } from 'react';
import { X } from 'lucide-react';

// --- Modal de Histórico ---
// Extraído de VehiclePage.js
const HistoryModal = ({ vehicle, onClose, obras = [] }) => {
    // Assume que vehicle.history é populado pela API (vinda da tabela vehicle_history)
    const history = useMemo(() => {
        if (!vehicle || !Array.isArray(vehicle.history)) return [];

        // Ordena o histórico recebido da API (mais recente primeiro)
        return [...vehicle.history].sort((a,b) => {
            const dateA = a.startDate ? new Date(a.startDate) : 0;
            const dateB = b.startDate ? new Date(b.startDate) : 0;
            return dateB - dateA; // Descendente
        });
    }, [vehicle]);

    // Função para renderizar detalhes (ajustada para API data)
    const renderHistoryDetail = (h) => {
        const details = h.details || {};
         // Formata datas da API
         const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleString('pt-BR') : 'N/A';
        const startDate = formatDate(h.startDate);
        const endDate = h.endDate ? formatDate(h.endDate) : 'Presente';

        switch(h.historyType || h.type) { // Usa historyType (nome da coluna API) ou type (nome antigo)
            case 'obra':
                 // Determina leitura com base nos campos existentes
                 const readingLabel = details.odometroEntrada != null ? 'Odômetro' : (details.horimetroEntrada != null ? 'Horímetro' : 'Leitura');
                 const readingIn = details.odometroEntrada ?? details.horimetroEntrada ?? 'N/A';
                 const readingOut = details.odometroSaida ?? details.horimetroSaida ?? 'N/A';

                return (
                    <>
                        <p className="font-semibold">Alocação em Obra: {details.obraNome || 'Não informado'}</p>
                        <p className="text-xs text-gray-600 mt-0.5">Funcionário: {details.employeeName || 'Não informado'}</p>
                        <p className="text-xs text-gray-600">Período: {startDate} - {endDate}</p>
                        <p className="text-xs text-gray-500 mt-1">{readingLabel} Entrada: {readingIn}</p>
                        {h.endDate && <p className="text-xs text-gray-500">{readingLabel} Saída: {readingOut}</p>}
                    </>
                );
            case 'operacional':
                return (
                     <>
                        <p className="font-semibold">Alocação Operacional: {details.subGroup || 'Não informado'}</p>
                        <p className="text-xs text-gray-600 mt-0.5">Funcionário: {details.employeeName || 'Não informado'}</p>
                        <p className="text-xs text-gray-600">Período: {startDate} - {endDate}</p>
                        {details.observacoes && <p className="text-xs text-gray-500 italic mt-1">Obs: "{details.observacoes}"</p>}
                    </>
                );
            case 'manutencao':
                 return (
                     <>
                        <p className="font-semibold">Manutenção</p>
                        <p className="text-xs text-gray-600 mt-0.5">Período: {startDate} - {endDate}</p>
                         {/* Detalhes podem ser string ou objeto */}
                        {details && typeof details === 'string' && <p className="text-xs text-gray-500 mt-1">{details}</p>}
                         {details && typeof details === 'object' && details.details && <p className="text-xs text-gray-500 mt-1">{details.details}</p>}
                    </>
                );
            default:
                return <p className="text-xs italic text-gray-400">Registro de tipo: {h.historyType || h.type || 'Desconhecido'}</p>;
        }
    };

    // Estilo da linha (mantido)
    const getHistoryStyle = (type) => {
         const historyType = type || 'desconhecido'; // Usa fallback
        switch(historyType.toLowerCase()) {
            case 'obra': return 'bg-green-50 border-l-4 border-green-500';
            case 'operacional': return 'bg-blue-50 border-l-4 border-blue-500';
            case 'manutencao': return 'bg-red-50 border-l-4 border-red-500';
            default: return 'bg-gray-100 border-l-4 border-gray-400';
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                {/* Cabeçalho */}
                <div className="p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold">Histórico Completo do Veículo</h2>
                        <p className="text-gray-600 text-sm">{vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo}</p>
                    </div>
                     <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={18}/></button>
                </div>
                 {/* Conteúdo Rolável */}
                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    {history.length > 0 ? (
                        <ul className="space-y-3">
                            {history.map((h, index) => (
                                // Usa um ID único se disponível, senão combina ID do veículo e timestamp
                                <li key={h.id || `${vehicle.id}-${h.startDate || index}`} className={`p-3 rounded-r-lg ${getHistoryStyle(h.historyType || h.type)}`}>
                                    {renderHistoryDetail(h)}
                                </li>
                             ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500 text-center italic">Nenhum histórico encontrado para este veículo.</p>
                    )}
                </div>
                 {/* Rodapé Fixo */}
                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};

export default HistoryModal;