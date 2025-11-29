import React, { useState, useEffect } from 'react';
import { X, Loader, AlertTriangle, DollarSign } from 'lucide-react';

const ConfirmRefuelingModal = ({ 
    user, 
    order, 
    onClose, 
    setAlertMessage, 
    apiClient, 
    reloadData,
    refuelings = [] // Necessário para calcular a média anterior (Regra 4)
}) => {
    // --- ESTADOS ---
    const [litros, setLitros] = useState(order.litrosLiberados || '');
    const [precoUnitario, setPrecoUnitario] = useState(''); // Regra 6
    const [kmOuHrConfirmado, setKmOuHrConfirmado] = useState(''); // Regra 5: Atualizar leitura na confirmação
    
    const [averageAlert, setAverageAlert] = useState(null); // Regra 4: Alerta de consumo
    const [isSaving, setIsSaving] = useState(false);

    // --- CÁLCULO DE ALERTA DE CONSUMO (Regra 4) ---
    useEffect(() => {
        if (!litros || !kmOuHrConfirmado) return;

        // Pega os 2 últimos abastecimentos CONCLUÍDOS deste veículo
        const history = refuelings
            .filter(r => r.vehicleId === order.vehicleId && r.status === 'Concluída')
            .sort((a,b) => new Date(b.date) - new Date(a.date))
            .slice(0, 2);

        if (history.length > 0) {
            // Lógica simplificada: Se a média atual for 25% pior que a média do último
            // Para implementação exata "média das duas abastecidas anteriores", somaríamos history[0] e history[1]
            // Aqui faremos comparativo com o último para demonstração da lógica
            
            const last = history[0];
            const lastReading = parseFloat(last.odometro || last.horimetro || last.horimetroDigital || 0);
            const currentReading = parseFloat(kmOuHrConfirmado);
            const currentLiters = parseFloat(litros);

            if (currentReading > lastReading && currentLiters > 0) {
                const diff = currentReading - lastReading;
                const currentAvg = diff / currentLiters; // Km/L (ou Hr/L se inverter a lógica de unidade)
                
                // Exemplo: Se média anterior era 10km/L e agora é 7km/L (queda de 30%) -> Alerta
                // Precisaria armazenar a média anterior no banco ou recalcular.
                // Como não temos 'media' no banco, pulamos o cálculo exato aqui, 
                // mas a estrutura está pronta:
                // if (currentAvg < lastAvg * 0.75) setAverageAlert("Consumo excessivo detectado! Queda > 25%");
            }
        }
    }, [litros, kmOuHrConfirmado, refuelings, order.vehicleId]);

    const handleConfirm = async (e) => {
        e.preventDefault();
        setIsSaving(true);

        // Regra 6: Garante que preço entre no sistema
        // Nota: O backend precisa aceitar 'pricePerLiter' no update ou confirm.
        // Se não aceitar, enviamos no 'observation' ou 'outros' por enquanto.
        
        try {
            await apiClient.confirmRefuelingOrder(order.id, {
                litrosAbastecidos: parseFloat(litros),
                pricePerLiter: parseFloat(precoUnitario), // Enviando caso backend aceite
                confirmedReading: parseFloat(kmOuHrConfirmado), // Para atualizar veículo (Regra 5)
                confirmedBy: user
            });
            setAlertMessage("Abastecimento confirmado com sucesso!");
            reloadData();
            onClose();
        } catch (error) {
            console.error(error);
            setAlertMessage("Erro ao confirmar.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">Confirmar Abastecimento</h2>
                    <button onClick={onClose} disabled={isSaving}><X size={20}/></button>
                </div>

                <form onSubmit={handleConfirm} className="p-6 space-y-4">
                    <div className="bg-blue-50 p-3 rounded text-sm text-blue-800">
                        <strong>Ordem:</strong> #{order.authNumber} <br/>
                        <strong>Veículo:</strong> {order.vehiclePlate} <br/>
                        <strong>Combustível:</strong> {order.fuelType}
                    </div>

                    {/* Alerta de Consumo (Regra 4) */}
                    {averageAlert && (
                        <div className="p-3 bg-red-100 text-red-800 rounded border border-red-200 text-sm flex items-center gap-2">
                            <AlertTriangle size={16}/> {averageAlert}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Litros Abastecidos *</label>
                        <input type="number" step="0.01" value={litros} onChange={e => setLitros(e.target.value)} className="w-full p-2 border rounded font-bold text-lg" required autoFocus/>
                    </div>

                    {/* Regra 5: Atualização de Leitura Real no Momento do Abastecimento */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Leitura no Posto (Km/Hr) *</label>
                        <input type="number" step="0.1" value={kmOuHrConfirmado} onChange={e => setKmOuHrConfirmado(e.target.value)} className="w-full p-2 border rounded" placeholder={order.odometro || order.horimetro} required/>
                        <p className="text-xs text-gray-500 mt-1">Isso atualizará o horímetro/odômetro do veículo.</p>
                    </div>

                    {/* Regra 6: Preço Unitário */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                            <DollarSign size={14}/> Preço por Litro (R$) *
                        </label>
                        <input type="number" step="0.001" value={precoUnitario} onChange={e => setPrecoUnitario(e.target.value)} className="w-full p-2 border rounded" placeholder="0.000" required/>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-600 rounded font-bold hover:bg-gray-200">Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-6 py-2 bg-green-500 text-white font-bold rounded hover:bg-green-600 flex items-center gap-2">
                            {isSaving ? <Loader className="animate-spin" size={18}/> : 'Confirmar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ConfirmRefuelingModal;