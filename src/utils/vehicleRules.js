// src/utils/vehicleRules.js

export const vehicleGroups = {
    'Veículos Leves': ['Camionete', 'Automóvel', 'Moto', 'Utilitário'],
    'Caminhões': ['Caçamba Traçado', 'Caçamba Truckado', 'Caçamba Toco', 'Caminhão Pipa', 'Caminhão Tanque', 'Cavalo', 'Caminhão carroceria', 'Bitruck', 'Caçamba Bitruck'],
    'Caminhões de Trecho': ['Caminhão Prancha', 'Caminhões Prancha'], 
    'Máquinas Pesadas': ['Rolo', 'Motoniveladora', 'Escavadeira', 'Fresadora', 'Pá Carregadeira', 'Trator', 'Trator de Esteiras', 'Retroescavadeira']
};

export const extraObraOptions = ['Administração', 'Oficina', 'Pátio', 'Rampa', 'Diversos'];
export const operationalSubGroups = ['Administrativo', 'Oficina', 'Operacional', 'Supervisor'];
export const equipmentTypesForHours = ['Caminhão', 'Escavadeira', 'Rolo', 'Retroescavadeira', 'Pá Carregadeira', 'Motoniveladora', 'Trator', 'Trator de Esteiras'];

/**
 * Define quais tipos de leitura são permitidos para inserção de dados.
 */
export const getAllowedReadingTypes = (vehicleType) => {
    const group = Object.keys(vehicleGroups).find(key => vehicleGroups[key].includes(vehicleType));

    if (group === 'Caminhões') return ['horimetro']; 
    if (group === 'Caminhões de Trecho') return ['odometro'];
    if (group === 'Máquinas Pesadas') return ['horimetro'];

    return ['odometro'];
};

/**
 * Retorna a leitura principal (Valor, Unidade e Label) de forma robusta.
 */
export const getVehicleMainReading = (vehicle) => {
    if (!vehicle) return { value: 0, unit: '', label: 'N/A', raw: 0 };

    const tipo = vehicle.tipo || '';
    // Verifica variação de plural/singular para Caminhões Prancha (Exceção Km)
    const isCaminhaoDeTrecho = vehicleGroups['Caminhões de Trecho'].includes(tipo) || tipo === 'Caminhões Prancha' || tipo === 'Caminhão Prancha';
    
    if (isCaminhaoDeTrecho) {
        return { value: vehicle.odometro, unit: 'Km', label: 'Odômetro', raw: parseFloat(vehicle.odometro || 0) };
    }

    const groupName = Object.keys(vehicleGroups).find(group => vehicleGroups[group].includes(tipo));

    // MÁQUINAS E CAMINHÕES (PADRÃO) -> HORAS
    if (groupName === 'Máquinas Pesadas') {
        // Prioriza digital, depois analógico, depois o campo genérico
        const val = vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro;
        return { value: val, unit: 'Hr', label: 'Horímetro', raw: parseFloat(val || 0) };
    }

    if (groupName === 'Caminhões') {
        return { value: vehicle.horimetro, unit: 'Hr', label: 'Horímetro', raw: parseFloat(vehicle.horimetro || 0) };
    }

    // VEÍCULOS LEVES / PADRÃO -> KM
    return { value: vehicle.odometro, unit: 'Km', label: 'Odômetro', raw: parseFloat(vehicle.odometro || 0) };
};

/**
 * FUNÇÃO CENTRAL DE VALIDAÇÃO DE RESTRIÇÕES (Atualizada e Robusta)
 * Verifica bloqueios manuais, revisões (Data/Km/Hr) e documentos.
 */
export const checkVehicleRestrictions = (vehicle, revisions = []) => {
    const issues = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Zera hora para comparação justa de datas
    
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    // 1. Bloqueio Manual (Checkbox "Não Pode Circular")
    // Robustez: Verifica 0 (number), false (boolean) e '0' (string)
    const isBlocked = vehicle.canCirculate === false || vehicle.canCirculate === 0 || vehicle.canCirculate === '0';
    if (isBlocked) {
        issues.push({ type: 'bloqueio', message: "BLOQUEIO MANUAL: Veículo marcado como 'NÃO PODE CIRCULAR'." });
    }

    // 2. Revisões
    // Encontra a revisão ativa para o veículo
    const revision = revisions.find(r => r.vehicleId === vehicle.id);
    
    if (revision) {
        // --- Validação por DATA ---
        if (revision.proximaRevisaoData) {
            const revDate = new Date(revision.proximaRevisaoData);
            revDate.setHours(0, 0, 0, 0);
            // Ajuste de timezone simples se necessário, mas mantendo raw date
            
            const avisoDias = parseInt(revision.avisoAntecedenciaDias || 0);
            const dataAviso = new Date(revDate);
            dataAviso.setDate(dataAviso.getDate() - avisoDias);

            if (now >= revDate) {
                issues.push({ type: 'vencido', message: `REVISÃO VENCIDA: Data limite era ${revDate.toLocaleDateString('pt-BR')}.` });
            } else if (avisoDias > 0 && now >= dataAviso) {
                issues.push({ type: 'aviso', message: `Revisão PRÓXIMA: Vence em ${revDate.toLocaleDateString('pt-BR')}.` });
            }
        }

        // --- Validação por LEITURA (Km/Hr) ---
        const readingInfo = getVehicleMainReading(vehicle);
        const unit = readingInfo.unit; // 'Km' ou 'Hr'
        const currentReading = readingInfo.raw;

        // Lógica inteligente para buscar o valor alvo correto
        let proximaLeitura = 0;
        
        if (unit === 'Hr') {
            // Se é máquina/caminhão, tenta pegar o valor de Horas primeiro
            proximaLeitura = parseFloat(revision.proximaRevisaoHorimetro || 0);
            
            // Fallback: Se proximaRevisaoHorimetro for 0 ou nulo, verifica se o usuário salvou em Odometro por engano
            // (Comum em sistemas migrados onde 'odometro' era campo genérico)
            if (proximaLeitura === 0 && revision.proximaRevisaoOdometro > 0) {
                proximaLeitura = parseFloat(revision.proximaRevisaoOdometro);
            }
        } else {
            // Veículos leves e Prancha
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

    // 3. Documentos (Apenas para Caminhões e Caminhões de Trecho)
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
                // Adiciona 12h para evitar bugs de fuso horário na conversão
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