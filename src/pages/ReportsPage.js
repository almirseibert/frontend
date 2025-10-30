import React, { useState, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download, Users, Truck } from 'lucide-react';

// Importa o componente de proteção
import ProtectedComponent from '../components/ProtectedComponent';
// REMOVIDO: Importações do Firebase

// ===================================================================================
// RELATÓRIO DE VEÍCULOS (Usa props, ajustado para API data)
// ===================================================================================
const VehicleReportGenerator = ({ vehicles = [], obras = [], vehicleGroups = {} }) => {
    const [filters, setFilters] = useState({ type: '', obraId: '', status: '', group: '' });
    const [selectedVehicleIds, setSelectedVehicleIds] = useState([]);
    const [selectAll, setSelectAll] = useState(false);

    // Colunas disponíveis
    const allColumns = useMemo(() => [
        { key: 'registroInterno', label: 'Registro Interno' },
        { key: 'placa', label: 'Placa' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'marca', label: 'Marca' },
        { key: 'modelo', label: 'Modelo' },
        { key: 'status', label: 'Status' },
        { key: 'obraAtual', label: 'Obra/Local Atual' }, // Renomeado para clareza
        { key: 'leituraPrincipal', label: 'Leitura Principal' }, // Odômetro/Horímetro
        { key: 'ano_fabricacao', label: 'Ano Fab.' }, // Usando nome do DB
        { key: 'ano_modelo', label: 'Ano Mod.' }, // Usando nome do DB
        { key: 'chassi', label: 'Chassi' },
    ], []);

    // Colunas padrão
    const [selectedColumns, setSelectedColumns] = useState(['registroInterno', 'placa', 'tipo', 'modelo', 'status', 'obraAtual', 'leituraPrincipal']);

    // Processa e filtra veículos
    const filteredVehicles = useMemo(() => {
        const groups = vehicleGroups && typeof vehicleGroups === 'object' ? vehicleGroups : {};
        return vehicles
            .map(v => {
                if (!v) return null; // Pula veículos nulos/inválidos
                const vehicleGroup = Object.keys(groups).find(key => groups[key]?.includes(v.tipo)) || 'Outros';
                let leituraPrincipal = '';
                 // Prioriza leituras mais específicas
                if (vehicleGroup === 'Máquinas Pesadas') leituraPrincipal = `${v.horimetroDigital ?? v.horimetroAnalogico ?? v.horimetro ?? 'N/A'} Hr`;
                else if (vehicleGroup === 'Caminhões') leituraPrincipal = `${v.odometro ?? 'N/A'} Km / ${v.horimetro ?? 'N/A'} Hr`;
                else leituraPrincipal = `${v.odometro ?? 'N/A'} Km`;
                // Encontra nome da obra ou usa localização
                const obra = obras.find(o => o.id === v.obraAtualId);
                const obraAtual = obra ? obra.nome : (v.localizacaoAtual || 'N/A');
                return { ...v, vehicleGroup, leituraPrincipal, obraAtual };
            }).filter(Boolean) // Remove nulos
            .filter(v => (
                (filters.type ? v.tipo === filters.type : true) &&
                (filters.obraId ? v.obraAtualId === filters.obraId : true) &&
                (filters.status ? v.status === filters.status : true) &&
                (filters.group ? v.vehicleGroup === filters.group : true)
            ))
            .sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || ''));
    }, [vehicles, filters, vehicleGroups, obras]);

    // Atualiza selectAll
    useEffect(() => {
        setSelectAll(filteredVehicles.length > 0 && selectedVehicleIds.length === filteredVehicles.length);
    }, [selectedVehicleIds, filteredVehicles]);

    // Handlers para seleção (sem mudanças)
    const handleSelectAll = (e) => {
        const checked = e.target.checked;
        setSelectAll(checked);
        setSelectedVehicleIds(checked ? filteredVehicles.map(v => v.id) : []);
    };
    const handleCheckboxChange = (vehicleId) => {
        setSelectedVehicleIds(prev =>
            prev.includes(vehicleId)
                ? prev.filter(id => id !== vehicleId)
                : [...prev, vehicleId]
        );
    };

    // Gera PDF (sem mudanças na lógica principal)
    const handleGeneratePDF = () => {
        if (selectedVehicleIds.length === 0 || selectedColumns.length === 0) {
            alert("Selecione ao menos um veículo e uma coluna.");
            return;
        }
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(18);
        doc.text('Relatório de Veículos', 14, 22);
        const headers = selectedColumns.map(colKey => allColumns.find(c => c.key === colKey)?.label || colKey);
        const body = filteredVehicles
            .filter(v => selectedVehicleIds.includes(v.id))
            .map(vehicle => selectedColumns.map(colKey => vehicle[colKey] != null ? String(vehicle[colKey]) : '')); // Usa String() para conversão segura

        autoTable(doc, {
            startY: 30,
            head: [headers],
            body,
            theme: 'striped',
            headStyles: { fillColor: [3, 105, 161] }, // Azul
            styles: { fontSize: 8 }, // Tamanho menor para caber mais colunas
            columnStyles: { // Ajusta largura de algumas colunas se necessário
                 // Exemplo: 0: { cellWidth: 30 }, // Ajusta a primeira coluna (Registro Interno)
                 //          6: { cellWidth: 40 }, // Ajusta Obra/Local
            }
        });
        doc.save('Relatorio_Veiculos.pdf');
    };

    // Opções para filtros (sem mudanças)
    const vehicleTypes = useMemo(() => [...new Set((vehicles || []).map(v => v?.tipo).filter(Boolean))].sort(), [vehicles]);
    const vehicleStatuses = useMemo(() => [...new Set((vehicles || []).map(v => v?.status).filter(Boolean))].sort(), [vehicles]);
    const activeObras = useMemo(() => (obras || []).filter(o => o.status === 'ativa').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);
    const vehicleGroupOptions = useMemo(() => vehicleGroups && typeof vehicleGroups === 'object' ? Object.keys(vehicleGroups).sort() : [], [vehicleGroups]);

    // Renderização do gerador de relatório
    return (
        <div className="p-4 sm:p-6 bg-white rounded-lg shadow-sm border">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-700"><Truck size={22}/>Relatório de Veículos</h2>
            {/* Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 text-sm">
                <select value={filters.group} onChange={e => setFilters({...filters, group: e.target.value})} className="w-full p-2 border rounded-lg bg-gray-50">
                    <option value="">Todos os Grupos</option>
                    {vehicleGroupOptions.map(g => <option key={g} value={g}>{g}</option>)}
                    <option value="Outros">Outros</option>
                </select>
                <select value={filters.type} onChange={e => setFilters({...filters, type: e.target.value})} className="w-full p-2 border rounded-lg bg-gray-50">
                    <option value="">Todos os Tipos</option>
                    {vehicleTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={filters.obraId} onChange={e => setFilters({...filters, obraId: e.target.value})} className="w-full p-2 border rounded-lg bg-gray-50">
                    <option value="">Todas as Obras/Locais</option>
                     <option value="N/A">N/A (Sem Obra/Local)</option>
                    {activeObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
                <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className="w-full p-2 border rounded-lg bg-gray-50">
                    <option value="">Todos os Status</option>
                    {vehicleStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            {/* Seleção de Colunas */}
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Selecione as Colunas</label>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
                    {allColumns.map(col => (<label key={col.key} className="flex items-center gap-1.5 p-1 rounded hover:bg-gray-100 cursor-pointer"><input type="checkbox" checked={selectedColumns.includes(col.key)} onChange={() => setSelectedColumns(p => p.includes(col.key) ? p.filter(c => c !== col.key) : [...p, col.key])} className="h-3 w-3 rounded text-red-600 focus:ring-red-500 border-gray-300"/>{col.label}</label>))}
                </div>
            </div>
             {/* Tabela de Seleção */}
            <div className="border rounded-lg max-h-60 overflow-y-auto mb-4 custom-scrollbar">
                <table className="w-full text-xs text-left">
                    <thead className="bg-gray-100 sticky top-0 z-10 uppercase text-gray-600">
                        <tr>
                            <th className="p-2 w-10"><input type="checkbox" checked={selectAll} onChange={handleSelectAll} className="h-3 w-3 rounded text-red-600 focus:ring-red-500 border-gray-300"/></th>
                            <th className="p-2">Registro</th>
                            <th className="p-2">Placa</th>
                            <th className="p-2 truncate">Tipo</th>
                            <th className="p-2 truncate">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredVehicles.map(v => (
                            <tr key={v.id} className={`border-b hover:bg-gray-50 ${selectedVehicleIds.includes(v.id) ? 'bg-red-50' : ''}`}>
                                <td className="p-2 text-center"><input type="checkbox" checked={selectedVehicleIds.includes(v.id)} onChange={() => handleCheckboxChange(v.id)} className="h-3 w-3 rounded text-red-600 focus:ring-red-500 border-gray-300"/></td>
                                <td className="p-2 font-medium">{v.registroInterno}</td>
                                <td className="p-2">{v.placa}</td>
                                <td className="p-2 truncate">{v.tipo}</td>
                                <td className="p-2 truncate">{v.status}</td>
                            </tr>
                        ))}
                        {filteredVehicles.length === 0 && (
                            <tr><td colSpan="5" className="p-4 text-center text-gray-500 italic">Nenhum veículo encontrado.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            {/* Botão Gerar */}
            <button onClick={handleGeneratePDF} className="mt-4 flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition disabled:bg-red-300 disabled:cursor-not-allowed text-sm" disabled={selectedVehicleIds.length === 0 || selectedColumns.length === 0}>
                <Download size={16}/>Gerar PDF ({selectedVehicleIds.length})
            </button>
        </div>
    );
};

