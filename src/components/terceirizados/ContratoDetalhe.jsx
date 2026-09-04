import React, { useMemo, useRef, useState } from 'react';
import {
    FileText, FileDown, Pencil, Trash2, Loader, Clock, Wallet, Droplet, ArrowLeft,
    PlusCircle, AlertTriangle, Building2, ShieldCheck, UploadCloud, Download, History, Lock,
    Truck, CalendarRange, Gavel, Info, ClipboardList, FilePlus2,
} from 'lucide-react';
import ProtectedComponent from '../ProtectedComponent';
import { getContratoAbastecimentos, getContratoApontamentos, agruparApontamentosPorMes } from '../../utils/terceirizados';
import { formatObraNome } from '../../utils/obraFormat';

const fmtBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtH = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h';
const fmtL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' L';
// Horas do PLANO: o contrato é firmado em horas fechadas, sem fração.
const fmtHInt = (n) => `${Math.round(Number(n) || 0).toLocaleString('pt-BR')} h`;
const fmtPct = (n) => `${(Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const fmtDate = (v) => {
    if (!v) return '—';
    const d = v instanceof Date ? v : new Date(String(v).includes('T') ? v : `${String(v).split(' ')[0]}T00:00:00`);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};
const fmtDateTime = (v) => {
    if (!v) return '—';
    const d = new Date(String(v).includes('T') ? v : String(v).replace(' ', 'T'));
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const StatusBadge = ({ status }) => {
    const map = {
        ativo:     { t: 'Ativo', c: 'bg-green-50 text-green-700 border-green-200' },
        assinado:  { t: 'Assinado', c: 'bg-purple-50 text-purple-700 border-purple-200' },
        concluido: { t: 'Concluído', c: 'bg-gray-100 text-gray-600 border-gray-200' },
        cancelado: { t: 'Cancelado', c: 'bg-red-50 text-red-700 border-red-200' },
    };
    const s = map[status] || map.ativo;
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.c}`}>{s.t}</span>;
};

/** Bloco da página: título discreto + conteúdo. */
const Card = ({ title, icon, children, className = '' }) => (
    <section className={`bg-white rounded-xl shadow-sm border border-gray-100 p-4 ${className}`}>
        {title && (
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-gray-400 mb-3">
                {icon}{title}
            </div>
        )}
        {children}
    </section>
);

/** Linha rótulo/valor das fichas laterais. */
const Campo = ({ label, children }) => (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0">
        <span className="text-[11px] text-gray-400 shrink-0">{label}</span>
        <span className="text-xs font-semibold text-gray-700 text-right">{children}</span>
    </div>
);

// Diagnóstico do ritmo: horas entregues x prazo corrido (tolerância de 5 p.p.).
const SITUACAO = {
    nao_iniciado: { t: 'Vigência ainda não começou', c: 'bg-gray-50 border-gray-200 text-gray-600' },
    no_ritmo:     { t: 'No ritmo do prazo',          c: 'bg-green-50 border-green-200 text-green-800' },
    adiantado:    { t: 'Adiantado',                  c: 'bg-blue-50 border-blue-200 text-blue-800' },
    atrasado:     { t: 'Atrasado',                   c: 'bg-amber-50 border-amber-200 text-amber-800' },
};

const DIA_MS = 86400000;
const toDay = (v) => {
    if (!v) return null;
    const d = v instanceof Date ? new Date(v) : new Date(String(v).includes('T') ? v : `${String(v).split(' ')[0]}T00:00:00`);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
};

/**
 * Ritmo de execução do contrato: compara o quanto das horas já foi entregue com o
 * quanto do prazo já correu, e projeta o desfecho mantido o ritmo atual.
 * Sem vigência fechada (início/fim) não há prazo para comparar — devolve null.
 */
const calcRitmo = (contrato, r, apontamentos) => {
    const ini = toDay(contrato?.vigenciaInicio);
    // Aditivo de prazo estende o prazo real do contrato — o ritmo é medido contra ele.
    const fim = toDay(r?.vigenciaFim ?? contrato?.vigenciaFim);
    const hoje = toDay(new Date());
    const contratadas = r.horasContratadas || 0;
    const ultimo = apontamentos.find((a) => !a.justificativaTipo && a.date)?.date || null;
    const diasSemApontar = ultimo ? Math.floor((hoje - toDay(ultimo)) / DIA_MS) : null;
    if (!ini || !fim || fim < ini) return { ultimo, diasSemApontar, semVigencia: true };

    const diasTotais = Math.round((fim - ini) / DIA_MS) + 1;
    const decorridos = Math.min(diasTotais, Math.max(0, Math.round((hoje - ini) / DIA_MS) + 1));
    const restantes = Math.max(0, diasTotais - decorridos);
    const pctPrazo = diasTotais > 0 ? (decorridos / diasTotais) * 100 : 0;
    const pctExec = contratadas > 0 ? ((r.horasExecutadas || 0) / contratadas) * 100 : 0;

    // Ritmo por dia de calendário decorrido (inclui parados e fins de semana:
    // é o ritmo real de consumo do contrato, não a produtividade da máquina).
    const porDia = decorridos > 0 ? (r.horasExecutadas || 0) / decorridos : 0;
    const projecao = (r.horasExecutadas || 0) + porDia * restantes;
    const faltando = Math.max(0, contratadas - (r.horasExecutadas || 0));
    const diasParaCompletar = porDia > 0 ? Math.ceil(faltando / porDia) : null;
    const dataCompleta = diasParaCompletar != null ? new Date(hoje.getTime() + diasParaCompletar * DIA_MS) : null;

    const desvio = pctExec - pctPrazo;
    const situacao = decorridos === 0 ? 'nao_iniciado'
        : Math.abs(desvio) <= 5 ? 'no_ritmo'
        : desvio > 0 ? 'adiantado' : 'atrasado';

    return {
        ini, fim, diasTotais, decorridos, restantes, pctPrazo, pctExec,
        porDia, projecao, faltando, dataCompleta, desvio, situacao,
        ultimo, diasSemApontar, encerrado: hoje > fim,
    };
};

