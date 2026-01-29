import React, { useState, useEffect } from 'react';
import { X, Loader, HardHat, Truck, Briefcase, Info, AlertCircle } from 'lucide-react';

const EmployeeHistoryModal = ({ employee, onClose, apiClient }) => {
    // Inicializa com estrutura completa para evitar erros de undefined
    const [history, setHistory] = useState({ rh: [], obras: [], veiculos: [], outros: [] });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('veiculos');
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchHistory = async () => {
            if (!employee) return;
            setLoading(true);
            setError(null);
            try {
                const res = await apiClient.get(`/employees/${employee.id}/history`);
                // Garante que o objeto retornado tenha todas as chaves
                setHistory({
                    rh: res.data.rh || [],
                    obras: res.data.obras || [],
                    veiculos: res.data.veiculos || [],
                    outros: res.data.outros || []
                });
            } catch (err) {
                console.error("Erro ao buscar histórico", err);
                setError("Não foi possível carregar o histórico completo.");
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [employee, apiClient]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl h-[600px] flex flex-col animate-fadeIn">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            Histórico Completo
                        </h2>
                        <p className="text-xs text-gray-500 font-medium">{employee?.nome}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-full transition"><X size={20}/></button>
                </div>

                <div className="flex border-b bg-white">
                    <button 
                        onClick={() => setActiveTab('veiculos')}
                        className={`flex-1 py-3 text-sm font-bold flex justify-center items-center gap-2 border-b-2 transition ${activeTab === 'veiculos' ? 'border-yellow-400 text-gray-900 bg-yellow-50' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}
                    >
                        <Truck size={16}/> Veículos
                    </button>
                    <button 
                        onClick={() => setActiveTab('obras')}
                        className={`flex-1 py-3 text-sm font-bold flex justify-center items-center gap-2 border-b-2 transition ${activeTab === 'obras' ? 'border-yellow-400 text-gray-900 bg-yellow-50' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}
                    >
                        <HardHat size={16}/> Obras
                    </button>
                    <button 
                        onClick={() => setActiveTab('rh')}
                        className={`flex-1 py-3 text-sm font-bold flex justify-center items-center gap-2 border-b-2 transition ${activeTab === 'rh' ? 'border-yellow-400 text-gray-900 bg-yellow-50' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}
                    >
                        <Briefcase size={16}/> RH / Eventos
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
                    {loading ? (
                        <div className="flex justify-center items-center h-full text-gray-400">
                            <Loader className="animate-spin mr-2"/> Carregando...
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-full text-red-500 gap-2">
                            <AlertCircle size={24} />
                            <p>{error}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* ALERTA DE ALOCAÇÃO LEGADA/MANUAL (Se existir em 'outros') */}
                            {history.outros && history.outros.length > 0 && (
                                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg flex items-start gap-3 mb-4">
                                    <Info className="text-blue-600 shrink-0 mt-0.5" size={18}/>
                                    <div>
                                        <p className="text-sm font-bold text-blue-800">Registro de Alocação Atual/Manual</p>
                                        {history.outros.map((o, i) => (
                                            <p key={i} className="text-xs text-blue-700">{o.description}</p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ABA VEÍCULOS */}
                            {activeTab === 'veiculos' && (
                                history.veiculos && history.veiculos.length > 0 ? history.veiculos.map((h, i) => (
                                    <div key={i} className="bg-white border p-4 rounded-lg shadow-sm flex justify-between items-center hover:shadow-md transition">
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm">{h.modelo} - {h.placa}</p>
                                            <p className="text-xs text-gray-500">Reg: {h.registroInterno || 'N/A'} • {h.subGroup || 'Operacional'}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block">Desde: {new Date(h.assignedAt).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                )) : <p className="text-center text-gray-400 text-sm mt-10">Nenhum veículo alocado no histórico recente.</p>
                            )}

                            {/* ABA OBRAS */}
                            {activeTab === 'obras' && (
                                history.obras && history.obras.length > 0 ? history.obras.map((h, i) => (
                                    <div key={i} className="bg-white border p-4 rounded-lg shadow-sm flex justify-between items-center hover:shadow-md transition">
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm">{h.obraNome}</p>
                                            <p className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded inline-block mt-1">{h.role}</p>
                                        </div>
                                        <div className="text-right flex flex-col items-end gap-1">
                                            <span className="text-xs font-mono text-green-700 bg-green-50 px-2 py-0.5 rounded">IN: {new Date(h.startDate).toLocaleDateString()}</span>
                                            {h.endDate ? 
                                                <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">OUT: {new Date(h.endDate).toLocaleDateString()}</span> 
                                                : <span className="text-[10px] text-green-600 font-bold uppercase tracking-wider">Ativo</span>
                                            }
                                        </div>
                                    </div>
                                )) : <p className="text-center text-gray-400 text-sm mt-10">Nenhuma obra no histórico (obras_historico_veiculos).</p>
                            )}

                            {/* ABA RH (employee_events_history) */}
                            {activeTab === 'rh' && (
                                history.rh && history.rh.length > 0 ? history.rh.map((h, i) => (
                                    <div key={i} className={`bg-white border-l-4 p-4 rounded-r-lg shadow-sm hover:shadow-md transition ${h.description.includes('Desligamento') ? 'border-red-500' : 'border-green-500'}`}>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-bold text-gray-800 text-sm">{h.description}</p>
                                                <p className="text-xs text-gray-500 mt-1">{h.notes || 'Sem observações'}</p>
                                            </div>
                                            <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded">{new Date(h.date).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                )) : <p className="text-center text-gray-400 text-sm mt-10">Nenhum evento de RH registrado.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmployeeHistoryModal;