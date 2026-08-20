import React, { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AlertTriangle, Download } from 'lucide-react';
import { SectionHeader, FilterSection } from './ReportComponents';
import { checkVehicleRestrictions, getGroupForType, getVehicleMainReading, vehicleGroups } from '../../utils/vehicleRules';
import { formatObraNome } from '../../utils/obraFormat';
import { terceirizadoPdfMark } from '../ui/TerceirizadoBadge';

const AlertsReport = ({ vehicles = [], employees = [], inactivityAlerts = [], obras = [], refuelings = [], revisions = [] }) => {
    const [filterType, setFilterType] = useState('Todos');
    // Sub-filtro exclusivo da aba "Documentação": vencidos, a vencer ou ambos.
    const [docStatus, setDocStatus] = useState('todos');

    const alerts = useMemo(() => {
        const list = [];
        const now = new Date();
        now.setHours(0,0,0,0);
        const thirtyDays = new Date(now);
        thirtyDays.setDate(now.getDate() + 30);

        // 1. Alertas de Veículos (Manutenção e Documentação - Sincronizado com Dashboard)
        vehicles.forEach(v => {
            const vehicleRevisions = revisions.filter(r => r.vehicleId === v.id);
            const restrictions = checkVehicleRestrictions(v, vehicleRevisions);

            restrictions.forEach(issue => {
                let type = 'Manutenção';
                if (issue.category === 'documento') type = 'Documentação';
                else if (issue.category === 'bloqueio') type = 'Bloqueio';

                const obraNome = formatObraNome(obras.find(o => o.id === v.obraAtualId)) || 'Local N/A';

                // Documentos carregam a data de vencimento cadastrada (issue.dueDate);
                // os demais alertas não têm data própria e usam a data de geração.
                let refDate = new Date().toLocaleDateString('pt-BR');
                let daysLabel = '-';
                if (issue.dueDate instanceof Date && !isNaN(issue.dueDate.getTime())) {
                    refDate = issue.dueDate.toLocaleDateString('pt-BR');
                    const diffDays = Math.ceil((issue.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    daysLabel = diffDays < 0 ? `${Math.abs(diffDays)} dias vencido` : `${diffDays} dias para vencer`;
                }

                list.push({
                    entity: `${v.registroInterno} - ${v.placa}${terceirizadoPdfMark(v)}`,
                    type,
                    location: obraNome,
                    days: daysLabel,
                    message: issue.message,
                    date: refDate,
                    isCritical: issue.type === 'error'
                });
            });
        });

        // 2. Alertas de Funcionários (CNH)
        employees.forEach(emp => {
            // Filtro para apresentar APENAS funcionários Ativos
            if (emp.status && emp.status.toUpperCase() !== 'ATIVO') return;

            const cnhDateRaw = emp.cnhVencimento || emp.validadeCNH;

            if (cnhDateRaw) {
                let venc;
                if (typeof cnhDateRaw === 'string' && cnhDateRaw.includes('-')) {
                     const parts = cnhDateRaw.split('T')[0].split('-');
                     if (parts.length === 3) {
                         venc = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
                     } else {
                         venc = new Date(cnhDateRaw);
                     }
                } else {
                    venc = new Date(cnhDateRaw);
                }

                if (!isNaN(venc.getTime())) {
                    venc.setHours(0,0,0,0);
                    const diffTime = venc.getTime() - now.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const daysLabel = diffDays < 0 ? `${Math.abs(diffDays)} dias vencido` : `${diffDays} dias para vencer`;

                    if (venc < now) {
                        list.push({
                            entity: emp.nome,
                            type: 'CNH',
                            location: 'RH / Pessoal',
                            days: daysLabel,
                            message: `CNH Vencida em ${venc.toLocaleDateString('pt-BR')}`,
                            date: venc.toLocaleDateString('pt-BR'),
                            isCritical: true
                        });
                    } else if (venc <= thirtyDays) {
                        list.push({
                            entity: emp.nome,
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

            // Toxicológico
            const toxRaw = emp.exameToxicologicoVencimento;
            if (toxRaw) {
                let toxVenc;
                if (typeof toxRaw === 'string' && toxRaw.includes('-')) {
                    const parts = toxRaw.split('T')[0].split('-');
                    if (parts.length === 3) {
                        toxVenc = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
                    } else {
                        toxVenc = new Date(toxRaw);
                    }
                } else {
                    toxVenc = new Date(toxRaw);
                }

                if (!isNaN(toxVenc.getTime())) {
                    toxVenc.setHours(0,0,0,0);
                    const diffTime = toxVenc.getTime() - now.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const daysLabel = diffDays < 0 ? `${Math.abs(diffDays)} dias vencido` : `${diffDays} dias para vencer`;

                    if (toxVenc < now) {
                        list.push({
                            entity: emp.nome,
                            type: 'CNH',
                            location: 'RH / Pessoal',
                            days: daysLabel,
                            message: `Exame Toxicológico Vencido em ${toxVenc.toLocaleDateString('pt-BR')}`,
                            date: toxVenc.toLocaleDateString('pt-BR'),
                            isCritical: true
                        });
                    } else if (toxVenc <= thirtyDays) {
                        list.push({
                            entity: emp.nome,
                            type: 'CNH',
                            location: 'RH / Pessoal',
                            days: daysLabel,
                            message: `Exame Toxicológico Vence em ${toxVenc.toLocaleDateString('pt-BR')}`,
                            date: toxVenc.toLocaleDateString('pt-BR'),
                            isCritical: false
                        });
                    }
                }
            }
        });

        // 3. Alertas de Inatividade (Sincronizado e 100% Dinâmico)
        const DIAS_LIMITE = 7; 

        vehicles.forEach(v => {
            if (v.status !== 'Em Obra') return;
            if (!v.obraAtualId) return;

            const vehRefuels = refuelings
                .filter(r => String(r.vehicleId) === String(v.id) && String(r.obraId) === String(v.obraAtualId) && r.status === 'Concluída')
                .sort((a,b) => {
                    const dA = new Date(a.data || a.date || a.created_at || 0);
                    const dB = new Date(b.data || b.date || b.created_at || 0);
                    return dB - dA; 
                });

            let lastRefuelDate = null;
            let daysInactive = null;
            let isBasedOnAllocation = false;

            if (vehRefuels.length > 0) {
                const latest = vehRefuels[0];
                const dRaw = latest.data || latest.date || latest.created_at;
                const dObj = new Date(dRaw);
                
                if (!isNaN(dObj.getTime())) {
                    lastRefuelDate = dObj;
                    const diffTime = Math.abs(now - dObj);
                    daysInactive = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                }
            } else {
                const obra = obras.find(o => String(o.id) === String(v.obraAtualId));
                if (obra && obra.historicoVeiculos) {
                    const alocacao = obra.historicoVeiculos.find(h => String(h.veiculoId) === String(v.id) && !h.dataSaida);
                    if (alocacao && alocacao.dataEntrada) {
                        const dObj = new Date(alocacao.dataEntrada);
                        if (!isNaN(dObj.getTime())) {
                            lastRefuelDate = dObj;
                            const diffTime = Math.abs(now - dObj);
                            daysInactive = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                            isBasedOnAllocation = true;
                        }
                    }
                }
            }

            if (daysInactive === null || lastRefuelDate === null) return;

            if (daysInactive >= DIAS_LIMITE) {
                const backendAlert = inactivityAlerts.find(a => 
                    String(a.vehicleId || a.vehicle_id || a.vehicle?.id) === String(v.id) && 
                    String(a.obraId || a.obra_id || a.obra?.id) === String(v.obraAtualId) &&
                    ['Ativo', 'Pendente', 'Observado'].includes(a.status)
                );

                if (backendAlert && backendAlert.status === 'Observado') return;

                let obraNome = 'Obra Desconhecida';
                const foundObra = obras.find(o => String(o.id) === String(v.obraAtualId));
                if (foundObra) obraNome = formatObraNome(foundObra);

                const msgContext = isBasedOnAllocation ? 'desde a chegada na obra' : 'sem abastecer na obra';

                list.push({
                    entity: `${v.registroInterno} - ${v.placa}`,
                    type: 'Inatividade',
                    location: obraNome,
                    days: `${daysInactive} dias`,
                    message: `Parado há ${daysInactive} dias ${msgContext}.`,
                    date: lastRefuelDate.toLocaleDateString('pt-BR'),
                    isCritical: true
                });
            }
        });

        // Deduplicar por entity + type + message para evitar entradas duplicadas
        const seen = new Set();
        const deduped = list.filter(item => {
            const key = `${item.entity}|${item.type}|${item.message}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        return deduped.sort((a, b) => (a.isCritical === b.isCritical) ? 0 : a.isCritical ? -1 : 1);
    }, [vehicles, employees, inactivityAlerts, obras, refuelings, revisions]);

    // Linhas específicas do filtro "Manutenção" — uma linha por veículo, com
    // colunas separadas para vencimento por DATA e por LEITURA (Km/Hr). Se o
    // veículo estiver vencido pelos dois motivos, ambas as colunas são preenchidas.
    const maintenanceRows = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const rows = [];

        vehicles.forEach(v => {
            const revision = revisions.find(r => r.vehicleId === v.id);
            if (!revision) return;

            // Vencida por DATA
            let dataVencidaEm = '';
            if (revision.proximaRevisaoData) {
                const revDate = new Date(revision.proximaRevisaoData);
                revDate.setHours(0, 0, 0, 0);
                if (now >= revDate) {
                    dataVencidaEm = revDate.toLocaleDateString('pt-BR');
                }
            }

            // Vencida por LEITURA (Km/Hr)
            let leituraVencida = '';
            const readingInfo = getVehicleMainReading(v);
            const unit = readingInfo.unit;
            const currentReading = readingInfo.raw;
            let proximaLeitura = 0;
            if (unit === 'Hr') {
                proximaLeitura = parseFloat(revision.proximaRevisaoHorimetro || 0);
                if (proximaLeitura === 0 && revision.proximaRevisaoOdometro > 0) proximaLeitura = parseFloat(revision.proximaRevisaoOdometro);
            } else {
                proximaLeitura = parseFloat(revision.proximaRevisaoOdometro || 0);
            }
            if (proximaLeitura > 0 && currentReading >= proximaLeitura) {
                leituraVencida = `Venceu em: ${proximaLeitura.toLocaleString('pt-BR')} ${unit} | Atual: ${currentReading.toLocaleString('pt-BR')} ${unit}`;
            }

            // Só inclui se estiver vencida por pelo menos um dos motivos
            if (!dataVencidaEm && !leituraVencida) return;

            const obraNome = formatObraNome(obras.find(o => o.id === v.obraAtualId)) || 'Local N/A';

            rows.push({
                re: `${v.registroInterno || '-'}${terceirizadoPdfMark(v)}`,
                grupo: getGroupForType(v.tipo) || v.tipo || '-',
                marca: v.marca || '-',
                modelo: v.modelo || '-',
                local: obraNome,
                detalhe: revision.descricao || 'Revisão',
                dataVencidaEm,
                leituraVencida,
            });
        });

        return rows.sort((a, b) => String(a.re).localeCompare(String(b.re)));
    }, [vehicles, revisions, obras]);

    // Linhas do filtro "Documentação" — uma linha por documento com validade
    // cadastrada, mostrando SEMPRE a data de vencimento. Ao contrário dos alertas
    // gerais (limitados aos vencidos ou a vencer em 30 dias), aqui entram todos os
    // documentos, e o sub-filtro decide o que aparece.
    const documentRows = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const rows = [];

        vehicles.forEach(v => {
            const isTruck = vehicleGroups['Caminhões']?.includes(v.tipo) || vehicleGroups['Caminhões de Trecho']?.includes(v.tipo);
            const docs = [{ nome: 'Licenciamento', raw: v.validadeLicenciamento }];
            if (isTruck) {
                docs.push(
                    { nome: 'Tacógrafo', raw: v.validadeTacografo },
                    { nome: 'AET DAER', raw: v.validadeAET_DAER },
                    { nome: 'AET DNIT', raw: v.validadeAET_DNIT },
                );
            }

            const obraNome = formatObraNome(obras.find(o => o.id === v.obraAtualId)) || 'Local N/A';

            docs.forEach(doc => {
                if (!doc.raw) return;
                const d = new Date(doc.raw);
                if (isNaN(d.getTime())) return;
                const venc = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                const diffDays = Math.ceil((venc.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                const vencido = diffDays < 0;

                rows.push({
                    re: `${v.registroInterno || '-'} - ${v.placa || '-'}${terceirizadoPdfMark(v)}`,
                    grupo: getGroupForType(v.tipo) || v.tipo || '-',
                    marca: v.marca || '-',
                    modelo: v.modelo || '-',
                    local: obraNome,
                    documento: doc.nome,
                    vencimento: venc.toLocaleDateString('pt-BR'),
                    diffDays,
                    vencido,
                    situacao: vencido ? `Vencido há ${Math.abs(diffDays)} dias` : `Vence em ${diffDays} dias`,
                });
            });
        });

        // Vencidos primeiro (o mais antigo no topo), depois os a vencer pelo mais próximo.
        return rows.sort((a, b) => a.diffDays - b.diffDays);
    }, [vehicles, obras]);

    const filteredDocumentRows = useMemo(() => {
        if (docStatus === 'vencidos') return documentRows.filter(r => r.vencido);
        if (docStatus === 'aVencer') return documentRows.filter(r => !r.vencido);
        return documentRows;
    }, [documentRows, docStatus]);

    const isManutencao = filterType === 'Manutenção';
    const isDocumentacao = filterType === 'Documentação';
    const filteredAlerts = filterType === 'Todos' ? alerts : alerts.filter(a => a.type === filterType);

    const handleGeneratePDF = () => {
        const doc = new jsPDF('landscape');
        doc.setFontSize(18); doc.setTextColor(220, 38, 38);
        doc.text(`Relatório de Alertas de Frota`, 14, 20);
        doc.setFontSize(10); doc.setTextColor(100);
        const docStatusLabel = { todos: 'Vencidos e a vencer', vencidos: 'Somente vencidos', aVencer: 'Somente a vencer' }[docStatus];
        doc.text(
            `Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Filtro: ${filterType}` +
            (filterType === 'Documentação' ? ` (${docStatusLabel})` : ''),
            14, 26
        );

        if (isManutencao) {
            const body = maintenanceRows.map(r => [
                `${r.re} · ${r.grupo}\n${r.marca} ${r.modelo}`,
                r.local,
                r.detalhe,
                r.dataVencidaEm || '—',
                r.leituraVencida || '—',
            ]);

            autoTable(doc, {
                startY: 32,
                head: [['Equipamento', 'Local / Obra', 'Detalhe', 'Vencida por Data\n(quando venceu)', 'Vencida por Km/Hr\n(venceu / atual)']],
                body,
                theme: 'grid',
                headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255] },
                styles: { fontSize: 9, valign: 'middle' },
                columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 45 }, 2: { cellWidth: 55 }, 3: { cellWidth: 45 }, 4: { cellWidth: 65 } }
            });
            doc.save(`Relatorio_Alertas_Manutencao.pdf`);
            return;
        }

        if (isDocumentacao) {
            const body = filteredDocumentRows.map(r => [
                `${r.re} · ${r.grupo}\n${r.marca} ${r.modelo}`,
                r.local,
                r.documento,
                r.vencimento,
                r.situacao,
            ]);

            autoTable(doc, {
                startY: 32,
                head: [['Equipamento', 'Local / Obra', 'Documento', 'Vencimento', 'Situação']],
                body,
                theme: 'grid',
                headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255] },
                styles: { fontSize: 9, valign: 'middle' },
                columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 55 }, 2: { cellWidth: 40 }, 3: { cellWidth: 35 }, 4: { cellWidth: 45 } }
            });
            doc.save(`Relatorio_Documentos_${docStatus}.pdf`);
            return;
        }

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

                {isDocumentacao && (
                    <div className="col-span-full md:col-span-3 mt-3">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Situação do Documento</label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { key: 'todos', label: `Vencidos e a vencer (${documentRows.length})` },
                                { key: 'vencidos', label: `Somente vencidos (${documentRows.filter(r => r.vencido).length})` },
                                { key: 'aVencer', label: `Somente a vencer (${documentRows.filter(r => !r.vencido).length})` },
                            ].map(opt => (
                                <button key={opt.key} onClick={() => setDocStatus(opt.key)} className={`px-4 py-2 text-sm rounded-lg border transition ${docStatus === opt.key ? 'bg-slate-800 text-white border-slate-800 shadow' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </FilterSection>

            <div className="bg-white border rounded-lg shadow-sm mb-4">
                <div className="mak-modal-header">
                    <h4 className="font-bold text-gray-700">Pré-visualização ({isManutencao ? maintenanceRows.length : isDocumentacao ? filteredDocumentRows.length : filteredAlerts.length})</h4>
                    <button onClick={handleGeneratePDF} disabled={isManutencao ? maintenanceRows.length === 0 : isDocumentacao ? filteredDocumentRows.length === 0 : filteredAlerts.length === 0} className="text-red-600 hover:text-red-800 font-semibold text-sm flex items-center gap-1">
                        <Download size={16}/> Baixar PDF
                    </button>
                </div>
                <div className="max-h-80 overflow-y-auto custom-scrollbar p-0">
                    {isManutencao ? (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600 uppercase text-xs sticky top-0">
                                <tr>
                                    <th className="p-3">Equipamento</th>
                                    <th className="p-3">Local / Obra</th>
                                    <th className="p-3">Detalhe</th>
                                    <th className="p-3">Vencida por Data</th>
                                    <th className="p-3">Vencida por Km/Hr</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {maintenanceRows.map((r, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="p-3">
                                            <div className="font-medium">{r.re} · {r.grupo}</div>
                                            <div className="text-xs text-gray-500">{r.marca} {r.modelo}</div>
                                        </td>
                                        <td className="p-3 text-gray-700">{r.local}</td>
                                        <td className="p-3 text-gray-600">{r.detalhe}</td>
                                        <td className="p-3 font-semibold text-red-600">{r.dataVencidaEm || '—'}</td>
                                        <td className="p-3 font-semibold text-red-600 text-xs">{r.leituraVencida || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : isDocumentacao ? (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600 uppercase text-xs sticky top-0">
                                <tr>
                                    <th className="p-3">Equipamento</th>
                                    <th className="p-3">Local / Obra</th>
                                    <th className="p-3">Documento</th>
                                    <th className="p-3">Vencimento</th>
                                    <th className="p-3">Situação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredDocumentRows.map((r, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="p-3">
                                            <div className="font-medium">{r.re} · {r.grupo}</div>
                                            <div className="text-xs text-gray-500">{r.marca} {r.modelo}</div>
                                        </td>
                                        <td className="p-3 text-gray-700">{r.local}</td>
                                        <td className="p-3 text-gray-600">{r.documento}</td>
                                        <td className={`p-3 font-semibold ${r.vencido ? 'text-red-600' : 'text-gray-800'}`}>{r.vencimento}</td>
                                        <td className={`p-3 text-xs font-semibold ${r.vencido ? 'text-red-600' : 'text-yellow-600'}`}>{r.situacao}</td>
                                    </tr>
                                ))}
                                {filteredDocumentRows.length === 0 && (
                                    <tr><td colSpan={5} className="p-6 text-center text-gray-500">Nenhum documento nesta situação.</td></tr>
                                )}
                            </tbody>
                        </table>
                    ) : (
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
                    )}
                </div>
            </div>
        </div>
    );
};

export default AlertsReport;
