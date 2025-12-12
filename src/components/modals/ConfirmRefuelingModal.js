import React, { useState, useEffect } from 'react';
import { X, Loader, TrendingDown, TrendingUp, Lock } from 'lucide-react';

const ConfirmRefuelingModal = ({ 
    user, 
    order, 
    onClose, 
    setAlertMessage, 
    apiClient, 
    reloadData,
    refuelings = [],
    obras = [],
    expenses = [],
    vehicles = [], 
    PasswordConfirmationModal 
}) => {
    const [litros, setLitros] = useState(order.litrosLiberados || '');
    const [litrosArla, setLitrosArla] = useState(order.litrosLiberadosArla || '');
    const [precoUnitario, setPrecoUnitario] = useState(''); 
    
    // Novo Estado para NF (Inicializa com valor existente ou vazio)
    const [invoiceNumber, setInvoiceNumber] = useState(order.invoiceNumber || '');

    const suggestedReading = order.horimetro || order.horimetroDigital || order.odometro || '';
    const [kmOuHrConfirmado, setKmOuHrConfirmado] = useState(suggestedReading);
    
    const [outrosValorConfirmado, setOutrosValorConfirmado] = useState('');
    const [averageAlert, setAverageAlert] = useState(null); 
    const [isSaving, setIsSaving] = useState(false);
    
    // --- ESTADO PROGRESSO FINANCEIRO ---
    const [obraStatus, setObraStatus] = useState(null);

    // --- ESTADO BLOQUEIO ---
    const [blockReason, setBlockReason] = useState(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    // --- CÁLCULO DE PROGRESSO (Baseado na Obra da Ordem) ---
    useEffect(() => {
        if (order.obraId && obras.length > 0) { 
            const obra = obras.find(o => o.id === order.obraId);
            
            if (!obra) {
                setObraStatus(null);
                return;
            }

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
            } else {
                setObraStatus(null);
            }
        } else {
            setObraStatus(null);
        }
    }, [order.obraId, obras, expenses]);

    // --- VALIDAÇÃO RIGOROSA DE LEITURA ---
    useEffect(() => {
        setBlockReason(null);
        if (!kmOuHrConfirmado || !order.vehicleId) return;

        const vehicle = vehicles.find(v => v.id === order.vehicleId);
        if (!vehicle) return;

        // Determina tipo e leitura anterior
        const isTruck = vehicle.tipo.includes('Caminhão') || vehicle.tipo.includes('Bitruck') || vehicle.tipo.includes('Cavalo');
        const isMachine = !isTruck && (vehicle.tipo.includes('Motoniveladora') || vehicle.tipo.includes('Escavadeira') || vehicle.tipo.includes('Pá') || vehicle.tipo.includes('Retro') || vehicle.tipo.includes('Rolo') || vehicle.tipo.includes('Trator'));
        
        let last = 0;
        let isHourMeter = false;

        if (isTruck) {
            last = parseFloat(vehicle.horimetro || 0);
            isHourMeter = true;
        } else if (isMachine) {
            last = parseFloat(vehicle.horimetroDigital || 0);
            if (last === 0) last = parseFloat(vehicle.horimetroAnalogico || 0);
            isHourMeter = true;
        } else {
            // Leves/Outros -> Odômetro
            last = parseFloat(vehicle.odometro || 0);
        }

        const current = parseFloat(kmOuHrConfirmado);
        
        if (!isNaN(current) && last > 0) {
            // Regra: Regressão
            if (current <= last) {
                setBlockReason(`Leitura (${current}) menor/igual à atual (${last}).`);
            }
            // Regra: Salto > 50h (apenas para horímetros)
            else if (isHourMeter && (current - last) > 50) {
                setBlockReason(`Salto excessivo de Horímetro (> 50h). Diferença: ${(current - last).toFixed(1)}h.`);
            }
            // Regra: Salto > 1000km (apenas para odômetros)
            else if (!isHourMeter && (current - last) > 1000) {
                setBlockReason(`Salto excessivo de Km (> 1000).`);
            }
        }
    }, [kmOuHrConfirmado, order.vehicleId, vehicles]);


    // --- HELPER SAFE DATE ---
    const safeDate = (dateInput) => {
        if (!dateInput) return new Date(0);
        try {
            const dateStr = dateInput.toString().replace(' ', 'T');
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? new Date(0) : d;
        } catch { return new Date(0); }
    };

    // Alerta de Média
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
                setAverageAlert(`⚠️ ALERTA: Média caiu >25% (Atual: ${currentAverage.toFixed(2)} / Base: ${baselineAverage.toFixed(2)})`);
            }
        }

    }, [litros, kmOuHrConfirmado, refuelings, order.vehicleId]);

    const handleConfirmClick = (e) => {
        e.preventDefault();
        if (blockReason) {
            setShowPasswordModal(true);
        } else {
            executeConfirm();
        }
    };

    const executeConfirm = async () => {
        setShowPasswordModal(false);
        setIsSaving(true);
        try {
            const payload = {
                litrosAbastecidos: parseFloat(litros) || 0,
                litrosAbastecidosArla: order.needsArla ? (parseFloat(litrosArla) || 0) : 0,
                pricePerLiter: parseFloat(precoUnitario) || 0,
                confirmedReading: parseFloat(kmOuHrConfirmado) || 0,
                confirmedBy: user,
                outrosValor: order.outrosGeraValor ? (parseFloat(outrosValorConfirmado) || 0) : 0,
                // CORREÇÃO: Incluindo invoiceNumber no payload
                invoiceNumber: invoiceNumber
            };

            await apiClient.confirmRefuelingOrder(order.id, payload);
            setAlertMessage("Abastecimento confirmado!");
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
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm border border-gray-200 flex flex-col">
                <div className="p-3 border-b flex justify-between items-center bg-gray-50 rounded-t-lg shrink-0">
                    <h2 className="text-base font-bold text-gray-800">Confirmar</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full"><X size={16}/></button>
                </div>
                
                <form onSubmit={handleConfirmClick} className="p-3 space-y-3 overflow-y-auto flex-1 text-xs">
                    {/* INFO DA ORDEM */}
                    <div className="bg-blue-50 p-2 rounded text-[10px] border border-blue-100">
                        <div className="flex justify-between font-bold">
                            <span>#{String(order.authNumber).padStart(6, '0')}</span>
                            <span>{order.fuelType}</span>
                        </div>
                        {order.litrosLiberados && <p>Liberado: {order.litrosLiberados} L</p>}
                        {order.outros && <p className="mt-1 border-t border-blue-200 pt-0.5">Obs: {order.outros}</p>}
                    </div>

                    {/* PROGRESSO FINANCEIRO COMPACTO */}
                    {obraStatus && (
                        <div className="p-2 bg-gray-50 border border-gray-200 rounded text-[10px]">
                            <div className="flex justify-between items-center mb-1">
                                <h4 className="font-bold text-gray-700 flex items-center gap-1"><TrendingUp size={10}/> Obra</h4>
                                <span className="font-bold text-blue-600">{obraStatus.percentual.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1">
                                <div className={`h-1 rounded-full ${obraStatus.percentual > 80 ? 'bg-red-500' : 'bg-blue-500'}`} style={{width: `${Math.min(obraStatus.percentual, 100)}%`}}></div>
                            </div>
                             <div className="flex justify-between mt-0.5 text-gray-500">
                                <span>Gasto: {obraStatus.totalGasto.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                                <span>Total: {obraStatus.valorContrato.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                            </div>
                        </div>
                    )}

                    {averageAlert && (
                        <div className="p-2 bg-red-50 text-red-800 rounded border border-red-200 text-[10px] font-medium flex gap-1 items-center">
                            <TrendingDown size={12}/> {averageAlert}
                        </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-2">
                        {/* CAMPO DE NOTA FISCAL ADICIONADO */}
                        <div>
                            <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Nota Fiscal</label>
                            <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="w-full p-1 border rounded font-bold uppercase" placeholder="Nº NF"/>
                        </div>
                         <div>
                            <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Preço Litro (R$)</label>
                            <input type="number" step="0.001" value={precoUnitario} onChange={e => setPrecoUnitario(e.target.value)} className="w-full p-1 border rounded" placeholder="0.000"/>
                        </div>
                    </div>

                    <div>
                         <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Lts Abastecidos *</label>
                         <input type="number" step="0.01" value={litros} onChange={e => setLitros(e.target.value)} className="w-full p-1 border rounded font-bold" required autoFocus/>
                    </div>
                    
                    {order.needsArla && (
                         <div>
                            <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Lts Arla 32 *</label>
                            <input type="number" step="0.01" value={litrosArla} onChange={e => setLitrosArla(e.target.value)} className="w-full p-1 border rounded" required />
                        </div>
                    )}

                    {order.outrosGeraValor && (
                        <div className="bg-yellow-50 p-2 rounded border border-yellow-200">
                            <label className="block text-[10px] font-bold text-yellow-900 mb-0.5">Valor "{order.outros}" (R$) *</label>
                            <input type="number" step="0.01" value={outrosValorConfirmado} onChange={e => setOutrosValorConfirmado(e.target.value)} className="w-full p-1 border border-yellow-400 rounded bg-white font-bold text-yellow-900" required placeholder="0.00"/>
                        </div>
                    )}

                    <div>
                        <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Leitura Painel *</label>
                        <input type="number" step="0.1" value={kmOuHrConfirmado} onChange={e => setKmOuHrConfirmado(e.target.value)} className="w-full p-1 border rounded" required/>
                        <p className="text-[9px] text-gray-400 text-right">Sugerido: {suggestedReading}</p>
                    </div>

                    <div className="pt-1 flex justify-end gap-2 shrink-0">
                        <button type="button" onClick={onClose} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded font-bold hover:bg-gray-200">Cancelar</button>
                        {blockReason ? (
                            <button onClick={handleConfirmClick} type="button" className="px-3 py-1.5 bg-red-500 text-white font-bold rounded hover:bg-red-600 shadow-md flex items-center gap-1">
                                <Lock size={12}/> Liberar
                            </button>
                        ) : (
                            <button type="submit" disabled={isSaving} className="px-3 py-1.5 bg-green-500 text-white font-bold rounded hover:bg-green-600 shadow-md flex items-center gap-1">
                                {isSaving ? <Loader className="animate-spin" size={12}/> : 'Confirmar'}
                            </button>
                        )}
                    </div>
                </form>

                {/* MODAL DE SENHA INTEGRADO */}
                {showPasswordModal && (
                    <PasswordConfirmationModal
                        message={`BLOQUEIO DE SEGURANÇA:\n${blockReason}\nInsira senha para autorizar.`}
                        onConfirm={executeConfirm}
                        onClose={() => setShowPasswordModal(false)}
                        apiClient={apiClient}
                    />
                )}
            </div>
        </div>
    );
};

export default ConfirmRefuelingModal;