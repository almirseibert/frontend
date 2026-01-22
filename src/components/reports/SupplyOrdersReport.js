import React, { useState, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, Printer, Droplet } from 'lucide-react';
import { SectionHeader, FilterSection } from './ReportComponents';

const SupplyOrdersReport = ({ supplyOrders = [], vehicles = [], obras = [], gasStations = [], employees = [] }) => {
    // Filtros
    const [filters, setFilters] = useState({ 
        vehicleId: '', 
        obraId: '', 
        stationId: '', // Posto (partnerId)
        startDate: '',
        endDate: ''
    });

    const [selectedOrderIds, setSelectedOrderIds] = useState([]);
    const [selectAll, setSelectAll] = useState(false);

    // --- Helpers de Data (Igual ao RefuelingPage) ---
    const isValidDbDate = (dateString) => {
        if (!dateString) return false;
        const str = String(dateString);
        return str.length > 5 && !str.startsWith('0000') && str !== '1970-01-01T00:00:00.000Z';
    };

    const getSafeDateObj = (dateInput) => {
        if (!isValidDbDate(dateInput)) return new Date(0);
        try {
            let dateStr = String(dateInput);
            if (dateStr.includes(' ') && !dateStr.includes('T')) dateStr = dateStr.replace(' ', 'T');
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? new Date(0) : d;
        } catch { return new Date(0); }
    };

    // Colunas disponíveis para o relatório
    const allColumns = useMemo(() => [
        { key: 'formattedDate', label: 'Data Emissão' },
        { key: 'orderNumber', label: 'Nº Ordem' },
        { key: 'vehicleName', label: 'Veículo' },
        { key: 'driverName', label: 'Motorista' },
        { key: 'stationName', label: 'Posto' },
        { key: 'obraName', label: 'Obra' },
        { key: 'fuelType', label: 'Combustível' },
        { key: 'quantity', label: 'Qtd Autorizada' },
        { key: 'status', label: 'Status' }
    ], []);

    // 1. Processamento e Filtragem
    const filteredOrders = useMemo(() => {
        // Filtra ordens com status "Aberta" (Case Insensitive e variações)
        const openOrders = supplyOrders.filter(o => {
            const st = (o.status || '').toLowerCase();
            return ['aberta', 'open', 'pendente', 'em aberto'].includes(st);
        });

        // Filtros de Data
        const start = filters.startDate ? new Date(filters.startDate) : null;
        if (start) start.setHours(0,0,0,0);
        
        const end = filters.endDate ? new Date(filters.endDate) : null;
        if (end) end.setHours(23, 59, 59);

        return openOrders.map(order => {
            const vehicle = vehicles.find(v => v.id === order.vehicleId);
            // Procura o posto (gasStations é a lista de partners)
            const station = gasStations.find(s => s.id === order.partnerId || s.id === order.stationId);
            const obra = obras.find(o => o.id === order.obraId);
            const employee = employees.find(e => e.id === order.employeeId);

            // Data de Emissão
            const dateObj = getSafeDateObj(order.data || order.date || order.createdAt);
            
            // Quantidade (Tratamento para 'Completar Tanque')
            let qtdLabel = '0 L';
            if (order.isFillUp) {
                qtdLabel = 'Completo';
            } else if (order.litrosLiberados) {
                qtdLabel = `${order.litrosLiberados} L`;
            }

            return {
                ...order,
                vehicleName: vehicle ? `${vehicle.registroInterno} - ${vehicle.modelo}` : 'N/A',
                stationName: station ? (station.razaoSocial || station.nome) : (order.partnerName || 'N/A'),
                obraName: obra ? obra.nome : 'N/A',
                driverName: employee ? employee.nome : (order.employeeName || 'N/A'),
                formattedDate: dateObj.toLocaleDateString('pt-BR'),
                rawDate: dateObj,
                orderNumber: order.authNumber ? `#${String(order.authNumber).padStart(6, '0')}` : 'N/A',
                fuelType: order.fuelType || 'Diesel',
                quantity: qtdLabel,
                status: (order.status || 'Aberta').toUpperCase()
            };
        }).filter(order => {
            const matchVeh = filters.vehicleId ? order.vehicleId === filters.vehicleId : true;
            const matchObra = filters.obraId ? order.obraId === filters.obraId : true;
            const matchStation = filters.stationId ? order.partnerId === filters.stationId : true;
            
            let matchDate = true;
            if (start && end) {
                matchDate = order.rawDate >= start && order.rawDate <= end;
            }

            return matchVeh && matchObra && matchStation && matchDate;
        }).sort((a,b) => a.rawDate - b.rawDate); // Ordena por data (mais antigas primeiro)

    }, [supplyOrders, vehicles, obras, gasStations, employees, filters]);

    useEffect(() => {
        setSelectAll(filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length);
    }, [selectedOrderIds, filteredOrders]);

    const handleGeneratePDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text('Relatório de Ordens de Abastecimento em Aberto', 14, 22);
        doc.setFontSize(10);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);
        
        // Cabeçalhos (extraídos da config)
        const headers = allColumns.map(c => c.label);
        
        // Corpo da tabela
        const body = filteredOrders
            .filter(o => selectedOrderIds.includes(o.id))
            .map(o => [
                o.formattedDate,
                o.orderNumber,
                o.vehicleName,
                o.driverName,
                o.stationName,
                o.obraName,
                o.fuelType,
                o.quantity,
                o.status
            ]);

        autoTable(doc, {
            startY: 35,
            head: [headers],
            body,
            theme: 'striped',
            headStyles: { fillColor: [220, 38, 38] }, // Vermelho para indicar pendência
            styles: { fontSize: 7, cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: 20 }, // Data
                2: { cellWidth: 35 }, // Veículo
                4: { cellWidth: 30 }, // Posto
            }
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
                    {gasStations.map(s => <option key={s.id} value={s.id}>{s.razaoSocial || s.nome}</option>)}
                </select>

                <select value={filters.obraId} onChange={e => setFilters({...filters, obraId: e.target.value})} className="input-field">
                    <option value="">Todas as Obras</option>
                    {obras.filter(o => o.status === 'ativa').map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
            </FilterSection>

            <div className="border rounded-lg max-h-80 overflow-y-auto mb-4 bg-white custom-scrollbar">
                <table className="w-full text-xs text-left">
                    <thead className="bg-gray-100 sticky top-0 uppercase text-gray-600 font-bold z-10">
                        <tr>
                            <th className="p-3 w-10 text-center"><input type="checkbox" checked={selectAll} onChange={e => {setSelectAll(e.target.checked); setSelectedOrderIds(e.target.checked ? filteredOrders.map(x=>x.id) : [])}} className="rounded text-red-600 focus:ring-red-500"/></th>
                            <th className="p-3">Data</th>
                            <th className="p-3">Nº Ordem</th>
                            <th className="p-3">Veículo</th>
                            <th className="p-3">Posto</th>
                            <th className="p-3">Qtd</th>
                            <th className="p-3">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filteredOrders.length === 0 ? (
                            <tr><td colSpan="7" className="p-4 text-center text-gray-400">Nenhuma ordem em aberto encontrada.</td></tr>
                        ) : (
                            filteredOrders.map(o => (
                                <tr key={o.id} className={`hover:bg-red-50 ${selectedOrderIds.includes(o.id) ? 'bg-red-50' : ''}`}>
                                    <td className="p-3 text-center"><input type="checkbox" checked={selectedOrderIds.includes(o.id)} onChange={() => setSelectedOrderIds(p => p.includes(o.id) ? p.filter(x=>x!==o.id) : [...p, o.id])} className="rounded text-red-600 focus:ring-red-500"/></td>
                                    <td className="p-3">{o.formattedDate}</td>
                                    <td className="p-3 font-bold text-gray-800">{o.orderNumber}</td>
                                    <td className="p-3 font-medium">{o.vehicleName}</td>
                                    <td className="p-3 truncate max-w-[150px]">{o.stationName}</td>
                                    <td className="p-3 font-bold">{o.quantity}</td>
                                    <td className="p-3"><span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-[10px] font-bold">{o.status}</span></td>
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