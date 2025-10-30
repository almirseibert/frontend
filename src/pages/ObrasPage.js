import React, { useState, useMemo } from 'react';
import apiClient from '../services/apiClient'; // Importa o apiClient
import {
    PlusCircle,
    Download,
    Edit,
    Trash2,
    RefreshCw,
    X,
    Loader // Importa o ícone de Loader
} from 'lucide-react';

// Importa o componente de proteção
import ProtectedComponent from '../components/ProtectedComponent'; // Ajuste o caminho se necessário
// REMOVIDO: Importação direta de modais de App.js (serão passados via props)

// --- Página de Obras ---
const ObrasPage = ({
    user,
    vehicles = [], // Renomeado para 'vehicles' (plural) para consistência
    obras = [], // Adicionado valor padrão
    PasswordConfirmationModal, // Recebido via props
    ConfirmationModal, // Recebido via props (se necessário)
    setAlertMessage,
    equipmentTypesForHours = [], // Adicionado valor padrão
    initialFilter,
    vehicleGroups = {}, // Adicionado valor padrão
    employees = [], // Adicionado valor padrão
    apiClient, // Recebido via props
    reloadData, // Recebido via props
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
    const openDeleteModal = (id) => { setItemToDelete({ id }); setIsDeleteModalOpen(true); }; // Simplificado
    const openFinishModal = (obra) => { setObraToFinish(obra); setIsFinishModalOpen(true); };

    // Função de exclusão (usa apiClient)
    const handleDelete = async () => {
        if (!itemToDelete) return;

        // A verificação de veículos alocados é feita no backend
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

    // Filtra e ordena as obras (sem mudanças na lógica, apenas usa 'obras' prop)
    const filteredObras = useMemo(() => (obras || [])
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
        .filter(o => filter === 'finalizadas' ? o.status === 'finalizada' : o.status !== 'finalizada'),
    [obras, filter]);

    // Cálculo de progresso (ajustado para datas da API e estrutura)
    const calculateProgress = useMemo(() => {
        const progressData = {};
        (obras || []).forEach(obra => {
            let totalHours = 0;
            let totalKm = 0; // Usado para metrosQuadrados
            const currentContractType = obra.contractType || 'horas';

            // Garante que historicoVeiculos é um array antes de iterar
            const historico = Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : [];

            if (currentContractType === 'horas') {
                historico.forEach(h => {
                    const vehicle = vehicles.find(v => v.id === h.veiculoId);
                    if (!vehicle) return;
                    const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo)); // Usa ?.
                    if (vehicleGroup === 'Veículos Leves') return; // Ignora leves para cálculo de horas

                    // Prioriza horímetro, depois odometro (baseado nos dados do histórico)
                    let startReading = h.horimetroEntrada ?? h.odometroEntrada ?? 0;
                    let endReading = h.horimetroSaida ?? h.odometroSaida;

                    // Ajuste para pegar a leitura atual do veículo se não houver data de saída
                    if (!h.dataSaida) {
                         if (vehicleGroup === 'Máquinas Pesadas') {
                            endReading = vehicle.possuiHorimetroAnalogico ? vehicle.horimetroAnalogico : vehicle.horimetroDigital;
                         } else if (vehicleGroup === 'Caminhões') {
                            endReading = vehicle.horimetro; // Prioriza horímetro para caminhão ativo
                         }
                         // Se for tipo 'odometro' e ainda não tiver endReading (ex: leve ativo), pega do veículo
                         else if (h.odometroEntrada != null) {
                             endReading = vehicle.odometro;
                         }
                    }

                    // Garante que são números antes de subtrair
                    startReading = parseFloat(startReading) || 0;
                    endReading = parseFloat(endReading) || 0;

                    if (endReading >= startReading) {
                        totalHours += endReading - startReading;
                    }
                });
                totalHours += parseFloat(obra.horasAdicionaisCaminhao || 0);
                progressData[obra.id] = totalHours.toFixed(1);

            } else if (currentContractType === 'metrosQuadrados') {
                 // Garante que sectors é um array
                 (Array.isArray(obra.sectors) ? obra.sectors : []).forEach(sector => {
                    totalKm += parseFloat(sector.kmConcluido || 0);
                });
                // A unidade agora é adicionada na renderização
                progressData[obra.id] = totalKm.toFixed(1);
            }
        });
        return progressData;
    }, [obras, vehicles, vehicleGroups]); // Removido equipmentTypesForHours (não usado aqui)

    // Reativar obra (usa apiClient)
    const handleReactivateObra = async (obra) => {
        try {
            // A API deve definir o status como 'ativa' e limpar dataFim
            await apiClient.updateObra(obra.id, { status: 'ativa' });
            setAlertMessage("Obra reativada com sucesso!");
            reloadData();
        } catch (error) {
            console.error("Erro ao reativar obra:", error);
            setAlertMessage(error.message || "Falha ao reativar a obra.");
        }
    };

    // Exportação CSV (ajustada para datas da API)
    const exportToCSV = () => {
        if (!filteredObras || filteredObras.length === 0) {
             setAlertMessage("Nenhuma obra para exportar.");
             return;
         }
        const headers = ['Nome', 'Status', 'Data Início', 'Data Fim', 'Tipo de Contrato', 'Horas Contratadas', 'Horas Totais', 'Km Prancha Contratado', 'Km Prancha Concluído', 'Setores'];
        const rows = filteredObras.map(o => {
            const contractedHours = Object.values(o.horasContratadasPorTipo || {}).reduce((sum, h) => sum + (parseFloat(h) || 0), 0);
            const sectorsData = (Array.isArray(o.sectors) ? o.sectors : []) // Garante array
                .map(s => `${s.name}: ${s.kmContratado || 0} Km (Concluído: ${s.kmConcluido || 0} Km)`)
                .join('; '); // Usa ; como separador interno
            const progress = calculateProgress[o.id] || '0.0';
            const unit = o.contractType === 'metrosQuadrados' ? ' Km' : ' hrs';

            return [
                o.nome,
                o.status,
                o.dataInicio ? new Date(o.dataInicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A', // Formata data UTC
                o.dataFim ? new Date(o.dataFim).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A', // Formata data UTC
                o.contractType === 'horas' ? 'Horas Trabalhadas' : 'Metros Quadrados',
                contractedHours.toFixed(1), // Formata horas contratadas
                progress + unit, // Adiciona unidade ao progresso
                o.kmContratadoPrancha || 0,
                o.kmConcluidoPrancha || 0,
                sectorsData
            ];
        });
        // Cria CSV
        const csvRows = rows.map(row =>
            row.map(field => `"${String(field || '').replace(/"/g, '""')}"`).join(',') // Trata aspas e junta com vírgula
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
                            <div className="md:col-span-2 font-bold text-gray-800 text-base">{obra.nome}</div>
                            {/* Progresso (Horas ou Km) */}
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
    // Estado inicial ajustado para datas YYYY-MM-DD
    const [nome, setNome] = useState(obra?.nome || '');
    const [dataInicio, setDataInicio] = useState(obra?.dataInicio ? new Date(obra.dataInicio).toISOString().split('T')[0] : '');
    const [dataFim, setDataFim] = useState(obra?.dataFim ? new Date(obra.dataFim).toISOString().split('T')[0] : '');
    const [contractType, setContractType] = useState(obra?.contractType || 'horas');
    // Inicializa horas com base em equipmentTypesForHours
    const [horasPorTipo, setHorasPorTipo] = useState(() => {
        return (equipmentTypesForHours || []).reduce((acc, type) => {
            acc[type] = obra?.horasContratadasPorTipo?.[type]?.toString() || ''; // Garante string
            return acc;
        }, {});
    });
    const [kmContratadoPrancha, setKmContratadoPrancha] = useState(obra?.kmContratadoPrancha?.toString() || ''); // Garante string
    // Garante que sectors seja um array e inicializa kmConcluido
    const [sectors, setSectors] = useState((Array.isArray(obra?.sectors) ? obra.sectors : []).map(s => ({ ...s, kmConcluido: s.kmConcluido || 0 })) || [{ name: '', kmContratado: '', kmConcluido: 0 }]);
    const [isSaving, setIsSaving] = useState(false);

    const handleHourChange = (type, value) => setHorasPorTipo(prev => ({ ...prev, [type]: value }));
    const handleSectorChange = (index, field, value) => {
        const newSectors = [...sectors];
        newSectors[index] = { ...newSectors[index], [field]: value }; // Atualiza campo específico
        setSectors(newSectors);
    };
    const addSector = () => setSectors([...sectors, { name: '', kmContratado: '', kmConcluido: 0 }]);
    const removeSector = (index) => setSectors(sectors.filter((_, i) => i !== index));

    // Cálculos de totais (sem mudanças)
    const totalHoras = useMemo(() => Object.values(horasPorTipo).reduce((sum, h) => sum + (parseFloat(h) || 0), 0), [horasPorTipo]);
    const totalKmContratadoSetores = useMemo(() => sectors.reduce((sum, s) => sum + (parseFloat(s.kmContratado) || 0), 0), [sectors]);

    // Submissão (usa apiClient)
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!nome) {
            setAlertMessage("O nome da obra é obrigatório.");
            return;
        }
        setIsSaving(true);

        // Prepara dados para API
        let dataToSave = {
            nome,
            contractType,
            dataInicio: dataInicio || null, // Envia null se vazio
            dataFim: dataFim || null,     // Envia null se vazio
            // status é definido pelo backend baseado em dataFim ou passado explicitamente se necessário
            // ultimaAlteracao é adicionado pelo backend
        };

        if (contractType === 'horas') {
            // Converte horas para número ou 0
            const numericHorasPorTipo = Object.entries(horasPorTipo).reduce((acc, [type, val]) => {
                acc[type] = parseFloat(val) || 0;
                return acc;
            }, {});

            dataToSave = {
                ...dataToSave,
                horasContratadasPorTipo: numericHorasPorTipo,
                kmContratadoPrancha: parseFloat(kmContratadoPrancha) || 0,
                // Limpa campos do outro tipo
                sectors: [],
            };
        } else if (contractType === 'metrosQuadrados') {
             dataToSave = {
                ...dataToSave,
                sectors: sectors.map(s => ({
                    name: s.name,
                    kmContratado: parseFloat(s.kmContratado) || 0,
                    // Garante que kmConcluido seja enviado, mesmo que 0
                    kmConcluido: parseFloat(s.kmConcluido) || 0,
                })).filter(s => s.name.trim() !== ''), // Filtra setores sem nome
                 // Limpa campos do outro tipo
                horasContratadasPorTipo: {},
                kmContratadoPrancha: 0,
                // Mantém valores existentes se estiver editando
                kmConcluidoPrancha: obra?.kmConcluidoPrancha || 0,
                horasAdicionaisCaminhao: obra?.horasAdicionaisCaminhao || 0,
            };
        }

        try {
            if (obra) { // Editando
                await apiClient.updateObra(obra.id, dataToSave);
                setAlertMessage('Obra atualizada com sucesso!');
            } else { // Criando
                // Adiciona campos que só existem na criação (backend inicializa)
                // dataToSave.historicoVeiculos = []; // Backend inicializa
                // dataToSave.horasAdicionaisCaminhao = 0; // Backend inicializa
                // dataToSave.kmConcluidoPrancha = 0; // Backend inicializa
                // dataToSave.status = 'ativa'; // Backend define
                await apiClient.createObra(dataToSave);
                setAlertMessage('Obra criada com sucesso!');
            }
            reloadData(); // Recarrega os dados
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
                        <div>
                            <label className="block font-medium text-gray-700">Tipo de Contrato</label>
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
    // Estado inicial ajustado para datas e prioridade de horímetro
    const [editedData, setEditedData] = useState({
        dataEntrada: assignment?.startDate ? new Date(assignment.startDate).toISOString().split('T')[0] : '', // Usa startDate
        employeeId: assignment?.details?.employeeId || '', // Pega de details
        // Prioriza horimetro, depois odometro (ambos de details)
        leituraEntrada: assignment?.details?.horimetroEntrada ?? assignment?.details?.odometroEntrada ?? '',
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
            await onSave(vehicle.id, editedData); // Chama a função de salvar passada pelo ObraDetailModal
            // reloadData(); // reloadData é chamado dentro de onSave
            onClose(); // Fecha este modal
        } catch (error) {
           // O erro já é tratado em onSave
           // setAlertMessage(error.message || "Erro ao salvar edição."); // Pode adicionar aqui se onSave não tratar
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4"> {/* z-index maior que o modal de detalhes */}
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
    // Estado inicial ajustado para datas e leituras
    const [editedData, setEditedData] = useState({
        // Adiciona T12:00:00 para evitar problemas de fuso horário no input date
        dataEntrada: assignment?.startDate ? new Date(assignment.startDate).toISOString().split('T')[0] : '', // Usa startDate
        dataSaida: assignment?.endDate ? new Date(assignment.endDate).toISOString().split('T')[0] : '', // Usa endDate
        employeeId: assignment?.details?.employeeId || '', // Pega de details
        leituraEntrada: assignment?.details?.horimetroEntrada ?? assignment?.details?.odometroEntrada ?? '', // Prioriza horimetro
        leituraSaida: assignment?.details?.horimetroSaida ?? assignment?.details?.odometroSaida ?? '', // Prioriza horimetro
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
        // Passa a dataEntrada original (startDate) como identificador
        const originalStartDateISO = new Date(assignment.startDate).toISOString();
        try {
            await onSave(vehicle.id, originalStartDateISO, editedData); // Chama a função do ObraDetailModal
            // reloadData(); // reloadData é chamado dentro de onSave
            onClose(); // Fecha este modal
        } catch (error) {
            // O erro já é tratado em onSave
            // setAlertMessage(error.message || "Erro ao salvar histórico."); // Pode adicionar se onSave não tratar
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4"> {/* z-index maior */}
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
    const [additionalTruckHours, setAdditionalTruckHours] = useState(obra?.horasAdicionaisCaminhao?.toString() || ''); // Garante string
    const [kmConcluidoPrancha, setKmConcluidoPrancha] = useState(obra?.kmConcluidoPrancha?.toString() || ''); // Garante string
    // Estado para km concluído dos setores (chave é o nome do setor)
    const [editedSectorsKm, setEditedSectorsKm] = useState(() =>
        (Array.isArray(obra.sectors) ? obra.sectors : []) // Garante array
        .reduce((acc, s) => ({ ...acc, [s.name]: s.kmConcluido?.toString() || '' }), {}) // Garante string
    );
    // Estado para leituras atuais editáveis (chave é o ID do veículo)
    const [updatingReadings, setUpdatingReadings] = useState({});

    // Estados para modais de edição de alocação
    const [isEditAssignmentModalOpen, setIsEditAssignmentModalOpen] = useState(false);
    const [assignmentToEdit, setAssignmentToEdit] = useState(null); // Guarda a entrada do histórico a editar
    const [isEditPastAssignmentModalOpen, setIsEditPastAssignmentModalOpen] = useState(false);
    const [pastAssignmentToEdit, setPastAssignmentToEdit] = useState(null); // Guarda a entrada do histórico PASSADO

    // Separa veículos ativos/passados (sem mudanças)
    const { activeVehicles, pastVehicles } = useMemo(() => {
        const historico = Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : []; // Garante array
        const active = historico.filter(h => !h.endDate) // Usa endDate
            .map(h => ({ ...h, vehicleRegistroInterno: vehicles.find(v => v.id === h.veiculoId)?.registroInterno || 'N/A' }))
            .sort((a, b) => (a.vehicleRegistroInterno || '').localeCompare(b.vehicleRegistroInterno || ''));
        const past = historico.filter(h => h.endDate) // Usa endDate
             .map(h => ({ ...h, vehicleRegistroInterno: vehicles.find(v => v.id === h.veiculoId)?.registroInterno || 'N/A' }))
             .sort((a, b) => new Date(b.endDate) - new Date(a.endDate)); // Ordena por data de saída
        return { activeVehicles: active, pastVehicles: past };
    }, [obra, vehicles]);

    // Cálculo de progresso (usa estados locais para campos editáveis)
     const progressData = useMemo(() => {
        const data = { contratado: {}, concluido: {}, totalContratado: 0, totalConcluido: 0, totalKmContratado: 0, totalKmConcluido: 0, totalHorasCaminhoes: 0, totalHorasMaquinas: 0 };
        const currentContractType = obra.contractType || 'horas';
        const historico = Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : []; // Garante array

        if (currentContractType === 'horas') {
             // Calcula contratado
             (equipmentTypesForHours || []).forEach(type => {
                const contracted = parseFloat(obra.horasContratadasPorTipo?.[type] || 0);
                data.contratado[type] = contracted;
                data.totalContratado += contracted;
                data.concluido[type] = 0; // Inicializa concluído
            });

             // Calcula concluído
            historico.forEach(h => {
                const vehicle = vehicles.find(v => v.id === h.veiculoId);
                if (!vehicle) return;
                const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
                if (vehicleGroup === 'Veículos Leves') return;

                let startReading = parseFloat(h.details?.horimetroEntrada ?? h.details?.odometroEntrada ?? 0); // Prioriza horimetro de details
                let endReading = parseFloat(h.details?.horimetroSaida ?? h.details?.odometroSaida ?? 0); // Prioriza horimetro de details

                // Se não houver data de saída (endDate), usa a leitura atual do veículo
                if (!h.endDate) {
                     // Verifica se há leitura editada no estado local `updatingReadings`
                     const updatedReadingStr = updatingReadings[h.veiculoId];
                     if (updatedReadingStr !== undefined && updatedReadingStr !== '') {
                         endReading = parseFloat(updatedReadingStr) || 0;
                     } else { // Senão, pega do veículo
                         if (vehicleGroup === 'Máquinas Pesadas') {
                            endReading = parseFloat(vehicle.possuiHorimetroAnalogico ? vehicle.horimetroAnalogico : vehicle.horimetroDigital) || 0;
                         } else if (vehicleGroup === 'Caminhões') {
                            endReading = parseFloat(vehicle.horimetro) || 0;
                         }
                         // Se for tipo 'odometro' (ex: leve ativo), pega do veículo (embora leves sejam ignorados aqui)
                         else if (h.details?.odometroEntrada != null) {
                              endReading = parseFloat(vehicle.odometro) || 0;
                         }
                     }
                }

                if (endReading >= startReading) {
                    const hours = endReading - startReading;
                    // Encontra o tipo exato do equipamento para somar corretamente
                     const equipType = (equipmentTypesForHours || []).find(t => vehicle.tipo === t);
                     if (equipType) {
                        data.concluido[equipType] = (data.concluido[equipType] || 0) + hours;
                    }
                }
            });

            // Usa o estado local para as horas adicionais
            const truckHours = parseFloat(additionalTruckHours || 0);
            if (data.concluido['Caminhão'] !== undefined) {
                 data.concluido['Caminhão'] += truckHours;
             } else {
                 data.concluido['Caminhão'] = truckHours; // Inicializa se não houver caminhões no histórico
             }

            // Calcula totais
            data.totalHorasCaminhoes = data.concluido['Caminhão'] || 0;
            data.totalHorasMaquinas = Object.entries(data.concluido).reduce((sum, [type, hours]) => type !== 'Caminhão' ? sum + (hours || 0) : sum, 0);
            data.totalConcluido = data.totalHorasCaminhoes + data.totalHorasMaquinas;

        } else if (currentContractType === 'metrosQuadrados') {
             // Garante que sectors é um array
             (Array.isArray(obra.sectors) ? obra.sectors : []).forEach(sector => {
                const contracted = parseFloat(sector.kmContratado || 0);
                 // Usa o estado local `editedSectorsKm` para km concluído
                const concluded = parseFloat(editedSectorsKm[sector.name] ?? 0);
                data.totalKmContratado += contracted;
                data.totalKmConcluido += concluded;
            });
        }
        return data;
    }, [obra, vehicles, equipmentTypesForHours, vehicleGroups, additionalTruckHours, kmConcluidoPrancha, editedSectorsKm, updatingReadings]); // Adiciona dependências de estado local

    // Handlers (sem mudanças)
    const handleReadingChange = (vehicleId, value) => setUpdatingReadings(prev => ({ ...prev, [vehicleId]: value }));
    const openEditAssignmentModal = (assignment) => { setAssignmentToEdit(assignment); setIsEditAssignmentModalOpen(true); };
    const openEditPastAssignmentModal = (assignment) => { setPastAssignmentToEdit(assignment); setIsEditPastAssignmentModalOpen(true); };
    const handleSectorKmChange = (sectorName, value) => setEditedSectorsKm(prev => ({ ...prev, [sectorName]: value }));

    // Função para salvar edição da alocação ATIVA (chama API)
    const handleSaveAssignmentEdit = async (vehicleId, editedData) => {
        setIsSaving(true);
        try {
            // A API /obras/:obraId/historico/:vehicleId/active (exemplo) deve lidar com:
            // 1. Encontrar a entrada ativa correta no historicoVeiculos da obra.
            // 2. Atualizar startDate, employeeId, employeeName, leituraEntrada (horimetro/odometro).
            // 3. Se employeeId mudou, atualizar 'alocadoEm' do funcionário antigo e novo.
            await apiClient.updateObraActiveAssignment(obra.id, vehicleId, editedData); // Rota hipotética
            setAlertMessage("Alocação ativa atualizada com sucesso!");
            reloadData(); // Recarrega todos os dados
            setIsEditAssignmentModalOpen(false); // Fecha modal de edição
        } catch (error) {
            console.error("Erro ao salvar alocação ativa:", error);
            setAlertMessage(error.message || "Falha ao atualizar alocação ativa.");
            throw error; // Propaga erro para modal saber que falhou
        } finally {
            setIsSaving(false);
        }
    };

    // Função para salvar edição do histórico PASSADO (chama API)
    const handleSavePastAssignmentEdit = async (vehicleId, originalStartDateISO, editedData) => {
        setIsSaving(true);
        try {
            // A API /obras/:obraId/historico/:vehicleId/:startDate (exemplo) deve lidar com:
            // 1. Encontrar a entrada correta no historicoVeiculos usando vehicleId e startDate.
            // 2. Atualizar startDate, endDate, employeeId, employeeName, leituras (horimetro/odometro).
            // (Não precisa atualizar 'alocadoEm' de funcionários para histórico passado)
            await apiClient.updateObraPastAssignment(obra.id, vehicleId, originalStartDateISO, editedData); // Rota hipotética
            setAlertMessage("Histórico atualizado com sucesso!");
            reloadData(); // Recarrega todos os dados
            setIsEditPastAssignmentModalOpen(false); // Fecha modal de edição
        } catch (error) {
            console.error("Erro ao salvar histórico:", error);
            setAlertMessage(error.message || "Falha ao atualizar histórico.");
            throw error; // Propaga erro
        } finally {
            setIsSaving(false);
        }
    };


    // Função para salvar alterações gerais da obra (usa apiClient)
    const handleSaveChanges = async () => {
        setIsSaving(true);
        let obraUpdatePayload = {}; // Payload para a rota de updateObra
        let vehicleUpdates = []; // Array de payloads para updateVehicle

        // Verifica alterações nos campos editáveis da obra
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
            // Garante que sectors é um array
            const currentSectors = Array.isArray(obra.sectors) ? obra.sectors : [];
            const updatedSectors = currentSectors.map(sector => {
                 // Usa ?? para fallback seguro e parseFloat
                const currentKm = parseFloat(sector.kmConcluido || 0);
                const newKm = parseFloat(editedSectorsKm[sector.name] ?? currentKm); // Usa estado ou valor atual

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

        // Verifica alterações nas leituras dos veículos ativos
        Object.entries(updatingReadings).forEach(([vehicleId, newReadingStr]) => {
             if (newReadingStr !== undefined && newReadingStr !== '') {
                 const newReading = parseFloat(newReadingStr);
                 const vehicle = vehicles.find(v => v.id === vehicleId);
                 if (vehicle && !isNaN(newReading)) {
                     const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
                     const updateData = {};
                     // Define qual campo de leitura atualizar no veículo
                     if (vehicleGroup === 'Máquinas Pesadas') {
                         if (vehicle.possuiHorimetroAnalogico && newReading !== (parseFloat(vehicle.horimetroAnalogico) || 0)) updateData.horimetroAnalogico = newReading;
                         else if (!vehicle.possuiHorimetroAnalogico && newReading !== (parseFloat(vehicle.horimetroDigital) || 0)) updateData.horimetroDigital = newReading;
                     } else if (vehicleGroup === 'Caminhões' && newReading !== (parseFloat(vehicle.horimetro) || 0)) {
                         updateData.horimetro = newReading; // Atualiza horímetro do caminhão
                     } else if (vehicleGroup === 'Veículos Leves' && newReading !== (parseFloat(vehicle.odometro) || 0)) {
                          updateData.odometro = newReading; // Atualiza odômetro do leve
                     }

                     if (Object.keys(updateData).length > 0) {
                         vehicleUpdates.push({ id: vehicleId, data: updateData }); // Estrutura { id, data }
                     }
                 }
             }
        });

        // Verifica se há algo para salvar
        if (Object.keys(obraUpdatePayload).length === 0 && vehicleUpdates.length === 0) {
             setAlertMessage("Nenhuma alteração para salvar.");
             setIsSaving(false);
             return;
        }

        try {
            // Executa as atualizações via API
            const promises = [];
            if (Object.keys(obraUpdatePayload).length > 0) {
                promises.push(apiClient.updateObra(obra.id, obraUpdatePayload));
            }
            vehicleUpdates.forEach(update => {
                promises.push(apiClient.updateVehicle(update.id, update.data));
            });

            await Promise.all(promises);

            setAlertMessage("Alterações salvas com sucesso!");
            setUpdatingReadings({}); // Limpa leituras pendentes após salvar
            reloadData(); // Recarrega os dados
            // Manter modal aberto para ver o resultado? Ou fechar? onClose();
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
                            {/* Lógica de exibição de progresso */}
                             {(obra.contractType || 'horas') === 'horas' && (
                                <>
                                    <div className="flex justify-between mb-1 text-xs font-medium">
                                        <span>Progresso Total (Horas)</span>
                                        <span>{progressData.totalConcluido.toFixed(1)} / {progressData.totalContratado.toFixed(1)} hrs</span>
                                    </div>
                                    <ProgressBar value={progressData.totalConcluido} max={progressData.totalContratado} />
                                    {/* Progresso da Prancha */}
                                    {obra.kmContratadoPrancha > 0 && (
                                        <div className="mt-2">
                                            <div className="flex justify-between mb-1 text-[11px] font-medium text-gray-600">
                                                <span>Desloc. Prancha (Km)</span>
                                                <span>{(parseFloat(kmConcluidoPrancha) || 0).toFixed(1)} / {(obra.kmContratadoPrancha || 0).toFixed(1)} Km</span>
                                            </div>
                                            <ProgressBar value={parseFloat(kmConcluidoPrancha) || 0} max={obra.kmContratadoPrancha || 0} color="bg-blue-400" />
                                        </div>
                                    )}
                                    {/* Detalhes por Equipamento */}
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
                                     {/* Progresso da Prancha */}
                                     {obra.kmContratadoPrancha > 0 && (
                                        <div className="mt-2">
                                            <div className="flex justify-between mb-1 text-[11px] font-medium text-gray-600">
                                                <span>Desloc. Prancha (Km)</span>
                                                <span>{(parseFloat(kmConcluidoPrancha) || 0).toFixed(1)} / {(obra.kmContratadoPrancha || 0).toFixed(1)} Km</span>
                                            </div>
                                            <ProgressBar value={parseFloat(kmConcluidoPrancha) || 0} max={obra.kmContratadoPrancha || 0} color="bg-blue-400" />
                                        </div>
                                    )}
                                    {/* Progresso por Setor */}
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
                                if (!vehicle) return <div key={h.veiculoId || h.startDate} className="p-2 bg-red-50 text-red-700 text-xs rounded">Veículo ID {h.veiculoId} não encontrado.</div>;

                                const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
                                let currentReading = 0;
                                let readingLabel = '';
                                if (vehicleGroup === 'Máquinas Pesadas') {
                                    currentReading = parseFloat(vehicle.possuiHorimetroAnalogico ? vehicle.horimetroAnalogico : vehicle.horimetroDigital) || 0;
                                    readingLabel = 'Horímetro';
                                } else if (vehicleGroup === 'Caminhões') {
                                    currentReading = parseFloat(vehicle.horimetro) || 0; // Prioriza horímetro
                                    readingLabel = 'Horímetro';
                                } else { // Leves ou outros
                                    currentReading = parseFloat(vehicle.odometro) || 0;
                                    readingLabel = 'Odômetro';
                                }

                                const initialReading = parseFloat(h.details?.horimetroEntrada ?? h.details?.odometroEntrada ?? 0);
                                const readingInState = updatingReadings[h.veiculoId];
                                const readingToCalculate = (readingInState !== undefined && readingInState !== '') ? (parseFloat(readingInState) || 0) : currentReading;
                                const partialReading = (readingToCalculate >= initialReading) ? (readingToCalculate - initialReading) : 0;
                                const readingUnit = (vehicleGroup === 'Veículos Leves') ? 'Km' : 'hrs';

                                return (
                                    <div key={h.veiculoId} className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-x-4 gap-y-1 items-center">
                                            {/* Veículo */}
                                            <div className="font-semibold sm:col-span-1">
                                                <p>{vehicle.registroInterno} - {vehicle.modelo}</p>
                                                <p className="text-[11px] text-gray-600 font-normal">{vehicle.tipo}</p>
                                            </div>
                                            {/* Alocação */}
                                            <div className="sm:col-span-1">
                                                <p><strong>Início:</strong> {h.startDate ? new Date(h.startDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</p>
                                                <p><strong>Leitura Inicial:</strong> {initialReading.toFixed(1) || 'N/A'}</p>
                                                <p><strong>Operador:</strong> {h.details?.employeeName || 'N/A'}</p>
                                            </div>
                                            {/* Leitura Atual (Editável) */}
                                             <ProtectedComponent requiredPermission="editor">
                                                <div className="flex items-center gap-1 sm:col-span-1">
                                                    <label className="text-[11px] font-medium text-gray-700 shrink-0">{readingLabel} Atual:</label>
                                                    <input type="number" step="0.1" placeholder={`${currentReading.toFixed(1)}`} value={updatingReadings[h.veiculoId] ?? ''} onChange={(e) => handleReadingChange(h.veiculoId, e.target.value)} className="flex-1 p-1 border rounded text-xs w-20"/>
                                                </div>
                                             </ProtectedComponent>
                                             {/* Horas Parciais e Ações */}
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
                        {/* Botão Salvar Alterações */}
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
                                const initialReading = parseFloat(h.details?.horimetroEntrada ?? h.details?.odometroEntrada ?? 0);
                                const finalReading = parseFloat(h.details?.horimetroSaida ?? h.details?.odometroSaida ?? 0);
                                const totalReading = (finalReading >= initialReading) ? (finalReading - initialReading) : 0;
                                const readingLabel = isHourBased ? 'Horas' : 'Km';
                                return (
                                    <div key={`${h.veiculoId}-${h.startDate}`} className="p-2 bg-white rounded border text-xs">
                                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-x-2 gap-y-0.5 items-center">
                                            <div className="font-semibold sm:col-span-1">{h.vehicleRegistroInterno} <span className="text-gray-500 font-normal">({vehicle?.modelo})</span></div>
                                            <div className="sm:col-span-1">Início: {h.startDate ? new Date(h.startDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</div>
                                            <div className="sm:col-span-1">Fim: {h.endDate ? new Date(h.endDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</div>
                                            <div className="sm:col-span-1">Total: <span className="font-bold">{totalReading.toFixed(1)} {readingLabel}</span> <span className="text-gray-500">({initialReading.toFixed(1)} - {finalReading.toFixed(1)})</span></div>
                                            <div className="flex justify-end items-center sm:col-span-1 gap-1">
                                                 <span className="text-gray-600 truncate" title={h.details?.employeeName || 'Sem operador'}>Op: {h.details?.employeeName || 'N/A'}</span>
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
                    onSave={handleSaveAssignmentEdit} // Passa a função de salvar
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
                    onSave={handleSavePastAssignmentEdit} // Passa a função de salvar
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
