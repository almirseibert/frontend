// src/services/evidenciaDb.js
// -----------------------------------------------------------------------------
// IndexedDB da fila offline de evidências — Evidências de Campo, Fase 3 (§3.6).
// Primeiro uso de IndexedDB no projeto: necessário porque fotos são Blob e não
// cabem em localStorage. API crua (sem idb/dexie — o bundle já é grande).
// Três stores: `fila` (uploads pendentes), `escopo` (pacote do operador),
// `meta` (chave/valor diversos). Chave da fila: `clientId` (crypto.randomUUID,
// gerado na captura e NUNCA regenerado) — casa com evidencia_registro.client_id
// UNIQUE no servidor para tornar a entrega idempotente.
// -----------------------------------------------------------------------------
const DB_NAME = 'mak_evidencias';
const DB_VERSION = 1;

let _dbPromise = null;

function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        let req;
        try { req = indexedDB.open(DB_NAME, DB_VERSION); }
        catch (e) { return reject(e); }
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('fila')) {
                const s = db.createObjectStore('fila', { keyPath: 'clientId' });
                s.createIndex('status', 'status', { unique: false });
                s.createIndex('criadoEm', 'criadoEm', { unique: false });
            }
            if (!db.objectStoreNames.contains('escopo')) db.createObjectStore('escopo', { keyPath: 'k' });
            if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return _dbPromise;
}

async function tx(store, mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const os = t.objectStore(store);
        let out;
        Promise.resolve(fn(os)).then((v) => { out = v; }).catch(reject);
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
    });
}

const reqToPromise = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// ---- Fila ----
export const filaAdd = (item) => tx('fila', 'readwrite', (os) => reqToPromise(os.add(item)));
export const filaPut = (item) => tx('fila', 'readwrite', (os) => reqToPromise(os.put(item)));
export const filaGet = (clientId) => tx('fila', 'readonly', (os) => reqToPromise(os.get(clientId)));
export const filaDelete = (clientId) => tx('fila', 'readwrite', (os) => reqToPromise(os.delete(clientId)));
export const filaAll = () => tx('fila', 'readonly', (os) => reqToPromise(os.getAll()));
export const filaCount = () => tx('fila', 'readonly', (os) => reqToPromise(os.count()));

// ---- Escopo (pacote do operador) ----
export const escopoSet = (data) => tx('escopo', 'readwrite', (os) => reqToPromise(os.put({ k: 'atual', savedAt: Date.now(), data })));
export const escopoGet = async () => {
    const row = await tx('escopo', 'readonly', (os) => reqToPromise(os.get('atual')));
    return row || null;
};

// ---- Meta ----
export const metaSet = (k, v) => tx('meta', 'readwrite', (os) => reqToPromise(os.put({ k, v })));
export const metaGet = async (k) => {
    const row = await tx('meta', 'readonly', (os) => reqToPromise(os.get(k)));
    return row ? row.v : null;
};

// Estimativa de armazenamento (para a barra de cota, §3.9).
export async function estimativaStorage() {
    try {
        if (navigator.storage?.estimate) {
            const { usage, quota } = await navigator.storage.estimate();
            return { usage, quota, pct: quota ? usage / quota : 0 };
        }
    } catch { /* */ }
    return null;
}

// Pede persistência do storage após a 1ª captura (§3.9) — reduz o descarte.
export async function pedirPersistencia() {
    try {
        if (navigator.storage?.persist && navigator.storage?.persisted) {
            const jah = await navigator.storage.persisted();
            if (!jah) return await navigator.storage.persist();
            return true;
        }
    } catch { /* */ }
    return false;
}

export { openDb };
