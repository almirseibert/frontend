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
 * Define quais tipos de leitura são permitidos para inserção de dados para cada grupo.
 * Usado em Modais de Cadastro, Abastecimento, etc.
 */
export const getAllowedReadingTypes = (vehicleType) => {
    // Encontra o grupo do veículo
    const group = Object.keys(vehicleGroups).find(key => vehicleGroups[key].includes(vehicleType));

    // REGRA: Caminhões (Exceto de Trecho) só usam Horímetro
    if (group === 'Caminhões') {
        return ['horimetro']; 
    }
    
    // REGRA: Caminhões de Trecho só usam Odômetro
    if (group === 'Caminhões de Trecho') {
        return ['odometro'];
    }

    // REGRA: Máquinas Pesadas usam Horímetro
    if (group === 'Máquinas Pesadas') {
        return ['horimetro'];
    }

    // Padrão (Leves, etc)
    return ['odometro'];
};

export const getVehicleMainReading = (vehicle) => {
    if (!vehicle) return { value: 0, unit: '', label: 'N/A', raw: 0 };

    const tipo = vehicle.tipo || '';
    
    // REGRA 1: Exceção Prioritária - Caminhões de Trecho
    const isCaminhaoDeTrecho = vehicleGroups['Caminhões de Trecho'].includes(tipo);
    
    if (isCaminhaoDeTrecho) {
        return { 
            value: vehicle.odometro, 
            unit: 'Km', 
            label: 'Odômetro', 
            raw: parseFloat(vehicle.odometro || 0) 
        };
    }

    const groupName = Object.keys(vehicleGroups).find(group => vehicleGroups[group].includes(tipo));

    // REGRA 2: Máquinas Pesadas
    if (groupName === 'Máquinas Pesadas') {
        const val = vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro;
        return { 
            value: val, 
            unit: 'Hr', 
            label: 'Horímetro', 
            raw: parseFloat(val || 0) 
        };
    }

    // REGRA 3: Caminhões (Padrão) -> USA HORÍMETRO
    if (groupName === 'Caminhões') {
        return { 
            value: vehicle.horimetro, 
            unit: 'Hr', 
            label: 'Horímetro', 
            raw: parseFloat(vehicle.horimetro || 0) 
        };
    }

    // REGRA 4: Veículos Leves e Default
    return { 
        value: vehicle.odometro, 
        unit: 'Km', 
        label: 'Odômetro', 
        raw: parseFloat(vehicle.odometro || 0) 
    };
};