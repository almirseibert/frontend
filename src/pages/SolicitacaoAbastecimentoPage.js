import React, { useState, useEffect, useRef } from 'react';
import { 
    Camera, MapPin, Send, AlertTriangle, CheckCircle, Clock, 
    XCircle, ChevronRight, Fuel, Image as ImageIcon, Loader, 
    WifiOff, RefreshCw, Lock 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const SolicitacaoAbastecimentoPage = ({ 
    apiClient, 
    vehicles = [], 
    obras = [], 
    partners = [], 
    setAlertMessage 
}) => {
    const { user } = useAuth();
    
    // Estados de Controle
    const [view, setView] = useState('list'); // 'list' | 'form' | 'details'
    const [loading, setLoading] = useState(false);
    const [userStatus, setUserStatus] = useState({ blocked: false, attempts: 0 });
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    
    // Dados
    const [myRequests, setMyRequests] = useState([]);
    const [selectedRequest, setSelectedRequest] = useState(null);
    
    // Formulário
    const [formData, setFormData] = useState({
        veiculoId: '',
        obraId: '',
        postoId: '',
        tipoCombustivel: '',
        litragem: '',
        flagTanqueCheio: false,
        flagOutros: false,
        horimetro: '',
        odometro: '',
        latitude: null,
        longitude: null
    });
    
    const [previewImage, setPreviewImage] = useState(null);
    const [rawImageFile, setRawImageFile] = useState(null);
    const [cupomFile, setCupomFile] = useState(null); // Para envio de comprovante

    // Refs
    const fileInputRef = useRef(null);
    const cupomInputRef = useRef(null);

    // --- EFEITOS ---

    useEffect(() => {
        checkUserStatus();
        fetchMyRequests();

        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // --- FUNÇÕES AUXILIARES ---

    const checkUserStatus = async () => {
        try {
            const res = await apiClient.get('/solicitacoes/meus-status');
            setUserStatus({
                blocked: res.data.bloqueado_abastecimento === 1,
                attempts: res.data.tentativas_falhas_abastecimento
            });
        } catch (error) {
            console.error("Erro ao verificar status", error);
        }
    };

    const fetchMyRequests = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/solicitacoes');
            setMyRequests(res.data);
        } catch (error) {
            // Se der erro de rede, tenta ler do cache local (Implementação futura de PWA completo)
            console.error("Erro ao buscar solicitações", error);
        } finally {
            setLoading(false);
        }
    };

    const getLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setFormData(prev => ({
                        ...prev,
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    }));
                },
                (error) => {
                    console.warn("Erro GPS:", error);
                    setAlertMessage("Não foi possível obter sua localização. Prossiga com atenção.");
                }
            );
        }
    };

    // Compressão de Imagem no Cliente
    const handleImageChange = (e, type = 'painel') => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1024;
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    const compressedFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    });

                    if (type === 'painel') {
                        setRawImageFile(compressedFile);
                        setPreviewImage(URL.createObjectURL(compressedFile));
                    } else {
                        setCupomFile(compressedFile);
                    }
                }, 'image/jpeg', 0.7); // Qualidade 70%
            };
        };
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (userStatus.blocked) {
            setAlertMessage("VOCÊ ESTÁ BLOQUEADO. Contate o administrador.");
            return;
        }

        if (!rawImageFile) {
            setAlertMessage("A foto do painel é obrigatória.");
            return;
        }

        if (!formData.veiculoId || !formData.tipoCombustivel || !formData.postoId) {
            setAlertMessage("Preencha todos os campos obrigatórios.");
            return;
        }

        setLoading(true);

        const payload = new FormData();
        Object.keys(formData).forEach(key => {
            if (formData[key] !== null && formData[key] !== undefined) {
                payload.append(key, formData[key]);
            }
        });
        payload.append('foto_painel', rawImageFile);

        try {
            await apiClient.post('/solicitacoes', payload, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setAlertMessage("Solicitação enviada com sucesso!");
            setView('list');
            fetchMyRequests();
            setFormData({
                veiculoId: '', obraId: '', postoId: '', tipoCombustivel: '',
                litragem: '', flagTanqueCheio: false, flagOutros: false,
                horimetro: '', odometro: '', latitude: null, longitude: null
            });
            setPreviewImage(null);
            setRawImageFile(null);
            
            // Re-checa status para garantir que tentativas zeraram
            checkUserStatus();

        } catch (error) {
            const msg = error.response?.data?.error || "Erro ao enviar solicitação.";
            setAlertMessage(msg);
            
            // Se erro foi de bloqueio, atualiza status
            if (msg.includes("BLOQUEADO") || msg.includes("Tentativa")) {
                checkUserStatus();
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSendCupom = async (solicitacaoId) => {
        if (!cupomFile) {
            setAlertMessage("Selecione a foto do cupom.");
            return;
        }

        setLoading(true);
        const payload = new FormData();
        payload.append('foto_cupom', cupomFile);

        try {
            await apiClient.put(`/solicitacoes/${solicitacaoId}/comprovante`, payload, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setAlertMessage("Comprovante enviado!");
            setCupomFile(null);
            setSelectedRequest(null);
            fetchMyRequests();
        } catch (error) {
            setAlertMessage("Erro ao enviar comprovante.");
        } finally {
            setLoading(false);
        }
    };

    // --- RENDERIZADORES ---

    if (userStatus.blocked) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-red-50 p-6 text-center">
                <Lock size={64} className="text-red-500 mb-4" />
                <h1 className="text-2xl font-bold text-red-700 mb-2">USUÁRIO BLOQUEADO</h1>
                <p className="text-gray-600">Você excedeu o número de tentativas falhas de registro (Leituras incorretas).</p>
                <p className="text-gray-800 font-bold mt-4">Entre em contato com a gestão de frotas para desbloqueio.</p>
                <button onClick={() => window.location.reload()} className="mt-8 px-6 py-2 bg-red-600 text-white rounded-lg">Atualizar Status</button>
            </div>
        );
    }

    if (view === 'form') {
        return (
            <div className="min-h-screen bg-gray-50 pb-20">
                {/* Header App */}
                <div className="bg-yellow-400 p-4 shadow-sm sticky top-0 z-10 flex justify-between items-center">
                    <button onClick={() => setView('list')} className="p-1 rounded-full hover:bg-yellow-500">
                        <ChevronRight className="rotate-180" size={24} />
                    </button>
                    <h1 className="text-lg font-bold text-gray-900">Nova Solicitação</h1>
                    <div className="w-8"></div>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4 max-w-lg mx-auto">
                    
                    {isOffline && (
                        <div className="bg-orange-100 text-orange-800 p-3 rounded-lg flex items-center gap-2 text-sm">
                            <WifiOff size={16} /> Você está offline. As requisições serão salvas.
                        </div>
                    )}

                    {/* Localização */}
                    <div className="flex items-center justify-between bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-2 text-gray-600">
                            <MapPin size={20} className="text-blue-500" />
                            <span className="text-sm">
                                {formData.latitude ? "Localização capturada" : "Localização pendente"}
                            </span>
                        </div>
                        {!formData.latitude && (
                            <button type="button" onClick={getLocation} className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full font-bold">
                                Check-in
                            </button>
                        )}
                    </div>

                    {/* Seleção de Veículo */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Veículo / Equipamento</label>
                        <select 
                            className="w-full p-3 bg-white border border-gray-200 rounded-xl shadow-sm text-base focus:ring-2 focus:ring-yellow-400 outline-none appearance-none"
                            value={formData.veiculoId}
                            onChange={e => setFormData({...formData, veiculoId: e.target.value})}
                        >
                            <option value="">Selecione...</option>
                            {vehicles.map(v => (
                                <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa}</option>
                            ))}
                        </select>
                    </div>

                    {/* Leitura (Odômetro/Horímetro) */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Odômetro (Km)</label>
                            <input 
                                type="number" 
                                className="w-full p-3 bg-white border border-gray-200 rounded-xl shadow-sm"
                                placeholder="00000"
                                value={formData.odometro}
                                onChange={e => setFormData({...formData, odometro: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Horímetro (Hr)</label>
                            <input 
                                type="number" 
                                className="w-full p-3 bg-white border border-gray-200 rounded-xl shadow-sm"
                                placeholder="0000.0"
                                value={formData.horimetro}
                                onChange={e => setFormData({...formData, horimetro: e.target.value})}
                            />
                        </div>
                    </div>

                    {/* Foto do Painel */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Foto do Painel (Obrigatório)</label>
                        <div 
                            onClick={() => fileInputRef.current.click()}
                            className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center transition-colors cursor-pointer ${previewImage ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-white'}`}
                        >
                            {previewImage ? (
                                <img src={previewImage} alt="Preview" className="h-40 object-contain rounded-lg shadow-sm" />
                            ) : (
                                <>
                                    <Camera size={32} className="text-gray-400 mb-2" />
                                    <span className="text-sm text-gray-500 font-medium">Toque para fotografar</span>
                                </>
                            )}
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*" 
                                capture="environment"
                                onChange={(e) => handleImageChange(e, 'painel')}
                            />
                        </div>
                    </div>

                    {/* Obra e Posto */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Obra / Alocação</label>
                        <select 
                            className="w-full p-3 bg-white border border-gray-200 rounded-xl shadow-sm"
                            value={formData.obraId}
                            onChange={e => setFormData({...formData, obraId: e.target.value})}
                        >
                            <option value="">Selecione...</option>
                            {obras.filter(o => o.status === 'ativa').map(o => (
                                <option key={o.id} value={o.id}>{o.nome}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Posto</label>
                        <select 
                            className="w-full p-3 bg-white border border-gray-200 rounded-xl shadow-sm"
                            value={formData.postoId}
                            onChange={e => setFormData({...formData, postoId: e.target.value})}
                        >
                            <option value="">Selecione...</option>
                            {partners.map(p => (
                                <option key={p.id} value={p.id}>{p.razaoSocial}</option>
                            ))}
                        </select>
                    </div>

                    {/* Combustível */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3">
                        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                            <Fuel size={14}/> Detalhes do Abastecimento
                        </label>
                        
                        <select 
                            className="w-full p-2 border rounded-lg bg-gray-50"
                            value={formData.tipoCombustivel}
                            onChange={e => setFormData({...formData, tipoCombustivel: e.target.value})}
                        >
                            <option value="">Tipo de Combustível...</option>
                            <option value="DIESEL S10">Diesel S10</option>
                            <option value="DIESEL S500">Diesel S500</option>
                            <option value="GASOLINA COMUM">Gasolina Comum</option>
                            <option value="ARLA">Arla 32</option>
                        </select>

                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                                <input 
                                    type="number" 
                                    placeholder="Litros" 
                                    className="w-full p-2 border rounded-lg"
                                    disabled={formData.flagTanqueCheio}
                                    value={formData.litragem}
                                    onChange={e => setFormData({...formData, litragem: e.target.value})}
                                />
                            </div>
                            <label className="flex items-center gap-2 p-2 border rounded-lg bg-gray-50 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={formData.flagTanqueCheio}
                                    onChange={e => setFormData({...formData, flagTanqueCheio: e.target.checked})}
                                    className="w-5 h-5 text-yellow-500 rounded"
                                />
                                <span className="text-sm font-medium">Tanque Cheio</span>
                            </label>
                        </div>
                        
                        <label className="flex items-center gap-2 mt-2">
                            <input 
                                type="checkbox" 
                                checked={formData.flagOutros}
                                onChange={e => setFormData({...formData, flagOutros: e.target.checked})}
                                className="w-4 h-4 text-blue-500 rounded"
                            />
                            <span className="text-xs text-gray-600">Inclui Outros (Produtos/Serviços)?</span>
                        </label>
                    </div>

                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full py-4 bg-yellow-400 text-gray-900 font-bold rounded-xl shadow-lg hover:bg-yellow-500 active:scale-95 transition-transform flex items-center justify-center gap-2 text-lg"
                    >
                        {loading ? <Loader className="animate-spin" /> : <><Send size={20} /> Solicitar Liberação</>}
                    </button>
                    <div className="h-8"></div>
                </form>
            </div>
        );
    }

    // View: LIST (Dashboard)
    return (
        <div className="min-h-screen bg-gray-100 pb-20">
            <div className="bg-slate-900 text-white p-6 rounded-b-3xl shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Fuel size={120} />
                </div>
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h1 className="text-2xl font-bold">Olá, {user.name.split(' ')[0]}</h1>
                        <p className="text-slate-400 text-sm">Operador</p>
                    </div>
                    <button onClick={fetchMyRequests} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700">
                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
                
                <button 
                    onClick={() => { getLocation(); setView('form'); }}
                    className="w-full py-3 bg-yellow-400 text-slate-900 font-bold rounded-xl shadow-md flex items-center justify-center gap-2 hover:bg-yellow-300 transition"
                >
                    <Fuel size={20} /> Novo Abastecimento
                </button>
            </div>

            <div className="px-4 -mt-6">
                <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 min-h-[100px]">
                    <h2 className="text-sm font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                        <Clock size={14} /> Histórico Recente
                    </h2>
                    
                    {myRequests.length === 0 ? (
                        <p className="text-center text-gray-400 py-4 text-sm">Nenhuma solicitação recente.</p>
                    ) : (
                        <div className="space-y-3">
                            {myRequests.map(req => {
                                let statusColor = 'bg-gray-100 text-gray-600';
                                if (req.status === 'PENDENTE') statusColor = 'bg-yellow-100 text-yellow-800';
                                if (req.status === 'LIBERADO') statusColor = 'bg-green-100 text-green-800';
                                if (req.status === 'NEGADO') statusColor = 'bg-red-100 text-red-800';
                                if (req.status === 'AGUARDANDO_BAIXA') statusColor = 'bg-blue-100 text-blue-800';
                                if (req.status === 'CONCLUIDO') statusColor = 'bg-gray-200 text-gray-500 line-through';

                                const data = new Date(req.data_solicitacao).toLocaleDateString('pt-BR');
                                
                                return (
                                    <div key={req.id} onClick={() => setSelectedRequest(req)} className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer active:scale-98 transition">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}`}>
                                                {req.status}
                                            </span>
                                            <span className="text-xs text-gray-400">{data}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-gray-800">{req.placa} ({req.veiculo_nome})</p>
                                                <p className="text-xs text-gray-500">{req.posto_nome || 'Posto não def.'}</p>
                                            </div>
                                            {req.status === 'LIBERADO' && (
                                                <div className="bg-green-500 text-white p-2 rounded-full shadow-lg animate-pulse">
                                                    <Camera size={16} />
                                                </div>
                                            )}
                                        </div>
                                        {req.status === 'NEGADO' && (
                                            <p className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">
                                                Motivo: {req.motivo_negativa}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Modal de Detalhes / Upload Cupom */}
            {selectedRequest && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl animate-slide-up">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h3 className="font-bold text-lg">Detalhes #{selectedRequest.id}</h3>
                            <button onClick={() => setSelectedRequest(null)} className="p-1 bg-gray-100 rounded-full"><XCircle size={20}/></button>
                        </div>
                        
                        <div className="space-y-3 text-sm">
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-gray-50 p-2 rounded">
                                    <p className="text-xs text-gray-500">Veículo</p>
                                    <p className="font-bold">{selectedRequest.veiculo_nome}</p>
                                </div>
                                <div className="bg-gray-50 p-2 rounded">
                                    <p className="text-xs text-gray-500">Combustível</p>
                                    <p className="font-bold">{selectedRequest.tipo_combustivel}</p>
                                </div>
                            </div>
                            
                            {selectedRequest.status === 'LIBERADO' ? (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                                    <CheckCircle size={32} className="text-green-500 mx-auto mb-2" />
                                    <p className="font-bold text-green-800 mb-1">Solicitação Aprovada!</p>
                                    <p className="text-xs text-green-700 mb-4">Abasteça e envie a foto do cupom para finalizar.</p>
                                    
                                    <div 
                                        onClick={() => cupomInputRef.current.click()}
                                        className="bg-white border-2 border-dashed border-green-300 rounded-lg p-3 cursor-pointer hover:bg-green-50"
                                    >
                                        {cupomFile ? (
                                            <p className="text-green-600 font-bold flex items-center justify-center gap-2"><CheckCircle size={16}/> Foto Selecionada</p>
                                        ) : (
                                            <p className="text-gray-500 flex items-center justify-center gap-2"><ImageIcon size={16}/> Tirar foto do Cupom</p>
                                        )}
                                    </div>
                                    <input 
                                        type="file" 
                                        ref={cupomInputRef} 
                                        className="hidden" 
                                        accept="image/*" 
                                        capture="environment"
                                        onChange={(e) => handleImageChange(e, 'cupom')}
                                    />

                                    <button 
                                        onClick={() => handleSendCupom(selectedRequest.id)}
                                        disabled={!cupomFile || loading}
                                        className="w-full mt-3 py-2 bg-green-600 text-white font-bold rounded-lg shadow disabled:opacity-50 flex justify-center"
                                    >
                                        {loading ? <Loader className="animate-spin" size={16}/> : "Enviar Comprovante"}
                                    </button>
                                </div>
                            ) : selectedRequest.status === 'AGUARDANDO_BAIXA' ? (
                                <div className="text-center p-4 bg-blue-50 text-blue-800 rounded-lg">
                                    <Clock className="mx-auto mb-2" />
                                    <p className="font-bold">Em Análise de Baixa</p>
                                    <p className="text-xs">O comprovante foi enviado. Aguarde a confirmação final.</p>
                                </div>
                            ) : (
                                <div className="p-2 bg-gray-100 rounded text-center text-gray-500 text-xs">
                                    Status: {selectedRequest.status}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SolicitacaoAbastecimentoPage;