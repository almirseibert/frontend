// src/services/apiClient.js

// URL base da sua API no Easypanel
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api'; 

const getToken = () => localStorage.getItem('authToken');

const apiFetch = async (endpoint, options = {}) => {
    const token = getToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`; 
    }

    if (options.body instanceof FormData) {
        delete headers['Content-Type'];
    }

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.message || errorData.error || `Erro ${response.status}: ${response.statusText}`;
            throw new Error(errorMessage);
        }
        
        if (response.status === 204) {
            return null;
        }

        return await response.json(); 
    } catch (error) {
        console.error(`Erro na chamada da API para ${API_URL}${endpoint}:`, error);
        throw error; 
    }
};

const apiClient = {
    // --- Upload Genérico (Usado em Funcionários e Multas) ---
    uploadFile: async (formData) => apiFetch('/upload', { method: 'POST', body: formData }),

    // --- Autenticação ---
    login: async (email, password) => {
        return apiFetch('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    },
    getMe: async () => {
        return apiFetch('/auth/me');
    },
    validatePassword: async (password) => {
        return apiFetch('/auth/validate-password', {
            method: 'POST',
            body: JSON.stringify({ password }),
        });
    },
    changePassword: async (data) => {
        return apiFetch('/auth/change-password', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    createRegistrationRequest: async (data) => {
        return apiFetch('/auth/register', { 
            method: 'POST', 
            body: JSON.stringify(data) 
        });
    },

    // --- Veículos ---
    getVehicles: async () => apiFetch('/vehicles'),
    getVehicleById: async (id) => apiFetch(`/vehicles/${id}`),
    createVehicle: async (data) => apiFetch('/vehicles', { method: 'POST', body: JSON.stringify(data) }),
    updateVehicle: async (id, data) => apiFetch(`/vehicles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteVehicle: async (id) => apiFetch(`/vehicles/${id}`, { method: 'DELETE' }),
    allocateVehicleToObra: async (id, data) => apiFetch(`/vehicles/${id}/allocate-obra`, { method: 'POST', body: JSON.stringify(data) }),
    deallocateVehicleFromObra: async (id, data) => apiFetch(`/vehicles/${id}/deallocate-obra`, { method: 'POST', body: JSON.stringify(data) }),
    assignVehicleToOperational: async (id, data) => apiFetch(`/vehicles/${id}/assign-operational`, { method: 'POST', body: JSON.stringify(data) }),
    unassignVehicleFromOperational: async (id, data) => apiFetch(`/vehicles/${id}/unassign-operational`, { method: 'POST', body: JSON.stringify(data) }),
    startVehicleMaintenance: async (id, data) => apiFetch(`/vehicles/${id}/start-maintenance`, { method: 'POST', body: JSON.stringify(data) }),
    endVehicleMaintenance: async (id, data) => apiFetch(`/vehicles/${id}/end-maintenance`, { method: 'POST', body: JSON.stringify(data) }),
    uploadVehicleImage: async (id, formData) => {
        return apiFetch(`/vehicles/${id}/upload-image`, {
            method: 'POST',
            body: formData, 
        });
    },

    // --- Checklists ---
    getVehicleChecklists: async (vehicleId) => apiFetch(`/checklists/vehicle/${vehicleId}`),

    // --- Obras ---
    getObras: async () => apiFetch('/obras'),
    getObraById: async (id) => apiFetch(`/obras/${id}`),
    createObra: async (data) => apiFetch('/obras', { method: 'POST', body: JSON.stringify(data) }),
    updateObra: async (id, data) => apiFetch(`/obras/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteObra: async (id) => apiFetch(`/obras/${id}`, { method: 'DELETE' }),
    finishObra: async (id, data) => apiFetch(`/obras/${id}/finish`, { method: 'PUT', body: JSON.stringify(data) }), 
    updateObraHistoryEntry: async (obraId, historyId, data) => {
        return apiFetch(`/obras/${obraId}/historico/${historyId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    // --- MÓDULO SUPERVISOR (Novo) ---
    getSupervisorDashboard: async () => apiFetch('/supervisor/dashboard'),
    getSupervisorObraDetails: async (id) => apiFetch(`/supervisor/obra/${id}`),
    saveSupervisorContract: async (data) => apiFetch('/supervisor/contract', { method: 'POST', body: JSON.stringify(data) }),
    addSupervisorCrmLog: async (data) => apiFetch('/supervisor/crm', { method: 'POST', body: JSON.stringify(data) }),

    // --- Faturamento / Controle Diário ---
    getDailyLogs: async (obraId, filters = {}) => {
        const queryParams = new URLSearchParams(filters).toString();
        return apiFetch(`/billing?obraId=${obraId}&${queryParams}`);
    },
    upsertDailyLog: async (data) => apiFetch('/billing', { method: 'POST', body: JSON.stringify(data) }),
    deleteDailyLog: async (id) => apiFetch(`/billing/${id}`, { method: 'DELETE' }),

    // --- Funcionários ---
    getEmployees: async () => apiFetch('/employees'),
    getEmployeeById: async (id) => apiFetch(`/employees/${id}`),
    createEmployee: async (data) => apiFetch('/employees', { method: 'POST', body: JSON.stringify(data) }),
    updateEmployee: async (id, data) => apiFetch(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteEmployee: async (id) => apiFetch(`/employees/${id}`, { method: 'DELETE' }),
    getEmployeeHistory: async (id) => apiFetch(`/employees/${id}/history`), 
    updateEmployeeStatus: async (id, data) => apiFetch(`/employees/${id}/status`, { 
        method: 'PUT', 
        body: JSON.stringify(data) 
    }), 

    // --- Revisões ---
    getRevisions: async () => apiFetch('/revisions'),
    createRevisionPlan: async (data) => apiFetch('/revisions', { method: 'POST', body: JSON.stringify(data) }),
    updateRevisionPlan: async (id, data) => apiFetch(`/revisions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteRevisionPlan: async (id) => apiFetch(`/revisions/${id}`, { method: 'DELETE' }),
    getConsolidatedRevisionPlan: async () => apiFetch('/revisions/consolidated'), 
    getRevisionHistoryByVehicle: async (vehicleId) => apiFetch(`/revisions/history/${vehicleId}`), 
    completeRevision: async (data) => apiFetch('/revisions/complete', { method: 'POST', body: JSON.stringify(data) }), 

    // --- Despesas ---
    getExpenses: async () => apiFetch('/expenses'),
    createExpense: async (data) => apiFetch('/expenses', { method: 'POST', body: JSON.stringify(data) }),
    updateExpense: async (id, data) => apiFetch(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteExpense: async (id) => apiFetch(`/expenses/${id}`, { method: 'DELETE' }),

    // --- Parceiros (Postos) ---
    getPartners: async () => apiFetch('/partners'),
    getPartnerById: async (id) => apiFetch(`/partners/${id}`),
    createPartner: async (data) => apiFetch('/partners', { method: 'POST', body: JSON.stringify(data) }),
    updatePartner: async (id, data) => apiFetch(`/partners/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deletePartner: async (id) => apiFetch(`/partners/${id}`, { method: 'DELETE' }),
    updatePartnerFuelPrices: async (id, prices) => apiFetch(`/partners/${id}/prices`, { method: 'PUT', body: JSON.stringify(prices) }),
    updatePartnerStatus: async (id, status) => apiFetch(`/partners/${id}/status`, { 
        method: 'PUT', 
        body: JSON.stringify({ status: status })
        }),
        
    // --- SOLICITAÇÕES (App) ---
    getSolicitacoes: async (params) => {
        const queryParams = new URLSearchParams(params).toString();
        return apiFetch(`/solicitacoes?${queryParams}`);
    },
    createSolicitacao: async (formData) => apiFetch('/solicitacoes', { method: 'POST', body: formData }),
    avaliarSolicitacao: async (id, data) => apiFetch(`/solicitacoes/${id}/avaliar`, { method: 'PUT', body: JSON.stringify(data) }),
    enviarComprovanteSolicitacao: async (id, formData) => apiFetch(`/solicitacoes/${id}/comprovante`, { method: 'PUT', body: formData }),
    confirmarBaixaSolicitacao: async (id, data = {}) => apiFetch(`/solicitacoes/${id}/confirmar-baixa`, { method: 'PUT', body: JSON.stringify(data) }),
    rejeitarComprovanteSolicitacao: async (id) => apiFetch(`/solicitacoes/${id}/rejeitar-comprovante`, { method: 'PUT' }),
    getMySolicitacaoStatus: async () => apiFetch('/solicitacoes/meus-status'),

    // --- Abastecimentos (Legado/Admin) ---
    getRefuelings: async () => apiFetch('/refuelings'),
    getRefuelingById: async (id) => apiFetch(`/refuelings/${id}`),
    createRefuelingOrder: async (data) => apiFetch('/refuelings', { method: 'POST', body: JSON.stringify(data) }),
    updateRefuelingOrder: async (id, data) => apiFetch(`/refuelings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateRefueling: async (id, data) => apiFetch(`/refuelings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    confirmRefuelingOrder: async (id, data) => apiFetch(`/refuelings/${id}/confirm`, { method: 'PUT', body: JSON.stringify(data) }), 
    deleteRefuelingOrder: async (id) => apiFetch(`/refuelings/${id}`, { method: 'DELETE' }),
    uploadRefuelingPdf: async (formData) => apiFetch('/refuelings/upload-pdf', { method: 'POST', body: formData }),

    // --- Transações do Comboio ---
    getComboioTransactions: async () => apiFetch('/comboioTransactions'),
    getComboioTransactionById: async (id) => apiFetch(`/comboioTransactions/${id}`),
    deleteComboioTransaction: async (id) => apiFetch(`/comboioTransactions/${id}`, { method: 'DELETE' }),
    createComboioEntrada: async (data) => apiFetch('/comboioTransactions/entrada', { method: 'POST', body: JSON.stringify(data) }),
    createComboioSaida: async (data) => apiFetch('/comboioTransactions/saida', { method: 'POST', body: JSON.stringify(data) }),
    createComboioDrenagem: async (data) => apiFetch('/comboioTransactions/drenagem', { method: 'POST', body: JSON.stringify(data) }),

    // --- Multas ---
    getFines: async () => apiFetch('/fines'),
    getFineById: async (id) => apiFetch(`/fines/${id}`),
    createFine: async (data) => apiFetch('/fines', { method: 'POST', body: JSON.stringify(data) }),
    updateFine: async (id, data) => apiFetch(`/fines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteFine: async (id) => apiFetch(`/fines/${id}`, { method: 'DELETE' }),
    // (A rota .post(`/fines/${id}/notify`) é acessada dinamicamente via apiFetch, não precisando estar declarada no apiClient, mas usaremos post() padrão se necessário)

    // --- Diário de Bordo ---
    getDiarioDeBordo: async () => apiFetch('/diarioDeBordo'),
    getDiarioDeBordoById: async (id) => apiFetch(`/diarioDeBordo/${id}`),
    createDiarioDeBordo: async (data) => apiFetch('/diarioDeBordo', { method: 'POST', body: JSON.stringify(data) }), 
    updateDiarioDeBordo: async (id, data) => apiFetch(`/diarioDeBordo/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteDiarioDeBordo: async (id) => apiFetch(`/diarioDeBordo/${id}`, { method: 'DELETE' }),
    startDiarioJourney: async (data) => apiFetch('/diarioDeBordo/start', { method: 'POST', body: JSON.stringify(data) }),
    endDiarioJourney: async (id, data) => apiFetch(`/diarioDeBordo/${id}/end`, { method: 'PUT', body: JSON.stringify(data) }),
    startDiarioBreak: async (id, data) => apiFetch(`/diarioDeBordo/${id}/start-break`, { method: 'PUT', body: JSON.stringify(data) }),
    endDiarioBreak: async (id, data) => apiFetch(`/diarioDeBordo/${id}/end-break`, { method: 'PUT', body: JSON.stringify(data) }),

    // --- Ordens de Compra/Serviço ---
    getOrders: async () => apiFetch('/orders'),
    getOrderById: async (id) => apiFetch(`/orders/${id}`),
    createOrder: async (data) => apiFetch('/orders', { method: 'POST', body: JSON.stringify(data) }),
    updateOrder: async (id, data) => apiFetch(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteOrder: async (id) => apiFetch(`/orders/${id}`, { method: 'DELETE' }),
    cancelOrder: async (id) => apiFetch(`/orders/${id}/cancel`, { method: 'POST' }),

    // --- Contadores ---
    getCounter: async (name) => apiFetch(`/counters/${name}`),
    updateCounter: async (name, lastNumber) => apiFetch(`/counters/${name}`, { method: 'PUT', body: JSON.stringify({ lastNumber }) }),

    // --- Alertas de Inatividade ---
    getInactivityAlerts: async () => apiFetch('/inactivityAlerts'),
    createInactivityAlert: async (data) => apiFetch('/inactivityAlerts', { method: 'POST', body: JSON.stringify(data) }),
    updateInactivityAlert: async (id, data) => apiFetch(`/inactivityAlerts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteInactivityAlert: async (id) => apiFetch(`/inactivityAlerts/${id}`, { method: 'DELETE' }),

    // --- Usuários (Admin) ---
    getUsers: async () => apiFetch('/users'), 

    // --- Mensagens de Atualização (Admin) ---
    adminGetUpdateMessage: async () => apiFetch('/admin/update-message'), 
    adminSaveUpdateMessage: async (data) => apiFetch('/admin/update-message', { method: 'PUT', body: JSON.stringify(data) }), 

    // --- Funções Administrativas ---
    adminGetRegistrationRequests: async () => apiFetch('/admin/registration-requests'),
    adminApproveRegistrationRequest: async (data) => apiFetch('/admin/registration-requests/approve', { method: 'POST', body: JSON.stringify(data) }),
    adminDeleteRegistrationRequest: async (id) => apiFetch(`/admin/registration-requests/${id}`, { method: 'DELETE' }),
    adminAssignRole: async (data) => apiFetch('/admin/assign-role', { method: 'PUT', body: JSON.stringify(data) }),
    adminMigrateUsers: async () => apiFetch('/admin/migrate-users', { method: 'POST' }), 

   // --- Pneus ---
    getTires: async () => apiFetch('/tires'),
    createTire: async (data) => apiFetch('/tires', { method: 'POST', body: JSON.stringify(data) }),
    updateTire: async (id, data) => apiFetch(`/tires/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    registerTireTransaction: async (data) => apiFetch('/tires/transaction', { method: 'POST', body: JSON.stringify(data) }),
    getTireHistory: async (id) => apiFetch(`/tires/${id}/history`),
    getVehicleTireHistory: async (vehicleId) => apiFetch(`/tires/vehicle/${vehicleId}/history`),

    // --- WhatsApp (Admin) ---
    whatsappGetStatus: async () => apiFetch('/whatsapp/status'),
    whatsappReiniciar: async () => apiFetch('/whatsapp/reiniciar', { method: 'POST' }),
    whatsappEnviarTeste: async (data) => apiFetch('/whatsapp/enviar-teste', { method: 'POST', body: JSON.stringify(data) }),
    whatsappGetLogs: async () => apiFetch('/whatsapp/logs'),

    // --- Defaults & Auxiliares ---
    defaults: { baseURL: API_URL },
    get: (url, config) => apiFetch(url, { method: 'GET', ...config }),
    post: (url, data, config) => apiFetch(url, { method: 'POST', body: data instanceof FormData ? data : JSON.stringify(data), ...config }),
    put: (url, data, config) => apiFetch(url, { method: 'PUT', body: data instanceof FormData ? data : JSON.stringify(data), ...config }),
    delete: (url, config) => apiFetch(url, { method: 'DELETE', ...config }),
};

export default apiClient;