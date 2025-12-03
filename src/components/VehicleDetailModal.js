import React from 'react';
import { ImageOff, X, Truck } from 'lucide-react';

const VehicleDetailModal = ({ vehicle, revision, onClose, vehicleGroups = {} }) => {
    if (!vehicle) return null;

    const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
    const vehicleGroup = Object.keys(groups).find(group => groups[group]?.includes(vehicle.tipo));

    // Determina unidade e leitura principal
    let readingLabel = 'Leitura';
    let readingValue = 'N/A';
    
    // Simplificação visual para o modal de detalhes
    if (vehicleGroup === 'Veículos Leves' || vehicleGroup === 'Caminhões de Trecho') {
        readingLabel = 'Odômetro';
        readingValue = `${vehicle.odometro ?? '0'} Km`;
    } else {
        readingLabel = 'Horímetro';
        // Prioriza digital
        readingValue = `${vehicle.horimetroDigital ?? vehicle.horimetro ?? '0'} Hr`;
        if (vehicle.horimetroAnalogico > 0) {
            readingValue += ` (Analógico: ${vehicle.horimetroAnalogico} Hr)`;
        }
    }

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try { return new Date(dateString).toLocaleDateString('pt-BR', { timeZone: 'UTC' }); }
        catch { return 'Inválida'; }
    };

    const apiBaseUrl = (process.env.REACT_APP_API_URL || 'http://localhost:3001/api').replace('/api', '');
    const imageUrl = vehicle.fotoURL 
        ? (vehicle.fotoURL.startsWith('http') ? vehicle.fotoURL : `${apiBaseUrl}${vehicle.fotoURL}`)
        : null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">{vehicle.marca} {vehicle.modelo}</h2>
                        <div className="flex gap-2 mt-1">
                            <span className="text-xs font-mono bg-gray-200 px-2 py-0.5 rounded text-gray-700">{vehicle.placa}</span>
                            {vehicle.isThirdParty && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold border border-purple-200">TERCEIRO</span>}
                            {vehicle.isComboioVehicle && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-bold border border-yellow-200 flex items-center gap-1"><Truck size={10}/> COMBOIO</span>}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition"><X size={20}/></button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    {/* Imagem */}
                    <div className="mb-6 aspect-video bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200 overflow-hidden shadow-inner">
                        {imageUrl ? (
                            <img src={imageUrl} alt="Veículo" className="w-full h-full object-contain" onError={(e) => { e.target.style.display='none'; }} />
                        ) : (
                            <div className="flex flex-col items-center text-gray-400">
                                <ImageOff size={40} />
                                <span className="text-xs mt-2">Sem foto cadastrada</span>
                            </div>
                        )}
                    </div>

                    {/* Grid de Informações */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        
                        <div className="col-span-2 pb-2 mb-2 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wide">Dados Operacionais</div>

                        <div>
                            <span className="block text-gray-500 text-xs">Registro Interno</span>
                            <span className="block font-semibold text-gray-900 text-lg">{vehicle.registroInterno}</span>
                        </div>
                        
                        <div>
                            <span className="block text-gray-500 text-xs">{readingLabel} Atual</span>
                            <span className="block font-semibold text-gray-900 text-lg">{readingValue}</span>
                        </div>

                        <div>
                            <span className="block text-gray-500 text-xs">Tipo</span>
                            <span className="block font-medium text-gray-800">{vehicle.tipo}</span>
                        </div>

                        <div>
                            <span className="block text-gray-500 text-xs">Capacidade</span>
                            <span className="block font-medium text-gray-800">{vehicle.capacidade ? `${vehicle.capacidade} m³` : '-'}</span>
                        </div>

                        {vehicle.fuelCapacity && (
                            <div>
                                <span className="block text-gray-500 text-xs">Tanque</span>
                                <span className="block font-medium text-gray-800">{vehicle.fuelCapacity} L</span>
                            </div>
                        )}

                        {/* Seção de Revisão */}
                        <div className="col-span-2 pt-4 mt-2 border-t border-gray-100">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Status de Revisão</h4>
                            {revision ? (
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                    <div className="flex justify-between mb-1">
                                        <span className="text-blue-800 font-semibold">Próxima: {formatDate(revision.proximaRevisaoData)}</span>
                                        <span className="text-blue-600 font-mono text-xs">{revision.proximaRevisaoOdometro ? `${revision.proximaRevisaoOdometro} Km/Hr` : ''}</span>
                                    </div>
                                    <p className="text-xs text-blue-600 italic">{revision.descricao || 'Manutenção preventiva padrão.'}</p>
                                </div>
                            ) : (
                                <p className="text-gray-400 italic text-xs">Nenhum plano de revisão ativo.</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition text-sm">Fechar</button>
                </div>
            </div>
        </div>
    );
};

export default VehicleDetailModal;