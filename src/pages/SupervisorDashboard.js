import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Tv, RefreshCw, Loader, AlertCircle } from 'lucide-react';
import apiClient from '../services/apiClient';
import ObraCard from '../components/supervisor/ObraCard';
import ContractConfigModal from '../components/supervisor/ContractConfigModal';

const SupervisorDashboard = ({ user, onNavigateToDetail }) => {
    const [obras, setObras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(new Date());
    const [isTvMode, setIsTvMode] = useState(false);
    
    // Estados para o Modal de Configuração
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [selectedObraForConfig, setSelectedObraForConfig] = useState(null);

    const fetchDashboardData = async () => {
        try {
            if (obras.length === 0) setLoading(true);
            const data = await apiClient.getSupervisorDashboard();
            setObras(data);
            setLastUpdate(new Date());
        } catch (error) {
            console.error("Erro ao carregar dashboard:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
        const interval = setInterval(() => {
            fetchDashboardData();
        }, 300000); // 5 min
        return () => clearInterval(interval);
    }, []);

    // Abre o modal de configuração (Passo 1)
    const handleConfigClick = (obra) => {
        setSelectedObraForConfig(obra);
        setIsConfigModalOpen(true);
    };

    // Navega para a visão detalhada (Passo 2)
    const handleCardClick = (obraId) => {
        if (!isTvMode) {
            if (onNavigateToDetail) {
                onNavigateToDetail(obraId);
            } else {
                console.warn("Função de navegação não fornecida para o Dashboard");
            }
        }
    };

    const toggleTvMode = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((e) => console.error(e));
            setIsTvMode(true);
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                setIsTvMode(false);
            }
        }
    };

    useEffect(() => {
        const handleEsc = () => { if (!document.fullscreenElement) setIsTvMode(false); };
        document.addEventListener('fullscreenchange', handleEsc);
        return () => document.removeEventListener('fullscreenchange', handleEsc);
    }, []);

    return (
        <div className={`p-6 min-h-screen bg-slate-100 ${isTvMode ? 'overflow-hidden' : ''}`}>
            
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
                        <LayoutDashboard className="text-blue-600" size={32} />
                        Painel de Controle de Obras
                    </h1>
                    <p className="text-slate-500 mt-1 flex items-center text-sm">
                        <RefreshCw size={12} className="mr-1" />
                        Última atualização: {lastUpdate.toLocaleTimeString()}
                    </p>
                </div>
                
                <div className="flex gap-3">
                    <button 
                        onClick={fetchDashboardData}
                        className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                        title="Atualizar Agora"
                    >
                        <RefreshCw size={24} />
                    </button>
                    <button 
                        onClick={toggleTvMode}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all shadow-sm
                            ${isTvMode 
                                ? 'bg-red-500 text-white hover:bg-red-600' 
                                : 'bg-slate-800 text-white hover:bg-slate-700'}
                        `}
                    >
                        <Tv size={20} />
                        {isTvMode ? 'Sair do Modo TV' : 'Modo TV'}
                    </button>
                </div>
            </div>

            {loading && obras.length === 0 ? (
                <div className="flex h-96 items-center justify-center">
                    <Loader size={48} className="animate-spin text-blue-600" />
                    <span className="ml-3 text-xl text-slate-600">Calculando previsões...</span>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                    {obras.map((obra) => (
                        <div key={obra.id} className="h-full">
                            <ObraCard 
                                obra={obra} 
                                onClick={handleCardClick}
                                onConfig={handleConfigClick}
                            />
                        </div>
                    ))}
                    
                    {obras.length === 0 && (
                        <div className="col-span-full text-center py-20 text-slate-400">
                            <AlertCircle size={64} className="mx-auto mb-4 opacity-20" />
                            <p className="text-lg">Nenhuma obra ativa com contrato configurado encontrada.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Modal de Configuração */}
            <ContractConfigModal 
                isOpen={isConfigModalOpen}
                onClose={() => setIsConfigModalOpen(false)}
                obra={selectedObraForConfig}
                onSuccess={fetchDashboardData}
            />
        </div>
    );
};

export default SupervisorDashboard;