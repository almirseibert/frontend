import React, { useState, useMemo, useEffect } from 'react';
import { Loader, X, History, Calendar, Gauge, Building2, User, ArrowRight, AlertTriangle } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import { formatObraNome, OBRA_STATUS_LABEL } from '../utils/obraFormat';

// --- Estadia retroativa (split da alocação atual) ---
// Registra uma passagem passada por OUTRA obra sem tirar o veículo da obra
// atual. O backend fatia o período vigente: fecha a obra atual na saída,
// insere a estadia fechada na obra B, e reabre a obra atual a partir da volta.
const EstadiaRetroativaModal = ({
    vehicle,
    currentObra,
    obras = [],
    employees = [],
    readingType,
    readingLabel,
    onClose,
    setAlertMessage,
    apiClient,
    reloadData,
    inicial = null, // { obraId, employeeId, dataEntrada, dataSaida, observacoes, horas } — pré-preenchimento (aviso de horas sem alocação)
}) => {
    const isAllocated = !!vehicle.obraAtualId;

    // Obras candidatas: ativas/planejadas, exceto a obra atual (se houver). A
    // obra pré-preenchida entra sempre: os lançamentos já dizem onde a máquina
    // esteve, mesmo que a obra tenha sido concluída depois.
    const obraOptions = useMemo(() =>
        obras
            .filter(o => (inicial?.obraId && String(o.id) === String(inicial.obraId))
                || (['ativa', 'planejada', 'mobilizacao'].includes(o.status) && (!isAllocated || String(o.id) !== String(vehicle.obraAtualId))))
            .map(o => ({ ...o, _displayNome: `${formatObraNome(o)}${o.tipo_registro === 'centro_custo' ? ' (CC)' : ''}${o.status !== 'ativa' ? ` [${(OBRA_STATUS_LABEL[o.status] || o.status).toUpperCase()}]` : ''}` }))
            .sort((a, b) => (a._displayNome || '').localeCompare(b._displayNome || '')),
    [obras, vehicle.obraAtualId, isAllocated, inicial?.obraId]);

    const employeeOptions = useMemo(() =>
        (employees || [])
            .filter(e => e.status === 'ativo')
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [employees]);

    const [obraId, setObraId] = useState(inicial?.obraId || '');
    const [employeeId, setEmployeeId] = useState(inicial?.employeeId || '');
    const [dataEntrada, setDataEntrada] = useState(inicial?.dataEntrada || '');
    const [dataSaida, setDataSaida] = useState(inicial?.dataSaida || '');
    const [leituraPartida, setLeituraPartida] = useState('');
    const [leituraVolta, setLeituraVolta] = useState('');
    const [observacoes, setObservacoes] = useState(inicial?.observacoes || '');
    const [isSaving, setIsSaving] = useState(false);
    const [conflitos, setConflitos] = useState(null); // lista de períodos sobrepostos p/ confirmação
    // Leituras sugeridas a partir de abastecimentos, comboio, fotos e outras
    // estadias (backend: utils/leiturasSugeridas.js). Só preenche campo que o
    // usuário ainda não mexeu.
    const [sugestao, setSugestao] = useState(null);
    const [editouLeitura, setEditouLeitura] = useState({ partida: false, volta: false });

    useEffect(() => {
        if (!dataEntrada || !dataSaida || dataEntrada > dataSaida) { setSugestao(null); return; }
        let vivo = true;
        // As horas lançadas só valem para o trecho original; datas mudadas, sem conferência.
        const horas = inicial && dataEntrada === inicial.dataEntrada && dataSaida === inicial.dataSaida ? inicial.horas : null;
        apiClient.getLeiturasSugeridas(vehicle.id, { de: dataEntrada, ate: dataSaida, tipo: readingType, horas })
            .then(r => { if (vivo) setSugestao(r); })
            // Busca falhou: com horas lançadas, mesma regra do backend sem leitura (0 → horas).
            .catch(() => {
                if (!vivo) return;
                setSugestao(horas ? {
                    partida: { valor: 0, dia: dataEntrada, origem: 'Sem leitura registrada — início em 0', estimada: true },
                    volta: { valor: horas, dia: dataSaida, origem: `0 + ${String(horas).replace('.', ',')}h lançadas`, estimada: true },
                    proxima: null,
                } : null);
            });
        return () => { vivo = false; };
    }, [apiClient, vehicle.id, dataEntrada, dataSaida, readingType, inicial?.dataEntrada, inicial?.dataSaida, inicial?.horas]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (sugestao?.partida && !editouLeitura.partida) setLeituraPartida(String(sugestao.partida.valor));
        if (sugestao?.volta && !editouLeitura.volta) setLeituraVolta(String(sugestao.volta.valor));
    }, [sugestao]); // eslint-disable-line react-hooks/exhaustive-deps

    const fmtLeitura = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    const fmtDia = (ymd) => (ymd ? ymd.split('-').reverse().slice(0, 2).join('/') : '');
    const OrigemSugestao = ({ s, valorAtual }) => {
        if (!s) return null;
        const usado = String(s.valor) === String(valorAtual);
        return (
            <p className={`text-[11px] mt-1 ${usado ? 'text-gray-500' : 'text-amber-700'}`}>
                {usado ? 'Sugerido: ' : `Sugestão: ${fmtLeitura(s.valor)} · `}
                {s.origem}{s.estimada ? ' (estimado)' : ` em ${fmtDia(s.dia)}`}
            </p>
        );
    };

    const fmtDate = (d) => {
        if (!d) return 'em aberto';
        try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return String(d); }
    };

    const enviar = async (substituirConflitos) => {
        const partida = parseFloat(leituraPartida);
        const volta = parseFloat(leituraVolta);
        setIsSaving(true);
        try {
            await apiClient.registrarEstadiaRetroativa(vehicle.id, {
                obraId,
                employeeId,
                dataEntrada,
                dataSaida,
                readingType,
                leituraPartida: partida,
                leituraVolta: volta,
                observacoes: observacoes || '',
                substituirConflitos,
            });
            setAlertMessage('Estadia retroativa registrada com sucesso!');
            reloadData();
            onClose();
        } catch (error) {
            // 409 = sobreposição detectada; mostra os conflitos para confirmação.
            if (error.status === 409 && Array.isArray(error.data?.conflicts)) {
                setConflitos(error.data.conflicts);
            } else {
                const data = error.response?.data || {};
                const msg = [data.error || error.message, data.details].filter(Boolean).join(' — ');
                setAlertMessage('Erro ao registrar estadia retroativa: ' + msg);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!obraId || !employeeId || !dataEntrada || !dataSaida || leituraPartida === '' || leituraVolta === '') {
            setAlertMessage('Preencha obra, operador, datas e as duas leituras.');
            return;
        }
        const partida = parseFloat(leituraPartida);
        const volta = parseFloat(leituraVolta);
        if (isNaN(partida) || isNaN(volta)) {
            setAlertMessage('Leituras inválidas.');
            return;
        }
        if (dataEntrada > dataSaida) {
            setAlertMessage('A data de entrada na obra não pode ser depois da data de saída.');
            return;
        }
        if (volta < partida) {
            setAlertMessage(`A ${readingLabel.toLowerCase()} de volta não pode ser menor que a de partida.`);
            return;
        }
        enviar(false); // primeira tentativa: sem substituir — backend valida sobreposição
    };

    return (
        <div className="mak-modal-backdrop backdrop-blur-sm">
            <div className="mak-modal max-w-lg">
                {/* Cabeçalho */}
                <div className="p-4 flex justify-between items-start bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-t-xl">
                    <div>
                        <h2 className="text-base font-bold flex items-center gap-2">
                            <History size={17} /> Registrar Estadia Retroativa
                        </h2>
                        <p className="text-xs opacity-90 mt-0.5">
                            {vehicle.registroInterno} · {vehicle.placa} — {isAllocated
                                ? 'mantém a obra atual, insere uma passagem passada por outra obra.'
                                : 'registra uma passagem passada por uma obra, sem alterar o estado atual.'}
                        </p>
                    </div>
                    <button onClick={onClose} disabled={isSaving} className="p-1.5 rounded-full hover:bg-white hover:bg-opacity-20 transition">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
                    {conflitos ? (
                    /* ── CONFIRMAÇÃO DE SOBREPOSIÇÃO ── */
                    <div className="space-y-4">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-3">
                            <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={18} />
                            <div className="text-sm text-red-800">
                                <p className="font-bold text-xs uppercase mb-1">Período sobreposto</p>
                                <p className="text-xs">
                                    A máquina já tem registro em obra dentro do período informado
                                    ({fmtDate(dataEntrada)} – {fmtDate(dataSaida)}). Confirmar irá <strong>substituir apenas os dias em conflito</strong> pela nova estadia, preservando o restante de cada período.
                                </p>
                            </div>
                        </div>

                        <div className="border border-gray-200 rounded-lg divide-y">
                            {conflitos.map((c, i) => (
                                <div key={i} className="p-3 text-sm flex items-center gap-2">
                                    <Building2 size={14} className="text-gray-400 shrink-0" />
                                    <div>
                                        <p className="font-semibold text-gray-800">{c.obraNome}{c.aberto && <span className="ml-2 text-[10px] uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">obra atual</span>}</p>
                                        <p className="text-xs text-gray-500">{fmtDate(c.dataEntrada)} – {fmtDate(c.dataSaida)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setConflitos(null)}
                                disabled={isSaving}
                                className="flex-1 py-2.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold rounded-lg text-sm transition"
                            >
                                Voltar e revisar
                            </button>
                            <button
                                type="button"
                                onClick={() => enviar(true)}
                                disabled={isSaving}
                                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-bold rounded-lg text-sm flex items-center justify-center gap-2 transition"
                            >
                                {isSaving ? <Loader className="animate-spin" size={16} /> : 'Substituir e registrar'}
                            </button>
                        </div>
                    </div>
                    ) : (
                    <>
                    {/* Fluxo explicativo */}
                    {inicial ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                            Obra, datas e operador vêm dos lançamentos feitos sem alocação — confira e informe as leituras.
                        </div>
                    ) : isAllocated ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-center gap-2 flex-wrap">
                            <span className="font-semibold flex items-center gap-1">
                                <Building2 size={12} /> {formatObraNome(currentObra) || 'Obra atual'}
                            </span>
                            <ArrowRight size={12} />
                            <span>Estadia em outra obra</span>
                            <ArrowRight size={12} />
                            <span className="font-semibold flex items-center gap-1">
                                <Building2 size={12} /> {formatObraNome(currentObra) || 'Obra atual'} (retorna)
                            </span>
                        </div>
                    ) : (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                            Veículo atualmente <strong>disponível</strong> — o lançamento apenas registra a passagem passada pela obra, sem alocá-lo agora.
                        </div>
                    )}

                    {/* Obra da estadia */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                            <Building2 size={12} /> Obra da estadia <span className="text-red-500">*</span>
                        </label>
                        <SearchableSelect
                            items={obraOptions}
                            value={obraId}
                            onChange={(item) => setObraId(item?.id || '')}
                            getLabel={(o) => o._displayNome || o.nome}
                            placeholder="Selecione a obra visitada..."
                        />
                    </div>

                    {/* Operador da estadia */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                            <User size={12} /> Operador na estadia <span className="text-red-500">*</span>
                        </label>
                        <SearchableSelect
                            items={employeeOptions}
                            value={employeeId}
                            onChange={(item) => setEmployeeId(item?.id || '')}
                            getLabel={(e) => e.funcao ? `${e.nome} · ${e.funcao}` : e.nome}
                            placeholder="Selecione o operador..."
                        />
                    </div>

                    {/* Datas */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                                <Calendar size={12} /> Entrada na obra <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={dataEntrada}
                                max={dataSaida || undefined}
                                onChange={e => setDataEntrada(e.target.value)}
                                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                                <Calendar size={12} /> Saída da obra <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={dataSaida}
                                min={dataEntrada || undefined}
                                onChange={e => setDataSaida(e.target.value)}
                                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
                            />
                        </div>
                    </div>

                    {/* Leituras */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                                <Gauge size={12} /> {readingLabel} na partida <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="number"
                                step="any"
                                value={leituraPartida}
                                onChange={e => { setLeituraPartida(e.target.value); setEditouLeitura(x => ({ ...x, partida: true })); }}
                                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
                                placeholder="Ao sair p/ a obra"
                            />
                            <OrigemSugestao s={sugestao?.partida} valorAtual={leituraPartida} />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                                <Gauge size={12} /> {readingLabel} na volta <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="number"
                                step="any"
                                value={leituraVolta}
                                onChange={e => { setLeituraVolta(e.target.value); setEditouLeitura(x => ({ ...x, volta: true })); }}
                                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
                                placeholder="Ao retornar"
                            />
                            <OrigemSugestao s={sugestao?.volta} valorAtual={leituraVolta} />
                        </div>
                    </div>
                    {sugestao?.proxima && (
                        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 -mt-2">
                            Leitura registrada depois do trecho: <strong>{fmtLeitura(sugestao.proxima.valor)}</strong> em {fmtDia(sugestao.proxima.dia)} ({sugestao.proxima.origem}).
                            {' '}Não fecha com as horas lançadas, por isso a volta foi estimada — confira qual está certa.
                        </p>
                    )}
                    <p className="text-[11px] text-gray-400 -mt-2">
                        {isAllocated
                            ? 'A leitura de partida encerra a obra atual e abre a estadia; a de volta encerra a estadia e reabre a obra atual.'
                            : 'Leitura de entrada e saída da máquina durante a passagem pela obra.'}
                    </p>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Observações</label>
                        <textarea
                            rows="2"
                            value={observacoes}
                            onChange={e => setObservacoes(e.target.value)}
                            className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none resize-none"
                            placeholder="Observações sobre a estadia..."
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSaving}
                        className="w-full py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-bold rounded-lg shadow text-sm flex items-center justify-center gap-2 transition"
                    >
                        {isSaving ? <Loader className="animate-spin" size={16} /> : 'Registrar Estadia Retroativa'}
                    </button>
                    </>
                    )}
                </form>
            </div>
        </div>
    );
};

export default EstadiaRetroativaModal;
