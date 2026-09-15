import React, { useMemo, useState, useEffect } from 'react';
import { Truck, FileWarning } from 'lucide-react';
import { useData, useEnsureResources } from '../../contexts/DataContext';
import { computeContrato, getContratoMachines } from '../../utils/terceirizados';
import { getPartnerDisplayName } from '../../utils/partners';
import apiClient from '../../services/apiClient';

// ─────────────────────────────────────────────────────────────────────────────
// FichaTerceiros — bloco "Terceiros nesta obra" da Ficha da Obra.
//
// Existe porque a Ficha respondia tudo sobre a execução PRÓPRIA e nada sobre o
// que está contratado com terceiro na mesma obra — quem é, quanto vale, quanto
// já foi executado e quanto ainda se deve. Uma obra com metade do contrato
// terceirizada era lida como se fosse 100% MAK.
//
// Cálculo: reaproveita computeContrato (utils/terceirizados.js) — a MESMA fonte
// da página Terceirizados, então os números batem entre as duas telas. Valores
// são os VIGENTES (contrato + aditivos assinados); o original aparece ao lado
// quando houve aditivo.
//
// Renderiza null quando a obra não tem contrato de terceiro — ausência aqui não
// é informação útil no meio da ficha (diferente do card da grade, onde esconder
// quebraria o alinhamento).
// ─────────────────────────────────────────────────────────────────────────────

const C = {
    surface: '#ffffff',
    border:  '#e5e0d8',
    ink:     '#1e1a14',
    inkMid:  '#5a4e3a',
    inkSub:  '#9a8c7a',
    gold:    '#9E7A42',
    bg:      '#f5f3ef',
    red:     '#b03828',
    green:   '#2e7d5b',
};

