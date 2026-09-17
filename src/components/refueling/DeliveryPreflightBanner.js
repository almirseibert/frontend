// components/refueling/DeliveryPreflightBanner.js
//
// Pré-checagem do canal de envio da ordem ao posto. Quem emite precisa saber
// ANTES de emitir que o WhatsApp está fora — senão gera a ordem achando que o
// posto foi avisado, e não foi.
//
// Extraído do RefuelingOrderModal para ser usado também na ordem de entrada do
// comboio (ComboioEntradaOrderModal).
import React, { useEffect, useState } from 'react';
import { Info, WifiOff } from 'lucide-react';

export const useDeliveryPreflight = (apiClient) => {
    const [preflight, setPreflight] = useState(null);
    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const r = await apiClient.getOrderDeliveryPreflight();
                if (vivo) setPreflight(r);
            } catch (_) { /* indisponível: não bloqueia a emissão */ }
        })();
        return () => { vivo = false; };
    }, [apiClient]);
    return preflight;
};

const DeliveryPreflightBanner = ({ preflight }) => {
    if (!preflight) return null;

    if (!preflight.whatsappPronto) {
        return (
            <div className="flex items-start gap-2 p-2 rounded-md border-2 border-red-500 bg-red-50 text-red-800 text-[11px] font-bold leading-snug">
                <WifiOff size={14} className="mt-0.5 flex-shrink-0 text-red-700"/>
                <span>
                    ⚠️ WHATSAPP DESCONECTADO (status: {preflight.whatsappStatus}). A ordem será registrada, mas
                    <u> NÃO chegará ao posto</u> agora. O sistema reenvia sozinho assim que a conexão voltar —
                    acompanhe o selo de envio na lista de ordens ou avise o posto por outro meio.
                </span>
            </div>
        );
    }

    if (preflight.pendencias48h > 0) {
        return (
            <div className="flex items-start gap-2 p-1.5 bg-amber-50 border border-amber-300 text-amber-900 rounded text-[10px] font-bold leading-snug">
                <Info size={12} className="mt-0.5 flex-shrink-0"/>
                <span>
                    {preflight.pendencias48h} ordem(ns) das últimas 48h ainda não foram entregues ao posto. Verifique na lista de ordens.
                </span>
            </div>
        );
    }

    return null;
};

export default DeliveryPreflightBanner;
