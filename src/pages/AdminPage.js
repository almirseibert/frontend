import React, { useState, useEffect } from 'react';
import { Shield, UserCog, Loader, AlertTriangle, Check, Trash2, UserPlus } from 'lucide-react';
import apiClient from '../services/apiClient';
import WhatsAppStatusPanel from '../components/WhatsAppStatusPanel';

const AdminPage = ({ socket }) => {
  // Estados para Solicitações (Usuários Inativos)
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Estados para Atribuição Manual de Função (Usuários Ativos)
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [canAccessRefueling, setCanAccessRefueling] = useState(false);
  
  // Estados Gerais
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Estados de Atualização do Sistema
  const [updateMessage, setUpdateMessage] = useState('');
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [isSavingUpdate, setIsSavingUpdate] = useState(false);

  useEffect(() => {
    fetchRequests();
    fetchUpdateMessage();
  }, []);

  const fetchRequests = async () => {
    setLoadingRequests(true);
    try {
        // Agora busca usuários com status 'inativo' usando a nova rota do adminController
        const data = await apiClient.adminGetRegistrationRequests();
        setRequests(data);
    } catch (err) {
        console.error("Erro ao buscar solicitações:", err);
    } finally {
        setLoadingRequests(false);
    }
  };

  const fetchUpdateMessage = async () => {
    try {
      const data = await apiClient.adminGetUpdateMessage();
      if (data) {
        setUpdateMessage(data.message || '');
        setShowUpdatePopup(data.showPopup || false);
      }
    } catch (err) { console.error(err); }
  };

  // Aprovar Usuário Inativo
  const handleApprove = async (userId, userEmail) => {
    // Pode-se abrir um modal aqui para escolher a role, por simplicidade definimos padrão
    const roleToAssign = 'operador'; 
    const accessRefuel = false; // Padrão false, admin muda depois se quiser

    try {
        await apiClient.adminApproveRegistrationRequest({ 
            userId, 
            role: roleToAssign,
            canAccessRefueling: accessRefuel
        });
        setMessage(`Usuário ${userEmail} aprovado com sucesso!`);
        fetchRequests(); // Recarrega lista
        setTimeout(() => setMessage(''), 3000);
    } catch (err) {
        setError("Erro ao aprovar usuário.");
    }
  };

  // Rejeitar (Deletar) Usuário Inativo
  const handleReject = async (userId) => {
    if(!window.confirm("Tem certeza que deseja rejeitar e remover esta solicitação?")) return;
    try {
        await apiClient.adminDeleteRegistrationRequest(userId);
        fetchRequests();
    } catch (err) {
        setError("Erro ao rejeitar solicitação.");
    }
  };

  // Alterar Permissões de Usuário JÁ EXISTENTE
  const handleSetRole = async (e) => {
    e.preventDefault();
    setMessage(''); setError(''); setIsLoading(true);

    try {
      await apiClient.adminAssignRole({ 
          email, 
          role,
          canAccessRefueling 
      });
      setMessage(`Permissões de ${email} atualizadas.`);
      setEmail('');
    } catch (err) {
      setError(err.message || 'Erro ao atribuir função.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveUpdate = async (e) => {
    e.preventDefault();
    setIsSavingUpdate(true);
    try {
      await apiClient.adminSaveUpdateMessage({ message: updateMessage, showPopup: showUpdatePopup });
      alert("Mensagem de sistema atualizada!");
    } catch (err) { alert("Erro ao salvar mensagem."); }
    finally { setIsSavingUpdate(false); }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <Shield className="text-yellow-500" /> Administração do Sistema
      </h1>

      {/* 1. Lista de Solicitações Pendentes */}
      <div className="bg-white p-6 rounded-lg shadow mb-8 border-l-4 border-blue-500">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <UserPlus className="text-blue-500"/> Solicitações de Cadastro Pendentes
        </h2>
        
        {loadingRequests ? <Loader className="animate-spin text-blue-500"/> : (
            requests.length === 0 ? (
                <p className="text-gray-500 italic">Nenhuma solicitação pendente no momento.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-100 text-gray-600 text-sm uppercase">
                                <th className="p-3 font-bold">Nome</th>
                                <th className="p-3 font-bold">Email</th>
                                <th className="p-3 font-bold">Data Solicitação</th>
                                <th className="p-3 font-bold text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map(req => (
                                <tr key={req.id} className="border-b hover:bg-blue-50 transition-colors">
                                    <td className="p-3 font-medium text-gray-800">{req.name}</td>
                                    <td className="p-3 text-gray-600">{req.email}</td>
                                    <td className="p-3 text-gray-500 text-sm">
                                        {req.created_at ? new Date(req.created_at).toLocaleDateString() : 'N/A'}
                                    </td>
                                    <td className="p-3 flex justify-center gap-3">
                                        <button 
                                            onClick={() => handleApprove(req.id, req.email)} 
                                            className="bg-green-100 text-green-700 hover:bg-green-200 py-1 px-3 rounded text-sm font-bold flex items-center transition-colors"
                                            title="Aprovar Acesso"
                                        >
                                            <Check size={16} className="mr-1"/> Aprovar
                                        </button>
                                        <button 
                                            onClick={() => handleReject(req.id)} 
                                            className="bg-red-100 text-red-700 hover:bg-red-200 py-1 px-3 rounded text-sm font-bold flex items-center transition-colors"
                                            title="Rejeitar Solicitação"
                                        >
                                            <Trash2 size={16} className="mr-1"/> Rejeitar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 2. Gestão de Permissões (Usuários Ativos) */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <UserCog /> Gerenciar Permissões
            </h2>
            <form onSubmit={handleSetRole} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Email do Usuário Ativo</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-yellow-400 outline-none" required placeholder="usuario@frotasmak.com.br"/>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Função</label>
                        <select value={role} onChange={e => setRole(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-yellow-400 outline-none bg-white">
                            <option value="viewer">Visualizador</option>
                            <option value="operador">Operador</option>
                            <option value="editor">Editor</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </div>
                    <div className="flex items-end mb-2">
                         <label className="flex items-center cursor-pointer select-none">
                            <input type="checkbox" checked={canAccessRefueling} onChange={e => setCanAccessRefueling(e.target.checked)} className="form-checkbox h-5 w-5 text-yellow-500 rounded focus:ring-yellow-400"/>
                            <span className="ml-2 text-sm text-gray-700 font-medium">Acessa Abastecimento?</span>
                         </label>
                    </div>
                </div>
                <button type="submit" disabled={isLoading} className="w-full py-2 bg-yellow-400 font-bold rounded hover:bg-yellow-500 disabled:opacity-50 transition-colors text-gray-900">
                    {isLoading ? 'Salvando...' : 'Atualizar Permissões'}
                </button>
            </form>
            {message && <p className="mt-4 text-green-700 bg-green-50 p-3 rounded text-center border border-green-200">{message}</p>}
            {error && <p className="mt-4 text-red-700 bg-red-50 p-3 rounded text-center border border-red-200">{error}</p>}
          </div>

          {/* 3. Mensagem do Sistema */}
          <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <AlertTriangle /> Mensagem Global
              </h2>
              <form onSubmit={handleSaveUpdate}>
                  <textarea rows="4" value={updateMessage} onChange={e => setUpdateMessage(e.target.value)} className="w-full p-3 border rounded-lg mb-4 focus:ring-2 focus:ring-gray-400 outline-none" placeholder="Mensagem para todos os usuários..."></textarea>
                  <label className="flex items-center mb-4 cursor-pointer select-none">
                      <input type="checkbox" checked={showUpdatePopup} onChange={e => setShowUpdatePopup(e.target.checked)} className="mr-2 h-4 w-4 text-gray-800 focus:ring-gray-600"/>
                      <span className="text-gray-700">Exibir como Pop-up na tela inicial</span>
                  </label>
                  <button type="submit" disabled={isSavingUpdate} className="w-full py-2 bg-gray-800 text-white font-bold rounded hover:bg-gray-700 disabled:opacity-50 transition-colors">
                      {isSavingUpdate ? 'Salvando...' : 'Salvar Mensagem'}
                  </button>
              </form>
          </div>
      </div>

      {/* 4. WhatsApp */}
      <div className="mt-8">
          <WhatsAppStatusPanel socket={socket} />
      </div>
    </div>
  );
};

export default AdminPage;