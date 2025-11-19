import React, { useState, useMemo } from 'react';
import { Loader, X, AlertTriangle, Save } from 'lucide-react';

// --- MODAL DE CRIAÇÃO/EDIÇÃO DE VEÍCULO ---
const VehicleModal = ({ user, vehicle, vehicles = [], vehicleTypes = [], onClose, setAlertMessage, apiClient, reloadData, vehicleGroups = {} }) => {
    // Estado inicial ajustado para API
    const [formData, setFormData] = useState({
        placa: vehicle?.placa || '',
        registroInterno: vehicle?.registroInterno || '',
        capacidade: vehicle?.capacidade?.toString() || '',
        tipo: vehicle?.tipo || (vehicleTypes.length > 0 ? vehicleTypes[0] : ''),
        marca: vehicle?.marca || '',
        modelo: vehicle?.modelo || '',
        odometro: vehicle?.odometro?.toString() || '0',
        horimetro: vehicle?.horimetro?.toString() || '0',
        horimetroDigital: vehicle?.horimetroDigital?.toString() || '0',
        horimetroAnalogico: vehicle?.horimetroAnalogico?.toString() || '0',
        possuiHorimetroAnalogico: vehicle?.possuiHorimetroAnalogico || false,
        mediaCalculo: vehicle?.mediaCalculo || 'odometro',
        isComboioVehicle: vehicle?.isComboioVehicle || false,
        fuelCapacity: vehicle?.fuelCapacity?.toString() || '',
        anoFabricacao: vehicle?.ano_fabricacao?.toString() || '',
        anoModelo: vehicle?.ano_modelo?.toString() || '',
        chassi: vehicle?.chassi || '',
        validadeTacografo: vehicle?.validadeTacografo ? new Date(vehicle.validadeTacografo).toISOString().split('T')[0] : '',
        validadeAET_DAER: vehicle?.validadeAET_DAER ? new Date(vehicle.validadeAET_DAER).toISOString().split('T')[0] : '',
        validadeAET_DNIT: vehicle?.validadeAET_DNIT ? new Date(vehicle.validadeAET_DNIT).toISOString().split('T')[0] : '',
        canCirculate: vehicle?.canCirculate !== undefined ? vehicle.canCirculate : true,
    });
    
    const [fotoFile, setFotoFile] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        
        // LÓGICA INVERTIDA: Checkbox "Não Pode Circular"
        if (name === 'naoPodeCircular') {
            setFormData(prev => ({ ...prev, canCirculate: !checked }));
            return;
        }

        setFormData(prev => {
            const newState = {
                ...prev,
                [name]: type === 'checkbox' ? checked : value
            };

            if (name === 'possuiHorimetroAnalogico' && !checked) {
                 newState.horimetroAnalogico = '0';
            }

            // Regra de Exceção: Caminhões Prancha forçam Odômetro
            if (name === 'tipo') {
                if (value === 'Caminhões Prancha' || value === 'Caminhão Prancha') {
                    newState.mediaCalculo = 'odometro';
                } else {
                    const groups = vehicleGroups || {};
                    const newGroup = Object.keys(groups).find(group => groups[group]?.includes(value));
                    if (newGroup === 'Caminhões') {
                         newState.mediaCalculo = 'horimetro'; // Padrão para caminhões agora é Hr? Se for, ajuste aqui.
                    }
                }
            }

            return newState;
        });
    };

    const handleFileChange = (e) => {
        if (e.target.files[0]) {
            const file = e.target.files[0];
            if (file.size > 5 * 1024 * 1024) {
                setError("O arquivo de imagem é muito grande (máx 5MB).");
                setFotoFile(null);
                e.target.value = null;
            } else if (!file.type.startsWith('image/')) {
                setError("Tipo de arquivo inválido. Selecione uma imagem.");
                setFotoFile(null);
                e.target.value = null;
            } else {
                setError('');
                setFotoFile(file);
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const isEditing = !!vehicle;

        if (!formData.placa || !formData.registroInterno || !formData.tipo || !formData.marca || !formData.modelo) {
             setError('Placa, Registro Interno, Tipo, Marca e Modelo são obrigatórios.');
             return;
         }

        // Validações de duplicidade (apenas se mudou o valor ou é novo)
        if (!isEditing || (vehicle && vehicle.placa !== formData.placa)) {
             const plateExists = vehicles.some(v => v.placa === formData.placa && v.id !== vehicle?.id);
             if (plateExists) { setError('Já existe um veículo com esta placa.'); return; }
        }
        if (!isEditing || (vehicle && vehicle.registroInterno !== formData.registroInterno)) {
            const internalIdExists = vehicles.some(v => v.registroInterno === formData.registroInterno && v.id !== vehicle?.id);
            if (internalIdExists) { setError('Já existe um veículo com este registro interno.'); return; }
        }

        setIsSaving(true);

        const dataToSave = {
            ...formData,
            odometro: parseFloat(formData.odometro) || null,
            horimetro: parseFloat(formData.horimetro) || null,
            horimetroDigital: parseFloat(formData.horimetroDigital) || null,
            horimetroAnalogico: formData.possuiHorimetroAnalogico ? (parseFloat(formData.horimetroAnalogico) || null) : null,
            fuelCapacity: parseFloat(formData.fuelCapacity) || null,
            ano_fabricacao: parseInt(formData.anoFabricacao, 10) || null,
            ano_modelo: parseInt(formData.anoModelo, 10) || null,
            capacidade: parseFloat(formData.capacidade) || null,
            validadeTacografo: formData.validadeTacografo || null,
            validadeAET_DAER: formData.validadeAET_DAER || null,
            validadeAET_DNIT: formData.validadeAET_DNIT || null,
        };
        delete dataToSave.anoFabricacao;
        delete dataToSave.anoModelo;

        try {
            let vehicleId = vehicle?.id;
            let successMessage = '';

            if (isEditing) {
                await apiClient.updateVehicle(vehicle.id, dataToSave);
                successMessage = `Veículo ${formData.registroInterno} atualizado!`;
            } else {
                const dataWithDefaults = { ...dataToSave, status: 'Disponível' };
                const newVehicle = await apiClient.createVehicle(dataWithDefaults); 
                vehicleId = newVehicle.id;
                successMessage = `Veículo ${formData.registroInterno} adicionado!`;
            }

            if (fotoFile && vehicleId) {
                const uploadFormData = new FormData();
                uploadFormData.append('fotoFile', fotoFile); 
                try {
                    await apiClient.uploadVehicleImage(vehicleId, uploadFormData);
                    successMessage += ' Imagem enviada com sucesso.';
                } catch (uploadError) {
                    console.error("Erro ao enviar imagem:", uploadError);
                    setAlertMessage(successMessage + ' (Falha ao enviar imagem: ' + uploadError.message + ')');
                    reloadData();
                    onClose();
                    return;
                }
            }
            
            setAlertMessage(successMessage);
            reloadData();
            onClose();
        } catch (err) {
            console.error("Erro ao salvar veículo:", err);
            setError(err.response?.data?.message || "Ocorreu um erro ao salvar os dados.");
        } finally {
            setIsSaving(false);
        }
    };

    const currentGroup = useMemo(() => {
         const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
         return Object.keys(groups).find(group => groups[group]?.includes(formData.tipo))
     }, [formData.tipo, vehicleGroups]);
     
    const apiBaseUrl = (process.env.REACT_APP_API_URL || 'http://localhost:3001/api').replace('/api', '');
    const previewImageUrl = fotoFile 
        ? URL.createObjectURL(fotoFile)
        : (vehicle?.fotoURL ? (vehicle.fotoURL.startsWith('http') ? vehicle.fotoURL : `${apiBaseUrl}${vehicle.fotoURL}`) : 'https://placehold.co/100x75/e2e8f0/cbd5e0?text=S/Foto');

    // Determina se deve mostrar Odômetro
    // REGRA: Caminhões NÃO mostram Odômetro, EXCETO se for "Caminhões Prancha"
    const showOdometro = useMemo(() => {
        if (currentGroup === 'Caminhões') {
            return formData.tipo === 'Caminhões Prancha' || formData.tipo === 'Caminhão Prancha';
        }
        // Para outros grupos (Leves), mostra. Máquinas Pesadas já tem lógica própria abaixo.
        if (currentGroup === 'Máquinas Pesadas') return false;
        return true; 
    }, [currentGroup, formData.tipo]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col my-auto">
                <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                    <h2 className="text-xl sm:text-2xl font-bold">{vehicle ? 'Editar Veículo' : 'Adicionar Veículo'}</h2>
                     <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                </div>
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                    <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                        
                        {/* --- Coluna 1: Dados Principais --- */}
                        <div className="space-y-4">
                             <div>
                                <label className="block font-medium text-gray-700 mb-1">Placa *</label>
                                <input name="placa" value={formData.placa} onChange={handleChange} placeholder="ABC1D23" required className="p-2 border rounded w-full" />
                            </div>
                             <div>
                                <label className="block font-medium text-gray-700 mb-1">Registro Interno *</label>
                                <input name="registroInterno" value={formData.registroInterno} onChange={handleChange} placeholder="Ex: C01, M05" required className="p-2 border rounded w-full" />
                            </div>
                             <div>
                                <label className="block font-medium text-gray-700 mb-1">Tipo *</label>
                                <select name="tipo" value={formData.tipo} onChange={handleChange} className="p-2 border rounded w-full bg-white" required>
                                    <option value="">Selecione...</option>
                                    {(vehicleTypes || []).map(type => <option key={type} value={type}>{type}</option>)}
                                </select>
                             </div>
                             <div>
                                <label className="block font-medium text-gray-700 mb-1">Marca *</label>
                                <input name="marca" value={formData.marca} onChange={handleChange} placeholder="Ex: Volvo" required className="p-2 border rounded w-full" />
                            </div>
                             <div>
                                <label className="block font-medium text-gray-700 mb-1">Modelo *</label>
                                <input name="modelo" value={formData.modelo} onChange={handleChange} placeholder="Ex: FH 540" required className="p-2 border rounded w-full" />
                            </div>
                              <div>
                                 <label className="block font-medium text-gray-700 mb-1">Capacidade (m³)</label>
                                 <input name="capacidade" value={formData.capacidade} onChange={handleChange} placeholder="Ex: 12" type="number" step="any" className="p-2 border rounded w-full" />
                             </div>
                        </div>

                         {/* --- Coluna 2: Leituras e Detalhes --- */}
                        <div className="space-y-4">
                            {/* Máquinas Pesadas */}
                            {currentGroup === 'Máquinas Pesadas' && (
                                <>
                                    <div>
                                        <label className="block font-medium text-gray-700 mb-1">Horímetro Digital (Hrs)</label>
                                        <input name="horimetroDigital" value={formData.horimetroDigital} onChange={handleChange} type="number" step="0.1" className="p-2 border rounded w-full" />
                                    </div>
                                    <div className="flex items-center">
                                        <input name="possuiHorimetroAnalogico" id="possuiHorimetroAnalogico" type="checkbox" checked={formData.possuiHorimetroAnalogico} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"/>
                                        <label htmlFor="possuiHorimetroAnalogico" className="ml-2 block text-gray-900 cursor-pointer">Possui Horímetro Analógico?</label>
                                    </div>
                                    {formData.possuiHorimetroAnalogico && (
                                        <div>
                                            <label className="block font-medium text-gray-700 mb-1">Horímetro Analógico (Hrs)</label>
                                            <input name="horimetroAnalogico" value={formData.horimetroAnalogico} onChange={handleChange} type="number" step="0.1" className="p-2 border rounded w-full" />
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Caminhões (Standard e Trecho) */}
                            {currentGroup === 'Caminhões' && (
                                <>
                                    {/* Só mostra Odômetro se for Prancha */}
                                    {showOdometro && (
                                        <div>
                                            <label className="block font-medium text-gray-700 mb-1">Odômetro (Km)</label>
                                            <input name="odometro" value={formData.odometro} onChange={handleChange} type="number" step="any" className="p-2 border rounded w-full" />
                                        </div>
                                    )}
                                     
                                     {/* Sempre mostra Horímetro para Caminhões */}
                                     <div>
                                        <label className="block font-medium text-gray-700 mb-1">Horímetro (Hrs)</label>
                                        <input name="horimetro" value={formData.horimetro} onChange={handleChange} type="number" step="0.1" className="p-2 border rounded w-full" />
                                    </div>

                                     <div>
                                        <label className="block font-medium text-gray-700 mb-1">Calcular Média Por</label>
                                        <select 
                                            name="mediaCalculo" 
                                            value={formData.mediaCalculo} 
                                            onChange={handleChange} 
                                            className="p-2 border rounded w-full bg-white disabled:bg-gray-100 disabled:text-gray-500"
                                            disabled={formData.tipo === 'Caminhões Prancha'} 
                                        >
                                            <option value="odometro">Odômetro (Km/L)</option>
                                            <option value="horimetro">Horímetro (L/Hr)</option>
                                        </select>
                                        {formData.tipo === 'Caminhões Prancha' && (
                                            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                                                <p className="text-xs font-semibold text-blue-700">Exceção: Caminhão de Trecho</p>
                                                <p className="text-xs text-blue-600">Usa estritamente Odômetro (Km).</p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* Veículos Leves / Outros */}
                            {(currentGroup === 'Veículos Leves' || !currentGroup) && ( 
                                <div>
                                    <label className="block font-medium text-gray-700 mb-1">Odômetro (Km)</label>
                                    <input name="odometro" value={formData.odometro} onChange={handleChange} type="number" step="any" className="p-2 border rounded w-full" />
                                </div>
                            )}

                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-medium text-gray-700 mb-1">Ano Fabric.</label>
                                    <input name="anoFabricacao" value={formData.anoFabricacao} onChange={handleChange} placeholder="AAAA" type="number" className="p-2 border rounded w-full" />
                                </div>
                                <div>
                                    <label className="block font-medium text-gray-700 mb-1">Ano Modelo</label>
                                    <input name="anoModelo" value={formData.anoModelo} onChange={handleChange} placeholder="AAAA" type="number" className="p-2 border rounded w-full" />
                                </div>
                            </div>
                             <div>
                                <label className="block font-medium text-gray-700 mb-1">Chassi</label>
                                <input name="chassi" value={formData.chassi} onChange={handleChange} placeholder="Nº do Chassi" className="p-2 border rounded w-full" />
                            </div>
                            <div>
                                <label className="block font-medium text-gray-700 mb-1">Capacidade Tanque (L)</label>
                                <input name="fuelCapacity" value={formData.fuelCapacity} onChange={handleChange} placeholder="Ex: 300" type="number" step="any" className="p-2 border rounded w-full" />
                            </div>
                        </div>

                         {/* --- Coluna 3: Checkboxes, Datas e FOTO --- */}
                        <div className="space-y-4">
                            <div>
                                <label className="block font-medium text-gray-700 mb-1">Foto do Veículo</label>
                                <div className="mt-1 flex items-center gap-4">
                                    <img 
                                        src={previewImageUrl} 
                                        alt="Preview" 
                                        className="w-24 h-20 object-cover rounded-md bg-gray-100"
                                        onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/100x75/e2e8f0?text=Erro'; }}
                                    />
                                    <label className="cursor-pointer bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-yellow-500">
                                        <span>{fotoFile ? 'Trocar Imagem' : 'Carregar Imagem'}</span>
                                        <input type="file" name="fotoFile" accept="image/*" onChange={handleFileChange} className="sr-only" />
                                    </label>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">Máx 5MB. (JPG, PNG)</p>
                            </div>

                             <div className="flex items-center pt-1 border-t mt-4 pt-4"> 
                                <input name="isComboioVehicle" id="isComboioVehicle" type="checkbox" checked={formData.isComboioVehicle} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"/>
                                <label htmlFor="isComboioVehicle" className="ml-2 block font-medium text-gray-900 cursor-pointer">É um veículo Comboio?</label>
                            </div>
                            
                            {/* CHECKBOX INVERTIDO - NÃO PODE CIRCULAR */}
                            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <label className="flex items-center space-x-3 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        name="naoPodeCircular" 
                                        checked={!formData.canCirculate} // Invertido
                                        onChange={handleChange} 
                                        className="h-5 w-5 text-red-600 focus:ring-red-500 border-gray-300 rounded" 
                                    />
                                    <span className="text-red-700 font-bold flex items-center gap-2">
                                        <AlertTriangle size={18} />
                                        NÃO Pode Circular?
                                    </span>
                                </label>
                                {!formData.canCirculate && (
                                    <p className="text-xs text-red-600 mt-2 ml-8">
                                        Impede alocação sem senha de supervisor.
                                    </p>
                                )}
                            </div>

                            {currentGroup === 'Caminhões' && (
                                <div className="mt-4 pt-4 border-t space-y-4">
                                     <h3 className="font-semibold text-gray-700">Validades</h3>
                                     <div>
                                        <label className="block font-medium text-gray-700 mb-1">Tacógrafo</label>
                                        <input name="validadeTacografo" value={formData.validadeTacografo} onChange={handleChange} type="date" className="p-2 border rounded w-full" />
                                    </div>
                                     <div>
                                        <label className="block font-medium text-gray-700 mb-1">AET DAER/RS</label>
                                        <input name="validadeAET_DAER" value={formData.validadeAET_DAER} onChange={handleChange} type="date" className="p-2 border rounded w-full" />
                                    </div>
                                     <div>
                                        <label className="block font-medium text-gray-700 mb-1">AET DNIT</label>
                                        <input name="validadeAET_DNIT" value={formData.validadeAET_DNIT} onChange={handleChange} type="date" className="p-2 border rounded w-full" />
                                    </div>
                                </div>
                            )}

                             {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
                        </div>
                    </div>

                    <div className="p-4 bg-gray-50 border-t flex flex-col sm:flex-row justify-end gap-2 sticky bottom-0 z-10">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium w-full sm:w-auto" disabled={isSaving}>Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm w-full sm:w-auto">
                            {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : <><Save size={18} className="mr-1"/> Salvar</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default VehicleModal;