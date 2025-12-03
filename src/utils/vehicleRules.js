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
 * Define estritamente quais tipos de leitura são permitidos por grupo.
 * Regra 1: Somente Leves e Caminhões de Trecho usam KM. O resto é Hora.
 */
export const getAllowedReadingTypes = (vehicleType) => {
    // Encontra o grupo do veículo
    const group = Object.keys(vehicleGroups).find(key => vehicleGroups[key].includes(vehicleType));

    // Regra Estrita
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
 * Valida consistência da leitura inserida vs leitura atual.
 * Regras:
 * 1. Não pode ser menor que a anterior (Regressão).
 * 2. Km: Salto máx 1000.
 * 3. Hr: Salto máx 50.
 */
export const checkReadingConsistency = (vehicle, newReadingValue, readingType = null) => {
    const currentInfo = getVehicleMainReading(vehicle);
    const currentVal = currentInfo.raw || 0;
    const unit = currentInfo.unit;
    const newVal = parseFloat(newReadingValue);

    if (isNaN(newVal)) return null; 

    // Se o tipo de leitura sendo editado não bate com o principal do veículo, ignoramos a validação estrita aqui
    // (Ex: editando horímetro analógico de uma máquina que usa digital como principal)
    // Mas para a regra geral de bloqueio, assumimos a leitura principal.

    // 1. Verifica Regressão
    // Tolerância de 0.1 para arredondamentos
    if (newVal < (currentVal - 0.1)) {
        return { 
            type: 'bloqueio', 
            message: `ERRO CRÍTICO: O valor informado (${newVal} ${unit}) é MENOR que a leitura atual (${currentVal} ${unit}). É necessário senha de supervisor para corrigir.` 
        };
    }

    // 2. Verifica Salto Excessivo (Regra 2 e 3)
    const diff = newVal - currentVal;
    let limit = 0;
    
    if (unit === 'Km') {
        limit = 1000; // Regra: Trava em 1000 Km
    } else {
        limit = 50;   // Regra: Trava em 50 Horas
    }

    if (diff > limit) {
        return { 
            type: 'bloqueio', 
            message: `TRAVA DE SEGURANÇA: O aumento de ${diff.toFixed(1)} ${unit} é superior ao limite permitido (${limit} ${unit}). Verifique se houve erro de digitação.` 
        };
    }

    return null; // Tudo ok
};

/**
 * Verifica restrições de circulação, documentos e revisões.
 */
export const checkVehicleRestrictions = (vehicle, revisions = []) => {
    const issues = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0); 
    
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    // 1. Bloqueio Manual (Checkbox "Não pode circular")
    // Se canCirculate for false ou 0, gera bloqueio.
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
            
            if (now >= revDate) {
                issues.push({ type: 'vencido', message: `REVISÃO VENCIDA (Data): ${revDate.toLocaleDateString('pt-BR')}.` });
            } else {
                const avisoDias = parseInt(revision.avisoAntecedenciaDias || 0);
                const dataAviso = new Date(revDate);
                dataAviso.setDate(dataAviso.getDate() - avisoDias);
                if (avisoDias > 0 && now >= dataAviso) {
                    issues.push({ type: 'aviso', message: `Revisão PRÓXIMA (Data): Vence em ${revDate.toLocaleDateString('pt-BR')}.` });
                }
            }
        }

        // Por Leitura
        const readingInfo = getVehicleMainReading(vehicle);
        const unit = readingInfo.unit; 
        const currentReading = readingInfo.raw;
        let proximaLeitura = 0;
        
        // Determina qual meta usar
        if (unit === 'Hr') {
            proximaLeitura = parseFloat(revision.proximaRevisaoHorimetro || 0);
            // Fallback se configuraram errado
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

    // 3. Documentos (Apenas Caminhões/Trecho)
    const allowedTypes = getAllowedReadingTypes(vehicle.tipo);
    // Se usa horimetro e é caminhão, ou se é trecho
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
                d.setHours(0, 0, 0, 0); // Zera hora para comparar apenas data
                
                // Compara com hoje
                if (now > d) {
                    issues.push({ type: 'vencido', message: `DOCUMENTO VENCIDO: ${doc.name} venceu em ${d.toLocaleDateString('pt-BR')}.` });
                } else if (d <= thirtyDaysFromNow) {
                    issues.push({ type: 'aviso', message: `Documento ${doc.name} vence em breve (${d.toLocaleDateString('pt-BR')}).` });
                }
            }
        });
    }

    return issues;
};