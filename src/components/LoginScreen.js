import React, { useState } from 'react';
// Importa o hook do nosso AuthContext
import { useAuth } from '../contexts/AuthContext';
// Importa o cliente da API
import apiClient from '../services/apiClient'; // Ajuste o caminho se necessário

const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(''); // Estado para erros específicos do LoginScreen
    const [isRegistering, setIsRegistering] = useState(false);
    const [registerName, setRegisterName] = useState('');
    const [registerEmail, setRegisterEmail] = useState('');
    const [registerMessage, setRegisterMessage] = useState(''); // Mensagem para o modal de registro
    const [notification, setNotification] = useState(''); // Notificação de sucesso no registro
    const [isSubmittingRequest, setIsSubmittingRequest] = useState(false); // Loading state for registration

    // Pega a função de login e o estado de erro/loading do contexto
    const { login, error: authError, loading: authLoading } = useAuth();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError(''); // Limpa erro local
        await login(email, password); // Chama a função de login do contexto
        // O erro do AuthContext (authError) será exibido se houver
    };

    const handleRegisterRequest = async (e) => {
        e.preventDefault();
        setRegisterMessage('');
        if (!registerName || !registerEmail) {
            setRegisterMessage('Por favor, preencha nome e email.');
            return;
        }
        setIsSubmittingRequest(true);
        try {
            // Usa o apiClient para criar a solicitação
            await apiClient.createRegistrationRequest({
                name: registerName,
                email: registerEmail,
                // O backend agora adiciona a data automaticamente
            });
            setNotification('Solicitação de cadastro enviada ao administrador. Você será notificado quando seu acesso for liberado.');
            setIsRegistering(false);
            setRegisterName('');
            setRegisterEmail('');
        } catch (err) {
            console.error("Erro na solicitação de cadastro:", err);
            // Tenta pegar uma mensagem mais específica do erro da API
            const apiErrorMessage = err.response?.data?.message || err.message || 'Erro ao enviar solicitação. Tente novamente.';
            setRegisterMessage(apiErrorMessage);
        } finally {
            setIsSubmittingRequest(false);
        }
    };


    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-200 font-sans">
            <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl shadow-lg">
                <div className="flex justify-center"><img src="https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png" alt="Logo MAK Serviços" className="w-48"/></div>
                <h2 className="text-2xl font-bold text-center text-gray-900">Sistema de Frotas</h2>
                <form className="space-y-6" onSubmit={handleLogin}>
                    <div><label className="text-sm font-medium text-gray-700">Email</label><input type="email" required className="w-full px-4 py-2 mt-2 text-gray-800 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                    <div><label className="text-sm font-medium text-gray-700">Senha</label><input type="password" required className="w-full px-4 py-2 mt-2 text-gray-800 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                    {/* Exibe erro local OU erro do AuthContext */}
                    {(error || authError) && <p className="text-sm text-red-600 text-center">{error || authError}</p>}
                    <div><button type="submit" disabled={authLoading} className="w-full py-3 font-semibold text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400 transition-colors disabled:bg-yellow-300">
                        {authLoading ? 'Entrando...' : 'Entrar'}
                        </button></div>
                </form>
                <div className="text-center"><button onClick={() => setIsRegistering(true)} className="text-sm text-yellow-600 hover:underline">Contate o Administrador para se cadastrar</button></div>
                 {notification && ( <div className="mt-4 p-3 bg-green-100 text-green-800 rounded-lg text-center">{notification}</div> )}
            </div>

            {/* Modal de Solicitação de Cadastro */}
            {isRegistering && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                     <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
                         <h3 className="text-xl font-bold mb-4">Solicitar Cadastro</h3>
                         <p className="text-gray-600 mb-6">Preencha o formulário abaixo. O administrador receberá sua solicitação e liberará seu acesso.</p>
                         <form onSubmit={handleRegisterRequest}>
                             <div className="mb-4"><label htmlFor="registerName" className="block text-gray-700">Seu Nome</label><input type="text" id="registerName" value={registerName} onChange={(e) => setRegisterName(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500" required/></div>
                             <div className="mb-4"><label htmlFor="registerEmail" className="block text-gray-700">Seu Email</label><input type="email" id="registerEmail" value={registerEmail} onChange={(e) => setRegisterEmail(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500" required/></div>
                             {registerMessage && <p className="text-sm text-red-600 mb-4">{registerMessage}</p>}
                             <div className="flex justify-end gap-4">
                                 <button type="button" onClick={() => setIsRegistering(false)} className="py-2 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300" disabled={isSubmittingRequest}>Cancelar</button>
                                 <button type="submit" className="py-2 px-4 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 disabled:bg-yellow-300" disabled={isSubmittingRequest}>
                                     {isSubmittingRequest ? 'Enviando...' : 'Enviar Solicitação'}
                                 </button>
                             </div>
                         </form>
                     </div>
                 </div>
            )}
        </div>
    );
};

export default LoginScreen;
