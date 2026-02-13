import React from 'react';
import { Clock, Calendar, AlertTriangle, User, TrendingUp, FileSignature, Settings } from 'lucide-react';

const ObraCard = ({ obra, onClick, onConfig }) => {
    const { kpi, nome, responsavel, fiscal_nome } = obra;
    
    // Mapa de cores baseado no status vindo do backend
    const colorMap = {
        green: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', bar: 'bg-emerald-500' },
        yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', bar: 'bg-yellow-500' },
        violet: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', bar: 'bg-purple-600' },
        red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', bar: 'bg-red-600' },
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

    return (
        <div 
            onClick={() => onClick(obra.id)}
            className={`
                relative flex flex-col justify-between group
                ${theme.bg} ${theme.border} border-2 
                rounded-xl shadow-sm hover:shadow-lg hover:scale-[1.02] 
                transition-all duration-300 cursor-pointer p-5 h-full
            `}
        >
            {/* Botão de Configuração (Só aparece no hover ou se não tiver contrato) */}
            <button 
                onClick={handleConfigClick}
                className={`
                    absolute top-2 right-2 p-1.5 rounded-full 
                    hover:bg-white hover:shadow-md transition-all z-10
                    ${!kpi?.horas_contratadas ? 'bg-red-100 text-red-500 animate-pulse' : 'text-slate-400 opacity-0 group-hover:opacity-100'}
                `}
                title="Configurar Contrato"
            >
                <Settings size={18} />
            </button>

            {/* Cabeçalho */}
            <div className="flex justify-between items-start mb-4">
                <div className="flex-1 pr-2">
                    <h3 className="font-bold text-lg text-slate-800 leading-tight line-clamp-2" title={nome}>{nome}</h3>
                    <div className="flex items-center mt-1 text-sm text-slate-600">
                        <User size={14} className="mr-1" />
                        <span className="truncate max-w-[150px]">{responsavel || 'Sem Responsável'}</span>
                    </div>
                </div>
                {/* Badge de Previsão */}
                <div className={`flex flex-col items-end ${theme.text} min-w-[100px] mt-4`}>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Término Est.</span>
                    <div className="flex items-center font-bold text-lg">
                        <Calendar size={18} className="mr-1" />
                        {formatDate(kpi?.data_fim_estimada)}
                    </div>
                    <span className="text-xs font-medium opacity-80">
                        {kpi?.dias_restantes_estimados || 0} dias rest.
                    </span>
                </div>
            </div>

            {/* Corpo: Termômetro do Contrato */}
            <div className="mb-4">
                <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
                    <span>Progresso ({kpi?.percentual_conclusao || 0}%)</span>
                    <span>{Number(kpi?.horas_executadas || 0).toFixed(0)}h / {Number(kpi?.horas_contratadas || 0).toFixed(0)}h</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden shadow-inner">
                    <div 
                        className={`h-full ${theme.bar} transition-all duration-1000 ease-out relative`}
                        style={{ width: `${Math.min(kpi?.percentual_conclusao || 0, 100)}%` }}
                    >
                        {/* Efeito de "brilho" na barra */}
                        <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-gradient-to-r from-transparent via-white to-transparent animate-shimmer" />
                    </div>
                </div>
            </div>

            {/* Rodapé: Alertas e Fiscal */}
            <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-200/50">
                {/* Informação do Fiscal */}
                <div className="text-xs text-slate-500">
                    <span className="block font-semibold">Fiscal:</span>
                    {fiscal_nome ? (
                        <span className="text-slate-700 font-medium">{fiscal_nome}</span>
                    ) : (
                        <span className="text-red-500 bg-red-100 px-1 rounded">Não Informado ✎</span>
                    )}
                </div>

                {/* Badges de Alerta */}
                <div className="flex gap-2">
                    {kpi?.alertas_assinatura > 0 && (
                        <div className="flex items-center bg-orange-100 text-orange-700 px-2 py-1 rounded-md text-xs font-bold animate-pulse" title="Assinaturas Pendentes">
                            <FileSignature size={14} className="mr-1" />
                            {kpi.alertas_assinatura} Pend.
                        </div>
                    )}
                    {/* Se estiver crítico (Vermelho) */}
                    {kpi?.status_cor === 'red' && (
                        <div className="flex items-center bg-red-100 text-red-700 px-2 py-1 rounded-md text-xs font-bold">
                            <AlertTriangle size={14} className="mr-1" />
                            Crítico
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ObraCard;