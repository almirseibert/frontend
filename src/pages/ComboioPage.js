import React, { useState, useMemo, useEffect } from 'react';
import { Droplet, ArrowUpCircle, ArrowDownCircle, Plus, Minus, Recycle, Edit, Trash2 } from 'lucide-react';

// Modais Separados
import ComboioEntradaModal from '../components/modals/ComboioEntradaModal';
import ComboioSaidaModal from '../components/modals/ComboioSaidaModal';
import ComboioDrenagemModal from '../components/modals/ComboioDrenagemModal';
import ComboioTransactionModal from '../components/modals/ComboioTransactionModal';

import ProtectedComponent from '../components/ProtectedComponent';

const ComboioPage = ({
    user,
    vehicles = [],
    partners = [],
    obras = [],
    employees = [],
    comboioTransactions = [],
    expenses = [],
    refuelings = [], // Necessário passar para o Modal de Saída calcular média global
    setAlertMessage,
    apiClient,
    extraObraOptions = [],
    vehicleGroups = {},
    PasswordConfirmationModal,
    reloadData,
    generateAuthorizationPDF 
}) => {
    // Estado
    const [selectedComboioId, setSelectedComboioId] = useState(null);
    const [modalState, setModalState] = useState({ type: null, data: null }); // 'entrada', 'saida', 'drenagem', 'edit'
    const [deleteTransaction, setDeleteTransaction] = useState(null);

    // Listas Filtradas
    const comboioVehicles = useMemo(() => vehicles.filter(v => v.isComboioVehicle).sort((a,b) => a.registroInterno.localeCompare(b.registroInterno)), [vehicles]);
    
    // Seleção automática inicial
    useEffect(() => {
        if (!selectedComboioId && comboioVehicles.length > 0) setSelectedComboioId(comboioVehicles[0].id);
    }, [comboioVehicles, selectedComboioId]);

    const selectedComboio = comboioVehicles.find(v => v.id === selectedComboioId);

    // Transações do comboio selecionado
    const transactions = useMemo(() => {
        return comboioTransactions
            .filter(t => t.comboioVehicleId === selectedComboioId)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [comboioTransactions, selectedComboioId]);

    // Handlers
    const closeModal = () => setModalState({ type: null, data: null });
    
    const handleDelete = async () => {
        if (!deleteTransaction) return;
        try {
            await apiClient.deleteComboioTransaction(deleteTransaction.id);
            setAlertMessage("Transação excluída e saldos revertidos.");
            reloadData();
        } catch (e) {
            setAlertMessage(e.message);
        } finally {
            setDeleteTransaction(null);
        }
    };

    // Componente Barra de Combustível
    const FuelBar = ({ type, level, capacity }) => {
        const pct = Math.min((level / (capacity || 2000)) * 100, 100); // Capacidade padrão 2000L se não definida
        const color = type === 'dieselS10' ? 'bg-blue-500' : 'bg-green-500';
        return (
            <div className="flex-1 text-center">
                <div className="relative h-24 w-8 mx-auto bg-gray-200 rounded-lg overflow-hidden border border-gray-300 flex items-end">
                    <div className={`${color} w-full transition-all duration-500`} style={{ height: `${pct}%` }}></div>
                </div>
                <div className="mt-1 text-xs font-bold text-gray-700">{type === 'dieselS10' ? 'S10' : 'Comum'}</div>
                <div className="text-xs">{level.toFixed(0)} L</div>
            </div>
        );
    };

    return (
        <div className="container mx-auto p-4 space-y-6">
            <header className="flex flex-col md:flex-row justify-between items-center gap-4 border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Gestão de Comboio</h1>
                    <p className="text-sm text-gray-500">Controle de entradas, saídas e abastecimentos em campo.</p>
                </div>
                <ProtectedComponent requiredPermission="editor">
                    <button 
                        onClick={() => setModalState({ type: 'drenagem' })}
                        className="bg-orange-100 text-orange-700 px-4 py-2 rounded-lg font-semibold hover:bg-orange-200 flex items-center gap-2 border border-orange-200 transition"
                    >
                        <Recycle size={18} /> Drenagem (Devolução)
                    </button>
                </ProtectedComponent>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LISTA DE COMBOIOS (ESQUERDA) */}
                <div className="space-y-4">
                    <h2 className="font-bold text-gray-700 uppercase text-sm tracking-wide">Frotas de Comboio</h2>
                    {comboioVehicles.map(comboio => (
                        <div 
                            key={comboio.id}
                            onClick={() => setSelectedComboioId(comboio.id)}
                            className={`bg-white p-4 rounded-xl shadow-sm border cursor-pointer transition-all ${selectedComboioId === comboio.id ? 'border-yellow-400 ring-2 ring-yellow-100 transform scale-[1.02]' : 'border-gray-100 hover:border-gray-300'}`}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <span className="text-lg font-bold text-gray-800">{comboio.registroInterno}</span>
                                    <p className="text-xs text-gray-500">{comboio.modelo} - {comboio.placa}</p>
                                </div>
                                <div className="bg-gray-100 px-2 py-1 rounded text-xs font-mono text-gray-600">
                                    {comboio.status || 'Ativo'}
                                </div>
                            </div>

                            <div className="flex justify-center gap-4 my-4">
                                {Object.entries(comboio.fuelLevels || {}).map(([type, level]) => (
                                    <FuelBar key={type} type={type} level={level} capacity={comboio.fuelCapacity} />
                                ))}
                                {Object.keys(comboio.fuelLevels || {}).length === 0 && <span className="text-xs text-gray-400 py-4">Sem tanque cadastrado</span>}
                            </div>

                            <ProtectedComponent requiredPermission="editor">
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setModalState({ type: 'entrada', data: comboio }); }}
                                        className="bg-blue-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-blue-700 flex justify-center items-center gap-1"
                                    >
                                        <Plus size={14}/> Entrada
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setModalState({ type: 'saida', data: comboio }); }}
                                        className="bg-yellow-400 text-gray-900 py-2 rounded-lg text-xs font-bold hover:bg-yellow-500 flex justify-center items-center gap-1"
                                    >
                                        <Minus size={14}/> Abastecer
                                    </button>
                                </div>
                            </ProtectedComponent>
                        </div>
                    ))}
                    {comboioVehicles.length === 0 && <div className="text-center text-gray-400 py-10 border-2 border-dashed rounded-lg">Nenhum veículo marcado como comboio.</div>}
                </div>

                {/* HISTÓRICO DE TRANSAÇÕES (DIREITA) */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[600px]">
                    <div className="p-4 border-b bg-gray-50 rounded-t-xl">
                        <h2 className="font-bold text-gray-700">Histórico de Operações</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-2">
                        {transactions.length > 0 ? transactions.map(t => (
                            <div key={t.id} className="flex items-center p-3 bg-white border rounded-lg hover:shadow-sm transition-shadow group">
                                <div className={`p-2 rounded-full mr-3 ${t.type === 'entrada' ? 'bg-blue-100 text-blue-600' : t.type === 'saida' ? 'bg-yellow-100 text-yellow-600' : 'bg-orange-100 text-orange-600'}`}>
                                    {t.type === 'entrada' ? <ArrowUpCircle size={20}/> : t.type === 'saida' ? <ArrowDownCircle size={20}/> : <Recycle size={20}/>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between">
                                        <p className="text-sm font-bold text-gray-800 truncate">
                                            {t.type === 'entrada' ? `Entrada: ${t.partnerName}` : t.type === 'saida' ? `Abasteceu: ${t.receivingVehicleName || 'Veículo'}` : `Drenagem: ${t.drainingVehicleName}`}
                                        </p>
                                        <span className={`text-sm font-mono font-bold ${t.type === 'entrada' || t.type === 'drenagem' ? 'text-green-600' : 'text-red-600'}`}>
                                            {t.type === 'entrada' || t.type === 'drenagem' ? '+' : '-'}{t.liters} L
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                                        <span>{new Date(t.date).toLocaleDateString('pt-BR')} • {t.fuelType === 'dieselS10' ? 'S10' : 'Comum'}</span>
                                        <span className="truncate max-w-[150px]">{t.obraName || ''}</span>
                                    </div>
                                </div>
                                <div className="flex ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ProtectedComponent requiredPermission="editor">
                                        <button onClick={() => setModalState({ type: 'edit', data: t })} className="p-1 text-gray-400 hover:text-blue-600"><Edit size={16}/></button>
                                    </ProtectedComponent>
                                    <ProtectedComponent requiredPermission="admin">
                                        <button onClick={() => setDeleteTransaction(t)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={16}/></button>
                                    </ProtectedComponent>
                                </div>
                            </div>
                        )) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                <Droplet size={48} className="mb-2 opacity-20"/>
                                <p>Nenhuma transação registrada.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* RENDERIZAÇÃO DOS MODAIS */}
            {modalState.type === 'entrada' && (
                <ComboioEntradaModal
                    onClose={closeModal}
                    comboioVehicle={modalState.data}
                    user={user}
                    partners={partners}
                    employees={employees}
                    obras={obras}
                    extraObraOptions={extraObraOptions}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    generateAuthorizationPDF={generateAuthorizationPDF}
                    vehicleGroups={vehicleGroups}
                    reloadData={reloadData}
                />
            )}

            {modalState.type === 'saida' && (
                <ComboioSaidaModal
                    onClose={closeModal}
                    comboioVehicle={modalState.data}
                    vehicles={vehicles}
                    obras={obras}
                    employees={employees}
                    expenses={expenses} // Passa despesas para calcular orçamento
                    comboioTransactions={comboioTransactions} // Passa histórico para média
                    refuelings={refuelings} // Passa histórico externo para média
                    user={user}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    generateAuthorizationPDF={generateAuthorizationPDF}
                    vehicleGroups={vehicleGroups}
                    extraObraOptions={extraObraOptions}
                    reloadData={reloadData}
                    PasswordConfirmationModal={PasswordConfirmationModal}
                />
            )}

            {modalState.type === 'drenagem' && (
                <ComboioDrenagemModal
                    onClose={closeModal}
                    user={user}
                    vehicles={vehicles}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    reloadData={reloadData}
                />
            )}

            {modalState.type === 'edit' && (
                <ComboioTransactionModal
                    onClose={closeModal}
                    transaction={modalState.data}
                    user={user}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    PasswordConfirmationModal={PasswordConfirmationModal}
                    reloadData={reloadData}
                />
            )}

            {deleteTransaction && (
                <PasswordConfirmationModal
                    message="Tem certeza? A exclusão irá reverter os saldos de combustível do comboio e do veículo envolvido."
                    onConfirm={handleDelete}
                    onClose={() => setDeleteTransaction(null)}
                    apiClient={apiClient}
                />
            )}
        </div>
    );
};

export default ComboioPage;