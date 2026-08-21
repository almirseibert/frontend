import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Activity, Search, X, ArrowRight, AlertTriangle,
    BarChart2, ChevronLeft, PackageX, Truck,
    Gauge, MapPin, User, Clock, Fuel, FileText, Mail, Phone, Send, ChevronRight
} from 'lucide-react';
import apiClientModule from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext';
import SearchableSelect from '../components/SearchableSelect';
import { formatObraNome } from '../utils/obraFormat';
import { getAllowedReadingTypes } from '../utils/vehicleRules';
import TerceirizadoBadge from '../components/ui/TerceirizadoBadge';

const GAP_THRESHOLD_DAYS = 10;

// Os apontamentos de campo levam ~1 semana para chegar até o escritório. Dias mais
// recentes que isso ainda não podem ser cobrados: a ausência de lançamento neles é
// esperada, não é falha. Todo cálculo de gap/status ignora essa janela.
const REPORTING_LAG_DAYS = 7;

const riskConfig = {
    critico: { border: 'border-red-500', badge: 'bg-red-100 text-red-700',       label: 'Sem Registro' },
    atencao: { border: 'border-orange-400', badge: 'bg-orange-100 text-orange-700', label: 'Atenção'    },
    ok:      { border: 'border-green-500', badge: 'bg-green-100 text-green-700',  label: 'Operando'    },
};

/**
 * Badge de risco com tooltip renderizado via portal em `position: fixed`.
 * O tooltip precisa sair do fluxo porque a tabela vive dentro de um wrapper
 * `overflow-x-auto` — em `position: absolute` ele expandia a área rolável e
 * fazia surgir barra de rolagem na linha ao passar o mouse.
 */
const RiskBadge = ({ riskLevel, riskScore, riskReasons, size = 'sm' }) => {
    const cfg = riskConfig[riskLevel];
    const sizeClass = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
    const anchorRef = useRef(null);
    const [coords, setCoords] = useState(null);

    const hide = useCallback(() => setCoords(null), []);

    const show = useCallback(() => {
        const rect = anchorRef.current?.getBoundingClientRect();
        if (!rect) return;
        // Alinha a borda direita do tooltip à do badge, sem deixar sair da viewport.
        const right = Math.min(rect.right, window.innerWidth - 8);
        setCoords({ top: rect.bottom + 8, right: window.innerWidth - right });
    }, []);

    // Enquanto o tooltip está aberto, qualquer rolagem invalida a posição fixa.
    useEffect(() => {
        if (!coords) return;
        window.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
        return () => {
            window.removeEventListener('scroll', hide, true);
            window.removeEventListener('resize', hide);
        };
    }, [coords, hide]);

    return (
        <span ref={anchorRef} className="inline-block" onMouseEnter={show} onMouseLeave={hide}>
            <span className={`cursor-help rounded-full font-bold ${sizeClass} ${cfg.badge}`}>{cfg.label}</span>
            {coords && createPortal(
                <div
                    className="pointer-events-none fixed z-[100] w-64 bg-gray-900 text-white text-xs rounded-xl shadow-2xl p-3.5"
                    style={{ top: coords.top, right: coords.right }}
                >
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
                            Score: <span className="font-bold text-white">{riskScore} pts</span>
                            {riskScore >= 10 ? ' — Sem Registro (≥ 10)' : riskScore >= 3 ? ' — Atenção (3–9)' : ''}
                        </p>
                    )}
                </div>,
                document.body
            )}
        </span>
    );
};

const JUSTIFICATIVA_LABELS = {
    chuva: 'Chuva',
    maquina_parada: 'Máquina Parada',
    feriado: 'Feriado / Folga',
    outro: 'Outro',
};

