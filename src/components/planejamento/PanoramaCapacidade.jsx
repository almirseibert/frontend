import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader, ChevronDown, Radar, FileWarning, Wrench, ArrowRight } from 'lucide-react';

import { fmtBRL as fmtBRLCompartilhado, fmtBRLCompacto } from '../../utils/currency';
// ============================================================================
// PANORAMA — aba do Planejamento de Obras
//
// Tela de DIRETORIA: lida de pé, em ~15 segundos, para decisão de curto prazo.
// Três faixas, uma pergunta cada:
//
//   1. A CONTA          — quanto há para executar, quem cobre, o que falta,
//                         tudo com o valor contratado ao lado.
//   2. TERCEIROS        — quem de fato produziu nos últimos dias e em quais
//                         obras o dinheiro está saindo para fora.
//   3. O QUE DESTRAVA   — onde falta equipamento e o que libera sem gastar.
//
// Sobre o dinheiro: valor e horas são AMBOS fixos em contrato, então R$/h é um
// preço contratado. Nada nesta tela é projeção. O valor aparece por carteira,
// por obra e por contrato de terceiro — os três têm cifra fixa. NÃO existe R$
// por equipamento: o valor é da obra, não do subgrupo, e ratear criaria um
// número que parece contratual sem ser.
//
// É uma FOTOGRAFIA: sem calendário, sem projeção. Toda obra em carteira demanda
// suas máquinas ao mesmo tempo — o encaixe entre o fim de uma e o início de
// outra é decidido fora do sistema.
//
// O detalhe fino (drill-down por obra, substituição de porte, radar, buracos de
// cadastro) continua acessível, mas fora da área nobre: é backlog de cadastro e
// trabalho de planejador, não decisão de diretoria.
// ============================================================================

const COR = {
    propria: '#9E7A42',
    terceira: '#c4a878',
    falta: '#fbf0ee',
    faltaBorda: '#e6cdc7',
    crit: '#b03828',
    ok: '#2e7d5b',
    warn: '#a8741c',
    linha: '#e5e0d8',
    linhaSuave: '#eee9e0',
    creme: '#faf6ee',
};

// Faixa 3: a coluna da esquerda mostra os N maiores grupos com falta. A da
// direita agrupa por subgrupo e mostra todos — são poucas linhas, e cortar
// esconderia justamente o grupo que cobre a falta.
const LIMITE_GAP = 7;

const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');

// Valor abreviado só onde o valor cheio não cabe; a mantissa mantém os centavos.
const fmtBRL = (v) => fmtBRLCompacto(v);

const fmtReaisHora = (v) => (v ? `${fmtBRLCompartilhado(v)}/h` : '—');

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (ym) => {
    const [, m] = String(ym || '').split('-');
    return MESES[parseInt(m, 10) - 1] || ym;
};
const rotuloDia = (ymd) => {
    if (!ymd) return { dia: '—', mes: '' };
    const [, m, d] = String(ymd).split('-');
    return { dia: d, mes: MESES[parseInt(m, 10) - 1] || '' };
};

// ─── Peças de layout ────────────────────────────────────────────────────────
const FaixaTitulo = ({ titulo, nota }) => (
    <div className="flex items-baseline gap-2.5 mt-2.5 flex-wrap">
        <h2 className="text-[12.5px] font-bold uppercase tracking-[.09em] text-gray-500 m-0">{titulo}</h2>
        {nota && <span className="text-[12px] text-gray-400">{nota}</span>}
    </div>
);

// Altura NATURAL, de propósito. Esticar um card curto para acompanhar um alto só
// move o vazio para dentro da borda. Quando duas colunas têm volumes de conteúdo
// muito diferentes, a resposta é mudar o arranjo — não esticar a mais curta.
const Card = ({ titulo, extra, children, className = '' }) => (
    <div className={`rounded-xl border bg-white p-4 h-full ${className}`} style={{ borderColor: COR.linha }}>
        <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{titulo}</h3>
            {extra && <span className="text-[11px] text-gray-400 text-right">{extra}</span>}
        </div>
        {children}
    </div>
);

// ─── Faixa 1: a conta ───────────────────────────────────────────────────────
// Cada bloco e um CARD proprio, com borda e espaco em volta. A versao com quatro
// celulas dentro de uma caixa unica, separadas por fio de 1px, nao separava nada:
// o fio some contra o fundo e os quatro numeros lem como um paragrafo so. Aqui a
// troca de assunto e marcada por fundo aparecendo entre os cards — a separacao
// mais forte que existe sem desenhar nada.
const Tile = ({ label, valor, unidade, dinheiro, children, rodape, alerta }) => (
    <div
        className="rounded-xl border px-4 py-3.5 flex flex-col"
        style={alerta
            ? { background: COR.falta, borderColor: COR.faltaBorda }
            : { background: '#fff', borderColor: COR.linha }}
    >
        <span className="text-[10.5px] font-semibold uppercase tracking-[.11em] text-gray-400">{label}</span>
        <span
            className="text-[27px] font-extrabold leading-none mt-1.5 tabular-nums"
            style={alerta ? { color: COR.crit } : undefined}
        >
            {valor}
            {unidade && <span className="text-[15px] font-semibold text-gray-500 ml-1">{unidade}</span>}
        </span>
        {dinheiro && (
            <span
                className="text-[15.5px] font-bold tabular-nums mt-0.5"
                style={{ color: alerta ? COR.crit : COR.propria }}
            >
                {dinheiro}
            </span>
        )}
        {children}
        {rodape && <span className="text-[11.5px] text-gray-500 mt-2 leading-snug">{rodape}</span>}
    </div>
);

// Barra de 100%: quem cobre as máquinas exigidas.
const BarraCobertura = ({ propria, terceira, falta }) => {
    const total = propria + terceira + falta;
    if (total <= 0) return null;
    const pct = (q) => (q / total) * 100;
    return (
        <>
            <div className="flex h-[7px] rounded-sm overflow-hidden mt-2.5" style={{ background: COR.linha }}>
                <i style={{ width: `${pct(propria)}%`, background: COR.propria }} />
                <i style={{ width: `${pct(terceira)}%`, background: COR.terceira }} />
                <i style={{ width: `${pct(falta)}%`, background: COR.crit }} />
            </div>
            <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-1.5 text-[11px] text-gray-500">
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: COR.propria }} />{propria} nossas</span>
                <span className="flex items-center gap-1" title="Terceiras em contrato ativo ou trabalhando numa obra."><i className="w-2 h-2 rounded-sm" style={{ background: COR.terceira }} />{terceira} terceiras</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: COR.crit }} />{falta} faltando</span>
            </div>
        </>
    );
};

// ─── Faixa 1b: a carteira por estágio da obra ───────────────────────────────
// A Faixa 1 responde "quanto temos". Esta responde "em que pé está" — e é o que
// separa contrato já rodando de contrato que ainda vai cobrar máquina. A barra
// mostra o VALOR da obra: a parte cheia já foi produzida, a vazada ainda não.
// Uma obra em mobilização aparece com máquina no canteiro e 0% executado; é o
// estado normal dela, não um erro.
const ROTULO_STATUS = {
    radar: 'Radar',
    planejada: 'Planejada',
    mobilizacao: 'Em mobilização',
    ativa: 'Em operação',
};
const NOTA_STATUS = {
    planejada: 'contratada, sem máquina no canteiro',
    mobilizacao: 'equipando o canteiro',
    ativa: 'produzindo e faturando',
};

