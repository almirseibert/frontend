import React from 'react';
import { ImageOff, X } from 'lucide-react';

// --- Modal de Detalhes do Veículo ---
// Extraído de VehiclePage.js
const VehicleDetailModal = ({ vehicle, revision, onClose, vehicleGroups = {} }) => {
    if (!vehicle) return null;

     // Garante que groups é um objeto
    const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
    const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(vehicle.tipo));

    // Determina unidade e leitura principal (COM NOVAS REGRAS O/H)
    let readingLabel = 'Leitura';
    let readingValue = 'N/A';
    let consumptionUnit = 'Unidade/L'; // Para o campo 'Cálculo de Média'

    if (vehicleGroup === 'Máquinas Pesadas') {
         readingLabel = 'Horímetro';
         readingValue = `${vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro ?? 'N/A'} Hr`;
         consumptionUnit = 'L/Hr';
    } else if (vehicleGroup === 'Caminhões') {
        readingLabel = 'Odômetro / Horímetro'; // Mostrar ambos
        readingValue = `${vehicle.odometro ?? 'N/A'} Km / ${vehicle.horimetro ?? 'N/A'} Hr`;
        
        // --- NOVA REGRA O/H ---
        if (vehicle.tipo === 'Caminhões Prancha') {
            consumptionUnit = 'Km/L'; // Exceção
        } else {
            consumptionUnit = vehicle.mediaCalculo === 'horimetro' ? 'L/Hr' : 'Km/L'; // Padrão
        }
    } else { // Veículos Leves ou outros
        readingLabel = 'Odômetro';
        readingValue = `${vehicle.odometro ?? 'N/A'} Km`;
        consumptionUnit = 'Km/L';
    }

    // Formata datas da API
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try { return new Date(dateString).toLocaleDateString('pt-BR', { timeZone: 'UTC' }); } // Usa UTC
        catch { return 'Inválida'; }
    };

    // Constrói a URL da imagem (para preview e listagem)
    const apiBaseUrl = (process.env.REACT_APP_API_URL || 'http://localhost:3001/api').replace('/api', '');
    const imageUrl = vehicle.fotoURL 
        ? (vehicle.fotoURL.startsWith('http') ? vehicle.fotoURL : `${apiBaseUrl}${vehicle.fotoURL}`)
        : 'https://placehold.co/600x400/e2e8f0/cbd5e0?text=S/Foto';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[95vh] flex flex-col my-auto">
                {/* Cabeçalho Fixo */}
                <div className="p-4 sm:p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <h2 className="text-xl sm:text-2xl font-bold">{vehicle.marca} {vehicle.modelo}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={20}/></button>
                </div>
                 {/* Conteúdo Rolável */}
                <div className="p-4 sm:p-6 overflow-y-auto">
                    {/* Imagem */}
                    <div className="mb-6 aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                        <img
                            src={imageUrl} // <-- USA A NOVA URL
                            alt={`Foto de ${vehicle.marca || ''} ${vehicle.modelo || ''}`}
                            className="w-full h-full object-contain rounded-lg" // object-contain para não distorcer
                            onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/600x400/e2e8f0/cbd5e0?text=Erro'; }}
                        />
                         {/* Ícone se a imagem falhar */}
                         {!vehicle.fotoURL && <ImageOff className="text-gray-400" size={48} />}
                    </div>

                    {/* Detalhes em Grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:text-base">
                        <div className="font-semibold text-gray-600">Registro Interno:</div>
                        <div className="text-gray-800 font-medium">{vehicle.registroInterno || 'N/A'}</div>

                        <div className="font-semibold text-gray-600">Placa:</div>
                        <div className="text-gray-800 font-medium">{vehicle.placa || 'N/A'}</div>

                        <div className="font-semibold text-gray-600">Tipo:</div>
                        <div className="text-gray-800 font-medium">{vehicle.tipo || 'N/A'}</div>

                        <div className="font-semibold text-gray-600">{readingLabel}:</div>
                        <div className="text-gray-800 font-medium">{readingValue}</div>

                         {/* Separador */}
                        <div className="col-span-2 border-t my-2"></div>

                        {/* Detalhes Adicionais */}
                         {(vehicle.ano_fabricacao || vehicle.ano_modelo) && (<>
                            <div className="font-semibold text-gray-600">Ano Fab./Modelo:</div>
                            <div className="text-gray-800 font-medium">{vehicle.ano_fabricacao || 'N/A'} / {vehicle.ano_modelo || 'N/A'}</div>
                        </>)}

                        {vehicle.chassi && (<>
                            <div className="font-semibold text-gray-600">Chassi:</div>
                            <div className="text-gray-800 font-medium break-all">{vehicle.chassi}</div> {/* break-all para chassi longo */}
                        </>)}

                         {/* Exibe Cálculo de Média (usa a var consumptionUnit) */}
                         {(vehicleGroup === 'Caminhões' || vehicleGroup === 'Máquinas Pesadas' || vehicleGroup === 'Veículos Leves') && (<>
                            <div className="font-semibold text-gray-600">Cálculo de Média:</div>
                            <div className="text-gray-800 font-medium">{consumptionUnit}</div>
                        </>)}

                        {vehicle.capacidade && (
                            <>
                                <div className="font-semibold text-gray-600">Capacidade (m³):</div>
                                <div className="text-gray-800 font-medium">{vehicle.capacidade}</div>
                            </>
                        )}
                         {vehicle.fuelCapacity && (
                            <>
                                <div className="font-semibold text-gray-600">Capacidade Tanque (L):</div>
                                <div className="text-gray-800 font-medium">{vehicle.fuelCapacity}</div>
                            </>
                        )}

                         {/* Validades (Condicional para Caminhões) */}
                         {vehicleGroup === 'Caminhões' && (
                            <>
                                <div className="col-span-2 border-t my-2"></div>
                                <div className="font-semibold text-gray-600">Validade Tacógrafo:</div>
                                <div className={`font-medium ${new Date(vehicle.validadeTacografo) < new Date() ? 'text-red-600' : 'text-gray-800'}`}>{formatDate(vehicle.validadeTacografo)}</div>

                                <div className="font-semibold text-gray-600">Validade AET DAER:</div>
                                 <div className={`font-medium ${new Date(vehicle.validadeAET_DAER) < new Date() ? 'text-red-600' : 'text-gray-800'}`}>{formatDate(vehicle.validadeAET_DAER)}</div>

                                <div className="font-semibold text-gray-600">Validade AET DNIT:</div>
                                <div className={`font-medium ${new Date(vehicle.validadeAET_DNIT) < new Date() ? 'text-red-600' : 'text-gray-800'}`}>{formatDate(vehicle.validadeAET_DNIT)}</div>
                            </>
                         )}


                        {/* Revisão */}
                        <div className="col-span-2 border-t my-2 pt-2">
                             <h3 className="font-semibold text-gray-700 mb-1">Próxima Revisão Agendada</h3>
                        </div>
                        <div className="font-semibold text-gray-600">Data:</div>
                        <div className="text-gray-800 font-medium">{formatDate(revision?.proximaRevisaoData)}</div>

                        {/* O label aqui é 'Leitura (Km)' ou 'Leitura (Hr)' */}
                        <div className="font-semibold text-gray-600">Leitura (Km/Hr):</div>
                        <div className="text-gray-800 font-medium">{revision?.proximaRevisaoOdometro || 'N/A'}</div>

                         <div className="font-semibold text-gray-600">Descrição:</div>
                         <div className="text-gray-800 font-medium col-span-2">{revision?.descricao || 'Nenhuma descrição'}</div>
                    </div>
                </div>
                 {/* Rodapé Fixo */}
                <div className="p-4 bg-gray-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-6 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
};

export default VehicleDetailModal;