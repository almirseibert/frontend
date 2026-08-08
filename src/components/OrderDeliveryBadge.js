// components/OrderDeliveryBadge.js
// Mostra se a ordem de abastecimento realmente chegou ao posto.
//
// Contexto: o envio ao posto é assíncrono (o backend responde 201 antes de
// tentar entregar). Sem este indicador, uma ordem que falhou no WhatsApp fica
// visualmente idêntica a uma entregue — foi assim que ordens deixaram de
// chegar aos postos sem ninguém perceber.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Clock, Ban, Send, Loader } from 'lucide-react';
import apiClient from '../services/apiClient';

// Aparência por resumo devolvido pelo backend.
export const DELIVERY_UI = {
    entregue:  { label: 'Enviada ao posto',    color: '#166534', bg: '#dcfce7', border: '#bbf7d0', Icon: CheckCircle2 },
    parcial:   { label: 'Entrega parcial',     color: '#92400e', bg: '#fef3c7', border: '#fde68a', Icon: AlertTriangle },
    falha:     { label: 'NÃO enviada',         color: '#b03828', bg: '#fdf0ec', border: '#e8c8bc', Icon: XCircle },
    sem_canal: { label: 'Sem canal de envio',  color: '#6b21a8', bg: '#f3e8ff', border: '#e9d5ff', Icon: Ban },
    pendente:  { label: 'Enviando...',         color: '#9a8a78', bg: '#faf9f7', border: '#f0ebe3', Icon: Clock },
};

// Busca o status de entrega de um conjunto de ordens.
// Recarrega quando `refreshKey` muda (ex.: após um evento de socket).
export const useOrderDeliveryStatus = (authNumbers, refreshKey = 0) => {
    const [statusMap, setStatusMap] = useState({});
    const [loading, setLoading] = useState(false);

    // Chave estável para não refetchar a cada render por causa da identidade do array.
    const chave = useMemo(
        () => (authNumbers || []).filter(n => n != null).map(Number).sort((a, b) => a - b).join(','),
        [authNumbers]
    );

    const carregar = useCallback(async () => {
        if (!chave) { setStatusMap({}); return; }
        setLoading(true);
        try {
            const nums = chave.split(',');
            setStatusMap(await apiClient.getOrderDeliveryStatus(nums));
        } catch (e) {
            // Falha ao consultar o status não pode quebrar a listagem de ordens.
            console.warn('[OrderDelivery] falha ao carregar status de entrega:', e.message);
        } finally {
            setLoading(false);
        }
    }, [chave]);

    useEffect(() => { carregar(); }, [carregar, refreshKey]);

    return { statusMap, loading, recarregar: carregar };
};

// Badge compacto. `info` é a entrada do statusMap para aquela ordem.
export const OrderDeliveryBadge = ({ info, compact = false }) => {
    // Ordem sem nenhum registro: emitida antes desta funcionalidade existir,
    // ou o registro ainda não foi gravado. Não afirmar nada é melhor que mentir.
    if (!info) return null;

    const ui = DELIVERY_UI[info.resumo] || DELIVERY_UI.pendente;
    const { Icon } = ui;

    const detalhe = (info.canais || [])
        .filter(c => c.status !== 'DESATIVADO')
        .map(c => `${c.canal}: ${c.status}${c.erro ? ` — ${c.erro}` : ''}`)
        .join('\n');

    return (
        <span
            title={detalhe || ui.label}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: compact ? 10 : 11, fontWeight: 700,
                padding: compact ? '1px 6px' : '2px 8px', borderRadius: 9999,
                background: ui.bg, color: ui.color, border: `1px solid ${ui.border}`,
                whiteSpace: 'nowrap',
            }}
        >
            <Icon size={compact ? 11 : 12} />
            {compact ? null : ui.label}
        </span>
    );
};

// Botão de reenvio — só aparece quando há de fato o que reenviar.
export const ReenviarOrdemButton = ({ info, onDone, setAlertMessage }) => {
    const [enviando, setEnviando] = useState(false);
    if (!info || info.resumo === 'entregue') return null;

    const handle = async () => {
        setEnviando(true);
        try {
            const r = await apiClient.reenviarOrdem(info.authNumber);
            const falhas = (r.resultados || []).filter(x => !x.ok);
            setAlertMessage?.(
                falhas.length === 0
                    ? `Ordem #${info.authNumber} reenviada com sucesso.`
                    : `Reenvio parcial da ordem #${info.authNumber}. Pendências: ${falhas.map(f => `${f.canal} (${f.motivo})`).join('; ')}`
            );
            onDone?.();
        } catch (e) {
            setAlertMessage?.(`Falha ao reenviar a ordem #${info.authNumber}: ${e.message}`);
        } finally {
            setEnviando(false);
        }
    };

    return (
        <button
            onClick={handle}
            disabled={enviando}
            title="Reenviar esta ordem ao posto"
            className="p-1.5 text-gray-400 hover:text-green-600 rounded hover:bg-green-50 disabled:opacity-50"
        >
            {enviando ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
    );
};

export default OrderDeliveryBadge;
