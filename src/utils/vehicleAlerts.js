<<<<<<< HEAD
// src/utils/vehicleRules.js

export const vehicleGroups = {
    'Veículos Leves': ['Automóvel', 'Camionete', 'Utilitários', 'Moto'],
    'Caminhões': ['Bitruck', 'Caminhão Pipa', 'Caminhão Tanque', 'Caminhão Carroceria', 'Cavalo', 'Caçamba Bitruck', 'Caçamba Toco', 'Caçamba Traçado', 'Caçamba Truckado', 'Caminhão', 'Caçamba'],
    'Caminhões de Trecho': ['Caminhão Prancha', 'Semirreboques'], 
    'Máquinas Pesadas': ['Motoniveladora', 'Pá Carregadeira', 'Retroescavadeira', 'Rolo', 'Trator', 'Escavadeira', 'Escavadeira + Rompedor', 'Fresadora', 'Trator Esteira']
};

export const extraObraOptions = ['Administração', 'Oficina', 'Pátio', 'Rampa', 'Diversos'];
export const operationalSubGroups = ['Administrativo', 'Oficina', 'Operacional', 'Supervisor'];

// Removido "Trator de Esteiras" duplicado/incorreto, mantido apenas o que bate com o grupo: "Trator Esteira"
export const equipmentTypesForHours = ['Caminhão', 'Escavadeira', 'Escavadeira + Rompedor', 'Rolo', 'Retroescavadeira', 'Pá Carregadeira', 'Motoniveladora', 'Trator', 'Trator Esteira', 'Bitruck', 'Caçamba', 'Caminhão Pipa', 'Caminhão Tanque'];

/**
 * Regra 1: Define estritamente quais tipos de leitura são permitidos por grupo.
 * Somente Leves e Caminhões de Trecho usam KM. O resto é Hora.
 */
export const getAllowedReadingTypes = (vehicleType) => {
    // Busca o grupo do veículo
    const group = Object.keys(vehicleGroups).find(key => vehicleGroups[key].includes(vehicleType));

    // Regra Global 1:
    // Leves e Trecho -> Odômetro (Km)
    if (group === 'Veículos Leves' || group === 'Caminhões de Trecho') {
        return ['odometro'];
    }
    
    // Caminhões Pesados e Máquinas -> Horímetro (Hr)
    return ['horimetro']; 
};

/**
 * Retorna a leitura principal (Valor, Unidade e Label) de forma robusta e unificada.
 */
export const getVehicleMainReading = (vehicle) => {
    if (!vehicle) return { value: 0, unit: '', label: 'N/A', raw: 0 };

    const allowedTypes = getAllowedReadingTypes(vehicle.tipo);
    const usesKm = allowedTypes.includes('odometro');

    if (usesKm) {
        const val = vehicle.odometro || 0;
        return { value: val, unit: 'Km', label: 'Odômetro', raw: parseFloat(val) };
    } else {
        // Regra unificada: Usa apenas a coluna 'horimetro'
        // Tenta pegar horimetro, se não tiver tenta o digital, se não o analógico
        const val = vehicle.horimetro || 0;
        return { value: val, unit: 'Hr', label: 'Horímetro', raw: parseFloat(val) };
    }
};

/**
 * Regras 2 e 3: Validação Rigorosa de Leitura
 * Retorna um objeto { status: 'ok' | 'bloqueio', message: string }
 */
