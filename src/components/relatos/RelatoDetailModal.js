import React, { useState } from 'react';
import { X, Loader2, Save, ExternalLink, ClipboardList, FileText, CheckCircle2 } from 'lucide-react';
import { GravidadeBadge } from './GravidadeBadge';
import {
    ITEM_STATUS, ITEM_STATUS_ESTILO, RELATO_STATUS_ESTILO,
} from '../../utils/relatoGravidade';
import { loadLogoDataUrl } from '../../utils/orderPdf';
import { generateRelatoPDF, buildRelatoFileName } from './relatoPdf';

// Ficha completa do relato, na ordem das seções do formulário impresso.
// A seção 6 ("USO EXCLUSIVO DA MANUTENÇÃO / OFICINA") é editável aqui mesmo
// depois do fechamento — é o campo que a oficina preenche ao longo do reparo.

const formatarData = (ymd) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('pt-BR') : '—');
const formatarMoeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

const Campo = ({ label, valor, className = '' }) => (
    <div className={className}>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-800 break-words">{valor || '—'}</p>
    </div>
);

const Secao = ({ n, titulo, children, acao = null }) => (
    <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
                <span className="w-5 h-5 bg-slate-800 text-white rounded text-[11px] font-bold flex items-center justify-center">{n}</span>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">{titulo}</h3>
            </div>
            {acao}
        </div>
        {children}
    </div>
);

