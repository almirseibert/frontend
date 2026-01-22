import React, { useState, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, Printer, Droplet, AlertCircle, RefreshCw } from 'lucide-react';
import { SectionHeader, FilterSection } from './ReportComponents';

const SupplyOrdersReport = ({ 
    supplyOrders, 
    refuelings, 
    vehicles = [], 
    obras = [], 
    partners, 
    gasStations, 
    employees = [] 
}) => {
    // --- 0. Tratamento Robusto de Props (Garante Arrays) ---
    // Prioriza 'refuelings' se 'supplyOrders' estiver vazio, adaptando-se à nomenclatura do seu banco SQL
    const rawOrders = Array.isArray(supplyOrders) && supplyOrders.length > 0 ? supplyOrders : (Array.isArray(refuelings) ? refuelings : []);
    const rawPartners = Array.isArray(partners) ? partners : (Array.isArray(gasStations) ? gasStations : []);

    // Filtros
    const [filters, setFilters] = useState({ 
        vehicleId: '', 
        obraId: '', 
        partnerId: '', 
        startDate: '',
        endDate: ''
    });

    const [selectedOrderIds, setSelectedOrderIds] = useState([]);
    const [selectAll, setSelectAll] = useState(false);

    // --- 1. Helpers de Data (Adaptado para SQL/MySQL) ---
    const getSafeDateObj = (dateInput) => {
        if (!dateInput) return new Date(0);
        
        // Se já for um objeto Date nativo do JS (comum em drivers MySQL configurados)
        if (dateInput instanceof Date) return dateInput;

        // Suporte legado a Timestamp do Firestore (caso tenha sobrado algum dado antigo)
        if (typeof dateInput.toDate === 'function') {
            return dateInput.toDate();
        }
        
        // Tratamento de String SQL (YYYY-MM-DD HH:mm:ss) ou ISO
        const str = String(dateInput).trim();
        
        // Corrige formato MySQL '2025-09-18 15:00:00' para ISO '2025-09-18T15:00:00'
        // Isso é crucial para funcionar no Safari e Firefox
        const isoStr = str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str;

        try {
            const d = new Date(isoStr);
            return isNaN(d.getTime()) ? new Date(0) : d;
        } catch { 
            return new Date(0); 
        }
    };

    // --- 2. Unificação e Processamento de Dados ---
    
    // Lista de Parceiros (Usa a prop ou extrai das ordens se a prop vier vazia)
    // Isso resolve o problema da "listagem de postos vazia"
    const partnersData = useMemo(() => {
        let list = [...rawPartners];
        
        // Se a lista de parceiros veio vazia, varre as ordens para encontrar os postos únicos
        if (list.length === 0 && rawOrders.length > 0) {
            const uniquePartners = new Map();
            rawOrders.forEach(o => {
                if (o.partnerId && !uniquePartners.has(o.partnerId)) {
                    // Tenta pegar o nome do posto de várias propriedades possíveis no seu banco SQL
                    const nomePosto = o.partnerName || o.postoNome || o.razaoSocial || 'Posto Desconhecido';
                    uniquePartners.set(o.partnerId, { 
                        id: o.partnerId, 
                        razaoSocial: nomePosto 
                    });
                }
            });
            list = Array.from(uniquePartners.values());
        }
        return list;
    }, [rawPartners, rawOrders]);

    // Ordenação de Listas para Filtros
    const sortedVehicles = useMemo(() => {
        return [...vehicles].sort((a, b) => {
            const labelA = `${a.registroInterno || ''} ${a.placa || ''}`; 
            const labelB = `${b.registroInterno || ''} ${b.placa || ''}`;
            return labelA.localeCompare(labelB);
        });
    }, [vehicles]);

    const sortedPartners = useMemo(() => {
        return [...partnersData].sort((a, b) => {
            const nomeA = a.razaoSocial || a.nome || '';
            const nomeB = b.razaoSocial || b.nome || '';
            return nomeA.localeCompare(nomeB);
        });
    }, [partnersData]);

    const sortedObras = useMemo(() => {
        return [...obras]
            .filter(o => o.status === 'ativa')
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    }, [obras]);

    // Colunas do PDF
    const allColumns = useMemo(() => [
        { key: 'formattedDate', label: 'Data Emissão' },
        { key: 'orderNumber', label: 'Nº Ordem' },
        { key: 'vehicleName', label: 'Veículo' },
        { key: 'driverName', label: 'Motorista' },
        { key: 'partnerName', label: 'Posto' },
        { key: 'obraName', label: 'Obra' },
        { key: 'fuelType', label: 'Combustível' },
        { key: 'quantity', label: 'Qtd Autorizada' },
        { key: 'status', label: 'Status' }
    ], []);

    // 3. Filtragem Principal
    const filteredOrders = useMemo(() => {
        // Passo 1: Filtrar apenas Abertas/Pendentes
        const openOrders = rawOrders.filter(o => {
            // Normaliza o status para comparação segura
            const st = (o.status || 'aberta').toLowerCase().trim();
            // Aceita variações comuns de status "aberto" no seu sistema
            return ['aberta', 'open', 'pendente', 'em aberto', 'autorizada', 'emitida'].includes(st);
        });

        // Passo 2: Preparar Datas do Filtro
        // Ajusta fuso horário se necessário (adiciona T00:00:00 para garantir início do dia)
        const start = filters.startDate ? new Date(filters.startDate + 'T00:00:00') : null;
        const end = filters.endDate ? new Date(filters.endDate + 'T23:59:59') : null;

        // Passo 3: Map e Filtro Final
        return openOrders.map(order => {
            const vehicle = vehicles.find(v => v.id === order.vehicleId);
            const partner = partnersData.find(p => p.id === order.partnerId);
            const obra = obras.find(o => o.id === order.obraId);
            const employee = employees.find(e => e.id === order.employeeId);

            // Data de Emissão (Prioriza data do abastecimento, depois createdAt)
            const dateObj = getSafeDateObj(order.data || order.date || order.createdAt);
            
            let qtdLabel = '0 L';
            if (order.isFillUp) {
                qtdLabel = 'Completo';
            } else if (order.litrosLiberados) {
                qtdLabel = `${order.litrosLiberados} L`;
            }

            return {
                ...order,
                id: order.id, // Garante que o ID esteja presente para as keys do React
                vehicleName: vehicle ? `${vehicle.registroInterno} - ${vehicle.modelo}` : (order.vehicleName || 'N/A'),
                partnerName: partner ? (partner.razaoSocial || partner.nome) : (order.partnerName || 'Posto N/A'),
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
            const matchPartner = filters.partnerId ? order.partnerId === filters.partnerId : true;
            
            let matchDate = true;
            if (start && end) {
                matchDate = order.rawDate >= start && order.rawDate <= end;
            } else if (start) {
                matchDate = order.rawDate >= start;
            } else if (end) {
                matchDate = order.rawDate <= end;
            }

            return matchVeh && matchObra && matchPartner && matchDate;
        }).sort((a,b) => a.rawDate - b.rawDate); 

    }, [rawOrders, vehicles, obras, partnersData, employees, filters]);

    // Atualiza seleção "Selecionar Todos"
    useEffect(() => {
        if (filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length) {
            setSelectAll(true);
        } else {
            setSelectAll(false);
        }
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
                o.orderNumber,
                o.vehicleName,
                o.driverName,
                o.partnerName,
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
            headStyles: { fillColor: [220, 38, 38] }, 
            styles: { fontSize: 7, cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: 20 },
                2: { cellWidth: 35 },
                4: { cellWidth: 30 },
            }
        });
        doc.save('Relatorio_Ordens_Aberto.pdf');
    };

    // Mensagem de Debug amigável se os dados realmente não estiverem chegando
    if (rawOrders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-gray-50 border border-gray-200 rounded-lg text-center animate-fade-in">
                <AlertCircle className="text-yellow-500 mb-3" size={40} />
                <h3 className="font-bold text-gray-700 text-lg">Nenhuma Ordem Localizada</h3>
                <p className="text-sm text-gray-500 max-w-md">
                    O sistema não encontrou ordens de abastecimento carregadas no momento.
                </p>
                <div className="mt-4 p-3 bg-gray-100 rounded text-xs text-left font-mono text-gray-600">
                    <p><strong>Diagnóstico Técnico:</strong></p>
                    <p>Ordens Recebidas (props): {rawOrders.length}</p>
                    <p>Postos Recebidos (props): {rawPartners.length}</p>
                    <p>Status: Verifique se a API retornou o array 'refuelings'.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in space-y-4">
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
                    {sortedVehicles.map(v => (
                        <option key={v.id} value={v.id}>
                            {v.registroInterno} - {v.modelo}
                        </option>
                    ))}
                </select>

                <select value={filters.partnerId} onChange={e => setFilters({...filters, partnerId: e.target.value})} className="input-field">
                    <option value="">Todos os Postos ({sortedPartners.length})</option>
                    {sortedPartners.map(p => (
                        <option key={p.id} value={p.id}>
                            {p.razaoSocial || p.nome || 'Sem Nome'}
                        </option>
                    ))}
                </select>

                <select value={filters.obraId} onChange={e => setFilters({...filters, obraId: e.target.value})} className="input-field">
                    <option value="">Todas as Obras</option>
                    {sortedObras.map(o => (
                        <option key={o.id} value={o.id}>
                            {o.nome}
                        </option>
                    ))}
                </select>
            </FilterSection>

            <div className="border rounded-lg max-h-[500px] overflow-y-auto bg-white custom-scrollbar shadow-sm">
                <table className="w-full text-xs text-left">
                    <thead className="bg-gray-100 sticky top-0 uppercase text-gray-600 font-bold z-10 shadow-sm">
                        <tr>
                            <th className="p-3 w-10 text-center">
                                <input 
                                    type="checkbox" 
                                    checked={selectAll} 
                                    onChange={e => {
                                        setSelectAll(e.target.checked); 
                                        setSelectedOrderIds(e.target.checked ? filteredOrders.map(x=>x.id) : [])
                                    }} 
                                    disabled={filteredOrders.length === 0}
                                    className="rounded text-red-600 focus:ring-red-500"
                                />
                            </th>
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
                            <tr>
                                <td colSpan="7" className="p-8 text-center text-gray-400">
                                    <div className="flex flex-col items-center">
                                        <RefreshCw size={24} className="mb-2 opacity-20"/>
                                        <p>Nenhuma ordem em aberto encontrada com os filtros atuais.</p>
                                        <p className="text-[10px] mt-1 text-gray-300">Total Bruto: {rawOrders.length} ordens carregadas.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredOrders.map(o => (
                                <tr key={o.id} className={`hover:bg-red-50 transition-colors ${selectedOrderIds.includes(o.id) ? 'bg-red-50' : ''}`}>
                                    <td className="p-3 text-center">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedOrderIds.includes(o.id)} 
                                            onChange={() => setSelectedOrderIds(p => p.includes(o.id) ? p.filter(x=>x!==o.id) : [...p, o.id])} 
                                            className="rounded text-red-600 focus:ring-red-500"
                                        />
                                    </td>
                                    <td className="p-3">{o.formattedDate}</td>
                                    <td className="p-3 font-bold text-gray-800">{o.orderNumber}</td>
                                    <td className="p-3 font-medium">{o.vehicleName}</td>
                                    <td className="p-3 truncate max-w-[150px]" title={o.partnerName}>{o.partnerName}</td>
                                    <td className="p-3 font-bold">{o.quantity}</td>
                                    <td className="p-3"><span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-[10px] font-bold">{o.status}</span></td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-end pt-2">
                <button onClick={handleGeneratePDF} disabled={selectedOrderIds.length === 0} className="btn-primary w-full md:w-auto bg-red-600 hover:bg-red-700 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded text-white font-bold shadow">
                    <Printer size={18}/> Gerar PDF ({selectedOrderIds.length})
                </button>
            </div>
        </div>
    );
};

export default SupplyOrdersReport;