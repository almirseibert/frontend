import React, { useState, useMemo } from 'react';
import { PlusCircle, Printer, Edit, Trash2, CheckCircle, Search, Filter } from 'lucide-react';
import ProtectedComponent from '../components/ProtectedComponent';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Componentes Filhos
import RefuelingHistory from '../components/RefuelingHistory';
import RefuelingOrderModal from '../components/modals/RefuelingOrderModal';
import ConfirmRefuelingModal from '../components/modals/ConfirmRefuelingModal';

const RefuelingPage = ({
    user,
    vehicles = [],
    obras = [],
    partners = [],
    refuelings = [], 
    employees = [],
    expenses = [], // Necessário para o cálculo de orçamento da obra (Regra 10)
    setAlertMessage,
    PasswordConfirmationModal, 
    ConfirmationModal,
    extraObraOptions = [],
    vehicleGroups = {},
    apiClient, 
    reloadData
}) => {
    // --- ESTADOS ---
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    
    const [editingOrder, setEditingOrder] = useState(null);
    const [orderToConfirm, setOrderToConfirm] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // --- FILTROS & ORDENAÇÃO (Regra 9) ---
    // Filtra ordens abertas
    const openRefuelings = useMemo(() => {
        return refuelings
            .filter(r => r.status === 'Aberta')
            .sort((a,b) => (b.authNumber || 0) - (a.authNumber || 0)); // Mais recente primeiro
    }, [refuelings]);

    // Filtra veículos para o select (Ordem Alfabética)
    const sortedVehicles = useMemo(() => {
        return [...vehicles].sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || ''));
    }, [vehicles]);

    // --- FUNÇÃO DE GERAR PDF (Regra 11 - Suporte para envio/impressão) ---
    const generateAuthorizationPDF = (order, vehiclesList = vehicles, partnersList = partners, employeesList = employees, groups = vehicleGroups) => {
        const buildPdf = (logoDataUrl) => {
            const doc = new jsPDF();
            const vehicle = vehiclesList.find(v => v.id === order.vehicleId);
            const partner = partnersList.find(p => p.id === order.partnerId);
            const employee = employeesList.find(e => e.id === order.employeeId);
            
            // Lógica de visualização da leitura
            let leituraLabel = 'Leitura';
            let leituraValue = 'N/A';
            
            if (vehicle && groups) {
                 const group = Object.keys(groups).find(g => groups[g]?.includes(vehicle.tipo));
                 const isHour = group === 'Máquinas Pesadas' || group === 'Caminhões Pesados' || (group === 'Caminhões' && vehicle.mediaCalculo === 'horimetro');
                 
                 leituraLabel = isHour ? 'Horímetro Atual' : 'Odômetro Atual';
                 if (isHour) {
                     leituraValue = order.horimetroDigital || order.horimetroAnalogico || order.horimetro || 'N/A';
                 } else {
                     leituraValue = order.odometro || 'N/A';
                 }
            }

            // Logo
            if (logoDataUrl) {
                doc.addImage(logoDataUrl, 'PNG', 14, 10, 45, 16);
            }
            
            // Cabeçalho
            doc.setFontSize(18);
            doc.setTextColor(33, 33, 33);
            doc.text(`Autorização de Abastecimento`, 200, 18, { align: 'right' });
            doc.setFontSize(12);
            doc.setTextColor(100, 100, 100);
            doc.text(`Nº CONTROLE: ${String(order.authNumber || '0').padStart(6, '0')}`, 200, 25, { align: 'right' });

            // Detalhes em Tabela
            autoTable(doc, {
                startY: 35,
                body: [
                    ['Data de Emissão', new Date(order.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })],
                    ['Posto Autorizado', partner?.razaoSocial || 'N/A'],
                    ['Veículo / Equipamento', `${vehicle?.registroInterno || ''} - ${vehicle?.placa || ''} (${vehicle?.modelo || ''})`],
                    ['Motorista / Operador', employee?.nome || 'N/A'],
                    [leituraLabel, leituraValue],
                    ['Combustível', order.fuelType === 'dieselS10' ? 'Diesel S10' : order.fuelType.toUpperCase()],
                    ['Quantidade', order.isFillUp ? 'COMPLETAR TANQUE' : `${order.litrosLiberados} Litros`],
                    ['Arla 32', order.needsArla ? (order.isFillUpArla ? 'COMPLETAR' : `${order.litrosLiberadosArla} L`) : 'Não'],
                    ['Observações', order.outros || '-']
                ],
                theme: 'grid',
                headStyles: { fillColor: [255, 193, 7], textColor: [0,0,0], fontStyle: 'bold' }, // Amarelo MAK
                columnStyles: { 0: { fontStyle: 'bold', width: 60 } },
                styles: { fontSize: 10, cellPadding: 3 }
            });

            // Rodapé com validação
            const finalY = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text('Documento gerado eletronicamente pelo Sistema Frotas MAK.', 14, 285);
            doc.text('Válido apenas para o veículo e combustível indicados.', 200, 285, { align: 'right' });

            // Assinaturas
            doc.setDrawColor(200);
            doc.line(14, finalY + 20, 90, finalY + 20);
            doc.text('Assinatura do Motorista', 14, finalY + 25);
            
            doc.line(110, finalY + 20, 196, finalY + 20);
            doc.text('Assinatura do Frentista', 110, finalY + 25);

            doc.save(`Ordem_${order.authNumber}_${vehicle?.registroInterno}.pdf`);
        };

        const logo = new Image();
        logo.crossOrigin = 'Anonymous';
        logo.src = 'https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png';
        logo.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = logo.width;
            canvas.height = logo.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(logo, 0, 0);
            buildPdf(canvas.toDataURL('image/png'));
        };
        logo.onerror = () => buildPdf(null);
    };

    // --- AÇÕES ---
    const handleDeleteOrder = async () => {
        if (!itemToDelete) return;
        try {
            await apiClient.deleteRefuelingOrder(itemToDelete);
            setAlertMessage("Ordem excluída e custos estornados (se aplicável).");
            reloadData();
        } catch (e) {
            setAlertMessage(`Erro ao excluir: ${e.message}`);
        } finally {
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 animate-fadeIn space-y-6">
            {/* Cabeçalho */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <CheckCircle className="text-yellow-500" /> Controle de Abastecimento
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Gerenciamento de ordens, médias e custos operacionais.</p>
                </div>
                <ProtectedComponent requiredPermission="editor">
                    <button 
                        onClick={() => { setEditingOrder(null); setIsOrderModalOpen(true); }} 
                        className="flex items-center gap-2 px-6 py-3 bg-yellow-400 text-gray-900 font-bold rounded-lg shadow hover:bg-yellow-500 transition active:scale-95 w-full md:w-auto justify-center"
                    >
                        <PlusCircle size={20} /> Emitir Nova Ordem
                    </button>
                </ProtectedComponent>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                
                {/* ESQUERDA: Ordens Pendentes (4 colunas) */}
                <div className="xl:col-span-4 space-y-4">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 h-full flex flex-col">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h2 className="text-lg font-bold text-gray-800">Ordens Abertas</h2>
                            <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-full">{openRefuelings.length}</span>
                        </div>
                        
                        {/* Busca rápida de ordens abertas */}
                        <div className="relative mb-3">
                            <input 
                                type="text" 
                                placeholder="Buscar ordem, placa..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                            />
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                        </div>

                        <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[600px]">
                            {openRefuelings
                                .filter(o => {
                                    if(!searchTerm) return true;
                                    const v = vehicles.find(v => v.id === o.vehicleId);
                                    return String(o.authNumber).includes(searchTerm) || v?.placa?.toLowerCase().includes(searchTerm.toLowerCase());
                                })
                                .map(order => {
                                const vehicle = vehicles.find(v => v.id === order.vehicleId);
                                return (
                                    <div key={order.id} className="p-4 border border-l-4 border-l-yellow-400 rounded-lg hover:shadow-md transition bg-gray-50 group">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-900 text-lg">#{String(order.authNumber).padStart(6, '0')}</span>
                                                    <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">{order.fuelType === 'dieselS10' ? 'S10' : 'GAS'}</span>
                                                </div>
                                                <p className="text-sm font-bold text-gray-700 mt-1">{vehicle?.registroInterno} - {vehicle?.placa}</p>
                                                <p className="text-xs text-gray-500 truncate max-w-[180px]">{order.partnerName}</p>
                                                <p className="text-xs text-gray-400 mt-1">{new Date(order.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p>
                                            </div>
                                            
                                            <div className="flex flex-col gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => { setOrderToConfirm(order); setIsConfirmModalOpen(true); }} title="Confirmar Abastecimento" className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 shadow-sm"><CheckCircle size={18}/></button>
                                                </ProtectedComponent>
                                                <button onClick={() => generateAuthorizationPDF(order)} title="Imprimir/PDF" className="p-2 bg-white border text-gray-600 rounded-lg hover:bg-gray-50 shadow-sm"><Printer size={18}/></button>
                                                <ProtectedComponent requiredPermission="editor">
                                                    <div className="flex gap-1">
                                                        <button onClick={() => { setEditingOrder(order); setIsOrderModalOpen(true); }} className="p-2 bg-white border text-yellow-600 rounded-lg hover:bg-yellow-50"><Edit size={16}/></button>
                                                        <button onClick={() => { setItemToDelete(order.id); setIsDeleteModalOpen(true); }} className="p-2 bg-white border text-red-600 rounded-lg hover:bg-red-50"><Trash2 size={16}/></button>
                                                    </div>
                                                </ProtectedComponent>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {openRefuelings.length === 0 && (
                                <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-lg border border-dashed">
                                    <CheckCircle className="mx-auto mb-2 opacity-50" size={30} />
                                    <p>Nenhuma ordem pendente.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* DIREITA: Histórico e Consultas (8 colunas) */}
                <div className="xl:col-span-8">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-full">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 border-b pb-4">
                            <h2 className="text-lg font-bold text-gray-800">Histórico & Análise de Consumo</h2>
                            
                            <div className="w-full sm:w-auto min-w-[300px]">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Selecione o Veículo</label>
                                <div className="relative">
                                    <select 
                                        value={selectedVehicleId} 
                                        onChange={(e) => setSelectedVehicleId(e.target.value)} 
                                        className="w-full p-2.5 pl-3 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
                                    >
                                        <option value="">-- Selecione para ver o histórico --</option>
                                        {sortedVehicles.map(v => (
                                            <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa} ({v.modelo})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <RefuelingHistory 
                            vehicleId={selectedVehicleId}
                            refuelings={refuelings}
                            vehicles={vehicles}
                            partners={partners}
                            employees={employees}
                            vehicleGroups={vehicleGroups}
                            onGeneratePDF={generateAuthorizationPDF}
                        />
                    </div>
                </div>
            </div>

            {/* --- MODAIS --- */}
            
            {/* Modal de Emissão/Edição */}
            {isOrderModalOpen && (
                <RefuelingOrderModal 
                    user={user}
                    orderToEdit={editingOrder}
                    vehicles={vehicles}
                    obras={obras}
                    partners={partners}
                    employees={employees}
                    refuelings={refuelings}
                    expenses={expenses} // Para cálculo de orçamento (Regra 10)
                    vehicleGroups={vehicleGroups}
                    extraObraOptions={extraObraOptions}
                    onClose={() => setIsOrderModalOpen(false)}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    reloadData={reloadData}
                    onGeneratePDF={generateAuthorizationPDF}
                    PasswordConfirmationModal={PasswordConfirmationModal}
                    ConfirmationModal={ConfirmationModal} // Para o aviso de horímetro em branco
                />
            )}

            {/* Modal de Confirmação Final (Preço e Litragem Real) */}
            {isConfirmModalOpen && orderToConfirm && (
                <ConfirmRefuelingModal 
                    user={user}
                    order={orderToConfirm}
                    vehicles={vehicles}
                    onClose={() => setIsConfirmModalOpen(false)}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    reloadData={reloadData}
                    refuelings={refuelings}
                    vehicleGroups={vehicleGroups}
                    ConfirmationModal={ConfirmationModal} // Para alerta de média (Regra 4)
                />
            )}

            {/* Modal de Exclusão (Protegido por Senha) */}
            {isDeleteModalOpen && itemToDelete && (
                <PasswordConfirmationModal 
                    message="Tem certeza que deseja excluir esta ordem? Se ela já foi confirmada, o custo financeiro será estornado do relatório da obra. Esta ação é irreversível."
                    onConfirm={handleDeleteOrder}
                    onClose={() => setIsDeleteModalOpen(false)}
                    apiClient={apiClient}
                />
            )}
        </div>
    );
};

export default RefuelingPage;