const RelatoDetailModal = ({ relato, vehicle = null, apiClient, navigate, setAlertMessage, onClose, onChanged }) => {
    const [secao6, setSecao6] = useState({
        recebidoEm: relato.recebidoEm || '',
        responsavelManutencao: relato.responsavelManutencao || '',
        providenciaAdotada: relato.providenciaAdotada || '',
    });
    const [salvando, setSalvando] = useState(false);
    const [itemOcupado, setItemOcupado] = useState(null);
    const [gerandoPdf, setGerandoPdf] = useState(false);
    const [concluindo, setConcluindo] = useState(false);
    const [erro, setErro] = useState('');

    // Conclusão manual: a ordem só vira 'Concluída' quando a NF é lançada em
    // Ordens (C/S), o que costuma demorar bem mais do que o serviço em si.
    const concluir = async () => {
        setConcluindo(true);
        setErro('');
        try {
            const r = await apiClient.concluirRelato(relato.id, {
                providenciaAdotada: secao6.providenciaAdotada,
                responsavelManutencao: secao6.responsavelManutencao,
                liberarVeiculo: true,
            });
            setAlertMessage?.(
                r.veiculoLiberado
                    ? `${r.message} Equipamento liberado para a frota.`
                    : `${r.message} O equipamento segue em manutenção (há outro relato aberto).`
            );
            await onChanged?.();
        } catch (e) {
            setErro(e.message || 'Erro ao concluir o relato.');
        } finally {
            setConcluindo(false);
        }
    };

    const baixarPdf = async () => {
        setGerandoPdf(true);
        setErro('');
        try {
            const logo = await loadLogoDataUrl();
            generateRelatoPDF(relato, vehicle, logo, false, buildRelatoFileName(relato, vehicle));
        } catch (e) {
            setErro(e.message || 'Erro ao gerar o PDF da ficha.');
        } finally {
            setGerandoPdf(false);
        }
    };

    const terminal = ['Concluído', 'Cancelado'].includes(relato.status);

    const salvarSecao6 = async () => {
        setSalvando(true);
        setErro('');
        try {
            await apiClient.updateRelato(relato.id, secao6);
            setAlertMessage?.('Dados da oficina atualizados.');
            await onChanged?.();
        } catch (e) {
            setErro(e.message || 'Erro ao salvar os dados da oficina.');
        } finally {
            setSalvando(false);
        }
    };

    const moverItem = async (item, status) => {
        setItemOcupado(item.id);
        setErro('');
        try {
            await apiClient.updateRelatoItemStatus(relato.id, item.id, { status });
            await onChanged?.();
        } catch (e) {
            setErro(e.message || 'Erro ao mover o item.');
        } finally {
            setItemOcupado(null);
        }
    };

    const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none';
    const labelCls = 'block text-[11px] font-bold text-gray-600 mb-1 uppercase tracking-wide';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
                <div className="px-5 py-3 border-b bg-slate-50 flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <ClipboardList size={18} className="text-slate-700" />
                        <div>
                            <h2 className="text-sm font-bold text-slate-900">Relato #{relato.numero}</h2>
                            <p className="text-[10px] text-slate-500">FRM-MAN-001 Rev. 01</p>
                        </div>
                        <span className={`ml-2 text-[10px] font-bold px-2 py-1 rounded-full border ${RELATO_STATUS_ESTILO[relato.status] || ''}`}>
                            {relato.status}
                        </span>
                        {relato.osMc && (
                            <span className="text-[10px] font-bold text-slate-700 bg-slate-200 px-2 py-1 rounded" title="Ordem de Serviço do sistema MC">
                                OS MC {relato.osMc}
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X size={18} /></button>
                </div>

                <div className="p-5 space-y-6 overflow-y-auto">
                    {erro && (
                        <div className="p-3 bg-red-50 border border-red-300 text-red-800 rounded-lg text-xs font-bold">{erro}</div>
                    )}

                    <Secao n={1} titulo="Identificação do Relator">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <Campo label="Colaborador" valor={relato.relatorNome} />
                            <Campo label="Função / cargo" valor={relato.relatorFuncao} />
                            <Campo label="Filial / cidade" valor={relato.filialCidade} />
                            <Campo label="Data do relato" valor={formatarData(relato.dataRelato)} />
                        </div>
                    </Secao>

                    <Secao n={2} titulo="Identificação do Veículo / Equipamento">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <Campo label="Modelo" valor={relato.veiculoModelo} className="md:col-span-2" />
                            <Campo label="Placa" valor={relato.veiculoPlaca} />
                            <Campo label="Nº de frota" valor={relato.veiculoFrota} />
                            <Campo
                                label="Leitura"
                                valor={[
                                    relato.hodometro != null ? `${Number(relato.hodometro).toLocaleString('pt-BR')} Km` : null,
                                    relato.horimetro != null ? `${Number(relato.horimetro).toLocaleString('pt-BR')} H` : null,
                                ].filter(Boolean).join(' · ')}
                            />
                        </div>
                    </Secao>

                    <Secao n={4} titulo="Itens / Problemas Identificados">
                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                            <table className="w-full min-w-[760px] text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                                        <th className="px-2 py-2 text-left w-10">Nº</th>
                                        <th className="px-2 py-2 text-center w-14">Grav.</th>
                                        <th className="px-2 py-2 text-left w-48">Item / componente</th>
                                        <th className="px-2 py-2 text-left">Problema observado</th>
                                        <th className="px-2 py-2 text-left w-40">Executor</th>
                                        <th className="px-2 py-2 text-center w-24">Prazo</th>
                                        <th className="px-2 py-2 text-center w-40">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {(relato.itens || []).map(item => (
                                        <tr key={item.id} className="hover:bg-gray-50 align-top">
                                            <td className="px-2 py-2 text-xs font-bold text-gray-400">{item.sequencia}</td>
                                            <td className="px-2 py-2 text-center"><GravidadeBadge gravidade={item.gravidade} size="sm" /></td>
                                            <td className="px-2 py-2 text-gray-800">{item.itemComponente}</td>
                                            <td className="px-2 py-2 text-gray-600 text-xs">
                                                {item.descricaoProblema}
                                                {item.servicoDescricao && (
                                                    <div className="text-[11px] text-blue-700 mt-1">→ {item.servicoDescricao}</div>
                                                )}
                                            </td>
                                            <td className="px-2 py-2 text-xs">
                                                <div className="text-gray-700">{item.executorNome || (item.executorTipo === 'interno' ? 'MAK (oficina própria)' : '—')}</div>
                                                {item.valorEstimado != null && (
                                                    <div className="text-[11px] text-gray-400">{formatarMoeda(item.valorEstimado)}</div>
                                                )}
                                                {(item.ordens || []).map(o => (
                                                    <button
                                                        key={o.id}
                                                        onClick={() => navigate?.('orders')}
                                                        className="mt-1 flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline"
                                                        title={`Ordem ${o.status}`}
                                                    >
                                                        <ExternalLink size={10} /> Ordem #{o.orderNumber}
                                                    </button>
                                                ))}
                                            </td>
                                            <td className="px-2 py-2 text-center text-xs text-gray-600">
                                                {item.dataConclusaoPrevista
                                                    ? formatarData(item.dataConclusaoPrevista)
                                                    : item.slaDiasUteis ? `${item.slaDiasUteis} d.ú.` : '—'}
                                                {item.dataConclusaoReal && (
                                                    <div className="text-[10px] text-green-600 font-bold">
                                                        feito {formatarData(item.dataConclusaoReal)}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-2 py-2 text-center">
                                                {itemOcupado === item.id ? (
                                                    <Loader2 size={14} className="animate-spin text-gray-400 mx-auto" />
                                                ) : (
                                                    <select
                                                        value={item.status}
                                                        onChange={e => moverItem(item, e.target.value)}
                                                        className={`text-[10px] font-bold px-2 py-1 rounded-full border outline-none cursor-pointer ${ITEM_STATUS_ESTILO[item.status] || ''}`}
                                                    >
                                                        {ITEM_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {(relato.itens || []).length === 0 && (
                                        <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-400">Nenhum item lançado nesta ficha.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Secao>

                    <Secao n={5} titulo="Observações Gerais / Histórico do Problema">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100">
                            {relato.observacoesGerais || 'Sem observações.'}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Campo label="Assinatura do colaborador" valor={relato.assinaturaColaborador} />
                            <Campo label="Assinatura do encarregado / supervisor" valor={relato.assinaturaSupervisor} />
                        </div>
                    </Secao>

                    <Secao
                        n={6}
                        titulo="Uso Exclusivo da Manutenção / Oficina"
                        acao={!terminal && (
                            <button
                                onClick={salvarSecao6}
                                disabled={salvando}
                                className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold rounded-lg disabled:opacity-40"
                            >
                                {salvando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
                            </button>
                        )}
                    >
                        {terminal ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <Campo label="Recebido em" valor={formatarData(relato.recebidoEm)} />
                                <Campo label="Responsável" valor={relato.responsavelManutencao} />
                                <Campo label="Concluído em" valor={formatarData(relato.concluidoEm)} />
                                <Campo label="Providência adotada" valor={relato.providenciaAdotada} className="md:col-span-4" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className={labelCls}>Recebido em</label>
                                    <input type="date" value={secao6.recebidoEm || ''} onChange={e => setSecao6(p => ({ ...p, recebidoEm: e.target.value }))} className={inputCls} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelCls}>Responsável</label>
                                    <input value={secao6.responsavelManutencao || ''} onChange={e => setSecao6(p => ({ ...p, responsavelManutencao: e.target.value }))} className={inputCls} placeholder="Quem recebeu o equipamento na oficina" />
                                </div>
                                <div className="md:col-span-3">
                                    <label className={labelCls}>Providência adotada</label>
                                    <textarea value={secao6.providenciaAdotada || ''} onChange={e => setSecao6(p => ({ ...p, providenciaAdotada: e.target.value }))} rows={3} className={`${inputCls} resize-none`} placeholder="O que a oficina fez / vai fazer" />
                                </div>
                            </div>
                        )}
                    </Secao>
                </div>

                <div className="px-5 py-3 border-t bg-gray-50 flex justify-between items-center gap-3 flex-shrink-0">
                    <button
                        onClick={baixarPdf}
                        disabled={gerandoPdf}
                        className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg disabled:opacity-40"
                        title="Baixar a ficha preenchida em PDF"
                    >
                        {gerandoPdf ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                        Baixar ficha (PDF)
                    </button>
                    <div className="flex gap-2">
                        {relato.status === 'Em Execução' && (
                            <button
                                onClick={concluir}
                                disabled={concluindo}
                                title="Marca todos os itens como concluídos e devolve o equipamento à frota"
                                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg shadow disabled:opacity-40"
                            >
                                {concluindo ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                Concluir relato
                            </button>
                        )}
                        <button onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg">
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RelatoDetailModal;
