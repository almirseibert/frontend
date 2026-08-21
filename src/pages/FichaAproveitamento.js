import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import apiClient from '../services/apiClient';

// ─────────────────────────────────────────────────────────────────────────────
// Ficha da Obra — aba "Aproveitamento" (Fase 2)
//
// Detalhe que não cabe na leitura em Z da Visão geral: produção diária vs.
// capacidade líquida, ranking por categoria e por máquina, e ticket médio
// editável (simulação de "quanto eu poderia faturar" — por isso vive aqui, não
// na linha de decisão da Visão geral).
//
// Reusa o mesmo objeto `analytics` (GET /supervisor/analytics) já buscado pela
// Ficha, escopado ao período operacional da obra. Ticket médio persiste em
// /supervisor/tickets, exatamente como a tela Aproveitamento Produtivo.
//
// Paleta e helpers duplicados de propósito (poucos tokens) para manter esta aba
// isolada da Visão geral — evita refatorar a página que já está validada.
// ─────────────────────────────────────────────────────────────────────────────

const C = {
    bg: '#f5f3ef', surface: '#ffffff', border: '#e5e0d8',
    ink: '#1e1a14', inkMid: '#5a4e3a', inkSub: '#9a8c7a',
    gold: '#9E7A42', goldSoft: '#e7dcc6',
    green: '#2e7d5b', red: '#b03828',
};

const fmtBRL = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
const fmtH   = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`);
const fmtPct = (v, dec = 0) => (v == null || Number.isNaN(v) ? '—' : `${Number(v).toFixed(dec)}%`);

const fmtDataCurta = (iso) => {
    if (!iso) return '—';
    const [, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}`;
};

// Datas locais (sem UTC) — mesma régua da FichaObraPage.
const todayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDays = (iso, n) => {
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const TICKET_PADRAO = 120; // R$/h — mesmo default da tela Aproveitamento Produtivo

// Opção A só faz sentido numa janela recente: sobre a obra inteira, uma máquina
// que chegou semana passada recebe capacidade de meses e aparece ociosa. Por isso
// o padrão é 30 dias, com opção de ampliar.
const PERIODOS = [
    { id: '30', label: 'Últimos 30 dias', dias: 30 },
    { id: '90', label: 'Últimos 90 dias', dias: 90 },
    { id: 'obra', label: 'Obra inteira', dias: null },
];

// ── Blocos ────────────────────────────────────────────────────────────────────
function Card({ title, right, children }) {
    return (
        <div className="rounded-xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            {(title || right) && (
                <div className="flex items-center justify-between mb-3">
                    <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.inkSub }}>{title}</h3>
                    {right}
                </div>
            )}
            {children}
        </div>
    );
}

