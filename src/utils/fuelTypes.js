// utils/fuelTypes.js
//
// Fonte única dos tipos de combustível no frontend (espelho de
// backend/utils/fuelTypes.js).
//
// O sistema convive com três grafias do mesmo combustível, e cada tela mapeava
// por conta própria:
//   - chave de ordem  (refuelings.fuelType):          dieselS10, dieselS500, gasolinaComum…
//   - chave de tanque (vehicles.fuelLevels do comboio): dieselS10, dieselComum
//   - rótulo          (partners.fuel_prices, relatórios): 'Diesel S10', 'Diesel S500'…
//
// O comboio carrega só dois tanques. Diesel S500 e "Diesel Comum" são o mesmo
// produto — a ordem ao posto usa S500, o tanque do comboio chama de Comum.

export const FUEL_LABELS = {
    dieselS10: 'Diesel S10',
    dieselS500: 'Diesel S500',
    dieselComum: 'Diesel Comum',
    gasolinaComum: 'Gasolina Comum',
    gasolinaAditivada: 'Gasolina Aditivada',
    etanol: 'Etanol',
    arla32: 'Arla 32',
};

// Tanques do comboio, na ordem em que aparecem na tela.
export const COMBOIO_TANKS = [
    { key: 'dieselS10', label: 'Diesel S10', short: 'S10', orderKey: 'dieselS10' },
    { key: 'dieselComum', label: 'Diesel Comum (S500)', short: 'S500', orderKey: 'dieselS500' },
];

const semAcento = (s) => String(s || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Qualquer grafia → chave de ordem ('' se não reconhecer).
export const normalizeFuelType = (value) => {
    if (!value) return '';
    if (FUEL_LABELS[value]) return value;
    const v = semAcento(value);
    if (v.includes('ARLA')) return 'arla32';
    if (v.includes('S10') || v.includes('S-10')) return 'dieselS10';
    if (v.includes('COMUM') && v.includes('DIESEL')) return 'dieselComum';
    if (v.includes('S500') || v.includes('S-500')) return 'dieselS500';
    if (v.includes('ADITIVADA')) return 'gasolinaAditivada';
    if (v.includes('GASOLINA')) return 'gasolinaComum';
    if (v.includes('ETANOL')) return 'etanol';
    if (v.includes('DIESEL')) return 'dieselS10';
    return '';
};

// Qualquer grafia → chave do tanque do comboio (dieselS10 | dieselComum) ou null.
export const toComboioTankKey = (value) => {
    const key = normalizeFuelType(value);
    if (key === 'dieselS10') return 'dieselS10';
    if (key === 'dieselS500' || key === 'dieselComum') return 'dieselComum';
    return null;
};

export const tankKeyToOrderKey = (tankKey) => (tankKey === 'dieselComum' ? 'dieselS500' : tankKey);

export const fuelLabel = (value) => FUEL_LABELS[normalizeFuelType(value)] || value || '';

export const comboioTankLabel = (value) => {
    const key = toComboioTankKey(value);
    return COMBOIO_TANKS.find(t => t.key === key)?.label || fuelLabel(value);
};

// Preço cadastrado do posto para um combustível. O cadastro de parceiros grava
// por rótulo ('Diesel S10') e a baixa grava por chave ('dieselS10') — tenta os
// dois, e para S500/Comum aceita qualquer uma das grafias.
export const getPartnerFuelPrice = (partner, fuelType) => {
    const prices = partner?.fuel_prices;
    if (!prices || !fuelType) return 0;
    const key = normalizeFuelType(fuelType);
    const candidatos = [fuelType, key, FUEL_LABELS[key]];
    if (key === 'dieselS500' || key === 'dieselComum') {
        candidatos.push('dieselS500', 'dieselComum', FUEL_LABELS.dieselS500, FUEL_LABELS.dieselComum);
    }
    for (const c of candidatos) {
        const n = parseFloat(prices[c]);
        if (n > 0) return n;
    }
    return 0;
};

const parseLevels = (raw) => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw) || {}; } catch { return {}; }
};

// Saldo dos tanques de um comboio: [{ key, label, short, litros, capacidade, pct }].
// fuelCapacity hoje é um único número por veículo; quando falta, a porcentagem
// fica nula (antes a tela assumia 2000 L e mostrava porcentagens inventadas).
export const getComboioTanks = (vehicle) => {
    const levels = parseLevels(vehicle?.fuelLevels);
    const capacidade = parseFloat(vehicle?.fuelCapacity) || null;
    return COMBOIO_TANKS.map(t => {
        const litros = parseFloat(levels[t.key]) || 0;
        return {
            ...t,
            litros,
            capacidade,
            pct: capacidade ? (litros / capacidade) * 100 : null,
        };
    });
};
