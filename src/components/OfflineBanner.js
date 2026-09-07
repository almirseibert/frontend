// src/components/OfflineBanner.js
// Barra fixa de "Modo offline" — Evidências de Campo, Fase 1 (§3.1).
// Uma sessão degradada (rodando do snapshot local porque o servidor está
// inacessível) NUNCA pode parecer normal: o operador precisa saber que os dados
// que vê são de um instante anterior. Lê `degraded`/`degradedSince` do AuthContext.
import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const fmtQuando = (ts) => {
    if (!ts) return null;
    try {
        return new Date(ts).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        });
    } catch { return null; }
};

const OfflineBanner = () => {
    const { degraded, degradedSince } = useAuth();
    if (!degraded) return null;

    const quando = fmtQuando(degradedSince);

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
                background: '#1c1a17', color: '#f5f3ef',
                borderBottom: '3px solid #9E7A42',
                padding: '6px 12px', textAlign: 'center',
                fontSize: '13px', fontWeight: 600, lineHeight: 1.3,
            }}
        >
            <span style={{ color: '#e9d9bf' }}>● Modo offline</span>
            {quando ? ` — dados de ${quando}` : ' — sem conexão com o servidor'}
        </div>
    );
};

export default OfflineBanner;
