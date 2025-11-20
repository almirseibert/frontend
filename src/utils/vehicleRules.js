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
 * Retorna a leitura principal (Valor, Unidade e Label)
 */
export const getVehicleMainReading = (vehicle) => {
    if (!vehicle) return { value: 0, unit: '', label: 'N/A', raw: 0 };

    const tipo = vehicle.tipo || '';
    // Verifica variação de plural/singular
    const isCaminhaoDeTrecho = vehicleGroups['Caminhões de Trecho'].includes(tipo);
    
    if (isCaminhaoDeTrecho) {
        return { value: vehicle.odometro, unit: 'Km', label: 'Odômetro', raw: parseFloat(vehicle.odometro || 0) };
    }

    const groupName = Object.keys(vehicleGroups).find(group => vehicleGroups[group].includes(tipo));

    if (groupName === 'Máquinas Pesadas') {
        const val = vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro;
        return { value: val, unit: 'Hr', label: 'Horímetro', raw: parseFloat(val || 0) };
    }

    if (groupName === 'Caminhões') {
        return { value: vehicle.horimetro, unit: 'Hr', label: 'Horímetro', raw: parseFloat(vehicle.horimetro || 0) };
    }

    return { value: vehicle.odometro, unit: 'Km', label: 'Odômetro', raw: parseFloat(vehicle.odometro || 0) };
};

/**
 * FUNÇÃO CENTRAL DE VALIDAÇÃO DE RESTRIÇÕES
 * Retorna uma lista de problemas encontrados (vencimentos, avisos, bloqueios).
 * Usada tanto na listagem (cores) quanto nos modais (senha).
 */
export const checkVehicleRestrictions = (vehicle, revisions = []) => {
    const issues = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Zera hora para comparação justa de datas
    
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    // 1. Bloqueio Manual (Checkbox "Não Pode Circular")
    if (vehicle.canCirculate === false) {
        issues.push({ type: 'bloqueio', message: "Veículo marcado como 'NÃO PODE CIRCULAR'." });
    }

    // 2. Revisões
    const revision = revisions.find(r => r.vehicleId === vehicle.id);
    if (revision) {
        // --- Validação por DATA ---
        if (revision.proximaRevisaoData) {
            const revDate = new Date(revision.proximaRevisaoData);
            revDate.setHours(0, 0, 0, 0);
            
            const avisoDias = parseInt(revision.avisoAntecedenciaDias || 0);
            const dataAviso = new Date(revDate);
            dataAviso.setDate(dataAviso.getDate() - avisoDias);

            if (now >= revDate) {
                issues.push({ type: 'vencido', message: `Revisão VENCIDA por data (${revDate.toLocaleDateString('pt-BR')}).` });
            } else if (avisoDias > 0 && now >= dataAviso) {
                issues.push({ type: 'aviso', message: `Revisão PRÓXIMA do vencimento por data (${revDate.toLocaleDateString('pt-BR')}).` });
            }
        }

        // --- Validação por LEITURA (Km/Hr) ---
        const proximoOdo = parseFloat(revision.proximaRevisaoOdometro || 0);
        const avisoKmHr = parseFloat(revision.avisoAntecedenciaKmHr || 0);
        
        // Obtém a leitura correta (Km ou Hr) usando a regra central
        const currentReading = getVehicleMainReading(vehicle).raw;

        if (proximoOdo > 0) {
            if (currentReading >= proximoOdo) {
                issues.push({ type: 'vencido', message: `Revisão VENCIDA por leitura (Atual: ${currentReading} / Meta: ${proximoOdo}).` });
            } else if (avisoKmHr > 0 && currentReading >= (proximoOdo - avisoKmHr)) {
                issues.push({ type: 'aviso', message: `Revisão PRÓXIMA do vencimento (Faltam ${proximoOdo - currentReading}).` });
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
                // Adiciona 12h para evitar bugs de fuso horário
                const compareDate = new Date(d); 
                compareDate.setHours(12);

                if (now > compareDate) {
                    issues.push({ type: 'vencido', message: `Documento ${doc.name} VENCIDO.` });
                } else if (compareDate <= thirtyDaysFromNow) {
                    issues.push({ type: 'aviso', message: `Documento ${doc.name} próximo do vencimento.` });
                }
            }
        });
    }

    return issues;
};