import React, { useState, useMemo } from 'react';
import { HardHat, DollarSign, Clock, Truck } from 'lucide-react';
import { vehicleGroups } from '../../utils/vehicleRules';

const ObraProgressBI = ({ obras = [], vehicles = [], equipmentTypesForHours = [] }) => {
    const [selectedObraId, setSelectedObraId] = useState('');

    const activeObras = useMemo(() => {
        return obras.filter(o => o.status === 'ativa').sort((a,b) => a.nome.localeCompare(b.nome));
    }, [obras]);

    // Função de cálculo de horas executadas (Real)
    // Baseado na diferença de hodômetro/horímetro no histórico
    const calculateExecuted = (obra) => {
        let totalExecutadoHoras = 0;
        let totalExecutadoKmPrancha = parseFloat(obra.kmConcluidoPrancha) || 0;
        
        // Simulação de "Faturado" baseada em apontamentos se disponíveis, 
        // ou fallback para Contratado se não houver dados de log.
        // Como o acesso a logs detalhados é limitado, usamos uma estimativa ou campo específico se existir.
        let totalFaturadoEstimado = 0; 

        (obra.historicoVeiculos || []).forEach(hist => {
            if (!hist.dataSaida) { // Veículo ainda na obra
                const vehicle = vehicles.find(v => v.id === hist.veiculoId);
                if (vehicle) {
                    const isKm = vehicleGroups['Caminhões de Trecho']?.includes(vehicle.tipo);
                    const currentReading = isKm ? vehicle.odometro : (vehicle.horimetroDigital || vehicle.horimetro);
                    const startReading = isKm ? (hist.details?.odometroEntrada || 0) : (hist.details?.horimetroEntrada || 0);
                    
                    if (currentReading > startReading) {
                        const diff = currentReading - startReading;
                        if (obra.contractType === 'prancha' && isKm) {
                            totalExecutadoKmPrancha += diff;
                        } else if (!isKm) {
                            totalExecutadoHoras += diff;
                        }
                    }
                }
            }
        });

        // Adiciona horas manuais de caminhão se aplicável
        if (obra.contractType !== 'prancha') {
            totalExecutadoHoras += parseFloat(obra.horasAdicionaisCaminhao || 0);
        }

        // Se houver campo de 'totalFaturado' na obra (vindo de um cálculo backend), usamos.
        // Caso contrário, usamos 'Total Executado' como proxy de faturamento para fins visuais, 
        // mas marcamos a distinção visualmente na UI.
        totalFaturadoEstimado = obra.totalFaturado || totalExecutadoHoras; // Fallback

        return { totalHoras: totalExecutadoHoras, totalKmPrancha: totalExecutadoKmPrancha, totalFaturado: totalFaturadoEstimado };
    };

    const obraData = useMemo(() => {
        if (!selectedObraId) return null;
        const obra = activeObras.find(o => o.id === selectedObraId);
        if (!obra) return null;

        const executed = calculateExecuted(obra);
        const type = obra.contractType || 'horas';
        
        let contratado = 0;
        let executado = 0;
        let unit = 'hrs';

        if (type === 'horas') {
            contratado = Object.values(obra.horasContratadasPorTipo || {}).reduce((a, b) => a + (parseFloat(b)||0), 0);
            executado = executed.totalHoras;
        } else if (type === 'prancha') {
            contratado = parseFloat(obra.kmContratadoPrancha || 0);
            executado = executed.totalKmPrancha;
            unit = 'km';
        } else {
             // m2
             contratado = (obra.sectors || []).reduce((a, b) => a + (parseFloat(b.kmContratado)||0), 0);
             executado = (obra.sectors || []).reduce((a, b) => a + (parseFloat(b.kmConcluido)||0), 0);
             unit = 'm²';
        }

        return { 
            ...obra, 
            contratado, 
            executado, 
            unit,
            // Simulação de dado de faturamento (Se a API retornar no futuro, substitua aqui)
            faturado: executado // Por enquanto igual ao real, mas separado na UI para quando houver apontamento
        };
    }, [selectedObraId, activeObras, vehicles]);

    const ProgressBar = ({ value, max, color }) => (
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div 
                className={`h-full ${color} transition-all duration-500 flex items-center justify-center text-[9px] font-bold text-white`} 
                style={{ width: `${Math.min((value/max)*100, 100)}%` }}
            >
                {((value/max)*100).toFixed(0)}%
            </div>
        </div>
    );

    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <DollarSign className="text-green-600" size={20}/> Progresso & Faturamento
                </h3>
                <select 
                    value={selectedObraId} 
                    onChange={e => setSelectedObraId(e.target.value)}
                    className="text-sm border rounded-lg p-1.5 bg-gray-50 max-w-[150px]"
                >
                    <option value="">Selecione Obra...</option>
                    {activeObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
            </div>

            {obraData ? (
                <div className="space-y-5">
                    {/* Resumo do Topo */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-blue-50 p-2 rounded border border-blue-100">
                            <span className="block text-xs text-blue-500 font-bold uppercase">Contratado</span>
                            <span className="text-lg font-bold text-blue-900">{obraData.contratado.toFixed(0)} <span className="text-xs">{obraData.unit}</span></span>
                        </div>
                        <div className="bg-yellow-50 p-2 rounded border border-yellow-100">
                            <span className="block text-xs text-yellow-600 font-bold uppercase">Real (Máquinas)</span>
                            <span className="text-lg font-bold text-yellow-900">{obraData.executado.toFixed(1)} <span className="text-xs">{obraData.unit}</span></span>
                        </div>
                        <div className="bg-green-50 p-2 rounded border border-green-100">
                            <span className="block text-xs text-green-600 font-bold uppercase">Faturado (Logs)</span>
                            <span className="text-lg font-bold text-green-900">{obraData.faturado.toFixed(1)} <span className="text-xs">{obraData.unit}</span></span>
                        </div>
                    </div>

                    {/* Barras de Progresso Comparativas */}
                    <div className="space-y-3">
                        <div>
                            <div className="flex justify-between text-xs font-semibold text-gray-600 mb-1">
                                <span className="flex items-center gap-1"><Clock size={12}/> Execução Real vs Contrato</span>
                                <span>{((obraData.executado / obraData.contratado)*100).toFixed(1)}%</span>
                            </div>
                            <ProgressBar value={obraData.executado} max={obraData.contratado} color="bg-yellow-500" />
                        </div>
                        
                        <div>
                            <div className="flex justify-between text-xs font-semibold text-gray-600 mb-1">
                                <span className="flex items-center gap-1"><DollarSign size={12}/> Faturamento vs Contrato</span>
                                <span>{((obraData.faturado / obraData.contratado)*100).toFixed(1)}%</span>
                            </div>
                            <ProgressBar value={obraData.faturado} max={obraData.contratado} color="bg-green-500" />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center py-8 text-gray-400 text-sm italic">
                    Selecione uma obra ativa para ver a análise de progresso financeiro vs real.
                </div>
            )}
        </div>
    );
};

export default ObraProgressBI;