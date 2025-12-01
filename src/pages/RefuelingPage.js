import React, { useState, useMemo } from 'react';
import { PlusCircle, Printer, Edit, Trash2, CheckCircle, Search, Filter, History } from 'lucide-react';
import ProtectedComponent from '../components/ProtectedComponent';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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
    expenses = [], 
    setAlertMessage,
    PasswordConfirmationModal, 
    ConfirmationModal,
    extraObraOptions = [],
    vehicleGroups = {},
    apiClient, 
    reloadData
}) => {
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    
    const [editingOrder, setEditingOrder] = useState(null);
    const [orderToConfirm, setOrderToConfirm] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // --- FILTROS ---
    const openRefuelings = useMemo(() => {
        return refuelings
            .filter(r => r.status === 'Aberta')
            .sort((a,b) => (b.authNumber || 0) - (a.authNumber || 0));
    }, [refuelings]);

    // Regra 2: Painel de Últimas Ordens (Todas) - Z a A
    const latestRefuelings = useMemo(() => {
        return [...refuelings]
            .sort((a,b) => (b.authNumber || 0) - (a.authNumber || 0))
            .slice(0, 15); // Limite de 15 para não travar a tela
    }, [refuelings]);

    const sortedVehicles = useMemo(() => {
        return [...vehicles].sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || ''));
    }, [vehicles]);

    const generateAuthorizationPDF = (order, vehiclesList = vehicles, partnersList = partners, employeesList = employees, groups = vehicleGroups) => {
        const buildPdf = (logoDataUrl) => {
            const doc = new jsPDF();
            const vehicle = vehiclesList.find(v => v.id === order.vehicleId);
            const partner = partnersList.find(p => p.id === order.partnerId);
            const employee = employeesList.find(e => e.id === order.employeeId);
            
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

            if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', 14, 10, 45, 16);
            
            doc.setFontSize(18);
            doc.setTextColor(33, 33, 33);
            doc.text(`Autorização de Abastecimento`, 200, 18, { align: 'right' });
            doc.setFontSize(12);
            doc.setTextColor(100, 100, 100);
            doc.text(`Nº CONTROLE: ${String(order.authNumber || '0').padStart(6, '0')}`, 200, 25, { align: 'right' });

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
                headStyles: { fillColor: [255, 193, 7], textColor: [0,0,0], fontStyle: 'bold' },
                columnStyles: { 0: { fontStyle: 'bold', width: 60 } },
                styles: { fontSize: 10, cellPadding: 3 }
            });

            const finalY = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text('Documento gerado eletronicamente pelo Sistema Frotas MAK.', 14, 285);
            doc.text('Válido apenas para o veículo e combustível indicados.', 200, 285, { align: 'right' });

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

    const handleDeleteOrder = async () => {
        if (!itemToDelete) return;
        try {
            await apiClient.deleteRefuelingOrder(itemToDelete);
            setAlertMessage("Ordem excluída com sucesso.");
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
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <CheckCircle className="text-yellow-500" /> Controle de Abastecimento
                    </h1>
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
                        <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b flex justify-between">
                            Ordens Abertas
                            <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-full">{openRefuelings.length}</span>
                        </h2>
                        
                        <div className="relative mb-3">
                            <input 
                                type="text" 
                                placeholder="Buscar ordem..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                            />
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                        </div>

                        <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[600px]">
                            {openRefuelings
                                .filter(o => String(o.authNumber).includes(searchTerm))
                                .map(order => {
                                const vehicle = vehicles.find(v => v.id === order.vehicleId);
                                return (
                                    <div key={order.id} className="p-4 border border-l-4 border-l-yellow-400 rounded-lg bg-gray-50">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="font-bold text-gray-900 text-lg">#{String(order.authNumber).padStart(6, '0')}</div>
                                                <p className="text-sm font-bold text-gray-700">{vehicle?.registroInterno}</p>
                                                <p className="text-xs text-gray-500">{order.partnerName}</p>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => { setOrderToConfirm(order); setIsConfirmModalOpen(true); }} className="p-2 bg-green-100 text-green-700 rounded hover:bg-green-200"><CheckCircle size={16}/></button>
                                                </ProtectedComponent>
                                                <button onClick={() => generateAuthorizationPDF(order)} className="p-2 bg-white border text-gray-600 rounded hover:bg-gray-50"><Printer size={16}/></button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* DIREITA: Histórico e Consultas */}
                <div className="xl:col-span-8 space-y-6">
                    {/* Regra 2: Painel de Últimas Ordens (Restaurado) */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b flex items-center gap-2">
                            <History size={20} className="text-blue-500"/> Últimas Ordens Emitidas (Recentes)
                        </h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-xs">
                                    <tr>
                                        <th className="p-3">Nº</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3">Data</th>
                                        <th className="p-3">Veículo</th>
                                        <th className="p-3">Posto</th>
                                        <th className="p-3 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {latestRefuelings.map(order => {
                                        const vehicle = vehicles.find(v => v.id === order.vehicleId);
                                        return (
                                            <tr key={order.id} className="hover:bg-gray-50">
                                                <td className="p-3 font-bold">#{String(order.authNumber).padStart(6,'0')}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${order.status === 'Concluída' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                        {order.status}
                                                    </span>
                                                </td>
                                                <td className="p-3">{new Date(order.date).toLocaleDateString('pt-BR', {timeZone:'UTC'})}</td>
                                                <td className="p-3">{vehicle?.registroInterno}</td>
                                                <td className="p-3 truncate max-w-[150px]">{order.partnerName}</td>
                                                <td className="p-3 text-right flex justify-end gap-1">
                                                    <button onClick={() => generateAuthorizationPDF(order)} title="PDF" className="p-1.5 text-gray-400 hover:text-blue-600"><Printer size={16}/></button>
                                                    <ProtectedComponent requiredPermission="editor">
                                                        <button onClick={() => { setEditingOrder(order); setIsOrderModalOpen(true); }} title="Editar" className="p-1.5 text-gray-400 hover:text-yellow-600"><Edit size={16}/></button>
                                                        <button onClick={() => { setItemToDelete(order.id); setIsDeleteModalOpen(true); }} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={16}/></button>
                                                    </ProtectedComponent>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <h2 className="text-lg font-bold text-gray-800">Análise Detalhada por Veículo</h2>
                            <select 
                                value={selectedVehicleId} 
                                onChange={(e) => setSelectedVehicleId(e.target.value)} 
                                className="p-2 border rounded-lg bg-gray-50"
                            >
                                <option value="">-- Selecione o Veículo --</option>
                                {sortedVehicles.map(v => (
                                    <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa}</option>
                                ))}
                            </select>
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

            {isOrderModalOpen && (
                <RefuelingOrderModal 
                    user={user}
                    orderToEdit={editingOrder}
                    vehicles={vehicles}
                    obras={obras}
                    partners={partners}
                    employees={employees}
                    refuelings={refuelings}
                    expenses={expenses}
                    vehicleGroups={vehicleGroups}
                    extraObraOptions={extraObraOptions}
                    onClose={() => setIsOrderModalOpen(false)}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    reloadData={reloadData}
                    onGeneratePDF={generateAuthorizationPDF}
                    PasswordConfirmationModal={PasswordConfirmationModal}
                    ConfirmationModal={ConfirmationModal}
                />
            )}

            {isConfirmModalOpen && orderToConfirm && (
                <ConfirmRefuelingModal 
                    user={user}
                    order={orderToConfirm}
                    onClose={() => setIsConfirmModalOpen(false)}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    reloadData={reloadData}
                    refuelings={refuelings}
                />
            )}

            {isDeleteModalOpen && itemToDelete && (
                <PasswordConfirmationModal 
                    message="Excluir esta ordem? Se confirmada, o custo será estornado."
                    onConfirm={handleDeleteOrder}
                    onClose={() => setIsDeleteModalOpen(false)}
                    apiClient={apiClient}
                />
            )}
        </div>
    );
};

export default RefuelingPage;