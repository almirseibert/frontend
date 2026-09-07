// src/contexts/AuthContext.js
import React, { useState, useEffect, useContext, createContext, useCallback, useMemo } from 'react';
import apiClient from '../services/apiClient'; 

const AuthContext = createContext(null);

// -----------------------------------------------------------------------------
// Snapshot de sessão — sobrevivência offline (Evidências de Campo, Fase 1 §3.1)
// -----------------------------------------------------------------------------
// Sem isto, qualquer falha de rede no boot (TypeError: Failed to fetch, típico do
// operador no mato) apagava o authToken e destruía a sessão. Guardamos o último
// getMe bem-sucedido e, quando o boot falha por REDE (não por 401/403), ressus-
// citamos a sessão do operador em modo degradado. Erro de auth de verdade
// continua deslogando.
const AUTH_SNAPSHOT_KEY = 'authUserSnapshot';
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias — cobre uma viagem de campo

const salvarSnapshot = (userData) => {
    try {
        localStorage.setItem(AUTH_SNAPSHOT_KEY, JSON.stringify({ user: userData, savedAt: Date.now() }));
    } catch { /* cota/modo privado: seguimos sem snapshot */ }
};

const lerSnapshot = () => {
    try {
        const raw = localStorage.getItem(AUTH_SNAPSHOT_KEY);
        if (!raw) return null;
        const snap = JSON.parse(raw);
        if (!snap || !snap.user || !snap.savedAt) return null;
        return snap;
    } catch { return null; }
};

const limparSnapshot = () => {
    try { localStorage.removeItem(AUTH_SNAPSHOT_KEY); } catch { /* ignore */ }
};

