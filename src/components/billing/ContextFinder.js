import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { formatObraNome } from '../../utils/obraFormat';

// Campo único de entrada do Faturamento & Controle.
// Aceita nome da obra, registro interno (RE) ou placa e devolve
// { obraId, vehicleId } — o vehicleId só vem quando a busca foi por equipamento.
// Substitui a sequência obra → aba → equipamento: o que está escrito na folha
// (RE ou placa) já basta para montar a tela.

const norm = (s) =>
    String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();

const onlyAlnum = (s) => norm(s).replace(/[^a-z0-9]/g, '');

const ContextFinder = ({
    obras = [],
    vehicles = [],
    vehicleGroups = {},
    onPick,
    placeholder = 'Obra, RE ou placa',
    autoFocus = false,
}) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [cursor, setCursor] = useState(0);
    const boxRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        const onDown = (e) => {
            if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    // Índice equipamento → obra, derivado do histórico de alocações.
    // Mesma regra do getObraVehicles: alocação mais recente vence e veículos
    // leves ficam de fora do faturamento por hora.
    const equipIndex = useMemo(() => {
        const out = [];
        obras
            .filter((o) => (o.tipo_registro || 'obra') !== 'centro_custo')
            .forEach((obra) => {
                const porVeiculo = new Map();
                (obra.historicoVeiculos || []).forEach((h) => {
                    const atual = porVeiculo.get(h.veiculoId);
                    const maisRecente =
                        !atual || new Date(h.dataEntrada) > new Date(atual.dataEntrada);
                    if (maisRecente) porVeiculo.set(h.veiculoId, h);
                });
                porVeiculo.forEach((h, veiculoId) => {
                    const v = vehicles.find((x) => x.id === veiculoId);
                    if (!v) return;
                    const isLeve = vehicleGroups['Veículos Leves']?.includes(v.tipo || '');
                    if (isLeve) return;
                    out.push({
                        obra,
                        vehicle: v,
                        saiu: !!h.dataSaida,
                    });
                });
            });
        return out;
    }, [obras, vehicles, vehicleGroups]);

    const results = useMemo(() => {
        const q = norm(query);
        if (!q) return { obras: [], equipamentos: [] };
        const qa = onlyAlnum(query);

        const obrasHit = obras
            .filter((o) => (o.tipo_registro || 'obra') !== 'centro_custo')
            .filter((o) => norm(formatObraNome(o)).includes(q))
            .slice(0, 6);

        const equipHit = equipIndex
            .filter(({ vehicle }) => {
                const re = onlyAlnum(vehicle.registroInterno);
                const placa = onlyAlnum(vehicle.placa);
                if (!qa) return false;
                // "610" encontra RE610; a placa casa por trecho
                return re.includes(qa) || (placa && placa.includes(qa));
            })
            .sort((a, b) => Number(a.saiu) - Number(b.saiu))
            .slice(0, 8);

        return { obras: obrasHit, equipamentos: equipHit };
    }, [query, obras, equipIndex]);

    const flat = useMemo(
        () => [
            ...results.obras.map((o) => ({ kind: 'obra', obra: o })),
            ...results.equipamentos.map((e) => ({ kind: 'equip', ...e })),
        ],
        [results]
    );

    useEffect(() => setCursor(0), [query]);

    const pick = (item) => {
        if (!item) return;
        if (item.kind === 'obra') onPick({ obraId: item.obra.id, vehicleId: null });
        else onPick({ obraId: item.obra.id, vehicleId: item.vehicle.id });
        setQuery('');
        setOpen(false);
        inputRef.current?.blur();
    };

    const onKeyDown = (e) => {
        if (!flat.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, flat.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(flat[cursor]);
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    return (
        <div className="relative" ref={boxRef}>
            <Search className="absolute left-3 top-2.5 text-gray-400 pointer-events-none" size={16} />
            <input
                ref={inputRef}
                type="text"
                value={query}
                autoFocus={autoFocus}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                autoComplete="off"
                spellCheck="false"
                className="w-full pl-9 pr-8 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            />
            {query && (
                <button
                    type="button"
                    onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                    className="absolute right-2 top-2 p-1 text-gray-400 hover:text-gray-600"
                    aria-label="Limpar busca"
                >
                    <X size={14} />
                </button>
            )}

            {open && flat.length > 0 && (
                <div
                    className="absolute z-40 left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl p-1 max-h-80 overflow-y-auto"
                    style={{ border: '1px solid #f0ebe3' }}
                >
                    {results.obras.length > 0 && (
                        <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                            Obras
                        </p>
                    )}
                    {results.obras.map((o, i) => (
                        <button
                            key={`o-${o.id}`}
                            onMouseEnter={() => setCursor(i)}
                            onClick={() => pick({ kind: 'obra', obra: o })}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                                cursor === i ? 'bg-[#fdf8f0]' : 'hover:bg-gray-50'
                            }`}
                        >
                            {formatObraNome(o)}
                        </button>
                    ))}

                    {results.equipamentos.length > 0 && (
                        <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                            Equipamentos
                        </p>
                    )}
                    {results.equipamentos.map((e, i) => {
                        const idx = results.obras.length + i;
                        return (
                            <button
                                key={`v-${e.vehicle.id}`}
                                onMouseEnter={() => setCursor(idx)}
                                onClick={() => pick({ kind: 'equip', ...e })}
                                className={`w-full text-left px-3 py-2 rounded-lg ${
                                    cursor === idx ? 'bg-[#fdf8f0]' : 'hover:bg-gray-50'
                                }`}
                            >
                                <span className="font-semibold text-sm text-gray-800">
                                    {e.vehicle.registroInterno}
                                </span>
                                <span className="text-xs text-gray-500 ml-2">
                                    {[e.vehicle.tipo, e.vehicle.placa].filter(Boolean).join(' · ')}
                                </span>
                                <span className="block text-[11px] text-gray-400">
                                    {formatObraNome(e.obra)}
                                    {e.saiu && ' — saiu da obra'}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ContextFinder;
