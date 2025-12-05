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
        // Utiliza os dados já processados pelo App.js (possuiAviso e avisoTexto)
        vehicles.forEach(v => {
            if (v.possuiAviso) {
                // Tenta categorizar baseado no texto do aviso
                const text = (v.avisoTexto || '').toLowerCase();
                let category = 'manutencao'; // Default
                let type = 'warning';

                if (text.includes('bloqueio') || text.includes('vencid') || text.includes('não pode')) {
                    type = 'danger';
                }

                if (text.includes('documento') || text.includes('aet') || text.includes('tacógrafo')) {
                    category = 'documentos';
                }

                list.push({
                    id: `v-${v.id}`,
                    title: v.registroInterno,
                    subtitle: v.modelo,
                    message: v.avisoTexto,
                    type: type,
                    category: category,
                    date: new Date().toLocaleDateString(),
                    action: () => navigate('vehicles', { search: v.registroInterno })
                });
            }
        });

        // 2. Alertas de CNH
        employees.forEach(e => {
            if (e.cnhVencimento) {
                // Tenta parsear a data corretamente independente do formato
                let venc = null;
                if (e.cnhVencimento.includes('T')) {
                     venc = new Date(e.cnhVencimento);
                } else {
                     venc = new Date(e.cnhVencimento + 'T12:00:00Z');
                }

                if (!isNaN(venc.getTime())) {
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
            }
        });

        // 3. Alertas de Inatividade
        if (inactivityAlerts) {
            inactivityAlerts.forEach(alert => {
                const v = vehicles.find(veh => veh.id === alert.vehicleId);
                const o = obras.find(obr => obr.id === alert.obraId);
                
                // Exibe se não estiver observado e não estiver em período de prolongamento válido
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

        // Ordenação por prioridade: Danger > Warning > Info
        const priority = { danger: 0, warning: 1, info: 2 };
        return list.sort((a, b) => priority[a.type] - priority[b.type]);
    }, [vehicles, employees, inactivityAlerts, obras, navigate, setSelectedInactivityAlert]);

    const filteredAlerts = activeTab === 'todos' ? alerts : alerts.filter(a => a.category === activeTab);

    // Componente de Aba
    const TabButton = ({ id, icon: Icon, label, count, color }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors mb-1 mr-1 ${
                activeTab === id 
                ? `border-${color}-500 text-${color}-700 bg-${color}-50 ring-1 ring-${color}-200` 
                : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
            }`}
        >
            <Icon size={12} />
            {label}
            {count > 0 && <span className={`ml-1 px-1 py-0 rounded-full text-[9px] bg-${color}-200 text-${color}-800 min-w-[16px] text-center`}>{count}</span>}
        </button>
    );

    const counts = {
        manutencao: alerts.filter(a => a.category === 'manutencao').length,
        documentos: alerts.filter(a => a.category === 'documentos').length,
        cnh: alerts.filter(a => a.category === 'cnh').length,
        inatividade: alerts.filter(a => a.category === 'inatividade').length
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-full flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-100 flex items-center justify-between bg-gray-50 shrink-0">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm">
                    <Bell className="text-yellow-500" size={18}/> Central de Alertas
                </h3>
                <span className="text-xs font-medium text-gray-500 bg-white px-2 py-0.5 rounded border">{alerts.length}</span>
            </div>
            
            {/* Tabs de Navegação - Flex Wrap para evitar scroll */}
            <div className="p-2 border-b border-gray-100 bg-gray-50/50 flex flex-wrap gap-1 shrink-0">
                <TabButton id="todos" icon={Bell} label="Geral" count={alerts.length} color="gray" />
                <TabButton id="manutencao" icon={AlertTriangle} label="Manut." count={counts.manutencao} color="red" />
                <TabButton id="documentos" icon={FileText} label="Docs" count={counts.documentos} color="orange" />
                <TabButton id="cnh" icon={Badge} label="CNH" count={counts.cnh} color="purple" />
                <TabButton id="inatividade" icon={Clock} label="Inat." count={counts.inatividade} color="blue" />
            </div>

            {/* Lista de Alertas */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar bg-slate-50">
                {filteredAlerts.length > 0 ? filteredAlerts.map(alert => {
                    const colors = {
                        danger: 'border-red-500 bg-white hover:bg-red-50',
                        warning: 'border-yellow-400 bg-white hover:bg-yellow-50',
                        info: 'border-blue-400 bg-white hover:bg-blue-50'
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
                            className={`p-3 rounded-lg border-l-4 shadow-sm cursor-pointer transition-all flex items-start gap-3 border border-gray-100 ${colors[alert.type]}`}
                        >
                            <div className="mt-0.5 shrink-0">{icons[alert.type]}</div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <h4 className="text-xs font-bold text-gray-800 truncate">{alert.title}</h4>
                                    <span className="text-[9px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{alert.date}</span>
                                </div>
                                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">{alert.subtitle}</p>
                                <p className="text-xs text-gray-700 leading-snug">{alert.message}</p>
                            </div>
                        </div>
                    );
                }) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 py-10">
                        <CheckCircle size={32} className="mb-2 text-green-200"/>
                        <p className="text-xs">Nenhum alerta nesta categoria.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AlertsPanel;