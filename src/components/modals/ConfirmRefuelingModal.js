import React, { useState, useEffect } from 'react';
import { X, Loader, TrendingDown, TrendingUp } from 'lucide-react';

const ConfirmRefuelingModal = ({ 
    user, 
    order, 
    onClose, 
    setAlertMessage, 
    apiClient, 
    reloadData,
    refuelings = [],
    obras = [], // Necessário para status
    expenses = [] // Necessário para status
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
    const [obraStatus, setObraStatus] = useState(null);

    // --- HELPER SAFE DATE (CRÍTICO PARA SAFARI) ---
    const safeDate = (dateInput) => {
        if (!dateInput) return new Date(0);
        try {
            const dateStr = dateInput.toString().replace(' ', 'T');
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? new Date(0) : d;
        } catch { return new Date(0); }
    };

    // PROGRESSO DA OBRA
    useEffect(() => {
        if (order.obraId && obras.length > 0) {
            const obra = obras.find(o => o.id === order.obraId);
            if (obra) {
                const totalFuelExpenses = expenses
                    .filter(e => e.obraId === order.obraId && (e.category === 'Combustível' || e.fuelType))
                    .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

                const valorTotalObra = parseFloat(obra.valorTotalContrato || obra.valorContrato || 0);
                
                if (valorTotalObra > 0) {
                    const percentual = (totalFuelExpenses / valorTotalObra) * 100;
                    setObraStatus({
                        totalGasto: totalFuelExpenses,
                        valorContrato: valorTotalObra,
                        percentual: percentual
                    });
                }
            }
        }
    }, [order.obraId, obras, expenses]);

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
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm border border-gray-200 text-xs">
                <div className="p-3 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h2 className="text-base font-bold text-gray-800">Confirmar Abastecimento</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full"><X size={16}/></button>
                </div>
                
                <form onSubmit={handleConfirm} className="p-4 space-y-3">
                    <div className="bg-blue-50 p-2 rounded text-blue-900 border border-blue-100">
                        <p><strong>Ordem:</strong> #{String(order.authNumber).padStart(6, '0')}</p>
                        <p><strong>Combustível:</strong> {order.fuelType}</p>
                        {order.litrosLiberados && <p><strong>Liberado:</strong> {order.litrosLiberados} L</p>}
                        {order.outros && <p className="mt-1 border-t border-blue-200 pt-1"><strong>Obs:</strong> {order.outros}</p>}
                    </div>

                    {/* Painel de Status da Obra (NOVO & COMPACTO) */}
                    {obraStatus && (
                        <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                            <h4 className="font-bold text-blue-800 flex items-center gap-2 mb-1">
                                <TrendingUp size={14}/> Progresso Financeiro
                            </h4>
                            <div className="flex justify-between text-blue-700">
                                <span>Gasto Comb.:</span>
                                <span>{obraStatus.totalGasto.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                            </div>
                            <div className="flex justify-between text-blue-700">
                                <span>Contrato:</span>
                                <span>{obraStatus.valorContrato.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                            </div>
                            <div className="mt-1 w-full bg-blue-200 rounded-full h-2">
                                <div className={`h-2 rounded-full ${obraStatus.percentual > 20 ? 'bg-red-500' : 'bg-blue-600'}`} style={{width: `${Math.min(obraStatus.percentual, 100)}%`}}></div>
                            </div>
                            <div className="text-right text-blue-600 font-bold mt-0.5">{obraStatus.percentual.toFixed(1)}% utilizado</div>
                        </div>
                    )}

                    {averageAlert && (
                        <div className="p-2 bg-red-50 text-red-800 rounded border border-red-200 font-medium flex gap-2">
                            <TrendingDown className="shrink-0" size={14}/>
                            {averageAlert}
                        </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block font-bold text-gray-700 mb-0.5 uppercase">Litros Comb. *</label>
                            <input type="number" step="0.01" value={litros} onChange={e => setLitros(e.target.value)} className="w-full p-1.5 border rounded font-bold" required autoFocus/>
                        </div>
                        <div>
                            <label className="block font-bold text-gray-700 mb-0.5 uppercase">Preço Litro (R$)</label>
                            <input type="number" step="0.001" value={precoUnitario} onChange={e => setPrecoUnitario(e.target.value)} className="w-full p-1.5 border rounded" placeholder="0.000"/>
                        </div>
                    </div>
                    
                    {order.needsArla && (
                         <div>
                            <label className="block font-bold text-gray-700 mb-0.5">Litros Arla 32 *</label>
                            <input type="number" step="0.01" value={litrosArla} onChange={e => setLitrosArla(e.target.value)} className="w-full p-1.5 border rounded" required />
                        </div>
                    )}

                    {order.outrosGeraValor && (
                        <div className="bg-yellow-50 p-2 rounded border border-yellow-200">
                            <label className="block font-bold text-yellow-900 mb-0.5">Valor "{order.outros}" (R$) *</label>
                            <input type="number" step="0.01" value={outrosValorConfirmado} onChange={e => setOutrosValorConfirmado(e.target.value)} className="w-full p-1.5 border border-yellow-400 rounded bg-white font-bold text-yellow-900" required placeholder="0.00"/>
                        </div>
                    )}

                    <div>
                        <label className="block font-bold text-gray-700 mb-0.5">Leitura Painel (Km/H) *</label>
                        <input type="number" step="0.1" value={kmOuHrConfirmado} onChange={e => setKmOuHrConfirmado(e.target.value)} className="w-full p-1.5 border rounded" required placeholder="Ex: 150230"/>
                        <p className="text-[10px] text-gray-500 mt-0.5">Sugerido com base na emissão. Corrija se necessário.</p>
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="px-3 py-2 bg-gray-100 text-gray-600 rounded font-bold hover:bg-gray-200">Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-3 py-2 bg-green-500 text-white font-bold rounded hover:bg-green-600 shadow flex items-center gap-1">
                            {isSaving ? <Loader className="animate-spin" size={14}/> : 'Confirmar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ConfirmRefuelingModal;