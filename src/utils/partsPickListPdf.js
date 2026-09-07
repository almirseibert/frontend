// utils/partsPickListPdf.js
// ─────────────────────────────────────────────────────────────────────────────
// Gera a "Lista de Separação" (PDF) das peças de um equipamento/modelo, para
// entregar ao almoxarifado. Cruza cada peça com o estoque (/inventory/items)
// por código (OEM ou qualquer equivalente ↔ sku / internalCode / eaN) e mostra
// a quantidade disponível. Coluna "Separado" fica em branco para conferência.
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiClient from '../services/apiClient';
import { categoriaLabel } from '../components/modals/PartCatalogItemModal';

const norm = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const formatIntervalo = (it) => [
    it.intervalo_km ? `${Number(it.intervalo_km).toLocaleString('pt-BR')} km` : null,
    it.intervalo_horas ? `${Number(it.intervalo_horas).toLocaleString('pt-BR')} h` : null,
    it.intervalo_meses ? `${it.intervalo_meses} m` : null,
].filter(Boolean).join(' / ');

const equivStr = (it) => (Array.isArray(it.codigos_equivalentes) ? it.codigos_equivalentes : [])
    .map(e => [e.marca, e.codigo].filter(Boolean).join(' ')).join('  •  ');

// Índice do estoque por código normalizado (sku / internalCode / eaN).
const buildStockIndex = (inventory) => {
    const idx = new Map();
    (inventory || []).forEach(item => {
        [item.sku, item.internalCode, item.eaN].forEach(code => {
            const n = norm(code);
            if (n && !idx.has(n)) idx.set(n, item);
        });
    });
    return idx;
};

// Procura a peça no estoque testando OEM + equivalentes.
const matchStock = (it, idx) => {
    const codes = [it.codigo_oem, ...((it.codigos_equivalentes || []).map(e => e.codigo))].filter(Boolean);
    for (const c of codes) {
        const hit = idx.get(norm(c));
        if (hit) return hit;
    }
    return null;
};

/**
 * @param {object} opts
 * @param {string} opts.titulo   - Linha de identificação do equipamento/modelo.
 * @param {string} [opts.subtitulo]
 * @param {Array}  opts.items    - Itens do catálogo (com codigos_equivalentes já como array).
 * @param {Array}  [opts.inventory] - Estoque já carregado; se ausente, busca em /inventory/items.
 */
export async function generatePartsPickListPdf({ titulo, subtitulo, items, inventory }) {
    let stock = inventory;
    if (!Array.isArray(stock)) {
        try {
            stock = await apiClient.get('/inventory/items');
        } catch {
            stock = []; // Sem acesso ao estoque: gera a lista mesmo assim (coluna vazia).
        }
    }
    const idx = buildStockIndex(stock);

    const doc = new jsPDF('landscape');
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFontSize(16); doc.setTextColor(30, 26, 20);
    doc.text('Lista de Separação — Peças e Reposição', 14, 16);
    doc.setFontSize(11); doc.setTextColor(60);
    doc.text(titulo || '', 14, 23);
    doc.setFontSize(9); doc.setTextColor(110);
    let y = 29;
    if (subtitulo) { doc.text(subtitulo, 14, y); y += 5; }
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, y);

    const body = (items || []).map(it => {
        const hit = matchStock(it, idx);
        const estoque = hit
            ? `${Number(hit.quantity) || 0} ${hit.unit || ''}`.trim() + (hit.sku ? `\n(SKU ${hit.sku})` : '')
            : '—';
        return [
            categoriaLabel(it.categoria),
            it.descricao + (it.especificacao ? `\n${it.especificacao}` : '') + (it.capacidade ? ` · ${it.capacidade}` : ''),
            it.codigo_oem || '—',
            equivStr(it) || '—',
            formatIntervalo(it) || '—',
            estoque,
            '', // Separado (marcar à mão)
        ];
    });

    autoTable(doc, {
        startY: y + 4,
        head: [['Categoria', 'Item / Especificação', 'OEM', 'Equivalentes', 'Troca', 'Estoque', 'Separado']],
        body,
        theme: 'grid',
        headStyles: { fillColor: [234, 179, 8], textColor: [30, 26, 20] }, // yellow-500
        styles: { fontSize: 8, valign: 'middle', cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 32 },
            1: { cellWidth: 75 },
            2: { cellWidth: 30 },
            3: { cellWidth: 62 },
            4: { cellWidth: 26 },
            5: { cellWidth: 26 },
            6: { cellWidth: 18, halign: 'center' },
        },
        didParseCell: (data) => {
            // Destaca em verde a coluna Estoque quando há item disponível.
            if (data.section === 'body' && data.column.index === 5) {
                const txt = String(data.cell.raw || '');
                if (txt && txt !== '—' && !txt.startsWith('0 ') && txt !== '0') {
                    data.cell.styles.fillColor = [220, 252, 231];
                    data.cell.styles.textColor = [22, 101, 52];
                }
            }
        },
    });

    // Rodapé: legenda + assinaturas.
    let fy = (doc.lastAutoTable?.finalY || y) + 10;
    if (fy > doc.internal.pageSize.getHeight() - 30) { doc.addPage('landscape'); fy = 20; }
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text('Estoque em verde = disponível no almoxarifado (cruzado por OEM/equivalente). "—" = não localizado no cadastro de estoque; verificar manualmente.', 14, fy);
    doc.text('Dados de peças são REFERÊNCIA — conferir aplicação/código no manual antes de aplicar.', 14, fy + 4);
    fy += 16;
    doc.setTextColor(60); doc.setFontSize(9);
    doc.text('Separado por: ______________________', 14, fy);
    doc.text('Conferido por: ______________________', pageW / 2 - 20, fy);
    doc.text('Data: ____/____/____', pageW - 70, fy);

    const safe = (titulo || 'equipamento').replace(/[^\w-]+/g, '_').slice(0, 40);
    doc.save(`Lista_Separacao_${safe}.pdf`);
}
