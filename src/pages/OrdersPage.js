import React, { useState, useMemo, useEffect, useRef } from 'react';
import apiClient from '../services/apiClient';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    PlusCircle, Edit, Trash2, FileText, XCircle, Loader, X,
    ChevronDown, UploadCloud, Paperclip, RefreshCw, Eye, ThumbsUp, CheckCircle, FileCode2
} from 'lucide-react';

import ProtectedComponent from '../components/ProtectedComponent'; 
import { PasswordConfirmationModal } from '../App'; 

// ===================================================================================
// HELPERS DE PARSE E FORMATAÇÃO
// ===================================================================================
const getCreatorEmail = (order) => {
    if (!order || !order.createdBy) return 'N/A';
    if (typeof order.createdBy === 'object') return order.createdBy.userEmail || 'N/A';
    try { const p = JSON.parse(order.createdBy); return p.userEmail || 'N/A'; } catch(e) { return order.createdBy; }
};

const getEditorEmail = (order) => {
    if (!order || !order.editedBy) return 'N/A';
    if (typeof order.editedBy === 'object') return order.editedBy.userEmail || 'N/A';
    try { const p = JSON.parse(order.editedBy); return p.userEmail || 'N/A'; } catch(e) { return order.editedBy; }
};

// ===================================================================================
// COMPONENTE: SELECT COM BUSCA PARA FORNECEDORES
// ===================================================================================
const SearchableSupplierSelect = ({ partners = [], value, onChange }) => {
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selected = partners.find(p => p.id === value);
    
    const filtered = partners.filter(p => 
        (p.razaoSocial || '').toLowerCase().includes(search.toLowerCase()) || 
        (p.cnpj || '').includes(search)
    );

    return (
        <div className="relative w-full" ref={dropdownRef}>
            <div
                className="mt-1 p-2 border rounded w-full bg-white cursor-pointer flex justify-between items-center"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={`truncate ${selected ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                    {selected ? `${selected.razaoSocial} ${selected.cnpj ? `(${selected.cnpj})` : ''}` : 'Buscar e selecionar fornecedor...'}
                </span>
                <ChevronDown size={16} className="text-gray-500 shrink-0" />
            </div>
            
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-2xl max-h-60 flex flex-col">
                    <div className="p-2 sticky top-0 bg-gray-50 border-b">
                        <input
                            type="text"
                            className="w-full p-2 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500"
                            placeholder="Digite o nome ou CNPJ para filtrar..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="overflow-y-auto custom-scrollbar flex-1">
                        {filtered.map(p => (
                            <div
                                key={p.id}
                                className="p-2 hover:bg-yellow-50 cursor-pointer text-sm border-b last:border-b-0 transition-colors"
                                onClick={() => { onChange(p.id, p.razaoSocial); setIsOpen(false); setSearch(''); }}
                            >
                                <div className="font-semibold text-gray-800">{p.razaoSocial}</div>
                                {p.cnpj && <div className="text-xs text-gray-500">{p.cnpj}</div>}
                            </div>
                        ))}
                        {filtered.length === 0 && <div className="p-3 text-sm text-gray-500 text-center">Nenhum fornecedor encontrado.</div>}
                    </div>
                </div>
            )}
        </div>
    );
};

// ===================================================================================
// GERAÇÃO DE PDF PARA ORDEM DE COMPRA/SERVIÇO
// ===================================================================================
const generateOrderPDF = (order, vehicle, employee, operator, obra, logoDataUrl) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth(); 
    const effectivePageHeight = 148.5; 
    const margin = 10;

    if (logoDataUrl) {
        try { doc.addImage(logoDataUrl, 'PNG', margin, 10, 45, 16.875); } catch(e) {}
    }

    const orderNumberStr = order.orderNumber ? String(order.orderNumber).padStart(6, '0') : '000000';
    const emissorEmail = getCreatorEmail(order);

    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text('Ordem de Compra/Serviço', pageWidth - margin, 15, { align: 'right' });
    doc.setFontSize(12); doc.setFont('helvetica', 'normal');
    doc.text(`Nº: ${orderNumberStr}`, pageWidth - margin, 22, { align: 'right' });
    doc.text(`Data: ${order.date ? new Date(order.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}`, pageWidth - margin, 29, { align: 'right' });

    doc.setLineWidth(0.5); doc.line(margin, 38, pageWidth - margin, 38);

    const infoStartY = 45;
    const midX = (pageWidth / 2) + 5; 
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Fornecedor:', margin, infoStartY);
    doc.text('Obra de Destino:', midX, infoStartY);
    doc.setFont('helvetica', 'normal');
    doc.text(order.supplier || 'N/A', margin + 25, infoStartY); 
    doc.text(obra?.nome || order.obraId || 'Não especificada', midX + 30, infoStartY); 

    doc.setFont('helvetica', 'bold');
    doc.text('Func. Autorizado:', margin, infoStartY + 7);
    doc.setFont('helvetica', 'normal');
    doc.text(employee?.nome || 'Não especificado', margin + 35, infoStartY + 7); 

    if (operator) {
        doc.setFont('helvetica', 'bold');
        doc.text('Operador (Custo):', margin, infoStartY + 12);
        doc.setFont('helvetica', 'normal');
        doc.text(operator.nome || 'N/A', margin + 35, infoStartY + 12);
    }

    if (vehicle) {
        doc.setFont('helvetica', 'bold');
        doc.text('Veículo Vinculado:', midX, infoStartY + 7);
        doc.setFont('helvetica', 'normal');
        doc.text(`${vehicle.registroInterno || 'N/A'} - ${vehicle.placa || 'N/A'}`, midX + 35, infoStartY + 7); 
    }

    const tableBody = (order.items || []).map(item => [
        item.quantity || 0,
        item.description || '',
        order.status !== 'Pendente de Valor' ? `R$ ${(parseFloat(item.unitPrice) || 0).toFixed(2)}` : 'A cotar',
        order.status !== 'Pendente de Valor' ? `R$ ${((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)).toFixed(2)}` : 'A cotar'
    ]);

    let finalY = infoStartY + 18; 

    autoTable(doc, {
        startY: finalY,
        head: [['Qtd.', 'Descrição do Item/Serviço', 'Vlr. Unit.', 'Vlr. Total']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [24, 49, 83], fontSize: 9 },
        styles: { fontSize: 8 },
        didDrawPage: (data) => {
            finalY = data.cursor.y;
            if (order.status !== 'Pendente de Valor') {
                doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
                doc.text('Total Geral:', data.settings.margin.left, finalY + 8);
                const displayTotal = order.totalValue != null ? order.totalValue : (order.items || []).reduce((sum, i) => sum + ((parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0)), 0);
                doc.text(`R$ ${(parseFloat(displayTotal) || 0).toFixed(2)}`, pageWidth - margin, finalY + 8, { align: 'right' });
                finalY += 8; 
            }
        }
    });

     if (doc.lastAutoTable && doc.lastAutoTable.finalY) {
        finalY = doc.lastAutoTable.finalY > finalY ? doc.lastAutoTable.finalY : finalY;
     }
     finalY += 10; 

    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Condição de Pagamento:', margin, finalY);
    doc.setFont('helvetica', 'normal');
    let paymentText = order.payment?.type || 'N/A';
    
    if (order.payment?.type === 'A prazo') {
        paymentText += ` - ${order.payment.method || ''}`;
        doc.text(paymentText, margin + 40, finalY);
        finalY += 6;

        if (order.payment?.installments && order.payment.installments.length > 0) {
            doc.setFont('helvetica', 'normal');
            order.payment.installments.forEach((inst, idx) => {
                const dataFormatada = inst.dueDate ? new Date(inst.dueDate + 'T12:00:00Z').toLocaleDateString('pt-BR') : 'N/A';
                const valorFormat = (parseFloat(inst.value) || 0).toFixed(2);
                doc.text(`${idx + 1}ª Parcela: ${dataFormatada} - R$ ${valorFormat}`, margin + 40, finalY);
                finalY += 4.5;
            });
        }
    } else {
        doc.text(paymentText, margin + 40, finalY);
        finalY += 7;
    }

    const footerStartY = Math.max(finalY + 5, effectivePageHeight - 25); 
    doc.setLineWidth(0.2); doc.line(margin, footerStartY, pageWidth - margin, footerStartY);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('Esta ordem de compra deve gerar uma nota fiscal para faturamento.', margin, footerStartY + 5);
    doc.text('Somente os itens acima descriminados estão liberados para compra, itens adicionais não serão pagos.', margin, footerStartY + 9);
    doc.setFont('helvetica', 'italic');
    doc.text(`Ordem emitida por: ${emissorEmail}`, margin, footerStartY + 15);

    doc.setLineDashPattern([1, 1], 0); doc.setDrawColor(180, 180, 180);
    doc.line(0, effectivePageHeight, pageWidth, effectivePageHeight);

    doc.output('dataurlnewwindow');
};

// ===================================================================================
// COMPONENTE PRINCIPAL: PÁGINA
// ===================================================================================
const OrdersPage = ({
    user, setAlertMessage,
    vehicles = [], employees = [], obras = [], partners = [], 
    PasswordConfirmationModal, apiClient, reloadData,
    orders = [] 
}) => {
    // --- ESTADOS ---
    const [localOrders, setLocalOrders] = useState([]);
    const [isFetching, setIsFetching] = useState(false);
    
    // Modais e Interações
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [itemToCancel, setItemToCancel] = useState(null);
    
    const [orderDetailsToView, setOrderDetailsToView] = useState(null); // Modal de Raio-X
    const [orderToClose, setOrderToClose] = useState(null); // Modal de Fechar Ordem (NF/XML)
    const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

    const [filters, setFilters] = useState({ obra: '', vehicle: '', emitter: '', date: '', number: '', status: '' });
    const [loadingAction, setLoadingAction] = useState(false);

    // --- FETCH INDEPENDENTE (FALLBACK) ---
    const fetchLocalOrders = async () => {
        setIsFetching(true);
        try {
            let data = [];
            if (typeof apiClient.getAllOrders === 'function') {
                data = await apiClient.getAllOrders();
            } else if (typeof apiClient.get === 'function') {
                data = await apiClient.get('/orders');
            }
            if (data) setLocalOrders(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Erro ao buscar ordens locais:", error);
        } finally {
            setIsFetching(false);
        }
    };

    useEffect(() => {
        fetchLocalOrders();
    }, []);

    const handleReloadData = async () => {
        if (reloadData) await reloadData();
        await fetchLocalOrders();
    };

    const activeOrders = orders && orders.length > 0 ? orders : localOrders;

    const sortedObras = useMemo(() => [...(obras || [])].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);
    const sortedVehicles = useMemo(() => [...(vehicles || [])].sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);

    const filteredOrders = useMemo(() => {
        return (activeOrders || []).filter(order => {
            const dateMatch = !filters.date || (order.date && new Date(order.date).toISOString().split('T')[0] === filters.date);
            const numberMatch = !filters.number || String(order.orderNumber).padStart(6, '0').includes(filters.number);
            const obraMatch = !filters.obra || order.obraId === filters.obra;
            const vehicleMatch = !filters.vehicle || order.vehicleId === filters.vehicle;
            const emissorEmail = getCreatorEmail(order);
            const emitterMatch = !filters.emitter || emissorEmail.toLowerCase().includes(filters.emitter.toLowerCase());
            const statusMatch = !filters.status || order.status === filters.status;
            return dateMatch && numberMatch && obraMatch && vehicleMatch && emitterMatch && statusMatch;
        })
        .sort((a, b) => (b.orderNumber || 0) - (a.orderNumber || 0)); 
    }, [activeOrders, filters]);

    // --- FUNÇÕES DE AÇÃO ---
    const handleOpenPDF = (order) => {
        const vehicle = vehicles.find(v => v.id === order.vehicleId);
        const employee = employees.find(e => e.id === order.employeeId);
        const operator = employees.find(e => e.id === order.operatorId);
        const obra = obras.find(o => o.id === order.obraId);

        const logo = new Image();
        logo.crossOrigin = 'Anonymous';
        logo.src = 'https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png'; 
        logo.onload = () => {
             try {
                const canvas = document.createElement('canvas');
                canvas.width = logo.width; canvas.height = logo.height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(logo, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                generateOrderPDF(order, vehicle, employee, operator, obra, dataUrl);
             } catch (e) { generateOrderPDF(order, vehicle, employee, operator, obra, null); }
        };
        logo.onerror = (e) => { generateOrderPDF(order, vehicle, employee, operator, obra, null); }
    };

    const openEditModal = (order) => { setEditingOrder(order); setIsModalOpen(true); };
    const openCancelModal = (order) => { setItemToCancel(order); setIsCancelModalOpen(true); };

    const handleCancelOrder = async () => {
        if (!itemToCancel) return;
        setLoadingAction(true); 
        try {
            if (typeof apiClient.cancelOrder === 'function') {
                await apiClient.cancelOrder(itemToCancel.id);
            } else {
                await apiClient.put(`/orders/${itemToCancel.id}/cancel`);
            }
            setAlertMessage("Ordem cancelada com sucesso.");
            await handleReloadData(); 
        } catch (error) {
            setAlertMessage(error.message || "Falha ao cancelar a ordem.");
        } finally {
            setIsCancelModalOpen(false);
            setItemToCancel(null);
            setLoadingAction(false); 
        }
    };

    const handleQuickStatusChange = async (order, newStatus) => {
        try {
            const updatedData = { 
                ...order, 
                status: newStatus,
                editedBy: { userEmail: user?.email, userId: user?.id || user?.uid }
            };
            
            if (typeof apiClient.updateOrder === 'function') {
                await apiClient.updateOrder(order.id, updatedData);
            } else {
                await apiClient.put(`/orders/${order.id}`, updatedData);
            }
            
            setAlertMessage(`Ordem atualizada para: ${newStatus}`);
            await handleReloadData();
        } catch (error) {
            setAlertMessage("Erro ao mudar o status: " + error.message);
        }
    };

    const handleCloseOrderSubmit = async (nfNumber, finalValue) => {
        try {
            const updatedData = {
                ...orderToClose,
                status: 'Concluída',
                invoiceNumber: nfNumber,
                totalValue: finalValue,
                editedBy: { userEmail: user?.email, userId: user?.id || user?.uid }
            };

            if (typeof apiClient.updateOrder === 'function') {
                await apiClient.updateOrder(orderToClose.id, updatedData);
            } else {
                await apiClient.put(`/orders/${orderToClose.id}`, updatedData);
            }

            setAlertMessage(`Ordem fechada! Despesa gerada para a NF ${nfNumber}.`);
            await handleReloadData();
        } catch (error) {
            setAlertMessage("Erro ao fechar ordem: " + error.message);
        } finally {
            setIsCloseModalOpen(false); 
            setOrderToClose(null);
        }
    };

    return (
        <div className="container mx-auto space-y-6 p-4 md:p-6 lg:p-8 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Ordens de Compra/Serviço</h1>
                 <ProtectedComponent requiredPermission="editor">
                    <div className="flex w-full sm:w-auto gap-2">
                        <button onClick={handleReloadData} className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg shadow hover:bg-gray-300 transition text-sm">
                            <RefreshCw size={18} className={isFetching ? "animate-spin" : ""} /> 
                        </button>
                        <button onClick={() => { setEditingOrder(null); setIsModalOpen(true); }} className="flex-1 sm:flex-none flex items-center gap-2 px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg shadow hover:bg-yellow-500 transition justify-center text-sm">
                            <PlusCircle size={18} />Nova Ordem
                        </button>
                    </div>
                </ProtectedComponent>
            </div>

            <div className="bg-white p-4 rounded-lg shadow grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-center text-sm">
                 <input type="text" placeholder="Nº Ordem" value={filters.number} onChange={e => setFilters({...filters, number: e.target.value})} className="p-2 border rounded-lg w-full bg-gray-50"/>
                 <input type="date" value={filters.date} onChange={e => setFilters({...filters, date: e.target.value})} className="p-2 border rounded-lg w-full bg-gray-50"/>
                 
                 <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className="p-2 border rounded-lg w-full bg-white outline-none">
                    <option value="">Status (Todos)</option>
                    <option value="Pendente de Valor">A Cotar (Pendente)</option>
                    <option value="Ativa">Ativa (Liberada)</option>
                    <option value="Concluída">Concluída</option>
                    <option value="Cancelada">Cancelada</option>
                 </select>

                 <select value={filters.obra} onChange={e => setFilters({...filters, obra: e.target.value})} className="p-2 border rounded-lg w-full bg-white">
                    <option value="">Todas as Obras</option>
                    {sortedObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    <option value="Administração">Administração</option>
                    <option value="Oficina">Oficina Central</option>
                 </select>
                 <select value={filters.vehicle} onChange={e => setFilters({...filters, vehicle: e.target.value})} className="p-2 border rounded-lg w-full bg-white">
                    <option value="">Todos os Veículos</option>
                    {sortedVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa}</option>)}
                 </select>
                 <input type="text" placeholder="Emissor (email)" value={filters.emitter} onChange={e => setFilters({...filters, emitter: e.target.value})} className="p-2 border rounded-lg w-full bg-gray-50"/>
            </div>

            <div className="bg-white rounded-lg shadow overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[1100px]"> 
                    <thead className="bg-gray-100 text-xs uppercase text-gray-700">
                        <tr>
                            <th className="p-3">Nº Ordem</th>
                            <th className="p-3">Obra/Local</th>
                            <th className="p-3">Veículo</th>
                            <th className="p-3">Fornecedor</th>
                            <th className="p-3">Func. / Op.</th>
                            <th className="p-3">Data</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Valor Total</th>
                            <th className="p-3 text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredOrders.map(order => {
                            const vehicle = vehicles.find(v => v.id === order.vehicleId);
                            const employee = employees.find(e => e.id === order.employeeId);
                            const operator = employees.find(e => e.id === order.operatorId);
                            const obra = obras.find(o => o.id === order.obraId);
                            
                            const anexosList = (() => {
                                if (!order.anexos) return [];
                                if (typeof order.anexos === 'string') {
                                    try { return JSON.parse(order.anexos); } catch(e) { return []; }
                                }
                                return Array.isArray(order.anexos) ? order.anexos : [];
                            })();

                            const statusStyles = {
                                'Ativa': 'bg-blue-100 text-blue-800',
                                'Concluída': 'bg-green-100 text-green-800',
                                'Cancelada': 'bg-red-100 text-red-800',
                                'Pendente de Valor': 'bg-yellow-100 text-yellow-800 animate-pulse'
                            };

                            return (
                                <tr key={order.id} className="hover:bg-gray-50 align-middle"> 
                                    <td className="p-3 font-bold text-gray-800 whitespace-nowrap">
                                        {String(order.orderNumber || '').padStart(6, '0')}
                                        {anexosList.length > 0 && <span title={`${anexosList.length} anexo(s)`} className="inline-block ml-2 text-gray-400"><Paperclip size={12}/></span>}
                                    </td>
                                    <td className="p-3">{obra?.nome || order.obraId || 'N/A'}</td> 
                                    <td className="p-3">{vehicle ? <span className="bg-gray-200 px-2 py-0.5 rounded text-xs font-mono">{vehicle.registroInterno}</span> : 'N/A'}</td>
                                    <td className="p-3 max-w-[150px] truncate" title={order.supplier}>{order.supplier}</td>
                                    <td className="p-3 text-xs leading-tight">
                                        <div><strong>R:</strong> {employee?.nome || 'N/A'}</div>
                                        {operator && operator.id !== employee?.id && <div className="text-gray-500 mt-0.5"><strong>Op:</strong> {operator.nome}</div>}
                                    </td>
                                    <td className="p-3 whitespace-nowrap">{order.date ? new Date(order.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${statusStyles[order.status] || 'bg-gray-100 text-gray-800'}`}>
                                            {order.status === 'Ativa' ? 'Liberada (Ativa)' : order.status}
                                        </span>
                                    </td>
                                     <td className="p-3 text-right font-medium text-gray-900">
                                        {order.status === 'Pendente de Valor' ? 'A Cotar' : `R$ ${(parseFloat(order.totalValue) || 0).toFixed(2)}`}
                                    </td>
                                    <td className="p-3">
                                        <div className="flex items-center justify-center gap-1.5 flex-wrap w-full"> 
                                            <button onClick={() => setOrderDetailsToView(order)} title="Ver Detalhes Completos (Raio-X)" className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-md transition border border-transparent hover:border-blue-200"><Eye size={16}/></button>
                                            <button onClick={() => handleOpenPDF(order)} title="Gerar / Visualizar PDF" className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-md transition"><FileText size={16}/></button>
                                            
                                            {order.status === 'Pendente de Valor' && (
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => handleQuickStatusChange(order, 'Ativa')} title="Aprovar e Liberar Ordem" className="p-1.5 text-green-600 hover:bg-green-50 border border-transparent hover:border-green-200 rounded-md transition"><ThumbsUp size={16}/></button>
                                                </ProtectedComponent>
                                            )}

                                            {order.status === 'Ativa' && (
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => { setOrderToClose(order); setIsCloseModalOpen(true); }} title="Concluir / Lançar Nota Fiscal" className="p-1.5 text-green-600 hover:bg-green-50 border border-transparent hover:border-green-200 rounded-md transition"><CheckCircle size={16}/></button>
                                                </ProtectedComponent>
                                            )}

                                            {order.status !== 'Cancelada' && order.status !== 'Concluída' && (
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => openEditModal(order)} title="Editar Ordem" className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-md transition"><Edit size={16}/></button>
                                                    <button onClick={() => openCancelModal(order)} title="Cancelar Ordem" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"><XCircle size={16}/></button>
                                                </ProtectedComponent>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                         {filteredOrders.length === 0 && (
                            <tr>
                                <td colSpan="9" className="p-8 text-center text-gray-500 italic">
                                    {isFetching ? <><Loader size={18} className="inline animate-spin text-yellow-500 mr-2"/> Buscando dados...</> : 'Nenhuma ordem encontrada com os filtros atuais.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* MODAIS ABERTOS CONDICIONALMENTE */}

            {orderDetailsToView && <OrderDetailsModal 
                order={orderDetailsToView} 
                onClose={() => setOrderDetailsToView(null)} 
                vehicles={vehicles} employees={employees} obras={obras}
            />}

            {isCloseModalOpen && orderToClose && <CloseOrderModal 
                order={orderToClose} 
                onClose={() => setIsCloseModalOpen(false)} 
                onSubmit={handleCloseOrderSubmit} 
            />}

            {isModalOpen && <OrderModal
                user={user}
                onClose={() => {setIsModalOpen(false); setEditingOrder(null);}}
                setAlertMessage={setAlertMessage}
                vehicles={vehicles}
                employees={employees}
                obras={obras}
                partners={partners}
                orderToEdit={editingOrder}
                generatePDF={handleOpenPDF} 
                apiClient={apiClient}
                reloadData={handleReloadData}
            />}

            {isCancelModalOpen && itemToCancel && <PasswordConfirmationModal
                message={`Confirme sua senha para CANCELAR a ordem Nº ${String(itemToCancel.orderNumber || '').padStart(6, '0')}.`}
                onConfirm={handleCancelOrder}
                onClose={() => setIsCancelModalOpen(false)}
                apiClient={apiClient} 
             />}
        </div>
    );
};

// ===================================================================================
// MODAL RAIO-X (VISUALIZAR TODOS OS DETALHES DA ORDEM)
// ===================================================================================
const OrderDetailsModal = ({ order, onClose, vehicles, employees, obras }) => {
    const vehicle = vehicles.find(v => v.id === order.vehicleId);
    const employee = employees.find(e => e.id === order.employeeId);
    const operator = employees.find(e => e.id === order.operatorId);
    const obra = obras.find(o => o.id === order.obraId);

    const anexosList = (() => {
        if (!order.anexos) return [];
        if (typeof order.anexos === 'string') {
            try { return JSON.parse(order.anexos); } catch(e) { return []; }
        }
        return Array.isArray(order.anexos) ? order.anexos : [];
    })();

    const itemsList = (() => {
        if (!order.items) return [];
        if (typeof order.items === 'string') {
            try { return JSON.parse(order.items); } catch(e) { return []; }
        }
        return Array.isArray(order.items) ? order.items : [];
    })();

    const payment = (() => {
        if (!order.payment) return { type: 'N/A' };
        if (typeof order.payment === 'string') {
            try { return JSON.parse(order.payment); } catch(e) { return { type: 'N/A' }; }
        }
        return order.payment;
    })();

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-5 border-b bg-gray-50 flex justify-between items-center">
                    <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                        <Eye className="text-blue-500"/> Detalhes da Ordem #{String(order.orderNumber || '').padStart(6, '0')}
                    </h2>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-200 rounded-full transition"><X size={20}/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Status e Datas Header */}
                    <div className="flex flex-wrap gap-4 items-center justify-between border-b pb-4">
                        <div>
                            <span className="text-xs font-bold text-gray-500 block uppercase mb-1">Status Atual</span>
                            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                                order.status === 'Concluída' ? 'bg-green-100 text-green-800' :
                                order.status === 'Ativa' ? 'bg-blue-100 text-blue-800' :
                                order.status === 'Cancelada' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                            }`}>
                                {order.status === 'Ativa' ? 'Liberada (Ativa)' : order.status}
                            </span>
                        </div>
                        <div>
                            <span className="text-xs font-bold text-gray-500 block uppercase mb-1">Data Emissão</span>
                            <p className="font-bold text-gray-900">{order.date ? new Date(order.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'N/A'}</p>
                        </div>
                        <div>
                            <span className="text-xs font-bold text-gray-500 block uppercase mb-1">Emissor (Criação)</span>
                            <p className="font-bold text-gray-900">{getCreatorEmail(order)}</p>
                        </div>
                        <div>
                            <span className="text-xs font-bold text-gray-500 block uppercase mb-1">Última Edição / Liberação</span>
                            <p className="font-bold text-gray-900">{getEditorEmail(order)}</p>
                        </div>
                    </div>

                    {/* Vínculos Operacionais */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded-lg border">
                            <h3 className="text-xs font-black text-gray-400 uppercase mb-3">Vínculos de Fornecimento</h3>
                            <p className="text-sm mb-2"><strong className="text-gray-700">Fornecedor:</strong> {order.supplier || 'N/A'}</p>
                            <p className="text-sm mb-2"><strong className="text-gray-700">Obra/Local (Custo):</strong> {obra?.nome || order.obraId || 'N/A'}</p>
                            <p className="text-sm"><strong className="text-gray-700">Veículo:</strong> {vehicle ? `${vehicle.registroInterno} - ${vehicle.placa}` : 'Uso Geral'}</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg border">
                            <h3 className="text-xs font-black text-gray-400 uppercase mb-3">Equipe Autorizada</h3>
                            <p className="text-sm mb-2"><strong className="text-gray-700">Func. / Retirada:</strong> {employee?.nome || 'N/A'}</p>
                            <p className="text-sm"><strong className="text-gray-700">Operador (Equipamento):</strong> {operator?.nome || 'Não se aplica'}</p>
                        </div>
                    </div>

                    {/* Fechamento / NF */}
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg">
                        <h3 className="text-xs font-black text-blue-800 uppercase mb-3">Dados Fiscais e Conclusão</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <p className="text-xs text-blue-600 font-bold uppercase mb-1">Nota Fiscal</p>
                                <p className="font-black text-blue-900">{order.invoiceNumber || 'Não informada'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-blue-600 font-bold uppercase mb-1">Condição de Pagamento</p>
                                <p className="font-bold text-blue-900">{payment.type} {payment.method ? `- ${payment.method}` : ''}</p>
                            </div>
                            <div>
                                <p className="text-xs text-blue-600 font-bold uppercase mb-1">Valor Total Autorizado</p>
                                <p className="font-black text-blue-900 text-lg">R$ {(parseFloat(order.totalValue) || 0).toFixed(2)}</p>
                            </div>
                        </div>
                        {payment.installments && payment.installments.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-blue-200">
                                <p className="text-xs font-bold text-blue-700 mb-2">Desdobramento de Parcelas:</p>
                                <div className="flex gap-2 flex-wrap">
                                    {payment.installments.map((inst, idx) => (
                                        <span key={idx} className="bg-white px-2 py-1 rounded text-xs border border-blue-200 shadow-sm font-semibold text-blue-900">
                                            {idx + 1}ª - {inst.dueDate ? new Date(inst.dueDate + 'T12:00:00Z').toLocaleDateString('pt-BR') : 'N/A'} - R$ {(parseFloat(inst.value) || 0).toFixed(2)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Itens e Anexos */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2">
                            <h3 className="text-xs font-black text-gray-500 uppercase mb-3 border-b pb-1">Itens Descriminados</h3>
                            <table className="w-full text-xs text-left">
                                <thead className="text-gray-400 border-b">
                                    <tr>
                                        <th className="pb-2 w-12">Qtd</th>
                                        <th className="pb-2">Descrição</th>
                                        <th className="pb-2 text-right">Vlr. Unit</th>
                                        <th className="pb-2 text-right">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {itemsList.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="py-2 font-bold">{item.quantity}</td>
                                            <td className="py-2">{item.description}</td>
                                            <td className="py-2 text-right">R$ {(parseFloat(item.unitPrice)||0).toFixed(2)}</td>
                                            <td className="py-2 text-right font-semibold">R$ {((parseFloat(item.quantity)||0) * (parseFloat(item.unitPrice)||0)).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        <div>
                            <h3 className="text-xs font-black text-gray-500 uppercase mb-3 border-b pb-1">Anexos / Orçamentos</h3>
                            {anexosList.length > 0 ? (
                                <ul className="space-y-2">
                                    {anexosList.map((anexo, i) => (
                                        <li key={i}>
                                            <a href={anexo.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2 bg-gray-50 border rounded text-xs font-semibold text-blue-600 hover:bg-blue-50 transition">
                                                <Paperclip size={14}/> {anexo.name || `Anexo ${i+1}`}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-gray-400 italic">Nenhum documento anexado.</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-100 text-right">
                    <button onClick={onClose} className="px-6 py-2 bg-white border border-gray-300 rounded shadow-sm text-sm font-bold text-gray-700 hover:bg-gray-50">Voltar para Lista</button>
                </div>
            </div>
        </div>
    );
};

// ===================================================================================
// MODAL FECHAMENTO / CONCLUSÃO (XML / NF)
// ===================================================================================
const CloseOrderModal = ({ order, onClose, onSubmit }) => {
    const [nfNumber, setNfNumber] = useState(order.invoiceNumber || '');
    const [finalValue, setFinalValue] = useState(order.totalValue || 0);
    const [isParsing, setIsParsing] = useState(false);

    const handleXmlImport = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        setIsParsing(true);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const xmlDoc = new DOMParser().parseFromString(evt.target.result, "text/xml");
                
                const nNfNode = xmlDoc.getElementsByTagName('nNF')[0];
                const vNfNode = xmlDoc.getElementsByTagName('vNF')[0] || xmlDoc.getElementsByTagName('vProd')[0];
                
                if (nNfNode) setNfNumber(nNfNode.textContent);
                if (vNfNode) setFinalValue(parseFloat(vNfNode.textContent).toFixed(2));

            } catch (err) {
                alert("Erro ao ler o XML. Preencha manualmente.");
            } finally {
                setIsParsing(false);
            }
        }
        reader.readAsText(file);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-6 border-t-4 border-green-500">
                <h3 className="text-lg font-bold text-gray-800 mb-2">Concluir Ordem #{String(order.orderNumber || '').padStart(6, '0')}</h3>
                <p className="text-xs text-gray-600 mb-4">A confirmação da NF ativará a despesa financeira na Obra selecionada.</p>
                
                <div className="mb-4 bg-gray-50 border p-3 rounded border-dashed text-center">
                    <label className="cursor-pointer text-sm font-bold text-green-600 hover:underline flex flex-col items-center gap-1">
                        <FileCode2 size={24}/> Importar Leitura de XML
                        <input type="file" accept=".xml" className="hidden" onChange={handleXmlImport} />
                    </label>
                    {isParsing && <p className="text-xs text-gray-500 mt-2">Lendo XML...</p>}
                </div>

                <div className="space-y-3 mb-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase">Nº Nota Fiscal *</label>
                        <input type="text" value={nfNumber} onChange={e=>setNfNumber(e.target.value)} className="w-full p-2 border rounded bg-white text-sm" required />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase">Valor Total Cobrado (R$) *</label>
                        <input type="number" step="0.01" value={finalValue} onChange={e=>setFinalValue(e.target.value)} className="w-full p-2 border rounded bg-white text-sm" required />
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded text-sm font-bold text-gray-700 hover:bg-gray-300">Cancelar</button>
                    <button onClick={() => onSubmit(nfNumber, parseFloat(finalValue))} className="px-4 py-2 bg-green-600 text-white rounded text-sm font-bold hover:bg-green-700" disabled={!nfNumber || finalValue <= 0}>
                        Concluir e Lançar NF
                    </button>
                </div>
            </div>
        </div>
    );
};


// ===================================================================================
// MODAL DE CRIAÇÃO/EDIÇÃO DE ORDEM
// ===================================================================================
const OrderModal = ({ user, onClose, setAlertMessage, vehicles = [], employees = [], obras = [], partners = [], orderToEdit, generatePDF, apiClient, reloadData }) => {
    
    // Tratamento de segurança para Anexos
    const parsedAnexos = useMemo(() => {
        if (!orderToEdit?.anexos) return [];
        if (typeof orderToEdit.anexos === 'string') {
            try { return JSON.parse(orderToEdit.anexos); } catch(e) { return []; }
        }
        return Array.isArray(orderToEdit.anexos) ? orderToEdit.anexos : [];
    }, [orderToEdit]);

    const [formData, setFormData] = useState({
        supplier: orderToEdit?.supplier || '',
        supplierId: orderToEdit?.supplierId || '',
        date: orderToEdit?.date ? new Date(orderToEdit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        employeeId: orderToEdit?.employeeId || '',
        operatorId: orderToEdit?.operatorId || '',
        obraId: orderToEdit?.obraId || '',
        vehicleId: orderToEdit?.vehicleId || '',
        items: (Array.isArray(orderToEdit?.items) && orderToEdit.items.length > 0 ? orderToEdit.items : [{ quantity: '1', description: '', unitPrice: '' }]).map(item => ({
            quantity: item.quantity?.toString() || '1',
            description: item.description || '',
            unitPrice: item.unitPrice?.toString() || ''
        })),
        payment: orderToEdit?.payment || { type: 'À vista', method: '', days: '', installments: [] },
        anexos: parsedAnexos,
        createdBy: orderToEdit?.createdBy || undefined 
    });

    const [isPricePending, setIsPricePending] = useState(orderToEdit ? orderToEdit.status === 'Pendente de Valor' : true);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const sortedVehicles = useMemo(() => [...vehicles].sort((a,b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);
    const sortedEmployees = useMemo(() => [...employees].sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [employees]);
    const sortedObras = useMemo(() => [...obras].filter(o => o.status === 'ativa').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);

    // Gestão de Itens
    const handleItemChange = (index, field, value) => {
        const newItems = [...formData.items];
        let processedValue = value;
        if (field === 'unitPrice' || field === 'quantity') {
             processedValue = value.replace(',', '.');
             if (!/^\d*\.?\d*$/.test(processedValue) && processedValue !== '') return;
        }
        newItems[index] = { ...newItems[index], [field]: processedValue };
        setFormData(prev => ({...prev, items: newItems}));
    };
    
    const addItem = () => setFormData(prev => ({ ...prev, items: [...prev.items, { quantity: '1', description: '', unitPrice: '' }]}));
    const removeItem = (index) => setFormData(prev => ({ ...prev, items: formData.items.filter((_, i) => i !== index) }));

    const totalValue = useMemo(() => {
        if (isPricePending) return 0;
        return formData.items.reduce((total, item) => {
            const quantity = parseFloat(item.quantity) || 0;
            const price = parseFloat(item.unitPrice) || 0;
            return total + (quantity * price);
        }, 0);
    }, [formData.items, isPricePending]);

    // Gestão de Parcelas
    const addInstallment = () => {
        setFormData(p => ({
            ...p,
            payment: {
                ...p.payment,
                installments: [...(p.payment.installments || []), { dueDate: '', value: '' }]
            }
        }));
    };

    const handleInstallmentChange = (idx, field, value) => {
        setFormData(p => {
            const newInst = [...(p.payment.installments || [])];
            newInst[idx] = { ...newInst[idx], [field]: value };
            return { ...p, payment: { ...p.payment, installments: newInst } };
        });
    };

    const removeInstallment = (idx) => {
        setFormData(p => {
            const newInst = [...(p.payment.installments || [])];
            newInst.splice(idx, 1);
            return { ...p, payment: { ...p.payment, installments: newInst } };
        });
    };

    // Gestão de Upload
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) { 
            setAlertMessage("O arquivo excede o limite de 5MB.");
            return;
        }

        setIsUploading(true);
        try {
            const uploadData = new FormData();
            uploadData.append('file', file);
            
            let fileUrl = '';
            
            try {
                const res = await apiClient.post('/upload', uploadData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                fileUrl = res.url || res.fileUrl || res.path || '';
            } catch (err) {
                console.warn("Upload falhou no servidor. Tentando fallback para Base64 local.", err);
            }

            if (!fileUrl) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                await new Promise((resolve, reject) => {
                    reader.onload = () => resolve();
                    reader.onerror = () => reject();
                });
                fileUrl = reader.result;
            }

            setFormData(p => ({
                ...p,
                anexos: [...(p.anexos || []), { name: file.name, url: fileUrl }]
            }));
            
        } catch (error) {
            console.error(error);
            setAlertMessage("Erro ao anexar arquivo.");
        } finally {
            setIsUploading(false);
            e.target.value = ''; 
        }
    };

    const removeAnexo = (index) => {
        setFormData(p => ({
            ...p,
            anexos: p.anexos.filter((_, i) => i !== index)
        }));
    };

    const handleSave = async (e) => {
        if(e) e.preventDefault();
        
        // Validações Rígidas
        const itemsValid = formData.items.length > 0 && formData.items.every(i => (parseFloat(i.quantity) || 0) > 0 && i.description.trim() !== '');
        const pricesValid = isPricePending || formData.items.every(i => (parseFloat(i.unitPrice) || 0) > 0);
        const paymentValid = formData.payment.type !== 'A prazo' || !!formData.payment.method;

        if (!formData.supplierId || !formData.date || !formData.employeeId || !formData.obraId || !itemsValid || !pricesValid || !paymentValid) {
            let errorMsg = "Preencha Fornecedor, Data, Func. Autorizado, Obra Destino, e Itens válidos.";
            if (!isPricePending && !pricesValid) errorMsg += " Informe os valores Unitários.";
            if (!paymentValid && formData.payment.type === 'A prazo') errorMsg += " Selecione o método de pagamento a prazo.";
            setAlertMessage(errorMsg);
            return;
        }

        setIsSaving(true);

        const finalOrderData = {
            supplier: formData.supplier,
            supplierId: formData.supplierId,
            date: new Date(formData.date + 'T12:00:00Z').toISOString(), 
            employeeId: formData.employeeId,
            operatorId: formData.operatorId || null,
            obraId: formData.obraId,
            vehicleId: formData.vehicleId || null,
            items: formData.items.map(item => ({
                 quantity: parseFloat(item.quantity) || 0,
                 description: item.description,
                 unitPrice: isPricePending ? 0 : (parseFloat(item.unitPrice) || 0)
            })),
            payment: formData.payment,
            anexos: JSON.stringify(formData.anexos || []),
            totalValue: isPricePending ? 0 : totalValue,
            status: isPricePending ? 'Pendente de Valor' : 'Ativa',
            createdBy: orderToEdit ? formData.createdBy : { userEmail: user?.email, userId: user?.id || user?.uid },
            editedBy: orderToEdit ? { userEmail: user?.email, userId: user?.id || user?.uid } : null
        };

        try {
            let savedOrderData;
            
            // Suporte híbrido caso apiClient esteja defasado
            if (orderToEdit) {
                if (typeof apiClient.updateOrder === 'function') {
                    savedOrderData = await apiClient.updateOrder(orderToEdit.id, finalOrderData);
                } else {
                    const res = await apiClient.put(`/orders/${orderToEdit.id}`, finalOrderData);
                    savedOrderData = res.data || res;
                }
                setAlertMessage(`Ordem atualizada com sucesso!`);
            } else {
                if (typeof apiClient.createOrder === 'function') {
                    savedOrderData = await apiClient.createOrder(finalOrderData);
                } else {
                    const res = await apiClient.post('/orders', finalOrderData);
                    savedOrderData = res.data || res;
                }
                setAlertMessage(`Ordem criada com sucesso!`);
            }

            if (reloadData) await reloadData();

            if (savedOrderData) {
                 const pdfData = { ...finalOrderData, ...savedOrderData };
                 if (!pdfData.orderNumber && savedOrderData.orderNumber) pdfData.orderNumber = savedOrderData.orderNumber;
                 pdfData.createdBy = finalOrderData.createdBy; 
                 generatePDF(pdfData);
            }
            onClose();
        } catch (error) {
            console.error("Erro ao salvar ordem:", error);
            setAlertMessage(error.message || "Falha ao salvar a ordem.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col my-auto">
                {/* Cabeçalho */}
                <div className="p-4 sm:p-5 border-b sticky top-0 bg-white z-10 flex justify-between items-center rounded-t-lg">
                    <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                        {orderToEdit ? <Edit size={22} className="text-yellow-500"/> : <PlusCircle size={22} className="text-yellow-500"/>} 
                        {orderToEdit ? 'Editar Ordem / Anexos' : 'Nova Ordem de Compra/Serviço'}
                    </h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                </div>

                {/* Formulário (envolve conteúdo e rodapé) */}
                <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden"> 
                    
                    {/* Conteúdo Rolável */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 text-sm">
                        {/* 1. Informações Base */}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 bg-gray-50 p-4 rounded border border-gray-200 mb-6">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Fornecedor *</label>
                                <SearchableSupplierSelect 
                                    partners={partners.filter(p => p.tipo_parceiro === 'fornecedor')} 
                                    value={formData.supplierId} 
                                    onChange={(id, name) => setFormData({...formData, supplierId: id, supplier: name})} 
                                />
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Data Emissão *</label>
                                <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="p-2 border rounded w-full bg-white outline-none focus:border-yellow-500" required />
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Obra de Destino (Custo) *</label>
                                <select value={formData.obraId} onChange={e => setFormData({...formData, obraId: e.target.value})} className="p-2 border rounded w-full bg-white outline-none focus:border-yellow-500" required>
                                    <option value="">Selecione...</option>
                                    {sortedObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                    <option value="Administração">Administração</option>
                                    <option value="Oficina">Oficina Central</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1" title="Quem fará o serviço ou irá retirar as peças">Funcionário Autorizado (Retirada) *</label>
                                <select value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})} className="p-2 border rounded w-full bg-white outline-none focus:border-yellow-500" required>
                                    <option value="">Selecione quem irá retirar...</option>
                                    {sortedEmployees.map(e => <option key={e.id} value={e.id}>{e.nome} {e.vulgo ? `(${e.vulgo})` : ''}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1" title="Para cruzamento de custos de manutenção de equipamento">Operador do Equipamento (Custo)</label>
                                <select value={formData.operatorId} onChange={e => setFormData({...formData, operatorId: e.target.value})} className="p-2 border rounded w-full bg-white outline-none focus:border-yellow-500">
                                    <option value="">Opcional / Não se aplica</option>
                                    {sortedEmployees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                                </select>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Vincular Veículo / Equipamento</label>
                                <select value={formData.vehicleId} onChange={e => setFormData({...formData, vehicleId: e.target.value})} className="p-2 border rounded w-full bg-white outline-none focus:border-yellow-500">
                                    <option value="">Uso Geral / Sem Veículo Específico</option>
                                    {sortedVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa} ({v.modelo})</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Layout Dividido para Telas Grandes: (Pagamento + Anexos) | (Itens) */}
                        <div className="flex flex-col lg:flex-row gap-6">
                            
                            {/* Coluna Esquerda: Itens */}
                            <div className="flex-1 border-t lg:border-t-0 pt-4 lg:pt-0">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-gray-800 uppercase">Itens / Serviços *</h3>
                                    <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
                                        <input type="checkbox" checked={isPricePending} onChange={() => setIsPricePending(!isPricePending)} className="rounded text-yellow-600 focus:ring-yellow-500"/>
                                        Ordem a Cotar (Sem Valor)
                                    </label>
                                </div>
                                <div className="space-y-3">
                                    {formData.items.map((item, index) => (
                                        <div key={index} className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2 rounded border">
                                            <div className="col-span-3 sm:col-span-2">
                                                <input type="text" inputMode="decimal" placeholder="Qtd" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} className="p-1.5 border rounded w-full text-sm bg-white outline-none focus:border-yellow-500 text-center" required/>
                                            </div>
                                            <div className="col-span-9 sm:col-span-5">
                                                <input type="text" placeholder="Descrição da Peça ou Serviço" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} className="p-1.5 border rounded w-full text-sm bg-white outline-none focus:border-yellow-500" required />
                                            </div>
                                            <div className="col-span-10 sm:col-span-4">
                                                <div className="relative">
                                                    {!isPricePending && <span className="absolute left-2 top-2 text-xs text-gray-500">R$</span>}
                                                    <input type="text" inputMode="decimal" step="0.01" placeholder={isPricePending ? "Aguardando" : "Unitário"} value={item.unitPrice} onChange={e => handleItemChange(index, 'unitPrice', e.target.value)} className={`p-1.5 border rounded w-full text-sm outline-none focus:border-yellow-500 ${isPricePending ? 'bg-gray-100 cursor-not-allowed text-center text-xs text-gray-400' : 'bg-white pl-7'}`} required={!isPricePending} disabled={isPricePending} />
                                                </div>
                                            </div>
                                            <div className="col-span-2 sm:col-span-1 flex items-center justify-center">
                                                {formData.items.length > 1 && <button type="button" onClick={() => removeItem(index)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button type="button" onClick={addItem} className="text-xs text-blue-600 font-bold hover:underline mt-2">+ Adicionar Linha</button>
                                
                                <div className="mt-6 border-t pt-4">
                                    <p className={`text-right font-black text-2xl ${isPricePending ? 'text-gray-400' : 'text-green-700'}`}>
                                        <span className="text-sm font-bold text-gray-500 mr-2 uppercase">Total da Ordem:</span> 
                                        {isPricePending ? 'A COTAR' : `R$ ${totalValue.toFixed(2)}`}
                                    </p>
                                </div>
                            </div>

                            {/* Coluna Direita: Financeiro e Arquivos */}
                            <div className="w-full lg:w-[400px] flex flex-col gap-6">
                                
                                {/* Pagamento */}
                                <div className="border rounded p-4 bg-white shadow-sm">
                                    <h3 className="font-bold text-gray-800 uppercase mb-3 text-xs">Condição de Pagamento *</h3>
                                    
                                    <div className="flex gap-4 mb-3 border-b pb-3">
                                        <label className="inline-flex items-center cursor-pointer font-medium"><input type="radio" name="paymentType" value="À vista" checked={formData.payment.type === 'À vista'} onChange={e => setFormData({...formData, payment: {type: e.target.value, method:'', days: '', installments:[]}})} className="h-4 w-4 text-yellow-600 focus:ring-yellow-500"/> <span className="ml-2">À vista</span></label>
                                        <label className="inline-flex items-center cursor-pointer font-medium"><input type="radio" name="paymentType" value="A prazo" checked={formData.payment.type === 'A prazo'} onChange={e => setFormData({...formData, payment: {type: e.target.value, method: formData.payment.method || 'PIX', days: '', installments: formData.payment.installments || []}})} className="h-4 w-4 text-yellow-600 focus:ring-yellow-500"/> <span className="ml-2">A prazo</span></label>
                                    </div>
                                    
                                    {formData.payment.type === 'A prazo' && (
                                        <div className="space-y-4 animate-fade-in">
                                            <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Método de Pagamento*</label>
                                                <select value={formData.payment.method} onChange={e => setFormData({...formData, payment: {...formData.payment, method: e.target.value}})} className="p-2 border rounded bg-white text-sm w-full outline-none focus:border-yellow-500" required>
                                                    <option value="PIX">PIX (Transferência)</option>
                                                    <option value="Boleto">Boleto Bancário</option>
                                                    <option value="Cartão Corporativo">Cartão de Crédito</option>
                                                </select>
                                            </div>
                                            
                                            <div className="bg-gray-50 p-3 rounded border">
                                                <div className="flex justify-between items-center mb-3">
                                                    <h4 className="text-xs font-bold text-gray-700 uppercase">Detalhamento de Parcelas</h4>
                                                    <button type="button" onClick={addInstallment} className="text-xs text-blue-600 font-bold hover:underline">+ Parcela</button>
                                                </div>
                                                
                                                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                                    {formData.payment.installments?.map((inst, idx) => (
                                                        <div key={idx} className="flex gap-2 items-center bg-white p-2 rounded border shadow-sm">
                                                            <span className="text-[10px] font-black text-gray-400">{idx + 1}ª</span>
                                                            <input type="date" value={inst.dueDate} onChange={e => handleInstallmentChange(idx, 'dueDate', e.target.value)} className="p-1 border rounded text-xs w-full text-gray-700 outline-none" title="Data de Vencimento" required/>
                                                            <input type="number" step="0.01" placeholder="R$" value={inst.value} onChange={e => handleInstallmentChange(idx, 'value', e.target.value)} className="p-1 border rounded text-xs w-24 outline-none" required/>
                                                            <button type="button" onClick={() => removeInstallment(idx)} className="text-red-400 hover:text-red-600"><X size={14}/></button>
                                                        </div>
                                                    ))}
                                                    {(!formData.payment.installments || formData.payment.installments.length === 0) && (
                                                        <p className="text-xs text-gray-400 italic text-center py-2">Defina as datas e valores acordados.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Anexos */}
                                <div className="border rounded p-4 bg-white shadow-sm">
                                    <h3 className="font-bold text-gray-800 uppercase mb-3 text-xs flex items-center gap-2"><Paperclip size={14}/> Orçamentos e Documentos</h3>
                                    
                                    <ul className="space-y-2 mb-3 max-h-32 overflow-y-auto custom-scrollbar">
                                        {formData.anexos.map((anexo, i) => (
                                            <li key={i} className="flex justify-between items-center bg-gray-50 p-2 border rounded text-xs">
                                                <a href={anexo.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 truncate w-4/5 font-medium"><FileText size={12} className="shrink-0"/> {anexo.name || `Documento ${i+1}`}</a>
                                                <button type="button" onClick={() => removeAnexo(i)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14}/></button>
                                            </li>
                                        ))}
                                        {formData.anexos.length === 0 && <li className="text-xs text-gray-400 italic">Nenhum arquivo anexado.</li>}
                                    </ul>
                                    
                                    <div className="flex items-center w-full">
                                        <input type="file" id="file-upload" className="hidden" onChange={handleFileUpload} accept=".pdf, .jpg, .jpeg, .png, .xls, .xlsx, .csv" />
                                        <label htmlFor="file-upload" className={`w-full cursor-pointer flex justify-center items-center gap-2 px-3 py-2 rounded text-sm font-semibold transition border border-dashed ${isUploading ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}>
                                            {isUploading ? <Loader className="animate-spin" size={16} /> : <UploadCloud size={16} />}
                                            {isUploading ? 'Processando Upload...' : 'Adicionar Arquivo'}
                                        </label>
                                    </div>
                                    <p className="text-[9px] text-gray-400 mt-2 text-center">Permitido PDF, Imagens e Planilhas (Max. 5MB).</p>
                                </div>
                            </div>
                        </div>
                    </div> 

                    {/* Rodapé Fixo */}
                    <div className="p-4 bg-white border-t flex flex-col sm:flex-row justify-end gap-3 sticky bottom-0 z-10 rounded-b-lg shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                        <button type="button" onClick={onClose} className="px-5 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm font-bold text-gray-700 w-full sm:w-auto" disabled={isSaving}>Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-5 py-2 bg-yellow-400 text-gray-900 font-bold rounded-lg shadow hover:bg-yellow-500 disabled:opacity-50 flex items-center justify-center gap-2 text-sm w-full sm:w-auto">
                             {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando e Gerando...</> : 'Salvar e Gerar PDF'}
                        </button>
                    </div>
                </form> 
            </div>
        </div>
    );
};

export default OrdersPage;