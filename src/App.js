import React, { useState, useEffect, useMemo, useContext, createContext, useCallback } from 'react'; // Adicionado useCallback
// Ícones Lucide mantidos
// ... (ícones importados sem mudança) ...
import { 
    LogOut, HardHat, Building, Clock, Truck, PlusCircle, Trash2, Edit, FileText, 
    ChevronLeft, ChevronRight, Bell, Fuel, Droplet, DollarSign, ShieldAlert, 
    User, AlertTriangle, Shield, CalendarClock, ShoppingCart, Loader, X 
} from 'lucide-react';

// --- CONTEXTO DE AUTENTICAÇÃO ---
// ... (imports do AuthContext sem mudança) ...
import { AuthProvider, useAuth } from './contexts/AuthContext'; 

// --- IMPORTAÇÃO DAS PÁGINAS ---
// ... (imports das páginas sem mudança) ...
import Dashboard from './pages/Dashboard';
import ObrasPage from './pages/ObrasPage';
import PartnersPage from './pages/PartnersPage';
import RefuelingPage from './pages/RefuelingPage';
import ComboioPage from './pages/ComboioPage';
import ExpensesPage from './pages/ExpensesPage';
import EmployeesPage from './pages/EmployeesPage';
import ReportsPage from './pages/ReportsPage'; // Descomente se/quando criar
import FinesPage from './pages/FinesPage';
import VehiclePage from './pages/VehiclePage';
import RevisionsPage from './pages/RevisionsPage';
import DiarioDeBordoPage from './pages/DiarioDeBordoPage';
import AdminPage from './pages/AdminPage'; 
import ControleDiarioPage from './pages/ControleDiarioPage';
import OrdersPage from './pages/OrdersPage'; 
import LoginScreen from './components/LoginScreen'; // Importa a nova tela de login

// --- IMPORTAÇÃO DO CLIENTE DE API ---
// Essencial para comunicar com o backend
import apiClient from './services/apiClient'; 

// --- DADOS GLOBAIS (CONSTANTES) ---
// ... (constantes vehicleGroups, etc. sem mudança) ...
const vehicleGroups = {
    'Veículos Leves': ['Camionete', 'Automóvel', 'Moto'],
    'Caminhões': ['Caçamba Traçado', 'Caçamba Truckado', 'Caçamba Toco', 'Caminhão Pipa', 'Caminhão Tanque', 'Cavalo', 'Caminhão carroceria', 'Bitruck', 'Caçamba Bitruck'],
    'Máquinas Pesadas': ['Rolo', 'Motoniveladora', 'Escavadeira', 'Fresadora', 'Pá Carregadeira', 'Trator', 'Trator de Esteiras', 'Retroescavadeira']
};
const extraObraOptions = ['Administração', 'Oficina', 'Pátio', 'Rampa', 'Diversos'];
const operationalSubGroups = ['Administrativo', 'Oficina', 'Operacional', 'Supervisor'];
const equipmentTypesForHours = ['Caminhão', 'Escavadeira', 'Rolo', 'Retroescavadeira', 'Pá Carregadeira', 'Motoniveladora', 'Trator', 'Trator de Esteiras'];

// --- REMOVIDO: Configuração Firebase e Offline (Dexie) ---

