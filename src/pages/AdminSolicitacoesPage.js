import React, { useState, useEffect } from 'react';
import { 
    Check, X, AlertTriangle, MapPin, Eye, Fuel, 
    Calendar, Loader, Search, RefreshCw, Smartphone, DollarSign, Image as ImageIcon,
    ExternalLink
} from 'lucide-react';

const AdminSolicitacoesPage = ({ apiClient, setAlertMessage, vehicles }) => {
    
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [filteredSolicitacoes, setFilteredSolicitacoes] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Controle do Modal
    const [modalData, setModalData] = useState(null); 
    const [rejectReason, setRejectReason] = useState('');
    
    // Filtros
    const [filterStatus, setFilterStatus] = useState('PENDENTE'); // PENDENTE, AGUARDANDO_BAIXA, TODOS
    const [searchTerm, setSearchTerm] = useState('');

    // --- CARREGAMENTO INICIAL E POLLING ---
    const fetchSolicitacoes = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/solicitacoes');
            // O endpoint retorna array direto
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
        // Polling para atualização automática a cada 30s
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

    // --- AÇÕES ---

    const handleAprovar = async (id) => {
        if (!window.confirm("Deseja realmente aprovar e gerar a Ordem de Abastecimento?")) return;
        
        try {
            await apiClient.put(`/solicitacoes/${id}/avaliar`, { status: 'LIBERADO' });
            setAlertMessage("Solicitação Aprovada! Ordem gerada com sucesso.");
            setModalData(null);
            fetchSolicitacoes();
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
            await apiClient.put(`/solicitacoes/${id}/avaliar`, { 
                status: 'NEGADO', 
                motivoNegativa: rejectReason 
            });
            setAlertMessage("Solicitação Negada.");
            setModalData(null);
            setRejectReason('');
            fetchSolicitacoes();
        } catch (error) {
            setAlertMessage("Erro ao negar: " + (error.response?.data?.error || error.message));
        }
    };

    const handleConfirmarBaixa = async (id) => {
        // Confirmar baixa apenas finaliza o fluxo visual. A baixa financeira real idealmente ocorre no RefuelingPage
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

    // --- HELPERS VISUAIS ---
    const getBaseURL = () => {
        // Tenta inferir a URL base para imagens
        if (apiClient.defaults?.baseURL) {
            return apiClient.defaults.baseURL.replace('/api', '');
        }
        return ''; 
    };

    // --- MODAL DE AVALIAÇÃO ---
    const renderModal = () => {
        if (!modalData) return null;
        const s = modalData;
        const isApproval = s.status === 'PENDENTE';
        const isBaixa = s.status === 'AGUARDANDO_BAIXA';

        // URL das Imagens
        const baseURL = getBaseURL();
        const urlPainel = s.foto_painel_path ? `${baseURL}${s.foto_painel_path}` : null;
        const urlCupom = s.foto_cupom_path ? `${baseURL}${s.foto_cupom_path}` : null;

        // Veículo atual para comparar leitura
        const vehicleCurrent = vehicles.find(v => v.id === s.veiculo_id) || {};
        const leituraAtualSistema = parseFloat(s.odometro_informado ? (vehicleCurrent.odometro || 0) : (vehicleCurrent.horimetro || 0));
        const leituraInformada = parseFloat(s.odometro_informado || s.horimetro_informado || 0);
        const diferenca = leituraInformada - leituraAtualSistema;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4 animate-fadeIn">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col md:flex-row overflow-hidden">
                    
                    {/* COLUNA ESQUERDA: EVIDÊNCIAS (FOTOS) */}
                    <div className="md:w-3/5 bg-gray-900 flex flex-col relative">
                        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent z-10 flex justify-between items-center text-white">
                            <h4 className="font-bold flex items-center gap-2">
                                <ImageIcon size={18}/> {isApproval ? 'Evidência do Painel' : 'Comprovante Fiscal'}
                            </h4>
                            {s.latitude && (
                                <a 
                                    href={`https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full flex items-center gap-1 transition"
                                >
                                    <MapPin size={12}/> Ver Localização GPS
                                </a>
                            )}
                        </div>

                        <div className="flex-1 flex items-center justify-center p-4 bg-black">
                            {isApproval && urlPainel ? (
                                <img src={urlPainel} alt="Painel" className="max-w-full max-h-full object-contain" />
                            ) : isBaixa && urlCupom ? (
                                <img src={urlCupom} alt="Cupom" className="max-w-full max-h-full object-contain" />
                            ) : (
                                <div className="text-gray-500 flex flex-col items-center">
                                    <AlertTriangle size={48} className="mb-2"/>
                                    <p>Imagem indisponível</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* COLUNA DIREITA: DADOS E AÇÃO */}
                    <div className="md:w-2/5 flex flex-col bg-gray-50">
                        <div className="p-6 border-b bg-white">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-800">
                                        {isApproval ? 'Análise de Solicitação' : 'Conferência de Baixa'}
                                    </h2>
                                    <p className="text-sm text-gray-500">#{s.id} • {new Date(s.data_solicitacao).toLocaleString()}</p>
                                </div>
                                <button onClick={() => setModalData(null)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><X size={24}/></button>
                            </div>
                            
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                <p className="font-bold text-gray-800 text-lg">{s.veiculo_nome}</p>
                                <p className="text-sm text-gray-600">{s.placa} • {s.solicitante_nome}</p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            
                            {/* Comparativo de Leitura */}
                            <div>
                                <h5 className="text-xs font-bold text-gray-400 uppercase mb-2">Validar Leitura</h5>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white p-3 rounded-lg border shadow-sm">
                                        <p className="text-xs text-gray-500">Informado (Foto)</p>
                                        <p className="text-2xl font-bold text-blue-600">
                                            {leituraInformada} <span className="text-sm text-gray-400">{s.odometro_informado ? 'Km' : 'h'}</span>
                                        </p>
                                    </div>
                                    <div className="bg-white p-3 rounded-lg border shadow-sm">
                                        <p className="text-xs text-gray-500">Sistema (Anterior)</p>
                                        <p className="text-2xl font-bold text-gray-700">
                                            {leituraAtualSistema}
                                        </p>
                                    </div>
                                </div>
                                <div className={`mt-2 text-xs font-bold px-2 py-1 rounded inline-block ${diferenca < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                    Diferença: {diferenca > 0 ? '+' : ''}{diferenca.toFixed(1)}
                                </div>
                            </div>

                            {/* Detalhes Combustível */}
                            <div>
                                <h5 className="text-xs font-bold text-gray-400 uppercase mb-2">Pedido</h5>
                                <div className="bg-white p-4 rounded-lg border shadow-sm space-y-3">
                                    <div className="flex justify-between border-b pb-2">
                                        <span className="text-gray-600">Combustível</span>
                                        <span className="font-bold">{s.tipo_combustivel}</span>
                                    </div>
                                    <div className="flex justify-between border-b pb-2">
                                        <span className="text-gray-600">Quantidade</span>
                                        <span className="font-bold">{s.flag_tanque_cheio ? 'COMPLETAR TANQUE' : `${s.litragem_solicitada} L`}</span>
                                    </div>
                                    <div className="flex justify-between border-b pb-2">
                                        <span className="text-gray-600">Posto</span>
                                        <span className="font-medium text-right truncate w-40">{s.posto_nome || 'A definir'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Obra</span>
                                        <span className="font-medium text-right truncate w-40">{s.obra_nome}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Alertas */}
                            {s.alerta_media_consumo === 1 && (
                                <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded">
                                    <div className="flex items-center gap-2 text-red-800 font-bold text-sm">
                                        <AlertTriangle size={16}/> ATENÇÃO: Queda de Média
                                    </div>
                                    <p className="text-xs text-red-700 mt-1">O consumo deste veículo aumentou drasticamente (>25%) comparado ao histórico.</p>
                                </div>
                            )}

                        </div>

                        {/* Footer: Ações */}
                        <div className="p-6 bg-white border-t space-y-3">
                            {isApproval ? (
                                <>
                                    <div className="flex gap-3">
                                        <button 
                                            onClick={() => handleAprovar(s.id)}
                                            className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 transition"
                                        >
                                            <Check size={20}/> APROVAR
                                        </button>
                                        <button 
                                            onClick={() => setRejectReason(' ')} 
                                            className="px-4 py-3 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-lg border border-red-200 transition"
                                        >
                                            Negar...
                                        </button>
                                    </div>
                                    
                                    {/* Área de Negativa (Expandida) */}
                                    {rejectReason !== '' && (
                                        <div className="animate-slide-up bg-red-50 p-3 rounded-lg border border-red-200 mt-2">
                                            <label className="text-xs font-bold text-red-800 mb-1 block">Motivo da Negativa:</label>
                                            <textarea 
                                                className="w-full p-2 border rounded text-sm focus:ring-1 focus:ring-red-500 outline-none"
                                                rows="2"
                                                value={rejectReason}
                                                onChange={e => setRejectReason(e.target.value)}
                                                placeholder="Ex: Foto ilegível, KM inconsistente..."
                                                autoFocus
                                            ></textarea>
                                            <div className="flex justify-end gap-2 mt-2">
                                                <button onClick={() => setRejectReason('')} className="text-xs text-gray-500 underline">Cancelar</button>
                                                <button 
                                                    onClick={() => handleNegar(s.id)}
                                                    className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded hover:bg-red-700"
                                                >
                                                    Confirmar
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : isBaixa ? (
                                <div className="flex gap-3">
                                    <button 
                                        onClick={() => handleConfirmarBaixa(s.id)}
                                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 transition"
                                    >
                                        <Check size={20}/> CONFIRMAR BAIXA
                                    </button>
                                    <button 
                                        onClick={() => handleRejeitarComprovante(s.id)}
                                        className="flex-1 py-3 bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold rounded-lg border border-orange-200 flex items-center justify-center gap-2 transition"
                                    >
                                        <X size={20}/> Rejeitar Foto
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center text-gray-400 text-sm italic">
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
                
                {/* Controles de Filtro */}
                <div className="flex flex-wrap gap-2 justify-center md:justify-end">
                    <button 
                        onClick={() => setFilterStatus('PENDENTE')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition flex items-center gap-2 ${filterStatus === 'PENDENTE' ? 'bg-yellow-400 text-gray-900 shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        Pendentes
                        {solicitacoes.filter(s => s.status === 'PENDENTE').length > 0 && (
                            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{solicitacoes.filter(s => s.status === 'PENDENTE').length}</span>
                        )}
                    </button>
                    <button 
                        onClick={() => setFilterStatus('AGUARDANDO_BAIXA')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition flex items-center gap-2 ${filterStatus === 'AGUARDANDO_BAIXA' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        Baixas
                        {solicitacoes.filter(s => s.status === 'AGUARDANDO_BAIXA').length > 0 && (
                            <span className="bg-blue-800 text-white text-[10px] px-1.5 py-0.5 rounded-full">{solicitacoes.filter(s => s.status === 'AGUARDANDO_BAIXA').length}</span>
                        )}
                    </button>
                    <button 
                        onClick={() => setFilterStatus('TODOS')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition ${filterStatus === 'TODOS' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        Histórico
                    </button>
                    <button onClick={fetchSolicitacoes} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 border border-gray-200">
                        <RefreshCw size={20} className={loading ? "animate-spin text-blue-600" : "text-gray-600"}/>
                    </button>
                </div>
            </div>

            {/* Barra de Busca */}
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

            {/* Lista Cards */}
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
                    // Configuração Visual do Card
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
                                    <button 
                                        onClick={() => setModalData(s)}
                                        className="w-full bg-gray-900 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-gray-800 flex items-center justify-center gap-2 transition"
                                    >
                                        <Eye size={16}/> AVALIAR
                                    </button>
                                ) : (
                                    <div className="text-center text-xs text-gray-400 py-1">
                                        Processado em {s.data_aprovacao ? new Date(s.data_aprovacao).toLocaleDateString() : '-'}
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