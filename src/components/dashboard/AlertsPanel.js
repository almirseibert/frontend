import React, { useState, useMemo } from 'react';
import { Bell, AlertTriangle, ShieldAlert, Clock, CheckCircle, FileText, Badge } from 'lucide-react';
// Importa a lógica unificada de restrições
import { checkVehicleRestrictions, getVehicleMainReading } from '../../utils/vehicleRules';

const AlertsPanel = ({ vehicles = [], employees = [], inactivityAlerts = [], obras = [], navigate, setSelectedInactivityAlert, revisions = [] }) => {
    const [activeTab, setActiveTab] = useState('todos');

    // Processamento centralizado de alertas (Unificado)
    const alerts = useMemo(() => {
        const list = [];
        const now = new Date();
        const thirtyDays = new Date();
        thirtyDays.setDate(now.getDate() + 30);

        // 1. Alertas de Veículos (Revisão, Docs, Bloqueio)
        vehicles.forEach(v => {
            // Busca revisões do veículo
            const vehicleRevisions = revisions.filter(r => r.vehicleId === v.id);
            const restrictions = checkVehicleRestrictions(v, vehicleRevisions);

            restrictions.forEach((issue, index) => {
                let category = 'manutencao'; 
                if (issue.category === 'documento') category = 'documentos';
                if (issue.category === 'bloqueio') category = 'alertas';

                list.push({
                    id: `v-${v.id}-${index}`,
                    category: category,
                    type: issue.type === 'error' ? 'danger' : 'warning',
                    title: `${v.registroInterno} - ${v.placa}`,
                    subtitle: issue.category.toUpperCase(),
                    message: issue.message,
                    date: 'Hoje',
                    // Navegação inteligente: leva para a página e filtra pelo registro
                    action: () => navigate('/revisions', { state: { searchTerm: v.registroInterno } })
                });
            });
        });

        // 2. Alertas de Inatividade (Operacional)
        // Regra: Veículos alocados em obra e com mais de 7 dias sem abastecimento
        // A lista inactivityAlerts já deve vir filtrada do backend/Dashboard.js, mas reforçamos aqui se necessário
        inactivityAlerts.forEach(alert => {
            if (alert.status !== 'Ativo') return;
            
            const daysInactive = alert.daysSinceLastRefuel || Math.floor((now - new Date(alert.lastRefuelDate)) / (1000 * 60 * 60 * 24));
            
            list.push({
                id: `inat-${alert.id}`,
                category: 'alertas', // Agrupado em Avisos
                type: 'danger', // Vermelho (Inatividade é crítica)
                title: `${alert.vehicle?.registroInterno} - Inatividade`,
                subtitle: alert.obra?.nome || 'Obra Desconhecida',
                message: `Veículo parado há ${daysInactive} dias sem abastecer.`,
                date: new Date(alert.lastRefuelDate).toLocaleDateString('pt-BR'),
                action: () => setSelectedInactivityAlert(alert)
            });
        });

        // 3. Alertas de Funcionários (CNH)
        employees.forEach(emp => {
            if (emp.validadeCNH) {
                const validade = new Date(emp.validadeCNH);
                if (validade < now) {
                    list.push({
                        id: `emp-${emp.id}`,
                        category: 'documentos',
                        type: 'danger',
                        title: `CNH VENCIDA: ${emp.nome}`,
                        subtitle: 'Documentos',
                        message: `A CNH venceu em ${validade.toLocaleDateString('pt-BR')}.`,
                        date: validade.toLocaleDateString('pt-BR'),
                        action: () => navigate('/employees', { state: { searchTerm: emp.nome } })
                    });
                } else if (validade < thirtyDays) {
                    list.push({
                        id: `emp-${emp.id}`,
                        category: 'documentos',
                        type: 'warning',
                        title: `CNH a Vencer: ${emp.nome}`,
                        subtitle: 'Documentos',
                        message: `Vence em ${validade.toLocaleDateString('pt-BR')}.`,
                        date: validade.toLocaleDateString('pt-BR'),
                        action: () => navigate('/employees', { state: { searchTerm: emp.nome } })
                    });
                }
            }
        });

        // Ordenação por criticidade (Danger primeiro)
        return list.sort((a, b) => {
            if (a.type === 'danger' && b.type !== 'danger') return -1;
            if (a.type !== 'danger' && b.type === 'danger') return 1;
            return 0;
        });
    }, [vehicles, employees, inactivityAlerts, revisions, navigate, setSelectedInactivityAlert]);

    const filteredAlerts = activeTab === 'todos' ? alerts : alerts.filter(a => a.category === activeTab);

    const counts = {
        todos: alerts.length,
        manutencao: alerts.filter(a => a.category === 'manutencao').length,
        documentos: alerts.filter(a => a.category === 'documentos').length,
        alertas: alerts.filter(a => a.category === 'alertas').length
    };

    const tabs = [
        { id: 'todos', label: 'Todos', icon: <Bell size={14}/> },
        { id: 'manutencao', label: 'Manutenção', icon: <Clock size={14}/> },
        { id: 'documentos', label: 'Docs', icon: <FileText size={14}/> },
        { id: 'alertas', label: 'Avisos', icon: <ShieldAlert size={14}/> },
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
        info: <Clock size={18} className="text-blue-500" />,
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