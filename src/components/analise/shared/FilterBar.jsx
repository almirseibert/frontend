// ─────────────────────────────────────────────────────────────────────────────
// Barra de filtros ÚNICA, renderizada pelo shell e compartilhada pelas abas.
// O intervalo de datas e a obra são estado do shell → persistem ao trocar de
// aba (antes cada aba tinha seu próprio filtro e você reconfigurava tudo).
// Os presets são passados pela aba ativa, porque financeiro pensa em meses e
// físico pensa em dias — o atalho muda, o intervalo persiste.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { RefreshCw } from 'lucide-react';
import { C } from './tokens';
import SearchableObraSelect from '../../SearchableObraSelect';

const toISO = (d) => {
    const x = new Date(d); x.setHours(12, 0, 0, 0);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const todayISO = () => toISO(new Date());
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); d.setDate(1); return toISO(d); };
const startOfYear = () => `${new Date().getFullYear()}-01-01`;

// ─── Presets por aba (o range persiste; o atalho é contextual) ───────────────
export const FIN_PRESETS = [
    { id: '6m',  label: '6 meses',   range: () => ({ start: monthsAgo(5),  end: todayISO() }) },
    { id: '12m', label: '12 meses',  range: () => ({ start: monthsAgo(11), end: todayISO() }) },
    { id: 'ytd', label: 'Ano atual', range: () => ({ start: startOfYear(), end: todayISO() }) },
];

// Físico agora pensa em MESES (objetivo: histórico longo). "Mês atual" e "Mês
// passado" mantêm a granularidade diária; 3/6/12 meses acionam a visão mensal.
export const FIS_PRESETS = (() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const firstOf = (yy, mm) => toISO(new Date(yy, mm, 1));
    const lastOf = (yy, mm) => toISO(new Date(yy, mm + 1, 0));
    return [
        { id: 'mtd',  label: 'Mês atual',   range: () => ({ start: firstOf(y, m),     end: todayISO() }) },
        { id: 'prev', label: 'Mês passado', range: () => ({ start: firstOf(y, m - 1), end: lastOf(y, m - 1) }) },
        { id: '3m',   label: '3 meses',     range: () => ({ start: monthsAgo(2),  end: todayISO() }) },
        { id: '6m',   label: '6 meses',     range: () => ({ start: monthsAgo(5),  end: todayISO() }) },
        { id: '12m',  label: '12 meses',    range: () => ({ start: monthsAgo(11), end: todayISO() }) },
    ];
})();

export const FIS_DEFAULT = FIS_PRESETS.find(p => p.id === '3m');

// Descobre qual preset (se algum) corresponde ao range atual — para destacar o pill.
export const matchPreset = (presets, range) => {
    const hit = presets.find(p => {
        const r = p.range();
        return r.start === range.start && r.end === range.end;
    });
    return hit ? hit.id : 'custom';
};

export default function FilterBar({
    range, onRange, presets, activePreset,
    obras = [], obraId = 'all', onObra, showObra = false,
    onRefresh, scopeLabel,
}) {
    return (
        <div className="rounded-xl border shadow-sm p-3 mb-5 flex flex-wrap items-center gap-3"
            style={{ background: C.surface, borderColor: C.border }}>
            {/* Presets (contextuais à aba ativa) */}
            <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: C.goldLt }}>
                {presets.map(p => (
                    <button key={p.id} onClick={() => onRange(p.range(), p.id)}
                        className="text-xs font-bold px-3 py-1.5 rounded-md transition-colors"
                        style={activePreset === p.id ? { background: C.gold, color: '#fff' } : { color: C.textMid }}>
                        {p.label}
                    </button>
                ))}
                {activePreset === 'custom' && (
                    <span className="text-xs font-bold px-3 py-1.5 rounded-md" style={{ color: C.gold }}>
                        Personalizado
                    </span>
                )}
            </div>

            {/* Intervalo de datas */}
            <div className="flex items-center gap-2 text-xs" style={{ color: C.textMid }}>
                <input type="date" value={range.start} max={range.end}
                    onChange={(e) => onRange({ start: e.target.value, end: range.end }, 'custom')}
                    className="border rounded-md px-2 py-1.5 outline-none" style={{ borderColor: C.border }} />
                <span>até</span>
                <input type="date" value={range.end} min={range.start} max={todayISO()}
                    onChange={(e) => onRange({ start: range.start, end: e.target.value }, 'custom')}
                    className="border rounded-md px-2 py-1.5 outline-none" style={{ borderColor: C.border }} />
            </div>

            {/* Obra (só na aba financeira) + atualizar */}
            <div className="flex items-center gap-2 ml-auto">
                {showObra && (
                    <div className="flex items-center gap-2 min-w-[240px]">
                        <SearchableObraSelect obras={obras} value={obraId === 'all' ? '' : obraId}
                            onChange={(o) => onObra(o ? String(o.id) : 'all')}
                            placeholder="Todas as obras — filtrar por uma…" className="flex-1" />
                        {obraId !== 'all' && (
                            <button onClick={() => onObra('all')} className="text-xs font-bold whitespace-nowrap" style={{ color: C.gold }}>
                                Ver todas
                            </button>
                        )}
                    </div>
                )}
                {onRefresh && (
                    <button onClick={onRefresh} title="Atualizar"
                        className="p-2 rounded-lg border hover:bg-slate-50"
                        style={{ background: '#fff', borderColor: C.border, color: C.textMid }}>
                        <RefreshCw size={16} />
                    </button>
                )}
            </div>
            {scopeLabel && (
                <p className="w-full" style={{ fontSize: 12, color: C.textSub }}>{scopeLabel}</p>
            )}
        </div>
    );
}
