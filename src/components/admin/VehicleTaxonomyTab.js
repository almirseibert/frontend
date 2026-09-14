import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Truck, Plus, Edit2, Trash2, Loader, Fuel, Check, X, AlertTriangle, RefreshCw } from 'lucide-react';
import apiClient from '../../services/apiClient';
import VehicleTypeConfigModal from '../modals/VehicleTypeConfigModal';

// Vocabulário: o banco fala grupo/tipo/sub-tipo, o negócio fala
// Categoria/Grupo/Subgrupo. A tela usa o vocabulário do negócio.
//   vehicle_groups    → Categoria (define a unidade de consumo)
//   vehicle_types     → Grupo
//   vehicle_sub_types → Subgrupo (pode pertencer a vários Grupos da mesma Categoria)

const UNIDADES = ['L/h', 'h/L', 'Km/L', 'L/Km'];

const unidadeHint = (u) => {
    switch (u) {
        case 'Km/L': return 'Odômetro · km por litro (maior = melhor)';
        case 'L/Km': return 'Odômetro · litros por km (menor = melhor)';
        case 'h/L':  return 'Horímetro · horas por litro (maior = melhor)';
        case 'L/h':
        default:     return 'Horímetro · litros por hora (menor = melhor)';
    }
};

const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

const VehicleTaxonomyTab = () => {
    const [tree, setTree] = useState([]);
    const [subgrupos, setSubgrupos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [toast, setToast] = useState('');
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [saving, setSaving] = useState(false);

    // seleção: filtra a coluna seguinte (não aninha)
    const [selCat, setSelCat] = useState(null);
    const [selGrp, setSelGrp] = useState(null);

    // criação/edição inline
    const [newCatName, setNewCatName] = useState('');
    const [addingCat, setAddingCat] = useState(false);
    const [newGrpName, setNewGrpName] = useState('');
    const [addingGrp, setAddingGrp] = useState(false);
    const [subForm, setSubForm] = useState(null); // { id|null, nome, grupos:[] }

    const toastTimer = useRef(null);
    const showToast = (msg) => {
        setToast(msg);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(''), 5000);
    };

    const load = async () => {
        setLoading(true);
        setLoadError('');
        try {
            const [data, subs] = await Promise.all([
                apiClient.getVehicleTaxonomy(),
                apiClient.getVehicleSubTypes(),
            ]);
            setTree(Array.isArray(data) ? data : []);
            setSubgrupos(Array.isArray(subs) ? subs : []);
        } catch (e) {
            setLoadError(e.message || 'Erro ao carregar. Verifique se o servidor está rodando e foi reiniciado após a última atualização.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const run = async (fn, okMsg) => {
        setSaving(true);
        try {
            await fn();
            if (okMsg) showToast(okMsg);
            await load();
            return true;
        } catch (e) {
            showToast(e.message || 'Erro na operação.');
            return false;
        } finally {
            setSaving(false);
        }
    };

    // ── Índices derivados ─────────────────────────────────────────────────
    const grupos = useMemo(
        () => tree.flatMap(c => (c.tipos || []).map(t => ({ ...t, catId: c.id, catNome: c.nome, unidade: c.unidade }))),
        [tree]
    );
    const grupoById = useMemo(() => Object.fromEntries(grupos.map(g => [g.id, g])), [grupos]);

    const gruposVisiveis = useMemo(
        () => (selCat ? grupos.filter(g => g.catId === selCat) : grupos),
        [grupos, selCat]
    );

    // Subgrupo sem nenhum grupo aparece SEMPRE, em qualquer filtro. Ele nasce assim
    // quando um grupo é excluído e leva os vínculos junto; se sumisse das visões
    // filtradas, continuaria ocupando o nome no índice único global e ninguém
    // conseguiria achá-lo para corrigir — só um 409 inexplicável ao tentar recriar.
    const subsVisiveis = useMemo(() => {
        const orfaos = subgrupos.filter(s => (s.grupos || []).length === 0);
        if (selGrp) {
            return [...subgrupos.filter(s => (s.grupos || []).includes(selGrp)), ...orfaos];
        }
        if (selCat) {
            return [
                ...subgrupos.filter(s => (s.grupos || []).some(id => grupoById[id]?.catId === selCat)),
                ...orfaos,
            ];
        }
        return subgrupos;
    }, [subgrupos, selGrp, selCat, grupoById]);

    const orfaosCount = useMemo(
        () => subgrupos.filter(s => (s.grupos || []).length === 0).length,
        [subgrupos]
    );

    // Categoria travada pelo primeiro grupo marcado — é o que impede o subgrupo
    // de valer em duas categorias com unidades de consumo diferentes.
    const catTravada = useMemo(() => {
        const primeiro = subForm?.grupos?.[0];
        return primeiro ? grupoById[primeiro]?.catId : null;
    }, [subForm, grupoById]);

    // ── Categoria ─────────────────────────────────────────────────────────
    const addCat = async () => {
        const nome = newCatName.trim();
        if (!nome) return;
        const ok = await run(() => apiClient.createVehicleGroup({ nome, unidade: 'L/h' }), `Categoria "${nome}" criada.`);
        if (ok) { setNewCatName(''); setAddingCat(false); }
    };
    const renameCat = (c) => {
        const nome = window.prompt('Novo nome da categoria:', c.nome);
        if (!nome || nome.trim() === c.nome) return;
        run(() => apiClient.updateVehicleGroup(c.id, { nome: nome.trim(), unidade: c.unidade }), 'Categoria renomeada.');
    };
    const setUnidade = (c, unidade) =>
        run(() => apiClient.updateVehicleGroup(c.id, { nome: c.nome, unidade }), `Unidade de "${c.nome}" agora é ${unidade}.`);
    const removeCat = (c) => {
        // O CASCADE não para nos grupos: leva junto os vínculos de subgrupo deles.
        // Avisar só sobre grupos escondia a perda do trabalho de vinculação.
        const idsDosGrupos = (c.tipos || []).map(t => t.id);
        const subsAfetados = subgrupos.filter(s => (s.grupos || []).some(id => idsDosGrupos.includes(id)));
        const orfanariam = subsAfetados.filter(
            s => (s.grupos || []).every(id => idsDosGrupos.includes(id))
        );

        const linhas = [
            `Excluir a categoria "${c.nome}"?`,
            '',
            `• ${plural(idsDosGrupos.length, 'grupo sera excluido', 'grupos serao excluidos')}`,
        ];
        if (subsAfetados.length) {
            linhas.push(`• ${plural(subsAfetados.length, 'subgrupo perde', 'subgrupos perdem')} o vinculo com esses grupos`);
        }
        if (orfanariam.length) {
            linhas.push(`• ${plural(orfanariam.length, 'subgrupo fica', 'subgrupos ficam')} sem nenhum grupo: `
                + orfanariam.map(s => s.nome).join(', '));
        }
        const msg = linhas.join('\n');
        if (!window.confirm(msg)) return;
        run(() => apiClient.deleteVehicleGroup(c.id), `Categoria "${c.nome}" excluída.`);
    };

    // ── Grupo ─────────────────────────────────────────────────────────────
    const addGrp = async () => {
        const nome = newGrpName.trim();
        if (!nome || !selCat) return;
        const ok = await run(() => apiClient.createVehicleType({ group_id: selCat, nome }), `Grupo "${nome}" criado.`);
        if (ok) { setNewGrpName(''); setAddingGrp(false); }
    };
    const renameGrp = (g) => {
        const nome = window.prompt('Novo nome do grupo:', g.nome);
        if (!nome || nome.trim() === g.nome) return;
        run(() => apiClient.updateVehicleType(g.id, { nome: nome.trim() }), 'Grupo renomeado.');
    };
    const removeGrp = (g) => {
        const vinculados = subgrupos.filter(s => (s.grupos || []).includes(g.id));
        const orfanariam = vinculados.filter(s => (s.grupos || []).length === 1);

        const linhas = [`Excluir o grupo "${g.nome}"?`];
        if (vinculados.length) {
            linhas.push('', `• ${plural(vinculados.length, 'subgrupo perde', 'subgrupos perdem')} o vinculo com ele`);
        }
        if (orfanariam.length) {
            linhas.push(`• ${plural(orfanariam.length, 'subgrupo fica', 'subgrupos ficam')} sem nenhum grupo: `
                + orfanariam.map(s => s.nome).join(', '));
        }
        const msg = linhas.join('\n');
        if (!window.confirm(msg)) return;
        // O backend exige confirmação explícita quando há vínculo em jogo (409 com
        // exigeConfirmacao) — o usuário já confirmou aqui, com os números na frente.
        run(() => apiClient.deleteVehicleType(g.id, { confirmar: vinculados.length > 0 }),
            `Grupo "${g.nome}" excluído.`);
    };

    // ── Subgrupo ──────────────────────────────────────────────────────────
    const openSubForm = (sub) => setSubForm(
        sub ? { id: sub.id, nome: sub.nome, grupos: [...(sub.grupos || [])] }
            : { id: null, nome: '', grupos: selGrp ? [selGrp] : [] }
    );
    const toggleGrupoNoForm = (id) => setSubForm(f => ({
        ...f,
        grupos: f.grupos.includes(id) ? f.grupos.filter(x => x !== id) : [...f.grupos, id],
    }));
    const salvarSub = async () => {
        const nome = (subForm.nome || '').trim();
        if (!nome) { showToast('Dê um nome ao subgrupo antes de salvar.'); return; }
        if (subForm.grupos.length === 0) {
            showToast('Marque pelo menos um grupo — é ele que diz onde este subgrupo se encaixa.');
            return;
        }
        const payload = { nome, type_ids: subForm.grupos };
        const ok = await run(
            () => (subForm.id
                ? apiClient.updateVehicleSubType(subForm.id, payload)
                : apiClient.createVehicleSubType(payload)),
            subForm.id ? 'Subgrupo atualizado.' : `Subgrupo "${nome}" criado.`
        );
        if (ok) setSubForm(null);
    };
    const removeSub = (s) => {
        if (!window.confirm(`Excluir o subgrupo "${s.nome}"?`)) return;
        run(() => apiClient.deleteVehicleSubType(s.id), `Subgrupo "${s.nome}" excluído.`);
    };

    // ── Render ────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-500 gap-2">
                <Loader size={18} className="animate-spin" /> Carregando taxonomia…
            </div>
        );
    }

    const colHeader = (titulo, contagem, onAdd, addLabel, addDisabled, addTitle) => (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-200 bg-gray-50">
            <div className="flex items-baseline gap-2 min-w-0">
                <h3 className="font-bold text-[11px] tracking-wider uppercase text-gray-600">{titulo}</h3>
                <span className="text-[11px] text-gray-400 tabular-nums">{contagem}</span>
            </div>
            <button
                type="button"
                onClick={onAdd}
                disabled={addDisabled || saving}
                title={addTitle}
                className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
                <Plus size={13} /> {addLabel}
            </button>
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Cabeçalho */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Truck size={18} className="text-gray-500" />
                    <h2 className="font-bold text-gray-800">Taxonomia de Equipamentos</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button" onClick={load} title="Recarregar"
                        className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <button
                        type="button" onClick={() => setShowConfigModal(true)}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                        <Fuel size={14} /> Médias de consumo
                    </button>
                </div>
            </div>

            <p className="text-sm text-gray-600 max-w-3xl">
                Categoria, Grupo e Subgrupo são criados de forma independente. Um <b>Subgrupo</b> declara
                em quais <b>Grupos</b> ele se encaixa — e só dentro da mesma <b>Categoria</b>, porque é a
                Categoria que define a unidade de consumo e o tipo de leitura do equipamento.
            </p>

            {loadError && (
                <div className="flex items-start gap-2 p-3 rounded border border-red-200 bg-red-50 text-red-700 text-sm">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {loadError}
                </div>
            )}
            {toast && (
                <div className="flex items-start gap-2 p-3 rounded border border-amber-200 bg-amber-50 text-amber-900 text-sm">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {toast}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1.35fr] gap-3 items-start">

                {/* ── Coluna 1: Categoria ───────────────────────────────── */}
                <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    {colHeader('Categoria', tree.length, () => setAddingCat(v => !v), 'Nova', false)}
                    <ul className="p-1.5 space-y-0.5 max-h-[430px] overflow-y-auto">
                        {tree.map(c => {
                            const nGrupos = (c.tipos || []).length;
                            const ativa = selCat === c.id;
                            return (
                                <li key={c.id}>
                                    <div
                                        className={`group flex items-center gap-2 px-2.5 py-2 rounded border cursor-pointer ${
                                            ativa ? 'bg-amber-50 border-amber-200' : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
                                        }`}
                                        onClick={() => { setSelCat(ativa ? null : c.id); setSelGrp(null); setSubForm(null); }}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-gray-800 break-words">{c.nome}</div>
                                            <div className="text-xs text-gray-400">{plural(nGrupos, 'grupo', 'grupos')}</div>
                                        </div>
                                        <select
                                            value={c.unidade}
                                            title={unidadeHint(c.unidade)}
                                            onClick={e => e.stopPropagation()}
                                            onChange={e => setUnidade(c, e.target.value)}
                                            className="text-[10px] font-mono border border-gray-300 rounded px-1 py-0.5 bg-white text-gray-600"
                                        >
                                            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                        <button
                                            type="button" title="Renomear categoria"
                                            onClick={e => { e.stopPropagation(); renameCat(c); }}
                                            className="p-1 text-gray-400 hover:text-gray-700 opacity-0 group-hover:opacity-100"
                                        ><Edit2 size={13} /></button>
                                        <button
                                            type="button" title="Excluir categoria"
                                            onClick={e => { e.stopPropagation(); removeCat(c); }}
                                            className="p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                                        ><Trash2 size={13} /></button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                    {addingCat && (
                        <div className="border-t border-gray-200 bg-gray-50 p-3 flex gap-2">
                            <input
                                autoFocus value={newCatName} onChange={e => setNewCatName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') addCat(); if (e.key === 'Escape') setAddingCat(false); }}
                                placeholder="Nome da categoria"
                                className="flex-1 text-sm px-2 py-1.5 border border-gray-300 rounded"
                            />
                            <button type="button" onClick={addCat} disabled={saving}
                                className="p-1.5 rounded bg-amber-700 text-white disabled:opacity-50"><Check size={14} /></button>
                            <button type="button" onClick={() => { setAddingCat(false); setNewCatName(''); }}
                                className="p-1.5 rounded border border-gray-300 text-gray-500"><X size={14} /></button>
                        </div>
                    )}
                </section>

                {/* ── Coluna 2: Grupo ───────────────────────────────────── */}
                <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    {colHeader(
                        'Grupo',
                        selCat ? `${gruposVisiveis.length} de ${grupos.length}` : grupos.length,
                        () => setAddingGrp(v => !v),
                        'Novo',
                        !selCat,
                        selCat ? 'Criar grupo nesta categoria' : 'Selecione uma categoria primeiro'
                    )}
                    <ul className="p-1.5 space-y-0.5 max-h-[430px] overflow-y-auto">
                        {gruposVisiveis.length === 0 && (
                            <li className="px-3 py-6 text-center text-sm text-gray-400 italic">
                                Nenhum grupo nesta categoria.
                            </li>
                        )}
                        {gruposVisiveis.map(g => {
                            const nSub = subgrupos.filter(s => (s.grupos || []).includes(g.id)).length;
                            const ativo = selGrp === g.id;
                            return (
                                <li key={g.id}>
                                    <div
                                        className={`group flex items-center gap-2 px-2.5 py-2 rounded border cursor-pointer ${
                                            ativo ? 'bg-amber-50 border-amber-200' : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
                                        }`}
                                        onClick={() => {
                                            setSelGrp(ativo ? null : g.id);
                                            if (!ativo) setSelCat(g.catId);
                                            setSubForm(null);
                                        }}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-gray-800 break-words">{g.nome}</div>
                                            <div className="text-xs text-gray-400">
                                                {nSub ? plural(nSub, 'subgrupo', 'subgrupos') : 'sem subgrupo'}
                                            </div>
                                        </div>
                                        <span className={`text-[11px] font-mono tabular-nums whitespace-nowrap ${g.veiculos ? 'text-gray-500' : 'text-gray-300'}`}>
                                            {g.veiculos ? plural(g.veiculos, 'veíc.', 'veíc.') : 'sem veíc.'}
                                        </span>
                                        <button
                                            type="button" title="Renomear grupo"
                                            onClick={e => { e.stopPropagation(); renameGrp(g); }}
                                            className="p-1 text-gray-400 hover:text-gray-700 opacity-0 group-hover:opacity-100"
                                        ><Edit2 size={13} /></button>
                                        <button
                                            type="button" title="Excluir grupo"
                                            onClick={e => { e.stopPropagation(); removeGrp(g); }}
                                            className="p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                                        ><Trash2 size={13} /></button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                    {addingGrp && selCat && (
                        <div className="border-t border-gray-200 bg-gray-50 p-3 flex gap-2">
                            <input
                                autoFocus value={newGrpName} onChange={e => setNewGrpName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') addGrp(); if (e.key === 'Escape') setAddingGrp(false); }}
                                placeholder="Nome do grupo"
                                className="flex-1 text-sm px-2 py-1.5 border border-gray-300 rounded"
                            />
                            <button type="button" onClick={addGrp} disabled={saving}
                                className="p-1.5 rounded bg-amber-700 text-white disabled:opacity-50"><Check size={14} /></button>
                            <button type="button" onClick={() => { setAddingGrp(false); setNewGrpName(''); }}
                                className="p-1.5 rounded border border-gray-300 text-gray-500"><X size={14} /></button>
                        </div>
                    )}
                </section>

                {/* ── Coluna 3: Subgrupo ────────────────────────────────── */}
                <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    {colHeader(
                        'Subgrupo',
                        (selGrp || selCat) ? `${subsVisiveis.length} de ${subgrupos.length}` : subgrupos.length,
                        () => openSubForm(null),
                        'Novo',
                        false
                    )}
                    {orfaosCount > 0 && (
                        <p className="px-3 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">
                            {plural(orfaosCount, 'subgrupo está', 'subgrupos estão')} sem nenhum grupo e
                            {orfaosCount === 1 ? ' aparece' : ' aparecem'} em todos os filtros até
                            {orfaosCount === 1 ? ' ser vinculado' : ' serem vinculados'}.
                        </p>
                    )}
                    <ul className="p-1.5 space-y-0.5 max-h-[430px] overflow-y-auto">
                        {subsVisiveis.length === 0 && (
                            <li className="px-3 py-6 text-center text-sm text-gray-400 italic">
                                Nenhum subgrupo vinculado a esta seleção.
                            </li>
                        )}
                        {subsVisiveis.map(s => (
                            <li key={s.id}>
                                <div
                                    className={`group flex items-start gap-2 px-2.5 py-2 rounded border cursor-pointer ${
                                        subForm?.id === s.id ? 'bg-amber-50 border-amber-200' : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
                                    }`}
                                    onClick={() => openSubForm(s)}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-gray-800 break-words">{s.nome}</div>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {(s.grupos || []).map(id => (
                                                <span key={id} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600">
                                                    {grupoById[id]?.nome || '—'}
                                                </span>
                                            ))}
                                            {(s.grupos || []).length === 0 && (
                                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-600">
                                                    sem grupo
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className={`text-[11px] font-mono tabular-nums whitespace-nowrap mt-0.5 ${s.veiculos ? 'text-gray-500' : 'text-gray-300'}`}>
                                        {s.veiculos ? plural(s.veiculos, 'veíc.', 'veíc.') : 'sem veíc.'}
                                    </span>
                                    <button
                                        type="button" title="Excluir subgrupo"
                                        onClick={e => { e.stopPropagation(); removeSub(s); }}
                                        className="p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 mt-0.5"
                                    ><Trash2 size={13} /></button>
                                </div>
                            </li>
                        ))}
                    </ul>

                    {subForm && (
                        <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-3">
                            <h4 className="text-sm font-semibold text-gray-800">
                                {subForm.id ? 'Editar subgrupo' : 'Novo subgrupo'}
                            </h4>

                            <div className="space-y-1">
                                <label htmlFor="subNome" className="block text-[10px] font-mono uppercase tracking-wider text-gray-400">
                                    Nome do subgrupo
                                </label>
                                <input
                                    id="subNome" autoFocus value={subForm.nome}
                                    onChange={e => setSubForm(f => ({ ...f, nome: e.target.value }))}
                                    placeholder="Ex.: Caminhão Caçamba Basculante 12m³"
                                    className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded"
                                />
                            </div>

                            <div className="space-y-2">
                                <span className="block text-[10px] font-mono uppercase tracking-wider text-gray-400">
                                    Em quais grupos este subgrupo se encaixa
                                </span>
                                {tree.map(c => {
                                    const bloqueada = catTravada && catTravada !== c.id;
                                    return (
                                        <div key={c.id}>
                                            <p className="text-[10px] font-mono uppercase tracking-wide text-gray-400 mb-1 flex items-center gap-2">
                                                {c.nome} · {c.unidade}
                                                {bloqueada && (
                                                    <span className="normal-case tracking-normal text-[11px] text-red-500">
                                                        — fora da categoria travada
                                                    </span>
                                                )}
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {(c.tipos || []).map(t => {
                                                    const on = subForm.grupos.includes(t.id);
                                                    return (
                                                        <label
                                                            key={t.id}
                                                            className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border cursor-pointer ${
                                                                on ? 'bg-amber-50 border-amber-300 text-amber-800 font-semibold'
                                                                   : 'bg-white border-gray-300 text-gray-700'
                                                            } ${bloqueada ? 'opacity-40 line-through cursor-not-allowed' : ''}`}
                                                        >
                                                            <input
                                                                type="checkbox" checked={on} disabled={bloqueada}
                                                                onChange={() => toggleGrupoNoForm(t.id)}
                                                                className="accent-amber-700"
                                                            />
                                                            {t.nome}{t.veiculos ? ` (${t.veiculos})` : ''}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <p className="text-xs text-gray-600">
                                {catTravada
                                    ? `Categoria travada em ${tree.find(c => c.id === catTravada)?.nome} `
                                      + `(${tree.find(c => c.id === catTravada)?.unidade}). `
                                      + `${plural(subForm.grupos.length, 'grupo marcado', 'grupos marcados')}. `
                                      + 'Desmarque todos para trocar de categoria.'
                                    : 'Marque o primeiro grupo — a lista se restringe à categoria dele.'}
                            </p>

                            <div className="flex gap-2">
                                <button
                                    type="button" onClick={salvarSub} disabled={saving}
                                    className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded bg-amber-700 text-white disabled:opacity-50"
                                >
                                    {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                                    Salvar subgrupo
                                </button>
                                <button
                                    type="button" onClick={() => setSubForm(null)}
                                    className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-600"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            {showConfigModal && (
                <VehicleTypeConfigModal
                    onClose={() => setShowConfigModal(false)}
                    apiClient={apiClient}
                    setAlertMessage={showToast}
                />
            )}
        </div>
    );
};

export default VehicleTaxonomyTab;
