import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader, AlertTriangle, Info, Send, Lock, FileText, Wallet, Edit, Clock, Activity } from 'lucide-react';

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
    
    // --- HELPER: Tratamento de Datas (Corrige Invalid Date e Evita Crash) ---
    const safeDate = (dateInput) => {
        if (!dateInput) return new Date(); // Fallback para hoje se nulo (Melhor que epoch 1970 para UX)
        try {
            if (dateInput instanceof Date) {
                return isNaN(dateInput.getTime()) ? new Date() : dateInput;
            }
            // Se for string SQL (YYYY-MM-DD HH:MM:SS), converte para ISO
            // Garante que string seja tratada
            const dateStr = String(dateInput).replace(' ', 'T');
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? new Date() : d;
        } catch {
            return new Date();
        }
    };

    const formatDateDisplay = (dateInput) => {
        if (!dateInput) return 'N/A';
        const d = safeDate(dateInput);
        return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    };

    // --- ESTADOS ---
    const [formData, setFormData] = useState({
        vehicleId: orderToEdit?.vehicleId || '',
        partnerId: orderToEdit?.partnerId || '',
        obraId: orderToEdit?.obraId || '',
        employeeId: orderToEdit?.employeeId || '',
        date: orderToEdit?.date 
            ? safeDate(orderToEdit.date).toISOString().split('T')[0] 
            : new Date().toISOString().split('T')[0],
        odometro: orderToEdit?.odometro?.toString() || '',
        horimetro: orderToEdit?.horimetro?.toString() || '',
        horimetroDigital: orderToEdit?.horimetroDigital?.toString() || '',
        horimetroAnalogico: orderToEdit?.horimetroAnalogico?.toString() || '',
        isFillUp: !!orderToEdit?.isFillUp,
        litrosLiberados: orderToEdit?.litrosLiberados?.toString() || '',
        fuelType: orderToEdit?.fuelType || '',
        needsArla: !!orderToEdit?.needsArla,
        isFillUpArla: !!orderToEdit?.isFillUpArla,
        litrosLiberadosArla: orderToEdit?.litrosLiberadosArla?.toString() || '',
        outros: orderToEdit?.outros || '',
        outrosGeraValor: !!orderToEdit?.outrosGeraValor,
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

    const isEditing = !!orderToEdit;

    // --- ORDENAÇÃO ---
    const sortedVehicles = useMemo(() => [...vehicles].sort((a,b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);
    const sortedEmployees = useMemo(() => [...employees].sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [employees]);
    const sortedPartners = useMemo(() => [...partners].sort((a,b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '')), [partners]);
    const sortedObras = useMemo(() => [...obras].filter(o => o.status === 'ativa').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);

    // --- REGRAS DE GRUPO ---
    const vehicleGroup = useMemo(() => {
        if (!formData.vehicleId) return null;
        const vehicle = vehicles.find(v => v.id === formData.vehicleId);
        if (!vehicle) return null;
        return Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
    }, [formData.vehicleId, vehicles, vehicleGroups]);

    const isHeavyMachinery = vehicleGroup === 'Máquinas Pesadas';
    const isTruck = vehicleGroup === 'Caminhões';
    // Se não for Maquina nem Caminhão, assume Km (Leve ou Trecho ou Indefinido)
    const isKmVehicle = !isHeavyMachinery && !isTruck; 

    // --- AUTO-PREENCHIMENTO E AVISOS ---
    useEffect(() => {
        if (formData.vehicleId) {
            const vehicle = vehicles.find(v => v.id === formData.vehicleId);
            if (!vehicle) return;

            // Histórico seguro
            const history = refuelings
                .filter(r => r.vehicleId === formData.vehicleId && r.status === 'Concluída')
                .sort((a,b) => safeDate(b.date) - safeDate(a.date));
            
            const last = history[0];
            setLastRefuelData(last);

            if (!isEditing) {
                let autoEmployeeId = formData.employeeId;
                let autoObraId = formData.obraId;

                if (vehicle.obraAtualId) {
                    autoObraId = vehicle.obraAtualId;
                    const obra = obras.find(o => o.id === vehicle.obraAtualId);
                    const alocacao = obra?.historicoVeiculos?.find(h => h.veiculoId === vehicle.id && !h.dataSaida);
                    if (alocacao?.employeeId) autoEmployeeId = alocacao.employeeId;
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
            if (vehicle.naoPodeCircular) newWarnings.push("⚠️ VEÍCULO BLOQUEADO ('Não pode circular')");
            if (vehicle.status === 'manutencao') newWarnings.push("🔧 Veículo em manutenção.");
            if (vehicle.possuiAviso) newWarnings.push(`📄 ${vehicle.avisoTexto}`);
            setWarnings(newWarnings);

            if (last && history[1]) {
                const prev = history[1];
                const litros = parseFloat(last.litrosAbastecidos || 0);
                
                let diff = 0;
                let unit = 'Km/L';

                const getRead = (r) => parseFloat(r.horimetroDigital || r.horimetro || r.odometro || 0);

                if (isHeavyMachinery || (isTruck && vehicle.mediaCalculo === 'horimetro')) {
                    diff = getRead(last) - getRead(prev);
                    unit = 'L/Hr';
                } else {
                    diff = parseFloat(last.odometro || 0) - parseFloat(prev.odometro || 0);
                }

                if (diff > 0 && litros > 0) {
                    const avg = unit === 'Km/L' ? (diff / litros) : (litros / diff);
                    setLastAverage(`${avg.toFixed(2)} ${unit}`);
                } else {
                    setLastAverage(null);
                }
            } else {
                setLastAverage(null);
            }
        }
    }, [formData.vehicleId]); 

    // --- VALIDAÇÕES DE LEITURA ---
    useEffect(() => {
        if (!lastRefuelData) {
            setBlockReason(null);
            return;
        }
        let reason = null;
        
        const validateGrowth = (currentStr, lastStr, label, maxJump) => {
             const current = parseFloat(currentStr);
             const last = parseFloat(lastStr || 0);
             if (!isNaN(current) && last > 0) {
                 if (current < last) return `${label} menor que anterior (${last}).`;
                 if (current - last > maxJump) return `Salto excessivo em ${label} (> ${maxJump}).`;
             }
             return null;
        };

        if (isKmVehicle) {
            reason = validateGrowth(formData.odometro, lastRefuelData.odometro, 'Odômetro', 2000);
        } else if (isTruck) {
            reason = validateGrowth(formData.horimetro, lastRefuelData.horimetro, 'Horímetro Geral', 200);
        } else if (isHeavyMachinery) {
            const curHr = formData.horimetroDigital || formData.horimetro || 0;
            const lastHr = lastRefuelData.horimetroDigital || lastRefuelData.horimetro || 0;
            reason = validateGrowth(curHr, lastHr, 'Horímetro', 100);
        }
        setBlockReason(reason);

    }, [formData.odometro, formData.horimetro, formData.horimetroDigital, formData.horimetroAnalogico, lastRefuelData, isKmVehicle, isTruck, isHeavyMachinery]);

    // --- ORÇAMENTO ---
    useEffect(() => {
        if (formData.obraId) {
            const obra = obras.find(o => o.id === formData.obraId);
            if (obra?.valorContrato > 0) {
                const totalExpenses = expenses
                    .filter(e => e.obraId === formData.obraId && e.category === 'fuel')
                    .reduce((sum, e) => sum + (parseFloat(e.value) || 0), 0);
                
                const limit = obra.valorContrato * 0.20;
                if (totalExpenses >= limit) {
                    setBudgetWarning(`Custo combustível (R$ ${totalExpenses.toLocaleString()}) atingiu 20% do contrato.`);
                    setRequiresBudgetOverride(true);
                } else {
                    setBudgetWarning(null);
                    setRequiresBudgetOverride(false);
                }
            } else {
                setBudgetWarning(null);
                setRequiresBudgetOverride(false);
            }
        } else {
            setBudgetWarning(null);
            setRequiresBudgetOverride(false);
        }
    }, [formData.obraId, expenses]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        if (name === 'isFillUp' && checked) setFormData(prev => ({ ...prev, litrosLiberados: '' }));
    };

    const sendToWhatsApp = () => {
        const vehicle = vehicles.find(v => v.id === formData.vehicleId);
        const partner = partners.find(p => p.id === formData.partnerId);
        const employee = employees.find(e => e.id === formData.employeeId);
        
        // Dados para PDF de Preview
        const pdfData = {
            ...formData,
            id: orderToEdit?.id || 'PREVIEW',
            authNumber: orderToEdit?.authNumber || 'NOVA',
            partnerName: partner?.razaoSocial || 'Posto Selecionado',
            employeeName: employee?.nome || 'Motorista Selecionado',
        };
        
        // Gera o PDF (Download)
        onGeneratePDF(pdfData, vehicles, partners, employees, vehicleGroups);

        if (!partner?.telefone) {
            setAlertMessage("Posto selecionado não possui telefone cadastrado. O PDF foi baixado.");
            return;
        }

        const msg = `*⛽ ORDEM DE ABASTECIMENTO - FROTAS MAK*\n` +
                    `*Veículo:* ${vehicle?.placa || ''} (${vehicle?.registroInterno})\n` +
                    `*Motorista:* ${employee?.nome || 'N/A'}\n` +
                    `*Combustível:* ${formData.fuelType === 'dieselS10' ? 'Diesel S10' : formData.fuelType}\n` +
                    `*Qtd:* ${formData.isFillUp ? 'COMPLETAR TANQUE' : formData.litrosLiberados + ' Litros'}\n` +
                    `_Por favor, confirme o recebimento._`;

        // Abre WhatsApp
        setTimeout(() => {
            window.open(`https://wa.me/55${partner.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
        }, 1000);
    };

    const handleSaveClick = (e) => {
        if(e) e.preventDefault();

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
        
        if (isTruck && !formData.horimetro && !isNoHorimetroConfirmVisible) {
             setNoHorimetroWarning("Para caminhões, o Horímetro Geral é recomendado. Salvar sem ele?");
             setIsNoHorimetroConfirmVisible(true);
             return;
        }
        executeSave();
    };

    const executeSave = async () => {
        setIsSaving(true);
        setIsNoHorimetroConfirmVisible(false);
        setShowPasswordModal(false);

        const safeFloat = (val) => {
            if (val === '' || val === null || val === undefined) return null;
            const num = parseFloat(val);
            return isNaN(num) ? null : num;
        };

        let isoDate = new Date().toISOString();
        if (formData.date) {
            const dateObj = new Date(formData.date + 'T12:00:00Z');
            if (!isNaN(dateObj.getTime())) {
                isoDate = dateObj.toISOString();
            }
        }

        const payload = {
            ...formData,
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
            if (isEditing && orderToEdit?.id) {
                res = await apiClient.updateRefuelingOrder(orderToEdit.id, payload);
                setAlertMessage(`Ordem atualizada com sucesso!`);
            } else {
                res = await apiClient.createRefuelingOrder(payload);
                setAlertMessage(`Ordem Nº ${res.authNumber} emitida!`);
            }
            reloadData();
            
            if (res) {
                 const partner = partners.find(p => p.id === payload.partnerId);
                 const employee = employees.find(e => e.id === payload.employeeId);
                 const pdfData = {
                    ...payload,
                    id: res.id,
                    authNumber: res.authNumber || orderToEdit?.authNumber,
                    partnerName: partner?.razaoSocial,
                    employeeName: employee?.nome,
                 };
                 onGeneratePDF(pdfData, vehicles, partners, employees, vehicleGroups);
            }
            onClose();
        } catch (error) {
            console.error(error);
            const msg = error.response?.data?.error || error.message;
            setAlertMessage("Erro ao salvar ordem: " + msg);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-2 sm:p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col">
                <div className="p-5 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        {isEditing ? <Edit size={20}/> : <FileText size={20}/>}
                        {isEditing ? 'Editar' : 'Emitir'} Ordem de Abastecimento
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition"><X size={20}/></button>
                </div>

                <div className="px-6 pt-4 space-y-2">
                    {warnings.map((w, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-yellow-50 text-yellow-800 rounded border border-yellow-200 text-sm font-medium"><Info size={16}/> {w}</div>
                    ))}
                    {blockReason && (
                        <div className="flex items-center gap-2 p-3 bg-red-100 text-red-800 rounded border border-red-200 text-sm font-bold animate-pulse">
                            <Lock size={16}/> BLOQUEIO: {blockReason}
                        </div>
                    )}
                    {budgetWarning && (
                        <div className="flex items-center gap-2 p-3 bg-orange-100 text-orange-900 rounded border border-orange-200 text-sm font-bold">
                            <Wallet size={16}/> {budgetWarning} {requiresBudgetOverride && "(Requer Senha)"}
                        </div>
                    )}
                </div>

                <form onSubmit={handleSaveClick} className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Veículo *</label>
                            <select name="vehicleId" value={formData.vehicleId} onChange={e => setFormData(p => ({...p, vehicleId: e.target.value}))} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" required>
                                <option value="">Selecione...</option>
                                {sortedVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa}</option>)}
                            </select>
                        </div>
                        
                        {lastRefuelData && (
                            <div className="bg-gray-100 p-3 rounded-lg border border-gray-200 text-xs text-gray-600 flex justify-between items-center">
                                <div>
                                    <div className="font-bold text-gray-700 mb-1 flex items-center gap-1"><Clock size={12}/> Último: {formatDateDisplay(lastRefuelData.date)}</div>
                                    <p>{lastRefuelData.partnerName} - {lastRefuelData.fuelType}</p>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-gray-700 mb-1 flex items-center justify-end gap-1"><Activity size={12}/> Média</div>
                                    <p className="text-lg font-bold text-blue-600">{lastAverage || '--'}</p>
                                </div>
                            </div>
                        )}

                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">Leituras (Atualizar se necessário)</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {isKmVehicle && (
                                    <div className="col-span-2">
                                        <label className="block text-sm font-bold text-gray-700">Odômetro (Km)</label>
                                        <input type="number" name="odometro" value={formData.odometro} onChange={handleChange} className="w-full p-2 border rounded" placeholder={`Ant: ${lastRefuelData?.odometro || '0'}`}/>
                                    </div>
                                )}
                                {isTruck && (
                                    <div className="col-span-2">
                                        <label className="block text-sm font-bold text-gray-700">Horímetro Geral (Hrs)</label>
                                        <input type="number" name="horimetro" value={formData.horimetro} onChange={handleChange} className="w-full p-2 border rounded" placeholder={`Ant: ${lastRefuelData?.horimetro || '0'}`}/>
                                    </div>
                                )}
                                {isHeavyMachinery && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700">Hr Digital</label>
                                            <input type="number" name="horimetroDigital" value={formData.horimetroDigital} onChange={handleChange} className="w-full p-2 border rounded" placeholder={`Ant: ${lastRefuelData?.horimetroDigital || '0'}`}/>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700">Hr Analógico</label>
                                            <input type="number" name="horimetroAnalogico" value={formData.horimetroAnalogico} onChange={handleChange} className="w-full p-2 border rounded" placeholder={`Ant: ${lastRefuelData?.horimetroAnalogico || '0'}`}/>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Motorista</label>
                            <select name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full p-2.5 border border-gray-300 rounded-lg" required>
                                <option value="">Selecione...</option>
                                {sortedEmployees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Obra / Alocação</label>
                            <select name="obraId" value={formData.obraId} onChange={handleChange} className="w-full p-2.5 border border-gray-300 rounded-lg">
                                <option value="">Nenhuma / Pátio</option>
                                {sortedObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                {extraObraOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Posto *</label>
                            <select name="partnerId" value={formData.partnerId} onChange={handleChange} className="w-full p-2.5 border border-gray-300 rounded-lg" required>
                                <option value="">Selecione...</option>
                                {sortedPartners.map(p => <option key={p.id} value={p.id}>{p.razaoSocial}</option>)}
                            </select>
                        </div>

                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <label className="block text-sm font-bold text-blue-900 mb-2">Combustível</label>
                            <select name="fuelType" value={formData.fuelType} onChange={handleChange} className="w-full p-2 border border-blue-200 rounded mb-3 bg-white" required>
                                <option value="">Selecione...</option>
                                <option value="dieselS10">Diesel S10</option>
                                <option value="dieselS500">Diesel S500</option>
                                <option value="gasolinaComum">Gasolina Comum</option>
                                <option value="gasolinaAditivada">Gasolina Aditivada</option>
                            </select>
                            
                            <div className="flex items-center gap-2 mb-2">
                                <input type="checkbox" id="fill" name="isFillUp" checked={formData.isFillUp} onChange={handleChange} className="w-4 h-4 text-blue-600 rounded"/>
                                <label htmlFor="fill" className="text-sm font-medium text-blue-800">Completar Tanque</label>
                            </div>
                            {!formData.isFillUp && (
                                <input type="number" name="litrosLiberados" value={formData.litrosLiberados} onChange={handleChange} className="w-full p-2 border rounded" placeholder="Qtd. Litros Liberados"/>
                            )}

                            <div className="mt-3 pt-3 border-t border-blue-200">
                                <div className="flex items-center gap-2 mb-2">
                                    <input type="checkbox" id="arla" name="needsArla" checked={formData.needsArla} onChange={handleChange} className="w-4 h-4 text-blue-600 rounded"/>
                                    <label htmlFor="arla" className="text-sm font-bold text-blue-900">Abastecer Arla 32</label>
                                </div>
                                {formData.needsArla && (
                                    <div className="pl-6 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <input type="checkbox" name="isFillUpArla" checked={formData.isFillUpArla} onChange={handleChange} className="w-4 h-4"/>
                                            <label className="text-sm">Completar Arla</label>
                                        </div>
                                        {!formData.isFillUpArla && (
                                             <input type="number" name="litrosLiberadosArla" value={formData.litrosLiberadosArla} onChange={handleChange} className="w-full p-2 border rounded text-sm" placeholder="Litros Arla"/>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                         <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Data</label>
                            <input type="date" name="date" value={formData.date} onChange={handleChange} className="w-full p-2.5 border rounded-lg"/>
                        </div>

                        <div className="bg-gray-50 p-3 rounded-lg border">
                            <label className="block text-sm font-bold text-gray-700 mb-1">Outros / Observação</label>
                            <input type="text" name="outros" value={formData.outros} onChange={handleChange} className="w-full p-2 border rounded mb-2" placeholder="Ex: Óleo de motor, Filtro..."/>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" id="geraValor" name="outrosGeraValor" checked={formData.outrosGeraValor} onChange={handleChange} className="w-4 h-4 text-green-600"/>
                                <label htmlFor="geraValor" className="text-sm font-medium text-gray-700">Preenchimento Gera Valor (Cobrar R$ na Confirmação)</label>
                            </div>
                        </div>

                        <button type="button" onClick={sendToWhatsApp} className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg shadow transition flex items-center justify-center gap-2">
                            <Send size={18}/> {isEditing ? 'Baixar PDF & Abrir WhatsApp' : 'Pré-visualizar & WhatsApp'}
                        </button>
                    </div>
                </form>

                <div className="p-5 border-t bg-gray-50 flex justify-end gap-3 rounded-b-xl">
                    <button onClick={onClose} className="px-5 py-2.5 text-gray-600 font-bold hover:bg-gray-200 rounded-lg transition">Cancelar</button>
                    {blockReason || requiresBudgetOverride ? (
                        <button onClick={handleSaveClick} className="px-6 py-2.5 bg-red-500 text-white font-bold rounded-lg shadow hover:bg-red-600 transition flex items-center gap-2">
                            <Lock size={18}/> Liberar com Senha
                        </button>
                    ) : (
                        <button onClick={handleSaveClick} disabled={isSaving} className="px-6 py-2.5 bg-yellow-400 text-gray-900 font-bold rounded-lg shadow hover:bg-yellow-500 transition disabled:opacity-50 flex items-center gap-2">
                            {isSaving ? <Loader className="animate-spin" size={18}/> : 'Salvar & Gerar PDF'}
                        </button>
                    )}
                </div>

                {isNoHorimetroConfirmVisible && (
                    <ConfirmationModal 
                        title="Aviso de Segurança" 
                        message={noHorimetroWarning} 
                        onConfirm={executeSave} 
                        onClose={() => setIsNoHorimetroConfirmVisible(false)}
                        confirmText="Salvar Mesmo Assim"
                        confirmColor="bg-red-600 hover:bg-red-700 text-white"
                    />
                )}
                {showPasswordModal && (
                    <PasswordConfirmationModal
                        message={passwordAction === 'blockOverride' ? `BLOQUEIO: ${blockReason}` : 'Bloqueio Financeiro: Acima de 20% do contrato.'}
                        onConfirm={executeSave}
                        onClose={() => setShowPasswordModal(false)}
                        apiClient={apiClient}
                    />
                )}
            </div>
        </div>
    );
};

export default RefuelingOrderModal;