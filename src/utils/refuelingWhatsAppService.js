import { getAllowedReadingTypes } from './vehicleRules';

// --- HELPER DE DATA (Blindagem contra datas inválidas) ---
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
 * SERVIÇO DE ENVIO DE WHATSAPP (Lógica extraída do Modal de Abastecimento)
 * Centraliza: Geração de PDF, Upload, Download Local e Redirecionamento WPP.
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
        // Gera apenas localmente se não tiver telefone
        if (onGeneratePDF) {
            await onGeneratePDF(finalData, vehicles, partners, employees, vehicleGroups, false);
        }
        return;
    }

    let pdfLink = '';

    // 2. Processo de Geração e Upload
    if (onGeneratePDF) {
        try {
            console.log("Service: Gerando PDF para upload...");
            
            // A. GERAÇÃO DO BLOB
            const pdfBlob = await onGeneratePDF(finalData, vehicles, partners, employees, vehicleGroups, true);
            
            // B. DOWNLOAD LOCAL (Segurança para o usuário ter o arquivo)
            const downloadUrl = window.URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `Ordem_${finalData.authNumber}_${vehicle?.registroInterno || 'Veic'}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);
            
            // C. PREPARAÇÃO DO UPLOAD
            const formDataUpload = new FormData();
            formDataUpload.append('file', pdfBlob, `ordem_${finalData.authNumber}.pdf`);
            
            // --- CÁLCULO DA URL DO SERVIDOR (Lógica Robusta) ---
            let serverBaseUrl = '';
            
            if (process.env.REACT_APP_API_URL) {
                serverBaseUrl = process.env.REACT_APP_API_URL;
            } else if (apiClient?.defaults?.baseURL) {
                serverBaseUrl = apiClient.defaults.baseURL;
            } else {
                serverBaseUrl = window.location.origin;
            }

            // Remove sufixos para garantir a base limpa
            if (serverBaseUrl.endsWith('/')) serverBaseUrl = serverBaseUrl.slice(0, -1);
            if (serverBaseUrl.endsWith('/api')) serverBaseUrl = serverBaseUrl.slice(0, -4);
            if (serverBaseUrl.endsWith('/')) serverBaseUrl = serverBaseUrl.slice(0, -1);

            // ROTA EXATA QUE FUNCIONA NO MODAL (/api/refuelings/upload-pdf)
            const uploadEndpoint = `${serverBaseUrl}/api/refuelings/upload-pdf`;
            
            console.log("Service: Enviando PDF para:", uploadEndpoint);

            // --- TOKEN DE AUTENTICAÇÃO (Busca Agressiva) ---
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

            // D. FETCH / UPLOAD
            const response = await fetch(uploadEndpoint, {
                method: 'POST',
                headers: headers,
                body: formDataUpload
            });

            if (response.ok) {
                const uploadRes = await response.json();
                console.log("Service: Upload OK. Resposta:", uploadRes);

                if (uploadRes && uploadRes.url) {
                    // Normaliza a URL retornada pelo backend
                    if (uploadRes.url.startsWith('http')) {
                         pdfLink = uploadRes.url;
                    } else if (uploadRes.url.startsWith('/')) {
                        pdfLink = `${serverBaseUrl}${uploadRes.url}`;
                    } else {
                        pdfLink = `${serverBaseUrl}/${uploadRes.url}`;
                    }
                }
            } else {
                const errorText = await response.text();
                console.error("Service: Erro upload:", response.status, errorText);
                if (setAlertMessage) setAlertMessage(`Aviso: Upload do PDF falhou (${response.status}), mas o link de texto será enviado.`);
            }

        } catch (err) {
            console.error("Service: Erro exceção:", err);
            if (setAlertMessage) setAlertMessage("Erro técnico ao processar PDF. Enviando mensagem de texto.");
        }
    }

    // 3. Montagem da Mensagem WhatsApp
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
    
    // Se o PDF falhou, enviamos o template sem link
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