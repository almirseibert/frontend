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
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen && obra) {
            // 1. Lógica para Horas Contratadas (Soma do JSON se não tiver no contrato)
            let horasIniciais = '';
            
            // Se já tem no contrato (KPI), usa.
            if (obra.kpi?.horas_contratadas > 0) {
                horasIniciais = obra.kpi.horas_contratadas;
            } 
            // Se não, tenta somar do JSON legado da tabela obras
            else if (obra.legacy_data?.horas_json) {
                try {
                    const jsonHoras = typeof obra.legacy_data.horas_json === 'string' 
                        ? JSON.parse(obra.legacy_data.horas_json) 
                        : obra.legacy_data.horas_json;
                    
                    if (jsonHoras && typeof jsonHoras === 'object') {
                        // Soma todos os valores do objeto (ex: {"Rolo": 300, "Caminhao": 200} => 500)
                        const totalCalculado = Object.values(jsonHoras).reduce((acc, curr) => acc + Number(curr), 0);
                        if (totalCalculado > 0) horasIniciais = totalCalculado;
                    }
                } catch (e) {
                    console.warn("Erro ao processar JSON de horas:", e);
                }
            }

            // CORREÇÃO DATA: Usa legado se contrato não tiver
            const dataInicioBase = obra.data_inicio || obra.legacy_data?.data_inicio || '';

            // 2. Preenchimento do Form
            setFormData({
                // Valor: Contrato (KPI) ou Legado
                valor_total: obra.kpi?.valor_total_contrato || obra.legacy_data?.valor_total || '',
                
                horas_totais: horasIniciais,
                
                // Data Início: Contrato ou Legado
                data_inicio: dataInicioBase.split('T')[0],
                
                data_fim_contratual: (obra.data_fim_contratual || '').split('T')[0],
                
                // Nomes: Tenta pegar do contrato, senão do legado
                fiscal_nome: obra.fiscal_nome !== 'A Definir' ? obra.fiscal_nome : (obra.legacy_data?.fiscal || ''),
                responsavel_nome: obra.responsavel !== 'A Definir' ? obra.responsavel : (obra.legacy_data?.responsavel || '')
            });
            setError('');
        }
    }, [isOpen, obra]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        
        try {
            if (!formData.valor_total || !formData.horas_totais) {
                throw new Error("Valor total e Horas totais são obrigatórios para o cálculo de previsão.");
            }

            await apiClient.post('/supervisor/contract', {
                obra_id: obra.id,
                valor_total: parseFloat(formData.valor_total),
                horas_totais: parseFloat(formData.horas_totais),
                data_inicio: formData.data_inicio,
                data_fim_contratual: formData.data_fim_contratual,
                fiscal_nome: formData.fiscal_nome,
                responsavel_nome: formData.responsavel_nome
            });
            
            onSuccess();
            onClose();
        } catch (err) {
            setError(err.message || 'Erro ao salvar contrato.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up border border-slate-200">
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <FileText size={20} className="text-yellow-400" />
                        Configurar Contrato: <span className="text-slate-300 font-normal">{obra?.nome}</span>
                    </h2>
                    <button onClick={onClose} className="hover:bg-slate-700 p-1 rounded transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-center gap-2 border border-red-200">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Valor Total (R$)</label>
                            <div className="relative">
                                <DollarSign size={16} className="absolute left-3 top-3 text-slate-400" />
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={formData.valor_total}
                                    onChange={e => setFormData({...formData, valor_total: e.target.value})}
                                    className="w-full pl-9 p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Horas Contratadas</label>
                            <div className="relative">
                                <Clock size={16} className="absolute left-3 top-3 text-slate-400" />
                                <input
                                    type="number"
                                    step="0.1"
                                    required
                                    value={formData.horas_totais}
                                    onChange={e => setFormData({...formData, horas_totais: e.target.value})}
                                    className="w-full pl-9 p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Data Início</label>
                            <input
                                type="date"
                                required
                                value={formData.data_inicio}
                                onChange={e => setFormData({...formData, data_inicio: e.target.value})}
                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Data Fim (Contratual)</label>
                            <input
                                type="date"
                                required
                                value={formData.data_fim_contratual}
                                onChange={e => setFormData({...formData, data_fim_contratual: e.target.value})}
                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Responsável Obra</label>
                            <div className="relative">
                                <HardHat size={16} className="absolute left-3 top-3 text-slate-400" />
                                <input
                                    type="text"
                                    value={formData.responsavel_nome}
                                    onChange={e => setFormData({...formData, responsavel_nome: e.target.value})}
                                    className="w-full pl-9 p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                                    placeholder="Eng. ou Mestre"
                                />
                            </div>
                        </div>
                        <div>
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