// src/utils/terceirosPanoramaPdf.js
// Versão imprimível do Panorama dos Terceirizados (relatório de direção).
// Recebe o objeto já calculado por buildPanorama — a tela e o PDF mostram
// exatamente os mesmos números, sem recalcular nada aqui.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { STATUS_LABEL } from './terceirosPanorama';

const fmtBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (n) => `${((Number(n) || 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const fmtH = (n) => `${Math.round(Number(n) || 0).toLocaleString('pt-BR')} h`;
const fmtDate = (d) => (d ? d.toLocaleDateString('pt-BR') : '—');

const ROXO = [124, 58, 237];

export const gerarPanoramaPdf = (pan) => {
    const { kpis, porTerceiro, porObra, alertas } = pan;
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const W = doc.internal.pageSize.getWidth();

    // ── Capa do relatório ─────────────────────────────────────────────────────
    doc.setFontSize(16); doc.setFont(undefined, 'bold');
    doc.text('Panorama dos Terceirizados', 14, 16);
    doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(120);
    doc.text(
        `${kpis.numContratos} contrato(s) em aberto · ${kpis.numTerceiros} terceiro(s) · ${kpis.numObras} obra(s) · `
        + `${kpis.numMaquinas} equipamento(s) · emitido em ${fmtDate(new Date())}`, 14, 22);
    doc.setTextColor(0);

    // Quadro-resumo: a resposta em uma linha de leitura.
    autoTable(doc, {
        startY: 27,
        theme: 'grid',
        head: [['Contratado (vigente)', 'Diesel abatido', 'Adiantamentos', 'Saldo devedor', 'Execução física', '% liquidado']],
        body: [[
            fmtBRL(kpis.valorTotal), fmtBRL(kpis.diesel), fmtBRL(kpis.adiantamentos),
            fmtBRL(kpis.saldo),
            `${fmtPct(kpis.progresso)} (${fmtH(kpis.horasExecutadas)} / ${fmtH(kpis.horasContratadas)})`,
            fmtPct(kpis.liquidado),
        ]],
        headStyles: { fillColor: ROXO, fontSize: 8 },
        styles: { fontSize: 9, halign: 'center', font: 'helvetica' },
        bodyStyles: { fontStyle: 'bold' },
        margin: { left: 14, right: 14 },
    });

    // ── Por terceiro (com os contratos dentro) ────────────────────────────────
    const body = [];
    porTerceiro.forEach((t) => {
        body.push([
            { content: t.nome, styles: { fontStyle: 'bold' } },
            { content: String(t.numContratos), styles: { fontStyle: 'bold' } },
            { content: String(t.numObras), styles: { fontStyle: 'bold' } },
            { content: String(t.numMaquinas), styles: { fontStyle: 'bold' } },
            { content: fmtBRL(t.valorTotal), styles: { fontStyle: 'bold' } },
            { content: fmtBRL(t.diesel), styles: { fontStyle: 'bold' } },
            { content: fmtBRL(t.adiantamentos), styles: { fontStyle: 'bold' } },
            { content: fmtBRL(t.saldo), styles: { fontStyle: 'bold' } },
            { content: fmtPct(t.participacao), styles: { fontStyle: 'bold' } },
        ]);
        t.linhas.forEach((l) => {
            const prazo = l.vencido ? ' (vencido)'
                : l.diasRestantes !== null && l.diasRestantes <= 30 ? ` (${l.diasRestantes}d)` : '';
            body.push([
                `    ${l.contrato.numero} · ${l.obraNome} · ${fmtDate(l.inicio)}–${fmtDate(l.fim)}${prazo}`
                + ` · ${STATUS_LABEL[l.status] || l.status}${l.assinado ? '' : ' · sem via assinada'}`,
                '', '1', String(l.r.numMaquinas),
                fmtBRL(l.r.valorTotal), fmtBRL(l.r.diesel), fmtBRL(l.r.adiantamentos), fmtBRL(l.r.saldo),
                l.r.horasContratadas > 0 ? fmtPct(l.r.progresso) : '—',
            ]);
        });
    });

    autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [['Terceiro / contrato', 'Contr.', 'Obras', 'Equip.', 'Contratado', 'Diesel', 'Adiantado', 'Saldo devedor', 'Fatia / exec.']],
        body,
        foot: [['Total', String(kpis.numContratos), String(kpis.numObras), String(kpis.numMaquinas),
            fmtBRL(kpis.valorTotal), fmtBRL(kpis.diesel), fmtBRL(kpis.adiantamentos), fmtBRL(kpis.saldo), '']],
        styles: { fontSize: 7.5, cellPadding: 1.6 },
        headStyles: { fillColor: ROXO, fontSize: 7.5 },
        footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 92 },
            1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' },
            4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
            7: { halign: 'right' }, 8: { halign: 'right' },
        },
        margin: { left: 14, right: 14 },
        didParseCell: (d) => {
            // Linhas de contrato (indentadas) em cinza, para o olho pousar no terceiro.
            if (d.section === 'body' && typeof d.row.raw[0] === 'string' && d.row.raw[0].startsWith('    ')) {
                d.cell.styles.textColor = 110;
            }
        },
    });

    // ── Por obra ──────────────────────────────────────────────────────────────
    doc.addPage('a4', 'landscape');
    doc.setFontSize(12); doc.setFont(undefined, 'bold');
    doc.text('Exposição por obra', 14, 16);
    autoTable(doc, {
        startY: 21,
        head: [['Obra', 'Local', 'Terceiros', 'Contratos', 'Equip.', 'Contratado', 'Diesel', 'Adiantado', 'Saldo devedor']],
        body: porObra.map((o) => [
            o.nome, o.localizacao || '—', String(o.numTerceiros), String(o.numContratos), String(o.numMaquinas),
            fmtBRL(o.valorTotal), fmtBRL(o.diesel), fmtBRL(o.adiantamentos), fmtBRL(o.saldo),
        ]),
        foot: [['Total', '', String(kpis.numTerceiros), String(kpis.numContratos), String(kpis.numMaquinas),
            fmtBRL(kpis.valorTotal), fmtBRL(kpis.diesel), fmtBRL(kpis.adiantamentos), fmtBRL(kpis.saldo)]],
        styles: { fontSize: 8, cellPadding: 1.8 },
        headStyles: { fillColor: ROXO, fontSize: 8 },
        footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
        columnStyles: {
            2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' },
            5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' },
        },
        margin: { left: 14, right: 14 },
    });

    // ── Pontos de atenção ─────────────────────────────────────────────────────
    let y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12); doc.setFont(undefined, 'bold');
    doc.text('Pontos de atenção', 14, y);
    y += 5;

    if (alertas.length === 0) {
        doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(120);
        doc.text('Nenhum: contratos em aberto assinados, dentro do prazo e dentro do plano de horas.', 14, y);
        doc.setTextColor(0);
    } else {
        autoTable(doc, {
            startY: y,
            head: [['Sev.', 'Ponto de atenção', 'Qtd.', 'Contratos envolvidos']],
            body: alertas.map((a) => [
                a.severidade.toUpperCase(),
                a.titulo,
                String(a.itens.length),
                a.itens.map((l) => `${l.contrato.numero} (${l.terceiroNome})`).join(', '),
            ]),
            styles: { fontSize: 7.5, cellPadding: 1.8, valign: 'middle' },
            headStyles: { fillColor: ROXO, fontSize: 7.5 },
            columnStyles: {
                0: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
                1: { cellWidth: 62, fontStyle: 'bold' },
                2: { cellWidth: 12, halign: 'center' },
            },
            margin: { left: 14, right: 14 },
            didParseCell: (d) => {
                if (d.section === 'body' && d.column.index === 0) {
                    const sev = String(d.cell.raw).toLowerCase();
                    d.cell.styles.textColor = sev === 'alta' ? [185, 28, 28] : sev === 'media' ? [180, 83, 9] : [29, 78, 216];
                }
            },
        });
    }

    // Rodapé com paginação em todas as páginas.
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i += 1) {
        doc.setPage(i);
        doc.setFontSize(7.5); doc.setTextColor(150); doc.setFont(undefined, 'normal');
        doc.text('Saldo devedor = valor contratado vigente − diesel abatido − adiantamentos. Contratos concluídos e cancelados ficam fora dos totais.',
            14, doc.internal.pageSize.getHeight() - 8);
        doc.text(`${i}/${total}`, W - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
        doc.setTextColor(0);
    }

    doc.save(`panorama_terceirizados_${new Date().toISOString().slice(0, 10)}.pdf`);
};
