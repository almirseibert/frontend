// pages/ComboioPage.js
//
// Controle de Comboio — espelha a tela de Abastecimento:
//   - cabeçalho com as ações (drenagem, ordem de entrada, saída);
//   - faixa com o nível dos tanques de todos os comboios (seleciona o comboio);
//   - coluna esquerda: PENDÊNCIAS (ordens de entrada aguardando baixa e saídas
//     bloqueadas aguardando o administrador);
//   - coluna direita: ÚLTIMAS MOVIMENTAÇÕES (busca e filtros no servidor) e a
//     ANÁLISE DETALHADA do comboio selecionado.
//
// Nada aqui depende do array global comboioTransactions: cada lista é buscada
// por escopo e recarregada quando o backend sinaliza mudança (server:sync).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Truck, PlusCircle, Recycle, Droplet, Search, History, CheckCircle, Edit, Trash2, Printer,
    Loader, Unlock, Camera, Image as ImageIcon, X, ArrowDownCircle, ArrowUpCircle, ChevronLeft,
    ChevronRight, BarChart3, ClipboardList, Lock,
} from 'lucide-react';

import ProtectedComponent from '../components/ProtectedComponent';
import ComboioTankStrip from '../components/comboio/ComboioTankStrip';
import ComboioAnalysisPanel from '../components/comboio/ComboioAnalysisPanel';
import ComboioEntradaOrderModal from '../components/modals/ComboioEntradaOrderModal';
import ComboioSaidaModal from '../components/modals/ComboioSaidaModal';
import ComboioDrenagemModal from '../components/modals/ComboioDrenagemModal';
import ConfirmRefuelingModal from '../components/modals/ConfirmRefuelingModal';
import { OrderDeliveryBadge, ReenviarOrdemButton, useOrderDeliveryStatus } from '../components/OrderDeliveryBadge';
import { useData } from '../contexts/DataContext';
import { generateAuthorizationPDF } from '../utils/refuelingAuthPdf';
import { resolveOrderPartnerName } from '../utils/partners';
import { fuelLabel, comboioTankLabel } from '../utils/fuelTypes';
import { formatDateTimeBRT, formatDateBRT } from '../utils/dateBRT';

// Base para servir imagens de /uploads (o backend serve estático fora de /api)
const IMG_BASE = (process.env.REACT_APP_API_URL || '').replace('/api', '');

const CARD = { border: '1px solid #f0ebe3', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' };
const TH = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9a8a78' };
const PAGE_SIZE = 20;

const pad6 = (n) => String(n || 0).padStart(6, '0');
const fmtL = (n) => `${(Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L`;

const TIPO_UI = {
    entrada: { label: 'Entrada', Icon: ArrowUpCircle, color: '#2d5a8a', bg: '#eef3f9' },
    saida: { label: 'Saída', Icon: ArrowDownCircle, color: '#9E7A42', bg: '#fdf8f0' },
    drenagem: { label: 'Drenagem', Icon: Recycle, color: '#5b6472', bg: '#eef1f5' },
};

const DESTINO_DRENAGEM = { comboio: 'para o comboio', transfusao: 'transfusão', eliminado: 'descartada' };

const isBloqueada = (status) => status === 'BloqueadoLeitura' || status === 'BloqueadoOrcamento';

const StatusChip = ({ status }) => {
    if (isBloqueada(status)) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800">
                <Lock size={10} /> {status === 'BloqueadoLeitura' ? 'Bloq. leitura' : 'Bloq. orçamento'}
            </span>
        );
    }
    if (status === 'Aberta') {
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-800">Aberta</span>;
    }
    return <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800">{status || 'Concluída'}</span>;
};

// Normaliza a coluna `fotos` (mysql2 pode devolver objeto já parseado ou string).
const parseFotos = (fotos) => {
    if (!fotos) return null;
    let obj = fotos;
    if (typeof obj === 'string') {
        try { obj = JSON.parse(obj); } catch { return null; }
    }
    if (!obj || typeof obj !== 'object') return null;
    const labels = {
        horimetro: 'Horímetro / Odômetro',
        re: 'RE / Placa',
        medidorZerado: 'Medidor zerado',
        litragem: 'Medidor com litragem',
    };
    const list = Object.entries(labels)
        .filter(([key]) => obj[key])
        .map(([key, label]) => ({ key, label, url: `${IMG_BASE}${obj[key]}` }));
    return list.length > 0 ? list : null;
};

