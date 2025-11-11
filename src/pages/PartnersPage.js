import React, { useState, useMemo } from 'react';
import {
    PlusCircle,
    Edit,
    Trash2,
    FileText,
    X,
    Loader,
    Droplet,
    Truck,
    Fuel, // Importado do antigo
    Printer, // Importado do antigo
    ChevronDown, // Para ordenação
    ChevronUp // Para ordenação
} from 'lucide-react';
import ProtectedComponent from '../components/ProtectedComponent';
import { jsPDF } from 'jspdf'; // Importado do antigo
import autoTable from 'jspdf-autotable'; // Importado do antigo

// --- Página de Parceiros (Postos) ---
// Combina props de ambos os arquivos
const PartnersPage = ({
    user,
    partners = [],
    vehicles = [], // Adicionado para o relatório PDF
    refuelings = [],
    comboioTransactions = [],
    PasswordConfirmationModal,
    setAlertMessage,
    apiClient,
    reloadData,
}) => {
    // Estados do novo arquivo
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    
    // Estados do antigo arquivo (adicionados)
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);

    // Estados de item
    const [editingPartner, setEditingPartner] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [partnerForReport, setPartnerForReport] = useState(null);
    const [partnerForPrices, setPartnerForPrices] = useState(null); // Adicionado

    // *** NOVOS ESTADOS PARA FILTRO E ORDENAÇÃO ***
    const [filterText, setFilterText] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'razaoSocial', direction: 'ascending' });

    // Funções de Modal (combinadas)
    const openModal = (p = null) => { setEditingPartner(p); setIsModalOpen(true); };
    const openDeleteModal = (id) => { setItemToDelete({ id }); setIsDeleteModalOpen(true); };
    const openReportModal = (p) => { setPartnerForReport(p); setIsReportModalOpen(true); };
    const openPriceModal = (p) => { setPartnerForPrices(p); setIsPriceModalOpen(true); }; // Adicionado
    
    // Delete (do novo arquivo)
    const handleDelete = async () => {
        if (!itemToDelete) return;
        try {
            await apiClient.deletePartner(itemToDelete.id);
            setAlertMessage("Posto excluído com sucesso!");
            reloadData();
        } catch (error) {
            console.error("Erro ao excluir posto:", error);
            setAlertMessage(error.message || "Falha ao excluir o posto.");
        } finally {
            setItemToDelete(null);
            setIsDeleteModalOpen(false);
        }
    };

    // *** NOVA LÓGICA DE FILTRO E ORDENAÇÃO ***
    const filteredAndSortedPartners = useMemo(() => {
        let filteredItems = [...(partners || [])];

        // 1. Filtrar
        if (filterText) {
            filteredItems = filteredItems.filter(partner =>
                (partner.razaoSocial || '').toLowerCase().includes(filterText.toLowerCase()) ||
                (partner.cidade || '').toLowerCase().includes(filterText.toLowerCase())
            );
        }

        // 2. Ordenar
        if (sortConfig.key) {
            filteredItems.sort((a, b) => {
                const aValue = a[sortConfig.key] || '';
                const bValue = b[sortConfig.key] || '';
                
                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return filteredItems;
    }, [partners, filterText, sortConfig]);

    // Função para atualizar a ordenação
    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // Helper para ícone de ordenação
    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        if (sortConfig.direction === 'ascending') {
            return <ChevronUp size={14} className="ml-1" />;
        }
        return <ChevronDown size={14} className="ml-1" />;
    };


    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            {/* Cabeçalho (do novo arquivo) */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Postos e Parceiros</h1>
                <ProtectedComponent requiredPermission="editor">
                    <button onClick={() => openModal()} className="flex items-center gap-2 px-3 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg shadow hover:bg-yellow-500 transition text-sm">
                        <PlusCircle size={18} />Adicionar Posto
                    </button>
                </ProtectedComponent>
            </div>

            {/* *** NOVO FILTRO DE PESQUISA *** */}
            <div className="mb-4">
                <input
                    type="text"
                    placeholder="Filtrar por nome ou cidade..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="w-full p-2 border rounded-lg shadow-sm"
                />
            </div>

            {/* Lista de Postos (Layout do ANTIGO arquivo - MODIFICADO) */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
                {/* Cabeçalho Tabela Desktop (MODIFICADO) */}
                <div className="hidden md:grid grid-cols-7 gap-4 p-4 font-semibold text-xs text-gray-600 border-b bg-gray-50 uppercase tracking-wider">
                    <div className="col-span-2 cursor-pointer flex items-center" onClick={() => requestSort('razaoSocial')}>
                        Razão Social / Endereço {getSortIcon('razaoSocial')}
                    </div>
                    <div className="cursor-pointer flex items-center" onClick={() => requestSort('cidade')}>
                        Cidade {getSortIcon('cidade')}
                    </div>
                    <div>WhatsApp</div>
                    <div>Contato</div>
                    <div className="col-span-2 text-center">Ações</div>
                </div>

                {/* Linhas (MODIFICADO) */}
                {filteredAndSortedPartners.map(partner => (
                    <div key={partner.id} className="grid grid-cols-1 md:grid-cols-7 gap-y-2 gap-x-4 items-center p-3 md:p-4 border-b last:border-b-0 hover:bg-gray-50 text-sm">
                        {/* Col 1: Nome/Endereço */}
                        <div className="md:col-span-2">
                            <p className="font-bold text-gray-900">{partner.razaoSocial}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{partner.endereco}</p>
                        </div>
                         {/* Col 2: Cidade (NOVO) */}
                        <div>
                            <span className="font-medium text-gray-500 md:hidden">Cidade: </span>
                            {partner.cidade}
                        </div>
                         {/* Col 3: WhatsApp (Trocado por CNPJ) */}
                        <div>
                             <span className="font-medium text-gray-500 md:hidden">WhatsApp: </span>
                             {partner.whatsapp}
                        </div>
                         {/* Col 4: Contato */}
                        <div>
                             <span className="font-medium text-gray-500 md:hidden">Contato: </span>
                             <span className="block truncate" title={`${partner.contatoResponsavel || ''} ${partner.telefone ? `(${partner.telefone})` : ''}`}>
                                {partner.contatoResponsavel} {partner.telefone && `(${partner.telefone})`}
                             </span>
                        </div>
                        
                        {/* Col 5: Ações (Botões do ANTIGO arquivo + Excluir do NOVO) */}
                        <div className="md:col-span-2 flex flex-wrap gap-1 justify-start md:justify-center mt-2 md:mt-0">
                            <button onClick={() => openReportModal(partner)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-full transition-colors" title="Relatório de Abastecimentos"><FileText size={14} /></button>
                            <ProtectedComponent requiredPermission="editor">
                                <button onClick={() => openPriceModal(partner)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-gray-100 rounded-full transition-colors" title="Valores Combustíveis"><Fuel size={14} /></button>
                                <button onClick={() => openModal(partner)} className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-full transition-colors" title="Editar"><Edit size={14} /></button>
                            </ProtectedComponent>
                            <ProtectedComponent requiredPermission="admin">
                                <button onClick={() => openDeleteModal(partner.id)} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-full"><Trash2 size={14}/></button>
                            </ProtectedComponent>
                        </div>
                    </div>
                ))}
                {/* CORREÇÃO DO ERRO DE DEPLOY: A variável 'sortedPartners' não existe mais. Deve ser 'filteredAndSortedPartners'. */}
                {filteredAndSortedPartners.length === 0 && (
                    <p className="p-6 text-center text-gray-500 italic">Nenhum posto cadastrado.</p>
                )}
            </div>

            {/* Modais */}
            {isModalOpen && (
                <PartnerModal // Modal de Edição do ANTIGO arquivo
                    user={user} // Passando user, se necessário
                    partner={editingPartner}
                    onClose={() => setIsModalOpen(false)}
                    apiClient={apiClient}
                    reloadData={reloadData}
                    setAlertMessage={setAlertMessage}
                />
            )}
            {isPriceModalOpen && (
                <FuelPriceModal // Modal de Preços do ANTIGO arquivo (adaptado)
                    user={user} // Passando user, se necessário
                    partner={partnerForPrices}
                    onClose={() => setIsPriceModalOpen(false)}
                    apiClient={apiClient}
                    reloadData={reloadData}
                    setAlertMessage={setAlertMessage}
                />
            )}
            {isReportModalOpen && (
                <RefuelingReportModal // Modal de Relatório do NOVO arquivo (com adições)
                    partner={partnerForReport}
                    vehicles={vehicles} // Passando vehicles
                    refuelings={refuelings}
                    comboioTransactions={comboioTransactions}
                    onClose={() => setIsReportModalOpen(false)}
                />
            )}
            {isDeleteModalOpen && itemToDelete && (
                <PasswordConfirmationModal // Modal de Delete do NOVO arquivo
                    message="Confirme sua senha para excluir este posto. Todas as ordens de abastecimento e transações de comboio associadas perderão a referência (mas não serão excluídas)."
                    onConfirm={handleDelete}
                    onClose={() => setIsDeleteModalOpen(false)}
                    apiClient={apiClient}
                />
            )}
        </div>
    );
};

// --- Modal de Adicionar/Editar Posto (Copiado do ANTIGO arquivo) ---
// Este modal tem todos os campos de dados (contato, email, etc.)
const PartnerModal = ({ user, partner, onClose, setAlertMessage, apiClient, reloadData }) => {
    // Estado inicial (MODIFICADO)
    const [formData, setFormData] = useState({
        razaoSocial: partner?.razaoSocial || '',
        cnpj: partner?.cnpj || '',
        inscricaoEstadual: partner?.inscricaoEstadual || '',
        endereco: partner?.endereco || '',
        cidade: partner?.cidade || '', // *** NOVO CAMPO ***
        telefone: partner?.telefone || '',
        whatsapp: partner?.whatsapp || '',
        email: partner?.email || '',
        contatoResponsavel: partner?.contatoResponsavel || '',
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Submissão (Usa apiClient) (MODIFICADO)
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.razaoSocial) { // Simplificado, apenas razão social obrigatória
            setAlertMessage("A Razão Social é obrigatória.");
            return;
        }
        setIsSaving(true);
        const dataToSave = { ...formData };
        // Remove campos vazios
        Object.keys(dataToSave).forEach(key => { if (dataToSave[key] === '') dataToSave[key] = null; });

        try {
            if (partner) {
                await apiClient.updatePartner(partner.id, dataToSave);
                setAlertMessage(`Posto ${formData.razaoSocial} atualizado!`);
            } else {
                // *** REMOVENDO O "REMENDO" ***
                // Agora que o backend foi corrigido para aceitar o campo 'cidade'
                // e ignorar campos extras, podemos remover o 'delete'
                // e enviar o objeto completo.
                
                const dataForCreation = { ...dataToSave };

                // Adiciona a estrutura de preços que o endpoint de criação espera
                dataForCreation.fuel_prices = {
                    'Diesel S10': 0,
                    'Diesel S500': 0,
                    'Arla': 0,
                    'Gasolina Comum': 0,
                    'Gasolina Aditivada': 0
                };
                
                await apiClient.createPartner(dataForCreation);
                setAlertMessage(`Posto ${formData.razaoSocial} cadastrado!`);
            }
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao salvar posto:", error);
            setAlertMessage(error.message || "Erro ao salvar posto.");
        } finally {
            setIsSaving(false);
        }
    };

    // Renderização do Modal
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[95vh] flex flex-col my-auto">
                {/* Cabeçalho */}
                <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                    <h2 className="text-xl sm:text-2xl font-bold">{partner ? 'Editar Posto' : 'Adicionar Posto'}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                </div>
                {/* Formulário com scroll */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                    <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700">Razão Social *</label><input name="razaoSocial" value={formData.razaoSocial} onChange={handleChange} placeholder="Razão Social" required className="mt-1 p-2 border rounded w-full bg-white" /></div>
                        <div><label className="block font-medium text-gray-700">CNPJ</label><input name="cnpj" value={formData.cnpj} onChange={handleChange} placeholder="00.000.000/0000-00" className="mt-1 p-2 border rounded w-full bg-white" /></div>
                        <div><label className="block font-medium text-gray-700">Inscrição Estadual</label><input name="inscricaoEstadual" value={formData.inscricaoEstadual} onChange={handleChange} placeholder="Inscrição Estadual" className="mt-1 p-2 border rounded w-full bg-white" /></div>
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700">Endereço Completo</label><input name="endereco" value={formData.endereco} onChange={handleChange} placeholder="Rua, Número, Bairro, Cidade - UF" className="mt-1 p-2 border rounded w-full bg-white" /></div>
                        
                        {/* *** NOVO CAMPO CIDADE *** */}
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700">Cidade</label><input name="cidade" value={formData.cidade} onChange={handleChange} placeholder="Cidade - UF" className="mt-1 p-2 border rounded w-full bg-white" /></div>
                        
                        <div><label className="block font-medium text-gray-700">Telefone</label><input name="telefone" value={formData.telefone} onChange={handleChange} placeholder="(00) 0000-0000" className="mt-1 p-2 border rounded w-full bg-white" /></div>
                        <div><label className="block font-medium text-gray-700">WhatsApp</label><input name="whatsapp" value={formData.whatsapp} onChange={handleChange} placeholder="(00) 90000-0000" className="mt-1 p-2 border rounded w-full bg-white" /></div>
                        <div><label className="block font-medium text-gray-700">E-mail</label><input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="contato@posto.com" className="mt-1 p-2 border rounded w-full bg-white" /></div>
                        <div><label className="block font-medium text-gray-700">Contato Responsável</label><input name="contatoResponsavel" value={formData.contatoResponsavel} onChange={handleChange} placeholder="Nome do Contato" className="mt-1 p-2 border rounded w-full bg-white" /></div>
                    </div>
                     {/* Rodapé */}
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


// --- Modal de Preços de Combustível (Do ANTIGO arquivo, mas ADAPTADO para os campos do NOVO) ---
const FuelPriceModal = ({ user, partner, onClose, setAlertMessage, apiClient, reloadData }) => {
    // Estado para preços (campos do NOVO backend) (MODIFICADO)
    const [prices, setPrices] = useState({
        'Diesel S10': partner?.fuel_prices?.['Diesel S10']?.toString().replace('.', ',') || '',
        'Diesel S500': partner?.fuel_prices?.['Diesel S500']?.toString().replace('.', ',') || '',
        'Arla': partner?.fuel_prices?.['Arla']?.toString().replace('.', ',') || '',
        'Gasolina Comum': partner?.fuel_prices?.['Gasolina Comum']?.toString().replace('.', ',') || '', // *** NOVO ***
        'Gasolina Aditivada': partner?.fuel_prices?.['Gasolina Aditivada']?.toString().replace('.', ',') || '', // *** NOVO ***
    });
    const [isSaving, setIsSaving] = useState(false);

    const handlePriceChange = (e) => {
        const { name, value } = e.target;
        // Permite números, vírgula, até 3 decimais
        if (/^[\d,]*\d{0,3}$/.test(value) || value === '') {
             setPrices(prev => ({ ...prev, [name]: value.replace('.', ',') }));
        }
    };

    // Salva (Lógica do NOVO PartnerModal, adaptada)
    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        
        // Converte preços para números
        const numericPrices = Object.entries(prices).reduce((acc, [key, val]) => {
            acc[key] = parseFloat(val.replace(',', '.')) || 0; // Aceita vírgula e ponto
            return acc;
        }, {});

        try {
            // Chama a rota específica
            await apiClient.updatePartnerFuelPrices(partner.id, numericPrices);
            setAlertMessage("Preços atualizados com sucesso!");
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao salvar preços:", error);
            setAlertMessage(error.message || "Erro ao atualizar os preços.");
        } finally {
            setIsSaving(false);
        }
    };

    // Renderização (Estrutura do ANTIGO FuelPriceModal)
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                 {/* Cabeçalho */}
                 <div className="p-6 border-b flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold">Valores de Combustíveis</h2>
                        <p className="text-gray-600 text-sm">{partner.razaoSocial}</p>
                    </div>
                    {/* *** CORREÇÃO: Botão de fechar estava faltando *** */}
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                 </div>
                 {/* *** CORREÇÃO: <form> movido para envolver o conteúdo *** */}
                 {/* Formulário (Campos do NOVO backend) (MODIFICADO) */}
                <form onSubmit={handleSave}>
                    <div className="p-6 pt-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700">Diesel S10 (R$)</label>
                                <input name="Diesel S10" value={prices['Diesel S10']} onChange={handlePriceChange} type="text" inputMode="decimal" placeholder="0,00" className="w-full p-2 border rounded mt-1 text-sm"/>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700">Diesel S500 (R$)</label>
                                <input name="Diesel S500" value={prices['Diesel S500']} onChange={handlePriceChange} type="text" inputMode="decimal" placeholder="0,00" className="w-full p-2 border rounded mt-1 text-sm"/>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700">Arla (R$)</label>
                                <input name="Arla" value={prices['Arla']} onChange={handlePriceChange} type="text" inputMode="decimal" placeholder="0,00" className="w-full p-2 border rounded mt-1 text-sm"/>
                            </div>
                        </div>
                        {/* *** NOVOS CAMPOS DE COMBUSTÍVEL *** */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                             <div>
                                <label className="block text-xs font-medium text-gray-700">Gasolina Comum (R$)</label>
                                <input name="Gasolina Comum" value={prices['Gasolina Comum']} onChange={handlePriceChange} type="text" inputMode="decimal" placeholder="0,00" className="w-full p-2 border rounded mt-1 text-sm"/>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700">Gasolina Aditivada (R$)</label>
                                <input name="Gasolina Aditivada" value={prices['Gasolina Aditivada']} onChange={handlePriceChange} type="text" inputMode="decimal" placeholder="0,00" className="w-full p-2 border rounded mt-1 text-sm"/>
                            </div>
                        </div>
                    </div>
                     {/* Rodapé */}
                    <div className="p-4 bg-gray-50 border-t flex justify-end gap-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm">
                            {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar Preços'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Modal de Relatório (Do NOVO arquivo, mas com Filtro de Data e PDF do ANTIGO) ---
const RefuelingReportModal = ({ partner, vehicles = [], refuelings = [], comboioTransactions = [], onClose }) => {
    
    const today = new Date().toISOString().split('T')[0];
    const [dateRange, setDateRange] = useState({ start: '', end: today });

    // Processa e combina os dados (Lógica do NOVO, com filtro de data do ANTIGO)
    const { reportData, totals } = useMemo(() => {
        const data = [];
        const startDate = dateRange.start ? new Date(dateRange.start + 'T00:00:00Z') : null;
        const endDate = dateRange.end ? new Date(dateRange.end + 'T23:59:59Z') : null;

        // 1. Abastecimentos normais
        (refuelings || []).forEach(e => {
            const itemDate = new Date(e.data);
            if (e.partnerId !== partner.id || e.status !== 'Concluída') return;
            if (startDate && itemDate < startDate) return;
            if (endDate && itemDate > endDate) return;

            const outros = parseFloat(e.outrosValor) || 0;
            const litros = parseFloat(e.litrosAbastecidos) || 0;
            const precoUnit = parseFloat(partner.fuel_prices?.[e.fuelType] || 0);
            const valorCombustivel = litros * precoUnit;
            
            data.push({
                id: e.id,
                date: itemDate,
                type: 'Abastecimento',
                icon: <Droplet size={14} className="text-blue-500" />,
                description: `Auth: ${e.authNumber} (${e.vehicleInternalId || 'N/A'})`,
                vehicleName: e.vehicleInternalId || 'N/A', // Para PDF
                fuelType: e.fuelType,
                liters: litros,
                value: valorCombustivel,
                others: outros,
                total: valorCombustivel + outros
            });
        });

        // 2. Entradas de Comboio
        (comboioTransactions || []).forEach(e => {
            const itemDate = new Date(e.date);
            if (e.partnerId !== partner.id || e.type !== 'entrada') return;
            if (startDate && itemDate < startDate) return;
            if (endDate && itemDate > endDate) return;

            const total = parseFloat(e.valorTotal) || 0;
            const litros = parseFloat(e.liters) || 0;
            
            data.push({
                id: e.id,
                date: itemDate,
                type: 'Entrada Comboio',
                icon: <Truck size={14} className="text-green-500" />,
                description: `Comboio: ${e.comboioVehicleName || 'N/A'}`,
                vehicleName: e.comboioVehicleName || 'N/A', // Para PDF
                fuelType: e.fuelType,
                liters: litros,
                value: total,
                others: 0,
                total: total
            });
        });

        const sortedData = data.sort((a, b) => b.date - a.date);
        
        const totals = sortedData.reduce((acc, item) => {
            acc.liters += item.liters;
            acc.value += item.value;
            acc.others += item.others;
            acc.total += item.total;
            return acc;
        }, { liters: 0, value: 0, others: 0, total: 0 });

        return { reportData: sortedData, totals };
    }, [partner, refuelings, comboioTransactions, dateRange]); // Adicionado dateRange

    const formatDate = (date) => date ? new Date(date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A';

    // Função de Gerar PDF (do ANTIGO, adaptada para os dados do NOVO)
    const generateReportPDF = () => {
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text(`Relatório - ${partner.razaoSocial}`, 14, 22);
        doc.setFontSize(11);
        const startDateStr = dateRange.start ? new Date(dateRange.start + 'T12:00:00').toLocaleDateString('pt-BR') : 'Início';
        const endDateStr = dateRange.end ? new Date(dateRange.end + 'T12:00:00').toLocaleDateString('pt-BR') : 'Hoje';
        doc.text(`Período: ${startDateStr} a ${endDateStr}`, 14, 30);

        const head = [['Data', 'Tipo', 'Veículo', 'Comb.', 'Litros', 'Vl Comb.', 'Vl Outros', 'Vl Total']];
        const body = reportData.map(item => [
            formatDate(item.date),
            item.type,
            item.vehicleName,
            item.fuelType,
            item.liters.toFixed(2),
            `R$ ${item.value.toFixed(2)}`,
            `R$ ${item.others.toFixed(2)}`,
            `R$ ${item.total.toFixed(2)}`,
        ]);

        autoTable(doc, { 
            startY: 35, 
            head: head, 
            body: body, 
            theme: 'striped', 
            headStyles: { fillColor: [34, 139, 34] } // Verde
        });

        let finalY = (doc.lastAutoTable?.finalY || 35) + 10;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`TOTAIS DO PERÍODO:`, 14, finalY);
        finalY += 7;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Total Litros: ${totals.liters.toFixed(2)} L`, 14, finalY);
        doc.text(`Total Combustível: R$ ${totals.value.toFixed(2)}`, 60, finalY);
        doc.text(`Total Outros: R$ ${totals.others.toFixed(2)}`, 110, finalY);
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(220, 53, 69); // Vermelho
        doc.text(`VALOR TOTAL: R$ ${totals.total.toFixed(2)}`, 14, finalY + 7);

        doc.save(`Relatorio_${partner.razaoSocial.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold">Relatório de Abastecimento</h2>
                        <p className="text-gray-600 text-sm">{partner.razaoSocial}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={18}/></button>
                </div>
                
                {/* Filtros (do ANTIGO) */}
                <div className="p-4 sm:p-6 border-b flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                        <label className="block text-xs font-medium text-gray-700">Data Início</label>
                        <input type="date" value={dateRange.start} onChange={e => setDateRange(p => ({...p, start: e.target.value}))} className="mt-1 w-full p-2 border rounded-lg bg-gray-50 text-sm" />
                    </div>
                    <div className="flex-1 w-full">
                        <label className="block text-xs font-medium text-gray-700">Data Fim</label>
                        <input type="date" value={dateRange.end} onChange={e => setDateRange(p => ({...p, end: e.target.value}))} className="mt-1 w-full p-2 border rounded-lg bg-gray-50 text-sm" />
                    </div>
                    <button onClick={generateReportPDF} className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition text-sm w-full sm:w-auto" disabled={reportData.length === 0}>
                        <Printer size={16}/> Gerar PDF
                    </button>
                </div>

                {/* Conteúdo Rolável (do NOVO) */}
                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar text-sm">
                    {reportData.length > 0 ? (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Comb.</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Litros</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor Comb.</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Outros</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {reportData.map(item => (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 whitespace-nowrap">{formatDate(item.date)}</td>
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            <span className="flex items-center gap-2">{item.icon} {item.type}</span>
                                        </td>
                                        <td className="px-4 py-2">{item.description}</td>
                                        <td className="px-4 py-2">{item.fuelType}</td>
                                        <td className="px-4 py-2 text-right">{item.liters.toFixed(2)} L</td>
                                        <td className="px-4 py-2 text-right">R$ {item.value.toFixed(2)}</td>
                                        <td className="px-4 py-2 text-right">R$ {item.others.toFixed(2)}</td>
                                        <td className="px-4 py-2 text-right font-bold">R$ {item.total.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {/* Rodapé da Tabela com Totais */}
                            <tfoot className="bg-gray-100">
                                <tr className="font-bold text-gray-900">
                                    <td colSpan="4" className="px-4 py-3 text-right text-sm">TOTAIS</td>
                                    <td className="px-4 py-3 text-right text-sm">{totals.liters.toFixed(2)} L</td>
                                    <td className="px-4 py-3 text-right text-sm">R$ {totals.value.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right text-sm">R$ {totals.others.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right text-sm">R$ {totals.total.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    ) : (
                        <p className="text-gray-500 text-center italic py-10">Nenhum abastecimento concluído encontrado para este posto no período selecionado.</p>
                    )}
                </div>
                
                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};

export default PartnersPage;