// ===================================================================================
// RELATÓRIO DE FUNCIONÁRIOS (Usa props, ajustado para API data)
// ===================================================================================
const EmployeeReportGenerator = ({ employees = [], obras = [], vehicles = [], fines = [] }) => {
    const [filters, setFilters] = useState({ cidade: '', funcao: '', status: 'ativo', obraId: '' });
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
    const [selectAll, setSelectAll] = useState(false);

    // Colunas disponíveis
    const allColumns = useMemo(() => [
        { key: 'nome', label: 'Nome' },
        { key: 'vulgo', label: 'Apelido' },
        { key: 'funcao', label: 'Função' },
        { key: 'status', label: 'Status Cadastro' }, // Cadastro: ativo/inativo
        { key: 'allocationStatus', label: 'Status Alocação' }, // Alocado/Disponível
        { key: 'cidade', label: 'Cidade' },
        { key: 'contato', label: 'Telefone' },
        { key: 'obraAtual', label: 'Obra Atual' },
        { key: 'veiculosAlocados', label: 'Veículos Alocados' },
        { key: 'cnhInfo', label: 'CNH (Cat/Venc)'},
        { key: 'multasPendentes', label: 'Multas Pend. (Qtd)' },
    ], []);

    // Colunas padrão
    const [selectedColumns, setSelectedColumns] = useState(['nome', 'funcao', 'allocationStatus', 'cidade', 'contato', 'obraAtual']);

    // Alocações atuais (Usa new Date() e estrutura de 'details')
    const currentAllocations = useMemo(() => {
        const allocations = new Map();
        const now = new Date();
        obras.forEach(obra => {
            (Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : []).forEach(history => {
                // Ativo se não tiver endDate
                if (history.details?.employeeId && !history.endDate) {
                    const employeeId = history.details.employeeId;
                    const vehicle = vehicles.find(v => v.id === history.veiculoId);
                    if (!allocations.has(employeeId)) {
                        allocations.set(employeeId, { obraId: obra.id, obraNome: obra.nome, vehicleRegistros: [] });
                    }
                    if (vehicle) {
                         const current = allocations.get(employeeId);
                         if (!Array.isArray(current.vehicleRegistros)) current.vehicleRegistros = []; // Garante array
                        current.vehicleRegistros.push(vehicle.registroInterno || 'N/A');
                    }
                }
            });
        });
         // Adiciona alocações operacionais
         vehicles.forEach(vehicle => {
            if (vehicle.operationalAssignment?.employeeId) {
                const employeeId = vehicle.operationalAssignment.employeeId;
                 if (!allocations.has(employeeId)) {
                    allocations.set(employeeId, { obraId: null, obraNome: 'Operacional', vehicleRegistros: [] });
                }
                 const current = allocations.get(employeeId);
                 if (!Array.isArray(current.vehicleRegistros)) current.vehicleRegistros = []; // Garante array
                 current.vehicleRegistros.push(vehicle.registroInterno || 'N/A');
            }
        });
        return allocations;
    }, [obras, vehicles]);

    // Filtra e ordena funcionários (Usa currentAllocations)
    const filteredEmployees = useMemo(() => {
        return (employees || [])
            .map(e => { // Adiciona status de alocação
                const allocation = currentAllocations.get(e.id);
                return {
                    ...e,
                    allocationStatus: e.status === 'inativo' ? 'Inativo' : (allocation ? 'Alocado' : 'Disponível'),
                    obraAtual: allocation?.obraNome || 'N/A'
                };
            })
            .filter(e => (
                (filters.cidade ? e.cidade === filters.cidade : true) &&
                (filters.funcao ? e.funcao === filters.funcao : true) &&
                (filters.status ? e.status === filters.status : true) && // Filtra por status do cadastro
                (filters.obraId ? (currentAllocations.get(e.id)?.obraId === filters.obraId || (filters.obraId === 'N/A' && !currentAllocations.has(e.id))) : true) // Filtra por obra ou 'N/A'
            ))
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    }, [employees, filters, currentAllocations]);

    // Atualiza selectAll
    useEffect(() => {
        setSelectAll(filteredEmployees.length > 0 && selectedEmployeeIds.length === filteredEmployees.length);
    }, [selectedEmployeeIds, filteredEmployees]);

    // Handlers para seleção (sem mudanças)
    const handleSelectAll = (e) => {
        const checked = e.target.checked;
        setSelectAll(checked);
        setSelectedEmployeeIds(checked ? filteredEmployees.map(e => e.id) : []);
    };
     const handleCheckboxChange = (employeeId) => {
        setSelectedEmployeeIds(prev =>
            prev.includes(employeeId)
                ? prev.filter(id => id !== employeeId)
                : [...prev, employeeId]
        );
    };

    // Gera PDF (Usa new Date() e currentAllocations)
    const handleGeneratePDF = () => {
        if (selectedEmployeeIds.length === 0 || selectedColumns.length === 0) {
            alert("Selecione ao menos um funcionário e uma coluna.");
            return;
        }
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(18);
        doc.text('Relatório de Funcionários', 14, 22);
        const headers = selectedColumns.map(colKey => allColumns.find(c => c.key === colKey)?.label || colKey);
        const body = filteredEmployees
            .filter(e => selectedEmployeeIds.includes(e.id))
            .map(employee => {
                const employeeAllocation = currentAllocations.get(employee.id);
                const obraAtual = employeeAllocation ? employeeAllocation.obraNome : 'N/A';
                const veiculosAlocados = employeeAllocation ? (employeeAllocation.vehicleRegistros || []).join(', ') : 'Nenhum';
                // Formata data da CNH da API (adiciona T12:00:00Z para UTC seguro)
                const cnhVenc = employee.cnhVencimento ? new Date(employee.cnhVencimento + 'T12:00:00Z').toLocaleDateString('pt-BR') : 'N/A';
                const cnhInfo = `${employee.cnhCategoria || 'N/A'} / ${cnhVenc}`;
                const multasPendentes = fines.filter(f => f.employeeId === employee.id && f.status === 'Pendente').length;

                const employeeData = {
                    ...employee, // Inclui nome, vulgo, funcao, status (cadastro), cidade, contato
                    allocationStatus: employee.allocationStatus, // Status de alocação calculado
                    obraAtual,
                    veiculosAlocados,
                    cnhInfo,
                    multasPendentes,
                };
                return selectedColumns.map(colKey => employeeData[colKey] != null ? String(employeeData[colKey]) : '');
            });

        autoTable(doc, {
            startY: 30,
            head: [headers],
            body,
            theme: 'striped',
            headStyles: { fillColor: [34, 139, 34] }, // Verde
            styles: { fontSize: 8 }, // Tamanho menor
         });
        doc.save('Relatorio_Funcionarios.pdf');
    };

    // Opções para filtros (sem mudanças)
    const employeeCities = useMemo(() => [...new Set((employees || []).map(e => e?.cidade).filter(Boolean))].sort(), [employees]);
    const employeeFunctions = useMemo(() => [...new Set((employees || []).map(e => e?.funcao).filter(Boolean))].sort(), [employees]);
    const employeeStatuses = useMemo(() => ['ativo', 'inativo'], []);
    const activeObras = useMemo(() => (obras || []).filter(o => o.status === 'ativa').sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);

    // Renderização do gerador
    return (
        <div className="p-4 sm:p-6 bg-white rounded-lg shadow-sm border">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-700"><Users size={22}/>Relatório de Funcionários</h2>
            {/* Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 text-sm">
                 <select value={filters.cidade} onChange={e => setFilters({...filters, cidade: e.target.value})} className="w-full p-2 border rounded-lg bg-gray-50">
                    <option value="">Todas as Cidades</option>
                    {employeeCities.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
                 <select value={filters.funcao} onChange={e => setFilters({...filters, funcao: e.target.value})} className="w-full p-2 border rounded-lg bg-gray-50">
                     <option value="">Todas as Funções</option>
                     {employeeFunctions.map(f => <option key={f} value={f}>{f}</option>)}
                 </select>
                 <select value={filters.obraId} onChange={e => setFilters({...filters, obraId: e.target.value})} className="w-full p-2 border rounded-lg bg-gray-50">
                    <option value="">Todas as Obras (Aloc. Atual)</option>
                    <option value="N/A">N/A (Não Alocado)</option>
                    {activeObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                 </select>
                 <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className="w-full p-2 border rounded-lg bg-gray-50">
                     {/* <option value="">Todos</option> */}
                     {employeeStatuses.map(s => <option key={s} value={s}>{s === 'ativo' ? 'Ativos' : 'Inativos'}</option>)}
                 </select>
            </div>
             {/* Seleção de Colunas */}
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Selecione as Colunas</label>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
                    {allColumns.map(col => (<label key={col.key} className="flex items-center gap-1.5 p-1 rounded hover:bg-gray-100 cursor-pointer"><input type="checkbox" checked={selectedColumns.includes(col.key)} onChange={() => setSelectedColumns(p => p.includes(col.key) ? p.filter(c => c !== col.key) : [...p, col.key])} className="h-3 w-3 rounded text-red-600 focus:ring-red-500 border-gray-300"/>{col.label}</label>))}
                </div>
            </div>
            {/* Tabela de Seleção */}
            <div className="border rounded-lg max-h-60 overflow-y-auto mb-4 custom-scrollbar">
                <table className="w-full text-xs text-left">
                    <thead className="bg-gray-100 sticky top-0 z-10 uppercase text-gray-600">
                        <tr>
                            <th className="p-2 w-10"><input type="checkbox" checked={selectAll} onChange={handleSelectAll} className="h-3 w-3 rounded text-red-600 focus:ring-red-500 border-gray-300"/></th>
                            <th className="p-2">Nome</th>
                            <th className="p-2 truncate">Função</th>
                            <th className="p-2 truncate">Obra Atual</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredEmployees.map(e => (
                            <tr key={e.id} className={`border-b hover:bg-gray-50 ${selectedEmployeeIds.includes(e.id) ? 'bg-red-50' : ''}`}>
                                <td className="p-2 text-center"><input type="checkbox" checked={selectedEmployeeIds.includes(e.id)} onChange={() => handleCheckboxChange(e.id)} className="h-3 w-3 rounded text-red-600 focus:ring-red-500 border-gray-300"/></td>
                                <td className="p-2 font-medium">{e.nome} {e.vulgo ? `(${e.vulgo})` : ''}</td>
                                <td className="p-2 truncate">{e.funcao}</td>
                                <td className="p-2 truncate">{e.obraAtual}</td>
                            </tr>
                        ))}
                         {filteredEmployees.length === 0 && (
                            <tr><td colSpan="4" className="p-4 text-center text-gray-500 italic">Nenhum funcionário encontrado.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
             {/* Botão Gerar */}
            <button onClick={handleGeneratePDF} className="mt-4 flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition disabled:bg-red-300 disabled:cursor-not-allowed text-sm" disabled={selectedEmployeeIds.length === 0 || selectedColumns.length === 0}>
                <Download size={16}/>Gerar PDF ({selectedEmployeeIds.length})
            </button>
        </div>
    );
};


// ===================================================================================
// PÁGINA PRINCIPAL (Usa props)
// ===================================================================================
const ReportsPage = ({ vehicles = [], obras = [], expenses = [], equipmentTypesForHours = [], employees = [], fines = [], vehicleGroups = {} }) => {
    // A lógica principal agora está nos subcomponentes
    // A página apenas monta os geradores de relatório, passando os dados necessários
    return (
        <div className="container mx-auto space-y-6 p-4 md:p-6 lg:p-8">
            <h1 className="text-3xl font-bold text-gray-800">Relatórios</h1>

            {/* Gerador Plano de Trabalho */}
            <ProtectedComponent requiredPermission="viewer">
                 <div className="p-4 sm:p-6 bg-white rounded-lg shadow-sm border">
                    <h2 className="text-xl font-semibold mb-4 text-gray-700">Relatório de Plano de Trabalho (PDF)</h2>
                    {/* Componente interno ou lógica aqui... */}
                    {/* ... (código do exportWorkplanToPDF adaptado para ser um componente ou chamado aqui) ... */}
                     <p className="text-gray-500 text-sm italic">Funcionalidade de PDF Plano de Trabalho movida para implementação futura ou componente dedicado.</p>
                </div>
            </ProtectedComponent>

            {/* Gerador Relatório Veículos */}
            <ProtectedComponent requiredPermission="viewer">
                <VehicleReportGenerator vehicles={vehicles} obras={obras} vehicleGroups={vehicleGroups} />
            </ProtectedComponent>

            {/* Gerador Relatório Funcionários */}
            <ProtectedComponent requiredPermission="viewer">
                <EmployeeReportGenerator employees={employees} obras={obras} vehicles={vehicles} fines={fines} />
            </ProtectedComponent>
        </div>
    );
};

export default ReportsPage;
