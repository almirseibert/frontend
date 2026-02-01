import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Camera, MapPin, Send, AlertTriangle, CheckCircle, Clock, 
    XCircle, ChevronRight, Fuel, Image as ImageIcon, Loader, 
    WifiOff, User, FileText, Droplet, Gauge, Lock, Calendar
} from 'lucide-react';
import { getReadingType, validateReading, checkVehicleRestrictions, formatReading } from '../utils/vehicleRules';

const SolicitacaoAbastecimentoPage = ({ 
    apiClient, 
    partners = [], 
    setAlertMessage,
    user,
    onLogout
}) => {
    
    // --- ESTADOS DE CONTROLE ---
    const [view, setView] = useState('form'); // 'form' | 'list'
    const [loading, setLoading] = useState(false);
    const [loadingContext, setLoadingContext] = useState(true);
    const [contextError, setContextError] = useState(null);
    const cupomInputRef = useRef(null);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    // --- CONTEXTO (Dados filtrados do servidor) ---
    const [contextData, setContextData] = useState({
        obra: null,
        vehicles: [],
        employees: [],
        currentUserEmployeeId: null
    });

    const [myRequests, setMyRequests] = useState([]);
    const [userStatus, setUserStatus] = useState({ blocked: false, attempts: 0 });
    
    // --- FORMULÁRIO ---
    const [formData, setFormData] = useState({
        veiculoId: '',
        obraId: '', 
        postoId: '',
        funcionarioId: '',
        tipo_combustivel: 'DIESEL S10',
        litragem_solicitada: '',
        leitura_atual: '',
        observacao: ''
    });

    // --- VALIDAÇÃO E ALERTAS ---
    const [readingValidation, setReadingValidation] = useState({ valid: true, msg: '' });
    const [vehicleIssues, setVehicleIssues] = useState([]); // Alertas de docs/manutenção

    // --- MONITORES DE REDE E STATUS ---
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // --- CARREGAMENTO INICIAL ---
    useEffect(() => {
        checkUserStatus();
        fetchContext();
        fetchMyRequests();
    }, []);

    const checkUserStatus = async () => {
        try {
            const res = await apiClient.get('/solicitacoes/status');
            if (res.bloqueado_abastecimento) {
                setUserStatus({ blocked: true });
                setContextError("USUÁRIO BLOQUEADO: Excesso de tentativas falhas ou bloqueio administrativo.");
            }
        } catch (error) {
            console.error("Erro status usuário", error);
        }
    };

    const fetchContext = async () => {
        setLoadingContext(true);
        setContextError(null);
        try {
            const res = await apiClient.get('/solicitacoes/contexto');
            
            setContextData({
                obra: res.obra,
                vehicles: res.vehicles || [],
                employees: res.employees || [],
                currentUserEmployeeId: res.currentUserEmployeeId
            });

            setFormData(prev => ({
                ...prev,
                obraId: res.obra.obraId,
                funcionarioId: res.currentUserEmployeeId // Default: Eu mesmo
            }));

        } catch (error) {
            console.error("Erro contexto:", error);
            const msg = error.response?.data?.details || error.response?.data?.error || "Erro de conexão.";
            setContextError(msg);
        } finally {
            setLoadingContext(false);
        }
    };

    const fetchMyRequests = async () => {
        try {
            const res = await apiClient.get('/solicitacoes/minhas');
            setMyRequests(Array.isArray(res) ? res : []);
        } catch (error) {
            console.error("Erro histórico:", error);
        }
    };

    // --- HANDLERS ---

    const handleVehicleChange = (e) => {
        const vId = parseInt(e.target.value);
        if (!vId) {
            setFormData(prev => ({ ...prev, veiculoId: '' }));
            setVehicleIssues([]);
            return;
        }

        const selectedVehicle = contextData.vehicles.find(v => v.id === vId);
        
        // 1. Sugerir Posto
        let suggestedPartner = formData.postoId;
        if (selectedVehicle && selectedVehicle.lastPartnerId) {
            const partnerExists = partners.find(p => p.id === selectedVehicle.lastPartnerId);
            if (partnerExists) suggestedPartner = selectedVehicle.lastPartnerId;
        }

        setFormData(prev => ({ 
            ...prev, 
            veiculoId: vId,
            postoId: suggestedPartner 
        }));

        // 2. Rodar Verificações (Regra 4: Alertas de Manutenção/Docs)
        const issues = checkVehicleRestrictions(selectedVehicle);
        setVehicleIssues(issues);

        // 3. Resetar validação de leitura
        setReadingValidation({ valid: true, msg: '' });
    };

    const handleReadingChange = (val) => {
        setFormData(prev => ({ ...prev, leitura_atual: val }));
        
        if (!formData.veiculoId) return;
        const vehicle = contextData.vehicles.find(v => v.id === parseInt(formData.veiculoId));
        if (!vehicle) return;

        const type = getReadingType(vehicle);
        // Usa a coluna horimetro unificada (Regra 8)
        const result = validateReading(vehicle.horimetro, val, type);
        
        if (!result.valid) {
            setReadingValidation({ valid: false, msg: result.error, isBlock: result.requiresPassword });
        } else {
            setReadingValidation({ valid: true, msg: '' });
        }
    };

    // Envio do Formulário
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (isOffline) {
            setAlertMessage({ type: 'error', text: 'Sem conexão. Verifique sua internet.' });
            return;
        }

        if (!readingValidation.valid) {
            setAlertMessage({ type: 'error', text: readingValidation.msg });
            return;
        }

        setLoading(true);
        try {
            await apiClient.post('/solicitacoes', formData);
            setAlertMessage({ type: 'success', text: 'Solicitação enviada com sucesso!' });
            
            // Limpa formulário parcial
            setFormData(prev => ({
                ...prev,
                veiculoId: '',
                postoId: '',
                litragem_solicitada: '',
                leitura_atual: '',
                observacao: ''
            }));
            setVehicleIssues([]);
            setView('list');
            fetchMyRequests();
        } catch (error) {
            setAlertMessage({ type: 'error', text: error.response?.data?.error || 'Erro ao enviar.' });
        } finally {
            setLoading(false);
        }
    };

    // Upload de Cupom (File Handler)
    const handleFileChange = async (e, id) => {
        const file = e.target.files[0];
        if (!file) return;

        const data = new FormData();
        data.append('cupom', file);

        try {
            setLoading(true);
            await apiClient.post(`/solicitacoes/${id}/cupom`, data);
            setAlertMessage({ type: 'success', text: 'Comprovante enviado!' });
            fetchMyRequests();
        } catch (error) {
            setAlertMessage({ type: 'error', text: 'Erro ao enviar foto.' });
        } finally {
            setLoading(false);
        }
    };

    // --- RENDERIZADORES AUXILIARES ---

    const renderIssues = () => {
        if (vehicleIssues.length === 0) return null;

        return (
            <div className="space-y-2 mb-4">
                {vehicleIssues.map((issue, idx) => (
                    <div key={idx} className={`p-3 rounded-lg flex items-start gap-2 text-xs font-bold border ${
                        issue.type === 'error' || issue.type === 'block' 
                        ? 'bg-red-50 text-red-700 border-red-200' 
                        : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                    }`}>
                        <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
                        <div>
                            <span className="uppercase block mb-0.5">{issue.category}</span>
                            {issue.message}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderReadingInput = () => {
        if (!formData.veiculoId) return null;
        
        const vehicle = contextData.vehicles.find(v => v.id === parseInt(formData.veiculoId));
        if (!vehicle) return null;

        const type = getReadingType(vehicle); // 'KM' ou 'HR'
        const isHour = type === 'HR';

        return (
            <div className={`mt-4 p-4 rounded-xl border-2 transition-colors ${
                !readingValidation.valid ? 'border-red-300 bg-red-50' : 'border-gray-100 bg-gray-50'
            }`}>
                <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <Gauge size={18} className="text-blue-600"/>
                        {isHour ? 'HORÍMETRO (Horas)' : 'ODÔMETRO (Km)'}
                    </label>
                    <span className="text-xs font-mono bg-white px-2 py-1 rounded border text-gray-500">
                        Último: {formatReading(vehicle.horimetro, type)}
                    </span>
                </div>
                
                <input
                    type="number"
                    value={formData.leitura_atual}
                    onChange={(e) => handleReadingChange(e.target.value)}
                    className="w-full text-3xl font-bold text-gray-900 bg-transparent border-b-2 border-gray-300 focus:border-blue-600 outline-none p-2 placeholder-gray-300"
                    placeholder="000"
                />

                {!readingValidation.valid && (
                    <div className="mt-2 text-xs text-red-600 font-bold flex items-center gap-1 animate-pulse">
                        <XCircle size={14}/> {readingValidation.msg}
                    </div>
                )}

                {/* Regra 1: Aviso específico para máquinas não usarem KM */}
                {isHour && (
                    <div className="mt-2 text-[10px] text-orange-700 bg-orange-100 p-2 rounded flex items-center gap-2">
                        <AlertTriangle size={12}/>
                        <span><strong>ATENÇÃO:</strong> Use HORAS trabalhadas. Não use Km do painel.</span>
                    </div>
                )}
            </div>
        );
    };

    // --- ESTADOS DE ERRO / OFFLINE / BLOQUEIO ---
    if (contextError) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6 text-center">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <User size={32} className="text-red-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Acesso Indisponível</h2>
                    <p className="text-gray-600 mb-6 text-sm">{contextError}</p>
                    <button onClick={onLogout} className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold">
                        Sair do Sistema
                    </button>
                </div>
            </div>
        );
    }

    if (loadingContext) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
                <Loader className="animate-spin text-blue-600 mb-4" size={40} />
                <p className="text-gray-500 font-medium">Localizando sua Obra...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 pb-24">
            {/* Aviso Offline */}
            {isOffline && (
                <div className="bg-red-600 text-white text-xs font-bold text-center py-2 sticky top-0 z-30">
                    <WifiOff size={14} className="inline mr-1"/> SEM CONEXÃO COM A INTERNET
                </div>
            )}

            {/* Header Fixo */}
            <div className="bg-white px-4 pt-4 pb-3 shadow-sm sticky top-8 z-20">
                <div className="flex justify-between items-center mb-2">
                    <div>
                        <h1 className="text-lg font-bold text-gray-800 leading-tight">Abastecimento</h1>
                        <div className="flex items-center gap-1 text-xs text-green-600 font-bold mt-1">
                            <MapPin size={12}/>
                            {contextData.obra?.obraNome || 'Local não definido'}
                        </div>
                    </div>
                    {/* Toggle View */}
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setView('form')} 
                            className={`p-2 rounded-md transition ${view === 'form' ? 'bg-white shadow text-blue-600' : 'text-gray-400'}`}
                        >
                            <Fuel size={20}/>
                        </button>
                        <button 
                            onClick={() => setView('list')} 
                            className={`p-2 rounded-md transition ${view === 'list' ? 'bg-white shadow text-blue-600' : 'text-gray-400'}`}
                        >
                            <Clock size={20}/>
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-md mx-auto p-4">
                
                {/* --- MODO LISTA (HISTÓRICO) --- */}
                {view === 'list' && (
                    <div className="space-y-3">
                        {myRequests.length === 0 ? (
                            <div className="text-center py-12 text-gray-400 opacity-50">
                                <FileText size={48} className="mx-auto mb-2"/>
                                <p>Nenhum pedido recente.</p>
                            </div>
                        ) : (
                            myRequests.map(req => (
                                <div key={req.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
                                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                                        req.status === 'PENDENTE' ? 'bg-yellow-400' : 
                                        req.status === 'AUTORIZADO' ? 'bg-blue-500' :
                                        req.status === 'CONCLUIDO' ? 'bg-green-500' : 
                                        req.status === 'NEGADO' ? 'bg-red-500' : 'bg-gray-400'
                                    }`}/>
                                    
                                    <div className="flex justify-between items-start mb-2 pl-2">
                                        <div>
                                            <span className="font-bold text-gray-800 block text-lg">{req.veiculo_placa}</span>
                                            <span className="text-[10px] text-gray-400 uppercase font-bold">{req.veiculo_modelo}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mb-1 ${
                                                req.status === 'PENDENTE' ? 'bg-yellow-100 text-yellow-800' : 
                                                req.status === 'NEGADO' ? 'bg-red-100 text-red-800' :
                                                'bg-gray-100 text-gray-600'
                                            }`}>
                                                {req.status}
                                            </span>
                                            <div className="text-[10px] text-gray-400">
                                                {new Date(req.data_solicitacao).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Motivo de Negativa */}
                                    {req.motivo_negativa && (
                                        <div className="pl-2 mb-2">
                                            <div className="bg-red-50 text-red-700 text-xs p-2 rounded border border-red-100">
                                                <strong>Motivo:</strong> {req.motivo_negativa}
                                            </div>
                                        </div>
                                    )}

                                    <div className="pl-2 mt-2 pt-2 border-t border-gray-50 flex justify-between text-xs text-gray-500">
                                        <span className="flex items-center gap-1"><Droplet size={12}/> {req.litragem_solicitada || 'Cheio'}</span>
                                        <span className="flex items-center gap-1"><MapPin size={12} className="truncate max-w-[100px]"/> {req.posto_nome}</span>
                                    </div>
                                    
                                    {/* Botão de Enviar Cupom */}
                                    {(req.status === 'AUTORIZADO' || req.status === 'LIBERADO' || req.status === 'AGUARDANDO_BAIXA') && (
                                        <div className="mt-3 pl-2">
                                            <label className="block w-full py-3 bg-green-50 text-green-700 rounded-lg border border-green-200 font-bold text-center text-xs cursor-pointer hover:bg-green-100 transition flex items-center justify-center gap-2">
                                                {loading ? <Loader className="animate-spin" size={14}/> : <Camera size={14}/>}
                                                {req.comprovante_path ? 'REENVIAR FOTO' : 'FOTO DO CUPOM'}
                                                <input 
                                                    type="file" 
                                                    accept="image/*" 
                                                    capture="environment"
                                                    className="hidden" 
                                                    onChange={(e) => handleFileChange(e, req.id)}
                                                    disabled={loading}
                                                />
                                            </label>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* --- MODO FORMULÁRIO --- */}
                {view === 'form' && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        
                        {/* 1. Seleção de Veículo */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Veículo</label>
                            <div className="relative">
                                <select 
                                    value={formData.veiculoId}
                                    onChange={handleVehicleChange}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 font-bold appearance-none outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Selecione...</option>
                                    {contextData.vehicles.map(v => (
                                        <option key={v.id} value={v.id}>
                                            {v.placa} - {v.modelo}
                                        </option>
                                    ))}
                                </select>
                                <ChevronRight className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" size={18}/>
                            </div>
                        </div>

                        {/* Avisos de Regra 4 (Manutenção/Docs) */}
                        {renderIssues()}

                        {/* 2. Leitura (Input Inteligente) */}
                        {renderReadingInput()}

                        {/* 3. Posto */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Posto</label>
                            <div className="relative">
                                <select 
                                    value={formData.postoId}
                                    onChange={(e) => setFormData({...formData, postoId: e.target.value})}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 font-bold appearance-none outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Selecione...</option>
                                    {partners.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <MapPin className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" size={18}/>
                            </div>
                        </div>

                        {/* 4. Solicitante / Motorista */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Quem está abastecendo?</label>
                            <div className="relative">
                                <select 
                                    value={formData.funcionarioId}
                                    onChange={(e) => setFormData({...formData, funcionarioId: e.target.value})}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 appearance-none outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {contextData.employees.map(e => (
                                        <option key={e.id} value={e.id}>
                                            {e.name} {e.id === contextData.currentUserEmployeeId ? '(Eu)' : ''}
                                        </option>
                                    ))}
                                </select>
                                <User className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" size={18}/>
                            </div>
                        </div>

                        {/* 5. Detalhes Combustível */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Combustível</label>
                                <select 
                                    value={formData.tipo_combustivel}
                                    onChange={(e) => setFormData({...formData, tipo_combustivel: e.target.value})}
                                    className="w-full bg-transparent font-bold text-gray-800 outline-none text-sm"
                                >
                                    <option value="DIESEL S10">DIESEL S10</option>
                                    <option value="DIESEL S500">DIESEL S500</option>
                                    <option value="GASOLINA">GASOLINA</option>
                                    <option value="ETANOL">ETANOL</option>
                                    <option value="ARLA 32">ARLA 32</option>
                                </select>
                            </div>
                            <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Litros (Aprox)</label>
                                <input 
                                    type="number"
                                    placeholder="Cheio"
                                    value={formData.litragem_solicitada}
                                    onChange={(e) => setFormData({...formData, litragem_solicitada: e.target.value})}
                                    className="w-full bg-transparent font-bold text-gray-800 outline-none placeholder-gray-400 text-sm"
                                />
                            </div>
                        </div>

                        {/* Botão Final */}
                        <button 
                            type="submit" 
                            disabled={loading || !formData.veiculoId || !formData.postoId || !readingValidation.valid}
                            className={`w-full py-4 rounded-xl shadow-lg font-bold text-lg flex items-center justify-center gap-2 transition transform active:scale-95 ${
                                loading || !formData.veiculoId || !readingValidation.valid
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                        >
                            {loading ? <Loader className="animate-spin"/> : <><Send size={20}/> ENVIAR</>}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default SolicitacaoAbastecimentoPage;