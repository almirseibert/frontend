import React, { useState, useMemo, useEffect } from 'react';
import { 
    Calendar, CheckCircle, Clock, FileText, Filter, AlertTriangle, 
    Download, Search, Save, Lock, ArrowRight, User, Printer 
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiClient from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext'; // Importar Auth Context

const BillingPage = ({ 
    user: userProp, // Renomeado para evitar conflito com user do hook
    obras = [], 
    vehicles = [], 
    employees = [], 
    vehicleGroups = {}, 
    setAlertMessage, 
    PasswordConfirmationModal
}) => {
    // Pega a permissão de visualizador do contexto
    const { isViewer } = useAuth();

    // --- ESTADOS GERAIS ---
    // Se for visualizador, começa na aba relatório obrigatoriamente
    const [activeTab, setActiveTab] = useState(isViewer ? 'relatorio' : 'controle'); 
    const [selectedObraId, setSelectedObraId] = useState('');
    const [loadingLogs, setLoadingLogs] = useState(false);
    
    // --- ESTADOS CONTROLE DIÁRIO ---
    const [controlMonth, setControlMonth] = useState(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    });
    const [controlVehicleId, setControlVehicleId] = useState('');
    const [dailyLogs, setDailyLogs] = useState([]); 
    const [localChanges, setLocalChanges] = useState({}); 
    const [isSaving, setIsSaving] = useState(false);

    // --- ESTADOS RELATÓRIO/FATURAMENTO ---
    const [reportStartDate, setReportStartDate] = useState('');
    const [reportEndDate, setReportEndDate] = useState('');
    const [reportVehicleId, setReportVehicleId] = useState('');
    const [reportData, setReportData] = useState([]);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [pendingDateChange, setPendingDateChange] = useState(null);

    // Efeito para garantir que visualizador nunca acesse a aba controle
    useEffect(() => {
        if (isViewer && activeTab === 'controle') {
            setActiveTab('relatorio');
        }
    }, [isViewer, activeTab]);

    // ===================================================================================
    // HELPERS DE DATA E HORA
    // ===================================================================================

    const formatDateToBR = (dateString) => {
        if (!dateString) return '';
        const cleanDate = dateString.split('T')[0]; 
        const [year, month, day] = cleanDate.split('-');
        return `${day}/${month}/${year}`;
    };

    const getDayOfWeek = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString.split('T')[0] + 'T12:00:00Z');
        const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        return days[date.getUTCDay()];
    };

    const getDaysInMonth = (yearMonth) => {
        if (!yearMonth) return [];
        const [year, month] = yearMonth.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        const days = [];
        
        for (let d = 1; d <= daysInMonth; d++) {
            const dayStr = String(d).padStart(2, '0');
            const monthStr = String(month).padStart(2, '0');
            days.push(`${year}-${monthStr}-${dayStr}`);
        }
        return days;
    };

    const formatDecimalToTime = (decimal) => {
        const val = parseFloat(decimal);
        if (isNaN(val) || val === 0) return '00:00';
        
        const hours = Math.floor(val);
        const minutes = Math.round((val - hours) * 60);
        
        const finalHours = minutes === 60 ? hours + 1 : hours;
        const finalMinutes = minutes === 60 ? 0 : minutes;

        return `${finalHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`;
    };

    const calculateTimeDiffDecimal = (start, end) => {
        if (!start || !end) return 0;
        const [h1, m1] = start.split(':').map(Number);
        const [h2, m2] = end.split(':').map(Number);
        const diffMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
        return diffMinutes > 0 ? diffMinutes / 60 : 0;
    };

    const getImageDataUrl = (url) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = reject;
            img.src = url;
        });
    };

    // --- EFEITOS ---
    useEffect(() => {
        if (selectedObraId && activeTab === 'controle' && controlVehicleId && controlMonth) {
            fetchDailyLogsForControl();
        } else if (activeTab === 'controle') {
            setDailyLogs([]); 
        }
    }, [selectedObraId, controlMonth, controlVehicleId, activeTab]);

    useEffect(() => {
        if (selectedObraId && activeTab === 'relatorio' && reportStartDate && reportEndDate) {
            fetchReportData();
        }
    }, [selectedObraId, reportStartDate, reportEndDate, reportVehicleId, activeTab]);

    // --- FUNÇÕES AUXILIARES ---

    const getObraVehicles = useMemo(() => {
        if (!selectedObraId) return [];
        const obra = obras.find(o => o.id === selectedObraId);
        if (!obra || !obra.historicoVeiculos) return [];

        const vehicleMap = new Map();
        
        obra.historicoVeiculos.forEach(h => {
            const existing = vehicleMap.get(h.veiculoId);
            const isMoreRecent = !existing || new Date(h.dataEntrada) > new Date(existing.entryData.dataEntrada);
            
            if (isMoreRecent) {
                const vehicle = vehicles.find(v => v.id === h.veiculoId);
                if (vehicle) {
                    const tipo = vehicle.tipo || '';
                    const isLight = vehicleGroups['Veículos Leves']?.includes(tipo);

                    if (!isLight) {
                        vehicleMap.set(h.veiculoId, {
                            ...vehicle,
                            statusNaObra: h.dataSaida ? 'historico' : 'presente',
                            entryData: h
                        });
                    }
                }
            }
        });

        return Array.from(vehicleMap.values()).sort((a, b) => {
            const labelA = `${a.registroInterno || ''} ${a.tipo || ''} ${a.marca || ''} ${a.modelo || ''}`.toLowerCase();
            const labelB = `${b.registroInterno || ''} ${b.tipo || ''} ${b.marca || ''} ${b.modelo || ''}`.toLowerCase();
            return labelA.localeCompare(labelB);
        });
    }, [selectedObraId, obras, vehicles, vehicleGroups]);

    const getDefaultOperator = () => {
        if (dailyLogs.length > 0) {
            const lastLog = dailyLogs.find(l => l.employeeId);
            if (lastLog) return lastLog.employeeId;
        }
        
        const obra = obras.find(o => o.id === selectedObraId);
        if (!obra) return '';
        const allocation = obra.historicoVeiculos.find(h => 
            h.veiculoId === controlVehicleId && !h.dataSaida
        );
        return allocation ? allocation.employeeId : '';
    };

    // --- API CALLS ---

    const fetchDailyLogsForControl = async () => {
        setLoadingLogs(true);
        try {
            const [year, month] = controlMonth.split('-');
            const startDate = `${year}-${month}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${month}-${lastDay}`;

            const logs = await apiClient.getDailyLogs(selectedObraId, { 
                startDate, 
                endDate,
                vehicleId: controlVehicleId 
            });
            setDailyLogs(logs || []);
            setLocalChanges({});
        } catch (error) {
            console.error(error);
            setAlertMessage("Erro ao carregar registros diários.");
        } finally {
            setLoadingLogs(false);
        }
    };

    const fetchReportData = async () => {
        setLoadingLogs(true);
        try {
            const filters = { 
                startDate: reportStartDate, 
                endDate: reportEndDate
            };
            
            if (reportVehicleId) {
                filters.vehicleId = reportVehicleId;
            }

            const logs = await apiClient.getDailyLogs(selectedObraId, filters);
            setReportData(logs || []);
        } catch (error) {
            console.error(error);
            setAlertMessage("Erro ao carregar dados do relatório.");
        } finally {
            setLoadingLogs(false);
        }
    };

    const handleSaveDailyLogs = async () => {
        setIsSaving(true);
        const promises = [];

        Object.keys(localChanges).forEach(dateKey => {
            const changes = localChanges[dateKey];
            const existingLog = dailyLogs.find(l => l.date.startsWith(dateKey));
            
            const payload = {
                id: existingLog ? existingLog.id : null, // GARANTIA EXTRA: Envia o ID se já soubermos que existe
                obraId: selectedObraId,
                vehicleId: controlVehicleId, 
                date: dateKey,
                employeeId: changes.employeeId !== undefined ? changes.employeeId : (existingLog?.employeeId || getDefaultOperator()),
                morningStart: changes.morningStart !== undefined ? changes.morningStart : existingLog?.morningStart,
                morningEnd: changes.morningEnd !== undefined ? changes.morningEnd : existingLog?.morningEnd,
                afternoonStart: changes.afternoonStart !== undefined ? changes.afternoonStart : existingLog?.afternoonStart,
                afternoonEnd: changes.afternoonEnd !== undefined ? changes.afternoonEnd : existingLog?.afternoonEnd,
                observation: changes.observation !== undefined ? changes.observation : existingLog?.observation,
            };

            const morning = calculateTimeDiffDecimal(payload.morningStart, payload.morningEnd);
            const afternoon = calculateTimeDiffDecimal(payload.afternoonStart, payload.afternoonEnd);
            payload.totalHours = (morning + afternoon).toFixed(2);

            promises.push(apiClient.upsertDailyLog(payload));
        });

        try {
            await Promise.all(promises);
            setAlertMessage("Registros salvos com sucesso!");
            fetchDailyLogsForControl();
        } catch (error) {
            setAlertMessage("Erro ao salvar alguns registros. Verifique a conexão.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (dateKey, field, value) => {
        setLocalChanges(prev => ({
            ...prev,
            [dateKey]: { ...prev[dateKey], [field]: value }
        }));
    };

    const handleDateRangeChange = (field, value) => {
        const obra = obras.find(o => o.id === selectedObraId);
        if (obra) {
            const startLimit = new Date(obra.dataInicio);
            const endLimit = obra.dataFim ? new Date(obra.dataFim) : new Date();
            const checkDate = new Date(value);
            checkDate.setHours(12,0,0,0);
            startLimit.setHours(0,0,0,0);
            endLimit.setHours(23,59,59,999);

            if (!isNaN(checkDate.getTime()) && (checkDate < startLimit || checkDate > endLimit)) {
                setPendingDateChange({ field, value });
                setShowPasswordModal(true);
                return;
            }
        }
        if (field === 'start') setReportStartDate(value);
        else setReportEndDate(value);
    };

    const confirmDateChange = () => {
        if (pendingDateChange) {
            if (pendingDateChange.field === 'start') setReportStartDate(pendingDateChange.value);
            else setReportEndDate(pendingDateChange.value);
            setPendingDateChange(null);
        }
    };

    // ===================================================================================
    // GERAÇÃO DE PDF
    // ===================================================================================

    const generateDetailedPDF = async () => {
        const doc = new jsPDF('l', 'mm', 'a4'); 
        const obra = obras.find(o => o.id === selectedObraId);
        
        let vehicleLabel = "Todos";
        let frotaLabel = "";
        let operatorLabel = "Diversos";

        if (reportVehicleId) {
            const v = vehicles.find(ve => ve.id === reportVehicleId);
            if (v) {
                vehicleLabel = `${v.tipo} ${v.marca} ${v.modelo}`;
                frotaLabel = v.registroInterno;
                const operators = reportData.map(d => d.employeeName).filter(Boolean);
                if (operators.length > 0) {
                    const mode = operators.sort((a,b) =>
                        operators.filter(v => v===a).length - operators.filter(v => v===b).length
                    ).pop();
                    operatorLabel = mode;
                }
            }
        }

        try {
            const logoUrl = 'https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png';
            const logoData = await getImageDataUrl(logoUrl);
            doc.addImage(logoData, 'PNG', 240, 10, 40, 15); 
        } catch (err) {
            console.warn("Logo não carregado", err);
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text("RELATÓRIO DE SERVIÇOS", 14, 15);
        doc.setFontSize(12);
        doc.text("PLANILHA DE HORAS", 14, 21);
        
        doc.setLineWidth(0.5);
        doc.line(14, 28, 283, 28); 

        doc.setFontSize(10);
        doc.text("DADOS DE IDENTIFICAÇÃO", 14, 33);
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text("Obra:", 14, 40);
        doc.setFont('helvetica', 'normal');
        doc.text(obra?.nome || '', 40, 40);

        doc.setFont('helvetica', 'bold');
        doc.text("Equipamento:", 140, 40);
        doc.setFont('helvetica', 'normal');
        doc.text(vehicleLabel, 165, 40);

        doc.setFont('helvetica', 'bold');
        doc.text("Frota:", 14, 46);
        doc.setFont('helvetica', 'normal');
        doc.text(frotaLabel, 40, 46);

        doc.setFont('helvetica', 'bold');
        doc.text("Período:", 140, 46);
        doc.setFont('helvetica', 'normal');
        const periodoStr = `${formatDateToBR(reportStartDate)} A ${formatDateToBR(reportEndDate)}`;
        doc.text(periodoStr, 165, 46);

        doc.setFont('helvetica', 'bold');
        doc.text("Operador:", 14, 52);
        doc.setFont('helvetica', 'normal');
        doc.text(operatorLabel, 40, 52);

        // CORREÇÃO: Ordenar os dados por data (ascendente: menor -> maior)
        const sortedReportData = [...reportData].sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return dateA - dateB;
        });

        const tableBody = sortedReportData.map(log => {
            const morningHours = calculateTimeDiffDecimal(log.morningStart, log.morningEnd);
            const afternoonHours = calculateTimeDiffDecimal(log.afternoonStart, log.afternoonEnd);
            
            return [
                formatDateToBR(log.date), 
                getDayOfWeek(log.date),
                log.morningStart ? log.morningStart.slice(0, 5) : '',
                log.morningEnd ? log.morningEnd.slice(0, 5) : '',
                formatDecimalToTime(morningHours),
                log.afternoonStart ? log.afternoonStart.slice(0, 5) : '',
                log.afternoonEnd ? log.afternoonEnd.slice(0, 5) : '',
                formatDecimalToTime(afternoonHours),
                formatDecimalToTime(log.totalHours),
                log.observation || ''
            ];
        });

        autoTable(doc, {
            startY: 58,
            head: [
                [
                    { content: 'DATA', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                    { content: 'DIA DA SEMANA', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                    { content: 'MANHÃ', colSpan: 3, styles: { halign: 'center' } },
                    { content: 'TARDE', colSpan: 3, styles: { halign: 'center' } },
                    { content: 'TOTAL DIA', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                    { content: 'DESCRIÇÃO DOS SERVIÇOS', rowSpan: 2, styles: { valign: 'middle', halign: 'left' } },
                ],
                [
                    { content: 'INÍCIO', styles: { halign: 'center' } },
                    { content: 'TÉRMINO', styles: { halign: 'center' } },
                    { content: 'TOTAL', styles: { halign: 'center', fontStyle: 'bold' } },
                    { content: 'INÍCIO', styles: { halign: 'center' } },
                    { content: 'TÉRMINO', styles: { halign: 'center' } },
                    { content: 'TOTAL', styles: { halign: 'center', fontStyle: 'bold' } },
                ]
            ],
            body: tableBody,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0] },
            headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1, lineColor: [0, 0, 0] },
            columnStyles: {
                0: { cellWidth: 22, halign: 'center' },
                1: { cellWidth: 28, halign: 'center' },
                2: { cellWidth: 15, halign: 'center' },
                3: { cellWidth: 15, halign: 'center' },
                4: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
                5: { cellWidth: 15, halign: 'center' },
                6: { cellWidth: 15, halign: 'center' },
                7: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
                8: { cellWidth: 20, halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] },
                9: { }
            },
            alternateRowStyles: { fillColor: [255, 255, 255] }
        });

        const totalDecimal = reportData.reduce((acc, curr) => acc + parseFloat(curr.totalHours), 0);
        const finalY = doc.lastAutoTable.finalY + 5;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text("TOTAL HORAS MÊS:", 180, finalY + 5);
        doc.setFontSize(12);
        doc.text(formatDecimalToTime(totalDecimal), 220, finalY + 5);

        doc.save(`Relatorio_Servicos_${frotaLabel || 'Geral'}_${reportStartDate}.pdf`);
    };

    const generateSummaryPDF = () => {
        const doc = new jsPDF();
        const obra = obras.find(o => o.id === selectedObraId);
        const vehicleInfo = reportVehicleId ? `Veículo: ${vehicles.find(v => v.id === reportVehicleId)?.registroInterno}` : 'Geral';

        const groupSummary = {};
        const typeSummary = {};
        const vehicleSummary = {};

        reportData.forEach(log => {
            const type = log.tipo || 'Outros';
            const group = Object.keys(vehicleGroups).find(g => vehicleGroups[g].includes(type)) || 'Outros';
            
            if (!typeSummary[type]) typeSummary[type] = { hours: 0, vehicles: new Set() };
            typeSummary[type].hours += parseFloat(log.totalHours);
            typeSummary[type].vehicles.add(log.registroInterno);

            if (!groupSummary[group]) groupSummary[group] = { hours: 0 };
            groupSummary[group].hours += parseFloat(log.totalHours);

            const vId = log.vehicleId; 
            if (!vehicleSummary[vId]) {
                vehicleSummary[vId] = {
                    label: `${log.registroInterno} - ${log.modelo}`,
                    type: type,
                    hours: 0
                };
            }
            vehicleSummary[vId].hours += parseFloat(log.totalHours);
        });

        doc.setFontSize(16);
        doc.text(`Resumo de Horas: ${obra?.nome || 'N/A'}`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Filtro: ${vehicleInfo} | Período: ${formatDateToBR(reportStartDate)} a ${formatDateToBR(reportEndDate)}`, 14, 22);

        const groupTableData = Object.keys(groupSummary).map(group => [group, formatDecimalToTime(groupSummary[group].hours)]);
        doc.setFontSize(12);
        doc.text("Resumo por Grupo de Veículos", 14, 30);
        autoTable(doc, { startY: 32, head: [['Grupo', 'Horas Totais']], body: groupTableData, headStyles: { fillColor: [50, 50, 50], textColor: [255,255,255], fontStyle: 'bold' }, theme: 'grid' });

        const typeTableData = Object.keys(typeSummary).map(type => [type, typeSummary[type].vehicles.size, formatDecimalToTime(typeSummary[type].hours)]);
        doc.setFontSize(12);
        doc.text("Detalhamento por Tipo de Equipamento", 14, doc.lastAutoTable.finalY + 10);
        autoTable(doc, { startY: doc.lastAutoTable.finalY + 12, head: [['Tipo de Equipamento', 'Qtd Veículos', 'Horas Totais']], body: typeTableData, headStyles: { fillColor: [250, 204, 21], textColor: [0,0,0], fontStyle: 'bold' } });

        const vehicleTableData = Object.values(vehicleSummary).sort((a, b) => a.label.localeCompare(b.label)).map(v => [v.label, v.type, formatDecimalToTime(v.hours)]);
        let finalY = doc.lastAutoTable.finalY; 
        if (finalY > 240) { doc.addPage(); finalY = 20; }
        doc.setFontSize(12);
        doc.text("Detalhamento por Equipamento", 14, finalY + 10);
        autoTable(doc, { startY: finalY + 12, head: [['Equipamento', 'Tipo', 'Horas Totais']], body: vehicleTableData, headStyles: { fillColor: [250, 204, 21], textColor: [0,0,0], fontStyle: 'bold' } });

        doc.save(`Resumo_${obra?.nome}_${reportStartDate}.pdf`);
    };

    // --- RENDERIZAÇÃO ---
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <FileText className="text-yellow-500" /> Faturamento & Controle
            </h1>

            {/* Seleção de Obra */}
            <div className="bg-white p-4 rounded-lg shadow mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Selecione a Obra</label>
                <select 
                    value={selectedObraId} 
                    onChange={(e) => setSelectedObraId(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-yellow-500 focus:border-yellow-500"
                >
                    <option value="">-- Selecione --</option>
                    {obras.sort((a, b) => a.nome.localeCompare(b.nome)).map(obra => (
                        <option key={obra.id} value={obra.id}>{obra.nome}</option>
                    ))}
                </select>
            </div>

            {selectedObraId && (
                <>
                    {/* Abas */}
                    <div className="flex border-b border-gray-300 mb-6">
                        {/* TRAVA DE VISUALIZADOR:
                            Se isViewer for true, esta aba NÃO é renderizada.
                        */}
                        {!isViewer && (
                            <button 
                                onClick={() => setActiveTab('controle')}
                                className={`py-2 px-6 font-semibold flex items-center gap-2 ${activeTab === 'controle' ? 'border-b-2 border-yellow-500 text-yellow-600' : 'text-gray-500'}`}
                            >
                                <Clock size={18}/> Controle Diário
                            </button>
                        )}
                        <button 
                            onClick={() => setActiveTab('relatorio')}
                            className={`py-2 px-6 font-semibold flex items-center gap-2 ${activeTab === 'relatorio' ? 'border-b-2 border-yellow-500 text-yellow-600' : 'text-gray-500'}`}
                        >
                            <Download size={18}/> Relatórios & Faturamento
                        </button>
                    </div>

                    {/* CONTEÚDO DA ABA: CONTROLE DIÁRIO */}
                    {activeTab === 'controle' && !isViewer && (
                        <div className="space-y-6">
                            <div className="flex flex-col md:flex-row items-end gap-4 bg-gray-50 p-4 rounded-md border">
                                <div className="flex-1 w-full">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Equipamento</label>
                                    <select 
                                        value={controlVehicleId} 
                                        onChange={(e) => setControlVehicleId(e.target.value)}
                                        className="w-full p-2 border rounded text-sm bg-white"
                                    >
                                        <option value="">-- Selecione o Equipamento --</option>
                                        {getObraVehicles.map(v => {
                                            const label = `${v.registroInterno} - ${v.tipo} - ${v.marca} - ${v.modelo}`;
                                            const isPresent = v.statusNaObra === 'presente';
                                            const statusText = isPresent ? '(PRESENTE)' : '(NÃO ESTÁ MAIS NA OBRA)';
                                            const colorStyle = isPresent ? 'green' : 'red';

                                            return (
                                                <option 
                                                    key={v.id} 
                                                    value={v.id} 
                                                    style={{ color: colorStyle, fontWeight: isPresent ? 'bold' : 'normal' }}
                                                >
                                                    {label} {statusText}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                <div className="w-full md:w-auto">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Mês de Referência</label>
                                    <input 
                                        type="month" 
                                        value={controlMonth} 
                                        onChange={(e) => setControlMonth(e.target.value)}
                                        className="w-full p-2 border rounded text-sm"
                                    />
                                </div>
                                <div className="w-full md:w-auto">
                                    <button 
                                        onClick={handleSaveDailyLogs} 
                                        disabled={isSaving || Object.keys(localChanges).length === 0}
                                        className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition text-sm font-semibold"
                                    >
                                        {isSaving ? 'Salvando...' : 'Salvar Mês'} <Save size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* Tabela de Dias do Mês */}
                            <div className="bg-white shadow rounded-lg overflow-hidden">
                                {loadingLogs ? (
                                    <div className="p-8 text-center text-gray-500">Carregando registros...</div>
                                ) : !controlVehicleId ? (
                                    <div className="p-12 text-center text-gray-400 flex flex-col items-center">
                                        <ArrowRight size={32} className="mb-2 opacity-20"/>
                                        <p>Selecione um equipamento e o mês para lançar as horas.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-gray-100 text-gray-700 uppercase font-bold text-xs sticky top-0">
                                                <tr>
                                                    <th className="px-4 py-3">Dia</th>
                                                    <th className="px-4 py-3">Operador</th>
                                                    <th className="px-4 py-3 text-center" colSpan={2}>Manhã (Início - Fim)</th>
                                                    <th className="px-4 py-3 text-center" colSpan={2}>Tarde (Início - Fim)</th>
                                                    <th className="px-4 py-3">Total</th>
                                                    <th className="px-4 py-3">Obs</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {getDaysInMonth(controlMonth).map(dayDate => {
                                                    const existingLog = dailyLogs.find(l => l.date.startsWith(dayDate)) || {};
                                                    const changes = localChanges[dayDate] || {};
                                                    
                                                    const employeeId = changes.employeeId !== undefined ? changes.employeeId : (existingLog.employeeId || getDefaultOperator());
                                                    const mStart = changes.morningStart !== undefined ? changes.morningStart : (existingLog.morningStart || '');
                                                    const mEnd = changes.morningEnd !== undefined ? changes.morningEnd : (existingLog.morningEnd || '');
                                                    const aStart = changes.afternoonStart !== undefined ? changes.afternoonStart : (existingLog.afternoonStart || '');
                                                    const aEnd = changes.afternoonEnd !== undefined ? changes.afternoonEnd : (existingLog.afternoonEnd || '');
                                                    const obs = changes.observation !== undefined ? changes.observation : (existingLog.observation || '');

                                                    const calcDiff = (s, e) => {
                                                        if(!s || !e) return 0;
                                                        const [h1, m1] = s.split(':').map(Number);
                                                        const [h2, m2] = e.split(':').map(Number);
                                                        return Math.max(0, ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60);
                                                    };
                                                    const totalDecimal = (calcDiff(mStart, mEnd) + calcDiff(aStart, aEnd));
                                                    
                                                    const now = new Date();
                                                    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
                                                    const isToday = dayDate === todayStr;
                                                    const dayNumber = dayDate.split('-')[2];

                                                    return (
                                                        <tr key={dayDate} className={`hover:bg-gray-50 ${isToday ? 'bg-yellow-50' : ''}`}>
                                                            <td className="px-4 py-2 font-medium border-r w-24">
                                                                {dayNumber} <span className="text-xs text-gray-400 font-normal">/ {dayDate.split('-')[1]}</span>
                                                                {isToday && <span className="ml-2 text-[10px] bg-yellow-200 text-yellow-800 px-1 rounded">Hoje</span>}
                                                            </td>
                                                            <td className="px-2 py-2 w-48">
                                                                <select 
                                                                    value={employeeId} 
                                                                    onChange={(e) => handleInputChange(dayDate, 'employeeId', e.target.value)}
                                                                    className="w-full text-xs p-1 border rounded bg-white focus:border-yellow-500"
                                                                >
                                                                    <option value="">-- Operador --</option>
                                                                    {employees.sort((a,b)=>a.nome.localeCompare(b.nome)).map(emp => (
                                                                        <option key={emp.id} value={emp.id}>{emp.nome}</option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            <td className="px-1 py-2 w-20"><input type="time" value={mStart} onChange={(e) => handleInputChange(dayDate, 'morningStart', e.target.value)} className="w-full text-xs p-1 border rounded text-center"/></td>
                                                            <td className="px-1 py-2 w-20 border-r"><input type="time" value={mEnd} onChange={(e) => handleInputChange(dayDate, 'morningEnd', e.target.value)} className="w-full text-xs p-1 border rounded text-center"/></td>
                                                            <td className="px-1 py-2 w-20"><input type="time" value={aStart} onChange={(e) => handleInputChange(dayDate, 'afternoonStart', e.target.value)} className="w-full text-xs p-1 border rounded text-center"/></td>
                                                            <td className="px-1 py-2 w-20 border-r"><input type="time" value={aEnd} onChange={(e) => handleInputChange(dayDate, 'afternoonEnd', e.target.value)} className="w-full text-xs p-1 border rounded text-center"/></td>
                                                            <td className="px-4 py-2 font-bold text-center text-blue-600 bg-blue-50 w-24">
                                                                {formatDecimalToTime(totalDecimal)}
                                                            </td>
                                                            <td className="px-2 py-2">
                                                                <input 
                                                                    type="text" 
                                                                    placeholder="Obs..." 
                                                                    value={obs}
                                                                    onChange={(e) => handleInputChange(dayDate, 'observation', e.target.value)}
                                                                    className="w-full text-xs p-1 border-b focus:border-yellow-500 outline-none bg-transparent"
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* CONTEÚDO DA ABA: RELATÓRIOS & FATURAMENTO */}
                    {activeTab === 'relatorio' && (
                        <div className="space-y-6">
                            <div className="bg-gray-50 p-4 rounded-lg border grid gap-4">
                                <h3 className="text-sm font-bold text-gray-700 uppercase flex items-center gap-2"><Filter size={16}/> Filtros do Relatório</h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700">Data Inicial</label>
                                        <input 
                                            type="date" 
                                            value={reportStartDate} 
                                            onChange={(e) => handleDateRangeChange('start', e.target.value)}
                                            className="w-full p-2 border rounded mt-1 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700">Data Final</label>
                                        <input 
                                            type="date" 
                                            value={reportEndDate} 
                                            onChange={(e) => handleDateRangeChange('end', e.target.value)}
                                            className="w-full p-2 border rounded mt-1 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700">Filtrar Equipamento</label>
                                        <select 
                                            value={reportVehicleId} 
                                            onChange={(e) => setReportVehicleId(e.target.value)}
                                            className="w-full p-2 border rounded mt-1 text-sm"
                                        >
                                            <option value="">Todos os Equipamentos</option>
                                            {getObraVehicles.map(v => {
                                                const label = `${v.registroInterno} - ${v.tipo} - ${v.marca} - ${v.modelo}`;
                                                return (
                                                    <option key={v.id} value={v.id}>{label}</option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={generateDetailedPDF} disabled={!reportData.length} className="flex-1 py-2 px-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center gap-2 text-xs font-bold">
                                            <Printer size={16}/> Detalhado
                                        </button>
                                        <button onClick={generateSummaryPDF} disabled={!reportData.length} className="flex-1 py-2 px-3 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-300 flex items-center justify-center gap-2 text-xs font-bold">
                                            <Printer size={16}/> Resumo
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Resumo por GRUPOS */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {Object.entries(reportData.reduce((acc, curr) => {
                                    const type = curr.tipo || 'Outros';
                                    const group = Object.keys(vehicleGroups).find(g => vehicleGroups[g].includes(type)) || 'Outros';
                                    acc[group] = (acc[group] || 0) + parseFloat(curr.totalHours);
                                    return acc;
                                }, {})).map(([group, hours]) => (
                                    <div key={group} className="bg-gray-800 text-white p-4 rounded shadow">
                                        <h3 className="text-xs font-bold uppercase opacity-80">{group}</h3>
                                        <p className="text-2xl font-bold">{formatDecimalToTime(hours)} h</p>
                                    </div>
                                ))}
                            </div>

                            {/* Resumo por TIPOS */}
                            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                                {Object.entries(reportData.reduce((acc, curr) => {
                                    const type = curr.tipo || 'Outros';
                                    acc[type] = (acc[type] || 0) + parseFloat(curr.totalHours);
                                    return acc;
                                }, {})).map(([tipo, hours]) => (
                                    <div key={tipo} className="bg-white p-3 rounded shadow border-l-4 border-yellow-400">
                                        <h3 className="text-[10px] font-bold text-gray-500 uppercase">{tipo}</h3>
                                        <p className="text-lg font-bold text-gray-800">{formatDecimalToTime(hours)} h</p>
                                    </div>
                                ))}
                                <div className="bg-blue-600 p-3 rounded shadow text-white md:col-span-1">
                                    <h3 className="text-[10px] font-bold uppercase opacity-80">Total Geral</h3>
                                    <p className="text-lg font-bold">
                                        {formatDecimalToTime(reportData.reduce((acc, curr) => acc + parseFloat(curr.totalHours), 0))} h
                                    </p>
                                </div>
                            </div>

                            {/* Tabela de Visualização Rápida */}
                            <div className="bg-white shadow rounded-lg overflow-hidden mt-4">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-100 uppercase text-xs font-bold">
                                            <tr>
                                                <th className="px-4 py-2">Data</th>
                                                <th className="px-4 py-2">Equipamento</th>
                                                <th className="px-4 py-2">Operador</th>
                                                <th className="px-4 py-2">Total Horas</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reportData.slice(0, 50).map(log => (
                                                <tr key={log.id} className="border-b hover:bg-gray-50">
                                                    {/* DATA CORRIGIDA NA VISUALIZAÇÃO DE TELA */}
                                                    <td className="px-4 py-2">{formatDateToBR(log.date)}</td>
                                                    <td className="px-4 py-2 font-medium">{log.registroInterno} <span className="text-gray-500 font-normal text-xs">({log.tipo})</span></td>
                                                    <td className="px-4 py-2">{log.employeeName}</td>
                                                    <td className="px-4 py-2 font-bold text-blue-600">{formatDecimalToTime(log.totalHours)}</td>
                                                </tr>
                                            ))}
                                            {reportData.length > 50 && (
                                                <tr>
                                                    <td colSpan="4" className="text-center py-2 text-gray-500 italic">...e mais {reportData.length - 50} registros. Baixe o PDF para ver tudo.</td>
                                                </tr>
                                            )}
                                            {reportData.length === 0 && (
                                                 <tr>
                                                    <td colSpan="4" className="text-center py-8 text-gray-500 italic">Nenhum registro encontrado para o período/filtro selecionado.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Modal de Senha */}
            {showPasswordModal && (
                <PasswordConfirmationModal 
                    onConfirm={confirmDateChange} 
                    onClose={() => { setShowPasswordModal(false); setPendingDateChange(null); }}
                    apiClient={apiClient}
                    message="A data selecionada está fora do período de vigência da obra. Insira sua senha para liberar."
                />
            )}
        </div>
    );
};

export default BillingPage;