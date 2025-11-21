import React, { useState, useEffect, useMemo, useContext, createContext, useCallback } from 'react'; 
import { 
    LogOut, HardHat, Building, Clock, Truck, PlusCircle, Trash2, Edit, FileText, 
    ChevronLeft, ChevronRight, Bell, Fuel, Droplet, DollarSign, ShieldAlert, 
    User, AlertTriangle, Shield, CalendarClock, ShoppingCart, Loader, X, Disc // ADD Disc Icon
} from 'lucide-react';

// ... (Context imports mantidos)
import { AuthProvider, useAuth } from './contexts/AuthContext'; 

// ... (Page imports mantidos)
import Dashboard from './pages/Dashboard';
import ObrasPage from './pages/ObrasPage';
import PartnersPage from './pages/PartnersPage';
import RefuelingPage from './pages/RefuelingPage';
import ComboioPage from './pages/ComboioPage';
import ExpensesPage from './pages/ExpensesPage';
import EmployeesPage from './pages/EmployeesPage';
import ReportsPage from './pages/ReportsPage'; 
import FinesPage from './pages/FinesPage';
import VehiclePage from './pages/VehiclePage';
import RevisionsPage from './pages/RevisionsPage';
import DiarioDeBordoPage from './pages/DiarioDeBordoPage';
import AdminPage from './pages/AdminPage'; 
import ControleDiarioPage from './pages/ControleDiarioPage';
import OrdersPage from './pages/OrdersPage'; 
import LoginScreen from './components/LoginScreen'; 
import TiresPage from './pages/TiresPage'; // NOVO IMPORT

// ... (ApiClient e Utils mantidos)
import apiClient from './services/apiClient'; 
import { 
    vehicleGroups, 
    extraObraOptions, 
    operationalSubGroups, 
    equipmentTypesForHours, 
    getVehicleMainReading 
} from './utils/vehicleRules';

