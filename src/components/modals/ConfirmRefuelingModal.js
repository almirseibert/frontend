import React, { useState, useEffect } from 'react';
import { X, Loader, AlertTriangle, TrendingDown } from 'lucide-react';

const ConfirmRefuelingModal = ({ 
    user, 
    order, 
    onClose, 
    setAlertMessage, 
    apiClient, 
    reloadData,
    refuelings = [], 
    vehicleGroups = {}
}) => {
    const [litros, setLitros] = useState(order.litrosLiberados || '');
    const [litrosArla, setLitrosArla] = useState(order.litrosLiberadosArla || '');
    const [precoUnitario, setPrecoUnitario] = useState(''); // Regra 6: Preço pode ser preenchido aqui
    const [kmOuHrConfirmado, setKmOuHrConfirmado] = useState('');
    
    const [averageAlert, setAverageAlert] = useState(null); // Regra 4
    const [isSaving, setIsSaving] = useState(false);

    // --- REGRA 4: ALERTA DE CONSUMO EXCESSIVO (Queda de 25%) ---
    useEffect(() => {
        if (!litros || !kmOuHrConfirmado || parseFloat(litros) <= 0) return;
        
        // 1. Busca histórico anterior deste veículo
        const history = refuelings
            .filter(r => r.vehicleId === order.vehicleId && r.status === 'Concluída')
            .sort((a,b) => new Date(b.date) - new Date(a.date));
        
        // Precisa de pelo menos 1 abastecimento anterior para comparar o atual
        // Para a "média das duas últimas", precisaria de history[0] e history[1]
        if (history.length === 0) return;

        // Determina unidade (Km ou Hr)
        const currentReading = parseFloat(kmOuHrConfirmado);
        
        // Pega leitura anterior usada
        const lastRefuel = history[0];
        const lastReading = parseFloat(lastRefuel.horimetroDigital || lastRefuel.horimetroAnalogico || lastRefuel.horimetro || lastRefuel.odometro || 0);

        if (currentReading <= lastReading) return; // Leitura inválida para média

        const diff = currentReading - lastReading;
        const currentAverage = diff / parseFloat(litros); // Km/L ou Hr/L (Inverso para L/Hr se necessário, mas comparando a mesma unidade funciona)

        // Calcula média das duas anteriores (se existirem)
        let previousAveragesSum = 0;
        let count = 0;

        // Média do último abastecimento (history[0])
        // Precisa do history[1] para saber quanto rodou no history[0]
        if (history[1]) {
            const r1 = history[0];
            const r2 = history[1];
            const l1 = parseFloat(r1.litrosAbastecidos);
            const read1 = parseFloat(r1.horimetroDigital || r1.horimetro || r1.odometro);
            const read2 = parseFloat(r2.horimetroDigital || r2.horimetro || r2.odometro);
            if (l1 > 0 && read1 > read2) {
                previousAveragesSum += (read1 - read2) / l1;
                count++;
            }
        }
        
        // Média do penúltimo (history[1])
        if (history[2]) {
             const r2 = history[1];
             const r3 = history[2];
             const l2 = parseFloat(r2.litrosAbastecidos);
             const read2 = parseFloat(r2.horimetroDigital || r2.horimetro || r2.odometro);
             const read3 = parseFloat(r3.horimetroDigital || r3.horimetro || r3.odometro);
             if (l2 > 0 && read2 > read3) {
                 previousAveragesSum += (read2 - read3) / l2;
                 count++;
             }
        }

        if (count > 0) {
            const baselineAverage = previousAveragesSum / count;
            // Se a média atual for 25% menor que a baseline (consumo piorou drasticamente -> km/l caiu)
            // Ex: fazia 10km/l, agora faz 7km/l. 7 < 10 * 0.75 (7.5). Sim, alerta.
            // Atenção: Se a unidade for L/Hr (Máquinas), "piorar" significa AUMENTAR o valor.
            // Assumindo lógica de Km/L por padrão aqui. Para L/Hr precisaria inverter a lógica.
            
            // Simplificação para alerta visual genérico
            if (currentAverage < baselineAverage * 0.75) {
                setAverageAlert(`⚠️ ALERTA DE CONSUMO: A média atual (${currentAverage.toFixed(2)}) está 25% pior que a média recente (${baselineAverage.toFixed(2)}). Verifique possíveis vazamentos ou roubos.`);
            }
        }

    }, [litros, kmOuHrConfirmado, refuelings, order.vehicleId]);

    const handleConfirm = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await apiClient.confirmRefuelingOrder(order.id, {
                litrosAbastecidos: parseFloat(litros),
                litrosAbastecidosArla: order.needsArla ? parseFloat(litrosArla) : 0,
                pricePerLiter: parseFloat(precoUnitario) || 0, // Regra 6
                confirmedReading: parseFloat(kmOuHrConfirmado), // Regra 5: Atualiza o veículo
                confirmedBy: user
            });
            setAlertMessage("Abastecimento confirmado e veículo atualizado!");
            reloadData();
            onClose();
        } catch (error) {
            setAlertMessage("Erro ao confirmar: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-200">
                <div className="p-5 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h2 className="text-xl font-bold text-gray-800">Confirmar Abastecimento</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-full"><X size={20}/></button>
                </div>
                
                <form onSubmit={handleConfirm} className="p-6 space-y-5">
                    <div className="bg-blue-50 p-3 rounded-lg text-sm border border-blue-100">
                        <p><strong>Ordem:</strong> #{String(order.authNumber).padStart(6, '0')}</p>
                        <p><strong>Combustível:</strong> {order.fuelType}</p>
                        {order.litrosLiberados && <p><strong>Liberado:</strong> {order.litrosLiberados} L</p>}
                    </div>

                    {/* Regra 4: Alerta visual */}
                    {averageAlert && (
                        <div className="p-3 bg-red-50 text-red-800 rounded-lg border border-red-200 text-sm font-medium flex gap-2">
                            <TrendingDown className="shrink-0" size={18}/>
                            {averageAlert}
                        </div>
                    )}
                    
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Litros Reais Abastecidos *</label>
                        <input 
                            type="number" step="0.01" 
                            value={litros} onChange={e => setLitros(e.target.value)} 
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-lg font-bold text-gray-800" 
                            required 
                            autoFocus
                        />
                    </div>
                    
                    {order.needsArla && (
                         <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Litros Arla 32 *</label>
                            <input 
                                type="number" step="0.01" 
                                value={litrosArla} onChange={e => setLitrosArla(e.target.value)} 
                                className="w-full p-3 border rounded-lg" 
                                required 
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Leitura Painel (Km ou Horas) *</label>
                        <input 
                            type="number" step="0.1" 
                            value={kmOuHrConfirmado} onChange={e => setKmOuHrConfirmado(e.target.value)} 
                            className="w-full p-3 border rounded-lg" 
                            required 
                            placeholder="Ex: 150230"
                        />
                        <p className="text-xs text-gray-500 mt-1">Isso atualizará o cadastro do veículo (Regra 5).</p>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Preço do Litro (R$) (Opcional)</label>
                        <input 
                            type="number" step="0.001" 
                            value={precoUnitario} onChange={e => setPrecoUnitario(e.target.value)} 
                            className="w-full p-3 border rounded-lg" 
                            placeholder="Deixe em branco se for faturado depois"
                        />
                    </div>

                    <div className="pt-2 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-bold hover:bg-gray-200">Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-6 py-2.5 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 shadow-md flex items-center gap-2">
                            {isSaving ? <Loader className="animate-spin" size={18}/> : 'Confirmar & Atualizar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ConfirmRefuelingModal;