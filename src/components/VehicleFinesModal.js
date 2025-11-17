import React, { useMemo } from 'react';
import { X } from 'lucide-react';

// --- Modal de Multas do Veículo ---
// Extraído de VehiclePage.js
const VehicleFinesModal = ({ vehicle, fines = [], onClose }) => {
    const vehicleFines = useMemo(() => {
        return (fines || [])
            .filter(fine => fine.vehicleId === vehicle.id)
            // Ordena por data da infração (mais recente primeiro) usando new Date()
            .sort((a, b) => new Date(b.dataInfracao) - new Date(a.dataInfracao));
    }, [fines, vehicle]);

    // Função de badge
    const getStatusBadge = (status) => {
        switch (status) {
            case 'Paga': return 'bg-green-100 text-green-800';
            case 'Pendente': return 'bg-yellow-100 text-yellow-800';
            case 'Em Recurso': return 'bg-blue-100 text-blue-800';
            case 'Cancelada': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                {/* Cabeçalho */}
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold">Histórico de Multas do Veículo</h2>
                        <p className="text-gray-600 text-sm">{vehicle.registroInterno} - {vehicle.placa}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={18}/></button>
                </div>
                 {/* Conteúdo Rolável */}
                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    {vehicleFines.length > 0 ? (
                        <ul className="space-y-3">
                            {vehicleFines.map(fine => (
                                <li key={fine.id} className="p-4 bg-gray-50 rounded-lg border">
                                    <div className="flex flex-col sm:flex-row justify-between items-start">
                                        <div className="mb-2 sm:mb-0">
                                            <p className="font-semibold text-sm">{fine.descricao || 'Descrição não informada'}</p>
                                            {/* Acessa nome do funcionário com segurança */}
                                            <p className="text-xs text-gray-600 mt-1">Condutor: {fine.employeeInfo?.nome || 'Não informado'}</p>
                                             {/* Formata data da infração usando new Date() */}
                                            <p className="text-xs text-gray-600">Data: {fine.dataInfracao ? new Date(fine.dataInfracao).toLocaleDateString('pt-BR') : 'N/A'}</p>
                                        </div>
                                        <div className="text-left sm:text-right w-full sm:w-auto">
                                            <p className="font-bold text-red-600">R$ {(fine.valor || 0).toFixed(2)}</p>
                                            <span className={`mt-1 inline-block px-2 py-0.5 text-xs font-bold rounded-full ${getStatusBadge(fine.status)}`}>
                                                {fine.status || 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500 text-center italic">Nenhuma multa registrada para este veículo.</p>
                    )}
                </div>
                 {/* Rodapé Fixo */}
                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};

export default VehicleFinesModal;