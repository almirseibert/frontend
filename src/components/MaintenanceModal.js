import React, { useState } from 'react';
import { Loader, X } from 'lucide-react';

// --- Modal de Manutenção ---
// Extraído de VehiclePage.js
const MaintenanceModal = ({ user, vehicle, onClose, apiClient, setAlertMessage, reloadData }) => {
    const isCurrentlyInMaintenance = vehicle.status === 'Em Manutenção' || vehicle.status === 'Aguardando Manutenção';
    const [status, setStatus] = useState(isCurrentlyInMaintenance ? vehicle.status : 'Aguardando Manutenção');
     // Pega localização atual dos detalhes ou default
    const [location, setLocation] = useState(vehicle.maintenanceLocation?.details || 'Pátio MAK Lajeado');
    const [isSaving, setIsSaving] = useState(false);
    // Estado para local de finalização
    const [endLocation, setEndLocation] = useState('Pátio MAK Lajeado');


    const handleSubmit = async () => {
        setIsSaving(true);
        try {
            await apiClient.startVehicleMaintenance(vehicle.id, { status, location });
            setAlertMessage(`Status de manutenção atualizado para "${status}".`);
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao iniciar manutenção:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao atualizar o status de manutenção.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleEndMaintenance = async () => {
        setIsSaving(true);
        try {
            await apiClient.endVehicleMaintenance(vehicle.id, { location: endLocation }); // Envia o local de finalização
            setAlertMessage("Veículo liberado da manutenção.");
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao finalizar manutenção:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao finalizar a manutenção.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Gerir Manutenção</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                </div>
                <div className="p-6 space-y-4">
                     <p className="text-sm"><strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.placa}</p>
                    {/* Se NÃO está em manutenção, permite definir status e local de entrada */}
                    {!isCurrentlyInMaintenance ? (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Definir Status *</label>
                                <select value={status} onChange={e => setStatus(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm bg-white" required>
                                    <option value="Aguardando Manutenção">Aguardando Manutenção</option>
                                    <option value="Em Manutenção">Em Manutenção</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Localização da Manutenção *</label>
                                <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Ex: Oficina Terceirizada ou Pátio MAK Lajeado" className="mt-1 w-full p-2 border rounded-md text-sm" required />
                            </div>
                        </>
                    ) : (
                         // Se JÁ está em manutenção, mostra informações e permite finalizar
                        <div>
                            <p className="mb-2">O veículo está atualmente: <strong>{vehicle.status}</strong>.</p>
                            <p className="mb-4">Localização: <strong>{vehicle.maintenanceLocation?.details || 'Não informado'}</strong>.</p>
                            <hr className="my-4"/>
                            <label className="block text-sm font-medium text-gray-700">Local de Disponibilidade após Manutenção *</label>
                            <input type="text" value={endLocation} onChange={e => setEndLocation(e.target.value)} placeholder="Ex: Pátio MAK Lajeado" className="mt-1 w-full p-2 border rounded-md text-sm" required />
                        </div>
                    )}
                </div>
                {/* Rodapé com botões condicionais */}
                <div className="p-4 bg-gray-50 border-t flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Cancelar</button>
                    {isCurrentlyInMaintenance ? (
                        <button onClick={handleEndMaintenance} disabled={isSaving || !endLocation} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-green-300 flex items-center justify-center gap-2 text-sm">
                            {isSaving ? <><Loader className="animate-spin" size={18}/> Finalizando...</> : "Finalizar Manutenção"}
                        </button>
                    ) : (
                        <button onClick={handleSubmit} disabled={isSaving || !status || !location} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm">
                            {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : "Confirmar Status"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MaintenanceModal;