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
 * Regra 1: Define estritamente quais tipos de leitura são permitidos por grupo.
 * Somente Leves e Caminhões de Trecho usam KM. O resto é Hora.
 */
export const getAllowedReadingTypes = (vehicleType) => {
    const group = Object.keys(vehicleGroups).find(key => vehicleGroups[key].includes(vehicleType));

    if (group === 'Veículos Leves' || group === 'Caminhões de Trecho') {
        return ['odometro'];
    }
    // Todos os outros (Caminhões comuns, Máquinas) usam apenas Horímetro
    return ['horimetro']; 
};

/**
 * Retorna a leitura principal (Valor, Unidade e Label) de forma robusta.
 */
export const getVehicleMainReading = (vehicle) => {
    if (!vehicle) return { value: 0, unit: '', label: 'N/A', raw: 0 };

    const allowedTypes = getAllowedReadingTypes(vehicle.tipo);
    const usesKm = allowedTypes.includes('odometro');

    if (usesKm) {
        return { value: vehicle.odometro, unit: 'Km', label: 'Odômetro', raw: parseFloat(vehicle.odometro || 0) };
    } else {
        // Prioriza digital, depois analógico, depois o campo genérico
        const val = vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro;
        return { value: val, unit: 'Hr', label: 'Horímetro', raw: parseFloat(val || 0) };
    }
};

/**
 * Regras 2 e 3: Validação Rigorosa de Leitura
 * Retorna um objeto { status: 'ok' | 'bloqueio', message: string }
 */
export const checkReadingConsistency = (vehicle, newValueStr, fieldType) => {
    // Se não tiver veículo anterior (criação), não valida consistência, apenas formato
    if (!vehicle) return { status: 'ok' };

    const newValue = parseFloat(newValueStr);
    if (isNaN(newValue)) return { status: 'ok' }; // Deixa passar se for vazio/inválido, o form html valida required

    // Descobre qual é o valor ATUAL salvo no banco para o campo específico que está sendo editado
    let currentValue = 0;
    let unit = '';
    let limit = 0;

    if (fieldType === 'odometro') {
        currentValue = parseFloat(vehicle.odometro || 0);
        unit = 'Km';
        limit = 1000; // Regra 2: Trava 1000km
    } else if (['horimetro', 'horimetroDigital', 'horimetroAnalogico'].includes(fieldType)) {
        currentValue = parseFloat(vehicle[fieldType] || 0);
        unit = 'Hr';
        limit = 50;   // Regra 3: Trava 50h
    } else {
        return { status: 'ok' }; // Campo desconhecido
    }

    // Regra: Bloquear valor INFERIOR ou IGUAL (Regressão/Estagnação sem justificativa)
    // Usamos uma pequena tolerância (epsilon) apenas para evitar erros de ponto flutuante em 'iguais'
    // Mas a lógica é: Se Novo <= Atual -> Bloqueio
    if (newValue <= currentValue + 0.001) {
        return {
            status: 'bloqueio',
            message: `VALOR INVÁLIDO: A nova leitura (${newValue} ${unit}) deve ser superior à atual (${currentValue} ${unit}). Se houve erro anterior, contate o supervisor.`
        };
    }

    // Regra: Bloquear SALTO excessivo (> 1000km ou > 50h)
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
 * Regra 4: Verificações de Documentos e Avisos
 */
export const checkVehicleRestrictions = (vehicle, revisions = []) => {
    const issues = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0); 
    
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    // 1. Bloqueio Manual
    if (vehicle.canCirculate === false || vehicle.canCirculate === 0 || vehicle.canCirculate === '0') {
        issues.push({ type: 'bloqueio', message: "BLOQUEIO MANUAL: Veículo marcado como 'NÃO PODE CIRCULAR'." });
    }

    // 2. Revisões
    const revision = revisions.find(r => r.vehicleId === vehicle.id);
    if (revision) {
        // Por Data
        if (revision.proximaRevisaoData) {
            const revDate = new Date(revision.proximaRevisaoData);
            revDate.setHours(0, 0, 0, 0);
            
            if (now >= revDate) {
                issues.push({ type: 'vencido', message: `REVISÃO VENCIDA (Data): ${revDate.toLocaleDateString('pt-BR')}.` });
            } else if (revision.avisoAntecedenciaDias > 0) {
                const dataAviso = new Date(revDate);
                dataAviso.setDate(dataAviso.getDate() - revision.avisoAntecedenciaDias);
                if (now >= dataAviso) {
                    issues.push({ type: 'aviso', message: `Revisão PRÓXIMA (Data): Vence em ${revDate.toLocaleDateString('pt-BR')}.` });
                }
            }
        }

        // Por Leitura
        const readingInfo = getVehicleMainReading(vehicle);
        const unit = readingInfo.unit; 
        const currentReading = readingInfo.raw;
        
        // Determina meta (prioriza horimetro se for maquina)
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
                issues.push({ type: 'vencido', message: `REVISÃO VENCIDA (Leitura): Atual ${currentReading} ${unit} >= Meta ${proximaLeitura} ${unit}.` });
            } else if (avisoAntecedencia > 0 && currentReading >= (proximaLeitura - avisoAntecedencia)) {
                const faltam = (proximaLeitura - currentReading).toFixed(1);
                issues.push({ type: 'aviso', message: `Revisão PRÓXIMA (Leitura): Faltam ${faltam} ${unit}.` });
            }
        }
    }

    // 3. Documentos (Caminhões e Trecho)
    const isTruck = vehicleGroups['Caminhões'].includes(vehicle.tipo) || vehicleGroups['Caminhões de Trecho'].includes(vehicle.tipo);

    if (isTruck) {
        const docs = [
            { name: 'Tacógrafo', date: vehicle.validadeTacografo },
            { name: 'AET DAER', date: vehicle.validadeAET_DAER },
            { name: 'AET DNIT', date: vehicle.validadeAET_DNIT }
        ];

        docs.forEach(doc => {
            if (doc.date) {
                const d = new Date(doc.date);
                const dCompare = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                
                if (now > dCompare) {
                    issues.push({ type: 'vencido', message: `DOCUMENTO VENCIDO: ${doc.name}.` });
                } else if (dCompare <= thirtyDaysFromNow) {
                    issues.push({ type: 'aviso', message: `Documento ${doc.name} vence em breve.` });
                }
            }
        });
    }

    return issues;
};