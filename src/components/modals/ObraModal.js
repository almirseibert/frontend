import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader, MapPin, Clock, Plus, Trash2, DollarSign, User, ClipboardList, Users, Star, ChevronDown, ChevronRight } from 'lucide-react';
import CurrencyInput from '../ui/CurrencyInput';
import { vehicleSubTypes } from '../../utils/vehicleRules';
import SearchableCitySelect from '../SearchableCitySelect';
import { cidadePorCodigo, cidadePorNome } from '../../utils/geo';
import { REGIOES, regiaoPorCidade } from '../../utils/obraFormat';
import { rankOperatorsForObra } from '../../utils/geoSuggest';

// Ciclo de vida de planejamento — transições automáticas:
// radar (criada) → planejada (contrato de horas) → mobilização (1ª alocação) → ativa (1º lançamento de horas)
const OBRA_FASES = [
    { value: 'radar',       label: 'No radar (cadastrada, sem contrato)' },
    { value: 'planejada',   label: 'Plano definido (plano de trabalho registrado)' },
    { value: 'mobilizacao', label: 'Em mobilização (equipamento alocado)' },
    { value: 'ativa',       label: 'Em operação (apontando horas)' },
];
const PRE_ACTIVE_STATUSES = ['radar', 'planejada', 'mobilizacao'];

