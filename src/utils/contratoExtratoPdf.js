// src/utils/contratoExtratoPdf.js
// Extrato (PDF) de UM contrato de terceiro — a obra individualizada. Complementa o
// extrato do terceiro (terceiroExtratoPdf.js), que soma todos os contratos dele.
// Client-side (jsPDF), sobre os MESMOS cálculos da tela (computeContrato e
// companhia), para o papel nunca divergir do que o ContratoDetalhe mostra.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    getContratoAbastecimentos, getContratoApontamentos, agruparApontamentosPorMes,
} from './terceirizados';
import { formatObraNome } from './obraFormat';
import { terceirizadoPdfMark } from '../components/ui/TerceirizadoBadge';

import { fmtBRL } from './currency';
const fmtH = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h';
const fmtHInt = (n) => `${Math.round(Number(n) || 0).toLocaleString('pt-BR')} h`;
const fmtL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' L';
const fmtPct = (n) => `${(Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const toDate = (v) => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(String(v).includes('T') ? v : `${String(v).split(' ')[0]}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
};
const fmtDate = (v) => toDate(v)?.toLocaleDateString('pt-BR') || '—';
const mesLabel = (d) => d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

const STATUS = { ativo: 'Ativo', assinado: 'Assinado', concluido: 'Concluído', cancelado: 'Cancelado' };
const ADITIVO_TIPO = {
    acrescimo: 'Acréscimo de horas',
    supressao: 'Supressão de horas',
    escopo: 'Inclusão de equipamento',
    reajuste: 'Reajuste de preço',
    prazo: 'Prorrogação de prazo',
};

// Terceiro é identificado pela placa por quem confere/paga — o RE é interno da MAK.
const maquinaLabel = (v) => {
    if (!v) return '—';
    const re = v.registroInterno || '';
    const placa = v.placa && v.placa !== re ? v.placa : '';
    const base = [re, placa].filter(Boolean).join(' · ');
    return base ? base + terceirizadoPdfMark(v) : '—';
};

const ROXO = [124, 58, 237];
const ROXO_CLARO = [243, 240, 255];
const AZUL = [37, 99, 235];
const AZUL_CLARO = [239, 246, 255];
const VERDE = [22, 163, 74];
const VERDE_CLARO = [240, 253, 244];

/**
 * @param {object} r         resultado de computeContrato
 * @param {object} terceiro  locador { razaoSocial, cnpj }
 * @param {object} obra      obra do contrato (nome + órgão contratante)
 * @param {object} ctx       contexto de dados (o mesmo passado a computeContrato)
 * @param {array}  pagamentos pagamentos DESTE contrato
 */
