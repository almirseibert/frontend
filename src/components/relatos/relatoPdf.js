// Geração do PDF do Relato de Ocorrência e Manutenção de Frota (FRM-MAN-001).
//
// Reproduz as 6 seções do formulário impresso, na mesma ordem e com os mesmos
// títulos, mas em versão limpa do sistema (A4 inteira) — não é clone visual do
// papel. Serve para arquivar, anexar em e-mail e imprimir a ficha já digitada.
//
// Segue os mesmos padrões de utils/orderPdf.js: jsPDF A4 em mm, logo no canto,
// autoTable com cabeçalho azul-marinho, e os três modos de saída
// (returnBlob / downloadName / abrir no navegador).
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sanitizeFileName } from '../../utils/orderPdf';
import { GRAVIDADES, GRAVIDADE_LEGENDA } from '../../utils/relatoGravidade';

const AZUL_MARINHO = [24, 49, 83];

const fmtData = (ymd) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('pt-BR') : '____/____/______');
const fmtNum = (v, sufixo) => (v == null || v === '' ? '—' : `${Number(v).toLocaleString('pt-BR')} ${sufixo}`);

/** "Relato de Ocorrencia 000123 2026-08-07 RE-546.pdf" */
export const buildRelatoFileName = (relato, vehicle) => {
    const num = relato.numero ? String(relato.numero).padStart(6, '0') : '000000';
    const data = relato.dataRelato || new Date().toISOString().split('T')[0];
    const re = (relato.veiculoFrota || vehicle?.registroInterno) ? ` RE-${relato.veiculoFrota || vehicle.registroInterno}` : '';
    return `${sanitizeFileName(`Relato de Ocorrencia ${num} ${data}${re}`)}.pdf`;
};

/**
 * @param {object}  relato        cabeçalho + `itens` (retorno de GET /relatos/:id)
 * @param {object}  vehicle       veículo do cadastro (fallback do snapshot)
 * @param {string}  logoDataUrl   PNG em dataURL, ou null
 * @param {boolean} returnBlob    true → devolve Blob (para upload/anexo)
 * @param {string}  downloadName  informado → baixa no PC; senão abre no navegador
 */
