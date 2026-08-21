import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
    X, Loader2, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2,
    Wrench, Truck, FileText, Calendar, Info,
} from 'lucide-react';
import { GravidadeBadge } from './GravidadeBadge';
import SearchableExecutorSelect from './SearchableExecutorSelect';
import CurrencyInput from '../ui/CurrencyInput';
import { EXECUTOR_TIPOS, getGravidade } from '../../utils/relatoGravidade';

// Fechamento do relato de ocorrência, em 4 passos:
//   1 Triagem       — quem executa cada item, o que faz, quanto custa, prazo
//   2 Equipamento   — saída de obra e entrada em manutenção (SEMPRE perguntado)
//   3 OS do MC      — número obrigatório do sistema financeiro externo
//   4 Prévia        — as ordens que serão criadas e o cronograma em dias úteis
//
// Nada é gravado até o botão do passo 4. O passo 4 chama /preview-fechamento,
// que devolve exatamente o que o /fechar vai fazer.

const hojeYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const fmtData = (ymd) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('pt-BR') : '—');
const fmtMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PASSOS = [
    { n: 1, titulo: 'Triagem', icone: Wrench },
    { n: 2, titulo: 'Equipamento', icone: Truck },
    { n: 3, titulo: 'OS do MC', icone: FileText },
    { n: 4, titulo: 'Prévia', icone: Calendar },
];

