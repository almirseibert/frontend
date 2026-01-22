import React, { useState, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, Printer, Droplet } from 'lucide-react';
import { SectionHeader, FilterSection } from './ReportComponents';

const SupplyOrdersReport = ({ supplyOrders = [], vehicles = [], obras = [], gasStations = [] }) => {
    // Filtros
    const [filters, setFilters] = useState({ 
        vehicleId: '', 
        obraId: '', 
        stationId: '', // Posto
        startDate: '',
        endDate: ''
    });

    const [selectedOrderIds, setSelectedOrderIds] = useState([]);
    const [selectAll, setSelectAll] = useState(false);

    // Colunas disponíveis para o relatório
    const allColumns = useMemo(() => [
        { key: 'createdAt', label: 'Data Emissão' },
        { key: 'orderNumber', label: 'Nº Ordem' },
        { key: 'vehicleName', label: 'Veículo' },
        { key: 'driverName', label: 'Motorista' },
        { key: 'stationName', label: 'Posto' },
        { key: 'obraName', label: 'Obra' },
        { key: 'fuelType', label: 'Combustível' },
        { key: 'quantity', label: 'Qtd (L)' },
        { key: 'status', label: 'Status' }
    ], []);

    // 1. Processamento e Filtragem
    const filteredOrders = useMemo(() => {
        // Considera apenas ordens EM ABERTO (ou pendentes)
        // Ajuste os status conforme seu backend: 'open', 'pending', 'em aberto'
        const openOrders = supplyOrders.filter(o => 
            ['open', 'pending', 'em aberto', 'pendente'].includes((o.status || '').toLowerCase())
        );

        // Filtros de Data
        const start = filters.startDate ? new Date(filters.startDate) : null;
        const end = filters.endDate ? new Date(filters.endDate) : null;
        if (end) end.setHours(23, 59, 59);

        return openOrders.map(order => {
            const vehicle = vehicles.find(v => v.id === order.vehicleId);
            const station = gasStations.find(s => s.id === order.stationId);
            const obra = obras.find(o => o.id === order.obraId); // Se houver vínculo com obra na ordem

            return {
                ...order,
                vehicleName: vehicle ? `${vehicle.registroInterno} - ${vehicle.modelo}` : 'N/A',
                stationName: station ? station.nome : (order.stationName || 'N/A'),
                obraName: obra ? obra.nome : 'N/A',
                formattedDate: new Date(order.createdAt).toLocaleDateString('pt-BR'),
                rawDate: new Date(order.createdAt)
            };
        }).filter(order => {
            const matchVeh = filters.vehicleId ? order.vehicleId === filters.vehicleId : true;
            const matchObra = filters.obraId ? order.obraId === filters.obraId : true;
            const matchStation = filters.stationId ? order.stationId === filters.stationId : true;
            
            let matchDate = true;
            if (start && end) {
                matchDate = order.rawDate >= start && order.rawDate <= end;
            }

            return matchVeh && matchObra && matchStation && matchDate;
        }).sort((a,b) => a.rawDate - b.rawDate);

    }, [supplyOrders, vehicles, obras, gasStations, filters]);

    useEffect(() => {
        setSelectAll(filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length);
    }, [selectedOrderIds, filteredOrders]);

    const handleGeneratePDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text('Relatório de Ordens de Abastecimento em Aberto', 14, 22);
        doc.setFontSize(10);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);
        
        const headers = allColumns.map(c => c.label);
        const body = filteredOrders
            .filter(o => selectedOrderIds.includes(o.id))
            .map(o => [
                o.formattedDate,
                o.orderNumber || o.id.slice(0,6).toUpperCase(), // Fallback se não tiver número sequencial
                o.vehicleName,
                o.driverName || 'N/A',
                o.stationName,
                o.obraName,
                o.fuelType || 'Diesel',
                o.quantity || '-',
                (o.status || 'Aberto').toUpperCase()
            ]);

        autoTable(doc, {
            startY: 35,
            head: [headers],
            body,
            theme: 'striped',
            headStyles: { fillColor: [220, 38, 38] }, // Vermelho para chamar atenção (pendência)
            styles: { fontSize: 8 },
        });
        doc.save('Relatorio_Ordens_Aberto.pdf');
    };

    return (
        <div className="animate-fade-in">
            <SectionHeader icon={Droplet} title="Ordens de Abastecimento (Em Aberto)" description="Controle de ordens emitidas ainda não conciliadas." />
            
            <FilterSection>
                <div className="col-span-1 md:col-span-2 flex gap-2">
                    <div className="flex-1">
                        <label className="text-[10px] uppercase font-bold text-gray-500">De:</label>
                        <input type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} className="input-field" />
                    </div>
                    <div className="flex-1">
                        <label className="text-[10px] uppercase font-bold text-gray-500">Até:</label>
                        <input type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} className="input-field" />
                    </div>
                </div>

                <select value={filters.vehicleId} onChange={e => setFilters({...filters, vehicleId: e.target.value})} className="input-field">
                    <option value="">Todos os Veículos</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.modelo}</option>)}
                </select>

                <select value={filters.stationId} onChange={e => setFilters({...filters, stationId: e.target.value})} className="input-field">
                    <option value="">Todos os Postos</option>
                    {gasStations.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>

                <select value={filters.obraId} onChange={e => setFilters({...filters, obraId: e.target.value})} className="input-field">
                    <option value="">Todas as Obras</option>
                    {obras.filter(o => o.status === 'ativa').map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
            </FilterSection>

            <div className="border rounded-lg max-h-80 overflow-y-auto mb-4 bg-white custom-scrollbar">
                <table className="w-full text-xs text-left">
                    <thead className="bg-gray-100 sticky top-0 uppercase text-gray-600 font-bold">
                        <tr>
                            <th className="p-3 w-10 text-center"><input type="checkbox" checked={selectAll} onChange={e => {setSelectAll(e.target.checked); setSelectedOrderIds(e.target.checked ? filteredOrders.map(x=>x.id) : [])}} className="rounded text-red-600 focus:ring-red-500"/></th>
                            <th className="p-3">Data</th>
                            <th className="p-3">Veículo</th>
                            <th className="p-3">Posto</th>
                            <th className="p-3">Motorista</th>
                            <th className="p-3">Qtd (L)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filteredOrders.length === 0 ? (
                            <tr><td colSpan="6" className="p-4 text-center text-gray-400">Nenhuma ordem em aberto encontrada.</td></tr>
                        ) : (
                            filteredOrders.map(o => (
                                <tr key={o.id} className={`hover:bg-red-50 ${selectedOrderIds.includes(o.id) ? 'bg-red-50' : ''}`}>
                                    <td className="p-3 text-center"><input type="checkbox" checked={selectedOrderIds.includes(o.id)} onChange={() => setSelectedOrderIds(p => p.includes(o.id) ? p.filter(x=>x!==o.id) : [...p, o.id])} className="rounded text-red-600 focus:ring-red-500"/></td>
                                    <td className="p-3">{o.formattedDate}</td>
                                    <td className="p-3 font-medium">{o.vehicleName}</td>
                                    <td className="p-3">{o.stationName}</td>
                                    <td className="p-3">{o.driverName}</td>
                                    <td className="p-3 font-bold">{o.quantity} L</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <button onClick={handleGeneratePDF} disabled={selectedOrderIds.length === 0} className="btn-primary w-full md:w-auto bg-red-600 hover:bg-red-700 flex items-center justify-center gap-2">
                <Printer size={18}/> Gerar PDF ({selectedOrderIds.length})
            </button>
        </div>
    );
};

export default SupplyOrdersReport;