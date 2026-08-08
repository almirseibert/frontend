import React from 'react';
import { GRAVIDADES, GRAVIDADE_LEGENDA, getGravidade } from '../../utils/relatoGravidade';

/**
 * Chip da letra de gravidade (A/B/C/D) da ficha FRM-MAN-001, com a legenda
 * completa no title — a letra sozinha não diz nada a quem não decorou o quadro.
 */
export const GravidadeBadge = ({ gravidade, size = 'md', showLabel = false }) => {
    const g = getGravidade(gravidade);
    if (!g) return <span className="text-xs text-gray-400">—</span>;

    const dims = size === 'sm'
        ? 'w-5 h-5 text-[10px]'
        : size === 'lg' ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-xs';

    return (
        <span className="inline-flex items-center gap-1.5" title={`${g.label} — ${g.descricao}`}>
            <span className={`${dims} ${g.chip} rounded font-bold flex items-center justify-center flex-shrink-0`}>
                {String(gravidade).toUpperCase()}
            </span>
            {showLabel && (
                <span className={`text-[11px] font-bold ${g.texto} leading-tight`}>{g.label}</span>
            )}
        </span>
    );
};

/**
 * Quadro de legenda igual ao da seção 3 do formulário impresso. Fica junto da
 * grade de itens para o gestor conferir a classificação enquanto digita.
 */
export const GravidadeLegenda = ({ compact = false }) => (
    <div className={`grid grid-cols-1 ${compact ? 'md:grid-cols-4' : 'md:grid-cols-2'} gap-2`}>
        {GRAVIDADES.map(letra => {
            const g = GRAVIDADE_LEGENDA[letra];
            return (
                <div key={letra} className={`flex items-start gap-2 p-2 rounded-lg border ${g.borda} ${g.fundo}`}>
                    <span className={`w-6 h-6 ${g.chip} rounded font-bold text-xs flex items-center justify-center flex-shrink-0`}>
                        {letra}
                    </span>
                    <div className="min-w-0">
                        <div className={`text-[11px] font-bold ${g.texto} leading-tight`}>{g.label}</div>
                        {!compact && (
                            <div className="text-[10px] text-gray-500 leading-snug mt-0.5">{g.descricao}</div>
                        )}
                    </div>
                </div>
            );
        })}
    </div>
);

export default GravidadeBadge;
