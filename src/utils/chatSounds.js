// utils/chatSounds.js
// Sons do mensageiro sintetizados via Web Audio API — sem arquivos de áudio,
// sem risco de direitos autorais (os sons originais do MSN são protegidos).
// Cada função respeita os toggles salvos em localStorage (definidos nas
// Configurações). O AudioContext é criado no primeiro gesto do usuário.

const STORE_KEY = 'chatSoundPrefs';

// Preferências padrão — todos ligados.
const defaultPrefs = { ding: true, nudge: true, presence: true };

export function getSoundPrefs() {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        return raw ? { ...defaultPrefs, ...JSON.parse(raw) } : { ...defaultPrefs };
    } catch {
        return { ...defaultPrefs };
    }
}

export function setSoundPrefs(prefs) {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ ...getSoundPrefs(), ...prefs }));
    } catch { /* ignore */ }
}

let ctx = null;
function getCtx() {
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    // Navegadores suspendem o contexto até um gesto; tenta retomar.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
}

// Deve ser chamado a partir de um handler de clique/tecla para "destravar" o áudio.
export function unlockAudio() {
    const c = getCtx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
}

// Toca uma nota simples.
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

// Ding — nova mensagem (dois tons ascendentes curtos).
export function playDing() {
    if (!getSoundPrefs().ding) return;
    tone(660, 0, 0.12, { type: 'sine', gain: 0.14 });
    tone(880, 0.11, 0.16, { type: 'sine', gain: 0.14 });
}

// Nudge — chamar atenção (buzz grave e estridente, tipo "chacoalhada").
export function playNudge() {
    if (!getSoundPrefs().nudge) return;
    tone(180, 0, 0.14, { type: 'square', gain: 0.10 });
    tone(140, 0.13, 0.14, { type: 'square', gain: 0.10 });
    tone(180, 0.26, 0.18, { type: 'square', gain: 0.10 });
}

// Contato ficou online (subida alegre).
export function playOnline() {
    if (!getSoundPrefs().presence) return;
    tone(523, 0, 0.10, { type: 'triangle', gain: 0.10 });
    tone(784, 0.10, 0.16, { type: 'triangle', gain: 0.10 });
}

// Contato ficou offline (descida).
export function playOffline() {
    if (!getSoundPrefs().presence) return;
    tone(659, 0, 0.10, { type: 'triangle', gain: 0.09 });
    tone(392, 0.10, 0.16, { type: 'triangle', gain: 0.09 });
}
