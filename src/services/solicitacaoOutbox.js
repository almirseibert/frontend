// src/services/solicitacaoOutbox.js
// -----------------------------------------------------------------------------
// Fila offline de solicitações (abastecimento/comboio) — Evidências de Campo,
// Fase 8 (§12). Hoje a página do operador mantém `isOffline` e mostra "Salvo
// localmente", mas NADA era salvo — o envio estourava no catch e a foto se perdia.
// Este outbox torna aquilo verdadeiro, reusando o mesmo endurecimento da fila de
// evidências (§3.7): um por vez, break no transitório, backoff+jitter,
// permanente (400/403/422) ≠ transitório. A idempotência vem do clientId.
//
// GOTCHA do plano: uma solicitação enfileirada e enviada horas depois pode bater
// na TRAVA DE REGRESSÃO DE LEITURA (o horímetro do veículo já avançou). O servidor
// devolve 400 com `campo`; aqui isso é PERMANENTE → o item vira "recusado",
// visível e descartável, em vez de tentar para sempre.
// -----------------------------------------------------------------------------
const DB_NAME = 'mak_solicitacoes';
const DB_VERSION = 1;
const STATUS_PERMANENTE = [400, 403, 404, 422];
const BACKOFF_BASE_MS = 60 * 1000;
const BACKOFF_MAX_MS = 30 * 60 * 1000;

let _dbPromise = null;
let processando = false;
let timer = null;
const ouvintes = new Set();

function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        let req;
        try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('fila')) db.createObjectStore('fila', { keyPath: 'clientId' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return _dbPromise;
}
async function tx(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const t = db.transaction('fila', mode); const os = t.objectStore('fila');
        let out; Promise.resolve(fn(os)).then(v => { out = v; }).catch(reject);
        t.oncomplete = () => resolve(out); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
    });
}
const P = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const put = (i) => tx('readwrite', os => P(os.put(i)));
const del = (id) => tx('readwrite', os => P(os.delete(id)));
const get = (id) => tx('readonly', os => P(os.get(id)));
const all = () => tx('readonly', os => P(os.getAll()));

const jitter = (ms) => Math.round(ms * (0.8 + Math.random() * 0.4));
const backoff = (n) => jitter(Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, n - 1), BACKOFF_MAX_MS));

export function assinarSolic(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
async function notificar() {
    let itens = []; try { itens = await all(); } catch { /* */ }
    const pendentes = itens.filter(i => i.status !== 'recusado').length;
    ouvintes.forEach(fn => { try { fn({ pendentes, total: itens.length, itens }); } catch { /* */ } });
    try { window.dispatchEvent(new CustomEvent('solic:fila-mudou', { detail: { pendentes, total: itens.length } })); } catch { /* */ }
}

// Quebra um FormData em { fields, files } persistíveis no IndexedDB.
export function splitFormData(fd) {
    const fields = {}; const files = [];
    for (const [k, v] of fd.entries()) {
        if (v instanceof Blob) files.push({ key: k, blob: v, name: v.name || `${k}.jpg` });
        else fields[k] = v;
    }
    return { fields, files };
}

// Enfileira uma solicitação (endpoint + FormData já montado).
export async function enfileirarSolic(endpoint, formData, { label, method = 'POST' } = {}) {
    const { fields, files } = splitFormData(formData);
    const item = {
        clientId: crypto.randomUUID(),
        endpoint, method, fields, files, label: label || endpoint,
        status: 'fila', tentativas: 0, proximaTentativa: 0, erroMsg: null, criadoEm: Date.now(),
    };
    await put(item); await notificar(); processarSolic();
    return item.clientId;
}

function montarFormData(item) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(item.fields || {})) fd.append(k, v);
    for (const f of item.files || []) fd.append(f.key, f.blob, f.name);
    return fd;
}

// Envia via fetch direto (o apiClient injeta o header; aqui montamos igual).
async function enviar(item) {
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
    const token = localStorage.getItem('authToken');
    const res = await fetch(`${API_URL}${item.endpoint}`, {
        method: item.method || 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: montarFormData(item),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = new Error(data.error || data.message || `Erro ${res.status}`);
        err.status = res.status; err.data = data;
        throw err;
    }
    return res.status === 204 ? null : res.json().catch(() => ({}));
}

export async function processarSolic() {
    if (processando) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    processando = true;
    try {
        const agora = Date.now();
        const fila = (await all())
            .filter(i => i.status !== 'recusado')
            .filter(i => (i.proximaTentativa || 0) <= agora)
            .sort((a, b) => a.criadoEm - b.criadoEm);
        for (const item of fila) {
            item.status = 'enviando'; await put(item); await notificar();
            try {
                await enviar(item);
                await del(item.clientId); await notificar();
            } catch (err) {
                const cur = await get(item.clientId); if (!cur) continue;
                if (STATUS_PERMANENTE.includes(err?.status)) {
                    cur.status = 'recusado';
                    cur.erroMsg = err?.data?.error || err?.message || 'Recusado pelo servidor';
                    await put(cur); await notificar(); continue;
                }
                cur.tentativas = (cur.tentativas || 0) + 1;
                cur.status = 'erro'; cur.erroMsg = err?.message || 'Sem conexão';
                cur.proximaTentativa = Date.now() + backoff(cur.tentativas);
                await put(cur); await notificar(); break;
            }
        }
    } finally { processando = false; }
}

export async function snapshotSolic() { try { return await all(); } catch { return []; } }
export async function descartarSolic(clientId) { await del(clientId); await notificar(); }
export async function reenviarSolic(clientId) {
    const it = await get(clientId);
    if (it) { it.status = 'fila'; it.proximaTentativa = 0; it.erroMsg = null; await put(it); await notificar(); }
    processarSolic();
}

export function iniciarAutoFlushSolic() {
    const onOnline = () => processarSolic();
    const onVis = () => { if (document.visibilityState === 'visible') processarSolic(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVis);
    if (!timer) timer = setInterval(() => processarSolic(), 60 * 1000);
    processarSolic(); notificar();
    return () => {
        window.removeEventListener('online', onOnline);
        document.removeEventListener('visibilitychange', onVis);
        if (timer) { clearInterval(timer); timer = null; }
    };
}
