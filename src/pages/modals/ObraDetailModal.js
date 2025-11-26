import React, { useState, useMemo } from 'react';
import { X, Edit, Trash2, PlusCircle, Loader, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
// CORREÇÃO: Caminho ajustado para voltar dois níveis (../../)
import ProtectedComponent from '../../components/ProtectedComponent';

// Componente Simples de Barra de Progresso
const ProgressBar = ({ value, max, color = 'bg-yellow-400' }) => {
    const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    return (
        <div className="w-full bg-gray-200 rounded-full h-4 mt-1 relative overflow-hidden">
            <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${percentage}%` }}></div>
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700">
                {percentage.toFixed(0)}% ({value.toFixed(1)} / {max.toFixed(1)})
            </div>
        </div>
    );
};

const ObraDetailModal = ({ 
    user, 
    obra, 
    vehicles = [], 
    onClose, 
    setAlertMessage, 
    apiClient, 
    reloadData,
    vehicleGroups = {}
}) => {
    const [isSaving, setIsSaving] = useState(false);
    
    // Edição de leituras (Horas Adicionais e Km Prancha Realizado)
    const [additionalTruckHours, setAdditionalTruckHours] = useState(obra?.horasAdicionaisCaminhao?.toString() || '');
    const [kmConcluidoPrancha, setKmConcluidoPrancha] = useState(obra?.kmConcluidoPrancha?.toString() || '');
    const [updatingReadings, setUpdatingReadings] = useState({}); // Leituras parciais dos veículos

    // Separação de veículos
    const { activeVehicles, pastVehicles } = useMemo(() => {
        const historico = Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : [];
        
        const active = historico.filter(h => !h.dataSaida).map(h => {
            const vehicle = vehicles.find(v => v.id === h.veiculoId);
            return { ...h, vehicle, vehicleLabel: vehicle ? `${vehicle.registroInterno} - ${vehicle.modelo}` : 'N/A' };
        }).sort((a, b) => a.vehicleLabel.localeCompare(b.vehicleLabel));

        const past = historico.filter(h => h.dataSaida).map(h => {
            const vehicle = vehicles.find(v => v.id === h.veiculoId);
            return { ...h, vehicle, vehicleLabel: vehicle ? `${vehicle.registroInterno} - ${vehicle.modelo}` : 'N/A' };
        }).sort((a, b) => new Date(b.dataSaida) - new Date(a.dataSaida));

        return { activeVehicles: active, pastVehicles: past };
    }, [obra, vehicles]);

    // Cálculo de Progresso Simplificado (Baseado no Contrato)
    const progressData = useMemo(() => {
        const data = { totalContratado: 0, totalRealizado: 0, items: [] };
        
        if (obra.contractType === 'horas') {
            // 1. Processa Horas por Tipo
            if (obra.horasContratadasPorTipo) {
                Object.entries(obra.horasContratadasPorTipo).forEach(([type, hours]) => {
                    const contratado = parseFloat(hours) || 0;
                    // Calcula realizado varrendo histórico
                    let realizado = 0;
                    obra.historicoVeiculos?.forEach(h => {
                        const v = vehicles.find(veh => veh.id === h.veiculoId);
                        if (v && v.tipo === type) {
                            const inicio = parseFloat(h.horimetroEntrada ?? h.odometroEntrada ?? 0);
                            const fim = parseFloat(h.horimetroSaida ?? h.odometroSaida ?? (v.horimetro || v.odometro || 0));
                            if (fim > inicio) realizado += (fim - inicio);
                        }
                    });
                    
                    // Adiciona Horas Adicionais se for caminhão (Exemplo)
                    if (type.includes('Caminhão')) {
                        realizado += parseFloat(additionalTruckHours || 0);
                    }

                    data.totalContratado += contratado;
                    data.totalRealizado += realizado;
                    data.items.push({ label: type, contratado, realizado });
                });
            }
            // 2. Prancha
            if (obra.kmContratadoPrancha > 0) {
                const contratado = parseFloat(obra.kmContratadoPrancha);
                const realizado = parseFloat(kmConcluidoPrancha || 0);
                data.items.push({ label: 'Deslocamento Prancha (Km)', contratado, realizado, isKm: true });
            }

        } else {
            // Metros Quadrados
            obra.sectors?.forEach(s => {
                const contratado = parseFloat(s.kmContratado || 0);
                const realizado = parseFloat(s.kmConcluido || 0); // Idealmente editável
                data.totalContratado += contratado;
                data.totalRealizado += realizado;
                data.items.push({ label: s.name, contratado, realizado });
            });
        }
        return data;
    }, [obra, vehicles, additionalTruckHours, kmConcluidoPrancha]);

    // Handler Salvar
    const handleSaveChanges = async () => {
        setIsSaving(true);
        try {
            // Atualiza Obra
            await apiClient.updateObra(obra.id, {
                horasAdicionaisCaminhao: parseFloat(additionalTruckHours) || 0,
                kmConcluidoPrancha: parseFloat(kmConcluidoPrancha) || 0
            });
            
            // Atualiza Leituras Parciais (Veículos)
            const updates = [];
            Object.entries(updatingReadings).forEach(([vehicleId, value]) => {
                const vehicle = vehicles.find(v => v.id === vehicleId);
                if (vehicle) {
                    // Simplificação: Atualiza horímetro/odômetro principal do veículo
                    const payload = vehicle.tipo === 'Veículos Leves' ? { odometro: value } : { horimetro: value };
                    updates.push(apiClient.updateVehicle(vehicleId, payload));
                }
            });
            await Promise.all(updates);

            setAlertMessage("Dados atualizados com sucesso!");
            reloadData();
        } catch (error) {
            setAlertMessage("Erro ao salvar alterações.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[95vh] flex flex-col my-auto">
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">{obra.nome}</h2>
                        <span className={`text-xs px-2 py-1 rounded-full font-bold ${obra.status === 'ativa' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {obra.status === 'ativa' ? 'EM ANDAMENTO' : 'FINALIZADA'}
                        </span>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={20}/></button>
                </div>

                {/* Content */}
                <div className="p-6 flex-1 overflow-y-auto space-y-6 text-sm">
                    
                    {/* 1. Progresso Financeiro/Físico */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2 bg-gray-50 p-4 rounded border">
                            <h3 className="font-bold text-gray-700 mb-3">Acompanhamento do Contrato</h3>
                            <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                                {progressData.items.map((item, idx) => (
                                    <div key={idx}>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="font-medium">{item.label}</span>
                                            <span className="text-gray-500">{item.realizado.toFixed(1)} / {item.contratado.toFixed(1)}</span>
                                        </div>
                                        <ProgressBar value={item.realizado} max={item.contratado} color={item.isKm ? 'bg-blue-400' : 'bg-yellow-400'} />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded border shadow-sm flex flex-col justify-center items-center text-center">
                            <span className="text-gray-500 text-xs uppercase tracking-wide">Valor Total Contrato</span>
                            <span className="text-2xl font-bold text-green-600 mt-2">
                                {(parseFloat(obra.valorTotalContrato) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                            <div className="mt-4 w-full pt-4 border-t">
                                <span className="text-gray-500 text-xs">Limite Despesas (20%)</span>
                                <div className="font-semibold text-red-500">
                                    {((parseFloat(obra.valorTotalContrato) || 0) * 0.20).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2. Atualizações Manuais */}
                    <ProtectedComponent requiredPermission="editor">
                        <div className="bg-blue-50 p-4 rounded border border-blue-100">
                            <h3 className="font-bold text-blue-800 mb-3 flex items-center gap-2"><Edit size={14}/> Atualizações Manuais</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600">Horas Adicionais (Caminhão)</label>
                                    <input type="number" step="0.1" value={additionalTruckHours} onChange={e => setAdditionalTruckHours(e.target.value)} className="w-full p-2 border rounded bg-white text-sm"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600">Km Realizado (Prancha)</label>
                                    <input type="number" step="0.1" value={kmConcluidoPrancha} onChange={e => setKmConcluidoPrancha(e.target.value)} className="w-full p-2 border rounded bg-white text-sm"/>
                                </div>
                            </div>
                        </div>
                    </ProtectedComponent>

                    {/* 3. Veículos Ativos (Com Avisos) */}
                    <div>
                        <h3 className="font-bold text-gray-800 mb-3">Veículos Ativos</h3>
                        <div className="grid grid-cols-1 gap-3">
                            {activeVehicles.length > 0 ? activeVehicles.map(h => {
                                // Verifica Avisos
                                const vehicle = h.vehicle;
                                const alerts = [];
                                if (vehicle?.canCirculate === false) alerts.push("Bloqueado");
                                // (Adicione lógica de data de revisão aqui se tiver os dados no objeto vehicle)

                                return (
                                    <div key={h.id} className={`p-3 rounded border flex flex-col sm:flex-row justify-between items-center gap-3 ${alerts.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
                                        <div className="flex-1">
                                            <div className="font-bold text-gray-800 flex items-center gap-2">
                                                {h.vehicleLabel}
                                                {alerts.map(a => <span key={a} className="text-[10px] bg-red-200 text-red-800 px-1 rounded flex items-center gap-1"><AlertTriangle size={10}/> {a}</span>)}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1 flex gap-4">
                                                <span className="flex items-center gap-1"><Clock size={12}/> Entrada: {new Date(h.dataEntrada).toLocaleDateString('pt-BR')}</span>
                                                <span>Início: {h.horimetroEntrada || h.odometroEntrada}</span>
                                            </div>
                                        </div>
                                        
                                        <ProtectedComponent requiredPermission="editor">
                                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                                <label className="text-xs font-medium whitespace-nowrap">Leitura Atual:</label>
                                                <input 
                                                    type="number" 
                                                    placeholder={vehicle?.horimetro || vehicle?.odometro} 
                                                    value={updatingReadings[vehicle?.id] || ''}
                                                    onChange={e => setUpdatingReadings({...updatingReadings, [vehicle.id]: e.target.value})}
                                                    className="p-1.5 border rounded w-24 text-sm"
                                                />
                                            </div>
                                        </ProtectedComponent>
                                    </div>
                                );
                            }) : (
                                <p className="text-gray-500 italic text-sm">Nenhum veículo alocado no momento.</p>
                            )}
                        </div>
                    </div>

                    {/* 4. Histórico (Tabela Compacta) */}
                    <div>
                        <h3 className="font-bold text-gray-800 mb-3">Histórico de Alocações</h3>
                        <div className="max-h-40 overflow-y-auto border rounded bg-white">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-gray-100 sticky top-0">
                                    <tr>
                                        <th className="p-2">Veículo</th>
                                        <th className="p-2">Período</th>
                                        <th className="p-2">Total</th>
                                        <th className="p-2">Operador</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {pastVehicles.map(h => {
                                        const start = parseFloat(h.horimetroEntrada || h.odometroEntrada || 0);
                                        const end = parseFloat(h.horimetroSaida || h.odometroSaida || 0);
                                        const total = Math.max(0, end - start);
                                        return (
                                            <tr key={h.id} className="hover:bg-gray-50">
                                                <td className="p-2 font-medium">{h.vehicleLabel}</td>
                                                <td className="p-2">{new Date(h.dataEntrada).toLocaleDateString('pt-BR')} - {new Date(h.dataSaida).toLocaleDateString('pt-BR')}</td>
                                                <td className="p-2">{total.toFixed(1)}</td>
                                                <td className="p-2 text-gray-500">{h.employeeName || '-'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm font-medium">Fechar</button>
                    <ProtectedComponent requiredPermission="editor">
                        <button onClick={handleSaveChanges} disabled={isSaving} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium flex items-center gap-2">
                            {isSaving ? <Loader size={16} className="animate-spin"/> : 'Salvar Alterações'}
                        </button>
                    </ProtectedComponent>
                </div>
            </div>
        </div>
    );
};

export default ObraDetailModal;