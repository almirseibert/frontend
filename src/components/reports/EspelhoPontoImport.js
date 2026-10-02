import React, { useState, useRef, useMemo } from 'react';
import { Upload, Loader, Save, AlertTriangle, CheckCircle, Pencil, X } from 'lucide-react';
import apiClient from '../../services/apiClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

const RE_HORA = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DIAS_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MAX_DIAS = 62;

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
const analisar = (texto) => {
    const partes = parseMarcacoes(texto);
    const invalido = partes.some(p => !RE_HORA.test(p));
    let minutos = 0;
    let foraDeOrdem = false;
    if (!invalido) {
        for (let i = 0; i + 1 < partes.length; i += 2) {
            const d = minutosDe(partes[i + 1]) - minutosDe(partes[i]);
            if (d > 0) minutos += d; else foraDeOrdem = true;
        }
    }
    return { partes, invalido, impar: partes.length % 2 === 1, foraDeOrdem, minutos };
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

// ── Componente ───────────────────────────────────────────────────────────────
//
// Lança as horas do ponto do operador selecionado: importa o PDF do espelho de
// ponto (lido por IA, conferido na tela antes de salvar) ou digita/edita as
// marcações do período. O que for salvo alimenta a trilha "Ponto" do relatório.

const EspelhoPontoImport = ({ employees = [], employeeId, onEmployeeChange, startDate, endDate }) => {
    const fileRef = useRef(null);
    const [loading, setLoading] = useState('');     // '' | 'lendo' | 'carregando' | 'salvando'
    const [erro, setErro] = useState('');
    const [sucesso, setSucesso] = useState('');
    const [linhas, setLinhas] = useState(null);     // [{ data, texto, observacao, horasNormais, conferir }]
    const [origem, setOrigem] = useState('pdf');
    const [arquivoNome, setArquivoNome] = useState('');
    const [doc, setDoc] = useState(null);           // { funcionario, funcionarioSugerido, periodo }

    const selecionado = useMemo(() => employees.find(e => e.id === employeeId) || null, [employees, employeeId]);

    const limpar = () => { setLinhas(null); setDoc(null); setArquivoNome(''); setErro(''); };

    const handleArquivo = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        setErro(''); setSucesso(''); setLinhas(null); setDoc(null);
        if (file.size > 10 * 1024 * 1024) { setErro('Arquivo acima de 10 MB.'); return; }
        setLoading('lendo');
        try {
            const r = await apiClient.lerEspelhoPonto(file);
            setOrigem('pdf');
            setArquivoNome(r.arquivoNome || file.name);
            setDoc({ funcionario: r.funcionario, funcionarioSugerido: r.funcionarioSugerido, periodo: r.periodo });
            setLinhas(r.dias.map(d => ({
                data: d.data,
                texto: d.marcacoes.join(' '),
                observacao: d.observacao || '',
                horasNormais: d.horasNormais,
                conferir: !!d.conferir,
            })));
            // Sem operador escolhido, assume o do documento.
            if (!employeeId && r.funcionarioSugerido && onEmployeeChange) onEmployeeChange(r.funcionarioSugerido.id);
        } catch (err) {
            setErro(err.message || 'Não foi possível ler o arquivo.');
        } finally {
            setLoading('');
        }
    };

    const handleEditarPeriodo = async () => {
        setErro(''); setSucesso('');
        if (!employeeId) { setErro('Selecione o operador.'); return; }
        if (!startDate || !endDate || startDate > endDate) { setErro('Informe um período válido.'); return; }
        const datas = datasDoPeriodo(startDate, endDate);
        if (datas.length > MAX_DIAS) { setErro(`Para digitar o ponto, use um período de até ${MAX_DIAS} dias.`); return; }
        setLoading('carregando');
        try {
            const salvos = await apiClient.getEspelhoPonto(employeeId, { startDate, endDate });
            const porData = new Map(salvos.map(s => [s.data, s]));
            setOrigem('manual');
            setArquivoNome('');
            setDoc(null);
            setLinhas(datas.map(data => {
                const s = porData.get(data);
                return { data, texto: s ? s.marcacoes.join(' ') : '', observacao: s ? (s.observacao || '') : '', horasNormais: null, conferir: false };
            }));
        } catch (err) {
            setErro(err.message || 'Erro ao buscar o ponto do período.');
        } finally {
            setLoading('');
        }
    };

    const setLinha = (idx, campo, valor) =>
        setLinhas(prev => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor, conferir: campo === 'texto' ? false : l.conferir } : l)));

    const analises = useMemo(() => (linhas || []).map(l => analisar(l.texto)), [linhas]);
    const temInvalido = analises.some(a => a.invalido);
    const totalMin = analises.reduce((s, a) => s + a.minutos, 0);
    const pendentes = (linhas || []).filter((l, i) => {
        const a = analises[i];
        return l.conferir || a.impar || a.foraDeOrdem
            || (l.horasNormais && !a.invalido && minutosDe(l.horasNormais) !== a.minutos);
    }).length;

    // O nome lido no documento bate com o operador selecionado?
    const sugerido = doc && doc.funcionarioSugerido;
    const divergente = !!(doc && employeeId && sugerido && sugerido.id !== employeeId);
    const naoEncontrado = !!(doc && doc.funcionario && doc.funcionario.nome && !sugerido);

    const handleSalvar = async () => {
        setErro(''); setSucesso('');
        if (!employeeId) { setErro('Selecione o operador que vai receber essas horas.'); return; }
        if (temInvalido) { setErro('Há horários inválidos. Use o formato HH:MM.'); return; }
        setLoading('salvando');
        try {
            const r = await apiClient.salvarEspelhoPonto({
                employeeId,
                origem,
                arquivoNome,
                dias: linhas.map((l, i) => ({
                    data: l.data,
                    marcacoes: analises[i].partes.map(p => p.padStart(5, '0')),
                    observacao: l.observacao || null,
                })),
            });
            setSucesso(`Ponto salvo para ${selecionado ? selecionado.nome : 'o operador'}: ${r.gravados} dia(s). Gere o relatório para ver a trilha Ponto.`);
            setLinhas(null); setDoc(null);
        } catch (err) {
            setErro(err.message || 'Erro ao salvar o ponto.');
        } finally {
            setLoading('');
        }
    };

    return (
        <div className="mt-8 border-t pt-6">
            <h3 className="text-base font-bold mb-1" style={{ color: '#1e1a14' }}>Horas do ponto</h3>
            <p className="text-sm text-gray-500 mb-4">
                Importe o PDF do espelho de ponto do operador ou digite as marcações. As horas salvas aparecem na trilha
                {' '}<strong>Ponto</strong> do relatório.
            </p>

            <div className="flex flex-wrap gap-2 mb-3">
                <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={handleArquivo} />
                <button
                    onClick={() => fileRef.current && fileRef.current.click()}
                    disabled={!!loading}
                    className="flex items-center gap-2 px-4 py-2 rounded-md bg-gray-800 hover:bg-gray-700 text-white font-semibold text-sm disabled:opacity-50"
                >
                    {loading === 'lendo' ? <Loader size={16} className="animate-spin" /> : <Upload size={16} />}
                    {loading === 'lendo' ? 'Lendo o espelho… (até 1 minuto)' : 'Importar espelho de ponto (PDF)'}
                </button>
                <button
                    onClick={handleEditarPeriodo}
                    disabled={!!loading || !employeeId}
                    className="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm disabled:opacity-50"
                >
                    {loading === 'carregando' ? <Loader size={16} className="animate-spin" /> : <Pencil size={16} />}
                    Digitar / editar ponto do período
                </button>
            </div>

            {erro && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{erro}</div>}
            {sucesso && (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3 flex items-center gap-2">
                    <CheckCircle size={16} /> {sucesso}
                </div>
            )}

            {linhas && (
                <div className="space-y-3">
                    {doc && (
                        <div className="text-sm bg-gray-50 border rounded px-3 py-2">
                            <div>
                                <span className="text-gray-500">Funcionário no documento:</span>{' '}
                                <strong>{doc.funcionario.nome || '—'}</strong>
                                {doc.funcionario.matricula ? ` (${doc.funcionario.matricula})` : ''}
                                {doc.periodo ? ` · ${fmtDateBr(doc.periodo.inicio)} a ${fmtDateBr(doc.periodo.fim)}` : ''}
                            </div>
                            <div>
                                <span className="text-gray-500">Será salvo para:</span>{' '}
                                <strong>{selecionado ? selecionado.nome : 'nenhum operador selecionado'}</strong>
                            </div>
                        </div>
                    )}

                    {divergente && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 flex flex-wrap items-center gap-2">
                            <AlertTriangle size={16} />
                            O espelho é de <strong>{sugerido.nome}</strong>, mas o operador selecionado é outro.
                            <button onClick={() => onEmployeeChange && onEmployeeChange(sugerido.id)} className="underline font-semibold">
                                Usar {sugerido.nome}
                            </button>
                        </div>
                    )}
                    {naoEncontrado && (
                        <div className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded px-3 py-2 flex items-center gap-2">
                            <AlertTriangle size={16} />
                            O nome do documento não foi encontrado no cadastro. Confira o operador selecionado antes de salvar.
                        </div>
                    )}
                    {pendentes > 0 && (
                        <div className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded px-3 py-2 flex items-center gap-2">
                            <AlertTriangle size={16} />
                            {pendentes} dia(s) em amarelo para conferir com o documento (total diferente do espelho, batida sem par ou leitura duvidosa).
                        </div>
                    )}

                    <div className="overflow-x-auto rounded-lg border max-h-[28rem] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs uppercase text-gray-600 sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 text-left">Data</th>
                                    <th className="px-3 py-2 text-left">Marcações (HH:MM, separadas por espaço)</th>
                                    <th className="px-3 py-2 text-left">Observação</th>
                                    <th className="px-3 py-2 text-right">Total</th>
                                    {origem === 'pdf' && <th className="px-3 py-2 text-right">Espelho</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {linhas.map((l, i) => {
                                    const a = analises[i];
                                    const difere = l.horasNormais && !a.invalido && minutosDe(l.horasNormais) !== a.minutos;
                                    const alerta = l.conferir || a.impar || a.foraDeOrdem || difere;
                                    return (
                                        <tr key={l.data} className={a.invalido ? 'bg-red-50' : alerta ? 'bg-yellow-50' : ''}>
                                            <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">
                                                {fmtDateBr(l.data)} <span className="text-xs text-gray-400">{diaSemana(l.data)}</span>
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input
                                                    type="text" value={l.texto} placeholder="07:00 11:30 13:00 17:18"
                                                    onChange={e => setLinha(i, 'texto', e.target.value)}
                                                    className={`w-full border rounded px-2 py-1 text-sm focus:outline-none focus:border-yellow-500 ${a.invalido ? 'border-red-400' : 'border-gray-300'}`}
                                                />
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input
                                                    type="text" value={l.observacao} placeholder="DSR, feriado…" maxLength={120}
                                                    onChange={e => setLinha(i, 'observacao', e.target.value)}
                                                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-yellow-500"
                                                />
                                            </td>
                                            <td className="px-3 py-1.5 text-right font-medium whitespace-nowrap">
                                                {a.invalido ? <span className="text-red-600 text-xs">inválido</span> : (a.minutos ? fmtMin(a.minutos) : '—')}
                                            </td>
                                            {origem === 'pdf' && (
                                                <td className={`px-3 py-1.5 text-right whitespace-nowrap ${difere ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
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
                                    {origem === 'pdf' && <td />}
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={handleSalvar}
                            disabled={!!loading || temInvalido || !employeeId || divergente}
                            className="flex items-center gap-2 px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white font-semibold text-sm disabled:opacity-50"
                        >
                            {loading === 'salvando' ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                            Salvar ponto ({linhas.length} dias)
                        </button>
                        <button onClick={limpar} disabled={!!loading} className="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm disabled:opacity-50">
                            <X size={16} /> Descartar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EspelhoPontoImport;
