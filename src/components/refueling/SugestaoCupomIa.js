// src/components/refueling/SugestaoCupomIa.js
//
// Painel da leitura do cupom feita pela IA, usado nos DOIS formulários de baixa
// (BaixaForm e ConfirmRefuelingModal). Esses dois arquivos já são quase
// idênticos — as cinco validações da baixa estão duplicadas verbatim entre eles.
// Este painel nasce compartilhado para não agravar o problema.
//
// A IA NÃO conclui a baixa. Ela lê o cupom, preenche o formulário e aponta o
// que confere; o lançamento financeiro continua sendo confirmado por uma
// pessoa. Ver backend/docs/aceite-automatico-ia.md.

import React, { useMemo, useState } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';

/** Normaliza `refuelings.baixa_sugerida_ia` (mysql2 pode devolver objeto ou string). */
export const parseSugestaoIa = (bruto) => {
    if (!bruto) return null;
    if (typeof bruto === 'object') return bruto;
    try { return JSON.parse(bruto); } catch { return null; }
};

const CAMPOS = [
    { rotulo: 'Litros', chave: 'litros', conferencia: 'litros' },
    { rotulo: 'R$/litro', chave: 'preco_litro', conferencia: 'preco_litro' },
    { rotulo: 'Total', chave: 'valor_total', conferencia: 'aritmetica' },
    { rotulo: 'NF', chave: 'numero_nf', conferencia: 'nota_fiscal' },
];

const COR_STATUS = {
    confere: 'text-green-700',
    diverge: 'text-red-700',
    nao_lido: 'text-gray-500',
};

const MARCA_STATUS = { confere: ' ✓', diverge: ' ✕', nao_lido: '' };

/**
 * @param {object}   sugestao  objeto já parseado de baixa_sugerida_ia
 * @param {function} onAplicar recebe { litros, precoLitro, numeroNf }
 */
const SugestaoCupomIa = ({ sugestao, onAplicar }) => {
    const [aplicada, setAplicada] = useState(false);

    const conferenciaPorCampo = useMemo(() => {
        const mapa = {};
        (sugestao?.conferencias || []).forEach((c) => { mapa[c.campo] = c; });
        return mapa;
    }, [sugestao]);

    if (!sugestao) return null;

    const temDivergencia = (sugestao.conferencias || []).some((c) => c.status === 'diverge');
    const valores = sugestao.valores || {};

    const aplicar = () => {
        onAplicar({
            litros: valores.litros,
            precoLitro: valores.preco_litro,
            numeroNf: valores.numero_nf,
        });
        setAplicada(true);
    };

    return (
        <div className={`p-2 rounded border ${sugestao.confiavel ? 'bg-purple-50 border-purple-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex justify-between items-start gap-2 mb-1">
                <h6 className="text-[10px] font-bold uppercase flex items-center gap-1 text-gray-700">
                    <Sparkles size={11} /> Cupom lido pela IA
                    {sugestao.confianca != null && (
                        <span className="font-normal text-gray-500">
                            · confiança {(parseFloat(sugestao.confianca) * 100).toFixed(0)}%
                        </span>
                    )}
                </h6>
                {!aplicada && sugestao.legivel && (
                    <button
                        type="button"
                        onClick={aplicar}
                        className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-[10px] font-bold shrink-0"
                    >
                        Preencher com estes valores
                    </button>
                )}
                {aplicada && <span className="text-[10px] font-bold text-purple-700 shrink-0">✓ aplicado</span>}
            </div>

            {!sugestao.legivel ? (
                <p className="text-[10px] text-amber-800">
                    Não foi possível ler o cupom automaticamente
                    {sugestao.observacao ? ` — ${sugestao.observacao}` : ''}. Digite os valores.
                </p>
            ) : (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
                        {CAMPOS.map(({ rotulo, chave, conferencia }) => {
                            const c = conferenciaPorCampo[conferencia];
                            const valor = valores[chave];
                            const cor = c ? (COR_STATUS[c.status] || 'text-gray-600') : 'text-gray-600';
                            const marca = c ? (MARCA_STATUS[c.status] || '') : '';
                            return (
                                <div key={chave} className="bg-white/70 rounded px-1.5 py-1 border border-white">
                                    <p className="text-[9px] text-gray-500">{rotulo}</p>
                                    <p className={`font-bold ${cor}`}>
                                        {valor == null ? '—' : valor}{marca}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    {temDivergencia && (
                        <p className="text-[10px] text-red-700 mt-1 font-medium flex gap-1 items-start">
                            <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                            Há divergência entre o cupom e a ordem — confira antes de confirmar.
                        </p>
                    )}
                    <p className="text-[9px] text-gray-500 mt-1">
                        A IA não conclui a baixa. Confira e confirme você.
                    </p>
                </>
            )}
        </div>
    );
};

export default SugestaoCupomIa;
