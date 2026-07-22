import React, { useState, useMemo } from 'react';
import { X, Loader, Save, FileText, Clock, Plus, Trash2, DollarSign, Scale } from 'lucide-react';
import { vehicleSubTypes, equipmentTypesForHours } from '../../utils/vehicleRules';
import CurrencyInput from '../ui/CurrencyInput';

const FOROS = ['Santa Maria', 'Lajeado'];

const fmtBRL = (n) =>
    (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const normalizeMaquinas = (m) => {
    if (Array.isArray(m)) return m.filter(Boolean);
    if (typeof m === 'string') { try { const p = JSON.parse(m); return Array.isArray(p) ? p.filter(Boolean) : []; } catch { return []; } }
    return [];
};
const normalizeItens = (v) => {
    let arr = v;
    if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { arr = []; } }
    if (!Array.isArray(arr)) return [];
    return arr.filter((i) => i && i.type).map((i) => ({ type: i.type, hours: i.hours != null ? String(i.hours) : '', price: i.price != null ? String(i.price) : '' }));
};

/**
 * ContratoTerceiroModal — cria/edita um contrato de terceirizado, no padrão da Obra.
 * Dois modos: "Por horas" (lista de {subgrupo, horas, valor/hora}) ou "Valor fechado".
 * As máquinas são vinculadas explicitamente (1 máquina : 1 contrato; o diesel dela abate deste contrato).
 */
