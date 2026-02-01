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

// Grupos específicos para Arla 32 (Usado no Abastecimento)
export const GRUPOS_ARLA = [
    'BITRUCK', 'CAMINHÃO', 'CAMINHÃO CARROCERIA', 'CAMINHÃO PIPA', 
    'CAMINHÃO PRANCHA', 'CAMINHÃO TANQUE', 'CAVALO', 'CAÇAMBA', 
    'CAÇAMBA BITRUCK', 'CAÇAMBA TOCO', 'CAÇAMBA TRUCKADO', 'CAÇAMBA TRAÇADO'
];

/**
 * Retorna o tipo de leitura ('KM' ou 'HR') baseado no grupo do veículo.
 * Regra 1: Somente Veículos Leves e Caminhões de Trecho usam KM.
 * Regra 8: Todos os demais (Caminhões Pesados e Máquinas) usam Horímetro.
 */
export const getReadingType = (vehicle) => {
    if (!vehicle) return 'HR'; // Fallback seguro
    
    // Normaliza os dados para garantir comparação correta
    const tipo = (vehicle.tipo || '').trim();
    const grupo = (vehicle.grupo || '').trim();

    // Verifica se pertence aos grupos de Odômetro (KM)
    // Verifica tanto pelo tipo exato quanto pelo grupo
    const isLeve = vehicleGroups['Veículos Leves'].some(t => tipo.includes(t)) || grupo === 'Veículos Leves';
    const isTrecho = vehicleGroups['Caminhões de Trecho'].some(t => tipo.includes(t)) || grupo === 'Caminhões de Trecho';

    if (isLeve || isTrecho) {
        return 'KM';
    }

    return 'HR';
};

/**
 * ADAPTER: Função de compatibilidade para a página de Abastecimento.
 * Converte o retorno 'KM'/'HR' para 'odometro'/'horimetro'.
 * @param {Object} vehicle 
 * @returns {string} 'odometro' | 'horimetro'
 */
export const getVehicleMainReading = (vehicle) => {
    const type = getReadingType(vehicle);
    return type === 'KM' ? 'odometro' : 'horimetro';
};

/**
 * Determina se o veículo precisa de Arla 32
 * @param {Object} vehicle 
 * @returns {boolean}
 */
export const needsArla = (vehicle) => {
    if (!vehicle) return false;
    
    const tipo = (vehicle.tipo || '').toUpperCase();
    const modelo = (vehicle.modelo || '').toUpperCase();

    // Verifica se o tipo ou modelo contém algum dos termos do grupo Arla
    return GRUPOS_ARLA.some(t => tipo === t || modelo.includes(t) || tipo.includes(t));
};

/**
 * Valida a consistência da leitura (Regras 2 e 3).
 * Bloqueia regressão e saltos absurdos.
 */
