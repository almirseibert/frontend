import React, { useState, useMemo, useEffect, useRef } from 'react';
import apiClient from '../services/apiClient';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    PlusCircle, Edit, Trash2, FileText, XCircle, Loader, X,
    CheckCircle, MessageCircle, FileUp, FileCode2, Paperclip, Wrench
} from 'lucide-react';
import ProtectedComponent from '../components/ProtectedComponent';

// ===================================================================================
// GERAÇÃO DE PDF PARA ORDEM DE COMPRA/SERVIÇO
// ===================================================================================
const generateOrderPDF = (order, vehicle, employee, obra, logoDataUrl) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
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

    const infoStartY = 45; const midX = (pageWidth / 2) + 5;
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

    if (vehicle) {
        doc.setFont('helvetica', 'bold');
        doc.text('Veículo Vinculado:', midX, infoStartY + 7);
        doc.setFont('helvetica', 'normal');
        doc.text(`${vehicle.registroInterno || 'N/A'} - ${vehicle.placa || 'N/A'}`, midX + 35, infoStartY + 7); 
    }

    const tableBody = (order.items || []).map(item => [
        item.quantity || 0,
        item.description || '',
        order.status !== 'A Cotar' ? `R$ ${(item.unitPrice || 0).toFixed(2)}` : 'A cotar',
        order.status !== 'A Cotar' ? `R$ ${((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}` : 'A cotar'
    ]);

    let finalY = infoStartY + 15;

    autoTable(doc, {
        startY: finalY,
        head: [['Qtd.', 'Descrição do Item/Serviço', 'Vlr. Unit.', 'Vlr. Total']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [24, 49, 83], fontSize: 9 },
        styles: { fontSize: 8 },
        didDrawPage: (data) => {
            finalY = data.cursor.y;
            if (order.status !== 'A Cotar') {
                doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
                doc.text('Total Geral:', data.settings.margin.left, finalY + 8);
                const displayTotal = order.totalValue != null ? order.totalValue : (order.items || []).reduce((sum, i) => sum + ((i.quantity || 0) * (i.unitPrice || 0)), 0);
                doc.text(`R$ ${(displayTotal || 0).toFixed(2)}`, pageWidth - margin, finalY + 8, { align: 'right' });
                finalY += 8; 
            }
        }
    });

    if (doc.lastAutoTable && doc.lastAutoTable.finalY) finalY = Math.max(finalY, doc.lastAutoTable.finalY);
    finalY += 10; 

    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Condição de Pagamento:', margin, finalY);
    doc.setFont('helvetica', 'normal');
    let paymentText = order.payment?.type || 'N/A';
    if (order.payment?.type === 'A prazo') {
        paymentText += ` - ${order.payment.method || ''}`;
        if (order.payment.method === 'Boleto') paymentText += ` (${order.payment.days || ''} dias)`;
    }
    doc.text(paymentText, margin + 45, finalY);
    finalY += 10;

    const footerStartY = Math.max(finalY, 120); 
    doc.setLineWidth(0.2); doc.line(margin, footerStartY, pageWidth - margin, footerStartY);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('ATENÇÃO: A NF DEVE SER FATURADA CONFORME DADOS ABAIXO.', margin, footerStartY + 5);
    doc.setFont('helvetica', 'normal');
    doc.text('Apenas os itens listados estão autorizados. Itens extras não serão pagos sem prévia aprovação.', margin, footerStartY + 9);
    doc.setFont('helvetica', 'italic');
    doc.text(`Ordem emitida eletronicamente por: ${order.createdBy?.userEmail || 'N/A'}`, margin, footerStartY + 15);

    doc.setLineDashPattern([1, 1], 0); doc.setDrawColor(180, 180, 180);
    doc.line(0, 148.5, pageWidth, 148.5);

    doc.output('dataurlnewwindow');
};

