import React, { useState, useEffect } from 'react';
import { 
    Check, X, AlertTriangle, MapPin, Eye, Fuel, 
    Calendar, Loader, Search, RefreshCw, Smartphone, DollarSign, Image as ImageIcon,
    ExternalLink, BarChart3, Clock, TrendingUp, Lock, Save
} from 'lucide-react';
import { jsPDF } from 'jspdf'; 
import autoTable from 'jspdf-autotable'; 
import { getAllowedReadingTypes } from '../utils/vehicleRules';
import RefuelingOrderModal from '../components/modals/RefuelingOrderModal';

// NOTA: ConfirmRefuelingModal foi removido pois a lógica agora é interna (inline)

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
    ConfirmationModal, // Mantido caso precise para outras coisas, mas não usado na baixa
    reloadData 
}) => {
    
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [filteredSolicitacoes, setFilteredSolicitacoes] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Controle do Modal de Detalhes
    const [modalData, setModalData] = useState(null); 
    const [rejectReason, setRejectReason] = useState('');
    
    // Controle do Modal de Emissão (Aprovação - PENDENTE)
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [solicitacaoToApprove, setSolicitacaoToApprove] = useState(null);

    // --- ESTADOS PARA O FLUXO DE BAIXA INTEGRADA (AGUARDANDO_BAIXA) ---
    const [confirmData, setConfirmData] = useState({
        litros: '',
        litrosArla: '',
        precoUnitario: '',
        invoiceNumber: '',
        leitura: '',
        outrosValor: ''
    });
    
    // Estados auxiliares da Baixa
    const [initialPartnerPrice, setInitialPartnerPrice] = useState(0);
    const [relatedOrder, setRelatedOrder] = useState(null); // A ordem de abastecimento vinculada à solicitação
    const [blockReason, setBlockReason] = useState(null);   // Motivo de bloqueio (ex: km regrediu)
    const [averageAlert, setAverageAlert] = useState(null); // Alerta de média (apenas visual)
    const [isSavingBaixa, setIsSavingBaixa] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showPriceUpdateConfirm, setShowPriceUpdateConfirm] = useState(false); // Mini-modal de confirmação de preço

    // Filtros da Tela
    const [filterStatus, setFilterStatus] = useState('PENDENTE'); 
    const [searchTerm, setSearchTerm] = useState('');

    // --- 1. CARREGAMENTO DE DADOS ---
    const fetchSolicitacoes = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/solicitacoes');
            setSolicitacoes(Array.isArray(res) ? res : []);
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
    }, []);

    // --- 2. FILTROS DA LISTA ---
    useEffect(() => {
        let list = [...solicitacoes];
        
        if (filterStatus !== 'TODOS') {
            list = list.filter(s => s.status === filterStatus);
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


    // --- 3. LÓGICA DE INICIALIZAÇÃO DO MODAL DE BAIXA ---
    // Toda vez que modalData muda (abre modal), se for BAIXA, prepara os dados.
    useEffect(() => {
        if (modalData && modalData.status === 'AGUARDANDO_BAIXA') {
            // Tenta encontrar a ordem de abastecimento criada a partir desta solicitação
            const order = refuelings.find(r => {
                // Link direto
                if (r.createdFromSolicitacaoId && String(r.createdFromSolicitacaoId) === String(modalData.id)) return true;
                // Link via JSON no createdBy (legado/compatibilidade)
                if (r.createdBy) {
                    try { 
                        const creator = typeof r.createdBy === 'string' ? JSON.parse(r.createdBy) : r.createdBy;
                        if (creator && String(creator.linkedSolicitacaoId) === String(modalData.id)) return true;
                    } catch (e) { return false; }
                }
                return false;
            });

            setRelatedOrder(order);

            // Define valores iniciais
            // Se achou a ordem, usa dados dela. Se não, usa da solicitação como fallback.
            let currentPrice = '';
            let fuelType = modalData.tipo_combustivel;
            let partnerId = modalData.posto_id;

            if (order) {
                fuelType = order.fuelType;
                partnerId = order.partnerId;
            }

            // Busca preço atual do posto
            if (partners.length > 0 && partnerId && fuelType) {
                const partner = partners.find(p => String(p.id) === String(partnerId));
                if (partner && partner.fuel_prices) {
                    currentPrice = partner.fuel_prices[fuelType] || '';
                }
            }

            setInitialPartnerPrice(parseFloat(currentPrice) || 0);

            // Preenche o formulário
            setConfirmData({
                litros: (order && order.litrosLiberados) ? order.litrosLiberados : modalData.litragem_solicitada || '',
                litrosArla: (order && order.litrosLiberadosArla) ? order.litrosLiberadosArla : '',
                precoUnitario: currentPrice,
                invoiceNumber: (order && order.invoiceNumber) ? order.invoiceNumber : '',
                leitura: modalData.odometro_informado || modalData.horimetro_informado || '',
                outrosValor: ''
            });

        } else {
            // Limpa estados se fechar ou for outro status
            setRelatedOrder(null);
            setBlockReason(null);
            setAverageAlert(null);
            setConfirmData({
                litros: '', litrosArla: '', precoUnitario: '', invoiceNumber: '', leitura: '', outrosValor: ''
            });
        }
    }, [modalData, refuelings, partners]);


    // --- 4. LÓGICA DE VALIDAÇÃO EM TEMPO REAL (Média e Bloqueios) ---
    useEffect(() => {
        setBlockReason(null);
        setAverageAlert(null);

        // Só valida se estiver no modo de baixa e tiver dados
        if (!modalData || modalData.status !== 'AGUARDANDO_BAIXA') return;

        const vehicle = vehicles.find(v => v.id === modalData.veiculo_id);
        if (!vehicle) return;

        // A. Validação de Leitura (Regressão e Salto)
        if (confirmData.leitura) {
            const allowedTypes = getAllowedReadingTypes(vehicle.tipo);
            const isKm = allowedTypes.includes('odometro');
            const isHr = allowedTypes.includes('horimetro');
            
            let last = 0;
            if (isKm) {
                last = parseFloat(vehicle.odometro || 0);
            } else {
                last = parseFloat(vehicle.horimetro || 0);
                if (last === 0) last = parseFloat(vehicle.horimetroDigital || 0);
            }

            const current = parseFloat(confirmData.leitura);
            
            if (!isNaN(current) && last > 0) {
                if (current <= last) {
                    setBlockReason(`Leitura (${current}) menor ou igual à atual do sistema (${last}).`);
                } else if (isHr && (current - last) > 50) {
                    setBlockReason(`Salto excessivo de Horímetro (> 50h). Diferença: ${(current - last).toFixed(1)}h`);
                } else if (isKm && (current - last) > 1000) {
                    setBlockReason(`Salto excessivo de Km (> 1000). Diferença: ${(current - last).toFixed(1)}km`);
                }
            }
        }

        // B. Alerta de Média
        if (confirmData.litros && confirmData.leitura && parseFloat(confirmData.litros) > 0) {
            // Busca histórico para calcular média
            const history = refuelings
                .filter(r => r.vehicleId === modalData.veiculo_id && r.status === 'Concluída')
                .sort((a,b) => new Date(b.data || 0) - new Date(a.data || 0));
            
            if (history.length > 0) {
                const currentReading = parseFloat(confirmData.leitura);
                const lastRefuel = history[0];
                const lastReading = parseFloat(lastRefuel.horimetro || lastRefuel.horimetroDigital || lastRefuel.odometro || 0);

                if (currentReading > lastReading) {
                    const diff = currentReading - lastReading;
                    const currentAvg = diff / parseFloat(confirmData.litros);
                    
                    // Calcula média histórica simples (últimos 3 abastecimentos válidos)
                    let sumAvgs = 0;
                    let count = 0;
                    for (let i = 0; i < Math.min(history.length - 1, 3); i++) {
                        const rCurr = history[i];
                        const rPrev = history[i+1];
                        const l = parseFloat(rCurr.litrosAbastecidos || 0);
                        const vCurr = parseFloat(rCurr.horimetro || rCurr.horimetroDigital || rCurr.odometro || 0);
                        const vPrev = parseFloat(rPrev.horimetro || rPrev.horimetroDigital || rPrev.odometro || 0);
                        if (l > 0 && vCurr > vPrev) {
                            sumAvgs += (vCurr - vPrev) / l;
                            count++;
                        }
                    }

                    if (count > 0) {
                        const baseline = sumAvgs / count;
                        // Se cair mais de 25% da média
                        if (currentAvg < (baseline * 0.75)) {
                            setAverageAlert(`Queda de Rendimento > 25% (Atual: ${currentAvg.toFixed(2)} / Média Histórica: ${baseline.toFixed(2)})`);
                        }
                    }
                }
            }
        }

    }, [confirmData.leitura, confirmData.litros, modalData, vehicles, refuelings]);


    // --- 5. AÇÕES E SUBMISSÃO ---
    
    // Preparação para Salvar
    const handlePreConfirmBaixa = () => {
        // Se não tiver ordem relacionada encontrada, tenta recuperar ou avisar
        if (!relatedOrder) {
            setAlertMessage("AVISO CRÍTICO: Não foi possível localizar a Ordem de Abastecimento original no sistema. A baixa não pode ser vinculada.");
            return;
        }

        // Validação de Campos Obrigatórios
        if (!confirmData.litros || parseFloat(confirmData.litros) <= 0) {
            setAlertMessage("Informe a quantidade de litros.");
            return;
        }
        if (!confirmData.precoUnitario || parseFloat(confirmData.precoUnitario) <= 0) {
            setAlertMessage("Informe o preço unitário.");
            return;
        }
        if (!confirmData.leitura || parseFloat(confirmData.leitura) <= 0) {
            setAlertMessage("Informe a leitura do odômetro/horímetro.");
            return;
        }

        // Verifica duplicação de NF (se informada)
        if (confirmData.invoiceNumber) {
            const isDup = refuelings.some(r => 
                r.partnerId === relatedOrder.partnerId && 
                r.invoiceNumber === confirmData.invoiceNumber && 
                r.id !== relatedOrder.id
            );
            if (isDup) {
                setAlertMessage(`Nota Fiscal ${confirmData.invoiceNumber} já existe lançada para este posto.`);
                return;
            }
        }

        // Se houver bloqueio, pede senha
        if (blockReason) {
            setShowPasswordModal(true);
            return;
        }

        checkPriceAndSubmit();
    };

    // Verifica Preço antes de salvar
    const checkPriceAndSubmit = () => {
        setShowPasswordModal(false); // Fecha modal de senha se estava aberto
        
        const inputPrice = parseFloat(confirmData.precoUnitario);
        
        // Se o preço mudou mais de 1 centavo em relação ao cadastro
        if (initialPartnerPrice > 0 && inputPrice > 0 && Math.abs(inputPrice - initialPartnerPrice) > 0.01) {
            setShowPriceUpdateConfirm(true); // Exibe mini-modal
        } else {
            executeFinalConfirm(false);
        }
    };

    // Executa a confirmação final na API
    const executeFinalConfirm = async (updatePartnerPrice) => {
        setShowPriceUpdateConfirm(false);
        setIsSavingBaixa(true);
        try {
            const payload = {
                litrosAbastecidos: parseFloat(confirmData.litros) || 0,
                litrosAbastecidosArla: relatedOrder.needsArla ? (parseFloat(confirmData.litrosArla) || 0) : 0,
                pricePerLiter: parseFloat(confirmData.precoUnitario) || 0,
                confirmedReading: parseFloat(confirmData.leitura) || 0,
                confirmedBy: user,
                outrosValor: relatedOrder.outrosGeraValor ? (parseFloat(confirmData.outrosValor) || 0) : 0,
                invoiceNumber: confirmData.invoiceNumber,
                updatePartnerPrice: updatePartnerPrice
            };

            await apiClient.confirmRefuelingOrder(relatedOrder.id, payload);
            setAlertMessage("Abastecimento confirmado e baixa realizada com sucesso!");
            
            // Limpeza e Atualização
            setModalData(null);
            reloadData(); // Atualiza dados globais (veículos, despesas)
            fetchSolicitacoes(); // Atualiza a lista local
        } catch (error) {
            setAlertMessage("Erro ao confirmar: " + error.message);
        } finally {
            setIsSavingBaixa(false);
        }
    };


    // --- FUNÇÕES AUXILIARES DE DISPLAY ---
    const getFuncionarioNome = (id) => employees.find(e => String(e.id) === String(id))?.nome || 'Não informado';
    const getPostoNome = (id) => partners.find(p => String(p.id) === String(id))?.razaoSocial || 'Posto não identificado';
    const getObraNome = (id) => obras.find(o => String(o.id) === String(id))?.nome || 'Obra não identificada';
    
    // Gerador de PDF (para Aprovação)
    const generateAuthorizationPDF = async (orderData, vehiclesList, partnersList, employeesList, groups, returnBlob = false) => {
        const doc = new jsPDF();
        const vehicle = vehiclesList.find(v => v.id === orderData.vehicleId) || {};
        const partner = partnersList.find(p => p.id === orderData.partnerId) || {};
        const employee = employeesList.find(e => e.id === orderData.employeeId) || {};
        const obra = obras.find(o => o.id === orderData.obraId) || {};

        doc.setFont("helvetica", "bold"); doc.setFontSize(18);
        doc.text("AUTORIZAÇÃO DE ABASTECIMENTO", 105, 20, { align: "center" });
        doc.setFontSize(12); doc.setFont("helvetica", "normal");
        doc.text(`Nº ORDEM: ${orderData.authNumber}`, 105, 30, { align: "center" });
        const dateStr = orderData.date ? new Date(orderData.date).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
        doc.text(`Data de Emissão: ${dateStr}`, 14, 45);

        const tableBody = [
            ['Posto Autorizado', partner.razaoSocial || 'Não informado'],
            ['Veículo / Equipamento', `${vehicle.modelo || ''} - ${vehicle.placa || ''} (${vehicle.registroInterno || 'S/N'})`],
            ['Motorista / Operador', employee.nome || 'Não informado'],
            ['Obra / Centro de Custo', obra.nome || 'Não informado'],
            ['Combustível', orderData.fuelType ? orderData.fuelType.toUpperCase() : 'N/A'],
            ['Quantidade', orderData.isFillUp ? 'COMPLETAR TANQUE' : `${orderData.litrosLiberados} Litros`],
        ];
        if (orderData.odometro) tableBody.push(['Odômetro Atual', `${orderData.odometro} Km`]);
        if (orderData.horimetro) tableBody.push(['Horímetro Atual', `${orderData.horimetro} Hr`]);
        if (orderData.needsArla) tableBody.push(['Arla 32', orderData.isFillUpArla ? 'COMPLETAR' : `${orderData.litrosLiberadosArla} Litros`]);
        if (orderData.outros) tableBody.push(['Observações', orderData.outros]);

        autoTable(doc, {
            startY: 50, head: [['Campo', 'Detalhe']], body: tableBody, theme: 'grid', headStyles: { fillColor: [41, 128, 185] }, styles: { fontSize: 11, cellPadding: 3 }
        });

        const finalY = doc.lastAutoTable.finalY + 40;
        doc.setLineWidth(0.5); doc.line(20, finalY, 90, finalY); doc.line(120, finalY, 190, finalY);
        doc.setFontSize(10); doc.text("Assinatura do Responsável (Frotas)", 55, finalY + 5, { align: "center" });
        doc.text("Assinatura do Motorista", 155, finalY + 5, { align: "center" });
        doc.setFontSize(8); doc.text("Sistema de Gestão de Frotas MAK - Documento Gerado Eletronicamente", 105, 280, { align: "center" });

        if (returnBlob) return doc.output('blob');
        else doc.save(`Ordem_${orderData.authNumber}_${vehicle.registroInterno || 'Veiculo'}.pdf`);
    };

    // Ações do Modal de Detalhes
    const handleOpenApprovalModal = (s) => {
        setSolicitacaoToApprove(s);
        setModalData(null); 
        setIsOrderModalOpen(true); 
    };

    const handleNegar = async (id) => {
        if (!rejectReason.trim()) { alert("É obrigatório informar o motivo da negativa."); return; }
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
        if (apiClient.defaults?.baseURL) return apiClient.defaults.baseURL.replace('/api', '');
        return ''; 
    };


    // --- RENDERIZAÇÃO DO MODAL DE DETALHES ---
    const renderModal = () => {
        if (!modalData) return null;
        
        const s = modalData;
        const isApproval = s.status === 'PENDENTE';
        const isBaixa = s.status === 'AGUARDANDO_BAIXA';
        
        // Definição da URL das imagens
        const baseURL = getBaseURL();
        const urlPainel = s.foto_painel_path ? `${baseURL}${s.foto_painel_path}` : null;
        const urlCupom = s.foto_cupom_path ? `${baseURL}${s.foto_cupom_path}` : null;
        
        const vehicleCurrent = vehicles.find(v => v.id === s.veiculo_id) || {};
        const leituraAtualSistema = parseFloat(vehicleCurrent.odometro || vehicleCurrent.horimetro || 0);

        return (
            <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-2 animate-fadeIn">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col md:flex-row overflow-hidden">
                    
                    {/* COLUNA ESQUERDA: EVIDÊNCIAS (FOTOS) */}
                    <div className="md:w-1/2 bg-gray-900 flex flex-col relative">
                        <div className="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/70 to-transparent z-10 flex justify-between items-center text-white">
                            <h4 className="font-bold flex items-center gap-2 text-sm">
                                <ImageIcon size={16}/> {isApproval ? 'Evidência do Painel' : 'Comprovante Fiscal (Cupom)'}
                            </h4>
                            {s.latitude && (
                                <a href={`https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`} target="_blank" rel="noreferrer" className="text-[10px] bg-white/20 hover:bg-white/30 px-2 py-1 rounded-full flex items-center gap-1 transition">
                                    <MapPin size={10}/> Ver GPS
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
                    <div className="md:w-1/2 flex flex-col bg-gray-50 relative">
                        {/* Header do Modal */}
                        <div className="p-3 border-b bg-white">
                            <div className="flex justify-between items-start mb-1">
                                <div>
                                    <h2 className="text-base font-bold text-gray-800 leading-tight">
                                        {isApproval ? 'Análise de Solicitação' : 'Conferência de Baixa'}
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

                        {/* CORPO ROLÁVEL */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                            
                            {/* --- CONDICIONAL: SE FOR BAIXA, MOSTRA FORMULÁRIO DE EDIÇÃO --- */}
                            {isBaixa ? (
                                <div className="bg-white p-3 rounded-lg border border-blue-200 shadow-sm space-y-3 relative">
                                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                                        <div className="bg-blue-100 p-1.5 rounded-full text-blue-600"><Fuel size={16}/></div>
                                        <h3 className="font-bold text-gray-800 text-sm">Dados Reais (Cupom)</h3>
                                    </div>

                                    {/* ALERTAS VISUAIS INLINE */}
                                    {blockReason && (
                                        <div className="bg-red-50 text-red-700 p-2 rounded text-[10px] font-bold border border-red-200 flex items-center gap-1 animate-pulse">
                                            <Lock size={12}/> BLOQUEIO DETECTADO: {blockReason}
                                        </div>
                                    )}
                                    {averageAlert && !blockReason && (
                                        <div className="bg-orange-50 text-orange-800 p-2 rounded text-[10px] font-medium border border-orange-200 flex items-center gap-1">
                                            <TrendingUp size={12}/> {averageAlert}
                                        </div>
                                    )}

                                    {/* GRID DE INPUTS */}
                                    <div className="grid grid-cols-2 gap-3">
                                        
                                        {/* 1. NOTA FISCAL */}
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-600 mb-1">Nota Fiscal (NF)</label>
                                            <input 
                                                type="text" 
                                                value={confirmData.invoiceNumber}
                                                onChange={e => setConfirmData({...confirmData, invoiceNumber: e.target.value})}
                                                className="w-full p-2 border rounded font-bold uppercase focus:ring-2 focus:ring-blue-400 outline-none text-xs"
                                                placeholder="NÚMERO DA NF"
                                            />
                                        </div>

                                        {/* 2. PREÇO UNITÁRIO */}
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-600 mb-1">Preço Unit. (R$)</label>
                                            <input 
                                                type="number" step="0.001"
                                                value={confirmData.precoUnitario}
                                                onChange={e => setConfirmData({...confirmData, precoUnitario: e.target.value})}
                                                className={`w-full p-2 border rounded font-bold focus:ring-2 focus:ring-blue-400 outline-none text-xs ${initialPartnerPrice > 0 && Math.abs(parseFloat(confirmData.precoUnitario) - initialPartnerPrice) > 0.01 ? 'bg-yellow-50 border-yellow-300 text-yellow-800' : ''}`}
                                            />
                                            {initialPartnerPrice > 0 && (
                                                <p className="text-[9px] text-gray-400 text-right mt-0.5">
                                                    Cadastrado: {initialPartnerPrice.toFixed(3)}
                                                </p>
                                            )}
                                        </div>
                                        
                                        {/* 3. LITROS E ARLA */}
                                        <div className="col-span-2 grid grid-cols-2 gap-3 bg-gray-50 p-2 rounded border border-gray-200">
                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-600 mb-1">Litros ({s.tipo_combustivel})</label>
                                                <input 
                                                    type="number" step="0.001"
                                                    value={confirmData.litros}
                                                    onChange={e => setConfirmData({...confirmData, litros: e.target.value})}
                                                    className="w-full p-2 border rounded font-bold text-blue-700 focus:ring-2 focus:ring-blue-400 outline-none text-sm"
                                                />
                                            </div>
                                            {/* Mostra Arla se a ordem vinculada pedir ou se o veículo usar */}
                                            {(relatedOrder?.needsArla || confirmData.litrosArla) && (
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Litros Arla 32</label>
                                                    <input 
                                                        type="number" step="0.01"
                                                        value={confirmData.litrosArla}
                                                        onChange={e => setConfirmData({...confirmData, litrosArla: e.target.value})}
                                                        className="w-full p-2 border rounded font-bold text-purple-700 focus:ring-2 focus:ring-purple-400 outline-none text-sm"
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* 4. LEITURA (ODÔMETRO/HORÍMETRO) */}
                                        <div className="col-span-2">
                                            <label className="block text-[10px] font-bold text-gray-600 mb-1">Leitura Painel (Km/Hr)</label>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="number" step="0.1"
                                                    value={confirmData.leitura}
                                                    onChange={e => setConfirmData({...confirmData, leitura: e.target.value})}
                                                    className="flex-1 p-2 border rounded font-bold text-gray-800 focus:ring-2 focus:ring-blue-400 outline-none text-sm"
                                                />
                                                <div className="bg-gray-100 px-3 py-1 rounded border flex flex-col justify-center items-end min-w-[80px]">
                                                    <span className="text-[9px] text-gray-500">Sistema</span>
                                                    <span className="text-[10px] font-bold text-gray-700">{leituraAtualSistema}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 5. VALORES EXTRAS */}
                                        {relatedOrder?.outrosGeraValor && (
                                            <div className="col-span-2 bg-yellow-50 p-2 rounded border border-yellow-200">
                                                <label className="block text-[10px] font-bold text-yellow-900 mb-1">Valor "{relatedOrder.outros}" (R$)</label>
                                                <input 
                                                    type="number" step="0.01"
                                                    value={confirmData.outrosValor}
                                                    onChange={e => setConfirmData({...confirmData, outrosValor: e.target.value})}
                                                    className="w-full p-2 border border-yellow-400 rounded bg-white font-bold text-yellow-900 outline-none text-sm"
                                                />
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Resumo Financeiro Rápido */}
                                    <div className="flex justify-between items-center pt-2 border-t border-dashed mt-1">
                                        <span className="text-xs text-gray-500">Total Estimado:</span>
                                        <span className="text-sm font-bold text-green-700">
                                            {((parseFloat(confirmData.litros || 0) * parseFloat(confirmData.precoUnitario || 0)) + (parseFloat(confirmData.outrosValor || 0))).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                /* --- SE NÃO FOR BAIXA (APROVAÇÃO/HISTÓRICO), MOSTRA APENAS LEITURA --- */
                                <div className="bg-white p-2 rounded border shadow-sm">
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                                        <div><span className="text-[9px] text-gray-500 block">Combustível</span><span className="font-bold text-gray-800">{s.tipo_combustivel}</span></div>
                                        <div><span className="text-[9px] text-gray-500 block">Qtd Solicitada</span><span className="font-bold text-gray-800">{s.flag_tanque_cheio ? 'COMPLETAR' : `${s.litragem_solicitada} L`}</span></div>
                                        <div className="col-span-2 pt-1 border-t mt-1"><span className="text-[9px] text-gray-500 block">Posto</span><span className="font-medium text-gray-800 text-[11px]">{getPostoNome(s.posto_id)}</span></div>
                                        <div className="col-span-2"><span className="text-[9px] text-gray-500 block">Motorista</span><span className="font-medium text-purple-700 text-[11px]">{getFuncionarioNome(s.funcionario_id)}</span></div>
                                    </div>
                                </div>
                            )}

                            {/* Informações Auxiliares (Sempre visíveis) */}
                             <div className="bg-gray-100 p-2 rounded border border-gray-200 mt-2">
                                <p className="text-[9px] text-gray-500 uppercase font-bold mb-0.5 flex items-center gap-1"><Clock size={10}/> Último Abastecimento</p>
                                <p className="text-[10px] text-gray-800 font-mono leading-tight whitespace-pre-wrap">
                                    {(() => {
                                        const hist = refuelings.filter(r => r.vehicleId === s.veiculo_id && r.status === 'Concluída').sort((a,b) => new Date(b.data) - new Date(a.data))[0];
                                        return hist ? `${new Date(hist.data).toLocaleDateString()} - ${hist.litrosAbastecidos}L` : 'Sem histórico recente';
                                    })()}
                                </p>
                            </div>
                        </div>

                        {/* FOOTER: BOTÕES DE AÇÃO */}
                        <div className="p-3 bg-white border-t space-y-2">
                            {isApproval ? (
                                <div className="flex gap-2">
                                    <button onClick={() => handleOpenApprovalModal(s)} className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded shadow text-xs flex items-center justify-center gap-1 transition">
                                        <Check size={16}/> APROVAR & GERAR ORDEM
                                    </button>
                                    <button onClick={() => setRejectReason(' ')} className="px-4 py-3 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded border border-red-200 text-xs transition">
                                        Negar
                                    </button>
                                </div>
                            ) : isBaixa ? (
                                <div className="space-y-2">
                                    {/* BOTÃO DE CONFIRMAÇÃO PRINCIPAL */}
                                    <button 
                                        onClick={handlePreConfirmBaixa} 
                                        disabled={isSavingBaixa}
                                        className={`w-full py-3 text-white font-bold rounded shadow-md text-sm flex items-center justify-center gap-2 transition ${blockReason ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                                    >
                                        {isSavingBaixa ? <Loader className="animate-spin" size={18}/> : blockReason ? <Lock size={18}/> : <Save size={18}/>}
                                        {blockReason ? 'LIBERAR TRAVA & SALVAR' : 'CONFIRMAR BAIXA & SALVAR'}
                                    </button>
                                    
                                    <button onClick={() => handleRejeitarComprovante(s.id)} className="w-full py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold rounded border border-orange-200 text-xs flex items-center justify-center gap-1 transition">
                                        <X size={14}/> Rejeitar Foto (Solicitar Nova)
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center text-[10px] text-gray-400 py-1">Solicitação finalizada ({s.status})</div>
                            )}

                            {/* Área de Motivo de Negativa (Condicional) */}
                            {isApproval && rejectReason !== '' && (
                                <div className="animate-slide-up bg-red-50 p-2 rounded border border-red-200 mt-1">
                                    <textarea className="w-full p-1 border rounded text-xs focus:ring-1 focus:ring-red-500 outline-none" rows="2" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Motivo da negativa..." autoFocus></textarea>
                                    <div className="flex justify-end gap-2 mt-1">
                                        <button onClick={() => setRejectReason('')} className="text-[9px] text-gray-500 underline">Cancelar</button>
                                        <button onClick={() => handleNegar(s.id)} className="px-2 py-1 bg-red-600 text-white text-[10px] font-bold rounded hover:bg-red-700">Confirmar</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* MINI-MODAL SOBREPOSTO PARA CONFIRMAÇÃO DE PREÇO (In-Layout) */}
                        {showPriceUpdateConfirm && (
                            <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
                                <div className="bg-yellow-100 p-3 rounded-full mb-3 text-yellow-600"><DollarSign size={24}/></div>
                                <h3 className="text-sm font-bold text-gray-800 mb-1">O preço mudou!</h3>
                                <p className="text-xs text-gray-600 mb-4 px-4">O valor informado (R$ {confirmData.precoUnitario}) é diferente do cadastro do posto (R$ {initialPartnerPrice.toFixed(3)}). Deseja atualizar o cadastro do posto?</p>
                                <div className="flex gap-2 w-full max-w-xs">
                                    <button onClick={() => executeFinalConfirm(false)} className="flex-1 py-2 bg-gray-100 text-gray-700 font-bold rounded text-xs hover:bg-gray-200">Manter Antigo</button>
                                    <button onClick={() => executeFinalConfirm(true)} className="flex-1 py-2 bg-yellow-400 text-gray-900 font-bold rounded text-xs hover:bg-yellow-500 shadow-sm">Sim, Atualizar</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6 animate-fadeIn">
            {/* 1. Header da Página */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Smartphone className="text-purple-600" /> Gestão de Solicitações
                    </h1>
                    <p className="text-gray-500 text-sm">Central de aprovação e baixa via Mobile.</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center md:justify-end">
                    <button onClick={() => setFilterStatus('PENDENTE')} className={`px-4 py-2 rounded-lg font-bold text-sm transition ${filterStatus === 'PENDENTE' ? 'bg-yellow-400 text-gray-900 shadow-md' : 'bg-gray-100 text-gray-600'}`}>
                        Pendentes {solicitacoes.filter(s => s.status === 'PENDENTE').length > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{solicitacoes.filter(s => s.status === 'PENDENTE').length}</span>}
                    </button>
                    <button onClick={() => setFilterStatus('AGUARDANDO_BAIXA')} className={`px-4 py-2 rounded-lg font-bold text-sm transition ${filterStatus === 'AGUARDANDO_BAIXA' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}>
                        Conferir Baixas {solicitacoes.filter(s => s.status === 'AGUARDANDO_BAIXA').length > 0 && <span className="ml-1 bg-blue-800 text-white text-[10px] px-1.5 py-0.5 rounded-full">{solicitacoes.filter(s => s.status === 'AGUARDANDO_BAIXA').length}</span>}
                    </button>
                    <button onClick={() => setFilterStatus('TODOS')} className={`px-4 py-2 rounded-lg font-bold text-sm transition ${filterStatus === 'TODOS' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>Histórico</button>
                    <button onClick={fetchSolicitacoes} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 border border-gray-200"><RefreshCw size={20} className={loading ? "animate-spin text-blue-600" : "text-gray-600"}/></button>
                </div>
            </div>

            {/* 2. Barra de Busca */}
            <div className="relative">
                <input type="text" placeholder="Buscar por placa, veículo ou solicitante..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-400 outline-none shadow-sm"/>
                <Search className="absolute left-3 top-3.5 text-gray-400" size={18} />
            </div>

            {/* 3. Grid de Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredSolicitacoes.map(s => {
                    let borderColor = 'border-gray-200';
                    let statusColor = 'bg-gray-100 text-gray-600';
                    if (s.status === 'PENDENTE') { borderColor = 'border-yellow-300'; statusColor = 'bg-yellow-100 text-yellow-800'; }
                    else if (s.status === 'AGUARDANDO_BAIXA') { borderColor = 'border-blue-300'; statusColor = 'bg-blue-100 text-blue-800'; }
                    else if (s.status === 'LIBERADO') { borderColor = 'border-green-300'; statusColor = 'bg-green-100 text-green-800'; }
                    else if (s.status === 'NEGADO') { borderColor = 'border-red-300'; statusColor = 'bg-red-100 text-red-800'; }

                    return (
                        <div key={s.id} className={`bg-white rounded-xl shadow-sm border-2 hover:shadow-md transition p-4 relative overflow-hidden flex flex-col ${borderColor}`}>
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-bold text-gray-400">#{s.id}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${statusColor}`}>{s.status.replace('_', ' ')}</span>
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-gray-800 text-lg truncate" title={s.veiculo_nome}>{s.veiculo_nome}</h3>
                                <p className="text-sm text-gray-600 font-medium mb-3">{s.placa}</p>
                                <div className="space-y-1 text-xs text-gray-500 mb-3 bg-gray-50 p-2 rounded">
                                    <div className="flex justify-between"><span>Solicitante:</span><span className="font-bold text-gray-700 truncate max-w-[100px]">{s.solicitante_nome}</span></div>
                                    <div className="flex justify-between"><span>Posto:</span><span className="font-bold text-gray-700 truncate max-w-[100px]">{s.posto_nome || 'N/A'}</span></div>
                                </div>
                            </div>
                            <div className="mt-2 pt-2 border-t">
                                {(s.status === 'PENDENTE' || s.status === 'AGUARDANDO_BAIXA') ? (
                                    <button onClick={() => setModalData(s)} className={`w-full px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition ${s.status === 'AGUARDANDO_BAIXA' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-900 hover:bg-gray-800 text-white'}`}>
                                        <Eye size={16}/> {s.status === 'AGUARDANDO_BAIXA' ? 'CONFERIR BAIXA' : 'AVALIAR'}
                                    </button>
                                ) : (
                                    <div className="text-center text-xs text-gray-400 py-1">Finalizada</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 4. MODAL PRINCIPAL (Renderizado condicionalmente via função renderModal) */}
            {renderModal()}

            {/* 5. MODAL DE ORDEM (APENAS PARA APROVAÇÃO, QUANDO PENDENTE) */}
            {isOrderModalOpen && solicitacaoToApprove && (
                <RefuelingOrderModal
                    user={user}
                    orderToEdit={null} 
                    solicitacaoData={solicitacaoToApprove} 
                    vehicles={vehicles} obras={obras} partners={partners} employees={employees}
                    refuelings={refuelings} expenses={expenses}
                    onClose={() => { setIsOrderModalOpen(false); setSolicitacaoToApprove(null); fetchSolicitacoes(); }}
                    setAlertMessage={setAlertMessage}
                    onGeneratePDF={generateAuthorizationPDF}
                    vehicleGroups={vehicleGroups} apiClient={apiClient}
                    reloadData={() => { reloadData(); fetchSolicitacoes(); }}
                />
            )}

            {/* 6. MODAL DE SENHA (TRAVA DE SEGURANÇA NA BAIXA) */}
            {showPasswordModal && (
                <PasswordConfirmationModal
                    message={`BLOQUEIO DE SEGURANÇA:\n${blockReason}\nInsira senha para autorizar a baixa.`}
                    onConfirm={checkPriceAndSubmit} 
                    onClose={() => setShowPasswordModal(false)}
                    apiClient={apiClient}
                />
            )}
        </div>
    );
};

export default AdminSolicitacoesPage;