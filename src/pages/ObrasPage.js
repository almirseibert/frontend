import React, { useState, useMemo } from 'react';
import { 
    PlusCircle, Download, Edit, Trash2, RefreshCw, MapPin, 
    AlertTriangle, Search, Filter, MoreVertical, CheckCircle,
    X, Loader, Clock, DollarSign, Calendar 
} from 'lucide-react';
import ProtectedComponent from '../components/ProtectedComponent';

// --- Página Principal de Obras ---
const ObrasPage = ({
    user,
    vehicles = [],
    obras = [],
    PasswordConfirmationModal,
    setAlertMessage,
    vehicleGroups = {},
    employees = [],
    equipmentTypesForHours = [], // Adicionado para garantir que passe para os modais
    apiClient,
    reloadData,
}) => {
    // --- ESTADOS DA PÁGINA ---
    const [filter, setFilter] = useState('ativas'); // 'ativas' | 'finalizadas'
    const [searchTerm, setSearchTerm] = useState('');
    
    // --- ESTADOS DOS MODAIS ---
    const [modalState, setModalState] = useState({
        createEdit: false,
        detail: false,
        finish: false,
        delete: false
    });
    const [selectedObra, setSelectedObra] = useState(null);

    // --- HANDLERS ---
    const openModal = (type, obra = null) => {
        setSelectedObra(obra);
        setModalState(prev => ({ ...prev, [type]: true }));
    };

    const closeModal = (type) => {
        setModalState(prev => ({ ...prev, [type]: false }));
        if (type !== 'detail') setSelectedObra(null);
    };

    const handleDelete = async () => {
        if (!selectedObra) return;
        try {
            await apiClient.deleteObra(selectedObra.id);
            setAlertMessage("Obra excluída com sucesso!");
            reloadData();
        } catch (error) {
            console.error("Erro ao excluir:", error);
            setAlertMessage(error.message || "Erro ao excluir obra.");
        } finally {
            closeModal('delete');
        }
    };

    const handleReactivate = async (obra) => {
        try {
            await apiClient.updateObra(obra.id, { status: 'ativa' });
            setAlertMessage("Obra reativada!");
            reloadData();
        } catch (error) {
            setAlertMessage("Erro ao reativar obra.");
        }
    };

    // --- FILTROS E ORDENAÇÃO ---
    const filteredObras = useMemo(() => {
        return (obras || [])
            .filter(o => {
                const statusMatch = filter === 'finalizadas' ? o.status === 'finalizada' : o.status !== 'finalizada';
                const searchMatch = (o.nome || '').toLowerCase().includes(searchTerm.toLowerCase());
                return statusMatch && searchMatch;
            })
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    }, [obras, filter, searchTerm]);

    const exportToCSV = () => {
        if (!filteredObras || filteredObras.length === 0) {
             setAlertMessage("Nenhuma obra para exportar.");
             return;
         }
        const headers = ['Nome', 'Status', 'Data Início', 'Data Fim', 'Tipo de Contrato', 'Horas Contratadas', 'Km Prancha Contratado', 'Latitude', 'Longitude'];
        const rows = filteredObras.map(o => {
            const contractedHours = Object.values(o.horasContratadasPorTipo || {}).reduce((sum, h) => sum + (parseFloat(h) || 0), 0);
            return [
                o.nome,
                o.status,
                o.dataInicio ? new Date(o.dataInicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A',
                o.dataFim ? new Date(o.dataFim).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A',
                o.contractType === 'horas' ? 'Horas Trabalhadas' : 'Metros Quadrados',
                contractedHours.toFixed(1),
                o.kmContratadoPrancha || 0,
                o.latitude || '',
                o.longitude || ''
            ];
        });
        const csvRows = rows.map(row =>
            row.map(field => `"${String(field || '').replace(/"/g, '""')}"`).join(',')
        ).join('\n');

        let csvContent = "data:text/csv;charset=utf-8," + headers.join(',') + '\n' + csvRows;
        const link = document.createElement('a');
        link.setAttribute('href', encodeURI(csvContent));
        link.setAttribute('download', 'obras.csv');
        link.click();
    };

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 animate-fadeIn">
            
            {/* TOPO */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Obras</h1>
                    <p className="text-gray-500 text-sm">Gerencie contratos, alocações e progresso financeiro.</p>
                </div>
                <ProtectedComponent requiredPermission="editor">
                    <div className="flex gap-2">
                        <button onClick={exportToCSV} className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow hover:bg-blue-600 transition text-sm">
                            <Download size={16}/> CSV
                        </button>
                        <button onClick={() => openModal('createEdit')} className="flex items-center gap-2 px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold rounded-lg shadow transition text-sm">
                            <PlusCircle size={18}/> Nova Obra
                        </button>
                    </div>
                </ProtectedComponent>
            </div>

            {/* CONTROLES DE FILTRO */}
            <div className="bg-white p-4 rounded-lg shadow-sm mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button 
                        onClick={() => setFilter('ativas')} 
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filter === 'ativas' ? 'bg-white shadow text-yellow-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Em Andamento
                    </button>
                    <button 
                        onClick={() => setFilter('finalizadas')} 
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filter === 'finalizadas' ? 'bg-white shadow text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Finalizadas
                    </button>
                </div>
                
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Buscar obra..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 border rounded-lg w-full focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none"
                    />
                </div>
            </div>

            {/* GRID DE CARDS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredObras.map(obra => {
                    const totalContrato = Object.values(obra.horasContratadasPorTipo || {}).reduce((s, h) => s + (parseFloat(h) || 0), 0);
                    const tipoContratoLabel = obra.contractType === 'metrosQuadrados' ? 'Produção' : 'Horas';
                    const activeCount = (obra.historicoVeiculos || []).filter(h => !h.dataSaida).length;

                    return (
                        <div key={obra.id} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow p-5 flex flex-col justify-between h-full">
                            
                            {/* Header do Card */}
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800 line-clamp-1" title={obra.nome}>{obra.nome}</h3>
                                    {obra.latitude && (
                                        <a 
                                            href={`https://www.google.com/maps/search/?api=1&query=${obra.latitude},${obra.longitude}`} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1"
                                        >
                                            <MapPin size={12}/> Ver no Mapa
                                        </a>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    <ProtectedComponent requiredPermission="editor">
                                        <button onClick={() => openModal('createEdit', obra)} className="p-1.5 text-gray-400 hover:text-yellow-600 rounded-full hover:bg-gray-50 transition">
                                            <Edit size={16}/>
                                        </button>
                                    </ProtectedComponent>
                                </div>
                            </div>

                            {/* Corpo do Card */}
                            <div className="space-y-3 mb-4">
                                <div className="flex justify-between text-sm py-1 border-b border-dashed border-gray-100">
                                    <span className="text-gray-500">Contrato</span>
                                    <span className="font-medium text-gray-700">{tipoContratoLabel}</span>
                                </div>
                                <div className="flex justify-between text-sm py-1 border-b border-dashed border-gray-100">
                                    <span className="text-gray-500">Total Contratado</span>
                                    <span className="font-bold text-gray-900">
                                        {obra.contractType === 'horas' ? `${totalContrato.toFixed(1)} hrs` : 'N/A'}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm py-1">
                                    <span className="text-gray-500">Equipamentos Ativos</span>
                                    <span className={`font-bold px-2 py-0.5 rounded-full text-xs ${activeCount > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {activeCount}
                                    </span>
                                </div>
                            </div>

                            {/* Rodapé do Card */}
                            <div className="pt-3 border-t flex gap-2">
                                <button 
                                    onClick={() => openModal('detail', obra)} 
                                    className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
                                >
                                    Gerenciar
                                </button>
                                
                                <ProtectedComponent requiredPermission="editor">
                                    {obra.status === 'ativa' ? (
                                        <button 
                                            onClick={() => openModal('finish', obra)} 
                                            className="px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition"
                                            title="Finalizar Obra"
                                        >
                                            <CheckCircle size={18}/>
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => handleReactivate(obra)} 
                                            className="px-3 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded-lg transition"
                                            title="Reativar"
                                        >
                                            <RefreshCw size={18}/>
                                        </button>
                                    )}
                                </ProtectedComponent>
                                
                                <ProtectedComponent requiredPermission="admin">
                                    <button 
                                        onClick={() => openModal('delete', obra)} 
                                        className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition"
                                        title="Excluir"
                                    >
                                        <Trash2 size={18}/>
                                    </button>
                                </ProtectedComponent>
                            </div>
                        </div>
                    );
                })}
            </div>

            {filteredObras.length === 0 && (
                <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-300 mt-6">
                    <AlertTriangle className="mx-auto text-gray-300 mb-4" size={48}/>
                    <h3 className="text-lg font-medium text-gray-500">Nenhuma obra encontrada</h3>
                    <p className="text-gray-400 text-sm">Tente ajustar os filtros ou criar uma nova obra.</p>
                </div>
            )}

            {/* --- MODAIS INLINE (PARA EVITAR ERROS DE IMPORTAÇÃO) --- */}
            
            {modalState.createEdit && (
                <ObraModal 
                    user={user}
                    obra={selectedObra} 
                    onClose={() => closeModal('createEdit')} 
                    apiClient={apiClient} 
                    reloadData={reloadData} 
                    setAlertMessage={setAlertMessage}
                    equipmentTypesForHours={equipmentTypesForHours}
                />
            )}

            {modalState.detail && selectedObra && (
                <ObraDetailModal 
                    user={user}
                    obra={selectedObra} 
                    vehicles={vehicles}
                    onClose={() => closeModal('detail')} 
                    setAlertMessage={setAlertMessage} 
                    apiClient={apiClient} 
                    reloadData={reloadData}
                    vehicleGroups={vehicleGroups}
                    equipmentTypesForHours={equipmentTypesForHours}
                    employees={employees}
                />
            )}

            {modalState.finish && selectedObra && (
                <FinishObraModal 
                    obra={selectedObra} 
                    onClose={() => closeModal('finish')} 
                    apiClient={apiClient} 
                    reloadData={reloadData} 
                    setAlertMessage={setAlertMessage} 
                />
            )}

            {modalState.delete && selectedObra && (
                <PasswordConfirmationModal 
                    message={`Tem certeza que deseja excluir a obra "${selectedObra.nome}"? Esta ação não pode ser desfeita.`}
                    onConfirm={handleDelete} 
                    onClose={() => closeModal('delete')} 
                    apiClient={apiClient} 
                />
            )}

        </div>
    );
};

// --- COMPONENTES MODAIS (INLINE) ---

// 1. ObraModal (Criar/Editar)
const ObraModal = ({ user, obra, onClose, equipmentTypesForHours, apiClient, reloadData, setAlertMessage }) => {
    const [nome, setNome] = useState(obra?.nome || '');
    const [dataInicio, setDataInicio] = useState(obra?.dataInicio ? new Date(obra.dataInicio).toISOString().split('T')[0] : '');
    const [dataFim, setDataFim] = useState(obra?.dataFim ? new Date(obra.dataFim).toISOString().split('T')[0] : '');
    const [contractType, setContractType] = useState(obra?.contractType || 'horas');
    const [latitude, setLatitude] = useState(obra?.latitude || '');
    const [longitude, setLongitude] = useState(obra?.longitude || '');

    const [horasPorTipo, setHorasPorTipo] = useState(() => {
        return (equipmentTypesForHours || []).reduce((acc, type) => {
            acc[type] = obra?.horasContratadasPorTipo?.[type]?.toString() || '';
            return acc;
        }, {});
    });
    const [kmContratadoPrancha, setKmContratadoPrancha] = useState(obra?.kmContratadoPrancha?.toString() || '');
    const [sectors, setSectors] = useState((Array.isArray(obra?.sectors) ? obra.sectors : []).map(s => ({ ...s, kmConcluido: s.kmConcluido || 0 })) || [{ name: '', kmContratado: '', kmConcluido: 0 }]);
    const [isSaving, setIsSaving] = useState(false);

    const handleHourChange = (type, value) => setHorasPorTipo(prev => ({ ...prev, [type]: value }));
    const handleSectorChange = (index, field, value) => {
        const newSectors = [...sectors];
        newSectors[index] = { ...newSectors[index], [field]: value };
        setSectors(newSectors);
    };
    const addSector = () => setSectors([...sectors, { name: '', kmContratado: '', kmConcluido: 0 }]);
    const removeSector = (index) => setSectors(sectors.filter((_, i) => i !== index));

    const totalHoras = useMemo(() => Object.values(horasPorTipo).reduce((sum, h) => sum + (parseFloat(h) || 0), 0), [horasPorTipo]);
    const totalKmContratadoSetores = useMemo(() => sectors.reduce((sum, s) => sum + (parseFloat(s.kmContratado) || 0), 0), [sectors]);

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
        };

        if (contractType === 'horas') {
            const numericHorasPorTipo = Object.entries(horasPorTipo).reduce((acc, [type, val]) => {
                acc[type] = parseFloat(val) || 0;
                return acc;
            }, {});

            dataToSave = {
                ...dataToSave,
                horasContratadasPorTipo: numericHorasPorTipo,
                kmContratadoPrancha: parseFloat(kmContratadoPrancha) || 0,
                sectors: [],
            };
        } else if (contractType === 'metrosQuadrados') {
             dataToSave = {
                ...dataToSave,
                sectors: sectors.map(s => ({
                    name: s.name,
                    kmContratado: parseFloat(s.kmContratado) || 0,
                    kmConcluido: parseFloat(s.kmConcluido) || 0,
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
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[95vh] flex flex-col my-auto">
                <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                    <h2 className="text-xl sm:text-2xl font-bold">{obra ? 'Editar Obra' : 'Adicionar Obra'}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                </div>
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4 text-sm">
                         <div>
                            <label className="block font-medium text-gray-700">Nome da Obra *</label>
                            <input name="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da Obra" required className="w-full p-2 border rounded mt-1"/>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block font-medium text-gray-700">Data de Início</label>
                                <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full p-2 border rounded mt-1" />
                            </div>
                            <div>
                                <label className="block font-medium text-gray-700">Data de Fim Previsto/Real</label>
                                <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full p-2 border rounded mt-1" />
                            </div>
                        </div>

                        <div className="pt-4 border-t mt-4">
                            <h3 className="text-base font-semibold mb-2 text-gray-800 flex items-center gap-2">
                                <MapPin size={16} className="text-blue-600"/> Localização (GPS)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700">Latitude</label>
                                    <input 
                                        type="text" 
                                        value={latitude} 
                                        onChange={(e) => setLatitude(e.target.value)} 
                                        placeholder="Ex: -29.6914" 
                                        className="w-full p-2 border rounded mt-1 text-sm bg-blue-50/50" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700">Longitude</label>
                                    <input 
                                        type="text" 
                                        value={longitude} 
                                        onChange={(e) => setLongitude(e.target.value)} 
                                        placeholder="Ex: -53.8008" 
                                        className="w-full p-2 border rounded mt-1 text-sm bg-blue-50/50" 
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block font-medium text-gray-700 mt-4">Tipo de Contrato</label>
                            <select name="contractType" value={contractType} onChange={(e) => setContractType(e.target.value)} className="w-full p-2 border rounded mt-1 bg-white">
                                <option value="horas">Horas Trabalhadas</option>
                                <option value="metrosQuadrados">Metros Quadrados</option>
                            </select>
                        </div>

                        {contractType === 'horas' && (
                            <div className="pt-4 border-t mt-4">
                                <h3 className="text-base font-semibold mb-2 text-gray-800">Horas Contratadas por Tipo</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
                                    {(equipmentTypesForHours || []).map(type => (
                                        <div key={type}>
                                            <label className="block text-xs font-medium text-gray-700">{type}</label>
                                            <input type="number" step="0.1" value={horasPorTipo[type]} onChange={(e) => handleHourChange(type, e.target.value)} placeholder="0" className="w-full p-2 border rounded mt-1 text-sm"/>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 pt-4 border-t">
                                    <h3 className="text-base font-semibold mb-2 text-gray-800">Deslocamento</h3>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700">Km Contratado Caminhão Prancha</label>
                                        <input type="number" step="0.1" value={kmContratadoPrancha} onChange={(e) => setKmContratadoPrancha(e.target.value)} placeholder="0" className="w-full p-2 border rounded mt-1 text-sm"/>
                                    </div>
                                </div>
                                <div className="mt-4 p-2 bg-yellow-100 rounded text-center text-sm">
                                    <span className="font-bold text-yellow-800">Total de Horas Contratadas: {totalHoras.toFixed(1)}</span>
                                </div>
                            </div>
                        )}
                         {contractType === 'metrosQuadrados' && (
                            <div className="pt-4 border-t mt-4">
                                <h3 className="text-base font-semibold mb-2 text-gray-800">Setores da Obra (Metros Quadrados)</h3>
                                <div className="space-y-3">
                                    {sectors.map((sector, index) => (
                                        <div key={index} className="flex flex-col sm:flex-row items-end gap-2 p-3 border rounded bg-gray-50">
                                            <div className="flex-1 w-full sm:w-auto">
                                                <label className="block text-xs font-medium text-gray-700">Nome do Setor *</label>
                                                <input type="text" value={sector.name} onChange={(e) => handleSectorChange(index, 'name', e.target.value)} placeholder="Ex: Rua A" className="w-full p-2 border rounded mt-1 text-sm" required/>
                                            </div>
                                            <div className="flex-1 w-full sm:w-auto">
                                                <label className="block text-xs font-medium text-gray-700">Km Contratado *</label>
                                                <input type="number" step="0.1" value={sector.kmContratado} onChange={(e) => handleSectorChange(index, 'kmContratado', e.target.value)} placeholder="0" className="w-full p-2 border rounded mt-1 text-sm" required/>
                                            </div>
                                            <div className="flex-1 w-full sm:w-auto">
                                                <label className="block text-xs font-medium text-gray-700">Km Concluído</label>
                                                <input type="number" step="0.1" value={sector.kmConcluido} onChange={(e) => handleSectorChange(index, 'kmConcluido', e.target.value)} placeholder="0" className="w-full p-2 border rounded mt-1 text-sm"/>
                                            </div>
                                            {sectors.length > 1 && (
                                                <button type="button" onClick={() => removeSector(index)} className="p-1.5 bg-red-100 text-red-600 rounded-full hover:bg-red-200 mt-2 sm:mt-0"><Trash2 size={14} /></button>
                                            )}
                                        </div>
                                    ))}
                                    <button type="button" onClick={addSector} className="px-3 py-1.5 bg-blue-500 text-white font-semibold rounded-lg shadow hover:bg-blue-600 transition flex items-center gap-1 text-xs"><PlusCircle size={16} /> Adicionar Setor</button>
                                </div>
                                <div className="mt-4 p-2 bg-yellow-100 rounded text-center text-sm">
                                    <span className="font-bold text-yellow-800">Total de Km Contratados: {totalKmContratadoSetores.toFixed(1)} Km</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="p-4 bg-gray-50 border-t flex flex-col sm:flex-row justify-end gap-2 sticky bottom-0 z-10">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium w-full sm:w-auto" disabled={isSaving}>Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-200 flex items-center justify-center gap-2 text-sm w-full sm:w-auto">
                             {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar Obra'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// 2. FinishObraModal
const FinishObraModal = ({ obra, onClose, apiClient, reloadData, setAlertMessage }) => {
    const [dataFim, setDataFim] = useState(obra?.dataFim ? new Date(obra.dataFim).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            await apiClient.finishObra(obra.id, { dataFim });
            setAlertMessage('Obra finalizada com sucesso!');
            reloadData();
            onClose();
        } catch (error) {
             console.error("Erro ao finalizar obra:", error);
             setAlertMessage(error.message || 'Falha ao finalizar a obra. Verifique se ainda há veículos alocados.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
             <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-6 border-b flex justify-between items-center">
                    <h3 className="text-xl font-bold">Finalizar Obra</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200" disabled={isSubmitting}><X size={20}/></button>
                </div>
                <div className="p-6">
                    <p className="text-gray-600 mb-4 text-sm">Tem certeza de que deseja finalizar a obra "{obra.nome}"?</p>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700">Data de Finalização *</label>
                        <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full p-2 border rounded mt-1 text-sm" required/>
                    </div>
                </div>
                <div className="p-4 bg-gray-50 border-t flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSubmitting}>Cancelar</button>
                    <button onClick={handleSubmit} disabled={isSubmitting} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-red-400 flex items-center justify-center gap-2 text-sm">
                        {isSubmitting ? <><Loader className="animate-spin" size={18}/> Finalizando...</> : 'Confirmar Finalização'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// 3. ObraDetailModal
const ObraDetailModal = ({ user, obra, vehicles = [], onClose, setAlertMessage, equipmentTypesForHours = [], vehicleGroups = {}, employees = [], apiClient, reloadData }) => {
    const [isSaving, setIsSaving] = useState(false);
    const [additionalTruckHours, setAdditionalTruckHours] = useState(obra?.horasAdicionaisCaminhao?.toString() || '');
    const [kmConcluidoPrancha, setKmConcluidoPrancha] = useState(obra?.kmConcluidoPrancha?.toString() || '');
    const [editedSectorsKm, setEditedSectorsKm] = useState(() =>
        (Array.isArray(obra.sectors) ? obra.sectors : [])
        .reduce((acc, s) => ({ ...acc, [s.name]: s.kmConcluido?.toString() || '' }), {})
    );
    const [updatingReadings, setUpdatingReadings] = useState({});

    const [isEditAssignmentModalOpen, setIsEditAssignmentModalOpen] = useState(false);
    const [assignmentToEdit, setAssignmentToEdit] = useState(null);
    const [isEditPastAssignmentModalOpen, setIsEditPastAssignmentModalOpen] = useState(false);
    const [pastAssignmentToEdit, setPastAssignmentToEdit] = useState(null);

    const { activeVehicles, pastVehicles } = useMemo(() => {
        const historico = Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : [];
        const active = historico.filter(h => !h.dataSaida)
            .map(h => ({ ...h, vehicleRegistroInterno: vehicles.find(v => v.id === h.veiculoId)?.registroInterno || 'N/A' }))
            .sort((a, b) => (a.vehicleRegistroInterno || '').localeCompare(b.vehicleRegistroInterno || ''));
        const past = historico.filter(h => h.dataSaida)
             .map(h => ({ ...h, vehicleRegistroInterno: vehicles.find(v => v.id === h.veiculoId)?.registroInterno || 'N/A' }))
             .sort((a, b) => new Date(b.dataSaida) - new Date(a.dataSaida));
        return { activeVehicles: active, pastVehicles: past };
    }, [obra, vehicles]);

     const progressData = useMemo(() => {
        const data = { contratado: {}, concluido: {}, totalContratado: 0, totalConcluido: 0, totalKmContratado: 0, totalKmConcluido: 0, totalHorasCaminhoes: 0, totalHorasMaquinas: 0 };
        const currentContractType = obra.contractType || 'horas';
        const historico = Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : [];

        if (currentContractType === 'horas') {
             (equipmentTypesForHours || []).forEach(type => {
                const contracted = parseFloat(obra.horasContratadasPorTipo?.[type] || 0);
                data.contratado[type] = contracted;
                data.totalContratado += contracted;
                data.concluido[type] = 0;
            });

            historico.forEach(h => {
                const vehicle = vehicles.find(v => v.id === h.veiculoId);
                if (!vehicle) return;
                const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
                if (vehicleGroup === 'Veículos Leves') return;

                let startReading = parseFloat(h.horimetroEntrada ?? h.odometroEntrada ?? 0);
                let endReading = parseFloat(h.horimetroSaida ?? h.odometroSaida ?? 0);

                if (!h.dataSaida) {
                     const updatedReadingStr = updatingReadings[h.veiculoId];
                     if (updatedReadingStr !== undefined && updatedReadingStr !== '') {
                         endReading = parseFloat(updatedReadingStr) || 0;
                     } else {
                         if (vehicleGroup === 'Máquinas Pesadas') {
                            endReading = parseFloat(vehicle.possuiHorimetroAnalogico ? vehicle.horimetroAnalogico : vehicle.horimetroDigital) || 0;
                         } else if (vehicleGroup === 'Caminhões') {
                            endReading = parseFloat(vehicle.horimetro) || 0;
                         }
                         else if (h.odometroEntrada != null) {
                              endReading = parseFloat(vehicle.odometro) || 0;
                         }
                     }
                }

                if (endReading >= startReading) {
                    const hours = endReading - startReading;
                     const equipType = (equipmentTypesForHours || []).find(t => vehicle.tipo === t);
                     if (equipType) {
                        data.concluido[equipType] = (data.concluido[equipType] || 0) + hours;
                    }
                }
            });

            const truckHours = parseFloat(additionalTruckHours || 0);
            if (data.concluido['Caminhão'] !== undefined) {
                 data.concluido['Caminhão'] += truckHours;
             } else {
                 data.concluido['Caminhão'] = truckHours;
             }

            data.totalHorasCaminhoes = data.concluido['Caminhão'] || 0;
            data.totalHorasMaquinas = Object.entries(data.concluido).reduce((sum, [type, hours]) => type !== 'Caminhão' ? sum + (hours || 0) : sum, 0);
            data.totalConcluido = data.totalHorasCaminhoes + data.totalHorasMaquinas;

        } else if (currentContractType === 'metrosQuadrados') {
             (Array.isArray(obra.sectors) ? obra.sectors : []).forEach(sector => {
                const contracted = parseFloat(sector.kmContratado || 0);
                const concluded = parseFloat(editedSectorsKm[sector.name] ?? 0);
                data.totalKmContratado += contracted;
                data.totalKmConcluido += concluded;
            });
        }
        return data;
    }, [obra, vehicles, equipmentTypesForHours, vehicleGroups, additionalTruckHours, kmConcluidoPrancha, editedSectorsKm, updatingReadings]);

    const handleReadingChange = (vehicleId, value) => setUpdatingReadings(prev => ({ ...prev, [vehicleId]: value }));
    const openEditAssignmentModal = (assignment) => { setAssignmentToEdit(assignment); setIsEditAssignmentModalOpen(true); };
    const openEditPastAssignmentModal = (assignment) => { setPastAssignmentToEdit(assignment); setIsEditPastAssignmentModalOpen(true); };
    const handleSectorKmChange = (sectorName, value) => setEditedSectorsKm(prev => ({ ...prev, [sectorName]: value }));

    const handleSaveAssignmentEdit = async (vehicleId, historyEntryId, editedData) => {
        setIsSaving(true);
        try {
            await apiClient.updateObraHistoryEntry(obra.id, historyEntryId, editedData);
            setAlertMessage("Alocação ativa atualizada com sucesso!");
            reloadData();
            setIsEditAssignmentModalOpen(false);
        } catch (error) {
            console.error("Erro ao salvar alocação ativa:", error);
            setAlertMessage(error.message || "Falha ao atualizar alocação ativa.");
            throw error;
        } finally {
            setIsSaving(false);
        }
    };

    const handleSavePastAssignmentEdit = async (vehicleId, historyEntryId, editedData) => {
        setIsSaving(true);
        try {
            await apiClient.updateObraHistoryEntry(obra.id, historyEntryId, editedData);
            setAlertMessage("Histórico atualizado com sucesso!");
            reloadData();
            setIsEditPastAssignmentModalOpen(false);
        } catch (error) {
            console.error("Erro ao salvar histórico:", error);
            setAlertMessage(error.message || "Falha ao atualizar histórico.");
            throw error;
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        let obraUpdatePayload = {};
        let vehicleUpdates = [];

        const newTruckHours = parseFloat(additionalTruckHours) || 0;
        if (newTruckHours !== (obra.horasAdicionaisCaminhao || 0)) {
            obraUpdatePayload.horasAdicionaisCaminhao = newTruckHours;
        }

        const newPranchaKm = parseFloat(kmConcluidoPrancha) || 0;
        if (newPranchaKm !== (obra.kmConcluidoPrancha || 0)) {
            obraUpdatePayload.kmConcluidoPrancha = newPranchaKm;
        }

        if (obra.contractType === 'metrosQuadrados') {
            let sectorsChanged = false;
            const currentSectors = Array.isArray(obra.sectors) ? obra.sectors : [];
            const updatedSectors = currentSectors.map(sector => {
                const currentKm = parseFloat(sector.kmConcluido || 0);
                const newKm = parseFloat(editedSectorsKm[sector.name] ?? currentKm);

                if (newKm !== currentKm) {
                    sectorsChanged = true;
                    return { ...sector, kmConcluido: newKm };
                }
                return sector;
            });
            if (sectorsChanged) {
                obraUpdatePayload.sectors = updatedSectors;
            }
        }

        Object.entries(updatingReadings).forEach(([vehicleId, newReadingStr]) => {
             if (newReadingStr !== undefined && newReadingStr !== '') {
                 const newReading = parseFloat(newReadingStr);
                 const vehicle = vehicles.find(v => v.id === vehicleId);
                 if (vehicle && !isNaN(newReading)) {
                     const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
                     const updateData = {};
                     if (vehicleGroup === 'Máquinas Pesadas') {
                         if (vehicle.possuiHorimetroAnalogico && newReading !== (parseFloat(vehicle.horimetroAnalogico) || 0)) updateData.horimetroAnalogico = newReading;
                         else if (!vehicle.possuiHorimetroAnalogico && newReading !== (parseFloat(vehicle.horimetroDigital) || 0)) updateData.horimetroDigital = newReading;
                     } else if (vehicleGroup === 'Caminhões' && newReading !== (parseFloat(vehicle.horimetro) || 0)) {
                         updateData.horimetro = newReading;
                     } else if (vehicleGroup === 'Veículos Leves' && newReading !== (parseFloat(vehicle.odometro) || 0)) {
                          updateData.odometro = newReading;
                     }

                     if (Object.keys(updateData).length > 0) {
                         vehicleUpdates.push({ id: vehicleId, data: updateData });
                     }
                 }
             }
        });

        if (Object.keys(obraUpdatePayload).length === 0 && vehicleUpdates.length === 0) {
             setAlertMessage("Nenhuma alteração para salvar.");
             setIsSaving(false);
             return;
        }

        try {
            const promises = [];
            if (Object.keys(obraUpdatePayload).length > 0) {
                promises.push(apiClient.updateObra(obra.id, obraUpdatePayload));
            }
            vehicleUpdates.forEach(update => {
                promises.push(apiClient.updateVehicle(update.id, update.data));
            });

            await Promise.all(promises);

            setAlertMessage("Alterações salvas com sucesso!");
            setUpdatingReadings({});
            reloadData();
        } catch (error) {
            console.error("Erro ao salvar alterações:", error);
            setAlertMessage(error.message || "Ocorreu um erro ao salvar as alterações.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[95vh] flex flex-col my-auto">
                <div className="p-4 sm:p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold">{obra.nome}</h2>
                        <p className="text-gray-500 text-sm">Status: <span className={`font-medium ${obra.status === 'ativa' ? 'text-green-600' : 'text-red-600'}`}>{obra.status === 'ativa' ? 'Ativa' : 'Finalizada'}</span></p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={20}/></button>
                </div>

                <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-6 text-sm">

                    <div className="bg-gray-50 p-4 rounded-lg border">
                        <h3 className="text-base font-semibold mb-3 text-gray-800">Progresso</h3>
                        <div className="space-y-3">
                             {(obra.contractType || 'horas') === 'horas' && (
                                <>
                                    <div className="flex justify-between mb-1 text-xs font-medium">
                                        <span>Progresso Total (Horas)</span>
                                        <span>{progressData.totalConcluido.toFixed(1)} / {progressData.totalContratado.toFixed(1)} hrs</span>
                                    </div>
                                    <ProgressBar value={progressData.totalConcluido} max={progressData.totalContratado} />
                                    {obra.kmContratadoPrancha > 0 && (
                                        <div className="mt-2">
                                            <div className="flex justify-between mb-1 text-[11px] font-medium text-gray-600">
                                                <span>Desloc. Prancha (Km)</span>
                                                <span>{(parseFloat(kmConcluidoPrancha) || 0).toFixed(1)} / {(obra.kmContratadoPrancha || 0).toFixed(1)} Km</span>
                                            </div>
                                            <ProgressBar value={parseFloat(kmConcluidoPrancha) || 0} max={obra.kmContratadoPrancha || 0} color="bg-blue-400" />
                                        </div>
                                    )}
                                    <div className="space-y-1 pt-3 mt-3 border-t">
                                        <h4 className="text-xs font-semibold text-gray-700">Detalhes por Equipamento:</h4>
                                         {(equipmentTypesForHours || []).map(type => {
                                            const contratado = progressData.contratado[type];
                                            const concluido = progressData.concluido[type] || 0;
                                            if (contratado > 0 || concluido > 0) {
                                                return (
                                                    <div key={type}>
                                                        <div className="flex justify-between mb-0.5 text-[11px] font-medium">
                                                            <span>{type}</span>
                                                            <span>{concluido.toFixed(1)} / {contratado.toFixed(1)} hrs</span>
                                                        </div>
                                                        <ProgressBar value={concluido} max={contratado} color="bg-blue-300" />
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })}
                                    </div>
                                </>
                            )}
                             {(obra.contractType || 'horas') === 'metrosQuadrados' && (
                                <>
                                    <div className="flex justify-between mb-1 text-xs font-medium">
                                        <span>Progresso Total (Km)</span>
                                        <span>{progressData.totalKmConcluido.toFixed(1)} / {progressData.totalKmContratado.toFixed(1)} Km</span>
                                    </div>
                                    <ProgressBar value={progressData.totalKmConcluido} max={progressData.totalKmContratado} color="bg-green-400" />
                                     {obra.kmContratadoPrancha > 0 && (
                                        <div className="mt-2">
                                            <div className="flex justify-between mb-1 text-[11px] font-medium text-gray-600">
                                                <span>Desloc. Prancha (Km)</span>
                                                <span>{(parseFloat(kmConcluidoPrancha) || 0).toFixed(1)} / {(obra.kmContratadoPrancha || 0).toFixed(1)} Km</span>
                                            </div>
                                            <ProgressBar value={parseFloat(kmConcluidoPrancha) || 0} max={obra.kmContratadoPrancha || 0} color="bg-blue-400" />
                                        </div>
                                    )}
                                    <div className="space-y-1 pt-3 mt-3 border-t">
                                        <h4 className="text-xs font-semibold text-gray-700">Progresso por Setor (Km):</h4>
                                        {(Array.isArray(obra.sectors) ? obra.sectors : []).length > 0 ? (Array.isArray(obra.sectors) ? obra.sectors : []).map(sector => {
                                            const contracted = parseFloat(sector.kmContratado || 0);
                                            const concluded = parseFloat(editedSectorsKm[sector.name] ?? 0);
                                            return (
                                                <div key={sector.name}>
                                                    <div className="flex justify-between mb-0.5 text-[11px] font-medium">
                                                        <span>{sector.name}</span>
                                                        <span>{concluded.toFixed(1)} / {contracted.toFixed(1)} Km</span>
                                                    </div>
                                                    <ProgressBar value={concluded} max={contracted} color="bg-green-300" />
                                                </div>
                                            );
                                        }) : <p className="text-[11px] text-gray-500 italic">Nenhum setor definido.</p>}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <ProtectedComponent requiredPermission="editor">
                         <div className="p-4 border rounded-lg space-y-3 bg-gray-50">
                            <h3 className="text-base font-semibold text-gray-800">Atualizações Manuais</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {(obra.contractType || 'horas') === 'horas' && (
                                    <>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700">Horas Adicionais Caminhão</label>
                                            <input type="number" step="0.1" value={additionalTruckHours} onChange={(e) => setAdditionalTruckHours(e.target.value)} className="w-full p-1.5 border rounded mt-1 text-sm" placeholder="Ex: 50.5" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700">Km Concluído Caminhão Prancha</label>
                                            <input type="number" step="0.1" value={kmConcluidoPrancha} onChange={(e) => setKmConcluidoPrancha(e.target.value)} className="w-full p-1.5 border rounded mt-1 text-sm" placeholder="Ex: 120" />
                                        </div>
                                    </>
                                )}
                                {(obra.contractType || 'horas') === 'metrosQuadrados' && (Array.isArray(obra.sectors) ? obra.sectors : []).length > 0 && (
                                    <div className="col-span-full space-y-2">
                                        <h4 className="text-xs font-medium text-gray-700">Atualizar Km Concluído por Setor:</h4>
                                        {(Array.isArray(obra.sectors) ? obra.sectors : []).map((sector) => (
                                            <div key={sector.name} className="flex items-center gap-2">
                                                <label className="block text-xs font-medium text-gray-700 w-1/2 sm:w-1/3">{sector.name} (Km)</label>
                                                <input type="number" step="0.1" value={editedSectorsKm[sector.name]} onChange={(e) => handleSectorKmChange(sector.name, e.target.value)} className="flex-1 p-1.5 border rounded text-sm" placeholder={sector.kmConcluido?.toString() || '0'}/>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                         </div>
                    </ProtectedComponent>

                    <div>
                        <h3 className="text-base font-semibold mb-2 text-gray-800">Veículos Ativos na Obra</h3>
                         <div className="space-y-2">
                            {activeVehicles.length > 0 ? activeVehicles.map(h => {
                                const vehicle = vehicles.find(v => v.id === h.veiculoId);
                                if (!vehicle) return <div key={h.veiculoId || h.dataEntrada} className="p-2 bg-red-50 text-red-700 text-xs rounded">Veículo ID {h.veiculoId} não encontrado.</div>;

                                const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
                                let currentReading = 0;
                                let readingLabel = '';
                                if (vehicleGroup === 'Máquinas Pesadas') {
                                    currentReading = parseFloat(vehicle.possuiHorimetroAnalogico ? vehicle.horimetroAnalogico : vehicle.horimetroDigital) || 0;
                                    readingLabel = 'Horímetro';
                                } else if (vehicleGroup === 'Caminhões') {
                                    currentReading = parseFloat(vehicle.horimetro) || 0;
                                    readingLabel = 'Horímetro';
                                } else { 
                                    currentReading = parseFloat(vehicle.odometro) || 0;
                                    readingLabel = 'Odômetro';
                                }

                                const initialReading = parseFloat(h.horimetroEntrada ?? h.odometroEntrada ?? 0);
                                const readingInState = updatingReadings[h.veiculoId];
                                const readingToCalculate = (readingInState !== undefined && readingInState !== '') ? (parseFloat(readingInState) || 0) : currentReading;
                                const partialReading = (readingToCalculate >= initialReading) ? (readingToCalculate - initialReading) : 0;
                                const readingUnit = (vehicleGroup === 'Veículos Leves') ? 'Km' : 'hrs';

                                return (
                                    <div key={h.veiculoId} className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-x-4 gap-y-1 items-center">
                                            <div className="font-semibold sm:col-span-1">
                                                <p>{vehicle.registroInterno} - {vehicle.modelo}</p>
                                                <p className="text-[11px] text-gray-600 font-normal">{vehicle.tipo}</p>
                                            </div>
                                            <div className="sm:col-span-1">
                                                <p><strong>Início:</strong> {h.dataEntrada ? new Date(h.dataEntrada).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</p>
                                                <p><strong>Leitura Inicial:</strong> {initialReading.toFixed(1) || 'N/A'}</p>
                                                <p><strong>Operador:</strong> {h.employeeName || 'N/A'}</p>
                                            </div>
                                             <ProtectedComponent requiredPermission="editor">
                                                <div className="flex items-center gap-1 sm:col-span-1">
                                                    <label className="text-[11px] font-medium text-gray-700 shrink-0">{readingLabel} Atual:</label>
                                                    <input type="number" step="0.1" placeholder={`${currentReading.toFixed(1)}`} value={updatingReadings[h.veiculoId] ?? ''} onChange={(e) => handleReadingChange(h.veiculoId, e.target.value)} className="flex-1 p-1 border rounded text-xs w-20"/>
                                                </div>
                                             </ProtectedComponent>
                                            <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-1 sm:col-span-1">
                                                <div className="text-right font-semibold text-blue-700 text-sm whitespace-nowrap">
                                                    Parcial: {partialReading.toFixed(1)} {readingUnit}
                                                </div>
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => openEditAssignmentModal(h)} className="p-1 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-full" title="Editar Alocação"><Edit size={12} /></button>
                                                </ProtectedComponent>
                                            </div>
                                        </div>
                                    </div>
                                )
                            }) : <p className="text-xs text-gray-500 italic">Nenhum veículo ativo nesta obra.</p>}
                         </div>
                        <ProtectedComponent requiredPermission="editor">
                             {(Object.keys(updatingReadings).length > 0 || additionalTruckHours !== (obra.horasAdicionaisCaminhao?.toString() || '') || kmConcluidoPrancha !== (obra.kmConcluidoPrancha?.toString() || '') || (obra.contractType === 'metrosQuadrados' && (Array.isArray(obra.sectors) ? obra.sectors : []).some(s => editedSectorsKm[s.name] !== (s.kmConcluido?.toString() || '')))) && (
                                <button onClick={handleSaveChanges} disabled={isSaving} className="mt-4 w-full px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-green-400 flex items-center justify-center gap-2 text-sm">
                                     {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar Alterações'}
                                </button>
                            )}
                        </ProtectedComponent>
                    </div>

                    <div>
                        <h3 className="text-base font-semibold mb-2 text-gray-800">Histórico de Veículos na Obra</h3>
                        <div className="space-y-1 max-h-60 overflow-y-auto pr-1 custom-scrollbar border rounded-md p-2 bg-gray-50">
                            {pastVehicles.length > 0 ? pastVehicles.map(h => {
                                const vehicle = vehicles.find(v => v.id === h.veiculoId);
                                const isHourBased = vehicleGroups['Máquinas Pesadas']?.includes(vehicle?.tipo) || vehicleGroups['Caminhões']?.includes(vehicle?.tipo);
                                const initialReading = parseFloat(h.horimetroEntrada ?? h.odometroEntrada ?? 0);
                                const finalReading = parseFloat(h.horimetroSaida ?? h.odometroSaida ?? 0);
                                const totalReading = (finalReading >= initialReading) ? (finalReading - initialReading) : 0;
                                const readingLabel = isHourBased ? 'Horas' : 'Km';
                                return (
                                    <div key={h.id} className="p-2 bg-white rounded border text-xs">
                                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-x-2 gap-y-0.5 items-center">
                                            <div className="font-semibold sm:col-span-1">{h.registroInterno} <span className="text-gray-500 font-normal">({vehicle?.modelo})</span></div>
                                            <div className="sm:col-span-1">Início: {h.dataEntrada ? new Date(h.dataEntrada).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</div>
                                            <div className="sm:col-span-1">Fim: {h.dataSaida ? new Date(h.dataSaida).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</div>
                                            <div className="sm:col-span-1">Total: <span className="font-bold">{totalReading.toFixed(1)} {readingLabel}</span> <span className="text-gray-500">({initialReading.toFixed(1)} - {finalReading.toFixed(1)})</span></div>
                                            <div className="flex justify-end items-center sm:col-span-1 gap-1">
                                                 <span className="text-gray-600 truncate" title={h.employeeName || 'Sem operador'}>Op: {h.employeeName || 'N/A'}</span>
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => openEditPastAssignmentModal(h)} className="p-1 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-full" title="Editar Histórico"><Edit size={12} /></button>
                                                </ProtectedComponent>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }) : <p className="text-xs text-gray-500 italic text-center py-2">Nenhum veículo anterior nesta obra.</p>}
                        </div>
                    </div>

                </div>

                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Fechar</button>
                </div>
            </div>

            {isEditAssignmentModalOpen && assignmentToEdit && (
                <EditActiveVehicleAssignmentModal
                    assignment={assignmentToEdit}
                    vehicle={vehicles.find(v => v.id === assignmentToEdit.veiculoId)}
                    employees={employees}
                    onClose={() => setIsEditAssignmentModalOpen(false)}
                    onSave={handleSaveAssignmentEdit}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    reloadData={reloadData}
                    obraId={obra.id}
                />
            )}
            {isEditPastAssignmentModalOpen && pastAssignmentToEdit && (
                <EditPastVehicleAssignmentModal
                    assignment={pastAssignmentToEdit}
                    vehicle={vehicles.find(v => v.id === pastAssignmentToEdit.veiculoId)}
                    employees={employees}
                    onClose={() => setIsEditPastAssignmentModalOpen(false)}
                    onSave={handleSavePastAssignmentEdit}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    reloadData={reloadData}
                    obraId={obra.id}
                />
            )}
        </div>
    );
};

// 4. EditActiveVehicleAssignmentModal
const EditActiveVehicleAssignmentModal = ({ assignment, vehicle, employees = [], onClose, onSave, apiClient, setAlertMessage, reloadData, obraId }) => {
    const [editedData, setEditedData] = useState({
        dataEntrada: assignment?.dataEntrada ? new Date(assignment.dataEntrada).toISOString().split('T')[0] : '',
        employeeId: assignment?.employeeId || '',
        leituraEntrada: assignment?.horimetroEntrada ?? assignment?.odometroEntrada ?? '',
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEditedData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async () => {
        const leitura = parseFloat(editedData.leituraEntrada);
        if (!editedData.dataEntrada || !editedData.employeeId || isNaN(leitura)) {
             setAlertMessage("Preencha Data, Operador e Leitura Inicial válidos.");
             return;
        }

        setIsSaving(true);
        try {
            await onSave(vehicle.id, assignment.id, editedData);
            onClose();
        } catch (error) {
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                 <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Editar Alocação Ativa</h2>
                     <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                 </div>
                 <div className="p-6 space-y-4">
                    <p className="text-sm font-medium text-gray-700">{vehicle?.registroInterno} - {vehicle?.modelo}</p>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Início na obra *</label>
                        <input type="date" name="dataEntrada" value={editedData.dataEntrada} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm" required />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Operador *</label>
                        <select name="employeeId" value={editedData.employeeId} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm bg-white" required>
                             <option value="">Selecione...</option>
                             {(employees || []).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.nome}</option>
                             ))}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Leitura Inicial (Horímetro/Odômetro) *</label>
                        <input type="number" step="0.1" name="leituraEntrada" value={editedData.leituraEntrada} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm" required/>
                    </div>
                 </div>
                 <div className="p-4 bg-gray-50 border-t flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Cancelar</button>
                    <button onClick={handleSubmit} disabled={isSaving} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-green-400 flex items-center justify-center gap-2 text-sm">
                        {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// 5. EditPastVehicleAssignmentModal
const EditPastVehicleAssignmentModal = ({ assignment, vehicle, employees = [], onClose, onSave, apiClient, setAlertMessage, reloadData, obraId }) => {
    const [editedData, setEditedData] = useState({
        dataEntrada: assignment?.dataEntrada ? new Date(assignment.dataEntrada).toISOString().split('T')[0] : '',
        dataSaida: assignment?.dataSaida ? new Date(assignment.dataSaida).toISOString().split('T')[0] : '',
        employeeId: assignment?.employeeId || '',
        leituraEntrada: assignment?.horimetroEntrada ?? assignment?.odometroEntrada ?? '',
        leituraSaida: assignment?.horimetroSaida ?? assignment?.odometroSaida ?? '',
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEditedData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async () => {
        const leituraEnt = parseFloat(editedData.leituraEntrada);
        const leituraSai = parseFloat(editedData.leituraSaida);

        if (!editedData.dataEntrada || !editedData.dataSaida || isNaN(leituraEnt) || isNaN(leituraSai)) {
            setAlertMessage("Preencha todas as datas e leituras válidas.");
            return;
        }
        if (leituraSai < leituraEnt) {
             setAlertMessage("Leitura final não pode ser menor que a inicial.");
             return;
        }
        if (new Date(editedData.dataSaida) < new Date(editedData.dataEntrada)) {
             setAlertMessage("Data final não pode ser anterior à data inicial.");
             return;
        }

        setIsSaving(true);
        try {
            await onSave(vehicle.id, assignment.id, editedData);
            onClose();
        } catch (error) {
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                 <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Editar Histórico do Veículo</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                 </div>
                 <div className="p-6 space-y-4">
                    <p className="text-sm font-medium text-gray-700">{vehicle?.registroInterno} - {vehicle?.modelo}</p>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Início na obra *</label>
                            <input type="date" name="dataEntrada" value={editedData.dataEntrada} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm" required/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Fim na obra *</label>
                            <input type="date" name="dataSaida" value={editedData.dataSaida} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm" required/>
                        </div>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Operador</label>
                         <select name="employeeId" value={editedData.employeeId} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm bg-white">
                             <option value="">Selecione...</option>
                             {(employees || []).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.nome}</option>
                             ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Leitura Inicial *</label>
                            <input type="number" step="0.1" name="leituraEntrada" value={editedData.leituraEntrada} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm" required/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Leitura Final *</label>
                            <input type="number" step="0.1" name="leituraSaida" value={editedData.leituraSaida} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm" required/>
                        </div>
                    </div>
                 </div>
                 <div className="p-4 bg-gray-50 border-t flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Cancelar</button>
                    <button onClick={handleSubmit} disabled={isSaving} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-green-400 flex items-center justify-center gap-2 text-sm">
                        {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// 6. ProgressBar
const ProgressBar = ({ value, max, color = 'bg-yellow-400' }) => {
    const percentage = max > 0 ? (value / max) * 100 : 0;
    const displayValue = isFinite(value) ? value.toFixed(1) : '0.0';
    const displayMax = isFinite(max) ? max.toFixed(1) : '0.0';
    const displayPercentage = isFinite(percentage) ? percentage.toFixed(0) : '0';

    return (
         <div className="w-full bg-gray-200 rounded-full h-6 relative overflow-hidden my-1">
            <div
                className={`h-full ${color} rounded-full flex items-center justify-start px-2 transition-all duration-500`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
            >
            </div>
            <div className="absolute inset-0 flex items-center justify-between px-2 text-xs font-bold text-gray-900">
                <span className={percentage > 10 ? 'opacity-100' : 'opacity-0'}>{displayValue}</span>
                <span className="absolute left-1/2 -translate-x-1/2">{displayPercentage}%</span>
                <span className={percentage < 90 ? 'opacity-100' : 'opacity-0'}>{displayMax}</span>
            </div>
        </div>
    );
};

export default ObrasPage;