// ===================================================================================
// PÁGINA PRINCIPAL
// ===================================================================================
const OrdersPage = ({
    user, setAlertMessage, vehicles = [], employees = [], obras = [], partners = [], 
    PasswordConfirmationModal, ConfirmationModal, apiClient, reloadData, orders = [] 
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [itemToCancel, setItemToCancel] = useState(null);
    
    // Novo fluxo: Fechamento via XML
    const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
    const [orderToClose, setOrderToClose] = useState(null);

    const [filters, setFilters] = useState({ obra: '', vehicle: '', emitter: '', date: '', number: '', status: '' });

    const sortedObras = useMemo(() => [...(obras || [])].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);
    const sortedVehicles = useMemo(() => [...(vehicles || [])].sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);
    
    // Filtra para exibir apenas fornecedores na listagem (caso queira, senão mostra todos)
    const suppliers = useMemo(() => [...(partners || [])].sort((a,b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '')), [partners]);

    const filteredOrders = useMemo(() => {
        return (orders || []).filter(order => {
            const dateMatch = !filters.date || (order.date && new Date(order.date).toISOString().split('T')[0] === filters.date);
            const numberMatch = !filters.number || String(order.orderNumber).padStart(6, '0').includes(filters.number);
            const obraMatch = !filters.obra || order.obraId === filters.obra;
            const vehicleMatch = !filters.vehicle || order.vehicleId === filters.vehicle;
            const statusMatch = !filters.status || order.status === filters.status;
            const emitterMatch = !filters.emitter || (order.createdBy?.userEmail || '').toLowerCase().includes(filters.emitter.toLowerCase());
            return dateMatch && numberMatch && obraMatch && vehicleMatch && emitterMatch && statusMatch;
        })
        .sort((a, b) => (b.orderNumber || 0) - (a.orderNumber || 0)); 
    }, [orders, filters]);

    const handleOpenPDF = (order) => {
        const vehicle = vehicles.find(v => v.id === order.vehicleId);
        const employee = employees.find(e => e.id === order.employeeId);
        const obra = obras.find(o => o.id === order.obraId);
        const logo = new Image();
        logo.crossOrigin = 'Anonymous';
        logo.src = 'https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png'; 
        logo.onload = () => {
             try {
                const canvas = document.createElement('canvas');
                canvas.width = logo.width; canvas.height = logo.height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(logo, 0, 0);
                generateOrderPDF(order, vehicle, employee, obra, canvas.toDataURL('image/png'));
             } catch (e) { generateOrderPDF(order, vehicle, employee, obra, null); }
        };
        logo.onerror = () => generateOrderPDF(order, vehicle, employee, obra, null);
    };

    const handleSendWhatsApp = async (order) => {
        const employee = employees.find(e => e.id === order.employeeId);
        const supplier = suppliers.find(s => s.id === order.supplierId);
        const zap = supplier?.whatsapp || supplier?.telefone;
        
        if (!zap) {
            setAlertMessage("O fornecedor selecionado não possui WhatsApp/Telefone cadastrado.");
            return;
        }

        const texto = `Olá! Segue a Ordem de Compra/Serviço *Nº ${String(order.orderNumber).padStart(6, '0')}* da MAK.\n\nVeículo/Equip: ${vehicles.find(v => v.id === order.vehicleId)?.registroInterno || 'N/A'}\nFunc. Autorizado: ${employee?.nome || 'N/A'}\n\nPor favor, envie o orçamento ou NF vinculada a este número.`;
        const linkStr = `https://api.whatsapp.com/send?phone=55${zap.replace(/\D/g, '')}&text=${encodeURIComponent(texto)}`;
        window.open(linkStr, '_blank');
    };

    const handleCancelOrder = async () => {
        if (!itemToCancel) return;
        try {
            await apiClient.cancelOrder(itemToCancel.id); 
            setAlertMessage("Ordem cancelada. Despesas estornadas.");
            reloadData(); 
        } catch (error) {
            setAlertMessage(error.message || "Falha ao cancelar a ordem.");
        } finally {
            setIsCancelModalOpen(false); setItemToCancel(null);
        }
    };

    const handleCloseOrderSubmit = async (nfNumber, finalValue) => {
        try {
            // Atualiza para 'Concluída', informando NF e Valor, que irá gerar a Despesa
            await apiClient.updateOrder(orderToClose.id, {
                ...orderToClose,
                status: 'Concluída',
                invoiceNumber: nfNumber,
                totalValue: finalValue
            });
            setAlertMessage(`Ordem fechada! Despesa gerada para a NF ${nfNumber}.`);
            reloadData();
        } catch (error) {
            setAlertMessage("Erro ao fechar ordem: " + error.message);
        } finally {
            setIsCloseModalOpen(false); setOrderToClose(null);
        }
    };

    return (
        <div className="container mx-auto space-y-6 p-4 md:p-6 lg:p-8 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                    <FileText className="text-blue-600"/> Ordens de Manutenção & Compra
                </h1>
                 <ProtectedComponent requiredPermission="editor">
                    <button onClick={() => { setEditingOrder(null); setIsModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg shadow hover:bg-yellow-500 transition w-full sm:w-auto justify-center text-sm">
                        <PlusCircle size={18} />Nova Ordem
                    </button>
                </ProtectedComponent>
            </div>

            <div className="bg-white p-4 rounded-lg shadow grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 items-center text-sm">
                 <input type="text" placeholder="Nº Ordem" value={filters.number} onChange={e => setFilters({...filters, number: e.target.value})} className="p-2 border rounded w-full bg-gray-50"/>
                 <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className="p-2 border rounded w-full bg-white">
                    <option value="">Status (Todos)</option>
                    <option value="A Cotar">A Cotar (Pendente)</option>
                    <option value="Aberta">Aberta (Em Andamento)</option>
                    <option value="Concluída">Concluída (Fechada/NF)</option>
                    <option value="Cancelada">Cancelada</option>
                 </select>
                 <select value={filters.obra} onChange={e => setFilters({...filters, obra: e.target.value})} className="p-2 border rounded w-full bg-white">
                    <option value="">Todas as Obras</option>
                    {sortedObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                 </select>
                 <select value={filters.vehicle} onChange={e => setFilters({...filters, vehicle: e.target.value})} className="p-2 border rounded w-full bg-white">
                    <option value="">Todos os Veículos</option>
                    {sortedVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno}</option>)}
                 </select>
                 <input type="date" value={filters.date} onChange={e => setFilters({...filters, date: e.target.value})} className="p-2 border rounded w-full bg-gray-50"/>
                 <input type="text" placeholder="Emissor..." value={filters.emitter} onChange={e => setFilters({...filters, emitter: e.target.value})} className="p-2 border rounded w-full bg-gray-50"/>
            </div>

            <div className="bg-white rounded-lg shadow overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[1100px]"> 
                    <thead className="bg-gray-100 text-xs uppercase text-gray-700">
                        <tr>
                            <th className="p-3">Nº Ordem</th>
                            <th className="p-3">Obra Destino</th>
                            <th className="p-3">Veículo</th>
                            <th className="p-3">Fornecedor</th>
                            <th className="p-3">Motorista</th>
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
                            const obra = obras.find(o => o.id === order.obraId);
                            const statusStyles = {
                                'Aberta': 'bg-blue-100 text-blue-800',
                                'Concluída': 'bg-green-100 text-green-800 font-bold',
                                'Cancelada': 'bg-red-100 text-red-800',
                                'A Cotar': 'bg-yellow-100 text-yellow-800 animate-pulse'
                            };
                            return (
                                <tr key={order.id} className={`hover:bg-gray-50 ${order.status === 'Cancelada' ? 'opacity-60' : ''}`}> 
                                    <td className="p-3 font-bold text-gray-900">{String(order.orderNumber || '').padStart(6, '0')}</td>
                                    <td className="p-3 font-medium">{obra?.nome || 'N/A'}</td> 
                                    <td className="p-3"><span className="px-2 py-1 bg-gray-200 rounded text-xs font-mono">{vehicle ? vehicle.registroInterno : 'N/A'}</span></td>
                                    <td className="p-3 truncate max-w-[150px]" title={order.supplier}>{order.supplier}</td>
                                    <td className="p-3">{employee?.vulgo || employee?.nome || 'N/A'}</td>
                                    <td className="p-3">{order.date ? new Date(order.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase whitespace-nowrap ${statusStyles[order.status] || 'bg-gray-100'}`}>
                                            {order.status}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right font-bold text-gray-800">
                                        {order.status === 'A Cotar' ? '-' : `R$ ${(order.totalValue || 0).toFixed(2)}`}
                                    </td>
                                    <td className="p-3">
                                        <div className="flex items-center justify-center gap-1">
                                            <button onClick={() => handleOpenPDF(order)} title="Gerar PDF" className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"><FileText size={16}/></button>
                                            
                                            <button onClick={() => handleSendWhatsApp(order)} title="Enviar ao Fornecedor" className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"><MessageCircle size={16}/></button>
                                            
                                            {order.status !== 'Concluída' && order.status !== 'Cancelada' && (
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => { setOrderToClose(order); setIsCloseModalOpen(true); }} title="Fechar Ordem / Lançar NF" className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded"><CheckCircle size={16}/></button>
                                                </ProtectedComponent>
                                            )}

                                            {order.status !== 'Cancelada' && (
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => { setEditingOrder(order); setIsModalOpen(true); }} title="Editar/Reabrir" className="p-1.5 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded"><Edit size={16}/></button>
                                                    <button onClick={() => { setItemToCancel(order); setIsCancelModalOpen(true); }} title="Cancelar" className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"><XCircle size={16}/></button>
                                                </ProtectedComponent>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                         {filteredOrders.length === 0 && (<tr><td colSpan="9" className="p-8 text-center text-gray-500 italic">Nenhuma ordem encontrada nos filtros.</td></tr>)}
                    </tbody>
                </table>
            </div>

            {/* Modais */}
            {isModalOpen && <OrderModal
                user={user} onClose={() => {setIsModalOpen(false); setEditingOrder(null);}} setAlertMessage={setAlertMessage}
                vehicles={vehicles} employees={employees} obras={obras} suppliers={suppliers}
                orderToEdit={editingOrder} generatePDF={handleOpenPDF} apiClient={apiClient} reloadData={reloadData}
            />}

            {isCloseModalOpen && orderToClose && <CloseOrderModal 
                order={orderToClose} onClose={() => setIsCloseModalOpen(false)} onSubmit={handleCloseOrderSubmit} 
            />}

            {isCancelModalOpen && itemToCancel && <PasswordConfirmationModal
                message={`Deseja CANCELAR a Ordem Nº ${String(itemToCancel.orderNumber || '').padStart(6, '0')}? Se houver despesa vinculada, ela será apagada do fluxo de caixa.`}
                onConfirm={handleCancelOrder} onClose={() => setIsCancelModalOpen(false)} apiClient={apiClient}
             />}
        </div>
    );
};

// ===================================================================================
// MODAL DE CRIAÇÃO/EDIÇÃO DE ORDEM
// ===================================================================================
const OrderModal = ({ user, onClose, setAlertMessage, vehicles, employees, obras, suppliers, orderToEdit, generatePDF, apiClient, reloadData }) => {
    const [formData, setFormData] = useState({
        supplierId: orderToEdit?.supplierId || '',
        supplierName: orderToEdit?.supplier || '',
        date: orderToEdit?.date ? new Date(orderToEdit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        employeeId: orderToEdit?.employeeId || '',
        obraId: orderToEdit?.obraId || '',
        vehicleId: orderToEdit?.vehicleId || '',
        items: (Array.isArray(orderToEdit?.items) && orderToEdit.items.length > 0 ? orderToEdit.items : [{ quantity: '1', description: '', unitPrice: '' }]),
        payment: orderToEdit?.payment || { type: 'À vista', method: '', days: '' },
        status: orderToEdit?.status || 'Aberta',
        anexos: orderToEdit?.anexos || []
    });
    
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef(null);

    const sortedVehicles = useMemo(() => [...vehicles].sort((a,b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);
    const sortedEmployees = useMemo(() => [...employees].sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [employees]);
    const sortedObras = useMemo(() => [...obras].filter(o => o.status === 'ativa').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);

    // Lógica inteligente de Sugestão de Obra
    useEffect(() => {
        if (formData.vehicleId && obras.length > 0 && !orderToEdit) {
            let suggestedObraId = null;
            obras.forEach(obra => {
                const history = obra.historicoVeiculos || [];
                if (history.some(h => h.veiculoId === formData.vehicleId && !h.dataSaida)) {
                    suggestedObraId = obra.id;
                }
            });

            if (!suggestedObraId) {
                let latestDate = 0;
                obras.forEach(obra => {
                    const history = obra.historicoVeiculos || [];
                    history.forEach(h => {
                        if (h.veiculoId === formData.vehicleId && h.dataSaida) {
                            const outDate = new Date(h.dataSaida).getTime();
                            if (outDate > latestDate) { latestDate = outDate; suggestedObraId = obra.id; }
                        }
                    });
                });
            }

            if (suggestedObraId && formData.obraId !== suggestedObraId) {
                setFormData(prev => ({ ...prev, obraId: suggestedObraId }));
                // Apenas uma dica visual leve poderia ser colocada, mas evitamos alert()
            }
        }
    }, [formData.vehicleId, obras, orderToEdit]);

    const handleSupplierChange = (e) => {
        const id = e.target.value;
        const sup = suppliers.find(s => s.id === id);
        setFormData(prev => ({ ...prev, supplierId: id, supplierName: sup ? sup.razaoSocial : '' }));
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...formData.items];
        let val = value;
        if (field === 'unitPrice' || field === 'quantity') {
             val = value.replace(',', '.');
             if (!/^\d*\.?\d*$/.test(val) && val !== '') return;
        }
        newItems[index] = { ...newItems[index], [field]: val };
        setFormData(prev => ({...prev, items: newItems}));
    };
    
    const addItem = () => setFormData(prev => ({ ...prev, items: [...prev.items, { quantity: '1', description: '', unitPrice: '' }]}));
    const removeItem = (index) => setFormData(prev => ({ ...prev, items: formData.items.filter((_, i) => i !== index) }));

    const totalValue = useMemo(() => {
        if (formData.status === 'A Cotar') return 0;
        return formData.items.reduce((total, item) => total + ((parseFloat(item.quantity)||0) * (parseFloat(item.unitPrice)||0)), 0);
    }, [formData.items, formData.status]);

    // Simulador de Anexo (Mock)
    const handleAddAttachment = () => {
        const url = prompt("Cole o link do orçamento/comprovante (Ex: Google Drive, PDF Cloud):");
        if (url) setFormData(p => ({ ...p, anexos: [...p.anexos, url] }));
    };

    const handleSave = async (e) => {
        if(e) e.preventDefault();
        
        if (!formData.supplierId || !formData.date || !formData.employeeId || !formData.obraId) {
            setAlertMessage("Preencha Fornecedor, Data, Funcionário e Obra de Destino."); return;
        }
        const hasValidItems = formData.items.some(i => i.description.trim() !== '');
        if (!hasValidItems) { setAlertMessage("Adicione ao menos um item com descrição."); return; }

        setIsSaving(true);
        const finalOrderData = {
            supplierId: formData.supplierId,
            supplier: formData.supplierName,
            date: new Date(formData.date + 'T12:00:00Z').toISOString(),
            employeeId: formData.employeeId,
            obraId: formData.obraId,
            vehicleId: formData.vehicleId || null,
            items: formData.items.map(item => ({
                 quantity: parseFloat(item.quantity) || 0,
                 description: item.description,
                 unitPrice: formData.status === 'A Cotar' ? 0 : (parseFloat(item.unitPrice) || 0)
            })),
            payment: formData.payment,
            totalValue: formData.status === 'A Cotar' ? 0 : totalValue,
            status: formData.status,
            anexos: formData.anexos,
            editedBy: orderToEdit ? { userEmail: user.email, userId: user.id } : null,
            createdBy: orderToEdit ? undefined : { userEmail: user.email, userId: user.id }
        };

        try {
            let savedOrder;
            if (orderToEdit) {
                await apiClient.updateOrder(orderToEdit.id, finalOrderData);
                setAlertMessage(`Ordem atualizada com sucesso!`);
                savedOrder = { ...orderToEdit, ...finalOrderData };
            } else {
                const res = await apiClient.createOrder(finalOrderData);
                setAlertMessage(`Ordem criada com sucesso!`);
                savedOrder = { ...finalOrderData, orderNumber: res.orderNumber };
            }

            reloadData();
            // generatePDF(savedOrder);
            onClose();
        } catch (error) {
            setAlertMessage(error.message || "Falha ao salvar a ordem.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col my-auto">
                <div className="p-4 sm:p-5 border-b sticky top-0 bg-gray-50 z-10 flex justify-between items-center rounded-t-lg">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        {orderToEdit ? <Edit size={20}/> : <PlusCircle size={20}/>}
                        {orderToEdit ? 'Editar Ordem' : 'Nova Ordem de Compra/Serviço'}
                    </h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 text-gray-500"><X size={20}/></button>
                </div>

                <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden"> 
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-sm">
                        
                        <div className="bg-blue-50 p-3 rounded border border-blue-100 flex gap-4 items-center">
                            <label className="font-bold text-blue-900 shrink-0">Status da Ordem:</label>
                            <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="p-2 border border-blue-200 rounded bg-white text-blue-900 font-bold focus:ring-2 focus:ring-blue-500">
                                <option value="A Cotar">A Cotar (Sem Valor)</option>
                                <option value="Aberta">Aberta (Autorizada)</option>
                                <option value="Concluída">Concluída (NF Entregue)</option>
                            </select>
                            {formData.status === 'Concluída' && <span className="text-xs text-blue-700 italic flex-1">Isso lançará a despesa automaticamente.</span>}
                        </div>

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block font-bold text-gray-700 text-xs uppercase mb-1">Fornecedor *</label>
                                <select value={formData.supplierId} onChange={handleSupplierChange} className="p-2 border rounded w-full bg-white" required>
                                    <option value="">Selecione na base de parceiros...</option>
                                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.razaoSocial} {s.cnpj ? `(${s.cnpj})` : ''}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block font-bold text-gray-700 text-xs uppercase mb-1">Data Emissão *</label>
                                <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="p-2 border rounded w-full bg-white" required />
                            </div>
                            <div>
                                <label className="block font-bold text-gray-700 text-xs uppercase mb-1">Veículo / Máquina (Opcional)</label>
                                <select value={formData.vehicleId} onChange={e => setFormData({...formData, vehicleId: e.target.value})} className="p-2 border rounded w-full bg-white">
                                    <option value="">Nenhum (Uso Geral)</option>
                                    {sortedVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.modelo}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block font-bold text-gray-700 text-xs uppercase mb-1">Obra p/ Custo (Automático) *</label>
                                <select value={formData.obraId} onChange={e => setFormData({...formData, obraId: e.target.value})} className="p-2 border rounded w-full bg-yellow-50 font-semibold" required>
                                    <option value="">Selecione...</option>
                                    {sortedObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                    <option value="Administração">Administração</option>
                                    <option value="Oficina">Oficina Central</option>
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block font-bold text-gray-700 text-xs uppercase mb-1">Funcionário Autorizado *</label>
                                <select value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})} className="p-2 border rounded w-full bg-white" required>
                                    <option value="">Selecione quem fará o serviço/retirada...</option>
                                    {sortedEmployees.map(e => <option key={e.id} value={e.id}>{e.nome} {e.vulgo ? `(${e.vulgo})` : ''}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Itens */}
                        <div className="border-t pt-4">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-3"><Wrench size={16}/> Itens ou Serviços</h3>
                            <div className="space-y-2">
                                {formData.items.map((item, index) => (
                                    <div key={index} className="flex flex-col md:flex-row gap-2 items-start md:items-center">
                                        <input type="text" placeholder="Qtd" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} className="p-2 border rounded w-full md:w-20 bg-white" required/>
                                        <input type="text" placeholder="Descrição da Peça ou Serviço" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} className="p-2 border rounded w-full flex-1 bg-white" required />
                                        <div className="flex w-full md:w-auto gap-2">
                                            <input type="text" placeholder="R$ Unit." value={item.unitPrice} onChange={e => handleItemChange(index, 'unitPrice', e.target.value)} className={`p-2 border rounded w-full md:w-32 ${formData.status === 'A Cotar' ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`} disabled={formData.status === 'A Cotar'} />
                                            {formData.items.length > 1 && <button type="button" onClick={() => removeItem(index)} className="text-red-500 hover:bg-red-50 p-2 rounded border border-transparent"><Trash2 size={16} /></button>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between items-center mt-3">
                                <button type="button" onClick={addItem} className="text-xs text-blue-600 font-bold hover:underline px-2 py-1">+ Add Item</button>
                                <p className={`text-right font-bold text-lg ${formData.status === 'A Cotar' ? 'text-gray-400' : 'text-gray-800'}`}>
                                    Total: {formData.status === 'A Cotar' ? 'Aguardando Valores' : `R$ ${totalValue.toFixed(2)}`}
                                </p>
                            </div>
                        </div>

                        {/* Pagamento e Anexos */}
                        <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="font-bold text-gray-800 mb-2">Condição de Pagamento</h3>
                                <div className="flex gap-4 mb-2">
                                    <label className="flex items-center gap-1 cursor-pointer"><input type="radio" value="À vista" checked={formData.payment.type === 'À vista'} onChange={e => setFormData({...formData, payment: {type: e.target.value, method:'', days: ''}})} /> À vista</label>
                                    <label className="flex items-center gap-1 cursor-pointer"><input type="radio" value="A prazo" checked={formData.payment.type === 'A prazo'} onChange={e => setFormData({...formData, payment: {type: e.target.value, method: 'Boleto', days: '30'}})} /> A prazo</label>
                                </div>
                                {formData.payment.type === 'A prazo' && (
                                    <div className="flex gap-2">
                                        <select value={formData.payment.method} onChange={e => setFormData({...formData, payment: {...formData.payment, method: e.target.value}})} className="p-2 border rounded bg-white text-xs w-full">
                                            <option value="Boleto">Boleto</option>
                                            <option value="PIX">PIX Agendado</option>
                                        </select>
                                        <input type="number" placeholder="Dias" value={formData.payment.days} onChange={e => setFormData({...formData, payment: {...formData.payment, days: e.target.value}})} className="p-2 border rounded text-xs w-20"/>
                                    </div>
                                )}
                            </div>
                            
                            <div>
                                <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-2"><Paperclip size={16}/> Orçamentos / Anexos</h3>
                                <ul className="space-y-1 mb-2">
                                    {formData.anexos.map((url, i) => (
                                        <li key={i} className="flex justify-between items-center text-xs bg-gray-50 p-1.5 rounded border">
                                            <a href={url} target="_blank" rel="noreferrer" className="text-blue-600 truncate max-w-[200px]">{url}</a>
                                            <button type="button" onClick={() => setFormData(p => ({...p, anexos: p.anexos.filter((_, idx) => idx !== i)}))} className="text-red-500"><X size={14}/></button>
                                        </li>
                                    ))}
                                    {formData.anexos.length === 0 && <li className="text-xs text-gray-400 italic">Nenhum anexo salvo.</li>}
                                </ul>
                                <button type="button" onClick={handleAddAttachment} className="text-xs flex items-center gap-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded font-semibold text-gray-700">
                                    <FileUp size={14}/> Anexar Link de Nuvem
                                </button>
                            </div>
                        </div>

                    </div> 

                    <div className="p-4 bg-gray-100 border-t flex justify-end gap-3 sticky bottom-0 z-10 rounded-b-lg">
                        <button type="button" onClick={onClose} className="px-5 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 text-sm font-bold text-gray-700">Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-5 py-2 bg-yellow-400 text-gray-900 font-bold rounded-lg shadow-md hover:bg-yellow-500 disabled:opacity-50 flex items-center gap-2 text-sm">
                             {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar Ordem'}
                        </button>
                    </div>
                </form> 
            </div>
        </div>
    );
};

// ===================================================================================
// MODAL FECHAMENTO (XML)
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
                
                // Pega <nNF> e <vNF> (Total da Nota)
                const nNfNode = xmlDoc.getElementsByTagName('nNF')[0];
                const vNfNode = xmlDoc.getElementsByTagName('vNF')[0];
                
                if (nNfNode) setNfNumber(nNfNode.textContent);
                if (vNfNode) setFinalValue(parseFloat(vNfNode.textContent));

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
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-6 border-t-4 border-blue-500">
                <h3 className="text-lg font-bold text-gray-800 mb-2">Concluir Ordem #{order.orderNumber}</h3>
                <p className="text-xs text-gray-600 mb-4">Ao concluir, a despesa financeira será efetivada no caixa da obra.</p>
                
                <div className="mb-4 bg-gray-50 border p-3 rounded border-dashed text-center">
                    <label className="cursor-pointer text-sm font-bold text-blue-600 hover:underline flex flex-col items-center gap-1">
                        <FileCode2 size={24}/> Importar XML (Opcional)
                        <input type="file" accept=".xml" className="hidden" onChange={handleXmlImport} />
                    </label>
                    {isParsing && <p className="text-xs text-gray-500 mt-2">Lendo...</p>}
                </div>

                <div className="space-y-3 mb-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase">Nº Nota Fiscal *</label>
                        <input type="text" value={nfNumber} onChange={e=>setNfNumber(e.target.value)} className="w-full p-2 border rounded bg-white text-sm" required />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase">Valor Total (R$) *</label>
                        <input type="number" step="0.01" value={finalValue} onChange={e=>setFinalValue(e.target.value)} className="w-full p-2 border rounded bg-white text-sm" required />
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded text-sm font-bold text-gray-700 hover:bg-gray-300">Cancelar</button>
                    <button onClick={() => onSubmit(nfNumber, parseFloat(finalValue))} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-700" disabled={!nfNumber || finalValue <= 0}>
                        Confirmar Fechamento
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OrdersPage;