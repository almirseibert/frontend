import React, { useState, useEffect } from 'react';
import { 
    Check, X, AlertTriangle, MapPin, Eye, Fuel, 
    Calendar, Loader, Search, RefreshCw, Smartphone, DollarSign, Image as ImageIcon,
    ExternalLink, BarChart3, Clock, TrendingUp, TrendingDown, Lock
} from 'lucide-react';
import { jsPDF } from 'jspdf'; 
import autoTable from 'jspdf-autotable'; 
import { getAllowedReadingTypes } from '../utils/vehicleRules';
import RefuelingOrderModal from '../components/modals/RefuelingOrderModal';

// NOTA: O ConfirmRefuelingModal foi removido pois a lógica foi integrada diretamente nesta página.

const AdminSolicitacoesPage = ({ 
    apiClient, 
    setAlertMessage, 
    vehicles = [],
    partners = [], 
    employees = [],
    obras = [],
    vehicleGroups = {},
    refuelings = [], 
    expenses = [],
    user,
    PasswordConfirmationModal,
    ConfirmationModal,
    reloadData 
}) => {
    
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [filteredSolicitacoes, setFilteredSolicitacoes] = useState([]);
    const [loading, setLoading] = useState(false);

    // --- ESTADO PARA CONSISTÊNCIA DE INTERFACE ---
    // IDs que foram processados localmente e devem ser ignorados nas próximas requisições
    // para evitar que o delay do backend os faça reaparecer na tela.
    const [ignoreIds, setIgnoreIds] = useState(new Set());
    
    // Controle do Modal Geral
    const [modalData, setModalData] = useState(null); 
    const [rejectReason, setRejectReason] = useState('');
    
    // --- ESTADOS DO FORMULÁRIO DE BAIXA (Unificado) ---
    const [relatedOrder, setRelatedOrder] = useState(null); // A ordem vinculada à solicitação
    const [confirmForm, setConfirmForm] = useState({
        litros: '',
        litrosArla: '',
        price: '',
        nf: '',
        reading: '',
        outrosValor: ''
    });
    const [initialPartnerPrice, setInitialPartnerPrice] = useState(0);
    const [validationState, setValidationState] = useState({
        blockReason: null,
        averageAlert: null,
        isSaving: false
    });
    const [showPriceUpdateConfirm, setShowPriceUpdateConfirm] = useState(false);
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

    // Controle do Modal de Emissão (Aprovação - PENDENTE)
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [solicitacaoToApprove, setSolicitacaoToApprove] = useState(null);

    // Filtros
    const [filterStatus, setFilterStatus] = useState('PENDENTE'); 
    const [searchTerm, setSearchTerm] = useState('');

    // --- FUNÇÃO DE GERAÇÃO DE PDF (PADRONIZADO / ANTIGO) ---
    const generateAuthorizationPDF = (order, vehiclesList = vehicles, partnersList = partners, employeesList = employees, groups = vehicleGroups, returnBlob = false) => {
        // setIsGeneratingPdf(true); // Estado local removido para compatibilidade
        return new Promise((resolve, reject) => {
            try {
                // Helpers internos para garantir funcionamento autônomo da função
                const isValidDbDate = (dateString) => {
                    if (!dateString) return false;
                    const str = String(dateString);
                    return str.length > 5 && !str.startsWith('0000') && str !== '1970-01-01T00:00:00.000Z';
                };

                const formatDateSafe = (dateInput) => {
                    try {
                        let dateStr = String(dateInput);
                        if (dateStr.includes(' ') && !dateStr.includes('T')) dateStr = dateStr.replace(' ', 'T');
                        const date = new Date(dateStr);
                        if (isNaN(date.getTime())) return 'N/A';
                        return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()).toLocaleDateString('pt-BR');
                    } catch { return 'Erro'; }
                };

                const buildPdf = (logoDataUrl) => {
                    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                    const pageWidth = doc.internal.pageSize.getWidth();
                    const effectivePageHeight = 148.5; // Meia página A4 (formato econômico)
                    const margin = 10;

                    const vehicle = vehiclesList.find(v => v.id === order.vehicleId);
                    const partner = partnersList.find(p => p.id === order.partnerId);
                    const employee = employeesList.find(e => e.id === order.employeeId);
                    
                    const dateToUse = order.data || order.date;
                    let emissionDateStr = 'N/A';
                    if (isValidDbDate(dateToUse)) {
                        emissionDateStr = formatDateSafe(dateToUse);
                    }

                    if (logoDataUrl) {
                        try {
                            doc.addImage(logoDataUrl, 'PNG', margin, 10, 45, 16.875);
                        } catch (e) {
                            console.error("Erro ao adicionar logo ao PDF:", e);
                        }
                    }

                    doc.setFontSize(16);
                    doc.text(`Autorização de Abastecimento`, pageWidth - margin, 15, { align: 'right' });
                    doc.setFontSize(12);
                    doc.text(`Nº: ${String(order.authNumber || '0').padStart(6, '0')}`, pageWidth - margin, 22, { align: 'right' });

                    let leituraLabel = 'Leitura';
                    let leituraValue = 'N/A';
                    
                    if (order.horimetro && order.horimetro > 0) {
                        leituraLabel = 'Horímetro';
                        leituraValue = order.horimetro;
                    } else if (order.odometro && order.odometro > 0) {
                        leituraLabel = 'Odômetro';
                        leituraValue = order.odometro;
                    } 

                    const body = [
                        ['Data de Emissão', emissionDateStr],
                        ['Funcionário Autorizado', employee?.nome || 'Não especificado'],
                        ['Veículo Autorizado', `${vehicle?.registroInterno || 'N/A'} - ${vehicle?.placa || 'N/A'}`],
                        ['Modelo', `${vehicle?.marca || ''} ${vehicle?.modelo || ''}`.trim() || 'N/A'],
                        [leituraLabel, `${leituraValue}`],
                        ['Posto Autorizado', partner?.razaoSocial || order.partnerName || 'N/A'],
                        ['Combustível Autorizado', order.fuelType || 'N/A'],
                        ['Litros Liberados', order.isFillUp ? 'Completar Tanque' : `${order.litrosLiberados || 0} L`],
                    ];

                    if (order.needsArla) {
                        body.push(['Arla 32 Autorizado', order.isFillUpArla ? 'Completar Tanque' : `${order.litrosLiberadosArla || 0} L`]);
                    }
                    if (order.outros) {
                        body.push(['Outros Itens/Observação', `${order.outros} ${order.outrosValor ? `(R$ ${parseFloat(order.outrosValor || 0).toFixed(2)})` : ''}`]);
                    }

                    let issuer = 'N/A';
                    if (order.createdBy) {
                        if (typeof order.createdBy === 'string') {
                            issuer = order.createdBy; 
                        } else if (typeof order.createdBy === 'object') {
                            issuer = order.createdBy.nome || order.createdBy.name || order.createdBy.userEmail || order.createdBy.email || 'Usuário do Sistema';
                        }
                    }
                    body.push(['Emitido por', issuer]);

                    autoTable(doc, {
                        startY: 35,
                        body: body,
                        theme: 'striped',
                        styles: { fontSize: 9, cellPadding: 1.5 },
                        headStyles: { fillColor: [24, 49, 83] },
                        columnStyles: {
                            0: { cellWidth: 40, fontStyle: 'bold' }
                        }
                    });

                    // Rodapé / Avisos
                    let finalY = (doc.lastAutoTable?.finalY || 35) + 10;
                    const footerStartY = Math.max(finalY, effectivePageHeight - 20); 
                    
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'italic');
                    doc.text('*A presente ordem de abastecimento é válida exclusivamente para a placa/RE indicada e para o tipo de combustível previamente autorizado.', margin, footerStartY);
                    doc.text('*Estão autorizados somente os itens discriminados acima.', margin, footerStartY + 4);

                    // Frase Solicitada
                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'normal');
                    doc.text("Sistema de Gestão de Frotas MAK - Documento Gerado Eletronicamente", pageWidth / 2, footerStartY + 10, { align: 'center' });

                    doc.setLineDashPattern([1, 1], 0);
                    doc.setDrawColor(180, 180, 180);
                    doc.line(0, effectivePageHeight, pageWidth, effectivePageHeight);

                    // LÓGICA DE RETORNO (Salvar ou Blob)
                    if (returnBlob) {
                        const blob = doc.output('blob');
                        resolve(blob);
                    } else {
                        let fileDate = 'DATA';
                        try {
                            let dObj;
                            if (dateToUse && typeof dateToUse.toDate === 'function') {
                                dObj = dateToUse.toDate();
                            } else {
                                let ds = String(dateToUse);
                                if(ds.includes(' ') && !ds.includes('T')) ds = ds.replace(' ', 'T');
                                dObj = new Date(ds);
                            }
                            if(!isNaN(dObj.getTime())) fileDate = dObj.toISOString().split('T')[0];
                        } catch(e) {}

                        doc.save(`Autorizacao_${order.authNumber}_${vehicle?.registroInterno || 'VEIC'}_${fileDate}.pdf`);
                        resolve(true);
                    }
                };

                const logo = new Image();
                logo.crossOrigin = 'Anonymous';
                logo.src = 'https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png';
                logo.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = logo.width;
                    canvas.height = logo.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(logo, 0, 0);
                    buildPdf(canvas.toDataURL('image/png'));
                };
                logo.onerror = () => buildPdf(null);

            } catch (error) {
                console.error("Erro ao gerar PDF:", error);
                setAlertMessage("Erro ao gerar o PDF.");
                reject(error);
            }
        });
    };

    // --- CARREGAMENTO INICIAL E POLLING ---
    const fetchSolicitacoes = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/solicitacoes');
            // Filtra localmente os IDs que marcamos como "recém concluídos" para evitar flicker
            const rawList = Array.isArray(res) ? res : [];
            const cleanList = rawList.filter(s => !ignoreIds.has(s.id));
            setSolicitacoes(cleanList);
        } catch (error) {
            console.error("Erro ao buscar solicitações", error);
            setAlertMessage("Erro ao carregar lista de solicitações.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSolicitacoes();
        const interval = setInterval(fetchSolicitacoes, 30000);
        return () => clearInterval(interval);
    }, [ignoreIds]); // Reexecuta se ignoreIds mudar, mas a lógica interna protege

    // --- FILTROS ---
    useEffect(() => {
        let list = [...solicitacoes];
        
        if (filterStatus !== 'TODOS') {
            if (filterStatus === 'PENDENTE') {
                list = list.filter(s => s.status === 'PENDENTE');
            } else if (filterStatus === 'AGUARDANDO_BAIXA') {
                list = list.filter(s => s.status === 'AGUARDANDO_BAIXA');
            } else {
                list = list.filter(s => s.status === filterStatus);
            }
        }

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            list = list.filter(s => 
                (s.placa && s.placa.toLowerCase().includes(lower)) || 
                (s.veiculo_nome && s.veiculo_nome.toLowerCase().includes(lower)) ||
                (s.solicitante_nome && s.solicitante_nome.toLowerCase().includes(lower))
            );
        }

        setFilteredSolicitacoes(list);
    }, [solicitacoes, filterStatus, searchTerm]);


    // ==================================================================================
    // === LÓGICA DE BAIXA / CONFIRMAÇÃO (MIGRADA E UNIFICADA) ===
    // ==================================================================================

    // 1. Efeito: Quando o Modal Abre (Status: AGUARDANDO_BAIXA), prepara os dados
    useEffect(() => {
        if (modalData && modalData.status === 'AGUARDANDO_BAIXA') {
            
            // Tenta encontrar a ordem vinculada na lista de refuelings carregada
            let order = refuelings.find(r => {
                if (r.createdFromSolicitacaoId && String(r.createdFromSolicitacaoId) === String(modalData.id)) return true;
                if (r.createdBy) {
                    let creator = r.createdBy;
                    if (typeof creator === 'string') {
                        try { creator = JSON.parse(creator); } catch (e) { return false; }
                    }
                    if (creator && String(creator.linkedSolicitacaoId) === String(modalData.id)) return true;
                }
                return false;
            });

            // Se não achar na lista (pode ser paginação ou delay), tenta inferir dados para não travar
            if (!order) {
                console.warn(`Ordem vinculada à solicitação #${modalData.id} não encontrada na lista local.`);
                // Cria um objeto temporário para permitir o preenchimento dos dados enquanto tenta resolver
                order = {
                    id: null, // Sem ID real, vamos depender do ID da solicitação no submit
                    vehicleId: modalData.veiculo_id,
                    fuelType: modalData.tipo_combustivel,
                    partnerId: modalData.posto_id,
                    litrosLiberados: modalData.litragem_solicitada || '',
                    litrosLiberadosArla: 0,
                    odometro: modalData.odometro_informado,
                    horimetro: modalData.horimetro_informado,
                    needsArla: false, 
                    invoiceNumber: ''
                };
            }

            setRelatedOrder(order);

            // Busca preço do parceiro
            let currentPrice = '';
            if (order.partnerId && partners.length > 0) {
                const partner = partners.find(p => String(p.id) === String(order.partnerId));
                if (partner && partner.fuel_prices && partner.fuel_prices[order.fuelType]) {
                    currentPrice = partner.fuel_prices[order.fuelType];
                    setInitialPartnerPrice(parseFloat(currentPrice));
                }
            }

            // Preenche o formulário
            setConfirmForm({
                litros: order.litrosLiberados || '',
                litrosArla: order.litrosLiberadosArla || '',
                price: currentPrice || '',
                nf: order.invoiceNumber || '',
                reading: order.horimetro || order.odometro || modalData.odometro_informado || modalData.horimetro_informado || '',
                outrosValor: order.outrosGeraValor ? (order.outrosValor || '') : ''
            });

            // Limpa estados de validação
            setValidationState({ blockReason: null, averageAlert: null, isSaving: false });
            setShowPriceUpdateConfirm(false);
            setShowPasswordPrompt(false);
        }
    }, [modalData, refuelings, partners]);

    // 2. Efeito: Validações em Tempo Real (Ocorre sempre que o form muda)
    useEffect(() => {
        if (!modalData || modalData.status !== 'AGUARDANDO_BAIXA' || !relatedOrder) return;

        let block = null;
        let avgWarning = null;

        // --- Validação 1: Regressão e Saltos ---
        const vehicle = vehicles.find(v => String(v.id) === String(modalData.veiculo_id));
        if (vehicle && confirmForm.reading) {
            const allowedTypes = getAllowedReadingTypes(vehicle.tipo);
            const isKm = allowedTypes.includes('odometro');
            const isHr = allowedTypes.includes('horimetro');
            
            let last = 0;
            if (isKm) last = parseFloat(vehicle.odometro || 0);
            else {
                last = parseFloat(vehicle.horimetro || 0);
            }

            const current = parseFloat(confirmForm.reading);
            
            if (!isNaN(current) && last > 0) {
                if (current <= last) {
                    block = `Leitura (${current}) menor/igual à atual (${last}).`;
                } else if (isHr && (current - last) > 50) {
                    block = `Salto excessivo de Horímetro (> 50h). Dif: ${(current - last).toFixed(1)}h.`;
                } else if (isKm && (current - last) > 1000) {
                    block = `Salto excessivo de Km (> 1000).`;
                }
            }
        }

        // --- Validação 2: Média de Consumo ---
        if (confirmForm.litros && confirmForm.reading && parseFloat(confirmForm.litros) > 0) {
            const history = refuelings
                .filter(r => String(r.vehicleId) === String(modalData.veiculo_id) && r.status === 'Concluída')
                .sort((a,b) => new Date(b.data || 0) - new Date(a.data || 0));
            
            if (history.length > 0) {
                const currentReading = parseFloat(confirmForm.reading);
                const lastRefuel = history[0];
                const lastReading = parseFloat(lastRefuel.horimetro || lastRefuel.odometro || 0);

                if (currentReading > lastReading) {
                    const diff = currentReading - lastReading;
                    const currentAverage = diff / parseFloat(confirmForm.litros); 

                    // Média histórica (últimos 3)
                    let sumAvgs = 0;
                    let count = 0;
                    for (let i = 0; i < Math.min(history.length - 1, 3); i++) {
                        const rCurrent = history[i];
                        const rPrev = history[i+1];
                        const l = parseFloat(rCurrent.litrosAbastecidos || 0);
                        const valCurr = parseFloat(rCurrent.horimetro || rCurrent.odometro || 0);
                        const valPrev = parseFloat(rPrev.horimetro || rPrev.odometro || 0);
                        
                        if (l > 0 && valCurr > valPrev) {
                            sumAvgs += (valCurr - valPrev) / l;
                            count++;
                        }
                    }

                    if (count > 0) {
                        const baselineAverage = sumAvgs / count;
                        if (currentAverage < (baselineAverage * 0.75)) {
                            avgWarning = `Média caiu >25% (Atual: ${currentAverage.toFixed(2)} / Base: ${baselineAverage.toFixed(2)})`;
                        }
                    }
                }
            }
        }

        setValidationState(prev => ({ ...prev, blockReason: block, averageAlert: avgWarning }));

    }, [confirmForm, modalData, relatedOrder, vehicles, refuelings]);

    // 3. Ação: Submeter Formulário
    const handleFinalizeBaixa = (forcePriceUpdate = false) => {
        // Validações Básicas
        if (!confirmForm.litros || !confirmForm.price || !confirmForm.reading || !confirmForm.nf) {
            setAlertMessage("Preencha todos os campos obrigatórios (NF, Litros, Preço, Leitura).");
            return;
        }

        // Verifica Bloqueio (Senha)
        if (validationState.blockReason && !showPasswordPrompt) {
            setShowPasswordPrompt(true);
            return;
        }

        // Verifica Preço (Confirmação)
        const inputPrice = parseFloat(confirmForm.price);
        if (!forcePriceUpdate && !showPriceUpdateConfirm && initialPartnerPrice > 0 && inputPrice > 0 && Math.abs(inputPrice - initialPartnerPrice) > 0.01) {
            setShowPriceUpdateConfirm(true);
            return;
        }

        // Executar
        submitBaixa(forcePriceUpdate);
    };

    const submitBaixa = async (updatePartnerPrice) => {
        const idToProcess = modalData.id;
        setValidationState(prev => ({ ...prev, isSaving: true }));
        
        try {
            const payload = {
                litrosAbastecidos: parseFloat(confirmForm.litros) || 0,
                litrosAbastecidosArla: parseFloat(confirmForm.litrosArla) || 0,
                pricePerLiter: parseFloat(confirmForm.price) || 0,
                confirmedReading: parseFloat(confirmForm.reading) || 0,
                confirmedBy: user,
                outrosValor: parseFloat(confirmForm.outrosValor) || 0,
                invoiceNumber: confirmForm.nf,
                updatePartnerPrice: updatePartnerPrice,
                // Envia ID da solicitação em múltiplos formatos para garantir compatibilidade com o backend
                solicitacaoId: idToProcess,
                solicitacao_id: idToProcess 
            };

            const orderId = relatedOrder?.id;
            
            if (orderId) {
                // --- AQUI ESTÁ A CORREÇÃO PRINCIPAL ---
                
                // 1. Executa a baixa completa da ORDEM (Financeiro, Estoque, Despesa)
                // Mantém a lógica complexa que funciona.
                await apiClient.confirmRefuelingOrder(orderId, payload);

                // 2. Executa a baixa de status da SOLICITAÇÃO (Interface/Fluxo)
                // Adiciona a chamada que existia no arquivo "Old" para garantir que a solicitação
                // mude de status para CONCLUÍDO/BAIXADO e saia da lista do backend.
                try {
                    await apiClient.put(`/solicitacoes/${idToProcess}/confirmar-baixa`, {});
                } catch (statusError) {
                    console.warn("Ordem baixada, mas houve falha ao atualizar status da solicitação na API específica.", statusError);
                    // Não lançamos erro aqui para não travar a UI, já que a parte financeira (mais crítica) funcionou.
                }

            } else {
                // Fallback: Se não temos ID da ordem, tentamos enviar mas provavelmente falhará se a API for estrita.
                throw new Error("Ordem de abastecimento não localizada na lista. Atualize a página e tente novamente.");
            }
            
            // --- ATUALIZAÇÃO OTIMISTA E ROBUSTA DA INTERFACE ---
            // 1. Removemos imediatamente da lista local
            setSolicitacoes(prev => prev.filter(s => s.id !== idToProcess));
            setFilteredSolicitacoes(prev => prev.filter(s => s.id !== idToProcess));

            // 2. Adicionamos o ID à lista de ignorados para que o polling/fetch não traga esse item de volta
            // enquanto o backend processa a transição de status.
            setIgnoreIds(prev => new Set(prev).add(idToProcess));
            
            // 3. Define um timeout para remover da lista de ignorados após 10s (tempo seguro para consistência)
            setTimeout(() => {
                setIgnoreIds(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(idToProcess);
                    return newSet;
                });
            }, 10000);

            setAlertMessage("Baixa confirmada com sucesso!");
            setModalData(null);
            
            // Atualiza dados globais
            reloadData(); 
            // Delay seguro para refetch
            setTimeout(() => {
                fetchSolicitacoes(); 
            }, 2000);

        } catch (error) {
            setAlertMessage("Erro ao confirmar baixa: " + (error.response?.data?.error || error.message));
        } finally {
            setValidationState(prev => ({ ...prev, isSaving: false }));
            setShowPriceUpdateConfirm(false);
            setShowPasswordPrompt(false);
        }
    };


    // --- HELPERS AUXILIARES ---
    const getFuncionarioNome = (id) => employees.find(e => String(e.id) === String(id))?.nome || 'Não informado';
    const getPostoNome = (id) => partners.find(p => String(p.id) === String(id))?.razaoSocial || 'Posto não identificado';
    const getObraNome = (id) => obras.find(o => String(o.id) === String(id))?.nome || 'Obra não identificada';

    const getSafeDateObj = (dateInput) => {
        if (!dateInput) return new Date(0);
        try {
            let dateStr = String(dateInput);
            if (dateStr.includes(' ') && !dateStr.includes('T')) dateStr = dateStr.replace(' ', 'T');
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? new Date(0) : d;
        } catch { return new Date(0); }
    };

    // --- CÁLCULO DE ÚLTIMO ABASTECIMENTO E MÉDIA (VISUAL) ---
    const getLastFuelingInfo = (veiculoId) => {
        if (!refuelings || refuelings.length === 0) return "Histórico indisponível (Lista vazia).";

        const vehicle = vehicles.find(v => String(v.id) === String(veiculoId));
        if (!vehicle) return "Veículo não encontrado.";

        const history = refuelings
            .filter(r => String(r.vehicleId) === String(veiculoId) && (r.status === 'Concluída' || r.status === 'Confirmada'))
            .sort((a, b) => getSafeDateObj(b.data || b.date).getTime() - getSafeDateObj(a.data || a.date).getTime());

        const last = history[0];
        if (!last) return "Nenhum abastecimento anterior registrado.";

        let mediaTexto = "N/A";
        const penultimo = history[1];
        
        if (penultimo) {
            const litros = parseFloat(last.litrosAbastecidos || last.litrosLiberados || 0);
            let diff = 0;
            let unit = 'Km/L';

            const allowed = getAllowedReadingTypes(vehicle.tipo);
            if (allowed.includes('horimetro')) {
                const lastHr = parseFloat(last.horimetro || 0); 
                const prevHr = parseFloat(penultimo.horimetro || 0);
                diff = lastHr - prevHr;
                unit = 'L/h';
            } else {
                const lastKm = parseFloat(last.odometro || 0);
                const prevKm = parseFloat(penultimo.odometro || 0);
                diff = lastKm - prevKm;
            }

            if (diff > 0 && litros > 0) {
                const avg = unit === 'Km/L' ? (diff / litros) : (litros / diff);
                mediaTexto = `${avg.toFixed(2)} ${unit}`;
            } else {
                mediaTexto = 'Incalculável';
            }
        }

        const postoName = last.partnerName || partners.find(p => String(p.id) === String(last.partnerId))?.razaoSocial || "Desconhecido";
        const dateStr = getSafeDateObj(last.data || last.date).toLocaleDateString('pt-BR');
        const fuel = last.fuelType || 'Combustível';
        
        const allowedReadings = getAllowedReadingTypes(vehicle.tipo);
        const isKm = allowedReadings.includes('odometro');
        const readVal = isKm ? (last.odometro || 0) : (last.horimetro || 0);
        const litrosVal = last.litrosAbastecidos || last.litrosLiberados || 0;

        return `Último: ${dateStr} / Posto: ${postoName} / ${litrosVal} L (${fuel}) / Leitura: ${readVal} / Média: ${mediaTexto}`;
    };

    // --- CÁLCULO DE PROGRESSO FINANCEIRO ---
    const getFinancialProgress = (obraId) => {
        if (!obras || obras.length === 0) return "Dados de obras não carregados.";
        
        const obra = obras.find(o => String(o.id) === String(obraId));
        if (!obra) return "Obra não vinculada.";

        const totalGasto = expenses
            .filter(e => String(e.obraId) === String(obraId) && (e.category === 'Combustível' || e.fuelType))
            .reduce((acc, curr) => acc + parseFloat(curr.amount || 0), 0);
            
        const totalContrato = parseFloat(obra.valorContrato || obra.valorTotalContrato || 0);
        const formatMoney = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        if (totalContrato > 0) {
            const pct = ((totalGasto / totalContrato) * 100).toFixed(1);
            return `Gasto Combustível: ${formatMoney(totalGasto)} / Contrato Total: ${formatMoney(totalContrato)} / ${pct}% utilizado`;
        }
        
        return `Gasto Combustível: ${formatMoney(totalGasto)} / Contrato Total: Não definido`;
    };

    // --- AÇÕES ---
    const handleOpenApprovalModal = (s) => {
        setSolicitacaoToApprove(s);
        setModalData(null); 
        setIsOrderModalOpen(true); 
    };

    const handleNegar = async (id) => {
        if (!rejectReason.trim()) {
            alert("É obrigatório informar o motivo da negativa.");
            return;
        }
        try {
            await apiClient.put(`/solicitacoes/${id}/avaliar`, { status: 'NEGADO', motivoNegativa: rejectReason });
            setAlertMessage("Solicitação Negada.");
            setModalData(null);
            setRejectReason('');
            fetchSolicitacoes();
        } catch (error) {
            setAlertMessage("Erro ao negar: " + (error.response?.data?.error || error.message));
        }
    };

    const handleRejeitarComprovante = async (id) => {
        if (!window.confirm("O usuário será notificado para enviar uma nova foto. Confirmar?")) return;
        try {
            await apiClient.put(`/solicitacoes/${id}/rejeitar-comprovante`, {});
            setAlertMessage("Comprovante rejeitado. Usuário notificado.");
            setModalData(null);
            fetchSolicitacoes();
        } catch (error) {
            setAlertMessage("Erro ao rejeitar comprovante: " + (error.response?.data?.error || error.message));
        }
    };

    const getBaseURL = () => {
        if (apiClient.defaults?.baseURL) {
            return apiClient.defaults.baseURL.replace('/api', '');
        }
        return ''; 
    };

    // --- RENDERIZADOR DO MODAL PRINCIPAL ---
    const renderModal = () => {
        if (!modalData) return null;
        const s = modalData;
        const isApproval = s.status === 'PENDENTE';
        const isBaixa = s.status === 'AGUARDANDO_BAIXA';

        const baseURL = getBaseURL();
        const urlPainel = s.foto_painel_path ? `${baseURL}${s.foto_painel_path}` : null;
        const urlCupom = s.foto_cupom_path ? `${baseURL}${s.foto_cupom_path}` : null;

        // Dados para PENDENTE (Visualização apenas)
        const vehicleCurrent = vehicles.find(v => v.id === s.veiculo_id) || {};
        const leituraAtualSistema = parseFloat(s.odometro_informado ? (vehicleCurrent.odometro || 0) : (vehicleCurrent.horimetro || 0));
        const leituraInformada = parseFloat(s.odometro_informado || s.horimetro_informado || 0);
        const diferenca = leituraInformada - leituraAtualSistema;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-2 animate-fadeIn">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col md:flex-row overflow-hidden">
                    
                    {/* COLUNA ESQUERDA: EVIDÊNCIAS */}
                    <div className="md:w-1/2 bg-gray-900 flex flex-col relative">
                        <div className="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/70 to-transparent z-10 flex justify-between items-center text-white">
                            <h4 className="font-bold flex items-center gap-2 text-sm">
                                <ImageIcon size={16}/> {isApproval ? 'Evidência do Painel' : 'Comprovante Fiscal (Cupom/NF)'}
                            </h4>
                            {s.latitude && (
                                <a href={`https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`} target="_blank" rel="noreferrer" className="text-[10px] bg-white/20 hover:bg-white/30 px-2 py-1 rounded-full flex items-center gap-1 transition">
                                    <MapPin size={10}/> Ver Localização GPS
                                </a>
                            )}
                        </div>
                        <div className="flex-1 flex items-center justify-center p-2 bg-black">
                            {isApproval && urlPainel ? (
                                <img src={urlPainel} alt="Painel" className="max-w-full max-h-full object-contain" />
                            ) : isBaixa && urlCupom ? (
                                <img src={urlCupom} alt="Cupom" className="max-w-full max-h-full object-contain" />
                            ) : (
                                <div className="text-gray-500 flex flex-col items-center">
                                    <AlertTriangle size={32} className="mb-2"/>
                                    <p className="text-xs">Imagem indisponível</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* COLUNA DIREITA: DADOS E AÇÃO */}
                    <div className="md:w-1/2 flex flex-col bg-gray-50">
                        <div className="p-3 border-b bg-white">
                            <div className="flex justify-between items-start mb-1">
                                <div>
                                    <h2 className="text-base font-bold text-gray-800 leading-tight">
                                        {isApproval ? 'Análise de Solicitação' : 'Conferência de Baixa (Valores Reais)'}
                                    </h2>
                                    <p className="text-[10px] text-gray-500">#{s.id} • {new Date(s.data_solicitacao).toLocaleString()}</p>
                                </div>
                                <button onClick={() => setModalData(null)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500"><X size={20}/></button>
                            </div>
                            
                            <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                                <p className="font-bold text-gray-800 text-sm leading-tight">{s.veiculo_nome}</p>
                                <p className="text-xs text-gray-600 leading-tight">{s.placa} • {s.solicitante_nome}</p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                            
                            {/* --- SEÇÃO PENDENTE: VISUALIZAÇÃO APENAS --- */}
                            {isApproval && (
                                <>
                                    <div className="bg-white p-2 rounded border shadow-sm">
                                        <div className="flex justify-between items-center mb-1">
                                            <h5 className="text-[10px] font-bold text-gray-400 uppercase">Validar Leitura</h5>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${diferenca < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                Dif: {diferenca > 0 ? '+' : ''}{diferenca.toFixed(1)}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div>
                                                <p className="text-[10px] text-gray-500">Informado</p>
                                                <p className="font-bold text-blue-600">{leituraInformada} {s.odometro_informado ? 'Km' : 'h'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-gray-500">Sistema</p>
                                                <p className="font-bold text-gray-700">{leituraAtualSistema}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-white p-2 rounded border shadow-sm">
                                        <h5 className="text-[10px] font-bold text-gray-400 uppercase mb-1">Detalhes do Pedido</h5>
                                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                                            <div><span className="text-[9px] text-gray-500 block">Combustível</span><span className="font-bold text-gray-800">{s.tipo_combustivel}</span></div>
                                            <div><span className="text-[9px] text-gray-500 block">Quantidade</span><span className="font-bold text-gray-800">{s.flag_tanque_cheio ? 'COMPLETAR' : `${s.litragem_solicitada} L`}</span></div>
                                            <div className="col-span-2 pt-1 border-t border-gray-100"><span className="text-[9px] text-gray-500 block">Posto</span><span className="font-medium text-gray-800">{getPostoNome(s.posto_id)}</span></div>
                                            <div className="col-span-2"><span className="text-[9px] text-gray-500 block">Obra</span><span className="font-medium text-gray-800">{getObraNome(s.obra_id)}</span></div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* --- SEÇÃO AGUARDANDO_BAIXA: FORMULÁRIO EDITÁVEL --- */}
                            {isBaixa && (
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 shadow-inner">
                                    <h5 className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-1">
                                        <Check size={14}/> Dados para Baixa (Preencha conforme Cupom/NF)
                                    </h5>
                                    
                                    <div className="grid grid-cols-2 gap-3 mb-3">
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Nota Fiscal (NF) *</label>
                                            <input 
                                                type="text" 
                                                value={confirmForm.nf} 
                                                onChange={e => setConfirmForm({...confirmForm, nf: e.target.value})} 
                                                className="w-full p-2 border rounded font-bold uppercase focus:ring-2 focus:ring-blue-400 outline-none text-sm" 
                                                placeholder="Nº NF"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Preço Unit. (R$) *</label>
                                            <div className="relative">
                                                <span className="absolute left-2 top-2 text-gray-400 text-xs">R$</span>
                                                <input 
                                                    type="number" 
                                                    step="0.001" 
                                                    value={confirmForm.price} 
                                                    onChange={e => setConfirmForm({...confirmForm, price: e.target.value})} 
                                                    className={`w-full p-2 pl-7 border rounded font-bold focus:ring-2 focus:ring-blue-400 outline-none text-sm ${initialPartnerPrice > 0 && parseFloat(confirmForm.price) !== initialPartnerPrice ? 'bg-yellow-50 border-yellow-300' : ''}`}
                                                    placeholder="0.000"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 mb-3">
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Litros Abastecidos *</label>
                                            <input 
                                                type="number" 
                                                step="0.001" 
                                                value={confirmForm.litros} 
                                                onChange={e => setConfirmForm({...confirmForm, litros: e.target.value})} 
                                                className="w-full p-2 border rounded font-bold focus:ring-2 focus:ring-blue-400 outline-none text-lg text-blue-900"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Leitura Atual ({s.odometro_informado ? 'Km' : 'Hr'}) *</label>
                                            <input 
                                                type="number" 
                                                step="0.1" 
                                                value={confirmForm.reading} 
                                                onChange={e => setConfirmForm({...confirmForm, reading: e.target.value})} 
                                                className={`w-full p-2 border rounded font-bold focus:ring-2 focus:ring-blue-400 outline-none text-lg ${validationState.blockReason ? 'bg-red-50 border-red-300 text-red-900' : 'text-gray-800'}`}
                                            />
                                        </div>
                                    </div>

                                    {relatedOrder?.needsArla && (
                                        <div className="mb-3">
                                            <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Litros Arla 32</label>
                                            <input type="number" step="0.01" value={confirmForm.litrosArla} onChange={e => setConfirmForm({...confirmForm, litrosArla: e.target.value})} className="w-full p-2 border rounded text-sm"/>
                                        </div>
                                    )}

                                    {/* ALERTA DE BLOQUEIO */}
                                    {validationState.blockReason && (
                                        <div className="bg-red-100 text-red-800 p-2 rounded text-xs font-bold border border-red-300 flex items-center gap-2 mb-2 animate-pulse">
                                            <Lock size={14} /> {validationState.blockReason}
                                        </div>
                                    )}

                                    {/* ALERTA DE MÉDIA */}
                                    {validationState.averageAlert && (
                                        <div className="bg-orange-100 text-orange-800 p-2 rounded text-xs font-bold border border-orange-300 flex items-center gap-2 mb-2">
                                            <TrendingDown size={14} /> {validationState.averageAlert}
                                        </div>
                                    )}

                                    {/* MENSAGEM DE VALOR DIFERENTE */}
                                    {showPriceUpdateConfirm && (
                                        <div className="bg-yellow-100 p-2 rounded text-xs border border-yellow-300 mb-2">
                                            <p className="font-bold text-yellow-800 mb-1 flex items-center gap-1"><AlertTriangle size={12}/> Preço diferente do cadastro!</p>
                                            <p className="text-yellow-700 mb-2">Deseja atualizar o preço no cadastro do posto?</p>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleFinalizeBaixa(false)} className="flex-1 bg-white border border-yellow-300 py-1 rounded hover:bg-yellow-50 font-bold">Não, manter antigo</button>
                                                <button onClick={() => handleFinalizeBaixa(true)} className="flex-1 bg-yellow-400 text-yellow-900 py-1 rounded hover:bg-yellow-500 font-bold shadow-sm">Sim, atualizar</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* INFO GERAL DE RODAPÉ (COMUM PARA AMBOS) */}
                            <div className="space-y-1.5 pt-1">
                                <div className="bg-gray-100 p-2 rounded border border-gray-200">
                                    <p className="text-[9px] text-gray-500 uppercase font-bold mb-0.5 flex items-center gap-1"><Clock size={10}/> Último Abastecimento</p>
                                    <p className="text-[10px] text-gray-800 font-mono leading-tight whitespace-pre-wrap">
                                        {getLastFuelingInfo(s.veiculo_id)}
                                    </p>
                                </div>
                                <div className="bg-green-50 p-2 rounded border border-green-200">
                                    <p className="text-[9px] text-green-700 uppercase font-bold mb-0.5 flex items-center gap-1"><TrendingUp size={10}/> Financeiro (Obra)</p>
                                    <p className="text-[10px] text-green-900 font-mono leading-tight whitespace-pre-wrap">
                                        {getFinancialProgress(s.obra_id)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer: Ações */}
                        <div className="p-3 bg-white border-t space-y-2">
                            {isApproval ? (
                                <>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleOpenApprovalModal(s)} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded shadow text-xs flex items-center justify-center gap-1 transition">
                                            <Check size={14}/> APROVAR & GERAR ORDEM
                                        </button>
                                        <button onClick={() => setRejectReason(' ')} className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded border border-red-200 text-xs transition">
                                            Negar...
                                        </button>
                                    </div>
                                    {rejectReason !== '' && (
                                        <div className="animate-slide-up bg-red-50 p-2 rounded border border-red-200 mt-1">
                                            <label className="text-[9px] font-bold text-red-800 mb-1 block">Motivo da Negativa:</label>
                                            <textarea className="w-full p-1 border rounded text-xs focus:ring-1 focus:ring-red-500 outline-none" rows="2" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Ex: Foto ilegível..." autoFocus></textarea>
                                            <div className="flex justify-end gap-2 mt-1">
                                                <button onClick={() => setRejectReason('')} className="text-[9px] text-gray-500 underline">Cancelar</button>
                                                <button onClick={() => handleNegar(s.id)} className="px-2 py-1 bg-red-600 text-white text-[10px] font-bold rounded hover:bg-red-700">Confirmar</button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : isBaixa ? (
                                <div className="flex gap-2 flex-col md:flex-row">
                                    <button 
                                        onClick={() => handleFinalizeBaixa(false)} 
                                        disabled={validationState.isSaving}
                                        className={`flex-1 py-3 text-white font-bold rounded shadow text-sm flex items-center justify-center gap-2 transition ${validationState.blockReason ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                                    >
                                        {validationState.isSaving ? <Loader className="animate-spin" size={18}/> : (validationState.blockReason ? <><Lock size={16}/> DESBLOQUEAR & CONFIRMAR</> : <><Check size={18}/> CONFIRMAR BAIXA & SALVAR</>)}
                                    </button>
                                    
                                    <button onClick={() => handleRejeitarComprovante(s.id)} className="px-4 py-3 bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold rounded border border-orange-200 text-xs flex items-center justify-center gap-1 transition">
                                        <X size={16}/> Rejeitar Foto
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center text-[10px] text-gray-400 py-1">
                                    Solicitação finalizada ({s.status})
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                {/* Modal de Senha para Bloqueios */}
                {showPasswordPrompt && (
                    <PasswordConfirmationModal
                        message={`BLOQUEIO DE SEGURANÇA:\n${validationState.blockReason}\nInsira senha para autorizar a baixa.`}
                        onConfirm={() => handleFinalizeBaixa(false)} 
                        onClose={() => setShowPasswordPrompt(false)}
                        apiClient={apiClient}
                    />
                )}
            </div>
        );
    };

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6 animate-fadeIn">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Smartphone className="text-purple-600" /> Gestão de Solicitações (App)
                    </h1>
                    <p className="text-gray-500 text-sm">Central de aprovação de abastecimentos via Mobile.</p>
                </div>
                
                <div className="flex flex-wrap gap-2 justify-center md:justify-end">
                    <button onClick={() => setFilterStatus('PENDENTE')} className={`px-4 py-2 rounded-lg font-bold text-sm transition flex items-center gap-2 ${filterStatus === 'PENDENTE' ? 'bg-yellow-400 text-gray-900 shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        Pendentes
                        {solicitacoes.filter(s => s.status === 'PENDENTE').length > 0 && (
                            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{solicitacoes.filter(s => s.status === 'PENDENTE').length}</span>
                        )}
                    </button>
                    <button onClick={() => setFilterStatus('AGUARDANDO_BAIXA')} className={`px-4 py-2 rounded-lg font-bold text-sm transition flex items-center gap-2 ${filterStatus === 'AGUARDANDO_BAIXA' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        Baixas
                        {solicitacoes.filter(s => s.status === 'AGUARDANDO_BAIXA').length > 0 && (
                            <span className="bg-blue-800 text-white text-[10px] px-1.5 py-0.5 rounded-full">{solicitacoes.filter(s => s.status === 'AGUARDANDO_BAIXA').length}</span>
                        )}
                    </button>
                    <button onClick={() => setFilterStatus('TODOS')} className={`px-4 py-2 rounded-lg font-bold text-sm transition ${filterStatus === 'TODOS' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        Histórico
                    </button>
                    <button onClick={fetchSolicitacoes} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 border border-gray-200">
                        <RefreshCw size={20} className={loading ? "animate-spin text-blue-600" : "text-gray-600"}/>
                    </button>
                </div>
            </div>

            <div className="relative">
                <input 
                    type="text" 
                    placeholder="Buscar por placa, veículo ou solicitante..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-400 outline-none shadow-sm"
                />
                <Search className="absolute left-3 top-3.5 text-gray-400" size={18} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {loading && filteredSolicitacoes.length === 0 && (
                    <div className="col-span-full py-20 text-center text-gray-400">
                        <Loader className="animate-spin inline mr-2" /> Carregando solicitações...
                    </div>
                )}
                {!loading && filteredSolicitacoes.length === 0 && (
                    <div className="col-span-full py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-center text-gray-400">
                        Nenhuma solicitação encontrada com os filtros atuais.
                    </div>
                )}
                {filteredSolicitacoes.map(s => {
                    let borderColor = 'border-gray-200';
                    let statusColor = 'bg-gray-100 text-gray-600';
                    let statusLabel = s.status.replace('_', ' ');

                    if (s.status === 'PENDENTE') {
                        borderColor = 'border-yellow-300';
                        statusColor = 'bg-yellow-100 text-yellow-800';
                        statusLabel = 'PENDENTE';
                    } else if (s.status === 'AGUARDANDO_BAIXA') {
                        borderColor = 'border-blue-300';
                        statusColor = 'bg-blue-100 text-blue-800';
                    } else if (s.status === 'LIBERADO') {
                        borderColor = 'border-green-300';
                        statusColor = 'bg-green-100 text-green-800';
                    } else if (s.status === 'NEGADO') {
                        borderColor = 'border-red-300';
                        statusColor = 'bg-red-100 text-red-800';
                    }

                    return (
                        <div key={s.id} className={`bg-white rounded-xl shadow-sm border-2 hover:shadow-md transition p-4 relative overflow-hidden group flex flex-col ${borderColor}`}>
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-bold text-gray-400">#{s.id}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${statusColor}`}>
                                    {statusLabel}
                                </span>
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-gray-800 text-lg truncate" title={s.veiculo_nome}>{s.veiculo_nome}</h3>
                                <p className="text-sm text-gray-600 font-medium mb-3">{s.placa}</p>
                                <div className="space-y-1 text-xs text-gray-500 mb-3 bg-gray-50 p-2 rounded">
                                    <div className="flex justify-between">
                                        <span>Solicitante:</span>
                                        <span className="font-bold text-gray-700 truncate max-w-[100px]">{s.solicitante_nome}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Posto:</span>
                                        <span className="font-bold text-gray-700 truncate max-w-[100px]">{s.posto_nome || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between pt-1 border-t border-gray-200 mt-1">
                                        <span>Pedido:</span>
                                        <span className="font-bold text-gray-900">
                                            {s.litragem_solicitada ? `${s.litragem_solicitada}L` : 'Cheio'} • {s.tipo_combustivel}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-2 pt-2 border-t">
                                {(s.status === 'PENDENTE' || s.status === 'AGUARDANDO_BAIXA') ? (
                                    <button onClick={() => setModalData(s)} className="w-full bg-gray-900 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-gray-800 flex items-center justify-center gap-2 transition">
                                        <Eye size={16}/> {s.status === 'PENDENTE' ? 'AVALIAR' : 'CONFERIR & BAIXAR'}
                                    </button>
                                ) : (
                                    <div className="text-center text-xs text-gray-400 py-1">
                                        Processado em {s.data_aprovacao ? new Date(s.data_aprovacao).toLocaleDateString() : '-'}\r
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {renderModal()}

            {/* MODAL DE ORDEM UNIFICADO (ABERTO APÓS APROVAÇÃO) */}
            {isOrderModalOpen && solicitacaoToApprove && (
                <RefuelingOrderModal
                    user={user}
                    orderToEdit={null} 
                    solicitacaoData={solicitacaoToApprove} 
                    vehicles={vehicles}
                    obras={obras}
                    partners={partners}
                    employees={employees}
                    refuelings={refuelings}
                    expenses={expenses}
                    onClose={() => {
                        setIsOrderModalOpen(false);
                        setSolicitacaoToApprove(null);
                        fetchSolicitacoes(); 
                    }}
                    setAlertMessage={setAlertMessage}
                    onGeneratePDF={generateAuthorizationPDF}
                    extraObraOptions={[]}
                    ConfirmationModal={ConfirmationModal}
                    PasswordConfirmationModal={PasswordConfirmationModal}
                    vehicleGroups={vehicleGroups}
                    apiClient={apiClient}
                    reloadData={() => {
                        reloadData(); 
                        fetchSolicitacoes(); 
                    }}
                />
            )}
        </div>
    );
};

export default AdminSolicitacoesPage;