// utils/orderPdf.js
//
// Geração do PDF da Ordem de Compra/Serviço e helpers de nome de arquivo.
//
// Extraído de pages/OrdersPage.js (movimento puro, sem mudança de
// comportamento) para que outras telas — a de Relatos de Ocorrência, que gera
// ordens a partir da ficha FRM-MAN-001 — possam baixar o PDF de uma ordem sem
// importar a página inteira.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatObraNome } from './obraFormat';
import { resolveOrderPartnerName } from './partners';

// createdBy/editedBy vêm do banco como JSON (objeto já parseado ou string).
export const getCreatorEmail = (order) => {
    if (!order || !order.createdBy) return 'N/A';
    if (typeof order.createdBy === 'object') return order.createdBy.userEmail || 'N/A';
    try { const p = JSON.parse(order.createdBy); return p.userEmail || 'N/A'; } catch (e) { return order.createdBy; }
};

export const getEditorEmail = (order) => {
    if (!order || !order.editedBy) return 'N/A';
    if (typeof order.editedBy === 'object') return order.editedBy.userEmail || 'N/A';
    try { const p = JSON.parse(order.editedBy); return p.userEmail || 'N/A'; } catch (e) { return order.editedBy; }
};

// Remove os caracteres que o Windows não aceita em nome de arquivo.
export const sanitizeFileName = (raw) => raw.replace(/[\\/:*?"<>|]/g, '-').trim();

// Carrega a logo da MAK como dataURL PNG para embutir no PDF.
// Resolve null em caso de falha ou timeout de 3s (o PDF é gerado sem a logo).
export const loadLogoDataUrl = () => new Promise((resolve) => {
    let done = false;
    const finish = (val) => { if (!done) { done = true; resolve(val); } };
    const logo = new Image();
    logo.crossOrigin = 'Anonymous';
    logo.src = 'https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png';
    logo.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = logo.width; canvas.height = logo.height;
            canvas.getContext('2d').drawImage(logo, 0, 0);
            finish(canvas.toDataURL('image/png'));
        } catch (e) { finish(null); }
    };
    logo.onerror = () => finish(null);
    setTimeout(() => finish(null), 3000);
});

// Nome do arquivo salvo localmente:
// "Ordem de Compra e Servico <numero6> <YYYY-MM-DD>[ RE-<registroInterno>].pdf"
export const buildOrderFileName = (order, vehicle) => {
    const num = order.orderNumber ? String(order.orderNumber).padStart(6, '0') : '000000';
    const dateStr = order.date
        ? new Date(order.date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
    const ri = vehicle?.registroInterno ? ` RE-${vehicle.registroInterno}` : '';
    return `${sanitizeFileName(`Ordem de Compra e Servico ${num} ${dateStr}${ri}`)}.pdf`;
};

// ===================================================================================
// GERAÇÃO DE PDF PARA ORDEM DE COMPRA/SERVIÇO
// ===================================================================================
// Modos: returnBlob=true → devolve Blob; downloadName informado → baixa no PC;
// caso contrário abre no navegador (comportamento de preview).
export const generateOrderPDF = (order, vehicle, employee, operator, obra, logoDataUrl, returnBlob = false, downloadName = null, partnersList = []) => {
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
    doc.text(resolveOrderPartnerName(partnersList.find(p => p.id === order.supplierId), order.supplier), margin + 25, infoStartY);
    doc.text(formatObraNome(obra) || order.obraId || 'Não especificada', midX + 30, infoStartY);

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
        if (order.kmHrAtual != null && order.kmHrAtual !== '') {
            doc.setFont('helvetica', 'bold');
            doc.text(`${order.kmHrUnit || 'Km/Hr'} Atual:`, midX, infoStartY + 12);
            doc.setFont('helvetica', 'normal');
            doc.text(`${Number(order.kmHrAtual).toLocaleString('pt-BR')} ${order.kmHrUnit || ''}`, midX + 35, infoStartY + 12);
        }
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

    if (order.observacoes && String(order.observacoes).trim() !== '') {
        doc.setFont('helvetica', 'bold');
        doc.text('Observações:', margin, finalY);
        doc.setFont('helvetica', 'normal');
        const obsLines = doc.splitTextToSize(String(order.observacoes).trim(), pageWidth - (margin * 2) - 25);
        doc.text(obsLines, margin + 25, finalY);
        finalY += (obsLines.length * 4.5) + 2;
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

    // Retorna blob (upload/anexo), baixa no PC (downloadName) ou abre no navegador.
    if (returnBlob) {
        return doc.output('blob');
    }
    if (downloadName) {
        doc.save(downloadName);
        return;
    }
    doc.output('dataurlnewwindow');
};
