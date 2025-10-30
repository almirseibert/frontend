import React, { useState, useMemo, useEffect } from 'react';
// REMOVIDO: Imports do Firebase Firestore e Auth
import { Droplet, ArrowUpCircle, ArrowDownCircle, Plus, Minus, Recycle, Download, FileText, Edit, Trash2, X, Loader } from 'lucide-react'; // Loader adicionado
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Importa componentes e hooks necessários
import ProtectedComponent from '../components/ProtectedComponent'; // Assumindo que está em components
import { useAuth } from '../contexts/AuthContext'; // Hook de autenticação

const generateAuthorizationPDF = (orderData, vehicles = [], partners = [], employees = [], vehicleGroups = {}) => {

    // Constrói o PDF usando jsPDF e autoTable
    const buildPdf = (logoDataUrl) => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
        const pageWidth = doc.internal.pageSize.getWidth();
        // const effectivePageHeight = 148.5; // Metade da altura de um A5
        const margin = 10;

        // Busca os dados completos baseados nos IDs
        const vehicle = vehicles.find(v => v.id === orderData.vehicleId); // Veículo que RECEBEU
        const partner = partners.find(p => p.id === orderData.partnerId); // Posto (se for entrada)
        const employee = employees.find(e => e.id === orderData.employeeId);
        // Usa a data passada em orderData (já deve ser string ISO ou Date object)
        const transactionDate = orderData.date ? new Date(orderData.date) : new Date();

        // Adiciona logo se disponível
        if (logoDataUrl) {
            const imgWidth = 45;
            const imgHeight = 16.875; // Mantém proporção
            try {
                doc.addImage(logoDataUrl, 'PNG', margin, 10, imgWidth, imgHeight);
            } catch (e) {
                 console.error("Erro ao adicionar logo ao PDF:", e);
            }
        }

        // Cabeçalho do PDF
        doc.setFontSize(16);
        doc.text(`Autorização de Abastecimento`, pageWidth - margin, 15, { align: 'right' });
        doc.setFontSize(12);
        // Usa o authNumber passado em orderData
        doc.text(`Nº: ${String(orderData.authNumber || 'N/A').padStart(6, '0')}`, pageWidth - margin, 22, { align: 'right' });

        // Determina a etiqueta e valor da leitura (Odômetro/Horímetro) do VEÍCULO QUE RECEBEU
        let leituraLabel = 'Odômetro';
        let leituraValue = orderData.odometro || orderData.odometroSaida || 'N/A'; // Usa odometro ou odometroSaida
        if (vehicle && vehicleGroups && Object.keys(vehicleGroups).length > 0) {
            const vehicleGroup = Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(vehicle.tipo));
            if (vehicleGroup === 'Máquinas Pesadas') {
                leituraLabel = 'Horímetro';
                // Usa os valores específicos passados em orderData (que vieram do formulário ou da transação)
                leituraValue = orderData.horimetroDigitalSaida ?? orderData.horimetroAnalogicoSaida ?? orderData.horimetroSaida ?? 'N/A';
            } else if (vehicleGroup === 'Caminhões') {
                // Prioriza horímetro para caminhões se disponível na orderData
                if (orderData.horimetroSaida != null) {
                    leituraLabel = 'Horímetro';
                    leituraValue = orderData.horimetroSaida ?? 'N/A';
                } else {
                    leituraLabel = 'Odômetro'; // Fallback para odômetro
                    leituraValue = orderData.odometroSaida ?? 'N/A';
                }
            } else { // Veículos Leves ou outros
                leituraLabel = 'Odômetro';
                leituraValue = orderData.odometroSaida ?? 'N/A';
            }
        }

        // Corpo da tabela do PDF
        const body = [
            ['Data de Emissão', transactionDate.toLocaleString('pt-BR')],
            ['Funcionário Responsável', employee?.nome || 'Não especificado'],
            ['Veículo Abastecido', `${vehicle?.registroInterno || 'N/A'} - ${vehicle?.placa || 'N/A'}`],
            ['Modelo', `${vehicle?.marca || ''} ${vehicle?.modelo || ''}`.trim() || 'N/A'],
            [leituraLabel, `${leituraValue}`],
            // Usa partnerName diretamente (pode ser 'Comboio XXX' ou nome do posto)
            ['Origem do Combustível', orderData.partnerName || partner?.razaoSocial || 'N/A'],
            ['Combustível', orderData.fuelType || 'N/A'],
            // Usa litrosAbastecidos (que deve ser preenchido corretamente antes de chamar)
            ['Litros', `${orderData.litrosAbastecidos || 0} L`],
        ];

        // Adiciona quem emitiu (usuário logado)
        if (orderData.createdBy?.userEmail) {
            body.push(['Emitido por', orderData.createdBy.userEmail]);
        }

        // Gera a tabela no PDF
        autoTable(doc, {
            startY: 35,
            body: body,
            theme: 'striped',
            styles: { fontSize: 9, cellPadding: 1.5 },
            headStyles: { fillColor: [24, 49, 83] }, // Cor MAK
            columnStyles: {
                0: { cellWidth: 40, fontStyle: 'bold' },
            }
        });

        // Salva ou abre o PDF
        const fileName = `Autorizacao_${orderData.authNumber || 'TEMP'}_${vehicle?.registroInterno || 'VEIC'}_${transactionDate.toISOString().split('T')[0]}.pdf`;
        // Abre em nova aba para visualização/impressão
        doc.output('dataurlnewwindow', { filename: fileName });
        // doc.save(fileName); // Alternativa para download direto
    };

    // Lógica para carregar a imagem do logo (mantida)
    const logo = new Image();
    logo.crossOrigin = 'Anonymous'; // Necessário para converter para data URL
    logo.src = 'https://i.postimg.cc/pVnwyfRq/MAK-Servi-os-Logotipo.png'; // URL da sua logo

    logo.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = logo.width;
            canvas.height = logo.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(logo, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            buildPdf(dataUrl); // Chama a construção do PDF com a logo carregada
        } catch (e) {
            console.error("Erro ao processar logo:", e);
            buildPdf(null); // Constrói sem logo
        }
    };

    // Fallback caso a logo não carregue
    logo.onerror = () => {
        console.error("Erro ao carregar o logotipo para o PDF.");
        buildPdf(null); // Constrói o PDF sem a logo
    };
};


