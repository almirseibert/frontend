import React, { useState, useEffect, useCallback } from 'react';
import { 
    ArrowLeft, TrendingUp, DollarSign, Calendar, 
    Truck, MapPin, Save, Loader, AlertTriangle, MessageSquare, FileText, Printer
} from 'lucide-react';
// Caminho correto relativo a src/pages/
import apiClient from '../services/apiClient';

const SupervisorObraDetail = ({ obraId, onBack }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // Estados do CRM
    const [crmNote, setCrmNote] = useState('');
    const [interactionType, setInteractionType] = useState('daily_log'); 
    const [agreedAction, setAgreedAction] = useState('');
    const [submittingCrm, setSubmittingCrm] = useState(false);

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

    const handleCrmSubmit = async (e) => {
        e.preventDefault();
        setSubmittingCrm(true);
        try {
            await apiClient.post('/supervisor/crm', {
                obra_id: obraId,
                interaction_type: interactionType,
                notes: crmNote,
                agreed_action: agreedAction
            });
            setCrmNote('');
            setAgreedAction('');
            fetchDetails(); 
        } catch (error) {
            alert('Erro ao salvar registro.');
        } finally {
            setSubmittingCrm(false);
        }
    };

    const handleUpdateMission = async (vehicleId, location, date) => {
        try {
            await apiClient.post('/supervisor/vehicle-mission', {
                vehicle_id: vehicleId,
                next_location: location,
                release_date: date
            });
            const btn = document.getElementById(`btn-save-${vehicleId}`);
            if(btn) {
                btn.innerHTML = "Salvo!";
                btn.className = "text-green-600 font-bold text-xs";
                setTimeout(() => { 
                    btn.innerHTML = "";
                    btn.className = "text-blue-600 hover:bg-blue-50 p-2 rounded transition-colors";
                    fetchDetails();
                }, 1000);
            }
        } catch (e) { alert("Erro ao salvar destino."); }
    };

    // Função de Impressão Nativa (Substitui jsPDF para evitar erros de build)
    const handlePrint = () => {
        window.print();
    };

    // Cálculos de Data
    const calculateEndDate = () => {
        if (!data) return { date: new Date(), diasRestantes: 0 };
        const { producao } = data;
        const saldo = producao?.saldo_horas || 0;
        const ritmo = producao?.media_diaria_atual || 1;

        if (saldo <= 0) return { date: new Date(), diasRestantes: 0 };

        const diasRestantes = Math.ceil(saldo / ritmo);
        let date = new Date();
        let added = 0;
        while(added < diasRestantes && added < 2000) {
            date.setDate(date.getDate() + 1);
            if(date.getDay() !== 0 && date.getDay() !== 6) added++;
        }
        return { date, diasRestantes };
    };

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader className="animate-spin text-blue-600" /></div>;
    if (!data) return <div>Erro ao carregar dados.</div>;

    const { obra, contract, financeiro, producao, veiculos, crm_history } = data;
    const previsao = calculateEndDate();
    const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

    return (
        <div className="bg-slate-100 min-h-screen pb-20 print:bg-white print:pb-0">
            {/* Estilos específicos para Impressão */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .print-only { display: block !important; }
                    body { background: white; font-size: 12px; }
                    .card-print { border: 1px solid #ddd; box-shadow: none; break-inside: avoid; }
                    .page-break { page-break-before: always; }
                }
            `}</style>

            {/* Header (Escondido na impressão) */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-20 px-6 py-4 shadow-sm flex justify-between items-center no-print">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full"><ArrowLeft size={20}/></button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">{obra?.nome}</h1>
                        <p className="text-xs text-slate-500">Contrato: {formatCurrency(contract?.total_value)}</p>
                    </div>
                </div>
                <button 
                    onClick={handlePrint}
                    className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-900 transition-colors text-sm font-bold shadow-sm"
                >
                    <Printer size={16} /> Imprimir / Salvar PDF
                </button>
            </div>

            {/* Cabeçalho APENAS para Impressão */}
            <div className="hidden print:block p-6 border-b border-slate-300 mb-4">
                <h1 className="text-2xl font-bold text-slate-800">Relatório de Gestão da Obra</h1>
                <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                    <p><strong>Obra:</strong> {obra?.nome}</p>
                    <p><strong>Responsável:</strong> {contract.responsavel_nome || obra.responsavel || '-'}</p>
                    <p><strong>Fiscal:</strong> {contract.fiscal_nome || obra.fiscal_nome || '-'}</p>
                    <p><strong>Data Emissão:</strong> {new Date().toLocaleDateString()}</p>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-6 space-y-6 print:p-0 print:max-w-none">
                
                {/* 1. CARTÃO PRINCIPAL DE PREVISÃO */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-8 shadow-lg relative overflow-hidden card-print print:bg-none print:text-black print:border-slate-300 print:p-4">
                    <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8 print:gap-4 print:grid-cols-3">
                        <div>
                            <h3 className="text-slate-400 font-bold uppercase text-xs mb-2 print:text-slate-600">Previsão de Término</h3>
                            <div className="text-4xl font-bold text-white mb-1 print:text-black print:text-2xl">
                                {previsao.date.toLocaleDateString('pt-BR')}
                            </div>
                            <p className="text-sm text-slate-300 print:text-slate-600">
                                Restam aprox. <strong className="text-yellow-400 print:text-black">{previsao.diasRestantes} dias úteis</strong>
                            </p>
                        </div>
                        <div className="border-l border-slate-700 pl-8 print:border-slate-300">
                            <h3 className="text-slate-400 font-bold uppercase text-xs mb-2 print:text-slate-600">Ritmo Atual (Últimos {producao?.dias_analisados || 0} dias)</h3>
                            <div className="text-3xl font-bold text-blue-400 mb-1 print:text-black print:text-2xl">
                                {producao?.media_diaria_atual?.toFixed(1)}h <span className="text-sm text-slate-400 print:text-slate-600">/dia</span>
                            </div>
                        </div>
                        <div className="border-l border-slate-700 pl-8 print:border-slate-300">
                            <h3 className="text-slate-400 font-bold uppercase text-xs mb-2 print:text-slate-600">Saldo Contratual</h3>
                            <div className="text-3xl font-bold text-green-400 mb-1 print:text-black print:text-2xl">
                                {producao?.saldo_horas?.toFixed(0)}h
                            </div>
                            <div className="w-full bg-slate-700 h-2 rounded-full mt-2 print:hidden">
                                <div 
                                    className="bg-green-400 h-2 rounded-full" 
                                    style={{width: `${(1 - (producao?.saldo_horas / (contract?.total_hours_contracted || 1))) * 100}%`}}
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. GRID UNIFICADO: FINANCEIRO E DESMOBILIZAÇÃO */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 print:grid-cols-1 print:gap-4">
                    
                    {/* Coluna Direita (Financeiro) - Movida para cima na impressão se desejar, mas mantendo ordem */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col card-print">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 print:bg-slate-100">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <DollarSign size={18} className="print:hidden"/> Resumo Financeiro
                            </h3>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-blue-50 p-3 rounded-lg print:border print:border-slate-200">
                                    <p className="text-xs text-blue-600 uppercase font-bold print:text-black">Medido (Físico)</p>
                                    <p className="text-lg font-bold text-blue-800 print:text-black">{formatCurrency(financeiro?.valor_produzido)}</p>
                                </div>
                                <div className="bg-red-50 p-3 rounded-lg print:border print:border-slate-200">
                                    <p className="text-xs text-red-600 uppercase font-bold print:text-black">Despesas</p>
                                    <p className="text-lg font-bold text-red-800 print:text-black">{formatCurrency(financeiro?.total_despesas)}</p>
                                </div>
                            </div>
                            
                            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-center print:border-slate-200">
                                <p className="text-xs text-yellow-700 uppercase font-bold print:text-black">Pendente Faturamento</p>
                                <p className="text-2xl font-bold text-yellow-800 print:text-black">{formatCurrency(financeiro?.pendente_faturamento)}</p>
                            </div>

                            <div className="mt-4">
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Por Categoria</h4>
                                <div className="space-y-2 max-h-40 overflow-y-auto pr-2 print:max-h-none print:overflow-visible">
                                    {(financeiro?.categorias || []).map((cat, i) => (
                                        <div key={i} className="flex justify-between text-xs border-b border-slate-50 pb-1">
                                            <span className="text-slate-600">{cat.category || 'Outros'}</span>
                                            <span className="font-medium text-slate-800">{formatCurrency(cat.total)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Coluna Esquerda: Desmobilização (Tabela de Veículos) */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col card-print">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 print:bg-slate-100">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <Truck size={18} className="print:hidden"/> Detalhamento de Equipamentos
                            </h3>
                        </div>
                        <div className="overflow-x-auto flex-1">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-500 uppercase font-bold print:bg-slate-100 print:text-black">
                                    <tr>
                                        <th className="px-4 py-2">Veículo/RE</th>
                                        <th className="px-4 py-2">Total Exec.</th>
                                        <th className="px-4 py-2">Previsão</th>
                                        <th className="px-4 py-2">Próximo Destino</th>
                                        <th className="px-4 py-2 no-print"></th>
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
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* 3. DIÁRIO DE BORDO E REGISTROS */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:block">
                    {/* Formulário (Escondido na impressão) */}
                    <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200 no-print">
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <MessageSquare size={18}/> Novo Registro
                        </h3>
                        <form onSubmit={handleCrmSubmit} className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Tipo</label>
                                <select 
                                    className="w-full mt-1 border rounded p-2 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-100"
                                    value={interactionType}
                                    onChange={e => setInteractionType(e.target.value)}
                                >
                                    <option value="daily_log">Diário de Bordo</option>
                                    <option value="billing_milestone">Marco de Cobrança</option>
                                    <option value="routine">Rotina Diária</option>
                                    <option value="issue">Problema/Impedimento</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Descrição</label>
                                <textarea 
                                    className="w-full mt-1 border rounded p-2 text-sm focus:ring-2 ring-blue-100 outline-none"
                                    rows="4"
                                    placeholder="Descreva o acontecimento..."
                                    value={crmNote}
                                    onChange={e => setCrmNote(e.target.value)}
                                    required
                                ></textarea>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Ação Acordada (Opcional)</label>
                                <input 
                                    type="text"
                                    className="w-full mt-1 border rounded p-2 text-sm focus:ring-2 ring-blue-100 outline-none"
                                    placeholder="Ex: Enviar medição dia 15"
                                    value={agreedAction}
                                    onChange={e => setAgreedAction(e.target.value)}
                                />
                            </div>
                            <button 
                                type="submit" 
                                disabled={submittingCrm}
                                className="w-full bg-blue-600 text-white py-2 rounded font-bold text-sm hover:bg-blue-700 transition-colors flex justify-center items-center gap-2"
                            >
                                {submittingCrm ? <Loader size={16} className="animate-spin"/> : <Save size={16}/>}
                                Salvar Registro
                            </button>
                        </form>
                    </div>

                    {/* Linha do Tempo / Histórico */}
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200 card-print print:mt-4">
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <FileText size={18} className="print:hidden"/> Histórico de Registros e Diário
                        </h3>
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 print:max-h-none print:overflow-visible">
                            {(crm_history || []).map((log) => (
                                <div key={log.id} className="relative pl-6 border-l-2 border-slate-200 pb-4 last:pb-0 print:border-l print:border-slate-300">
                                    <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white print:border-slate-300 ${
                                        log.interaction_type === 'billing_milestone' ? 'bg-green-500' :
                                        log.interaction_type === 'issue' ? 'bg-red-500' :
                                        'bg-blue-400'
                                    }`}></div>
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded print:border print:border-slate-200 print:bg-white print:text-black ${
                                            log.interaction_type === 'billing_milestone' ? 'bg-green-100 text-green-700' :
                                            log.interaction_type === 'issue' ? 'bg-red-100 text-red-700' :
                                            'bg-blue-50 text-blue-700'
                                        }`}>
                                            {log.interaction_type === 'daily_log' ? 'Diário' : 
                                             log.interaction_type === 'billing_milestone' ? 'Cobrança' :
                                             log.interaction_type === 'routine' ? 'Rotina' : 'Problema'}
                                        </span>
                                        <span className="text-xs text-slate-400 print:text-slate-600">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                                    </div>
                                    <p className="text-sm text-slate-700 mb-1 print:text-black">{log.notes}</p>
                                    <div className="flex justify-between items-center mt-2">
                                        <span className="text-xs text-slate-400 italic">Por: {log.supervisor_name || 'Sistema'}</span>
                                        {log.agreed_action && (
                                            <span className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded border border-orange-100 flex items-center gap-1 print:border-black print:text-black print:bg-white">
                                                <AlertTriangle size={10} /> {log.agreed_action}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {(crm_history || []).length === 0 && <p className="text-slate-400 text-sm text-center">Nenhum registro.</p>}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

// Componente de Linha de Máquina
const MachineRow = ({ vehicle, globalEndDate, onSave }) => {
    const [location, setLocation] = useState(vehicle.proximo_destino || '');
    const [date, setDate] = useState(
        vehicle.data_liberacao_manual 
        ? vehicle.data_liberacao_manual.split('T')[0] 
        : globalEndDate.toISOString().split('T')[0]
    );

    return (
        <tr className="hover:bg-slate-50 print:hover:bg-transparent">
            <td className="px-4 py-3 align-top">
                <div className="font-bold text-slate-700">{vehicle.modelo}</div>
                <div className="text-[10px] text-slate-400 print:text-slate-600">{vehicle.placa || vehicle.re || '-'}</div>
            </td>
            <td className="px-4 py-3 align-top">
                <span className="text-xs font-bold text-slate-700">{vehicle.total_executado?.toFixed(1) || '0.0'}h</span>
            </td>
            <td className="px-4 py-3 align-top">
                <input 
                    type="date" 
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="border border-slate-300 rounded p-1 text-slate-600 text-xs w-full focus:border-blue-500 outline-none print:hidden"
                />
                <span className="hidden print:block text-xs">{new Date(date).toLocaleDateString()}</span>
            </td>
            <td className="px-4 py-3 align-top">
                <input 
                    type="text" 
                    placeholder="Destino..." 
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="border-b border-slate-300 bg-transparent py-1 w-full text-xs outline-none focus:border-blue-500 placeholder:text-slate-300 print:hidden"
                />
                <span className="hidden print:block text-xs">{location || '-'}</span>
            </td>
            <td className="px-4 py-3 text-right no-print">
                <button 
                    id={`btn-save-${vehicle.id}`}
                    onClick={() => onSave(vehicle.id, location, date)}
                    className="text-blue-600 hover:bg-blue-50 p-2 rounded transition-colors"
                >
                    <Save size={16} />
                </button>
            </td>
        </tr>
    );
};

export default SupervisorObraDetail;