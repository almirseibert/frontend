import React, { useEffect, useState } from 'react';
import { User, Bell, Lock, Circle, Play } from 'lucide-react';
import ModalShell from '../ui/ModalShell';
import { CHAT_STATUS, STATUS_ORDER } from '../../utils/chatStatus';
import { getNotifPrefs, setNotifPrefs, previewSound, SOUND_OPTIONS } from '../../utils/chatSounds';

// Rótulos dos eventos notificáveis do chat.
const EVENT_LABELS = [
    { key: 'mensagem', label: 'Nova mensagem' },
    { key: 'mencao', label: 'Menção a você (@)' },
    { key: 'nudge', label: 'Chamar atenção (nudge)' },
    { key: 'entrada', label: 'Contato ficou online' },
    { key: 'saida', label: 'Contato ficou offline' },
];

// Modal de Configurações do usuário — substitui o antigo botão "Trocar Senha".
// Abas: Perfil (nome de exibição, status e recado do chat), Notificações (sons)
// e Segurança (troca de senha).
const TABS = [
    { id: 'perfil', label: 'Perfil', icon: User },
    { id: 'notificacoes', label: 'Notificações', icon: Bell },
    { id: 'seguranca', label: 'Segurança', icon: Lock },
];

// Pequeno switch reutilizável (mesmo padrão visual usado nos filtros).
const Toggle = ({ checked, onChange, label }) => (
    <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
        <span className="text-sm text-gray-700">{label}</span>
        <div className="relative">
            <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
            <div className="w-9 h-5 bg-gray-200 rounded-full transition-colors peer-checked:bg-yellow-400" />
            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
        </div>
    </label>
);

