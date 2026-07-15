import React, { useEffect, useState } from 'react';
import { User, Bell, Lock, Circle } from 'lucide-react';
import ModalShell from '../ui/ModalShell';
import { CHAT_STATUS, STATUS_ORDER, getStatusMeta } from '../../utils/chatStatus';
import { getSoundPrefs, setSoundPrefs } from '../../utils/chatSounds';

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

    // Notificações (sons)
    const [sounds, setSounds] = useState(getSoundPrefs());

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

    const toggleSound = (key) => {
        const next = { ...sounds, [key]: !sounds[key] };
        setSounds(next);
        setSoundPrefs(next);
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
                <div>
                    <p className="text-xs text-gray-500 mb-2">Sons do mensageiro interno.</p>
                    <Toggle checked={sounds.ding} onChange={() => toggleSound('ding')} label="Nova mensagem (ding)" />
                    <Toggle checked={sounds.nudge} onChange={() => toggleSound('nudge')} label="Chamar atenção (nudge)" />
                    <Toggle checked={sounds.presence} onChange={() => toggleSound('presence')} label="Contato entrar / sair (online-offline)" />
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
