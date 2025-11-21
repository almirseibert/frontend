import React, { useState, useEffect, useMemo } from 'react';
import { 
    Disc, Truck, Plus, ArrowRight, ArrowLeft, Printer, Search, 
    Activity, AlertCircle, X, History, Briefcase, AlertTriangle 
} from 'lucide-react';
// Importações para gerar PDF direto
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { getVehicleMainReading, checkReadingConsistency, checkVehicleRestrictions } from '../utils/vehicleRules';

// --- CONFIGURAÇÃO COMPLETA DE POSIÇÕES DE PNEUS ---
const TIRE_LAYOUTS = {
    'Automóvel': ['Dianteiro Esq', 'Dianteiro Dir', 'Traseiro Esq', 'Traseiro Dir', 'Estepe'],
    'Bitruck': ['Direcional Esq', 'Direcional Dir', '2º Direcional Esq', '2º Direcional Dir', 'Tração Esq Ext', 'Tração Esq Int', 'Tração Dir Int', 'Tração Dir Ext', 'Truck Esq Int', 'Truck Esq Ext', 'Truck Dir Int', 'Truck Dir Ext', 'Estepe 1', 'Estepe 2'],
    'Caminhão Pipa': ['Direcional Esq', 'Direcional Dir', 'Tração Esq Ext', 'Tração Esq Int', 'Tração Dir Int', 'Tração Dir Ext', 'Truck Esq Int', 'Truck Esq Ext', 'Truck Dir Int', 'Truck Dir Ext', 'Estepe 1', 'Estepe 2'],
    'Caminhão Prancha': ['Direcional Esq', 'Direcional Dir', 'Tração Esq Ext', 'Tração Esq Int', 'Tração Dir Int', 'Tração Dir Ext', 'Truck Esq Int', 'Truck Esq Ext', 'Truck Dir Int', 'Truck Dir Ext', 'Carreta 1º E Esq Int', 'Carreta 1º E Esq Ext', 'Carreta 1º E Dir Int', 'Carreta 1º E Dir Ext', 'Carreta 2º E Esq Int', 'Carreta 2º E Esq Ext', 'Carreta 2º E Dir Int', 'Carreta 2º E Dir Ext', 'Carreta 3º E Esq Int', 'Carreta 3º E Esq Ext', 'Carreta 3º E Dir Int', 'Carreta 3º E Dir Ext', 'Estepe 1', 'Estepe 2'],
    'Caminhão Tanque': ['Direcional Esq', 'Direcional Dir', 'Tração Esq Ext', 'Tração Esq Int', 'Tração Dir Int', 'Tração Dir Ext', 'Truck Esq Int', 'Truck Esq Ext', 'Truck Dir Int', 'Truck Dir Ext', 'Estepe 1', 'Estepe 2'],
    'Caminhão Carroceria': ['Direcional Esq', 'Direcional Dir', 'Tração Esq Ext', 'Tração Esq Int', 'Tração Dir Int', 'Tração Dir Ext', 'Estepe'],
    'Camionete': ['Dianteiro Esq', 'Dianteiro Dir', 'Traseiro Esq', 'Traseiro Dir', 'Estepe'],
    'Cavalo': ['Direcional Esq', 'Direcional Dir', 'Tração Esq Ext', 'Tração Esq Int', 'Tração Dir Int', 'Tração Dir Ext', 'Truck Esq Int', 'Truck Esq Ext', 'Truck Dir Int', 'Truck Dir Ext', 'Estepe'],
    'Caçamba Bitruck': ['Direcional Esq', 'Direcional Dir', '2º Direcional Esq', '2º Direcional Dir', 'Tração Esq Ext', 'Tração Esq Int', 'Tração Dir Int', 'Tração Dir Ext', 'Truck Esq Int', 'Truck Esq Ext', 'Truck Dir Int', 'Truck Dir Ext', 'Estepe 1', 'Estepe 2'],
    'Caçamba Toco': ['Direcional Esq', 'Direcional Dir', 'Tração Esq Ext', 'Tração Esq Int', 'Tração Dir Int', 'Tração Dir Ext', 'Estepe 1', 'Estepe 2'],
    'Caçamba Traçado': ['Direcional Esq', 'Direcional Dir', 'Tração Esq Ext', 'Tração Esq Int', 'Tração Dir Int', 'Tração Dir Ext', 'Truck Esq Int', 'Truck Esq Ext', 'Truck Dir Int', 'Truck Dir Ext', 'Estepe 1', 'Estepe 2'],
    'Caçamba Truckado': ['Direcional Esq', 'Direcional Dir', 'Tração Esq Ext', 'Tração Esq Int', 'Tração Dir Int', 'Tração Dir Ext', 'Truck Esq Int', 'Truck Esq Ext', 'Truck Dir Int', 'Truck Dir Ext', 'Estepe 1', 'Estepe 2'],
    'Escavadeira': [], 
    'Fresadora': [], 
    'Moto': ['Dianteiro', 'Traseiro'],
    'Motoniveladora': ['Direcional Esq', 'Direcional Dir', 'Tração 1 Esq', 'Tração 2 Esq', 'Tração 1 Dir Int', 'Tração 2 Dir'],
    'Pá Carregadeira': ['Direcional Esq', 'Direcional Dir', 'Tração Esq', 'Tração Dir'],
    'Retroescavadeira': ['Direcional Esq', 'Direcional Dir', 'Tração Esq', 'Tração Dir'],
    'Rolo': ['Tração Esq', 'Tração Dir'],
    'Semirreboques': ['Carreta 1º E Esq Int', 'Carreta 1º E Esq Ext', 'Carreta 1º E Dir Int', 'Carreta 1º E Dir Ext', 'Carreta 2º E Esq Int', 'Carreta 2º E Esq Ext', 'Carreta 2º E Dir Int', 'Carreta 2º E Dir Ext', 'Carreta 3º E Esq Int', 'Carreta 3º E Esq Ext', 'Carreta 3º E Dir Int', 'Carreta 3º E Dir Ext', 'Estepe 1', 'Estepe 2'],
    'Trator': ['Direcional Esq', 'Direcional Dir', 'Tração Esq', 'Tração Dir'],
    'Trator Esteira': [], 
    'Utilitários': ['Direcional Esq', 'Direcional Dir', 'Tração Esq Ext', 'Tração Esq Int', 'Tração Dir Int', 'Tração Dir Ext', 'Estepe'],
    'Padrão': ['Dianteiro Esq', 'Dianteiro Dir', 'Traseiro Esq', 'Traseiro Dir'] 
};

