// PDF da aba "Produção" — relatório para a diretoria.
//
// Deliberadamente NÃO é a tela impressa: só o que a diretoria lê (números do
// período, horas por obra, próprio × terceiro por tipo, principais máquinas).
// Avisos de cadastro (alocada sem lançar, horas sem alocação) ficam só na tela.
//
// Fonte padrão do jsPDF (Helvetica/WinAnsi): evitar caracteres fora do Latin-1
// como travessão, bullet e ≥ — saem como lixo no PDF.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const COR = {
    gold: [158, 122, 66], goldLt: [245, 239, 228], border: [229, 224, 216],
    text: [30, 26, 20], mid: [90, 78, 58], sub: [154, 140, 122],
    proprio: [42, 120, 214], terceiro: [235, 104, 52],
    green: [22, 163, 74], orange: [234, 88, 12], white: [255, 255, 255],
};

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const W = 210, H = 297, M = 14, CW = W - 2 * M;
const TOPO_PAGINA = 18;
const LIMITE_RODAPE = H - 18;
const MAX_TIPOS = 8;
const MAX_MAQUINAS = 10;

const fmtNum = (v, casas = 0) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const fmtH = (v) => `${fmtNum(v)} h`;
const fmtHd = (v) => (v == null ? '-' : fmtNum(v, 1));
const dataBR = (ymd) => ymd.split('-').reverse().join('/');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Setembro de 2026" para mês fechado; senão "01/09/2026 a 15/09/2026". */
const rotuloPeriodo = ({ startDate, endDate }) => {
    const [y, m] = startDate.split('-').map(Number);
    const ultimo = new Date(y, m, 0).getDate();
    if (startDate.endsWith('-01') && endDate === `${startDate.slice(0, 8)}${String(ultimo).padStart(2, '0')}`) {
        return `${cap(MESES[m - 1])} de ${y}`;
    }
    return `${dataBR(startDate)} a ${dataBR(endDate)}`;
};

const nomeMaquina = (m) => m.registroInterno || m.placa || m.modelo || '-';

