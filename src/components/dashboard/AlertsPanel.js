import React, { useState, useMemo } from 'react';
import { Bell, AlertTriangle, ShieldAlert, Clock, CheckCircle, FileText, Badge } from 'lucide-react';

const AlertsPanel = ({ vehicles, employees, inactivityAlerts, obras, navigate, setSelectedInactivityAlert }) => {
    const [activeTab, setActiveTab] = useState('todos');

    // Processamento centralizado de alertas
    const alerts = useMemo(() => {
        const list = [];
        const now = new Date();
        const thirtyDays = new Date();
        thirtyDays.setDate(now.getDate() + 30);

        // 1. Alertas de Veículos (Revisão, Docs, Bloqueio)
        vehicles.forEach(v => {
            if (v.possuiAviso) {
                const isVencido = (v.avisoTexto || '').toLowerCase().includes('vencid') || v.canCirculate === false;
                let category = 'manutencao';
                if ((v.avisoTexto || '').includes('Documento') || (v.avisoTexto || '').includes('Licença')) category = 'documentos';
                
                list.push({
                    id: `v-${v.id}`,
                    title: v.registroInterno,
                    subtitle: v.modelo,
                    message: v.avisoTexto,
                    type: isVencido ? 'danger' : 'warning',
                    category: category,
                    date: new Date().toLocaleDateString(),
                    action: () => navigate('vehicles', { search: v.registroInterno })
                });
            }
        });

        // 2. Alertas de CNH
        employees.forEach(e => {
            if (e.cnhVencimento) {
                const venc = new Date(e.cnhVencimento + 'T12:00:00Z');
                if (venc < now) {
                    list.push({
                        id: `e-${e.id}`,
                        title: e.nome,
                        subtitle: 'CNH Vencida',
                        message: `Venceu em ${venc.toLocaleDateString()}`,
                        type: 'danger',
                        category: 'cnh',
                        date: venc.toLocaleDateString(),
                        action: () => navigate('employees', { search: e.nome })
                    });
                } else if (venc <= thirtyDays) {
                    list.push({
                        id: `e-${e.id}`,
                        title: e.nome,
                        subtitle: 'CNH a Vencer',
                        message: `Vence em ${venc.toLocaleDateString()}`,
                        type: 'warning',
                        category: 'cnh',
                        date: venc.toLocaleDateString(),
                        action: () => navigate('employees', { search: e.nome })
                    });
                }
            }
        });

        // 3. Alertas de Inatividade
        if (inactivityAlerts) {
            inactivityAlerts.forEach(alert => {
                const v = vehicles.find(veh => veh.id === alert.vehicleId);
                const o = obras.find(obr => obr.id === alert.obraId);
                
                if (v && o && alert.status !== 'Observado' && !(alert.status === 'Prolongado' && new Date(alert.prolongedUntil) > now)) {
                    list.push({
                        id: `i-${alert.id}`,
                        title: v.registroInterno,
                        subtitle: 'Inatividade Detectada',
                        message: `Sem abastecimento há >7 dias na obra ${o.nome}`,
                        type: 'info',
                        category: 'inatividade',
                        date: new Date().toLocaleDateString(),
                        action: () => setSelectedInactivityAlert({ ...alert, vehicle: v, obra: o })
                    });
                }
            });
        }

        return list.sort((a, b) => (a.type === 'danger' ? -1 : 1));
    }, [vehicles, employees, inactivityAlerts, obras, navigate, setSelectedInactivityAlert]);

    const filteredAlerts = activeTab === 'todos' ? alerts : alerts.filter(a => a.category === activeTab);

    // Componente de Aba
    const TabButton = ({ id, icon: Icon, label, count, color }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${
                activeTab === id 
                ? `border-${color}-500 text-${color}-700 bg-${color}-50` 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
        >
            <Icon size={14} />
            {label}
            {count > 0 && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-${color}-100 text-${color}-700`}>{count}</span>}
        </button>
    );

    const counts = {
        manutencao: alerts.filter(a => a.category === 'manutencao').length,
        documentos: alerts.filter(a => a.category === 'documentos').length,
        cnh: alerts.filter(a => a.category === 'cnh').length,
        inatividade: alerts.filter(a => a.category === 'inatividade').length
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-full flex flex-col">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-xl">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <Bell className="text-yellow-500" size={20}/> Central de Alertas
                </h3>
                <span className="text-xs font-medium text-gray-500">{alerts.length} pendentes</span>
            </div>
            
            {/* Tabs de Navegação */}
            <div className="flex overflow-x-auto px-2 border-b border-gray-100 gap-1 custom-scrollbar">
                <TabButton id="todos" icon={Bell} label="Todos" count={alerts.length} color="gray" />
                <TabButton id="manutencao" icon={AlertTriangle} label="Manutenção" count={counts.manutencao} color="red" />
                <TabButton id="documentos" icon={FileText} label="Docs" count={counts.documentos} color="orange" />
                <TabButton id="cnh" icon={Badge} label="CNH" count={counts.cnh} color="purple" />
                <TabButton id="inatividade" icon={Clock} label="Inatividade" count={counts.inatividade} color="blue" />
            </div>

            {/* Lista de Alertas */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar bg-gray-50/50">
                {filteredAlerts.length > 0 ? filteredAlerts.map(alert => {
                    const colors = {
                        danger: 'border-red-500 bg-red-50 hover:bg-red-100',
                        warning: 'border-yellow-400 bg-yellow-50 hover:bg-yellow-100',
                        info: 'border-blue-400 bg-blue-50 hover:bg-blue-100'
                    };
                    const icons = {
                        danger: <ShieldAlert className="text-red-500" size={18}/>,
                        warning: <AlertTriangle className="text-yellow-500" size={18}/>,
                        info: <Clock className="text-blue-500" size={18}/>
                    };

                    return (
                        <div 
                            key={alert.id}
                            onClick={alert.action}
                            className={`p-3 rounded-lg border-l-4 shadow-sm cursor-pointer transition-all flex items-start gap-3 ${colors[alert.type]}`}
                        >
                            <div className="mt-0.5">{icons[alert.type]}</div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <h4 className="text-sm font-bold text-gray-800 truncate">{alert.title}</h4>
                                    <span className="text-[10px] bg-white bg-opacity-60 px-1.5 py-0.5 rounded text-gray-600 font-mono">{alert.date}</span>
                                </div>
                                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-0.5">{alert.subtitle}</p>
                                <p className="text-xs text-gray-700 leading-snug">{alert.message}</p>
                            </div>
                        </div>
                    );
                }) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 py-10">
                        <CheckCircle size={40} className="mb-2 text-green-100"/>
                        <p className="text-sm">Nenhum alerta nesta categoria.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AlertsPanel;