import React, { useState, useMemo, useEffect } from 'react';
import { X, PlusCircle, Trash2, MapPin, Loader } from 'lucide-react';

const ObraModal = ({ 
    user, 
    obra, 
    onClose, 
    apiClient, 
    reloadData, 
    setAlertMessage, 
    vehicleGroups = {} // Recebe os grupos para listar todos os tipos
}) => {
    // --- ESTADOS ---
    const [nome, setNome] = useState(obra?.nome || '');
    const [dataInicio, setDataInicio] = useState(obra?.dataInicio ? new Date(obra.dataInicio).toISOString().split('T')[0] : '');
    const [dataFim, setDataFim] = useState(obra?.dataFim ? new Date(obra.dataFim).toISOString().split('T')[0] : '');
    const [contractType, setContractType] = useState(obra?.contractType || 'horas');
    
    // Localização
    const [latitude, setLatitude] = useState(obra?.latitude || '');
    const [longitude, setLongitude] = useState(obra?.longitude || '');

    // Horas Contratadas (Lista Dinâmica)
    // Estrutura: [{ type: 'Caminhão', hours: 100, price: 150.00 }]
    const [contractedItems, setContractedItems] = useState(() => {
        if (obra?.horasContratadasPorTipo) {
            return Object.entries(obra.horasContratadasPorTipo).map(([type, hours]) => ({
                type,
                hours: parseFloat(hours) || 0,
                price: parseFloat(obra.valoresPorTipo?.[type]) || 0 // Supondo que vamos salvar valores também
            }));
        }
        return [];
    });

    // Deslocamento (Caminhão Prancha)
    const [kmContratadoPrancha, setKmContratadoPrancha] = useState(obra?.kmContratadoPrancha?.toString() || '');
    const [valorKmPrancha, setValorKmPrancha] = useState(obra?.valorKmPrancha?.toString() || '');

    // Setores (Metros Quadrados)
    const [sectors, setSectors] = useState((Array.isArray(obra?.sectors) ? obra.sectors : []).map(s => ({ 
        ...s, 
        kmConcluido: s.kmConcluido || 0,
        price: s.price || 0 
    })) || [{ name: '', kmContratado: '', kmConcluido: 0, price: 0 }]);

    const [isSaving, setIsSaving] = useState(false);

    // --- LISTA DE TODOS OS TIPOS DE VEÍCULOS ---
    const allVehicleTypes = useMemo(() => {
        let types = [];
        Object.values(vehicleGroups).forEach(groupList => {
            types = [...types, ...groupList];
        });
        return types.sort();
    }, [vehicleGroups]);

    // --- CÁLCULOS DE TOTAIS (R$) ---
    const totalValue = useMemo(() => {
        let total = 0;
        if (contractType === 'horas') {
            // Soma (Horas * Preço)
            contractedItems.forEach(item => {
                total += (parseFloat(item.hours) || 0) * (parseFloat(item.price) || 0);
            });
            // Soma (Km Prancha * Preço Km)
            total += (parseFloat(kmContratadoPrancha) || 0) * (parseFloat(valorKmPrancha) || 0);
        } else {
            // Soma Setores (Km/m² * Preço)
            sectors.forEach(sector => {
                total += (parseFloat(sector.kmContratado) || 0) * (parseFloat(sector.price) || 0);
            });
        }
        return total;
    }, [contractType, contractedItems, kmContratadoPrancha, valorKmPrancha, sectors]);

    // --- HANDLERS ---

    // Adicionar novo item de hora contratada
    const addContractedItem = () => {
        setContractedItems([...contractedItems, { type: '', hours: '', price: '' }]);
    };

    // Remover item de hora contratada
    const removeContractedItem = (index) => {
        const newItems = contractedItems.filter((_, i) => i !== index);
        setContractedItems(newItems);
    };

    // Atualizar item de hora contratada
    const updateContractedItem = (index, field, value) => {
        const newItems = [...contractedItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setContractedItems(newItems);
    };

    // Handlers de Setores
    const handleSectorChange = (index, field, value) => {
        const newSectors = [...sectors];
        newSectors[index] = { ...newSectors[index], [field]: value };
        setSectors(newSectors);
    };
    const addSector = () => setSectors([...sectors, { name: '', kmContratado: '', kmConcluido: 0, price: 0 }]);
    const removeSector = (index) => setSectors(sectors.filter((_, i) => i !== index));

    // Submissão
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!nome) {
            setAlertMessage("O nome da obra é obrigatório.");
            return;
        }
        setIsSaving(true);

        let dataToSave = {
            nome,
            contractType,
            dataInicio: dataInicio || null,
            dataFim: dataFim || null,
            latitude: latitude || null,
            longitude: longitude || null,
            valorTotalContrato: totalValue // Salvando o valor total calculado
        };

        if (contractType === 'horas') {
            // Converte o array de volta para objeto para compatibilidade com o backend atual
            // Mas também salva 'valoresPorTipo' separadamente se necessário ou ajusta o backend
            const horasObj = {};
            const valoresObj = {};
            
            contractedItems.forEach(item => {
                if (item.type) {
                    horasObj[item.type] = parseFloat(item.hours) || 0;
                    valoresObj[item.type] = parseFloat(item.price) || 0;
                }
            });

            dataToSave = {
                ...dataToSave,
                horasContratadasPorTipo: horasObj,
                valoresPorTipo: valoresObj, // Novo campo sugerido para o backend
                kmContratadoPrancha: parseFloat(kmContratadoPrancha) || 0,
                valorKmPrancha: parseFloat(valorKmPrancha) || 0, // Novo campo
                sectors: [],
            };
        } else if (contractType === 'metrosQuadrados') {
             dataToSave = {
                ...dataToSave,
                sectors: sectors.map(s => ({
                    name: s.name,
                    kmContratado: parseFloat(s.kmContratado) || 0,
                    kmConcluido: parseFloat(s.kmConcluido) || 0,
                    price: parseFloat(s.price) || 0 // Novo campo
                })).filter(s => s.name.trim() !== ''),
                horasContratadasPorTipo: {},
                kmContratadoPrancha: 0,
                kmConcluidoPrancha: obra?.kmConcluidoPrancha || 0,
                horasAdicionaisCaminhao: obra?.horasAdicionaisCaminhao || 0,
            };
        }

        try {
            if (obra) {
                await apiClient.updateObra(obra.id, dataToSave);
                setAlertMessage('Obra atualizada com sucesso!');
            } else {
                await apiClient.createObra(dataToSave);
                setAlertMessage('Obra criada com sucesso!');
            }
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao salvar obra:", error);
            setAlertMessage(error.message || "Ocorreu um erro ao salvar a obra.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col my-auto">
                {/* Cabeçalho */}
                <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                    <h2 className="text-xl sm:text-2xl font-bold">{obra ? 'Editar Obra' : 'Nova Obra'}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                </div>
                
                {/* Formulário */}
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-6 text-sm">
                        
                        {/* 1. Dados Básicos */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block font-medium text-gray-700">Nome da Obra *</label>
                                <input name="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Terraplanagem Loteamento X" required className="w-full p-2 border rounded mt-1"/>
                            </div>
                            <div>
                                <label className="block font-medium text-gray-700">Data de Início</label>
                                <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full p-2 border rounded mt-1" />
                            </div>
                            <div>
                                <label className="block font-medium text-gray-700">Previsão de Término</label>
                                <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full p-2 border rounded mt-1" />
                            </div>
                        </div>

                        {/* 2. Localização */}
                        <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                            <h3 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                                <MapPin size={16}/> Localização
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600">Latitude</label>
                                    <input type="text" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="-29.xxxx" className="w-full p-2 border rounded mt-1 bg-white text-xs"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600">Longitude</label>
                                    <input type="text" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="-51.xxxx" className="w-full p-2 border rounded mt-1 bg-white text-xs"/>
                                </div>
                            </div>
                        </div>

                        {/* 3. Contrato e Valores */}
                        <div className="border-t pt-4">
                            <label className="block font-medium text-gray-700 mb-2">Modelo de Contrato</label>
                            <select name="contractType" value={contractType} onChange={(e) => setContractType(e.target.value)} className="w-full p-2 border rounded bg-white">
                                <option value="horas">Por Horas Trabalhadas</option>
                                <option value="metrosQuadrados">Por Produção (m² / Km)</option>
                            </select>
                        </div>

                        {/* Lógica Condicional: HORAS */}
                        {contractType === 'horas' && (
                            <div className="space-y-4 animate-fadeIn">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold text-gray-800">Equipamentos Contratados</h3>
                                    <button type="button" onClick={addContractedItem} className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium">
                                        <PlusCircle size={14}/> Adicionar Equipamento
                                    </button>
                                </div>
                                
                                {contractedItems.map((item, index) => (
                                    <div key={index} className="flex flex-wrap md:flex-nowrap gap-3 items-end p-3 bg-gray-50 rounded border">
                                        <div className="w-full md:w-1/3">
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Veículo</label>
                                            <select 
                                                value={item.type} 
                                                onChange={(e) => updateContractedItem(index, 'type', e.target.value)} 
                                                className="w-full p-2 border rounded text-sm bg-white"
                                            >
                                                <option value="">Selecione...</option>
                                                {allVehicleTypes.map(t => (
                                                    <option key={t} value={t}>{t}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="w-1/2 md:w-1/4">
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Horas Previstas</label>
                                            <input type="number" step="0.1" value={item.hours} onChange={(e) => updateContractedItem(index, 'hours', e.target.value)} placeholder="0" className="w-full p-2 border rounded text-sm"/>
                                        </div>
                                        <div className="w-1/2 md:w-1/4">
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Valor Hora (R$)</label>
                                            <input type="number" step="0.01" value={item.price} onChange={(e) => updateContractedItem(index, 'price', e.target.value)} placeholder="0.00" className="w-full p-2 border rounded text-sm"/>
                                        </div>
                                        <button type="button" onClick={() => removeContractedItem(index)} className="p-2 text-red-500 hover:bg-red-100 rounded"><Trash2 size={16}/></button>
                                    </div>
                                ))}

                                <div className="p-4 bg-yellow-50 rounded border border-yellow-200 mt-4">
                                    <h3 className="font-bold text-gray-800 mb-2 text-xs uppercase">Deslocamento (Caminhão Prancha)</h3>
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className="block text-xs font-medium text-gray-600">Km Contratado</label>
                                            <input type="number" step="0.1" value={kmContratadoPrancha} onChange={(e) => setKmContratadoPrancha(e.target.value)} className="w-full p-2 border rounded mt-1 bg-white"/>
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-xs font-medium text-gray-600">Valor Km (R$)</label>
                                            <input type="number" step="0.01" value={valorKmPrancha} onChange={(e) => setValorKmPrancha(e.target.value)} className="w-full p-2 border rounded mt-1 bg-white"/>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Lógica Condicional: PRODUÇÃO (m²) */}
                        {contractType === 'metrosQuadrados' && (
                            <div className="space-y-4 animate-fadeIn">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold text-gray-800">Setores / Trechos</h3>
                                    <button type="button" onClick={addSector} className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium">
                                        <PlusCircle size={14}/> Adicionar Setor
                                    </button>
                                </div>
                                {sectors.map((sector, index) => (
                                    <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-3 bg-gray-50 rounded border">
                                        <div className="sm:col-span-4">
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Nome do Setor</label>
                                            <input type="text" value={sector.name} onChange={(e) => handleSectorChange(index, 'name', e.target.value)} placeholder="Ex: Rua A" className="w-full p-2 border rounded text-sm"/>
                                        </div>
                                        <div className="sm:col-span-3">
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Qtd. (m² ou Km)</label>
                                            <input type="number" step="0.1" value={sector.kmContratado} onChange={(e) => handleSectorChange(index, 'kmContratado', e.target.value)} className="w-full p-2 border rounded text-sm"/>
                                        </div>
                                        <div className="sm:col-span-3">
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Preço Unit. (R$)</label>
                                            <input type="number" step="0.01" value={sector.price} onChange={(e) => handleSectorChange(index, 'price', e.target.value)} className="w-full p-2 border rounded text-sm"/>
                                        </div>
                                        <div className="sm:col-span-1 flex justify-end">
                                            <button type="button" onClick={() => removeSector(index)} className="p-2 text-red-500 hover:bg-red-100 rounded"><Trash2 size={16}/></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Totalizador */}
                        <div className="bg-gray-800 text-white p-4 rounded-lg flex justify-between items-center shadow-lg mt-6">
                            <span className="font-medium">Valor Total Estimado do Contrato:</span>
                            <span className="text-xl font-bold text-green-400">
                                {totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                        </div>

                    </div>

                    {/* Rodapé */}
                    <div className="p-4 bg-gray-50 border-t flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm font-medium text-gray-700">Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-6 py-2 bg-yellow-400 text-gray-900 font-bold rounded hover:bg-yellow-500 flex items-center gap-2">
                            {isSaving ? <Loader size={18} className="animate-spin"/> : 'Salvar Obra'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ObraModal;