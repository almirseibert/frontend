// Utilitários geográficos para o Mapa Operacional.
// Base de cidades do RS (IBGE) empacotada em src/data.
import cidadesRS from '../data/rs-cidades.json';

// Índices para lookup rápido.
const byCodigo = new Map();
const byNome = new Map();

export function normalizeNome(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .toLowerCase();
}

for (const c of cidadesRS) {
    byCodigo.set(String(c.codigo_ibge), c);
    byNome.set(normalizeNome(c.nome), c);
}

export const CIDADES_RS = cidadesRS;

// Retorna a cidade por código IBGE (string/number) ou null.
export function cidadePorCodigo(codigo) {
    if (!codigo) return null;
    return byCodigo.get(String(codigo)) || null;
}

// Retorna a cidade por nome (accent-insensitive) ou null.
export function cidadePorNome(nome) {
    if (!nome) return null;
    return byNome.get(normalizeNome(nome)) || null;
}

// Distância em km entre dois pontos { lat, lng } (Haversine).
export function haversineKm(a, b) {
    if (!a || !b) return Infinity;
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// Ray-casting: ponto [lng,lat] dentro de um anel [[lng,lat], ...].
function pointInRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect =
            ((yi > lat) !== (yj > lat)) &&
            (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Bounding box de uma geometria Polygon/MultiPolygon.
function geomBBox(geom) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const scan = (ring) => {
        for (const [x, y] of ring) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    };
    if (geom.type === 'Polygon') scan(geom.coordinates[0]);
    else for (const poly of geom.coordinates) scan(poly[0]);
    return [minX, minY, maxX, maxY];
}

// Ponto [lng,lat] dentro da geometria (respeita anéis externos; ignora buracos
// para simplicidade — malha municipal não tem enclaves relevantes aqui).
export function pointInGeometry(lng, lat, geom) {
    if (geom.type === 'Polygon') {
        return pointInRing(lng, lat, geom.coordinates[0]);
    }
    for (const poly of geom.coordinates) {
        if (pointInRing(lng, lat, poly[0])) return true;
    }
    return false;
}

// Índice de bounding boxes memoizado por FeatureCollection (evita recomputar).
const bboxCache = new WeakMap();
function getBBoxIndex(geojson) {
    let idx = bboxCache.get(geojson);
    if (!idx) {
        idx = geojson.features.map((f) => ({ f, bbox: geomBBox(f.geometry) }));
        bboxCache.set(geojson, idx);
    }
    return idx;
}

// Retorna a feature (cidade) que contém o ponto { lat, lng }, ou null.
// Pré-filtra por bounding box antes do ray-casting.
export function cidadeDoPonto(lat, lng, geojson) {
    if (lat == null || lng == null || !geojson) return null;
    const idx = getBBoxIndex(geojson);
    for (const { f, bbox } of idx) {
        if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
        if (pointInGeometry(lng, lat, f.geometry)) return f;
    }
    return null;
}