function Kpi({ label, value, sub }) {
    return (
        <div className="rounded-xl p-3.5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.inkSub }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, lineHeight: 1.2, marginTop: 4 }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: C.inkSub, marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

// Barra de aproveitamento monocromática (sem semáforo — mantém a calma da Ficha).
function UtilBar({ pct }) {
    const w = Math.min(Math.max(pct || 0, 0), 100);
    return (
        <div className="w-full h-2 rounded-full" style={{ background: C.bg }}>
            <div className="h-2 rounded-full" style={{ width: `${w}%`, background: C.gold }} />
        </div>
    );
}

function Th({ children, right, center }) {
    return (
        <th style={{ padding: '6px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.inkSub, textAlign: right ? 'right' : center ? 'center' : 'left' }}>
            {children}
        </th>
    );
}

// ── Gráfico: produção diária vs. capacidade ───────────────────────────────────
function GraficoDiario({ chartData = [], capDiaria = 0 }) {
    if (!chartData.length) {
        return <p style={{ fontSize: 12.5, color: C.inkSub }}>Sem produção registrada no período.</p>;
    }
    const maxVal = Math.max(capDiaria, ...chartData.map(d => d.horas_faturadas || 0), 10) * 1.15;
    const capBottom = maxVal > 0 ? (capDiaria / maxVal) * 100 : 0;

    return (
        <div>
            {/* overflow-y hidden é obrigatório: só overflow-x:auto faz o CSS promover
                o eixo Y a auto e criar uma barra de rolagem vertical fantasma. */}
            <div className="relative flex items-end gap-1 overflow-x-auto overflow-y-hidden" style={{ height: 220, borderBottom: `1px solid ${C.border}`, borderLeft: `1px solid ${C.border}`, padding: '10px 4px 0' }}>
                {capDiaria > 0 && (
                    <div className="absolute left-0 w-full pointer-events-none" style={{ bottom: `${capBottom}%`, borderTop: `2px dashed ${C.goldSoft}` }} />
                )}
                {chartData.map((d, i) => {
                    const height = maxVal > 0 ? (d.horas_faturadas / maxVal) * 100 : 0;
                    const fim = !d.is_business_day;
                    return (
                        <div key={i} className="flex-1 flex flex-col justify-end items-center relative group" style={{ height: '100%', minWidth: 18 }}>
                            <div className="w-full rounded-t" title={`${d.date}: ${fmtH(d.horas_faturadas)}`}
                                style={{ maxWidth: 34, height: `${height}%`, minHeight: d.horas_faturadas > 0 ? 3 : 0, background: fim ? C.border : C.gold, opacity: 0.9 }} />
                            <span style={{ fontSize: 8.5, color: C.inkSub, marginTop: 4, height: 12 }}>{String(d.date).slice(8, 10)}</span>
                        </div>
                    );
                })}
            </div>
            <div className="flex items-center gap-4 mt-3 flex-wrap" style={{ fontSize: 10.5, color: C.inkSub }}>
                <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 2, background: C.gold, display: 'inline-block' }} /> Horas apontadas</span>
                <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 2, background: C.border, display: 'inline-block' }} /> Fim de semana (capacidade zero)</span>
                {capDiaria > 0 && (
                    <span className="flex items-center gap-1.5">
                        <span style={{ width: 14, height: 0, borderTop: `2px dashed ${C.goldSoft}`, display: 'inline-block' }} />
                        Jornada base: {capDiaria}h/dia ({capDiaria / 8} máq. × 8h)
                    </span>
                )}
            </div>
            <p style={{ fontSize: 10.5, color: C.inkSub, marginTop: 8, fontStyle: 'italic', lineHeight: 1.5 }}>
                A linha é a jornada base de 8h/máquina, não um teto: em dia cheio as máquinas passam disso (turno longo),
                por isso a barra a supera. O aproveitamento do período fica abaixo de 100% porque os dias sem apontamento
                (vãos no gráfico) puxam a média para baixo.
            </p>
        </div>
    );
}

