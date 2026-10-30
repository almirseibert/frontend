import React, { useMemo, useState } from 'react';
import { X, FileSpreadsheet, AlertTriangle, RefreshCw, Loader, Link2 } from 'lucide-react';
import { fmtBRL } from '../../utils/currency';

// Obras novas na planilha oficial (aba SEAPI) aguardando aprovação.
// "Revisar e criar" abre o ObraModal já preenchido; salvar lá cria a obra e
// tira a linha daqui. "Vincular" é para quando a obra já existe no sistema
// (aditivo, nome diferente); "Ignorar" descarta a linha.
const SITUACAO_LABEL = {
    trabalhando: 'Trabalhando',
    prestacao_contas: 'Prestação de contas',
    finalizado: 'Finalizada na planilha',
    sem_ordem_inicio: 'Sem ordem de início',
};

const fmtNum = (n) => Number(n || 0).toLocaleString('pt-BR');
const diaBR = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null);
const horaBR = (d) => (d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null);

const LinhaPlanilha = ({ item, obrasSeapi, onRevisar, onIgnorar, onVincular }) => {
    const [vinculando, setVinculando] = useState(false);
    const [obraId, setObraId] = useState(item.candidatas?.[0]?.id || '');
    const [confirmaIgnorar, setConfirmaIgnorar] = useState(false);
    const [ocupado, setOcupado] = useState(false);

    // Candidatas (mesmo nome) primeiro, depois as demais obras SEAPI.
    const opcoes = useMemo(() => {
        const ids = new Set((item.candidatas || []).map(c => c.id));
        return [...(item.candidatas || []), ...obrasSeapi.filter(o => !ids.has(o.id))];
    }, [item.candidatas, obrasSeapi]);

    const executar = async (fn) => {
        setOcupado(true);
        try { await fn(); } finally { setOcupado(false); }
    };

    const plano = item.plano;
    const horas = Object.entries(plano?.horasContratadasPorSubTipo || {});

    return (
        <div className="p-4 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">{item.nome}</p>
                    <p className="text-xs text-gray-500">
                        Contrato {item.contrato || '—'}
                        {item.fiscal && <> · Fiscal {item.fiscal}</>}
                        {item.situacao && <> · {SITUACAO_LABEL[item.situacao] || item.situacao}</>}
                        {item.data_inicio_prevista && <> · Início {diaBR(item.data_inicio_prevista)}</>}
                    </p>
                </div>
                <p className="text-sm font-bold text-gray-900 tabular-nums">{fmtBRL(item.valor)}</p>
            </div>

            {plano ? (
                <div className="flex flex-wrap gap-1.5">
                    {horas.map(([sub, h]) => (
                        <span key={sub} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {sub} <strong className="tabular-nums">{fmtNum(h)} h</strong>
                        </span>
                    ))}
                    {plano.kmContratadoPrancha > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            Prancha <strong className="tabular-nums">{fmtNum(plano.kmContratadoPrancha)} km</strong>
                        </span>
                    )}
                    {item.aba && <span className="text-xs text-gray-400 self-center">aba "{item.aba}"</span>}
                </div>
            ) : (
                <p className="text-xs text-gray-400 italic">Plano de trabalho ainda não lido.</p>
            )}

            {item.alertas.length > 0 && (
                <ul className="space-y-1">
                    {item.alertas.map((a, i) => (
                        <li key={i} className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 flex gap-2">
                            <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
                            <span>{a.msg}</span>
                        </li>
                    ))}
                </ul>
            )}

            {vinculando ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <select
                        value={obraId}
                        onChange={e => setObraId(e.target.value)}
                        className="flex-1 min-w-[12rem] text-sm border rounded-lg px-2 py-1.5"
                    >
                        <option value="">Escolha a obra que já existe…</option>
                        {opcoes.map(o => (
                            <option key={o.id} value={o.id}>{o.nome} — {fmtBRL(o.valorTotalContrato)}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        disabled={!obraId || ocupado}
                        onClick={() => executar(() => onVincular(item.id, obraId))}
                        className="px-3 py-1.5 text-sm font-semibold rounded-lg mak-btn mak-btn-primary disabled:opacity-50"
                    >
                        Vincular
                    </button>
                    <button type="button" onClick={() => setVinculando(false)} className="px-3 py-1.5 text-sm rounded-lg mak-btn mak-btn-cancel">
                        Cancelar
                    </button>
                </div>
            ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                    <button
                        type="button"
                        onClick={() => onRevisar(item)}
                        className="px-3 py-1.5 text-sm font-bold rounded-lg mak-btn mak-btn-primary"
                    >
                        Revisar e criar
                    </button>
                    <button
                        type="button"
                        onClick={() => setVinculando(true)}
                        className="px-3 py-1.5 text-sm font-semibold rounded-lg mak-btn mak-btn-cancel flex items-center gap-1.5"
                    >
                        <Link2 size={14} /> Já existe — vincular
                    </button>
                    <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => (confirmaIgnorar ? executar(() => onIgnorar(item.id)) : setConfirmaIgnorar(true))}
                        onBlur={() => setConfirmaIgnorar(false)}
                        className={`px-3 py-1.5 text-sm rounded-lg ${confirmaIgnorar ? 'bg-red-600 text-white font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        {confirmaIgnorar ? 'Confirmar ignorar' : 'Ignorar'}
                    </button>
                </div>
            )}
        </div>
    );
};

const PlanilhaObrasModal = ({ dados, obras, onClose, onRevisar, onIgnorar, onVincular, onSincronizar }) => {
    const [sincronizando, setSincronizando] = useState(false);
    const pendentes = dados?.pendentes || [];

    const obrasSeapi = useMemo(
        () => obras.filter(o => o.orgao_contratante === 'SEAPI').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        [obras]
    );

    const sincronizar = async () => {
        setSincronizando(true);
        try { await onSincronizar(); } finally { setSincronizando(false); }
    };

    return (
        <div className="mak-modal-backdrop backdrop-blur-sm">
            <div className="mak-modal max-w-3xl">
                <div className="p-4 border-b flex justify-between items-start gap-3">
                    <div>
                        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                            <FileSpreadsheet size={16} className="text-green-700" /> Obras novas na planilha
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {dados?.configurado
                                ? <>Leitura automática a cada 15 min{dados.ultimaExecucao && <> · última às {horaBR(dados.ultimaExecucao)}</>}.</>
                                : 'Leitura automática desligada neste servidor.'}
                            {dados?.ultimoErro && <span className="text-red-600"> Erro na última leitura: {dados.ultimoErro}</span>}
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
                        {dados?.configurado && (
                            <button
                                type="button"
                                onClick={sincronizar}
                                disabled={sincronizando}
                                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg mak-btn mak-btn-cancel flex items-center gap-1.5"
                            >
                                {sincronizando ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />} Verificar agora
                            </button>
                        )}
                        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={18} /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar divide-y">
                    {pendentes.length === 0 ? (
                        <p className="p-6 text-center text-sm text-gray-400 italic">Nenhuma obra nova aguardando aprovação.</p>
                    ) : pendentes.map(item => (
                        <LinhaPlanilha
                            key={item.id}
                            item={item}
                            obrasSeapi={obrasSeapi}
                            onRevisar={onRevisar}
                            onIgnorar={onIgnorar}
                            onVincular={onVincular}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PlanilhaObrasModal;