export const generateRelatoPDF = (relato, vehicle, logoDataUrl, returnBlob = false, downloadName = null) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const larguraUtil = pageWidth - margin * 2;

    // --- Cabeçalho ---
    if (logoDataUrl) {
        try { doc.addImage(logoDataUrl, 'PNG', margin, 10, 45, 16.875); } catch (e) { /* segue sem logo */ }
    }

    doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text('RELATO DE OCORRÊNCIA', pageWidth - margin, 15, { align: 'right' });
    doc.text('E MANUTENÇÃO DE FROTA', pageWidth - margin, 21, { align: 'right' });
    doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    doc.text(`Nº ${relato.numero ? String(relato.numero).padStart(6, '0') : '—'}`, pageWidth - margin, 28, { align: 'right' });

    doc.setLineWidth(0.5); doc.line(margin, 32, pageWidth - margin, 32);

    let y = 39;

    // Faixa de título de seção, no mesmo formato do papel: número + título.
    const secao = (n, titulo) => {
        doc.setFillColor(...AZUL_MARINHO);
        doc.rect(margin, y - 4, larguraUtil, 6, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text(`${n}   ${titulo}`, margin + 2, y);
        doc.setTextColor(0, 0, 0);
        y += 8;
    };

    // Pares rótulo/valor distribuídos em colunas. `span` alarga o campo para
    // mais de uma coluna — sem isso um modelo longo ("Escavadeira Hidráulica
    // CAT 320") era cortado no meio. Valor quebra em até 2 linhas.
    const campos = (lista, colunas = 4) => {
        const largura = larguraUtil / colunas;
        let col = 0;
        let extraLinha = 0;
        lista.forEach((campo) => {
            const span = Math.min(campo.span || 1, colunas);
            if (col + span > colunas) { y += 9 + extraLinha; col = 0; extraLinha = 0; }

            const x = margin + col * largura;
            doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(110, 110, 110);
            doc.text(String(campo.label).toUpperCase(), x, y);

            doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
            const linhas = doc.splitTextToSize(String(campo.valor ?? '—') || '—', largura * span - 3).slice(0, 2);
            doc.text(linhas, x, y + 4.5);

            extraLinha = Math.max(extraLinha, (linhas.length - 1) * 4);
            col += span;
        });
        y += 12 + extraLinha;
    };

    // --- Seção 1 ---
    secao(1, 'IDENTIFICAÇÃO DO RELATOR');
    campos([
        { label: 'Nome do colaborador', valor: relato.relatorNome },
        { label: 'Função / cargo', valor: relato.relatorFuncao },
        { label: 'Filial / cidade', valor: relato.filialCidade },
        { label: 'Data do relato', valor: fmtData(relato.dataRelato) },
    ]);

    // --- Seção 2 ---
    secao(2, 'IDENTIFICAÇÃO DO VEÍCULO / EQUIPAMENTO');
    campos([
        { label: 'Veículo / equipamento (modelo)', valor: relato.veiculoModelo || vehicle?.modelo, span: 2 },
        { label: 'Placa', valor: relato.veiculoPlaca || vehicle?.placa },
        { label: 'Nº de frota / prefixo', valor: relato.veiculoFrota || vehicle?.registroInterno },
        { label: 'Hodômetro (Km)', valor: fmtNum(relato.hodometro, 'Km') },
        { label: 'Horímetro (H)', valor: fmtNum(relato.horimetro, 'H') },
    ]);

    // --- Seção 3: legenda, igual ao quadro do papel ---
    secao(3, 'CLASSIFICAÇÃO DA GRAVIDADE — LEGENDA');
    autoTable(doc, {
        startY: y - 4,
        head: [['', 'CLASSIFICAÇÃO', 'ORIENTAÇÃO']],
        body: GRAVIDADES.map(g => [g, GRAVIDADE_LEGENDA[g].label, GRAVIDADE_LEGENDA[g].descricao]),
        theme: 'grid',
        headStyles: { fillColor: AZUL_MARINHO, fontSize: 7.5 },
        styles: { fontSize: 7.5, cellPadding: 1.4 },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 52, fontStyle: 'bold' },
        },
        margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 8;

    // --- Seção 4: a grade de itens ---
    secao(4, 'ITENS / PROBLEMAS IDENTIFICADOS');
    const itens = relato.itens || [];
    autoTable(doc, {
        startY: y - 4,
        head: [['Nº', 'ITEM / COMPONENTE', 'DESCRIÇÃO DO PROBLEMA / O QUE FOI OBSERVADO', 'GRAV.', 'STATUS', 'PRAZO']],
        body: itens.length > 0
            ? itens.map(i => [
                i.sequencia,
                i.itemComponente || '',
                i.descricaoProblema || '',
                String(i.gravidade || '').toUpperCase(),
                i.status || '',
                i.dataConclusaoPrevista ? fmtData(i.dataConclusaoPrevista) : (i.slaDiasUteis ? `${i.slaDiasUteis} d.ú.` : '—'),
            ])
            : [['—', 'Nenhum item lançado nesta ficha.', '', '', '', '']],
        theme: 'striped',
        headStyles: { fillColor: AZUL_MARINHO, fontSize: 7.5 },
        styles: { fontSize: 8, cellPadding: 1.6, valign: 'top' },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 40 },
            3: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
            4: { cellWidth: 24, halign: 'center', fontSize: 7 },
            5: { cellWidth: 20, halign: 'center', fontSize: 7 },
        },
        margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 4;

    doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(110, 110, 110);
    doc.text('Marque apenas uma letra de gravidade por item.', margin, y);
    doc.setTextColor(0, 0, 0);
    y += 8;

    // --- Seção 5 ---
    secao(5, 'OBSERVAÇÕES GERAIS / HISTÓRICO DO PROBLEMA');
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    const obs = doc.splitTextToSize(relato.observacoesGerais || 'Sem observações.', larguraUtil);
    doc.text(obs, margin, y);
    y += obs.length * 4.5 + 6;

    const meia = larguraUtil / 2;
    doc.setLineWidth(0.2);
    doc.line(margin, y, margin + meia - 8, y);
    doc.line(margin + meia + 2, y, pageWidth - margin, y);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(110, 110, 110);
    doc.text('ASSINATURA DO COLABORADOR', margin, y + 3.5);
    doc.text('ASSINATURA DO ENCARREGADO / SUPERVISOR', margin + meia + 2, y + 3.5);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
    if (relato.assinaturaColaborador) doc.text(relato.assinaturaColaborador, margin, y - 1.5);
    if (relato.assinaturaSupervisor) doc.text(relato.assinaturaSupervisor, margin + meia + 2, y - 1.5);
    y += 12;

    // --- Seção 6 ---
    secao(6, 'USO EXCLUSIVO DA MANUTENÇÃO / OFICINA');
    campos([
        { label: 'Recebido em', valor: fmtData(relato.recebidoEm) },
        { label: 'Responsável', valor: relato.responsavelManutencao, span: 2 },
        { label: 'Conclusão em', valor: fmtData(relato.concluidoEm) },
        { label: 'OS do sistema MC', valor: relato.osMc || '—' },
        { label: 'Status do relato', valor: relato.status, span: 2 },
        { label: 'Conclusão prevista', valor: fmtData(relato.dataConclusaoPrevista) },
    ]);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(110, 110, 110);
    doc.text('PROVIDÊNCIA ADOTADA', margin, y);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
    const prov = doc.splitTextToSize(relato.providenciaAdotada || '—', larguraUtil);
    doc.text(prov, margin, y + 4.5);

    // --- Rodapé em todas as páginas ---
    const totalPaginas = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPaginas; p++) {
        doc.setPage(p);
        doc.setLineWidth(0.2); doc.setDrawColor(180, 180, 180);
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(110, 110, 110);
        doc.text('MAK Serviços e Pavimentações Ltda. — Setor de Frota e Manutenção', margin, pageHeight - 8);
        doc.text(`FRM-MAN-001  Rev. 01  Página ${p} de ${totalPaginas}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
        doc.setTextColor(0, 0, 0);
    }

    if (returnBlob) return doc.output('blob');
    if (downloadName) { doc.save(downloadName); return; }
    doc.output('dataurlnewwindow');
};
