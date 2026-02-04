import { getAllowedReadingTypes } from './vehicleRules'; // Verifique se o caminho para vehicleRules está correto aqui

// --- HELPER DE DATA INTERNO ---
const getSafeDateObj = (dateInput) => {
    if (!dateInput) return new Date(0);
    try {
        let dateStr = String(dateInput);
        if (dateStr.includes(' ') && !dateStr.includes('T')) dateStr = dateStr.replace(' ', 'T');
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? new Date(0) : d;
    } catch { return new Date(0); }
};

/**
 * Função Blindada de Envio de PDF e WhatsApp
 * Reutiliza a lógica exata do RefuelingOrderModal.js
 */
export const sendOrderToWhatsApp = async ({
    finalData,
    vehicle,
    partner,
    employee,
    vehicles,
    partners,
    employees,
    vehicleGroups,
    onGeneratePDF,
    apiClient,
    setAlertMessage
}) => {
    const phone = partner?.whatsapp || partner?.telefone;
    
    // 1. Validação de Telefone
    if (!phone) {
        if (setAlertMessage) setAlertMessage("Ordem gerada! Posto sem WhatsApp (PDF baixado).");
        // Gera apenas localmente
        if (onGeneratePDF) {
            await onGeneratePDF(finalData, vehicles, partners, employees, vehicleGroups, false);
        }
        return;
    }

    let pdfLink = '';

    // 2. Processo de Geração e Upload
    if (onGeneratePDF) {
        try {
            console.log("Iniciando geração do PDF no Service...");
            
            // A. Gera o Blob
            const pdfBlob = await onGeneratePDF(finalData, vehicles, partners, employees, vehicleGroups, true);
            
            // B. Download Local (Cópia de segurança para o usuário)
            const downloadUrl = window.URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `Ordem_${finalData.authNumber}_${vehicle?.registroInterno || 'Veic'}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);
            
            // C. Preparação do Upload
            const formDataUpload = new FormData();
            formDataUpload.append('file', pdfBlob, `ordem_${finalData.authNumber}.pdf`);
            
            // --- LÓGICA DE URL BLINDADA (Copiada do Modal) ---
            let serverBaseUrl = '';
            
            // Tenta pegar a URL de várias fontes
            if (process.env.REACT_APP_API_URL) {
                serverBaseUrl = process.env.REACT_APP_API_URL;
            } else if (apiClient?.defaults?.baseURL) {
                serverBaseUrl = apiClient.defaults.baseURL;
            } else {
                serverBaseUrl = window.location.origin;
            }

            // Limpeza rigorosa da URL para evitar duplicidade de barras ou '/api'
            if (serverBaseUrl.endsWith('/')) serverBaseUrl = serverBaseUrl.slice(0, -1);
            if (serverBaseUrl.endsWith('/api')) serverBaseUrl = serverBaseUrl.slice(0, -4);
            if (serverBaseUrl.endsWith('/')) serverBaseUrl = serverBaseUrl.slice(0, -1);

            // USO EXPLÍCITO DA ROTA DE REFUELINGS (A que funciona)
            const uploadEndpoint = `${serverBaseUrl}/api/refuelings/upload-pdf`;
            
            console.log("Service: Uploading to:", uploadEndpoint);

            // --- LÓGICA DE TOKEN BLINDADA ---
            let token = localStorage.getItem('token');
            if (!token) token = localStorage.getItem('authToken');
            if (!token) token = localStorage.getItem('userToken');
            
            if (!token) {
                try {
                    const userStored = localStorage.getItem('user');
                    if (userStored) {
                        const uObj = JSON.parse(userStored);
                        if (uObj.token) token = uObj.token;
                    }
                } catch(e) {}
            }

            if (token && typeof token === 'string') {
                if (token.startsWith('"') && token.endsWith('"')) {
                    token = token.slice(1, -1);
                }
            }

            const headers = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            // D. Executa o Fetch
            const response = await fetch(uploadEndpoint, {
                method: 'POST',
                headers: headers,
                body: formDataUpload
            });

            if (response.ok) {
                const uploadRes = await response.json();
                console.log("Service: Upload Sucesso:", uploadRes);

                if (uploadRes && uploadRes.url) {
                    if (uploadRes.url.startsWith('http')) {
                         pdfLink = uploadRes.url;
                    } else if (uploadRes.url.startsWith('/')) {
                        pdfLink = `${serverBaseUrl}${uploadRes.url}`;
                    } else {
                        pdfLink = `${serverBaseUrl}/${uploadRes.url}`;
                    }
                }
            } else {
                console.error("Service: Erro upload status:", response.status, await response.text());
                if (setAlertMessage) setAlertMessage("Erro no upload do PDF (Servidor recusou).");
            }

        } catch (err) {
            console.error("Service: Erro exceção upload PDF:", err);
            if (setAlertMessage) setAlertMessage("Erro técnico ao processar PDF.");
        }
    }

    // 3. Formatação da Mensagem WhatsApp
    const allowedReadings = getAllowedReadingTypes(vehicle?.tipo);
    let readingMsg = '';
    if (allowedReadings.includes('odometro')) {
            readingMsg = `*Hodômetro:* ${finalData.odometro ? finalData.odometro + ' Km' : 'N/A'}`;
    } else {
            readingMsg = `*Horímetro:* ${finalData.horimetro ? finalData.horimetro + ' Hr' : 'N/A'}`;
    }
    
    const emissionDate = getSafeDateObj(finalData.date).toLocaleDateString('pt-BR');
    const arlaMsg = finalData.needsArla 
        ? `\n*Arla 32:* ${finalData.litrosLiberadosArla ? finalData.litrosLiberadosArla + ' Litros' : 'Incluso'}` 
        : '';

    let msg = '';
    
    if (pdfLink) {
        msg = 
`*ORDEM DE ABASTECIMENTO - FROTAS MAK*
Segue link para a Autorização Oficial (PDF):
${pdfLink}

*Resumo:*
*Nº Ordem:* ${finalData.authNumber}
*Data:* ${emissionDate}
*Posto:* ${partner?.razaoSocial || 'N/A'}
*Veículo:* ${vehicle?.marca || ''} ${vehicle?.modelo || ''} - ${vehicle?.placa} / ${vehicle?.registroInterno}
*Combustível:* ${finalData.fuelType}
*Quantidade:* ${finalData.isFillUp ? 'COMPLETAR TANQUE' : finalData.litrosLiberados + ' Litros'}${arlaMsg}
*Motorista:* ${employee?.nome || 'N/A'}`;
    } else {
        msg = 
`*ORDEM DE ABASTECIMENTO - FROTAS MAK*
(Link PDF indisponível, verifique sistema)

*Nº Ordem:* ${finalData.authNumber}
*Data:* ${emissionDate}
*Posto:* ${partner?.razaoSocial || 'N/A'}
*Veículo:* ${vehicle?.marca || ''} ${vehicle?.modelo || ''} - ${vehicle?.placa}
${readingMsg}
*Motorista:* ${employee?.nome || 'N/A'}
*Combustível:* ${finalData.fuelType}
*Qtd:* ${finalData.isFillUp ? 'COMPLETAR TANQUE' : finalData.litrosLiberados + ' Litros'}${arlaMsg}`;
    }

    // 4. Abrir WhatsApp
    setTimeout(() => {
        window.open(`https://wa.me/55${phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    }, 1000);
};