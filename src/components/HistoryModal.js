import React, { useMemo, useState, useEffect } from 'react';
import { X, Loader } from 'lucide-react';

// --- Modal de Histórico (Corrigido para buscar dados se necessário) ---
const HistoryModal = ({ vehicle, onClose, obras = [], apiClient }) => {
    
    const [fetchedHistory, setFetchedHistory] = useState(null);
    const [loading, setLoading] = useState(false);

    // Efeito para buscar histórico se não vier na prop (comum em listagens resumidas)
    useEffect(() => {
        const loadHistory = async () => {
            if (vehicle && (!vehicle.history || vehicle.history.length === 0) && apiClient) {
                setLoading(true);
                try {
                    const fullVehicleData = await apiClient.getVehicleById(vehicle.id);
                    if (fullVehicleData && fullVehicleData.history) {
                        setFetchedHistory(fullVehicleData.history);
                    }
                } catch (error) {
                    console.error("Erro ao carregar histórico:", error);
                } finally {
                    setLoading(false);
                }
            }
        };

        loadHistory();
    }, [vehicle, apiClient]);

    // Usa o histórico passado via prop OU o buscado
    const historySource = fetchedHistory || vehicle?.history || [];

    const history = useMemo(() => {
        if (!Array.isArray(historySource)) return [];

        // Ordena o histórico recebido da API (mais recente primeiro)
        return [...historySource].sort((a,b) => {
            const dateA = a.startDate ? new Date(a.startDate) : 0;
            const dateB = b.startDate ? new Date(b.startDate) : 0;
            return dateB - dateA; // Descendente
        });
    }, [historySource]);

    // Função para renderizar detalhes (ajustada para API data)
    const renderHistoryDetail = (h) => {
        const details = h.details || {};
        const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleString('pt-BR') : 'N/A';
        const startDate = formatDate(h.startDate);
        const endDate = h.endDate ? formatDate(h.endDate) : 'Presente';

        switch(h.historyType || h.type) { 
            case 'obra':
                 // Determina leitura
                 const leituraEntrada = details.odometroInicial || details.horimetroInicial || 'N/A';
                 const leituraSaida = details.odometroFinal || details.horimetroFinal || (h.endDate ? '?' : 'Atual');
                 const obraNome = details.obraNome || (obras.find(o => o.id === details.obraId)?.nome) || 'Obra Desconhecida';
                
                return (
                    <>
                        <div className="flex justify-between items-start">
                            <span className="font-bold text-gray-800">Alocação em Obra</span>
                            <span className="text-xs text-gray-400">{startDate} - {endDate}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">Obra: <strong>{obraNome}</strong></p>
                        <p className="text-xs text-gray-500">Leitura: {leituraEntrada} {'->'} {leituraSaida}</p>
                    </>
                );
            case 'operacional':
                return (
                    <>
                         <div className="flex justify-between items-start">
                            <span className="font-bold text-gray-800">Alocação Operacional</span>
                            <span className="text-xs text-gray-400">{startDate} - {endDate}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">Grupo: {details.subGroup} | Func: {details.employeeName || 'N/A'}</p>
                        <p className="text-xs text-gray-500 italic">Obs: {details.observacoes}</p>
                    </>
                );
            case 'manutencao':
                 return (
                    <>
                         <div className="flex justify-between items-start">
                            <span className="font-bold text-gray-800">Manutenção</span>
                            <span className="text-xs text-gray-400">{startDate} - {endDate}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">Status: {details.status} | Local: {details.location}</p>
                    </>
                );
             case 'multa':
                 return (
                    <>
                        <div className="flex justify-between items-start">
                            <span className="font-bold text-red-800">Infração de Trânsito</span>
                            <span className="text-xs text-gray-400">{startDate}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">Motorista: {details.motorista}</p>
                        <p className="text-xs text-gray-500">Valor: R$ {details.valor} ({details.status})</p>
                    </>
                 );
            default:
                return (
                    <>
                        <span className="font-bold text-gray-700 capitalize">{h.historyType || h.type}</span>
                        <span className="block text-xs text-gray-400">{startDate}</span>
                        <p className="text-xs text-gray-500">{JSON.stringify(details)}</p>
                    </>
                );
        }
    };

    const getHistoryStyle = (type) => {
        switch(type) {
            case 'obra': return 'bg-green-50 border-l-4 border-green-500';
            case 'operacional': return 'bg-blue-50 border-l-4 border-blue-500';
            case 'manutencao': return 'bg-yellow-50 border-l-4 border-yellow-500';
            case 'multa': return 'bg-red-50 border-l-4 border-red-500';
            default: return 'bg-gray-50 border-l-4 border-gray-300';
        }
    };

    if (!vehicle) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-scale-in">
                 {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Histórico de Eventos</h3>
                        <p className="text-xs text-gray-500">{vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo}</p>
                    </div>
                     <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={18}/></button>
                </div>
                 {/* Conteúdo Rolável */}
                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="flex justify-center items-center h-20">
                            <Loader className="animate-spin text-yellow-500" size={24} />
                            <span className="ml-2 text-gray-500">Carregando histórico...</span>
                        </div>
                    ) : history.length > 0 ? (
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
                 {/* Rodapé Fixo */}\r\n                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};

export default HistoryModal;