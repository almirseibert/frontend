import React, { useState, useMemo } from 'react';
import apiClient from '../services/apiClient'; // Importa o apiClient
import {
    PlusCircle,
    Download,
    Edit,
    Trash2,
    RefreshCw,
    X,
    Loader, // Importa o ícone de Loader
    MapPin // Importa o ícone de Mapa
} from 'lucide-react';

// Importa o componente de proteção
import ProtectedComponent from '../components/ProtectedComponent'; // Ajuste o caminho se necessário

// --- Página de Obras ---
const ObrasPage = ({
    user,
    vehicles = [],
    obras = [],
    PasswordConfirmationModal,
    ConfirmationModal,
    setAlertMessage,
    equipmentTypesForHours = [],
    initialFilter,
    vehicleGroups = {},
    employees = [],
    apiClient,
    reloadData,
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [editingObra, setEditingObra] = useState(null);
    const [detailedObra, setDetailedObra] = useState(null);
    const [filter, setFilter] = useState(initialFilter || 'ativas');
    const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
    const [obraToFinish, setObraToFinish] = useState(null);

    const openModal = (o = null) => { setEditingObra(o); setIsModalOpen(true); };
    const openDetailModal = (o) => { setDetailedObra(o); setIsDetailModalOpen(true); };
    const openDeleteModal = (id) => { setItemToDelete({ id }); setIsDeleteModalOpen(true); };
    const openFinishModal = (obra) => { setObraToFinish(obra); setIsFinishModalOpen(true); };

    // Função de exclusão (usa apiClient)
    const handleDelete = async () => {
        if (!itemToDelete) return;

        try {
            await apiClient.deleteObra(itemToDelete.id);
            setAlertMessage("Obra excluída com sucesso!");
            reloadData(); // Recarrega os dados globalmente
        } catch (error) {
            console.error("Erro ao excluir obra:", error);
            setAlertMessage(error.message || "Falha ao excluir a obra. Verifique se não há veículos alocados.");
        } finally {
            setItemToDelete(null);
            setIsDeleteModalOpen(false);
        }
    };

    // Filtra e ordena as obras
    const filteredObras = useMemo(() => (obras || [])
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
        .filter(o => filter === 'finalizadas' ? o.status === 'finalizada' : o.status !== 'finalizada'),
    [obras, filter]);

    // Cálculo de progresso
    const calculateProgress = useMemo(() => {
        const progressData = {};
        (obras || []).forEach(obra => {
            let totalHours = 0;
            let totalKm = 0;
            const currentContractType = obra.contractType || 'horas';
            const historico = Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : [];

            if (currentContractType === 'horas') {
                historico.forEach(h => {
                    const vehicle = vehicles.find(v => v.id === h.veiculoId);
                    if (!vehicle) return;
                    const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
                    if (vehicleGroup === 'Veículos Leves') return;

                    let startReading = h.horimetroEntrada ?? h.odometroEntrada ?? 0;
                    let endReading = h.horimetroSaida ?? h.odometroSaida;

                    if (!h.dataSaida) {
                         if (vehicleGroup === 'Máquinas Pesadas') {
                            endReading = vehicle.possuiHorimetroAnalogico ? vehicle.horimetroAnalogico : vehicle.horimetroDigital;
                         } else if (vehicleGroup === 'Caminhões') {
                            endReading = vehicle.horimetro;
                         }
                         else if (h.odometroEntrada != null) {
                             endReading = vehicle.odometro;
                         }
                    }

                    startReading = parseFloat(startReading) || 0;
                    endReading = parseFloat(endReading) || 0;

                    if (endReading >= startReading) {
                        totalHours += endReading - startReading;
                    }
                });
                totalHours += parseFloat(obra.horasAdicionaisCaminhao || 0);
                progressData[obra.id] = totalHours.toFixed(1);

            } else if (currentContractType === 'metrosQuadrados') {
                 (Array.isArray(obra.sectors) ? obra.sectors : []).forEach(sector => {
                    totalKm += parseFloat(sector.kmConcluido || 0);
                });
                progressData[obra.id] = totalKm.toFixed(1);
            }
        });
        return progressData;
    }, [obras, vehicles, vehicleGroups]);

    // Reativar obra
    const handleReactivateObra = async (obra) => {
        try {
            await apiClient.updateObra(obra.id, { status: 'ativa' });
            setAlertMessage("Obra reativada com sucesso!");
            reloadData();
        } catch (error) {
            console.error("Erro ao reativar obra:", error);
            setAlertMessage(error.message || "Falha ao reativar a obra.");
        }
    };

    // Exportação CSV
    const exportToCSV = () => {
        if (!filteredObras || filteredObras.length === 0) {
             setAlertMessage("Nenhuma obra para exportar.");
             return;
         }
        const headers = ['Nome', 'Status', 'Data Início', 'Data Fim', 'Tipo de Contrato', 'Horas Contratadas', 'Horas Totais', 'Km Prancha Contratado', 'Km Prancha Concluído', 'Setores', 'Latitude', 'Longitude'];
        const rows = filteredObras.map(o => {
            const contractedHours = Object.values(o.horasContratadasPorTipo || {}).reduce((sum, h) => sum + (parseFloat(h) || 0), 0);
            const sectorsData = (Array.isArray(o.sectors) ? o.sectors : [])
                .map(s => `${s.name}: ${s.kmContratado || 0} Km (Concluído: ${s.kmConcluido || 0} Km)`)
                .join('; ');
            const progress = calculateProgress[o.id] || '0.0';
            const unit = o.contractType === 'metrosQuadrados' ? ' Km' : ' hrs';

            return [
                o.nome,
                o.status,
                o.dataInicio ? new Date(o.dataInicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A',
                o.dataFim ? new Date(o.dataFim).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A',
                o.contractType === 'horas' ? 'Horas Trabalhadas' : 'Metros Quadrados',
                contractedHours.toFixed(1),
                progress + unit,
                o.kmContratadoPrancha || 0,
                o.kmConcluidoPrancha || 0,
                sectorsData,
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
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            {/* Cabeçalho e botões */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Gerenciamento de Obras</h1>
                <ProtectedComponent requiredPermission="editor">
                    <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
                        <button onClick={exportToCSV} className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow hover:bg-blue-600 transition text-sm"><Download size={18} />Exportar CSV</button>
                        <button onClick={() => openModal()} className="flex items-center gap-2 px-3 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg shadow hover:bg-yellow-500 transition text-sm"><PlusCircle size={18} />Adicionar Obra</button>
                    </div>
                </ProtectedComponent>
            </div>
            {/* Abas de filtro */}
            <div className="mb-6 flex border-b border-gray-300">
                <button onClick={() => setFilter('ativas')} className={`py-2 px-4 font-semibold text-sm sm:text-base ${filter === 'ativas' ? 'border-b-2 border-yellow-500 text-yellow-600' : 'text-gray-500 hover:text-gray-700'}`}>Obras Ativas</button>
                <button onClick={() => setFilter('finalizadas')} className={`py-2 px-4 font-semibold text-sm sm:text-base ${filter === 'finalizadas' ? 'border-b-2 border-yellow-500 text-yellow-600' : 'text-gray-500 hover:text-gray-700'}`}>Obras Finalizadas</button>
            </div>
            {/* Lista de Obras */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                {filteredObras.map(obra => {
                    const totalContratadoHoras = Object.values(obra.horasContratadasPorTipo || {}).reduce((s, h) => s + (parseFloat(h) || 0), 0);
                    const totalContratadoKm = (Array.isArray(obra.sectors) ? obra.sectors : []).reduce((sum, s) => sum + (parseFloat(s.kmContratado) || 0), 0);
                    const progressValue = calculateProgress[obra.id] || '0.0';
                    const unitLabel = obra.contractType === 'metrosQuadrados' ? 'Km' : 'hrs';

                    return (
                        <div key={obra.id} className="grid grid-cols-1 md:grid-cols-5 gap-y-2 gap-x-4 items-center p-3 md:p-4 border-b last:border-b-0 hover:bg-gray-50 text-sm">
                            {/* Nome da Obra */}
                            <div className="md:col-span-2">
                                <div className="font-bold text-gray-800 text-base">{obra.nome}</div>
                                {obra.latitude && obra.longitude && (
                                    <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                                        <MapPin size={10} />
                                        <span>Localização definida</span>
                                    </div>
                                )}
                            </div>
                            {/* Progresso */}
                            {obra.contractType === 'horas' ? (
                                <>
                                    <div className="text-gray-600"><strong>Contratadas:</strong> {totalContratadoHoras.toFixed(1) || 'N/A'} hrs</div>
                                    <div className="text-gray-600"><strong>Executadas:</strong> {progressValue} {unitLabel}</div>
                                </>
                            ) : (
                                <>
                                    <div className="text-gray-600"><strong>Contratados:</strong> {totalContratadoKm.toFixed(1) || 'N/A'} Km</div>
                                    <div className="text-gray-600"><strong>Concluídos:</strong> {progressValue} {unitLabel}</div>
                                </>
                            )}
                            {/* Botões de Ação */}
                            <div className="flex gap-1 justify-start md:justify-end flex-wrap mt-2 md:mt-0">
                                <button onClick={() => openDetailModal(obra)} className="text-xs py-1.5 px-3 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Detalhes</button>
                                <ProtectedComponent requiredPermission="editor">
                                    {obra.status !== 'finalizada' ? (
                                        <button onClick={() => openFinishModal(obra)} className="text-xs py-1.5 px-3 bg-green-500 text-white rounded-md hover:bg-green-600">Finalizar</button>
                                    ) : (
                                        <button onClick={() => handleReactivateObra(obra)} className="flex items-center justify-center gap-1 text-xs py-1.5 px-3 bg-yellow-400 text-gray-900 rounded-md hover:bg-yellow-500"><RefreshCw size={12}/>Reativar</button>
                                    )}
                                    <button onClick={() => openModal(obra)} title="Editar" className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-full"><Edit size={14}/></button>
                                </ProtectedComponent>
                                <ProtectedComponent requiredPermission="admin">
                                    <button onClick={() => openDeleteModal(obra.id)} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-full"><Trash2 size={14}/></button>
                                </ProtectedComponent>
                            </div>
                        </div>
                    );
                })}
                 {/* Mensagem se não houver obras */}
                 {filteredObras.length === 0 && (
                    <p className="p-6 text-center text-gray-500 italic">Nenhuma obra encontrada para este filtro.</p>
                 )}
            </div>
            {/* Modais */}
            {isModalOpen && <ObraModal user={user} obra={editingObra} onClose={() => setIsModalOpen(false)} equipmentTypesForHours={equipmentTypesForHours} apiClient={apiClient} reloadData={reloadData} setAlertMessage={setAlertMessage} />}
            {isDetailModalOpen && <ObraDetailModal user={user} obra={detailedObra} vehicles={vehicles} onClose={() => setIsDetailModalOpen(false)} setAlertMessage={setAlertMessage} equipmentTypesForHours={equipmentTypesForHours} vehicleGroups={vehicleGroups} employees={employees} apiClient={apiClient} reloadData={reloadData} />}
            {isFinishModalOpen && <FinishObraModal obra={obraToFinish} onClose={() => setIsFinishModalOpen(false)} apiClient={apiClient} reloadData={reloadData} setAlertMessage={setAlertMessage} />}
            {isDeleteModalOpen && itemToDelete && <PasswordConfirmationModal message="Confirme sua senha para excluir esta obra. Certifique-se de que não há veículos alocados." onConfirm={handleDelete} onClose={() => setIsDeleteModalOpen(false)} apiClient={apiClient} />}
        </div>
    );
};

// --- Modal de Criação/Edição de Obra (usa apiClient) ---
const ObraModal = ({ user, obra, onClose, equipmentTypesForHours, apiClient, reloadData, setAlertMessage }) => {
    // Estado inicial
    const [nome, setNome] = useState(obra?.nome || '');
    const [dataInicio, setDataInicio] = useState(obra?.dataInicio ? new Date(obra.dataInicio).toISOString().split('T')[0] : '');
    const [dataFim, setDataFim] = useState(obra?.dataFim ? new Date(obra.dataFim).toISOString().split('T')[0] : '');
    const [contractType, setContractType] = useState(obra?.contractType || 'horas');
    
    // --- NOVOS CAMPOS DE LOCALIZAÇÃO ---
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
            // --- INCLUINDO LATITUDE E LONGITUDE ---
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
                {/* Cabeçalho */}
                <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                    <h2 className="text-xl sm:text-2xl font-bold">{obra ? 'Editar Obra' : 'Adicionar Obra'}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                </div>
                {/* Formulário com scroll */}
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4 text-sm">
                        {/* Campos do formulário */}
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

                        {/* --- SEÇÃO DE LOCALIZAÇÃO --- */}
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
                            <p className="text-[10px] text-gray-500 mt-1">
                                Dica: Copie as coordenadas diretamente do Google Maps.
                            </p>
                        </div>

                        <div>
                            <label className="block font-medium text-gray-700 mt-4">Tipo de Contrato</label>
                            <select name="contractType" value={contractType} onChange={(e) => setContractType(e.target.value)} className="w-full p-2 border rounded mt-1 bg-white">
                                <option value="horas">Horas Trabalhadas</option>
                                <option value="metrosQuadrados">Metros Quadrados</option>
                            </select>
                        </div>

                        {/* Campos condicionais */}
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
                                            {/* Campo Km Concluído */}
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
                    {/* Rodapé */}
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

// --- Componente ProgressBar (sem mudanças) ---
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
                 {/* Mostra valor/max apenas se houver espaço */}
                <span className={percentage > 10 ? 'opacity-100' : 'opacity-0'}>{displayValue}</span>
                 {/* Centraliza a porcentagem */}
                <span className="absolute left-1/2 -translate-x-1/2">{displayPercentage}%</span>
                <span className={percentage < 90 ? 'opacity-100' : 'opacity-0'}>{displayMax}</span>
            </div>
        </div>
    );
};


// --- Modal de Finalização de Obra (usa apiClient) ---
const FinishObraModal = ({ obra, onClose, apiClient, reloadData, setAlertMessage }) => {
    // Inicializa dataFim com a data atual ou dataFim existente
    const [dataFim, setDataFim] = useState(obra?.dataFim ? new Date(obra.dataFim).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            // Chama a rota específica para finalizar obra (ou update genérico)
            await apiClient.finishObra(obra.id, { dataFim });
            // Ou: await apiClient.updateObra(obra.id, { status: 'finalizada', dataFim });
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
                {/* Cabeçalho */}
                <div className="p-6 border-b flex justify-between items-center">
                    <h3 className="text-xl font-bold">Finalizar Obra</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200" disabled={isSubmitting}><X size={20}/></button>
                </div>
                {/* Conteúdo */}
                <div className="p-6">
                    <p className="text-gray-600 mb-4 text-sm">Tem certeza de que deseja finalizar a obra "{obra.nome}"?</p>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700">Data de Finalização *</label>
                        <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full p-2 border rounded mt-1 text-sm" required/>
                    </div>
                </div>
                {/* Rodapé */}
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

// --- Modal de Edição de Alocação Ativa (usa apiClient via onSave) ---
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

    // Submissão (chama onSave passado como prop)
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
           // O erro já é tratado em onSave
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                 {/* Cabeçalho */}
                 <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Editar Alocação Ativa</h2>
                     <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                 </div>
                 {/* Conteúdo */}
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
                 {/* Rodapé */}
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


// --- Modal de Edição de Histórico Passado (usa apiClient via onSave) ---
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

    // Submissão (chama onSave passado como prop)
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
            // O erro já é tratado em onSave
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                 {/* Cabeçalho */}
                 <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Editar Histórico do Veículo</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                 </div>
                 {/* Conteúdo */}
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
                 {/* Rodapé */}
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


// --- Modal de Detalhes da Obra (usa apiClient para salvar edições) ---
const ObraDetailModal = ({ user, obra, vehicles = [], onClose, setAlertMessage, equipmentTypesForHours = [], vehicleGroups = {}, employees = [], apiClient, reloadData }) => {
    const [isSaving, setIsSaving] = useState(false);
    // Estados locais para campos editáveis
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

    // Handlers
    const handleReadingChange = (vehicleId, value) => setUpdatingReadings(prev => ({ ...prev, [vehicleId]: value }));
    const openEditAssignmentModal = (assignment) => { setAssignmentToEdit(assignment); setIsEditAssignmentModalOpen(true); };
    const openEditPastAssignmentModal = (assignment) => { setPastAssignmentToEdit(assignment); setIsEditPastAssignmentModalOpen(true); };
    const handleSectorKmChange = (sectorName, value) => setEditedSectorsKm(prev => ({ ...prev, [sectorName]: value }));

    // Função para salvar edição da alocação ATIVA (chama API)
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

    // Função para salvar edição do histórico PASSADO (chama API)
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


    // Função para salvar alterações gerais da obra (usa apiClient)
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
                {/* Cabeçalho */}
                <div className="p-4 sm:p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold">{obra.nome}</h2>
                        <p className="text-gray-500 text-sm">Status: <span className={`font-medium ${obra.status === 'ativa' ? 'text-green-600' : 'text-red-600'}`}>{obra.status === 'ativa' ? 'Ativa' : 'Finalizada'}</span></p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={20}/></button>
                </div>

                {/* Conteúdo Rolável */}
                <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-6 text-sm">

                    {/* Progresso */}
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

                    {/* Atualizações Manuais (se for editor) */}
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

                    {/* Veículos Ativos */}
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

                    {/* Histórico */}
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

                {/* Rodapé */}
                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Fechar</button>
                </div>
            </div>

            {/* Modais de Edição */}
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


export default ObrasPage;