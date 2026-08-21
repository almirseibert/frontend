import React, { useState, useMemo, useEffect } from 'react';
import { X, Loader2, ClipboardList } from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import RelatoItemGrid from './RelatoItemGrid';
import { getAllowedReadingTypes } from '../../utils/vehicleRules';
import { getRegioes } from '../../utils/obraFormat';

// Digitação da ficha FRM-MAN-001 — seções 1, 2, 4 e 5 do formulário impresso.
// A seção 3 (legenda de gravidade) aparece dentro da grade de itens, e a 6
// ("uso exclusivo da manutenção") só faz sentido depois do fechamento, então
// fica no modal de detalhe.

const hojeYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const FORM_VAZIO = {
    relatorNome: '', relatorEmployeeId: '', relatorFuncao: '', filialCidade: '', dataRelato: '',
    vehicleId: '', veiculoModelo: '', veiculoPlaca: '', veiculoFrota: '',
    hodometro: '', horimetro: '',
    observacoesGerais: '', assinaturaColaborador: '', assinaturaSupervisor: '',
};

const INPUT_CLS = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none';
const LABEL_CLS = 'block text-[11px] font-bold text-gray-600 mb-1 uppercase tracking-wide';

// Precisa ficar FORA do componente. Declarado dentro, cada render criava um
// tipo de componente novo, e o React desmontava e remontava toda a árvore da
// seção — o que perdia o foco do campo e jogava o scroll do modal de volta pro
// topo a cada tecla digitada ou item adicionado.
const Secao = ({ n, titulo, children }) => (
    <div className="space-y-3">
        <div className="flex items-center gap-2">
            <span className="w-5 h-5 bg-slate-800 text-white rounded text-[11px] font-bold flex items-center justify-center">{n}</span>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">{titulo}</h3>
        </div>
        {children}
    </div>
);

