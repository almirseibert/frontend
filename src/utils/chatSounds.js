// utils/chatSounds.js
// Sons do mensageiro sintetizados via Web Audio API — sem arquivos de áudio,
// sem risco de direitos autorais (os sons originais do MSN são protegidos).
// Preferências de notificação (por evento, DND, horário de silêncio, mute por
// conversa) ficam em localStorage e são sincronizadas com o servidor.

const STORE_KEY = 'chatNotifPrefs';
const LEGACY_KEY = 'chatSoundPrefs'; // formato antigo { ding, nudge, presence }

// Eventos notificáveis e seu som padrão.
const DEFAULT_EVENTS = {
    mensagem: { notify: true, sound: 'ding' },
    nudge:    { notify: true, sound: 'nudge' },
    entrada:  { notify: true, sound: 'online' },
    saida:    { notify: true, sound: 'offline' },
    mencao:   { notify: true, sound: 'mention' },
};

const defaultPrefs = {
    events: DEFAULT_EVENTS,
    dnd: false,             // "Não perturbe" — silencia todos os sons
    quietStart: '',         // horário de silêncio (HH:MM) — vazio = desligado
    quietEnd: '',
    mutedPeers: [],         // ids de conversas silenciadas
    previewText: true,      // mostrar prévia do texto nas notificações
};

// Migra o formato antigo (3 toggles) para o novo, se existir.
function migrateLegacy() {
    try {
        const raw = localStorage.getItem(LEGACY_KEY);
        if (!raw) return null;
        const old = JSON.parse(raw);
        const events = { ...DEFAULT_EVENTS };
        events.mensagem = { ...events.mensagem, notify: old.ding !== false };
        events.nudge = { ...events.nudge, notify: old.nudge !== false };
        events.entrada = { ...events.entrada, notify: old.presence !== false };
        events.saida = { ...events.saida, notify: old.presence !== false };
        return { ...defaultPrefs, events };
    } catch { return null; }
}

export function getNotifPrefs() {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            return {
                ...defaultPrefs,
                ...p,
                events: { ...DEFAULT_EVENTS, ...(p.events || {}) },
                mutedPeers: p.mutedPeers || [],
            };
        }
        const migrated = migrateLegacy();
        if (migrated) { localStorage.setItem(STORE_KEY, JSON.stringify(migrated)); return migrated; }
        return { ...defaultPrefs };
    } catch {
        return { ...defaultPrefs };
    }
}

export function setNotifPrefs(prefs) {
    try {
        const next = { ...getNotifPrefs(), ...prefs };
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
        return next;
    } catch { return getNotifPrefs(); }
}

// ── Mute por conversa ──
export function isPeerMuted(peerId) {
    return (getNotifPrefs().mutedPeers || []).some(p => String(p) === String(peerId));
}
export function togglePeerMute(peerId) {
    const prefs = getNotifPrefs();
    const list = prefs.mutedPeers || [];
    const has = list.some(p => String(p) === String(peerId));
    const mutedPeers = has ? list.filter(p => String(p) !== String(peerId)) : [...list, String(peerId)];
    return setNotifPrefs({ mutedPeers });
}

// ── AudioContext ──
let ctx = null;
function getCtx() {
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
}
export function unlockAudio() {
    const c = getCtx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function tone(freq, startAt, duration, { type = 'sine', gain = 0.12 } = {}) {
    const c = getCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime + startAt);
    g.gain.setValueAtTime(0.0001, c.currentTime + startAt);
    g.gain.exponentialRampToValueAtTime(gain, c.currentTime + startAt + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + startAt + duration);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(c.currentTime + startAt);
    osc.stop(c.currentTime + startAt + duration + 0.02);
}

