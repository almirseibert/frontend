import React, { useState, useEffect, useCallback } from 'react';
import {
    Droplet, ArrowUpCircle, ArrowDownCircle, RefreshCw,
    LogOut, Lock, Loader, Clock, FileText, Recycle,
} from 'lucide-react';

import ComboioDistribuicaoModal from '../components/modals/ComboioDistribuicaoModal';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { useAuth } from '../contexts/AuthContext';
import { getComboioTanks, comboioTankLabel } from '../utils/fuelTypes';
import { formatDateTimeBRT } from '../utils/dateBRT';

const RECENTES = 30;

// ─── Barra de Combustível ─────────────────────────────────────────────────────
// Sem capacidade cadastrada não inventamos porcentagem (antes assumia 2000 L).
const FuelBar = ({ tanque }) => {
    const pct = tanque.pct == null ? null : Math.min(Math.max(tanque.pct, 0), 100);
    const baixo = tanque.pct != null && tanque.pct <= 20;
    return (
        <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
                <span className="font-bold text-gray-300">{tanque.label}</span>
                <span className="text-white font-mono">
                    {tanque.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L
                    {tanque.capacidade ? <> &nbsp;/&nbsp; {tanque.capacidade.toLocaleString('pt-BR')} L</> : null}
                </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3">
                <div className="h-3 rounded-full transition-all" style={{ width: `${pct ?? 0}%`, background: baixo ? '#fab219' : '#c9a15e' }} />
            </div>
            <div className="text-right text-[11px] text-gray-400 mt-0.5">
                {pct == null ? 'capacidade não cadastrada' : `${pct.toFixed(1)}%${baixo ? ' · nível baixo' : ''}`}
            </div>
        </div>
    );
};

// ─── Componente Principal ─────────────────────────────────────────────────────
const ComboioMobilePage = ({
    apiClient,
    user,
    comboio: initialComboio,
    comboios = [],
    vehicles = [],
    obras = [],
    employees = [],
    setAlertMessage,
    socket,
    onVoltar,
    onAbrirDocumentos,
}) => {
    const { logout } = useAuth();
    // Operador com mais de um comboio vinculado escolhe qual está operando.
    const opcoes = comboios.length > 0 ? comboios : [initialComboio];
    const [comboioId, setComboioId] = useState(initialComboio.id);
    const [comboio, setComboio] = useState(initialComboio);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showSaida, setShowSaida] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    // Só o necessário: o próprio comboio e as últimas movimentações dele.
    // Antes baixava a tabela inteira de movimentações e todos os veículos.
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [hist, fresh] = await Promise.all([
                apiClient.getComboioTransactionsByScope('historico', { comboioVehicleId: comboioId, limit: RECENTES }),
                apiClient.getVehicleById(comboioId).catch(() => null),
            ]);
            setTransactions(Array.isArray(hist?.data) ? hist.data : []);
            if (fresh) setComboio(fresh);
        } catch (e) {
            console.error('[ComboioMobilePage] fetchData:', e);
        } finally {
            setLoading(false);
        }
    }, [apiClient, comboioId]);

    useEffect(() => {
        const escolhido = opcoes.find(c => c.id === comboioId);
        if (escolhido) setComboio(escolhido);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [comboioId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // O operador fica na sala 'operadores', que não recebe o server:sync do
    // comboio. O backend emite 'comboio:saldo' com o id do comboio alterado.
    useEffect(() => {
        if (!socket) return undefined;
        const onSaldo = ({ comboioVehicleId } = {}) => {
            if (!comboioVehicleId || comboioVehicleId === comboioId) fetchData();
        };
        socket.on('comboio:saldo', onSaldo);
        return () => socket.off('comboio:saldo', onSaldo);
    }, [socket, fetchData, comboioId]);

    const tanques = getComboioTanks(comboio);
    const primeiroNome = String(user?.name || user?.nome || 'Operador').split(' ')[0];

    return (
        <div className="min-h-screen bg-gray-100">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="bg-gray-900 text-white px-4 pt-6 pb-10 relative overflow-hidden">
                <div className="absolute right-0 top-0 opacity-5 pointer-events-none">
                    <Droplet size={180} />
                </div>

                <div className="flex justify-between items-start mb-5 relative z-10">
                    <div className="overflow-hidden">
                        {onVoltar && (
                            <button
                                onClick={onVoltar}
                                className="flex items-center gap-1 text-gray-400 hover:text-white text-xs mb-2 transition"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                                Voltar
                            </button>
                        )}
                        <h1 className="text-xl font-bold truncate">Olá, {primeiroNome}</h1>
                        <p className="text-gray-400 text-sm">Operador de Comboio</p>
                        {opcoes.length > 1 ? (
                            <select
                                value={comboioId}
                                onChange={(e) => setComboioId(e.target.value)}
                                className="mt-1 text-xs font-mono"
                                style={{ background: '#1f2937', color: '#fcd34d', border: '1px solid #374151' }}
                                aria-label="Comboio em operação"
                            >
                                {opcoes.map(c => (
                                    <option key={c.id} value={c.id}>{c.registroInterno} · {c.modelo || ''}</option>
                                ))}
                            </select>
                        ) : (
                            <p className="text-yellow-400 text-xs font-mono mt-0.5">
                                {comboio.registroInterno} · {comboio.modelo || ''}
                            </p>
                        )}
                    </div>
                    <div className="flex gap-2 items-center shrink-0">
                        {onAbrirDocumentos && (
                            <button
                                onClick={onAbrirDocumentos}
                                className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition"
                                title="Documentos (PDFs)"
                            >
                                <FileText size={20} />
                            </button>
                        )}
                        <button
                            onClick={() => setShowPasswordModal(true)}
                            className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition"
                            title="Alterar Senha"
                        >
                            <Lock size={20} />
                        </button>
                        <button
                            onClick={fetchData}
                            className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition"
                            title="Atualizar"
                        >
                            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            onClick={logout}
                            className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center gap-2 shadow-sm"
                            title="Sair"
                        >
                            <LogOut size={18} />
                            <span className="text-xs font-bold hidden sm:inline">SAIR</span>
                        </button>
                    </div>
                </div>

                {/* Barras de combustível */}
                <div className="relative z-10">
                    {tanques.map(t => <FuelBar key={t.key} tanque={t} />)}
                </div>
            </div>

            {/* ── Botão de ação ──────────────────────────────────────────── */}
            {/* Operador do comboio só distribui combustível (Abastecer). A entrada
                (carregar o comboio no posto) é uma ordem emitida pelo setor de frotas. */}
            <div className="px-4 -mt-5 relative z-20">
                <button
                    onClick={() => setShowSaida(true)}
                    className="w-full py-5 bg-yellow-400 text-gray-900 font-bold rounded-2xl shadow-lg flex items-center justify-center gap-3 hover:bg-yellow-300 transition active:scale-95"
                >
                    <ArrowDownCircle size={28} />
                    <span className="text-base tracking-wide">ABASTECER VEÍCULO</span>
                </button>
            </div>

            {/* ── Histórico de transações ────────────────────────────────── */}
            <div className="px-4 mt-6 pb-10">
                <h2 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                    <Clock size={13} /> Transações Recentes
                </h2>

                {loading && transactions.length === 0 ? (
                    <div className="flex justify-center py-10">
                        <Loader size={28} className="animate-spin text-yellow-500" />
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200">
                        <p className="text-gray-400 text-sm">Nenhuma transação registrada.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {transactions.map(t => {
                            const isEntrada = t.type === 'entrada';
                            const isDrenagem = t.type === 'drenagem';
                            const bloqueada = t.status === 'BloqueadoLeitura' || t.status === 'BloqueadoOrcamento';
                            const titulo = isEntrada
                                ? (t.partnerName || 'Posto')
                                : isDrenagem
                                    ? `Drenagem ← ${t.drainingVehicleName || 'veículo'}`
                                    : `${t.receivingVehicleName || 'Veículo'}${t.receivingVehicleModelo ? ` · ${t.receivingVehicleModelo}` : ''}`;
                            const Icone = isEntrada ? ArrowUpCircle : isDrenagem ? Recycle : ArrowDownCircle;

                            return (
                                <div
                                    key={t.id}
                                    className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center gap-3"
                                    style={{ border: `1px solid ${bloqueada ? '#e8c8bc' : '#f0ebe3'}` }}
                                >
                                    <div className={`p-2 rounded-full shrink-0 ${isEntrada || isDrenagem ? 'bg-blue-100 text-blue-600' : 'bg-yellow-100 text-yellow-700'}`}>
                                        <Icone size={18} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center gap-2">
                                            <span className="font-bold text-sm text-gray-800 truncate">{titulo}</span>
                                            <span className="text-xs font-mono text-gray-700 shrink-0 font-bold">
                                                {isEntrada || isDrenagem ? '+' : '−'}{parseFloat(t.liters || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-gray-100 text-gray-700">
                                                {comboioTankLabel(t.fuelType)}
                                            </span>
                                            <span className="text-[10px] text-gray-400">{formatDateTimeBRT(t.date)}</span>
                                            {bloqueada && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-red-100 text-red-700">
                                                    Aguardando liberação
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Modais ─────────────────────────────────────────────────── */}
            {showSaida && (
                <ComboioDistribuicaoModal
                    user={user}
                    comboioVehicle={comboio}
                    vehicles={vehicles}
                    obras={obras}
                    employees={employees}
                    transactions={transactions}
                    onClose={() => setShowSaida(false)}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    reloadData={fetchData}
                />
            )}

            {showPasswordModal && (
                <ChangePasswordModal
                    isOpen={showPasswordModal}
                    onClose={() => setShowPasswordModal(false)}
                />
            )}
        </div>
    );
};

export default ComboioMobilePage;
