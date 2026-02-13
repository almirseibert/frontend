import React, { useState, useEffect, useRef } from 'react';
import { 
    ArrowLeft, Clock, Calendar, Phone, TrendingUp, AlertTriangle, 
    Truck, Save, Loader, CheckSquare, FileText, Share2, Printer, CheckCircle
} from 'lucide-react';
import { jsPDF } from "jspdf";
import 'jspdf-autotable';
import apiClient from '../services/apiClient';

const SupervisorObraDetail = ({ obraId, onBack }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(new Date());
    
    // Estado para CRM
    const [crmNote, setCrmNote] = useState('');
    const [interactionType, setInteractionType] = useState('daily_check'); 
    const [submittingCrm, setSubmittingCrm] = useState(false);

    // Fetch principal
    const fetchDetails = async () => {
        setLoading(true);
        try {
            // 1. Busca detalhes específicos (Veículos, Histórico CRM)
            const details = await apiClient.get('/supervisor/obra/' + obraId);
            
            // 2. Busca dados Macro (precisamos recalcular ou pegar do dashboard array se estivesse em context, 
            // mas aqui buscamos tudo novamente para garantir integridade)
            const dashboardData = await apiClient.get('/supervisor/dashboard');
            const macroData = dashboardData.find(o => o.id === parseInt(obraId));

            if (!macroData) throw new Error("Obra não encontrada nos ativos.");

            setData({ 
                ...details, 
                macro: macroData 
            });
            setLastUpdate(new Date());

        } catch (error) {
            console.error("Erro ao carregar cockpit:", error);
            // Fallback ou alerta
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (obraId) fetchDetails();
    }, [obraId]);

    // --- AÇÕES DO CRM ---
    const handleCrmSubmit = async (e) => {
        e.preventDefault();
        if (!crmNote.trim()) return;
        setSubmittingCrm(true);
        try {
            await apiClient.post('/supervisor/crm', {
                obra_id: obraId,
                tipo_interacao: interactionType,
                resumo: crmNote,
                compromisso_data: new Date()
            });
            setCrmNote('');
            // Recarrega apenas a parte necessária idealmente, mas aqui recarregamos tudo
            const updatedDetails = await apiClient.get('/supervisor/obra/' + obraId);
            setData(prev => ({ ...prev, crm_history: updatedDetails.crm_history }));
        } catch (error) {
            alert('Erro ao salvar registro.');
        } finally {
            setSubmittingCrm(false);
        }
    };

    const handleQuickAction = (type, text) => {
        setInteractionType(type);
        setCrmNote(text);
        // Opcional: auto-submit ou focar no text area
    };

    // --- GERADOR DE RELATÓRIO PDF ---
    const generatePDF = () => {
        if (!data) return;
        const doc = new jsPDF();
        const { macro, veiculos_alocados, crm_history } = data;

        // Cabeçalho
        doc.setFontSize(18);
        doc.text(`Relatório de Acompanhamento: ${macro.nome}`, 14, 20);
        
        doc.setFontSize(10);
        doc.text(`Gerado em: ${new Date().toLocaleDateString()} às ${new Date().toLocaleTimeString()}`, 14, 28);
        doc.text(`Responsável: ${macro.responsavel} | Fiscal: ${macro.fiscal_nome || 'N/A'}`, 14, 34);

        // KPI Resumo
        doc.autoTable({
            startY: 40,
            head: [['Horas Contratadas', 'Horas Executadas', 'Saldo', 'Previsão Término']],
            body: [[
                macro.kpi.horas_contratadas,
                macro.kpi.horas_executadas,
                macro.kpi.saldo.toFixed(1),
                macro.kpi.data_fim_estimada ? new Date(macro.kpi.data_fim_estimada).toLocaleDateString() : 'N/A'
            ]],
            theme: 'grid',
            headStyles: { fillColor: [255, 193, 7] } // Yellow-400
        });

        // Veículos
        doc.text("Recursos Alocados (Equipamentos)", 14, doc.lastAutoTable.finalY + 10);
        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 15,
            head: [['Equipamento', 'Placa', 'Fator', 'Horímetro Atual']],
            body: veiculos_alocados.map(v => [
                `${v.modelo} (${v.tipo})`,
                v.placa,
                v.fator_conversao,
                v.horimetro
            ]),
        });

        // Espaço para anotações manuais
        doc.text("Anotações do Fiscal / Engenheiro:", 14, doc.lastAutoTable.finalY + 15);
        doc.setLineWidth(0.5);
        doc.rect(14, doc.lastAutoTable.finalY + 20, 180, 40); // Caixa vazia

        doc.save(`Relatorio_${macro.nome.replace(/\s+/g, '_')}.pdf`);
    };

    if (loading || !data) {
        return <div className="flex h-screen items-center justify-center bg-slate-100"><Loader className="animate-spin text-yellow-500" size={40} /></div>;
    }

    const { macro, veiculos_alocados, crm_history } = data;
    const kpi = macro.kpi || {};

    // Cores dinâmicas para a barra de progresso detalhada
    const getProgressColor = (p) => {
        if (p > 90) return 'bg-red-600';
        if (p > 70) return 'bg-purple-600';
        if (p > 30) return 'bg-yellow-500';
        return 'bg-emerald-500';
    };

    const percentual = parseFloat(kpi.percentual_conclusao || 0);
    const saldoHoras = parseFloat(kpi.saldo || 0);

    return (
        <div className="min-h-screen bg-slate-100 p-4 sm:p-6 pb-20">
            {/* 1. TOPO: NAVEGAÇÃO E STATUS GERAL */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div className="flex items-center">
                    <button onClick={onBack} className="mr-4 p-2 bg-white rounded-full shadow-sm hover:bg-slate-200 text-slate-600 transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 leading-tight">{macro.nome}</h1>
                        <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                            <span className="flex items-center gap-1"><Truck size={14}/> {veiculos_alocados.length} Maq.</span>
                            <span className="w-1 h-1 bg-slate-400 rounded-full"></span>
                            <span className="flex items-center gap-1"><Clock size={14}/> Ritmo: {kpi.media_diaria_atual}h/dia</span>
                        </div>
                    </div>
                </div>
                
                <button 
                    onClick={generatePDF}
                    className="bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 flex items-center gap-2 font-medium shadow-sm transition-colors"
                >
                    <Printer size={18} />
                    Relatório de Cobrança
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 2. COLUNA ESQUERDA: KPIs E RECURSOS (2/3 da tela) */}
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* CARD PRINCIPAL: SAÚDE DO CONTRATO */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h2 className="font-bold text-slate-700 flex items-center gap-2">
                                <TrendingUp className="text-blue-600" size={20}/>
                                Saúde Financeira & Prazos
                            </h2>
                            <div className="text-xs font-mono text-slate-400">ID Contrato: #{macro.contract_id || 'N/A'}</div>
                        </div>

                        <div className="p-6">
                            {/* Grid de Valores */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div className="text-[10px] uppercase font-bold text-blue-400 mb-1">Total Contratado</div>
                                    <div className="text-xl font-bold text-slate-800">{Number(kpi.horas_contratadas).toFixed(0)}h</div>
                                    <div className="text-xs text-slate-500">R$ {parseFloat(macro.valor_total_contrato || 0).toLocaleString('pt-BR')}</div>
                                </div>
                                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                                    <div className="text-[10px] uppercase font-bold text-emerald-500 mb-1">Executado Real</div>
                                    <div className="text-xl font-bold text-slate-800">{Number(kpi.horas_executadas).toFixed(1)}h</div>
                                    <div className="text-xs text-emerald-600 font-bold">{percentual.toFixed(1)}%</div>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Saldo Horas</div>
                                    <div className={`text-xl font-bold ${saldoHoras < 0 ? 'text-red-500' : 'text-slate-800'}`}>
                                        {saldoHoras.toFixed(1)}h
                                    </div>
                                </div>
                                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 ring-2 ring-yellow-100 ring-opacity-50">
                                    <div className="text-[10px] uppercase font-bold text-yellow-600 mb-1">Previsão Fim</div>
                                    <div className="text-xl font-bold text-slate-800">
                                        {kpi.data_fim_estimada ? new Date(kpi.data_fim_estimada).toLocaleDateString('pt-BR') : '--/--'}
                                    </div>
                                    <div className="text-xs text-yellow-700 font-bold">{kpi.dias_restantes_estimados} dias úteis</div>
                                </div>
                            </div>

                            {/* Barra de Burnup Visual */}
                            <div className="relative pt-6">
                                <div className="flex justify-between text-xs font-bold mb-2 text-slate-500">
                                    <span>Início</span>
                                    <span>Progresso Atual ({percentual.toFixed(1)}%)</span>
                                    <span>Meta (100%)</span>
                                </div>
                                <div className="h-4 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200 relative">
                                    {/* Marcadores de 30, 70, 90 */}
                                    <div className="absolute top-0 bottom-0 w-px bg-slate-300 left-[30%]" title="Marco 30%"></div>
                                    <div className="absolute top-0 bottom-0 w-px bg-slate-300 left-[70%]" title="Marco 70%"></div>
                                    <div className="absolute top-0 bottom-0 w-px bg-red-300 left-[90%]" title="Alerta 90%"></div>
                                    
                                    {/* Barra preenchida */}
                                    <div 
                                        className={`h-full ${getProgressColor(percentual)} transition-all duration-1000 relative`}
                                        style={{ width: `${Math.min(percentual, 100)}%` }}
                                    >
                                        <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[url('https://www.transparenttextures.com/patterns/diagonal-stripes.png')]"></div>
                                    </div>
                                </div>
                                <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-1">
                                    <span>0%</span>
                                    <span className="text-center translate-x-[-50%] pl-[30%]">30% (Aviso)</span>
                                    <span className="text-center translate-x-[-50%] pl-[40%]">70% (Crítico)</span>
                                    <span>100%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* TABELA DE RECURSOS E EQUIVALÊNCIA */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="font-bold text-slate-700 flex items-center gap-2">
                                <Truck className="text-orange-500" size={20}/>
                                Alocação & Fator de Conversão
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3">Equipamento</th>
                                        <th className="px-4 py-3">Placa</th>
                                        <th className="px-4 py-3">Operador</th>
                                        <th className="px-4 py-3 text-center">Fator Conv. ⚖️</th>
                                        <th className="px-4 py-3 text-right">Horímetro</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {veiculos_alocados.map((v) => (
                                        <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 font-medium text-slate-800">
                                                {v.modelo} <span className="text-xs text-slate-400 block">{v.tipo}</span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 font-mono">{v.placa}</td>
                                            <td className="px-4 py-3 text-slate-600">{v.operador_atual || '-'}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                    v.fator_conversao < 1 ? 'bg-orange-100 text-orange-700' : 
                                                    v.fator_conversao > 1 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                    {Number(v.fator_conversao).toFixed(2)}x
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                                                {v.horimetro} h
                                            </td>
                                        </tr>
                                    ))}
                                    {veiculos_alocados.length === 0 && (
                                        <tr><td colSpan="5" className="p-8 text-center text-slate-400">Nenhum equipamento alocado.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* 3. COLUNA DIREITA: CRM DIÁRIO (1/3 da tela) */}
                <div className="space-y-6">
                    
                    {/* INPUT CRM */}
                    <div className="bg-white p-5 rounded-xl shadow-md border-l-4 border-yellow-400 ring-1 ring-slate-100">
                        <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2 uppercase tracking-wide">
                            <Phone size={16} className="text-yellow-500" />
                            Registro Diário (CRM)
                        </h2>
                        
                        {/* Ações Rápidas */}
                        <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
                            <button 
                                onClick={() => handleQuickAction('daily_check', 'Conferência diária realizada. Equipamentos ok.')}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full text-xs whitespace-nowrap border border-slate-200 transition-colors"
                            >
                                ✅ Check Diário
                            </button>
                            <button 
                                onClick={() => handleQuickAction('call_30', 'Cliente avisado sobre atingimento de 30% do contrato.')}
                                className="px-3 py-1 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-full text-xs whitespace-nowrap border border-yellow-200 transition-colors"
                            >
                                ⚠️ Aviso 30%
                            </button>
                            <button 
                                onClick={() => handleQuickAction('call_70', 'Cliente alertado: 70% atingido. Necessário aditivo em breve.')}
                                className="px-3 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-full text-xs whitespace-nowrap border border-purple-200 transition-colors"
                            >
                                🚨 Crítico 70%
                            </button>
                        </div>

                        <form onSubmit={handleCrmSubmit} className="space-y-3">
                            <textarea
                                className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none resize-none h-28 bg-slate-50 focus:bg-white transition-all"
                                placeholder="Resumo da conversa com o fiscal/engenheiro..."
                                value={crmNote}
                                onChange={(e) => setCrmNote(e.target.value)}
                                required
                            ></textarea>
                            
                            <div className="flex justify-between items-center">
                                <select 
                                    className="text-xs p-2 border rounded bg-white text-slate-600 outline-none"
                                    value={interactionType}
                                    onChange={(e) => setInteractionType(e.target.value)}
                                >
                                    <option value="daily_check">📞 Rotina</option>
                                    <option value="call_30">⚠️ Marco 30%</option>
                                    <option value="call_70">🚨 Marco 70%</option>
                                    <option value="issue">🔧 Problema</option>
                                </select>
                                <button 
                                    type="submit" 
                                    disabled={submittingCrm}
                                    className="bg-slate-900 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2 text-xs shadow-md"
                                >
                                    {submittingCrm ? <Loader size={14} className="animate-spin"/> : <Save size={14}/>}
                                    Salvar
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* TIMELINE */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 h-[500px] flex flex-col">
                        <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 border-b pb-2">Linha do Tempo</h3>
                        
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative">
                            <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-200"></div>
                            
                            {crm_history.map((log) => (
                                <div key={log.id} className="relative pl-8 mb-6 group">
                                    {/* Bolinha da Timeline */}
                                    <div className={`
                                        absolute left-[5px] top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm z-10
                                        ${log.tipo_interacao.includes('70') || log.tipo_interacao === 'issue' ? 'bg-red-500' : 
                                          log.tipo_interacao.includes('30') ? 'bg-yellow-400' : 'bg-blue-400'}
                                    `}></div>
                                    
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 group-hover:border-slate-300 transition-colors relative">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                                log.tipo_interacao === 'issue' ? 'bg-red-100 text-red-700' : 
                                                log.tipo_interacao.includes('call') ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-600'
                                            }`}>
                                                {log.tipo_interacao.replace('_', ' ')}
                                            </span>
                                            <span className="text-[10px] text-slate-400">
                                                {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-700 leading-relaxed">
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
    );
};

export default SupervisorObraDetail;