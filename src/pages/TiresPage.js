import React, { useState, useEffect, useMemo } from 'react';
import { 
    Disc, Truck, Plus, ArrowRight, ArrowLeft, Printer, Search, 
    Activity, AlertCircle, X, History, Briefcase, AlertTriangle,
    Settings, FileText, Trash2, Recycle, RotateCcw, Edit
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { getVehicleMainReading, checkReadingConsistency, checkVehicleRestrictions, vehicleGroups } from '../utils/vehicleRules';

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

const getVehicleGroup = (type) => {
    if (!vehicleGroups) return 'Outros';
    for (const [group, types] of Object.entries(vehicleGroups)) {
        if (types.includes(type)) return group;
    }
    return 'Outros';
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
    const [activeTab, setActiveTab] = useState('stock'); // stock, vehicles, reports
    const [tires, setTires] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Estados Estoque
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('todos'); // Novo filtro de status
    const [showNewTireModal, setShowNewTireModal] = useState(false);
    const [showStockActionModal, setShowStockActionModal] = useState(false); // Modal de ação genérica
    const [selectedTireForAction, setSelectedTireForAction] = useState(null);
    const [showEditTireModal, setShowEditTireModal] = useState(false);

    // Estados Veículo
    const [vehicleSearchTerm, setVehicleSearchTerm] = useState(''); 
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [transactionType, setTransactionType] = useState(''); 
    const [selectedPosition, setSelectedPosition] = useState('');
    const [selectedTireForTransaction, setSelectedTireForTransaction] = useState(null);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [tireHistoryId, setTireHistoryId] = useState(null); // ID para histórico específico de um pneu

    // Estados Relatórios
    const [reportFilters, setReportFilters] = useState({
        estoque: true, emUso: true, step: true, recapagem: true, sucata: true
    });

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

    // Lista completa de pneus em estoque (independente de filtro visual) para usar nos modais
    const availableStockTires = useMemo(() => {
        return tires.filter(t => t.status === 'Estoque');
    }, [tires]);

    // Filtros da Tabela Estoque (Visual apenas)
    const filteredTires = useMemo(() => {
        return tires.filter(t => {
            const matchSearch = 
                t.fireNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                t.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
                t.size.includes(searchTerm);
            
            const matchStatus = statusFilter === 'todos' || t.status === statusFilter;
            
            return matchSearch && matchStatus;
        });
    }, [tires, searchTerm, statusFilter]);

    // Dados para Cards
    const stats = useMemo(() => ({
        total: tires.length,
        estoque: tires.filter(t => t.status === 'Estoque').length,
        emUso: tires.filter(t => t.status === 'Em Uso').length,
        step: tires.filter(t => t.status === 'Step/Reserva').length,
        recapagem: tires.filter(t => t.status === 'Recapagem').length,
        sucata: tires.filter(t => t.status === 'Sucata').length,
    }), [tires]);

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

    const vehicleAlerts = useMemo(() => {
        if (!selectedVehicle) return [];
        return checkVehicleRestrictions(selectedVehicle, revisions);
    }, [selectedVehicle, revisions]);

    const vehicleTires = useMemo(() => 
        tires.filter(t => t.currentVehicleId === selectedVehicleId),
    [tires, selectedVehicleId]);

    // --- GERAÇÃO DE RELATÓRIO DE PNEUS ---
    const handleGenerateReport = () => {
        const reportData = tires.filter(t => {
            if (t.status === 'Estoque' && reportFilters.estoque) return true;
            if (t.status === 'Em Uso' && reportFilters.emUso) return true;
            if (t.status === 'Step/Reserva' && reportFilters.step) return true;
            if (t.status === 'Recapagem' && reportFilters.recapagem) return true;
            if (t.status === 'Sucata' && reportFilters.sucata) return true;
            return false;
        });

        const doc = new jsPDF();
        doc.text("Relatório Geral de Pneus - Frotas MAK", 14, 15);
        doc.setFontSize(10);
        doc.text(`Gerado em: ${new Date().toLocaleDateString()} - Total de Registros: ${reportData.length}`, 14, 22);

        const tableBody = reportData.map(t => [
            t.fireNumber,
            `${t.brand} ${t.model || ''}`,
            t.size,
            t.status,
            t.status === 'Em Uso' ? t.vehicleRegistro : (t.location || '-'),
            t.tireCondition
        ]);

        autoTable(doc, {
            startY: 28,
            head: [['Fogo', 'Marca/Modelo', 'Medida', 'Status', 'Local/Veículo', 'Condição']],
            body: tableBody,
            theme: 'striped',
            styles: { fontSize: 9 },
            headStyles: { fillColor: [41, 128, 185] }
        });

        doc.save('Relatorio_Pneus.pdf');
    };

    // --- GERAÇÃO DE OS (CROQUI) ---
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
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.text("ORDEM DE SERVIÇO - TROCA DE PNEUS", 105, 20, { align: "center" });
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text("Frotas MAK", 105, 26, { align: "center" });

            // --- DADOS DO VEÍCULO ---
            doc.setDrawColor(0);
            doc.setFillColor(240, 240, 240);
            doc.rect(14, 35, 182, 30, "F"); 
            doc.rect(14, 35, 182, 30, "S");

            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.text(`Veículo: ${selectedVehicle.registroInterno} - ${selectedVehicle.placa}`, 20, 45);
            doc.text(`Modelo: ${selectedVehicle.modelo} / ${selectedVehicle.tipo}`, 20, 52);
            doc.text(`Data: ${today}`, 120, 45);
            doc.text("OS Nº: ________", 120, 52);
            
            // Campo para KM/Horímetro
            doc.text("Leitura Atual (Km/Hr): ____________________", 20, 60);

            // --- CROQUI VISUAL (Esqueleto) ---
            doc.setFontSize(12);
            doc.text("Mapa de Pneus (Croqui)", 14, 75);
            
            let currentY = 85;
            const centerX = 105;
            const chassisWidth = 40;
            
            // Desenha o "Chassi" central
            const axleCount = Math.ceil(positions.length / 2); // Aproximação
            const chassisHeight = (axleCount * 25) + 20;
            
            // Desenha chassi se não for "Automóvel" simples, mas simplificando: desenharemos eixos
            doc.setLineWidth(0.5);
            doc.setDrawColor(100);
            
            // Itera sobre as posições para desenhar
            // Separando Esquerda e Direita
            const leftTires = positions.filter(p => p.includes('Esq') || p.includes('Interno'));
            const rightTires = positions.filter(p => p.includes('Dir') || p.includes('Externo'));
            // Estepes
            const spares = positions.filter(p => p.includes('Estepe') || p.includes('Reserva'));
            
            // Função auxiliar para desenhar pneu
            const drawTireBox = (x, y, label, currentTire) => {
                doc.setDrawColor(0);
                doc.setFillColor(255, 255, 255);
                doc.rect(x, y, 30, 15, "FD"); // Caixa do pneu
                
                doc.setFontSize(7);
                doc.setFont("helvetica", "bold");
                doc.text(label.substring(0, 15), x + 15, y - 2, { align: "center" }); // Label posição
                
                if (currentTire) {
                    doc.setFont("helvetica", "normal");
                    doc.setTextColor(0, 100, 0);
                    doc.text(`Atual: ${currentTire.fireNumber}`, x + 2, y + 5);
                    doc.text(`${currentTire.brand}`, x + 2, y + 10);
                    doc.setTextColor(0);
                } else {
                    doc.setTextColor(150);
                    doc.text("Vazio", x + 15, y + 9, { align: "center" });
                    doc.setTextColor(0);
                }

                // Caixa para anotar o NOVO
                doc.rect(x + 32, y, 30, 15);
                doc.text("Entrou:", x + 34, y + 4);
            };

            // Desenha Eixos (Simplificado: Pares Esq/Dir)
            // Assume-se que a ordem no array reflete a ordem dos eixos aproximadamente
            // Isso é uma representação esquemática
            let drawY = 90;
            
            // Agrupando por "eixo" (pares)
            // Logica simples: Pega um da esq, um da dir e desenha na mesma linha
            const maxRows = Math.max(leftTires.length, rightTires.length);
            
            // Desenha linha central (Cardã/Eixo)
            doc.line(centerX, drawY - 10, centerX, drawY + (maxRows * 25));

            for (let i = 0; i < maxRows; i++) {
                const posLeft = leftTires[i];
                const posRight = rightTires[i];

                // Esquerda
                if (posLeft) {
                    const tire = vehicleTires.find(t => t.position === posLeft);
                    // Caixa Esq: X = Center - 70
                    drawTireBox(centerX - 70, drawY, posLeft, tire);
                    // Eixo
                    doc.line(centerX - 40, drawY + 7, centerX, drawY + 7);
                }

                // Direita
                if (posRight) {
                    const tire = vehicleTires.find(t => t.position === posRight);
                    // Caixa Dir: X = Center + 10 (Caixa Pneu) + 32 (Caixa Novo) -> Não, layout visual
                    // Pneu atual em X = Center + 10. Novo em X = Center + 42
                    drawTireBox(centerX + 10, drawY, posRight, tire);
                    doc.line(centerX, drawY + 7, centerX + 10, drawY + 7);
                }

                drawY += 25; // Próximo eixo
            }

            // Estepes
            if (spares.length > 0) {
                drawY += 10;
                doc.text("Estepes / Reservas", 14, drawY);
                drawY += 10;
                spares.forEach((pos, idx) => {
                    const tire = vehicleTires.find(t => t.position === pos);
                    drawTireBox(20 + (idx * 70), drawY, pos, tire);
                });
            }

            // --- ASSINATURAS (Rodapé) ---
            const pageHeight = doc.internal.pageSize.height;
            const footerY = pageHeight - 30;

            doc.line(20, footerY, 90, footerY); 
            doc.line(120, footerY, 190, footerY); 

            doc.setFontSize(10);
            doc.text("Assinatura Supervisor", 55, footerY + 5, { align: "center" });
            doc.text("Assinatura Borracheiro/Mecânico", 155, footerY + 5, { align: "center" });

            doc.save(`OS_Croqui_${selectedVehicle.placa}.pdf`);

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
                    <button onClick={() => setActiveTab('reports')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'reports' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Relatórios</button>
                </div>
            </div>

            {/* --- ABA ESTOQUE --- */}
            {activeTab === 'stock' && (
                <div className="bg-white rounded-lg shadow-md border p-4">
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                        <StatCard label="Total" value={stats.total} icon={<Disc />} color="bg-gray-100" />
                        <StatCard label="Estoque" value={stats.estoque} icon={<Activity />} color="bg-blue-50 text-blue-800" />
                        <StatCard label="Em Uso" value={stats.emUso} icon={<Truck />} color="bg-green-50 text-green-800" />
                        <StatCard label="Step/Reserva" value={stats.step} icon={<Briefcase />} color="bg-orange-50 text-orange-800" />
                        <StatCard label="Recapagem" value={stats.recapagem} icon={<RotateCcw />} color="bg-yellow-50 text-yellow-800" />
                        <StatCard label="Sucata" value={stats.sucata} icon={<Trash2 />} color="bg-red-50 text-red-800" />
                    </div>

                    <div className="flex justify-between items-center mb-4 flex-wrap gap-4 bg-gray-50 p-3 rounded-lg">
                        <div className="flex gap-4 w-full md:w-auto">
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar Pneu..." 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <select 
                                value={statusFilter} 
                                onChange={e => setStatusFilter(e.target.value)}
                                className="border rounded-lg px-3 py-2"
                            >
                                <option value="todos">Todos Status</option>
                                <option value="Estoque">Estoque</option>
                                <option value="Step/Reserva">Step/Reserva</option>
                                <option value="Recapagem">Recapagem</option>
                                <option value="Sucata">Sucata</option>
                            </select>
                        </div>
                        <button onClick={() => setShowNewTireModal(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm"><Plus size={18} /> Cadastrar Pneu</button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-600">
                            <thead className="bg-gray-100 text-gray-700 uppercase font-medium">
                                <tr>
                                    <th className="px-4 py-3">Fogo</th>
                                    <th className="px-4 py-3">Marca/Modelo</th>
                                    <th className="px-4 py-3">Medida</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Localização</th>
                                    <th className="px-4 py-3 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTires.map(tire => (
                                    <tr key={tire.id} className="border-b hover:bg-gray-50">
                                        <td className="px-4 py-3 font-bold text-gray-900">{tire.fireNumber}</td>
                                        <td className="px-4 py-3">{tire.brand} {tire.model}</td>
                                        <td className="px-4 py-3">{tire.size}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold 
                                                ${tire.status === 'Estoque' ? 'bg-blue-100 text-blue-800' : 
                                                  tire.status === 'Em Uso' ? 'bg-green-100 text-green-800' :
                                                  tire.status === 'Step/Reserva' ? 'bg-orange-100 text-orange-800' :
                                                  tire.status === 'Recapagem' ? 'bg-yellow-100 text-yellow-800' :
                                                  'bg-red-100 text-red-800'}`}>
                                                {tire.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">{tire.status === 'Em Uso' ? <span className="flex items-center gap-1"><Truck size={12}/> {tire.vehicleRegistro}</span> : tire.location}</td>
                                        <td className="px-4 py-3 text-center flex justify-center gap-2">
                                            <button onClick={() => { setTireHistoryId(tire.id); }} title="Histórico" className="p-1.5 text-gray-500 hover:bg-gray-200 rounded"><History size={16} /></button>
                                            <button onClick={() => { setSelectedTireForAction(tire); setShowEditTireModal(true); }} title="Editar" className="p-1.5 text-blue-500 hover:bg-blue-100 rounded"><Edit size={16} /></button>
                                            
                                            {/* Botão de Ação apenas se NÃO estiver Em Uso (Em Uso deve ser removido pelo veículo) */}
                                            {tire.status !== 'Em Uso' && (
                                                <button 
                                                    onClick={() => { setSelectedTireForAction(tire); setShowStockActionModal(true); }} 
                                                    title="Movimentar" 
                                                    className="p-1.5 text-green-600 hover:bg-green-100 rounded bg-green-50 border border-green-200"
                                                >
                                                    <Settings size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- ABA VEÍCULOS --- */}
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
                        </div>

                        {selectedVehicle && (
                            <div className="space-y-4">
                                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-2">
                                    <div className="border-b border-blue-200 pb-2 mb-2">
                                        <p className="text-xs text-blue-600 font-bold uppercase">Veículo Selecionado</p>
                                        <p className="font-bold text-lg text-gray-800">{selectedVehicle.registroInterno}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        {getVehicleMainReading(selectedVehicle).unit === 'Km' ? (
                                            <div><p className="text-xs text-gray-500">Odômetro</p><p className="font-mono font-bold">{selectedVehicle.odometro} Km</p></div>
                                        ) : (
                                            <div><p className="text-xs text-gray-500">Horímetro</p><p className="font-mono font-bold">{selectedVehicle.horimetro} Hr</p></div>
                                        )}
                                    </div>
                                </div>

                                {vehicleAlerts.length > 0 && (
                                    <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded-r text-sm space-y-1">
                                        <h4 className="font-bold text-red-700 flex items-center gap-1"><AlertTriangle size={14}/> Restrições</h4>
                                        {vehicleAlerts.map((alert, index) => (
                                            <p key={index} className="text-red-600">{alert.message}</p>
                                        ))}
                                    </div>
                                )}
                                
                                <div className="pt-2 space-y-2">
                                    <button onClick={() => setShowHistoryModal(true)} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 shadow-sm text-sm"><History size={16} /> Histórico Veículo</button>
                                    <button onClick={handleGeneratePDF} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 shadow-sm text-sm"><Printer size={16} /> Baixar Ficha Croqui</button>
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

            {/* --- ABA RELATÓRIOS --- */}
            {activeTab === 'reports' && (
                <div className="bg-white p-6 rounded-lg shadow-md border max-w-3xl mx-auto">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><FileText /> Gerador de Relatório de Pneus</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                            <h3 className="font-bold text-gray-700">Filtrar por Status</h3>
                            <label className="flex items-center gap-2"><input type="checkbox" checked={reportFilters.estoque} onChange={e => setReportFilters({...reportFilters, estoque: e.target.checked})} /> Estoque</label>
                            <label className="flex items-center gap-2"><input type="checkbox" checked={reportFilters.emUso} onChange={e => setReportFilters({...reportFilters, emUso: e.target.checked})} /> Em Uso (Veículos)</label>
                            <label className="flex items-center gap-2"><input type="checkbox" checked={reportFilters.step} onChange={e => setReportFilters({...reportFilters, step: e.target.checked})} /> Step/Reserva</label>
                            <label className="flex items-center gap-2"><input type="checkbox" checked={reportFilters.recapagem} onChange={e => setReportFilters({...reportFilters, recapagem: e.target.checked})} /> Em Recapagem</label>
                            <label className="flex items-center gap-2"><input type="checkbox" checked={reportFilters.sucata} onChange={e => setReportFilters({...reportFilters, sucata: e.target.checked})} /> Sucata/Descarte</label>
                        </div>
                        <div className="flex flex-col justify-center items-center space-y-4">
                            <p className="text-sm text-gray-600 text-center">O relatório incluirá todos os pneus cadastrados que correspondam aos filtros selecionados ao lado.</p>
                            <button onClick={handleGenerateReport} className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow">Gerar Relatório PDF</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAIS */}
            {showNewTireModal && <NewTireModal onClose={() => setShowNewTireModal(false)} onSave={async (data) => { try { await apiClient.createTire(data); setAlertMessage('Pneu cadastrado!'); loadTires(); setShowNewTireModal(false); } catch (e) { setAlertMessage(e.message || 'Erro ao salvar.'); } }} />}
            
            {/* MODAL DE AÇÃO GENÉRICA (Estoque/Step) */}
            {showStockActionModal && selectedTireForAction && (
                <StockActionModal 
                    tire={selectedTireForAction}
                    employees={employees} 
                    obras={obras} 
                    onClose={() => { setShowStockActionModal(false); setSelectedTireForAction(null); }} 
                    onSave={async (data) => { 
                        try { 
                            await apiClient.registerTireTransaction(data); 
                            setAlertMessage('Movimentação realizada!'); 
                            loadTires(); 
                            setShowStockActionModal(false); 
                        } catch (e) { 
                            setAlertMessage(e.message); 
                        } 
                    }} 
                />
            )}

            {/* MODAL DE EDIÇÃO */}
            {showEditTireModal && selectedTireForAction && (
                <EditTireModal
                    tire={selectedTireForAction}
                    onClose={() => { setShowEditTireModal(false); setSelectedTireForAction(null); }}
                    onSave={async (data) => {
                        try {
                            await apiClient.updateTire(selectedTireForAction.id, data);
                            setAlertMessage('Pneu atualizado!');
                            loadTires();
                            setShowEditTireModal(false);
                        } catch (e) { setAlertMessage(e.message); }
                    }}
                />
            )}

            {/* MODAL TRANSAÇÃO VEÍCULO */}
            {showTransactionModal && (
                <TireTransactionModal 
                    type={transactionType} 
                    vehicle={selectedVehicle} 
                    position={selectedPosition} 
                    tire={selectedTireForTransaction} 
                    stockTires={availableStockTires} 
                    vehicleAlerts={vehicleAlerts} 
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

            {/* Modais de Histórico */}
            {showHistoryModal && selectedVehicle && <VehicleTireHistoryModal vehicle={selectedVehicle} apiClient={apiClient} onClose={() => setShowHistoryModal(false)} />}
            {tireHistoryId && <SingleTireHistoryModal tireId={tireHistoryId} apiClient={apiClient} onClose={() => setTireHistoryId(null)} />}
        </div>
    );
};

// --- COMPONENTES MODAIS ---

const NewTireModal = ({ onClose, onSave }) => {
    const [data, setData] = useState({ fireNumber: '', brand: '', model: '', size: '', tireCondition: 'Novo', purchaseDate: '', price: '' });
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                <h3 className="text-xl font-bold mb-4">Cadastrar Novo Pneu</h3>
                <form onSubmit={(e) => { e.preventDefault(); onSave(data); }}>
                    <div className="space-y-3">
                        <input required placeholder="Marca de Fogo" className="w-full p-2 border rounded" value={data.fireNumber} onChange={e => setData({...data, fireNumber: e.target.value})} />
                        <input required placeholder="Marca" className="w-full p-2 border rounded" value={data.brand} onChange={e => setData({...data, brand: e.target.value})} />
                        <input placeholder="Modelo" className="w-full p-2 border rounded" value={data.model} onChange={e => setData({...data, model: e.target.value})} />
                        <input required placeholder="Medida" className="w-full p-2 border rounded" value={data.size} onChange={e => setData({...data, size: e.target.value})} />
                        <select className="w-full p-2 border rounded" value={data.tireCondition} onChange={e => setData({...data, tireCondition: e.target.value})}><option value="Novo">Novo</option><option value="Usado">Usado</option><option value="Recapado">Recapado</option></select>
                        <div className="grid grid-cols-2 gap-2">
                            <input type="date" className="w-full p-2 border rounded" value={data.purchaseDate} onChange={e => setData({...data, purchaseDate: e.target.value})} />
                            <input type="number" placeholder="Preço (R$)" className="w-full p-2 border rounded" value={data.price} onChange={e => setData({...data, price: e.target.value})} />
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Salvar</button></div>
                </form>
            </div>
        </div>
    );
};

const EditTireModal = ({ tire, onClose, onSave }) => {
    const [data, setData] = useState({ brand: tire.brand, model: tire.model, size: tire.size, tireCondition: tire.tireCondition });
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                <h3 className="text-xl font-bold mb-4">Editar Pneu: {tire.fireNumber}</h3>
                <form onSubmit={(e) => { e.preventDefault(); onSave(data); }}>
                    <div className="space-y-3">
                        <input required placeholder="Marca" className="w-full p-2 border rounded" value={data.brand} onChange={e => setData({...data, brand: e.target.value})} />
                        <input placeholder="Modelo" className="w-full p-2 border rounded" value={data.model} onChange={e => setData({...data, model: e.target.value})} />
                        <input required placeholder="Medida" className="w-full p-2 border rounded" value={data.size} onChange={e => setData({...data, size: e.target.value})} />
                        <select className="w-full p-2 border rounded" value={data.tireCondition} onChange={e => setData({...data, tireCondition: e.target.value})}><option value="Novo">Novo</option><option value="Usado">Usado</option><option value="Recapado">Recapado</option></select>
                    </div>
                    <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Salvar</button></div>
                </form>
            </div>
        </div>
    );
};

// --- NOVO MODAL: AÇÕES DE ESTOQUE/STEP ---
const StockActionModal = ({ tire, employees, obras, onClose, onSave }) => {
    const [actionType, setActionType] = useState('transfer'); // transfer (Step), maintenance (Recap), scrap (Sucata), restock (Estoque)
    const [formData, setFormData] = useState({ employeeId: '', obraId: '', vendorName: '', observation: '' });

    const handleSubmit = (e) => {
        e.preventDefault();
        const employee = employees.find(e => e.id === formData.employeeId);
        const obra = obras.find(o => o.id === formData.obraId);
        
        onSave({ 
            tireId: tire.id, 
            type: actionType,
            employeeName: employee?.nome || '', 
            obraName: obra?.nome || '',
            vendorName: formData.vendorName,
            observation: formData.observation,
            date: new Date().toISOString().split('T')[0]
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                <h3 className="text-xl font-bold mb-4">Movimentar Pneu: {tire.fireNumber}</h3>
                
                <div className="flex gap-2 mb-4 flex-wrap">
                    <button type="button" onClick={() => setActionType('transfer')} className={`px-3 py-1 rounded text-sm ${actionType === 'transfer' ? 'bg-orange-600 text-white' : 'bg-gray-200'}`}>Step/Reserva</button>
                    <button type="button" onClick={() => setActionType('maintenance')} className={`px-3 py-1 rounded text-sm ${actionType === 'maintenance' ? 'bg-yellow-500 text-white' : 'bg-gray-200'}`}>Recapagem</button>
                    <button type="button" onClick={() => setActionType('scrap')} className={`px-3 py-1 rounded text-sm ${actionType === 'scrap' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}>Sucata</button>
                    {tire.status !== 'Estoque' && <button type="button" onClick={() => setActionType('restock')} className={`px-3 py-1 rounded text-sm ${actionType === 'restock' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Devolver Estoque</button>}
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="space-y-3">
                        {actionType === 'transfer' && (
                            <>
                                <div><label className="block text-sm font-bold mb-1">Funcionário Resp.</label><select required className="w-full p-2 border rounded" value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})}><option value="">-- Selecione --</option>{employees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
                                <div><label className="block text-sm font-bold mb-1">Obra</label><select required className="w-full p-2 border rounded" value={formData.obraId} onChange={e => setFormData({...formData, obraId: e.target.value})}><option value="">-- Selecione --</option>{obras.filter(o => o.status === 'ativa').map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
                            </>
                        )}
                        {actionType === 'maintenance' && (
                            <div><label className="block text-sm font-bold mb-1">Fornecedor / Borracharia</label><input required className="w-full p-2 border rounded" value={formData.vendorName} onChange={e => setFormData({...formData, vendorName: e.target.value})} placeholder="Nome do fornecedor" /></div>
                        )}
                        {actionType === 'scrap' && (
                            <div className="p-3 bg-red-50 text-red-800 text-sm rounded">Atenção: Esta ação marcará o pneu como inservível (Lixo).</div>
                        )}
                        {actionType === 'restock' && (
                            <div className="p-3 bg-blue-50 text-blue-800 text-sm rounded">O pneu retornará ao Almoxarifado como disponível.</div>
                        )}
                        <div><label className="block text-sm font-bold mb-1">Observação</label><textarea className="w-full p-2 border rounded" rows="3" value={formData.observation} onChange={e => setFormData({...formData, observation: e.target.value})}></textarea></div>
                    </div>
                    <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Confirmar</button></div>
                </form>
            </div>
        </div>
    );
};

// --- MODAL TRANSAÇÃO VEÍCULO (Existente mas adaptado) ---
const TireTransactionModal = ({ type, vehicle, position, tire, stockTires, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        tireId: tire ? tire.id : '', vehicleId: vehicle.id, type: type, position: position,
        date: new Date().toISOString().split('T')[0], odometer: vehicle.odometro || '', horimeter: vehicle.horimetro || '', observation: ''
    });
    const group = getVehicleGroup(vehicle.tipo);
    const usesKm = group === 'Veículos Leves' || group === 'Caminhões de Trecho';
    const usesHr = !usesKm;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                <h3 className="text-xl font-bold mb-2">{type === 'install' ? 'Instalar Pneu' : 'Remover Pneu'}</h3>
                <p className="text-sm text-gray-600 mb-4">{vehicle.placa} - {position}</p>
                <div className="space-y-3">
                    {type === 'install' ? (
                        <div><label className="block text-sm font-bold mb-1">Selecionar Pneu</label><select className="w-full p-2 border rounded" value={formData.tireId} onChange={e => setFormData({...formData, tireId: e.target.value})}><option value="">-- Selecione --</option>{stockTires.map(t => <option key={t.id} value={t.id}>{t.fireNumber} - {t.brand} ({t.size})</option>)}</select></div>
                    ) : <div className="p-3 bg-red-50 font-bold text-red-800">Removendo: {tire?.fireNumber}</div>}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2"><label className="block text-sm font-bold mb-1">Data</label><input type="date" className="w-full p-2 border rounded" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} /></div>
                        {usesKm && <div className="col-span-2"><label className="block text-sm font-bold mb-1">Odômetro (Km)</label><input type="number" className="w-full p-2 border rounded" value={formData.odometer} onChange={e => setFormData({...formData, odometer: e.target.value})} /></div>}
                        {usesHr && <div className="col-span-2"><label className="block text-sm font-bold mb-1">Horímetro (Hr)</label><input type="number" className="w-full p-2 border rounded" value={formData.horimeter} onChange={e => setFormData({...formData, horimeter: e.target.value})} /></div>}
                    </div>
                    <div><label className="block text-sm font-bold mb-1">Observação</label><textarea className="w-full p-2 border rounded" value={formData.observation} onChange={e => setFormData({...formData, observation: e.target.value})}></textarea></div>
                </div>
                <div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button><button onClick={() => onSave(formData)} className={`px-4 py-2 text-white rounded ${type === 'install' ? 'bg-green-600' : 'bg-red-600'}`} disabled={type === 'install' && !formData.tireId}>Confirmar</button></div>
            </div>
        </div>
    );
};

// --- HISTÓRICO SINGLE (Para o botão da tabela estoque) ---
const SingleTireHistoryModal = ({ tireId, apiClient, onClose }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => { apiClient.getTireHistory(tireId).then(data => setHistory(data || [])).finally(() => setLoading(false)); }, [tireId, apiClient]);
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-4 border-b flex justify-between"><h3 className="font-bold">Histórico do Pneu</h3><button onClick={onClose}><X size={18}/></button></div>
                <div className="p-4 flex-1 overflow-y-auto space-y-2">{loading ? "Carregando..." : history.map(h => <div key={h.id} className="p-2 border rounded bg-gray-50 text-sm"><p className="font-bold">{new Date(h.date).toLocaleDateString()} - {h.type}</p><p>{h.observation}</p></div>)}</div>
            </div>
        </div>
    );
};

const VehicleTireHistoryModal = ({ vehicle, apiClient, onClose }) => {
    // ... (Mantido idêntico à versão anterior, apenas re-renderizando para garantir integridade)
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => { apiClient.getVehicleTireHistory(vehicle.id).then(data => setHistory(data || [])).finally(() => setLoading(false)); }, [vehicle, apiClient]);
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-4 border-b flex justify-between"><h3 className="font-bold">Histórico Veículo: {vehicle.registroInterno}</h3><button onClick={onClose}><X size={18}/></button></div>
                <div className="p-4 flex-1 overflow-y-auto space-y-3">
                    {loading ? <p className="text-center">Carregando...</p> : history.map(h => (
                        <div key={h.id} className="p-3 border rounded bg-gray-50 text-sm">
                            <div className="flex justify-between"><span className={`font-bold ${h.type==='install'?'text-green-700':'text-red-700'}`}>{h.type==='install'?'Entrada':'Saída'}</span><span>{new Date(h.date).toLocaleDateString()}</span></div>
                            <p>Pneu: {h.fireNumber} | Pos: {h.position}</p>
                            <p>Leitura: {h.odometer||h.horimeter || '-'} | {h.observation}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TiresPage;