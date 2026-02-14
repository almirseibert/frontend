import React, { useState, useEffect, useCallback } from 'react';
import { 
    ArrowLeft, TrendingUp, AlertTriangle, 
    Save, Loader, CheckCircle, 
    Printer, Phone, ShieldCheck, Scale, MapPin, XCircle
} from 'lucide-react';
import apiClient from '../services/apiClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; // Importação corrigida para V3+

const SupervisorObraDetail = ({ obraId, onBack }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // CRM States
    const [crmNote, setCrmNote] = useState('');
    const [interactionType, setInteractionType] = useState('daily_check');
    const [agreedAction, setAgreedAction] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchDetails = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiClient.get('/supervisor/obra/' + obraId);
            if (!res || !res.obra) throw new Error("Dados incompletos retornados.");
            setData(res);
        } catch (error) {
            console.error("Erro:", error);
            setError(error.message || "Não foi possível carregar os detalhes da obra.");
        } finally {
            setLoading(false);
        }
    }, [obraId]);

    useEffect(() => { if (obraId) fetchDetails(); }, [obraId, fetchDetails]);

    // Cálculo dinâmico de previsão
    const calculatePrediction = () => {
        if (!data || !data.obra) return { days: 0, date: new Date() };

        const { obra, contract, vehicles = [] } = data;
        const totalHours = contract?.total_hours_contracted || 0;
        const execHours = obra.kpi?.horas_executadas || 0;
        const saldo = totalHours - execHours;
        
        const heavyMachines = (vehicles || []).filter(v => 
            ['Escavadeira', 'Motoniveladora', 'Trator', 'Rolo', 'Retroescavadeira'].includes(v.tipo)
        ).length || 1;
        
        const dailyCap = heavyMachines * 8;
        const days = Math.ceil(saldo > 0 ? saldo / dailyCap : 0);
        
        const date = new Date();
        let added = 0;
        const safetyLimit = 365 * 5; 
        while(added < days && added < safetyLimit){
            date.setDate(date.getDate()+1);
            if(date.getDay() !== 0 && date.getDay() !== 6) added++;
        }
        return { days, date };
    };

    const handleSaveCRM = async (type = interactionType) => {
        setSubmitting(true);
        try {
            await apiClient.post('/supervisor/crm', {
                obra_id: obraId,
                interaction_type: type,
                notes: crmNote || (type.includes('call_') ? `Marco ${type} registrado` : 'Registro manual'),
                agreed_action: agreedAction
            });
            setCrmNote('');
            setAgreedAction('');
            fetchDetails();
        } catch (err) {
            // Mostra o erro real do backend se disponível
            alert(err.response?.data?.error || 'Erro ao salvar registro.');
        } finally {
            setSubmitting(false);
        }
    };

    const generatePDF = () => {
        if (!data) return;
        const doc = new jsPDF();
        
        const vehicles = data.vehicles || [];
        const obra = data.obra || {};
        const contract = data.contract || {};
        
        doc.setFontSize(18);
        doc.text(`Relatório: ${obra.nome || 'Obra'}`, 14, 20);
        
        doc.setFontSize(12);
        doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 30);
        doc.text(`Responsável: ${obra.responsavel || 'N/A'}`, 14, 38);
        doc.text(`Fiscal: ${contract.fiscal_nome || 'N/A'}`, 14, 46);

        const saldo = (contract.total_hours_contracted || 0) - (obra.kpi?.horas_executadas || 0);
        
        // Uso corrigido do autoTable (Chamada como função importada)
        autoTable(doc, {
            startY: 55,
            head: [['Item', 'Valor']],
            body: [
                ['Total Contratado', `${contract.total_hours_contracted || 0} h`],
                ['Total Executado', `${obra.kpi?.horas_executadas || 0} h`],
                ['Saldo Restante', `${saldo.toFixed(1)} h`],
                ['Previsão Término', calculatePrediction().date.toLocaleDateString()]
            ]
        });

        doc.text("Equipamentos Alocados", 14, doc.lastAutoTable.finalY + 10);
        
        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 15,
            head: [['Equipamento', 'Placa', 'Operador', 'Desde']],
            body: vehicles.map(v => [
                v.modelo, v.placa, v.operador_nome || 'N/A', 
                v.data_alocacao ? new Date(v.data_alocacao).toLocaleDateString() : '-'
            ])
        });

        doc.save(`Relatorio_Obra_${obraId}.pdf`);
    };

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader className="animate-spin text-blue-600" /></div>;

    if (error) {
        return (
            <div className="flex flex-col h-screen items-center justify-center text-slate-500 gap-4">
                <XCircle size={48} className="text-red-400"/>
                <p>{error}</p>
                <button onClick={onBack} className="text-blue-600 underline">Voltar para Dashboard</button>
            </div>
        );
    }

    const obra = data?.obra || {};
    const contract = data?.contract || {};
    const burnup = data?.burnup || [];
    const vehicles = data?.vehicles || [];
    const crm_history = data?.crm_history || [];

    const prediction = calculatePrediction();
    const percentual = contract?.total_hours_contracted ? ((obra.kpi?.horas_executadas || 0) / contract.total_hours_contracted * 100) : 0;

    const has30 = crm_history?.some(l => l.interaction_type === 'call_30');
    const has70 = crm_history?.some(l => l.interaction_type === 'call_70');
    const hasFinal = crm_history?.some(l => l.interaction_type === 'call_final');

    return (
        <div className="bg-slate-100 min-h-screen pb-20">
            <div className="bg-white border-b border-slate-200 sticky top-0 z-20 px-6 py-4 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full"><ArrowLeft size={20}/></button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">{obra.nome || 'Carregando...'}</h1>
                        <p className="text-xs text-slate-500">Contrato: {contract?.id ? `#${contract.id}` : 'Não configurado'}</p>
                    </div>
                </div>
                <button onClick={generatePDF} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                    <Printer size={18} /> Relatório PDF
                </button>
            </div>

            <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* COLUNA ESQUERDA: KPIs e Burnup */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-500">
                            <p className="text-xs text-slate-400 uppercase font-bold">Saldo de Horas</p>
                            <p className="text-2xl font-bold text-slate-700">
                                {((contract?.total_hours_contracted || 0) - (obra.kpi?.horas_executadas || 0)).toFixed(0)}h
                            </p>
                            <div className="w-full bg-slate-100 h-1.5 mt-2 rounded-full overflow-hidden">
                                <div className="bg-blue-500 h-full" style={{width: `${percentual}%`}}></div>
                            </div>
                            <p className="text-[10px] text-right mt-1 text-slate-400">{percentual.toFixed(1)}% Executado</p>
                        </div>
                        
                        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-purple-500">
                            <p className="text-xs text-slate-400 uppercase font-bold">Previsão Término</p>
                            <p className="text-xl font-bold text-slate-700 flex items-center gap-2">
                                {prediction.date.toLocaleDateString()}
                            </p>
                            <p className="text-xs text-purple-600 mt-1">
                                {prediction.days} dias úteis restantes
                            </p>
                        </div>

                        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-orange-500">
                            <p className="text-xs text-slate-400 uppercase font-bold">Ritmo Atual</p>
                            <p className="text-xl font-bold text-slate-700">
                                {vehicles.filter(v => ['Escavadeira','Motoniveladora','Trator','Retroescavadeira'].includes(v.tipo)).length} Máq.
                            </p>
                            <p className="text-xs text-orange-600 mt-1">
                                ~{(vehicles.length * 8)}h produção/dia
                            </p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <TrendingUp size={20} /> Queima de Horas (Burnup)
                        </h3>
                        <div className="h-64 flex items-end justify-between gap-1 border-b border-l border-slate-200 p-2 relative">
                            <div className="absolute top-0 left-0 w-full border-t border-dashed border-red-300 z-0"></div>
                            <span className="absolute top-1 right-0 text-xs text-red-400">Meta: {contract?.total_hours_contracted}h</span>
                            {burnup.map((point, i) => {
                                const height = (point.horas_dia / (contract?.total_hours_contracted || 1000)) * 100; 
                                return (
                                    <div key={i} className="flex-1 bg-blue-100 hover:bg-blue-200 transition-colors relative group rounded-t" style={{height: `${Math.min(height * 5, 100)}%`}}> 
                                        <div className="hidden group-hover:block absolute bottom-full mb-1 bg-black text-white text-xs p-1 rounded z-10 w-max">
                                            {new Date(point.data).toLocaleDateString()}: {point.horas_dia}h
                                        </div>
                                    </div>
                                )
                            })}
                            {burnup.length === 0 && <div className="w-full h-full flex items-center justify-center text-slate-400">Sem dados de produção ainda.</div>}
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <Scale size={18} /> Recursos & Equivalência
                            </h3>
                            <span className="text-xs bg-slate-200 px-2 py-1 rounded text-slate-600">Fator Padrão: 1.0</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                                    <tr>
                                        <th className="px-4 py-3">Equipamento Real</th>
                                        <th className="px-4 py-3">Contratado Como</th>
                                        <th className="px-4 py-3 text-center">Fator</th>
                                        <th className="px-4 py-3">Operador</th>
                                        <th className="px-4 py-3">Próx. Alocação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {vehicles.map(v => (
                                        <tr key={v.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-medium text-slate-700">
                                                {v.modelo} <span className="text-slate-400 font-normal">({v.placa})</span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-500">{v.grupo_contratado || v.tipo}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${v.fator_conversao < 1 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                    {v.fator_conversao || '1.0'}x
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{v.operador_nome || '---'}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1 text-slate-400 text-xs border border-dashed border-slate-300 rounded px-2 py-1 cursor-text hover:border-blue-400">
                                                    <MapPin size={12}/> Definir...
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {vehicles.length === 0 && (
                                        <tr><td colSpan="5" className="p-4 text-center text-slate-400">Nenhum veículo alocado nesta obra.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* COLUNA DIREITA: CRM & Marcos */}
                <div className="space-y-6">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><ShieldCheck size={18}/> Marcos de Cobrança</h3>
                        <div className="space-y-3">
                            <button 
                                disabled={has30 || submitting}
                                onClick={() => handleSaveCRM('call_30')}
                                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${has30 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-200 hover:border-blue-300'}`}
                            >
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    {has30 ? <CheckCircle size={16} /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300"></div>}
                                    Contato 30%
                                </span>
                                {has30 && <span className="text-[10px]">Concluído</span>}
                            </button>

                            <button 
                                disabled={has70 || submitting}
                                onClick={() => handleSaveCRM('call_70')}
                                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${has70 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-200 hover:border-blue-300'}`}
                            >
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    {has70 ? <CheckCircle size={16} /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300"></div>}
                                    Contato 70%
                                </span>
                            </button>

                            <button 
                                disabled={hasFinal || submitting}
                                onClick={() => handleSaveCRM('call_final')}
                                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${hasFinal ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-200 hover:border-blue-300'}`}
                            >
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    {hasFinal ? <CheckCircle size={16} /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300"></div>}
                                    Finalização
                                </span>
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[600px]">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <Phone size={18} /> Diário de Bordo
                            </h3>
                        </div>
                        
                        <div className="p-4 bg-white border-b border-slate-100 space-y-3">
                            <select 
                                className="w-full text-sm border rounded p-2 bg-slate-50 outline-none"
                                value={interactionType}
                                onChange={e => setInteractionType(e.target.value)}
                            >
                                <option value="daily_check">Rotina Diária</option>
                                <option value="issue">Problema / Quebra</option>
                                <option value="agreement">Acordo Verbal</option>
                            </select>
                            <textarea 
                                className="w-full text-sm p-3 rounded border border-slate-200 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                                rows="3"
                                placeholder="Descreva a ocorrência..."
                                value={crmNote}
                                onChange={e => setCrmNote(e.target.value)}
                            />
                            <input 
                                className="w-full text-sm p-2 rounded border border-slate-200 placeholder:text-slate-400"
                                placeholder="Ação Acordada (Ex: Assinará amanhã)"
                                value={agreedAction}
                                onChange={e => setAgreedAction(e.target.value)}
                            />
                            <button 
                                onClick={() => handleSaveCRM()}
                                disabled={submitting || !crmNote}
                                className="w-full bg-slate-800 text-white py-2 rounded-lg text-sm font-bold hover:bg-slate-700 flex justify-center items-center gap-2"
                            >
                                {submitting ? <Loader size={14} className="animate-spin"/> : <Save size={14} />} Salvar Registro
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                            {crm_history.map(log => (
                                <div key={log.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${log.interaction_type === 'issue' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                                            {log.interaction_type.replace('call_', 'Marco ')}
                                        </span>
                                        <span className="text-[10px] text-slate-400">{new Date(log.created_at).toLocaleString()}</span>
                                    </div>
                                    <p className="text-sm text-slate-700">{log.notes}</p>
                                    <p className="text-[10px] text-slate-400 mt-1">Por: {log.supervisor_name || 'Desconhecido'}</p>
                                    {log.agreed_action && (
                                        <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-orange-600 font-medium flex items-center gap-1">
                                            <AlertTriangle size={10} /> Acordo: {log.agreed_action}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {crm_history.length === 0 && (
                                <p className="text-center text-slate-400 text-sm py-4">Nenhum registro encontrado.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SupervisorObraDetail;