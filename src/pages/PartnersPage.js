import React, { useState, useMemo } from 'react';
import apiClient from '../services/apiClient'; // Importa apiClient
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    PlusCircle,
    FileText,
    Fuel,
    Edit,
    X,
    Printer,
    Loader, // Adicionado Loader
    Trash2 // Adicionado para exclusão futura
} from 'lucide-react';

// Importa o componente de proteção e modais (via props)
import ProtectedComponent from '../components/ProtectedComponent';
// import { PasswordConfirmationModal } from '../App'; // Descomente se implementar exclusão

const PartnersPage = ({
    user, partners = [], // Recebe partners via props
    vehicles = [], refuelings = [], // Dados para relatório
    setAlertMessage, apiClient, reloadData, // Funções e API client via props
    PasswordConfirmationModal // Recebe modal de senha via props
}) => {
    // Estados da UI (sem mudanças)
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [editingPartner, setEditingPartner] = useState(null);
    const [partnerForPrices, setPartnerForPrices] = useState(null);
    const [partnerForReport, setPartnerForReport] = useState(null);
    // const [itemToDelete, setItemToDelete] = useState(null); // Para exclusão futura
    // const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); // Para exclusão futura

    // Ordena parceiros (usa 'partners' prop)
    const sortedPartners = useMemo(() => [...(partners || [])].sort((a, b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '')), [partners]);

    // Funções para abrir modais (sem mudanças)
    const openModal = (partner = null) => { setEditingPartner(partner); setIsModalOpen(true); };
    const openPriceModal = (partner) => { setPartnerForPrices(partner); setIsPriceModalOpen(true); };
    const openReportModal = (partner) => { setPartnerForReport(partner); setIsReportModalOpen(true); };
    // const openDeleteModal = (id) => { setItemToDelete(id); setIsDeleteModalOpen(true); }; // Para exclusão futura

    // // Função para excluir (USA API - Implementação futura)
    // const handleDelete = async () => {
    //     if (!itemToDelete) return;
    //     try {
    //         await apiClient.deletePartner(itemToDelete);
    //         setAlertMessage("Posto parceiro excluído com sucesso.");
    //         reloadData();
    //     } catch (error) {
    //         console.error("Erro ao excluir parceiro:", error);
    //         setAlertMessage(error.message || "Falha ao excluir parceiro.");
    //     } finally {
    //         setIsDeleteModalOpen(false);
    //         setItemToDelete(null);
    //     }
    // };

    // Renderização Principal
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            {/* Cabeçalho */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Postos Parceiros</h1>
                <ProtectedComponent requiredPermission="editor">
                    <button onClick={() => openModal()} className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg shadow hover:bg-yellow-500 transition w-full sm:w-auto justify-center text-sm">
                        <PlusCircle size={18} />Adicionar Posto
                    </button>
                </ProtectedComponent>
            </div>
            {/* Lista/Tabela */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
                {/* Cabeçalho Tabela Desktop */}
                <div className="hidden md:grid grid-cols-6 gap-4 p-4 font-semibold text-xs text-gray-600 border-b bg-gray-50 uppercase tracking-wider">
                    <div className="col-span-2">Razão Social / Endereço</div>
                    <div>CNPJ</div>
                    <div>Contato</div>
                    <div className="col-span-2 text-center">Ações</div>
                </div>
                {/* Linhas */}
                {sortedPartners.map(partner => (
                    <div key={partner.id} className="grid grid-cols-1 md:grid-cols-6 gap-y-2 gap-x-4 items-center p-3 md:p-4 border-b last:border-b-0 hover:bg-gray-50 text-sm">
                        {/* Col 1: Nome/Endereço */}
                        <div className="md:col-span-2">
                            <p className="font-bold text-gray-900">{partner.razaoSocial}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{partner.endereco}</p>
                        </div>
                         {/* Col 2: CNPJ */}
                        <div>
                            <span className="font-medium text-gray-500 md:hidden">CNPJ: </span>
                            {partner.cnpj}
                        </div>
                         {/* Col 3: Contato */}
                        <div>
                             <span className="font-medium text-gray-500 md:hidden">Contato: </span>
                             <span className="block truncate" title={`${partner.contatoResponsavel || ''} ${partner.telefone ? `(${partner.telefone})` : ''}`}>
                                {partner.contatoResponsavel} {partner.telefone && `(${partner.telefone})`}
                             </span>
                        </div>
                         {/* Col 4: Ações */}
                        <div className="md:col-span-2 flex flex-wrap gap-1 justify-start md:justify-center mt-2 md:mt-0">
                            <button onClick={() => openReportModal(partner)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-full transition-colors" title="Relatório de Abastecimentos"><FileText size={14} /></button>
                            <ProtectedComponent requiredPermission="editor">
                                <button onClick={() => openPriceModal(partner)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-gray-100 rounded-full transition-colors" title="Valores Combustíveis"><Fuel size={14} /></button>
                                <button onClick={() => openModal(partner)} className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-full transition-colors" title="Editar"><Edit size={14} /></button>
                                {/* Botão Excluir (Futuro) */}
                                {/* <ProtectedComponent requiredPermission="admin">
                                    <button onClick={() => openDeleteModal(partner.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-full transition-colors" title="Excluir"><Trash2 size={14} /></button>
                                </ProtectedComponent> */}
                            </ProtectedComponent>
                        </div>
                    </div>
                ))}
                 {/* Mensagem Vazia */}
                 {sortedPartners.length === 0 && (
                    <p className="p-6 text-center text-gray-500 italic">Nenhum posto parceiro cadastrado.</p>
                )}
            </div>
            {/* Modais */}
            {isModalOpen && <PartnerModal user={user} partner={editingPartner} onClose={() => setIsModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} />}
            {isPriceModalOpen && <FuelPriceModal user={user} partner={partnerForPrices} onClose={() => setIsPriceModalOpen(false)} setAlertMessage={setAlertMessage} apiClient={apiClient} reloadData={reloadData} />}
            {isReportModalOpen && <PartnerReportModal partner={partnerForReport} vehicles={vehicles} refuelings={refuelings} onClose={() => setIsReportModalOpen(false)} />}
             {/* Modal Exclusão (Futuro) */}
            {/* {isDeleteModalOpen && itemToDelete &&
                <PasswordConfirmationModal
                    message={`Confirme sua senha para EXCLUIR o posto ${partners.find(p=>p.id === itemToDelete)?.razaoSocial}.`}
                    onConfirm={handleDelete}
                    onClose={() => setIsDeleteModalOpen(false)}
                    apiClient={apiClient}
                />} */}
        </div>
    );
};

// Modal de Criação/Edição de Parceiro (Usa apiClient)
const PartnerModal = ({ user, partner, onClose, setAlertMessage, apiClient, reloadData }) => {
    // Estado inicial (sem mudanças)
    const [formData, setFormData] = useState({
        razaoSocial: partner?.razaoSocial || '',
        cnpj: partner?.cnpj || '',
        inscricaoEstadual: partner?.inscricaoEstadual || '',
        endereco: partner?.endereco || '',
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

    // Submissão (Usa apiClient)
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.razaoSocial || !formData.cnpj) {
            setAlertMessage("Razão Social e CNPJ são obrigatórios.");
            return;
        }
        setIsSaving(true);
        // O backend cuida de 'ultimaAlteracao' e inicializa 'fuel_prices' na criação
        const dataToSave = { ...formData };
        // Remove campos vazios se a API preferir assim
        Object.keys(dataToSave).forEach(key => { if (dataToSave[key] === '') dataToSave[key] = null; });

        try {
            if (partner) {
                await apiClient.updatePartner(partner.id, dataToSave);
                setAlertMessage(`Posto ${formData.razaoSocial} atualizado!`);
            } else {
                await apiClient.createPartner(dataToSave);
                setAlertMessage(`Posto ${formData.razaoSocial} cadastrado!`);
            }
            reloadData(); // Recarrega a lista
            onClose();
        } catch (error) {
            console.error("Erro ao salvar posto:", error);
            setAlertMessage(error.message || "Erro ao salvar posto.");
        } finally {
            setIsSaving(false);
        }
    };

    // Renderização do Modal (sem mudanças na estrutura)
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
                        <div><label className="block font-medium text-gray-700">CNPJ *</label><input name="cnpj" value={formData.cnpj} onChange={handleChange} placeholder="00.000.000/0000-00" required className="mt-1 p-2 border rounded w-full bg-white" /></div>
                        <div><label className="block font-medium text-gray-700">Inscrição Estadual</label><input name="inscricaoEstadual" value={formData.inscricaoEstadual} onChange={handleChange} placeholder="Inscrição Estadual" className="mt-1 p-2 border rounded w-full bg-white" /></div>
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700">Endereço Completo</label><input name="endereco" value={formData.endereco} onChange={handleChange} placeholder="Rua, Número, Bairro, Cidade - UF" className="mt-1 p-2 border rounded w-full bg-white" /></div>
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

// Modal de Preços (Usa apiClient)
const FuelPriceModal = ({ user, partner, onClose, setAlertMessage, apiClient, reloadData }) => {
    // Inicializa com preços existentes (campo `fuel_prices` da API) ou strings vazias
    const [prices, setPrices] = useState({
        gasolinaComum: partner?.fuel_prices?.gasolinaComum?.toString().replace('.', ',') || '',
        gasolinaAditivada: partner?.fuel_prices?.gasolinaAditivada?.toString().replace('.', ',') || '',
        dieselComum: partner?.fuel_prices?.dieselComum?.toString().replace('.', ',') || '',
        dieselS10: partner?.fuel_prices?.dieselS10?.toString().replace('.', ',') || '',
        arla: partner?.fuel_prices?.arla?.toString().replace('.', ',') || '',
    });
    const [isSaving, setIsSaving] = useState(false);

    // Permite vírgula no input
    const handleChange = (e) => {
        const { name, value } = e.target;
        // Permite números, vírgula ou ponto, até 3 decimais
        if (/^[\d,\.]*\d{0,3}$/.test(value) || value === '') {
            setPrices(prev => ({ ...prev, [name]: value }));
        }
    };

    // Salva (Usa apiClient)
    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        // Converte preços para número (usando ponto) antes de enviar
        const pricesToSave = Object.entries(prices).reduce((acc, [key, value]) => {
            const cleanedValue = (value || '').trim().replace(',', '.'); // Garante ponto
            const numValue = parseFloat(cleanedValue);
            // Salva null se vazio, senão número (ou 0 se inválido)
            acc[key] = cleanedValue === '' ? null : (isNaN(numValue) ? 0 : numValue);
            return acc;
        }, {});

        try {
            // Chama a rota específica `updatePartnerFuelPrices`
            await apiClient.updatePartnerFuelPrices(partner.id, pricesToSave);
            setAlertMessage("Preços atualizados com sucesso!");
            reloadData(); // Recarrega dados
            onClose();
        } catch (error) {
            console.error("Erro ao salvar preços:", error);
            setAlertMessage(error.message || "Erro ao atualizar os preços.");
        } finally {
            setIsSaving(false);
        }
    };

    // Renderização do Modal (sem mudanças na estrutura)
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                 {/* Cabeçalho */}
                 <div className="p-6 border-b flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold">Valores de Combustíveis</h2>
                        <p className="text-gray-600 text-sm">{partner.razaoSocial}</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                 </div>
                 {/* Formulário */}
                <form onSubmit={handleSave}>
                    <div className="p-6 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        {Object.keys(prices).map(fuelType => {
                             let label = fuelType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                             if (fuelType === 'dieselS10') label = 'Diesel S10';
                             return (
                                <div key={fuelType}>
                                    <label className="block font-medium text-gray-700">{label}</label>
                                    <input
                                        type="text" inputMode="decimal" name={fuelType}
                                        value={prices[fuelType]} onChange={handleChange}
                                        placeholder="0,000"
                                        className="mt-1 p-2 w-full border rounded bg-white"
                                    />
                                </div>
                             );
                        })}
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

// Modal de Relatório (Usa props, ajustado para API data)
const PartnerReportModal = ({ partner, vehicles = [], refuelings = [], onClose }) => { // Adiciona valores padrão
    const today = new Date().toISOString().split('T')[0];
    const [dateRange, setDateRange] = useState({ start: '', end: today });

    // Filtra abastecimentos (usa props, datas da API)
    const partnerRefuelings = useMemo(() => {
        if (!partner || !Array.isArray(refuelings)) return [];
        return refuelings.filter(r => {
            if (r.partnerId !== partner.id || r.status !== 'Concluída') return false;
            // Compara datas do filtro com data da API (ISO string)
            const refuelDate = new Date(r.date);
            const startDate = dateRange.start ? new Date(dateRange.start + 'T00:00:00Z') : null; // Compara em UTC
            const endDate = dateRange.end ? new Date(dateRange.end + 'T23:59:59Z') : null; // Compara em UTC
            if (startDate && refuelDate < startDate) return false;
            if (endDate && refuelDate > endDate) return false;
            return true;
        }).sort((a, b) => new Date(b.date) - new Date(a.date)); // Ordena por data
    }, [partner, refuelings, dateRange]);

    if (!partner) return null;

    // Gera PDF (usa props, datas da API)
    const generateReportPDF = () => {
        const doc = new jsPDF();
        // Calcula total (usa `fuel_prices` da API)
        const totalValue = partnerRefuelings.reduce((sum, r) => {
            const fuelPrice = partner.fuel_prices?.[r.fuelType] || 0;
            const arlaPrice = partner.fuel_prices?.arla || 0;
            const fuelCost = (r.litrosAbastecidos || 0) * fuelPrice;
            const arlaCost = (r.litrosAbastecidosArla || 0) * arlaPrice;
            const outrosCost = r.outrosValor || 0;
            return sum + fuelCost + arlaCost + outrosCost;
        }, 0);

        doc.setFontSize(18);
        doc.text(`Relatório - ${partner.razaoSocial}`, 14, 22);
        doc.setFontSize(11);
        const startDateStr = dateRange.start ? new Date(dateRange.start + 'T12:00:00').toLocaleDateString('pt-BR') : 'Início';
        const endDateStr = dateRange.end ? new Date(dateRange.end + 'T12:00:00').toLocaleDateString('pt-BR') : 'Hoje';
        doc.text(`Período: ${startDateStr} a ${endDateStr}`, 14, 30);

        const head = [['Nº Autoriz.', 'Data', 'Veículo', 'Item', 'Qtd/Valor']];
        const body = partnerRefuelings.flatMap(r => {
            const vehicle = vehicles.find(v => v.id === r.vehicleId);
            const rows = [];
            const authNum = String(r.authNumber || '').padStart(6, '0');
            // Formata data da API (ISO)
            const date = r.date ? new Date(r.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A';
            const vehicleName = vehicle?.registroInterno || 'N/A';
             // Formata tipo combustível
             let fuelTypeText = r.fuelType?.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()) || 'N/A';
             if (r.fuelType === 'dieselS10') fuelTypeText = 'Diesel S10';

            if (r.litrosAbastecidos > 0) rows.push([authNum, date, vehicleName, fuelTypeText, `${(r.litrosAbastecidos || 0).toFixed(2)} L`]);
            if (r.litrosAbastecidosArla > 0) rows.push([authNum, date, vehicleName, 'Arla 32', `${(r.litrosAbastecidosArla || 0).toFixed(2)} L`]);
            if (r.outrosValor > 0) rows.push([authNum, date, vehicleName, r.outros || 'Outros', `R$ ${(r.outrosValor || 0).toFixed(2)}`]);
            if(rows.length === 0) rows.push([authNum, date, vehicleName, 'N/A', '0.00']);
            return rows;
        });

        autoTable(doc, { startY: 35, head: head, body: body, theme: 'striped', headStyles: { fillColor: [34, 139, 34] }}); // Verde

        let finalY = (doc.lastAutoTable?.finalY || 35) + 10;
        doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 53, 69); // Vermelho
        doc.text(`Valor Total Estimado: R$ ${totalValue.toFixed(2)}`, 14, finalY);
        doc.setTextColor(0); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.text(`*Valor estimado baseado nos preços atuais cadastrados.`, 14, finalY + 5);

        doc.save(`Relatorio_Posto_${partner.razaoSocial.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    };

    // Renderização do Modal
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col my-auto">
                {/* Cabeçalho */}
                <div className="p-4 sm:p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-lg sm:text-xl font-bold">Relatório de Abastecimentos</h2>
                        <p className="text-gray-600 text-sm">{partner.razaoSocial}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={18}/></button>
                </div>
                {/* Conteúdo Rolável */}
                <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
                    {/* Filtros */}
                    <div className="flex flex-col sm:flex-row gap-4 mb-4 items-end">
                        <div className="flex-1 w-full">
                            <label className="block text-xs font-medium text-gray-700">Data Início</label>
                            <input type="date" value={dateRange.start} onChange={e => setDateRange(p => ({...p, start: e.target.value}))} className="mt-1 w-full p-2 border rounded-lg bg-gray-50 text-sm" />
                        </div>
                        <div className="flex-1 w-full">
                            <label className="block text-xs font-medium text-gray-700">Data Fim</label>
                            <input type="date" value={dateRange.end} onChange={e => setDateRange(p => ({...p, end: e.target.value}))} className="mt-1 w-full p-2 border rounded-lg bg-gray-50 text-sm" />
                        </div>
                       <button onClick={generateReportPDF} className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition text-sm w-full sm:w-auto" disabled={partnerRefuelings.length === 0}>
                           <Printer size={16}/> Gerar PDF
                       </button>
                    </div>

                    {/* Tabela */}
                    {partnerRefuelings.length > 0 ? (
                        <div className="overflow-x-auto border rounded-lg">
                            <table className="w-full text-left table-auto text-xs sm:text-sm">
                                <thead className="bg-gray-100 text-gray-600 uppercase">
                                    <tr>
                                        <th className="p-2">Nº Autoriz.</th>
                                        <th className="p-2">Data</th>
                                        <th className="p-2">Veículo</th>
                                        <th className="p-2">Item</th>
                                        <th className="p-2 text-right">Qtd/Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {partnerRefuelings.flatMap(r => {
                                        const vehicle = vehicles.find(v => v.id === r.vehicleId);
                                        const rows = [];
                                         let fuelTypeText = r.fuelType?.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()) || 'N/A';
                                         if (r.fuelType === 'dieselS10') fuelTypeText = 'Diesel S10';

                                        if ((r.litrosAbastecidos || 0) > 0) rows.push({item: fuelTypeText, value: `${(r.litrosAbastecidos || 0).toFixed(2)} L`});
                                        if ((r.litrosAbastecidosArla || 0) > 0) rows.push({item: 'Arla 32', value: `${(r.litrosAbastecidosArla || 0).toFixed(2)} L`});
                                        if ((r.outrosValor || 0) > 0) rows.push({item: r.outros || 'Outros', value: `R$ ${(r.outrosValor || 0).toFixed(2)}`});
                                        if(rows.length === 0) rows.push({item: 'N/A', value: '0.00'});

                                        return rows.map((row, index) => (
                                            <tr key={`${r.id}-${index}`} className="border-b last:border-b-0 hover:bg-gray-50">
                                                {index === 0 && (
                                                    <>
                                                        <td className="p-2 font-medium" rowSpan={rows.length}>{String(r.authNumber || '').padStart(6, '0')}</td>
                                                        <td className="p-2" rowSpan={rows.length}>{r.date ? new Date(r.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</td>
                                                        <td className="p-2" rowSpan={rows.length}>{vehicle?.registroInterno || 'N/A'}</td>
                                                    </>
                                                )}
                                                <td className="p-2">{row.item}</td>
                                                <td className="p-2 text-right font-medium">{row.value}</td>
                                            </tr>
                                        ));
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-gray-500 text-center mt-8 italic text-sm">Nenhum abastecimento encontrado para este posto no período.</p>
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

export default PartnersPage;
