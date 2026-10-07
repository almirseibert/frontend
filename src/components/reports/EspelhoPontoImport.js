import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
    Upload, Loader, Save, AlertTriangle, CheckCircle, Pencil, X, ChevronDown, ChevronRight, RotateCcw, FileText,
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import SearchableSelect from '../SearchableSelect';

// ── Helpers ──────────────────────────────────────────────────────────────────

const RE_HORA = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DIAS_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MAX_DIAS = 62;
const MAX_BYTES = 10 * 1024 * 1024;
// Leituras simultâneas. A leitura direta do PDF original é imediata; a de reserva
// (IA, para PDF sem texto) leva ~30 s, e 3 em paralelo não disparam limite de taxa.
const LEITURAS_SIMULTANEAS = 3;

const fmtDateBr = (iso) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
};
const diaSemana = (iso) => DIAS_SEMANA[new Date(`${iso}T12:00:00`).getDay()];
const fmtMin = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// "07:00 11:30 13:00 17:18" → ['07:00', '11:30', ...]; aceita vírgula, ponto e vírgula e traço.
const parseMarcacoes = (texto) => String(texto || '').split(/[\s,;–-]+/).map(s => s.trim()).filter(Boolean);
const minutosDe = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// Estado de uma linha a partir do texto digitado.
const analisar = (linha) => {
    const partes = parseMarcacoes(linha.texto);
    const invalido = partes.some(p => !RE_HORA.test(p));
    let minutos = 0;
    let foraDeOrdem = false;
    if (!invalido) {
        for (let i = 0; i + 1 < partes.length; i += 2) {
            const d = minutosDe(partes[i + 1]) - minutosDe(partes[i]);
            if (d > 0) minutos += d; else foraDeOrdem = true;
        }
    }
    const difere = !!(linha.horasNormais && !invalido && minutosDe(linha.horasNormais) !== minutos);
    const alerta = linha.conferir || partes.length % 2 === 1 || foraDeOrdem || difere;
    return { partes, invalido, minutos, difere, alerta };
};

const resumoItem = (item) => {
    const analises = (item.linhas || []).map(analisar);
    return {
        analises,
        invalidos: analises.filter(a => a.invalido).length,
        pendentes: analises.filter(a => a.alerta).length,
        totalMin: analises.reduce((s, a) => s + a.minutos, 0),
    };
};

const datasDoPeriodo = (startDate, endDate) => {
    const out = [];
    const cur = new Date(`${startDate}T12:00:00`);
    const fim = new Date(`${endDate}T12:00:00`);
    while (cur <= fim && out.length <= MAX_DIAS) {
        out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
        cur.setDate(cur.getDate() + 1);
    }
    return out;
};

let seq = 0;
const novaChave = () => `esp-${Date.now()}-${++seq}`;

// ── Tabela de conferência de um espelho ──────────────────────────────────────