const OperacionalPage = ({
    vehicles = [],
    obras = [],
    employees = [],
    vehicleGroups = {},
    dailyWorkLogs = [],
    refuelings = [],
    setAlertMessage,
    navigate,
    apiClient = apiClientModule,
}) => {
    const { isViewer } = useAuth();

    const [activeView, setActiveView] = useState('obra');

    // ==========================================================
    // HELPERS COMPARTILHADOS
    // ==========================================================

    const isHeavyVehicle = (tipo) => !vehicleGroups['Veículos Leves']?.includes(tipo);

    const formatDecimalToTime = (decimal) => {
        const val = parseFloat(decimal);
        if (isNaN(val) || val === 0) return '00:00';
        const hours = Math.floor(val);
        const minutes = Math.round((val - hours) * 60);
        const fh = minutes === 60 ? hours + 1 : hours;
        const fm = minutes === 60 ? 0 : minutes;
        return `${String(fh).padStart(2, '0')}:${String(fm).padStart(2, '0')}`;
    };

    const formatDateToBR = (dateString) => {
        if (!dateString) return '—';
        const [year, month, day] = dateString.split('T')[0].split('-');
        return `${day}/${month}/${year}`;
    };

    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    // ==========================================================
    // VIEW: POR OBRA — estados
    // ==========================================================

    const [obraId, setObraId] = useState('');
    const [obraLogs, setObraLogs] = useState([]);
    const [loadingObra, setLoadingObra] = useState(false);
    const [obraSearch, setObraSearch] = useState('');
    const [obraRisk, setObraRisk] = useState('');
    const [obraStatus, setObraStatus] = useState('ativas');
    const [obraHasActive, setObraHasActive] = useState('');
    const [obraSort, setObraSort] = useState('risco');
    const [obraSortDir, setObraSortDir] = useState('desc');
    const [obraDetailStatus, setObraDetailStatus] = useState('todos');
    const [obraDetailSort, setObraDetailSort] = useState('padrao');
    const [obraOnlyAlerts, setObraOnlyAlerts] = useState(false);
    const [selectedObraStatId, setSelectedObraStatId] = useState(null);
    const [showCentroCusto, setShowCentroCusto] = useState(false);

    useEffect(() => {
        if (obraId && activeView === 'obra') fetchObraData();
        if (!obraId) setObraLogs([]);
        setObraOnlyAlerts(false);
        setSelectedObraStatId(null);
    }, [obraId, activeView]);

    const fetchObraData = async () => {
        const obra = obras.find(o => o.id === obraId);
        if (!obra) return;
        setLoadingObra(true);
        try {
            // Obras sem dataInicio existem (cadastro incompleto / centro de custo).
            // Nesse caso o piso da janela vem da entrada mais antiga do histórico de veículos.
            const historico = obra.historicoVeiculos || [];
            const fallbackStart = historico
                .map(h => h.dataEntrada)
                .filter(Boolean)
                .sort()[0];
            const startRaw = obra.dataInicio || fallbackStart;
            const startDate = startRaw ? startRaw.split('T')[0] : undefined;
            const endDate = obra.dataFim ? obra.dataFim.split('T')[0] : new Date().toISOString().split('T')[0];
            const logs = await apiClient.getDailyLogs(obraId, startDate ? { startDate, endDate } : { endDate });
            setObraLogs(logs || []);
        } catch (err) {
            console.error('[OperacionalPage] falha ao carregar lançamentos da obra', obraId, err);
            setObraLogs([]);
            setAlertMessage(`Erro ao carregar dados da obra: ${err?.message || 'falha desconhecida'}`);
        } finally {
            setLoadingObra(false);
        }
    };

    // ==========================================================
    // VIEW: POR OBRA — memos
    // ==========================================================

    const obrasComRisco = useMemo(() => {
        return obras.filter(o => showCentroCusto || (o.tipo_registro || 'obra') !== 'centro_custo').map(obra => {
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

            let riskScore = 0;
            let riskLevel = 'ok';
            const riskReasons = [];

            let equipSemLancamento10d = 0;
            if (!isFinished) {
                if (ativos > 0 && totalHoras === 0 && diasDeObra > 7) {
                    riskScore += 10;
                    riskReasons.push(`${ativos} equip. ativo${ativos > 1 ? 's' : ''} sem nenhum lançamento após ${diasDeObra}d de obra`);
                }
                const pesadosAtivos = historico.filter(h => {
                    const v = vehicles.find(vv => vv.id === h.veiculoId);
                    return v && isHeavyVehicle(v.tipo) && !h.dataSaida;
                });
                pesadosAtivos.forEach(h => {
                    const entrada = new Date(h.dataEntrada);
                    entrada.setHours(0, 0, 0, 0);
                    if (Math.floor((today - entrada) / 86400000) <= 10) return;
                    const vehicleLogs = (dailyWorkLogs || []).filter(l => {
                        if (String(l.vehicleId) !== String(h.veiculoId)) return false;
                        const logDate = new Date(l.date.split('T')[0] + 'T00:00:00Z');
                        return logDate >= entrada;
                    });
                    const lastLogDate = [...vehicleLogs].sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.date?.split('T')[0] || null;
                    const daysSinceLast = lastLogDate
                        ? Math.floor((today - new Date(lastLogDate + 'T12:00:00Z')) / 86400000)
                        : Math.floor((today - entrada) / 86400000);
                    if (daysSinceLast > 10) equipSemLancamento10d++;
                });
                if (equipSemLancamento10d > 0) {
                    riskScore += 3;
                    riskReasons.push(`${equipSemLancamento10d} equip. ativo${equipSemLancamento10d > 1 ? 's' : ''} sem lançamento há mais de 10 dias`);
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

            return { obra, isFinished, ativos, inativos, equipSemLancamento10d, totalUnicos, totalHoras, diasDeObra, riskLevel, riskScore, riskReasons };
        }).sort((a, b) => {
            if (a.isFinished !== b.isFinished) return a.isFinished ? 1 : -1;
            if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
            if (b.ativos !== a.ativos) return b.ativos - a.ativos;
            return a.obra.nome.localeCompare(b.obra.nome);
        });
    }, [obras, vehicles, vehicleGroups, dailyWorkLogs, today, showCentroCusto]);

    const obrasFiltradas = useMemo(() => {
        let result = [...obrasComRisco];
        if (obraStatus === 'ativas') result = result.filter(o => !o.isFinished);
        else if (obraStatus === 'finalizadas') result = result.filter(o => o.isFinished);
        if (obraRisk) result = result.filter(o => o.riskLevel === obraRisk);
        if (obraHasActive === 'sim') result = result.filter(o => o.ativos > 0);
        else if (obraHasActive === 'nao') result = result.filter(o => o.ativos === 0);
        if (obraSearch.trim()) result = result.filter(o => o.obra.nome.toLowerCase().includes(obraSearch.toLowerCase().trim()));
        // Ordenação por coluna. `risco` é o default e usa desempate próprio;
        // as demais chaves respeitam a direção escolhida no cabeçalho.
        const riskOrder = { critico: 0, atencao: 1, ok: 2 };
        const comparators = {
            risco: (a, b) => {
                if (riskOrder[a.riskLevel] !== riskOrder[b.riskLevel]) return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
                if (b.ativos !== a.ativos) return b.ativos - a.ativos;
                return a.obra.nome.localeCompare(b.obra.nome);
            },
            nome: (a, b) => a.obra.nome.localeCompare(b.obra.nome),
            dias: (a, b) => a.diasDeObra - b.diasDeObra,
            ativos: (a, b) => a.ativos - b.ativos,
            semLancamento: (a, b) => a.equipSemLancamento10d - b.equipSemLancamento10d,
            horas: (a, b) => a.totalHoras - b.totalHoras,
        };
        const cmp = comparators[obraSort] || comparators.risco;
        // Em `risco`, "desc" significa mais crítico primeiro — o comparador já entrega nessa ordem.
        const invert = obraSort === 'risco' ? (obraSortDir === 'asc') : (obraSortDir === 'desc');
        result = [...result].sort((a, b) => {
            if (a.isFinished !== b.isFinished) return a.isFinished ? 1 : -1;
            const r = cmp(a, b);
            return invert ? -r : r;
        });
        return result;
    }, [obrasComRisco, obraSearch, obraRisk, obraStatus, obraHasActive, obraSort, obraSortDir]);

    const hasObraFilters = obraSearch !== '' || obraRisk !== '' || obraStatus !== 'ativas' || obraHasActive !== '' || obraSort !== 'risco';

    const clearObraFilters = () => {
        setObraSearch(''); setObraRisk(''); setObraStatus('ativas');
        setObraHasActive(''); setObraSort('risco'); setObraSortDir('desc');
    };

    const toggleObraSort = (key) => {
        if (obraSort === key) setObraSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
        else { setObraSort(key); setObraSortDir('desc'); }
    };

    const obraStats = useMemo(() => {
        if (!obraId) return { vehicleStats: [], summary: null };
        const obra = obras.find(o => o.id === obraId);
        if (!obra?.historicoVeiculos) return { vehicleStats: [], summary: null };

        const horasContratadasRaw = obra.horasContratadasPorTipo;
        const horasContratadas = typeof horasContratadasRaw === 'string'
            ? JSON.parse(horasContratadasRaw || '{}')
            : (horasContratadasRaw || {});
        const totalContratado = Object.values(horasContratadas).reduce((s, h) => s + (parseFloat(h) || 0), 0);

        // Último dia que já deveria ter chegado ao escritório.
        const reportingCutoffStr = (() => {
            const d = new Date(today);
            d.setDate(d.getDate() - REPORTING_LAG_DAYS);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })();

        const vehicleHistoryMap = {};
        obra.historicoVeiculos.forEach(h => {
            if (!vehicleHistoryMap[h.veiculoId]) vehicleHistoryMap[h.veiculoId] = [];
            vehicleHistoryMap[h.veiculoId].push(h);
        });

        const vehicleStats = Object.entries(vehicleHistoryMap).map(([vehicleId, periods]) => {
            const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
            if (!vehicle || !isHeavyVehicle(vehicle.tipo)) return null;

            const sortedPeriods = [...periods].sort((a, b) => new Date(a.dataEntrada) - new Date(b.dataEntrada));
            const activePeriod = sortedPeriods.find(p => !p.dataSaida);
            const isActive = !!activePeriod;
            const relevantPeriod = activePeriod ?? sortedPeriods[sortedPeriods.length - 1];
            const entryDate = relevantPeriod?.dataEntrada || null;

            const vehicleLogs = obraLogs.filter(l => String(l.vehicleId) === String(vehicleId));
            const totalHours = vehicleLogs.reduce((acc, l) => acc + parseFloat(l.totalHours || 0), 0);

            // allDays de todos os períodos — usado apenas para cobertura total (daysWithLogs / totalDays)
            const allDaysSet = new Set();
            const logDateSet = new Set(vehicleLogs.map(l => l.date.split('T')[0]));
            periods.forEach(p => {
                let d = new Date(p.dataEntrada); d.setHours(0, 0, 0, 0);
                const end = p.dataSaida ? new Date(p.dataSaida) : today; end.setHours(0, 0, 0, 0);
                while (d <= end) { allDaysSet.add(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }
            });
            const allDays = [...allDaysSet].sort();
            const daysWithLogs = allDays.filter(d => logDateSet.has(d)).length;

            // Gap e lastLogDate calculados apenas no período atual/mais recente
            const periodStartStr = relevantPeriod.dataEntrada.split('T')[0];
            const periodEndStr = relevantPeriod.dataSaida
                ? relevantPeriod.dataSaida.split('T')[0]
                : new Date().toISOString().split('T')[0];

            const currentPeriodDays = [];
            { const cur = new Date(periodStartStr + 'T00:00:00Z');
              const end = new Date(periodEndStr + 'T00:00:00Z');
              while (cur <= end) { currentPeriodDays.push(cur.toISOString().split('T')[0]); cur.setUTCDate(cur.getUTCDate() + 1); } }

            const currentPeriodLogSet = new Set(
                vehicleLogs.map(l => l.date.split('T')[0]).filter(d => d >= periodStartStr && d <= periodEndStr)
            );

            // Dias já "cobráveis": descontada a janela de atraso de recebimento.
            const evaluableDays = currentPeriodDays.filter(d => d <= reportingCutoffStr);
            const isWithinReportingWindow = evaluableDays.length === 0;

            let maxGapHistorico = 0, gapAcc = 0;
            evaluableDays.forEach(d => {
                if (!currentPeriodLogSet.has(d)) { gapAcc++; maxGapHistorico = Math.max(maxGapHistorico, gapAcc); }
                else gapAcc = 0;
            });

            const sortedCurrentLogs = vehicleLogs
                .filter(l => { const d = l.date.split('T')[0]; return d >= periodStartStr && d <= periodEndStr; })
                .sort((a, b) => new Date(b.date) - new Date(a.date));
            const lastLogDate = sortedCurrentLogs[0]?.date?.split('T')[0] || null;
            // Referência de "hoje" para o período: se o período já foi encerrado, o relógio
            // para na data de saída — não faz sentido cobrar lançamento de um veículo que
            // não está mais na obra. Só período aberto conta até hoje.
            // Além disso, o relógio nunca corre além do corte de recebimento.
            const periodRefDate = new Date(periodEndStr + 'T00:00:00Z');
            const cutoffDate = new Date(reportingCutoffStr + 'T00:00:00Z');
            const gapReference = new Date(Math.min(
                (isActive ? today : periodRefDate).getTime(),
                cutoffDate.getTime()
            ));
            const daysSinceLast = lastLogDate
                ? Math.max(0, Math.floor((gapReference - new Date(lastLogDate + 'T00:00:00Z')) / 86400000))
                : null;
            const maxGap = Math.max(maxGapHistorico, daysSinceLast ?? 0);

            // Último lançamento considerando TODOS os períodos do veículo nesta obra.
            // Serve para explicar horas > 0 quando o período atual não tem nenhum lançamento.
            const lastLogDateAnyPeriod = [...vehicleLogs]
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.date?.split('T')[0] || null;

            // Detalhamento por período — consumido apenas pelo modal de detalhe.
            const todayStr = new Date().toISOString().split('T')[0];
            const periodBreakdown = sortedPeriods.map(p => {
                const pStart = p.dataEntrada.split('T')[0];
                const pEnd = p.dataSaida ? p.dataSaida.split('T')[0] : todayStr;
                const pLogs = vehicleLogs
                    .filter(l => { const d = l.date.split('T')[0]; return d >= pStart && d <= pEnd; })
                    .sort((a, b) => new Date(b.date) - new Date(a.date));
                const pLogSet = new Set(pLogs.map(l => l.date.split('T')[0]));

                const pDays = [];
                { const cur = new Date(pStart + 'T00:00:00Z');
                  const end = new Date(pEnd + 'T00:00:00Z');
                  while (cur <= end) { pDays.push(cur.toISOString().split('T')[0]); cur.setUTCDate(cur.getUTCDate() + 1); } }

                let pMaxGap = 0, acc = 0;
                pDays.forEach(d => { if (!pLogSet.has(d)) { acc++; pMaxGap = Math.max(pMaxGap, acc); } else acc = 0; });

                return {
                    id: p.id ?? `${pStart}-${pEnd}`,
                    start: pStart,
                    end: p.dataSaida ? pEnd : null,
                    isOpen: !p.dataSaida,
                    totalDays: pDays.length,
                    daysWithLogs: pLogSet.size,
                    hours: pLogs.reduce((acc2, l) => acc2 + parseFloat(l.totalHours || 0), 0),
                    maxGap: pMaxGap,
                    lastLog: pLogs[0]?.date?.split('T')[0] || null,
                    lastLogJustificativaTipo: pLogs[0]?.justificativaTipo || null,
                };
            }).reverse(); // mais recente primeiro

            const contractedHours = parseFloat(horasContratadas[vehicle.tipo] || 0);
            const coveragePercent = contractedHours > 0 ? (totalHours / contractedHours) * 100 : null;

            // Só há "sem lançamentos" se existirem dias já cobráveis e nenhum deles tiver lançamento.
            const logsInEvaluableDays = evaluableDays.filter(d => currentPeriodLogSet.has(d)).length;

            let status = 'ok';
            if (isWithinReportingWindow) status = 'aguardando';
            // Sem o filtro de "> 3 dias": todo dia aqui já passou do prazo de envio.
            // Zero lançamento em dia vencido é problema real, mesmo que seja um só.
            else if (logsInEvaluableDays === 0) status = 'nunca';
            else if (maxGap > GAP_THRESHOLD_DAYS) status = 'atencao';

            return {
                vehicleId: String(vehicleId), vehicle, isActive,
                periods: sortedPeriods,
                totalDays: allDays.length, daysWithLogs, totalHours, contractedHours,
                lastLogDate, lastLogDateAnyPeriod, daysSinceLast, maxGap, status, coveragePercent,
                periodBreakdown, periodStart: periodStartStr, periodEnd: relevantPeriod.dataSaida ? periodEndStr : null,
                isWithinReportingWindow, evaluableDays: evaluableDays.length, reportingCutoff: reportingCutoffStr,
                lastLogJustificativaTipo: sortedCurrentLogs[0]?.justificativaTipo || null,
                entryDate,
            };
        }).filter(Boolean).sort((a, b) => {
            // Regra fixa: ativos sempre antes de inativos.
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            const order = { nunca: 0, atencao: 1, aguardando: 2, ok: 3 };
            if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
            return (a.vehicle.registroInterno || '').localeCompare(b.vehicle.registroInterno || '');
        });

        // 'aguardando' não é alerta — é prazo de recebimento ainda correndo.
        const withAlerts = vehicleStats.filter(v => v.status !== 'ok' && v.status !== 'aguardando').length;
        const totalHorasObra = vehicleStats.reduce((acc, v) => acc + v.totalHours, 0);
        const allLogDates = [...obraLogs].map(l => l.date.split('T')[0]).sort();

        return {
            vehicleStats,
            summary: {
                total: vehicleStats.length,
                active: vehicleStats.filter(v => v.isActive).length,
                withAlerts, totalHoras: totalHorasObra, totalContratado,
                lastLog: allLogDates[allLogDates.length - 1] || null,
            }
        };
    }, [obraId, obraLogs, obras, vehicles, vehicleGroups, today]);

    const obraStatsFiltered = useMemo(() => {
        let stats = [...(obraStats.vehicleStats || [])];
        if (obraOnlyAlerts) stats = stats.filter(s => s.status !== 'ok' && s.status !== 'aguardando');
        if (obraDetailStatus === 'ativos') stats = stats.filter(s => s.isActive);
        else if (obraDetailStatus === 'inativos') stats = stats.filter(s => !s.isActive);
        // Ativos sempre antes de inativos, independente da ordenação escolhida.
        const byActiveFirst = (cmp) => (a, b) => {
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            return cmp(a, b);
        };

        if (obraDetailSort === 'horas') stats = stats.sort(byActiveFirst((a, b) => b.totalHours - a.totalHours));
        else if (obraDetailSort === 'gap') stats = stats.sort(byActiveFirst((a, b) => b.maxGap - a.maxGap));
        else if (obraDetailSort === 'cobertura') {
            stats = stats.sort(byActiveFirst((a, b) => {
                if (a.coveragePercent === null && b.coveragePercent === null) return 0;
                if (a.coveragePercent === null) return 1;
                if (b.coveragePercent === null) return -1;
                return a.coveragePercent - b.coveragePercent;
            }));
        }
        return stats;
    }, [obraStats.vehicleStats, obraDetailStatus, obraDetailSort, obraOnlyAlerts]);

    const selectedObraStat = useMemo(
        () => (obraStats.vehicleStats || []).find(s => s.vehicleId === selectedObraStatId) || null,
        [obraStats.vehicleStats, selectedObraStatId]
    );

    // ==========================================================
    // VIEW: POR OBRA — render helpers
    // ==========================================================

    // Estilos alinhados ao padrão de tabela do ObrasPage (Gestão de Obras).
    const thStyle = { padding: '10px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#9a8a78', whiteSpace: 'nowrap' };
    const tdStyle = { padding: '10px 16px' };
    const labelStyle = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#9a8a78', whiteSpace: 'nowrap' };
    const selectStyle = { fontSize: 13, padding: '5px 10px', borderRadius: 8, border: '1px solid #e8e0d4', background: '#fff', color: '#3d3528', outline: 'none' };

    const riskDotColor = { critico: '#dc2626', atencao: '#f97316', ok: '#16a34a' };

    const SortHeader = ({ label, sortKey, align = 'left' }) => (
        <th style={{ ...thStyle, textAlign: align, cursor: 'pointer', userSelect: 'none' }}
            onClick={() => toggleObraSort(sortKey)}
            title="Ordenar por esta coluna">
            <span className="inline-flex items-center gap-1" style={{ color: obraSort === sortKey ? '#9E7A42' : undefined }}>
                {label}
                {obraSort === sortKey && (obraSortDir === 'desc' ? '▾' : '▴')}
            </span>
        </th>
    );

    // Badge único da tabela: absorve o "maior gap" para não precisar de coluna própria.
    const renderStatusBadgeWithGap = (stat) => {
        const base = 'px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap';
        if (stat.status === 'aguardando') return (
            <span className={`${base} bg-sky-100 text-sky-700`}
                  title={`Período iniciado há menos de ${REPORTING_LAG_DAYS} dias — os apontamentos ainda estão a caminho.`}>
                Aguardando apontamento
            </span>
        );
        if (stat.status === 'nunca') return <span className={`${base} bg-red-100 text-red-700`}>Sem lançamentos</span>;
        if (stat.status === 'atencao') return <span className={`${base} bg-orange-100 text-orange-700`}>Gap {stat.maxGap}d</span>;
        if (!stat.isActive) return <span className={`${base} bg-gray-100 text-gray-500`}>Encerrado</span>;
        return <span className={`${base} bg-green-100 text-green-700`}>Em dia</span>;
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

    // ==========================================================
    // VIEW: POR MÁQUINA — estados
    // ==========================================================

    const [maqSearch, setMaqSearch] = useState('');
    const [maqCriticality, setMaqCriticality] = useState('');
    const [maqGapOnly, setMaqGapOnly] = useState(false);
    const [maqObraId, setMaqObraId] = useState('');
    const [showWithoutObra, setShowWithoutObra] = useState(false);
    const [maqSort, setMaqSort] = useState('dias');
    const [selectedMachineId, setSelectedMachineId] = useState(null);
    const [requestForm, setRequestForm] = useState(null); // null | 'obra' | 'operador'
    const [requestValue, setRequestValue] = useState(null); // obra ou employee sugerido
    const [requestObs, setRequestObs] = useState('');
    const [requestSubmitting, setRequestSubmitting] = useState(false);

    const closeMachineModal = () => {
        setSelectedMachineId(null);
        setRequestForm(null);
        setRequestValue(null);
        setRequestObs('');
    };

    const openRequestForm = (tipo) => {
        setRequestForm(tipo);
        setRequestValue(null);
        setRequestObs('');
    };

    const [relatorioSubmitting, setRelatorioSubmitting] = useState(false);
    const [relatorioPreview, setRelatorioPreview] = useState(null); // { operador, mensagem, canais, payload }
    const [relatorioPreviewLoading, setRelatorioPreviewLoading] = useState(false);

    const abrirPreviewRelatorio = async () => {
        if (!selectedMachine?.operator) return;
        const payload = {
            employeeId: selectedMachine.operator.id,
            veiculo_registro: selectedMachine.vehicle.registroInterno || null,
            obra_nome: selectedMachine.currentObra ? formatObraNome(selectedMachine.currentObra) : null,
            dias: selectedMachine.daysSinceLastLog,
        };
        setRelatorioPreviewLoading(true);
        try {
            const res = await apiClient.previewRelatorioHoras(payload);
            setRelatorioPreview({ ...res, payload });
        } catch (e) {
            setAlertMessage(e.message || 'Erro ao montar a pré-visualização da cobrança.');
        } finally {
            setRelatorioPreviewLoading(false);
        }
    };

    const confirmarEnvioRelatorio = async () => {
        if (!relatorioPreview?.payload) return;
        setRelatorioSubmitting(true);
        try {
            const res = await apiClient.solicitarRelatorioHoras(relatorioPreview.payload);
            const canais = (res?.enviados || []).map(c => c === 'whatsapp' ? 'WhatsApp' : 'e-mail').join(' e ');
            setAlertMessage(canais ? `Cobrança enviada ao operador por ${canais}.` : 'Cobrança enviada ao operador.');
            setRelatorioPreview(null);
        } catch (e) {
            setAlertMessage(e.message || 'Erro ao enviar a cobrança ao operador.');
        } finally {
            setRelatorioSubmitting(false);
        }
    };

    const submitOperationalRequest = async () => {
        if (!selectedMachine || !requestValue) return;
        setRequestSubmitting(true);
        try {
            const isObra = requestForm === 'obra';
            await apiClient.createOperationalRequest({
                tipo: isObra ? 'mudanca_obra' : 'mudanca_operador',
                veiculo_id: selectedMachine.vehicle.id,
                veiculo_registro: selectedMachine.vehicle.registroInterno || null,
                obra_atual_id: selectedMachine.currentObra?.id || null,
                obra_atual_nome: selectedMachine.currentObra ? formatObraNome(selectedMachine.currentObra) : null,
                operador_atual_nome: selectedMachine.operator?.nome || selectedMachine.operator?.name || null,
                valor_sugerido_id: requestValue.id || null,
                valor_sugerido_nome: isObra ? formatObraNome(requestValue) : (requestValue.nome || requestValue.name),
                observacao: requestObs.trim() || null,
            });
            setAlertMessage('Requisição enviada ao administrador.');
            setRequestForm(null);
            setRequestValue(null);
            setRequestObs('');
        } catch (e) {
            const detail = e?.data?.detail || e?.data?.code || e?.message || '';
            setAlertMessage('Erro ao enviar requisição.' + (detail ? ` Detalhe: ${detail}` : ''));
        } finally {
            setRequestSubmitting(false);
        }
    };

    // ==========================================================
    // VIEW: POR MÁQUINA — memos
    // ==========================================================

    const machineData = useMemo(() => {
        const heavyVehicles = vehicles.filter(v => isHeavyVehicle(v.tipo) && v.ativo !== false);

        return heavyVehicles.map(vehicle => {
            let currentObra = null;
            let currentPeriod = null;
            for (const obra of obras) {
                const period = (obra.historicoVeiculos || []).find(
                    h => String(h.veiculoId) === String(vehicle.id) && !h.dataSaida
                );
                if (period) { currentObra = obra; currentPeriod = period; break; }
            }

            const allPeriods = obras.flatMap(o =>
                (o.historicoVeiculos || [])
                    .filter(h => String(h.veiculoId) === String(vehicle.id))
                    .map(h => ({ ...h, obra: o }))
            ).sort((a, b) => new Date(b.dataEntrada) - new Date(a.dataEntrada));

            const operatorId = currentPeriod?.employeeId;
            const operator = operatorId ? employees.find(e => String(e.id) === String(operatorId)) : null;

            const vehicleLogs = (dailyWorkLogs || []).filter(l => String(l.vehicleId) === String(vehicle.id));
            const sortedLogs = [...vehicleLogs].sort((a, b) => new Date(b.date) - new Date(a.date));
            const lastLogDate = sortedLogs[0]?.date?.split('T')[0] || null; // sem filtro — usado em gapAfterReallocation

            // Para máquinas inativas, o gap é: último lançamento → dataSaida (não → hoje)
            let displayLastLogDate = lastLogDate;
            let daysSinceLastLog = null;
            if (!currentObra) {
                const lastPeriod = allPeriods.find(p => p.dataSaida); // allPeriods já está ordenado por dataEntrada desc
                const reallocationDate = lastPeriod
                    ? new Date(lastPeriod.dataSaida.split('T')[0] + 'T12:00:00Z')
                    : null;
                if (reallocationDate) {
                    const logsBeforeReallocation = sortedLogs.filter(l =>
                        new Date(l.date.split('T')[0] + 'T12:00:00Z') <= reallocationDate
                    );
                    displayLastLogDate = logsBeforeReallocation[0]?.date?.split('T')[0] || null;
                    if (displayLastLogDate) {
                        daysSinceLastLog = Math.floor((reallocationDate - new Date(displayLastLogDate + 'T12:00:00Z')) / 86400000);
                    }
                }
            } else {
                if (lastLogDate) {
                    daysSinceLastLog = Math.floor((today - new Date(lastLogDate + 'T12:00:00Z')) / 86400000);
                }
            }

            const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
            let gapAfterReallocation = false;
            let recentDepartureObra = null;
            for (const p of allPeriods) {
                if (!p.dataSaida) continue;
                const leftDate = new Date(p.dataSaida.split('T')[0] + 'T12:00:00Z');
                if (leftDate < thirtyDaysAgo) continue;
                const lastLogD = lastLogDate ? new Date(lastLogDate + 'T12:00:00Z') : null;
                if (!lastLogD || lastLogD < leftDate) {
                    gapAfterReallocation = true;
                    recentDepartureObra = p.obra;
                    break;
                }
            }

            let criticality;
            if (!currentObra) criticality = 'sem_obra';
            else if (vehicleLogs.length === 0) criticality = 'nunca';
            else if (daysSinceLastLog > 7) criticality = 'critico';
            else if (daysSinceLastLog > 3) criticality = 'atencao';
            else criticality = 'ok';

            return { vehicle, currentObra, operator, lastLogDate: displayLastLogDate, daysSinceLastLog, neverLogged: vehicleLogs.length === 0, criticality, gapAfterReallocation, recentDepartureObra };
        });
    }, [vehicles, obras, dailyWorkLogs, employees, vehicleGroups, today]);

    const maqSummary = useMemo(() => ({
        emObra: machineData.filter(m => m.currentObra).length,
        semLancamento3: machineData.filter(m => m.currentObra && (m.daysSinceLastLog === null || m.daysSinceLastLog > 3)).length,
        semLancamento7: machineData.filter(m => m.currentObra && (m.daysSinceLastLog === null || m.daysSinceLastLog > 7)).length,
        nunca: machineData.filter(m => m.criticality === 'nunca').length,
        semObra: machineData.filter(m => m.criticality === 'sem_obra').length,
        gap: machineData.filter(m => m.gapAfterReallocation).length,
    }), [machineData]);

    const selectedMachine = useMemo(() => {
        if (!selectedMachineId) return null;
        const base = machineData.find(m => String(m.vehicle.id) === String(selectedMachineId));
        if (!base) return null;

        // Total de horas registradas (todos os lançamentos do veículo)
        const vehicleLogs = (dailyWorkLogs || []).filter(l => String(l.vehicleId) === String(selectedMachineId));
        const totalHoras = vehicleLogs.reduce((acc, l) => acc + parseFloat(l.totalHours || 0), 0);
        const totalLancamentos = vehicleLogs.filter(l => parseFloat(l.totalHours || 0) > 0).length;

        // Última leitura registrada no abastecimento (horímetro/odômetro)
        const usaKm = getAllowedReadingTypes(base.vehicle.tipo).includes('odometro');
        const leituraLabel = usaKm ? 'Odômetro' : 'Horímetro';
        const leituraUnidade = usaKm ? 'Km' : 'h';
        const vehicleRefuelings = (refuelings || [])
            .filter(r => String(r.vehicleId) === String(selectedMachineId))
            .map(r => ({ ...r, leitura: usaKm ? parseFloat(r.odometro || 0) : parseFloat(r.horimetro || 0) }))
            .filter(r => r.leitura > 0)
            .sort((a, b) => new Date(b.data) - new Date(a.data));
        const ultimoAbastecimento = vehicleRefuelings[0] || null;

        return {
            ...base,
            totalHoras,
            totalLancamentos,
            leituraLabel,
            leituraUnidade,
            ultimaLeitura: ultimoAbastecimento ? ultimoAbastecimento.leitura : null,
            ultimaLeituraData: ultimoAbastecimento ? ultimoAbastecimento.data : null,
        };
    }, [selectedMachineId, machineData, dailyWorkLogs, refuelings]);

    const activeObras = useMemo(() =>
        obras.filter(o => {
            const s = (o.status || '').toLowerCase();
            return s !== 'finalizada' && s !== 'concluída' && s !== 'inativa' && (o.tipo_registro || 'obra') !== 'centro_custo';
        }),
        [obras]
    );

    const maqFiltered = useMemo(() => {
        let result = [...machineData];
        if (!showWithoutObra && maqCriticality !== 'sem_obra') result = result.filter(m => m.currentObra);
        if (maqCriticality) result = result.filter(m => m.criticality === maqCriticality);
        if (maqGapOnly) result = result.filter(m => m.gapAfterReallocation);
        if (maqObraId) result = result.filter(m => String(m.currentObra?.id) === String(maqObraId));
        if (maqSearch.trim()) {
            const s = maqSearch.toLowerCase().trim();
            result = result.filter(m =>
                (m.vehicle.registroInterno || '').toLowerCase().includes(s) ||
                (m.vehicle.tipo || '').toLowerCase().includes(s) ||
                (m.vehicle.modelo || '').toLowerCase().includes(s) ||
                (m.vehicle.placa || '').toLowerCase().includes(s) ||
                (m.currentObra?.nome || '').toLowerCase().includes(s)
            );
        }
        const critOrder = { nunca: 0, critico: 1, atencao: 2, sem_obra: 3, ok: 4 };
        if (maqSort === 'maquina') result.sort((a, b) => (a.vehicle.registroInterno || '').localeCompare(b.vehicle.registroInterno || ''));
        else if (maqSort === 'obra') result.sort((a, b) => (a.currentObra?.nome || 'zzz').localeCompare(b.currentObra?.nome || 'zzz'));
        else result.sort((a, b) => {
            if (critOrder[a.criticality] !== critOrder[b.criticality]) return critOrder[a.criticality] - critOrder[b.criticality];
            return (b.daysSinceLastLog ?? 9999) - (a.daysSinceLastLog ?? 9999);
        });
        return result;
    }, [machineData, showWithoutObra, maqCriticality, maqGapOnly, maqObraId, maqSearch, maqSort]);

    const maqCritConfig = {
        nunca:    { row: 'bg-red-50 border-l-4 border-red-600',    badge: 'bg-red-100 text-red-700',      label: 'Nunca lançou' },
        critico:  { row: 'bg-red-50 border-l-4 border-red-400',    badge: 'bg-red-100 text-red-600',      label: 'Crítico'      },
        atencao:  { row: 'bg-orange-50 border-l-4 border-orange-400', badge: 'bg-orange-100 text-orange-700', label: 'Atenção'   },
        ok:       { row: 'border-l-4 border-green-400',             badge: 'bg-green-100 text-green-700', label: 'Em dia'       },
        sem_obra: { row: 'bg-gray-50 border-l-4 border-gray-300',   badge: 'bg-gray-100 text-gray-500',   label: 'Sem obra'     },
    };

    const MaqStatusBadge = ({ vehicle }) => {
        const status = vehicle.computedStatus || vehicle.status || 'Desconhecido';
        let cls = 'bg-gray-100 text-gray-600';
        if (status === 'Em Obra') cls = 'bg-blue-100 text-blue-700';
        else if (status === 'Em Operação') cls = 'bg-indigo-100 text-indigo-700';
        else if (status === 'Disponível') cls = 'bg-green-100 text-green-700';
        else if (status.includes('Manutenção') || status === 'Oficina') cls = 'bg-yellow-100 text-yellow-700';
        else if (status === 'Parada' || status === 'Inativo') cls = 'bg-red-100 text-red-600';
        return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{status}</span>;
    };

    const hasMaqFilters = maqSearch || maqCriticality || maqObraId || showWithoutObra || maqGapOnly;
    const clearMaqFilters = () => { setMaqSearch(''); setMaqCriticality(''); setMaqObraId(''); setShowWithoutObra(false); setMaqGapOnly(false); };

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        const [y, m, d] = dateStr.split('T')[0].split('-');
        return `${d}/${m}/${y}`;
    };

    // ==========================================================
    // RENDER
    // ==========================================================

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e1a14" }} className=" mb-1 flex items-center gap-2">
                <Activity className="text-yellow-500" /> Central Operacional
            </h1>
            <p className="text-gray-500 text-sm mb-6">Monitoramento de lançamentos por obra e por equipamento</p>

            {/* Abas de visão */}
            <div className="flex border-b border-gray-200 mb-6 bg-white rounded-t-lg shadow-sm px-2">
                <button
                    onClick={() => setActiveView('obra')}
                    className={`py-3 px-5 font-semibold text-sm flex items-center gap-2 transition-colors border-b-2 -mb-px ${activeView === 'obra' ? 'border-[#9E7A42] text-[#9E7A42]' : 'border-transparent text-[#9a8a78] hover:text-[#6a5e4e]'}`}
                >
                    <BarChart2 size={16} /> Por Obra
                </button>
                <button
                    onClick={() => setActiveView('maquina')}
                    className={`py-3 px-5 font-semibold text-sm flex items-center gap-2 transition-colors border-b-2 -mb-px ${activeView === 'maquina' ? 'border-[#9E7A42] text-[#9E7A42]' : 'border-transparent text-[#9a8a78] hover:text-[#6a5e4e]'}`}
                >
                    <Truck size={16} /> Por Máquina
                </button>
            </div>

            {/* ===== VISÃO: POR OBRA ===== */}
            {activeView === 'obra' && (
                <div className="space-y-6">
                    {!obraId ? (
                        <>
                            {/* Filtros */}
                            <div className="bg-white rounded-xl shadow-sm p-4">
                                <div className="flex flex-col md:flex-row gap-3 md:items-center">
                                    <div className="relative w-full md:w-72">
                                        <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                                        <input type="text" placeholder="Buscar obra..." value={obraSearch} onChange={e => setObraSearch(e.target.value)}
                                            className="pl-9 pr-4 py-2 border rounded-lg w-full text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none" />
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                        <div className="flex items-center gap-2">
                                            <span style={labelStyle}>Status</span>
                                            <select value={obraStatus} onChange={e => setObraStatus(e.target.value)} style={selectStyle}>
                                                <option value="ativas">Ativas</option>
                                                <option value="finalizadas">Finalizadas</option>
                                                <option value="todas">Todas</option>
                                            </select>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span style={labelStyle}>Situação</span>
                                            <select value={obraRisk} onChange={e => setObraRisk(e.target.value)} style={selectStyle}>
                                                <option value="">Todas</option>
                                                <option value="critico">Sem Registro</option>
                                                <option value="atencao">Atenção</option>
                                                <option value="ok">Operando</option>
                                            </select>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span style={labelStyle}>Equip.</span>
                                            <select value={obraHasActive} onChange={e => setObraHasActive(e.target.value)} style={selectStyle}>
                                                <option value="">Todos</option>
                                                <option value="sim">Com ativos</option>
                                                <option value="nao">Sem ativos</option>
                                            </select>
                                        </div>
                                        <label className="flex items-center gap-1.5 cursor-pointer shrink-0" title="Exibir/Ocultar Centros de Custo">
                                            <div className="relative">
                                                <input type="checkbox" checked={showCentroCusto} onChange={e => setShowCentroCusto(e.target.checked)} className="sr-only peer" />
                                                <div className="w-8 h-4 bg-gray-200 rounded-full transition-colors peer-checked:bg-yellow-400" />
                                                <div className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                                            </div>
                                            <span style={labelStyle}>Centros de custo</span>
                                        </label>
                                    </div>
                                    <div className="md:ml-auto flex items-center gap-3 shrink-0">
                                        {hasObraFilters && (
                                            <button onClick={clearObraFilters} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium">
                                                <X size={13} /> Limpar
                                            </button>
                                        )}
                                        <span style={{ fontSize: 12, fontWeight: 600, color: '#9a8a78', whiteSpace: 'nowrap' }}>
                                            {obrasFiltradas.length} {obrasFiltradas.length === 1 ? 'obra' : 'obras'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Tabela de obras */}
                            {obrasFiltradas.length > 0 && (
                                <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #f0ebe3', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
                                    <div className="overflow-x-auto">
                                        <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                                            <thead>
                                                <tr style={{ background: '#faf9f7', borderBottom: '1px solid #f0ebe3' }}>
                                                    <SortHeader label="Obra" sortKey="nome" />
                                                    <SortHeader label="Dias" sortKey="dias" align="center" />
                                                    <SortHeader label="Equip. ativos" sortKey="ativos" align="center" />
                                                    <SortHeader label="Sem lançar +10d" sortKey="semLancamento" align="center" />
                                                    <SortHeader label="Horas lançadas" sortKey="horas" align="center" />
                                                    <SortHeader label="Situação" sortKey="risco" align="center" />
                                                    <th style={{ ...thStyle, textAlign: 'right', position: 'sticky', right: 0, background: '#faf9f7', zIndex: 2, boxShadow: '-8px 0 8px -6px rgba(0,0,0,0.08)' }}>Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {obrasFiltradas.map(({ obra, isFinished, ativos, equipSemLancamento10d, totalHoras, diasDeObra, riskLevel, riskScore, riskReasons }) => (
                                                    <tr key={obra.id} onClick={() => setObraId(obra.id)}
                                                        title="Ver cobertura detalhada"
                                                        className={`group cursor-pointer transition-colors ${riskLevel === 'critico' && !isFinished ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-[#faf9f7]'}`}
                                                        style={{ borderBottom: '1px solid #f5f2ed' }}>
                                                        {/* Obra */}
                                                        <td style={{ ...tdStyle, maxWidth: 340 }}>
                                                            <div className="flex items-center gap-2">
                                                                <span style={{ width: 8, height: 8, borderRadius: 9999, background: isFinished ? '#c4b8a8' : riskDotColor[riskLevel], flexShrink: 0 }} title={riskConfig[riskLevel].label} />
                                                                <div className="min-w-0">
                                                                    <div className="line-clamp-1" style={{ fontWeight: 600, color: '#3d3528' }} title={formatObraNome(obra)}>
                                                                        {formatObraNome(obra)}
                                                                    </div>
                                                                    <div style={{ fontSize: 11, color: '#9a8a78', marginTop: 2 }}>
                                                                        {isFinished ? 'Finalizada' : 'Em andamento'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        {/* Dias */}
                                                        <td style={{ ...tdStyle, textAlign: 'center', color: '#6a5e4e', whiteSpace: 'nowrap' }}>
                                                            {isFinished ? <span style={{ color: '#c4b8a8' }}>—</span> : `${diasDeObra}d`}
                                                        </td>
                                                        {/* Equip. ativos */}
                                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: ativos > 0 ? '#e0f2fe' : '#f5f2ed', color: ativos > 0 ? '#0c4a6e' : '#9a8a78' }}>
                                                                {ativos}
                                                            </span>
                                                        </td>
                                                        {/* Sem lançar +10d */}
                                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                            {equipSemLancamento10d > 0 ? (
                                                                <span className="inline-flex items-center gap-1" style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: '#ffedd5', color: '#c2410c' }}>
                                                                    <AlertTriangle size={11} /> {equipSemLancamento10d}
                                                                </span>
                                                            ) : <span style={{ color: '#c4b8a8' }}>—</span>}
                                                        </td>
                                                        {/* Horas lançadas */}
                                                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: totalHoras > 0 ? '#3d3528' : '#c4b8a8', whiteSpace: 'nowrap' }}>
                                                            {formatDecimalToTime(totalHoras)}
                                                        </td>
                                                        {/* Situação */}
                                                        <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                            <RiskBadge riskLevel={riskLevel} riskScore={riskScore} riskReasons={riskReasons} />
                                                        </td>
                                                        {/* Ações */}
                                                        <td className={`${riskLevel === 'critico' && !isFinished ? 'bg-red-50 group-hover:bg-red-100' : 'bg-white group-hover:bg-[#faf9f7]'}`}
                                                            style={{ ...tdStyle, textAlign: 'right', position: 'sticky', right: 0, zIndex: 1, boxShadow: '-8px 0 8px -6px rgba(0,0,0,0.08)' }}>
                                                            <button onClick={(e) => { e.stopPropagation(); setObraId(obra.id); }}
                                                                className="px-3 py-1.5 text-sm font-medium rounded-lg transition mak-btn mak-btn-cancel whitespace-nowrap">
                                                                Ver cobertura
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {obrasFiltradas.length === 0 && (
                                <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed">
                                    <AlertTriangle className="mx-auto mb-4" style={{ color: "#e8e0d4" }} size={48} />
                                    <p className="text-gray-400 font-medium">Nenhuma obra encontrada.</p>
                                    {hasObraFilters && <button onClick={clearObraFilters} className="mt-3 text-sm text-yellow-600 hover:text-yellow-700 font-semibold">Limpar filtros</button>}
                                </div>
                            )}
                        </>
                    ) : (
                        /* DETALHE DA OBRA */
                        <div className="space-y-6">
                            <button onClick={() => { setObraId(''); setObraLogs([]); }}
                                className="flex items-center gap-2 text-sm text-[#9a8a78] hover:text-[#6a5e4e] font-medium transition-colors">
                                <ChevronLeft size={16} /> Voltar para todas as obras
                            </button>

                            <div className="flex items-center justify-between">
                                <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1e1a14" }} className="">{formatObraNome(obras.find(o => o.id === obraId))}</h2>
                                {(() => {
                                    const r = obrasComRisco.find(o => o.obra.id === obraId);
                                    return r ? <RiskBadge riskLevel={r.riskLevel} riskScore={r.riskScore} riskReasons={r.riskReasons} size="md" /> : null;
                                })()}
                            </div>

                            {loadingObra ? (
                                <div className="py-16 text-center text-gray-400">Carregando dados de cobertura...</div>
                            ) : (
                                <>
                                    {/* Resumo da obra — mesmo modelo do painel "Gestão de Obras":
                                        card único com colunas divididas, em vez de 4 cartões soltos. */}
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                                        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y divide-x-0 lg:divide-y-0 lg:divide-x divide-slate-100">
                                            <div className="pb-3 lg:pb-0 lg:pr-4">
                                                <div className="flex items-center gap-2 text-slate-500 text-[11px] uppercase font-bold tracking-wider">
                                                    <Truck size={14} /> Equipamentos
                                                </div>
                                                <p className="text-2xl font-bold text-slate-800 mt-1">{obraStats.summary?.total ?? '—'}</p>
                                                <p className="text-[11px] text-slate-500 mt-1">{obraStats.summary?.active ?? 0} ativos na obra</p>
                                            </div>

                                            <div
                                                onClick={() => { if ((obraStats.summary?.withAlerts ?? 0) > 0) setObraOnlyAlerts(v => !v); }}
                                                title={(obraStats.summary?.withAlerts ?? 0) > 0 ? 'Clique para filtrar a tabela abaixo' : undefined}
                                                className={`pb-3 lg:pb-0 lg:px-4 transition-colors rounded-lg ${(obraStats.summary?.withAlerts ?? 0) > 0 ? 'cursor-pointer hover:bg-slate-50' : ''} ${obraOnlyAlerts ? 'bg-red-50' : ''}`}>
                                                <div className="flex items-center gap-2 text-slate-500 text-[11px] uppercase font-bold tracking-wider">
                                                    <AlertTriangle size={14} /> Com alertas
                                                </div>
                                                <p className={`text-2xl font-bold mt-1 ${(obraStats.summary?.withAlerts ?? 0) > 0 ? 'text-red-600' : 'text-slate-800'}`}>{obraStats.summary?.withAlerts ?? '—'}</p>
                                                <p className="text-[11px] text-slate-500 mt-1">
                                                    {(obraStats.summary?.withAlerts ?? 0) === 0 ? 'Nenhum gap crítico' : obraOnlyAlerts ? 'Filtrando — clique p/ limpar' : 'Clique para filtrar a tabela'}
                                                </p>
                                            </div>

                                            <div className="pt-3 lg:pt-0 lg:px-4">
                                                <div className="flex items-center gap-2 text-slate-500 text-[11px] uppercase font-bold tracking-wider">
                                                    <Gauge size={14} /> Total lançado
                                                </div>
                                                <p className="text-2xl font-bold text-slate-800 mt-1">{formatDecimalToTime(obraStats.summary?.totalHoras ?? 0)}</p>
                                                {(obraStats.summary?.totalContratado ?? 0) > 0 ? (() => {
                                                    const pct = Math.min(((obraStats.summary.totalHoras / obraStats.summary.totalContratado) * 100), 100);
                                                    const barColor = pct < 50 ? 'bg-orange-400' : pct < 80 ? 'bg-yellow-400' : 'bg-green-500';
                                                    return (
                                                        <>
                                                            <p className="text-[11px] text-slate-500 mt-1">{Math.round(pct)}% de {formatDecimalToTime(obraStats.summary.totalContratado)}h contratadas</p>
                                                            <div className="mt-1.5 bg-slate-100 rounded-full h-1.5">
                                                                <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                                                            </div>
                                                        </>
                                                    );
                                                })() : <p className="text-[11px] text-slate-500 mt-1">Sem horas contratadas</p>}
                                            </div>

                                            <div className="pt-3 lg:pt-0 lg:pl-4">
                                                <div className="flex items-center gap-2 text-slate-500 text-[11px] uppercase font-bold tracking-wider">
                                                    <Clock size={14} /> Último lançamento
                                                </div>
                                                <p className="text-2xl font-bold text-slate-800 mt-1">{obraStats.summary?.lastLog ? formatDateToBR(obraStats.summary.lastLog) : '—'}</p>
                                                <p className="text-[11px] text-slate-500 mt-1">Em qualquer equipamento</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                                        <div className="px-5 py-4 border-b border-gray-100">
                                            <div className="flex items-center justify-between mb-3">
                                                <h2 className="font-bold text-gray-700 flex items-center gap-2">
                                                    <Activity size={16} className="text-yellow-500" />
                                                    Cobertura de Lançamentos por Equipamento
                                                </h2>
                                                <span className="text-xs text-gray-400">Gap crítico: &gt; {GAP_THRESHOLD_DAYS} dias · últimos {REPORTING_LAG_DAYS} dias não são cobrados (prazo de envio)</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3">
                                                <div className="flex bg-gray-100 p-1 rounded-lg text-xs">
                                                    {[['todos', 'Todos'], ['ativos', 'Somente Ativos'], ['inativos', 'Somente Inativos']].map(([val, label]) => (
                                                        <button key={val} onClick={() => setObraDetailStatus(val)} className={`px-3 py-1 rounded-md font-medium transition-all ${obraDetailStatus === val ? 'bg-white shadow text-yellow-600' : 'text-[#9a8a78] hover:text-[#6a5e4e]'}`}>{label}</button>
                                                    ))}
                                                </div>
                                                <select value={obraDetailSort} onChange={e => setObraDetailSort(e.target.value)} className="text-xs border rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-yellow-400 outline-none">
                                                    <option value="padrao">Ordenar: Padrão (status)</option>
                                                    <option value="horas">Ordenar: Mais horas</option>
                                                    <option value="gap">Ordenar: Maior gap</option>
                                                    <option value="cobertura">Ordenar: Menor cobertura</option>
                                                </select>
                                                <span className="text-xs text-gray-400 ml-auto">{obraStatsFiltered.length} equip.</span>
                                            </div>
                                        </div>

                                        {obraStats.vehicleStats.length === 0 ? (
                                            <div className="py-12 text-center text-gray-400">
                                                <PackageX size={36} className="mx-auto mb-2 opacity-30" />
                                                <p>Nenhum equipamento pesado registrado nesta obra.</p>
                                            </div>
                                        ) : obraStatsFiltered.length === 0 ? (
                                            <div className="py-10 text-center text-gray-400 text-sm">Nenhum equipamento corresponde ao filtro.</div>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-[13px]">
                                                    <thead className="bg-[#faf9f7] text-[#9a8a78] text-[11px] font-bold uppercase tracking-[0.04em]">
                                                        <tr>
                                                            <th className="px-4 py-2.5 text-left">Equipamento</th>
                                                            <th className="px-4 py-2.5 text-left">Status</th>
                                                            <th className="px-4 py-2.5 text-left">Cobertura contratada</th>
                                                            <th className="px-4 py-2.5 text-left">Último lançamento</th>
                                                            <th className="px-4 py-2.5 text-right" title="Soma de todos os períodos do equipamento nesta obra">Horas (total)</th>
                                                            <th className="px-2 py-3 w-8"><span className="sr-only">Detalhes</span></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {obraStatsFiltered.map(stat => (
                                                            <tr key={stat.vehicleId}
                                                                onClick={() => setSelectedObraStatId(stat.vehicleId)}
                                                                title="Clique para ver o detalhe completo"
                                                                className={`group cursor-pointer transition-colors hover:bg-yellow-50 ${stat.status === 'nunca' ? 'bg-red-50' : stat.status === 'atencao' ? 'bg-orange-50' : ''}`}>
                                                                <td className="px-4 py-2.5 whitespace-nowrap">
                                                                    <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                                                                        <span
                                                                            title={stat.isActive ? 'Ativo na obra' : 'Período encerrado'}
                                                                            className={`inline-block w-2 h-2 rounded-full shrink-0 ${stat.isActive ? 'bg-green-500' : 'bg-gray-300'}`}
                                                                        />
                                                                        {stat.vehicle.registroInterno} <TerceirizadoBadge vehicle={stat.vehicle} />
                                                                    </p>
                                                                    <p className="text-xs text-gray-400 truncate max-w-[230px]">{stat.vehicle.tipo} · {stat.vehicle.marca} {stat.vehicle.modelo}</p>
                                                                </td>
                                                                <td className="px-4 py-2.5">{renderStatusBadgeWithGap(stat)}</td>
                                                                <td className="px-4 py-2.5 min-w-[150px]">{renderCoverageBar(stat.coveragePercent, stat.totalHours, stat.contractedHours)}</td>
                                                                <td className="px-4 py-2.5 whitespace-nowrap">
                                                                    {stat.lastLogDate ? (
                                                                        <span className="text-gray-700">
                                                                            {formatDateToBR(stat.lastLogDate)}
                                                                            {stat.isActive && stat.daysSinceLast !== null && (
                                                                                <span className={`ml-1.5 text-xs ${stat.daysSinceLast > GAP_THRESHOLD_DAYS ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>· {stat.daysSinceLast}d atrás</span>
                                                                            )}
                                                                        </span>
                                                                    ) : stat.lastLogDateAnyPeriod ? (
                                                                        <span className="text-gray-500 text-xs" title="Nenhum lançamento no período atual desta obra">
                                                                            <span className="text-red-400 font-semibold mr-1">—</span>
                                                                            ant. {formatDateToBR(stat.lastLogDateAnyPeriod)}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-red-400 font-semibold text-xs" title="Este equipamento nunca teve lançamento nesta obra">— nunca</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-2.5 text-right font-bold text-gray-700 whitespace-nowrap">{formatDecimalToTime(stat.totalHours)}</td>
                                                                <td className="px-2 py-3 text-right">
                                                                    <ChevronRight size={16} className="text-gray-300 group-hover:text-yellow-600 transition-colors" />
                                                                </td>
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

            {/* ===== VISÃO: POR MÁQUINA ===== */}
            {activeView === 'maquina' && (
                <div className="space-y-4">
                    {/* Faixa de contadores — todos filtram a tabela abaixo */}
                    <div className="bg-white rounded-xl shadow-sm px-4 py-2.5 flex flex-wrap items-center gap-x-2 gap-y-2">
                        {[
                            { key: 'emObra',   label: 'Em obra',     value: maqSummary.emObra,          color: '#0c4a6e', bg: '#e0f2fe', active: !maqCriticality && !maqGapOnly && !showWithoutObra,
                              onClick: () => { setMaqCriticality(''); setMaqGapOnly(false); setShowWithoutObra(false); } },
                            { key: 'atencao',  label: 'Sem lançar >3d', value: maqSummary.semLancamento3, color: '#c2410c', bg: '#ffedd5', active: maqCriticality === 'atencao',
                              onClick: () => { setMaqGapOnly(false); setMaqCriticality(maqCriticality === 'atencao' ? '' : 'atencao'); } },
                            { key: 'critico',  label: 'Sem lançar >7d', value: maqSummary.semLancamento7, color: '#b91c1c', bg: '#fee2e2', active: maqCriticality === 'critico',
                              onClick: () => { setMaqGapOnly(false); setMaqCriticality(maqCriticality === 'critico' ? '' : 'critico'); } },
                            { key: 'nunca',    label: 'Nunca lançaram', value: maqSummary.nunca,        color: '#7f1d1d', bg: '#fee2e2', active: maqCriticality === 'nunca',
                              onClick: () => { setMaqGapOnly(false); setMaqCriticality(maqCriticality === 'nunca' ? '' : 'nunca'); } },
                            { key: 'sem_obra', label: 'Sem obra',    value: maqSummary.semObra,         color: '#6a5e4e', bg: '#f5f2ed', active: maqCriticality === 'sem_obra',
                              onClick: () => { setMaqGapOnly(false); setMaqCriticality(maqCriticality === 'sem_obra' ? '' : 'sem_obra'); } },
                            { key: 'gap',      label: 'Gap pós-realocação', value: maqSummary.gap,      color: '#6d28d9', bg: '#ede9fe', active: maqGapOnly,
                              onClick: () => { setMaqCriticality(''); setShowWithoutObra(true); setMaqGapOnly(v => !v); } },
                        ].map(chip => (
                            <button key={chip.key} onClick={chip.onClick}
                                className="inline-flex items-center gap-2 rounded-lg transition-all"
                                style={{
                                    padding: '5px 12px',
                                    border: `1px solid ${chip.active ? chip.color : '#f0ebe3'}`,
                                    background: chip.active ? chip.bg : '#fff',
                                    boxShadow: chip.active ? `inset 0 0 0 1px ${chip.color}` : 'none',
                                }}
                                title={`Filtrar: ${chip.label}`}>
                                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#9a8a78' }}>{chip.label}</span>
                                <span style={{ fontSize: 15, fontWeight: 700, color: chip.color }}>{chip.value}</span>
                            </button>
                        ))}
                    </div>

                    {/* Filtros */}
                    <div className="bg-white rounded-xl shadow-sm p-4">
                        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center flex-wrap">
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                                <input type="text" placeholder="Buscar máquina, frota, obra..." value={maqSearch} onChange={e => setMaqSearch(e.target.value)}
                                    className="pl-9 pr-4 py-2 border rounded-lg w-full text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none" />
                            </div>
                            <div className="flex bg-gray-100 p-1 rounded-lg text-xs flex-wrap gap-0.5">
                                {[['', 'Todos'], ['nunca', 'Nunca lançou'], ['critico', 'Crítico'], ['atencao', 'Atenção'], ['ok', 'Em dia']].map(([val, label]) => (
                                    <button key={val} onClick={() => setMaqCriticality(val)} className={`px-3 py-1 rounded-md font-medium transition-all ${maqCriticality === val ? 'bg-white shadow text-yellow-600' : 'text-[#9a8a78] hover:text-[#6a5e4e]'}`}>{label}</button>
                                ))}
                            </div>
                            <div className="min-w-[220px]">
                                <SearchableSelect
                                    items={activeObras}
                                    value={maqObraId}
                                    onChange={(item) => setMaqObraId(item?.id || '')}
                                    getLabel={(o) => formatObraNome(o)}
                                    placeholder="Todas as obras"
                                />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                                <input type="checkbox" checked={showWithoutObra} onChange={e => setShowWithoutObra(e.target.checked)} className="rounded accent-yellow-500" />
                                Mostrar sem obra
                            </label>
                            <div className="md:ml-auto flex items-center gap-3">
                                <span className="text-xs text-gray-400">{maqFiltered.length} equip.</span>
                                {hasMaqFilters && (
                                    <button onClick={clearMaqFilters} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                                        <X size={12} /> Limpar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tabela */}
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                        <div className="px-4 py-2 border-b bg-gray-50 flex items-center gap-4 text-xs text-gray-500">
                            <span className="font-medium">Ordenar:</span>
                            {[['dias', 'Por criticidade'], ['maquina', 'Por máquina'], ['obra', 'Por obra']].map(([val, label]) => (
                                <button key={val} onClick={() => setMaqSort(val)} className={`font-medium transition-colors ${maqSort === val ? 'text-yellow-600 underline' : 'hover:text-gray-700'}`}>{label}</button>
                            ))}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="border-b bg-[#faf9f7] text-[11px] font-bold text-[#9a8a78] uppercase tracking-[0.04em]">
                                        <th className="px-4 py-2.5 text-left">Máquina</th>
                                        <th className="px-4 py-2.5 text-left">Obra Atual</th>
                                        <th className="px-4 py-2.5 text-left">Status</th>
                                        <th className="px-4 py-2.5 text-center">Ult. Lançamento</th>
                                        <th className="px-4 py-2.5 text-center">Dias Sem Lançar</th>
                                        <th className="px-4 py-2.5 text-left">Operador</th>
                                        <th className="px-4 py-2.5 text-center">Situação</th>
                                        {!isViewer && <th className="px-4 py-2.5 text-center">Ação</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {maqFiltered.length === 0 && (
                                        <tr>
                                            <td colSpan={isViewer ? 7 : 8} className="text-center py-16 text-gray-400">
                                                <Activity size={32} className="mx-auto mb-2 opacity-30" />
                                                Nenhum equipamento encontrado.
                                            </td>
                                        </tr>
                                    )}
                                    {maqFiltered.map(({ vehicle, currentObra, operator, lastLogDate, daysSinceLastLog, criticality, gapAfterReallocation, recentDepartureObra }) => {
                                        const cfg = maqCritConfig[criticality] || maqCritConfig.sem_obra;
                                        return (
                                            <tr key={vehicle.id} onClick={() => setSelectedMachineId(vehicle.id)} title="Ver detalhes do equipamento"
                                                className={`border-b last:border-b-0 hover:brightness-95 transition-all cursor-pointer ${cfg.row}`}>
                                                <td className="px-4 py-2.5">
                                                    <div className="font-semibold text-gray-800 flex items-center gap-1.5">{vehicle.registroInterno || '—'} <TerceirizadoBadge vehicle={vehicle} /></div>
                                                    <div className="text-xs text-gray-500">{vehicle.tipo}{vehicle.modelo ? ` · ${vehicle.modelo}` : ''}</div>
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    {currentObra ? <span className="text-gray-700">{formatObraNome(currentObra)}</span>
                                                        : recentDepartureObra ? <span className="text-gray-400 text-xs italic">Saiu de: {formatObraNome(recentDepartureObra)}</span>
                                                        : <span className="text-gray-300">—</span>}
                                                </td>
                                                <td className="px-4 py-2.5"><MaqStatusBadge vehicle={vehicle} /></td>
                                                <td className="px-4 py-2.5 text-center">
                                                    <span className={!lastLogDate ? 'text-red-500 font-semibold' : 'text-gray-600'}>{formatDate(lastLogDate)}</span>
                                                </td>
                                                <td className="px-4 py-2.5 text-center">
                                                    {daysSinceLastLog === null
                                                        ? <span className="font-bold text-red-700">Nunca</span>
                                                        : <span className={`font-bold text-lg ${daysSinceLastLog > 7 ? 'text-red-600' : daysSinceLastLog > 3 ? 'text-orange-500' : 'text-green-600'}`}>{daysSinceLastLog}d</span>
                                                    }
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    {operator
                                                        ? <span className="text-gray-700 text-xs">{operator.nome || operator.name || '—'}</span>
                                                        : <span className="text-gray-400 text-xs italic">Não definido</span>}
                                                </td>
                                                <td className="px-4 py-2.5 text-center">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cfg.badge}`}>{cfg.label}</span>
                                                        {gapAfterReallocation && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">Gap realocação</span>}
                                                    </div>
                                                </td>
                                                {!isViewer && (
                                                    <td className="px-4 py-2.5 text-center">
                                                        {currentObra
                                                            ? <button onClick={(e) => { e.stopPropagation(); navigate('billing', { tab: 'lancamentos', obraId: currentObra.id, vehicleId: vehicle.id }); }}
                                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-400 hover:bg-[#fdf8f0]0 text-gray-900 text-xs font-semibold rounded-lg transition-colors">
                                                                Lançar <ArrowRight size={12} />
                                                              </button>
                                                            : <span className="text-gray-300 text-xs">—</span>
                                                        }
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {maqFiltered.length > 0 && (
                            <div className="px-4 py-2.5 border-t bg-gray-50 text-xs text-gray-400 flex flex-wrap items-center gap-4">
                                <span className="font-medium text-gray-500">Legenda:</span>
                                {[['bg-red-700', 'Nunca lançou'], ['bg-red-400', 'Crítico (>7d)'], ['bg-orange-400', 'Atenção (3–7d)'], ['bg-green-400', 'Em dia (≤3d)'], ['bg-purple-400', 'Gap pós-realocação']].map(([color, label]) => (
                                    <span key={label} className="flex items-center gap-1.5">
                                        <span className={`w-2.5 h-2.5 rounded-full ${color} inline-block`} />{label}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== MODAL: COBERTURA DO EQUIPAMENTO NA OBRA ===== */}
            {selectedObraStat && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                    onClick={() => setSelectedObraStatId(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between p-5 border-b border-gray-100">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-11 h-11 rounded-xl bg-yellow-100 flex items-center justify-center shrink-0">
                                    <Truck size={22} className="text-yellow-600" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-lg font-bold text-gray-800 truncate flex items-center gap-2">
                                        {selectedObraStat.vehicle.registroInterno || 'Equipamento'}
                                        <TerceirizadoBadge vehicle={selectedObraStat.vehicle} />
                                        {renderStatusBadgeWithGap(selectedObraStat)}
                                    </h3>
                                    <p className="text-xs text-gray-500 truncate">
                                        {selectedObraStat.vehicle.tipo}
                                        {selectedObraStat.vehicle.modelo ? ` · ${selectedObraStat.vehicle.marca || ''} ${selectedObraStat.vehicle.modelo}` : ''}
                                        {selectedObraStat.vehicle.placa ? ` · ${selectedObraStat.vehicle.placa}` : ''}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedObraStatId(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Situação atual */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500 font-semibold uppercase mb-1"><MapPin size={13} /> Situação</div>
                                    <p className="text-sm font-medium text-gray-800">{selectedObraStat.isActive ? 'Ativo na obra' : 'Período encerrado'}</p>
                                    {!selectedObraStat.isActive && selectedObraStat.status !== 'ok' && selectedObraStat.status !== 'aguardando' && (
                                        <p className="text-[11px] text-red-500 mt-0.5 leading-tight">Gaps deste período são permanentes — não há mais como lançar.</p>
                                    )}
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500 font-semibold uppercase mb-1"><Clock size={13} /> Horas (todos os períodos)</div>
                                    <p className="text-sm font-medium text-gray-800">
                                        {formatDecimalToTime(selectedObraStat.totalHours)}
                                        {selectedObraStat.contractedHours > 0 && (
                                            <span className="text-xs text-gray-400 font-normal"> de {formatDecimalToTime(selectedObraStat.contractedHours)}h contratadas</span>
                                        )}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500 font-semibold uppercase mb-1"><Activity size={13} /> Último lançamento</div>
                                    {selectedObraStat.lastLogDate ? (
                                        <p className="text-sm font-medium text-gray-800">
                                            {formatDateToBR(selectedObraStat.lastLogDate)}
                                            {selectedObraStat.isActive && selectedObraStat.daysSinceLast !== null && (
                                                <span className={`text-xs font-normal ${selectedObraStat.daysSinceLast > GAP_THRESHOLD_DAYS ? 'text-red-500' : 'text-gray-400'}`}> · {selectedObraStat.daysSinceLast}d atrás</span>
                                            )}
                                            {selectedObraStat.lastLogJustificativaTipo && (
                                                <span className="ml-2 text-[11px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">
                                                    {JUSTIFICATIVA_LABELS[selectedObraStat.lastLogJustificativaTipo] || selectedObraStat.lastLogJustificativaTipo}
                                                </span>
                                            )}
                                        </p>
                                    ) : selectedObraStat.lastLogDateAnyPeriod ? (
                                        <p className="text-sm font-medium text-gray-800">
                                            <span className={selectedObraStat.isWithinReportingWindow ? 'text-sky-600' : 'text-red-500'}>
                                                {selectedObraStat.isWithinReportingWindow ? 'Ainda no prazo de envio' : 'Nada no período atual'}
                                            </span>
                                            <span className="block text-xs text-gray-400 font-normal">último em {formatDateToBR(selectedObraStat.lastLogDateAnyPeriod)}, em período anterior</span>
                                        </p>
                                    ) : selectedObraStat.isWithinReportingWindow ? (
                                        <p className="text-sm text-sky-600 font-medium">Ainda no prazo de envio</p>
                                    ) : (
                                        <p className="text-sm text-red-500 font-medium">Nunca lançou nesta obra</p>
                                    )}
                                    {selectedObraStat.isWithinReportingWindow && (
                                        <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">
                                            Período iniciado há menos de {REPORTING_LAG_DAYS} dias. Só será cobrado a partir de lançamentos até {formatDateToBR(selectedObraStat.reportingCutoff)}.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Histórico completo de períodos */}
                            <div>
                                <h4 className="text-xs text-gray-500 font-semibold uppercase mb-2 flex items-center gap-1.5">
                                    <FileText size={13} /> Períodos nesta obra ({selectedObraStat.periodBreakdown.length})
                                </h4>
                                <div className="rounded-xl border border-gray-100 overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 text-gray-500 text-[11px] uppercase">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Período</th>
                                                <th className="px-3 py-2 text-center">Dias c/ lançamento</th>
                                                <th className="px-3 py-2 text-center">Maior gap</th>
                                                <th className="px-3 py-2 text-left">Último lançamento</th>
                                                <th className="px-3 py-2 text-right">Horas</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {selectedObraStat.periodBreakdown.map(p => (
                                                <tr key={p.id} className={p.isOpen ? 'bg-green-50/60' : ''}>
                                                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                                                        {formatDateToBR(p.start)} → {p.end ? formatDateToBR(p.end) : <span className="text-green-600 font-semibold">hoje</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-center text-gray-600">
                                                        {p.daysWithLogs}/{p.totalDays}
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        <span className={`font-bold text-xs ${p.maxGap > GAP_THRESHOLD_DAYS ? 'text-red-600' : p.maxGap > 5 ? 'text-orange-500' : 'text-gray-500'}`}>{p.maxGap}d</span>
                                                    </td>
                                                    <td className="px-3 py-2 whitespace-nowrap">
                                                        {p.lastLog ? (
                                                            <span className="text-gray-700">
                                                                {formatDateToBR(p.lastLog)}
                                                                {p.lastLogJustificativaTipo && (
                                                                    <span className="ml-1.5 text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">
                                                                        {JUSTIFICATIVA_LABELS[p.lastLogJustificativaTipo] || p.lastLogJustificativaTipo}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        ) : (
                                                            <span className="text-red-400 font-semibold text-xs">nenhum</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-semibold text-gray-700 whitespace-nowrap">{formatDecimalToTime(p.hours)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-[11px] text-gray-400 mt-2 leading-tight">
                                    A coluna "Horas (total)" da tabela principal soma todos os períodos acima. O status e o gap consideram apenas o período mais recente.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== MODAL: DETALHES DO EQUIPAMENTO ===== */}
            {selectedMachine && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                    onClick={closeMachineModal}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}>
                        {/* Cabeçalho */}
                        <div className="flex items-start justify-between p-5 border-b border-gray-100">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-11 h-11 rounded-xl bg-yellow-100 flex items-center justify-center shrink-0">
                                    <Truck size={22} className="text-yellow-600" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-lg font-bold text-gray-800 truncate flex items-center gap-2">{selectedMachine.vehicle.registroInterno || 'Equipamento'} <TerceirizadoBadge vehicle={selectedMachine.vehicle} /></h3>
                                    <p className="text-xs text-gray-500 truncate">
                                        {selectedMachine.vehicle.tipo}
                                        {selectedMachine.vehicle.modelo ? ` · ${selectedMachine.vehicle.modelo}` : ''}
                                        {selectedMachine.vehicle.placa ? ` · ${selectedMachine.vehicle.placa}` : ''}
                                    </p>
                                </div>
                            </div>
                            <button onClick={closeMachineModal} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Corpo — informações */}
                        <div className="p-5 space-y-3">
                            {/* Última leitura no abastecimento — destaque */}
                            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Gauge size={16} className="text-yellow-600" />
                                    <span className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">
                                        Último {selectedMachine.leituraLabel} (abastecimento)
                                    </span>
                                </div>
                                {selectedMachine.ultimaLeitura !== null ? (
                                    <>
                                        <p className="text-2xl font-bold text-gray-800">
                                            {selectedMachine.ultimaLeitura.toLocaleString('pt-BR')} <span className="text-base font-semibold text-gray-500">{selectedMachine.leituraUnidade}</span>
                                        </p>
                                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                            <Fuel size={12} /> Registrado em {formatDate(selectedMachine.ultimaLeituraData)}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-sm text-gray-400 italic">Nenhuma leitura de abastecimento registrada.</p>
                                )}
                            </div>

                            {/* Grade de infos */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500 font-semibold uppercase mb-1"><MapPin size={13} /> Obra atual</div>
                                    {selectedMachine.currentObra
                                        ? <p className="text-sm font-medium text-gray-800">{formatObraNome(selectedMachine.currentObra)}</p>
                                        : selectedMachine.recentDepartureObra
                                            ? <p className="text-sm text-gray-400 italic">Saiu de: {formatObraNome(selectedMachine.recentDepartureObra)}</p>
                                            : <p className="text-sm text-gray-400 italic">Sem obra vinculada</p>}
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500 font-semibold uppercase mb-1"><User size={13} /> Operador</div>
                                    {selectedMachine.operator
                                        ? <p className="text-sm font-medium text-gray-800">{selectedMachine.operator.nome || selectedMachine.operator.name || '—'}</p>
                                        : <p className="text-sm text-gray-400 italic">Não definido</p>}
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500 font-semibold uppercase mb-1"><Clock size={13} /> Horas registradas</div>
                                    <p className="text-sm font-medium text-gray-800">
                                        {formatDecimalToTime(selectedMachine.totalHoras)}
                                        <span className="text-xs text-gray-400 font-normal"> · {selectedMachine.totalLancamentos} lançamento{selectedMachine.totalLancamentos === 1 ? '' : 's'}</span>
                                    </p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500 font-semibold uppercase mb-1"><Activity size={13} /> Último lançamento</div>
                                    {selectedMachine.lastLogDate ? (
                                        <p className="text-sm font-medium text-gray-800">
                                            {formatDate(selectedMachine.lastLogDate)}
                                            {selectedMachine.daysSinceLastLog !== null && (
                                                <span className={`text-xs font-normal ${selectedMachine.daysSinceLastLog > 7 ? 'text-red-500' : selectedMachine.daysSinceLastLog > 3 ? 'text-orange-500' : 'text-gray-400'}`}> · {selectedMachine.daysSinceLastLog}d atrás</span>
                                            )}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-red-500 font-medium">Nunca lançou</p>
                                    )}
                                </div>
                            </div>

                            {/* Ações — solicitações ao administrador */}
                            {!isViewer && (
                                <div className="pt-3 border-t border-gray-100 space-y-3">
                                    {!requestForm ? (
                                        <div className="space-y-2">
                                        {selectedMachine.operator && (
                                            <button onClick={abrirPreviewRelatorio} disabled={relatorioPreviewLoading || relatorioSubmitting}
                                                title={selectedMachine.daysSinceLastLog === null ? 'Operador nunca lançou horas' : `Cobrar lançamento (${selectedMachine.daysSinceLastLog}d pendente)`}
                                                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-sm font-bold rounded-lg transition-colors disabled:opacity-50">
                                                <FileText size={14} /> {relatorioPreviewLoading ? 'Carregando pré-visualização...' : 'Solicitar Relatório de Horas'}
                                            </button>
                                        )}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <button onClick={() => openRequestForm('obra')}
                                                className="flex items-center justify-center gap-1.5 px-3 py-2 border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 text-sm font-semibold rounded-lg transition-colors">
                                                <MapPin size={14} /> Solicitar mudança de obra
                                            </button>
                                            <button onClick={() => openRequestForm('operador')}
                                                className="flex items-center justify-center gap-1.5 px-3 py-2 border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 text-sm font-semibold rounded-lg transition-colors">
                                                <User size={14} /> Solicitar mudança de operador
                                            </button>
                                        </div>
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-gray-200 p-3 space-y-2.5 bg-gray-50">
                                            <p className="text-sm font-semibold text-gray-700">
                                                {requestForm === 'obra' ? 'Sugerir a real obra do equipamento' : 'Sugerir o real operador'}
                                            </p>
                                            <SearchableSelect
                                                items={requestForm === 'obra' ? activeObras : employees}
                                                value={requestValue?.id || ''}
                                                onChange={(item) => setRequestValue(item)}
                                                getLabel={(o) => requestForm === 'obra' ? formatObraNome(o) : (o.nome || o.name || '—')}
                                                placeholder={requestForm === 'obra' ? 'Selecione a obra...' : 'Selecione o operador...'}
                                            />
                                            <textarea
                                                value={requestObs}
                                                onChange={e => setRequestObs(e.target.value)}
                                                rows={2}
                                                placeholder="Observação (opcional)"
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none resize-none"
                                            />
                                            <div className="flex items-center gap-2 justify-end">
                                                <button onClick={() => { setRequestForm(null); setRequestValue(null); setRequestObs(''); }}
                                                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium">
                                                    Cancelar
                                                </button>
                                                <button onClick={submitOperationalRequest} disabled={!requestValue || requestSubmitting}
                                                    className="px-4 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-sm font-bold rounded-lg disabled:opacity-50 transition-colors">
                                                    {requestSubmitting ? 'Enviando...' : 'Enviar requisição'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {relatorioPreview && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !relatorioSubmitting && setRelatorioPreview(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <FileText size={18} className="text-yellow-600" />
                                Confirmar envio da cobrança
                            </h3>
                            <button onClick={() => !relatorioSubmitting && setRelatorioPreview(null)} className="text-gray-400 hover:text-gray-700 disabled:opacity-40" disabled={relatorioSubmitting}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="px-5 py-4 space-y-4">
                            <p className="text-sm text-gray-600">
                                Confira os dados antes de enviar. A cobrança será enviada por <strong>{relatorioPreview.canais.map(c => c === 'whatsapp' ? 'WhatsApp' : 'e-mail').join(' e ') || 'nenhum canal'}</strong>.
                            </p>

                            <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 space-y-2 text-sm">
                                <div className="flex items-start gap-2">
                                    <User size={14} className="text-gray-500 mt-0.5" />
                                    <div>
                                        <div className="text-xs text-gray-500">Operador</div>
                                        <div className="font-semibold text-gray-800">{relatorioPreview.operador.nome || '—'}</div>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <Phone size={14} className="text-gray-500 mt-0.5" />
                                    <div>
                                        <div className="text-xs text-gray-500">WhatsApp cadastrado</div>
                                        <div className={`font-mono ${relatorioPreview.operador.contato ? 'text-gray-800' : 'text-gray-400 italic'}`}>
                                            {relatorioPreview.operador.contato || 'não cadastrado'}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <Mail size={14} className="text-gray-500 mt-0.5" />
                                    <div>
                                        <div className="text-xs text-gray-500">E-mail cadastrado</div>
                                        <div className={relatorioPreview.operador.email ? 'text-gray-800' : 'text-gray-400 italic'}>
                                            {relatorioPreview.operador.email || 'não cadastrado'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="text-xs text-gray-500 mb-1.5 font-semibold uppercase tracking-wide">Mensagem que será enviada</div>
                                <div className="bg-white border border-gray-300 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                                    {relatorioPreview.mensagem || <span className="text-gray-400 italic">Mensagem vazia.</span>}
                                </div>
                            </div>

                            {!relatorioPreview.operador.contato && !relatorioPreview.operador.email && (
                                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg p-2.5">
                                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                                    Operador sem WhatsApp e sem e-mail. O envio falhará.
                                </div>
                            )}
                        </div>

                        <div className="px-5 py-3 border-t bg-gray-50 flex justify-end gap-2 rounded-b-xl">
                            <button onClick={() => setRelatorioPreview(null)} disabled={relatorioSubmitting}
                                className="px-4 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-100 disabled:opacity-50">
                                Cancelar
                            </button>
                            <button onClick={confirmarEnvioRelatorio} disabled={relatorioSubmitting || relatorioPreview.canais.length === 0}
                                className="flex items-center gap-1.5 px-4 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-sm font-bold rounded-lg disabled:opacity-50">
                                <Send size={14} /> {relatorioSubmitting ? 'Enviando...' : 'Confirmar e enviar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OperacionalPage;



