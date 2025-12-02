import React, { useState, useMemo } from 'react';
import { PlusCircle, Printer, Edit, Trash2, CheckCircle, Search, History } from 'lucide-react';
import ProtectedComponent from '../components/ProtectedComponent'; 
import { jsPDF } from 'jspdf'; 
import autoTable from 'jspdf-autotable'; 

// Importações corretas baseadas na estrutura original do projeto
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
    const [openOrdersSearchTerm, setOpenOrdersSearchTerm] = useState('');
    const [latestOrdersSearchTerm, setLatestOrdersSearchTerm] = useState('');

    // --- HELPER: Validação de Data (Consistente com todo o sistema) ---
    const isValidDbDate = (dateString) => {
        if (!dateString) return false;
        const str = String(dateString);
        // Filtra strings vazias, nulas, ou data "zero" do MySQL/Unix
        return str.length > 5 && !str.startsWith('0000') && str !== '1970-01-01T00:00:00.000Z';
    };

    // --- HELPER: Formatação de Data Segura ---
    const formatDateSafe = (dateInput) => {
        if (!isValidDbDate(dateInput)) return 'N/A';
        try {
            let dateStr = String(dateInput);
            // Se for string SQL (YYYY-MM-DD HH:MM:SS), substitui espaço por T
            if (dateStr.includes(' ') && !dateStr.includes('T')) {
                dateStr = dateStr.replace(' ', 'T');
            }
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return 'Data Inválida';
            // Força UTC para evitar erro de fuso horário (D-1)
            return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()).toLocaleDateString('pt-BR');
        } catch { return 'Erro'; }
    };

    // --- FILTROS ---
    const openRefuelings = useMemo(() => {
        return refuelings
            .filter(r => r.status === 'Aberta')
            .sort((a,b) => (b.authNumber || 0) - (a.authNumber || 0));
    }, [refuelings]);

    const latestRefuelings = useMemo(() => {
        let list = [...refuelings].filter(r => r.status === 'Concluída' || r.status === 'Cancelada'); 
        
        if (latestOrdersSearchTerm) {
            const term = latestOrdersSearchTerm.toLowerCase();
            list = list.filter(o => {
                const vehicle = vehicles.find(v => v.id === o.vehicleId);
                const orderNum = String(o.authNumber || '');
                const re = vehicle?.registroInterno?.toLowerCase() || '';
                const placa = vehicle?.placa?.toLowerCase() || '';
                
                return orderNum.includes(term) || re.includes(term) || placa.includes(term);
            });
        }

        return list
            .sort((a,b) => (b.authNumber || 0) - (a.authNumber || 0))
            .slice(0, 20); 
    }, [refuelings, latestOrdersSearchTerm, vehicles]);

    const sortedVehicles = useMemo(() => {
        return [...vehicles].sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || ''));
    }, [vehicles]);

    // --- GERAÇÃO DE PDF (Síncrona - Padrão) ---
    const generateAuthorizationPDF = (order, vehiclesList = vehicles, partnersList = partners, employeesList = employees, groups = vehicleGroups) => {
        try {
            const buildPdf = (logoDataUrl) => {
                const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                const pageWidth = doc.internal.pageSize.getWidth();
                const effectivePageHeight = 148.5; 
                const margin = 10;

                const vehicle = vehiclesList.find(v => v.id === order.vehicleId);
                const partner = partnersList.find(p => p.id === order.partnerId);
                const employee = employeesList.find(e => e.id === order.employeeId);
                
                // Correção de Data no PDF usando lógica segura
                // Verifica tanto 'data' (banco novo) quanto 'date' (legado/frontend)
                const dateToUse = order.data || order.date;
                let emissionDateStr = 'N/A';
                if (isValidDbDate(dateToUse)) {
                    emissionDateStr = formatDateSafe(dateToUse);
                }

                if (logoDataUrl) {
                    const imgWidth = 45;
                    const imgHeight = 16.875;
                    try {
                        doc.addImage(logoDataUrl, 'PNG', margin, 10, imgWidth, imgHeight);
                    } catch (e) {
                        console.error("Erro ao adicionar logo ao PDF:", e);
                    }
                }

                doc.setFontSize(16);
                doc.text(`Autorização de Abastecimento`, pageWidth - margin, 15, { align: 'right' });
                doc.setFontSize(12);
                doc.text(`Nº: ${String(order.authNumber || '0').padStart(6, '0')}`, pageWidth - margin, 22, { align: 'right' });

                let leituraLabel = 'Leitura';
                let leituraValue = 'N/A';
                if (vehicle && groups && Object.keys(groups).length > 0) {
                     const group = Object.keys(groups).find(g => groups[g]?.includes(vehicle.tipo));
                     if (group === 'Máquinas Pesadas') {
                         leituraLabel = 'Horímetro';
                         leituraValue = order.horimetroDigital || order.horimetroAnalogico || order.horimetro || 'N/A';
                     } else if (group === 'Caminhões') {
                         if (order.horimetro != null && order.horimetro > 0) {
                            leituraLabel = 'Horímetro';
                            leituraValue = order.horimetro;
                         } else {
                            leituraLabel = 'Odômetro';
                            leituraValue = order.odometro || 'N/A';
                         }
                     } else { 
                         leituraLabel = 'Odômetro';
                         leituraValue = order.odometro || 'N/A';
                     }
                } else { 
                     // Fallback genérico
                     if (order.horimetro || order.horimetroDigital || order.horimetroAnalogico) {
                         leituraLabel = 'Horímetro';
                         leituraValue = order.horimetroDigital || order.horimetro || order.horimetroAnalogico;
                     } else {
                         leituraLabel = 'Odômetro';
                         leituraValue = order.odometro || 'N/A';
                     }
                }

                const body = [
                    ['Data de Emissão', emissionDateStr],
                    ['Funcionário Autorizado', employee?.nome || 'Não especificado'],
                    ['Veículo Autorizado', `${vehicle?.registroInterno || 'N/A'} - ${vehicle?.placa || 'N/A'}`],
                    ['Modelo', `${vehicle?.marca || ''} ${vehicle?.modelo || ''}`.trim() || 'N/A'],
                    [leituraLabel, `${leituraValue}`],
                    ['Posto Autorizado', partner?.razaoSocial || order.partnerName || 'N/A'],
                    ['Combustível Autorizado', order.fuelType || 'N/A'],
                    ['Litros Liberados', order.isFillUp ? 'Completar Tanque' : `${order.litrosLiberados || 0} L`],
                ];

                if (order.needsArla) {
                    body.push(['Arla 32 Autorizado', order.isFillUpArla ? 'Completar Tanque' : `${order.litrosLiberadosArla || 0} L`]);
                }
                if (order.outros) {
                     body.push(['Outros Itens/Observação', `${order.outros} ${order.outrosValor ? `(R$ ${parseFloat(order.outrosValor || 0).toFixed(2)})` : ''}`]);
                }

                const createdByEmail = order.createdBy?.userEmail || order.createdByEmail || 'N/A';
                body.push(['Emitido por', createdByEmail]);

                autoTable(doc, {
                    startY: 35,
                    body: body,
                    theme: 'striped',
                    styles: { fontSize: 9, cellPadding: 1.5 },
                    headStyles: { fillColor: [24, 49, 83] },
                    columnStyles: {
                        0: { cellWidth: 40, fontStyle: 'bold' }
                    }
                });

                let finalY = (doc.lastAutoTable?.finalY || 35) + 10;
                const footerStartY = Math.max(finalY, effectivePageHeight - 20); 
                doc.setFontSize(8);
                doc.setFont('helvetica', 'italic');
                doc.text('*A presente ordem de abastecimento é válida exclusivamente para a placa/RE indicada e para o tipo de combustível previamente autorizado.', margin, footerStartY);
                doc.text('*Estão autorizados somente os itens discriminados acima.', margin, footerStartY + 4);
                doc.text('*Itens adicionais ou combustíveis distintos não serão objeto de faturamento.', margin, footerStartY + 8);

                doc.setLineDashPattern([1, 1], 0);
                doc.setDrawColor(180, 180, 180);
                doc.line(0, effectivePageHeight, pageWidth, effectivePageHeight);

                doc.output('dataurlnewwindow', { filename: `Autorizacao_${order.authNumber}.pdf` });
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

        } catch (error) {
            console.error("Erro ao gerar PDF:", error);
            setAlertMessage("Erro ao gerar o PDF.");
        }
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
                
                {/* ESQUERDA: Ordens Pendentes */}
                <div className="xl:col-span-4 space-y-4">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 h-full flex flex-col">
                        <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b flex justify-between">
                            Ordens Abertas
                            <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-full">{openRefuelings.length}</span>
                        </h2>
                        
                        <div className="relative mb-3">
                            <input 
                                type="text" 
                                placeholder="Buscar ordem, placa..." 
                                value={openOrdersSearchTerm}
                                onChange={e => setOpenOrdersSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                            />
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                        </div>

                        <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[600px]">
                            {openRefuelings
                                .filter(o => {
                                    if(!openOrdersSearchTerm) return true;
                                    const v = vehicles.find(v => v.id === o.vehicleId);
                                    return String(o.authNumber).includes(openOrdersSearchTerm) || v?.placa?.toLowerCase().includes(openOrdersSearchTerm.toLowerCase());
                                })
                                .map(order => {
                                const vehicle = vehicles.find(v => v.id === order.vehicleId);
                                return (
                                    <div key={order.id} className="p-4 border border-l-4 border-l-yellow-400 rounded-lg bg-gray-50">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="font-bold text-gray-900 text-lg">#{String(order.authNumber).padStart(6, '0')}</div>
                                                <p className="text-sm font-bold text-gray-700">{vehicle?.registroInterno} - {vehicle?.placa}</p>
                                                {/* DATA ADICIONADA AQUI */}
                                                <p className="text-xs text-gray-600 mb-1">{formatDateSafe(order.data || order.date)}</p>
                                                <p className="text-xs text-gray-500">{order.partnerName}</p>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <ProtectedComponent requiredPermission="editor">
                                                    <div className="flex gap-1 mb-1">
                                                        <button onClick={() => { setOrderToConfirm(order); setIsConfirmModalOpen(true); }} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200" title="Confirmar"><CheckCircle size={16}/></button>
                                                        <button onClick={() => { setEditingOrder(order); setIsOrderModalOpen(true); }} className="p-1.5 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200" title="Editar"><Edit size={16}/></button>
                                                        <button onClick={() => { setItemToDelete(order.id); setIsDeleteModalOpen(true); }} className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200" title="Excluir"><Trash2 size={16}/></button>
                                                    </div>
                                                </ProtectedComponent>
                                                <button onClick={() => generateAuthorizationPDF(order)} className="p-1.5 bg-white border text-gray-600 rounded hover:bg-gray-50 w-full flex justify-center" title="PDF"><Printer size={16}/></button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {openRefuelings.length === 0 && <p className="text-center text-gray-400 py-4 italic">Nenhuma ordem pendente.</p>}
                        </div>
                    </div>
                </div>

                {/* DIREITA: Histórico e Consultas */}
                <div className="xl:col-span-8 space-y-6">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex flex-col sm:flex-row justify-between items-center mb-4 pb-2 border-b gap-4">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <History size={20} className="text-blue-500"/> Últimas Ordens Emitidas
                            </h2>
                            <div className="relative w-full sm:w-64">
                                <input 
                                    type="text" 
                                    placeholder="Filtrar por Nº, RE ou Placa..." 
                                    value={latestOrdersSearchTerm}
                                    onChange={e => setLatestOrdersSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                                />
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                            </div>
                        </div>

                        <div className="overflow-x-auto max-h-80 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-xs sticky top-0 z-10">
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
                                                {/* Correção: Verifica order.data ou order.date */}
                                                <td className="p-3">{formatDateSafe(order.data || order.date)}</td>
                                                <td className="p-3">{vehicle?.registroInterno} - {vehicle?.placa}</td>
                                                <td className="p-3 truncate max-w-[150px]">{order.partnerName}</td>
                                                <td className="p-3 text-right flex justify-end gap-1">
                                                    <button onClick={() => generateAuthorizationPDF(order)} title="PDF" className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"><Printer size={16}/></button>
                                                    <ProtectedComponent requiredPermission="editor">
                                                        <button onClick={() => { setEditingOrder(order); setIsOrderModalOpen(true); }} title="Editar" className="p-1.5 text-gray-400 hover:text-yellow-600 rounded hover:bg-yellow-50"><Edit size={16}/></button>
                                                        <button onClick={() => { setItemToDelete(order.id); setIsDeleteModalOpen(true); }} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"><Trash2 size={16}/></button>
                                                    </ProtectedComponent>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {latestRefuelings.length === 0 && (
                                        <tr><td colSpan="6" className="p-4 text-center text-gray-400 italic">Nenhuma ordem encontrada.</td></tr>
                                    )}
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