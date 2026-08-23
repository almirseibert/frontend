// src/components/admin/AbastecimentoIaTab.js
//
// Parâmetros e acompanhamento do aceite automático de abastecimento.
// Ver backend/docs/aceite-automatico-ia.md.
//
// Duas metades:
//  - configuração (o switch sombra/ativo, escopo do piloto e limiares);
//  - painel de concordância, que é o critério objetivo para virar a chave.
//
// A regra do piloto é: enquanto houver QUALQUER falso positivo (a IA teria
// liberado e o humano negou), não se liga o modo ativo. A tela deixa isso
// explícito em vez de depender de alguém lembrar.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Sparkles, Loader, Save, AlertTriangle, ShieldCheck, ShieldAlert,
    RefreshCw, Info, Power,
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import { formatObraNome } from '../../utils/obraFormat';
import { ehVerdadeiro } from '../refueling/IaParecer';

const ROTULO_PORTAO = {
    G0_elegibilidade: 'Escopo do piloto',
    G1_regras_soberanas: 'Regras de abastecimento',
    G2_media: 'Média de consumo',
    G3_necessidade: 'Necessidade de abastecer',
    G4_visao: 'Leitura da foto',
    G5_teto: 'Teto de valor',
};

const Campo = ({ label, ajuda, children }) => (
    <div>
        <label className="block text-xs font-bold text-gray-700 mb-1">{label}</label>
        {children}
        {ajuda && <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{ajuda}</p>}
    </div>
);

const NumeroInput = ({ valor, onChange, sufixo, step = '0.01' }) => (
    <div className="relative">
        <input
            type="number"
            step={step}
            value={valor ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full p-2 pr-10 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-yellow-400 outline-none"
        />
        {sufixo && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">
                {sufixo}
            </span>
        )}
    </div>
);

