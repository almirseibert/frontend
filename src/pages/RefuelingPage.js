import React, { useState, useMemo, useEffect } from 'react';
import apiClient from '../services/apiClient'; // Importa apiClient
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    PlusCircle,
    Edit,
    Trash2,
    Download,
    Printer,
    CheckCircle,
    X,
    Info,
    AlertTriangle,
    Loader // Adicionado Loader
} from 'lucide-react';

import ProtectedComponent from '../components/ProtectedComponent'; // Ajuste o caminho
// Importa modais do App.js ou de onde foram definidos
// REMOVIDO: Importação direta de modais (serão passados via props)

// ===================================================================================
// GERAÇÃO DE PDF (AJUSTADO PARA DATAS DA API e props)
// ===================================================================================
const generateAuthorizationPDF = (order, vehicles = [], partners = [], employees = [], vehicleGroups = {}) => {
    // Constrói o PDF
    const buildPdf = (logoDataUrl) => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const effectivePageHeight = 148.5; // Metade da altura de um A4
        const margin = 10;

        // Busca dados completos
        const vehicle = vehicles.find(v => v.id === order.vehicleId);
        const partner = partners.find(p => p.id === order.partnerId);
        const employee = employees.find(e => e.id === order.employeeId);
        const emissionDate = order.date ? new Date(order.date) : new Date(); // Usa data da ordem ou atual

        // Adiciona logo
        if (logoDataUrl) {
            const imgWidth = 45;
            const imgHeight = 16.875;
            try {
                doc.addImage(logoDataUrl, 'PNG', margin, 10, imgWidth, imgHeight);
            } catch (e) {
                console.error("Erro ao adicionar logo ao PDF:", e);
            }
        }

        // Cabeçalho
        doc.setFontSize(16);
        doc.text(`Autorização de Abastecimento`, pageWidth - margin, 15, { align: 'right' });
        doc.setFontSize(12);
        doc.text(`Nº: ${String(order.authNumber || '0').padStart(6, '0')}`, pageWidth - margin, 22, { align: 'right' });

        // Determina leitura
        let leituraLabel = 'Leitura';
        let leituraValue = 'N/A';
        if (vehicle && vehicleGroups && Object.keys(vehicleGroups).length > 0) {
             const group = Object.keys(vehicleGroups).find(g => vehicleGroups[g]?.includes(vehicle.tipo));
             if (group === 'Máquinas Pesadas') {
                 leituraLabel = 'Horímetro';
                 leituraValue = order.horimetroDigital ?? order.horimetroAnalogico ?? order.horimetro ?? 'N/A';
             } else if (group === 'Caminhões') {
                 // Prioriza horímetro se informado na ordem, senão odômetro
                 if (order.horimetro != null) {
                    leituraLabel = 'Horímetro';
                    leituraValue = order.horimetro ?? 'N/A';
                 } else {
                    leituraLabel = 'Odômetro';
                    leituraValue = order.odometro ?? 'N/A';
                 }
             } else { // Veículos Leves ou outros
                 leituraLabel = 'Odômetro';
                 leituraValue = order.odometro ?? 'N/A';
             }
        } else { // Fallback genérico
             leituraLabel = (order.horimetro != null || order.horimetroDigital != null || order.horimetroAnalogico != null) ? 'Horímetro' : 'Odômetro';
             leituraValue = order.horimetroDigital ?? order.horimetroAnalogico ?? order.horimetro ?? order.odometro ?? 'N/A';
        }


        // Corpo da tabela
        const body = [
            ['Data de Emissão', emissionDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' })], // Formata UTC
            ['Funcionário Autorizado', employee?.nome || 'Não especificado'],
            ['Veículo Autorizado', `${vehicle?.registroInterno || 'N/A'} - ${vehicle?.placa || 'N/A'}`],
            ['Modelo', `${vehicle?.marca || ''} ${vehicle?.modelo || ''}`.trim() || 'N/A'],
            [leituraLabel, `${leituraValue}`],
            ['Posto Autorizado', partner?.razaoSocial || order.partnerName || 'N/A'], // Usa partnerName como fallback
            ['Combustível Autorizado', order.fuelType || 'N/A'],
            ['Litros Liberados', order.isFillUp ? 'Completar Tanque' : `${order.litrosLiberados || 0} L`],
        ];

        if (order.needsArla) {
            body.push(['Arla 32 Autorizado', order.isFillUpArla ? 'Completar Tanque' : `${order.litrosLiberadosArla || 0} L`]);
        }
        if (order.outros) {
             body.push(['Outros Itens/Observação', `${order.outros} ${order.outrosValor ? `(R$ ${parseFloat(order.outrosValor || 0).toFixed(2)})` : ''}`]);
        }

        // Tenta pegar quem emitiu do objeto 'createdBy' que PODE vir da API
        const createdByEmail = order.createdBy?.userEmail || order.createdByEmail || 'N/A'; // Adapta para possível nome antigo
        body.push(['Emitido por', createdByEmail]);

        // Gera tabela
        autoTable(doc, {
            startY: 35,
            body: body,
            theme: 'striped',
            styles: { fontSize: 9, cellPadding: 1.5 },
            headStyles: { fillColor: [24, 49, 83] }, // Azul escuro
            columnStyles: {
                0: { cellWidth: 40, fontStyle: 'bold' }
            }
        });

        // Rodapé
        let finalY = (doc.lastAutoTable?.finalY || 35) + 10;
        const footerStartY = Math.max(finalY, effectivePageHeight - 20); // Ajusta posição
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.text('*A presente ordem de abastecimento é válida exclusivamente para a placa/RE indicada e para o tipo de combustível previamente autorizado.', margin, footerStartY);
        doc.text('*Estão autorizados somente os itens discriminados acima.', margin, footerStartY + 4);
        doc.text('*Itens adicionais ou combustíveis distintos não serão objeto de faturamento.', margin, footerStartY + 8);

        // Linha pontilhada
        doc.setLineDashPattern([1, 1], 0);
        doc.setDrawColor(180, 180, 180);
        doc.line(0, effectivePageHeight, pageWidth, effectivePageHeight);

        // Abre em nova janela
        doc.output('dataurlnewwindow', { filename: `Autorizacao_${order.authNumber}_${vehicle?.registroInterno || 'Veiculo'}.pdf` });
    };

    // Lógica para carregar o logo (sem mudanças)
    const logo = new Image();
    logo.crossOrigin = 'Anonymous';
    logo.src = 'https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png';

    logo.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = logo.width;
            canvas.height = logo.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(logo, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            buildPdf(dataUrl);
        } catch (e) {
            console.error("Erro ao processar logo para PDF:", e);
            buildPdf(null);
        }
    };
    logo.onerror = (e) => {
         console.error("Erro ao carregar imagem do logo:", e);
         buildPdf(null);
    }
};


