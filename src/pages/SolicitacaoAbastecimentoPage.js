import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Camera, MapPin, Send, AlertTriangle, CheckCircle, Clock, 
    XCircle, ChevronRight, Fuel, Image as ImageIcon, Loader, 
    WifiOff, RefreshCw, Lock, LogOut, FileText, Droplet, 
    CalendarClock, Gauge, Calendar as CalendarIcon, Ban
} from 'lucide-react';

// Importação das Regras Centralizadas
import { getVehicleMainReading, needsArla, checkVehicleRestrictions, checkConsumptionAlert } from '../utils/vehicleRules';

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
    const [gpsError, setGpsError] = useState(false);
    
    // Estado interno mantido para compatibilidade
    const [internalEmployees, setInternalEmployees] = useState([]);
    
    // --- DADOS ---
    const [myRequests, setMyRequests] = useState([]);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [blockIssues, setBlockIssues] = useState([]); // Problemas que BLOQUEIAM (Manutenção, Pedido Aberto)
    const [warningIssues, setWarningIssues] = useState([]); // Problemas de ALERTA (Docs vencendo, Média)

    // --- FORMULÁRIO ---
    // Helper Data Local
    const getNowLocal = () => {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        return now.toISOString().slice(0, 16);
    };

    const [formData, setFormData] = useState({
        veiculoId: '',
        obraId: '',
        postoId: '',
        funcionarioId: '', 
        dataAbastecimento: getNowLocal(), // Novo campo Data
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

    const effectiveEmployees = employees.length > 0 ? employees : internalEmployees;

    // --- HELPER: NORMALIZAÇÃO ---
    const normalizeStr = (str) => {
        if (!str) return '';
        return str.toString()
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
            .replace(/\s+/g, ' ') 
            .trim();
    };

    // --- EFEITOS INICIAIS ---
    useEffect(() => {
        if (user) {
            checkUserStatus();
            fetchMyRequests();
        }
    }, [user]); 

    // --- SELEÇÃO INTELIGENTE DE FUNCIONÁRIO ---
    const myEmployeeId = useMemo(() => {
        if (!user) return null;
        if (user.employeeId) return user.employeeId;
        const normalizedUserName = normalizeStr(user.name);
        const normalizedUserEmail = normalizeStr(user.email);

        if (effectiveEmployees.length > 0) {
            if (normalizedUserEmail) {
                const found = effectiveEmployees.find(e => normalizeStr(e.email) === normalizedUserEmail);
                if (found) return found.id;
            }
            if (normalizedUserName) {
                const found = effectiveEmployees.find(e => normalizeStr(e.nome) === normalizedUserName);
                if (found) return found.id;
            }
        }
        return null;
    }, [user, effectiveEmployees]);

    // --- FILTRAGEM DE OBRAS/VEÍCULOS ---
    const allowedObras = useMemo(() => {
        if (!myEmployeeId || !obras.length) return [];
        return obras.filter(obra => {
            if (!obra.historicoVeiculos || !Array.isArray(obra.historicoVeiculos)) return false;
            return obra.historicoVeiculos.some(h => 
                String(h.employeeId) === String(myEmployeeId) && !h.dataSaida
            );
        });
    }, [myEmployeeId, obras]);

    const { filteredVehicles, filteredEmployees } = useMemo(() => {
        if (!formData.obraId) return { filteredVehicles: [], filteredEmployees: [] };

        const selectedObra = obras.find(o => String(o.id) === String(formData.obraId));
        if (!selectedObra || !selectedObra.historicoVeiculos) return { filteredVehicles: [], filteredEmployees: [] };

        const activeVehiclesIds = new Set();
        const activeEmployeesIds = new Set();

        selectedObra.historicoVeiculos.forEach(h => {
            if (!h.dataSaida) { 
                if (h.veiculoId) activeVehiclesIds.add(String(h.veiculoId));
                if (h.employeeId) activeEmployeesIds.add(String(h.employeeId));
            }
        });

        const veiculosDaObra = vehicles
            .filter(v => activeVehiclesIds.has(String(v.id)))
            .sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || ''));

        let funcionariosDaObra = [];
        if (effectiveEmployees.length > 0) {
            funcionariosDaObra = effectiveEmployees
                .filter(e => activeEmployeesIds.has(String(e.id)))
                .map(e => ({ id: e.id, nome: e.nome }));
        }

        return { filteredVehicles: veiculosDaObra, filteredEmployees: funcionariosDaObra };

    }, [formData.obraId, obras, vehicles, effectiveEmployees]);

    // --- SYSTEM EFFECTS ---
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        getLocation();
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        if (allowedObras.length === 1 && !formData.obraId) {
            setFormData(prev => ({ ...prev, obraId: allowedObras[0].id }));
        }
    }, [allowedObras]);

    // --- REGRAS DE VEÍCULO SELECIONADO ---
    const veiculoSelecionado = useMemo(() => {
        return vehicles.find(v => String(v.id) === String(formData.veiculoId));
    }, [formData.veiculoId, vehicles]);

    useEffect(() => {
        setBlockIssues([]);
        setWarningIssues([]);

        if (veiculoSelecionado) {
            setFormData(prev => ({ ...prev, odometro: '', horimetro: '' }));
            
            // 1. Verificar Pedidos em Aberto (BLOQUEIO TOTAL)
            const activeRequest = myRequests.find(r => 
                String(r.veiculo_id) === String(veiculoSelecionado.id) && 
                (r.status === 'PENDENTE' || r.status === 'LIBERADO' || r.status === 'AGUARDANDO_BAIXA')
            );

            if (activeRequest) {
                setBlockIssues(prev => [...prev, {
                    title: 'PEDIDO EM ABERTO',
                    message: `Já existe um pedido aberto (#${activeRequest.id}) para este veículo. Finalize-o antes.`,
                    type: 'block'
                }]);
            }

            // 2. Verificar Regras do Veículo (VehicleRules.js)
            const rulesIssues = checkVehicleRestrictions(veiculoSelecionado);
            
            // Separar o que é bloqueio e o que é aviso
            const blocks = rulesIssues.filter(i => i.type === 'block' || i.type === 'error');
            const warns = rulesIssues.filter(i => i.type === 'warning');

            if (blocks.length > 0) {
                setBlockIssues(prev => [...prev, ...blocks]);
            }
            if (warns.length > 0) {
                setWarningIssues(warns);
            }

            // 3. Aviso de 24h (Warning)
            if (veiculoSelecionado.ultimaDataAbastecimento) {
                const diffHours = (new Date() - new Date(veiculoSelecionado.ultimaDataAbastecimento)) / (1000 * 60 * 60);
                if (diffHours < 24) {
                    setWarningIssues(prev => [...prev, {
                        title: 'ABASTECIDO HOJE',
                        message: 'Este veículo já foi abastecido nas últimas 24h. Verifique se é realmente necessário.',
                        type: 'warning'
                    }]);
                }
            }

            // Auto-Preencher Posto
            let lastPartnerId = null;
            const lastReq = myRequests.find(r => 
                String(r.veiculo_id) === String(veiculoSelecionado.id) && 
                (r.status === 'CONCLUIDO' || r.status === 'LIBERADO')
            );
            if (lastReq && lastReq.posto_id) lastPartnerId = lastReq.posto_id;
            else lastPartnerId = veiculoSelecionado.lastPartnerId;

            if (lastPartnerId) setFormData(prev => ({ ...prev, postoId: lastPartnerId }));
        }
    }, [veiculoSelecionado, myRequests]);

    const readingType = useMemo(() => getVehicleMainReading(veiculoSelecionado), [veiculoSelecionado]);
    const showArlaSection = useMemo(() => needsArla(veiculoSelecionado), [veiculoSelecionado]);
    
    // --- API & HELPERS ---
    const checkUserStatus = async () => {
        try {
            const res = await apiClient.get('/solicitacoes/meus-status'); 
            setUserStatus({
                blocked: res.bloqueado_abastecimento === 1,
                attempts: res.tentativas_falhas_abastecimento
            });
        } catch (error) {
            console.error(error);
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
                    setGpsError(false);
                    setFormData(prev => ({
                        ...prev,
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    }));
                },
                (error) => {
                    setGpsError(true);
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        } else {
            setGpsError(true);
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

        if (blockIssues.length > 0) {
            setAlertMessage("VEÍCULO BLOQUEADO. Resolva as pendências antes de continuar.");
            return;
        }

        if (!rawImageFile) {
            setAlertMessage("FOTO DO PAINEL É OBRIGATÓRIA!");
            return;
        }

        if (!formData.veiculoId || !formData.tipoCombustivel || !formData.postoId || !formData.obraId) {
            setAlertMessage("Preencha todos os campos obrigatórios.");
            return;
        }

        // Validação Leitura
        const valOdometro = parseFloat(formData.odometro);
        const valHorimetro = parseFloat(formData.horimetro);

        if (readingType === 'odometro' && (!valOdometro || valOdometro <= 0)) {
            setAlertMessage("HODÔMETRO INVÁLIDO. Digite apenas números.");
            return;
        }
        if (readingType === 'horimetro' && (!valHorimetro || valHorimetro <= 0)) {
            setAlertMessage("HORÍMETRO INVÁLIDO. Digite apenas números.");
            return;
        }

        // Validação Litragem
        if (!formData.flagTanqueCheio && (!formData.litragem || parseFloat(formData.litragem) <= 0)) {
            setAlertMessage("Informe a LITRAGEM ou marque TANQUE CHEIO.");
            return;
        }

        setLoading(true);
        const payload = new FormData();
        
        payload.append('veiculo_id', formData.veiculoId);
        payload.append('obra_id', formData.obraId);
        payload.append('posto_id', formData.postoId);
        payload.append('funcionario_id', formData.funcionarioId || user.id);
        payload.append('tipo_combustivel', formData.tipoCombustivel);
        payload.append('data_abastecimento', formData.dataAbastecimento);

        payload.append('flag_tanque_cheio', formData.flagTanqueCheio ? '1' : '0');
        payload.append('flag_outros', formData.flagOutros ? '1' : '0');
        payload.append('descricao_outros', formData.descricaoOutros || '');

        const litragemSanitized = formData.flagTanqueCheio ? '0' : (formData.litragem ? formData.litragem.toString().replace(',', '.') : '0');
        payload.append('litragem', litragemSanitized);

        const odometroVal = readingType === 'odometro' && formData.odometro ? formData.odometro.toString().replace(',', '.') : '0';
        const horimetroVal = readingType === 'horimetro' && formData.horimetro ? formData.horimetro.toString().replace(',', '.') : '0';
        payload.append('odometro', odometroVal); 
        payload.append('horimetro', horimetroVal);

        payload.append('latitude', formData.latitude || '0');
        payload.append('longitude', formData.longitude || '0');
        payload.append('foto_painel', rawImageFile);
        
        let obsFinal = formData.observacao || '';
        if (formData.needsArla) {
            obsFinal += ` [ARLA 32: ${formData.flagTanqueCheioArla ? 'Cheio' : (formData.litragemArla || '0') + ' L'}]`;
        }
        payload.append('observacao', obsFinal);

        try {
            await apiClient.post('/solicitacoes', payload, { headers: { 'Content-Type': undefined } });
            setAlertMessage("Solicitação enviada com sucesso!");
            
            setView('list');
            fetchMyRequests();
            setFormData(prev => ({
                ...prev,
                veiculoId: '', tipoCombustivel: '', litragem: '', flagTanqueCheio: false, 
                horimetro: '', odometro: '', observacao: '', 
                dataAbastecimento: getNowLocal()
            }));
            setPreviewImage(null);
            setRawImageFile(null);

        } catch (error) {
            const msg = error.response?.data?.error || error.message;
            setAlertMessage(`ERRO: ${msg}`);
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
            await apiClient.put(`/solicitacoes/${solicitacaoId}/comprovante`, payload, { headers: { 'Content-Type': undefined } });
            setAlertMessage("Comprovante enviado!");
            setCupomFile(null);
            setCupomPreview(null);
            setSelectedRequest(null);
            fetchMyRequests();
        } catch (error) {
            setAlertMessage("Erro: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    // --- RENDER ---
    if (!user) return <div className="flex justify-center items-center h-screen"><Loader className="animate-spin"/></div>;

    if (userStatus.blocked) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 p-6 text-center animate-fadeIn">
                <Lock size={64} className="text-red-600 mb-4 animate-pulse" />
                <h1 className="text-3xl font-bold text-red-700 mb-2">ACESSO BLOQUEADO</h1>
                <p className="text-gray-700 mb-4 text-lg">Muitos erros de preenchimento detectados.</p>
                <div className="bg-red-200 border-l-8 border-red-600 p-6 w-full max-w-md shadow-lg">
                    <p className="font-bold text-red-900 text-xl">CONTATE O GESTOR DE FROTAS.</p>
                </div>
                <button onClick={() => window.location.reload()} className="mt-8 px-8 py-3 bg-gray-900 text-white rounded-xl shadow-xl font-bold">Atualizar</button>
            </div>
        );
    }

    if (view === 'form') {
        return (
            <div className="min-h-screen bg-gray-50 pb-32 animate-slide-up">
                {/* Header */}
                <div className="bg-yellow-400 p-4 shadow-md sticky top-0 z-20 flex justify-between items-center">
                    <button onClick={() => setView('list')} className="p-2 bg-yellow-500 rounded-full text-white hover:bg-yellow-600 transition shadow">
                        <ChevronRight className="rotate-180" size={24} />
                    </button>
                    <h1 className="text-lg font-black text-gray-900 uppercase tracking-wide">Nova Solicitação</h1>
                    <div className="w-8"></div>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-6 max-w-lg mx-auto mt-2">
                    
                    {gpsError && (
                        <div className="bg-red-100 text-red-800 p-3 rounded-xl border-l-4 border-red-600 flex items-center gap-3 text-sm font-bold shadow-sm animate-pulse">
                            <MapPin size={24} className="text-red-600" /> 
                            <span>ATIVE SEU GPS AGORA!</span>
                        </div>
                    )}

                    {/* 1. Data do Abastecimento */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1 flex items-center gap-1">
                            <CalendarIcon size={14}/> Quando foi?
                        </label>
                        <input 
                            type="datetime-local"
                            className="w-full p-4 bg-white border border-gray-300 rounded-xl shadow-sm text-lg font-bold text-gray-800 focus:ring-2 focus:ring-yellow-400 outline-none"
                            value={formData.dataAbastecimento}
                            onChange={e => setFormData({...formData, dataAbastecimento: e.target.value})}
                        />
                    </div>

                    {/* 2. Seleção de Obra */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Obra</label>
                        <select 
                            className="w-full p-4 bg-white border border-gray-300 rounded-xl shadow-sm text-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                            value={formData.obraId}
                            onChange={e => setFormData({...formData, obraId: e.target.value, veiculoId: '', funcionarioId: ''})}
                        >
                            <option value="">Selecione...</option>
                            {allowedObras.map(o => (
                                <option key={o.id} value={o.id}>{o.nome}</option>
                            ))}
                        </select>
                    </div>

                    {/* 3. Seleção de Veículo com BLOQUEIO VISUAL */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Veículo</label>
                        <select 
                            className={`w-full p-4 border rounded-xl shadow-sm text-lg font-bold outline-none transition-colors ${blockIssues.length > 0 ? 'bg-red-50 border-red-500 text-red-900 animate-pulse' : 'bg-white border-gray-300 focus:ring-2 focus:ring-yellow-400'}`}
                            value={formData.veiculoId}
                            onChange={e => setFormData({...formData, veiculoId: e.target.value})}
                            disabled={!formData.obraId}
                        >
                            <option value="">Selecione...</option>
                            {filteredVehicles.map(v => (
                                <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa}</option>
                            ))}
                        </select>
                        
                        {/* ALERTAS DE BLOQUEIO (VERMELHO VIBRANTE) */}
                        {blockIssues.map((issue, idx) => (
                            <div key={idx} className="mt-4 bg-red-600 text-white p-4 rounded-xl shadow-lg animate-pulse flex items-start gap-3">
                                <Ban size={32} className="shrink-0" />
                                <div>
                                    <h4 className="font-black text-lg uppercase">{issue.title}</h4>
                                    <p className="font-bold text-sm leading-tight opacity-90">{issue.message}</p>
                                </div>
                            </div>
                        ))}

                        {/* ALERTAS DE AVISO (LARANJA) */}
                        {blockIssues.length === 0 && warningIssues.map((issue, idx) => (
                             <div key={idx} className="mt-2 bg-orange-100 border-l-8 border-orange-500 p-3 rounded-r-xl flex items-center gap-3 text-orange-900 text-sm font-bold shadow-sm">
                                <AlertTriangle size={20} className="text-orange-600"/> 
                                <div>
                                    <span className="block text-xs uppercase text-orange-600 mb-0.5">{issue.title}</span>
                                    <span>{issue.message}</span>
                                </div>
                             </div>
                        ))}
                    </div>

                    {/* FORMULÁRIO PRINCIPAL (SÓ APARECE SE NÃO HOUVER BLOQUEIOS) */}
                    {blockIssues.length === 0 && formData.veiculoId && (
                        <div className="space-y-6 animate-fadeIn">
                            
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Condutor</label>
                                <select 
                                    className="w-full p-3 bg-white border border-gray-300 rounded-xl shadow-sm"
                                    value={formData.funcionarioId}
                                    onChange={e => setFormData({...formData, funcionarioId: e.target.value})}
                                >
                                    <option value="">Selecione...</option>
                                    {filteredEmployees.map(e => (
                                        <option key={e.id} value={e.id}>{e.nome}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="p-5 bg-white border rounded-xl shadow-sm">
                                <div className="flex justify-between items-center mb-2">
                                    <label className={`text-sm font-bold uppercase flex items-center gap-2 ${readingType === 'horimetro' ? 'text-blue-600' : 'text-gray-700'}`}>
                                        {readingType === 'horimetro' ? <CalendarClock size={20}/> : <Gauge size={20}/>}
                                        {readingType === 'horimetro' ? 'HORÍMETRO (Horas)' : 'HODÔMETRO (Km)'}
                                    </label>
                                    <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono font-bold">
                                        Último: {readingType === 'horimetro' ? (veiculoSelecionado.horimetro || 0) : (veiculoSelecionado.odometro || 0)}
                                    </span>
                                </div>
                                
                                <input 
                                    type="number" 
                                    className={`w-full p-4 border-2 rounded-xl text-3xl font-black text-center outline-none focus:ring-4 transition-all ${(!formData.odometro && !formData.horimetro) ? 'border-red-200 bg-red-50 focus:ring-red-200 placeholder-red-300' : 'border-gray-200 focus:ring-blue-100'}`}
                                    placeholder={readingType === 'horimetro' ? "0000" : "000000"}
                                    value={readingType === 'horimetro' ? formData.horimetro : formData.odometro}
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (readingType === 'horimetro') setFormData({...formData, horimetro: val, odometro: ''});
                                        else setFormData({...formData, odometro: val, horimetro: ''});
                                    }}
                                />
                                <p className="text-xs text-red-500 font-bold mt-2 text-center">
                                    ⚠️ CUIDADO AO DIGITAR. Erros bloqueiam seu usuário.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase ml-1">FOTO DO PAINEL (Obrigatório)</label>
                                <div 
                                    onClick={() => fileInputRef.current.click()}
                                    className={`border-4 border-dashed rounded-xl p-6 h-48 flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden ${previewImage ? 'border-green-500 bg-green-50' : 'border-red-400 bg-red-50 hover:bg-red-100 animate-pulse'}`}
                                >
                                    {previewImage ? (
                                        <>
                                            <img src={previewImage} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-90" />
                                            <div className="absolute bottom-3 bg-white/90 px-4 py-1 rounded-full shadow-lg text-xs font-bold text-green-700 flex items-center gap-1">
                                                <CheckCircle size={14}/> Foto Ok
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center">
                                            <Camera size={48} className="text-red-500 mx-auto mb-2" />
                                            <span className="text-red-600 font-black text-lg block">TOCAR PARA FOTOGRAFAR</span>
                                            <span className="text-red-400 text-xs">Obrigatório foto nítida</span>
                                        </div>
                                    )}
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={(e) => handleFileChange(e, 'painel')} />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Posto</label>
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

                                <div className="bg-yellow-50 p-4 rounded-xl border-2 border-yellow-200">
                                    <div className="flex gap-2 mb-3">
                                        <div className="flex-1">
                                            <label className="text-xs font-bold text-yellow-800 uppercase mb-1 block">Combustível</label>
                                            <select 
                                                className="w-full p-3 border border-yellow-300 rounded-lg bg-white text-sm font-bold"
                                                value={formData.tipoCombustivel}
                                                onChange={e => setFormData({...formData, tipoCombustivel: e.target.value})}
                                            >
                                                <option value="">Tipo...</option>
                                                <option value="DIESEL S10">Diesel S10</option>
                                                <option value="DIESEL S500">Diesel S500</option>
                                                <option value="GASOLINA COMUM">Gasolina</option>
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1">
                                            <label className="text-xs font-bold text-yellow-800 uppercase mb-1 block">Litros</label>
                                            <input 
                                                type="number" 
                                                placeholder="0.00" 
                                                className="w-full p-3 border border-yellow-300 rounded-lg disabled:bg-gray-100 font-black text-xl"
                                                disabled={formData.flagTanqueCheio}
                                                value={formData.litragem}
                                                onChange={e => setFormData({...formData, litragem: e.target.value})}
                                            />
                                        </div>
                                        <div className="flex items-end h-full pb-1">
                                            <label className={`flex flex-col items-center justify-center w-20 h-16 border-2 rounded-lg cursor-pointer transition-all ${formData.flagTanqueCheio ? 'bg-yellow-400 border-yellow-600 text-black shadow-md transform scale-105' : 'bg-white border-yellow-300 text-gray-400'}`}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={formData.flagTanqueCheio}
                                                    onChange={e => setFormData({...formData, flagTanqueCheio: e.target.checked})}
                                                    className="hidden"
                                                />
                                                <Droplet size={24} className={formData.flagTanqueCheio ? "fill-current" : ""}/>
                                                <span className="text-[10px] font-bold mt-1">CHEIO</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {showArlaSection && (
                                <div className="border border-blue-200 bg-blue-50 p-3 rounded-xl">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={formData.needsArla}
                                            onChange={e => setFormData({...formData, needsArla: e.target.checked})}
                                            className="w-5 h-5 accent-blue-600"
                                        />
                                        <span className="text-blue-800 font-bold text-sm">Adicionar Arla 32</span>
                                    </label>
                                    
                                    {formData.needsArla && (
                                        <div className="mt-2 pl-8">
                                            <input 
                                                type="number" 
                                                placeholder="Quantidade Arla (Litros)" 
                                                className="w-full p-3 border border-blue-300 rounded-lg bg-white"
                                                value={formData.litragemArla}
                                                onChange={e => setFormData({...formData, litragemArla: e.target.value})}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            <textarea 
                                className="w-full p-3 bg-white border border-gray-300 rounded-xl text-sm shadow-inner"
                                rows="2"
                                placeholder="Observações..."
                                value={formData.observacao}
                                onChange={e => setFormData({...formData, observacao: e.target.value})}
                            ></textarea>

                            <button 
                                type="submit" 
                                disabled={loading || blockIssues.length > 0}
                                className="w-full py-4 bg-gray-900 text-white font-black text-lg rounded-xl shadow-xl hover:bg-gray-800 active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? <Loader className="animate-spin" /> : <><Send size={20} /> CONFIRMAR PEDIDO</>}
                            </button>
                        </div>
                    )}
                </form>
            </div>
        );
    }

    // Tela Padrão (Listagem)
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

            <div className="px-4 mt-4 space-y-3">
                <h2 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                    <Clock size={14} /> Histórico Recente
                </h2>
                
                {myRequests.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-300">
                        <p className="text-gray-400 text-sm">Nenhum pedido recente.</p>
                    </div>
                ) : (
                    myRequests.map(req => (
                        <div key={req.id} onClick={() => setSelectedRequest(req)} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md cursor-pointer relative overflow-hidden group">
                            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${req.status === 'LIBERADO' ? 'bg-green-500' : req.status === 'NEGADO' ? 'bg-red-500' : 'bg-yellow-400'}`}></div>
                            <div className="pl-3">
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${req.status === 'LIBERADO' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-600'}`}>
                                        {req.status}
                                    </span>
                                    <span className="text-xs text-gray-400 font-mono">
                                        {new Date(req.data_solicitacao).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="font-bold text-gray-800 text-lg">{req.placa}</p>
                                        <p className="text-xs text-gray-500 uppercase truncate max-w-[150px]">{req.veiculo_nome}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-gray-900 text-lg">{req.litragem_solicitada ? `${req.litragem_solicitada}` : 'Cheio'}<span className="text-xs text-gray-400 ml-0.5">L</span></p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {selectedRequest && (
                <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
                    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <h3 className="font-bold text-xl text-gray-900">Pedido #{selectedRequest.id}</h3>
                            <button onClick={() => setSelectedRequest(null)} className="p-2 bg-gray-100 rounded-full"><XCircle size={24}/></button>
                        </div>
                        
                        {selectedRequest.status === 'LIBERADO' ? (
                            <div className="text-center space-y-4">
                                <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto animate-bounce">
                                    <CheckCircle size={32} className="text-green-600" />
                                </div>
                                <h4 className="font-bold text-green-800 text-lg">Aprovado! Envie o Cupom.</h4>
                                <div onClick={() => cupomInputRef.current.click()} className="border-4 border-dashed border-green-300 rounded-xl p-6 bg-green-50 cursor-pointer relative h-40 flex items-center justify-center hover:bg-green-100 transition">
                                    {cupomPreview ? <img src={cupomPreview} className="absolute inset-0 w-full h-full object-cover rounded-xl"/> : <div className="text-green-600 font-bold flex flex-col items-center"><Camera size={32} className="mb-2"/> Tocar para Foto</div>}
                                    <input type="file" ref={cupomInputRef} className="hidden" accept="image/*" capture="environment" onChange={(e) => handleFileChange(e, 'cupom')}/>
                                </div>
                                <button onClick={() => handleSendCupom(selectedRequest.id)} disabled={!cupomFile || loading} className="w-full py-4 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition">
                                    {loading ? <Loader className="animate-spin inline"/> : "ENVIAR FOTO DO CUPOM"}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className={`p-4 rounded-xl border-l-4 ${selectedRequest.status === 'NEGADO' ? 'bg-red-50 border-red-500' : 'bg-gray-50 border-gray-400'}`}>
                                    <p className="font-bold text-xs uppercase text-gray-500 mb-1">Status Atual</p>
                                    <p className="font-black text-xl text-gray-800">{selectedRequest.status}</p>
                                    {selectedRequest.motivo_negativa && (
                                        <div className="mt-2 text-red-700 bg-red-100 p-2 rounded text-sm font-medium">
                                            Motivo: {selectedRequest.motivo_negativa}
                                        </div>
                                    )}
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