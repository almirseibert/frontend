// src/utils/vehicleRules.js

export const vehicleGroups = {
    'Veículos Leves': ['Automóvel', 'Camionete', 'Utilitários', 'Moto'],
    'Caminhões': ['Bitruck', 'Caminhão Pipa', 'Caminhão Tanque', 'Caminhão Carroceria', 'Cavalo', 'Caçamba Bitruck', 'Caçamba Toco', 'Caçamba Traçado', 'Caçamba Truckado', 'Caminhão', 'Caçamba'],
    'Caminhões de Trecho': ['Caminhão Prancha', 'Semirreboques'], 
    'Máquinas Pesadas': ['Motoniveladora', 'Pá Carregadeira', 'Retroescavadeira', 'Rolo', 'Trator', 'Escavadeira', 'Fresadora', 'Trator Esteira']
};

export const extraObraOptions = ['Administração', 'Oficina', 'Pátio', 'Rampa', 'Diversos'];
export const operationalSubGroups = ['Administrativo', 'Oficina', 'Operacional', 'Supervisor'];
export const equipmentTypesForHours = ['Caminhão', 'Escavadeira', 'Rolo', 'Retroescavadeira', 'Pá Carregadeira', 'Motoniveladora', 'Trator', 'Trator de Esteiras', 'Bitruck', 'Caçamba'];

/**
 * Define quais tipos de leitura são permitidos para inserção de dados.
 */
export const getAllowedReadingTypes = (vehicleType) => {
    const group = Object.keys(vehicleGroups).find(key => vehicleGroups[key].includes(vehicleType));

    // Regra estrita conforme solicitado:
    if (group === 'Veículos Leves') return ['odometro'];
    if (group === 'Caminhões de Trecho') return ['odometro'];
    
    // Caminhões e Máquinas usam Horímetro
    if (group === 'Caminhões') return ['horimetro']; 
    if (group === 'Máquinas Pesadas') return ['horimetro'];

    return ['odometro']; // Default
};

/**
 * Retorna a leitura principal (Valor, Unidade e Label) de forma robusta.
 */
export const getVehicleMainReading = (vehicle) => {
    if (!vehicle) return { value: 0, unit: '', label: 'N/A', raw: 0 };

    const tipo = vehicle.tipo || '';
    const groupName = Object.keys(vehicleGroups).find(group => vehicleGroups[group].includes(tipo));

    // 1. Veículos Leves e Caminhões de Trecho -> KM
    if (groupName === 'Veículos Leves' || groupName === 'Caminhões de Trecho') {
        return { value: vehicle.odometro, unit: 'Km', label: 'Odômetro', raw: parseFloat(vehicle.odometro || 0) };
    }

    // 2. Caminhões e Máquinas -> HORAS
    if (groupName === 'Caminhões' || groupName === 'Máquinas Pesadas') {
        // Prioriza digital, depois analógico, depois o campo genérico
        const val = vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro;
        return { value: val, unit: 'Hr', label: 'Horímetro', raw: parseFloat(val || 0) };
    }

    // Default
    return { value: vehicle.odometro, unit: 'Km', label: 'Odômetro', raw: parseFloat(vehicle.odometro || 0) };
};

/**
 * NOVA REGRA: Valida consistência da leitura inserida vs leitura atual.
 * Retorna erro se for menor que a atual ou se o salto for muito grande.
 */
export const checkReadingConsistency = (vehicle, newReadingValue) => {
    const currentInfo = getVehicleMainReading(vehicle);
    const currentVal = currentInfo.raw || 0;
    const unit = currentInfo.unit;
    const newVal = parseFloat(newReadingValue);

    if (isNaN(newVal)) return null; // Ignora se não for número válido

    // 1. Verifica se é menor que a atual (Regressão)
    // Aceita uma tolerância mínima de 0.1 para arredondamentos, mas bloqueia regressão real
    if (newVal < (currentVal - 0.1)) {
        return { 
            type: 'bloqueio', 
            message: `ERRO DE LEITURA: O valor informado (${newVal} ${unit}) é MENOR que a leitura atual do veículo (${currentVal} ${unit}).` 
        };
    }

    // 2. Verifica salto excessivo (Erro de digitação provável)
    const diff = newVal - currentVal;
    
    // Definição dos limites
    let limit = 0;
    if (unit === 'Km') {
        limit = 500; // Regra: 500 Km
    } else {
        limit = 50; // Regra: 50 Horas
    }

    if (diff > limit) {
        return { 
            type: 'bloqueio', // Bloqueio exige senha
            message: `ALERTA DE CONSISTÊNCIA: A diferença de leitura (${diff.toFixed(1)} ${unit}) é superior ao limite de segurança (${limit} ${unit}). Verifique se houve erro de digitação.` 
        };
    }

    return null; // Tudo ok
};