const FecharRelatoWizard = ({
    relato, partners = [], employees = [], slaConfig = [], apiClient,
    onClose, onFechado, setAlertMessage,
}) => {
    const [passo, setPasso] = useState(1);
    const [erro, setErro] = useState('');
    const [carregando, setCarregando] = useState(false);
    const [preview, setPreview] = useState(null);

    const slaPorGravidade = useMemo(
        () => Object.fromEntries(slaConfig.map(s => [s.gravidade, s])),
        [slaConfig]
    );

    // --- Passo 1: triagem ----------------------------------------------------
    const [triagem, setTriagem] = useState(() =>
        (relato.itens || []).map(i => ({
            id: i.id,
            sequencia: i.sequencia,
            gravidade: i.gravidade,
            itemComponente: i.itemComponente,
            descricaoProblema: i.descricaoProblema,
            executorTipo: i.executorTipo || 'externo',
            executorPartnerId: i.executorPartnerId || '',
            executorNome: i.executorNome || '',
            servicoDescricao: i.servicoDescricao || '',
            quantidade: i.quantidade ?? 1,
            valorEstimado: i.valorEstimado ?? '',
            slaDiasUteis: i.slaDiasUteis ?? '',
        }))
    );

    const setItem = (id, patch) =>
        setTriagem(t => t.map(i => (i.id === id ? { ...i, ...patch } : i)));

    // O caso comum é a frota inteira ir para a mesma oficina.
    const aplicarExecutorATodos = (item) => {
        setTriagem(t => t.map(i => ({
            ...i,
            executorTipo: item.executorTipo,
            executorPartnerId: item.executorPartnerId,
            executorNome: item.executorNome,
        })));
    };

    const semExecutor = triagem.filter(i =>
        i.executorTipo === 'externo' && !i.executorPartnerId
    ).length;

    // --- Passo 2: equipamento ------------------------------------------------
    // Default sugerido pela gravidade: item A impede o equipamento de trabalhar,
    // então saída de obra + Em Manutenção vêm marcados. Só B/C/D vêm desmarcados
    // — mas a escolha é sempre do gestor, o sistema nunca decide sozinho.
    const temBloqueante = useMemo(
        () => (relato.itens || []).some(i => slaPorGravidade[i.gravidade]?.bloqueiaOperacao || getGravidade(i.gravidade)?.bloqueiaOperacao),
        [relato.itens, slaPorGravidade]
    );

    const [veiculo, setVeiculo] = useState({
        fazerSaidaObra: false,
        colocarEmManutencao: false,
        statusVeiculo: 'Aguardando Manutenção',
        localManutencao: 'Pátio MAK Lajeado',
        dataSaida: hojeYmd(),
        observacoesSaida: '',
        forcarLeitura: false,
    });
    const [situacao, setSituacao] = useState(null);

    // --- Passo 3: OS do MC ---------------------------------------------------
    const [osMc, setOsMc] = useState(relato.osMc || '');
    const [dataBase, setDataBase] = useState(hojeYmd());
    const [employeeIdAutorizado, setEmployeeIdAutorizado] = useState('');

    const payloadItens = useCallback(() => triagem.map(i => ({
        id: i.id,
        executorTipo: i.executorTipo,
        executorPartnerId: i.executorTipo === 'interno' ? null : (i.executorPartnerId || null),
        executorNome: i.executorNome || null,
        servicoDescricao: i.servicoDescricao || null,
        quantidade: i.quantidade === '' ? 1 : Number(i.quantidade),
        valorEstimado: i.valorEstimado === '' ? null : Number(i.valorEstimado),
        slaDiasUteis: i.slaDiasUteis === '' ? null : Number(i.slaDiasUteis),
    })), [triagem]);

    const carregarPreview = useCallback(async () => {
        setCarregando(true);
        setErro('');
        try {
            const p = await apiClient.previewFechamentoRelato(relato.id, {
                dataBase, itens: payloadItens(),
            });
            setPreview(p);
            setSituacao(p.veiculo);
            return p;
        } catch (e) {
            setErro(e.message || 'Erro ao montar a prévia.');
            return null;
        } finally {
            setCarregando(false);
        }
    }, [apiClient, relato.id, dataBase, payloadItens]);

    // Já no passo 1 buscamos a situação do equipamento, para o passo 2 sugerir
    // os defaults certos e mostrar a obra/operador atuais.
    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const p = await apiClient.previewFechamentoRelato(relato.id, { dataBase, itens: payloadItens() });
                if (!vivo) return;
                setSituacao(p.veiculo);
                setVeiculo(v => ({
                    ...v,
                    fazerSaidaObra: !!(p.veiculo?.estaAlocado && p.temItemBloqueante),
                    colocarEmManutencao: !!p.temItemBloqueante,
                    statusVeiculo: p.temItemBloqueante ? 'Em Manutenção' : 'Aguardando Manutenção',
                }));
            } catch { /* o passo 2 mostra o estado como desconhecido */ }
        })();
        return () => { vivo = false; };
        // Só na montagem: depois disso os defaults são do gestor.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const irPara = async (n) => {
        setErro('');
        if (n === 4) {
            const p = await carregarPreview();
            if (!p) return;
        }
        setPasso(n);
    };

    const confirmar = async () => {
        if (!osMc.trim()) { setErro('Informe o número da OS do sistema MC.'); setPasso(3); return; }
        setCarregando(true);
        setErro('');
        try {
            const r = await apiClient.fecharRelato(relato.id, {
                osMc: osMc.trim(),
                dataBase,
                employeeIdAutorizado: employeeIdAutorizado || null,
                fazerSaidaObra: veiculo.fazerSaidaObra,
                colocarEmManutencao: veiculo.colocarEmManutencao,
                statusVeiculo: veiculo.statusVeiculo,
                localManutencao: veiculo.localManutencao,
                forcarLeitura: veiculo.forcarLeitura,
                saidaObra: {
                    dataSaida: veiculo.dataSaida,
                    location: veiculo.localManutencao,
                    observacoes: veiculo.observacoesSaida,
                },
                itens: payloadItens(),
            });
            setAlertMessage?.(r.message || `Relato fechado. ${r.ordens?.length || 0} ordem(ns) gerada(s).`);
            onFechado?.(r);
            onClose?.();
        } catch (e) {
            // O backend devolve 409 com as ordens quando já foi fechado (duplo-clique).
            setErro(e.message || 'Erro ao fechar o relato.');
        } finally {
            setCarregando(false);
        }
    };

    const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none';
    const labelCls = 'block text-[11px] font-bold text-gray-600 mb-1 uppercase tracking-wide';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
                <div className="px-5 py-3 border-b bg-yellow-50 flex justify-between items-center flex-shrink-0">
                    <div>
                        <h2 className="text-sm font-bold text-yellow-900">Fechar Relato #{relato.numero}</h2>
                        <p className="text-[10px] text-yellow-700">
                            Gera as ordens de serviço, define os prazos e atualiza o equipamento
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X size={18} /></button>
                </div>

                {/* Trilha dos passos */}
                <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-1 flex-shrink-0 overflow-x-auto">
                    {PASSOS.map((p, idx) => {
                        const Icone = p.icone;
                        const ativo = passo === p.n;
                        const feito = passo > p.n;
                        return (
                            <React.Fragment key={p.n}>
                                <button
                                    onClick={() => (p.n < passo ? setPasso(p.n) : null)}
                                    disabled={p.n > passo}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                                        ativo ? 'bg-yellow-500 text-white'
                                            : feito ? 'bg-green-50 text-green-700 hover:bg-green-100'
                                                : 'bg-white text-gray-400 border border-gray-200'
                                    }`}
                                >
                                    {feito ? <CheckCircle2 size={13} /> : <Icone size={13} />}
                                    {p.n}. {p.titulo}
                                </button>
                                {idx < PASSOS.length - 1 && <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />}
                            </React.Fragment>
                        );
                    })}
                </div>

                <div className="p-5 overflow-y-auto flex-1">
                    {erro && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-300 text-red-800 rounded-lg text-xs font-bold flex items-start gap-2">
                            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> {erro}
                        </div>
                    )}

                    {/* ── PASSO 1: TRIAGEM ───────────────────────────────── */}
                    {passo === 1 && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-500">
                                Defina quem executa cada item. Itens do mesmo executor entram na
                                <b> mesma ordem de serviço</b>.
                            </p>
                            {triagem.map(item => (
                                <div key={item.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                                    <div className="flex items-start gap-2">
                                        <span className="text-xs font-bold text-gray-400 mt-1">{item.sequencia}</span>
                                        <GravidadeBadge gravidade={item.gravidade} size="sm" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-gray-800">{item.itemComponente}</p>
                                            <p className="text-xs text-gray-500">{item.descricaoProblema}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                                        <div className="md:col-span-3">
                                            <label className={labelCls}>Executor</label>
                                            <select
                                                value={item.executorTipo}
                                                onChange={e => setItem(item.id, {
                                                    executorTipo: e.target.value,
                                                    executorPartnerId: e.target.value === 'interno' ? '' : item.executorPartnerId,
                                                })}
                                                className={inputCls}
                                            >
                                                {EXECUTOR_TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="md:col-span-3">
                                            <label className={labelCls}>
                                                {item.executorTipo === 'interno' ? 'Oficina' : 'Qual fornecedor *'}
                                            </label>
                                            {item.executorTipo === 'interno' ? (
                                                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
                                                    MAK Serviços
                                                </div>
                                            ) : (
                                                <SearchableExecutorSelect
                                                    partners={partners}
                                                    value={item.executorPartnerId}
                                                    onChange={p => setItem(item.id, {
                                                        executorPartnerId: p?.id || '',
                                                        executorNome: p ? (p.nomeFantasia || p.razaoSocial) : '',
                                                    })}
                                                />
                                            )}
                                        </div>
                                        <div className="md:col-span-3">
                                            <label className={labelCls}>Serviço a executar</label>
                                            <input
                                                value={item.servicoDescricao}
                                                onChange={e => setItem(item.id, { servicoDescricao: e.target.value })}
                                                placeholder="O que será feito"
                                                className={inputCls}
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className={labelCls}>Valor estimado</label>
                                            {/* CurrencyInput devolve evento sintético com o valor cru. */}
                                            <CurrencyInput
                                                value={item.valorEstimado}
                                                onChange={e => setItem(item.id, { valorEstimado: e.target.value })}
                                                className={inputCls}
                                            />
                                        </div>
                                        <div className="md:col-span-1">
                                            <label className={labelCls} title="Prazo em dias úteis">Prazo</label>
                                            <input
                                                type="number" min="1"
                                                value={item.slaDiasUteis}
                                                onChange={e => setItem(item.id, { slaDiasUteis: e.target.value })}
                                                placeholder={String(slaPorGravidade[item.gravidade]?.slaDiasUteis ?? '')}
                                                title={`Padrão da gravidade ${item.gravidade}: ${slaPorGravidade[item.gravidade]?.slaDiasUteis ?? '—'} dias úteis`}
                                                className={inputCls}
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => aplicarExecutorATodos(item)}
                                        className="text-[11px] font-bold text-blue-600 hover:underline"
                                    >
                                        Aplicar este executor a todos os itens
                                    </button>
                                </div>
                            ))}
                            {semExecutor > 0 && (
                                <div className="p-2.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg text-xs font-bold">
                                    {semExecutor} item(ns) sem fornecedor selecionado — eles não gerarão ordem.
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── PASSO 2: EQUIPAMENTO ───────────────────────────── */}
                    {passo === 2 && (
                        <div className="space-y-4">
                            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Situação atual</p>
                                {situacao ? (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase">Status</p>
                                            <p className="text-gray-800">{situacao.status || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase">Obra atual</p>
                                            <p className="text-gray-800">{situacao.obraAtual?.nome || (situacao.estaAlocado ? 'Alocado' : 'No pátio')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase">Operador</p>
                                            <p className="text-gray-800">{situacao.obraAtual?.operador || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase">
                                                Leitura no sistema ({situacao.readingType === 'odometro' ? 'Km' : 'Hr'})
                                            </p>
                                            <p className="text-gray-800">{Number(situacao.leituraAtual || 0).toLocaleString('pt-BR')}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-400">Carregando situação do equipamento...</p>
                                )}
                            </div>

                            {situacao && !situacao.estaAlocado && (
                                <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg text-xs flex items-start gap-2">
                                    <Info size={13} className="mt-0.5 flex-shrink-0" />
                                    Equipamento já está no pátio — nenhuma saída de obra será feita.
                                </div>
                            )}

                            {temBloqueante && (
                                <div className="p-2.5 bg-red-50 border border-red-300 text-red-900 rounded-lg text-xs font-bold flex items-start gap-2">
                                    <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                                    Há item de gravidade A (impossibilita trabalhar) — sugerimos tirar o equipamento da obra.
                                </div>
                            )}

                            <label className={`flex items-start gap-2 p-3 border rounded-lg cursor-pointer ${
                                situacao && !situacao.estaAlocado ? 'opacity-50 pointer-events-none border-gray-200' : 'border-gray-200 hover:bg-gray-50'
                            }`}>
                                <input
                                    type="checkbox"
                                    checked={veiculo.fazerSaidaObra}
                                    onChange={e => setVeiculo(v => ({ ...v, fazerSaidaObra: e.target.checked }))}
                                    className="w-4 h-4 accent-yellow-500 mt-0.5"
                                />
                                <span className="text-sm">
                                    <b>Fazer saída de obra</b>
                                    <span className="block text-xs text-gray-500">
                                        Encerra a estadia na obra, libera o operador e devolve o equipamento ao pátio.
                                    </span>
                                </span>
                            </label>

                            {veiculo.fazerSaidaObra && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pl-6">
                                    <div>
                                        <label className={labelCls}>Data da saída</label>
                                        <input type="date" value={veiculo.dataSaida}
                                            onChange={e => setVeiculo(v => ({ ...v, dataSaida: e.target.value }))} className={inputCls} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className={labelCls}>Observações da saída</label>
                                        <input value={veiculo.observacoesSaida}
                                            onChange={e => setVeiculo(v => ({ ...v, observacoesSaida: e.target.value }))}
                                            className={inputCls} placeholder="Opcional" />
                                    </div>
                                </div>
                            )}

                            <label className="flex items-start gap-2 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                                <input
                                    type="checkbox"
                                    checked={veiculo.colocarEmManutencao}
                                    onChange={e => setVeiculo(v => ({ ...v, colocarEmManutencao: e.target.checked }))}
                                    className="w-4 h-4 accent-yellow-500 mt-0.5"
                                />
                                <span className="text-sm">
                                    <b>Colocar em manutenção</b>
                                    <span className="block text-xs text-gray-500">
                                        Marca o equipamento como indisponível para a operação enquanto os serviços correm.
                                    </span>
                                </span>
                            </label>

                            {veiculo.colocarEmManutencao && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-6">
                                    <div>
                                        <label className={labelCls}>Status</label>
                                        <select value={veiculo.statusVeiculo}
                                            onChange={e => setVeiculo(v => ({ ...v, statusVeiculo: e.target.value }))} className={inputCls}>
                                            <option value="Em Manutenção">Em Manutenção</option>
                                            <option value="Aguardando Manutenção">Aguardando Manutenção</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Local</label>
                                        <input value={veiculo.localManutencao}
                                            onChange={e => setVeiculo(v => ({ ...v, localManutencao: e.target.value }))} className={inputCls} />
                                    </div>
                                </div>
                            )}

                            {/* A ficha é preenchida à mão dias antes: a leitura anotada
                                costuma estar atrasada e rebaixaria o odômetro. */}
                            {situacao && (() => {
                                const leituraFicha = situacao.readingType === 'odometro' ? relato.hodometro : relato.horimetro;
                                if (leituraFicha == null || Number(leituraFicha) >= Number(situacao.leituraAtual || 0)) return null;
                                return (
                                    <div className="p-3 bg-red-50 border border-red-300 rounded-lg space-y-2">
                                        <p className="text-xs font-bold text-red-900 flex items-start gap-2">
                                            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                                            A leitura da ficha ({Number(leituraFicha).toLocaleString('pt-BR')}) é menor que a
                                            do sistema ({Number(situacao.leituraAtual).toLocaleString('pt-BR')}).
                                        </p>
                                        <label className="flex items-center gap-2 cursor-pointer text-xs text-red-900">
                                            <input type="checkbox" checked={veiculo.forcarLeitura}
                                                onChange={e => setVeiculo(v => ({ ...v, forcarLeitura: e.target.checked }))}
                                                className="w-4 h-4 accent-red-600" />
                                            Prosseguir mesmo assim (a leitura do equipamento não será rebaixada)
                                        </label>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* ── PASSO 3: OS DO MC ──────────────────────────────── */}
                    {passo === 3 && (
                        <div className="space-y-4 max-w-xl">
                            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2">
                                <Info size={13} className="mt-0.5 flex-shrink-0" />
                                Todas as ordens geradas por este relato ficarão vinculadas a esta OS
                                enquanto não forem concluídas.
                            </div>
                            <div>
                                <label className={labelCls}>Número da OS do sistema MC *</label>
                                <input
                                    value={osMc}
                                    onChange={e => setOsMc(e.target.value)}
                                    placeholder="Ex.: MC-2026-4471"
                                    autoFocus
                                    className={`${inputCls} text-lg font-bold`}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Data base dos prazos</label>
                                    <input type="date" value={dataBase} onChange={e => setDataBase(e.target.value)} className={inputCls} />
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        Os prazos contam em dias úteis a partir daqui, pulando fins de semana e feriados.
                                    </p>
                                </div>
                                <div>
                                    <label className={labelCls}>Funcionário autorizado</label>
                                    <select value={employeeIdAutorizado} onChange={e => setEmployeeIdAutorizado(e.target.value)} className={inputCls}>
                                        <option value="">Não informar</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                                    </select>
                                    <p className="text-[10px] text-gray-400 mt-1">Aparece nas ordens como responsável pela retirada.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── PASSO 4: PRÉVIA ────────────────────────────────── */}
                    {passo === 4 && (
                        carregando && !preview ? (
                            <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
                                <Loader2 size={16} className="animate-spin" /> Montando a prévia...
                            </div>
                        ) : preview && (
                            <div className="space-y-5">
                                {preview.avisos?.length > 0 && (
                                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg space-y-1">
                                        {preview.avisos.map((a, i) => (
                                            <p key={i} className="text-xs text-amber-900 flex items-start gap-2">
                                                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {a}
                                            </p>
                                        ))}
                                    </div>
                                )}

                                <div>
                                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-2">
                                        {preview.grupos.length} ordem(ns) que serão criadas
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {preview.grupos.map(g => (
                                            <div key={g.executorPartnerId} className="border border-gray-200 rounded-lg overflow-hidden">
                                                <div className="px-3 py-2 bg-slate-800 text-white flex items-center justify-between gap-2">
                                                    <span className="text-xs font-bold truncate">{g.executorNome}</span>
                                                    <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded uppercase flex-shrink-0">
                                                        {g.tipo === 'compra' ? 'Compra' : 'Serviço'}
                                                    </span>
                                                </div>
                                                <div className="p-2 space-y-1">
                                                    {g.itens.map(i => (
                                                        <div key={i.id} className="flex items-start gap-2 text-xs">
                                                            <GravidadeBadge gravidade={i.gravidade} size="sm" />
                                                            <span className="flex-1 min-w-0 text-gray-700">
                                                                {i.itemComponente}
                                                                {i.servicoDescricao && <span className="text-gray-400"> — {i.servicoDescricao}</span>}
                                                            </span>
                                                            <span className="text-gray-500 flex-shrink-0">
                                                                {i.valorEstimado != null ? fmtMoeda(i.quantidade * i.valorEstimado) : 'a cotar'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="px-3 py-2 bg-gray-50 border-t flex justify-between text-xs">
                                                    <span className="text-gray-500">
                                                        Prazo: <b>{fmtData(g.dataConclusaoPrevista)}</b>
                                                    </span>
                                                    <span className="font-bold text-gray-800">
                                                        {g.totalEstimado > 0 ? fmtMoeda(g.totalEstimado) : 'A cotar'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-2">
                                        Sequência de manutenção (dias úteis)
                                    </h3>
                                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                        <table className="w-full min-w-[640px] text-sm">
                                            <thead className="bg-gray-50 border-b border-gray-200">
                                                <tr className="text-[10px] font-bold text-gray-500 uppercase">
                                                    <th className="px-2 py-2 text-center w-10">#</th>
                                                    <th className="px-2 py-2 text-center w-12">Grav.</th>
                                                    <th className="px-2 py-2 text-left">Item</th>
                                                    <th className="px-2 py-2 text-left w-40">Executor</th>
                                                    <th className="px-2 py-2 text-center w-20">Prazo</th>
                                                    <th className="px-2 py-2 text-center w-24">Início</th>
                                                    <th className="px-2 py-2 text-center w-24">Conclusão</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {preview.cronograma.map(cr => (
                                                    <tr key={cr.itemId} className="hover:bg-gray-50">
                                                        <td className="px-2 py-1.5 text-center text-xs font-bold text-gray-400">{cr.ordemSequencia}</td>
                                                        <td className="px-2 py-1.5 text-center"><GravidadeBadge gravidade={cr.gravidade} size="sm" /></td>
                                                        <td className="px-2 py-1.5 text-gray-700 text-xs">{cr.itemComponente}</td>
                                                        <td className="px-2 py-1.5 text-gray-500 text-xs truncate">
                                                            {preview.grupos.find(g => g.executorPartnerId === cr.executorPartnerId)?.executorNome || '—'}
                                                        </td>
                                                        <td className="px-2 py-1.5 text-center text-xs text-gray-500">{cr.slaDiasUteis} d.ú.</td>
                                                        <td className="px-2 py-1.5 text-center text-xs">{fmtData(cr.dataInicioPrevista)}</td>
                                                        <td className="px-2 py-1.5 text-center text-xs font-bold">{fmtData(cr.dataConclusaoPrevista)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                        <p className="text-[10px] text-gray-400 uppercase">OS do MC</p>
                                        <p className="text-sm font-bold text-slate-800">{osMc || '—'}</p>
                                    </div>
                                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                        <p className="text-[10px] text-gray-400 uppercase">Conclusão geral prevista</p>
                                        <p className="text-sm font-bold text-slate-800">{fmtData(preview.dataConclusaoPrevistaGeral)}</p>
                                    </div>
                                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                        <p className="text-[10px] text-gray-400 uppercase">Equipamento</p>
                                        <p className="text-sm font-bold text-slate-800">
                                            {veiculo.fazerSaidaObra ? 'Sai da obra' : 'Permanece'}
                                            {veiculo.colocarEmManutencao ? ` · ${veiculo.statusVeiculo}` : ''}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )
                    )}
                </div>

                <div className="px-5 py-3 border-t bg-gray-50 flex justify-between items-center gap-3 flex-shrink-0">
                    <button
                        onClick={() => (passo === 1 ? onClose() : setPasso(passo - 1))}
                        disabled={carregando}
                        className="flex items-center gap-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg disabled:opacity-40"
                    >
                        <ChevronLeft size={13} /> {passo === 1 ? 'Cancelar' : 'Voltar'}
                    </button>

                    {passo < 4 ? (
                        <button
                            onClick={() => irPara(passo + 1)}
                            disabled={carregando || (passo === 3 && !osMc.trim())}
                            className="flex items-center gap-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold rounded-lg shadow disabled:opacity-40"
                        >
                            {carregando && <Loader2 size={13} className="animate-spin" />}
                            {passo === 3 ? 'Ver prévia' : 'Avançar'} <ChevronRight size={13} />
                        </button>
                    ) : (
                        <button
                            onClick={confirmar}
                            disabled={carregando || !preview || preview.grupos.length === 0}
                            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg shadow disabled:opacity-40"
                        >
                            {carregando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                            Confirmar e gerar {preview?.grupos.length || 0} ordem(ns)
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FecharRelatoWizard;
