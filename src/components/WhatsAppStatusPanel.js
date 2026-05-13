import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
    Wifi, WifiOff, RefreshCw, Loader, Smartphone,
    Send, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp
} from 'lucide-react';
import apiClient from '../services/apiClient';

// ─── Badge de status ──────────────────────────────────────────────────────────
const STATUS_CFG = {
    PRONTO:          { label: 'Conectado',        cor: 'green',  Icon: Wifi       },
    AUTENTICADO:     { label: 'Autenticando…',    cor: 'yellow', Icon: Loader     },
    QR_PRONTO:       { label: 'Aguardando QR',    cor: 'yellow', Icon: Smartphone },
    DESCONECTADO:    { label: 'Desconectado',     cor: 'red',    Icon: WifiOff    },
    NAO_CONFIGURADO: { label: 'Não configurado',  cor: 'red',    Icon: WifiOff    },
};
const COR = { green: 'bg-green-100 text-green-800', yellow: 'bg-yellow-100 text-yellow-800', red: 'bg-red-100 text-red-800' };

const Badge = ({ status }) => {
    const { label, cor, Icon } = STATUS_CFG[status] || STATUS_CFG.DESCONECTADO;
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${COR[cor]}`}>
            <Icon size={13} className={status === 'AUTENTICADO' ? 'animate-spin' : ''} />
            {label}
        </span>
    );
};

// ─── Painel principal ─────────────────────────────────────────────────────────
const WhatsAppStatusPanel = () => {
    const [status,       setStatus]       = useState('DESCONECTADO');
    const [qr,           setQr]           = useState(null);   // string bruta do whatsapp-web.js
    const [loading,      setLoading]      = useState(false);
    const [reiniciando,  setReiniciando]  = useState(false);
    const [logs,         setLogs]         = useState([]);
    const [mostrarLogs,  setMostrarLogs]  = useState(false);
    const [loadingLogs,  setLoadingLogs]  = useState(false);
    const [testeNumero,  setTesteNumero]  = useState('');
    const [testeMens,    setTesteMens]    = useState('');
    const [enviando,     setEnviando]     = useState(false);
    const [resultado,    setResultado]    = useState(null);

    const pollingRef = useRef(null);

    const pararPolling = useCallback(() => {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    }, []);

    const buscarStatus = useCallback(async () => {
        try {
            const data = await apiClient.whatsappGetStatus();
            setStatus(data.status);
            setQr(data.qr || null);
            if (data.status === 'PRONTO') pararPolling();
        } catch (_) {
            setStatus('DESCONECTADO');
            setQr(null);
        }
    }, [pararPolling]);

    const iniciarPolling = useCallback((ms = 3000) => {
        pararPolling();
        pollingRef.current = setInterval(buscarStatus, ms);
    }, [buscarStatus, pararPolling]);

    // mount: busca imediata + inicia polling se não estiver pronto
    useEffect(() => {
        buscarStatus();
        return pararPolling;
    }, []);  // eslint-disable-line

    useEffect(() => {
        if (status === 'PRONTO' || status === 'AUTENTICADO') {
            pararPolling();
        } else {
            iniciarPolling(3000);
        }
    }, [status]); // eslint-disable-line

    const handleReiniciar = async () => {
        setReiniciando(true);
        setQr(null);
        setStatus('DESCONECTADO');
        try { await apiClient.whatsappReiniciar(); } catch (_) {}
        iniciarPolling(2000);          // polling agressivo para pegar QR rápido
        setTimeout(() => setReiniciando(false), 3000);
    };

    const handleAtualizar = async () => {
        setLoading(true);
        await buscarStatus();
        setLoading(false);
    };

    const handleEnviarTeste = async (e) => {
        e.preventDefault();
        setEnviando(true);
        setResultado(null);
        try {
            await apiClient.whatsappEnviarTeste({ numero: testeNumero, mensagem: testeMens });
            setResultado({ ok: true, msg: 'Mensagem enviada com sucesso!' });
            setTesteNumero('');
            setTesteMens('');
        } catch (err) {
            setResultado({ ok: false, msg: err.message || 'Erro ao enviar.' });
        } finally {
            setEnviando(false);
        }
    };

    const handleLogs = async () => {
        const abrir = !mostrarLogs;
        setMostrarLogs(abrir);
        if (abrir) {
            setLoadingLogs(true);
            try { const d = await apiClient.whatsappGetLogs(); setLogs(d); }
            catch (_) {} finally { setLoadingLogs(false); }
        }
    };

    return (
        <div className="space-y-4">

            {/* ── Conexão ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
                            <Smartphone size={18} className="text-green-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800 leading-none">WhatsApp</h3>
                            <p className="text-xs text-gray-400 mt-0.5">Conexão do serviço de mensagens</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge status={status} />
                        <button onClick={handleAtualizar} disabled={loading}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Atualizar agora">
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={handleReiniciar} disabled={reiniciando}
                            className="px-4 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5">
                            {reiniciando
                                ? <><Loader size={13} className="animate-spin" /> Reiniciando…</>
                                : 'Reconectar'}
                        </button>
                    </div>
                </div>

                {/* QR Code — renderizado no browser via qrcode.react */}
                {(status === 'QR_PRONTO' || reiniciando) && (
                    <div className="px-6 py-6 bg-yellow-50 border-b border-yellow-100">
                        {qr ? (
                            <div className="flex flex-col md:flex-row items-center gap-8">
                                <div className="p-3 bg-white rounded-xl shadow border border-gray-200 flex-shrink-0">
                                    <QRCodeSVG
                                        value={qr}
                                        size={200}
                                        level="M"
                                        includeMargin={true}
                                    />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800 text-base mb-2">Escaneie para conectar</p>
                                    <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
                                        <li>Abra o <strong>WhatsApp</strong> no celular</li>
                                        <li>Toque em <strong>Dispositivos conectados</strong></li>
                                        <li>Toque em <strong>Conectar dispositivo</strong></li>
                                        <li>Aponte a câmera para o QR ao lado</li>
                                    </ol>
                                    <p className="text-xs text-yellow-700 mt-4 bg-yellow-100 rounded-lg px-3 py-2">
                                        O QR expira em ~60 s. Um novo é gerado automaticamente.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 text-yellow-700 py-2">
                                <Loader size={18} className="animate-spin flex-shrink-0" />
                                <p className="text-sm">
                                    Inicializando Puppeteer… aguarde o QR Code (pode levar ~20 s).
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Faixas de status */}
                {status === 'PRONTO' && (
                    <div className="px-6 py-3 bg-green-50 flex items-center gap-2 text-green-700 text-sm">
                        <CheckCircle size={15} />
                        Serviço ativo — mensagens automáticas do sistema funcionando normalmente.
                    </div>
                )}
                {status === 'DESCONECTADO' && !reiniciando && (
                    <div className="px-6 py-3 bg-red-50 flex items-center gap-2 text-red-700 text-sm">
                        <XCircle size={15} />
                        Desconectado. Clique em <strong className="mx-1">Reconectar</strong> para iniciar.
                    </div>
                )}
                {status === 'NAO_CONFIGURADO' && (
                    <div className="px-6 py-3 bg-gray-50 flex items-center gap-2 text-gray-500 text-sm">
                        <XCircle size={15} />
                        Variável <code className="mx-1 bg-gray-100 px-1 rounded">WHATSAPP_SERVICE_URL</code> não configurada no backend.
                    </div>
                )}
            </div>

            {/* ── Enviar mensagem de teste ─────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm">
                    <Send size={15} className="text-slate-500" />
                    Enviar mensagem de teste
                </h4>
                <form onSubmit={handleEnviarTeste} className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Número (com DDD, sem +55)</label>
                            <input type="text" value={testeNumero}
                                onChange={e => setTesteNumero(e.target.value)}
                                placeholder="51999990000"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                                required />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Mensagem</label>
                            <input type="text" value={testeMens}
                                onChange={e => setTesteMens(e.target.value)}
                                placeholder="Teste do sistema FrotaMAK"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                                required />
                        </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <button type="submit" disabled={enviando || status !== 'PRONTO'}
                            className="px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5">
                            {enviando ? <><Loader size={13} className="animate-spin" /> Enviando…</> : <><Send size={13} /> Enviar</>}
                        </button>
                        {status !== 'PRONTO' && (
                            <p className="text-xs text-gray-400">WhatsApp precisa estar conectado.</p>
                        )}
                    </div>
                    {resultado && (
                        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${resultado.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {resultado.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
                            {resultado.msg}
                        </div>
                    )}
                </form>
            </div>

            {/* ── Histórico ────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <button onClick={handleLogs}
                    className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors rounded-xl">
                    <span className="font-bold text-gray-800 flex items-center gap-2 text-sm">
                        <Clock size={14} className="text-slate-400" />
                        Histórico de mensagens (últimas 50)
                    </span>
                    {mostrarLogs ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                </button>

                {mostrarLogs && (
                    <div className="border-t border-gray-100">
                        {loadingLogs ? (
                            <div className="flex justify-center py-8"><Loader size={20} className="animate-spin text-gray-300" /></div>
                        ) : logs.length === 0 ? (
                            <p className="text-center text-gray-400 text-sm py-8">Nenhum registro encontrado.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Destinatário</th>
                                            <th className="px-4 py-3 text-left">Número</th>
                                            <th className="px-4 py-3 text-left">Motivo</th>
                                            <th className="px-4 py-3 text-left">Status</th>
                                            <th className="px-4 py-3 text-left">Data</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {logs.map(log => (
                                            <tr key={log.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-2.5 font-medium text-gray-800">{log.destinatario_nome}</td>
                                                <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{log.destinatario_numero}</td>
                                                <td className="px-4 py-2.5 text-gray-500 text-xs">{log.motivo_envio}</td>
                                                <td className="px-4 py-2.5">
                                                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${log.status === 'ENVIADO' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {log.status === 'ENVIADO' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                                                        {log.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                                                    {log.criado_em ? new Date(log.criado_em).toLocaleString('pt-BR') : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default WhatsAppStatusPanel;
