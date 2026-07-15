import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { MessageSquare, X, ChevronLeft, Send, Zap, Circle, Minus, Clock, AlertCircle, Reply, Pencil, Trash2, Pin, Smile, Search, MoreVertical, Bell, BellOff, Paperclip, Truck, Building2, Loader } from 'lucide-react';
import { CHAT_STATUS, STATUS_ORDER, GROUP_ORDER, getStatusMeta, isOnlineStatus } from '../../utils/chatStatus';
import {
    playFor, unlockAudio, isPeerMuted, togglePeerMute,
} from '../../utils/chatSounds';

// Mensageiro interno estilo MSN. Widget flutuante montado no shell principal
// (nunca aparece para operadores — eles não renderizam este componente).
const initialOf = (name) => (name || '?').trim().charAt(0).toUpperCase();
// IDs podem ser UUID (string) ou INT — compara sempre como string.
const sameId = (a, b) => String(a) === String(b);
const uuid = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

// ── Emoticons/winks estilo MSN ──
const EMOTICONS = [
    [':)', '😊'], [':-)', '😊'], [':(', '☹️'], [':-(', '☹️'], [';)', '😉'], [';-)', '😉'],
    [':D', '😃'], [':-D', '😃'], [':P', '😛'], [':-P', '😛'], [':p', '😛'], [":'(", '😢'],
    ['<3', '❤️'], [':o', '😮'], [':O', '😮'], [':|', '😐'], ['(y)', '👍'], ['(n)', '👎'],
];
const applyEmoticons = (text) => {
    if (!text) return text;
    let out = text;
    for (const [k, v] of EMOTICONS) out = out.split(k).join(v);
    return out;
};
const QUICK_EMOJIS = ['👍', '✅', '😂', '❤️', '🎉', '🙏', '😮', '👎'];
const REACTION_EMOJIS = ['👍', '✅', '😂', '❤️'];

// ── Rascunhos persistentes por conversa ──
const DRAFTS_KEY = 'chatDrafts';
const readDrafts = () => { try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}'); } catch { return {}; } };
const writeDraft = (peerId, text) => {
    try {
        const d = readDrafts();
        if (text) d[peerId] = text; else delete d[peerId];
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(d));
    } catch { /* quota */ }
};

// Detecta se o texto menciona o usuário (@nome / @primeiro-nome).
const mentionsMe = (text, myName) => {
    if (!text || !myName) return false;
    const tokens = new Set();
    const full = myName.trim().toLowerCase();
    tokens.add(full.replace(/\s+/g, ''));           // @joaosilva
    tokens.add(full.split(/\s+/)[0]);                // @joao
    const lower = text.toLowerCase();
    for (const t of tokens) { if (t && lower.includes('@' + t)) return true; }
    return /@(todos|all|geral)\b/i.test(text);
};

// Renderiza o corpo com emoticons + destaque de menções (@palavra).
const renderBody = (text) => {
    const withEmoji = applyEmoticons(text || '');
    const parts = withEmoji.split(/(@[\wÀ-ÿ.]+)/g);
    return parts.map((p, i) => (p.startsWith('@')
        ? <span key={i} className="font-semibold underline decoration-dotted">{p}</span>
        : <React.Fragment key={i}>{p}</React.Fragment>));
};

// Agrega reações [{userId,emoji}] em [{emoji, count, mine}].
const aggregateReactions = (reactions, myId) => {
    const map = {};
    (reactions || []).forEach(r => {
        const e = (map[r.emoji] = map[r.emoji] || { emoji: r.emoji, count: 0, mine: false });
        e.count++;
        if (sameId(r.userId, myId)) e.mine = true;
    });
    return Object.values(map);
};

// ── Fila offline (localStorage) ──
// Mensagens ainda não confirmadas pelo servidor. Reenviadas com o mesmo
// clientMsgId (idempotente no backend) ao reconectar / voltar a ficar online.
const OUTBOX_KEY = 'chatOutbox';
const readOutbox = () => { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch { return []; } };
const writeOutbox = (arr) => { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(arr)); } catch { /* quota */ } };

const StatusDot = ({ status, size = 10 }) => {
    const meta = getStatusMeta(status);
    return <Circle size={size} fill={meta.dot} color={meta.dot} className="shrink-0" />;
};

// Marca de status da mensagem enviada por mim: relógio (pendente) → ✓ (enviada)
// → ✓✓ cinza (entregue) → ✓✓ azul (lida). `error` mostra alerta de falha.
const MsgTicks = ({ m, mine }) => {
    if (!mine) return null;
    if (m.error) return <AlertCircle size={11} className="inline text-red-300" />;
    if (m.pending) return <Clock size={10} className="inline opacity-80" />;
    if (m.read_at) return <span className="text-sky-300">✓✓</span>;
    if (m.delivered_at) return <span className="opacity-70">✓✓</span>;
    return <span className="opacity-70">✓</span>;
};

