import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import apiClient from '../services/apiClient';

// ─────────────────────────────────────────────────────────────────────────────
// Ficha da Obra — aba "Faturamento" (Fase 3) — "o que dá para cobrar"
//
// Comparativo contratado × apontado por tipo de equipamento, com a dimensão R$
// (horas apontadas × valor unitário do contrato). Base de horas: daily logs da
// obra (mesma fonte do Relatório de Faturamento). Base de preço: obra.valores-
// PorTipo — o mesmo `totalRS` que a projeção calcula. Cobre também o desloca-
// mento (caminhão prancha) e contratos por m²/km (setores).
//
// Sem endpoint novo. Paleta/helpers duplicados de propósito (aba isolada).
// ─────────────────────────────────────────────────────────────────────────────

const C = {
    bg: '#f5f3ef', surface: '#ffffff', border: '#e5e0d8',
    ink: '#1e1a14', inkMid: '#5a4e3a', inkSub: '#9a8c7a',
    gold: '#9E7A42', red: '#b03828',
};

const fmtBRL = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
const fmtBRLh = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const fmtH   = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`);
const fmtPct = (v, dec = 0) => (v == null || Number.isNaN(v) ? '—' : `${Number(v).toFixed(dec)}%`);
const fmtNum = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

const parseMaybe = (v) => {
    if (v == null) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (_) { return {}; }
};

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

function Th({ children, right, center }) {
    return (
        <th style={{ padding: '6px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.inkSub, textAlign: right ? 'right' : center ? 'center' : 'left' }}>
            {children}
        </th>
    );
}

function Td({ children, right, center, bold, color }) {
    return (
        <td style={{ padding: '8px 10px', fontSize: 13, textAlign: right ? 'right' : center ? 'center' : 'left', fontWeight: bold ? 700 : 400, color: color || C.ink }}>
            {children}
        </td>
    );
}

// ── Componente principal ──────────────────────────────────────────────────────
const FichaFaturamento = ({ obra, vehicles = [], obraId }) => {
    const [logs, setLogs] = useState(null);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState(null);

    useEffect(() => {
        let vivo = true;
        setLoading(true); setErro(null);
        apiClient.getDailyLogs(obraId)
            .then((data) => { if (vivo) setLogs(Array.isArray(data) ? data : []); })
            .catch((e) => { if (vivo) { setLogs([]); setErro(e.message || 'Erro ao carregar apontamentos.'); } })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [obraId]);

    const contractType = obra?.contractType || 'horas';

    // Horas apontadas por tipo (grupo), a partir dos daily logs + tipo do veículo.
    const execPorTipo = useMemo(() => {
        const vMap = new Map(vehicles.map(v => [String(v.id), v]));
        const acc = {};
        (logs || []).forEach(log => {
            const v = vMap.get(String(log.vehicleId));
            const tipo = v ? (v.tipo || 'Outros') : 'Outros';
            const h = parseFloat(log.totalHours !== undefined ? log.totalHours : log.total_hours) || 0;
            acc[tipo] = (acc[tipo] || 0) + h;
        });
        return acc;
    }, [logs, vehicles]);

    // Linhas por tipo (união contrato + apontado) para contrato por horas.
    const dadosHoras = useMemo(() => {
        const contratadas = parseMaybe(obra?.horasContratadasPorTipo);
        const valores = parseMaybe(obra?.valoresPorTipo);
        const tipos = Array.from(new Set([...Object.keys(contratadas), ...Object.keys(execPorTipo)])).sort();

        const linhas = tipos.map(tipo => {
            const cont = parseFloat(contratadas[tipo]) || 0;
            const exec = execPorTipo[tipo] || 0;
            const unit = parseFloat(valores[tipo]) || 0;
            return {
                tipo, cont, exec, unit,
                valorContratado: cont * unit,
                valorFaturado: exec * unit,
                pct: cont > 0 ? (exec / cont) * 100 : null,
                foraContrato: cont === 0 && exec > 0,
            };
        });

        // Deslocamento (caminhão prancha) — só valor contratado (km executado não é rastreado aqui).
        const kmPrancha = parseFloat(obra?.kmContratadoPrancha) || 0;
        const valorKm = parseFloat(obra?.valorKmPrancha) || 0;
        const pranchaContratado = kmPrancha * valorKm;

        const totalContratadoRS = linhas.reduce((s, l) => s + l.valorContratado, 0) + pranchaContratado;
        const totalFaturadoRS = linhas.reduce((s, l) => s + l.valorFaturado, 0);

        return { linhas, kmPrancha, valorKm, pranchaContratado, totalContratadoRS, totalFaturadoRS };
    }, [obra, execPorTipo]);

    // Contrato por m²/km (setores).
    const dadosSetores = useMemo(() => {
        const sectors = Array.isArray(obra?.sectors) ? obra.sectors : parseMaybe(obra?.sectors);
        const arr = Array.isArray(sectors) ? sectors : [];
        const linhas = arr.map(s => {
            const qtdCont = parseFloat(s.kmContratado) || 0;
            const qtdFeito = parseFloat(s.kmConcluido) || 0;
            const price = parseFloat(s.price) || 0;
            return {
                name: s.name || '—', qtdCont, qtdFeito, price,
                valorContratado: qtdCont * price,
                valorProduzido: qtdFeito * price,
                pct: qtdCont > 0 ? (qtdFeito / qtdCont) * 100 : null,
            };
        });
        const totalContratadoRS = linhas.reduce((s, l) => s + l.valorContratado, 0);
        const totalProduzidoRS = linhas.reduce((s, l) => s + l.valorProduzido, 0);
        return { linhas, totalContratadoRS, totalProduzidoRS };
    }, [obra]);

    const valorContrato = parseFloat(obra?.valorTotalContrato) || null;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16" style={{ color: C.inkSub, fontSize: 13 }}>
                <RefreshCw size={16} className="animate-spin mr-2" /> Carregando faturamento…
            </div>
        );
    }

    // ── Contrato por m²/km ────────────────────────────────────────────────────
    if (contractType === 'metrosQuadrados') {
        const s = dadosSetores;
        const saldo = valorContrato != null ? valorContrato - s.totalProduzidoRS : null;
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    <Kpi label="Valor de contrato" value={fmtBRL(valorContrato)} />
                    <Kpi label="Produzido (a cobrar)" value={fmtBRL(s.totalProduzidoRS)} />
                    <Kpi label="Saldo a faturar" value={saldo != null ? fmtBRL(saldo) : '—'} />
                </div>
                <Card title="Faturamento por setor / trecho (m² / km)">
                    {s.linhas.length === 0 ? (
                        <p style={{ fontSize: 12.5, color: C.inkSub }}>Nenhum setor cadastrado no contrato.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                        <Th>Setor</Th><Th right>Contratado</Th><Th right>Concluído</Th>
                                        <Th right>Preço unit.</Th><Th right>A cobrar</Th><Th right>% exec.</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {s.linhas.map((l, i) => (
                                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                                            <Td bold>{l.name}</Td>
                                            <Td right color={C.inkMid}>{fmtNum(l.qtdCont)}</Td>
                                            <Td right>{fmtNum(l.qtdFeito)}</Td>
                                            <Td right color={C.inkMid}>{fmtBRLh(l.price)}</Td>
                                            <Td right bold>{fmtBRL(l.valorProduzido)}</Td>
                                            <Td right color={C.inkMid}>{fmtPct(l.pct, 1)}</Td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>
        );
    }

    // ── Contrato por horas ────────────────────────────────────────────────────
    const h = dadosHoras;
    const saldoRS = valorContrato != null ? valorContrato - h.totalFaturadoRS : null;
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <Kpi label="Valor de contrato" value={fmtBRL(valorContrato)} />
                <Kpi label="Faturado até agora" value={fmtBRL(h.totalFaturadoRS)} sub="horas apontadas × valor" />
                <Kpi label="Saldo a faturar" value={saldoRS != null ? fmtBRL(saldoRS) : '—'} />
            </div>

            {erro && (
                <div className="rounded-xl px-4 py-3" style={{ background: '#fdf0ec', border: '1px solid #f2c9bf', color: C.red, fontSize: 13 }}>{erro}</div>
            )}

            <Card title="Contratado × faturado por equipamento">
                {h.linhas.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: C.inkSub }}>Sem equipamentos contratados ou apontados nesta obra.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                    <Th>Equipamento</Th><Th right>Contratadas</Th><Th right>Apontadas</Th>
                                    <Th right>R$/h</Th><Th right>Faturado</Th><Th right>% exec.</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {h.linhas.map((l) => (
                                    <tr key={l.tipo} style={{ borderBottom: `1px solid ${C.border}` }}>
                                        <Td bold color={l.foraContrato ? C.red : C.ink}>
                                            {l.tipo}{l.foraContrato && <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6 }}>fora do contrato</span>}
                                        </Td>
                                        <Td right color={C.inkMid}>{l.cont > 0 ? fmtH(l.cont) : '—'}</Td>
                                        <Td right>{fmtH(l.exec)}</Td>
                                        <Td right color={C.inkMid}>{l.unit > 0 ? fmtBRLh(l.unit) : '—'}</Td>
                                        <Td right bold>{fmtBRL(l.valorFaturado)}</Td>
                                        <Td right color={C.inkMid}>{fmtPct(l.pct, 1)}</Td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: `2px solid ${C.border}` }}>
                                    <Td bold>Total</Td>
                                    <Td right />
                                    <Td right bold>{fmtH(h.linhas.reduce((s, l) => s + l.exec, 0))}</Td>
                                    <Td right />
                                    <Td right bold>{fmtBRL(h.totalFaturadoRS)}</Td>
                                    <Td right />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </Card>

            {h.kmPrancha > 0 && (
                <Card title="Deslocamento (caminhão prancha)">
                    <div className="flex flex-wrap items-baseline justify-between gap-3" style={{ fontSize: 13 }}>
                        <span style={{ color: C.inkMid }}>{fmtNum(h.kmPrancha)} km contratados × {fmtBRLh(h.valorKm)}/km</span>
                        <span style={{ fontWeight: 700, color: C.ink }}>{fmtBRL(h.pranchaContratado)}</span>
                    </div>
                    <p style={{ fontSize: 10.5, color: C.inkSub, marginTop: 8, fontStyle: 'italic' }}>
                        Valor contratado do deslocamento. O km efetivamente rodado não é rastreado nesta base.
                    </p>
                </Card>
            )}
        </div>
    );
};

export default FichaFaturamento;
