import React, { useMemo } from 'react';
import { Download, Printer } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const RefuelingHistory = ({ 
    vehicleId, 
    refuelings = [], 
    vehicles = [], 
    vehicleGroups = {}, 
    partners = [],
    employees = [],
    onGeneratePDF // Recebe a função da página pai
}) => {
    
    // --- LÓGICA DE PROCESSAMENTO E MÉDIAS (Baseada no arquivo original) ---
    const processedHistory = useMemo(() => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (!vehicle || !Array.isArray(refuelings)) return { historyWithAverages: [], overallAverage: null, unit: 'N/A', readingLabel: 'Leitura' };

        // 1. Filtra e Ordena (Decrescente para exibição: Mais recente -> Mais antigo)
        const history = refuelings
            .filter(r => r.vehicleId === vehicleId && r.status === 'Concluída')
            .sort((a,b) => (b.date || '').localeCompare(a.date || '')); 

        // 2. Determina Unidade e Rótulo (Lógica de Grupo)
        const getUnitAndLabel = () => {
             // Lógica robusta para determinar se é Horímetro ou Odômetro
             let isHourBased = false;
             
             if (vehicleGroups && Object.keys(vehicleGroups).length > 0) {
                 const group = Object.keys(vehicleGroups).find(g => vehicleGroups[g]?.includes(vehicle.tipo));
                 if (group === 'Máquinas Pesadas' || group === 'Caminhões Pesados') isHourBased = true;
                 if (group === 'Veículos Leves' || group === 'Caminhões de Trecho') isHourBased = false;
             }
             
             // Sobrescrita se o veículo tiver configuração explícita (se houver esse campo no futuro)
             if (vehicle.mediaCalculo === 'horimetro') isHourBased = true;
             if (vehicle.mediaCalculo === 'odometro') isHourBased = false;

             return isHourBased ? { unit: 'L/Hr', label: 'Horímetro' } : { unit: 'Km/L', label: 'Odômetro' };
        };
        const { unit, readingLabel } = getUnitAndLabel();

        // 3. Calcula Médias (Percorre a lista)
        const historyWithAverages = history.map((current, index) => {
            // Como a lista está decrescente (index 0 é o mais novo), o "anterior" cronológico é index + 1
            const previous = history[index + 1]; 
            let average = null;
            
            // Função auxiliar para pegar a melhor leitura disponível
            const getReading = (item) => {
                if (unit === 'L/Hr') {
                    return parseFloat(item.horimetroDigital || item.horimetroAnalogico || item.horimetro || 0);
                }
                return parseFloat(item.odometro || 0);
            };
            
            // Leitura usada para exibição na tabela
            let readingUsed = unit === 'L/Hr' 
                ? (current.horimetroDigital || current.horimetroAnalogico || current.horimetro || 'N/A')
                : (current.odometro || 'N/A');

            if (previous) {
                const currentVal = getReading(current);
                const previousVal = getReading(previous);
                const diff = currentVal - previousVal;
                const liters = parseFloat(current.litrosAbastecidos || 0);

                if (diff > 0 && liters > 0) {
                    // Km/L = Distância / Litros
                    // L/Hr = Litros / Tempo
                    average = (unit === 'Km/L') ? (diff / liters) : (liters / diff);
                }
            }

            return { 
                ...current, 
                average, 
                readingUsed,
                readingLabel 
            };
        });

        // 4. Média Geral
        let overallAverage = null;
        if (history.length > 1) {
            const newest = history[0];
            const oldest = history[history.length - 1];
            
            const getReading = (item) => {
                if (unit === 'L/Hr') return parseFloat(item.horimetroDigital || item.horimetroAnalogico || item.horimetro || 0);
                return parseFloat(item.odometro || 0);
            };

            const totalDiff = getReading(newest) - getReading(oldest);
            
            // Soma litros de todos os abastecimentos que contribuíram para o deslocamento (exclui o oldest pois ele é o ponto de partida)
            const totalLiters = history.slice(0, history.length - 1).reduce((acc, curr) => acc + (parseFloat(curr.litrosAbastecidos) || 0), 0);

            if (totalDiff > 0 && totalLiters > 0) {
                overallAverage = (unit === 'Km/L') ? (totalDiff / totalLiters) : (totalLiters / totalDiff);
            }
        }

        return { historyWithAverages, overallAverage, unit, readingLabel };
    }, [vehicleId, refuelings, vehicles, vehicleGroups]);

    // --- GERAÇÃO PDF DA TABELA DE HISTÓRICO ---
    const generateHistoryPDF = () => {
        const doc = new jsPDF();
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (!vehicle) return;

        doc.setFontSize(16);
        doc.text(`Histórico de Abastecimento - ${vehicle.registroInterno} (${vehicle.placa || ''})`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Média Geral Calculada: ${processedHistory.overallAverage?.toFixed(2) || '-'} ${processedHistory.unit}`, 14, 28);

        const body = processedHistory.historyWithAverages.map(h => [
            new Date(h.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
            h.partnerName || 'N/A',
            h.readingUsed,
            (h.litrosAbastecidos || 0).toFixed(2),
            h.average ? h.average.toFixed(2) : '-'
        ]);

        autoTable(doc, {
            startY: 35,
            head: [['Data', 'Posto', processedHistory.readingLabel, 'Litros', `Média (${processedHistory.unit})`]],
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] },
        });

        doc.save(`Historico_${vehicle.registroInterno}.pdf`);
    };

    if (!vehicleId) return <div className="text-gray-400 text-sm italic text-center p-4">Selecione um veículo para ver o histórico.</div>;

    return (
        <div className="animate-fadeIn">
            <div className="flex justify-between items-center mb-4 bg-blue-50 p-3 rounded-lg border border-blue-100">
                <div>
                    <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">Média Geral</span>
                    <div className="text-xl font-bold text-blue-600">
                        {processedHistory.overallAverage ? processedHistory.overallAverage.toFixed(2) : '--'} 
                        <span className="text-sm text-blue-400 ml-1">{processedHistory.unit}</span>
                    </div>
                </div>
                <button onClick={generateHistoryPDF} className="flex items-center gap-2 px-3 py-2 bg-white border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-100 transition text-xs font-bold shadow-sm">
                    <Download size={14}/> PDF Lista
                </button>
            </div>

            <div className="overflow-x-auto border rounded-lg max-h-96">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100 text-gray-600 font-bold text-xs uppercase sticky top-0 z-10">
                        <tr>
                            <th className="p-3">Data</th>
                            <th className="p-3">Posto</th>
                            <th className="p-3 text-right">{processedHistory.readingLabel}</th>
                            <th className="p-3 text-right">Litros</th>
                            <th className="p-3 text-right">Média</th>
                            <th className="p-3 text-center">Reimprimir</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {processedHistory.historyWithAverages.map(h => (
                            <tr key={h.id} className="hover:bg-gray-50 transition-colors">
                                <td className="p-3">{new Date(h.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                                <td className="p-3 truncate max-w-[150px]" title={h.partnerName}>{h.partnerName}</td>
                                <td className="p-3 text-right font-mono">{h.readingUsed}</td>
                                <td className="p-3 text-right font-bold">{h.litrosAbastecidos?.toFixed(2)}</td>
                                <td className={`p-3 text-right font-bold ${!h.average ? 'text-gray-300' : 'text-gray-700'}`}>
                                    {h.average?.toFixed(2) || '-'}
                                </td>
                                <td className="p-3 text-center">
                                    <button 
                                        // Chama a função passada pelo pai com os dados completos para gerar a autorização original
                                        onClick={() => onGeneratePDF(h, vehicles, partners, employees, vehicleGroups)} 
                                        className="text-gray-400 hover:text-blue-600 p-1.5 rounded-full hover:bg-blue-50 transition"
                                        title="Reimprimir Autorização"
                                    >
                                        <Printer size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {processedHistory.historyWithAverages.length === 0 && (
                            <tr><td colSpan="6" className="p-4 text-center text-gray-400">Nenhum registro encontrado.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default RefuelingHistory;