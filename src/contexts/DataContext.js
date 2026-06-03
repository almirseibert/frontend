// src/contexts/DataContext.js
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import apiClient from '../services/apiClient';

const DataContext = createContext(null);

// Recursos essenciais carregados no boot; lazy carregados sob demanda
const RESOURCE_DEFS = {
    vehicles:            { essential: true,  fetch: () => apiClient.getVehicles() },
    obras:               { essential: true,  fetch: () => apiClient.getObras() },
    employees:           { essential: true,  fetch: () => apiClient.getEmployees() },
    partners:            { essential: true,  fetch: () => apiClient.getPartners() },
    revisions:           { essential: false, fetch: () => apiClient.getRevisions() },
    expenses:            { essential: false, fetch: () => apiClient.getExpenses() },
    refuelings:          { essential: false, fetch: () => apiClient.getRefuelings() },
    comboioTransactions: { essential: false, fetch: () => apiClient.getComboioTransactions() },
    fines:               { essential: false, fetch: () => apiClient.getFines() },
    diarioDeBordoLogs:   { essential: false, fetch: () => apiClient.getDiarioDeBordo() },
    dailyWorkLogs:       { essential: false, fetch: () => apiClient.getDailyLogs('all') },
    orders:              { essential: false, fetch: () => apiClient.getAllOrders ? apiClient.getAllOrders() : apiClient.getOrders() },
};

// Mapeamento de evento socket → chave de recurso
const TARGET_TO_RESOURCE = {
    vehicles:   'vehicles',
    obras:      'obras',
    employees:  'employees',
    partners:   'partners',
    revisions:  'revisions',
    expenses:   'expenses',
    refuelings: 'refuelings',
    comboio:    'comboioTransactions',
    fines:      'fines',
    dailyWorkLogs: 'dailyWorkLogs',
    diarioDeBordo: 'diarioDeBordoLogs',
    orders:     'orders',
};

export const DataProvider = ({ children }) => {
    const [data, setData] = useState(() =>
        Object.fromEntries(Object.keys(RESOURCE_DEFS).map(k => [k, []]))
    );
    const [bootstrapLoading, setBootstrapLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [socket, setSocket] = useState(null);

    // loaded: set de chaves já carregadas; inFlight: promises em andamento
    const loadedRef = useRef(new Set());
    const inFlightRef = useRef({});

    const fetchResource = useCallback((key) => {
        if (inFlightRef.current[key]) return inFlightRef.current[key];

        const def = RESOURCE_DEFS[key];
        if (!def) return Promise.resolve();

        const promise = def.fetch()
            .then(result => {
                const value = Array.isArray(result) ? result : (result?.data || result || []);
                setData(prev => ({ ...prev, [key]: value }));
                loadedRef.current.add(key);
            })
            .catch(err => console.warn(`[DataContext] Erro ao carregar ${key}:`, err))
            .finally(() => { delete inFlightRef.current[key]; });

        inFlightRef.current[key] = promise;
        return promise;
    }, []);

    // Bootstrap: carrega apenas recursos essenciais
    useEffect(() => {
        const essentials = Object.entries(RESOURCE_DEFS)
            .filter(([, def]) => def.essential)
            .map(([key]) => key);

        Promise.all(essentials.map(fetchResource))
            .finally(() => setBootstrapLoading(false));
    }, [fetchResource]);

    // Socket.io
    useEffect(() => {
        const SOCKET_URL = (process.env.REACT_APP_API_URL || 'http://localhost:3001').replace('/api', '');
        const sock = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
        setSocket(sock);

        sock.on('server:sync', ({ targets }) => {
            if (!Array.isArray(targets)) return;
            setSyncing(true);
            const toRefresh = targets
                .map(t => TARGET_TO_RESOURCE[t])
                .filter(k => k && loadedRef.current.has(k));

            Promise.all(toRefresh.map(fetchResource))
                .finally(() => setSyncing(false));
        });

        return () => sock.disconnect();
    }, [fetchResource]);

    const ensure = useCallback((key) => {
        if (loadedRef.current.has(key)) return Promise.resolve();
        return fetchResource(key);
    }, [fetchResource]);

    const ensureAll = useCallback((keys) => {
        return Promise.all(keys.map(ensure));
    }, [ensure]);

    const refresh = useCallback((key) => {
        loadedRef.current.delete(key);
        return fetchResource(key);
    }, [fetchResource]);

    const invalidate = useCallback((key) => {
        loadedRef.current.delete(key);
    }, []);

    const reload = useCallback(() => {
        const loaded = [...loadedRef.current];
        loadedRef.current.clear();
        setSyncing(true);
        return Promise.all(loaded.map(fetchResource))
            .finally(() => setSyncing(false));
    }, [fetchResource]);

    const value = {
        ...data,
        bootstrapLoading,
        syncing,
        socket,
        ensure,
        ensureAll,
        refresh,
        invalidate,
        reload,
    };

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
    const ctx = useContext(DataContext);
    if (!ctx) throw new Error('useData must be used within DataProvider');
    return ctx;
};

export const useEnsureResources = (keys) => {
    const { ensureAll } = useData();
    useEffect(() => {
        ensureAll(keys);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
};
