// utils/dateBRT.js
//
// Datas no fuso oficial do sistema (America/Sao_Paulo, GMT-3).
//
// `new Date().toISOString().split('T')[0]` devolve o dia em UTC: depois das 21h
// o formulário já abria com a data de amanhã. E 'YYYY-MM-DDT12:00:00' gravava
// todas as movimentações do comboio ao meio-dia (ou às 09h, quando em UTC).

const TZ = 'America/Sao_Paulo';
const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' de um instante, em Brasília.
export const ymdBRT = (value = new Date()) => {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone: TZ });
};

export const todayBRT = () => ymdBRT(new Date());

// Data escolhida no formulário + horário atual de Brasília, com fuso explícito.
// Se a data for de outro dia, mantém o horário do momento do lançamento — é o
// mesmo critério do backend (parseDateBRT).
export const withTimeBRT = (ymd) => {
    if (!ymd) return null;
    const agora = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
    return `${ymd}T${pad(agora.getHours())}:${pad(agora.getMinutes())}:${pad(agora.getSeconds())}-03:00`;
};

// dd/mm/aaaa hh:mm em Brasília.
export const formatDateTimeBRT = (value) => {
    if (!value) return '';
    const d = new Date(String(value).includes(' ') && !String(value).includes('T') ? String(value).replace(' ', 'T') : value);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const formatDateBRT = (value) => {
    if (!value) return '';
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-');
        return `${d}/${m}/${y}`;
    }
    const d = new Date(s.includes(' ') && !s.includes('T') ? s.replace(' ', 'T') : s);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { timeZone: TZ });
};
