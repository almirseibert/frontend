// src/components/SWUpdateBanner.js
// Banner "Nova versão — atualizar" — Evidências de Campo, Fase 1 (§3.2).
// A nova versão do app fica em espera até o usuário aceitar. Assim nunca trocamos
// o bundle sob um formulário de captura pela metade (o que perderia a foto).
import React, { useEffect, useState } from 'react';
import { applyUpdate } from '../serviceWorkerRegistration';

const SWUpdateBanner = () => {
    const [disponivel, setDisponivel] = useState(false);

    useEffect(() => {
        const onUpdate = () => setDisponivel(true);
        window.addEventListener('sw:update-available', onUpdate);
        return () => window.removeEventListener('sw:update-available', onUpdate);
    }, []);

    if (!disponivel) return null;

    return (
        <div
            role="alert"
            style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
                background: '#1c1a17', color: '#f5f3ef',
                borderTop: '3px solid #9E7A42',
                padding: '10px 14px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 12, fontSize: '14px', fontWeight: 600,
            }}
        >
            <span>Nova versão disponível.</span>
            <button
                onClick={applyUpdate}
                style={{
                    background: '#9E7A42', color: '#fff', border: 'none',
                    borderRadius: 8, padding: '6px 16px', fontWeight: 700, cursor: 'pointer',
                }}
            >
                Atualizar
            </button>
        </div>
    );
};

export default SWUpdateBanner;
