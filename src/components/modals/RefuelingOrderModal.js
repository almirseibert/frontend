import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader, AlertTriangle, Info, Send, Lock, FileText, Wallet } from 'lucide-react';

const RefuelingOrderModal = ({
    user,
    orderToEdit,
    vehicles = [],
    obras = [],
    partners = [],
    employees = [],
    refuelings = [], 
    expenses = [], // Recebe despesas para Regra 10
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
    const [budgetWarning, setBudgetWarning] = useState(null); // Aviso de orçamento (Regra 10)
    const [requiresBudgetOverride, setRequiresBudgetOverride] = useState(false); // Trava de orçamento
    const [showPasswordModal, setShowPasswordModal] = useState(false); // Modal de senha para travas
    
    const [warnings, setWarnings] = useState([]); 
    const [lastRefuelData, setLastRefuelData] = useState(null);
    const [noHorimetroWarning, setNoHorimetroWarning] = useState('');
    const [isNoHorimetroConfirmVisible, setIsNoHorimetroConfirmVisible] = useState(false);

    const isEditing = !!orderToEdit;

    // --- ORDENAÇÃO ---
    const sortedVehicles = useMemo(() => [...vehicles].sort((a,b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);
    const sortedEmployees = useMemo(() => [...employees].sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [employees]);
    const sortedPartners = useMemo(() => [...partners].sort((a,b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '')), [partners]);

    // --- REGRAS DE GRUPO (Regra 1) ---
    const vehicleGroup = useMemo(() => {
        if (!formData.vehicleId) return null;
        const vehicle = vehicles.find(v => v.id === formData.vehicleId);
        if (!vehicle) return null;
        return Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
    }, [formData.vehicleId, vehicles, vehicleGroups]);

    const isKmVehicle = vehicleGroup === 'Veículos Leves' || vehicleGroup === 'Caminhões de Trecho';
    const isHrVehicle = !isKmVehicle; 

    // --- AUTO-PREENCHIMENTO (Regra 7) E AVISOS (Regra 8) ---
    useEffect(() => {
        if (formData.vehicleId && !isEditing) {
            const vehicle = vehicles.find(v => v.id === formData.vehicleId);
            if (!vehicle) return;

            // Auto-preenchimento inteligente
            let autoEmployeeId = formData.employeeId;
            let autoObraId = formData.obraId;

            if (vehicle.obraAtualId) {
                autoObraId = vehicle.obraAtualId;
                const obra = obras.find(o => o.id === vehicle.obraAtualId);
                // Tenta achar alocação ativa
                const alocacao = obra?.historicoVeiculos?.find(h => h.veiculoId === vehicle.id && !h.dataSaida);
                if (alocacao?.employeeId) autoEmployeeId = alocacao.employeeId;
            }
            
            setFormData(prev => ({
                ...prev,
                employeeId: autoEmployeeId || prev.employeeId,
                obraId: autoObraId || prev.obraId,
                // Regra 5: Pré-carrega leituras atuais do banco de dados do veículo
                odometro: prev.odometro || vehicle.odometro?.toString() || '',
                horimetro: prev.horimetro || vehicle.horimetro?.toString() || '',
                horimetroDigital: prev.horimetroDigital || vehicle.horimetroDigital?.toString() || '',
                horimetroAnalogico: prev.horimetroAnalogico || vehicle.horimetroAnalogico?.toString() || ''
            }));

            // Regra 8: Avisos não bloqueantes
            const newWarnings = [];
            if (vehicle.naoPodeCircular) newWarnings.push("⚠️ CHECKBOX 'NÃO PODE CIRCULAR' MARCADO!");
            if (vehicle.status === 'manutencao') newWarnings.push("🔧 Veículo em manutenção.");
            if (vehicle.possuiAviso) newWarnings.push(`📄 ${vehicle.avisoTexto}`);
            setWarnings(newWarnings);

            // Busca último abastecimento para validação
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
        
        // Regra 2: KM (Leves/Trecho)
        if (isKmVehicle && formData.odometro) {
            const current = parseFloat(formData.odometro);
            const last = parseFloat(lastRefuelData.odometro || 0);
            if (current <= last) reason = `Odômetro deve ser maior que o anterior (${last} Km).`;
            if (current - last > 1000) reason = `ERRO: Diferença > 1000 Km em um único abastecimento. Verifique a digitação.`;
        }

        // Regra 3: Horas (Pesados/Máquinas)
        if (isHrVehicle) {
            const current = parseFloat(formData.horimetroDigital || formData.horimetroAnalogico || formData.horimetro || 0);
            const last = parseFloat(lastRefuelData.horimetroDigital || lastRefuelData.horimetroAnalogico || lastRefuelData.horimetro || 0);
            
            if (current > 0) { 
                if (current <= last) reason = `Horímetro deve ser maior que o anterior (${last} Hr).`;
                if (current - last > 50) reason = `ERRO: Diferença > 50 Horas em um único abastecimento. Verifique a digitação.`;
            }
        }

        setBlockReason(reason);
    }, [formData.odometro, formData.horimetro, formData.horimetroDigital, formData.horimetroAnalogico, lastRefuelData, isKmVehicle, isHrVehicle]);

    // --- REGRA 10: CONTROLE DE ORÇAMENTO (20% da Obra) ---
    useEffect(() => {
        if (formData.obraId && obras.length > 0) {
            const obra = obras.find(o => o.id === formData.obraId);
            // Pula verificação se for "Extra Obra" ou se a obra não tiver valor contratado
            if (!obra || !obra.valorContrato || obra.valorContrato <= 0) {
                setBudgetWarning(null);
                setRequiresBudgetOverride(false);
                return;
            }

            // Calcula total de despesas de combustível para esta obra
            // Nota: Filtra despesas do tipo 'fuel'
            const totalFuelExpenses = expenses
                .filter(e => e.obraId === formData.obraId && e.category === 'fuel')
                .reduce((sum, e) => sum + (parseFloat(e.value) || 0), 0);

            const limit = obra.valorContrato * 0.20; // 20%
            
            if (totalFuelExpenses >= limit) {
                setBudgetWarning(`ATENÇÃO: O custo de combustível (R$ ${totalFuelExpenses.toLocaleString()}) já atingiu 20% do valor do contrato (R$ ${obra.valorContrato.toLocaleString()}).`);
                setRequiresBudgetOverride(true); // Bloqueia e pede senha
            } else {
                setBudgetWarning(null);
                setRequiresBudgetOverride(false);
            }
        } else {
            setBudgetWarning(null);
            setRequiresBudgetOverride(false);
        }
    }, [formData.obraId, obras, expenses]);


    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        if (name === 'isFillUp' && checked) setFormData(prev => ({ ...prev, litrosLiberados: '' }));
    };

    // --- REGRA 11: WHATSAPP ---
    const sendToWhatsApp = () => {
        const vehicle = vehicles.find(v => v.id === formData.vehicleId);
        const partner = partners.find(p => p.id === formData.partnerId);
        const employee = employees.find(e => e.id === formData.employeeId);
        
        if (!partner?.telefone) {
            setAlertMessage("O posto selecionado não possui telefone cadastrado.");
            return;
        }

        const msg = 
`*⛽ ORDEM DE ABASTECIMENTO - FROTAS MAK*

*Nº Controle:* ${orderToEdit?.authNumber || 'Nova'}
*Data:* ${new Date(formData.date).toLocaleDateString('pt-BR')}

🚛 *Veículo:* ${vehicle?.placa || ''} - ${vehicle?.modelo || ''} (${vehicle?.registroInterno})
👤 *Motorista:* ${employee?.nome || 'N/A'}

🛢️ *Combustível:* ${formData.fuelType === 'dieselS10' ? 'Diesel S10' : formData.fuelType.toUpperCase()}
🔢 *Quantidade:* ${formData.isFillUp ? 'COMPLETAR TANQUE' : formData.litrosLiberados + ' Litros'}
${formData.needsArla ? `🔵 *Arla 32:* ${formData.isFillUpArla ? 'Completar' : formData.litrosLiberadosArla + ' L'}` : ''}
📝 *Obs:* ${formData.outros || '-'}

_Favor emitir nota fiscal conforme cadastro._`;

        window.open(`https://wa.me/55${partner.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    // --- SALVAR ---
    const handleSave = async (e) => {
        if(e) e.preventDefault();

        // Travas rígidas de leitura
        if (blockReason) {
            setAlertMessage(`BLOQUEADO: ${blockReason}`);
            return;
        }

        // Trava de Orçamento (Regra 10)
        if (requiresBudgetOverride) {
            setShowPasswordModal(true); // Abre modal de senha
            return;
        }
        
        // Aviso Caminhão sem Horímetro (Recomendação)
        const selectedVehicle = vehicles.find(v => v.id === formData.vehicleId);
        if (vehicleGroup === 'Caminhões' && !formData.horimetro && !isNoHorimetroConfirmVisible) {
             setNoHorimetroWarning("O horímetro para caminhões é recomendado. Liberar mesmo assim?");
             setIsNoHorimetroConfirmVisible(true);
             return;
        }

        executeSave();
    };

    // Chamado após confirmação de senha (se necessário) ou direto
    const executeSave = async () => {
        setIsSaving(true);
        setIsNoHorimetroConfirmVisible(false);
        setShowPasswordModal(false);

        const payload = {
            ...formData,
            odometro: parseFloat(formData.odometro) || null,
            horimetro: parseFloat(formData.horimetro) || null,
            horimetroDigital: parseFloat(formData.horimetroDigital) || null,
            horimetroAnalogico: parseFloat(formData.horimetroAnalogico) || null,
            litrosLiberados: parseFloat(formData.litrosLiberados) || 0,
            litrosLiberadosArla: parseFloat(formData.litrosLiberadosArla) || 0,
            date: new Date(formData.date + 'T12:00:00Z').toISOString() // Ajuste UTC
        };

        try {
            let res;
            if (isEditing) {
                res = await apiClient.updateRefuelingOrder(orderToEdit.id, payload);
                setAlertMessage(`Ordem atualizada com sucesso!`);
            } else {
                res = await apiClient.createRefuelingOrder(payload);
                setAlertMessage(`Ordem Nº ${res.authNumber} emitida!`);
            }
            reloadData();
            
            // Gera PDF Automático
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
            setAlertMessage("Erro ao salvar ordem: " + error.message);
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
                    {/* Regra 8 - Avisos Visuais */}
                    {warnings.map((w, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-yellow-50 text-yellow-800 rounded border border-yellow-200 text-sm font-medium"><Info size={16}/> {w}</div>
                    ))}
                    
                    {/* Regra 2 e 3 - Bloqueio de Leitura */}
                    {blockReason && (
                        <div className="flex items-center gap-2 p-3 bg-red-100 text-red-800 rounded border border-red-200 text-sm font-bold animate-pulse">
                            <Lock size={16}/> BLOQUEIO DE LEITURA: {blockReason}
                        </div>
                    )}

                    {/* Regra 10 - Aviso de Orçamento */}
                    {budgetWarning && (
                        <div className="flex items-center gap-2 p-3 bg-orange-100 text-orange-900 rounded border border-orange-200 text-sm font-bold">
                            <Wallet size={16}/> {budgetWarning} {requiresBudgetOverride && "(Requer Senha Admin)"}
                        </div>
                    )}
                </div>

                <form onSubmit={handleSave} className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* --- COLUNA ESQUERDA --- */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Veículo *</label>
                            <select name="vehicleId" value={formData.vehicleId} onChange={e => setFormData(p => ({...p, vehicleId: e.target.value}))} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none transition" required>
                                <option value="">Selecione...</option>
                                {sortedVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa}</option>)}
                            </select>
                        </div>
                        
                        {/* Leituras Dinâmicas (Regra 1) */}
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">Leituras Atuais</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {isKmVehicle && (
                                    <div className="col-span-2">
                                        <label className="block text-sm font-bold text-gray-700">Odômetro (Km)</label>
                                        <input type="number" name="odometro" value={formData.odometro} onChange={handleChange} className="w-full p-2 border rounded" placeholder={`Ant: ${lastRefuelData?.odometro || 'N/A'}`}/>
                                    </div>
                                )}
                                {isHrVehicle && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700">Horímetro Digital</label>
                                            <input type="number" name="horimetroDigital" value={formData.horimetroDigital} onChange={handleChange} className="w-full p-2 border rounded" placeholder={`Ant: ${lastRefuelData?.horimetroDigital || 'N/A'}`}/>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700">Horímetro Analógico</label>
                                            <input type="number" name="horimetroAnalogico" value={formData.horimetroAnalogico} onChange={handleChange} className="w-full p-2 border rounded" placeholder={`Ant: ${lastRefuelData?.horimetroAnalogico || 'N/A'}`}/>
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs text-gray-500 mb-1">Horímetro Geral (Opcional)</label>
                                            <input type="number" name="horimetro" value={formData.horimetro} onChange={handleChange} className="w-full p-2 border rounded text-sm"/>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Motorista / Operador (Regra 7)</label>
                            <select name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full p-2.5 border border-gray-300 rounded-lg" required>
                                <option value="">Selecione...</option>
                                {sortedEmployees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Obra / Alocação</label>
                            <select name="obraId" value={formData.obraId} onChange={handleChange} className="w-full p-2.5 border border-gray-300 rounded-lg">
                                <option value="">Nenhuma / Pátio</option>
                                {obras.filter(o => o.status === 'ativa').map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                {extraObraOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* --- COLUNA DIREITA --- */}
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
                                <option value="gasolina">Gasolina</option>
                                <option value="etanol">Etanol</option>
                                <option value="dieselS500">Diesel S500</option>
                            </select>
                            
                            <div className="flex items-center gap-2 mb-2">
                                <input type="checkbox" id="fill" name="isFillUp" checked={formData.isFillUp} onChange={handleChange} className="w-4 h-4 text-blue-600 rounded"/>
                                <label htmlFor="fill" className="text-sm font-medium text-blue-800">Completar Tanque</label>
                            </div>
                            {!formData.isFillUp && (
                                <input type="number" name="litrosLiberados" value={formData.litrosLiberados} onChange={handleChange} className="w-full p-2 border rounded" placeholder="Qtd. Litros Liberados"/>
                            )}

                            {/* Arla 32 */}
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

                        {/* WhatsApp Button (Regra 11) */}
                        {isEditing && (
                            <button type="button" onClick={sendToWhatsApp} className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg shadow transition flex items-center justify-center gap-2">
                                <Send size={18}/> Enviar Ordem no WhatsApp
                            </button>
                        )}
                    </div>
                </form>

                <div className="p-5 border-t bg-gray-50 flex justify-end gap-3 rounded-b-xl">
                    <button onClick={onClose} className="px-5 py-2.5 text-gray-600 font-bold hover:bg-gray-200 rounded-lg transition">Cancelar</button>
                    <button onClick={handleSave} disabled={isSaving || !!blockReason} className="px-6 py-2.5 bg-yellow-400 text-gray-900 font-bold rounded-lg shadow hover:bg-yellow-500 transition disabled:opacity-50 flex items-center gap-2">
                        {isSaving ? <Loader className="animate-spin" size={18}/> : 'Salvar & Gerar PDF'}
                    </button>
                </div>
            </div>

            {/* Modal de Confirmação para Horímetro Vazio */}
            {isNoHorimetroConfirmVisible && (
                <ConfirmationModal 
                    title="Aviso de Segurança" 
                    message={noHorimetroWarning} 
                    onConfirm={executeSave} 
                    onClose={() => setIsNoHorimetroConfirmVisible(false)}
                    confirmText="Liberar Mesmo Assim"
                    confirmColor="bg-red-600 hover:bg-red-700 text-white"
                />
            )}

            {/* Modal de Senha para Orçamento Estourado */}
            {showPasswordModal && (
                <PasswordConfirmationModal
                    message={`BLOQUEIO FINANCEIRO: Esta obra já excedeu 20% do contrato em combustível.\nInsira a senha administrativa para autorizar este abastecimento.`}
                    onConfirm={executeSave}
                    onClose={() => setShowPasswordModal(false)}
                    apiClient={apiClient}
                />
            )}
        </div>
    );
};

export default RefuelingOrderModal;