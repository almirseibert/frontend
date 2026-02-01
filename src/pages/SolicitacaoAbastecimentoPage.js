import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Camera, MapPin, Send, AlertTriangle, CheckCircle, Clock, 
    XCircle, ChevronRight, Fuel, Image as ImageIcon, Loader, 
    WifiOff, RefreshCw, Lock, LogOut, User, FileText, Droplet, 
    CalendarClock, Gauge
} from 'lucide-react';

const SolicitacaoAbastecimentoPage = ({ 
    apiClient, 
    vehicles = [], 
    obras = [], 
    partners = [], 
    employees = [], 
    setAlertMessage,
    user,
    onLogout
}) => {
    
    // --- ESTADOS DE CONTROLE ---
    const [view, setView] = useState('list'); 
    const [loading, setLoading] = useState(false);
    const [userStatus, setUserStatus] = useState({ blocked: false, attempts: 0 });
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    
    // --- DADOS ---
    const [myRequests, setMyRequests] = useState([]);
    const [selectedRequest, setSelectedRequest] = useState(null);
    
    // --- FORMULÁRIO ---
    const [formData, setFormData] = useState({
        veiculoId: '',
        obraId: '',
        postoId: '',
        funcionarioId: '', 
        tipoCombustivel: '',
        litragem: '',
        flagTanqueCheio: false,
        flagOutros: false,
        descricaoOutros: '', 
        observacao: '', 
        
        // Arla
        needsArla: false,
        litragemArla: '',
        flagTanqueCheioArla: false,

        horimetro: '',
        odometro: '',
        latitude: null,
        longitude: null
    });
    
    const [previewImage, setPreviewImage] = useState(null);
    const [rawImageFile, setRawImageFile] = useState(null);
    const [cupomFile, setCupomFile] = useState(null);
    const [cupomPreview, setCupomPreview] = useState(null);

    // Refs
    const fileInputRef = useRef(null);
    const cupomInputRef = useRef(null);

    // --- REGRAS DE NEGÓCIO (LISTAS E TIPOS) ---

    // Grupos que usam ARLA 32
    const GRUPOS_ARLA = [
        'BITRUCK', 'CAMINHÃO', 'CAMINHÃO CARROCERIA', 'CAMINHÃO PIPA', 
        'CAMINHÃO PRANCHA', 'CAMINHÃO TANQUE', 'CAVALO', 'CAÇAMBA', 
        'CAÇAMBA BITRUCK', 'CAÇAMBA TOCO', 'CAÇAMBA TRUCKADO', 'CAÇAMBA TRAÇADO'
    ];

    // Grupos que usam ODÔMETRO (KM)
    const GRUPOS_ODOMETRO = [
        'VEÍCULO LEVE', 'UTILITÁRIO', 'PASSEIO', 'CAMINHÃO PRANCHA', 'CAMINHÃO TOCO'
    ];
    // OBS: Caminhão Prancha pode estar em ambos (Arla e Km), o sistema tratará corretamente.

    // --- LÓGICA DE FILTRAGEM (OBRA -> VEÍCULOS -> FUNCIONÁRIOS) ---

    // 1. Identificar Obra(s) onde o Usuário Logado está ALOCADO ATUALMENTE
    const userObrasIds = useMemo(() => {
        if (!user || !obras.length) return [];
        
        // Se for Admin ou Gestor sem restrição, pode ver tudo (opcional, mantendo regra estrita do solicitante)
        // Mas a regra diz: "filtrar a partir da tabela users coluna employeeId"
        
        const myEmployeeId = user.employeeId; // ID do funcionário vinculado ao usuário
        if (!myEmployeeId) return []; // Se usuário não tem vínculo com funcionário, não vê obras

        const activeObraIds = [];
        
        obras.forEach(obra => {
            if (obra.historicoVeiculos && Array.isArray(obra.historicoVeiculos)) {
                // Procura se o funcionário está ativo nesta obra (dataSaida IS NULL)
                const isUserInObra = obra.historicoVeiculos.some(h => 
                    h.employeeId === myEmployeeId && !h.dataSaida
                );
                if (isUserInObra) {
                    activeObraIds.push(obra.id);
                }
            }
        });

        return activeObraIds;
    }, [user, obras]);

    // 2. Veículos Disponíveis (Filtrados pela Obra Selecionada)
    const filteredVehicles = useMemo(() => {
        if (!formData.obraId) return [];
        
        const selectedObra = obras.find(o => o.id === formData.obraId);
        if (!selectedObra || !selectedObra.historicoVeiculos) return [];

        // Filtra veículos que estão ativos nesta obra (dataSaida NULL)
        const activeVehicleIds = selectedObra.historicoVeiculos
            .filter(h => !h.dataSaida)
            .map(h => h.veiculoId);
        
        // Retorna e ordena alfabeticamente
        return vehicles
            .filter(v => activeVehicleIds.includes(v.id))
            .sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || ''));
    }, [formData.obraId, obras, vehicles]);

    // 3. Funcionários Disponíveis (Todos que estão na mesma obra selecionada)
    const filteredEmployees = useMemo(() => {
        if (!formData.obraId) return []; 

        const selectedObra = obras.find(o => o.id === formData.obraId);
        if (!selectedObra || !selectedObra.historicoVeiculos) return [];

        // Pega IDs de funcionários ativos nesta obra (Colegas de trabalho)
        const activeEmployeeIds = selectedObra.historicoVeiculos
            .filter(h => !h.dataSaida && h.employeeId)
            .map(h => h.employeeId);
        
        // Filtra lista de funcionários e ordena
        return employees
            .filter(e => activeEmployeeIds.includes(e.id))
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    }, [formData.obraId, obras, employees]);


    // --- EFEITOS DE INICIALIZAÇÃO ---

    useEffect(() => {
        if (user) {
            checkUserStatus();
            fetchMyRequests();
        }
        
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        getLocation();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [user]);

    // Auto-selecionar Obra se o usuário só tiver uma
    useEffect(() => {
        if (userObrasIds.length === 1 && !formData.obraId) {
            setFormData(prev => ({ ...prev, obraId: userObrasIds[0] }));
        }
    }, [userObrasIds]);

    // Auto-selecionar o próprio usuário como funcionário responsável
    useEffect(() => {
        if (user && user.employeeId && !formData.funcionarioId) {
            // Verifica se ele está na lista de filtrados (está na obra)
            const isInList = filteredEmployees.some(e => e.id === user.employeeId);
            if (isInList) {
                setFormData(prev => ({ ...prev, funcionarioId: user.employeeId }));
            }
        }
    }, [user, filteredEmployees]);

    // --- LÓGICA DO VEÍCULO SELECIONADO ---

    const veiculoSelecionado = useMemo(() => {
        return vehicles.find(v => v.id === formData.veiculoId);
    }, [formData.veiculoId, vehicles]);

    // Ao selecionar veículo: Sugere Posto e Limpa Leituras
    useEffect(() => {
        if (veiculoSelecionado) {
            setFormData(prev => ({ ...prev, odometro: '', horimetro: '' }));

            // REGRA: Sempre selecionar o último posto que aquele veículo abasteceu
            // 1. Tenta pegar direto do objeto veículo (se o backend mandar 'lastPartnerId')
            let lastPartner = veiculoSelecionado.lastPartnerId;
            
            // 2. Se não tiver no objeto, tenta achar na lista de requisições recentes
            if (!lastPartner) {
                // Procura a última requisição aprovada deste veículo
                const lastReq = myRequests.find(r => r.veiculo_id === veiculoSelecionado.id && r.status === 'CONCLUIDO');
                if (lastReq) lastPartner = lastReq.posto_id;
            }

            if (lastPartner) {
                setFormData(prev => ({ ...prev, postoId: lastPartner }));
            }
        }
    }, [veiculoSelecionado, myRequests]);

    // Determina tipo de leitura (Km ou Horas)
    const readingType = useMemo(() => {
        if (!veiculoSelecionado) return 'bloqueado';
        
        const tipo = (veiculoSelecionado.tipo || '').toUpperCase();
        const modelo = (veiculoSelecionado.modelo || '').toUpperCase();
        
        // Verifica se encaixa nos grupos de Odômetro
        const isOdometer = GRUPOS_ODOMETRO.some(t => tipo === t || modelo.includes(t));

        return isOdometer ? 'odometro' : 'horimetro';
    }, [veiculoSelecionado]);

    // Determina se exibe Arla
    const showArlaSection = useMemo(() => {
        if (!veiculoSelecionado) return false;
        
        const tipo = (veiculoSelecionado.tipo || '').toUpperCase();
        const modelo = (veiculoSelecionado.modelo || '').toUpperCase();

        return GRUPOS_ARLA.some(t => tipo === t || modelo.includes(t));
    }, [veiculoSelecionado]);

    // Alerta de Abastecimento Recente (< 24h)
    const recentRefuelAlert = useMemo(() => {
        if (!veiculoSelecionado) return false;
        
        const lastDate = veiculoSelecionado.ultimaDataAbastecimento 
            ? new Date(veiculoSelecionado.ultimaDataAbastecimento) 
            : null;

        if (lastDate) {
            const diffHours = (new Date() - lastDate) / (1000 * 60 * 60);
            if (diffHours < 24) return true;
        }
        return false;
    }, [veiculoSelecionado]);


    // --- FUNÇÕES AUXILIARES E API ---

    const checkUserStatus = async () => {
        try {
            const res = await apiClient.get('/solicitacoes/meus-status'); 
            setUserStatus({
                blocked: res.bloqueado_abastecimento === 1,
                attempts: res.tentativas_falhas_abastecimento
            });
        } catch (error) {
            if (user?.bloqueado_abastecimento) {
                setUserStatus({ blocked: true, attempts: user.tentativas_falhas_abastecimento || 0 });
            }
        }
    };

    const fetchMyRequests = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/solicitacoes');
            setMyRequests(Array.isArray(res) ? res : []);
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
                (error) => console.warn("Erro GPS:", error),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        }
    };

    const handleImageCompress = (file, callback) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
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

        setLoading(true);
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (userStatus.blocked) {
            setAlertMessage("VOCÊ ESTÁ BLOQUEADO. Contate o administrador.");
            return;
        }

        if (!rawImageFile) {
            setAlertMessage("A foto do painel/evidência é obrigatória.");
            return;
        }

        if (!formData.veiculoId || !formData.tipoCombustivel || !formData.postoId || !formData.obraId) {
            setAlertMessage("Preencha todos os campos obrigatórios.");
            return;
        }

        // Validação Específica de Leitura
        if (readingType === 'odometro' && !formData.odometro) {
            setAlertMessage("É obrigatório informar o HODÔMETRO (Km) para este veículo.");
            return;
        }
        if (readingType === 'horimetro' && !formData.horimetro) {
            setAlertMessage("É obrigatório informar o HORÍMETRO (Hr) para este equipamento.");
            return;
        }

        setLoading(true);

        const payload = new FormData();
        
        payload.append('veiculoId', formData.veiculoId);
        payload.append('obraId', formData.obraId);
        payload.append('postoId', formData.postoId);
        payload.append('funcionarioId', formData.funcionarioId);
        payload.append('tipoCombustivel', formData.tipoCombustivel);
        payload.append('litragem', formData.flagTanqueCheio ? '0' : formData.litragem);
        payload.append('flagTanqueCheio', formData.flagTanqueCheio);
        payload.append('flagOutros', formData.flagOutros);
        payload.append('descricao_outros', formData.descricaoOutros);
        
        // Monta observação incluindo Arla
        let obsFinal = formData.observacao;
        if (formData.needsArla) {
            obsFinal += ` [ARLA 32: ${formData.flagTanqueCheioArla ? 'Tanque Cheio' : formData.litragemArla + ' L'}]`;
        }
        payload.append('observacao', obsFinal);

        if (formData.horimetro) payload.append('horimetro', formData.horimetro);
        if (formData.odometro) payload.append('odometro', formData.odometro);
        if (formData.latitude) payload.append('latitude', formData.latitude);
        if (formData.longitude) payload.append('longitude', formData.longitude);
        
        payload.append('foto_painel', rawImageFile);

        try {
            await apiClient.post('/solicitacoes', payload, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            setAlertMessage("Solicitação enviada com sucesso!");
            
            // Reset
            setView('list');
            fetchMyRequests();
            setFormData(prev => ({
                ...prev,
                veiculoId: '', 
                tipoCombustivel: '',
                litragem: '', flagTanqueCheio: false, 
                flagOutros: false, descricaoOutros: '',
                needsArla: false, litragemArla: '', flagTanqueCheioArla: false,
                horimetro: '', odometro: '',
                observacao: '',
            }));
            setPreviewImage(null);
            setRawImageFile(null);
            checkUserStatus();

        } catch (error) {
            const msg = error.response?.data?.error || error.message || "Erro ao enviar.";
            setAlertMessage(msg);
            if (msg.includes("BLOQUEADO")) checkUserStatus();
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

    if (!user) return <div className="flex justify-center items-center h-screen"><Loader className="animate-spin"/></div>;

    if (userStatus.blocked) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 p-6 text-center animate-fadeIn">
                <Lock size={64} className="text-red-500 mb-4" />
                <h1 className="text-2xl font-bold text-red-700 mb-2">ACESSO BLOQUEADO</h1>
                <p className="text-gray-600 mb-4">Número máximo de tentativas falhas excedido.</p>
                <div className="bg-red-100 border-l-4 border-red-500 p-4 text-left w-full max-w-md">
                    <p className="font-bold text-red-800">Contate o Gestor de Frotas.</p>
                </div>
                <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-gray-800 text-white rounded-lg shadow">Atualizar</button>
            </div>
        );
    }

    if (view === 'form') {
        return (
            <div className="min-h-screen bg-gray-50 pb-32 animate-slide-up">
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
                            <WifiOff size={16} /> <strong>Offline:</strong> Salvo localmente.
                        </div>
                    )}

                    {/* Mensagem de Erro/Alerta se não houver obras */}
                    {userObrasIds.length === 0 && (
                        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-sm">
                            <p className="font-bold flex items-center gap-2"><AlertTriangle size={18}/> Sem Obra Alocada</p>
                            <p className="text-sm mt-1">Seu usuário não está vinculado a nenhuma obra ativa no momento. Contate o RH ou Gestor.</p>
                        </div>
                    )}

                    {/* Seleção de Obra (Filtrada) */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Obra / Local</label>
                        <select 
                            className="w-full p-4 bg-white border border-gray-300 rounded-xl shadow-sm text-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                            value={formData.obraId}
                            onChange={e => setFormData({...formData, obraId: e.target.value, veiculoId: ''})}
                            disabled={userObrasIds.length === 0}
                        >
                            <option value="">Selecione a Obra...</option>
                            {obras.filter(o => userObrasIds.includes(o.id)).map(o => (
                                <option key={o.id} value={o.id}>{o.nome}</option>
                            ))}
                        </select>
                    </div>

                    {/* Seleção de Veículo (Filtrado por Obra) */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Veículo (na Obra)</label>
                        <select 
                            className="w-full p-4 bg-white border border-gray-300 rounded-xl shadow-sm text-lg focus:ring-2 focus:ring-yellow-400 outline-none disabled:bg-gray-100"
                            value={formData.veiculoId}
                            onChange={e => setFormData({...formData, veiculoId: e.target.value})}
                            disabled={!formData.obraId}
                        >
                            <option value="">Selecione o Veículo...</option>
                            {filteredVehicles.map(v => (
                                <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa} ({v.modelo})</option>
                            ))}
                        </select>
                        
                        {/* ALERTAS DO VEÍCULO SELECIONADO */}
                        {veiculoSelecionado && (
                            <div className="space-y-2 mt-2 px-1">
                                {veiculoSelecionado.status === 'manutencao' && (
                                    <div className="bg-red-100 text-red-800 p-2 rounded text-xs font-bold flex items-center gap-2 border border-red-200">
                                        <AlertTriangle size={14}/> VEÍCULO EM MANUTENÇÃO
                                    </div>
                                )}
                                {veiculoSelecionado.naoPodeCircular && (
                                    <div className="bg-red-100 text-red-800 p-2 rounded text-xs font-bold flex items-center gap-2 border border-red-200">
                                        <XCircle size={14}/> NÃO PODE CIRCULAR (Docs)
                                    </div>
                                )}
                                {recentRefuelAlert && (
                                    <div className="bg-orange-100 text-orange-800 p-2 rounded text-xs font-bold flex items-center gap-2 border border-orange-200">
                                        <Clock size={14}/> ABASTECIDO HÁ MENOS DE 24H
                                    </div>
                                )}
                                <p className="text-xs text-gray-400 text-right">
                                    Último: {veiculoSelecionado.odometro > 0 ? `${veiculoSelecionado.odometro} Km` : `${veiculoSelecionado.horimetro || 0} h`}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Seleção de Funcionário Responsável (Colegas da Obra) */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Responsável (Solicitante/Motorista)</label>
                        <select 
                            className="w-full p-3 bg-white border border-gray-300 rounded-xl shadow-sm text-base focus:ring-2 focus:ring-yellow-400 outline-none"
                            value={formData.funcionarioId}
                            onChange={e => setFormData({...formData, funcionarioId: e.target.value})}
                            disabled={!formData.obraId}
                        >
                            <option value="">Selecione o Responsável...</option>
                            {filteredEmployees.map(e => (
                                <option key={e.id} value={e.id}>{e.nome}</option>
                            ))}
                        </select>
                    </div>

                    {/* LEITURA INTELIGENTE (KM vs HR) */}
                    <div className="grid grid-cols-1 gap-4">
                        {readingType === 'odometro' && (
                            <div className="animate-fadeIn">
                                <label className="text-xs font-bold text-gray-500 uppercase ml-1 flex items-center gap-1">
                                    <Gauge size={14}/> Hodômetro (Km)
                                </label>
                                <input 
                                    type="number" 
                                    className="w-full p-3 bg-white border border-gray-300 rounded-xl shadow-sm text-lg font-bold"
                                    placeholder="Ex: 15000"
                                    value={formData.odometro}
                                    onChange={e => setFormData({...formData, odometro: e.target.value, horimetro: ''})}
                                    disabled={!veiculoSelecionado} 
                                />
                            </div>
                        )}
                        
                        {readingType === 'horimetro' && (
                            <div className="animate-fadeIn">
                                <label className="text-xs font-bold text-gray-500 uppercase ml-1 flex justify-between items-center">
                                    <span className="flex items-center gap-1"><CalendarClock size={14}/> Horímetro (Hr)</span>
                                    <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold border border-red-200">
                                        NÃO USAR KM!
                                    </span>
                                </label>
                                <input 
                                    type="number" 
                                    className="w-full p-3 bg-white border border-gray-300 rounded-xl shadow-sm text-lg font-bold"
                                    placeholder="Ex: 1500.5"
                                    value={formData.horimetro}
                                    onChange={e => setFormData({...formData, horimetro: e.target.value, odometro: ''})}
                                    disabled={!veiculoSelecionado}
                                />
                            </div>
                        )}
                    </div>

                    {/* Foto */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1 flex justify-between items-center">
                            <span>Foto do Painel</span>
                            <span className="text-red-600 text-[10px] font-bold bg-red-50 px-2 py-1 rounded">Foto ilegível anula o pedido</span>
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
                                    <span className="text-xs text-gray-400 mt-1">Tire foto nítida</span>
                                </>
                            )}
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={(e) => handleFileChange(e, 'painel')} />
                        </div>
                    </div>

                    {/* Posto */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1 flex justify-between">
                            Posto
                            {formData.postoId && <span className="text-blue-600 text-[10px] font-bold bg-blue-50 px-1 rounded">Sugestão Automática</span>}
                        </label>
                        <select 
                            className="w-full p-3 bg-white border border-gray-300 rounded-xl shadow-sm"
                            value={formData.postoId}
                            onChange={e => setFormData({...formData, postoId: e.target.value})}
                        >
                            <option value="">Selecione o Posto...</option>
                            {partners.map(p => (
                                <option key={p.id} value={p.id}>{p.razaoSocial}</option>
                            ))}
                        </select>
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
                            <option value="">Selecione...</option>
                            <option value="DIESEL S10">Diesel S10</option>
                            <option value="DIESEL S500">Diesel S500</option>
                            <option value="GASOLINA COMUM">Gasolina Comum</option>
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
                                <span className="text-sm font-bold">Cheio</span>
                            </label>
                        </div>
                    </div>

                    {/* Seção Arla 32 (Condicional aos Grupos) */}
                    {showArlaSection && (
                        <div className="bg-blue-50 p-4 rounded-xl shadow-inner border border-blue-200 space-y-3 animate-fadeIn">
                            <label className="text-sm font-bold text-blue-900 flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={formData.needsArla}
                                    onChange={e => setFormData({...formData, needsArla: e.target.checked})}
                                    className="w-5 h-5 accent-blue-600"
                                />
                                <Droplet size={18}/> Adicionar Arla 32
                            </label>

                            {formData.needsArla && (
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1 relative">
                                        <input 
                                            type="number" 
                                            placeholder="Lts Arla" 
                                            className="w-full p-3 border border-blue-300 rounded-lg disabled:bg-gray-100"
                                            disabled={formData.flagTanqueCheioArla}
                                            value={formData.litragemArla}
                                            onChange={e => setFormData({...formData, litragemArla: e.target.value})}
                                        />
                                        <span className="absolute right-3 top-3.5 text-gray-400 text-sm font-bold">L</span>
                                    </div>
                                    <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${formData.flagTanqueCheioArla ? 'bg-blue-400 border-blue-500 text-white' : 'bg-white border-blue-300 text-gray-600'}`}>
                                        <input 
                                            type="checkbox" 
                                            checked={formData.flagTanqueCheioArla}
                                            onChange={e => setFormData({...formData, flagTanqueCheioArla: e.target.checked})}
                                            className="w-5 h-5 accent-white"
                                        />
                                        <span className="text-sm font-bold">Cheio</span>
                                    </label>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Outros e Observações */}
                    <div className="space-y-3">
                        <div className="bg-white p-3 border rounded-xl space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={formData.flagOutros}
                                    onChange={e => setFormData({...formData, flagOutros: e.target.checked})}
                                    className="w-4 h-4 text-gray-500 rounded accent-gray-600"
                                />
                                <span className="text-sm text-gray-700 font-medium">Incluir Outros (Óleo, Filtro...)</span>
                            </label>
                            {formData.flagOutros && (
                                <input 
                                    type="text"
                                    placeholder="Descreva os itens..."
                                    className="w-full p-3 border border-gray-300 rounded-lg text-sm"
                                    value={formData.descricaoOutros}
                                    onChange={e => setFormData({...formData, descricaoOutros: e.target.value})}
                                />
                            )}
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase ml-1 flex items-center gap-1">
                                <FileText size={12}/> Observações
                            </label>
                            <textarea 
                                className="w-full p-3 bg-white border border-gray-300 rounded-xl shadow-sm text-sm"
                                rows="2"
                                placeholder="Informações adicionais..."
                                value={formData.observacao}
                                onChange={e => setFormData({...formData, observacao: e.target.value})}
                            ></textarea>
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full py-4 bg-gray-900 text-white font-bold rounded-xl shadow-xl hover:bg-gray-800 active:scale-95 transition-transform flex items-center justify-center gap-2 text-lg disabled:opacity-70"
                    >
                        {loading ? <Loader className="animate-spin" /> : <><Send size={20} /> ENVIAR SOLICITAÇÃO</>}
                    </button>
                </form>
            </div>
        );
    }

    // LIST VIEW
    return (
        <div className="min-h-screen bg-gray-100 pb-24 animate-fadeIn">
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
                        {onLogout && (
                            <button onClick={onLogout} className="p-2 bg-red-900/50 rounded-full hover:bg-red-900 transition">
                                <LogOut size={20} />
                            </button>
                        )}
                    </div>
                </div>
                
                <button 
                    onClick={() => { getLocation(); setView('form'); }}
                    className="w-full py-4 bg-yellow-400 text-gray-900 font-bold rounded-2xl shadow-lg flex items-center justify-center gap-3 hover:bg-yellow-300 transition active:scale-98 relative z-10"
                >
                    <Fuel size={24} /> 
                    <span className="text-lg">NOVO ABASTECIMENTO</span>
                </button>
            </div>

            {/* Lista Histórico */}
            <div className="px-4 mt-2">
                <h2 className="text-sm font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                    <Clock size={14} /> Minhas Solicitações Recentes
                </h2>
                
                {myRequests.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-300">
                        <p className="text-gray-400 text-sm">Nenhuma solicitação encontrada.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {myRequests.map(req => (
                            <div key={req.id} onClick={() => setSelectedRequest(req)} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md cursor-pointer relative overflow-hidden">
                                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${req.status === 'LIBERADO' ? 'bg-green-500' : req.status === 'NEGADO' ? 'bg-red-500' : 'bg-gray-300'}`}></div>
                                <div className="pl-2">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-[10px] px-2 py-1 rounded-md border font-bold ${req.status === 'PENDENTE' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100'}`}>
                                            {req.status}
                                        </span>
                                        <span className="text-xs text-gray-400">{new Date(req.data_solicitacao).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="font-bold text-gray-800">{req.placa}</p>
                                            <p className="text-xs text-gray-500 uppercase">{req.veiculo_nome}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-gray-800">{req.litragem_solicitada ? `${req.litragem_solicitada} L` : 'Cheio'}</p>
                                            <p className="text-[10px] text-gray-500">{req.tipo_combustivel}</p>
                                        </div>
                                    </div>
                                    {req.status === 'LIBERADO' && (
                                        <div className="mt-2 bg-green-50 text-green-700 text-xs p-2 rounded flex items-center gap-1 font-bold animate-pulse">
                                            <Camera size={12}/> Enviar Cupom Agora
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal Detalhes */}
            {selectedRequest && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
                    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <h3 className="font-bold text-xl text-gray-900">Solicitação #{selectedRequest.id}</h3>
                            <button onClick={() => setSelectedRequest(null)} className="p-2 bg-gray-100 rounded-full"><XCircle size={24}/></button>
                        </div>
                        
                        {selectedRequest.status === 'LIBERADO' ? (
                            <div className="text-center space-y-4">
                                <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                                    <CheckCircle size={32} className="text-green-600" />
                                </div>
                                <h4 className="font-bold text-green-800 text-lg">Aprovado! Envie o Cupom.</h4>
                                
                                <div onClick={() => cupomInputRef.current.click()} className="border-2 border-dashed border-green-300 rounded-xl p-6 bg-green-50 cursor-pointer relative h-40 flex items-center justify-center">
                                    {cupomPreview ? <img src={cupomPreview} className="absolute inset-0 w-full h-full object-cover rounded-xl"/> : <div className="text-green-600 font-bold flex flex-col items-center"><Camera size={24}/> Tocar p/ Foto</div>}
                                    <input type="file" ref={cupomInputRef} className="hidden" accept="image/*" capture="environment" onChange={(e) => handleFileChange(e, 'cupom')}/>
                                </div>
                                <button onClick={() => handleSendCupom(selectedRequest.id)} disabled={!cupomFile || loading} className="w-full py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg">
                                    {loading ? <Loader className="animate-spin inline"/> : "ENVIAR COMPROVANTE"}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3 text-sm">
                                <div className="bg-gray-50 p-3 rounded-xl border">
                                    <p className="font-bold text-gray-500 text-xs uppercase">Status</p>
                                    <p className="font-bold text-gray-900">{selectedRequest.status}</p>
                                    {selectedRequest.motivo_negativa && <p className="text-red-600 mt-1 text-xs">{selectedRequest.motivo_negativa}</p>}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SolicitacaoAbastecimentoPage;