import React, { useState, useMemo } from 'react';
import { Loader, X, AlertTriangle, Save, Camera, ShieldCheck, Briefcase } from 'lucide-react';
import { checkReadingConsistency, vehicleGroups } from '../utils/vehicleRules';

// --- MODAL DE CRIAÇÃO/EDIÇÃO DE VEÍCULO (REVISADO v2.0 - FIX IMPORT) ---
const VehicleModal = ({ user, vehicle, vehicles = [], vehicleTypes = [], onClose, setAlertMessage, apiClient, reloadData, PasswordConfirmationModal }) => {
    
    // Estado do Formulário
    const [formData, setFormData] = useState({
        placa: vehicle?.placa || '',
        registroInterno: vehicle?.registroInterno || '',
        capacidade: vehicle?.capacidade?.toString() || '',
        tipo: vehicle?.tipo || (vehicleTypes.length > 0 ? vehicleTypes[0] : ''),
        marca: vehicle?.marca || '',
        modelo: vehicle?.modelo || '',
        
        // Leituras
        odometro: vehicle?.odometro?.toString() || '0',
        horimetro: vehicle?.horimetro?.toString() || '0',
        horimetroDigital: vehicle?.horimetroDigital?.toString() || '0',
        horimetroAnalogico: vehicle?.horimetroAnalogico?.toString() || '0',
        possuiHorimetroAnalogico: vehicle?.possuiHorimetroAnalogico || false,
        mediaCalculo: vehicle?.mediaCalculo || 'odometro',
        
        // Configurações Especiais
        isComboioVehicle: vehicle?.isComboioVehicle || false,
        isOutsourced: vehicle?.isOutsourced || false, // Regra 7: Terceirizado
        fuelCapacity: vehicle?.fuelCapacity?.toString() || '',
        
        // Detalhes
        anoFabricacao: vehicle?.ano_fabricacao?.toString() || '',
        anoModelo: vehicle?.ano_modelo?.toString() || '',
        chassi: vehicle?.chassi || '',
        
        // Validades
        validadeTacografo: vehicle?.validadeTacografo ? new Date(vehicle.validadeTacografo).toISOString().split('T')[0] : '',
        validadeAET_DAER: vehicle?.validadeAET_DAER ? new Date(vehicle.validadeAET_DAER).toISOString().split('T')[0] : '',
        validadeAET_DNIT: vehicle?.validadeAET_DNIT ? new Date(vehicle.validadeAET_DNIT).toISOString().split('T')[0] : '',
        
        // Bloqueio
        canCirculate: (vehicle?.canCirculate === false || vehicle?.canCirculate === 0) ? false : true,
    });
    
    const [fotoFile, setFotoFile] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    
    // Controle do Modal de Senha para Override
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [pendingSaveData, setPendingSaveData] = useState(null);
    const [violationMessage, setViolationMessage] = useState('');

    // --- Helpers de Grupo e Tipo ---
    const currentGroup = useMemo(() => {
        const groups = vehicleGroups || {};
        return Object.keys(groups).find(group => groups[group]?.includes(formData.tipo));
    }, [formData.tipo]);

    const showOdometro = useMemo(() => {
        // Regra 1: Leves e Trecho usam KM. Pesados usam Hr.
        if (currentGroup === 'Veículos Leves' || currentGroup === 'Caminhões de Trecho') return true;
        if (currentGroup === 'Caminhões') {
             // Exceção: Caminhão Prancha é Trecho, mas as vezes cai em Caminhões dependendo do cadastro.
             // Vamos forçar visualização de odometro para caminhões genéricos também, pois alguns têm os dois.
             return true; 
        }
        return false; // Máquinas Pesadas
    }, [currentGroup]);

    const showHorimetro = useMemo(() => {
        return currentGroup === 'Máquinas Pesadas' || currentGroup === 'Caminhões';
    }, [currentGroup]);

    // --- Handlers ---
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        
        // Checkbox Invertido "Não Pode Circular"
        if (name === 'naoPodeCircular') {
            setFormData(prev => ({ ...prev, canCirculate: !checked }));
            return;
        }

        setFormData(prev => {
            const newState = {
                ...prev,
                [name]: type === 'checkbox' ? checked : value
            };

            // Lógica de reset se desmarcar analógico
            if (name === 'possuiHorimetroAnalogico' && !checked) {
                 newState.horimetroAnalogico = '0';
            }

            // Regra de Exceção para Cálculo de Média
            if (name === 'tipo') {
                const newGroup = Object.keys(vehicleGroups).find(g => vehicleGroups[g]?.includes(value));
                if (value === 'Caminhões Prancha' || value === 'Caminhão Prancha' || newGroup === 'Veículos Leves' || newGroup === 'Caminhões de Trecho') {
                    newState.mediaCalculo = 'odometro';
                } else if (newGroup === 'Caminhões' || newGroup === 'Máquinas Pesadas') {
                     newState.mediaCalculo = 'horimetro'; 
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
            } else {
                setError('');
                setFotoFile(file);
            }
        }
    };

    // --- Validação e Salvamento ---
    const validateAndPrepareSave = async (e) => {
        e.preventDefault();
        setError('');

        const isEditing = !!vehicle;

        // Validação Básica
        if (!formData.placa || !formData.registroInterno || !formData.tipo || !formData.marca || !formData.modelo) {
             setError('Preencha os campos obrigatórios (*).');
             return;
         }

        // Validação de Duplicidade (Front-end check rápido)
        if (!isEditing || (vehicle && vehicle.placa !== formData.placa)) {
             const plateExists = vehicles.some(v => v.placa === formData.placa && v.id !== vehicle?.id);
             if (plateExists) { setError('Já existe um veículo com esta placa.'); return; }
        }
        if (!isEditing || (vehicle && vehicle.registroInterno !== formData.registroInterno)) {
            const internalIdExists = vehicles.some(v => v.registroInterno === formData.registroInterno && v.id !== vehicle?.id);
            if (internalIdExists) { setError('Já existe um veículo com este registro interno.'); return; }
        }

        // --- REGRAS 2 e 3: Validação de Consistência de Leitura ---
        // Só valida se estiver editando um veículo existente
        let consistencyIssues = [];
        
        if (isEditing) {
            if (showOdometro) {
                const check = checkReadingConsistency(vehicle, formData.odometro, 'odometro');
                if (check.status === 'bloqueio') consistencyIssues.push(check.message);
            }
            if (showHorimetro) {
                // Checa digital (principal)
                const checkDig = checkReadingConsistency(vehicle, formData.horimetroDigital, 'horimetroDigital');
                if (checkDig.status === 'bloqueio') consistencyIssues.push(checkDig.message);
                
                // Checa analógico se tiver
                if (formData.possuiHorimetroAnalogico) {
                    const checkAna = checkReadingConsistency(vehicle, formData.horimetroAnalogico, 'horimetroAnalogico');
                    if (checkAna.status === 'bloqueio') consistencyIssues.push(checkAna.message);
                }
                
                // Checa horímetro genérico (caso legado)
                if (!formData.horimetroDigital && !formData.possuiHorimetroAnalogico) {
                    const checkGen = checkReadingConsistency(vehicle, formData.horimetro, 'horimetro');
                    if (checkGen.status === 'bloqueio') consistencyIssues.push(checkGen.message);
                }
            }
        }

        // Preparar objeto final
        const dataToSave = {
            ...formData,
            odometro: parseFloat(formData.odometro) || 0,
            horimetro: parseFloat(formData.horimetro) || 0,
            horimetroDigital: parseFloat(formData.horimetroDigital) || 0,
            horimetroAnalogico: formData.possuiHorimetroAnalogico ? (parseFloat(formData.horimetroAnalogico) || 0) : null,
            fuelCapacity: parseFloat(formData.fuelCapacity) || null,
            ano_fabricacao: parseInt(formData.anoFabricacao, 10) || null,
            ano_modelo: parseInt(formData.anoModelo, 10) || null,
            capacidade: parseFloat(formData.capacidade) || null,
            validadeTacografo: formData.validadeTacografo || null,
            validadeAET_DAER: formData.validadeAET_DAER || null,
            validadeAET_DNIT: formData.validadeAET_DNIT || null,
        };
        
        // Regra 6: Inicializar Combustível se for Comboio e for novo (ou acabou de virar comboio)
        if (formData.isComboioVehicle) {
            if (!vehicle?.isComboioVehicle || !vehicle?.fuelLevels) {
                dataToSave.fuelLevels = { dieselS10: 0, dieselComum: 0 };
            }
        }

        delete dataToSave.anoFabricacao;
        delete dataToSave.anoModelo;

        // Se houver violações de regra, pede senha
        if (consistencyIssues.length > 0) {
            setViolationMessage(consistencyIssues.join('\n'));
            setPendingSaveData(dataToSave);
            setShowPasswordModal(true);
            return;
        }

        // Se tudo ok, salva direto
        executeSave(dataToSave);
    };

    const executeSave = async (data) => {
        setIsSaving(true);
        try {
            let vehicleId = vehicle?.id;
            let successMessage = '';

            if (vehicle) {
                await apiClient.updateVehicle(vehicle.id, data);
                successMessage = `Veículo ${data.registroInterno} atualizado!`;
            } else {
                const dataWithDefaults = { ...data, status: 'Disponível' };
                const newVehicle = await apiClient.createVehicle(dataWithDefaults); 
                vehicleId = newVehicle.id;
                successMessage = `Veículo ${data.registroInterno} adicionado!`;
            }

            // Upload de Imagem separado
            if (fotoFile && vehicleId) {
                const uploadFormData = new FormData();
                uploadFormData.append('fotoFile', fotoFile); 
                try {
                    await apiClient.uploadVehicleImage(vehicleId, uploadFormData);
                    successMessage += ' Imagem enviada.';
                } catch (uploadError) {
                    console.error("Erro imagem:", uploadError);
                    successMessage += ' (Erro na imagem).';
                }
            }
            
            setAlertMessage(successMessage);
            reloadData();
            onClose();
        } catch (err) {
            console.error("Erro ao salvar:", err);
            setError(err.response?.data?.message || err.message || "Erro ao salvar.");
        } finally {
            setIsSaving(false);
            setShowPasswordModal(false);
        }
    };

    // Imagem Preview
    const apiBaseUrl = (process.env.REACT_APP_API_URL || 'http://localhost:3001/api').replace('/api', '');
    const previewImageUrl = fotoFile 
        ? URL.createObjectURL(fotoFile)
        : (vehicle?.fotoURL ? (vehicle.fotoURL.startsWith('http') ? vehicle.fotoURL : `${apiBaseUrl}${vehicle.fotoURL}`) : 'https://placehold.co/150x100/e2e8f0/cbd5e0?text=Sem+Foto');

    return (
        <>
            {/* Modal Principal */}
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-2 sm:p-4 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col my-auto border border-gray-100">
                    
                    {/* Header */}
                    <div className="p-5 border-b flex justify-between items-center bg-gray-50 rounded-t-xl sticky top-0 z-10">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">{vehicle ? `Editar ${vehicle.registroInterno}` : 'Novo Veículo'}</h2>
                            <p className="text-xs text-gray-500">Preencha os dados cadastrais e técnicos.</p>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 text-gray-500 transition-colors" disabled={isSaving}>
                            <X size={20}/>
                        </button>
                    </div>

                    {/* Form */}
                    <form onSubmit={validateAndPrepareSave} className="flex-1 overflow-y-auto p-6 bg-white">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            
                            {/* Coluna 1: Identificação */}
                            <div className="space-y-5">
                                <h3 className="font-semibold text-gray-700 border-b pb-2 flex items-center gap-2">
                                    <ShieldCheck size={18}/> Identificação
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-1">
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Registro (Interno) *</label>
                                        <input name="registroInterno" value={formData.registroInterno} onChange={handleChange} placeholder="Ex: C01" required className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" />
                                    </div>
                                    <div className="col-span-1">
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Placa *</label>
                                        <input name="placa" value={formData.placa} onChange={handleChange} placeholder="ABC-1234" required className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none uppercase" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Tipo de Equipamento *</label>
                                    <select name="tipo" value={formData.tipo} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-yellow-400 outline-none" required>
                                        <option value="">Selecione...</option>
                                        {(vehicleTypes || []).map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Marca *</label>
                                        <input name="marca" value={formData.marca} onChange={handleChange} placeholder="Volvo" required className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Modelo *</label>
                                        <input name="modelo" value={formData.modelo} onChange={handleChange} placeholder="FH 540" required className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" />
                                    </div>
                                </div>
                                
                                {/* Regra 7: Terceirizado */}
                                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                                    <label className="flex items-center space-x-3 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            name="isOutsourced" 
                                            checked={formData.isOutsourced} 
                                            onChange={handleChange} 
                                            className="h-5 w-5 text-purple-600 focus:ring-purple-500 border-gray-300 rounded" 
                                        />
                                        <span className="text-purple-800 font-bold text-sm flex items-center gap-2">
                                            <Briefcase size={16}/> Veículo Terceirizado?
                                        </span>
                                    </label>
                                    <p className="text-[10px] text-purple-600 mt-1 ml-8">Destaque visual na listagem e relatórios.</p>
                                </div>
                            </div>

                            {/* Coluna 2: Dados Técnicos e Leitura */}
                            <div className="space-y-5">
                                <h3 className="font-semibold text-gray-700 border-b pb-2 flex items-center gap-2">
                                    <AlertTriangle size={18}/> Leituras e Capacidades
                                </h3>

                                {/* Horímetro (Máquinas/Caminhões) */}
                                {showHorimetro && (
                                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                        <div className="mb-3">
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Horímetro Digital (Hr) *</label>
                                            <input name="horimetroDigital" value={formData.horimetroDigital} onChange={handleChange} type="number" step="0.1" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" />
                                        </div>
                                        <div className="flex items-center mb-2">
                                            <input name="possuiHorimetroAnalogico" id="possuiHorimetroAnalogico" type="checkbox" checked={formData.possuiHorimetroAnalogico} onChange={handleChange} className="h-4 w-4 rounded text-yellow-600 focus:ring-yellow-500"/>
                                            <label htmlFor="possuiHorimetroAnalogico" className="ml-2 text-sm text-gray-700 font-medium cursor-pointer">Possui Horímetro Analógico?</label>
                                        </div>
                                        {formData.possuiHorimetroAnalogico && (
                                            <div>
                                                <input name="horimetroAnalogico" value={formData.horimetroAnalogico} onChange={handleChange} type="number" step="0.1" placeholder="Valor Analógico" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none bg-white" />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Odômetro (Leves/Caminhões) */}
                                {showOdometro && (
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Odômetro (Km) *</label>
                                        <input name="odometro" value={formData.odometro} onChange={handleChange} type="number" step="any" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" />
                                    </div>
                                )}
                                
                                {/* Regra 6: Comboio */}
                                <div className="flex items-center p-3 border rounded-lg hover:bg-gray-50 transition">
                                    <input name="isComboioVehicle" id="isComboioVehicle" type="checkbox" checked={formData.isComboioVehicle} onChange={handleChange} className="h-5 w-5 rounded text-yellow-600 focus:ring-yellow-500"/>
                                    <label htmlFor="isComboioVehicle" className="ml-3 text-sm font-bold text-gray-700 cursor-pointer w-full">É um veículo Comboio?</label>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Capacidade (m³)</label>
                                        <input name="capacidade" value={formData.capacidade} onChange={handleChange} type="number" step="any" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Tanque (L)</label>
                                        <input name="fuelCapacity" value={formData.fuelCapacity} onChange={handleChange} type="number" step="any" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" />
                                    </div>
                                </div>
                            </div>

                            {/* Coluna 3: Documentos e Foto */}
                            <div className="space-y-5">
                                <h3 className="font-semibold text-gray-700 border-b pb-2 flex items-center gap-2">
                                    <Camera size={18}/> Foto e Documentação
                                </h3>

                                <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:bg-gray-50 transition cursor-pointer relative group">
                                    <img 
                                        src={previewImageUrl} 
                                        alt="Preview" 
                                        className="w-full h-32 object-contain rounded-md mb-2"
                                        onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/150x100?text=Sem+Imagem'; }}
                                    />
                                    <label className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all cursor-pointer">
                                        <span className="bg-white py-1 px-3 rounded shadow text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">Alterar Foto</span>
                                        <input type="file" name="fotoFile" accept="image/*" onChange={handleFileChange} className="hidden" />
                                    </label>
                                </div>

                                {/* Regra 4: Validades (Condicional) */}
                                {currentGroup === 'Caminhões' && (
                                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm space-y-3">
                                        <p className="font-bold text-blue-800 text-xs uppercase">Validades Obrigatórias</p>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Tacógrafo</label>
                                            <input name="validadeTacografo" value={formData.validadeTacografo} onChange={handleChange} type="date" className="w-full p-1.5 border rounded bg-white" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">AET DAER/RS</label>
                                            <input name="validadeAET_DAER" value={formData.validadeAET_DAER} onChange={handleChange} type="date" className="w-full p-1.5 border rounded bg-white" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">AET DNIT</label>
                                            <input name="validadeAET_DNIT" value={formData.validadeAET_DNIT} onChange={handleChange} type="date" className="w-full p-1.5 border rounded bg-white" />
                                        </div>
                                    </div>
                                )}
                                
                                {/* Regra 4: Checkbox Não Pode Circular */}
                                <div className={`p-3 rounded-lg border ${!formData.canCirculate ? 'bg-red-100 border-red-300' : 'bg-gray-50 border-gray-200'}`}>
                                    <label className="flex items-center space-x-3 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            name="naoPodeCircular" 
                                            checked={!formData.canCirculate} 
                                            onChange={handleChange} 
                                            className="h-5 w-5 text-red-600 focus:ring-red-500 border-gray-300 rounded" 
                                        />
                                        <span className={`font-bold text-sm ${!formData.canCirculate ? 'text-red-800' : 'text-gray-600'}`}>
                                            NÃO Pode Circular?
                                        </span>
                                    </label>
                                </div>

                                {error && (
                                    <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-start gap-2 animate-pulse">
                                        <AlertTriangle size={16} className="mt-0.5 shrink-0"/>
                                        <span>{error}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </form>

                    {/* Footer */}
                    <div className="p-4 bg-gray-50 border-t rounded-b-xl flex justify-end gap-3 sticky bottom-0 z-10">
                        <button onClick={onClose} className="px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-200 rounded-lg transition-colors" disabled={isSaving}>
                            Cancelar
                        </button>
                        <button 
                            onClick={validateAndPrepareSave} 
                            disabled={isSaving} 
                            className="px-6 py-2.5 bg-yellow-400 text-gray-900 font-bold rounded-lg hover:bg-yellow-500 shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isSaving ? <Loader size={18} className="animate-spin"/> : <Save size={18}/>}
                            {isSaving ? 'Salvando...' : 'Salvar Veículo'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal de Confirmação de Senha (Regras 2 e 3) */}
            {showPasswordModal && (
                <PasswordConfirmationModal 
                    message={`ATENÇÃO: Inconsistência de leitura detectada!\n\n${violationMessage}\n\nÉ necessário autorização de supervisor para prosseguir.`}
                    onConfirm={() => executeSave(pendingSaveData)}
                    onClose={() => setShowPasswordModal(false)}
                    apiClient={apiClient}
                />
            )}
        </>
    );
};

export default VehicleModal;