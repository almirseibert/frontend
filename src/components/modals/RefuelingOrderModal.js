import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader, AlertTriangle, Info, Send, Lock, FileText, Wallet, Edit, Clock, Activity, TrendingUp } from 'lucide-react';

const RefuelingOrderModal = ({
    user,
    orderToEdit,
    vehicles = [],
    obras = [],
    partners = [],
    employees = [],
    refuelings = [], 
    expenses = [], 
    onClose,
    setAlertMessage,
    onGeneratePDF,
    extraObraOptions = [],
    ConfirmationModal,
    PasswordConfirmationModal,
    vehicleGroups = {},
    apiClient,
    reloadData
}) => {
    
    // --- HELPER DE DATA ---
    const isValidDbDate = (dateString) => {
        if (!dateString) return false;
        const str = String(dateString);
        return str.length > 5 && !str.startsWith('0000') && str !== '1970-01-01T00:00:00.000Z';
    };

    const getSafeDateObj = (dateInput) => {
        if (!isValidDbDate(dateInput)) return new Date(0);
        try {
            let dateStr = String(dateInput);
            if (dateStr.includes(' ') && !dateStr.includes('T')) dateStr = dateStr.replace(' ', 'T');
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? new Date(0) : d;
        } catch { return new Date(0); }
    };

    const formatDateDisplay = (dateInput) => {
        if (!isValidDbDate(dateInput)) return 'N/A';
        try {
            let dateStr = String(dateInput);
            if (dateStr.includes(' ') && !dateStr.includes('T')) dateStr = dateStr.replace(' ', 'T');
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return 'Data Inválida';
            return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()).toLocaleDateString('pt-BR');
        } catch { return 'Erro'; }
    };

    // --- ESTADOS ---
    const [formData, setFormData] = useState({
        vehicleId: orderToEdit?.vehicleId || '',
        partnerId: orderToEdit?.partnerId || '',
        obraId: orderToEdit?.obraId || '',
        employeeId: orderToEdit?.employeeId || '',
        date: orderToEdit?.date 
            ? getSafeDateObj(orderToEdit.date).toISOString().split('T')[0] 
            : new Date().toISOString().split('T')[0],
        odometro: orderToEdit?.odometro?.toString() || '',
        horimetro: orderToEdit?.horimetro?.toString() || '',
        horimetroDigital: orderToEdit?.horimetroDigital?.toString() || '',
        horimetroAnalogico: orderToEdit?.horimetroAnalogico?.toString() || '',
        isFillUp: orderToEdit?.isFillUp || false,
        litrosLiberados: orderToEdit?.litrosLiberados?.toString() || '',
        fuelType: orderToEdit?.fuelType || '',
        needsArla: orderToEdit?.needsArla || false,
        isFillUpArla: orderToEdit?.isFillUpArla || false,
        litrosLiberadosArla: orderToEdit?.litrosLiberadosArla?.toString() || '',
        outros: orderToEdit?.outros || '',
        outrosGeraValor: orderToEdit?.outrosGeraValor || false,
        outrosValor: orderToEdit?.outrosValor?.toString() || '',
    });

    const [isSaving, setIsSaving] = useState(false);
    const [blockReason, setBlockReason] = useState(null); 
    const [budgetWarning, setBudgetWarning] = useState(null);
    const [requiresBudgetOverride, setRequiresBudgetOverride] = useState(false);
    
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordAction, setPasswordAction] = useState(null); 
    
    const [warnings, setWarnings] = useState([]); 
    const [lastRefuelData, setLastRefuelData] = useState(null);
    const [lastAverage, setLastAverage] = useState(null); 
    const [noHorimetroWarning, setNoHorimetroWarning] = useState('');
    const [isNoHorimetroConfirmVisible, setIsNoHorimetroConfirmVisible] = useState(false);
    
    // --- NOVO: Estado para Progresso Financeiro ---
    const [obraStatus, setObraStatus] = useState(null);

    const isEditing = !!orderToEdit && !!orderToEdit.id && orderToEdit.id !== 'PREVIEW';

    // --- CÁLCULO DE PROGRESSO FINANCEIRO ---
    useEffect(() => {
        if (formData.obraId && obras.length > 0) { 
            const obra = obras.find(o => o.id === formData.obraId);
            
            if (!obra || (extraObraOptions && extraObraOptions.includes(formData.obraId))) {
                setObraStatus(null);
                return;
            }

            const totalFuelExpenses = expenses
                .filter(e => e.obraId === formData.obraId && (e.category === 'Combustível' || e.fuelType))
                .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

            const valorTotalObra = parseFloat(obra.valorTotalContrato || obra.valorContrato || 0);
            
            if (valorTotalObra > 0) {
                const percentual = (totalFuelExpenses / valorTotalObra) * 100;
                setObraStatus({
                    totalGasto: totalFuelExpenses,
                    valorContrato: valorTotalObra,
                    percentual: percentual
                });
            } else {
                setObraStatus(null);
            }
        } else {
            setObraStatus(null);
        }
    }, [formData.obraId, obras, expenses, extraObraOptions]);


    const sortedVehicles = useMemo(() => [...vehicles].sort((a,b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);
    const sortedEmployees = useMemo(() => [...employees].sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [employees]);
    const sortedPartners = useMemo(() => [...partners].sort((a,b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '')), [partners]);
    const sortedObras = useMemo(() => [...obras].filter(o => o.status === 'ativa').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);

    const vehicleGroup = useMemo(() => {
        if (!formData.vehicleId) return null;
        const vehicle = vehicles.find(v => v.id === formData.vehicleId);
        if (!vehicle) return null;
        return Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
    }, [formData.vehicleId, vehicles, vehicleGroups]);

    const isKmVehicle = vehicleGroup === 'Veículos Leves' || vehicleGroup === 'Caminhões de Trecho';
    const isHeavyMachinery = vehicleGroup === 'Máquinas Pesadas';
    const isTruck = vehicleGroup === 'Caminhões';

    useEffect(() => {
        if (formData.vehicleId) {
            const vehicle = vehicles.find(v => v.id === formData.vehicleId);
            if (!vehicle) return;

            const history = refuelings
                .filter(r => r.vehicleId === formData.vehicleId && r.status === 'Concluída')
                .sort((a,b) => {
                    const dateA = a.data || a.date;
                    const dateB = b.data || b.date;
                    return getSafeDateObj(dateB).getTime() - getSafeDateObj(dateA).getTime();
                });
            
            const last = history[0];
            setLastRefuelData(last);

            if (!isEditing) {
                let autoEmployeeId = formData.employeeId;
                let autoObraId = formData.obraId;

                if (vehicle.obraAtualId) {
                    const obra = obras.find(o => o.id === vehicle.obraAtualId);
                    if (obra && obra.status === 'ativa') {
                        autoObraId = vehicle.obraAtualId;
                        const alocacao = obra?.historicoVeiculos?.find(h => h.veiculoId === vehicle.id && !h.dataSaida);
                        if (alocacao?.employeeId) autoEmployeeId = alocacao.employeeId;
                    }
                }
                
                let autoPartnerId = formData.partnerId;
                let autoFuelType = formData.fuelType;
                let autoLitros = formData.litrosLiberados;

                if (last) {
                    autoPartnerId = last.partnerId || '';
                    autoFuelType = last.fuelType || '';
                    autoLitros = last.litrosAbastecidos ? last.litrosAbastecidos.toString() : '';
                }

                setFormData(prev => ({
                    ...prev,
                    employeeId: autoEmployeeId || prev.employeeId,
                    obraId: autoObraId || prev.obraId,
                    partnerId: autoPartnerId || prev.partnerId,
                    fuelType: autoFuelType || prev.fuelType,
                    litrosLiberados: autoLitros || prev.litrosLiberados,
                    odometro: prev.odometro || vehicle.odometro?.toString() || '',
                    horimetro: prev.horimetro || vehicle.horimetro?.toString() || '',
                    horimetroDigital: prev.horimetroDigital || vehicle.horimetroDigital?.toString() || '',
                    horimetroAnalogico: prev.horimetroAnalogico || vehicle.horimetroAnalogico?.toString() || ''
                }));
            }

            const newWarnings = [];
            if (vehicle.naoPodeCircular) newWarnings.push("⚠️ 'NÃO PODE CIRCULAR'");
            if (vehicle.status === 'manutencao') newWarnings.push("🔧 Em manutenção.");
            if (vehicle.possuiAviso) newWarnings.push(`📄 ${vehicle.avisoTexto}`);
            setWarnings(newWarnings);

            if (last && history[1]) {
                const prev = history[1];
                const litros = parseFloat(last.litrosAbastecidos || 0);
                let diff = 0;
                let unit = 'Km/L';

                if (isHeavyMachinery || (isTruck && vehicle.mediaCalculo === 'horimetro')) {
                    const lastHr = parseFloat(last.horimetroDigital || last.horimetro || last.odometro || 0); 
                    const prevHr = parseFloat(prev.horimetroDigital || prev.horimetro || prev.odometro || 0);
                    diff = lastHr - prevHr;
                    unit = 'L/Hr';
                } else {
                    const lastKm = parseFloat(last.odometro || 0);
                    const prevKm = parseFloat(prev.odometro || 0);
                    diff = lastKm - prevKm;
                }

                if (diff > 0 && litros > 0) {
                    const avg = unit === 'Km/L' ? (diff / litros) : (liters / diff);
                    setLastAverage(`${avg.toFixed(2)} ${unit}`);
                } else {
                    setLastAverage('Incalculável');
                }
            } else {
                setLastAverage(null);
            }
        }
    }, [formData.vehicleId, vehicles, obras, refuelings, isEditing, isHeavyMachinery, isTruck]);

    useEffect(() => {
        if (!lastRefuelData) {
            setBlockReason(null);
            return;
        }

        let reason = null;
        
        if (isKmVehicle && formData.odometro) {
            const current = parseFloat(formData.odometro);
            const last = parseFloat(lastRefuelData.odometro || 0);
            
            if (current <= last) reason = `Odômetro (${current}) <= anterior (${last}).`;
            else if (current - last > 1000) reason = `Salto excessivo de Km (> 1000).`;
        }

        if ((isTruck || isHeavyMachinery)) {
            const currentVal = formData.horimetroDigital || formData.horimetro || formData.horimetroAnalogico;
            
            if (currentVal) {
                const current = parseFloat(currentVal);
                const last = parseFloat(lastRefuelData.horimetroDigital || lastRefuelData.horimetro || lastRefuelData.odometro || 0);
                
                if (last > 0) {
                    if (current <= last) reason = `Horímetro (${current}) <= anterior (${last}).`;
                    else if ((current - last) > 50) reason = `Salto excessivo de Hr (> 50).`;
                }
            }
        }

        setBlockReason(reason);
    }, [formData.odometro, formData.horimetro, formData.horimetroDigital, formData.horimetroAnalogico, lastRefuelData, isKmVehicle, isTruck, isHeavyMachinery]);

    useEffect(() => {
        if (formData.obraId && obras.length > 0) {
            const obra = obras.find(o => o.id === formData.obraId);
            if (!obra || extraObraOptions.includes(formData.obraId)) {
                setBudgetWarning(null);
                setRequiresBudgetOverride(false);
                return;
            }

            if (!obra.valorContrato || obra.valorContrato <= 0) {
                setBudgetWarning(null);
                setRequiresBudgetOverride(false);
                return;
            }

            const totalFuelExpenses = expenses
                .filter(e => e.obraId === formData.obraId && e.category === 'Combustível')
                .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

            const limit = obra.valorContrato * 0.20; 
            
            if (totalFuelExpenses >= limit) {
                setBudgetWarning(`Combustível atingiu 20% do contrato.`);
                setRequiresBudgetOverride(true);
            } else {
                setBudgetWarning(null);
                setRequiresBudgetOverride(false);
            }
        } else {
            setBudgetWarning(null);
            setRequiresBudgetOverride(false);
        }
    }, [formData.obraId, obras, expenses, extraObraOptions]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        if (name === 'isFillUp' && checked) setFormData(prev => ({ ...prev, litrosLiberados: '' }));
    };

    const sendToWhatsApp = async (orderData) => {
        const vehicle = vehicles.find(v => v.id === formData.vehicleId);
        const partner = partners.find(p => p.id === formData.partnerId);
        const employee = employees.find(e => e.id === formData.employeeId);
        
        const finalData = orderData || {
            ...formData,
            id: orderToEdit?.id || 'PREVIEW',
            authNumber: orderToEdit?.authNumber || 'NOVA',
        };

        const pdfData = {
            ...finalData,
            partnerName: partner?.razaoSocial,
            employeeName: employee?.nome,
        };
        
        onGeneratePDF(pdfData, vehicles, partners, employees, vehicleGroups);

        const phone = partner?.whatsapp || partner?.telefone;

        if (!phone) {
            setAlertMessage("Salvo! Posto sem WhatsApp cadastrado.");
            return;
        }

        const msg = 
`*⛽ ORDEM DE ABASTECIMENTO - FROTAS MAK*
*Segue em anexo o arquivo PDF da autorização.*

*Veículo:* ${vehicle?.placa || ''} (${vehicle?.registroInterno})
*Motorista:* ${employees.find(e => e.id === formData.employeeId)?.nome || 'N/A'}
*Combustível:* ${formData.fuelType === 'dieselS10' ? 'Diesel S10' : formData.fuelType.toUpperCase()}
*Qtd:* ${formData.isFillUp ? 'COMPLETAR TANQUE' : formData.litrosLiberados + ' Litros'}

_Por favor, confirme o recebimento._`;

        setTimeout(() => {
            window.open(`https://wa.me/55${phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
        }, 1000);
    };

    const validateMandatoryFields = () => {
        if (!formData.vehicleId) return "Selecione um Veículo.";
        if (!formData.employeeId) return "Selecione um Motorista.";
        if (!formData.obraId) return "Selecione uma Obra.";
        if (!formData.partnerId) return "Selecione um Posto.";
        if (!formData.fuelType) return "Selecione o Combustível.";
        if (isKmVehicle && !formData.odometro) return "Informe o Odômetro.";
        if (isTruck && !formData.horimetro) return "Informe o Horímetro.";
        if (isHeavyMachinery && (!formData.horimetroDigital && !formData.horimetroAnalogico)) return "Informe Horímetro.";
        return null;
    };

    const handleSaveClick = (e) => {
        if(e) e.preventDefault();
        const validationError = validateMandatoryFields();
        if (validationError) {
            setAlertMessage(validationError);
            return;
        }
        if (blockReason) {
            setPasswordAction('blockOverride');
            setShowPasswordModal(true);
            return;
        }
        if (requiresBudgetOverride) {
            setPasswordAction('budgetOverride');
            setShowPasswordModal(true);
            return;
        }
        executeSave();
    };

    const executeSave = async () => {
        setIsSaving(true);
        setIsNoHorimetroConfirmVisible(false);
        setShowPasswordModal(false);

        const safeFloat = (val) => {
            const num = parseFloat(val);
            return isNaN(num) ? null : num;
        };

        let isoDate = new Date().toISOString();
        if (formData.date) {
            try {
                 const dateObj = new Date(formData.date + 'T12:00:00Z');
                 if (!isNaN(dateObj.getTime())) isoDate = dateObj.toISOString();
            } catch (e) {}
        }

        const selectedPartner = partners.find(p => p.id === formData.partnerId);

        const payload = {
            ...formData,
            partnerName: selectedPartner ? selectedPartner.razaoSocial : null,
            odometro: safeFloat(formData.odometro),
            horimetro: safeFloat(formData.horimetro),
            horimetroDigital: safeFloat(formData.horimetroDigital),
            horimetroAnalogico: safeFloat(formData.horimetroAnalogico),
            litrosLiberados: safeFloat(formData.litrosLiberados) || 0,
            litrosLiberadosArla: safeFloat(formData.litrosLiberadosArla) || 0,
            outrosValor: safeFloat(formData.outrosValor) || 0,
            date: isoDate,
            createdBy: user 
        };

        try {
            let res;
            const hasValidId = orderToEdit && orderToEdit.id && orderToEdit.id !== 'PREVIEW';
            
            if (isEditing && hasValidId) {
                res = await apiClient.updateRefuelingOrder(orderToEdit.id, payload);
                setAlertMessage(`Ordem atualizada!`);
            } else {
                res = await apiClient.createRefuelingOrder(payload);
                setAlertMessage(`Ordem Nº ${res.authNumber} emitida!`);
            }
            reloadData();
            
            if (res) {
                 const fullOrderData = {
                    ...payload,
                    id: res.id || orderToEdit?.id,
                    authNumber: res.authNumber || orderToEdit?.authNumber,
                 };
                 sendToWhatsApp(fullOrderData);
            }
            onClose();
        } catch (error) {
            console.error(error);
            setAlertMessage("Erro ao salvar: " + (error.response?.data?.error || error.message));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-2 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden">
                <div className="p-3 border-b flex justify-between items-center bg-gray-50 rounded-t-xl shrink-0">
                    <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                        {isEditing ? <Edit size={16}/> : <FileText size={16}/>}
                        {isEditing ? 'Editar' : 'Emitir'} Ordem
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition"><X size={18}/></button>
                </div>

                <div className="px-3 pt-2 space-y-1 flex-shrink-0">
                    {warnings.map((w, i) => (
                        <div key={i} className="flex items-center gap-1 p-1 bg-yellow-50 text-yellow-800 rounded border border-yellow-200 text-[10px] font-medium"><Info size={12}/> {w}</div>
                    ))}
                    
                    {blockReason && (
                        <div className="flex items-center gap-1 p-1.5 bg-red-100 text-red-800 rounded border border-red-200 text-[10px] font-bold animate-pulse">
                            <Lock size={12}/> {blockReason}
                        </div>
                    )}

                    {budgetWarning && (
                        <div className="flex items-center gap-1 p-1.5 bg-orange-100 text-orange-900 rounded border border-orange-200 text-[10px] font-bold">
                            <Wallet size={12}/> {budgetWarning} {requiresBudgetOverride && "(Requer Senha)"}
                        </div>
                    )}
                </div>

                <form onSubmit={handleSaveClick} className="p-3 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                        <div>
                            <label className="block font-bold text-gray-700 mb-0.5">Veículo *</label>
                            <select name="vehicleId" value={formData.vehicleId} onChange={e => setFormData(p => ({...p, vehicleId: e.target.value}))} className="w-full p-1 border border-gray-300 rounded focus:ring-1 focus:ring-yellow-400 outline-none" required>
                                <option value="">Selecione...</option>
                                {sortedVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa}</option>)}
                            </select>
                        </div>
                        
                        {/* CARD ÚLTIMO ABASTECIMENTO */}
                        {lastRefuelData && (
                            <div className="bg-gray-100 p-1.5 rounded border border-gray-200 text-[10px] text-gray-600 flex justify-between items-center">
                                <div>
                                    <div className="font-bold text-gray-700 mb-0.5 flex items-center gap-1"><Clock size={10}/> {formatDateDisplay(lastRefuelData.data || lastRefuelData.date)}</div>
                                    <p>{lastRefuelData.partnerName || 'N/A'} - {lastRefuelData.fuelType}</p>
                                    <div className="mt-0.5 pt-0.5 border-t border-gray-300">
                                        {isKmVehicle && <span>Ant: <strong>{lastRefuelData.odometro} Km</strong></span>}
                                        {isTruck && <span>Ant: <strong>{lastRefuelData.horimetro} Hr</strong></span>}
                                        {isHeavyMachinery && <span>Ant: <strong>{lastRefuelData.horimetroDigital} / {lastRefuelData.horimetroAnalogico}</strong></span>}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-gray-700 mb-0.5 flex items-center justify-end gap-1"><Activity size={10}/> Média</div>
                                    <p className="text-xs font-bold text-blue-600">{lastAverage || '--'}</p>
                                </div>
                            </div>
                        )}

                        <div className="bg-gray-50 p-2 rounded border border-gray-200">
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-1">Leituras Atuais</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {isKmVehicle && (
                                    <div className="col-span-2">
                                        <label className="block text-[10px] font-bold text-gray-700">Odômetro (Km) *</label>
                                        <input type="number" name="odometro" value={formData.odometro} onChange={handleChange} className="w-full p-1 border rounded" required/>
                                    </div>
                                )}
                                
                                {isTruck && (
                                    <div className="col-span-2">
                                        <label className="block text-[10px] font-bold text-gray-700">Horímetro Geral *</label>
                                        <input type="number" name="horimetro" value={formData.horimetro} onChange={handleChange} className="w-full p-1 border rounded" required/>
                                    </div>
                                )}

                                {isHeavyMachinery && (
                                    <>
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-700">Horí. Digital *</label>
                                            <input type="number" name="horimetroDigital" value={formData.horimetroDigital} onChange={handleChange} className="w-full p-1 border rounded"/>
                                        </div>
                                        <div>
                                            <label className="block text--[10px] font-bold text-gray-700">Horí. Analógico</label>
                                            <input type="number" name="horimetroAnalogico" value={formData.horimetroAnalogico} onChange={handleChange} className="w-full p-1 border rounded"/>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block font-bold text-gray-700 mb-0.5">Motorista *</label>
                            <select name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full p-1 border border-gray-300 rounded" required>
                                <option value="">Selecione...</option>
                                {sortedEmployees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2 col-span-2 sm:col-span-1">
                        <div>
                            <label className="block font-bold text-gray-700 mb-0.5">Obra / Alocação *</label>
                            <select name="obraId" value={formData.obraId} onChange={handleChange} className="w-full p-1 border border-gray-300 rounded" required>
                                <option value="">Selecione...</option>
                                <option value="Patio">Pátio</option>
                                {sortedObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                {extraObraOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>

                        {/* NOVO: PROGRESSO FINANCEIRO */}
                        {obraStatus && (
                            <div className="p-2 bg-blue-50 border border-blue-200 rounded text-[10px]">
                                <h4 className="font-bold text-blue-800 flex items-center gap-1 mb-1">
                                    <TrendingUp size={12}/> Progresso Financeiro
                                </h4>
                                <div className="flex justify-between text-blue-700">
                                    <span>Gasto Combustível:</span>
                                    <span>{obraStatus.totalGasto.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                                </div>
                                <div className="flex justify-between text-blue-700">
                                    <span>Contrato Total:</span>
                                    <span>{obraStatus.valorContrato.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                                </div>
                                <div className="mt-1 w-full bg-blue-200 rounded-full h-1.5">
                                    <div 
                                        className={`h-1.5 rounded-full ${obraStatus.percentual > 80 ? 'bg-red-500' : 'bg-blue-600'}`} 
                                        style={{width: `${Math.min(obraStatus.percentual, 100)}%`}}
                                    ></div>
                                </div>
                                <div className="text-right mt-0.5 text-blue-600 font-bold">
                                    {obraStatus.percentual.toFixed(1)}% utilizado
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block font-bold text-gray-700 mb-0.5">Posto *</label>
                            <select name="partnerId" value={formData.partnerId} onChange={handleChange} className="w-full p-1 border border-gray-300 rounded" required>
                                <option value="">Selecione...</option>
                                {sortedPartners.map(p => <option key={p.id} value={p.id}>{p.razaoSocial}</option>)}
                            </select>
                        </div>

                        <div className="bg-blue-50 p-2 rounded border border-blue-100">
                            <label className="block text-[10px] font-bold text-blue-900 mb-1">Combustível *</label>
                            <select name="fuelType" value={formData.fuelType} onChange={handleChange} className="w-full p-1 border border-blue-200 rounded mb-1 bg-white" required>
                                <option value="">Selecione...</option>
                                <option value="gasolinaComum">Gasolina Comum</option>
                                <option value="gasolinaAditivada">Gasolina Aditivada</option>
                                <option value="dieselS500">Diesel S500</option>
                                <option value="dieselS10">Diesel S10</option>
                            </select>
                            
                            <div className="flex items-center gap-1 mb-1">
                                <input type="checkbox" id="fill" name="isFillUp" checked={formData.isFillUp} onChange={handleChange} className="w-3 h-3 text-blue-600 rounded"/>
                                <label htmlFor="fill" className="text-[10px] font-medium text-blue-800">Completar Tanque</label>
                            </div>
                            {!formData.isFillUp && (
                                <input type="number" name="litrosLiberados" value={formData.litrosLiberados} onChange={handleChange} className="w-full p-1 border rounded" placeholder="Qtd. Litros"/>
                            )}

                            {formData.needsArla && (
                                <div className="mt-1 pt-1 border-t border-blue-200 pl-2">
                                     <input type="number" name="litrosLiberadosArla" value={formData.litrosLiberadosArla} onChange={handleChange} className="w-full p-1 border rounded text-[10px]" placeholder="Litros Arla"/>
                                </div>
                            )}
                             <div className="mt-1 flex items-center gap-1">
                                <input type="checkbox" id="arla" name="needsArla" checked={formData.needsArla} onChange={handleChange} className="w-3 h-3 text-blue-600 rounded"/>
                                <label htmlFor="arla" className="text-[10px] font-bold text-blue-900">Arla 32</label>
                            </div>
                        </div>

                         <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Data</label>
                                <input type="date" name="date" value={formData.date} onChange={handleChange} className="w-full p-1 border rounded"/>
                            </div>
                             <div>
                                <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Outros</label>
                                <input type="text" name="outros" value={formData.outros} onChange={handleChange} className="w-full p-1 border rounded" placeholder="Obs..."/>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <input type="checkbox" id="geraValor" name="outrosGeraValor" checked={formData.outrosGeraValor} onChange={handleChange} className="w-3 h-3 text-green-600"/>
                            <label htmlFor="geraValor" className="text-[10px] font-medium text-gray-700">Preenchimento Gera Valor</label>
                        </div>
                    </div>
                </form>

                <div className="p-3 border-t bg-gray-50 flex justify-end gap-2 rounded-b-lg flex-shrink-0">
                    <button onClick={onClose} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-200 rounded transition">Cancelar</button>
                    {blockReason || requiresBudgetOverride ? (
                        <button onClick={handleSaveClick} className="px-3 py-1.5 bg-red-500 text-white font-bold text-xs rounded shadow hover:bg-red-600 transition flex items-center gap-1">
                            <Lock size={12}/> Liberar
                        </button>
                    ) : (
                        <button onClick={handleSaveClick} disabled={isSaving} className="px-3 py-1.5 bg-yellow-400 text-gray-900 font-bold text-xs rounded shadow hover:bg-yellow-500 transition disabled:opacity-50 flex items-center gap-1">
                            {isSaving ? <Loader className="animate-spin" size={12}/> : 'Salvar & PDF'}
                        </button>
                    )}
                </div>
            </div>

            {isNoHorimetroConfirmVisible && (
                <ConfirmationModal 
                    title="Aviso" 
                    message={noHorimetroWarning} 
                    onConfirm={executeSave} 
                    onClose={() => setIsNoHorimetroConfirmVisible(false)}
                    confirmText="Salvar"
                    confirmColor="bg-red-600 hover:bg-red-700 text-white"
                />
            )}

            {showPasswordModal && (
                <PasswordConfirmationModal
                    message={passwordAction === 'blockOverride' ? `BLOQUEIO: ${blockReason}` : `BLOQUEIO FINANCEIRO: Orçamento excedido.`}
                    onConfirm={executeSave}
                    onClose={() => setShowPasswordModal(false)}
                    apiClient={apiClient}
                />
            )}
        </div>
    );
};

export default RefuelingOrderModal;