// ─── Detalhamento de um estágio (abre ao clicar na linha) ───────────────────
// Cada estágio responde uma pergunta DIFERENTE, então cada um tem sua própria
// tabela. A mesma lista genérica de obras três vezes responderia mal as três:
//   planejada    → o que vai cair na frota, e quando
//   mobilizacao  → há quanto tempo há máquina no canteiro sem produzir
//   ativa        → em quantos dias fecha COM AS MÁQUINAS QUE TEM
//
// Sobre "ativa": deliberadamente NÃO existe aqui um recorte de "obra parada" por
// ausência de apontamento. Diário não preenchido e obra parada são
// indistinguíveis nesse dado, e um painel de diretoria não pode oferecer um
// número que exige investigação antes de virar decisão.
const PRAZO_TXT = (d) => (d == null ? '—' : `${fmt(d)} d`);

const Tabela = ({ colunas, children }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
            <thead>
                <tr>
                    {colunas.map((c, i) => (
                        <th
                            key={c}
                            className={`text-[10px] uppercase tracking-[.07em] text-gray-400 pb-1.5 font-semibold ${i === 0 ? 'text-left' : 'text-right pl-3'}`}
                        >
                            {c}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>{children}</tbody>
        </table>
    </div>
);

const Td = ({ children, forte, alerta, esquerda }) => (
    <td
        className={`py-1.5 align-top ${esquerda ? 'text-left pr-3' : 'text-right pl-3 tabular-nums'} ${forte ? 'font-bold' : ''}`}
        style={{ borderTop: `1px solid ${COR.linhaSuave}`, color: alerta ? COR.crit : undefined }}
    >
        {children}
    </td>
);

const NomeObra = ({ o }) => (
    <>
        <span className="font-semibold text-gray-800">{o.nome}</span>
        {o.orgao_contratante && <span className="text-gray-400"> · {o.orgao_contratante}</span>}
    </>
);

// Data já vencida ganha destaque: em "Planejada" ela quer dizer que a obra
// deveria ter começado e não começou.
const DataCurta = ({ ymd, vencida }) => {
    if (!ymd) return <span className="text-gray-400">sem data</span>;
    const [a, m, d] = String(ymd).split('-');
    return (
        <span style={vencida ? { color: COR.crit, fontWeight: 700 } : undefined}>
            {d}/{m}/{a.slice(2)}
        </span>
    );
};

const Bloco = ({ titulo, nota, children }) => (
    <div className="mt-3.5 first:mt-0">
        <div className="flex items-baseline gap-2 flex-wrap mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{titulo}</span>
            {nota && <span className="text-[11px] text-gray-400">{nota}</span>}
        </div>
        {children}
    </div>
);

const DetalhePlanejada = ({ linhas, hoje }) => (
    <Bloco titulo="O que vai cair na frota" nota="ordenado pela data de início prevista">
        <Tabela colunas={['Obra', 'Início', 'Horas', 'Exige', 'Valor']}>
            {linhas.map(o => (
                <tr key={o.obraId}>
                    <Td esquerda><NomeObra o={o} /></Td>
                    <Td><DataCurta ymd={o.dataInicioPrevisto} vencida={o.dataInicioPrevisto && o.dataInicioPrevisto < hoje} /></Td>
                    <Td>{fmt(o.horasRestantes)} h</Td>
                    <Td forte>{fmt(o.exige)}</Td>
                    <Td>{o.valorAExecutar != null ? fmtBRL(o.valorAExecutar) : '—'}</Td>
                </tr>
            ))}
        </Tabela>
    </Bloco>
);

const DetalheMobilizacao = ({ linhas }) => (
    <Bloco titulo="Há quanto tempo com máquina no canteiro" nota="ainda sem hora apontada · ordenado pelo mais antigo">
        <Tabela colunas={['Obra', 'No canteiro', 'Máquinas', 'Horas', 'Exige']}>
            {linhas.map(o => (
                <tr key={o.obraId}>
                    <Td esquerda><NomeObra o={o} /></Td>
                    <Td forte alerta={o.diasNoCanteiro >= 15}>
                        {o.diasNoCanteiro != null ? `${o.diasNoCanteiro} d` : 'sem máquina'}
                    </Td>
                    <Td>
                        {o.noCanteiro}
                        {o.maquinasTerceiras > 0 && <span className="text-gray-400"> ({o.maquinasTerceiras} terc.)</span>}
                    </Td>
                    <Td>{fmt(o.horasRestantes)} h</Td>
                    <Td>{fmt(o.exige)}</Td>
                </tr>
            ))}
        </Tabela>
    </Bloco>
);

// Barra fina de progresso da obra. O numero sozinho ("38%") nao deixa comparar
// linhas de relance; a barra deixa, e ocupa a mesma celula.
const Progresso = ({ pct }) => {
    if (pct == null) return <span className="text-gray-400">—</span>;
    return (
        <div className="inline-flex flex-col items-end gap-0.5 w-full">
            <span className="font-bold tabular-nums">{fmt(pct)}%</span>
            <span className="block h-[4px] w-full max-w-[54px] rounded-sm overflow-hidden" style={{ background: COR.linhaSuave }}>
                <i className="block h-full" style={{ width: `${Math.min(pct, 100)}%`, background: COR.propria }} />
            </span>
        </div>
    );
};

const COLS_ATIVA = ['Obra', 'Concluído', 'Horas', 'Hoje', 'Exige', 'No ritmo'];

const LinhaAtiva = ({ o, prazoAlvo }) => (
    <tr>
        <Td esquerda><NomeObra o={o} /></Td>
        <Td><Progresso pct={o.pctConcluido} /></Td>
        <Td>
            {fmt(o.horasRestantes)} h
            {o.horasContratadas > 0 && (
                <span className="block text-[10.5px] text-gray-400">de {fmt(o.horasContratadas)}</span>
            )}
        </Td>
        <Td>
            {o.noCanteiro}
            {o.maquinasTerceiras > 0 && <span className="text-gray-400"> ({o.maquinasTerceiras} terc.)</span>}
        </Td>
        <Td>{fmt(o.exige)}</Td>
        <Td forte alerta={o.diasNoRitmo != null && o.diasNoRitmo > prazoAlvo}>{PRAZO_TXT(o.diasNoRitmo)}</Td>
    </tr>
);

const DetalheAtiva = ({ linhas, prazoAlvo }) => {
    const [verNoPrazo, setVerNoPrazo] = useState(false);
    const semMaquina = linhas.filter(o => o.noCanteiro === 0 && o.horasRestantes > 0);
    const foraPrazo = linhas.filter(o => o.foraDoPrazo);
    const noPrazo = linhas.filter(o => o.diasNoRitmo != null && !o.foraDoPrazo);

    return (
        <>
            {semMaquina.length > 0 && (
                <Bloco
                    titulo="Sem máquina no canteiro"
                    nota={`${semMaquina.length} obras · ${fmt(semMaquina.reduce((a, o) => a + o.horasRestantes, 0))} h a executar`}
                >
                    <Tabela colunas={['Obra', 'Concluído', 'Horas', 'Exige', 'Valor']}>
                        {semMaquina.map(o => (
                            <tr key={o.obraId}>
                                <Td esquerda><NomeObra o={o} /></Td>
                                <Td><Progresso pct={o.pctConcluido} /></Td>
                                <Td>{fmt(o.horasRestantes)} h</Td>
                                <Td forte>{fmt(o.exige)}</Td>
                                <Td>{o.valorAExecutar != null ? fmtBRL(o.valorAExecutar) : '—'}</Td>
                            </tr>
                        ))}
                    </Tabela>
                </Bloco>
            )}

            {foraPrazo.length > 0 && (
                <Bloco
                    titulo="Não fecham no prazo"
                    nota={`${foraPrazo.length} obras · dias úteis com as máquinas de hoje · alvo ${prazoAlvo} d`}
                >
                    <Tabela colunas={COLS_ATIVA}>
                        {foraPrazo.map(o => <LinhaAtiva key={o.obraId} o={o} prazoAlvo={prazoAlvo} />)}
                    </Tabela>
                </Bloco>
            )}

            {noPrazo.length > 0 && (
                <Bloco titulo="Fecham no prazo" nota={`${noPrazo.length} obras`}>
                    {verNoPrazo ? (
                        <Tabela colunas={COLS_ATIVA}>
                            {noPrazo.map(o => <LinhaAtiva key={o.obraId} o={o} prazoAlvo={prazoAlvo} />)}
                        </Tabela>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setVerNoPrazo(true)}
                            className="text-[12px] text-gray-500 hover:text-gray-800 underline underline-offset-2"
                        >
                            Ver as {noPrazo.length} obras que fecham no prazo
                        </button>
                    )}
                </Bloco>
            )}
        </>
    );
};

const DetalheEstagio = ({ status, linhas, prazoAlvo, hoje }) => {
    if (!linhas?.length) {
        return <p className="text-[12px] text-gray-400 py-2">Sem obras detalhadas neste estágio.</p>;
    }
    if (status === 'planejada') return <DetalhePlanejada linhas={linhas} hoje={hoje} />;
    if (status === 'mobilizacao') return <DetalheMobilizacao linhas={linhas} />;
    return <DetalheAtiva linhas={linhas} prazoAlvo={prazoAlvo} />;
};

const PorStatus = ({ linhas = [], prazoAlvo, hoje }) => {
    // Um estagio aberto por vez. Dois abertos empurrariam o resto da tela para
    // longe demais, e a comparacao que interessa e entre o detalhe e o
    // consolidado logo acima — nao entre dois detalhes.
    const [aberto, setAberto] = useState(null);
    const comPlano = linhas.filter(l => l.status !== 'radar');
    const radar = linhas.find(l => l.status === 'radar');
    if (comPlano.length === 0) return null;

    const maxValor = Math.max(...comPlano.map(l => l.valorCarteira || 0), 1);
    const totalValor = comPlano.reduce((a, l) => a + (l.valorCarteira || 0), 0);

    return (
        <Card titulo="Carteira por estágio da obra" extra="barra = valor do contrato · parte cheia = já produzido">
            <div className="flex flex-col">
                {comPlano.map((l, i) => {
                    const valorObra = l.valorCarteira || 0;
                    const executado = Math.max(valorObra - (l.valorAExecutar || 0), 0);
                    const larguraBarra = (valorObra / maxValor) * 100;
                    const pctCheio = valorObra > 0 ? (executado / valorObra) * 100 : 0;
                    const pctDaCarteira = totalValor > 0 ? Math.round((valorObra / totalValor) * 100) : 0;
                    const estaAberto = aberto === l.status;
                    const detalhe = l.detalhe || [];
                    return (
                        <div key={l.status} style={i > 0 ? { borderTop: `1px solid ${COR.linhaSuave}` } : undefined}>
                        <div
                            role={detalhe.length ? 'button' : undefined}
                            tabIndex={detalhe.length ? 0 : undefined}
                            onClick={detalhe.length ? () => setAberto(estaAberto ? null : l.status) : undefined}
                            onKeyDown={detalhe.length ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAberto(estaAberto ? null : l.status); }
                            } : undefined}
                            className={`grid items-center gap-x-3 gap-y-1.5 py-2.5 grid-cols-2 lg:[grid-template-columns:minmax(150px,1.05fr)_minmax(0,1.6fr)_repeat(3,minmax(78px,auto))]
                                ${detalhe.length ? 'cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg' : ''}`}
                        >
                            <div className="col-span-2 lg:col-span-1">
                                <div className="text-[13px] font-bold text-gray-800 leading-tight flex items-center gap-1">
                                    {ROTULO_STATUS[l.status] || l.status}
                                    {detalhe.length > 0 && (
                                        <ChevronDown
                                            size={13}
                                            className={`text-gray-400 transition-transform ${estaAberto ? 'rotate-180' : ''}`}
                                        />
                                    )}
                                </div>
                                <div className="text-[11px] text-gray-400 leading-tight">
                                    {l.obras} obra{l.obras === 1 ? '' : 's'}
                                    {NOTA_STATUS[l.status] && <> · {NOTA_STATUS[l.status]}</>}
                                </div>
                            </div>

                            <div className="col-span-2 lg:col-span-1">
                                {/* Trilha = maior valor da tabela; barra = valor desta
                                    linha. O tom da barra precisa destacar da trilha,
                                    senão a linha de 10% da carteira some e o leitor lê
                                    a TRILHA como se fosse a barra. */}
                                <div className="h-[9px] rounded-sm overflow-hidden" style={{ background: COR.linhaSuave }}>
                                    <div className="h-full rounded-sm overflow-hidden" style={{ width: `${larguraBarra}%`, background: '#d6cab5' }}>
                                        <i className="block h-full" style={{ width: `${pctCheio}%`, background: COR.propria }} />
                                    </div>
                                </div>
                                <div className="text-[11px] text-gray-400 mt-1 leading-tight">
                                    {fmtBRL(valorObra)} em contrato · {pctDaCarteira}% da carteira
                                    {l.pctExecutado != null && <> · {l.pctExecutado}% produzido</>}
                                </div>
                            </div>

                            {/* Três células num grid de DUAS colunas deixariam a
                                terceira órfã, com metade da linha vazia. No estreito
                                elas viram uma faixa própria de 3 colunas; no largo o
                                `lg:contents` dissolve o invólucro e elas voltam a ser
                                colunas da linha. */}
                            <div className="col-span-2 grid grid-cols-3 gap-3 lg:contents">
                                <Celula rotulo="a executar" valor={`${fmt(l.horasRestantes)} h`} nota={fmtBRL(l.valorAExecutar)} />
                                <Celula rotulo="exige" valor={fmt(l.exigeMaquinas)} nota="máquinas" />
                                <Celula
                                    rotulo="no canteiro"
                                    valor={fmt(l.operando)}
                                    nota={l.terceirosMaquinas > 0 ? `+${fmt(l.terceirosMaquinas)} terceiras` : 'nossas'}
                                />
                            </div>
                        </div>

                        {estaAberto && (
                            <div className="pb-3 pt-1">
                                <DetalheEstagio
                                    status={l.status}
                                    linhas={detalhe}
                                    prazoAlvo={prazoAlvo}
                                    hoje={hoje}
                                />
                            </div>
                        )}
                        </div>
                    );
                })}
            </div>

            {/* Radar não tem plano de trabalho, logo não tem hora nem R$ para somar.
                Vira uma linha de rodapé em vez de uma linha da tabela cheia de "—". */}
            {radar?.obras > 0 && (
                <p className="text-[11.5px] text-gray-400 mt-3 pt-2.5" style={{ borderTop: `1px solid ${COR.linhaSuave}` }}>
                    <b className="text-gray-600">{radar.obras} obra{radar.obras === 1 ? '' : 's'} em radar</b> ainda sem plano de
                    trabalho — não entram em nenhuma conta desta tela.
                </p>
            )}
        </Card>
    );
};

