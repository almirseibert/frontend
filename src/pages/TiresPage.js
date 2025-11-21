import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Disc, Truck, Plus, ArrowRight, ArrowLeft, Printer, Search, 
    Filter, Activity, AlertCircle, Save, X 
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

// Configuração de Posições Padrão
const TIRE_POSITIONS = {
    'Leves': ['Dianteiro Esq', 'Dianteiro Dir', 'Traseiro Esq', 'Traseiro Dir', 'Estepe'],
    'Caminhões': ['Direcional Esq', 'Direcional Dir', 'Tração Esq Ext', 'Tração Esq Int', 'Tração Dir Int', 'Tração Dir Ext', 'Truck Esq', 'Truck Dir', 'Estepe'],
    'Máquinas': ['Dianteiro Esq', 'Dianteiro Dir', 'Traseiro Esq', 'Traseiro Dir']
};

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
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [transactionType, setTransactionType] = useState(''); // 'install' | 'remove'
    const [selectedPosition, setSelectedPosition] = useState('');
    const [selectedTireForTransaction, setSelectedTireForTransaction] = useState(null);

    // Ref para Impressão
    const componentRef = useRef();

    const loadTires = async () => {
        setLoading(true);
        try {
            const data = await apiClient.getTires();
            setTires(data || []);
        } catch (error) {
            console.error(error);
            // Mensagem amigável caso a tabela ainda não exista (antes do redeploy do back)
            if (error.message && error.message.includes('500')) {
                setAlertMessage('Erro de conexão ou tabelas de pneus não inicializadas. Aguarde o sistema atualizar.');
            } else {
                setAlertMessage('Erro ao carregar pneus.');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTires();
    }, []);

    // Filtragem
    const filteredTires = useMemo(() => {
        return tires.filter(t => 
            t.fireNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.size.includes(searchTerm)
        );
    }, [tires, searchTerm]);

    const stockTires = filteredTires.filter(t => t.status === 'Estoque');
    const inUseTires = filteredTires.filter(t => t.status === 'Em Uso');

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
        documentTitle: `Ordem_Servico_Pneus_${selectedVehicle?.placa || 'Geral'}`,
    });

    // --- Renderização ---

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
                                    <th className="px-4 py-3">Ações</th>
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
                                        <td className="px-4 py-3">
                                            <button className="text-blue-600 hover:underline">Editar</button>
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
                    {/* Seleção de Veículo */}
                    <div className="bg-white p-4 rounded-lg shadow-md border lg:col-span-1 h-fit">
                        <h3 className="font-bold text-lg mb-4 text-gray-700">Selecione o Veículo</h3>
                        <select 
                            className="w-full p-2 border rounded-lg mb-4 bg-gray-50"
                            value={selectedVehicleId}
                            onChange={e => setSelectedVehicleId(e.target.value)}
                        >
                            <option value="">-- Selecione --</option>
                            {vehicles.map(v => (
                                <option key={v.id} value={v.id}>
                                    {v.registroInterno} - {v.placa} ({v.tipo})
                                </option>
                            ))}
                        </select>

                        {selectedVehicle && (
                            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                                <p><strong>Tipo:</strong> {selectedVehicle.tipo}</p>
                                <p><strong>Placa:</strong> {selectedVehicle.placa}</p>
                                <p><strong>Km Atual:</strong> {selectedVehicle.odometro}</p>
                                <p><strong>Horímetro:</strong> {selectedVehicle.horimetro}</p>
                                
                                <div className="mt-4 pt-4 border-t border-blue-200">
                                    <button 
                                        onClick={handlePrint}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 shadow-sm"
                                    >
                                        <Printer size={18} /> Imprimir Ordem de Pneu
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
                                    {/* Renderiza Posições Baseadas no Tipo */}
                                    {(TIRE_POSITIONS[getVehicleGroup(selectedVehicle.tipo)] || TIRE_POSITIONS['Leves']).map(pos => {
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
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                <Truck size={48} className="mb-2" />
                                <p>Selecione um veículo para gerenciar os pneus.</p>
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
                    tire={selectedTireForTransaction} // Para remover
                    stockTires={stockTires} // Para instalar
                    onClose={() => {
                        setShowTransactionModal(false);
                        setSelectedTireForTransaction(null);
                    }}
                    onSave={async (data) => {
                        try {
                            await apiClient.registerTireTransaction(data);
                            setAlertMessage('Movimentação realizada!');
                            loadTires();
                            setShowTransactionModal(false);
                            setSelectedTireForTransaction(null);
                        } catch (e) {
                            setAlertMessage(e.message || 'Erro na movimentação.');
                        }
                    }}
                />
            )}

            {/* --- COMPONENTE DE IMPRESSÃO (ESCONDIDO) --- */}
            <div style={{ display: 'none' }}>
                <PrintableTireOrder ref={componentRef} vehicle={selectedVehicle} positions={TIRE_POSITIONS} />
            </div>

        </div>
    );
};

// Helpers
const StatCard = ({ label, value, icon, color }) => (
    <div className={`p-4 rounded-lg shadow-sm flex items-center justify-between ${color}`}>
        <div>
            <p className="text-xs font-bold uppercase opacity-70">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
        </div>
        <div className="opacity-50">{icon}</div>
    </div>
);

const getVehicleGroup = (type) => {
    if (!type) return 'Leves';
    if (['Caminhão', 'Caçamba', 'Cavalo'].some(t => type.includes(t))) return 'Caminhões';
    if (['Escavadeira', 'Rolo', 'Trator', 'Retroescavadeira'].some(t => type.includes(t))) return 'Máquinas';
    return 'Leves';
};

// --- Subcomponente: Modal Novo Pneu (COM FORM E VALIDAÇÃO) ---
const NewTireModal = ({ onClose, onSave }) => {
    const [data, setData] = useState({
        fireNumber: '', brand: '', model: '', size: '', 
        tireCondition: 'Novo', purchaseDate: '', price: ''
    });

    const handleSubmit = (e) => {
        e.preventDefault(); // Impede recarregamento e ativa validação HTML
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

// --- Subcomponente: Modal de Transação ---
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
                        <div>
                            <label className="block text-sm font-bold mb-1">Data</label>
                            <input type="date" className="w-full p-2 border rounded" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">Odômetro (Km)</label>
                            <input type="number" className="w-full p-2 border rounded" value={formData.odometer} onChange={e => setFormData({...formData, odometer: e.target.value})} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">Horímetro (Hr)</label>
                        <input type="number" className="w-full p-2 border rounded" value={formData.horimeter} onChange={e => setFormData({...formData, horimeter: e.target.value})} />
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
                        disabled={!formData.tireId}
                    >
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Subcomponente: Folha de Impressão (O Visual para o Borracheiro) ---
const PrintableTireOrder = React.forwardRef(({ vehicle, positions }, ref) => {
    if (!vehicle) return null;
    
    const group = getVehicleGroup(vehicle.tipo);
    const positionList = positions[group] || positions['Leves'];

    return (
        <div ref={ref} className="p-8 font-sans text-gray-900">
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
                    <p>{vehicle.marca} {vehicle.modelo}</p>
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
                
                <table className="w-full border-collapse border border-black">
                    <thead>
                        <tr className="bg-gray-200">
                            <th className="border border-black p-2 text-left w-1/4">Posição</th>
                            <th className="border border-black p-2 text-center w-1/4">SAIU (Fogo Nº)</th>
                            <th className="border border-black p-2 text-center w-1/4">ENTROU (Fogo Nº)</th>
                            <th className="border border-black p-2 text-left w-1/4">Obs (Estado/Motivo)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {positionList.map(pos => (
                            <tr key={pos}>
                                <td className="border border-black p-3 font-bold">{pos}</td>
                                <td className="border border-black p-3"></td>
                                <td className="border border-black p-3"></td>
                                <td className="border border-black p-3"></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Esquema Visual (Simples) */}
            <div className="mt-8 border p-4 rounded">
                <h3 className="font-bold mb-2">Diagrama de Referência</h3>
                <div className="flex flex-wrap gap-4 justify-center">
                    {positionList.map(pos => (
                        <div key={pos} className="border border-gray-400 px-4 py-2 rounded text-xs text-center w-24">
                            {pos}
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-12 pt-4 border-t border-black flex justify-between text-sm">
                <p>Assinatura Supervisor</p>
                <p>Assinatura Borracheiro</p>
            </div>
        </div>
    );
});

export default TiresPage;