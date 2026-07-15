import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { MessageSquare, X, ChevronLeft, Send, Zap, Circle, Minus } from 'lucide-react';
import { CHAT_STATUS, STATUS_ORDER, GROUP_ORDER, getStatusMeta, isOnlineStatus } from '../../utils/chatStatus';
import {
    playDing, playNudge, playOnline, playOffline, unlockAudio,
} from '../../utils/chatSounds';

// Mensageiro interno estilo MSN. Widget flutuante montado no shell principal
// (nunca aparece para operadores — eles não renderizam este componente).
const initialOf = (name) => (name || '?').trim().charAt(0).toUpperCase();
// IDs podem ser UUID (string) ou INT — compara sempre como string.
const sameId = (a, b) => String(a) === String(b);

const StatusDot = ({ status, size = 10 }) => {
    const meta = getStatusMeta(status);
    return <Circle size={size} fill={meta.dot} color={meta.dot} className="shrink-0" />;
};

const Messenger = ({ socket, user, apiClient, myStatus, onStatusChange }) => {
    const [open, setOpen] = useState(false);
    const [contacts, setContacts] = useState([]);
    const [statuses, setStatuses] = useState({}); // userId -> { status, statusMsg }
    const [openPeer, setOpenPeer] = useState(null); // objeto do contato aberto
    const [messages, setMessages] = useState([]);
    const [unread, setUnread] = useState({}); // userId -> count
    const [input, setInput] = useState('');
    const [statusMenu, setStatusMenu] = useState(false);
    const [shake, setShake] = useState(false);

    const openPeerRef = useRef(null);
    const statusesRef = useRef({});
    const bodyRef = useRef(null);
    const myId = user?.id;

    useEffect(() => { openPeerRef.current = openPeer; }, [openPeer]);
    useEffect(() => { statusesRef.current = statuses; }, [statuses]);

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

    // Rola para o fim quando abre conversa ou chega mensagem.
    useEffect(() => {
        if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }, [messages, openPeer]);

    // ── Socket listeners ──
    useEffect(() => {
        if (!socket) return;

        const onMessage = (msg) => {
            const isMine = sameId(msg.sender_id, myId);
            const peerId = isMine ? msg.recipient_id : msg.sender_id;
            const activePeer = openPeerRef.current;

            if (activePeer && sameId(activePeer.id, peerId)) {
                setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
                // Recebida com a conversa aberta → marca lida no servidor.
                if (!isMine) apiClient.getChatMessages(peerId).catch(() => {});
            } else if (!isMine) {
                setUnread(prev => ({ ...prev, [peerId]: (prev[peerId] || 0) + 1 }));
            }
            if (!isMine) playDing();
            // Atualiza "última mensagem" para reordenar a lista.
            setContacts(prev => prev.map(c => sameId(c.id, peerId) ? { ...c, lastMessageAt: msg.created_at } : c));
        };

        const onNudge = () => { triggerShake(); playNudge(); };

        const onPresenceUpdate = ({ userId, status, statusMsg }) => {
            const prev = statusesRef.current[userId];
            const wasOnline = prev ? isOnlineStatus(prev.status) : false;
            const nowOnline = isOnlineStatus(status);
            if (!sameId(userId, myId)) {
                if (!wasOnline && nowOnline) playOnline();
                if (wasOnline && !nowOnline) playOffline();
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

        socket.on('chat:message', onMessage);
        socket.on('chat:nudge', onNudge);
        socket.on('presence:update', onPresenceUpdate);
        socket.on('presence:sync', onPresenceSync);
        socket.on('chat:read', onRead);
        return () => {
            socket.off('chat:message', onMessage);
            socket.off('chat:nudge', onNudge);
            socket.off('presence:update', onPresenceUpdate);
            socket.off('presence:sync', onPresenceSync);
            socket.off('chat:read', onRead);
        };
    }, [socket, myId, apiClient]);

    const triggerShake = () => {
        setOpen(true);
        setShake(true);
        setTimeout(() => setShake(false), 700);
    };

    const openConversation = async (contact) => {
        unlockAudio();
        setOpenPeer(contact);
        setUnread(prev => { const n = { ...prev }; delete n[contact.id]; return n; });
        try {
            const msgs = await apiClient.getChatMessages(contact.id);
            setMessages(msgs);
        } catch (e) {
            setMessages([]);
        }
    };

    const sendMessage = async (type = 'text') => {
        const body = type === 'nudge' ? 'Chamou sua atenção!' : input.trim();
        if (!openPeer) return;
        if (type === 'text' && !body) return;
        unlockAudio();
        setInput('');
        try {
            await apiClient.sendChatMessage({ recipientId: openPeer.id, body, type });
            // A própria mensagem volta via socket (eco) e é anexada lá.
        } catch (e) {
            console.warn('Erro ao enviar:', e.message);
        }
    };

    const handleKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage('text'); }
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
                        <button onClick={() => setOpenPeer(null)} className="p-1 text-gray-500 hover:text-gray-800" title="Voltar"><ChevronLeft size={16} /></button>
                        <StatusDot status={peerStatus} />
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-800 truncate leading-tight">{openPeer.displayName}</div>
                            {peerStatusMsg && <div className="text-[11px] text-gray-500 truncate leading-tight italic">{peerStatusMsg}</div>}
                        </div>
                    </div>

                    {/* Mensagens */}
                    <div ref={bodyRef} className="flex-1 overflow-y-auto mak-scrollbar px-3 py-2 space-y-1.5" style={{ background: '#ffffff' }}>
                        {messages.map(m => {
                            const mine = sameId(m.sender_id, myId);
                            if (m.type === 'nudge') {
                                return (
                                    <div key={m.id} className="text-center text-[11px] text-amber-600 py-1 flex items-center justify-center gap-1">
                                        <Zap size={12} /> {mine ? 'Você chamou a atenção' : 'Chamou sua atenção'}
                                    </div>
                                );
                            }
                            return (
                                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`px-2.5 py-1.5 rounded-lg text-sm max-w-[75%] break-words ${mine ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}>
                                        {m.body}
                                        <div className={`text-[9px] mt-0.5 ${mine ? 'text-blue-100' : 'text-gray-400'}`}>
                                            {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            {mine && (m.read_at ? ' ✓✓' : ' ✓')}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {messages.length === 0 && (
                            <div className="text-center text-xs text-gray-400 py-6">Comece a conversa 👋</div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="border-t p-2 flex items-end gap-1.5" style={{ borderColor: '#e5e7eb' }}>
                        <button onClick={() => sendMessage('nudge')} className="p-2 text-amber-500 hover:text-amber-600 shrink-0" title="Chamar atenção (nudge)"><Zap size={18} /></button>
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKey}
                            rows={1}
                            placeholder="Digite uma mensagem…"
                            className="flex-1 resize-none border rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-blue-400 mak-scrollbar"
                            style={{ maxHeight: 80 }}
                        />
                        <button onClick={() => sendMessage('text')} className="p-2 text-white rounded-lg shrink-0" style={{ background: '#0a6cff' }} title="Enviar"><Send size={16} /></button>
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