// Modal de Entrada (ATUALIZADO para usar apiClient e props)
const ComboioEntradaModal = ({ user, comboioVehicle, partners = [], employees = [], onClose, setAlertMessage, apiClient, vehicleGroups = {}, generateAuthorizationPDF, obras = [], extraObraOptions = [], reloadData }) => {
    // Estado inicial ajustado para usar datas ISO e leituras do veículo
    const [formData, setFormData] = useState({
        partnerId: '',
        liters: '',
        date: new Date().toISOString().split('T')[0], // Formato YYYY-MM-DD
        fuelType: '',
        employeeId: '',
        // Pega leituras atuais do veículo comboio passado como prop
        odometro: comboioVehicle?.odometro?.toString() || '',
        horimetro: comboioVehicle?.horimetro?.toString() || '',
        obraId: '', // Campo para associar despesa
    });
    const [isSaving, setIsSaving] = useState(false);

    // Memoização de obras e funcionários (mantida)
    const sortedObras = useMemo(() => {
        return [...(obras || []).filter(o => o.status === 'ativa')].sort((a,b) => (a.nome || '').localeCompare(b.nome || ''));
    }, [obras]);
    const sortedEmployees = useMemo(() => [...(employees || [])].sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [employees]);
    const sortedPartners = useMemo(() => [...(partners || [])].sort((a,b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '')), [partners]);

    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Validações
        if (!formData.partnerId || !formData.liters || !formData.fuelType || !formData.employeeId || !formData.obraId) {
            setAlertMessage("Preencha todos os campos obrigatórios (*).");
            return;
        }
        setIsSaving(true);

        const partner = partners.find(p => p.id === formData.partnerId);
        // const employee = employees.find(e => e.id === formData.employeeId); // Não precisamos buscar aqui
        const liters = parseFloat(formData.liters);
        if (isNaN(liters) || liters <= 0) {
            setAlertMessage("Litros inválidos.");
            setIsSaving(false);
            return;
        }

        // Prepara os dados para a API
        const transactionData = {
            comboioVehicleId: comboioVehicle.id,
            partnerId: formData.partnerId,
            employeeId: formData.employeeId,
            odometro: parseFloat(formData.odometro) || null, // Envia null se inválido
            horimetro: parseFloat(formData.horimetro) || null,
            obraId: formData.obraId, // Para despesa
            liters: liters,
            // Adiciona T12:00:00Z para evitar problemas de fuso na conversão
            date: new Date(formData.date + 'T12:00:00Z').toISOString(), // Envia data como ISO string UTC
            fuelType: formData.fuelType,
            // 'createdBy' é adicionado pelo backend usando o token
            // 'valorTotal' é calculado pelo backend
        };

        try {
            // Chama a API para criar a transação de entrada
            // O backend cuida de atualizar veículo, gerar despesa, criar ordem e retornar dados para PDF
            const response = await apiClient.createComboioEntrada(transactionData);

            setAlertMessage(response.message || "Entrada de combustível registrada com sucesso!");
            reloadData(); // Recarrega os dados globais

            // Prepara dados para o PDF usando a resposta da API
             const pdfData = {
                // Dados da transação original ou da resposta (prioriza resposta)
                ...transactionData,
                authNumber: response.refuelingOrder?.authNumber || 'N/A', // Usa authNumber da ordem criada
                litrosAbastecidos: response.refuelingOrder?.litrosAbastecidos || liters, // Usa litros confirmados ou original
                // Ajusta outros campos se necessário com base na resposta
                partnerName: partner?.razaoSocial || 'N/A', // Nome do parceiro para PDF
                vehicleId: comboioVehicle.id, // O veículo que recebeu foi o comboio
                createdBy: { userEmail: user.email } // Simula createdBy para o PDF
            };

            // Gera o PDF
            generateAuthorizationPDF(pdfData, [comboioVehicle], partners, employees, vehicleGroups);

            onClose(); // Fecha o modal
        } catch (error) {
            console.error("Erro ao registrar entrada via API:", error);
            setAlertMessage(error.message || "Erro ao registrar a operação.");
        } finally {
            setIsSaving(false);
        }
    };

    // Renderização do formulário
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[95vh] flex flex-col my-auto">
                {/* Cabeçalho */}
                <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                    <h2 className="text-xl sm:text-2xl font-bold">Registrar Entrada de Combustível</h2>
                     <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                </div>
                {/* Formulário com scroll */}
                <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm overflow-y-auto">
                         <p className="md:col-span-2 text-gray-700 font-medium">Veículo Comboio: <span className="font-bold">{comboioVehicle.registroInterno}</span></p>
                        {/* Posto */}
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Posto de Abastecimento*</label><select name="partnerId" value={formData.partnerId} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required><option value="">Selecione um Posto</option>{sortedPartners.map(p => <option key={p.id} value={p.id}>{p.razaoSocial}</option>)}</select></div>
                        {/* Funcionário */}
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Funcionário Responsável*</label><select name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required><option value="">Selecione um Funcionário</option>{sortedEmployees.map(e => <option key={e.id} value={e.id}>{e.nome} {e.vulgo ? `(${e.vulgo})` : ''}</option>)}</select></div>
                        {/* Obra (Despesa) */}
                        <div className="md:col-span-2">
                            <label className="block font-medium text-gray-700 mb-1">Obra (para despesa)*</label>
                            <select name="obraId" value={formData.obraId} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required>
                                <option value="">Selecione a Obra/Local</option>
                                {sortedObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                                {extraObraOptions.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>
                        {/* Leituras Comboio */}
                        <div><label className="block font-medium text-gray-700 mb-1">Odômetro do Comboio</label><input name="odometro" type="number" step="0.1" value={formData.odometro} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" /></div>
                        <div><label className="block font-medium text-gray-700 mb-1">Horímetro do Comboio</label><input name="horimetro" type="number" step="0.1" value={formData.horimetro} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" /></div>
                        {/* Combustível */}
                        <div><label className="block font-medium text-gray-700 mb-1">Tipo de Combustível*</label><select name="fuelType" value={formData.fuelType} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required><option value="">Selecione o tipo</option><option value="dieselComum">Diesel Comum</option><option value="dieselS10">Diesel S10</option></select></div>
                        {/* Litros */}
                        <div><label className="block font-medium text-gray-700 mb-1">Litros Abastecidos*</label><input name="liters" type="number" step="0.01" min="0.01" value={formData.liters} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required /></div>
                        {/* Data */}
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Data*</label><input name="date" type="date" value={formData.date} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required /></div>
                    </div>
                    {/* Botões do rodapé */}
                    <div className="p-4 bg-gray-50 border-t flex flex-col sm:flex-row justify-end gap-2 sticky bottom-0 z-10">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium w-full sm:w-auto" disabled={isSaving}>Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-200 flex items-center justify-center gap-2 text-sm w-full sm:w-auto">
                            {isSaving ? <><Loader className="animate-spin" size={18} /> Salvando...</> : 'Registrar e Gerar PDF'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Modal de Saída (ATUALIZADO para usar apiClient e props)
const ComboioSaidaModal = ({ user, comboioVehicle, vehicles = [], obras = [], employees = [], onClose, setAlertMessage, apiClient, extraObraOptions = [], vehicleGroups = {}, generateAuthorizationPDF, partners = [], reloadData }) => {
    // Estado inicial
    const [formData, setFormData] = useState({
        receivingVehicleId: '',
        obraId: '',
        liters: '',
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        fuelType: '',
        employeeId: '',
        odometro: '', // Leituras FINAIS do veículo RECEBEDOR
        horimetro: '',
        horimetroDigital: '',
        horimetroAnalogico: '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [lastReadingError, setLastReadingError] = useState(''); // Estado para erro de leitura

    // Memoização de listas (mantida)
    const availableMachines = useMemo(() => {
        return (vehicles || [])
            .filter(v => !v.isComboioVehicle && v.id !== comboioVehicle.id)
            .sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || ''));
    }, [vehicles, comboioVehicle]);
    const sortedObras = useMemo(() => {
        return [...(obras || []).filter(o => o.status === 'ativa')].sort((a,b) => (a.nome || '').localeCompare(b.nome || ''));
    }, [obras]);
    const sortedEmployees = useMemo(() => [...(employees || [])].sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [employees]);

    // Lógica para buscar veículo selecionado e determinar grupo (mantida)
    const selectedVehicle = useMemo(() => vehicles.find(v => v.id === formData.receivingVehicleId), [formData.receivingVehicleId, vehicles]);
    const vehicleGroup = useMemo(() => {
        if (!selectedVehicle || !vehicleGroups || Object.keys(vehicleGroups).length === 0) return null;
        return Object.keys(vehicleGroups).find(group => vehicleGroups[group]?.includes(selectedVehicle.tipo));
    }, [selectedVehicle, vehicleGroups]);

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
        setLastReadingError(''); // Limpa erro de leitura ao mudar qualquer campo
    };

    // Atualiza leituras ao selecionar veículo (mantido)
    useEffect(() => {
        if (selectedVehicle) {
            setFormData(prev => ({
                ...prev,
                // Preenche com leituras ATUAIS do veículo selecionado
                odometro: selectedVehicle.odometro?.toString() || '',
                horimetro: selectedVehicle.horimetro?.toString() || '',
                horimetroDigital: selectedVehicle.horimetroDigital?.toString() || '',
                horimetroAnalogico: selectedVehicle.horimetroAnalogico?.toString() || '',
                // Tenta preencher obra atual do veículo
                obraId: selectedVehicle.obraAtualId || '',
            }));
            setLastReadingError(''); // Limpa erro ao trocar veículo
        } else {
            // Limpa leituras se nenhum veículo for selecionado
            setFormData(prev => ({ ...prev, odometro: '', horimetro: '', horimetroDigital: '', horimetroAnalogico: '', obraId: '' }));
        }
    }, [selectedVehicle]); // Dependência apenas no selectedVehicle

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLastReadingError(''); // Limpa erros anteriores
        const litersToDistribute = parseFloat(formData.liters);
        // Usa os níveis de combustível do veículo comboio passado por props
        const currentLevel = comboioVehicle?.fuelLevels?.[formData.fuelType] || 0;

        // Validações
        if (!formData.receivingVehicleId || !formData.obraId || !litersToDistribute || !formData.fuelType || !formData.employeeId) {
            setAlertMessage("Preencha todos os campos obrigatórios (*).");
            return;
        }
        if (litersToDistribute <= 0) {
             setAlertMessage("A quantidade de litros deve ser positiva.");
             return;
        }
        if (litersToDistribute > currentLevel) {
            setAlertMessage(`Não é possível distribuir ${litersToDistribute.toFixed(2)}L. O comboio possui apenas ${currentLevel.toFixed(2)}L de ${formData.fuelType}.`);
            return;
        }

        // Validação de leituras FINAIS vs ATUAIS do veículo recebedor
        let hasReadingError = false;
        let readingErrorMessage = "Leitura final não pode ser menor que a atual: ";
        const currentOdometro = parseFloat(selectedVehicle.odometro || 0);
        const currentHorimetro = parseFloat(selectedVehicle.horimetro || 0);
        const currentHorimetroDigital = parseFloat(selectedVehicle.horimetroDigital || 0);
        const currentHorimetroAnalogico = parseFloat(selectedVehicle.horimetroAnalogico || 0);
        const finalOdometro = parseFloat(formData.odometro || 0);
        const finalHorimetro = parseFloat(formData.horimetro || 0);
        const finalHorimetroDigital = parseFloat(formData.horimetroDigital || 0);
        const finalHorimetroAnalogico = parseFloat(formData.horimetroAnalogico || 0);

        if ((vehicleGroup === 'Veículos Leves' || vehicleGroup === 'Caminhões') && finalOdometro < currentOdometro) {
            readingErrorMessage += `Odômetro (Atual: ${currentOdometro}, Informado: ${finalOdometro})`;
            hasReadingError = true;
        }
        if (vehicleGroup === 'Caminhões' && finalHorimetro < currentHorimetro) {
             readingErrorMessage += `${hasReadingError ? ', ' : ''}Horímetro (Atual: ${currentHorimetro}, Informado: ${finalHorimetro})`;
             hasReadingError = true;
        }
         if (vehicleGroup === 'Máquinas Pesadas') {
             if (finalHorimetroDigital < currentHorimetroDigital) {
                 readingErrorMessage += `${hasReadingError ? ', ' : ''}Hor. Digital (Atual: ${currentHorimetroDigital}, Informado: ${finalHorimetroDigital})`;
                 hasReadingError = true;
             }
             if (selectedVehicle.possuiHorimetroAnalogico && finalHorimetroAnalogico < currentHorimetroAnalogico) {
                 readingErrorMessage += `${hasReadingError ? ', ' : ''}Hor. Analógico (Atual: ${currentHorimetroAnalogico}, Informado: ${finalHorimetroAnalogico})`;
                 hasReadingError = true;
             }
        }
        if (hasReadingError) {
             setLastReadingError(readingErrorMessage + "."); // Define o erro de leitura
             return; // Para a submissão
        }

        setIsSaving(true);
        // const employee = employees.find(e => e.id === formData.employeeId); // Não precisamos

        // Prepara os dados para a API
        const transactionData = {
            comboioVehicleId: comboioVehicle.id,
            receivingVehicleId: formData.receivingVehicleId,
            odometro: finalOdometro, // Leitura FINAL do veículo recebedor
            horimetro: finalHorimetro,
            horimetroDigital: finalHorimetroDigital,
            horimetroAnalogico: finalHorimetroAnalogico,
            liters: litersToDistribute,
            date: new Date(formData.date + 'T12:00:00Z').toISOString(), // ISO UTC
            fuelType: formData.fuelType,
            obraId: formData.obraId,
            employeeId: formData.employeeId,
            // 'createdBy' é adicionado pelo backend
        };

        try {
            // Chama a API para criar a transação de saída
            // O backend cuida de atualizar ambos os veículos, criar a ordem e retornar dados para PDF
            const response = await apiClient.createComboioSaida(transactionData);

            setAlertMessage(response.message || "Distribuição registrada com sucesso!");
            reloadData(); // Recarrega dados

            // Prepara dados para o PDF
             const pdfData = {
                ...transactionData,
                // Usa dados da resposta (ordem de abastecimento criada)
                authNumber: response.refuelingOrder?.authNumber || 'N/A',
                litrosAbastecidos: response.refuelingOrder?.litrosAbastecidos || litersToDistribute,
                // Campos específicos para PDF
                partnerName: `Comboio ${comboioVehicle.registroInterno}`, // Origem é o comboio
                vehicleId: formData.receivingVehicleId, // O veículo QUE RECEBEU
                createdBy: { userEmail: user.email }, // Simula
                 // Passa leituras FINAIS para o PDF (renomeando para corresponder à função genérica)
                 odometroSaida: transactionData.odometro,
                 horimetroSaida: transactionData.horimetro,
                 horimetroDigitalSaida: transactionData.horimetroDigital,
                 horimetroAnalogicoSaida: transactionData.horimetroAnalogico,
            };

            // Gera o PDF (passa partners vazio, pois não é usado para saída do comboio)
            generateAuthorizationPDF(pdfData, vehicles, [], employees, vehicleGroups);

            onClose(); // Fecha o modal
        } catch (error) {
            console.error("Erro ao registrar saída via API:", error);
            setAlertMessage(error.message || "Erro ao registrar a distribuição.");
        } finally {
            setIsSaving(false);
        }
    };

    // Renderização do formulário
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[95vh] flex flex-col my-auto">
                {/* Cabeçalho */}
                <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                    <h2 className="text-xl sm:text-2xl font-bold">Registrar Distribuição</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                </div>
                 {/* Formulário com scroll */}
                <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm overflow-y-auto">
                        <p className="md:col-span-2 text-gray-700 font-medium">Do Comboio: <span className="font-bold">{comboioVehicle.registroInterno}</span></p>
                        {/* Máquina a ser Abastecida */}
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Máquina/Veículo a ser Abastecido*</label><select name="receivingVehicleId" value={formData.receivingVehicleId} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required><option value="">Selecione a Máquina</option>{availableMachines.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.modelo}</option>)}</select></div>
                        {/* Funcionário Responsável */}
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Funcionário Responsável*</label><select name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required><option value="">Selecione um Funcionário</option>{sortedEmployees.map(e => <option key={e.id} value={e.id}>{e.nome} {e.vulgo ? `(${e.vulgo})` : ''}</option>)}</select></div>

                        {/* Campos de Leitura FINAIS */}
                        {selectedVehicle && (
                            <>
                                {(vehicleGroup === 'Veículos Leves' || vehicleGroup === 'Caminhões') && (
                                    <div className="md:col-span-1"><label className="block font-medium text-gray-700 mb-1">Odômetro Final (Km)*</label><input name="odometro" type="number" step="0.1" value={formData.odometro} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required placeholder={`Atual: ${selectedVehicle.odometro || '0'}`} /></div>
                                )}
                                {vehicleGroup === 'Caminhões' && (
                                    <div className="md:col-span-1"><label className="block font-medium text-gray-700 mb-1">Horímetro Final (Hr)*</label><input name="horimetro" type="number" step="0.1" value={formData.horimetro} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required placeholder={`Atual: ${selectedVehicle.horimetro || '0'}`} /></div>
                                )}
                                {vehicleGroup === 'Máquinas Pesadas' && (
                                    <>
                                        {selectedVehicle.possuiHorimetroDigital && (
                                            <div className="md:col-span-1"><label className="block font-medium text-gray-700 mb-1">Horímetro Digital Final (Hr)*</label><input name="horimetroDigital" type="number" step="0.1" value={formData.horimetroDigital} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required={!selectedVehicle.possuiHorimetroAnalogico} placeholder={`Atual: ${selectedVehicle.horimetroDigital || '0'}`}/></div>
                                        )}
                                        {selectedVehicle.possuiHorimetroAnalogico && (
                                            <div className="md:col-span-1"><label className="block font-medium text-gray-700 mb-1">Hor. Analógico Final (Hr)*</label><input name="horimetroAnalogico" type="number" step="0.1" value={formData.horimetroAnalogico} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required={!selectedVehicle.possuiHorimetroDigital} placeholder={`Atual: ${selectedVehicle.horimetroAnalogico || '0'}`}/></div>
                                        )}
                                         {/* Mensagem se nenhum campo de horímetro estiver disponível */}
                                        {!selectedVehicle.possuiHorimetroDigital && !selectedVehicle.possuiHorimetroAnalogico && (
                                             <p className="md:col-span-2 text-xs text-red-600">Este veículo não possui horímetro digital ou analógico cadastrado.</p>
                                        )}
                                    </>
                                )}
                             </>
                        )}
                        {!selectedVehicle && <div className="md:col-span-2 text-xs text-gray-500 italic">Selecione um veículo para inserir as leituras finais.</div>}

                        {/* Exibe erro de leitura se houver */}
                        {lastReadingError && <p className="md:col-span-2 text-xs text-red-600 font-medium">{lastReadingError}</p>}

                        {/* Obra */}
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Obra*</label><select name="obraId" value={formData.obraId} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required><option value="">Selecione a Obra/Local</option>{sortedObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}{extraObraOptions.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
                        {/* Tipo de Combustível */}
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Tipo de Combustível*</label>
                            <select name="fuelType" value={formData.fuelType} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required>
                                <option value="">Selecione</option>
                                {/* Usa os níveis do comboio selecionado (vindo das props) */}
                                {Object.entries(comboioVehicle?.fuelLevels || {})
                                      .filter(([type, level]) => level > 0) // Mostra apenas combustíveis com saldo > 0
                                      .map(([type, level]) => {
                                           let label = type.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                           if(type === 'dieselS10') label = 'Diesel S10';
                                           return <option key={type} value={type}>{label} ({level.toFixed(2)}L)</option>;
                                      })}
                            </select>
                        </div>
                        {/* Litros */}
                        <div><label className="block font-medium text-gray-700 mb-1">Litros*</label><input name="liters" type="number" step="0.01" min="0.01" value={formData.liters} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required /></div>
                        {/* Data */}
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Data*</label><input name="date" type="date" value={formData.date} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required /></div>
                    </div>
                    {/* Botões do rodapé */}
                    <div className="p-4 bg-gray-50 border-t flex flex-col sm:flex-row justify-end gap-2 sticky bottom-0 z-10">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium w-full sm:w-auto" disabled={isSaving}>Cancelar</button>
                         <button type="submit" disabled={isSaving || !selectedVehicle} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-200 flex items-center justify-center gap-2 text-sm w-full sm:w-auto">
                             {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Registrar e Gerar PDF'}
                         </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// Modal de Drenagem (ATUALIZADO para usar apiClient e props)
const ComboioDrenagemModal = ({ user, vehicles = [], onClose, setAlertMessage, apiClient, reloadData }) => {
    // Estado inicial
    const [formData, setFormData] = useState({
        drainingVehicleId: '',
        comboioVehicleId: '',
        liters: '',
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        fuelType: '',
        reason: '',
    });
    const [isSaving, setIsSaving] = useState(false);

    // Memoização de listas
    const comboioVehicles = useMemo(() => vehicles.filter(v => v.isComboioVehicle).sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);
    const drainableVehicles = useMemo(() => vehicles.filter(v => !v.isComboioVehicle).sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);

    // Veículo de origem selecionado
    const selectedDrainingVehicle = useMemo(() => drainableVehicles.find(v => v.id === formData.drainingVehicleId), [formData.drainingVehicleId, drainableVehicles]);

    // Atualiza tipo de combustível ao selecionar veículo
    useEffect(() => {
        if (selectedDrainingVehicle) {
            // Encontra o primeiro tipo de combustível com saldo > 0
            const firstAvailableFuel = Object.entries(selectedDrainingVehicle.fuelLevels || {})
                                             .find(([type, level]) => level > 0)?.[0];
            setFormData(prev => ({ ...prev, fuelType: firstAvailableFuel || '' }));
        } else {
             setFormData(prev => ({ ...prev, fuelType: '' })); // Limpa se nenhum veículo selecionado
        }
    }, [selectedDrainingVehicle]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const { drainingVehicleId, comboioVehicleId, liters, fuelType } = formData;
        // Validações
        if (!drainingVehicleId || !comboioVehicleId || !liters || !fuelType) {
            setAlertMessage("Preencha todos os campos obrigatórios (*).");
            return;
        }
        setIsSaving(true);
        const litersToDrain = parseFloat(liters);

        // Validação de saldo
        const currentFuelLevel = selectedDrainingVehicle?.fuelLevels?.[fuelType] || 0;
        if (litersToDrain <= 0) {
             setAlertMessage("A quantidade de litros deve ser positiva.");
             setIsSaving(false);
             return;
        }
        if (litersToDrain > currentFuelLevel) {
            setAlertMessage(`Não é possível drenar ${litersToDrain.toFixed(2)}L. O veículo de origem possui apenas ${currentFuelLevel.toFixed(2)}L de ${fuelType}.`);
            setIsSaving(false);
            return;
        }

        // Prepara dados para a API
        const transactionData = {
            comboioVehicleId,
            drainingVehicleId,
            liters: litersToDrain,
            date: new Date(formData.date + 'T12:00:00Z').toISOString(), // ISO UTC
            fuelType,
            reason: formData.reason,
            // 'createdBy' é adicionado pelo backend
        };

        try {
            // Chama a API para criar a transação de drenagem
            // O backend cuida de atualizar os níveis de ambos os veículos
            const response = await apiClient.createComboioDrenagem(transactionData);

            setAlertMessage(response.message || "Drenagem de combustível registrada com sucesso!");
            reloadData(); // Recarrega dados
            onClose(); // Fecha o modal
        } catch (error) {
            console.error("Erro ao registrar drenagem via API:", error);
            setAlertMessage(error.message || "Falha ao registrar a drenagem.");
        } finally {
            setIsSaving(false);
        }
    };

    // Renderização do formulário
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[95vh] flex flex-col my-auto">
                 {/* Cabeçalho */}
                 <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                    <h2 className="text-xl sm:text-2xl font-bold">Registrar Drenagem</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                 </div>
                 {/* Formulário com scroll */}
                <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm overflow-y-auto">
                        <p className="md:col-span-2 text-gray-600">Retornar combustível de um veículo para o comboio.</p>
                        {/* Veículo de Origem */}
                        <div><label className="block font-medium text-gray-700 mb-1">Veículo de Origem (drenar de)*</label><select name="drainingVehicleId" value={formData.drainingVehicleId} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required><option value="">Selecione o Veículo</option>{drainableVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.modelo}</option>)}</select></div>
                        {/* Veículo Comboio Destino */}
                        <div><label className="block font-medium text-gray-700 mb-1">Veículo Comboio (devolver para)*</label><select name="comboioVehicleId" value={formData.comboioVehicleId} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required><option value="">Selecione o Comboio</option>{comboioVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.modelo}</option>)}</select></div>
                        {/* Tipo de Combustível */}
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Tipo de Combustível*</label>
                            <select name="fuelType" value={formData.fuelType} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required disabled={!selectedDrainingVehicle}>
                                <option value="">{selectedDrainingVehicle ? 'Selecione o tipo' : 'Selecione veículo origem'}</option>
                                {selectedDrainingVehicle && Object.entries(selectedDrainingVehicle.fuelLevels || {})
                                    .filter(([type, level]) => level > 0)
                                    .map(([type, level]) => {
                                         let label = type.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                         if(type === 'dieselS10') label = 'Diesel S10';
                                         return <option key={type} value={type}>{label} ({level.toFixed(2)}L)</option>;
                                    })
                                }
                            </select>
                        </div>
                        {/* Litros */}
                        <div><label className="block font-medium text-gray-700 mb-1">Litros Drenados*</label><input name="liters" type="number" step="0.01" min="0.01" value={formData.liters} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required /></div>
                        {/* Data */}
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Data*</label><input name="date" type="date" value={formData.date} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required /></div>
                        {/* Motivo */}
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Motivo</label><textarea name="reason" value={formData.reason} onChange={handleChange} rows="2" className="w-full p-2 border rounded mt-1 bg-white" placeholder="Motivo da drenagem..."></textarea></div>
                    </div>
                    {/* Botões */}
                    <div className="p-4 bg-gray-50 border-t flex flex-col sm:flex-row justify-end gap-2 sticky bottom-0 z-10">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium w-full sm:w-auto" disabled={isSaving}>Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-200 flex items-center justify-center gap-2 text-sm w-full sm:w-auto">
                             {isSaving ? <><Loader className="animate-spin" size={18}/> Salvando...</> : 'Registrar Drenagem'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// Gerador de Relatório (ATUALIZADO para usar apiClient e props)
const ComboioReportGenerator = ({ comboioVehicles = [], comboioTransactions = [], setAlertMessage }) => {
    const today = new Date().toISOString().split('T')[0];
    const [selectedComboioId, setSelectedComboioId] = useState('');
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);

    const handleGeneratePDF = () => {
        if (!selectedComboioId) {
            setAlertMessage("Por favor, selecione um veículo comboio.");
            return;
        }

        // Converte datas do filtro para timestamps UTC para comparação segura
        const startTimestamp = new Date(`${startDate}T00:00:00Z`).getTime();
        const endTimestamp = new Date(`${endDate}T23:59:59Z`).getTime();

        // Filtra transações (converte data da API para timestamp UTC)
        const filteredTransactions = (comboioTransactions || []).filter(t => {
            const transactionTimestamp = new Date(t.date).getTime(); // API retorna ISO string (presume-se UTC)
            return t.comboioVehicleId === selectedComboioId &&
                   transactionTimestamp >= startTimestamp &&
                   transactionTimestamp <= endTimestamp;
        });

        if (filteredTransactions.length === 0) {
            setAlertMessage("Nenhuma transação encontrada para os filtros selecionados.");
            return;
        }

        // Geração do PDF
        const doc = new jsPDF();
        const comboio = comboioVehicles.find(v => v.id === selectedComboioId);

        doc.setFontSize(18);
        doc.text(`Relatório do Comboio: ${comboio?.registroInterno || 'N/A'}`, 14, 22);
        doc.setFontSize(11);
        // Usa as datas do filtro formatadas corretamente
        const formattedStartDate = new Date(startDate+'T12:00:00').toLocaleDateString('pt-BR');
        const formattedEndDate = new Date(endDate+'T12:00:00').toLocaleDateString('pt-BR');
        doc.text(`Período: ${formattedStartDate} a ${formattedEndDate}`, 14, 28);

        // Cálculo de totais
        const totals = {
            dieselComum: { entrada: 0, saida: 0, drenagem: 0 },
            dieselS10: { entrada: 0, saida: 0, drenagem: 0 },
        };

        const body = [];
        // Ordena por data (convertendo string da API para Date)
        filteredTransactions
            .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Ordena crescente
            .forEach(t => {
                let origemDestino = '';
                let litros = 0;
                const transactionDate = new Date(t.date); // Converte para Date

                if (t.type === 'entrada') {
                    origemDestino = `ENTRADA de ${t.partnerName || 'N/A'}`;
                    litros = t.liters;
                    if (totals[t.fuelType]) totals[t.fuelType].entrada += t.liters;
                } else if (t.type === 'drenagem') {
                     origemDestino = `DRENAGEM de ${t.drainingVehicleName || 'N/A'}`;
                     litros = t.liters; // Drenagem é entrada para o comboio
                     if (totals[t.fuelType]) totals[t.fuelType].drenagem += t.liters;
                } else if (t.type === 'saida') {
                    origemDestino = `SAÍDA para ${t.receivingVehicleName || 'N/A'} em ${t.obraName || 'N/A'}`;
                    litros = -t.liters; // Negativo para saída
                    if (totals[t.fuelType]) totals[t.fuelType].saida += t.liters;
                }

                body.push([
                    transactionDate.toLocaleDateString('pt-BR'), // Formata data
                    origemDestino,
                    t.fuelType,
                    litros.toFixed(2),
                    (t.responsibleUserEmail || 'N/A').split('@')[0] // Nome do usuário
                ]);
            });

        // Tabela de transações
        let finalY = 35;
        if (body.length > 0) {
             const result = autoTable(doc, {
                startY: finalY,
                head: [['Data', 'Origem/Destino', 'Combustível', 'Litros (+/-)', 'Responsável']],
                body: body,
                theme: 'grid', // Usa 'grid' para melhor visualização
                headStyles: { fillColor: [23, 37, 84], textColor: 255 }, // Azul MAK com texto branco
                styles: { fontSize: 8 },
                columnStyles: { 3: { halign: 'right' } }, // Alinha litros à direita
            });
            finalY = result.lastAutoTable.finalY || finalY + 15;
        }

        // Tabela de Resumo
        const summaryBody = [
            ['Combustível', 'Total Entradas (L)', 'Total Drenagem (L)', 'Total Saídas (L)', 'Saldo Período (L)'],
            ['Diesel Comum',
             totals.dieselComum.entrada.toFixed(2),
             totals.dieselComum.drenagem.toFixed(2),
             totals.dieselComum.saida.toFixed(2),
             (totals.dieselComum.entrada + totals.dieselComum.drenagem - totals.dieselComum.saida).toFixed(2)], // Saldo
            ['Diesel S10',
             totals.dieselS10.entrada.toFixed(2),
             totals.dieselS10.drenagem.toFixed(2),
             totals.dieselS10.saida.toFixed(2),
             (totals.dieselS10.entrada + totals.dieselS10.drenagem - totals.dieselS10.saida).toFixed(2)],
        ];

        doc.setFontSize(14);
        doc.text('Resumo de Movimentação', 14, finalY + 10);
        autoTable(doc, {
            startY: finalY + 15,
            head: [['Resumo de Combustível']], // Cabeçalho simplificado
            headStyles: { fillColor: [23, 37, 84], textColor: 255, halign: 'center' },
            body: summaryBody,
            theme: 'grid',
            styles: { fontSize: 9 },
            columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } }, // Alinha números
             didParseCell: function (data) { // Adiciona cor ao saldo
                if (data.column.index === 4 && data.row.index > 0) { // Coluna Saldo, excluindo cabeçalho
                    const saldo = parseFloat(data.cell.raw);
                    if (!isNaN(saldo)) {
                        data.cell.styles.textColor = saldo >= 0 ? [0, 100, 0] : [200, 0, 0]; // Verde ou Vermelho
                    }
                }
            }
        });

        // Salva o PDF
        doc.save(`Relatorio_Comboio_${comboio?.registroInterno || 'ID'}_${startDate}_a_${endDate}.pdf`);
    };

    // Renderização do formulário do relatório
    return (
        <div className="p-4 sm:p-6 bg-white rounded-lg shadow-md mt-8 border">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><FileText size={22} />Relatório de Movimentação</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end text-sm">
                <div>
                    <label className="block font-medium text-gray-700 mb-1">Comboio</label>
                    <select value={selectedComboioId} onChange={e => setSelectedComboioId(e.target.value)} className="w-full p-2 border rounded mt-1 bg-white">
                        <option value="">Selecione um comboio</option>
                        {comboioVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block font-medium text-gray-700 mb-1">Data de Início</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 border rounded mt-1 bg-white" />
                </div>
                <div>
                    <label className="block font-medium text-gray-700 mb-1">Data de Fim</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 border rounded mt-1 bg-white" />
                </div>
            </div>
            <div className="mt-6">
                <button
                    onClick={handleGeneratePDF}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition disabled:bg-red-400 text-sm"
                    disabled={!selectedComboioId} // Desabilita se nenhum comboio selecionado
                >
                    <Download size={16}/>Gerar Relatório PDF
                </button>
            </div>
        </div>
    );
};