export function gerarPdfProducao(data) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const r = data.resumo;
    const periodo = rotuloPeriodo(data.range);
    let y = 0;

    const cor = (fn, c) => doc[fn](c[0], c[1], c[2]);
    const fonte = (tam, estilo = 'normal', c = COR.text) => {
        doc.setFont('helvetica', estilo);
        doc.setFontSize(tam);
        cor('setTextColor', c);
    };
    // Corta o texto com reticências para caber na largura.
    const caber = (txt, largura) => {
        let s = String(txt);
        if (doc.getTextWidth(s) <= largura) return s;
        while (s.length > 1 && doc.getTextWidth(`${s}...`) > largura) s = s.slice(0, -1);
        return `${s.trimEnd()}...`;
    };
    const garantir = (altura) => {
        if (y + altura > LIMITE_RODAPE) {
            doc.addPage();
            y = TOPO_PAGINA;
        }
    };
    const titulo = (txt, sub) => {
        garantir(sub ? 30 : 24);
        fonte(12, 'bold');
        doc.text(txt, M, y);
        cor('setDrawColor', COR.gold);
        doc.setLineWidth(0.6);
        doc.line(M, y + 2, M + 18, y + 2);
        y += 7;
        if (sub) {
            fonte(8, 'normal', COR.sub);
            doc.text(sub, M, y);
            y += 5;
        }
    };
    const legenda = (x, yy) => {
        fonte(7.5, 'normal', COR.mid);
        cor('setFillColor', COR.proprio); doc.rect(x, yy - 2.3, 2.6, 2.6, 'F');
        doc.text('Próprio', x + 4, yy);
        cor('setFillColor', COR.terceiro); doc.rect(x + 18, yy - 2.3, 2.6, 2.6, 'F');
        doc.text('Terceiro', x + 22, yy);
    };

    // ── Cabeçalho ────────────────────────────────────────────────────────────
    cor('setFillColor', COR.gold);
    doc.rect(0, 0, W, 30, 'F');
    fonte(9, 'normal', COR.white);
    doc.text('MAK SERVIÇOS  ·  DESEMPENHO DO NEGÓCIO', M, 11);
    fonte(18, 'bold', COR.white);
    doc.text('Produção do período', M, 21);
    fonte(12, 'normal', COR.white);
    doc.text(periodo, W - M, 21, { align: 'right' });
    y = 40;

    // ── Números do período ───────────────────────────────────────────────────
    const gap = 4;
    const tw = (CW - 3 * gap) / 4;
    const th = 27;
    const tile = (i, label, desenhar) => {
        const x = M + i * (tw + gap);
        cor('setFillColor', COR.goldLt);
        doc.roundedRect(x, y, tw, th, 2, 2, 'F');
        fonte(7.5, 'bold', COR.mid);
        doc.text(label.toUpperCase(), x + 4, y + 6);
        desenhar(x + 4, tw - 8);
    };
    tile(0, 'Horas executadas', (x) => {
        fonte(17, 'bold');
        doc.text(fmtNum(r.horasTotal), x, y + 16);
        if (r.deltaPct != null) {
            fonte(8, 'bold', r.deltaPct >= 0 ? COR.green : COR.orange);
            doc.text(`${r.deltaPct >= 0 ? '+' : ''}${fmtNum(r.deltaPct, 1)}% vs. período anterior`, x, y + 22.5);
        }
    });
    tile(1, 'Próprio x terceiro', (x, larg) => {
        const pTerc = Math.round(r.pctTerceiro);
        fonte(17, 'bold', COR.proprio);
        doc.text(`${100 - pTerc}%`, x, y + 16);
        const wp = doc.getTextWidth(`${100 - pTerc}%`);
        fonte(12, 'normal', COR.sub);
        doc.text('/', x + wp + 1.5, y + 16);
        fonte(17, 'bold', COR.terceiro);
        doc.text(`${pTerc}%`, x + wp + 5, y + 16);
        const wProp = r.horasTotal > 0 ? (larg * r.horasProprio) / r.horasTotal : 0;
        cor('setFillColor', COR.proprio); doc.rect(x, y + 20, wProp, 2.6, 'F');
        cor('setFillColor', COR.terceiro); doc.rect(x + wProp, y + 20, larg - wProp, 2.6, 'F');
    });
    tile(2, 'Obras atendidas', (x) => {
        fonte(17, 'bold');
        doc.text(String(r.obras), x, y + 16);
        fonte(8, 'normal', COR.mid);
        doc.text(`${r.obrasComTerceiro} com terceiros`, x, y + 22.5);
    });
    tile(3, 'Máquinas', (x) => {
        fonte(17, 'bold');
        doc.text(String(r.maquinas), x, y + 16);
        fonte(8, 'normal', COR.mid);
        doc.text(`${r.maquinasProprias} próprias · ${r.maquinasTerceiras} terceiras`, x, y + 22.5);
    });
    y += th + 10;

    // ── Leitura rápida ───────────────────────────────────────────────────────
    const obrasComHoras = data.porObra.filter(o => o.total > 0);
    const frases = [];
    frases.push(`Foram executadas ${fmtH(r.horasTotal)} em ${r.obras} obras; ${fmtNum(100 - r.pctTerceiro)}% com frota própria e ${fmtNum(r.pctTerceiro)}% com terceiros.`);
    if (obrasComHoras[0]) {
        const o = obrasComHoras[0];
        frases.push(`Maior obra do período: ${o.nome}, com ${fmtH(o.total)} (${fmtNum((o.total / r.horasTotal) * 100)}% do total).`);
    }
    const dependente = obrasComHoras.filter(o => o.total >= r.horasTotal * 0.02).sort((a, b) => b.pctTerceiro - a.pctTerceiro)[0];
    if (dependente && dependente.pctTerceiro > 0) {
        frases.push(`Obra mais dependente de terceiros: ${dependente.nome}, com ${fmtNum(dependente.pctTerceiro)}% das horas terceirizadas.`);
    }
    const comparaveis = data.porTipo.filter(t => t.diffPct != null && t.proprio.maquinas >= 2 && t.terceiro.maquinas >= 2);
    if (comparaveis.length) {
        const t = comparaveis.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct))[0];
        frases.push(`Maior diferença de rendimento: ${t.grupo} (próprio ${fmtHd(t.proprio.hDia)} h/dia x terceiro ${fmtHd(t.terceiro.hDia)} h/dia).`);
    }

    fonte(9, 'normal', COR.text);
    const linhas = frases.flatMap(f => doc.splitTextToSize(f, CW - 12));
    const alturaCaixa = linhas.length * 4.6 + 12;
    cor('setDrawColor', COR.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, CW, alturaCaixa, 2, 2, 'S');
    cor('setFillColor', COR.gold);
    doc.rect(M, y, 1.4, alturaCaixa, 'F');
    fonte(8, 'bold', COR.gold);
    doc.text('LEITURA RÁPIDA', M + 6, y + 6);
    fonte(9, 'normal', COR.text);
    doc.text(linhas, M + 6, y + 11.5, { lineHeightFactor: 1.4 });
    y += alturaCaixa + 11;

    // ── Horas por obra (barras empilhadas) ───────────────────────────────────
    titulo('Horas por obra');
    legenda(W - M - 34, y - 9);
    // Todas as obras trabalhadas no período (a diretoria quer a lista completa;
    // a quebra de página é tratada por garantir()).
    const maxObra = Math.max(...obrasComHoras.map(o => o.total), 1);
    const xNome = M, wNome = 62, xBarra = M + wNome + 2, wBarra = CW - wNome - 2 - 34;
    obrasComHoras.forEach((o) => {
        garantir(7);
        fonte(8.5, 'normal');
        doc.text(caber(o.nome, wNome), xNome, y + 3);
        const wp = (wBarra * o.horasProprio) / maxObra;
        const wt = (wBarra * o.horasTerceiro) / maxObra;
        cor('setFillColor', COR.goldLt); doc.rect(xBarra, y, wBarra, 4, 'F');
        cor('setFillColor', COR.proprio); doc.rect(xBarra, y, wp, 4, 'F');
        cor('setFillColor', COR.terceiro); doc.rect(xBarra + wp, y, wt, 4, 'F');
        fonte(8.5, 'bold');
        doc.text(fmtNum(o.total), W - M - 13, y + 3, { align: 'right' });
        const pct = o.total > 0 ? Math.round((o.horasTerceiro / o.total) * 100) : 0;
        fonte(8, pct > 0 ? 'bold' : 'normal', pct > 0 ? COR.terceiro : COR.sub);
        doc.text(`${pct}%`, W - M, y + 3, { align: 'right' });
        y += 6.4;
    });
    fonte(7, 'normal', COR.sub);
    doc.text('horas  ·  % terceiro', W - M, y + 1, { align: 'right' });
    y += 10;

    // ── Próprio x terceiro por tipo ──────────────────────────────────────────
    const tipos = data.porTipo.slice(0, MAX_TIPOS);
    garantir(30 + tipos.length * 11);
    titulo('Nossa máquina rende como a alugada?', 'Horas por dia útil em que a máquina esteve alocada, no mesmo tipo de equipamento.');
    legenda(W - M - 34, y - 14);
    const maxHd = Math.max(...tipos.flatMap(t => [t.proprio.hDia || 0, t.terceiro.hDia || 0]), 1);
    const wTipo = 58, xB = M + wTipo + 2, wB = CW - wTipo - 2 - 46;
    tipos.forEach((t) => {
        garantir(11);
        fonte(8.5, 'normal');
        doc.text(caber(t.grupo, wTipo), M, y + 4.2);
        [['proprio', COR.proprio, 0], ['terceiro', COR.terceiro, 4.4]].forEach(([lado, c, dy]) => {
            const v = t[lado];
            cor('setFillColor', COR.goldLt); doc.rect(xB, y + dy, wB, 3.4, 'F');
            if (v.maquinas && v.hDia) { cor('setFillColor', c); doc.rect(xB, y + dy, (wB * v.hDia) / maxHd, 3.4, 'F'); }
            fonte(7.5, 'normal', v.maquinas ? COR.text : COR.sub);
            doc.text(v.maquinas ? `${fmtHd(v.hDia)} h  (${v.maquinas})` : 'sem máquinas', xB + wB + 2, y + dy + 2.8);
        });
        if (t.diffPct != null) {
            const bom = t.diffPct >= 5, ruim = t.diffPct <= -5;
            const c = bom ? COR.green : ruim ? COR.orange : COR.sub;
            const txt = `${t.diffPct >= 0 ? '+' : ''}${fmtNum(t.diffPct)}%`;
            fonte(8, 'bold', c);
            doc.text(txt, W - M, y + 4.6, { align: 'right' });
        }
        y += 11;
    });
    fonte(7, 'normal', COR.sub);
    doc.text('Entre parênteses: quantidade de máquinas. Diferença = próprio em relação ao terceiro.', M, y + 1);
    y += 11;

    // ── Máquinas com mais horas ──────────────────────────────────────────────
    garantir(24 + MAX_MAQUINAS * 7);
    titulo(`As ${MAX_MAQUINAS} máquinas com mais horas`);
    autoTable(doc, {
        startY: y,
        margin: { left: M, right: M, bottom: H - LIMITE_RODAPE },
        head: [['Máquina', 'Tipo', 'Origem', 'Obra', 'Horas', 'h/dia']],
        body: data.porMaquina.slice(0, MAX_MAQUINAS).map(m => [
            nomeMaquina(m),
            m.grupo || '-',
            m.origem === 'terceiro' ? (m.locadora || 'Terceiro') : 'Próprio',
            m.obras.length > 1 ? `${m.obras.length} obras` : (m.obras[0]?.nome || '-'),
            fmtNum(m.horas),
            fmtHd(m.hDia),
        ]),
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 8, textColor: COR.text, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, overflow: 'ellipsize' },
        headStyles: { fontStyle: 'bold', fontSize: 7, textColor: COR.mid, fillColor: COR.goldLt },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 24 },
            1: { cellWidth: 55 },
            2: { cellWidth: 24 },
            4: { halign: 'right', cellWidth: 16 },
            5: { halign: 'right', cellWidth: 14 },
        },
        didParseCell: (h) => {
            if (h.section === 'body' && h.column.index === 2) {
                h.cell.styles.textColor = h.cell.raw === 'Próprio' ? COR.proprio : COR.terceiro;
                h.cell.styles.fontStyle = 'bold';
            }
            if (h.section === 'body') h.cell.styles.lineColor = COR.border;
        },
        didDrawCell: (h) => {
            if (h.section === 'body') {
                cor('setDrawColor', COR.border);
                doc.setLineWidth(0.2);
                doc.line(h.cell.x, h.cell.y + h.cell.height, h.cell.x + h.cell.width, h.cell.y + h.cell.height);
            }
        },
    });

    // ── Rodapé em todas as páginas ───────────────────────────────────────────
    const total = doc.getNumberOfPages();
    const emitido = new Date().toLocaleDateString('pt-BR');
    for (let p = 1; p <= total; p++) {
        doc.setPage(p);
        cor('setDrawColor', COR.border);
        doc.setLineWidth(0.3);
        doc.line(M, H - 13, W - M, H - 13);
        fonte(6.8, 'normal', COR.sub);
        doc.text('Horas = lançamentos de horas do período (não é horímetro). h/dia = horas ÷ dias úteis em que a máquina esteve alocada; sábado soma horas, não dias.', M, H - 9);
        doc.text(`Emitido em ${emitido}`, M, H - 5.5);
        doc.text(`Página ${p} de ${total}`, W - M, H - 5.5, { align: 'right' });
    }

    doc.save(`producao_${data.range.startDate}_${data.range.endDate}.pdf`);
}
