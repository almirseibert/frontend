import React, { useState, useMemo } from 'react';
import { Loader, X, AlertTriangle, Save, Camera, ShieldCheck, Briefcase, Gauge, MapPin } from 'lucide-react';
import { checkReadingConsistency, vehicleGroups } from '../utils/vehicleRules';

// --- MODAL DE CRIAÇÃO/EDIÇÃO DE VEÍCULO (V2.1 - Campos Adicionais e Regras de Exibição) ---
const VehicleModal = ({ user, vehicle, vehicles = [], vehicleTypes = [], onClose, setAlertMessage, apiClient, reloadData, PasswordConfirmationModal }) => {
    
    // Estado do Formulário
    const [formData, setFormData] = useState({
        placa: vehicle?.placa || '',
        registroInterno: vehicle?.registroInterno || '',
        capacidade: vehicle?.capacidade?.toString() || '',
        tipo: vehicle?.tipo || (vehicleTypes.length > 0 ? vehicleTypes[0] : ''),
        marca: vehicle?.marca || '',
        modelo: vehicle?.modelo || '',
        cor: vehicle?.cor || '', // Novo Campo
        
        // Leituras (Unificadas)
        odometro: vehicle?.odometro?.toString() || '0',
        horimetro: vehicle?.horimetro?.toString() || (vehicle?.horimetroDigital?.toString() || '0'),
        
        // Configurações
        isComboioVehicle: vehicle?.isComboioVehicle || false,
        isOutsourced: vehicle?.isOutsourced || false,
        hasRastreador: vehicle?.hasRastreador || false, // Novo Campo
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
    
    // Controle do Modal de Senha
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [pendingSaveData, setPendingSaveData] = useState(null);
    const [violationMessage, setViolationMessage] = useState('');

    // --- Helpers de Grupo e Tipo ---
    const currentGroup = useMemo(() => {
        const groups = vehicleGroups || {};
        return Object.keys(groups).find(group => groups[group]?.includes(formData.tipo));
    }, [formData.tipo]);

    // Regra 1: Show Odometro (Leves e Trecho)
    const showOdometro = useMemo(() => {
        if (currentGroup === 'Veículos Leves' || currentGroup === 'Caminhões de Trecho') return true;
        return false;
    }, [currentGroup]);

    // Regra 1: Show Horimetro (Caminhões Pesados e Máquinas)
    const showHorimetro = useMemo(() => {
        if (currentGroup === 'Máquinas Pesadas' || currentGroup === 'Caminhões') return true;
        return false;
    }, [currentGroup]);

    // --- Regras de Negócio (Exibição Condicional) ---
    
    // Regra Comboio: NÃO mostrar se for Máquina Pesada, Automóvel, Moto, Pipa, Prancha, Cavalo ou Caçambas
    const canBeComboio = useMemo(() => {
        const type = formData.tipo;
        const group = currentGroup;

        // Lista de exclusão explícita
        if (group === 'Máquinas Pesadas') return false;
        
        const forbiddenTypes = [
            'Automóvel', 'Moto', 'Caminhão Pipa', 'Caminhão Prancha', 'Cavalo'
        ];
        
        if (forbiddenTypes.includes(type)) return false;
        if (type.includes('Caçamba')) return false; // Exclui todas as caçambas

        return true;
    }, [formData.tipo, currentGroup]);

    // Regra Capacidade (M³): APENAS para Caçambas (todas), Pipa e Tanque
    const showCapacity = useMemo(() => {
        const type = formData.tipo;
        const allowedTypes = ['Caminhão Pipa', 'Caminhão Tanque'];
        
        if (allowedTypes.includes(type)) return true;
        if (type.includes('Caçamba')) return true; // Inclui Caçamba Toco, Truckado, Traçado, etc.

        return false;
    }, [formData.tipo]);


    // --- Handlers ---
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        
        if (name === 'naoPodeCircular') {
            setFormData(prev => ({ ...prev, canCirculate: !checked }));
            return;
        }

        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
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

        if (!formData.placa || !formData.registroInterno || !formData.tipo || !formData.marca || !formData.modelo) {
             setError('Preencha os campos obrigatórios (*).');
             return;
         }

        // Validação de Duplicidade
        if (!isEditing || (vehicle && vehicle.registroInterno !== formData.registroInterno)) {
            const internalIdExists = vehicles.some(v => v.registroInterno === formData.registroInterno && v.id !== vehicle?.id);
            if (internalIdExists) { setError('Já existe um veículo com este registro interno.'); return; }
        }

        let consistencyIssues = [];
        if (isEditing) {
            if (showOdometro) {
                const check = checkReadingConsistency(vehicle, formData.odometro, 'odometro');
                if (check.status === 'bloqueio') consistencyIssues.push(check.message);
            }
            if (showHorimetro) {
                const check = checkReadingConsistency(vehicle, formData.horimetro, 'horimetro');
                if (check.status === 'bloqueio') consistencyIssues.push(check.message);
            }
        }

        let mediaCalculo = 'odometro';
        if (showHorimetro) mediaCalculo = 'horimetro'; 
        if (showOdometro) mediaCalculo = 'odometro'; 

        const dataToSave = {
            ...formData,
            odometro: showOdometro ? (parseFloat(formData.odometro) || 0) : null,
            horimetro: showHorimetro ? (parseFloat(formData.horimetro) || 0) : null,
            horimetroDigital: null,
            horimetroAnalogico: null,
            
            mediaCalculo: mediaCalculo,
            fuelCapacity: parseFloat(formData.fuelCapacity) || null,
            ano_fabricacao: parseInt(formData.anoFabricacao, 10) || null,
            ano_modelo: parseInt(formData.anoModelo, 10) || null,
            capacidade: showCapacity ? (parseFloat(formData.capacidade) || null) : null, // Só salva capacidade se permitido
            validadeTacografo: formData.validadeTacografo || null,
            validadeAET_DAER: formData.validadeAET_DAER || null,
            validadeAET_DNIT: formData.validadeAET_DNIT || null,
            
            // Novos campos salvos explicitamente
            cor: formData.cor,
            chassi: formData.chassi,
            hasRastreador: formData.hasRastreador
        };
        
        // Se comboio foi desabilitado pela UI, garante false
        if (!canBeComboio) {
            dataToSave.isComboioVehicle = false;
        }

        if (dataToSave.isComboioVehicle) {
            if (!vehicle?.isComboioVehicle || !vehicle?.fuelLevels) {
                dataToSave.fuelLevels = { dieselS10: 0, dieselComum: 0 };
            }
        }

        delete dataToSave.anoFabricacao;
        delete dataToSave.anoModelo;

        if (consistencyIssues.length > 0) {
            setViolationMessage(consistencyIssues.join('\n'));
            setPendingSaveData(dataToSave);
            setShowPasswordModal(true);
            return;
        }

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

            if (fotoFile && vehicleId) {
                const uploadFormData = new FormData();
                uploadFormData.append('fotoFile', fotoFile); 
                await apiClient.uploadVehicleImage(vehicleId, uploadFormData);
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

    const apiBaseUrl = (process.env.REACT_APP_API_URL || 'http://localhost:3001/api').replace('/api', '');
    const previewImageUrl = fotoFile 
        ? URL.createObjectURL(fotoFile)
        : (vehicle?.fotoURL ? (vehicle.fotoURL.startsWith('http') ? vehicle.fotoURL : `${apiBaseUrl}${vehicle.fotoURL}`) : 'https://placehold.co/150x100/e2e8f0/cbd5e0?text=Sem+Foto');

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-2 sm:p-4 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col my-auto border border-gray-100">
                    
                    <div className="p-5 border-b flex justify-between items-center bg-gray-50 rounded-t-xl sticky top-0 z-10">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">{vehicle ? `Editar ${vehicle.registroInterno}` : 'Novo Veículo'}</h2>
                            <p className="text-xs text-gray-500">Cadastro Unificado (Odômetro / Horímetro).</p>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 text-gray-500 transition-colors" disabled={isSaving}>
                            <X size={20}/>
                        </button>
                    </div>

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

                                {/* CAMPOS NOVOS (Ano, Cor) */}
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Ano Fab.</label>
                                        <input name="anoFabricacao" type="number" value={formData.anoFabricacao} onChange={handleChange} placeholder="2024" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Ano Mod.</label>
                                        <input name="anoModelo" type="number" value={formData.anoModelo} onChange={handleChange} placeholder="2025" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Cor</label>
                                        <input name="cor" value={formData.cor} onChange={handleChange} placeholder="Branco" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" />
                                    </div>
                                </div>
                                
                                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                                    <label className="flex items-center space-x-3 cursor-pointer">
                                        <input type="checkbox" name="isOutsourced" checked={formData.isOutsourced} onChange={handleChange} className="h-5 w-5 text-purple-600 rounded" />
                                        <span className="text-purple-800 font-bold text-sm flex items-center gap-2"><Briefcase size={16}/> Veículo Terceirizado?</span>
                                    </label>
                                </div>
                            </div>

                            {/* Coluna 2: Dados Técnicos e Leitura */}
                            <div className="space-y-5">
                                <h3 className="font-semibold text-gray-700 border-b pb-2 flex items-center gap-2">
                                    <Gauge size={18}/> Leituras e Capacidades
                                </h3>

                                {/* INPUT DINÂMICO BASEADO NO GRUPO */}
                                {showHorimetro && (
                                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 shadow-sm">
                                        <label className="block text-sm font-bold text-blue-900 uppercase mb-1 flex justify-between">
                                            Horímetro Atual (Hr) *
                                            <span className="text-[10px] font-normal text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Campo Unificado</span>
                                        </label>
                                        <input name="horimetro" value={formData.horimetro} onChange={handleChange} type="number" step="0.1" className="w-full p-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none text-lg font-mono text-blue-900" />
                                        <p className="text-[10px] text-blue-500 mt-1">Para Caminhões Pesados e Máquinas. Substitui digital/analógico.</p>
                                    </div>
                                )}

                                {showOdometro && (
                                    <div className="bg-green-50 p-4 rounded-lg border border-green-200 shadow-sm">
                                        <label className="block text-sm font-bold text-green-900 uppercase mb-1">Odômetro (Km) *</label>
                                        <input name="odometro" value={formData.odometro} onChange={handleChange} type="number" step="any" className="w-full p-3 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-400 outline-none text-lg font-mono text-green-900" />
                                        <p className="text-[10px] text-green-500 mt-1">Para Veículos Leves e Caminhões de Trecho (Pranchas).</p>
                                    </div>
                                )}
                                
                                {/* Opção Comboio - Condicional */}
                                {canBeComboio && (
                                    <div className="flex items-center p-3 border rounded-lg hover:bg-gray-50 transition">
                                        <input name="isComboioVehicle" id="isComboioVehicle" type="checkbox" checked={formData.isComboioVehicle} onChange={handleChange} className="h-5 w-5 rounded text-yellow-600 focus:ring-yellow-500"/>
                                        <label htmlFor="isComboioVehicle" className="ml-3 text-sm font-bold text-gray-700 cursor-pointer w-full">É um veículo Comboio?</label>
                                    </div>
                                )}
                                
                                {/* Campo Chassi */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Chassi</label>
                                    <input name="chassi" value={formData.chassi} onChange={handleChange} placeholder="Identificação do chassi" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none uppercase" />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* Campo Capacidade - Condicional */}
                                    {showCapacity && (
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Capacidade (m³)</label>
                                            <input name="capacidade" value={formData.capacidade} onChange={handleChange} type="number" step="any" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" />
                                        </div>
                                    )}
                                    <div className={showCapacity ? "" : "col-span-2"}>
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

                                {/* Regra 4: Validades (Caminhões e Trecho) */}
                                {(currentGroup === 'Caminhões' || currentGroup === 'Caminhões de Trecho') && (
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
                                
                                {/* Opção Rastreador */}
                                <div className="flex items-center p-3 border rounded-lg bg-gray-50">
                                    <input name="hasRastreador" id="hasRastreador" type="checkbox" checked={formData.hasRastreador} onChange={handleChange} className="h-5 w-5 rounded text-blue-600 focus:ring-blue-500"/>
                                    <label htmlFor="hasRastreador" className="ml-3 text-sm font-bold text-gray-700 cursor-pointer w-full flex items-center gap-2"><MapPin size={16}/> Rastreador Instalado?</label>
                                </div>

                                <div className={`p-3 rounded-lg border ${!formData.canCirculate ? 'bg-red-100 border-red-300' : 'bg-gray-50 border-gray-200'}`}>
                                    <label className="flex items-center space-x-3 cursor-pointer">
                                        <input type="checkbox" name="naoPodeCircular" checked={!formData.canCirculate} onChange={handleChange} className="h-5 w-5 text-red-600 rounded" />
                                        <span className={`font-bold text-sm ${!formData.canCirculate ? 'text-red-800' : 'text-gray-600'}`}>NÃO Pode Circular?</span>
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

                    <div className="p-4 bg-gray-50 border-t rounded-b-xl flex justify-end gap-3 sticky bottom-0 z-10">
                        <button onClick={onClose} className="px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-200 rounded-lg transition-colors" disabled={isSaving}>Cancelar</button>
                        <button onClick={validateAndPrepareSave} disabled={isSaving} className="px-6 py-2.5 bg-yellow-400 text-gray-900 font-bold rounded-lg hover:bg-yellow-500 shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                            {isSaving ? <Loader size={18} className="animate-spin"/> : <Save size={18}/>}
                            {isSaving ? 'Salvando...' : 'Salvar Veículo'}
                        </button>
                    </div>
                </div>
            </div>

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