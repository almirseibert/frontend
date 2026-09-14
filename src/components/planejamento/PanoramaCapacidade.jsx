import React, { useState, useEffect, useCallback } from 'react';
import { Loader, ChevronDown, Wrench, Radar, FileWarning } from 'lucide-react';

// ============================================================================
// PANORAMA DE CAPACIDADE — aba do Planejamento de Obras
//
// Responde as quatro perguntas da direção (docs/panorama-capacidade-plano.md):
//   1. quantas horas totais temos para executar
//   2. essas horas por categoria (plano de trabalho)
//   3. quantas conseguimos produzir e quantas precisam ser terceirizadas
//   4. quantas já estão alocadas a terceiros
//
// É uma FOTOGRAFIA: sem calendário, sem projeção. Toda obra em carteira demanda
// suas máquinas ao mesmo tempo — o encaixe entre fim de uma e início de outra é
// decidido fora do sistema.
//
// A barra é a ideia central: a LARGURA é o que o subgrupo precisa; o preenchido é
// o que temos; o vazio é o que falta. A oficina aparece hachurada DENTRO do vazio —
// é nossa, mas não vai para obra amanhã, então não abate o gap.
// ============================================================================

const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const fmt1 = (n) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

// ─── Barra de necessidade × disponibilidade ─────────────────────────────────
const Barra = ({ linha, escala }) => {
    const prec = linha.precisamos || 0;
    if (prec <= 0) return <div className="h-[22px]" />;

    const larguraTrack = escala > 0 ? (prec / escala) * 100 : 100;
    const pct = (q) => (prec > 0 ? (q / prec) * 100 : 0);

    // Ocupado não passa de 100%: excedente vira o marcador "+N sobrando".
    const op = pct(linha.operando);
    const dp = pct(linha.disponiveis);
    const tc = pct(linha.terceiros);
    const soma = op + dp + tc;
    const fator = soma > 100 ? 100 / soma : 1;

    const inicioOficina = Math.min(soma * fator, 100);
    const larguraOficina = Math.min(pct(linha.oficina), 100 - inicioOficina);

    return (
        <div className="relative h-[22px]">
            <div
                className="relative h-full flex rounded-[3px] overflow-hidden"
                style={{ width: `${larguraTrack}%`, background: '#fbf0ee', boxShadow: 'inset 0 0 0 1px #e6cdc7' }}
            >
                <div style={{ width: `${op * fator}%`, background: '#9E7A42' }} />
                <div style={{ width: `${dp * fator}%`, background: '#c4a878' }} />
                <div
                    style={{
                        width: `${tc * fator}%`,
                        background: 'repeating-linear-gradient(135deg,#faf6ee,#faf6ee 3px,#fff 3px,#fff 6px)',
                        boxShadow: 'inset 0 0 0 1px #c4a878',
                    }}
                />
                {larguraOficina > 0 && (
                    <div
                        className="absolute top-0 bottom-0"
                        title={`${linha.oficina} na oficina`}
                        style={{
                            left: `${inicioOficina}%`,
                            width: `${larguraOficina}%`,
                            background: 'repeating-linear-gradient(135deg,transparent,transparent 4px,#cfc6b8 4px,#cfc6b8 5px)',
                            boxShadow: 'inset 1px 0 0 #bdb3a3, inset -1px 0 0 #bdb3a3',
                        }}
                    />
                )}
            </div>
            {linha.sobra > 0 && (
                <span
                    className="absolute top-0 bottom-0 flex items-center pl-1.5 text-[11px] font-bold text-green-700 whitespace-nowrap"
                    style={{ left: `${larguraTrack}%` }}
                >
                    +{linha.sobra}
                </span>
            )}
        </div>
    );
};

