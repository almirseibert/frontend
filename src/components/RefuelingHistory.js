import React, { useMemo, useState } from 'react';
import { Download, Printer, Droplet, Loader } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const RefuelingHistory = ({ 
    vehicleId, 
    refuelings = [], 
    vehicles = [], 
    vehicleGroups = {}, 
    partners = [],
    employees = [],
    onGeneratePDF
}) => {
    
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // --- HELPER: Validação de Data (Consistente com RefuelingPage) ---
    const isValidDbDate = (dateString) => {
        if (!dateString) return false;
        const str = String(dateString);
        // Filtra strings vazias, nulas, ou data "zero" do MySQL/Unix
        return str.length > 5 && !str.startsWith('0000') && str !== '1970-01-01T00:00:00.000Z';
    };

    // --- HELPER: Formatação de Data Segura ---
    const formatDateSafe = (dateInput) => {
        if (!isValidDbDate(dateInput)) return 'N/A';
        try {
            let dateStr = String(dateInput);
            // Se for string SQL (YYYY-MM-DD HH:MM:SS), substitui espaço por T
            if (dateStr.includes(' ') && !dateStr.includes('T')) {
                dateStr = dateStr.replace(' ', 'T');
            }
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return 'Data Inválida';
            // Força UTC para evitar erro de fuso horário (D-1)
            return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()).toLocaleDateString('pt-BR');
        } catch { return 'Erro'; }
    };

    // --- HELPER: Objeto Date Seguro para Ordenação ---
    const getSafeDateObj = (dateInput) => {
        if (!isValidDbDate(dateInput)) return new Date(0);
        try {
            let dateStr = String(dateInput);
            if (dateStr.includes(' ') && !dateStr.includes('T')) {
                dateStr = dateStr.replace(' ', 'T');
            }
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? new Date(0) : d;
        } catch { return new Date(0); }
    };

    // --- LÓGICA DE PROCESSAMENTO E MÉDIAS ---
    const processedHistory = useMemo(() => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (!vehicle || !Array.isArray(refuelings)) return { historyWithAverages: [], overallAverage: null, unit: 'N/A', readingLabel: 'Leitura' };

        // 1. Filtra e Ordena usando DATA SEGURA (Priorizando 'data' do banco, fallback para 'date')
        const history = refuelings
            .filter(r => r.vehicleId === vehicleId && r.status === 'Concluída')
            .sort((a,b) => {
                const dateA = a.data || a.date;
                const dateB = b.data || b.date;
                return getSafeDateObj(dateB).getTime() - getSafeDateObj(dateA).getTime();
            }); 

        // 2. Determina Unidade
        const getUnitAndLabel = () => {
             let isHourBased = false;
             if (vehicleGroups && Object.keys(vehicleGroups).length > 0) {
                 const group = Object.keys(vehicleGroups).find(g => vehicleGroups[g]?.includes(vehicle.tipo));
                 if (group === 'Máquinas Pesadas' || group === 'Caminhões Pesados') isHourBased = true;
                 if (group === 'Veículos Leves' || group === 'Caminhões de Trecho') isHourBased = false;
             }
             if (vehicle.mediaCalculo === 'horimetro') isHourBased = true;
             return isHourBased ? { unit: 'L/Hr', label: 'Horímetro' } : { unit: 'Km/L', label: 'Odômetro' };
        };
        const { unit, readingLabel } = getUnitAndLabel();

        // 3. Calcula Médias (Comparando item N com N+1)
        const historyWithAverages = history.map((current, index) => {
            const previous = history[index + 1]; 
            let average = null;
            
            const getReading = (item) => {
                if (unit === 'L/Hr') return parseFloat(item.horimetroDigital || item.horimetroAnalogico || item.horimetro || 0);
                return parseFloat(item.odometro || 0);
            };
            
            // Define qual leitura será exibida na tabela
            let displayReading = unit === 'L/Hr' ? (current.horimetroDigital || current.horimetro || '-') : (current.odometro || '-');

            if (previous) {
                const currentVal = getReading(current);
                const previousVal = getReading(previous);
                const diff = currentVal - previousVal;
                const liters = parseFloat(current.litrosAbastecidos || 0);

                if (diff > 0 && liters > 0) {
                    average = (unit === 'Km/L') ? (diff / liters) : (liters / diff);
                }
            }
            return { ...current, average, displayReading, readingLabel };
        });

        // 4. Média Geral Global
        let overallAverage = null;
        if (history.length > 1) {
            const newest = history[0];
            const oldest = history[history.length - 1];
            
            const getReading = (item) => {
                 if (unit === 'L/Hr') return parseFloat(item.horimetroDigital || item.horimetroAnalogico || item.horimetro || 0);
                 return parseFloat(item.odometro || 0);
            }

            const totalDiff = getReading(newest) - getReading(oldest);
            const totalLiters = history.slice(0, history.length - 1).reduce((acc, curr) => acc + (parseFloat(curr.litrosAbastecidos) || 0), 0);

            if (totalDiff > 0 && totalLiters > 0) {
                overallAverage = (unit === 'Km/L') ? (totalDiff / totalLiters) : (totalLiters / totalDiff);
            }
        }

        return { historyWithAverages, overallAverage, unit, readingLabel };
    }, [vehicleId, refuelings, vehicles, vehicleGroups]);

    const generateHistoryPDF = async () => {
        setIsGeneratingPdf(true);
        try {
            const doc = new jsPDF();
            const vehicle = vehicles.find(v => v.id === vehicleId);
            if (!vehicle) {
                setIsGeneratingPdf(false);
                return;
            }

            doc.setFontSize(16);
            doc.text(`Histórico de Consumo - ${vehicle.registroInterno}`, 14, 20);
            
            autoTable(doc, {
                startY: 30,
                head: [['Data', 'Posto', processedHistory.readingLabel, 'Litros', `Média (${processedHistory.unit})`]],
                body: processedHistory.historyWithAverages.map(h => [
                    formatDateSafe(h.data || h.date), // CORREÇÃO: Usa data OU date
                    h.partnerName,
                    h.displayReading,
                    (h.litrosAbastecidos || 0).toFixed(2),
                    h.average ? h.average.toFixed(2) : '-'
                ]),
                theme: 'striped',
                headStyles: { fillColor: [41, 128, 185] },
            });

            doc.save(`Historico_${vehicle.registroInterno}.pdf`);
            setIsGeneratingPdf(false);
        } catch (error) {
            console.error("Erro ao gerar PDF:", error);
            alert("Erro ao gerar o PDF.");
            setIsGeneratingPdf(false);
        }
    };

    if (!vehicleId) return (
        <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-gray-400">
            <Droplet size={40} className="mb-2 opacity-50"/>
            <p>Selecione um veículo para visualizar a análise de consumo.</p>
        </div>
    );

    return (
        <div className="animate-fadeIn">
            {/* Cards de Resumo */}
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">Média Geral</span>
                    <div className="text-2xl font-bold text-blue-700 mt-1">
                        {processedHistory.overallAverage ? processedHistory.overallAverage.toFixed(2) : '--'} 
                        <span className="text-sm text-blue-500 ml-1">{processedHistory.unit}</span>
                    </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 flex items-center justify-center">
                     <button 
                        onClick={generateHistoryPDF} 
                        disabled={isGeneratingPdf}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-bold shadow-sm disabled:opacity-50 transition"
                    >
                        {isGeneratingPdf ? <Loader className="animate-spin" size={16}/> : <Download size={16}/>} 
                        {isGeneratingPdf ? 'Gerando...' : 'Baixar Relatório PDF'}
                    </button>
                </div>
            </div>

            <div className="overflow-hidden border rounded-lg shadow-sm">
                <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 text-gray-600 font-bold text-xs uppercase sticky top-0">
                            <tr>
                                <th className="p-3">Data</th>
                                <th className="p-3">Posto</th>
                                <th className="p-3 text-right">{processedHistory.readingLabel}</th>
                                <th className="p-3 text-right">Litros</th>
                                <th className="p-3 text-right">Média</th>
                                <th className="p-3 text-center">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {processedHistory.historyWithAverages.map(h => (
                                <tr key={h.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-3">{formatDateSafe(h.data || h.date)}</td> {/* CORREÇÃO AQUI */}
                                    <td className="p-3 truncate max-w-[140px]">{h.partnerName}</td>
                                    <td className="p-3 text-right font-mono text-gray-600">{h.displayReading}</td>
                                    <td className="p-3 text-right font-bold">{h.litrosAbastecidos?.toFixed(2)}</td>
                                    <td className={`p-3 text-right font-bold ${!h.average ? 'text-gray-300' : 'text-blue-600'}`}>
                                        {h.average?.toFixed(2) || '-'}
                                    </td>
                                    <td className="p-3 text-center">
                                        <button 
                                            onClick={() => onGeneratePDF(h, vehicles, partners, employees, vehicleGroups)} 
                                            className="text-gray-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50 transition"
                                            title="Reimprimir 2ª Via"
                                        >
                                            <Printer size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default RefuelingHistory;