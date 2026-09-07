// src/services/evidenciaQueue.js
// -----------------------------------------------------------------------------
// Fila de envio (outbox) das evidências — Fase 3 (§3.7).
// Modelada em Messenger.js (readOutbox/flush), com quatro endurecimentos porque
// foto é mais pesada e mais valiosa que mensagem de chat:
//   1. break na 1ª falha transitória (preserva ordem, não martela a rede);
//   2. backoff min(60s*2^(n-1), 30min) com jitter ±20% (evita avalanche);
//   3. permanente (400/403/422) ≠ transitório (5xx/rede): permanente vira item
//      visível e descartável, nunca tenta para sempre;
//   4. um upload por vez.
// A idempotência real vem do clientId (server: evidencia_registro.client_id UNIQUE).
// -----------------------------------------------------------------------------
import apiClient from './apiClient';
import { filaAdd, filaPut, filaGet, filaDelete, filaAll, pedirPersistencia } from './evidenciaDb';

const STATUS_PERMANENTE = [400, 403, 404, 422];
const BACKOFF_BASE_MS = 60 * 1000;
const BACKOFF_MAX_MS = 30 * 60 * 1000;

let processando = false;
let timer = null;
const ouvintes = new Set();

const jitter = (ms) => Math.round(ms * (0.8 + Math.random() * 0.4)); // ±20%
const backoff = (n) => jitter(Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, n - 1), BACKOFF_MAX_MS));

// ---- Pub/sub para badge e página da fila ----
export function assinarFila(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
async function notificar() {
    let itens = [];
    try { itens = await filaAll(); } catch { /* */ }
    const pendentes = itens.filter(i => i.status !== 'recusado').length;
    const payload = { pendentes, total: itens.length, itens };
    ouvintes.forEach(fn => { try { fn(payload); } catch { /* */ } });
    try { window.dispatchEvent(new CustomEvent('evidencias:fila-mudou', { detail: { pendentes, total: itens.length } })); } catch { /* */ }
}

// ---- Enfileirar uma captura ----
// item: { clientId, blob, obra_id, veiculo_id, tipo, data_ref, turno,
//         dev_latitude, dev_longitude, dev_precisao_m, dev_local_texto,
//         dev_capturado_em, dev_operador_nome, employee_id, leitura, observacao,
//         label (p/ exibir) }
export async function enfileirar(item) {
    const registro = {
        ...item,
        status: 'fila',
        tentativas: 0,
        proximaTentativa: 0,
        erroMsg: null,
        criadoEm: Date.now(),
        origem: navigator.onLine ? 'web_online' : 'web_offline',
    };
    await filaAdd(registro);
    pedirPersistencia();     // §3.9 — após a 1ª captura
    await notificar();
    processarFila();         // tenta já
    return registro.clientId;
}

function montarFormData(item) {
    const fd = new FormData();
    const nome = `ev-${item.clientId}.jpg`;
    fd.append('foto', item.blob, nome);
    fd.append('client_id', item.clientId);
    fd.append('obra_id', item.obra_id);
    fd.append('veiculo_id', item.veiculo_id);
    fd.append('tipo', item.tipo);
    if (item.data_ref) fd.append('data_ref', item.data_ref);
    if (item.turno) fd.append('turno', item.turno);
    if (item.dev_latitude != null) fd.append('dev_latitude', item.dev_latitude);
    if (item.dev_longitude != null) fd.append('dev_longitude', item.dev_longitude);
    if (item.dev_precisao_m != null) fd.append('dev_precisao_m', item.dev_precisao_m);
    if (item.dev_local_texto) fd.append('dev_local_texto', item.dev_local_texto);
    if (item.dev_capturado_em) fd.append('dev_capturado_em', item.dev_capturado_em);
    if (item.dev_operador_nome) fd.append('dev_operador_nome', item.dev_operador_nome);
    if (item.employee_id) fd.append('employee_id', item.employee_id);
    if (item.leitura != null && item.leitura !== '') fd.append('leitura', item.leitura);
    if (item.observacao) fd.append('observacao', item.observacao);
    fd.append('dev_origem', item.origem || 'web_online');
    return fd;
}

// ---- Processa a fila (um por vez, break no transitório) ----
export async function processarFila() {
    if (processando) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    processando = true;
    try {
        const agora = Date.now();
        const todos = (await filaAll())
            .filter(i => i.status !== 'recusado')
            .filter(i => (i.proximaTentativa || 0) <= agora)
            .sort((a, b) => a.criadoEm - b.criadoEm);

        for (const item of todos) {
            item.status = 'enviando';
            await filaPut(item); await notificar();
            try {
                await apiClient.enviarEvidencia(montarFormData(item));
                // Sucesso (inclui 200 idempotente com registro já existente) → sai da fila.
                await filaDelete(item.clientId);
                await notificar();
            } catch (err) {
                const status = err?.status;
                if (STATUS_PERMANENTE.includes(status)) {
                    // Permanente: para de tentar, vira item visível/descartável.
                    const atual = await filaGet(item.clientId);
                    if (atual) {
                        atual.status = 'recusado';
                        atual.erroMsg = err?.data?.error || err?.message || 'Recusado pelo servidor';
                        await filaPut(atual);
                    }
                    await notificar();
                    continue; // não bloqueia os demais
                }
                // Transitório (5xx / rede / 401): backoff com jitter e BREAK.
                const atual = await filaGet(item.clientId);
                if (atual) {
                    atual.tentativas = (atual.tentativas || 0) + 1;
                    atual.status = 'erro';
                    atual.erroMsg = err?.message || 'Sem conexão';
                    atual.proximaTentativa = Date.now() + backoff(atual.tentativas);
                    await filaPut(atual);
                }
                await notificar();
                break;
            }
        }
    } finally {
        processando = false;
    }
}

// ---- Descartar / reenviar manualmente (página da fila) ----
export async function descartarItem(clientId) { await filaDelete(clientId); await notificar(); }
export async function reenviarItem(clientId) {
    const it = await filaGet(clientId);
    if (it) { it.status = 'fila'; it.proximaTentativa = 0; it.erroMsg = null; await filaPut(it); await notificar(); }
    processarFila();
}
export async function snapshotFila() { try { return await filaAll(); } catch { return []; } }

// ---- Auto-flush: montagem, online, visibilitychange, timer 60s ----
export function iniciarAutoFlush() {
    const tick = () => processarFila();
    const onOnline = () => processarFila();
    const onVis = () => { if (document.visibilityState === 'visible') processarFila(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVis);
    if (!timer) timer = setInterval(tick, 60 * 1000);
    processarFila();
    notificar();
    return () => {
        window.removeEventListener('online', onOnline);
        document.removeEventListener('visibilitychange', onVis);
        if (timer) { clearInterval(timer); timer = null; }
    };
}
