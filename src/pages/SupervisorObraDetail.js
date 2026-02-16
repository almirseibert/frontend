import React, { useState, useEffect, useCallback } from 'react';
import { 
    ArrowLeft, DollarSign, Truck, Save, Loader, 
    AlertTriangle, MessageSquare, FileText, FileDown
} from 'lucide-react';
import apiClient from '../services/apiClient';

// IMPORTANTE: Importando as bibliotecas instaladas no package.json
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const SupervisorObraDetail = ({ obraId, onBack }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
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
        } catch (error) { alert('Erro ao salvar registro.'); } finally { setSubmittingCrm(false); }
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
                btn.innerHTML = "OK";
                btn.className = "text-green-600 font-bold text-xs";
                setTimeout(() => { 
                    btn.innerHTML = "";
                    btn.className = "text-blue-600 hover:bg-blue-50 p-2 rounded transition-colors";
                    fetchDetails();
                }, 1000);
            }
        } catch (e) { alert("Erro ao salvar destino."); }
    };

    const generateRealPDF = () => {
        if (!data) {
            alert("Aguarde o carregamento dos dados.");
            return;
        }
        
        // Instancia diretamente (o plugin autoTable é anexado automaticamente pelo import 'jspdf-autotable')
        const doc = new jsPDF();
        const { obra, contract, financeiro, producao, veiculos } = data;

        // Cabeçalho
        doc.setFillColor(41, 128, 185);
        doc.rect(0, 0, 210, 24, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.text("Relatório Detalhado de Obra", 14, 16);
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.text(`Obra: ${obra.nome}`, 14, 35);
        doc.setFontSize(10);
        doc.text(`Emitido em: ${new Date().toLocaleDateString()} às ${new Date().toLocaleTimeString()}`, 14, 42);

        // Seção 1: Resumo Executivo
        doc.autoTable({
            startY: 50,
            head: [['Indicador', 'Valor', 'Indicador', 'Valor']],
            body: [
                ['Responsável', contract.responsavel_nome || '-', 'Fiscal', contract.fiscal_nome || '-'],
                ['Total Contrato', formatCurrency(financeiro.total_contrato), 'Total Despesas', formatCurrency(financeiro.total_despesas)],
                ['Hrs Contratadas', (producao.saldo_horas + producao.horas_executadas).toFixed(0), 'Hrs Executadas', producao.horas_executadas.toFixed(0)],
                ['Saldo Horas', producao.saldo_horas.toFixed(0), 'Conclusão', `${((producao.horas_executadas / (producao.saldo_horas + producao.horas_executadas || 1)) * 100).toFixed(1)}%`]
            ],
            theme: 'grid',
            headStyles: { fillColor: [52, 73, 94] },
            styles: { fontSize: 9 }
        });

        // Seção 2: Veículos e Funcionários
        doc.text("Frota Alocada e Produtividade", 14, doc.lastAutoTable.finalY + 15);
        
        const rows = veiculos.map(v => [
            v.placa || v.re || '-',
            `${v.marca || ''} ${v.modelo || ''} (${v.tipo})`,
            v.operador_atual || 'A Definir',
            v.total_executado?.toFixed(1) || '0.0',
            v.media_diaria?.toFixed(1) || '0.0',
            v.proximo_destino || '-'
        ]);

        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 18,
            head: [['RE/Placa', 'Equipamento', 'Operador/Motorista', 'Total Hrs', 'Média/Dia', 'Próx. Destino']],
            body: rows,
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185] },
            styles: { fontSize: 8 }
        });

        // Seção 3: Notas e Registros Recentes
        if (crmNote) {
            doc.text("Anotações da Sessão Atual", 14, doc.lastAutoTable.finalY + 15);
            doc.setFontSize(9);
            doc.text(crmNote, 14, doc.lastAutoTable.finalY + 22, { maxWidth: 180 });
        }

        doc.save(`Relatorio_${obra.nome.substring(0, 15).replace(/\s/g, '_')}.pdf`);
    };

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
        <div className="bg-slate-100 min-h-screen pb-20">
            <div className="bg-white border-b border-slate-200 sticky top-0 z-20 px-6 py-4 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full"><ArrowLeft size={20}/></button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">{obra?.nome}</h1>
                        <p className="text-xs text-slate-500">Contrato: {formatCurrency(contract?.total_value)}</p>
                    </div>
                </div>
                <button 
                    onClick={generateRealPDF}
                    className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-900 transition-colors text-sm font-bold shadow-sm"
                >
                    <FileDown size={16} /> Baixar PDF Detalhado
                </button>
            </div>

            <div className="max-w-7xl mx-auto p-6 space-y-6">
                {/* 1. CARTÃO DE PREVISÃO */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-8 shadow-lg relative overflow-hidden">
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
                            <h3 className="text-slate-400 font-bold uppercase text-xs mb-2">Ritmo Teórico (8h/Máq)</h3>
                            <div className="text-3xl font-bold text-blue-400 mb-1">
                                {contract.is_hidden ? '-' : `${producao?.media_diaria_atual?.toFixed(0)}h`} <span className="text-sm text-slate-400">/dia</span>
                            </div>
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
                </div>

                {/* 2. GRID UNIFICADO */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {/* Veículos */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <Truck size={18} /> Equipamentos Alocados
                            </h3>
                        </div>
                        <div className="overflow-x-auto flex-1">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-500 uppercase font-bold">
                                    <tr>
                                        <th className="px-4 py-2">Veículo</th>
                                        <th className="px-4 py-2">Total Exec.</th>
                                        <th className="px-4 py-2">Previsão</th>
                                        <th className="px-4 py-2">Próximo Destino</th>
                                        <th className="px-4 py-2"></th>
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

                    {/* Financeiro */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-100 bg-slate-50">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <DollarSign size={18} /> Resumo Financeiro
                            </h3>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-blue-50 p-3 rounded-lg">
                                    <p className="text-xs text-blue-600 uppercase font-bold">Medido (Físico)</p>
                                    <p className="text-lg font-bold text-blue-800">{formatCurrency(financeiro?.valor_produzido)}</p>
                                </div>
                                <div className="bg-red-50 p-3 rounded-lg">
                                    <p className="text-xs text-red-600 uppercase font-bold">Despesas</p>
                                    <p className="text-lg font-bold text-red-800">{formatCurrency(financeiro?.total_despesas)}</p>
                                </div>
                            </div>
                            
                            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-center">
                                <p className="text-xs text-yellow-700 uppercase font-bold">Pendente Faturamento</p>
                                <p className="text-2xl font-bold text-yellow-800">{formatCurrency(financeiro?.pendente_faturamento)}</p>
                            </div>

                            <div className="mt-4">
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Por Categoria</h4>
                                <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
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
                </div>

                {/* 3. DIÁRIO */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <MessageSquare size={18}/> Novo Registro
                        </h3>
                        <form onSubmit={handleCrmSubmit} className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Tipo</label>
                                <select 
                                    className="w-full mt-1 border rounded p-2 text-sm bg-slate-50 outline-none"
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
                                    className="w-full mt-1 border rounded p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                    rows="4"
                                    placeholder="Descreva o acontecimento..."
                                    value={crmNote}
                                    onChange={e => setCrmNote(e.target.value)}
                                    required
                                ></textarea>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Ação Acordada</label>
                                <input 
                                    type="text"
                                    className="w-full mt-1 border rounded p-2 text-sm"
                                    placeholder="Ex: Enviar medição..."
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

                    <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <FileText size={18}/> Histórico de Registros
                        </h3>
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                            {(crm_history || []).map((log) => (
                                <div key={log.id} className="relative pl-6 border-l-2 border-slate-200 pb-4 last:pb-0">
                                    <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white ${
                                        log.interaction_type === 'billing_milestone' ? 'bg-green-500' :
                                        log.interaction_type === 'issue' ? 'bg-red-500' : 'bg-blue-400'
                                    }`}></div>
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                            {log.interaction_type}
                                        </span>
                                        <span className="text-xs text-slate-400">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                                    </div>
                                    <p className="text-sm text-slate-700 mb-1">{log.notes}</p>
                                    <div className="flex justify-between items-center mt-2">
                                        <span className="text-xs text-slate-400 italic">Por: {log.supervisor_name || 'Sistema'}</span>
                                        {log.agreed_action && (
                                            <span className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded border border-orange-100 flex items-center gap-1">
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

const MachineRow = ({ vehicle, globalEndDate, onSave }) => {
    const [location, setLocation] = useState(vehicle.proximo_destino || '');
    const [date, setDate] = useState(
        vehicle.data_liberacao_manual 
        ? vehicle.data_liberacao_manual.split('T')[0] 
        : globalEndDate.toISOString().split('T')[0]
    );

    return (
        <tr className="hover:bg-slate-50">
            <td className="px-4 py-3">
                <div className="font-bold text-slate-700">{vehicle.modelo}</div>
                <div className="text-[10px] text-slate-400">{vehicle.placa || vehicle.re || '-'}</div>
            </td>
            <td className="px-4 py-3">
                <span className="text-xs font-bold text-slate-700">{vehicle.total_executado?.toFixed(1) || '0.0'}h</span>
            </td>
            <td className="px-4 py-3">
                <input 
                    type="date" 
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="border border-slate-300 rounded p-1 text-slate-600 text-xs w-full focus:border-blue-500 outline-none"
                />
            </td>
            <td className="px-4 py-3">
                <input 
                    type="text" 
                    placeholder="Destino..." 
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="border-b border-slate-300 bg-transparent py-1 w-full text-xs outline-none focus:border-blue-500 placeholder:text-slate-300"
                />
            </td>
            <td className="px-4 py-3 text-right">
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