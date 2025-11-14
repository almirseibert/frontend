import React, { useState, useMemo, useEffect } from 'react'; 
import apiClient from '../services/apiClient'; 
import {
    Edit,
    Clock,
    CheckCircle,
    X,
    Loader 
} from 'lucide-react';

import ProtectedComponent from '../components/ProtectedComponent';

// --- Função Auxiliar de Data (Nova) ---
// Verifica se a string da DB é uma data válida (não nula, não vazia, não '0000-00-00')
const isValidDbDate = (dateString) => {
    // Retorna true se a string for válida e começar com um ano razoável (ex: '2025-')
    return dateString && dateString.length > 8 && !dateString.startsWith('0000');
};

// --- Componente Principal ---
const RevisionsPage = ({
    user, vehicles = [], revisions = [], 
    setAlertMessage, vehicleGroups = {}, apiClient, reloadData 
}) => {
    // Estados da UI (sem mudanças)
    const [editingRevision, setEditingRevision] = useState(null); 
    const [completingRevision, setCompletingRevision] = useState(null); 
    const [historyModalVehicle, setHistoryModalVehicle] = useState(null); 
    const [searchTerm, setSearchTerm] = useState('');

    // Combina dados de veículos e revisões (usa props)
    const combinedData = useMemo(() => {
        const validVehicles = Array.isArray(vehicles) ? vehicles : [];
        const validRevisions = Array.isArray(revisions) ? revisions : [];

        const sortedVehicles = [...validVehicles].sort((a, b) => (a?.registroInterno || '').localeCompare(b?.registroInterno || ''));

        return sortedVehicles.map(vehicle => {
            if (!vehicle) return null; 
            
            // --- CORREÇÃO LISTAGEM (Legado/Novo) ---
            // O backend (getAllRevisionPlans) agora *sempre* envia o `vehicleId` correto.
            // Esta lógica não precisa mais da verificação dupla (r.id === vehicle.id)
            // porque o backend já "normalizou" os dados.
            const revision = validRevisions.find(r => r.vehicleId === vehicle.id) || { vehicleId: vehicle.id, historico: [] };
            
            return { ...vehicle, revision };
        }).filter(item => {
            if (!item) return false; 
            const searchLower = searchTerm.toLowerCase();
            return !searchLower || 
                   (item.placa || '').toLowerCase().includes(searchLower) ||
                   (item.registroInterno || '').toLowerCase().includes(searchLower) ||
                   (item.marca || '').toLowerCase().includes(searchLower) ||
                   (item.modelo || '').toLowerCase().includes(searchLower);
        });
    }, [vehicles, revisions, searchTerm]);

    // Obtém a leitura principal (ajustado para API data e fallback)
    const getLeituraPrincipal = (vehicle) => {
        const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
        const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(vehicle?.tipo));
        
        // Regras de Negócio (13/11/2025)
        if (vehicleGroup === 'Máquinas Pesadas' || vehicleGroup === 'Caminhões') {
            // Prioriza Digital > Analógico > Horímetro padrão
            const leitura = vehicle?.horimetroDigital ?? vehicle?.horimetroAnalogico ?? vehicle?.horimetro ?? 0;
            return `${parseFloat(leitura).toFixed(1)} Hr`; 
        }
        
        // "Caminhões de Trecho" (tipo "Caminhões Prancha") e "Veículos Leves"
        // (Assume que "Caminhões Prancha" está no grupo "Caminhões de Trecho" no App.js)
        const leitura = vehicle?.odometro ?? 0;
        return `${parseFloat(leitura).toFixed(1)} Km`; 
    };

     // Formata data da próxima revisão (usa new Date() com UTC e validação)
     const formatNextRevisionDate = (dateString) => {
         // --- CORREÇÃO (Validação) ---
         if (!isValidDbDate(dateString)) return 'N/A';
         try {
             // Usa new Date(dateString) que trata '2025-11-10' e '2025-11-10T15:00:00Z'
             return new Date(dateString).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
         } catch (e) { return 'Inválida'; }
     };

     // Formata próxima leitura (ajustado para Odometro/Horimetro)
     const formatNextRevisionReading = (revision, vehicleType) => {
        if (!revision) return 'N/A';
        
        const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
        const vehicleGroup = Object.keys(groups).find(group => group && groups[group]?.includes(vehicleType));
        
        // Regras de Negócio (13/11/2025)
        let reading, unit;
        if (vehicleGroup === 'Máquinas Pesadas' || vehicleGroup === 'Caminhões') {
            reading = revision.proximaRevisaoHorimetro;
            unit = 'Hr';
        } else {
            // Leves e Caminhões de Trecho
            reading = revision.proximaRevisaoOdometro;
            unit = 'Km';
        }

        if (reading == null || reading <= 0) return 'N/A';
        return `${parseFloat(reading).toFixed(1)} ${unit}`;
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
                    if (!item || !item.revision) return null;
                    
                    // Passa o objeto revision inteiro e o tipo do veículo
                    const nextDateStr = formatNextRevisionDate(item.revision.proximaRevisaoData);
                    const nextReadingStr = formatNextRevisionReading(item.revision, item.tipo);
                    
                    const hasScheduledRevision = nextDateStr !== 'N/A' || nextReadingStr !== 'N/A';
                    
                    // O backend já traduziu 'tipo' para 'descricao'
                    const description = item.revision.descricao || '-'; 

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
                            <div className="md:col-span-2 text-gray-700">{description}</div>
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
    const [currentReadingInput, setCurrentReadingInput] = useState(''); 
    const [isSaving, setIsSaving] = useState(false);

    const revision = vehicle?.revision;

    // Regras de Negócio (13/11/2025)
    const vehicleGroup = vehicle ? Object.keys(vehicleGroups).find(group => group && vehicleGroups[group]?.includes(vehicle.tipo)) : null;
    const isHourBased = vehicleGroup === 'Máquinas Pesadas' || vehicleGroup === 'Caminhões';
    
    let currentReadingValue = 0;
    let readingLabel = 'Leitura Atual';

    if (vehicle) { 
        if (isHourBased) {
            currentReadingValue = vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro ?? 0;
            readingLabel = 'Horímetro Atual (Hr)';
        } else { // Leves e Caminhões de Trecho
            currentReadingValue = vehicle.odometro ?? 0;
            readingLabel = 'Odômetro Atual (Km)';
        }
    }

    useEffect(() => {
        setCurrentReadingInput(currentReadingValue.toString());
    }, [currentReadingValue]); 

    if (!vehicle || !revision) return null; 

    const handleComplete = async () => {
        const readingFloat = parseFloat(currentReadingInput);
        if (currentReadingInput === '' || isNaN(readingFloat)) {
            setAlertMessage("Insira a leitura atual válida.");
            return;
        }

         // Validação Leitura vs Leitura Agendada
         const scheduledReading = (isHourBased ? revision?.proximaRevisaoHorimetro : revision?.proximaRevisaoOdometro) || 0;
         if (scheduledReading > 0 && readingFloat < scheduledReading) {
             setAlertMessage(`Leitura atual (${readingFloat}) < Leitura agendada (${scheduledReading}).`);
             return;
         }
         // Validação Leitura vs Leitura Atual do Veículo
         if (readingFloat < (currentReadingValue - 0.1) ) { 
             setAlertMessage(`Leitura atual informada (${readingFloat}) é menor que a leitura registrada no veículo (${currentReadingValue}). Verifique a leitura.`);
             return;
         }

        setIsSaving(true);
        
        // O backend espera 'descricao' (que vem do 'tipo' do plano)
        const description = revision.descricao || 'Revisão Padrão';

        const dataParaApi = {
            vehicleId: revision.vehicleId, // O backend já normalizou o vehicleId
            isHourBased: isHourBased, // Informa o backend onde salvar (odometro/horimetro)
            leituraRealizada: readingFloat,
            realizadaEm: new Date().toISOString(), 
            realizadaPor: user?.email || 'Sistema', 
            descricao: description, // Envia a descrição
        };

        try {
            // A API /revisions/complete espera (data)
            await apiClient.completeRevision(dataParaApi);

            setAlertMessage('Revisão concluída!');
            reloadData(); 
            onClose();
        } catch (error) {
            console.error("Erro ao concluir revisão:", error);
            setAlertMessage(error.message || "Falha ao concluir a revisão.");
        } finally {
            setIsSaving(false);
        }
    };

    // Renderização do Modal
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
                    {/* O backend já traduziu 'tipo' para 'descricao' */}
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
    
    // Regras de Negócio (13/11/2025)
    const vehicleGroup = vehicle ? Object.keys(vehicleGroups).find(group => group && vehicleGroups[group]?.includes(vehicle.tipo)) : null;
    const isHourBased = vehicleGroup === 'Máquinas Pesadas' || vehicleGroup === 'Caminhões';
    const readingUnit = isHourBased ? 'Hr' : 'Km';

    // Estado inicial
    const [formData, setFormData] = useState({
        proximaRevisaoData: '',
        leituraUnica: '', // Campo unificado para Horímetro ou Odômetro
        avisoAntecedenciaDias: '',
        avisoAntecedenciaKmHr: '',
        descricao: '',
    });
    const [isSaving, setIsSaving] = useState(false);
    
    const revision = vehicle?.revision;

    // Efeito para carregar dados do agendamento (CORRIGIDO)
    useEffect(() => {
        if (revision) {
            // Define a leitura agendada (seja horimetro ou odometro)
            const leituraAgendada = (isHourBased 
                ? (revision.proximaRevisaoHorimetro?.toString() || '') 
                : (revision.proximaRevisaoOdometro?.toString() || ''));

            // --- CORREÇÃO (Linha 338) ---
            // Valida a data antes de tentar usá-la
            const dbDate = revision.proximaRevisaoData;
            const dataValidaFormatada = isValidDbDate(dbDate) 
                ? new Date(dbDate).toISOString().split('T')[0] 
                : '';
            // --- Fim da Correção ---

            setFormData({
                proximaRevisaoData: dataValidaFormatada,
                leituraUnica: leituraAgendada,
                avisoAntecedenciaDias: revision.avisoAntecedenciaDias?.toString() || '',
                avisoAntecedenciaKmHr: revision.avisoAntecedenciaKmHr?.toString() || '',
                descricao: revision.descricao || '', // Backend já traduziu 'tipo' para 'descricao'
            });
        }
    }, [revision, isHourBased]); // Depende do objeto revision e do tipo de leitura

    if (!vehicle || !revision) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Salvar (Usa apiClient)
    const handleSave = async (e) => {
        e.preventDefault();
         if (!formData.proximaRevisaoData && !formData.leituraUnica) {
             setAlertMessage("Preencha a Data ou a Leitura da próxima revisão.");
             return;
         }
         
         // Validação Leitura vs Leitura Atual
         const proxLeitura = parseFloat(formData.leituraUnica) || 0;
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
        
        // Prepara dados para API (envia campos separados)
        const dataToUpdate = {
            proximaRevisaoData: formData.proximaRevisaoData || null, 
            proximaRevisaoOdometro: !isHourBased ? (parseFloat(formData.leituraUnica) || null) : null,
            proximaRevisaoHorimetro: isHourBased ? (parseFloat(formData.leituraUnica) || null) : null,
            avisoAntecedenciaDias: parseInt(formData.avisoAntecedenciaDias, 10) || null,
            avisoAntecedenciaKmHr: parseFloat(formData.avisoAntecedenciaKmHr) || null,
            descricao: formData.descricao || null, // Backend vai traduzir para 'tipo'
        };
        try {
            // O backend (updateRevisionPlan) espera o vehicleId
            await apiClient.updateRevisionPlan(revision.vehicleId, dataToUpdate); 
            setAlertMessage("Agendamento salvo!");
            reloadData(); 
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
                            <label className="block font-medium text-gray-700 mb-1">Próxima Revisão ({readingUnit})</label>
                            <input type="number" step="any" name="leituraUnica" value={formData.leituraUnica} onChange={handleChange} className="w-full p-2 border rounded-lg bg-gray-50" placeholder="Leitura"/>
                        </div>
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Avisar (Dias antes)</label>
                            <input type="number" name="avisoAntecedenciaDias" value={formData.avisoAntecedenciaDias} onChange={handleChange} className="w-full p-2 border rounded-lg bg-gray-50" placeholder="Ex: 7"/>
                        </div>
                        <div>
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

// Modal de Histórico (CORRIGIDO)
const RevisionHistoryModal = ({ vehicle, onClose, vehicleGroups }) => {
    if (!vehicle || !vehicle.revision) return null;
    
    // Regras de Negócio (13/11/2025)
    const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
    const vehicleGroup = Object.keys(groups).find(group => group && groups[group]?.includes(vehicle.tipo));
    const isHourBased = vehicleGroup === 'Máquinas Pesadas' || vehicleGroup === 'Caminhões';
    const readingUnit = isHourBased ? 'Hr' : 'Km';

    // O backend (getAllRevisionPlans) já injetou o 'historico' correto
    const history = Array.isArray(vehicle.revision.historico) ? vehicle.revision.historico : [];

    const formatHistoryDate = (dateString) => {
        // --- CORREÇÃO (Validação) ---
        if (!isValidDbDate(dateString)) return 'N/A';
        try {
            return new Date(dateString).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        } catch (e) { return 'Inválida'; }
    };

    // Formata a leitura (Odometro ou Horimetro) do histórico
    const formatHistoryReading = (historyEntry) => {
        const reading = isHourBased ? historyEntry.horimetro : historyEntry.odometro;
        if (reading == null) return 'N/A';
        return `${parseFloat(reading).toFixed(1)} ${readingUnit}`;
    };

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
                            {/* Ordena histórico (realizadaEm ou data) */}
                            {[...history].sort((a,b) => new Date(b.realizadaEm || b.data) - new Date(a.realizadaEm || a.data)).map((h, index) => (
                                <li key={index} className="p-3 bg-gray-50 rounded-lg border text-sm">
                                    <p className="font-semibold">{h.descricao || 'Revisão Padrão'}</p>
                                    <p className="text-xs text-gray-600 mt-1">
                                        Realizada em: {formatHistoryDate(h.realizadaEm || h.data)} por {h.realizadaPor || 'N/A'}
                                    </p>
                                    <p className="text-xs text-gray-600">
                                        Leitura Realizada: {formatHistoryReading(h)}
                                    </p>
                                </li>
                            ))}
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