/** Matriz máquina × mês (horas), com totais por linha — onde as horas saíram. */
const montarMatrizMaquinaMes = (apontamentos, porMes) => {
    const meses = porMes.map((m) => m.mes);
    const linhas = new Map();
    apontamentos.forEach((a) => {
        if (a.justificativaTipo || !a.date || !a.vehicle) return;
        const id = a.vehicle.id;
        const cur = linhas.get(id) || { vehicle: a.vehicle, porMes: {}, total: 0, dias: 0 };
        const mes = `${a.date.getFullYear()}-${String(a.date.getMonth() + 1).padStart(2, '0')}`;
        cur.porMes[mes] = (cur.porMes[mes] || 0) + a.horas;
        cur.total += a.horas;
        cur.dias += 1;
        linhas.set(id, cur);
    });
    return { meses, labels: porMes.map((m) => m.label), linhas: [...linhas.values()].sort((a, b) => b.total - a.total) };
};

const KpiCard = ({ label, value, tone = 'gray', hint }) => {
    const tones = {
        gray:  { bg: '#f8fafc', text: '#334155' },
        blue:  { bg: '#eff6ff', text: '#1e40af' },
        red:   { bg: '#fef2f2', text: '#991b1b' },
        green: { bg: '#f0fdf4', text: '#166534' },
    };
    const t = tones[tone] || tones.gray;
    return (
        <div className="rounded-xl border border-gray-100 p-4" style={{ background: t.bg }}>
            <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: t.text }}>{label}</div>
            <div className="text-lg font-extrabold mt-1" style={{ color: t.text }}>{value}</div>
            {hint && <div className="text-[10px] mt-0.5 opacity-70" style={{ color: t.text }}>{hint}</div>}
        </div>
    );
};

const ADITIVO_TIPO = {
    acrescimo: 'Acréscimo de horas',
    supressao: 'Supressão de horas',
    escopo: 'Inclusão de equipamento',
    reajuste: 'Reajuste de preço',
    prazo: 'Prorrogação de prazo',
};

/**
 * Linha do tempo dos termos aditivos. Só aparece com contrato assinado — aditivo
 * pressupõe contrato vigente (a mesma regra vale no backend).
 *
 * Cada aditivo tem o mesmo ciclo do contrato: minuta → PDF → assinado. Enquanto é
 * minuta, não move nenhum número do contrato; ao virar assinado, entra no consolidado.
 */
