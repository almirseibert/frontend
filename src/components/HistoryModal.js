import React, { useMemo, useState, useEffect } from 'react';
import { X, Loader, MapPin, Wrench, FileText, AlertTriangle, User, ArrowRight } from 'lucide-react';

const HistoryModal = ({ vehicle, onClose, obras = [], apiClient, employees = [] }) => {
    
    const [fetchedHistory, setFetchedHistory] = useState(null);
    const [loading, setLoading] = useState(false);

    // Busca histórico completo se não vier na prop
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

    const historySource = fetchedHistory || vehicle?.history || [];

    const history = useMemo(() => {
        if (!Array.isArray(historySource)) return [];
        return [...historySource].sort((a,b) => {
            const dateA = a.startDate ? new Date(a.startDate) : 0;
            const dateB = b.startDate ? new Date(b.startDate) : 0;
            return dateB - dateA;
        });
    }, [historySource]);

    // Helper para extrair leitura de forma robusta
    const getReading = (details, type) => {
        if (!details) return 'N/A';
        
        if (type === 'entrada') {
            return details.odometroInicial || 
                   details.horimetroInicial || 
                   details.leituraEntrada || 
                   details.readingValue || // Em alguns casos de alocação simples
                   'N/A';
        }
        
        if (type === 'saida') {
            return details.odometroFinal || 
                   details.horimetroFinal || 
                   details.leituraSaida || 
                   details.readingValueFinal || // Caso hipotético
                   null; // Retorna null para indicar que ainda não saiu
        }
        return 'N/A';
    };

    const renderHistoryDetail = (h) => {
        const details = h.details || {};
        const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString('pt-BR') : 'N/A';
        const startDate = formatDate(h.startDate);
        const endDate = h.endDate ? formatDate(h.endDate) : 'Atual';

        switch(h.historyType || h.type) { 
            case 'obra':
                 const leituraEntrada = getReading(details, 'entrada');
                 const leituraSaida = getReading(details, 'saida') || (h.endDate ? '?' : 'Em uso');
                 const obraNome = details.obraNome || (obras.find(o => o.id === details.obraId)?.nome) || 'Obra Desconhecida';
                 
                 // Tenta pegar o nome do funcionário dos detalhes ou busca na lista de funcionários
                 const employeeName = details.employeeName || (employees.find(e => e.id === details.employeeId)?.nome) || 'Não informado';
                
                return (
                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-800 flex items-center gap-1"><MapPin size={12}/> Alocação em Obra</span>
                            <span className="text-[10px] text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded-full">{startDate} - {endDate}</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <p className="text-gray-700 truncate" title={obraNome}>Obra: <strong>{obraNome}</strong></p>
                            <p className="text-gray-600 flex items-center gap-1 truncate" title={employeeName}><User size={10} /> {employeeName}</p>
                        </div>
                        
                        <div className="flex items-center gap-2 text-[11px] text-gray-600 bg-gray-50 p-1.5 rounded border border-gray-100 mt-0.5">
                            <span className="font-medium text-gray-500">Leituras:</span>
                            <span>{leituraEntrada}</span>
                            <ArrowRight size={10} className="text-gray-400" />
                            <span className={leituraSaida === 'Em uso' ? 'text-green-600 font-bold' : ''}>{leituraSaida}</span>
                        </div>
                        
                        {details.observacoes && (
                            <p className="text-[10px] text-gray-500 italic mt-0.5 border-l-2 border-green-200 pl-1.5">
                                "{details.observacoes}"
                            </p>
                        )}
                    </div>
                );
            case 'operacional':
                return (
                    <div className="flex flex-col gap-1">
                         <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-800 flex items-center gap-1"><FileText size={12}/> Operacional</span>
                            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{startDate} - {endDate}</span>
                        </div>
                        <p className="text-xs text-gray-600">Grupo: {details.subGroup}</p>
                        {details.observacoes && (
                             <p className="text-[10px] text-gray-500 italic truncate max-w-[200px]">Obs: {details.observacoes}</p>
                        )}
                    </div>
                );
            case 'manutencao':
                 return (
                    <div className="flex flex-col gap-1">
                         <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-800 flex items-center gap-1"><Wrench size={12}/> Manutenção</span>
                            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{startDate} - {endDate}</span>
                        </div>
                        <p className="text-xs text-gray-600">{details.status} - {details.location}</p>
                    </div>
                );
             case 'multa':
                 return (
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-red-700 flex items-center gap-1"><AlertTriangle size={12}/> Multa</span>
                            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{startDate}</span>
                        </div>
                        <p className="text-xs text-gray-600">R$ {details.valor} ({details.status})</p>
                    </div>
                 );
            default:
                return (
                    <div>
                        <span className="font-bold text-gray-700 capitalize text-xs">{h.historyType || h.type}</span>
                        <span className="block text-[10px] text-gray-400">{startDate}</span>
                    </div>
                );
        }
    };

    const getHistoryStyle = (type) => {
        switch(type) {
            case 'obra': return 'bg-green-50 border-l-2 border-green-500 hover:bg-green-100 transition-colors';
            case 'operacional': return 'bg-blue-50 border-l-2 border-blue-500 hover:bg-blue-100 transition-colors';
            case 'manutencao': return 'bg-yellow-50 border-l-2 border-yellow-500 hover:bg-yellow-100 transition-colors';
            case 'multa': return 'bg-red-50 border-l-2 border-red-500 hover:bg-red-100 transition-colors';
            default: return 'bg-gray-50 border-l-2 border-gray-300';
        }
    };

    if (!vehicle) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[85vh] flex flex-col animate-scale-in">
                <div className="p-3 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <div>
                        <h3 className="text-base font-bold text-gray-800">Histórico de Eventos</h3>
                        <p className="text-[10px] text-gray-500 font-mono">{vehicle.registroInterno} • {vehicle.placa}</p>
                    </div>
                     <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-200 transition"><X size={16}/></button>
                </div>
                
                <div className="p-3 flex-1 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col justify-center items-center h-20 text-xs">
                            <Loader className="animate-spin text-yellow-500 mb-2" size={20} />
                            <span className="text-gray-500">Buscando histórico completo...</span>
                        </div>
                    ) : history.length > 0 ? (
                        <ul className="space-y-2">
                            {history.map((h, index) => (
                                <li key={h.id || index} className={`p-2.5 rounded-md shadow-sm border border-transparent ${getHistoryStyle(h.historyType || h.type)}`}>
                                    {renderHistoryDetail(h)}
                                </li>
                             ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500 text-center text-sm py-4">Nenhum histórico encontrado.</p>
                    )}
                </div>
                
                <div className="p-3 bg-gray-50 border-t flex justify-end rounded-b-lg">
                    <button onClick={onClose} className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-xs font-bold text-gray-700 transition">Fechar</button>
                </div>
            </div>
        </div>
    );
};

export default HistoryModal;