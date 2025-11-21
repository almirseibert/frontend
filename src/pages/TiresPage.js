import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Disc, Truck, Plus, ArrowRight, ArrowLeft, Printer, Search, 
    Filter, Activity, AlertCircle, Save, X, Clock, History 
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

// Configuração de Posições Padrão
const TIRE_POSITIONS = {
    'Leves': ['Dianteiro Esq', 'Dianteiro Dir', 'Traseiro Esq', 'Traseiro Dir', 'Estepe'],
    'Caminhões': ['Direcional Esq', 'Direcional Dir', 'Tração Esq Ext', 'Tração Esq Int', 'Tração Dir Int', 'Tração Dir Ext', 'Truck Esq', 'Truck Dir', 'Estepe'],
    'Máquinas': ['Dianteiro Esq', 'Dianteiro Dir', 'Traseiro Esq', 'Traseiro Dir']
};

// Helper para identificar grupo
const getVehicleGroup = (type) => {
    if (!type) return 'Leves';
    if (type.includes('Prancha') || type.includes('Caminhão Prancha')) return 'Caminhões de Trecho'; // Grupo especial
    if (['Caminhão', 'Caçamba', 'Cavalo'].some(t => type.includes(t))) return 'Caminhões';
    if (['Escavadeira', 'Rolo', 'Trator', 'Retroescavadeira', 'Motoniveladora', 'Pá Carregadeira'].some(t => type.includes(t))) return 'Máquinas';
    return 'Leves';
};

