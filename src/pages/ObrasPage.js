import React, { useState, useMemo } from 'react';
import { 
    PlusCircle, Download, Edit, Trash2, RefreshCw, MapPin, 
    AlertTriangle, Search, CheckCircle 
} from 'lucide-react';
import ProtectedComponent from '../components/ProtectedComponent';

// Importação dos Modais
import ObraModal from '../components/modals/ObraModal'; 
import ObraDetailModal from '../components/modals/ObraDetailModal';
import ManualFinishObraModal from '../components/modals/ManualFinishObraModal';

const ObrasPage = ({
    user,
    vehicles = [],
    obras = [],
    PasswordConfirmationModal,
    setAlertMessage,
    vehicleGroups = {},
    employees = [],
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

    // --- LÓGICA DE TIPOS DE EQUIPAMENTOS ---
    const derivedEquipmentTypes = useMemo(() => {
        const types = [];

        Object.entries(vehicleGroups).forEach(([groupName, groupTypes]) => {
            const name = groupName.toLowerCase();

            // 1. Exclusões Específicas solicitadas
            // Exclui "Veículos Leves" e "Caminhões de Trecho"
            if (name.includes('veículos leves') || name.includes('veiculos leves')) return;
            if (name.includes('caminhões de trecho') || name.includes('caminhoes de trecho')) return;

            // 2. Inclusão dos demais (incluindo "Caminhões" genérico e "Máquinas Pesadas")
            if (Array.isArray(groupTypes)) {
                types.push(...groupTypes);
            }
        });

        // Remove duplicatas e ordena alfabeticamente
        return [...new Set(types)].sort();
    }, [vehicleGroups]);

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

            {/* --- MODAIS --- */}
            
            {modalState.createEdit && (
                <ObraModal 
                    user={user}
                    obra={selectedObra} 
                    onClose={() => closeModal('createEdit')} 
                    apiClient={apiClient} 
                    reloadData={reloadData} 
                    setAlertMessage={setAlertMessage}
                    equipmentTypesForHours={derivedEquipmentTypes}
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
                    equipmentTypesForHours={derivedEquipmentTypes}
                    employees={employees}
                />
            )}

            {modalState.finish && selectedObra && (
                <ManualFinishObraModal 
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

export default ObrasPage;