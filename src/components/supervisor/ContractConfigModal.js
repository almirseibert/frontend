import React, { useState, useEffect } from 'react';
import { X, Save, FileText, Calendar, DollarSign, Clock, User, AlertCircle } from 'lucide-react';
import apiClient from '../../services/apiClient';

const ContractConfigModal = ({ isOpen, onClose, obra, onSuccess }) => {
    const [formData, setFormData] = useState({
        valor_total: '',
        horas_totais: '',
        data_inicio: '',
        data_fim_contratual: '',
        fiscal_nome: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen && obra) {
            // Lógica de Prioridade: Dados do Contrato > Dados da Obra > Vazio
            // Isso atende ao requisito: "caso nao esteja preenchido buscar a informação inicial na coluna da tabela obras"
            const kpi = obra.kpi || {};
            
            // Tenta pegar do contrato (se existir no objeto obra ou kpi) ou faz fallback para obra
            const valorInicial = kpi.valor_total_contrato || obra.valorTotalContrato || '';
            const horasIniciais = kpi.horas_contratadas || obra.horasContratadasTotal || ''; // Assumindo que o back mande a soma se não tiver contrato
            
            // Datas
            const dataInicioRaw = obra.data_inicio_contratual || obra.dataInicio;
            const dataFimRaw = obra.data_fim_contratual || obra.dataFimPrevisto;

            setFormData({
                valor_total: valorInicial,
                horas_totais: horasIniciais,
                data_inicio: dataInicioRaw ? dataInicioRaw.split('T')[0] : '',
                data_fim_contratual: dataFimRaw ? dataFimRaw.split('T')[0] : '',
                fiscal_nome: obra.fiscal_nome || obra.fiscal || ''
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
                fiscal_nome: formData.fiscal_nome
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

                    <p className="text-xs text-slate-500 bg-blue-50 p-2 rounded border border-blue-100">
                        <b>Nota:</b> O sistema importou dados do cadastro da obra. Confirme ou ajuste para oficializar o contrato.
                    </p>

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

                    <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Nome do Fiscal</label>
                        <div className="relative">
                            <User size={16} className="absolute left-3 top-3 text-slate-400" />
                            <input
                                type="text"
                                value={formData.fiscal_nome}
                                onChange={e => setFormData({...formData, fiscal_nome: e.target.value})}
                                className="w-full pl-9 p-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                                placeholder="Fiscal ou Eng. Responsável"
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