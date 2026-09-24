// utils/refuelingAuthPdf.js
//
// PDF de "Autorização de Abastecimento" (meia folha A4 com linha de corte).
//
// Existiam TRÊS cópias deste gerador — RefuelingPage, AdminSolicitacoesPage e
// ComboioPage — que já tinham divergido (a do comboio não marcava terceirizado,
// a de solicitações lia a leitura em outra ordem). Agora há uma só, com
// variantes:
//   - 'abastecimento'   ordem ao posto para um veículo da frota
//   - 'entrada_comboio' ordem ao posto para encher o tanque de um comboio
//   - 'saida_comboio'   comprovante de diesel distribuído pelo comboio
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadLogoDataUrl, sanitizeFileName } from './orderPdf';
import { resolveOrderPartnerName, getVehicleTerceiroName } from './partners';
import { terceirizadoPdfMark } from '../components/ui/TerceirizadoBadge';
import { fuelLabel, comboioTankLabel } from './fuelTypes';

import { fmtBRL } from './currency';
const TZ = 'America/Sao_Paulo';

const isValidDbDate = (value) => {
    if (!value) return false;
    const str = String(value);
    return str.length > 5 && !str.startsWith('0000') && str !== '1970-01-01T00:00:00.000Z';
};

// Coluna DATE ('YYYY-MM-DD') é dia de calendário e não pode passar pelo fuso;
// DATETIME é instante e é exibido em Brasília. A versão antiga usava getUTC* para
// tudo, o que imprimia o dia seguinte em ordens emitidas depois das 21h.
const toDate = (value) => {
    if (value && typeof value.toDate === 'function') return value.toDate();
    let s = String(value);
    if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T');
    return new Date(s);
};

export const formatPdfDate = (value) => {
    if (!isValidDbDate(value)) return 'N/A';
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-');
        return `${d}/${m}/${y}`;
    }
    const date = toDate(value);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('pt-BR', { timeZone: TZ });
};

const fileDate = (value) => {
    if (!isValidDbDate(value)) return 'DATA';
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const date = toDate(value);
    return isNaN(date.getTime()) ? 'DATA' : date.toLocaleDateString('en-CA', { timeZone: TZ });
};

const issuerOf = (order) => {
    let cb = order.createdBy;
    if (typeof cb === 'string') {
        try { cb = JSON.parse(cb); } catch { return cb || 'N/A'; }
    }
    if (cb && typeof cb === 'object') {
        return cb.nome || cb.name || cb.userEmail || cb.email || 'Usuário do Sistema';
    }
    return 'N/A';
};

// Leitura que vai no PDF: a do tipo do veículo quando a ordem traz as duas.
const LEVES_E_TRECHO = ['Automóvel', 'Camionete', 'Utilitários', 'Moto', 'Caminhão Prancha', 'Semirreboques'];
const leituraDaOrdem = (order, vehicle) => {
    const odo = parseFloat(order.odometro);
    const hori = parseFloat(order.horimetro);
    if (odo > 0 && hori > 0) {
        return vehicle && LEVES_E_TRECHO.includes(vehicle.tipo)
            ? ['Odômetro', `${odo} Km`]
            : ['Horímetro', `${hori} h`];
    }
    if (odo > 0) return ['Odômetro', `${odo} Km`];
    if (hori > 0) return ['Horímetro', `${hori} h`];
    return ['Leitura', 'N/A'];
};

const litros = (n) => `${(parseFloat(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L`;