const getTireLayout = (vehicleType) => {
    return TIRE_LAYOUTS[vehicleType] || TIRE_LAYOUTS['Padrão'];
};

const StatCard = ({ label, value, icon, color }) => (
    <div className={`p-4 rounded-lg shadow-sm flex items-center justify-between ${color}`}>
        <div>
            <p className="text-xs font-bold uppercase opacity-70">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
        </div>
        <div className="opacity-50">{icon}</div>
    </div>
);

const TiresPage = ({ 
    user, vehicles = [], employees = [], obras = [], revisions = [], apiClient, setAlertMessage, reloadData, PasswordConfirmationModal 
}) => {
    const [activeTab, setActiveTab] = useState('stock'); 
    const [tires, setTires] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Estados Estoque
    const [searchTerm, setSearchTerm] = useState('');
    const [showNewTireModal, setShowNewTireModal] = useState(false);
    const [showSpareTireModal, setShowSpareTireModal] = useState(false); 

    // Estados Veículo
    const [vehicleSearchTerm, setVehicleSearchTerm] = useState(''); 
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [transactionType, setTransactionType] = useState(''); 
    const [selectedPosition, setSelectedPosition] = useState('');
    const [selectedTireForTransaction, setSelectedTireForTransaction] = useState(null);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    const loadTires = async () => {
        setLoading(true);
        try {
            const data = await apiClient.getTires();
            setTires(data || []);
        } catch (error) {
            console.error(error);
            setAlertMessage('Erro ao carregar pneus.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTires();
    }, []);

    const filteredTires = useMemo(() => {
        return tires.filter(t => 
            t.fireNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.size.includes(searchTerm)
        );
    }, [tires, searchTerm]);

    const stockTires = filteredTires.filter(t => t.status === 'Estoque');
    const inUseTires = filteredTires.filter(t => t.status === 'Em Uso');

    const filteredVehicles = useMemo(() => {
        return vehicles
            .filter(v => {
                if (!vehicleSearchTerm) return true;
                const term = vehicleSearchTerm.toLowerCase();
                return (
                    (v.placa || '').toLowerCase().includes(term) ||
                    (v.registroInterno || '').toLowerCase().includes(term) ||
                    (v.modelo || '').toLowerCase().includes(term) ||
                    (v.tipo || '').toLowerCase().includes(term)
                );
            })
            .sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || ''));
    }, [vehicles, vehicleSearchTerm]);

    const selectedVehicle = useMemo(() => 
        vehicles.find(v => v.id === selectedVehicleId), 
    [vehicles, selectedVehicleId]);

    // --- CHECK DE RESTRIÇÕES ---
    const vehicleAlerts = useMemo(() => {
        if (!selectedVehicle) return [];
        return checkVehicleRestrictions(selectedVehicle, revisions);
    }, [selectedVehicle, revisions]);

    const vehicleTires = useMemo(() => 
        tires.filter(t => t.currentVehicleId === selectedVehicleId),
    [tires, selectedVehicleId]);

    // --- NOVA FUNÇÃO DE GERAÇÃO DE PDF (SUBSTITUI O REACT-TO-PRINT) ---
    const handleGeneratePDF = () => {
        if (!selectedVehicle) {
            setAlertMessage("Selecione um veículo para gerar a ficha.");
            return;
        }

        try {
            const doc = new jsPDF();
            const positions = getTireLayout(selectedVehicle.tipo);
            const today = new Date().toLocaleDateString('pt-BR');

            // --- CABEÇALHO ---
            doc.setFontSize(18);
            doc.setFont("helvetica", "bold");
            doc.text("ORDEM DE SERVIÇO - PNEUS", 105, 20, { align: "center" });
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text("Frotas MAK", 105, 26, { align: "center" });

            // --- INFO DA OS ---
            doc.setFontSize(11);
            doc.text(`Data: ${today}`, 14, 40);
            doc.text("OS Nº: ______", 160, 40);

            // --- INFO DO VEÍCULO (Box) ---
            doc.setDrawColor(0);
            doc.setFillColor(245, 245, 245);
            doc.rect(14, 45, 182, 25, "F"); // Fundo cinza
            doc.rect(14, 45, 182, 25, "S"); // Borda

            doc.setFont("helvetica", "bold");
            doc.text("VEÍCULO / REGISTRO", 20, 52);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(14);
            doc.text(`${selectedVehicle.registroInterno || "N/A"}`, 20, 62);

            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.text("PLACA / MODELO", 100, 52);
            doc.setFont("helvetica", "normal");
            doc.text(`${selectedVehicle.placa || ""} - ${selectedVehicle.modelo || ""}`, 100, 62);

            // --- TABELA DE POSIÇÕES (Usando autoTable) ---
            const tableBody = positions.map(pos => [
                pos, // Posição
                "",  // Saiu (Vazio para preencher)
                "",  // Entrou (Vazio para preencher)
                ""   // Obs (Vazio para preencher)
            ]);

            autoTable(doc, {
                startY: 80,
                head: [['Posição', 'SAIU (Fogo/Marca)', 'ENTROU (Fogo/Marca)', 'Observações']],
                body: tableBody,
                theme: 'grid',
                headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 40, fontStyle: 'bold' }, // Coluna Posição
                    1: { cellWidth: 45 },
                    2: { cellWidth: 45 },
                    3: { cellWidth: 'auto' }
                },
                styles: {
                    minCellHeight: 12, // Altura da linha para facilitar escrita manual
                    valign: 'middle',
                    fontSize: 10
                }
            });

            // --- ASSINATURAS (Rodapé) ---
            const pageHeight = doc.internal.pageSize.height;
            const footerY = pageHeight - 40;

            doc.line(20, footerY, 90, footerY); // Linha Esq
            doc.line(120, footerY, 190, footerY); // Linha Dir

            doc.setFontSize(10);
            doc.text("Assinatura Supervisor", 55, footerY + 5, { align: "center" });
            doc.text("Assinatura Borracheiro/Mecânico", 155, footerY + 5, { align: "center" });

            // Salvar Arquivo
            doc.save(`OS_Pneus_${selectedVehicle.placa || selectedVehicle.registroInterno}.pdf`);

        } catch (error) {
            console.error(error);
            setAlertMessage("Erro ao gerar PDF: " + error.message);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-6">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                    <Disc className="text-gray-600" /> Gestão de Pneus
                </h1>
                <div className="flex gap-2 bg-white p-1 rounded-lg shadow-sm border">
                    <button onClick={() => setActiveTab('stock')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'stock' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Estoque Geral</button>
                    <button onClick={() => setActiveTab('vehicles')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'vehicles' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Gestão por Veículo</button>
                </div>
            </div>

            {activeTab === 'stock' && (
                <div className="bg-white rounded-lg shadow-md border p-4">
                    <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                        <div className="relative w-full md:w-96">
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                            <input 
                                type="text" 
                                placeholder="Buscar Marca de Fogo, Marca ou Tamanho..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowSpareTireModal(true)} className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 shadow-sm"><Briefcase size={18} /> Enviar Step/Reserva</button>
                            <button onClick={() => setShowNewTireModal(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm"><Plus size={18} /> Cadastrar Pneu</button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <StatCard label="Total Pneus" value={tires.length} icon={<Disc />} color="bg-gray-100" />
                        <StatCard label="Em Estoque" value={stockTires.length} icon={<Activity />} color="bg-blue-50 text-blue-800" />
                        <StatCard label="Em Uso" value={inUseTires.length} icon={<Truck />} color="bg-green-50 text-green-800" />
                        <StatCard label="Sucata/Recapagem" value={tires.filter(t => t.status === 'Sucata' || t.status === 'Recapagem').length} icon={<AlertCircle />} color="bg-red-50 text-red-800" />
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-600">
                            <thead className="bg-gray-50 text-gray-700 uppercase font-medium">
                                <tr><th className="px-4 py-3">Marca de Fogo</th><th className="px-4 py-3">Marca/Modelo</th><th className="px-4 py-3">Medida</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Condição</th><th className="px-4 py-3">Localização</th></tr>
                            </thead>
                            <tbody>
                                {filteredTires.map(tire => (
                                    <tr key={tire.id} className="border-b hover:bg-gray-50">
                                        <td className="px-4 py-3 font-bold text-gray-900">{tire.fireNumber}</td>
                                        <td className="px-4 py-3">{tire.brand} {tire.model}</td>
                                        <td className="px-4 py-3">{tire.size}</td>
                                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${tire.status === 'Estoque' ? 'bg-blue-100 text-blue-800' : tire.status === 'Em Uso' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{tire.status}</span></td>
                                        <td className="px-4 py-3">{tire.tireCondition}</td>
                                        <td className="px-4 py-3">{tire.status === 'Em Uso' ? <span className="flex items-center gap-1"><Truck size={12}/> {tire.vehicleRegistro}</span> : tire.location}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'vehicles' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-white p-4 rounded-lg shadow-md border lg:col-span-1 h-fit">
                        <h3 className="font-bold text-lg mb-2 text-gray-700">Selecione o Veículo</h3>
                        <div className="relative mb-3">
                            <Search className="absolute left-2 top-2.5 text-gray-400" size={16} />
                            <input type="text" placeholder="Pesquisar Veículo..." className="w-full pl-8 pr-2 py-2 border rounded-lg text-sm" value={vehicleSearchTerm} onChange={e => setVehicleSearchTerm(e.target.value)} />
                        </div>
                        <div className="max-h-60 overflow-y-auto border rounded-lg mb-4 bg-gray-50">
                            {filteredVehicles.map(v => (
                                <div key={v.id} onClick={() => setSelectedVehicleId(v.id)} className={`p-2 cursor-pointer text-sm border-b last:border-b-0 hover:bg-blue-50 ${selectedVehicleId === v.id ? 'bg-blue-100 border-l-4 border-blue-500 font-medium' : ''}`}>
                                    {v.registroInterno} - {v.tipo} - {v.marca} {v.modelo}
                                </div>
                            ))}
                            {filteredVehicles.length === 0 && <p className="p-4 text-center text-gray-500 text-sm">Nenhum veículo encontrado.</p>}
                        </div>

                        {selectedVehicle && (
                            <div className="space-y-4">
                                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-2">
                                    <div className="border-b border-blue-200 pb-2 mb-2">
                                        <p className="text-xs text-blue-600 font-bold uppercase">Veículo Selecionado</p>
                                        <p className="font-bold text-lg text-gray-800">{selectedVehicle.registroInterno}</p>
                                        <p className="text-sm text-gray-600">{selectedVehicle.tipo} - {selectedVehicle.placa}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        {getVehicleMainReading(selectedVehicle).unit === 'Km' ? (
                                            <div><p className="text-xs text-gray-500">Odômetro</p><p className="font-mono font-bold">{selectedVehicle.odometro} Km</p></div>
                                        ) : (
                                            <div><p className="text-xs text-gray-500">Horímetro</p><p className="font-mono font-bold">{selectedVehicle.horimetro} Hr</p></div>
                                        )}
                                    </div>
                                </div>

                                {/* ÁREA DE ALERTAS DE RESTRIÇÃO */}
                                {vehicleAlerts.length > 0 && (
                                    <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded-r text-sm space-y-1">
                                        <h4 className="font-bold text-red-700 flex items-center gap-1"><AlertTriangle size={14}/> Restrições Detectadas</h4>
                                        {vehicleAlerts.map((alert, index) => (
                                            <p key={index} className="text-red-600">{alert.message}</p>
                                        ))}
                                    </div>
                                )}
                                
                                <div className="pt-2 space-y-2">
                                    <button onClick={() => setShowHistoryModal(true)} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 shadow-sm text-sm"><History size={16} /> Histórico de Trocas</button>
                                    {/* Botão atualizado para usar handleGeneratePDF */}
                                    <button onClick={handleGeneratePDF} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 shadow-sm text-sm"><Printer size={16} /> Baixar Ficha (PDF)</button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-white p-4 rounded-lg shadow-md border lg:col-span-2">
                        {selectedVehicle ? (
                            <div>
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-bold text-lg text-gray-700">Mapa de Pneus</h3>
                                    <span className="text-xs bg-gray-100 px-2 py-1 rounded border">Visualização Esquemática</span>
                                </div>

                                {getTireLayout(selectedVehicle.tipo).length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {getTireLayout(selectedVehicle.tipo).map(pos => {
                                            const installedTire = vehicleTires.find(t => t.position === pos);
                                            return (
                                                <div key={pos} className={`p-3 rounded-lg border flex justify-between items-center ${installedTire ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-dashed border-gray-300'}`}>
                                                    <div>
                                                        <span className="text-xs font-bold text-gray-500 uppercase block">{pos}</span>
                                                        {installedTire ? (
                                                            <div><p className="font-bold text-lg text-gray-800">{installedTire.fireNumber}</p><p className="text-xs text-gray-600">{installedTire.brand} - {installedTire.size}</p></div>
                                                        ) : <span className="text-sm text-gray-400 italic">Vazio</span>}
                                                    </div>
                                                    <div>
                                                        {installedTire ? (
                                                            <button onClick={() => { setTransactionType('remove'); setSelectedPosition(pos); setSelectedTireForTransaction(installedTire); setShowTransactionModal(true); }} className="p-2 text-red-600 hover:bg-red-100 rounded-full" title="Remover Pneu"><ArrowRight size={18} /></button>
                                                        ) : (
                                                            <button onClick={() => { setTransactionType('install'); setSelectedPosition(pos); setShowTransactionModal(true); }} className="p-2 text-green-600 hover:bg-green-100 rounded-full" title="Instalar Pneu"><ArrowLeft size={18} /></button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="p-10 text-center text-gray-500">Este veículo não utiliza pneus (Esteira).</div>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 py-20"><Truck size={48} className="mb-2" /><p>Selecione um veículo à esquerda para gerenciar os pneus.</p></div>
                        )}
                    </div>
                </div>
            )}

            {/* MODAIS */}
            {showNewTireModal && <NewTireModal onClose={() => setShowNewTireModal(false)} onSave={async (data) => { try { await apiClient.createTire(data); setAlertMessage('Pneu cadastrado!'); loadTires(); setShowNewTireModal(false); } catch (e) { setAlertMessage(e.message || 'Erro ao salvar.'); } }} />}
            
            {showSpareTireModal && <SpareTireModal stockTires={stockTires} employees={employees} obras={obras} onClose={() => setShowSpareTireModal(false)} onSave={async (data) => { try { await apiClient.registerTireTransaction({ ...data, type: 'transfer' }); setAlertMessage('Step enviado com sucesso!'); loadTires(); setShowSpareTireModal(false); } catch (e) { setAlertMessage(e.message); } }} />}

            {showTransactionModal && (
                <TireTransactionModal 
                    type={transactionType} 
                    vehicle={selectedVehicle} 
                    position={selectedPosition} 
                    tire={selectedTireForTransaction} 
                    stockTires={stockTires} 
                    vehicleAlerts={vehicleAlerts} // Passa os alertas para o modal
                    onClose={() => { setShowTransactionModal(false); setSelectedTireForTransaction(null); }} 
                    onSave={async (data) => { 
                        try { 
                            await apiClient.registerTireTransaction(data); 
                            setAlertMessage('Movimentação realizada!'); 
                            loadTires(); 
                            reloadData(); 
                            setShowTransactionModal(false); 
                            setSelectedTireForTransaction(null); 
                        } catch (e) { 
                            setAlertMessage(e.message || 'Erro na movimentação.'); 
                        } 
                    }} 
                    PasswordConfirmationModal={PasswordConfirmationModal} 
                />
            )}

            {showHistoryModal && selectedVehicle && <VehicleTireHistoryModal vehicle={selectedVehicle} apiClient={apiClient} onClose={() => setShowHistoryModal(false)} />}
            
            {/* O componente PrintableTireOrder foi removido pois foi substituído pelo jsPDF */}
        </div>
    );
};

// --- SUBCOMPONENTES ---

const NewTireModal = ({ onClose, onSave }) => {
    const [data, setData] = useState({ fireNumber: '', brand: '', model: '', size: '', tireCondition: 'Novo', purchaseDate: '', price: '' });
    const handleSubmit = (e) => { e.preventDefault(); onSave(data); };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                <h3 className="text-xl font-bold mb-4">Cadastrar Novo Pneu</h3>
                <form onSubmit={handleSubmit}>
                    <div className="space-y-3">
                        <input required placeholder="Marca de Fogo (ID)" className="w-full p-2 border rounded" value={data.fireNumber} onChange={e => setData({...data, fireNumber: e.target.value})} />
                        <input required placeholder="Marca" className="w-full p-2 border rounded" value={data.brand} onChange={e => setData({...data, brand: e.target.value})} />
                        <input placeholder="Modelo" className="w-full p-2 border rounded" value={data.model} onChange={e => setData({...data, model: e.target.value})} />
                        <input required placeholder="Medida" className="w-full p-2 border rounded" value={data.size} onChange={e => setData({...data, size: e.target.value})} />
                        <select className="w-full p-2 border rounded" value={data.tireCondition} onChange={e => setData({...data, tireCondition: e.target.value})}>
                            <option value="Novo">Novo</option>
                            <option value="Usado">Usado</option>
                            <option value="Recapado">Recapado</option>
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                            <input type="date" className="w-full p-2 border rounded" value={data.purchaseDate} onChange={e => setData({...data, purchaseDate: e.target.value})} />
                            <input type="number" placeholder="Preço (R$)" className="w-full p-2 border rounded" value={data.price} onChange={e => setData({...data, price: e.target.value})} />
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const SpareTireModal = ({ stockTires, employees, obras, onClose, onSave }) => {
    const [formData, setFormData] = useState({ tireId: '', employeeId: '', obraId: '', observation: '' });
    const handleSubmit = (e) => { 
        e.preventDefault(); 
        const employee = employees.find(e => e.id === formData.employeeId);
        const obra = obras.find(o => o.id === formData.obraId);
        // Tipo simplificado para 'transfer'
        onSave({ ...formData, employeeName: employee?.nome || 'N/A', obraName: obra?.nome || 'N/A', date: new Date().toISOString().split('T')[0] }); 
    };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                <h3 className="text-xl font-bold mb-4">Enviar Step/Reserva</h3>
                <form onSubmit={handleSubmit}>
                    <div className="space-y-3">
                        <div><label className="block text-sm font-bold mb-1">Pneu</label><select required className="w-full p-2 border rounded" value={formData.tireId} onChange={e => setFormData({...formData, tireId: e.target.value})}><option value="">-- Selecione --</option>{stockTires.map(t => <option key={t.id} value={t.id}>{t.fireNumber} - {t.brand}</option>)}</select></div>
                        <div><label className="block text-sm font-bold mb-1">Funcionário</label><select required className="w-full p-2 border rounded" value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})}><option value="">-- Selecione --</option>{employees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
                        <div><label className="block text-sm font-bold mb-1">Obra</label><select required className="w-full p-2 border rounded" value={formData.obraId} onChange={e => setFormData({...formData, obraId: e.target.value})}><option value="">-- Selecione --</option>{obras.filter(o => o.status === 'ativa').map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
                        <div><label className="block text-sm font-bold mb-1">Obs</label><textarea className="w-full p-2 border rounded" rows="3" value={formData.observation} onChange={e => setFormData({...formData, observation: e.target.value})}></textarea></div>
                    </div>
                    <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button><button type="submit" className="px-4 py-2 bg-orange-600 text-white rounded">Enviar</button></div>
                </form>
            </div>
        </div>
    );
};

const TireTransactionModal = ({ type, vehicle, position, tire, stockTires, vehicleAlerts, onClose, onSave, PasswordConfirmationModal }) => {
    const readingInfo = useMemo(() => getVehicleMainReading(vehicle), [vehicle]);
    const [formData, setFormData] = useState({
        tireId: tire ? tire.id : '', vehicleId: vehicle.id, type: type, position: position,
        date: new Date().toISOString().split('T')[0], readingValue: readingInfo.raw || '', observation: ''
    });
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
    const [alertReason, setAlertReason] = useState(null);
    const [blockedAction, setBlockedAction] = useState(null);

    const performSave = () => onSave({ ...formData, odometer: readingInfo.unit === 'Km' ? formData.readingValue : null, horimeter: readingInfo.unit === 'Hr' ? formData.readingValue : null });

    const handleConfirm = () => {
        // 1. Checa se o veículo tem restrições de bloqueio
        const blocked = vehicleAlerts.find(a => a.type === 'bloqueio');
        if (blocked) {
            setAlertReason(`O VEÍCULO POSSUI RESTRIÇÃO DE BLOQUEIO: ${blocked.message}. É necessário autorização para movimentar pneus.`);
            setBlockedAction(() => performSave);
            setShowPasswordConfirm(true);
            return;
        }

        // 2. Checa consistência de leitura (Km/Hr)
        const issue = checkReadingConsistency(vehicle, formData.readingValue);
        if (issue) { 
            setAlertReason(issue.message); 
            setBlockedAction(() => performSave); 
            setShowPasswordConfirm(true); 
        } else { 
            performSave(); 
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                    <h3 className="text-xl font-bold mb-2">{type === 'install' ? 'Instalar Pneu' : 'Remover Pneu'}</h3>
                    <p className="text-sm text-gray-600 mb-4">{vehicle.placa} - {position}</p>
                    
                    {/* ALERTA VISUAL NO MODAL */}
                    {vehicleAlerts.length > 0 && (
                        <div className="mb-4 p-2 bg-red-100 border border-red-300 rounded text-red-800 text-xs">
                            <strong>Atenção:</strong> Este veículo possui pendências. A operação poderá exigir senha.
                        </div>
                    )}

                    <div className="space-y-3">
                        {type === 'install' ? (
                            <div><label className="block text-sm font-bold mb-1">Pneu</label><select className="w-full p-2 border rounded" value={formData.tireId} onChange={e => setFormData({...formData, tireId: e.target.value})}><option value="">-- Selecione --</option>{stockTires.map(t => <option key={t.id} value={t.id}>{t.fireNumber} - {t.brand}</option>)}</select></div>
                        ) : <div className="p-2 bg-red-50 rounded text-red-800 font-bold">Removendo: {tire?.fireNumber}</div>}
                        
                        <div><label className="block text-sm font-bold mb-1">{readingInfo.label} Atual: {readingInfo.value}</label><input type="number" className="w-full p-2 border rounded" value={formData.readingValue} onChange={e => setFormData({...formData, readingValue: e.target.value})} /></div>
                        <div><label className="block text-sm font-bold mb-1">Obs</label><textarea className="w-full p-2 border rounded" value={formData.observation} onChange={e => setFormData({...formData, observation: e.target.value})}></textarea></div>
                    </div>
                    <div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button><button onClick={handleConfirm} className="px-4 py-2 bg-blue-600 text-white rounded">Confirmar</button></div>
                </div>
            </div>
            {showPasswordConfirm && PasswordConfirmationModal && <PasswordConfirmationModal message={`ALERTA DE SEGURANÇA: ${alertReason}`} onConfirm={() => { blockedAction(); setShowPasswordConfirm(false); }} onClose={() => setShowPasswordConfirm(false)} />}
        </>
    );
};

const VehicleTireHistoryModal = ({ vehicle, apiClient, onClose }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => { apiClient.getVehicleTireHistory(vehicle.id).then(data => setHistory(data || [])).catch(() => setHistory([])).finally(() => setLoading(false)); }, [vehicle, apiClient]);
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white"><h3 className="font-bold">Histórico: {vehicle.registroInterno}</h3><button onClick={onClose}><X size={18}/></button></div>
                <div className="p-4 flex-1 overflow-y-auto space-y-3">
                    {loading ? <p className="text-center text-gray-500">Carregando...</p> : history.length === 0 ? <p className="text-center text-gray-500">Nenhum histórico encontrado.</p> : history.map(h => (
                        <div key={h.id} className="p-3 border rounded bg-gray-50 text-sm">
                            <div className="flex justify-between"><span className={`font-bold ${h.type==='install'?'text-green-700':'text-red-700'}`}>{h.type==='install'?'Instalação':'Remoção'}</span><span>{new Date(h.date).toLocaleDateString()}</span></div>
                            <p>Pneu: {h.fireNumber} | Posição: {h.position}</p>
                            <p>Leitura: {h.odometer > 0 ? `${h.odometer} Km` : h.horimeter > 0 ? `${h.horimeter} Hr` : '-'} | Obs: {h.observation}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TiresPage;