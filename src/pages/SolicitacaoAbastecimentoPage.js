import React, { useState, useEffect, useRef } from 'react';
import { 
    Camera, MapPin, Send, AlertTriangle, CheckCircle, Clock, 
    XCircle, ChevronRight, Fuel, Image as ImageIcon, Loader, 
    WifiOff, RefreshCw, Lock, LogOut 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const SolicitacaoAbastecimentoPage = ({ 
    apiClient, 
    vehicles = [], 
    obras = [], 
    partners = [], 
    setAlertMessage 
}) => {
    const { user, logout } = useAuth();
    
    // --- ESTADOS DE CONTROLE ---
    const [view, setView] = useState('list'); // 'list' | 'form'
    const [loading, setLoading] = useState(false);
    const [userStatus, setUserStatus] = useState({ blocked: false, attempts: 0 });
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    
    // --- DADOS ---
    const [myRequests, setMyRequests] = useState([]);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [lastPostoId, setLastPostoId] = useState(''); // Sugestão inteligente
    
    // --- FORMULÁRIO ---
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
    const [rawImageFile, setRawImageFile] = useState(null); // Arquivo comprimido pronto para upload
    const [cupomFile, setCupomFile] = useState(null);
    const [cupomPreview, setCupomPreview] = useState(null);

    // Refs
    const fileInputRef = useRef(null);
    const cupomInputRef = useRef(null);

    // --- EFEITOS E INICIALIZAÇÃO ---

    useEffect(() => {
        checkUserStatus();
        fetchMyRequests();

        // Listeners de Conectividade
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Geolocalização Inicial
        getLocation();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Determinar Obra Automática ao selecionar Veículo
    useEffect(() => {
        if (formData.veiculoId && vehicles.length > 0) {
            const v = vehicles.find(veh => veh.id === formData.veiculoId);
            if (v && v.obraAtualId) {
                // Verifica se a obra ainda existe/está ativa na lista
                const obraExiste = obras.find(o => o.id === v.obraAtualId);
                if (obraExiste) {
                    setFormData(prev => ({ ...prev, obraId: v.obraAtualId }));
                }
            }
        }
    }, [formData.veiculoId, vehicles, obras]);

    // --- FUNÇÕES AUXILIARES ---

    const checkUserStatus = async () => {
        try {
            // Verifica status atualizado no backend (pós-login)
            const res = await apiClient.get('/solicitacoes/meus-status'); // Endpoint criado no controller anterior
            setUserStatus({
                blocked: res.bloqueado_abastecimento === 1,
                attempts: res.tentativas_falhas_abastecimento
            });
        } catch (error) {
            // Se falhar (ex: offline), usa dados do contexto ou cache local se implementado
            if (user?.bloqueado_abastecimento) {
                setUserStatus({
                    blocked: true,
                    attempts: user.tentativas_falhas_abastecimento || 0
                });
            }
        }
    };

    const fetchMyRequests = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/solicitacoes');
            // apiClient retorna os dados diretamente
            const lista = Array.isArray(res) ? res : [];
            setMyRequests(lista);

            // Sugestão de Posto: Pega o último posto utilizado nas solicitações
            if (lista.length > 0) {
                // Ordenado por data desc no backend
                const last = lista.find(r => r.posto_id);
                if (last) setLastPostoId(last.posto_id);
            }
        } catch (error) {
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
                    // Não bloqueia, apenas segue sem lat/long
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        }
    };

    // --- COMPRESSÃO DE IMAGEM NO CLIENTE (CANVAS) ---
    const handleImageCompress = (file, callback) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Reduzir para Max 1280px largura (HD 720p aprox) para leveza
                const MAX_WIDTH = 1280;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Converter para WebP (ou Jpeg) com qualidade 0.7
                canvas.toBlob((blob) => {
                    const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    });
                    callback(compressedFile, URL.createObjectURL(compressedFile));
                }, 'image/jpeg', 0.7);
            };
        };
    };

    const handleFileChange = (e, type) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true); // UI feedback durante compressão
        handleImageCompress(file, (compressedFile, previewUrl) => {
            if (type === 'painel') {
                setRawImageFile(compressedFile);
                setPreviewImage(previewUrl);
            } else if (type === 'cupom') {
                setCupomFile(compressedFile);
                setCupomPreview(previewUrl);
            }
            setLoading(false);
        });
    };

    // --- SUBMISSÃO ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Bloqueio Preventivo no Front
        if (userStatus.blocked) {
            setAlertMessage("VOCÊ ESTÁ BLOQUEADO. Contate o administrador.");
            return;
        }

        if (!rawImageFile) {
            setAlertMessage("A foto do painel/evidência é obrigatória.");
            return;
        }

        if (!formData.veiculoId || !formData.tipoCombustivel) {
            setAlertMessage("Preencha Veículo e Combustível.");
            return;
        }

        // Se não escolheu posto, tenta usar o sugerido (se usuário não alterou para "Selecione")
        // Mas a UI força a seleção. Vamos garantir que postoId esteja preenchido se não for "Outro" visualmente
        if (!formData.postoId && !lastPostoId && partners.length > 0) {
            // Regra de negócio: Posto é obrigatório ou sugestão?
            // Prompt: "opção de escolha de outro posto da lista". Vamos obrigar seleção.
            setAlertMessage("Selecione o Posto de Abastecimento.");
            return;
        }

        setLoading(true);

        const payload = new FormData();
        // Append campos
        Object.keys(formData).forEach(key => {
            if (formData[key] !== null && formData[key] !== undefined) {
                payload.append(key, formData[key]);
            }
        });
        // Se postoId vazio mas tem sugestão e usuário não mexeu? (Assumindo que select controla isso)
        
        payload.append('foto_painel', rawImageFile);

        try {
            await apiClient.post('/solicitacoes', payload, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            setAlertMessage("Solicitação enviada! Aguarde liberação.");
            
            // Reset
            setView('list');
            fetchMyRequests();
            setFormData({
                veiculoId: '', obraId: '', postoId: '', tipoCombustivel: '',
                litragem: '', flagTanqueCheio: false, flagOutros: false,
                horimetro: '', odometro: '', latitude: null, longitude: null
            });
            setPreviewImage(null);
            setRawImageFile(null);
            
            checkUserStatus(); // Atualiza contador de tentativas

        } catch (error) {
            const msg = error.message || "Erro ao enviar solicitação.";
            setAlertMessage(msg); // Exibe erro claro (ex: Bloqueado, 20% orçamento)
            
            // Se o erro indicar bloqueio, atualiza status imediatamente
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
            setCupomPreview(null);
            setSelectedRequest(null);
            fetchMyRequests();
        } catch (error) {
            setAlertMessage("Erro ao enviar comprovante: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    // --- RENDERIZAÇÃO ---

    // TELA DE BLOQUEIO
    if (userStatus.blocked) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 p-6 text-center animate-fadeIn">
                <div className="bg-white p-8 rounded-full shadow-lg mb-6">
                    <Lock size={64} className="text-red-500" />
                </div>
                <h1 className="text-3xl font-bold text-red-700 mb-2">ACESSO BLOQUEADO</h1>
                <p className="text-gray-600 text-lg mb-4">
                    Você excedeu o número máximo de tentativas falhas (3 erros de leitura/odômetro).
                </p>
                <div className="bg-red-100 border-l-4 border-red-500 p-4 w-full max-w-md text-left mb-6">
                    <p className="font-bold text-red-800">Instruções:</p>
                    <p className="text-red-700 text-sm">Entre em contato com o Gestor de Frotas imediatamente para desbloqueio manual da sua conta.</p>
                </div>
                <button onClick={() => window.location.reload()} className="px-8 py-3 bg-gray-800 text-white rounded-xl shadow-lg hover:bg-gray-700 transition">
                    Tentar Novamente
                </button>
                <button onClick={logout} className="mt-4 text-gray-500 underline text-sm">Sair do Sistema</button>
            </div>
        );
    }

    // TELA DE FORMULÁRIO (Check-in)
    if (view === 'form') {
        // Encontra veículo selecionado para validação visual
        const veiculoSelecionado = vehicles.find(v => v.id === formData.veiculoId);

        return (
            <div className="min-h-screen bg-gray-50 pb-20 animate-slide-up">
                {/* Header App */}
                <div className="bg-yellow-400 p-4 shadow-md sticky top-0 z-10 flex justify-between items-center">
                    <button onClick={() => setView('list')} className="p-2 bg-yellow-500 rounded-full text-white hover:bg-yellow-600 transition">
                        <ChevronRight className="rotate-180" size={24} />
                    </button>
                    <h1 className="text-lg font-bold text-gray-900">Solicitar Abastecimento</h1>
                    <div className="w-8"></div>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-5 max-w-lg mx-auto">
                    
                    {isOffline && (
                        <div className="bg-orange-100 text-orange-900 p-3 rounded-lg flex items-center gap-2 text-sm border border-orange-200">
                            <WifiOff size={16} /> 
                            <strong>Modo Offline:</strong> Seus dados serão salvos localmente (implementação futura PWA).
                        </div>
                    )}

                    {/* Localização */}
                    <div className={`flex items-center justify-between p-3 rounded-xl border ${formData.latitude ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center gap-2">
                            <MapPin size={20} className={formData.latitude ? "text-green-600" : "text-gray-400"} />
                            <span className="text-sm font-medium text-gray-700">
                                {formData.latitude ? "Localização Capturada" : "Aguardando GPS..."}
                            </span>
                        </div>
                        {!formData.latitude && (
                            <button type="button" onClick={getLocation} className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold">
                                Tentar
                            </button>
                        )}
                    </div>

                    {/* Seleção de Veículo */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Veículo / Equipamento</label>
                        <select 
                            className="w-full p-4 bg-white border border-gray-300 rounded-xl shadow-sm text-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                            value={formData.veiculoId}
                            onChange={e => setFormData({...formData, veiculoId: e.target.value})}
                        >
                            <option value="">Selecione o Veículo...</option>
                            {vehicles.map(v => (
                                <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa} ({v.modelo})</option>
                            ))}
                        </select>
                        {veiculoSelecionado && (
                            <p className="text-xs text-gray-400 text-right px-1">
                                Último Registro: {veiculoSelecionado.odometro > 0 ? `${veiculoSelecionado.odometro} Km` : `${veiculoSelecionado.horimetro || 0} h`}
                            </p>
                        )}
                    </div>

                    {/* Leitura (Dinâmica baseada no tipo) */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Odômetro (Km)</label>
                            <input 
                                type="number" 
                                className="w-full p-3 bg-white border border-gray-300 rounded-xl shadow-sm text-lg font-bold"
                                placeholder="Ex: 15000"
                                value={formData.odometro}
                                onChange={e => setFormData({...formData, odometro: e.target.value})}
                                disabled={veiculoSelecionado && veiculoSelecionado.tipo === 'Equipamento'} // Exemplo de regra visual
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Horímetro (Hr)</label>
                            <input 
                                type="number" 
                                className="w-full p-3 bg-white border border-gray-300 rounded-xl shadow-sm text-lg font-bold"
                                placeholder="Ex: 1500.5"
                                value={formData.horimetro}
                                onChange={e => setFormData({...formData, horimetro: e.target.value})}
                            />
                        </div>
                    </div>

                    {/* Foto do Painel */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1 flex justify-between">
                            <span>Foto do Painel (Obrigatório)</span>
                            <span className="text-blue-600 font-normal">Tire foto nítida</span>
                        </label>
                        <div 
                            onClick={() => fileInputRef.current.click()}
                            className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-all cursor-pointer h-48 relative overflow-hidden ${previewImage ? 'border-green-500 bg-green-50' : 'border-gray-400 bg-gray-50 active:bg-gray-200'}`}
                        >
                            {previewImage ? (
                                <>
                                    <img src={previewImage} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-80" />
                                    <div className="absolute bottom-2 bg-white px-3 py-1 rounded-full shadow text-xs font-bold text-green-700 flex items-center gap-1">
                                        <CheckCircle size={12}/> Foto Carregada
                                    </div>
                                </>
                            ) : (
                                <>
                                    <Camera size={48} className="text-gray-400 mb-2" />
                                    <span className="text-base text-gray-600 font-bold">Tocar para abrir Câmera</span>
                                    <span className="text-xs text-gray-400 mt-1">A imagem será otimizada automaticamente</span>
                                </>
                            )}
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*" 
                                capture="environment" // Abre câmera traseira no mobile
                                onChange={(e) => handleFileChange(e, 'painel')}
                            />
                        </div>
                    </div>

                    {/* Obra e Posto */}
                    <div className="space-y-4 pt-2 border-t border-gray-200">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Obra / Alocação</label>
                            <select 
                                className="w-full p-3 bg-white border border-gray-300 rounded-xl shadow-sm"
                                value={formData.obraId}
                                onChange={e => setFormData({...formData, obraId: e.target.value})}
                            >
                                <option value="">Selecione a Obra...</option>
                                {obras.filter(o => o.status === 'ativa').map(o => (
                                    <option key={o.id} value={o.id}>{o.nome}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase ml-1 flex justify-between">
                                Posto de Abastecimento
                                {lastPostoId && <span className="text-blue-600 font-normal cursor-pointer" onClick={() => setFormData(p => ({...p, postoId: lastPostoId}))}>Usar último</span>}
                            </label>
                            <select 
                                className="w-full p-3 bg-white border border-gray-300 rounded-xl shadow-sm"
                                value={formData.postoId}
                                onChange={e => setFormData({...formData, postoId: e.target.value})}
                            >
                                <option value="">Selecione o Posto...</option>
                                {lastPostoId && partners.find(p => p.id === lastPostoId) && (
                                    <optgroup label="Sugestão">
                                        <option value={lastPostoId}>{partners.find(p => p.id === lastPostoId)?.razaoSocial} (Último)</option>
                                    </optgroup>
                                )}
                                <optgroup label="Todos">
                                    {partners.map(p => (
                                        <option key={p.id} value={p.id}>{p.razaoSocial}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>
                    </div>

                    {/* Combustível */}
                    <div className="bg-yellow-50 p-4 rounded-xl shadow-inner border border-yellow-200 space-y-3">
                        <label className="text-sm font-bold text-yellow-900 flex items-center gap-2">
                            <Fuel size={18}/> Detalhes do Combustível
                        </label>
                        
                        <select 
                            className="w-full p-3 border border-yellow-300 rounded-lg bg-white"
                            value={formData.tipoCombustivel}
                            onChange={e => setFormData({...formData, tipoCombustivel: e.target.value})}
                        >
                            <option value="">Selecione o Tipo...</option>
                            <option value="DIESEL S10">Diesel S10</option>
                            <option value="DIESEL S500">Diesel S500</option>
                            <option value="GASOLINA COMUM">Gasolina Comum</option>
                            <option value="ARLA">Arla 32</option>
                        </select>

                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 relative">
                                <input 
                                    type="number" 
                                    placeholder="Litros" 
                                    className="w-full p-3 border border-yellow-300 rounded-lg disabled:bg-gray-100"
                                    disabled={formData.flagTanqueCheio}
                                    value={formData.litragem}
                                    onChange={e => setFormData({...formData, litragem: e.target.value})}
                                />
                                <span className="absolute right-3 top-3.5 text-gray-400 text-sm font-bold">L</span>
                            </div>
                            <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${formData.flagTanqueCheio ? 'bg-yellow-400 border-yellow-500 text-black' : 'bg-white border-yellow-300 text-gray-600'}`}>
                                <input 
                                    type="checkbox" 
                                    checked={formData.flagTanqueCheio}
                                    onChange={e => setFormData({...formData, flagTanqueCheio: e.target.checked})}
                                    className="w-5 h-5 accent-black"
                                />
                                <span className="text-sm font-bold">Tanque Cheio</span>
                            </label>
                        </div>
                        
                        <label className="flex items-center gap-2 mt-2 pt-2 border-t border-yellow-200">
                            <input 
                                type="checkbox" 
                                checked={formData.flagOutros}
                                onChange={e => setFormData({...formData, flagOutros: e.target.checked})}
                                className="w-4 h-4 text-blue-500 rounded accent-blue-600"
                            />
                            <span className="text-xs text-gray-700 font-medium">Incluir Outros Produtos/Serviços (Óleo, Filtro...)</span>
                        </label>
                    </div>

                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full py-4 bg-gray-900 text-white font-bold rounded-xl shadow-xl hover:bg-gray-800 active:scale-95 transition-transform flex items-center justify-center gap-2 text-lg disabled:opacity-70"
                    >
                        {loading ? <Loader className="animate-spin" /> : <><Send size={20} /> ENVIAR SOLICITAÇÃO</>}
                    </button>
                    <div className="h-8"></div>
                </form>
            </div>
        );
    }

    // TELA DE DASHBOARD (LISTA)
    return (
        <div className="min-h-screen bg-gray-100 pb-24 animate-fadeIn">
            {/* Header Dashboard */}
            <div className="bg-gray-900 text-white p-6 pb-12 rounded-b-[2.5rem] shadow-xl relative overflow-hidden">
                <div className="absolute top-[-20px] right-[-20px] p-4 opacity-10 rotate-12">
                    <Fuel size={150} />
                </div>
                <div className="flex justify-between items-start mb-6 relative z-10">
                    <div>
                        <h1 className="text-2xl font-bold">Olá, {user.name.split(' ')[0]}</h1>
                        <p className="text-gray-400 text-sm">Painel do Operador</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={fetchMyRequests} className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition active:rotate-180">
                            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                        </button>
                        <button onClick={logout} className="p-2 bg-red-900/50 rounded-full hover:bg-red-900 transition">
                            <LogOut size={20} />
                        </button>
                    </div>
                </div>
                
                {/* Botão Principal de Ação */}
                <button 
                    onClick={() => { getLocation(); setView('form'); }}
                    className="w-full py-4 bg-yellow-400 text-gray-900 font-bold rounded-2xl shadow-lg flex items-center justify-center gap-3 hover:bg-yellow-300 transition active:scale-98 relative z-10"
                >
                    <Fuel size={24} /> 
                    <span className="text-lg">NOVO ABASTECIMENTO</span>
                </button>
            </div>

            {/* Alerta de Pendência Crítica */}
            {myRequests.some(r => r.status === 'LIBERADO' || r.status === 'REJEITADO_COMPROVANTE') && (
                <div className="mx-4 -mt-4 mb-4 relative z-20 bg-red-500 text-white p-3 rounded-xl shadow-lg flex items-center gap-3 animate-pulse">
                    <AlertTriangle size={24} className="shrink-0"/>
                    <div className="text-sm font-bold leading-tight">
                        Você tem ordens aguardando comprovante! Envie a foto para liberar novas solicitações.
                    </div>
                </div>
            )}

            {/* Lista de Solicitações */}
            <div className="px-4 mt-2">
                <h2 className="text-sm font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                    <Clock size={14} /> Minhas Solicitações Recentes
                </h2>
                
                {myRequests.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-300">
                        <Fuel size={48} className="mx-auto text-gray-200 mb-2"/>
                        <p className="text-gray-400 text-sm">Nenhuma solicitação encontrada.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {myRequests.map(req => {
                            // Cores de Status
                            let statusStyle = 'bg-gray-100 text-gray-600';
                            let statusLabel = req.status;
                            let icon = null;

                            if (req.status === 'PENDENTE') {
                                statusStyle = 'bg-yellow-100 text-yellow-800 border-yellow-200';
                                statusLabel = 'AGUARDANDO LIBERAÇÃO';
                                icon = <Clock size={14}/>;
                            } else if (req.status === 'LIBERADO') {
                                statusStyle = 'bg-green-100 text-green-800 border-green-200 font-bold animate-pulse';
                                statusLabel = 'LIBERADO - ENVIAR CUPOM';
                                icon = <Camera size={14}/>;
                            } else if (req.status === 'NEGADO') {
                                statusStyle = 'bg-red-100 text-red-800 border-red-200 font-bold';
                                statusLabel = 'NEGADO';
                                icon = <XCircle size={14}/>;
                            } else if (req.status === 'AGUARDANDO_BAIXA') {
                                statusStyle = 'bg-blue-50 text-blue-800 border-blue-200';
                                statusLabel = 'EM ANÁLISE DE BAIXA';
                                icon = <CheckCircle size={14}/>;
                            } else if (req.status === 'CONCLUIDO') {
                                statusStyle = 'bg-gray-200 text-gray-500 line-through opacity-70';
                                statusLabel = 'FINALIZADO';
                            }

                            const data = new Date(req.data_solicitacao).toLocaleDateString('pt-BR');
                            
                            return (
                                <div key={req.id} onClick={() => setSelectedRequest(req)} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md cursor-pointer active:scale-98 transition relative overflow-hidden">
                                    {/* Barra Lateral Colorida */}
                                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${req.status === 'LIBERADO' ? 'bg-green-500' : req.status === 'NEGADO' ? 'bg-red-500' : 'bg-gray-300'}`}></div>
                                    
                                    <div className="pl-2">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className={`text-[10px] px-2 py-1 rounded-md border flex items-center gap-1 ${statusStyle}`}>
                                                {icon} {statusLabel}
                                            </span>
                                            <span className="text-xs text-gray-400 font-medium">{data}</span>
                                        </div>
                                        
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-gray-800 text-lg">{req.placa}</p>
                                                <p className="text-xs text-gray-500 font-medium uppercase">{req.veiculo_nome}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-gray-800">{req.litragem_solicitada ? `${req.litragem_solicitada} L` : 'Tanque Cheio'}</p>
                                                <p className="text-[10px] text-gray-500">{req.tipo_combustivel}</p>
                                            </div>
                                        </div>

                                        {req.status === 'NEGADO' && (
                                            <div className="mt-3 p-2 bg-red-50 rounded border border-red-100">
                                                <p className="text-xs text-red-800 font-bold">Motivo: {req.motivo_negativa}</p>
                                                <p className="text-[10px] text-red-600 mt-1">Contate o responsável para detalhes.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Modal de Detalhes / Upload Cupom */}
            {selectedRequest && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
                    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <div>
                                <h3 className="font-bold text-xl text-gray-900">Solicitação #{selectedRequest.id}</h3>
                                <p className="text-sm text-gray-500">{selectedRequest.placa} - {selectedRequest.veiculo_nome}</p>
                            </div>
                            <button onClick={() => { setSelectedRequest(null); setCupomFile(null); setCupomPreview(null); }} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                                <XCircle size={24} className="text-gray-600"/>
                            </button>
                        </div>
                        
                        <div className="space-y-4">
                            {selectedRequest.status === 'LIBERADO' ? (
                                <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center shadow-sm">
                                    <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <CheckCircle size={32} className="text-green-600" />
                                    </div>
                                    <h4 className="font-bold text-green-800 text-lg mb-1">Aprovado! Envie o Cupom.</h4>
                                    <p className="text-sm text-green-700 mb-6 px-4">
                                        O abastecimento foi autorizado. Após abastecer, tire uma foto legível do cupom fiscal para finalizar.
                                    </p>
                                    
                                    {/* Upload Cupom */}
                                    <div 
                                        onClick={() => cupomInputRef.current.click()}
                                        className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors relative overflow-hidden h-40 flex flex-col items-center justify-center ${cupomPreview ? 'border-green-500' : 'border-green-300 bg-white hover:bg-green-50'}`}
                                    >
                                        {cupomPreview ? (
                                            <>
                                                <img src={cupomPreview} alt="Cupom" className="absolute inset-0 w-full h-full object-cover" />
                                                <div className="absolute bottom-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs font-bold">
                                                    Toque para alterar
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <ImageIcon size={32} className="text-green-400 mb-2"/>
                                                <span className="text-sm font-bold text-green-600">Fotografar Cupom Fiscal</span>
                                            </>
                                        )}
                                        <input 
                                            type="file" 
                                            ref={cupomInputRef} 
                                            className="hidden" 
                                            accept="image/*" 
                                            capture="environment"
                                            onChange={(e) => handleFileChange(e, 'cupom')}
                                        />
                                    </div>

                                    <button 
                                        onClick={() => handleSendCupom(selectedRequest.id)}
                                        disabled={!cupomFile || loading}
                                        className="w-full mt-4 py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {loading ? <Loader className="animate-spin" size={20}/> : "ENVIAR COMPROVANTE"}
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="bg-gray-50 p-3 rounded-xl">
                                        <p className="text-xs text-gray-500 uppercase font-bold">Posto</p>
                                        <p className="font-medium text-gray-800 truncate">{selectedRequest.posto_nome || 'Não Informado'}</p>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-xl">
                                        <p className="text-xs text-gray-500 uppercase font-bold">Combustível</p>
                                        <p className="font-medium text-gray-800">{selectedRequest.tipo_combustivel}</p>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-xl">
                                        <p className="text-xs text-gray-500 uppercase font-bold">Quantidade</p>
                                        <p className="font-medium text-gray-800">{selectedRequest.litragem_solicitada ? `${selectedRequest.litragem_solicitada} L` : 'Tanque Cheio'}</p>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-xl">
                                        <p className="text-xs text-gray-500 uppercase font-bold">Leitura</p>
                                        <p className="font-medium text-gray-800">
                                            {selectedRequest.odometro_informado ? `${selectedRequest.odometro_informado} Km` : `${selectedRequest.horimetro_informado} h`}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {selectedRequest.status === 'AGUARDANDO_BAIXA' && (
                                <div className="p-4 bg-blue-50 text-blue-800 rounded-xl text-center border border-blue-100">
                                    <Clock size={24} className="mx-auto mb-2 text-blue-500"/>
                                    <p className="font-bold">Comprovante em Análise</p>
                                    <p className="text-xs mt-1">O gestor está validando a foto do cupom. Você será notificado quando for concluído.</p>
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