const AditivosPanel = ({
    contrato, aditivos = [], loadingId,
    onNovo, onEditar, onExcluir, onGerarPdf, onEnviarAssinado, onBaixarAssinado, onRemoverAssinado,
}) => {
    const inputRef = useRef(null);
    const [alvoUpload, setAlvoUpload] = useState(null);
    const [confirmando, setConfirmando] = useState(null);
    const assinado = !!contrato.contratoAssinadoUrl;
    const bloqueado = ['cancelado', 'concluido'].includes(contrato.status);
    const temMinuta = aditivos.some((a) => a.status === 'minuta');

    const pick = (id) => { setAlvoUpload(id); inputRef.current?.click(); };
    const onFile = (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file && alvoUpload) onEnviarAssinado(alvoUpload, file);
    };

    return (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-4">
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={onFile} />
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-gray-400">
                    <FilePlus2 size={12} /> Termos aditivos {aditivos.length > 0 && `(${aditivos.length})`}
                </div>
                <ProtectedComponent requiredPermission="editor">
                    <button onClick={onNovo} disabled={!assinado || bloqueado || temMinuta}
                        title={!assinado ? 'Aditivo exige contrato assinado'
                            : bloqueado ? `Contrato ${contrato.status} não aceita aditivo`
                            : temMinuta ? 'Finalize ou exclua a minuta pendente' : 'Criar termo aditivo'}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40">
                        <PlusCircle size={13} /> Novo aditivo
                    </button>
                </ProtectedComponent>
            </div>

            {!assinado && (
                <p className="text-xs text-gray-500">
                    Aditivo só existe sobre contrato assinado. Envie o contrato assinado para poder aditá-lo.
                </p>
            )}

            {assinado && aditivos.length === 0 && (
                <p className="text-xs text-gray-500">Nenhum aditivo. O contrato vigora nos termos originais.</p>
            )}

            {aditivos.length > 0 && (
                <ul className="space-y-2 mt-1">
                    {aditivos.map((a) => {
                        const aAssinado = a.status === 'assinado';
                        const carregando = loadingId === a.id;
                        return (
                            <li key={a.id} className={`rounded-lg border p-2.5 ${aAssinado ? 'border-purple-200 bg-purple-50/40' : 'border-dashed border-gray-200 bg-gray-50/60'}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-gray-800 truncate">{a.numero}</span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${aAssinado
                                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                                        : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                        {aAssinado ? 'Assinado' : 'Minuta'}
                                    </span>
                                </div>
                                <div className="text-[11px] text-gray-500 mt-0.5">{ADITIVO_TIPO[a.tipo] || a.tipo}</div>
                                <div className="text-[11px] text-gray-600 mt-1 flex flex-wrap gap-x-3">
                                    {Number(a.horasDelta) !== 0 && (
                                        <span className={Number(a.horasDelta) < 0 ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'}>
                                            {Number(a.horasDelta) > 0 ? '+' : ''}{fmtHInt(a.horasDelta)}
                                        </span>
                                    )}
                                    {Number(a.valorDelta) !== 0 && (
                                        <span className={Number(a.valorDelta) < 0 ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'}>
                                            {Number(a.valorDelta) > 0 ? '+' : ''}{fmtBRL(a.valorDelta)}
                                        </span>
                                    )}
                                    {a.novaVigenciaFim && <span className="text-gray-500">vigência até {fmtDate(a.novaVigenciaFim)}</span>}
                                </div>
                                {aAssinado && (
                                    <div className="text-[10px] text-gray-400 mt-0.5">
                                        Assinado em {fmtDateTime(a.assinadoEm)}{a.assinadoPor ? ` · ${a.assinadoPor}` : ''}
                                    </div>
                                )}

                                {confirmando === a.id ? (
                                    <div className="flex flex-col gap-1.5 mt-2 text-xs">
                                        <span className="text-gray-600 font-medium">
                                            {aAssinado
                                                ? 'Remover o aditivo assinado? Ele volta a ser minuta e sai dos valores do contrato.'
                                                : 'Excluir esta minuta de aditivo?'}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => { setConfirmando(null); (aAssinado ? onRemoverAssinado : onExcluir)(a.id); }}
                                                className="px-2 py-1 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700">
                                                {aAssinado ? 'Remover' : 'Excluir'}
                                            </button>
                                            <button onClick={() => setConfirmando(null)}
                                                className="px-2 py-1 bg-gray-200 rounded-lg font-medium hover:bg-gray-300">Cancelar</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                                        {aAssinado ? (
                                            <>
                                                <button onClick={() => onBaixarAssinado(a)}
                                                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                                                    <Download size={12} /> Baixar
                                                </button>
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => setConfirmando(a.id)}
                                                        className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-red-600 rounded-lg hover:bg-red-50">
                                                        <Trash2 size={12} /> Remover
                                                    </button>
                                                </ProtectedComponent>
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={() => onGerarPdf(a)} disabled={carregando}
                                                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-60">
                                                    {carregando ? <Loader size={12} className="animate-spin" /> : <FileDown size={12} />} Minuta
                                                </button>
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => pick(a.id)} disabled={carregando}
                                                        className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60">
                                                        <UploadCloud size={12} /> Enviar assinado
                                                    </button>
                                                    <button onClick={() => onEditar(a)}
                                                        className="p-1 text-gray-500 rounded-lg hover:bg-gray-100"><Pencil size={13} /></button>
                                                    <button onClick={() => setConfirmando(a.id)}
                                                        className="p-1 text-red-500 rounded-lg hover:bg-red-50"><Trash2 size={13} /></button>
                                                </ProtectedComponent>
                                            </>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

/**
 * Painel do documento oficial (contrato assinado). Dois estados:
 *  - Sem assinado: minuta é rascunho; oferece envio do PDF assinado.
 *  - Com assinado: mostra vigente + baixar/substituir/remover + histórico. Enquanto
 *    houver assinado, minuta/edição/exclusão ficam bloqueadas (backend também barra).
 */
const DocumentoOficialPanel = ({ contrato, docs = [], loading, onEnviar, onBaixar, onBaixarDoc, onRemover }) => {
    const inputRef = useRef(null);
    const [confirmando, setConfirmando] = useState(false);
    const assinado = !!contrato.contratoAssinadoUrl;
    const historico = docs.filter((d) => !d.vigente);
    const [verHist, setVerHist] = useState(false);

    const pick = () => inputRef.current?.click();
    const onFile = (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // permite reenviar o mesmo arquivo
        if (file) onEnviar(file);
    };

    return (
        <div className={`rounded-xl border p-4 ${assinado ? 'border-purple-200 bg-purple-50/40' : 'border-gray-100 bg-white shadow-sm'}`}>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={onFile} />
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-gray-400 mb-2">
                <ShieldCheck size={12} /> Documento oficial
            </div>

            {assinado ? (
                <>
                    <div className="flex items-center gap-2 text-sm font-semibold text-purple-800">
                        <ShieldCheck size={15} className="text-purple-600 shrink-0" />
                        <span className="truncate">{contrato.contratoAssinadoNome || 'Contrato assinado.pdf'}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                        Assinado em {fmtDateTime(contrato.contratoAssinadoEm)}
                        {contrato.contratoAssinadoPor ? ` · ${contrato.contratoAssinadoPor}` : ''}
                    </div>
                    <div className="text-[11px] text-gray-500 flex items-start gap-1 mt-1">
                        <Lock size={11} className="mt-0.5 shrink-0" /> Minuta, edição e exclusão bloqueadas enquanto houver contrato assinado.
                    </div>

                    {confirmando ? (
                        <div className="flex flex-col gap-2 mt-3 text-xs">
                            <span className="text-gray-600 font-medium">Remover o contrato assinado? Ele fica no histórico.</span>
                            <div className="flex items-center gap-2">
                                <button onClick={() => { setConfirmando(false); onRemover(); }} disabled={loading}
                                    className="px-2.5 py-1 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-60">Remover</button>
                                <button onClick={() => setConfirmando(false)}
                                    className="px-2.5 py-1 bg-gray-200 rounded-lg font-medium hover:bg-gray-300">Cancelar</button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                            <button onClick={onBaixar}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                                <Download size={13} /> Baixar assinado
                            </button>
                            <button onClick={pick} disabled={loading}
                                title="Ex.: enviar a versão com a assinatura da MAK após a do cliente"
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-60">
                                {loading ? <Loader size={13} className="animate-spin" /> : <UploadCloud size={13} />} Nova versão
                            </button>
                            <button onClick={() => setConfirmando(true)} disabled={loading}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-60">
                                <Trash2 size={13} /> Remover
                            </button>
                        </div>
                    )}
                    {!confirmando && (
                        <p className="text-[11px] text-gray-400 mt-1.5">
                            Enviar nova versão arquiva a atual no histórico (não apaga) — use para adicionar uma
                            segunda assinatura ou corrigir o arquivo.
                        </p>
                    )}
                </>
            ) : (
                <>
                    <p className="text-xs text-gray-500 mb-2.5">
                        Nenhum contrato assinado enviado. O PDF gerado é apenas <b>rascunho (minuta)</b> — envie o
                        documento assinado para torná-lo o oficial vigente.
                    </p>
                    <button onClick={pick} disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60">
                        {loading ? <Loader size={13} className="animate-spin" /> : <UploadCloud size={13} />} Enviar contrato assinado
                    </button>
                </>
            )}

            {historico.length > 0 && (
                <div className="mt-3 border-t border-gray-200 pt-2">
                    <button onClick={() => setVerHist((v) => !v)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700">
                        <History size={12} /> Histórico de envios ({historico.length})
                    </button>
                    {verHist && (
                        <ul className="mt-1.5 space-y-1">
                            {historico.map((d) => (
                                <li key={d.id}>
                                    <button onClick={() => onBaixarDoc(d)} title="Baixar esta versão"
                                        className="w-full text-[11px] text-gray-500 flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-gray-100 hover:text-gray-700">
                                        <span className="flex items-center gap-1 truncate">
                                            <Download size={11} className="shrink-0 text-gray-400" />
                                            <span className="truncate">{d.nomeOriginal || 'documento.pdf'}</span>
                                        </span>
                                        <span className="whitespace-nowrap text-gray-400">
                                            {fmtDateTime(d.enviadoEm)}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * ContratoDetalhe — nível 3 da navegação de Terceirizados (Terceiros › Terceiro › Contrato).
 * Página inteira: números do contrato, execução física por máquina, condições contratuais
 * e históricos de pagamento e abastecimento.
 * O lançamento/edição/exclusão de adiantamento é delegado ao pai (via callbacks).
 *
 * Props:
 *  r            resultado de computeContrato (contrato, valorTotal, diesel, adiantamentos, saldo, ...)
 *  terceiro     locador
 *  obra         objeto da obra do contrato (nome + órgão contratante)
 *  ctx          contexto de dados (vehicles/refuelings/comboio/partners) p/ abastecimentos
 *  adiantamentos [{ id, data, valor, descricao, created_by_email }]
 *  pdfLoading   bool
 *  onVoltar, onGerarPdf, onEditContrato, onDeleteContrato
 *  onNovoAdiantamento, onEditAdiantamento(p), onDeleteAdiantamento(p)
 */
const ContratoDetalhe = ({
    r, terceiro, obra, ctx, adiantamentos = [], pdfLoading,
    docsAssinados = [], assinadoLoading, onEnviarAssinado, onBaixarAssinado, onBaixarDocAssinado, onRemoverAssinado,
    onVoltar, onGerarPdf, onEditContrato, onDeleteContrato,
    onNovoAdiantamento, onEditAdiantamento, onDeleteAdiantamento,
    aditivoLoadingId, onNovoAditivo, onEditAditivo, onDeleteAditivo,
    onGerarAditivoPdf, onEnviarAditivoAssinado, onBaixarAditivoAssinado, onRemoverAditivoAssinado,
}) => {
    const c = r.contrato;
    const assinado = !!c.contratoAssinadoUrl;
    const [aba, setAba] = useState('adiantamentos'); // 'adiantamentos' | 'abastecimentos'

    const abastecimentos = useMemo(() => getContratoAbastecimentos(c, ctx), [c, ctx]);
    const apontamentos = useMemo(() => getContratoApontamentos(c, ctx), [c, ctx]);
    const porMes = useMemo(() => agruparApontamentosPorMes(apontamentos), [apontamentos]);
    const diasTrabalhados = apontamentos.filter((a) => !a.justificativaTipo).length;
    const diasParados = apontamentos.length - diasTrabalhados;

    // Ritmo x prazo: o contrato consome horas ao longo da vigência, então o que
    // importa não é quanto já foi feito, e sim se o ritmo cabe no prazo que resta.
    const ritmo = useMemo(() => calcRitmo(c, r, apontamentos), [c, r, apontamentos]);

    // Matriz máquina × mês — onde as horas foram efetivamente produzidas.
    const matriz = useMemo(() => montarMatrizMaquinaMes(apontamentos, porMes), [apontamentos, porMes]);
    const totalAdiant = adiantamentos.reduce((a, p) => a + (Number(p.valor) || 0), 0);
    const semMaquina = (c.status || 'ativo') === 'ativo' && r.numMaquinas === 0;
    const progressoPct = Math.max(0, Math.min(1, r.progresso || 0)) * 100;
    const horasRestantes = Math.max(0, (r.horasContratadas || 0) - (r.horasExecutadas || 0));

    return (
        <div className="animate-fade-in">
            {/* ===================== CABEÇALHO ===================== */}
            <button onClick={onVoltar}
                className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800 mb-3 font-medium">
                <ArrowLeft size={15} /> {terceiro?.nomeFantasia || terceiro?.razaoSocial || 'Terceiro'}
            </button>

            <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e1a14' }} className="flex items-center gap-2 flex-wrap">
                        <FileText className="text-purple-500" size={20} /> {c.numero}
                        <StatusBadge status={c.status} />
                    </h1>
                    <div className="text-sm text-gray-600 mt-1.5 flex items-center gap-1.5">
                        <Building2 size={14} className="text-gray-400 shrink-0" />
                        <span className="font-semibold text-gray-800">{formatObraNome(obra) || '—'}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                        {terceiro?.razaoSocial || '—'}{terceiro?.cnpj ? ` · CNPJ ${terceiro.cnpj}` : ''}
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <button onClick={() => onGerarPdf(c)} disabled={pdfLoading || assinado}
                        title={assinado ? 'Contrato assinado — minuta bloqueada' : 'Baixar minuta (rascunho) do contrato'}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-60">
                        {pdfLoading ? <Loader size={14} className="animate-spin" /> : <FileDown size={14} />} Minuta
                    </button>
                    <ProtectedComponent requiredPermission="editor">
                        <button onClick={onEditContrato} disabled={assinado}
                            title={assinado ? 'Contrato assinado — edição bloqueada' : 'Editar contrato'}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-40">
                            <Pencil size={14} /> Editar
                        </button>
                        <button onClick={onDeleteContrato} disabled={assinado}
                            title={assinado ? 'Contrato assinado — exclusão bloqueada' : 'Excluir contrato'}
                            className="p-2 text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-40"><Trash2 size={16} /></button>
                    </ProtectedComponent>
                </div>
            </div>

            {/* ===================== NÚMEROS ===================== */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <KpiCard label="Valor contrato" value={fmtBRL(r.valorTotal)} tone="gray"
                    hint={r.temAditivos ? `original ${fmtBRL(r.valorOriginal)} · ${r.aditivosAssinados.length} aditivo(s)` : null} />
                <KpiCard label="Diesel abatido" value={fmtBRL(r.diesel)} tone="blue" />
                <KpiCard label="Pagamentos" value={fmtBRL(r.adiantamentos)} tone="gray" />
                <KpiCard label="Saldo a pagar" value={fmtBRL(r.saldo)} tone={r.saldo > 0 ? 'red' : r.saldo < 0 ? 'blue' : 'green'} />
            </div>

            {semMaquina && (
                <div className="mb-4 flex items-start gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle size={14} className="mt-px shrink-0" />
                    Contrato ativo sem máquina vinculada — nenhuma hora é contada e nenhum diesel é abatido. Edite o contrato e marque a máquina.
                </div>
            )}
            {r.saldo < 0 && (
                <div className="mb-4 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    ⚠ Diesel + pagamentos já ultrapassaram o valor do contrato — o terceiro deve {fmtBRL(-r.saldo)} à MAK.
                </div>
            )}

            {/* ===================== CORPO: COLUNA PRINCIPAL + FICHA ===================== */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                <div className="lg:col-span-2 space-y-4">
                    {/* Plano de trabalho — o que foi contratado. Dado estático do contrato:
                        quadro de itens, sem barra (nada aqui "progride"). */}
                    {r.itensContratados.length > 0 && (() => {
                        // Fechado: itens têm valorHora=0 — some as colunas de R$ e mostra só horas.
                        const totalSubtotal = r.itensContratados.reduce((a, it) => a + it.subtotal, 0);
                        const totalHoras = r.itensContratados.reduce((a, it) => a + it.horas, 0);
                        const porValor = totalSubtotal > 0;
                        return (
                            <Card title="Plano de trabalho contratado" icon={<ClipboardList size={12} />}>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-[10px] uppercase text-gray-400 border-b">
                                                <th className="py-1.5 pr-2 text-left font-bold">Subgrupo</th>
                                                <th className="py-1.5 px-2 text-right font-bold whitespace-nowrap">Horas</th>
                                                {porValor && <th className="py-1.5 px-2 text-right font-bold whitespace-nowrap">Valor/hora</th>}
                                                {porValor && <th className="py-1.5 pl-2 text-right font-bold whitespace-nowrap">Subtotal</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {r.itensContratados.map((it, i) => (
                                                <tr key={i} className="border-b border-gray-50">
                                                    <td className="py-2 pr-2 font-semibold text-gray-800">{it.type}</td>
                                                    <td className="py-2 px-2 text-right font-bold text-gray-800 whitespace-nowrap">{fmtHInt(it.horas)}</td>
                                                    {porValor && <td className="py-2 px-2 text-right text-gray-600 whitespace-nowrap">{fmtBRL(it.valorHora)}</td>}
                                                    {porValor && <td className="py-2 pl-2 text-right font-bold text-gray-800 whitespace-nowrap">{fmtBRL(it.subtotal)}</td>}
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-gray-200">
                                                <td className="py-2 pr-2 text-xs font-semibold text-gray-500">
                                                    Total contratado · {r.itensContratados.length} subgrupo(s)
                                                </td>
                                                <td className="py-2 px-2 text-right font-extrabold text-gray-900 whitespace-nowrap">{fmtHInt(totalHoras)}</td>
                                                {porValor && <td />}
                                                {porValor && <td className="py-2 pl-2 text-right font-extrabold text-gray-900 whitespace-nowrap">{fmtBRL(totalSubtotal)}</td>}
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                                <p className="text-[11px] text-gray-400 mt-2">
                                    {porValor
                                        ? 'Escopo firmado no contrato: horas e preço por subgrupo de equipamento.'
                                        : 'Contrato de valor fechado — o plano define as horas por subgrupo, sem preço unitário.'}
                                    {totalHoras !== r.horasContratadas && (
                                        <span className="text-amber-700"> Atenção: a soma dos subgrupos ({fmtHInt(totalHoras)}) difere das horas contratadas do contrato ({fmtHInt(r.horasContratadas)}).</span>
                                    )}
                                </p>
                            </Card>
                        );
                    })()}

                    {/* Progresso físico */}
                    <Card title="Progresso físico" icon={<Clock size={12} />}>
                        <div className="flex items-baseline justify-between gap-3 mb-2">
                            <span className="text-2xl font-extrabold text-gray-800">{fmtH(r.horasExecutadas)}</span>
                            <span className="text-xs text-gray-500">de {fmtH(r.horasContratadas)} contratadas</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full bg-purple-500" style={{ width: `${progressoPct}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-gray-500 mt-1.5">
                            <span className="font-semibold text-purple-700">{fmtPct(progressoPct)} executado</span>
                            <span>Restam {fmtH(horasRestantes)}</span>
                        </div>
                        {/* Ritmo: horas entregues x prazo corrido — e o desfecho projetado */}
                        {ritmo && !ritmo.semVigencia && (
                            <div className="mt-3 pt-3 border-t border-gray-50">
                                <div className="flex items-center justify-between text-[11px] mb-1">
                                    <span className="text-gray-400 uppercase font-bold text-[10px]">Prazo decorrido</span>
                                    <span className="text-gray-500">dia {ritmo.decorridos} de {ritmo.diasTotais} · até {fmtDate(ritmo.fim)}</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                    <div className="h-full bg-gray-400" style={{ width: `${Math.min(100, ritmo.pctPrazo)}%` }} />
                                </div>

                                <div className={`mt-2.5 rounded-lg px-3 py-2 text-xs border ${SITUACAO[ritmo.situacao].c}`}>
                                    <span className="font-bold">{SITUACAO[ritmo.situacao].t}</span>
                                    {ritmo.situacao !== 'nao_iniciado' && (
                                        <> — {fmtPct(Math.abs(ritmo.desvio))} de {ritmo.desvio >= 0 ? 'folga' : 'defasagem'} entre horas entregues ({fmtPct(ritmo.pctExec)}) e prazo corrido ({fmtPct(ritmo.pctPrazo)}).</>
                                    )}
                                    <div className="mt-1 text-gray-600 font-normal">
                                        Ritmo de {fmtH(ritmo.porDia)}/dia de vigência.{' '}
                                        {ritmo.encerrado
                                            ? <>Vigência encerrada com {fmtH(r.horasExecutadas)} das {fmtH(r.horasContratadas)} contratadas.</>
                                            : ritmo.faltando <= 0
                                                ? <>Horas contratadas já cumpridas.</>
                                                : ritmo.dataCompleta
                                                    ? <>Nesse ritmo, as {fmtH(r.horasContratadas)} se completam em <b>{fmtDate(ritmo.dataCompleta)}</b>{' '}
                                                        {ritmo.dataCompleta > ritmo.fim
                                                            ? <span className="text-red-600 font-semibold">— depois do fim da vigência</span>
                                                            : <span className="text-green-700 font-semibold">— dentro da vigência</span>}
                                                        ; projeção até {fmtDate(ritmo.fim)}: {fmtH(ritmo.projecao)}.</>
                                                    : <>Sem horas apontadas ainda — não há ritmo para projetar.</>}
                                    </div>
                                </div>

                                {ritmo.ultimo && ritmo.diasSemApontar > 7 && !ritmo.encerrado && (
                                    <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                                        <AlertTriangle size={12} className="mt-px shrink-0" />
                                        Último apontamento em {fmtDate(ritmo.ultimo)} — {ritmo.diasSemApontar} dias sem lançamento nesta obra.
                                    </div>
                                )}
                            </div>
                        )}
                        {ritmo?.semVigencia && (
                            <div className="mt-3 pt-3 border-t border-gray-50 text-[11px] text-gray-500">
                                Contrato sem vigência definida — sem prazo não dá para avaliar ritmo nem projetar o término.
                            </div>
                        )}

                        {/* Onde as horas saíram: máquina × mês */}
                        {matriz.linhas.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-gray-50">
                                <div className="text-[10px] uppercase font-bold text-gray-400 mb-2">Horas por máquina e mês</div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="text-[10px] uppercase text-gray-400 border-b">
                                                <th className="p-1.5 text-left font-bold">Máquina</th>
                                                {matriz.labels.map((l, i) => <th key={i} className="p-1.5 text-right font-bold whitespace-nowrap">{l}</th>)}
                                                <th className="p-1.5 text-right font-bold">Total</th>
                                                <th className="p-1.5 text-right font-bold">Dias</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {matriz.linhas.map((li) => (
                                                <tr key={li.vehicle.id} className="border-b border-gray-50">
                                                    <td className="p-1.5 font-semibold text-gray-700 whitespace-nowrap">
                                                        {li.vehicle.registroInterno || li.vehicle.placa}
                                                    </td>
                                                    {matriz.meses.map((m) => (
                                                        <td key={m} className={`p-1.5 text-right whitespace-nowrap ${li.porMes[m] ? 'text-gray-700' : 'text-gray-300'}`}>
                                                            {li.porMes[m] ? fmtH(li.porMes[m]) : '—'}
                                                        </td>
                                                    ))}
                                                    <td className="p-1.5 text-right font-bold text-gray-800 whitespace-nowrap">{fmtH(li.total)}</td>
                                                    <td className="p-1.5 text-right text-gray-500">{li.dias}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-gray-200">
                                                <td className="p-1.5 text-gray-500 font-semibold">Total</td>
                                                {porMes.map((m) => (
                                                    <td key={m.mes} className="p-1.5 text-right font-semibold text-gray-700 whitespace-nowrap">{fmtH(m.horas)}</td>
                                                ))}
                                                <td className="p-1.5 text-right font-bold text-gray-800 whitespace-nowrap">{fmtH(r.horasExecutadas)}</td>
                                                <td className="p-1.5 text-right font-semibold text-gray-700">{diasTrabalhados}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                                {diasParados > 0 && (
                                    <p className="text-[11px] text-gray-400 mt-1.5">
                                        {diasParados} dia(s) lançados com justificativa não somam horas — detalhe na aba Apontamentos.
                                    </p>
                                )}
                            </div>
                        )}

                        <p className="text-[11px] text-gray-400 mt-3">
                            Conta apenas as horas apontadas nas máquinas deste contrato, <b>na obra do contrato</b> e dentro da vigência.
                            Apontamentos com justificativa não somam horas.
                        </p>
                    </Card>

                    {/* Máquinas do contrato — horas e diesel por máquina (sem barra, para não confundir com progresso) */}
                    <Card title={`Máquinas do contrato (${r.equipamentos.length})`} icon={<Truck size={12} />}>
                        {r.equipamentos.length === 0 ? (
                            <div className="text-center text-gray-400 text-sm py-6">Nenhuma máquina vinculada a este contrato.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs min-w-[520px]">
                                    <thead>
                                        <tr className="text-left text-[10px] uppercase text-gray-400 border-b">
                                            <th className="p-2">Máquina</th>
                                            <th className="p-2 text-right">Horas exec.</th>
                                            <th className="p-2 text-right">Diesel (L)</th>
                                            <th className="p-2 text-right">Diesel (R$)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {r.equipamentos.map((e) => (
                                            <tr key={e.vehicle.id} className="border-b border-gray-50">
                                                <td className="p-2">
                                                    <span className="font-semibold text-gray-700">{e.vehicle.registroInterno || e.vehicle.placa}</span>
                                                    <span className="text-gray-400"> · {e.vehicle.tipo}{e.vehicle.modelo ? ` ${e.vehicle.modelo}` : ''}</span>
                                                    {e.horas === 0 && (
                                                        <span className="ml-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 whitespace-nowrap">sem horas</span>
                                                    )}
                                                </td>
                                                <td className="p-2 text-right text-gray-700">{fmtH(e.horas)}</td>
                                                <td className="p-2 text-right">{fmtL(e.litros)}</td>
                                                <td className="p-2 text-right text-blue-700">{fmtBRL(e.diesel)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 border-gray-200">
                                            <td className="p-2 text-gray-500 font-semibold">Total</td>
                                            <td className="p-2 text-right font-bold text-gray-800">{fmtH(r.horasExecutadas)}</td>
                                            <td className="p-2 text-right font-semibold text-gray-700">{fmtL(r.litros)}</td>
                                            <td className="p-2 text-right font-bold text-blue-700">{fmtBRL(r.diesel)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </Card>

                    {/* Abas de histórico */}
                    <Card>
                        <div className="flex gap-1 border-b border-gray-100 -mt-1">
                            {[['adiantamentos', <><Wallet size={13} /> Pagamentos ({adiantamentos.length})</>],
                              ['apontamentos', <><Clock size={13} /> Apontamentos ({apontamentos.length})</>],
                              ['abastecimentos', <><Droplet size={13} /> Abastecimentos ({abastecimentos.length})</>]].map(([key, label]) => (
                                <button key={key} onClick={() => setAba(key)}
                                    className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition
                                        ${aba === key ? 'border-purple-500 text-purple-700 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                    {label}
                                </button>
                            ))}
                        </div>

                        {aba === 'adiantamentos' && (
                            <div className="mt-3">
                                <ProtectedComponent requiredPermission="editor">
                                    <button onClick={onNovoAdiantamento}
                                        className="mb-3 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                                        <PlusCircle size={14} /> Lançar pagamento
                                    </button>
                                </ProtectedComponent>
                                {adiantamentos.length === 0 ? (
                                    <div className="text-center text-gray-400 text-sm py-8">
                                        <Wallet size={22} className="mx-auto mb-2 text-gray-300" />
                                        Nenhum pagamento lançado para este contrato ainda.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs min-w-[480px]">
                                            <thead>
                                                <tr className="text-left text-[10px] uppercase text-gray-400 border-b">
                                                    <th className="p-2">Data</th><th className="p-2">Referência</th>
                                                    <th className="p-2 text-right">Valor</th><th className="p-2 w-8"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {adiantamentos.map((p) => (
                                                    <tr key={p.id} className="border-b border-gray-50 align-top">
                                                        <td className="p-2 whitespace-nowrap text-gray-700">{fmtDate(p.data)}</td>
                                                        <td className="p-2">
                                                            <div className="text-gray-700">{p.descricao || <span className="text-gray-400">—</span>}</div>
                                                            {p.created_by_email && <div className="text-[10px] text-gray-400">{p.created_by_email}</div>}
                                                        </td>
                                                        <td className="p-2 text-right font-semibold text-gray-800 whitespace-nowrap">{fmtBRL(p.valor)}</td>
                                                        <td className="p-2 text-right">
                                                            <ProtectedComponent requiredPermission="editor">
                                                                <div className="flex items-center gap-1 justify-end">
                                                                    <button onClick={() => onEditAdiantamento(p)} title="Editar" className="p-1 text-gray-400 rounded hover:bg-gray-100 hover:text-gray-600"><Pencil size={12} /></button>
                                                                    <button onClick={() => onDeleteAdiantamento(p)} title="Excluir" className="p-1 text-red-400 rounded hover:bg-red-50 hover:text-red-600"><Trash2 size={12} /></button>
                                                                </div>
                                                            </ProtectedComponent>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="border-t-2 border-gray-200">
                                                    <td className="p-2 text-gray-500 font-semibold" colSpan={2}>Total pago</td>
                                                    <td className="p-2 text-right font-bold text-gray-800">{fmtBRL(totalAdiant)}</td><td></td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {aba === 'apontamentos' && (
                            <div className="mt-3">
                                {apontamentos.length === 0 ? (
                                    <div className="text-center text-gray-400 text-sm py-8">
                                        <Clock size={22} className="mx-auto mb-2 text-gray-300" />
                                        Nenhum apontamento das máquinas deste contrato no período.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs min-w-[560px]">
                                            <thead>
                                                <tr className="text-left text-[10px] uppercase text-gray-400 border-b">
                                                    <th className="p-2">Data</th><th className="p-2">Máquina</th>
                                                    <th className="p-2">Operador</th><th className="p-2 text-right">Horas</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {apontamentos.map((a, i) => (
                                                    <tr key={i} className="border-b border-gray-50 align-top">
                                                        <td className="p-2 whitespace-nowrap text-gray-700">{fmtDate(a.date)}</td>
                                                        <td className="p-2">
                                                            <span className="font-semibold text-gray-700">{a.vehicle?.registroInterno || a.vehicle?.placa || '—'}</span>
                                                            {a.vehicle?.tipo && <span className="text-gray-400"> · {a.vehicle.tipo}</span>}
                                                            {a.observation && <div className="text-[10px] text-gray-400">{a.observation}</div>}
                                                        </td>
                                                        <td className="p-2 text-gray-500">{a.employeeName || <span className="text-gray-300">—</span>}</td>
                                                        <td className="p-2 text-right whitespace-nowrap">
                                                            {a.justificativaTipo
                                                                ? <span className="text-amber-700 font-medium">{a.justificativaTipo}</span>
                                                                : <span className="font-semibold text-gray-800">{fmtH(a.horas)}</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="border-t-2 border-gray-200">
                                                    <td className="p-2 text-gray-500 font-semibold" colSpan={3}>
                                                        Total executado · {diasTrabalhados} dia(s){diasParados > 0 ? ` · ${diasParados} parado(s)` : ''}
                                                    </td>
                                                    <td className="p-2 text-right font-bold text-gray-800">{fmtH(r.horasExecutadas)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {aba === 'abastecimentos' && (
                            <div className="mt-3">
                                {abastecimentos.length === 0 ? (
                                    <div className="text-center text-gray-400 text-sm py-8">
                                        <Droplet size={22} className="mx-auto mb-2 text-gray-300" />
                                        Nenhum abastecimento das máquinas deste contrato no período.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs min-w-[520px]">
                                            <thead>
                                                <tr className="text-left text-[10px] uppercase text-gray-400 border-b">
                                                    <th className="p-2">Data</th><th className="p-2">Máquina</th><th className="p-2">Fonte</th>
                                                    <th className="p-2 text-right">Litros</th><th className="p-2 text-right">Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {abastecimentos.map((a, i) => (
                                                    <tr key={i} className="border-b border-gray-50">
                                                        <td className="p-2 whitespace-nowrap text-gray-700">{fmtDate(a.date)}</td>
                                                        <td className="p-2">
                                                            <span className="font-semibold text-gray-700">{a.vehicle?.registroInterno || a.vehicle?.placa || '—'}</span>
                                                            {a.vehicle?.tipo && <span className="text-gray-400"> · {a.vehicle.tipo}</span>}
                                                        </td>
                                                        <td className="p-2 text-gray-500">{a.fonte === 'comboio' ? 'Comboio' : 'Posto'}</td>
                                                        <td className="p-2 text-right">{fmtL(a.litros)}</td>
                                                        <td className="p-2 text-right text-blue-700">{fmtBRL(a.valor)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="border-t-2 border-gray-200">
                                                    <td className="p-2 text-gray-500 font-semibold" colSpan={3}>Total abatido</td>
                                                    <td className="p-2 text-right font-semibold text-gray-700">{fmtL(r.litros)}</td>
                                                    <td className="p-2 text-right font-bold text-blue-700">{fmtBRL(r.diesel)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Ficha lateral */}
                <div className="space-y-4">
                    <DocumentoOficialPanel
                        contrato={c}
                        docs={docsAssinados}
                        loading={assinadoLoading}
                        onEnviar={onEnviarAssinado}
                        onBaixar={onBaixarAssinado}
                        onBaixarDoc={onBaixarDocAssinado}
                        onRemover={onRemoverAssinado}
                    />

                    <AditivosPanel
                        contrato={c}
                        aditivos={r.aditivos}
                        loadingId={aditivoLoadingId}
                        onNovo={onNovoAditivo}
                        onEditar={onEditAditivo}
                        onExcluir={onDeleteAditivo}
                        onGerarPdf={onGerarAditivoPdf}
                        onEnviarAssinado={onEnviarAditivoAssinado}
                        onBaixarAssinado={onBaixarAditivoAssinado}
                        onRemoverAssinado={onRemoverAditivoAssinado}
                    />

                    <Card title="Vigência e escopo" icon={<CalendarRange size={12} />}>
                        <Campo label="Início">{fmtDate(c.vigenciaInicio)}</Campo>
                        <Campo label="Término">
                            {fmtDate(r.vigenciaFim)}
                            {r.temAditivos && r.vigenciaFim !== c.vigenciaFim && (
                                <span className="block text-[10px] font-normal text-gray-400">original {fmtDate(c.vigenciaFim)}</span>
                            )}
                        </Campo>
                        {c.prazoVigenciaMeses != null && <Campo label="Prazo">{c.prazoVigenciaMeses} meses</Campo>}
                        <Campo label="Modalidade">{c.contractType === 'fechado' ? 'Valor fechado' : 'Por horas'}</Campo>
                        <Campo label="Horas contratadas">{fmtH(r.horasContratadas)}</Campo>
                        {c.tipoMaquina && <Campo label="Subgrupo">{c.tipoMaquina}</Campo>}
                        <Campo label="Máquinas vinculadas">{r.numMaquinas}</Campo>
                    </Card>

                    <Card title="Condições comerciais" icon={<Gavel size={12} />}>
                        {c.prazoPagamentoDias != null && <Campo label="Prazo de pagamento">{c.prazoPagamentoDias} dias</Campo>}
                        {c.percentualJurosMora != null && <Campo label="Juros de mora">{fmtPct(c.percentualJurosMora)} a.m.</Campo>}
                        {c.percentualMultaMora != null && <Campo label="Multa de mora">{fmtPct(c.percentualMultaMora)}</Campo>}
                        {c.percentualMultaInadimplemento != null && <Campo label="Multa por inadimplemento">{fmtPct(c.percentualMultaInadimplemento)}</Campo>}
                        {c.prazoInicioServicoHoras != null && <Campo label="Início do serviço">{c.prazoInicioServicoHoras} h</Campo>}
                        {c.prazoSubstituicaoHoras != null && <Campo label="Substituição de máquina">{c.prazoSubstituicaoHoras} h</Campo>}
                        {c.avisoPrevioRescisaoDias != null && <Campo label="Aviso prévio de rescisão">{c.avisoPrevioRescisaoDias} dias</Campo>}
                        {c.foroComarca && <Campo label="Foro">{c.foroComarca}</Campo>}
                    </Card>

                    {(c.contratadaRepresentanteNome || c.contratadaRepresentanteCpf) && (
                        <Card title="Representante da contratada" icon={<Info size={12} />}>
                            <Campo label="Nome">{c.contratadaRepresentanteNome || '—'}</Campo>
                            {c.contratadaRepresentanteQualificacao && <Campo label="Qualificação">{c.contratadaRepresentanteQualificacao}</Campo>}
                            {c.contratadaRepresentanteCpf && <Campo label="CPF">{c.contratadaRepresentanteCpf}</Campo>}
                        </Card>
                    )}

                    {c.observacoes && (
                        <Card title="Observações">
                            <p className="text-xs text-gray-600 whitespace-pre-wrap">{c.observacoes}</p>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ContratoDetalhe;