const Metrica = ({ rotulo, valor, cor = 'text-gray-800', destaque }) => (
    <div className={`rounded-lg p-3 border ${destaque ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
        <p className="text-[10px] text-gray-500 uppercase font-bold">{rotulo}</p>
        <p className={`text-2xl font-bold ${cor}`}>{valor ?? 0}</p>
    </div>
);

const AbastecimentoIaTab = () => {
    const [config, setConfig] = useState(null);
    const [metricas, setMetricas] = useState(null);
    const [obras, setObras] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [mensagem, setMensagem] = useState(null);
    const [dias, setDias] = useState(30);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const [cfg, met, obrasLista] = await Promise.all([
                apiClient.getAbastecimentoAutoConfig(),
                apiClient.getAbastecimentoAutoMetricas(dias),
                apiClient.getObras().catch(() => []),
            ]);
            setConfig(cfg);
            setMetricas(met);
            setObras(Array.isArray(obrasLista) ? obrasLista : []);
        } catch (e) {
            setMensagem({ tipo: 'erro', texto: 'Falha ao carregar: ' + e.message });
        } finally {
            setCarregando(false);
        }
    }, [dias]);

    useEffect(() => { carregar(); }, [carregar]);

    const obrasHabilitadas = useMemo(() => {
        const bruto = config?.obras_habilitadas;
        if (!bruto) return [];
        if (Array.isArray(bruto)) return bruto;
        try { const v = JSON.parse(bruto); return Array.isArray(v) ? v : []; } catch { return []; }
    }, [config]);

    const alterar = (campo, valor) => setConfig((c) => ({ ...c, [campo]: valor }));

    const alternarObra = (obraId) => {
        const atual = obrasHabilitadas.map(String);
        const novo = atual.includes(String(obraId))
            ? atual.filter((o) => o !== String(obraId))
            : [...atual, String(obraId)];
        alterar('obras_habilitadas', novo);
    };

    const salvar = async () => {
        setSalvando(true);
        setMensagem(null);
        try {
            const salvo = await apiClient.updateAbastecimentoAutoConfig({
                ...config,
                obras_habilitadas: obrasHabilitadas,
            });
            setConfig(salvo);
            setMensagem({ tipo: 'ok', texto: 'Parâmetros salvos.' });
        } catch (e) {
            setMensagem({ tipo: 'erro', texto: 'Falha ao salvar: ' + e.message });
        } finally {
            setSalvando(false);
        }
    };

    if (carregando) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader size={28} className="animate-spin" />
            </div>
        );
    }

    if (!config) {
        return (
            <div className="text-center py-20 text-gray-500">
                Configuração não encontrada. Verifique se as migrações rodaram.
            </div>
        );
    }

    const c = metricas?.concordancia || {};
    const t = metricas?.totais || {};
    const falsosPositivos = Number(c.falso_positivo || 0);
    const resolvidas = Number(c.resolvidas || 0);
    const acertos = Number(c.acerto_liberar || 0) + Number(c.acerto_reter || 0);
    const taxaConcordancia = resolvidas > 0 ? ((acertos / resolvidas) * 100).toFixed(1) : null;
    const podeAtivar = resolvidas >= 20 && falsosPositivos === 0;

    return (
        <div className="space-y-6 max-w-5xl">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Sparkles size={18} className="text-purple-600" /> Aceite Automático (IA)
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        A IA lê a foto do painel e do cupom. Ela nunca nega nada — só decide entre
                        liberar sozinha e encaminhar ao setor.
                    </p>
                </div>
                <button
                    onClick={carregar}
                    className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 border border-gray-200 shrink-0"
                    title="Recarregar"
                >
                    <RefreshCw size={16} className="text-gray-600" />
                </button>
            </div>

            {!config.credencial_ia_configurada && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 items-start">
                    <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-red-800">
                        <p className="font-bold">ANTHROPIC_API_KEY não configurada neste ambiente.</p>
                        <p>
                            A leitura de imagem fica indisponível e o portão da foto sempre devolve
                            "indeterminado" — ou seja, tudo vai para conferência humana.
                        </p>
                    </div>
                </div>
            )}

            {mensagem && (
                <div className={`rounded-lg p-2.5 text-xs font-medium ${
                    mensagem.tipo === 'ok'
                        ? 'bg-green-50 text-green-800 border border-green-200'
                        : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                    {mensagem.texto}
                </div>
            )}

            {/* ─── Liga/desliga e modo ─── */}
            <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                    <Power size={15} /> Operação
                </h3>

                <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={ehVerdadeiro(config.ativo)}
                            onChange={(e) => alterar('ativo', e.target.checked ? 1 : 0)}
                            className="w-4 h-4 accent-yellow-500"
                        />
                        <span className="text-sm font-bold text-gray-800">Motor ligado</span>
                    </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                        onClick={() => alterar('modo', 'sombra')}
                        className={`text-left p-3 rounded-lg border-2 transition ${
                            config.modo !== 'ativo'
                                ? 'border-purple-500 bg-purple-50'
                                : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                        <p className="font-bold text-sm text-gray-800">Modo sombra</p>
                        <p className="text-[11px] text-gray-600 leading-tight mt-0.5">
                            A IA analisa e registra o que faria. Nada é liberado; o operador não vê
                            nenhum aviso. É o que alimenta a taxa de concordância abaixo.
                        </p>
                    </button>

                    <button
                        onClick={() => {
                            if (!podeAtivar) return;
                            alterar('modo', 'ativo');
                        }}
                        disabled={!podeAtivar}
                        className={`text-left p-3 rounded-lg border-2 transition ${
                            config.modo === 'ativo'
                                ? 'border-green-600 bg-green-50'
                                : podeAtivar
                                    ? 'border-gray-200 hover:border-gray-300'
                                    : 'border-gray-200 opacity-50 cursor-not-allowed'
                        }`}
                    >
                        <p className="font-bold text-sm text-gray-800">Modo ativo</p>
                        <p className="text-[11px] text-gray-600 leading-tight mt-0.5">
                            {podeAtivar
                                ? 'A ordem é emitida automaticamente quando todos os critérios passam.'
                                : `Bloqueado: precisa de pelo menos 20 solicitações resolvidas e zero falsos positivos (hoje: ${resolvidas} resolvidas, ${falsosPositivos} falso(s) positivo(s)).`}
                        </p>
                    </button>
                </div>
            </section>

            {/* ─── Escopo do piloto ─── */}
            <section className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-bold text-gray-800 mb-1">Obras participantes</h3>
                <p className="text-[11px] text-gray-500 mb-3">
                    Sem nenhuma obra marcada, o motor não analisa nada. Comece por uma.
                </p>
                <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
                    {obras.length === 0 && (
                        <p className="p-3 text-xs text-gray-400">Nenhuma obra carregada.</p>
                    )}
                    {obras.map((o) => (
                        <label key={o.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={obrasHabilitadas.map(String).includes(String(o.id))}
                                onChange={() => alternarObra(o.id)}
                                className="w-4 h-4 accent-yellow-500"
                            />
                            <span className="text-xs text-gray-700">{formatObraNome(o) || o.nome}</span>
                        </label>
                    ))}
                </div>
                <p className="text-[11px] text-gray-600 mt-2">
                    {obrasHabilitadas.length} obra(s) no piloto.
                </p>
            </section>

            {/* ─── Limiares ─── */}
            <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
                <h3 className="text-sm font-bold text-gray-800">Limiares</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Campo
                        label="Confiança mínima — painel"
                        ajuda="Abaixo disso a leitura da foto vai para conferência humana."
                    >
                        <NumeroInput
                            valor={config.confianca_minima_painel}
                            onChange={(v) => alterar('confianca_minima_painel', v)}
                            sufixo="0-1"
                            step="0.01"
                        />
                    </Campo>

                    <Campo label="Confiança mínima — cupom" ajuda="Idem para a leitura da nota fiscal.">
                        <NumeroInput
                            valor={config.confianca_minima_cupom}
                            onChange={(v) => alterar('confianca_minima_cupom', v)}
                            sufixo="0-1"
                            step="0.01"
                        />
                    </Campo>

                    <Campo label="Tolerância de leitura — Km" ajuda="Diferença aceita entre a foto e o valor digitado.">
                        <NumeroInput
                            valor={config.tolerancia_leitura_km}
                            onChange={(v) => alterar('tolerancia_leitura_km', v)}
                            sufixo="Km"
                        />
                    </Campo>

                    <Campo label="Tolerância de leitura — horas">
                        <NumeroInput
                            valor={config.tolerancia_leitura_hr}
                            onChange={(v) => alterar('tolerancia_leitura_hr', v)}
                            sufixo="h"
                        />
                    </Campo>

                    <Campo
                        label="Tolerância de média"
                        ajuda="Usada quando o veículo não tem tolerância própria cadastrada."
                    >
                        <NumeroInput
                            valor={config.tolerancia_media_padrao}
                            onChange={(v) => alterar('tolerancia_media_padrao', v)}
                            sufixo="%"
                        />
                    </Campo>

                    <Campo
                        label="Mínimo de abastecimentos no histórico"
                        ajuda="Abaixo disso a média não é confiável e a solicitação vai para conferência."
                    >
                        <NumeroInput
                            valor={config.min_intervalos_historico}
                            onChange={(v) => alterar('min_intervalos_historico', v)}
                            step="1"
                        />
                    </Campo>

                    <Campo
                        label="Consumo mínimo para completar tanque"
                        ajuda="Percentual do tanque que precisa ter sido gasto para justificar um enchimento."
                    >
                        <NumeroInput
                            valor={config.percentual_minimo_tanque}
                            onChange={(v) => alterar('percentual_minimo_tanque', v)}
                            sufixo="%"
                        />
                    </Campo>

                    <Campo
                        label="Teto de valor automático"
                        ajuda="Ordem estimada acima disso sempre vai para conferência."
                    >
                        <NumeroInput
                            valor={config.limite_valor_auto}
                            onChange={(v) => alterar('limite_valor_auto', v)}
                            sufixo="R$"
                        />
                    </Campo>

                    <Campo label="Exigir histórico tanque-a-tanque">
                        <label className="flex items-center gap-2 cursor-pointer p-2">
                            <input
                                type="checkbox"
                                checked={ehVerdadeiro(config.exigir_tanque_cheio_historico)}
                                onChange={(e) => alterar('exigir_tanque_cheio_historico', e.target.checked ? 1 : 0)}
                                className="w-4 h-4 accent-yellow-500"
                            />
                            <span className="text-xs text-gray-700">
                                Só confiar em intervalos entre dois tanques cheios
                            </span>
                        </label>
                    </Campo>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-gray-500 bg-gray-50 rounded p-2">
                    <Info size={13} className="shrink-0" />
                    <span>
                        Modelos: <strong>{config.modelo_rapido}</strong> na primeira leitura,
                        escalando para <strong>{config.modelo_preciso}</strong> quando a confiança
                        fica abaixo do limiar.
                    </span>
                </div>

                <button
                    onClick={salvar}
                    disabled={salvando}
                    className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold rounded-lg text-sm disabled:opacity-50"
                >
                    {salvando ? <Loader size={15} className="animate-spin" /> : <Save size={15} />}
                    Salvar parâmetros
                </button>
            </section>

            {/* ─── Concordância ─── */}
            <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-gray-800">Concordância com o setor</h3>
                    <select
                        value={dias}
                        onChange={(e) => setDias(parseInt(e.target.value, 10))}
                        className="text-xs border rounded-lg px-2 py-1"
                    >
                        <option value={7}>7 dias</option>
                        <option value={30}>30 dias</option>
                        <option value={90}>90 dias</option>
                    </select>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Metrica rotulo="Analisadas" valor={t.analisadas} />
                    <Metrica rotulo="IA liberaria" valor={t.ia_liberaria} cor="text-green-700" />
                    <Metrica rotulo="IA encaminhou" valor={t.ia_encaminharia} cor="text-amber-700" />
                    <Metrica
                        rotulo="Falsos positivos"
                        valor={falsosPositivos}
                        cor={falsosPositivos > 0 ? 'text-red-700' : 'text-gray-800'}
                        destaque={falsosPositivos > 0}
                    />
                </div>

                {taxaConcordancia !== null ? (
                    <div className={`rounded-lg p-3 border flex items-start gap-2 ${
                        falsosPositivos > 0
                            ? 'bg-red-50 border-red-200'
                            : 'bg-green-50 border-green-200'
                    }`}>
                        {falsosPositivos > 0
                            ? <ShieldAlert size={16} className="text-red-600 shrink-0 mt-0.5" />
                            : <ShieldCheck size={16} className="text-green-600 shrink-0 mt-0.5" />}
                        <div className="text-xs">
                            <p className="font-bold text-gray-800">
                                {taxaConcordancia}% de concordância em {resolvidas} solicitação(ões) resolvida(s).
                            </p>
                            <p className="text-gray-600 mt-0.5">
                                {falsosPositivos > 0
                                    ? `${falsosPositivos} vez(es) a IA teria liberado algo que o setor negou. Enquanto isso acontecer, o modo ativo fica bloqueado.`
                                    : 'Nenhum caso em que a IA teria liberado algo negado pelo setor.'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-gray-500">
                        Ainda não há solicitações analisadas e resolvidas no período.
                    </p>
                )}

                {metricas?.porPortao?.length > 0 && (
                    <div>
                        <h4 className="text-xs font-bold text-gray-700 mb-1.5">O que mais retém</h4>
                        <div className="space-y-1">
                            {metricas.porPortao.map((p) => (
                                <div key={`${p.portao}-${p.status}`} className="flex items-center gap-2 text-xs">
                                    <span className="w-44 font-medium text-gray-700 truncate">
                                        {ROTULO_PORTAO[p.portao] || p.portao}
                                    </span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        p.status === 'falha'
                                            ? 'bg-red-100 text-red-700'
                                            : 'bg-amber-100 text-amber-700'
                                    }`}>
                                        {p.status === 'falha' ? 'reprovou' : 'sem dados'}
                                    </span>
                                    <span className="font-bold text-gray-800">{p.n}</span>
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1.5">
                            "Sem dados" costuma ser cadastro faltando (capacidade de tanque, média
                            esperada, histórico curto) — não é erro da IA.
                        </p>
                    </div>
                )}

                {metricas?.custo?.chamadas > 0 && (
                    <p className="text-[11px] text-gray-500 border-t pt-2">
                        {metricas.custo.chamadas} leitura(s) de imagem no período
                        {metricas.custo.escalonadas > 0 && `, ${metricas.custo.escalonadas} escalonada(s) para o modelo preciso`}
                        {metricas.custo.latencia_media_ms && ` · ${metricas.custo.latencia_media_ms} ms em média`}.
                    </p>
                )}
            </section>
        </div>
    );
};

export default AbastecimentoIaTab;
