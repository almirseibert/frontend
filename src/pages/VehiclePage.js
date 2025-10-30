import React, { useState, useEffect, useMemo } from 'react';
import apiClient from '../services/apiClient'; // Importa apiClient
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'; // Firebase Storage removido
import {
    HardHat,
    Users,
    Wrench,
    ShieldAlert,
    Edit,
    Clock,
    Trash2,
    PlusCircle,
    Upload,
    Download,
    ChevronsUpDown,
    X,
    TrafficCone,
    CheckCircle,
    Info,
    Loader, // Adicionado Loader
    ImageOff, // Ícone para imagem faltando
    AlertTriangle // <-- ÍCONE ADICIONADO
} from 'lucide-react';

import ProtectedComponent from '../components/ProtectedComponent'; // Ajuste o caminho
// Importa modais do App.js ou de onde foram definidos
// ATENÇÃO: ConfirmationModal não é mais exportado do App.js, mas mantemos aqui caso seja usado em outro lugar.
// A lógica do App.js sugere que ele é passado como prop.
// import { PasswordConfirmationModal, ConfirmationModal } from '../App';

// --- PÁGINA DE VEÍCULOS ---
// Props atualizadas: removido Firebase/Storage, adicionado apiClient, reloadData
const VehiclePage = ({ user, vehicles = [], obras = [], revisions = [], employees = [], fines = [], navigate, setAlertMessage, initialFilter, PasswordConfirmationModal, ConfirmationModal, vehicleGroups = {}, operationalSubGroups = [], apiClient, reloadData }) => {
    // Lista de tipos de veículos (pode vir do backend no futuro)
    const vehicleTypes = useMemo(() => [...new Set(vehicles.map(v => v.tipo).filter(Boolean))].sort(), [vehicles]);

    // Estados dos Modais
    // ... (estados dos modais sem mudança) ...
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isObraAllocationModalOpen, setIsObraAllocationModalOpen] = useState(false);
    const [isOperationalModalOpen, setIsOperationalModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isFinesModalOpen, setIsFinesModalOpen] = useState(false);
    const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false); // Mantém estado único

    // Estados para dados dos Modais
    // ... (estados de dados dos modais sem mudança) ...
    const [itemToDelete, setItemToDelete] = useState(null);
    const [editingVehicle, setEditingVehicle] = useState(null);
    const [vehicleForObraAllocation, setVehicleForObraAllocation] = useState(null);
    const [vehicleForOperational, setVehicleForOperational] = useState(null);
    const [vehicleForHistory, setVehicleForHistory] = useState(null);
    const [vehicleForDetail, setVehicleForDetail] = useState(null);
    const [vehicleForFines, setVehicleForFines] = useState(null);
    const [vehicleForMaintenance, setVehicleForMaintenance] = useState(null);

    // Estados de Filtro e Ordenação
    // ... (filtros e ordenação sem mudança) ...
    const [filters, setFilters] = useState({ type: 'todos', status: 'todos', search: '', group: 'todos' });
    const [sortConfig, setSortConfig] = useState({ key: 'registroInterno', direction: 'ascending' }); // Ordena por registro por padrão

    // Aplica filtro inicial (mantido)
    useEffect(() => { if (initialFilter) { setFilters(prev => ({ ...prev, ...initialFilter })); } }, [initialFilter]);
    const handleFilterChange = (e) => { const { name, value } = e.target; setFilters(prev => ({ ...prev, [name]: value })); };

    // Veículos processados com status consistente (mantido, mas confia mais no status da API)
    // ... (processedVehicles sem mudança) ...
    const processedVehicles = useMemo(() => {
        return (vehicles || []).map(v => {
            // Prioriza o status da API, mas tem fallback
            let currentStatus = v.status;
            if (!currentStatus) { // Fallback se status estiver vazio/null
                if (v.obraAtualId) currentStatus = 'Em Obra';
                else if (v.operationalAssignment) currentStatus = 'Em Operação';
                else if (v.maintenanceLocation) currentStatus = 'Em Manutenção'; // Assumindo que maintenanceLocation indica manutenção
                else currentStatus = 'Disponível';
            }
             // Adiciona a obra ao objeto para facilitar a exibição
             const obra = v.obraAtualId ? obras.find(o => o.id === v.obraAtualId) : null;
             // Adiciona a leitura principal
             const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
             const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(v.tipo));
             let vehicleReading = 'N/A';
             if (vehicleGroup === 'Máquinas Pesadas') vehicleReading = v.horimetroDigital ?? v.horimetroAnalogico ?? v.horimetro ?? 'N/A';
             else if (vehicleGroup === 'Caminhões') vehicleReading = v.horimetro ?? v.odometro ?? 'N/A'; // Prioriza horímetro para exibição rápida
             else vehicleReading = v.odometro ?? 'N/A'; // Leves

            return { ...v, status: currentStatus, obra, vehicleReading };
        }).filter(Boolean); // Remove nulos se houver
    }, [vehicles, obras, vehicleGroups]);

    // Ordena os veículos processados
    // ... (sortedVehicles sem mudança) ...
    const sortedVehicles = useMemo(() => {
        let sortableItems = [...processedVehicles];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                const valA = a[sortConfig.key] ?? ''; // Usa ?? para fallback
                const valB = b[sortConfig.key] ?? '';
                // Ordenação numérica para leituras
                if (sortConfig.key === 'vehicleReading' || sortConfig.key === 'odometro' || sortConfig.key === 'horimetro') {
                     const numA = parseFloat(valA.toString().split(' ')[0]) || 0; // Pega só o número
                     const numB = parseFloat(valB.toString().split(' ')[0]) || 0;
                     const comparison = numA - numB;
                     return sortConfig.direction === 'ascending' ? comparison : -comparison;
                }
                // Ordenação de string para outros campos
                const comparison = String(valA).toLowerCase().localeCompare(String(valB).toLowerCase());
                return sortConfig.direction === 'ascending' ? comparison : -comparison;
            });
        }
        return sortableItems;
    }, [processedVehicles, sortConfig]);


    // Função para requisitar ordenação (mantida)
    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // Calcula status da revisão (mantido, ajustado para API data)
    // ... (getRevisionStatus sem mudança) ...
    const getRevisionStatus = (vehicle) => {
        const revision = (revisions || []).find(r => r.vehicleId === vehicle.id); // Usa vehicleId
        if (!revision) return { status: 'ok', text: '' }; // Retorna objeto

        const now = new Date();
        // Usa new Date() para converter string da API
        const proximaData = revision.proximaRevisaoData ? new Date(revision.proximaRevisaoData) : null;

        const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
        const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(vehicle.tipo));
        let currentReading = 0;
        // Usa ?? para fallback seguro
        if(vehicleGroup === 'Máquinas Pesadas') currentReading = vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro ?? 0;
        else if(vehicleGroup === 'Caminhões') currentReading = vehicle.horimetro ?? 0; // Prioriza horímetro para revisão de caminhão
        else currentReading = vehicle.odometro ?? 0;

        const proximoOdometro = revision.proximaRevisaoOdometro || 0;
        const avisoKmHr = revision.avisoAntecedenciaKmHr || 0;
        const avisoDias = revision.avisoAntecedenciaDias || 0;

        // Verifica vencidos primeiro
        if (proximoOdometro > 0 && currentReading >= proximoOdometro) return { status: 'danger', text: 'Leitura Vencida' };
        if (proximaData && now >= proximaData) return { status: 'danger', text: 'Data Vencida' };

        // Verifica próximos do vencimento
        if (proximoOdometro > 0 && avisoKmHr > 0 && currentReading >= proximoOdometro - avisoKmHr) return { status: 'warning', text: 'Leitura Próxima' };
        if (proximaData && avisoDias > 0) {
            const warningDate = new Date(proximaData);
            warningDate.setDate(warningDate.getDate() - avisoDias); // Subtrai dias
            if (now >= warningDate) return { status: 'warning', text: 'Data Próxima' };
        }

        return { status: 'ok', text: '' }; // Tudo OK
    };


    // Memoiza veículos com multas pendentes (mantido)
    // ... (vehiclesWithPendingFines sem mudança) ...
    const vehiclesWithPendingFines = useMemo(() => {
        const vehicleIds = new Set();
        (fines || []).forEach(fine => { // Garante que fines é array
            if (fine.status === 'Pendente') {
                vehicleIds.add(fine.vehicleId);
            }
        });
        return vehicleIds;
    }, [fines]);

    // Define classe da linha baseado em canCirculate e revisão (mantido)
    // ... (getVehicleRowClass sem mudança) ...
    const getVehicleRowClass = (vehicle) => {
        if (vehicle.canCirculate === false) {
            return 'bg-red-100 border-l-4 border-red-500'; // Destaque maior para não circular
        }
        const revisionInfo = getRevisionStatus(vehicle);
        const revisionStatusClasses = { ok: '', warning: 'bg-yellow-50', danger: 'bg-red-50' };
        return revisionStatusClasses[revisionInfo.status];
    };

    // Filtra os veículos ordenados (mantido)
    // ... (filteredVehicles sem mudança) ...
    const filteredVehicles = useMemo(() => sortedVehicles.filter(v => {
         // Garante que groups é um objeto
        const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
        const searchMatch = (v.placa || '').toLowerCase().includes(filters.search.toLowerCase()) ||
                            (v.registroInterno || '').toLowerCase().includes(filters.search.toLowerCase()) ||
                            (v.marca || '').toLowerCase().includes(filters.search.toLowerCase()) ||
                            (v.modelo || '').toLowerCase().includes(filters.search.toLowerCase());
        const typeMatch = filters.type === 'todos' || v.tipo === filters.type;
        const statusMatch = filters.status === 'todos' || v.status === filters.status;
        const groupMatch = filters.group === 'todos' || (groups[filters.group] && groups[filters.group].includes(v.tipo));
        return searchMatch && typeMatch && statusMatch && groupMatch;
    }), [sortedVehicles, filters, vehicleGroups]);

    // Funções para abrir modais (mantidas)
    // ... (funções openModal, etc. sem mudança) ...
    const openModal = (v = null) => { setEditingVehicle(v); setIsModalOpen(true); };
    const openObraAllocationModal = (v) => { setVehicleForObraAllocation(v); setIsObraAllocationModalOpen(true); };
    const openOperationalModal = (v) => { setVehicleForOperational(v); setIsOperationalModalOpen(true); };
    const openHistoryModal = (v) => { setVehicleForHistory(v); setIsHistoryModalOpen(true); };
    const openDeleteModal = (id) => { setItemToDelete({id}); setIsDeleteModalOpen(true); };
    const openDetailModal = (v) => { setVehicleForDetail(v); setIsDetailModalOpen(true); };
    const openFinesModal = (v) => { setVehicleForFines(v); setIsFinesModalOpen(true); };

    // Abre modal de manutenção (verifica alocação antes)
    // ... (handleMaintenanceClick sem mudança) ...
    const handleMaintenanceClick = (vehicle) => {
        if (vehicle.obraAtualId || vehicle.operationalAssignment) {
            setAlertMessage('Este veículo está alocado. Desaloque-o primeiro para enviá-lo para manutenção.');
            return;
        }
        setVehicleForMaintenance(vehicle);
        setIsMaintenanceModalOpen(true);
    };

    // Função de exclusão (adaptada para API)
    // ... (handleDelete sem mudança) ...
    const handleDelete = async () => {
        if (!itemToDelete) return;
        try {
            // Chama a API para excluir (backend deve lidar com revisões relacionadas)
            await apiClient.deleteVehicle(itemToDelete.id);
            setAlertMessage('Veículo excluído com sucesso.');
            reloadData(); // Recarrega os dados
        } catch (error) {
            console.error("Erro ao excluir veículo:", error);
            setAlertMessage(error.response?.data?.message || 'Falha ao excluir o veículo.');
        } finally {
            setItemToDelete(null);
            setIsDeleteModalOpen(false);
        }
    };

    // Upload CSV (adaptado para API, com aviso de ineficiência)
    // ... (handleFileUpload sem mudança) ...
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const text = e.target.result;
                const lines = text.split(/[\r\n]+/).filter(line => line.trim() !== ''); // Trata quebras de linha Windows/Unix
                if (lines.length < 2) {
                    setAlertMessage("Arquivo CSV vazio ou inválido (precisa de cabeçalho e pelo menos uma linha de dados).");
                    return;
                }
                // Processa cabeçalhos (remove aspas e espaços extras)
                const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                // Mapeia nomes do CSV para nomes da API (ajuste conforme necessário)
                const headerMapping = {
                    'registroInterno': 'registroInterno', // Exemplo, ajuste os nomes
                    'Placa': 'placa',
                    'Marca': 'marca',
                    'Modelo': 'modelo',
                    'Tipo': 'tipo',
                    'Odometro': 'odometro', // Nome no CSV
                    'Horimetro': 'horimetro', // Nome no CSV
                    // Adicione outros mapeamentos...
                };
                 // Pega as chaves da API que estão no mapeamento
                const apiHeaders = headers.map(h => headerMapping[h]).filter(Boolean);

                const data = lines.slice(1).map(line => {
                    // Trata valores com vírgula dentro de aspas (simplificado)
                     const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(v => v.trim().replace(/^"|"$/g, '')) || [];
                     if (values.length !== headers.length) {
                         console.warn("Linha com número incorreto de colunas:", line);
                         return null; // Ignora linhas mal formatadas
                     }
                    return headers.reduce((obj, header, index) => {
                         const apiKey = headerMapping[header]; // Pega a chave da API correspondente
                         if (apiKey) { // Só inclui se houver mapeamento
                             let value = values[index] || '';
                             // Converte números (assumindo ponto decimal)
                             if (['odometro', 'horimetro', 'horimetroDigital', 'horimetroAnalogico', 'fuelCapacity', 'consumoMedioFabricante'].includes(apiKey)) {
                                 value = parseFloat(value.replace(',', '.')) || 0;
                             }
                              // Converte booleanos (exemplo)
                              // if (['canCirculate', 'isComboioVehicle'].includes(apiKey)) {
                              //    value = value.toLowerCase() === 'true' || value === '1';
                              // }
                              // Converte datas (exemplo)
                              // if (['validadeTacografo'].includes(apiKey) && value) {
                              //     try { value = new Date(value).toISOString().split('T')[0]; } catch { value = null; }
                              // }
                             obj[apiKey] = value;
                         }
                        return obj;
                    }, {});
                }).filter(Boolean); // Remove linhas nulas (mal formatadas)

                if (data.length === 0) {
                     setAlertMessage("Nenhum dado válido encontrado no arquivo CSV.");
                     return;
                 }


                setAlertMessage(`Importando ${data.length} veículos... Isso pode levar um tempo.`);
                let successCount = 0;
                let errorCount = 0;

                // **Ineficiente:** Chama a API para cada veículo individualmente
                for (const item of data) {
                    try {
                        // Adiciona campos padrão que podem não estar no CSV
                        const payload = {
                            ...item,
                            status: 'Disponível', // Status padrão
                            // history: [], // Backend deve inicializar
                            canCirculate: item.canCirculate !== undefined ? item.canCirculate : true, // Garante valor inicial
                        };
                        await apiClient.createVehicle(payload);
                        successCount++;
                    } catch (error) {
                        console.error("Erro ao importar veículo:", item.registroInterno || item.placa, error);
                        errorCount++;
                    }
                }
                setAlertMessage(`${successCount} veículos importados com sucesso. ${errorCount} falharam.`);
                if (successCount > 0) reloadData(); // Recarrega se houve sucesso
            };
            reader.onerror = () => {
                setAlertMessage("Erro ao ler o arquivo CSV.");
            };
            reader.readAsText(file);
        }
         // Limpa o input para permitir o re-upload do mesmo arquivo
        event.target.value = null;
    };


    // Exportar CSV (mantido)
    // ... (exportToCSV sem mudança) ...
    const exportToCSV = () => {
        if (filteredVehicles.length === 0) {
             setAlertMessage("Nenhum veículo para exportar com os filtros atuais.");
             return;
         }
        // Define as colunas a serem exportadas (ajuste conforme necessário)
        const headers = ['registroInterno', 'placa', 'marca', 'modelo', 'tipo', 'odometro', 'horimetro', 'horimetroDigital', 'horimetroAnalogico', 'status', 'localizacaoAtual', 'canCirculate', 'validadeTacografo', 'validadeAET_DAER', 'validadeAET_DNIT'];
        const rows = filteredVehicles.map(v => headers.map(header => {
            let value = v[header];
            // Formata datas para YYYY-MM-DD
            if (['validadeTacografo', 'validadeAET_DAER', 'validadeAET_DNIT'].includes(header) && value) {
                 try { return new Date(value).toISOString().split('T')[0]; } catch { return ''; }
             }
             // Garante que booleanos sejam 'true'/'false'
             if (typeof value === 'boolean') {
                 return value ? 'true' : 'false';
             }
            return value ?? ''; // Usa ?? para tratar null/undefined
        }));

        // Cria o conteúdo CSV
        let csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(',') + "\n"
            + rows.map(e => e.map(i => `"${String(i).replace(/"/g, '""')}"`).join(",")).join("\n"); // Trata aspas dentro dos valores

        // Cria e clica no link de download
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "veiculos.csv");
        document.body.appendChild(link); // Necessário para Firefox
        link.click();
        document.body.removeChild(link); // Limpa o link
    };

    // ... (Renderização principal - JSX) ...
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            {/* Cabeçalho e Botões */}
            {/* ... (JSX do Cabeçalho sem mudança) ... */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Gerenciamento de Veículos</h1>
                <ProtectedComponent requiredPermission="editor">
                    <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
                        <label className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white font-semibold rounded-lg shadow hover:bg-green-600 transition cursor-pointer text-sm">
                            <Upload size={18} /> Importar CSV
                            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                        </label>
                        <button onClick={exportToCSV} className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow hover:bg-blue-600 transition text-sm"><Download size={18} />Exportar CSV</button>
                        <button onClick={() => openModal()} className="flex items-center gap-2 px-3 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg shadow hover:bg-yellow-500 transition text-sm"><PlusCircle size={18} />Adicionar Veículo</button>
                    </div>
                </ProtectedComponent>
            </div>

             {/* Filtros */}
             {/* ... (JSX dos Filtros sem mudança) ... */}
            <div className="mb-6 p-4 bg-white rounded-lg shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                <input type="text" name="search" placeholder="Buscar Placa, Registro, Marca..." value={filters.search} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg bg-gray-50 focus:ring-yellow-500" />
                 {/* Garante que vehicleGroups é um objeto */}
                <select name="group" value={filters.group} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg bg-gray-50 focus:ring-yellow-500">
                    <option value="todos">Todos os Grupos</option>
                    {(vehicleGroups && typeof vehicleGroups === 'object' ? Object.keys(vehicleGroups) : []).map(group => <option key={group} value={group}>{group}</option>)}
                    <option value="Outros">Outros</option>
                 </select>
                <select name="type" value={filters.type} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg bg-gray-50 focus:ring-yellow-500">
                    <option value="todos">Todos os Tipos</option>
                    {/* Filtra tipos únicos e válidos */}
                    {[...new Set((vehicles || []).map(v => v.tipo).filter(Boolean))].sort().map(type => <option key={type} value={type}>{type}</option>)}
                </select>
                <select name="status" value={filters.status} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg bg-gray-50 focus:ring-yellow-500">
                    <option value="todos">Todos os Status</option>
                    {/* Filtra status únicos e válidos */}
                    {[...new Set((vehicles || []).map(v => v.status).filter(Boolean))].sort().map(status => <option key={status} value={status}>{status}</option>)}
                     {/* Opções fixas caso não hajam veículos ainda */}
                     {!vehicles.some(v => v.status === 'Disponível') && <option value="Disponível">Disponível</option>}
                     {!vehicles.some(v => v.status === 'Em Obra') && <option value="Em Obra">Em Obra</option>}
                     {/* Adicione outras opções fixas se necessário */}
                </select>
            </div>

            {/* Tabela de Veículos */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                {/* Cabeçalho Tabela Desktop */}
                {/* ... (JSX do Cabeçalho da Tabela sem mudança) ... */}
                <div className="hidden md:grid grid-cols-7 gap-4 p-4 font-semibold text-xs text-gray-600 border-b bg-gray-50 uppercase tracking-wider">
                    <div className="col-span-2 cursor-pointer hover:text-gray-900" onClick={() => requestSort('registroInterno')}>Veículo <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="cursor-pointer hover:text-gray-900" onClick={() => requestSort('placa')}>Placa <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="cursor-pointer hover:text-gray-900" onClick={() => requestSort('registroInterno')}>Registro <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="text-right cursor-pointer hover:text-gray-900" onClick={() => requestSort('vehicleReading')}>Leitura <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="cursor-pointer hover:text-gray-900" onClick={() => requestSort('status')}>Status <ChevronsUpDown size={12} className="inline-block ml-1"/></div>
                    <div className="text-center">Ações</div>
                </div>
                {/* Linhas da Tabela (Mobile First) */}
                {/* ... (JSX do loop .map das Linhas da Tabela sem mudança) ... */}
                {filteredVehicles.map(vehicle => {
                    const revisionInfo = getRevisionStatus(vehicle);
                    const hasPendingFine = vehiclesWithPendingFines.has(vehicle.id);
                    // Define classes de status para badge
                    const statusClasses = {
                        'Em Manutenção': 'bg-red-100 text-red-800',
                        'Aguardando Manutenção': 'bg-red-100 text-red-800 animate-pulse',
                        'Em Obra': 'bg-green-100 text-green-800',
                        'Em Operação': 'bg-blue-100 text-blue-800',
                        'Disponível': 'bg-gray-100 text-gray-800'
                    };
                    const statusText = vehicle.status === 'Disponível'
                        ? `${vehicle.status} - ${vehicle.localizacaoAtual || 'Pátio'}`
                        : vehicle.status === 'Em Obra' && vehicle.obra
                            ? `Obra: ${vehicle.obra.nome}`
                            : vehicle.status;

                    return (
                        <div key={vehicle.id} className={`grid grid-cols-1 md:grid-cols-7 gap-2 md:gap-4 items-center p-3 md:p-4 border-b last:border-b-0 hover:bg-gray-50 text-sm ${getVehicleRowClass(vehicle)}`}>
                            {/* Coluna Veículo (com imagem) */}
                            <div className="md:col-span-2 flex items-center gap-3">
                                <div className="relative shrink-0">
                                    <button onClick={() => openDetailModal(vehicle)} className="cursor-pointer block">
                                        <img
                                            src={vehicle.fotoURL || 'https://placehold.co/80x60/e2e8f0/cbd5e0?text=S/Foto'}
                                            alt={`${vehicle.marca || ''} ${vehicle.modelo || ''}`}
                                            className="w-20 h-15 object-cover rounded"
                                            onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/80x60/e2e8f0/cbd5e0?text=Erro'; }}
                                        />
                                    </button>
                                     {/* Ícones de Alerta */}
                                     {/* Não pode circular */}
                                     {vehicle.canCirculate === false && <span className="absolute -top-1.5 -right-1.5 p-0.5 bg-red-600 border-2 border-white rounded-full text-white tooltip" data-tip="Não pode circular"><TrafficCone size={12} /></span>}
                                     {/* Revisão Próxima */}
                                     {revisionInfo.status === 'warning' && <span className="absolute -top-1.5 -left-1.5 p-0.5 bg-yellow-500 border-2 border-white rounded-full text-white tooltip" data-tip={`Revisão: ${revisionInfo.text}`}><Info size={12} /></span>}
                                     {/* Revisão Vencida */}
                                     {revisionInfo.status === 'danger' && <span className="absolute -top-1.5 -left-1.5 p-0.5 bg-red-600 border-2 border-white rounded-full text-white tooltip" data-tip={`Revisão: ${revisionInfo.text}`}><AlertTriangle size={12} /></span>}
                                     {/* Multa Pendente */}
                                     {hasPendingFine && <span className="absolute -bottom-1.5 -right-1.5 p-0.5 bg-orange-500 border-2 border-white rounded-full text-white tooltip" data-tip="Multa pendente"><ShieldAlert size={12} /></span>}
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900">{vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo}</p>
                                    <p className="text-xs text-gray-500">{vehicle.tipo}</p>
                                </div>
                            </div>
                            {/* Placa */}
                            <div className="text-gray-700 md:block hidden">{vehicle.placa}</div>
                            {/* Registro */}
                            <div className="text-gray-700 md:block hidden">{vehicle.registroInterno}</div>
                            {/* Leitura */}
                            <div className="text-gray-700 text-right md:block hidden">{vehicle.vehicleReading}</div>
                             {/* Status */}
                            <div>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${statusClasses[vehicle.status] || 'bg-gray-100 text-gray-800'}`}>
                                    {statusText}
                                </span>
                            </div>
                            {/* Ações */}
                            <div className="flex flex-wrap gap-1 justify-start md:justify-center items-center">
                                {/* Agrupa botões comuns */}
                                <button onClick={() => openFinesModal(vehicle)} title="Histórico de Multas" className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-gray-100 rounded-md"><ShieldAlert size={14} /></button>
                                <button onClick={() => openHistoryModal(vehicle)} title="Histórico" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-md"><Clock size={14} /></button>
                                <ProtectedComponent requiredPermission="editor">
                                    <button onClick={() => openModal(vehicle)} title="Editar" className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-md"><Edit size={14} /></button>
                                     {/* Botões de alocação/manutenção apenas se o status permitir */}
                                     {vehicle.status === 'Disponível' && (
                                         <>
                                            <button onClick={() => openObraAllocationModal(vehicle)} title="Alocar em Obra" className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-gray-100 rounded-md"><HardHat size={14} /></button>
                                            <button onClick={() => openOperationalModal(vehicle)} title="Alocar em Operação" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-md"><Users size={14} /></button>
                                            <button onClick={() => handleMaintenanceClick(vehicle)} title="Manutenção" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-md"><Wrench size={14} /></button>
                                         </>
                                     )}
                                     {/* Botões para desalocar */}
                                     {vehicle.status === 'Em Obra' && <button onClick={() => openObraAllocationModal(vehicle)} title="Desalocar da Obra" className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-md"><HardHat size={14} /></button>}
                                     {vehicle.status === 'Em Operação' && <button onClick={() => openOperationalModal(vehicle)} title="Desalocar da Operação" className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-md"><Users size={14} /></button>}
                                     {(vehicle.status === 'Em Manutenção' || vehicle.status === 'Aguardando Manutenção') && <button onClick={() => handleMaintenanceClick(vehicle)} title="Finalizar Manutenção" className="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-100 rounded-md"><Wrench size={14} /></button>}
                                </ProtectedComponent>
                                <ProtectedComponent requiredPermission="admin">
                                    <button onClick={() => openDeleteModal(vehicle.id)} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-md"><Trash2 size={14} /></button>
                                </ProtectedComponent>
                            </div>
                        </div>
                    );
                })}
                 {filteredVehicles.length === 0 && (
                    <p className="p-4 text-center text-gray-500 italic">Nenhum veículo encontrado com os filtros selecionados.</p>
                 )}
            </div>

            {/* Modais */}
            {isModalOpen && <VehicleModal user={user} vehicle={editingVehicle} vehicles={vehicles} vehicleTypes={vehicleTypes} onClose={() => setIsModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} vehicleGroups={vehicleGroups} />}
            {isObraAllocationModalOpen && <ObraAllocationModal user={user} vehicle={vehicleForObraAllocation} obras={obras} employees={employees} onClose={() => setIsObraAllocationModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} vehicles={vehicles} vehicleGroups={vehicleGroups} />}
            {isOperationalModalOpen && <OperationalAssignmentModal user={user} vehicle={vehicleForOperational} employees={employees} onClose={() => setIsOperationalModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} operationalSubGroups={operationalSubGroups} />}
            {isHistoryModalOpen && <HistoryModal vehicle={vehicleForHistory} onClose={() => setIsHistoryModalOpen(false)} obras={obras} />}
            {isDeleteModalOpen && <PasswordConfirmationModal message="Tem certeza que deseja excluir este veículo? Todas as revisões associadas também serão removidas." onConfirm={handleDelete} onClose={() => setIsDeleteModalOpen(false)} apiClient={apiClient} />}
            {isDetailModalOpen && <VehicleDetailModal vehicle={vehicleForDetail} revision={revisions.find(r => r.vehicleId === vehicleForDetail?.id)} onClose={() => setIsDetailModalOpen(false)} vehicleGroups={vehicleGroups} />}
            {isFinesModalOpen && <VehicleFinesModal vehicle={vehicleForFines} fines={fines} onClose={() => setIsFinesModalOpen(false)} />}
            {isMaintenanceModalOpen && <MaintenanceModal user={user} vehicle={vehicleForMaintenance} onClose={() => setIsMaintenanceModalOpen(false)} apiClient={apiClient} setAlertMessage={setAlertMessage} reloadData={reloadData} />}
        </div>
    );
};

// --- MODAIS E SUB-COMPONENTES (ADAPTADOS PARA API) ---

// Modal de Manutenção (Adaptado para API)
// ... (Modal MaintenanceModal sem mudança) ...
const MaintenanceModal = ({ user, vehicle, onClose, apiClient, setAlertMessage, reloadData }) => {
    const isCurrentlyInMaintenance = vehicle.status === 'Em Manutenção' || vehicle.status === 'Aguardando Manutenção';
    const [status, setStatus] = useState(isCurrentlyInMaintenance ? vehicle.status : 'Aguardando Manutenção');
     // Pega localização atual dos detalhes ou default
    const [location, setLocation] = useState(vehicle.maintenanceLocation?.details || 'Pátio MAK Lajeado');
    const [isSaving, setIsSaving] = useState(false);
    // Estado para local de finalização
    const [endLocation, setEndLocation] = useState('Pátio MAK Lajeado');


    const handleSubmit = async () => {
        setIsSaving(true);
        try {
            await apiClient.startVehicleMaintenance(vehicle.id, { status, location });
            setAlertMessage(`Status de manutenção atualizado para "${status}".`);
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao iniciar manutenção:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao atualizar o status de manutenção.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleEndMaintenance = async () => {
        setIsSaving(true);
        try {
            await apiClient.endVehicleMaintenance(vehicle.id, { location: endLocation }); // Envia o local de finalização
            setAlertMessage("Veículo liberado da manutenção.");
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao finalizar manutenção:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao finalizar a manutenção.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Gerir Manutenção</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                </div>
                <div className="p-6 space-y-4">
                     <p className="text-sm"><strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.placa}</p>
                    {/* Se NÃO está em manutenção, permite definir status e local de entrada */}
                    {!isCurrentlyInMaintenance ? (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Definir Status *</label>
                                <select value={status} onChange={e => setStatus(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm bg-white" required>
                                    <option value="Aguardando Manutenção">Aguardando Manutenção</option>
                                    <option value="Em Manutenção">Em Manutenção</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Localização da Manutenção *</label>
                                <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Ex: Oficina Terceirizada ou Pátio MAK Lajeado" className="mt-1 w-full p-2 border rounded-md text-sm" required />
                            </div>
                        </>
                    ) : (
                         // Se JÁ está em manutenção, mostra informações e permite finalizar
                        <div>
                            <p className="mb-2">O veículo está atualmente: <strong>{vehicle.status}</strong>.</p>
                            <p className="mb-4">Localização: <strong>{vehicle.maintenanceLocation?.details || 'Não informado'}</strong>.</p>
                            <hr className="my-4"/>
                            <label className="block text-sm font-medium text-gray-700">Local de Disponibilidade após Manutenção *</label>
                            <input type="text" value={endLocation} onChange={e => setEndLocation(e.target.value)} placeholder="Ex: Pátio MAK Lajeado" className="mt-1 w-full p-2 border rounded-md text-sm" required />
                        </div>
                    )}
                </div>
                {/* Rodapé com botões condicionais */}
                <div className="p-4 bg-gray-50 border-t flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Cancelar</button>
                    {isCurrentlyInMaintenance ? (
                        <button onClick={handleEndMaintenance} disabled={isSaving || !endLocation} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-green-300 flex items-center justify-center gap-2 text-sm">
                            {isSaving ? <><Loader className="animate-spin" size={18}/> Finalizando...</> : "Finalizar Manutenção"}
                        </button>
                    ) : (
                        <button onClick={handleSubmit} disabled={isSaving || !status || !location} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm">
                            {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : "Confirmar Status"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};


// Modal de Multas do Veículo (Adaptado para API)
// ... (Modal VehicleFinesModal sem mudança) ...
const VehicleFinesModal = ({ vehicle, fines = [], onClose }) => { // Adiciona valor padrão
    const vehicleFines = useMemo(() => {
        return (fines || [])
            .filter(fine => fine.vehicleId === vehicle.id)
            // Ordena por data da infração (mais recente primeiro) usando new Date()
            .sort((a, b) => new Date(b.dataInfracao) - new Date(a.dataInfracao));
    }, [fines, vehicle]);

    // Função de badge (mantida)
    const getStatusBadge = (status) => {
        switch (status) {
            case 'Paga': return 'bg-green-100 text-green-800';
            case 'Pendente': return 'bg-yellow-100 text-yellow-800';
            case 'Em Recurso': return 'bg-blue-100 text-blue-800';
            case 'Cancelada': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                {/* Cabeçalho */}
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold">Histórico de Multas do Veículo</h2>
                        <p className="text-gray-600 text-sm">{vehicle.registroInterno} - {vehicle.placa}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={18}/></button>
                </div>
                 {/* Conteúdo Rolável */}
                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    {vehicleFines.length > 0 ? (
                        <ul className="space-y-3">
                            {vehicleFines.map(fine => (
                                <li key={fine.id} className="p-4 bg-gray-50 rounded-lg border">
                                    <div className="flex flex-col sm:flex-row justify-between items-start">
                                        <div className="mb-2 sm:mb-0">
                                            <p className="font-semibold text-sm">{fine.descricao || 'Descrição não informada'}</p>
                                            {/* Acessa nome do funcionário com segurança */}
                                            <p className="text-xs text-gray-600 mt-1">Condutor: {fine.employeeInfo?.nome || 'Não informado'}</p>
                                             {/* Formata data da infração usando new Date() */}
                                            <p className="text-xs text-gray-600">Data: {fine.dataInfracao ? new Date(fine.dataInfracao).toLocaleDateString('pt-BR') : 'N/A'}</p>
                                        </div>
                                        <div className="text-left sm:text-right w-full sm:w-auto">
                                            <p className="font-bold text-red-600">R$ {(fine.valor || 0).toFixed(2)}</p>
                                            <span className={`mt-1 inline-block px-2 py-0.5 text-xs font-bold rounded-full ${getStatusBadge(fine.status)}`}>
                                                {fine.status || 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500 text-center italic">Nenhuma multa registrada para este veículo.</p>
                    )}
                </div>
                 {/* Rodapé Fixo */}
                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};


// Modal de Criação/Edição de Veículo (Adaptado para API, sem upload de foto)
// ... (Modal VehicleModal sem mudança) ...
const VehicleModal = ({ user, vehicle, vehicles = [], vehicleTypes = [], onClose, setAlertMessage, apiClient, reloadData, vehicleGroups = {} }) => {
    // Estado inicial ajustado para API (datas como YYYY-MM-DD, números como string)
    const [formData, setFormData] = useState({
        placa: vehicle?.placa || '',
        registroInterno: vehicle?.registroInterno || '',
        capacidade: vehicle?.capacidade?.toString() || '', // string
        tipo: vehicle?.tipo || (vehicleTypes.length > 0 ? vehicleTypes[0] : ''), // Default para primeiro tipo se existir
        marca: vehicle?.marca || '',
        modelo: vehicle?.modelo || '',
        odometro: vehicle?.odometro?.toString() || '0', // string, default 0
        horimetro: vehicle?.horimetro?.toString() || '0',
        horimetroDigital: vehicle?.horimetroDigital?.toString() || '0',
        horimetroAnalogico: vehicle?.horimetroAnalogico?.toString() || '0',
        possuiHorimetroAnalogico: vehicle?.possuiHorimetroAnalogico || false,
        mediaCalculo: vehicle?.mediaCalculo || 'odometro', // Default odometro
        isComboioVehicle: vehicle?.isComboioVehicle || false,
        fuelCapacity: vehicle?.fuelCapacity?.toString() || '',
        // rastreador: vehicle?.rastreador || 'Sem Rastreador', // Removido rastreador por enquanto
        anoFabricacao: vehicle?.ano_fabricacao?.toString() || '', // Campo do DB é ano_fabricacao
        anoModelo: vehicle?.ano_modelo?.toString() || '', // Campo do DB é ano_modelo
        chassi: vehicle?.chassi || '',
        // pbt: vehicle?.pbt || '', // Removido pbt por enquanto
        // consumoMedioFabricante: vehicle?.consumoMedioFabricante?.toString() || '',
        validadeTacografo: vehicle?.validadeTacografo ? new Date(vehicle.validadeTacografo).toISOString().split('T')[0] : '', // YYYY-MM-DD
        validadeAET_DAER: vehicle?.validadeAET_DAER ? new Date(vehicle.validadeAET_DAER).toISOString().split('T')[0] : '',
        validadeAET_DNIT: vehicle?.validadeAET_DNIT ? new Date(vehicle.validadeAET_DNIT).toISOString().split('T')[0] : '',
        canCirculate: vehicle?.canCirculate !== undefined ? vehicle.canCirculate : true,
        // Foto removida por enquanto
    });
    // const [fotoFile, setFotoFile] = useState(null); // Removido
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    // const rastreadorOptions = ['Fleet', 'Khronos', 'Sem Rastreador', 'Não Rastreável', 'Sigasul', 'Sigasul+Telemetria', 'Sigasul+ID', 'Sigasul+Cam', 'Sigasul+Cam+ID']; // Removido

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
         // Se desmarcar analógico, limpa o valor
        if (name === 'possuiHorimetroAnalogico' && !checked) {
            setFormData(prev => ({ ...prev, horimetroAnalogico: '0' }));
        }
    };

    // const handleFileChange = (e) => { if (e.target.files[0]) { setFotoFile(e.target.files[0]); } }; // Removido

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const isEditing = !!vehicle;

        // Validações
        if (!formData.placa || !formData.registroInterno || !formData.tipo || !formData.marca || !formData.modelo) {
             setError('Placa, Registro Interno, Tipo, Marca e Modelo são obrigatórios.');
             return;
         }
        const plateExists = vehicles.some(v => v.placa === formData.placa && v.id !== vehicle?.id);
        if (plateExists) {
            setError('Já existe um veículo com esta placa.');
            return;
        }
        const internalIdExists = vehicles.some(v => v.registroInterno === formData.registroInterno && v.id !== vehicle?.id);
        if (internalIdExists) {
            setError('Já existe um veículo com este registro interno.');
            return;
        }

        setIsSaving(true);

        // Prepara dados para API (converte números, trata datas)
        const dataToSave = {
            ...formData,
            // Converte leituras para números ou null
            odometro: parseFloat(formData.odometro) || null,
            horimetro: parseFloat(formData.horimetro) || null,
            horimetroDigital: parseFloat(formData.horimetroDigital) || null,
            horimetroAnalogico: formData.possuiHorimetroAnalogico ? (parseFloat(formData.horimetroAnalogico) || null) : null, // Só salva se checkbox estiver marcado
            fuelCapacity: parseFloat(formData.fuelCapacity) || null,
            // consumoMedioFabricante: parseFloat(formData.consumoMedioFabricante) || null,
            ano_fabricacao: parseInt(formData.anoFabricacao, 10) || null, // Campo do DB
            ano_modelo: parseInt(formData.anoModelo, 10) || null,       // Campo do DB
            capacidade: parseFloat(formData.capacidade) || null, // Converte capacidade
            // Trata datas: envia YYYY-MM-DD ou null
            validadeTacografo: formData.validadeTacografo || null,
            validadeAET_DAER: formData.validadeAET_DAER || null,
            validadeAET_DNIT: formData.validadeAET_DNIT || null,
            // ultimaAlteracao é adicionado pelo backend
            // fotoURL não está sendo enviado
        };
         // Remove a prop que não existe no DB
        delete dataToSave.anoFabricacao;
        delete dataToSave.anoModelo;

        try {
            if (isEditing) {
                await apiClient.updateVehicle(vehicle.id, dataToSave);
                setAlertMessage(`Veículo ${formData.registroInterno} atualizado com sucesso!`);
            } else {
                // Adiciona status padrão ao criar
                const dataWithDefaults = {
                    ...dataToSave,
                    status: 'Disponível',
                    // history é inicializado pelo backend
                    // canCirculate já está no dataToSave
                };
                await apiClient.createVehicle(dataWithDefaults);
                setAlertMessage(`Veículo ${formData.registroInterno} adicionado com sucesso!`);
            }
            reloadData(); // Recarrega os dados
            onClose();
        } catch (err) {
            console.error("Erro ao salvar veículo:", err);
            setError(err.response?.data?.message || "Ocorreu um erro ao salvar os dados.");
        } finally {
            setIsSaving(false);
        }
    };

    // Grupo atual para UI condicional (mantido)
    const currentGroup = useMemo(() => {
         const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
         return Object.keys(groups).find(group => groups[group]?.includes(formData.tipo))
     }, [formData.tipo, vehicleGroups]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            {/* Modal Content */}
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col my-auto">
                 {/* Cabeçalho Fixo */}
                <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                    <h2 className="text-xl sm:text-2xl font-bold">{vehicle ? 'Editar Veículo' : 'Adicionar Veículo'}</h2>
                     <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                </div>
                 {/* Conteúdo Rolável */}
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
                                     {/* Garante que vehicleTypes é um array */}
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
                              {/* Campo de Capacidade (Ex: m³) */}
                              <div>
                                 <label className="block font-medium text-gray-700 mb-1">Capacidade (m³)</label>
                                 <input name="capacidade" value={formData.capacidade} onChange={handleChange} placeholder="Ex: 12" type="number" step="any" className="p-2 border rounded w-full" />
                             </div>
                        </div>

                         {/* --- Coluna 2: Leituras e Detalhes --- */}
                        <div className="space-y-4">
                            {/* Leituras Condicionais */}
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
                            {currentGroup === 'Caminhões' && (
                                <>
                                    <div>
                                        <label className="block font-medium text-gray-700 mb-1">Odômetro (Km)</label>
                                        <input name="odometro" value={formData.odometro} onChange={handleChange} type="number" step="any" className="p-2 border rounded w-full" />
                                    </div>
                                     <div>
                                        <label className="block font-medium text-gray-700 mb-1">Horímetro (Hrs)</label>
                                        <input name="horimetro" value={formData.horimetro} onChange={handleChange} type="number" step="0.1" className="p-2 border rounded w-full" />
                                    </div>
                                     {/* Opção Média Cálculo */}
                                     <div>
                                        <label className="block font-medium text-gray-700 mb-1">Calcular Média Por</label>
                                        <select name="mediaCalculo" value={formData.mediaCalculo} onChange={handleChange} className="p-2 border rounded w-full bg-white">
                                            <option value="odometro">Odômetro (Km/L)</option>
                                            <option value="horimetro">Horímetro (L/Hr)</option>
                                        </select>
                                    </div>
                                </>
                            )}
                            {(currentGroup === 'Veículos Leves' || !currentGroup) && ( // Default para Leves ou se grupo não definido
                                <div>
                                    <label className="block font-medium text-gray-700 mb-1">Odômetro (Km)</label>
                                    <input name="odometro" value={formData.odometro} onChange={handleChange} type="number" step="any" className="p-2 border rounded w-full" />
                                </div>
                            )}

                             {/* Ano Fab/Modelo */}
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
                            {/* Chassi */}
                             <div>
                                <label className="block font-medium text-gray-700 mb-1">Chassi</label>
                                <input name="chassi" value={formData.chassi} onChange={handleChange} placeholder="Nº do Chassi" className="p-2 border rounded w-full" />
                            </div>
                            {/* Capacidade Tanque */}
                            <div>
                                <label className="block font-medium text-gray-700 mb-1">Capacidade Tanque (L)</label>
                                <input name="fuelCapacity" value={formData.fuelCapacity} onChange={handleChange} placeholder="Ex: 300" type="number" step="any" className="p-2 border rounded w-full" />
                            </div>

                        </div>

                         {/* --- Coluna 3: Checkboxes e Datas --- */}
                        <div className="space-y-4">
                             {/* Comboio */}
                             <div className="flex items-center pt-1">
                                <input name="isComboioVehicle" id="isComboioVehicle" type="checkbox" checked={formData.isComboioVehicle} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"/>
                                <label htmlFor="isComboioVehicle" className="ml-2 block font-medium text-gray-900 cursor-pointer">É um veículo Comboio?</label>
                            </div>
                             {/* Pode Circular */}
                            <div className="flex items-center">
                                <input name="canCirculate" id="canCirculate" type="checkbox" checked={formData.canCirculate} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"/>
                                <label htmlFor="canCirculate" className="ml-2 block font-medium text-gray-900 cursor-pointer">Pode Circular / Rodar?</label>
                            </div>

                            {/* Datas (Condicional para Caminhões) */}
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

                             {/* Erro */}
                             {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
                        </div>
                    </div>

                    {/* Rodapé Fixo */}
                    <div className="p-4 bg-gray-50 border-t flex flex-col sm:flex-row justify-end gap-2 sticky bottom-0 z-10">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium w-full sm:w-auto" disabled={isSaving}>Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm w-full sm:w-auto">
                            {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// Modal de Detalhes do Veículo (Adaptado para API)
// ... (Modal VehicleDetailModal sem mudança) ...
const VehicleDetailModal = ({ vehicle, revision, onClose, vehicleGroups = {} }) => { // Adiciona valor padrão
    if (!vehicle) return null;

     // Garante que groups é um objeto
    const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
    const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(vehicle.tipo));

    // Determina unidade e leitura principal
    let readingLabel = 'Leitura';
    let readingValue = 'N/A';
    let consumptionUnit = 'Unidade/L';

    if (vehicleGroup === 'Máquinas Pesadas') {
         readingLabel = 'Horímetro';
         readingValue = vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro ?? 'N/A';
         consumptionUnit = 'L/Hr';
    } else if (vehicleGroup === 'Caminhões') {
        readingLabel = 'Horímetro/Odômetro';
        readingValue = `${vehicle.horimetro ?? 'N/A'} Hr / ${vehicle.odometro ?? 'N/A'} Km`;
        consumptionUnit = vehicle.mediaCalculo === 'horimetro' ? 'L/Hr' : 'Km/L';
    } else { // Veículos Leves ou outros
        readingLabel = 'Odômetro';
        readingValue = vehicle.odometro ?? 'N/A';
        consumptionUnit = 'Km/L';
    }

    // Formata datas da API
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try { return new Date(dateString).toLocaleDateString('pt-BR', { timeZone: 'UTC' }); } // Usa UTC
        catch { return 'Inválida'; }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[95vh] flex flex-col my-auto">
                {/* Cabeçalho Fixo */}
                <div className="p-4 sm:p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <h2 className="text-xl sm:text-2xl font-bold">{vehicle.marca} {vehicle.modelo}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={20}/></button>
                </div>
                 {/* Conteúdo Rolável */}
                <div className="p-4 sm:p-6 overflow-y-auto">
                    {/* Imagem */}
                    <div className="mb-6 aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                        <img
                            src={vehicle.fotoURL || 'https://placehold.co/600x400/e2e8f0/cbd5e0?text=S/Foto'}
                            alt={`Foto de ${vehicle.marca || ''} ${vehicle.modelo || ''}`}
                            className="w-full h-full object-contain rounded-lg" // object-contain para não distorcer
                            onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/600x400/e2e8f0/cbd5e0?text=Erro'; }}
                        />
                         {/* Ícone se a imagem falhar */}
                         {!vehicle.fotoURL && <ImageOff className="text-gray-400" size={48} />}
                    </div>

                    {/* Detalhes em Grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:text-base">
                        <div className="font-semibold text-gray-600">Registro Interno:</div>
                        <div className="text-gray-800 font-medium">{vehicle.registroInterno || 'N/A'}</div>

                        <div className="font-semibold text-gray-600">Placa:</div>
                        <div className="text-gray-800 font-medium">{vehicle.placa || 'N/A'}</div>

                        <div className="font-semibold text-gray-600">Tipo:</div>
                        <div className="text-gray-800 font-medium">{vehicle.tipo || 'N/A'}</div>

                        <div className="font-semibold text-gray-600">{readingLabel}:</div>
                        <div className="text-gray-800 font-medium">{readingValue}</div>

                         {/* Separador */}
                        <div className="col-span-2 border-t my-2"></div>

                        {/* Detalhes Adicionais */}
                        {/* Removido Rastreador */}
                         {(vehicle.ano_fabricacao || vehicle.ano_modelo) && (<>
                            <div className="font-semibold text-gray-600">Ano Fab./Modelo:</div>
                            <div className="text-gray-800 font-medium">{vehicle.ano_fabricacao || 'N/A'} / {vehicle.ano_modelo || 'N/A'}</div>
                        </>)}

                        {vehicle.chassi && (<>
                            <div className="font-semibold text-gray-600">Chassi:</div>
                            <div className="text-gray-800 font-medium break-all">{vehicle.chassi}</div> {/* break-all para chassi longo */}
                        </>)}

                         {/* Removido PBT */}

                         {/* Removido Consumo Médio Fabricante */}

                         {/* Exibe Cálculo de Média */}
                         {(vehicleGroup === 'Caminhões' || vehicleGroup === 'Máquinas Pesadas') && (<>
                            <div className="font-semibold text-gray-600">Cálculo de Média:</div>
                            <div className="text-gray-800 font-medium">{vehicle.mediaCalculo === 'odometro' ? 'Odômetro (Km/L)' : 'Horímetro (L/Hr)'}</div>
                        </>)}

                        {vehicle.capacidade && (
                            <>
                                <div className="font-semibold text-gray-600">Capacidade (m³):</div>
                                <div className="text-gray-800 font-medium">{vehicle.capacidade}</div>
                            </>
                        )}
                         {vehicle.fuelCapacity && (
                            <>
                                <div className="font-semibold text-gray-600">Capacidade Tanque (L):</div>
                                <div className="text-gray-800 font-medium">{vehicle.fuelCapacity}</div>
                            </>
                        )}

                         {/* Validades (Condicional para Caminhões) */}
                         {vehicleGroup === 'Caminhões' && (
                            <>
                                <div className="col-span-2 border-t my-2"></div>
                                <div className="font-semibold text-gray-600">Validade Tacógrafo:</div>
                                <div className={`font-medium ${new Date(vehicle.validadeTacografo) < new Date() ? 'text-red-600' : 'text-gray-800'}`}>{formatDate(vehicle.validadeTacografo)}</div>

                                <div className="font-semibold text-gray-600">Validade AET DAER:</div>
                                 <div className={`font-medium ${new Date(vehicle.validadeAET_DAER) < new Date() ? 'text-red-600' : 'text-gray-800'}`}>{formatDate(vehicle.validadeAET_DAER)}</div>

                                <div className="font-semibold text-gray-600">Validade AET DNIT:</div>
                                <div className={`font-medium ${new Date(vehicle.validadeAET_DNIT) < new Date() ? 'text-red-600' : 'text-gray-800'}`}>{formatDate(vehicle.validadeAET_DNIT)}</div>
                            </>
                         )}


                        {/* Revisão */}
                        <div className="col-span-2 border-t my-2 pt-2">
                             <h3 className="font-semibold text-gray-700 mb-1">Próxima Revisão Agendada</h3>
                        </div>
                        <div className="font-semibold text-gray-600">Data:</div>
                        <div className="text-gray-800 font-medium">{formatDate(revision?.proximaRevisaoData)}</div>

                        <div className="font-semibold text-gray-600">Leitura ({readingLabel.split('/')[0]}):</div>
                        <div className="text-gray-800 font-medium">{revision?.proximaRevisaoOdometro || 'N/A'}</div>

                         <div className="font-semibold text-gray-600">Descrição:</div>
                         <div className="text-gray-800 font-medium col-span-2">{revision?.descricao || 'Nenhuma descrição'}</div>
                    </div>
                </div>
                 {/* Rodapé Fixo */}
                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-6 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};

// Modal de Alocação Operacional (Adaptado para API)
// ... (Modal OperationalAssignmentModal sem mudança) ...
const OperationalAssignmentModal = ({ user, vehicle, employees = [], onClose, setAlertMessage, apiClient, reloadData, operationalSubGroups = [] }) => {
    // Tenta obter dados da alocação atual (pode ser string JSON ou objeto)
    let currentAssignment = null;
    if (vehicle.operationalAssignment) {
        if (typeof vehicle.operationalAssignment === 'string') {
            try { currentAssignment = JSON.parse(vehicle.operationalAssignment); } catch { /* ignora erro */ }
        } else {
            currentAssignment = vehicle.operationalAssignment;
        }
    }

    const [subGroup, setSubGroup] = useState(currentAssignment?.subGroup || '');
    const [employeeId, setEmployeeId] = useState(currentAssignment?.employeeId || '');
    const [observacoes, setObservacoes] = useState(currentAssignment?.observacoes || ''); // Observações da alocação atual
    const [isSaving, setIsSaving] = useState(false);
    // Local para onde o veículo irá APÓS desalocar
    const [locationAfterUnassign, setLocationAfterUnassign] = useState('Pátio MAK Lajeado');

    // Filtra funcionários disponíveis
    const availableEmployees = useMemo(() =>
        (employees || [])
            .filter(e => e.status !== 'inativo') // Somente ativos
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [employees]);

    // Função para Alocar
    const handleAssign = async () => {
        if (!subGroup || !employeeId) {
            setAlertMessage("Selecione o subgrupo e o funcionário.");
            return;
        }
        setIsSaving(true);
        try {
            await apiClient.assignVehicleToOperational(vehicle.id, { subGroup, employeeId, observacoes });
            setAlertMessage("Veículo alocado para operação com sucesso.");
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao alocar veículo para operação:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao alocar o veículo.");
        } finally {
            setIsSaving(false);
        }
    };

    // Função para Desalocar
    const handleUnassign = async () => {
        setIsSaving(true);
        try {
            await apiClient.unassignVehicleFromOperational(vehicle.id, { location: locationAfterUnassign });
            setAlertMessage("Alocação operacional finalizada.");
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao finalizar alocação:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao finalizar a alocação.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Alocação Operacional</h2>
                     <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                </div>
                <div className="p-6">
                     <p className="text-sm mb-4"><strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo}</p>
                    {/* Se já estiver alocado, mostra opção de desalocar */}
                    {currentAssignment ? (
                        <div className="space-y-4">
                            <p className="text-sm">Este veículo está alocado para <strong>{currentAssignment.subGroup || 'N/A'}</strong> com <strong>{currentAssignment.employeeName || 'N/A'}</strong>.</p>
                             {/* Campo para definir o local após desalocar */}
                             <div>
                                <label className="block text-sm font-medium text-gray-700">Local de Disponibilidade após Desalocar *</label>
                                <input
                                     type="text"
                                     value={locationAfterUnassign}
                                     onChange={e => setLocationAfterUnassign(e.target.value)}
                                     placeholder="Ex: Pátio MAK Lajeado"
                                     className="mt-1 w-full p-2 border rounded-md text-sm"
                                     required
                                 />
                            </div>
                            <button onClick={handleUnassign} disabled={isSaving || !locationAfterUnassign} className="w-full px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-red-300 flex items-center justify-center gap-2 text-sm">
                                {isSaving ? <><Loader className="animate-spin" size={18}/> Finalizando...</> : "Finalizar Alocação"}
                            </button>
                        </div>
                    ) : (
                         // Se não estiver alocado, mostra formulário para alocar
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Alocar no Grupo *</label>
                                <select value={subGroup} onChange={e => setSubGroup(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm bg-white" required>
                                    <option value="">Selecione...</option>
                                    {(operationalSubGroups || []).map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Alocar para Funcionário *</label>
                                <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm bg-white" required>
                                    <option value="">Selecione...</option>
                                    {availableEmployees.map(e => <option key={e.id} value={e.id}>{e.nome} ({e.funcao})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Observações</label>
                                <textarea
                                    value={observacoes}
                                    onChange={e => setObservacoes(e.target.value)}
                                    rows="2"
                                    className="mt-1 w-full p-2 border rounded-md text-sm"
                                    placeholder="Detalhes adicionais..."
                                />
                            </div>
                            <button onClick={handleAssign} disabled={isSaving || !subGroup || !employeeId} className="w-full px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm">
                                {isSaving ? <><Loader className="animate-spin" size={18}/> Alocando...</> : "Alocar Veículo"}
                            </button>
                        </div>
                    )}
                </div>
                {/* Rodapé padrão */}
                {/* <div className="p-4 bg-gray-50 border-t flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Fechar</button>
                </div> */}
            </div>
        </div>
    );
};

// Modal de Alocação em Obra (Adaptado para API)
// ... (Modal ObraAllocationModal - sem mudança estrutural, mas o bug do checkAndDeallocate será corrigido no FinishObraModal) ...
const ObraAllocationModal = ({ user, vehicle, obras = [], employees = [], onClose, setAlertMessage, apiClient, reloadData, vehicles = [], vehicleGroups = {} }) => {
    // Verifica se o veículo está atualmente alocado em obra
    const currentObraAllocation = (Array.isArray(vehicle.history) ? vehicle.history : [])
                                    .find(h => h.type === 'obra' && !h.endDate);

    // Estado inicial dos campos
    const [obraId, setObraId] = useState(currentObraAllocation ? vehicle.obraAtualId : '');
    const [employeeId, setEmployeeId] = useState(currentObraAllocation?.details?.employeeId || '');
    const [dataEntrada, setDataEntrada] = useState(currentObraAllocation ? new Date(currentObraAllocation.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    const [dataSaida, setDataSaida] = useState(new Date().toISOString().split('T')[0]); // Para desalocar
     // Local para onde irá após desalocar
    const [locationAfterDeallocate, setLocationAfterDeallocate] = useState('Pátio MAK Lajeado');
    const [isSaving, setIsSaving] = useState(false);

    // Determina tipo de leitura e valor inicial
    const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
    const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(vehicle.tipo));
    const readingType = (vehicleGroup === 'Caminhões' || vehicleGroup === 'Máquinas Pesadas') ? 'horimetro' : 'odometro';
    const readingLabel = readingType === 'horimetro' ? 'Horímetro' : 'Odômetro';
    const initialReading = currentObraAllocation
                            ? (currentObraAllocation.details?.[`${readingType}Entrada`] || '') // Leitura de entrada se já alocado
                            : (vehicle[readingType] || ''); // Leitura atual do veículo se for alocar

    const [readingValue, setReadingValue] = useState(initialReading.toString()); // Valor da leitura (entrada ou saída)

    // Filtra obras ativas e funcionários disponíveis
    const activeObras = useMemo(() => obras.filter(o => o.status === 'ativa').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);
    const availableEmployees = useMemo(() =>
        (employees || [])
            .filter(e => e.status !== 'inativo' && (e.funcao === 'Operador de Máquina' || e.funcao === 'Motorista')) // Filtra por função também
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [employees]);

    // Estados para o modal de finalização de obra (se aplicável ao desalocar)
    const [isFinishObraModalOpen, setIsFinishObraModalOpen] = useState(false);
    const [obraToFinalize, setObraToFinalize] = useState(null);


    // Função para ALOCAR
    const handleAllocate = async () => {
        const readingFloat = parseFloat(readingValue);
        if (!obraId || !employeeId || readingValue === '' || isNaN(readingFloat)) {
            setAlertMessage(`Preencha a Obra, Funcionário e ${readingLabel} de Entrada.`);
            return;
        }

        const selectedEmployee = employees.find(e => e.id === employeeId);
        // Verifica se o funcionário já está alocado (aviso)
        let employeeAllocationInfo = null;
        if (selectedEmployee?.alocadoEm) {
             if (typeof selectedEmployee.alocadoEm === 'string') {
                 try { employeeAllocationInfo = JSON.parse(selectedEmployee.alocadoEm); } catch {}
             } else {
                 employeeAllocationInfo = selectedEmployee.alocadoEm;
             }
             if (employeeAllocationInfo?.veiculoId && employeeAllocationInfo.veiculoId !== vehicle.id) {
                console.warn(`Atenção: ${selectedEmployee.nome} já está alocado em outro veículo/obra.`);
                 // Poderia mostrar um ConfirmationModal aqui se quisesse impedir/confirmar
            }
        }


        setIsSaving(true);
        try {
            await apiClient.allocateVehicleToObra(vehicle.id, {
                obraId,
                employeeId,
                dataEntrada: dataEntrada, // Envia YYYY-MM-DD
                readingType: readingType, // 'odometro' ou 'horimetro'
                readingValue: readingFloat
            });
            setAlertMessage("Veículo alocado com sucesso!");
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao alocar veículo:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao alocar o veículo.");
        } finally {
            setIsSaving(false);
        }
    };

    // Função para DESALOCAR
    const handleDeallocate = async (shouldFinalizeObra = false, dataFimObra = null) => {
        const readingFloat = parseFloat(readingValue);
         if (readingValue === '' || isNaN(readingFloat)) {
             setAlertMessage(`Preencha o ${readingLabel} de Saída.`);
             return;
         }
          // Validação: Leitura de saída não pode ser menor que a de entrada
         if (currentObraAllocation && readingFloat < (currentObraAllocation.details?.[`${readingType}Entrada`] || 0)) {
             setAlertMessage(`A leitura de saída (${readingFloat}) não pode ser menor que a leitura de entrada (${currentObraAllocation.details?.[`${readingType}Entrada`] || 0}).`);
             return;
         }

        setIsSaving(true);
        try {
            await apiClient.deallocateVehicleFromObra(vehicle.id, {
                dataSaida: dataSaida, // Envia YYYY-MM-DD
                readingType: readingType,
                readingValue: readingFloat,
                location: locationAfterDeallocate, // Novo local
                shouldFinalizeObra: shouldFinalizeObra,
                dataFimObra: dataFimObra, // Opcional, YYYY-MM-DD
                obraId: vehicle.obraAtualId // Passa o ID da obra atual para o backend saber qual finalizar
            });
            setAlertMessage(`Veículo desalocado ${shouldFinalizeObra ? 'e obra finalizada' : ''} com sucesso!`);
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao desalocar veículo:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao desalocar o veículo.");
        } finally {
            setIsSaving(false);
        }
    };

    // Verifica se é o último veículo na obra antes de desalocar
    const checkAndDeallocate = () => {
        const obraData = obras.find(o => o.id === vehicle.obraAtualId);
        if (!obraData) { // Se não encontrar a obra (erro?), apenas desaloca
            handleDeallocate();
            return;
        }
         // Garante que historicoVeiculos é um array antes de filtrar
         const historico = Array.isArray(obraData.historicoVeiculos) ? obraData.historicoVeiculos : [];
        // Verifica se *outros* veículos ainda estão ativos na obra
        const otherActiveVehicles = historico.filter(h => h.veiculoId !== vehicle.id && !h.dataSaida);

        if (otherActiveVehicles.length === 0) { // Se este é o último
            setObraToFinalize(obraData);
            setIsFinishObraModalOpen(true); // Abre modal para confirmar finalização da obra
        } else {
            handleDeallocate(false); // Apenas desaloca o veículo
        }
    };


    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Alocação de Veículo em Obra</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                </div>
                <div className="p-6">
                     <p className="text-sm mb-4"><strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo} ({vehicle.placa})</p>
                    {/* Se estiver alocado, mostra opção de desalocar */}
                    {currentObraAllocation ? (
                        <div className="space-y-4">
                            <p className="text-sm">Alocado na obra: <strong>{obras.find(o => o.id === vehicle.obraAtualId)?.nome || 'Desconhecida'}</strong>.</p>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Data de Saída *</label>
                                <input type="date" value={dataSaida} onChange={e => setDataSaida(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm" required/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">{readingLabel} de Saída *</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={readingValue} // Usa o estado unificado
                                    onChange={e => setReadingValue(e.target.value)}
                                    className="mt-1 w-full p-2 border rounded-md text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Local de Disponibilidade após Saída *</label>
                                 <input
                                     type="text"
                                     value={locationAfterDeallocate}
                                     onChange={e => setLocationAfterDeallocate(e.target.value)}
                                     placeholder="Ex: Pátio MAK Lajeado"
                                     className="mt-1 w-full p-2 border rounded-md text-sm"
                                     required
                                 />
                            </div>
                            <button onClick={checkAndDeallocate} disabled={isSaving || !dataSaida || readingValue === '' || !locationAfterDeallocate} className="w-full px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-red-300 flex items-center justify-center gap-2 text-sm">
                                 {isSaving ? <><Loader className="animate-spin" size={18}/> Finalizando...</> : "Finalizar Alocação"}
                            </button>
                        </div>
                    ) : (
                         // Se não estiver alocado, mostra formulário para alocar
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Alocar na Obra *</label>
                                <select value={obraId} onChange={(e) => setObraId(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm bg-white" required>
                                    <option value="">Selecione...</option>
                                    {activeObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Alocar Funcionário *</label>
                                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm bg-white" required>
                                    <option value="">Selecione...</option>
                                    {availableEmployees.map(e => <option key={e.id} value={e.id}>{e.nome} ({e.funcao})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Data de Entrada *</label>
                                <input type="date" value={dataEntrada} onChange={e => setDataEntrada(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm" required/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">{readingLabel} de Entrada *</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={readingValue} // Usa o estado unificado
                                    onChange={e => setReadingValue(e.target.value)}
                                    className="mt-1 w-full p-2 border rounded-md text-sm"
                                    required
                                />
                            </div>
                            <button onClick={handleAllocate} disabled={isSaving || !obraId || !employeeId || readingValue === ''} className="w-full px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm">
                                {isSaving ? <><Loader className="animate-spin" size={18}/> Alocando...</> : "Alocar Veículo"}
                            </button>
                        </div>
                    )}
                </div>
                 {/* Rodapé padrão removido, pois os botões de ação estão dentro das seções condicionais */}
                 <div className="p-4 bg-gray-50 border-t flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Fechar</button>
                </div>
            </div>

            {/* Modal de confirmação para finalizar obra (BUG CORRIGIDO) */}
            {isFinishObraModalOpen && (
                <FinishObraModal
                    obra={obraToFinalize}
                    // CORREÇÃO: O 'onClose' (botão "Não") agora também chama a desalocação, mas sem finalizar a obra
                    onClose={() => {
                        setIsFinishObraModalOpen(false);
                        handleDeallocate(false); // Apenas desaloca o veículo
                    }}
                    // Ao confirmar, chama handleDeallocate com shouldFinalize=true
                    onConfirm={(dataFim) => {
                        setIsFinishObraModalOpen(false); // Fecha este modal
                        handleDeallocate(true, dataFim); // Chama desalocação finalizando a obra
                    }}
                />
            )}
        </div>
    );
};


// Modal para perguntar se deseja finalizar a obra (Componente filho, sem mudança)
const FinishObraModal = ({ obra, onClose, onConfirm }) => {
    const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4"> {/* Aumenta z-index */}
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-6 border-b">
                    <h2 className="text-xl font-bold">Finalizar Obra?</h2>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-gray-700 text-sm">Este é o último veículo ativo na obra "{obra?.nome || ''}". Deseja marcar a obra como finalizada ao desalocar este veículo?</p>
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Data de Finalização da Obra</label>
                        <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-full p-2 border rounded mt-1 text-sm" />
                    </div>
                </div>
                <div className="p-4 bg-gray-50 border-t flex justify-end gap-4">
                    {/* Botão "Não" agora apenas fecha o modal, permitindo que handleDeallocate(false) seja chamado */}
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Não, Manter Obra Ativa</button>
                    {/* Botão "Sim" chama onConfirm passando a data */}
                    <button onClick={() => onConfirm(dataFim)} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 text-sm">Sim, Finalizar Obra</button>
                </div>
            </div>
        </div>
    );
};


// Modal de Histórico (Adaptado para API)
// ... (Modal HistoryModal sem mudança) ...
const HistoryModal = ({ vehicle, onClose, obras = [] }) => { // Adiciona valor padrão
    // Assume que vehicle.history é populado pela API (vinda da tabela vehicle_history)
    const history = useMemo(() => {
        if (!vehicle || !Array.isArray(vehicle.history)) return [];

        // Ordena o histórico recebido da API (mais recente primeiro)
        return [...vehicle.history].sort((a,b) => {
            const dateA = a.startDate ? new Date(a.startDate) : 0;
            const dateB = b.startDate ? new Date(b.startDate) : 0;
            return dateB - dateA; // Descendente
        });
    }, [vehicle]);

    // Função para renderizar detalhes (ajustada para API data)
    const renderHistoryDetail = (h) => {
        const details = h.details || {};
         // Formata datas da API
         const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleString('pt-BR') : 'N/A';
        const startDate = formatDate(h.startDate);
        const endDate = h.endDate ? formatDate(h.endDate) : 'Presente';

        switch(h.historyType || h.type) { // Usa historyType (nome da coluna API) ou type (nome antigo)
            case 'obra':
                 // Determina leitura com base nos campos existentes
                 const readingLabel = details.odometroEntrada != null ? 'Odômetro' : (details.horimetroEntrada != null ? 'Horímetro' : 'Leitura');
                 const readingIn = details.odometroEntrada ?? details.horimetroEntrada ?? 'N/A';
                 const readingOut = details.odometroSaida ?? details.horimetroSaida ?? 'N/A';

                return (
                    <>
                        <p className="font-semibold">Alocação em Obra: {details.obraNome || 'Não informado'}</p>
                        <p className="text-xs text-gray-600 mt-0.5">Funcionário: {details.employeeName || 'Não informado'}</p>
                        <p className="text-xs text-gray-600">Período: {startDate} - {endDate}</p>
                        <p className="text-xs text-gray-500 mt-1">{readingLabel} Entrada: {readingIn}</p>
                        {h.endDate && <p className="text-xs text-gray-500">{readingLabel} Saída: {readingOut}</p>}
                    </>
                );
            case 'operacional':
                return (
                     <>
                        <p className="font-semibold">Alocação Operacional: {details.subGroup || 'Não informado'}</p>
                        <p className="text-xs text-gray-600 mt-0.5">Funcionário: {details.employeeName || 'Não informado'}</p>
                        <p className="text-xs text-gray-600">Período: {startDate} - {endDate}</p>
                        {details.observacoes && <p className="text-xs text-gray-500 italic mt-1">Obs: "{details.observacoes}"</p>}
                    </>
                );
            case 'manutencao':
                 return (
                     <>
                        <p className="font-semibold">Manutenção</p>
                        <p className="text-xs text-gray-600 mt-0.5">Período: {startDate} - {endDate}</p>
                         {/* Detalhes podem ser string ou objeto */}
                        {details && typeof details === 'string' && <p className="text-xs text-gray-500 mt-1">{details}</p>}
                         {details && typeof details === 'object' && details.details && <p className="text-xs text-gray-500 mt-1">{details.details}</p>}
                    </>
                );
            default:
                return <p className="text-xs italic text-gray-400">Registro de tipo: {h.historyType || h.type || 'Desconhecido'}</p>;
        }
    };

    // Estilo da linha (mantido)
    const getHistoryStyle = (type) => {
         const historyType = type || 'desconhecido'; // Usa fallback
        switch(historyType.toLowerCase()) {
            case 'obra': return 'bg-green-50 border-l-4 border-green-500';
            case 'operacional': return 'bg-blue-50 border-l-4 border-blue-500';
            case 'manutencao': return 'bg-red-50 border-l-4 border-red-500';
            default: return 'bg-gray-100 border-l-4 border-gray-400';
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                {/* Cabeçalho */}
                <div className="p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold">Histórico Completo do Veículo</h2>
                        <p className="text-gray-600 text-sm">{vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo}</p>
                    </div>
                     <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={18}/></button>
                </div>
                 {/* Conteúdo Rolável */}
                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    {history.length > 0 ? (
                        <ul className="space-y-3">
                            {history.map((h, index) => (
                                // Usa um ID único se disponível, senão combina ID do veículo e timestamp
                                <li key={h.id || `${vehicle.id}-${h.startDate || index}`} className={`p-3 rounded-r-lg ${getHistoryStyle(h.historyType || h.type)}`}>
                                    {renderHistoryDetail(h)}
                                </li>
                             ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500 text-center italic">Nenhum histórico encontrado para este veículo.</p>
                    )}
                </div>
                 {/* Rodapé Fixo */}
                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};


export default VehiclePage;
