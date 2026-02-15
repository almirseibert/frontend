import React, { useState, useEffect } from 'react';
import { LayoutDashboard, RefreshCw, Loader, AlertCircle, Truck } from 'lucide-react';
import apiClient from '../services/apiClient';
import ObraCard from '../components/supervisor/ObraCard';
import ContractConfigModal from '../components/supervisor/ContractConfigModal';
import AllocationForecastPage from './AllocationForecastPage';

const SupervisorDashboard = ({ user, onNavigateToDetail }) => {
    const [obras, setObras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(new Date());
    const [viewMode, setViewMode] = useState('dashboard'); 
    
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [selectedObraForConfig, setSelectedObraForConfig] = useState(null);

    const fetchDashboardData = async () => {
        try {
            if (obras.length === 0) setLoading(true);
            const data = await apiClient.get('/supervisor/dashboard');
            // O backend já faz a ordenação por criticidade e data
            setObras(data);
            setLastUpdate(new Date());
        } catch (error) {
            console.error("Erro ao carregar dashboard:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (viewMode === 'dashboard') {
            fetchDashboardData();
            const interval = setInterval(fetchDashboardData, 300000); 
            return () => clearInterval(interval);
        }
    }, [viewMode]);

    // Handler seguro para evitar erros de propagação
    const handleConfigClick = (e, obra) => {
        if (e && typeof e.stopPropagation === 'function') {
            e.stopPropagation();
        }
        setSelectedObraForConfig(obra);
        setIsConfigModalOpen(true);
    };

    const handleCardClick = (obraId) => {
        if (onNavigateToDetail) {
            onNavigateToDetail(obraId);
        }
    };

    if (viewMode === 'allocations') {
        return <AllocationForecastPage onBack={() => setViewMode('dashboard')} />;
    }

    return (
        <div className="bg-slate-100 min-h-screen p-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <LayoutDashboard className="text-blue-600" />
                        Gestão de Obras
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                        Atualizado em: {lastUpdate.toLocaleTimeString()}
                    </p>
                </div>
                
                <div className="flex gap-3">
                    <button 
                        onClick={() => setViewMode('allocations')}
                        className="bg-white text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-bold shadow-sm border border-slate-200 flex items-center gap-2 transition-all"
                    >
                        <Truck size={18} /> Previsão de Desmobilização
                    </button>
                    <button 
                        onClick={fetchDashboardData}
                        className="bg-white p-2 rounded-lg text-slate-600 hover:text-blue-600 shadow-sm border border-slate-200"
                        title="Atualizar Agora"
                    >
                        <RefreshCw size={20} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center h-64">
                    <Loader size={48} className="animate-spin text-blue-600 mb-4" />
                    <span className="text-xl text-slate-600">Calculando previsões...</span>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                    {obras.map((obra) => (
                        <div key={obra.id} className="h-full transform transition-all hover:-translate-y-1">
                            <ObraCard 
                                obra={obra} 
                                onClick={() => handleCardClick(obra.id)}
                                // Passa o evento explicitamente para o handler do pai
                                onConfig={(e) => handleConfigClick(e, obra)}
                            />
                        </div>
                    ))}
                    
                    {obras.length === 0 && (
                        <div className="col-span-full text-center py-20 text-slate-400">
                            <AlertCircle size={64} className="mx-auto mb-4 opacity-20" />
                            <p className="text-lg">Nenhuma obra ativa encontrada.</p>
                        </div>
                    )}
                </div>
            )}

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