const ComboioPage = ({
    user,
    vehicles = [],
    partners = [],
    obras = [],
    employees = [],
    setAlertMessage,
    apiClient,
    PasswordConfirmationModal,
    ConfirmationModal,
}) => {
    const { socket } = useData();
    const isAdmin = String(user?.user_type || user?.role || '').toLowerCase() === 'admin';

    const comboios = useMemo(
        () => vehicles.filter(v => v.isComboioVehicle).sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')),
        [vehicles]
    );

    const [selectedComboioId, setSelectedComboioId] = useState(null);
    useEffect(() => {
        if (comboios.length === 0) { setSelectedComboioId(null); return; }
        if (!selectedComboioId || !comboios.some(c => c.id === selectedComboioId)) {
            setSelectedComboioId(comboios[0].id);
        }
    }, [comboios, selectedComboioId]);
    const selectedComboio = comboios.find(c => c.id === selectedComboioId) || null;

    // ─── Listas por escopo ──────────────────────────────────────────────────
    const [refreshKey, setRefreshKey] = useState(0);
    const recarregar = useCallback(() => setRefreshKey(k => k + 1), []);

    const [pendencias, setPendencias] = useState({ entradas: [], saidas: [] });
    const [pendSearch, setPendSearch] = useState('');
    useEffect(() => {
        let cancelado = false;
        apiClient.getComboioPendencias()
            .then(r => { if (!cancelado) setPendencias({ entradas: r?.entradas || [], saidas: r?.saidas || [] }); })
            .catch(() => { if (!cancelado) setPendencias({ entradas: [], saidas: [] }); });
        return () => { cancelado = true; };
    }, [apiClient, refreshKey]);

    const [filtros, setFiltros] = useState({ search: '', type: '', somenteSelecionado: true, startDate: '', endDate: '' });
    const [page, setPage] = useState(1);
    const [historico, setHistorico] = useState({ data: [], total: 0 });
    const [loadingHistorico, setLoadingHistorico] = useState(false);
    const setFiltro = (patch) => { setFiltros(f => ({ ...f, ...patch })); setPage(1); };

    useEffect(() => {
        let cancelado = false;
        const params = {
            page,
            limit: PAGE_SIZE,
            search: filtros.search.trim(),
            type: filtros.type,
            startDate: filtros.startDate,
            endDate: filtros.endDate,
            comboioVehicleId: filtros.somenteSelecionado ? selectedComboioId : '',
        };
        if (filtros.somenteSelecionado && !selectedComboioId) return undefined;
        setLoadingHistorico(true);
        // Pequeno atraso para a digitação na busca não disparar uma consulta por tecla.
        const t = setTimeout(() => {
            apiClient.getComboioTransactionsByScope('historico', params)
                .then(r => { if (!cancelado) setHistorico({ data: r?.data || [], total: r?.total || 0 }); })
                .catch(() => { if (!cancelado) setHistorico({ data: [], total: 0 }); })
                .finally(() => { if (!cancelado) setLoadingHistorico(false); });
        }, 250);
        return () => { cancelado = true; clearTimeout(t); };
    }, [apiClient, filtros, page, selectedComboioId, refreshKey]);

    // Recarrega quando o backend sinaliza mudança (outro gestor, app do operador).
    useEffect(() => {
        if (!socket) return undefined;
        let timer = null;
        const onSync = ({ targets } = {}) => {
            if (Array.isArray(targets) && !targets.some(t => t === 'comboio' || t === 'refuelings')) return;
            if (timer) return;
            timer = setTimeout(() => { timer = null; recarregar(); }, 400);
        };
        socket.on('server:sync', onSync);
        return () => {
            socket.off('server:sync', onSync);
            if (timer) clearTimeout(timer);
        };
    }, [socket, recarregar]);

    // ─── Status de entrega das ordens de entrada (chegou ao posto?) ────────
    const [deliveryRefreshKey, setDeliveryRefreshKey] = useState(0);
    const authNumbersEntrada = useMemo(() => [
        ...pendencias.entradas.map(o => o.authNumber),
        ...historico.data.filter(r => r.type === 'entrada').map(r => r.authNumber),
    ].filter(n => n != null), [pendencias.entradas, historico.data]);
    const { statusMap: deliveryMap, recarregar: recarregarEntrega } = useOrderDeliveryStatus(authNumbersEntrada, deliveryRefreshKey);

    useEffect(() => {
        if (!socket) return undefined;
        const bump = () => setDeliveryRefreshKey(k => k + 1);
        socket.on('ordem:falha_envio', bump);
        socket.on('ordem:envio_recuperado', bump);
        return () => {
            socket.off('ordem:falha_envio', bump);
            socket.off('ordem:envio_recuperado', bump);
        };
    }, [socket]);

    useEffect(() => {
        if (pendencias.entradas.length === 0) return undefined;
        const t = setTimeout(() => setDeliveryRefreshKey(k => k + 1), 8000);
        return () => clearTimeout(t);
    }, [pendencias.entradas.length]);

    // ─── Derivados ──────────────────────────────────────────────────────────
    const pendenciasPorComboio = useMemo(() => {
        const map = {};
        pendencias.entradas.forEach(o => { map[o.vehicleId] = (map[o.vehicleId] || 0) + 1; });
        pendencias.saidas.forEach(s => { map[s.comboioVehicleId] = (map[s.comboioVehicleId] || 0) + 1; });
        return map;
    }, [pendencias]);

    const vehicleById = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles]);

    const termo = pendSearch.trim().toLowerCase();
    const casaBusca = (...campos) => !termo || campos.some(c => String(c || '').toLowerCase().includes(termo));
    const entradasFiltradas = pendencias.entradas.filter(o =>
        casaBusca(o.authNumber, o.comboioRegistroInterno, o.comboioPlaca, o.partnerName));
    const saidasFiltradas = pendencias.saidas.filter(s =>
        casaBusca(s.authNumber, s.receivingVehicleName, s.receivingVehiclePlaca, s.comboioRegistroInterno, s.obraName));
    const totalPendencias = pendencias.entradas.length + pendencias.saidas.length;

    // ─── PDF ────────────────────────────────────────────────────────────────
    const [pdfBusyId, setPdfBusyId] = useState(null);
    const pdfCtx = { vehicles, partners, employees };

    const gerarPdf = async (dados, variant, busyId) => {
        setPdfBusyId(busyId || dados.id);
        try {
            await generateAuthorizationPDF(dados, pdfCtx, { variant });
        } catch (e) {
            console.error('Erro ao gerar PDF:', e);
            setAlertMessage('Erro ao gerar o PDF.');
        } finally {
            setPdfBusyId(null);
        }
    };
    // Usado pelos modais logo após salvar.
    const pdfEntradaOrder = (order) => generateAuthorizationPDF(order, pdfCtx, { variant: 'entrada_comboio' });
    const pdfSaida = (ct) => generateAuthorizationPDF(ct, pdfCtx, { variant: 'saida_comboio' });

    const pdfDaMovimentacao = (row) => {
        if (row.type === 'saida') return gerarPdf(row, 'saida_comboio');
        if (row.type === 'entrada') {
            return gerarPdf({
                ...row,
                vehicleId: row.comboioVehicleId,
                data: row.date,
                litrosLiberados: row.liters,
                litrosAbastecidos: row.liters,
                status: 'Concluída',
                createdBy: { userEmail: row.responsibleUserEmail },
            }, 'entrada_comboio');
        }
        return null;
    };

    // ─── Modais e ações ─────────────────────────────────────────────────────
    const [modal, setModal] = useState({ type: null, data: null });
    const fecharModal = () => setModal({ type: null, data: null });
    const [viewPhotos, setViewPhotos] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null); // { kind, id, message }
    const [confirmForce, setConfirmForce] = useState(null);   // { kind, id, message }
    const [liberarTarget, setLiberarTarget] = useState(null);
    const [busyId, setBusyId] = useState(null);

    const abrirCorrecaoBaixa = async (row) => {
        if (!row.refuelingId) {
            setAlertMessage('Entrada antiga sem vínculo com a ordem de origem: exclua e lance novamente.');
            return;
        }
        setBusyId(row.id);
        try {
            const ordem = await apiClient.getRefuelingById(row.refuelingId);
            setModal({ type: 'baixa', data: ordem });
        } catch (e) {
            setAlertMessage(`Não foi possível abrir a ordem: ${e.message}`);
        } finally {
            setBusyId(null);
        }
    };

    const executarExclusao = async ({ kind, id }, force = false) => {
        try {
            if (kind === 'entradaOrder') await apiClient.deleteComboioEntradaOrder(id, { force });
            else await apiClient.deleteComboioTransaction(id, { force });
            setAlertMessage(kind === 'entradaOrder' ? 'Ordem de entrada excluída.' : 'Movimentação excluída e saldos revertidos.');
            recarregar();
        } catch (e) {
            if (e?.data?.code === 'NEGATIVE_STOCK' && isAdmin && !force) {
                setConfirmForce({ kind, id, message: `${e.message} Como administrador você pode forçar a exclusão; o tanque ficará zerado para esse combustível.` });
            } else {
                setAlertMessage(`Erro ao excluir: ${e.message}`);
            }
        }
    };

    const handleLiberar = async () => {
        const alvo = liberarTarget;
        setLiberarTarget(null);
        if (!alvo) return;
        setBusyId(alvo.id);
        try {
            const r = await apiClient.liberarComboioSaida(alvo.id);
            setAlertMessage(r?.message || 'Saída liberada.');
            recarregar();
        } catch (e) {
            setAlertMessage(`Erro ao liberar: ${e.message}`);
        } finally {
            setBusyId(null);
        }
    };

    const iconBtn = 'p-1.5 rounded disabled:opacity-40';

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 animate-fadeIn space-y-6">
            {/* CABEÇALHO */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-5 rounded-xl" style={CARD}>
                <div>
                    <h1 className="flex items-center gap-2" style={{ fontSize: 22, fontWeight: 700, color: '#1e1a14' }}>
                        <Truck size={20} style={{ color: '#9E7A42' }} /> Controle de Comboio
                    </h1>
                    <p style={{ fontSize: 12, color: '#9a8a78' }}>Estoque dos tanques, ordens de entrada no posto e distribuição para a frota.</p>
                </div>
                <ProtectedComponent requiredPermission="editor">
                    <div className="flex flex-wrap gap-2 w-full md:w-auto">
                        <button onClick={() => setModal({ type: 'drenagem' })}
                            className="flex-1 md:flex-none flex items-center gap-2 px-4 py-2.5 justify-center mak-btn mak-btn-dark text-sm font-bold">
                            <Recycle size={16} /> Drenagem
                        </button>
                        <button onClick={() => setModal({ type: 'entradaOrder', data: null })}
                            className="flex-1 md:flex-none flex items-center gap-2 px-4 py-2.5 justify-center mak-btn mak-btn-primary text-sm font-bold"
                            disabled={comboios.length === 0}>
                            <PlusCircle size={16} /> Ordem de Entrada
                        </button>
                        <button onClick={() => setModal({ type: 'saida', data: null })}
                            className="flex-1 md:flex-none flex items-center gap-2 px-4 py-2.5 justify-center mak-btn mak-btn-primary text-sm font-bold"
                            disabled={comboios.length === 0}>
                            <Droplet size={16} /> Registrar Saída
                        </button>
                    </div>
                </ProtectedComponent>
            </div>

            {/* TANQUES DE TODOS OS COMBOIOS */}
            <div className="bg-white p-5 rounded-xl" style={CARD}>
                <h2 className="mb-3 pb-2 flex items-center gap-2" style={{ fontSize: 14, fontWeight: 700, color: '#1e1a14', borderBottom: '1px solid #f0ebe3' }}>
                    <Droplet size={16} style={{ color: '#9E7A42' }} /> Estoque dos comboios
                </h2>
                <ComboioTankStrip
                    comboios={comboios}
                    obras={obras}
                    selectedId={selectedComboioId}
                    onSelect={(id) => { setSelectedComboioId(id); setPage(1); }}
                    pendenciasPorComboio={pendenciasPorComboio}
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* PENDÊNCIAS */}
                <div className="xl:col-span-4 space-y-4">
                    <div className="bg-white p-5 rounded-xl h-full flex flex-col" style={CARD}>
                        <h2 className="mb-4 pb-2 flex justify-between items-center" style={{ fontSize: 14, fontWeight: 700, color: '#1e1a14', borderBottom: '1px solid #f0ebe3' }}>
                            <span className="flex items-center gap-2"><ClipboardList size={16} style={{ color: '#9E7A42' }} /> Pendências</span>
                            <span style={{ background: '#fdf8f0', color: '#9E7A42', border: '1px solid #e8d8b8', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999 }}>{totalPendencias}</span>
                        </h2>

                        <div className="relative mb-3">
                            <input
                                type="text"
                                placeholder="Buscar: Nº, comboio, veículo ou posto..."
                                value={pendSearch}
                                onChange={e => setPendSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm outline-none"
                            />
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                        </div>

                        <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[640px]">
                            {/* Saídas bloqueadas primeiro: dependem de ação do admin */}
                            {saidasFiltradas.map(s => {
                                const fotos = parseFotos(s.fotos);
                                return (
                                    <div key={s.id} className="p-4 rounded-lg" style={{ border: '1px solid #f0ebe3', borderLeft: '4px solid #b03828', background: '#fdf0ec' }}>
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="min-w-0">
                                                <div style={{ fontWeight: 700, fontSize: 16, color: '#3d3528' }}>#{pad6(s.authNumber)}</div>
                                                <p style={{ fontSize: 13, fontWeight: 600, color: '#6a5e4e' }}>
                                                    Saída → {s.receivingVehicleName}{s.receivingVehiclePlaca ? ` — ${s.receivingVehiclePlaca}` : ''}
                                                </p>
                                                <p style={{ fontSize: 11, color: '#9a8a78' }}>
                                                    {s.comboioRegistroInterno} · {comboioTankLabel(s.fuelType)} · <strong>{fmtL(s.liters)}</strong>
                                                </p>
                                                <p style={{ fontSize: 11, color: '#9a8a78' }}>{formatDateTimeBRT(s.date)}{s.obraName ? ` · ${s.obraName}` : ''}</p>
                                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999, background: '#fdf0ec', color: '#b03828', border: '1px solid #e8c8bc', display: 'inline-block', marginTop: 4 }}>
                                                    ⛔ Aguardando Administrador
                                                </span>
                                                {s.motivoBloqueio && <p style={{ fontSize: 11, color: '#b03828', marginTop: 4 }}>{s.motivoBloqueio}</p>}
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <ProtectedComponent requiredPermission="admin">
                                                    <button onClick={() => setLiberarTarget(s)} disabled={busyId === s.id} title="Liberar saída"
                                                        style={{ padding: 5, background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 6, cursor: 'pointer', lineHeight: 0 }}>
                                                        {busyId === s.id ? <Loader size={14} className="animate-spin" /> : <Unlock size={14} />}
                                                    </button>
                                                </ProtectedComponent>
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => setModal({ type: 'saida', data: s })} title="Corrigir"
                                                        style={{ padding: 5, background: '#fdf8f0', color: '#9E7A42', border: 'none', borderRadius: 6, cursor: 'pointer', lineHeight: 0 }}>
                                                        <Edit size={14} />
                                                    </button>
                                                    <button onClick={() => setConfirmDelete({ kind: 'ct', id: s.id, message: 'Excluir esta saída bloqueada? O diesel volta ao saldo do comboio.' })} title="Excluir (negar)"
                                                        style={{ padding: 5, background: '#fdf0ec', color: '#b03828', border: 'none', borderRadius: 6, cursor: 'pointer', lineHeight: 0 }}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </ProtectedComponent>
                                                {fotos && (
                                                    <button onClick={() => setViewPhotos({ title: s.receivingVehicleName, fotos })} title="Fotos"
                                                        style={{ padding: 5, background: '#fff', border: '1px solid #e8e0d4', color: '#9a8a78', borderRadius: 6, cursor: 'pointer', lineHeight: 0 }}>
                                                        <Camera size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {entradasFiltradas.map(o => (
                                <div key={o.id} className="p-4 rounded-lg" style={{ border: '1px solid #f0ebe3', borderLeft: '4px solid #9E7A42', background: '#faf9f7' }}>
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="min-w-0">
                                            <div style={{ fontWeight: 700, fontSize: 16, color: '#3d3528' }}>#{pad6(o.authNumber)}</div>
                                            <p style={{ fontSize: 13, fontWeight: 600, color: '#6a5e4e' }}>
                                                Entrada → {o.comboioRegistroInterno}{o.comboioPlaca ? ` — ${o.comboioPlaca}` : ''}
                                            </p>
                                            <p style={{ fontSize: 11, color: '#9a8a78' }}>
                                                {fuelLabel(o.fuelType)} · {o.isFillUp ? 'completar tanque' : fmtL(o.litrosLiberados)}
                                            </p>
                                            <p style={{ fontSize: 11, color: '#9a8a78' }}>{formatDateBRT(o.data)}</p>
                                            <p style={{ fontSize: 11, color: '#b0a090' }}>{resolveOrderPartnerName(partners.find(p => p.id === o.partnerId), o.partnerName, '...')}</p>
                                            <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
                                                <OrderDeliveryBadge info={deliveryMap[String(o.authNumber)]} />
                                                <ReenviarOrdemButton info={deliveryMap[String(o.authNumber)]} setAlertMessage={setAlertMessage} onDone={recarregarEntrega} />
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <ProtectedComponent requiredPermission="editor">
                                                <div className="flex gap-1 mb-1">
                                                    <button onClick={() => setModal({ type: 'baixa', data: o })} title="Dar baixa"
                                                        style={{ padding: 5, background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 6, cursor: 'pointer', lineHeight: 0 }}>
                                                        <CheckCircle size={14} />
                                                    </button>
                                                    <button onClick={() => setModal({ type: 'entradaOrder', data: o })} title="Editar"
                                                        style={{ padding: 5, background: '#fdf8f0', color: '#9E7A42', border: 'none', borderRadius: 6, cursor: 'pointer', lineHeight: 0 }}>
                                                        <Edit size={14} />
                                                    </button>
                                                    <button onClick={() => setConfirmDelete({ kind: 'entradaOrder', id: o.id, message: 'Excluir esta ordem de entrada? O empenho no posto será estornado.' })} title="Excluir"
                                                        style={{ padding: 5, background: '#fdf0ec', color: '#b03828', border: 'none', borderRadius: 6, cursor: 'pointer', lineHeight: 0 }}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </ProtectedComponent>
                                            <button onClick={() => gerarPdf({ ...o, comboioEntrada: 1 }, 'entrada_comboio')} disabled={pdfBusyId === o.id} title="PDF"
                                                style={{ padding: 5, background: '#fff', border: '1px solid #e8e0d4', color: '#9a8a78', borderRadius: 6, cursor: 'pointer', lineHeight: 0, display: 'flex', justifyContent: 'center' }}>
                                                {pdfBusyId === o.id ? <Loader size={14} className="animate-spin" /> : <Printer size={14} />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {totalPendencias === 0 && <p className="text-center text-gray-400 py-4 italic">Nenhuma pendência.</p>}
                            {totalPendencias > 0 && entradasFiltradas.length + saidasFiltradas.length === 0 && (
                                <p className="text-center text-gray-400 py-4 italic">Nada encontrado para "{pendSearch}".</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="xl:col-span-8 space-y-6">
                    {/* ÚLTIMAS MOVIMENTAÇÕES */}
                    <div className="bg-white p-5 rounded-xl" style={CARD}>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 pb-2 gap-3" style={{ borderBottom: '1px solid #f0ebe3' }}>
                            <h2 className="flex items-center gap-2" style={{ fontSize: 14, fontWeight: 700, color: '#1e1a14' }}>
                                <History size={16} style={{ color: '#2d5a8a' }} /> Últimas Movimentações
                                {loadingHistorico && <Loader size={12} className="animate-spin text-gray-400" />}
                            </h2>
                            <div className="relative w-full sm:w-64">
                                <input
                                    type="text"
                                    placeholder="Filtrar por Nº, RE, placa, posto, NF..."
                                    value={filtros.search}
                                    onChange={e => setFiltro({ search: e.target.value })}
                                    className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm outline-none"
                                />
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mb-3" style={{ fontSize: 12 }}>
                            <select value={filtros.type} onChange={e => setFiltro({ type: e.target.value })} aria-label="Tipo" style={{ fontSize: 12 }}>
                                <option value="">Todos os tipos</option>
                                <option value="entrada">Entradas</option>
                                <option value="saida">Saídas</option>
                                <option value="drenagem">Drenagens</option>
                            </select>
                            <input type="date" value={filtros.startDate} onChange={e => setFiltro({ startDate: e.target.value })} aria-label="De" style={{ fontSize: 12 }} />
                            <span style={{ color: '#9a8a78' }}>até</span>
                            <input type="date" value={filtros.endDate} onChange={e => setFiltro({ endDate: e.target.value })} aria-label="Até" style={{ fontSize: 12 }} />
                            <label className="flex items-center gap-1.5 cursor-pointer" style={{ color: '#6a5e4e' }}>
                                <input type="checkbox" checked={filtros.somenteSelecionado} onChange={e => setFiltro({ somenteSelecionado: e.target.checked })} />
                                Só {selectedComboio ? selectedComboio.registroInterno : 'o comboio selecionado'}
                            </label>
                            {(filtros.search || filtros.type || filtros.startDate || filtros.endDate) && (
                                <button type="button" onClick={() => setFiltro({ search: '', type: '', startDate: '', endDate: '' })} style={{ color: '#9E7A42', fontWeight: 600 }}>
                                    Limpar filtros
                                </button>
                            )}
                        </div>

                        <div className="overflow-x-auto max-h-[520px] overflow-y-auto custom-scrollbar" style={{ opacity: loadingHistorico ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                            <table className="w-full text-sm text-left">
                                <thead className="sticky top-0 z-10" style={{ background: '#faf9f7', borderBottom: '1px solid #f0ebe3' }}>
                                    <tr>
                                        <th className="p-3" style={TH}>Nº</th>
                                        <th className="p-3" style={TH}>Tipo</th>
                                        <th className="p-3" style={TH}>Status</th>
                                        <th className="p-3" style={TH}>Data</th>
                                        <th className="p-3" style={TH}>Movimento</th>
                                        <th className="p-3 text-right" style={TH}>Litros</th>
                                        <th className="p-3 text-right" style={TH}>Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {historico.data.map(row => {
                                        const tipo = TIPO_UI[row.type] || TIPO_UI.saida;
                                        const TipoIcon = tipo.Icon;
                                        const fotos = parseFotos(row.fotos);
                                        const entra = row.type === 'entrada' || (row.type === 'drenagem' && (row.destino || 'comboio') === 'comboio');
                                        const veiculo = vehicleById.get(row.receivingVehicleId);
                                        return (
                                            <tr key={row.id} className="hover:bg-gray-50 align-top">
                                                <td className="p-3 font-bold whitespace-nowrap">{row.authNumber ? `#${pad6(row.authNumber)}` : '—'}</td>
                                                <td className="p-3">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap" style={{ background: tipo.bg, color: tipo.color }}>
                                                        <TipoIcon size={12} /> {tipo.label}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex flex-col gap-1 items-start">
                                                        <StatusChip status={row.status} />
                                                        {row.type === 'entrada' && <OrderDeliveryBadge info={deliveryMap[String(row.authNumber)]} />}
                                                    </div>
                                                </td>
                                                <td className="p-3 whitespace-nowrap">{formatDateTimeBRT(row.date)}</td>
                                                <td className="p-3" style={{ minWidth: 200 }}>
                                                    {row.type === 'entrada' && (
                                                        <>
                                                            <div>{row.comboioRegistroInterno} ← {row.partnerName || 'Posto'}</div>
                                                            <div style={{ fontSize: 11, color: '#9a8a78' }}>
                                                                {comboioTankLabel(row.fuelType)}
                                                                {row.invoiceNumber ? ` · NF ${row.invoiceNumber}` : ''}
                                                                {Number(row.pricePerLiter) > 0 ? ` · R$ ${Number(row.pricePerLiter).toFixed(3)}/L` : ''}
                                                            </div>
                                                        </>
                                                    )}
                                                    {row.type === 'saida' && (
                                                        <>
                                                            <div>{row.comboioRegistroInterno} → {row.receivingVehicleName}{row.receivingVehiclePlaca ? ` — ${row.receivingVehiclePlaca}` : ''}</div>
                                                            <div style={{ fontSize: 11, color: '#9a8a78' }}>
                                                                {comboioTankLabel(row.fuelType)}
                                                                {row.obraName ? ` · ${row.obraName}` : ''}
                                                                {row.horimetro ? ` · ${row.horimetro} h` : (row.odometro ? ` · ${row.odometro} Km` : '')}
                                                                {!veiculo && row.receivingVehicleModelo ? ` · ${row.receivingVehicleModelo}` : ''}
                                                            </div>
                                                        </>
                                                    )}
                                                    {row.type === 'drenagem' && (
                                                        <>
                                                            <div>{row.drainingVehicleName} → {DESTINO_DRENAGEM[row.destino || 'comboio']}{row.comboioRegistroInterno ? ` (${row.comboioRegistroInterno})` : ''}{row.receivingVehicleName ? ` (${row.receivingVehicleName})` : ''}</div>
                                                            {row.reason && <div style={{ fontSize: 11, color: '#9a8a78' }}>{row.reason}</div>}
                                                        </>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right font-mono font-bold whitespace-nowrap" style={{ color: entra ? '#166534' : '#b03828' }}>
                                                    {entra ? '+' : '−'}{fmtL(row.liters)}
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex justify-end gap-1">
                                                        {fotos && (
                                                            <button onClick={() => setViewPhotos({ title: row.receivingVehicleName || 'Distribuição', fotos })} title="Fotos"
                                                                className={`${iconBtn} text-gray-400 hover:text-green-600 hover:bg-green-50`}>
                                                                <Camera size={16} />
                                                            </button>
                                                        )}
                                                        {row.type === 'entrada' && (
                                                            <ReenviarOrdemButton info={deliveryMap[String(row.authNumber)]} setAlertMessage={setAlertMessage} onDone={recarregarEntrega} />
                                                        )}
                                                        {row.type !== 'drenagem' && (
                                                            <button onClick={() => pdfDaMovimentacao(row)} disabled={pdfBusyId === row.id} title="PDF"
                                                                className={`${iconBtn} text-gray-400 hover:text-blue-600 hover:bg-blue-50`}>
                                                                {pdfBusyId === row.id ? <Loader size={16} className="animate-spin" /> : <Printer size={16} />}
                                                            </button>
                                                        )}
                                                        <ProtectedComponent requiredPermission="editor">
                                                            {row.type === 'saida' && (
                                                                <button onClick={() => setModal({ type: 'saida', data: row })} title="Editar"
                                                                    className={`${iconBtn} text-gray-400 hover:text-[#9E7A42] hover:bg-[#fdf8f0]`}>
                                                                    <Edit size={16} />
                                                                </button>
                                                            )}
                                                            {row.type === 'entrada' && (
                                                                <button onClick={() => abrirCorrecaoBaixa(row)} disabled={busyId === row.id} title="Corrigir baixa (litros, preço, NF)"
                                                                    className={`${iconBtn} text-gray-400 hover:text-[#9E7A42] hover:bg-[#fdf8f0]`}>
                                                                    {busyId === row.id ? <Loader size={16} className="animate-spin" /> : <Edit size={16} />}
                                                                </button>
                                                            )}
                                                        </ProtectedComponent>
                                                        <ProtectedComponent requiredPermission="admin">
                                                            <button
                                                                onClick={() => setConfirmDelete({
                                                                    kind: 'ct',
                                                                    id: row.id,
                                                                    message: row.type === 'entrada'
                                                                        ? 'Excluir esta entrada? A ordem de origem é excluída e o diesel sai do saldo do comboio.'
                                                                        : 'Excluir esta movimentação? Os saldos do comboio, a média do veículo e o custo da obra serão revertidos.',
                                                                })}
                                                                title="Excluir"
                                                                className={`${iconBtn} text-gray-400 hover:text-red-600 hover:bg-red-50`}>
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </ProtectedComponent>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {!loadingHistorico && historico.data.length === 0 && (
                                        <tr><td colSpan="7" className="p-4 text-center text-gray-400 italic">Nenhuma movimentação encontrada.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {historico.total > PAGE_SIZE && (
                            <div className="flex justify-between items-center mt-3" style={{ fontSize: 12, color: '#6a5e4e' }}>
                                <span>
                                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, historico.total)} de {historico.total}
                                </span>
                                <div className="flex gap-1">
                                    <button type="button" className="mak-btn mak-btn-cancel" style={{ padding: '4px 8px' }} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                                        <ChevronLeft size={14} /> Anterior
                                    </button>
                                    <button type="button" className="mak-btn mak-btn-cancel" style={{ padding: '4px 8px' }} disabled={page * PAGE_SIZE >= historico.total} onClick={() => setPage(p => p + 1)}>
                                        Próxima <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ANÁLISE DETALHADA */}
                    <div className="bg-white p-5 rounded-xl" style={CARD}>
                        <h2 className="mb-4 pb-2 flex items-center gap-2" style={{ fontSize: 14, fontWeight: 700, color: '#1e1a14', borderBottom: '1px solid #f0ebe3' }}>
                            <BarChart3 size={16} style={{ color: '#2d5a8a' }} />
                            Análise Detalhada {selectedComboio ? `— ${selectedComboio.registroInterno}` : 'por Comboio'}
                        </h2>
                        <ComboioAnalysisPanel apiClient={apiClient} comboioVehicleId={selectedComboioId} refreshKey={refreshKey} />
                    </div>
                </div>
            </div>

            {/* ─── MODAIS ─── */}
            {modal.type === 'entradaOrder' && (
                <ComboioEntradaOrderModal
                    user={user}
                    comboios={comboios}
                    defaultComboioId={selectedComboioId}
                    orderToEdit={modal.data}
                    partners={partners}
                    employees={employees}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    onClose={fecharModal}
                    onSaved={recarregar}
                    onGeneratePDF={pdfEntradaOrder}
                />
            )}

            {modal.type === 'baixa' && modal.data && (
                <ConfirmRefuelingModal
                    key={modal.data.id}
                    variant="comboioEntrada"
                    user={user}
                    order={modal.data}
                    vehicles={vehicles}
                    partners={partners}
                    employees={employees}
                    obras={obras}
                    onClose={fecharModal}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    reloadData={recarregar}
                    PasswordConfirmationModal={PasswordConfirmationModal}
                />
            )}

            {modal.type === 'saida' && (
                <ComboioSaidaModal
                    user={user}
                    comboios={comboios}
                    defaultComboioId={selectedComboioId}
                    transactionData={modal.data}
                    vehicles={vehicles}
                    obras={obras}
                    employees={employees}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    onClose={fecharModal}
                    onSaved={recarregar}
                    onGeneratePDF={pdfSaida}
                />
            )}

            {modal.type === 'drenagem' && (
                <ComboioDrenagemModal
                    user={user}
                    vehicles={vehicles}
                    defaultComboioId={selectedComboioId}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    onClose={fecharModal}
                    onSaved={recarregar}
                />
            )}

            {confirmDelete && (
                <PasswordConfirmationModal
                    message={confirmDelete.message}
                    onConfirm={() => { const alvo = confirmDelete; setConfirmDelete(null); executarExclusao(alvo); }}
                    onClose={() => setConfirmDelete(null)}
                    apiClient={apiClient}
                />
            )}

            {confirmForce && ConfirmationModal && (
                <ConfirmationModal
                    title="Estoque ficaria negativo"
                    danger
                    message={confirmForce.message}
                    confirmText="Excluir mesmo assim"
                    onConfirm={() => { const alvo = confirmForce; setConfirmForce(null); executarExclusao(alvo, true); }}
                    onClose={() => setConfirmForce(null)}
                />
            )}

            {liberarTarget && ConfirmationModal && (
                <ConfirmationModal
                    title="Liberar saída bloqueada"
                    message={`Liberar a saída Nº ${pad6(liberarTarget.authNumber)} (${fmtL(liberarTarget.liters)} para ${liberarTarget.receivingVehicleName})? Motivo do bloqueio: ${liberarTarget.motivoBloqueio || '—'} A leitura será gravada no veículo, a média recalculada e o custo lançado na obra.`}
                    confirmText="Liberar"
                    onConfirm={handleLiberar}
                    onClose={() => setLiberarTarget(null)}
                />
            )}

            {/* Lightbox de fotos da distribuição feita pelo operador */}
            {viewPhotos && (
                <div className="mak-modal-backdrop" onClick={() => setViewPhotos(null)}>
                    <div className="mak-modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
                        <div className="mak-modal-header">
                            <h3 className="mak-modal-title flex items-center gap-2"><Camera size={16} /> Fotos do abastecimento — {viewPhotos.title}</h3>
                            <button type="button" className="mak-modal-close" onClick={() => setViewPhotos(null)}><X size={18} /></button>
                        </div>
                        <div className="mak-modal-body grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {viewPhotos.fotos.map(f => (
                                <a key={f.key} href={f.url} target="_blank" rel="noopener noreferrer" className="block group">
                                    <span className="mak-label flex items-center gap-1 mb-1"><ImageIcon size={12} /> {f.label}</span>
                                    <img src={f.url} alt={f.label} className="w-full h-56 object-cover rounded-lg group-hover:opacity-90 transition" style={{ border: '1px solid #e8e0d4' }} />
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ComboioPage;