const ObraModal = ({
    user,
    obra,
    onClose,
    apiClient,
    reloadData,
    setAlertMessage,
    equipmentTypesForHours = [], // Recebe a lista filtrada (derivedEquipmentTypes) do Pai (ObrasPage)
    initialTipoRegistro = 'obra',
    employees = [],
}) => {
    // --- ESTADOS DO FORMULÁRIO ---
    const [tipoRegistro, setTipoRegistro] = useState(initialTipoRegistro); // 'obra' | 'centro_custo'
    const [nome, setNome] = useState('');
    const [responsavel, setResponsavel] = useState('');
    const [responsavelEmail, setResponsavelEmail] = useState('');
    const [responsavelWhatsapp, setResponsavelWhatsapp] = useState('');
    const [internalContacts, setInternalContacts] = useState([]);
    const [fiscal, setFiscal] = useState('');
    const [contractType, setContractType] = useState('horas'); // 'horas' | 'metrosQuadrados'
    const [dataFim, setDataFim] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    
    // --- ESTADOS DE CONTRATO POR HORAS (Dinâmico) ---
    // Estrutura: [{ type: 'Escavadeira', hours: 100, price: 150.00 }]
    const [contractedItems, setContractedItems] = useState([]);
    
    // Deslocamento Prancha
    const [kmContratadoPrancha, setKmContratadoPrancha] = useState('');
    const [valorKmPrancha, setValorKmPrancha] = useState('');

    // --- ESTADOS DE CONTRATO POR M² (Setores) ---
    const [sectors, setSectors] = useState([]);

    const [orgaoContratante, setOrgaoContratante] = useState('');
    const [regiao, setRegiao] = useState('');
    const [cidadeIbge, setCidadeIbge] = useState('');

    // --- ESTADOS DE PLANEJAMENTO (pré-obra) ---
    // Na criação a obra sempre nasce 'radar' e sobe de fase por gatilho; o seletor
    // de fase só aparece na edição (regressão manual do admin).
    const [statusObra, setStatusObra] = useState('radar');
    const [dataInicioPrevisto, setDataInicioPrevisto] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);

    // Plano de trabalho (contrato) começa recolhido quando ainda não existe:
    // a obra nasce 'radar' e só sobe para 'planejada' quando o plano é definido,
    // então na criação ele é a exceção, não a regra.
    const [planoAberto, setPlanoAberto] = useState(false);

    // Contatos internos (para vincular WhatsApp do responsável da obra)
    useEffect(() => {
        apiClient.getInternalContacts()
            .then(data => setInternalContacts(Array.isArray(data) ? data : []))
            .catch(() => setInternalContacts([]));
    }, []);

    // --- INICIALIZAÇÃO (Modo Edição) ---
    useEffect(() => {
        if (obra) {
            setTipoRegistro(obra.tipo_registro || 'obra');
            setNome(obra.nome || '');
            setResponsavel(obra.responsavel || '');
            setResponsavelEmail(obra.responsavel_email || '');
            setResponsavelWhatsapp(obra.responsavel_whatsapp || '');
            setFiscal(obra.fiscal || '');
            setContractType(obra.contractType || 'horas');
            // Previsão de fim agora vive em dataFimPrevisto; dataFim antigo serve de fallback
            const fimPrev = obra.dataFimPrevisto || (obra.status !== 'finalizada' ? obra.dataFim : null);
            setDataFim(fimPrev ? new Date(fimPrev).toISOString().split('T')[0] : '');
            setLatitude(obra.latitude || '');
            setLongitude(obra.longitude || '');
            setOrgaoContratante(obra.orgao_contratante || '');
            setRegiao(obra.regiao || '');
            setCidadeIbge(obra.cidade_ibge || cidadePorNome(obra.local)?.codigo_ibge || '');

            setStatusObra(obra.status && obra.status !== 'finalizada' ? obra.status : 'ativa');
            setDataInicioPrevisto(obra.dataInicioPrevisto ? new Date(obra.dataInicioPrevisto).toISOString().split('T')[0] : '');

            // Restaura Contrato por Horas — prefere o plano por SUBGRUPO; legado por grupo como fallback
            const parseMaybe = (v) => (typeof v === 'string' ? JSON.parse(v) : (v || {}));
            const horasSubParsed = parseMaybe(obra.horasContratadasPorSubTipo);
            const usaSubTipo = Object.keys(horasSubParsed).length > 0;

            const horasParsed = usaSubTipo ? horasSubParsed : parseMaybe(obra.horasContratadasPorTipo);
            const valoresParsed = usaSubTipo ? parseMaybe(obra.valoresPorSubTipo) : parseMaybe(obra.valoresPorTipo);

            const items = Object.keys(horasParsed).map(type => ({
                type,
                hours: horasParsed[type],
                price: valoresParsed[type] || ''
            }));
            setContractedItems(items);

            setKmContratadoPrancha(obra.kmContratadoPrancha || '');
            setValorKmPrancha(obra.valorKmPrancha || '');

            // Restaura Contrato por M²
            const sectorsParsed = Array.isArray(obra.sectors) ? obra.sectors : [];
            setSectors(sectorsParsed);

            setPlanoAberto(items.length > 0 || sectorsParsed.length > 0);
        } else {
            // Se for nova obra, inicia limpo
            setContractedItems([]);
        }
    }, [obra]);

    // Opções de equipamento: expande cada grupo cobrável nos seus subgrupos;
    // grupo sem subgrupos entra como opção direta (mesma regra do backend).
    const equipmentOptions = useMemo(() => {
        const opts = [];
        equipmentTypesForHours.forEach(tipo => {
            const subs = vehicleSubTypes[tipo];
            if (Array.isArray(subs) && subs.length > 0) opts.push(...subs);
            else opts.push(tipo);
        });
        return [...new Set(opts)].sort();
    }, [equipmentTypesForHours]);

    // Seleção de cidade (RS/IBGE): grava o código, assume o centroide do município
    // como coordenada da obra e sugere a região (filial) mais próxima.
    //
    // A coordenada deixou de ser digitável — o centroide é a melhor informação que
    // temos sem um mapa com pino — então ela passa a acompanhar a cidade sempre.
    // A região é só sugestão: o seletor continua editável para a exceção.
    const handleCitySelect = (city) => {
        if (!city) {
            setCidadeIbge('');
            return;
        }
        setCidadeIbge(city.codigo_ibge);
        setLatitude(String(city.lat));
        setLongitude(String(city.lng));

        const sugerida = regiaoPorCidade(city);
        if (sugerida) setRegiao(sugerida);
    };

    // Cidade escolhida, para exibir coordenada e região derivada em texto.
    const cidadeSelecionada = useMemo(
        () => (cidadeIbge ? cidadePorCodigo(cidadeIbge) : null),
        [cidadeIbge]
    );
    const regiaoSugerida = useMemo(
        () => regiaoPorCidade(cidadeSelecionada),
        [cidadeSelecionada]
    );

    // Colaboradores mais próximos da obra (por cidade/coordenada) — sugestão ao cadastrar.
    const colaboradoresProximos = useMemo(() => {
        const pseudoObra = { latitude, longitude, cidade_ibge: cidadeIbge };
        return rankOperatorsForObra(pseudoObra, employees, { incluirInativos: false }).slice(0, 6);
    }, [latitude, longitude, cidadeIbge, employees]);

    // --- CÁLCULO DO VALOR TOTAL ---
    const totalValue = useMemo(() => {
        let total = 0;
        if (contractType === 'horas') {
            contractedItems.forEach(item => {
                total += (parseFloat(item.hours) || 0) * (parseFloat(item.price) || 0);
            });
            total += (parseFloat(kmContratadoPrancha) || 0) * (parseFloat(valorKmPrancha) || 0);
        } else {
            sectors.forEach(sector => {
                total += (parseFloat(sector.kmContratado) || 0) * (parseFloat(sector.price) || 0);
            });
        }
        return total;
    }, [contractType, contractedItems, kmContratadoPrancha, valorKmPrancha, sectors]);

    // --- HANDLERS HORAS ---
    const addContractedItem = () => {
        setContractedItems([...contractedItems, { type: '', hours: '', price: '' }]);
    };

    const removeContractedItem = (index) => {
        setContractedItems(contractedItems.filter((_, i) => i !== index));
    };

    const updateContractedItem = (index, field, value) => {
        const newItems = [...contractedItems];
        newItems[index][field] = value;
        setContractedItems(newItems);
    };

    // --- HANDLERS SETORES ---
    const addSector = () => {
        setSectors([...sectors, { name: '', kmContratado: '', kmConcluido: 0, price: '' }]);
    };

    const removeSector = (index) => {
        setSectors(sectors.filter((_, i) => i !== index));
    };

    const updateSector = (index, field, value) => {
        const newSectors = [...sectors];
        newSectors[index][field] = value;
        setSectors(newSectors);
    };

    // --- SUBMIT ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        const payload = {
            tipo_registro: tipoRegistro,
            nome,
            responsavel,
            responsavel_email: responsavelEmail || null,
            responsavel_whatsapp: responsavelWhatsapp || null,
            fiscal,
            contractType,
            // dataInicio não é enviado: o backend o deriva de MIN(date) dos lançamentos de horas.
            dataFimPrevisto: dataFim || null,
            dataInicioPrevisto: dataInicioPrevisto || null,
            status: tipoRegistro === 'centro_custo' ? 'ativa' : statusObra,
            latitude,
            longitude,
            kmContratadoPrancha: parseFloat(kmContratadoPrancha) || 0,
            valorKmPrancha: parseFloat(valorKmPrancha) || 0,
            valorTotalContrato: totalValue,
            orgao_contratante: orgaoContratante || null,
            regiao: regiao || null,
            cidade_ibge: cidadeIbge || null
        };

        if (contractType === 'horas') {
            // Plano detalhado por SUBGRUPO (fonte de verdade do planejamento)
            const horasSubObj = {};
            const valoresSubObj = {};
            // Agregado por GRUPO (compatibilidade com faturamento/relatórios legados)
            const subToTipo = {};
            Object.entries(vehicleSubTypes).forEach(([tipo, subs]) => {
                (subs || []).forEach(s => { subToTipo[s] = tipo; });
            });
            const horasObj = {};
            const valorPonderado = {};

            contractedItems.forEach(item => {
                if (item.type) {
                    const h = parseFloat(item.hours) || 0;
                    const v = parseFloat(item.price) || 0;
                    horasSubObj[item.type] = h;
                    valoresSubObj[item.type] = v;

                    const tipoPai = subToTipo[item.type] || item.type;
                    horasObj[tipoPai] = (horasObj[tipoPai] || 0) + h;
                    valorPonderado[tipoPai] = (valorPonderado[tipoPai] || 0) + h * v;
                }
            });

            const valoresObj = {};
            Object.keys(horasObj).forEach(tipoPai => {
                valoresObj[tipoPai] = horasObj[tipoPai] > 0
                    ? Math.round((valorPonderado[tipoPai] / horasObj[tipoPai]) * 100) / 100
                    : 0;
            });

            payload.horasContratadasPorSubTipo = horasSubObj;
            payload.valoresPorSubTipo = valoresSubObj;
            payload.horasContratadasPorTipo = horasObj;
            payload.valoresPorTipo = valoresObj;
            payload.sectors = [];
        } else {
            payload.sectors = sectors.map(s => ({
                ...s,
                kmContratado: parseFloat(s.kmContratado) || 0,
                price: parseFloat(s.price) || 0
            }));
            payload.horasContratadasPorTipo = {};
            payload.valoresPorTipo = {};
            payload.horasContratadasPorSubTipo = {};
            payload.valoresPorSubTipo = {};
        }

        try {
            if (obra) {
                await apiClient.updateObra(obra.id, payload);
                setAlertMessage("Obra atualizada com sucesso!");
            } else {
                await apiClient.createObra(payload);
                setAlertMessage("Obra criada com sucesso!");
            }
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao salvar obra:", error);
            setAlertMessage(error.message || "Erro ao salvar obra.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const isCentroCusto = tipoRegistro === 'centro_custo';
    const temPlano = contractedItems.length > 0 || sectors.length > 0;
    const faseAtual = OBRA_FASES.find(f => f.value === statusObra);

    return (
        <div className="mak-modal-backdrop backdrop-blur-sm">
            <div className={`bg-white rounded-lg shadow-2xl w-full flex flex-col max-h-[88vh] ${isCentroCusto ? 'max-w-xl' : 'max-w-5xl'}`}>

                {/* Cabeçalho: título + fase da obra como selo */}
                <div className="mak-modal-header flex-shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <h2 className="mak-modal-title truncate">
                            {obra
                                ? (isCentroCusto ? 'Editar Centro de Custo' : 'Editar Obra')
                                : (isCentroCusto ? 'Novo Centro de Custo' : 'Nova Obra')}
                        </h2>
                        {!isCentroCusto && (
                            <span className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                                {obra ? (faseAtual ? faseAtual.label.split(' (')[0] : statusObra) : 'No radar'}
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 text-gray-500" disabled={isSubmitting}><X size={24}/></button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">

                    {/* Tipo de registro — decide a forma do resto do formulário */}
                    <div className="px-6 pt-4 flex-shrink-0">
                        <div className="inline-flex rounded-lg border-2 border-gray-200 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setTipoRegistro('obra')}
                                className={`px-5 py-1.5 font-bold text-sm transition ${!isCentroCusto ? 'bg-yellow-50 text-yellow-700' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                Obra
                            </button>
                            <button
                                type="button"
                                onClick={() => setTipoRegistro('centro_custo')}
                                className={`px-5 py-1.5 font-bold text-sm transition border-l-2 border-gray-200 ${isCentroCusto ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                Centro de Custo
                            </button>
                        </div>
                    </div>

                    {/* Miolo: só ele rola. Total e ações ficam sempre visíveis no rodapé. */}
                    <div className={`flex-1 min-h-0 overflow-y-auto px-6 py-4 grid gap-6 ${isCentroCusto ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-5'}`}>

                        {/* ---- COLUNA ESQUERDA: identificação ---- */}
                        <div className={`space-y-4 min-w-0 ${isCentroCusto ? '' : 'md:col-span-2'}`}>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">
                                    {isCentroCusto ? 'Nome do Centro de Custo *' : 'Nome da Obra *'}
                                </label>
                                <input
                                    type="text"
                                    value={nome}
                                    onChange={(e) => setNome(e.target.value)}
                                    className="w-full p-2 border rounded focus:ring-2 focus:ring-yellow-400 outline-none"
                                    required
                                    placeholder={isCentroCusto ? 'Ex: Manutenção Interna' : 'Ex: Pavimentação Rua A'}
                                />
                            </div>

                            {/* Órgão contratante fica colado ao nome: ele compõe o rótulo
                                exibido da obra em todo o sistema — "Estrela (SEDUR)". */}
                            {!isCentroCusto && (
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Órgão Contratante</label>
                                    <select
                                        value={orgaoContratante}
                                        onChange={(e) => setOrgaoContratante(e.target.value)}
                                        className="w-full p-2 border rounded focus:ring-2 focus:ring-yellow-400 outline-none bg-white"
                                    >
                                        <option value="">Selecione...</option>
                                        {['ALUGUEL','DOAÇÃO','INCRA','MUNICÍPIO','PARTICULAR','SEAPI','SEDUR'].map(o => (
                                            <option key={o} value={o}>{o}</option>
                                        ))}
                                    </select>
                                    {nome && orgaoContratante && (
                                        <p className="text-[11px] text-gray-400 mt-1">
                                            Aparece no sistema como <strong>{nome} ({orgaoContratante})</strong>
                                        </p>
                                    )}
                                </div>
                            )}

                            {!isCentroCusto && (
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                                        <MapPin size={14} /> Cidade (RS)
                                    </label>
                                    <SearchableCitySelect
                                        value={cidadeIbge}
                                        onChange={handleCitySelect}
                                        placeholder="Buscar cidade do RS..."
                                    />
                                    {/* A coordenada não é mais digitada: vem do centro do
                                        município e alimenta o ranking de colaboradores. */}
                                    {cidadeSelecionada && latitude && longitude && (
                                        <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                                            <MapPin size={11} className="flex-shrink-0" />
                                            {Number(latitude).toFixed(4)} / {Number(longitude).toFixed(4)}
                                            <span className="text-gray-400">· centro de {cidadeSelecionada.nome}</span>
                                        </p>
                                    )}
                                </div>
                            )}

                            {!isCentroCusto && (
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Região (filial)</label>
                                    <select
                                        value={regiao}
                                        onChange={(e) => setRegiao(e.target.value)}
                                        className="w-full p-2 border rounded focus:ring-2 focus:ring-yellow-400 outline-none bg-white"
                                    >
                                        <option value="">Selecione...</option>
                                        {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                    {regiaoSugerida && regiao === regiaoSugerida && (
                                        <p className="text-[11px] text-gray-400 mt-1">
                                            Sugerida pela base mais próxima da cidade. Altere se outra filial atende a obra.
                                        </p>
                                    )}
                                    {regiaoSugerida && regiao && regiao !== regiaoSugerida && (
                                        <p className="text-[11px] text-amber-600 mt-1">
                                            A base mais próxima seria <strong>{regiaoSugerida}</strong>.
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Previsão Início</label>
                                    <input
                                        type="date"
                                        value={dataInicioPrevisto}
                                        onChange={(e) => setDataInicioPrevisto(e.target.value)}
                                        className="w-full p-2 border rounded"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Previsão Fim</label>
                                    <input
                                        type="date"
                                        value={dataFim}
                                        onChange={(e) => setDataFim(e.target.value)}
                                        className="w-full p-2 border rounded"
                                    />
                                </div>
                            </div>
                            <p className="text-[11px] text-gray-400">
                                O início real é definido automaticamente pelo 1º lançamento de horas.
                            </p>

                            {/* Responsáveis */}
                            <div className="pt-3 border-t space-y-3">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                                        <User size={14}/> Líder de Obra
                                    </label>
                                    {employees.length > 0 ? (
                                        <select
                                            value={responsavelEmail}
                                            onChange={(e) => {
                                                const email = e.target.value;
                                                setResponsavelEmail(email);
                                                const emp = employees.find(x => x.email === email);
                                                setResponsavel(emp ? emp.nome : '');
                                            }}
                                            className="w-full p-2 border rounded focus:ring-2 focus:ring-yellow-400 outline-none bg-white"
                                        >
                                            <option value="">— Nenhum —</option>
                                            {employees.filter(emp => emp.email).map(emp => (
                                                <option key={emp.id} value={emp.email}>
                                                    {emp.nome} ({emp.email})
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type="text"
                                            value={responsavel}
                                            onChange={(e) => setResponsavel(e.target.value)}
                                            className="w-full p-2 border rounded focus:ring-2 focus:ring-yellow-400 outline-none"
                                            placeholder="Nome do Responsável"
                                        />
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                                        <User size={14}/> WhatsApp do Responsável
                                    </label>
                                    <select
                                        value={responsavelWhatsapp}
                                        onChange={(e) => setResponsavelWhatsapp(e.target.value)}
                                        className="w-full p-2 border rounded focus:ring-2 focus:ring-yellow-400 outline-none bg-white"
                                    >
                                        <option value="">— Nenhum —</option>
                                        {internalContacts.filter(c => c.whatsapp).map(c => (
                                            <option key={c.id} value={c.whatsapp}>
                                                {c.nome}{c.cargo ? ` — ${c.cargo}` : ''}{c.setor ? ` (${c.setor})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {internalContacts.length === 0 && (
                                        <p className="text-xs text-red-500 mt-0.5">Nenhum contato interno com WhatsApp. Cadastre em Administração → Contatos Internos.</p>
                                    )}
                                    <p className="text-xs text-gray-400 mt-0.5">Líder e WhatsApp recebem os alertas da obra.</p>
                                </div>

                                {!isCentroCusto && (
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                                            <ClipboardList size={14}/> Fiscal da Obra
                                        </label>
                                        <input
                                            type="text"
                                            value={fiscal}
                                            onChange={(e) => setFiscal(e.target.value)}
                                            className="w-full p-2 border rounded focus:ring-2 focus:ring-yellow-400 outline-none"
                                            placeholder="Nome do Fiscal"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Fase: regressão manual só na edição. Na criação o selo do
                                cabeçalho já diz que a obra nasce no radar. */}
                            {!isCentroCusto && obra && (
                                <div className="pt-3 border-t">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Fase da Obra</label>
                                    <select
                                        value={statusObra}
                                        onChange={(e) => setStatusObra(e.target.value)}
                                        className="w-full p-2 border rounded focus:ring-2 focus:ring-yellow-400 outline-none bg-white"
                                    >
                                        {OBRA_FASES.map(f => (
                                            <option key={f.value} value={f.value}>{f.label}</option>
                                        ))}
                                    </select>
                                    {PRE_ACTIVE_STATUSES.includes(statusObra) && (
                                        <p className="text-xs text-amber-700 mt-1">
                                            Obra em planejamento: fica fora dos fluxos operacionais e é ativada
                                            automaticamente ao receber o primeiro equipamento.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Sugestão, não decisão: recolhida por padrão. */}
                            {!isCentroCusto && colaboradoresProximos.length > 0 && (
                                <details className="border border-gray-200 rounded-lg bg-gray-50">
                                    <summary className="cursor-pointer list-none p-3 text-xs font-bold text-gray-600 uppercase flex items-center gap-1">
                                        <Users size={13} /> Colaboradores mais próximos ({colaboradoresProximos.length})
                                    </summary>
                                    <ul className="space-y-1 px-3 pb-3">
                                        {colaboradoresProximos.map(({ employee, distanciaKm, isLider, cidade }) => (
                                            <li key={employee.id} className="flex items-center gap-2 text-sm">
                                                {isLider
                                                    ? <Star size={13} className="text-yellow-500 flex-shrink-0" />
                                                    : <User size={13} className="text-gray-400 flex-shrink-0" />}
                                                <span className="font-medium text-gray-800 truncate">
                                                    {employee.nome}{employee.vulgo ? ` (${employee.vulgo})` : ''}
                                                </span>
                                                <span className="text-gray-400 text-xs truncate">{cidade}</span>
                                                <span className="ml-auto text-xs font-semibold text-gray-500 flex-shrink-0">
                                                    {distanciaKm.toFixed(0)} km
                                                </span>
                                            </li>
                                        ))}
                                        <li className="text-[11px] text-gray-400 pt-1">
                                            <Star size={10} className="inline text-yellow-500" /> = apto a liderar obra. Ordenado por distância da cidade de residência.
                                        </li>
                                    </ul>
                                </details>
                            )}
                        </div>

                        {/* ---- COLUNA DIREITA: plano de trabalho (contrato) ---- */}
                        {!isCentroCusto && (
                            <div className="min-w-0 md:col-span-3">
                                {!planoAberto && !temPlano ? (
                                    <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center bg-gray-50">
                                        <ClipboardList size={24} className="mx-auto text-gray-400" />
                                        <p className="text-sm font-bold text-gray-600 mt-2">Ainda sem plano de trabalho</p>
                                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                            A obra é criada <strong>no radar</strong>. Ao registrar horas ou setores
                                            contratados ela passa para <strong>plano definido</strong>.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setPlanoAberto(true)}
                                            className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-blue-700 bg-white px-3 py-1.5 rounded border border-blue-200 hover:bg-blue-50 transition"
                                        >
                                            <Plus size={14}/> Definir plano de trabalho
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setPlanoAberto(!planoAberto)}
                                            className="w-full flex items-center gap-1 text-sm font-bold text-gray-700 mb-3"
                                        >
                                            {planoAberto ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                                            Plano de trabalho
                                        </button>

                                        {planoAberto && (
                                            <div>
                                                <div className="flex gap-3 mb-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => setContractType('horas')}
                                                        className={`flex-1 py-2 rounded-lg border-2 font-bold text-sm transition ${contractType === 'horas' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                                    >
                                                        Por Horas
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setContractType('metrosQuadrados')}
                                                        className={`flex-1 py-2 rounded-lg border-2 font-bold text-sm transition ${contractType === 'metrosQuadrados' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                                    >
                                                        Por Produção (m²/Km)
                                                    </button>
                                                </div>
                        {/* A. POR HORAS (LISTA DINÂMICA) */}
                        {contractType === 'horas' && (
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 animate-fadeIn">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2">
                                        <Clock size={16}/> Equipamentos Contratados
                                    </h3>
                                    <button type="button" onClick={addContractedItem} className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold bg-white px-2 py-1 rounded border border-blue-200 shadow-sm">
                                        <Plus size={14}/> Adicionar Item
                                    </button>
                                </div>

                                {contractedItems.length === 0 && (
                                    <p className="text-sm text-gray-400 italic text-center py-4 bg-white rounded border border-dashed">
                                        Nenhum equipamento adicionado ao contrato.
                                    </p>
                                )}

                                <div className="space-y-3">
                                    {contractedItems.map((item, index) => (
                                        <div key={index} className="flex flex-col sm:flex-row gap-3 items-end bg-white p-3 rounded border shadow-sm">
                                            <div className="w-full sm:flex-1 min-w-0">
                                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Equipamento (Subgrupo)</label>
                                                <select
                                                    value={item.type}
                                                    onChange={(e) => updateContractedItem(index, 'type', e.target.value)}
                                                    className="w-full p-2 border rounded text-sm focus:ring-1 focus:ring-blue-400 outline-none bg-white"
                                                >
                                                    <option value="">Selecione...</option>
                                                    {item.type && !equipmentOptions.includes(item.type) && (
                                                        <option value={item.type}>{item.type} — fora da lista atual</option>
                                                    )}
                                                    {equipmentOptions.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="w-1/2 sm:w-24">
                                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Horas</label>
                                                <input
                                                    type="number"
                                                    value={item.hours}
                                                    onChange={(e) => updateContractedItem(index, 'hours', e.target.value)}
                                                    className="w-full p-2 border rounded text-sm"
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div className="w-1/2 sm:w-32">
                                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Valor Unit. (R$)</label>
                                                <CurrencyInput
                                                    value={item.price}
                                                    onChange={(e) => updateContractedItem(index, 'price', e.target.value)}
                                                    className="w-full p-2 border rounded text-sm"
                                                    placeholder="0,00"
                                                />
                                            </div>
                                            <button type="button" onClick={() => removeContractedItem(index)} className="p-2 text-red-400 hover:bg-red-50 rounded mb-0.5">
                                                <Trash2 size={18}/>
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Deslocamento Prancha */}
                                <div className="mt-4 pt-4 border-t border-blue-200">
                                    <h4 className="text-xs font-bold text-blue-800 mb-2 uppercase">Deslocamento (Caminhão Prancha)</h4>
                                    <div className="flex gap-4 bg-white p-3 rounded border">
                                        <div className="flex-1">
                                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Km Total</label>
                                            <input 
                                                type="number" 
                                                value={kmContratadoPrancha} 
                                                onChange={(e) => setKmContratadoPrancha(e.target.value)} 
                                                className="w-full p-2 border rounded text-sm" 
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Valor Km (R$)</label>
                                            <CurrencyInput
                                                value={valorKmPrancha}
                                                onChange={(e) => setValorKmPrancha(e.target.value)}
                                                className="w-full p-2 border rounded text-sm"
                                                placeholder="0,00"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* B. POR M2 (SETORES) */}
                        {contractType === 'metrosQuadrados' && (
                            <div className="bg-green-50 p-4 rounded-lg border border-green-100 animate-fadeIn">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-sm font-bold text-green-800 flex items-center justify-between">
                                        Setores / Trechos
                                    </h3>
                                    <button type="button" onClick={addSector} className="text-xs flex items-center gap-1 text-green-600 hover:text-green-800 font-bold bg-white px-2 py-1 rounded border border-green-200 shadow-sm">
                                        <Plus size={14}/> Adicionar Setor
                                    </button>
                                </div>
                                
                                <div className="space-y-3">
                                    {sectors.map((sector, idx) => (
                                        <div key={idx} className="flex flex-col sm:flex-row gap-3 items-end bg-white p-3 rounded border shadow-sm">
                                            <div className="w-full sm:flex-1 min-w-0">
                                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Nome do Setor</label>
                                                <input
                                                    type="text"
                                                    value={sector.name}
                                                    onChange={(e) => updateSector(idx, 'name', e.target.value)}
                                                    className="w-full p-2 border rounded text-sm"
                                                    placeholder="Ex: Trecho 1"
                                                />
                                            </div>
                                            <div className="w-1/2 sm:w-24">
                                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Qtd (m²/Km)</label>
                                                <input
                                                    type="number"
                                                    value={sector.kmContratado}
                                                    onChange={(e) => updateSector(idx, 'kmContratado', e.target.value)}
                                                    className="w-full p-2 border rounded text-sm"
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div className="w-1/2 sm:w-32">
                                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Preço Unit. (R$)</label>
                                                <CurrencyInput
                                                    value={sector.price}
                                                    onChange={(e) => updateSector(idx, 'price', e.target.value)}
                                                    className="w-full p-2 border rounded text-sm"
                                                    placeholder="0,00"
                                                />
                                            </div>
                                            <button type="button" onClick={() => removeSector(idx)} className="p-2 text-red-400 hover:bg-red-50 rounded mb-0.5">
                                                <Trash2 size={18}/>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                {sectors.length === 0 && <p className="text-center text-gray-400 text-sm italic py-4">Nenhum setor adicionado.</p>}
                                
                                {/* Deslocamento Prancha (Opcional no M2) */}
                                <div className="mt-4 pt-4 border-t border-green-200">
                                    <h4 className="text-xs font-bold text-green-800 mb-2 uppercase">Deslocamento (Caminhão Prancha)</h4>
                                    <div className="flex gap-4 bg-white p-3 rounded border">
                                        <div className="flex-1">
                                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Km Total</label>
                                            <input 
                                                type="number" 
                                                value={kmContratadoPrancha} 
                                                onChange={(e) => setKmContratadoPrancha(e.target.value)} 
                                                className="w-full p-2 border rounded text-sm" 
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Valor Km (R$)</label>
                                            <CurrencyInput
                                                value={valorKmPrancha}
                                                onChange={(e) => setValorKmPrancha(e.target.value)}
                                                className="w-full p-2 border rounded text-sm"
                                                placeholder="0,00"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Rodapé fixo: o total acompanha a digitação do contrato. */}
                    <div className="flex-shrink-0 border-t bg-gray-50 px-6 py-3 flex items-center gap-4">
                        {!isCentroCusto && (
                            <div className="min-w-0">
                                <p className="text-[11px] text-gray-500 flex items-center gap-1">
                                    <DollarSign size={12}/> Valor total estimado
                                </p>
                                <p className="text-lg font-bold text-gray-900 leading-tight">
                                    {totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </p>
                            </div>
                        )}
                        <div className="ml-auto flex gap-3">
                            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 font-bold rounded hover:bg-gray-200 transition" disabled={isSubmitting}>Cancelar</button>
                            <button type="submit" className="px-6 py-2 bg-yellow-400 text-gray-900 font-bold rounded hover:bg-yellow-300 transition shadow flex items-center gap-2" disabled={isSubmitting}>
                                {isSubmitting ? <><Loader className="animate-spin" size={18}/> Salvando...</> : (isCentroCusto ? 'Salvar Centro de Custo' : 'Salvar Obra')}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ObraModal;
