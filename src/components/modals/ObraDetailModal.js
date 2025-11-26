import React, { useState, useMemo } from 'react';
import { X, Loader, Edit } from 'lucide-react';
import ProtectedComponent from '../ProtectedComponent';

// --- COMPONENTES AUXILIARES INTERNOS ---

const ProgressBar = ({ value, max, color = 'bg-yellow-400' }) => {
    const percentage = max > 0 ? (value / max) * 100 : 0;
    const displayValue = isFinite(value) ? value.toFixed(1) : '0.0';
    const displayMax = isFinite(max) ? max.toFixed(1) : '0.0';
    const displayPercentage = isFinite(percentage) ? percentage.toFixed(0) : '0';

    return (
         <div className="w-full bg-gray-200 rounded-full h-6 relative overflow-hidden my-1">
            <div
                className={`h-full ${color} rounded-full flex items-center justify-start px-2 transition-all duration-500`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
            >
            </div>
            <div className="absolute inset-0 flex items-center justify-between px-2 text-xs font-bold text-gray-900">
                <span className={percentage > 10 ? 'opacity-100' : 'opacity-0'}>{displayValue}</span>
                <span className="absolute left-1/2 -translate-x-1/2">{displayPercentage}%</span>
                <span className={percentage < 90 ? 'opacity-100' : 'opacity-0'}>{displayMax}</span>
            </div>
        </div>
    );
};

const EditActiveVehicleAssignmentModal = ({ assignment, vehicle, employees = [], onClose, onSave, setAlertMessage }) => {
    const [editedData, setEditedData] = useState({
        dataEntrada: assignment?.dataEntrada ? new Date(assignment.dataEntrada).toISOString().split('T')[0] : '',
        employeeId: assignment?.employeeId || '',
        leituraEntrada: assignment?.horimetroEntrada ?? assignment?.odometroEntrada ?? '',
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEditedData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async () => {
        const leitura = parseFloat(editedData.leituraEntrada);
        if (!editedData.dataEntrada || !editedData.employeeId || isNaN(leitura)) {
             setAlertMessage("Preencha Data, Operador e Leitura Inicial válidos.");
             return;
        }

        setIsSaving(true);
        try {
            await onSave(vehicle.id, assignment.id, editedData);
            onClose();
        } catch (error) {
            // Tratado no pai
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                 <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Editar Alocação Ativa</h2>
                     <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                 </div>
                 <div className="p-6 space-y-4">
                    <p className="text-sm font-medium text-gray-700">{vehicle?.registroInterno} - {vehicle?.modelo}</p>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Início na obra *</label>
                        <input type="date" name="dataEntrada" value={editedData.dataEntrada} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm" required />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Operador *</label>
                        <select name="employeeId" value={editedData.employeeId} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm bg-white" required>
                             <option value="">Selecione...</option>
                             {(employees || []).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.nome}</option>
                             ))}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Leitura Inicial (Horímetro/Odômetro) *</label>
                        <input type="number" step="0.1" name="leituraEntrada" value={editedData.leituraEntrada} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm" required/>
                    </div>
                 </div>
                 <div className="p-4 bg-gray-50 border-t flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Cancelar</button>
                    <button onClick={handleSubmit} disabled={isSaving} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-green-400 flex items-center justify-center gap-2 text-sm">
                        {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const EditPastVehicleAssignmentModal = ({ assignment, vehicle, employees = [], onClose, onSave, setAlertMessage }) => {
    const [editedData, setEditedData] = useState({
        dataEntrada: assignment?.dataEntrada ? new Date(assignment.dataEntrada).toISOString().split('T')[0] : '',
        dataSaida: assignment?.dataSaida ? new Date(assignment.dataSaida).toISOString().split('T')[0] : '',
        employeeId: assignment?.employeeId || '',
        leituraEntrada: assignment?.horimetroEntrada ?? assignment?.odometroEntrada ?? '',
        leituraSaida: assignment?.horimetroSaida ?? assignment?.odometroSaida ?? '',
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEditedData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async () => {
        const leituraEnt = parseFloat(editedData.leituraEntrada);
        const leituraSai = parseFloat(editedData.leituraSaida);

        if (!editedData.dataEntrada || !editedData.dataSaida || isNaN(leituraEnt) || isNaN(leituraSai)) {
            setAlertMessage("Preencha todas as datas e leituras válidas.");
            return;
        }
        if (leituraSai < leituraEnt) {
             setAlertMessage("Leitura final não pode ser menor que a inicial.");
             return;
        }
        if (new Date(editedData.dataSaida) < new Date(editedData.dataEntrada)) {
             setAlertMessage("Data final não pode ser anterior à data inicial.");
             return;
        }

        setIsSaving(true);
        try {
            await onSave(vehicle.id, assignment.id, editedData);
            onClose();
        } catch (error) {
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                 <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Editar Histórico do Veículo</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                 </div>
                 <div className="p-6 space-y-4">
                    <p className="text-sm font-medium text-gray-700">{vehicle?.registroInterno} - {vehicle?.modelo}</p>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Início na obra *</label>
                            <input type="date" name="dataEntrada" value={editedData.dataEntrada} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm" required/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Fim na obra *</label>
                            <input type="date" name="dataSaida" value={editedData.dataSaida} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm" required/>
                        </div>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Operador</label>
                         <select name="employeeId" value={editedData.employeeId} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm bg-white">
                             <option value="">Selecione...</option>
                             {(employees || []).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.nome}</option>
                             ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Leitura Inicial *</label>
                            <input type="number" step="0.1" name="leituraEntrada" value={editedData.leituraEntrada} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm" required/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Leitura Final *</label>
                            <input type="number" step="0.1" name="leituraSaida" value={editedData.leituraSaida} onChange={handleInputChange} className="w-full p-2 border rounded mt-1 text-sm" required/>
                        </div>
                    </div>
                 </div>
                 <div className="p-4 bg-gray-50 border-t flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Cancelar</button>
                    <button onClick={handleSubmit} disabled={isSaving} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-green-400 flex items-center justify-center gap-2 text-sm">
                        {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPAL DO MODAL DE DETALHES ---

const ObraDetailModal = ({ user, obra, vehicles = [], onClose, setAlertMessage, equipmentTypesForHours = [], vehicleGroups = {}, employees = [], apiClient, reloadData }) => {
    const [isSaving, setIsSaving] = useState(false);
    // REMOVIDO: const [additionalTruckHours, setAdditionalTruckHours] = useState(obra?.horasAdicionaisCaminhao?.toString() || '');
    const [kmConcluidoPrancha, setKmConcluidoPrancha] = useState(obra?.kmConcluidoPrancha?.toString() || '');
    const [editedSectorsKm, setEditedSectorsKm] = useState(() =>
        (Array.isArray(obra.sectors) ? obra.sectors : [])
        .reduce((acc, s) => ({ ...acc, [s.name]: s.kmConcluido?.toString() || '' }), {})
    );
    const [updatingReadings, setUpdatingReadings] = useState({});

    const [isEditAssignmentModalOpen, setIsEditAssignmentModalOpen] = useState(false);
    const [assignmentToEdit, setAssignmentToEdit] = useState(null);
    const [isEditPastAssignmentModalOpen, setIsEditPastAssignmentModalOpen] = useState(false);
    const [pastAssignmentToEdit, setPastAssignmentToEdit] = useState(null);

    const { activeVehicles, pastVehicles } = useMemo(() => {
        const historico = Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : [];
        const active = historico.filter(h => !h.dataSaida)
            .map(h => ({ ...h, vehicleRegistroInterno: vehicles.find(v => v.id === h.veiculoId)?.registroInterno || 'N/A' }))
            .sort((a, b) => (a.vehicleRegistroInterno || '').localeCompare(b.vehicleRegistroInterno || ''));
        const past = historico.filter(h => h.dataSaida)
             .map(h => ({ ...h, vehicleRegistroInterno: vehicles.find(v => v.id === h.veiculoId)?.registroInterno || 'N/A' }))
             .sort((a, b) => new Date(b.dataSaida) - new Date(a.dataSaida));
        return { activeVehicles: active, pastVehicles: past };
    }, [obra, vehicles]);

     const progressData = useMemo(() => {
        const data = { contratado: {}, concluido: {}, totalContratado: 0, totalConcluido: 0, totalKmContratado: 0, totalKmConcluido: 0, totalHorasCaminhoes: 0, totalHorasMaquinas: 0 };
        const currentContractType = obra.contractType || 'horas';
        const historico = Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : [];

        if (currentContractType === 'horas') {
             (equipmentTypesForHours || []).forEach(type => {
                const contracted = parseFloat(obra.horasContratadasPorTipo?.[type] || 0);
                data.contratado[type] = contracted;
                data.totalContratado += contracted;
                data.concluido[type] = 0;
            });

            historico.forEach(h => {
                const vehicle = vehicles.find(v => v.id === h.veiculoId);
                if (!vehicle) return;
                const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
                if (vehicleGroup === 'Veículos Leves') return;

                let startReading = parseFloat(h.horimetroEntrada ?? h.odometroEntrada ?? 0);
                let endReading = parseFloat(h.horimetroSaida ?? h.odometroSaida ?? 0);

                if (!h.dataSaida) {
                     const updatedReadingStr = updatingReadings[h.veiculoId];
                     if (updatedReadingStr !== undefined && updatedReadingStr !== '') {
                         endReading = parseFloat(updatedReadingStr) || 0;
                     } else {
                         if (vehicleGroup === 'Máquinas Pesadas') {
                            endReading = parseFloat(vehicle.possuiHorimetroAnalogico ? vehicle.horimetroAnalogico : vehicle.horimetroDigital) || 0;
                         } else if (vehicleGroup === 'Caminhões') {
                            endReading = parseFloat(vehicle.horimetro) || 0;
                         }
                         else if (h.odometroEntrada != null) {
                              endReading = parseFloat(vehicle.odometro) || 0;
                         }
                     }
                }

                if (endReading >= startReading) {
                    const hours = endReading - startReading;
                     const equipType = (equipmentTypesForHours || []).find(t => vehicle.tipo === t);
                     if (equipType) {
                        data.concluido[equipType] = (data.concluido[equipType] || 0) + hours;
                    }
                }
            });

            // Lógica de horas adicionais de caminhão REMOVIDA, mantendo apenas o que vier do backend se necessário (neste caso, assume-se 0 para cálculo manual)
            const truckHours = 0; // Removido campo manual
            
            if (data.concluido['Caminhão'] !== undefined) {
                 data.concluido['Caminhão'] += truckHours;
             }
             // Se 'Caminhão' não estiver em equipmentTypesForHours (foi filtrado), ele não aparecerá no concluído.
             // Se desejar mostrar horas de caminhão mesmo sem contrato, precisaria de lógica extra, mas seguirei a regra de exclusão.

            data.totalHorasCaminhoes = data.concluido['Caminhão'] || 0;
            data.totalHorasMaquinas = Object.entries(data.concluido).reduce((sum, [type, hours]) => type !== 'Caminhão' ? sum + (hours || 0) : sum, 0);
            data.totalConcluido = data.totalHorasCaminhoes + data.totalHorasMaquinas;

        } else if (currentContractType === 'metrosQuadrados') {
             (Array.isArray(obra.sectors) ? obra.sectors : []).forEach(sector => {
                const contracted = parseFloat(sector.kmContratado || 0);
                const concluded = parseFloat(editedSectorsKm[sector.name] ?? 0);
                data.totalKmContratado += contracted;
                data.totalKmConcluido += concluded;
            });
        }
        return data;
    }, [obra, vehicles, equipmentTypesForHours, vehicleGroups, kmConcluidoPrancha, editedSectorsKm, updatingReadings]);

    const handleReadingChange = (vehicleId, value) => setUpdatingReadings(prev => ({ ...prev, [vehicleId]: value }));
    const openEditAssignmentModal = (assignment) => { setAssignmentToEdit(assignment); setIsEditAssignmentModalOpen(true); };
    const openEditPastAssignmentModal = (assignment) => { setPastAssignmentToEdit(assignment); setIsEditPastAssignmentModalOpen(true); };
    const handleSectorKmChange = (sectorName, value) => setEditedSectorsKm(prev => ({ ...prev, [sectorName]: value }));

    const handleSaveAssignmentEdit = async (vehicleId, historyEntryId, editedData) => {
        setIsSaving(true);
        try {
            await apiClient.updateObraHistoryEntry(obra.id, historyEntryId, editedData);
            setAlertMessage("Alocação ativa atualizada com sucesso!");
            reloadData();
            setIsEditAssignmentModalOpen(false);
        } catch (error) {
            console.error("Erro ao salvar alocação ativa:", error);
            setAlertMessage(error.message || "Falha ao atualizar alocação ativa.");
            throw error;
        } finally {
            setIsSaving(false);
        }
    };

    const handleSavePastAssignmentEdit = async (vehicleId, historyEntryId, editedData) => {
        setIsSaving(true);
        try {
            await apiClient.updateObraHistoryEntry(obra.id, historyEntryId, editedData);
            setAlertMessage("Histórico atualizado com sucesso!");
            reloadData();
            setIsEditPastAssignmentModalOpen(false);
        } catch (error) {
            console.error("Erro ao salvar histórico:", error);
            setAlertMessage(error.message || "Falha ao atualizar histórico.");
            throw error;
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        let obraUpdatePayload = {};
        let vehicleUpdates = [];

        // REMOVIDO: Lógica de additionalTruckHours

        const newPranchaKm = parseFloat(kmConcluidoPrancha) || 0;
        if (newPranchaKm !== (obra.kmConcluidoPrancha || 0)) {
            obraUpdatePayload.kmConcluidoPrancha = newPranchaKm;
        }

        if (obra.contractType === 'metrosQuadrados') {
            let sectorsChanged = false;
            const currentSectors = Array.isArray(obra.sectors) ? obra.sectors : [];
            const updatedSectors = currentSectors.map(sector => {
                const currentKm = parseFloat(sector.kmConcluido || 0);
                const newKm = parseFloat(editedSectorsKm[sector.name] ?? currentKm);

                if (newKm !== currentKm) {
                    sectorsChanged = true;
                    return { ...sector, kmConcluido: newKm };
                }
                return sector;
            });
            if (sectorsChanged) {
                obraUpdatePayload.sectors = updatedSectors;
            }
        }

        Object.entries(updatingReadings).forEach(([vehicleId, newReadingStr]) => {
             if (newReadingStr !== undefined && newReadingStr !== '') {
                 const newReading = parseFloat(newReadingStr);
                 const vehicle = vehicles.find(v => v.id === vehicleId);
                 if (vehicle && !isNaN(newReading)) {
                     const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
                     const updateData = {};
                     if (vehicleGroup === 'Máquinas Pesadas') {
                         if (vehicle.possuiHorimetroAnalogico && newReading !== (parseFloat(vehicle.horimetroAnalogico) || 0)) updateData.horimetroAnalogico = newReading;
                         else if (!vehicle.possuiHorimetroAnalogico && newReading !== (parseFloat(vehicle.horimetroDigital) || 0)) updateData.horimetroDigital = newReading;
                     } else if (vehicleGroup === 'Caminhões' && newReading !== (parseFloat(vehicle.horimetro) || 0)) {
                         updateData.horimetro = newReading;
                     } else if (vehicleGroup === 'Veículos Leves' && newReading !== (parseFloat(vehicle.odometro) || 0)) {
                          updateData.odometro = newReading;
                     }

                     if (Object.keys(updateData).length > 0) {
                         vehicleUpdates.push({ id: vehicleId, data: updateData });
                     }
                 }
             }
        });

        if (Object.keys(obraUpdatePayload).length === 0 && vehicleUpdates.length === 0) {
             setAlertMessage("Nenhuma alteração para salvar.");
             setIsSaving(false);
             return;
        }

        try {
            const promises = [];
            if (Object.keys(obraUpdatePayload).length > 0) {
                promises.push(apiClient.updateObra(obra.id, obraUpdatePayload));
            }
            vehicleUpdates.forEach(update => {
                promises.push(apiClient.updateVehicle(update.id, update.data));
            });

            await Promise.all(promises);

            setAlertMessage("Alterações salvas com sucesso!");
            setUpdatingReadings({});
            reloadData();
        } catch (error) {
            console.error("Erro ao salvar alterações:", error);
            setAlertMessage(error.message || "Ocorreu um erro ao salvar as alterações.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[95vh] flex flex-col my-auto">
                <div className="p-4 sm:p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold">{obra.nome}</h2>
                        <p className="text-gray-500 text-sm">Status: <span className={`font-medium ${obra.status === 'ativa' ? 'text-green-600' : 'text-red-600'}`}>{obra.status === 'ativa' ? 'Ativa' : 'Finalizada'}</span></p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={20}/></button>
                </div>

                <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-6 text-sm">

                    <div className="bg-gray-50 p-4 rounded-lg border">
                        <h3 className="text-base font-semibold mb-3 text-gray-800">Progresso</h3>
                        <div className="space-y-3">
                             {(obra.contractType || 'horas') === 'horas' && (
                                <>
                                    <div className="flex justify-between mb-1 text-xs font-medium">
                                        <span>Progresso Total (Horas)</span>
                                        <span>{progressData.totalConcluido.toFixed(1)} / {progressData.totalContratado.toFixed(1)} hrs</span>
                                    </div>
                                    <ProgressBar value={progressData.totalConcluido} max={progressData.totalContratado} />
                                    {obra.kmContratadoPrancha > 0 && (
                                        <div className="mt-2">
                                            <div className="flex justify-between mb-1 text-[11px] font-medium text-gray-600">
                                                <span>Desloc. Prancha (Km)</span>
                                                <span>{(parseFloat(kmConcluidoPrancha) || 0).toFixed(1)} / {(obra.kmContratadoPrancha || 0).toFixed(1)} Km</span>
                                            </div>
                                            <ProgressBar value={parseFloat(kmConcluidoPrancha) || 0} max={obra.kmContratadoPrancha || 0} color="bg-blue-400" />
                                        </div>
                                    )}
                                    <div className="space-y-1 pt-3 mt-3 border-t">
                                        <h4 className="text-xs font-semibold text-gray-700">Detalhes por Equipamento:</h4>
                                         {(equipmentTypesForHours || []).map(type => {
                                            const contratado = progressData.contratado[type];
                                            const concluido = progressData.concluido[type] || 0;
                                            if (contratado > 0 || concluido > 0) {
                                                return (
                                                    <div key={type}>
                                                        <div className="flex justify-between mb-0.5 text-[11px] font-medium">
                                                            <span>{type}</span>
                                                            <span>{concluido.toFixed(1)} / {contratado.toFixed(1)} hrs</span>
                                                        </div>
                                                        <ProgressBar value={concluido} max={contratado} color="bg-blue-300" />
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })}
                                    </div>
                                </>
                            )}
                             {(obra.contractType || 'horas') === 'metrosQuadrados' && (
                                <>
                                    <div className="flex justify-between mb-1 text-xs font-medium">
                                        <span>Progresso Total (Km)</span>
                                        <span>{progressData.totalKmConcluido.toFixed(1)} / {progressData.totalKmContratado.toFixed(1)} Km</span>
                                    </div>
                                    <ProgressBar value={progressData.totalKmConcluido} max={progressData.totalKmContratado} color="bg-green-400" />
                                     {obra.kmContratadoPrancha > 0 && (
                                        <div className="mt-2">
                                            <div className="flex justify-between mb-1 text-[11px] font-medium text-gray-600">
                                                <span>Desloc. Prancha (Km)</span>
                                                <span>{(parseFloat(kmConcluidoPrancha) || 0).toFixed(1)} / {(obra.kmContratadoPrancha || 0).toFixed(1)} Km</span>
                                            </div>
                                            <ProgressBar value={parseFloat(kmConcluidoPrancha) || 0} max={obra.kmContratadoPrancha || 0} color="bg-blue-400" />
                                        </div>
                                    )}
                                    <div className="space-y-1 pt-3 mt-3 border-t">
                                        <h4 className="text-xs font-semibold text-gray-700">Progresso por Setor (Km):</h4>
                                        {(Array.isArray(obra.sectors) ? obra.sectors : []).length > 0 ? (Array.isArray(obra.sectors) ? obra.sectors : []).map(sector => {
                                            const contracted = parseFloat(sector.kmContratado || 0);
                                            const concluded = parseFloat(editedSectorsKm[sector.name] ?? 0);
                                            return (
                                                <div key={sector.name}>
                                                    <div className="flex justify-between mb-0.5 text-[11px] font-medium">
                                                        <span>{sector.name}</span>
                                                        <span>{concluded.toFixed(1)} / {contracted.toFixed(1)} Km</span>
                                                    </div>
                                                    <ProgressBar value={concluded} max={contracted} color="bg-green-300" />
                                                </div>
                                            );
                                        }) : <p className="text-[11px] text-gray-500 italic">Nenhum setor definido.</p>}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <ProtectedComponent requiredPermission="editor">
                         <div className="p-4 border rounded-lg space-y-3 bg-gray-50">
                            <h3 className="text-base font-semibold text-gray-800">Atualizações Manuais</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {(obra.contractType || 'horas') === 'horas' && (
                                    <>
                                        {/* REMOVIDO: Campo de Horas Adicionais Caminhão */}
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700">Km Concluído Caminhão Prancha</label>
                                            <input type="number" step="0.1" value={kmConcluidoPrancha} onChange={(e) => setKmConcluidoPrancha(e.target.value)} className="w-full p-1.5 border rounded mt-1 text-sm" placeholder="Ex: 120" />
                                        </div>
                                    </>
                                )}
                                {(obra.contractType || 'horas') === 'metrosQuadrados' && (Array.isArray(obra.sectors) ? obra.sectors : []).length > 0 && (
                                    <div className="col-span-full space-y-2">
                                        <h4 className="text-xs font-medium text-gray-700">Atualizar Km Concluído por Setor:</h4>
                                        {(Array.isArray(obra.sectors) ? obra.sectors : []).map((sector) => (
                                            <div key={sector.name} className="flex items-center gap-2">
                                                <label className="block text-xs font-medium text-gray-700 w-1/2 sm:w-1/3">{sector.name} (Km)</label>
                                                <input type="number" step="0.1" value={editedSectorsKm[sector.name]} onChange={(e) => handleSectorKmChange(sector.name, e.target.value)} className="flex-1 p-1.5 border rounded text-sm" placeholder={sector.kmConcluido?.toString() || '0'}/>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                         </div>
                    </ProtectedComponent>

                    <div>
                        <h3 className="text-base font-semibold mb-2 text-gray-800">Veículos Ativos na Obra</h3>
                         <div className="space-y-2">
                            {activeVehicles.length > 0 ? activeVehicles.map(h => {
                                const vehicle = vehicles.find(v => v.id === h.veiculoId);
                                if (!vehicle) return <div key={h.veiculoId || h.dataEntrada} className="p-2 bg-red-50 text-red-700 text-xs rounded">Veículo ID {h.veiculoId} não encontrado.</div>;

                                const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
                                let currentReading = 0;
                                let readingLabel = '';
                                if (vehicleGroup === 'Máquinas Pesadas') {
                                    currentReading = parseFloat(vehicle.possuiHorimetroAnalogico ? vehicle.horimetroAnalogico : vehicle.horimetroDigital) || 0;
                                    readingLabel = 'Horímetro';
                                } else if (vehicleGroup === 'Caminhões') {
                                    currentReading = parseFloat(vehicle.horimetro) || 0;
                                    readingLabel = 'Horímetro';
                                } else { 
                                    currentReading = parseFloat(vehicle.odometro) || 0;
                                    readingLabel = 'Odômetro';
                                }

                                const initialReading = parseFloat(h.horimetroEntrada ?? h.odometroEntrada ?? 0);
                                const readingInState = updatingReadings[h.veiculoId];
                                const readingToCalculate = (readingInState !== undefined && readingInState !== '') ? (parseFloat(readingInState) || 0) : currentReading;
                                const partialReading = (readingToCalculate >= initialReading) ? (readingToCalculate - initialReading) : 0;
                                const readingUnit = (vehicleGroup === 'Veículos Leves') ? 'Km' : 'hrs';

                                return (
                                    <div key={h.veiculoId} className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-x-4 gap-y-1 items-center">
                                            <div className="font-semibold sm:col-span-1">
                                                <p>{vehicle.registroInterno} - {vehicle.modelo}</p>
                                                <p className="text-[11px] text-gray-600 font-normal">{vehicle.tipo}</p>
                                            </div>
                                            <div className="sm:col-span-1">
                                                <p><strong>Início:</strong> {h.dataEntrada ? new Date(h.dataEntrada).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</p>
                                                <p><strong>Leitura Inicial:</strong> {initialReading.toFixed(1) || 'N/A'}</p>
                                                <p><strong>Operador:</strong> {h.employeeName || 'N/A'}</p>
                                            </div>
                                             <ProtectedComponent requiredPermission="editor">
                                                <div className="flex items-center gap-1 sm:col-span-1">
                                                    <label className="text-[11px] font-medium text-gray-700 shrink-0">{readingLabel} Atual:</label>
                                                    <input type="number" step="0.1" placeholder={`${currentReading.toFixed(1)}`} value={updatingReadings[h.veiculoId] ?? ''} onChange={(e) => handleReadingChange(h.veiculoId, e.target.value)} className="flex-1 p-1 border rounded text-xs w-20"/>
                                                </div>
                                             </ProtectedComponent>
                                            <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-1 sm:col-span-1">
                                                <div className="text-right font-semibold text-blue-700 text-sm whitespace-nowrap">
                                                    Parcial: {partialReading.toFixed(1)} {readingUnit}
                                                </div>
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => openEditAssignmentModal(h)} className="p-1 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-full" title="Editar Alocação"><Edit size={12} /></button>
                                                </ProtectedComponent>
                                            </div>
                                        </div>
                                    </div>
                                )
                            }) : <p className="text-xs text-gray-500 italic">Nenhum veículo ativo nesta obra.</p>}
                         </div>
                        <ProtectedComponent requiredPermission="editor">
                             {(Object.keys(updatingReadings).length > 0 || kmConcluidoPrancha !== (obra.kmConcluidoPrancha?.toString() || '') || (obra.contractType === 'metrosQuadrados' && (Array.isArray(obra.sectors) ? obra.sectors : []).some(s => editedSectorsKm[s.name] !== (s.kmConcluido?.toString() || '')))) && (
                                <button onClick={handleSaveChanges} disabled={isSaving} className="mt-4 w-full px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-green-400 flex items-center justify-center gap-2 text-sm">
                                     {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Salvar Alterações'}
                                </button>
                            )}
                        </ProtectedComponent>
                    </div>

                    <div>
                        <h3 className="text-base font-semibold mb-2 text-gray-800">Histórico de Veículos na Obra</h3>
                        <div className="space-y-1 max-h-60 overflow-y-auto pr-1 custom-scrollbar border rounded-md p-2 bg-gray-50">
                            {pastVehicles.length > 0 ? pastVehicles.map(h => {
                                const vehicle = vehicles.find(v => v.id === h.veiculoId);
                                const isHourBased = vehicleGroups['Máquinas Pesadas']?.includes(vehicle?.tipo) || vehicleGroups['Caminhões']?.includes(vehicle?.tipo);
                                const initialReading = parseFloat(h.horimetroEntrada ?? h.odometroEntrada ?? 0);
                                const finalReading = parseFloat(h.horimetroSaida ?? h.odometroSaida ?? 0);
                                const totalReading = (finalReading >= initialReading) ? (finalReading - initialReading) : 0;
                                const readingLabel = isHourBased ? 'Horas' : 'Km';
                                return (
                                    <div key={h.id} className="p-2 bg-white rounded border text-xs">
                                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-x-2 gap-y-0.5 items-center">
                                            <div className="font-semibold sm:col-span-1">{h.registroInterno} <span className="text-gray-500 font-normal">({vehicle?.modelo})</span></div>
                                            <div className="sm:col-span-1">Início: {h.dataEntrada ? new Date(h.dataEntrada).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</div>
                                            <div className="sm:col-span-1">Fim: {h.dataSaida ? new Date(h.dataSaida).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</div>
                                            <div className="sm:col-span-1">Total: <span className="font-bold">{totalReading.toFixed(1)} {readingLabel}</span> <span className="text-gray-500">({initialReading.toFixed(1)} - {finalReading.toFixed(1)})</span></div>
                                            <div className="flex justify-end items-center sm:col-span-1 gap-1">
                                                 <span className="text-gray-600 truncate" title={h.employeeName || 'Sem operador'}>Op: {h.employeeName || 'N/A'}</span>
                                                <ProtectedComponent requiredPermission="editor">
                                                    <button onClick={() => openEditPastAssignmentModal(h)} className="p-1 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-full" title="Editar Histórico"><Edit size={12} /></button>
                                                </ProtectedComponent>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }) : <p className="text-xs text-gray-500 italic text-center py-2">Nenhum veículo anterior nesta obra.</p>}
                        </div>
                    </div>

                </div>

                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Fechar</button>
                </div>
            </div>

            {isEditAssignmentModalOpen && assignmentToEdit && (
                <EditActiveVehicleAssignmentModal
                    assignment={assignmentToEdit}
                    vehicle={vehicles.find(v => v.id === assignmentToEdit.veiculoId)}
                    employees={employees}
                    onClose={() => setIsEditAssignmentModalOpen(false)}
                    onSave={handleSaveAssignmentEdit}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    reloadData={reloadData}
                    obraId={obra.id}
                />
            )}
            {isEditPastAssignmentModalOpen && pastAssignmentToEdit && (
                <EditPastVehicleAssignmentModal
                    assignment={pastAssignmentToEdit}
                    vehicle={vehicles.find(v => v.id === pastAssignmentToEdit.veiculoId)}
                    employees={employees}
                    onClose={() => setIsEditPastAssignmentModalOpen(false)}
                    onSave={handleSavePastAssignmentEdit}
                    apiClient={apiClient}
                    setAlertMessage={setAlertMessage}
                    reloadData={reloadData}
                    obraId={obra.id}
                />
            )}
        </div>
    );
};

export default ObraDetailModal;