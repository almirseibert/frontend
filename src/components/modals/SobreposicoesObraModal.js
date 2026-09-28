import React, { useMemo, useState } from 'react';
import { X, Search, AlertTriangle } from 'lucide-react';
import { formatObraNome } from '../../utils/obraFormat';
import { diaBR } from '../../utils/periodosObra';

// Veículos que aparecem em duas obras no mesmo dia. Clicar numa obra abre o
// detalhe dela, onde o histórico (lápis) corrige as datas; a lista se atualiza
// sozinha quando os dados recarregam.
const Estadia = ({ estadia, onAbrirObra }) => (
    <button
        type="button"
        onClick={() => onAbrirObra(estadia.obra)}
        className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-amber-50 transition group"
        title="Abrir a obra para corrigir as datas"
    >
        <span className="block text-sm font-semibold text-gray-800 group-hover:text-amber-800 truncate">
            {formatObraNome(estadia.obra)}
        </span>
        <span className="block text-xs text-gray-500 tabular-nums">
            {diaBR(estadia.inicio)} a {estadia.fim ? diaBR(estadia.fim) : 'em aberto'}
        </span>
    </button>
);

const SobreposicoesObraModal = ({ sobreposicoes, onClose, onAbrirObra }) => {
    const [busca, setBusca] = useState('');

    const filtradas = useMemo(() => {
        const t = busca.trim().toLowerCase();
        if (!t) return sobreposicoes;
        return sobreposicoes.filter(s =>
            [s.placa, s.registroInterno, formatObraNome(s.a.obra), formatObraNome(s.b.obra)]
                .some(x => (x || '').toLowerCase().includes(t)));
    }, [sobreposicoes, busca]);

    const nVeiculos = useMemo(() => new Set(sobreposicoes.map(s => s.veiculoId)).size, [sobreposicoes]);

    return (
        <div className="mak-modal-backdrop backdrop-blur-sm">
            <div className="mak-modal max-w-3xl">
                <div className="p-4 border-b flex justify-between items-start gap-3">
                    <div>
                        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                            <AlertTriangle size={16} className="text-amber-600" /> Veículos em duas obras ao mesmo tempo
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {nVeiculos} veículo(s), {sobreposicoes.length} conflito(s). Clique numa obra para corrigir as datas no histórico dela.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={18} /></button>
                </div>

                <div className="p-4 border-b">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                            placeholder="Filtrar por placa, registro ou obra..."
                            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar divide-y">
                    {filtradas.length === 0 ? (
                        <p className="p-6 text-center text-sm text-gray-400 italic">
                            {sobreposicoes.length === 0 ? 'Nenhum conflito. Todos os veículos estão em uma obra por vez.' : 'Nenhum resultado para o filtro.'}
                        </p>
                    ) : filtradas.map(s => (
                        <div key={`${s.a.id}-${s.b.id}`} className="p-3 grid grid-cols-1 sm:grid-cols-[9rem_1fr_1fr] gap-2 sm:items-center">
                            <div>
                                <p className="text-sm font-bold text-gray-900">{s.placa || s.registroInterno || '—'}</p>
                                <p className="text-xs text-gray-500">{s.registroInterno}</p>
                                <p className="text-[11px] font-semibold text-red-700 mt-0.5">
                                    {s.diasEmComum} dia(s) em comum
                                </p>
                            </div>
                            <Estadia estadia={s.a} onAbrirObra={onAbrirObra} />
                            <Estadia estadia={s.b} onAbrirObra={onAbrirObra} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SobreposicoesObraModal;