// Componente StatCard (Restaurado)
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
    user, vehicles = [], apiClient, setAlertMessage, reloadData 
}) => {
    const [activeTab, setActiveTab] = useState('stock'); // 'stock' | 'vehicles'
    const [tires, setTires] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Estados Estoque
    const [searchTerm, setSearchTerm] = useState('');
    const [showNewTireModal, setShowNewTireModal] = useState(false);

    // Estados Veículo
    const [vehicleSearchTerm, setVehicleSearchTerm] = useState(''); // Filtro de busca
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [transactionType, setTransactionType] = useState(''); // 'install' | 'remove'
    const [selectedPosition, setSelectedPosition] = useState('');
    const [selectedTireForTransaction, setSelectedTireForTransaction] = useState(null);
    const [showHistoryModal, setShowHistoryModal] = useState(false); // Modal Histórico

    // Ref para Impressão
    const componentRef = useRef();

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

    // Filtragem Estoque
    const filteredTires = useMemo(() => {
        return tires.filter(t => 
            t.fireNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.size.includes(searchTerm)
        );
    }, [tires, searchTerm]);

    const stockTires = filteredTires.filter(t => t.status === 'Estoque');
    const inUseTires = filteredTires.filter(t => t.status === 'Em Uso');

    // Veículos Filtrados e Ordenados
    const filteredVehicles = useMemo(() => {
        return vehicles
            .filter(v => {
                if (!vehicleSearchTerm) return true;
                const term = vehicleSearchTerm.toLowerCase();
                return (
                    (v.placa || '').toLowerCase().includes(term) ||
                    (v.registroInterno || '').toLowerCase().includes(term) ||
                    (v.modelo || '').toLowerCase().includes(term)
                );
            })
            .sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || ''));
    }, [vehicles, vehicleSearchTerm]);

    // Veículo Selecionado
    const selectedVehicle = useMemo(() => 
        vehicles.find(v => v.id === selectedVehicleId), 
    [vehicles, selectedVehicleId]);

    // Pneus do Veículo Selecionado
    const vehicleTires = useMemo(() => 
        tires.filter(t => t.currentVehicleId === selectedVehicleId),
    [tires, selectedVehicleId]);

    // Lógica de Impressão
    const handlePrint = useReactToPrint({
        content: () => componentRef.current,
        documentTitle: `OS_Pneus_${selectedVehicle?.placa || 'Geral'}`,
        onBeforeGetContent: () => {
            if (!selectedVehicle) {
                setAlertMessage('Selecione um veículo para imprimir.');
                return Promise.reject();
            }
            return Promise.resolve();
        }
    });

    return (
        <div className="container mx-auto p-4 md:p-6">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                    <Disc className="text-gray-600" /> Gestão de Pneus
                </h1>
                <div className="flex gap-2 bg-white p-1 rounded-lg shadow-sm border">
                    <button 
                        onClick={() => setActiveTab('stock')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'stock' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        Estoque Geral
                    </button>
                    <button 
                        onClick={() => setActiveTab('vehicles')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'vehicles' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        Gestão por Veículo
                    </button>
                </div>
            </div>

            {/* --- ABA ESTOQUE --- */}
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
                        <button 
                            onClick={() => setShowNewTireModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm"
                        >
                            <Plus size={18} /> Cadastrar Pneu
                        </button>
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
                                <tr>
                                    <th className="px-4 py-3">Marca de Fogo</th>
                                    <th className="px-4 py-3">Marca/Modelo</th>
                                    <th className="px-4 py-3">Medida</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Condição</th>
                                    <th className="px-4 py-3">Localização</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTires.map(tire => (
                                    <tr key={tire.id} className="border-b hover:bg-gray-50">
                                        <td className="px-4 py-3 font-bold text-gray-900">{tire.fireNumber}</td>
                                        <td className="px-4 py-3">{tire.brand} {tire.model}</td>
                                        <td className="px-4 py-3">{tire.size}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                tire.status === 'Estoque' ? 'bg-blue-100 text-blue-800' : 
                                                tire.status === 'Em Uso' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                            }`}>
                                                {tire.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">{tire.tireCondition}</td>
                                        <td className="px-4 py-3">
                                            {tire.status === 'Em Uso' ? 
                                                <span className="flex items-center gap-1"><Truck size={12}/> {tire.vehicleRegistro}</span> : 
                                                tire.location
                                            }
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
                    {/* Painel de Seleção */}
                    <div className="bg-white p-4 rounded-lg shadow-md border lg:col-span-1 h-fit">
                        <h3 className="font-bold text-lg mb-2 text-gray-700">Selecione o Veículo</h3>
                        
                        {/* Campo de Busca de Veículo */}
                        <div className="relative mb-3">
                            <Search className="absolute left-2 top-2.5 text-gray-400" size={16} />
                            <input 
                                type="text"
                                placeholder="Pesquisar Veículo..."
                                className="w-full pl-8 pr-2 py-2 border rounded-lg text-sm"
                                value={vehicleSearchTerm}
                                onChange={e => setVehicleSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="max-h-60 overflow-y-auto border rounded-lg mb-4 bg-gray-50">
                            {filteredVehicles.map(v => (
                                <div 
                                    key={v.id}
                                    onClick={() => setSelectedVehicleId(v.id)}
                                    className={`p-2 cursor-pointer text-sm border-b last:border-b-0 hover:bg-blue-50 ${selectedVehicleId === v.id ? 'bg-blue-100 border-l-4 border-blue-500 font-medium' : ''}`}
                                >
                                    {v.registroInterno} - {v.tipo} - {v.marca} {v.modelo}
                                </div>
                            ))}
                            {filteredVehicles.length === 0 && <p className="p-4 text-center text-gray-500 text-sm">Nenhum veículo encontrado.</p>}
                        </div>

                        {selectedVehicle && (
                            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-2">
                                <div className="border-b border-blue-200 pb-2 mb-2">
                                    <p className="text-xs text-blue-600 font-bold uppercase">Veículo Selecionado</p>
                                    <p className="font-bold text-lg text-gray-800">{selectedVehicle.registroInterno}</p>
                                    <p className="text-sm text-gray-600">{selectedVehicle.tipo} - {selectedVehicle.placa}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <p className="text-xs text-gray-500">Odômetro</p>
                                        <p className="font-mono font-bold">{selectedVehicle.odometro} Km</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">Horímetro</p>
                                        <p className="font-mono font-bold">{selectedVehicle.horimetro} Hr</p>
                                    </div>
                                </div>
                                
                                <div className="pt-2 space-y-2">
                                    <button 
                                        onClick={() => setShowHistoryModal(true)}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 shadow-sm text-sm"
                                    >
                                        <History size={16} /> Histórico de Trocas
                                    </button>
                                    <button 
                                        onClick={handlePrint}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 shadow-sm text-sm"
                                    >
                                        <Printer size={16} /> Imprimir Ficha
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Visualizador de Pneus */}
                    <div className="bg-white p-4 rounded-lg shadow-md border lg:col-span-2">
                        {selectedVehicle ? (
                            <div>
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-bold text-lg text-gray-700">Mapa de Pneus</h3>
                                    <span className="text-xs bg-gray-100 px-2 py-1 rounded border">Visualização Esquemática</span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {(TIRE_POSITIONS[getVehicleGroup(selectedVehicle.tipo) === 'Caminhões de Trecho' ? 'Caminhões' : getVehicleGroup(selectedVehicle.tipo)] || TIRE_POSITIONS['Leves']).map(pos => {
                                        const installedTire = vehicleTires.find(t => t.position === pos);
                                        return (
                                            <div key={pos} className={`p-3 rounded-lg border flex justify-between items-center ${installedTire ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-dashed border-gray-300'}`}>
                                                <div>
                                                    <span className="text-xs font-bold text-gray-500 uppercase block">{pos}</span>
                                                    {installedTire ? (
                                                        <div>
                                                            <p className="font-bold text-lg text-gray-800">{installedTire.fireNumber}</p>
                                                            <p className="text-xs text-gray-600">{installedTire.brand} - {installedTire.size}</p>
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-gray-400 italic">Vazio</span>
                                                    )}
                                                </div>
                                                <div>
                                                    {installedTire ? (
                                                        <button 
                                                            onClick={() => {
                                                                setTransactionType('remove');
                                                                setSelectedPosition(pos);
                                                                setSelectedTireForTransaction(installedTire);
                                                                setShowTransactionModal(true);
                                                            }}
                                                            className="p-2 text-red-600 hover:bg-red-100 rounded-full" 
                                                            title="Remover Pneu"
                                                        >
                                                            <ArrowRight size={18} />
                                                        </button>
                                                    ) : (
                                                        <button 
                                                            onClick={() => {
                                                                setTransactionType('install');
                                                                setSelectedPosition(pos);
                                                                setShowTransactionModal(true);
                                                            }}
                                                            className="p-2 text-green-600 hover:bg-green-100 rounded-full" 
                                                            title="Instalar Pneu"
                                                        >
                                                            <ArrowLeft size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 py-20">
                                <Truck size={48} className="mb-2" />
                                <p>Selecione um veículo à esquerda para gerenciar os pneus.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- Modais --- */}
            {showNewTireModal && (
                <NewTireModal 
                    onClose={() => setShowNewTireModal(false)} 
                    onSave={async (data) => {
                        try {
                            await apiClient.createTire(data);
                            setAlertMessage('Pneu cadastrado!');
                            loadTires();
                            setShowNewTireModal(false);
                        } catch (e) {
                            setAlertMessage(e.message || 'Erro ao salvar.');
                        }
                    }} 
                />
            )}

            {showTransactionModal && (
                <TireTransactionModal
                    type={transactionType}
                    vehicle={selectedVehicle}
                    position={selectedPosition}
                    tire={selectedTireForTransaction}
                    stockTires={stockTires}
                    onClose={() => {
                        setShowTransactionModal(false);
                        setSelectedTireForTransaction(null);
                    }}
                    onSave={async (data) => {
                        try {
                            await apiClient.registerTireTransaction(data);
                            setAlertMessage('Movimentação realizada!');
                            loadTires();
                            reloadData(); // Recarrega veículos para atualizar Km
                            setShowTransactionModal(false);
                            setSelectedTireForTransaction(null);
                        } catch (e) {
                            setAlertMessage(e.message || 'Erro na movimentação.');
                        }
                    }}
                />
            )}

            {/* Modal de Histórico */}
            {showHistoryModal && selectedVehicle && (
                <VehicleTireHistoryModal 
                    vehicle={selectedVehicle} 
                    apiClient={apiClient} 
                    onClose={() => setShowHistoryModal(false)} 
                />
            )}

            {/* --- COMPONENTE DE IMPRESSÃO --- */}
            {/* Ajuste: Não usar display: none, mas sim esconder com overflow e height 0 para garantir que o ref funcione */}
            <div style={{ overflow: 'hidden', height: 0, width: 0 }}>
                <PrintableTireOrder ref={componentRef} vehicle={selectedVehicle} positions={TIRE_POSITIONS} />
            </div>

        </div>
    );
};

// --- Subcomponente: Modal Novo Pneu ---
const NewTireModal = ({ onClose, onSave }) => {
    const [data, setData] = useState({
        fireNumber: '', brand: '', model: '', size: '', 
        tireCondition: 'Novo', purchaseDate: '', price: ''
    });

    const handleSubmit = (e) => {
        e.preventDefault(); 
        onSave(data);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                <h3 className="text-xl font-bold mb-4">Cadastrar Novo Pneu</h3>
                <form onSubmit={handleSubmit}>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-bold mb-1">Marca de Fogo *</label>
                            <input required placeholder="ID Único" className="w-full p-2 border rounded" value={data.fireNumber} onChange={e => setData({...data, fireNumber: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">Marca *</label>
                            <input required placeholder="Ex: Michelin" className="w-full p-2 border rounded" value={data.brand} onChange={e => setData({...data, brand: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">Modelo</label>
                            <input placeholder="Ex: X Multi Z" className="w-full p-2 border rounded" value={data.model} onChange={e => setData({...data, model: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">Medida *</label>
                            <input required placeholder="Ex: 295/80R22.5" className="w-full p-2 border rounded" value={data.size} onChange={e => setData({...data, size: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">Condição</label>
                            <select className="w-full p-2 border rounded" value={data.tireCondition} onChange={e => setData({...data, tireCondition: e.target.value})}>
                                <option value="Novo">Novo</option>
                                <option value="Usado">Usado</option>
                                <option value="Recapado">Recapado</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-sm font-bold mb-1">Data Compra</label>
                                <input type="date" className="w-full p-2 border rounded" value={data.purchaseDate} onChange={e => setData({...data, purchaseDate: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold mb-1">Preço (R$)</label>
                                <input type="number" placeholder="0.00" className="w-full p-2 border rounded" value={data.price} onChange={e => setData({...data, price: e.target.value})} />
                            </div>
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

// --- Subcomponente: Modal de Transação (COM FILTRO DE KM/HR) ---
const TireTransactionModal = ({ type, vehicle, position, tire, stockTires, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        tireId: tire ? tire.id : '',
        vehicleId: vehicle.id,
        type: type,
        position: position,
        date: new Date().toISOString().split('T')[0],
        odometer: vehicle.odometro || '',
        horimeter: vehicle.horimetro || '',
        observation: ''
    });

    // Define qual campo usar baseado no tipo do veículo
    const group = getVehicleGroup(vehicle.tipo);
    // Regra: Leves e Caminhões de Trecho = KM. Outros = Horas.
    const usesKm = group === 'Leves' || group === 'Caminhões de Trecho';
    const usesHr = !usesKm; // Máquinas e Caminhões (Padrão de Operação)

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                <h3 className="text-xl font-bold mb-2">
                    {type === 'install' ? 'Instalar Pneu' : 'Remover Pneu'}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                    Veículo: {vehicle.placa} | Posição: {position}
                </p>

                <div className="space-y-3">
                    {type === 'install' ? (
                        <div>
                            <label className="block text-sm font-bold mb-1">Selecionar Pneu do Estoque</label>
                            <select 
                                className="w-full p-2 border rounded"
                                value={formData.tireId}
                                onChange={e => setFormData({...formData, tireId: e.target.value})}
                            >
                                <option value="">-- Selecione --</option>
                                {stockTires.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.fireNumber} - {t.brand} ({t.size})
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <div className="p-3 bg-red-50 border border-red-100 rounded">
                            <p className="font-bold text-red-800">Removendo: {tire?.fireNumber}</p>
                            <p className="text-sm">{tire?.brand} - {tire?.size}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                            <label className="block text-sm font-bold mb-1">Data</label>
                            <input type="date" className="w-full p-2 border rounded" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                        </div>
                        
                        {usesKm && (
                            <div className="col-span-2">
                                <label className="block text-sm font-bold mb-1">Odômetro (Km)</label>
                                <input 
                                    type="number" 
                                    className="w-full p-2 border rounded bg-white" 
                                    value={formData.odometer} 
                                    onChange={e => setFormData({...formData, odometer: e.target.value})} 
                                />
                            </div>
                        )}
                        
                        {usesHr && (
                            <div className="col-span-2">
                                <label className="block text-sm font-bold mb-1">Horímetro (Hr)</label>
                                <input 
                                    type="number" 
                                    className="w-full p-2 border rounded bg-white" 
                                    value={formData.horimeter} 
                                    onChange={e => setFormData({...formData, horimeter: e.target.value})} 
                                />
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">Observação</label>
                        <textarea 
                            className="w-full p-2 border rounded" 
                            rows="2"
                            placeholder="Motivo da troca, estado do pneu..."
                            value={formData.observation} 
                            onChange={e => setFormData({...formData, observation: e.target.value})}
                        ></textarea>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button>
                    <button 
                        onClick={() => onSave(formData)} 
                        className={`px-4 py-2 text-white rounded ${type === 'install' ? 'bg-green-600' : 'bg-red-600'}`}
                        disabled={type === 'install' && !formData.tireId}
                    >
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Subcomponente: Modal de Histórico do Veículo (NOVO) ---
const VehicleTireHistoryModal = ({ vehicle, apiClient, onClose }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const data = await apiClient.getVehicleTireHistory(vehicle.id);
                setHistory(data || []);
            } catch (error) {
                console.error("Erro ao buscar histórico", error);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [vehicle, apiClient]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <h3 className="text-lg font-bold">Histórico de Pneus: {vehicle.registroInterno}</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full"><X size={18}/></button>
                </div>
                
                <div className="p-4 flex-1 overflow-y-auto">
                    {loading ? (
                        <p className="text-center text-gray-500">Carregando...</p>
                    ) : history.length === 0 ? (
                        <p className="text-center text-gray-500">Nenhum histórico encontrado para este veículo.</p>
                    ) : (
                        <div className="space-y-3">
                            {history.map(h => (
                                <div key={h.id} className="p-3 border rounded-lg bg-gray-50 text-sm">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${h.type === 'install' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {h.type === 'install' ? 'Entrada' : 'Saída'}
                                            </span>
                                            <span className="font-bold text-gray-800">{new Date(h.date).toLocaleDateString('pt-BR')}</span>
                                        </div>
                                        <span className="text-gray-500 text-xs">{h.position}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <div>
                                            <p className="text-xs text-gray-500">Pneu (Fogo)</p>
                                            <p className="font-semibold">{h.fireNumber}</p>
                                            <p className="text-xs text-gray-600">{h.brand} - {h.size}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-500">Leitura Veículo</p>
                                            {h.odometer > 0 && <p>{h.odometer} Km</p>}
                                            {h.horimeter > 0 && <p>{h.horimeter} Hr</p>}
                                        </div>
                                    </div>
                                    {h.observation && (
                                        <div className="mt-2 pt-2 border-t border-gray-200">
                                            <p className="text-xs italic text-gray-600">"{h.observation}"</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Subcomponente: Folha de Impressão ---
const PrintableTireOrder = React.forwardRef(({ vehicle, positions }, ref) => {
    // Sempre retorna um elemento raiz para o ref funcionar, mesmo se vehicle for null
    return (
        <div ref={ref} className="p-8 font-sans text-gray-900">
            {vehicle ? (
                <>
                    {/* Cabeçalho */}
                    <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold uppercase">Ordem de Serviço - Pneus</h1>
                            <p className="text-sm">MAK Gestão de Frotas</p>
                        </div>
                        <div className="text-right">
                            <p>Data: _____/_____/_______</p>
                            <p>Borracheiro: ____________________</p>
                        </div>
                    </div>

                    {/* Dados do Veículo */}
                    <div className="bg-gray-100 p-4 rounded border border-gray-300 mb-6 flex justify-between">
                        <div>
                            <p className="font-bold text-lg">{vehicle.registroInterno} - {vehicle.placa}</p>
                            <p>{vehicle.marca} {vehicle.modelo} ({vehicle.tipo})</p>
                        </div>
                        <div className="text-right">
                            <p>Odômetro Atual: {vehicle.odometro} Km</p>
                            <p>Horímetro Atual: {vehicle.horimetro} Hr</p>
                        </div>
                    </div>

                    {/* Tabela de Troca */}
                    <div className="mb-8">
                        <h2 className="font-bold text-lg mb-2 border-b border-gray-400">Registro de Trocas</h2>
                        <p className="text-sm italic mb-4">Anote o número da marca de fogo dos pneus retirados e instalados.</p>
                        
                        <table className="w-full border-collapse border border-black text-sm">
                            <thead>
                                <tr className="bg-gray-200">
                                    <th className="border border-black p-2 text-left w-1/4">Posição</th>
                                    <th className="border border-black p-2 text-center w-1/4">SAIU (Fogo Nº)</th>
                                    <th className="border border-black p-2 text-center w-1/4">ENTROU (Fogo Nº)</th>
                                    <th className="border border-black p-2 text-left w-1/4">Obs (Estado/Motivo)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const group = getVehicleGroup(vehicle.tipo);
                                    const mappedGroup = group === 'Caminhões de Trecho' ? 'Caminhões' : group;
                                    const positionList = positions[mappedGroup] || positions['Leves'];
                                    
                                    return positionList.map(pos => (
                                        <tr key={pos}>
                                            <td className="border border-black p-3 font-bold">{pos}</td>
                                            <td className="border border-black p-3"></td>
                                            <td className="border border-black p-3"></td>
                                            <td className="border border-black p-3"></td>
                                        </tr>
                                    ));
                                })()}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-12 pt-4 border-t border-black flex justify-between text-sm">
                        <p>Assinatura Supervisor</p>
                        <p>Assinatura Borracheiro</p>
                    </div>
                </>
            ) : (
                <div className="p-10 text-center">Selecione um veículo para imprimir.</div>
            )}
        </div>
    );
});

export default TiresPage;