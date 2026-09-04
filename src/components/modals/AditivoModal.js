import React, { useState, useMemo } from 'react';
import { X, Loader, Save, FilePlus2, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { vehicleSubTypes, equipmentTypesForHours } from '../../utils/vehicleRules';
import CurrencyInput from '../ui/CurrencyInput';

const fmtBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtHInt = (n) => `${Math.round(Number(n) || 0).toLocaleString('pt-BR')} h`;
const numOf = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

// Espelha utils/contratoAditivos.js no backend — aqui só para pré-visualizar o
// resultado enquanto o usuário digita. Quem valida e grava é o servidor.
const TIPOS = [
    { id: 'acrescimo', label: 'Acréscimo de horas', hint: 'Mais horas de equipamento já contratado, ao mesmo preço.' },
    { id: 'supressao', label: 'Supressão de horas', hint: 'Reduz horas de equipamento já contratado.' },
    { id: 'escopo', label: 'Incluir equipamento', hint: 'Equipamento que não estava no contrato, com preço próprio.' },
    { id: 'reajuste', label: 'Reajuste de preço', hint: 'Muda o valor/hora, mantendo as horas contratadas.' },
    { id: 'prazo', label: 'Prorrogar prazo', hint: 'Só estende a vigência — não mexe em horas nem valores.' },
];

/**
 * AditivoModal — cria ou edita a MINUTA de um termo aditivo.
 *
 * Aditivo não é edição do contrato: grava só o DELTA sobre o contrato original.
 * Enquanto está em minuta não move número nenhum; os valores do contrato só mudam
 * quando o termo aditivo ASSINADO é enviado.
 *
 * Props:
 *  contrato   linha do contrato (com bloco `vigente` vindo da API)
 *  aditivo    aditivo em edição (minuta) ou null para novo
 *  apiClient, setAlertMessage, onClose, onSaved
 */
const AditivoModal = ({ contrato, aditivo = null, apiClient, setAlertMessage, onClose, onSaved }) => {
    const vigente = contrato?.vigente || {};
    const itensVigentes = useMemo(
        () => (Array.isArray(vigente.itensContratados) ? vigente.itensContratados : []),
        [vigente.itensContratados]
    );
    const fechado = contrato?.contractType === 'fechado';

    const [tipo, setTipo] = useState(aditivo?.tipo || 'acrescimo');
    const [linhas, setLinhas] = useState(() => (Array.isArray(aditivo?.itensDelta) ? aditivo.itensDelta : []).map((i) => ({
        type: i.type,
        hours: i.hours != null ? String(Math.abs(Number(i.hours))) : '',
        price: i.price != null ? String(i.price) : '',
    })));
    const [novaVigenciaFim, setNovaVigenciaFim] = useState(
        aditivo?.novaVigenciaFim ? String(aditivo.novaVigenciaFim).split('T')[0] : '');
    const [valorDeltaFechado, setValorDeltaFechado] = useState(
        aditivo?.valorDelta != null ? String(Math.abs(Number(aditivo.valorDelta))) : '');
    const [justificativa, setJustificativa] = useState(aditivo?.justificativa || '');
    const [observacoes, setObservacoes] = useState(aditivo?.observacoes || '');
    const [isSaving, setIsSaving] = useState(false);
    // Acréscimo acumulado acima de 25% do valor original: o backend devolve 409 e
    // pede confirmação explícita antes de gravar.
    const [confirmacao, setConfirmacao] = useState(null);

    // Subgrupos disponíveis: os do contrato, ou o catálogo inteiro quando o aditivo
    // é de escopo (é justamente para incluir o que não está lá).
    const equipmentOptions = useMemo(() => {
        const opts = [];
        equipmentTypesForHours.forEach((t) => {
            const subs = vehicleSubTypes[t];
            if (Array.isArray(subs) && subs.length > 0) opts.push(...subs);
            else opts.push(t);
        });
        return [...new Set(opts)].sort();
    }, []);
    const opcoesLinha = tipo === 'escopo' ? equipmentOptions : itensVigentes.map((i) => i.type);

    const precoVigente = (type) => numOf(itensVigentes.find((i) => i.type === type)?.price);
    const horasVigentes = (type) => numOf(itensVigentes.find((i) => i.type === type)?.hours);

    const addLinha = () => setLinhas((c) => [...c, { type: '', hours: '', price: '' }]);
    const removeLinha = (i) => setLinhas((c) => c.filter((_, idx) => idx !== i));
    const updateLinha = (i, campo, valor) => setLinhas((c) => c.map((l, idx) => idx === i ? { ...l, [campo]: valor } : l));

    const usaItens = tipo !== 'prazo';
    const usaHoras = tipo !== 'reajuste';
    const usaPreco = !fechado && (tipo === 'escopo' || tipo === 'reajuste');
    const negativo = tipo === 'supressao';

    // Prévia do delta e do total consolidado (o servidor recalcula na gravação).
    const previa = useMemo(() => {
        if (tipo === 'prazo') return { horasDelta: 0, valorDelta: 0 };
        let horasDelta = 0;
        let valorDelta = 0;
        linhas.forEach((l) => {
            if (!l.type) return;
            const h = numOf(l.hours) * (negativo ? -1 : 1);
            if (tipo === 'reajuste') {
                valorDelta += (numOf(l.price) - precoVigente(l.type)) * horasVigentes(l.type);
                return;
            }
            horasDelta += h;
            if (!fechado) valorDelta += h * (usaPreco ? numOf(l.price) : precoVigente(l.type));
        });
        if (fechado) valorDelta = numOf(valorDeltaFechado) * (negativo ? -1 : 1);
        return { horasDelta, valorDelta: Math.round(valorDelta * 100) / 100 };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tipo, linhas, fechado, valorDeltaFechado, negativo, usaPreco, itensVigentes]);

    const novoTotal = numOf(vigente.valorTotal) + previa.valorDelta;
    const novasHoras = numOf(vigente.horasContratadas) + previa.horasDelta;

    const salvar = async (confirmarLimite = false) => {
        if (!justificativa.trim()) { setAlertMessage?.('Descreva a justificativa do aditivo.'); return; }
        if (tipo === 'prazo' && !novaVigenciaFim) { setAlertMessage?.('Informe a nova data de vigência.'); return; }
        if (usaItens && linhas.filter((l) => l.type).length === 0) {
            setAlertMessage?.('Adicione ao menos um equipamento ao aditivo.'); return;
        }

        const itensDelta = usaItens ? linhas.filter((l) => l.type).map((l) => ({
            type: l.type,
            hours: usaHoras ? numOf(l.hours) * (negativo ? -1 : 1) : 0,
            // Preço só vai quando o aditivo o define; nos demais o servidor herda o do contrato.
            price: usaPreco ? numOf(l.price) : null,
        })) : [];

        const payload = {
            tipo, itensDelta, justificativa: justificativa.trim(),
            observacoes: observacoes.trim() || null,
            novaVigenciaFim: novaVigenciaFim || null,
            valorDelta: fechado ? numOf(valorDeltaFechado) : undefined,
            confirmarLimite,
        };

        setIsSaving(true);
        try {
            if (aditivo?.id) await apiClient.updateAditivo(contrato.id, aditivo.id, payload);
            else await apiClient.createAditivo(contrato.id, payload);
            onSaved?.();
            onClose?.();
        } catch (err) {
            // Teto de acréscimo (409): o backend sinaliza `requerConfirmacao` e o
            // usuário decide se prossegue; qualquer outro erro é alerta normal.
            const msg = err?.message || 'Erro ao salvar aditivo.';
            if (err?.data?.requerConfirmacao) setConfirmacao(msg);
            else setAlertMessage?.(msg);
        } finally {
            setIsSaving(false);
        }
    };

    const btnTipo = (ativo) => `px-3 py-2 rounded-lg border-2 font-bold text-xs transition ${ativo ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`;
    const tipoAtual = TIPOS.find((t) => t.id === tipo);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <FilePlus2 size={18} className="text-purple-500" />
                        {aditivo?.numero ? `Aditivo ${aditivo.numero}` : `Novo aditivo · ${contrato?.numero || ''}`}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100" disabled={isSaving}><X size={18} /></button>
                </div>

                <div className="p-4 space-y-4">
                    <p className="text-[11px] text-gray-400">
                        O aditivo não altera o contrato original — ele registra o que muda. Os valores do contrato
                        só mudam quando o termo aditivo assinado for enviado.
                    </p>

                    {/* Quadro vigente: referência do que já está contratado. */}
                    {itensVigentes.length > 0 && (
                        <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                            <div className="text-[10px] uppercase font-bold text-gray-400 mb-2">Vigente hoje</div>
                            <ul className="space-y-0.5">
                                {itensVigentes.map((i, idx) => (
                                    <li key={idx} className="flex items-center justify-between text-xs text-gray-600">
                                        <span className="font-semibold text-gray-700">{i.type}</span>
                                        <span>{fmtHInt(i.hours)}{!fechado && numOf(i.price) > 0 ? ` × ${fmtBRL(i.price)}/h` : ''}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="flex items-center justify-between text-xs font-bold text-gray-800 border-t border-gray-200 mt-2 pt-1.5">
                                <span>{fmtHInt(vigente.horasContratadas)}</span>
                                <span>{fmtBRL(vigente.valorTotal)}</span>
                            </div>
                        </div>
                    )}

                    {/* Tipo do aditivo */}
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Tipo do aditivo</label>
                        <div className="flex flex-wrap gap-2">
                            {TIPOS.filter((t) => !(fechado && t.id === 'reajuste')).map((t) => (
                                <button key={t.id} type="button" className={btnTipo(tipo === t.id)}
                                    onClick={() => { setTipo(t.id); setLinhas([]); }}>
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1.5">{tipoAtual?.hint}</p>
                    </div>

                    {/* Itens do delta */}
                    {usaItens && (
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-xs font-bold text-gray-600 uppercase">
                                    {tipo === 'escopo' ? 'Equipamentos a incluir' : tipo === 'reajuste' ? 'Preços a reajustar' : 'Equipamentos'}
                                </label>
                                <button type="button" onClick={addLinha}
                                    className="flex items-center gap-1 text-xs font-semibold text-purple-600 hover:text-purple-800">
                                    <Plus size={13} /> Adicionar
                                </button>
                            </div>
                            <div className="space-y-2">
                                {linhas.map((l, i) => (
                                    <div key={i} className="flex items-end gap-2">
                                        <div className="flex-1 min-w-0">
                                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Equipamento (subgrupo)</label>
                                            <select value={l.type} onChange={(e) => updateLinha(i, 'type', e.target.value)}
                                                className="w-full p-2 border rounded-lg bg-white text-sm">
                                                <option value="">— Selecionar —</option>
                                                {opcoesLinha.map((o) => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                        </div>
                                        {usaHoras && (
                                            <div className="w-24">
                                                <label className="block text-[10px] font-bold text-gray-500 mb-1">
                                                    {negativo ? 'Horas (−)' : 'Horas (+)'}
                                                </label>
                                                <input type="number" min="0" step="1" value={l.hours}
                                                    onChange={(e) => updateLinha(i, 'hours', e.target.value)}
                                                    className="w-full p-2 border rounded-lg bg-white text-sm" placeholder="0" />
                                            </div>
                                        )}
                                        {usaPreco ? (
                                            <div className="w-32">
                                                <label className="block text-[10px] font-bold text-gray-500 mb-1">
                                                    {tipo === 'reajuste' ? 'Novo valor/h' : 'Valor/hora'}
                                                </label>
                                                <CurrencyInput value={l.price} onChange={(e) => updateLinha(i, 'price', e.target.value)}
                                                    className="w-full p-2 border rounded-lg bg-white text-sm" placeholder="0,00" />
                                            </div>
                                        ) : !fechado && l.type ? (
                                            <div className="w-32 pb-2 text-[11px] text-gray-400 text-right">
                                                {fmtBRL(precoVigente(l.type))}/h
                                            </div>
                                        ) : null}
                                        <button type="button" onClick={() => removeLinha(i)}
                                            className="p-2 text-red-500 rounded-lg hover:bg-red-50 mb-0.5"><Trash2 size={15} /></button>
                                    </div>
                                ))}
                                {linhas.length === 0 && (
                                    <p className="text-xs text-gray-400 italic">Nenhum equipamento adicionado.</p>
                                )}
                            </div>
                            {tipo === 'supressao' && (
                                <p className="text-[11px] text-gray-400 mt-1.5">Informe as horas a retirar (valor positivo) — o sistema grava como supressão.</p>
                            )}
                        </div>
                    )}

                    {/* Contrato fechado: valor do aditivo é global */}
                    {fechado && usaItens && (
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">
                                Valor do aditivo (R$) {negativo && <span className="text-gray-400 normal-case font-normal">— será descontado</span>}
                            </label>
                            <CurrencyInput value={valorDeltaFechado} onChange={(e) => setValorDeltaFechado(e.target.value)}
                                className="w-full p-2 border rounded-lg bg-white text-sm" placeholder="0,00" />
                            <p className="text-[10px] text-gray-400 mt-1">Contrato de valor fechado não tem preço por hora — informe o valor global do aditivo.</p>
                        </div>
                    )}

                    {/* Prazo */}
                    {(tipo === 'prazo' || tipo === 'escopo' || tipo === 'acrescimo') && (
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">
                                Nova vigência até {tipo !== 'prazo' && <span className="text-gray-400 normal-case font-normal">(opcional)</span>}
                            </label>
                            <input type="date" value={novaVigenciaFim} onChange={(e) => setNovaVigenciaFim(e.target.value)}
                                className="w-full p-2 border rounded-lg bg-white text-sm" />
                        </div>
                    )}

                    {/* Prévia do resultado */}
                    <div className="bg-purple-50/60 border border-purple-100 rounded-lg p-3">
                        <div className="text-[10px] uppercase font-bold text-purple-400 mb-2">Resultado com este aditivo</div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <div className="text-[11px] text-gray-500">Horas contratadas</div>
                                <div className="font-bold text-gray-800">
                                    {fmtHInt(novasHoras)}
                                    {previa.horasDelta !== 0 && (
                                        <span className={`ml-1.5 text-xs font-semibold ${previa.horasDelta < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                            {previa.horasDelta > 0 ? '+' : ''}{fmtHInt(previa.horasDelta)}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div>
                                <div className="text-[11px] text-gray-500">Valor do contrato</div>
                                <div className="font-bold text-gray-800">
                                    {fmtBRL(novoTotal)}
                                    {previa.valorDelta !== 0 && (
                                        <span className={`ml-1.5 text-xs font-semibold ${previa.valorDelta < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                            {previa.valorDelta > 0 ? '+' : ''}{fmtBRL(previa.valorDelta)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Justificativa */}
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Justificativa</label>
                        <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={2}
                            placeholder="Motivo da alteração — entra como cláusula própria no termo aditivo"
                            className="w-full p-2 border rounded-lg bg-white text-sm" />
                        <p className="text-[10px] text-gray-400 mt-1">Vira a <span className="font-semibold">Cláusula da Justificativa</span> no PDF do termo aditivo.</p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Observações <span className="text-gray-400 normal-case font-normal">(opcional)</span></label>
                        <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2}
                            className="w-full p-2 border rounded-lg bg-white text-sm" />
                    </div>

                    {confirmacao && (
                        <div className="flex flex-col gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <div className="flex items-start gap-1.5 font-semibold text-amber-800">
                                <AlertTriangle size={14} className="mt-px shrink-0" /> {confirmacao}
                            </div>
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={() => { setConfirmacao(null); salvar(true); }} disabled={isSaving}
                                    className="px-2.5 py-1 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-60">
                                    Confirmar e salvar
                                </button>
                                <button type="button" onClick={() => setConfirmacao(null)}
                                    className="px-2.5 py-1 bg-gray-200 rounded-lg font-medium hover:bg-gray-300">Revisar</button>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} disabled={isSaving}
                            className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium hover:bg-gray-300">Cancelar</button>
                        <button type="button" onClick={() => salvar(false)} disabled={isSaving}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 flex items-center gap-2 disabled:opacity-60">
                            {isSaving ? <Loader size={15} className="animate-spin" /> : <Save size={15} />} Salvar minuta
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AditivoModal;
