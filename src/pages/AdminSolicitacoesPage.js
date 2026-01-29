import React, { useState, useEffect } from 'react';
import { 
    Check, X, AlertTriangle, MapPin, Eye, Fuel, 
    Calendar, Loader, Search, RefreshCw, Smartphone, DollarSign, Image as ImageIcon 
} from 'lucide-react';

const AdminSolicitacoesPage = ({ apiClient, setAlertMessage, vehicles }) => {
    
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [filteredSolicitacoes, setFilteredSolicitacoes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalData, setModalData] = useState(null); // Dados para o Modal de Aprovação/Baixa
    const [rejectReason, setRejectReason] = useState('');
    const [filterStatus, setFilterStatus] = useState('PENDENTE'); // PENDENTE, AGUARDANDO_BAIXA, TODOS
    const [searchTerm, setSearchTerm] = useState('');

    // --- CARREGAMENTO INICIAL E POLLING ---
    const fetchSolicitacoes = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/solicitacoes');
            setSolicitacoes(res.data);
        } catch (error) {
            console.error("Erro ao buscar solicitações", error);
            setAlertMessage("Erro ao carregar lista.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSolicitacoes();
        
        // Setup Polling ou Socket (Se o App.js já tiver socket global, ele atualiza automaticamente via server:sync)
        // Mas deixamos um intervalo de segurança de 30s
        const interval = setInterval(fetchSolicitacoes, 30000);
        return () => clearInterval(interval);
    }, []);

    // --- FILTROS ---
    useEffect(() => {
        let list = [...solicitacoes];
        
        if (filterStatus !== 'TODOS') {
            // Agrupar status similares se necessário
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
                s.placa?.toLowerCase().includes(lower) || 
                s.veiculo_nome?.toLowerCase().includes(lower) ||
                s.solicitante_nome?.toLowerCase().includes(lower)
            );
        }

        setFilteredSolicitacoes(list);
    }, [solicitacoes, filterStatus, searchTerm]);

    // --- AÇÕES ---

    const handleAprovar = async (id) => {
        if (!window.confirm("Confirmar liberação deste abastecimento?")) return;
        
        try {
            await apiClient.put(`/solicitacoes/${id}/avaliar`, { status: 'LIBERADO' });
            setAlertMessage("Solicitação Aprovada! Ordem gerada.");
            setModalData(null);
            fetchSolicitacoes();
        } catch (error) {
            setAlertMessage("Erro ao aprovar: " + (error.response?.data?.error || error.message));
        }
    };

    const handleNegar = async (id) => {
        if (!rejectReason) {
            alert("Informe o motivo da negativa.");
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
            setAlertMessage("Erro ao negar.");
        }
    };

    const handleConfirmarBaixa = async (id) => {
        try {
            await apiClient.put(`/solicitacoes/${id}/confirmar-baixa`, {});
            setAlertMessage("Baixa confirmada!");
            setModalData(null);
            fetchSolicitacoes();
        } catch (error) {
            setAlertMessage("Erro ao confirmar baixa.");
        }
    };

    const handleRejeitarComprovante = async (id) => {
        if (!window.confirm("O usuário terá que enviar uma nova foto. Confirmar?")) return;
        try {
            await apiClient.put(`/solicitacoes/${id}/rejeitar-comprovante`, {});
            setAlertMessage("Comprovante rejeitado. Usuário notificado.");
            setModalData(null);
            fetchSolicitacoes();
        } catch (error) {
            setAlertMessage("Erro ao rejeitar comprovante.");
        }
    };

    // --- HELPERS VISUAIS ---
    const getBaseURL = () => apiClient.defaults.baseURL.replace('/api', '');

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        // Implementação simples Haversine ou apenas diff para demo
        // Idealmente, o backend já faz isso e retorna flags, mas aqui é visual
        if (!lat1 || !lon1 || !lat2 || !lon2) return null;
        // Retorna distância dummy ou real se implementado
        return "Calculando..."; 
    };

    // --- MODAL COMPONENTE ---
    const renderModal = () => {
        if (!modalData) return null;
        const s = modalData;
        const isApproval = s.status === 'PENDENTE';
        const isBaixa = s.status === 'AGUARDANDO_BAIXA';

        // URL das Imagens
        const urlPainel = s.foto_painel_path ? `${getBaseURL()}${s.foto_painel_path}` : null;
        const urlCupom = s.foto_cupom_path ? `${getBaseURL()}${s.foto_cupom_path}` : null;

        // Veículo atual para comparar
        const vehicleCurrent = vehicles.find(v => v.id === s.veiculo_id) || {};

        return (
            <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col md:flex-row">
                    
                    {/* Coluna Esquerda: Imagens */}
                    <div className="md:w-1/2 bg-gray-900 p-4 flex flex-col items-center justify-center min-h-[300px]">
                        <h4 className="text-white text-sm font-bold mb-2 flex items-center gap-2"><ImageIcon size={16}/> Evidências</h4>
                        
                        {isApproval && urlPainel ? (
                            <div className="relative group w-full">
                                <img src={urlPainel} alt="Painel" className="w-full h-auto rounded border border-gray-600 object-contain max-h-[500px]" />
                                <span className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">Foto do Painel</span>
                            </div>
                        ) : isBaixa && urlCupom ? (
                            <div className="relative group w-full">
                                <img src={urlCupom} alt="Cupom" className="w-full h-auto rounded border border-gray-600 object-contain max-h-[500px]" />
                                <span className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">Foto do Cupom</span>
                            </div>
                        ) : (
                            <div className="text-gray-500">Sem imagem disponível</div>
                        )}
                    </div>

                    {/* Coluna Direita: Dados e Ações */}
                    <div className="md:w-1/2 p-6 flex flex-col">
                        <div className="flex justify-between items-start mb-4 border-b pb-2">
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">
                                    {isApproval ? 'Análise de Solicitação' : 'Conferência de Baixa'}
                                </h2>
                                <p className="text-sm text-gray-500">#{s.id} - {s.solicitante_nome}</p>
                            </div>
                            <button onClick={() => setModalData(null)} className="p-1 hover:bg-gray-100 rounded-full"><X size={24}/></button>
                        </div>

                        <div className="flex-1 space-y-4 text-sm">
                            {/* Card Comparativo */}
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-blue-800 font-bold uppercase">Solicitado</p>
                                    <p className="font-bold text-lg">{s.odometro_informado ? `${s.odometro_informado} Km` : `${s.horimetro_informado} h`}</p>
                                    <p className="text-gray-600">{s.tipo_combustivel}</p>
                                    <p className="text-gray-600">{s.flag_tanque_cheio ? 'Tanque Cheio' : `${s.litragem_solicitada} L`}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 font-bold uppercase">Sistema Anterior</p>
                                    <p className="font-bold text-lg text-gray-600">
                                        {s.odometro_informado ? (vehicleCurrent.odometro || 0) : (vehicleCurrent.horimetro || 0)}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Diferença: +{s.odometro_informado 
                                            ? (s.odometro_informado - (vehicleCurrent.odometro || 0)).toFixed(1) 
                                            : (s.horimetro_informado - (vehicleCurrent.horimetro || 0)).toFixed(1)}
                                    </p>
                                </div>
                            </div>

                            {/* Alertas */}
                            {/* Aqui entraria a lógica visual de GPS se tivéssemos coords do posto */}
                            {(!s.latitude && isApproval) && (
                                <div className="flex items-center gap-2 text-yellow-700 bg-yellow-50 p-2 rounded text-xs">
                                    <AlertTriangle size={14}/> Sem localização GPS no check-in.
                                </div>
                            )}

                            {/* Detalhes Posto/Obra */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="border p-2 rounded">
                                    <p className="text-xs text-gray-500">Posto</p>
                                    <p className="font-medium truncate">{s.posto_nome || '---'}</p>
                                </div>
                                <div className="border p-2 rounded">
                                    <p className="text-xs text-gray-500">Obra</p>
                                    <p className="font-medium truncate">{s.obra_nome || '---'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Ações */}
                        <div className="mt-6 pt-4 border-t">
                            {isApproval ? (
                                <div className="space-y-3">
                                    <div className="flex gap-3">
                                        <button 
                                            onClick={() => handleAprovar(s.id)}
                                            className="flex-1 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-md flex items-center justify-center gap-2"
                                        >
                                            <Check size={20}/> Liberar
                                        </button>
                                        <button 
                                            onClick={() => setRejectReason(' ')} // Habilita input
                                            className="flex-1 py-3 bg-red-100 text-red-700 font-bold rounded-lg hover:bg-red-200 border border-red-300"
                                        >
                                            Negar
                                        </button>
                                    </div>
                                    {rejectReason !== '' && (
                                        <div className="animate-fade-in bg-red-50 p-3 rounded-lg border border-red-200">
                                            <label className="text-xs font-bold text-red-800">Motivo da Negativa:</label>
                                            <textarea 
                                                className="w-full p-2 border rounded mt-1 text-sm"
                                                rows="2"
                                                value={rejectReason}
                                                onChange={e => setRejectReason(e.target.value)}
                                                placeholder="Ex: Foto ilegível, KM errado..."
                                            ></textarea>
                                            <button 
                                                onClick={() => handleNegar(s.id)}
                                                className="w-full mt-2 bg-red-600 text-white text-xs font-bold py-2 rounded"
                                            >
                                                Confirmar Negativa
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : isBaixa ? (
                                <div className="flex gap-3">
                                    <button 
                                        onClick={() => handleConfirmarBaixa(s.id)}
                                        className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md flex items-center justify-center gap-2"
                                    >
                                        <Check size={20}/> Confirmar Baixa
                                    </button>
                                    <button 
                                        onClick={() => handleRejeitarComprovante(s.id)}
                                        className="flex-1 py-3 bg-orange-100 text-orange-700 font-bold rounded-lg hover:bg-orange-200 border border-orange-300"
                                    >
                                        Rejeitar (Foto ruim)
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Smartphone className="text-purple-600" /> Gestão de Solicitações (App)
                    </h1>
                    <p className="text-gray-500 text-sm">Aprove ou negue pedidos vindos do aplicativo móvel.</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setFilterStatus('PENDENTE')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm ${filterStatus === 'PENDENTE' ? 'bg-yellow-400 text-gray-900' : 'bg-gray-100 text-gray-600'}`}
                    >
                        Pendentes
                    </button>
                    <button 
                        onClick={() => setFilterStatus('AGUARDANDO_BAIXA')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm ${filterStatus === 'AGUARDANDO_BAIXA' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}
                    >
                        Baixas
                    </button>
                    <button 
                        onClick={() => setFilterStatus('TODOS')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm ${filterStatus === 'TODOS' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}
                    >
                        Histórico
                    </button>
                    <button onClick={fetchSolicitacoes} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"><RefreshCw size={20}/></button>
                </div>
            </div>

            {/* Lista Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loading && <div className="col-span-full text-center py-10"><Loader className="animate-spin inline mr-2"/> Carregando...</div>}
                
                {!loading && filteredSolicitacoes.length === 0 && (
                    <div className="col-span-full text-center py-10 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                        Nenhuma solicitação encontrada neste filtro.
                    </div>
                )}

                {filteredSolicitacoes.map(s => (
                    <div key={s.id} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition p-4 relative overflow-hidden group">
                        <div className={`absolute top-0 left-0 w-1.5 h-full 
                            ${s.status === 'PENDENTE' ? 'bg-yellow-400' : 
                              s.status === 'AGUARDANDO_BAIXA' ? 'bg-blue-500' :
                              s.status === 'LIBERADO' ? 'bg-green-500' : 
                              s.status === 'NEGADO' ? 'bg-red-500' : 'bg-gray-400'}`}
                        ></div>
                        
                        <div className="pl-3">
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-bold text-gray-400">#{s.id} • {new Date(s.data_solicitacao).toLocaleDateString()}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase
                                    ${s.status === 'PENDENTE' ? 'bg-yellow-100 text-yellow-800' : 
                                      s.status === 'AGUARDANDO_BAIXA' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100'}`}
                                >
                                    {s.status.replace('_', ' ')}
                                </span>
                            </div>
                            
                            <h3 className="font-bold text-gray-800 text-lg">{s.veiculo_nome}</h3>
                            <p className="text-sm text-gray-600 mb-2">{s.placa}</p>
                            
                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3 bg-gray-50 p-2 rounded">
                                <div>
                                    <p className="font-bold">Solicitante:</p>
                                    <p>{s.solicitante_nome}</p>
                                </div>
                                <div>
                                    <p className="font-bold">Posto:</p>
                                    <p className="truncate">{s.posto_nome || 'N/A'}</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between mt-2 pt-2 border-t">
                                <div className="text-sm font-bold text-gray-700">
                                    {s.litragem_solicitada ? `${s.litragem_solicitada}L` : 'Tanque Cheio'} • {s.tipo_combustivel}
                                </div>
                                
                                {(s.status === 'PENDENTE' || s.status === 'AGUARDANDO_BAIXA') && (
                                    <button 
                                        onClick={() => setModalData(s)}
                                        className="bg-gray-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-800 flex items-center gap-1"
                                    >
                                        <Eye size={14}/> Avaliar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {renderModal()}
        </div>
    );
};

export default AdminSolicitacoesPage;