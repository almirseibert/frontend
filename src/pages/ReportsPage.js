import React, { useState, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download, Users, Truck } from 'lucide-react';

// Importa o componente de proteção
import ProtectedComponent from '../components/ProtectedComponent';
// REMOVIDO: Importações do Firebase

// ===================================================================================
// RELATÓRIO DE VEÍCULOS (Componente existente, sem mudanças)
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
// RELATÓRIO DE FUNCIONÁRIOS (Componente existente, sem mudanças)
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
            // Usa 'historicoVeiculos' (que vem "flat" do obraController)
            (Array.isArray(obra.historicoVeiculos) ? obra.historicoVeiculos : []).forEach(history => {
                // Ativo se não tiver dataSaida
                if (history.employeeId && !history.dataSaida) { 
                    const employeeId = history.employeeId;
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
             // Acessa o JSON parseado (se existir)
            if (vehicle.operationalAssignment && typeof vehicle.operationalAssignment === 'object' && vehicle.operationalAssignment.employeeId) {
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
                const cnhVenc = employee.cnhVencimento ? new Date(employee.cnhVencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A';
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
// PÁGINA PRINCIPAL (ATUALIZADA com a lógica do Plano de Trabalho)
// ===================================================================================
const ReportsPage = ({ vehicles = [], obras = [], expenses = [], equipmentTypesForHours = [], employees = [], fines = [], vehicleGroups = {} }) => {
    
    // --- LÓGICA DO PLANO DE TRABALHO (COPIADA DE ReportsPage_firebase.js) ---
    const [pdfWorkplanSelectedObras, setPdfWorkplanSelectedObras] = useState([]);
    const [pdfWorkplanFilterStatus, setPdfWorkplanFilterStatus] = useState('ativa');

    const obrasToDisplay = useMemo(() => {
        if (!obras) {
            return [];
        }
        return obras
            .filter(o => o.status === pdfWorkplanFilterStatus)
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    }, [obras, pdfWorkplanFilterStatus]);

    useEffect(() => {
        setPdfWorkplanSelectedObras([]);
    }, [pdfWorkplanFilterStatus]);

    // --- FUNÇÃO DE EXPORTAÇÃO (ADAPTADA PARA API) ---
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
                // --- CORREÇÃO DE DATA (Firebase .toDate() -> new Date(string)) ---
                const dataInicioStr = obra.dataInicio ? new Date(obra.dataInicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A';
                const dataFimStr = obra.dataFim ? new Date(obra.dataFim).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Em andamento';
                doc.text(`Início: ${dataInicioStr}`, startX, currentY);
                currentY += 5;
                doc.text(`Fim: ${dataFimStr}`, startX, currentY);
                currentY += 10;
                
                // Lógica de cálculo de progresso (copiada e adaptada)
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

                // Histórico (vem "flat" do obraController.js, o que facilita)
                (obra.historicoVeiculos || []).forEach(h => {
                    const vehicle = vehicles.find(v => v.id === h.veiculoId);
                    if (!vehicle) return;

                    const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group].includes(vehicle.tipo));
                    const equipType = equipmentTypesForHours.find(t => vehicle.tipo === t);
                    
                    const isHourBased = vehicleGroup === 'Máquinas Pesadas' || vehicleGroup === 'Caminhões';

                    if (!isHourBased) return;
                    
                    // Os dados vêm "flat" da tabela obras_historico_veiculos, está correto.
                    const startReading = parseFloat(h.horimetroEntrada || h.odometroEntrada || 0);
                    let endReading;

                    if (h.dataSaida) { // Se já saiu da obra
                        endReading = parseFloat(h.horimetroSaida || h.odometroSaida || 0);
                    } else { // Se ainda está na obra, pega a leitura ATUAL do veículo
                         if (vehicleGroup === 'Máquinas Pesadas') {
                            endReading = parseFloat(vehicle.horimetroDigital ?? vehicle.horimetroAnalogico ?? vehicle.horimetro ?? 0);
                        } else if (vehicleGroup === 'Caminhões') {
                             // Aplica a regra O/H: Prancha usa Odometro, outros usam Horimetro
                             // *Nota*: A lógica do firebase usava SÓ horímetro para caminhões. Vamos manter isso
                             // para consistência com o código antigo, mas idealmente isso usaria a nova regra O/H.
                             // Vamos manter a lógica antiga por enquanto:
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
                           // Fallback para tipos não listados (ex: "Outros")
                           progressData.concluido[vehicle.tipo] = (progressData.concluido[vehicle.tipo] || 0) + hours;
                           if(!allEquipmentTypes.includes(vehicle.tipo)) {
                               allEquipmentTypes.push(vehicle.tipo); // Adiciona para exibir na tabela
                               progressData.contratado[vehicle.tipo] = 0; // Inicia contratado
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
                }).filter(Boolean); // Remove linhas nulas

                autoTable(doc, {
                    startY: currentY,
                    head: [['Tipo de Equipamento', 'Horas Contratadas', 'Horas Concluídas', 'Saldo']],
                    body: progressBody,
                    foot: [['TOTAL', progressData.totalContratado.toFixed(1), progressData.totalConcluido.toFixed(1), (progressData.totalContratado - progressData.totalConcluido).toFixed(1)]],
                    theme: 'striped',
                    headStyles: { fillColor: [255, 193, 7] }, // Amarelo
                    footStyles: { fontStyle: 'bold', fillColor: [105, 105, 105] }
                });

                let finalY = (doc).lastAutoTable.finalY + 10;
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
                    
                    // --- CORREÇÃO DE DATA (Firebase .toDate() -> new Date(string)) ---
                    return [ 
                        h.registroInterno || vehicle?.registroInterno || 'N/A', 
                        h.tipo || vehicle?.tipo || 'N/A', 
                        h.employeeName || 'N/A', // O controller 'obraController' já nos dá isso
                        h.dataEntrada ? new Date(h.dataEntrada).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A', 
                        h.dataSaida ? new Date(h.dataSaida).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Presente', 
                        startReading.toFixed(1),
                        (h.dataSaida ? endReading.toFixed(1) : `${endReading.toFixed(1)} (Atual)`), // Mostra (Atual) se não saiu
                        `${totalWorked} ${readingLabel}`
                    ];
                });

                if (vehicleHistoryBody.length > 0) {
                    autoTable(doc, { 
                        startY: finalY, 
                        head: [['Registro', 'Tipo', 'Funcionário', 'Entrada', 'Saída', 'Leitura Inicial', 'Leitura Final', 'Total Trab.']], 
                        body: vehicleHistoryBody, 
                        theme: 'striped', 
                        headStyles: { fillColor: [60, 179, 113] } // Verde
                    });
                    finalY = (doc).lastAutoTable.finalY + 15;
                } else {
                    doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text('Nenhum veículo alocado nesta obra.', 14, finalY); finalY += 15;
                }

                // Filtra despesas (garante que 'expenses' é um array)
                const obraExpenses = (expenses || []).filter(e => e.obraId === obra.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                const totalDespesas = obraExpenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
                
                doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text('Despesas da Obra', 14, finalY); finalY += 8;

                if (obraExpenses.length > 0) {
                    autoTable(doc, { 
                        startY: finalY, 
                        head: [['Data', 'Descrição', 'Categoria', 'Valor (R$)']], 
                        body: obraExpenses.map(e => [ 
                            // --- CORREÇÃO DE DATA E VALOR ---
                            e.createdAt ? new Date(e.createdAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A', 
                            e.description,
                            e.category || 'Outros',
                            (parseFloat(e.amount) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) 
                        ]), 
                        foot: [['Total', '', '', totalDespesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })]], 
                        theme: 'striped', 
                        headStyles: { fillColor: [220, 53, 69] }, // Vermelho
                        footStyles: { fontStyle: 'bold', fillColor: [105, 105, 105] } 
                    });
                } else {
                    doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text('Nenhuma despesa registrada para esta obra.', 14, finalY);
                }
            });
        
        doc.save(`Plano_de_Trabalho_MAK.pdf`);
    };
    // --- FIM DA LÓGICA COPIADA ---

    return (
        <div className="container mx-auto space-y-6 p-4 md:p-6 lg:p-8">
            <h1 className="text-3xl font-bold text-gray-800">Relatórios</h1>

            {/* Gerador Plano de Trabalho (AGORA IMPLEMENTADO) */}
            <ProtectedComponent requiredPermission="viewer">
                 <div className="p-4 sm:p-6 bg-white rounded-lg shadow-sm border">
                    <h2 className="text-xl font-semibold mb-4 text-gray-700">Relatório de Plano de Trabalho (PDF)</h2>
                    {/* --- JSX COPIADO E ADAPTADO --- */}
                    <div className="flex flex-col sm:flex-row gap-4 mb-4">
                        <div className="w-full sm:w-1/3">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Filtrar por Status da Obra</label>
                            <select 
                                value={pdfWorkplanFilterStatus} 
                                onChange={e => setPdfWorkplanFilterStatus(e.target.value)} 
                                className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-yellow-500 focus:border-yellow-500"
                            >
                                <option value="ativa">Obras Ativas</option>
                                <option value="finalizada">Obras Encerradas</option>
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Selecione uma ou mais Obras</label>
                            <select multiple value={pdfWorkplanSelectedObras} onChange={e => setPdfWorkplanSelectedObras(Array.from(e.target.selectedOptions, option => option.value))} className="w-full h-48 p-2 border rounded-lg bg-gray-50 focus:ring-yellow-500 focus:border-yellow-500 custom-scrollbar">
                                {obrasToDisplay.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                            </select>
                        </div>
                    </div>
                    <button onClick={exportWorkplanToPDF} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition disabled:bg-red-300 disabled:cursor-not-allowed text-sm" disabled={pdfWorkplanSelectedObras.length === 0}>
                        <Download size={16}/>Gerar PDF do Plano de Trabalho ({pdfWorkplanSelectedObras.length})
                    </button>
                    {/* --- FIM DO JSX COPIADO --- */}
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