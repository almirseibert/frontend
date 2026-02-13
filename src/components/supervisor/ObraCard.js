import React from 'react';
import { Clock, Calendar, AlertTriangle, User, TrendingUp, FileSignature, Settings, BarChart2 } from 'lucide-react';

const ObraCard = ({ obra, onClick, onConfig }) => {
    const { kpi, nome, responsavel, fiscal_nome } = obra;
    
    // Mapa de cores baseado no status vindo do backend (Green <30, Yellow <70, Violet <90, Red >90)
    const colorMap = {
        green: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', bar: 'bg-emerald-500', icon: 'text-emerald-600' },
        yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', bar: 'bg-yellow-400', icon: 'text-yellow-600' },
        violet: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', bar: 'bg-purple-500', icon: 'text-purple-600' },
        red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', bar: 'bg-red-600', icon: 'text-red-600' },
    };

    // Fallback seguro caso status_cor venha null
    const theme = colorMap[kpi?.status_cor] || colorMap.green;
    
    // Formatação de Data
    const formatDate = (dateString) => {
        if (!dateString) return '--/--';
        return new Date(dateString).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    };

    const handleConfigClick = (e) => {
        e.stopPropagation(); // Impede que o clique abra os detalhes da obra
        onConfig(obra);
    };

    const percentual = Number(kpi?.percentual_conclusao || 0);

    return (
        <div 
            onClick={() => onClick(obra.id)}
            className={`
                relative flex flex-col justify-between group
                bg-white border-l-4 ${theme.border.replace('border', 'border-l')} 
                rounded-r-xl shadow-sm hover:shadow-xl hover:translate-y-[-2px]
                transition-all duration-300 cursor-pointer p-5 h-full border-t border-r border-b border-slate-100
            `}
        >
            {/* Botão de Configuração */}
            <button 
                onClick={handleConfigClick}
                className={`
                    absolute top-3 right-3 p-1.5 rounded-full 
                    hover:bg-slate-100 transition-all z-10
                    ${!kpi?.horas_contratadas ? 'bg-red-100 text-red-500 animate-pulse' : 'text-slate-300 hover:text-slate-600'}
                `}
                title="Configurar Contrato"
            >
                <Settings size={18} />
            </button>

            {/* Cabeçalho */}
            <div className="mb-4 pr-6">
                <h3 className="font-bold text-lg text-slate-800 leading-tight line-clamp-2 mb-1" title={nome}>{nome}</h3>
                <div className="flex flex-col gap-1">
                    <div className="flex items-center text-xs text-slate-500">
                        <User size={12} className="mr-1.5" />
                        <span className="truncate max-w-[200px] font-medium">{responsavel || 'Sem Responsável'}</span>
                    </div>
                    {fiscal_nome && (
                        <div className="flex items-center text-xs text-slate-500">
                            <FileSignature size={12} className="mr-1.5" />
                            <span className="truncate max-w-[200px]">{fiscal_nome}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Corpo: Termômetro do Contrato e Previsão */}
            <div className="mb-5 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="flex justify-between items-end mb-2">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Previsão Término</span>
                        <div className={`flex items-center font-bold text-base ${theme.text}`}>
                            <Calendar size={16} className="mr-1.5" />
                            {kpi?.data_fim_estimada ? formatDate(kpi.data_fim_estimada) : <span className="text-slate-400">Calculando...</span>}
                        </div>
                    </div>
                    {kpi?.dias_restantes_estimados > 0 && (
                        <div className="text-right">
                             <span className="text-[10px] text-slate-400 uppercase font-bold">Restam</span>
                             <div className="text-sm font-bold text-slate-600">{kpi.dias_restantes_estimados} dias</div>
                        </div>
                    )}
                </div>

                {/* Barra de Progresso */}
                <div className="mt-3">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                        <span>{Number(kpi?.horas_executadas || 0).toFixed(0)}h Exec.</span>
                        <span>{percentual.toFixed(1)}%</span>
                        <span>{Number(kpi?.horas_contratadas || 0).toFixed(0)}h Total</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                        <div 
                            className={`h-full ${theme.bar} transition-all duration-1000 ease-out relative`}
                            style={{ width: `${Math.min(percentual, 100)}%` }}
                        >
                            {/* Efeito Shimmer apenas se estiver ativo */}
                             {percentual < 100 && <div className="absolute top-0 left-0 w-full h-full opacity-30 bg-gradient-to-r from-transparent via-white to-transparent animate-shimmer" />}
                        </div>
                    </div>
                </div>
            </div>

            {/* Rodapé: Alertas Críticos */}
            <div className="mt-auto flex flex-wrap gap-2">
                {/* Alerta de Assinatura */}
                {kpi?.alertas_assinatura > 0 && (
                    <div className="flex items-center bg-orange-50 text-orange-700 px-2 py-1 rounded border border-orange-100 text-[10px] font-bold animate-pulse" title="Boletins sem assinatura">
                        <FileSignature size={12} className="mr-1" />
                        {kpi.alertas_assinatura} Pendentes
                    </div>
                )}
                
                {/* Status Crítico > 90% */}
                {percentual > 90 && (
                    <div className="flex items-center bg-red-50 text-red-700 px-2 py-1 rounded border border-red-100 text-[10px] font-bold">
                        <AlertTriangle size={12} className="mr-1" />
                        Zona de Aditivo
                    </div>
                )}
                 
                 {/* Status Violeta 70-90% */}
                {percentual > 70 && percentual <= 90 && (
                     <div className="flex items-center bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-100 text-[10px] font-bold">
                        <TrendingUp size={12} className="mr-1" />
                        Atenção 70%
                    </div>
                )}
            </div>
        </div>
    );
};

export default ObraCard;