import React, { useState, useEffect } from 'react';
import { X, Upload, Trash2, PlusCircle, Save, Loader, FileText } from 'lucide-react';

const EmployeeModal = ({ 
    user, 
    employee, 
    onClose, 
    setAlertMessage, 
    apiClient, 
    reloadData 
}) => {
    const [activeTab, setActiveTab] = useState('dados'); // dados, documentos, epi, certificados
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Estado inicial do formulário
    const [formData, setFormData] = useState({
        nome: '',
        cpf: '',
        rg: '',
        dataNascimento: '',
        funcao: '',
        telefone: '',
        email: '',
        endereco: '',
        dataAdmissao: '',
        status: 'ativo',
        cnh: { numero: '', categoria: '', validade: '', anexo: null },
        aso: { dataEmissao: '', validade: '', anexo: null },
        epi: { dataEntrega: '', anexo: null },
        certificados: [] // Array de { nome: '', data: '', anexo: null }
    });

    // Popula dados se for edição
    useEffect(() => {
        if (employee) {
            setFormData({
                nome: employee.nome || '',
                cpf: employee.cpf || '',
                rg: employee.rg || '',
                dataNascimento: formatDateForInput(employee.dataNascimento),
                funcao: employee.funcao || '',
                telefone: employee.telefone || '',
                email: employee.email || '',
                endereco: employee.endereco || '',
                dataAdmissao: formatDateForInput(employee.dataAdmissao),
                status: employee.status || 'ativo',
                cnh: parseJson(employee.cnh, { numero: '', categoria: '', validade: '', anexo: null }),
                aso: parseJson(employee.aso, { dataEmissao: '', validade: '', anexo: null }),
                epi: parseJson(employee.epi, { dataEntrega: '', anexo: null }),
                certificados: parseJson(employee.certificados, [])
            });
        }
    }, [employee]);

    // Helpers
    const formatDateForInput = (dateString) => {
        if (!dateString) return '';
        try {
            return new Date(dateString).toISOString().split('T')[0];
        } catch { return ''; }
    };

    const parseJson = (val, defaultVal) => {
        if (!val) return defaultVal;
        if (typeof val === 'object') return val;
        try { return JSON.parse(val); } catch { return defaultVal; }
    };

    // Handlers
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

    // Upload Genérico
    const handleFileUpload = async (e, section, index = null) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        const data = new FormData();
        data.append('file', file);

        try {
            const res = await apiClient.uploadFile(data);
            const fileUrl = res.data?.url || res.url; // Ajuste conforme retorno da API

            if (section === 'certificados' && index !== null) {
                const newCerts = [...formData.certificados];
                newCerts[index].anexo = fileUrl;
                setFormData(prev => ({ ...prev, certificados: newCerts }));
            } else {
                setFormData(prev => ({
                    ...prev,
                    [section]: { ...prev[section], anexo: fileUrl }
                }));
            }
        } catch (error) {
            console.error("Erro upload", error);
            setAlertMessage("Erro ao enviar arquivo.");
        } finally {
            setUploading(false);
        }
    };

    // Certificados
    const addCertificate = () => {
        setFormData(prev => ({
            ...prev,
            certificados: [...prev.certificados, { nome: '', data: '', anexo: null }]
        }));
    };

    const removeCertificate = (index) => {
        const newCerts = formData.certificados.filter((_, i) => i !== index);
        setFormData(prev => ({ ...prev, certificados: newCerts }));
    };

    const handleCertificateChange = (index, field, value) => {
        const newCerts = [...formData.certificados];
        newCerts[index][field] = value;
        setFormData(prev => ({ ...prev, certificados: newCerts }));
    };

    // Submit
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (employee) {
                await apiClient.updateEmployee(employee.id, formData);
                setAlertMessage("Funcionário atualizado com sucesso!");
            } else {
                await apiClient.createEmployee(formData);
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
                {/* Header */}
                <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h2 className="text-xl font-bold text-gray-800">
                        {employee ? 'Editar Funcionário' : 'Novo Funcionário'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition"><X size={20}/></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b px-6 pt-2">
                    {['dados', 'documentos', 'epi', 'certificados'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-3 text-sm font-bold capitalize border-b-2 transition ${
                                activeTab === tab 
                                ? 'border-yellow-400 text-gray-800' 
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab === 'epi' ? 'EPIs' : tab}
                        </button>
                    ))}
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
                    
                    {/* --- ABA DADOS GERAIS --- */}
                    {activeTab === 'dados' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Nome Completo *</label>
                                <input required name="nome" value={formData.nome} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">CPF *</label>
                                <input required name="cpf" value={formData.cpf} onChange={handleChange} className="w-full p-2 border rounded" placeholder="000.000.000-00"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">RG</label>
                                <input name="rg" value={formData.rg} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Data Nascimento</label>
                                <input type="date" name="dataNascimento" value={formData.dataNascimento} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Função / Cargo</label>
                                <input name="funcao" value={formData.funcao} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Telefone</label>
                                <input name="telefone" value={formData.telefone} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Email</label>
                                <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Endereço</label>
                                <input name="endereco" value={formData.endereco} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Data Admissão</label>
                                <input type="date" name="dataAdmissao" value={formData.dataAdmissao} onChange={handleChange} className="w-full p-2 border rounded" />
                            </div>
                        </div>
                    )}

                    {/* --- ABA DOCUMENTOS (CNH / ASO) --- */}
                    {activeTab === 'documentos' && (
                        <div className="space-y-6">
                            {/* CNH */}
                            <div className="bg-gray-50 p-4 rounded-lg border">
                                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><FileText size={16}/> Carteira Nacional de Habilitação (CNH)</h3>
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
                                        <label className="text-xs text-gray-500">Validade</label>
                                        <input type="date" value={formData.cnh?.validade || ''} onChange={e => handleNestedChange('cnh', 'validade', e.target.value)} className="w-full p-2 border rounded bg-white"/>
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="text-xs text-gray-500">Anexo CNH</label>
                                        <div className="flex gap-2 items-center">
                                            <input type="file" onChange={e => handleFileUpload(e, 'cnh')} className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                                            {uploading && <Loader className="animate-spin text-blue-500" size={16}/>}
                                            {formData.cnh?.anexo && <a href={formData.cnh.anexo} target="_blank" rel="noreferrer" className="text-xs text-green-600 underline">Ver Anexo</a>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ASO */}
                            <div className="bg-gray-50 p-4 rounded-lg border">
                                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><FileText size={16}/> Atestado de Saúde Ocupacional (ASO)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-gray-500">Data Emissão</label>
                                        <input type="date" value={formData.aso?.dataEmissao || ''} onChange={e => handleNestedChange('aso', 'dataEmissao', e.target.value)} className="w-full p-2 border rounded bg-white"/>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Validade</label>
                                        <input type="date" value={formData.aso?.validade || ''} onChange={e => handleNestedChange('aso', 'validade', e.target.value)} className="w-full p-2 border rounded bg-white"/>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs text-gray-500">Anexo ASO</label>
                                        <div className="flex gap-2 items-center">
                                            <input type="file" onChange={e => handleFileUpload(e, 'aso')} className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                                            {uploading && <Loader className="animate-spin text-blue-500" size={16}/>}
                                            {formData.aso?.anexo && <a href={formData.aso.anexo} target="_blank" rel="noreferrer" className="text-xs text-green-600 underline">Ver Anexo</a>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- ABA EPI --- */}
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
                                    <div className="flex gap-2 items-center mt-1">
                                        <input type="file" onChange={e => handleFileUpload(e, 'epi')} className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                                        {uploading && <Loader className="animate-spin text-blue-500" size={16}/>}
                                        {formData.epi?.anexo && <a href={formData.epi.anexo} target="_blank" rel="noreferrer" className="text-xs text-green-600 underline">Ver Ficha Atual</a>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- ABA CERTIFICADOS --- */}
                    {activeTab === 'certificados' && (
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-gray-700">Cursos e Certificações</h3>
                                <button type="button" onClick={addCertificate} className="text-xs flex items-center gap-1 bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full hover:bg-blue-200">
                                    <PlusCircle size={14}/> Adicionar Curso
                                </button>
                            </div>
                            
                            {formData.certificados.length === 0 && <p className="text-gray-400 italic text-center py-4">Nenhum certificado cadastrado.</p>}

                            <div className="space-y-3">
                                {formData.certificados.map((cert, index) => (
                                    <div key={index} className="bg-gray-50 border p-3 rounded-lg flex flex-col md:flex-row gap-3 items-start md:items-end">
                                        <div className="flex-1 w-full">
                                            <label className="text-[10px] uppercase font-bold text-gray-500">Nome do Curso</label>
                                            <input value={cert.nome} onChange={e => handleCertificateChange(index, 'nome', e.target.value)} className="w-full p-1.5 border rounded bg-white text-sm" placeholder="Ex: NR-35"/>
                                        </div>
                                        <div className="w-full md:w-32">
                                            <label className="text-[10px] uppercase font-bold text-gray-500">Data</label>
                                            <input type="date" value={cert.data} onChange={e => handleCertificateChange(index, 'data', e.target.value)} className="w-full p-1.5 border rounded bg-white text-sm"/>
                                        </div>
                                        <div className="w-full md:w-auto">
                                            <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Anexo</label>
                                            <div className="flex gap-2 items-center">
                                                {cert.anexo ? (
                                                    <a href={cert.anexo} target="_blank" rel="noreferrer" className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Ver</a>
                                                ) : (
                                                    <label className="cursor-pointer bg-gray-200 hover:bg-gray-300 p-1.5 rounded"><Upload size={14}/><input type="file" className="hidden" onChange={e => handleFileUpload(e, 'certificados', index)}/></label>
                                                )}
                                                <button type="button" onClick={() => removeCertificate(index)} className="p-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200"><Trash2 size={14}/></button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                </form>

                {/* Footer */}
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300 font-bold text-sm">Cancelar</button>
                    <button 
                        onClick={handleSubmit} 
                        disabled={loading || uploading} 
                        className="px-6 py-2 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 font-bold text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader className="animate-spin" size={16}/> : <Save size={16}/>}
                        {employee ? 'Salvar Alterações' : 'Cadastrar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EmployeeModal;