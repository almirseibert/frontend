// src/utils/vehicleRules.js

// --- DEFINIÇÕES DE GRUPOS (Base de Conhecimento) ---
export const vehicleGroups = {
    'Veículos Leves': ['Automóvel', 'Camionete', 'Utilitários', 'Moto', 'Passeio', 'Veículo Leve'],
    'Caminhões': ['Bitruck', 'Caminhão Pipa', 'Caminhão Tanque', 'Caminhão Carroceria', 'Cavalo', 'Caçamba Bitruck', 'Caçamba Toco', 'Caçamba Traçado', 'Caçamba Truckado', 'Caminhão', 'Caçamba'],
    'Caminhões de Trecho': ['Caminhão Prancha', 'Semirreboques', 'Caminhão Toco'], 
    'Máquinas Pesadas': ['Motoniveladora', 'Pá Carregadeira', 'Retroescavadeira', 'Rolo', 'Trator', 'Escavadeira', 'Escavadeira + Rompedor', 'Fresadora', 'Trator Esteira']
};

export const extraObraOptions = ['Administração', 'Oficina', 'Pátio', 'Rampa', 'Diversos'];
export const operationalSubGroups = ['Administrativo', 'Oficina', 'Operacional', 'Supervisor'];

// Equipamentos que usam HORAS para cálculo de produção/custo
export const equipmentTypesForHours = [
    'Caminhão', 'Escavadeira', 'Escavadeira + Rompedor', 'Rolo', 
    'Retroescavadeira', 'Pá Carregadeira', 'Motoniveladora', 
    'Trator', 'Trator Esteira', 'Bitruck', 'Caçamba', 
    'Caminhão Pipa', 'Caminhão Tanque', 'Caminhão Carroceria', 
    'Cavalo', 'Caçamba Bitruck', 'Caçamba Toco', 
    'Caçamba Traçado', 'Caçamba Truckado', 'Fresadora'
];

// Grupos específicos para Arla 32
export const GRUPOS_ARLA = [
    'BITRUCK', 'CAMINHÃO', 'CAMINHÃO CARROCERIA', 'CAMINHÃO PIPA', 
    'CAMINHÃO PRANCHA', 'CAMINHÃO TANQUE', 'CAVALO', 'CAÇAMBA', 
    'CAÇAMBA BITRUCK', 'CAÇAMBA TOCO', 'CAÇAMBA TRUCKADO', 'CAÇAMBA TRAÇADO'
];

/**
 * Retorna o tipo de leitura ('KM' ou 'HR') baseado no grupo do veículo.
 */
export const getReadingType = (vehicle) => {
    if (!vehicle) return 'HR';
    
    const tipo = (vehicle.tipo || '').trim();
    const grupo = (vehicle.grupo || '').trim();

    const isLeve = vehicleGroups['Veículos Leves'].some(t => tipo.includes(t)) || grupo === 'Veículos Leves';
    const isTrecho = vehicleGroups['Caminhões de Trecho'].some(t => tipo.includes(t)) || grupo === 'Caminhões de Trecho';

    if (isLeve || isTrecho) {
        return 'KM';
    }

    return 'HR';
};

/**
 * ADAPTER: Função de compatibilidade para a página de Abastecimento.
 * Converte o retorno 'KM'/'HR' para 'odometro'/'horimetro' (formato do BD).
 */
export const getVehicleMainReading = (vehicle) => {
    const type = getReadingType(vehicle);
    return type === 'KM' ? 'odometro' : 'horimetro';
};

export const getAllowedReadingTypes = (vehicle) => {
    const main = getVehicleMainReading(vehicle);
    return [main];
};

export const needsArla = (vehicle) => {
    if (!vehicle) return false;
    const tipo = (vehicle.tipo || '').toUpperCase();
    const modelo = (vehicle.modelo || '').toUpperCase();
    return GRUPOS_ARLA.some(t => tipo === t || modelo.includes(t) || tipo.includes(t));
};

export const validateReading = (currentReading, newReading, type) => {
    const current = parseFloat(currentReading) || 0;
    const input = parseFloat(newReading);

    if (isNaN(input)) {
        return { valid: false, error: 'Valor inválido.', requiresPassword: false };
    }

    if (input <= current) {
        return { 
            valid: false, 
            error: `Regressão detectada! O valor deve ser maior que ${current} ${type}.`, 
            requiresPassword: true 
        };
    }

    const diff = input - current;
    const LIMIT_KM = 2000; 
    const LIMIT_HR = 100;

    if (type === 'KM' && diff > LIMIT_KM) {
        return { 
            valid: false, 
            error: `Salto suspeito de ${diff} Km (Max: ${LIMIT_KM}). Verifique se digitou corretamente.`, 
            requiresPassword: true 
        };
    }

    if (type === 'HR' && diff > LIMIT_HR) {
        return { 
            valid: false, 
            error: `Salto suspeito de ${diff} Horas (Max: ${LIMIT_HR}). Verifique se digitou corretamente.`, 
            requiresPassword: true 
        };
    }

    return { valid: true, error: null, requiresPassword: false };
};

export const checkReadingConsistency = validateReading;

/**
 * Verifica restrições do veículo (Regra 4 - Alertas).
 * Retorna lista de alertas de Manutenção e Documentos.
 */
