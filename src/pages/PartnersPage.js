import React, { useState, useMemo } from 'react';
import { PlusCircle, Edit, Trash2, FileText, X, Loader, Droplet, Truck } from 'lucide-react';
import ProtectedComponent from '../components/ProtectedComponent';

// --- Página de Parceiros (Postos) ---
const PartnersPage = ({
    user,
    partners = [], // Renomeado de rawPartners
    refuelings = [],
    comboioTransactions = [],
    PasswordConfirmationModal,
    setAlertMessage,
    apiClient,
    reloadData,
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false); // Modal de Relatório
    
    const [editingPartner, setEditingPartner] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [partnerForReport, setPartnerForReport] = useState(null); // Parceiro para o relatório

    // Funções de Modal
    const openModal = (p = null) => { setEditingPartner(p); setIsModalOpen(true); };
    const openDeleteModal = (id) => { setItemToDelete({ id }); setIsDeleteModalOpen(true); };
    const openReportModal = (p) => { setPartnerForReport(p); setIsReportModalOpen(true); };
    
    // Delete (usa apiClient)
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

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            {/* Cabeçalho */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Postos e Parceiros</h1>
                <ProtectedComponent requiredPermission="editor">
                    <button onClick={() => openModal()} className="flex items-center gap-2 px-3 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg shadow hover:bg-yellow-500 transition text-sm">
                        <PlusCircle size={18} />Adicionar Posto
                    </button>
                </ProtectedComponent>
            </div>

            {/* Lista de Postos */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                {(partners || []).map(partner => (
                    <div key={partner.id} className="grid grid-cols-1 md:grid-cols-4 gap-y-2 gap-x-4 items-center p-3 md:p-4 border-b last:border-b-0 hover:bg-gray-50 text-sm">
                        {/* Nome do Posto */}
                        <div className="md:col-span-1 font-bold text-gray-800 text-base">{partner.razaoSocial}</div>
                        {/* Preços */}
                        <div className="md:col-span-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            {Object.entries(partner.fuel_prices || {}).map(([fuelType, price]) => (
                                <span key={fuelType} className="font-medium text-gray-600">
                                    {fuelType}: <span className="font-bold text-green-700">R$ {parseFloat(price || 0).toFixed(2)}</span>
                                </span>
                            ))}
                            {Object.keys(partner.fuel_prices || {}).length === 0 && (
                                <span className="text-gray-400 italic">Sem preços cadastrados.</span>
                            )}
                        </div>
                        {/* Botões */}
                        <div className="flex gap-1 justify-start md:justify-end flex-wrap mt-2 md:mt-0">
                            <button onClick={() => openReportModal(partner)} className="text-xs py-1.5 px-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-1">
                                <FileText size={12} /> Relatório
                            </button>
                            <ProtectedComponent requiredPermission="editor">
                                <button onClick={() => openModal(partner)} title="Editar" className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-full"><Edit size={14}/></button>
                            </ProtectedComponent>
                            <ProtectedComponent requiredPermission="admin">
                                <button onClick={() => openDeleteModal(partner.id)} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-full"><Trash2 size={14}/></button>
                            </ProtectedComponent>
                        </div>
                    </div>
                ))}
                {partners.length === 0 && (
                    <p className="p-6 text-center text-gray-500 italic">Nenhum posto cadastrado.</p>
                )}
            </div>

            {/* Modais */}
            {isModalOpen && (
                <PartnerModal
                    partner={editingPartner}
                    onClose={() => setIsModalOpen(false)}
                    apiClient={apiClient}
                    reloadData={reloadData}
                    setAlertMessage={setAlertMessage}
                />
            )}
            {isReportModalOpen && (
                <RefuelingReportModal
                    partner={partnerForReport}
                    refuelings={refuelings}
                    comboioTransactions={comboioTransactions}
                    onClose={() => setIsReportModalOpen(false)}
                />
            )}
            {isDeleteModalOpen && itemToDelete && (
                <PasswordConfirmationModal
                    message="Confirme sua senha para excluir este posto. Todas as ordens de abastecimento e transações de comboio associadas perderão a referência (mas não serão excluídas)."
                    onConfirm={handleDelete}
                    onClose={() => setIsDeleteModalOpen(false)}
                    apiClient={apiClient}
                />
            )}
        </div>
    );
};

