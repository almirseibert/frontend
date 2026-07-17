import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, MapPin } from 'lucide-react';
import { CIDADES_RS } from '../utils/geo';

/**
 * Seletor de cidade do RS (base IBGE) com busca por texto.
 *
 * Props:
 *   value        - código IBGE (string) da cidade selecionada
 *   onChange     - callback(cidade | null) — cidade = { codigo_ibge, nome, lat, lng, ... }
 *   cities       - lista de cidades (default: CIDADES_RS empacotada)
 *   placeholder  - texto do input quando vazio
 *   storageKey   - se fornecido, persiste as 10 cidades mais recentes no localStorage
 *   className    - classe extra no container
 *   overlay      - abre a lista como seletor centralizado em tela cheia (para modais)
 *   overlayTitle - título/placeholder da busca no modo overlay
 */
const normalize = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const SearchableCitySelect = ({
    value = '',
    onChange,
    cities = CIDADES_RS,
    placeholder = 'Buscar cidade do RS...',
    storageKey = 'recent-cidades-rs',
    className = '',
    overlay = false,
    overlayTitle = 'Selecione a cidade',
}) => {
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const [recentCodes, setRecentCodes] = useState(() => {
        if (!storageKey) return [];
        try { return JSON.parse(localStorage.getItem(storageKey)) || []; } catch { return []; }
    });

    const containerRef = useRef(null);

    useEffect(() => {
        const handleMouseDown = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, []);

    const byCode = useMemo(() => {
        const m = new Map();
        cities.forEach((c) => m.set(String(c.codigo_ibge), c));
        return m;
    }, [cities]);

    const filtered = useMemo(() => {
        const q = normalize(search);
        if (!q) return cities;
        return cities.filter((c) => normalize(c.nome).includes(q));
    }, [search, cities]);

    const recentCities = useMemo(
        () => recentCodes.map((code) => byCode.get(String(code))).filter(Boolean),
        [recentCodes, byCode]
    );

    const selected = value ? byCode.get(String(value)) : null;

    const saveRecent = (code) => {
        if (!storageKey) return;
        const updated = [String(code), ...recentCodes.filter((x) => x !== String(code))].slice(0, 10);
        setRecentCodes(updated);
        try { localStorage.setItem(storageKey, JSON.stringify(updated)); } catch {}
    };

    const handleSelect = (city) => {
        setOpen(false);
        setSearch('');
        saveRecent(city.codigo_ibge);
        onChange && onChange(city);
    };

    const handleClear = (e) => {
        e.stopPropagation();
        setSearch('');
        setOpen(false);
        onChange && onChange(null);
    };

    const rowStyle = (isSel) => ({
        fontSize: 13,
        border: 'none',
        background: isSel ? '#fdf8f0' : 'transparent',
        color: isSel ? '#9E7A42' : '#3d3528',
        fontWeight: isSel ? 600 : 400,
        cursor: 'pointer',
    });

    const CityRow = ({ city, keyPrefix = '' }) => {
        const isSel = String(value) === String(city.codigo_ibge);
        return (
            <button
                key={`${keyPrefix}${city.codigo_ibge}`}
                type="button"
                onClick={() => handleSelect(city)}
                className="mak-bare-input w-full text-left px-4 py-2 transition flex items-center gap-2"
                style={rowStyle(isSel)}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = '#faf9f7'; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
            >
                <MapPin size={13} className="flex-shrink-0" style={{ color: '#b0a090' }} />
                <span className="truncate">{city.nome}</span>
                {city.microrregiao && (
                    <span className="ml-auto truncate" style={{ fontSize: 10, color: '#b0a090' }}>
                        {city.microrregiao}
                    </span>
                )}
            </button>
        );
    };

    const listContent = (
        <>
            {filtered.length === 0 && (
                <p className="p-4 text-sm text-center" style={{ color: '#9a8a78' }}>
                    Nenhuma cidade encontrada.
                </p>
            )}

            {storageKey && !search && recentCities.length > 0 && (
                <>
                    <div className="px-3 py-1.5 uppercase tracking-wider border-b" style={{ fontSize: 10, fontWeight: 700, color: '#b0a090', background: '#faf9f7' }}>
                        Recentes
                    </div>
                    {recentCities.map((c) => <CityRow key={`recent-${c.codigo_ibge}`} city={c} keyPrefix="recent-" />)}
                    <div className="px-3 py-1.5 uppercase tracking-wider border-b border-t" style={{ fontSize: 10, fontWeight: 700, color: '#b0a090', background: '#faf9f7' }}>
                        Todas as cidades
                    </div>
                </>
            )}

            {filtered.slice(0, 200).map((c) => <CityRow key={c.codigo_ibge} city={c} />)}
            {filtered.length > 200 && (
                <p className="px-4 py-2 text-center" style={{ fontSize: 11, color: '#b0a090' }}>
                    Refine a busca para ver mais…
                </p>
            )}
        </>
    );

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <div
                className="flex items-center rounded-lg transition-all"
                style={{ border: '1px solid #e8e0d4', background: '#faf9f7' }}
                onFocusCapture={(e) => { e.currentTarget.style.borderColor = '#9E7A42'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(158,122,66,0.18)'; e.currentTarget.style.background = '#fff'; }}
                onBlurCapture={(e) => { e.currentTarget.style.borderColor = '#e8e0d4'; e.currentTarget.style.boxShadow = ''; e.currentTarget.style.background = '#faf9f7'; }}
            >
                <Search size={15} className="ml-3 flex-shrink-0" style={{ color: '#b0a090' }} />
                <input
                    type="text"
                    className="mak-bare-input flex-1 outline-none bg-transparent min-w-0"
                    style={{ border: 'none', background: 'transparent', boxShadow: 'none', padding: '7px 8px', fontSize: 13, color: '#3d3528', width: '100%' }}
                    placeholder={placeholder}
                    value={(open && !overlay) ? search : (selected ? selected.nome : '')}
                    onFocus={() => { setSearch(''); setOpen(true); }}
                    onChange={(e) => setSearch(e.target.value)}
                    readOnly={overlay}
                />
                {value && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="mak-bare-input p-2 flex-shrink-0 transition"
                        style={{ border: 'none', background: 'transparent', color: '#b0a090', cursor: 'pointer', lineHeight: 0 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#b03828')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#b0a090')}
                        title="Limpar seleção"
                    >
                        <X size={15} />
                    </button>
                )}
            </div>

            {open && !overlay && (
                <div className="absolute z-40 w-full mt-1 bg-white rounded-lg shadow-xl max-h-72 overflow-y-auto mak-scrollbar" style={{ border: '1px solid #e8e0d4' }}>
                    {listContent}
                </div>
            )}

            {open && overlay && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn"
                    style={{ background: 'rgba(0,0,0,0.5)' }}
                    onMouseDown={(e) => { if (e.target === e.currentTarget) { setOpen(false); setSearch(''); } }}
                >
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden" style={{ maxHeight: '70vh', border: '1px solid #e8e0d4' }}>
                        <div className="flex items-center gap-2 px-3 py-2.5 shrink-0" style={{ borderBottom: '1px solid #e8e0d4' }}>
                            <Search size={16} className="flex-shrink-0" style={{ color: '#b0a090' }} />
                            <input
                                type="text"
                                autoFocus
                                className="mak-bare-input flex-1 outline-none bg-transparent min-w-0"
                                style={{ border: 'none', background: 'transparent', boxShadow: 'none', padding: '4px 4px', fontSize: 14, color: '#3d3528' }}
                                placeholder={overlayTitle}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={() => { setOpen(false); setSearch(''); }}
                                className="mak-bare-input p-1.5 flex-shrink-0"
                                style={{ border: 'none', background: 'transparent', color: '#b0a090', cursor: 'pointer', lineHeight: 0 }}
                                title="Fechar"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="overflow-y-auto mak-scrollbar">
                            {listContent}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableCitySelect;
