// src/pages/EvidenciasCapturaScreen.js
// -----------------------------------------------------------------------------
// Tela de captura do operador — Evidências de Campo, Fase 3 (§10.1) + Fase 10.
// Mobile-first, offline-first: o escopo vem do IndexedDB (não do DataContext),
// a foto é comprimida e ENFILEIRADA (nunca enviada direto), o GPS é obrigatório
// e o nome do lugar é resolvido offline por point-in-polygon (§5.4).
//
// Fase 10 — três níveis: equipamento → faixa de dias → cards do dia.
//   · dia corrente: só CÂMERA, GPS obrigatório, carimbo completo;
//   · dia passado (até retroativo_max_dias): só GALERIA, sem GPS, carimbo
//     reduzido, e o horímetro informado NÃO altera a leitura do equipamento;
//   · sábado/domingo/feriado não são cobrados, mas continuam preenchíveis;
//   · rotinas semanais (filtro/graxa) entram como card de contorno pulsante.
// -----------------------------------------------------------------------------
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    Loader, MapPin, ChevronLeft, Ban, CheckCircle, Clock, AlertTriangle, Gauge,
    User, ImagePlus, MessageSquareWarning, History, Droplet, Filter, ClipboardList,
} from 'lucide-react';
import PhotoCapture from '../components/PhotoCapture';
import { enfileirar, assinarFila, assinarEnviados } from '../services/evidenciaQueue';
import { escopoSet, escopoGet } from '../services/evidenciaDb';
import { cidadeDoPonto } from '../utils/geo';
import { getAllowedReadingTypes } from '../utils/vehicleRules';

const MOMENTO_META = {
    horimetro_inicio: { label: 'Horímetro — início', leitura: true },
    foto_manha: { label: 'Trabalhando — manhã', leitura: false },
    foto_tarde: { label: 'Trabalhando — tarde', leitura: false },
    horimetro_fim: { label: 'Horímetro — fim', leitura: true },
};
const ROTINA_META = {
    rotina_filtro: { label: 'Limpeza de filtro', Icon: Filter },
    rotina_graxa: { label: 'Engraxamento', Icon: Droplet },
};
// Planilha de trabalho: 2x/semana (sexta + terça/quarta conforme o fim de semana),
// no fim do expediente. Vem do meu-escopo como escopo.planilha[equip.id].
const PLANILHA_META = { label: 'Planilha de trabalho', Icon: ClipboardList };
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const brDia = (ymd) => (ymd ? ymd.slice(8, 10) : '');
const brMes = (ymd) => (ymd ? ymd.slice(5, 7) : '');
const brCompleto = (ymd) => (ymd ? ymd.split('-').reverse().join('/') : '');

let _geojson = null;
async function carregarGeo() {
    if (_geojson) return _geojson;
    try { const r = await fetch('/data/rs-municipios.geojson'); _geojson = await r.json(); } catch { _geojson = null; }
    return _geojson;
}

