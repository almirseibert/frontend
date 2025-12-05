import React, { useState } from 'react';
import { X, Info, Clock, CheckCircle, Loader } from 'lucide-react';

const InactivityAlertModal = ({ alert, onClose, onObserve, onProlong, apiClient, setAlertMessage }) => {
    const [prolongDays, setProlongDays] = useState(7);
    const [observation, setObservation] = useState(alert.observation || '');
    const [isSaving, setIsSaving] = useState(false);

    const { obra, operator, vehicle } = alert;

    const handleObserve = async () => {
        if (!observation) return setAlertMessage("Adicione uma observação.");
        setIsSaving(true);
        try {
            await apiClient.updateInactivityAlert(alert.id, {
                status: 'Observado',
                observation,
                dismissedAt: new Date().toISOString(),
            });
            onObserve();
        } catch (error) {
            setAlertMessage("Erro ao salvar.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleProlong = async () => {
        const days = parseInt(prolongDays, 10);
        if (isNaN(days) || days <= 0) return setAlertMessage("Dias inválidos.");

        setIsSaving(true);
        try {
            const newAlertUntilDate = new Date();
            newAlertUntilDate.setDate(newAlertUntilDate.getDate() + days);

            await apiClient.updateInactivityAlert(alert.id, {
                status: 'Prolongado',
                observation: observation || `Prolongado por ${days} dia(s).`,
                prolongedUntil: newAlertUntilDate.toISOString(),
                prolongedByDays: days,
            });
            onProlong();
        } catch (error) {
            setAlertMessage("Erro ao prorrogar.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
                <div className="p-4 border-b bg-blue-50 flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold text-blue-900">Alerta de Inatividade</h2>
                        <p className="text-sm text-blue-700 font-medium">{vehicle?.registroInterno} - {vehicle?.modelo}</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-blue-200 text-blue-800"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 text-sm text-yellow-800">
                        Veículo alocado na obra <strong>{obra?.nome}</strong> sem abastecimento há mais de 7 dias.
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                        <div><span className="font-bold block text-gray-800">Último Abast.:</span> {alert.lastRefuelingDate ? new Date(alert.lastRefuelingDate).toLocaleDateString() : 'N/A'}</div>
                        <div><span className="font-bold block text-gray-800">Operador:</span> {operator?.nome || 'N/A'}</div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observação / Justificativa *</label>
                        <textarea
                            value={observation}
                            onChange={e => setObservation(e.target.value)}
                            rows="3"
                            className="w-full p-2 border rounded bg-gray-50 text-sm focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Ex: Veículo parado por chuva..."
                        />
                    </div>

                    <div className="flex items-end gap-3 pt-4 border-t">
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-gray-500 uppercase">Prorrogar (Dias)</label>
                            <input
                                type="number"
                                value={prolongDays}
                                onChange={e => setProlongDays(e.target.value)}
                                min="1"
                                className="w-full p-2 border rounded mt-1 text-sm"
                            />
                        </div>
                        <button onClick={handleProlong} disabled={isSaving || !prolongDays} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex gap-2 items-center text-sm">
                            {isSaving ? <Loader size={16} className="animate-spin"/> : <Clock size={16}/>} Prorrogar
                        </button>
                    </div>
                </div>
                <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 rounded hover:bg-gray-100 text-sm text-gray-700">Cancelar</button>
                    <button onClick={handleObserve} disabled={isSaving || !observation} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex gap-2 items-center text-sm font-medium">
                        {isSaving ? <Loader size={16} className="animate-spin"/> : <CheckCircle size={16}/>} Resolver Alerta
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InactivityAlertModal;