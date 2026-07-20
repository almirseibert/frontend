import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { HardHat, Printer, Loader } from 'lucide-react';
import apiClient from '../../services/apiClient';

// ── Constantes espelhadas de PlanejamentoPage.js ──────────────────────────────
// (copiadas pois não são exportadas de lá; a lógica de fase deve bater 1:1 com a
//  página para que as obras caiam nas mesmas colunas)

const PRE_ACTIVE = ['radar', 'planejada', 'mobilizacao'];

const COLUNAS = [
    { id: 'radar',       label: 'No radar',       sub: 'sem contrato',                rgb: [148, 163, 184] },
    { id: 'planejada',   label: 'Plano definido', sub: 'plano de trabalho registrado', rgb: [245, 158, 11] },
    { id: 'mobilizacao', label: 'Em mobilização', sub: 'equipamento alocado',         rgb: [139, 92, 246] },
    { id: 'and_0_30',    label: 'Em operação',    sub: '0–30%',                       rgb: [16, 185, 129] },
    { id: 'and_30_70',   label: 'Em operação',    sub: '30–70%',                      rgb: [14, 165, 233] },
    { id: 'terminando',  label: 'Terminando',     sub: '≥70% ou ≤15 dias',            rgb: [239, 68, 68] },
    { id: 'finalizada',  label: 'Finalizadas',    sub: 'últimos 30 dias',             rgb: [156, 163, 175] },
];

const colunaDaObra = (o) => {
    if (o.status === 'finalizada') return 'finalizada';
    if (PRE_ACTIVE.includes(o.status)) return o.status;
    if (o.terminando) return 'terminando';
    if (o.faixa === '30-70') return 'and_30_70';
    if (o.faixa === '70-100') return 'terminando';
    return 'and_0_30';
};

const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';

// Cores RGB para o PDF (jsPDF não entende Tailwind).
const COR = {
    texto:      [30, 26, 20],
    cinzaMed:   [180, 180, 180],
    discrep:    [220, 38, 38],   // red-600
    ok:         [22, 101, 52],   // green-800
};

// ── Helpers de agrupamento (espelham porColuna da página) ─────────────────────

const agruparPorColuna = (obras) => {
    const m = {};
    COLUNAS.forEach(c => { m[c.id] = []; });
    (obras || []).forEach(o => {
        const col = colunaDaObra(o);
        if (m[col]) m[col].push(o);
    });
    // Pré-obra: ordena por previsão de início
    ['radar', 'planejada', 'mobilizacao'].forEach(c => {
        m[c].sort((a, b) => (a.dataInicioPrevisto || '9999') > (b.dataInicioPrevisto || '9999') ? 1 : -1);
    });
    return m;
};

// Contagem de máquinas alocadas por subgrupo → "Escavadeira 2, Trator 1"
const resumoMaquinas = (obra) => {
    const m = {};
    (obra.maquinasAlocadas || []).forEach(a => { m[a.subgrupo] = (m[a.subgrupo] || 0) + 1; });
    const entradas = Object.entries(m);
    if (!entradas.length) return '—';
    return entradas.map(([sub, q]) => `${sub} ${q}`).join(', ');
};

// Demanda projetada (pré-obra) → "Escavadeira 1→3 · 45d"
const resumoDemanda = (obra) => {
    const d = obra.perfilDemanda || [];
    if (!d.length) return '—';
    return d.map(x => {
        const maq = x.regime === 'escalonado'
            ? `${x.maquinasIniciais}→${x.maquinasPico}`
            : `${x.maquinasPico}`;
        return `${x.subgrupo} ${maq} · ${x.diasEstimados}d`;
    }).join('\n');
};

// Data relevante conforme a fase (mesma decisão do card, PlanejamentoPage 79-83)
const dataRelevante = (obra) => {
    if (PRE_ACTIVE.includes(obra.status)) return `Início: ${fmtData(obra.dataInicioPrevisto)}`;
    if (obra.status === 'finalizada') return `Fim: ${fmtData(obra.dataFim)}`;
    return `Fim prev.: ${fmtData(obra.dataFimPrevisto)}${obra.diasProjetados != null ? ` (proj. ${obra.diasProjetados}d)` : ''}`;
};

const alertaObra = (obra) => {
    const flags = [];
    if (obra.terminando) flags.push('terminando');
    if (obra.totalContratado === 0 && obra.contractType === 'horas' && obra.status !== 'finalizada') {
        flags.push('sem plano de horas');
    }
    return flags.length ? flags.join(' · ') : '';
};

// ── Geração do PDF ────────────────────────────────────────────────────────────

