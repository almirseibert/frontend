import React, { useMemo, useRef, useState } from 'react';
import {
    X, FileText, FileDown, Pencil, Trash2, Loader, Clock, Wallet, Droplet,
    PlusCircle, AlertTriangle, Building2, ShieldCheck, UploadCloud, Download, History, Lock,
} from 'lucide-react';
import ProtectedComponent from '../ProtectedComponent';
import { getContratoAbastecimentos } from '../../utils/terceirizados';

const fmtBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtH = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h';
const fmtL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' L';
const fmtDate = (v) => {
    if (!v) return '—';
    const d = v instanceof Date ? v : new Date(String(v).includes('T') ? v : `${String(v).split(' ')[0]}T00:00:00`);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};
const saldoClass = (v) => (v > 0 ? 'text-red-600' : v < 0 ? 'text-blue-600' : 'text-green-600');

// Paleta categórica para a barra de composição do plano (distinta do roxo do progresso).
const PLANO_CORES = ['#8b5cf6', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#64748b', '#f43f5e', '#14b8a6'];

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

const fmtDateTime = (v) => {
    if (!v) return '—';
    const d = new Date(String(v).includes('T') ? v : String(v).replace(' ', 'T'));
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

/**
 * Painel do documento oficial (contrato assinado). Dois estados:
 *  - Sem assinado: minuta é rascunho; oferece envio do PDF assinado.
 *  - Com assinado: mostra vigente + baixar/substituir/remover + histórico. Enquanto
 *    houver assinado, minuta/edição/exclusão ficam bloqueadas (backend also enforces).
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
        <div className={`rounded-lg border p-3 ${assinado ? 'border-purple-200 bg-purple-50/40' : 'border-gray-200 bg-gray-50'}`}>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={onFile} />
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-gray-400 mb-2">
                <ShieldCheck size={12} /> Documento oficial
            </div>

            {assinado ? (
                <>
                    <div className="flex items-center gap-2 text-sm font-semibold text-purple-800">
                        <ShieldCheck size={15} className="text-purple-600" />
                        {contrato.contratoAssinadoNome || 'Contrato assinado.pdf'}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                        Assinado em {fmtDateTime(contrato.contratoAssinadoEm)}
                        {contrato.contratoAssinadoPor ? ` · ${contrato.contratoAssinadoPor}` : ''}
                    </div>
                    <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-1">
                        <Lock size={11} /> Minuta, edição e exclusão bloqueadas enquanto houver contrato assinado.
                    </div>

                    {confirmando ? (
                        <div className="flex items-center gap-2 mt-3 text-xs">
                            <span className="text-gray-600 font-medium">Remover o contrato assinado? Ele fica no histórico.</span>
                            <button onClick={() => { setConfirmando(false); onRemover(); }} disabled={loading}
                                className="px-2.5 py-1 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-60">Remover</button>
                            <button onClick={() => setConfirmando(false)}
                                className="px-2.5 py-1 bg-gray-200 rounded-lg font-medium hover:bg-gray-300">Cancelar</button>
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
                                {loading ? <Loader size={13} className="animate-spin" /> : <UploadCloud size={13} />} Enviar nova versão
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
                                            {fmtDateTime(d.enviadoEm)}{d.enviadoPor ? ` · ${d.enviadoPor}` : ''}
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
 * ContratoDetalheModal — detalhe de um contrato de terceirizado.
 * Números do contrato + históricos de adiantamento e abastecimento.
 * O lançamento/edição/exclusão de adiantamento é delegado ao pai (via callbacks).
 *
 * Props:
 *  r            resultado de computeContrato (contrato, valorTotal, diesel, adiantamentos, saldo, ...)
 *  terceiro     locador
 *  obraNome     (id) => nome
 *  ctx          contexto de dados (vehicles/refuelings/comboio/partners) p/ abastecimentos
 *  adiantamentos [{ id, data, valor, descricao, created_by_email }]
 *  pdfLoading   bool
 *  onClose, onGerarPdf, onEditContrato, onDeleteContrato
 *  onNovoAdiantamento, onEditAdiantamento(p), onDeleteAdiantamento(p)
 */
const ContratoDetalheModal = ({
    r, terceiro, obraNome, ctx, adiantamentos = [], pdfLoading,
    docsAssinados = [], assinadoLoading, onEnviarAssinado, onBaixarAssinado, onBaixarDocAssinado, onRemoverAssinado,
    onClose, onGerarPdf, onEditContrato, onDeleteContrato,
    onNovoAdiantamento, onEditAdiantamento, onDeleteAdiantamento,
}) => {
    const c = r.contrato;
    const assinado = !!c.contratoAssinadoUrl;
    const [aba, setAba] = useState('adiantamentos'); // 'adiantamentos' | 'abastecimentos'

    const abastecimentos = useMemo(() => getContratoAbastecimentos(c, ctx), [c, ctx]);
    const totalAdiant = adiantamentos.reduce((a, p) => a + (Number(p.valor) || 0), 0);
    const semMaquina = (c.status || 'ativo') === 'ativo' && r.numMaquinas === 0;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[92vh] overflow-y-auto">
                {/* Cabeçalho */}
                <div className="flex items-start justify-between p-4 border-b sticky top-0 bg-white z-10">
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <FileText size={18} className="text-purple-500" />
                            <span className="text-lg font-bold text-gray-800">{c.numero}</span>
                            <StatusBadge status={c.status} />
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                            {terceiro?.razaoSocial || '—'} · <Building2 size={12} /> {obraNome(c.obraId)}
                            {c.tipoMaquina ? ` · ${c.tipoMaquina}` : ''}
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button onClick={() => onGerarPdf(c)} disabled={pdfLoading || assinado}
                            title={assinado ? 'Contrato assinado — minuta bloqueada' : 'Baixar minuta (rascunho) do contrato'}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-60">
                            {pdfLoading ? <Loader size={13} className="animate-spin" /> : <FileDown size={13} />} Minuta
                        </button>
                        <ProtectedComponent requiredPermission="editor">
                            <button onClick={onEditContrato} disabled={assinado}
                                title={assinado ? 'Contrato assinado — edição bloqueada' : 'Editar contrato'}
                                className="p-1.5 text-gray-500 rounded-lg hover:bg-gray-200 disabled:opacity-40"><Pencil size={14} /></button>
                            <button onClick={onDeleteContrato} disabled={assinado}
                                title={assinado ? 'Contrato assinado — exclusão bloqueada' : 'Excluir contrato'}
                                className="p-1.5 text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-40"><Trash2 size={14} /></button>
                        </ProtectedComponent>
                        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 ml-1"><X size={18} /></button>
                    </div>
                </div>

                <div className="p-4">
                    {/* Documento oficial (contrato assinado) */}
                    <div className="mb-4">
                        <DocumentoOficialPanel
                            contrato={c}
                            docs={docsAssinados}
                            loading={assinadoLoading}
                            onEnviar={onEnviarAssinado}
                            onBaixar={onBaixarAssinado}
                            onBaixarDoc={onBaixarDocAssinado}
                            onRemover={onRemoverAssinado}
                        />
                    </div>

                    {/* Números */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-gray-50 rounded-lg p-3"><div className="text-[10px] uppercase font-bold text-gray-400">Valor contrato</div><div className="text-sm font-bold text-gray-800">{fmtBRL(r.valorTotal)}</div></div>
                        <div className="bg-gray-50 rounded-lg p-3"><div className="text-[10px] uppercase font-bold text-gray-400">Diesel abatido</div><div className="text-sm font-bold text-blue-700">{fmtBRL(r.diesel)}</div></div>
                        <div className="bg-gray-50 rounded-lg p-3"><div className="text-[10px] uppercase font-bold text-gray-400">Pagamentos</div><div className="text-sm font-bold text-gray-700">{fmtBRL(r.adiantamentos)}</div></div>
                        <div className="bg-gray-50 rounded-lg p-3"><div className="text-[10px] uppercase font-bold text-gray-400">Saldo a pagar</div><div className={`text-sm font-bold ${saldoClass(r.saldo)}`}>{fmtBRL(r.saldo)}</div></div>
                    </div>

                    {/* Progresso físico */}
                    <div className="mt-3">
                        <div className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1 mb-1"><Clock size={11} /> Progresso físico</div>
                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                                <div className="h-full bg-purple-500" style={{ width: `${Math.max(0, Math.min(1, r.progresso || 0)) * 100}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">{fmtH(r.horasExecutadas)} / {fmtH(r.horasContratadas)}</span>
                        </div>
                    </div>

                    {semMaquina && (
                        <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                            <AlertTriangle size={13} /> Contrato ativo sem máquina vinculada — nenhum diesel é abatido. Edite o contrato e marque a máquina.
                        </div>
                    )}
                    {r.saldo < 0 && (
                        <p className="text-[11px] text-blue-600 mt-3">
                            ⚠ Diesel + pagamentos já ultrapassaram o valor do contrato — o terceiro deve {fmtBRL(-r.saldo)} à MAK.
                        </p>
                    )}

                    {/* Plano contratado por subgrupo — composição do valor (por horas quando é valor fechado sem valor/hora) */}
                    {r.itensContratados.length > 0 && (() => {
                        // Fechado: itens têm valorHora=0, então a composição é feita por HORAS, não por valor.
                        const totalSubtotal = r.itensContratados.reduce((a, it) => a + it.subtotal, 0);
                        const totalHoras = r.itensContratados.reduce((a, it) => a + it.horas, 0);
                        const porValor = totalSubtotal > 0;
                        return (
                            <div className="mt-5">
                                <div className="text-[10px] uppercase font-bold text-gray-400 mb-2">
                                    Plano contratado por subgrupo{porValor ? '' : ' (por horas)'}
                                </div>
                                {/* Barra de composição: uma única barra fatiada por subgrupo */}
                                <div className="flex w-full h-3 rounded-full overflow-hidden mb-2.5">
                                    {r.itensContratados.map((it, i) => {
                                        const share = porValor
                                            ? (totalSubtotal > 0 ? (it.subtotal / totalSubtotal) * 100 : 0)
                                            : (totalHoras > 0 ? (it.horas / totalHoras) * 100 : 0);
                                        const title = porValor ? `${it.type}: ${fmtBRL(it.subtotal)}` : `${it.type}: ${fmtH(it.horas)}`;
                                        return <div key={i} title={title} style={{ width: `${share}%`, background: PLANO_CORES[i % PLANO_CORES.length] }} />;
                                    })}
                                </div>
                                <div className="space-y-1">
                                    {r.itensContratados.map((it, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs">
                                            <span className="flex items-center gap-1.5 font-semibold text-gray-700">
                                                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PLANO_CORES[i % PLANO_CORES.length] }} />
                                                {it.type}
                                            </span>
                                            <span className="text-gray-500">
                                                {porValor
                                                    ? <>{fmtH(it.horas)} × {fmtBRL(it.valorHora)}/h · <span className="font-bold text-gray-800">{fmtBRL(it.subtotal)}</span></>
                                                    : <span className="font-bold text-gray-800">{fmtH(it.horas)}</span>}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Máquinas do contrato — horas e diesel por máquina (sem barra, para não confundir com progresso) */}
                    {r.equipamentos.length > 0 && (
                        <div className="mt-5">
                            <div className="text-[10px] uppercase font-bold text-gray-400 mb-2">Máquinas do contrato</div>
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-left text-[10px] uppercase text-gray-400 border-b">
                                        <th className="p-1.5">Máquina</th>
                                        <th className="p-1.5 text-right">Horas exec.</th>
                                        <th className="p-1.5 text-right">Diesel (L)</th>
                                        <th className="p-1.5 text-right">Diesel (R$)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {r.equipamentos.map((e) => (
                                        <tr key={e.vehicle.id} className="border-b border-gray-50">
                                            <td className="p-1.5">
                                                <span className="font-semibold text-gray-700">{e.vehicle.registroInterno || e.vehicle.placa}</span>
                                                <span className="text-gray-400"> · {e.vehicle.tipo}{e.vehicle.modelo ? ` ${e.vehicle.modelo}` : ''}</span>
                                            </td>
                                            <td className="p-1.5 text-right text-gray-700">{fmtH(e.horas)}</td>
                                            <td className="p-1.5 text-right">{fmtL(e.litros)}</td>
                                            <td className="p-1.5 text-right text-blue-700">{fmtBRL(e.diesel)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Abas de histórico */}
                    <div className="flex gap-1 mt-5 border-b border-gray-100">
                        {[['adiantamentos', <><Wallet size={13} /> Pagamentos ({adiantamentos.length})</>],
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
                                    className="w-full mb-3 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                                    <PlusCircle size={14} /> Lançar pagamento
                                </button>
                            </ProtectedComponent>
                            {adiantamentos.length === 0 ? (
                                <div className="text-center text-gray-400 text-sm py-8">
                                    <Wallet size={22} className="mx-auto mb-2 text-gray-300" />
                                    Nenhum pagamento lançado para este contrato ainda.
                                </div>
                            ) : (
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-left text-[10px] uppercase text-gray-400 border-b">
                                            <th className="p-1.5">Data</th><th className="p-1.5">Referência</th>
                                            <th className="p-1.5 text-right">Valor</th><th className="p-1.5 w-8"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {adiantamentos.map((p) => (
                                            <tr key={p.id} className="border-b border-gray-50 align-top">
                                                <td className="p-1.5 whitespace-nowrap text-gray-700">{fmtDate(p.data)}</td>
                                                <td className="p-1.5">
                                                    <div className="text-gray-700">{p.descricao || <span className="text-gray-400">—</span>}</div>
                                                    {p.created_by_email && <div className="text-[10px] text-gray-400">{p.created_by_email}</div>}
                                                </td>
                                                <td className="p-1.5 text-right font-semibold text-gray-800 whitespace-nowrap">{fmtBRL(p.valor)}</td>
                                                <td className="p-1.5 text-right">
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
                                            <td className="p-1.5 text-gray-500 font-semibold" colSpan={2}>Total pago</td>
                                            <td className="p-1.5 text-right font-bold text-gray-800">{fmtBRL(totalAdiant)}</td><td></td>
                                        </tr>
                                    </tfoot>
                                </table>
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
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-left text-[10px] uppercase text-gray-400 border-b">
                                            <th className="p-1.5">Data</th><th className="p-1.5">Máquina</th><th className="p-1.5">Fonte</th>
                                            <th className="p-1.5 text-right">Litros</th><th className="p-1.5 text-right">Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {abastecimentos.map((a, i) => (
                                            <tr key={i} className="border-b border-gray-50">
                                                <td className="p-1.5 whitespace-nowrap text-gray-700">{fmtDate(a.date)}</td>
                                                <td className="p-1.5">
                                                    <span className="font-semibold text-gray-700">{a.vehicle?.registroInterno || a.vehicle?.placa || '—'}</span>
                                                    {a.vehicle?.tipo && <span className="text-gray-400"> · {a.vehicle.tipo}</span>}
                                                </td>
                                                <td className="p-1.5 text-gray-500">{a.fonte === 'comboio' ? 'Comboio' : 'Posto'}</td>
                                                <td className="p-1.5 text-right">{fmtL(a.litros)}</td>
                                                <td className="p-1.5 text-right text-blue-700">{fmtBRL(a.valor)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 border-gray-200">
                                            <td className="p-1.5 text-gray-500 font-semibold" colSpan={3}>Total abatido</td>
                                            <td className="p-1.5 text-right font-semibold text-gray-700">{fmtL(r.litros)}</td>
                                            <td className="p-1.5 text-right font-bold text-blue-700">{fmtBRL(r.diesel)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ContratoDetalheModal;
