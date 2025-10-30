// AdminPage.js (Atualizado para API Backend)

import React, { useState, useEffect } from 'react';
import { Shield, UserCog, Loader, AlertTriangle } from 'lucide-react';
// Importa o cliente da API em vez das funções do Firebase
import apiClient from '../services/apiClient'; 

// Componente recebe apiClient via props do App.js
const AdminPage = ({ apiClient, setAlertMessage, reloadData /* Adicionado reloadData e setAlertMessage caso sejam necessários */ }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor'); // Mantido 'editor' como default
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Estados para a funcionalidade de atualizações
  const [updateMessage, setUpdateMessage] = useState('');
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [isSavingUpdate, setIsSavingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState({ success: false, message: '' });

  // Carrega a última mensagem de atualização da API ao iniciar
  useEffect(() => {
    const fetchUpdateMessage = async () => {
      try {
        // Substituído getDoc por chamada da API
        const data = await apiClient.getUpdates(); 
        if (data) {
          setUpdateMessage(data.message || '');
          setShowUpdatePopup(data.showPopup || false);
        }
      } catch (err) {
        console.error('Erro ao carregar a mensagem de atualização via API:', err);
        // Pode definir uma mensagem de erro no estado se desejar
      }
    };
    fetchUpdateMessage();
  }, [apiClient]); // Depende do apiClient

  // Função para salvar a mensagem de atualização via API
  const handleSaveUpdate = async (e) => {
    e.preventDefault();
    setIsSavingUpdate(true);
    setUpdateStatus({ success: false, message: '' });

    try {
      // Substituído setDoc por chamada da API
      const response = await apiClient.saveUpdateMessage({
        message: updateMessage,
        showPopup: showUpdatePopup,
      });
      setUpdateStatus({ success: true, message: response.message || 'Atualização salva com sucesso!' });
      // Limpa a mensagem de status após alguns segundos
      setTimeout(() => setUpdateStatus({ success: false, message: '' }), 3000);
    } catch (err) {
      console.error('Erro ao salvar a atualização via API:', err);
      setUpdateStatus({ success: false, message: err.message || 'Falha ao salvar a atualização.' });
    } finally {
      setIsSavingUpdate(false);
    }
  };

  // Função chamada quando o formulário de role é submetido
  const handleSetRole = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setIsLoading(true);

    if (!email) {
      setError('Por favor, insira um e-mail.');
      setIsLoading(false);
      return;
    }

    try {
      // Substituído httpsCallable por chamada da API
      const result = await apiClient.adminAssignRole({ email: email, role: role });
      setMessage(result.message || `Função ${role} atribuída com sucesso a ${email}.`);
      setEmail(''); // Limpa o campo após sucesso
      // Limpa a mensagem de sucesso após alguns segundos
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Ocorreu um erro ao atribuir a função.');
      console.error("Erro ao atribuir função via API:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg p-6 md:p-8 border border-gray-200">
        <div className="flex items-center gap-4 mb-6">
          <Shield className="w-10 h-10 text-yellow-500" />
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Painel de Administração</h1>
            <p className="text-gray-500">Atribuir funções e gerir atualizações do sistema.</p>
          </div>
        </div>

        {/* Formulário de Atualizações */}
        <div className="mb-8 p-6 bg-gray-50 rounded-xl border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><AlertTriangle /> Mensagem de Atualização</h2>
            <form onSubmit={handleSaveUpdate}>
                <div className="mb-4">
                    <label htmlFor="update-message" className="block text-sm font-medium text-gray-700 mb-1">
                        Mensagem para os Utilizadores
                    </label>
                    <textarea
                        id="update-message"
                        rows="4"
                        value={updateMessage}
                        onChange={(e) => setUpdateMessage(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400"
                        placeholder="Escreva aqui a mensagem de atualização..."
                    />
                </div>
                <div className="flex items-center mb-4">
                    <input
                        id="show-popup"
                        type="checkbox"
                        checked={showUpdatePopup}
                        onChange={(e) => setShowUpdatePopup(e.target.checked)}
                        className="h-4 w-4 text-yellow-600 focus:ring-yellow-500 border-gray-300 rounded"
                    />
                    <label htmlFor="show-popup" className="ml-2 block text-sm text-gray-900">
                        Exibir pop-up na página principal
                    </label>
                </div>
                <button
                    type="submit"
                    disabled={isSavingUpdate}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-yellow-400 text-gray-900 font-bold rounded-lg hover:bg-yellow-500 transition-all duration-300 disabled:bg-gray-300"
                >
                    {isSavingUpdate ? (
                        <><Loader className="animate-spin" size={18} />A Guardar...</>
                    ) : (
                        <>Guardar Atualização</>
                    )}
                </button>
                {updateStatus.message && (
                    <p className={`mt-4 text-center p-3 rounded-lg text-sm ${updateStatus.success ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                        {updateStatus.message}
                    </p>
                )}
            </form>
        </div>

        {/* Formulário de Atribuição de Função */}
        <form onSubmit={handleSetRole} className="space-y-6">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <UserCog /> Atribuição de Funções
          </h2>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              E-mail do Utilizador
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400"
              placeholder="exemplo@email.com"
              required
            />
          </div>
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
              Atribuir Função
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              {/* Ajuste as roles conforme definido no seu backend/AuthContext */}
              <option value="editor">Editor</option>
              <option value="admin">Administrador</option>
              <option value="operador">Operador</option>
              <option value="viewer">Visualizador</option>
            </select>
          </div>
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-yellow-400 text-gray-900 font-bold rounded-lg hover:bg-yellow-500 transition-all duration-300 disabled:bg-gray-300"
            >
              {isLoading ? (
                <>
                  <Loader className="animate-spin" size={20} />
                  A Atribuir...
                </>
              ) : (
                <>
                  <UserCog size={20} />
                  Confirmar Atribuição
                </>
              )}
            </button>
          </div>
        </form>
        {message && <p className="mt-6 text-center text-green-700 bg-green-50 p-3 rounded-lg text-sm">{message}</p>}
        {error && <p className="mt-6 text-center text-red-700 bg-red-50 p-3 rounded-lg text-sm">{error}</p>}
      </div>
    </div>
  );
};

export default AdminPage;