const buildBody = (order, variant, { vehicles, partners, employees }) => {
    const find = (list, id) => (list || []).find(x => x.id === id);
    const employee = find(employees, order.employeeId);
    const partner = find(partners, order.partnerId);
    const emissao = formatPdfDate(order.data || order.date);

    if (variant === 'saida_comboio') {
        const comboio = find(vehicles, order.comboioVehicleId);
        const vehicle = find(vehicles, order.receivingVehicleId || order.vehicleId);
        const [leituraLabel, leituraValor] = leituraDaOrdem(order, vehicle);
        const body = [
            ['Data', emissao],
            ['Comboio (origem)', comboio ? `${comboio.registroInterno} - ${comboio.placa || ''}`.trim() : (order.partnerName || 'Comboio Interno')],
            ['Veículo Abastecido', `${vehicle?.registroInterno || order.receivingVehicleName || 'N/A'} - ${vehicle?.placa || 'N/A'}${terceirizadoPdfMark(vehicle)}`],
            ['Modelo', `${vehicle?.marca || ''} ${vehicle?.modelo || ''}`.trim() || 'N/A'],
            ['Operador/Motorista', employee?.nome || 'Não especificado'],
            [leituraLabel, leituraValor],
            ['Obra', order.obraName || 'Não informada'],
            ['Combustível', comboioTankLabel(order.fuelType) || 'N/A'],
            ['Litros Abastecidos', litros(order.liters ?? order.litrosAbastecidos)],
        ];
        if (order.status && order.status !== 'Concluída') {
            body.push(['Situação', `BLOQUEADA — ${order.motivoBloqueio || 'aguardando liberação do administrador'}`]);
        }
        body.push(['Registrado por', order.responsibleUserEmail || issuerOf(order)]);
        return { title: 'Comprovante de Distribuição', body, vehicle };
    }

    const vehicle = find(vehicles, order.vehicleId);

    if (variant === 'entrada_comboio') {
        const body = [
            ['Data de Emissão', emissao],
            ['Funcionário Autorizado', employee?.nome || 'Não especificado'],
            ['Comboio Autorizado', `${vehicle?.registroInterno || 'N/A'} - ${vehicle?.placa || 'N/A'}`],
            ['Modelo', `${vehicle?.marca || ''} ${vehicle?.modelo || ''}`.trim() || 'N/A'],
            ['Destino', 'Tanque de estoque do comboio'],
            ['Posto Autorizado', resolveOrderPartnerName(partner, order.partnerName)],
            ['Combustível Autorizado', fuelLabel(order.fuelType) || 'N/A'],
            ['Litros Liberados', order.isFillUp ? 'Completar Tanque' : litros(order.litrosLiberados)],
        ];
        if (order.status === 'Concluída' && parseFloat(order.litrosAbastecidos) > 0) {
            body.push(['Litros Abastecidos', litros(order.litrosAbastecidos)]);
        }
        if (order.invoiceNumber) body.push(['Nota Fiscal (NF)', order.invoiceNumber]);
        if (order.outros) body.push(['Observação', order.outros]);
        body.push(['Emitido por', issuerOf(order)]);
        return { title: 'Autorização de Abastecimento', subtitle: 'Entrada de Comboio', body, vehicle };
    }

    const [leituraLabel, leituraValor] = leituraDaOrdem(order, vehicle);
    const body = [
        ['Data de Emissão', emissao],
        ['Funcionário Autorizado', employee?.nome || 'Não especificado'],
        ['Veículo Autorizado', `${vehicle?.registroInterno || 'N/A'} - ${vehicle?.placa || 'N/A'}${terceirizadoPdfMark(vehicle)}`],
    ];
    if (vehicle?.isOutsourced) {
        body.push(['Terceiro (Locador)', getVehicleTerceiroName(vehicle, partners) || 'Sem fornecedor vinculado']);
    }
    body.push(
        ['Modelo', `${vehicle?.marca || ''} ${vehicle?.modelo || ''}`.trim() || 'N/A'],
        [leituraLabel, leituraValor],
        ['Posto Autorizado', resolveOrderPartnerName(partner, order.partnerName)],
        ['Combustível Autorizado', fuelLabel(order.fuelType) || 'N/A'],
        ['Litros Liberados', order.isFillUp ? 'Completar Tanque' : litros(order.litrosLiberados)],
    );
    if (order.needsArla) {
        body.push(['Arla 32 Autorizado', order.isFillUpArla ? 'Completar Tanque' : litros(order.litrosLiberadosArla)]);
    }
    if (order.outros) {
        body.push(['Outros Itens/Observação', `${order.outros} ${order.outrosValor ? `(${fmtBRL(parseFloat(order.outrosValor || 0))})` : ''}`]);
    }
    body.push(['Emitido por', issuerOf(order)]);
    return { title: 'Autorização de Abastecimento', body, vehicle };
};

/**
 * Gera o PDF. Por padrão baixa o arquivo; com returnBlob devolve o Blob.
 *
 * @param {object} order   ordem (refuelings) ou movimentação (comboio_transactions)
 * @param {object} ctx     { vehicles, partners, employees }
 * @param {object} opts    { variant, returnBlob }
 */
export const generateAuthorizationPDF = async (order, ctx = {}, { variant = 'abastecimento', returnBlob = false } = {}) => {
    const logoDataUrl = await loadLogoDataUrl();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const effectivePageHeight = 148.5;
    const margin = 10;

    const { title, subtitle, body, vehicle } = buildBody(order, variant, ctx);

    if (logoDataUrl) {
        try { doc.addImage(logoDataUrl, 'PNG', margin, 10, 45, 16.875); } catch (e) { /* segue sem logo */ }
    }

    doc.setFontSize(16);
    doc.text(title, pageWidth - margin, 15, { align: 'right' });
    doc.setFontSize(12);
    doc.text(`Nº: ${String(order.authNumber || '0').padStart(6, '0')}`, pageWidth - margin, 22, { align: 'right' });
    if (subtitle) {
        doc.setFontSize(9);
        doc.text(subtitle, pageWidth - margin, 28, { align: 'right' });
    }

    autoTable(doc, {
        startY: 35,
        body,
        theme: 'striped',
        styles: { fontSize: 9, cellPadding: 1.5 },
        headStyles: { fillColor: [24, 49, 83] },
        columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } },
    });

    const finalY = (doc.lastAutoTable?.finalY || 35) + 10;
    const footerStartY = Math.max(finalY, effectivePageHeight - 20);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    if (variant === 'saida_comboio') {
        doc.text('*Comprovante do combustível distribuído pelo comboio interno ao veículo indicado.', margin, footerStartY);
    } else {
        doc.text('*A presente ordem de abastecimento é válida exclusivamente para a placa/RE indicada e para o tipo de combustível previamente autorizado.', margin, footerStartY);
        doc.text('*Estão autorizados somente os itens discriminados acima.', margin, footerStartY + 4);
    }
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Sistema de Gestão de Frotas MAK - Documento Gerado Eletronicamente', pageWidth / 2, footerStartY + 10, { align: 'center' });

    doc.setLineDashPattern([1, 1], 0);
    doc.setDrawColor(180, 180, 180);
    doc.line(0, effectivePageHeight, pageWidth, effectivePageHeight);

    if (returnBlob) return doc.output('blob');

    const prefixo = variant === 'saida_comboio' ? 'Distribuicao' : 'Autorizacao';
    doc.save(sanitizeFileName(`${prefixo}_${order.authNumber || 'TEMP'}_${vehicle?.registroInterno || 'VEIC'}_${fileDate(order.data || order.date)}.pdf`));
    return true;
};