// --- Componente Principal (Usa props e apiClient) ---
const RefuelingPage = ({
    user,
    vehicles = [],
    obras = [],
    partners = [],
    refuelings = [], // Recebe a lista via props
    employees = [],
    setAlertMessage,
    PasswordConfirmationModal, // Recebe via props
    ConfirmationModal, // Recebe via props
    extraObraOptions = [],
    vehicleGroups = {},
    apiClient, // Recebe via props
    reloadData // Recebe via props
}) => {
    // Estados dos modais (sem mudanças)
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [orderToConfirm, setOrderToConfirm] = useState(null);
    const [editingOrder, setEditingOrder] = useState(null);

    // Estados de filtro e histórico (sem mudanças)
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [historyLimit, setHistoryLimit] = useState(10);
    const [openOrdersSearchTerm, setOpenOrdersSearchTerm] = useState('');
    const [completedOrdersSearchTerm, setCompletedOrdersSearchTerm] = useState('');
    const [loadingDelete, setLoadingDelete] = useState(false); // Loading state para delete

    // Funções para abrir modais (sem mudanças)
    const openConfirmModal = (refuelingOrder) => {
        setOrderToConfirm(refuelingOrder);
        setIsConfirmModalOpen(true);
    };
    const openEditModal = (order) => {
        setEditingOrder(order);
        setIsOrderModalOpen(true);
    };
    const openDeleteModal = (orderId) => {
        setItemToDelete(orderId);
        setIsDeleteModalOpen(true);
    };

    // Função para excluir ordem (usa apiClient e PasswordConfirmationModal)
    const handleDeleteOrder = async () => {
        if (!itemToDelete) return;
        setLoadingDelete(true);
        try {
            await apiClient.deleteRefuelingOrder(itemToDelete);
            setAlertMessage("Ordem de abastecimento excluída com sucesso.");
            reloadData(); // Recarrega os dados globais
        } catch (error) {
            console.error("Erro ao excluir ordem:", error);
            setAlertMessage(error.message || `Falha ao excluir a ordem.`);
        } finally {
            setIsDeleteModalOpen(false); // Fecha o modal de senha
            setItemToDelete(null);
            setLoadingDelete(false);
        }
    };

    // Função auxiliar para filtrar ordens (sem mudanças)
    const filterOrders = (ordersToFilter, searchTerm) => {
        if (!searchTerm) return ordersToFilter;
        const searchLower = searchTerm.toLowerCase();
        // Garante que ordersToFilter é um array
        return (ordersToFilter || []).filter(order => {
            const vehicle = vehicles.find(v => v.id === order.vehicleId);
            const orderNumberMatch = String(order.authNumber || '').padStart(6, '0').includes(searchLower);
            // Verifica se vehicle existe antes de acessar propriedades
            const vehicleMatch = vehicle ? (vehicle.registroInterno || '').toLowerCase().includes(searchLower) || (vehicle.placa || '').toLowerCase().includes(searchLower) : false;
            // Usa partnerName que deve vir da API
            const partnerMatch = (order.partnerName || '').toLowerCase().includes(searchLower);
            return orderNumberMatch || vehicleMatch || partnerMatch;
        });
    };

    // Memoiza ordens abertas e filtradas (usa 'refuelings' prop)
    const openRefuelings = useMemo(() => {
        const open = (refuelings || []).filter(r => r.status === 'Aberta');
        // Ordena por authNumber (maior primeiro)
        const sorted = open.sort((a,b) => (b.authNumber || 0) - (a.authNumber || 0));
        return filterOrders(sorted, openOrdersSearchTerm);
    }, [refuelings, openOrdersSearchTerm, vehicles]); // Adiciona 'vehicles' como dependência

    // Memoiza abastecimentos concluídos e filtrados (limitado) (usa 'refuelings' prop)
    const recentRefuelings = useMemo(() => {
        const completed = (refuelings || []).filter(o => o.status === 'Concluída');
        const sorted = completed.sort((a, b) => (b.authNumber || 0) - (a.authNumber || 0));
        const filtered = filterOrders(sorted, completedOrdersSearchTerm);
        return filtered.slice(0, historyLimit);
    }, [refuelings, completedOrdersSearchTerm, vehicles, historyLimit]); // Adiciona 'vehicles'

    // Memoiza veículos ordenados para o select (sem mudanças)
    const sortedVehiclesForHistory = useMemo(() =>
        [...(vehicles || [])].sort((a,b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')),
    [vehicles]);

    // Renderização Principal (sem mudanças significativas na estrutura)
    return (
        <div className="container mx-auto space-y-6 p-4 md:p-6 lg:p-8">
            {/* Cabeçalho */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Controle de Abastecimento</h1>
                <ProtectedComponent requiredPermission="editor">
                    <button onClick={() => { setEditingOrder(null); setIsOrderModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg shadow hover:bg-yellow-500 transition w-full sm:w-auto justify-center text-sm">
                        <PlusCircle size={18} />Emitir Ordem
                    </button>
                </ProtectedComponent>
            </div>

            {/* Layout Principal */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {/* Coluna Esquerda: Ordens Abertas e Histórico */}
                <div className="space-y-6">
                     {/* Ordens em Aberto */}
                    <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
                        <h2 className="text-xl font-bold mb-4 text-gray-800">Ordens em Aberto</h2>
                        <input type="text" placeholder="Buscar Nº Ordem / Veículo / Posto..." value={openOrdersSearchTerm} onChange={e => setOpenOrdersSearchTerm(e.target.value)} className="w-full p-2 border rounded-lg mb-4 text-sm"/>
                        <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                            {openRefuelings.length > 0 ? openRefuelings.map(order => {
                                const vehicle = vehicles.find(v => v.id === order.vehicleId);
                                const dateStr = order.date ? new Date(order.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'; // Formata UTC
                                return (
                                    <div key={order.id} className="p-3 border rounded-lg hover:bg-gray-50 transition-colors text-sm">
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                                            <div className="mb-2 sm:mb-0">
                                                <p className="font-bold text-base">Nº {String(order.authNumber || '').padStart(6, '0')} - {vehicle?.registroInterno || 'Veículo?'}</p>
                                                <p className="text-xs text-gray-600">{vehicle?.placa || 'Placa?'} | {order.partnerName || 'Posto?'}</p>
                                                <p className="text-xs text-gray-500 mt-1">Emitido em: {dateStr}</p>
                                            </div>
                                            <div className="flex items-center gap-1 self-start sm:self-center shrink-0">
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => openConfirmModal(order)} title="Confirmar Abastecimento" className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-100 rounded-full"><CheckCircle size={14} /></button>
                                                    <button onClick={() => openEditModal(order)} title="Editar Ordem" className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-100 rounded-full"><Edit size={14} /></button>
                                                    <button onClick={() => openDeleteModal(order.id)} title="Excluir Ordem" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-full"><Trash2 size={14} /></button>
                                                </ProtectedComponent>
                                                <button onClick={() => generateAuthorizationPDF(order, vehicles, partners, employees, vehicleGroups)} title="Imprimir PDF" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-full"><Printer size={14} /></button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }) : <p className="text-gray-500 text-center py-4 italic text-sm">Nenhuma ordem de abastecimento em aberto.</p>}
                        </div>
                    </div>

                    {/* Histórico por Veículo */}
                    <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
                        <h2 className="text-xl font-bold mb-4 text-gray-800">Consultar Histórico por Veículo</h2>
                        <select value={selectedVehicleId} onChange={e => setSelectedVehicleId(e.target.value)} className="w-full p-2 border rounded-lg mb-4 text-sm bg-white">
                            <option value="">Selecione um veículo</option>
                            {sortedVehiclesForHistory.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa}</option>)}
                        </select>
                        {/* Passa generateAuthorizationPDF para o histórico poder reimprimir */}
                        {selectedVehicleId && <RefuelingHistory
                            vehicleId={selectedVehicleId}
                            refuelings={refuelings}
                            vehicles={vehicles}
                            partners={partners}
                            employees={employees}
                            generateAuthorizationPDF={generateAuthorizationPDF} // Passa a função
                            vehicleGroups={vehicleGroups}
                        />}
                    </div>
                </div>

                {/* Coluna Direita: Últimos Concluídos */}
                <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
                    <h2 className="text-xl font-bold mb-4 text-gray-800">Últimos Abastecimentos (Concluídos)</h2>
                    <input type="text" placeholder="Buscar Nº Ordem / Veículo / Posto..." value={completedOrdersSearchTerm} onChange={e => setCompletedOrdersSearchTerm(e.target.value)} className="w-full p-2 border rounded-lg mb-4 text-sm"/>
                    <div className="space-y-3 max-h-[80vh] overflow-y-auto custom-scrollbar pr-2">
                        {recentRefuelings.map(order => {
                             const vehicle = vehicles.find(v => v.id === order.vehicleId);
                             const dateStr = order.date ? new Date(order.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'; // Formata UTC
                             let fuelTypeText = 'N/A';
                             if (order.fuelType && typeof order.fuelType === 'string') {
                                 if (order.fuelType === 'dieselS10') {
                                     fuelTypeText = 'Diesel S10';
                                 } else { // Formata CamelCase
                                     fuelTypeText = order.fuelType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                 }
                             }
                             return (
                                <div key={order.id} className="p-3 border rounded-lg bg-gray-50 text-sm">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                                        <div className="mb-2 sm:mb-0">
                                            <p className="font-bold text-base">Nº {String(order.authNumber || '').padStart(6, '0')} - {vehicle?.registroInterno || 'Veículo?'}</p>
                                            <p className="text-xs text-gray-600">{vehicle?.placa || 'Placa?'} | {order.partnerName || 'Posto?'}</p>
                                            <p className="text-xs text-gray-500 mt-1">Data: {dateStr}</p>
                                        </div>
                                        <div className="text-left sm:text-right w-full sm:w-auto">
                                            <p className="font-bold text-lg text-blue-600">{(order.litrosAbastecidos || 0).toFixed(2)} L</p>
                                            <p className="text-xs text-gray-600 font-medium">{fuelTypeText}</p>
                                            <div className="flex items-center gap-1 mt-1 justify-start sm:justify-end">
                                                <button onClick={() => generateAuthorizationPDF(order, vehicles, partners, employees, vehicleGroups)} title="Reimprimir PDF" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-full"><Printer size={14} /></button>
                                                <ProtectedComponent requiredPermission="editor">
                                                    {/* Botão Editar também para concluídos */}
                                                    <button onClick={() => openEditModal(order)} title="Editar Ordem" className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-100 rounded-full"><Edit size={14} /></button>
                                                </ProtectedComponent>
                                                <ProtectedComponent requiredPermission="admin">
                                                    <button onClick={() => openDeleteModal(order.id)} title="Excluir Ordem" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-full"><Trash2 size={14} /></button>
                                                </ProtectedComponent>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                             )
                        })}
                         {/* Botão "Ver mais" */}
                         {(refuelings || []).filter(o => o.status === 'Concluída').length > historyLimit && (
                            <button onClick={() => setHistoryLimit(prev => prev + 10)} className="w-full mt-4 py-2 text-center text-yellow-600 font-semibold hover:underline text-sm">Ver mais</button>
                        )}
                        {recentRefuelings.length === 0 && (
                            <p className="text-gray-500 text-center py-4 italic text-sm">Nenhum abastecimento concluído encontrado.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Modais (usam apiClient e props) */}
            {isOrderModalOpen && <RefuelingOrderModal
                user={user}
                orderToEdit={editingOrder}
                vehicles={vehicles}
                obras={obras}
                partners={partners}
                employees={employees}
                refuelings={refuelings}
                onClose={() => { setIsOrderModalOpen(false); setEditingOrder(null); }}
                setAlertMessage={setAlertMessage}
                generatePDF={(orderData) => generateAuthorizationPDF(orderData, vehicles, partners, employees, vehicleGroups)} // Passa a função com dependências
                extraObraOptions={extraObraOptions}
                ConfirmationModal={ConfirmationModal}
                PasswordConfirmationModal={PasswordConfirmationModal}
                vehicleGroups={vehicleGroups}
                isOrderModalOpen={isOrderModalOpen} // Para useEffect interno
                apiClient={apiClient}
                reloadData={reloadData}
            />}
            {isConfirmModalOpen && <ConfirmRefuelingModal
                user={user}
                order={orderToConfirm}
                onClose={() => setIsConfirmModalOpen(false)}
                setAlertMessage={setAlertMessage}
                partners={partners} // Passa partners se necessário
                obras={obras} // Passa obras se necessário
                apiClient={apiClient}
                reloadData={reloadData}
            />}
            {/* Modal de Exclusão agora usa PasswordConfirmationModal */}
            {isDeleteModalOpen && itemToDelete && <PasswordConfirmationModal
                message="Tem certeza que deseja excluir esta ordem de abastecimento? Se já confirmada, a despesa associada será revertida. Esta ação não pode ser desfeita."
                onConfirm={handleDeleteOrder}
                onClose={() => setIsDeleteModalOpen(false)}
                apiClient={apiClient} // Passa apiClient
            />}
        </div>
    );
};

// ===================================================================================
// MODAL DE EMISSÃO/EDIÇÃO DE ORDEM (Usa apiClient)
// ===================================================================================
const RefuelingOrderModal = ({
    user, orderToEdit, vehicles = [], obras = [], partners = [], employees = [], refuelings = [],
    onClose, setAlertMessage, generatePDF, extraObraOptions = [],
    ConfirmationModal, PasswordConfirmationModal, vehicleGroups = {}, isOrderModalOpen,
    apiClient, reloadData
}) => {
    // Estado inicial (datas YYYY-MM-DD, números como string)
    const [formData, setFormData] = useState({
        vehicleId: orderToEdit?.vehicleId || '',
        partnerId: orderToEdit?.partnerId || '',
        obraId: orderToEdit?.obraId || '',
        employeeId: orderToEdit?.employeeId || '',
        // Converte data da API (ISO string ou timestamp) para YYYY-MM-DD
        date: orderToEdit?.date ? new Date(orderToEdit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        odometro: orderToEdit?.odometro?.toString() || '',
        horimetro: orderToEdit?.horimetro?.toString() || '',
        horimetroDigital: orderToEdit?.horimetroDigital?.toString() || '',
        horimetroAnalogico: orderToEdit?.horimetroAnalogico?.toString() || '',
        isFillUp: orderToEdit?.isFillUp || false,
        litrosLiberados: orderToEdit?.litrosLiberados?.toString() || '',
        fuelType: orderToEdit?.fuelType || '',
        needsArla: orderToEdit?.needsArla || false,
        isFillUpArla: orderToEdit?.isFillUpArla || false,
        litrosLiberadosArla: orderToEdit?.litrosLiberadosArla?.toString() || '',
        outros: orderToEdit?.outros || '',
        outrosValor: orderToEdit?.outrosValor?.toString() || '',
    });

    const [lastRefuel, setLastRefuel] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [pendingOrderWarning, setPendingOrderWarning] = useState('');
    const [recentRefuelWarning, setRecentRefuelWarning] = useState('');
    const [noHorimetroWarning, setNoHorimetroWarning] = useState('');
    const [isNoHorimetroConfirmVisible, setIsNoHorimetroConfirmVisible] = useState(false);
    const [vehicleWarning, setVehicleWarning] = useState(''); // Aviso geral do veículo

    const isEditing = !!orderToEdit;

    // Memos para ordenação (sem mudanças)
    const sortedVehicles = useMemo(() => [...vehicles].sort((a,b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);
    const sortedEmployees = useMemo(() => [...employees].sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [employees]);
    const sortedObras = useMemo(() => [...(obras || []).filter(o => o.status === 'ativa')].sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);
    const sortedPartners = useMemo(() => [...partners].sort((a,b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '')), [partners]);

    // Seleção de veículo e grupo (sem mudanças)
    const selectedVehicle = useMemo(() => sortedVehicles.find(v => v.id === formData.vehicleId), [formData.vehicleId, sortedVehicles]);
    const vehicleGroup = useMemo(() => {
        if (!selectedVehicle || !vehicleGroups || Object.keys(vehicleGroups).length === 0) return null;
        return Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(selectedVehicle.tipo));
    }, [selectedVehicle, vehicleGroups]);

    // Lógica de avisos e último abastecimento (ajustado para datas API)
    useEffect(() => {
        // Roda apenas quando o modal está aberto e um veículo está selecionado
        if (isOrderModalOpen && selectedVehicle) {
            // Verifica ordem pendente (apenas na criação)
            if (!isEditing) {
                const hasPendingOrder = (refuelings || []).some(r => r.vehicleId === formData.vehicleId && r.status === 'Aberta');
                setPendingOrderWarning(hasPendingOrder ? 'Atenção: Este veículo já possui uma ordem de abastecimento pendente.' : '');
            } else {
                setPendingOrderWarning(''); // Limpa se estiver editando
            }

            // Busca último abastecimento concluído
            const latestRefuel = (refuelings || [])
                .filter(r => r.vehicleId === formData.vehicleId && r.status === 'Concluída')
                // Ordena por data (string ISO da API) descendente
                .sort((a,b) => (b.date || '').localeCompare(a.date || ''))[0];

            if (latestRefuel) {
                setLastRefuel(latestRefuel);
                // Verifica abastecimento recente (apenas na criação)
                if (!isEditing) {
                    const now = new Date();
                    const lastRefuelDate = new Date(latestRefuel.date); // Converte string ISO
                    const diffInHours = (now.getTime() - lastRefuelDate.getTime()) / (1000 * 60 * 60);
                    setRecentRefuelWarning(diffInHours < 24 ? `Atenção: Abastecido há menos de 24h (${diffInHours.toFixed(1)}h).` : '');
                } else {
                    setRecentRefuelWarning('');
                }
            } else {
                setLastRefuel(null);
                setRecentRefuelWarning('');
            }
             // Define mensagem de aviso do veículo (ex: revisão vencida)
             setVehicleWarning(selectedVehicle.possuiAviso ? selectedVehicle.avisoTexto : '');

        } else if (!isOrderModalOpen) { // Limpa tudo ao fechar
            setPendingOrderWarning('');
            setRecentRefuelWarning('');
            setLastRefuel(null);
            setVehicleWarning('');
        }
        // Dependências: modal aberto, veículo selecionado, lista de abastecimentos, modo edição
    }, [isOrderModalOpen, selectedVehicle, refuelings, isEditing, formData.vehicleId]);

    // Preenche dados ao selecionar veículo (ajustado para datas API)
     const handleVehicleChange = (e) => {
        const newVehicleId = e.target.value;
        const vehicle = sortedVehicles.find(v => v.id === newVehicleId);

        if (vehicle) {
            // Preenche leituras e obra atual
            setFormData(prev => ({
                ...prev,
                vehicleId: newVehicleId,
                odometro: vehicle.odometro?.toString() || '',
                horimetro: vehicle.horimetro?.toString() || '',
                horimetroDigital: vehicle.horimetroDigital?.toString() || '',
                horimetroAnalogico: vehicle.horimetroAnalogico?.toString() || '',
                obraId: vehicle.obraAtualId || ''
            }));

            // Tenta preencher último motorista, posto e tipo de combustível
            const latestRefuelOrder = (refuelings || [])
                .filter(r => r.vehicleId === vehicle.id && r.status === 'Concluída')
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]; // Ordena por data string ISO

            if (latestRefuelOrder) {
                setFormData(prev => ({...prev, employeeId: latestRefuelOrder.employeeId || '', partnerId: latestRefuelOrder.partnerId || '', fuelType: latestRefuelOrder.fuelType || '' }));
            } else {
                 // Busca motorista da alocação atual (obra ou operacional)
                 let currentDriverId = '';
                 // Tenta pegar do histórico ativo da obra
                 const obra = obras.find(o => o.id === vehicle.obraAtualId);
                 const activeHistory = (Array.isArray(obra?.historicoVeiculos) ? obra.historicoVeiculos : [])
                    .find(h => h.veiculoId === vehicle.id && !h.endDate); // Usa endDate
                 if (activeHistory) {
                    currentDriverId = activeHistory.details?.employeeId || '';
                 }
                 // Se não achou na obra, tenta na alocação operacional (campo pode variar)
                 else if (vehicle.operationalAssignment?.employeeId) {
                     currentDriverId = vehicle.operationalAssignment.employeeId;
                 }
                setFormData(prev => ({...prev, employeeId: currentDriverId, partnerId: '', fuelType: ''}));
            }
        } else {
            // Limpa campos se nenhum veículo for selecionado
            setFormData(prev => ({ ...prev, vehicleId: '', odometro: '', horimetro: '', horimetroDigital: '', horimetroAnalogico: '', obraId: '', employeeId: '', partnerId: '', fuelType: '' }));
        }
        // Limpa avisos específicos ao trocar veículo
        setPendingOrderWarning('');
        setRecentRefuelWarning('');
        setNoHorimetroWarning('');
        setIsNoHorimetroConfirmVisible(false);
        setLastRefuel(null);
    };


    // Limpa aviso de horímetro ao preencher (sem mudanças)
    useEffect(() => {
        if ((vehicleGroup === 'Caminhões' && (formData.horimetro || '') !== '') ||
            (vehicleGroup === 'Máquinas Pesadas' && ((formData.horimetroDigital || '') !== '' || (formData.horimetroAnalogico || '') !== ''))) {
            setNoHorimetroWarning('');
        }
    }, [formData.horimetro, formData.horimetroDigital, formData.horimetroAnalogico, vehicleGroup]);

    // Handle change genérico (sem mudanças)
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));

        if (name === 'isFillUp' && checked) setFormData(prev => ({ ...prev, litrosLiberados: '' }));
        if (name === 'isFillUpArla' && checked) setFormData(prev => ({ ...prev, litrosLiberadosArla: '' }));
        if (name === 'litrosLiberados' && value !== '') setFormData(prev => ({ ...prev, isFillUp: false }));
        if (name === 'litrosLiberadosArla' && value !== '') setFormData(prev => ({ ...prev, isFillUpArla: false }));
    };

    // Combustíveis disponíveis (usa fuel_prices da API)
    const availableFuels = useMemo(() => {
        const selectedPartner = partners.find(p => p.id === formData.partnerId);
        return selectedPartner ? Object.keys(selectedPartner.fuel_prices || {}).filter(f => f !== 'arla') : [];
    }, [formData.partnerId, partners]);

     // Função principal de salvar (usa apiClient)
    const handleSave = async (e) => {
        if(e) e.preventDefault(); // Permite chamar sem evento (do modal de confirmação)

        // --- Validações ---
        const requiredFieldsBase = ['vehicleId', 'partnerId', 'employeeId', 'fuelType', 'date'];
        let requiredReadings = [];
        if (vehicleGroup === 'Veículos Leves') requiredReadings = ['odometro'];
        else if (vehicleGroup === 'Caminhões') requiredReadings = ['horimetro']; // Prioriza horímetro para caminhão
        else if (vehicleGroup === 'Máquinas Pesadas') {
             // Requer digital OU analógico se existirem no veículo
             if (selectedVehicle?.possuiHorimetroDigital && selectedVehicle?.possuiHorimetroAnalogico) { /* Requer um dos dois, validado abaixo */ }
             else if (selectedVehicle?.possuiHorimetroDigital) requiredReadings = ['horimetroDigital'];
             else if (selectedVehicle?.possuiHorimetroAnalogico) requiredReadings = ['horimetroAnalogico'];
        }

        const allRequired = [...requiredFieldsBase, ...requiredReadings];
        const isInvalid = allRequired.some(field => (formData[field] || '').toString().trim() === '');

        // Validação específica para Máquinas Pesadas (pelo menos um horímetro preenchido)
        if (vehicleGroup === 'Máquinas Pesadas' && (formData.horimetroDigital || '').toString().trim() === '' && (formData.horimetroAnalogico || '').toString().trim() === '') {
            setAlertMessage("Para Máquinas Pesadas, preencha o Horímetro Digital ou Analógico.");
            return;
        }
        // Validação Litros/Completar
        if (!formData.isFillUp && (formData.litrosLiberados || '').toString().trim() === '') {
             setAlertMessage("Informe os Litros Liberados ou marque 'Completar Tanque'.");
             return;
        }
        if (formData.needsArla && !formData.isFillUpArla && (formData.litrosLiberadosArla || '').toString().trim() === '') {
            setAlertMessage("Informe os Litros de Arla ou marque 'Completar Tanque de Arla'.");
            return;
        }

        if (isInvalid) {
            setAlertMessage("Preencha todos os campos obrigatórios (*) para este tipo de veículo.");
            return;
        }

        // Aviso para Caminhões sem Horímetro (abre modal)
        if (vehicleGroup === 'Caminhões' && (formData.horimetro || '').toString().trim() === '') {
            setNoHorimetroWarning("O horímetro para caminhões é recomendado. Liberar mesmo assim?");
            setIsNoHorimetroConfirmVisible(true);
            return; // Espera confirmação
        }

        // Se passou, executa o save
        executeSave();
    };

    // Função que realmente salva (chamada por handleSave ou pelo modal)
    const executeSave = async () => {
        setIsSaving(true);
        setIsNoHorimetroConfirmVisible(false); // Fecha modal de confirmação se estava aberto

        // Prepara payload para API
        const orderPayload = {
            vehicleId: formData.vehicleId,
            partnerId: formData.partnerId,
            obraId: formData.obraId || null,
            employeeId: formData.employeeId,
            // Adiciona T12:00:00Z para evitar problemas de fuso
            date: new Date(formData.date + 'T12:00:00Z').toISOString(), // ISO UTC
            odometro: parseFloat(formData.odometro) || null,
            horimetro: parseFloat(formData.horimetro) || null,
            horimetroDigital: parseFloat(formData.horimetroDigital) || null,
            horimetroAnalogico: parseFloat(formData.horimetroAnalogico) || null,
            isFillUp: formData.isFillUp,
            litrosLiberados: formData.isFillUp ? null : (parseFloat(formData.litrosLiberados) || 0),
            fuelType: formData.fuelType,
            needsArla: formData.needsArla,
            isFillUpArla: formData.isFillUpArla,
            litrosLiberadosArla: formData.isFillUpArla ? null : (parseFloat(formData.litrosLiberadosArla) || 0),
            outros: formData.outros || null,
            outrosValor: parseFloat(formData.outrosValor) || null,
             // Status, authNumber, confirmedBy, etc., são definidos pelo backend
        };

        try {
            let savedOrderData;
            if (isEditing) {
                // Atualiza (API retorna a ordem atualizada)
                savedOrderData = await apiClient.updateRefuelingOrder(orderToEdit.id, orderPayload);
                setAlertMessage(`Ordem Nº ${String(savedOrderData.authNumber || '').padStart(6, '0')} atualizada!`);
            } else {
                // Cria (API retorna a nova ordem com authNumber, status)
                savedOrderData = await apiClient.createRefuelingOrder(orderPayload);
                setAlertMessage(`Ordem Nº ${String(savedOrderData.authNumber || '').padStart(6, '0')} ${savedOrderData.status === 'Concluída' ? 'confirmada' : 'emitida'}!`);
            }

            reloadData(); // Recarrega dados globais

            // Prepara dados e gera PDF
            if (savedOrderData) {
                 const partner = partners.find(p => p.id === savedOrderData.partnerId);
                 const employee = employees.find(e => e.id === savedOrderData.employeeId);
                 const pdfData = {
                    ...savedOrderData,
                    partnerName: partner?.razaoSocial || savedOrderData.partnerName,
                    employeeName: employee?.nome || savedOrderData.employeeName,
                    createdBy: savedOrderData.createdBy || { userEmail: user?.email || 'N/A' },
                     // Passa as leituras usadas para o PDF
                     odometro: orderPayload.odometro,
                     horimetro: orderPayload.horimetro,
                     horimetroDigital: orderPayload.horimetroDigital,
                     horimetroAnalogico: orderPayload.horimetroAnalogico,
                 };
                 generatePDF(pdfData);
             }

            onClose(); // Fecha o modal
        } catch (error) {
            console.error("Erro ao salvar ordem:", error);
            setAlertMessage(error.message || "Falha ao salvar ordem.");
        } finally {
            setIsSaving(false);
        }
    };

    // Renderização do formulário
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
             <div className={`bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col my-auto ${vehicleWarning ? 'border-2 border-red-500' : ''}`}>
                 {/* Cabeçalho */}
                 <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                    <h2 className="text-xl sm:text-2xl font-bold">{isEditing ? 'Editar Ordem' : 'Emitir Ordem'} de Abastecimento</h2>
                     <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                 </div>

                 {/* Aviso do Veículo */}
                 {vehicleWarning && (
                    <div className="flex items-center gap-2 p-3 bg-red-100 text-red-800 font-semibold text-sm sticky top-[calc(4rem+1px)] sm:top-[calc(5rem+1px)] z-10">
                        <AlertTriangle size={20} /> <p>{vehicleWarning}</p>
                    </div>
                 )}

                {/* Formulário com scroll */}
                <form onSubmit={handleSave} className="flex-1 overflow-y-auto">
                    <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        {/* Coluna 1 */}
                        <div className="space-y-4">
                            {/* Veículo */}
                            <div>
                                <label className="block font-medium text-gray-700 mb-1">Veículo *</label>
                                <select name="vehicleId" value={formData.vehicleId} onChange={handleVehicleChange} className="p-2 border rounded w-full bg-white" required>
                                    <option value="">Selecione...</option>
                                    {sortedVehicles.map(v => (
                                        <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa} ({v.tipo} - {v.modelo})</option>
                                    ))}
                                </select>
                                {pendingOrderWarning && (<div className="mt-1 p-1.5 bg-yellow-100 text-yellow-800 rounded text-xs flex items-center gap-1"><Info size={12} />{pendingOrderWarning}</div>)}
                                {recentRefuelWarning && (<div className="mt-1 p-1.5 bg-yellow-100 text-yellow-800 rounded text-xs flex items-center gap-1"><Info size={12} />{recentRefuelWarning}</div>)}
                            </div>

                             {/* Leituras Condicionais */}
                             <div className="grid grid-cols-2 gap-4">
                                {(vehicleGroup === 'Veículos Leves' || vehicleGroup === 'Caminhões') && (
                                    <div className={vehicleGroup === 'Veículos Leves' ? 'col-span-2' : ''}>
                                        <label className="block font-medium text-gray-700 mb-1">Odômetro (Km){vehicleGroup === 'Veículos Leves' ? ' *' : ''}</label>
                                        <input name="odometro" type="number" step="0.1" value={formData.odometro} onChange={handleChange} className="p-2 border rounded w-full bg-white" required={vehicleGroup === 'Veículos Leves'} placeholder={`Último: ${lastRefuel?.odometro ?? 'N/A'}`} />
                                    </div>
                                )}
                                {vehicleGroup === 'Caminhões' && (
                                    <div>
                                        <label className="block font-medium text-gray-700 mb-1">Horímetro (Hrs) *</label>
                                        <input name="horimetro" type="number" step="0.1" value={formData.horimetro} onChange={handleChange} className="p-2 border rounded w-full bg-white" required={vehicleGroup === 'Caminhões'} placeholder={`Último: ${lastRefuel?.horimetro ?? 'N/A'}`} />
                                    </div>
                                )}
                                {vehicleGroup === 'Máquinas Pesadas' && (<>
                                    {selectedVehicle?.possuiHorimetroDigital && (
                                        <div>
                                            <label className="block font-medium text-gray-700 mb-1">Horímetro Digital *</label>
                                            <input name="horimetroDigital" type="number" step="0.1" value={formData.horimetroDigital} onChange={handleChange} className="p-2 border rounded w-full bg-white" required={!selectedVehicle?.possuiHorimetroAnalogico || !formData.horimetroAnalogico} placeholder={`Último: ${lastRefuel?.horimetroDigital ?? 'N/A'}`} />
                                        </div>
                                    )}
                                     {selectedVehicle?.possuiHorimetroAnalogico && (
                                        <div>
                                            <label className="block font-medium text-gray-700 mb-1">Horímetro Analógico *</label>
                                            <input name="horimetroAnalogico" type="number" step="0.1" value={formData.horimetroAnalogico} onChange={handleChange} className="p-2 border rounded w-full bg-white" required={!selectedVehicle?.possuiHorimetroDigital || !formData.horimetroDigital} placeholder={`Último: ${lastRefuel?.horimetroAnalogico ?? 'N/A'}`} />
                                        </div>
                                    )}
                                    {!selectedVehicle?.possuiHorimetroDigital && !selectedVehicle?.possuiHorimetroAnalogico && (
                                        <p className="col-span-2 text-xs text-red-600">Este veículo não possui horímetro digital ou analógico cadastrado.</p>
                                    )}
                                </>)}
                             </div>

                            {/* Funcionário */}
                            <div>
                                <label className="block font-medium text-gray-700 mb-1">Funcionário Autorizado *</label>
                                <select name="employeeId" value={formData.employeeId} onChange={handleChange} className="p-2 border rounded w-full bg-white" required>
                                    <option value="">Selecione...</option>
                                    {sortedEmployees.map(e => (
                                        <option key={e.id} value={e.id}>{e.nome} {(e.vulgo || '') ? `(${e.vulgo})` : ''}</option>
                                    ))}
                                </select>
                            </div>

                             {/* Posto */}
                            <div>
                                <label className="block font-medium text-gray-700 mb-1">Posto *</label>
                                <select name="partnerId" value={formData.partnerId} onChange={handleChange} className="p-2 border rounded w-full bg-white" required>
                                    <option value="">Selecione...</option>
                                    {sortedPartners.map(p => <option key={p.id} value={p.id}>{p.razaoSocial}</option>)}
                                </select>
                            </div>

                            {/* Obra */}
                            <div>
                                <label className="block font-medium text-gray-700 mb-1">Obra (Opcional)</label>
                                <select name="obraId" value={formData.obraId} onChange={handleChange} className="p-2 border rounded w-full bg-white">
                                    <option value="">Nenhuma / Pátio / Outro</option>
                                    {sortedObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                    {extraObraOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>

                            {/* Data */}
                            <div>
                                <label className="block font-medium text-gray-700 mb-1">Data *</label>
                                <input name="date" type="date" value={formData.date} onChange={handleChange} className="p-2 border rounded w-full bg-white" required />
                            </div>

                        </div>

                        {/* Coluna 2 */}
                        <div className="space-y-4">
                            {/* Último Abastecimento */}
                             <div className="p-3 bg-gray-50 rounded-lg border">
                                <h3 className="font-semibold text-gray-700 mb-1 text-base">Último Abastecimento</h3>
                                {lastRefuel ? (
                                    <div className="text-xs space-y-0.5 text-gray-600">
                                        <p><strong>Data:</strong> {lastRefuel.date ? new Date(lastRefuel.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</p>
                                        <p><strong>Posto:</strong> {lastRefuel.partnerName || 'N/A'}</p>
                                        <p><strong>Odômetro:</strong> {lastRefuel.odometro ?? 'N/A'}</p>
                                        {lastRefuel.horimetro != null && <p><strong>Horímetro (C):</strong> {lastRefuel.horimetro}</p>}
                                        {lastRefuel.horimetroDigital != null && <p><strong>Horímetro (M-D):</strong> {lastRefuel.horimetroDigital}</p>}
                                         {lastRefuel.horimetroAnalogico != null && <p><strong>Horímetro (M-A):</strong> {lastRefuel.horimetroAnalogico}</p>}
                                        <p><strong>Litros:</strong> {lastRefuel.litrosAbastecidos ?? 'N/A'}</p>
                                    </div>
                                ) : <p className="text-xs text-gray-500 italic">Nenhum registro anterior.</p>}
                            </div>

                             {/* Combustível */}
                             <div className="border-t pt-4 space-y-2">
                                <h3 className="font-semibold text-gray-700 text-base">Combustível *</h3>
                                <select name="fuelType" value={formData.fuelType} onChange={handleChange} className="p-2 border rounded w-full bg-white" required disabled={!formData.partnerId}>
                                    <option value="">{!formData.partnerId ? 'Selecione um posto' : 'Selecione o Combustível'}</option>
                                    {availableFuels.map(f => {
                                         let label = f.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                         if (f === 'dieselS10') label = 'Diesel S10';
                                         return <option key={f} value={f}>{label}</option>;
                                    })}
                                </select>
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" name="isFillUp" id="isFillUp" checked={formData.isFillUp} onChange={handleChange} className="h-4 w-4 rounded text-yellow-600 focus:ring-yellow-500 border-gray-300"/>
                                    <label htmlFor="isFillUp" className="font-medium text-gray-700 cursor-pointer">Completar Tanque</label>
                                </div>
                                <input name="litrosLiberados" type="number" step="0.01" min="0" value={formData.litrosLiberados} onChange={handleChange} placeholder="Litros Liberados *" className="p-2 border rounded w-full bg-white" disabled={formData.isFillUp} required={!formData.isFillUp}/>
                             </div>

                             {/* Arla */}
                             <div className="border-t pt-4 space-y-2">
                                 <div className="flex items-center gap-2">
                                    <input type="checkbox" name="needsArla" id="needsArla" checked={formData.needsArla} onChange={handleChange} className="h-4 w-4 rounded text-yellow-600 focus:ring-yellow-500 border-gray-300"/>
                                    <label htmlFor="needsArla" className="font-semibold text-gray-700 text-base cursor-pointer">Abastecer Arla 32</label>
                                </div>
                                {formData.needsArla && (
                                    <div className="pl-6 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <input type="checkbox" name="isFillUpArla" id="isFillUpArla" checked={formData.isFillUpArla} onChange={handleChange} className="h-4 w-4 rounded text-yellow-600 focus:ring-yellow-500 border-gray-300"/>
                                            <label htmlFor="isFillUpArla" className="font-medium text-gray-700 cursor-pointer">Completar Tanque de Arla</label>
                                        </div>
                                        <input name="litrosLiberadosArla" type="number" step="0.01" min="0" value={formData.litrosLiberadosArla} onChange={handleChange} placeholder="Litros de Arla Liberados *" className="p-2 border rounded w-full bg-white" disabled={formData.isFillUpArla} required={formData.needsArla && !formData.isFillUpArla}/>
                                    </div>
                                )}
                            </div>

                             {/* Outros */}
                             <div className="border-t pt-4 space-y-2">
                                <h3 className="font-semibold text-gray-700 text-base">Outros</h3>
                                <input name="outros" value={formData.outros} onChange={handleChange} placeholder="Outros Itens / Observações" className="p-2 border rounded w-full bg-white" />
                                {formData.outros && (
                                    <input name="outrosValor" type="number" step="0.01" min="0" value={formData.outrosValor} onChange={handleChange} placeholder="Valor (R$)" className="p-2 border rounded w-full bg-white" />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Rodapé Fixo */}
                    <div className="p-4 bg-gray-50 border-t flex flex-col sm:flex-row justify-end gap-2 sticky bottom-0 z-10">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium w-full sm:w-auto" disabled={isSaving}>Cancelar</button>
                        <button type="submit" disabled={isSaving || !formData.vehicleId} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm w-full sm:w-auto">
                            {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : (isEditing ? 'Salvar Alterações' : 'Emitir e Gerar PDF')}
                        </button>
                    </div>
                </form>

                {/* Modal de Confirmação para Horímetro */}
                {isNoHorimetroConfirmVisible && (<ConfirmationModal
                    title="Aviso de Horímetro"
                    message={noHorimetroWarning}
                    onConfirm={() => executeSave()} // Chama executeSave diretamente
                    onClose={() => setIsNoHorimetroConfirmVisible(false)}
                    confirmText="Liberar Mesmo Assim"
                    confirmColor="bg-red-600 hover:bg-red-700 text-white"
                 />)}
            </div>
        </div>
    );
};


// Modal de Confirmação de Abastecimento (Usa apiClient)
const ConfirmRefuelingModal = ({ user, order, onClose, setAlertMessage, partners, obras, apiClient, reloadData }) => {
    // Inicializa com base nos litros liberados
    const initialFuelLiters = (!order.isFillUp && order.litrosLiberados != null) ? order.litrosLiberados.toString() : '';
    const initialArlaLiters = (order.needsArla && !order.isFillUpArla && order.litrosLiberadosArla != null) ? order.litrosLiberadosArla.toString() : '';

    const [litrosAbastecidos, setLitrosAbastecidos] = useState(initialFuelLiters);
    const [litrosAbastecidosArla, setLitrosAbastecidosArla] = useState(initialArlaLiters);
    const [isSaving, setIsSaving] = useState(false);

    const handleConfirm = async (e) => {
        e.preventDefault();
        const finalLiters = parseFloat(litrosAbastecidos) || 0;
        const finalArlaLiters = parseFloat(litrosAbastecidosArla) || 0;

        // Validação
        if (finalLiters <= 0) {
            setAlertMessage("Insira uma litragem de combustível válida (> 0).");
            return;
        }
        if (order.needsArla && finalArlaLiters <= 0) {
            setAlertMessage("Insira uma litragem de Arla 32 válida (> 0).");
             return;
        }

        setIsSaving(true);
        try {
            // Chama a API para confirmar
            // O backend define 'status', 'confirmedBy', 'confirmedAt' e pode criar despesa
            await apiClient.confirmRefuelingOrder(order.id, {
                litrosAbastecidos: finalLiters,
                litrosAbastecidosArla: order.needsArla ? finalArlaLiters : null,
            });

            setAlertMessage("Abastecimento confirmado com sucesso!");
            reloadData(); // Recarrega dados globais
            onClose();
        } catch (error) {
            console.error("Erro ao confirmar abastecimento:", error);
            setAlertMessage(error.message || "Falha ao confirmar abastecimento.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4"> {/* z-index maior que modal de ordem */}
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                 {/* Cabeçalho */}
                 <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Confirmar Abastecimento</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                 </div>
                 {/* Formulário */}
                <form onSubmit={handleConfirm}>
                    <div className="p-6 space-y-4 text-sm">
                        <p className="font-medium text-gray-700">Ordem Nº {String(order.authNumber || '').padStart(6, '0')}</p>
                        {/* Campo Combustível */}
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Total de litros de combustível abastecidos *</label>
                            <input type="number" step="0.01" min="0.01" value={litrosAbastecidos} onChange={e => setLitrosAbastecidos(e.target.value)} className="w-full p-2 border rounded text-sm bg-white" required placeholder={order.isFillUp ? "Litros" : `Liberado: ${order.litrosLiberados || 0} L`}/>
                        </div>
                        {/* Campo Arla */}
                        {order.needsArla && (
                             <div>
                                <label className="block font-medium text-gray-700 mb-1">Total de litros de Arla 32 abastecidos *</label>
                                <input type="number" step="0.01" min="0.01" value={litrosAbastecidosArla} onChange={e => setLitrosAbastecidosArla(e.target.value)} className="w-full p-2 border rounded text-sm bg-white" required={order.needsArla} placeholder={order.isFillUpArla ? "Litros" : `Liberado: ${order.litrosLiberadosArla || 0} L`}/>
                            </div>
                        )}
                    </div>
                    {/* Rodapé */}
                    <div className="p-4 bg-gray-50 border-t flex justify-end gap-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 disabled:bg-green-300 flex items-center justify-center gap-2 text-sm">
                             {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Confirmar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// Componente de Histórico (Usa dados da API, ajusta cálculo de médias)
const RefuelingHistory = ({ vehicleId, refuelings = [], vehicles = [], partners = [], employees = [], generateAuthorizationPDF, vehicleGroups = {} }) => {
    // Lógica de cálculo de médias (ajustada para datas API)
    const processedHistory = useMemo(() => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (!vehicle || !Array.isArray(refuelings)) return { historyWithAverages: [], overallAverage: null, unit: 'N/A', readingLabel: 'Leitura' };

        // Filtra e ordena histórico concluído
        const history = refuelings
            .filter(r => r.vehicleId === vehicleId && r.status === 'Concluída')
            .sort((a,b) => (b.date || '').localeCompare(a.date || '')); // Ordena por data string ISO

        // Determina unidade e rótulo
        const getUnitAndLabel = () => {
             if (!vehicleGroups || Object.keys(vehicleGroups).length === 0) return { unit: 'Km/L', label: 'Odômetro' };
             const group = Object.keys(vehicleGroups).find(g => vehicleGroups[g]?.includes(vehicle.tipo));
             if (vehicle.mediaCalculo === 'horimetro' || group === 'Máquinas Pesadas' || (group === 'Caminhões' && vehicle.mediaCalculo !== 'odometro')) {
                return { unit: 'L/Hr', label: 'Horímetro' };
            }
            return { unit: 'Km/L', label: 'Odômetro' };
        };
        const { unit, readingLabel } = getUnitAndLabel();

        let totalLitersForOverall = 0;
        let startReadingForOverall = 0;
        let endReadingForOverall = 0;

        // Calcula médias entre abastecimentos
        const historyWithAverages = history.map((current, index) => {
            const previous = history[index + 1]; // Abastecimento anterior
            let average = null;
            let readingUsed = 'N/A'; // Leitura usada para exibição

            // Pega a leitura principal do abastecimento ATUAL
            if (unit === 'Km/L') readingUsed = current.odometro ?? 'N/A';
            else readingUsed = current.horimetroDigital ?? current.horimetroAnalogico ?? current.horimetro ?? 'N/A';

            if (previous) {
                const liters = parseFloat(current.litrosAbastecidos || 0);
                let readingDiff = 0;
                let currentReadingNum = 0;
                let previousReadingNum = 0;

                // Define leituras para cálculo
                if (unit === 'Km/L') {
                    currentReadingNum = parseFloat(current.odometro || 0);
                    previousReadingNum = parseFloat(previous.odometro || 0);
                } else { // L/Hr
                    currentReadingNum = parseFloat(current.horimetroDigital ?? current.horimetroAnalogico ?? current.horimetro ?? 0);
                    previousReadingNum = parseFloat(previous.horimetroDigital ?? previous.horimetroAnalogico ?? previous.horimetro ?? 0);
                }
                readingDiff = currentReadingNum - previousReadingNum;

                // Calcula média
                if (readingDiff > 0 && liters > 0) {
                    average = (unit === 'Km/L') ? (readingDiff / liters) : (liters / readingDiff);
                }
            }
            return {...current, average, readingUsed };
        });

        // Calcula média geral
        if (history.length > 1) {
            const firstRefuel = history[history.length - 1]; // Mais antigo
            const lastRefuel = history[0]; // Mais recente

            // Soma litros (exceto o primeiro)
            totalLitersForOverall = history.slice(0, -1).reduce((sum, item) => sum + (parseFloat(item.litrosAbastecidos) || 0), 0);

            // Pega leituras inicial e final
            if (unit === 'Km/L') {
                startReadingForOverall = parseFloat(firstRefuel.odometro || 0);
                endReadingForOverall = parseFloat(lastRefuel.odometro || 0);
            } else { // L/Hr
                startReadingForOverall = parseFloat(firstRefuel.horimetroDigital ?? firstRefuel.horimetroAnalogico ?? firstRefuel.horimetro ?? 0);
                endReadingForOverall = parseFloat(lastRefuel.horimetroDigital ?? lastRefuel.horimetroAnalogico ?? lastRefuel.horimetro ?? 0);
            }
        }

        let overallAverage = null;
        const totalReadingDiff = endReadingForOverall - startReadingForOverall;

        // Calcula média geral final
        if (unit === 'Km/L') {
            if (totalReadingDiff > 0 && totalLitersForOverall > 0) overallAverage = totalReadingDiff / totalLitersForOverall;
        } else { // L/Hr
            if (totalReadingDiff > 0 && totalLitersForOverall > 0) overallAverage = totalLitersForOverall / totalReadingDiff;
        }

        return { historyWithAverages, overallAverage, unit, readingLabel };
    }, [vehicleId, refuelings, vehicles, vehicleGroups]); // Dependências


    // Geração de PDF do Histórico (ajustada para datas API)
    const generateHistoryPDF = () => {
        const doc = new jsPDF();
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (!vehicle) return;

        doc.setFontSize(18);
        doc.text(`Histórico de Abastecimento - ${vehicle.registroInterno}`, 14, 22);
        doc.setFontSize(11);
        doc.text(`Média Geral: ${processedHistory.overallAverage !== null ? `${processedHistory.overallAverage.toFixed(2)} ${processedHistory.unit}` : 'N/A'}`, 14, 28);


        const body = processedHistory.historyWithAverages.map(h => [
            h.date ? new Date(h.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A', // Formata UTC
            h.partnerName || 'N/A',
            h.readingUsed, // Usa a leitura formatada
            (h.litrosAbastecidos || 0).toFixed(2),
            h.average ? h.average.toFixed(2) : '-'
        ]);

        autoTable(doc, {
            startY: 35,
            head: [['Data', 'Posto', processedHistory.readingLabel, 'Litros', `Média (${processedHistory.unit})`]],
            body: body,
            theme: 'grid', // Usa grid
            headStyles: { fillColor: [255, 193, 7], textColor: [0, 0, 0] }, // Amarelo com texto preto
            styles: { fontSize: 8 },
            columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } }, // Alinha números
        });

        doc.save(`Historico_Abastecimento_${vehicle.registroInterno}.pdf`);
    };

    // Renderização do Histórico
    if (!vehicleId) return <p className="text-gray-500 italic text-sm">Selecione um veículo acima.</p>;
    if (processedHistory.historyWithAverages.length === 0) {
        return <p className="text-gray-500 italic text-sm">Nenhum histórico concluído para este veículo.</p>;
    }

    return (
        <div>
             {/* Cabeçalho */}
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-2">
                 <h3 className="font-bold text-base sm:text-lg text-gray-800">
                     Média Geral: {processedHistory.overallAverage !== null ? `${processedHistory.overallAverage.toFixed(2)} ${processedHistory.unit}` : 'Insuficiente'}
                 </h3>
                 <button onClick={generateHistoryPDF} className="flex items-center gap-1.5 px-3 py-1 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition" disabled={processedHistory.historyWithAverages.length === 0}>
                     <Download size={12}/> Gerar PDF
                 </button>
             </div>
             {/* Tabela */}
            <div className="max-h-80 overflow-y-auto custom-scrollbar pr-1 border rounded-md">
                <table className="w-full text-left text-xs">
                    <thead className="bg-gray-100 sticky top-0 z-10 text-gray-600 uppercase">
                        <tr>
                            <th className="p-1.5">Data</th>
                            <th className="p-1.5">Posto</th>
                            <th className="p-1.5">{processedHistory.readingLabel}</th>
                            <th className="p-1.5 text-right">Litros</th>
                            <th className="p-1.5 text-right">Média ({processedHistory.unit})</th>
                            <th className="p-1.5 text-center">PDF</th>
                        </tr>
                    </thead>
                    <tbody>
                        {processedHistory.historyWithAverages.map(h => (
                            <tr key={h.id} className="border-b last:border-b-0 hover:bg-gray-50">
                                <td className="p-1.5 whitespace-nowrap">{h.date ? new Date(h.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</td>
                                <td className="p-1.5 truncate" title={h.partnerName || 'N/A'}>{h.partnerName || 'N/A'}</td>
                                <td className="p-1.5">{h.readingUsed}</td>
                                <td className="p-1.5 text-right">{(h.litrosAbastecidos || 0).toFixed(2)}</td>
                                <td className={`p-1.5 text-right font-bold ${h.average === null ? 'text-gray-400' : ''}`}>{h.average ? h.average.toFixed(2) : '-'}</td>
                                <td className="p-1.5 text-center">
                                    <button onClick={() => generateAuthorizationPDF(h, vehicles, partners, employees, vehicleGroups)} title="Reimprimir PDF" className="p-1 text-gray-400 hover:text-blue-600 hover:bg-gray-200 rounded-full">
                                        <Printer size={12} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


export default RefuelingPage;