const gerarPDF = (data, janela) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margem = 14;
    const contentW = pageW - margem * 2;

    const obras = data.obras || [];
    const balanco = data.balanco || [];
    const porColuna = agruparPorColuna(obras);
    const hoje = new Date();

    // ─── Capa / Resumo ───
    doc.setFontSize(16);
    doc.setTextColor(...COR.texto);
    doc.text('Relatório de Planejamento de Obras', margem, 18);

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
        `Janela de projeção: ${janela} dias  ·  Gerado em ${hoje.toLocaleDateString('pt-BR')} ${hoje.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
        margem, 25
    );

    // KPIs
    const preObra = obras.filter(o => PRE_ACTIVE.includes(o.status)).length;
    const emOperacao = obras.filter(o => !PRE_ACTIVE.includes(o.status) && o.status !== 'finalizada' && !o.terminando).length;
    const terminando = obras.filter(o => o.status !== 'finalizada' && o.terminando).length;
    const finalizadas = porColuna.finalizada.length;
    const deficits = balanco.filter(b => b.saldo < 0).length;

    const kpis = [
        { label: 'Obras (total)',    v: String(obras.length) },
        { label: 'Pré-obra',         v: String(preObra) },
        { label: 'Em operação',      v: String(emOperacao) },
        { label: 'Terminando',       v: String(terminando) },
        { label: 'Finalizadas',      v: String(finalizadas) },
        { label: 'Subgrupos déficit', v: String(deficits) },
    ];
    const kpiW = contentW / kpis.length;
    const kpiY = 31;
    doc.setDrawColor(...COR.cinzaMed);
    kpis.forEach((k, i) => {
        const xx = margem + i * kpiW;
        doc.rect(xx, kpiY, kpiW - 2, 14);
        doc.setFontSize(13);
        doc.setTextColor(...(k.label === 'Subgrupos déficit' && deficits > 0 ? COR.discrep : COR.texto));
        doc.text(k.v, xx + 3, kpiY + 7);
        doc.setFontSize(6.5);
        doc.setTextColor(110);
        doc.text(k.label, xx + 3, kpiY + 11.5);
    });

    // ─── Seção 1: Quadro por fase ───
    doc.setFontSize(12);
    doc.setTextColor(...COR.texto);
    doc.text('Quadro — obras por fase', margem, kpiY + 24);
    let y = kpiY + 28;

    COLUNAS.forEach(col => {
        const lista = porColuna[col.id];
        if (!lista.length) return;

        // Cabeçalho de fase colorido
        if (y + 20 > pageH - margem) { doc.addPage(); y = margem; }
        doc.setFillColor(...col.rgb);
        doc.rect(margem, y, contentW, 6, 'F');
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(`${col.label} — ${col.sub}  (${lista.length})`, margem + 2, y + 4.2);
        y += 7;

        const isPre = PRE_ACTIVE.includes(col.id);
        const rows = lista.map(o => [
            o.nome || '—',
            o.orgao_contratante || '—',
            o.pctConsumido != null ? `${o.pctConsumido.toFixed(0)}%` : '—',
            dataRelevante(o),
            isPre ? resumoDemanda(o) : resumoMaquinas(o),
            alertaObra(o) || '—',
        ]);

        autoTable(doc, {
            startY: y,
            margin: { left: margem, right: margem },
            head: [['Obra', 'Órgão', '% cons.', 'Prazo', isPre ? 'Demanda' : 'Máquinas alocadas', 'Alertas']],
            body: rows,
            styles: { fontSize: 7, cellPadding: 1.3, overflow: 'linebreak', valign: 'middle' },
            headStyles: { fillColor: [60, 55, 48], textColor: [255, 255, 255], fontSize: 7 },
            columnStyles: {
                0: { cellWidth: 40, fontStyle: 'bold' },
                1: { cellWidth: 28 },
                2: { cellWidth: 14, halign: 'center' },
                3: { cellWidth: 34 },
                5: { cellWidth: 24 },
            },
            didParseCell: (h) => {
                if (h.section === 'body' && h.column.index === 5 && h.cell.raw !== '—') {
                    h.cell.styles.textColor = COR.discrep;
                    h.cell.styles.fontStyle = 'bold';
                }
            },
        });
        y = doc.lastAutoTable.finalY + 5;
    });

    if (!obras.length) {
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text('Nenhuma obra na projeção para esta janela.', margem, y + 4);
    }

    // ─── Seção 2: Balanço por subgrupo ───
    doc.addPage();
    doc.setFontSize(12);
    doc.setTextColor(...COR.texto);
    doc.text('Balanço — demanda × frota por subgrupo', margem, 18);
    doc.setFontSize(8.5);
    doc.setTextColor(110);
    doc.text(
        `Demanda (obras entrando) × oferta (máquinas liberando + disponíveis) — próximos ${janela} dias.`,
        margem, 24
    );

    if (!balanco.length) {
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(
            'Sem demanda planejada nem obras terminando na janela. Cadastre obras futuras',
            margem, 34
        );
        doc.text(
            '(fase No radar / Plano definido) para alimentar o balanço.',
            margem, 39
        );
    } else {
        const rows = balanco.map(b => [
            b.subgrupo,
            String(b.demanda),
            String(b.liberando),
            String(b.disponiveis),
            (b.saldo >= 0 ? '+' : '') + String(b.saldo),
            b.saldo < 0
                ? `DÉFICIT: ${Math.abs(b.saldo)} máq → alugar/terceirizar`
                : `Saldo positivo: +${b.saldo} máq`,
        ]);

        autoTable(doc, {
            startY: 30,
            margin: { left: margem, right: margem },
            head: [['Subgrupo', 'Demanda', 'Liberando', 'Disponíveis', 'Saldo', 'Situação']],
            body: rows,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [60, 55, 48], textColor: [255, 255, 255] },
            columnStyles: {
                0: { cellWidth: 45, fontStyle: 'bold' },
                1: { halign: 'center' },
                2: { halign: 'center' },
                3: { halign: 'center' },
                4: { halign: 'center', fontStyle: 'bold' },
            },
            didParseCell: (h) => {
                if (h.section !== 'body') return;
                const saldo = balanco[h.row.index]?.saldo;
                if (saldo < 0 && (h.column.index === 4 || h.column.index === 5)) {
                    h.cell.styles.textColor = COR.discrep;
                    h.cell.styles.fontStyle = 'bold';
                } else if (saldo >= 0 && (h.column.index === 4 || h.column.index === 5)) {
                    h.cell.styles.textColor = COR.ok;
                }
            },
        });
    }

    // Rodapé com paginação
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pages}`, pageW - margem, pageH - 6, { align: 'right' });
        doc.text('MAK Frotas — Planejamento', margem, pageH - 6);
    }

    const stamp = hoje.toISOString().slice(0, 10);
    doc.save(`planejamento_obras_${janela}d_${stamp}.pdf`);
};

