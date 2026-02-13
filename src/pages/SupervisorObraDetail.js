import React, { useState, useEffect } from 'react';
import { ArrowLeft, Clock, Calendar, CheckCircle, Phone, FileText, TrendingUp, AlertTriangle, Truck, Save, Loader } from 'lucide-react';
import apiClient from '../services/apiClient';

const SupervisorObraDetail = ({ obraId, onBack }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // Estado para novo registro de CRM
    const [crmNote, setCrmNote] = useState('');
    const [interactionType, setInteractionType] = useState('daily_check'); // daily_check, call_30, call_70, issue
    const [submitting, setSubmitting] = useState(false);

    const fetchDetails = async () => {
        setLoading(true);
        try {
            // Reutiliza o endpoint que retorna Veiculos + Histórico CRM
            const details = await apiClient.getSupervisorObraDetails(obraId);
            // Precisamos também dos dados Macro (KPIs) para o cabeçalho. 
            // Para otimizar, poderiamos ter tudo em uma chamada, mas aqui vamos buscar o dashboard e filtrar
            // ou assumir que o "details" trará um resumo da obra também. 
            // Vou assumir que o backend 'getObraDetails' DEVERIA retornar dados da obra também,
            // mas pelo código fornecido ele retorna { veiculos_alocados, crm_history }. 
            // Vamos fazer um patch mental: buscaremos os dados gerais da obra via getObraById ou similar
            const obraInfo = await apiClient.getObraById(obraId); 
            
            // Combinando os dados
            setData({ ...details, obraInfo });
        } catch (error) {
            console.error("Erro ao carregar detalhes:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (obraId) fetchDetails();
    }, [obraId]);

    const handleCrmSubmit = async (e) => {
        e.preventDefault();
        if (!crmNote.trim()) return;

        setSubmitting(true);
        try {
            await apiClient.addSupervisorCrmLog({
                obra_id: obraId,
                tipo_interacao: interactionType,
                resumo: crmNote,
                compromisso_data: new Date() // Data de hoje
            });
            setCrmNote('');
            fetchDetails(); // Recarrega para mostrar na timeline
        } catch (error) {
            alert('Erro ao salvar registro.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading || !data) {
        return <div className="flex h-screen items-center justify-center"><Loader className="animate-spin text-blue-600" size={40} /></div>;
    }

    const { obraInfo, veiculos_alocados, crm_history } = data;
    
    // Cálculo de Progresso Visual (Mockado se não tiver KPI no obraInfo, mas idealmente viria do backend)
    // Se getObraById não traz KPI calculado, teríamos que recalcular aqui ou ajustar o backend.
    // Vamos assumir campos básicos para exibição.

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            {/* Header de Navegação */}
            <div className="flex items-center mb-6">
                <button onClick={onBack} className="mr-4 p-2 bg-white rounded-full shadow hover:bg-slate-100 text-slate-600 transition-colors">
                    <ArrowLeft size={24} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">{obraInfo?.nome || `Obra #${obraId}`}</h1>
                    <p className="text-slate-500 text-sm flex items-center gap-2">
                        <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-bold">COCKPIT</span>
                        Responsável: {obraInfo?.responsavel}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* COLUNA 1: SAÚDE DO CONTRATO (KPIs) */}
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* Bloco KPIs */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 border-b pb-2">
                            <TrendingUp className="text-emerald-500" />
                            Saúde do Contrato
                        </h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                                <span className="text-xs font-bold text-slate-400 uppercase">Total Contratado</span>
                                <div className="text-2xl font-bold text-slate-800 flex items-center">
                                    <Clock size={20} className="mr-2 text-blue-500"/>
                                    {/* Exibindo valor raw se não tiver KPI, ajustar conforme retorno real */}
                                    {obraInfo?.contract_hours || '--'} h
                                </div>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                                <span className="text-xs font-bold text-slate-400 uppercase">Previsão Fim</span>
                                <div className="text-xl font-bold text-slate-800 flex items-center">
                                    <Calendar size={20} className="mr-2 text-purple-500"/>
                                    {/* Data mockada/placeholder se não vier calculada */}
                                    {obraInfo?.data_fim ? new Date(obraInfo.data_fim).toLocaleDateString() : 'Calculando...'}
                                </div>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                                <span className="text-xs font-bold text-slate-400 uppercase">Status Financeiro</span>
                                <div className="text-xl font-bold text-emerald-600 flex items-center">
                                    R$ {parseFloat(obraInfo?.contract_total_value || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                </div>
                            </div>
                        </div>

                        {/* Aviso de Aditivo (Visual) */}
                        <div className="relative pt-6 pb-2">
                            <div className="flex justify-between text-xs font-bold mb-1">
                                <span>Início</span>
                                <span className="text-red-500">Limite Contratual (Aditivo)</span>
                            </div>
                            <div className="h-3 bg-slate-200 rounded-full overflow-hidden flex">
                                <div className="bg-emerald-500 w-[30%]" title="Margem Segura"></div>
                                <div className="bg-yellow-400 w-[40%]" title="Atenção"></div>
                                <div className="bg-purple-500 w-[20%]" title="Crítico"></div>
                                <div className="bg-red-500 w-[10%]" title="Estouro"></div>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                <span>0%</span>
                                <span>30%</span>
                                <span>70%</span>
                                <span>90%</span>
                                <span>100%</span>
                            </div>
                        </div>
                    </div>

                    {/* Bloco Recursos (Equipamentos) */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Truck className="text-blue-500" />
                            Recursos Alocados & Equivalência
                        </h2>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3">Equipamento</th>
                                        <th className="px-4 py-3">Placa/ID</th>
                                        <th className="px-4 py-3">Operador</th>
                                        <th className="px-4 py-3 text-center">Fator Conv.</th>
                                        <th className="px-4 py-3 text-center">Horímetro Atual</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {veiculos_alocados.map((v) => (
                                        <tr key={v.id} className="border-b hover:bg-slate-50">
                                            <td className="px-4 py-3 font-medium text-slate-800">
                                                {v.modelo} <span className="text-slate-400 text-xs">({v.tipo})</span>
                                            </td>
                                            <td className="px-4 py-3">{v.placa}</td>
                                            <td className="px-4 py-3">{v.operador_atual || 'N/A'}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-1 rounded font-bold text-xs ${v.fator_conversao < 1 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {Number(v.fator_conversao).toFixed(2)}x
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center font-mono">
                                                {v.horimetro} h
                                            </td>
                                        </tr>
                                    ))}
                                    {veiculos_alocados.length === 0 && (
                                        <tr><td colSpan="5" className="p-4 text-center text-slate-400">Nenhum equipamento alocado.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>

                {/* COLUNA 2: CRM & TIMELINE (Lado Direito) */}
                <div className="lg:col-span-1 space-y-6">
                    
                    {/* Input de CRM */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-yellow-200 ring-4 ring-yellow-50/50">
                        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Phone className="text-yellow-500" />
                            Registro Diário (CRM)
                        </h2>
                        <form onSubmit={handleCrmSubmit}>
                            <div className="mb-3">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo de Interação</label>
                                <select 
                                    className="w-full p-2 border rounded-lg text-sm bg-slate-50"
                                    value={interactionType}
                                    onChange={(e) => setInteractionType(e.target.value)}
                                >
                                    <option value="daily_check">📞 Check Diário (Operacional)</option>
                                    <option value="call_30">⚠️ Aviso de 30% (Oficial)</option>
                                    <option value="call_70">🚨 Aviso de 70% (Crítico)</option>
                                    <option value="issue">🔧 Relatar Problema/Parada</option>
                                </select>
                            </div>
                            <div className="mb-3">
                                <textarea
                                    className="w-full p-3 border rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none resize-none h-24"
                                    placeholder="Resumo da conversa com o fiscal/engenheiro..."
                                    value={crmNote}
                                    onChange={(e) => setCrmNote(e.target.value)}
                                    required
                                ></textarea>
                            </div>
                            <button 
                                type="submit" 
                                disabled={submitting}
                                className="w-full bg-slate-800 text-white font-bold py-2 rounded-lg hover:bg-slate-700 transition-colors flex justify-center items-center gap-2"
                            >
                                {submitting ? <Loader size={16} className="animate-spin"/> : <Save size={16}/>}
                                Registrar Contato
                            </button>
                        </form>
                    </div>

                    {/* Timeline de Histórico */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 max-h-[600px] overflow-y-auto custom-scrollbar">
                        <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Histórico de Interações</h3>
                        
                        <div className="relative border-l-2 border-slate-200 ml-3 space-y-6 pl-6 pb-2">
                            {crm_history.map((log) => (
                                <div key={log.id} className="relative">
                                    {/* Bolinha da Timeline */}
                                    <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 border-white ${
                                        log.tipo_interacao.includes('call') ? 'bg-red-500' : 'bg-blue-400'
                                    }`}></div>
                                    
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                            log.tipo_interacao.includes('call') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                        }`}>
                                            {log.tipo_interacao === 'daily_check' ? 'Check Diário' : log.tipo_interacao}
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                            {new Date(log.created_at).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                        {log.resumo_conversa}
                                    </p>
                                    <div className="mt-1 text-[10px] text-slate-400 text-right">
                                        Registrado por: {log.supervisor_name}
                                    </div>
                                </div>
                            ))}
                            {crm_history.length === 0 && (
                                <p className="text-sm text-slate-400 italic">Nenhum registro de contato ainda.</p>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default SupervisorObraDetail;