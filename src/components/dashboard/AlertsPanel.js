import React, { useState, useMemo } from 'react';
import { Bell, AlertTriangle, ShieldAlert, Wrench, FileText, Badge, Timer } from 'lucide-react';
// Importa a lógica unificada de restrições
import { checkVehicleRestrictions } from '../../utils/vehicleRules';

const AlertsPanel = ({ vehicles = [], employees = [], inactivityAlerts = [], obras = [], navigate, setSelectedInactivityAlert, revisions = [] }) => {
    const [activeTab, setActiveTab] = useState('todos');

    // Processamento centralizado de alertas (Unificado)
    const alerts = useMemo(() => {
        const list = [];
        const now = new Date();
        const thirtyDays = new Date();
        thirtyDays.setDate(now.getDate() + 30);

        // 1. Alertas de Veículos (Manutenção e Docs de Veículos)
        vehicles.forEach(v => {
            const vehicleRevisions = revisions.filter(r => r.vehicleId === v.id);
            const restrictions = checkVehicleRestrictions(v, vehicleRevisions);

            restrictions.forEach((issue, index) => {
                let category = 'manutencao'; 
                // Mantém documentos do veículo separados da CNH
                if (issue.category === 'documento') category = 'docs_veiculo';
                if (issue.category === 'bloqueio') category = 'manutencao';

                list.push({
                    id: `v-${v.id}-${index}`,
                    category: category,
                    type: issue.type === 'error' ? 'danger' : 'warning',
                    title: `${v.registroInterno} - ${v.placa}`,
                    subtitle: issue.category.toUpperCase(),
                    message: issue.message,
                    date: 'Hoje',
                    action: () => navigate('/revisions', { state: { searchTerm: v.registroInterno } })
                });
            });
        });

        // 2. Alertas de Inatividade (Operacional)
        inactivityAlerts.forEach(alert => {
            if (['Resolvido', 'Observado'].includes(alert.status)) return;
            
            // Lógica robusta para Data e Dias
            let dateStr = 'Data desc.';
            let daysInactive = 0;

            if (alert.lastRefuelDate) {
                const refuelDate = new Date(alert.lastRefuelDate);
                if (!isNaN(refuelDate.getTime())) {
                    dateStr = refuelDate.toLocaleDateString('pt-BR');
                    // Calcula dias baseado na diferença de tempo real se o backend falhar
                    const diffTime = Math.abs(now - refuelDate);
                    daysInactive = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                }
            }

            // Fallback se o backend enviar dias calculados mas a data falhar, ou vice-versa
            if (daysInactive === 0 && alert.daysSinceLastRefuel) {
                daysInactive = parseInt(alert.daysSinceLastRefuel);
            }

            // Lógica robusta para Nome da Obra
            let obraNome = alert.obra?.nome || alert.obra_nome;
            if (!obraNome && (alert.obraId || alert.obra_id)) {
                // Tenta encontrar a obra na lista geral pelo ID
                const targetId = String(alert.obraId || alert.obra_id);
                const foundObra = obras.find(o => String(o.id) === targetId);
                if (foundObra) obraNome = foundObra.nome;
            }
            if (!obraNome) obraNome = 'Obra Desconhecida';

            list.push({
                id: `inat-${alert.id}`,
                category: 'inatividade', // Nova categoria exclusiva
                type: 'danger', 
                title: `${alert.vehicle?.registroInterno || 'Veículo'} - Inatividade`,
                subtitle: obraNome,
                message: `Parado há ${daysInactive || '?'} dias sem abastecer. Último: ${dateStr}`,
                date: dateStr,
                action: () => setSelectedInactivityAlert(alert)
            });
        });

        // 3. Alertas de Funcionários (CNH)
        if (Array.isArray(employees)) {
            employees.forEach(emp => {
                if (emp.validadeCNH) {
                    const validade = new Date(emp.validadeCNH);
                    
                    if (!isNaN(validade.getTime())) {
                        const validadeTime = new Date(validade.getFullYear(), validade.getMonth(), validade.getDate()).getTime();
                        const nowTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                        const thirtyDaysTime = new Date(thirtyDays.getFullYear(), thirtyDays.getMonth(), thirtyDays.getDate()).getTime();

                        if (validadeTime < nowTime) {
                            list.push({
                                id: `emp-${emp.id}`,
                                category: 'cnh', // Nova categoria exclusiva
                                type: 'danger',
                                title: `CNH VENCIDA: ${emp.nome}`,
                                subtitle: 'Habilitação',
                                message: `A CNH venceu em ${validade.toLocaleDateString('pt-BR')}.`,
                                date: validade.toLocaleDateString('pt-BR'),
                                action: () => navigate('/employees', { state: { searchTerm: emp.nome } })
                            });
                        } else if (validadeTime < thirtyDaysTime) {
                            list.push({
                                id: `emp-${emp.id}`,
                                category: 'cnh', // Nova categoria exclusiva
                                type: 'warning',
                                title: `CNH a Vencer: ${emp.nome}`,
                                subtitle: 'Habilitação',
                                message: `Vence em ${validade.toLocaleDateString('pt-BR')}.`,
                                date: validade.toLocaleDateString('pt-BR'),
                                action: () => navigate('/employees', { state: { searchTerm: emp.nome } })
                            });
                        }
                    }
                }
            });
        }

        return list.sort((a, b) => {
            if (a.type === 'danger' && b.type !== 'danger') return -1;
            if (a.type !== 'danger' && b.type === 'danger') return 1;
            return 0;
        });
    }, [vehicles, employees, inactivityAlerts, revisions, navigate, setSelectedInactivityAlert, obras]);

    const filteredAlerts = activeTab === 'todos' ? alerts : alerts.filter(a => a.category === activeTab);

    // Contagem atualizada com novas categorias
    const counts = {
        todos: alerts.length,
        manutencao: alerts.filter(a => a.category === 'manutencao').length,
        docs_veiculo: alerts.filter(a => a.category === 'docs_veiculo').length,
        cnh: alerts.filter(a => a.category === 'cnh').length,
        inatividade: alerts.filter(a => a.category === 'inatividade').length
    };

    // Abas atualizadas
    const tabs = [
        { id: 'todos', label: 'Todos', icon: <Bell size={14}/> },
        { id: 'manutencao', label: 'Manutenção', icon: <Wrench size={14}/> },
        { id: 'inatividade', label: 'Inatividade', icon: <Timer size={14}/> }, // Novo
        { id: 'cnh', label: 'CNH', icon: <Badge size={14}/> }, // Novo
        { id: 'docs_veiculo', label: 'Docs Veíc.', icon: <FileText size={14}/> },
    ];

    const colors = {
        danger: 'bg-red-50 border-l-red-500 text-red-900',
        warning: 'bg-yellow-50 border-l-yellow-500 text-yellow-900',
        info: 'bg-blue-50 border-l-blue-500 text-blue-900',
        success: 'bg-green-50 border-l-green-500 text-green-900'
    };

    const icons = {
        danger: <AlertTriangle size={18} className="text-red-500" />,
        warning: <AlertTriangle size={18} className="text-yellow-500" />,
        info: <ShieldAlert size={18} className="text-blue-500" />,
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-full flex flex-col overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <Bell size={18} className="text-yellow-600"/> Central de Alertas
                </h3>
                <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">{alerts.length}</span>
            </div>

            {/* Abas */}
            <div className="flex border-b shrink-0 overflow-x-auto">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-1 border-b-2 transition-colors whitespace-nowrap px-2
                            ${activeTab === tab.id ? 'border-yellow-500 text-yellow-700 bg-yellow-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    >
                        {tab.icon} {tab.label} 
                        {counts[tab.id] > 0 && <span className={`ml-1 text-[10px] px-1.5 rounded-full ${activeTab === tab.id ? 'bg-yellow-200' : 'bg-gray-200'}`}>{counts[tab.id]}</span>}
                    </button>
                ))}
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {filteredAlerts.length > 0 ? filteredAlerts.map((alert) => {
                    return (
                        <div 
                            key={alert.id} 
                            onClick={alert.action}
                            className={`p-3 rounded-lg border-l-4 shadow-sm cursor-pointer transition-all flex items-start gap-3 border border-gray-100 ${colors[alert.type]} hover:opacity-90`}
                        >
                            <div className="mt-0.5 shrink-0">{icons[alert.type]}</div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <h4 className="text-xs font-bold text-gray-800 truncate pr-2">{alert.title}</h4>
                                    <span className="text-[9px] bg-white bg-opacity-50 px-1.5 py-0.5 rounded text-gray-600 shrink-0 border border-gray-200">{alert.date}</span>
                                </div>
                                <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wide mb-0.5">{alert.subtitle}</p>
                                <p className="text-xs leading-snug">{alert.message}</p>
                            </div>
                        </div>
                    );
                }) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 py-10">
                        <CheckCircle size={32} className="mb-2 text-green-100"/>
                        <p className="text-xs">Nenhum alerta nesta categoria.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AlertsPanel;