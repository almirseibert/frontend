import React, { useState } from 'react';
import { PlusCircle, Droplet, Users, X, Trash2 } from 'lucide-react';
import ProtectedComponent from '../ProtectedComponent';

const getVehicleName = (id, vehicles) => {
    const v = vehicles.find(v => String(v.id) === String(id));
    return v ? `${v.registroInterno} - ${v.placa}` : 'Não Identificado';
}

const getObraName = (id, obras) => {
    const o = obras.find(o => String(o.id) === String(id));
    return o ? o.nome : 'Pátio / Não Alocado';
}

const WashingsTab = ({ vehicles = [], obras = [], setAlertMessage, apiClient }) => {
    // Mocks locais (Até a criação das rotas backend)
    const [lavagens, setLavagens] = useState([]);
    const [washingPartners, setWashingPartners] = useState([
        { id: '1', nome: 'Lava Rápido Expresso', telefone: '(11) 99999-9999' } // Mock inicial
    ]);

    const [modalNovaLavagem, setModalNovaLavagem] = useState(false);
    const [modalParceiros, setModalParceiros] = useState(false);

    const onSaveLavagem = (data) => {
        setLavagens([{ id: Date.now(), ...data }, ...lavagens]);
        setAlertMessage(`Lavagem registrada! Custo gerado na Obra: ${getObraName(data.obraId, obras)}`);
        setModalNovaLavagem(false);
    };

    return (
        <div className="animate-fadeIn">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <Droplet size={18} className="text-blue-600"/> Histórico de Lavagens
                        </h3>
                        <p className="text-xs text-gray-500">Controle de higienização, com custos alocados por obra.</p>
                    </div>
                    <ProtectedComponent requiredPermission="editor">
                        <div className="flex gap-2">
                            <button onClick={() => setModalParceiros(true)} className="bg-gray-100 text-gray-700 px-3 py-2 rounded text-xs font-bold flex items-center gap-1 hover:bg-gray-200 border border-gray-300">
                                <Users size={14} /> Parceiros (Lava-Jatos)
                            </button>
                            <button onClick={() => setModalNovaLavagem(true)} className="bg-blue-600 text-white px-3 py-2 rounded text-xs font-bold flex items-center gap-1 hover:bg-blue-700 shadow-sm">
                                <PlusCircle size={14} /> Nova Lavagem
                            </button>
                        </div>
                    </ProtectedComponent>
                </div>

                <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-600 font-bold text-xs uppercase">
                            <tr>
                                <th className="p-3">Veículo</th>
                                <th className="p-3">Data</th>
                                <th className="p-3">Centro Custo (Obra)</th>
                                <th className="p-3">Valor</th>
                                <th className="p-3">Local (Parceiro)</th>
                                <th className="p-3">Descrição / Serviço</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {lavagens.map(item => {
                                const pName = washingPartners.find(p => String(p.id) === String(item.parceiroId))?.nome || 'Não Informado';
                                return (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="p-3 font-bold text-gray-800">{getVehicleName(item.vehicleId, vehicles)}</td>
                                        <td className="p-3">{new Date(item.dataLavagem).toLocaleDateString('pt-BR')}</td>
                                        <td className="p-3 text-xs text-gray-600 font-medium">{getObraName(item.obraId, obras)}</td>
                                        <td className="p-3 text-red-600 font-bold">R$ {parseFloat(item.valor || 0).toFixed(2)}</td>
                                        <td className="p-3 text-gray-700">{pName}</td>
                                        <td className="p-3 text-gray-800 font-medium">{item.descricao}</td>
                                    </tr>
                                )
                            })}
                            {lavagens.length === 0 && (
                                <tr><td colSpan="6" className="p-6 text-center text-gray-400 italic">Nenhuma lavagem registrada.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modais */}
            {modalNovaLavagem && (
                <NovaLavagemModal 
                    vehicles={vehicles} 
                    obras={obras}
                    washingPartners={washingPartners}
                    onClose={() => setModalNovaLavagem(false)}
                    onSave={onSaveLavagem}
                />
            )}

            {modalParceiros && (
                <WashingPartnersModal 
                    partners={washingPartners}
                    setPartners={setWashingPartners}
                    onClose={() => setModalParceiros(false)}
                />
            )}
        </div>
    );
};

// --- Modal: Nova Lavagem ---
const NovaLavagemModal = ({ vehicles, obras, washingPartners, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        vehicleId: '', obraId: '', dataLavagem: new Date().toISOString().split('T')[0], valor: '', parceiroId: '', descricao: ''
    });

    React.useEffect(() => {
        if (formData.vehicleId && !formData.obraId) {
            const v = vehicles.find(v => String(v.id) === String(formData.vehicleId));
            if (v && v.obraAtualId) setFormData(prev => ({...prev, obraId: v.obraAtualId}));
        }
    }, [formData.vehicleId, vehicles]);

    const handleChange = (e) => setFormData({...formData, [e.target.name]: e.target.value});
    const save = () => {
        if(!formData.vehicleId || !formData.obraId) return alert("Selecione o veículo e a obra (Centro de Custo).");
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden animate-fadeInUp">
                <div className="px-4 py-3 border-b bg-blue-50 flex justify-between items-center">
                    <h2 className="text-sm font-bold text-blue-800">Registrar Lavagem</h2>
                    <button onClick={onClose} className="text-gray-500"><X size={16}/></button>
                </div>
                <div className="p-4 space-y-3">
                    <div>
                        <label className="block text-xs font-semibold mb-1">Veículo *</label>
                        <select name="vehicleId" value={formData.vehicleId} onChange={handleChange} className="w-full p-2 border rounded text-sm outline-none" required>
                            <option value="">Selecione...</option>
                            {vehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.placa}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold mb-1">Centro de Custo (Obra) *</label>
                        <select name="obraId" value={formData.obraId} onChange={handleChange} className="w-full p-2 border border-blue-300 bg-blue-50 text-blue-900 rounded text-sm outline-none" required>
                            <option value="">Selecione a Obra...</option>
                            <option value="Patio">Pátio / Não Alocado</option>
                            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold mb-1">Data *</label>
                            <input type="date" name="dataLavagem" value={formData.dataLavagem} onChange={handleChange} className="w-full p-2 border rounded text-sm outline-none" required/>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold mb-1">Valor (R$)</label>
                            <input type="number" step="0.01" name="valor" value={formData.valor} onChange={handleChange} className="w-full p-2 border rounded text-sm outline-none" placeholder="0.00"/>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold mb-1">Lava-Jato (Parceiro)</label>
                        <select name="parceiroId" value={formData.parceiroId} onChange={handleChange} className="w-full p-2 border rounded text-sm outline-none">
                            <option value="">Selecione (Opcional)...</option>
                            {washingPartners.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold mb-1">Tipo de Serviço</label>
                        <input type="text" name="descricao" value={formData.descricao} onChange={handleChange} className="w-full p-2 border rounded text-sm outline-none" placeholder="Ex: Lavagem Simples, Geral..."/>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded">Cancelar</button>
                        <button onClick={save} className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded shadow">Salvar Lavagem</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Modal: Cadastro de Parceiros ---
const WashingPartnersModal = ({ partners, setPartners, onClose }) => {
    const [novoNome, setNovoNome] = useState('');
    const [novoTel, setNovoTel] = useState('');

    const handleAdd = () => {
        if (!novoNome) return;
        setPartners([...partners, { id: Date.now().toString(), nome: novoNome, telefone: novoTel }]);
        setNovoNome('');
        setNovoTel('');
    };

    const handleRemove = (id) => {
        setPartners(partners.filter(p => p.id !== id));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden animate-fadeInUp">
                <div className="px-4 py-3 border-b bg-gray-100 flex justify-between items-center">
                    <h2 className="text-sm font-bold text-gray-800">Parceiros de Lavagem</h2>
                    <button onClick={onClose} className="text-gray-500"><X size={16}/></button>
                </div>
                
                <div className="p-4 bg-gray-50 border-b">
                    <h4 className="text-xs font-bold mb-2">Adicionar Novo</h4>
                    <div className="flex gap-2">
                        <input type="text" value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome do Lava-Jato..." className="flex-1 p-2 border rounded text-xs outline-none"/>
                        <input type="text" value={novoTel} onChange={e => setNovoTel(e.target.value)} placeholder="Telefone..." className="w-24 p-2 border rounded text-xs outline-none"/>
                        <button onClick={handleAdd} className="bg-gray-800 text-white px-3 rounded font-bold text-xs">Add</button>
                    </div>
                </div>

                <div className="p-4 max-h-60 overflow-y-auto">
                    {partners.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center">Nenhum parceiro cadastrado.</p>
                    ) : (
                        <ul className="space-y-2">
                            {partners.map(p => (
                                <li key={p.id} className="flex justify-between items-center p-2 border rounded bg-white text-xs">
                                    <div>
                                        <p className="font-bold text-gray-800">{p.nome}</p>
                                        {p.telefone && <p className="text-gray-500">{p.telefone}</p>}
                                    </div>
                                    <button onClick={() => handleRemove(p.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={14}/></button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WashingsTab;