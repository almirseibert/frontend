import React, { useState } from 'react';
import { X, Loader, CheckCircle } from 'lucide-react';

const FinishObraModal = ({ obra, onClose, apiClient, reloadData, setAlertMessage }) => {
    const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            await apiClient.finishObra(obra.id, { dataFim });
            setAlertMessage('Obra finalizada com sucesso!');
            reloadData();
            onClose();
        } catch (error) {
             console.error("Erro ao finalizar obra:", error);
             setAlertMessage(error.message || 'Falha ao finalizar. Verifique se há veículos alocados.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
             <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-6 border-b flex justify-between items-center">
                    <h3 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                        <CheckCircle className="text-green-500"/> Finalizar Obra
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200"><X size={20}/></button>
                </div>
                <div className="p-6">
                    <p className="text-gray-600 mb-4 text-sm">
                        Deseja realmente encerrar a obra <strong>{obra?.nome}</strong>? 
                        Isso mudará o status para "Finalizada".
                    </p>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data de Finalização</label>
                        <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full p-2 border rounded text-sm" required/>
                    </div>
                </div>
                <div className="p-4 bg-gray-50 border-t flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded text-sm font-medium" disabled={isSubmitting}>Cancelar</button>
                    <button onClick={handleSubmit} disabled={isSubmitting} className="px-4 py-2 bg-green-600 text-white font-semibold rounded hover:bg-green-700 flex items-center justify-center gap-2 text-sm">
                        {isSubmitting ? <Loader className="animate-spin" size={16}/> : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FinishObraModal;