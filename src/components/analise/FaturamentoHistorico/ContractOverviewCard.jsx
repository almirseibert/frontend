import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileSignature, ChevronLeft, ChevronRight, Loader, AlertCircle } from 'lucide-react';
import apiClient from '../../../services/apiClient';
import { C, fmtBRLCompact } from '../shared/tokens';
import { Card } from '../shared/ui';

// ─────────────────────────────────────────────────────────────────────────────
// "Visão contratual" — global e independente do período de horas escolhido
// acima. Responde a pergunta que a receita produzida (baseada em horas) não
// responde: quanto valem os CONTRATOS — de todas as obras ativas hoje e das
// que finalizamos em um dado ano. O restante da página trata "obra ativa"
// como universo; aqui, obras finalizadas voltam a contar.
//
// Propositalmente SEM tabela por-obra: é uma visão geral (3 números), não um
// detalhamento. Detalhamento por obra fica para a Ficha da Obra / Gestão de
// Obras — aqui o objetivo é responder a pergunta agregada, não listar tudo.
// ─────────────────────────────────────────────────────────────────────────────
const ContractOverviewCard = ({ active = true }) => {
    const [year, setYear] = useState(() => new Date().getFullYear());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const fetchedOnce = useRef(false);

    const fetchData = useCallback(async (y) => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiClient.getContractsOverview({ year: y });
            setData(res);
        } catch (e) {
            setError(e.message || 'Erro ao carregar visão contratual.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Só busca quando a aba financeira está visível — evita chamada extra ao
    // abrir a página direto na aba física.
    useEffect(() => {
        if (!active) return;
        fetchedOnce.current = true;
        fetchData(year);
    }, [active, year, fetchData]);

    if (!active && !fetchedOnce.current) return null;

    const r = data?.resumo;

    return (
        <Card className="p-5 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                <h3 className="flex items-center gap-2" style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                    <FileSignature size={16} style={{ color: C.gold }} /> Visão contratual
                </h3>
                <div className="flex items-center gap-1">
                    <button onClick={() => setYear(y => y - 1)} className="p-1 rounded hover:bg-black/5" style={{ color: C.textMid }} title="Ano anterior">
                        <ChevronLeft size={16} />
                    </button>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 40, textAlign: 'center' }}>{year}</span>
                    <button onClick={() => setYear(y => Math.min(y + 1, new Date().getFullYear()))} disabled={year >= new Date().getFullYear()}
                        className="p-1 rounded hover:bg-black/5 disabled:opacity-30" style={{ color: C.textMid }} title="Próximo ano">
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
            <p style={{ fontSize: 11, color: C.textSub, marginBottom: 14 }}>
                Valor de contrato — não é receita produzida por horas. Inclui obras finalizadas, algo que o restante desta página não enxerga.
            </p>

            {loading ? (
                <div className="flex items-center justify-center py-10 gap-2">
                    <Loader className="animate-spin" size={20} style={{ color: C.gold }} />
                    <span style={{ fontSize: 12, color: C.textSub }}>Carregando…</span>
                </div>
            ) : error ? (
                <div className="flex items-center gap-2 py-6" style={{ color: C.red, fontSize: 12 }}>
                    <AlertCircle size={16} /> {error}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 11, color: C.textSub, fontWeight: 600 }}>Contratado — obras ativas hoje</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginTop: 4 }}>{fmtBRLCompact(r.valorContratadoAtivas)}</div>
                            <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{r.qtdAtivas} obra{r.qtdAtivas !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 11, color: C.textSub, fontWeight: 600 }}>Contratado — finalizadas em {year}</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginTop: 4 }}>{fmtBRLCompact(r.valorContratadoFinalizadasAno)}</div>
                            <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{r.qtdFinalizadasAno} obra{r.qtdFinalizadasAno !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 11, color: C.textSub, fontWeight: 600 }}>Contratado — histórico total</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginTop: 4 }}>{fmtBRLCompact(r.valorContratadoTotalHistorico)}</div>
                            <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{r.qtdTotalHistorico} obra{r.qtdTotalHistorico !== 1 ? 's' : ''} (ativas + finalizadas)</div>
                        </div>
                    </div>
                </>
            )}
        </Card>
    );
};

export default ContractOverviewCard;
