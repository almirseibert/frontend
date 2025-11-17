// Este arquivo centraliza todas as chamadas à sua API backend.

// URL base da sua API no Easypanel
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api'; // Fallback para localhost

/**
 * Pega o token JWT do localStorage.
 * @returns {string|null} O token ou null se não existir.
 */
const getToken = () => localStorage.getItem('authToken');

/**
 * Função genérica para fazer requisições à API (JSON).
 * Inclui automaticamente a URL base e o token de autenticação.
 * @param {string} endpoint - O caminho da rota (ex: '/vehicles').
 * @param {object} options - Opções adicionais para o fetch (method, body, headers).
 * @returns {Promise<any>} A resposta da API em JSON ou null.
 * @throws {Error} Lança um erro se a resposta não for OK.
 */
const apiFetch = async (endpoint, options = {}) => {
    const token = getToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`; // Adiciona o token ao cabeçalho
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
        
        // Retorna null para respostas sem conteúdo (ex: DELETE 204)
        if (response.status === 204) {
            return null;
        }

        return await response.json(); // Retorna a resposta da API como JSON
    } catch (error) {
        console.error(`Erro na chamada da API para ${API_URL}${endpoint}:`, error);
        throw error; // Propaga o erro
    }
};

// Objeto que exporta todas as funções da sua API
const apiClient = {
    // --- Autenticação ---
    login: async (email, password) => {
        // Backend retorna: { token }
        return apiFetch('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    },
    getMe: async () => {
        // Rota essencial que você PRECISA criar no backend!
        // Deve retornar o objeto de usuário combinado (users + employees).
        return apiFetch('/auth/me');
    },
    validatePassword: async (password) => {
        // Rota para confirmar senha antes de ações críticas.
        return apiFetch('/auth/validate-password', {
            method: 'POST',
            body: JSON.stringify({ password }),
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

    /**
     * NOVA FUNÇÃO: Upload de imagem do veículo.
     * Envia FormData, por isso não usa apiFetch padrão.
     * @param {string} id - O ID do veículo.
     * @param {FormData} formData - O objeto FormData contendo o arquivo (ex: { fotoFile: ... }).
     * @returns {Promise<any>} A resposta da API em JSON.
     */
    uploadVehicleImage: async (id, formData) => {
        const token = getToken();
        const headers = {}; // NÃO definir 'Content-Type', o browser faz isso para multipart/form-data
    
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
    
        try {
            const response = await fetch(`${API_URL}/vehicles/${id}/upload-image`, {
                method: 'POST',
                headers,
                body: formData, // Envia o FormData diretamente
            });
    
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.message || errorData.error || `Erro ${response.status}: ${response.statusText}`;
                throw new Error(errorMessage);
            }
            
            return await response.json(); // Retorna a resposta (ex: { message, fotoURL })
        } catch (error) {
            console.error(`Erro no upload da imagem para ${API_URL}/vehicles/${id}/upload-image:`, error);
            throw error;
        }
    },


    // --- Obras ---
    getObras: async () => apiFetch('/obras'),
    getObraById: async (id) => apiFetch(`/obras/${id}`),
    createObra: async (data) => apiFetch('/obras', { method: 'POST', body: JSON.stringify(data) }),
    updateObra: async (id, data) => apiFetch(`/obras/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteObra: async (id) => apiFetch(`/obras/${id}`, { method: 'DELETE' }),
    finishObra: async (id, data) => apiFetch(`/obras/${id}/finish`, { method: 'PUT', body: JSON.stringify(data) }), // Corrigido para aceitar 'data'
    updateObraHistoryEntry: async (obraId, historyId, data) => {
        return apiFetch(`/obras/${obraId}/historico/${historyId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    // --- Funcionários ---
    getEmployees: async () => apiFetch('/employees'),
    getEmployeeById: async (id) => apiFetch(`/employees/${id}`),
    createEmployee: async (data) => apiFetch('/employees', { method: 'POST', body: JSON.stringify(data) }),
    updateEmployee: async (id, data) => apiFetch(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteEmployee: async (id) => apiFetch(`/employees/${id}`, { method: 'DELETE' }),
    getEmployeeHistory: async (id) => apiFetch(`/employees/${id}/history`), // Mapeado da rota
    updateEmployeeStatus: async (id, status) => apiFetch(`/employees/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }), // Mapeado da rota

    // --- Revisões ---
    getRevisions: async () => apiFetch('/revisions'),
    createRevisionPlan: async (data) => apiFetch('/revisions', { method: 'POST', body: JSON.stringify(data) }),
    updateRevisionPlan: async (id, data) => apiFetch(`/revisions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteRevisionPlan: async (id) => apiFetch(`/revisions/${id}`, { method: 'DELETE' }),
    getConsolidatedRevisionPlan: async () => apiFetch('/revisions/consolidated'), // Mapeado da rota
    getRevisionHistoryByVehicle: async (vehicleId) => apiFetch(`/revisions/history/${vehicleId}`), // Mapeado da rota
    completeRevision: async (data) => apiFetch('/revisions/complete', { method: 'POST', body: JSON.stringify(data) }), // Mapeado da rota

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

    // --- Abastecimentos ---
    getRefuelings: async () => apiFetch('/refuelings'),
    getRefuelingById: async (id) => apiFetch(`/refuelings/${id}`),
    createRefuelingOrder: async (data) => apiFetch('/refuelings', { method: 'POST', body: JSON.stringify(data) }),
    updateRefuelingOrder: async (id, data) => apiFetch(`/refuelings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    confirmRefuelingOrder: async (id, data) => apiFetch(`/refuelings/${id}/confirm`, { method: 'PUT', body: JSON.stringify(data) }), // Corrigido para PUT
    deleteRefuelingOrder: async (id) => apiFetch(`/refuelings/${id}`, { method: 'DELETE' }),

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

    // --- Diário de Bordo ---
    getDiarioDeBordo: async () => apiFetch('/diarioDeBordo'),
    getDiarioDeBordoById: async (id) => apiFetch(`/diarioDeBordo/${id}`),
    createDiarioDeBordo: async (data) => apiFetch('/diarioDeBordo', { method: 'POST', body: JSON.stringify(data) }), // Usado para sync offline talvez?
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
    cancelOrder: async (id) => apiFetch(`/orders/${id}/cancel`, { method: 'POST' }), // ou PUT

    // --- Contadores ---
    getCounter: async (name) => apiFetch(`/counters/${name}`),
    updateCounter: async (name, lastNumber) => apiFetch(`/counters/${name}`, { method: 'PUT', body: JSON.stringify({ lastNumber }) }),

    // --- Alertas de Inatividade ---
    getInactivityAlerts: async () => apiFetch('/inactivityAlerts'),
    createInactivityAlert: async (data) => apiFetch('/inactivityAlerts', { method: 'POST', body: JSON.stringify(data) }),
    updateInactivityAlert: async (id, data) => apiFetch(`/inactivityAlerts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteInactivityAlert: async (id) => apiFetch(`/inactivityAlerts/${id}`, { method: 'DELETE' }),

    // --- Solicitações de Registro (Público) ---
    createRegistrationRequest: async (data) => apiFetch('/registrationRequests', { method: 'POST', body: JSON.stringify(data) }),
    
    // --- Usuários (Admin) ---
    getUsers: async () => apiFetch('/users'), // Assumindo que admin pode listar usuários

    // --- Mensagens de Atualização (Admin) ---
    // *** CORREÇÃO: Funções renomeadas e rotas corrigidas para /admin/update-message ***
    adminGetUpdateMessage: async () => apiFetch('/admin/update-message'), // Corresponde a GET /api/admin/update-message
    adminSaveUpdateMessage: async (data) => apiFetch('/admin/update-message', { method: 'PUT', body: JSON.stringify(data) }), // Corresponde a PUT /api/admin/update-message

    // --- Funções Administrativas ---
    adminGetRegistrationRequests: async () => apiFetch('/admin/registration-requests'),
    adminApproveRegistrationRequest: async (data) => apiFetch('/admin/registration-requests/approve', { method: 'POST', body: JSON.stringify(data) }),
    adminDeleteRegistrationRequest: async (id) => apiFetch(`/admin/registration-requests/${id}`, { method: 'DELETE' }),
    adminAssignRole: async (data) => apiFetch('/admin/assign-role', { method: 'PUT', body: JSON.stringify(data) }), // Corrigido para PUT /assign-role
    adminMigrateUsers: async () => apiFetch('/admin/migrate-users', { method: 'POST' }), 
};

export default apiClient;