import React, { useState, useMemo } from 'react';
import { PlusCircle, Printer, Edit, Trash2, CheckCircle } from 'lucide-react';
import ProtectedComponent from '../components/ProtectedComponent';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Componentes
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
    const [editingOrder, setEditingOrder] = useState(null);
    const [orderToConfirm, setOrderToConfirm] = useState(null);
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [itemToDelete, setItemToDelete] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // --- FUNÇÃO DE GERAR PDF DA ORDEM (RESTITUIDA) ---
    // Esta função estava "perdida" ao separar os arquivos. Ela precisa existir aqui para ser passada.
    const generateAuthorizationPDF = (order, vehiclesList = vehicles, partnersList = partners, employeesList = employees, groups = vehicleGroups) => {
        const buildPdf = (logoDataUrl) => {
            const doc = new jsPDF();
            const vehicle = vehiclesList.find(v => v.id === order.vehicleId);
            const partner = partnersList.find(p => p.id === order.partnerId);
            const employee = employeesList.find(e => e.id === order.employeeId);
            
            // Lógica de leitura (Km vs Hr)
            let leituraLabel = 'Leitura';
            let leituraValue = 'N/A';
            
            // Mesma lógica de grupo do arquivo original
            if (vehicle && groups && Object.keys(groups).length > 0) {
                 const group = Object.keys(groups).find(g => groups[g]?.includes(vehicle.tipo));
                 if (group === 'Máquinas Pesadas') {
                     leituraLabel = 'Horímetro';
                     leituraValue = order.horimetroDigital || order.horimetroAnalogico || order.horimetro || 'N/A';
                 } else if (group === 'Caminhões') {
                     leituraLabel = order.horimetro ? 'Horímetro' : 'Odômetro';
                     leituraValue = order.horimetro || order.odometro || 'N/A';
                 } else {
                     leituraLabel = 'Odômetro';
                     leituraValue = order.odometro || 'N/A';
                 }
            }

            if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', 10, 10, 45, 17);
            
            doc.setFontSize(16);
            doc.text(`Autorização de Abastecimento`, 200, 15, { align: 'right' });
            doc.setFontSize(12);
            doc.text(`Nº: ${String(order.authNumber || '0').padStart(6, '0')}`, 200, 22, { align: 'right' });

            autoTable(doc, {
                startY: 35,
                body: [
                    ['Data', new Date(order.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })],
                    ['Funcionário', employee?.nome || 'N/A'],
                    ['Veículo', `${vehicle?.registroInterno || ''} - ${vehicle?.placa || ''}`],
                    [leituraLabel, leituraValue],
                    ['Posto', partner?.razaoSocial || 'N/A'],
                    ['Combustível', order.fuelType],
                    ['Litros', order.isFillUp ? 'Completar' : `${order.litrosLiberados} L`],
                    ['Observações', order.outros || '-']
                ],
                theme: 'striped',
                headStyles: { fillColor: [24, 49, 83] }
            });

            // Rodapé
            doc.setFontSize(8);
            doc.text('* Válido apenas para o veículo e combustível indicados.', 10, 280);
            doc.save(`Autorizacao_${order.authNumber}.pdf`);
        };

        // Carrega logo
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

    // --- FILTROS ---
    const openRefuelings = useMemo(() => {
        return refuelings
            .filter(r => r.status === 'Aberta')
            .sort((a,b) => (b.authNumber || 0) - (a.authNumber || 0));
    }, [refuelings]);

    // Função Delete
    const handleDeleteOrder = async () => {
        if (!itemToDelete) return;
        try {
            await apiClient.deleteRefuelingOrder(itemToDelete);
            setAlertMessage("Ordem excluída.");
            reloadData();
        } catch (e) {
            setAlertMessage("Erro ao excluir.");
        } finally {
            setIsDeleteModalOpen(false);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 animate-fadeIn">
            {/* Cabeçalho */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Controle de Abastecimento</h1>
                    <p className="text-gray-500 mt-1">Gerenciamento de ordens, médias e custos.</p>
                </div>
                <ProtectedComponent requiredPermission="editor">
                    <button 
                        onClick={() => { setEditingOrder(null); setIsOrderModalOpen(true); }} 
                        className="flex items-center gap-2 px-6 py-3 bg-yellow-400 text-gray-900 font-bold rounded-lg shadow-lg hover:bg-yellow-500 transition active:scale-95"
                    >
                        <PlusCircle size={20} /> Nova Ordem
                    </button>
                </ProtectedComponent>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* ESQUERDA: Ordens em Aberto */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">Ordens Pendentes</h2>
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {openRefuelings.length === 0 ? (
                            <p className="text-center text-gray-400 py-10 italic">Nenhuma ordem pendente.</p>
                        ) : (
                            openRefuelings.map(order => {
                                const vehicle = vehicles.find(v => v.id === order.vehicleId);
                                return (
                                    <div key={order.id} className="p-4 border border-l-4 border-l-yellow-400 rounded-lg hover:shadow-md transition bg-gray-50">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-bold text-lg text-gray-800">
                                                    #{String(order.authNumber).padStart(6, '0')} 
                                                    <span className="text-sm font-normal text-gray-500 ml-2">| {new Date(order.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                                                </h3>
                                                <p className="text-sm font-medium text-gray-700">{vehicle?.registroInterno} - {vehicle?.placa}</p>
                                                <p className="text-xs text-gray-500">{order.partnerName}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => generateAuthorizationPDF(order)} className="p-1.5 text-blue-600 bg-blue-50 rounded hover:bg-blue-100"><Printer size={16}/></button>
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => { setOrderToConfirm(order); setIsConfirmModalOpen(true); }} className="p-1.5 text-green-600 bg-green-50 rounded hover:bg-green-100"><CheckCircle size={16}/></button>
                                                    <button onClick={() => { setEditingOrder(order); setIsOrderModalOpen(true); }} className="p-1.5 text-yellow-600 bg-yellow-50 rounded hover:bg-yellow-100"><Edit size={16}/></button>
                                                    <button onClick={() => { setItemToDelete(order.id); setIsDeleteModalOpen(true); }} className="p-1.5 text-red-600 bg-red-50 rounded hover:bg-red-100"><Trash2 size={16}/></button>
                                                </ProtectedComponent>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* DIREITA: Histórico e Consultas */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">Histórico & Médias</h2>
                    
                    <div className="mb-6">
                        <label className="block text-sm font-bold text-gray-700 mb-2">Selecione o Veículo</label>
                        <select 
                            value={selectedVehicleId} 
                            onChange={(e) => setSelectedVehicleId(e.target.value)} 
                            className="w-full p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition"
                        >
                            <option value="">-- Buscar Veículo --</option>
                            {[...vehicles].sort((a,b) => a.registroInterno.localeCompare(b.registroInterno)).map(v => (
                                <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa} ({v.modelo})</option>
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
                        onGeneratePDF={generateAuthorizationPDF} // PASSA A FUNÇÃO CORRETAMENTE
                    />
                </div>
            </div>

            {/* MODAIS */}
            {isOrderModalOpen && (
                <RefuelingOrderModal 
                    user={user}
                    orderToEdit={editingOrder}
                    vehicles={vehicles}
                    obras={obras}
                    partners={partners}
                    employees={employees}
                    refuelings={refuelings}
                    vehicleGroups={vehicleGroups}
                    extraObraOptions={extraObraOptions}
                    onClose={() => setIsOrderModalOpen(false)}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    reloadData={reloadData}
                    onGeneratePDF={generateAuthorizationPDF} // PASSA A FUNÇÃO
                    ConfirmationModal={ConfirmationModal} // PASSA MODAIS UI
                    PasswordConfirmationModal={PasswordConfirmationModal}
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
                    message="Excluir esta ordem? Se já confirmada, o custo será estornado."
                    onConfirm={handleDeleteOrder}
                    onClose={() => setIsDeleteModalOpen(false)}
                    apiClient={apiClient}
                />
            )}
        </div>
    );
};

export default RefuelingPage;