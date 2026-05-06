import React, { useState, useMemo, useEffect, useRef } from 'react';
import apiClient from '../services/apiClient';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    PlusCircle, Edit, Trash2, FileText, XCircle, Loader, X,
    ChevronDown, UploadCloud, Paperclip
} from 'lucide-react';

import ProtectedComponent from '../components/ProtectedComponent'; 
import { PasswordConfirmationModal } from '../App'; 

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

    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text('Ordem de Compra/Serviço', pageWidth - margin, 15, { align: 'right' });
    doc.setFontSize(12); doc.setFont('helvetica', 'normal');
    doc.text(`Nº: ${String(order.orderNumber || '0').padStart(6, '0')}`, pageWidth - margin, 22, { align: 'right' });
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
        order.status !== 'Pendente de Valor' ? `R$ ${(item.unitPrice || 0).toFixed(2)}` : 'A cotar',
        order.status !== 'Pendente de Valor' ? `R$ ${((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}` : 'A cotar'
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
                const displayTotal = order.totalValue != null ? order.totalValue : (order.items || []).reduce((sum, i) => sum + ((i.quantity || 0) * (i.unitPrice || 0)), 0);
                doc.text(`R$ ${(displayTotal || 0).toFixed(2)}`, pageWidth - margin, finalY + 8, { align: 'right' });
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
                const valorFormat = parseFloat(inst.value || 0).toFixed(2);
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
    doc.text(`Ordem emitida por: ${order.createdBy?.userEmail || 'N/A'}`, margin, footerStartY + 15);

    doc.setLineDashPattern([1, 1], 0); doc.setDrawColor(180, 180, 180);
    doc.line(0, effectivePageHeight, pageWidth, effectivePageHeight);

    doc.output('dataurlnewwindow');
};

