import React, { useState, useMemo } from 'react';
import { HardHat, DollarSign, Clock } from 'lucide-react';
import { vehicleGroups } from '../../utils/vehicleRules';

const ObraProgressBI = ({ obras = [], vehicles = [], dailyWorkLogs = [] }) => {
    const [selectedObraId, setSelectedObraId] = useState('');

    const activeObras = useMemo(() => {
        return obras.filter(o => o.status === 'ativa').sort((a,b) => a.nome.localeCompare(b.nome));
    }, [obras]);

    // Função de cálculo
    const calculateExecuted = (obra) => {
        // Cálculo Real (Máquinas)
        let totalExecutadoHoras = 0;
        let totalExecutadoKmPrancha = parseFloat(obra.kmConcluidoPrancha) || 0;

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

        // Adiciona horas manuais
        if (obra.contractType !== 'prancha') {
            totalExecutadoHoras += parseFloat(obra.horasAdicionaisCaminhao || 0);
        }

        // Cálculo Faturado (Baseado em Logs de Trabalho Diário)
        // Filtra logs desta obra
        const logsDestaObra = dailyWorkLogs.filter(log => log.obraId === obra.id);
        const totalHorasFaturadas = logsDestaObra.reduce((sum, log) => sum + (parseFloat(log.totalHours) || 0), 0);

        // Se o contrato for por KM/m2, talvez precise de outra lógica, mas o padrão é horas
        return { 
            totalHoras: totalExecutadoHoras, 
            totalKmPrancha: totalExecutadoKmPrancha, 
            totalFaturado: totalHorasFaturadas 
        };
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
            faturado: executed.totalFaturado
        };
    }, [selectedObraId, activeObras, vehicles, dailyWorkLogs]);

    const ProgressBar = ({ value, max, color }) => (
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div 
                className={`h-full ${color} transition-all duration-500 flex items-center justify-center text-[9px] font-bold text-white`} 
                style={{ width: `${Math.min((value/max)*100, 100)}%` }}
            >
                {max > 0 ? ((value/max)*100).toFixed(0) : 0}%
            </div>
        </div>
    );

    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4 shrink-0">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm">
                    <DollarSign className="text-green-600" size={18}/> Progresso & Faturamento
                </h3>
                <select 
                    value={selectedObraId} 
                    onChange={e => setSelectedObraId(e.target.value)}
                    className="text-xs border rounded p-1 bg-gray-50 max-w-[140px]"
                >
                    <option value="">Selecione Obra...</option>
                    {activeObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
            </div>

            {obraData ? (
                <div className="space-y-4 flex-1 flex flex-col justify-center">
                    {/* Cards de Resumo */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-blue-50 p-2 rounded border border-blue-100">
                            <span className="block text-[10px] text-blue-500 font-bold uppercase">Contratado</span>
                            <span className="text-base font-bold text-blue-900">{obraData.contratado.toFixed(0)} <span className="text-[10px]">{obraData.unit}</span></span>
                        </div>
                        <div className="bg-yellow-50 p-2 rounded border border-yellow-100">
                            <span className="block text-[10px] text-yellow-600 font-bold uppercase">Real (Horímetros)</span>
                            <span className="text-base font-bold text-yellow-900">{obraData.executado.toFixed(1)} <span className="text-[10px]">{obraData.unit}</span></span>
                        </div>
                        <div className="bg-green-50 p-2 rounded border border-green-100">
                            <span className="block text-[10px] text-green-600 font-bold uppercase">Faturado (Logs)</span>
                            <span className="text-base font-bold text-green-900">{obraData.faturado.toFixed(1)} <span className="text-[10px]">{obraData.unit}</span></span>
                        </div>
                    </div>

                    {/* Barras de Progresso */}
                    <div className="space-y-4 pt-2">
                        <div>
                            <div className="flex justify-between text-xs font-semibold text-gray-600 mb-1">
                                <span className="flex items-center gap-1"><Clock size={12}/> Execução Real vs Contrato</span>
                                <span>{obraData.contratado > 0 ? ((obraData.executado / obraData.contratado)*100).toFixed(1) : 0}%</span>
                            </div>
                            <ProgressBar value={obraData.executado} max={obraData.contratado} color="bg-yellow-500" />
                        </div>
                        
                        <div>
                            <div className="flex justify-between text-xs font-semibold text-gray-600 mb-1">
                                <span className="flex items-center gap-1"><DollarSign size={12}/> Faturamento vs Contrato</span>
                                <span>{obraData.contratado > 0 ? ((obraData.faturado / obraData.contratado)*100).toFixed(1) : 0}%</span>
                            </div>
                            <ProgressBar value={obraData.faturado} max={obraData.contratado} color="bg-green-500" />
                            <p className="text-[10px] text-gray-400 mt-1 italic">Baseado nos registros de Controle Diário.</p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm italic">
                    <HardHat size={32} className="mb-2 opacity-20"/>
                    Selecione uma obra ativa para ver a análise.
                </div>
            )}
        </div>
    );
};

export default ObraProgressBI;