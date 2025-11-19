// src/utils/vehicleRules.js
// ESTE ARQUIVO É A FONTE DA VERDADE PARA REGRAS DE NEGÓCIO DE VEÍCULOS

export const vehicleGroups = {
    'Veículos Leves': ['Camionete', 'Automóvel', 'Moto', 'Utilitário'],
    'Caminhões': ['Caçamba Traçado', 'Caçamba Truckado', 'Caçamba Toco', 'Caminhão Pipa', 'Caminhão Tanque', 'Cavalo', 'Caminhão carroceria', 'Bitruck', 'Caçamba Bitruck'],
    'Caminhões de Trecho': ['Caminhão Prancha', 'Caminhões Prancha'], // NOVO GRUPO: Exceção que usa Km
    'Máquinas Pesadas': ['Rolo', 'Motoniveladora', 'Escavadeira', 'Fresadora', 'Pá Carregadeira', 'Trator', 'Trator de Esteiras', 'Retroescavadeira']
};

export const extraObraOptions = ['Administração', 'Oficina', 'Pátio', 'Rampa', 'Diversos'];
export const operationalSubGroups = ['Administrativo', 'Oficina', 'Operacional', 'Supervisor'];
export const equipmentTypesForHours = ['Caminhão', 'Escavadeira', 'Rolo', 'Retroescavadeira', 'Pá Carregadeira', 'Motoniveladora', 'Trator', 'Trator de Esteiras'];

/**
 * Determina a leitura principal (Km ou Hr) de um veículo baseado nas regras de negócio da MAK.
 * HIERARQUIA DE DECISÃO:
 * 1. Caminhões de Trecho (Prancha) -> SEMPRE Odômetro (Km)
 * 2. Máquinas Pesadas -> Horímetro (Digital > Analógico > Genérico)
 * 3. Caminhões -> Horímetro (Hr)
 * 4. Veículos Leves e Padrão -> Odômetro (Km)
 */
export const getVehicleMainReading = (vehicle) => {
    if (!vehicle) return { value: 0, unit: '', label: 'N/A', raw: 0 };

    const tipo = vehicle.tipo || '';
    
    // REGRA 1: Exceção Prioritária - Caminhões de Trecho
    // Verifica explicitamente os tipos definidos no grupo "Caminhões de Trecho"
    const isCaminhaoDeTrecho = vehicleGroups['Caminhões de Trecho'].includes(tipo);
    
    if (isCaminhaoDeTrecho) {
        return { 
            value: vehicle.odometro, 
            unit: 'Km', 
            label: 'Odômetro', 
            raw: parseFloat(vehicle.odometro || 0) 
        };
    }

    // Identifica o grupo do veículo
    const groupName = Object.keys(vehicleGroups).find(group => vehicleGroups[group].includes(tipo));

    // REGRA 2: Máquinas Pesadas
    if (groupName === 'Máquinas Pesadas') {
        // Prioridade: Digital > Analógico > Campo legado
        const val = vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro;
        return { 
            value: val, 
            unit: 'Hr', 
            label: 'Horímetro', 
            raw: parseFloat(val || 0) 
        };
    }

    // REGRA 3: Caminhões (Padrão)
    if (groupName === 'Caminhões') {
        return { 
            value: vehicle.horimetro, 
            unit: 'Hr', 
            label: 'Horímetro', 
            raw: parseFloat(vehicle.horimetro || 0) 
        };
    }

    // REGRA 4: Veículos Leves e Default (Fallback)
    return { 
        value: vehicle.odometro, 
        unit: 'Km', 
        label: 'Odômetro', 
        raw: parseFloat(vehicle.odometro || 0) 
    };
};