const EvidenciasCapturaScreen = ({ apiClient, user, socket, setAlertMessage }) => {
    const [carregando, setCarregando] = useState(true);
    const [degradado, setDegradado] = useState(false);
    const [escopo, setEscopo] = useState({ data: '', obras: [], equipamentos: [], hojeEnviado: {}, hojeContagem: {}, rotinas: {}, planilha: {} });
    const [veiculoSel, setVeiculoSel] = useState(null);
    const [historico, setHistorico] = useState(null);
    const [dataSel, setDataSel] = useState(null);
    const [filaMap, setFilaMap] = useState({}); // `${veiculo}|${data}|${tipo}` -> {status, n}
    const [enviadosLocal, setEnviadosLocal] = useState({}); // mesma chave -> n
    const [sheet, setSheet] = useState(null);
    const [dispensaSheet, setDispensaSheet] = useState(false);
    const [divergSheet, setDivergSheet] = useState(false);

    // ---- Carrega escopo (rede → IndexedDB) ----
    const carregar = useCallback(async () => {
        try {
            const data = await apiClient.getEvidenciaEscopo();
            await escopoSet(data);
            setEscopo(data); setDegradado(false);
        } catch {
            const cache = await escopoGet();
            if (cache?.data) { setEscopo(cache.data); setDegradado(true); }
        } finally {
            setCarregando(false);
        }
    }, [apiClient]);

    const carregarHistorico = useCallback(async (veiculoId) => {
        if (!veiculoId) return;
        try { setHistorico(await apiClient.getHistoricoEvidencias(veiculoId)); }
        catch { /* offline: segue só com o escopo de hoje */ }
    }, [apiClient]);

    useEffect(() => { carregar(); }, [carregar]);
    useEffect(() => { carregarHistorico(veiculoSel); }, [veiculoSel, carregarHistorico]);

    // ---- ESTRATÉGIA TRIPLA (espelha SolicitacaoAbastecimentoPage) -------------
    // (1) polling curto + Visibility API + online. Depende só de [user] de
    // propósito: se dependesse do socket, cada evento recriaria o setInterval em
    // todos os operadores ao mesmo tempo. Antes isto era um setInterval de 30
    // MINUTOS — e era por isso que o status parecia travado.
    const refRecarregar = useRef(() => {});
    refRecarregar.current = () => { carregar(); carregarHistorico(veiculoSel); };
    useEffect(() => {
        if (!user) return undefined;
        const tick = () => refRecarregar.current();
        const onVis = () => { if (document.visibilityState === 'visible') tick(); };
        window.addEventListener('online', tick);
        document.addEventListener('visibilitychange', onVis);
        const t = setInterval(tick, 60 * 1000);
        return () => {
            window.removeEventListener('online', tick);
            document.removeEventListener('visibilitychange', onVis);
            clearInterval(t);
        };
    }, [user]);

    // (2) socket, com coalescing e jitter para não sincronizar a frota.
    useEffect(() => {
        if (!socket) return undefined;
        let timer = null;
        const handleSync = (data) => {
            const targets = data?.targets;
            if (Array.isArray(targets) && !targets.includes('evidencias')) return;
            if (timer) return;
            timer = setTimeout(() => { timer = null; refRecarregar.current(); }, 500 + Math.random() * 2500);
        };
        socket.on('server:sync', handleSync);
        return () => { socket.off('server:sync', handleSync); if (timer) clearTimeout(timer); };
    }, [socket]);

    // (3) atualização otimista: o envio concluído marca "Enviado" na hora, sem
    // esperar o servidor. É o que impede o card de voltar para "Pendente".
    useEffect(() => {
        const off = assinarEnviados((ev) => {
            const chave = `${ev.veiculo_id}|${ev.data_ref}|${ev.tipo}`;
            setEnviadosLocal(m => ({ ...m, [chave]: (m[chave] || 0) + 1 }));
            refRecarregar.current();
        });
        return off;
    }, []);

    // ---- Fila pendente (para marcar cards como "na fila") ----
    useEffect(() => {
        const aplicar = ({ itens }) => {
            const m = {};
            (itens || []).forEach(i => {
                // A data entra na chave: sem isso uma foto enfileirada para ontem
                // marcava o card de hoje.
                const k = `${i.veiculo_id}|${i.data_ref}|${i.tipo}`;
                m[k] = { status: i.status, n: (m[k]?.n || 0) + 1 };
            });
            setFilaMap(m);
        };
        const off = assinarFila(aplicar);
        return off;
    }, []);

    // Auto-seleciona quando há só um equipamento (caso comum).
    useEffect(() => {
        if (!veiculoSel && escopo.equipamentos?.length === 1) setVeiculoSel(escopo.equipamentos[0].id);
    }, [escopo.equipamentos, veiculoSel]);

    const equip = escopo.equipamentos?.find(e => e.id === veiculoSel) || null;
    const obra = escopo.obras?.find(o => o.id === equip?.obra_id) || null;

    const hoje = escopo.data;
    // Para equipamento que saiu da obra, hoje NÃO está na faixa — o último dia
    // disponível é a data de saída. Sem este fallback a tela abriria num dia que
    // não existe na lista e nenhum card apareceria.
    const dataAtiva = dataSel || historico?.ultimo_dia || hoje;
    const diaAtivo = useMemo(
        () => (historico ? historico.dias.find(d => d.data === dataAtiva) || null : null),
        [historico, dataAtiva]
    );
    const retro = !!dataAtiva && !!hoje && dataAtiva < hoje;

    const contar = useCallback((tipo) => {
        if (!equip) return { enviados: 0, fila: 0, recusado: false };
        const chave = `${equip.id}|${dataAtiva}|${tipo}`;
        const doServidor = diaAtivo?.contagem?.[tipo]
            || (dataAtiva === hoje ? (escopo.hojeContagem?.[equip.id]?.[tipo] || 0) : 0);
        const local = enviadosLocal[chave] || 0;
        const naFila = filaMap[chave];
        return {
            // O otimista só conta enquanto o servidor ainda não confirmou.
            enviados: Math.max(doServidor, local),
            fila: naFila && naFila.status !== 'recusado' ? naFila.n : 0,
            recusado: naFila?.status === 'recusado',
        };
    }, [equip, dataAtiva, diaAtivo, hoje, escopo.hojeContagem, enviadosLocal, filaMap]);

    const statusMomento = useCallback((tipo) => {
        const c = contar(tipo);
        if (c.enviados > 0) return 'enviado';
        if (c.recusado) return 'recusado';
        if (c.fila > 0) return 'fila';
        return 'pendente';
    }, [contar]);

    if (carregando) {
        return <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f3ef' }}><Loader className="animate-spin" style={{ color: '#9E7A42' }} /></div>;
    }

    // ===== Seleção de equipamento =====
    if (!equip) {
        return (
            <div className="min-h-screen pb-24 px-4 pt-4" style={{ background: '#f5f3ef' }}>
                <h1 className="text-xl font-bold text-slate-800 mb-1">Evidências</h1>
                <p className="text-sm text-slate-500 mb-4">Selecione o equipamento{escopo.data ? ` · ${brCompleto(escopo.data)}` : ''}</p>
                {degradado && <BannerCache />}
                {(!escopo.equipamentos || escopo.equipamentos.length === 0) && (
                    <div className="bg-white rounded-xl p-6 text-center text-slate-500 shadow-sm">Nenhum equipamento no seu escopo hoje.</div>
                )}
                {(() => {
                    const renderCard = (e) => {
                        // Conta SÓ os 4 momentos do dia: extras e rotinas deixariam o
                        // chip verde com 4 fotos avulsas e nenhum momento cumprido.
                        const cont = escopo.hojeContagem?.[e.id] || {};
                        const enviados = Object.keys(MOMENTO_META).filter(m => cont[m]).length;
                        const abertas = (escopo.rotinas?.[e.id] || []).length;
                        const obraDoEquip = escopo.obras?.find(o => o.id === e.obra_id);
                        return (
                            <button key={e.id} onClick={() => { setVeiculoSel(e.id); setDataSel(null); }}
                                className="w-full bg-white rounded-xl p-4 flex items-center justify-between shadow-sm active:scale-[0.99] transition">
                                <div className="text-left min-w-0">
                                    <div className="font-bold text-slate-800">{e.registroInterno || e.placa || e.modelo}</div>
                                    <div className="text-xs text-slate-500 truncate">{[e.modelo, e.obra_nome].filter(Boolean).join(' · ')}</div>
                                    <div className="text-xs mt-1 flex items-center gap-1" style={{ color: e.operador_nome ? '#6a5e4e' : '#b91c1c' }}>
                                        <User size={12} />
                                        {e.operador_nome || 'Sem operador alocado'}
                                    </div>
                                    {e.saiuDaObra && (
                                        <div className="text-[11px] font-bold mt-0.5" style={{ color: '#b45309' }}>
                                            Saiu da obra{e.saiuEm ? ` em ${e.saiuEm.split('-').reverse().join('/')}` : ''} · inclusão retroativa
                                        </div>
                                    )}
                                    {!e.saiuDaObra && obraDoEquip && obraDoEquip.solicitado_hoje === false && (
                                        <div className="text-[11px] text-slate-400 mt-0.5">hoje não é dia de solicitação</div>
                                    )}
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: enviados >= 4 ? '#dcfce7' : '#fef9c3', color: enviados >= 4 ? '#15803d' : '#854d0e' }}>
                                        {enviados}/4
                                    </span>
                                    {abertas > 0 && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#f5ead8', color: '#7a5c2c' }}>
                                            +{abertas} rotina{abertas > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    };
                    const ativos = (escopo.equipamentos || []).filter(e => !e.saiuDaObra);
                    const saiu = (escopo.equipamentos || []).filter(e => e.saiuDaObra);
                    return (
                        <>
                            <div className="space-y-2">{ativos.map(renderCard)}</div>
                            {saiu.length > 0 && (
                                <div className="mt-5">
                                    <p className="text-xs font-bold uppercase text-slate-400 mb-2">Saíram da obra (inclusão retroativa)</p>
                                    <div className="space-y-2">{saiu.map(renderCard)}</div>
                                </div>
                            )}
                        </>
                    );
                })()}

                <button onClick={() => setDivergSheet(true)}
                    className="w-full mt-4 py-3 px-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 text-left active:bg-slate-100">
                    <span className="font-bold flex items-center gap-2 text-slate-600">
                        <MessageSquareWarning size={18} /> Algo errado nesta lista?
                    </span>
                    <span className="block text-[11px] mt-1 leading-snug">
                        Equipamento que está na sua obra e não aparece aqui, equipamento que já saiu
                        e continua na lista, ou operador errado — nos comunique agora por aqui.
                    </span>
                </button>

                {divergSheet && (
                    <DivergenciaSheet
                        apiClient={apiClient} escopo={escopo}
                        onClose={() => setDivergSheet(false)} setAlertMessage={setAlertMessage}
                    />
                )}
            </div>
        );
    }

    const momentosDoDia = diaAtivo?.momentos?.length ? diaAtivo.momentos : Object.keys(MOMENTO_META);
    // No dia corrente vale a lista do meu-escopo, que é a única que inclui as
    // rotinas ARRASTADAS de dias anteriores — o histórico só lista a rotina no dia
    // em que ela foi agendada. (Não usar `diaAtivo.rotinas || escopo.rotinas`: um
    // array vazio é truthy e engoliria o arrasto.)
    const rotinasAbertas = retro
        ? []
        : (escopo.rotinas?.[equip.id] || []).filter(r => r.status === 'PENDENTE');
    const extras = contar('extra').enviados + contar('extra').fila;
    const naoSolicitado = diaAtivo ? !diaAtivo.solicitado : false;
    const podeRetro = !retro || diaAtivo?.retroativo_permitido;

    // ===== Cards do dia =====
    return (
        <div className="min-h-screen pb-24 px-4 pt-4" style={{ background: '#f5f3ef' }}>
            <button onClick={() => { setVeiculoSel(null); setDataSel(null); setHistorico(null); }} className="flex items-center gap-1 text-sm text-slate-500 mb-2">
                <ChevronLeft size={16} /> Trocar equipamento
            </button>
            <h1 className="text-xl font-bold text-slate-800">{equip.registroInterno || equip.placa}</h1>
            <p className="text-sm text-slate-500">{[equip.modelo, obra?.nome].filter(Boolean).join(' · ')}</p>
            <p className="text-xs mb-1 flex items-center gap-1" style={{ color: equip.operador_nome ? '#6a5e4e' : '#b91c1c' }}>
                <User size={12} /> {equip.operador_nome || 'Sem operador alocado'}
            </p>
            {equip.saiuDaObra && (
                <div className="mb-2 text-[12px] font-semibold rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: '#fef3c7', color: '#92400e' }}>
                    <AlertTriangle size={14} /> Equipamento saiu da obra{equip.saiuEm ? ` em ${equip.saiuEm.split('-').reverse().join('/')}` : ''}. Registro retroativo desse dia.
                </div>
            )}
            {degradado && <BannerCache />}

            {historico && (
                <FaixaDias historico={historico} dataAtiva={dataAtiva} hoje={hoje}
                    onEscolher={(d) => setDataSel(d)} />
            )}

            {retro && (
                <div className="mt-3 mb-1 rounded-xl px-3 py-2 text-[12px] font-semibold flex items-start gap-2"
                    style={{ background: '#f5ead8', color: '#6a4e24', border: '1px solid #d4b47a' }}>
                    <History size={15} className="mt-0.5 shrink-0" />
                    <span>
                        Anexando foto do dia <b>{brCompleto(dataAtiva)}</b>. A imagem vai <b>sem localização</b>,
                        marcada como anexada posteriormente, e só pode vir do seu arquivo.
                    </span>
                </div>
            )}
            {!retro && naoSolicitado && (
                <div className="mt-3 mb-1 rounded-xl px-3 py-2 text-[12px] font-semibold"
                    style={{ background: '#f5f2ed', color: '#6a5e4e', border: '1px solid #e8e0d4' }}>
                    {diaAtivo?.feriado ? 'Feriado' : 'Fim de semana'} — não é dia de solicitação.
                    Se o equipamento trabalhou, pode enviar normalmente.
                </div>
            )}
            {diaAtivo?.dispensado && (
                <div className="mt-3 mb-1 rounded-xl px-3 py-2 text-[12px] font-semibold"
                    style={{ background: '#f5f2ed', color: '#6a5e4e', border: '1px dashed #d4c8b8' }}>
                    Dia dispensado{diaAtivo.dispensa?.motivo_codigo ? ` (${diaAtivo.dispensa.motivo_codigo})` : ''}.
                </div>
            )}
            {retro && !podeRetro && (
                <div className="mt-3 mb-1 rounded-xl px-3 py-2 text-[12px] font-semibold"
                    style={{ background: '#fee2e2', color: '#b91c1c' }}>
                    Este dia está fora do prazo para anexo retroativo.
                </div>
            )}

            <div className="grid grid-cols-1 gap-3 mt-3">
                {momentosDoDia.map(tipo => (
                    <CardMomento key={tipo}
                        label={MOMENTO_META[tipo]?.label || tipo}
                        sub={MOMENTO_META[tipo]?.leitura ? 'Leitura + foto' : 'Só foto'}
                        leitura={!!MOMENTO_META[tipo]?.leitura}
                        status={statusMomento(tipo)}
                        atenuado={naoSolicitado}
                        desabilitado={retro && !podeRetro}
                        onClick={() => setSheet({ tipo, label: MOMENTO_META[tipo]?.label || tipo, leitura: !!MOMENTO_META[tipo]?.leitura })}
                    />
                ))}

                {rotinasAbertas.map(r => (
                    <CardMomento key={r.tipo}
                        label={ROTINA_META[r.tipo]?.label || r.tipo}
                        sub={r.data_prevista && r.data_prevista.slice(0, 10) < dataAtiva
                            ? `Solicitada em ${brCompleto(r.data_prevista.slice(0, 10))} — ainda pendente`
                            : 'Solicitada hoje — rotina de manutenção'}
                        Icon={ROTINA_META[r.tipo]?.Icon}
                        status={statusMomento(r.tipo)}
                        pulsa
                        onClick={() => setSheet({ tipo: r.tipo, label: ROTINA_META[r.tipo]?.label || r.tipo, leitura: false })}
                    />
                ))}

                {/* Planilha de trabalho (2x/semana, fim do expediente). Só aparece
                    nos dias em que é solicitada (o backend decide sexta + ter/qua). */}
                {!retro && escopo.planilha?.[equip.id] && (
                    <CardMomento
                        label={PLANILHA_META.label}
                        sub={escopo.planilha[equip.id].pendente
                            ? 'Solicitada hoje — foto da planilha (fim do expediente)'
                            : 'Planilha já enviada hoje'}
                        Icon={PLANILHA_META.Icon}
                        status={statusMomento('planilha_trabalho')}
                        pulsa={escopo.planilha[equip.id].pendente}
                        onClick={() => setSheet({ tipo: 'planilha_trabalho', label: PLANILHA_META.label, leitura: false, exigeObs: false })}
                    />
                )}
            </div>

            <button onClick={() => setSheet({ tipo: 'extra', label: 'Imagem extra', leitura: false, exigeObs: true })}
                disabled={retro && !podeRetro}
                className="w-full mt-3 py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 font-bold flex items-center justify-center gap-2 active:bg-slate-100 disabled:opacity-40">
                <ImagePlus size={18} /> Adicionar imagem extra{extras > 0 ? ` (${extras})` : ''}
            </button>

            {/* Dispensa vale para qualquer dia da faixa, não só hoje: se ninguém
                informou a chuva no dia, o operador precisa poder regularizar depois
                — senão o dia fica cobrado para sempre. */}
            {podeRetro && (
                <button onClick={() => setDispensaSheet(true)}
                    className="w-full mt-2 py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 font-bold flex items-center justify-center gap-2 active:bg-slate-100">
                    <Ban size={18} /> {retro ? `Dispensar ${brCompleto(dataAtiva)} (chuva, parado…)` : 'Dispensar hoje (chuva, parado…)'}
                </button>
            )}

            {sheet && (
                <CaptureSheet
                    momento={sheet} equip={equip} obra={obra} user={user}
                    dataRef={dataAtiva} retro={retro} historico={historico}
                    onClose={() => setSheet(null)} setAlertMessage={setAlertMessage}
                />
            )}
            {dispensaSheet && (
                <DispensaSheet
                    apiClient={apiClient} equip={equip} obra={obra}
                    dataRef={dataAtiva} retro={retro}
                    onClose={() => setDispensaSheet(false)} setAlertMessage={setAlertMessage}
                />
            )}
        </div>
    );
};

const BannerCache = () => (
    <div className="mb-3 text-[12px] font-semibold rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: '#1c1a17', color: '#e9d9bf' }}>
        <AlertTriangle size={14} /> Sem conexão — mostrando o último escopo salvo.
    </div>
);

// ===== Faixa horizontal de dias =====
const FaixaDias = ({ historico, dataAtiva, hoje, onEscolher }) => (
    <div className="mt-3 -mx-4 px-4 overflow-x-auto">
        <div className="flex gap-2 pb-1" style={{ width: 'max-content' }}>
            {historico.dias.map(d => {
                const ativo = d.data === dataAtiva;
                const ehHoje = d.data === hoje;
                const bloqueado = !ehHoje && !d.retroativo_permitido;
                let fundo = '#ffffff', cor = '#6a5e4e', borda = '#e8e0d4';
                if (!d.solicitado) { fundo = '#f5f2ed'; cor = '#b0a090'; }
                else if (d.completo) { fundo = '#dcfce7'; cor = '#15803d'; }
                else if (d.cumpridas > 0) { fundo = '#fef9c3'; cor = '#854d0e'; }
                if (d.dispensado) { fundo = '#f5f2ed'; cor = '#9a8a78'; }
                if (ativo) { borda = '#9E7A42'; }
                return (
                    <button key={d.data} onClick={() => onEscolher(d.data)} disabled={bloqueado}
                        className="rounded-xl px-3 py-2 text-center shrink-0 disabled:opacity-40"
                        style={{ background: fundo, color: cor, border: `2px solid ${borda}`, minWidth: 58 }}>
                        <div className="text-[10px] font-semibold uppercase">{DOW[d.dow]}</div>
                        <div className="text-lg font-bold leading-none">{brDia(d.data)}</div>
                        <div className="text-[10px]">{brMes(d.data)}</div>
                        <div className="text-[10px] font-bold mt-0.5">
                            {ehHoje ? 'hoje' : (d.solicitado ? `${d.cumpridas}/${d.exigidas || 0}` : '—')}
                        </div>
                        {d.rotinas?.some(r => r.status === 'PENDENTE') && (
                            <div className="mx-auto mt-1 rounded-full" style={{ width: 6, height: 6, background: '#9E7A42' }} />
                        )}
                    </button>
                );
            })}
        </div>
    </div>
);

const EST = {
    enviado:  { txt: 'Enviado', cor: '#15803d', bg: '#dcfce7', Icon: CheckCircle },
    fila:     { txt: 'Na fila', cor: '#1d4ed8', bg: '#dbeafe', Icon: Clock },
    recusado: { txt: 'Recusado', cor: '#b91c1c', bg: '#fee2e2', Icon: AlertTriangle },
    pendente: { txt: 'Pendente', cor: '#854d0e', bg: '#fef9c3', Icon: Clock },
};
const CardMomento = ({ label, sub, leitura, Icon, status, onClick, pulsa, atenuado, desabilitado }) => {
    const e = atenuado && status === 'pendente'
        ? { txt: 'opcional', cor: '#9a8a78', bg: '#f5f2ed', Icon: Clock }
        : (EST[status] || EST.pendente);
    const bloqueado = desabilitado || status === 'enviado' || status === 'fila';
    return (
        <button onClick={bloqueado ? undefined : onClick} disabled={desabilitado}
            className={`w-full bg-white rounded-xl p-4 flex items-center justify-between shadow-sm text-left disabled:opacity-40 ${bloqueado ? 'opacity-90' : 'active:scale-[0.99]'} ${pulsa && status === 'pendente' ? 'rotina-pulse' : ''}`}>
            <div className="flex items-center gap-3 min-w-0">
                {Icon ? <Icon size={22} style={{ color: '#9E7A42' }} />
                    : leitura ? <Gauge size={22} className="text-slate-400" />
                    : <span className="text-slate-300 text-2xl leading-none">📷</span>}
                <div className="min-w-0">
                    <div className="font-bold text-slate-800">{label}</div>
                    <div className="text-xs text-slate-400">{sub}</div>
                </div>
            </div>
            <span className="text-xs font-bold px-2 py-1 rounded-full inline-flex items-center gap-1 shrink-0" style={{ background: e.bg, color: e.cor }}>
                <e.Icon size={12} /> {e.txt}
            </span>
        </button>
    );
};

// ===== Exigências da foto, por momento =====
// Aparecem NO momento da captura, não num treinamento que ninguém relê. É o que
// separa uma foto que comprova de uma que vai ser recusada depois — e o gestor
// só descobre o problema dias depois, quando a evidência já não pode ser refeita.
const EXIGENCIAS = {
    foto_manha: {
        titulo: 'A foto precisa mostrar',
        itens: [
            'A máquina INTEIRA, de fora',
            'A placa ou o RE do equipamento visível',
            'A máquina no local de trabalho',
        ],
        alerta: 'Foto de dentro da cabine, sem o equipamento aparecendo, não serve como comprovação.',
    },
    horimetro_inicio: {
        titulo: 'Qual horímetro fotografar',
        itens: [
            'Sempre o horímetro do PAINEL (digital)',
            'O analógico só serve se o equipamento não tiver painel digital',
        ],
        alerta: null,
    },
};
EXIGENCIAS.foto_tarde = EXIGENCIAS.foto_manha;
EXIGENCIAS.horimetro_fim = EXIGENCIAS.horimetro_inicio;

const ExigenciasFoto = ({ tipo }) => {
    const e = EXIGENCIAS[tipo];
    if (!e) return null;
    return (
        <div className="mt-3 rounded-xl px-3 py-2.5" style={{ background: '#f5f2ed', border: '1px solid #e8e0d4' }}>
            <p className="text-[11px] font-bold uppercase mb-1.5" style={{ color: '#6a5e4e' }}>{e.titulo}</p>
            <ul className="space-y-1">
                {e.itens.map(t => (
                    <li key={t} className="text-[12px] flex items-start gap-1.5" style={{ color: '#3d3528' }}>
                        <CheckCircle size={13} className="mt-0.5 shrink-0" style={{ color: '#3d5a44' }} />
                        <span>{t}</span>
                    </li>
                ))}
            </ul>
            {e.alerta && (
                <p className="text-[12px] mt-2 flex items-start gap-1.5 font-semibold" style={{ color: '#b03828' }}>
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span>{e.alerta}</span>
                </p>
            )}
        </div>
    );
};

// ===== Bottom-sheet de captura =====
const CaptureSheet = ({ momento, equip, obra, user, dataRef, retro, historico, onClose, setAlertMessage }) => {
    const [foto, setFoto] = useState(null);
    const [leitura, setLeitura] = useState('');
    const [observacao, setObservacao] = useState('');
    const [confirmouLeitura, setConfirmouLeitura] = useState(false);
    const [gps, setGps] = useState({ estado: retro ? 'dispensado' : 'buscando', lat: null, lng: null, prec: null, local: null });
    const [enviando, setEnviando] = useState(false);
    const readingType = getAllowedReadingTypes(equip.tipo)[0]; // 'horimetro'|'odometro'
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        // No anexo retroativo não há localização a capturar — a foto é de arquivo.
        if (retro) return () => { mountedRef.current = false; };
        if (!navigator.geolocation) { setGps(g => ({ ...g, estado: 'erro' })); return () => {}; }
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                if (!mountedRef.current) return;
                const { latitude, longitude, accuracy } = pos.coords;
                let local = null;
                // cidadeDoPonto devolve a FEATURE do GeoJSON, não o nome. Usar o
                // retorno direto imprimia "[object Object]" na tela e, pior,
                // gravava essa string em dev_local_texto — o campo que vai para o
                // carimbo e para o dossiê.
                try {
                    const geo = await carregarGeo();
                    const f = geo ? cidadeDoPonto(latitude, longitude, geo) : null;
                    local = typeof f === 'string' ? f : (f?.properties?.nome || null);
                } catch { /* */ }
                setGps({ estado: 'ok', lat: latitude, lng: longitude, prec: accuracy ? Math.round(accuracy) : null, local });
            },
            () => { if (mountedRef.current) setGps(g => ({ ...g, estado: 'erro' })); },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
        return () => { mountedRef.current = false; };
    }, [retro]);

    // Pré-validação da leitura retroativa. O servidor também valida, mas ali um
    // 400 chega DEPOIS de enfileirar e o item vira "recusado" na página da fila —
    // o operador precisa ver o aviso antes, aqui.
    const n = Number(leitura);
    const foraDaJanela = retro && leitura !== '' && historico
        && ((historico.leitura_min != null && n < historico.leitura_min)
            || (historico.leitura_max != null && n > historico.leitura_max));
    const leituraMenorQueAtual = retro && leitura !== '' && historico?.leitura_atual != null && n < historico.leitura_atual;

    const podeEnviar = foto
        && (retro || gps.estado === 'ok')
        && (!momento.leitura || (leitura !== '' && n > 0))
        && (!foraDaJanela || confirmouLeitura)
        && (!momento.exigeObs || observacao.trim().length > 0);

    const confirmar = async () => {
        if (!podeEnviar || enviando) return;
        setEnviando(true);
        try {
            await enfileirar({
                clientId: crypto.randomUUID(),
                blob: foto.blob,
                obra_id: equip.obra_id,
                veiculo_id: equip.id,
                tipo: momento.tipo,
                // Vem do dia escolhido na faixa. Para equipamento que saiu da obra a
                // faixa termina na data de saída, então isto já cobre aquele caso.
                data_ref: dataRef,
                turno: momento.tipo === 'foto_manha' ? 'manha' : momento.tipo === 'foto_tarde' ? 'tarde' : 'indefinido',
                // Retroativo vai sem nenhum dado de localização — o servidor
                // também força NULL, isto aqui é o par da regra no cliente.
                dev_latitude: retro ? null : gps.lat,
                dev_longitude: retro ? null : gps.lng,
                dev_precisao_m: retro ? null : gps.prec,
                dev_local_texto: retro ? null : (gps.local || null),
                dev_capturado_em: new Date().toISOString(),
                dev_operador_nome: user?.name || null,
                leitura: momento.leitura ? n : null,
                observacao: observacao.trim() || null,
                retroativo: retro ? 1 : 0,
                confirmar_fora_janela: foraDaJanela && confirmouLeitura ? 1 : 0,
                label: `${equip.registroInterno || equip.placa} · ${momento.label}`,
            });
            setAlertMessage?.({ type: 'success', message: 'Evidência salva e na fila de envio.' });
            onClose();
        } catch (e) {
            setAlertMessage?.({ type: 'error', message: 'Não foi possível salvar: ' + (e.message || '') });
            setEnviando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
            <div className="w-full bg-white rounded-t-2xl p-4 pb-6 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
                <h2 className="text-lg font-bold text-slate-800 mb-1">{momento.label}</h2>
                <p className="text-xs text-slate-400 mb-3">
                    {equip.registroInterno || equip.placa} · {obra?.nome || ''} · {brCompleto(dataRef)}
                </p>

                {retro && (
                    <div className="mb-3 rounded-lg px-3 py-2 text-[12px] font-semibold"
                        style={{ background: '#f5ead8', color: '#6a4e24' }}>
                        Anexo retroativo: sem localização e com carimbo reduzido.
                    </div>
                )}

                {momento.leitura && (
                    <div className="mb-3">
                        <label className="text-xs font-bold text-gray-600 uppercase">
                            {readingType === 'horimetro' ? 'Horímetro (h)' : 'Odômetro (km)'} <span className="text-red-500">*</span>
                        </label>
                        <input type="number" inputMode="decimal" value={leitura} onChange={e => { setLeitura(e.target.value); setConfirmouLeitura(false); }}
                            className="w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-3 text-lg font-bold focus:border-yellow-500 outline-none"
                            placeholder="0,0" />
                        {retro && leituraMenorQueAtual && !foraDaJanela && (
                            <p className="text-[11px] mt-1 font-semibold" style={{ color: '#6a4e24' }}>
                                Leitura anterior à atual do equipamento ({historico.leitura_atual}). Isso é esperado
                                num dia passado — a leitura atual do equipamento <b>não será alterada</b>.
                            </p>
                        )}
                        {foraDaJanela && (
                            <div className="mt-2 rounded-lg px-3 py-2" style={{ background: '#fef9c3', border: '1px solid #d4b47a' }}>
                                <p className="text-[12px] font-bold" style={{ color: '#6a4e24' }}>
                                    <AlertTriangle size={13} className="inline mr-1" />
                                    Valor fora do histórico deste equipamento
                                    {historico.leitura_min != null && historico.leitura_max != null
                                        ? ` (${historico.leitura_min} a ${historico.leitura_max})` : ''}.
                                </p>
                                <p className="text-[11px] mt-1" style={{ color: '#6a4e24' }}>
                                    A leitura atual do equipamento não será alterada de qualquer forma.
                                </p>
                                <button onClick={() => setConfirmouLeitura(true)}
                                    className={`mt-2 w-full py-2 rounded-lg text-sm font-bold border-2 ${confirmouLeitura ? 'bg-yellow-50 border-yellow-500 text-slate-800' : 'border-gray-300 text-slate-600'}`}>
                                    {confirmouLeitura ? 'Confirmado — pode salvar' : 'Confirmo que é uma leitura anterior'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <ExigenciasFoto tipo={momento.tipo} />

                <PhotoCapture
                    label="Foto"
                    fonte={retro ? 'galeria' : (historico?.permitir_galeria ? 'ambas' : 'camera')}
                    hint={retro ? 'Escolha a foto daquele dia no seu arquivo.' : undefined}
                    photo={foto}
                    onPick={(blob, preview, info) => setFoto({ blob, preview, original: info?.original })}
                    onClear={() => setFoto(null)}
                />

                {momento.exigeObs && (
                    <div className="mt-3">
                        <label className="text-xs font-bold text-gray-600 uppercase">Observação <span className="text-red-500">*</span></label>
                        <textarea value={observacao} maxLength={500} rows={3}
                            onChange={e => setObservacao(e.target.value)}
                            placeholder="O que esta foto mostra?"
                            className="w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-yellow-500" />
                        <p className="text-[11px] text-slate-400 text-right">{observacao.length}/500</p>
                    </div>
                )}

                {!retro && (
                    <div className="mt-3 text-sm flex items-center gap-2" style={{ color: gps.estado === 'ok' ? '#15803d' : gps.estado === 'erro' ? '#b91c1c' : '#854d0e' }}>
                        <MapPin size={16} />
                        {gps.estado === 'buscando' && 'Obtendo localização…'}
                        {gps.estado === 'ok' && `${gps.local ? gps.local + ' · ' : ''}${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}${gps.prec ? ` · ±${gps.prec}m` : ''}`}
                        {gps.estado === 'erro' && 'Sem GPS. Ative a localização — a coordenada é obrigatória.'}
                    </div>
                )}

                <div className="flex gap-2 mt-4">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 font-bold text-slate-600">Cancelar</button>
                    <button onClick={confirmar} disabled={!podeEnviar || enviando}
                        className="flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
                        style={{ background: '#9E7A42' }}>
                        {enviando ? <Loader size={18} className="animate-spin" /> : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ===== Bottom-sheet de divergência de escopo =====
const DivergenciaSheet = ({ apiClient, escopo, onClose, setAlertMessage }) => {
    const MOTIVOS = [
        ['faltando', 'Falta um equipamento'],
        ['saiu', 'Equipamento já saiu'],
        ['operador_errado', 'Operador errado'],
        ['outro', 'Outro'],
    ];
    const obras = escopo.obras || [];
    const [motivo, setMotivo] = useState('faltando');
    const [obraId, setObraId] = useState(obras[0]?.id || '');
    const [veiculoId, setVeiculoId] = useState('');
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);

    const confirmar = async () => {
        if (!texto.trim()) { setAlertMessage?.({ type: 'error', message: 'Descreva a divergência.' }); return; }
        if (!obraId) { setAlertMessage?.({ type: 'error', message: 'Selecione a obra.' }); return; }
        setEnviando(true);
        try {
            await apiClient.reportarDivergencia({ motivo, obra_id: obraId, veiculo_id: veiculoId || null, texto: texto.trim() });
            setAlertMessage?.({ type: 'success', message: 'Aviso enviado. A administração já foi notificada.' });
            onClose();
        } catch (e) {
            setAlertMessage?.({ type: 'error', message: e.message || 'Falha ao enviar o aviso.' });
            setEnviando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
            <div className="w-full bg-white rounded-t-2xl p-4 pb-6 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
                <h2 className="text-lg font-bold text-slate-800 mb-1">Comunicar divergência</h2>
                <p className="text-xs text-slate-500 mb-3">
                    Use isto quando a lista de equipamentos não bate com a realidade da obra.
                </p>

                <label className="text-xs font-bold text-gray-600 uppercase">O que está errado?</label>
                <div className="grid grid-cols-2 gap-2 mt-1 mb-3">
                    {MOTIVOS.map(([v, t]) => (
                        <button key={v} onClick={() => setMotivo(v)}
                            className={`py-2 px-2 rounded-lg text-sm font-semibold border-2 ${motivo === v ? 'border-yellow-500 bg-yellow-50 text-slate-800' : 'border-gray-200 text-slate-600'}`}>
                            {t}
                        </button>
                    ))}
                </div>

                {obras.length > 1 && (
                    <>
                        <label className="text-xs font-bold text-gray-600 uppercase">Obra</label>
                        <select value={obraId} onChange={e => setObraId(e.target.value)}
                            className="w-full mt-1 mb-3 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-yellow-500">
                            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                        </select>
                    </>
                )}

                {motivo !== 'faltando' && (escopo.equipamentos || []).length > 0 && (
                    <>
                        <label className="text-xs font-bold text-gray-600 uppercase">Equipamento (opcional)</label>
                        <select value={veiculoId} onChange={e => setVeiculoId(e.target.value)}
                            className="w-full mt-1 mb-3 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-yellow-500">
                            <option value="">Não sei / não se aplica</option>
                            {escopo.equipamentos.map(e => (
                                <option key={e.id} value={e.id}>{e.registroInterno || e.placa || e.modelo}</option>
                            ))}
                        </select>
                    </>
                )}

                <label className="text-xs font-bold text-gray-600 uppercase">Descreva <span className="text-red-500">*</span></label>
                <textarea value={texto} maxLength={500} rows={4} onChange={e => setTexto(e.target.value)}
                    placeholder="Ex.: a escavadeira MAK-018 está na obra desde segunda e não aparece na minha lista."
                    className="w-full mt-1 mb-4 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-yellow-500" />

                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 font-bold text-slate-600">Cancelar</button>
                    <button onClick={confirmar} disabled={enviando}
                        className="flex-1 py-3 rounded-xl font-bold text-white disabled:opacity-40" style={{ background: '#9E7A42' }}>
                        {enviando ? 'Enviando…' : 'Enviar aviso'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ===== Bottom-sheet de dispensa (§8) =====
const DispensaSheet = ({ apiClient, equip, obra, dataRef, retro, onClose, setAlertMessage }) => {
    const [motivos, setMotivos] = useState([]);
    const [motivo, setMotivo] = useState('');
    const [texto, setTexto] = useState('');
    const [periodo, setPeriodo] = useState('dia');
    const [abrangencia, setAbrangencia] = useState('equip'); // equip | obra
    const [enviando, setEnviando] = useState(false);

    useEffect(() => {
        apiClient.getMotivosDispensa().then(r => setMotivos(r.motivos || [])).catch(() => setMotivos([]));
    }, [apiClient]);

    const confirmar = async () => {
        if (!motivo && !texto.trim()) { setAlertMessage?.({ type: 'error', message: 'Escolha um motivo.' }); return; }
        setEnviando(true);
        try {
            await apiClient.registrarDispensa({
                obra_id: equip.obra_id,
                veiculo_id: abrangencia === 'obra' ? null : equip.id,
                data_ref: dataRef, periodo,
                motivo_codigo: motivo || null, motivo_texto: texto.trim() || null,
            });
            setAlertMessage?.({ type: 'success', message: 'Dispensa registrada.' });
            onClose();
        } catch (e) {
            setAlertMessage?.({ type: 'error', message: 'Falha ao registrar (precisa de conexão): ' + (e.message || '') });
            setEnviando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
            <div className="w-full bg-white rounded-t-2xl p-4 pb-6 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
                <h2 className="text-lg font-bold text-slate-800 mb-1">Dispensar evidências</h2>
                <p className="text-xs text-slate-500 mb-3">
                    {equip.registroInterno || equip.placa} · <b>{brCompleto(dataRef)}</b>
                    {retro && ' · registro retroativo'}
                </p>

                <label className="text-xs font-bold text-gray-600 uppercase">Motivo</label>
                <div className="grid grid-cols-2 gap-2 mt-1 mb-3">
                    {motivos.map(m => (
                        <button key={m.codigo} onClick={() => setMotivo(m.codigo)}
                            className={`py-2 px-2 rounded-lg text-sm font-semibold border-2 ${motivo === m.codigo ? 'border-yellow-500 bg-yellow-50 text-slate-800' : 'border-gray-200 text-slate-600'}`}>
                            {m.label}
                        </button>
                    ))}
                </div>
                <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Observação (opcional)"
                    className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm mb-3 outline-none focus:border-yellow-500" />

                <label className="text-xs font-bold text-gray-600 uppercase">Período</label>
                <div className="flex gap-2 mt-1 mb-3">
                    {[['dia', 'Dia todo'], ['manha', 'Só manhã'], ['tarde', 'Só tarde']].map(([v, t]) => (
                        <button key={v} onClick={() => setPeriodo(v)} className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 ${periodo === v ? 'border-yellow-500 bg-yellow-50' : 'border-gray-200 text-slate-600'}`}>{t}</button>
                    ))}
                </div>

                <label className="text-xs font-bold text-gray-600 uppercase">Abrangência</label>
                <div className="flex gap-2 mt-1 mb-4">
                    <button onClick={() => setAbrangencia('equip')} className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 ${abrangencia === 'equip' ? 'border-yellow-500 bg-yellow-50' : 'border-gray-200 text-slate-600'}`}>Só este</button>
                    <button onClick={() => setAbrangencia('obra')} className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 ${abrangencia === 'obra' ? 'border-yellow-500 bg-yellow-50' : 'border-gray-200 text-slate-600'}`}>Toda a obra</button>
                </div>

                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 font-bold text-slate-600">Cancelar</button>
                    <button onClick={confirmar} disabled={enviando} className="flex-1 py-3 rounded-xl font-bold text-white disabled:opacity-40" style={{ background: '#1c1a17' }}>
                        {enviando ? 'Salvando…' : (retro ? `Dispensar ${brCompleto(dataRef)}` : 'Dispensar hoje')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EvidenciasCapturaScreen;
