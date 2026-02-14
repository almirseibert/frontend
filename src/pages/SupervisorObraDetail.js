import React, { useState, useEffect, useRef } from 'react';
import { 
    ArrowLeft, Clock, Calendar, Phone, TrendingUp, AlertTriangle, 
    Truck, Save, Loader, CheckSquare, FileText, Share2, Printer, CheckCircle
} from 'lucide-react';
import apiClient from '../services/apiClient';

const SupervisorObraDetail = ({ obraId, onBack }) => {
    const [data, setData] = useState(null); // Agora armazena { obra, vehicles, crm_history }
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(new Date());
    
    // Estado para CRM
    const [crmNote, setCrmNote] = useState('');
    const [interactionType, setInteractionType] = useState('daily_check'); 
    const [submittingCrm, setSubmittingCrm] = useState(false);

    // Fetch simplificado e robusto
    const fetchDetails = async () => {
        setLoading(true);
        setError(null);
        try {
            // Busca tudo em uma única chamada otimizada
            const response = await apiClient.get('/supervisor/obra/' + obraId);
            
            // O backend agora retorna { obra, vehicles, crm_history }
            // Não precisamos mais buscar o dashboard e filtrar manualmente
            if (!response || !response.obra) {
                throw new Error("Dados da obra não retornados pelo servidor.");
            }

            setData(response);
            setLastUpdate(new Date());
        } catch (error) {
            console.error("Erro ao carregar detalhes:", error);
            setError("Não foi possível carregar os dados da obra. Verifique se o ID está correto ou se a obra está ativa.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (obraId) fetchDetails();
    }, [obraId]);

    const handleSaveCRM = async () => {
        if (!crmNote.trim()) return;
        setSubmittingCrm(true);
        try {
            await apiClient.post('/supervisor/crm', {
                obra_id: obraId,
                tipo_interacao: interactionType,
                resumo_conversa: crmNote,
                data_proximo_contato: null
            });
            setCrmNote('');
            fetchDetails(); // Recarrega para mostrar o novo log
        } catch (error) {
            alert('Erro ao salvar registro CRM');
        } finally {
            setSubmittingCrm(false);
        }
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
            <Loader size={40} className="text-blue-600 animate-spin mb-4" />
            <span className="text-slate-600 font-medium">Carregando dados da obra...</span>
        </div>
    );

    if (error) return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-50 p-6">
            <div className="bg-red-50 text-red-600 p-6 rounded-xl border border-red-100 max-w-md text-center">
                <AlertTriangle size={48} className="mx-auto mb-4" />
                <h3 className="text-lg font-bold mb-2">Erro ao acessar Obra</h3>
                <p>{error}</p>
                <button onClick={onBack} className="mt-6 px-4 py-2 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                    Voltar para o Dashboard
                </button>
            </div>
        </div>
    );

    // Desestruturação segura
    const { obra, vehicles, crm_history } = data;
    const { kpi, previsao } = obra;

    // Cores dinâmicas
    const getStatusColor = (percent) => {
        if (percent >= 90) return 'bg-red-500';
        if (percent >= 70) return 'bg-purple-500';
        if (percent >= 30) return 'bg-yellow-400';
        return 'bg-emerald-500';
    };

    const statusColor = getStatusColor(kpi.percentual_conclusao);

    return (
        <div className="bg-slate-50 min-h-screen pb-20">
            {/* Header Fixo */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                {obra.nome}
                                <span className="text-xs font-normal px-2 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200">
                                    ID: {obra.id.substring(0,6)}...
                                </span>
                            </h1>
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                                <span className="flex items-center gap-1"><Clock size={12}/> Atualizado: {lastUpdate.toLocaleTimeString()}</span>
                                <span className="flex items-center gap-1"><CheckSquare size={12}/> Status: {obra.status || 'Ativa'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                            <p className="text-xs text-slate-400">Progresso Geral</p>
                            <p className="text-lg font-bold text-slate-700">{kpi.percentual_conclusao}%</p>
                        </div>
                        <div className="w-12 h-12 rounded-full border-4 border-slate-100 flex items-center justify-center relative">
                             <div className={`absolute inset-0 rounded-full opacity-20 ${statusColor}`}></div>
                             <TrendingUp size={20} className={kpi.percentual_conclusao > 90 ? 'text-red-500' : 'text-blue-600'} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* COLUNA ESQUERDA: KPIs e Burnup */}
                    <div className="space-y-6 lg:col-span-2">
                        {/* Cards de Resumo */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Financeiro</p>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-2xl font-bold text-slate-700">
                                            R$ {(kpi.total_gasto/1000).toFixed(1)}k
                                        </p>
                                        <p className="text-xs text-slate-400">de R$ {(kpi.valor_total_contrato/1000).toFixed(1)}k</p>
                                    </div>
                                    <div className="h-10 w-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                                        <TrendingUp size={20} />
                                    </div>
                                </div>
                                <div className="mt-3 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-emerald-500 h-full rounded-full" style={{width: `${(kpi.total_gasto / kpi.valor_total_contrato * 100) || 0}%`}}></div>
                                </div>
                            </div>

                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Horas Máquina</p>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-2xl font-bold text-slate-700">
                                            {kpi.horas_realizadas.toFixed(0)}h
                                        </p>
                                        <p className="text-xs text-slate-400">de {kpi.horas_contratadas.toFixed(0)}h</p>
                                    </div>
                                    <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                                        <Clock size={20} />
                                    </div>
                                </div>
                                <div className="mt-3 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-blue-500 h-full rounded-full" style={{width: `${(kpi.horas_realizadas / kpi.horas_contratadas * 100) || 0}%`}}></div>
                                </div>
                            </div>

                            <div className={`p-4 rounded-xl shadow-sm border ${previsao.status === 'atrasado' ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'}`}>
                                <p className={`text-xs font-semibold uppercase mb-1 ${previsao.status === 'atrasado' ? 'text-red-400' : 'text-slate-400'}`}>Previsão Término</p>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className={`text-xl font-bold ${previsao.status === 'atrasado' ? 'text-red-700' : 'text-slate-700'}`}>
                                            {previsao.data_termino_estimada ? new Date(previsao.data_termino_estimada).toLocaleDateString() : '--/--'}
                                        </p>
                                        <p className={`text-xs ${previsao.status === 'atrasado' ? 'text-red-500' : 'text-slate-400'}`}>
                                            Prazo: {obra.data_fim_contratual ? new Date(obra.data_fim_contratual).toLocaleDateString() : 'N/A'}
                                        </p>
                                    </div>
                                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${previsao.status === 'atrasado' ? 'bg-white text-red-500' : 'bg-indigo-50 text-indigo-600'}`}>
                                        <Calendar size={20} />
                                    </div>
                                </div>
                                {previsao.status === 'atrasado' && (
                                    <div className="mt-2 flex items-center gap-1 text-[10px] text-red-600 font-bold bg-white/50 px-2 py-1 rounded">
                                        <AlertTriangle size={10} /> Risco de Atraso Detectado
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Lista de Equipamentos (Veículos) */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    <Truck size={18} className="text-slate-400" />
                                    Equipamentos Alocados
                                </h3>
                                <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                                    {vehicles.length} Ativos
                                </span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {vehicles.map(v => (
                                    <div key={v.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                                                {v.plate.slice(-3)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-700">{v.model}</p>
                                                <p className="text-xs text-slate-400 uppercase">{v.plate}</p>
                                            </div>
                                        </div>
                                        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                                            Operando
                                        </span>
                                    </div>
                                ))}
                                {vehicles.length === 0 && (
                                    <div className="p-8 text-center text-slate-400 text-sm">
                                        Nenhum veículo alocado atualmente nesta obra.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* COLUNA DIREITA: CRM / Diário */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[600px]">
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    <FileText size={18} className="text-slate-400" />
                                    Diário de Obra (CRM)
                                </h3>
                            </div>
                            
                            {/* Input Area */}
                            <div className="p-4 bg-slate-50 border-b border-slate-100">
                                <textarea 
                                    className="w-full text-sm p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                                    rows="3"
                                    placeholder="Registrar ocorrência, visita ou observação..."
                                    value={crmNote}
                                    onChange={(e) => setCrmNote(e.target.value)}
                                ></textarea>
                                <div className="flex justify-between items-center mt-2">
                                    <select 
                                        className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-600 outline-none"
                                        value={interactionType}
                                        onChange={(e) => setInteractionType(e.target.value)}
                                    >
                                        <option value="daily_check">Rotina Diária</option>
                                        <option value="incident">Incidente</option>
                                        <option value="client_request">Solicitação Cliente</option>
                                        <option value="weather">Condição Climática</option>
                                    </select>
                                    <button 
                                        onClick={handleSaveCRM}
                                        disabled={!crmNote.trim() || submittingCrm}
                                        className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {submittingCrm ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
                                        Salvar
                                    </button>
                                </div>
                            </div>

                            {/* Timeline List */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {crm_history.map((log) => (
                                    <div key={log.id} className="relative pl-4 border-l-2 border-slate-100 last:border-0 pb-4">
                                        <div className="absolute -left-[5px] top-0 h-2.5 w-2.5 rounded-full bg-blue-400 ring-4 ring-white"></div>
                                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 hover:border-blue-100 transition-colors">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                                    log.tipo_interacao === 'incident' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                                                }`}>
                                                    {log.tipo_interacao}
                                                </span>
                                                <span className="text-[10px] text-slate-400">
                                                    {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                                {log.resumo_conversa}
                                            </p>
                                            <div className="mt-2 pt-2 border-t border-slate-200/50 flex items-center gap-1 text-[10px] text-slate-400">
                                                <CheckCircle size={10} />
                                                <span>Registrado por: {log.supervisor_name}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {crm_history.length === 0 && (
                                    <div className="text-center py-10 text-slate-400 italic text-sm">
                                        Nenhum registro encontrado.<br/>Inicie o acompanhamento acima.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SupervisorObraDetail;