import React, { useState, useEffect, useCallback } from 'react';
import { 
    ArrowLeft, TrendingUp, DollarSign, Calendar, 
    Truck, MapPin, Save, Loader, PieChart, AlertCircle
} from 'lucide-react';
// Correção: Ajustando para ../../ pois o erro 'Could not resolve' com ../ indica que o arquivo está em uma subpasta profunda
import apiClient from '../../services/apiClient';

// Componente de Gráfico de Pizza SVG Nativo (Sem dependências externas)
const NativePieChart = ({ data, colors }) => {
    const total = data.reduce((acc, val) => acc + val, 0);
    if (total === 0) return <div className="text-slate-400 text-xs">Sem dados</div>;

    let cumulativePercent = 0;

    // Cálculo para SVG: circumference ~ 100. r = 15.9155
    return (
        <div className="relative w-48 h-48 flex items-center justify-center">
             <svg viewBox="0 0 32 32" className="w-full h-full transform -rotate-90">
                {data.map((value, i) => {
                    const percent = value / total;
                    if (percent === 0) return null;
                    
                    // Dasharray: comprimento do arco (percent * 100) e espaço restante (100)
                    // 2 * pi * 15.9155 ≈ 100
                    const dashArray = `${percent * 100} 100`; 
                    const dashOffset = -cumulativePercent * 100;
                    cumulativePercent += percent;
                    
                    return (
                        <circle 
                            key={i}
                            r="15.9155" 
                            cx="16" 
                            cy="16" 
                            fill="transparent"
                            stroke={colors[i % colors.length]}
                            strokeWidth="32" // Preenche todo o círculo
                            strokeDasharray={dashArray}
                            strokeDashoffset={dashOffset}
                            className="transition-all duration-500 hover:opacity-80"
                        />
                    );
                })}
            </svg>
            <div className="absolute w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-inner">
                <span className="text-xs font-bold text-slate-400">Total</span>
            </div>
        </div>
    );
};