const fmtBRL = (v) =>
    v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtH = (v) => `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
const fmtData = (iso) => {
    if (!iso) return null;
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};

function Mini({ label, value, color, hint }) {
    return (
        <div className="min-w-0">
            <div style={{ fontSize: 10.5, color: C.inkSub, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div className="truncate" style={{ fontSize: 14, fontWeight: 700, color: color || C.ink }}>{value}</div>
            {hint && <div style={{ fontSize: 10.5, color: C.inkSub }}>{hint}</div>}
        </div>
    );
}

const FichaTerceiros = ({ obraId }) => {
    useEnsureResources(['terceiroContratos', 'terceirizadoPagamentos', 'dailyWorkLogs', 'comboioTransactions']);
    const {
        obras = [], vehicles = [], partners = [],
        dailyWorkLogs = [], comboioTransactions = [],
        terceirizadoPagamentos = [], terceiroContratos = [],
    } = useData();

    const contratos = useMemo(
        () => (terceiroContratos || []).filter((c) => String(c.obraId) === String(obraId)),
        [terceiroContratos, obraId]
    );

    // Abastecimentos escopados às máquinas destes contratos — a tabela inteira de
    // refuelings não é carregada na Ficha e nem precisa ser.
    const scopedVehicleIds = useMemo(() => {
        const ids = new Set();
        contratos.forEach((c) => getContratoMachines(c, obras, vehicles).forEach((v) => ids.add(v.id)));
        return [...ids];
    }, [contratos, obras, vehicles]);

    const [refuelings, setRefuelings] = useState([]);
    useEffect(() => {
        let cancelled = false;
        if (scopedVehicleIds.length === 0) { setRefuelings([]); return undefined; }
        apiClient.getRefuelingsByVehicles(scopedVehicleIds)
            .then((rows) => { if (!cancelled) setRefuelings(Array.isArray(rows) ? rows : []); })
            .catch(() => { if (!cancelled) setRefuelings([]); });
        return () => { cancelled = true; };
    }, [scopedVehicleIds]);

    const linhas = useMemo(() => {
        const ctx = {
            vehicles, obras, dailyWorkLogs, refuelings, comboioTransactions, partners,
            pagamentos: terceirizadoPagamentos, contratos: terceiroContratos,
        };
        return contratos.map((c) => ({
            r: computeContrato(c, ctx),
            terceiro: partners.find((p) => p.id === c.locadorId) || null,
        }));
    }, [contratos, vehicles, obras, dailyWorkLogs, refuelings, comboioTransactions, partners, terceirizadoPagamentos, terceiroContratos]);

    if (linhas.length === 0) return null;

    const totalValor = linhas.reduce((a, l) => a + l.r.valorTotal, 0);
    const totalSaldo = linhas.reduce((a, l) => a + l.r.saldo, 0);
    const totalDiesel = linhas.reduce((a, l) => a + l.r.diesel, 0);
    const totalAdiant = linhas.reduce((a, l) => a + l.r.adiantamentos, 0);

    return (
        <div className="rounded-xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-3">
                <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.inkSub }}>
                    Terceiros nesta obra
                </h3>
                <span className="flex items-center gap-1" style={{ fontSize: 11.5, color: C.inkMid }}>
                    <Truck size={13} />
                    {linhas.length} {linhas.length === 1 ? 'contrato' : 'contratos'}
                </span>
            </div>

            {/* Totais da obra — a leitura de cima, antes do contrato a contrato. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-3 mb-3" style={{ borderBottom: `1px solid ${C.border}` }}>
                <Mini label="Contratado" value={fmtBRL(totalValor)} />
                <Mini label="Diesel abatido" value={fmtBRL(totalDiesel)} />
                <Mini label="Adiantamentos" value={fmtBRL(totalAdiant)} />
                <Mini label="Saldo a pagar" value={fmtBRL(totalSaldo)}
                    color={totalSaldo > 0 ? C.red : C.green} />
            </div>

            <div className="space-y-2.5">
                {linhas.map(({ r, terceiro }) => {
                    const pct = Math.round((r.progresso || 0) * 100);
                    const nome = terceiro ? getPartnerDisplayName(terceiro) : 'Terceiro não identificado';
                    const semAssinatura = !r.contrato?.contratoAssinadoUrl;
                    return (
                        <div key={r.contrato.id} className="rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                    <div className="truncate" style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{nome}</div>
                                    <div style={{ fontSize: 11.5, color: C.inkSub }}>
                                        {r.contrato.numero || 'sem número'}
                                        {r.numMaquinas > 0 && ` · ${r.numMaquinas} ${r.numMaquinas === 1 ? 'máquina' : 'máquinas'}`}
                                        {r.vigenciaFim && ` · até ${fmtData(r.vigenciaFim)}`}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{fmtBRL(r.valorTotal)}</div>
                                    {r.temAditivos && (
                                        <div style={{ fontSize: 10.5, color: C.inkSub }}>
                                            original {fmtBRL(r.valorOriginal)} · {r.aditivosAssinados.length} aditivo(s)
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Execução física do contrato do terceiro */}
                            <div className="mt-2.5">
                                <div className="flex items-baseline justify-between gap-2 mb-1">
                                    <span style={{ fontSize: 11.5, color: C.inkMid }}>
                                        {fmtH(r.horasExecutadas)} de {r.horasContratadas > 0 ? fmtH(r.horasContratadas) : '—'}
                                    </span>
                                    <span style={{ fontSize: 12.5, fontWeight: 700, color: pct > 100 ? C.red : C.ink }}>
                                        {r.horasContratadas > 0 ? `${pct}%` : 'sem horas contratadas'}
                                    </span>
                                </div>
                                <div className="w-full h-2 rounded-full" style={{ background: '#e9e3d9' }}>
                                    <div className="h-2 rounded-full"
                                        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: pct > 100 ? C.red : C.gold }} />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3 mt-2.5">
                                <Mini label="Diesel abatido" value={fmtBRL(r.diesel)} hint={r.litros > 0 ? `${Math.round(r.litros)} L` : null} />
                                <Mini label="Adiantamentos" value={fmtBRL(r.adiantamentos)} />
                                <Mini label="Saldo a pagar" value={fmtBRL(r.saldo)} color={r.saldo > 0 ? C.red : C.green} />
                            </div>

                            {semAssinatura && (
                                <div className="flex items-center gap-1.5 mt-2" style={{ fontSize: 11, color: C.red }}>
                                    <FileWarning size={12} /> Contrato ainda sem documento assinado.
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default FichaTerceiros;
