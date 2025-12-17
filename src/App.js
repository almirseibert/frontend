import React, { useState, useEffect } from 'react'; 
import { 
    LogOut, HardHat, Building, Clock, Truck, 
    ChevronLeft, ChevronRight, Bell, Fuel, Droplet, DollarSign, ShieldAlert, 
    User, Shield, CalendarClock, ShoppingCart, Loader, X, Disc, ClipboardCheck, FileText, Key
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
    getVehicleMainReading
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

// --- Modal de Troca de Senha ---
const ChangePasswordModal = ({ isOpen, onClose, apiClient }) => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if(isOpen) {
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setMessage(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage(null);

        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'As novas senhas não conferem.' });
            return;
        }
        if (newPassword.length < 6) {
            setMessage({ type: 'error', text: 'A nova senha deve ter no mínimo 6 caracteres.' });
            return;
        }

        setLoading(true);
        try {
            await apiClient.changePassword({ currentPassword, newPassword });
            setMessage({ type: 'success', text: 'Senha alterada com sucesso!' });
            setTimeout(() => { onClose(); }, 1500);
        } catch (error) {
            setMessage({ type: 'error', text: error.message || 'Erro ao alterar senha.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[110]">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h2 className="text-lg font-bold text-gray-800">Alterar Senha</h2>
                    <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600"/></button>
                </div>
                
                {message && (
                    <div className={`p-2 mb-3 rounded text-sm text-center ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase">Senha Atual</label>
                        <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full p-2 border rounded focus:border-yellow-500 outline-none" required />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase">Nova Senha</label>
                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full p-2 border rounded focus:border-yellow-500 outline-none" required />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase">Confirmar Nova Senha</label>
                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full p-2 border rounded focus:border-yellow-500 outline-none" required />
                    </div>

                    <div className="flex justify-end gap-2 mt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm font-bold">Cancelar</button>
                        <button type="submit" disabled={loading} className="px-4 py-2 bg-yellow-400 text-gray-900 rounded hover:bg-yellow-500 text-sm font-bold disabled:opacity-50">
                            {loading ? 'Salvando...' : 'Confirmar'}
                        </button>
                    </div>
                </form>
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

// --- SIDEBAR (Otimizada e Compacta) ---
const Sidebar = ({ currentPage, setCurrentPage, user, logout, onChangePassword }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    
    const navItems = [
        { id: 'dashboard', label: 'Painel Geral', icon: <Building size={16} /> },
        { id: 'billing', label: 'Faturamento', icon: <ClipboardCheck size={16} /> },
        { id: 'vehicles', label: 'Veículos', icon: <Truck size={16} /> },
        { id: 'obras', label: 'Obras', icon: <HardHat size={16} /> },
        { id: 'controleDiario', label: 'Controle Diário', icon: <CalendarClock size={16} />, dimmed: true },
        { id: 'revisions', label: 'Revisões', icon: <Bell size={16} /> },
        { id: 'tires', label: 'Gestão de Pneus', icon: <Disc size={16} /> }, 
        { id: 'partners', label: 'Postos/Parceiros', icon: <Fuel size={16} /> },
        { id: 'refueling', label: 'Abastecimento', icon: <Droplet size={16} /> },
        { id: 'comboio', label: 'Comboio', icon: <Truck size={16} /> }, 
        { id: 'orders', label: 'Compras/Serviços', icon: <ShoppingCart size={16}/>, dimmed: true },
        { id: 'expenses', label: 'Despesas', icon: <DollarSign size={16} /> },
        { id: 'employees', label: 'Funcionários', icon: <User size={16} /> },
        { id: 'fines', label: 'Multas', icon: <ShieldAlert size={16} /> },
        { id: 'reports', label: 'Relatórios', icon: <FileText size={16} /> }, 
    ];
    
    return (
        <div className={`bg-slate-900 text-slate-300 shadow-xl transition-all duration-300 ease-in-out flex flex-col ${isCollapsed ? 'w-14' : 'w-56'} h-full z-20`}>
            {/* Header Sidebar com Logo */}
            <div className="h-14 flex items-center justify-between px-3 border-b border-slate-700 bg-slate-950 shrink-0">
                {!isCollapsed ? (
                     <img src="https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png" alt="MAK" className="h-8 object-contain" />
                ) : (
                    <div className="w-full flex justify-center">
                        <span className="font-bold text-yellow-500 text-xs">MAK</span>
                    </div>
                )}
                <button 
                    onClick={() => setIsCollapsed(!isCollapsed)} 
                    className="p-1 rounded text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                >
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
            </div>
            
            {/* Nav Items */}
            <nav className="flex-1 overflow-y-auto custom-scrollbar py-2">
                <ul className="space-y-1 px-2">
                    {navItems.map(item => {
                        const isAdmin = user.user_type === 'admin';
                        const canAccessRefuelingRelated = user.podeAcessarAbastecimento || isAdmin;

                        if ((item.id === 'refueling' || item.id === 'comboio') && !canAccessRefuelingRelated) return null;
                        
                        const isActive = currentPage === item.id;
                        const isDimmed = item.dimmed;

                        return (
                            <li key={item.id}>
                                <button 
                                    onClick={() => setCurrentPage(item.id)} 
                                    className={`flex items-center w-full px-2 py-1.5 rounded-md transition-all duration-200 group ${ 
                                        isActive 
                                        ? 'bg-yellow-500 text-slate-900 shadow-md' 
                                        : 'hover:bg-slate-800 hover:text-white' 
                                    } ${isDimmed && !isActive ? 'opacity-50 hover:opacity-100' : ''}`}
                                    title={isCollapsed ? item.label : ''}
                                >
                                    <span className={`${isActive ? 'text-slate-900' : 'text-slate-400 group-hover:text-white'}`}>
                                        {item.icon}
                                    </span>
                                    {!isCollapsed && <span className="ml-3 text-xs font-bold truncate">{item.label}</span>}
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
                                    className={`flex items-center w-full px-2 py-1.5 rounded-md transition-all duration-200 ${ 
                                        currentPage === 'admin' 
                                        ? 'bg-red-600 text-white shadow-md' 
                                        : 'text-red-400 hover:bg-red-900/30 hover:text-red-300' 
                                    }`}
                                >
                                    <Shield size={16} />
                                    {!isCollapsed && <span className="ml-3 text-xs font-bold truncate">Admin</span>}
                                </button>
                            </li>
                        </>
                    )}
                </ul>
            </nav>
            
            {/* Footer Sidebar */}
            <div className="p-2 border-t border-slate-700 bg-slate-950 shrink-0">
                <div className={`mb-2 px-2 flex items-center ${isCollapsed ? 'justify-center' : ''}`}>
                    <div className="w-6 h-6 rounded-full bg-yellow-500 text-slate-900 flex items-center justify-center font-bold text-xs">
                        {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    {!isCollapsed && (
                         <div className="ml-2 overflow-hidden">
                             <p className="text-xs text-white truncate font-medium">{user.name}</p>
                             <button onClick={onChangePassword} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                                 <Key size={10} /> Trocar Senha
                             </button>
                         </div>
                    )}
                </div>
                <button 
                    onClick={logout} 
                    className="flex items-center w-full px-2 py-1.5 rounded-md transition-colors duration-200 hover:bg-red-900/50 text-slate-400 hover:text-red-400"
                    title="Sair"
                >
                    <LogOut size={16}/>
                    {!isCollapsed && <span className="ml-3 text-xs font-bold">Sair</span>}
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
    const [dailyWorkLogs, setDailyWorkLogs] = useState([]); 
    
    const [loadingData, setLoadingData] = useState(true); 
    const [updateMessage, setUpdateMessage] = useState(null);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [showChangePasswordModal, setShowChangePasswordModal] = useState(false); // Modal Senha

    const partners = React.useMemo(() => [...rawPartners].sort((a, b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '')), [rawPartners]);
    const comboioTransactions = React.useMemo(() => [...rawComboioTransactions].sort((a, b) => (new Date(b.date).getTime()) - (new Date(a.date).getTime())), [rawComboioTransactions]);
    const fines = React.useMemo(() => [...rawFines].sort((a, b) => (new Date(b.dataInfracao).getTime()) - (new Date(a.dataInfracao).getTime())), [rawFines]);

    // --- Processamento de Alertas de Veículos (Centralizado) ---
    const processVehiclesWithAlerts = (vehiclesData, revisionsData, finesData) => {
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(now.getDate() + 30);

        return vehiclesData.map(vehicle => {
            let hasAlert = false;
            let alertText = '';

            // 1. Alerta de Circulação
            if (vehicle.canCirculate === false || vehicle.canCirculate === 0 || vehicle.canCirculate === '0') { 
                hasAlert = true;
                alertText = `BLOQUEIO: O veículo não pode rodar (Doc/Manutenção).`;
            }

            // 2. Alerta de Revisão
            const revision = revisionsData.find(r => r.vehicleId === vehicle.id); 
            if (revision && !hasAlert) {
                const proximaData = revision.proximaRevisaoData ? new Date(revision.proximaRevisaoData) : null;
                const proximoOdometro = revision.proximaRevisaoOdometro;
                const proximoHorimetro = revision.proximaRevisaoHorimetro;
                
                const readingData = getVehicleMainReading(vehicle); 
                const currentReading = readingData.raw;
                const unit = readingData.unit;

                const avisoAntecedencia = parseFloat(revision.avisoAntecedenciaKmHr || 0);
                const avisoDias = parseInt(revision.avisoAntecedenciaDias || 0);
                
                // Meta baseada no tipo de leitura
                let metaLeitura = unit === 'Hr' ? proximoHorimetro : proximoOdometro;
                if (!metaLeitura && unit === 'Hr' && proximoOdometro) metaLeitura = proximoOdometro; // Fallback

                // Lógica Data
                if (proximaData && now >= proximaData) {
                    hasAlert = true;
                    alertText = 'Atenção: Revisão Vencida (Data)!';
                } else if (proximaData && avisoDias > 0) {
                     const warningDate = new Date(proximaData);
                     warningDate.setDate(warningDate.getDate() - avisoDias);
                     if (now >= warningDate) {
                        hasAlert = true;
                        alertText = 'Atenção: Revisão Próxima (Data)!';
                     }
                }

                // Lógica Leitura
                if (!hasAlert && metaLeitura > 0) {
                     if (currentReading >= metaLeitura) {
                         hasAlert = true;
                         alertText = `Atenção: Revisão Vencida (${unit})!`;
                     } else if (avisoAntecedencia > 0 && currentReading >= (metaLeitura - avisoAntecedencia)) {
                         hasAlert = true;
                         alertText = `Atenção: Revisão Próxima (${unit})!`;
                     }
                }
            }

            // 3. Alerta de Documentos de Caminhão
            const isTruck = vehicleGroups['Caminhões'].includes(vehicle.tipo) || vehicleGroups['Caminhões de Trecho'].includes(vehicle.tipo);
            if (isTruck && !hasAlert) {
                const docs = [
                    { type: 'Tacógrafo', date: vehicle.validadeTacografo },
                    { type: 'AET DAER', date: vehicle.validadeAET_DAER },
                    { type: 'AET DNIT', date: vehicle.validadeAET_DNIT },
                ];
                
                for (const doc of docs) {
                    if (doc.date) {
                        const d = new Date(doc.date);
                        const compareDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()); // Zera horas
                        if (now > compareDate) {
                            hasAlert = true;
                            alertText = `Atenção: ${doc.type} Vencido!`;
                            break; 
                        } else if (compareDate <= thirtyDaysFromNow) {
                            hasAlert = true;
                            alertText = `Atenção: ${doc.type} Vence em breve!`;
                        }
                    }
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

    const processedVehicles = React.useMemo(() => {
        return processVehiclesWithAlerts(vehicles, revisions || [], fines || []);
    }, [vehicles, revisions, fines]);

    const navigate = (page, filter = null) => { 
        setCurrentPage(page); 
        setPageFilter(filter); 
    };

    const loadAllData = React.useCallback(async () => {
        if (!user) { setLoadingData(false); return; }
        
        setLoadingData(true);
        setAlertMessage(''); 

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
            dailyWorkLogs: { getter: () => apiClient.getDailyLogs('all'), setter: setDailyWorkLogs },
        };

        if (user.user_type === 'operador') { 
            delete dataEndpoints.revisions;
            delete dataEndpoints.expenses;
            delete dataEndpoints.partners;
            delete dataEndpoints.comboioTransactions;
            delete dataEndpoints.fines;
            delete dataEndpoints.dailyWorkLogs;
        }

        try {
            const promises = Object.values(dataEndpoints).map(endpoint => endpoint.getter().catch(e => null));
            const results = await Promise.all(promises);

            Object.keys(dataEndpoints).forEach((key, index) => {
                if (results[index] !== null) {
                    dataEndpoints[key].setter(results[index]);
                }
            });

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

    const renderPage = () => {
        const commonProps = { 
            user, setAlertMessage, PasswordConfirmationModal: (props) => <PasswordConfirmationModal {...props} apiClient={apiClient} />, 
            ConfirmationModal, vehicleGroups, extraObraOptions, equipmentTypesForHours, operationalSubGroups,
            apiClient, reloadData: loadAllData, navigate, 
            vehicles: processedVehicles, 
            obras, revisions, expenses, employees, partners, refuelings, comboioTransactions, fines, diarioDeBordoLogs,
            dailyWorkLogs,
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
            
            <Sidebar 
                currentPage={currentPage} 
                setCurrentPage={setCurrentPage} 
                user={user} 
                logout={logout} 
                onChangePassword={() => setShowChangePasswordModal(true)} // Trigger Modal
            /> 
            
            <ChangePasswordModal 
                isOpen={showChangePasswordModal} 
                onClose={() => setShowChangePasswordModal(false)} 
                apiClient={apiClient} 
            />

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