const ehOperador = (u) => {
    const r = (u?.user_type || u?.role || '').toLowerCase();
    return r === 'operador';
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [permissions, setPermissions] = useState({
        isOperator: false,
        isEditor: false,
        isAdmin: false,
        isViewer: false,
        isRH: false,
        isFaturamento: false,
        isAbastecimento: false,
        isOficina: false,
        isGerencia: false,
        canAccessRefueling: false,
    });
    const [loading, setLoading] = useState(true);
    // Sessão degradada: rodando a partir do snapshot local porque o servidor está
    // inacessível. Exposto no contexto para a UI mostrar a barra "Modo offline".
    const [degraded, setDegraded] = useState(false);
    const [degradedSince, setDegradedSince] = useState(null);

    const setUserAndPermissions = (userData) => {
        if (userData) {
            const role = userData.user_type || userData.role || 'viewer';
            const roleNormalized = role.toLowerCase();
            const canAccess = userData.podeAcessarAbastecimento || false;

            // Roles que têm 'refueling' em ROLE_PAGE_ACCESS — BD flag mantido para retrocompat
            const REFUELING_ROLES = ['admin', 'gerencia', 'abastecimento', 'editor'];
            const canAccessRefueling = canAccess || REFUELING_ROLES.includes(roleNormalized);

            // Override individual de páginas — garante array|null mesmo se vier como string JSON.
            let pagePermissions = userData.page_permissions;
            if (typeof pagePermissions === 'string') {
                try { pagePermissions = JSON.parse(pagePermissions); } catch { pagePermissions = null; }
            }
            if (!Array.isArray(pagePermissions)) pagePermissions = null;

            setUser({ ...userData, roleNormalized, page_permissions: pagePermissions });
            setPermissions({
                isOperator:      roleNormalized === 'operador',
                isEditor:        ['editor', 'admin'].includes(roleNormalized),
                isAdmin:         roleNormalized === 'admin',
                isViewer:        ['viewer', 'visualizador'].includes(roleNormalized),
                isRH:            roleNormalized === 'rh',
                isFaturamento:   roleNormalized === 'faturamento',
                isAbastecimento: roleNormalized === 'abastecimento',
                isOficina:       roleNormalized === 'oficina',
                isGerencia:      roleNormalized === 'gerencia',
                canAccessRefueling,
            });
        } else {
            setUser(null);
            setPermissions({
                isOperator: false,
                isEditor: false,
                isAdmin: false,
                isViewer: false,
                isRH: false,
                isFaturamento: false,
                isAbastecimento: false,
                isOficina: false,
                isGerencia: false,
                canAccessRefueling: false,
            });
        }
    };

    // Efeito para verificar o token no carregamento inicial
    useEffect(() => {
        const checkAuth = async () => {
            setLoading(true);
            const token = localStorage.getItem('authToken');
            if (token) {
                try {
                    const userData = await apiClient.getMe();
                    setUserAndPermissions(userData);
                    salvarSnapshot(userData);
                    setDegraded(false);
                    setDegradedSince(null);
                } catch (error) {
                    // Discriminador: erro HTTP carrega .status (apiClient.js:90);
                    // falha de rede propaga TypeError SEM .status.
                    const isAuthError = error?.status === 401 || error?.status === 403;
                    if (isAuthError) {
                        // Token realmente inválido/revogado — desloga de fato.
                        console.error("Token rejeitado pelo servidor (401/403). Deslogando.", error);
                        localStorage.removeItem('authToken');
                        localStorage.removeItem('refreshToken');
                        limparSnapshot();
                        setUserAndPermissions(null);
                    } else {
                        // Falha de REDE — NUNCA destruir a sessão nem apagar o token.
                        console.warn("Servidor inacessível no boot (falha de rede). Preservando sessão.", error);
                        const snap = lerSnapshot();
                        const fresco = !!snap && (Date.now() - snap.savedAt) < SNAPSHOT_MAX_AGE_MS;
                        // Fase 1: só o operador entra no caminho degradado — telas de
                        // gestor chamam dezenas de endpoints e degradariam mal.
                        if (fresco && ehOperador(snap.user)) {
                            setUserAndPermissions(snap.user);
                            setDegraded(true);
                            setDegradedSince(snap.savedAt);
                        } else {
                            // Gestor ou snapshot velho: cai na tela de login, mas o
                            // authToken PERMANECE — um reload já com rede recupera tudo.
                            setUserAndPermissions(null);
                        }
                    }
                }
            } else {
                setUserAndPermissions(null);
            }
            setLoading(false);
        };
        checkAuth();
    }, []);

    const login = useCallback(async (email, password) => {
        setLoading(true);
        try {
            const response = await apiClient.login(email, password);
            const token = response.token;

            if (token) {
                localStorage.setItem('authToken', token);
                if (response.refreshToken) {
                    localStorage.setItem('refreshToken', response.refreshToken);
                }
                const userData = await apiClient.getMe();
                setUserAndPermissions(userData);
                salvarSnapshot(userData);
                setDegraded(false);
                setDegradedSince(null);
                return { success: true, user: userData };
            } else {
                throw new Error("Token não recebido do servidor.");
            }
        } catch (error) {
            console.error("Erro no processo de login:", error);
            localStorage.removeItem('authToken');
            localStorage.removeItem('refreshToken');
            setUserAndPermissions(null);
            throw error;
        } finally {
            setLoading(false);
        }
    }, []);

    const logout = useCallback(() => {
        // Revoga o refresh token no servidor (best-effort) antes de limpar local.
        apiClient.logout?.();
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        limparSnapshot();
        setDegraded(false);
        setDegradedSince(null);
        setUserAndPermissions(null);
    }, []);

    // O apiClient dispara 'auth:logout' quando a renovação silenciosa falha
    // (refresh token expirado/revogado). Aqui limpamos o estado para a UI
    // voltar à tela de login sem o usuário ver erros soltos.
    useEffect(() => {
        const handleForcedLogout = () => setUserAndPermissions(null);
        window.addEventListener('auth:logout', handleForcedLogout);
        return () => window.removeEventListener('auth:logout', handleForcedLogout);
    }, []);

    const value = useMemo(() => ({
        user,
        ...permissions,
        loading,
        degraded,        // true = rodando do snapshot local, servidor inacessível
        degradedSince,   // timestamp (ms) do snapshot em uso — para a barra "dados de <data>"
        login,
        logout
    }), [user, permissions, loading, degraded, degradedSince, login, logout]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth deve ser usado dentro de um AuthProvider');
    }
    return context;
};