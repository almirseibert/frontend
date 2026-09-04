import React, { useState, useEffect, useMemo } from 'react';
import ExcavatorLoader from '../components/ui/ExcavatorLoader';
import {
    LayoutDashboard, RefreshCw, AlertCircle, Truck,
    Search, X, FileDown,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiClient from '../services/apiClient';
import ObraCard from '../components/supervisor/ObraCard';
import AllocationForecastPage from './AllocationForecastPage';

const REFRESH_INTERVAL_MS = 300000;

// Toda exibição de dinheiro passa por aqui: formato brasileiro, sempre com
// centavos — inclusive nos agregados da carteira e no PDF exportado.
const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
const STATUS_LABELS = {
    red: { label: 'Crítica', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500' },
    violet: { label: 'Atenção', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', dot: 'bg-purple-500' },
    yellow: { label: 'Em andamento', color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', dot: 'bg-yellow-400' },
    green: { label: 'Saudável', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
};
// Opções do filtro de status. 'atencao' agrega red+violet e é o mesmo número
// que a faixa da carteira anuncia como "exigem atenção".
const STATUS_FILTER_OPTIONS = [
    { id: 'todos',   label: 'Todas' },
    { id: 'atencao', label: 'Críticas e atenção' },
    { id: 'red',     label: 'Críticas' },
    { id: 'violet',  label: 'Atenção' },
    { id: 'yellow',  label: 'Em andamento' },
    { id: 'green',   label: 'Saudáveis' },
];

const SORT_OPTIONS = [
    { id: 'criticidade', label: 'Criticidade' },
    { id: 'conclusao_desc', label: 'Maior % conclusão' },
    { id: 'conclusao_asc', label: 'Menor % conclusão' },
    { id: 'prazo_asc', label: 'Menor prazo' },
    { id: 'receita_desc', label: 'Maior valor de contrato' },
    { id: 'terceiros_desc', label: 'Maior % terceirizado' },
    { id: 'nome', label: 'Nome (A-Z)' },
];

const computeObraFinance = (o) => {
    const valorTotal = Number(o.kpi?.valor_total_contrato) || 0;
    const gasto = Number(o.kpi?.total_gasto) || 0;
    const perc = Number(o.kpi?.percentual_conclusao) || 0;
    const valorProduzido = (Math.min(perc, 100) / 100) * valorTotal;
    const margem = valorProduzido - gasto;
    const margemPct = valorProduzido > 0 ? (margem / valorProduzido) * 100 : null;
    return { valorTotal, gasto, valorProduzido, margem, margemPct };
};
const STATUS_ORDER = { red: 0, violet: 1, yellow: 2, green: 3 };

// ============================================================================
// DASHBOARD DO SUPERVISOR (refatorado)
// ============================================================================
const SupervisorDashboard = ({ user, onNavigateToDetail, onNavigateToFicha }) => {
    const [obras, setObras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(new Date());
    const [viewMode, setViewMode] = useState('dashboard');

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('todos');
    const [sortBy, setSortBy] = useState('criticidade');
    const [soComTerceiros, setSoComTerceiros] = useState(false);
    const [orgaoFilter, setOrgaoFilter] = useState('todos');

    const fetchDashboardData = async () => {
        try {
            if (obras.length === 0) setLoading(true);
            const data = await apiClient.get('/supervisor/dashboard');
            setObras((data || []).filter(o => (o.tipo_registro || 'obra') !== 'centro_custo'));
            setLastUpdate(new Date());
        } catch (error) {
            console.error("Erro ao carregar dashboard:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (viewMode === 'dashboard') {
            fetchDashboardData();
            const interval = setInterval(fetchDashboardData, REFRESH_INTERVAL_MS);
            return () => clearInterval(interval);
        }
    }, [viewMode]);

    // KPIs agregados (com camada financeira e ponderação correta)
    const aggregateKpis = useMemo(() => {
        const empty = {
            total: 0, capacidadeTotal: 0, conclusaoPonderada: 0, criticas: 0,
            receitaTotal: 0, custoTotal: 0, valorProduzido: 0, margemMediaPct: 0,
            aditivoEstourado: 0, aditivoRisco: 0,
            terceirosTotal: 0, obrasComTerceiros: 0, terceirosPct: 0,
        };
        if (!obras.length) return empty;

        let capacidadeTotal = 0;
        let somaHorasPonderada = 0; // numerador da média ponderada
        let criticas = 0;
        let receitaTotal = 0;
        let custoTotal = 0;
        let valorProduzido = 0;
        let aditivoEstourado = 0;
        let aditivoRisco = 0;
        let terceirosTotal = 0;
        let obrasComTerceiros = 0;

        obras.forEach(o => {
            const horasContr = Number(o.kpi?.horas_contratadas) || 0;
            const horasExec = Number(o.kpi?.horas_executadas) || 0;
            const perc = Number(o.kpi?.percentual_conclusao) || 0;
            const fin = computeObraFinance(o);

            capacidadeTotal += horasContr;
            somaHorasPonderada += horasExec; // ponderação real: soma exec / soma contr
            if (o.kpi?.status_cor === 'red' || o.kpi?.status_cor === 'violet') criticas++;

            receitaTotal += fin.valorTotal;
            custoTotal += fin.gasto;
            valorProduzido += fin.valorProduzido;

            const vTerc = Number(o.kpi?.valor_terceiros) || 0;
            if (vTerc > 0) { terceirosTotal += vTerc; obrasComTerceiros++; }

            // Exposição a aditivo:
            // - estourado: obras com perc > 100% → R$ adicional implícito (perc-100)/100 × valorTotal
            // - em risco: obras 90-100% → soma de R$ "produzido restante até 100%"
            if (perc > 100) {
                aditivoEstourado += ((perc - 100) / 100) * fin.valorTotal;
            } else if (perc >= 90) {
                aditivoRisco += ((100 - perc) / 100) * fin.valorTotal;
            }
        });

        const conclusaoPonderada = capacidadeTotal > 0
            ? (somaHorasPonderada / capacidadeTotal) * 100
            : 0;
        const margemAbsoluta = valorProduzido - custoTotal;
        const margemMediaPct = valorProduzido > 0 ? (margemAbsoluta / valorProduzido) * 100 : 0;

        return {
            total: obras.length,
            capacidadeTotal: Math.round(capacidadeTotal),
            conclusaoPonderada: Math.round(conclusaoPonderada),
            criticas,
            receitaTotal,
            custoTotal,
            valorProduzido,
            margemAbsoluta,
            margemMediaPct,
            aditivoEstourado,
            aditivoRisco,
            terceirosTotal,
            obrasComTerceiros,
            terceirosPct: receitaTotal > 0 ? (terceirosTotal / receitaTotal) * 100 : 0,
        };
    }, [obras]);

    // Órgãos contratantes presentes na carteira, com quantas obras cada um tem.
    // Derivado dos dados — não há cadastro fechado de órgãos.
    const orgaos = useMemo(() => {
        const map = new Map();
        obras.forEach(o => {
            const nome = (o.orgao_contratante || '').trim();
            if (!nome) return;
            map.set(nome, (map.get(nome) || 0) + 1);
        });
        return Array.from(map.entries())
            .map(([nome, count]) => ({ nome, count }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [obras]);

    const semOrgaoCount = useMemo(
        () => obras.filter(o => !(o.orgao_contratante || '').trim()).length,
        [obras]
    );

    // Contagens por status. `atencao` = críticas + atenção (red + violet): é o
    // número que a faixa da carteira mostra, e agora existe como opção de filtro
    // — antes a faixa dizia 16 e o chip "Crítica" filtrava 9, contagens
    // diferentes da mesma ideia lado a lado.
    const statusCounts = useMemo(() => {
        const counts = { red: 0, violet: 0, yellow: 0, green: 0 };
        obras.forEach(o => {
            const s = o.kpi?.status_cor || 'green';
            if (counts[s] !== undefined) counts[s]++;
        });
        return { ...counts, atencao: counts.red + counts.violet };
    }, [obras]);

    const filteredAndSorted = useMemo(() => {
        const normalize = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const q = normalize(search);
        let list = obras.filter(o => {
            if (soComTerceiros && !(Number(o.kpi?.valor_terceiros) > 0)) return false;

            const orgaoObra = (o.orgao_contratante || '').trim();
            if (orgaoFilter === '__sem__') {
                if (orgaoObra) return false;
            } else if (orgaoFilter !== 'todos' && orgaoObra !== orgaoFilter) {
                return false;
            }

            const cor = o.kpi?.status_cor || 'green';
            if (statusFilter === 'atencao') {
                if (cor !== 'red' && cor !== 'violet') return false;
            } else if (statusFilter !== 'todos' && cor !== statusFilter) {
                return false;
            }
            if (!q) return true;
            return normalize(o.nome).includes(q)
                || normalize(o.orgao_contratante).includes(q)
                || normalize(o.responsavel).includes(q)
                || normalize(o.fiscal_nome).includes(q);
        });

        const cmp = {
            criticidade: (a, b) => (STATUS_ORDER[a.kpi?.status_cor] ?? 9) - (STATUS_ORDER[b.kpi?.status_cor] ?? 9)
                || (b.kpi?.percentual_conclusao || 0) - (a.kpi?.percentual_conclusao || 0),
            conclusao_desc: (a, b) => (b.kpi?.percentual_conclusao || 0) - (a.kpi?.percentual_conclusao || 0),
            conclusao_asc: (a, b) => (a.kpi?.percentual_conclusao || 0) - (b.kpi?.percentual_conclusao || 0),
            prazo_asc: (a, b) => (a.kpi?.dias_restantes_estimados ?? 99999) - (b.kpi?.dias_restantes_estimados ?? 99999),
            receita_desc: (a, b) => (Number(b.kpi?.valor_total_contrato) || 0) - (Number(a.kpi?.valor_total_contrato) || 0),
            terceiros_desc: (a, b) => (Number(b.kpi?.percentual_terceirizado) || 0) - (Number(a.kpi?.percentual_terceirizado) || 0)
                || (Number(b.kpi?.valor_terceiros) || 0) - (Number(a.kpi?.valor_terceiros) || 0),
            nome: (a, b) => (a.nome || '').localeCompare(b.nome || ''),
        }[sortBy];

        return [...list].sort(cmp);
    }, [obras, search, statusFilter, sortBy, soComTerceiros, orgaoFilter]);


    // Porta de entrada da Ficha da Obra: o card de criticidade abre a Visão geral
    // consolidada (que substitui o antigo detalhe por-obra). Mantém fallback ao
    // detalhe legado se a Ficha não estiver disponível.
    const handleCardClick = (obraId) => {
        if (onNavigateToFicha) onNavigateToFicha(obraId);
        else if (onNavigateToDetail) onNavigateToDetail(obraId);
    };

    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });
        const now = new Date().toLocaleString('pt-BR');

        doc.setFontSize(14);
        doc.text('Gestão de Obras — Análise Gerencial', 40, 40);
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Emitido em ${now} • ${aggregateKpis.total} obras ativas`, 40, 56);

        // KPIs em texto
        const kpiLine = [
            `Valor contratado: ${fmtBRL(aggregateKpis.receitaTotal)}`,
            `Comprometido com terceiros: ${fmtBRL(aggregateKpis.terceirosTotal)} (${aggregateKpis.terceirosPct.toFixed(1)}%)`,
            `Custo realizado: ${fmtBRL(aggregateKpis.custoTotal)}`,
            `Valor produzido: ${fmtBRL(aggregateKpis.valorProduzido)}`,
            `Margem média: ${aggregateKpis.margemMediaPct.toFixed(1)}%`,
            `Conclusão ponderada: ${aggregateKpis.conclusaoPonderada}%`,
            `Aditivo estourado: ${fmtBRL(aggregateKpis.aditivoEstourado)}`,
            `Em risco de aditivo: ${fmtBRL(aggregateKpis.aditivoRisco)}`,
            `Obras críticas: ${aggregateKpis.criticas}`,
        ].join('   |   ');
        doc.setTextColor(40);
        doc.setFontSize(8);
        const wrapped = doc.splitTextToSize(kpiLine, doc.internal.pageSize.getWidth() - 80);
        doc.text(wrapped, 40, 76);

        const rows = filteredAndSorted.map(o => {
            const f = computeObraFinance(o);
            const status = STATUS_LABELS[o.kpi?.status_cor || 'green']?.label || '—';
            return [
                o.nome || '—',
                o.orgao_contratante || '—',
                status,
                `${(o.kpi?.percentual_conclusao || 0).toFixed(1)}%`,
                `${Math.round(o.kpi?.horas_executadas || 0)} / ${Math.round(o.kpi?.horas_contratadas || 0)}`,
                fmtBRL(f.valorTotal),
                Number(o.kpi?.valor_terceiros) > 0
                    ? `${fmtBRL(o.kpi.valor_terceiros)} (${(Number(o.kpi.percentual_terceirizado) || 0).toFixed(0)}%)`
                    : '—',
                fmtBRL(f.gasto),
                f.margemPct === null ? '—' : `${f.margemPct.toFixed(0)}%`,
                o.kpi?.dias_restantes_estimados ? `${o.kpi.dias_restantes_estimados} d` : '—',
            ];
        });

        autoTable(doc, {
            startY: 100,
            head: [['Obra', 'Órgão', 'Status', '% Conc.', 'Horas (exec/contr)', 'Contrato', 'Terceiros', 'Gasto', 'Margem', 'Prazo']],
            body: rows,
            styles: { fontSize: 8, cellPadding: 4 },
            headStyles: { fillColor: [30, 41, 59], textColor: 255 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                3: { halign: 'right' },
                4: { halign: 'right' },
                5: { halign: 'right' },
                6: { halign: 'right' },
                7: { halign: 'right' },
                8: { halign: 'right' },
                9: { halign: 'right' },
            },
        });

        doc.save(`gestao-obras-${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    if (viewMode === 'allocations') return <AllocationForecastPage onBack={() => setViewMode('dashboard')} />;

    const renderGrid = (list) => (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            {list.map((obra) => (
                <div key={obra.id} className="h-full transform transition-all hover:-translate-y-1">
                    <ObraCard
                        obra={obra}
                        onClick={() => handleCardClick(obra.id)}
                    />
                </div>
            ))}
        </div>
    );


    return (
        <div className="bg-slate-100 min-h-screen p-6 animate-fade-in">
            {/* Header com título + ações */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <LayoutDashboard className="text-blue-600" />
                        Gestão de Obras
                    </h1>
                    <p className="text-slate-500 text-xs mt-1">
                        Atualizado às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>

                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={handleExportPDF}
                        className="bg-white text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-bold shadow-sm border border-slate-200 flex items-center gap-2 transition-colors"
                        title="Exportar relatório em PDF"
                    >
                        <FileDown size={18} /> Exportar PDF
                    </button>
                    <button
                        onClick={() => setViewMode('allocations')}
                        className="bg-white text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-bold shadow-sm border border-slate-200 flex items-center gap-2 transition-colors"
                    >
                        <Truck size={18} /> Previsão de Desmobilização
                    </button>
                    <button
                        onClick={fetchDashboardData}
                        className="bg-white p-2 rounded-lg text-slate-600 hover:text-blue-600 shadow-sm border border-slate-200"
                        title="Atualizar agora"
                    >
                        <RefreshCw size={20} />
                    </button>
                </div>
            </div>

            {/* ── Carteira (leitura) ───────────────────────────────────────────
                Estado do negócio: uma linha, tabular, sem ícone e sem cor.
                Nada aqui é controle — os controles vivem na faixa de baixo. */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-3 mb-3">
                <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 tabular-nums">
                    <span className="text-sm text-slate-600">
                        <b className="text-slate-900">{aggregateKpis.total}</b> obras ativas
                        {aggregateKpis.criticas > 0 && (
                            <span className="text-slate-400"> · {aggregateKpis.criticas} exigem atenção</span>
                        )}
                    </span>
                    <span className="text-sm text-slate-600">
                        <b className="text-slate-900">{fmtBRL(aggregateKpis.receitaTotal)}</b> em contratos
                    </span>
                    <span className="text-sm text-slate-600">
                        <b className="text-orange-700">{fmtBRL(aggregateKpis.terceirosTotal)}</b> com terceiros
                        <span className="text-slate-400"> · {aggregateKpis.terceirosPct.toFixed(0)}% da carteira</span>
                    </span>
                    <span className="text-sm text-slate-600">
                        <b className="text-slate-900">{aggregateKpis.capacidadeTotal.toLocaleString('pt-BR')} h</b> contratadas
                        <span className="text-slate-400"> · {aggregateKpis.conclusaoPonderada}% concluído</span>
                    </span>
                </div>
            </div>

            {/* ── Controles (ferramenta) ───────────────────────────────────────
                Busca + dois seletores de forma idêntica + contador de resultado.
                Os chips de status viraram dropdown, e o agrupamento saiu junto
                com a quebra da página em seções — a ordenação só faz sentido
                sobre uma lista inteira. */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-3 py-2 mb-6 flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar obra, órgão, responsável…"
                        className="w-full pl-8 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:bg-white outline-none"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                            <X size={14} />
                        </button>
                    )}
                </div>

                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    Órgão
                    <select
                        value={orgaoFilter}
                        onChange={(e) => setOrgaoFilter(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 px-2 py-1.5 outline-none focus:border-blue-500 max-w-[200px]"
                    >
                        <option value="todos">Todos ({obras.length})</option>
                        {orgaos.map(o => (
                            <option key={o.nome} value={o.nome}>{o.nome} ({o.count})</option>
                        ))}
                        {semOrgaoCount > 0 && (
                            <option value="__sem__">Sem órgão ({semOrgaoCount})</option>
                        )}
                    </select>
                </label>

                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    Status
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 px-2 py-1.5 outline-none focus:border-blue-500"
                    >
                        {STATUS_FILTER_OPTIONS.map(o => (
                            <option key={o.id} value={o.id}>
                                {o.label} ({o.id === 'todos' ? obras.length : statusCounts[o.id] || 0})
                            </option>
                        ))}
                    </select>
                </label>

                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    Ordenar
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 px-2 py-1.5 outline-none focus:border-blue-500"
                    >
                        {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                </label>

                {/* Recorte da carteira terceirizada: filtro de uma pergunta só,
                    por isso alternador e não mais uma opção enterrada num select. */}
                <label
                    className={`flex items-center gap-2 text-xs font-medium cursor-pointer select-none px-2.5 py-1.5 rounded-lg border transition-colors ${
                        soComTerceiros
                            ? 'bg-orange-50 border-orange-200 text-orange-800'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                    title="Mostrar apenas obras com contrato de terceiro ativo"
                >
                    <input
                        type="checkbox"
                        checked={soComTerceiros}
                        onChange={(e) => setSoComTerceiros(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                    />
                    Possui terceiro
                    <span className={soComTerceiros ? 'text-orange-600' : 'text-slate-400'}>
                        ({aggregateKpis.obrasComTerceiros})
                    </span>
                </label>

                <span className="ml-auto text-xs text-slate-500 tabular-nums pr-1">
                    {filteredAndSorted.length === obras.length
                        ? `${obras.length} obras`
                        : `${filteredAndSorted.length} de ${obras.length} obras`}
                </span>
            </div>

            {/* Conteúdo */}
            {loading ? (
                <div className="flex flex-col items-center justify-center h-64">
                    <ExcavatorLoader size="sm" text="Calculando previsões..." />
                </div>
            ) : filteredAndSorted.length === 0 ? (
                <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
                    <AlertCircle size={64} className="mx-auto mb-4 opacity-20" />
                    <p className="text-lg">{obras.length === 0 ? 'Nenhuma obra ativa encontrada.' : 'Nenhuma obra corresponde aos filtros.'}</p>
                    {obras.length > 0 && (
                        <button onClick={() => { setSearch(''); setStatusFilter('todos'); setSoComTerceiros(false); setOrgaoFilter('todos'); }} className="mt-3 text-blue-600 hover:underline text-sm font-bold">
                            Limpar filtros
                        </button>
                    )}
                </div>
            ) : (
                renderGrid(filteredAndSorted)
            )}

        </div>
    );
};

export default SupervisorDashboard;