export const checkReadingConsistency = (vehicle, newValueStr, fieldType) => {
    // Se não tiver veículo anterior (criação), não valida consistência de histórico
    if (!vehicle) return { status: 'ok' };

    const newValue = parseFloat(newValueStr);
    if (isNaN(newValue)) return { status: 'ok' }; 

    // Descobre qual é o valor ATUAL salvo no banco
    let currentValue = 0;
    let unit = '';
    let limit = 0;

    // Se o campo editado for odômetro
    if (fieldType === 'odometro') {
        currentValue = parseFloat(vehicle.odometro || 0);
        unit = 'Km';
        limit = 1000; // Regra 2: Trava 1000km de salto
    } 
    // Se o campo editado for horímetro (unificado)
    else if (fieldType === 'horimetro') {
        currentValue = parseFloat(vehicle.horimetro || 0);
        unit = 'Hr';
        limit = 50;   // Regra 3: Trava 50h de salto
    } else {
        // Se o tipo não for passado ou desconhecido, tenta inferir ou ignora
        return { status: 'ok' }; 
    }

    // Regra: Bloquear valor ESTRITAMENTE INFERIOR (Regressão).
    // Tolerância para float (permite valores iguais)
    if (newValue < currentValue - 0.1) {
        return {
            status: 'bloqueio',
            message: `REGRESSÃO DETECTADA: A nova leitura (${newValue} ${unit}) não pode ser menor que a atual (${currentValue} ${unit}).`
        };
    }

    // Regra: Bloquear SALTO excessivo
    const diff = newValue - currentValue;
    if (diff > limit) {
        return {
            status: 'bloqueio',
            message: `SALTO EXCESSIVO: A diferença de ${diff.toFixed(1)} ${unit} excede o limite de segurança (${limit} ${unit}).`
        };
    }

    return { status: 'ok' };
};

/**
 * Regra 4: Verificações de Documentos e Avisos (Separados por Categoria)
 */
export const checkVehicleRestrictions = (vehicle, revisions = []) => {
    const issues = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0); 
    
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    // 1. Bloqueio Manual
    if (vehicle.canCirculate === false || vehicle.canCirculate === 0 || vehicle.canCirculate === '0') {
        issues.push({ category: 'bloqueio', type: 'error', message: "BLOQUEIO MANUAL: Veículo marcado como 'NÃO PODE CIRCULAR'." });
    }

    // 2. Revisões (Mecânica)
    const revision = revisions.find(r => r.vehicleId === vehicle.id);
    if (revision) {
        // Por Data
        if (revision.proximaRevisaoData) {
            const revDate = new Date(revision.proximaRevisaoData);
            revDate.setHours(0, 0, 0, 0);
            
            if (now >= revDate) {
                issues.push({ category: 'manutencao', type: 'error', message: `REVISÃO VENCIDA (Data): ${revDate.toLocaleDateString('pt-BR')}.` });
            } else if (revision.avisoAntecedenciaDias > 0) {
                const dataAviso = new Date(revDate);
                dataAviso.setDate(dataAviso.getDate() - revision.avisoAntecedenciaDias);
                if (now >= dataAviso) {
                    issues.push({ category: 'manutencao', type: 'warning', message: `Revisão PRÓXIMA (Data): Vence em ${revDate.toLocaleDateString('pt-BR')}.` });
                }
            }
        }

        // Por Leitura
        const readingInfo = getVehicleMainReading(vehicle);
        const unit = readingInfo.unit; 
        const currentReading = readingInfo.raw;
        
        // Determina meta (unificado horimetro)
        let proximaLeitura = 0;
        if (unit === 'Hr') {
            proximaLeitura = parseFloat(revision.proximaRevisaoHorimetro || 0);
            if (proximaLeitura === 0 && revision.proximaRevisaoOdometro > 0) proximaLeitura = parseFloat(revision.proximaRevisaoOdometro);
        } else {
            proximaLeitura = parseFloat(revision.proximaRevisaoOdometro || 0);
        }

        const avisoAntecedencia = parseFloat(revision.avisoAntecedenciaKmHr || 0);
        
        if (proximaLeitura > 0) {
            if (currentReading >= proximaLeitura) {
                issues.push({ category: 'manutencao', type: 'error', message: `REVISÃO VENCIDA (Leitura): ${currentReading}/${proximaLeitura} ${unit}.` });
            } else if (avisoAntecedencia > 0 && currentReading >= (proximaLeitura - avisoAntecedencia)) {
                const faltam = (proximaLeitura - currentReading).toFixed(1);
                issues.push({ category: 'manutencao', type: 'warning', message: `Revisão PRÓXIMA (Leitura): Faltam ${faltam} ${unit}.` });
            }
        }
    }

    // 3. Documentos (Legal)
    const isTruck = vehicleGroups['Caminhões']?.includes(vehicle.tipo) || vehicleGroups['Caminhões de Trecho']?.includes(vehicle.tipo);

    if (isTruck) {
        const docs = [
            { name: 'Tacógrafo', date: vehicle.validadeTacografo },
            { name: 'AET DAER', date: vehicle.validadeAET_DAER },
            { name: 'AET DNIT', date: vehicle.validadeAET_DNIT },
            // Mapeamento extra caso os nomes no banco sejam diferentes (como no seu exemplo anterior)
            { name: 'Tacógrafo', date: vehicle.validadeTacografo }, 
            { name: 'Licenciamento', date: vehicle.validadeLicenciamento }
        ];

        docs.forEach(doc => {
            if (doc.date) {
                const d = new Date(doc.date);
                const dCompare = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                
                if (now > dCompare) {
                    issues.push({ category: 'documento', type: 'error', message: `${doc.name} VENCIDO.` });
                } else if (dCompare <= thirtyDaysFromNow) {
                    issues.push({ category: 'documento', type: 'warning', message: `${doc.name} vence em breve.` });
                }
            }
        });
    }

    return issues;
};

