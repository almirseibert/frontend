import React, { useState, useMemo } from 'react';
import { PlusCircle } from 'lucide-react';
import ProtectedComponent from '../components/ProtectedComponent';

// Importação dos Componentes Separados
import RefuelingHistory from '../components/RefuelingHistory';
import RefuelingOrderModal from '../components/modals/RefuelingOrderModal';
import ConfirmRefuelingModal from '../components/modals/ConfirmRefuelingModal';

// OBS: Mantive a função generateAuthorizationPDF aqui ou pode ser movida para um utils/pdfGenerator.js
// Para simplificar, vou assumir que ela é passada via props ou importada se for externa. 
// Se precisar que ela fique no arquivo, avise. Por enquanto, vou omitir para focar na estrutura.

const RefuelingPage = ({
    user,
    vehicles = [],
    obras = [],
    partners = [],
    refuelings = [], 
    employees = [],
    setAlertMessage,
    PasswordConfirmationModal, 
    ConfirmationModal,
    extraObraOptions = [],
    vehicleGroups = {},
    apiClient, 
    reloadData
}) => {
    // --- ESTADOS ---
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [orderToConfirm, setOrderToConfirm] = useState(null);
    const [selectedVehicleId, setSelectedVehicleId] = useState('');

    // --- FILTROS ---
    const openRefuelings = useMemo(() => {
        return refuelings
            .filter(r => r.status === 'Aberta')
            .sort((a,b) => (b.authNumber || 0) - (a.authNumber || 0));
    }, [refuelings]);

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 animate-fadeIn">
            {/* Cabeçalho */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Controle de Abastecimento</h1>
                    <p className="text-gray-500 mt-1">Gerenciamento de ordens, médias e custos.</p>
                </div>
                <ProtectedComponent requiredPermission="editor">
                    <button 
                        onClick={() => { setEditingOrder(null); setIsOrderModalOpen(true); }} 
                        className="flex items-center gap-2 px-6 py-3 bg-yellow-400 text-gray-900 font-bold rounded-lg shadow-lg hover:bg-yellow-500 transition active:scale-95"
                    >
                        <PlusCircle size={20} /> Nova Ordem
                    </button>
                </ProtectedComponent>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* ESQUERDA: Ordens em Aberto */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">Ordens Pendentes</h2>
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {openRefuelings.length === 0 ? (
                            <p className="text-center text-gray-400 py-10 italic">Nenhuma ordem pendente.</p>
                        ) : (
                            openRefuelings.map(order => {
                                const vehicle = vehicles.find(v => v.id === order.vehicleId);
                                return (
                                    <div key={order.id} className="p-4 border border-l-4 border-l-yellow-400 rounded-lg hover:shadow-md transition bg-gray-50">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-bold text-lg text-gray-800">
                                                    #{String(order.authNumber).padStart(6, '0')} 
                                                    <span className="text-sm font-normal text-gray-500 ml-2">| {new Date(order.date).toLocaleDateString()}</span>
                                                </h3>
                                                <p className="text-sm font-medium text-gray-700">{vehicle?.registroInterno} - {vehicle?.placa}</p>
                                                <p className="text-xs text-gray-500">{order.partnerName}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => { setOrderToConfirm(order); setIsConfirmModalOpen(true); }}
                                                    className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded hover:bg-green-200 transition"
                                                >
                                                    Confirmar
                                                </button>
                                                <button 
                                                    onClick={() => { setEditingOrder(order); setIsOrderModalOpen(true); }}
                                                    className="px-3 py-1 bg-gray-200 text-gray-600 text-xs font-bold rounded hover:bg-gray-300 transition"
                                                >
                                                    Editar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* DIREITA: Histórico e Consultas */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">Histórico & Médias</h2>
                    
                    <div className="mb-6">
                        <label className="block text-sm font-bold text-gray-700 mb-2">Selecione o Veículo</label>
                        <select 
                            value={selectedVehicleId} 
                            onChange={(e) => setSelectedVehicleId(e.target.value)} 
                            className="w-full p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition"
                        >
                            <option value="">-- Buscar Veículo --</option>
                            {[...vehicles].sort((a,b) => a.registroInterno.localeCompare(b.registroInterno)).map(v => (
                                <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa} ({v.modelo})</option>
                            ))}
                        </select>
                    </div>

                    <RefuelingHistory 
                        vehicleId={selectedVehicleId}
                        refuelings={refuelings}
                        vehicles={vehicles}
                        vehicleGroups={vehicleGroups}
                        generateAuthorizationPDF={() => {}} // Passar a função real aqui se necessário
                    />
                </div>
            </div>

            {/* MODAIS */}
            {isOrderModalOpen && (
                <RefuelingOrderModal 
                    user={user}
                    orderToEdit={editingOrder}
                    vehicles={vehicles}
                    obras={obras}
                    partners={partners}
                    employees={employees}
                    refuelings={refuelings}
                    vehicleGroups={vehicleGroups}
                    extraObraOptions={extraObraOptions}
                    onClose={() => setIsOrderModalOpen(false)}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    reloadData={reloadData}
                    PasswordConfirmationModal={PasswordConfirmationModal}
                />
            )}

            {isConfirmModalOpen && orderToConfirm && (
                <ConfirmRefuelingModal 
                    user={user}
                    order={orderToConfirm}
                    onClose={() => setIsConfirmModalOpen(false)}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    reloadData={reloadData}
                    refuelings={refuelings}
                />
            )}
        </div>
    );
};

export default RefuelingPage;