export const gerarContratoExtratoPdf = (r, terceiro, obra, ctx, pagamentos = []) => {
    const c = r.contrato;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pageW = doc.internal.pageSize.getWidth();
    const obraTxt = formatObraNome(obra) || '—';

    const apontamentos = getContratoApontamentos(c, ctx);
    const abastecimentos = getContratoAbastecimentos(c, ctx);
    const porMes = agruparApontamentosPorMes(apontamentos);
    const diasTrabalhados = apontamentos.filter((a) => !a.justificativaTipo).length;
    const diasParados = apontamentos.length - diasTrabalhados;

    // ── Cabeçalho ────────────────────────────────────────────────────────────
    doc.setFontSize(15); doc.setFont(undefined, 'bold');
    doc.text('Extrato do Contrato de Terceiro', 14, 18);
    doc.setFontSize(11);
    doc.text(`${c.numero || '—'} · ${STATUS[c.status] || STATUS.ativo}`, 14, 25);
    doc.setFont(undefined, 'normal'); doc.setFontSize(10);
    doc.text(`Obra: ${obraTxt}`, 14, 31);
    doc.text(`Terceiro: ${terceiro?.razaoSocial || '—'}${terceiro?.cnpj ? ` · CNPJ ${terceiro.cnpj}` : ''}`, 14, 36);
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`Emitido em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`, pageW - 14, 18, { align: 'right' });
    doc.setTextColor(0);

    const secao = (titulo, y) => {
        doc.setFontSize(11); doc.setFont(undefined, 'bold');
        // Título sozinho no pé da página fica órfão — empurra para a próxima.
        if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 18; }
        doc.text(titulo, 14, y);
        doc.setFont(undefined, 'normal');
        return y + 2;
    };
    const proxY = () => doc.lastAutoTable.finalY + 8;
    // columnStyles do autotable só valem para o corpo: cabeçalho e total herdam aqui
    // o alinhamento da coluna, senão o título de um valor fica longe do número.
    const tabela = (opts) => autoTable(doc, {
        styles: { fontSize: 8, cellPadding: 1.5 },
        margin: { left: 14, right: 14 },
        ...opts,
        didParseCell: (d) => {
            const halign = opts.columnStyles?.[d.column.index]?.halign;
            if (halign && d.section !== 'body') d.cell.styles.halign = halign;
            opts.didParseCell?.(d);
        },
    });

    // ── Resumo: dados do contrato + números ──────────────────────────────────
    const vigFimTxt = r.temAditivos && r.vigenciaFim !== c.vigenciaFim
        ? `${fmtDate(r.vigenciaFim)} (original ${fmtDate(c.vigenciaFim)})`
        : fmtDate(r.vigenciaFim);
    const valorTxt = r.temAditivos
        ? `${fmtBRL(r.valorTotal)} (original ${fmtBRL(r.valorOriginal)})`
        : fmtBRL(r.valorTotal);
    const progressoPct = (r.progresso || 0) * 100;

    tabela({
        startY: 41,
        theme: 'plain',
        body: [
            ['Vigência', `${fmtDate(c.vigenciaInicio)} a ${vigFimTxt}`, 'Modalidade', c.contractType === 'fechado' ? 'Valor fechado' : 'Por horas'],
            ['Valor do contrato', valorTxt, 'Horas contratadas', fmtHInt(r.horasContratadas)],
            ['Diesel abatido', `${fmtBRL(r.diesel)} (${fmtL(r.litros)})`, 'Horas executadas', `${fmtH(r.horasExecutadas)} (${fmtPct(progressoPct)})`],
            ['Pagamentos', fmtBRL(r.adiantamentos), 'Dias trabalhados / parados', `${diasTrabalhados} / ${diasParados}`],
            ['Saldo a pagar', fmtBRL(r.saldo), 'Máquinas', String(r.numMaquinas)],
        ],
        styles: { fontSize: 9, cellPadding: 1.2 },
        columnStyles: {
            0: { textColor: 110, cellWidth: 32 }, 1: { fontStyle: 'bold' },
            2: { textColor: 110, cellWidth: 42 }, 3: { fontStyle: 'bold' },
        },
        didParseCell: (d) => {
            if (d.section === 'body' && d.row.index === 4 && d.column.index === 1) {
                d.cell.styles.textColor = r.saldo > 0 ? [185, 28, 28] : r.saldo < 0 ? AZUL : VERDE;
            }
        },
    });
    let y = proxY();
    if (r.saldo < 0) {
        doc.setFontSize(8); doc.setTextColor(...AZUL);
        doc.text(`Diesel + pagamentos ultrapassaram o valor do contrato — o terceiro deve ${fmtBRL(-r.saldo)} à MAK.`, 14, y - 4);
        doc.setTextColor(0); y += 2;
    }

    // ── Extrato financeiro (conta corrente) ──────────────────────────────────
    // Crédito = valor do contrato (+ aditivos); débito = diesel e pagamentos.
    // O diesel entra AGRUPADO por mês para o extrato caber numa leitura; o detalhe
    // de cada abastecimento vem na seção própria mais abaixo.
    const movs = [];
    const deltaAditivos = r.aditivosValidos.reduce((a, ad) => a + (Number(ad.valorDelta) || 0), 0);
    if (r.temAditivos && Math.abs(r.valorOriginal + deltaAditivos - r.valorTotal) < 0.01) {
        movs.push({ d: toDate(c.vigenciaInicio), desc: 'Valor original do contrato', credito: r.valorOriginal });
        r.aditivosValidos.forEach((ad) => {
            if (!Number(ad.valorDelta)) return;
            movs.push({
                d: toDate(ad.assinadoEm || ad.created_at),
                desc: `Aditivo ${ad.numero} — ${ADITIVO_TIPO[ad.tipo] || ad.tipo}${ad.status === 'minuta' ? ' (minuta)' : ''}`,
                credito: Number(ad.valorDelta),
            });
        });
    } else {
        movs.push({ d: toDate(c.vigenciaInicio), desc: 'Valor do contrato', credito: r.valorTotal });
    }

    const dieselMes = new Map();
    abastecimentos.forEach((a) => {
        if (!a.date) return;
        const k = `${a.date.getFullYear()}-${String(a.date.getMonth() + 1).padStart(2, '0')}`;
        const cur = dieselMes.get(k) || { ultimo: a.date, label: mesLabel(a.date), n: 0, litros: 0, valor: 0 };
        if (a.date > cur.ultimo) cur.ultimo = a.date;
        cur.n += 1; cur.litros += a.litros; cur.valor += a.valor;
        dieselMes.set(k, cur);
    });
    dieselMes.forEach((m) => movs.push({
        d: m.ultimo,
        desc: `Diesel abatido — ${m.label} (${m.n} abastec., ${fmtL(m.litros)})`,
        debito: m.valor,
    }));
    pagamentos.forEach((p) => movs.push({
        d: toDate(p.data),
        desc: `Pagamento${p.descricao ? ` — ${p.descricao}` : ''}`,
        debito: Number(p.valor) || 0,
    }));
    // Crédito antes de débito no mesmo dia: o contrato existe antes do primeiro gasto.
    movs.sort((a, b) => ((a.d?.getTime() || 0) - (b.d?.getTime() || 0)) || ((b.credito ? 1 : 0) - (a.credito ? 1 : 0)));

    let saldoCorrente = 0;
    const extratoBody = movs.map((m) => {
        saldoCorrente += (m.credito || 0) - (m.debito || 0);
        return [
            m.d ? m.d.toLocaleDateString('pt-BR') : '—', m.desc,
            m.credito ? fmtBRL(m.credito) : '', m.debito ? fmtBRL(m.debito) : '', fmtBRL(saldoCorrente),
        ];
    });

    y = secao('Extrato financeiro', y);
    tabela({
        startY: y,
        head: [['Data', 'Lançamento', 'Crédito', 'Débito', 'Saldo']],
        body: extratoBody,
        foot: [['', 'Saldo a pagar', fmtBRL(r.valorTotal), fmtBRL(r.diesel + r.adiantamentos), fmtBRL(r.saldo)]],
        headStyles: { fillColor: ROXO },
        footStyles: { fillColor: ROXO_CLARO, textColor: 0, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 20 }, 2: { halign: 'right', cellWidth: 26 }, 3: { halign: 'right', cellWidth: 26 }, 4: { halign: 'right', cellWidth: 28 } },
        didParseCell: (d) => {
            if (d.section !== 'body') return;
            if (d.column.index === 2) d.cell.styles.textColor = VERDE;
            if (d.column.index === 3) d.cell.styles.textColor = [185, 28, 28];
        },
    });
    y = proxY();

    // ── Plano contratado ─────────────────────────────────────────────────────
    if (r.itensContratados.length) {
        const fechado = c.contractType === 'fechado';
        y = secao('Plano contratado', y);
        tabela({
            startY: y,
            head: [fechado ? ['Subgrupo', 'Horas', 'Observação'] : ['Subgrupo', 'Horas', 'Valor/hora', 'Subtotal']],
            body: r.itensContratados.map((it) => {
                const obs = it.consomeDe ? `Fora do plano — consome de ${it.consomeDe}` : '';
                return fechado
                    ? [it.type, fmtHInt(it.horas), obs || '—']
                    : [it.type + (obs ? `\n${obs}` : ''), fmtHInt(it.horas), fmtBRL(it.valorHora), fmtBRL(it.subtotal)];
            }),
            foot: [fechado
                ? ['Total', fmtHInt(r.horasContratadas), '']
                : ['Total', fmtHInt(r.horasContratadas), '', fmtBRL(r.itensContratados.reduce((a, it) => a + it.subtotal, 0))]],
            headStyles: { fillColor: ROXO },
            footStyles: { fillColor: ROXO_CLARO, textColor: 0, fontStyle: 'bold' },
            columnStyles: { 1: { halign: 'right' }, 2: { halign: fechado ? 'left' : 'right' }, 3: { halign: 'right' } },
        });
        y = proxY();
    }

    // ── Aditivos ─────────────────────────────────────────────────────────────
    if (r.aditivosValidos.length) {
        y = secao('Termos aditivos', y);
        tabela({
            startY: y,
            head: [['Número', 'Tipo', 'Situação', 'Horas', 'Valor', 'Nova vigência']],
            body: r.aditivosValidos.map((ad) => [
                ad.numero, ADITIVO_TIPO[ad.tipo] || ad.tipo,
                ad.status === 'assinado' ? `Assinado ${fmtDate(ad.assinadoEm)}` : 'Minuta',
                Number(ad.horasDelta) ? `${Number(ad.horasDelta) > 0 ? '+' : ''}${fmtHInt(ad.horasDelta)}` : '—',
                Number(ad.valorDelta) ? `${Number(ad.valorDelta) > 0 ? '+' : ''}${fmtBRL(ad.valorDelta)}` : '—',
                ad.novaVigenciaFim ? fmtDate(ad.novaVigenciaFim) : '—',
            ]),
            headStyles: { fillColor: ROXO },
            columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
        });
        y = proxY();
    }

    // ── Equipamentos ─────────────────────────────────────────────────────────
    y = secao('Equipamentos', y);
    tabela({
        startY: y,
        head: [['Máquina', 'Subgrupo', 'Horas', 'Litros', 'Diesel']],
        body: r.equipamentos.length
            ? [...r.equipamentos]
                .sort((a, b) => b.horas - a.horas)
                .map((e) => [maquinaLabel(e.vehicle), e.vehicle.sub_tipo || e.vehicle.tipo || '—', fmtH(e.horas), fmtL(e.litros), fmtBRL(e.diesel)])
            : [['Nenhuma máquina vinculada', '', '', '', '']],
        foot: [['Total', '', fmtH(r.horasExecutadas), fmtL(r.litros), fmtBRL(r.diesel)]],
        headStyles: { fillColor: ROXO },
        footStyles: { fillColor: ROXO_CLARO, textColor: 0, fontStyle: 'bold' },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });
    y = proxY();

    // ── Horas por mês ────────────────────────────────────────────────────────
    if (porMes.length) {
        y = secao('Horas por mês', y);
        tabela({
            startY: y,
            head: [['Mês', 'Dias trabalhados', 'Dias parados', 'Horas']],
            body: porMes.map((m) => [m.label, String(m.dias), String(m.diasParados), fmtH(m.horas)]),
            foot: [['Total', String(diasTrabalhados), String(diasParados), fmtH(r.horasExecutadas)]],
            headStyles: { fillColor: VERDE },
            footStyles: { fillColor: VERDE_CLARO, textColor: 0, fontStyle: 'bold' },
            columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        });
        y = proxY();
    }

    // ── Apontamentos de horas (dia a dia) ────────────────────────────────────
    // Do mais antigo ao mais recente: é a ordem em que o terceiro confere o boletim.
    y = secao('Horas lançadas', y);
    tabela({
        startY: y,
        head: [['Data', 'Máquina', 'Operador', 'Horas', 'Ocorrência / observação']],
        body: apontamentos.length
            ? [...apontamentos].reverse().map((a) => [
                fmtDate(a.date), maquinaLabel(a.vehicle), a.employeeName || '—',
                a.justificativaTipo ? '—' : fmtH(a.horas),
                [a.justificativaTipo ? `Parado: ${a.justificativaTipo}` : '', a.observation || ''].filter(Boolean).join(' — ') || '',
            ])
            : [['—', 'Nenhum apontamento', '', '', '']],
        foot: [['', '', 'Total', fmtH(r.horasExecutadas), '']],
        headStyles: { fillColor: VERDE },
        footStyles: { fillColor: VERDE_CLARO, textColor: 0, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 20 }, 3: { halign: 'right', cellWidth: 18 }, 4: { cellWidth: 60 } },
        didParseCell: (d) => {
            if (d.section === 'body' && d.column.index === 4 && String(d.cell.raw).startsWith('Parado')) {
                d.cell.styles.textColor = [180, 83, 9];
            }
        },
    });
    y = proxY();

    // ── Pagamentos ───────────────────────────────────────────────────────────
    y = secao('Pagamentos', y);
    const pagsOrdenados = [...pagamentos].sort((a, b) => (toDate(a.data)?.getTime() || 0) - (toDate(b.data)?.getTime() || 0));
    tabela({
        startY: y,
        head: [['Data', 'Referência', 'Lançado por', 'Valor']],
        body: pagsOrdenados.length
            ? pagsOrdenados.map((p) => [fmtDate(p.data), p.descricao || '—', p.created_by_email || '—', fmtBRL(p.valor)])
            : [['—', 'Nenhum pagamento', '', fmtBRL(0)]],
        foot: [['', '', 'Total', fmtBRL(r.adiantamentos)]],
        headStyles: { fillColor: ROXO },
        footStyles: { fillColor: ROXO_CLARO, textColor: 0, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 20 }, 3: { halign: 'right' } },
    });
    y = proxY();

    // ── Abastecimentos ───────────────────────────────────────────────────────
    y = secao('Abastecimentos (diesel abatido)', y);
    const abastOrdenados = [...abastecimentos].reverse();
    tabela({
        startY: y,
        head: [['Data', 'Máquina', 'Fonte', 'Litros', 'R$/L', 'Valor']],
        body: abastOrdenados.length
            ? abastOrdenados.map((a) => [
                fmtDate(a.date), maquinaLabel(a.vehicle), a.fonte === 'comboio' ? 'Comboio' : 'Posto',
                fmtL(a.litros), a.litros > 0 ? fmtBRL(a.valor / a.litros) : '—', fmtBRL(a.valor),
            ])
            : [['—', 'Nenhum abastecimento', '', '', '', fmtBRL(0)]],
        foot: [['', '', 'Total', fmtL(r.litros), r.litros > 0 ? fmtBRL(r.diesel / r.litros) : '—', fmtBRL(r.diesel)]],
        headStyles: { fillColor: AZUL },
        footStyles: { fillColor: AZUL_CLARO, textColor: 0, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 20 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    });

    // ── Rodapé em todas as páginas ───────────────────────────────────────────
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i += 1) {
        doc.setPage(i);
        doc.setFontSize(7); doc.setTextColor(140);
        const h = doc.internal.pageSize.getHeight();
        doc.text(`${c.numero || ''} · ${obraTxt} · ${terceiro?.razaoSocial || ''}`, 14, h - 8);
        doc.text(`Página ${i} de ${total}`, pageW - 14, h - 8, { align: 'right' });
    }
    doc.setTextColor(0);

    // Mesma ordem do arquivo do contrato (terceiro_obra_numero), com prefixo de extrato.
    const limpa = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const partes = [limpa(terceiro?.razaoSocial || 'terceiro'), limpa(obraTxt), limpa(c.numero)].filter(Boolean);
    doc.save(`extrato_${partes.join('_')}.pdf`);
};
