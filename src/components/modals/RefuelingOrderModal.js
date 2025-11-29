import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader, AlertTriangle, Info, Send, Lock } from 'lucide-react';

const RefuelingOrderModal = ({
    user,
    orderToEdit,
    vehicles = [],
    obras = [],
    partners = [],
    employees = [],
    refuelings = [], // Histórico completo para validações
    onClose,
    setAlertMessage,
    generatePDF,
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
    const [blockReason, setBlockReason] = useState(null); // Motivo do bloqueio (validação)
    const [budgetBlock, setBudgetBlock] = useState(false); // Bloqueio por orçamento (Regra 10)
    const [showPasswordModal, setShowPasswordModal] = useState(false); // Modal de senha para desbloqueio
    
    const [warnings, setWarnings] = useState([]); // Avisos não bloqueantes (Regra 8)
    const [lastRefuelData, setLastRefuelData] = useState(null); // Dados do último abastecimento para validação

    const isEditing = !!orderToEdit;

    // --- REGRAS DE GRUPO (Regra 1) ---
    const vehicleGroup = useMemo(() => {
        if (!formData.vehicleId) return null;
        const vehicle = vehicles.find(v => v.id === formData.vehicleId);
        if (!vehicle) return null;
        return Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
    }, [formData.vehicleId, vehicles, vehicleGroups]);

    const isKmVehicle = vehicleGroup === 'Veículos Leves' || vehicleGroup === 'Caminhões de Trecho';
    const isHrVehicle = !isKmVehicle; 

    // --- AUTO-PREENCHIMENTO E VALIDAÇÕES INICIAIS (Regra 7, 8) ---
    useEffect(() => {
        if (formData.vehicleId && !isEditing) {
            const vehicle = vehicles.find(v => v.id === formData.vehicleId);
            if (!vehicle) return;

            // 7. Auto-preencher Operador e Obra
            let autoEmployeeId = formData.employeeId;
            let autoObraId = formData.obraId;

            // Tenta pegar da Obra (alocação atual)
            if (vehicle.obraAtualId) {
                autoObraId = vehicle.obraAtualId;
                const obra = obras.find(o => o.id === vehicle.obraAtualId);
                const alocacao = obra?.historicoVeiculos?.find(h => h.veiculoId === vehicle.id && !h.dataSaida);
                if (alocacao?.employeeId) autoEmployeeId = alocacao.employeeId;
            }
            
            // Aplica mudanças
            setFormData(prev => ({
                ...prev,
                employeeId: autoEmployeeId || prev.employeeId,
                obraId: autoObraId || prev.obraId
            }));

            // 8. Avisos (Check-box 'Não circular', Revisões, Docs)
            const newWarnings = [];
            if (vehicle.naoPodeCircular) newWarnings.push("⚠️ Veículo marcado como 'Não Pode Circular'!");
            if (vehicle.status === 'manutencao') newWarnings.push("🔧 Veículo em manutenção.");
            // Adicione aqui lógicas para documentos vencidos se tiver os dados no objeto vehicle
            // ex: if (new Date(vehicle.vencimentoAET) < new Date()) newWarnings.push("📄 AET Vencida!");
            
            setWarnings(newWarnings);

            // Busca último abastecimento para validação
            const lastRefuel = refuelings
                .filter(r => r.vehicleId === formData.vehicleId && r.status === 'Concluída')
                .sort((a,b) => new Date(b.date) - new Date(a.date))[0];
            setLastRefuelData(lastRefuel);

        }
    }, [formData.vehicleId, vehicles, obras, refuelings, isEditing]);

    // --- REGRAS DE VALIDAÇÃO DE LEITURA (Regra 2 e 3) ---
    useEffect(() => {
        if (!lastRefuelData) {
            setBlockReason(null);
            return;
        }

        let reason = null;
        
        // Validação KM
        if (isKmVehicle && formData.odometro) {
            const current = parseFloat(formData.odometro);
            const last = parseFloat(lastRefuelData.odometro || 0);
            if (current <= last) reason = `Odômetro deve ser maior que o anterior (${last} Km).`;
            if (current - last > 1000) reason = `Diferença de Km suspeita (> 1000 Km). Verifique a digitação.`;
        }

        // Validação Horímetro
        if (isHrVehicle) {
            // Pega o valor que está sendo digitado (digital ou analógico ou genérico)
            const current = parseFloat(formData.horimetroDigital || formData.horimetroAnalogico || formData.horimetro || 0);
            const last = parseFloat(lastRefuelData.horimetroDigital || lastRefuelData.horimetroAnalogico || lastRefuelData.horimetro || 0);
            
            if (current > 0) { // Só valida se digitou algo
                if (current <= last) reason = `Horímetro deve ser maior que o anterior (${last} Hr).`;
                if (current - last > 50) reason = `Diferença de Horas suspeita (> 50 Hr). Verifique a digitação.`;
            }
        }

        setBlockReason(reason);
    }, [formData.odometro, formData.horimetro, formData.horimetroDigital, formData.horimetroAnalogico, lastRefuelData, isKmVehicle, isHrVehicle]);

    // --- HANDLE CHANGE ---
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        // Lógica de "Completar tanque" desabilita input de litros
        if (name === 'isFillUp' && checked) setFormData(prev => ({ ...prev, litrosLiberados: '' }));
    };

    // --- REGRA 10: BLOQUEIO POR ORÇAMENTO ---
    const checkBudgetCap = () => {
        if (!formData.obraId || extraObraOptions.includes(formData.obraId)) return true; // Ignora pátio/outros

        const obra = obras.find(o => o.id === formData.obraId);
        if (!obra || !obra.valorTotalContrato) return true; // Sem contrato definido, não bloqueia (ou bloqueia tudo, depende da regra. Assumindo liberar)

        // Soma total gasto com combustível nesta obra (estimado ou real)
        // Nota: Precisamos somar todos os refuelings dessa obra * o preço.
        // Como o preço pode variar, idealmente o backend mandaria esse total.
        // Aqui faremos uma estimativa baseada na lista atual ou deixaremos passar se não tiver dados de preço.
        // *Implementação robusta exigiria endpoint de 'gastos acumulados'*. 
        // Vou simular o bloqueio se tivermos os dados.
        
        // Simulação: Se (GastoAtual + NovoGasto) > 20% do Contrato
        // const currentFuelExpense = ... (Cálculo complexo no front)
        // const limit = obra.valorTotalContrato * 0.20;
        
        // Se ultrapassar:
        // setBudgetBlock(true);
        // setShowPasswordModal(true);
        // return false;

        return true; // Por enquanto libera até backend dar suporte a soma total financeira
    };

    // --- ENVIO WHATSAPP (Regra 11) ---
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

        // Verifica bloqueios
        if (blockReason) {
            setAlertMessage(`BLOQUEADO: ${blockReason}`);
            return;
        }

        // Verifica Orçamento (Regra 10)
        if (!checkBudgetCap()) return;

        setIsSaving(true);
        
        const payload = {
            ...formData,
            // Parse numbers
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
                setAlertMessage("Ordem atualizada com sucesso!");
            } else {
                res = await apiClient.createRefuelingOrder(payload);
                setAlertMessage(`Ordem Nº ${res.id} emitida com sucesso!`);
            }
            reloadData();
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
                    <h2 className="text-xl font-bold text-gray-800">{isEditing ? 'Editar' : 'Emitir'} Ordem de Abastecimento</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full"><X size={20}/></button>
                </div>

                {/* Área de Avisos (Regra 8 e Bloqueios) */}
                <div className="px-6 pt-4 space-y-2">
                    {warnings.map((w, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-yellow-50 text-yellow-800 rounded border border-yellow-200 text-sm">
                            <Info size={16}/> {w}
                        </div>
                    ))}
                    {blockReason && (
                        <div className="flex items-center gap-2 p-3 bg-red-100 text-red-800 rounded border border-red-200 text-sm font-bold animate-pulse">
                            <Lock size={16}/> BLOQUEIO: {blockReason}
                        </div>
                    )}
                </div>

                <form onSubmit={handleSave} className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* --- COLUNA 1: DADOS BÁSICOS --- */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Veículo *</label>
                            <select name="vehicleId" value={formData.vehicleId} onChange={(e) => {
                                // Lógica de mudança de veículo com limpeza de avisos
                                const vid = e.target.value;
                                setFormData(prev => ({...prev, vehicleId: vid}));
                                // (Auto-preenchimento roda via useEffect)
                            }} className="w-full p-2 border rounded" required>
                                <option value="">Selecione...</option>
                                {vehicles.map(v => (
                                    <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa} ({v.modelo})</option>
                                ))}
                            </select>
                        </div>

                        {/* Campos de Leitura Dinâmicos (Regra 1) */}
                        <div className="grid grid-cols-2 gap-4">
                            {isKmVehicle && (
                                <div className="col-span-2">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Odômetro (Km) *</label>
                                    <input type="number" name="odometro" value={formData.odometro} onChange={handleChange} className="w-full p-2 border rounded" placeholder={`Ant: ${lastRefuelData?.odometro || '0'}`} required/>
                                </div>
                            )}
                            {isHrVehicle && (
                                <>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Horímetro Digital</label>
                                        <input type="number" name="horimetroDigital" value={formData.horimetroDigital} onChange={handleChange} className="w-full p-2 border rounded" placeholder={`Ant: ${lastRefuelData?.horimetroDigital || '0'}`}/>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Horímetro Analógico</label>
                                        <input type="number" name="horimetroAnalogico" value={formData.horimetroAnalogico} onChange={handleChange} className="w-full p-2 border rounded" placeholder={`Ant: ${lastRefuelData?.horimetroAnalogico || '0'}`}/>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Motorista *</label>
                                <select name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full p-2 border rounded" required>
                                    <option value="">Selecione...</option>
                                    {employees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Obra / Alocação</label>
                                <select name="obraId" value={formData.obraId} onChange={handleChange} className="w-full p-2 border rounded">
                                    <option value="">Pátio / Indefinido</option>
                                    {obras.filter(o => o.status === 'ativa').map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                    {extraObraOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* --- COLUNA 2: ABASTECIMENTO --- */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Posto / Fornecedor *</label>
                            <select name="partnerId" value={formData.partnerId} onChange={handleChange} className="w-full p-2 border rounded" required>
                                <option value="">Selecione...</option>
                                {partners.map(p => <option key={p.id} value={p.id}>{p.razaoSocial}</option>)}
                            </select>
                        </div>

                        <div className="bg-gray-50 p-4 rounded border">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Combustível *</label>
                            <select name="fuelType" value={formData.fuelType} onChange={handleChange} className="w-full p-2 border rounded mb-3" required>
                                <option value="">Selecione...</option>
                                <option value="dieselS10">Diesel S10</option>
                                <option value="dieselS500">Diesel S500</option>
                                <option value="gasolina">Gasolina</option>
                                <option value="etanol">Etanol</option>
                            </select>

                            <div className="flex items-center gap-2 mb-2">
                                <input type="checkbox" name="isFillUp" checked={formData.isFillUp} onChange={handleChange} className="w-4 h-4 text-blue-600"/>
                                <label className="text-sm text-gray-700">Completar Tanque</label>
                            </div>
                            
                            {!formData.isFillUp && (
                                <input type="number" name="litrosLiberados" value={formData.litrosLiberados} onChange={handleChange} className="w-full p-2 border rounded" placeholder="Qtd. Litros Autorizados"/>
                            )}
                        </div>

                        {/* Botão WhatsApp (Regra 11) */}
                        {isEditing && (
                            <button type="button" onClick={sendToWhatsApp} className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded flex items-center justify-center gap-2 transition">
                                <Send size={18}/> Enviar Ordem via WhatsApp
                            </button>
                        )}
                    </div>
                </form>

                <div className="p-5 border-t bg-gray-50 flex justify-end gap-3 rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded">Cancelar</button>
                    <button onClick={handleSave} disabled={isSaving || !!blockReason} className="px-6 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold rounded shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                        {isSaving ? <Loader className="animate-spin" size={18}/> : (isEditing ? 'Salvar Alterações' : 'Emitir Ordem')}
                    </button>
                </div>
            </div>

            {/* Modal de Senha para Orçamento (Regra 10) */}
            {showPasswordModal && (
                <PasswordConfirmationModal 
                    message="O limite de 20% do orçamento de combustível para esta obra foi atingido. Insira a senha administrativa para liberar."
                    onConfirm={() => {
                        setBudgetBlock(false); // Libera
                        setShowPasswordModal(false);
                        handleSave(); // Tenta salvar de novo
                    }}
                    onClose={() => setShowPasswordModal(false)}
                    apiClient={apiClient}
                />
            )}
        </div>
    );
};

export default RefuelingOrderModal;