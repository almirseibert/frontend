import React, { useRef, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { GRAVIDADES, GRAVIDADE_LEGENDA } from '../../utils/relatoGravidade';
import { GravidadeLegenda } from './GravidadeBadge';

// Seção 4 da ficha: "ITENS / PROBLEMAS IDENTIFICADOS".
//
// A ficha de papel tem 10 linhas e diz "use o verso caso haja mais ocorrências"
// — aqui não há teto rígido, o gestor adiciona quantas precisar.
//
// Otimizado para digitação em lote, que é o gargalo real do processo: Tab anda
// pelas células, Enter na última coluna já cria a linha seguinte e foca nela.

const RelatoItemGrid = ({ itens, onChange, disabled = false }) => {
    const componenteRefs = useRef({});

    const setItem = useCallback((index, patch) => {
        onChange(itens.map((it, i) => (i === index ? { ...it, ...patch } : it)));
    }, [itens, onChange]);

    const addLinha = useCallback((focar = true) => {
        const novo = { itemComponente: '', descricaoProblema: '', gravidade: '' };
        const proximoIndex = itens.length;
        onChange([...itens, novo]);
        if (focar) {
            // O input só existe depois do render — daí o rAF.
            requestAnimationFrame(() => componenteRefs.current[proximoIndex]?.focus());
        }
    }, [itens, onChange]);

    const removeLinha = useCallback((index) => {
        onChange(itens.filter((_, i) => i !== index));
    }, [itens, onChange]);

    // Enter na descrição avança: última linha → cria outra; senão vai para a de baixo.
    const onKeyDownDescricao = (e, index) => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        if (index === itens.length - 1) addLinha();
        else componenteRefs.current[index + 1]?.focus();
    };

    const inputCls = 'w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-yellow-400 outline-none disabled:bg-gray-50 disabled:text-gray-500';

    return (
        <div className="space-y-3">
            <GravidadeLegenda compact />

            <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-slate-800 text-white">
                        <tr>
                            <th className="px-2 py-2 text-left font-bold text-[11px] w-10">Nº</th>
                            <th className="px-2 py-2 text-left font-bold text-[11px] w-56">ITEM / COMPONENTE</th>
                            <th className="px-2 py-2 text-left font-bold text-[11px]">DESCRIÇÃO DO PROBLEMA / O QUE FOI OBSERVADO</th>
                            <th className="px-2 py-2 text-center font-bold text-[11px] w-44">GRAVIDADE</th>
                            <th className="px-2 py-2 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {itens.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">
                                    Nenhum item lançado. Adicione uma linha para cada problema apontado na ficha.
                                </td>
                            </tr>
                        )}
                        {itens.map((item, index) => (
                            <tr key={item.id || `novo-${index}`} className="hover:bg-gray-50">
                                <td className="px-2 py-1.5 text-center text-xs font-bold text-gray-400">{index + 1}</td>
                                <td className="px-2 py-1.5">
                                    <input
                                        ref={el => { componenteRefs.current[index] = el; }}
                                        value={item.itemComponente || ''}
                                        onChange={e => setItem(index, { itemComponente: e.target.value })}
                                        placeholder="Ex: Sistema de freios"
                                        disabled={disabled}
                                        className={inputCls}
                                    />
                                </td>
                                <td className="px-2 py-1.5">
                                    <input
                                        value={item.descricaoProblema || ''}
                                        onChange={e => setItem(index, { descricaoProblema: e.target.value })}
                                        onKeyDown={e => onKeyDownDescricao(e, index)}
                                        placeholder="O que o operador observou"
                                        disabled={disabled}
                                        className={inputCls}
                                    />
                                </td>
                                <td className="px-2 py-1.5">
                                    {/* Botões em vez de select: a ficha marca UMA letra por item,
                                        e clicar é mais rápido que abrir dropdown ao transcrever. */}
                                    <div className="flex items-center justify-center gap-1">
                                        {GRAVIDADES.map(letra => {
                                            const g = GRAVIDADE_LEGENDA[letra];
                                            const ativo = String(item.gravidade || '').toUpperCase() === letra;
                                            return (
                                                <button
                                                    key={letra}
                                                    type="button"
                                                    disabled={disabled}
                                                    onClick={() => setItem(index, { gravidade: ativo ? '' : letra })}
                                                    title={`${g.label} — ${g.descricao}`}
                                                    className={`w-7 h-7 rounded text-xs font-bold transition-colors disabled:opacity-40 ${
                                                        ativo ? g.chip : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                                    }`}
                                                >
                                                    {letra}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                    <button
                                        type="button"
                                        onClick={() => removeLinha(index)}
                                        disabled={disabled}
                                        className="p-1 rounded hover:bg-red-50 text-red-400 transition-colors disabled:opacity-40"
                                        title="Remover linha"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={() => addLinha()}
                    disabled={disabled}
                    className="flex items-center gap-1 px-3 py-1.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-800 font-bold rounded-lg text-sm transition-colors disabled:opacity-40"
                >
                    <Plus size={14} /> Adicionar item
                </button>
                <p className="text-[11px] text-gray-400">
                    Marque apenas uma letra de gravidade por item. <kbd className="px-1 bg-gray-100 rounded border">Enter</kbd> na
                    descrição cria a próxima linha.
                </p>
            </div>
        </div>
    );
};

export default RelatoItemGrid;