export const validateReading = (currentReading, newReading, type) => {
    const current = parseFloat(currentReading) || 0;
    const input = parseFloat(newReading);

    if (isNaN(input)) {
        return { valid: false, error: 'Valor inválido.', requiresPassword: false };
    }

    // Regras 2 e 3: Bloqueio de Regressão (Valor menor ou igual ao anterior)
    if (input <= current) {
        return { 
            valid: false, 
            error: `Regressão detectada! O valor deve ser maior que ${current} ${type}.`, 
            requiresPassword: true 
        };
    }

    // Regras 2 e 3: Trava de Segurança (Anti-Erro de Digitação / Saltos)
    const diff = input - current;
    const LIMIT_KM = 1000; // Regra 2
    const LIMIT_HR = 50;   // Regra 3

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

/**
 * Verifica restrições do veículo (Regra 4 - Alertas).
 * Retorna lista de alertas de Manutenção e Documentos.
 */
export const checkVehicleRestrictions = (vehicle) => {
    const issues = [];
    const now = new Date();
    // Zera hora para comparar apenas datas
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (!vehicle) return issues;

    // 1. Manutenção por Data
    if (vehicle.proximaRevisaoData) {
        const revDate = new Date(vehicle.proximaRevisaoData);
        const revDateCompare = new Date(revDate.getFullYear(), revDate.getMonth(), revDate.getDate());
        
        // Calcular diferença em dias
        const diffTime = revDateCompare - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

        if (revDateCompare < today) {
            issues.push({ category: 'manutencao', type: 'error', message: `MANUTENÇÃO VENCIDA (Data): ${revDate.toLocaleDateString()}.` });
        } else if (diffDays <= 7) { // Aviso com 7 dias de antecedência
            issues.push({ category: 'manutencao', type: 'warning', message: `Manutenção agendada para ${revDate.toLocaleDateString()} (em ${diffDays} dias).` });
        }
    }

    // 2. Manutenção por Leitura (Km ou Horas)
    // Usa a coluna 'horimetro' unificada conforme Regra 8
    const currentReading = parseFloat(vehicle.horimetro || 0);
    
    // Determina qual campo de "Próxima Revisão" olhar
    // Se for KM, olha proximaRevisaoKm. Se for HR, olha proximaRevisaoHoras.
    const type = getReadingType(vehicle);
    let proximaLeitura = 0;
    
    if (type === 'KM') {
        proximaLeitura = parseFloat(vehicle.proximaRevisaoKm || 0);
    } else {
        proximaLeitura = parseFloat(vehicle.proximaRevisaoHoras || 0);
    }

    if (proximaLeitura > 0) {
        const avisoAntecedencia = type === 'KM' ? 500 : 20; // Avisar 500km ou 20h antes

        if (currentReading >= proximaLeitura) {
            issues.push({ category: 'manutencao', type: 'error', message: `MANUTENÇÃO VENCIDA (Leitura): ${currentReading}/${proximaLeitura} ${type}.` });
        } else if ((proximaLeitura - currentReading) <= avisoAntecedencia) {
            const faltam = (proximaLeitura - currentReading).toFixed(1);
            issues.push({ category: 'manutencao', type: 'warning', message: `Manutenção PRÓXIMA: Faltam ${faltam} ${type}.` });
        }
    }

    // 3. Documentos (CNH, Tacógrafo, AET, Licenciamento)
    // Regra 4: Alertas com cores distintas
    const docs = [
        { key: 'validadeTacografo', label: 'Tacógrafo' },
        { key: 'validadeAET_DAER', label: 'AET DAER' },
        { key: 'validadeAET_DNIT', label: 'AET DNIT' },
        { key: 'validadeLicenciamento', label: 'Licenciamento' },
        // Adicione outros campos de data de documento se existirem no objeto vehicle
    ];

    docs.forEach(doc => {
        if (vehicle[doc.key]) {
            const docDate = new Date(vehicle[doc.key]);
            const docDateCompare = new Date(docDate.getFullYear(), docDate.getMonth(), docDate.getDate());
            
            // Diferença em dias
            const diffTime = docDateCompare - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (docDateCompare < today) {
                issues.push({ category: 'documento', type: 'error', message: `${doc.label} VENCIDO em ${docDate.toLocaleDateString()}.` });
            } else if (diffDays <= 15) { // Aviso com 15 dias
                issues.push({ category: 'documento', type: 'warning', message: `${doc.label} vence em ${diffDays} dias.` });
            }
        }
    });

    // 4. Status de Bloqueio Manual
    if (vehicle.status === 'MANUTENCAO' || vehicle.status === 'QUEBRADO') {
        issues.push({ category: 'status', type: 'block', message: `Veículo marcado como ${vehicle.status}.` });
    }

    return issues;
};

export const formatReading = (value, type) => {
    if (!value && value !== 0) return '-';
    return `${parseFloat(value).toLocaleString('pt-BR')} ${type === 'KM' ? 'Km' : 'Hrs'}`;
};