// --- COMPONENTES DE UI (MODAIS) ---
// ... (Modal CustomAlert sem mudança) ...
const CustomAlert = ({ message, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
        <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-2xl text-center">
            {/* Usando <pre> para preservar quebras de linha e espaços da mensagem */}
            <pre className="text-lg mb-6 whitespace-pre-wrap text-left font-sans">{message}</pre>
            <button onClick={onClose} className="py-2 px-6 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500">OK</button>
        </div>
    </div>
);

// ... (Modal ConfirmationModal sem mudança) ...
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

// ... (Modal PasswordConfirmationModal sem mudança) ...
const PasswordConfirmationModal = ({ onConfirm, onClose, message, apiClient }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    // Verifica se apiClient foi passado corretamente
    if (!apiClient) {
        console.error("PasswordConfirmationModal: apiClient não foi fornecido!");
        return <CustomAlert message="Erro interno: Falta configuração para confirmação de senha." onClose={onClose} />;
    }

    const handleConfirm = async () => {
        setIsVerifying(true);
        setError('');
        
        try {
            // Chama a rota /api/auth/validate-password do backend via apiClient
            await apiClient.validatePassword(password);
            
            // Se a API não der erro (status 200), a senha está correta.
            await onConfirm(); // Executa a ação principal (ex: deletar)
            onClose(); // Fecha o modal
        } catch (err) {
            // Se a API der erro (401, etc), o apiClient vai lançar o erro.
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

// --- REMOVIDO: Tela de Login (agora importada de pages/LoginScreen.js) ---

// --- CONTEÚDO PRINCIPAL DA APLICAÇÃO ---
const AppContent = () => {
    // Usa o novo AuthContext
    const { user, logout } = useAuth(); 
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [pageFilter, setPageFilter] = useState(null); // Para filtros pré-definidos ao navegar
    const [alertMessage, setAlertMessage] = useState(''); // Para mensagens de alerta globais

    // Estados para armazenar os dados vindos da API
    // ... (estados de vehicles, obras, etc. sem mudança) ...
    const [vehicles, setVehicles] = useState([]);
    const [obras, setObras] = useState([]);
    const [revisions, setRevisions] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [rawPartners, setRawPartners] = useState([]); // Usamos 'raw' para aplicar sort depois
    const [refuelings, setRefuelings] = useState([]);
    const [rawComboioTransactions, setRawComboioTransactions] = useState([]);
    const [rawFines, setRawFines] = useState([]);
    const [diarioDeBordoLogs, setDiarioDeBordoLogs] = useState([]);
    
    const [loadingData, setLoadingData] = useState(true); // Estado de carregamento dos dados

    // Memoização para ordenar dados que precisam ser ordenados
    // ... (memoização de partners, comboio, fines sem mudança) ...
    const partners = useMemo(() => [...rawPartners].sort((a, b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '')), [rawPartners]);
    const comboioTransactions = useMemo(() => [...rawComboioTransactions].sort((a, b) => (new Date(b.date).getTime()) - (new Date(a.date).getTime())), [rawComboioTransactions]);
    const fines = useMemo(() => [...rawFines].sort((a, b) => (new Date(b.dataInfracao).getTime()) - (new Date(a.dataInfracao).getTime())), [rawFines]);


    // ATUALIZADO: Função para processar alertas, usando new Date()
    // ... (função processVehiclesWithAlerts sem mudança) ...
    const processVehiclesWithAlerts = (vehiclesData, revisionsData, finesData) => {
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(now.getDate() + 30);

        return vehiclesData.map(vehicle => {
            let hasAlert = false;
            let alertText = '';

            // 1. Alerta de Circulação
            if (vehicle.canCirculate === false) { // Assume que a API retorna booleano
                hasAlert = true;
                alertText = `O veículo não pode rodar por status de documento/revisão.`;
            }

            // 2. Alerta de Revisão
            const revision = revisionsData.find(r => r.vehicleId === vehicle.id); // Ajustado para vehicleId
            if (revision && !hasAlert) {
                // Convertendo string ISO da API para Date
                const proximaData = revision.proximaRevisaoData ? new Date(revision.proximaRevisaoData) : null;
                const proximoOdometro = revision.proximaRevisaoOdometro;
                const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group].includes(vehicle.tipo));

                // Lógica de leitura atual mantida
                let currentReading = 0;
                if(vehicleGroup === 'Máquinas Pesadas') currentReading = vehicle.possuiHorimetroAnalogico ? vehicle.horimetroAnalogico : vehicle.horimetroDigital;
                else if(vehicleGroup === 'Caminhões') currentReading = vehicle.horimetro;
                else currentReading = vehicle.odometro;
                currentReading = parseFloat(currentReading || 0); // Garante que é número

                const avisoKm = parseFloat(revision.avisoAntecedenciaKmHr || 0);
                const avisoDias = parseInt(revision.avisoAntecedenciaDias || 0);

                if ((proximoOdometro > 0 && currentReading >= proximoOdometro) || (proximaData && now >= proximaData)) {
                    hasAlert = true;
                    alertText = 'Atenção: Revisão Vencida!';
                } else if ((proximoOdometro > 0 && avisoKm > 0 && currentReading >= proximoOdometro - avisoKm) || (proximaData && avisoDias > 0)) {
                    // Verifica se a data de aviso já passou
                    if(proximaData && avisoDias > 0) {
                        const warningDate = new Date(proximaData);
                        warningDate.setDate(warningDate.getDate() - avisoDias);
                        if (now >= warningDate) {
                            hasAlert = true;
                            alertText = 'Atenção: Revisão Próxima do Vencimento!';
                        }
                    } else if (proximoOdometro > 0 && avisoKm > 0 && currentReading >= proximoOdometro - avisoKm) {
                         hasAlert = true; // Adicionado para cobrir o caso do KM/HR sem data
                         alertText = 'Atenção: Revisão Próxima do Vencimento!';
                    }
                }
            }

            // 3. Alerta de Documentos de Caminhão
            const isTruck = vehicleGroups['Caminhões'].includes(vehicle.tipo);
            if (isTruck && !hasAlert) {
                const docs = [
                    // Convertendo string ISO da API para Date
                    { type: 'Tacógrafo', date: vehicle.validadeTacografo ? new Date(vehicle.validadeTacografo) : null },
                    { type: 'AET DAER/RS', date: vehicle.validadeAET_DAER ? new Date(vehicle.validadeAET_DAER) : null },
                    { type: 'AET DNIT', date: vehicle.validadeAET_DNIT ? new Date(vehicle.validadeAET_DNIT) : null },
                ];
                const expiredDoc = docs.find(doc => doc.date && doc.date < now);
                const nearExpiredDoc = docs.find(doc => doc.date && !expiredDoc && doc.date <= thirtyDaysFromNow); // Só verifica próximo se não estiver vencido

                if (expiredDoc) {
                    hasAlert = true;
                    alertText = `Atenção: Validade do ${expiredDoc.type} Vencida!`;
                } else if (nearExpiredDoc) {
                    hasAlert = true;
                    alertText = `Atenção: Validade do ${nearExpiredDoc.type} Próxima do Vencimento!`;
                }
            }
            
            // 4. Alerta de Multas Pendentes
            const hasPendingFine = finesData.some(fine => fine.vehicleId === vehicle.id && fine.paymentStatus === 'Pendente'); // Ajustado para paymentStatus
            if(hasPendingFine && !hasAlert) {
                hasAlert = true;
                alertText = 'Atenção: Há multas pendentes para este veículo.';
            }

            return { ...vehicle, possuiAviso: hasAlert, avisoTexto: alertText };
        });
    };

    // Aplica a função de processamento aos veículos carregados
    const processedVehicles = useMemo(() => {
        // Garante que revisions e fines sejam arrays antes de passar
        return processVehiclesWithAlerts(vehicles, revisions || [], fines || []);
    }, [vehicles, revisions, fines]);

    // MELHORIA: `loadAllData` agora é um `useCallback` para ser usado como `reloadData`
    const loadAllData = useCallback(async () => {
        // Só carrega se o usuário estiver logado
        if (!user) {
            setLoadingData(false); // Garante que não fique carregando se não houver usuário
            return;
        }
        
        setLoadingData(true);
        setAlertMessage(''); // Limpa alertas antigos
        console.log("Iniciando carregamento de dados da API...");

        // Mapeia os endpoints do apiClient para os setters de estado
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
            // users: { getter: apiClient.getUsers, setter: setUsers }, // Descomente se necessário
            // updates: { getter: apiClient.getUpdates, setter: setUpdates }, // Descomente se necessário
        };

        // Remove endpoints que o operador não precisa
        if (user.user_type === 'operador') { // Usa user_type como no backend
            delete dataEndpoints.revisions;
            delete dataEndpoints.expenses;
            delete dataEndpoints.partners;
            delete dataEndpoints.comboioTransactions;
            delete dataEndpoints.fines;
            // delete dataEndpoints.users; // Operador não deve ver lista de usuários
        }

        try {
            // Cria um array de Promises para todas as chamadas GET
            const promises = Object.entries(dataEndpoints).map(([key, { getter }]) => 
                getter().catch(err => { 
                    // Captura erro individualmente para não parar tudo
                    console.error(`Erro ao carregar ${key}:`, err);
                    // Retorna null ou um array vazio para indicar falha parcial
                    return Array.isArray(dataEndpoints[key].setter([])) ? [] : null; 
                })
            );
            
            // Executa todas as chamadas em paralelo
            const results = await Promise.all(promises);
            console.log("Dados recebidos da API:", results);
            
            // Atualiza os estados com os resultados
            let resultIndex = 0;
            for (const key of Object.keys(dataEndpoints)) {
                if (results[resultIndex] !== null) { // Só atualiza se a chamada não falhou
                     dataEndpoints[key].setter(results[resultIndex]);
                } else {
                    // Mostra alerta se uma chamada específica falhou
                    setAlertMessage(prev => prev + `\nFalha ao carregar dados de ${key}.`);
                }
                resultIndex++;
            }

        } catch (error) {
            // Erro GERAL (ex: problema de rede antes das chamadas começarem)
            console.error("Erro GERAL ao carregar dados da API:", error);
            setAlertMessage(`Falha ao carregar dados do servidor: ${error.message}. Verifique sua conexão.`);
            // Se o erro for 401 (Não Autorizado), faz logout
            if (error.message.includes('401') || error.message.includes('Erro 401')) {
                setAlertMessage("Sua sessão expirou ou é inválida. Por favor, faça login novamente.");
                logout(); // Desloga o usuário
            }
        } finally {
            setLoadingData(false);
            console.log("Carregamento de dados finalizado.");
        }
    }, [user, logout]); // Dependências: user e logout

    // ATUALIZADO: useEffect agora depende do `loadAllData` (que é um useCallback)
    useEffect(() => {
        loadAllData();
        
        // Cleanup function (vazia, pois não usamos mais listeners)
        return () => {}; 
    }, [loadAllData]); // Dependência: loadAllData
    
    // --- Lógica de Renderização ---

    // Renderiza DiarioDeBordoPage diretamente se for operador
    // ... (renderização do operador sem mudança) ...
    if (user && user.user_type === 'operador') { 
        if (loadingData) {
            return <div className="flex items-center justify-center min-h-screen text-lg font-semibold"><Loader size={32} className="animate-spin mr-2" /> Carregando dados do operador...</div>;
        }
        // Passa apiClient para a página do operador
        return (
            <>
                {alertMessage && <CustomAlert message={alertMessage} onClose={() => setAlertMessage('')} />}
                <DiarioDeBordoPage 
                    apiClient={apiClient} // Passa o apiClient
                    user={user} // Passa o usuário
                    employees={employees} 
                    vehicles={processedVehicles} // Passa veículos processados
                    obras={obras} 
                    setAlertMessage={setAlertMessage}
                    vehicleGroups={vehicleGroups}
                    diarioDeBordoLogs={diarioDeBordoLogs}
                    // REMOVIDO: db, auth, getPublicCollectionPath
                    // REMOVIDO: Lógica offline
                />
            </>
        );
    }

    // Função para navegar entre as "páginas" (componentes)
    const navigate = (page, filter = null) => { 
        setCurrentPage(page); 
        setPageFilter(filter); 
    };

    // MELHORIA: A função reloadData agora é o próprio loadAllData
    const reloadData = loadAllData;

    // Função para renderizar o componente da página atual
    const renderPage = () => {
        // Props comuns passadas para todas as páginas
        const commonProps = { 
            user, 
            setAlertMessage, 
            // ATENÇÃO: Passando apiClient para o PasswordConfirmationModal
            PasswordConfirmationModal: (props) => <PasswordConfirmationModal {...props} apiClient={apiClient} />, 
            ConfirmationModal, 
            vehicleGroups, 
            extraObraOptions, 
            equipmentTypesForHours, 
            operationalSubGroups,
            apiClient, // Passa o apiClient para todas as páginas
            reloadData, // Passa a função de recarregar (agora eficiente)
            navigate, // Passa a função de navegação
            // Dados carregados são passados como props
            vehicles: processedVehicles, // Usa os veículos processados com alertas
            obras,
            revisions,
            expenses,
            employees,
            partners, // Passa a lista ordenada
            refuelings,
            comboioTransactions, // Passa a lista ordenada
            fines, // Passa a lista ordenada
            diarioDeBordoLogs,
        };
        
        // Componente simples para acesso negado
        // ... (componente AccessDenied sem mudança) ...
        const AccessDenied = () => (
            <div className="flex flex-col items-center justify-center h-full">
                <div className="text-center p-10 bg-white rounded-lg shadow-md">
                    <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
                    <h1 className="mt-4 text-2xl font-bold text-red-600">Acesso Negado</h1>
                    <p className="text-gray-600 mt-2">Você não tem permissão para visualizar esta página.</p>
                </div>
            </div>
        );

        // Switch para decidir qual página renderizar
        // ... (switch/case sem mudança) ...
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
            case 'reports': return <ReportsPage {...commonProps} />; // Descomente quando criar
            case 'admin': return user.user_type === 'admin' ? <AdminPage {...commonProps} /> : <AccessDenied />; 
            default: return <Dashboard {...commonProps} />; // Volta pro Dashboard como padrão
        }
    };

    // Renderização principal do conteúdo logado
    // ... (renderização do AppContent (sidebar + main) sem mudança) ...
    return (
        <div className="flex h-screen bg-gray-100 text-gray-800 font-sans">
           {/* Sidebar Component */}
           <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} user={user} logout={logout} /> 
           
           {/* Conteúdo Principal */}
           <main className="flex-1 flex flex-col overflow-hidden">
               {/* Área de conteúdo rolável */}
               <div className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-4 sm:p-6 lg:p-8">
                   {/* Alerta Global */}
                   {alertMessage && <CustomAlert message={alertMessage} onClose={() => setAlertMessage('')} />}
                   
                   {/* Indicador de Carregamento ou Página Renderizada */}
                   {loadingData ? (
                       <div className="flex items-center justify-center h-full text-lg font-semibold">
                           <Loader size={32} className="animate-spin mr-3" /> Carregando dados da frota...
                       </div>
                    ) : (
                       renderPage() // Renderiza a página atual
                    )}
               </div>
           </main>
        </div>
    );
};

