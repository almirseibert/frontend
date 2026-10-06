import React, { useState, useMemo, useCallback } from 'react';
import { DollarSign, Gauge, HardHat } from 'lucide-react';
import FaturamentoHistorico from '../components/analise/FaturamentoHistorico';
import AproveitamentoProdutivo from '../components/analise/AproveitamentoProdutivo';
import ProducaoPeriodo from '../components/analise/ProducaoPeriodo';
import FilterBar, { FIN_PRESETS, FIS_PRESETS, FIS_DEFAULT, matchPreset } from '../components/analise/shared/FilterBar';
import { C } from '../components/analise/shared/tokens';

// Página "Desempenho do negócio" (seção Análise Gerencial).
// Três abas:
//   - Produção (principal): o que foi executado no período, por obra e por
//     máquina, frota própria × terceiros.
//   - Produtividade física (aproveitamento produtivo — capacidade × horas apontadas).
//   - Produtividade financeira (receita produzida × custo × margem).
//
// O SHELL é dono do intervalo de datas e da obra: o estado persiste ao trocar
// de aba e as abas ficam MONTADAS (display toggle) — não há refetch nem
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

const ABAS = {
    prod: { label: 'Produção', icon: HardHat },
    fis: { label: 'Produtividade física', icon: Gauge },
    fin: { label: 'Produtividade financeira', icon: DollarSign },
};

// Produção é um fechamento: abre no mês passado, que já está completo.
const PROD_DEFAULT = FIS_PRESETS.find(p => p.id === 'prev');

const rangeInicial = (tab) => {
    if (tab === 'fin') return FIN_PRESETS[1].range();
    if (tab === 'fis') return FIS_DEFAULT.range();
    return PROD_DEFAULT.range();
};

const FaturamentoHistoricoPage = ({ initialTab = 'prod', ...props }) => {
    const [tab, setTab] = useState(ABAS[initialTab] ? initialTab : 'prod');

    // Intervalo compartilhado. Default contextual à aba de entrada.
    const [range, setRange] = useState(() => rangeInicial(tab));
    const [obraId, setObraId] = useState('all');
    const [refreshKey, setRefreshKey] = useState(0);

    const presets = tab === 'fin' ? FIN_PRESETS : FIS_PRESETS;
    const activePreset = useMemo(() => matchPreset(presets, range), [presets, range]);

    const handleRange = useCallback((next) => setRange(next), []);
    const handleRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

    const HeaderIcon = ABAS[tab].icon;

    return (
        <div className="h-full overflow-y-auto" style={{ background: C.bg }}>
            <div className="px-6 pt-5">
                <h1 className="flex items-center gap-2" style={{ fontSize: 22, fontWeight: 800, color: C.text }}>
                    <HeaderIcon style={{ color: C.gold }} />
                    Desempenho do negócio
                </h1>
                <div className="flex gap-1 mt-2.5" style={{ borderBottom: `1px solid ${C.border}` }}>
                    {Object.entries(ABAS).map(([id, a]) => (
                        <TabBtn key={id} active={tab === id} onClick={() => setTab(id)} icon={a.icon}>{a.label}</TabBtn>
                    ))}
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
                        showObra={tab === 'fin'}
                        onRefresh={handleRefresh}
                    />
                </div>
            </div>

            {/* Abas montadas simultaneamente — só a ativa fica visível e busca dados */}
            <div style={{ display: tab === 'prod' ? 'block' : 'none' }}>
                <ProducaoPeriodo
                    active={tab === 'prod'}
                    range={range}
                    refreshKey={refreshKey}
                    apiClient={props.apiClient}
                    setAlertMessage={props.setAlertMessage}
                />
            </div>
            <div style={{ display: tab === 'fis' ? 'block' : 'none' }}>
                <AproveitamentoProdutivo
                    active={tab === 'fis'}
                    range={range}
                    refreshKey={refreshKey}
                    apiClient={props.apiClient}
                    setAlertMessage={props.setAlertMessage}
                />
            </div>
            <div style={{ display: tab === 'fin' ? 'block' : 'none' }}>
                <FaturamentoHistorico
                    active={tab === 'fin'}
                    obras={props.obras}
                    range={range}
                    obraId={obraId}
                    refreshKey={refreshKey}
                />
            </div>
        </div>
    );
};

export default FaturamentoHistoricoPage;