// ===================================================================================
// NOVO: Modal para Editar Transação (Simplificado)
// ===================================================================================
const ComboioTransactionModal = ({ user, transaction, comboioVehicle, vehicles = [], partners = [], employees = [], onClose, setAlertMessage, apiClient, extraObraOptions = [], vehicleGroups = {}, obras = [], PasswordConfirmationModal, reloadData }) => {
    const isEditing = !!transaction;
    const isEntrada = transaction?.type === 'entrada';
    const isSaida = transaction?.type === 'saida';
    const isDrenagem = transaction?.type === 'drenagem';

    // Estado inicial preenchido com dados da transação
    const [formData, setFormData] = useState({
        partnerId: isEntrada ? transaction.partnerId : '',
        odometro: isEntrada ? transaction.odometro?.toString() : '', // Odômetro do comboio na entrada
        horimetro: isEntrada ? transaction.horimetro?.toString() : '', // Horímetro do comboio na entrada
        receivingVehicleId: isSaida ? transaction.receivingVehicleId : '',
        obraId: transaction.obraId || '', // Obra associada
        odometroSaida: isSaida ? transaction.odometro?.toString() : '', // Odômetro da máquina na saída (originalmente 'odometro' na transação)
        horimetroSaida: isSaida ? transaction.horimetro?.toString() : '', // Horímetro da máquina na saída (originalmente 'horimetro')
        horimetroDigitalSaida: isSaida ? transaction.horimetroDigital?.toString() || '' : '', // Adicionado
        horimetroAnalogicoSaida: isSaida ? transaction.horimetroAnalogico?.toString() || '' : '', // Adicionado
        drainingVehicleId: isDrenagem ? transaction.drainingVehicleId : '',
        reason: isDrenagem ? transaction.reason || '' : '', // Adiciona fallback
        liters: transaction?.liters?.toString() || '',
        // Converte data da API (ISO string) para formato datetime-local
        date: transaction ? new Date(transaction.date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
        fuelType: transaction?.fuelType || '',
        employeeId: transaction?.employeeId || '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    // Memoização de listas (sem mudanças)
    const availableMachines = useMemo(() => vehicles.filter(v => !v.isComboioVehicle).sort((a,b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);
    const drainableVehicles = availableMachines;
    const sortedObras = useMemo(() => [...(obras || []).filter(o => o.status === 'ativa')].sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [obras]);
    const sortedEmployees = useMemo(() => [...(employees || [])].sort((a,b) => (a.nome || '').localeCompare(b.nome || '')), [employees]);
    const sortedPartners = useMemo(() => [...(partners || [])].sort((a, b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '')), [partners]);

    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    // Abre o modal de senha para confirmar a edição
    const handleConfirmEdit = (e) => {
        e.preventDefault();
        // Adicionar validações básicas aqui se necessário (ex: litros > 0)
        setShowPasswordModal(true);
    };

    // Função que realmente salva após confirmação de senha
    const handleSaveEdit = async () => {
        setIsSaving(true);

        // Prepara os dados atualizados para a API
        const updatedData = {
            // Campos relevantes baseados no tipo, convertendo para número/null
            liters: parseFloat(formData.liters) || 0,
            date: new Date(formData.date).toISOString(), // Envia como ISO string UTC
            fuelType: formData.fuelType,
            employeeId: formData.employeeId || null,
            obraId: formData.obraId || null,
        };

        // Adiciona campos específicos do tipo
        if (isEntrada) {
            updatedData.partnerId = formData.partnerId || null;
            updatedData.odometro = parseFloat(formData.odometro) || null;
            updatedData.horimetro = parseFloat(formData.horimetro) || null;
        } else if (isSaida) {
            updatedData.receivingVehicleId = formData.receivingVehicleId || null;
            updatedData.odometro = parseFloat(formData.odometroSaida) || null; // Mapeia odometroSaida para odometro
            updatedData.horimetro = parseFloat(formData.horimetroSaida) || null; // Mapeia horimetroSaida para horimetro
            updatedData.horimetroDigital = parseFloat(formData.horimetroDigitalSaida) || null;
            updatedData.horimetroAnalogico = parseFloat(formData.horimetroAnalogicoSaida) || null;
        } else if (isDrenagem) {
            updatedData.drainingVehicleId = formData.drainingVehicleId || null;
            updatedData.reason = formData.reason || null;
             // Campos não relevantes para drenagem são omitidos (employeeId, obraId já tratados acima)
        }

        // Validação final antes de enviar
         if (updatedData.liters <= 0) {
             setAlertMessage("Litros devem ser maior que zero.");
             setIsSaving(false);
             setShowPasswordModal(false); // Fecha modal senha
             return;
         }

        try {
            // Chama a API para ATUALIZAR a transação
            // O backend deve recalcular saldos, etc.
            // **NECESSÁRIO CRIAR apiClient.updateComboioTransaction**
            if (!apiClient.updateComboioTransaction) {
                 throw new Error("Função apiClient.updateComboioTransaction não implementada.");
            }
            const response = await apiClient.updateComboioTransaction(transaction.id, updatedData);

            setAlertMessage(response?.message || "Transação atualizada com sucesso!");
            reloadData(); // Recarrega os dados globais
            setShowPasswordModal(false); // Fecha modal de senha
            onClose(); // Fecha modal de edição
        } catch (error) {
            console.error("Erro ao atualizar transação via API:", error);
            // Mantém modal de senha aberto para tentar novamente se quiser
            setAlertMessage(error.message || "Falha ao atualizar a transação.");
        } finally {
            setIsSaving(false);
        }
    };

    // Renderização do formulário
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[95vh] flex flex-col my-auto">
                 {/* Cabeçalho */}
                 <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                     <h2 className="text-xl sm:text-2xl font-bold">Editar Transação de <span className="capitalize">{transaction.type}</span></h2>
                     <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" disabled={isSaving}><X size={20}/></button>
                 </div>
                 {/* Formulário com scroll */}
                <form onSubmit={handleConfirmEdit} className="flex-1 overflow-y-auto">
                    <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        {/* Campos condicionais */}
                         {isEntrada && (
                            <>
                                <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Posto</label><select name="partnerId" value={formData.partnerId} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white"><option value="">Selecione</option>{sortedPartners.map(p => <option key={p.id} value={p.id}>{p.razaoSocial}</option>)}</select></div>
                                <div><label className="block font-medium text-gray-700 mb-1">Odômetro Comboio</label><input name="odometro" type="number" step="0.1" value={formData.odometro} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white"/></div>
                                <div><label className="block font-medium text-gray-700 mb-1">Horímetro Comboio</label><input name="horimetro" type="number" step="0.1" value={formData.horimetro} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white"/></div>
                                <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Obra (Despesa)</label><select name="obraId" value={formData.obraId} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white"><option value="">Selecione</option>{sortedObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}{extraObraOptions.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
                             </>
                        )}
                        {isSaida && (
                             <>
                                <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Máquina Abastecida</label><select name="receivingVehicleId" value={formData.receivingVehicleId} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white"><option value="">Selecione</option>{availableMachines.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.modelo}</option>)}</select></div>
                                <div><label className="block font-medium text-gray-700 mb-1">Odômetro Máquina</label><input name="odometroSaida" type="number" step="0.1" value={formData.odometroSaida} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white"/></div>
                                <div><label className="block font-medium text-gray-700 mb-1">Horímetro Máquina</label><input name="horimetroSaida" type="number" step="0.1" value={formData.horimetroSaida} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white"/></div>
                                {/* Adicionar Horimetros Digital e Analógico se necessário */}
                                <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Obra</label><select name="obraId" value={formData.obraId} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white"><option value="">Selecione</option>{sortedObras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}{extraObraOptions.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
                             </>
                        )}
                         {isDrenagem && (
                             <>
                                <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Veículo Origem</label><select name="drainingVehicleId" value={formData.drainingVehicleId} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white"><option value="">Selecione</option>{drainableVehicles.map(v => <option key={v.id} value={v.id}>{v.registroInterno} - {v.modelo}</option>)}</select></div>
                                <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Motivo</label><textarea name="reason" value={formData.reason} onChange={handleChange} rows="2" className="w-full p-2 border rounded mt-1 bg-white"></textarea></div>
                             </>
                        )}

                        {/* Campos Comuns */}
                        {!isDrenagem && ( // Drenagem não tem funcionário associado diretamente à transação
                            <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Funcionário Responsável</label><select name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white"><option value="">Selecione</option>{sortedEmployees.map(e => <option key={e.id} value={e.id}>{e.nome} {e.vulgo ? `(${e.vulgo})` : ''}</option>)}</select></div>
                        )}
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Tipo Combustível *</label>
                            <select name="fuelType" value={formData.fuelType} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required>
                                <option value="">Selecione</option>
                                <option value="dieselComum">Diesel Comum</option>
                                <option value="dieselS10">Diesel S10</option>
                            </select>
                        </div>
                        <div><label className="block font-medium text-gray-700 mb-1">Litros *</label><input name="liters" type="number" step="0.01" min="0.01" value={formData.liters} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required /></div>
                        <div className="md:col-span-2"><label className="block font-medium text-gray-700 mb-1">Data e Hora *</label><input name="date" type="datetime-local" value={formData.date} onChange={handleChange} className="w-full p-2 border rounded mt-1 bg-white" required /></div>
                    </div>
                    {/* Botões do Rodapé */}
                    <div className="p-4 bg-gray-50 border-t flex flex-col sm:flex-row justify-end gap-2 sticky bottom-0 z-10">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium w-full sm:w-auto" disabled={isSaving}>Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:bg-yellow-200 flex items-center justify-center gap-2 text-sm w-full sm:w-auto">
                             {isSaving ? <><Loader className="animate-spin" size={18}/> Verificando...</> : 'Salvar Alterações'}
                        </button>
                    </div>
                </form>
                 {/* Modal de Confirmação de Senha */}
                 {showPasswordModal &&
                     <PasswordConfirmationModal
                         message="Confirme sua senha para salvar as alterações nesta transação."
                         onConfirm={handleSaveEdit}
                         onClose={() => setShowPasswordModal(false)}
                         apiClient={apiClient} // Passa o apiClient
                     />
                 }
            </div>
        </div>
    );
};


// Componente Principal (ATUALIZADO para usar apiClient e props)
const ComboioPage = ({
    user, vehicles = [], partners = [], obras = [], employees = [], comboioTransactions = [],
    setAlertMessage, apiClient, extraObraOptions = [], vehicleGroups = {},
    PasswordConfirmationModal, // Recebe o componente global
    ConfirmationModal, // Recebe o componente global (se usar)
    reloadData // Recebe a função de recarregar
}) => {
    // Estados para controle dos modais
    const [isEntradaModalOpen, setIsEntradaModalOpen] = useState(false);
    const [isSaidaModalOpen, setIsSaidaModalOpen] = useState(false);
    const [isDrenagemModalOpen, setIsDrenagemModalOpen] = useState(false);
    const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false); // Para editar
    const [selectedComboioId, setSelectedComboioId] = useState(null);
    const [transactionToEdit, setTransactionToEdit] = useState(null);
    const [transactionToDelete, setTransactionToDelete] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); // Para confirmação de exclusão
    const [loadingDelete, setLoadingDelete] = useState(false); // Estado de loading para exclusão

    // Memoização de listas
    const comboioVehicles = useMemo(() => vehicles.filter(v => v.isComboioVehicle).sort((a, b) => (a.registroInterno || '').localeCompare(b.registroInterno || '')), [vehicles]);

    // Seleciona o primeiro comboio por padrão
    useEffect(() => {
        if (!selectedComboioId && comboioVehicles.length > 0) {
            setSelectedComboioId(comboioVehicles[0].id);
        }
         // Se o comboio selecionado não existir mais na lista, limpa a seleção
         else if (selectedComboioId && !comboioVehicles.some(v => v.id === selectedComboioId)) {
            setSelectedComboioId(comboioVehicles.length > 0 ? comboioVehicles[0].id : null);
        }
    }, [comboioVehicles, selectedComboioId]);

    // Busca o veículo comboio selecionado (usa 'vehicles' diretamente)
    const selectedComboio = useMemo(() => {
        // Encontra o veículo na lista principal (que veio da API e está em 'vehicles')
        const comboio = vehicles.find(v => v.id === selectedComboioId);
        return comboio || null;
    }, [selectedComboioId, vehicles]);

    // Ordena transações (usa data string da API)
    const sortedTransactions = useMemo(() => {
        return [...(comboioTransactions || [])]
            .filter(t => t.comboioVehicleId === selectedComboioId)
            // Ordena convertendo a string de data da API para timestamp (mais recente primeiro)
            .sort((a, b) => (new Date(b.date).getTime()) - (new Date(a.date).getTime()));
    }, [comboioTransactions, selectedComboioId]);

    // Funções para abrir modais
    const openEntradaModal = (vehicle) => {
        setSelectedComboioId(vehicle.id);
        setIsEntradaModalOpen(true);
    };
    const openSaidaModal = (vehicle) => {
        setSelectedComboioId(vehicle.id);
        setIsSaidaModalOpen(true);
    };
    const openEditTransactionModal = (transaction) => {
        setTransactionToEdit(transaction);
        setIsTransactionModalOpen(true);
    };
    const openDeleteTransactionModal = (transaction) => {
        setTransactionToDelete(transaction);
        setIsDeleteModalOpen(true); // Abre o modal de confirmação de senha
    };

    // Função para deletar transação (usa apiClient e PasswordConfirmationModal)
    const handleDeleteTransaction = async () => {
        if (!transactionToDelete) return;
        setLoadingDelete(true); // Ativa loading específico

        try {
            // Chama a API para deletar
            // O backend reverte saldos, remove ordem/despesa
            await apiClient.deleteComboioTransaction(transactionToDelete.id);
            setAlertMessage("Transação excluída com sucesso!");
            reloadData(); // Recarrega os dados globais
        } catch (error) {
            console.error("Erro ao excluir transação via API:", error);
            setAlertMessage(error.message || "Falha ao excluir a transação.");
        } finally {
            setIsDeleteModalOpen(false); // Fecha o modal de senha
            setTransactionToDelete(null);
            setLoadingDelete(false); // Desativa loading
        }
    };

    // Componente de barra de progresso (sem mudanças)
    const FuelProgressBar = ({ type, value, max }) => {
        const numericValue = parseFloat(value) || 0;
        const numericMax = parseFloat(max) || 1;
        const percentage = numericMax > 0 ? (numericValue / numericMax) * 100 : 0;
        const fuelColorClasses = {
            dieselComum: 'bg-green-500',
            dieselS10: 'bg-blue-500',
        };
        const fuelColor = fuelColorClasses[type] || 'bg-gray-500';
        let formattedType = (type || 'N/A').replace(/([A-Z])/g, ' $1');
        if (type === 'dieselS10') formattedType = 'Diesel S10';

        return (
            <div className="flex flex-col items-center w-20"> {/* Largura fixa */}
                <div className="relative w-8 h-32 bg-gray-200 rounded-lg overflow-hidden flex items-end border border-gray-300">
                    <div
                        className={`${fuelColor} w-full transition-all duration-300 ease-in-out`}
                        style={{ height: `${Math.min(Math.max(percentage, 0), 100)}%` }}
                    />
                    <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[10px] font-bold text-black bg-white/60 backdrop-blur-sm py-0.5">
                        {percentage.toFixed(0)}%
                    </span>
                </div>
                <div className="mt-1 text-center">
                    <Droplet className={`h-4 w-4 mx-auto ${fuelColor.replace('bg-', 'text-').replace('-500', '-600')}`} />
                    <span className="capitalize text-[10px] font-medium text-gray-700 block truncate leading-tight" title={formattedType}>
                        {formattedType}
                    </span>
                    <span className="text-[11px] font-bold text-gray-900 block">{numericValue.toFixed(1)} L</span>
                </div>
            </div>
        );
    };

    // Renderização Principal (usa selectedComboio.fuelLevels)
    return (
        <div className="container mx-auto space-y-6 p-4 md:p-6 lg:p-8">
            {/* Cabeçalho */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gerenciamento de Comboio</h1>
                <ProtectedComponent requiredPermission="editor">
                    <button onClick={() => setIsDrenagemModalOpen(true)} className="flex items-center gap-2 px-3 py-2 bg-orange-500 text-white font-semibold rounded-lg shadow hover:bg-orange-600 transition text-sm w-full sm:w-auto justify-center">
                        <Recycle size={18} />Registrar Drenagem
                    </button>
                </ProtectedComponent>
            </div>

            {/* Grid Principal */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Coluna de Status */}
                <div className="lg:col-span-1 space-y-4">
                    <h2 className="text-lg font-bold text-gray-700">Status dos Veículos Comboio</h2>
                    {comboioVehicles.length > 0 ? comboioVehicles.map(v => {
                        // Usa v.fuelLevels diretamente (vem da API)
                        const fuelData = v.fuelLevels || {};
                        const hasFuel = Object.values(fuelData).some(level => level > 0); // Verifica se tem algum combustível
                        return (
                        <div
                            key={v.id}
                            className={`p-4 bg-white rounded-lg shadow-md cursor-pointer transition-all duration-200 border ${
                                v.id === selectedComboioId
                                ? 'ring-2 ring-yellow-400 scale-103'
                                : 'border-gray-200 hover:shadow-lg hover:border-gray-300'
                            }`}
                            onClick={() => setSelectedComboioId(v.id)}
                        >
                            <p className="font-bold text-base text-gray-800">{v.registroInterno} - {v.modelo}</p>
                            {/* Barras de Progresso */}
                            <div className="flex justify-center items-end space-x-4 mt-3">
                                {Object.keys(fuelData).length > 0 ? (
                                     Object.entries(fuelData)
                                        .sort(([typeA], [typeB]) => typeA.localeCompare(typeB)) // Ordena por tipo
                                        .map(([type, level]) => (
                                            <FuelProgressBar
                                                key={type}
                                                type={type}
                                                value={level}
                                                max={v.fuelCapacity || 1}
                                            />
                                    ))
                                ) : (
                                    <p className="text-xs text-gray-500 text-center w-full py-6 italic">Nível de combustível não disponível.</p>
                                )}
                            </div>
                            {/* Botões de Ação */}
                            <ProtectedComponent requiredPermission="editor">
                                <div className="flex gap-2 pt-4 mt-3 border-t border-gray-200">
                                    <button onClick={(e) => { e.stopPropagation(); openEntradaModal(v); }} className="flex-1 text-xs py-1.5 px-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center justify-center gap-1 transition"><Plus size={14}/> Entrada</button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); openSaidaModal(v); }}
                                        className="flex-1 text-xs py-1.5 px-2 bg-yellow-500 text-gray-900 rounded-md hover:bg-yellow-600 flex items-center justify-center gap-1 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={!hasFuel} // Desabilita se não tiver combustível
                                    >
                                        <Minus size={14}/> Distribuir
                                    </button>
                                </div>
                            </ProtectedComponent>
                        </div>
                    )}) : (
                        <div className="p-6 bg-white rounded-lg shadow-md border border-gray-200">
                           <p className="text-gray-500 text-center py-10 text-sm">Nenhum veículo foi designado como "Comboio". Verifique o cadastro de veículos.</p>
                        </div>
                    )}
                </div>

                {/* Coluna de Transações */}
                <div className="lg:col-span-2 p-4 sm:p-6 bg-white rounded-lg shadow-md border border-gray-200">
                    <h2 className="text-lg font-bold mb-3 text-gray-700">Últimas Transações - {selectedComboio?.registroInterno || 'Nenhum selecionado'}</h2>
                    {selectedComboioId ? (
                        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
                            {sortedTransactions.map(t => {
                                const transactionTypes = {
                                    entrada: { icon: ArrowUpCircle, color: 'text-blue-600', text: `Entrada de ${t.partnerName || 'N/A'}`},
                                    saida: { icon: ArrowDownCircle, color: 'text-yellow-600', text: `Saída p/ ${t.receivingVehicleName || 'N/A'} em ${t.obraName || 'N/A'}`},
                                    drenagem: { icon: Recycle, color: 'text-orange-600', text: `Drenagem de ${t.drainingVehicleName || 'N/A'}`},
                                };
                                const currentType = transactionTypes[t.type] || { icon: Droplet, color: 'text-gray-500', text: 'Tipo Desconhecido' };
                                const Icon = currentType.icon;
                                const transactionDate = new Date(t.date); // Converte data da API
                                let fuelTypeText = (t.fuelType || 'N/A').replace(/([A-Z])/g, ' $1');
                                if (t.fuelType === 'dieselS10') fuelTypeText = 'Diesel S10';

                                return (
                                    <div key={t.id} className={`p-2.5 rounded-lg flex items-center gap-3 text-xs sm:text-sm bg-gray-50 border`}>
                                        <div className={`flex-shrink-0 ${currentType.color}`}><Icon size={20}/></div>
                                        <div className="flex-1 overflow-hidden">
                                            <p className="font-semibold text-gray-800 truncate text-sm" title={currentType.text}>{currentType.text}</p>
                                            <p className="text-[11px] text-gray-500">
                                                {transactionDate.toLocaleString('pt-BR')} por {(t.responsibleUserEmail || 'N/A').split('@')[0]}
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0 w-20">
                                            <p className={`font-bold text-sm ${t.type === 'saida' ? 'text-red-600' : 'text-green-600'}`}>
                                                {t.type === 'saida' ? '-' : '+'}{t.liters?.toFixed(2) || '0.00'} L
                                            </p>
                                            <p className="text-[11px] font-semibold capitalize text-gray-600 truncate" title={fuelTypeText}>{fuelTypeText}</p>
                                        </div>
                                        {/* Botões de Ação */}
                                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                                            <ProtectedComponent requiredPermission="editor">
                                                <button onClick={() => openEditTransactionModal(t)} title="Editar Transação" className="p-1 text-gray-400 hover:text-yellow-600 hover:bg-gray-100 rounded-full transition"><Edit size={14} /></button>
                                            </ProtectedComponent>
                                            <ProtectedComponent requiredPermission="admin">
                                                <button onClick={() => openDeleteTransactionModal(t)} title="Excluir Transação" className="p-1 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-full transition"><Trash2 size={14} /></button>
                                            </ProtectedComponent>
                                        </div>
                                    </div>
                                );
                            })}
                            {sortedTransactions.length === 0 && (
                                <p className="text-gray-500 text-center py-10 text-sm italic">Nenhuma transação registrada para este comboio.</p>
                            )}
                        </div>
                    ) : (
                        <p className="text-gray-500 text-center py-10 text-sm italic">Selecione um veículo comboio à esquerda.</p>
                    )}
                </div>
            </div>

            {/* Gerador de Relatório */}
            <ProtectedComponent requiredPermission="viewer">
                <ComboioReportGenerator
                    comboioVehicles={comboioVehicles}
                    comboioTransactions={comboioTransactions}
                    setAlertMessage={setAlertMessage}
                />
            </ProtectedComponent>

            {/* Modais */}
            {isEntradaModalOpen && selectedComboio &&
                <ComboioEntradaModal
                    user={user}
                    comboioVehicle={selectedComboio}
                    partners={partners}
                    employees={employees}
                    onClose={() => setIsEntradaModalOpen(false)}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    vehicleGroups={vehicleGroups}
                    generateAuthorizationPDF={(data, veh, par, emp, vg) => generateAuthorizationPDF(data, veh, par, emp, vg)} // Passa a função corretamente
                    obras={obras}
                    extraObraOptions={extraObraOptions}
                    reloadData={reloadData} // Passa reloadData
                />}
            {isSaidaModalOpen && selectedComboio &&
                <ComboioSaidaModal
                    user={user}
                    comboioVehicle={selectedComboio}
                    vehicles={vehicles} // Passa a lista completa
                    obras={obras}
                    employees={employees}
                    onClose={() => setIsSaidaModalOpen(false)}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    extraObraOptions={extraObraOptions}
                    vehicleGroups={vehicleGroups}
                    generateAuthorizationPDF={(data, veh, par, emp, vg) => generateAuthorizationPDF(data, veh, par, emp, vg)}
                    partners={partners} // Passa partners
                    reloadData={reloadData} // Passa reloadData
                />}
            {isDrenagemModalOpen &&
                <ComboioDrenagemModal
                    user={user}
                    vehicles={vehicles} // Passa a lista completa
                    onClose={() => setIsDrenagemModalOpen(false)}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    reloadData={reloadData} // Passa reloadData
                />}
            {isTransactionModalOpen && transactionToEdit &&
                <ComboioTransactionModal
                    user={user}
                    transaction={transactionToEdit}
                    comboioVehicle={comboioVehicles.find(v => v.id === transactionToEdit.comboioVehicleId)}
                    vehicles={vehicles}
                    partners={partners}
                    employees={employees}
                    onClose={() => { setIsTransactionModalOpen(false); setTransactionToEdit(null); }}
                    setAlertMessage={setAlertMessage}
                    apiClient={apiClient}
                    extraObraOptions={extraObraOptions}
                    vehicleGroups={vehicleGroups}
                    obras={obras}
                    PasswordConfirmationModal={PasswordConfirmationModal}
                    reloadData={reloadData} // Passa reloadData
                 />}
            {/* Modal de Exclusão usa PasswordConfirmationModal global */}
            {isDeleteModalOpen && transactionToDelete &&
                <PasswordConfirmationModal
                    message="Tem certeza que deseja excluir esta transação? A exclusão reverterá os níveis de combustível e removerá registros associados (ordem de abastecimento/despesa). Esta ação não pode ser desfeita."
                    onConfirm={handleDeleteTransaction}
                    onClose={() => setIsDeleteModalOpen(false)}
                    apiClient={apiClient} // Passa apiClient
                />}
        </div>
    );
};

export default ComboioPage;
