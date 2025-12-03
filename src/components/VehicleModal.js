import React, { useState, useMemo, useEffect } from 'react';
import { Loader, X, AlertTriangle, Save, Truck, Fuel } from 'lucide-react';
import { getAllowedReadingTypes, checkReadingConsistency } from '../utils/vehicleRules';

const VehicleModal = ({ 
    user, 
    vehicle, 
    vehicles = [], 
    vehicleTypes = [], 
    onClose, 
    setAlertMessage, 
    apiClient, 
    reloadData, 
    vehicleGroups = {},
    PasswordConfirmationModal 
}) => {
    // Estado inicial
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
        isThirdParty: vehicle?.isThirdParty || false, // REQ 7: Terceiro
        fuelCapacity: vehicle?.fuelCapacity?.toString() || '',
        anoFabricacao: vehicle?.ano_fabricacao?.toString() || '',
        anoModelo: vehicle?.ano_modelo?.toString() || '',
        chassi: vehicle?.chassi || '',
        validadeTacografo: vehicle?.validadeTacografo ? new Date(vehicle.validadeTacografo).toISOString().split('T')[0] : '',
        validadeAET_DAER: vehicle?.validadeAET_DAER ? new Date(vehicle.validadeAET_DAER).toISOString().split('T')[0] : '',
        validadeAET_DNIT: vehicle?.validadeAET_DNIT ? new Date(vehicle.validadeAET_DNIT).toISOString().split('T')[0] : '',
        canCirculate: (vehicle?.canCirculate === false || vehicle?.canCirculate === 0) ? false : true,
    });
    
    const [fotoFile, setFotoFile] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    
    // Controle do Modal de Senha
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [pendingSaveData, setPendingSaveData] = useState(null);
    const [passwordMessage, setPasswordMessage] = useState('');

    // Determina o grupo atual para exibir/esconder campos
    const currentGroup = useMemo(() => {
        const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
        return Object.keys(groups).find(group => groups[group]?.includes(formData.tipo));
    }, [formData.tipo, vehicleGroups]);

    // Define quais leituras são permitidas (Km ou Hr) - REQ 1
    const allowedReadings = useMemo(() => {
        if (!formData.tipo) return [];
        return getAllowedReadingTypes(formData.tipo);
    }, [formData.tipo]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        
        // Checkbox "Não Pode Circular" (Lógica Invertida)
        if (name === 'naoPodeCircular') {
            setFormData(prev => ({ ...prev, canCirculate: !checked }));
            return;
        }

        setFormData(prev => {
            const newState = {
                ...prev,
                [name]: type === 'checkbox' ? checked : value
            };

            // Limpa horímetro analógico se desmarcar
            if (name === 'possuiHorimetroAnalogico' && !checked) {
                 newState.horimetroAnalogico = '0';
            }

            return newState;
        });
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
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

    // Função principal de salvar
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!formData.placa || !formData.registroInterno || !formData.tipo || !formData.marca || !formData.modelo) {
             setError('Campos obrigatórios: Placa, Registro, Tipo, Marca e Modelo.');
             return;
         }

        // Validação de Duplicidade
        const isEditing = !!vehicle;
        if (!isEditing || (vehicle && vehicle.placa !== formData.placa)) {
             if (vehicles.some(v => v.placa === formData.placa && v.id !== vehicle?.id)) { setError('Placa já cadastrada.'); return; }
        }
        if (!isEditing || (vehicle && vehicle.registroInterno !== formData.registroInterno)) {
            if (vehicles.some(v => v.registroInterno === formData.registroInterno && v.id !== vehicle?.id)) { setError('Registro Interno já existe.'); return; }
        }

        // REQ 2 e 3: Validação de Consistência de Leitura (Apenas na Edição)
        if (isEditing && vehicle) {
            let consistencyError = null;
            
            // Verifica Km se aplicável
            if (allowedReadings.includes('odometro')) {
                const check = checkReadingConsistency(vehicle, formData.odometro);
                if (check?.type === 'bloqueio') consistencyError = check.message;
            }
            // Verifica Horímetro se aplicável
            if (allowedReadings.includes('horimetro')) {
                // Se usa horimetro digital (Máquinas)
                if (formData.horimetroDigital && formData.horimetroDigital !== '0') {
                    const check = checkReadingConsistency(vehicle, formData.horimetroDigital);
                    if (check?.type === 'bloqueio') consistencyError = check.message;
                }
                // Se usa horimetro genérico (Caminhões)
                else {
                    const check = checkReadingConsistency(vehicle, formData.horimetro);
                    if (check?.type === 'bloqueio') consistencyError = check.message;
                }
            }

            if (consistencyError) {
                setPasswordMessage(consistencyError);
                setPendingSaveData(true); // Flag para continuar após senha
                setShowPasswordModal(true);
                return;
            }
        }

        // Se passou, salva direto
        await executeSave();
    };

    const executeSave = async () => {
        setIsSaving(true);
        const isEditing = !!vehicle;

        const dataToSave = {
            ...formData,
            odometro: parseFloat(formData.odometro) || 0,
            horimetro: parseFloat(formData.horimetro) || 0,
            horimetroDigital: parseFloat(formData.horimetroDigital) || 0,
            horimetroAnalogico: parseFloat(formData.horimetroAnalogico) || 0,
            fuelCapacity: parseFloat(formData.fuelCapacity) || null,
            ano_fabricacao: parseInt(formData.anoFabricacao, 10) || null,
            ano_modelo: parseInt(formData.anoModelo, 10) || null,
            capacidade: parseFloat(formData.capacidade) || null,
            // REQ 6: Se for comboio e não tiver fuelLevels no DB (ou se for novo), inicializa
            fuelLevels: formData.isComboioVehicle ? (vehicle?.fuelLevels || { dieselS10: 0, dieselComum: 0 }) : null
        };

        // Remove campos de formatação
        delete dataToSave.anoFabricacao;
        delete dataToSave.anoModelo;

        try {
            let vehicleId = vehicle?.id;
            
            if (isEditing) {
                await apiClient.updateVehicle(vehicle.id, dataToSave);
            } else {
                const newVehicle = await apiClient.createVehicle({ ...dataToSave, status: 'Disponível' }); 
                vehicleId = newVehicle.id;
            }

            if (fotoFile && vehicleId) {
                const uploadFormData = new FormData();
                uploadFormData.append('fotoFile', fotoFile); 
                await apiClient.uploadVehicleImage(vehicleId, uploadFormData);
            }
            
            setAlertMessage(`Veículo ${formData.registroInterno} salvo com sucesso!`);
            reloadData();
            onClose();
        } catch (err) {
            console.error("Erro ao salvar:", err);
            setError(err.message || "Erro ao salvar veículo.");
        } finally {
            setIsSaving(false);
            setPendingSaveData(null);
        }
    };

    const apiBaseUrl = (process.env.REACT_APP_API_URL || 'http://localhost:3001/api').replace('/api', '');
    const previewImageUrl = fotoFile 
        ? URL.createObjectURL(fotoFile)
        : (vehicle?.fotoURL ? (vehicle.fotoURL.startsWith('http') ? vehicle.fotoURL : `${apiBaseUrl}${vehicle.fotoURL}`) : 'https://placehold.co/100x75/e2e8f0/cbd5e0?text=S/Foto');

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-2 sm:p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col my-auto">
                    <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                        <h2 className="text-xl sm:text-2xl font-bold">{vehicle ? 'Editar Veículo' : 'Adicionar Veículo'}</h2>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                        <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                            
                            {/* --- Coluna 1: Dados Cadastrais --- */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-gray-900 border-b pb-1 mb-2">Identificação</h3>
                                <div>
                                    <label className="block font-medium text-gray-700 mb-1">Placa *</label>
                                    <input name="placa" value={formData.placa} onChange={handleChange} placeholder="ABC1D23" required className="p-2 border rounded w-full uppercase" />
                                </div>
                                <div>
                                    <label className="block font-medium text-gray-700 mb-1">Registro Interno *</label>
                                    <input name="registroInterno" value={formData.registroInterno} onChange={handleChange} placeholder="Ex: C-01" required className="p-2 border rounded w-full uppercase" />
                                </div>
                                <div>
                                    <label className="block font-medium text-gray-700 mb-1">Tipo *</label>
                                    <select name="tipo" value={formData.tipo} onChange={handleChange} className="p-2 border rounded w-full bg-white" required>
                                        <option value="">Selecione...</option>
                                        {(vehicleTypes || []).map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block font-medium text-gray-700 mb-1">Marca *</label>
                                        <input name="marca" value={formData.marca} onChange={handleChange} placeholder="Ex: Volvo" required className="p-2 border rounded w-full" />
                                    </div>
                                    <div>
                                        <label className="block font-medium text-gray-700 mb-1">Modelo *</label>
                                        <input name="modelo" value={formData.modelo} onChange={handleChange} placeholder="Ex: FH 540" required className="p-2 border rounded w-full" />
                                    </div>
                                </div>
                                
                                {/* REQ 7: Checkbox Terceiro */}
                                <div className="pt-2">
                                    <label className="flex items-center space-x-2 cursor-pointer p-2 border rounded-lg hover:bg-gray-50">
                                        <input 
                                            type="checkbox" 
                                            name="isThirdParty" 
                                            checked={formData.isThirdParty} 
                                            onChange={handleChange} 
                                            className="h-4 w-4 text-purple-600 focus:ring-purple-500 rounded" 
                                        />
                                        <span className="text-gray-900 font-medium">Veículo Terceirizado?</span>
                                    </label>
                                </div>
                            </div>

                            {/* --- Coluna 2: Leituras e Operacional --- */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-gray-900 border-b pb-1 mb-2">Leituras & Capacidades</h3>
                                
                                {/* REQ 1: Exibe apenas o que é permitido */}
                                {allowedReadings.includes('odometro') && (
                                    <div>
                                        <label className="block font-medium text-gray-700 mb-1">Odômetro (Km)</label>
                                        <input name="odometro" value={formData.odometro} onChange={handleChange} type="number" step="any" className="p-2 border rounded w-full bg-blue-50 border-blue-200" />
                                        <p className="text-xs text-gray-500 mt-1">Limite máx: 1000km de salto.</p>
                                    </div>
                                )}

                                {allowedReadings.includes('horimetro') && (
                                    <>
                                        {/* Se for Máquinas Pesadas, usa terminologia Digital/Analógico preferencialmente, mas aqui simplificamos a lógica visual */}
                                        {currentGroup === 'Máquinas Pesadas' ? (
                                            <>
                                                <div>
                                                    <label className="block font-medium text-gray-700 mb-1">Horímetro Digital (Hr)</label>
                                                    <input name="horimetroDigital" value={formData.horimetroDigital} onChange={handleChange} type="number" step="0.1" className="p-2 border rounded w-full bg-green-50 border-green-200" />
                                                </div>
                                                <div className="flex items-center mt-2">
                                                    <input name="possuiHorimetroAnalogico" id="possuiHorimetroAnalogico" type="checkbox" checked={formData.possuiHorimetroAnalogico} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-yellow-600"/>
                                                    <label htmlFor="possuiHorimetroAnalogico" className="ml-2 block text-gray-900 text-sm">Possui Horímetro Analógico?</label>
                                                </div>
                                                {formData.possuiHorimetroAnalogico && (
                                                    <div className="mt-2">
                                                        <input name="horimetroAnalogico" value={formData.horimetroAnalogico} onChange={handleChange} type="number" step="0.1" placeholder="Analógico" className="p-2 border rounded w-full" />
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div>
                                                <label className="block font-medium text-gray-700 mb-1">Horímetro (Hr)</label>
                                                <input name="horimetro" value={formData.horimetro} onChange={handleChange} type="number" step="0.1" className="p-2 border rounded w-full bg-green-50 border-green-200" />
                                                <p className="text-xs text-gray-500 mt-1">Limite máx: 50h de salto.</p>
                                            </div>
                                        )}
                                    </>
                                )}

                                <div className="grid grid-cols-2 gap-2 mt-4">
                                    <div>
                                        <label className="block font-medium text-gray-700 mb-1">Capacidade (m³)</label>
                                        <input name="capacidade" value={formData.capacidade} onChange={handleChange} type="number" step="any" className="p-2 border rounded w-full" />
                                    </div>
                                    <div>
                                        <label className="block font-medium text-gray-700 mb-1">Tanque (Litros)</label>
                                        <input name="fuelCapacity" value={formData.fuelCapacity} onChange={handleChange} type="number" step="any" className="p-2 border rounded w-full" />
                                    </div>
                                </div>
                            </div>

                            {/* --- Coluna 3: Status, Comboio e Foto --- */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-gray-900 border-b pb-1 mb-2">Configurações</h3>

                                {/* Foto */}
                                <div>
                                    <label className="block font-medium text-gray-700 mb-1">Foto do Veículo</label>
                                    <div className="flex items-center gap-4">
                                        <img src={previewImageUrl} alt="Preview" className="w-20 h-16 object-cover rounded-md bg-gray-100 border" onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/100x75?text=Foto'; }} />
                                        <label className="cursor-pointer bg-white py-1.5 px-3 border border-gray-300 rounded text-sm font-medium hover:bg-gray-50">
                                            Trocar
                                            <input type="file" onChange={handleFileChange} className="hidden" accept="image/*" />
                                        </label>
                                    </div>
                                </div>

                                {/* REQ 6: Comboio Switch */}
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <label className="flex items-center space-x-3 cursor-pointer">
                                        <input type="checkbox" name="isComboioVehicle" checked={formData.isComboioVehicle} onChange={handleChange} className="h-5 w-5 text-yellow-600 rounded" />
                                        <div className="flex flex-col">
                                            <span className="text-gray-900 font-bold flex items-center gap-1"><Truck size={16}/> Veículo Comboio</span>
                                            <span className="text-xs text-gray-600">Habilita estoque de combustível.</span>
                                        </div>
                                    </label>
                                </div>

                                {/* REQ 4: Status / Bloqueio Manual */}
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <label className="flex items-center space-x-3 cursor-pointer">
                                        <input type="checkbox" name="naoPodeCircular" checked={!formData.canCirculate} onChange={handleChange} className="h-5 w-5 text-red-600 rounded" />
                                        <div className="flex flex-col">
                                            <span className="text-red-700 font-bold flex items-center gap-1"><AlertTriangle size={16} /> NÃO Pode Circular</span>
                                            <span className="text-xs text-red-600">Bloqueia alocação operacional.</span>
                                        </div>
                                    </label>
                                </div>
                                
                                {/* Datas de Documentos (Visível apenas para Caminhões) */}
                                {(currentGroup === 'Caminhões' || currentGroup === 'Caminhões de Trecho') && (
                                    <div className="pt-2 mt-2 border-t">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Vencimento Documentos</h4>
                                        <div className="space-y-2">
                                            <div>
                                                <label className="text-xs text-gray-600">Tacógrafo</label>
                                                <input name="validadeTacografo" value={formData.validadeTacografo} onChange={handleChange} type="date" className="p-1.5 border rounded w-full text-xs" />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-600">AET DAER</label>
                                                <input name="validadeAET_DAER" value={formData.validadeAET_DAER} onChange={handleChange} type="date" className="p-1.5 border rounded w-full text-xs" />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-600">AET DNIT</label>
                                                <input name="validadeAET_DNIT" value={formData.validadeAET_DNIT} onChange={handleChange} type="date" className="p-1.5 border rounded w-full text-xs" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {error && <div className="px-6 py-2 bg-red-50 text-red-600 text-sm text-center">{error}</div>}

                        <div className="p-4 bg-gray-50 border-t flex justify-end gap-2 sticky bottom-0 z-10">
                            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium" disabled={isSaving}>Cancelar</button>
                            <button type="submit" disabled={isSaving} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 flex items-center gap-2 text-sm">
                                {isSaving ? <Loader className="animate-spin" size={18}/> : <Save size={18}/>}
                                Salvar
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* MODAL DE CONFIRMAÇÃO DE SENHA PARA TRAVAS DE SEGURANÇA */}
            {showPasswordModal && pendingSaveData && (
                <PasswordConfirmationModal 
                    message={passwordMessage}
                    onConfirm={async () => {
                        setShowPasswordModal(false);
                        await executeSave();
                    }} 
                    onClose={() => {
                        setShowPasswordModal(false);
                        setPendingSaveData(null);
                    }} 
                />
            )}
        </>
    );
};

export default VehicleModal;