import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Wifi, WifiOff, RefreshCw, Loader, Smartphone,
    Send, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp
} from 'lucide-react';
import apiClient from '../services/apiClient';

// ─── QR Image — suporta data URI (SVG/PNG) ou string bruta do whatsapp-web.js ─
const QrImage = ({ qr }) => {
    // data URI normal (SVG ou PNG gerado pelo servidor)
    if (qr && (qr.startsWith('data:') || qr.startsWith('http'))) {
        return (
            <img
                src={qr}
                alt="QR Code WhatsApp"
                className="w-52 h-52 rounded-xl border-4 border-white shadow-md flex-shrink-0 bg-white"
            />
        );
    }

    // Fallback: string bruta do whatsapp-web.js — renderiza via API pública de QR
    // (não sai da rede interna; usa serviço do Google Charts como último recurso)
    if (qr) {
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=208x208&data=${encodeURIComponent(qr)}`;
        return (
            <img
                src={url}
                alt="QR Code WhatsApp"
                className="w-52 h-52 rounded-xl border-4 border-white shadow-md flex-shrink-0 bg-white"
            />
        );
    }

    return null;
};

// ─── Badge de status ──────────────────────────────────────────────────────────
const STATUS_CONFIG = {
    PRONTO:          { label: 'Conectado',       color: 'green',  Icon: Wifi },
    AUTENTICADO:     { label: 'Autenticando…',   color: 'yellow', Icon: Loader },
    QR_PRONTO:       { label: 'Aguardando QR',   color: 'yellow', Icon: Smartphone },
    DESCONECTADO:    { label: 'Desconectado',    color: 'red',    Icon: WifiOff },
    NAO_CONFIGURADO: { label: 'Não configurado', color: 'red',    Icon: WifiOff },
};

const colorClass = { green: 'bg-green-100 text-green-800', yellow: 'bg-yellow-100 text-yellow-800', red: 'bg-red-100 text-red-800' };

const StatusBadge = ({ status }) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.DESCONECTADO;
    const { label, color, Icon } = cfg;
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${colorClass[color]}`}>
            <Icon size={13} className={status === 'AUTENTICADO' ? 'animate-spin' : ''} />
            {label}
        </span>
    );
};

