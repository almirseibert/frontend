// src/utils/vehicleAlerts.js
import { vehicleGroups, getVehicleMainReading } from './vehicleRules';

export const processVehiclesWithAlerts = (vehiclesData = [], revisionsData = [], finesData = []) => {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    // Pre-index for O(V+R+F) instead of O(V×R×F)
    const revisionByVehicle = new Map(revisionsData.map(r => [r.vehicleId, r]));
    const fineVehicleIds = new Set(
        finesData.filter(f => f.paymentStatus === 'Pendente').map(f => f.vehicleId)
    );

    return vehiclesData.map(vehicle => {
        let hasAlert = false;
        let alertText = '';

        if (vehicle.canCirculate === false || vehicle.canCirculate === 0 || vehicle.canCirculate === '0') {
            hasAlert = true;
            alertText = 'BLOQUEIO: O veículo não pode rodar (Doc/Manutenção).';
        }

        const revision = revisionByVehicle.get(vehicle.id);
        if (revision && !hasAlert) {
            const proximaData = revision.proximaRevisaoData ? new Date(revision.proximaRevisaoData) : null;
            const proximoOdometro = revision.proximaRevisaoOdometro;
            const proximoHorimetro = revision.proximaRevisaoHorimetro;

            const readingData = getVehicleMainReading(vehicle);
            const currentReading = readingData.raw;
            const unit = readingData.unit;

            const avisoAntecedencia = parseFloat(revision.avisoAntecedenciaKmHr || 0);
            const avisoDias = parseInt(revision.avisoAntecedenciaDias || 0);

            let metaLeitura = unit === 'Hr' ? proximoHorimetro : proximoOdometro;
            if (!metaLeitura && unit === 'Hr' && proximoOdometro) metaLeitura = proximoOdometro;

            if (proximaData && now >= proximaData) {
                hasAlert = true;
                alertText = 'Atenção: Revisão Vencida (Data)!';
            } else if (proximaData && avisoDias > 0) {
                const warningDate = new Date(proximaData);
                warningDate.setDate(warningDate.getDate() - avisoDias);
                if (now >= warningDate) {
                    hasAlert = true;
                    alertText = 'Atenção: Revisão Próxima (Data)!';
                }
            }

            if (!hasAlert && metaLeitura > 0) {
                if (currentReading >= metaLeitura) {
                    hasAlert = true;
                    alertText = `Atenção: Revisão Vencida (${unit})!`;
                } else if (avisoAntecedencia > 0 && currentReading >= (metaLeitura - avisoAntecedencia)) {
                    hasAlert = true;
                    alertText = `Atenção: Revisão Próxima (${unit})!`;
                }
            }
        }

        const isTruck = vehicleGroups['Caminhões']?.includes(vehicle.tipo) || vehicleGroups['Caminhões de Trecho']?.includes(vehicle.tipo);
        if (isTruck && !hasAlert) {
            const docs = [
                { type: 'Tacógrafo', date: vehicle.validadeTacografo },
                { type: 'AET DAER', date: vehicle.validadeAET_DAER },
                { type: 'AET DNIT', date: vehicle.validadeAET_DNIT },
            ];

            for (const doc of docs) {
                if (doc.date) {
                    const d = new Date(doc.date);
                    const compareDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                    if (now > compareDate) {
                        hasAlert = true;
                        alertText = `Atenção: ${doc.type} Vencido!`;
                        break;
                    } else if (compareDate <= thirtyDaysFromNow) {
                        hasAlert = true;
                        alertText = `Atenção: ${doc.type} Vence em breve!`;
                    }
                }
            }
        }

        if (fineVehicleIds.has(vehicle.id) && !hasAlert) {
            hasAlert = true;
            alertText = 'Atenção: Há multas pendentes para este veículo.';
        }

        return { ...vehicle, possuiAviso: hasAlert, avisoTexto: alertText };
    });
};
