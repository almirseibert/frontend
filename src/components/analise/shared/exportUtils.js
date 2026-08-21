// Helpers de exportação reutilizados pelas abas (paridade de entrega).
// CSV com BOM para o Excel abrir em UTF-8; PDF via jsPDF já presente no projeto.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const GOLD_RGB = [158, 122, 66];

const csvCell = (c) => {
    const s = String(c ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCSV(filename, rows) {
    const csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

// tables: [{ head: [...], body: [[...]] }]
export function downloadPDF({ filename, title, subtitle, tables }) {
    const doc = new jsPDF('portrait');
    doc.setFontSize(14);
    doc.text(title, 14, 16);
    if (subtitle) {
        doc.setFontSize(9); doc.setTextColor(100);
        doc.text(subtitle, 14, 22);
    }
    let startY = subtitle ? 28 : 22;
    tables.forEach((t) => {
        autoTable(doc, {
            startY,
            head: [t.head],
            body: t.body,
            styles: { fontSize: 8 },
            headStyles: { fillColor: GOLD_RGB },
        });
        startY = doc.lastAutoTable.finalY + 6;
    });
    doc.save(filename);
}