// --- COMPONENTE SIDEBAR ---
// ... (componente Sidebar sem mudança) ...
const Sidebar = ({ currentPage, setCurrentPage, user, logout }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    
    // ATUALIZADO: Usa a função logout passada via props
    const handleLogout = async () => { 
        if(logout) {
            await logout(); 
        } else {
            console.error("Função logout não encontrada!");
        }
    }; 
    
    // Definição dos itens de navegação (mantida)
    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: <Building size={20} /> },
        { id: 'vehicles', label: 'Veículos', icon: <Truck size={20} /> },
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
        { id: 'reports', label: 'Relatórios', icon: <FileText size={20} /> }, // Descomente quando criar
    ];
    
    return (
        <div className={`bg-gray-900 text-gray-200 shadow-md transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}>
            <div className="flex flex-col h-full">
                {/* Header da Sidebar */}
                <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700">
                    {!isCollapsed && <img src="https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png" alt="MAK Logo" className="h-8" />}
                    <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-2 rounded-md text-gray-400 hover:bg-gray-700 focus:outline-none">
                        {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                    </button>
                </div>
                
                {/* Navegação Principal */}
                <nav className="flex-1 mt-2 overflow-y-auto">
                    <ul className="space-y-1 px-2">
                        {navItems.map(item => {
                            // ATUALIZADO: Lógica de permissão para Abastecimento e Comboio
                            // Usa 'user.podeAcessarAbastecimento' E 'user.user_type'
                            const isAdmin = user.user_type === 'admin';
                            const canAccessRefuelingRelated = user.podeAcessarAbastecimento || isAdmin;

                            // Esconde itens se não tiver permissão
                            if ((item.id === 'refueling' || item.id === 'comboio') && !canAccessRefuelingRelated) {
                                return null; 
                            }
                            
                            // Renderiza o item de navegação
                            return (
                                <li key={item.id}>
                                    <button 
                                        onClick={() => setCurrentPage(item.id)} 
                                        className={`flex items-center w-full p-2 rounded-lg transition-colors duration-200 ${ 
                                            currentPage === item.id 
                                            ? 'bg-yellow-500 text-gray-900 shadow-inner' 
                                            : 'hover:bg-gray-700 text-gray-300' 
                                        }`}
                                        title={item.label} // Adiciona tooltip
                                    >
                                        {item.icon}
                                        {!isCollapsed && <span className="ml-3 font-medium truncate">{item.label}</span>}
                                    </button>
                                </li>
                            );
                        })}
                        
                        {/* Link de Administração (visível apenas para admin) */}
                        {/* ATUALIZADO: usa user.user_type */}
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
                
                {/* Footer da Sidebar (Logout) */}
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

// --- COMPONENTE ROTEADOR PRINCIPAL ---
// ... (componente AppRouter sem mudança) ...
const AppRouter = () => {
    const { user, loading } = useAuth(); // Pega user e loading do NOVO AuthContext

    // Mostra tela de carregamento inicial
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen text-lg font-semibold bg-gray-100">
                <Loader size={40} className="animate-spin mr-3 text-yellow-500" /> Carregando aplicação...
            </div>
        );
    }

    // Se não estiver carregando e não houver usuário, mostra Login
    if (!user) {
        // Passa apiClient para LoginScreen (embora ele use useAuth internamente agora)
        return <LoginScreen apiClient={apiClient} />;
    }
    
    // Se houver usuário, mostra o conteúdo principal
    return <AppContent />;
};

// --- COMPONENTE CONTAINER DA APLICAÇÃO ---
// ... (componente AppContainer sem mudança) ...
const AppContainer = () => {
    // Define título e favicon uma vez
    useEffect(() => {
        document.title = "Frotas MAK";
        const favicon = document.querySelector("link[rel~='icon']");
        if (favicon) {
            favicon.href = 'https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png'; // URL do seu favicon
        }
    }, []);

    return (
        // AuthProvider agora envolve AppRouter
        <AuthProvider> 
            {/* REMOVIDO: OfflineProvider */}
            <AppRouter />
        </AuthProvider>
    );
};

// Exporta o container principal
export default AppContainer;

