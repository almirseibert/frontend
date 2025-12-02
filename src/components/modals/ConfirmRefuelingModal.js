import React, { useState, useEffect } from 'react';
import { X, Loader, TrendingDown } from 'lucide-react';

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
    const [litrosArla, setLitrosArla] = useState(order.litrosLiberadosArla || '');
    const [precoUnitario, setPrecoUnitario] = useState(''); 
    
    // --- LÓGICA DE SUGESTÃO DE LEITURA (PREENCHIMENTO AUTOMÁTICO) ---
    // Tenta pegar a leitura informada na emissão da ordem para facilitar a vida do frentista/admin
    // Prioriza o Horímetro Geral, depois o Digital, depois o Odômetro
    const suggestedReading = order.horimetro || order.horimetroDigital || order.odometro || '';
    const [kmOuHrConfirmado, setKmOuHrConfirmado] = useState(suggestedReading);
    
    // Regra 3: Campo valor outros
    const [outrosValorConfirmado, setOutrosValorConfirmado] = useState('');

    const [averageAlert, setAverageAlert] = useState(null); 
    const [isSaving, setIsSaving] = useState(false);

    // --- HELPER SAFE DATE (CRÍTICO PARA SAFARI) ---
    const safeDate = (dateInput) => {
        if (!dateInput) return new Date(0);
        try {
            const dateStr = dateInput.toString().replace(' ', 'T');
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? new Date(0) : d;
        } catch { return new Date(0); }
    };

    // Alerta de Média (Regra 4) - Lógica Completa e Expandida
    useEffect(() => {
        setAverageAlert(null);

        if (!litros || !kmOuHrConfirmado || parseFloat(litros) <= 0) return;
        
        const history = refuelings
            .filter(r => r.vehicleId === order.vehicleId && r.status === 'Concluída')
            .sort((a,b) => safeDate(b.date).getTime() - safeDate(a.date).getTime());
        
        if (history.length === 0) return;

        const currentReading = parseFloat(kmOuHrConfirmado);
        const lastRefuel = history[0];
        const lastReading = parseFloat(lastRefuel.horimetroDigital || lastRefuel.horimetro || lastRefuel.odometro || 0);

        if (currentReading <= lastReading) return;

        const diff = currentReading - lastReading;
        const currentAverage = diff / parseFloat(litros); 

        // --- CÁLCULO DA MÉDIA HISTÓRICA ---
        let sumAvgs = 0;
        let count = 0;

        const getReading = (r) => parseFloat(r.horimetroDigital || r.horimetro || r.odometro || 0);

        if (history.length >= 2) {
            const r1 = history[0];
            const r2 = history[1];
            const l1 = parseFloat(r1.litrosAbastecidos || 0);
            const read1 = getReading(r1);
            const read2 = getReading(r2);

            if (l1 > 0 && read1 > read2) {
                const avg1 = (read1 - read2) / l1;
                sumAvgs += avg1;
                count++;
            }
        }
        
        if (history.length >= 3) {
             const r2 = history[1];
             const r3 = history[2];
             const l2 = parseFloat(r2.litrosAbastecidos || 0);
             const read2 = getReading(r2);
             const read3 = getReading(r3);

             if (l2 > 0 && read2 > read3) {
                 const avg2 = (read2 - read3) / l2;
                 sumAvgs += avg2;
                 count++;
             }
        }

        if (count > 0) {
            const baselineAverage = sumAvgs / count;
            if (currentAverage < (baselineAverage * 0.75)) {
                setAverageAlert(`⚠️ ALERTA DE CONSUMO: Média atual (${currentAverage.toFixed(2)}) caiu mais de 25% em relação à média recente (${baselineAverage.toFixed(2)}).`);
            }
        }

    }, [litros, kmOuHrConfirmado, refuelings, order.vehicleId]);

    const handleConfirm = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const payload = {
                litrosAbastecidos: parseFloat(litros) || 0,
                litrosAbastecidosArla: order.needsArla ? (parseFloat(litrosArla) || 0) : 0,
                pricePerLiter: parseFloat(precoUnitario) || 0,
                confirmedReading: parseFloat(kmOuHrConfirmado) || 0,
                confirmedBy: user,
                outrosValor: order.outrosGeraValor ? (parseFloat(outrosValorConfirmado) || 0) : 0
            };

            await apiClient.confirmRefuelingOrder(order.id, payload);
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
                
                <form onSubmit={handleConfirm} className="p-6 space-y-4">
                    <div className="bg-blue-50 p-3 rounded-lg text-sm border border-blue-100">
                        <p><strong>Ordem:</strong> #{String(order.authNumber).padStart(6, '0')}</p>
                        <p><strong>Combustível:</strong> {order.fuelType}</p>
                        {order.litrosLiberados && <p><strong>Liberado:</strong> {order.litrosLiberados} L</p>}
                        {order.outros && <p className="mt-1 border-t border-blue-200 pt-1"><strong>Obs:</strong> {order.outros}</p>}
                    </div>

                    {averageAlert && (
                        <div className="p-3 bg-red-50 text-red-800 rounded-lg border border-red-200 text-sm font-medium flex gap-2">
                            <TrendingDown className="shrink-0" size={18}/>
                            {averageAlert}
                        </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Litros Combustível *</label>
                            <input type="number" step="0.01" value={litros} onChange={e => setLitros(e.target.value)} className="w-full p-2 border rounded font-bold" required autoFocus/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Preço Litro (R$)</label>
                            <input type="number" step="0.001" value={precoUnitario} onChange={e => setPrecoUnitario(e.target.value)} className="w-full p-2 border rounded" placeholder="0.000"/>
                        </div>
                    </div>
                    
                    {order.needsArla && (
                         <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Litros Arla 32 *</label>
                            <input type="number" step="0.01" value={litrosArla} onChange={e => setLitrosArla(e.target.value)} className="w-full p-2 border rounded" required />
                        </div>
                    )}

                    {order.outrosGeraValor && (
                        <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                            <label className="block text-sm font-bold text-yellow-900 mb-1">Valor referente a "{order.outros}" (R$) *</label>
                            <input type="number" step="0.01" value={outrosValorConfirmado} onChange={e => setOutrosValorConfirmado(e.target.value)} className="w-full p-2 border border-yellow-400 rounded bg-white font-bold text-yellow-900" required placeholder="0.00"/>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Leitura Painel (Km ou Horas) *</label>
                        <input type="number" step="0.1" value={kmOuHrConfirmado} onChange={e => setKmOuHrConfirmado(e.target.value)} className="w-full p-2 border rounded" required placeholder="Ex: 150230"/>
                        <p className="text-xs text-gray-500 mt-1">Sugerido com base na emissão. Corrija se necessário.</p>
                    </div>

                    <div className="pt-2 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-bold hover:bg-gray-200">Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-6 py-2.5 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 shadow-md flex items-center gap-2">
                            {isSaving ? <Loader className="animate-spin" size={18}/> : 'Confirmar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ConfirmRefuelingModal;