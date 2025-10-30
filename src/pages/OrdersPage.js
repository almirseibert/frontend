import React, { useState, useMemo } from 'react';
import apiClient from '../services/apiClient'; // Importa o apiClient
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    PlusCircle,
    Edit,
    Trash2, // Ícone mantido para remover itens
    FileText,
    XCircle,
    Loader, // Adicionado Loader
    X // <-- CORREÇÃO: Ícone X adicionado
} from 'lucide-react';

import ProtectedComponent from '../components/ProtectedComponent'; // Ajuste o caminho
import { PasswordConfirmationModal } from '../App'; // Importa PasswordConfirmationModal do App.js

// ===================================================================================
// GERAÇÃO DE PDF PARA ORDEM DE COMPRA/SERVIÇO (AJUSTADO PARA DATAS DA API e props)
// ===================================================================================
const generateOrderPDF = (order, vehicle, employee, obra, logoDataUrl) => {
    // Gerado em folha A4, com conteúdo na área de um A5 (metade superior)
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
    const effectivePageHeight = 148.5; // Metade da altura de um A4
    const margin = 10;

    // Adiciona o logótipo
    if (logoDataUrl) {
        const imgWidth = 45;
        const imgHeight = 16.875; // Mantém proporção
        try {
            doc.addImage(logoDataUrl, 'PNG', margin, 10, imgWidth, imgHeight);
        } catch(e) { console.error("Erro logo PDF:", e); }
    }

    // Título e Número da Ordem
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Ordem de Compra/Serviço', pageWidth - margin, 15, { align: 'right' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nº: ${String(order.orderNumber || '0').padStart(6, '0')}`, pageWidth - margin, 22, { align: 'right' });
    // Ajustado para usar new Date() e verificar se a data existe
    doc.text(`Data: ${order.date ? new Date(order.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}`, pageWidth - margin, 29, { align: 'right' });

    // Linha divisória
    doc.setLineWidth(0.5);
    doc.line(margin, 38, pageWidth - margin, 38);

    // Informações
    const infoStartY = 45;
    const midX = (pageWidth / 2) + 5; // Ponto médio para segunda coluna
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Fornecedor:', margin, infoStartY);
    doc.text('Obra de Destino:', midX, infoStartY);
    doc.setFont('helvetica', 'normal');
    doc.text(order.supplier || 'N/A', margin + 25, infoStartY); // Ajusta posição do valor
    doc.text(obra?.nome || order.obraId || 'Não especificada', midX + 30, infoStartY); // Ajusta posição do valor

    doc.setFont('helvetica', 'bold');
    doc.text('Funcionário Autorizado:', margin, infoStartY + 7);
    doc.setFont('helvetica', 'normal');
    doc.text(employee?.nome || 'Não especificado', margin + 40, infoStartY + 7); // Ajusta posição do valor

    if (vehicle) {
        doc.setFont('helvetica', 'bold');
        doc.text('Veículo Vinculado:', midX, infoStartY + 7);
        doc.setFont('helvetica', 'normal');
        doc.text(`${vehicle.registroInterno || 'N/A'} - ${vehicle.placa || 'N/A'}`, midX + 35, infoStartY + 7); // Ajusta posição do valor
    }

    // Tabela de Itens
    const tableBody = (order.items || []).map(item => [
        item.quantity || 0,
        item.description || '',
        // Verifica status e valor antes de formatar
        order.status !== 'Pendente de Valor' ? `R$ ${(item.unitPrice || 0).toFixed(2)}` : 'A cotar',
        order.status !== 'Pendente de Valor' ? `R$ ${((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}` : 'A cotar'
    ]);

    let finalY = infoStartY + 15; // Posição inicial da tabela

    autoTable(doc, {
        startY: finalY,
        head: [['Qtd.', 'Descrição do Item/Serviço', 'Vlr. Unit.', 'Vlr. Total']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [24, 49, 83], fontSize: 9 },
        styles: { fontSize: 8 },
        didDrawPage: (data) => {
             // Atualiza finalY após desenhar a tabela
            finalY = data.cursor.y;

            if (order.status !== 'Pendente de Valor') {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.text('Total Geral:', data.settings.margin.left, finalY + 8);
                // Usa totalValue calculado pela API/DB se disponível, senão recalcula
                const displayTotal = order.totalValue != null ? order.totalValue : (order.items || []).reduce((sum, i) => sum + ((i.quantity || 0) * (i.unitPrice || 0)), 0);
                doc.text(`R$ ${(displayTotal || 0).toFixed(2)}`, pageWidth - margin, finalY + 8, { align: 'right' });
                finalY += 8; // Adiciona espaço após o total
            }
        }
    });

     // Garante que finalY seja atualizado mesmo se didDrawPage não for chamado (tabela vazia)
     if (doc.lastAutoTable && doc.lastAutoTable.finalY) {
        finalY = doc.lastAutoTable.finalY > finalY ? doc.lastAutoTable.finalY : finalY;
     }
     finalY += 10; // Adiciona margem após a tabela


    // Condições de Pagamento
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Condição de Pagamento:', margin, finalY);
    doc.setFont('helvetica', 'normal');
    let paymentText = order.payment?.type || 'N/A';
    if (order.payment?.type === 'A prazo') {
        paymentText += ` - ${order.payment.method || ''}`;
        if (order.payment.method === 'Boleto') {
            paymentText += ` (${order.payment.days || ''} dias)`;
        }
    }
    doc.text(paymentText, margin + 40, finalY);
    finalY += 7; // Adiciona espaço

    // Mensagem Obrigatória no Rodapé (posicionada no final da área A5)
    const footerStartY = Math.max(finalY, effectivePageHeight - 25); // Garante que não sobreponha
    doc.setLineWidth(0.2);
    doc.line(margin, footerStartY, pageWidth - margin, footerStartY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Esta ordem de compra deve gerar uma nota fiscal para faturamento.', margin, footerStartY + 5);
    doc.text('Somente os itens acima descriminados estão liberados para compra, itens adicionais não serão faturados.', margin, footerStartY + 9);
    doc.setFont('helvetica', 'italic');
    doc.text(`Ordem emitida por: ${order.createdBy?.userEmail || 'N/A'}`, margin, footerStartY + 15);

    // Linha pontilhada para indicar o corte
    doc.setLineDashPattern([1, 1], 0);
    doc.setDrawColor(180, 180, 180);
    doc.line(0, effectivePageHeight, pageWidth, effectivePageHeight);

    doc.output('dataurlnewwindow');
};

// --- Componente Principal (Usa props e apiClient) ---
const OrdersPage = ({
    user, setAlertMessage,
    vehicles = [], employees = [], obras = [], // Dados via props
    PasswordConfirmationModal, apiClient, reloadData,
    orders = [] // Ordens via props
}) => {
    // Estados da UI (sem mudanças)
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [itemToCancel, setItemToCancel] = useState(null);
    const [filters, setFilters] = useState({ obra: '', vehicle: '', emitter: '', date: '', number: '' });
    const [loadingCancel, setLoadingCancel] = useState(false); // Adicionado estado de loading para cancelamento

    // Memos para ordenação e filtro (usa props, datas da API)
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
        .sort((a, b) => (b.orderNumber || 0) - (a.orderNumber || 0)); // Garante ordenação decrescente por número
    }, [orders, filters]);

    // Abrir PDF (usa dados das props)
    const handleOpenPDF = (order) => {
        const vehicle = vehicles.find(v => v.id === order.vehicleId);
        const employee = employees.find(e => e.id === order.employeeId);
        const obra = obras.find(o => o.id === order.obraId);

        // Lógica do Logo (sem mudanças)
        const logo = new Image();
        logo.crossOrigin = 'Anonymous';
        logo.src = 'https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png'; // Use HTTPS
        logo.onload = () => {
             try {
                const canvas = document.createElement('canvas');
                canvas.width = logo.width; canvas.height = logo.height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(logo, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                generateOrderPDF(order, vehicle, employee, obra, dataUrl);
             } catch (e) { console.error("Erro logo PDF:", e); generateOrderPDF(order, vehicle, employee, obra, null); }
        };
        logo.onerror = (e) => { console.error("Erro logo:", e); generateOrderPDF(order, vehicle, employee, obra, null); }
    };

    // Abrir Modais (sem mudanças)
    const openEditModal = (order) => { setEditingOrder(order); setIsModalOpen(true); };
    const openCancelModal = (order) => { setItemToCancel(order); setIsCancelModalOpen(true); };

    // Cancelar Ordem (usa apiClient)
    const handleCancelOrder = async () => {
        if (!itemToCancel) return;
        setLoadingCancel(true); // Inicia loading
        try {
            await apiClient.cancelOrder(itemToCancel.id); // Chama a API para cancelar
            setAlertMessage("Ordem cancelada com sucesso.");
            reloadData(); // Recarrega dados
        } catch (error) {
            console.error("Erro ao cancelar ordem:", error);
            setAlertMessage(error.message || "Falha ao cancelar a ordem.");
        } finally {
            setIsCancelModalOpen(false);
            setItemToCancel(null);
            setLoadingCancel(false); // Finaliza loading
        }
    };

    // Renderização Principal
    return (
        <div className="container mx-auto space-y-6 p-4 md:p-6 lg:p-8">
            {/* Cabeçalho */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Ordens de Compra/Serviço</h1>
                 <ProtectedComponent requiredPermission="editor">
                    <button onClick={() => { setEditingOrder(null); setIsModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg shadow hover:bg-yellow-500 transition w-full sm:w-auto justify-center text-sm">
                        <PlusCircle size={18} />Nova Ordem
                    </button>
                </ProtectedComponent>
            </div>

            {/* Filtros */}
            <div className="bg-white p-4 rounded-lg shadow grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-center text-sm">
                 <input type="text" placeholder="Nº Ordem" value={filters.number} onChange={e => setFilters({...filters, number: e.target.value})} className="p-2 border rounded-lg w-full bg-gray-50"/>
                 <input type="date" value={filters.date} onChange={e => setFilters({...filters, date: e.target.value})} className="p-2 border rounded-lg w-full bg-gray-50"/>
                 <select value={filters.obra} onChange={e => setFilters({...filters, obra: e.target.value})} className="p-2 border rounded-lg w-full bg-white">
                    <option value="">Todas as Obras</option>
                    {sortedObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    <option value="Administração">Administração</option>
                    <option value="Oficina">Oficina</option>
                 </select>
                 <select value={filters.vehicle} onChange={e => setFilters({...filters, vehicle: e.target.value})} className="p-2 border rounded-lg w-full bg-white">
                    <option value="">Todos os Veículos</option>
                    {sortedVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa}</option>)}
                 </select>
                 <input type="text" placeholder="Emissor (email)" value={filters.emitter} onChange={e => setFilters({...filters, emitter: e.target.value})} className="p-2 border rounded-lg w-full bg-gray-50"/>
            </div>

            {/* Tabela de Ordens */}
            <div className="bg-white rounded-lg shadow overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[1000px]"> {/* min-w para forçar scroll horizontal se necessário */}
                    <thead className="bg-gray-100 text-xs uppercase text-gray-700">
                        <tr>
                            <th className="p-3">Nº Ordem</th>
                            <th className="p-3">Obra/Local</th>
                            <th className="p-3">Veículo</th>
                            <th className="p-3">Fornecedor</th>
                            <th className="p-3">Funcionário</th>
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
                            const obra = obras.find(o => o.id === order.obraId);
                            const statusStyles = {
                                'Ativa': 'bg-green-100 text-green-800',
                                'Cancelada': 'bg-red-100 text-red-800',
                                'Pendente de Valor': 'bg-yellow-100 text-yellow-800 animate-pulse'
                            };
                            return (
                                <tr key={order.id} className="border-b hover:bg-gray-50 align-top"> {/* align-top para melhor leitura */}
                                    <td className="p-3 font-bold">{String(order.orderNumber || '').padStart(6, '0')}</td>
                                    <td className="p-3">{obra?.nome || order.obraId || 'N/A'}</td> {/* Mostra ID se obra não encontrada */}
                                    <td className="p-3">{vehicle ? `${vehicle.registroInterno}` : 'N/A'}</td>
                                    <td className="p-3">{order.supplier}</td>
                                    <td className="p-3">{employee?.nome || 'N/A'}</td>
                                    <td className="p-3 whitespace-nowrap">{order.date ? new Date(order.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${statusStyles[order.status] || 'bg-gray-100 text-gray-800'}`}>
                                            {order.status}
                                        </span>
                                    </td>
                                     <td className="p-3 text-right font-medium">
                                        {order.status === 'Pendente de Valor' ? 'A Cotar' : `R$ ${(order.totalValue || 0).toFixed(2)}`}
                                    </td>
                                    <td className="p-3">
                                        <div className="flex items-center gap-1 flex-nowrap"> {/* flex-nowrap para evitar quebra de linha */}
                                            <button onClick={() => handleOpenPDF(order)} title="Visualizar PDF" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-md"><FileText size={14}/></button>
                                            {order.status !== 'Cancelada' && (
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => openEditModal(order)} title="Editar Ordem" className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-md"><Edit size={14}/></button>
                                                    <button onClick={() => openCancelModal(order)} title="Cancelar Ordem" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-md"><XCircle size={14}/></button>
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

            {/* Modais */}
            {isModalOpen && <OrderModal
                user={user}
                onClose={() => {setIsModalOpen(false); setEditingOrder(null);}}
                setAlertMessage={setAlertMessage}
                vehicles={vehicles}
                employees={employees}
                obras={obras}
                orderToEdit={editingOrder}
                generatePDF={handleOpenPDF} // Passa a função para gerar PDF
                apiClient={apiClient}
                reloadData={reloadData}
            />}
            {/* Modal de Cancelamento usa PasswordConfirmationModal */}
            {isCancelModalOpen && itemToCancel && <PasswordConfirmationModal
                message={`Confirme sua senha para CANCELAR a ordem Nº ${String(itemToCancel.orderNumber || '').padStart(6, '0')}.`}
                onConfirm={handleCancelOrder}
                onClose={() => setIsCancelModalOpen(false)}
                apiClient={apiClient} // Passa apiClient
             />}
        </div>
    );
};


// ===================================================================================
// MODAL DE CRIAÇÃO/EDIÇÃO DE ORDEM (CORRIGIDO)
// ===================================================================================
const OrderModal = ({ user, onClose, setAlertMessage, vehicles = [], employees = [], obras = [], orderToEdit, generatePDF, apiClient, reloadData }) => {
    // Estado inicial
    const [formData, setFormData] = useState({
        supplier: orderToEdit?.supplier || '',
        date: orderToEdit?.date ? new Date(orderToEdit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        employeeId: orderToEdit?.employeeId || '',
        obraId: orderToEdit?.obraId || '',
        vehicleId: orderToEdit?.vehicleId || '',
        items: (Array.isArray(orderToEdit?.items) ? orderToEdit.items : []).map(item => ({
            quantity: item.quantity?.toString() || '1',
            description: item.description || '',
            unitPrice: item.unitPrice?.toString() || ''
        })) || [{ quantity: '1', description: '', unitPrice: '' }],
        payment: orderToEdit?.payment || { type: 'À vista', method: '', days: '' }
    });
    const [isPricePending, setIsPricePending] = useState(orderToEdit ? orderToEdit.status === 'Pendente de Valor' : true);
    const [isSaving, setIsSaving] = useState(false);

    // Memos para ordenação
    const sortedVehicles = useMemo(() => [...vehicles].sort((a,b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);
    const sortedEmployees = useMemo(() => [...employees].sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [employees]);
    const sortedObras = useMemo(() => [...obras].filter(o => o.status === 'ativa').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);

    // Funções para itens
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

    // Cálculo do total
    const totalValue = useMemo(() => {
        if (isPricePending) return 0;
        return formData.items.reduce((total, item) => {
            const quantity = parseFloat(item.quantity) || 0;
            const price = parseFloat(item.unitPrice) || 0;
            return total + (quantity * price);
        }, 0);
    }, [formData.items, isPricePending]);

    // Salvar (usa apiClient)
    const handleSave = async (e) => {
        if(e) e.preventDefault();
        // Validações
        const itemsValid = formData.items.length > 0 && formData.items.every(i => (parseFloat(i.quantity) || 0) > 0 && i.description);
        const pricesValid = isPricePending || formData.items.every(i => (parseFloat(i.unitPrice) || 0) > 0);
        const paymentValid = formData.payment.type !== 'A prazo' || (formData.payment.method && (formData.payment.method !== 'Boleto' || formData.payment.days));

        if (!formData.supplier || !formData.date || !formData.employeeId || !formData.obraId || !itemsValid || !pricesValid || !paymentValid) {
            let errorMsg = "Preencha: Fornecedor, Data, Funcionário, Obra, Itens (Qtd*, Desc*)";
            if (!isPricePending) errorMsg += ", Vlr. Unit.* (>0)";
            errorMsg += ", Pagamento.";
             if (!paymentValid && formData.payment.type === 'A prazo') errorMsg += " Detalhes do pagamento a prazo.";
            setAlertMessage(errorMsg);
            return;
        }
        if (formData.items.some(i => (parseFloat(i.quantity) || 0) <= 0)) {
            setAlertMessage("A quantidade dos itens deve ser maior que zero.");
            return;
        }

        setIsSaving(true);
        const finalOrderData = {
            supplier: formData.supplier,
            date: new Date(formData.date + 'T12:00:00Z').toISOString(), // ISO UTC
            employeeId: formData.employeeId,
            obraId: formData.obraId,
            vehicleId: formData.vehicleId || null,
            items: formData.items.map(item => ({
                 quantity: parseFloat(item.quantity) || 0,
                 description: item.description,
                 unitPrice: isPricePending ? 0 : (parseFloat(item.unitPrice) || 0)
            })),
            payment: formData.payment,
            totalValue: isPricePending ? 0 : totalValue,
            status: isPricePending ? 'Pendente de Valor' : 'Ativa',
        };

        try {
            let savedOrderData;
            if (orderToEdit) {
                savedOrderData = await apiClient.updateOrder(orderToEdit.id, finalOrderData);
                setAlertMessage(`Ordem ${savedOrderData.orderNumber || ''} atualizada!`);
            } else {
                savedOrderData = await apiClient.createOrder(finalOrderData);
                setAlertMessage(`Ordem ${savedOrderData.orderNumber || ''} criada!`);
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

    // CORREÇÃO: A tag <form> deve envolver o rodapé
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col my-auto">
                {/* Cabeçalho */}
                <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                    <h2 className="text-xl sm:text-2xl font-bold">{orderToEdit ? 'Editar' : 'Nova'} Ordem de Compra/Serviço</h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                </div>

                {/* Formulário (envolve conteúdo e rodapé) */}
                <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden"> {/* Form começa aqui */}
                    
                    {/* Conteúdo Rolável */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-sm">
                        {/* Campos Principais */}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block font-medium text-gray-700">Fornecedor *</label>
                                <input type="text" placeholder="Nome do Fornecedor" value={formData.supplier} onChange={e => setFormData({...formData, supplier: e.target.value})} className="mt-1 p-2 border rounded w-full bg-white" required />
                            </div>
                            <div>
                                <label className="block font-medium text-gray-700">Data *</label>
                                <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="mt-1 p-2 border rounded w-full bg-white" required />
                            </div>
                            <div>
                                <label className="block font-medium text-gray-700">Funcionário Autorizado *</label>
                                <select value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})} className="mt-1 p-2 border rounded w-full bg-white" required>
                                    <option value="">Selecione...</option>
                                    {sortedEmployees.map(e => <option key={e.id} value={e.id}>{e.nome} {e.vulgo ? `(${e.vulgo})` : ''}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block font-medium text-gray-700">Obra de Destino *</label>
                                <select value={formData.obraId} onChange={e => setFormData({...formData, obraId: e.target.value})} className="mt-1 p-2 border rounded w-full bg-white" required>
                                    <option value="">Selecione...</option>
                                    {sortedObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                    <option value="Administração">Administração</option>
                                    <option value="Oficina">Oficina</option>
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block font-medium text-gray-700">Vincular Veículo (Opcional)</label>
                                <select value={formData.vehicleId} onChange={e => setFormData({...formData, vehicleId: e.target.value})} className="mt-1 p-2 border rounded w-full bg-white">
                                    <option value="">Nenhum</option>
                                    {sortedVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Itens */}
                        <div className="border-t pt-4 mt-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-2">
                                <h3 className="font-semibold text-lg text-gray-800">Itens / Serviços *</h3>
                                <label className="flex items-center gap-2 text-xs sm:text-sm font-medium cursor-pointer shrink-0">
                                    <input type="checkbox" checked={isPricePending} onChange={() => setIsPricePending(!isPricePending)} className="h-4 w-4 rounded text-yellow-600 focus:ring-yellow-500 border-gray-300"/>
                                    Lançar sem valor (a cotar)
                                </label>
                            </div>
                            <div className="space-y-2">
                                {formData.items.map((item, index) => (
                                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                                        <div className="col-span-4 sm:col-span-2">
                                            <label className="text-[11px] font-medium text-gray-600 block mb-0.5">Qtd*</label>
                                            <input type="text" inputMode="decimal" placeholder="Qtd" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} className="p-1.5 border rounded w-full text-sm bg-white" required/>
                                        </div>
                                        <div className="col-span-8 sm:col-span-6">
                                             <label className="text-[11px] font-medium text-gray-600 block mb-0.5">Descrição*</label>
                                            <input type="text" placeholder="Descrição" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} className="p-1.5 border rounded w-full text-sm bg-white" required />
                                        </div>
                                        <div className="col-span-9 sm:col-span-3">
                                             <label className="text-[11px] font-medium text-gray-600 block mb-0.5">Vlr. Unit.*</label>
                                            <input type="text" inputMode="decimal" step="0.01" placeholder="Vlr. Unit." value={item.unitPrice} onChange={e => handleItemChange(index, 'unitPrice', e.target.value)} className={`p-1.5 border rounded w-full text-sm ${isPricePending ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`} required={!isPricePending} disabled={isPricePending} />
                                        </div>
                                        <div className="col-span-3 sm:col-span-1 flex items-end justify-center h-full">
                                            {formData.items.length > 1 && <button type="button" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 p-1 mt-1"><Trash2 size={14} /></button>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button type="button" onClick={addItem} className="text-xs text-yellow-600 font-semibold hover:underline mt-2">+ Adicionar Item</button>
                            <p className={`text-right font-bold text-lg mt-3 ${isPricePending ? 'text-gray-500' : 'text-gray-800'}`}>
                                Total: {isPricePending ? 'Aguardando Cotação' : `R$ ${totalValue.toFixed(2)}`}
                            </p>
                            {!isPricePending && totalValue <= 0 && formData.items.length > 0 && formData.items.some(i => i.description || i.quantity) && (
                                 <p className="text-right text-xs text-red-500">Valor unitário deve ser maior que zero.</p>
                             )}
                              {formData.items.length === 0 && (
                                 <p className="text-left text-xs text-red-500 mt-1">Adicione pelo menos um item.</p>
                             )}
                             {formData.items.some(i => (parseFloat(i.quantity) || 0) <= 0 && i.description) && (
                                 <p className="text-left text-xs text-red-500 mt-1">Quantidade deve ser maior que zero.</p>
                             )}
                        </div>

                        {/* Pagamento */}
                        <div className="border-t pt-4 mt-4">
                            <h3 className="font-semibold text-lg mb-2 text-gray-800">Condição de Pagamento *</h3>
                            <div className="flex flex-wrap gap-x-6 gap-y-2 items-center mb-2">
                                <label className="inline-flex items-center cursor-pointer"><input type="radio" name="paymentType" value="À vista" checked={formData.payment.type === 'À vista'} onChange={e => setFormData({...formData, payment: {type: e.target.value, method:'', days: ''}})} className="h-4 w-4 text-yellow-600"/> <span className="ml-2 text-sm">À vista</span></label>
                                <label className="inline-flex items-center cursor-pointer"><input type="radio" name="paymentType" value="A prazo" checked={formData.payment.type === 'A prazo'} onChange={e => setFormData({...formData, payment: {type: e.target.value, method: formData.payment.method || 'PIX', days: formData.payment.days || ''}})} className="h-4 w-4 text-yellow-600"/> <span className="ml-2 text-sm">A prazo</span></label>
                            </div>
                            {formData.payment.type === 'A prazo' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                                    <div className="w-full">
                                        <label className="text-xs font-medium text-gray-600 block mb-1">Método*</label>
                                        <select value={formData.payment.method} onChange={e => setFormData({...formData, payment: {...formData.payment, method: e.target.value}})} className="p-2 border rounded bg-white text-sm w-full" required={formData.payment.type === 'A prazo'}>
                                            <option value="">Selecione...</option>
                                            <option value="PIX">PIX</option>
                                            <option value="Boleto">Boleto</option>
                                        </select>
                                    </div>
                                    {formData.payment.method === 'Boleto' && (
                                        <div className="w-full">
                                            <label className="text-xs font-medium text-gray-600 block mb-1">Dias Venc.*</label>
                                            <input type="number" placeholder="Dias" value={formData.payment.days} onChange={e => setFormData({...formData, payment: {...formData.payment, days: e.target.value}})} className="p-2 border rounded text-sm bg-white w-full" min="1" required={formData.payment.method === 'Boleto'}/>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div> {/* Fim do div de scroll */}

                    {/* Rodapé Fixo */}
                    <div className="p-4 bg-gray-50 border-t flex flex-col sm:flex-row justify-end gap-2 sticky bottom-0 z-10">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium w-full sm:w-auto" disabled={isSaving}>Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm w-full sm:w-auto">
                             {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar e Gerar PDF'}
                        </button>
                    </div>
                </form> {/* Fim do form */}
            </div>
        </div>
    );
};


export default OrdersPage;

