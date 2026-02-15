import React, { useState, useEffect } from 'react';
import { X, Save, FileText, Calendar, DollarSign, Clock, User, AlertCircle, HardHat } from 'lucide-react';
import apiClient from '../../services/apiClient';

const ContractConfigModal = ({ isOpen, onClose, obra, onSuccess }) => {
    const [formData, setFormData] = useState({
        valor_total: '',
        horas_totais: '',
        data_inicio: '',
        data_fim_contratual: '',
        fiscal_nome: '',
        responsavel_nome: ''
    });
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
        if (isOpen && obra) {
            // Lógica de Preenchimento Inicial
            setFormData({
                valor_total: obra.kpi?.valor_total_contrato || obra.valorTotalContrato || '',
                horas_totais: obra.kpi?.horas_contratadas || '',
                
                // CORREÇÃO AQUI: Prioriza o que está salvo no contrato, senão pega da tabela obra
                data_inicio: obra.kpi?.start_date 
                    ? obra.kpi.start_date.split('T')[0] 
                    : (obra.dataInicio ? obra.dataInicio.split('T')[0] : ''),
                    
                data_fim_contratual: obra.kpi?.expected_end_date ? obra.kpi.expected_end_date.split('T')[0] : '',
                fiscal_nome: obra.kpi?.fiscal_nome || '',
                responsavel_nome: obra.kpi?.responsavel_nome || obra.responsavel || ''
            });
        }
    }, [isOpen, obra]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await apiClient.post('/supervisor/contract', {
                obra_id: obra.id,
                ...formData
            });
            onSuccess();
            onClose();
        } catch (error) {
            alert('Erro ao salvar: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in-up">
                <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="text-yellow-500" /> Configuração do Contrato
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Valor Total</label>
                            <div className="relative">
                                <DollarSign size={16} className="absolute left-3 top-3 text-slate-400" />
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.valor_total}
                                    onChange={e => setFormData({...formData, valor_total: e.target.value})}
                                    className="w-full pl-9 p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Horas Totais</label>
                            <div className="relative">
                                <Clock size={16} className="absolute left-3 top-3 text-slate-400" />
                                <input
                                    type="number"
                                    value={formData.horas_totais}
                                    onChange={e => setFormData({...formData, horas_totais: e.target.value})}
                                    className="w-full pl-9 p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                                    placeholder="1000"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Data Início</label>
                            <div className="relative">
                                <Calendar size={16} className="absolute left-3 top-3 text-slate-400" />
                                <input
                                    type="date"
                                    value={formData.data_inicio}
                                    onChange={e => setFormData({...formData, data_inicio: e.target.value})}
                                    className="w-full pl-9 p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Fim Contratual</label>
                            <div className="relative">
                                <AlertCircle size={16} className="absolute left-3 top-3 text-slate-400" />
                                <input
                                    type="date"
                                    value={formData.data_fim_contratual}
                                    onChange={e => setFormData({...formData, data_fim_contratual: e.target.value})}
                                    className="w-full pl-9 p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                        <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Eng. Responsável</label>
                        <div className="relative mb-3">
                            <HardHat size={16} className="absolute left-3 top-3 text-slate-400" />
                            <input
                                type="text"
                                value={formData.responsavel_nome}
                                onChange={e => setFormData({...formData, responsavel_nome: e.target.value})}
                                className="w-full pl-9 p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                                placeholder="Nome do Engenheiro"
                            />
                        </div>

                        <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Fiscal da Obra</label>
                        <div className="relative">
                            <User size={16} className="absolute left-3 top-3 text-slate-400" />
                            <input
                                type="text"
                                value={formData.fiscal_nome}
                                onChange={e => setFormData({...formData, fiscal_nome: e.target.value})}
                                className="w-full pl-9 p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                                placeholder="Quem fiscaliza"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm">Cancelar</button>
                        <button type="submit" disabled={loading} className="px-6 py-2 bg-yellow-400 text-slate-900 font-bold rounded-lg hover:bg-yellow-500 flex items-center gap-2 text-sm shadow-sm">
                            <Save size={18} /> Salvar Contrato
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ContractConfigModal;