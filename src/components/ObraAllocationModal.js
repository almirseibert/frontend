import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Loader, X, AlertTriangle, Shield, Calendar, Gauge, MapPin, ChevronDown, Search, User, Building2, History } from 'lucide-react';
import FinishObraModal from './FinishObraModal';
import EstadiaRetroativaModal from './EstadiaRetroativaModal';
import { getAllowedReadingTypes, getVehicleMainReading, checkVehicleRestrictions, checkReadingConsistency } from '../utils/vehicleRules';
import SearchableSelect from './SearchableSelect';
import { formatObraNome } from '../utils/obraFormat';

// --- Item do plano de trabalho que a máquina vai desempenhar ---------------
// Três estados visuais, porque significam coisas diferentes para quem aloca:
//   automatico → confirmação passiva, cinza. Nada a decidir.
//   confirmar com sugestão → âmbar, item pré-marcado. Um clique consciente.
//   confirmar sem sugestão → âmbar, nada marcado. É onde 23T e 30T se separam.
const PlanoItemPicker = ({ loading, resolucao, itens, value, onChange }) => {
    if (loading) {
        return (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-center gap-2 text-xs text-gray-500">
                <Loader className="animate-spin" size={13} /> Verificando o plano de trabalho da obra...
            </div>
        );
    }
    if (!resolucao) return null;

    // Leves e caminhões de trecho: alocam normalmente, mas rodam em km. Não há
    // item a escolher porque não há hora a abater. Informar, não perguntar.
    if (resolucao.decisao === 'nao_consome_horas') {
        return (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Item do plano de trabalho
                </p>
                <p className="text-sm font-bold text-gray-800">Não se aplica</p>
                <p className="text-xs text-gray-500 mt-0.5">{resolucao.motivo}</p>
            </div>
        );
    }

    if (resolucao.decisao === 'sem_plano') {
        return (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs text-gray-500">
                    Esta obra não tem plano de trabalho cadastrado. A alocação segue normalmente e as
                    horas continuam sendo classificadas pelo tipo da máquina.
                </p>
            </div>
        );
    }

    if (resolucao.decisao === 'automatico') {
        return (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Item do plano de trabalho
                </p>
                <p className="text-sm font-bold text-gray-800">{resolucao.itemKey}</p>
                <p className="text-xs text-gray-500 mt-0.5">{resolucao.motivo}</p>
            </div>
        );
    }

    // decisao === 'confirmar'
    return (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Confirme o item do plano de trabalho
                <span className="text-red-500">*</span>
            </p>
            <p className="text-xs text-amber-900 mb-2.5">{resolucao.motivo}</p>

            <div className="space-y-1">
                {itens.map(item => {
                    const marcado = value === item.key;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => onChange(item.key)}
                            className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition flex items-center justify-between gap-3 ${
                                marcado
                                    ? 'bg-white border-amber-500 ring-2 ring-amber-400 font-semibold text-gray-900'
                                    : 'bg-white/70 border-amber-200 hover:bg-white text-gray-700'
                            }`}
                        >
                            <span className="truncate">{item.key}</span>
                            <span className="text-[11px] text-gray-500 shrink-0 tabular-nums">
                                {item.horasContratadas.toLocaleString('pt-BR')} h
                            </span>
                        </button>
                    );
                })}
            </div>

            {!value && (
                <p className="text-[11px] text-amber-700 mt-2">
                    Escolha um item para liberar a alocação.
                </p>
            )}
        </div>
    );
};

// --- Seletor de funcionário com pesquisa ---
const EmployeeSelector = ({ employees, value, onChange, accentColor = 'green' }) => {
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef(null);
    const inputRef = useRef(null);

    const ring = accentColor === 'green' ? 'focus:ring-green-500 border-green-300' : 'focus:ring-blue-500 border-blue-300';
    const hover = accentColor === 'green' ? 'hover:bg-green-50' : 'hover:bg-blue-50';
    const selected_bg = accentColor === 'green' ? 'bg-green-50 text-green-800' : 'bg-blue-50 text-blue-800';

    const filtered = useMemo(() =>
        employees.filter(e =>
            e.nome.toLowerCase().includes(search.toLowerCase()) ||
            (e.funcao || '').toLowerCase().includes(search.toLowerCase())
        ),
    [employees, search]);

    const selected = employees.find(e => String(e.id) === String(value));

    useEffect(() => {
        const handleClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    useEffect(() => {
        if (isOpen && inputRef.current) inputRef.current.focus();
    }, [isOpen]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(o => !o)}
                className={`w-full p-2.5 border rounded-lg text-sm flex justify-between items-center bg-white transition focus:outline-none focus:ring-2 ${ring} ${!selected ? 'text-gray-400' : 'text-gray-800'}`}
            >
                <span className="flex items-center gap-2 truncate">
                    <User size={13} className="text-gray-400 shrink-0" />
                    {selected ? (
                        <span className="truncate">
                            {selected.nome}
                            {selected.funcao && <span className="text-gray-400 ml-1">· {selected.funcao}</span>}
                        </span>
                    ) : 'Selecione um funcionário...'}
                </span>
                <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-20 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl mt-1 flex flex-col overflow-hidden">
                    <div className="p-2 border-b bg-gray-50">
                        <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Pesquisar por nome ou função..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-7 pr-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-green-500 focus:border-green-400 outline-none bg-white"
                            />
                        </div>
                    </div>

                    <div className="overflow-y-auto max-h-44 custom-scrollbar">
                        {filtered.length === 0 ? (
                            <div className="p-3 text-xs text-gray-400 text-center italic">Nenhum resultado para "{search}"</div>
                        ) : (
                            filtered.map(e => (
                                <button
                                    key={e.id}
                                    type="button"
                                    onClick={() => { onChange(String(e.id)); setIsOpen(false); setSearch(''); }}
                                    className={`w-full text-left px-3 py-2 text-sm transition flex justify-between items-center ${hover} ${String(value) === String(e.id) ? selected_bg + ' font-semibold' : ''}`}
                                >
                                    <span>{e.nome}</span>
                                    {e.funcao && <span className="text-[11px] text-gray-400 ml-2 shrink-0">{e.funcao}</span>}
                                </button>
                            ))
                        )}
                    </div>

                    <div className="px-3 py-1.5 border-t bg-gray-50 text-[10px] text-gray-400 text-right">
                        {filtered.length} de {employees.length} funcionário(s) ativo(s)
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Modal principal ---
const ObraAllocationModal = ({
    user,
    vehicle,
    obras = [],
    employees = [],
    revisions = [],
    onClose,
    setAlertMessage,
    apiClient,
    reloadData,
    PasswordConfirmationModal
}) => {
    const isAllocated = !!vehicle.obraAtualId;

    const currentObraAllocation = useMemo(() => {
        return (Array.isArray(vehicle.history) ? vehicle.history : [])
            .find(h => (h.type === 'obra' || h.historyType === 'obra') && !h.endDate && !h.dataSaida);
    }, [vehicle.history]);

    // Data de entrada real buscada direto do historicoVeiculos da obra (fonte confiável)
    const realEntryDate = useMemo(() => {
        if (!vehicle.obraAtualId) return null;
        const obraData = obras.find(o => o.id === vehicle.obraAtualId);
        if (!obraData) return null;
        const historico = Array.isArray(obraData.historicoVeiculos) ? obraData.historicoVeiculos : [];
        const entry = historico.find(h => String(h.veiculoId) === String(vehicle.id) && !h.dataSaida);
        if (!entry?.dataEntrada) return null;
        try {
            return new Date(entry.dataEntrada).toISOString().split('T')[0];
        } catch {
            return null;
        }
    }, [vehicle.obraAtualId, vehicle.id, obras]);

    const [obraId, setObraId] = useState(isAllocated ? vehicle.obraAtualId : '');
    const [employeeId, setEmployeeId] = useState(currentObraAllocation?.details?.employeeId || '');

    const today = new Date().toISOString().split('T')[0];
    const [dataEntrada, setDataEntrada] = useState(today);
    const [dataSaida, setDataSaida] = useState(today);

    const [locationAfterDeallocate, setLocationAfterDeallocate] = useState('Pátio MAK Lajeado');
    const [observacoes, setObservacoes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const [restrictionAlert, setRestrictionAlert] = useState(null);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
    const [blockedAction, setBlockedAction] = useState(null);

    const allowedTypes = getAllowedReadingTypes(vehicle.tipo);
    const readingType = allowedTypes.includes('horimetro') ? 'horimetro' : 'odometro';
    const readingLabel = readingType === 'horimetro' ? 'Horímetro' : 'Odômetro';
    const currentVehicleReading = getVehicleMainReading(vehicle).value || '';
    const [readingValue, setReadingValue] = useState(currentVehicleReading.toString());

    // Inclui obras em fase de planejamento (planejada/mobilizacao): alocar o 1º
    // equipamento nelas as ativa automaticamente no backend. Única tela
    // operacional que enxerga status pré-obra.
    const activeObras = useMemo(() =>
        obras.filter(o => ['ativa', 'planejada', 'mobilizacao'].includes(o.status))
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [obras]);

    // Somente funcionários com status 'ativo'
    const activeEmployees = useMemo(() =>
        (employees || [])
            .filter(e => e.status === 'ativo')
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [employees]);

    const [isFinishObraModalOpen, setIsFinishObraModalOpen] = useState(false);
    const [obraToFinalize, setObraToFinalize] = useState(null);
    const [isRetroModalOpen, setIsRetroModalOpen] = useState(false);

    // ── Item do plano de trabalho que esta máquina vai desempenhar ──────────
    // O contrato pode ter 100 h de 30T e 200 h de 23T: só quem aloca sabe qual
    // serviço a máquina vai fazer. Fora da correspondência exata de subgrupo, o
    // sistema sugere e espera confirmação — nunca decide sozinho.
    // Ver docs/item-de-contrato-e-substituicao-plano.md.
    const [planoInfo, setPlanoInfo] = useState(null);      // { itens, resolucao }
    const [planoLoading, setPlanoLoading] = useState(false);
    const [planoItemKey, setPlanoItemKey] = useState('');
    const [planoErro, setPlanoErro] = useState('');
    const [planoTentativa, setPlanoTentativa] = useState(0);

    useEffect(() => {
        if (!obraId || !vehicle?.id) { setPlanoInfo(null); setPlanoItemKey(''); setPlanoErro(''); return; }
        let cancelado = false;
        setPlanoLoading(true);
        setPlanoErro('');
        apiClient.getPlanoItens(obraId, vehicle.id)
            .then(data => {
                if (cancelado) return;
                setPlanoInfo(data);
                const r = data?.resolucao;
                // Automático já vem decidido; sugestão pré-seleciona; ambiguidade
                // (2+ itens do mesmo grupo) fica em branco de propósito, para que
                // "confirmar" não vire reflexo justo onde a escolha é real.
                setPlanoItemKey(r?.itemKey || r?.sugestao || '');
            })
            .catch(err => {
                if (cancelado) return;
                // FALHA FECHADA. Antes o erro era engolido: o seletor sumia, a
                // exigência de escolher item desaparecia junto e a alocação passava
                // gravando planoItemKey nulo — o vínculo órfão que esta tela existe
                // para impedir. Agora o erro aparece e trava a confirmação.
                setPlanoInfo(null);
                setPlanoItemKey('');
                setPlanoErro(err?.message || 'Não foi possível carregar o plano de trabalho da obra.');
            })
            .finally(() => { if (!cancelado) setPlanoLoading(false); });
        return () => { cancelado = true; };
    }, [obraId, vehicle?.id, planoTentativa]);

    const planoResolucao = planoInfo?.resolucao || null;
    const planoItens = planoInfo?.itens || [];
    // Só exige escolha quando há plano e o sistema não resolveu sozinho.
    const precisaEscolherItem = planoResolucao?.decisao === 'confirmar';
    // Consulta do plano falhou: não dá para saber se esta máquina precisaria
    // declarar item, então a alocação fica bloqueada até conseguir verificar.
    const planoIndisponivel = !!planoErro;

    const currentObra = obras.find(o => o.id === vehicle.obraAtualId);

    const validateRestrictions = () => {
        setRestrictionAlert(null);
        const staticIssues = checkVehicleRestrictions(vehicle, revisions);
        const consistencyIssue = checkReadingConsistency(vehicle, readingValue, readingType);
        if (consistencyIssue.status === 'bloqueio') {
            staticIssues.push({ type: 'bloqueio', message: consistencyIssue.message });
        }
        const blockingIssues = staticIssues.filter(i => i.type === 'bloqueio' || i.type === 'vencido' || i.category === 'bloqueio');
        const warningIssues = staticIssues.filter(i => i.type === 'aviso' || i.type === 'warning');
        if (blockingIssues.length > 0 || warningIssues.length > 0) {
            setRestrictionAlert(staticIssues.map(i => i.message));
            return false;
        }
        return true;
    };

    const handleAllocateClick = (e) => {
        e.preventDefault();
        const readingFloat = parseFloat(readingValue);
        if (!obraId || !employeeId || readingValue === '' || isNaN(readingFloat)) {
            setAlertMessage('Preencha todos os campos obrigatórios.');
            return;
        }
        if (planoIndisponivel) {
            setAlertMessage('Não foi possível verificar o plano de trabalho da obra. Tente novamente antes de alocar.');
            return;
        }
        if (precisaEscolherItem && !planoItemKey) {
            setAlertMessage('Escolha qual item do plano de trabalho esta máquina vai desempenhar.');
            return;
        }
        if (!validateRestrictions()) {
            setBlockedAction(() => executeAllocate);
            return;
        }
        executeAllocate();
    };

    const executeAllocate = async () => {
        setIsSaving(true);
        const selectedEmployee = employees.find(e => String(e.id) === String(employeeId));
        const employeeName = selectedEmployee ? selectedEmployee.nome : 'N/A';
        const val = parseFloat(readingValue);
        try {
            await apiClient.allocateVehicleToObra(vehicle.id, {
                obraId,
                employeeId,
                employeeName,
                dataEntrada,
                readingType,
                readingValue: val,
                observacoes: observacoes || '',
                planoItemKey: planoItemKey || null,
                horimetroEntrada: readingType === 'horimetro' ? val : 0,
                odometroEntrada: readingType === 'odometro' ? val : 0,
                horimetro: readingType === 'horimetro' ? val : 0,
                odometro: readingType === 'odometro' ? val : 0,
            });
            setAlertMessage('Veículo alocado com sucesso!');
            reloadData();
            onClose();
        } catch (error) {
            const msg = error.response?.data?.sqlMessage
                ? `Erro SQL: ${error.response.data.sqlMessage}`
                : (error.response?.data?.error || error.message);
            setAlertMessage('Erro ao alocar: ' + msg);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeallocateClick = () => {
        const readingFloat = parseFloat(readingValue);
        if (readingValue === '' || isNaN(readingFloat)) {
            setAlertMessage('Informe a leitura de saída.');
            return;
        }
        if (realEntryDate && dataSaida && new Date(dataSaida) < new Date(realEntryDate)) {
            setAlertMessage(`A data de saída (${new Date(dataSaida + 'T12:00:00').toLocaleDateString('pt-BR')}) não pode ser anterior à data de entrada (${new Date(realEntryDate + 'T12:00:00').toLocaleDateString('pt-BR')}).`);
            return;
        }
        if (!validateRestrictions()) {
            setBlockedAction(() => checkAndDeallocate);
            return;
        }
        checkAndDeallocate();
    };

    const checkAndDeallocate = () => {
        if (realEntryDate && dataSaida && new Date(dataSaida) < new Date(realEntryDate)) {
            setAlertMessage(`A data de saída (${new Date(dataSaida + 'T12:00:00').toLocaleDateString('pt-BR')}) não pode ser anterior à data de entrada (${new Date(realEntryDate + 'T12:00:00').toLocaleDateString('pt-BR')}).`);
            return;
        }
        const obraData = obras.find(o => o.id === vehicle.obraAtualId);
        if (!obraData) {
            executeDeallocate(false, null);
            return;
        }
        const historico = Array.isArray(obraData.historicoVeiculos) ? obraData.historicoVeiculos : [];
        const otherActiveVehicles = historico.filter(h => h.veiculoId !== vehicle.id && !h.dataSaida);
        if (otherActiveVehicles.length === 0) {
            setObraToFinalize(obraData);
            setIsFinishObraModalOpen(true);
        } else {
            executeDeallocate(false, null);
        }
    };

    const executeDeallocate = async (shouldFinalizeObra, dataFimObra) => {
        setIsSaving(true);
        const val = parseFloat(readingValue);
        try {
            await apiClient.deallocateVehicleFromObra(vehicle.id, {
                dataSaida,
                readingType,
                readingValue: val,
                location: locationAfterDeallocate,
                shouldFinalizeObra,
                dataFimObra,
                obraId: vehicle.obraAtualId,
                observacoes: observacoes || '',
                horimetroSaida: readingType === 'horimetro' ? val : 0,
                odometroSaida: readingType === 'odometro' ? val : 0,
                horimetro: readingType === 'horimetro' ? val : 0,
                odometro: readingType === 'odometro' ? val : 0,
            });
            setAlertMessage('Desalocado com sucesso!');
            reloadData();
            onClose();
        } catch (error) {
            const msg = error.response?.data?.sqlMessage
                ? `Erro SQL: ${error.response.data.sqlMessage}`
                : (error.response?.data?.error || error.message);
            setAlertMessage('Erro ao desalocar: ' + msg);
        } finally {
            setIsSaving(false);
        }
    };

    const accentColor = isAllocated ? 'red' : 'green';
    const headerBg = isAllocated
        ? 'bg-gradient-to-r from-red-600 to-red-700'
        : 'bg-gradient-to-r from-green-600 to-green-700';

    return (
        <>
            <div className="mak-modal-backdrop backdrop-blur-sm">
                <div className="mak-modal max-w-lg">

                    {/* Cabeçalho colorido */}
                    <div className={`p-4 flex justify-between items-start ${headerBg} text-white rounded-t-xl`}>
                        <div>
                            <h2 className="text-base font-bold">
                                {isAllocated ? 'Desalocar Veículo da Obra' : 'Alocar Veículo em Obra'}
                            </h2>
                            <p className="text-xs opacity-80 mt-0.5">
                                {vehicle.registroInterno} · {vehicle.placa} · {readingLabel} atual: <strong>{currentVehicleReading}</strong>
                            </p>
                        </div>
                        <button onClick={onClose} disabled={isSaving} className="p-1.5 rounded-full hover:bg-white hover:bg-opacity-20 transition">
                            <X size={18} />
                        </button>
                    </div>

                    {/* Conteúdo */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">

                        {/* Alerta de restrição */}
                        {restrictionAlert && (
                            <div className="bg-red-50 p-3 rounded-lg border border-red-200 flex items-start gap-3">
                                <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={18} />
                                <div className="flex-1">
                                    <p className="font-bold text-red-800 text-xs uppercase mb-1">Restrições encontradas</p>
                                    <ul className="list-disc list-inside text-xs text-red-700 mb-2 space-y-0.5">
                                        {restrictionAlert.map((msg, i) => <li key={i}>{msg}</li>)}
                                    </ul>
                                    <button
                                        onClick={() => setShowPasswordConfirm(true)}
                                        className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 hover:bg-red-700 w-full justify-center"
                                    >
                                        <Shield size={12} /> LIBERAR COM SENHA GERENCIAL
                                    </button>
                                </div>
                            </div>
                        )}

                        {isAllocated ? (
                            /* ── DESALOCAÇÃO ── */
                            <div className="space-y-4">
                                {/* Info da obra atual */}
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-start gap-3">
                                    <Building2 size={16} className="text-gray-500 shrink-0 mt-0.5" />
                                    <div className="text-sm">
                                        <p className="font-semibold text-gray-800">{formatObraNome(currentObra) || 'Obra não identificada'}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            Operador: <strong>{currentObraAllocation?.details?.employeeName || '—'}</strong>
                                            {realEntryDate && (
                                                <span className="ml-2">· Entrada: <strong>{new Date(realEntryDate + 'T12:00:00').toLocaleDateString('pt-BR')}</strong></span>
                                            )}
                                        </p>
                                    </div>
                                </div>

                                {/* Data e leitura de saída */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                                            <Calendar size={12} /> Data de Saída
                                        </label>
                                        <input
                                            type="date"
                                            value={dataSaida}
                                            min={realEntryDate || undefined}
                                            onChange={e => setDataSaida(e.target.value)}
                                            className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                                            <Gauge size={12} /> {readingLabel} de Saída
                                        </label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={readingValue}
                                            onChange={e => setReadingValue(e.target.value)}
                                            className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none"
                                            placeholder="Leitura final"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                                        <MapPin size={12} /> Destino após saída
                                    </label>
                                    <input
                                        type="text"
                                        value={locationAfterDeallocate}
                                        onChange={e => setLocationAfterDeallocate(e.target.value)}
                                        className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none"
                                        placeholder="Ex: Pátio Sede"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Observações</label>
                                    <textarea
                                        rows="2"
                                        value={observacoes}
                                        onChange={e => setObservacoes(e.target.value)}
                                        className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none resize-none"
                                        placeholder="Observações sobre a saída..."
                                    />
                                </div>

                                <button
                                    onClick={handleDeallocateClick}
                                    disabled={isSaving}
                                    className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-bold rounded-lg shadow text-sm flex items-center justify-center gap-2 transition"
                                >
                                    {isSaving ? <Loader className="animate-spin" size={16} /> : 'Finalizar & Desalocar'}
                                </button>

                                {/* Estadia retroativa: registrar passagem passada por outra obra sem desalocar */}
                                <div className="pt-2 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsRetroModalOpen(true)}
                                        disabled={isSaving}
                                        className="w-full py-2.5 bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition"
                                    >
                                        <History size={15} /> Registrar estadia retroativa em outra obra
                                    </button>
                                    <p className="text-[11px] text-gray-400 mt-1.5 text-center">
                                        A máquina esteve em outra obra por um período e voltou — sem tirá-la da obra atual.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            /* ── ALOCAÇÃO ── */
                            <div className="space-y-4">
                                {/* Obra destino */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                                        <Building2 size={12} /> Obra Destino <span className="text-red-500">*</span>
                                    </label>
                                    <SearchableSelect
                                        items={activeObras.map(o => ({ ...o, _displayNome: `${formatObraNome(o)}${o.tipo_registro === 'centro_custo' ? ' (CC)' : ''}${o.status !== 'ativa' ? ' [PLANEJADA]' : ''}` }))}
                                        value={obraId}
                                        onChange={(item) => setObraId(item?.id || '')}
                                        getLabel={(o) => o._displayNome || o.nome}
                                        placeholder="Selecione a obra..."
                                    />
                                    {activeObras.length === 0 && (
                                        <p className="text-xs text-amber-600 mt-1">Nenhuma obra ativa cadastrada.</p>
                                    )}
                                </div>

                                {/* Item do plano de trabalho desempenhado pela máquina */}
                                {obraId && planoIndisponivel && (
                                    <div className="rounded-lg border border-red-300 bg-red-50 p-3">
                                        <p className="text-[11px] font-semibold text-red-800 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                                            <AlertTriangle size={12} /> Plano de trabalho não verificado
                                        </p>
                                        <p className="text-xs text-red-900">{planoErro}</p>
                                        <p className="text-xs text-red-900 mt-1">
                                            A alocação fica bloqueada até conseguirmos confirmar qual item esta
                                            máquina vai desempenhar — sem isso as horas ficariam fora do progresso da obra.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setPlanoTentativa(n => n + 1)}
                                            className="mt-2 text-xs font-semibold text-red-800 underline hover:text-red-900"
                                        >
                                            Tentar novamente
                                        </button>
                                    </div>
                                )}

                                {obraId && !planoIndisponivel && (planoLoading || planoResolucao) && (
                                    <PlanoItemPicker
                                        loading={planoLoading}
                                        resolucao={planoResolucao}
                                        itens={planoItens}
                                        value={planoItemKey}
                                        onChange={setPlanoItemKey}
                                    />
                                )}

                                {/* Funcionário com busca */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                                        <User size={12} /> Operador Responsável <span className="text-red-500">*</span>
                                    </label>
                                    <EmployeeSelector
                                        employees={activeEmployees}
                                        value={employeeId}
                                        onChange={setEmployeeId}
                                        accentColor="green"
                                    />
                                    {activeEmployees.length === 0 && (
                                        <p className="text-xs text-amber-600 mt-1">Nenhum funcionário ativo encontrado.</p>
                                    )}
                                </div>

                                {/* Data e leitura de entrada */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                                            <Calendar size={12} /> Data de Entrada <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="date"
                                            value={dataEntrada}
                                            onChange={e => setDataEntrada(e.target.value)}
                                            className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-400 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                                            <Gauge size={12} /> {readingLabel} Entrada <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={readingValue}
                                            onChange={e => setReadingValue(e.target.value)}
                                            className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-400 outline-none"
                                            placeholder="Leitura inicial"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Observações</label>
                                    <textarea
                                        rows="2"
                                        value={observacoes}
                                        onChange={e => setObservacoes(e.target.value)}
                                        className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-400 outline-none resize-none"
                                        placeholder="Observações iniciais..."
                                    />
                                </div>

                                <button
                                    onClick={handleAllocateClick}
                                    disabled={isSaving || planoLoading || planoIndisponivel || (precisaEscolherItem && !planoItemKey)}
                                    className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold rounded-lg shadow text-sm flex items-center justify-center gap-2 transition"
                                >
                                    {isSaving ? <Loader className="animate-spin" size={16} /> : 'Confirmar Alocação'}
                                </button>

                                {/* Estadia retroativa: registrar passagem passada por uma obra sem alocar agora */}
                                <div className="pt-2 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsRetroModalOpen(true)}
                                        disabled={isSaving}
                                        className="w-full py-2.5 bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition"
                                    >
                                        <History size={15} /> Lançar estadia retroativa em uma obra
                                    </button>
                                    <p className="text-[11px] text-gray-400 mt-1.5 text-center">
                                        A máquina trabalhou em uma obra num período passado — registra sem alocá-la agora.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isRetroModalOpen && (
                <EstadiaRetroativaModal
                    vehicle={vehicle}
                    currentObra={currentObra}
                    obras={obras}
                    employees={employees}
                    readingType={readingType}
                    readingLabel={readingLabel}
                    onClose={() => setIsRetroModalOpen(false)}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    reloadData={reloadData}
                />
            )}

            {isFinishObraModalOpen && (
                <FinishObraModal
                    obra={obraToFinalize}
                    onClose={() => { setIsFinishObraModalOpen(false); executeDeallocate(false, null); }}
                    onConfirm={(dataFim) => { setIsFinishObraModalOpen(false); executeDeallocate(true, dataFim); }}
                />
            )}

            {showPasswordConfirm && PasswordConfirmationModal && (
                <PasswordConfirmationModal
                    message="Autorizar ação com restrições?"
                    onConfirm={async () => {
                        if (blockedAction) await blockedAction();
                        setShowPasswordConfirm(false);
                        setBlockedAction(null);
                    }}
                    onClose={() => { setShowPasswordConfirm(false); setBlockedAction(null); }}
                />
            )}
        </>
    );
};

export default ObraAllocationModal;


