import React, { useState } from 'react';
import { 
    Home, Truck, Fuel, Settings, Users, AlertTriangle, 
    FileText, ShoppingCart, Clipboard, LogOut, ChevronRight, ChevronLeft, Droplet, Disc, Bell
} from 'lucide-react'; 
import ChangePasswordModal from './ChangePasswordModal'; // Certifique-se de criar este arquivo

const Sidebar = ({ currentPage, setCurrentPage, user, logout }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

    // Mapeamento dos itens de menu
    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: <Home size={18} /> },
        { id: 'vehicles', label: 'Veículos', icon: <Truck size={18} /> },
        { id: 'employees', label: 'Funcionários', icon: <Users size={18} /> },
        
        // Itens Condicionais
        { 
            id: 'refueling', 
            label: 'Abastecimento', 
            icon: <Fuel size={18} />,
            restricted: true // Flag customizada
        },
        { 
            id: 'comboio', 
            label: 'Comboio', 
            icon: <Truck size={18} className="transform scale-x-[-1]" />,
            restricted: true 
        },

        // Gestão
        { id: 'revisions', label: 'Revisões', icon: <Bell size={18} /> },
        { id: 'tires', label: 'Gestão de Pneus', icon: <Disc size={18} /> },
        { id: 'partners', label: 'Parceiros/Postos', icon: <Droplet size={18} /> },
        
        // Itens em Desuso (Dimmed)
        { id: 'controleDiario', label: 'Controle Diário', icon: <Clipboard size={18} />, dimmed: true },
        { id: 'orders', label: 'Compras/Serviço', icon: <ShoppingCart size={18} />, dimmed: true },
    ];

    const canRefuel = user?.canAccessRefueling || user?.role === 'admin' || user?.user_type === 'admin';
    const isAdmin = user?.role === 'admin' || user?.user_type === 'admin';

    return (
        <>
            <div className={`bg-gray-900 text-white shadow-xl flex flex-col transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-64'} h-full z-20`}>
                {/* Header */}
                <div className="h-16 flex items-center justify-between px-4 bg-gray-950 border-b border-gray-800">
                    {!isCollapsed && <span className="font-bold text-lg tracking-wider">FROTAS<span className="text-yellow-500">MAK</span></span>}
                    <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1 rounded hover:bg-gray-800 text-gray-400">
                        {isCollapsed ? <ChevronRight size={20}/> : <ChevronLeft size={20}/>}
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto py-4 space-y-1">
                    {navItems.map(item => {
                        // Lógica de Ocultação
                        if (item.restricted && !canRefuel) return null;

                        const isActive = currentPage === item.id;
                        const isDimmed = item.dimmed; // Itens em desuso

                        return (
                            <button
                                key={item.id}
                                onClick={() => setCurrentPage(item.id)}
                                className={`w-full flex items-center px-4 py-3 transition-colors duration-200 border-l-4 
                                    ${isActive 
                                        ? 'bg-gray-800 border-yellow-500 text-white' 
                                        : 'border-transparent hover:bg-gray-800 text-gray-400 hover:text-white'}
                                    ${isDimmed && !isActive ? 'opacity-50 hover:opacity-100' : ''}
                                `}
                                title={isCollapsed ? item.label : ''}
                            >
                                <span className={isActive ? 'text-yellow-500' : ''}>{item.icon}</span>
                                {!isCollapsed && <span className={`ml-3 font-medium text-sm ${isDimmed ? 'font-normal' : ''}`}>{item.label}</span>}
                            </button>
                        );
                    })}

                    {/* Área Admin */}
                    {isAdmin && (
                        <div className="mt-4 pt-4 border-t border-gray-800">
                            {!isCollapsed && <p className="px-4 text-xs font-bold text-gray-600 uppercase mb-2">Administração</p>}
                            <button
                                onClick={() => setCurrentPage('admin')}
                                className={`w-full flex items-center px-4 py-3 transition-colors border-l-4 
                                    ${currentPage === 'admin' ? 'bg-red-900/20 border-red-500 text-red-400' : 'border-transparent hover:bg-gray-800 text-gray-400'}`}
                            >
                                <Settings size={18} />
                                {!isCollapsed && <span className="ml-3 font-medium text-sm">Painel Admin</span>}
                            </button>
                        </div>
                    )}
                </nav>

                {/* Footer User Profile */}
                <div className="p-4 bg-gray-950 border-t border-gray-800">
                    <div className={`flex items-center ${isCollapsed ? 'justify-center' : ''}`}>
                        <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-gray-900 font-bold text-xs shrink-0">
                            {user?.name?.charAt(0).toUpperCase()}
                        </div>
                        {!isCollapsed && (
                            <div className="ml-3 overflow-hidden">
                                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                                <button onClick={() => setIsPasswordModalOpen(true)} className="text-xs text-blue-400 hover:text-blue-300 block">
                                    Trocar Senha
                                </button>
                            </div>
                        )}
                    </div>
                    {!isCollapsed && (
                        <button onClick={logout} className="mt-3 w-full flex items-center justify-center py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded">
                            <LogOut size={14} className="mr-2"/> SAIR
                        </button>
                    )}
                </div>
            </div>

            {/* Modal de Troca de Senha Renderizado Aqui */}
            <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />
        </>
    );
};

export default Sidebar;