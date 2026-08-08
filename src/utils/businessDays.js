// Dias úteis e feriados — espelho PURO de backend/utils/businessDays.js.
//
// Não faz rede: recebe o `holidaySet` (Set<'YYYY-MM-DD'>) por parâmetro. Quem
// carrega os feriados é o DataContext (recurso `holidays`, via GET /holidays).
//
// Todas as datas circulam como string 'YYYY-MM-DD' e são parseadas com
// 'T12:00:00' — meio-dia evita que UTC/horário de verão empurrem o dia para trás.
//
// Se mudar a semântica aqui, mude no backend também.

const MAX_ITER = 3650; // ~10 anos — trava de segurança contra loop infinito

// --- Normalização ------------------------------------------------------------

export const fmtYmd = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Aceita Date | 'YYYY-MM-DD' | ISO string. Retorna 'YYYY-MM-DD' ou null. */
export const toYmd = (input) => {
    if (!input) return null;
    if (typeof input === 'string') {
        const m = input.match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
    }
    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return null;
    return fmtYmd(d);
};

export const parseYmd = (ymd) => new Date(`${ymd}T12:00:00`);

/** Monta o Set a partir da lista devolvida por GET /holidays. */
export const buildHolidaySet = (holidays = [], regiao = null) =>
    new Set(
        (holidays || [])
            .filter(h => !h.regiao || (regiao && h.regiao === regiao))
            .map(h => toYmd(h.date))
            .filter(Boolean)
    );

// --- Núcleo puro -------------------------------------------------------------

export const isWeekend = (ymd) => {
    const wd = parseYmd(ymd).getDay();
    return wd === 0 || wd === 6;
};

export const isHoliday = (ymd, holidaySet) => !!(holidaySet && holidaySet.has(ymd));

export const isBusinessDay = (ymd, holidaySet) => !isWeekend(ymd) && !isHoliday(ymd, holidaySet);

export const shiftDays = (ymd, n) => {
    const d = parseYmd(ymd);
    d.setDate(d.getDate() + n);
    return fmtYmd(d);
};

/** Primeiro dia útil ESTRITAMENTE depois de `ymd`. */
export const nextBusinessDay = (ymd, holidaySet) => {
    let cur = shiftDays(ymd, 1);
    for (let i = 0; i < MAX_ITER; i++) {
        if (isBusinessDay(cur, holidaySet)) return cur;
        cur = shiftDays(cur, 1);
    }
    return cur;
};

/** Último dia útil ESTRITAMENTE antes de `ymd`. */
export const previousBusinessDay = (ymd, holidaySet) => {
    let cur = shiftDays(ymd, -1);
    for (let i = 0; i < MAX_ITER; i++) {
        if (isBusinessDay(cur, holidaySet)) return cur;
        cur = shiftDays(cur, -1);
    }
    return cur;
};

/** Se `ymd` já for dia útil devolve ele mesmo; senão o próximo dia útil. */
export const ensureBusinessDay = (ymd, holidaySet) =>
    isBusinessDay(ymd, holidaySet) ? ymd : nextBusinessDay(ymd, holidaySet);

/**
 * Soma `n` dias úteis a `ymd`. n = 0 devolve `ymd` inalterado; n negativo anda
 * para trás. Um prazo de N dias úteis a partir de um início D é
 * `addBusinessDays(D, N - 1)`.
 */
export const addBusinessDays = (ymd, n, holidaySet) => {
    const step = n < 0 ? -1 : 1;
    let restantes = Math.abs(n);
    let cur = ymd;
    let guard = 0;
    while (restantes > 0 && guard++ < MAX_ITER) {
        cur = shiftDays(cur, step);
        if (isBusinessDay(cur, holidaySet)) restantes--;
    }
    return cur;
};

/** Lista dia a dia de [start, end] inclusive, marcando quais são úteis. */
export const businessDayList = (startYmd, endYmd, holidaySet) => {
    const out = [];
    let cur = startYmd;
    let guard = 0;
    while (cur <= endYmd && guard++ < MAX_ITER) {
        out.push({ date: cur, isBusinessDay: isBusinessDay(cur, holidaySet) });
        cur = shiftDays(cur, 1);
    }
    return out;
};

/** Quantidade de dias úteis em [start, end] inclusive. */
export const businessDaysBetween = (startYmd, endYmd, holidaySet) =>
    businessDayList(startYmd, endYmd, holidaySet).filter(d => d.isBusinessDay).length;

/** Total de dias corridos em [start, end] inclusive. */
export const diffDays = (startYmd, endYmd) =>
    Math.round((parseYmd(endYmd) - parseYmd(startYmd)) / 86400000) + 1;

// --- Sugestão de feriados nacionais ------------------------------------------

/** Domingo de Páscoa do ano (algoritmo gregoriano de Meeus/Jones/Butcher). */
export const easterSunday = (year) => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/**
 * Feriados nacionais do ano, incluindo os móveis (derivados da Páscoa).
 * Usado só para pré-preencher o cadastro — a fonte de verdade é admin_holidays.
 * 20/09 (Revolução Farroupilha) entra porque toda a operação é no RS.
 */
export const nationalHolidays = (year) => {
    const pascoa = easterSunday(year);
    const p = (n) => shiftDays(pascoa, n);
    return [
        { name: 'Confraternização Universal', date: `${year}-01-01` },
        { name: 'Carnaval', date: p(-47) },
        { name: 'Sexta-feira Santa', date: p(-2) },
        { name: 'Tiradentes', date: `${year}-04-21` },
        { name: 'Dia do Trabalho', date: `${year}-05-01` },
        { name: 'Corpus Christi', date: p(60) },
        { name: 'Independência do Brasil', date: `${year}-09-07` },
        { name: 'Revolução Farroupilha (RS)', date: `${year}-09-20` },
        { name: 'Nossa Senhora Aparecida', date: `${year}-10-12` },
        { name: 'Finados', date: `${year}-11-02` },
        { name: 'Proclamação da República', date: `${year}-11-15` },
        { name: 'Consciência Negra', date: `${year}-11-20` },
        { name: 'Natal', date: `${year}-12-25` },
    ];
};