// ─── Linha de subgrupo ──────────────────────────────────────────────────────
const LinhaSubgrupo = ({ linha, escala, aberta, onToggle }) => {
    const temDetalhe = (linha.obras?.length || 0) > 0 || (linha.substituicoes?.length || 0) > 0;

    return (
        <div className="border-b last:border-b-0" style={{ borderColor: '#e5e0d8' }}>
            <div
                className={`grid items-center gap-3 py-2.5 ${temDetalhe ? 'cursor-pointer hover:bg-gray-50/70' : ''}`}
                style={{ gridTemplateColumns: 'minmax(0,196px) minmax(0,1fr) 64px' }}
                onClick={temDetalhe ? onToggle : undefined}
            >
                <div className="min-w-0">
                    <span className="flex items-center gap-1.5 min-w-0" title={linha.subgrupo}>
                        {temDetalhe && (
                            <ChevronDown size={12} className={`text-gray-400 shrink-0 transition-transform ${aberta ? '' : '-rotate-90'}`} />
                        )}
                        <span className="text-[13px] font-bold leading-tight truncate">{linha.subgrupo}</span>
                    </span>
                    <span className="text-[11px] text-gray-400 block mt-0.5 tabular-nums">
                        exige {linha.precisamos} · {fmt1(linha.horasRestantes)} h · {linha.operando} op · {linha.disponiveis} disp · {linha.terceiros} terc · {linha.oficina} ofic
                    </span>
                    <span className="flex items-center gap-1.5 mt-1">
                        {linha.granularidade === 'grupo' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500" title="Porte não cadastrado nas máquinas deste grupo — demanda e frota agregadas.">
                                agregado por grupo
                            </span>
                        )}
                        {linha.atendidoPorOutroPorte > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                {linha.atendidoPorOutroPorte} de outro porte
                            </span>
                        )}
                        {linha.semFrotaCorrespondente && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200" title="O plano pede este item, mas não há nenhuma máquina cadastrada com essa classificação.">
                                sem frota correspondente
                            </span>
                        )}
                    </span>
                </div>

                <Barra linha={linha} escala={escala} />

                <div className="text-right leading-none">
                    <span className={`text-[17px] font-extrabold tabular-nums ${linha.gap > 0 ? 'text-[#b03828]' : 'text-[#2e7d5b]'}`}>
                        {linha.gap > 0 ? `−${linha.gap}` : '0'}
                    </span>
                    <span className="block text-[10px] text-gray-400 mt-0.5">{linha.gap > 0 ? 'máq' : 'coberto'}</span>
                </div>
            </div>

            {aberta && (
                <div className="pb-3 pl-4 pr-1 space-y-3">
                    {linha.substituicoes?.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                            <p className="text-[10.5px] font-bold uppercase tracking-wide text-amber-800 mb-1.5">
                                Atendido por máquina de outro porte
                            </p>
                            <div className="space-y-1">
                                {linha.substituicoes.map(s => (
                                    <div key={s.veiculoId} className="flex justify-between gap-3 text-[12px]">
                                        <span className="truncate">{s.registroInterno || s.placa || s.modelo}</span>
                                        <span className="text-gray-500 shrink-0">
                                            {s.subgrupoDaMaquina}{s.terceira ? ' · terceira' : ''}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {linha.obras?.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12.5px] min-w-[440px]">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                                        <th className="text-left font-semibold pb-1.5 pr-3">Obra que compõe a demanda</th>
                                        <th className="text-left font-semibold pb-1.5 pr-3">Região</th>
                                        <th className="text-right font-semibold pb-1.5 pr-3">Horas rest.</th>
                                        <th className="text-right font-semibold pb-1.5">Exige</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {linha.obras.map(o => (
                                        <tr key={o.obraId} className="border-t" style={{ borderColor: '#eee9e0' }}>
                                            <td className="py-1.5 pr-3">
                                                <span className="block truncate max-w-[260px]">{o.obraNome}</span>
                                                {o.orgao_contratante && (
                                                    <span className="block text-[11px] text-gray-400">{o.orgao_contratante}</span>
                                                )}
                                            </td>
                                            <td className="py-1.5 pr-3 text-gray-500">{o.regiao || '—'}</td>
                                            <td className="py-1.5 pr-3 text-right tabular-nums">{fmt1(o.horasRestantes)}</td>
                                            <td className="py-1.5 text-right tabular-nums font-semibold">{o.exige}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Card e indicador ───────────────────────────────────────────────────────
const Card = ({ titulo, extra, children }) => (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: '#e5e0d8' }}>
        <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{titulo}</h3>
            {extra && <span className="text-[11px] text-gray-400">{extra}</span>}
        </div>
        {children}
    </div>
);

const Stat = ({ label, value, hint, cor }) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b last:border-b-0" style={{ borderColor: '#e5e0d8' }}>
        <span className="text-[12.5px] text-gray-600">{label}</span>
        <span className="text-right whitespace-nowrap">
            <span className="text-[14px] font-bold tabular-nums" style={cor ? { color: cor } : undefined}>{value}</span>
            {hint && <span className="text-[11px] text-gray-400 ml-1.5 font-medium">{hint}</span>}
        </span>
    </div>
);

const Kpi = ({ label, valor, hint, cor }) => (
    <div className="px-4 py-3 border-r last:border-r-0" style={{ borderColor: '#e5e0d8' }}>
        <span className="block text-[10.5px] uppercase tracking-wider text-gray-400">{label}</span>
        <span className="block text-[22px] font-extrabold leading-none mt-1 tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</span>
        {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </div>
);

// ─── Aba ────────────────────────────────────────────────────────────────────
const PanoramaCapacidade = ({ apiClient, setAlertMessage }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [abertas, setAbertas] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setData(await apiClient.getPanoramaCapacidade());
        } catch (e) {
            console.error('Erro ao carregar o panorama:', e);
            setAlertMessage?.(e.message || 'Erro ao carregar o panorama de capacidade.');
        } finally {
            setLoading(false);
        }
    }, [apiClient, setAlertMessage]);

    useEffect(() => { load(); }, [load]);

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2 text-sm">
                <Loader className="animate-spin" size={16} /> Montando o panorama...
            </div>
        );
    }
    if (!data) return null;

    // Defaults em TODOS os ramos, não só nos arrays. Esta é a primeira aba da
    // página: um payload parcial (deploy do frontend antes do backend, caminho de
    // erro no controller) derrubava o render inteiro em tela branca, e sem error
    // boundary isso levava a página de planejamento junto.
    const {
        cobertura = null,
        carteira = {},
        totais = {},
        terceiros = {},
        subgrupos = [],
        radar = [],
        params = {},
    } = data;
    const escala = Math.max(...subgrupos.map(s => s.precisamos || 0), 1);
    const coberturaBaixa = (cobertura?.pct ?? 100) < 80;

    return (
        <div className="flex-1 min-h-0 overflow-y-auto pb-4">
            <div className="flex flex-col gap-3">

                {/* Cobertura — no topo, porque define a confiança em todo o resto */}
                {cobertura?.obrasSemPlano > 0 && (
                    <div
                        className="rounded-xl border px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]"
                        style={coberturaBaixa
                            ? { borderColor: '#ebd9d5', background: '#fbf0ee', color: '#5a4e3a' }
                            : { borderColor: '#e5e0d8', background: '#faf6ee', color: '#5a4e3a' }}
                    >
                        <FileWarning size={14} className="shrink-0" style={{ color: coberturaBaixa ? '#b03828' : '#9E7A42' }} />
                        <span className="font-bold tabular-nums" style={{ color: coberturaBaixa ? '#b03828' : '#9E7A42' }}>
                            {cobertura.obrasComPlano} / {cobertura.obrasAbertas} obras
                        </span>
                        <span>
                            <b>{cobertura.obrasSemPlano} obra{cobertura.obrasSemPlano > 1 ? 's' : ''} sem plano de trabalho</b> — fora de todos os números desta tela.
                        </span>
                    </div>
                )}

                {/* Indicadores */}
                <div className="rounded-xl border bg-white grid" style={{ borderColor: '#e5e0d8', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
                    <Kpi label="Obras em carteira" valor={fmt(carteira.obras)}
                        hint={`${carteira.emOperacao} em operação · ${carteira.aguardandoInicio} aguardando`} />
                    <Kpi label="Horas a executar" valor={fmt(carteira.horasRestantes)}
                        hint={`de ${fmt(carteira.horasContratadas)} contratadas`} />
                    <Kpi label="Máquinas exigidas" valor={fmt(totais.precisamos)}
                        hint={`para fechar em ${params.PRAZO_ALVO_DIAS} dias`} />
                    <Kpi label="Em campo hoje" valor={fmt(totais.operando + totais.disponiveis)}
                        hint={`${totais.operando} operando · ${totais.disponiveis} paradas`} />
                    <Kpi label="Na oficina" valor={fmt(totais.oficina)} hint="não disponíveis hoje" />
                    <Kpi label="Gap" valor={fmt(totais.gap)} cor="#b03828"
                        hint={`${fmt(totais.gapComOficina)} se a oficina voltar`} />
                </div>

                {/* Coluna única abaixo de 1024px: a tabela de barras precisa da largura,
                    espremê-la ao lado dos cards tornaria as barras ilegíveis. */}
                <div className="grid gap-3 items-start grid-cols-1 lg:[grid-template-columns:minmax(0,2.15fr)_minmax(0,1fr)]">
                    {/* Coluna principal */}
                    <Card
                        titulo="Necessidade × disponibilidade por subgrupo"
                        extra="largura da barra = máquinas exigidas · escala comum"
                    >
                        <div className="flex flex-col">
                            {subgrupos.map(l => (
                                <LinhaSubgrupo
                                    key={l.subgrupo}
                                    linha={l}
                                    escala={escala}
                                    aberta={!!abertas[l.subgrupo]}
                                    onToggle={() => setAbertas(a => ({ ...a, [l.subgrupo]: !a[l.subgrupo] }))}
                                />
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t text-[11px] text-gray-500" style={{ borderColor: '#e5e0d8' }}>
                            <span className="flex items-center gap-1.5"><i className="inline-block w-3.5 h-2.5 rounded-sm" style={{ background: '#9E7A42' }} />Operando</span>
                            <span className="flex items-center gap-1.5"><i className="inline-block w-3.5 h-2.5 rounded-sm" style={{ background: '#c4a878' }} />Disponíveis</span>
                            <span className="flex items-center gap-1.5"><i className="inline-block w-3.5 h-2.5 rounded-sm" style={{ background: 'repeating-linear-gradient(135deg,#faf6ee,#faf6ee 3px,#fff 3px,#fff 6px)', boxShadow: 'inset 0 0 0 1px #c4a878' }} />Terceiros</span>
                            <span className="flex items-center gap-1.5"><i className="inline-block w-3.5 h-2.5 rounded-sm" style={{ background: 'repeating-linear-gradient(135deg,transparent,transparent 4px,#cfc6b8 4px,#cfc6b8 5px)', boxShadow: 'inset 0 0 0 1px #bdb3a3' }} />Oficina</span>
                            <span className="flex items-center gap-1.5"><i className="inline-block w-3.5 h-2.5 rounded-sm" style={{ background: '#fbf0ee', boxShadow: 'inset 0 0 0 1px #e6cdc7' }} />Falta contratar</span>
                            <span className="ml-auto">Gap total = soma das faltas. Sobra de um subgrupo não cobre outro.</span>
                        </div>
                    </Card>

                    {/* Coluna lateral */}
                    <div className="flex flex-col gap-3">
                        <Card titulo="Já com terceiros" extra={`${terceiros.contratos} contratos`}>
                            <Stat label="Máquinas contratadas" value={fmt(terceiros.maquinas)} />
                            <Stat label="Horas contratadas" value={`${fmt(terceiros.horasContratadas)} h`} />
                            <Stat label="Já executadas" value={`${fmt(terceiros.horasExecutadas)} h`} />
                            <Stat label="A entregar" value={`${fmt(terceiros.horasAEntregar)} h`} />
                            {terceiros.contratosFechado > 0 && (
                                <Stat label="Contratos de valor fechado" value={fmt(terceiros.contratosFechado)} hint="horas não contratadas" />
                            )}
                            <Stat label="Ainda sem contrato" value={`${fmt(totais.gap)} máq · ${fmt(totais.gapHoras)} h`} cor="#b03828" />
                        </Card>

                        <Card titulo="Prestes a finalizar" extra={`≥${params.PCT_TERMINANDO}% ou ≤${params.DIAS_TERMINANDO} dias`}>
                            <Stat label="Máquinas liberando" value={fmt(totais.liberando)} hint="já contadas em operando" />
                            <Stat label="Gap se realocadas" value={fmt(totais.gapSeRealocar)} hint={`de ${fmt(totais.gap)}`} />
                        </Card>

                        {cobertura?.gruposAgregadosPorCadastro?.length > 0 && (
                            <Card titulo="Porte não cadastrado" extra={`${cobertura.gruposAgregadosPorCadastro.length} grupos`}>
                                <p className="text-[12px] text-gray-500 mb-2 flex gap-1.5">
                                    <Wrench size={13} className="shrink-0 mt-0.5 text-gray-400" />
                                    Nestes grupos há máquina própria sem porte definido, então demanda e frota
                                    aparecem agregadas. A tela detalha sozinha conforme o cadastro for completado.
                                </p>
                                <div className="flex flex-wrap gap-1">
                                    {cobertura.gruposAgregadosPorCadastro.map(g => (
                                        <span key={g} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{g}</span>
                                    ))}
                                </div>
                            </Card>
                        )}

                        {radar.length > 0 && (
                            <Card titulo="Radar · fora dos números" extra={`${radar.length} obras`}>
                                <p className="text-[12px] text-gray-500 mb-2 flex gap-1.5">
                                    <Radar size={13} className="shrink-0 mt-0.5 text-gray-400" />
                                    Prováveis, sem plano fechado: não sabemos quantas horas nem quantas máquinas exigem.
                                </p>
                                {radar.map(o => (
                                    <div key={o.id} className="flex items-baseline justify-between gap-2 py-1.5 border-b last:border-b-0 text-[12.5px]" style={{ borderColor: '#e5e0d8' }}>
                                        <span className="truncate text-gray-600">{o.nome}</span>
                                        <span className="text-[10.5px] text-gray-400 whitespace-nowrap">
                                            {[o.orgao_contratante, o.confiancaInfo?.replace('_', ' ')].filter(Boolean).join(' · ') || '—'}
                                        </span>
                                    </div>
                                ))}
                            </Card>
                        )}
                    </div>
                </div>

                <p className="text-[11px] text-gray-400 leading-relaxed px-1">
                    Premissa: todas as obras em carteira precisam de máquina simultaneamente — o encaixe entre o fim
                    de uma obra e o início de outra é decidido fora do sistema.
                    {cobertura?.planosNivelGrupo > 0 && ` · ${cobertura.planosNivelGrupo} planos estão em nível de grupo, não de subgrupo.`}
                    {' '}· Capacidade: {params.HORAS_POR_DIA} h por dia útil ({params.diasUteisPrazo} dias úteis em {params.PRAZO_ALVO_DIAS} dias
                    = {fmt(params.horasPorMaquina)} h por máquina). Frota da empresa inteira, sem recorte por região. Sucata excluída.
                </p>
            </div>
        </div>
    );
};

export default PanoramaCapacidade;
