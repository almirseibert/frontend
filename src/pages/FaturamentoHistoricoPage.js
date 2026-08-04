import React, { useState, useMemo, useCallback } from 'react';
import { DollarSign, Gauge } from 'lucide-react';
import FaturamentoHistorico from '../components/analise/FaturamentoHistorico';
import AproveitamentoProdutivo from '../components/analise/AproveitamentoProdutivo';
import FilterBar, { FIN_PRESETS, FIS_PRESETS, FIS_DEFAULT, matchPreset } from '../components/analise/shared/FilterBar';
import { C } from '../components/analise/shared/tokens';

// Página "Desempenho do negócio" (seção Análise Gerencial).
// Duas abas: Visão financeira (receita produzida × custo × margem) e
// Visão física (aproveitamento produtivo — capacidade × horas apontadas).
//
// O SHELL é dono do intervalo de datas e da obra: o estado persiste ao trocar
// de aba e as duas abas ficam MONTADAS (display toggle) — não há refetch nem
// perda de contexto (lente de custo, simulação) ao alternar.

const TabBtn = ({ active, onClick, icon: Icon, children }) => (
    <button
        onClick={onClick}
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors"
        style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: active ? 700 : 500,
            color: active ? C.text : C.textSub,
            borderBottom: `2px solid ${active ? C.gold : 'transparent'}`,
        }}
    >
        <Icon size={16} /> {children}
    </button>
);

const FaturamentoHistoricoPage = ({ initialTab = 'fin', ...props }) => {
    const [tab, setTab] = useState(initialTab === 'fis' ? 'fis' : 'fin');

    // Intervalo compartilhado. Default contextual à aba de entrada.
    const [range, setRange] = useState(() =>
        (initialTab === 'fis' ? FIS_DEFAULT.range() : FIN_PRESETS[1].range())
    );
    const [obraId, setObraId] = useState('all');
    const [refreshKey, setRefreshKey] = useState(0);

    const presets = tab === 'fis' ? FIS_PRESETS : FIN_PRESETS;
    const activePreset = useMemo(() => matchPreset(presets, range), [presets, range]);

    const handleRange = useCallback((next) => setRange(next), []);
    const handleRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

    const isFin = tab === 'fin';

    return (
        <div className="h-full overflow-y-auto" style={{ background: C.bg }}>
            <div className="px-6 pt-5">
                <h1 className="flex items-center gap-2" style={{ fontSize: 22, fontWeight: 800, color: C.text }}>
                    {isFin
                        ? <DollarSign style={{ color: C.gold }} />
                        : <Gauge style={{ color: C.gold }} />}
                    Desempenho do negócio
                </h1>
                <div className="flex gap-1 mt-2.5" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <TabBtn active={isFin} onClick={() => setTab('fin')} icon={DollarSign}>Visão financeira</TabBtn>
                    <TabBtn active={!isFin} onClick={() => setTab('fis')} icon={Gauge}>Visão física</TabBtn>
                </div>

                {/* Filtro único, presets contextuais à aba ativa */}
                <div className="mt-4">
                    <FilterBar
                        range={range}
                        onRange={handleRange}
                        presets={presets}
                        activePreset={activePreset}
                        obras={props.obras}
                        obraId={obraId}
                        onObra={setObraId}
                        showObra={isFin}
                        onRefresh={handleRefresh}
                    />
                </div>
            </div>

            {/* Abas montadas simultaneamente — só a ativa fica visível e busca dados */}
            <div style={{ display: isFin ? 'block' : 'none' }}>
                <FaturamentoHistorico
                    active={isFin}
                    obras={props.obras}
                    range={range}
                    obraId={obraId}
                    refreshKey={refreshKey}
                />
            </div>
            <div style={{ display: isFin ? 'none' : 'block' }}>
                <AproveitamentoProdutivo
                    active={!isFin}
                    range={range}
                    refreshKey={refreshKey}
                    apiClient={props.apiClient}
                    setAlertMessage={props.setAlertMessage}
                />
            </div>
        </div>
    );
};

export default FaturamentoHistoricoPage;
