import React, { useState, useEffect } from 'react'; 
import { 
    LogOut, HardHat, Building, Clock, Truck, 
    ChevronLeft, ChevronRight, Bell, Fuel, Droplet, DollarSign, ShieldAlert, 
    User, Shield, CalendarClock, ShoppingCart, Loader, X, Disc, ClipboardCheck,
    Menu // Menu icon for mobile
} from 'lucide-react';

import { AuthProvider, useAuth } from './contexts/AuthContext'; 

// Page Imports
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
import TiresPage from './pages/TiresPage'; 
import BillingPage from './pages/BillingPage';

import apiClient from './services/apiClient'; 
import { 
    vehicleGroups, 
    extraObraOptions, 
    operationalSubGroups, 
    equipmentTypesForHours, 
} from './utils/vehicleRules';

// --- Modais Globais (Simples) ---
const CustomAlert = ({ message, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
        <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md text-center">
            <pre className="text-base mb-6 whitespace-pre-wrap text-left font-sans text-gray-700">{message}</pre>
            <button onClick={onClose} className="py-2 px-6 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 transition-colors">OK</button>
        </div>
    </div>
);

const ConfirmationModal = ({ title, message, onConfirm, onClose, confirmText = 'Confirmar', cancelText = 'Cancelar', confirmColor = 'bg-yellow-400 hover:bg-yellow-500 text-gray-900' }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[90]">
        <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-lg font-bold mb-3 text-gray-800">{title}</h3>
            <p className="text-gray-600 mb-6 text-sm">{message}</p>
            <div className="flex justify-end gap-3">
                <button onClick={onClose} className="py-2 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 text-sm font-medium">{cancelText}</button>
                <button onClick={onConfirm} className={`px-4 py-2 rounded-lg text-sm font-semibold ${confirmColor}`}>{confirmText}</button>
            </div>
        </div>
    </div>
);

const PasswordConfirmationModal = ({ onConfirm, onClose, message, apiClient }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    const handleConfirm = async () => {
        setIsVerifying(true);
        setError('');
        try {
            await apiClient.validatePassword(password);
            await onConfirm(); 
            onClose(); 
        } catch (err) {
            setError(err.message || "Senha incorreta.");
        } finally {
            setIsVerifying(false);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[90]">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <h3 className="text-lg font-bold mb-3 text-gray-800">Confirmação de Segurança</h3>
                <p className="text-gray-600 mb-4 text-sm">{message || "Insira sua senha para confirmar esta operação sensível."}</p>
                <div className="mb-4">
                    <input 
                        type="password" 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" 
                        placeholder="Sua senha"
                        autoFocus
                    />
                </div>
                {error && <p className="text-xs text-red-600 mb-3 font-medium">{error}</p>}
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="py-2 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 text-sm">Cancelar</button>
                    <button 
                        onClick={handleConfirm} 
                        disabled={isVerifying} 
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 flex items-center gap-2 text-sm font-semibold"
                    >
                        {isVerifying && <Loader size={14} className="animate-spin" />}
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
};

const UpdateMessageModal = ({ message, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[110]"> 
        <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-xl">
            <div className="flex justify-between items-center mb-4">
                 <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Bell className="text-yellow-500" /> Novidades do Sistema
                 </h2>
                 <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-200">
                    <X size={20} />
                 </button>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 max-h-[60vh] overflow-y-auto mb-6">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{message}</pre>
            </div>
            <button onClick={onClose} className="w-full py-2 px-6 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 transition-colors">
                Entendido
            </button>
        </div>
    </div>
);

// --- SIDEBAR (Otimizada para 1366x768) ---
const Sidebar = ({ currentPage, setCurrentPage, user, logout }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    
    // Lista otimizada para caber na tela sem scroll
    const navItems = [
        { id: 'dashboard', label: 'Painel Geral', icon: <Building size={18} /> },
        { id: 'billing', label: 'Faturamento', icon: <ClipboardCheck size={18} /> },
        { id: 'vehicles', label: 'Veículos', icon: <Truck size={18} /> },
        { id: 'obras', label: 'Obras', icon: <HardHat size={18} /> },
        { id: 'controleDiario', label: 'Controle Diário', icon: <CalendarClock size={18} /> },
        { id: 'revisions', label: 'Revisões', icon: <Bell size={18} /> },
        { id: 'tires', label: 'Gestão de Pneus', icon: <Disc size={18} /> }, 
        { id: 'partners', label: 'Postos/Parceiros', icon: <Fuel size={18} /> },
        { id: 'refueling', label: 'Abastecimento', icon: <Droplet size={18} /> },
        { id: 'comboio', label: 'Comboio', icon: <Truck size={18} /> }, // Ícone repetido, mas ok pelo contexto
        { id: 'orders', label: 'Compras/Serviços', icon: <ShoppingCart size={18}/> },
        { id: 'expenses', label: 'Despesas', icon: <DollarSign size={18} /> },
        { id: 'employees', label: 'Funcionários', icon: <User size={18} /> },
        { id: 'fines', label: 'Multas', icon: <ShieldAlert size={18} /> },
        { id: 'reports', label: 'Relatórios', icon: <FileText size={18} /> }, 
    ];
    
    return (
        <div className={`bg-slate-900 text-slate-300 shadow-xl transition-all duration-300 ease-in-out flex flex-col ${isCollapsed ? 'w-16' : 'w-64'} h-full z-20`}>
            {/* Header Sidebar */}
            <div className="h-14 flex items-center justify-between px-3 border-b border-slate-700 bg-slate-950 shrink-0">
                {!isCollapsed && (
                    <span className="font-bold text-white text-lg tracking-tight ml-2 truncate">FROTAS MAK</span>
                )}
                <button 
                    onClick={() => setIsCollapsed(!isCollapsed)} 
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                >
                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
            </div>
            
            {/* Nav Items */}
            <nav className="flex-1 overflow-y-auto custom-scrollbar py-2">
                <ul className="space-y-0.5 px-2">
                    {navItems.map(item => {
                        const isAdmin = user.user_type === 'admin';
                        const canAccessRefuelingRelated = user.podeAcessarAbastecimento || isAdmin;

                        if ((item.id === 'refueling' || item.id === 'comboio') && !canAccessRefuelingRelated) return null;
                        
                        const isActive = currentPage === item.id;

                        return (
                            <li key={item.id}>
                                <button 
                                    onClick={() => setCurrentPage(item.id)} 
                                    className={`flex items-center w-full px-3 py-2 rounded-md transition-all duration-200 group ${ 
                                        isActive 
                                        ? 'bg-yellow-500 text-slate-900 font-semibold shadow-md' 
                                        : 'hover:bg-slate-800 hover:text-white' 
                                    }`}
                                    title={isCollapsed ? item.label : ''}
                                >
                                    <span className={`${isActive ? 'text-slate-900' : 'text-slate-400 group-hover:text-white'}`}>
                                        {item.icon}
                                    </span>
                                    {!isCollapsed && <span className="ml-3 text-sm truncate">{item.label}</span>}
                                </button>
                            </li>
                        );
                    })}
                    
                    {user && user.user_type === 'admin' && (
                        <>
                            <div className="my-2 border-t border-slate-700 mx-2"></div>
                            <li>
                                <button 
                                    onClick={() => setCurrentPage('admin')} 
                                    className={`flex items-center w-full px-3 py-2 rounded-md transition-all duration-200 ${ 
                                        currentPage === 'admin' 
                                        ? 'bg-red-600 text-white font-semibold shadow-md' 
                                        : 'text-red-400 hover:bg-red-900/30 hover:text-red-300' 
                                    }`}
                                >
                                    <Shield size={18} />
                                    {!isCollapsed && <span className="ml-3 text-sm truncate">Admin</span>}
                                </button>
                            </li>
                        </>
                    )}
                </ul>
            </nav>
            
            {/* Footer Sidebar */}
            <div className="p-3 border-t border-slate-700 bg-slate-950 shrink-0">
                <button 
                    onClick={logout} 
                    className="flex items-center w-full px-3 py-2 rounded-md transition-colors duration-200 hover:bg-red-900/50 text-slate-400 hover:text-red-400"
                    title="Sair"
                >
                    <LogOut size={18}/>
                    {!isCollapsed && <span className="ml-3 text-sm font-medium">Sair do Sistema</span>}
                </button>
            </div>
        </div>
    );
};

// --- APP CONTENT ---
const AppContent = () => {
    const { user, logout } = useAuth(); 
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [pageFilter, setPageFilter] = useState(null); 
    const [alertMessage, setAlertMessage] = useState(''); 

    // Dados Globais
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

    // Memos para ordenação
    const partners = React.useMemo(() => [...rawPartners].sort((a, b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '')), [rawPartners]);
    const comboioTransactions = React.useMemo(() => [...rawComboioTransactions].sort((a, b) => (new Date(b.date).getTime()) - (new Date(a.date).getTime())), [rawComboioTransactions]);
    const fines = React.useMemo(() => [...rawFines].sort((a, b) => (new Date(b.dataInfracao).getTime()) - (new Date(a.dataInfracao).getTime())), [rawFines]);

    // Função para navegar entre páginas com filtro
    const navigate = (page, filter = null) => { 
        setCurrentPage(page); 
        setPageFilter(filter); 
    };

    // Função de carregamento de dados
    const loadAllData = React.useCallback(async () => {
        if (!user) { setLoadingData(false); return; }
        
        setLoadingData(true);
        setAlertMessage(''); 

        // Mapeamento de endpoints
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

        // Filtra endpoints para operador
        if (user.user_type === 'operador') { 
            delete dataEndpoints.revisions;
            delete dataEndpoints.expenses;
            delete dataEndpoints.partners;
            delete dataEndpoints.comboioTransactions;
            delete dataEndpoints.fines;
        }

        try {
            const promises = Object.values(dataEndpoints).map(endpoint => endpoint.getter().catch(e => null));
            const results = await Promise.all(promises);

            Object.keys(dataEndpoints).forEach((key, index) => {
                if (results[index] !== null) {
                    dataEndpoints[key].setter(results[index]);
                }
            });

            // Mensagem de Atualização (Apenas Admin/User)
            if (user.user_type !== 'operador') {
                try {
                    const updateMsg = await apiClient.adminGetUpdateMessage();
                    if (updateMsg && updateMsg.showPopup) {
                        setUpdateMessage(updateMsg.message);
                        setShowUpdateModal(true);
                    }
                } catch (e) { console.warn("Erro msg update", e); }
            }

        } catch (error) {
            console.error("Erro Fatal API:", error);
            setAlertMessage("Erro de conexão com o servidor.");
            if (error.message.includes('401')) logout();
        } finally {
            setLoadingData(false);
        }
    }, [user, logout]); 

    useEffect(() => { loadAllData(); }, [loadAllData]);

    // Renderização para Operador (Simplificada)
    if (user && user.user_type === 'operador') { 
        if (loadingData) return <div className="flex justify-center items-center h-screen"><Loader className="animate-spin text-yellow-500" size={40} /></div>;
        return (
            <DiarioDeBordoPage 
                apiClient={apiClient} user={user} employees={employees} 
                vehicles={vehicles} obras={obras} setAlertMessage={setAlertMessage}
                vehicleGroups={vehicleGroups} diarioDeBordoLogs={diarioDeBordoLogs}
            />
        );
    }

    // Renderização de Página
    const renderPage = () => {
        const commonProps = { 
            user, setAlertMessage, PasswordConfirmationModal: (props) => <PasswordConfirmationModal {...props} apiClient={apiClient} />, 
            ConfirmationModal, vehicleGroups, extraObraOptions, equipmentTypesForHours, operationalSubGroups,
            apiClient, reloadData: loadAllData, navigate, 
            vehicles, obras, revisions, expenses, employees, partners, refuelings, comboioTransactions, fines, diarioDeBordoLogs,
        };
        
        const Denied = () => <div className="p-10 text-center text-red-500 font-bold bg-white rounded shadow m-4">Acesso Negado</div>;

        switch (currentPage) {
            case 'dashboard': return <Dashboard {...commonProps} />;
            case 'vehicles': return <VehiclePage {...commonProps} initialFilter={pageFilter} />;
            case 'obras': return <ObrasPage {...commonProps} initialFilter={pageFilter} />;
            case 'billing': return <BillingPage {...commonProps} />;
            case 'controleDiario': return <ControleDiarioPage {...commonProps} />;
            case 'revisions': return <RevisionsPage {...commonProps} />;
            case 'partners': return <PartnersPage {...commonProps} />;
            case 'refueling': return (user.podeAcessarAbastecimento || user.user_type === 'admin') ? <RefuelingPage {...commonProps} /> : <Denied />;
            case 'orders': return <OrdersPage {...commonProps} />; 
            case 'comboio': return (user.podeAcessarAbastecimento || user.user_type === 'admin') ? <ComboioPage {...commonProps} /> : <Denied />;
            case 'expenses': return <ExpensesPage {...commonProps} />;
            case 'employees': return <EmployeesPage {...commonProps} />;
            case 'fines': return <FinesPage {...commonProps} />;
            case 'tires': return <TiresPage {...commonProps} revisions={revisions} />; 
            case 'reports': return <ReportsPage {...commonProps} />; 
            case 'admin': return user.user_type === 'admin' ? <AdminPage {...commonProps} /> : <Denied />; 
            default: return <Dashboard {...commonProps} />; 
        }
    };

    return (
        <div className="flex h-screen bg-slate-100 text-gray-800 font-sans overflow-hidden">
            {showUpdateModal && updateMessage && <UpdateMessageModal message={updateMessage} onClose={() => setShowUpdateModal(false)} />}
            
            <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} user={user} logout={logout} /> 
            
            <main className="flex-1 flex flex-col relative overflow-hidden">
                <div className="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 bg-slate-100 scroll-smooth">
                    {alertMessage && <CustomAlert message={alertMessage} onClose={() => setAlertMessage('')} />}
                    {loadingData ? (
                        <div className="flex items-center justify-center h-full text-lg font-semibold text-gray-500">
                            <Loader size={32} className="animate-spin mr-3 text-yellow-500" /> Sincronizando dados...
                        </div>
                    ) : renderPage()}
                </div>
            </main>
        </div>
    );
};

const AppRouter = () => {
    const { user, loading } = useAuth(); 
    if (loading) return <div className="flex items-center justify-center min-h-screen bg-slate-100"><Loader size={40} className="animate-spin text-yellow-500" /></div>;
    return !user ? <LoginScreen apiClient={apiClient} /> : <AppContent />;
};

export default function AppContainer() {
    return <AuthProvider><AppRouter /></AuthProvider>;
}