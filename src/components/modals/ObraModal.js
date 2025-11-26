import React, { useState, useEffect } from 'react';
import { X, Loader, MapPin, Clock, Truck } from 'lucide-react';

const ObraModal = ({ 
    user, 
    obra, 
    onClose, 
    apiClient, 
    reloadData, 
    setAlertMessage, 
    equipmentTypesForHours = [] // Recebe a lista filtrada (derivedEquipmentTypes) do Pai (ObrasPage)
}) => {
    // --- ESTADOS DO FORMULÁRIO ---
    const [nome, setNome] = useState('');
    const [contractType, setContractType] = useState('horas'); // 'horas' | 'metrosQuadrados'
    const [dataInicio, setDataInicio] = useState(new Date().toISOString().split('T')[0]);
    const [dataFim, setDataFim] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    
    // Estados para Contrato por Horas
    const [horasContratadasPorTipo, setHorasContratadasPorTipo] = useState({});
    const [kmContratadoPrancha, setKmContratadoPrancha] = useState('');

    // Estados para Contrato por M² (Setores)
    const [sectors, setSectors] = useState([]);

    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- INICIALIZAÇÃO (Modo Edição) ---
    useEffect(() => {
        if (obra) {
            setNome(obra.nome || '');
            setContractType(obra.contractType || 'horas');
            setDataInicio(obra.dataInicio ? new Date(obra.dataInicio).toISOString().split('T')[0] : '');
            setDataFim(obra.dataFim ? new Date(obra.dataFim).toISOString().split('T')[0] : '');
            setLatitude(obra.latitude || '');
            setLongitude(obra.longitude || '');
            
            // Parse seguro do JSON de horas
            const horasParsed = typeof obra.horasContratadasPorTipo === 'string' 
                ? JSON.parse(obra.horasContratadasPorTipo) 
                : (obra.horasContratadasPorTipo || {});
            setHorasContratadasPorTipo(horasParsed);

            setKmContratadoPrancha(obra.kmContratadoPrancha || '');

            // Parse seguro do JSON de setores
            const sectorsParsed = Array.isArray(obra.sectors) ? obra.sectors : [];
            setSectors(sectorsParsed);
        }
    }, [obra]);

    // --- HANDLERS ---

    const handleHoursChange = (type, value) => {
        setHorasContratadasPorTipo(prev => ({ ...prev, [type]: value }));
    };

    const handleAddSector = () => {
        setSectors([...sectors, { name: '', kmContratado: '', kmConcluido: 0 }]);
    };

    const handleSectorChange = (index, field, value) => {
        const newSectors = [...sectors];
        newSectors[index][field] = value;
        setSectors(newSectors);
    };

    const handleRemoveSector = (index) => {
        setSectors(sectors.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        const payload = {
            nome,
            contractType,
            dataInicio,
            dataFim: dataFim || null,
            latitude,
            longitude,
            kmContratadoPrancha: parseFloat(kmContratadoPrancha) || 0,
        };

        // Limpa dados irrelevantes baseado no tipo de contrato escolhido
        if (contractType === 'horas') {
            payload.horasContratadasPorTipo = horasContratadasPorTipo;
            payload.sectors = []; 
        } else {
            payload.sectors = sectors;
            payload.horasContratadasPorTipo = {}; 
        }

        try {
            if (obra) {
                await apiClient.updateObra(obra.id, payload);
                setAlertMessage("Obra atualizada com sucesso!");
            } else {
                await apiClient.createObra(payload);
                setAlertMessage("Obra criada com sucesso!");
            }
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao salvar obra:", error);
            setAlertMessage(error.message || "Erro ao salvar obra.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-lg sticky top-0 z-10">
                    <h2 className="text-xl font-bold text-gray-800">{obra ? 'Editar Obra' : 'Nova Obra'}</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 text-gray-500" disabled={isSubmitting}><X size={24}/></button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* 1. Dados Básicos */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Nome da Obra *</label>
                            <input 
                                type="text" 
                                value={nome} 
                                onChange={(e) => setNome(e.target.value)} 
                                className="w-full p-2 border rounded focus:ring-2 focus:ring-yellow-400 outline-none" 
                                required 
                                placeholder="Ex: Pavimentação Rua A"
                            />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Data Início *</label>
                                <input 
                                    type="date" 
                                    value={dataInicio} 
                                    onChange={(e) => setDataInicio(e.target.value)} 
                                    className="w-full p-2 border rounded" 
                                    required 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Previsão Fim</label>
                                <input 
                                    type="date" 
                                    value={dataFim} 
                                    onChange={(e) => setDataFim(e.target.value)} 
                                    className="w-full p-2 border rounded" 
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1"><MapPin size={14}/> Latitude</label>
                                <input type="text" value={latitude} onChange={(e) => setLatitude(e.target.value)} className="w-full p-2 border rounded" placeholder="-29.1234"/>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1"><MapPin size={14}/> Longitude</label>
                                <input type="text" value={longitude} onChange={(e) => setLongitude(e.target.value)} className="w-full p-2 border rounded" placeholder="-51.5678"/>
                            </div>
                        </div>
                    </div>

                    {/* 2. Configuração do Contrato */}
                    <div className="border-t pt-4">
                        <label className="block text-sm font-bold text-gray-700 mb-3">Tipo de Contrato</label>
                        <div className="flex gap-4 mb-4">
                            <button 
                                type="button" 
                                onClick={() => setContractType('horas')}
                                className={`flex-1 py-2 rounded-lg border-2 font-bold transition ${contractType === 'horas' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                            >
                                Por Horas (Equipamentos)
                            </button>
                            <button 
                                type="button" 
                                onClick={() => setContractType('metrosQuadrados')}
                                className={`flex-1 py-2 rounded-lg border-2 font-bold transition ${contractType === 'metrosQuadrados' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                            >
                                Por Produção (m² / Km)
                            </button>
                        </div>

                        {/* A. POR HORAS */}
                        {contractType === 'horas' && (
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 animate-fadeIn">
                                <h3 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                                    <Clock size={16}/> Horas Contratadas por Tipo
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* Lista gerada a partir da prop 'equipmentTypesForHours' vinda do Pai */}
                                    {equipmentTypesForHours.length > 0 ? equipmentTypesForHours.map(type => (
                                        <div key={type}>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">{type}</label>
                                            <div className="relative">
                                                <input 
                                                    type="number" 
                                                    value={horasContratadasPorTipo[type] || ''} 
                                                    onChange={(e) => handleHoursChange(type, e.target.value)} 
                                                    className="w-full p-2 pr-8 border rounded text-sm focus:ring-1 focus:ring-blue-400 outline-none" 
                                                    placeholder="0"
                                                />
                                                <span className="absolute right-2 top-2 text-xs text-gray-400 font-bold">h</span>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="col-span-full text-center text-gray-400 text-sm italic py-2">
                                            Nenhum tipo de equipamento disponível para contratação por hora.
                                        </div>
                                    )}
                                </div>
                                <div className="mt-4 pt-4 border-t border-blue-200">
                                    <label className="block text-xs font-bold text-gray-600 mb-1">Deslocamento (Caminhão Prancha)</label>
                                    <div className="relative">
                                        <input 
                                            type="number" 
                                            value={kmContratadoPrancha} 
                                            onChange={(e) => setKmContratadoPrancha(e.target.value)} 
                                            className="w-full p-2 pr-10 border rounded text-sm focus:ring-1 focus:ring-purple-400 outline-none" 
                                            placeholder="Km Total Contratado"
                                        />
                                        <span className="absolute right-3 top-2 text-xs text-gray-400 font-bold">Km</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* B. POR M2 (SETORES) */}
                        {contractType === 'metrosQuadrados' && (
                            <div className="bg-green-50 p-4 rounded-lg border border-green-100 animate-fadeIn">
                                <h3 className="text-sm font-bold text-green-800 mb-3 flex items-center justify-between">
                                    <span>Setores / Trechos</span>
                                    <button type="button" onClick={handleAddSector} className="text-xs bg-green-200 hover:bg-green-300 text-green-800 px-2 py-1 rounded transition">+ Adicionar</button>
                                </h3>
                                {sectors.map((sector, idx) => (
                                    <div key={idx} className="flex gap-2 mb-2 items-end">
                                        <div className="flex-1">
                                            <label className="text-[10px] text-gray-500 font-bold">Nome do Setor</label>
                                            <input 
                                                type="text" 
                                                value={sector.name} 
                                                onChange={(e) => handleSectorChange(idx, 'name', e.target.value)} 
                                                className="w-full p-1.5 border rounded text-sm" 
                                                placeholder="Ex: Trecho 1"
                                            />
                                        </div>
                                        <div className="w-24">
                                            <label className="text-[10px] text-gray-500 font-bold">Km Total</label>
                                            <input 
                                                type="number" 
                                                value={sector.kmContratado} 
                                                onChange={(e) => handleSectorChange(idx, 'kmContratado', e.target.value)} 
                                                className="w-full p-1.5 border rounded text-sm" 
                                                placeholder="0"
                                            />
                                        </div>
                                        <button type="button" onClick={() => handleRemoveSector(idx)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded mb-0.5">
                                            <X size={16}/>
                                        </button>
                                    </div>
                                ))}
                                {sectors.length === 0 && <p className="text-center text-gray-400 text-sm italic">Nenhum setor adicionado.</p>}
                                
                                <div className="mt-4 pt-4 border-t border-green-200">
                                    <label className="block text-xs font-bold text-gray-600 mb-1">Deslocamento (Caminhão Prancha)</label>
                                    <div className="relative">
                                        <input 
                                            type="number" 
                                            value={kmContratadoPrancha} 
                                            onChange={(e) => setKmContratadoPrancha(e.target.value)} 
                                            className="w-full p-2 pr-10 border rounded text-sm focus:ring-1 focus:ring-purple-400 outline-none" 
                                            placeholder="Km Total Contratado"
                                        />
                                        <span className="absolute right-3 top-2 text-xs text-gray-400 font-bold">Km</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 font-bold rounded hover:bg-gray-200 transition" disabled={isSubmitting}>Cancelar</button>
                        <button type="submit" className="px-6 py-2 bg-yellow-400 text-gray-900 font-bold rounded hover:bg-yellow-500 transition shadow-lg flex items-center gap-2" disabled={isSubmitting}>
                            {isSubmitting ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar Obra'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ObraModal;