// =============================================================================
// COMPATIBILIDADE CommonJS (Node.js / Backend)
// Permite que o cronService.js e outros módulos backend façam:
//   const { vehicleGroups } = require('../utils/vehicleRules');
// sem quebrar os imports ES Module do frontend React.
// =============================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        vehicleGroups,
        extraObraOptions,
        operationalSubGroups,
        equipmentTypesForHours,
        getAllowedReadingTypes,
        getVehicleMainReading,
        checkReadingConsistency,
        checkVehicleRestrictions,
    };
}
=======
// src/utils/vehicleAlerts.js
//
// ============================================================================
// vehicleAlerts — Processamento de alertas de veículos OTIMIZADO
// ============================================================================
//
// Versão antiga estava no App.js como `processVehiclesWithAlerts`, era O(V × R × F):
// para cada veículo (V), fazia .find em revisions (R) e .some em fines (F).
// Com 100 veículos × 50 revisões × 200 multas isso eram ~1M operações por
// re-render.
//
// Esta versão é O(V + R + F):
//   - pré-indexa revisions e fines em Maps
//   - depois um único passe nos vehicles fazendo lookup O(1)
//
// ============================================================================

import { vehicleGroups, getVehicleMainReading } from './vehicleRules';

const TRUCKS_GROUP = vehicleGroups['Caminhões'] || [];
const TRECHO_GROUP = vehicleGroups['Caminhões de Trecho'] || [];

const isTruck = (tipo) =>
    TRUCKS_GROUP.includes(tipo) || TRECHO_GROUP.includes(tipo);

/**
 * Pré-indexa as revisões por vehicleId.
 */
const indexRevisionsByVehicle = (revisions) => {
    const map = new Map();
    for (const r of revisions) {
        if (r?.vehicleId) map.set(r.vehicleId, r);
    }
    return map;
};

/**
 * Pré-indexa o set de vehicleIds com multas pendentes.
 */
const indexVehiclesWithPendingFines = (fines) => {
    const set = new Set();
    for (const f of fines) {
        if (f?.vehicleId && f?.paymentStatus === 'Pendente') {
            set.add(f.vehicleId);
        }
    }
    return set;
};

/**
 * Processa um único veículo e retorna { possuiAviso, avisoTexto }.
 */
