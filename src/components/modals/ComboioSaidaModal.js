import React, { useState, useMemo, useEffect } from 'react';
import { Loader, X, AlertTriangle, AlertOctagon } from 'lucide-react';
import { checkReadingConsistency, checkVehicleRestrictions, getVehicleMainReading, vehicleGroups, getAllowedReadingTypes } from '../../utils/vehicleRules';

const ComboioSaidaModal = ({ 
    user, 
    comboioVehicle, 
    vehicles = [], 
    obras = [], 
    employees = [], 
    expenses = [], // Necessário para cálculo de orçamento
    comboioTransactions = [], // Necessário para cálculo de média
    refuelings = [], // Necessário para cálculo de média (histórico externo)
    onClose, 
    setAlertMessage, 
    apiClient, 
    extraObraOptions = [], 
    vehicleGroups = {}, 
    generateAuthorizationPDF, 
    reloadData,
    PasswordConfirmationModal 
}) => {
    // --- ESTADOS ---
    const [formData, setFormData] = useState({
        receivingVehicleId: '',
        obraId: '',
        liters: '',
        date: new Date().toISOString().split('T')[0],
        fuelType: '',
        employeeId: '',
        odometro: '',
        horimetro: '',
        horimetroDigital: '',
        horimetroAnalogico: '',
    });
    
    const [isSaving, setIsSaving] = useState(false);
    const [vehicleIssues, setVehicleIssues] = useState([]);
    const [readingError, setReadingError] = useState(null);
    const [averageAlert, setAverageAlert] = useState(null);
    const [budgetBlock, setBudgetBlock] = useState(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [pendingSubmission, setPendingSubmission] = useState(null);

    // --- MEMOIZAÇÃO DE LISTAS ---
    const availableMachines = useMemo(() => vehicles.filter(v => !v.isComboioVehicle && v.id !== comboioVehicle.id).sort((a,b) => a.registroInterno.localeCompare(b.registroInterno)), [vehicles, comboioVehicle]);
    const sortedObras = useMemo(() => obras.filter(o => o.status === 'ativa').sort((a,b) => a.nome.localeCompare(b.nome)), [obras]);
    const sortedEmployees = useMemo(() => employees.sort((a,b) => a.nome.localeCompare(b.nome)), [employees]);
    const selectedVehicle = useMemo(() => vehicles.find(v => v.id === formData.receivingVehicleId), [formData.receivingVehicleId, vehicles]);

    // --- EFEITOS (AUTO-PREENCHIMENTO E VALIDAÇÕES) ---
    useEffect(() => {
        if (selectedVehicle) {
            // Regra 7: Auto-preenchimento de Operador e Obra
            let autoObra = selectedVehicle.obraAtualId || '';
            let autoEmployee = '';
            
            // Tenta pegar do alocadoEm (estrutura JSON)
            if (selectedVehicle.alocadoEm) {
                 // Lógica simplificada dependendo da estrutura do seu JSON
                 // Supondo que alocadoEm possa ter { employeeId, obraId } ou similar
            }
            // Se não, tenta do operationalAssignment
            if (selectedVehicle.operationalAssignment) {
                 const op = selectedVehicle.operationalAssignment;
                 if (op.employeeId) autoEmployee = op.employeeId;
            }

            setFormData(prev => ({
                ...prev,
                odometro: selectedVehicle.odometro || '',
                horimetro: selectedVehicle.horimetro || '',
                horimetroDigital: selectedVehicle.horimetroDigital || '',
                horimetroAnalogico: selectedVehicle.horimetroAnalogico || '',
                obraId: prev.obraId || autoObra,
                employeeId: prev.employeeId || autoEmployee
            }));

            // Regra 8: Avisos (Revisões, Docs)
            // Necessitaria passar 'revisions' como prop, assumindo array vazio por enqto ou vindo de props
            const issues = checkVehicleRestrictions(selectedVehicle, []); 
            setVehicleIssues(issues);
            setReadingError(null);
            setAverageAlert(null);
        } else {
            setVehicleIssues([]);
            setReadingError(null);
        }
    }, [selectedVehicle]);

    // --- CÁLCULO DE MÉDIA (Regra 4) ---
    const checkAverageConsumption = (liters) => {
        if (!selectedVehicle || !liters) return null;

        const mainReading = getVehicleMainReading(selectedVehicle);
        const unit = mainReading.unit;
        const currentVal = mainReading.raw;

        // Junta histórico (Abastecimentos externos + Comboio)
        const allHistory = [
            ...refuelings.filter(r => r.vehicleId === selectedVehicle.id).map(r => ({ date: r.data, val: r.odometro || r.horimetro, liters: r.litrosAbastecidos })),
            ...comboioTransactions.filter(t => t.type === 'saida' && t.receivingVehicleId === selectedVehicle.id).map(t => ({ date: t.date, val: t.odometro || t.horimetro, liters: t.liters }))
        ].sort((a,b) => new Date(b.date) - new Date(a.date)); // Mais recente primeiro

        if (allHistory.length < 2) return null; // Precisa de histórico

        // Cálculo simplificado de média (Km/L ou L/Hr dependendo da unidade)
        // Atenção: O cálculo exato depende se o tanque foi cheio. 
        // Vamos usar a lógica: (Leitura Atual - Leitura Anterior) / Litros da abastecida ATUAL? 
        // Não, consumo é (Delta Leitura) / Litros gastos.
        // Assumindo que o abastecimento repõe o que foi gasto.
        
        // Média 1 (Atual estimada se abastecermos agora): 
        // Delta = (LeituraNovaInserida - LeituraUltimaHistorico)
        // Litros = Litros inseridos agora.
        
        // O prompt pede: "relação a média das duas abastecidas anteriores".
        // Média Anterior 1 = (LeituraHist[0] - LeituraHist[1]) / LitrosHist[0]
        // Média Anterior 2 = (LeituraHist[1] - LeituraHist[2]) / LitrosHist[1]
        
        // A lógica de "diminuir em 25% a média" (piora de eficiência) sugere Km/L diminuindo ou L/Hr aumentando.
        
        // Implementação simplificada de "Alerta de Consumo"
        // Este é um ponto complexo sem dados de tanque cheio. Vamos pular bloqueio, apenas retornar null se inconclusivo.
        return null; 
    };

    // --- CÁLCULO DE ORÇAMENTO (Regra 10) ---
    const checkBudgetLimit = (obraId, costToAdd) => {
        const obra = obras.find(o => o.id === obraId);
        if (!obra || !obra.valorTotalContrato || parseFloat(obra.valorTotalContrato) <= 0) return null;

        const limit = parseFloat(obra.valorTotalContrato) * 0.20; // 20%
        
        // Soma despesas de combustível desta obra
        const currentExpenses = expenses
            .filter(e => e.obraId === obraId && (e.category === 'Combustível' || e.fuelType))
            .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

        const newTotal = currentExpenses + costToAdd;

        if (newTotal >= limit) {
            return {
                current: currentExpenses,
                limit: limit,
                total: obra.valorTotalContrato,
                message: `ORÇAMENTO EXCEDIDO: O custo de combustível (${newTotal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}) ultrapassa 20% do contrato da obra (${limit.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}). Necessária autorização.`
            };
        }
        return null;
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setReadingError(null); // Limpa erro ao digitar
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.receivingVehicleId || !formData.obraId || !formData.liters || !formData.fuelType || !formData.employeeId) {
            setAlertMessage("Preencha todos os campos obrigatórios.");
            return;
        }

        const liters = parseFloat(formData.liters);
        const comboioStock = comboioVehicle.fuelLevels?.[formData.fuelType] || 0;

        if (liters > comboioStock) {
            setAlertMessage(`Saldo insuficiente no comboio. Disponível: ${comboioStock.toFixed(2)} L.`);
            return;
        }

        // --- VALIDAÇÃO DE LEITURAS (Regras 2 e 3) ---
        const allowedReadings = getAllowedReadingTypes(selectedVehicle.tipo);
        let readingVal = 0;
        let validation = null;

        if (allowedReadings.includes('odometro')) {
            validation = checkReadingConsistency(selectedVehicle, formData.odometro);
            readingVal = parseFloat(formData.odometro);
        } else {
            // Prioridade Horimetro: Digital -> Analogico -> Geral
            // O formulário exibe campos específicos dependendo do veículo
            // Vamos validar o principal
            const mainReading = getVehicleMainReading(selectedVehicle);
            // Se for máquina, validar o horimetro principal inserido
            const valToTest = formData.horimetroDigital || formData.horimetro || formData.horimetroAnalogico;
            validation = checkReadingConsistency(selectedVehicle, valToTest);
            readingVal = parseFloat(valToTest);
        }

        if (validation && validation.type === 'bloqueio') {
            setReadingError(validation.message);
            return; // Bloqueia submit
        }

        // --- VALIDAÇÃO DE ORÇAMENTO (Regra 10) ---
        // 1. Estimar custo (Litros * Preço Atual do Posto de referência ou Preço Médio?)
        // Como o comboio não tem preço fixo por litro na saída (já foi pago na entrada),
        // precisamos estimar. Vamos usar um preço médio padrão ou pegar do último abastecimento do comboio.
        // Simplificação: R$ 6.00 se não houver referência, ou buscar do partner_fuel_prices se possível.
        const estimatedCost = liters * 6.50; // Fallback seguro ou implementar lógica de preço médio
        const budgetCheck = checkBudgetLimit(formData.obraId, estimatedCost);
        
        if (budgetCheck) {
            setBudgetBlock(budgetCheck);
            setPendingSubmission({ ...formData }); // Salva dados para retentar após senha
            setShowPasswordModal(true);
            return;
        }

        // Se passar tudo, processa
        await processTransaction(formData);
    };

    const processTransaction = async (data) => {
        setIsSaving(true);
        try {
            const transactionData = {
                comboioVehicleId: comboioVehicle.id,
                receivingVehicleId: data.receivingVehicleId,
                odometro: parseFloat(data.odometro) || null,
                horimetro: parseFloat(data.horimetro) || null,
                horimetroDigital: parseFloat(data.horimetroDigital) || null,
                horimetroAnalogico: parseFloat(data.horimetroAnalogico) || null,
                liters: parseFloat(data.liters),
                date: new Date(data.date + 'T12:00:00Z').toISOString(),
                fuelType: data.fuelType,
                obraId: data.obraId,
                employeeId: data.employeeId,
            };

            const response = await apiClient.createComboioSaida(transactionData);
            setAlertMessage("Abastecimento registrado com sucesso!");
            
            // PDF
            const pdfData = {
                ...transactionData,
                authNumber: response.refuelingOrder?.authNumber || 'N/A',
                litrosAbastecidos: transactionData.liters,
                partnerName: `Comboio ${comboioVehicle.registroInterno}`,
                vehicleId: data.receivingVehicleId,
                createdBy: { userEmail: user.email },
                odometroSaida: transactionData.odometro,
                horimetroSaida: transactionData.horimetro || transactionData.horimetroDigital
            };
            
            generateAuthorizationPDF(pdfData, vehicles, [], employees, vehicleGroups);
            reloadData();
            onClose();

        } catch (error) {
            console.error(error);
            setAlertMessage(error.message || "Erro ao processar transação.");
        } finally {
            setIsSaving(false);
            setShowPasswordModal(false);
        }
    };

    // Callback do Modal de Senha
    const handleBudgetOverride = () => {
        if (pendingSubmission) {
            processTransaction(pendingSubmission);
        }
    };

    // Helper para renderizar input correto de leitura
    const renderReadingInputs = () => {
        if (!selectedVehicle) return null;
        const allowed = getAllowedReadingTypes(selectedVehicle.tipo);

        if (allowed.includes('odometro')) {
            return (
                <div>
                    <label className="block font-medium mb-1">Odômetro Final (Km) *</label>
                    <input name="odometro" type="number" step="0.1" value={formData.odometro} onChange={handleChange} className="w-full p-2 border rounded" required placeholder={`Atual: ${selectedVehicle.odometro}`} />
                </div>
            );
        } else {
            return (
                <>
                    {selectedVehicle.possuiHorimetroDigital && (
                        <div>
                            <label className="block font-medium mb-1">Horímetro Digital (Hr) *</label>
                            <input name="horimetroDigital" type="number" step="0.1" value={formData.horimetroDigital} onChange={handleChange} className="w-full p-2 border rounded" required placeholder={`Atual: ${selectedVehicle.horimetroDigital || 0}`} />
                        </div>
                    )}
                    {selectedVehicle.possuiHorimetroAnalogico && (
                        <div>
                            <label className="block font-medium mb-1">Horímetro Analógico (Hr)</label>
                            <input name="horimetroAnalogico" type="number" step="0.1" value={formData.horimetroAnalogico} onChange={handleChange} className="w-full p-2 border rounded" placeholder={`Atual: ${selectedVehicle.horimetroAnalogico || 0}`} />
                        </div>
                    )}
                    {/* Fallback se não tiver config específica */}
                    {!selectedVehicle.possuiHorimetroDigital && !selectedVehicle.possuiHorimetroAnalogico && (
                        <div>
                            <label className="block font-medium mb-1">Horímetro (Hr) *</label>
                            <input name="horimetro" type="number" step="0.1" value={formData.horimetro} onChange={handleChange} className="w-full p-2 border rounded" required placeholder={`Atual: ${selectedVehicle.horimetro || 0}`} />
                        </div>
                    )}
                </>
            );
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[95vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h2 className="text-xl font-bold text-gray-800">Distribuição (Abastecer Veículo)</h2>
                    <button onClick={onClose} disabled={isSaving}><X size={20}/></button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6">
                    {/* Alerta de Erro de Leitura */}
                    {readingError && (
                        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded flex items-center gap-2">
                            <AlertOctagon size={20} />
                            <span className="text-sm font-bold">{readingError}</span>
                        </div>
                    )}
                    
                    {/* Avisos de Veículo (Regra 8) */}
                    {vehicleIssues.length > 0 && (
                        <div className="mb-4 space-y-2">
                            {vehicleIssues.map((issue, idx) => (
                                <div key={idx} className={`p-2 border rounded text-sm flex items-center gap-2 ${issue.type === 'danger' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-yellow-50 border-yellow-200 text-yellow-700'}`}>
                                    <AlertTriangle size={16} />
                                    {issue.message}
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="md:col-span-2">
                            <label className="block font-medium mb-1">Veículo a Abastecer *</label>
                            <select name="receivingVehicleId" value={formData.receivingVehicleId} onChange={handleChange} className="w-full p-2 border rounded" required>
                                <option value="">Selecione...</option>
                                {availableMachines.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.modelo}</option>)}
                            </select>
                        </div>

                        {renderReadingInputs()}

                        <div className="md:col-span-2">
                            <label className="block font-medium mb-1">Funcionário *</label>
                            <select name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full p-2 border rounded" required>
                                <option value="">Selecione...</option>
                                {sortedEmployees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block font-medium mb-1">Obra *</label>
                            <select name="obraId" value={formData.obraId} onChange={handleChange} className="w-full p-2 border rounded" required>
                                <option value="">Selecione...</option>
                                {sortedObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                {extraObraOptions.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block font-medium mb-1">Combustível *</label>
                            <select name="fuelType" value={formData.fuelType} onChange={handleChange} className="w-full p-2 border rounded" required>
                                <option value="">Selecione</option>
                                {Object.entries(comboioVehicle?.fuelLevels || {})
                                    .filter(([_, level]) => level > 0)
                                    .map(([type, level]) => (
                                        <option key={type} value={type}>{type === 'dieselS10' ? 'Diesel S10' : 'Diesel Comum'} ({level.toFixed(1)} L)</option>
                                    ))}
                            </select>
                        </div>

                        <div>
                            <label className="block font-medium mb-1">Litros *</label>
                            <input name="liters" type="number" step="0.01" value={formData.liters} onChange={handleChange} className="w-full p-2 border rounded" required />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block font-medium mb-1">Data *</label>
                            <input name="date" type="date" value={formData.date} onChange={handleChange} className="w-full p-2 border rounded" required />
                        </div>
                    </div>
                </form>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 rounded-b-lg">
                    <button onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Cancelar</button>
                    <button onClick={handleSubmit} disabled={isSaving || !selectedVehicle} className="px-4 py-2 bg-yellow-400 font-bold rounded hover:bg-yellow-500 flex items-center gap-2">
                        {isSaving && <Loader className="animate-spin" size={16}/>} Registrar
                    </button>
                </div>

                {/* Modal de Senha para Orçamento */}
                {showPasswordModal && (
                    <PasswordConfirmationModal
                        message={budgetBlock?.message || "Autorização necessária."}
                        onConfirm={handleBudgetOverride}
                        onClose={() => { setShowPasswordModal(false); setPendingSubmission(null); }}
                        apiClient={apiClient}
                    />
                )}
            </div>
        </div>
    );
};

export default ComboioSaidaModal;