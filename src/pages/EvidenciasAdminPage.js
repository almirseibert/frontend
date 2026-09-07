// src/pages/EvidenciasAdminPage.js
// -----------------------------------------------------------------------------
// Administração de Evidências de Campo — Fase 4 + Fase 5 (§10.2).
// Abas: Arquivo (grid + lightbox + editor de carimbo auditado) · Aderência ·
// Cobranças (APROVAÇÃO MANUAL, um a um — nada dispara sozinho).
// -----------------------------------------------------------------------------
import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
    Loader, Camera, BarChart3, BellRing, X, Save, RotateCcw, Trash2,
    CheckCircle, AlertTriangle, Send, Ban, RefreshCw, MapPin, Clock,
    Archive, Download, Upload, ShieldCheck,
} from 'lucide-react';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const hoje = () => new Date().toLocaleDateString('en-CA');
const diasAtras = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
const TIPO_LABEL = {
    horimetro_inicio: 'Horímetro início', horimetro_fim: 'Horímetro fim',
    foto_manha: 'Trabalho manhã', foto_tarde: 'Trabalho tarde', extra: 'Extra',
};

const EvidenciasAdminPage = ({ apiClient, obras = [], setAlertMessage }) => {
    const [aba, setAba] = useState('arquivo');
    const abas = [
        { k: 'arquivo', t: 'Arquivo', Icon: Camera },
        { k: 'aderencia', t: 'Aderência', Icon: BarChart3 },
        { k: 'cobrancas', t: 'Cobranças', Icon: BellRing },
        { k: 'arquivamento', t: 'Arquivamento', Icon: Archive },
    ];
    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-800 mb-4">Evidências de Campo</h1>
            <div className="flex gap-1 border-b border-gray-200 mb-4">
                {abas.map(a => (
                    <button key={a.k} onClick={() => setAba(a.k)}
                        className={`px-4 py-2 font-semibold text-sm flex items-center gap-2 border-b-2 -mb-px ${aba === a.k ? 'border-yellow-600 text-yellow-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                        <a.Icon size={16} /> {a.t}
                    </button>
                ))}
            </div>
            {aba === 'arquivo' && <AbaArquivo apiClient={apiClient} obras={obras} setAlertMessage={setAlertMessage} />}
            {aba === 'aderencia' && <AbaAderencia apiClient={apiClient} obras={obras} setAlertMessage={setAlertMessage} />}
            {aba === 'cobrancas' && <AbaCobrancas apiClient={apiClient} obras={obras} setAlertMessage={setAlertMessage} />}
            {aba === 'arquivamento' && <AbaArquivamento apiClient={apiClient} obras={obras} setAlertMessage={setAlertMessage} />}
        </div>
    );
};

// ===================== ARQUIVO =====================
const AbaArquivo = ({ apiClient, obras, setAlertMessage }) => {
    const [filtros, setFiltros] = useState({ obra_id: '', de: diasAtras(7), ate: hoje(), tipo: '', estado: 'ativo' });
    const [carregando, setCarregando] = useState(false);
    const [itens, setItens] = useState([]);
    const [sel, setSel] = useState(null); // id aberto no lightbox

    const buscar = useCallback(async () => {
        setCarregando(true);
        try { const r = await apiClient.listarEvidencias({ ...filtros, limit: 100 }); setItens(r.itens || []); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
        finally { setCarregando(false); }
    }, [apiClient, filtros, setAlertMessage]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { buscar(); }, []);

    return (
        <div>
            <div className="flex flex-wrap gap-2 items-end mb-4 bg-white p-3 rounded-xl shadow-sm">
                <Campo label="Obra">
                    <select value={filtros.obra_id} onChange={e => setFiltros(f => ({ ...f, obra_id: e.target.value }))} className="input">
                        <option value="">Todas</option>
                        {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    </select>
                </Campo>
                <Campo label="De"><input type="date" value={filtros.de} onChange={e => setFiltros(f => ({ ...f, de: e.target.value }))} className="input" /></Campo>
                <Campo label="Até"><input type="date" value={filtros.ate} onChange={e => setFiltros(f => ({ ...f, ate: e.target.value }))} className="input" /></Campo>
                <Campo label="Momento">
                    <select value={filtros.tipo} onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))} className="input">
                        <option value="">Todos</option>
                        {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </Campo>
                <button onClick={buscar} className="btn-amber flex items-center gap-2"><RefreshCw size={16} /> Buscar</button>
            </div>

            {carregando ? <Centro><Loader className="animate-spin" /></Centro> : (
                itens.length === 0 ? <Centro>Nenhuma evidência no período.</Centro> : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {itens.map(it => (
                            <button key={it.id} onClick={() => setSel(it.id)} className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition text-left">
                                <div className="aspect-square bg-gray-100">
                                    <img src={apiClient.evidenciaImgUrl(it.urls.thumb)} alt="" className="w-full h-full object-cover" loading="lazy" />
                                </div>
                                <div className="p-2">
                                    <div className="text-xs font-bold text-slate-700 truncate">{it.registroInterno || it.placa}</div>
                                    <div className="text-[11px] text-slate-400 truncate">{TIPO_LABEL[it.tipo]} · {it.data_ref?.split?.('-').reverse().join('/')}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                )
            )}

            {sel && <Lightbox id={sel} apiClient={apiClient} onClose={() => setSel(null)} onChanged={buscar} setAlertMessage={setAlertMessage} />}
        </div>
    );
};

// ===================== LIGHTBOX + EDITOR DE CARIMBO =====================
const Lightbox = ({ id, apiClient, onClose, onChanged, setAlertMessage }) => {
    const [det, setDet] = useState(null);
    const [ov, setOv] = useState({});
    const [motivo, setMotivo] = useState('');
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        try { const r = await apiClient.getEvidencia(id); setDet(r); setOv({}); setMotivo(''); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); onClose(); }
    }, [apiClient, id]); // eslint-disable-line

    useEffect(() => { carregar(); }, [carregar]);

    if (!det) return <Modal onClose={onClose}><Centro><Loader className="animate-spin" /></Centro></Modal>;
    const r = det.registro;
    const d = det.dados_carimbo || {};
    const lat = ov.ov_latitude ?? (r.ov_latitude ?? r.dev_latitude);
    const lng = ov.ov_longitude ?? (r.ov_longitude ?? r.dev_longitude);
    const campo = (k, v) => setOv(o => ({ ...o, [k]: v }));

    const salvar = async () => {
        if (!Object.keys(ov).length) return;
        setSalvando(true);
        try {
            await apiClient.editarCarimbo(id, { ...ov, motivo });
            setAlertMessage?.({ type: 'success', message: 'Carimbo atualizado.' });
            await carregar(); onChanged?.();
        } catch (e) { setAlertMessage?.({ type: 'error', message: e.data?.error || e.message }); }
        finally { setSalvando(false); }
    };
    const remover = async () => {
        if (!motivo.trim()) return setAlertMessage?.({ type: 'error', message: 'Informe o motivo para remover.' });
        try { await apiClient.removerCarimbo(id, motivo); setAlertMessage?.({ type: 'success', message: 'Carimbo removido.' }); await carregar(); onChanged?.(); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.data?.error || e.message }); }
    };
    const restaurar = async () => {
        try { await apiClient.restaurarCarimbo(id); setAlertMessage?.({ type: 'success', message: 'Carimbo restaurado.' }); await carregar(); onChanged?.(); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
    };

    return (
        <Modal onClose={onClose} wide>
            <div className="flex flex-col md:flex-row gap-4">
                {/* Imagem + mapa */}
                <div className="md:w-1/2 space-y-3">
                    <img src={apiClient.evidenciaImgUrl(det.urls.stamped)} alt="" className="w-full rounded-lg" />
                    {lat != null && lng != null && (
                        <div className="h-48 rounded-lg overflow-hidden">
                            <MapContainer center={[Number(lat), Number(lng)]} zoom={15} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                <Marker position={[Number(lat), Number(lng)]} />
                            </MapContainer>
                        </div>
                    )}
                </div>
                {/* Metadados + editor */}
                <div className="md:w-1/2 space-y-2 text-sm">
                    <Meta label="Equipamento" v={d.equipamento} />
                    <Meta label="Obra" v={[d.obra, r._obra_nome].find(Boolean)} />
                    <Meta label="Momento" v={d.momentoLabel} />
                    <Meta label="Data/hora" v={d.dataHora} />
                    <Meta label="Coordenada" v={lat != null ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : '—'} />
                    <Meta label="Operador" v={d.operador} />
                    <Meta label="Leitura" v={d.leitura} />
                    {r._distancia_obra_m != null && <Meta label="Dist. da obra" v={`${r._distancia_obra_m} m`} />}
                    {r.dev_clock_skew_s != null && Math.abs(r.dev_clock_skew_s) > 300 &&
                        <div className="text-amber-600 text-xs flex items-center gap-1"><AlertTriangle size={12} /> Relógio do aparelho difere {Math.round(r.dev_clock_skew_s / 60)} min do servidor.</div>}

                    <details className="mt-2 border-t pt-2">
                        <summary className="cursor-pointer font-bold text-slate-600 text-xs">Editar carimbo (auditado)</summary>
                        <div className="space-y-2 mt-2">
                            <EditCampo label="Data/hora (ISO)" ph={r.dev_capturado_em} val={ov.ov_capturado_em} onChange={v => campo('ov_capturado_em', v)} />
                            <div className="grid grid-cols-2 gap-2">
                                <EditCampo label="Latitude" ph={r.dev_latitude} val={ov.ov_latitude} onChange={v => campo('ov_latitude', v)} />
                                <EditCampo label="Longitude" ph={r.dev_longitude} val={ov.ov_longitude} onChange={v => campo('ov_longitude', v)} />
                            </div>
                            <EditCampo label="Local (texto)" ph={r.dev_local_texto} val={ov.ov_local_texto} onChange={v => campo('ov_local_texto', v)} />
                            <EditCampo label="Linha extra" ph={r.ov_linha_extra} val={ov.ov_linha_extra} onChange={v => campo('ov_linha_extra', v)} />
                            <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (obrigatório p/ data/GPS/remoção)" className="input w-full" />
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={salvar} disabled={salvando || !Object.keys(ov).length} className="btn-amber flex items-center gap-1 disabled:opacity-40"><Save size={14} /> Salvar</button>
                                <button onClick={restaurar} className="btn-ghost flex items-center gap-1"><RotateCcw size={14} /> Restaurar</button>
                                <button onClick={remover} className="btn-danger flex items-center gap-1"><Trash2 size={14} /> Remover carimbo</button>
                            </div>
                        </div>
                    </details>

                    {det.auditoria?.length > 0 && (
                        <details className="border-t pt-2">
                            <summary className="cursor-pointer font-bold text-slate-600 text-xs">Histórico ({det.auditoria.length})</summary>
                            <ul className="mt-1 space-y-1 text-[11px] text-slate-500">
                                {det.auditoria.map(a => (
                                    <li key={a.id}>{new Date(a.created_at).toLocaleString('pt-BR')} · {a.acao} · {a.user_nome || a.user_id}{a.motivo ? ` · "${a.motivo}"` : ''}</li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            </div>
        </Modal>
    );
};

// ===================== ADERÊNCIA =====================
const AbaAderencia = ({ apiClient, obras, setAlertMessage }) => {
    const [filtros, setFiltros] = useState({ obra_id: '', de: diasAtras(6), ate: hoje() });
    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(false);

    const buscar = useCallback(async () => {
        setCarregando(true);
        try { setDados(await apiClient.getAderencia(filtros)); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
        finally { setCarregando(false); }
    }, [apiClient, filtros, setAlertMessage]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { buscar(); }, []);

    const consolidar = async () => {
        try { const r = await apiClient.consolidarEvidencias(filtros.ate); setAlertMessage?.({ type: 'success', message: `Consolidado: ${r.veiculos} equipamentos, ${r.cobrancas} cobranças projetadas.` }); buscar(); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 items-end mb-4 bg-white p-3 rounded-xl shadow-sm">
                <Campo label="Obra">
                    <select value={filtros.obra_id} onChange={e => setFiltros(f => ({ ...f, obra_id: e.target.value }))} className="input">
                        <option value="">Todas</option>{obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    </select>
                </Campo>
                <Campo label="De"><input type="date" value={filtros.de} onChange={e => setFiltros(f => ({ ...f, de: e.target.value }))} className="input" /></Campo>
                <Campo label="Até"><input type="date" value={filtros.ate} onChange={e => setFiltros(f => ({ ...f, ate: e.target.value }))} className="input" /></Campo>
                <button onClick={buscar} className="btn-amber flex items-center gap-2"><RefreshCw size={16} /> Buscar</button>
                <button onClick={consolidar} className="btn-ghost">Consolidar {filtros.ate.split('-').reverse().join('/')}</button>
            </div>

            <CardCorte apiClient={apiClient} obraId={filtros.obra_id} setAlertMessage={setAlertMessage} />

            {carregando ? <Centro><Loader className="animate-spin" /></Centro> : dados && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <KPI t="Aderência" v={`${dados.resumo.aderencia_pct}%`} />
                        <KPI t="Equip.·dia" v={dados.resumo.equipamentos_dia} />
                        <KPI t="Completos (4/4)" v={dados.resumo.completos} />
                        <KPI t="Cumpridas/Exig." v={`${dados.resumo.cumpridas}/${dados.resumo.exigidas}`} />
                    </div>
                    <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className="text-left text-slate-500 border-b">
                                <th className="p-2">Data</th><th className="p-2">Obra</th><th className="p-2">Equip.</th>
                                <th className="p-2 text-center">Início</th><th className="p-2 text-center">Manhã</th>
                                <th className="p-2 text-center">Tarde</th><th className="p-2 text-center">Fim</th><th className="p-2 text-center">Status</th>
                            </tr></thead>
                            <tbody>
                                {dados.dias.map(r => (
                                    <tr key={r.id} className="border-b last:border-0">
                                        <td className="p-2">{r.data_ref?.split?.('-').reverse().join('/')}</td>
                                        <td className="p-2 truncate max-w-[160px]">{r.obra_nome}</td>
                                        <td className="p-2">{r.registroInterno || r.placa}</td>
                                        <Bolinha ok={r.tem_horimetro_inicio} /><Bolinha ok={r.tem_foto_manha} />
                                        <Bolinha ok={r.tem_foto_tarde} /><Bolinha ok={r.tem_horimetro_fim} />
                                        <td className="p-2 text-center">
                                            <span className="inline-block w-3 h-3 rounded-full" style={{ background: r.completo ? '#22c55e' : (r.cumpridas > 0 ? '#f59e0b' : '#ef4444') }} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};

// ===================== PRONTIDÃO P/ CORTE DO WHATSAPP (Fase 9) =====================
const CardCorte = ({ apiClient, obraId, setAlertMessage }) => {
    const [status, setStatus] = useState(null);
    const [cfg, setCfg] = useState({ pct: 90, dias: 5 });
    const [editando, setEditando] = useState(false);
    const [resumo, setResumo] = useState(null);

    const carregar = useCallback(async () => {
        try {
            const [s, c] = await Promise.all([apiClient.getCorteStatus(obraId), apiClient.getCorteConfig()]);
            setStatus(s); setCfg({ pct: c.pct, dias: c.dias });
        } catch { /* silencioso */ }
    }, [apiClient, obraId]);
    useEffect(() => { carregar(); }, [carregar]);

    const salvarCfg = async () => {
        try { await apiClient.putCorteConfig(cfg); setEditando(false); carregar(); setAlertMessage?.({ type: 'success', message: 'Meta de corte atualizada.' }); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
    };
    const gerarResumo = async () => {
        if (!obraId) return setAlertMessage?.({ type: 'error', message: 'Selecione uma obra para o resumo.' });
        try { const r = await apiClient.gerarResumoObra({ obra_id: obraId }); setResumo(r.texto); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
    };
    const copiar = () => { try { navigator.clipboard.writeText(resumo); setAlertMessage?.({ type: 'success', message: 'Resumo copiado.' }); } catch { /* */ } };

    if (!status) return null;
    return (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 border-l-4" style={{ borderColor: status.pronto ? '#22c55e' : '#f59e0b' }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <div className="font-bold text-slate-800 flex items-center gap-2">
                        {status.pronto ? <CheckCircle size={18} className="text-green-500" /> : <Clock size={18} className="text-amber-500" />}
                        Prontidão para corte do WhatsApp
                    </div>
                    <div className="text-xs text-slate-500">
                        Meta: {status.pct_meta}% por {status.dias_meta} dias úteis {obraId ? '(obra selecionada)' : '(todas as obras)'}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {editando ? (
                        <>
                            <input type="number" value={cfg.pct} onChange={e => setCfg(c => ({ ...c, pct: e.target.value }))} className="input w-16" title="% meta" />
                            <input type="number" value={cfg.dias} onChange={e => setCfg(c => ({ ...c, dias: e.target.value }))} className="input w-14" title="dias" />
                            <button onClick={salvarCfg} className="btn-amber text-xs py-1.5">Salvar</button>
                        </>
                    ) : (
                        <button onClick={() => setEditando(true)} className="btn-ghost text-xs py-1.5">Editar meta</button>
                    )}
                    <button onClick={gerarResumo} className="btn-dark text-xs py-1.5">Resumo do dia</button>
                </div>
            </div>
            <div className="flex gap-2 mt-3">
                {status.dias.map(d => (
                    <div key={d.data} className="flex flex-col items-center">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                            style={{ background: d.pct == null ? '#cbd5e1' : d.ok ? '#22c55e' : '#ef4444' }}>
                            {d.pct == null ? '—' : `${d.pct}`}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1">{d.data.slice(8, 10)}/{d.data.slice(5, 7)}</span>
                    </div>
                ))}
                <div className="flex items-center ml-2 text-sm font-bold" style={{ color: status.pronto ? '#15803d' : '#b45309' }}>
                    {status.pronto ? 'Pronto para cortar ✅' : 'Ainda não'}
                </div>
            </div>
            {resumo && (
                <div className="mt-3 bg-slate-50 rounded-lg p-3">
                    <pre className="text-xs whitespace-pre-wrap text-slate-700">{resumo}</pre>
                    <button onClick={copiar} className="btn-ghost text-xs py-1 mt-2">Copiar para o WhatsApp</button>
                </div>
            )}
        </div>
    );
};

// ===================== COBRANÇAS (aprovação manual) =====================
const AbaCobrancas = ({ apiClient, obras, setAlertMessage }) => {
    const [data, setData] = useState(hoje());
    const [obraId, setObraId] = useState('');
    const [itens, setItens] = useState([]);
    const [sel, setSel] = useState(new Set());
    const [carregando, setCarregando] = useState(false);

    const buscar = useCallback(async () => {
        setCarregando(true);
        try { const r = await apiClient.getCobrancas({ data, obra_id: obraId, status: 'PENDENTE' }); setItens(r.itens || []); setSel(new Set()); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
        finally { setCarregando(false); }
    }, [apiClient, data, obraId, setAlertMessage]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { buscar(); }, []);

    const consolidar = async () => {
        try { const r = await apiClient.consolidarEvidencias(data); setAlertMessage?.({ type: 'success', message: `${r.cobrancas} cobranças projetadas.` }); buscar(); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
    };
    const aprovar = async (id) => {
        try { const r = await apiClient.aprovarCobranca(id); setAlertMessage?.({ type: r.enviado ? 'success' : 'error', message: r.enviado ? 'Cobrança enviada ao operador.' : 'Registrada, mas o operador não tem app/token de push.' }); buscar(); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
    };
    const ignorar = async (id) => { try { await apiClient.ignorarCobranca(id); buscar(); } catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); } };
    const aprovarLote = async () => {
        if (!sel.size) return;
        try { const r = await apiClient.aprovarCobrancasLote([...sel]); setAlertMessage?.({ type: 'success', message: `${r.enviadas} enviadas, ${r.semToken} sem push.` }); buscar(); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
    };
    const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

    return (
        <div>
            <div className="mb-3 text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-500 mt-0.5" />
                <span>Modo seguro: nada é enviado automaticamente. Consolide o dia para projetar os faltantes e <b>aprove cada cobrança manualmente</b>. O envio vai só ao operador do equipamento (push).</span>
            </div>
            <div className="flex flex-wrap gap-2 items-end mb-4 bg-white p-3 rounded-xl shadow-sm">
                <Campo label="Dia"><input type="date" value={data} onChange={e => setData(e.target.value)} className="input" /></Campo>
                <Campo label="Obra">
                    <select value={obraId} onChange={e => setObraId(e.target.value)} className="input">
                        <option value="">Todas</option>{obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    </select>
                </Campo>
                <button onClick={buscar} className="btn-amber flex items-center gap-2"><RefreshCw size={16} /> Buscar</button>
                <button onClick={consolidar} className="btn-ghost">Consolidar/projetar</button>
                {sel.size > 0 && <button onClick={aprovarLote} className="btn-dark flex items-center gap-2"><Send size={16} /> Aprovar {sel.size} selecionada(s)</button>}
            </div>

            {carregando ? <Centro><Loader className="animate-spin" /></Centro> : (
                itens.length === 0 ? <Centro><CheckCircle className="text-green-500 mr-2" size={18} /> Nenhuma cobrança pendente.</Centro> : (
                    <div className="bg-white rounded-xl shadow-sm divide-y">
                        {itens.map(it => (
                            <div key={it.id} className="flex items-center gap-3 p-3">
                                <input type="checkbox" checked={sel.has(it.id)} onChange={() => toggle(it.id)} className="w-4 h-4" />
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-slate-800 text-sm">{it.veic_label} <span className="text-slate-400 font-normal">· {TIPO_LABEL[it.tipo]}</span></div>
                                    <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                                        <span>{it.obra_nome}</span>
                                        {it.hora_limite && <span className="inline-flex items-center gap-1"><Clock size={11} /> {String(it.hora_limite).slice(0, 5)}</span>}
                                        <span className="inline-flex items-center gap-1"><MapPin size={11} /> {it.operador_nome || 'sem operador'}</span>
                                        {!it.operador_user_id && <span className="text-red-500">sem app</span>}
                                    </div>
                                </div>
                                <button onClick={() => aprovar(it.id)} className="btn-amber flex items-center gap-1 text-xs py-1.5"><Send size={14} /> Enviar</button>
                                <button onClick={() => ignorar(it.id)} className="btn-ghost text-xs py-1.5"><Ban size={14} /></button>
                            </div>
                        ))}
                    </div>
                )
            )}
        </div>
    );
};

// ===================== ARQUIVAMENTO (offload + restauração) =====================
const ST_LOTE = {
    GERANDO: { t: 'gerando', cor: '#854d0e', bg: '#fef9c3' },
    PRONTO: { t: 'pronto', cor: '#1d4ed8', bg: '#dbeafe' },
    BAIXADO: { t: 'baixado', cor: '#0369a1', bg: '#e0f2fe' },
    CONFIRMADO: { t: 'arquivado/purgado', cor: '#15803d', bg: '#dcfce7' },
    PURGADO: { t: 'purgado', cor: '#15803d', bg: '#dcfce7' },
};
const AbaArquivamento = ({ apiClient, obras, setAlertMessage }) => {
    const [obraId, setObraId] = useState('');
    const [de, setDe] = useState(diasAtras(60));
    const [ate, setAte] = useState(hoje());
    const [lotes, setLotes] = useState([]);
    const [carregando, setCarregando] = useState(false);
    const [gerando, setGerando] = useState(false);
    const [restFiles, setRestFiles] = useState([]);
    const [restResult, setRestResult] = useState(null);

    const buscar = useCallback(async () => {
        setCarregando(true);
        try { const r = await apiClient.getLotesOffload(obraId); setLotes(r.lotes || []); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
        finally { setCarregando(false); }
    }, [apiClient, obraId, setAlertMessage]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { buscar(); }, []);

    const gerar = async () => {
        if (!obraId) return setAlertMessage?.({ type: 'error', message: 'Escolha a obra.' });
        setGerando(true);
        try { const r = await apiClient.gerarOffload({ obra_id: obraId, de, ate }); setAlertMessage?.({ type: 'success', message: `Lote gerado: ${r.total_fotos} fotos, ${(r.tamanho_bytes / 1e6).toFixed(1)} MB.` }); buscar(); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
        finally { setGerando(false); }
    };
    const baixar = async (l) => { try { await apiClient.baixarOffloadZip(l.id, `MAK_EVID_${(l.obra_nome || 'obra').replace(/[^a-z0-9]+/gi, '_')}.zip`); } catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); } };
    const confirmar = async (l) => {
        if (!window.confirm('Confirmar baixa e PURGAR os originais deste lote? Faça isso só depois de abrir o ZIP e conferir. Miniaturas e metadados permanecem.')) return;
        try { const r = await apiClient.confirmarOffload(l.id); setAlertMessage?.({ type: 'success', message: `${r.arquivadas} evidências arquivadas e purgadas.` }); buscar(); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
    };
    const restaurar = async (preflight) => {
        if (!restFiles.length) return setAlertMessage?.({ type: 'error', message: 'Selecione arquivos de imagem.' });
        try { const r = await apiClient.restaurarEvidencias(restFiles, preflight); setRestResult(r); if (!preflight) buscar(); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
    };

    return (
        <div className="space-y-5">
            <div className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-500 mt-0.5" />
                <span>Exportar e apagar são etapas separadas. Gere o ZIP, baixe para a máquina de TI, <b>abra e confira</b>, e só então confirme a baixa (que purga os originais). Miniaturas e metadados permanecem sempre.</span>
            </div>

            {/* Gerar lote */}
            <div className="bg-white p-3 rounded-xl shadow-sm flex flex-wrap gap-2 items-end">
                <Campo label="Obra">
                    <select value={obraId} onChange={e => setObraId(e.target.value)} className="input">
                        <option value="">Selecione…</option>{obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    </select>
                </Campo>
                <Campo label="De"><input type="date" value={de} onChange={e => setDe(e.target.value)} className="input" /></Campo>
                <Campo label="Até"><input type="date" value={ate} onChange={e => setAte(e.target.value)} className="input" /></Campo>
                <button onClick={gerar} disabled={gerando} className="btn-amber flex items-center gap-2 disabled:opacity-40">{gerando ? <Loader size={16} className="animate-spin" /> : <Archive size={16} />} Gerar lote (ZIP)</button>
                <button onClick={buscar} className="btn-ghost flex items-center gap-2"><RefreshCw size={16} /> Atualizar</button>
            </div>

            {/* Lista de lotes */}
            {carregando ? <Centro><Loader className="animate-spin" /></Centro> : (
                <div className="bg-white rounded-xl shadow-sm divide-y">
                    {lotes.length === 0 && <Centro>Nenhum lote gerado ainda.</Centro>}
                    {lotes.map(l => {
                        const st = ST_LOTE[l.status] || ST_LOTE.PRONTO;
                        const podeConfirmar = l.status === 'PRONTO' || l.status === 'BAIXADO';
                        return (
                            <div key={l.id} className="flex items-center gap-3 p-3 flex-wrap">
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-slate-800 text-sm">{l.obra_nome}</div>
                                    <div className="text-xs text-slate-400">
                                        {l.periodo_inicio?.split?.('-').reverse().join('/')} – {l.periodo_fim?.split?.('-').reverse().join('/')} · {l.total_fotos} fotos · {(l.tamanho_bytes / 1e6).toFixed(1)} MB
                                    </div>
                                </div>
                                <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: st.bg, color: st.cor }}>{st.t}</span>
                                {(l.status === 'PRONTO' || l.status === 'BAIXADO') && <button onClick={() => baixar(l)} className="btn-ghost text-xs py-1.5 flex items-center gap-1"><Download size={14} /> ZIP</button>}
                                {podeConfirmar && <button onClick={() => confirmar(l)} className="btn-danger text-xs py-1.5 flex items-center gap-1"><Trash2 size={14} /> Confirmar e purgar</button>}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Restauração */}
            <div className="bg-white p-3 rounded-xl shadow-sm">
                <h3 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><ShieldCheck size={18} /> Restaurar evidências arquivadas</h3>
                <p className="text-xs text-slate-500 mb-2">Selecione os arquivos <b>originais/</b> do ZIP. O casamento é por <b>sha256</b> dos bytes (sobrevive a renomear/mover). Rode a pré-visualização antes.</p>
                <input type="file" multiple accept="image/*" onChange={e => { setRestFiles([...e.target.files]); setRestResult(null); }} className="text-sm" />
                <div className="flex gap-2 mt-2">
                    <button onClick={() => restaurar(true)} className="btn-ghost flex items-center gap-1"><Upload size={14} /> Pré-visualizar ({restFiles.length})</button>
                    <button onClick={() => restaurar(false)} disabled={!restFiles.length} className="btn-amber flex items-center gap-1 disabled:opacity-40"><ShieldCheck size={14} /> Restaurar</button>
                </div>
                {restResult && (
                    <div className="mt-3 text-sm">
                        <div className="font-semibold text-slate-700">{restResult.dry ? 'Pré-visualização' : 'Restauração'}: {restResult.casados}/{restResult.total} casaram.</div>
                        <ul className="mt-1 space-y-0.5 text-xs max-h-48 overflow-y-auto">
                            {restResult.resultados.map((r, i) => (
                                <li key={i} className="flex items-center gap-2" style={{ color: r.match === 'none' || r.match === 'erro' ? '#b91c1c' : '#15803d' }}>
                                    {r.match === 'none' || r.match === 'erro' ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}
                                    <span className="truncate">{r.arquivo} — {r.match}{r.restaurada ? ' · restaurada' : ''}{r.detalhe ? ` (${r.detalhe})` : ''}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};

// ===================== UI helpers =====================
const Campo = ({ label, children }) => (
    <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-slate-500 uppercase">{label}</span>{children}</label>
);
const Centro = ({ children }) => <div className="flex items-center justify-center py-16 text-slate-400">{children}</div>;
const KPI = ({ t, v }) => <div className="bg-white rounded-xl p-4 shadow-sm"><div className="text-2xl font-bold text-slate-800">{v}</div><div className="text-xs text-slate-500">{t}</div></div>;
const Meta = ({ label, v }) => v ? <div><span className="text-slate-400 text-xs">{label}: </span><span className="font-semibold text-slate-700">{v}</span></div> : null;
const Bolinha = ({ ok }) => <td className="p-2 text-center"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: ok ? '#22c55e' : '#e5e7eb' }} /></td>;
const EditCampo = ({ label, ph, val, onChange }) => (
    <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-bold text-slate-400 uppercase">{label}</span>
        <input value={val ?? ''} onChange={e => onChange(e.target.value)} placeholder={ph != null ? String(ph) : ''} className="input" />
    </label>
);
const Modal = ({ children, onClose, wide }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
        <div className={`bg-white rounded-2xl p-4 max-h-[92vh] overflow-y-auto w-full ${wide ? 'max-w-4xl' : 'max-w-md'}`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-end -mt-1 -mr-1"><button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X size={20} /></button></div>
            {children}
        </div>
    </div>
);

export default EvidenciasAdminPage;