// ===================================================================================
// COMPONENTE PRINCIPAL: PÁGINA
// ===================================================================================
const OrdersPage = ({
    user, setAlertMessage,
    vehicles = [], employees = [], obras = [], partners = [], // Recebe partners
    PasswordConfirmationModal, apiClient, reloadData,
    orders = [] 
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [itemToCancel, setItemToCancel] = useState(null);
    const [filters, setFilters] = useState({ obra: '', vehicle: '', emitter: '', date: '', number: '' });
    const [loadingCancel, setLoadingCancel] = useState(false);

    const sortedObras = useMemo(() => [...(obras || [])].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);
    const sortedVehicles = useMemo(() => [...(vehicles || [])].sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);

    const filteredOrders = useMemo(() => {
        return (orders || []).filter(order => {
            const dateMatch = !filters.date || (order.date && new Date(order.date).toISOString().split('T')[0] === filters.date);
            const numberMatch = !filters.number || String(order.orderNumber).padStart(6, '0').includes(filters.number);
            const obraMatch = !filters.obra || order.obraId === filters.obra;
            const vehicleMatch = !filters.vehicle || order.vehicleId === filters.vehicle;
            const emitterMatch = !filters.emitter || (order.createdBy?.userEmail || '').toLowerCase().includes(filters.emitter.toLowerCase());
            return dateMatch && numberMatch && obraMatch && vehicleMatch && emitterMatch;
        })
        .sort((a, b) => (b.orderNumber || 0) - (a.orderNumber || 0)); 
    }, [orders, filters]);

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
        setLoadingCancel(true); 
        try {
            await apiClient.cancelOrder(itemToCancel.id); 
            setAlertMessage("Ordem cancelada com sucesso.");
            reloadData(); 
        } catch (error) {
            setAlertMessage(error.message || "Falha ao cancelar a ordem.");
        } finally {
            setIsCancelModalOpen(false);
            setItemToCancel(null);
            setLoadingCancel(false); 
        }
    };

    return (
        <div className="container mx-auto space-y-6 p-4 md:p-6 lg:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Ordens de Compra/Serviço</h1>
                 <ProtectedComponent requiredPermission="editor">
                    <button onClick={() => { setEditingOrder(null); setIsModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg shadow hover:bg-yellow-500 transition w-full sm:w-auto justify-center text-sm">
                        <PlusCircle size={18} />Nova Ordem
                    </button>
                </ProtectedComponent>
            </div>

            <div className="bg-white p-4 rounded-lg shadow grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-center text-sm">
                 <input type="text" placeholder="Nº Ordem" value={filters.number} onChange={e => setFilters({...filters, number: e.target.value})} className="p-2 border rounded-lg w-full bg-gray-50"/>
                 <input type="date" value={filters.date} onChange={e => setFilters({...filters, date: e.target.value})} className="p-2 border rounded-lg w-full bg-gray-50"/>
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
                <table className="w-full text-sm text-left min-w-[1000px]"> 
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
                            <th className="p-3">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
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
                                'Ativa': 'bg-green-100 text-green-800',
                                'Cancelada': 'bg-red-100 text-red-800',
                                'Pendente de Valor': 'bg-yellow-100 text-yellow-800 animate-pulse'
                            };

                            return (
                                <tr key={order.id} className="border-b hover:bg-gray-50 align-top"> 
                                    <td className="p-3 font-bold text-gray-800 whitespace-nowrap">
                                        {String(order.orderNumber || '').padStart(6, '0')}
                                        {anexosList.length > 0 && <span title={`${anexosList.length} anexo(s)`} className="inline-block ml-2 text-gray-400"><Paperclip size={12}/></span>}
                                    </td>
                                    <td className="p-3">{obra?.nome || order.obraId || 'N/A'}</td> 
                                    <td className="p-3">{vehicle ? `${vehicle.registroInterno}` : 'N/A'}</td>
                                    <td className="p-3 max-w-[150px] truncate" title={order.supplier}>{order.supplier}</td>
                                    <td className="p-3 text-xs leading-tight">
                                        <div><strong>R:</strong> {employee?.nome || 'N/A'}</div>
                                        {operator && operator.id !== employee?.id && <div className="text-gray-500 mt-0.5"><strong>Op:</strong> {operator.nome}</div>}
                                    </td>
                                    <td className="p-3 whitespace-nowrap">{order.date ? new Date(order.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${statusStyles[order.status] || 'bg-gray-100 text-gray-800'}`}>
                                            {order.status}
                                        </span>
                                    </td>
                                     <td className="p-3 text-right font-medium text-gray-900">
                                        {order.status === 'Pendente de Valor' ? 'A Cotar' : `R$ ${(order.totalValue || 0).toFixed(2)}`}
                                    </td>
                                    <td className="p-3">
                                        <div className="flex items-center gap-1 flex-nowrap"> 
                                            <button onClick={() => handleOpenPDF(order)} title="Visualizar PDF" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition"><FileText size={14}/></button>
                                            {order.status !== 'Cancelada' && (
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => openEditModal(order)} title="Editar Ordem / Anexos" className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-md transition"><Edit size={14}/></button>
                                                    <button onClick={() => openCancelModal(order)} title="Cancelar Ordem" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"><XCircle size={14}/></button>
                                                </ProtectedComponent>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                         {filteredOrders.length === 0 && (
                            <tr><td colSpan="9" className="p-6 text-center text-gray-500 italic">Nenhuma ordem encontrada.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

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
                reloadData={reloadData}
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
        items: (Array.isArray(orderToEdit?.items) ? orderToEdit.items : []).map(item => ({
            quantity: item.quantity?.toString() || '1',
            description: item.description || '',
            unitPrice: item.unitPrice?.toString() || ''
        })) || [{ quantity: '1', description: '', unitPrice: '' }],
        payment: orderToEdit?.payment || { type: 'À vista', method: '', days: '', installments: [] },
        anexos: parsedAnexos
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
        if (field === 'unitPrice') {
             processedValue = value.replace(',', '.');
             if (!/^\d*\.?\d{0,2}$/.test(processedValue) && processedValue !== '') return;
        } else if (field === 'quantity') {
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

        if (file.size > 5 * 1024 * 1024) { // Proteção de 5MB
            setAlertMessage("O arquivo excede o limite de 5MB.");
            return;
        }

        setIsUploading(true);
        try {
            const uploadData = new FormData();
            uploadData.append('file', file);
            
            let fileUrl = '';
            
            try {
                // Tenta Endpoint genérico /upload
                const res = await apiClient.post('/upload', uploadData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                fileUrl = res.url || res.fileUrl || res.path || '';
            } catch (err) {
                console.warn("Upload falhou no servidor. Tentando fallback para Base64 local.", err);
            }

            // Fallback robusto (Converte em Base64 e salva no banco de dados)
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
        
        // Validações
        const itemsValid = formData.items.length > 0 && formData.items.every(i => (parseFloat(i.quantity) || 0) > 0 && i.description);
        const pricesValid = isPricePending || formData.items.every(i => (parseFloat(i.unitPrice) || 0) > 0);
        const paymentValid = formData.payment.type !== 'A prazo' || !!formData.payment.method;

        if (!formData.supplierId || !formData.date || !formData.employeeId || !formData.obraId || !itemsValid || !pricesValid || !paymentValid) {
            let errorMsg = "Preencha Fornecedor, Data, Func. Autorizado, Obra Destino, e Itens válidos.";
            if (!isPricePending) errorMsg += " Informe os valores Unitários.";
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
            anexos: JSON.stringify(formData.anexos || []), // Envia stringificado
            totalValue: isPricePending ? 0 : totalValue,
            status: isPricePending ? 'Pendente de Valor' : 'Ativa',
        };

        try {
            let savedOrderData;
            if (orderToEdit) {
                savedOrderData = await apiClient.updateOrder(orderToEdit.id, finalOrderData);
                setAlertMessage(`Ordem atualizada com sucesso!`);
            } else {
                savedOrderData = await apiClient.createOrder(finalOrderData);
                setAlertMessage(`Ordem criada com sucesso!`);
            }

            reloadData();

            if (savedOrderData) {
                 const pdfData = { ...formData, ...savedOrderData };
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
                                    partners={partners} 
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