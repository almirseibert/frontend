// src/hooks/usePersistedState.js
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

// useState que lembra o último valor no localStorage, por usuário.
// Uso típico: ordenação de listagens ("o que eu escolhi vira o meu padrão").
// A chave inclui o id do usuário para que duas pessoas no mesmo computador
// não troquem preferências. Valor ilegível, de outro tipo ou storage
// bloqueado (modo privado/cota) → cai no padrão sem quebrar a página.
const ler = (storageKey, defaultValue) => {
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw === null) return defaultValue;
        const parsed = JSON.parse(raw);
        if (typeof parsed !== typeof defaultValue) return defaultValue;
        return parsed;
    } catch { return defaultValue; }
};

const usePersistedState = (key, defaultValue) => {
    const { user } = useAuth();
    const userId = user?.id || user?.uid || 'anon';
    const storageKey = `pref:${userId}:${key}`;

    const [state, setState] = useState(() => ({ storageKey, value: ler(storageKey, defaultValue) }));

    // Usuário carregou depois do primeiro render (ou trocou de conta): relê a preferência dele.
    useEffect(() => {
        if (state.storageKey !== storageKey) {
            setState({ storageKey, value: ler(storageKey, defaultValue) });
        }
        // defaultValue fica de fora: costuma ser literal novo a cada render
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey, state.storageKey]);

    const setValue = useCallback((next) => {
        setState(prev => {
            const value = typeof next === 'function' ? next(prev.value) : next;
            try { localStorage.setItem(prev.storageKey, JSON.stringify(value)); } catch { /* cota/modo privado */ }
            return { ...prev, value };
        });
    }, []);

    return [state.value, setValue];
};

export default usePersistedState;
