import React, { useState, useMemo, useEffect } from 'react';
import {
    CheckCircle, Clock, FileText, Filter, AlertTriangle,
    Download, Save, ArrowRight, Printer, BarChart2,
    Activity, PackageX, ChevronLeft, Truck, TrendingUp, Search, X
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiClient from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext';

const GAP_THRESHOLD_DAYS = 10;

const BillingPage = ({
    user: userProp,
    obras = [],
    vehicles = [],
    employees = [],
    vehicleGroups = {},
    setAlertMessage,
    PasswordConfirmationModal
}) => {
    const { isViewer } = useAuth();

    // --- ESTADOS GERAIS ---
    const [activeTab, setActiveTab] = useState(isViewer ? 'relatorio' : 'dashboard');

    // --- ESTADOS DASHBOARD ---
    const [dashboardObraId, setDashboardObraId] = useState('');
    const [dashboardLogs, setDashboardLogs] = useState([]);
    const [loadingDashboard, setLoadingDashboard] = useState(false);
    const [filterSearch, setFilterSearch] = useState('');
    const [filterRisk, setFilterRisk] = useState('');
    const [filterStatus, setFilterStatus] = useState('ativas');
    const [filterHasActive, setFilterHasActive] = useState('');
    const [sortBy, setSortBy] = useState('risco');

    // --- ESTADOS DETALHE DA OBRA ---
    const [detailFilterStatus, setDetailFilterStatus] = useState('todos');
    const [detailSortBy, setDetailSortBy] = useState('padrao');

    // --- ESTADOS LANÇAMENTOS ---
    const [selectedObraId, setSelectedObraId] = useState('');
    const [controlMonth, setControlMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [controlVehicleId, setControlVehicleId] = useState('');
    const [dailyLogs, setDailyLogs] = useState([]);
    const [localChanges, setLocalChanges] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [loadingLogs, setLoadingLogs] = useState(false);

    // --- ESTADOS RELATÓRIO ---
    const [reportObraId, setReportObraId] = useState('');
    const [reportStartDate, setReportStartDate] = useState('');
    const [reportEndDate, setReportEndDate] = useState('');
    const [reportVehicleId, setReportVehicleId] = useState('');
    const [reportData, setReportData] = useState([]);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [pendingDateChange, setPendingDateChange] = useState(null);

    useEffect(() => {
        if (isViewer && activeTab !== 'relatorio') setActiveTab('relatorio');
    }, [isViewer, activeTab]);

    useEffect(() => {
        if (dashboardObraId && activeTab === 'dashboard') fetchDashboardData();
        if (!dashboardObraId) setDashboardLogs([]);
    }, [dashboardObraId, activeTab]);

    useEffect(() => {
        if (selectedObraId && activeTab === 'lancamentos' && controlVehicleId && controlMonth) {
            fetchDailyLogsForControl();
        } else if (activeTab === 'lancamentos') {
            setDailyLogs([]);
        }
    }, [selectedObraId, controlMonth, controlVehicleId, activeTab]);

    useEffect(() => {
        if (reportObraId && activeTab === 'relatorio' && reportStartDate && reportEndDate) {
            fetchReportData();
        }
    }, [reportObraId, reportStartDate, reportEndDate, reportVehicleId, activeTab]);

    // ===================================================================================
    // HELPERS
    // ===================================================================================

    const formatDateToBR = (dateString) => {
        if (!dateString) return '';
        const [year, month, day] = dateString.split('T')[0].split('-');
        return `${day}/${month}/${year}`;
    };

    const getDayOfWeek = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString.split('T')[0] + 'T12:00:00Z');
        return ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][date.getUTCDay()];
    };

    const getDaysInMonth = (yearMonth) => {
        if (!yearMonth) return [];
        const [year, month] = yearMonth.split('-').map(Number);
        const days = [];
        for (let d = 1; d <= new Date(year, month, 0).getDate(); d++) {
            days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        }
        return days;
    };

    const formatDecimalToTime = (decimal) => {
        const val = parseFloat(decimal);
        if (isNaN(val) || val === 0) return '00:00';
        const hours = Math.floor(val);
        const minutes = Math.round((val - hours) * 60);
        const fh = minutes === 60 ? hours + 1 : hours;
        const fm = minutes === 60 ? 0 : minutes;
        return `${String(fh).padStart(2, '0')}:${String(fm).padStart(2, '0')}`;
    };

    const calculateTimeDiffDecimal = (start, end) => {
        if (!start || !end) return 0;
        const [h1, m1] = start.split(':').map(Number);
        const [h2, m2] = end.split(':').map(Number);
        const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        return diff > 0 ? diff / 60 : 0;
    };

    const getImageDataUrl = (url) => new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = url;
    });

    const isHeavyVehicle = (tipo) => !vehicleGroups['Veículos Leves']?.includes(tipo);

    // ===================================================================================
    // MEMOS
    // ===================================================================================

    // Risco de cada obra calculado a partir dos dados já carregados (sem chamada extra de API)
    const obrasComRisco = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return obras.map(obra => {
            const isFinished = obra.status === 'finalizada' || obra.status === 'Finalizada' ||
                obra.status === 'Concluída' || obra.status === 'Inativa' ||
                (obra.dataFim && new Date(obra.dataFim) < today);

            const historico = obra.historicoVeiculos || [];

            const pesados = historico.filter(h => {
                const v = vehicles.find(vv => vv.id === h.veiculoId);
                return v && isHeavyVehicle(v.tipo);
            });

            const ativos = pesados.filter(h => !h.dataSaida).length;
            const inativos = new Set(pesados.filter(h => !!h.dataSaida).map(h => h.veiculoId)).size;
            const totalUnicos = new Set(pesados.map(h => h.veiculoId)).size;
            const totalHoras = parseFloat(obra.totalHorasRealizadas) || 0;

            const inicio = obra.dataInicio ? new Date(obra.dataInicio) : null;
            inicio?.setHours(0, 0, 0, 0);
            const diasDeObra = inicio ? Math.max(1, Math.floor((today - inicio) / 86400000)) : 0;

            // Score de risco: quanto maior, mais crítico
            let riskScore = 0;
            let riskLevel = 'ok';
            const riskReasons = [];

            if (!isFinished) {
                if (ativos > 0 && totalHoras === 0 && diasDeObra > 5) {
                    riskScore += 10;
                    riskReasons.push(`${ativos} equip. ativo${ativos > 1 ? 's' : ''} sem nenhum lançamento após ${diasDeObra}d de obra`);
                }
                if (inativos > 0) {
                    riskScore += 3;
                    riskReasons.push(`${inativos} equip. realocado${inativos > 1 ? 's' : ''} com lacunas de lançamento permanentes`);
                }
                if (ativos > 0 && diasDeObra > 20 && totalHoras < ativos * 10) {
                    riskScore += 2;
                    const mediaHoras = ativos > 0 ? (totalHoras / ativos).toFixed(0) : 0;
                    riskReasons.push(`Obra com ${diasDeObra}d mas média baixa: ${mediaHoras}h/equip. (esperado ≥ 10h)`);
                }
                if (riskReasons.length === 0) {
                    riskReasons.push('Nenhum fator de risco identificado.');
                    riskReasons.push(`${ativos} equip. ativo${ativos > 1 ? 's' : ''} com lançamentos registrados.`);
                }
            } else {
                riskReasons.push('Obra finalizada — avaliação do período encerrado.');
                if (totalHoras > 0) riskReasons.push(`Total registrado: ${formatDecimalToTime(totalHoras)}h.`);
            }

            if (riskScore >= 10) riskLevel = 'critico';
            else if (riskScore >= 3) riskLevel = 'atencao';
            else riskLevel = 'ok';

            return { obra, isFinished, ativos, inativos, totalUnicos, totalHoras, diasDeObra, riskLevel, riskScore, riskReasons };
        }).sort((a, b) => {
            // Finalizadas sempre por último
            if (a.isFinished !== b.isFinished) return a.isFinished ? 1 : -1;
            // Mais crítico primeiro
            if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
            // Mais equipamentos ativos primeiro
            if (b.ativos !== a.ativos) return b.ativos - a.ativos;
            return a.obra.nome.localeCompare(b.obra.nome);
        });
    }, [obras, vehicles, vehicleGroups]);

    const obrasFiltradas = useMemo(() => {
        let result = [...obrasComRisco];

        if (filterStatus === 'ativas') result = result.filter(o => !o.isFinished);
        else if (filterStatus === 'finalizadas') result = result.filter(o => o.isFinished);

        if (filterRisk) result = result.filter(o => o.riskLevel === filterRisk);
        if (filterHasActive === 'sim') result = result.filter(o => o.ativos > 0);
        else if (filterHasActive === 'nao') result = result.filter(o => o.ativos === 0);
        if (filterSearch.trim()) result = result.filter(o => o.obra.nome.toLowerCase().includes(filterSearch.toLowerCase().trim()));

        if (sortBy === 'dataInicio') {
            result = [...result].sort((a, b) => new Date(a.obra.dataInicio) - new Date(b.obra.dataInicio));
        } else if (sortBy === 'semLancamento') {
            result = [...result].sort((a, b) => {
                const scoreA = a.totalHoras === 0 ? a.diasDeObra * 1000 : a.diasDeObra / Math.max(1, a.totalHoras);
                const scoreB = b.totalHoras === 0 ? b.diasDeObra * 1000 : b.diasDeObra / Math.max(1, b.totalHoras);
                return scoreB - scoreA;
            });
        }
        // sortBy === 'risco' mantém a ordem do obrasComRisco

        return result;
    }, [obrasComRisco, filterSearch, filterRisk, filterStatus, filterHasActive, sortBy]);

    const hasActiveFilters = filterSearch !== '' || filterRisk !== '' || filterStatus !== 'ativas' || filterHasActive !== '' || sortBy !== 'risco';

    const clearFilters = () => {
        setFilterSearch('');
        setFilterRisk('');
        setFilterStatus('ativas');
        setFilterHasActive('');
        setSortBy('risco');
    };

    const getObraVehiclesForObra = (obraId) => {
        const obra = obras.find(o => o.id === obraId);
        if (!obra?.historicoVeiculos) return [];
        const vehicleMap = new Map();
        obra.historicoVeiculos.forEach(h => {
            const existing = vehicleMap.get(h.veiculoId);
            const isMoreRecent = !existing || new Date(h.dataEntrada) > new Date(existing.entryData.dataEntrada);
            if (isMoreRecent) {
                const vehicle = vehicles.find(v => v.id === h.veiculoId);
                if (vehicle && isHeavyVehicle(vehicle.tipo)) {
                    vehicleMap.set(h.veiculoId, {
                        ...vehicle,
                        statusNaObra: h.dataSaida ? 'historico' : 'presente',
                        entryData: h
                    });
                }
            }
        });
        return Array.from(vehicleMap.values()).sort((a, b) =>
            `${a.registroInterno} ${a.tipo}`.localeCompare(`${b.registroInterno} ${b.tipo}`)
        );
    };

    const getObraVehicles = useMemo(() => getObraVehiclesForObra(selectedObraId), [selectedObraId, obras, vehicles, vehicleGroups]);
    const getReportObraVehicles = useMemo(() => getObraVehiclesForObra(reportObraId), [reportObraId, obras, vehicles, vehicleGroups]);

    const dashboardStats = useMemo(() => {
        if (!dashboardObraId) return { vehicleStats: [], summary: null };
        const obra = obras.find(o => o.id === dashboardObraId);
        if (!obra?.historicoVeiculos) return { vehicleStats: [], summary: null };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const horasContratadasRaw = obra.horasContratadasPorTipo;
        const horasContratadas = typeof horasContratadasRaw === 'string'
            ? JSON.parse(horasContratadasRaw || '{}')
            : (horasContratadasRaw || {});
        const totalContratado = Object.values(horasContratadas).reduce((s, h) => s + (parseFloat(h) || 0), 0);

        const vehicleHistoryMap = {};
        obra.historicoVeiculos.forEach(h => {
            if (!vehicleHistoryMap[h.veiculoId]) vehicleHistoryMap[h.veiculoId] = [];
            vehicleHistoryMap[h.veiculoId].push(h);
        });

        const vehicleStats = Object.entries(vehicleHistoryMap).map(([vehicleId, periods]) => {
            const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
            if (!vehicle || !isHeavyVehicle(vehicle.tipo)) return null;

            const vehicleLogs = dashboardLogs.filter(l => String(l.vehicleId) === String(vehicleId));
            const logDateSet = new Set(vehicleLogs.map(l => l.date.split('T')[0]));
            const isActive = periods.some(p => !p.dataSaida);

            const allDaysSet = new Set();
            periods.forEach(p => {
                let d = new Date(p.dataEntrada);
                d.setHours(0, 0, 0, 0);
                const end = p.dataSaida ? new Date(p.dataSaida) : today;
                end.setHours(0, 0, 0, 0);
                while (d <= end) { allDaysSet.add(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }
            });

            const allDays = [...allDaysSet].sort();
            const totalDays = allDays.length;
            const daysWithLogs = allDays.filter(d => logDateSet.has(d)).length;
            const totalHours = vehicleLogs.reduce((acc, l) => acc + parseFloat(l.totalHours || 0), 0);

            let maxGapHistorico = 0, currentGap = 0;
            allDays.forEach(d => { if (!logDateSet.has(d)) { currentGap++; maxGapHistorico = Math.max(maxGapHistorico, currentGap); } else currentGap = 0; });

            const sortedLogs = [...vehicleLogs].sort((a, b) => new Date(b.date) - new Date(a.date));
            const lastLogDate = sortedLogs[0]?.date?.split('T')[0] || null;
            const daysSinceLast = lastLogDate ? Math.floor((today - new Date(lastLogDate)) / 86400000) : null;

            // Se ativo, o gap atual (dias sem lançamento desde o último) pode ser maior que qualquer gap passado
            const maxGap = isActive ? Math.max(maxGapHistorico, daysSinceLast ?? 0) : maxGapHistorico;

            const contractedHours = parseFloat(horasContratadas[vehicle.tipo] || 0);
            // Cobertura baseada em horas lançadas vs contratadas para o tipo
            const coveragePercent = contractedHours > 0 ? (totalHours / contractedHours) * 100 : null;

            let status = 'ok';
            if (totalHours === 0 && totalDays > 3) status = 'nunca';
            else if (maxGap > GAP_THRESHOLD_DAYS) status = 'atencao';

            return {
                vehicleId: String(vehicleId), vehicle, isActive,
                periods: [...periods].sort((a, b) => new Date(a.dataEntrada) - new Date(b.dataEntrada)),
                totalDays, daysWithLogs, totalHours, contractedHours, lastLogDate, daysSinceLast,
                maxGap, status, coveragePercent,
            };
        }).filter(Boolean).sort((a, b) => {
            const order = { nunca: 0, atencao: 1, ok: 2 };
            if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
            return (a.vehicle.registroInterno || '').localeCompare(b.vehicle.registroInterno || '');
        });

        const withAlerts = vehicleStats.filter(v => v.status !== 'ok').length;
        const totalHorasObra = vehicleStats.reduce((acc, v) => acc + v.totalHours, 0);
        const allLogDates = [...dashboardLogs].map(l => l.date.split('T')[0]).sort();

        return {
            vehicleStats,
            summary: {
                total: vehicleStats.length,
                active: vehicleStats.filter(v => v.isActive).length,
                withAlerts,
                totalHoras: totalHorasObra,
                totalContratado,
                lastLog: allLogDates[allLogDates.length - 1] || null,
            }
        };
    }, [dashboardObraId, dashboardLogs, obras, vehicles, vehicleGroups]);

    const dashboardVehicleStatsFiltered = useMemo(() => {
        let stats = [...(dashboardStats.vehicleStats || [])];
        if (detailFilterStatus === 'ativos') stats = stats.filter(s => s.isActive);
        else if (detailFilterStatus === 'inativos') stats = stats.filter(s => !s.isActive);
        if (detailSortBy === 'horas') {
            stats = stats.sort((a, b) => b.totalHours - a.totalHours);
        } else if (detailSortBy === 'gap') {
            stats = stats.sort((a, b) => b.maxGap - a.maxGap);
        } else if (detailSortBy === 'cobertura') {
            stats = stats.sort((a, b) => {
                if (a.coveragePercent === null && b.coveragePercent === null) return 0;
                if (a.coveragePercent === null) return 1;
                if (b.coveragePercent === null) return -1;
                return a.coveragePercent - b.coveragePercent;
            });
        }
        return stats;
    }, [dashboardStats.vehicleStats, detailFilterStatus, detailSortBy]);

    // ===================================================================================
    // API CALLS
    // ===================================================================================

    const fetchDashboardData = async () => {
        const obra = obras.find(o => o.id === dashboardObraId);
        if (!obra) return;
        setLoadingDashboard(true);
        try {
            const startDate = obra.dataInicio.split('T')[0];
            const endDate = obra.dataFim ? obra.dataFim.split('T')[0] : new Date().toISOString().split('T')[0];
            const logs = await apiClient.getDailyLogs(dashboardObraId, { startDate, endDate });
            setDashboardLogs(logs || []);
        } catch {
            setAlertMessage('Erro ao carregar dados do dashboard.');
        } finally {
            setLoadingDashboard(false);
        }
    };

    const fetchDailyLogsForControl = async () => {
        setLoadingLogs(true);
        try {
            const [year, month] = controlMonth.split('-');
            const startDate = `${year}-${month}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${month}-${lastDay}`;
            const logs = await apiClient.getDailyLogs(selectedObraId, { startDate, endDate, vehicleId: controlVehicleId });
            setDailyLogs(logs || []);
            setLocalChanges({});
        } catch {
            setAlertMessage('Erro ao carregar registros diários.');
        } finally {
            setLoadingLogs(false);
        }
    };

    const fetchReportData = async () => {
        setLoadingLogs(true);
        try {
            const filters = { startDate: reportStartDate, endDate: reportEndDate };
            if (reportVehicleId) filters.vehicleId = reportVehicleId;
            const logs = await apiClient.getDailyLogs(reportObraId, filters);
            setReportData(logs || []);
        } catch {
            setAlertMessage('Erro ao carregar dados do relatório.');
        } finally {
            setLoadingLogs(false);
        }
    };

    const getDefaultOperator = () => {
        if (dailyLogs.length > 0) {
            const lastLog = dailyLogs.find(l => l.employeeId);
            if (lastLog) return lastLog.employeeId;
        }
        const obra = obras.find(o => o.id === selectedObraId);
        if (!obra) return '';
        const allocations = obra.historicoVeiculos
            .filter(h => h.veiculoId === controlVehicleId)
            .sort((a, b) => new Date(b.dataEntrada) - new Date(a.dataEntrada));
        return allocations.length > 0 ? allocations[0].employeeId : '';
    };

    const handleSaveDailyLogs = async () => {
        setIsSaving(true);
        const promises = [];
        Object.keys(localChanges).forEach(dateKey => {
            const changes = localChanges[dateKey];
            const existingLog = dailyLogs.find(l => l.date.startsWith(dateKey));
            const payload = {
                id: existingLog ? existingLog.id : null,
                obraId: selectedObraId, vehicleId: controlVehicleId, date: dateKey,
                employeeId: changes.employeeId || existingLog?.employeeId || getDefaultOperator(),
                morningStart: changes.morningStart !== undefined ? changes.morningStart : (existingLog?.morningStart || null),
                morningEnd: changes.morningEnd !== undefined ? changes.morningEnd : (existingLog?.morningEnd || null),
                afternoonStart: changes.afternoonStart !== undefined ? changes.afternoonStart : (existingLog?.afternoonStart || null),
                afternoonEnd: changes.afternoonEnd !== undefined ? changes.afternoonEnd : (existingLog?.afternoonEnd || null),
                observation: changes.observation !== undefined ? changes.observation : (existingLog?.observation || null),
            };
            const morning = calculateTimeDiffDecimal(payload.morningStart, payload.morningEnd);
            const afternoon = calculateTimeDiffDecimal(payload.afternoonStart, payload.afternoonEnd);
            payload.totalHours = (morning + afternoon).toFixed(2);
            promises.push(apiClient.upsertDailyLog(payload));
        });
        try {
            await Promise.all(promises);
            setAlertMessage('Registros salvos com sucesso!');
            fetchDailyLogsForControl();
        } catch {
            setAlertMessage('Erro ao salvar alguns registros. Verifique a conexão.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (dateKey, field, value) => {
        setLocalChanges(prev => ({ ...prev, [dateKey]: { ...prev[dateKey], [field]: value } }));
    };

    const handleDateRangeChange = (field, value) => {
        const obra = obras.find(o => o.id === reportObraId);
        if (obra) {
            const startLimit = new Date(obra.dataInicio);
            const endLimit = obra.dataFim ? new Date(obra.dataFim) : new Date();
            const checkDate = new Date(value);
            checkDate.setHours(12, 0, 0, 0);
            startLimit.setHours(0, 0, 0, 0);
            endLimit.setHours(23, 59, 59, 999);
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
    // PDF
    // ===================================================================================

    const generateDetailedPDF = async () => {
        const doc = new jsPDF('l', 'mm', 'a4');
        const obra = obras.find(o => o.id === reportObraId);
        let vehicleLabel = 'Todos', frotaLabel = '', operatorLabel = 'Diversos';
        if (reportVehicleId) {
            const v = vehicles.find(ve => ve.id === reportVehicleId);
            if (v) {
                vehicleLabel = `${v.tipo} ${v.marca} ${v.modelo}`;
                frotaLabel = v.registroInterno;
                const operators = reportData.map(d => d.employeeName).filter(Boolean);
                if (operators.length > 0) operatorLabel = operators.sort((a, b) => operators.filter(v => v === a).length - operators.filter(v => v === b).length).pop();
            }
        }
        try { doc.addImage(await getImageDataUrl('https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png'), 'PNG', 240, 10, 40, 15); } catch {}
        doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text('RELATÓRIO DE SERVIÇOS', 14, 15);
        doc.setFontSize(12); doc.text('PLANILHA DE HORAS', 14, 21);
        doc.setLineWidth(0.5); doc.line(14, 28, 283, 28);
        doc.setFontSize(10); doc.text('DADOS DE IDENTIFICAÇÃO', 14, 33);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold'); doc.text('Obra:', 14, 40); doc.setFont('helvetica', 'normal'); doc.text(obra?.nome || '', 40, 40);
        doc.setFont('helvetica', 'bold'); doc.text('Equipamento:', 140, 40); doc.setFont('helvetica', 'normal'); doc.text(vehicleLabel, 165, 40);
        doc.setFont('helvetica', 'bold'); doc.text('Frota:', 14, 46); doc.setFont('helvetica', 'normal'); doc.text(frotaLabel, 40, 46);
        doc.setFont('helvetica', 'bold'); doc.text('Período:', 140, 46); doc.setFont('helvetica', 'normal'); doc.text(`${formatDateToBR(reportStartDate)} A ${formatDateToBR(reportEndDate)}`, 165, 46);
        doc.setFont('helvetica', 'bold'); doc.text('Operador:', 14, 52); doc.setFont('helvetica', 'normal'); doc.text(operatorLabel, 40, 52);
        const sortedReportData = [...reportData].sort((a, b) => new Date(a.date) - new Date(b.date));
        const tableBody = sortedReportData.map(log => {
            const mh = calculateTimeDiffDecimal(log.morningStart, log.morningEnd);
            const ah = calculateTimeDiffDecimal(log.afternoonStart, log.afternoonEnd);
            return [formatDateToBR(log.date), getDayOfWeek(log.date), log.morningStart?.slice(0, 5) || '', log.morningEnd?.slice(0, 5) || '', formatDecimalToTime(mh), log.afternoonStart?.slice(0, 5) || '', log.afternoonEnd?.slice(0, 5) || '', formatDecimalToTime(ah), formatDecimalToTime(log.totalHours), log.observation || ''];
        });
        autoTable(doc, {
            startY: 58,
            head: [[{ content: 'DATA', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } }, { content: 'DIA DA SEMANA', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } }, { content: 'MANHÃ', colSpan: 3, styles: { halign: 'center' } }, { content: 'TARDE', colSpan: 3, styles: { halign: 'center' } }, { content: 'TOTAL DIA', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } }, { content: 'DESCRIÇÃO DOS SERVIÇOS', rowSpan: 2, styles: { valign: 'middle', halign: 'left' } }], [{ content: 'INÍCIO', styles: { halign: 'center' } }, { content: 'TÉRMINO', styles: { halign: 'center' } }, { content: 'TOTAL', styles: { halign: 'center', fontStyle: 'bold' } }, { content: 'INÍCIO', styles: { halign: 'center' } }, { content: 'TÉRMINO', styles: { halign: 'center' } }, { content: 'TOTAL', styles: { halign: 'center', fontStyle: 'bold' } }]],
            body: tableBody, theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0] },
            headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1, lineColor: [0, 0, 0] },
            columnStyles: { 0: { cellWidth: 22, halign: 'center' }, 1: { cellWidth: 28, halign: 'center' }, 2: { cellWidth: 15, halign: 'center' }, 3: { cellWidth: 15, halign: 'center' }, 4: { cellWidth: 15, halign: 'center', fontStyle: 'bold' }, 5: { cellWidth: 15, halign: 'center' }, 6: { cellWidth: 15, halign: 'center' }, 7: { cellWidth: 15, halign: 'center', fontStyle: 'bold' }, 8: { cellWidth: 20, halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } },
            alternateRowStyles: { fillColor: [255, 255, 255] }
        });
        const totalDecimal = reportData.reduce((acc, curr) => acc + parseFloat(curr.totalHours), 0);
        const finalY = doc.lastAutoTable.finalY + 5;
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('TOTAL HORAS MÊS:', 180, finalY + 5);
        doc.setFontSize(12); doc.text(formatDecimalToTime(totalDecimal), 220, finalY + 5);
        doc.save(`Relatorio_Servicos_${frotaLabel || 'Geral'}_${reportStartDate}.pdf`);
    };

    const generateSummaryPDF = () => {
        const doc = new jsPDF();
        const obra = obras.find(o => o.id === reportObraId);
        const vehicleInfo = reportVehicleId ? `Veículo: ${vehicles.find(v => v.id === reportVehicleId)?.registroInterno}` : 'Geral';
        const groupSummary = {}, typeSummary = {}, vehicleSummary = {};
        reportData.forEach(log => {
            const type = log.tipo || 'Outros';
            const group = Object.keys(vehicleGroups).find(g => vehicleGroups[g].includes(type)) || 'Outros';
            if (!typeSummary[type]) typeSummary[type] = { hours: 0, vehicles: new Set() };
            typeSummary[type].hours += parseFloat(log.totalHours); typeSummary[type].vehicles.add(log.registroInterno);
            if (!groupSummary[group]) groupSummary[group] = { hours: 0 };
            groupSummary[group].hours += parseFloat(log.totalHours);
            if (!vehicleSummary[log.vehicleId]) vehicleSummary[log.vehicleId] = { label: `${log.registroInterno} - ${log.modelo}`, type, hours: 0 };
            vehicleSummary[log.vehicleId].hours += parseFloat(log.totalHours);
        });
        doc.setFontSize(16); doc.text(`Resumo de Horas: ${obra?.nome || 'N/A'}`, 14, 15);
        doc.setFontSize(10); doc.text(`Filtro: ${vehicleInfo} | Período: ${formatDateToBR(reportStartDate)} a ${formatDateToBR(reportEndDate)}`, 14, 22);
        autoTable(doc, { startY: 32, head: [['Grupo', 'Horas Totais']], body: Object.keys(groupSummary).map(g => [g, formatDecimalToTime(groupSummary[g].hours)]), headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255], fontStyle: 'bold' }, theme: 'grid' });
        doc.setFontSize(12); doc.text('Detalhamento por Tipo de Equipamento', 14, doc.lastAutoTable.finalY + 10);
        autoTable(doc, { startY: doc.lastAutoTable.finalY + 12, head: [['Tipo de Equipamento', 'Qtd Veículos', 'Horas Totais']], body: Object.keys(typeSummary).map(t => [t, typeSummary[t].vehicles.size, formatDecimalToTime(typeSummary[t].hours)]), headStyles: { fillColor: [250, 204, 21], textColor: [0, 0, 0], fontStyle: 'bold' } });
        let finalY = doc.lastAutoTable.finalY;
        if (finalY > 240) { doc.addPage(); finalY = 20; }
        doc.setFontSize(12); doc.text('Detalhamento por Equipamento', 14, finalY + 10);
        autoTable(doc, { startY: finalY + 12, head: [['Equipamento', 'Tipo', 'Horas Totais']], body: Object.values(vehicleSummary).sort((a, b) => a.label.localeCompare(b.label)).map(v => [v.label, v.type, formatDecimalToTime(v.hours)]), headStyles: { fillColor: [250, 204, 21], textColor: [0, 0, 0], fontStyle: 'bold' } });
        doc.save(`Resumo_${obra?.nome}_${reportStartDate}.pdf`);
    };

    // ===================================================================================
    // COMPONENTES DE RENDER
    // ===================================================================================

    const renderRiskBadge = (riskLevel, riskScore, riskReasons, size = 'sm') => {
        const cfg = riskConfig[riskLevel];
        const sizeClass = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
        return (
            <div className="relative group inline-block">
                <span className={`cursor-help rounded-full font-bold ${sizeClass} ${cfg.badge}`}>{cfg.label}</span>
                <div className="pointer-events-none absolute right-0 top-full mt-2 z-50 hidden group-hover:block w-64 bg-gray-900 text-white text-xs rounded-xl shadow-2xl p-3.5">
                    <div className="absolute -top-1.5 right-4 w-3 h-3 bg-gray-900 rotate-45 rounded-sm" />
                    <p className="font-bold mb-2 text-yellow-400 uppercase tracking-wider text-[10px]">Composição do status</p>
                    <ul className="space-y-1.5">
                        {riskReasons.map((reason, i) => (
                            <li key={i} className="flex items-start gap-1.5 leading-snug">
                                <span className="mt-px shrink-0 text-yellow-400">·</span>
                                <span>{reason}</span>
                            </li>
                        ))}
                    </ul>
                    {riskScore > 0 && (
                        <p className="mt-2.5 pt-2 border-t border-gray-700 text-gray-400 text-[10px]">
                            Score de risco: <span className="font-bold text-white">{riskScore} pts</span>
                            {riskScore >= 10 ? ' — Crítico (≥ 10)' : riskScore >= 3 ? ' — Atenção (3–9)' : ''}
                        </p>
                    )}
                </div>
            </div>
        );
    };

    const renderStatusBadge = (status, isActive) => {
        if (status === 'nunca') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">Sem lançamentos</span>;
        if (status === 'atencao') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">Gap &gt; {GAP_THRESHOLD_DAYS}d</span>;
        if (!isActive) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500">Encerrado</span>;
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">Sem gaps</span>;
    };

    const renderCoverageBar = (coveragePercent, totalHours, contractedHours) => {
        if (coveragePercent === null || contractedHours === 0) {
            return (
                <div className="text-xs text-gray-400 italic leading-tight">
                    {totalHours > 0 ? formatDecimalToTime(totalHours) + 'h' : '—'}
                    <span className="block text-[10px] text-gray-300">s/ contrato</span>
                </div>
            );
        }
        const isOver = coveragePercent > 100;
        const barWidth = Math.min(coveragePercent, 100);
        const color = isOver ? 'bg-blue-500' : barWidth === 0 ? 'bg-red-400' : barWidth < 50 ? 'bg-orange-400' : barWidth < 80 ? 'bg-yellow-400' : 'bg-green-500';
        return (
            <div>
                <div className="flex items-center gap-2 mb-0.5">
                    <div className="flex-1 bg-gray-200 rounded-full h-1.5 min-w-[60px]">
                        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${barWidth}%` }} />
                    </div>
                    <span className={`text-xs font-medium w-8 text-right ${isOver ? 'text-blue-600' : 'text-gray-600'}`}>{Math.round(coveragePercent)}%</span>
                </div>
                <span className="text-[10px] text-gray-400">{formatDecimalToTime(totalHours)} / {formatDecimalToTime(contractedHours)}h</span>
            </div>
        );
    };

    const riskConfig = {
        critico: { border: 'border-red-500', bg: '', badge: 'bg-red-100 text-red-700', label: 'Crítico' },
        atencao: { border: 'border-orange-400', bg: '', badge: 'bg-orange-100 text-orange-700', label: 'Atenção' },
        ok:      { border: 'border-green-500', bg: '', badge: 'bg-green-100 text-green-700', label: 'Em dia' },
    };

    const renderObraSelect = (value, onChange, id = 'obra-select') => {
        const active = obrasComRisco.filter(o => !o.isFinished);
        const inactive = obrasComRisco.filter(o => o.isFinished);
        return (
            <div className="bg-white p-4 rounded-lg shadow mb-6">
                <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">Selecione a Obra</label>
                <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-yellow-500 focus:border-yellow-500">
                    <option value="">-- Selecione --</option>
                    <optgroup label="Obras Ativas">{active.map(({ obra }) => <option key={obra.id} value={obra.id}>{obra.nome}</option>)}</optgroup>
                    {inactive.length > 0 && <optgroup label="Obras Finalizadas (Arquivo)">{inactive.map(({ obra }) => <option key={obra.id} value={obra.id}>{obra.nome} (Finalizada)</option>)}</optgroup>}
                </select>
            </div>
        );
    };

    // ===================================================================================
    // RENDER PRINCIPAL
    // ===================================================================================

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <FileText className="text-yellow-500" /> Faturamento & Controle
            </h1>

            {/* Abas */}
            <div className="flex border-b border-gray-200 mb-6 bg-white rounded-t-lg shadow-sm px-2">
                {!isViewer && (
                    <button onClick={() => setActiveTab('dashboard')} className={`py-3 px-5 font-semibold text-sm flex items-center gap-2 transition-colors border-b-2 -mb-px ${activeTab === 'dashboard' ? 'border-yellow-500 text-yellow-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        <BarChart2 size={16} /> Dashboard
                    </button>
                )}
                {!isViewer && (
                    <button onClick={() => setActiveTab('lancamentos')} className={`py-3 px-5 font-semibold text-sm flex items-center gap-2 transition-colors border-b-2 -mb-px ${activeTab === 'lancamentos' ? 'border-yellow-500 text-yellow-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        <Clock size={16} /> Lançamentos
                    </button>
                )}
                <button onClick={() => setActiveTab('relatorio')} className={`py-3 px-5 font-semibold text-sm flex items-center gap-2 transition-colors border-b-2 -mb-px ${activeTab === 'relatorio' ? 'border-yellow-500 text-yellow-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    <Download size={16} /> Relatórios & Faturamento
                </button>
            </div>

            {/* ===== ABA: DASHBOARD ===== */}
            {activeTab === 'dashboard' && !isViewer && (
                <div className="space-y-6">
                    {!dashboardObraId ? (
                        <>
                            {/* Sumário global */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white rounded-xl shadow-sm border-l-4 border-blue-500 p-4">
                                    <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Obras Ativas</p>
                                    <p className="text-2xl font-bold text-gray-800">{obrasComRisco.filter(o => !o.isFinished).length}</p>
                                </div>
                                <div className="bg-white rounded-xl shadow-sm border-l-4 border-red-500 p-4">
                                    <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Críticas</p>
                                    <p className="text-2xl font-bold text-red-600">{obrasComRisco.filter(o => o.riskLevel === 'critico').length}</p>
                                    <p className="text-xs text-gray-400 mt-1">equip. sem nenhum lançamento</p>
                                </div>
                                <div className="bg-white rounded-xl shadow-sm border-l-4 border-orange-400 p-4">
                                    <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Em Atenção</p>
                                    <p className="text-2xl font-bold text-orange-500">{obrasComRisco.filter(o => o.riskLevel === 'atencao').length}</p>
                                    <p className="text-xs text-gray-400 mt-1">com equip. realocados</p>
                                </div>
                                <div className="bg-white rounded-xl shadow-sm border-l-4 border-green-500 p-4">
                                    <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Em Dia</p>
                                    <p className="text-2xl font-bold text-green-600">{obrasComRisco.filter(o => o.riskLevel === 'ok' && !o.isFinished).length}</p>
                                </div>
                            </div>

                            {/* Barra de filtros */}
                            <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                                <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                                    {/* Busca */}
                                    <div className="relative w-full md:w-64">
                                        <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                                        <input
                                            type="text"
                                            placeholder="Buscar obra..."
                                            value={filterSearch}
                                            onChange={e => setFilterSearch(e.target.value)}
                                            className="pl-9 pr-4 py-2 border rounded-lg w-full text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none"
                                        />
                                    </div>

                                    {/* Status */}
                                    <div className="flex bg-gray-100 p-1 rounded-lg text-sm">
                                        {[['ativas', 'Ativas'], ['finalizadas', 'Finalizadas'], ['todas', 'Todas']].map(([val, label]) => (
                                            <button key={val} onClick={() => setFilterStatus(val)} className={`px-3 py-1 rounded-md font-medium transition-all ${filterStatus === val ? 'bg-white shadow text-yellow-600' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
                                        ))}
                                    </div>

                                    {/* Ordenação */}
                                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="text-sm border rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-yellow-400 outline-none">
                                        <option value="risco">Ordenar: Por risco</option>
                                        <option value="dataInicio">Ordenar: Data de início</option>
                                        <option value="semLancamento">Ordenar: Sem lançamento</option>
                                    </select>
                                </div>

                                <div className="flex flex-wrap gap-2 items-center">
                                    {/* Risco */}
                                    <div className="flex bg-gray-100 p-1 rounded-lg text-xs">
                                        {[['', 'Todos'], ['critico', 'Crítico'], ['atencao', 'Atenção'], ['ok', 'Em dia']].map(([val, label]) => (
                                            <button key={val} onClick={() => setFilterRisk(val)} className={`px-3 py-1 rounded-md font-medium transition-all ${filterRisk === val ? 'bg-white shadow text-yellow-600' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
                                        ))}
                                    </div>

                                    {/* Equipamentos ativos */}
                                    <div className="flex bg-gray-100 p-1 rounded-lg text-xs">
                                        {[['', 'Todos equip.'], ['sim', 'Com ativos'], ['nao', 'Sem ativos']].map(([val, label]) => (
                                            <button key={val} onClick={() => setFilterHasActive(val)} className={`px-3 py-1 rounded-md font-medium transition-all ${filterHasActive === val ? 'bg-white shadow text-yellow-600' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
                                        ))}
                                    </div>

                                    <div className="ml-auto flex items-center gap-3">
                                        <span className="text-xs text-gray-400">{obrasFiltradas.length} {obrasFiltradas.length === 1 ? 'obra' : 'obras'} encontradas</span>
                                        {hasActiveFilters && (
                                            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
                                                <X size={13} /> Limpar filtros
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Grid de cards */}
                            <div>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                    {obrasFiltradas.map(({ obra, isFinished, ativos, inativos, totalHoras, diasDeObra, riskLevel, riskScore, riskReasons }) => {
                                        const cfg = riskConfig[riskLevel];
                                        return (
                                            <div
                                                key={obra.id}
                                                onClick={() => setDashboardObraId(obra.id)}
                                                className={`bg-white rounded-xl shadow-sm border-l-4 ${cfg.border} hover:shadow-md transition-all cursor-pointer p-5 flex flex-col justify-between`}
                                            >
                                                {/* Header */}
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="text-base font-bold text-gray-800 truncate" title={obra.nome}>{obra.nome}</h3>
                                                        <p className="text-xs text-gray-400 mt-0.5">{isFinished ? 'Finalizada' : `Em andamento · ${diasDeObra}d`}</p>
                                                    </div>
                                                    <div className="ml-3 shrink-0">{renderRiskBadge(riskLevel, riskScore, riskReasons)}</div>
                                                </div>

                                                {/* Métricas */}
                                                <div className="space-y-2 text-sm mb-4">
                                                    <div className="flex justify-between border-b border-dashed border-gray-100 pb-2">
                                                        <span className="text-gray-500 flex items-center gap-1"><Truck size={13} /> Equip. pesados ativos</span>
                                                        <span className={`font-bold px-2 py-0.5 rounded-full text-xs ${ativos > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{ativos}</span>
                                                    </div>
                                                    {inativos > 0 && (
                                                        <div className="flex justify-between border-b border-dashed border-gray-100 pb-2">
                                                            <span className="text-gray-500 flex items-center gap-1"><AlertTriangle size={13} className="text-orange-400" /> Realocados (histórico)</span>
                                                            <span className="font-bold px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-600">{inativos}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-500 flex items-center gap-1"><TrendingUp size={13} /> Horas lançadas</span>
                                                        <span className="font-bold text-gray-700">{formatDecimalToTime(totalHoras)}</span>
                                                    </div>
                                                </div>

                                                {/* Rodapé */}
                                                <div className="pt-3 border-t border-gray-100">
                                                    <span className="text-xs text-yellow-600 font-semibold">Ver cobertura detalhada →</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {obrasFiltradas.length === 0 && (
                                    <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                                        <AlertTriangle className="mx-auto text-gray-300 mb-4" size={48} />
                                        <p className="text-gray-400 font-medium">Nenhuma obra encontrada.</p>
                                        {hasActiveFilters && (
                                            <button onClick={clearFilters} className="mt-3 text-sm text-yellow-600 hover:text-yellow-700 font-semibold">
                                                Limpar filtros
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        /* DETALHE DA OBRA SELECIONADA */
                        <div className="space-y-6">
                            <button
                                onClick={() => { setDashboardObraId(''); setDashboardLogs([]); }}
                                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
                            >
                                <ChevronLeft size={16} /> Voltar para todas as obras
                            </button>

                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold text-gray-800">
                                    {obras.find(o => o.id === dashboardObraId)?.nome}
                                </h2>
                                {(() => {
                                    const r = obrasComRisco.find(o => o.obra.id === dashboardObraId);
                                    if (!r) return null;
                                    return renderRiskBadge(r.riskLevel, r.riskScore, r.riskReasons, 'md');
                                })()}
                            </div>

                            {loadingDashboard ? (
                                <div className="py-16 text-center text-gray-400">Carregando dados de cobertura...</div>
                            ) : (
                                <>
                                    {/* Cards de resumo da obra */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="bg-white rounded-xl shadow-sm border-l-4 border-blue-500 p-4">
                                            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Equipamentos</p>
                                            <p className="text-2xl font-bold text-gray-800">{dashboardStats.summary?.total ?? '—'}</p>
                                            <p className="text-xs text-gray-400 mt-1">{dashboardStats.summary?.active ?? 0} ativos na obra</p>
                                        </div>
                                        <div className={`bg-white rounded-xl shadow-sm border-l-4 p-4 ${(dashboardStats.summary?.withAlerts ?? 0) > 0 ? 'border-red-500' : 'border-green-500'}`}>
                                            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Com Alertas</p>
                                            <p className={`text-2xl font-bold ${(dashboardStats.summary?.withAlerts ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>{dashboardStats.summary?.withAlerts ?? '—'}</p>
                                            <p className="text-xs text-gray-400 mt-1">{(dashboardStats.summary?.withAlerts ?? 0) === 0 ? 'Nenhum gap crítico' : 'requerem atenção'}</p>
                                        </div>
                                        <div className="bg-white rounded-xl shadow-sm border-l-4 border-yellow-500 p-4">
                                            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Total Lançado</p>
                                            <p className="text-2xl font-bold text-gray-800">{formatDecimalToTime(dashboardStats.summary?.totalHoras ?? 0)}</p>
                                            {(dashboardStats.summary?.totalContratado ?? 0) > 0 ? (() => {
                                                const pct = Math.min(((dashboardStats.summary.totalHoras / dashboardStats.summary.totalContratado) * 100), 100);
                                                const barColor = pct < 50 ? 'bg-orange-400' : pct < 80 ? 'bg-yellow-400' : 'bg-green-500';
                                                return (
                                                    <>
                                                        <p className="text-xs text-gray-400 mt-1">de {formatDecimalToTime(dashboardStats.summary.totalContratado)}h contratadas</p>
                                                        <div className="mt-2 bg-gray-200 rounded-full h-1.5">
                                                            <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <p className="text-xs text-gray-500 mt-1">{Math.round((dashboardStats.summary.totalHoras / dashboardStats.summary.totalContratado) * 100)}% do contrato</p>
                                                    </>
                                                );
                                            })() : <p className="text-xs text-gray-400 mt-1">horas na obra</p>}
                                        </div>
                                        <div className="bg-white rounded-xl shadow-sm border-l-4 border-gray-300 p-4">
                                            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Último Lançamento</p>
                                            <p className="text-xl font-bold text-gray-800">{dashboardStats.summary?.lastLog ? formatDateToBR(dashboardStats.summary.lastLog) : '—'}</p>
                                            <p className="text-xs text-gray-400 mt-1">em qualquer equip.</p>
                                        </div>
                                    </div>

                                    {/* Tabela de cobertura */}
                                    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                                        <div className="px-5 py-4 border-b border-gray-100">
                                            <div className="flex items-center justify-between mb-3">
                                                <h2 className="font-bold text-gray-700 flex items-center gap-2">
                                                    <Activity size={16} className="text-yellow-500" />
                                                    Cobertura de Lançamentos por Equipamento
                                                </h2>
                                                <span className="text-xs text-gray-400">Gap crítico: &gt; {GAP_THRESHOLD_DAYS} dias consecutivos</span>
                                            </div>
                                            {/* Filtros internos */}
                                            <div className="flex flex-wrap items-center gap-3">
                                                <div className="flex bg-gray-100 p-1 rounded-lg text-xs">
                                                    {[['todos', 'Todos'], ['ativos', 'Somente Ativos'], ['inativos', 'Somente Inativos']].map(([val, label]) => (
                                                        <button key={val} onClick={() => setDetailFilterStatus(val)} className={`px-3 py-1 rounded-md font-medium transition-all ${detailFilterStatus === val ? 'bg-white shadow text-yellow-600' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
                                                    ))}
                                                </div>
                                                <select
                                                    value={detailSortBy}
                                                    onChange={e => setDetailSortBy(e.target.value)}
                                                    className="text-xs border rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-yellow-400 outline-none"
                                                >
                                                    <option value="padrao">Ordenar: Padrão (status)</option>
                                                    <option value="horas">Ordenar: Mais horas</option>
                                                    <option value="gap">Ordenar: Maior gap</option>
                                                    <option value="cobertura">Ordenar: Menor cobertura</option>
                                                </select>
                                                <span className="text-xs text-gray-400 ml-auto">{dashboardVehicleStatsFiltered.length} equipamento{dashboardVehicleStatsFiltered.length !== 1 ? 's' : ''}</span>
                                            </div>
                                        </div>
                                        {dashboardStats.vehicleStats.length === 0 ? (
                                            <div className="py-12 text-center text-gray-400">
                                                <PackageX size={36} className="mx-auto mb-2 opacity-30" />
                                                <p>Nenhum equipamento pesado registrado nesta obra.</p>
                                            </div>
                                        ) : dashboardVehicleStatsFiltered.length === 0 ? (
                                            <div className="py-10 text-center text-gray-400 text-sm">Nenhum equipamento corresponde ao filtro selecionado.</div>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                                                        <tr>
                                                            <th className="px-4 py-3 text-left">Equipamento</th>
                                                            <th className="px-4 py-3 text-left">Situação</th>
                                                            <th className="px-4 py-3 text-left">Status</th>
                                                            <th className="px-4 py-3 text-left">Cobertura contratada</th>
                                                            <th className="px-4 py-3 text-center">Maior gap</th>
                                                            <th className="px-4 py-3 text-left">Último lançamento</th>
                                                            <th className="px-4 py-3 text-right">Horas</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {dashboardVehicleStatsFiltered.map(stat => (
                                                            <tr key={stat.vehicleId} className={`hover:bg-gray-50 ${stat.status === 'nunca' ? 'bg-red-50' : stat.status === 'atencao' ? 'bg-orange-50' : ''}`}>
                                                                <td className="px-4 py-3">
                                                                    <p className="font-semibold text-gray-800">{stat.vehicle.registroInterno}</p>
                                                                    <p className="text-xs text-gray-400">{stat.vehicle.tipo} · {stat.vehicle.marca} {stat.vehicle.modelo}</p>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    {stat.isActive
                                                                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Ativo</span>
                                                                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">Inativo</span>
                                                                    }
                                                                    {!stat.isActive && stat.status !== 'ok' && (
                                                                        <p className="text-[10px] text-red-500 mt-1 leading-tight">Período encerrado — gaps permanentes</p>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3">{renderStatusBadge(stat.status, stat.isActive)}</td>
                                                                <td className="px-4 py-3 min-w-[150px]">{renderCoverageBar(stat.coveragePercent, stat.totalHours, stat.contractedHours)}</td>
                                                                <td className="px-4 py-3 text-center">
                                                                    <span className={`text-xs font-bold ${stat.maxGap > GAP_THRESHOLD_DAYS ? 'text-red-600' : stat.maxGap > 5 ? 'text-orange-500' : 'text-gray-500'}`}>{stat.maxGap}d</span>
                                                                    {stat.isActive && stat.daysSinceLast !== null && stat.daysSinceLast === stat.maxGap && stat.maxGap > 0 && (
                                                                        <p className="text-[10px] text-orange-400 leading-tight">atual</p>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    {stat.lastLogDate ? (
                                                                        <div>
                                                                            <span className="text-gray-700">{formatDateToBR(stat.lastLogDate)}</span>
                                                                            {stat.daysSinceLast !== null && (
                                                                                <span className={`ml-2 text-xs ${stat.daysSinceLast > GAP_THRESHOLD_DAYS ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>({stat.daysSinceLast}d atrás)</span>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-red-400 font-semibold text-xs">Nunca preenchido</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3 text-right font-bold text-gray-700">{formatDecimalToTime(stat.totalHours)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ===== ABA: LANÇAMENTOS ===== */}
            {activeTab === 'lancamentos' && !isViewer && (
                <div className="space-y-6">
                    {renderObraSelect(selectedObraId, setSelectedObraId, 'lancamentos-obra-select')}

                    {selectedObraId && (
                        <>
                            <div className="flex flex-col md:flex-row items-end gap-4 bg-gray-50 p-4 rounded-md border">
                                <div className="flex-1 w-full">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Equipamento</label>
                                    <select value={controlVehicleId} onChange={(e) => setControlVehicleId(e.target.value)} className="w-full p-2 border rounded text-sm bg-white">
                                        <option value="">-- Selecione o Equipamento --</option>
                                        {getObraVehicles.map(v => {
                                            const isPresent = v.statusNaObra === 'presente';
                                            return (
                                                <option key={v.id} value={v.id} style={{ color: isPresent ? 'green' : 'red', fontWeight: isPresent ? 'bold' : 'normal' }}>
                                                    {v.registroInterno} - {v.tipo} - {v.marca} - {v.modelo} {isPresent ? '(PRESENTE)' : '(NÃO ESTÁ MAIS NA OBRA)'}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                <div className="w-full md:w-auto">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Mês de Referência</label>
                                    <input type="month" value={controlMonth} onChange={(e) => setControlMonth(e.target.value)} className="w-full p-2 border rounded text-sm" />
                                </div>
                                <div className="w-full md:w-auto">
                                    <button onClick={handleSaveDailyLogs} disabled={isSaving || Object.keys(localChanges).length === 0} className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition text-sm font-semibold">
                                        {isSaving ? 'Salvando...' : 'Salvar Mês'} <Save size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white shadow rounded-lg overflow-hidden">
                                {loadingLogs ? (
                                    <div className="p-8 text-center text-gray-500">Carregando registros...</div>
                                ) : !controlVehicleId ? (
                                    <div className="p-12 text-center text-gray-400 flex flex-col items-center">
                                        <ArrowRight size={32} className="mb-2 opacity-20" />
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
                                                        if (!s || !e) return 0;
                                                        const [h1, m1] = s.split(':').map(Number);
                                                        const [h2, m2] = e.split(':').map(Number);
                                                        return Math.max(0, ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60);
                                                    };
                                                    const totalDecimal = calcDiff(mStart, mEnd) + calcDiff(aStart, aEnd);
                                                    const now = new Date();
                                                    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                                                    const isToday = dayDate === todayStr;
                                                    const dayNumber = dayDate.split('-')[2];
                                                    return (
                                                        <tr key={dayDate} className={`hover:bg-gray-50 ${isToday ? 'bg-yellow-50' : ''}`}>
                                                            <td className="px-4 py-2 font-medium border-r w-24">
                                                                {dayNumber} <span className="text-xs text-gray-400 font-normal">/ {dayDate.split('-')[1]}</span>
                                                                {isToday && <span className="ml-2 text-[10px] bg-yellow-200 text-yellow-800 px-1 rounded">Hoje</span>}
                                                            </td>
                                                            <td className="px-2 py-2 w-48">
                                                                <select value={employeeId} onChange={(e) => handleInputChange(dayDate, 'employeeId', e.target.value)} className="w-full text-xs p-1 border rounded bg-white focus:border-yellow-500">
                                                                    <option value="">-- Operador --</option>
                                                                    {employees.sort((a, b) => a.nome.localeCompare(b.nome)).map(emp => <option key={emp.id} value={emp.id}>{emp.nome}</option>)}
                                                                </select>
                                                            </td>
                                                            <td className="px-1 py-2 w-20"><input type="time" value={mStart} onChange={(e) => handleInputChange(dayDate, 'morningStart', e.target.value)} className="w-full text-xs p-1 border rounded text-center" /></td>
                                                            <td className="px-1 py-2 w-20 border-r"><input type="time" value={mEnd} onChange={(e) => handleInputChange(dayDate, 'morningEnd', e.target.value)} className="w-full text-xs p-1 border rounded text-center" /></td>
                                                            <td className="px-1 py-2 w-20"><input type="time" value={aStart} onChange={(e) => handleInputChange(dayDate, 'afternoonStart', e.target.value)} className="w-full text-xs p-1 border rounded text-center" /></td>
                                                            <td className="px-1 py-2 w-20 border-r"><input type="time" value={aEnd} onChange={(e) => handleInputChange(dayDate, 'afternoonEnd', e.target.value)} className="w-full text-xs p-1 border rounded text-center" /></td>
                                                            <td className="px-4 py-2 font-bold text-center text-blue-600 bg-blue-50 w-24">{formatDecimalToTime(totalDecimal)}</td>
                                                            <td className="px-2 py-2">
                                                                <input type="text" placeholder="Obs..." value={obs} onChange={(e) => handleInputChange(dayDate, 'observation', e.target.value)} className="w-full text-xs p-1 border-b focus:border-yellow-500 outline-none bg-transparent" />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ===== ABA: RELATÓRIOS ===== */}
            {activeTab === 'relatorio' && (
                <div className="space-y-6">
                    {renderObraSelect(reportObraId, setReportObraId, 'relatorio-obra-select')}

                    {reportObraId && (
                        <>
                            <div className="bg-gray-50 p-4 rounded-lg border grid gap-4">
                                <h3 className="text-sm font-bold text-gray-700 uppercase flex items-center gap-2"><Filter size={16} /> Filtros do Relatório</h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700">Data Inicial</label>
                                        <input type="date" value={reportStartDate} onChange={(e) => handleDateRangeChange('start', e.target.value)} className="w-full p-2 border rounded mt-1 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700">Data Final</label>
                                        <input type="date" value={reportEndDate} onChange={(e) => handleDateRangeChange('end', e.target.value)} className="w-full p-2 border rounded mt-1 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700">Filtrar Equipamento</label>
                                        <select value={reportVehicleId} onChange={(e) => setReportVehicleId(e.target.value)} className="w-full p-2 border rounded mt-1 text-sm">
                                            <option value="">Todos os Equipamentos</option>
                                            {getReportObraVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.tipo} - {v.marca} - {v.modelo}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={generateDetailedPDF} disabled={!reportData.length} className="flex-1 py-2 px-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center gap-2 text-xs font-bold">
                                            <Printer size={16} /> Detalhado
                                        </button>
                                        <button onClick={generateSummaryPDF} disabled={!reportData.length} className="flex-1 py-2 px-3 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-300 flex items-center justify-center gap-2 text-xs font-bold">
                                            <Printer size={16} /> Resumo
                                        </button>
                                    </div>
                                </div>
                            </div>

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

                            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                                {Object.entries(reportData.reduce((acc, curr) => { const t = curr.tipo || 'Outros'; acc[t] = (acc[t] || 0) + parseFloat(curr.totalHours); return acc; }, {})).map(([tipo, hours]) => (
                                    <div key={tipo} className="bg-white p-3 rounded shadow border-l-4 border-yellow-400">
                                        <h3 className="text-[10px] font-bold text-gray-500 uppercase">{tipo}</h3>
                                        <p className="text-lg font-bold text-gray-800">{formatDecimalToTime(hours)} h</p>
                                    </div>
                                ))}
                                <div className="bg-blue-600 p-3 rounded shadow text-white md:col-span-1">
                                    <h3 className="text-[10px] font-bold uppercase opacity-80">Total Geral</h3>
                                    <p className="text-lg font-bold">{formatDecimalToTime(reportData.reduce((acc, curr) => acc + parseFloat(curr.totalHours), 0))} h</p>
                                </div>
                            </div>

                            <div className="bg-white shadow rounded-lg overflow-hidden">
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
                                                    <td className="px-4 py-2">{formatDateToBR(log.date)}</td>
                                                    <td className="px-4 py-2 font-medium">{log.registroInterno} <span className="text-gray-500 font-normal text-xs">({log.tipo})</span></td>
                                                    <td className="px-4 py-2">{log.employeeName}</td>
                                                    <td className="px-4 py-2 font-bold text-blue-600">{formatDecimalToTime(log.totalHours)}</td>
                                                </tr>
                                            ))}
                                            {reportData.length > 50 && <tr><td colSpan="4" className="text-center py-2 text-gray-500 italic">...e mais {reportData.length - 50} registros. Baixe o PDF para ver tudo.</td></tr>}
                                            {reportData.length === 0 && <tr><td colSpan="4" className="text-center py-8 text-gray-500 italic">Nenhum registro encontrado para o período/filtro selecionado.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

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