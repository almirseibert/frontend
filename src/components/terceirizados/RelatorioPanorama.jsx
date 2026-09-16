import React, { useMemo, useState } from 'react';
import {
    X, FileDown, Truck, Building2, AlertTriangle, ChevronDown, ChevronRight,
    Wallet, Droplet, Clock, ShieldCheck, TrendingUp,
} from 'lucide-react';
import { buildPanorama, STATUS_LABEL } from '../../utils/terceirosPanorama';
import { gerarPanoramaPdf } from '../../utils/terceirosPanoramaPdf';

const fmtBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRLc = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtH = (n) => `${Math.round(Number(n) || 0).toLocaleString('pt-BR')} h`;
const fmtPct = (n) => `${((Number(n) || 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const fmtDate = (d) => (d ? d.toLocaleDateString('pt-BR') : '—');

const SEV = {
    alta:  { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-700',   dot: 'bg-red-500' },
    media: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
    baixa: { bg: 'bg-blue-50',  border: 'border-blue-200',  text: 'text-blue-700',  dot: 'bg-blue-500' },
};

/** KPI de destaque do topo. */
const Kpi = ({ label, value, sub, tone = 'gray', icon }) => {
    const tones = {
        gray:   { bg: '#f8fafc', fg: '#334155' },
        purple: { bg: '#faf5ff', fg: '#6b21a8' },
        red:    { bg: '#fef2f2', fg: '#991b1b' },
        green:  { bg: '#f0fdf4', fg: '#166534' },
        blue:   { bg: '#eff6ff', fg: '#1e40af' },
    };
    const t = tones[tone] || tones.gray;
    return (
        <div className="rounded-xl border border-gray-100 p-4" style={{ background: t.bg }}>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: t.fg }}>
                {icon}{label}
            </div>
            <div className="text-xl font-extrabold mt-1 leading-tight" style={{ color: t.fg }}>{value}</div>
            {sub && <div className="text-[11px] mt-0.5 opacity-70" style={{ color: t.fg }}>{sub}</div>}
        </div>
    );
};

/** Barra de participação (fatia do saldo devedor total). */
const Barra = ({ pct, tone = '#a855f7' }) => (
    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%`, background: tone }} />
    </div>
);

const Secao = ({ titulo, icon, children, acao }) => (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-gray-400">{icon}{titulo}</div>
            {acao}
        </div>
        {children}
    </section>
);

/**
 * Relatório-panorama de todos os contratos de terceirizados (tela cheia + PDF).
 * Não busca nada: recebe os mesmos dados que a página já tem em memória.
 */
