import React, { useState, useEffect, useMemo } from 'react';
import { Loader, X } from 'lucide-react';

const ComboioEntradaModal = ({ 
    user, 
    comboioVehicle, 
    transactionData = null, // Se existir, é modo edição
    partners = [], 
    employees = [], 
    onClose, 
    setAlertMessage, 
    apiClient, 
    vehicleGroups = {}, 
    generateAuthorizationPDF, 
    obras = [], 
    extraObraOptions = [], 
    reloadData 
}) => {
    const isEditing = !!transactionData;

    const [formData, setFormData] = useState({
        partnerId: '',
        liters: '',
        date: new Date().toISOString().split('T')[0],
        fuelType: '',
        employeeId: '',
        obraId: '',
    });
    const [isSaving, setIsSaving] = useState(false);

    // Carrega dados se for edição
    useEffect(() => {
        if (isEditing && transactionData) {
            setFormData({
                partnerId: transactionData.partnerId || '',
                liters: transactionData.liters || '',
                date: transactionData.date ? new Date(transactionData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                fuelType: transactionData.fuelType || '',
                employeeId: transactionData.employeeId || '',
                obraId: transactionData.obraId || '',
            });
        }
    }, [isEditing, transactionData]);

    // Ordenação
    const sortedObras = useMemo(() => [...obras].filter(o => o.status === 'ativa').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);
    const sortedEmployees = useMemo(() => [...employees].sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [employees]);
    const sortedPartners = useMemo(() => [...partners].sort((a,b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '')), [partners]);

    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.partnerId || !formData.liters || !formData.fuelType || !formData.employeeId || !formData.obraId) {
            setAlertMessage("Preencha todos os campos obrigatórios (*).");
            return;
        }

        const liters = parseFloat(formData.liters);
        if (isNaN(liters) || liters <= 0) {
            setAlertMessage("Quantidade de litros inválida.");
            return;
        }

        setIsSaving(true);

        const payload = {
            id: isEditing ? transactionData.id : undefined,
            comboioVehicleId: comboioVehicle.id,
            partnerId: formData.partnerId,
            employeeId: formData.employeeId,
            obraId: formData.obraId,
            liters: liters,
            date: new Date(formData.date + 'T12:00:00Z').toISOString(),
            fuelType: formData.fuelType,
            // Campos de leitura removidos pois o comboio apenas transporta nesta etapa
            odometro: null,
            horimetro: null,
            createdBy: {
                userId: user.id || user.uid,
                userEmail: user.email || 'sistema@frotasmak.com'
            }
        };

        try {
            let response;
            if (isEditing) {
                response = await apiClient.updateComboioTransaction(transactionData.id, payload);
                setAlertMessage("Entrada atualizada com sucesso!");
            } else {
                response = await apiClient.createComboioEntrada(payload);
                setAlertMessage("Entrada registrada com sucesso!");
            }
            
            // Geração do PDF apenas se não for edição
            if (!isEditing) {
                const partner = partners.find(p => p.id === formData.partnerId);
                const pdfData = {
                    ...payload,
                    authNumber: response.refuelingOrder?.authNumber || 'N/A',
                    litrosAbastecidos: response.refuelingOrder?.litrosAbastecidos || liters,
                    partnerName: partner?.razaoSocial || 'N/A',
                    vehicleId: comboioVehicle.id,
                    createdBy: { userEmail: user.email }
                };
                generateAuthorizationPDF(pdfData, [comboioVehicle], partners, employees, vehicleGroups);
            }

            reloadData();
            onClose();
        } catch (error) {
            console.error(error);
            setAlertMessage(error.message || "Erro ao salvar entrada.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[95vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h2 className="text-xl font-bold text-gray-800">{isEditing ? 'Editar Entrada' : 'Entrada de Combustível (Abastecer Comboio)'}</h2>
                    <button onClick={onClose} disabled={isSaving}><X size={20}/></button>
                </div>
                
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="md:col-span-2 p-3 bg-blue-50 border border-blue-100 rounded text-blue-800">
                            Veículo Comboio: <strong>{comboioVehicle?.registroInterno} - {comboioVehicle?.modelo}</strong>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block font-medium mb-1">Posto Fornecedor *</label>
                            <select name="partnerId" value={formData.partnerId} onChange={handleChange} className="w-full p-2 border rounded" required>
                                <option value="">Selecione...</option>
                                {sortedPartners.map(p => <option key={p.id} value={p.id}>{p.razaoSocial}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block font-medium mb-1">Funcionário Responsável *</label>
                            <select name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full p-2 border rounded" required>
                                <option value="">Selecione...</option>
                                {sortedEmployees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block font-medium mb-1">Obra (Centro de Custo) *</label>
                            <select name="obraId" value={formData.obraId} onChange={handleChange} className="w-full p-2 border rounded" required>
                                <option value="">Selecione...</option>
                                {sortedObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                {extraObraOptions.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block font-medium mb-1">Tipo de Combustível *</label>
                            <select name="fuelType" value={formData.fuelType} onChange={handleChange} className="w-full p-2 border rounded" required>
                                <option value="">Selecione...</option>
                                <option value="dieselComum">Diesel Comum</option>
                                <option value="dieselS10">Diesel S10</option>
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
                    <button onClick={handleSubmit} disabled={isSaving} className="px-4 py-2 bg-yellow-400 font-bold rounded hover:bg-yellow-500 flex items-center gap-2">
                        {isSaving && <Loader className="animate-spin" size={16}/>} {isEditing ? 'Salvar Alterações' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ComboioEntradaModal;