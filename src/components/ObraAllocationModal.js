import React, { useState, useMemo } from 'react';
import { Loader, X } from 'lucide-react';
import FinishObraModal from './FinishObraModal'; // Importa o modal filho

// --- Modal de Alocação em Obra ---
// Extraído de VehiclePage.js
const ObraAllocationModal = ({ user, vehicle, obras = [], employees = [], onClose, setAlertMessage, apiClient, reloadData, vehicles = [], vehicleGroups = {} }) => {
    // Verifica se o veículo está atualmente alocado em obra
    const currentObraAllocation = (Array.isArray(vehicle.history) ? vehicle.history : [])
                                    .find(h => (h.type === 'obra' || h.historyType === 'obra') && !h.endDate && !h.dataSaida);

    // Estado inicial dos campos
    const [obraId, setObraId] = useState(currentObraAllocation ? vehicle.obraAtualId : '');
    const [employeeId, setEmployeeId] = useState(currentObraAllocation?.details?.employeeId || '');
    const [dataEntrada, setDataEntrada] = useState(currentObraAllocation ? new Date(currentObraAllocation.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    const [dataSaida, setDataSaida] = useState(new Date().toISOString().split('T')[0]); // Para desalocar
     // Local para onde irá após desalocar
    const [locationAfterDeallocate, setLocationAfterDeallocate] = useState('Pátio MAK Lajeado');
    const [isSaving, setIsSaving] = useState(false);

    // --- LÓGICA DE LEITURA (NOVAS REGRAS O/H) ---
    const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
    const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(vehicle.tipo));
    
    let readingType;
    if (vehicleGroup === 'Caminhões' && vehicle.tipo === 'Caminhões Prancha') {
        readingType = 'odometro'; // Exceção
    } else if (vehicleGroup === 'Caminhões' || vehicleGroup === 'Máquinas Pesadas') {
        readingType = 'horimetro'; // Padrão
    } else {
        readingType = 'odometro'; // Leves
    }
    // --- FIM NOVA REGRA ---

    const readingLabel = readingType === 'horimetro' ? 'Horímetro' : 'Odômetro';
    
    // Tenta pegar a leitura de entrada (se já alocado) ou a leitura atual do veículo
    const initialReading = currentObraAllocation
                            ? (currentObraAllocation.details?.[`${readingType}Entrada`] || '') // Leitura de entrada se já alocado
                            : (vehicle[readingType] || ''); // Leitura atual do veículo se for alocar

    const [readingValue, setReadingValue] = useState(initialReading.toString()); // Valor da leitura (entrada ou saída)

    // Filtra obras ativas e funcionários disponíveis
    const activeObras = useMemo(() => obras.filter(o => o.status === 'ativa').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);
    const availableEmployees = useMemo(() =>
        (employees || [])
            .filter(e => e.status !== 'inativo' && (e.funcao === 'Operador de Máquina' || e.funcao === 'Motorista')) // Filtra por função também
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [employees]);

    // Estados para o modal de finalização de obra (se aplicável ao desalocar)
    const [isFinishObraModalOpen, setIsFinishObraModalOpen] = useState(false);
    const [obraToFinalize, setObraToFinalize] = useState(null);


    // Função para ALOCAR
    const handleAllocate = async () => {
        const readingFloat = parseFloat(readingValue);
        if (!obraId || !employeeId || readingValue === '' || isNaN(readingFloat)) {
            setAlertMessage(`Preencha a Obra, Funcionário e ${readingLabel} de Entrada.`);
            return;
        }

        const selectedEmployee = employees.find(e => e.id === employeeId);
        // Verifica se o funcionário já está alocado (aviso)
        let employeeAllocationInfo = null;
        if (selectedEmployee?.alocadoEm) {
             if (typeof selectedEmployee.alocadoEm === 'string') {
                 try { employeeAllocationInfo = JSON.parse(selectedEmployee.alocadoEm); } catch {}
             } else {
                 employeeAllocationInfo = selectedEmployee.alocadoEm;
             }
             if (employeeAllocationInfo?.veiculoId && employeeAllocationInfo.veiculoId !== vehicle.id) {
                console.warn(`Atenção: ${selectedEmployee.nome} já está alocado em outro veículo/obra.`);
                 // Poderia mostrar um ConfirmationModal aqui se quisesse impedir/confirmar
            }
        }


        setIsSaving(true);
        try {
            await apiClient.allocateVehicleToObra(vehicle.id, {
                obraId,
                employeeId,
                dataEntrada: dataEntrada, // Envia YYYY-MM-DD
                readingType: readingType, // 'odometro' ou 'horimetro' (correto)
                readingValue: readingFloat
            });
            setAlertMessage("Veículo alocado com sucesso!");
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao alocar veículo:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao alocar o veículo.");
        } finally {
            setIsSaving(false);
        }
    };

    // Função para DESALOCAR
    const handleDeallocate = async (shouldFinalizeObra = false, dataFimObra = null) => {
        const readingFloat = parseFloat(readingValue);
         if (readingValue === '' || isNaN(readingFloat)) {
             setAlertMessage(`Preencha o ${readingLabel} de Saída.`);
             return;
         }
          // Validação: Leitura de saída não pode ser menor que a de entrada
         const entryReading = currentObraAllocation?.details?.[`${readingType}Entrada`] || 0;
         if (currentObraAllocation && readingFloat < entryReading) {
             setAlertMessage(`A leitura de saída (${readingFloat}) não pode ser menor que a leitura de entrada (${entryReading}).`);
             return;
         }

        setIsSaving(true);
        try {
            await apiClient.deallocateVehicleFromObra(vehicle.id, {
                dataSaida: dataSaida, // Envia YYYY-MM-DD
                readingType: readingType, // 'odometro' ou 'horimetro' (correto)
                readingValue: readingFloat,
                location: locationAfterDeallocate, // Novo local
                shouldFinalizeObra: shouldFinalizeObra,
                dataFimObra: dataFimObra, // Opcional, YYYY-MM-DD
                obraId: vehicle.obraAtualId // Passa o ID da obra atual para o backend saber qual finalizar
            });
            setAlertMessage(`Veículo desalocado ${shouldFinalizeObra ? 'e obra finalizada' : ''} com sucesso!`);
            reloadData();
            onClose();
        } catch (error) {
            console.error("Erro ao desalocar veículo:", error);
            setAlertMessage(error.response?.data?.message || "Falha ao desalocar o veículo.");
        } finally {
            setIsSaving(false);
        }
    };

    // Verifica se é o último veículo na obra antes de desalocar
    const checkAndDeallocate = () => {
        const obraData = obras.find(o => o.id === vehicle.obraAtualId);
        if (!obraData) { // Se não encontrar a obra (erro?), apenas desaloca
            handleDeallocate();
            return;
        }
         // Garante que historicoVeiculos é um array antes de filtrar
         // Busca pelo histórico da *obra* (obras_historico_veiculos)
         const historico = Array.isArray(obraData.historicoVeiculos) ? obraData.historicoVeiculos : [];
        
        // Verifica se *outros* veículos ainda estão ativos na obra (dataSaida é null)
        const otherActiveVehicles = historico.filter(h => h.veiculoId !== vehicle.id && !h.dataSaida);

        if (otherActiveVehicles.length === 0) { // Se este é o último
            setObraToFinalize(obraData);
            setIsFinishObraModalOpen(true); // Abre modal para confirmar finalização da obra
        } else {
            handleDeallocate(false); // Apenas desaloca o veículo
        }
    };


    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Alocação de Veículo em Obra</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={18}/></button>
                </div>
                <div className="p-6">
                     <p className="text-sm mb-4"><strong>Veículo:</strong> {vehicle.registroInterno} - {vehicle.marca} {vehicle.modelo} ({vehicle.placa})</p>
                    {/* Se estiver alocado, mostra opção de desalocar */}
                    {currentObraAllocation ? (
                        <div className="space-y-4">
                            <p className="text-sm">Alocado na obra: <strong>{obras.find(o => o.id === vehicle.obraAtualId)?.nome || 'Desconhecida'}</strong>.</p>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Data de Saída *</label>
                                <input type="date" value={dataSaida} onChange={e => setDataSaida(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm" required/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">{readingLabel} de Saída *</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={readingValue} // Usa o estado unificado
                                    onChange={e => setReadingValue(e.target.value)}
                                    placeholder={currentObraAllocation.details?.[`${readingType}Entrada`] ? `Leitura de entrada: ${currentObraAllocation.details[`${readingType}Entrada`]}` : ''}
                                    className="mt-1 w-full p-2 border rounded-md text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Local de Disponibilidade após Saída *</label>
                                 <input
                                     type="text"
                                     value={locationAfterDeallocate}
                                     onChange={e => setLocationAfterDeallocate(e.target.value)}
                                     placeholder="Ex: Pátio MAK Lajeado"
                                     className="mt-1 w-full p-2 border rounded-md text-sm"
                                     required
                                 />
                            </div>
                            <button onClick={checkAndDeallocate} disabled={isSaving || !dataSaida || readingValue === '' || !locationAfterDeallocate} className="w-full px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-red-300 flex items-center justify-center gap-2 text-sm">
                                 {isSaving ? <><Loader className="animate-spin" size={18}/> Finalizando...</> : "Finalizar Alocação"}
                            </button>
                        </div>
                    ) : (
                         // Se não estiver alocado, mostra formulário para alocar
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Alocar na Obra *</label>
                                <select value={obraId} onChange={(e) => setObraId(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm bg-white" required>
                                    <option value="">Selecione...</option>
                                    {activeObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Alocar Funcionário *</label>
                                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm bg-white" required>
                                    <option value="">Selecione...</option>
                                    {availableEmployees.map(e => <option key={e.id} value={e.id}>{e.nome} ({e.funcao})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Data de Entrada *</label>
                                <input type="date" value={dataEntrada} onChange={e => setDataEntrada(e.target.value)} className="mt-1 w-full p-2 border rounded-md text-sm" required/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">{readingLabel} de Entrada *</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={readingValue} // Usa o estado unificado
                                    onChange={e => setReadingValue(e.target.value)}
                                    className="mt-1 w-full p-2 border rounded-md text-sm"
                                    required
                                />
                            </div>
                            <button onClick={handleAllocate} disabled={isSaving || !obraId || !employeeId || readingValue === ''} className="w-full px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300 flex items-center justify-center gap-2 text-sm">
                                {isSaving ? <><Loader className="animate-spin" size={18}/> Alocando...</> : "Alocar Veículo"}
                            </button>
                        </div>
                    )}
                </div>
                 {/* Rodapé padrão removido, pois os botões de ação estão dentro das seções condicionais */}
                 <div className="p-4 bg-gray-50 border-t flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium" disabled={isSaving}>Fechar</button>
                </div>
            </div>

            {/* Modal de confirmação para finalizar obra (BUG CORRIGIDO) */}
            {isFinishObraModalOpen && (
                <FinishObraModal
                    obra={obraToFinalize}
                    // CORREÇÃO: O 'onClose' (botão "Não") agora também chama a desalocação, mas sem finalizar a obra
                    onClose={() => {
                        setIsFinishObraModalOpen(false);
                        handleDeallocate(false); // Apenas desaloca o veículo
                    }}
                    // Ao confirmar, chama handleDeallocate com shouldFinalize=true
                    onConfirm={(dataFim) => {
                        setIsFinishObraModalOpen(false); // Fecha este modal
                        handleDeallocate(true, dataFim); // Chama desalocação finalizando a obra
                    }}
                />
            )}
        </div>
    );
};

export default ObraAllocationModal;