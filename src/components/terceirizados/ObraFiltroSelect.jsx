import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ChevronDown, X, Search } from 'lucide-react';

/**
 * Filtro de obra com busca por digitação.
 *
 * Um <select> nativo obriga a caçar a obra numa lista que só cresce; aqui o
 * próprio campo é a caixa de pesquisa: digita-se parte do nome (ou do local) e
 * a lista filtra. Enquanto o menu está fechado, o campo mostra a obra escolhida.
 *
 * @param {array}    obras      [{ id, nome, local }]
 * @param {string}   value      id da obra selecionada ('' = todas)
 * @param {function} onChange   (id) => void
 */
const ObraFiltroSelect = ({ obras = [], value = '', onChange, placeholder = 'Todas as obras' }) => {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [hover, setHover] = useState(0);
    const boxRef = useRef(null);
    const inputRef = useRef(null);

    const selecionada = obras.find((o) => String(o.id) === String(value)) || null;

    // Fecha ao clicar fora (o menu é um popover, não um modal).
    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const opcoes = useMemo(() => {
        const termo = q.trim().toLowerCase();
        const base = [{ id: '', nome: placeholder, local: '' }, ...obras];
        if (!termo) return base;
        return base.filter((o) =>
            o.id === ''
                ? placeholder.toLowerCase().includes(termo)
                : `${o.nome} ${o.local || ''}`.toLowerCase().includes(termo));
    }, [obras, q, placeholder]);

    const abrir = () => {
        setOpen(true);
        setQ('');
        setHover(0);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const escolher = (o) => {
        onChange?.(o.id === '' ? '' : String(o.id));
        setOpen(false);
        setQ('');
    };

    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setHover((h) => Math.min(h + 1, opcoes.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setHover((h) => Math.max(h - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (opcoes[hover]) escolher(opcoes[hover]); }
        else if (e.key === 'Escape') { setOpen(false); }
    };

    return (
        <div ref={boxRef} className="relative">
            {open ? (
                <div className="relative w-[280px]">
                    <Search size={15} className="absolute left-3 top-2.5 text-gray-400 pointer-events-none" />
                    <input
                        ref={inputRef}
                        value={q}
                        onChange={(e) => { setQ(e.target.value); setHover(0); }}
                        onKeyDown={onKeyDown}
                        placeholder="Pesquisar obra"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-purple-300 rounded-lg bg-white outline-none ring-2 ring-purple-100"
                    />
                </div>
            ) : (
                <button type="button" onClick={abrir}
                    className="flex items-center gap-2 w-[280px] pl-3 pr-2 py-2 text-sm border rounded-lg bg-white text-left hover:bg-gray-50">
                    <Building2 size={15} className="text-gray-400 shrink-0" />
                    <span className={`truncate ${selecionada ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                        {selecionada ? selecionada.nome : placeholder}
                    </span>
                    {selecionada ? (
                        <X size={14} className="ml-auto shrink-0 text-gray-400 hover:text-gray-600"
                            onClick={(e) => { e.stopPropagation(); onChange?.(''); }} />
                    ) : (
                        <ChevronDown size={15} className="ml-auto shrink-0 text-gray-400" />
                    )}
                </button>
            )}

            {open && (
                <div className="absolute z-30 mt-1 w-[280px] max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                    {opcoes.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-gray-400 text-center">Nenhuma obra encontrada.</div>
                    ) : opcoes.map((o, i) => {
                        const ativa = String(o.id) === String(value);
                        return (
                            <button key={o.id || 'todas'} type="button"
                                onMouseEnter={() => setHover(i)}
                                onClick={() => escolher(o)}
                                className={`w-full text-left px-3 py-2 text-sm ${i === hover ? 'bg-purple-50' : ''} ${ativa ? 'font-bold text-purple-700' : 'text-gray-700'}`}>
                                <div className="truncate">{o.nome}</div>
                                {o.local && <div className="text-[10px] text-gray-400 truncate">{o.local}</div>}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ObraFiltroSelect;