const SettingsModal = ({ onClose, apiClient, socket, onProfileSaved }) => {
    const [tab, setTab] = useState('perfil');

    // Perfil
    const [displayName, setDisplayName] = useState('');
    const [chatStatus, setChatStatus] = useState('disponivel');
    const [chatStatusMsg, setChatStatusMsg] = useState('');
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileMsg, setProfileMsg] = useState(null);

    // Notificações (prefs por evento + DND + horário de silêncio + prévia)
    const [notif, setNotif] = useState(getNotifPrefs());

    // Segurança
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwMsg, setPwMsg] = useState(null);
    const [pwLoading, setPwLoading] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const s = await apiClient.getMySettings();
                if (!alive) return;
                setDisplayName(s.displayName || '');
                setChatStatus(s.chatStatus || 'disponivel');
                setChatStatusMsg(s.chatStatusMsg || '');
                // Prefs de notificação do servidor têm prioridade sobre o local.
                if (s.chatNotifPrefs) setNotif(setNotifPrefs(s.chatNotifPrefs));
            } catch (e) {
                if (alive) setProfileMsg({ type: 'error', text: 'Erro ao carregar perfil.' });
            } finally {
                if (alive) setLoadingProfile(false);
            }
        })();
        return () => { alive = false; };
    }, [apiClient]);

    const saveProfile = async (e) => {
        e.preventDefault();
        setSavingProfile(true);
        setProfileMsg(null);
        try {
            const saved = await apiClient.updateMySettings({ displayName, chatStatus, chatStatusMsg });
            // Propaga o status escolhido pelo socket (presença em tempo real).
            if (socket) socket.emit('chat:setStatus', { status: chatStatus, statusMsg: chatStatusMsg });
            setProfileMsg({ type: 'success', text: 'Perfil atualizado!' });
            onProfileSaved?.(saved);
        } catch (err) {
            setProfileMsg({ type: 'error', text: err.message || 'Erro ao salvar.' });
        } finally {
            setSavingProfile(false);
        }
    };

    // Salva prefs de notificação: local (imediato, p/ o player) + servidor.
    const persistNotif = (patch) => {
        const next = setNotifPrefs(patch);
        setNotif(next);
        apiClient.updateMySettings({ chatNotifPrefs: next }).catch(() => {});
    };
    const setEvent = (key, field, value) => {
        const events = { ...notif.events, [key]: { ...notif.events[key], [field]: value } };
        persistNotif({ events });
    };

    const submitPassword = async (e) => {
        e.preventDefault();
        setPwMsg(null);
        if (newPassword !== confirmPassword) {
            setPwMsg({ type: 'error', text: 'As novas senhas não conferem.' });
            return;
        }
        if (newPassword.length < 6) {
            setPwMsg({ type: 'error', text: 'A nova senha deve ter no mínimo 6 caracteres.' });
            return;
        }
        setPwLoading(true);
        try {
            await apiClient.changePassword({ currentPassword, newPassword });
            setPwMsg({ type: 'success', text: 'Senha alterada com sucesso!' });
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        } catch (err) {
            setPwMsg({ type: 'error', text: err.message || 'Erro ao alterar senha.' });
        } finally {
            setPwLoading(false);
        }
    };

    const inputCls = 'w-full p-2 border rounded focus:border-yellow-500 outline-none text-sm';

    return (
        <ModalShell onClose={onClose} title="Configurações" subtitle="Perfil, notificações e segurança" width={460}>
            {/* Abas */}
            <div className="flex gap-1 mb-4 border-b border-gray-100">
                {TABS.map(t => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${active ? 'border-yellow-400 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                        >
                            <Icon size={15} /> {t.label}
                        </button>
                    );
                })}
            </div>

            {/* PERFIL */}
            {tab === 'perfil' && (
                loadingProfile ? (
                    <div className="text-sm text-gray-400 py-6 text-center">Carregando…</div>
                ) : (
                    <form onSubmit={saveProfile} className="space-y-3">
                        {profileMsg && (
                            <div className={`p-2 rounded text-sm text-center ${profileMsg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {profileMsg.text}
                            </div>
                        )}
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nome de exibição (chat)</label>
                            <input type="text" maxLength={120} value={displayName} onChange={e => setDisplayName(e.target.value)} className={inputCls} placeholder="Como você aparece no chat" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Status</label>
                            <div className="grid grid-cols-1 gap-1">
                                {STATUS_ORDER.map(st => {
                                    const meta = CHAT_STATUS[st];
                                    const active = chatStatus === st;
                                    return (
                                        <button
                                            type="button"
                                            key={st}
                                            onClick={() => setChatStatus(st)}
                                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-sm text-left transition-colors ${active ? 'bg-yellow-50 ring-1 ring-yellow-300' : 'hover:bg-gray-50'}`}
                                        >
                                            <Circle size={10} fill={meta.dot} color={meta.dot} />
                                            <span className={active ? 'font-semibold text-gray-900' : 'text-gray-600'}>{meta.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Recado pessoal</label>
                            <input type="text" maxLength={140} value={chatStatusMsg} onChange={e => setChatStatusMsg(e.target.value)} className={inputCls} placeholder="Ex.: Na obra hoje" />
                        </div>
                        <div className="flex justify-end pt-1">
                            <button type="submit" disabled={savingProfile} className="px-4 py-2 bg-yellow-400 text-gray-900 rounded hover:bg-yellow-500 text-sm font-bold disabled:opacity-50">
                                {savingProfile ? 'Salvando…' : 'Salvar perfil'}
                            </button>
                        </div>
                    </form>
                )
            )}

            {/* NOTIFICAÇÕES */}
            {tab === 'notificacoes' && (
                <div className="space-y-3">
                    <p className="text-xs text-gray-500">Escolha o que notificar e o som de cada evento do mensageiro.</p>

                    <div className="border rounded-lg divide-y">
                        {EVENT_LABELS.map(({ key, label }) => {
                            const ev = notif.events[key] || {};
                            return (
                                <div key={key} className="flex items-center gap-2 px-2.5 py-2">
                                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                                        <input
                                            type="checkbox" checked={!!ev.notify}
                                            onChange={() => setEvent(key, 'notify', !ev.notify)}
                                            className="accent-yellow-500"
                                        />
                                        <span className="text-sm text-gray-700 truncate">{label}</span>
                                    </label>
                                    <select
                                        value={ev.sound || 'ding'}
                                        onChange={e => setEvent(key, 'sound', e.target.value)}
                                        disabled={!ev.notify}
                                        className="text-xs border rounded px-1 py-1 outline-none disabled:opacity-40"
                                    >
                                        {SOUND_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                                    </select>
                                    <button
                                        type="button" onClick={() => previewSound(ev.sound || 'ding')}
                                        className="p-1 text-gray-400 hover:text-gray-700" title="Ouvir"
                                    >
                                        <Play size={14} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    <div className="border rounded-lg px-2.5 py-1">
                        <Toggle checked={!!notif.dnd} onChange={() => persistNotif({ dnd: !notif.dnd })} label="Não perturbe (silencia todos os sons)" />
                        <Toggle checked={notif.previewText !== false} onChange={() => persistNotif({ previewText: notif.previewText === false })} label="Mostrar prévia do texto" />
                    </div>

                    <div className="border rounded-lg px-2.5 py-2">
                        <div className="text-sm text-gray-700 mb-1">Horário de silêncio</div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-xs text-gray-500">Das</span>
                            <input type="time" value={notif.quietStart || ''} onChange={e => persistNotif({ quietStart: e.target.value })} className="border rounded px-1.5 py-1 text-sm" />
                            <span className="text-xs text-gray-500">às</span>
                            <input type="time" value={notif.quietEnd || ''} onChange={e => persistNotif({ quietEnd: e.target.value })} className="border rounded px-1.5 py-1 text-sm" />
                            {(notif.quietStart || notif.quietEnd) && (
                                <button type="button" onClick={() => persistNotif({ quietStart: '', quietEnd: '' })} className="text-xs text-gray-400 hover:text-gray-600 underline">limpar</button>
                            )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">No intervalo, os sons ficam silenciados (mensagens continuam chegando).</p>
                    </div>
                </div>
            )}

            {/* SEGURANÇA */}
            {tab === 'seguranca' && (
                <form onSubmit={submitPassword} className="space-y-3">
                    {pwMsg && (
                        <div className={`p-2 rounded text-sm text-center ${pwMsg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {pwMsg.text}
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Senha atual</label>
                        <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className={inputCls} required />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nova senha</label>
                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputCls} required />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Confirmar nova senha</label>
                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputCls} required />
                    </div>
                    <div className="flex justify-end pt-1">
                        <button type="submit" disabled={pwLoading} className="px-4 py-2 bg-yellow-400 text-gray-900 rounded hover:bg-yellow-500 text-sm font-bold disabled:opacity-50">
                            {pwLoading ? 'Salvando…' : 'Alterar senha'}
                        </button>
                    </div>
                </form>
            )}
        </ModalShell>
    );
};

export default SettingsModal;
