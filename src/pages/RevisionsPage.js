import React, { useState, useMemo, useEffect } from 'react'; // Importa useEffect
// import apiClient from '../services/apiClient'; // Comentado pois vem via props
import {
    Edit,
    Clock,
    CheckCircle,
    X,
    Loader // Adicionado Loader
} from 'lucide-react';

// Importa o componente de proteção
import ProtectedComponent from '../components/ProtectedComponent';

// --- Componente Principal ---
const RevisionsPage = ({
    user, vehicles = [], revisions = [], // Dados via props
    setAlertMessage, vehicleGroups = {}, apiClient, reloadData // API e Funções via props
}) => {
    // Estados da UI (sem mudanças)
    const [editingRevision, setEditingRevision] = useState(null); // Guarda { ...vehicle, revision }
    const [completingRevision, setCompletingRevision] = useState(null); // Guarda { ...vehicle, revision }
    const [historyModalVehicle, setHistoryModalVehicle] = useState(null); // Guarda { ...vehicle, revision }
    const [searchTerm, setSearchTerm] = useState('');

    // Combina dados de veículos e revisões (usa props)
    const combinedData = useMemo(() => {
        // Garante que vehicles e revisions são arrays
        const validVehicles = Array.isArray(vehicles) ? vehicles : [];
        const validRevisions = Array.isArray(revisions) ? revisions : [];

        const sortedVehicles = [...validVehicles].sort((a, b) => (a?.registroInterno || '').localeCompare(b?.registroInterno || ''));

        return sortedVehicles.map(vehicle => {
            if (!vehicle) return null; // Pula inválidos
            // Encontra a revisão ou cria objeto vazio com vehicleId
            const revision = validRevisions.find(r => r.vehicleId === vehicle.id) || { vehicleId: vehicle.id, historico: [] };
            return { ...vehicle, revision }; // Combina dados do veículo com sua revisão
        }).filter(item => {
            if (!item) return false; // Remove nulos
            // Filtra pela busca
            const searchLower = searchTerm.toLowerCase();
            return !searchLower || // Se não houver busca, inclui todos
                   (item.placa || '').toLowerCase().includes(searchLower) ||
                   (item.registroInterno || '').toLowerCase().includes(searchLower) ||
                   (item.marca || '').toLowerCase().includes(searchLower) ||
                   (item.modelo || '').toLowerCase().includes(searchLower);
        });
    }, [vehicles, revisions, searchTerm]);

    // Obtém a leitura principal (sem mudanças)
    const getLeituraPrincipal = (vehicle) => {
        const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
        const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(vehicle?.tipo));
        // Usa ?? para fallback seguro
        if (vehicleGroup === 'Máquinas Pesadas') {
            const leitura = vehicle?.horimetroDigital ?? vehicle?.horimetroAnalogico ?? vehicle?.horimetro ?? 0;
            return `${parseFloat(leitura).toFixed(1)} Hr`; // Formata com 1 decimal
        }
        if (vehicleGroup === 'Caminhões') {
            const leitura = vehicle?.horimetro ?? 0; // Prioriza horímetro para revisão
            return `${parseFloat(leitura).toFixed(1)} Hr`; // Formata com 1 decimal
        }
        // Leves ou outros
        const leitura = vehicle?.odometro ?? 0;
        return `${parseFloat(leitura).toFixed(1)} Km`; // Formata com 1 decimal
    };

     // Formata data da próxima revisão (sem mudanças)
     const formatNextRevisionDate = (dateString) => {
         if (!dateString) return 'N/A';
         try {
             // Adiciona T12:00:00Z para evitar problemas de fuso no toLocaleDateString
             return new Date(dateString + 'T12:00:00Z').toLocaleDateString('pt-BR');
         } catch (e) { return 'Inválida'; }
     };

     // Formata próxima leitura (sem mudanças)
     const formatNextRevisionReading = (reading, vehicleType) => {
        if (reading == null || reading <= 0) return 'N/A'; // Verifica null ou 0
        const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
        const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(vehicleType));
        const unit = (vehicleGroup === 'Máquinas Pesadas' || vehicleGroup === 'Caminhões') ? 'Hr' : 'Km';
        return `${parseFloat(reading).toFixed(1)} ${unit}`; // Formata com 1 decimal
     };

    // Renderização Principal
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Agendamento de Revisões</h1>
            {/* Busca */}
            <div className="mb-6 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
                <input
                    type="text"
                    placeholder="Buscar por registro, placa, marca ou modelo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 focus:ring-yellow-500 text-sm"
                />
            </div>
            {/* Tabela */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
                 {/* Cabeçalho Desktop */}
                <div className="hidden md:grid grid-cols-8 gap-4 p-4 font-semibold text-xs text-gray-600 border-b bg-gray-50 uppercase tracking-wider">
                    <div className="col-span-2">Veículo</div>
                    <div className="text-right">Leitura Atual</div>
                    <div className="text-center">Próx. Data</div>
                    <div className="text-right">Próx. Leitura</div>
                    <div className="col-span-2">Descrição</div>
                    <div className="text-center">Ações</div>
                </div>
                 {/* Linhas */}
                {combinedData.map(item => {
                    // Garante que item e item.revision existam
                    if (!item || !item.revision) return null;

                    // --- CORREÇÃO LISTAGEM (Início) ---
                    // Determina qual leitura de REVISÃO usar
                    const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
                    const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(item?.tipo));
                    const isHourBased = (vehicleGroup === 'Máquinas Pesadas' || vehicleGroup === 'Caminhões');
                    
                    // Pega a leitura correta (Horimetro ou Odometro)
                    const nextReadingValue = isHourBased 
                        ? item.revision.proximaRevisaoHorimetro 
                        : item.revision.proximaRevisaoOdometro;

                    const nextDateStr = formatNextRevisionDate(item.revision.proximaRevisaoData);
                    // Passa o valor correto (seja ele Hr ou Km) para a função de formatação
                    const nextReadingStr = formatNextRevisionReading(nextReadingValue, item.tipo); 
                    // --- CORREÇÃO LISTAGEM (Fim) ---

                    const hasScheduledRevision = nextDateStr !== 'N/A' || nextReadingStr !== 'N/A';

                    return (
                        <div key={item.id} className="grid grid-cols-1 md:grid-cols-8 gap-y-2 gap-x-4 items-center p-3 md:p-4 border-b last:border-b-0 hover:bg-gray-50 text-sm">
                            {/* Veículo */}
                            <div className="md:col-span-2">
                                <p className="font-bold text-gray-900">{item.registroInterno} - {item.marca} {item.modelo}</p>
                                <p className="text-xs text-gray-500">{item.placa}</p>
                            </div>
                            {/* Leitura Atual */}
                            <div className="text-left md:text-right font-semibold text-blue-600">{getLeituraPrincipal(item)}</div>
                             {/* Próxima Data */}
                            <div className="text-left md:text-center">{nextDateStr}</div>
                             {/* Próxima Leitura */}
                            <div className="text-left md:text-right">{nextReadingStr}</div>
                            {/* Descrição */}
                            <div className="md:col-span-2 text-gray-700">{item.revision.descricao || '-'}</div>
                            {/* Ações */}
                            <div className="flex gap-1 justify-start md:justify-center flex-wrap mt-2 md:mt-0">
                                <ProtectedComponent requiredPermission="editor">
                                    <button onClick={() => setEditingRevision(item)} className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-full transition-colors" title="Agendar/Editar"><Edit size={14} /></button>
                                     {hasScheduledRevision && <button onClick={() => setCompletingRevision(item)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-gray-100 rounded-full transition-colors" title="Concluir"><CheckCircle size={14} /></button>}
                                </ProtectedComponent>
                                <button onClick={() => setHistoryModalVehicle(item)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-full transition-colors" title="Histórico"><Clock size={14} /></button>
                            </div>
                        </div>
                    );
                })}
                 {/* Mensagem Vazia */}
                 {combinedData.length === 0 && (
                     <p className="p-6 text-center text-gray-500 italic">Nenhum veículo encontrado.</p>
                 )}
            </div>
            {/* Modais */}
            {editingRevision && <ScheduleRevisionModal user={user} vehicle={editingRevision} onClose={() => setEditingRevision(null)} setAlertMessage={setAlertMessage} vehicleGroups={vehicleGroups} apiClient={apiClient} reloadData={reloadData} />}
            {completingRevision && <CompleteRevisionModal user={user} vehicle={completingRevision} onClose={() => setCompletingRevision(null)} setAlertMessage={setAlertMessage} vehicleGroups={vehicleGroups} apiClient={apiClient} reloadData={reloadData} />}
            {historyModalVehicle && <RevisionHistoryModal vehicle={historyModalVehicle} onClose={() => setHistoryModalVehicle(null)} vehicleGroups={vehicleGroups} />}
        </div>
    );
};

// Modal para concluir revisão (Usa apiClient)
const CompleteRevisionModal = ({ user, vehicle, onClose, setAlertMessage, vehicleGroups, apiClient, reloadData }) => {
    // Hooks movidos para o topo
    const [currentReadingInput, setCurrentReadingInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Garante que vehicle e revision existam
    const revision = vehicle?.revision;

    // Determina leitura atual e label
    const vehicleGroup = vehicle ? Object.keys(vehicleGroups).find(group => group && vehicleGroups[group]?.includes(vehicle.tipo)) : null;
    let currentReadingValue = 0;
    let readingLabel = 'Leitura Atual';
    let readingKey = 'odometro'; // Default
    // --- CORREÇÃO: Determina se é Horímetro ---
    const isHourBased = (vehicleGroup === 'Máquinas Pesadas' || vehicleGroup === 'Caminhões');

    if (vehicle) {
        if (isHourBased) {
            currentReadingValue = vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro ?? 0;
            readingLabel = 'Horímetro Atual (Hr)';
            readingKey = vehicle.possuiHorimetroDigital ? 'horimetroDigital' : (vehicle.possuiHorimetroAnalogico ? 'horimetroAnalogico' : 'horimetro');
        } else { // Veículos Leves
            currentReadingValue = vehicle.odometro ?? 0;
            readingLabel = 'Odômetro Atual (Km)';
            readingKey = 'odometro';
        }
    }

    // Efeito para definir o valor inicial
    useEffect(() => {
        setCurrentReadingInput(currentReadingValue.toString());
    }, [currentReadingValue]); 

    // Early return
    if (!vehicle || !revision) return null; 


    const handleComplete = async () => {
        const readingFloat = parseFloat(currentReadingInput);
        if (currentReadingInput === '' || isNaN(readingFloat)) {
            setAlertMessage("Insira a leitura atual válida.");
            return;
        }

        // Validação: Leitura atual vs Leitura agendada (se houver)
        // --- CORREÇÃO: Pega a leitura agendada correta (Odometro ou Horimetro) ---
        const scheduledReading = (isHourBased ? revision?.proximaRevisaoHorimetro : revision?.proximaRevisaoOdometro) || 0;
        if (scheduledReading > 0 && readingFloat < scheduledReading) {
            setAlertMessage(`Leitura atual (${readingFloat}) < Leitura agendada (${scheduledReading}).`);
            return;
        }

        // Validação: Leitura atual vs Leitura do veículo (prevenção de erro)
        if (readingFloat < (currentReadingValue - 0.1) ) { 
            setAlertMessage(`Leitura atual informada (${readingFloat}) é menor que a leitura registrada no veículo (${currentReadingValue}). Verifique a leitura.`);
            return;
        }

        setIsSaving(true);
        // Prepara dados para o histórico
        const historyEntry = {
            leituraRealizada: readingFloat,
            realizadaEm: new Date().toISOString(), 
            realizadaPor: user?.email || 'Sistema',
            descricao: revision.descricao || 'Revisão Padrão',
        };

        try {
            // --- CORREÇÃO CONCLUIR (Início) ---
            // Adiciona a informação da unidade (Km/Hr) para o backend
            const dataParaApi = {
                vehicleId: revision.vehicleId,
                ...historyEntry,
                isHourBased: isHourBased // Envia se é Horímetro
            };
            // --- CORREÇÃO CONCLUIR (Fim) ---

            // Chama API (o apiClient.js aceita um objeto 'dataParaApi')
            await apiClient.completeRevision(dataParaApi);

            setAlertMessage('Revisão concluída!');
            reloadData(); // Recarrega dados globais
            onClose();
        } catch (error) {
            console.error("Erro ao concluir revisão:", error);
            setAlertMessage(error.message || "Falha ao concluir a revisão.");
        } finally {
            setIsSaving(false);
        }
    };

    // Renderização do Modal (sem mudanças)
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                {/* Cabeçalho */}
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Concluir Revisão</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                </div>
                {/* Corpo */}
                <div className="p-6 space-y-4 text-sm">
                    <p><strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.placa}</p>
                    <p><strong>Serviço Agendado:</strong> {revision?.descricao || 'N/A'}</p>
                    {/* Input Leitura Atual */}
                    <div>
                        <label className="block font-medium text-gray-700 mb-1">
                            {readingLabel} *
                        </label>
                        <input
                            type="number"
                            step="any"
                            value={currentReadingInput}
                            onChange={e => setCurrentReadingInput(e.target.value)}
                            className="w-full p-2 border rounded-lg bg-gray-50"
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">Informe a leitura no momento da conclusão da revisão.</p>
                    </div>
                </div>
                {/* Rodapé */}
                <div className="p-4 bg-gray-50 border-t flex justify-end gap-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Cancelar</button>
                    <button onClick={handleComplete} disabled={isSaving} className="px-4 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 disabled:bg-green-300 flex items-center justify-center gap-2 text-sm">
                        {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Concluir Revisão'}
                    </button>
                </div>
            </div>
        </div>
    );
};


// Modal para agendar revisão (Usa apiClient)
const ScheduleRevisionModal = ({ user, vehicle, onClose, setAlertMessage, vehicleGroups, apiClient, reloadData }) => {
    // Hooks movidos para o topo
    const [formData, setFormData] = useState({
        proximaRevisaoData: '',
        leituraUnica: '', // Campo único para Km ou Hr
        avisoAntecedenciaDias: '',
        avisoAntecedenciaKmHr: '',
        descricao: '',
    });
    const [isSaving, setIsSaving] = useState(false);
    
    // Garante que vehicle e revision existam
    const revision = vehicle?.revision;

    // Lógica da unidade
    const vehicleGroup = vehicle ? Object.keys(vehicleGroups).find(group => group && vehicleGroups[group]?.includes(vehicle.tipo)) : null;
    const isHourBased = vehicleGroup === 'Máquinas Pesadas' || vehicleGroup === 'Caminhões';
    const readingUnit = isHourBased ? 'Hr' : 'Km';

    // Efeito para definir o formData
    useEffect(() => {
        if (revision) {
            // --- CORREÇÃO AGENDAMENTO (Início) ---
            // Define o valor do campo 'leituraUnica' com base no tipo de veículo
            const leituraAgendada = isHourBased 
                ? (revision.proximaRevisaoHorimetro?.toString() || '') 
                : (revision.proximaRevisaoOdometro?.toString() || '');
            // --- CORREÇÃO AGENDAMENTO (Fim) ---

            setFormData({
                // --- CORREÇÃO (Linha 338) ---
                // Remove a concatenação de 'T12:00:00Z'.
                // new Date() consegue tratar tanto '2025-11-10' (string de data)
                // quanto '2025-11-10T15:00:00Z' (string de timestamp).
                // A concatenação quebrava o segundo caso (timestamp completo).
                proximaRevisaoData: revision.proximaRevisaoData ? new Date(revision.proximaRevisaoData).toISOString().split('T')[0] : '', 
                // --- Fim da Correção ---
                leituraUnica: leituraAgendada, // Usa o campo único
                avisoAntecedenciaDias: revision.avisoAntecedenciaDias?.toString() || '',
                avisoAntecedenciaKmHr: revision.avisoAntecedenciaKmHr?.toString() || '',
                descricao: revision.descricao || '',
            });
        }
    }, [revision, isHourBased]); // Adiciona isHourBased como dependência

    // Early return
    if (!vehicle || !revision) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Salvar (Usa apiClient)
    const handleSave = async (e) => {
        e.preventDefault();
         if (!formData.proximaRevisaoData && !formData.leituraUnica) { // Valida campo único
             setAlertMessage("Preencha a Data ou a Leitura da próxima revisão.");
             return;
         }
         
         // Validação Leitura vs Leitura Atual
         const proxLeitura = parseFloat(formData.leituraUnica) || 0; // Usa campo único
         let currentReadingValue = 0;
         if (isHourBased) {
             currentReadingValue = parseFloat(vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro ?? 0);
         } else {
             currentReadingValue = parseFloat(vehicle.odometro ?? 0);
         }
         
         if (proxLeitura > 0 && proxLeitura <= currentReadingValue) {
             console.warn(`A próxima leitura (${proxLeitura}) é menor ou igual à leitura atual (${currentReadingValue}). Salvando mesmo assim.`);
         }

        setIsSaving(true);

        // --- CORREÇÃO AGENDAMENTO (Início) ---
        // Prepara dados para API, separando Km e Hr
        const dataToUpdate = {
            proximaRevisaoData: formData.proximaRevisaoData || null,
            // Envia o valor para a chave correta e zera a outra
            proximaRevisaoOdometro: !isHourBased ? proxLeitura : null, 
            proximaRevisaoHorimetro: isHourBased ? proxLeitura : null,
            avisoAntecedenciaDias: parseInt(formData.avisoAntecedenciaDias, 10) || null,
            avisoAntecedenciaKmHr: parseFloat(formData.avisoAntecedenciaKmHr) || null,
            descricao: formData.descricao || null,
        };
        // --- CORREÇÃO AGENDAMENTO (Fim) ---

        try {
            // O backend (updateRevisionPlan) já aceita chaves dinâmicas
            await apiClient.updateRevisionPlan(revision.vehicleId, dataToUpdate); // Usa vehicleId
            setAlertMessage("Agendamento salvo!");
            reloadData(); // Recarrega dados
            onClose();
        } catch (error) {
            console.error("Erro ao salvar agendamento:", error);
            setAlertMessage(error.message || "Erro ao salvar agendamento.");
        } finally {
            setIsSaving(false);
        }
    };

    // Renderização do Modal
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
                {/* Cabeçalho */}
                <div className="p-6 border-b flex justify-between items-center">
                     <h2 className="text-xl font-bold">Agendar Próxima Revisão</h2>
                     <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                </div>
                {/* Formulário */}
                <form onSubmit={handleSave}>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                         <p className="md:col-span-2 font-medium">Veículo: {vehicle.registroInterno} - {vehicle.placa}</p>
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Próxima Revisão (Data)</label>
                            <input type="date" name="proximaRevisaoData" value={formData.proximaRevisaoData} onChange={handleChange} className="w-full p-2 border rounded-lg bg-gray-50" />
                        </div>
                        <div>
                            {/* CORREÇÃO: Label e Name usam a unidade correta */}
                            <label className="block font-medium text-gray-700 mb-1">Próxima Revisão ({readingUnit})</label>
                            <input 
                                type="number" 
                                step="any" 
                                name="leituraUnica" // Usa o campo único
                                value={formData.leituraUnica} // Usa o campo único
                                onChange={handleChange} 
                                className="w-full p-2 border rounded-lg bg-gray-50" 
                                placeholder="Leitura"/>
                        </div>
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Avisar (Dias antes)</label>
                            <input type="number" name="avisoAntecedenciaDias" value={formData.avisoAntecedenciaDias} onChange={handleChange} className="w-full p-2 border rounded-lg bg-gray-50" placeholder="Ex: 7"/>
                        </div>
                        <div>
                            {/* CORREÇÃO: Label usa a unidade correta */}
                            <label className="block font-medium text-gray-700 mb-1">Avisar ({readingUnit} antes)</label>
                            <input type="number" step="any" name="avisoAntecedenciaKmHr" value={formData.avisoAntecedenciaKmHr} onChange={handleChange} className="w-full p-2 border rounded-lg bg-gray-50" placeholder="Ex: 500"/>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block font-medium text-gray-700 mb-1">Descrição do Serviço</label>
                            <input type="text" name="descricao" value={formData.descricao} onChange={handleChange} placeholder="Ex: Troca de óleo e filtros" className="w-full p-2 border rounded-lg bg-gray-50" />
                        </div>
                    </div>
                     {/* Rodapé */}
                    <div className="p-4 bg-gray-50 border-t flex justify-end gap-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm">
                             {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar Agendamento'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Modal de Histórico (Usa prop 'revision.historico', ajusta datas)
const RevisionHistoryModal = ({ vehicle, onClose, vehicleGroups }) => {
    // Garante que vehicle e revision existam
    if (!vehicle || !vehicle.revision) return null;
    // Pega o histórico do objeto revision (que veio da API)
    const history = Array.isArray(vehicle.revision.historico) ? vehicle.revision.historico : [];

    // Formata data do histórico (realizadaEm é ISO string da API)
    const formatHistoryDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            // Mostra data local baseada no timestamp ISO
            return new Date(dateString).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        } catch (e) { return 'Inválida'; }
    };

    // --- CORREÇÃO HISTÓRICO (Início) ---
    // Determina a unidade (Km ou Hr) para exibir a leitura correta do histórico
    const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
    const vehicleGroup = Object.keys(groups).find(group => group && groups[group]?.includes(vehicle.tipo));
    const isHourBased = vehicleGroup === 'Máquinas Pesadas' || vehicleGroup === 'Caminhões';
    const historyUnit = isHourBased ? 'Hr' : 'Km';
    // --- CORREÇÃO HISTÓRICO (Fim) ---


    // Renderização do Modal
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col my-auto">
                 {/* Cabeçalho */}
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold">Histórico de Revisões</h2>
                        <p className="text-gray-600 text-sm">{vehicle.registroInterno} - {vehicle.placa}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={18}/></button>
                </div>
                {/* Conteúdo */}
                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    {history.length > 0 ? (
                        <ul className="space-y-3">
                            {/* Ordena histórico (mais recente primeiro) */}
                            {[...history].sort((a,b) => new Date(b.realizadaEm) - new Date(a.realizadaEm)).map((h, index) => {
                                // --- CORREÇÃO HISTÓRICO (Início) ---
                                // Mostra a leitura correta (odometro ou horimetro)
                                const leituraRealizada = isHourBased ? h.horimetro : h.odometro;
                                // --- CORREÇÃO HISTÓRICO (Fim) ---

                                return (
                                <li key={index} className="p-3 bg-gray-50 rounded-lg border text-sm">
                                    <p className="font-semibold">{h.descricao || 'Revisão Padrão'}</p>
                                    <p className="text-xs text-gray-600 mt-1">
                                        Realizada em: {formatHistoryDate(h.realizadaEm)} por {h.realizadaPor || 'N/A'}
                                    </p>
                                    <p className="text-xs text-gray-600">
                                        {/* CORREÇÃO: Mostra a leitura e unidade corretas */}
                                        Leitura Realizada: {leituraRealizada != null ? `${parseFloat(leituraRealizada).toFixed(1)} ${historyUnit}` : 'N/A'}
                                    </p>
                                </li>
                            )})}
                        </ul>
                    ) : (
                        <p className="text-gray-500 text-center italic py-10">Nenhum histórico de revisão encontrado.</p>
                    )}
                </div>
                 {/* Rodapé */}
                 <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};

export default RevisionsPage;