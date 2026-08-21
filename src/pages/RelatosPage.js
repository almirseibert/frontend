import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
    ClipboardList, Plus, Search, Loader2, Pencil, Trash2, Eye, AlertTriangle, RefreshCw, PlayCircle,
} from 'lucide-react';
import { useData, useEnsureResources } from '../contexts/DataContext';
import { GravidadeBadge } from '../components/relatos/GravidadeBadge';
import RelatoFormModal from '../components/relatos/RelatoFormModal';
import RelatoDetailModal from '../components/relatos/RelatoDetailModal';
import FecharRelatoWizard from '../components/relatos/FecharRelatoWizard';
import RelatoKanban from '../components/relatos/RelatoKanban';
import {
    RELATO_STATUS, RELATO_STATUS_ESTILO, RELATO_EDITAVEL, GRAVIDADES,
} from '../utils/relatoGravidade';

// Relatos de Ocorrência e Manutenção de Frota — digitalização da ficha
// FRM-MAN-001 que o operador preenche à mão.
//
// Página própria (e não mais uma aba em Revisões & Manutenções) porque o fluxo
// completo — digitação, triagem por executor, fechamento com a OS do MC e
// acompanhamento — não cabe numa aba, e assim ganha chave de permissão própria.

const formatarData = (ymd) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('pt-BR') : '—');