const Celula = ({ rotulo, valor, nota }) => (
    <div className="text-right">
        <div className="text-[10px] font-semibold uppercase tracking-[.08em] text-gray-400 leading-tight">{rotulo}</div>
        <div className="text-[15px] font-bold text-gray-800 tabular-nums leading-tight">{valor}</div>
        <div className="text-[11px] text-gray-400 leading-tight">{nota}</div>
    </div>
);

// ─── Faixa 2: produção realizada ────────────────────────────────────────────
const Producao = ({ producao }) => {
    const janelas = producao?.janelas || {};
    const disponiveis = Object.keys(janelas).map(Number).sort((a, b) => a - b);
    const [dias, setDias] = useState(disponiveis.includes(30) ? 30 : disponiveis[0]);
    const d = janelas[dias];

    if (!d || disponiveis.length === 0) return null;

    const total = d.horasProprias + d.horasTerceiras;
    const pctTerc = d.pctTerceiros || 0;
    const pctProp = Math.round((100 - pctTerc) * 10) / 10;
    const tend = producao?.tendencia || [];
    const maxTend = Math.max(...tend.map(t => t.pctTerceiros), 1);
    const subiu = tend.length >= 2 && tend[tend.length - 1].pctTerceiros > tend[0].pctTerceiros;

    return (
        <Card
            titulo="Quem produziu"
            extra={
                <span className="inline-flex rounded-md overflow-hidden border" style={{ borderColor: COR.linha }}>
                    {disponiveis.map(j => (
                        <button
                            key={j}
                            type="button"
                            onClick={() => setDias(j)}
                            className="px-2.5 py-1 text-[11.5px] font-semibold border-r last:border-r-0"
                            style={{
                                borderColor: COR.linha,
                                background: j === dias ? COR.propria : '#fff',
                                color: j === dias ? '#fff' : '#6b7280',
                            }}
                        >
                            {j}d
                        </button>
                    ))}
                </span>
            }
        >
            {total <= 0 ? (
                <p className="text-[12.5px] text-gray-400 py-3">Nenhuma hora apontada nesta janela.</p>
            ) : (
                <div className="grid gap-4 items-center grid-cols-1 lg:[grid-template-columns:minmax(0,1.55fr)_minmax(0,1fr)]">
                  <div>
                    <div className="flex h-[38px] rounded overflow-hidden border" style={{ borderColor: COR.linha }}>
                        <div
                            className="flex items-center px-3 text-[12px] font-bold text-white"
                            style={{ width: `${pctProp}%`, background: COR.propria }}
                        >
                            {pctProp >= 12 && `${pctProp}%`}
                        </div>
                        <div
                            className="flex items-center justify-end px-3 text-[12px] font-bold text-white"
                            style={{ width: `${pctTerc}%`, background: COR.terceira }}
                        >
                            {pctTerc >= 12 && `${pctTerc}%`}
                        </div>
                    </div>

                    <div className="flex flex-wrap justify-between gap-2 mt-2.5 text-[12px] text-gray-600">
                        <span className="flex items-center gap-1.5">
                            <i className="w-2 h-2 rounded-sm" style={{ background: COR.propria }} />
                            Nossa frota <b className="tabular-nums">{fmt(d.horasProprias)} h</b> · <b className="tabular-nums">{d.frotasProprias}</b> máquinas
                        </span>
                        <span className="flex items-center gap-1.5">
                            <i className="w-2 h-2 rounded-sm" style={{ background: COR.terceira }} />
                            Terceiros <b className="tabular-nums">{fmt(d.horasTerceiras)} h</b> · <b className="tabular-nums">{d.frotasTerceiras}</b> máquinas
                        </span>
                    </div>
                  </div>

                    {tend.length >= 2 && (
                        <div className="flex items-end gap-3.5 lg:border-l lg:pl-5 lg:mt-0 mt-4 pt-4 lg:pt-0 border-t lg:border-t-0" style={{ borderColor: COR.linhaSuave }}>
                            <div>
                                <div className="flex items-end gap-1.5 h-[46px]">
                                    {tend.map((t, i) => (
                                        <i
                                            key={t.mes}
                                            title={`${rotuloMes(t.mes)} · ${t.pctTerceiros}% terceiros`}
                                            className="w-[22px] rounded-t-sm block"
                                            style={{
                                                height: `${Math.max((t.pctTerceiros / maxTend) * 46, 3)}px`,
                                                background: i === tend.length - 1 ? COR.terceira : '#efe4d2',
                                            }}
                                        />
                                    ))}
                                </div>
                                <div className="flex gap-1.5 mt-1">
                                    {tend.map(t => (
                                        <span key={t.mes} className="w-[22px] text-center text-[10px] text-gray-400">{rotuloMes(t.mes)}</span>
                                    ))}
                                </div>
                            </div>
                            <p className="text-[12px] text-gray-500 leading-snug">
                                Participação de terceiros nas horas{' '}
                                {subiu ? 'subiu de ' : 'foi de '}
                                <b style={{ color: subiu ? COR.crit : COR.ok }}>
                                    {tend[0].pctTerceiros}% para {tend[tend.length - 1].pctTerceiros}%
                                </b>{' '}
                                em {tend.length} meses.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
};

// ─── Faixa 2: onde terceirizamos ────────────────────────────────────────────
const corMargem = (m) => (m == null ? undefined : m < 8 ? COR.crit : m < 15 ? COR.warn : COR.ok);

const ObrasTerceirizadas = ({ obras, saldoTotal }) => {
    const [todas, setTodas] = useState(false);
    if (!obras?.length) return null;
    const visiveis = todas ? obras : obras.slice(0, 10);

    return (
        <Card titulo="Onde terceirizamos" extra="ordenado por fatia terceirizada">
            <div className="overflow-x-auto">
                <table className="w-full text-[12.5px] min-w-[480px]">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                            <th className="text-left font-semibold pb-2 pr-3">Obra</th>
                            <th className="text-right font-semibold pb-2 pl-3">Horas com terceiro</th>
                            <th className="text-right font-semibold pb-2 pl-3">Saldo a pagar</th>
                            <th className="text-right font-semibold pb-2 pl-3">Margem/h</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visiveis.map(o => {
                            const alerta = o.pctTerceirizado >= 40;
                            return (
                                <tr key={o.obraId} className="border-t" style={{ borderColor: COR.linhaSuave }}>
                                    <td className="py-1.5 pr-3">
                                        <span className="block font-semibold leading-tight truncate max-w-[230px]" title={o.nome}>{o.nome}</span>
                                        {o.orgao_contratante && (
                                            <span className="block text-[11px] text-gray-400 truncate max-w-[230px]">{o.orgao_contratante}</span>
                                        )}
                                    </td>
                                    <td className="py-1.5 pl-3">
                                        <span className="flex items-center justify-end gap-2">
                                            <span className="w-[52px] h-[7px] rounded-sm overflow-hidden shrink-0" style={{ background: COR.linha }}>
                                                <i
                                                    className="block h-full"
                                                    style={{ width: `${Math.min(o.pctTerceirizado, 100)}%`, background: alerta ? COR.crit : COR.terceira }}
                                                />
                                            </span>
                                            <span className="tabular-nums font-semibold" style={alerta ? { color: COR.crit } : undefined}>
                                                {o.pctTerceirizado}%
                                            </span>
                                        </span>
                                    </td>
                                    <td className="py-1.5 pl-3 text-right tabular-nums font-semibold">{fmtBRL(o.saldoAPagar)}</td>
                                    <td className="py-1.5 pl-3 text-right tabular-nums font-bold" style={{ color: corMargem(o.margemPct) }}>
                                        {o.margemPct != null
                                            ? `${o.margemPct > 0 ? '+' : ''}${o.margemPct}%`
                                            : (
                                                <span className="text-[10.5px] font-semibold" style={{ color: COR.warn }}>
                                                    {o.semContrato ? 'sem contrato' : 'sem tarifa'}
                                                </span>
                                            )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {obras.length > 10 && (
                <button
                    type="button"
                    onClick={() => setTodas(t => !t)}
                    className="mt-2.5 w-full rounded-md border py-1.5 text-[12px] font-semibold text-gray-500"
                    style={{ borderColor: COR.linha, background: COR.creme }}
                >
                    {todas ? 'Mostrar só as 10 maiores' : `Ver as outras ${obras.length - 10} obras`}
                </button>
            )}

            <p className="mt-2.5 text-[11.5px] text-gray-400 leading-relaxed">
                Margem/h = R$/h do contrato da obra − R$/h pago ao terceiro; os dois lados são valores fixos de contrato.
                Saldo a pagar = valor do contrato − diesel abatido − adiantamentos.
                {saldoTotal > 0 && <> <b className="text-gray-600">Total: {fmtBRL(saldoTotal)}.</b></>}
            </p>
        </Card>
    );
};

// ─── Faixa 3: falta de equipamento ──────────────────────────────────────────
const LinhaGap = ({ linha, escala, aberta, onToggle }) => {
    const prec = linha.precisamos || 0;
    const temDetalhe = (linha.obras?.length || 0) > 0 || (linha.substituicoes?.length || 0) > 0;
    const larguraTrack = escala > 0 ? Math.max((prec / escala) * 100, 2) : 100;
    const pct = (q) => (prec > 0 ? Math.min((q / prec) * 100, 100) : 0);
    const propria = linha.operando + linha.disponiveis;

    return (
        <div className="border-t first:border-t-0" style={{ borderColor: COR.linhaSuave }}>
            <div
                className={`grid items-center gap-3 py-2 ${temDetalhe ? 'cursor-pointer hover:bg-gray-50/70' : ''}`}
                style={{ gridTemplateColumns: 'minmax(0,170px) minmax(0,1fr) 52px' }}
                onClick={temDetalhe ? onToggle : undefined}
            >
                <div className="min-w-0">
                    <span className="flex items-center gap-1.5 min-w-0" title={linha.subgrupo}>
                        {temDetalhe && (
                            <ChevronDown size={12} className={`text-gray-400 shrink-0 transition-transform ${aberta ? '' : '-rotate-90'}`} />
                        )}
                        <span className="text-[12.5px] font-semibold leading-tight truncate">{linha.subgrupo}</span>
                    </span>
                    <span className="block text-[10.5px] text-gray-400 tabular-nums mt-0.5">
                        exige {prec}
                        {linha.oficina > 0 && ` · ${linha.oficina} na oficina`}
                        {linha.sobra > 0 && ` · ${linha.sobra} sobrando`}
                    </span>
                    {linha.semFrotaCorrespondente && (
                        <span
                            className="inline-block text-[10px] px-1.5 py-0.5 rounded mt-1 border"
                            style={{ background: COR.falta, color: COR.crit, borderColor: COR.faltaBorda }}
                            title="O plano pede este item, mas não há máquina cadastrada com essa classificação."
                        >
                            sem frota correspondente
                        </span>
                    )}
                </div>

                {prec > 0 ? (
                    <div
                        className="flex h-[19px] rounded-[3px] overflow-hidden"
                        style={{ width: `${larguraTrack}%`, background: COR.falta, boxShadow: `inset 0 0 0 1px ${COR.faltaBorda}` }}
                    >
                        <i style={{ width: `${pct(propria)}%`, background: COR.propria }} />
                        <i style={{ width: `${pct(linha.terceiros)}%`, background: COR.terceira }} />
                    </div>
                ) : (
                    <div className="h-[19px]" />
                )}

                <div className="text-right leading-none">
                    {linha.gap > 0 ? (
                        <span className="text-[17px] font-extrabold tabular-nums" style={{ color: COR.crit }}>−{linha.gap}</span>
                    ) : (
                        <span className="text-[13px] font-semibold" style={{ color: COR.ok }}>ok</span>
                    )}
                </div>
            </div>

            {aberta && (
                <div className="pb-3 pl-4 pr-1 space-y-2.5">
                    {linha.substituicoes?.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                            <p className="text-[10.5px] font-bold uppercase tracking-wide text-amber-800 mb-1.5">
                                Atendido por máquina de outro porte
                            </p>
                            {linha.substituicoes.map(s => (
                                <div key={s.veiculoId} className="flex justify-between gap-3 text-[12px]">
                                    <span className="truncate">{s.registroInterno || s.placa || s.modelo}</span>
                                    <span className="text-gray-500 shrink-0">{s.subgrupoDaMaquina}{s.terceira ? ' · terceira' : ''}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {linha.obras?.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12px] min-w-[400px]">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                                        <th className="text-left font-semibold pb-1.5 pr-3">Obra que compõe a demanda</th>
                                        <th className="text-right font-semibold pb-1.5 pr-3">Horas rest.</th>
                                        <th className="text-right font-semibold pb-1.5">Exige</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {linha.obras.map(o => (
                                        <tr key={o.obraId} className="border-t" style={{ borderColor: COR.linhaSuave }}>
                                            <td className="py-1.5 pr-3">
                                                <span className="block truncate max-w-[260px]">{o.obraNome}</span>
                                                {o.orgao_contratante && <span className="block text-[10.5px] text-gray-400">{o.orgao_contratante}</span>}
                                            </td>
                                            <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(Math.round(o.horasRestantes))}</td>
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

// ─── Faixa 3: libera em breve ───────────────────────────────────────────────
// Agrupado por SUBGRUPO, não por máquina. A diretoria não decide sobre a RE836:
// decide sobre "vão sobrar 4 motoniveladoras". A lista de placas continua a um
// clique, para quem for de fato realocar.
const LiberaEmBreve = ({ liberando, totais, valor, params, subgrupos = [] }) => {
    const [abertos, setAbertos] = useState({});

    const grupos = useMemo(() => {
        // Falta atual por subgrupo, para dizer quanto de cada grupo a liberação
        // realmente resolve — e quanto continua faltando depois dela.
        const gapPorSub = new Map(subgrupos.map(s => [s.subgrupo, s.gap || 0]));

        const mapa = new Map();
        for (const m of liberando) {
            const chave = m.subgrupo || 'Sem classificação';
            if (!mapa.has(chave)) {
                mapa.set(chave, { subgrupo: chave, maquinas: [], cobre: 0, obras: new Set(), proximaData: null });
            }
            const g = mapa.get(chave);
            g.maquinas.push(m);
            if (m.atendeGap) g.cobre += 1;
            if (m.obraNome) g.obras.add(m.obraNome);
            if (m.fimPrevisto && (!g.proximaData || m.fimPrevisto < g.proximaData)) g.proximaData = m.fimPrevisto;
        }

        return [...mapa.values()]
            .map(g => {
                const gap = gapPorSub.get(g.subgrupo) ?? 0;
                // pctExecutado chega como string: sem Number() o reduce concatena
                // ("87"+"87") e a média vira um número de quatro dígitos.
                const pcts = g.maquinas.map(m => Number(m.pctExecutado)).filter(Number.isFinite);
                return {
                    ...g,
                    total: g.maquinas.length,
                    obras: g.obras.size,
                    gap,
                    gapRestante: Math.max(gap - g.cobre, 0),
                    pctMedio: pcts.length ? Math.round(pcts.reduce((a, p) => a + p, 0) / pcts.length) : null,
                };
            })
            // Quem resolve falta primeiro; entre iguais, quem devolve mais máquina.
            .sort((a, b) => b.cobre - a.cobre || b.total - a.total || a.subgrupo.localeCompare(b.subgrupo));
    }, [liberando, subgrupos]);

    const totalCobre = grupos.reduce((a, g) => a + g.cobre, 0);

    return (
        <Card
            titulo="Libera em breve"
            extra={params.PCT_TERMINANDO
                ? `obras ≥${params.PCT_TERMINANDO}% ou fim em ≤${params.DIAS_TERMINANDO} dias`
                : 'obras prestes a terminar'}
        >
            {!liberando?.length ? (
                <p className="text-[12.5px] text-gray-400 py-2">Nenhuma máquina prestes a desocupar.</p>
            ) : (
                <>
                    <div className="flex items-baseline gap-2 pb-2.5">
                        <span className="text-[27px] font-extrabold leading-none tabular-nums">{fmt(liberando.length)}</span>
                        <span className="text-[12.5px] text-gray-500">
                            máquinas em {grupos.length} {grupos.length === 1 ? 'grupo' : 'grupos'}
                            {totalCobre > 0 && <> · <b style={{ color: COR.propria }}>{totalCobre} cobrem falta</b></>}
                        </span>
                    </div>

                    <div className="flex flex-col">
                        {grupos.map(g => {
                            const aberto = !!abertos[g.subgrupo];
                            const { dia, mes } = rotuloDia(g.proximaData);
                            return (
                                <div key={g.subgrupo} className="border-t first:border-t-0" style={{ borderColor: COR.linhaSuave }}>
                                    <div
                                        className="flex gap-2.5 py-2 items-start cursor-pointer hover:bg-gray-50/70"
                                        onClick={() => setAbertos(a => ({ ...a, [g.subgrupo]: !a[g.subgrupo] }))}
                                    >
                                        <div
                                            className="shrink-0 w-[50px] text-center rounded-md border py-1"
                                            style={{ borderColor: COR.linha, background: COR.creme }}
                                        >
                                            <span
                                                className="block text-[21px] font-extrabold leading-none tabular-nums"
                                                style={{ color: COR.propria }}
                                            >
                                                {g.total}
                                            </span>
                                            <span className="block text-[9.5px] uppercase tracking-wide text-gray-400 mt-0.5">
                                                {g.total === 1 ? 'máq' : 'máqs'}
                                            </span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <ChevronDown size={12} className={`text-gray-400 shrink-0 transition-transform ${aberto ? '' : '-rotate-90'}`} />
                                                <span className="text-[12.5px] font-semibold truncate">{g.subgrupo}</span>
                                            </div>
                                            <div className="text-[11.5px] text-gray-500 leading-snug pl-[18px]">
                                                {/* Boa parte das obras não tem fim previsto cadastrado — elas entram
                                                    na lista pelo percentual executado. Nesse caso mostramos o avanço
                                                    médio, que é a informação que existe. */}
                                                {g.proximaData
                                                    ? <>1ª em {dia}/{mes}</>
                                                    : g.pctMedio != null
                                                        ? <>{g.pctMedio}% executado em média</>
                                                        : <>sem fim previsto</>}
                                                {' · '}{g.obras} {g.obras === 1 ? 'obra' : 'obras'}
                                                {g.cobre > 0 && (
                                                    <span className="font-semibold ml-1" style={{ color: COR.propria }}>
                                                        · cobre {g.cobre} de {g.gap} em falta
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {/* Discreto de propósito: o que resta em falta é consequência
                                            da realocação, não o assunto do card. Em corpo grande e
                                            vermelho ele roubava a leitura da quantidade que libera. */}
                                        <div className="text-right shrink-0 pt-1 max-w-[92px]">
                                            {g.gap > 0 ? (
                                                g.gapRestante > 0 ? (
                                                    <span className="text-[11px] text-gray-400 leading-snug block">
                                                        restam <b className="tabular-nums text-gray-500">{g.gapRestante}</b> em falta
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] font-semibold leading-snug block" style={{ color: COR.ok }}>
                                                        zera a falta
                                                    </span>
                                                )
                                            ) : (
                                                <span className="text-[11px] text-gray-400 leading-snug block">sem falta no grupo</span>
                                            )}
                                        </div>
                                    </div>

                                    {aberto && (
                                        <div className="pb-2.5 pl-[68px] pr-1 flex flex-col">
                                            {g.maquinas.map(m => {
                                                const d = rotuloDia(m.fimPrevisto);
                                                return (
                                                    <div key={m.veiculoId} className="flex justify-between gap-3 text-[12px] py-1 border-t first:border-t-0" style={{ borderColor: COR.linhaSuave }}>
                                                        <span className="truncate">
                                                            <b className="font-semibold">{m.identificacao}</b>
                                                            <span className="text-gray-500"> · {m.obraNome}</span>
                                                            {m.atendeGap && (
                                                                <span className="font-semibold ml-1.5" style={{ color: COR.propria }}>· cobre falta</span>
                                                            )}
                                                        </span>
                                                        <span className="shrink-0 text-gray-500 tabular-nums">
                                                            {m.fimPrevisto
                                                                ? `${d.dia}/${d.mes}`
                                                                : m.pctExecutado != null ? `${m.pctExecutado}%` : '—'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <p className="mt-3 pt-3 border-t text-[12.5px] text-gray-600 leading-relaxed" style={{ borderColor: COR.linha }}>
                        Realocando as {liberando.length}, a falta cai de{' '}
                        <b className="text-[15px] tabular-nums">{fmt(totais.gap)}</b> para{' '}
                        <b className="text-[15px] tabular-nums">{fmt(totais.gapSeRealocar)}</b> máquinas
                        {valor?.liberando > 0 && <> — <b>{fmtBRL(valor.liberando)}</b> destravados sem contratar nada</>}.
                    </p>
                </>
            )}
        </Card>
    );
};
// ─── Aba ────────────────────────────────────────────────────────────────────
const PanoramaCapacidade = ({ apiClient, setAlertMessage }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [abertas, setAbertas] = useState({});
    const [todosGrupos, setTodosGrupos] = useState(false);
    const [detalhe, setDetalhe] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setData(await apiClient.getPanoramaCapacidade());
        } catch (e) {
            console.error('Erro ao carregar o panorama:', e);
            setAlertMessage?.(e.message || 'Erro ao carregar o panorama.');
        } finally {
            setLoading(false);
        }
    }, [apiClient, setAlertMessage]);

    useEffect(() => { load(); }, [load]);

    // Defaults em TODOS os ramos, não só nos arrays. Esta é a primeira aba da
    // página: um payload parcial (deploy do frontend antes do backend, caminho de
    // erro no controller) derrubava o render inteiro em tela branca, e sem error
    // boundary isso levava a página de planejamento junto.
    const {
        cobertura = null,
        carteira = {},
        totais = {},
        terceiros = {},
        valor = {},
        producao = null,
        obrasTerceirizadas = [],
        liberando = [],
        subgrupos = [],
        radar = [],
        porStatus = [],
        params = {},
    } = data || {};

    const escala = useMemo(
        () => Math.max(...subgrupos.map(s => s.precisamos || 0), 1),
        [subgrupos]
    );
    const comGap = useMemo(() => subgrupos.filter(l => l.gap > 0), [subgrupos]);
    const visiveis = todosGrupos ? subgrupos : subgrupos.slice(0, LIMITE_GAP);
    const ocultosComGap = comGap.filter(l => !visiveis.includes(l)).reduce((a, l) => a + l.gap, 0);

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2 text-sm">
                <Loader className="animate-spin" size={16} /> Montando o panorama...
            </div>
        );
    }
    if (!data) return null;

    const proprias = (totais.operando || 0) + (totais.disponiveis || 0);
    const pctNosso = totais.precisamos > 0 ? Math.round((proprias / totais.precisamos) * 100) : 0;

    return (
        <div className="flex-1 min-h-0 overflow-y-auto pb-4">
            <div className="flex flex-col gap-3">

                {/* ══ FAIXA 1 ═══════════════════════════════════════════════ */}
                <FaixaTitulo titulo="A conta" nota="o que está contratado e o que falta produzir" />

                {/* Cards soltos, com `gap` de verdade entre eles. Nada de um
                    container com borda por fora: a moldura unica volta a juntar o
                    que a separacao pretende distinguir. */}
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    <Tile
                        label="A executar"
                        valor={fmt(carteira.horasRestantes)}
                        unidade="h"
                        dinheiro={valor.aExecutar > 0 ? fmtBRL(valor.aExecutar) : null}
                        rodape={
                            <>
                                {carteira.obras} obras em carteira
                                {valor.tarifaMedia > 0 && <> · <b className="text-gray-700">{fmtReaisHora(valor.tarifaMedia)}</b> médio de contrato</>}
                                <br />
                                {carteira.emOperacao} em operação · {carteira.aguardandoInicio} aguardando
                            </>
                        }
                    />

                    <Tile
                        label="Quem cobre essas horas"
                        valor={`${pctNosso}%`}
                        unidade="nosso"
                        rodape={`${fmt(totais.precisamos)} máquinas exigidas · ${fmt(totais.oficina)} paradas na oficina`}
                    >
                        <BarraCobertura propria={proprias} terceira={totais.terceiros || 0} falta={totais.gap || 0} />
                    </Tile>

                    <Tile
                        label="Terceiros"
                        valor={fmt(terceiros.horasContratadas)}
                        unidade="h"
                        dinheiro={
                            terceiros.valorContratado > 0
                                ? `${fmtBRL(terceiros.valorContratado)} · ${fmtBRL(terceiros.saldoAPagar)} a pagar`
                                : null
                        }
                        rodape={
                            <>
                                {terceiros.contratos} contratos · {terceiros.emContrato} máquinas em contrato
                                {terceiros.soObra > 0 && (
                                    <><br />
                                        <b style={{ color: COR.crit }}>+{terceiros.soObra} em obra sem contrato cadastrado</b>
                                        {' '}— produzem, mas não entram em nenhuma soma de R$
                                    </>
                                )}
                                {valor.pctTerceiros != null && (
                                    <><br /><b className="text-gray-700">{valor.pctTerceiros}% do valor da carteira</b> sai para terceiros</>
                                )}
                            </>
                        }
                    />

                    <Tile
                        alerta
                        label="Sem como produzir"
                        valor={fmt(totais.gapHoras)}
                        unidade="h"
                        dinheiro={valor.gap > 0 ? `${fmtBRL(valor.gap)} de contrato parado` : null}
                        rodape={
                            <>
                                {fmt(totais.gap)} máquinas a contratar · cai para{' '}
                                <b className="text-gray-700">{fmt(totais.gapComOficina)}</b> se a oficina devolver as {fmt(totais.oficina)}
                            </>
                        }
                    />
                </div>

                {/* Quebra da mesma carteira por estágio. Fica colada na Faixa 1 — sem
                    título próprio — porque é o detalhamento dela, não um assunto novo.
                    Some quando o backend não manda `porStatus`: ao contrário da Faixa 2,
                    aqui não há ambiguidade a proteger; tudo que ela mostra já está
                    consolidado logo acima. */}
                {porStatus.length > 0 && (
                    <PorStatus
                        linhas={porStatus}
                        prazoAlvo={params.diasUteisPrazo}
                        hoje={params.janela?.inicio}
                    />
                )}

                {/* ══ FAIXA 2 ═══════════════════════════════════════════════ */}
                {/* Esta faixa NUNCA some em silêncio. Sumir faria "não terceirizamos
                    nada" e "o servidor não está mandando este dado" parecerem a mesma
                    coisa na tela — e a segunda é justamente a que precisa ser vista. */}
                <FaixaTitulo titulo="Dependência de terceiros" nota="o que já aconteceu, e onde o dinheiro sai" />

                {!producao && obrasTerceirizadas.length === 0 ? (
                    <Card titulo="Dados não recebidos">
                        <p className="text-[12.5px] text-gray-500 leading-relaxed">
                            O servidor respondeu sem os blocos de produção e de terceirização por obra. Isso acontece
                            quando o backend ainda está numa versão anterior à desta tela — o restante do panorama
                            continua correto, só esta faixa depende dos campos novos.
                        </p>
                    </Card>
                ) : (
                    /* Empilhadas em largura total: "quem produziu" é uma barra
                       horizontal e a tabela de obras quer largura. Lado a lado, o
                       card curto deixava vazio — dentro ou fora da borda, conforme
                       esticasse ou não. */
                    <div className="flex flex-col gap-3">
                        {producao
                            ? <Producao producao={producao} />
                            : <Card titulo="Quem produziu"><p className="text-[12.5px] text-gray-400">Sem dados de produção nesta resposta.</p></Card>}
                        {obrasTerceirizadas.length > 0
                            ? <ObrasTerceirizadas obras={obrasTerceirizadas} saldoTotal={terceiros.saldoAPagar} />
                            : <Card titulo="Onde terceirizamos"><p className="text-[12.5px] text-gray-400">Nenhuma obra com horas de terceiros apontadas ou contrato vinculado.</p></Card>}
                    </div>
                )}

                {/* ══ FAIXA 3 ═══════════════════════════════════════════════ */}
                <FaixaTitulo titulo="O que destrava" nota="onde falta máquina e o que se libera sem gastar" />

                <div className="grid gap-3 grid-cols-1 lg:[grid-template-columns:minmax(0,1.5fr)_minmax(0,1fr)]">
                    <Card
                        titulo="Falta de equipamento"
                        extra={todosGrupos ? 'todos os grupos · escala comum' : `largura = máquinas exigidas · ${LIMITE_GAP} maiores`}
                    >
                        <div className="flex flex-col">
                            {visiveis.map(l => (
                                <LinhaGap
                                    key={l.subgrupo}
                                    linha={l}
                                    escala={escala}
                                    aberta={!!abertas[l.subgrupo]}
                                    onToggle={() => setAbertas(a => ({ ...a, [l.subgrupo]: !a[l.subgrupo] }))}
                                />
                            ))}
                        </div>

                        {subgrupos.length > LIMITE_GAP && (
                            <button
                                type="button"
                                onClick={() => setTodosGrupos(t => !t)}
                                className="mt-2.5 w-full rounded-md border py-1.5 text-[12px] font-semibold text-gray-500"
                                style={{ borderColor: COR.linha, background: COR.creme }}
                            >
                                {todosGrupos
                                    ? 'Mostrar só os 6 maiores'
                                    : `Ver os outros ${subgrupos.length - LIMITE_GAP} grupos${ocultosComGap > 0 ? ` (−${ocultosComGap} máquinas)` : ''}`}
                            </button>
                        )}

                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t text-[11.5px] text-gray-500" style={{ borderColor: COR.linha }}>
                            <span className="flex items-center gap-1.5"><i className="w-3 h-2.5 rounded-sm" style={{ background: COR.propria }} />Nossa frota em campo</span>
                            <span className="flex items-center gap-1.5"><i className="w-3 h-2.5 rounded-sm" style={{ background: COR.terceira }} />Terceiros contratados</span>
                            <span className="flex items-center gap-1.5"><i className="w-3 h-2.5 rounded-sm" style={{ background: COR.falta, boxShadow: `inset 0 0 0 1px ${COR.faltaBorda}` }} />Falta contratar</span>
                            <span className="ml-auto text-gray-400">Sobra de um grupo não cobre falta de outro.</span>
                        </div>
                    </Card>

                    <LiberaEmBreve liberando={liberando} totais={totais} valor={valor} params={params} subgrupos={subgrupos} />
                </div>

                {/* ══ CONFIANÇA DO NÚMERO ═══════════════════════════════════ */}
                <div
                    className="rounded-xl border px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-gray-600"
                    style={{ borderColor: COR.linha, background: COR.creme }}
                >
                    {cobertura?.obrasSemPlano > 0 && (
                        <FileWarning size={13} className="shrink-0" style={{ color: cobertura.pct < 80 ? COR.crit : COR.propria }} />
                    )}
                    <span><b className="tabular-nums">{cobertura?.obrasComPlano ?? 0}</b> de <b className="tabular-nums">{cobertura?.obrasAbertas ?? 0}</b> obras com plano de trabalho</span>
                    {cobertura?.obrasSemPlano > 0 && (
                        <span style={{ color: COR.crit }}>
                            <b className="tabular-nums">{cobertura.obrasSemPlano}</b> sem plano, fora de todos os números
                        </span>
                    )}
                    {cobertura?.obrasSemTarifa > 0 && (
                        <span><b className="tabular-nums">{cobertura.obrasSemTarifa}</b> sem valor de contrato, fora das somas de R$</span>
                    )}
                    {cobertura?.planosNivelGrupo > 0 && (
                        <span><b className="tabular-nums">{cobertura.planosNivelGrupo}</b> planos em nível de grupo</span>
                    )}
                    {radar.length > 0 && (
                        <span><b className="tabular-nums">{radar.length}</b> obras no radar, sem plano fechado</span>
                    )}
                    <button
                        type="button"
                        onClick={() => setDetalhe(d => !d)}
                        className="ml-auto flex items-center gap-1 font-semibold"
                        style={{ color: COR.propria }}
                    >
                        Detalhamento <ArrowRight size={12} className={`transition-transform ${detalhe ? 'rotate-90' : ''}`} />
                    </button>
                </div>

                {/* ══ DETALHAMENTO ══════════════════════════════════════════ */}
                {detalhe && (
                    <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                        {cobertura?.gruposAgregadosPorCadastro?.length > 0 && (
                            <Card titulo="Porte não cadastrado" extra={`${cobertura.gruposAgregadosPorCadastro.length} grupos`}>
                                <p className="text-[12px] text-gray-500 mb-2 flex gap-1.5">
                                    <Wrench size={13} className="shrink-0 mt-0.5 text-gray-400" />
                                    Nestes grupos há máquina própria sem porte definido, então demanda e frota aparecem
                                    agregadas. A tela detalha sozinha conforme o cadastro for completado.
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
                                    <div key={o.id} className="flex items-baseline justify-between gap-2 py-1.5 border-t text-[12.5px]" style={{ borderColor: COR.linhaSuave }}>
                                        <span className="truncate text-gray-600">{o.nome}</span>
                                        <span className="text-[10.5px] text-gray-400 whitespace-nowrap">
                                            {[o.orgao_contratante, o.confiancaInfo?.replace('_', ' ')].filter(Boolean).join(' · ') || '—'}
                                        </span>
                                    </div>
                                ))}
                            </Card>
                        )}

                        {terceiros.contratosFechado > 0 && (
                            <Card titulo="Contratos de valor fechado" extra={`${terceiros.contratosFechado} contratos`}>
                                <p className="text-[12px] text-gray-500">
                                    Não declaram horas contratadas, só valor. Entram nas somas de R$ e no saldo a pagar,
                                    mas não nas horas de terceiros — por isso o R$/h deles sai das horas efetivamente apontadas.
                                </p>
                            </Card>
                        )}
                    </div>
                )}

                <p className="text-[11.5px] text-gray-400 leading-relaxed px-1">
                    Premissa: todas as obras em carteira precisam de máquina ao mesmo tempo — o encaixe entre o fim de uma
                    obra e o início de outra é decidido fora do sistema. Capacidade de {params.HORAS_POR_DIA} h por dia útil
                    ({params.diasUteisPrazo} dias úteis em {params.PRAZO_ALVO_DIAS} dias = {fmt(params.horasPorMaquina)} h por máquina).
                    O R$/h vem do contrato da obra (valor total ÷ horas contratadas); nenhuma cifra desta tela é projetada, e não
                    há valor por equipamento porque o contrato precifica a obra, não o subgrupo. Frota da empresa inteira, sem
                    recorte por região. Sucata e veículos leves excluídos.
                </p>
            </div>
        </div>
    );
};

export default PanoramaCapacidade;
