import React, { useState, useMemo } from 'react';
import { X, Info, Clock, CheckCircle, Loader, AlertTriangle, ShieldCheck } from 'lucide-react';

const InactivityAlertModal = ({ alert, onClose, onObserve, onProlong, apiClient, setAlertMessage, refuelings = [] }) => {
    const [prolongDays, setProlongDays] = useState(7);
    const [observation, setObservation] = useState(alert.observation || '');
    const [isSaving, setIsSaving] = useState(false);

    const { obra, operator, vehicle } = alert;

    // LÓGICA DE CORREÇÃO EM TEMPO REAL
    // Busca o último abastecimento REAL deste veículo na lista completa, 
    // caso o alerta esteja desatualizado.
    const realStatus = useMemo(() => {
        if (!vehicle || !refuelings.length) return null;

        const vehicleRefuels = refuelings
            .filter(r => r.vehicleId === vehicle.id && r.status === 'Concluída')
            .sort((a,b) => new Date(b.date) - new Date(a.date));

        if (vehicleRefuels.length === 0) return null;

        const latest = vehicleRefuels[0];
        const latestDate = new Date(latest.date);
        const alertDate = alert.lastRefuelingDate ? new Date(alert.lastRefuelingDate) : null;
        
        // Calcula dias inativo baseado no HOJE
        const now = new Date();
        const diffTime = Math.abs(now - latestDate);
        const daysInactive = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        // Verifica se é mais novo que o do alerta (margem de erro de 1 dia)
        const isNewer = alertDate ? (latestDate > alertDate) : true;
        const isFalsePositive = daysInactive < 7; // Se tem menos de 7 dias, o alerta é falso

        return {
            date: latestDate,
            dateStr: latestDate.toLocaleDateString('pt-BR'),
            daysInactive,
            isNewer,
            isFalsePositive
        };
    }, [vehicle, refuelings, alert]);

    const displayDate = realStatus ? realStatus.dateStr : (alert.lastRefuelingDate ? new Date(alert.lastRefuelingDate).toLocaleDateString('pt-BR') : 'N/A');
    const displayDays = realStatus ? realStatus.daysInactive : (alert.daysSinceLastRefuel || '?');

    const handleObserve = async () => {
        if (!observation && !realStatus?.isFalsePositive) return setAlertMessage("Adicione uma observação.");
        
        // Se for falso positivo, preenche automático
        const finalObs = observation || (realStatus?.isFalsePositive ? `Corrigido: Abastecido em ${displayDate}` : '');

        setIsSaving(true);
        try {
            await apiClient.updateInactivityAlert(alert.id, {
                status: 'Observado', // Ou 'Resolvido' se preferir limpar
                observation: finalObs,
                dismissedAt: new Date().toISOString(),
            });
            onObserve();
        } catch (error) {
            setAlertMessage("Erro ao salvar.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleProlong = async () => {
        const days = parseInt(prolongDays, 10);
        if (isNaN(days) || days <= 0) return setAlertMessage("Dias inválidos.");

        setIsSaving(true);
        try {
            const newAlertUntilDate = new Date();
            newAlertUntilDate.setDate(newAlertUntilDate.getDate() + days);

            await apiClient.updateInactivityAlert(alert.id, {
                status: 'Prolongado',
                observation: observation || `Prolongado por ${days} dia(s).`,
                prolongedUntil: newAlertUntilDate.toISOString(),
                prolongedByDays: days,
            });
            onProlong();
        } catch (error) {
            setAlertMessage("Erro ao prorrogar.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100">
                <div className="p-4 border-b bg-blue-50 flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                            <Clock className="text-blue-600" size={20}/>
                            Alerta de Inatividade
                        </h2>
                        <p className="text-sm text-blue-700 font-medium">{vehicle?.registroInterno} - {vehicle?.modelo}</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-blue-200 text-blue-800 transition-colors"><X size={20}/></button>
                </div>
                
                <div className="p-6 space-y-4">
                    {/* AVISO DE FALSO POSITIVO DETECTADO */}
                    {realStatus && realStatus.isFalsePositive && (
                        <div className="bg-green-50 border-l-4 border-green-500 p-3 rounded shadow-sm">
                            <div className="flex items-start gap-3">
                                <ShieldCheck className="text-green-600 shrink-0" size={20} />
                                <div>
                                    <h4 className="text-sm font-bold text-green-800">Situação Normalizada Detectada</h4>
                                    <p className="text-xs text-green-700 mt-1">
                                        Este veículo foi abastecido recentemente em <strong>{realStatus.dateStr}</strong>. 
                                        Isso indica que o alerta é um falso positivo ou já foi resolvido operacionalmente.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {!realStatus?.isFalsePositive && (
                        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 text-sm text-yellow-800 shadow-sm flex gap-2">
                            <AlertTriangle className="shrink-0" size={18}/>
                            <span>
                                Veículo alocado na obra <strong>{obra?.nome || 'Obra Desconhecida'}</strong> sem abastecimento há mais de <strong>{displayDays} dias</strong>.
                            </span>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-3 rounded border border-gray-100">
                        <div>
                            <span className="font-bold block text-gray-800 text-xs uppercase text-opacity-70 mb-0.5">Último Abastecimento</span>
                            <span className={`font-mono font-medium ${realStatus?.isFalsePositive ? 'text-green-600' : 'text-gray-900'}`}>
                                {displayDate}
                            </span>
                        </div>
                        <div>
                            <span className="font-bold block text-gray-800 text-xs uppercase text-opacity-70 mb-0.5">Operador Responsável</span> 
                            <span className="text-gray-900">{operator?.nome || 'Não identificado'}</span>
                        </div>
                        <div>
                             <span className="font-bold block text-gray-800 text-xs uppercase text-opacity-70 mb-0.5">Status Real</span>
                             <span className={realStatus?.daysInactive > 7 ? "text-red-600 font-bold" : "text-green-600 font-bold"}>
                                 {realStatus ? `${realStatus.daysInactive} dias parado` : 'Calculando...'}
                             </span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observação / Justificativa {realStatus?.isFalsePositive ? '' : '*'}</label>
                        <textarea
                            value={observation}
                            onChange={e => setObservation(e.target.value)}
                            rows="3"
                            className="w-full p-2 border rounded bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-shadow"
                            placeholder={realStatus?.isFalsePositive ? "Opcional: O sistema detectou abastecimento recente." : "Ex: Veículo quebrado, Operador de férias, etc."}
                        />
                    </div>

                    {/* Esconde prorrogação se for falso positivo, pois deve ser resolvido */}
                    {!realStatus?.isFalsePositive && (
                        <div className="flex items-end gap-3 pt-4 border-t">
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-gray-500 uppercase">Prorrogar Alerta (Dias)</label>
                                <input
                                    type="number"
                                    value={prolongDays}
                                    onChange={e => setProlongDays(e.target.value)}
                                    min="1"
                                    className="w-full p-2 border rounded mt-1 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <button onClick={handleProlong} disabled={isSaving || !prolongDays} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex gap-2 items-center text-sm shadow-sm transition-colors h-[38px]">
                                {isSaving ? <Loader size={16} className="animate-spin"/> : <Clock size={16}/>} Prorrogar
                            </button>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 rounded hover:bg-gray-100 text-sm text-gray-700 transition-colors">Cancelar</button>
                    <button 
                        onClick={handleObserve} 
                        disabled={isSaving || (!observation && !realStatus?.isFalsePositive)} 
                        className={`px-4 py-2 text-white rounded disabled:opacity-50 flex gap-2 items-center text-sm font-medium shadow-sm transition-colors ${realStatus?.isFalsePositive ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {isSaving ? <Loader size={16} className="animate-spin"/> : <CheckCircle size={16}/>} 
                        {realStatus?.isFalsePositive ? 'Confirmar Resolução' : 'Registrar Observação'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InactivityAlertModal;