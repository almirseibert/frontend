import { getAllowedReadingTypes } from './vehicleRules'; 

// --- HELPER DE DATA (Cópia exata do Modal) ---
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
 * Função unificada para gerar PDF, fazer Upload e enviar WhatsApp.
 * Baseada no código funcional de RefuelingOrderModal.js
 */
export const processRefuelingWhatsApp = async ({
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
        // Se não tem whatsapp, apenas gera o PDF localmente se a função existir
        if (onGeneratePDF) {
            await onGeneratePDF(finalData, vehicles, partners, employees, vehicleGroups, false);
        }
        return;
    }

    let pdfLink = '';

    // 2. Lógica de Geração e Upload (Cópia do Modal)
    if (onGeneratePDF) {
        try {
            console.log("Service: Iniciando geração do PDF...");
            
            // A. Gera o Blob
            const pdfBlob = await onGeneratePDF(finalData, vehicles, partners, employees, vehicleGroups, true);
            
            // B. Download Local (Garante a cópia para o usuário)
            const downloadUrl = window.URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `Ordem_${finalData.authNumber}_${vehicle?.registroInterno || 'Veic'}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);
            
            // C. Upload (Para gerar o link público)
            const formDataUpload = new FormData();
            formDataUpload.append('file', pdfBlob, `ordem_${finalData.authNumber}.pdf`);
            
            // --- DETERMINAÇÃO ROBUSTA DA URL (Lógica do Modal) ---
            let serverBaseUrl = '';
            
            if (process.env.REACT_APP_API_URL) {
                serverBaseUrl = process.env.REACT_APP_API_URL;
            } else if (apiClient?.defaults?.baseURL) {
                serverBaseUrl = apiClient.defaults.baseURL;
            } else {
                serverBaseUrl = window.location.origin;
            }

            // Limpeza da URL
            if (serverBaseUrl.endsWith('/')) serverBaseUrl = serverBaseUrl.slice(0, -1);
            if (serverBaseUrl.endsWith('/api')) serverBaseUrl = serverBaseUrl.slice(0, -4);
            if (serverBaseUrl.endsWith('/')) serverBaseUrl = serverBaseUrl.slice(0, -1);

            // USO DA ROTA DE REFUELINGS (A QUE FUNCIONA)
            const uploadEndpoint = `${serverBaseUrl}/api/refuelings/upload-pdf`;
            
            console.log("Service: Uploading to:", uploadEndpoint);

            // --- TOKEN (Busca agressiva igual ao Modal) ---
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

            const response = await fetch(uploadEndpoint, {
                method: 'POST',
                headers: headers,
                body: formDataUpload
            });

            if (response.ok) {
                const uploadRes = await response.json();
                console.log("Service: Upload Sucesso. Resposta:", uploadRes);

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
                // Não paramos aqui, deixamos cair para o fallback de texto se falhar
            }

        } catch (err) {
            console.error("Service: Erro exceção upload PDF:", err);
            if (setAlertMessage) setAlertMessage("Ordem gerada, mas erro no upload do PDF. Enviando texto.");
        }
    }

    // 3. Montagem da Mensagem (Cópia do Modal)
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

    // 4. Abertura do WhatsApp
    setTimeout(() => {
        window.open(`https://wa.me/55${phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    }, 1000);
};