// ... (Modais CustomAlert, ConfirmationModal, PasswordConfirmationModal, UpdateMessageModal mantidos)
const CustomAlert = ({ message, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
        <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-2xl text-center">
            <pre className="text-lg mb-6 whitespace-pre-wrap text-left font-sans">{message}</pre>
            <button onClick={onClose} className="py-2 px-6 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500">OK</button>
        </div>
    </div>
);

const ConfirmationModal = ({ title, message, onConfirm, onClose, confirmText = 'Confirmar', cancelText = 'Cancelar', confirmColor = 'bg-yellow-400 hover:bg-yellow-500 text-gray-900' }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[90]">
        <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">{title}</h3>
            <p className="text-gray-600 mb-6">{message}</p>
            <div className="flex justify-end gap-4">
                <button onClick={onClose} className="py-2 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">{cancelText}</button>
                <button onClick={onConfirm} className={`px-4 py-2 rounded-lg font-semibold ${confirmColor}`}>{confirmText}</button>
            </div>
        </div>
    </div>
);

const PasswordConfirmationModal = ({ onConfirm, onClose, message, apiClient }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    if (!apiClient) {
        console.error("PasswordConfirmationModal: apiClient não foi fornecido!");
        return <CustomAlert message="Erro interno: Falta configuração para confirmação de senha." onClose={onClose} />;
    }

    const handleConfirm = async () => {
        setIsVerifying(true);
        setError('');
        try {
            await apiClient.validatePassword(password);
            await onConfirm(); 
            onClose(); 
        } catch (err) {
            setError(err.message || "Senha incorreta ou falha na verificação.");
        } finally {
            setIsVerifying(false);
        }
    };
    
    return (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[90]"><div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
        <h3 className="text-xl font-bold mb-4">Confirmar Ação</h3>
        <p className="text-gray-600 mb-6">{message || "Para sua segurança, por favor, insira a sua senha para confirmar esta operação."}</p>
        <div className="mb-4">
            <label className="block text-gray-700">Senha</label>
            <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" 
            />
        </div>
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        <div className="flex justify-end gap-4">
            <button onClick={onClose} className="py-2 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancelar</button>
            <button 
                onClick={handleConfirm} 
                disabled={isVerifying} 
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 flex items-center gap-1"
            >
                {isVerifying ? <><Loader size={16} className="animate-spin" /> Verificando...</> : 'Confirmar'}
            </button>
        </div>
    </div></div>);
};

const UpdateMessageModal = ({ message, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[110]"> 
        <div className="bg-white p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-2xl">
            <div className="flex justify-between items-center mb-4">
                 <h2 className="text-2xl font-bold text-yellow-600 flex items-center gap-2">
                    <AlertTriangle /> Aviso Importante
                 </h2>
                 <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-200">
                    <X size={20} />
                 </button>
            </div>
            <pre className="text-base text-gray-700 mb-6 whitespace-pre-wrap font-sans max-h-[60vh] overflow-y-auto custom-scrollbar p-2 bg-gray-50 rounded-md border">
                {message}
            </pre>
            <button onClick={onClose} className="w-full py-2 px-6 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 transition-all">
                Entendido
            </button>
        </div>
    </div>
);

// --- CONTEÚDO PRINCIPAL DA APLICAÇÃO ---
const AppContent = () => {
    const { user, logout } = useAuth(); 
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [pageFilter, setPageFilter] = useState(null); 
    const [alertMessage, setAlertMessage] = useState(''); 

    // ... (States de dados mantidos)
    const [vehicles, setVehicles] = useState([]);
    const [obras, setObras] = useState([]);
    const [revisions, setRevisions] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [rawPartners, setRawPartners] = useState([]); 
    const [refuelings, setRefuelings] = useState([]);
    const [rawComboioTransactions, setRawComboioTransactions] = useState([]);
    const [rawFines, setRawFines] = useState([]);
    const [diarioDeBordoLogs, setDiarioDeBordoLogs] = useState([]);
    
    const [loadingData, setLoadingData] = useState(true); 
    const [updateMessage, setUpdateMessage] = useState(null);
    const [showUpdateModal, setShowUpdateModal] = useState(false);

    const partners = useMemo(() => [...rawPartners].sort((a, b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '')), [rawPartners]);
    const comboioTransactions = useMemo(() => [...rawComboioTransactions].sort((a, b) => (new Date(b.date).getTime()) - (new Date(a.date).getTime())), [rawComboioTransactions]);
    const fines = useMemo(() => [...rawFines].sort((a, b) => (new Date(b.dataInfracao).getTime()) - (new Date(a.dataInfracao).getTime())), [rawFines]);

    // ... (processVehiclesWithAlerts mantido)
    const processVehiclesWithAlerts = (vehiclesData, revisionsData, finesData) => {
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(now.getDate() + 30);

        return vehiclesData.map(vehicle => {
            let hasAlert = false;
            let alertText = '';

            // 1. Alerta de Circulação
            if (vehicle.canCirculate === false) { 
                hasAlert = true;
                alertText = `O veículo não pode rodar por status de documento/revisão.`;
            }

            // 2. Alerta de Revisão
            const revision = revisionsData.find(r => r.vehicleId === vehicle.id); 
            if (revision && !hasAlert) {
                const proximaData = revision.proximaRevisaoData ? new Date(revision.proximaRevisaoData) : null;
                const proximoOdometro = revision.proximaRevisaoOdometro;
                
                // --- USO DA REGRA CENTRALIZADA ---
                const readingData = getVehicleMainReading(vehicle); 
                const currentReading = readingData.raw;
                // --------------------------------

                const avisoKm = parseFloat(revision.avisoAntecedenciaKmHr || 0);
                const avisoDias = parseInt(revision.avisoAntecedenciaDias || 0);

                if ((proximoOdometro > 0 && currentReading >= proximoOdometro) || (proximaData && now >= proximaData)) {
                    hasAlert = true;
                    alertText = 'Atenção: Revisão Vencida!';
                } else if ((proximoOdometro > 0 && avisoKm > 0 && currentReading >= proximoOdometro - avisoKm) || (proximaData && avisoDias > 0)) {
                    if(proximaData && avisoDias > 0) {
                        const warningDate = new Date(proximaData);
                        warningDate.setDate(warningDate.getDate() - avisoDias);
                        if (now >= warningDate) {
                            hasAlert = true;
                            alertText = 'Atenção: Revisão Próxima do Vencimento!';
                        }
                    } else if (proximoOdometro > 0 && avisoKm > 0 && currentReading >= proximoOdometro - avisoKm) {
                         hasAlert = true; 
                         alertText = 'Atenção: Revisão Próxima do Vencimento!';
                    }
                }
            }

            // 3. Alerta de Documentos de Caminhão
            const isTruck = vehicleGroups['Caminhões'].includes(vehicle.tipo);
            if (isTruck && !hasAlert) {
                const docs = [
                    { type: 'Tacógrafo', date: vehicle.validadeTacografo ? new Date(vehicle.validadeTacografo) : null },
                    { type: 'AET DAER/RS', date: vehicle.validadeAET_DAER ? new Date(vehicle.validadeAET_DAER) : null },
                    { type: 'AET DNIT', date: vehicle.validadeAET_DNIT ? new Date(vehicle.validadeAET_DNIT) : null },
                ];
                const expiredDoc = docs.find(doc => doc.date && doc.date < now);
                const nearExpiredDoc = docs.find(doc => doc.date && !expiredDoc && doc.date <= thirtyDaysFromNow); 

                if (expiredDoc) {
                    hasAlert = true;
                    alertText = `Atenção: Validade do ${expiredDoc.type} Vencida!`;
                } else if (nearExpiredDoc) {
                    hasAlert = true;
                    alertText = `Atenção: Validade do ${nearExpiredDoc.type} Próxima do Vencimento!`;
                }
            }
            
            // 4. Alerta de Multas Pendentes
            const hasPendingFine = finesData.some(fine => fine.vehicleId === vehicle.id && fine.paymentStatus === 'Pendente'); 
            if(hasPendingFine && !hasAlert) {
                hasAlert = true;
                alertText = 'Atenção: Há multas pendentes para este veículo.';
            }

            return { ...vehicle, possuiAviso: hasAlert, avisoTexto: alertText };
        });
    };

    const processedVehicles = useMemo(() => {
        return processVehiclesWithAlerts(vehicles, revisions || [], fines || []);
    }, [vehicles, revisions, fines]);

    const loadAllData = useCallback(async () => {
        if (!user) {
            setLoadingData(false); 
            return;
        }
        
        setLoadingData(true);
        setAlertMessage(''); 
        console.log("Iniciando carregamento de dados da API...");

        const dataEndpoints = {
            vehicles: { getter: apiClient.getVehicles, setter: setVehicles },
            obras: { getter: apiClient.getObras, setter: setObras },
            revisions: { getter: apiClient.getRevisions, setter: setRevisions },
            expenses: { getter: apiClient.getExpenses, setter: setExpenses },
            employees: { getter: apiClient.getEmployees, setter: setEmployees },
            partners: { getter: apiClient.getPartners, setter: setRawPartners },
            refuelings: { getter: apiClient.getRefuelings, setter: setRefuelings },
            comboioTransactions: { getter: apiClient.getComboioTransactions, setter: setRawComboioTransactions },
            fines: { getter: apiClient.getFines, setter: setRawFines },
            diarioDeBordo: { getter: apiClient.getDiarioDeBordo, setter: setDiarioDeBordoLogs },
        };

        if (user.user_type === 'operador') { 
            delete dataEndpoints.revisions;
            delete dataEndpoints.expenses;
            delete dataEndpoints.partners;
            delete dataEndpoints.comboioTransactions;
            delete dataEndpoints.fines;
        }

        try {
            const dataPromises = Object.entries(dataEndpoints).map(([key, { getter }]) => 
                getter().catch(err => { 
                    console.error(`Erro ao carregar ${key}:`, err);
                    return null; 
                })
            );
            
            let updateMessagePromise = Promise.resolve(null); 
            if (user.user_type !== 'operador') {
                updateMessagePromise = apiClient.adminGetUpdateMessage().catch(err => {
                    console.warn("Não foi possível carregar a mensagem de atualização:", err.message);
                    return null; 
                });
            }

            const [dataResults, updateResult] = await Promise.all([
                Promise.all(dataPromises),
                updateMessagePromise     
            ]);
            
            console.log("Dados recebidos da API:", dataResults);
            
            let resultIndex = 0;
            for (const key of Object.keys(dataEndpoints)) {
                if (dataResults[resultIndex] !== null) { 
                     dataEndpoints[key].setter(dataResults[resultIndex]); 
                } else {
                    setAlertMessage(prev => prev + `\nFalha ao carregar dados de ${key}.`);
                }
                resultIndex++;
            }

            if (updateResult && updateResult.showPopup) {
                setUpdateMessage(updateResult.message);
                setShowUpdateModal(true); 
            }

        } catch (error) {
            console.error("Erro GERAL ao carregar dados da API:", error);
            setAlertMessage(`Falha ao carregar dados do servidor: ${error.message}. Verifique sua conexão.`);
            if (error.message.includes('401') || error.message.includes('Erro 401')) {
                setAlertMessage("Sua sessão expirou ou é inválida. Por favor, faça login novamente.");
                logout(); 
            }
        } finally {
            setLoadingData(false);
            console.log("Carregamento de dados finalizado.");
        }
    }, [user, logout]); 

    useEffect(() => {
        loadAllData();
        return () => {}; 
    }, [loadAllData]); 
    
    if (user && user.user_type === 'operador') { 
        if (loadingData) {
            return <div className="flex items-center justify-center min-h-screen text-lg font-semibold"><Loader size={32} className="animate-spin mr-2" /> Carregando dados do operador...</div>;
        }
        return (
            <>
                {alertMessage && <CustomAlert message={alertMessage} onClose={() => setAlertMessage('')} />}
                <DiarioDeBordoPage 
                    apiClient={apiClient} 
                    user={user} 
                    employees={employees} 
                    vehicles={processedVehicles} 
                    obras={obras} 
                    setAlertMessage={setAlertMessage}
                    vehicleGroups={vehicleGroups} 
                    diarioDeBordoLogs={diarioDeBordoLogs}
                />
            </>
        );
    }

    const navigate = (page, filter = null) => { 
        setCurrentPage(page); 
        setPageFilter(filter); 
    };

    const reloadData = loadAllData;

    const renderPage = () => {
        const commonProps = { 
            user, 
            setAlertMessage, 
            PasswordConfirmationModal: (props) => <PasswordConfirmationModal {...props} apiClient={apiClient} />, 
            ConfirmationModal, 
            vehicleGroups, 
            extraObraOptions, 
            equipmentTypesForHours, 
            operationalSubGroups,
            apiClient, 
            reloadData, 
            navigate, 
            vehicles: processedVehicles, 
            obras,
            revisions,
            expenses,
            employees,
            partners, 
            refuelings,
            comboioTransactions, 
            fines, 
            diarioDeBordoLogs,
        };
        
        const AccessDenied = () => (
            <div className="flex flex-col items-center justify-center h-full">
                <div className="text-center p-10 bg-white rounded-lg shadow-md">
                    <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
                    <h1 className="mt-4 text-2xl font-bold text-red-600">Acesso Negado</h1>
                    <p className="text-gray-600 mt-2">Você não tem permissão para visualizar esta página.</p>
                </div>
            </div>
        );

        switch (currentPage) {
            case 'dashboard': return <Dashboard {...commonProps} />;
            case 'vehicles': return <VehiclePage {...commonProps} initialFilter={pageFilter} />;
            case 'obras': return <ObrasPage {...commonProps} initialFilter={pageFilter} />;
            case 'controleDiario': return <ControleDiarioPage {...commonProps} />;
            case 'revisions': return <RevisionsPage {...commonProps} />;
            case 'partners': return <PartnersPage {...commonProps} />;
            case 'refueling': return (user.podeAcessarAbastecimento || user.user_type === 'admin') ? <RefuelingPage {...commonProps} /> : <AccessDenied />;
            case 'orders': return <OrdersPage {...commonProps} />; 
            case 'comboio': return (user.podeAcessarAbastecimento || user.user_type === 'admin') ? <ComboioPage {...commonProps} /> : <AccessDenied />;
            case 'expenses': return <ExpensesPage {...commonProps} />;
            case 'employees': return <EmployeesPage {...commonProps} />;
            case 'fines': return <FinesPage {...commonProps} />;
            case 'tires': return <TiresPage {...commonProps} />; // NOVA ROTA
            case 'reports': return <ReportsPage {...commonProps} />; 
            case 'admin': return user.user_type === 'admin' ? <AdminPage {...commonProps} /> : <AccessDenied />; 
            default: return <Dashboard {...commonProps} />; 
        }
    };

    return (
        <>
            {showUpdateModal && updateMessage && (
                <UpdateMessageModal 
                    message={updateMessage} 
                    onClose={() => setShowUpdateModal(false)} 
                />
            )}
        
            <div className="flex h-screen bg-gray-100 text-gray-800 font-sans">
            <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} user={user} logout={logout} /> 
            
            <main className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-4 sm:p-6 lg:p-8">
                    {alertMessage && <CustomAlert message={alertMessage} onClose={() => setAlertMessage('')} />}
                    
                    {loadingData ? (
                        <div className="flex items-center justify-center h-full text-lg font-semibold">
                            <Loader size={32} className="animate-spin mr-3" /> Carregando dados da frota...
                        </div>
                        ) : (
                        renderPage() 
                        )}
                </div>
            </main>
            </div>
        </>
    );
};

const Sidebar = ({ currentPage, setCurrentPage, user, logout }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    
    const handleLogout = async () => { 
        if(logout) {
            await logout(); 
        } else {
            console.error("Função logout não encontrada!");
        }
    }; 
    
    const navItems = [
        { id: 'dashboard', label: 'Painel de Controle', icon: <Building size={15} /> },
        { id: 'vehicles', label: 'Veículos', icon: <Truck size={20} /> },
        { id: 'tires', label: 'Pneus', icon: <Disc size={20} /> }, // NOVO ITEM
        { id: 'obras', label: 'Obras', icon: <HardHat size={20} /> },
        { id: 'controleDiario', label: 'Controle Diário', icon: <CalendarClock size={20} /> },
        { id: 'revisions', label: 'Revisões', icon: <Bell size={20} /> },
        { id: 'partners', label: 'Postos', icon: <Fuel size={20} /> },
        { id: 'refueling', label: 'Abastecimento', icon: <Droplet size={20} /> },
        { id: 'comboio', label: 'Comboio', icon: <Truck size={20} /> },
        { id: 'orders', label: 'Ordens de Compra', icon: <ShoppingCart size={20}/> },
        { id: 'expenses', label: 'Despesas', icon: <DollarSign size={20} /> },
        { id: 'employees', label: 'Funcionários', icon: <User size={20} /> },
        { id: 'fines', label: 'Multas', icon: <ShieldAlert size={20} /> },
        { id: 'reports', label: 'Relatórios', icon: <FileText size={20} /> }, 
    ];
    
    return (
        <div className={`bg-gray-900 text-gray-200 shadow-md transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}>
            <div className="flex flex-col h-full">
                <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700">
                    {!isCollapsed && <img src="https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png" alt="MAK Logo" className="h-8" />}
                    <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-2 rounded-md text-gray-400 hover:bg-gray-700 focus:outline-none">
                        {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                    </button>
                </div>
                
                <nav className="flex-1 mt-2 overflow-y-auto">
                    <ul className="space-y-1 px-2">
                        {navItems.map(item => {
                            const isAdmin = user.user_type === 'admin';
                            const canAccessRefuelingRelated = user.podeAcessarAbastecimento || isAdmin;

                            if ((item.id === 'refueling' || item.id === 'comboio') && !canAccessRefuelingRelated) {
                                return null; 
                            }
                            
                            return (
                                <li key={item.id}>
                                    <button 
                                        onClick={() => setCurrentPage(item.id)} 
                                        className={`flex items-center w-full p-2 rounded-lg transition-colors duration-200 ${ 
                                            currentPage === item.id 
                                            ? 'bg-yellow-500 text-gray-900 shadow-inner' 
                                            : 'hover:bg-gray-700 text-gray-300' 
                                        }`}
                                        title={item.label} 
                                    >
                                        {item.icon}
                                        {!isCollapsed && <span className="ml-3 font-medium truncate">{item.label}</span>}
                                    </button>
                                </li>
                            );
                        })}
                        
                        {user && user.user_type === 'admin' && (
                            <li className="mt-4 border-t border-gray-700 pt-2">
                                <button 
                                    onClick={() => setCurrentPage('admin')} 
                                    className={`flex items-center w-full p-2 rounded-lg transition-colors duration-200 font-semibold ${ 
                                        currentPage === 'admin' 
                                        ? 'bg-yellow-500 text-gray-900 shadow-inner' 
                                        : 'hover:bg-gray-700 text-gray-300' 
                                    }`}
                                    title="Administração"
                                >
                                    <Shield size={20} />
                                    {!isCollapsed && <span className="ml-3 font-medium truncate">Administração</span>}
                                </button>
                            </li>
                        )}
                    </ul>
                </nav>
                
                <div className="p-2 border-t border-gray-700">
                    <button 
                        onClick={handleLogout} 
                        className="flex items-center w-full p-2 rounded-lg transition-colors duration-200 hover:bg-red-800 hover:text-white text-red-400"
                        title="Sair"
                    >
                        <LogOut size={20}/>
                        {!isCollapsed && <span className="ml-3 font-medium truncate">Sair</span>}
                    </button>
                </div>
            </div>
        </div>
    );
};

const AppRouter = () => {
    const { user, loading } = useAuth(); 

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen text-lg font-semibold bg-gray-100">
                <Loader size={40} className="animate-spin mr-3 text-yellow-500" /> Carregando aplicação...
            </div>
        );
    }

    if (!user) {
        return <LoginScreen apiClient={apiClient} />;
    }
    
    return <AppContent />;
};

const AppContainer = () => {
    useEffect(() => {
        document.title = "Frotas MAK";
        const favicon = document.querySelector("link[rel~='icon']");
        if (favicon) {
            favicon.href = 'https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png'; 
        }
    }, []);

    return (
        <AuthProvider> 
            <AppRouter />
        </AuthProvider>
    );
};

export default AppContainer;