const processVehicleAlert = (vehicle, revision, hasPendingFine, now, thirtyDaysFromNow) => {
    // 1. Bloqueio Manual
    if (
        vehicle.canCirculate === false ||
        vehicle.canCirculate === 0 ||
        vehicle.canCirculate === '0'
    ) {
        return { possuiAviso: true, avisoTexto: 'BLOQUEIO: O veículo não pode rodar (Doc/Manutenção).' };
    }

    // 2. Revisões
    if (revision) {
        const proximaData = revision.proximaRevisaoData
            ? new Date(revision.proximaRevisaoData)
            : null;
        const proximoOdometro = parseFloat(revision.proximaRevisaoOdometro || 0);
        const proximoHorimetro = parseFloat(revision.proximaRevisaoHorimetro || 0);

        const readingData = getVehicleMainReading(vehicle);
        const currentReading = readingData.raw;
        const unit = readingData.unit;

        const avisoAntecedencia = parseFloat(revision.avisoAntecedenciaKmHr || 0);
        const avisoDias = parseInt(revision.avisoAntecedenciaDias || 0, 10);

        let metaLeitura = unit === 'Hr' ? proximoHorimetro : proximoOdometro;
        if (!metaLeitura && unit === 'Hr' && proximoOdometro) metaLeitura = proximoOdometro;

        // Vencimento por data
        if (proximaData && now >= proximaData) {
            return { possuiAviso: true, avisoTexto: 'Atenção: Revisão Vencida (Data)!' };
        }
        if (proximaData && avisoDias > 0) {
            const warningDate = new Date(proximaData);
            warningDate.setDate(warningDate.getDate() - avisoDias);
            if (now >= warningDate) {
                return { possuiAviso: true, avisoTexto: 'Atenção: Revisão Próxima (Data)!' };
            }
        }

        // Vencimento por leitura
        if (metaLeitura > 0) {
            if (currentReading >= metaLeitura) {
                return { possuiAviso: true, avisoTexto: `Atenção: Revisão Vencida (${unit})!` };
            }
            if (avisoAntecedencia > 0 && currentReading >= metaLeitura - avisoAntecedencia) {
                return { possuiAviso: true, avisoTexto: `Atenção: Revisão Próxima (${unit})!` };
            }
        }
    }

    // 3. Documentos (apenas caminhões)
    if (isTruck(vehicle.tipo)) {
        const docs = [
            { type: 'Tacógrafo', date: vehicle.validadeTacografo },
            { type: 'AET DAER', date: vehicle.validadeAET_DAER },
            { type: 'AET DNIT', date: vehicle.validadeAET_DNIT },
        ];

        for (const doc of docs) {
            if (!doc.date) continue;
            const d = new Date(doc.date);
            const compareDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

            if (now > compareDate) {
                return { possuiAviso: true, avisoTexto: `Atenção: ${doc.type} Vencido!` };
            }
            if (compareDate <= thirtyDaysFromNow) {
                return { possuiAviso: true, avisoTexto: `Atenção: ${doc.type} Vence em breve!` };
            }
        }
    }

    // 4. Multas Pendentes (lookup O(1) no Set)
    if (hasPendingFine) {
        return { possuiAviso: true, avisoTexto: 'Atenção: Há multas pendentes para este veículo.' };
    }

    return { possuiAviso: false, avisoTexto: '' };
};

/**
 * Função principal: anexa { possuiAviso, avisoTexto } a cada veículo.
 *
 * Complexidade: O(V + R + F) — um passe em cada coleção.
 *
 * @param {Array} vehicles
 * @param {Array} revisions
 * @param {Array} fines
 * @returns {Array} cópia dos veículos com campos extras
 */
export const processVehiclesWithAlerts = (vehicles, revisions = [], fines = []) => {
    if (!Array.isArray(vehicles) || vehicles.length === 0) return [];

    // Pré-indexa
    const revByVehicle = indexRevisionsByVehicle(revisions);
    const finesByVehicle = indexVehiclesWithPendingFines(fines);

    // Data atual normalizada (uma vez para todos)
    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    // Único passe nos veículos
    return vehicles.map((vehicle) => {
        const revision = revByVehicle.get(vehicle.id) || null;
        const hasPendingFine = finesByVehicle.has(vehicle.id);
        const alert = processVehicleAlert(vehicle, revision, hasPendingFine, now, thirtyDaysFromNow);
        return { ...vehicle, ...alert };
    });
};
>>>>>>> 61056b64b7752e1806680c1175654affe6a65916