const ContratoTerceiroModal = ({ contrato, terceiros = [], obras = [], vehicles = [], contratos = [], initialLocadorId = '', user, apiClient, setAlertMessage, onClose, onSaved }) => {
    const [form, setForm] = useState({
        locadorId: contrato?.locadorId || initialLocadorId || '',
        obraId: contrato?.obraId || '',
        tipoMaquina: contrato?.tipoMaquina || '',
        contractType: contrato?.contractType === 'fechado' ? 'fechado' : 'horas',
        horasContratadas: contrato?.horasContratadas != null ? String(contrato.horasContratadas) : '',
        valorTotalFechado: contrato?.contractType === 'fechado' && contrato?.valorTotal != null ? String(contrato.valorTotal) : '',
        vigenciaInicio: contrato?.vigenciaInicio ? String(contrato.vigenciaInicio).split('T')[0] : '',
        vigenciaFim: contrato?.vigenciaFim ? String(contrato.vigenciaFim).split('T')[0] : '',
        prazoVigenciaMeses: contrato?.prazoVigenciaMeses != null ? String(contrato.prazoVigenciaMeses) : '6',
        status: contrato?.status || 'ativo',
        observacoes: contrato?.observacoes || '',
        prazoPagamentoDias: contrato?.prazoPagamentoDias != null ? String(contrato.prazoPagamentoDias) : '45',
        percentualJurosMora: contrato?.percentualJurosMora != null ? String(contrato.percentualJurosMora) : '1',
        percentualMultaMora: contrato?.percentualMultaMora != null ? String(contrato.percentualMultaMora) : '1',
        prazoSubstituicaoHoras: contrato?.prazoSubstituicaoHoras != null ? String(contrato.prazoSubstituicaoHoras) : '48',
        prazoInicioServicoHoras: contrato?.prazoInicioServicoHoras != null ? String(contrato.prazoInicioServicoHoras) : '48',
        percentualMultaInadimplemento: contrato?.percentualMultaInadimplemento != null ? String(contrato.percentualMultaInadimplemento) : '0.5',
        avisoPrevioRescisaoDias: contrato?.avisoPrevioRescisaoDias != null ? String(contrato.avisoPrevioRescisaoDias) : '2',
        foroComarca: contrato?.foroComarca || 'Santa Maria',
        contratadaRepresentanteNome: contrato?.contratadaRepresentanteNome || '',
        contratadaRepresentanteQualificacao: contrato?.contratadaRepresentanteQualificacao || '',
        contratadaRepresentanteCpf: contrato?.contratadaRepresentanteCpf || '',
    });
    const [itens, setItens] = useState(() => normalizeItens(contrato?.itensContratados));
    const [maquinas, setMaquinas] = useState(() => normalizeMaquinas(contrato?.maquinas));
    const [isSaving, setIsSaving] = useState(false);

    const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

    // Opções de subgrupo (mesma regra do ObraModal: expande grupos cobráveis em subgrupos).
    const equipmentOptions = useMemo(() => {
        const opts = [];
        equipmentTypesForHours.forEach((tipo) => {
            const subs = vehicleSubTypes[tipo];
            if (Array.isArray(subs) && subs.length > 0) opts.push(...subs);
            else opts.push(tipo);
        });
        return [...new Set(opts)].sort();
    }, []);

    const maquinasDoTerceiro = useMemo(
        () => vehicles.filter((v) => v.isOutsourced && v.locadorId === form.locadorId),
        [vehicles, form.locadorId]
    );
    const maquinasBloqueadas = useMemo(() => {
        const set = new Set();
        contratos.forEach((c) => {
            if (c.id === contrato?.id) return;
            normalizeMaquinas(c.maquinas).forEach((id) => set.add(id));
        });
        return set;
    }, [contratos, contrato]);

    const toggleMaquina = (id) => setMaquinas((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);

    const addItem = () => setItens((c) => [...c, { type: '', hours: '', price: '' }]);
    const removeItem = (i) => setItens((c) => c.filter((_, idx) => idx !== i));
    const updateItem = (i, field, value) => setItens((c) => c.map((it, idx) => idx === i ? { ...it, [field]: value } : it));

    const isFechado = form.contractType === 'fechado';
    // No modo fechado as máquinas entram sem valor/hora — só a coluna de horas aparece.
    const showPrice = !isFechado;

    const valorTotal = useMemo(() => {
        if (isFechado) return parseFloat(form.valorTotalFechado) || 0;
        return itens.reduce((a, i) => a + (parseFloat(i.hours) || 0) * (parseFloat(i.price) || 0), 0);
    }, [isFechado, form.valorTotalFechado, itens]);

    const totalHorasItens = useMemo(
        () => itens.reduce((a, i) => a + (parseFloat(i.hours) || 0), 0),
        [itens]
    );

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.locadorId) { setAlertMessage?.('Selecione o terceiro.'); return; }
        if (!form.obraId) { setAlertMessage?.('Selecione a obra.'); return; }
        if (!isFechado && itens.filter((i) => i.type).length === 0) {
            setAlertMessage?.('Adicione ao menos um equipamento ao plano, ou use "Valor fechado".'); return;
        }
        if (isFechado && !(parseFloat(form.valorTotalFechado) > 0)) {
            setAlertMessage?.('Informe o valor fechado do contrato.'); return;
        }
        setIsSaving(true);
        try {
            // No modo fechado as máquinas entram com price = 0: o valor é global, as horas são só demonstrativas.
            const itensLimpos = itens.filter((i) => i.type).map((i) => ({ type: i.type, hours: parseFloat(i.hours) || 0, price: isFechado ? 0 : (parseFloat(i.price) || 0) }));
            // tipoMaquina: usa o digitado ou deriva dos subgrupos do plano.
            const tipoMaquina = form.tipoMaquina || (itensLimpos.length > 0 ? [...new Set(itensLimpos.map((i) => i.type))].join(', ') : null);
            // No fechado, as horas contratadas (progresso físico) somam as horas das máquinas do plano.
            const horasItens = itensLimpos.reduce((a, i) => a + i.hours, 0);
            const payload = {
                locadorId: form.locadorId,
                obraId: form.obraId,
                tipoMaquina,
                contractType: form.contractType,
                itensContratados: itensLimpos,
                horasContratadas: isFechado ? (horasItens || parseFloat(form.horasContratadas) || 0) : undefined,
                valorTotal: isFechado ? (parseFloat(form.valorTotalFechado) || 0) : undefined,
                vigenciaInicio: form.vigenciaInicio || null,
                vigenciaFim: form.vigenciaFim || null,
                prazoVigenciaMeses: parseInt(form.prazoVigenciaMeses, 10) || 6,
                status: form.status,
                observacoes: form.observacoes || null,
                prazoPagamentoDias: parseInt(form.prazoPagamentoDias, 10) || 45,
                percentualJurosMora: parseFloat(form.percentualJurosMora) || 0,
                percentualMultaMora: parseFloat(form.percentualMultaMora) || 0,
                prazoSubstituicaoHoras: parseInt(form.prazoSubstituicaoHoras, 10) || 0,
                prazoInicioServicoHoras: parseInt(form.prazoInicioServicoHoras, 10) || 0,
                percentualMultaInadimplemento: parseFloat(form.percentualMultaInadimplemento) || 0,
                avisoPrevioRescisaoDias: parseInt(form.avisoPrevioRescisaoDias, 10) || 0,
                foroComarca: form.foroComarca,
                contratadaRepresentanteNome: form.contratadaRepresentanteNome.trim() || null,
                contratadaRepresentanteQualificacao: form.contratadaRepresentanteQualificacao.trim() || null,
                contratadaRepresentanteCpf: form.contratadaRepresentanteCpf.trim() || null,
                maquinas: maquinas.filter((id) => maquinasDoTerceiro.some((v) => v.id === id)),
                createdBy: { userEmail: user?.email || user?.userEmail || '' },
            };
            if (contrato?.id) await apiClient.updateTerceiroContrato(contrato.id, payload);
            else await apiClient.createTerceiroContrato(payload);
            setAlertMessage?.('Contrato salvo com sucesso!');
            onSaved?.();
            onClose?.();
        } catch (err) {
            setAlertMessage?.(err.message || 'Erro ao salvar contrato.');
        } finally {
            setIsSaving(false);
        }
    };

    const btnToggle = (active) => `flex-1 py-2 rounded-lg border-2 font-bold transition text-sm ${active ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <FileText size={18} className="text-purple-500" />
                        {contrato ? `Contrato ${contrato.numero || ''}` : 'Novo Contrato'}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100" disabled={isSaving}><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {!contrato && <p className="text-[11px] text-gray-400">O número do contrato é gerado automaticamente (CT-ANO-NNN).</p>}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Terceiro</label>
                            <select name="locadorId" value={form.locadorId}
                                onChange={(e) => { handleChange(e); setMaquinas([]); }}
                                className="w-full p-2 border rounded-lg bg-white text-sm" required>
                                <option value="">— Selecionar —</option>
                                {terceiros.map((t) => <option key={t.id} value={t.id}>{t.nomeFantasia || t.razaoSocial}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Obra</label>
                            <select name="obraId" value={form.obraId} onChange={handleChange}
                                className="w-full p-2 border rounded-lg bg-white text-sm" required>
                                <option value="">— Selecionar —</option>
                                {obras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Tipo de contrato */}
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Tipo de contrato</label>
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setForm((f) => ({ ...f, contractType: 'horas' }))} className={btnToggle(form.contractType === 'horas')}>
                                Por horas (equipamentos)
                            </button>
                            <button type="button" onClick={() => setForm((f) => ({ ...f, contractType: 'fechado' }))} className={btnToggle(form.contractType === 'fechado')}>
                                Valor fechado
                            </button>
                        </div>
                    </div>

                    {/* A. VALOR FECHADO — valor global + descrição (as máquinas/horas vão no bloco abaixo) */}
                    {isFechado && (
                        <div className="bg-purple-50/50 p-4 rounded-lg border border-purple-100">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Valor fechado (R$)</label>
                                <CurrencyInput name="valorTotalFechado" value={form.valorTotalFechado} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white text-sm" placeholder="0,00" />
                            </div>
                        </div>
                    )}

                    {/* B. MÁQUINAS / EQUIPAMENTOS CONTRATADOS — usado nos dois modos.
                        No fechado: subgrupo + horas (sem valor/hora); no por horas: com valor/hora. */}
                    <div className="bg-purple-50/50 p-4 rounded-lg border border-purple-100">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-bold text-purple-800 flex items-center gap-2">
                                <Clock size={16} /> {isFechado ? 'Máquinas contratadas (horas, sem valor/hora)' : 'Equipamentos contratados'}
                            </h3>
                            <button type="button" onClick={addItem} className="text-xs flex items-center gap-1 text-purple-600 hover:text-purple-800 font-bold bg-white px-2 py-1 rounded border border-purple-200 shadow-sm">
                                <Plus size={14} /> Adicionar item
                            </button>
                        </div>
                        {itens.length === 0 && (
                            <p className="text-sm text-gray-400 italic text-center py-4 bg-white rounded border border-dashed">
                                {isFechado ? 'Nenhuma máquina adicionada (opcional).' : 'Nenhum equipamento adicionado.'}
                            </p>
                        )}
                        <div className="space-y-2">
                            {itens.map((item, index) => (
                                <div key={index} className="flex flex-col sm:flex-row gap-2 items-end bg-white p-3 rounded border shadow-sm">
                                    <div className="w-full sm:flex-1">
                                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Equipamento (subgrupo)</label>
                                        <select value={item.type} onChange={(e) => updateItem(index, 'type', e.target.value)} className="w-full p-2 border rounded text-sm">
                                            <option value="">Selecione...</option>
                                            {equipmentOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                    <div className={showPrice ? 'w-1/2 sm:w-24' : 'w-full sm:w-32'}>
                                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Horas</label>
                                        <input type="number" min="0" step="any" value={item.hours} onChange={(e) => updateItem(index, 'hours', e.target.value)} className="w-full p-2 border rounded text-sm" placeholder="0" />
                                    </div>
                                    {showPrice && (
                                        <div className="w-1/2 sm:w-32">
                                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Valor/hora (R$)</label>
                                            <CurrencyInput value={item.price} onChange={(e) => updateItem(index, 'price', e.target.value)} className="w-full p-2 border rounded text-sm" placeholder="0,00" />
                                        </div>
                                    )}
                                    <button type="button" onClick={() => removeItem(index)} className="p-2 text-red-400 hover:bg-red-50 rounded mb-0.5"><Trash2 size={18} /></button>
                                </div>
                            ))}
                        </div>
                        {isFechado && itens.length > 0 && (
                            <p className="text-[11px] text-gray-500 mt-2">
                                Total: <span className="font-bold text-gray-700">{totalHorasItens.toLocaleString('pt-BR')} h</span> · as horas constam no contrato sem valor individual; o valor é o global fechado acima.
                            </p>
                        )}
                    </div>

                    {/* Totalizador */}
                    <div className="bg-gray-900 text-white p-3 rounded-lg flex justify-between items-center">
                        <span className="font-medium flex items-center gap-2 text-sm"><DollarSign size={18} className="text-green-400" /> Valor total do contrato</span>
                        <span className="text-xl font-bold text-green-400">{fmtBRL(valorTotal)}</span>
                    </div>

                    {/* Máquinas vinculadas */}
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Máquinas do contrato</label>
                        {!form.locadorId && <p className="text-[11px] text-gray-400">Selecione o terceiro para listar as máquinas.</p>}
                        {form.locadorId && maquinasDoTerceiro.length === 0 && (
                            <p className="text-[11px] text-gray-400">Este terceiro não tem veículos marcados como terceirizados. Marque no cadastro do veículo.</p>
                        )}
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                            {maquinasDoTerceiro.map((v) => {
                                const bloqueada = maquinasBloqueadas.has(v.id);
                                const checked = maquinas.includes(v.id);
                                return (
                                    <label key={v.id} className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${bloqueada && !checked ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border-gray-200 cursor-pointer hover:bg-purple-50'}`}>
                                        <input type="checkbox" checked={checked} disabled={bloqueada && !checked} onChange={() => toggleMaquina(v.id)} className="h-4 w-4 text-purple-600 rounded" />
                                        <span className="font-medium">{v.registroInterno || v.placa}</span>
                                        <span className="text-gray-400 text-xs">· {v.tipo}{v.modelo ? ` ${v.modelo}` : ''}</span>
                                        {bloqueada && !checked && <span className="ml-auto text-[10px] text-gray-400">já em outro contrato</span>}
                                    </label>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">Uma máquina só pode estar em um contrato — o diesel dela abate deste contrato.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Vigência início</label>
                            <input type="date" name="vigenciaInicio" value={form.vigenciaInicio} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Vigência fim</label>
                            <input type="date" name="vigenciaFim" value={form.vigenciaFim} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white text-sm" />
                        </div>
                    </div>

                    {/* Prazo de vigência (meses após assinatura) — é o que entra na cláusula do PDF.
                        As datas acima ficam apenas para controle interno (opcionais). */}
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Prazo de vigência (meses após a assinatura)</label>
                        <input type="number" min="1" name="prazoVigenciaMeses" value={form.prazoVigenciaMeses} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white text-sm" placeholder="6" />
                        <p className="text-[10px] text-gray-400 mt-1">Vai na cláusula de vigência como "{parseInt(form.prazoVigenciaMeses, 10) || 6} meses contados da assinatura". As datas acima são só de controle interno.</p>
                    </div>

                    {/* Cláusulas contratuais (parametrizáveis no PDF gerado) */}
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-3">
                            <Scale size={16} className="text-purple-500" /> Cláusulas contratuais
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Prazo de pagamento (dias após conclusão)</label>
                                <input type="number" min="0" name="prazoPagamentoDias" value={form.prazoPagamentoDias} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white text-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Foro / Comarca</label>
                                <select name="foroComarca" value={form.foroComarca} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white text-sm">
                                    {FOROS.map((f) => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Juros de mora (% ao mês)</label>
                                <input type="number" min="0" step="0.01" name="percentualJurosMora" value={form.percentualJurosMora} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white text-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Multa moratória (%)</label>
                                <input type="number" min="0" step="0.01" name="percentualMultaMora" value={form.percentualMultaMora} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white text-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Multa por inadimplemento contratual (% do valor)</label>
                                <input type="number" min="0" step="0.01" name="percentualMultaInadimplemento" value={form.percentualMultaInadimplemento} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white text-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Prazo de substituição de equipamento (horas)</label>
                                <input type="number" min="0" name="prazoSubstituicaoHoras" value={form.prazoSubstituicaoHoras} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white text-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Prazo de início do serviço após autorização (horas)</label>
                                <input type="number" min="0" name="prazoInicioServicoHoras" value={form.prazoInicioServicoHoras} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white text-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Aviso prévio para rescisão/suspensão (dias)</label>
                                <input type="number" min="0" name="avisoPrevioRescisaoDias" value={form.avisoPrevioRescisaoDias} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white text-sm" />
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2">Esses valores preenchem as cláusulas de pagamento, penalidades, rescisão e foro no PDF gerado. Os valores padrão seguem o modelo de contrato de terceiros da MAK.</p>
                    </div>

                    {contrato && (
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Status</label>
                            <select name="status" value={form.status} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white text-sm">
                                <option value="ativo">Ativo</option>
                                <option value="concluido">Concluído</option>
                                <option value="cancelado">Cancelado</option>
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Observações</label>
                        <textarea name="observacoes" value={form.observacoes} onChange={handleChange} rows={2} placeholder="Entra como um item adicional na Cláusula 1ª — Do Objeto do contrato" className="w-full p-2 border rounded-lg bg-white text-sm" />
                        <p className="text-[10px] text-gray-400 mt-1">O que for digitado aqui entra como um novo item da <span className="font-semibold">Cláusula 1ª — Do Objeto</span> no PDF gerado.</p>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium hover:bg-gray-300">Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 flex items-center gap-2 disabled:opacity-60">
                            {isSaving ? <Loader size={15} className="animate-spin" /> : <Save size={15} />} Salvar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ContratoTerceiroModal;