// ─── Painel principal ─────────────────────────────────────────────────────────
const WhatsAppStatusPanel = () => {
    const [status, setStatus] = useState('DESCONECTADO');
    const [qr, setQr] = useState(null);
    const [loading, setLoading] = useState(false);
    const [reiniciando, setReiniciando] = useState(false);
    const [mostrarLogs, setMostrarLogs] = useState(false);
    const [logs, setLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

    // Form de teste
    const [testeNumero, setTesteNumero] = useState('');
    const [testeMensagem, setTesteMensagem] = useState('');
    const [enviandoTeste, setEnviandoTeste] = useState(false);
    const [testeResultado, setTesteResultado] = useState(null); // {ok, msg}

    const pollingRef = useRef(null);

    const pararPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

    const buscarStatus = useCallback(async () => {
        try {
            const data = await apiClient.whatsappGetStatus();
            setStatus(data.status);
            setQr(data.qr || null);
            // Para o polling quando conectado
            if (data.status === 'PRONTO') pararPolling();
        } catch (_) {
            setStatus('DESCONECTADO');
            setQr(null);
        }
    }, [pararPolling]);

    const iniciarPolling = useCallback((intervalo = 3000) => {
        pararPolling();
        pollingRef.current = setInterval(buscarStatus, intervalo);
    }, [buscarStatus, pararPolling]);

    // Busca inicial + polling enquanto não conectado
    useEffect(() => {
        buscarStatus();
        return pararPolling;
    }, []);

    useEffect(() => {
        if (status === 'PRONTO' || status === 'AUTENTICADO') {
            pararPolling();
        } else {
            iniciarPolling(4000);
        }
    }, [status]);

    const handleReiniciar = async () => {
        setReiniciando(true);
        setQr(null);
        setStatus('DESCONECTADO');
        try {
            await apiClient.whatsappReiniciar();
        } catch (_) {}
        // Polling agressivo para pegar o QR assim que aparecer
        iniciarPolling(2000);
        setLoading(true);
        setTimeout(() => { setReiniciando(false); setLoading(false); }, 4000);
    };

    const handleAtualizar = async () => {
        setLoading(true);
        await buscarStatus();
        setLoading(false);
    };

    const handleEnviarTeste = async (e) => {
        e.preventDefault();
        setEnviandoTeste(true);
        setTesteResultado(null);
        try {
            await apiClient.whatsappEnviarTeste({ numero: testeNumero, mensagem: testeMensagem });
            setTesteResultado({ ok: true, msg: 'Mensagem enviada com sucesso!' });
            setTesteNumero('');
            setTesteMensagem('');
        } catch (err) {
            setTesteResultado({ ok: false, msg: err.message || 'Erro ao enviar.' });
        } finally {
            setEnviandoTeste(false);
        }
    };

    const handleMostrarLogs = async () => {
        const abrir = !mostrarLogs;
        setMostrarLogs(abrir);
        if (abrir) {
            setLoadingLogs(true);
            try {
                const data = await apiClient.whatsappGetLogs();
                setLogs(data);
            } catch (_) {} finally {
                setLoadingLogs(false);
            }
        }
    };

    return (
        <div className="space-y-4">
            {/* ── Conexão ─────────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
                            <Smartphone size={18} className="text-green-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800 text-base leading-none">WhatsApp</h3>
                            <p className="text-xs text-gray-500 mt-0.5">Conexão do serviço de mensagens</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <StatusBadge status={status} />
                        <button
                            onClick={handleAtualizar}
                            disabled={loading}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Atualizar status"
                        >
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            onClick={handleReiniciar}
                            disabled={reiniciando}
                            className="px-4 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                            {reiniciando
                                ? <><Loader size={13} className="animate-spin" /> Reiniciando…</>
                                : 'Reconectar'}
                        </button>
                    </div>
                </div>

                {/* QR Code — exibido com destaque quando disponível */}
                {(status === 'QR_PRONTO' || reiniciando) && (
                    <div className="px-6 py-6 bg-yellow-50 border-b border-yellow-100">
                        {qr ? (
                            <div className="flex flex-col md:flex-row items-center gap-6">
                                <QrImage qr={qr} />
                                <div>
                                    <p className="font-bold text-gray-800 text-base mb-1">Escaneie para conectar</p>
                                    <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                                        <li>Abra o WhatsApp no celular</li>
                                        <li>Toque em <strong>Dispositivos conectados</strong></li>
                                        <li>Toque em <strong>Conectar dispositivo</strong></li>
                                        <li>Aponte a câmera para o QR ao lado</li>
                                    </ol>
                                    <p className="text-xs text-yellow-700 mt-3 bg-yellow-100 rounded-lg px-3 py-2">
                                        O QR expira em ~60 segundos. Novo QR será gerado automaticamente.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 text-yellow-700">
                                <Loader size={18} className="animate-spin flex-shrink-0" />
                                <p className="text-sm">Aguardando geração do QR Code… O serviço está inicializando o Puppeteer.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Mensagem de status quando conectado */}
                {status === 'PRONTO' && (
                    <div className="px-6 py-3 bg-green-50 flex items-center gap-2 text-green-700 text-sm">
                        <CheckCircle size={15} />
                        Serviço ativo — mensagens automáticas do sistema estão sendo enviadas normalmente.
                    </div>
                )}

                {status === 'DESCONECTADO' && !reiniciando && (
                    <div className="px-6 py-3 bg-red-50 flex items-center gap-2 text-red-700 text-sm">
                        <XCircle size={15} />
                        Serviço desconectado. Clique em <strong className="mx-1">Reconectar</strong> para iniciar.
                    </div>
                )}
            </div>

            {/* ── Enviar mensagem de teste ────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Send size={16} className="text-slate-600" />
                    Enviar mensagem de teste
                </h4>
                <form onSubmit={handleEnviarTeste} className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Número (com DDD)</label>
                            <input
                                type="text"
                                value={testeNumero}
                                onChange={e => setTesteNumero(e.target.value)}
                                placeholder="51999990000"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Mensagem</label>
                            <input
                                type="text"
                                value={testeMensagem}
                                onChange={e => setTesteMensagem(e.target.value)}
                                placeholder="Teste do sistema FrotaMAK"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                                required
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="submit"
                            disabled={enviandoTeste || status !== 'PRONTO'}
                            className="px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                            {enviandoTeste
                                ? <><Loader size={13} className="animate-spin" /> Enviando…</>
                                : <><Send size={13} /> Enviar</>}
                        </button>
                        {status !== 'PRONTO' && (
                            <p className="text-xs text-gray-400">O WhatsApp precisa estar conectado para enviar.</p>
                        )}
                    </div>
                    {testeResultado && (
                        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${testeResultado.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {testeResultado.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
                            {testeResultado.msg}
                        </div>
                    )}
                </form>
            </div>

            {/* ── Histórico de mensagens ──────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <button
                    onClick={handleMostrarLogs}
                    className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors rounded-xl"
                >
                    <span className="font-bold text-gray-800 flex items-center gap-2 text-sm">
                        <Clock size={15} className="text-slate-500" />
                        Histórico de mensagens (últimas 50)
                    </span>
                    {mostrarLogs ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </button>

                {mostrarLogs && (
                    <div className="border-t border-gray-100">
                        {loadingLogs ? (
                            <div className="flex justify-center py-8">
                                <Loader size={20} className="animate-spin text-gray-400" />
                            </div>
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
                                                <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{log.destinatario_numero}</td>
                                                <td className="px-4 py-2.5 text-gray-500 text-xs">{log.motivo_envio}</td>
                                                <td className="px-4 py-2.5">
                                                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                                                        log.status === 'ENVIADO'
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-red-100 text-red-700'
                                                    }`}>
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
