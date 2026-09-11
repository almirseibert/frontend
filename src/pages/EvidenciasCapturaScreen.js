// src/pages/EvidenciasCapturaScreen.js
// -----------------------------------------------------------------------------
// Tela de captura do operador — Evidências de Campo, Fase 3 (§10.1).
// Mobile-first, offline-first: o escopo vem do IndexedDB (não do DataContext),
// a foto é comprimida e ENFILEIRADA (nunca enviada direto), o GPS é obrigatório
// e o nome do lugar é resolvido offline por point-in-polygon (§5.4).
// -----------------------------------------------------------------------------
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader, MapPin, ChevronLeft, Ban, CheckCircle, Clock, AlertTriangle, Gauge } from 'lucide-react';
import PhotoCapture from '../components/PhotoCapture';
import { enfileirar, assinarFila } from '../services/evidenciaQueue';
import { escopoSet, escopoGet } from '../services/evidenciaDb';
import { cidadeDoPonto } from '../utils/geo';
import { getAllowedReadingTypes } from '../utils/vehicleRules';

const MOMENTOS = [
    { tipo: 'horimetro_inicio', label: 'Horímetro — início', leitura: true },
    { tipo: 'foto_manha', label: 'Trabalhando — manhã', leitura: false },
    { tipo: 'foto_tarde', label: 'Trabalhando — tarde', leitura: false },
    { tipo: 'horimetro_fim', label: 'Horímetro — fim', leitura: true },
];

let _geojson = null;
async function carregarGeo() {
    if (_geojson) return _geojson;
    try { const r = await fetch('/data/rs-municipios.geojson'); _geojson = await r.json(); } catch { _geojson = null; }
    return _geojson;
}

