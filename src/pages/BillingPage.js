import React, { useState, useMemo, useEffect } from 'react';
import { 
    Calendar, CheckCircle, Clock, FileText, Filter, AlertTriangle, 
    Download, Search, Save, Lock, ArrowRight, User, Printer 
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiClient from '../services/apiClient';

const BillingPage = ({ 
    user, 
    obras = [], 
    vehicles = [], 
    employees = [], 
    vehicleGroups = {}, 
    setAlertMessage, 
    PasswordConfirmationModal
}) => {
    // --- ESTADOS GERAIS ---
    const [activeTab, setActiveTab] = useState('controle'); 
    const [selectedObraId, setSelectedObraId] = useState('');
    const [loadingLogs, setLoadingLogs] = useState(false);
    
    // --- ESTADOS CONTROLE DIÁRIO ---
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [dailyLogs, setDailyLogs] = useState([]); 
    const [localChanges, setLocalChanges] = useState({}); 
    const [isSaving, setIsSaving] = useState(false);

    // --- ESTADOS RELATÓRIO/FATURAMENTO ---
    const [reportStartDate, setReportStartDate] = useState('');
    const [reportEndDate, setReportEndDate] = useState('');
    const [reportVehicleId, setReportVehicleId] = useState(''); // Filtro de Veículo
    const [reportData, setReportData] = useState([]);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [pendingDateChange, setPendingDateChange] = useState(null);

    // --- HELPER: Formatação de Horas (Decimal -> HH:MM) ---
    const formatDecimalToTime = (decimal) => {
        const val = parseFloat(decimal);
        if (isNaN(val) || val === 0) return '00:00';
        
        const hours = Math.floor(val);
        const minutes = Math.round((val - hours) * 60);
        
        // Ajuste caso o arredondamento de minutos dê 60
        const finalHours = minutes === 60 ? hours + 1 : hours;
        const finalMinutes = minutes === 60 ? 0 : minutes;

        return `${finalHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`;
    };

    // --- EFEITOS ---
    useEffect(() => {
        if (selectedObraId && activeTab === 'controle') {
            fetchDailyLogsForControl();
        }
    }, [selectedObraId, selectedDate, activeTab]);

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
            if (a.statusNaObra === b.statusNaObra) {
                return (a.registroInterno || '').localeCompare(b.registroInterno || '');
            }
            return a.statusNaObra === 'presente' ? -1 : 1;
        });
    }, [selectedObraId, obras, vehicles, vehicleGroups]);

    const getDefaultOperator = (vehicleId) => {
        const obra = obras.find(o => o.id === selectedObraId);
        if (!obra) return '';
        const allocation = obra.historicoVeiculos.find(h => 
            h.veiculoId === vehicleId && 
            (!h.dataSaida || h.dataSaida >= selectedDate) &&
            h.dataEntrada <= selectedDate
        );
        return allocation ? allocation.employeeId : '';
    };

    // --- API CALLS ---

    const fetchDailyLogsForControl = async () => {
        setLoadingLogs(true);
        try {
            const logs = await apiClient.getDailyLogs(selectedObraId, { 
                startDate: selectedDate, 
                endDate: selectedDate 
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
            const logs = await apiClient.getDailyLogs(selectedObraId, { 
                startDate: reportStartDate, 
                endDate: reportEndDate,
                vehicleId: reportVehicleId || undefined // Filtro opcional
            });
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

        Object.keys(localChanges).forEach(vehicleId => {
            const changes = localChanges[vehicleId];
            const existingLog = dailyLogs.find(l => l.vehicleId === vehicleId);
            
            const payload = {
                obraId: selectedObraId,
                vehicleId: vehicleId,
                date: selectedDate,
                employeeId: changes.employeeId !== undefined ? changes.employeeId : (existingLog?.employeeId || getDefaultOperator(vehicleId)),
                morningStart: changes.morningStart !== undefined ? changes.morningStart : existingLog?.morningStart,
                morningEnd: changes.morningEnd !== undefined ? changes.morningEnd : existingLog?.morningEnd,
                afternoonStart: changes.afternoonStart !== undefined ? changes.afternoonStart : existingLog?.afternoonStart,
                afternoonEnd: changes.afternoonEnd !== undefined ? changes.afternoonEnd : existingLog?.afternoonEnd,
                observation: changes.observation !== undefined ? changes.observation : existingLog?.observation,
            };

            const calcHours = (start, end) => {
                if (!start || !end) return 0;
                const [h1, m1] = start.split(':').map(Number);
                const [h2, m2] = end.split(':').map(Number);
                const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
                return diff > 0 ? diff / 60 : 0;
            };
            const morning = calcHours(payload.morningStart, payload.morningEnd);
            const afternoon = calcHours(payload.afternoonStart, payload.afternoonEnd);
            payload.totalHours = (morning + afternoon).toFixed(2); // Salva em decimal para cálculos futuros

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

    // --- HANDLERS ---
    const handleInputChange = (vehicleId, field, value) => {
        setLocalChanges(prev => ({
            ...prev,
            [vehicleId]: { ...prev[vehicleId], [field]: value }
        }));
    };

    const handleDateRangeChange = (field, value) => {
        const obra = obras.find(o => o.id === selectedObraId);
        if (obra) {
            const startLimit = new Date(obra.dataInicio);
            const endLimit = obra.dataFim ? new Date(obra.dataFim) : new Date();
            const checkDate = new Date(value);
            if (checkDate < startLimit || checkDate > endLimit) {
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

    // --- GERAÇÃO DE PDF ---

    const generateDetailedPDF = () => {
        const doc = new jsPDF();
        const obra = obras.find(o => o.id === selectedObraId);
        const vehicleInfo = reportVehicleId 
            ? vehicles.find(v => v.id === reportVehicleId)?.registroInterno + ' - ' + vehicles.find(v => v.id === reportVehicleId)?.modelo 
            : 'Todos os Equipamentos';
        
        doc.setFontSize(16);
        doc.text(`Relatório Detalhado: ${obra?.nome || 'N/A'}`, 14, 15);
        doc.setFontSize(11);
        doc.text(`Veículo(s): ${vehicleInfo}`, 14, 22);
        doc.setFontSize(10);
        doc.text(`Período: ${new Date(reportStartDate).toLocaleDateString('pt-BR')} a ${new Date(reportEndDate).toLocaleDateString('pt-BR')}`, 14, 28);

        const tableData = reportData.map(log => [
            new Date(log.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
            log.registroInterno,
            log.modelo,
            log.employeeName || 'N/A',
            `${log.morningStart ? log.morningStart.slice(0,5) : '-'} / ${log.morningEnd ? log.morningEnd.slice(0,5) : '-'}`,
            `${log.afternoonStart ? log.afternoonStart.slice(0,5) : '-'} / ${log.afternoonEnd ? log.afternoonEnd.slice(0,5) : '-'}`,
            formatDecimalToTime(log.totalHours), // Formatado
            log.observation || ''
        ]);

        autoTable(doc, {
            startY: 32,
            head: [['Data', 'Equipamento', 'Modelo', 'Operador', 'Manhã', 'Tarde', 'Total (h)', 'Obs']],
            body: tableData,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [250, 204, 21], textColor: [0,0,0] },
            columnStyles: { 6: { fontStyle: 'bold', halign: 'center' } }
        });

        // Rodapé com totais
        const totalDecimal = reportData.reduce((acc, curr) => acc + parseFloat(curr.totalHours), 0);
        doc.setFontSize(10);
        doc.text(`Total Geral de Horas: ${formatDecimalToTime(totalDecimal)}`, 14, doc.lastAutoTable.finalY + 10);

        doc.save(`Detalhado_${obra?.nome}_${reportStartDate}.pdf`);
    };

    const generateSummaryPDF = () => {
        const doc = new jsPDF();
        const obra = obras.find(o => o.id === selectedObraId);
        const vehicleInfo = reportVehicleId ? `Veículo: ${vehicles.find(v => v.id === reportVehicleId)?.registroInterno}` : 'Geral';

        // 1. Resumo por Grupo
        const groupSummary = {};
        // 2. Resumo por Tipo
        const typeSummary = {};

        reportData.forEach(log => {
            const type = log.tipo || 'Outros';
            const group = Object.keys(vehicleGroups).find(g => vehicleGroups[g].includes(type)) || 'Outros';
            
            // Agrupamento por Tipo
            if (!typeSummary[type]) typeSummary[type] = { hours: 0, vehicles: new Set() };
            typeSummary[type].hours += parseFloat(log.totalHours);
            typeSummary[type].vehicles.add(log.registroInterno);

            // Agrupamento por Grupo
            if (!groupSummary[group]) groupSummary[group] = { hours: 0, count: 0 };
            groupSummary[group].hours += parseFloat(log.totalHours);
            // Contagem de registros ou veículos únicos? Vamos usar horas totais aqui.
        });

        doc.setFontSize(16);
        doc.text(`Resumo de Horas: ${obra?.nome || 'N/A'}`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Filtro: ${vehicleInfo} | Período: ${new Date(reportStartDate).toLocaleDateString('pt-BR')} a ${new Date(reportEndDate).toLocaleDateString('pt-BR')}`, 14, 22);

        // Tabela 1: Por Grupo
        const groupTableData = Object.keys(groupSummary).map(group => [
            group,
            formatDecimalToTime(groupSummary[group].hours)
        ]);

        doc.setFontSize(12);
        doc.text("Resumo por Grupo de Veículos", 14, 30);
        autoTable(doc, {
            startY: 32,
            head: [['Grupo', 'Horas Totais']],
            body: groupTableData,
            headStyles: { fillColor: [50, 50, 50], textColor: [255,255,255] },
            theme: 'grid'
        });

        // Tabela 2: Por Tipo
        const typeTableData = Object.keys(typeSummary).map(type => [
            type,
            typeSummary[type].vehicles.size,
            formatDecimalToTime(typeSummary[type].hours)
        ]);

        doc.setFontSize(12);
        doc.text("Detalhamento por Tipo de Equipamento", 14, doc.lastAutoTable.finalY + 10);
        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 12,
            head: [['Tipo de Equipamento', 'Qtd Veículos', 'Horas Totais']],
            body: typeTableData,
            headStyles: { fillColor: [250, 204, 21], textColor: [0,0,0] }
        });

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
                        <button 
                            onClick={() => setActiveTab('controle')}
                            className={`py-2 px-6 font-semibold flex items-center gap-2 ${activeTab === 'controle' ? 'border-b-2 border-yellow-500 text-yellow-600' : 'text-gray-500'}`}
                        >
                            <Clock size={18}/> Controle Diário
                        </button>
                        <button 
                            onClick={() => setActiveTab('relatorio')}
                            className={`py-2 px-6 font-semibold flex items-center gap-2 ${activeTab === 'relatorio' ? 'border-b-2 border-yellow-500 text-yellow-600' : 'text-gray-500'}`}
                        >
                            <Download size={18}/> Relatórios & Faturamento
                        </button>
                    </div>

                    {/* CONTEÚDO DA ABA: CONTROLE DIÁRIO */}
                    {activeTab === 'controle' && (
                        <div className="space-y-6">
                            {/* Seletor de Data */}
                            <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-md border">
                                <label className="font-semibold text-gray-700">Data de Lançamento:</label>
                                <input 
                                    type="date" 
                                    value={selectedDate} 
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="p-2 border rounded-md"
                                />
                                <button 
                                    onClick={handleSaveDailyLogs} 
                                    disabled={isSaving || Object.keys(localChanges).length === 0}
                                    className="ml-auto flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                                >
                                    {isSaving ? 'Salvando...' : 'Salvar Alterações'} <Save size={18} />
                                </button>
                            </div>

                            {/* Lista de Veículos */}
                            <div className="bg-white shadow rounded-lg overflow-hidden">
                                {loadingLogs ? (
                                    <div className="p-8 text-center text-gray-500">Carregando registros...</div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-gray-100 text-gray-700 uppercase font-bold text-xs">
                                                <tr>
                                                    <th className="px-4 py-3">Equipamento</th>
                                                    <th className="px-4 py-3">Operador</th>
                                                    <th className="px-4 py-3 text-center" colSpan={2}>Manhã (Início - Fim)</th>
                                                    <th className="px-4 py-3 text-center" colSpan={2}>Tarde (Início - Fim)</th>
                                                    <th className="px-4 py-3">Total</th>
                                                    <th className="px-4 py-3">Obs</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {getObraVehicles.length > 0 ? getObraVehicles.map(vehicle => {
                                                    const existingLog = dailyLogs.find(l => l.vehicleId === vehicle.id) || {};
                                                    const changes = localChanges[vehicle.id] || {};
                                                    
                                                    const employeeId = changes.employeeId !== undefined ? changes.employeeId : (existingLog.employeeId || getDefaultOperator(vehicle.id));
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
                                                    
                                                    const isInactive = vehicle.statusNaObra === 'historico';
                                                    const warnings = [];
                                                    if(vehicle.possuiAviso) warnings.push(vehicle.avisoTexto);
                                                    if(vehicle.canCirculate === false) warnings.push("Não pode circular");

                                                    return (
                                                        <tr key={vehicle.id} className={`hover:bg-gray-50 ${isInactive ? 'bg-gray-100 opacity-70' : ''}`}>
                                                            <td className="px-4 py-3 border-r relative">
                                                                <div className="font-bold text-gray-800">{vehicle.registroInterno}</div>
                                                                <div className="text-xs text-gray-500">{vehicle.modelo}</div>
                                                                {isInactive && <span className="text-[10px] text-red-500 font-bold uppercase block mt-1">Não está na obra</span>}
                                                                {warnings.length > 0 && (
                                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                                         {warnings.map((w, i) => (
                                                                             <span key={i} className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] rounded border border-red-200 flex items-center gap-1">
                                                                                 <AlertTriangle size={10} /> {w}
                                                                             </span>
                                                                         ))}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex items-center gap-1">
                                                                    <User size={14} className="text-gray-400" />
                                                                    <select 
                                                                        value={employeeId} 
                                                                        onChange={(e) => handleInputChange(vehicle.id, 'employeeId', e.target.value)}
                                                                        className="w-full text-xs p-1 border rounded bg-white focus:border-yellow-500"
                                                                    >
                                                                        <option value="">-- Operador --</option>
                                                                        {employees.sort((a,b)=>a.nome.localeCompare(b.nome)).map(emp => (
                                                                            <option key={emp.id} value={emp.id}>{emp.nome}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            </td>
                                                            <td className="px-1 py-3"><input type="time" value={mStart} onChange={(e) => handleInputChange(vehicle.id, 'morningStart', e.target.value)} className="w-full text-xs p-1 border rounded text-center"/></td>
                                                            <td className="px-1 py-3 border-r"><input type="time" value={mEnd} onChange={(e) => handleInputChange(vehicle.id, 'morningEnd', e.target.value)} className="w-full text-xs p-1 border rounded text-center"/></td>
                                                            <td className="px-1 py-3"><input type="time" value={aStart} onChange={(e) => handleInputChange(vehicle.id, 'afternoonStart', e.target.value)} className="w-full text-xs p-1 border rounded text-center"/></td>
                                                            <td className="px-1 py-3 border-r"><input type="time" value={aEnd} onChange={(e) => handleInputChange(vehicle.id, 'afternoonEnd', e.target.value)} className="w-full text-xs p-1 border rounded text-center"/></td>
                                                            <td className="px-4 py-3 font-bold text-center text-blue-600 bg-blue-50">
                                                                {formatDecimalToTime(totalDecimal)} {/* Formatado */}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <input 
                                                                    type="text" 
                                                                    placeholder="Observação..." 
                                                                    value={obs}
                                                                    onChange={(e) => handleInputChange(vehicle.id, 'observation', e.target.value)}
                                                                    className="w-full text-xs p-1 border-b focus:border-yellow-500 outline-none bg-transparent"
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                }) : (
                                                    <tr>
                                                        <td colSpan="8" className="p-8 text-center text-gray-500 italic">
                                                            Nenhum equipamento pesado ou caminhão alocado nesta obra.
                                                        </td>
                                                    </tr>
                                                )}
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
                                            {getObraVehicles.map(v => (
                                                <option key={v.id} value={v.id}>{v.registroInterno} - {v.modelo}</option>
                                            ))}
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

                            {/* Resumo por TIPOS (Detalhado) */}
                            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                                {Object.entries(reportData.reduce((acc, curr) => {
                                    const tipo = curr.tipo || 'Outros';
                                    acc[tipo] = (acc[tipo] || 0) + parseFloat(curr.totalHours);
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
                                                    <td className="px-4 py-2">{new Date(log.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</td>
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

            {/* Modal de Senha para datas fora do intervalo */}
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