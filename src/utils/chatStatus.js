// utils/chatStatus.js
// Definições de status estilo MSN Messenger, compartilhadas pelo mensageiro e
// pelo modal de Configurações.

export const CHAT_STATUS = {
    disponivel: { label: 'Disponível',      color: '#2ecc40', dot: '#2ecc40', online: true },
    ausente:    { label: 'Ausente',         color: '#f1c40f', dot: '#f1c40f', online: true },
    ocupado:    { label: 'Ocupado',         color: '#e74c3c', dot: '#e74c3c', online: true },
    volto_logo: { label: 'Volto logo',      color: '#f1c40f', dot: '#f1c40f', online: true },
    invisivel:  { label: 'Aparecer offline', color: '#95a5a6', dot: '#95a5a6', online: false },
    offline:    { label: 'Offline',         color: '#95a5a6', dot: '#bdc3c7', online: false },
};

// Ordem exibida no seletor de status.
export const STATUS_ORDER = ['disponivel', 'ausente', 'ocupado', 'volto_logo', 'invisivel'];

// Ordem de agrupamento na lista de contatos.
export const GROUP_ORDER = ['disponivel', 'ausente', 'volto_logo', 'ocupado', 'offline'];

export const getStatusMeta = (status) => CHAT_STATUS[status] || CHAT_STATUS.offline;

export const isOnlineStatus = (status) => !!(CHAT_STATUS[status] && CHAT_STATUS[status].online);
