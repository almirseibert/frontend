// src/pages/EvidenciasFilaPage.js
// Página da fila de envio — Evidências de Campo, Fase 3 (§3.8).
// Mostra o que está preso, dá controle manual (o operador não confia em coisa
// automática que não vê) e a barra de armazenamento quando a cota aperta.
import React, { useState, useEffect } from 'react';
import { UploadCloud, Wifi, WifiOff, RefreshCw, Trash2, Clock, AlertTriangle, Loader, CheckCircle } from 'lucide-react';
import { assinarFila, snapshotFila, reenviarItem, descartarItem, processarFila } from '../services/evidenciaQueue';
import { estimativaStorage } from '../services/evidenciaDb';

const CHIP = {
    fila:     { txt: 'na fila', cor: '#1d4ed8', bg: '#dbeafe', Icon: Clock },
    enviando: { txt: 'enviando', cor: '#854d0e', bg: '#fef9c3', Icon: Loader },
    erro:     { txt: 'erro — vai tentar de novo', cor: '#b45309', bg: '#fef3c7', Icon: AlertTriangle },
    recusado: { txt: 'recusado', cor: '#b91c1c', bg: '#fee2e2', Icon: AlertTriangle },
};
const TIPO_LABEL = {
    horimetro_inicio: 'Horímetro início', horimetro_fim: 'Horímetro fim',
    foto_manha: 'Trabalho manhã', foto_tarde: 'Trabalho tarde', extra: 'Extra',
    rotina_filtro: 'Limpeza de filtro', rotina_graxa: 'Engraxamento',
};

const ItemFila = ({ item }) => {
    const [url, setUrl] = useState(null);
    useEffect(() => {
        let u = null;
        try { if (item.blob) { u = URL.createObjectURL(item.blob); setUrl(u); } } catch { /* */ }
        return () => { if (u) URL.revokeObjectURL(u); };
    }, [item.blob]);
    const chip = CHIP[item.status] || CHIP.fila;
    const hora = item.criadoEm ? new Date(item.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    return (
        <div className="bg-white rounded-xl p-3 flex gap-3 items-center shadow-sm">
            <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                {url && <img src={url} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-800 text-sm truncate">{item.label || item.veiculo_id}</div>
                <div className="text-xs text-slate-400">{TIPO_LABEL[item.tipo] || item.tipo} · {hora}</div>
                <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: chip.bg, color: chip.cor }}>
                    <chip.Icon size={11} className={item.status === 'enviando' ? 'animate-spin' : ''} /> {chip.txt}
                    {item.tentativas > 0 && item.status !== 'recusado' ? ` (${item.tentativas})` : ''}
                </span>
                {item.status === 'recusado' && item.erroMsg && <div className="text-[11px] text-red-600 mt-0.5 truncate">{item.erroMsg}</div>}
            </div>
            <div className="flex flex-col gap-1">
                {item.status !== 'enviando' && (
                    <button onClick={() => reenviarItem(item.clientId)} className="p-2 rounded-lg bg-yellow-50 text-yellow-700" title="Enviar agora"><RefreshCw size={16} /></button>
                )}
                <button
                    onClick={() => { if (window.confirm('Descartar esta foto? Não dá para desfazer.')) descartarItem(item.clientId); }}
                    className="p-2 rounded-lg bg-red-50 text-red-600" title="Descartar"><Trash2 size={16} /></button>
            </div>
        </div>
    );
};

const EvidenciasFilaPage = () => {
    const [itens, setItens] = useState([]);
    const [online, setOnline] = useState(navigator.onLine);
    const [storage, setStorage] = useState(null);

    useEffect(() => {
        snapshotFila().then(setItens);
        const off = assinarFila(({ itens }) => setItens(itens || []));
        const on = () => setOnline(true); const offl = () => setOnline(false);
        window.addEventListener('online', on); window.addEventListener('offline', offl);
        estimativaStorage().then(setStorage);
        return () => { off(); window.removeEventListener('online', on); window.removeEventListener('offline', offl); };
    }, []);

    const mb = (itens.reduce((s, i) => s + (i.blob?.size || 0), 0) / (1024 * 1024)).toFixed(1);
    const pendentes = itens.filter(i => i.status !== 'recusado').length;

    return (
        <div className="min-h-screen pb-24 px-4 pt-4" style={{ background: '#f5f3ef' }}>
            <div className="flex items-center justify-between mb-1">
                <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><UploadCloud size={22} /> Fila de envio</h1>
                <span className="text-xs font-bold inline-flex items-center gap-1" style={{ color: online ? '#15803d' : '#b91c1c' }}>
                    {online ? <Wifi size={14} /> : <WifiOff size={14} />} {online ? 'online' : 'offline'}
                </span>
            </div>
            <p className="text-sm text-slate-500 mb-3">{pendentes} aguardando · {mb} MB</p>

            {!online && (
                <div className="mb-3 text-[12px] font-semibold rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: '#1c1a17', color: '#e9d9bf' }}>
                    <WifiOff size={14} /> Sem conexão. Mantenha o app aberto — a fila envia sozinha quando a rede voltar.
                </div>
            )}

            {storage && storage.pct > 0.7 && (
                <div className="mb-3">
                    <div className="text-[11px] text-slate-500 mb-1">Armazenamento do app: {(storage.pct * 100).toFixed(0)}%</div>
                    <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                        <div className="h-full" style={{ width: `${Math.min(100, storage.pct * 100)}%`, background: storage.pct > 0.9 ? '#dc2626' : '#f59e0b' }} />
                    </div>
                </div>
            )}

            {itens.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center text-slate-400 shadow-sm flex flex-col items-center gap-2">
                    <CheckCircle size={32} className="text-green-500" /> Tudo enviado. Nada na fila.
                </div>
            ) : (
                <>
                    <div className="space-y-2">{itens.map(i => <ItemFila key={i.clientId} item={i} />)}</div>
                    {online && pendentes > 0 && (
                        <button onClick={() => processarFila()} className="w-full mt-4 py-3 rounded-xl font-bold text-white" style={{ background: '#9E7A42' }}>
                            Enviar agora
                        </button>
                    )}
                </>
            )}
        </div>
    );
};

export default EvidenciasFilaPage;