// ── Componente ────────────────────────────────────────────────────────────────

const PlanejamentoObrasReport = () => {
    const [janela, setJanela] = useState(60);
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState('');
    const [preview, setPreview] = useState(null);

    const handleGerar = async () => {
        setErro('');
        setLoading(true);
        try {
            const data = await apiClient.getPlanejamentoObras(janela);
            const obras = data?.obras || [];
            const balanco = data?.balanco || [];
            if (!obras.length && !balanco.length) {
                setErro('Sem dados de planejamento para esta janela.');
                setPreview(null);
                return;
            }
            gerarPDF(data, janela);
            setPreview({
                obras: obras.length,
                deficits: balanco.filter(b => b.saldo < 0).length,
                subgrupos: balanco.length,
                janela,
            });
        } catch (e) {
            setErro(e.message || 'Erro ao buscar o planejamento.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="flex items-center gap-2 mb-1">
                <HardHat size={20} className="text-yellow-600" />
                <h2 className="text-lg font-bold" style={{ color: '#1e1a14' }}>Planejamento de Obras</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">
                Quadro das obras por fase (No radar → Finalizadas) + balanço de demanda × frota por subgrupo,
                em PDF — o mesmo recorte da página de Planejamento.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Janela de projeção</label>
                    <select
                        value={janela}
                        onChange={e => setJanela(parseInt(e.target.value, 10))}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-yellow-500"
                    >
                        <option value={30}>30 dias</option>
                        <option value={60}>60 dias</option>
                        <option value={90}>90 dias</option>
                    </select>
                </div>
            </div>

            {erro && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
                    {erro}
                </div>
            )}

            <button
                onClick={handleGerar}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-white font-semibold text-sm disabled:opacity-50"
                style={{ background: '#9E7A42' }}
            >
                {loading ? <Loader size={16} className="animate-spin" /> : <Printer size={16} />}
                {loading ? 'Gerando...' : 'Gerar PDF'}
            </button>

            {preview && (
                <div className="mt-6 text-xs text-gray-500">
                    Último relatório gerado: janela de <strong>{preview.janela} dias</strong> ·{' '}
                    {preview.obras} obra(s) · {preview.subgrupos} subgrupo(s) no balanço ·{' '}
                    {preview.deficits} em déficit.
                </div>
            )}
        </div>
    );
};

export default PlanejamentoObrasReport;
