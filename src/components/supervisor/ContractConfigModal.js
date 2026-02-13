import React, { useState, useEffect } from 'react';
import { X, Save, FileText, Calendar, DollarSign, Clock, User } from 'lucide-react';
import apiClient from '../../services/apiClient';

const ContractConfigModal = ({ isOpen, onClose, obra, onSuccess }) => {
    const [formData, setFormData] = useState({
        valor_total: '',
        horas_totais: '',
        data_inicio: '',
        fiscal_nome: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && obra) {
            setFormData({
                valor_total: obra.kpi?.valor_total_contrato || obra.contract_total_value || '',
                horas_totais: obra.kpi?.horas_contratadas || obra.contract_hours || '',
                data_inicio: obra.data_inicio_contratual ? obra.data_inicio_contratual.split('T')[0] : '',
                fiscal_nome: obra.fiscal_nome || ''
            });
        }
    }, [isOpen, obra]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await apiClient.saveSupervisorContract({
                obra_id: obra.id,
                valor_total: parseFloat(formData.valor_total) || 0,
                horas_totais: parseFloat(formData.horas_totais) || 0,
                data_inicio: formData.data_inicio,
                fiscal_nome: formData.fiscal_nome
            });
            onSuccess();
            onClose();
        } catch (error) {
            alert('Erro ao salvar contrato: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up">
                {/* Header */}
                <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <FileText size={20} className="text-yellow-400" />
                        Configurar Contrato: {obra?.nome}
                    </h2>
                    <button onClick={onClose} className="hover:bg-slate-700 p-1 rounded transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <p className="text-sm text-slate-500 mb-4 bg-yellow-50 p-3 rounded border border-yellow-200">
                        Preencha os dados oficiais do contrato para habilitar o cálculo de previsão e a barra de progresso no Dashboard.
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">
                                Valor Total (R$)
                            </label>
                            <div className="relative">
                                <DollarSign size={16} className="absolute left-3 top-3 text-slate-400" />
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={formData.valor_total}
                                    onChange={e => setFormData({...formData, valor_total: e.target.value})}
                                    className="w-full pl-9 p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">
                                Horas Contratadas
                            </label>
                            <div className="relative">
                                <Clock size={16} className="absolute left-3 top-3 text-slate-400" />
                                <input
                                    type="number"
                                    step="0.1"
                                    required
                                    value={formData.horas_totais}
                                    onChange={e => setFormData({...formData, horas_totais: e.target.value})}
                                    className="w-full pl-9 p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none"
                                    placeholder="Total Horas"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">
                                Data Início Contratual
                            </label>
                            <div className="relative">
                                <Calendar size={16} className="absolute left-3 top-3 text-slate-400" />
                                <input
                                    type="date"
                                    required
                                    value={formData.data_inicio}
                                    onChange={e => setFormData({...formData, data_inicio: e.target.value})}
                                    className="w-full pl-9 p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none"
                                />
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">
                                Nome do Fiscal (Cliente)
                            </label>
                            <div className="relative">
                                <User size={16} className="absolute left-3 top-3 text-slate-400" />
                                <input
                                    type="text"
                                    value={formData.fiscal_nome}
                                    onChange={e => setFormData({...formData, fiscal_nome: e.target.value})}
                                    className="w-full pl-9 p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none"
                                    placeholder="Ex: Eng. João Silva"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 bg-yellow-400 text-slate-900 font-bold rounded-lg hover:bg-yellow-500 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                        >
                            {loading ? 'Salvando...' : (
                                <>
                                    <Save size={18} />
                                    Salvar Contrato
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ContractConfigModal;