/**
 * FUNÇÃO CENTRAL DE VALIDAÇÃO DE RESTRIÇÕES (Atualizada)
 */
export const checkVehicleRestrictions = (vehicle, revisions = []) => {
    const issues = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0); 
    
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    // 1. Bloqueio Manual
    const isBlocked = vehicle.canCirculate === false || vehicle.canCirculate === 0 || vehicle.canCirculate === '0';
    if (isBlocked) {
        issues.push({ type: 'bloqueio', message: "BLOQUEIO MANUAL: Veículo marcado como 'NÃO PODE CIRCULAR'." });
    }

    // 2. Revisões
    const revision = revisions.find(r => r.vehicleId === vehicle.id);
    if (revision) {
        // Por Data
        if (revision.proximaRevisaoData) {
            const revDate = new Date(revision.proximaRevisaoData);
            revDate.setHours(0, 0, 0, 0);
            const avisoDias = parseInt(revision.avisoAntecedenciaDias || 0);
            const dataAviso = new Date(revDate);
            dataAviso.setDate(dataAviso.getDate() - avisoDias);

            if (now >= revDate) {
                issues.push({ type: 'vencido', message: `REVISÃO VENCIDA: Data limite era ${revDate.toLocaleDateString('pt-BR')}.` });
            } else if (avisoDias > 0 && now >= dataAviso) {
                issues.push({ type: 'aviso', message: `Revisão PRÓXIMA: Vence em ${revDate.toLocaleDateString('pt-BR')}.` });
            }
        }

        // Por Leitura
        const readingInfo = getVehicleMainReading(vehicle);
        const unit = readingInfo.unit; 
        const currentReading = readingInfo.raw;
        let proximaLeitura = 0;
        
        if (unit === 'Hr') {
            proximaLeitura = parseFloat(revision.proximaRevisaoHorimetro || 0);
            if (proximaLeitura === 0 && revision.proximaRevisaoOdometro > 0) {
                proximaLeitura = parseFloat(revision.proximaRevisaoOdometro);
            }
        } else {
            proximaLeitura = parseFloat(revision.proximaRevisaoOdometro || 0);
        }

        const avisoAntecedencia = parseFloat(revision.avisoAntecedenciaKmHr || 0);
        
        if (proximaLeitura > 0) {
            if (currentReading >= proximaLeitura) {
                issues.push({ type: 'vencido', message: `REVISÃO VENCIDA: Atual ${currentReading} ${unit} (Meta: ${proximaLeitura} ${unit}).` });
            } else if (avisoAntecedencia > 0 && currentReading >= (proximaLeitura - avisoAntecedencia)) {
                const faltam = (proximaLeitura - currentReading).toFixed(1);
                issues.push({ type: 'aviso', message: `Revisão PRÓXIMA: Faltam ${faltam} ${unit}.` });
            }
        }
    }

    // 3. Documentos
    const tipo = vehicle.tipo || '';
    const isTruck = vehicleGroups['Caminhões'].includes(tipo) || vehicleGroups['Caminhões de Trecho'].includes(tipo) || tipo.includes('Caminhão');

    if (isTruck) {
        const docs = [
            { name: 'Tacógrafo', date: vehicle.validadeTacografo },
            { name: 'AET DAER', date: vehicle.validadeAET_DAER },
            { name: 'AET DNIT', date: vehicle.validadeAET_DNIT }
        ];

        docs.forEach(doc => {
            if (doc.date) {
                const d = new Date(doc.date);
                d.setHours(0, 0, 0, 0);
                const compareDate = new Date(d); 
                compareDate.setHours(12);

                if (now > compareDate) {
                    issues.push({ type: 'vencido', message: `DOCUMENTO VENCIDO: ${doc.name}.` });
                } else if (compareDate <= thirtyDaysFromNow) {
                    issues.push({ type: 'aviso', message: `Documento ${doc.name} vence em breve.` });
                }
            }
        });
    }

    return issues;
};