// Fora do componente de propósito: declarado dentro, cada render criaria um
// tipo novo e o React remontaria os cards a cada tecla digitada no filtro.
const Card = ({ label, valor, cor }) => (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold ${cor}`}>{valor}</p>
    </div>
);

const RelatosPage = ({ user, apiClient, setAlertMessage, ConfirmationModal, navigate }) => {
    useEnsureResources(['relatos', 'holidays']);
    const { relatos, vehicles, partners, employees, obras, refresh, syncing } = useData();

    const [aba, setAba] = useState('lista');
    const [busca, setBusca] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('');
    const [filtroGravidade, setFiltroGravidade] = useState('');
    const [filtroVeiculo, setFiltroVeiculo] = useState('');

    const [modalForm, setModalForm] = useState(null);   // { relato } | { } para novo
    const [detalheId, setDetalheId] = useState(null);
    const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
    const [detalhe, setDetalhe] = useState(null);
    const [confirmacao, setConfirmacao] = useState(null);
    const [wizard, setWizard] = useState(null);
    const [slaConfig, setSlaConfig] = useState([]);
    const [erro, setErro] = useState('');

    // Prazos por gravidade: o admin pode ajustá-los, então vêm do backend em vez
    // de ficarem fixos no código.
    useEffect(() => {
        apiClient.getRelatoSlaConfig().then(setSlaConfig).catch(() => setSlaConfig([]));
    }, [apiClient]);

    const veiculoPorId = useMemo(
        () => new Map(vehicles.map(v => [v.id, v])),
        [vehicles]
    );

    const recarregar = useCallback(() => refresh('relatos'), [refresh]);

    const listaFiltrada = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return relatos.filter(r => {
            if (filtroStatus && r.status !== filtroStatus) return false;
            if (filtroGravidade && r.gravidadeMax !== filtroGravidade) return false;
            if (filtroVeiculo && r.vehicleId !== filtroVeiculo) return false;
            if (!q) return true;
            const v = veiculoPorId.get(r.vehicleId);
            return [
                String(r.numero), r.relatorNome, r.veiculoPlaca, r.veiculoFrota,
                r.veiculoModelo, r.osMc, v?.registroInterno, v?.placa,
            ].some(campo => String(campo || '').toLowerCase().includes(q));
        });
    }, [relatos, busca, filtroStatus, filtroGravidade, filtroVeiculo, veiculoPorId]);

    const resumo = useMemo(() => ({
        total: relatos.length,
        emAberto: relatos.filter(r => ['Rascunho', 'Digitado'].includes(r.status)).length,
        emExecucao: relatos.filter(r => r.status === 'Em Execução').length,
        // Relato com algum item A é o que trava o equipamento — é o número que
        // o gestor precisa ver primeiro.
        bloqueantes: relatos.filter(r => r.gravidadeMax === 'A' && r.status !== 'Concluído' && r.status !== 'Cancelado').length,
    }), [relatos]);

    const abrirDetalhe = async (id) => {
        setDetalheId(id);
        setCarregandoDetalhe(true);
        setErro('');
        try {
            setDetalhe(await apiClient.getRelatoById(id));
        } catch (e) {
            setErro(e.message || 'Erro ao abrir o relato.');
            setDetalheId(null);
        } finally {
            setCarregandoDetalhe(false);
        }
    };

    const abrirEdicao = async (id) => {
        setErro('');
        try {
            setModalForm({ relato: await apiClient.getRelatoById(id) });
        } catch (e) {
            setErro(e.message || 'Erro ao carregar o relato para edição.');
        }
    };

    // O wizard precisa dos itens completos, que a listagem não traz.
    const abrirFechamento = async (id) => {
        setErro('');
        try {
            setWizard(await apiClient.getRelatoById(id));
        } catch (e) {
            setErro(e.message || 'Erro ao abrir o fechamento.');
        }
    };

    const excluir = (relato) => {
        setConfirmacao({
            titulo: `Excluir relato #${relato.numero}?`,
            mensagem: 'A ficha e todos os itens lançados serão removidos. Esta ação não pode ser desfeita.',
            onConfirm: async () => {
                setConfirmacao(null);
                try {
                    await apiClient.deleteRelato(relato.id);
                    setAlertMessage?.(`Relato #${relato.numero} excluído.`);
                    recarregar();
                } catch (e) {
                    setErro(e.message || 'Erro ao excluir o relato.');
                }
            },
        });
    };

    return (
        <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <ClipboardList size={22} className="text-yellow-600" />
                    <div>
                        <h1 className="text-lg font-bold text-gray-800">Relatos de Ocorrência</h1>
                        <p className="text-[11px] text-gray-500">
                            FRM-MAN-001 — ficha preenchida pelo operador, digitada aqui pelo gestor de frota
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={recarregar}
                        disabled={syncing}
                        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 disabled:opacity-40"
                        title="Recarregar"
                    >
                        <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => setModalForm({})}
                        className="flex items-center gap-1.5 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold rounded-lg shadow"
                    >
                        <Plus size={14} /> Novo Relato
                    </button>
                </div>
            </div>

            {erro && (
                <div className="p-3 bg-red-50 border border-red-300 text-red-800 rounded-lg text-xs font-bold flex items-center gap-2">
                    <AlertTriangle size={14} /> {erro}
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card label="Total de relatos" valor={resumo.total} cor="text-gray-800" />
                <Card label="Aguardando triagem" valor={resumo.emAberto} cor="text-blue-600" />
                <Card label="Em execução" valor={resumo.emExecucao} cor="text-yellow-600" />
                <Card label="Com item gravidade A" valor={resumo.bloqueantes} cor="text-red-600" />
            </div>

            {/* Duas visões do mesmo dado: a lista das fichas e o quadro de
                acompanhamento da oficina (as 4 colunas da seção 6 do papel). */}
            <div className="flex gap-1 border-b border-gray-200">
                {[
                    { id: 'lista', label: 'Fichas' },
                    { id: 'kanban', label: `Em execução (${resumo.emExecucao})` },
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setAba(t.id)}
                        className={`px-4 py-2 text-sm font-bold transition-colors ${
                            aba === t.id
                                ? 'border-b-2 border-yellow-500 text-yellow-700'
                                : 'text-gray-400 hover:text-gray-600'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {aba === 'kanban' ? (
                <RelatoKanban
                    relatos={relatos}
                    vehicles={vehicles}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    onAbrirRelato={abrirDetalhe}
                    onChanged={recarregar}
                />
            ) : (
            <>
            <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        placeholder="Nº do relato, RE, placa, relator ou OS do MC..."
                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                    />
                </div>
                <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none">
                    <option value="">Todos os status</option>
                    {RELATO_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filtroGravidade} onChange={e => setFiltroGravidade(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none">
                    <option value="">Todas as gravidades</option>
                    {GRAVIDADES.map(g => <option key={g} value={g}>Pior item: {g}</option>)}
                </select>
                <select value={filtroVeiculo} onChange={e => setFiltroVeiculo(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none max-w-[200px]">
                    <option value="">Todos os equipamentos</option>
                    {vehicles.map(v => (
                        <option key={v.id} value={v.id}>{v.registroInterno || v.placa || v.id}</option>
                    ))}
                </select>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                                <th className="px-3 py-2 text-left w-16">Nº</th>
                                <th className="px-3 py-2 text-left">Equipamento</th>
                                <th className="px-3 py-2 text-left">Relator</th>
                                <th className="px-3 py-2 text-center w-24">Data</th>
                                <th className="px-3 py-2 text-center w-20">Pior item</th>
                                <th className="px-3 py-2 text-center w-24">Itens</th>
                                <th className="px-3 py-2 text-center w-28">OS MC</th>
                                <th className="px-3 py-2 text-center w-28">Status</th>
                                <th className="px-3 py-2 text-center w-28">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {listaFiltrada.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-3 py-10 text-center text-sm text-gray-400">
                                        {relatos.length === 0
                                            ? 'Nenhum relato cadastrado ainda. Clique em "Novo Relato" para digitar a primeira ficha.'
                                            : 'Nenhum relato corresponde aos filtros.'}
                                    </td>
                                </tr>
                            )}
                            {listaFiltrada.map(r => {
                                const v = veiculoPorId.get(r.vehicleId);
                                const bloqueante = r.gravidadeMax === 'A' && !['Concluído', 'Cancelado'].includes(r.status);
                                return (
                                    <tr key={r.id} className={`hover:bg-gray-50 ${bloqueante ? 'bg-red-50/40 border-l-4 border-l-red-500' : ''}`}>
                                        <td className="px-3 py-2 font-bold text-gray-700">#{r.numero}</td>
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-gray-800">
                                                {r.veiculoFrota || v?.registroInterno || '—'}
                                                {(r.veiculoPlaca || v?.placa) && (
                                                    <span className="text-gray-400 font-normal ml-1">· {r.veiculoPlaca || v?.placa}</span>
                                                )}
                                            </div>
                                            <div className="text-[11px] text-gray-400 truncate max-w-[240px]">
                                                {r.veiculoModelo || v?.modelo || ''}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="text-gray-700">{r.relatorNome}</div>
                                            {r.relatorFuncao && <div className="text-[11px] text-gray-400">{r.relatorFuncao}</div>}
                                        </td>
                                        <td className="px-3 py-2 text-center text-gray-600 text-xs">{formatarData(r.dataRelato)}</td>
                                        <td className="px-3 py-2 text-center">
                                            {r.gravidadeMax ? <GravidadeBadge gravidade={r.gravidadeMax} size="sm" /> : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-3 py-2 text-center text-xs text-gray-600">
                                            {Number(r.itensConcluidos) > 0
                                                ? `${r.itensConcluidos}/${r.itensCount} concluídos`
                                                : `${r.itensCount} ${Number(r.itensCount) === 1 ? 'item' : 'itens'}`}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            {r.osMc
                                                ? <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{r.osMc}</span>
                                                : <span className="text-gray-300 text-xs">—</span>}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${RELATO_STATUS_ESTILO[r.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                {r.status}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center justify-center gap-1">
                                                <button onClick={() => abrirDetalhe(r.id)} className="p-1.5 rounded hover:bg-blue-50 text-blue-500" title="Ver ficha">
                                                    <Eye size={14} />
                                                </button>
                                                {RELATO_EDITAVEL.includes(r.status) && (
                                                    <>
                                                        {r.status === 'Digitado' && Number(r.itensCount) > 0 && (
                                                            <button
                                                                onClick={() => abrirFechamento(r.id)}
                                                                className="p-1.5 rounded hover:bg-green-50 text-green-600"
                                                                title="Fechar relato e gerar ordens de serviço"
                                                            >
                                                                <PlayCircle size={14} />
                                                            </button>
                                                        )}
                                                        <button onClick={() => abrirEdicao(r.id)} className="p-1.5 rounded hover:bg-yellow-50 text-yellow-600" title="Editar ficha">
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button onClick={() => excluir(r)} className="p-1.5 rounded hover:bg-red-50 text-red-400" title="Excluir">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            </>
            )}

            {carregandoDetalhe && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <Loader2 size={28} className="animate-spin text-white" />
                </div>
            )}

            {modalForm && (
                <RelatoFormModal
                    relato={modalForm.relato || null}
                    vehicles={vehicles}
                    employees={employees}
                    obras={obras}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    onClose={() => setModalForm(null)}
                    onSaved={recarregar}
                />
            )}

            {detalhe && detalheId && (
                <RelatoDetailModal
                    relato={detalhe}
                    vehicle={veiculoPorId.get(detalhe.vehicleId) || null}
                    user={user}
                    apiClient={apiClient}
                    navigate={navigate}
                    setAlertMessage={setAlertMessage}
                    onClose={() => { setDetalhe(null); setDetalheId(null); }}
                    onChanged={async () => {
                        recarregar();
                        setDetalhe(await apiClient.getRelatoById(detalheId));
                    }}
                />
            )}

            {wizard && (
                <FecharRelatoWizard
                    relato={wizard}
                    partners={partners}
                    employees={employees}
                    slaConfig={slaConfig}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    onClose={() => setWizard(null)}
                    onFechado={recarregar}
                />
            )}

            {confirmacao && ConfirmationModal && (
                <ConfirmationModal
                    title={confirmacao.titulo}
                    message={confirmacao.mensagem}
                    onConfirm={confirmacao.onConfirm}
                    onCancel={() => setConfirmacao(null)}
                    onClose={() => setConfirmacao(null)}
                    confirmText="Excluir"
                />
            )}
        </div>
    );
};

export default RelatosPage;
