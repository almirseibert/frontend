import React, { useState, useEffect } from 'react';
import { X, Loader, AlertTriangle, DollarSign } from 'lucide-react';

const ConfirmRefuelingModal = ({ 
    user, 
    order, 
    onClose, 
    setAlertMessage, 
    apiClient, 
    reloadData,
    refuelings = [] 
}) => {
    const [litros, setLitros] = useState(order.litrosLiberados || '');
    const [precoUnitario, setPrecoUnitario] = useState(''); 
    const [kmOuHrConfirmado, setKmOuHrConfirmado] = useState('');
    const [averageAlert, setAverageAlert] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // Alerta de Média
    useEffect(() => {
        if (!litros || !kmOuHrConfirmado) return;
        
        // Pega último abastecimento deste veículo
        const last = refuelings
            .filter(r => r.vehicleId === order.vehicleId && r.status === 'Concluída')
            .sort((a,b) => new Date(b.date) - new Date(a.date))[0];

        if (last) {
            const lastReading = parseFloat(last.odometro || last.horimetro || last.horimetroDigital || 0);
            const currentReading = parseFloat(kmOuHrConfirmado);
            
            if (currentReading > lastReading) {
                // Cálculo simples para alerta (pode ser refinado)
                // Se a diferença for muito pequena para os litros informados -> Consumo Alto
            }
        }
    }, [litros, kmOuHrConfirmado, refuelings, order.vehicleId]);

    const handleConfirm = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await apiClient.confirmRefuelingOrder(order.id, {
                litrosAbastecidos: parseFloat(litros),
                pricePerLiter: parseFloat(precoUnitario),
                confirmedReading: parseFloat(kmOuHrConfirmado),
                confirmedBy: user
            });
            setAlertMessage("Confirmado com sucesso!");
            reloadData();
            onClose();
        } catch (error) {
            setAlertMessage("Erro ao confirmar.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Confirmar Abastecimento</h2>
                    <button onClick={onClose}><X size={20}/></button>
                </div>
                <form onSubmit={handleConfirm} className="p-6 space-y-4">
                    <div className="bg-blue-50 p-3 rounded text-sm">
                        <strong>Ordem:</strong> #{order.authNumber}
                    </div>
                    {averageAlert && <div className="p-3 bg-red-100 text-red-800 rounded">{averageAlert}</div>}
                    
                    <div>
                        <label className="block text-sm font-bold mb-1">Litros *</label>
                        <input type="number" step="0.01" value={litros} onChange={e => setLitros(e.target.value)} className="w-full p-2 border rounded" required/>
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">Leitura Real (Km/Hr) *</label>
                        <input type="number" step="0.1" value={kmOuHrConfirmado} onChange={e => setKmOuHrConfirmado(e.target.value)} className="w-full p-2 border rounded" required placeholder="Odômetro/Horímetro do painel"/>
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">Preço Litro (R$) *</label>
                        <input type="number" step="0.001" value={precoUnitario} onChange={e => setPrecoUnitario(e.target.value)} className="w-full p-2 border rounded" required/>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-600 rounded font-bold">Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-6 py-2 bg-green-500 text-white font-bold rounded">
                            {isSaving ? <Loader className="animate-spin" size={18}/> : 'Confirmar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ConfirmRefuelingModal;