const TabelaMarcacoes = ({ item, onLinha }) => {
    const { analises, totalMin } = resumoItem(item);
    const comEspelho = item.origem === 'pdf';
    return (
        <div className="overflow-x-auto rounded-lg border max-h-[28rem] overflow-y-auto bg-white">
            <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-600 sticky top-0">
                    <tr>
                        <th className="px-3 py-2 text-left">Data</th>
                        <th className="px-3 py-2 text-left">Marcações (HH:MM, separadas por espaço)</th>
                        <th className="px-3 py-2 text-left">Observação</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        {comEspelho && <th className="px-3 py-2 text-right">Espelho</th>}
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {item.linhas.map((l, i) => {
                        const a = analises[i];
                        return (
                            <tr key={l.data} className={a.invalido ? 'bg-red-50' : a.alerta ? 'bg-yellow-50' : ''}>
                                <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">
                                    {fmtDateBr(l.data)} <span className="text-xs text-gray-400">{diaSemana(l.data)}</span>
                                </td>
                                <td className="px-3 py-1.5">
                                    <input
                                        type="text" value={l.texto} placeholder="07:00 11:30 13:00 17:18"
                                        onChange={e => onLinha(i, 'texto', e.target.value)}
                                        className={`w-full border rounded px-2 py-1 text-sm focus:outline-none focus:border-yellow-500 ${a.invalido ? 'border-red-400' : 'border-gray-300'}`}
                                    />
                                </td>
                                <td className="px-3 py-1.5">
                                    <input
                                        type="text" value={l.observacao} placeholder="DSR, feriado…" maxLength={120}
                                        onChange={e => onLinha(i, 'observacao', e.target.value)}
                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-yellow-500"
                                    />
                                </td>
                                <td className="px-3 py-1.5 text-right font-medium whitespace-nowrap">
                                    {a.invalido ? <span className="text-red-600 text-xs">inválido</span> : (a.minutos ? fmtMin(a.minutos) : '—')}
                                </td>
                                {comEspelho && (
                                    <td className={`px-3 py-1.5 text-right whitespace-nowrap ${a.difere ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                        {l.horasNormais || '—'}
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot className="bg-gray-50 font-bold sticky bottom-0">
                    <tr>
                        <td className="px-3 py-2" colSpan={3}>Total do período</td>
                        <td className="px-3 py-2 text-right">{fmtMin(totalMin)}</td>
                        {comEspelho && <td />}
                    </tr>
                </tfoot>
            </table>
        </div>
    );
};

// ── Componente ───────────────────────────────────────────────────────────────
//
// Lança as horas do ponto: importa um ou VÁRIOS PDFs de espelho de ponto (cada
// arquivo com um ou vários funcionários), conferidos na tela antes de salvar, ou
// digita as marcações do operador selecionado. O PDF original do sistema de
// ponto é lido direto; PDF sem texto cai na leitura por IA. O que for salvo
// alimenta a trilha "Ponto" do relatório de jornadas.

const EspelhoPontoImport = ({ employees = [], employeeId, startDate, endDate }) => {
    const fileRef = useRef(null);
    const [itens, setItens] = useState([]);
    const [erro, setErro] = useState('');
    const [carregandoManual, setCarregandoManual] = useState(false);
    const [salvandoTodos, setSalvandoTodos] = useState(false);
    const lendoRef = useRef(new Set());

    const ativos = useMemo(
        () => employees.filter(e => e.status !== 'inativo').sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
        [employees]
    );
    const nomeDe = (id) => (employees.find(e => e.id === id) || {}).nome || '';

    const atualizar = (key, patch) =>
        setItens(prev => prev.map(it => (it.key === key ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch) } : it)));

    // ── Fila de leitura ──
    useEffect(() => {
        const emLeitura = itens.filter(it => it.status === 'lendo').length;
        const vagas = LEITURAS_SIMULTANEAS - emLeitura;
        if (vagas <= 0) return;
        itens.filter(it => it.status === 'fila' && !lendoRef.current.has(it.key)).slice(0, vagas).forEach(it => {
            lendoRef.current.add(it.key);
            atualizar(it.key, { status: 'lendo' });
            apiClient.lerEspelhoPonto(it.file)
                .then(r => {
                    // Um arquivo pode trazer vários funcionários: o item da fila
                    // vira um cartão por espelho encontrado.
                    const varios = r.espelhos.length > 1;
                    const cartoes = r.espelhos.map((e, idx) => ({
                        ...it,
                        key: idx === 0 ? it.key : novaChave(),
                        file: null,
                        nome: varios ? `${e.funcionario.nome || `Funcionário ${idx + 1}`} — ${it.nome}` : it.nome,
                        status: 'pronto',
                        metodo: e.metodo,
                        arquivoNome: r.arquivoNome || it.nome,
                        doc: { funcionario: e.funcionario, funcionarioSugerido: e.funcionarioSugerido, periodo: e.periodo },
                        employeeId: e.funcionarioSugerido ? e.funcionarioSugerido.id : '',
                        linhas: e.dias.map(d => ({
                            data: d.data,
                            texto: d.marcacoes.join(' '),
                            observacao: d.observacao || '',
                            horasNormais: d.horasNormais,
                            conferir: !!d.conferir,
                        })),
                    }));
                    setItens(prev => prev.flatMap(x => (x.key === it.key ? cartoes : [x])));
                })
                .catch(err => atualizar(it.key, { status: 'erro', erro: err.message || 'Não foi possível ler o arquivo.' }))
                .finally(() => { lendoRef.current.delete(it.key); });
        });
    }, [itens]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleArquivos = (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (!files.length) return;
        setErro('');
        setItens(prev => [
            ...prev,
            ...files.map(file => ({
                key: novaChave(),
                file,
                nome: file.name,
                origem: 'pdf',
                status: file.size > MAX_BYTES ? 'erro' : 'fila',
                erro: file.size > MAX_BYTES ? 'Arquivo acima de 10 MB.' : '',
                aberto: false,
            })),
        ]);
    };

    const handleEditarPeriodo = async () => {
        setErro('');
        if (!employeeId) { setErro('Selecione o operador acima para digitar o ponto.'); return; }
        if (!startDate || !endDate || startDate > endDate) { setErro('Informe um período válido.'); return; }
        const datas = datasDoPeriodo(startDate, endDate);
        if (datas.length > MAX_DIAS) { setErro(`Para digitar o ponto, use um período de até ${MAX_DIAS} dias.`); return; }
        setCarregandoManual(true);
        try {
            const salvos = await apiClient.getEspelhoPonto(employeeId, { startDate, endDate });
            const porData = new Map(salvos.map(s => [s.data, s]));
            setItens(prev => [{
                key: novaChave(),
                nome: `Digitação — ${nomeDe(employeeId)}`,
                origem: 'manual',
                status: 'pronto',
                employeeId,
                arquivoNome: '',
                doc: null,
                aberto: true,
                linhas: datas.map(data => {
                    const s = porData.get(data);
                    return { data, texto: s ? s.marcacoes.join(' ') : '', observacao: s ? (s.observacao || '') : '', horasNormais: null, conferir: false };
                }),
            }, ...prev]);
        } catch (err) {
            setErro(err.message || 'Erro ao buscar o ponto do período.');
        } finally {
            setCarregandoManual(false);
        }
    };

    const setLinha = (key, idx, campo, valor) => atualizar(key, it => ({
        status: it.status === 'salvo' ? 'pronto' : it.status,
        linhas: it.linhas.map((l, i) => (i === idx ? { ...l, [campo]: valor, conferir: campo === 'texto' ? false : l.conferir } : l)),
    }));

    const salvarItem = async (it) => {
        const { analises, invalidos } = resumoItem(it);
        if (!it.employeeId) { atualizar(it.key, { erroSalvar: 'Escolha o funcionário.' }); return false; }
        if (invalidos) { atualizar(it.key, { erroSalvar: 'Há horários inválidos. Use o formato HH:MM.' }); return false; }
        atualizar(it.key, { status: 'salvando', erroSalvar: '' });
        try {
            const r = await apiClient.salvarEspelhoPonto({
                employeeId: it.employeeId,
                origem: it.origem,
                arquivoNome: it.arquivoNome,
                dias: it.linhas.map((l, i) => ({
                    data: l.data,
                    marcacoes: analises[i].partes.map(p => p.padStart(5, '0')),
                    observacao: l.observacao || null,
                })),
            });
            atualizar(it.key, { status: 'salvo', aberto: false, salvoMsg: `${r.gravados} dia(s) salvos para ${nomeDe(it.employeeId)}.` });
            return true;
        } catch (err) {
            atualizar(it.key, { status: 'pronto', erroSalvar: err.message || 'Erro ao salvar.' });
            return false;
        }
    };

    // Salvar em massa: só os que não pedem conferência (sem dia amarelo/vermelho e
    // com funcionário). Os demais ficam para abrir, conferir e salvar um a um.
    const prontosParaSalvar = itens.filter(it => {
        if (it.status !== 'pronto' || !it.employeeId) return false;
        const r = resumoItem(it);
        return !r.invalidos && !r.pendentes;
    });

    const handleSalvarTodos = async () => {
        setSalvandoTodos(true);
        for (const it of prontosParaSalvar) {
            // Sequencial: cada envio é uma transação; não há ganho em paralelizar.
            // eslint-disable-next-line no-await-in-loop
            await salvarItem(it);
        }
        setSalvandoTodos(false);
    };

    // Mesmo funcionário em mais de um item: o último salvo sobrescreve os dias em comum.
    const contagemPorFuncionario = useMemo(() => {
        const m = new Map();
        itens.forEach(it => { if (it.employeeId && it.status !== 'erro') m.set(it.employeeId, (m.get(it.employeeId) || 0) + 1); });
        return m;
    }, [itens]);

    const contagem = {
        lendo: itens.filter(it => it.status === 'fila' || it.status === 'lendo').length,
        prontos: itens.filter(it => it.status === 'pronto').length,
        salvos: itens.filter(it => it.status === 'salvo').length,
        erros: itens.filter(it => it.status === 'erro').length,
    };
    const ocupado = salvandoTodos || itens.some(it => it.status === 'salvando');

    return (
        <div className="mt-8 border-t pt-6">
            <h3 className="text-base font-bold mb-1" style={{ color: '#1e1a14' }}>Horas do ponto</h3>
            <p className="text-sm text-gray-500 mb-4">
                Importe os PDFs dos espelhos de ponto baixados do sistema de ponto — vários arquivos de uma vez, cada um
                com um ou mais funcionários — ou digite as marcações do operador selecionado. As horas salvas aparecem
                na trilha <strong>Ponto</strong> do relatório.
            </p>

            <div className="flex flex-wrap gap-2 mb-3">
                <input ref={fileRef} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={handleArquivos} />
                <button
                    onClick={() => fileRef.current && fileRef.current.click()}
                    className="flex items-center gap-2 px-4 py-2 rounded-md bg-gray-800 hover:bg-gray-700 text-white font-semibold text-sm"
                >
                    <Upload size={16} /> Importar espelhos de ponto (PDF)
                </button>
                <button
                    onClick={handleEditarPeriodo}
                    disabled={carregandoManual || !employeeId}
                    className="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm disabled:opacity-50"
                >
                    {carregandoManual ? <Loader size={16} className="animate-spin" /> : <Pencil size={16} />}
                    Digitar / editar ponto do período
                </button>
            </div>

            {erro && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{erro}</div>}

            {itens.length > 0 && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 border rounded px-3 py-2 text-sm">
                        <div className="text-gray-600">
                            {itens.length} item(ns)
                            {contagem.lendo > 0 && <> · <Loader size={12} className="inline animate-spin" /> lendo {contagem.lendo}</>}
                            {contagem.prontos > 0 && <> · {contagem.prontos} para salvar</>}
                            {contagem.salvos > 0 && <> · <span className="text-green-700">{contagem.salvos} salvo(s)</span></>}
                            {contagem.erros > 0 && <> · <span className="text-red-600">{contagem.erros} com erro</span></>}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleSalvarTodos}
                                disabled={ocupado || !prontosParaSalvar.length}
                                title="Salva os espelhos sem dias para conferir e com funcionário identificado"
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white font-semibold text-sm disabled:opacity-50"
                            >
                                {salvandoTodos ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                                Salvar conferidos ({prontosParaSalvar.length})
                            </button>
                            <button
                                onClick={() => setItens(prev => prev.filter(it => it.status === 'fila' || it.status === 'lendo' || it.status === 'salvando'))}
                                disabled={ocupado}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 font-semibold text-sm disabled:opacity-50"
                            >
                                <X size={14} /> Limpar lista
                            </button>
                        </div>
                    </div>

                    {itens.map(it => {
                        const r = it.linhas ? resumoItem(it) : null;
                        const sugerido = it.doc && it.doc.funcionarioSugerido;
                        const divergente = !!(sugerido && it.employeeId && sugerido.id !== it.employeeId);
                        const naoEncontrado = !!(it.doc && it.doc.funcionario && it.doc.funcionario.nome && !sugerido);
                        const repetido = it.employeeId && contagemPorFuncionario.get(it.employeeId) > 1;
                        const podeExpandir = !!it.linhas;
                        return (
                            <div key={it.key} className={`border rounded-lg ${it.status === 'salvo' ? 'border-green-300 bg-green-50/40' : it.status === 'erro' ? 'border-red-200 bg-red-50/40' : 'bg-white'}`}>
                                <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                                    <button
                                        onClick={() => podeExpandir && atualizar(it.key, { aberto: !it.aberto })}
                                        disabled={!podeExpandir}
                                        className="text-gray-500 disabled:opacity-30"
                                        aria-label={it.aberto ? 'Recolher' : 'Conferir dias'}
                                    >
                                        {it.aberto ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 truncate">
                                            {it.origem === 'pdf' ? <FileText size={14} className="shrink-0 text-gray-400" /> : <Pencil size={14} className="shrink-0 text-gray-400" />}
                                            <span className="truncate">{it.nome}</span>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {(it.status === 'fila') && 'Na fila de leitura…'}
                                            {(it.status === 'lendo') && <><Loader size={11} className="inline animate-spin" /> Lendo o espelho…</>}
                                            {it.status === 'erro' && <span className="text-red-600">{it.erro}</span>}
                                            {it.doc && (
                                                <>
                                                    No documento: <strong>{it.doc.funcionario.nome || '—'}</strong>
                                                    {it.doc.periodo ? ` · ${fmtDateBr(it.doc.periodo.inicio)} a ${fmtDateBr(it.doc.periodo.fim)}` : ''}
                                                </>
                                            )}
                                            {r && <> · {it.linhas.length} dias · {fmtMin(r.totalMin)}</>}
                                            {it.metodo === 'ia' && <> · <span className="text-purple-700 font-semibold">lido por IA</span></>}
                                            {it.metodo === 'texto' && <> · leitura direta</>}
                                            {it.status === 'salvo' && <span className="text-green-700"> · <CheckCircle size={11} className="inline" /> {it.salvoMsg}</span>}
                                        </div>
                                    </div>

                                    {it.linhas && it.origem === 'pdf' && (
                                        <div className="w-full sm:w-64">
                                            <SearchableSelect
                                                items={ativos}
                                                value={it.employeeId}
                                                onChange={(e) => atualizar(it.key, { employeeId: e ? e.id : '', status: it.status === 'salvo' ? 'pronto' : it.status })}
                                                getLabel={(e) => e.nome}
                                                getSubLabel={(e) => e.funcao}
                                                placeholder="Funcionário…"
                                                disabled={it.status === 'salvando'}
                                            />
                                        </div>
                                    )}

                                    {r && (r.pendentes > 0 || r.invalidos > 0) && it.status !== 'salvo' && (
                                        <span className="text-xs font-semibold px-2 py-1 rounded bg-yellow-100 text-yellow-800 whitespace-nowrap">
                                            {r.invalidos + r.pendentes} p/ conferir
                                        </span>
                                    )}

                                    <div className="flex gap-1">
                                        {it.linhas && it.status !== 'salvo' && (
                                            <button
                                                onClick={() => salvarItem(it)}
                                                disabled={ocupado || !it.employeeId || (r && r.invalidos > 0)}
                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white font-semibold text-xs disabled:opacity-50"
                                            >
                                                {it.status === 'salvando' ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Salvar
                                            </button>
                                        )}
                                        {it.status === 'erro' && it.file && (
                                            <button
                                                onClick={() => atualizar(it.key, { status: 'fila', erro: '' })}
                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-xs"
                                            >
                                                <RotateCcw size={13} /> Tentar de novo
                                            </button>
                                        )}
                                        {it.status !== 'lendo' && it.status !== 'salvando' && (
                                            <button
                                                onClick={() => setItens(prev => prev.filter(x => x.key !== it.key))}
                                                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                                                aria-label="Remover da lista"
                                            >
                                                <X size={15} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {(divergente || naoEncontrado || repetido || it.erroSalvar) && it.status !== 'salvo' && (
                                    <div className="px-3 pb-2 space-y-1">
                                        {divergente && (
                                            <div className="text-xs text-red-700 flex items-center gap-1">
                                                <AlertTriangle size={13} /> O documento é de {sugerido.nome}, mas o funcionário escolhido é {nomeDe(it.employeeId)}.
                                            </div>
                                        )}
                                        {naoEncontrado && !it.employeeId && (
                                            <div className="text-xs text-yellow-800 flex items-center gap-1">
                                                <AlertTriangle size={13} /> Nome não encontrado no cadastro — escolha o funcionário.
                                            </div>
                                        )}
                                        {repetido && (
                                            <div className="text-xs text-yellow-800 flex items-center gap-1">
                                                <AlertTriangle size={13} /> Mesmo funcionário em outro arquivo da lista: os dias em comum ficam com o último salvo.
                                            </div>
                                        )}
                                        {it.erroSalvar && <div className="text-xs text-red-600">{it.erroSalvar}</div>}
                                    </div>
                                )}

                                {it.aberto && it.linhas && (
                                    <div className="px-3 pb-3">
                                        <TabelaMarcacoes item={it} onLinha={(i, campo, valor) => setLinha(it.key, i, campo, valor)} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default EspelhoPontoImport;
