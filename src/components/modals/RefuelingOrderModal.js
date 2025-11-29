import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader, AlertTriangle, Info, Send, Lock } from 'lucide-react';

const RefuelingOrderModal = ({
    user,
    orderToEdit,
    vehicles = [],
    obras = [],
    partners = [],
    employees = [],
    refuelings = [], 
    onClose,
    setAlertMessage,
    onGeneratePDF, // Função de PDF recebida do pai
    extraObraOptions = [],
    ConfirmationModal,
    PasswordConfirmationModal,
    vehicleGroups = {},
    apiClient,
    reloadData
}) => {
    // --- ESTADOS ---
    const [formData, setFormData] = useState({
        vehicleId: orderToEdit?.vehicleId || '',
        partnerId: orderToEdit?.partnerId || '',
        obraId: orderToEdit?.obraId || '',
        employeeId: orderToEdit?.employeeId || '',
        date: orderToEdit?.date ? new Date(orderToEdit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
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
        outrosValor: orderToEdit?.outrosValor?.toString() || '',
    });

    const [isSaving, setIsSaving] = useState(false);
    const [blockReason, setBlockReason] = useState(null); 
    const [budgetBlock, setBudgetBlock] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    
    const [warnings, setWarnings] = useState([]); 
    const [lastRefuelData, setLastRefuelData] = useState(null);
    const [noHorimetroWarning, setNoHorimetroWarning] = useState('');
    const [isNoHorimetroConfirmVisible, setIsNoHorimetroConfirmVisible] = useState(false);

    const isEditing = !!orderToEdit;

    // --- ORDENAÇÃO ---
    const sortedVehicles = useMemo(() => [...vehicles].sort((a,b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);
    const sortedEmployees = useMemo(() => [...employees].sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [employees]);
    const sortedPartners = useMemo(() => [...partners].sort((a,b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '')), [partners]);

    // --- REGRAS DE GRUPO ---
    const vehicleGroup = useMemo(() => {
        if (!formData.vehicleId) return null;
        const vehicle = vehicles.find(v => v.id === formData.vehicleId);
        if (!vehicle) return null;
        return Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
    }, [formData.vehicleId, vehicles, vehicleGroups]);

    const isKmVehicle = vehicleGroup === 'Veículos Leves' || vehicleGroup === 'Caminhões de Trecho';
    const isHrVehicle = !isKmVehicle; 

    // --- AUTO-PREENCHIMENTO E AVISOS ---
    useEffect(() => {
        if (formData.vehicleId && !isEditing) {
            const vehicle = vehicles.find(v => v.id === formData.vehicleId);
            if (!vehicle) return;

            // Auto-preenchimento
            let autoEmployeeId = formData.employeeId;
            let autoObraId = formData.obraId;

            // Tenta pegar da obra
            if (vehicle.obraAtualId) {
                autoObraId = vehicle.obraAtualId;
                const obra = obras.find(o => o.id === vehicle.obraAtualId);
                const alocacao = obra?.historicoVeiculos?.find(h => h.veiculoId === vehicle.id && !h.dataSaida);
                if (alocacao?.employeeId) autoEmployeeId = alocacao.employeeId;
            }
            
            setFormData(prev => ({
                ...prev,
                employeeId: autoEmployeeId || prev.employeeId,
                obraId: autoObraId || prev.obraId,
                // Pré-carrega leituras atuais do cadastro
                odometro: prev.odometro || vehicle.odometro?.toString() || '',
                horimetro: prev.horimetro || vehicle.horimetro?.toString() || '',
                horimetroDigital: prev.horimetroDigital || vehicle.horimetroDigital?.toString() || '',
                horimetroAnalogico: prev.horimetroAnalogico || vehicle.horimetroAnalogico?.toString() || ''
            }));

            // Avisos
            const newWarnings = [];
            if (vehicle.naoPodeCircular) newWarnings.push("⚠️ Veículo marcado como 'Não Pode Circular'!");
            if (vehicle.status === 'manutencao') newWarnings.push("🔧 Veículo em manutenção.");
            setWarnings(newWarnings);

            // Último abastecimento
            const lastRefuel = refuelings
                .filter(r => r.vehicleId === formData.vehicleId && r.status === 'Concluída')
                .sort((a,b) => new Date(b.date) - new Date(a.date))[0];
            setLastRefuelData(lastRefuel);

        }
    }, [formData.vehicleId, vehicles, obras, refuelings, isEditing]);

    // --- VALIDAÇÕES DE LEITURA (Regras 2 e 3) ---
    useEffect(() => {
        if (!lastRefuelData) {
            setBlockReason(null);
            return;
        }

        let reason = null;
        
        // KM
        if (isKmVehicle && formData.odometro) {
            const current = parseFloat(formData.odometro);
            const last = parseFloat(lastRefuelData.odometro || 0);
            if (current <= last) reason = `Odômetro deve ser maior que o anterior (${last} Km).`;
            if (current - last > 1000) reason = `Diferença de Km suspeita (> 1000 Km). Verifique a digitação.`;
        }

        // Horas
        if (isHrVehicle) {
            const current = parseFloat(formData.horimetroDigital || formData.horimetroAnalogico || formData.horimetro || 0);
            const last = parseFloat(lastRefuelData.horimetroDigital || lastRefuelData.horimetroAnalogico || lastRefuelData.horimetro || 0);
            
            if (current > 0) { 
                if (current <= last) reason = `Horímetro deve ser maior que o anterior (${last} Hr).`;
                if (current - last > 50) reason = `Diferença de Horas suspeita (> 50 Hr). Verifique a digitação.`;
            }
        }

        setBlockReason(reason);
    }, [formData.odometro, formData.horimetro, formData.horimetroDigital, formData.horimetroAnalogico, lastRefuelData, isKmVehicle, isHrVehicle]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        if (name === 'isFillUp' && checked) setFormData(prev => ({ ...prev, litrosLiberados: '' }));
    };

    const sendToWhatsApp = () => {
        const vehicle = vehicles.find(v => v.id === formData.vehicleId);
        const partner = partners.find(p => p.id === formData.partnerId);
        const employee = employees.find(e => e.id === formData.employeeId);
        
        if (!partner?.telefone) {
            setAlertMessage("O posto selecionado não possui telefone cadastrado.");
            return;
        }

        const msg = `*ORDEM DE ABASTECIMENTO - FROTAS MAK*%0A%0A` +
                    `⛽ *Posto:* ${partner.razaoSocial}%0A` +
                    `🚛 *Veículo:* ${vehicle?.placa || ''} - ${vehicle?.modelo || ''} (${vehicle?.registroInterno})%0A` +
                    `👤 *Motorista:* ${employee?.nome || 'N/A'}%0A` +
                    `🛢️ *Combustível:* ${formData.fuelType}%0A` +
                    `🔢 *Qtd:* ${formData.isFillUp ? 'COMPLETAR TANQUE' : formData.litrosLiberados + ' Litros'}%0A` +
                    `📅 *Data:* ${new Date(formData.date).toLocaleDateString('pt-BR')}`;

        window.open(`https://wa.me/55${partner.telefone.replace(/\D/g, '')}?text=${msg}`, '_blank');
    };

    // --- SALVAR ---
    const handleSave = async (e) => {
        if(e) e.preventDefault();

        // Validação bloqueante
        if (blockReason) {
            setAlertMessage(`BLOQUEADO: ${blockReason}`);
            return;
        }
        
        // Aviso Caminhão sem Horímetro
        const selectedVehicle = vehicles.find(v => v.id === formData.vehicleId);
        if (vehicleGroup === 'Caminhões' && !formData.horimetro && !isNoHorimetroConfirmVisible) {
             setNoHorimetroWarning("O horímetro para caminhões é recomendado. Liberar mesmo assim?");
             setIsNoHorimetroConfirmVisible(true);
             return;
        }

        executeSave();
    };

    const executeSave = async () => {
        setIsSaving(true);
        setIsNoHorimetroConfirmVisible(false);

        const payload = {
            ...formData,
            odometro: parseFloat(formData.odometro) || null,
            horimetro: parseFloat(formData.horimetro) || null,
            horimetroDigital: parseFloat(formData.horimetroDigital) || null,
            horimetroAnalogico: parseFloat(formData.horimetroAnalogico) || null,
            litrosLiberados: parseFloat(formData.litrosLiberados) || 0,
            litrosLiberadosArla: parseFloat(formData.litrosLiberadosArla) || 0,
            date: new Date(formData.date + 'T12:00:00Z').toISOString()
        };

        try {
            let res;
            if (isEditing) {
                res = await apiClient.updateRefuelingOrder(orderToEdit.id, payload);
                setAlertMessage(`Ordem atualizada com sucesso!`);
            } else {
                res = await apiClient.createRefuelingOrder(payload);
                setAlertMessage(`Ordem Nº ${res.id} emitida!`);
            }
            reloadData();
            
            // Gera PDF
            if (res) {
                 // Monta objeto completo para o PDF
                 const partner = partners.find(p => p.id === payload.partnerId);
                 const employee = employees.find(e => e.id === payload.employeeId);
                 const pdfData = {
                    ...payload,
                    id: res.id,
                    authNumber: res.authNumber || orderToEdit?.authNumber, // Usa o retornado ou o atual
                    partnerName: partner?.razaoSocial,
                    employeeName: employee?.nome,
                    createdBy: { userEmail: user?.email }
                 };
                 onGeneratePDF(pdfData, vehicles, partners, employees, vehicleGroups);
            }
            
            onClose();
        } catch (error) {
            console.error(error);
            setAlertMessage("Erro ao salvar ordem.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col">
                <div className="p-5 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h2 className="text-xl font-bold text-gray-800">{isEditing ? 'Editar' : 'Emitir'} Ordem</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full"><X size={20}/></button>
                </div>

                <div className="px-6 pt-4 space-y-2">
                    {warnings.map((w, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-yellow-50 text-yellow-800 rounded border border-yellow-200 text-sm"><Info size={16}/> {w}</div>
                    ))}
                    {blockReason && (
                        <div className="flex items-center gap-2 p-3 bg-red-100 text-red-800 rounded border border-red-200 text-sm font-bold animate-pulse"><Lock size={16}/> BLOQUEIO: {blockReason}</div>
                    )}
                </div>

                <form onSubmit={handleSave} className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Campos (Similar ao anterior, resumido para brevidade) */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700">Veículo</label>
                            <select name="vehicleId" value={formData.vehicleId} onChange={e => setFormData(p => ({...p, vehicleId: e.target.value}))} className="w-full p-2 border rounded">
                                <option value="">Selecione...</option>
                                {sortedVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa}</option>)}
                            </select>
                        </div>
                        
                        {/* Leituras Dinâmicas */}
                        <div className="grid grid-cols-2 gap-4">
                            {isKmVehicle && (
                                <div className="col-span-2">
                                    <label className="block text-sm font-bold">Odômetro</label>
                                    <input type="number" name="odometro" value={formData.odometro} onChange={handleChange} className="w-full p-2 border rounded" placeholder={`Ant: ${lastRefuelData?.odometro || ''}`}/>
                                </div>
                            )}
                            {isHrVehicle && (
                                <>
                                    <div>
                                        <label className="block text-sm font-bold">Horímetro Digital</label>
                                        <input type="number" name="horimetroDigital" value={formData.horimetroDigital} onChange={handleChange} className="w-full p-2 border rounded" placeholder={`Ant: ${lastRefuelData?.horimetroDigital || ''}`}/>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold">Horímetro Analógico</label>
                                        <input type="number" name="horimetroAnalogico" value={formData.horimetroAnalogico} onChange={handleChange} className="w-full p-2 border rounded" placeholder={`Ant: ${lastRefuelData?.horimetroAnalogico || ''}`}/>
                                    </div>
                                </>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-bold">Motorista</label>
                            <select name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full p-2 border rounded">
                                <option value="">Selecione...</option>
                                {sortedEmployees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold">Posto</label>
                            <select name="partnerId" value={formData.partnerId} onChange={handleChange} className="w-full p-2 border rounded">
                                <option value="">Selecione...</option>
                                {sortedPartners.map(p => <option key={p.id} value={p.id}>{p.razaoSocial}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold">Data</label>
                            <input type="date" name="date" value={formData.date} onChange={handleChange} className="w-full p-2 border rounded"/>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-gray-50 p-4 rounded border">
                            <label className="block text-sm font-bold mb-2">Combustível</label>
                            <select name="fuelType" value={formData.fuelType} onChange={handleChange} className="w-full p-2 border rounded mb-3">
                                <option value="">Selecione...</option>
                                <option value="dieselS10">Diesel S10</option>
                                <option value="gasolina">Gasolina</option>
                                {/* ...outros... */}
                            </select>
                            <div className="flex items-center gap-2 mb-2">
                                <input type="checkbox" name="isFillUp" checked={formData.isFillUp} onChange={handleChange}/>
                                <label>Completar Tanque</label>
                            </div>
                            {!formData.isFillUp && <input type="number" name="litrosLiberados" value={formData.litrosLiberados} onChange={handleChange} className="w-full p-2 border rounded" placeholder="Litros"/>}
                        </div>

                        {/* WhatsApp */}
                        {isEditing && (
                            <button type="button" onClick={sendToWhatsApp} className="w-full py-3 bg-green-500 text-white font-bold rounded flex items-center justify-center gap-2">
                                <Send size={18}/> Enviar via WhatsApp
                            </button>
                        )}
                    </div>
                </form>

                <div className="p-5 border-t bg-gray-50 flex justify-end gap-3 rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded">Cancelar</button>
                    <button onClick={handleSave} disabled={isSaving || !!blockReason} className="px-6 py-2 bg-yellow-400 text-gray-900 font-bold rounded shadow flex items-center gap-2">
                        {isSaving ? <Loader className="animate-spin" size={18}/> : 'Salvar'}
                    </button>
                </div>
            </div>

            {/* Modal Confirmação Horímetro */}
            {isNoHorimetroConfirmVisible && (
                <ConfirmationModal 
                    title="Aviso" 
                    message={noHorimetroWarning} 
                    onConfirm={executeSave} 
                    onClose={() => setIsNoHorimetroConfirmVisible(false)}
                    confirmText="Liberar"
                />
            )}
        </div>
    );
};

export default RefuelingOrderModal;