const SupervisorObraDetail = ({ obraId, onBack }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview'); // overview, financial, demobilization

    const fetchDetails = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/supervisor/obra/' + obraId);
            setData(res);
        } catch (error) {
            console.error("Erro:", error);
        } finally {
            setLoading(false);
        }
    }, [obraId]);

    useEffect(() => { if (obraId) fetchDetails(); }, [obraId, fetchDetails]);

    // Cálculo da Data Final baseado no "Cérebro"
    const calculateEndDate = () => {
        if (!data) return { date: new Date(), diasRestantes: 0 };
        const { producao } = data;
        const saldo = producao?.saldo_horas || 0;
        const ritmo = producao?.media_diaria_atual || 1; // Evita div por 0

        if (saldo <= 0) return { date: new Date(), diasRestantes: 0 }; // Obra concluída

        const diasRestantes = Math.ceil(saldo / ritmo);
        
        let date = new Date();
        let added = 0;
        // Limite de segurança para loop (ex: 5 anos)
        while(added < diasRestantes && added < 1825) {
            date.setDate(date.getDate() + 1);
            if(date.getDay() !== 0 && date.getDay() !== 6) added++;
        }
        return { date, diasRestantes };
    };

    const handleUpdateMission = async (vehicleId, location, date) => {
        try {
            await apiClient.post('/supervisor/vehicle-mission', {
                vehicle_id: vehicleId,
                next_location: location,
                release_date: date
            });
            // Feedback visual simples
            const btn = document.getElementById(`btn-save-${vehicleId}`);
            if(btn) {
                const originalText = btn.innerHTML;
                btn.innerHTML = "Salvo!";
                btn.className = "text-green-600 font-bold text-xs";
                setTimeout(() => { 
                    btn.innerHTML = originalText;
                    btn.className = "text-blue-600 hover:bg-blue-50 p-1 rounded";
                }, 2000);
            }
        } catch (e) { alert("Erro ao salvar destino."); }
    };

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader className="animate-spin text-blue-600" /></div>;
    
    if (!data) return (
        <div className="flex flex-col h-screen items-center justify-center text-slate-500 gap-4">
            <AlertCircle size={48} className="text-red-400"/>
            <p>Erro ao carregar dados da obra.</p>
            <button onClick={onBack} className="text-blue-600 underline">Voltar</button>
        </div>
    );

    const { obra, contract, financeiro, producao, veiculos } = data;
    const previsao = calculateEndDate();

    // Dados para o Gráfico Nativo
    const chartDataValues = (financeiro?.categorias || []).map(c => Number(c.total) || 0);
    const chartColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#64748B'];

    const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

    return (
        <div className="bg-slate-100 min-h-screen pb-20">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-20 px-6 py-4 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full"><ArrowLeft size={20}/></button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">{obra?.nome}</h1>
                        <p className="text-xs text-slate-500">Contrato: {formatCurrency(contract?.total_value)}</p>
                    </div>
                </div>
                
                <div className="flex bg-slate-100 p-1 rounded-lg">
                    {['overview', 'financial', 'demobilization'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {tab === 'overview' && 'Visão Geral'}
                            {tab === 'financial' && 'Financeiro'}
                            {tab === 'demobilization' && 'Desmobilização'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-6">
                
                {/* --- ABA 1: VISÃO GERAL (PREVISÃO INTELIGENTE) --- */}
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Cartão de Previsão Principal */}
                        <div className="lg:col-span-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-8 shadow-lg relative overflow-hidden">
                            <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div>
                                    <h3 className="text-slate-400 font-bold uppercase text-xs mb-2">Previsão de Término</h3>
                                    <div className="text-4xl font-bold text-white mb-1">
                                        {previsao.date.toLocaleDateString('pt-BR')}
                                    </div>
                                    <p className="text-sm text-slate-300">
                                        Restam aprox. <strong className="text-yellow-400">{previsao.diasRestantes} dias úteis</strong>
                                    </p>
                                </div>
                                <div className="border-l border-slate-700 pl-8">
                                    <h3 className="text-slate-400 font-bold uppercase text-xs mb-2">Ritmo Atual (Últimos {producao?.dias_analisados || 0} dias)</h3>
                                    <div className="text-3xl font-bold text-blue-400 mb-1">
                                        {producao?.media_diaria_atual?.toFixed(1)}h <span className="text-sm text-slate-400">/dia</span>
                                    </div>
                                    <p className="text-xs text-slate-400">Soma da média individual de {veiculos?.length || 0} máquinas ativas.</p>
                                </div>
                                <div className="border-l border-slate-700 pl-8">
                                    <h3 className="text-slate-400 font-bold uppercase text-xs mb-2">Saldo Contratual</h3>
                                    <div className="text-3xl font-bold text-green-400 mb-1">
                                        {producao?.saldo_horas?.toFixed(0)}h
                                    </div>
                                    <div className="w-full bg-slate-700 h-2 rounded-full mt-2">
                                        <div 
                                            className="bg-green-400 h-2 rounded-full" 
                                            style={{width: `${(1 - (producao?.saldo_horas / (contract?.total_hours_contracted || 1))) * 100}%`}}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-6 bg-white/10 p-4 rounded-lg backdrop-blur-sm border border-white/10">
                                <p className="text-sm flex items-center gap-2">
                                    <TrendingUp size={16} className="text-yellow-400" />
                                    "No ritmo atual de <strong>{producao?.media_diaria_atual?.toFixed(1)}h/dia</strong>, com os equipamentos alocados, o saldo de horas se esgota em <strong>{previsao.date.toLocaleDateString()}</strong>."
                                </p>
                            </div>
                        </div>

                        {/* Status de Faturamento Rápido */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-3 flex justify-between items-center gap-4">
                            <div className="flex-1">
                                <p className="text-xs text-slate-500 uppercase font-bold">Valor Medido (Físico)</p>
                                <p className="text-2xl font-bold text-slate-800">{formatCurrency(financeiro?.valor_produzido)}</p>
                            </div>
                            <div className="h-10 w-px bg-slate-200"></div>
                            <div className="flex-1">
                                <p className="text-xs text-slate-500 uppercase font-bold">Total Gasto (Despesas)</p>
                                <p className="text-2xl font-bold text-red-600">{formatCurrency(financeiro?.total_despesas)}</p>
                            </div>
                            <div className="h-10 w-px bg-slate-200"></div>
                            <div className="flex-1 bg-yellow-50 p-2 rounded-lg border border-yellow-100">
                                <p className="text-xs text-yellow-700 uppercase font-bold">Pendente Faturamento</p>
                                <p className="text-xl font-bold text-yellow-800">{formatCurrency(financeiro?.pendente_faturamento)}</p>
                                <p className="text-[10px] text-yellow-600 leading-tight">Trabalho realizado vs Custo lançado</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- ABA 2: FINANCEIRO --- */}
                {activeTab === 'financial' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
                                <PieChart size={20}/> Distribuição de Despesas
                            </h3>
                            <div className="h-64 flex justify-center items-center">
                                {financeiro?.categorias?.length > 0 ? (
                                    <NativePieChart data={chartDataValues} colors={chartColors} />
                                ) : (
                                    <div className="flex items-center text-slate-400">Sem despesas lançadas.</div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="font-bold text-slate-700 mb-4">Resumo do Contrato</h3>
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-slate-500">Valor Total Contratado</span>
                                            <span className="font-bold text-slate-800">{formatCurrency(financeiro?.total_contrato)}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full">
                                            <div className="bg-blue-500 h-2 rounded-full w-full opacity-20"></div>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-slate-500">Total Despesas Lançadas</span>
                                            <span className="font-bold text-red-600">{formatCurrency(financeiro?.total_despesas)}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full relative">
                                            <div 
                                                className="bg-red-500 h-2 rounded-full absolute top-0 left-0"
                                                style={{width: `${Math.min(((financeiro?.total_despesas || 0) / (financeiro?.total_contrato || 1)) * 100, 100)}%`}}
                                            ></div>
                                        </div>
                                        <p className="text-xs text-right mt-1 text-slate-400">
                                            {((financeiro?.total_despesas / (financeiro?.total_contrato || 1)) * 100).toFixed(1)}% do contrato consumido em custos
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="font-bold text-slate-700 mb-4">Detalhamento</h3>
                                <div className="overflow-y-auto max-h-60">
                                    <table className="w-full text-sm">
                                        <thead className="text-xs uppercase text-slate-400 bg-slate-50 sticky top-0">
                                            <tr>
                                                <th className="p-2 text-left">Categoria</th>
                                                <th className="p-2 text-right">Valor</th>
                                                <th className="p-2 text-right">%</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(financeiro?.categorias || []).map((cat, i) => (
                                                <tr key={i}>
                                                    <td className="p-2 font-medium text-slate-700">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded-full" style={{backgroundColor: chartColors[i % chartColors.length]}}></div>
                                                            {cat.category || 'Não classificado'}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 text-right text-slate-600">{formatCurrency(cat.total)}</td>
                                                    <td className="p-2 text-right text-slate-400">
                                                        {((cat.total / (financeiro?.total_despesas || 1)) * 100).toFixed(1)}%
                                                    </td>
                                                </tr>
                                            ))}
                                            {(financeiro?.categorias || []).length === 0 && (
                                                <tr><td colSpan="3" className="p-4 text-center text-slate-400">Nenhum dado.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- ABA 3: DESMOBILIZAÇÃO --- */}
                {activeTab === 'demobilization' && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 bg-slate-50">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <Truck size={20} /> Previsão de Desmobilização de Equipamentos
                            </h3>
                            <p className="text-sm text-slate-500 mt-1">
                                Previsão baseada na média individual de cada equipamento nos últimos dias.
                            </p>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-white text-slate-500 uppercase text-xs border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-4">Equipamento</th>
                                        <th className="px-6 py-4">Média Atual</th>
                                        <th className="px-6 py-4">Previsão Liberação</th>
                                        <th className="px-6 py-4">Próximo Destino (Planejamento)</th>
                                        <th className="px-6 py-4">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(veiculos || []).map(v => (
                                        <MachineRow 
                                            key={v.id} 
                                            vehicle={v} 
                                            globalEndDate={previsao.date}
                                            onSave={handleUpdateMission} 
                                        />
                                    ))}
                                    {(veiculos || []).length === 0 && (
                                        <tr><td colSpan="5" className="p-6 text-center text-slate-400">Nenhum veículo alocado.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Componente de Linha para Tabela de Máquinas (para gerenciar estado do input individualmente)
const MachineRow = ({ vehicle, globalEndDate, onSave }) => {
    const [location, setLocation] = useState(vehicle.proximo_destino || '');
    // Se a máquina tem data manual, usa. Senão, usa a data global calculada.
    const [date, setDate] = useState(
        vehicle.data_liberacao_manual 
        ? vehicle.data_liberacao_manual.split('T')[0] 
        : globalEndDate.toISOString().split('T')[0]
    );

    return (
        <tr className="hover:bg-slate-50 transition-colors">
            <td className="px-6 py-4">
                <div className="font-bold text-slate-800">{vehicle.modelo}</div>
                <div className="text-xs text-slate-500">{vehicle.placa} • {vehicle.tipo}</div>
            </td>
            <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded text-xs font-bold ${vehicle.media_diaria < 4 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {vehicle.media_diaria.toFixed(1)}h/dia
                </span>
            </td>
            <td className="px-6 py-4">
                <input 
                    type="date" 
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="border border-slate-300 rounded p-1 text-slate-600 text-xs focus:border-blue-500 outline-none"
                />
            </td>
            <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Ex: Obra Shopping, Pátio..." 
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="border-b border-slate-300 bg-transparent py-1 px-2 w-full focus:border-blue-500 outline-none placeholder:text-slate-300"
                    />
                </div>
            </td>
            <td className="px-6 py-4">
                <button 
                    id={`btn-save-${vehicle.id}`}
                    onClick={() => onSave(vehicle.id, location, date)}
                    className="text-blue-600 hover:bg-blue-50 p-2 rounded transition-colors"
                    title="Salvar Planejamento"
                >
                    <Save size={18} />
                </button>
            </td>
        </tr>
    );
};

export default SupervisorObraDetail;