const RelatorioPanorama = ({ contratos, ctx, partners, obras, onClose, setAlertMessage }) => {
    const [aberto, setAberto] = useState(() => new Set());   // terceiros expandidos
    const [pdfLoading, setPdfLoading] = useState(false);

    const pan = useMemo(
        () => buildPanorama(contratos, ctx, { partners, obras }),
        [contratos, ctx, partners, obras]);

    const { kpis, porTerceiro, porObra, alertas } = pan;
    const lider = porTerceiro[0];
    const excluidos = kpis.numContratosTotal - kpis.numContratos;

    const toggle = (id) => setAberto((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });

    const handlePdf = () => {
        setPdfLoading(true);
        try {
            gerarPanoramaPdf(pan);
        } catch (err) {
            setAlertMessage?.(err.message || 'Erro ao gerar o PDF do panorama.');
        } finally {
            setPdfLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center p-2 md:p-6 overflow-y-auto">
            <div className="bg-gray-50 rounded-xl w-full max-w-6xl shadow-2xl my-auto">
                {/* Cabeçalho */}
                <div className="sticky top-0 z-10 bg-white border-b border-gray-100 rounded-t-xl px-5 py-4 flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <Truck size={18} className="text-purple-500" /> Panorama dos Terceirizados
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {kpis.numContratos} contrato(s) em aberto · {kpis.numTerceiros} terceiro(s) · {kpis.numObras} obra(s)
                            {excluidos > 0 && <> · <span className="text-gray-400">{excluidos} concluído(s)/cancelado(s) fora dos totais</span></>}
                            {' · '}Emitido em {new Date().toLocaleDateString('pt-BR')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={handlePdf} disabled={pdfLoading}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60">
                            <FileDown size={15} /> {pdfLoading ? 'Gerando…' : 'PDF'}
                        </button>
                        <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="p-4 md:p-5 space-y-4">
                    {kpis.numContratos === 0 ? (
                        <div className="bg-white rounded-xl p-12 text-center text-sm text-gray-400">
                            Nenhum contrato em aberto para consolidar.
                        </div>
                    ) : (
                    <>
                        {/* ── Resposta curta ─────────────────────────────────── */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <Kpi tone="purple" icon={<Wallet size={11} />} label="Contratado (vigente)"
                                value={fmtBRL(kpis.valorTotal)}
                                sub={kpis.aditivado > 0.01 ? `inclui ${fmtBRLc(kpis.aditivado)} em aditivos` : 'sem aditivos assinados'} />
                            <Kpi tone="red" icon={<TrendingUp size={11} />} label="Saldo devedor"
                                value={fmtBRL(kpis.saldo)}
                                sub={`${fmtPct(kpis.liquidado)} do contratado já liquidado`} />
                            <Kpi tone="blue" icon={<Droplet size={11} />} label="Diesel abatido"
                                value={fmtBRL(kpis.diesel)}
                                sub={`${(kpis.litros).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L fornecidos`} />
                            <Kpi tone="green" icon={<Wallet size={11} />} label="Adiantamentos pagos"
                                value={fmtBRL(kpis.adiantamentos)}
                                sub={`${kpis.numMaquinas} equipamento(s) em operação`} />
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <Kpi icon={<Clock size={11} />} label="Execução física"
                                value={fmtPct(kpis.progresso)}
                                sub={`${fmtH(kpis.horasExecutadas)} de ${fmtH(kpis.horasContratadas)} contratadas`} />
                            <Kpi icon={<Building2 size={11} />} label="Obras atendidas"
                                value={kpis.numObras}
                                sub={`por ${kpis.numTerceiros} terceiro(s)`} />
                            <Kpi icon={<Truck size={11} />} label="Maior exposição"
                                value={lider ? fmtPct(lider.participacao) : '—'}
                                sub={lider ? `${lider.nome} · ${fmtBRLc(lider.saldo)}` : '—'} />
                            <Kpi tone={alertas.some((a) => a.severidade === 'alta') ? 'red' : 'gray'}
                                icon={<ShieldCheck size={11} />} label="Pontos de atenção"
                                value={alertas.reduce((a, g) => a + g.itens.length, 0)}
                                sub={`${alertas.length} categoria(s)`} />
                        </div>

                        {/* ── Por terceiro ───────────────────────────────────── */}
                        <Secao titulo="Exposição por terceiro" icon={<Truck size={12} />}>
                            <div className="overflow-x-auto -mx-1">
                                <table className="w-full text-xs min-w-[860px]">
                                    <thead>
                                        <tr className="text-[10px] uppercase text-gray-400 border-b border-gray-100">
                                            <th className="text-left font-bold py-2 pl-1">Terceiro</th>
                                            <th className="text-center font-bold">Contratos</th>
                                            <th className="text-center font-bold">Obras</th>
                                            <th className="text-center font-bold">Equip.</th>
                                            <th className="text-right font-bold">Contratado</th>
                                            <th className="text-right font-bold">Diesel</th>
                                            <th className="text-right font-bold">Adiantado</th>
                                            <th className="text-right font-bold">Saldo devedor</th>
                                            <th className="text-right font-bold pr-1 w-24">Fatia</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {porTerceiro.map((t) => (
                                            <React.Fragment key={t.id}>
                                                <tr onClick={() => toggle(t.id)}
                                                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                                                    <td className="py-2 pl-1">
                                                        <div className="flex items-center gap-1.5 font-bold text-gray-700">
                                                            {aberto.has(t.id) ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
                                                            {t.nome}
                                                        </div>
                                                        <div className="text-[10px] text-gray-400 pl-5">
                                                            {t.progresso > 0 ? `${fmtPct(t.progresso)} das horas executadas` : 'sem horas apontadas'}
                                                            {t.semAssinatura > 0 && <span className="text-amber-600"> · {t.semAssinatura} sem assinatura</span>}
                                                            {t.vencidos > 0 && <span className="text-red-600"> · {t.vencidos} vencido(s)</span>}
                                                        </div>
                                                    </td>
                                                    <td className="text-center text-gray-600">{t.numContratos}</td>
                                                    <td className="text-center text-gray-600">{t.numObras}</td>
                                                    <td className="text-center text-gray-600">{t.numMaquinas}</td>
                                                    <td className="text-right text-gray-600">{fmtBRL(t.valorTotal)}</td>
                                                    <td className="text-right text-gray-600">{fmtBRL(t.diesel)}</td>
                                                    <td className="text-right text-gray-600">{fmtBRL(t.adiantamentos)}</td>
                                                    <td className={`text-right font-extrabold ${t.saldo > 0 ? 'text-red-600' : t.saldo < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                                                        {fmtBRL(t.saldo)}
                                                    </td>
                                                    <td className="pr-1 pl-2">
                                                        <div className="text-[10px] text-gray-400 text-right mb-0.5">{fmtPct(t.participacao)}</div>
                                                        <Barra pct={t.participacao} />
                                                    </td>
                                                </tr>

                                                {aberto.has(t.id) && t.linhas.map((l) => (
                                                    <tr key={l.contrato.id} className="bg-gray-50/60 border-b border-gray-50 text-[11px]">
                                                        <td className="py-1.5 pl-7">
                                                            <span className="font-semibold text-gray-600">{l.contrato.numero}</span>
                                                            <span className="text-gray-400"> · {l.obraNome}</span>
                                                            <div className="text-[10px] text-gray-400">
                                                                {fmtDate(l.inicio)} a {fmtDate(l.fim)}
                                                                {l.vencido ? <span className="text-red-600 font-semibold"> · vencido</span>
                                                                    : l.diasRestantes !== null && l.diasRestantes <= 30 ? <span className="text-amber-600 font-semibold"> · {l.diasRestantes}d restantes</span> : null}
                                                                {' · '}{STATUS_LABEL[l.status] || l.status}
                                                                {!l.assinado && <span className="text-amber-600"> · sem via assinada</span>}
                                                            </div>
                                                        </td>
                                                        <td className="text-center text-gray-400">—</td>
                                                        <td className="text-center text-gray-400">1</td>
                                                        <td className="text-center text-gray-500">{l.r.numMaquinas}</td>
                                                        <td className="text-right text-gray-500">{fmtBRL(l.r.valorTotal)}</td>
                                                        <td className="text-right text-gray-500">{fmtBRL(l.r.diesel)}</td>
                                                        <td className="text-right text-gray-500">{fmtBRL(l.r.adiantamentos)}</td>
                                                        <td className="text-right font-bold text-gray-600">{fmtBRL(l.r.saldo)}</td>
                                                        <td className="text-right pr-1 text-gray-400">
                                                            {l.r.horasContratadas > 0 ? fmtPct(l.r.progresso) : '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 border-gray-200 font-extrabold text-gray-700">
                                            <td className="py-2 pl-1">Total</td>
                                            <td className="text-center">{kpis.numContratos}</td>
                                            <td className="text-center">{kpis.numObras}</td>
                                            <td className="text-center">{kpis.numMaquinas}</td>
                                            <td className="text-right">{fmtBRL(kpis.valorTotal)}</td>
                                            <td className="text-right">{fmtBRL(kpis.diesel)}</td>
                                            <td className="text-right">{fmtBRL(kpis.adiantamentos)}</td>
                                            <td className="text-right text-red-700">{fmtBRL(kpis.saldo)}</td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2">
                                Clique em um terceiro para abrir os contratos. Saldo devedor = valor contratado − diesel abatido − adiantamentos.
                            </p>
                        </Secao>

                        {/* ── Por obra ───────────────────────────────────────── */}
                        <Secao titulo="Onde o dinheiro está comprometido (por obra)" icon={<Building2 size={12} />}>
                            <div className="overflow-x-auto -mx-1">
                                <table className="w-full text-xs min-w-[680px]">
                                    <thead>
                                        <tr className="text-[10px] uppercase text-gray-400 border-b border-gray-100">
                                            <th className="text-left font-bold py-2 pl-1">Obra</th>
                                            <th className="text-center font-bold">Terceiros</th>
                                            <th className="text-center font-bold">Contratos</th>
                                            <th className="text-center font-bold">Equip.</th>
                                            <th className="text-right font-bold">Contratado</th>
                                            <th className="text-right font-bold">Diesel</th>
                                            <th className="text-right font-bold pr-1">Saldo devedor</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {porObra.map((o) => (
                                            <tr key={o.id || 'sem-obra'} className="border-b border-gray-50">
                                                <td className="py-2 pl-1">
                                                    <div className="font-semibold text-gray-700">{o.nome}</div>
                                                    {o.localizacao && <div className="text-[10px] text-gray-400">{o.localizacao}</div>}
                                                </td>
                                                <td className="text-center text-gray-600">{o.numTerceiros}</td>
                                                <td className="text-center text-gray-600">{o.numContratos}</td>
                                                <td className="text-center text-gray-600">{o.numMaquinas}</td>
                                                <td className="text-right text-gray-600">{fmtBRL(o.valorTotal)}</td>
                                                <td className="text-right text-gray-600">{fmtBRL(o.diesel)}</td>
                                                <td className={`text-right font-bold pr-1 ${o.saldo > 0 ? 'text-red-600' : 'text-gray-600'}`}>{fmtBRL(o.saldo)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Secao>

                        {/* ── Alertas ────────────────────────────────────────── */}
                        <Secao titulo="Pontos de atenção" icon={<AlertTriangle size={12} />}>
                            {alertas.length === 0 ? (
                                <div className="text-xs text-gray-400 py-4 text-center">
                                    Nenhum ponto de atenção: todos os contratos em aberto estão assinados, dentro do prazo e dentro do plano de horas.
                                </div>
                            ) : (
                                <div className="grid md:grid-cols-2 gap-3">
                                    {alertas.map((a) => {
                                        const s = SEV[a.severidade] || SEV.baixa;
                                        return (
                                            <div key={a.tipo} className={`rounded-lg border p-3 ${s.bg} ${s.border}`}>
                                                <div className={`flex items-center gap-2 text-xs font-bold ${s.text}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                                    {a.titulo}
                                                    <span className="ml-auto text-[11px]">{a.itens.length}</span>
                                                </div>
                                                <p className="text-[10px] text-gray-500 mt-1">{a.descricao}</p>
                                                <ul className="mt-2 space-y-0.5">
                                                    {a.itens.slice(0, 6).map((l) => (
                                                        <li key={l.contrato.id} className="text-[11px] text-gray-600 flex justify-between gap-2">
                                                            <span className="truncate">
                                                                <b>{l.contrato.numero}</b> · {l.terceiroNome} · {l.obraNome}
                                                            </span>
                                                            <span className="shrink-0 font-semibold">{fmtBRLc(l.r.saldo)}</span>
                                                        </li>
                                                    ))}
                                                    {a.itens.length > 6 && (
                                                        <li className="text-[10px] text-gray-400">+ {a.itens.length - 6} outro(s)</li>
                                                    )}
                                                </ul>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Secao>
                    </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RelatorioPanorama;
