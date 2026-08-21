import React, { useState, useMemo, useEffect } from 'react';
import { PlusCircle, Printer, Edit, Trash2, CheckCircle, Search, History, Loader, Smartphone, EyeOff, Eye, Clock, Ban, Unlock, ChevronDown, ChevronRight } from 'lucide-react';
import ProtectedComponent from '../components/ProtectedComponent'; 
import { jsPDF } from 'jspdf'; 
import autoTable from 'jspdf-autotable'; 

import RefuelingHistory from '../components/RefuelingHistory';
import RefuelingOrderModal from '../components/modals/RefuelingOrderModal';
import ConfirmRefuelingModal from '../components/modals/ConfirmRefuelingModal';
import SearchableSelect from '../components/SearchableSelect';
import TerceirizadoBadge, { terceirizadoPdfMark } from '../components/ui/TerceirizadoBadge';
import { resolveOrderPartnerName, getVehicleTerceiroName } from '../utils/partners';
import { OrderDeliveryBadge, ReenviarOrdemButton, useOrderDeliveryStatus } from '../components/OrderDeliveryBadge';
import { useData } from '../contexts/DataContext';

const RefuelingPage = ({
    user,
    vehicles = [],
    obras = [],
    partners = [], 
    refuelings = [], 
    employees = [],
    expenses = [], 
    setAlertMessage,
    PasswordConfirmationModal, 
    ConfirmationModal,
    extraObraOptions = [],
    vehicleGroups = {},
    apiClient, 
    reloadData,
    navigate
}) => {
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    
    const [editingOrder, setEditingOrder] = useState(null);
    const [orderToConfirm, setOrderToConfirm] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [openOrdersSearchTerm, setOpenOrdersSearchTerm] = useState('');
    const [latestOrdersSearchTerm, setLatestOrdersSearchTerm] = useState('');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // Painel de ordens reservadas (só para quem tem can_create_hidden_orders)
    const podeVerReservadas = !!user?.can_create_hidden_orders;
    const [isReservadasOpen, setIsReservadasOpen] = useState(true);
    const [orderToReveal, setOrderToReveal] = useState(null);
    const [schedulingOrderId, setSchedulingOrderId] = useState(null);
    const [scheduleValue, setScheduleValue] = useState('');
    const [reservadaBusyId, setReservadaBusyId] = useState(null);

    const isValidDbDate = (dateString) => {
        if (!dateString) return false;
        const str = String(dateString);
        return str.length > 5 && !str.startsWith('0000') && str !== '1970-01-01T00:00:00.000Z';
    };

    const formatDateSafe = (dateInput) => {
        if (!isValidDbDate(dateInput)) return 'N/A';
        try {
            let date;
            if (dateInput && typeof dateInput.toDate === 'function') {
                date = dateInput.toDate();
            } else {
                let dateStr = String(dateInput);
                if (dateStr.includes(' ') && !dateStr.includes('T')) {
                    dateStr = dateStr.replace(' ', 'T');
                }
                date = new Date(dateStr);
            }
            if (isNaN(date.getTime())) return 'Data Inválida';
            return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()).toLocaleDateString('pt-BR');
        } catch { return 'Erro'; }
    };

    const formatDateTimeSafe = (dateInput) => {
        if (!isValidDbDate(dateInput)) return null;
        try {
            let dateStr = String(dateInput);
            if (dateStr.includes(' ') && !dateStr.includes('T')) dateStr = dateStr.replace(' ', 'T');
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return null;
            return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return null; }
    };

    const STATUSES_PENDENTES = ['Aberta', 'BloqueadoLeitura', 'BloqueadoOrcamento'];

    // As ordens reservadas só chegam do backend para o próprio emissor. Aqui elas
    // saem das listas normais para não duplicarem com o painel "Ordens Reservadas".
    const openRefuelings = useMemo(() => {
        return refuelings
            .filter(r => !r.isHidden && STATUSES_PENDENTES.includes(r.status))
            .sort((a,b) => (b.authNumber || 0) - (a.authNumber || 0));
    }, [refuelings]);

    const hiddenRefuelings = useMemo(() => {
        return refuelings
            .filter(r => r.isHidden)
            .sort((a,b) => (b.authNumber || 0) - (a.authNumber || 0));
    }, [refuelings]);

    const latestRefuelings = useMemo(() => {
        let list = [...refuelings].filter(r => !r.isHidden && (r.status === 'Concluída' || r.status === 'Cancelada'));
        
        if (latestOrdersSearchTerm) {
            const term = latestOrdersSearchTerm.toLowerCase();
            list = list.filter(o => {
                const vehicle = vehicles.find(v => v.id === o.vehicleId);
                const orderNum = String(o.authNumber || '');
                const re = vehicle?.registroInterno?.toLowerCase() || '';
                const placa = vehicle?.placa?.toLowerCase() || '';
                
                return orderNum.includes(term) || re.includes(term) || placa.includes(term);
            });
        }

        return list
            .sort((a,b) => {
                const dateA = new Date(a.data || a.date || 0).getTime();
                const dateB = new Date(b.data || b.date || 0).getTime();
                const diffDate = dateB - dateA;
                if (diffDate !== 0) return diffDate;
                return (b.authNumber || 0) - (a.authNumber || 0);
            })
            .slice(0, 20); 
    }, [refuelings, latestOrdersSearchTerm, vehicles]);

    // ─── Status de entrega das ordens (chegou ao posto?) ────────────────────
    // Antes disso, uma ordem que falhou no WhatsApp era visualmente idêntica a
    // uma entregue — ninguém ficava sabendo que o posto não recebeu.
    const { socket } = useData();
    const [deliveryRefreshKey, setDeliveryRefreshKey] = useState(0);

    const authNumbersVisiveis = useMemo(
        () => [...openRefuelings, ...latestRefuelings]
            .map(o => o.authNumber)
            .filter(n => n != null),
        [openRefuelings, latestRefuelings]
    );

    const { statusMap: deliveryMap, recarregar: recarregarEntrega } =
        useOrderDeliveryStatus(authNumbersVisiveis, deliveryRefreshKey);

    // O envio acontece depois da resposta do POST, então o status muda sozinho:
    // o backend avisa por socket e nós refazemos a consulta.
    useEffect(() => {
        if (!socket) return;
        const bump = () => setDeliveryRefreshKey(k => k + 1);
        socket.on('ordem:falha_envio', bump);
        socket.on('ordem:envio_recuperado', bump);
        return () => {
            socket.off('ordem:falha_envio', bump);
            socket.off('ordem:envio_recuperado', bump);
        };
    }, [socket]);

    // Uma ordem recém-emitida leva alguns segundos para ter o envio concluído.
    // Uma releitura curta evita que o badge fique preso em "Enviando...".
    useEffect(() => {
        if (authNumbersVisiveis.length === 0) return;
        const t = setTimeout(() => setDeliveryRefreshKey(k => k + 1), 8000);
        return () => clearTimeout(t);
    }, [authNumbersVisiveis.length]);

    const sortedVehicles = useMemo(() => {
        return [...vehicles].sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || ''));
    }, [vehicles]);

    const generateAuthorizationPDF = (order, vehiclesList = vehicles, partnersList = partners, employeesList = employees, groups = vehicleGroups, returnBlob = false) => {
        setIsGeneratingPdf(true);
        return new Promise((resolve, reject) => {
            try {
                const buildPdf = (logoDataUrl) => {
                    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                    const pageWidth = doc.internal.pageSize.getWidth();
                    const effectivePageHeight = 148.5; 
                    const margin = 10;

                    const vehicle = vehiclesList.find(v => v.id === order.vehicleId);
                    const partner = partnersList.find(p => p.id === order.partnerId);
                    const employee = employeesList.find(e => e.id === order.employeeId);
                    
                    const dateToUse = order.data || order.date;
                    let emissionDateStr = 'N/A';
                    if (isValidDbDate(dateToUse)) {
                        emissionDateStr = formatDateSafe(dateToUse);
                    }

                    if (logoDataUrl) {
                        try {
                            doc.addImage(logoDataUrl, 'PNG', margin, 10, 45, 16.875);
                        } catch (e) {
                            console.error("Erro ao adicionar logo ao PDF:", e);
                        }
                    }

                    doc.setFontSize(16);
                    doc.text(`Autorização de Abastecimento`, pageWidth - margin, 15, { align: 'right' });
                    doc.setFontSize(12);
                    doc.text(`Nº: ${String(order.authNumber || '0').padStart(6, '0')}`, pageWidth - margin, 22, { align: 'right' });

                    let leituraLabel = 'Leitura';
                    let leituraValue = 'N/A';
                    
                    const odoVal = parseFloat(order.odometro);
                    const horiVal = parseFloat(order.horimetro);
                    
                    // Lógica segura para determinar a exibição correta baseada no tipo de veículo
                    if (odoVal > 0 && horiVal > 0) {
                        const isLeveOrTrecho = vehicle && [
                            'Automóvel', 'Camionete', 'Utilitários', 'Moto', 
                            'Caminhão Prancha', 'Semirreboques'
                        ].includes(vehicle.tipo);
                        if (isLeveOrTrecho) {
                            leituraLabel = 'Odômetro';
                            leituraValue = odoVal;
                        } else {
                            leituraLabel = 'Horímetro';
                            leituraValue = horiVal;
                        }
                    } else if (odoVal > 0) {
                        leituraLabel = 'Odômetro';
                        leituraValue = odoVal;
                    } else if (horiVal > 0) {
                        leituraLabel = 'Horímetro';
                        leituraValue = horiVal;
                    }

                    const terceiroName = getVehicleTerceiroName(vehicle, partnersList);

                    const body = [
                        ['Data de Emissão', emissionDateStr],
                        ['Funcionário Autorizado', employee?.nome || 'Não especificado'],
                        ['Veículo Autorizado', `${vehicle?.registroInterno || 'N/A'} - ${vehicle?.placa || 'N/A'}${terceirizadoPdfMark(vehicle)}`],
                    ];

                    if (vehicle?.isOutsourced) {
                        body.push(['Terceiro (Locador)', terceiroName || 'Sem fornecedor vinculado']);
                    }

                    body.push(
                        ['Modelo', `${vehicle?.marca || ''} ${vehicle?.modelo || ''}`.trim() || 'N/A'],
                        [leituraLabel, `${leituraValue}`],
                        ['Posto Autorizado', resolveOrderPartnerName(partner, order.partnerName)],
                        ['Combustível Autorizado', order.fuelType || 'N/A'],
                        ['Litros Liberados', order.isFillUp ? 'Completar Tanque' : `${order.litrosLiberados || 0} L`],
                    );

                    if (order.needsArla) {
                        body.push(['Arla 32 Autorizado', order.isFillUpArla ? 'Completar Tanque' : `${order.litrosLiberadosArla || 0} L`]);
                    }
                    if (order.outros) {
                        body.push(['Outros Itens/Observação', `${order.outros} ${order.outrosValor ? `(R$ ${parseFloat(order.outrosValor || 0).toFixed(2)})` : ''}`]);
                    }

                    let issuer = 'N/A';
                    if (order.createdBy) {
                        if (typeof order.createdBy === 'string') {
                            issuer = order.createdBy; 
                        } else if (typeof order.createdBy === 'object') {
                            issuer = order.createdBy.nome || order.createdBy.name || order.createdBy.userEmail || order.createdBy.email || 'Usuário do Sistema';
                        }
                    }
                    body.push(['Emitido por', issuer]);

                    autoTable(doc, {
                        startY: 35,
                        body: body,
                        theme: 'striped',
                        styles: { fontSize: 9, cellPadding: 1.5 },
                        headStyles: { fillColor: [24, 49, 83] },
                        columnStyles: {
                            0: { cellWidth: 40, fontStyle: 'bold' }
                        }
                    });

                    let finalY = (doc.lastAutoTable?.finalY || 35) + 10;
                    const footerStartY = Math.max(finalY, effectivePageHeight - 20); 
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'italic');
                    doc.text('*A presente ordem de abastecimento é válida exclusivamente para a placa/RE indicada e para o tipo de combustível previamente autorizado.', margin, footerStartY);
                    doc.text('*Estão autorizados somente os itens discriminados acima.', margin, footerStartY + 4);

                    doc.setLineDashPattern([1, 1], 0);
                    doc.setDrawColor(180, 180, 180);
                    doc.line(0, effectivePageHeight, pageWidth, effectivePageHeight);

                    if (returnBlob) {
                        const blob = doc.output('blob');
                        setIsGeneratingPdf(false);
                        resolve(blob);
                    } else {
                        let fileDate = 'DATA';
                        try {
                            let dObj;
                            if (dateToUse && typeof dateToUse.toDate === 'function') {
                                dObj = dateToUse.toDate();
                            } else {
                                let ds = String(dateToUse);
                                if(ds.includes(' ') && !ds.includes('T')) ds = ds.replace(' ', 'T');
                                dObj = new Date(ds);
                            }
                            if(!isNaN(dObj.getTime())) fileDate = dObj.toISOString().split('T')[0];
                        } catch(e) {}

                        doc.save(`Autorizacao_${order.authNumber}_${vehicle?.registroInterno || 'VEIC'}_${fileDate}.pdf`);
                        setIsGeneratingPdf(false);
                        resolve(true);
                    }
                };

                const logo = new Image();
                logo.crossOrigin = 'Anonymous';
                logo.src = 'https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png';
                logo.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = logo.width;
                    canvas.height = logo.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(logo, 0, 0);
                    buildPdf(canvas.toDataURL('image/png'));
                };
                logo.onerror = () => buildPdf(null);

            } catch (error) {
                console.error("Erro ao gerar PDF:", error);
                setAlertMessage("Erro ao gerar o PDF.");
                setIsGeneratingPdf(false);
                reject(error);
            }
        });
    };

    // --- Ordens reservadas ---
    const handleRevelarAgora = async () => {
        const order = orderToReveal;
        setOrderToReveal(null);
        if (!order) return;
        setReservadaBusyId(order.id);
        try {
            const res = await apiClient.revelarOrdemOculta(order.id);
            setAlertMessage(res?.message || 'Ordem liberada.');
            reloadData();
        } catch (e) {
            setAlertMessage(`Erro ao liberar ordem: ${e.message}`);
        } finally {
            setReservadaBusyId(null);
        }
    };

    const handleAgendarLiberacao = async (orderId) => {
        if (!scheduleValue) {
            setAlertMessage('Informe a data e hora da liberação.');
            return;
        }
        setReservadaBusyId(orderId);
        try {
            const res = await apiClient.revelarOrdemOculta(orderId, { revealAt: scheduleValue });
            setAlertMessage(res?.message || 'Liberação agendada.');
            setSchedulingOrderId(null);
            setScheduleValue('');
            reloadData();
        } catch (e) {
            setAlertMessage(`Erro ao agendar liberação: ${e.message}`);
        } finally {
            setReservadaBusyId(null);
        }
    };

    const handleLiberarBloqueada = async (orderId) => {
        setReservadaBusyId(orderId);
        try {
            await apiClient.liberarOrdemBloqueada(orderId, { liberadoPor: user });
            setAlertMessage('Ordem liberada do bloqueio e enviada ao posto.');
            reloadData();
        } catch (e) {
            setAlertMessage(`Erro ao liberar: ${e.message}`);
        } finally {
            setReservadaBusyId(null);
        }
    };

    const handleNegarBloqueada = async (orderId) => {
        setReservadaBusyId(orderId);
        try {
            await apiClient.negarOrdemBloqueada(orderId);
            setAlertMessage('Ordem negada e excluída.');
            reloadData();
        } catch (e) {
            setAlertMessage(`Erro ao negar: ${e.message}`);
        } finally {
            setReservadaBusyId(null);
        }
    };

    const handleDeleteOrder = async () => {
        if (!itemToDelete) return;
        try {
            await apiClient.deleteRefuelingOrder(itemToDelete);
            setAlertMessage("Ordem excluída com sucesso.");
            reloadData();
        } catch (e) {
            setAlertMessage(`Erro ao excluir: ${e.message}`);
        } finally {
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 animate-fadeIn space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-5 rounded-xl" style={{ border: '1px solid #f0ebe3', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
                <div>
                    <h1 className="flex items-center gap-2" style={{ fontSize: 22, fontWeight: 700, color: '#1e1a14' }}>
                        <CheckCircle size={20} style={{ color: '#9E7A42' }}/> Controle de Abastecimento
                    </h1>
                </div>
                <ProtectedComponent requiredPermission="editor">
                    <div className="flex gap-2 w-full md:w-auto">
                        <button onClick={() => navigate('admin_solicitacoes')}
                            className="flex-1 md:flex-none flex items-center gap-2 px-4 py-2.5 justify-center mak-btn mak-btn-dark text-sm font-bold">
                            <Smartphone size={16}/> Solicitações App
                        </button>
                        <button onClick={() => { setEditingOrder(null); setIsOrderModalOpen(true); }}
                            className="flex-1 md:flex-none flex items-center gap-2 px-5 py-2.5 justify-center mak-btn mak-btn-primary text-sm font-bold">
                            <PlusCircle size={16}/> Emitir Nova Ordem
                        </button>
                    </div>
                </ProtectedComponent>
            </div>

            {podeVerReservadas && (
                <div className="bg-white rounded-xl" style={{ border: '1px solid #d8d3c8', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
                    <button
                        onClick={() => setIsReservadasOpen(o => !o)}
                        className="w-full flex items-center justify-between p-4 text-left"
                    >
                        <span className="flex items-center gap-2" style={{ fontSize: 14, fontWeight: 700, color: '#1e1a14' }}>
                            {isReservadasOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                            <EyeOff size={16} style={{ color: '#5b6472' }}/> Ordens Reservadas
                            <span style={{ background: '#eef1f5', color: '#5b6472', border: '1px solid #d5dbe4', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999 }}>
                                {hiddenRefuelings.length}
                            </span>
                        </span>
                        <span className="hidden md:block text-right" style={{ fontSize: 10, color: '#9a8a78', maxWidth: 460, lineHeight: 1.4 }}>
                            Já geram despesa para a obra e já foram enviadas ao posto — apenas não aparecem
                            para os demais usuários até você liberá-las.
                        </span>
                    </button>

                    {isReservadasOpen && (
                        <div className="px-4 pb-4 overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead style={{ background: '#faf9f7', borderBottom: '1px solid #f0ebe3' }}>
                                    <tr>
                                        {['Nº', 'Emissão', 'Veículo', 'Obra', 'Posto', 'Combustível', 'Status', 'Liberação'].map(h => (
                                            <th key={h} className="p-3" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9a8a78' }}>{h}</th>
                                        ))}
                                        <th className="p-3 text-right" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9a8a78' }}>Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {hiddenRefuelings.map(order => {
                                        const vehicle = vehicles.find(v => v.id === order.vehicleId);
                                        const obra = obras.find(o => o.id === order.obraId);
                                        const displayPartner = resolveOrderPartnerName(partners.find(p => p.id === order.partnerId), order.partnerName);
                                        const isBloqueada = order.status === 'BloqueadoLeitura' || order.status === 'BloqueadoOrcamento';
                                        const agendada = formatDateTimeSafe(order.revealAt);
                                        const busy = reservadaBusyId === order.id;
                                        const litros = order.isFillUp ? 'Tanque cheio' : `${order.litrosLiberados || 0} L`;

                                        return (
                                            <React.Fragment key={order.id}>
                                                <tr className="hover:bg-gray-50">
                                                    <td className="p-3 font-bold">#{String(order.authNumber).padStart(6,'0')}</td>
                                                    <td className="p-3">{formatDateSafe(order.data || order.date)}</td>
                                                    <td className="p-3">{vehicle?.registroInterno} - {vehicle?.placa}</td>
                                                    <td className="p-3 truncate max-w-[150px]">{obra?.nome || order.obraId || '—'}</td>
                                                    <td className="p-3 truncate max-w-[150px]">{displayPartner}</td>
                                                    <td className="p-3 whitespace-nowrap">{order.fuelType || '—'} · {litros}</td>
                                                    <td className="p-3">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold ${isBloqueada ? 'bg-red-100 text-red-800' : order.status === 'Concluída' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                            {order.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 whitespace-nowrap" style={{ fontSize: 12, color: agendada ? '#2d5a8a' : '#9a8a78' }}>
                                                        {agendada || 'manual'}
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <div className="flex justify-end gap-1">
                                                            {isBloqueada && (
                                                                <>
                                                                    <button onClick={() => handleLiberarBloqueada(order.id)} disabled={busy} title="Liberar bloqueio e enviar ao posto" className="p-1.5 text-gray-400 hover:text-green-600 rounded hover:bg-green-50 disabled:opacity-40"><Unlock size={16}/></button>
                                                                    <button onClick={() => handleNegarBloqueada(order.id)} disabled={busy} title="Negar (exclui a ordem)" className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-40"><Ban size={16}/></button>
                                                                </>
                                                            )}
                                                            <button
                                                                onClick={() => { setSchedulingOrderId(schedulingOrderId === order.id ? null : order.id); setScheduleValue(''); }}
                                                                disabled={busy}
                                                                title="Agendar/alterar liberação automática"
                                                                className="p-1.5 text-gray-400 hover:text-[#2d5a8a] rounded hover:bg-blue-50 disabled:opacity-40"
                                                            ><Clock size={16}/></button>
                                                            <button onClick={() => setOrderToReveal(order)} disabled={busy} title="Liberar agora (torna visível para todos)" className="p-1.5 text-gray-400 hover:text-[#9E7A42] rounded hover:bg-[#fdf8f0] disabled:opacity-40">
                                                                {busy ? <Loader size={16} className="animate-spin"/> : <Eye size={16}/>}
                                                            </button>
                                                            <button onClick={() => generateAuthorizationPDF(order)} disabled={isGeneratingPdf} title="PDF" className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50">
                                                                {isGeneratingPdf ? <Loader size={16} className="animate-spin"/> : <Printer size={16}/>}
                                                            </button>
                                                            <button onClick={() => { setEditingOrder(order); setIsOrderModalOpen(true); }} title="Editar" className="p-1.5 text-gray-400 hover:text-[#9E7A42] rounded hover:bg-[#fdf8f0]"><Edit size={16}/></button>
                                                            <button onClick={() => { setItemToDelete(order.id); setIsDeleteModalOpen(true); }} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"><Trash2 size={16}/></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {schedulingOrderId === order.id && (
                                                    <tr style={{ background: '#faf9f7' }}>
                                                        <td colSpan="9" className="p-3">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span style={{ fontSize: 12, fontWeight: 600, color: '#6a5e4e' }}>Liberar automaticamente em:</span>
                                                                <input
                                                                    type="datetime-local"
                                                                    value={scheduleValue}
                                                                    onChange={e => setScheduleValue(e.target.value)}
                                                                    className="p-1.5 border rounded text-xs"
                                                                />
                                                                <button onClick={() => handleAgendarLiberacao(order.id)} disabled={busy} className="px-3 py-1.5 text-xs font-bold rounded mak-btn mak-btn-primary disabled:opacity-50">
                                                                    {busy ? 'Salvando...' : 'Agendar'}
                                                                </button>
                                                                <button onClick={() => { setSchedulingOrderId(null); setScheduleValue(''); }} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-200 rounded">
                                                                    Cancelar
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                    {hiddenRefuelings.length === 0 && (
                                        <tr><td colSpan="9" className="p-4 text-center text-gray-400 italic">Nenhuma ordem reservada.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <div className="xl:col-span-4 space-y-4">
                    <div className="bg-white p-5 rounded-xl h-full flex flex-col" style={{ border: '1px solid #f0ebe3', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
                        <h2 className="mb-4 pb-2 flex justify-between items-center" style={{ fontSize: 14, fontWeight: 700, color: '#1e1a14', borderBottom: '1px solid #f0ebe3' }}>
                            Ordens Pendentes
                            <span style={{ background: '#fdf8f0', color: '#9E7A42', border: '1px solid #e8d8b8', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999 }}>{openRefuelings.length}</span>
                        </h2>
                        
                        <div className="relative mb-3">
                            <input 
                                type="text" 
                                placeholder="Buscar: Ordem, Placa ou RE..." 
                                value={openOrdersSearchTerm}
                                onChange={e => setOpenOrdersSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                            />
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                        </div>

                        <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[600px]">
                            {openRefuelings
                                .filter(o => {
                                    if(!openOrdersSearchTerm) return true;
                                    const term = openOrdersSearchTerm.toLowerCase();
                                    const v = vehicles.find(v => v.id === o.vehicleId);
                                    return String(o.authNumber).includes(term) || 
                                           v?.placa?.toLowerCase().includes(term) || 
                                           v?.registroInterno?.toLowerCase().includes(term);
                                })
                                .map(order => {
                                const vehicle = vehicles.find(v => v.id === order.vehicleId);
                                const isBloqueada = order.status === 'BloqueadoLeitura' || order.status === 'BloqueadoOrcamento';
                                return (
                                    <div key={order.id} className="p-4 rounded-lg" style={{ border: '1px solid #f0ebe3', borderLeft: `4px solid ${isBloqueada ? '#b03828' : '#9E7A42'}`, background: isBloqueada ? '#fdf0ec' : '#faf9f7' }}>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: 16, color: '#3d3528' }}>#{String(order.authNumber).padStart(6, '0')}</div>
                                                <p className="flex items-center gap-1" style={{ fontSize: 13, fontWeight: 600, color: '#6a5e4e' }}>
                                                    {vehicle?.registroInterno} — {vehicle?.placa}
                                                    <TerceirizadoBadge vehicle={vehicle} />
                                                </p>
                                                {vehicle?.isOutsourced && (
                                                    <p style={{ fontSize: 11, fontWeight: 600, color: '#6b21a8' }}>
                                                        {getVehicleTerceiroName(vehicle, partners) || 'Terceiro sem fornecedor vinculado'}
                                                    </p>
                                                )}
                                                <p style={{ fontSize: 11, color: '#9a8a78', marginBottom: 2 }}>{formatDateSafe(order.data || order.date)}</p>
                                                <p style={{ fontSize: 11, color: '#b0a090' }}>{resolveOrderPartnerName(partners.find(p => p.id === order.partnerId), order.partnerName, '...')}</p>
                                                {isBloqueada && (
                                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999, background: '#fdf0ec', color: '#b03828', border: '1px solid #e8c8bc', display: 'inline-block', marginTop: 4 }}>
                                                        ⛔ Aguardando Administrador
                                                    </span>
                                                )}
                                                <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
                                                    <OrderDeliveryBadge info={deliveryMap[String(order.authNumber)]} />
                                                    <ReenviarOrdemButton
                                                        info={deliveryMap[String(order.authNumber)]}
                                                        setAlertMessage={setAlertMessage}
                                                        onDone={recarregarEntrega}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                {!isBloqueada && (
                                                    <ProtectedComponent requiredPermission="editor">
                                                        <div className="flex gap-1 mb-1">
                                                            <button onClick={() => { setOrderToConfirm(order); setIsConfirmModalOpen(true); }} style={{ padding: 5, background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 6, cursor: 'pointer', lineHeight: 0 }} title="Confirmar"><CheckCircle size={14}/></button>
                                                            <button onClick={() => { setEditingOrder(order); setIsOrderModalOpen(true); }} style={{ padding: 5, background: '#fdf8f0', color: '#9E7A42', border: 'none', borderRadius: 6, cursor: 'pointer', lineHeight: 0 }} title="Editar"><Edit size={14}/></button>
                                                            <button onClick={() => { setItemToDelete(order.id); setIsDeleteModalOpen(true); }} style={{ padding: 5, background: '#fdf0ec', color: '#b03828', border: 'none', borderRadius: 6, cursor: 'pointer', lineHeight: 0 }} title="Excluir"><Trash2 size={14}/></button>
                                                        </div>
                                                    </ProtectedComponent>
                                                )}
                                                {isBloqueada && (
                                                    <ProtectedComponent requiredPermission="editor">
                                                        <button onClick={() => { setItemToDelete(order.id); setIsDeleteModalOpen(true); }} style={{ padding: 5, background: '#fdf0ec', color: '#b03828', border: 'none', borderRadius: 6, cursor: 'pointer', lineHeight: 0 }} title="Excluir"><Trash2 size={14}/></button>
                                                    </ProtectedComponent>
                                                )}
                                                <button onClick={() => generateAuthorizationPDF(order)} disabled={isGeneratingPdf} style={{ padding: 5, background: '#fff', border: '1px solid #e8e0d4', color: '#9a8a78', borderRadius: 6, cursor: 'pointer', lineHeight: 0, display: 'flex', justifyContent: 'center' }} title="PDF">
                                                    {isGeneratingPdf ? <Loader size={14} className="animate-spin"/> : <Printer size={14}/>}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {openRefuelings.length === 0 && <p className="text-center text-gray-400 py-4 italic">Nenhuma ordem pendente.</p>}
                        </div>
                    </div>
                </div>

                <div className="xl:col-span-8 space-y-6">
                    <div className="bg-white p-5 rounded-xl" style={{ border: '1px solid #f0ebe3', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
                        <div className="flex flex-col sm:flex-row justify-between items-center mb-4 pb-2 gap-4" style={{ borderBottom: '1px solid #f0ebe3' }}>
                            <h2 className="flex items-center gap-2" style={{ fontSize: 14, fontWeight: 700, color: '#1e1a14' }}>
                                <History size={16} style={{ color: '#2d5a8a' }}/> Últimas Ordens Emitidas
                            </h2>
                            <div className="relative w-full sm:w-64">
                                <input 
                                    type="text" 
                                    placeholder="Filtrar por Nº, RE ou Placa..." 
                                    value={latestOrdersSearchTerm}
                                    onChange={e => setLatestOrdersSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                                />
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                            </div>
                        </div>

                        <div className="overflow-x-auto max-h-80 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-sm text-left">
                                <thead className="sticky top-0 z-10" style={{ background: '#faf9f7', borderBottom: '1px solid #f0ebe3' }}>
                                    <tr>
                                        <th className="p-3" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9a8a78' }}>Nº</th>
                                        <th className="p-3" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9a8a78' }}>Status</th>
                                        <th className="p-3" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9a8a78' }}>Data</th>
                                        <th className="p-3" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9a8a78' }}>Veículo</th>
                                        <th className="p-3" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9a8a78' }}>Posto</th>
                                        <th className="p-3 text-right" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9a8a78' }}>Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {latestRefuelings.map(order => {
                                        const vehicle = vehicles.find(v => v.id === order.vehicleId);
                                        const displayPartner = resolveOrderPartnerName(partners.find(p => p.id === order.partnerId), order.partnerName);
                                        const terceiroName = getVehicleTerceiroName(vehicle, partners);

                                        return (
                                            <tr key={order.id} className="hover:bg-gray-50">
                                                <td className="p-3 font-bold">#{String(order.authNumber).padStart(6,'0')}</td>
                                                <td className="p-3">
                                                    <div className="flex flex-col gap-1 items-start">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold ${order.status === 'Concluída' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                            {order.status}
                                                        </span>
                                                        <OrderDeliveryBadge info={deliveryMap[String(order.authNumber)]} />
                                                    </div>
                                                </td>
                                                <td className="p-3">{formatDateSafe(order.data || order.date)}</td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-1">
                                                        <span>{vehicle?.registroInterno} - {vehicle?.placa}</span>
                                                        <TerceirizadoBadge vehicle={vehicle} />
                                                    </div>
                                                    {vehicle?.isOutsourced && (
                                                        <div style={{ fontSize: 11, fontWeight: 600, color: '#6b21a8' }} title="Terceiro (Locador)">
                                                            {terceiroName || 'Sem fornecedor vinculado'}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3 truncate max-w-[150px]" title={displayPartner}>{displayPartner}</td>
                                                <td className="p-3 text-right flex justify-end gap-1">
                                                    <ReenviarOrdemButton
                                                        info={deliveryMap[String(order.authNumber)]}
                                                        setAlertMessage={setAlertMessage}
                                                        onDone={recarregarEntrega}
                                                    />
                                                    <button onClick={() => generateAuthorizationPDF(order)} disabled={isGeneratingPdf} title="PDF" className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50">
                                                        {isGeneratingPdf ? <Loader size={16} className="animate-spin"/> : <Printer size={16}/>}
                                                    </button>
                                                    <ProtectedComponent requiredPermission="editor">
                                                        <button onClick={() => { setEditingOrder(order); setIsOrderModalOpen(true); }} title="Editar" className="p-1.5 text-gray-400 hover:text-[#9E7A42] rounded hover:bg-[#fdf8f0]"><Edit size={16}/></button>
                                                        <button onClick={() => { setItemToDelete(order.id); setIsDeleteModalOpen(true); }} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"><Trash2 size={16}/></button>
                                                    </ProtectedComponent>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {latestRefuelings.length === 0 && (
                                        <tr><td colSpan="6" className="p-4 text-center text-gray-400 italic">Nenhuma ordem encontrada.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm " style={{ border: "1px solid #f0ebe3" }}>
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <h2 className="text-lg font-bold text-gray-800">Análise Detalhada por Veículo</h2>
                            <div className="min-w-[280px]">
                                <SearchableSelect
                                    items={sortedVehicles}
                                    value={selectedVehicleId}
                                    onChange={(item) => setSelectedVehicleId(item?.id || '')}
                                    getLabel={(v) => `${v.registroInterno} - ${v.placa}${terceirizadoPdfMark(v)}`}
                                    getSubLabel={(v) => {
                                        const terceiro = getVehicleTerceiroName(v, partners);
                                        if (v.isOutsourced) return terceiro ? `3º ${terceiro}` : (v.modelo || '');
                                        return v.modelo || '';
                                    }}
                                    placeholder="-- Selecione o Veículo --"
                                />
                            </div>
                        </div>
                        <RefuelingHistory 
                            vehicleId={selectedVehicleId}
                            refuelings={refuelings}
                            vehicles={vehicles}
                            partners={partners}
                            employees={employees}
                            vehicleGroups={vehicleGroups}
                            onGeneratePDF={generateAuthorizationPDF}
                        />
                    </div>
                </div>
            </div>

            {isOrderModalOpen && (
                <RefuelingOrderModal 
                    user={user}
                    orderToEdit={editingOrder}
                    vehicles={vehicles}
                    obras={obras}
                    partners={partners}
                    employees={employees}
                    refuelings={refuelings}
                    expenses={expenses}
                    vehicleGroups={vehicleGroups}
                    extraObraOptions={extraObraOptions}
                    onClose={() => setIsOrderModalOpen(false)}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    reloadData={reloadData}
                    onGeneratePDF={generateAuthorizationPDF}
                    PasswordConfirmationModal={PasswordConfirmationModal}
                    ConfirmationModal={ConfirmationModal}
                />
            )}

            {isConfirmModalOpen && orderToConfirm && (
                <ConfirmRefuelingModal
                    key={orderToConfirm.id}
                    user={user}
                    order={orderToConfirm}
                    obras={obras}
                    expenses={expenses}
                    vehicles={vehicles}
                    onClose={() => setIsConfirmModalOpen(false)}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    reloadData={reloadData}
                    refuelings={refuelings}
                    partners={partners}
                    employees={employees}
                    PasswordConfirmationModal={PasswordConfirmationModal}
                />
            )}

            {orderToReveal && (
                <ConfirmationModal
                    title="Liberar ordem reservada"
                    message={`A ordem Nº ${String(orderToReveal.authNumber).padStart(6,'0')} passará a aparecer em Ordens Pendentes / Últimas Ordens para todos os usuários. Esta ação não pode ser desfeita. Confirmar?`}
                    confirmText="Liberar"
                    onConfirm={handleRevelarAgora}
                    onClose={() => setOrderToReveal(null)}
                />
            )}

            {isDeleteModalOpen && itemToDelete && (
                <PasswordConfirmationModal
                    message="Excluir esta ordem? Se confirmada, o custo será estornado."
                    onConfirm={handleDeleteOrder}
                    onClose={() => setIsDeleteModalOpen(false)}
                    apiClient={apiClient}
                />
            )}
        </div>
    );
};

export default RefuelingPage;