export const checkVehicleRestrictions = (vehicle) => {
    const issues = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (!vehicle) return issues;

    // 1. Manutenção por Data
    if (vehicle.proximaRevisaoData) {
        const revDate = new Date(vehicle.proximaRevisaoData);
        const revDateCompare = new Date(revDate.getFullYear(), revDate.getMonth(), revDate.getDate());
        const diffTime = revDateCompare - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

        if (revDateCompare < today) {
            issues.push({ category: 'manutencao', type: 'error', title: 'MANUTENÇÃO VENCIDA', message: `Data limite excedida: ${revDate.toLocaleDateString()}.` });
        } else if (diffDays <= 7) {
            issues.push({ category: 'manutencao', type: 'warning', title: 'MANUTENÇÃO PRÓXIMA', message: `Agendada para ${revDate.toLocaleDateString()} (em ${diffDays} dias).` });
        }
    }

    // 2. Manutenção por Leitura
    const type = getReadingType(vehicle);
    const readingKey = type === 'KM' ? 'odometro' : 'horimetro'; // Ajuste para ler a propriedade correta se já estiver normalizada, ou usar vehicle.odometro
    const currentReading = parseFloat(vehicle[readingKey] || vehicle.odometro || vehicle.horimetro || 0);
    
    let proximaLeitura = 0;
    if (type === 'KM') {
        proximaLeitura = parseFloat(vehicle.proximaRevisaoKm || 0);
    } else {
        proximaLeitura = parseFloat(vehicle.proximaRevisaoHoras || 0);
    }

    if (proximaLeitura > 0) {
        const avisoAntecedencia = type === 'KM' ? 500 : 20;

        if (currentReading >= proximaLeitura) {
            issues.push({ category: 'manutencao', type: 'error', title: 'MANUTENÇÃO VENCIDA', message: `Limite de leitura excedido: ${currentReading}/${proximaLeitura} ${type}.` });
        } else if ((proximaLeitura - currentReading) <= avisoAntecedencia) {
            const faltam = (proximaLeitura - currentReading).toFixed(1);
            issues.push({ category: 'manutencao', type: 'warning', title: 'MANUTENÇÃO PRÓXIMA', message: `Faltam apenas ${faltam} ${type}.` });
        }
    }

    // 3. Documentos
    const docs = [
        { key: 'validadeTacografo', label: 'Tacógrafo' },
        { key: 'validadeAET_DAER', label: 'AET DAER' },
        { key: 'validadeAET_DNIT', label: 'AET DNIT' },
        { key: 'validadeLicenciamento', label: 'Licenciamento' },
    ];

    docs.forEach(doc => {
        if (vehicle[doc.key]) {
            const docDate = new Date(vehicle[doc.key]);
            const docDateCompare = new Date(docDate.getFullYear(), docDate.getMonth(), docDate.getDate());
            const diffTime = docDateCompare - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (docDateCompare < today) {
                issues.push({ category: 'documento', type: 'error', title: 'DOCUMENTO VENCIDO', message: `${doc.label} venceu em ${docDate.toLocaleDateString()}.` });
            } else if (diffDays <= 15) {
                issues.push({ category: 'documento', type: 'warning', title: 'DOCUMENTO A VENCER', message: `${doc.label} vence em ${diffDays} dias.` });
            }
        }
    });

    // 4. Status de Bloqueio Manual
    if (vehicle.status === 'manutencao' || vehicle.status === 'MANUTENCAO' || vehicle.status === 'quebrado' || vehicle.status === 'QUEBRADO') {
        issues.push({ category: 'status', type: 'block', title: 'VEÍCULO EM OFICINA', message: `Veículo marcado como ${vehicle.status} no sistema.` });
    }
    
    // 5. Documentação Irregular (Flag direta)
    if (vehicle.naoPodeCircular) {
        issues.push({ category: 'status', type: 'block', title: 'PROIBIDO CIRCULAR', message: 'Bloqueio administrativo (Docs/Multas).' });
    }

    return issues;
};

/**
 * Verifica alertas de consumo (Queda de Média)
 * Retorna objeto de alerta se houver problema
 */
export const checkConsumptionAlert = (vehicle, litragem, leituraAtual, leituraAnterior) => {
    if (!vehicle || !vehicle.mediaConsumo || !litragem || !leituraAtual || !leituraAnterior) return null;
    
    const dist = leituraAtual - leituraAnterior;
    if (dist <= 0) return null;

    const mediaAtual = dist / litragem;
    const mediaHistorica = parseFloat(vehicle.mediaConsumo);
    
    // Se a média for Zero no cadastro, ignora
    if (mediaHistorica === 0) return null;

    // Se o consumo piorou mais de 30% (ex: fazia 10km/l, agora faz 6.9km/l)
    if (mediaAtual < (mediaHistorica * 0.70)) {
        return {
            title: 'ALERTA DE CONSUMO',
            message: `Média atual (${mediaAtual.toFixed(2)}) muito abaixo do histórico (${mediaHistorica.toFixed(2)}).`,
            type: 'warning'
        };
    }
    return null;
};

export const formatReading = (value, type) => {
    if (!value && value !== 0) return '-';
    return `${parseFloat(value).toLocaleString('pt-BR')} ${type === 'KM' ? 'Km' : 'Hrs'}`;
};