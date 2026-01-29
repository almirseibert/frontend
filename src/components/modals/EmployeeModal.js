import React, { useState, useEffect } from 'react';
import { X, Loader, FileText, Save } from 'lucide-react';

const EmployeeModal = ({ 
    user, 
    employee, 
    onClose, 
    setAlertMessage, 
    apiClient, 
    reloadData 
}) => {
    const [activeTab, setActiveTab] = useState('dados');
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Estado inicial
    const [formData, setFormData] = useState({
        nome: '',
        vulgo: '',            // Novo
        registroInterno: '',  // Novo
        dataAdmissao: '',
        cpf: '',
        rg: '',
        dataNascimento: '',
        funcao: '',
        endereco: '',
        cidade: '',           // Novo
        contato: '',          // Renomeado/Padronizado de telefone
        email: '',
        status: 'ativo',
        cnh: { numero: '', categoria: '', validade: '', anexo: null },
        aso: { dataEmissao: '', validade: '', anexo: null },
        epi: { dataEntrega: '', anexo: null },
        certificados: [] 
    });

    useEffect(() => {
        if (employee) {
            setFormData({
                nome: employee.nome || '',
                vulgo: employee.vulgo || '',
                registroInterno: employee.registroInterno || '',
                dataAdmissao: formatDateForInput(employee.dataAdmissao || employee.dataContratacao),
                cpf: employee.cpf || '',
                rg: employee.rg || '', // RG não estava no INSERT SQL exemplo, mas mantive se existir no banco legado
                dataNascimento: formatDateForInput(employee.dataNascimento),
                funcao: employee.funcao || '',
                endereco: employee.endereco || '',
                cidade: employee.cidade || '',
                contato: employee.contato || employee.telefone || '',
                email: employee.email || '', // Email não estava no SQL, mas é útil
                status: employee.status || 'ativo',
                cnh: typeof employee.cnh === 'object' ? employee.cnh : { // Adapter caso venha flat do banco
                    numero: employee.cnhNumero || '',
                    categoria: employee.cnhCategoria || '',
                    validade: formatDateForInput(employee.cnhVencimento),
                    anexo: null
                },
                aso: parseJson(employee.aso, { dataEmissao: '', validade: '', anexo: null }),
                epi: parseJson(employee.epi, { dataEntrega: '', anexo: null }),
                certificados: parseJson(employee.certificados, [])
            });
        }
    }, [employee]);

    const formatDateForInput = (dateString) => {
        if (!dateString) return '';
        try { return new Date(dateString).toISOString().split('T')[0]; } catch { return ''; }
    };

    const parseJson = (val, defaultVal) => {
        if (!val) return defaultVal;
        if (typeof val === 'object') return val;
        try { return JSON.parse(val); } catch { return defaultVal; }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleNestedChange = (section, field, value) => {
        setFormData(prev => ({
            ...prev,
            [section]: { ...prev[section], [field]: value }
        }));
    };

    const handleFileUpload = async (e, section) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        const data = new FormData();
        data.append('file', file);
        try {
            const res = await apiClient.uploadFile(data);
            const fileUrl = res.data?.url || res.url;
            setFormData(prev => ({
                ...prev,
                [section]: { ...prev[section], anexo: fileUrl }
            }));
        } catch (error) {
            console.error("Erro upload", error);
            setAlertMessage("Erro ao enviar arquivo.");
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Adapter para enviar campos planos de CNH se o backend esperar assim
            const payload = { ...formData };
            // Se o backend espera campos planos para CNH (baseado no SQL create table):
            payload.cnhNumero = formData.cnh.numero;
            payload.cnhCategoria = formData.cnh.categoria;
            payload.cnhVencimento = formData.cnh.validade;

            if (employee) {
                await apiClient.updateEmployee(employee.id, payload);
                setAlertMessage("Funcionário atualizado com sucesso!");
            } else {
                await apiClient.createEmployee(payload);
                setAlertMessage("Funcionário cadastrado com sucesso!");
            }
            reloadData();
            onClose();
        } catch (error) {
            setAlertMessage(`Erro: ${error.response?.data?.error || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h2 className="text-xl font-bold text-gray-800">
                        {employee ? 'Editar Funcionário' : 'Novo Funcionário'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition"><X size={20}/></button>
                </div>

                <div className="flex border-b px-6 pt-2">
                    {['dados', 'documentos', 'epi'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-3 text-sm font-bold capitalize border-b-2 transition ${
                                activeTab === tab ? 'border-yellow-400 text-gray-800' : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab === 'epi' ? 'EPIs' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'dados' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Nome Completo *</label>
                                <input required name="nome" value={formData.nome} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Vulgo (Apelido)</label>
                                <input name="vulgo" value={formData.vulgo} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">CPF *</label>
                                <input required name="cpf" value={formData.cpf} onChange={handleChange} className="w-full p-2 border rounded" placeholder="000.000.000-00"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Registro Interno</label>
                                <input name="registroInterno" value={formData.registroInterno} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Data Admissão</label>
                                <input type="date" name="dataAdmissao" value={formData.dataAdmissao} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Função / Cargo</label>
                                <input name="funcao" value={formData.funcao} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Telefone / Contato</label>
                                <input name="contato" value={formData.contato} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Endereço</label>
                                <input name="endereco" value={formData.endereco} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Cidade</label>
                                <input name="cidade" value={formData.cidade} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>
                        </div>
                    )}

                    {activeTab === 'documentos' && (
                        <div className="space-y-6">
                            {/* CNH */}
                            <div className="bg-gray-50 p-4 rounded-lg border">
                                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><FileText size={16}/> CNH</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label className="text-xs text-gray-500">Número Registro</label>
                                        <input value={formData.cnh?.numero || ''} onChange={e => handleNestedChange('cnh', 'numero', e.target.value)} className="w-full p-2 border rounded bg-white"/>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Categoria</label>
                                        <input value={formData.cnh?.categoria || ''} onChange={e => handleNestedChange('cnh', 'categoria', e.target.value)} className="w-full p-2 border rounded bg-white" placeholder="Ex: AD"/>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Vencimento</label>
                                        <input type="date" value={formData.cnh?.validade || ''} onChange={e => handleNestedChange('cnh', 'validade', e.target.value)} className="w-full p-2 border rounded bg-white"/>
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="text-xs text-gray-500">Anexo CNH (Opcional)</label>
                                        <div className="flex gap-2 items-center">
                                            <input type="file" onChange={e => handleFileUpload(e, 'cnh')} className="text-sm text-gray-500"/>
                                            {uploading && <Loader className="animate-spin text-blue-500" size={16}/>}
                                            {formData.cnh?.anexo && <span className="text-xs text-green-600 font-bold">Arquivo anexado</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'epi' && (
                        <div className="bg-gray-50 p-4 rounded-lg border">
                            <h3 className="font-bold text-gray-700 mb-3">Ficha de EPI</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="text-xs text-gray-500">Data da Última Entrega</label>
                                    <input type="date" value={formData.epi?.dataEntrega || ''} onChange={e => handleNestedChange('epi', 'dataEntrega', e.target.value)} className="w-full p-2 border rounded bg-white"/>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500">Ficha de Entrega Digitalizada</label>
                                    <input type="file" onChange={e => handleFileUpload(e, 'epi')} className="mt-1 text-sm text-gray-500"/>
                                </div>
                            </div>
                        </div>
                    )}
                </form>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300 font-bold text-sm">Cancelar</button>
                    <button 
                        onClick={handleSubmit} 
                        disabled={loading || uploading} 
                        className="px-6 py-2 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 font-bold text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader className="animate-spin" size={16}/> : <Save size={16}/>}
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EmployeeModal;