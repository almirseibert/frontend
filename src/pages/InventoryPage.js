import React, { useState, useEffect } from 'react';
import { Package, PlusCircle, Edit, Trash2, Tag, Layers, Search, AlertTriangle } from 'lucide-react';
import ProtectedComponent from '../components/ProtectedComponent';

// ==========================================================
// MÓDULO DE ESTOQUE E ALMOXARIFADO (BETA)
// Estrutura pronta para conexão futura via apiClient.
// ==========================================================

const InventoryPage = ({ user, setAlertMessage, PasswordConfirmationModal, ConfirmationModal, apiClient }) => {
    // --- ESTADOS (MOCK INICIAL) ---
    const [products, setProducts] = useState([
        { id: '1', name: 'Filtro de Óleo Lubrificante', sku: 'FIL-001', category: 'Filtros', quantity: 15, minQuantity: 5, unitPrice: 85.50 },
        { id: '2', name: 'Óleo Motor 15W40', sku: 'LUB-15W40', category: 'Lubrificantes', quantity: 2, minQuantity: 10, unitPrice: 25.00 },
        { id: '3', name: 'Lona de Freio Traseira', sku: 'FRE-001', category: 'Freios', quantity: 8, minQuantity: 10, unitPrice: 320.00 }
    ]);
    
    const [filterText, setFilterText] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    
    // --- LÓGICA DE EXIBIÇÃO ---
    const categories = [...new Set(products.map(p => p.category))];

    const filteredProducts = products.filter(p => {
        const matchesText = p.name.toLowerCase().includes(filterText.toLowerCase()) || p.sku.toLowerCase().includes(filterText.toLowerCase());
        const matchesCategory = categoryFilter ? p.category === categoryFilter : true;
        return matchesText && matchesCategory;
    });

    const lowStockCount = products.filter(p => p.quantity <= p.minQuantity).length;

    return (
        <div className="container mx-auto p-4 md:p-8 animate-fade-in space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                        <Package className="text-purple-600" size={32} /> Almoxarifado / Estoque
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Gestão de peças, lubrificantes e insumos gerais.</p>
                </div>
                <ProtectedComponent requiredPermission="editor">
                    <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg shadow hover:bg-purple-700 transition w-full sm:w-auto justify-center text-sm">
                        <PlusCircle size={18} /> Cadastrar Produto
                    </button>
                </ProtectedComponent>
            </div>

            {/* Dash Cards Rápidos */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border flex items-center gap-4">
                    <div className="bg-blue-100 p-3 rounded-lg text-blue-600"><Layers size={24}/></div>
                    <div><p className="text-sm text-gray-500 font-bold">Total de Itens (SKUs)</p><p className="text-2xl font-black">{products.length}</p></div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border flex items-center gap-4">
                    <div className="bg-green-100 p-3 rounded-lg text-green-600"><Tag size={24}/></div>
                    <div><p className="text-sm text-gray-500 font-bold">Valor em Estoque</p><p className="text-2xl font-black">R$ {products.reduce((acc, p) => acc + (p.quantity * p.unitPrice), 0).toFixed(2)}</p></div>
                </div>
                <div className={`p-4 rounded-xl shadow-sm border flex items-center gap-4 ${lowStockCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
                    <div className={`${lowStockCount > 0 ? 'bg-red-200 text-red-700' : 'bg-gray-100 text-gray-500'} p-3 rounded-lg`}><AlertTriangle size={24}/></div>
                    <div><p className={`text-sm font-bold ${lowStockCount > 0 ? 'text-red-700' : 'text-gray-500'}`}>Estoque Baixo</p><p className="text-2xl font-black">{lowStockCount} itens</p></div>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white p-4 rounded-lg shadow-sm border grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                    <input type="text" placeholder="Buscar por nome ou SKU..." value={filterText} onChange={e => setFilterText(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-400 outline-none"/>
                </div>
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="p-2 border rounded-lg w-full bg-white outline-none">
                    <option value="">Todas as Categorias</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            {/* Tabela */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-600 font-bold border-b">
                        <tr>
                            <th className="p-4">SKU / Cód.</th>
                            <th className="p-4">Produto</th>
                            <th className="p-4">Categoria</th>
                            <th className="p-4 text-center">Estoque Atual</th>
                            <th className="p-4 text-right">Preço Médio</th>
                            <th className="p-4 text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredProducts.map(p => (
                            <tr key={p.id} className="hover:bg-purple-50 transition-colors">
                                <td className="p-4 font-mono text-gray-600">{p.sku}</td>
                                <td className="p-4 font-bold text-gray-900">{p.name}</td>
                                <td className="p-4"><span className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-600">{p.category}</span></td>
                                <td className="p-4 text-center">
                                    <span className={`px-2 py-1 rounded font-bold ${p.quantity <= p.minQuantity ? 'bg-red-100 text-red-700 animate-pulse' : 'text-gray-800'}`}>
                                        {p.quantity} un
                                    </span>
                                </td>
                                <td className="p-4 text-right text-gray-600">R$ {p.unitPrice.toFixed(2)}</td>
                                <td className="p-4 text-center">
                                    <div className="flex justify-center gap-2">
                                        <button className="text-gray-400 hover:text-purple-600 transition"><Edit size={16}/></button>
                                        <button className="text-gray-400 hover:text-red-600 transition"><Trash2 size={16}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredProducts.length === 0 && <div className="p-10 text-center text-gray-400">Nenhum produto listado no estoque.</div>}
            </div>
            
            <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 mt-6 text-sm text-purple-800 flex items-start gap-3">
                <AlertTriangle className="shrink-0" size={20}/>
                <p><strong>Módulo em Implantação:</strong> Esta é a interface inicial do Estoque. Os dados acima são demonstrativos. A integração para baixar o estoque na mesma hora em que uma Ordem de Serviço ou Manutenção for confirmada será ativada nos próximos passos.</p>
            </div>
        </div>
    );
};

export default InventoryPage;