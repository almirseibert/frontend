import React, { useState, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
    Download, Users, Truck, FileText, AlertTriangle, 
    ClipboardCheck, Filter, Printer, HardHat, Loader 
} from 'lucide-react';

// Importa o componente de proteção
import ProtectedComponent from '../components/ProtectedComponent';
import apiClient from '../services/apiClient'; // Adicionado para buscar dados atualizados

// ===================================================================================
// COMPONENTES AUXILIARES & ESTILOS VISUAIS
// ===================================================================================

const SectionHeader = ({ icon: Icon, title, description }) => (
    <div className="mb-6 border-b pb-4">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Icon className="text-yellow-500" size={24} />
            {title}
        </h2>
        {description && <p className="text-sm text-gray-500 mt-1 ml-8">{description}</p>}
    </div>
);

const FilterSection = ({ children }) => (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6 shadow-sm">
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-1">
            <Filter size={14} /> Filtros de Relatório
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {children}
        </div>
    </div>
);

// ===================================================================================
// 1. GERADOR DE RELATÓRIO DE VEÍCULOS
// ===================================================================================
const VehicleReportGenerator = ({ vehicles = [], obras = [], vehicleGroups = {} }) => {
    const [filters, setFilters] = useState({ type: '', obraId: '', status: '', group: '' });
    const [selectedVehicleIds, setSelectedVehicleIds] = useState([]);
    const [selectAll, setSelectAll] = useState(false);
    
    // Configuração de Colunas
    const allColumns = useMemo(() => [
        { key: 'registroInterno', label: 'Registro Interno' },
        { key: 'placa', label: 'Placa' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'marca', label: 'Marca' },
        { key: 'modelo', label: 'Modelo' },
        { key: 'status', label: 'Status' },
        { key: 'obraAtual', label: 'Obra/Local Atual' },
        { key: 'leituraPrincipal', label: 'Leitura Principal' },
        { key: 'ano_fabricacao', label: 'Ano Fab.' },
        { key: 'ano_modelo', label: 'Ano Mod.' },
        { key: 'chassi', label: 'Chassi' },
    ], []);

    const [selectedColumns, setSelectedColumns] = useState(['registroInterno', 'placa', 'tipo', 'modelo', 'status', 'obraAtual', 'leituraPrincipal']);

    // Filtragem de Veículos
    const filteredVehicles = useMemo(() => {
        const groups = vehicleGroups || {};
        return vehicles
            .map(v => {
                if (!v) return null;
                const vehicleGroup = Object.keys(groups).find(key => groups[key]?.includes(v.tipo)) || 'Outros';
                
                // Formata leitura
                let leituraPrincipal = '';
                if (vehicleGroup === 'Máquinas Pesadas') leituraPrincipal = `${v.horimetro ?? 'N/A'} Hr`;
                else if (vehicleGroup === 'Caminhões') leituraPrincipal = `${v.odometro ?? 'N/A'} Km / ${v.horimetro ?? 'N/A'} Hr`;
                else leituraPrincipal = `${v.odometro ?? 'N/A'} Km`;

                const obra = obras.find(o => o.id === v.obraAtualId);
                const obraAtual = obra ? obra.nome : (v.localizacaoAtual || 'N/A');
                
                return { ...v, vehicleGroup, leituraPrincipal, obraAtual };
            }).filter(Boolean)
            .filter(v => (
                (filters.type ? v.tipo === filters.type : true) &&
                (filters.obraId ? v.obraAtualId === filters.obraId : true) &&
                (filters.status ? v.status === filters.status : true) &&
                (filters.group ? v.vehicleGroup === filters.group : true)
            ))
            .sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || ''));
    }, [vehicles, filters, vehicleGroups, obras]);

    useEffect(() => {
        if (filteredVehicles.length > 0) {
            setSelectAll(selectedVehicleIds.length === filteredVehicles.length);
        } else {
            setSelectAll(false);
        }
    }, [selectedVehicleIds, filteredVehicles]);

    const handleSelectAll = (e) => {
        const checked = e.target.checked;
        setSelectAll(checked);
        setSelectedVehicleIds(checked ? filteredVehicles.map(v => v.id) : []);
    };

    const handleGeneratePDF = () => {
        if (selectedVehicleIds.length === 0 || selectedColumns.length === 0) return alert("Selecione ao menos um veículo e uma coluna.");
        
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(18);
        doc.text('Relatório de Veículos - Frota MAK', 14, 22);
        doc.setFontSize(10);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);
        
        const headers = selectedColumns.map(colKey => allColumns.find(c => c.key === colKey)?.label || colKey);
        const body = filteredVehicles
            .filter(v => selectedVehicleIds.includes(v.id))
            .map(vehicle => selectedColumns.map(colKey => vehicle[colKey] != null ? String(vehicle[colKey]) : ''));

        autoTable(doc, {
            startY: 35,
            head: [headers],
            body,
            theme: 'striped',
            headStyles: { fillColor: [3, 105, 161] },
            styles: { fontSize: 8, cellPadding: 2 },
        });
        doc.save('Relatorio_Veiculos_MAK.pdf');
    };

    const vehicleTypes = useMemo(() => [...new Set((vehicles || []).map(v => v?.tipo).filter(Boolean))].sort(), [vehicles]);
    const vehicleGroupOptions = useMemo(() => vehicleGroups ? Object.keys(vehicleGroups).sort() : [], [vehicleGroups]);

    return (
        <div className="animate-fade-in">
            <SectionHeader icon={Truck} title="Relatório Geral de Veículos" description="Listagem completa da frota com filtros por grupo, tipo e localização." />
            
            <FilterSection>
                <select value={filters.group} onChange={e => setFilters({...filters, group: e.target.value})} className="input-field">
                    <option value="">Todos os Grupos</option>
                    {vehicleGroupOptions.map(g => <option key={g} value={g}>{g}</option>)}
                    <option value="Outros">Outros</option>
                </select>
                <select value={filters.type} onChange={e => setFilters({...filters, type: e.target.value})} className="input-field">
                    <option value="">Todos os Tipos</option>
                    {vehicleTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={filters.obraId} onChange={e => setFilters({...filters, obraId: e.target.value})} className="input-field">
                    <option value="">Todas as Obras</option>
                    <option value="N/A">Sem Obra (Pátio/Outros)</option>
                    {obras.filter(o => o.status === 'ativa').map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
                <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className="input-field">
                    <option value="">Todos os Status</option>
                    {[...new Set(vehicles.map(v => v.status))].filter(Boolean).sort().map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </FilterSection>

            <div className="mb-4 p-4 bg-white border rounded-lg">
                <h4 className="font-semibold text-sm mb-3">Colunas Visíveis</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
                    {allColumns.map(col => (
                        <label key={col.key} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 p-1 rounded">
                            <input 
                                type="checkbox" 
                                checked={selectedColumns.includes(col.key)} 
                                onChange={() => setSelectedColumns(p => p.includes(col.key) ? p.filter(c => c !== col.key) : [...p, col.key])} 
                                className="rounded text-red-600 focus:ring-red-500"
                            />
                            {col.label}
                        </label>
                    ))}
                </div>
            </div>

            <div className="border rounded-lg max-h-80 overflow-y-auto mb-4 custom-scrollbar bg-white">
                <table className="w-full text-xs text-left">
                    <thead className="bg-gray-100 sticky top-0 z-10 uppercase text-gray-600 font-bold">
                        <tr>
                            <th className="p-3 w-10 text-center"><input type="checkbox" checked={selectAll} onChange={handleSelectAll} className="rounded text-red-600 focus:ring-red-500"/></th>
                            <th className="p-3">Registro</th>
                            <th className="p-3">Placa</th>
                            <th className="p-3">Tipo</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Local Atual</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filteredVehicles.map(v => (
                            <tr key={v.id} className={`hover:bg-red-50 ${selectedVehicleIds.includes(v.id) ? 'bg-red-50' : ''}`}>
                                <td className="p-3 text-center"><input type="checkbox" checked={selectedVehicleIds.includes(v.id)} onChange={() => setSelectedVehicleIds(prev => prev.includes(v.id) ? prev.filter(id => id !== v.id) : [...prev, v.id])} className="rounded text-red-600 focus:ring-red-500"/></td>
                                <td className="p-3 font-bold text-gray-700">{v.registroInterno}</td>
                                <td className="p-3">{v.placa}</td>
                                <td className="p-3">{v.tipo}</td>
                                <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${v.status === 'Disponível' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{v.status}</span></td>
                                <td className="p-3 text-gray-500 truncate max-w-[150px]">{v.obraAtual}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <button onClick={handleGeneratePDF} disabled={selectedVehicleIds.length === 0} className="btn-primary w-full md:w-auto flex items-center justify-center gap-2">
                <Printer size={18}/> Gerar PDF ({selectedVehicleIds.length})
            </button>
        </div>
    );
};

// ===================================================================================
// 2. GERADOR DE RELATÓRIO DE FUNCIONÁRIOS
// ===================================================================================
const EmployeeReportGenerator = ({ employees = [], obras = [], vehicles = [], fines = [] }) => {
    const [filters, setFilters] = useState({ cidade: '', funcao: '', status: 'ativo', obraId: '' });
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
    const [selectAll, setSelectAll] = useState(false);
    const [selectedColumns, setSelectedColumns] = useState(['nome', 'funcao', 'allocationStatus', 'cidade', 'contato', 'obraAtual']);

    const allColumns = useMemo(() => [
        { key: 'nome', label: 'Nome' },
        { key: 'vulgo', label: 'Apelido' },
        { key: 'funcao', label: 'Função' },
        { key: 'status', label: 'Status Cadastro' },
        { key: 'allocationStatus', label: 'Status Alocação' },
        { key: 'cidade', label: 'Cidade' },
        { key: 'contato', label: 'Telefone' },
        { key: 'obraAtual', label: 'Obra Atual' },
        { key: 'veiculosAlocados', label: 'Veículos Alocados' },
        { key: 'cnhInfo', label: 'CNH (Cat/Venc)'},
        { key: 'multasPendentes', label: 'Multas Pendentes' },
    ], []);

    const currentAllocations = useMemo(() => {
        const allocations = new Map();
        obras.forEach(obra => {
            (Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : []).forEach(history => {
                if (history.employeeId && !history.dataSaida) { 
                    const vehicle = vehicles.find(v => v.id === history.veiculoId);
                    if (!allocations.has(history.employeeId)) allocations.set(history.employeeId, { obraId: obra.id, obraNome: obra.nome, vehicleRegistros: [] });
                    if (vehicle) allocations.get(history.employeeId).vehicleRegistros.push(vehicle.registroInterno || 'N/A');
                }
            });
        });
        vehicles.forEach(vehicle => {
            if (vehicle.operationalAssignment?.employeeId) {
                const eId = vehicle.operationalAssignment.employeeId;
                if (!allocations.has(eId)) allocations.set(eId, { obraId: null, obraNome: 'Operacional', vehicleRegistros: [] });
                allocations.get(eId).vehicleRegistros.push(vehicle.registroInterno || 'N/A');
            }
        });
        return allocations;
    }, [obras, vehicles]);

    const filteredEmployees = useMemo(() => {
        return employees
            .map(e => ({
                ...e,
                allocationStatus: e.status === 'inativo' ? 'Inativo' : (currentAllocations.has(e.id) ? 'Alocado' : 'Disponível'),
                obraAtual: currentAllocations.get(e.id)?.obraNome || 'N/A'
            }))
            .filter(e => (
                (filters.cidade ? e.cidade === filters.cidade : true) &&
                (filters.funcao ? e.funcao === filters.funcao : true) &&
                (filters.status ? e.status === filters.status : true) &&
                (filters.obraId ? (currentAllocations.get(e.id)?.obraId === filters.obraId || (filters.obraId === 'N/A' && !currentAllocations.has(e.id))) : true)
            ))
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    }, [employees, filters, currentAllocations]);

    useEffect(() => {
        setSelectAll(filteredEmployees.length > 0 && selectedEmployeeIds.length === filteredEmployees.length);
    }, [selectedEmployeeIds, filteredEmployees]);

    const handleGeneratePDF = () => {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(18); doc.text('Relatório de Funcionários - Frota MAK', 14, 22);
        
        const headers = selectedColumns.map(c => allColumns.find(col => col.key === c)?.label || c);
        const body = filteredEmployees.filter(e => selectedEmployeeIds.includes(e.id)).map(emp => {
            const alloc = currentAllocations.get(emp.id);
            const veiculosAlocados = alloc ? alloc.vehicleRegistros.join(', ') : '';
            const cnhVenc = emp.cnhVencimento ? new Date(emp.cnhVencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A';
            const multas = fines.filter(f => f.employeeId === emp.id && f.status === 'Pendente').length;
            
            const data = { ...emp, veiculosAlocados, cnhInfo: `${emp.cnhCategoria || ''} - ${cnhVenc}`, multasPendentes: multas };
            return selectedColumns.map(col => data[col] || '');
        });

        autoTable(doc, { startY: 30, head: [headers], body, theme: 'striped', headStyles: { fillColor: [34, 139, 34] }, styles: { fontSize: 8 } });
        doc.save('Relatorio_Funcionarios.pdf');
    };

    return (
        <div className="animate-fade-in">
            <SectionHeader icon={Users} title="Relatório de Funcionários" description="Gestão de quadro de pessoal, alocações e conformidade." />
            
            <FilterSection>
                <select value={filters.funcao} onChange={e => setFilters({...filters, funcao: e.target.value})} className="input-field">
                    <option value="">Todas as Funções</option>
                    {[...new Set(employees.map(e => e.funcao).filter(Boolean))].sort().map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={filters.obraId} onChange={e => setFilters({...filters, obraId: e.target.value})} className="input-field">
                    <option value="">Todas as Obras (Alocação)</option>
                    <option value="N/A">Sem Alocação</option>
                    {obras.filter(o => o.status === 'ativa').map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
                <select value={filters.cidade} onChange={e => setFilters({...filters, cidade: e.target.value})} className="input-field">
                    <option value="">Todas as Cidades</option>
                    {[...new Set(employees.map(e => e.cidade).filter(Boolean))].sort().map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className="input-field">
                    <option value="ativo">Ativos</option>
                    <option value="inativo">Inativos</option>
                </select>
            </FilterSection>

            {/* Seleção de Colunas */}
            <div className="mb-4 bg-white p-3 rounded border">
                <span className="text-xs font-bold text-gray-500 uppercase mb-2 block">Colunas</span>
                <div className="flex flex-wrap gap-2">
                    {allColumns.map(col => (
                        <button 
                            key={col.key} 
                            onClick={() => setSelectedColumns(p => p.includes(col.key) ? p.filter(c => c !== col.key) : [...p, col.key])}
                            className={`px-2 py-1 text-xs rounded border transition ${selectedColumns.includes(col.key) ? 'bg-green-100 border-green-300 text-green-800 font-semibold' : 'bg-gray-50 text-gray-600'}`}
                        >
                            {col.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="border rounded-lg max-h-80 overflow-y-auto mb-4 bg-white custom-scrollbar">
                <table className="w-full text-xs text-left">
                    <thead className="bg-gray-100 sticky top-0 uppercase text-gray-600 font-bold">
                        <tr>
                            <th className="p-3 w-10 text-center"><input type="checkbox" checked={selectAll} onChange={e => {setSelectAll(e.target.checked); setSelectedEmployeeIds(e.target.checked ? filteredEmployees.map(x=>x.id) : [])}} className="rounded text-green-600 focus:ring-green-500"/></th>
                            <th className="p-3">Nome</th>
                            <th className="p-3">Função</th>
                            <th className="p-3">Obra Atual</th>
                            <th className="p-3">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filteredEmployees.map(e => (
                            <tr key={e.id} className={`hover:bg-green-50 ${selectedEmployeeIds.includes(e.id) ? 'bg-green-50' : ''}`}>
                                <td className="p-3 text-center"><input type="checkbox" checked={selectedEmployeeIds.includes(e.id)} onChange={() => setSelectedEmployeeIds(p => p.includes(e.id) ? p.filter(x=>x!==e.id) : [...p, e.id])} className="rounded text-green-600 focus:ring-green-500"/></td>
                                <td className="p-3 font-medium">{e.nome}</td>
                                <td className="p-3">{e.funcao}</td>
                                <td className="p-3 truncate max-w-[150px]">{e.obraAtual}</td>
                                <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${e.allocationStatus === 'Alocado' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{e.allocationStatus}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <button onClick={handleGeneratePDF} disabled={selectedEmployeeIds.length === 0} className="btn-primary w-full md:w-auto bg-green-600 hover:bg-green-700 flex items-center justify-center gap-2">
                <Printer size={18}/> Gerar PDF ({selectedEmployeeIds.length})
            </button>
        </div>
    );
};

// ===================================================================================
// 3. GERADOR DE RELATÓRIO DE ALERTAS
// ===================================================================================
const AlertsReportGenerator = ({ vehicles, employees }) => {
    const [filterType, setFilterType] = useState('Todos');

    const alerts = useMemo(() => {
        const list = [];
        const now = new Date();
        const thirtyDays = new Date();
        thirtyDays.setDate(now.getDate() + 30);

        vehicles.forEach(v => {
            if (v.possuiAviso) {
                const text = (v.avisoTexto || '').toLowerCase();
                let type = 'Manutenção';
                if (text.includes('documento') || text.includes('aet') || text.includes('tacógrafo')) type = 'Documentação';
                else if (text.includes('bloqueio')) type = 'Bloqueio';

                list.push({
                    entity: `${v.registroInterno} - ${v.modelo}`,
                    type,
                    message: v.avisoTexto,
                    date: new Date().toLocaleDateString('pt-BR'),
                    isCritical: text.includes('vencid') || text.includes('bloqueio')
                });
            }
        });

        employees.forEach(e => {
            if (e.cnhVencimento) {
                let venc = e.cnhVencimento.includes('T') ? new Date(e.cnhVencimento) : new Date(e.cnhVencimento + 'T12:00:00Z');
                if (!isNaN(venc.getTime())) {
                    if (venc < now) {
                        list.push({ entity: e.nome, type: 'CNH', message: `CNH Vencida em ${venc.toLocaleDateString('pt-BR')}`, date: venc.toLocaleDateString('pt-BR'), isCritical: true });
                    } else if (venc <= thirtyDays) {
                        list.push({ entity: e.nome, type: 'CNH', message: `CNH Vence em ${venc.toLocaleDateString('pt-BR')}`, date: venc.toLocaleDateString('pt-BR'), isCritical: false });
                    }
                }
            }
        });

        return list.sort((a, b) => (a.isCritical === b.isCritical) ? 0 : a.isCritical ? -1 : 1);
    }, [vehicles, employees]);

    const filteredAlerts = filterType === 'Todos' ? alerts : alerts.filter(a => a.type === filterType);

    const handleGeneratePDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(18); doc.setTextColor(220, 38, 38);
        doc.text(`Relatório de Alertas de Frota`, 14, 20);
        doc.setFontSize(10); doc.setTextColor(100);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Filtro: ${filterType}`, 14, 26);

        const body = filteredAlerts.map(a => [a.entity, a.type, a.message, a.date]);

        autoTable(doc, {
            startY: 32,
            head: [['Equipamento/Colaborador', 'Tipo', 'Detalhe do Alerta', 'Data Ref.']],
            body,
            theme: 'grid',
            headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255] },
            styles: { fontSize: 9 },
            columnStyles: { 2: { cellWidth: 80 } }
        });
        doc.save(`Relatorio_Alertas_${filterType}.pdf`);
    };

    return (
        <div className="animate-fade-in">
            <SectionHeader icon={AlertTriangle} title="Relatório de Alertas e Pendências" description="Consolidado de vencimentos (CNH, Documentos, Revisões) e bloqueios." />
            
            <FilterSection>
                <div className="col-span-full md:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Filtrar por Categoria</label>
                    <div className="flex gap-2">
                        {['Todos', 'Manutenção', 'Documentação', 'CNH', 'Bloqueio'].map(type => (
                            <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`px-4 py-2 text-sm rounded-lg border transition ${filterType === type ? 'bg-red-600 text-white border-red-600 shadow' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>
            </FilterSection>

            <div className="bg-white border rounded-lg shadow-sm mb-4">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h4 className="font-bold text-gray-700">Pré-visualização ({filteredAlerts.length})</h4>
                    <button onClick={handleGeneratePDF} disabled={filteredAlerts.length === 0} className="text-red-600 hover:text-red-800 font-semibold text-sm flex items-center gap-1">
                        <Download size={16}/> Baixar PDF
                    </button>
                </div>
                <div className="max-h-80 overflow-y-auto custom-scrollbar p-0">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 text-gray-600 uppercase text-xs sticky top-0">
                            <tr>
                                <th className="p-3">Entidade</th>
                                <th className="p-3">Tipo</th>
                                <th className="p-3">Mensagem</th>
                                <th className="p-3">Data</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredAlerts.map((a, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="p-3 font-medium">{a.entity}</td>
                                    <td className="p-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${a.type === 'CNH' ? 'bg-purple-100 text-purple-700' : 'bg-red-100 text-red-700'}`}>{a.type}</span></td>
                                    <td className={`p-3 ${a.isCritical ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{a.message}</td>
                                    <td className="p-3 text-gray-500 text-xs">{a.date}</td>
                                </tr>
                            ))}
                            {filteredAlerts.length === 0 && <tr><td colSpan="4" className="p-6 text-center text-gray-400">Nenhum alerta encontrado.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// ===================================================================================
// 4. RELATÓRIO DE FATURAMENTO (ATUALIZADO & CORRIGIDO)
// ===================================================================================
const BillingReportGenerator = ({ obras, vehicles }) => { // Remove dailyWorkLogs de props
    const [selectedObraId, setSelectedObraId] = useState('');
    const [localDailyLogs, setLocalDailyLogs] = useState([]);
    const [loading, setLoading] = useState(false);

    // Ordenação Alfabética das Obras
    const sortedObras = useMemo(() => {
        return [...obras].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    }, [obras]);

    // Busca logs da obra ao selecionar
    useEffect(() => {
        if (!selectedObraId) {
            setLocalDailyLogs([]);
            return;
        }

        const fetchLogs = async () => {
            setLoading(true);
            try {
                // Chama a API diretamente para pegar TODOS os logs desta obra
                const logs = await apiClient.getDailyLogs(selectedObraId);
                setLocalDailyLogs(logs || []);
            } catch (error) {
                console.error("Erro ao buscar logs para relatório:", error);
                setLocalDailyLogs([]);
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();
    }, [selectedObraId]);

    const generatePDF = () => {
        const obra = obras.find(o => o.id === selectedObraId);
        if (!obra) return;

        const doc = new jsPDF();
        doc.setFontSize(16); doc.text(`Relatório de Faturamento: ${obra.nome}`, 14, 20);
        doc.setFontSize(10); doc.text(`Comparativo: Contratado vs. Realizado (Apontamentos)`, 14, 26);

        // 1. Agrupar logs por tipo de veículo
        const executedByType = {};
        
        localDailyLogs.forEach(log => {
            const vehicle = vehicles.find(v => v.id === log.vehicleId);
            const type = vehicle ? vehicle.tipo : 'Outros';
            
            if (!executedByType[type]) executedByType[type] = 0;
            const val = parseFloat(log.totalHours !== undefined ? log.totalHours : log.total_hours);
            executedByType[type] += (isNaN(val) ? 0 : val);
        });

        // 2. Prepara tabela comparativa
        const tableBody = [];
        const contracted = obra.horasContratadasPorTipo || {};
        
        // Une todos os tipos (contratados + executados)
        const allTypes = new Set([...Object.keys(contracted), ...Object.keys(executedByType)]);
        
        // Ordena para ficar bonito
        const sortedTypes = Array.from(allTypes).sort();
        
        // Identifica linhas extras para pintar de outra cor
        const extraRowsIndices = [];

        sortedTypes.forEach((type, index) => {
            const cont = parseFloat(contracted[type] || 0);
            const exec = executedByType[type] || 0;
            const balance = cont - exec;
            const percent = cont > 0 ? ((exec / cont) * 100).toFixed(1) + '%' : '-';
            
            // Se executou mas não estava contratado (cont == 0 e exec > 0)
            if (cont === 0 && exec > 0) {
                extraRowsIndices.push(index);
            }

            tableBody.push([
                type,
                cont.toFixed(1),
                exec.toFixed(1),
                balance.toFixed(1),
                percent
            ]);
        });

        autoTable(doc, {
            startY: 35,
            head: [['Tipo de Equipamento', 'Hrs Contratadas', 'Hrs Faturadas', 'Saldo', '% Exec.']],
            body: tableBody,
            theme: 'striped',
            headStyles: { fillColor: [234, 179, 8], textColor: [0,0,0] },
            columnStyles: { 3: { fontStyle: 'bold' } },
            didParseCell: function (data) {
                // Pinta de vermelho claro se for equipamento extra
                if (data.section === 'body' && extraRowsIndices.includes(data.row.index)) {
                    data.cell.styles.fillColor = [255, 200, 200];
                    data.cell.styles.textColor = [150, 0, 0];
                }
            }
        });

        // Totais
        const totalCont = Object.values(contracted).reduce((a,b) => a + parseFloat(b||0), 0);
        // O total executado soma TODOS, inclusive os extras
        const totalExec = Object.values(executedByType).reduce((a,b) => a + b, 0);
        
        doc.setFontSize(12); doc.setFont('helvetica', 'bold');
        doc.text(`Total Faturado na Obra: ${totalExec.toFixed(1)} hrs`, 14, doc.lastAutoTable.finalY + 10);
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        doc.text(`Total Contratado: ${totalCont.toFixed(1)} hrs`, 14, doc.lastAutoTable.finalY + 16);
        
        // Legenda
        if (extraRowsIndices.length > 0) {
            doc.setFontSize(8); doc.setTextColor(150, 0, 0);
            doc.text("* Equipamentos em vermelho não constam no contrato original, mas possuem horas apontadas.", 14, doc.lastAutoTable.finalY + 22);
        }

        doc.save(`Faturamento_${obra.nome}.pdf`);
    };

    return (
        <div className="animate-fade-in">
             <SectionHeader icon={ClipboardCheck} title="Relatório de Faturamento" description="Comparativo financeiro: Horas Contratadas vs. Horas Apontadas nos diários (Billing Page)." />
             <div className="bg-white p-6 rounded-lg border shadow-sm max-w-2xl">
                <label className="block text-sm font-bold text-gray-700 mb-2">Selecione a Obra</label>
                <div className="flex gap-3">
                    <select 
                        value={selectedObraId} 
                        onChange={e => setSelectedObraId(e.target.value)} 
                        className="flex-1 input-field"
                    >
                        <option value="">-- Selecione --</option>
                        {sortedObras.filter(o => o.status === 'ativa').map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    </select>
                    <button 
                        onClick={generatePDF} 
                        disabled={!selectedObraId || loading}
                        className="btn-primary bg-yellow-500 hover:bg-yellow-600 text-black border-none flex items-center gap-2 disabled:bg-gray-300"
                    >
                        {loading ? <Loader className="animate-spin" size={18}/> : <Printer size={18}/>} 
                        Gerar Comparativo
                    </button>
                </div>
                {localDailyLogs.length > 0 && <p className="text-xs text-green-600 mt-2 font-medium">✓ {localDailyLogs.length} registros encontrados para esta obra.</p>}
             </div>
        </div>
    );
};

// ===================================================================================
// 5. NOVO: RELATÓRIO DE OBRAS (Físico x Financeiro - Completo)
// ===================================================================================
const ConstructionReportGenerator = ({ obras, vehicles, dailyWorkLogs, vehicleGroups }) => {
    const [statusFilter, setStatusFilter] = useState('ativa');
    const [selectedObraIds, setSelectedObraIds] = useState([]);
    const [selectedVehicleIds, setSelectedVehicleIds] = useState([]);
    const [selectAllVehicles, setSelectAllVehicles] = useState(false);

    // 1. Filtrar Obras por Status e Ordenar
    const filteredObras = useMemo(() => {
        return obras
            .filter(o => statusFilter === 'todas' || o.status === statusFilter)
            .sort((a, b) => a.nome.localeCompare(b.nome));
    }, [obras, statusFilter]);

    // 2. Filtrar Veículos que estão nas Obras selecionadas
    const filteredVehicles = useMemo(() => {
        if (selectedObraIds.length === 0) return [];
        
        // Pega todos os veículos atualmente alocados nestas obras
        return vehicles.filter(v => selectedObraIds.includes(v.obraAtualId))
                       .sort((a,b) => (a.registroInterno || '').localeCompare(b.registroInterno || ''));
    }, [vehicles, selectedObraIds]);

    // Handle Select All Vehicles
    const handleSelectAllVehicles = (e) => {
        setSelectAllVehicles(e.target.checked);
        setSelectedVehicleIds(e.target.checked ? filteredVehicles.map(v => v.id) : []);
    };

    const generatePDF = () => {
        if (selectedObraIds.length === 0) return alert("Selecione pelo menos uma obra.");

        const doc = new jsPDF();
        
        selectedObraIds.forEach((obraId, index) => {
            const obra = obras.find(o => o.id === obraId);
            if (!obra) return;
            
            if (index > 0) doc.addPage();

            doc.setFontSize(16); doc.setTextColor(0);
            doc.text(`Relatório de Obra: ${obra.nome}`, 14, 20);
            doc.setFontSize(10); 
            doc.text(`Status: ${obra.status.toUpperCase()} | Local: ${obra.localizacao || 'N/A'}`, 14, 26);

            // --- SEÇÃO 1: PROGRESSO FÍSICO (Baseado em Leitura de Equipamentos) ---
            doc.setFontSize(12); doc.setFont('helvetica', 'bold');
            doc.text("1. Progresso Físico (Leituras de Horímetro/Odômetro)", 14, 35);
            
            const physicalBody = [];
            let totalHorasFisicas = 0;

            // Filtra histórico desta obra
            const history = obra.historicoVeiculos || [];
            
            // Itera sobre veículos selecionados (ou todos da obra se nenhum específico selecionado)
            const targetVehicles = selectedVehicleIds.length > 0 
                ? vehicles.filter(v => selectedVehicleIds.includes(v.id) && v.obraAtualId === obraId)
                : vehicles.filter(v => v.obraAtualId === obraId);

            targetVehicles.forEach(v => {
                // Encontra a entrada mais recente deste veículo nesta obra
                const entry = history.find(h => h.veiculoId === v.id && !h.dataSaida);
                
                // UNIFICAÇÃO HORÍMETRO: Usa apenas campos unificados se possível, ou fallback
                // Regra: Máquinas e Caminhões usam horas para "trabalho". Caminhões de trecho usam Km.
                const group = Object.keys(vehicleGroups).find(g => vehicleGroups[g].includes(v.tipo));
                const isKm = group === 'Veículos Leves' || group === 'Caminhões de Trecho';
                
                let start = 0;
                let current = 0;
                let unit = isKm ? 'Km' : 'H';

                if (entry) {
                    if (isKm) {
                        start = parseFloat(entry.odometroEntrada || 0);
                        current = parseFloat(v.odometro || 0);
                    } else {
                        // Unificação: Pega horímetro direto (sem distinção digital/analógico se backend já unificou)
                        start = parseFloat(entry.horimetroEntrada || entry.odometroEntrada || 0);
                        current = parseFloat(v.horimetro ?? v.horimetroDigital ?? v.horimetroAnalogico ?? 0);
                    }
                }

                const worked = Math.max(0, current - start);
                if (!isKm) totalHorasFisicas += worked;

                physicalBody.push([
                    v.registroInterno,
                    v.tipo,
                    `${start.toFixed(1)} ${unit}`,
                    `${current.toFixed(1)} ${unit}`,
                    `${worked.toFixed(1)} ${unit}`
                ]);
            });

            if (physicalBody.length > 0) {
                autoTable(doc, {
                    startY: 40,
                    head: [['Registro', 'Tipo', 'Leitura Inicial', 'Leitura Atual', 'Executado']],
                    body: physicalBody,
                    theme: 'striped',
                    headStyles: { fillColor: [44, 62, 80] } // Dark Blue
                });
            } else {
                doc.setFontSize(10); doc.setFont('helvetica', 'normal');
                doc.text("Nenhum veículo alocado atualmente.", 14, 45);
            }

            // --- SEÇÃO 2: PROGRESSO FINANCEIRO (Baseado em Faturamento / Daily Logs) ---
            let currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 15 : 60;
            doc.setFontSize(12); doc.setFont('helvetica', 'bold');
            doc.text("2. Progresso Financeiro (Apontamentos de Faturamento)", 14, currentY);

            // Preparação robusta dos logs (mesma lógica do Faturamento)
            let safeLogs = [];
            if (Array.isArray(dailyWorkLogs)) safeLogs = dailyWorkLogs;
            else if (dailyWorkLogs && dailyWorkLogs.data && Array.isArray(dailyWorkLogs.data)) safeLogs = dailyWorkLogs.data;

            const targetObraId = String(obraId).trim();
            const billingLogs = safeLogs.filter(l => {
                const logObraId = l.obraId || l.obra_id;
                return logObraId && String(logObraId).trim() === targetObraId;
            });

            const billingByType = {};
            billingLogs.forEach(l => {
                const v = vehicles.find(veh => veh.id === l.vehicleId);
                const type = v ? v.tipo : 'Outros';
                if (!billingByType[type]) billingByType[type] = 0;
                
                const val = parseFloat(l.totalHours !== undefined ? l.totalHours : l.total_hours);
                billingByType[type] += (isNaN(val) ? 0 : val);
            });

            const financialBody = [];
            const contracted = obra.horasContratadasPorTipo || {};
            const allTypes = new Set([...Object.keys(contracted), ...Object.keys(billingByType)]);
            let totalContratado = 0;
            let totalFaturado = 0;

            allTypes.forEach(type => {
                const cont = parseFloat(contracted[type] || 0);
                const exec = billingByType[type] || 0;
                totalContratado += cont;
                totalFaturado += exec;
                
                financialBody.push([
                    type,
                    cont.toFixed(1),
                    exec.toFixed(1),
                    (cont - exec).toFixed(1),
                    cont > 0 ? ((exec/cont)*100).toFixed(1) + '%' : '-'
                ]);
            });

            autoTable(doc, {
                startY: currentY + 5,
                head: [['Tipo', 'Hrs Contratadas', 'Hrs Faturadas', 'Saldo', '%']],
                body: financialBody,
                theme: 'grid',
                headStyles: { fillColor: [39, 174, 96] }, // Green
                foot: [['TOTAL', totalContratado.toFixed(1), totalFaturado.toFixed(1), (totalContratado - totalFaturado).toFixed(1), '-']],
                footStyles: { fillColor: [200, 200, 200], textColor: [0,0,0], fontStyle: 'bold' }
            });
        });

        doc.save('Relatorio_Obras_Completo.pdf');
    };

    return (
        <div className="animate-fade-in">
            <SectionHeader icon={HardHat} title="Relatório de Obras" description="Comparativo completo: Progresso Físico (Leituras) vs. Financeiro (Apontamentos)." />
            
            <div className="bg-white p-6 rounded-lg border shadow-sm">
                <div className="grid md:grid-cols-3 gap-6 mb-4">
                    {/* Coluna 1: Status */}
                    <div>
                        <label className="label">Status da Obra</label>
                        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setSelectedObraIds([]); }} className="input-field">
                            <option value="ativa">Ativas</option>
                            <option value="finalizada">Finalizadas</option>
                            <option value="todas">Todas</option>
                        </select>
                    </div>

                    {/* Coluna 2: Obras */}
                    <div>
                        <label className="label">Selecionar Obras</label>
                        <select 
                            multiple 
                            value={selectedObraIds} 
                            onChange={e => setSelectedObraIds(Array.from(e.target.selectedOptions, o => o.value))} 
                            className="w-full h-32 p-2 border rounded text-sm custom-scrollbar"
                        >
                            {filteredObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Use Ctrl+Click para selecionar várias.</p>
                    </div>

                    {/* Coluna 3: Veículos (Filtrados pelas Obras) */}
                    <div>
                        <label className="label flex justify-between">
                            Selecionar Veículos
                            <span className="text-xs font-normal flex items-center gap-1">
                                <input type="checkbox" checked={selectAllVehicles} onChange={handleSelectAllVehicles}/> Todos
                            </span>
                        </label>
                        <select 
                            multiple 
                            value={selectedVehicleIds} 
                            onChange={e => setSelectedVehicleIds(Array.from(e.target.selectedOptions, o => o.value))} 
                            className="w-full h-32 p-2 border rounded text-sm custom-scrollbar"
                            disabled={selectedObraIds.length === 0}
                        >
                            {filteredVehicles.length === 0 && <option disabled>Selecione uma obra primeiro</option>}
                            {filteredVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.modelo}</option>)}
                        </select>
                    </div>
                </div>

                <button onClick={generatePDF} disabled={selectedObraIds.length === 0} className="btn-primary w-full md:w-auto flex items-center justify-center gap-2">
                    <Printer size={18}/> Gerar Relatório de Obras
                </button>
            </div>
        </div>
    );
};

// ===================================================================================
// 6. RELATÓRIO DE PLANO DE TRABALHO
// ===================================================================================
const WorkPlanReportGenerator = ({ obras, vehicles, vehicleGroups, expenses = [], equipmentTypesForHours = [] }) => {
    // --- ESTADO LOCAL ---
    const [pdfWorkplanSelectedObras, setPdfWorkplanSelectedObras] = useState([]);
    const [pdfWorkplanFilterStatus, setPdfWorkplanFilterStatus] = useState('ativa');

    // --- FILTRAGEM DE OBRAS ---
    const obrasToDisplay = useMemo(() => {
        if (!obras) return [];
        return obras
            .filter(o => o.status === pdfWorkplanFilterStatus)
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    }, [obras, pdfWorkplanFilterStatus]);

    useEffect(() => {
        setPdfWorkplanSelectedObras([]);
    }, [pdfWorkplanFilterStatus]);

    // --- FUNÇÃO DE EXPORTAÇÃO (LÓGICA ORIGINAL) ---
    const exportWorkplanToPDF = () => {
        const doc = new jsPDF();
        
        pdfWorkplanSelectedObras
            .map(obraId => obras.find(o => o.id === obraId))
            .filter(Boolean)
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
            .forEach((obra, index) => {
                if (index > 0) doc.addPage();

                doc.setFontSize(18);
                doc.text(`Plano de Trabalho: ${obra.nome}`, 14, 22);
                doc.setFontSize(11);
                doc.setTextColor(100);
                
                const startX = 14;
                let currentY = 30;

                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.text(`Período da Obra:`, startX, currentY);
                doc.setFont('helvetica', 'normal');
                currentY += 5;
                
                const dataInicioStr = obra.dataInicio ? new Date(obra.dataInicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A';
                const dataFimStr = obra.dataFim ? new Date(obra.dataFim).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Em andamento';
                doc.text(`Início: ${dataInicioStr}`, startX, currentY);
                currentY += 5;
                doc.text(`Fim: ${dataFimStr}`, startX, currentY);
                currentY += 10;
                
                // Lógica de cálculo de progresso
                const progressData = { contratado: {}, concluido: {}, totalContratado: 0, totalConcluido: 0 };
                const uniqueEquipmentTypes = [...new Set(equipmentTypesForHours)];
                const allEquipmentTypes = [...uniqueEquipmentTypes];
                if (!allEquipmentTypes.includes('Caminhão')) {
                    allEquipmentTypes.push('Caminhão');
                }
                
                allEquipmentTypes.forEach(type => {
                    const contracted = parseFloat(obra.horasContratadasPorTipo?.[type] || 0);
                    progressData.contratado[type] = contracted;
                    progressData.totalContratado += contracted;
                    progressData.concluido[type] = 0;
                });

                // Histórico de Veículos
                (obra.historicoVeiculos || []).forEach(h => {
                    const vehicle = vehicles.find(v => v.id === h.veiculoId);
                    if (!vehicle) return;

                    const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group].includes(vehicle.tipo));
                    const equipType = equipmentTypesForHours.find(t => vehicle.tipo === t);
                    
                    const isHourBased = vehicleGroup === 'Máquinas Pesadas' || vehicleGroup === 'Caminhões';

                    if (!isHourBased) return;
                    
                    const startReading = parseFloat(h.horimetroEntrada || h.odometroEntrada || 0);
                    let endReading;

                    if (h.dataSaida) {
                        endReading = parseFloat(h.horimetroSaida || h.odometroSaida || 0);
                    } else {
                         if (vehicleGroup === 'Máquinas Pesadas') {
                            endReading = parseFloat(vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro ?? 0);
                        } else if (vehicleGroup === 'Caminhões') {
                            endReading = parseFloat(vehicle.horimetro ?? 0);
                        }
                    }

                    if (endReading >= startReading) {
                        const hours = endReading - startReading;
                        if (vehicleGroup === 'Caminhões') {
                           progressData.concluido['Caminhão'] = (progressData.concluido['Caminhão'] || 0) + hours;
                        } else if (equipType) {
                            progressData.concluido[equipType] = (progressData.concluido[equipType] || 0) + hours;
                        } else if (vehicle.tipo) {
                           progressData.concluido[vehicle.tipo] = (progressData.concluido[vehicle.tipo] || 0) + hours;
                           if(!allEquipmentTypes.includes(vehicle.tipo)) {
                               allEquipmentTypes.push(vehicle.tipo);
                               progressData.contratado[vehicle.tipo] = 0;
                           }
                        }
                    }
                });

                const truckHours = parseFloat(obra.horasAdicionaisCaminhao || 0);
                if (progressData.concluido['Caminhão'] !== undefined) {
                    progressData.concluido['Caminhão'] += truckHours;
                } else {
                    progressData.concluido['Caminhão'] = truckHours;
                }
                
                const totalHorasCaminhoesConcluidas = progressData.concluido['Caminhão'] || 0;
                const totalHorasMaquinasConcluidas = Object.entries(progressData.concluido).reduce((sum, [type, hours]) => {
                    if (type !== 'Caminhão') {
                        return sum + (hours || 0);
                    }
                    return sum;
                }, 0);

                progressData.totalConcluido = totalHorasCaminhoesConcluidas + totalHorasMaquinasConcluidas;

                const progressBody = allEquipmentTypes.map(type => {
                    const contratado = progressData.contratado[type] || 0;
                    const concluido = progressData.concluido[type] || 0;
                    if (contratado === 0 && concluido === 0) return null;
                    const saldo = (contratado - concluido).toFixed(1);
                    return [type, contratado.toFixed(1), concluido.toFixed(1), saldo];
                }).filter(Boolean);

                autoTable(doc, {
                    startY: currentY,
                    head: [['Tipo de Equipamento', 'Horas Contratadas', 'Horas Concluídas', 'Saldo']],
                    body: progressBody,
                    foot: [['TOTAL', progressData.totalContratado.toFixed(1), progressData.totalConcluido.toFixed(1), (progressData.totalContratado - progressData.totalConcluido).toFixed(1)]],
                    theme: 'striped',
                    headStyles: { fillColor: [255, 193, 7] }, // Amarelo
                    footStyles: { fontStyle: 'bold', fillColor: [105, 105, 105] }
                });

                let finalY = doc.lastAutoTable.finalY + 10;
                const percentualConcluido = progressData.totalContratado > 0 ? ((progressData.totalConcluido / progressData.totalContratado) * 100).toFixed(2) : 0;
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.text(`Percentual Geral Concluido: ${percentualConcluido}%`, 14, finalY);
                finalY += 5;
                doc.setFont('helvetica', 'normal');
                doc.text(`Horas Concluídas (Máquinas Pesadas): ${totalHorasMaquinasConcluidas.toFixed(1)} hrs`, 14, finalY);
                finalY += 5;
                doc.text(`Horas Concluídas (Caminhões): ${totalHorasCaminhoesConcluidas.toFixed(1)} hrs`, 14, finalY);
                finalY += 10;
                
                if (obra.kmContratadoPrancha > 0) {
                    doc.setFontSize(12);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`Deslocamento Prancha: ${obra.kmConcluidoPrancha || 0} Km de ${obra.kmContratadoPrancha} Km contratados.`, 14, finalY);
                    finalY += 15;
                }

                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.text('Histórico de Veículos na Obra', 14, finalY);
                finalY += 8;
                
                const vehicleHistoryBody = (obra.historicoVeiculos || []).map(h => {
                    const vehicle = vehicles.find(v => v.id === h.veiculoId);
                    if (!vehicle) return ['ID não encontrado', '', '', '', '', '', '', ''];
                    
                    const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group].includes(vehicle.tipo));
                    
                    let startReading = 0;
                    let endReading = 0;
                    let readingLabel = '';

                    if (vehicleGroup === 'Máquinas Pesadas') {
                        readingLabel = 'Horas';
                        startReading = parseFloat(h.horimetroEntrada || h.odometroEntrada || 0);
                        if (h.dataSaida) {
                            endReading = parseFloat(h.horimetroSaida || h.odometroSaida || 0);
                        } else {
                            endReading = parseFloat(vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro ?? 0);
                        }
                    } else if (vehicleGroup === 'Caminhões') {
                        readingLabel = 'Horas';
                        startReading = parseFloat(h.horimetroEntrada || h.odometroEntrada || 0);
                        if (h.dataSaida) {
                            endReading = parseFloat(h.horimetroSaida || h.odometroSaida || 0);
                        } else {
                            endReading = parseFloat(vehicle.horimetro ?? 0);
                        }
                    } else { // Veículos Leves
                        readingLabel = 'Km';
                        startReading = parseFloat(h.odometroEntrada || 0);
                        if (h.dataSaida) {
                            endReading = parseFloat(h.odometroSaida || 0);
                        } else {
                            endReading = parseFloat(vehicle.odometro || 0);
                        }
                    }

                    const totalWorked = (endReading >= startReading) ? (endReading - startReading).toFixed(1) : 'Erro';
                    
                    return [ 
                        h.registroInterno || vehicle?.registroInterno || 'N/A', 
                        h.tipo || vehicle?.tipo || 'N/A', 
                        h.employeeName || 'N/A', 
                        h.dataEntrada ? new Date(h.dataEntrada).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A', 
                        h.dataSaida ? new Date(h.dataSaida).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Presente', 
                        startReading.toFixed(1),
                        (h.dataSaida ? endReading.toFixed(1) : `${endReading.toFixed(1)} (Atual)`),
                        `${totalWorked} ${readingLabel}`
                    ];
                });

                if (vehicleHistoryBody.length > 0) {
                    autoTable(doc, { 
                        startY: finalY, 
                        head: [['Registro', 'Tipo', 'Funcionário', 'Entrada', 'Saída', 'Leitura Inicial', 'Leitura Final', 'Total Trab.']], 
                        body: vehicleHistoryBody, 
                        theme: 'striped', 
                        headStyles: { fillColor: [60, 179, 113] } 
                    });
                    finalY = doc.lastAutoTable.finalY + 15;
                } else {
                    doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text('Nenhum veículo alocado nesta obra.', 14, finalY); finalY += 15;
                }

                // Despesas
                const obraExpenses = (expenses || []).filter(e => e.obraId === obra.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                const totalDespesas = obraExpenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
                
                doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text('Despesas da Obra', 14, finalY); finalY += 8;

                if (obraExpenses.length > 0) {
                    autoTable(doc, { 
                        startY: finalY, 
                        head: [['Data', 'Descrição', 'Categoria', 'Valor (R$)']], 
                        body: obraExpenses.map(e => [ 
                            e.createdAt ? new Date(e.createdAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A', 
                            e.description,
                            e.category || 'Outros',
                            (parseFloat(e.amount) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) 
                        ]), 
                        foot: [['Total', '', '', totalDespesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })]], 
                        theme: 'striped', 
                        headStyles: { fillColor: [220, 53, 69] }, 
                        footStyles: { fontStyle: 'bold', fillColor: [105, 105, 105] } 
                    });
                } else {
                    doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text('Nenhuma despesa registrada para esta obra.', 14, finalY);
                }
            });
        
        doc.save(`Plano_de_Trabalho_MAK.pdf`);
    };

    return (
        <div className="animate-fade-in">
            <SectionHeader icon={FileText} title="Relatório de Plano de Trabalho" description="Histórico físico, horas trabalhadas e despesas da obra." />
            
            <div className="p-4 sm:p-6 bg-white rounded-lg shadow-sm border">
                <div className="flex flex-col sm:flex-row gap-4 mb-4">
                    <div className="w-full sm:w-1/3">
                        <label className="block text-sm font-bold text-gray-700 mb-2">Filtrar por Status</label>
                        <select 
                            value={pdfWorkplanFilterStatus} 
                            onChange={e => setPdfWorkplanFilterStatus(e.target.value)} 
                            className="input-field"
                        >
                            <option value="ativa">Obras Ativas</option>
                            <option value="finalizada">Obras Encerradas</option>
                        </select>
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm font-bold text-gray-700 mb-2">Selecione as Obras (Ctrl+Click)</label>
                        <select 
                            multiple 
                            value={pdfWorkplanSelectedObras} 
                            onChange={e => setPdfWorkplanSelectedObras(Array.from(e.target.selectedOptions, option => option.value))} 
                            className="w-full h-48 p-2 border rounded-lg bg-gray-50 focus:ring-yellow-500 focus:border-yellow-500 custom-scrollbar"
                        >
                            {obrasToDisplay.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                        </select>
                    </div>
                </div>
                <button 
                    onClick={exportWorkplanToPDF} 
                    className="btn-primary bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2 w-full sm:w-auto"
                    disabled={pdfWorkplanSelectedObras.length === 0}
                >
                    <Download size={16}/>Gerar Plano de Trabalho ({pdfWorkplanSelectedObras.length})
                </button>
            </div>
        </div>
    );
};

// ===================================================================================
// PÁGINA PRINCIPAL (CONTROLLER)
// ===================================================================================
const ReportsPage = ({ vehicles = [], obras = [], expenses = [], equipmentTypesForHours = [], employees = [], fines = [], vehicleGroups = {}, dailyWorkLogs = [] }) => {
    const [reportType, setReportType] = useState(null);

    const reportTypes = [
        { id: 'vehicles', label: 'Frota & Veículos', icon: Truck, desc: 'Listagem geral, status e localização.', color: 'bg-blue-600' },
        { id: 'employees', label: 'Funcionários', icon: Users, desc: 'Quadro, alocações e documentos.', color: 'bg-green-600' },
        { id: 'alerts', label: 'Alertas & Pendências', icon: AlertTriangle, desc: 'Vencimentos, bloqueios e CNH.', color: 'bg-red-600' },
        { id: 'billing', label: 'Relatório Faturamento', icon: ClipboardCheck, desc: 'Comparativo Contratado x Faturado.', color: 'bg-yellow-500' },
        { id: 'construction', label: 'Relatório de Obras', icon: HardHat, desc: 'Progresso Físico vs. Financeiro.', color: 'bg-orange-600' },
        { id: 'workplan', label: 'Plano de Trabalho', icon: FileText, desc: 'Histórico físico, progresso e despesas.', color: 'bg-gray-600' },
    ];

    return (
        <div className="container mx-auto p-6 md:p-8 max-w-7xl min-h-screen flex flex-col">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Central de Relatórios</h1>
            <p className="text-gray-500 mb-8">Selecione um tipo de relatório para configurar os filtros e gerar o PDF.</p>

            {/* SELETOR DE TIPO (Cards) */}
            <div className={`grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8 transition-all duration-500`}>
                {reportTypes.map((type) => {
                    const isActive = reportType === type.id;
                    return (
                        <button
                            key={type.id}
                            onClick={() => setReportType(type.id)}
                            className={`relative overflow-hidden p-4 rounded-xl border transition-all duration-300 text-left group ${
                                isActive 
                                ? 'border-transparent ring-2 ring-offset-2 ring-yellow-500 shadow-lg scale-105 bg-white z-10' 
                                : 'border-gray-200 bg-white hover:border-yellow-400 hover:shadow-md'
                            }`}
                        >
                            <div className={`absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity`}>
                                <type.icon size={64} className={isActive ? 'text-yellow-500' : 'text-gray-400'} />
                            </div>
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 text-white shadow-sm ${type.color}`}>
                                <type.icon size={20} />
                            </div>
                            <h3 className={`font-bold text-sm mb-1 ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>{type.label}</h3>
                            <p className="text-xs text-gray-500 leading-snug">{type.desc}</p>
                            {isActive && <div className="absolute bottom-0 left-0 w-full h-1 bg-yellow-500"></div>}
                        </button>
                    );
                })}
            </div>

            {/* ÁREA DE CONTEÚDO */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 relative overflow-hidden">
                {!reportType ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-20 opacity-50">
                        <Printer size={64} className="text-gray-300 mb-4" />
                        <h3 className="text-xl font-bold text-gray-400">Nenhum relatório selecionado</h3>
                        <p className="text-gray-400">Escolha uma opção acima para começar.</p>
                    </div>
                ) : (
                    <div key={reportType} className="animate-slide-up">
                        <ProtectedComponent requiredPermission="viewer">
                            {reportType === 'vehicles' && <VehicleReportGenerator vehicles={vehicles} obras={obras} vehicleGroups={vehicleGroups} />}
                            {reportType === 'employees' && <EmployeeReportGenerator employees={employees} obras={obras} vehicles={vehicles} fines={fines} />}
                            {reportType === 'alerts' && <AlertsReportGenerator vehicles={vehicles} employees={employees} />}
                            {reportType === 'billing' && <BillingReportGenerator obras={obras} vehicles={vehicles} />}
                            {reportType === 'construction' && <ConstructionReportGenerator obras={obras} vehicles={vehicles} dailyWorkLogs={dailyWorkLogs} vehicleGroups={vehicleGroups} />}
                            {reportType === 'workplan' && <WorkPlanReportGenerator obras={obras} vehicles={vehicles} vehicleGroups={vehicleGroups} expenses={expenses} equipmentTypesForHours={equipmentTypesForHours} />}
                        </ProtectedComponent>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReportsPage;