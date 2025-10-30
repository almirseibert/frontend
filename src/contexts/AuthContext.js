// AuthContext.js (Atualizado para API Backend e JWT)
import React, { useState, useEffect, useContext, createContext, useCallback, useMemo } from 'react';
// Importa o cliente da API
import apiClient from '../services/apiClient'; 

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [permissions, setPermissions] = useState({
        isOperator: false,
        isEditor: false,
        isAdmin: false,
        canAccessRefueling: false, // Vem da tabela employees no backend
    });
    const [loading, setLoading] = useState(true); // Começa como true para verificar token inicial

    // Função para definir o usuário e as permissões com base nos dados da API
    const setUserAndPermissions = (userData) => {
        if (userData) {
            setUser(userData);
            // Deriva permissões do objeto 'userData' vindo da API (/auth/me)
            const role = userData.user_type || 'viewer'; // 'user_type' conforme seu DB
            const canAccess = userData.podeAcessarAbastecimento || false; // 'podeAcessarAbastecimento'

            setPermissions({
                isOperator: role === 'operador',
                isEditor: ['editor', 'admin'].includes(role),
                isAdmin: role === 'admin',
                // Admin sempre pode acessar abastecimento, OU se a flag for true
                canAccessRefueling: canAccess || role === 'admin', 
            });
            console.log("Usuário definido:", userData, "Permissões:", {
                isOperator: role === 'operador',
                isEditor: ['editor', 'admin'].includes(role),
                isAdmin: role === 'admin',
                canAccessRefueling: canAccess || role === 'admin',
            });
        } else {
            setUser(null);
            setPermissions({
                isOperator: false,
                isEditor: false,
                isAdmin: false,
                canAccessRefueling: false,
            });
            console.log("Usuário removido.");
        }
    };

    // Efeito para verificar o token no carregamento inicial
    useEffect(() => {
        const checkAuth = async () => {
            setLoading(true);
            const token = localStorage.getItem('authToken');
            console.log("Verificando token inicial:", token);
            if (token) {
                try {
                    // Se tem token, tenta buscar os dados do usuário
                    const userData = await apiClient.getMe(); 
                    console.log("Dados do usuário (/me) recebidos:", userData);
                    setUserAndPermissions(userData);
                } catch (error) {
                    // Se getMe falhar (token inválido/expirado), limpa o token e desloga
                    console.error("Falha ao buscar dados do usuário com token existente:", error);
                    localStorage.removeItem('authToken');
                    setUserAndPermissions(null);
                }
            } else {
                // Sem token, usuário não está logado
                setUserAndPermissions(null);
                console.log("Nenhum token encontrado.");
            }
            setLoading(false);
        };
        checkAuth();
    }, []); // Executa apenas uma vez no mount

    // Função de Login
    const login = useCallback(async (email, password) => {
        setLoading(true); // Pode ser útil mostrar um loading durante o login
        try {
            // 1. Chama a API de login para obter o token
            const response = await apiClient.login(email, password);
            const token = response.token;
            console.log("Token recebido:", token);

            if (token) {
                // 2. Armazena o token
                localStorage.setItem('authToken', token);
                
                // 3. Busca os dados do usuário usando o novo token
                const userData = await apiClient.getMe();
                console.log("Dados do usuário (/me) após login:", userData);
                setUserAndPermissions(userData);
                
                // Retorna sucesso (ou os dados do usuário, se preferir)
                return { success: true, user: userData };
            } else {
                throw new Error("Token não recebido do servidor.");
            }
        } catch (error) {
            console.error("Erro no processo de login:", error);
            localStorage.removeItem('authToken'); // Garante que token inválido seja removido
            setUserAndPermissions(null);
            // Propaga o erro para a tela de login poder exibi-lo
            throw error; 
        } finally {
            setLoading(false);
        }
    }, []); // useCallback para memoizar a função

    // Função de Logout
    const logout = useCallback(() => {
        console.log("Executando logout...");
        localStorage.removeItem('authToken'); // Remove o token
        setUserAndPermissions(null); // Limpa o usuário e permissões
        // Pode redirecionar para a tela de login aqui se necessário
        // window.location.href = '/login'; // Ou use o roteador do React
    }, []);

    // O valor do contexto agora inclui o usuário, permissões, loading, e funções login/logout
    const value = useMemo(() => ({ 
        user, 
        ...permissions, 
        loading, 
        login, 
        logout 
    }), [user, permissions, loading, login, logout]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// Hook customizado para aceder facilmente ao contexto
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth deve ser usado dentro de um AuthProvider');
    }
    return context;
};