// ── Catálogo de sons nomeados ──
const SOUNDS = {
    none: () => {},
    ding: () => { tone(660, 0, 0.12, { gain: 0.14 }); tone(880, 0.11, 0.16, { gain: 0.14 }); },
    chime: () => { tone(784, 0, 0.14, { type: 'triangle', gain: 0.12 }); tone(1046, 0.12, 0.18, { type: 'triangle', gain: 0.12 }); },
    pop: () => { tone(440, 0, 0.06, { type: 'sine', gain: 0.16 }); tone(620, 0.05, 0.08, { type: 'sine', gain: 0.14 }); },
    knock: () => { tone(200, 0, 0.08, { type: 'square', gain: 0.10 }); tone(200, 0.14, 0.08, { type: 'square', gain: 0.10 }); },
    blip: () => { tone(1000, 0, 0.05, { type: 'sine', gain: 0.12 }); },
    nudge: () => { tone(180, 0, 0.14, { type: 'square', gain: 0.10 }); tone(140, 0.13, 0.14, { type: 'square', gain: 0.10 }); tone(180, 0.26, 0.18, { type: 'square', gain: 0.10 }); },
    mention: () => { tone(880, 0, 0.10, { type: 'sine', gain: 0.15 }); tone(1174, 0.10, 0.12, { type: 'sine', gain: 0.15 }); tone(880, 0.22, 0.14, { type: 'sine', gain: 0.13 }); },
    online: () => { tone(523, 0, 0.10, { type: 'triangle', gain: 0.10 }); tone(784, 0.10, 0.16, { type: 'triangle', gain: 0.10 }); },
    offline: () => { tone(659, 0, 0.10, { type: 'triangle', gain: 0.09 }); tone(392, 0.10, 0.16, { type: 'triangle', gain: 0.09 }); },
};

// Opções exibidas no seletor de som (Configurações).
export const SOUND_OPTIONS = [
    { id: 'ding', label: 'Ding' },
    { id: 'chime', label: 'Sino' },
    { id: 'pop', label: 'Pop' },
    { id: 'knock', label: 'Batida' },
    { id: 'blip', label: 'Blip' },
    { id: 'mention', label: 'Menção' },
    { id: 'nudge', label: 'Nudge' },
    { id: 'online', label: 'Entrada' },
    { id: 'offline', label: 'Saída' },
    { id: 'none', label: 'Silencioso' },
];

// Pré-escuta um som (ignora silêncio/DND).
export function previewSound(soundId) {
    unlockAudio();
    (SOUNDS[soundId] || SOUNDS.ding)();
}

// Verifica se estamos em período de silêncio (DND, status ocupado ou dentro do
// horário de silêncio configurado).
function isSilenced(myStatus) {
    const prefs = getNotifPrefs();
    if (prefs.dnd) return true;
    if (myStatus === 'ocupado') return true;
    const { quietStart, quietEnd } = prefs;
    if (quietStart && quietEnd && quietStart !== quietEnd) {
        const now = new Date();
        const cur = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = quietStart.split(':').map(Number);
        const [eh, em] = quietEnd.split(':').map(Number);
        const s = sh * 60 + sm, e = eh * 60 + em;
        const inRange = s < e ? (cur >= s && cur < e) : (cur >= s || cur < e); // trata virada de dia
        if (inRange) return true;
    }
    return false;
}

// Decide se um evento deve notificar (som), respeitando prefs/silêncio/mute.
export function shouldNotify(eventKey, { myStatus, peerId } = {}) {
    const prefs = getNotifPrefs();
    const ev = prefs.events?.[eventKey];
    if (!ev || !ev.notify) return false;
    if (isSilenced(myStatus)) return false;
    if (peerId && isPeerMuted(peerId)) return false;
    return true;
}

// Toca o som configurado para um evento (se permitido).
export function playFor(eventKey, opts = {}) {
    if (!shouldNotify(eventKey, opts)) return;
    const ev = getNotifPrefs().events?.[eventKey];
    const fn = SOUNDS[ev?.sound];
    if (fn) fn();
}
