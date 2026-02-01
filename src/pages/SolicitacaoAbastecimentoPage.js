import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Camera, MapPin, Send, AlertTriangle, CheckCircle, Clock, 
    XCircle, ChevronRight, Fuel, Image as ImageIcon, Loader, 
    WifiOff, RefreshCw, Lock, LogOut, User, FileText, Droplet, 
    CalendarClock, Gauge
} from 'lucide-react';

// Importação das Regras Centralizadas
import { getVehicleMainReading, needsArla } from '../utils/vehicleRules';

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

    // Usa a lista interna se a prop vier vazia
    const effectiveEmployees = employees.length > 0 ? employees : internalEmployees;

    // --- HELPER: NORMALIZAÇÃO DE STRING ---
    const normalizeStr = (str) => {
        if (!str) return '';
        return str.toString()
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
            .replace(/\s+/g, ' ') 
            .trim();
    };

    // --- CARREGAMENTO DE DADOS ---
    useEffect(() => {
        if (user) {
            checkUserStatus();
            fetchMyRequests();
        }
    }, [user]); 

    // --- LÓGICA DE IDENTIFICAÇÃO DO FUNCIONÁRIO ---
    const myEmployeeId = useMemo(() => {
        if (!user) return null;
        
        if (user.employeeId) return user.employeeId;
        if (user.employee_id) return user.employee_id;

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

        if (obras.length > 0 && normalizedUserName) {
            for (const obra of obras) {
                if (obra.historicoVeiculos && Array.isArray(obra.historicoVeiculos)) {
                    const match = obra.historicoVeiculos.find(h => 
                        !h.dataSaida && 
                        (normalizeStr(h.employeeName || h.nome_funcionario) === normalizedUserName)
                    );
                    
                    if (match && match.employeeId) {
                        return match.employeeId;
                    }
                }
            }
        }

        return null;
    }, [user, effectiveEmployees, obras]);

    // --- LÓGICA DE FILTRAGEM ---
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
        
        if (!selectedObra || !selectedObra.historicoVeiculos) {
            return { filteredVehicles: [], filteredEmployees: [] };
        }

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

        if (funcionariosDaObra.length < activeEmployeesIds.size) {
            const existingIds = new Set(funcionariosDaObra.map(f => String(f.id)));
            selectedObra.historicoVeiculos.forEach(h => {
                const empId = String(h.employeeId);
                const empName = h.employeeName || h.nome_funcionario;
                if (!h.dataSaida && empId && !existingIds.has(empId) && empId !== 'null' && empId !== 'undefined') {
                    funcionariosDaObra.push({
                        id: empId,
                        nome: empName || 'Funcionário (Sem Nome)'
                    });
                    existingIds.add(empId);
                }
            });
        }

        funcionariosDaObra.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

        return { filteredVehicles: veiculosDaObra, filteredEmployees: funcionariosDaObra };

    }, [formData.obraId, obras, vehicles, effectiveEmployees]);

    // --- EFEITOS DE SISTEMA ---
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

    useEffect(() => {
        if (myEmployeeId && formData.obraId && !formData.funcionarioId) {
            const myself = filteredEmployees.some(e => String(e.id) === String(myEmployeeId));
            if (myself || filteredEmployees.length === 0) {
                setFormData(prev => ({ ...prev, funcionarioId: myEmployeeId }));
            }
        }
    }, [myEmployeeId, filteredEmployees, formData.obraId]);

    const veiculoSelecionado = useMemo(() => {
        return vehicles.find(v => String(v.id) === String(formData.veiculoId));
    }, [formData.veiculoId, vehicles]);

    useEffect(() => {
        if (veiculoSelecionado) {
            setFormData(prev => ({ ...prev, odometro: '', horimetro: '' }));
            let lastPartnerId = null;
            const lastReq = myRequests.find(r => 
                String(r.veiculo_id) === String(veiculoSelecionado.id) && 
                (r.status === 'CONCLUIDO' || r.status === 'LIBERADO')
            );
            if (lastReq && lastReq.posto_id) {
                lastPartnerId = lastReq.posto_id;
            } else {
                lastPartnerId = veiculoSelecionado.lastPartnerId;
            }
            if (lastPartnerId) {
                setFormData(prev => ({ ...prev, postoId: lastPartnerId }));
            }
        }
    }, [veiculoSelecionado, myRequests]);

    const readingType = useMemo(() => getVehicleMainReading(veiculoSelecionado), [veiculoSelecionado]);
    const showArlaSection = useMemo(() => needsArla(veiculoSelecionado), [veiculoSelecionado]);
    const recentRefuelAlert = useMemo(() => {
        if (!veiculoSelecionado || !veiculoSelecionado.ultimaDataAbastecimento) return false;
        const diffHours = (new Date() - new Date(veiculoSelecionado.ultimaDataAbastecimento)) / (1000 * 60 * 60);
        return diffHours < 24;
    }, [veiculoSelecionado]);

    // --- API & HELPERS ---

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
                    setGpsError(false);
                    setFormData(prev => ({
                        ...prev,
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    }));
                },
                (error) => {
                    console.log("GPS não obtido (permissão negada ou erro):", error.message);
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

    // --- FUNÇÃO CORRIGIDA DE ENVIO ---
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

        // Validação de Campos Obrigatórios Básicos
        if (!formData.veiculoId || !formData.tipoCombustivel || !formData.postoId || !formData.obraId || !formData.funcionarioId) {
            setAlertMessage("Preencha todos os campos obrigatórios (incluindo o condutor).");
            return;
        }

        // Validação da Leitura (Odômetro vs Horímetro)
        if (readingType === 'odometro' && !formData.odometro) {
            setAlertMessage("É obrigatório informar o HODÔMETRO (Km).");
            return;
        }
        if (readingType === 'horimetro' && !formData.horimetro) {
            setAlertMessage("É obrigatório informar o HORÍMETRO (Hr).");
            return;
        }

        // Validação de Litragem (Se não for tanque cheio, tem que ter valor)
        if (!formData.flagTanqueCheio && (!formData.litragem || parseFloat(formData.litragem.toString().replace(',', '.')) <= 0)) {
            setAlertMessage("Informe a litragem ou marque Tanque Cheio.");
            return;
        }

        setLoading(true);

        const payload = new FormData();

        // --- Mapeamento para Snake Case e Tratamento de Tipos ---
        
        payload.append('veiculo_id', formData.veiculoId);
        payload.append('obra_id', formData.obraId);
        payload.append('posto_id', formData.postoId);
        payload.append('funcionario_id', formData.funcionarioId);
        payload.append('tipo_combustivel', formData.tipoCombustivel);

        // Booleanos
        payload.append('flag_tanque_cheio', formData.flagTanqueCheio ? '1' : '0');
        payload.append('flag_outros', formData.flagOutros ? '1' : '0');
        payload.append('descricao_outros', formData.descricaoOutros || '');

        // Litragem: Garante que seja numérico
        if (formData.flagTanqueCheio) {
            payload.append('litragem', '0');
        } else {
            // Substitui vírgula por ponto para garantir formato numérico padrão
            const litragemSanitized = formData.litragem ? formData.litragem.toString().replace(',', '.') : '0';
            payload.append('litragem', litragemSanitized);
        }

        // Leituras: Envia valor sanitizado APENAS para o tipo ativo. 
        // Envia vazio ('') para o inativo para evitar validações incorretas de "valor zerado" no backend.
        let odometroVal = '';
        let horimetroVal = '';

        if (readingType === 'odometro') {
            odometroVal = formData.odometro ? formData.odometro.toString().replace(',', '.') : '';
        } else if (readingType === 'horimetro') {
            horimetroVal = formData.horimetro ? formData.horimetro.toString().replace(',', '.') : '';
        }
        
        // Fallback: Se por algum motivo nada foi capturado mas o usuário digitou algo
        if (!odometroVal && !horimetroVal) {
             if (formData.odometro) odometroVal = formData.odometro.toString().replace(',', '.');
             if (formData.horimetro) horimetroVal = formData.horimetro.toString().replace(',', '.');
        }
        
        payload.append('odometro', odometroVal); 
        payload.append('horimetro', horimetroVal);

        // GPS: Garante '0' se nulo
        payload.append('latitude', formData.latitude ? formData.latitude.toString() : '0');
        payload.append('longitude', formData.longitude ? formData.longitude.toString() : '0');

        // Foto
        payload.append('foto_painel', rawImageFile);
        
        // Observação
        let obsFinal = formData.observacao || '';
        if (formData.needsArla) {
            obsFinal += ` [ARLA 32: ${formData.flagTanqueCheioArla ? 'Tanque Cheio' : (formData.litragemArla || '0') + ' L'}]`;
        }
        payload.append('observacao', obsFinal);

        // DEBUG
        console.log("--- Payload Envio (Corrigido) ---");
        for (let [key, value] of payload.entries()) {
             console.log(`${key}:`, value);
        }

        try {
            // CORREÇÃO CRÍTICA: Forçar Content-Type undefined remove headers padrões (ex: application/json)
            // permitindo que o browser defina o multipart/form-data boundary corretamente.
            await apiClient.post('/solicitacoes', payload, {
                headers: {
                    'Content-Type': undefined 
                }
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
            console.error("Erro no envio:", error);
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
            // Aplicando a mesma correção de header aqui também
            await apiClient.put(`/solicitacoes/${solicitacaoId}/comprovante`, payload, {
                headers: {
                    'Content-Type': undefined 
                }
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
                    
                    {gpsError && (
                        <div className="bg-gray-100 text-gray-600 p-2 rounded-lg flex items-center gap-2 text-xs border border-gray-200">
                            <MapPin size={14} className="text-gray-400" /> 
                            <span>Localização indisponível (Verifique permissões).</span>
                        </div>
                    )}

                    {allowedObras.length === 0 && (
                        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-sm">
                            <p className="font-bold flex items-center gap-2"><AlertTriangle size={18}/> Sem Obra Alocada</p>
                            <p className="text-sm mt-1">
                                Não encontramos obras vinculadas ao seu usuário neste momento.
                            </p>
                            <p className="text-xs mt-2 text-red-800">
                                <strong>Dica:</strong> Verifique se você está alocado em um veículo na obra ou peça para o gestor verificar sua alocação.
                            </p>
                            
                            <div className="mt-3 p-2 bg-red-50 rounded border border-red-200 text-[10px] font-mono text-red-600 break-all">
                                <p><strong>User:</strong> {user.name} ({user.id})</p>
                                <p><strong>EmpID Detectado:</strong> {myEmployeeId || 'NÃO ENCONTRADO'}</p>
                                <p><strong>Funcionários:</strong> {filteredEmployees.length} (Disponíveis)</p>
                                <p><strong>Obras Disponíveis:</strong> {obras.length}</p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Sua Obra</label>
                        <select 
                            className="w-full p-4 bg-white border border-gray-300 rounded-xl shadow-sm text-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                            value={formData.obraId}
                            onChange={e => setFormData({...formData, obraId: e.target.value, veiculoId: '', funcionarioId: ''})}
                            disabled={allowedObras.length === 0}
                        >
                            <option value="">Selecione a Obra...</option>
                            {allowedObras.map(o => (
                                <option key={o.id} value={o.id}>{o.nome}</option>
                            ))}
                        </select>
                    </div>

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

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Condutor/Responsável</label>
                        <select 
                            className="w-full p-3 bg-white border border-gray-300 rounded-xl shadow-sm text-base focus:ring-2 focus:ring-yellow-400 outline-none"
                            value={formData.funcionarioId}
                            onChange={e => setFormData({...formData, funcionarioId: e.target.value})}
                            disabled={!formData.obraId}
                        >
                            {formData.funcionarioId && filteredEmployees.length === 0 && (
                                <option value={formData.funcionarioId}>{user.name} (Auto-selecionado)</option>
                            )}
                            <option value="">Selecione quem está abastecendo...</option>
                            {filteredEmployees.map(e => (
                                <option key={e.id} value={e.id}>{e.nome}</option>
                            ))}
                        </select>
                    </div>

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
                            <div className="animate-fadeIn p-3 bg-red-50 border border-red-200 rounded-xl">
                                <label className="text-xs font-bold text-red-700 uppercase ml-1 flex justify-between items-center mb-1">
                                    <span className="flex items-center gap-1"><CalendarClock size={14}/> Horímetro (Hr)</span>
                                    <span className="bg-red-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">
                                        ATENÇÃO: NÃO USAR KM!
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
                                <p className="text-[10px] text-red-600 mt-1 font-semibold">
                                    Informe as horas de uso da máquina. Não informe a quilometragem.
                                </p>
                            </div>
                        )}
                    </div>

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