const RelatoFormModal = ({
    relato = null, vehicles = [], employees = [], obras = [],
    apiClient, onClose, onSaved, setAlertMessage,
}) => {
    const isEdicao = !!relato?.id;

    const [form, setForm] = useState(() => (
        isEdicao
            ? { ...FORM_VAZIO, ...relato, hodometro: relato.hodometro ?? '', horimetro: relato.horimetro ?? '' }
            : { ...FORM_VAZIO, dataRelato: hojeYmd() }
    ));
    const [itens, setItens] = useState(() => (isEdicao ? (relato.itens || []) : []));
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    const set = (campo, valor) => setForm(p => ({ ...p, [campo]: valor }));

    const veiculoSelecionado = useMemo(
        () => vehicles.find(v => v.id === form.vehicleId) || null,
        [vehicles, form.vehicleId]
    );

    // Máquina pesada mede em horímetro, leve/trecho em odômetro. A ficha tem os
    // dois campos, mas destacamos o que vale para aquele equipamento.
    const leituraPrincipal = useMemo(() => {
        if (!veiculoSelecionado) return null;
        return getAllowedReadingTypes(veiculoSelecionado.tipo)?.[0] || null;
    }, [veiculoSelecionado]);

    // Ao escolher o veículo, pré-preenche a identificação da seção 2 com o
    // cadastro — o gestor corrige se a ficha trouxer algo diferente.
    useEffect(() => {
        if (!veiculoSelecionado || isEdicao) return;
        setForm(p => ({
            ...p,
            veiculoModelo: p.veiculoModelo || veiculoSelecionado.modelo || '',
            veiculoPlaca: p.veiculoPlaca || veiculoSelecionado.placa || '',
            veiculoFrota: p.veiculoFrota || veiculoSelecionado.registroInterno || '',
        }));
    }, [veiculoSelecionado, isEdicao]);

    const veiculosAtivos = useMemo(
        () => vehicles.filter(v => v.ativo !== 0 && !v.isSucata),
        [vehicles]
    );

    // Só quem está na empresa hoje. Placeholders (COLABORADOR, TESTE, MAK
    // SERVIÇOS) ficam de fora: são operadores temporários de alocação, não
    // pessoas que preenchem ficha.
    const colaboradoresAtivos = useMemo(
        () => employees
            .filter(e => String(e.status || '').toLowerCase() === 'ativo' && !e.isPlaceholder)
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')),
        [employees]
    );

    const regioes = useMemo(() => getRegioes(obras), [obras]);

    // Relatos antigos guardaram só o nome digitado. Ao abrir para edição,
    // tenta casar com um funcionário para o seletor já vir preenchido.
    useEffect(() => {
        if (!isEdicao || form.relatorEmployeeId || !form.relatorNome) return;
        const alvo = form.relatorNome.trim().toLowerCase();
        const achado = colaboradoresAtivos.find(e => (e.nome || '').trim().toLowerCase() === alvo);
        if (achado) setForm(p => ({ ...p, relatorEmployeeId: achado.id }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEdicao, colaboradoresAtivos]);

    const selecionarRelator = (emp) => setForm(p => ({
        ...p,
        relatorEmployeeId: emp?.id || '',
        relatorNome: emp?.nome || '',
        // A função vem do cadastro, mas segue editável — a ficha pode trazer
        // outra coisa escrita à mão.
        relatorFuncao: emp?.funcao || p.relatorFuncao || '',
    }));

    const validar = () => {
        if (!form.relatorNome?.trim()) return 'Selecione o colaborador que preencheu a ficha.';
        if (!form.vehicleId) return 'Selecione o veículo/equipamento.';
        if (!form.dataRelato) return 'Informe a data do relato.';
        for (let i = 0; i < itens.length; i++) {
            const it = itens[i];
            if (!it.itemComponente?.trim()) return `Item ${i + 1}: informe o item/componente.`;
            if (!it.descricaoProblema?.trim()) return `Item ${i + 1}: descreva o problema observado.`;
            if (!it.gravidade) return `Item ${i + 1}: marque a gravidade (A, B, C ou D).`;
        }
        return null;
    };

    const salvar = async (statusDestino) => {
        const problema = validar();
        if (problema) return setErro(problema);
        if (statusDestino === 'Digitado' && itens.length === 0) {
            return setErro('Um relato digitado precisa de ao menos um item. Salve como rascunho se ainda estiver transcrevendo.');
        }

        setSalvando(true);
        setErro('');
        try {
            const payload = {
                ...form,
                hodometro: form.hodometro === '' ? null : form.hodometro,
                horimetro: form.horimetro === '' ? null : form.horimetro,
                status: statusDestino,
                itens: itens.map(i => ({
                    itemComponente: i.itemComponente,
                    descricaoProblema: i.descricaoProblema,
                    gravidade: i.gravidade,
                })),
            };

            if (isEdicao) {
                // O cabeçalho vai num PUT; os itens são reconciliados abaixo.
                await apiClient.updateRelato(relato.id, payload);
                await sincronizarItens(relato.id);
            } else {
                const r = await apiClient.createRelato(payload);
                setAlertMessage?.(`Relato #${r.numero} salvo com sucesso.`);
            }
            onSaved?.();
            onClose?.();
        } catch (e) {
            setErro(e.message || 'Erro ao salvar o relato.');
        } finally {
            setSalvando(false);
        }
    };

    // Na edição os itens já existem no banco com id próprio: atualiza os que
    // mudaram, cria os novos e apaga os removidos. Enviar tudo de novo criaria
    // duplicatas e perderia o vínculo com ordens já geradas.
    const sincronizarItens = async (relatoId) => {
        const originais = relato?.itens || [];
        const idsAtuais = new Set(itens.filter(i => i.id).map(i => i.id));

        for (const antigo of originais) {
            if (!idsAtuais.has(antigo.id)) {
                await apiClient.deleteRelatoItem(relatoId, antigo.id);
            }
        }
        for (const it of itens) {
            const corpo = {
                itemComponente: it.itemComponente,
                descricaoProblema: it.descricaoProblema,
                gravidade: it.gravidade,
            };
            if (it.id) {
                const antigo = originais.find(o => o.id === it.id);
                const mudou = !antigo
                    || antigo.itemComponente !== corpo.itemComponente
                    || antigo.descricaoProblema !== corpo.descricaoProblema
                    || antigo.gravidade !== corpo.gravidade;
                if (mudou) await apiClient.updateRelatoItem(relatoId, it.id, corpo);
            } else {
                await apiClient.createRelatoItem(relatoId, corpo);
            }
        }
    };

    const inputCls = INPUT_CLS;
    const labelCls = LABEL_CLS;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
                <div className="px-5 py-3 border-b bg-yellow-50 flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <ClipboardList size={18} className="text-yellow-700" />
                        <div>
                            <h2 className="text-sm font-bold text-yellow-900">
                                {isEdicao ? `Relato #${relato.numero}` : 'Novo Relato de Ocorrência'}
                            </h2>
                            <p className="text-[10px] text-yellow-700">FRM-MAN-001 Rev. 01 — Relato de Ocorrência e Manutenção de Frota</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X size={18} /></button>
                </div>

                <div className="p-5 space-y-6 overflow-y-auto">
                    {erro && (
                        <div className="p-3 bg-red-50 border border-red-300 text-red-800 rounded-lg text-xs font-bold">{erro}</div>
                    )}

                    <Secao n={1} titulo="Identificação do Relator">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div className="md:col-span-2">
                                <label className={labelCls}>Nome do colaborador *</label>
                                <SearchableSelect
                                    items={colaboradoresAtivos}
                                    value={form.relatorEmployeeId}
                                    onChange={selecionarRelator}
                                    getLabel={e => e.nome || ''}
                                    getSubLabel={e => [e.funcao, e.registroInterno && `RE ${e.registroInterno}`].filter(Boolean).join(' · ')}
                                    placeholder="Quem preencheu a ficha..."
                                />
                                {/* Ficha antiga com nome que não bate com nenhum funcionário
                                    ativo: preserva o que foi digitado em vez de descartar. */}
                                {form.relatorNome && !form.relatorEmployeeId && (
                                    <p className="text-[10px] text-amber-700 mt-1">
                                        Registrado como <b>{form.relatorNome}</b> — não encontrado entre os funcionários ativos.
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className={labelCls}>Função / cargo</label>
                                <input value={form.relatorFuncao} onChange={e => set('relatorFuncao', e.target.value)} className={inputCls} placeholder="Vem do cadastro" />
                            </div>
                            <div>
                                <label className={labelCls}>Data do relato *</label>
                                <input type="date" value={form.dataRelato} onChange={e => set('dataRelato', e.target.value)} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Filial / cidade</label>
                                <select value={form.filialCidade || ''} onChange={e => set('filialCidade', e.target.value)} className={inputCls}>
                                    <option value="">Selecione...</option>
                                    {regioes.map(r => <option key={r} value={r}>{r}</option>)}
                                    {/* Valor legado fora da lista continua visível e selecionado. */}
                                    {form.filialCidade && !regioes.includes(form.filialCidade) && (
                                        <option value={form.filialCidade}>{form.filialCidade} (cadastro antigo)</option>
                                    )}
                                </select>
                            </div>
                        </div>
                    </Secao>

                    <Secao n={2} titulo="Identificação do Veículo / Equipamento">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-3">
                                <label className={labelCls}>Veículo / equipamento *</label>
                                <SearchableSelect
                                    items={veiculosAtivos}
                                    value={form.vehicleId}
                                    onChange={item => set('vehicleId', item?.id || '')}
                                    getLabel={v => `${v.registroInterno || '—'} - ${v.placa || 's/ placa'}`}
                                    getSubLabel={v => v.modelo || ''}
                                    placeholder="Busque por RE, placa ou modelo..."
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Modelo (como na ficha)</label>
                                <input value={form.veiculoModelo || ''} onChange={e => set('veiculoModelo', e.target.value)} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Placa</label>
                                <input value={form.veiculoPlaca || ''} onChange={e => set('veiculoPlaca', e.target.value)} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Nº de frota / prefixo</label>
                                <input value={form.veiculoFrota || ''} onChange={e => set('veiculoFrota', e.target.value)} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>
                                    Hodômetro (Km)
                                    {leituraPrincipal === 'odometro' && <span className="text-yellow-600 ml-1">• leitura deste equipamento</span>}
                                </label>
                                <input
                                    type="number" step="0.1" value={form.hodometro}
                                    onChange={e => set('hodometro', e.target.value)}
                                    className={`${inputCls} ${leituraPrincipal === 'odometro' ? 'border-yellow-400 bg-yellow-50' : ''}`}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>
                                    Horímetro (H)
                                    {leituraPrincipal === 'horimetro' && <span className="text-yellow-600 ml-1">• leitura deste equipamento</span>}
                                </label>
                                <input
                                    type="number" step="0.1" value={form.horimetro}
                                    onChange={e => set('horimetro', e.target.value)}
                                    className={`${inputCls} ${leituraPrincipal === 'horimetro' ? 'border-yellow-400 bg-yellow-50' : ''}`}
                                />
                            </div>
                        </div>
                    </Secao>

                    <Secao n={4} titulo="Itens / Problemas Identificados">
                        <RelatoItemGrid itens={itens} onChange={setItens} disabled={salvando} />
                    </Secao>

                    <Secao n={5} titulo="Observações Gerais / Histórico do Problema">
                        <textarea
                            value={form.observacoesGerais || ''}
                            onChange={e => set('observacoesGerais', e.target.value)}
                            rows={3}
                            className={`${inputCls} resize-none`}
                            placeholder="Contexto, histórico, o que já foi tentado..."
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Assinatura do colaborador</label>
                                <input value={form.assinaturaColaborador || ''} onChange={e => set('assinaturaColaborador', e.target.value)} className={inputCls} placeholder="Nome de quem assinou a ficha" />
                            </div>
                            <div>
                                <label className={labelCls}>Assinatura do encarregado / supervisor</label>
                                <input value={form.assinaturaSupervisor || ''} onChange={e => set('assinaturaSupervisor', e.target.value)} className={inputCls} />
                            </div>
                        </div>
                    </Secao>
                </div>

                <div className="px-5 py-3 border-t bg-gray-50 flex justify-between items-center gap-3 flex-shrink-0">
                    <p className="text-[11px] text-gray-500">
                        <b>Rascunho</b> se ainda está transcrevendo. <b>Digitado</b> libera a triagem e o fechamento com a OS do MC.
                    </p>
                    <div className="flex gap-2">
                        <button onClick={onClose} disabled={salvando} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg disabled:opacity-40">
                            Cancelar
                        </button>
                        <button onClick={() => salvar('Rascunho')} disabled={salvando} className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg disabled:opacity-40">
                            Salvar rascunho
                        </button>
                        <button onClick={() => salvar('Digitado')} disabled={salvando} className="flex items-center gap-1.5 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold rounded-lg shadow disabled:opacity-40">
                            {salvando && <Loader2 size={13} className="animate-spin" />}
                            Salvar como digitado
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RelatoFormModal;
