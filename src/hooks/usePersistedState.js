// src/hooks/usePersistedState.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../services/apiClient';

// useState que lembra o último valor por usuário — "o que eu escolhi vira o
// meu padrão" (ex.: ordenação de listagens).
// Fonte da verdade: users.ui_prefs no servidor (PUT /users/me/settings mescla
// por chave), então a preferência acompanha o usuário em qualquer aparelho.
// O localStorage é só cache: a tela abre já na ordem certa, sem esperar a API,
// e continua funcionando offline. Valor de outro tipo, ilegível ou storage
// bloqueado → cai no padrão sem quebrar a página.

// Um GET de settings por usuário na sessão, compartilhado entre as páginas.
const prefsCache = new Map(); // userId → Promise<uiPrefs>
const carregarPrefs = (userId) => {
    if (!prefsCache.has(userId)) {
        prefsCache.set(userId, apiClient.getMySettings()
            .then((s) => s?.uiPrefs || {})
            .catch(() => { prefsCache.delete(userId); return {}; }));
    }
    return prefsCache.get(userId);
};

const valido = (v, defaultValue) => v !== undefined && v !== null && typeof v === typeof defaultValue;

const lerLocal = (storageKey, defaultValue) => {
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw === null) return defaultValue;
        const parsed = JSON.parse(raw);
        return valido(parsed, defaultValue) ? parsed : defaultValue;
    } catch { return defaultValue; }
};

const gravarLocal = (storageKey, value) => {
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* cota/modo privado */ }
};

const usePersistedState = (key, defaultValue) => {
    const { user } = useAuth();
    const userId = user?.id || user?.uid || null;
    const storageKey = `pref:${userId || 'anon'}:${key}`;

    const [state, setState] = useState(() => ({ storageKey, value: lerLocal(storageKey, defaultValue) }));
    // Se o usuário já escolheu algo nesta tela, a resposta do servidor não sobrescreve.
    const alteradoRef = useRef(false);

    // Usuário carregou depois do primeiro render (ou trocou de conta): relê o cache dele.
    useEffect(() => {
        if (state.storageKey !== storageKey) {
            alteradoRef.current = false;
            setState({ storageKey, value: lerLocal(storageKey, defaultValue) });
        }
        // defaultValue fica de fora: costuma ser literal novo a cada render
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey, state.storageKey]);

    // Servidor manda: aplica o ui_prefs e atualiza o cache local.
    useEffect(() => {
        if (!userId) return undefined;
        let cancelled = false;
        carregarPrefs(userId).then((prefs) => {
            const remoto = prefs[key];
            if (cancelled || alteradoRef.current || !valido(remoto, defaultValue)) return;
            gravarLocal(storageKey, remoto);
            setState({ storageKey, value: remoto });
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, key, storageKey]);

    const setValue = useCallback((next) => {
        alteradoRef.current = true;
        setState(prev => {
            const value = typeof next === 'function' ? next(prev.value) : next;
            gravarLocal(prev.storageKey, value);
            return { ...prev, value };
        });
    }, []);

    // Envia ao servidor só quando o usuário escolheu (não ao carregar).
    const ultimoEnviadoRef = useRef(null);
    useEffect(() => {
        if (!userId || !alteradoRef.current) return;
        const json = JSON.stringify(state.value);
        if (json === ultimoEnviadoRef.current) return;
        ultimoEnviadoRef.current = json;
        prefsCache.get(userId)?.then((prefs) => { prefs[key] = state.value; });
        apiClient.updateMySettings({ uiPrefs: { [key]: state.value } }).catch(() => {});
    }, [userId, key, state.value]);

    return [state.value, setValue];
};

export default usePersistedState;