const Messenger = ({ socket, user, apiClient, myStatus, onStatusChange, vehicles = [], obras = [], onNavigate }) => {
    const [open, setOpen] = useState(false);
    const [contacts, setContacts] = useState([]);
    const [statuses, setStatuses] = useState({}); // userId -> { status, statusMsg }
    const [openPeer, setOpenPeer] = useState(null); // objeto do contato aberto
    const [messages, setMessages] = useState([]);
    const [unread, setUnread] = useState({}); // userId -> count
    const [input, setInput] = useState('');
    const [statusMenu, setStatusMenu] = useState(false);
    const [shake, setShake] = useState(false);
    const [typingPeers, setTypingPeers] = useState({}); // userId -> true
    const [connected, setConnected] = useState(socket?.connected ?? true);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [replyTo, setReplyTo] = useState(null);      // mensagem sendo citada
    const [editing, setEditing] = useState(null);      // mensagem sendo editada
    const [menuFor, setMenuFor] = useState(null);      // id com menu de contexto aberto
    const [reactFor, setReactFor] = useState(null);    // id com seletor de reação aberto
    const [emojiOpen, setEmojiOpen] = useState(false); // picker de emoji do input
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQ, setSearchQ] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [, setMuteTick] = useState(0); // força re-render ao alternar mute

    const openPeerRef = useRef(null);
    const statusesRef = useRef({});
    const bodyRef = useRef(null);
    const typingTimerRef = useRef(null);
    const typingSentRef = useRef(false);
    const myStatusRef = useRef(myStatus);
    const myId = user?.id;
    const myName = user?.name || '';

    useEffect(() => { openPeerRef.current = openPeer; }, [openPeer]);
    useEffect(() => { statusesRef.current = statuses; }, [statuses]);
    useEffect(() => { myStatusRef.current = myStatus; }, [myStatus]);

    // Carrega contatos ao montar.
    const loadContacts = useCallback(async () => {
        try {
            const list = await apiClient.getChatContacts();
            setContacts(list);
            setStatuses(prev => {
                const next = { ...prev };
                list.forEach(c => { next[c.id] = { status: c.status, statusMsg: c.statusMsg }; });
                return next;
            });
            setUnread(prev => {
                const next = { ...prev };
                list.forEach(c => { if (c.unread) next[c.id] = c.unread; });
                return next;
            });
        } catch (e) {
            console.warn('Erro ao carregar contatos do chat:', e.message);
        }
    }, [apiClient]);

    useEffect(() => { loadContacts(); }, [loadContacts]);

    // ── Fila offline: tenta enviar tudo que está pendente (idempotente) ──
    const flushOutbox = useCallback(async () => {
        const outbox = readOutbox();
        if (!outbox.length) return;
        for (const item of outbox) {
            try {
                await apiClient.sendChatMessage({
                    recipientId: item.recipientId,
                    body: item.body,
                    type: item.type,
                    clientMsgId: item.clientMsgId,
                    replyTo: item.replyTo || null,
                    attachment: item.attachment || null,
                });
                // Sucesso → remove da fila; o eco (chat:message) reconcilia a UI.
                const cur = readOutbox().filter(o => o.clientMsgId !== item.clientMsgId);
                writeOutbox(cur);
            } catch (e) {
                // Ainda offline / servidor fora — mantém na fila para próxima tentativa.
                break;
            }
        }
    }, [apiClient]);

    // Tenta esvaziar a fila ao montar e quando a rede volta.
    useEffect(() => {
        flushOutbox();
        const onOnline = () => flushOutbox();
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, [flushOutbox]);

    // ── Auto-ausente por inatividade ──
    // Após 10 min sem atividade e estando "Disponível", muda para "Ausente".
    // Volta a "Disponível" na primeira atividade (sem sobrescrever status manual).
    useEffect(() => {
        const IDLE_MS = 10 * 60 * 1000;
        let lastActive = Date.now();
        let autoAway = false;
        const onActivity = () => {
            lastActive = Date.now();
            if (autoAway) { autoAway = false; onStatusChange?.('disponivel'); }
        };
        const check = () => {
            if (myStatusRef.current === 'disponivel' && !autoAway && Date.now() - lastActive > IDLE_MS) {
                autoAway = true;
                onStatusChange?.('ausente');
            }
        };
        window.addEventListener('mousemove', onActivity);
        window.addEventListener('keydown', onActivity);
        const iv = setInterval(check, 30000);
        return () => {
            window.removeEventListener('mousemove', onActivity);
            window.removeEventListener('keydown', onActivity);
            clearInterval(iv);
        };
    }, [onStatusChange]);

    // Rola para o fim quando abre conversa ou chega mensagem (não ao paginar antigas).
    useEffect(() => {
        if (loadingOlder) return;
        if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }, [messages, openPeer]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Socket listeners ──
    useEffect(() => {
        if (!socket) return;

        const reconcile = (prev, msg) => {
            // Casa o eco do servidor com a mensagem otimista (por client_msg_id).
            if (msg.client_msg_id) {
                const idx = prev.findIndex(m => m.client_msg_id && m.client_msg_id === msg.client_msg_id);
                if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = { ...msg, pending: false };
                    return next;
                }
            }
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, { ...msg, pending: false }];
        };

        const onMessage = (msg) => {
            const isMine = sameId(msg.sender_id, myId);
            const peerId = isMine ? msg.recipient_id : msg.sender_id;
            const activePeer = openPeerRef.current;

            // Mensagem confirmada → sai da fila offline.
            if (isMine && msg.client_msg_id) {
                const cur = readOutbox().filter(o => o.clientMsgId !== msg.client_msg_id);
                writeOutbox(cur);
            }

            if (activePeer && sameId(activePeer.id, peerId)) {
                setMessages(prev => reconcile(prev, msg));
                if (!isMine) apiClient.markChatRead(peerId).catch(() => {});
            } else if (!isMine) {
                setUnread(prev => ({ ...prev, [peerId]: (prev[peerId] || 0) + 1 }));
            }
            if (!isMine && msg.type !== 'nudge') {
                const evt = mentionsMe(msg.body, myName) ? 'mencao' : 'mensagem';
                playFor(evt, { myStatus: myStatusRef.current, peerId });
            }
            setContacts(prev => prev.map(c => sameId(c.id, peerId) ? { ...c, lastMessageAt: msg.created_at } : c));
        };

        const onDelivered = ({ id, to }) => {
            const activePeer = openPeerRef.current;
            if (activePeer && sameId(activePeer.id, to)) {
                setMessages(prev => prev.map(m => sameId(m.id, id) ? { ...m, delivered_at: m.delivered_at || new Date().toISOString() } : m));
            }
        };

        const onNudge = ({ from } = {}) => { triggerShake(); playFor('nudge', { myStatus: myStatusRef.current, peerId: from }); };

        const onPresenceUpdate = ({ userId, status, statusMsg }) => {
            const prev = statusesRef.current[userId];
            const wasOnline = prev ? isOnlineStatus(prev.status) : false;
            const nowOnline = isOnlineStatus(status);
            if (!sameId(userId, myId)) {
                if (!wasOnline && nowOnline) playFor('entrada', { myStatus: myStatusRef.current, peerId: userId });
                if (wasOnline && !nowOnline) playFor('saida', { myStatus: myStatusRef.current, peerId: userId });
            }
            setStatuses(s => ({ ...s, [userId]: { status, statusMsg } }));
        };

        const onPresenceSync = (list) => {
            setStatuses(s => {
                const next = { ...s };
                (list || []).forEach(p => { next[p.userId] = { status: p.status, statusMsg: p.statusMsg }; });
                return next;
            });
        };

        const onRead = ({ by }) => {
            const activePeer = openPeerRef.current;
            if (activePeer && sameId(activePeer.id, by)) {
                setMessages(prev => prev.map(m => sameId(m.sender_id, myId) ? { ...m, read_at: m.read_at || new Date().toISOString() } : m));
            }
        };

        const onTyping = ({ from }) => setTypingPeers(p => ({ ...p, [from]: true }));
        const onStopTyping = ({ from }) => setTypingPeers(p => { const n = { ...p }; delete n[from]; return n; });

        const onEdited = ({ id, body, edited_at }) =>
            setMessages(prev => prev.map(m => sameId(m.id, id) ? { ...m, body, edited_at } : m));
        const onDeleted = ({ id, deleted_at }) =>
            setMessages(prev => prev.map(m => sameId(m.id, id) ? { ...m, body: null, deleted_at } : m));
        const onReaction = ({ messageId, userId, emoji, action }) =>
            setMessages(prev => prev.map(m => {
                if (!sameId(m.id, messageId)) return m;
                let reactions = m.reactions || [];
                if (action === 'add' && !reactions.some(r => sameId(r.userId, userId) && r.emoji === emoji)) {
                    reactions = [...reactions, { userId, emoji }];
                } else if (action === 'remove') {
                    reactions = reactions.filter(r => !(sameId(r.userId, userId) && r.emoji === emoji));
                }
                return { ...m, reactions };
            }));
        const onPin = ({ id, pinned, pinned_by }) =>
            setMessages(prev => prev.map(m => sameId(m.id, id)
                ? { ...m, pinned_at: pinned ? (m.pinned_at || new Date().toISOString()) : null, pinned_by: pinned ? pinned_by : null }
                : m));

        const onConnect = () => { setConnected(true); flushOutbox(); };
        const onDisconnect = () => setConnected(false);

        socket.on('chat:message', onMessage);
        socket.on('chat:delivered', onDelivered);
        socket.on('chat:nudge', onNudge);
        socket.on('presence:update', onPresenceUpdate);
        socket.on('presence:sync', onPresenceSync);
        socket.on('chat:read', onRead);
        socket.on('chat:typing', onTyping);
        socket.on('chat:stopTyping', onStopTyping);
        socket.on('chat:edited', onEdited);
        socket.on('chat:deleted', onDeleted);
        socket.on('chat:reaction', onReaction);
        socket.on('chat:pin', onPin);
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        return () => {
            socket.off('chat:message', onMessage);
            socket.off('chat:delivered', onDelivered);
            socket.off('chat:nudge', onNudge);
            socket.off('presence:update', onPresenceUpdate);
            socket.off('presence:sync', onPresenceSync);
            socket.off('chat:read', onRead);
            socket.off('chat:typing', onTyping);
            socket.off('chat:stopTyping', onStopTyping);
            socket.off('chat:edited', onEdited);
            socket.off('chat:deleted', onDeleted);
            socket.off('chat:reaction', onReaction);
            socket.off('chat:pin', onPin);
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
        };
    }, [socket, myId, myName, apiClient, flushOutbox]);

    const triggerShake = () => {
        setOpen(true);
        setShake(true);
        setTimeout(() => setShake(false), 700);
    };

    const openConversation = async (contact) => {
        unlockAudio();
        setOpenPeer(contact);
        setHasMore(true);
        setReplyTo(null); setEditing(null); setMenuFor(null); setReactFor(null); setEmojiOpen(false);
        setSearchOpen(false); setSearchQ(''); setSearchResults([]);
        setInput(readDrafts()[contact.id] || '');
        setUnread(prev => { const n = { ...prev }; delete n[contact.id]; return n; });
        try {
            const msgs = await apiClient.getChatMessages(contact.id);
            setMessages(msgs);
            if (msgs.length < 200) setHasMore(false);
            apiClient.markChatRead(contact.id).catch(() => {});
        } catch (e) {
            setMessages([]);
        }
    };

    // Scroll infinito: ao chegar ao topo, carrega a página anterior (mais antiga).
    const onBodyScroll = async () => {
        const el = bodyRef.current;
        if (!el || el.scrollTop > 40 || loadingOlder || !hasMore || !openPeer) return;
        const oldest = messages.find(m => !m.pending);
        if (!oldest) return;
        setLoadingOlder(true);
        const prevHeight = el.scrollHeight;
        try {
            const older = await apiClient.getChatMessages(openPeer.id, { before: oldest.created_at });
            if (!older.length) { setHasMore(false); }
            else {
                setMessages(prev => [...older, ...prev]);
                if (older.length < 200) setHasMore(false);
                requestAnimationFrame(() => {
                    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight - prevHeight;
                });
            }
        } catch (e) { /* mantém */ }
        finally { setLoadingOlder(false); }
    };

    const sendMessage = async (type = 'text') => {
        const body = type === 'nudge' ? 'Chamou sua atenção!' : input.trim();
        if (!openPeer) return;
        if (type === 'text' && !body) return;
        unlockAudio();
        stopTyping();

        // Modo edição: salva a alteração em vez de enviar nova mensagem.
        if (editing && type === 'text') {
            const editId = editing.id;
            const newBody = body;
            setEditing(null);
            setInput('');
            writeDraft(openPeer.id, '');
            setMessages(prev => prev.map(m => sameId(m.id, editId) ? { ...m, body: newBody, edited_at: new Date().toISOString() } : m));
            try { await apiClient.editChatMessage(editId, newBody); } catch (e) { console.warn('Erro ao editar:', e.message); }
            return;
        }

        setInput('');
        writeDraft(openPeer.id, '');
        const replySnapshot = replyTo;
        setReplyTo(null);
        await pushMessage({ type, body, replyTo: replySnapshot ? replySnapshot.id : null });
    };

    // Núcleo de envio (texto, anexo ou card): render otimista + fila + POST.
    const pushMessage = useCallback(async ({ type = 'text', body = '', replyTo = null, attachment = null }) => {
        if (!openPeerRef.current) return;
        const peerId = openPeerRef.current.id;
        const clientMsgId = uuid();
        const createdAt = new Date().toISOString();
        const optimistic = {
            id: `local:${clientMsgId}`,
            client_msg_id: clientMsgId,
            sender_id: myId,
            recipient_id: peerId,
            body, type,
            reply_to: replyTo,
            reactions: [],
            attachment_url: attachment?.url || null,
            attachment_name: attachment?.name || null,
            attachment_mime: attachment?.mime || null,
            attachment_size: attachment?.size || null,
            read_at: null, delivered_at: null,
            created_at: createdAt,
            pending: true,
        };
        setMessages(prev => [...prev, optimistic]);
        writeOutbox([...readOutbox(), { clientMsgId, recipientId: peerId, body, type, replyTo, attachment, created_at: createdAt }]);
        try {
            await apiClient.sendChatMessage({ recipientId: peerId, body, type, clientMsgId, replyTo, attachment });
        } catch (e) {
            setMessages(prev => prev.map(m => (m.client_msg_id === clientMsgId && m.pending) ? { ...m, error: true } : m));
        }
    }, [apiClient, myId]);

    // ── Anexos (reusa POST /api/upload) ──
    const fileInputRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    const onPickFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !openPeer) return;
        if (file.size > 10 * 1024 * 1024) { alert('Arquivo excede 10MB.'); return; }
        unlockAudio();
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const up = await apiClient.uploadFile(fd);
            await pushMessage({
                type: 'text',
                body: input.trim(),
                attachment: { url: up.url || up.fileUrl, name: up.originalName || file.name, mime: up.mimetype || file.type, size: up.size || file.size },
            });
            setInput(''); writeDraft(openPeer.id, '');
        } catch (err) {
            alert('Falha no upload: ' + (err.message || 'erro'));
        } finally {
            setUploading(false);
        }
    };

    // ── Cartão de contexto (veículo/obra) ──
    const [cardPicker, setCardPicker] = useState(null); // 'vehicle' | 'obra' | null
    const [cardQuery, setCardQuery] = useState('');
    const sendCard = (kind, item) => {
        const label = kind === 'vehicle'
            ? [item.placa, item.modelo].filter(Boolean).join(' · ')
            : (item.nome || item.name || 'Obra');
        setCardPicker(null); setCardQuery('');
        pushMessage({ type: 'card', body: JSON.stringify({ kind, id: item.id, label }) });
    };
    const openCard = (card) => {
        if (!onNavigate) return;
        onNavigate(card.kind === 'vehicle' ? 'vehicles' : 'obras');
    };

    // ── "Digitando…" ──
    const stopTyping = useCallback(() => {
        if (typingSentRef.current && socket && openPeerRef.current) {
            socket.emit('chat:stopTyping', { to: openPeerRef.current.id });
        }
        typingSentRef.current = false;
        if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
    }, [socket]);

    const onInputChange = (e) => {
        const val = e.target.value;
        setInput(val);
        if (openPeer) writeDraft(openPeer.id, val);
        if (!socket || !openPeer) return;
        if (!typingSentRef.current) {
            socket.emit('chat:typing', { to: openPeer.id });
            typingSentRef.current = true;
        }
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(stopTyping, 2500);
    };

    const handleKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage('text'); }
        if (e.key === 'Escape') { setReplyTo(null); setEditing(null); }
    };

    // ── Ações sobre mensagens ──
    const startReply = (m) => { setEditing(null); setReplyTo(m); setMenuFor(null); };
    const startEdit = (m) => {
        setReplyTo(null); setEditing(m); setInput(m.body || ''); setMenuFor(null);
    };
    const cancelCompose = () => { setReplyTo(null); setEditing(null); setInput(''); if (openPeer) writeDraft(openPeer.id, ''); };
    const deleteMsg = async (m) => {
        setMenuFor(null);
        setMessages(prev => prev.map(x => sameId(x.id, m.id) ? { ...x, body: null, deleted_at: new Date().toISOString() } : x));
        try { await apiClient.deleteChatMessage(m.id); } catch (e) { console.warn('Erro ao apagar:', e.message); }
    };
    const react = async (m, emoji) => {
        setReactFor(null);
        // Otimista: alterna localmente.
        setMessages(prev => prev.map(x => {
            if (!sameId(x.id, m.id)) return x;
            const has = (x.reactions || []).some(r => sameId(r.userId, myId) && r.emoji === emoji);
            const reactions = has
                ? (x.reactions || []).filter(r => !(sameId(r.userId, myId) && r.emoji === emoji))
                : [...(x.reactions || []), { userId: myId, emoji }];
            return { ...x, reactions };
        }));
        try { await apiClient.reactChatMessage(m.id, emoji); } catch (e) { console.warn('Erro na reação:', e.message); }
    };
    const togglePin = async (m) => {
        setMenuFor(null);
        const willPin = !m.pinned_at;
        setMessages(prev => prev.map(x => sameId(x.id, m.id)
            ? { ...x, pinned_at: willPin ? new Date().toISOString() : null, pinned_by: willPin ? myId : null }
            : x));
        try { await apiClient.pinChatMessage(m.id); } catch (e) { console.warn('Erro ao fixar:', e.message); }
    };
    const insertEmoji = (emoji) => {
        const val = input + emoji;
        setInput(val);
        if (openPeer) writeDraft(openPeer.id, val);
        setEmojiOpen(false);
    };
    const runSearch = async (q) => {
        setSearchQ(q);
        if (q.trim().length < 2) { setSearchResults([]); return; }
        try { setSearchResults(await apiClient.searchChatMessages(q.trim(), openPeer?.id)); }
        catch { setSearchResults([]); }
    };

    const pickStatus = (st) => {
        setStatusMenu(false);
        onStatusChange?.(st);
    };

    const totalUnread = useMemo(
        () => Object.values(unread).reduce((a, b) => a + b, 0),
        [unread]
    );

    // Contatos com status atual mesclado + agrupados.
    const grouped = useMemo(() => {
        const withStatus = contacts.map(c => ({
            ...c,
            status: statuses[c.id]?.status || 'offline',
            statusMsg: statuses[c.id]?.statusMsg ?? c.statusMsg,
        }));
        const groups = { online: [], offline: [] };
        withStatus.forEach(c => (isOnlineStatus(c.status) ? groups.online : groups.offline).push(c));
        const sortFn = (a, b) => {
            const oa = GROUP_ORDER.indexOf(a.status), ob = GROUP_ORDER.indexOf(b.status);
            if (oa !== ob) return oa - ob;
            return (a.displayName || '').localeCompare(b.displayName || '');
        };
        groups.online.sort(sortFn);
        groups.offline.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        return groups;
    }, [contacts, statuses]);

    const myMeta = getStatusMeta(myStatus);
    const peerStatus = openPeer ? (statuses[openPeer.id]?.status || 'offline') : 'offline';
    const peerStatusMsg = openPeer ? (statuses[openPeer.id]?.statusMsg) : null;
    const peerTyping = openPeer ? !!typingPeers[openPeer.id] : false;
    const msgById = useMemo(() => {
        const map = {};
        messages.forEach(m => { map[m.id] = m; });
        return map;
    }, [messages]);
    const pinnedMsg = useMemo(() => {
        const pins = messages.filter(m => m.pinned_at && !m.deleted_at);
        if (!pins.length) return null;
        return pins.sort((a, b) => new Date(b.pinned_at) - new Date(a.pinned_at))[0];
    }, [messages]);

    // ── Barra recolhida ──
    if (!open) {
        return (
            <button
                onClick={() => { unlockAudio(); setOpen(true); }}
                className="fixed bottom-4 right-4 z-[99998] flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-white transition-transform hover:scale-105"
                style={{ background: 'linear-gradient(135deg,#0a6cff,#0846b8)' }}
                title="Mensagens"
            >
                <MessageSquare size={18} />
                <span className="text-sm font-semibold">Mensagens</span>
                {totalUnread > 0 && (
                    <span className="flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold" style={{ minWidth: 18, height: 18, padding: '0 4px' }}>
                        {totalUnread}
                    </span>
                )}
            </button>
        );
    }

    return (
        <div
            className={`fixed bottom-4 right-4 z-[99998] flex flex-col bg-white overflow-hidden ${shake ? 'msn-shake' : ''}`}
            style={{ width: 340, height: 480, borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.35)', border: '1px solid #0846b8' }}
        >
            {/* Header MSN */}
            <div className="flex items-center gap-2 px-3 py-2 text-white relative" style={{ background: 'linear-gradient(135deg,#0a6cff,#0846b8)' }}>
                <div className="relative shrink-0">
                    <div className="flex items-center justify-center rounded-full bg-white/25 font-bold" style={{ width: 30, height: 30, fontSize: 13 }}>
                        {initialOf(user?.name)}
                    </div>
                    <span style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: myMeta.dot, border: '1.5px solid #0846b8' }} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate leading-tight">{user?.name}</div>
                    <button onClick={() => setStatusMenu(v => !v)} className="text-[11px] text-white/90 hover:text-white flex items-center gap-1 leading-tight">
                        <StatusDot status={myStatus} size={8} /> {myMeta.label} ▾
                    </button>
                </div>
                <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white p-1" title="Minimizar"><Minus size={16} /></button>
                <button onClick={() => { setOpen(false); setOpenPeer(null); }} className="text-white/80 hover:text-white p-1" title="Fechar"><X size={16} /></button>

                {/* Menu de status */}
                {statusMenu && (
                    <div className="absolute left-2 top-full mt-1 bg-white rounded-md shadow-lg py-1 z-10" style={{ minWidth: 160 }}>
                        {STATUS_ORDER.map(st => (
                            <button key={st} onClick={() => pickStatus(st)} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 text-left">
                                <StatusDot status={st} size={9} /> {CHAT_STATUS[st].label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Aviso de reconexão */}
            {!connected && (
                <div className="text-center text-[11px] text-amber-700 bg-amber-50 border-b border-amber-200 py-0.5">
                    Reconectando…
                </div>
            )}

            {/* Corpo: lista de contatos OU conversa */}
            {!openPeer ? (
                <div className="flex-1 overflow-y-auto mak-scrollbar" style={{ background: '#f2f6fc' }}>
                    <ContactGroup title={`Online (${grouped.online.length})`} contacts={grouped.online} unread={unread} onOpen={openConversation} />
                    <ContactGroup title={`Offline (${grouped.offline.length})`} contacts={grouped.offline} unread={unread} onOpen={openConversation} dim />
                    {contacts.length === 0 && (
                        <div className="text-center text-xs text-gray-400 py-8">Nenhum contato disponível.</div>
                    )}
                </div>
            ) : (
                <>
                    {/* Sub-header da conversa */}
                    <div className="flex items-center gap-2 px-2 py-1.5 border-b" style={{ background: '#eaf1fb', borderColor: '#d6e4f7' }}>
                        <button onClick={() => { stopTyping(); setOpenPeer(null); }} className="p-1 text-gray-500 hover:text-gray-800" title="Voltar"><ChevronLeft size={16} /></button>
                        <StatusDot status={peerStatus} />
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-gray-800 truncate leading-tight">{openPeer.displayName}</div>
                            {peerTyping
                                ? <div className="text-[11px] text-blue-500 truncate leading-tight">digitando…</div>
                                : (peerStatusMsg && <div className="text-[11px] text-gray-500 truncate leading-tight italic">{peerStatusMsg}</div>)}
                        </div>
                        <button onClick={() => { togglePeerMute(openPeer.id); setMuteTick(t => t + 1); }} className={`p-1 ${isPeerMuted(openPeer.id) ? 'text-blue-600' : 'text-gray-500'} hover:text-gray-800`} title={isPeerMuted(openPeer.id) ? 'Reativar sons desta conversa' : 'Silenciar esta conversa'}>
                            {isPeerMuted(openPeer.id) ? <BellOff size={15} /> : <Bell size={15} />}
                        </button>
                        <button onClick={() => { setSearchOpen(v => !v); setSearchQ(''); setSearchResults([]); }} className={`p-1 ${searchOpen ? 'text-blue-600' : 'text-gray-500'} hover:text-gray-800`} title="Buscar no histórico"><Search size={15} /></button>
                    </div>

                    {/* Busca no histórico */}
                    {searchOpen && (
                        <div className="border-b bg-white px-2 py-1.5" style={{ borderColor: '#e5e7eb' }}>
                            <input
                                autoFocus value={searchQ} onChange={e => runSearch(e.target.value)}
                                placeholder="Buscar mensagens…"
                                className="w-full border rounded-md px-2 py-1 text-sm outline-none focus:border-blue-400"
                            />
                            {searchQ.trim().length >= 2 && (
                                <div className="max-h-40 overflow-y-auto mak-scrollbar mt-1">
                                    {searchResults.length === 0
                                        ? <div className="text-center text-[11px] text-gray-400 py-2">Nada encontrado.</div>
                                        : searchResults.map(r => (
                                            <div key={r.id} className="text-[11px] px-1 py-1 border-b last:border-0 text-gray-600">
                                                <span className="text-gray-400">{new Date(r.created_at).toLocaleDateString('pt-BR')} · </span>
                                                {applyEmoticons(r.body)}
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Faixa de mensagem fixada */}
                    {pinnedMsg && (
                        <div className="flex items-center gap-1.5 px-2 py-1 border-b bg-amber-50 text-[11px] text-amber-800" style={{ borderColor: '#f0e0b0' }}>
                            <Pin size={12} className="shrink-0" />
                            <span className="flex-1 truncate">{applyEmoticons(pinnedMsg.body)}</span>
                            <button onClick={() => togglePin(pinnedMsg)} className="text-amber-600 hover:text-amber-800 shrink-0" title="Desafixar"><X size={12} /></button>
                        </div>
                    )}

                    {/* Mensagens */}
                    <div ref={bodyRef} onScroll={onBodyScroll} className="flex-1 overflow-y-auto mak-scrollbar px-3 py-2 space-y-1.5" style={{ background: '#ffffff' }}>
                        {loadingOlder && <div className="text-center text-[11px] text-gray-400 py-1">Carregando…</div>}
                        {messages.map(m => {
                            const mine = sameId(m.sender_id, myId);
                            if (m.type === 'nudge') {
                                return (
                                    <div key={m.id} className="text-center text-[11px] text-amber-600 py-1 flex items-center justify-center gap-1">
                                        <Zap size={12} /> {mine ? 'Você chamou a atenção' : 'Chamou sua atenção'}
                                    </div>
                                );
                            }
                            const quoted = m.reply_to ? msgById[m.reply_to] : null;
                            const aggr = aggregateReactions(m.reactions, myId);
                            const isDeleted = !!m.deleted_at;
                            return (
                                <div key={m.id} className={`group flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                                    <div className={`relative flex items-center gap-1 ${mine ? 'flex-row' : 'flex-row-reverse'}`}>
                                        {/* Ações rápidas (aparecem no hover) */}
                                        {!isDeleted && (
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0">
                                                <button onClick={() => setReactFor(reactFor === m.id ? null : m.id)} className="p-1 text-gray-400 hover:text-gray-700" title="Reagir"><Smile size={14} /></button>
                                                <button onClick={() => startReply(m)} className="p-1 text-gray-400 hover:text-gray-700" title="Responder"><Reply size={14} /></button>
                                                <button onClick={() => setMenuFor(menuFor === m.id ? null : m.id)} className="p-1 text-gray-400 hover:text-gray-700" title="Mais"><MoreVertical size={14} /></button>
                                            </div>
                                        )}
                                        <div className={`relative px-2.5 py-1.5 rounded-lg text-sm max-w-[220px] break-words ${isDeleted ? 'bg-gray-50 text-gray-400 italic' : (mine ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800')} ${m.pending ? 'opacity-80' : ''}`}>
                                            {quoted && !isDeleted && (
                                                <div className={`text-[11px] mb-1 pl-1.5 border-l-2 rounded-sm truncate ${mine ? 'border-blue-200 text-blue-100' : 'border-gray-300 text-gray-500'}`}>
                                                    {quoted.deleted_at ? 'mensagem apagada' : applyEmoticons((quoted.body || '').slice(0, 80))}
                                                </div>
                                            )}
                                            {/* Cartão de contexto (veículo/obra) */}
                                            {!isDeleted && m.type === 'card' && (() => {
                                                let card = null;
                                                try { card = JSON.parse(m.body); } catch { /* inválido */ }
                                                if (!card) return null;
                                                return (
                                                    <button onClick={() => openCard(card)} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left ${mine ? 'bg-blue-400/40' : 'bg-white'} border ${mine ? 'border-blue-300' : 'border-gray-200'}`}>
                                                        {card.kind === 'vehicle' ? <Truck size={16} className="shrink-0" /> : <Building2 size={16} className="shrink-0" />}
                                                        <span className="min-w-0">
                                                            <span className="block text-[10px] uppercase opacity-70">{card.kind === 'vehicle' ? 'Veículo' : 'Obra'}</span>
                                                            <span className="block truncate font-semibold">{card.label}</span>
                                                        </span>
                                                    </button>
                                                );
                                            })()}
                                            {/* Anexo */}
                                            {!isDeleted && m.attachment_url && (
                                                (m.attachment_mime || '').startsWith('image/')
                                                    ? <a href={m.attachment_url} target="_blank" rel="noreferrer" className="block"><img src={m.attachment_url} alt={m.attachment_name || 'imagem'} className="rounded-md max-h-40 max-w-full" /></a>
                                                    : <a href={m.attachment_url} target="_blank" rel="noreferrer" className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${mine ? 'bg-blue-400/40' : 'bg-white'} border ${mine ? 'border-blue-300' : 'border-gray-200'}`}>
                                                        <Paperclip size={14} className="shrink-0" />
                                                        <span className="truncate">{m.attachment_name || 'Anexo'}</span>
                                                    </a>
                                            )}
                                            {isDeleted ? 'mensagem apagada' : (m.type === 'card' ? null : renderBody(m.body))}
                                            <div className={`text-[9px] mt-0.5 flex items-center justify-end gap-1 ${isDeleted ? 'text-gray-300' : (mine ? 'text-blue-100' : 'text-gray-400')}`}>
                                                {m.edited_at && !isDeleted && <span className="italic">editada</span>}
                                                {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                <MsgTicks m={m} mine={mine} />
                                            </div>

                                            {/* Seletor de reação */}
                                            {reactFor === m.id && (
                                                <div className="absolute z-20 -top-8 right-0 bg-white border rounded-full shadow px-1 py-0.5 flex gap-0.5">
                                                    {REACTION_EMOJIS.map(e => (
                                                        <button key={e} onClick={() => react(m, e)} className="text-base hover:scale-125 transition-transform">{e}</button>
                                                    ))}
                                                </div>
                                            )}
                                            {/* Menu de contexto */}
                                            {menuFor === m.id && (
                                                <div className="absolute z-20 top-full mt-1 right-0 bg-white border rounded-md shadow-lg py-1 text-gray-700" style={{ minWidth: 130 }}>
                                                    <button onClick={() => startReply(m)} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-gray-100 text-left"><Reply size={13} /> Responder</button>
                                                    <button onClick={() => togglePin(m)} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-gray-100 text-left"><Pin size={13} /> {m.pinned_at ? 'Desafixar' : 'Fixar'}</button>
                                                    {mine && <button onClick={() => startEdit(m)} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-gray-100 text-left"><Pencil size={13} /> Editar</button>}
                                                    {mine && <button onClick={() => deleteMsg(m)} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-600 hover:bg-gray-100 text-left"><Trash2 size={13} /> Apagar</button>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {/* Reações agregadas */}
                                    {aggr.length > 0 && (
                                        <div className={`flex gap-1 mt-0.5 ${mine ? 'pr-1' : 'pl-1'}`}>
                                            {aggr.map(r => (
                                                <button key={r.emoji} onClick={() => react(m, r.emoji)}
                                                    className={`text-[11px] rounded-full px-1.5 py-0.5 border ${r.mine ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200'}`}>
                                                    {r.emoji} {r.count}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {messages.length === 0 && (
                            <div className="text-center text-xs text-gray-400 py-6">Comece a conversa 👋</div>
                        )}
                    </div>

                    {/* Preview de reply/edição acima do input */}
                    {(replyTo || editing) && (
                        <div className="flex items-center gap-2 px-2 py-1 border-t bg-blue-50 text-[11px]" style={{ borderColor: '#dbeafe' }}>
                            {editing ? <Pencil size={12} className="text-blue-600 shrink-0" /> : <Reply size={12} className="text-blue-600 shrink-0" />}
                            <span className="flex-1 truncate text-gray-600">
                                <span className="font-semibold text-blue-700">{editing ? 'Editando: ' : 'Respondendo: '}</span>
                                {applyEmoticons(((editing || replyTo).body || '').slice(0, 80))}
                            </span>
                            <button onClick={cancelCompose} className="text-gray-400 hover:text-gray-700 shrink-0"><X size={13} /></button>
                        </div>
                    )}

                    {/* Card picker (veículo/obra) */}
                    {cardPicker && (
                        <div className="border-t bg-white px-2 py-1.5" style={{ borderColor: '#e5e7eb' }}>
                            <div className="flex items-center gap-2 mb-1">
                                <button onClick={() => setCardPicker('vehicle')} className={`text-xs px-2 py-1 rounded ${cardPicker === 'vehicle' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-500'}`}>Veículo</button>
                                <button onClick={() => setCardPicker('obra')} className={`text-xs px-2 py-1 rounded ${cardPicker === 'obra' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-500'}`}>Obra</button>
                                <input autoFocus value={cardQuery} onChange={e => setCardQuery(e.target.value)} placeholder="Buscar…" className="flex-1 border rounded px-2 py-1 text-xs outline-none focus:border-blue-400" />
                                <button onClick={() => { setCardPicker(null); setCardQuery(''); }} className="text-gray-400 hover:text-gray-700"><X size={14} /></button>
                            </div>
                            <div className="max-h-40 overflow-y-auto mak-scrollbar">
                                {(cardPicker === 'vehicle' ? vehicles : obras)
                                    .filter(it => {
                                        const q = cardQuery.trim().toLowerCase();
                                        if (!q) return true;
                                        const hay = cardPicker === 'vehicle'
                                            ? `${it.placa || ''} ${it.modelo || ''} ${it.marca || ''}`
                                            : `${it.nome || it.name || ''}`;
                                        return hay.toLowerCase().includes(q);
                                    })
                                    .slice(0, 30)
                                    .map(it => (
                                        <button key={it.id} onClick={() => sendCard(cardPicker, it)} className="flex items-center gap-2 w-full px-1.5 py-1 text-xs text-left hover:bg-gray-50 rounded">
                                            {cardPicker === 'vehicle' ? <Truck size={13} className="text-gray-400" /> : <Building2 size={13} className="text-gray-400" />}
                                            <span className="truncate">{cardPicker === 'vehicle' ? [it.placa, it.modelo].filter(Boolean).join(' · ') : (it.nome || it.name)}</span>
                                        </button>
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* Input */}
                    <div className="border-t p-2 flex items-end gap-1.5 relative" style={{ borderColor: '#e5e7eb' }}>
                        <input ref={fileInputRef} type="file" className="hidden" onChange={onPickFile} accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.csv,.xml" />
                        <button onClick={() => sendMessage('nudge')} className="p-2 text-amber-500 hover:text-amber-600 shrink-0" title="Chamar atenção (nudge)"><Zap size={18} /></button>
                        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-2 text-gray-400 hover:text-gray-600 shrink-0 disabled:opacity-40" title="Anexar arquivo">
                            {uploading ? <Loader size={18} className="animate-spin" /> : <Paperclip size={18} />}
                        </button>
                        <button onClick={() => setCardPicker(cardPicker ? null : 'vehicle')} className={`p-2 shrink-0 ${cardPicker ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`} title="Enviar veículo/obra"><Truck size={18} /></button>
                        <button onClick={() => setEmojiOpen(v => !v)} className="p-2 text-gray-400 hover:text-gray-600 shrink-0" title="Emoji"><Smile size={18} /></button>
                        {emojiOpen && (
                            <div className="absolute bottom-full left-2 mb-1 bg-white border rounded-md shadow-lg p-1.5 flex flex-wrap gap-1 z-20" style={{ width: 180 }}>
                                {QUICK_EMOJIS.map(e => (
                                    <button key={e} onClick={() => insertEmoji(e)} className="text-lg hover:scale-125 transition-transform">{e}</button>
                                ))}
                            </div>
                        )}
                        <textarea
                            value={input}
                            onChange={onInputChange}
                            onKeyDown={handleKey}
                            onBlur={stopTyping}
                            rows={1}
                            placeholder={editing ? 'Edite a mensagem…' : 'Digite uma mensagem…'}
                            className="flex-1 resize-none border rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-blue-400 mak-scrollbar"
                            style={{ maxHeight: 80 }}
                        />
                        <button onClick={() => sendMessage('text')} className="p-2 text-white rounded-lg shrink-0" style={{ background: '#0a6cff' }} title={editing ? 'Salvar' : 'Enviar'}><Send size={16} /></button>
                    </div>
                </>
            )}
        </div>
    );
};

const ContactGroup = ({ title, contacts, unread, onOpen, dim }) => {
    if (!contacts.length) return null;
    return (
        <div>
            <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{title}</div>
            {contacts.map(c => (
                <button
                    key={c.id}
                    onClick={() => onOpen(c)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-white/70 text-left transition-colors"
                    style={{ opacity: dim ? 0.6 : 1 }}
                >
                    <div className="relative shrink-0">
                        <div className="flex items-center justify-center rounded-full text-white font-bold" style={{ width: 28, height: 28, fontSize: 12, background: '#7a94b8' }}>
                            {initialOf(c.displayName)}
                        </div>
                        <span style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: getStatusMeta(c.status).dot, border: '1.5px solid #f2f6fc' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800 truncate leading-tight">{c.displayName}</div>
                        {c.statusMsg && <div className="text-[11px] text-gray-500 truncate leading-tight italic">{c.statusMsg}</div>}
                    </div>
                    {unread[c.id] > 0 && (
                        <span className="flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold shrink-0" style={{ minWidth: 18, height: 18, padding: '0 4px' }}>
                            {unread[c.id]}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
};

export default Messenger;
