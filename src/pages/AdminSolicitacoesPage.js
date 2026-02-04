import React, { useState, useEffect } from 'react';
import { 
    Check, X, AlertTriangle, MapPin, Eye, Fuel, 
    Calendar, Loader, Search, RefreshCw, Smartphone, DollarSign, Image as ImageIcon,
    ExternalLink, BarChart3, Clock, TrendingUp
} from 'lucide-react';
import { getAllowedReadingTypes } from '../utils/vehicleRules';

// --- IMPORTAÇÃO DA NOVA FUNÇÃO BLINDADA ---
// Certifique-se de salvar o arquivo acima em src/utils/refuelingPdfService.js
import { sendOrderToWhatsApp } from '../utils/refuelingPdfService'; 

const AdminSolicitacoesPage = ({ 
    apiClient, 
    setAlertMessage, 
    vehicles = [],
    partners = [], 
    employees = [],
    obras = [],
    vehicleGroups = {},
    refuelings = [], 
    expenses = [],
    onGeneratePDF,
    user // Prop user necessária para o PDF
}) => {
    
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [filteredSolicitacoes, setFilteredSolicitacoes] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Controle do Modal
    const [modalData, setModalData] = useState(null); 
    const [rejectReason, setRejectReason] = useState('');
    
    // Filtros
    const [filterStatus, setFilterStatus] = useState('PENDENTE'); 
    const [searchTerm, setSearchTerm] = useState('');

    // --- CARREGAMENTO INICIAL E POLLING ---
    const fetchSolicitacoes = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/solicitacoes');
            setSolicitacoes(Array.isArray(res) ? res : []);
        } catch (error) {
            console.error("Erro ao buscar solicitações", error);
            setAlertMessage("Erro ao carregar lista de solicitações.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSolicitacoes();
        const interval = setInterval(fetchSolicitacoes, 30000);
        return () => clearInterval(interval);
    }, []);

    // --- FILTROS ---
    useEffect(() => {
        let list = [...solicitacoes];
        
        if (filterStatus !== 'TODOS') {
            if (filterStatus === 'PENDENTE') {
                list = list.filter(s => s.status === 'PENDENTE');
            } else if (filterStatus === 'AGUARDANDO_BAIXA') {
                list = list.filter(s => s.status === 'AGUARDANDO_BAIXA');
            } else {
                list = list.filter(s => s.status === filterStatus);
            }
        }

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            list = list.filter(s => 
                (s.placa && s.placa.toLowerCase().includes(lower)) || 
                (s.veiculo_nome && s.veiculo_nome.toLowerCase().includes(lower)) ||
                (s.solicitante_nome && s.solicitante_nome.toLowerCase().includes(lower))
            );
        }

        setFilteredSolicitacoes(list);
    }, [solicitacoes, filterStatus, searchTerm]);

    // --- HELPERS AUXILIARES ---
    const getFuncionarioNome = (id) => employees.find(e => String(e.id) === String(id))?.nome || 'Não informado';
    const getPostoNome = (id) => partners.find(p => String(p.id) === String(id))?.razaoSocial || 'Posto não identificado';
    const getObraNome = (id) => obras.find(o => String(o.id) === String(id))?.nome || 'Obra não identificada';

    const getSafeDateObj = (dateInput) => {
        if (!dateInput) return new Date(0);
        try {
            let dateStr = String(dateInput);
            if (dateStr.includes(' ') && !dateStr.includes('T')) dateStr = dateStr.replace(' ', 'T');
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? new Date(0) : d;
        } catch { return new Date(0); }
    };

    // --- CÁLCULO DE ÚLTIMO ABASTECIMENTO E MÉDIA ---
    const getLastFuelingInfo = (veiculoId) => {
        if (!refuelings || refuelings.length === 0) return "Histórico indisponível (Lista vazia).";

        const vehicle = vehicles.find(v => String(v.id) === String(veiculoId));
        if (!vehicle) return "Veículo não encontrado.";

        // Filtra abastecimentos CONCLUÍDOS/CONFIRMADOS deste veículo
        const history = refuelings
            .filter(r => String(r.vehicleId) === String(veiculoId) && (r.status === 'Concluída' || r.status === 'Confirmada'))
            .sort((a, b) => getSafeDateObj(b.data || b.date).getTime() - getSafeDateObj(a.data || a.date).getTime());

        const last = history[0];
        if (!last) return "Nenhum abastecimento anterior registrado.";

        // Cálculo de Média
        let mediaTexto = "N/A";
        const penultimo = history[1];
        
        if (penultimo) {
            const litros = parseFloat(last.litrosAbastecidos || last.litrosLiberados || 0);
            let diff = 0;
            let unit = 'Km/L';

            const allowed = getAllowedReadingTypes(vehicle.tipo);
            if (allowed.includes('horimetro')) {
                const lastHr = parseFloat(last.horimetro || last.horimetroDigital || 0); 
                const prevHr = parseFloat(penultimo.horimetro || penultimo.horimetroDigital || 0);
                diff = lastHr - prevHr;
                unit = 'L/h';
            } else {
                const lastKm = parseFloat(last.odometro || 0);
                const prevKm = parseFloat(penultimo.odometro || 0);
                diff = lastKm - prevKm;
            }

            if (diff > 0 && litros > 0) {
                const avg = unit === 'Km/L' ? (diff / litros) : (litros / diff);
                mediaTexto = `${avg.toFixed(2)} ${unit}`;
            } else {
                mediaTexto = 'Incalculável';
            }
        }

        const postoName = last.partnerName || partners.find(p => String(p.id) === String(last.partnerId))?.razaoSocial || "Desconhecido";
        const dateStr = getSafeDateObj(last.data || last.date).toLocaleDateString('pt-BR');
        const fuel = last.fuelType || 'Combustível';
        
        const allowedReadings = getAllowedReadingTypes(vehicle.tipo);
        const isKm = allowedReadings.includes('odometro');
        const readVal = isKm ? (last.odometro || 0) : (last.horimetro || last.horimetroDigital || 0);
        const litrosVal = last.litrosAbastecidos || last.litrosLiberados || 0;

        return `Último: ${dateStr} / Posto: ${postoName} / ${litrosVal} L (${fuel}) / Leitura: ${readVal} / Média: ${mediaTexto}`;
    };

    // --- CÁLCULO DE PROGRESSO FINANCEIRO ---
    const getFinancialProgress = (obraId) => {
        if (!obras || obras.length === 0) return "Dados de obras não carregados.";
        
        const obra = obras.find(o => String(o.id) === String(obraId));
        if (!obra) return "Obra não vinculada.";

        const totalGasto = expenses
            .filter(e => String(e.obraId) === String(obraId) && (e.category === 'Combustível' || e.fuelType))
            .reduce((acc, curr) => acc + parseFloat(curr.amount || 0), 0);
            
        const totalContrato = parseFloat(obra.valorContrato || obra.valorTotalContrato || 0);
        const formatMoney = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        if (totalContrato > 0) {
            const pct = ((totalGasto / totalContrato) * 100).toFixed(1);
            return `Gasto Combustível: ${formatMoney(totalGasto)} / Contrato Total: ${formatMoney(totalContrato)} / ${pct}% utilizado`;
        }
        
        return `Gasto Combustível: ${formatMoney(totalGasto)} / Contrato Total: Não definido`;
    };

    // --- AÇÕES ---
    const handleAprovar = async (id) => {
        if (!window.confirm("Deseja realmente aprovar e gerar a Ordem de Abastecimento?")) return;
        
        const s = solicitacoes.find(item => item.id === id);

        try {
            const res = await apiClient.put(`/solicitacoes/${id}/avaliar`, { status: 'LIBERADO' });
            
            setAlertMessage("Solicitação Aprovada! Ordem gerada com sucesso.");
            setModalData(null);
            fetchSolicitacoes();

            if (s && res && res.authNumber) {
                const vehicle = vehicles.find(v => v.id === s.veiculo_id);
                const partner = partners.find(p => p.id === s.posto_id);
                const employee = employees.find(e => e.id === s.funcionario_id);

                const orderData = {
                    authNumber: res.authNumber,
                    date: new Date().toISOString(),
                    vehicleId: s.veiculo_id,
                    partnerId: s.posto_id,
                    partnerName: partner?.razaoSocial,
                    employeeId: s.funcionario_id,
                    fuelType: s.tipo_combustivel,
                    isFillUp: !!s.flag_tanque_cheio,
                    litrosLiberados: s.litragem_solicitada,
                    odometro: s.odometro_informado,
                    horimetro: s.horimetro_informado,
                    needsArla: s.observacao && s.observacao.includes('ARLA'),
                    isFillUpArla: false, 
                    litrosLiberadosArla: '', 
                    outros: s.observacao,
                    createdBy: user || { name: 'Gestor (App)' }
                };

                // --- CHAMADA PARA A NOVA FUNÇÃO EXTERNA ---
                await sendOrderToWhatsApp({
                    finalData: orderData,
                    vehicle,
                    partner,
                    employee,
                    vehicles,
                    partners,
                    employees,
                    vehicleGroups,
                    onGeneratePDF,
                    apiClient,
                    setAlertMessage
                });
            }

        } catch (error) {
            setAlertMessage("Erro ao aprovar: " + (error.response?.data?.error || error.message));
        }
    };

    const handleNegar = async (id) => {
        if (!rejectReason.trim()) {
            alert("É obrigatório informar o motivo da negativa.");
            return;
        }
        try {
            await apiClient.put(`/solicitacoes/${id}/avaliar`, { status: 'NEGADO', motivoNegativa: rejectReason });
            setAlertMessage("Solicitação Negada.");
            setModalData(null);
            setRejectReason('');
            fetchSolicitacoes();
        } catch (error) {
            setAlertMessage("Erro ao negar: " + (error.response?.data?.error || error.message));
        }
    };

    const handleConfirmarBaixa = async (id) => {
        try {
            await apiClient.put(`/solicitacoes/${id}/confirmar-baixa`, {});
            setAlertMessage("Baixa confirmada!");
            setModalData(null);
            fetchSolicitacoes();
        } catch (error) {
            setAlertMessage("Erro ao confirmar baixa: " + (error.response?.data?.error || error.message));
        }
    };

    const handleRejeitarComprovante = async (id) => {
        if (!window.confirm("O usuário será notificado para enviar uma nova foto. Confirmar?")) return;
        try {
            await apiClient.put(`/solicitacoes/${id}/rejeitar-comprovante`, {});
            setAlertMessage("Comprovante rejeitado. Usuário notificado.");
            setModalData(null);
            fetchSolicitacoes();
        } catch (error) {
            setAlertMessage("Erro ao rejeitar comprovante: " + (error.response?.data?.error || error.message));
        }
    };

    const getBaseURL = () => {
        if (apiClient.defaults?.baseURL) {
            return apiClient.defaults.baseURL.replace('/api', '');
        }
        return ''; 
    };

    // --- MODAL DE AVALIAÇÃO (COMPACTO) ---
    const renderModal = () => {
        if (!modalData) return null;
        const s = modalData;
        const isApproval = s.status === 'PENDENTE';
        const isBaixa = s.status === 'AGUARDANDO_BAIXA';

        const baseURL = getBaseURL();
        const urlPainel = s.foto_painel_path ? `${baseURL}${s.foto_painel_path}` : null;
        const urlCupom = s.foto_cupom_path ? `${baseURL}${s.foto_cupom_path}` : null;

        const vehicleCurrent = vehicles.find(v => v.id === s.veiculo_id) || {};
        const leituraAtualSistema = parseFloat(s.odometro_informado ? (vehicleCurrent.odometro || 0) : (vehicleCurrent.horimetro || 0));
        const leituraInformada = parseFloat(s.odometro_informado || s.horimetro_informado || 0);
        const diferenca = leituraInformada - leituraAtualSistema;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-2 animate-fadeIn">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col md:flex-row overflow-hidden">
                    
                    {/* COLUNA ESQUERDA: EVIDÊNCIAS */}
                    <div className="md:w-1/2 bg-gray-900 flex flex-col relative">
                        <div className="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/70 to-transparent z-10 flex justify-between items-center text-white">
                            <h4 className="font-bold flex items-center gap-2 text-sm">
                                <ImageIcon size={16}/> {isApproval ? 'Evidência do Painel' : 'Comprovante Fiscal'}
                            </h4>
                            {s.latitude && (
                                <a href={`https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`} target="_blank" rel="noreferrer" className="text-[10px] bg-white/20 hover:bg-white/30 px-2 py-1 rounded-full flex items-center gap-1 transition">
                                    <MapPin size={10}/> Ver Localização GPS
                                </a>
                            )}
                        </div>
                        <div className="flex-1 flex items-center justify-center p-2 bg-black">
                            {isApproval && urlPainel ? (
                                <img src={urlPainel} alt="Painel" className="max-w-full max-h-full object-contain" />
                            ) : isBaixa && urlCupom ? (
                                <img src={urlCupom} alt="Cupom" className="max-w-full max-h-full object-contain" />
                            ) : (
                                <div className="text-gray-500 flex flex-col items-center">
                                    <AlertTriangle size={32} className="mb-2"/>
                                    <p className="text-xs">Imagem indisponível</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* COLUNA DIREITA: DADOS E AÇÃO (COMPACTO) */}
                    <div className="md:w-1/2 flex flex-col bg-gray-50">
                        <div className="p-3 border-b bg-white">
                            <div className="flex justify-between items-start mb-1">
                                <div>
                                    <h2 className="text-base font-bold text-gray-800 leading-tight">
                                        {isApproval ? 'Análise de Solicitação' : 'Conferência de Baixa'}
                                    </h2>
                                    <p className="text-[10px] text-gray-500">#{s.id} • {new Date(s.data_solicitacao).toLocaleString()}</p>
                                </div>
                                <button onClick={() => setModalData(null)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500"><X size={20}/></button>
                            </div>
                            
                            <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                                <p className="font-bold text-gray-800 text-sm leading-tight">{s.veiculo_nome}</p>
                                <p className="text-xs text-gray-600 leading-tight">{s.placa} • {s.solicitante_nome}</p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                            
                            {/* Comparativo de Leitura */}
                            <div className="bg-white p-2 rounded border shadow-sm">
                                <div className="flex justify-between items-center mb-1">
                                    <h5 className="text-[10px] font-bold text-gray-400 uppercase">Validar Leitura</h5>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${diferenca < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                        Dif: {diferenca > 0 ? '+' : ''}{diferenca.toFixed(1)}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <p className="text-[10px] text-gray-500">Informado</p>
                                        <p className="font-bold text-blue-600">{leituraInformada} {s.odometro_informado ? 'Km' : 'h'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-500">Sistema</p>
                                        <p className="font-bold text-gray-700">{leituraAtualSistema}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Detalhes do Pedido - Layout Mais Denso */}
                            <div className="bg-white p-2 rounded border shadow-sm">
                                <h5 className="text-[10px] font-bold text-gray-400 uppercase mb-1">Detalhes do Pedido</h5>
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                                    <div>
                                        <span className="text-[9px] text-gray-500 block">Combustível</span>
                                        <span className="font-bold text-gray-800">{s.tipo_combustivel}</span>
                                    </div>
                                    <div>
                                        <span className="text-[9px] text-gray-500 block">Quantidade</span>
                                        <span className="font-bold text-gray-800">{s.flag_tanque_cheio ? 'COMPLETAR' : `${s.litragem_solicitada} L`}</span>
                                    </div>
                                    <div>
                                        <span className="text-[9px] text-gray-500 block">Motorista</span>
                                        <span className="font-bold text-purple-700 truncate block" title={getFuncionarioNome(s.funcionario_id)}>{getFuncionarioNome(s.funcionario_id)}</span>
                                    </div>
                                    <div>
                                        <span className="text-[9px] text-gray-500 block">Data</span>
                                        <span className="font-bold text-gray-800">
                                            {s.data_abastecimento ? new Date(s.data_abastecimento).toLocaleDateString('pt-BR') : new Date(s.data_solicitacao).toLocaleDateString('pt-BR')}
                                        </span>
                                    </div>
                                    <div className="col-span-2 pt-1 border-t border-gray-100">
                                        <span className="text-[9px] text-gray-500 block">Posto</span>
                                        <span className="font-medium text-gray-800 leading-tight block text-[11px]">{getPostoNome(s.posto_id)}</span>
                                    </div>
                                    <div className="col-span-2">
                                        <span className="text-[9px] text-gray-500 block">Obra</span>
                                        <span className="font-medium text-gray-800 leading-tight block text-[11px]">{getObraNome(s.obra_id)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* DADOS DE ANÁLISE */}
                            <div className="space-y-1.5 pt-1">
                                {/* Info Último Abastecimento */}
                                <div className="bg-gray-100 p-2 rounded border border-gray-200">
                                    <p className="text-[9px] text-gray-500 uppercase font-bold mb-0.5 flex items-center gap-1"><Clock size={10}/> Último Abastecimento</p>
                                    <p className="text-[10px] text-gray-800 font-mono leading-tight whitespace-pre-wrap">
                                        {getLastFuelingInfo(s.veiculo_id)}
                                    </p>
                                </div>

                                {/* Info Progresso Financeiro */}
                                <div className="bg-green-50 p-2 rounded border border-green-200">
                                    <p className="text-[9px] text-green-700 uppercase font-bold mb-0.5 flex items-center gap-1"><TrendingUp size={10}/> Financeiro (Obra)</p>
                                    <p className="text-[10px] text-green-900 font-mono leading-tight whitespace-pre-wrap">
                                        {getFinancialProgress(s.obra_id)}
                                    </p>
                                </div>
                            </div>

                            {/* Alertas */}
                            {s.alerta_media_consumo === 1 && (
                                <div className="bg-red-50 border-l-2 border-red-500 p-2 rounded">
                                    <div className="flex items-center gap-1 text-red-800 font-bold text-[10px]">
                                        <AlertTriangle size={10}/> ATENÇÃO: Queda de Média (Acima de 25%)
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer: Ações */}
                        <div className="p-3 bg-white border-t space-y-2">
                            {isApproval ? (
                                <>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleAprovar(s.id)} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded shadow text-xs flex items-center justify-center gap-1 transition">
                                            <Check size={14}/> APROVAR
                                        </button>
                                        <button onClick={() => setRejectReason(' ')} className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded border border-red-200 text-xs transition">
                                            Negar...
                                        </button>
                                    </div>
                                    {rejectReason !== '' && (
                                        <div className="animate-slide-up bg-red-50 p-2 rounded border border-red-200 mt-1">
                                            <label className="text-[9px] font-bold text-red-800 mb-1 block">Motivo da Negativa:</label>
                                            <textarea className="w-full p-1 border rounded text-xs focus:ring-1 focus:ring-red-500 outline-none" rows="2" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Ex: Foto ilegível..." autoFocus></textarea>
                                            <div className="flex justify-end gap-2 mt-1">
                                                <button onClick={() => setRejectReason('')} className="text-[9px] text-gray-500 underline">Cancelar</button>
                                                <button onClick={() => handleNegar(s.id)} className="px-2 py-1 bg-red-600 text-white text-[10px] font-bold rounded hover:bg-red-700">Confirmar</button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : isBaixa ? (
                                <div className="flex gap-2">
                                    <button onClick={() => handleConfirmarBaixa(s.id)} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded shadow text-xs flex items-center justify-center gap-1 transition">
                                        <Check size={16}/> CONFIRMAR BAIXA
                                    </button>
                                    <button onClick={() => handleRejeitarComprovante(s.id)} className="flex-1 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold rounded border border-orange-200 text-xs flex items-center justify-center gap-1 transition">
                                        <X size={16}/> Rejeitar Foto
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center text-[10px] text-gray-400 py-1">
                                    Solicitação finalizada ({s.status})
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6 animate-fadeIn">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Smartphone className="text-purple-600" /> Gestão de Solicitações (App)
                    </h1>
                    <p className="text-gray-500 text-sm">Central de aprovação de abastecimentos via Mobile.</p>
                </div>
                
                <div className="flex flex-wrap gap-2 justify-center md:justify-end">
                    <button onClick={() => setFilterStatus('PENDENTE')} className={`px-4 py-2 rounded-lg font-bold text-sm transition flex items-center gap-2 ${filterStatus === 'PENDENTE' ? 'bg-yellow-400 text-gray-900 shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        Pendentes
                        {solicitacoes.filter(s => s.status === 'PENDENTE').length > 0 && (
                            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{solicitacoes.filter(s => s.status === 'PENDENTE').length}</span>
                        )}
                    </button>
                    <button onClick={() => setFilterStatus('AGUARDANDO_BAIXA')} className={`px-4 py-2 rounded-lg font-bold text-sm transition flex items-center gap-2 ${filterStatus === 'AGUARDANDO_BAIXA' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        Baixas
                        {solicitacoes.filter(s => s.status === 'AGUARDANDO_BAIXA').length > 0 && (
                            <span className="bg-blue-800 text-white text-[10px] px-1.5 py-0.5 rounded-full">{solicitacoes.filter(s => s.status === 'AGUARDANDO_BAIXA').length}</span>
                        )}
                    </button>
                    <button onClick={() => setFilterStatus('TODOS')} className={`px-4 py-2 rounded-lg font-bold text-sm transition ${filterStatus === 'TODOS' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        Histórico
                    </button>
                    <button onClick={fetchSolicitacoes} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 border border-gray-200">
                        <RefreshCw size={20} className={loading ? "animate-spin text-blue-600" : "text-gray-600"}/>
                    </button>
                </div>
            </div>

            <div className="relative">
                <input 
                    type="text" 
                    placeholder="Buscar por placa, veículo ou solicitante..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-400 outline-none shadow-sm"
                />
                <Search className="absolute left-3 top-3.5 text-gray-400" size={18} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {loading && filteredSolicitacoes.length === 0 && (
                    <div className="col-span-full py-20 text-center text-gray-400">
                        <Loader className="animate-spin inline mr-2" /> Carregando solicitações...
                    </div>
                )}
                {!loading && filteredSolicitacoes.length === 0 && (
                    <div className="col-span-full py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-center text-gray-400">
                        Nenhuma solicitação encontrada com os filtros atuais.
                    </div>
                )}
                {filteredSolicitacoes.map(s => {
                    let borderColor = 'border-gray-200';
                    let statusColor = 'bg-gray-100 text-gray-600';
                    let statusLabel = s.status.replace('_', ' ');

                    if (s.status === 'PENDENTE') {
                        borderColor = 'border-yellow-300';
                        statusColor = 'bg-yellow-100 text-yellow-800';
                        statusLabel = 'PENDENTE';
                    } else if (s.status === 'AGUARDANDO_BAIXA') {
                        borderColor = 'border-blue-300';
                        statusColor = 'bg-blue-100 text-blue-800';
                    } else if (s.status === 'LIBERADO') {
                        borderColor = 'border-green-300';
                        statusColor = 'bg-green-100 text-green-800';
                    } else if (s.status === 'NEGADO') {
                        borderColor = 'border-red-300';
                        statusColor = 'bg-red-100 text-red-800';
                    }

                    return (
                        <div key={s.id} className={`bg-white rounded-xl shadow-sm border-2 hover:shadow-md transition p-4 relative overflow-hidden group flex flex-col ${borderColor}`}>
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-bold text-gray-400">#{s.id}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${statusColor}`}>
                                    {statusLabel}
                                </span>
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-gray-800 text-lg truncate" title={s.veiculo_nome}>{s.veiculo_nome}</h3>
                                <p className="text-sm text-gray-600 font-medium mb-3">{s.placa}</p>
                                <div className="space-y-1 text-xs text-gray-500 mb-3 bg-gray-50 p-2 rounded">
                                    <div className="flex justify-between">
                                        <span>Solicitante:</span>
                                        <span className="font-bold text-gray-700 truncate max-w-[100px]">{s.solicitante_nome}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Posto:</span>
                                        <span className="font-bold text-gray-700 truncate max-w-[100px]">{s.posto_nome || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between pt-1 border-t border-gray-200 mt-1">
                                        <span>Pedido:</span>
                                        <span className="font-bold text-gray-900">
                                            {s.litragem_solicitada ? `${s.litragem_solicitada}L` : 'Cheio'} • {s.tipo_combustivel}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-2 pt-2 border-t">
                                {(s.status === 'PENDENTE' || s.status === 'AGUARDANDO_BAIXA') ? (
                                    <button onClick={() => setModalData(s)} className="w-full bg-gray-900 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-gray-800 flex items-center justify-center gap-2 transition">
                                        <Eye size={16}/> AVALIAR
                                    </button>
                                ) : (
                                    <div className="text-center text-xs text-gray-400 py-1">
                                        Processado em {s.data_aprovacao ? new Date(s.data_aprovacao).toLocaleDateString() : '-'}\r
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {renderModal()}
        </div>
    );
};

export default AdminSolicitacoesPage;