const EvidenciasCapturaScreen = ({ apiClient, user, setAlertMessage }) => {
    const [carregando, setCarregando] = useState(true);
    const [degradado, setDegradado] = useState(false);
    const [escopo, setEscopo] = useState({ data: '', obras: [], equipamentos: [], hojeEnviado: {} });
    const [veiculoSel, setVeiculoSel] = useState(null);
    const [filaMap, setFilaMap] = useState({}); // `${veiculo}|${tipo}` -> status
    const [sheet, setSheet] = useState(null);   // { momento, ... }
    const [dispensaSheet, setDispensaSheet] = useState(false);

    // ---- Carrega escopo (rede → IndexedDB) ----
    const carregar = useCallback(async () => {
        setCarregando(true);
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

    useEffect(() => { carregar(); }, [carregar]);
    useEffect(() => {
        const onOnline = () => carregar();
        window.addEventListener('online', onOnline);
        const t = setInterval(carregar, 30 * 60 * 1000);
        return () => { window.removeEventListener('online', onOnline); clearInterval(t); };
    }, [carregar]);

    // ---- Fila pendente de hoje (para marcar cards como "na fila") ----
    useEffect(() => {
        const aplicar = ({ itens }) => {
            const m = {};
            (itens || []).forEach(i => { m[`${i.veiculo_id}|${i.tipo}`] = i.status; });
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

    const statusMomento = (tipo) => {
        if (!equip) return 'pendente';
        if ((escopo.hojeEnviado?.[equip.id] || []).includes(tipo)) return 'enviado';
        const fs = filaMap[`${equip.id}|${tipo}`];
        if (fs === 'recusado') return 'recusado';
        if (fs) return 'fila';
        return 'pendente';
    };

    if (carregando) {
        return <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f3ef' }}><Loader className="animate-spin" style={{ color: '#9E7A42' }} /></div>;
    }

    // ===== Seleção de equipamento =====
    if (!equip) {
        return (
            <div className="min-h-screen pb-24 px-4 pt-4" style={{ background: '#f5f3ef' }}>
                <h1 className="text-xl font-bold text-slate-800 mb-1">Evidências</h1>
                <p className="text-sm text-slate-500 mb-4">Selecione o equipamento{escopo.data ? ` · ${escopo.data.split('-').reverse().join('/')}` : ''}</p>
                {degradado && <BannerCache />}
                {(!escopo.equipamentos || escopo.equipamentos.length === 0) && (
                    <div className="bg-white rounded-xl p-6 text-center text-slate-500 shadow-sm">Nenhum equipamento no seu escopo hoje.</div>
                )}
                {(() => {
                    const renderCard = (e) => {
                        const enviados = (escopo.hojeEnviado?.[e.id] || []).length;
                        return (
                            <button key={e.id} onClick={() => setVeiculoSel(e.id)}
                                className="w-full bg-white rounded-xl p-4 flex items-center justify-between shadow-sm active:scale-[0.99] transition">
                                <div className="text-left">
                                    <div className="font-bold text-slate-800">{e.registroInterno || e.placa || e.modelo}</div>
                                    <div className="text-xs text-slate-500">{[e.modelo, e.obra_nome].filter(Boolean).join(' · ')}</div>
                                    {e.saiuDaObra && (
                                        <div className="text-[11px] font-bold mt-0.5" style={{ color: '#b45309' }}>
                                            Saiu da obra{e.saiuEm ? ` em ${e.saiuEm.split('-').reverse().join('/')}` : ''} · inclusão retroativa
                                        </div>
                                    )}
                                </div>
                                <div className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: enviados >= 4 ? '#dcfce7' : '#fef9c3', color: enviados >= 4 ? '#15803d' : '#854d0e' }}>
                                    {enviados}/4
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
            </div>
        );
    }

    // ===== 4 cartões de momento =====
    return (
        <div className="min-h-screen pb-24 px-4 pt-4" style={{ background: '#f5f3ef' }}>
            <button onClick={() => setVeiculoSel(null)} className="flex items-center gap-1 text-sm text-slate-500 mb-2">
                <ChevronLeft size={16} /> Trocar equipamento
            </button>
            <h1 className="text-xl font-bold text-slate-800">{equip.registroInterno || equip.placa}</h1>
            <p className="text-sm text-slate-500 mb-1">{[equip.modelo, obra?.nome].filter(Boolean).join(' · ')}</p>
            {equip.saiuDaObra && (
                <div className="mb-2 text-[12px] font-semibold rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: '#fef3c7', color: '#92400e' }}>
                    <AlertTriangle size={14} /> Equipamento saiu da obra{equip.saiuEm ? ` em ${equip.saiuEm.split('-').reverse().join('/')}` : ''}. Registro retroativo desse dia.
                </div>
            )}
            {degradado && <BannerCache />}

            <div className="grid grid-cols-1 gap-3 mt-3">
                {MOMENTOS.map(m => (
                    <CardMomento key={m.tipo} momento={m} status={statusMomento(m.tipo)} onClick={() => setSheet({ momento: m })} />
                ))}
            </div>

            <button onClick={() => setDispensaSheet(true)}
                className="w-full mt-4 py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 font-bold flex items-center justify-center gap-2 active:bg-slate-100">
                <Ban size={18} /> Dispensar hoje (chuva, parado…)
            </button>

            <CalendarioEquip apiClient={apiClient} vehicleId={equip.id} />

            {sheet && (
                <CaptureSheet
                    momento={sheet.momento} equip={equip} obra={obra} escopo={escopo} user={user}
                    onClose={() => setSheet(null)} setAlertMessage={setAlertMessage}
                />
            )}
            {dispensaSheet && (
                <DispensaSheet
                    apiClient={apiClient} equip={equip} obra={obra} escopo={escopo}
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

const EST = {
    enviado:  { txt: 'Enviado', cor: '#15803d', bg: '#dcfce7', Icon: CheckCircle },
    fila:     { txt: 'Na fila', cor: '#1d4ed8', bg: '#dbeafe', Icon: Clock },
    recusado: { txt: 'Recusado', cor: '#b91c1c', bg: '#fee2e2', Icon: AlertTriangle },
    pendente: { txt: 'Pendente', cor: '#854d0e', bg: '#fef9c3', Icon: Clock },
};
const CardMomento = ({ momento, status, onClick }) => {
    const e = EST[status] || EST.pendente;
    const bloqueado = status === 'enviado' || status === 'fila';
    return (
        <button onClick={bloqueado ? undefined : onClick}
            className={`w-full bg-white rounded-xl p-4 flex items-center justify-between shadow-sm text-left ${bloqueado ? 'opacity-90' : 'active:scale-[0.99]'}`}>
            <div className="flex items-center gap-3">
                {momento.leitura ? <Gauge size={22} className="text-slate-400" /> : <span className="text-slate-300 text-2xl leading-none">📷</span>}
                <div>
                    <div className="font-bold text-slate-800">{momento.label}</div>
                    <div className="text-xs text-slate-400">{momento.leitura ? 'Leitura + foto' : 'Só foto'}</div>
                </div>
            </div>
            <span className="text-xs font-bold px-2 py-1 rounded-full inline-flex items-center gap-1" style={{ background: e.bg, color: e.cor }}>
                <e.Icon size={12} /> {e.txt}
            </span>
        </button>
    );
};

// ===== Quadro por equipamento (B4): status por dia na obra =====
const STATUS_CAL = {
    completo:   { bg: '#dcfce7', cor: '#15803d', label: 'Completo' },
    parcial:    { bg: '#fef9c3', cor: '#854d0e', label: 'Parcial' },
    faltando:   { bg: '#fee2e2', cor: '#b91c1c', label: 'Faltando' },
    dispensado: { bg: '#e2e8f0', cor: '#475569', label: 'Dispensado' },
};
const CalendarioEquip = ({ apiClient, vehicleId }) => {
    const [dias, setDias] = useState(null);
    useEffect(() => {
        let cancel = false;
        apiClient.getEvidenciaCalendario(vehicleId)
            .then(r => { if (!cancel) setDias(r.dias || []); })
            .catch(() => { if (!cancel) setDias([]); });
        return () => { cancel = true; };
    }, [apiClient, vehicleId]);

    if (!dias || dias.length === 0) return null;
    return (
        <div className="mt-4 bg-white rounded-xl p-3 shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-400 mb-2">Histórico na obra (30 dias)</p>
            <div className="flex flex-wrap gap-1.5">
                {dias.map(d => {
                    const st = STATUS_CAL[d.status] || STATUS_CAL.faltando;
                    const [, mm, dd] = d.data.split('-');
                    return (
                        <span key={d.data} title={`${dd}/${mm} · ${st.label} (${d.enviados}/${d.exigidas})`}
                            className="text-[10px] font-bold rounded px-1.5 py-1 leading-none"
                            style={{ background: st.bg, color: st.cor }}>
                            {dd}/{mm}
                        </span>
                    );
                })}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                {Object.values(STATUS_CAL).map(s => (
                    <span key={s.label} className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                        <span className="w-2.5 h-2.5 rounded" style={{ background: s.bg, border: `1px solid ${s.cor}` }} /> {s.label}
                    </span>
                ))}
            </div>
        </div>
    );
};

// ===== Bottom-sheet de captura =====
const CaptureSheet = ({ momento, equip, obra, escopo, user, onClose, setAlertMessage }) => {
    const [foto, setFoto] = useState(null);
    const [leitura, setLeitura] = useState('');
    const [gps, setGps] = useState({ estado: 'buscando', lat: null, lng: null, prec: null, local: null });
    const [enviando, setEnviando] = useState(false);
    const readingType = getAllowedReadingTypes(equip.tipo)[0]; // 'horimetro'|'odometro'
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        // GPS em paralelo (não trava a tela) — mesmo padrão da NovaSolicitacao.
        if (!navigator.geolocation) { setGps(g => ({ ...g, estado: 'erro' })); return () => {}; }
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                if (!mountedRef.current) return;
                const { latitude, longitude, accuracy } = pos.coords;
                let local = null;
                try { const geo = await carregarGeo(); if (geo) local = cidadeDoPonto(latitude, longitude, geo); } catch { /* */ }
                setGps({ estado: 'ok', lat: latitude, lng: longitude, prec: accuracy ? Math.round(accuracy) : null, local });
            },
            () => { if (mountedRef.current) setGps(g => ({ ...g, estado: 'erro' })); },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
        return () => { mountedRef.current = false; };
    }, []);

    const podeEnviar = foto && gps.estado === 'ok' && (!momento.leitura || (leitura !== '' && Number(leitura) > 0));

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
                // Equipamento que saiu da obra: registra na data de saída (dia da
                // inclusão retroativa), não hoje.
                data_ref: equip.saiuEm || escopo.data,
                turno: momento.tipo === 'foto_manha' ? 'manha' : momento.tipo === 'foto_tarde' ? 'tarde' : 'indefinido',
                dev_latitude: gps.lat, dev_longitude: gps.lng, dev_precisao_m: gps.prec,
                dev_local_texto: gps.local || null,
                dev_capturado_em: new Date().toISOString(),
                dev_operador_nome: user?.name || null,
                leitura: momento.leitura ? Number(leitura) : null,
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
                <p className="text-xs text-slate-400 mb-3">{equip.registroInterno || equip.placa} · {obra?.nome || ''}</p>

                {momento.leitura && (
                    <div className="mb-3">
                        <label className="text-xs font-bold text-gray-600 uppercase">{readingType === 'horimetro' ? 'Horímetro (h)' : 'Odômetro (km)'} <span className="text-red-500">*</span></label>
                        <input type="number" inputMode="decimal" value={leitura} onChange={e => setLeitura(e.target.value)}
                            className="w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-3 text-lg font-bold focus:border-yellow-500 outline-none"
                            placeholder="0,0" />
                    </div>
                )}

                <PhotoCapture label="Foto" photo={foto} onPick={(blob, preview, info) => setFoto({ blob, preview, original: info?.original })} onClear={() => setFoto(null)} />

                <div className="mt-3 text-sm flex items-center gap-2" style={{ color: gps.estado === 'ok' ? '#15803d' : gps.estado === 'erro' ? '#b91c1c' : '#854d0e' }}>
                    <MapPin size={16} />
                    {gps.estado === 'buscando' && 'Obtendo localização…'}
                    {gps.estado === 'ok' && `${gps.local ? gps.local + ' · ' : ''}${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}${gps.prec ? ` · ±${gps.prec}m` : ''}`}
                    {gps.estado === 'erro' && 'Sem GPS. Ative a localização — a coordenada é obrigatória.'}
                </div>

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

// ===== Bottom-sheet de dispensa (§8) =====
const DispensaSheet = ({ apiClient, equip, obra, escopo, onClose, setAlertMessage }) => {
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
                data_ref: equip.saiuEm || escopo.data, periodo,
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
                <h2 className="text-lg font-bold text-slate-800 mb-3">Dispensar evidências de hoje</h2>

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
                        {enviando ? 'Salvando…' : 'Dispensar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EvidenciasCapturaScreen;
