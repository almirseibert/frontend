import React, { useState, useEffect } from 'react';
import { X, Loader, HardHat, Truck } from 'lucide-react';

const EmployeeHistoryModal = ({ employee, onClose, apiClient }) => {
    const [history, setHistory] = useState({ obras: [], veiculos: [] });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('veiculos'); // Default para veículos

    useEffect(() => {
        const fetchHistory = async () => {
            if (!employee) return;
            setLoading(true);
            try {
                const res = await apiClient.get(`/employees/${employee.id}/history`);
                // Assume que o endpoint retorna { obras: [], veiculos: [] }
                setHistory(res.data || res);
            } catch (error) {
                console.error("Erro ao buscar histórico", error);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [employee, apiClient]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl h-[500px] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">Histórico de Alocações</h2>
                        <p className="text-xs text-gray-500">{employee?.nome}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-full"><X size={20}/></button>
                </div>

                <div className="flex border-b">
                    <button 
                        onClick={() => setActiveTab('veiculos')}
                        className={`flex-1 py-3 text-sm font-bold flex justify-center items-center gap-2 ${activeTab === 'veiculos' ? 'border-b-2 border-yellow-400 text-gray-900 bg-yellow-50' : 'text-gray-500'}`}
                    >
                        <Truck size={16}/> Veículos
                    </button>
                    <button 
                        onClick={() => setActiveTab('obras')}
                        className={`flex-1 py-3 text-sm font-bold flex justify-center items-center gap-2 ${activeTab === 'obras' ? 'border-b-2 border-yellow-400 text-gray-900 bg-yellow-50' : 'text-gray-500'}`}
                    >
                        <HardHat size={16}/> Obras
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex justify-center items-center h-full text-gray-400">
                            <Loader className="animate-spin mr-2"/> Carregando...
                        </div>
                    ) : (
                        <>
                            {activeTab === 'veiculos' && (
                                <div className="space-y-2">
                                    {history.veiculos && history.veiculos.length > 0 ? history.veiculos.map((h, i) => (
                                        <div key={i} className="border p-3 rounded-lg flex justify-between items-center hover:bg-gray-50">
                                            <div>
                                                <p className="font-bold text-gray-700 text-sm">{h.modelo || 'Veículo'} - {h.placa || 'N/A'}</p>
                                                <p className="text-xs text-gray-500">Operacional</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs font-mono text-blue-600">IN: {new Date(h.assignedAt).toLocaleDateString()}</p>
                                                {h.unassignedAt && <p className="text-xs text-gray-400">OUT: {new Date(h.unassignedAt).toLocaleDateString()}</p>}
                                            </div>
                                        </div>
                                    )) : <p className="text-center text-gray-400 text-sm mt-10">Nenhum registro de veículo encontrado.</p>}
                                </div>
                            )}

                            {activeTab === 'obras' && (
                                <div className="space-y-2">
                                    {history.obras && history.obras.length > 0 ? history.obras.map((h, i) => (
                                        <div key={i} className="border p-3 rounded-lg flex justify-between items-center hover:bg-gray-50">
                                            <div>
                                                <p className="font-bold text-gray-700 text-sm">{h.obraNome || 'Obra'}</p>
                                                <p className="text-xs text-gray-500">{h.role || 'Colaborador'}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs font-mono text-green-600">IN: {new Date(h.startDate).toLocaleDateString()}</p>
                                                {h.endDate && <p className="text-xs font-mono text-gray-400">OUT: {new Date(h.endDate).toLocaleDateString()}</p>}
                                            </div>
                                        </div>
                                    )) : <p className="text-center text-gray-400 text-sm mt-10">Nenhum registro de obra encontrado.</p>}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmployeeHistoryModal;