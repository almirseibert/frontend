// Lógica de sugestão de colaboradores/equipe por proximidade + aptidão.
import { cidadePorCodigo, cidadePorNome, haversineKm } from './geo';

function parseMaybeJson(v) {
    if (v == null) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return null; }
}

// Ponto { lat, lng, cidade } de um colaborador (centroide da cidade de residência).
export function resolveEmployeePoint(emp) {
    if (!emp) return null;
    const c = cidadePorCodigo(emp.cidade_ibge) || cidadePorNome(emp.cidade);
    if (!c) return null;
    return { lat: c.lat, lng: c.lng, cidade: c.nome, codigo_ibge: c.codigo_ibge };
}

// Ponto { lat, lng } de uma obra: coordenada própria, senão centroide da cidade.
export function resolveObraPoint(obra) {
    if (!obra) return null;
    const lat = parseFloat(obra.latitude);
    const lng = parseFloat(obra.longitude);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    const c = cidadePorCodigo(obra.cidade_ibge);
    if (c) return { lat: c.lat, lng: c.lng, cidade: c.nome };
    return null;
}

// Lista de equipamentos que o colaborador está apto a operar (array de strings).
export function aptidoes(emp) {
    const arr = parseMaybeJson(emp?.equipamentos_aptos);
    return Array.isArray(arr) ? arr : [];
}

export function isOperador(emp) {
    // Colaborador com ao menos uma aptidão de equipamento é considerado operador.
    return aptidoes(emp).length > 0;
}

// Tipos de equipamento demandados por uma obra (chaves com valor > 0).
export function demandaEquipamentos(obra) {
    const tipos = new Set();
    const acc = (raw) => {
        const obj = parseMaybeJson(raw);
        if (obj && typeof obj === 'object') {
            for (const [k, v] of Object.entries(obj)) {
                if (parseFloat(v) > 0) tipos.add(k);
            }
        }
    };
    acc(obra?.horasContratadasPorSubTipo);
    acc(obra?.horasContratadasPorTipo);
    return [...tipos];
}

const statusAtivo = (emp) => String(emp?.status || 'ativo').toLowerCase() === 'ativo';

// Operadores ordenados por distância à obra, filtrados por aptidão e status.
// opts: { equipamentoTipo, incluirInativos, apenasLideres, raioKm }
export function rankOperatorsForObra(obra, employees = [], opts = {}) {
    const alvo = resolveObraPoint(obra);
    if (!alvo) return [];
    const { equipamentoTipo, incluirInativos = false, apenasLideres = false, raioKm } = opts;

    const out = [];
    for (const emp of employees) {
        if (!isOperador(emp)) continue;
        if (!incluirInativos && !statusAtivo(emp)) continue;
        if (apenasLideres && !emp.is_lider_obra) continue;
        if (equipamentoTipo && !aptidoes(emp).includes(equipamentoTipo)) continue;
        const p = resolveEmployeePoint(emp);
        if (!p) continue;
        const distanciaKm = haversineKm(alvo, p);
        if (raioKm != null && distanciaKm > raioKm) continue;
        out.push({
            employee: emp,
            distanciaKm,
            isLider: !!emp.is_lider_obra,
            cidade: p.cidade,
            ponto: p,
        });
    }
    out.sort((a, b) => a.distanciaKm - b.distanciaKm);
    return out;
}

// Monta uma equipe: 1 líder mais próximo + operador apto mais próximo por tipo
// demandado (sem repetir pessoa). Retorna { lider, operadoresPorTipo, faltantes }.
export function composeTeam(obra, employees = [], opts = {}) {
    const { incluirInativos = false } = opts;
    const usados = new Set();

    const lideres = rankOperatorsForObra(obra, employees, {
        incluirInativos,
        apenasLideres: true,
    });
    const lider = lideres[0] || null;
    if (lider) usados.add(lider.employee.id);

    const tipos = demandaEquipamentos(obra);
    const operadoresPorTipo = [];
    const faltantes = [];

    for (const tipo of tipos) {
        const ranked = rankOperatorsForObra(obra, employees, {
            incluirInativos,
            equipamentoTipo: tipo,
        });
        const escolhido = ranked.find((r) => !usados.has(r.employee.id));
        if (escolhido) {
            usados.add(escolhido.employee.id);
            operadoresPorTipo.push({ tipo, ...escolhido });
        } else {
            faltantes.push(tipo);
        }
    }

    return { lider, operadoresPorTipo, faltantes, tiposDemandados: tipos };
}