// ── Componente principal ──────────────────────────────────────────────────────
// Busca o próprio `analytics` (janela selecionável), independente da Visão geral —
// aqui a pergunta é operacional ("as máquinas que tenho estão ociosas AGORA?"),
// então a janela recente é o padrão.
const FichaAproveitamento = ({ obraId, dataInicio, setAlertMessage }) => {
    const [periodo, setPeriodo] = useState('30');
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState(null);

    const [ticket, setTicket] = useState({});
    const [unsaved, setUnsaved] = useState(false);
    const [saving, setSaving] = useState(false);

    // Janela: N dias atrás → hoje, sem recuar antes do início operacional.
    const janela = useMemo(() => {
        const hoje = todayLocal();
        const p = PERIODOS.find(x => x.id === periodo) || PERIODOS[0];
        let inicio;
        if (p.dias == null) {
            inicio = dataInicio || addDays(hoje, -45);
        } else {
            inicio = addDays(hoje, -(p.dias - 1));
            if (dataInicio && dataInicio > inicio) inicio = dataInicio; // não recua antes da obra
        }
        return { startDate: inicio, endDate: hoje };
    }, [periodo, dataInicio]);

    useEffect(() => {
        if (!obraId) return;
        let vivo = true;
        setLoading(true);
        setErro(null);
        apiClient.getObraAnalytics(obraId, janela)
            .then((r) => { if (vivo) setAnalytics(r); })
            .catch((e) => { if (vivo) { setAnalytics(null); setErro(e.message || 'Aproveitamento indisponível.'); } })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [obraId, janela]);

    // Carrega tickets salvos e completa os tipos presentes com o default.
    useEffect(() => {
        let vivo = true;
        apiClient.get('/supervisor/tickets')
            .then((salvos) => {
                if (!vivo) return;
                const base = { ...(salvos || {}) };
                (analytics?.frotaPorTipo || []).forEach(c => {
                    if (base[c.tipo] === undefined) base[c.tipo] = TICKET_PADRAO;
                });
                setTicket(base);
                setUnsaved(false);
            })
            .catch(() => { /* sem tickets salvos — segue com defaults ao editar */ });
        return () => { vivo = false; };
    }, [analytics?.frotaPorTipo]);

    const onTicketChange = (tipo, value) => {
        setTicket(prev => ({ ...prev, [tipo]: Number(value) || 0 }));
        setUnsaved(true);
    };

    const salvar = async () => {
        setSaving(true);
        try {
            await apiClient.post('/supervisor/tickets', { tickets: ticket });
            setUnsaved(false);
            setAlertMessage?.('Tickets médios salvos.');
        } catch (e) {
            setAlertMessage?.('Erro ao salvar os tickets médios.');
        } finally {
            setSaving(false);
        }
    };

    const s = analytics?.summary;
    const categorias = useMemo(
        () => [...(analytics?.frotaPorTipo || [])].sort((a, b) => a.aproveitamento - b.aproveitamento),
        [analytics]
    );
    const veiculos = useMemo(
        () => (analytics?.porVeiculo || []).filter(v => v.estado !== 'sucata'),
        [analytics]
    );

    if (loading && !analytics) {
        return (
            <div className="flex items-center justify-center py-16" style={{ color: C.inkSub, fontSize: 13 }}>
                <RefreshCw size={16} className="animate-spin mr-2" /> Calculando aproveitamento…
            </div>
        );
    }
    if (erro && !analytics) {
        return <div className="rounded-xl px-4 py-3" style={{ background: '#fdf0ec', border: '1px solid #f2c9bf', color: C.red, fontSize: 13 }}>{erro}</div>;
    }
    if (!analytics) {
        return <p style={{ fontSize: 13, color: C.inkSub }}>Sem dados de aproveitamento para esta obra.</p>;
    }

    return (
        <div className="space-y-4">
            {/* Seletor de janela — Opção A pede período recente */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1">
                    {PERIODOS.map((p) => {
                        const ativo = p.id === periodo;
                        return (
                            <button key={p.id} onClick={() => setPeriodo(p.id)}
                                style={{
                                    fontSize: 12.5, fontWeight: ativo ? 700 : 500,
                                    color: ativo ? '#fff' : C.inkMid,
                                    background: ativo ? C.gold : 'transparent',
                                    border: `1px solid ${ativo ? C.gold : C.border}`,
                                    padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                                }}>
                                {p.label}
                            </button>
                        );
                    })}
                </div>
                <span style={{ fontSize: 11, color: C.inkSub }}>
                    {fmtDataCurta(janela.startDate)}–{fmtDataCurta(janela.endDate)}
                    {loading && ' · atualizando…'}
                </span>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi label="Aproveitamento" value={fmtPct(s.aproveitamento)} sub="horas ÷ capacidade líquida" />
                <Kpi label="Capacidade líquida" value={fmtH(s.capPeriodoLiquida)} sub="no período da obra" />
                <Kpi label="Horas apontadas" value={fmtH(s.horasExecutadas)} />
                <Kpi label="Horas ociosas" value={fmtH(s.horasPerdidasTotal)} sub="capacidade não usada" />
            </div>

            {/* Produção diária vs capacidade */}
            <Card title="Produção diária vs. capacidade">
                <GraficoDiario chartData={analytics.chartData} capDiaria={s.capDiariaLiquida} />
            </Card>

            {/* Ranking por categoria */}
            <Card title="Aproveitamento por categoria" right={<span style={{ fontSize: 11, color: C.inkSub }}>pior → melhor</span>}>
                {categorias.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: C.inkSub }}>Nenhuma categoria com frota nesta obra.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                    <Th>Categoria</Th><Th center>Máquinas</Th><Th right>Apontadas</Th>
                                    <Th>Aproveitamento</Th><Th right>Ociosas</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {categorias.map((c) => (
                                    <tr key={c.tipo} style={{ borderBottom: `1px solid ${C.border}` }}>
                                        <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 700, color: C.ink }}>{c.tipo}</td>
                                        <td style={{ padding: '8px 10px', fontSize: 12.5, textAlign: 'center', color: C.inkMid }}>
                                            {c.qtd}{c.qtdManutencao > 0 && <span style={{ color: C.inkSub, fontSize: 11 }}> ({c.qtdManutencao} em manut.)</span>}
                                        </td>
                                        <td style={{ padding: '8px 10px', fontSize: 13, textAlign: 'right', color: C.ink }}>{fmtH(c.horas_executadas)}</td>
                                        <td style={{ padding: '8px 10px', width: '28%' }}>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1"><UtilBar pct={c.aproveitamento} /></div>
                                                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, minWidth: 44, textAlign: 'right' }}>{c.capPeriodo > 0 ? fmtPct(c.aproveitamento) : '—'}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '8px 10px', fontSize: 12.5, textAlign: 'right', color: C.inkMid }}>{fmtH(c.horas_perdidas)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Ranking por máquina */}
            <Card title="Aproveitamento por máquina" right={<span style={{ fontSize: 11, color: C.inkSub }}>pior → melhor</span>}>
                {veiculos.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: C.inkSub }}>Nenhum veículo alocado nesta obra.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                    <Th>Veículo</Th><Th>Categoria</Th><Th right>Apontadas</Th><Th>Aproveitamento</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {veiculos.map((v) => (
                                    <tr key={v.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                                        <td style={{ padding: '8px 10px', fontSize: 13 }}>
                                            <span style={{ fontWeight: 700, color: C.ink }}>{v.registroInterno || '—'}</span>
                                            {v.modelo && <span style={{ color: C.inkSub, marginLeft: 6, fontSize: 12 }}>{v.modelo}</span>}
                                            {v.estado === 'manutencao' && <span style={{ color: C.inkSub, marginLeft: 6, fontSize: 11 }}>· em manutenção</span>}
                                        </td>
                                        <td style={{ padding: '8px 10px', fontSize: 12.5, color: C.inkMid }}>{v.tipo || '—'}</td>
                                        <td style={{ padding: '8px 10px', fontSize: 13, textAlign: 'right', color: C.ink }}>{fmtH(v.horas_executadas)}</td>
                                        <td style={{ padding: '8px 10px', width: '28%' }}>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1"><UtilBar pct={v.aproveitamento} /></div>
                                                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, minWidth: 44, textAlign: 'right' }}>{v.capPeriodo > 0 ? fmtPct(v.aproveitamento) : '—'}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Ticket médio editável → simulação de faturamento */}
            <Card
                title="Ticket médio por categoria (simulação)"
                right={unsaved ? (
                    <button onClick={salvar} disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold"
                        style={{ background: C.gold, color: '#fff' }}>
                        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} Salvar tickets
                    </button>
                ) : null}
            >
                {categorias.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: C.inkSub }}>Sem categorias para simular.</p>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                        <Th>Categoria</Th><Th center>Ticket (R$/h)</Th>
                                        <Th right>Faturado (apontado)</Th><Th right>Potencial (capacidade)</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {categorias.map((c) => {
                                        const t = ticket[c.tipo] ?? TICKET_PADRAO;
                                        return (
                                            <tr key={c.tipo} style={{ borderBottom: `1px solid ${C.border}` }}>
                                                <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 700, color: C.ink }}>{c.tipo}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                    <input type="number" min="0" value={t}
                                                        onChange={(e) => onTicketChange(c.tipo, e.target.value)}
                                                        className="w-24 p-1.5 rounded text-sm text-right"
                                                        style={{ border: `1px solid ${C.border}`, outline: 'none' }} />
                                                </td>
                                                <td style={{ padding: '8px 10px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: C.ink }}>{fmtBRL(c.horas_executadas * t)}</td>
                                                <td style={{ padding: '8px 10px', fontSize: 13, textAlign: 'right', color: C.inkMid }}>{fmtBRL(c.capPeriodo * t)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p style={{ fontSize: 10.5, color: C.inkSub, marginTop: 10, fontStyle: 'italic' }}>
                            Simulação: "quanto se poderia faturar" a este ticket. Não é o faturamento realizado da Visão geral.
                        </p>
                    </>
                )}
            </Card>
        </div>
    );
};

export default FichaAproveitamento;
