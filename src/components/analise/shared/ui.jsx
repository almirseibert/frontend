// ─────────────────────────────────────────────────────────────────────────────
// Primitivas visuais compartilhadas pelas duas abas de "Desempenho do negócio".
// Antes cada aba tinha sua própria versão de KPI, delta, barra e estados de
// loading/erro/vazio. Agora há UMA implementação de cada, tematizada pelos
// tokens de marca (`tokens.js`).
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { Loader, AlertCircle, Activity } from 'lucide-react';
import { C, utilTone } from './tokens';

// ─── Card base (chrome quente) ───────────────────────────────────────────────
export const Card = ({ className = '', children, style }) => (
    <div className={`rounded-xl border shadow-sm ${className}`}
        style={{ background: C.surface, borderColor: C.border, ...style }}>
        {children}
    </div>
);

// ─── Delta vs. período anterior — texto inline discreto ──────────────────────
export const DeltaBadge = ({ value, good = true, suffix = '%' }) => {
    if (value == null) return null;
    const up = value >= 0;
    const color = (up === good) ? C.green : C.red;
    return (
        <span style={{ color, fontWeight: 700, whiteSpace: 'nowrap' }} title="vs. período anterior de mesmo tamanho">
            {up ? '▲' : '▼'} {Math.abs(value).toFixed(1)}{suffix}
        </span>
    );
};

// ─── Tile de KPI (usado nas duas abas) ───────────────────────────────────────
// `dot` OU `icon` para o marcador; `delta` = { value, good, suffix }.
export const KpiCard = ({ icon: Icon, label, dot, value, valueColor, delta, sub }) => (
    <div className="rounded-xl border p-3.5" style={{ background: C.surface, borderColor: C.border }}>
        <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: C.textSub, fontWeight: 600 }}>
            {dot && <span style={{ width: 8, height: 8, borderRadius: 2, background: dot, display: 'inline-block' }} />}
            {Icon && <Icon size={13} style={{ color: C.gold }} />}
            {label}
        </div>
        <div style={{ fontSize: 23, fontWeight: 800, color: valueColor || C.text, marginTop: 4, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: C.textSub, marginTop: 3 }}>
            {delta && <DeltaBadge {...delta} />}
            {delta && sub ? ' · ' : ''}
            {sub}
        </div>
    </div>
);

// ─── Barra de aproveitamento (0–100%) ────────────────────────────────────────
export const UtilBar = ({ pct }) => {
    const tone = utilTone(pct);
    const safe = Math.max(0, Math.min(100, Number(pct) || 0));
    return (
        <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: C.goldLt }}>
            <div className={`h-2 rounded-full ${tone.bg}`} style={{ width: `${safe}%` }} />
        </div>
    );
};

// ─── Barra horizontal rotulada (composição por categoria/região) ─────────────
export const HBar = ({ nome, valor, sub, pct, color, valColor }) => (
    <div className="mb-2.5">
        <div className="flex items-center justify-between mb-1" style={{ fontSize: 12 }}>
            <span style={{ color: C.textMid }}>{nome}</span>
            <span style={{ color: valColor || C.text, fontWeight: 700 }}>
                {valor}{sub && <span style={{ color: C.textSub, fontWeight: 500 }}> · {sub}</span>}
            </span>
        </div>
        <div className="w-full rounded-full h-2" style={{ background: C.goldLt }}>
            <div className="h-2 rounded-full" style={{ width: `${Math.min(pct || 0, 100)}%`, background: color, opacity: 0.85 }} />
        </div>
    </div>
);

// ─── Estados unificados: loading / erro / vazio ──────────────────────────────
export const StateBlock = ({
    loading, error, empty, onRetry,
    loadingText = 'Carregando…',
    emptyText = 'Sem dados no período selecionado.',
    emptyIcon: EmptyIcon = Activity,
}) => {
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
                <Loader className="animate-spin" size={32} style={{ color: C.gold }} />
                <p style={{ color: C.textSub, fontSize: 13 }}>{loadingText}</p>
            </div>
        );
    }
    if (error) {
        return (
            <Card className="p-10 text-center">
                <AlertCircle size={40} className="mx-auto mb-3" style={{ color: C.red, opacity: 0.6 }} />
                <p style={{ color: C.textMid }}>{error}</p>
                {onRetry && (
                    <button onClick={onRetry} className="mt-3 text-sm font-bold" style={{ color: C.gold }}>
                        Tentar novamente
                    </button>
                )}
            </Card>
        );
    }
    if (empty) {
        return (
            <Card className="p-16 text-center">
                <EmptyIcon size={56} className="mx-auto mb-4" style={{ color: C.textSub, opacity: 0.3 }} />
                <p style={{ color: C.textSub }}>{emptyText}</p>
            </Card>
        );
    }
    return null;
};