// --- Modal de Adicionar/Editar Posto ---
const PartnerModal = ({ partner, onClose, apiClient, reloadData, setAlertMessage }) => {
    const [razaoSocial, setRazaoSocial] = useState(partner?.razaoSocial || '');
    const [cnpj, setCnpj] = useState(partner?.cnpj || '');
    const [endereco, setEndereco] = useState(partner?.endereco || '');
    const [telefone, setTelefone] = useState(partner?.telefone || '');
    // Estado para preços
    const [prices, setPrices] = useState({
        'Diesel S10': partner?.fuel_prices?.['Diesel S10']?.toString() || '',
        'Diesel S500': partner?.fuel_prices?.['Diesel S500']?.toString() || '',
        'Arla': partner?.fuel_prices?.['Arla']?.toString() || '',
    });
    const [isSaving, setIsSaving] = useState(false);

    const handlePriceChange = (e) => {
        const { name, value } = e.target;
        setPrices(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!razaoSocial) {
            setAlertMessage("A Razão Social é obrigatória.");
            return;
        }
        setIsSaving(true);
        
        // Converte preços para números
        const numericPrices = Object.entries(prices).reduce((acc, [key, val]) => {
            acc[key] = parseFloat(val.replace(',', '.')) || 0; // Aceita vírgula e ponto
            return acc;
        }, {});

        const partnerData = {
            razaoSocial,
            cnpj,
            endereco,
            telefone,
            // fuel_prices não é mais salvo na tabela 'partners'
        };

        try {
            if (partner) { // Editando
                await apiClient.updatePartner(partner.id, partnerData);
                await apiClient.updatePartnerFuelPrices(partner.id, numericPrices); // Atualiza preços
                setAlertMessage("Posto atualizado com sucesso!");
            } else { // Criando
                // Gera um ID no frontend (se o backend não gerar)
                const newId = partnerData.id || `partner_${Date.now()}`;
                partnerData.id = newId;
                
                // Cria o parceiro e os preços
                // O backend foi corrigido para lidar com 'fuel_prices' na criação
                await apiClient.createPartner({ ...partnerData, fuel_prices: numericPrices });
                setAlertMessage("Posto criado com sucesso!");
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

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">{partner ? 'Editar Posto' : 'Adicionar Posto'}</h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Razão Social *</label>
                        <input value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} className="w-full p-2 border rounded mt-1" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">CNPJ</label>
                        <input value={cnpj} onChange={e => setCnpj(e.target.value)} className="w-full p-2 border rounded mt-1" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Endereço</label>
                        <input value={endereco} onChange={e => setEndereco(e.target.value)} className="w-full p-2 border rounded mt-1" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Telefone</label>
                        <input value={telefone} onChange={e => setTelefone(e.target.value)} className="w-full p-2 border rounded mt-1" />
                    </div>
                    
                    <div className="pt-4 border-t">
                        <h3 className="text-base font-semibold mb-2 text-gray-800">Preços dos Combustíveis</h3>
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
                    </div>
                </div>
                <div className="p-4 bg-gray-50 border-t flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium" disabled={isSaving}>Cancelar</button>
                    <button type="submit" disabled={isSaving} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm">
                        {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar'}
                    </button>
                </div>
            </form>
        </div>
    );
};

// --- Modal de Relatório de Abastecimento (LOCAL DA CORREÇÃO) ---
const RefuelingReportModal = ({ partner, refuelings = [], comboioTransactions = [], onClose }) => {
    
    // Processa e combina os dados
    const { reportData, totals } = useMemo(() => {
        const data = [];
        
        // 1. Abastecimentos normais (RefuelingPage)
        (refuelings || []).forEach(e => {
            if (e.partnerId === partner.id && e.status === 'Concluída') {
                // *** CORREÇÃO AQUI ***
                // Converte 'outrosValor' e 'litrosAbastecidos' para número
                const outros = parseFloat(e.outrosValor) || 0;
                const litros = parseFloat(e.litrosAbastecidos) || 0;
                const precoUnit = parseFloat(partner.fuel_prices?.[e.fuelType] || 0);
                const valorCombustivel = litros * precoUnit;
                
                data.push({
                    id: e.id,
                    date: new Date(e.data),
                    type: 'Abastecimento',
                    icon: <Droplet size={14} className="text-blue-500" />,
                    description: `Auth: ${e.authNumber} (${e.vehicleInternalId || 'N/A'})`,
                    fuelType: e.fuelType,
                    liters: litros,
                    value: valorCombustivel,
                    others: outros,
                    total: valorCombustivel + outros
                });
            }
        });

        // 2. Entradas de Comboio (ComboioPage)
        (comboioTransactions || []).forEach(e => {
            if (e.partnerId === partner.id && e.type === 'entrada') {
                // *** CORREÇÃO AQUI ***
                // Converte 'valorTotal' e 'litros' para número
                const total = parseFloat(e.valorTotal) || 0;
                const litros = parseFloat(e.liters) || 0;
                
                data.push({
                    id: e.id,
                    date: new Date(e.date),
                    type: 'Entrada Comboio',
                    icon: <Truck size={14} className="text-green-500" />,
                    description: `Comboio: ${e.comboioVehicleName || 'N/A'}`,
                    fuelType: e.fuelType,
                    liters: litros,
                    value: total,
                    others: 0, // Entradas de comboio não têm 'outros'
                    total: total
                });
            }
        });

        // Ordena por data
        const sortedData = data.sort((a, b) => b.date - a.date);
        
        // Calcula Totais
        const totals = sortedData.reduce((acc, item) => {
            acc.liters += item.liters;
            acc.value += item.value;
            acc.others += item.others;
            acc.total += item.total;
            return acc;
        }, { liters: 0, value: 0, others: 0, total: 0 });

        return { reportData: sortedData, totals };
    }, [partner, refuelings, comboioTransactions]);

    const formatDate = (date) => date ? new Date(date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold">Relatório de Abastecimento</h2>
                        <p className="text-gray-600 text-sm">{partner.razaoSocial}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={18}/></button>
                </div>
                
                {/* Conteúdo Rolável */}
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
                        <p className="text-gray-500 text-center italic py-10">Nenhum abastecimento concluído encontrado para este posto.</p>
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