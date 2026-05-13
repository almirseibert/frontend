import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, Loader, Smartphone } from 'lucide-react';
import apiClient from '../services/apiClient';

const STATUS_CONFIG = {
    PRONTO:      { label: 'Conectado',     color: 'green',  Icon: Wifi },
    AUTENTICADO: { label: 'Autenticando…', color: 'yellow', Icon: Loader },
    QR_PRONTO:   { label: 'Aguardando QR', color: 'yellow', Icon: Smartphone },
    DESCONECTADO:{ label: 'Desconectado',  color: 'red',    Icon: WifiOff },
};

const Badge = ({ color, children }) => {
    const classes = {
        green:  'bg-green-100 text-green-800',
        yellow: 'bg-yellow-100 text-yellow-800',
        red:    'bg-red-100 text-red-800',
    };
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${classes[color] || classes.red}`}>
            {children}
        </span>
    );
};

const WhatsAppStatusPanel = ({ socket }) => {
    const [status, setStatus] = useState('DESCONECTADO');
    const [qr, setQr] = useState(null);
    const [loading, setLoading] = useState(false);
    const [restarting, setRestarting] = useState(false);

    const buscarStatus = async () => {
        setLoading(true);
        try {
            const data = await apiClient.whatsappGetStatus();
            setStatus(data.status);
            setQr(data.qr || null);
        } catch (_) {} finally {
            setLoading(false);
        }
    };

    const reiniciar = async () => {
        setRestarting(true);
        try {
            await apiClient.whatsappReiniciar();
        } catch (_) {} finally {
            setTimeout(() => setRestarting(false), 3000);
        }
    };

    useEffect(() => {
        buscarStatus();
    }, []);

    // Polling automático enquanto aguarda QR ou está desconectado
    useEffect(() => {
        if (status === 'PRONTO' || status === 'AUTENTICADO') return;
        const interval = setInterval(buscarStatus, 5000);
        return () => clearInterval(interval);
    }, [status]);

    useEffect(() => {
        if (!socket) return;

        const onStatus = ({ status: s }) => {
            setStatus(s);
            if (s !== 'QR_PRONTO') setQr(null);
        };
        const onQr = ({ qr: q }) => {
            setStatus('QR_PRONTO');
            setQr(q);
        };

        socket.on('whatsapp:status', onStatus);
        socket.on('whatsapp:qr', onQr);

        return () => {
            socket.off('whatsapp:status', onStatus);
            socket.off('whatsapp:qr', onQr);
        };
    }, [socket]);

    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.DESCONECTADO;
    const { label, color, Icon } = cfg;

    return (
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <Smartphone size={20} className="text-green-600" />
                    WhatsApp
                </h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={buscarStatus}
                        disabled={loading}
                        className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Atualizar status"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={reiniciar}
                        disabled={restarting}
                        className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                        {restarting ? 'Reiniciando…' : 'Reiniciar'}
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-3 mb-4">
                <Badge color={color}>
                    <Icon size={14} className={status === 'AUTENTICADO' ? 'animate-spin' : ''} />
                    {label}
                </Badge>
            </div>

            {status === 'QR_PRONTO' && qr && (
                <div className="mt-4 flex flex-col items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <p className="text-sm text-gray-600 text-center">
                        Abra o WhatsApp no celular → <strong>Dispositivos conectados</strong> → <strong>Conectar dispositivo</strong> e escaneie o QR abaixo:
                    </p>
                    <img
                        src={qr}
                        alt="QR Code WhatsApp"
                        className="w-56 h-56 rounded-lg border border-gray-300"
                    />
                </div>
            )}

            {status === 'DESCONECTADO' && (
                <p className="text-sm text-gray-500 mt-1">
                    O serviço de WhatsApp está desconectado. Clique em <strong>Reiniciar</strong> para tentar reconectar.
                </p>
            )}

            {status === 'PRONTO' && (
                <p className="text-sm text-green-700 mt-1">
                    Serviço ativo. Mensagens automáticas do sistema estão sendo enviadas normalmente.
                </p>
            )}
        </div>
    );
};

export default WhatsAppStatusPanel;
