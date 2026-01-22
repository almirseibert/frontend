import React, { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AlertTriangle, Download } from 'lucide-react';
import { SectionHeader, FilterSection } from './ReportComponents';

const AlertsReport = ({ vehicles, employees, inactivityAlerts = [], obras = [], refuelings = [] }) => {
    const [filterType, setFilterType] = useState('Todos');

    const alerts = useMemo(() => {
        const list = [];
        const now = new Date();
        now.setHours(0,0,0,0);
        const thirtyDays = new Date(now);
        thirtyDays.setDate(now.getDate() + 30);

        // 1. Alertas de Veículos
        vehicles.forEach(v => {
            if (v.possuiAviso) {
                const text = (v.avisoTexto || '').toLowerCase();
                let type = 'Manutenção';
                if (text.includes('documento') || text.includes('aet') || text.includes('tacógrafo')) type = 'Documentação';
                else if (text.includes('bloqueio')) type = 'Bloqueio';

                const obraNome = obras.find(o => o.id === v.obraAtualId)?.nome || 'Local N/A';

                list.push({
                    entity: `${v.registroInterno} - ${v.modelo}`,
                    type,
                    location: obraNome,
                    days: '-', 
                    message: v.avisoTexto,
                    date: new Date().toLocaleDateString('pt-BR'),
                    isCritical: text.includes('vencid') || text.includes('bloqueio')
                });
            }
        });

        // 2. Alertas de Funcionários (CNH)
        employees.forEach(e => {
            if (e.cnhVencimento) {
                let venc;
                if (e.cnhVencimento.includes('T')) {
                    venc = new Date(e.cnhVencimento);
                } else if (e.cnhVencimento.includes('-')) {
                    const parts = e.cnhVencimento.split('-');
                    venc = new Date(parts[0], parts[1]-1, parts[2]);
                } else {
                    venc = new Date(e.cnhVencimento);
                }

                if (!isNaN(venc.getTime())) {
                    venc.setHours(0,0,0,0);
                    const diffTime = venc.getTime() - now.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const daysLabel = diffDays < 0 ? `${Math.abs(diffDays)} dias vencido` : `${diffDays} dias para vencer`;

                    if (venc < now) {
                        list.push({ 
                            entity: e.nome, 
                            type: 'CNH', 
                            location: 'RH / Pessoal',
                            days: daysLabel,
                            message: `CNH Vencida em ${venc.toLocaleDateString('pt-BR')}`, 
                            date: venc.toLocaleDateString('pt-BR'), 
                            isCritical: true 
                        });
                    } else if (venc <= thirtyDays) {
                        list.push({ 
                            entity: e.nome, 
                            type: 'CNH', 
                            location: 'RH / Pessoal',
                            days: daysLabel,
                            message: `CNH Vence em ${venc.toLocaleDateString('pt-BR')}`, 
                            date: venc.toLocaleDateString('pt-BR'), 
                            isCritical: false 
                        });
                    }
                }
            }
        });

        // 3. Alertas de Inatividade
        inactivityAlerts.forEach(alert => {
            if (['Resolvido', 'Observado'].includes(alert.status)) return;

            const vehId = alert.vehicle?.id || alert.vehicleId || alert.vehicle_id;
            let vehicleName = alert.vehicle?.registroInterno || 'Veículo';
            
            if (!alert.vehicle?.registroInterno && vehId) {
                const v = vehicles.find(v => String(v.id) === String(vehId));
                if (v) vehicleName = v.registroInterno;
            }

            let obraName = alert.obra?.nome || alert.obra_nome;
            if (!obraName && alert.obraId) {
                const o = obras.find(ob => String(ob.id) === String(alert.obraId));
                if (o) obraName = o.nome;
            }
            if (!obraName) obraName = 'Obra Desconhecida';

            let realRefuelDate = null;
            if (refuelings && refuelings.length > 0 && vehId) {
                const vehRefuels = refuelings
                    .filter(r => String(r.vehicleId) === String(vehId) && r.status === 'Concluída')
                    .sort((a,b) => {
                        const dA = new Date(a.date || a.created_at || 0);
                        const dB = new Date(b.date || b.created_at || 0);
                        return dB - dA; 
                    });
                
                if (vehRefuels.length > 0) {
                    const latest = vehRefuels[0];
                    const dRaw = latest.date || latest.created_at;
                    const dObj = new Date(dRaw);
                    if (!isNaN(dObj.getTime())) realRefuelDate = dObj;
                }
            }

            if (!realRefuelDate) {
                const alertDateRaw = alert.lastRefuelingDate || alert.lastRefuelDate;
                if (alertDateRaw) {
                    const d = new Date(alertDateRaw);
                    if (!isNaN(d.getTime())) realRefuelDate = d;
                }
            }

            let dateStr = 'Data desc.';
            let daysDisplay = 0;

            if (realRefuelDate) {
                dateStr = realRefuelDate.toLocaleDateString('pt-BR');
                const diffTime = Math.abs(now - realRefuelDate);
                daysDisplay = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            } else {
                daysDisplay = parseInt(alert.daysSinceLastRefuel || alert.daysSinceLastRefueling || 0);
            }

            if (daysDisplay < 7) return; 

            list.push({
                entity: vehicleName,
                type: 'Inatividade',
                location: obraName, 
                days: `${daysDisplay} dias`, 
                message: `Sem abastecer desde ${dateStr}.`,
                date: dateStr, 
                isCritical: true
            });
        });

        return list.sort((a, b) => (a.isCritical === b.isCritical) ? 0 : a.isCritical ? -1 : 1);
    }, [vehicles, employees, inactivityAlerts, obras, refuelings]);

    const filteredAlerts = filterType === 'Todos' ? alerts : alerts.filter(a => a.type === filterType);

    const handleGeneratePDF = () => {
        const doc = new jsPDF('landscape');
        doc.setFontSize(18); doc.setTextColor(220, 38, 38);
        doc.text(`Relatório de Alertas de Frota`, 14, 20);
        doc.setFontSize(10); doc.setTextColor(100);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Filtro: ${filterType}`, 14, 26);

        const body = filteredAlerts.map(a => [a.entity, a.type, a.location, a.days, a.message, a.date]);

        autoTable(doc, {
            startY: 32,
            head: [['Equipamento/Colaborador', 'Tipo', 'Local / Obra', 'Status/Dias', 'Detalhe', 'Data Ref.']],
            body,
            theme: 'grid',
            headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255] },
            styles: { fontSize: 9 },
            columnStyles: { 0: { cellWidth: 40 }, 2: { cellWidth: 50 }, 4: { cellWidth: 80 } }
        });
        doc.save(`Relatorio_Alertas_${filterType}.pdf`);
    };

    return (
        <div className="animate-fade-in">
            <SectionHeader icon={AlertTriangle} title="Relatório de Alertas e Pendências" description="Consolidado de vencimentos (CNH, Documentos, Revisões), bloqueios e inatividade." />
            
            <FilterSection>
                <div className="col-span-full md:col-span-3">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Filtrar por Categoria</label>
                    <div className="flex flex-wrap gap-2">
                        {['Todos', 'Manutenção', 'Documentação', 'CNH', 'Bloqueio', 'Inatividade'].map(type => (
                            <button key={type} onClick={() => setFilterType(type)} className={`px-4 py-2 text-sm rounded-lg border transition ${filterType === type ? 'bg-red-600 text-white border-red-600 shadow' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                                {type}
                            </button>
                        ))}
                    </div>
                </div>
            </FilterSection>

            <div className="bg-white border rounded-lg shadow-sm mb-4">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h4 className="font-bold text-gray-700">Pré-visualização ({filteredAlerts.length})</h4>
                    <button onClick={handleGeneratePDF} disabled={filteredAlerts.length === 0} className="text-red-600 hover:text-red-800 font-semibold text-sm flex items-center gap-1">
                        <Download size={16}/> Baixar PDF
                    </button>
                </div>
                <div className="max-h-80 overflow-y-auto custom-scrollbar p-0">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 text-gray-600 uppercase text-xs sticky top-0">
                            <tr>
                                <th className="p-3">Entidade</th>
                                <th className="p-3">Tipo</th>
                                <th className="p-3">Local / Obra</th>
                                <th className="p-3">Status / Dias</th>
                                <th className="p-3">Detalhe</th>
                                <th className="p-3">Data Ref.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredAlerts.map((a, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="p-3 font-medium">{a.entity}</td>
                                    <td className="p-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-100 text-gray-700">{a.type}</span></td>
                                    <td className="p-3 text-gray-700">{a.location}</td>
                                    <td className="p-3 font-bold text-red-600">{a.days}</td>
                                    <td className={`p-3 ${a.isCritical ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{a.message}</td>
                                    <td className="p-3 text-gray-500 text-xs">{a.date}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AlertsReport;