// src/pages/FichaEvidencias.js
// Aba "Evidências" da Ficha da Obra — Evidências de Campo, Fase 6 (§10.3).
// É onde a foto vira argumento de cobrança: quem fatura vê a prova daquela obra e
// gera o dossiê PDF anexável à medição.
import React, { useState, useEffect, useCallback } from 'react';
import { Loader, FileText, RefreshCw, Camera } from 'lucide-react';
import apiClient from '../services/apiClient';

const hoje = () => new Date().toLocaleDateString('en-CA');
const diasAtras = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
const TIPO_LABEL = {
    horimetro_inicio: 'Horímetro início', horimetro_fim: 'Horímetro fim',
    foto_manha: 'Trabalho manhã', foto_tarde: 'Trabalho tarde', extra: 'Extra',
    rotina_filtro: 'Limpeza de filtro', rotina_graxa: 'Engraxamento',
};

const FichaEvidencias = ({ obraId, obra, dataInicio, setAlertMessage }) => {
    const [de, setDe] = useState(dataInicio ? String(dataInicio).slice(0, 10) : diasAtras(30));
    const [ate, setAte] = useState(hoje());
    const [itens, setItens] = useState([]);
    const [loading, setLoading] = useState(false);
    const [gerando, setGerando] = useState(false);

    const buscar = useCallback(async () => {
        if (!obraId) return;
        setLoading(true);
        try { const r = await apiClient.listarEvidencias({ obra_id: obraId, de, ate, limit: 100 }); setItens(r.itens || []); }
        catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
        finally { setLoading(false); }
    }, [obraId, de, ate, setAlertMessage]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { buscar(); }, [obraId]);

    const baixarDossie = async () => {
        setGerando(true);
        try {
            const blob = await apiClient.baixarDossie({ obra_id: obraId, de, ate });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `dossie-${(obra?.nome || 'obra').replace(/[^a-z0-9]+/gi, '_')}.pdf`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch (e) { setAlertMessage?.({ type: 'error', message: e.message }); }
        finally { setGerando(false); }
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 items-end mb-4">
                <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-slate-500 uppercase">De</span>
                    <input type="date" value={de} onChange={e => setDe(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" /></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-slate-500 uppercase">Até</span>
                    <input type="date" value={ate} onChange={e => setAte(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" /></label>
                <button onClick={buscar} className="bg-yellow-600 text-white rounded-lg px-3 py-2 text-sm font-semibold hover:bg-yellow-700 flex items-center gap-2"><RefreshCw size={16} /> Buscar</button>
                <button onClick={baixarDossie} disabled={gerando || itens.length === 0}
                    className="bg-slate-900 text-white rounded-lg px-3 py-2 text-sm font-semibold hover:bg-slate-800 flex items-center gap-2 disabled:opacity-40">
                    {gerando ? <Loader size={16} className="animate-spin" /> : <FileText size={16} />} Dossiê PDF
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-16 text-slate-400"><Loader className="animate-spin" /></div>
            ) : itens.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
                    <Camera size={28} /> Nenhuma evidência nesta obra no período.
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {itens.map(it => (
                        <a key={it.id} href={apiClient.evidenciaImgUrl(it.urls.stamped)} target="_blank" rel="noreferrer"
                            className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition">
                            <div className="aspect-square bg-gray-100">
                                <img src={apiClient.evidenciaImgUrl(it.urls.thumb)} alt="" className="w-full h-full object-cover" loading="lazy" />
                            </div>
                            <div className="p-2">
                                <div className="text-xs font-bold text-slate-700 truncate">{it.registroInterno || it.placa}</div>
                                <div className="text-[11px] text-slate-400 truncate">{TIPO_LABEL[it.tipo]} · {it.data_ref?.split?.('-').reverse().join('/')}</div>
                            </div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FichaEvidencias;
