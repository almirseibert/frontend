// ─────────────────────────────────────────────────────────────────────────────
// Fonte ÚNICA de verdade visual das abas de "Desempenho do negócio".
// Antes: a aba financeira usava um objeto `C` inline e a física usava classes
// Tailwind com paleta fria (slate/emerald). Isso fazia as duas abas parecerem
// dois produtos. Agora ambas consomem estes tokens → um só sistema.
//
// Paleta = MARCA quente (dourado/creme). Dourado é cor de cabeçalho, não de
// dado — séries de dado usam o par validado azul×laranja (CVD-safe).
// ─────────────────────────────────────────────────────────────────────────────

export const C = {
    gold: '#9E7A42', goldLt: '#f5efe4', bg: '#f5f3ef', border: '#e5e0d8',
    surface: '#fdfcfa',
    text: '#1e1a14', textMid: '#5a4e3a', textSub: '#9a8c7a',
    // Séries de dado
    receita: '#2a78d6', custo: '#eb6834',
    // Status (verde/amarelo/laranja/vermelho unificados entre as duas abas)
    green: '#16a34a', yellow: '#ca8a04', orange: '#ea580c', red: '#dc2626',
};

// ─── Formatadores (unificados — antes divergiam entre abas) ──────────────────
// Horas: uma casa decimal no máximo, separador pt-BR. "12,3h" e "1.234h".
export const fmtH = (v) =>
    `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`;

export const fmtPct = (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`);

export const fmtBRL = (v) =>
    `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

export const fmtBRLCompact = (v) => {
    const n = Number(v) || 0;
    const s = n < 0 ? '-' : '';
    const a = Math.abs(n);
    if (a >= 1_000_000) return `${s}R$ ${(a / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (a >= 1_000) return `${s}R$ ${(a / 1_000).toFixed(0)}k`;
    return `${s}R$ ${a.toFixed(0)}`;
};

export const fmtReal2 = (v) => (v == null ? '—' : `R$ ${Number(v).toFixed(2).replace('.', ',')}`);

export const fmtDateBR = (iso) => (iso ? String(iso).split('-').reverse().join('/') : '');

// ─── Limiares de status ──────────────────────────────────────────────────────
// Margem financeira: 3 faixas. Aproveitamento físico: 4 faixas.
export const margemColor = (pct) =>
    pct == null ? C.textSub : pct >= 20 ? C.green : pct >= 5 ? C.yellow : C.red;

// Cor hex do aproveitamento (para SVG / estilos inline)
export const aproveitamentoColor = (pct) =>
    pct >= 80 ? C.green : pct >= 60 ? C.yellow : pct >= 40 ? C.orange : C.red;

// Classes Tailwind do aproveitamento (barras/badges). Família `green` (não
// `emerald`) para casar com o verde de status usado na aba financeira.
export const utilTone = (pct) => {
    if (pct >= 80) return { text: 'text-green-700',  bg: 'bg-green-500',  soft: 'bg-green-50',  border: 'border-green-200' };
    if (pct >= 60) return { text: 'text-yellow-700', bg: 'bg-yellow-500', soft: 'bg-yellow-50', border: 'border-yellow-200' };
    if (pct >= 40) return { text: 'text-orange-700', bg: 'bg-orange-500', soft: 'bg-orange-50', border: 'border-orange-200' };
    return           { text: 'text-red-700',    bg: 'bg-red-500',    soft: 'bg-red-50',    border: 'border-red-200' };
};
