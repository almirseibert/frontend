// src/utils/terceirizados.js
// ============================================================================
// Terceirizados — cálculo por CONTRATO (valor fechado)
// ============================================================================
//
// Modelo:
//   1 contrato = 1 terceiro (locador) + 1 obra + valor FECHADO.
//   Horas executadas = acompanhamento físico (progresso), NÃO viram dinheiro.
//   saldo a pagar = valorTotal − diesel abatido − adiantamentos.
//
// As máquinas de um contrato são DERIVADAS, não digitadas. O que liga uma hora ou
// um litro a um contrato são quatro chaves que o próprio lançamento já carrega:
//
//      terceiro (vehicles.locadorId)  ×  obra do lançamento
//    ×  subgrupo do veículo (itensContratados[].type)  ×  data dentro da vigência
//
// A máquina pode transitar entre obras durante a execução e estar sob dois
// contratos vigentes ao mesmo tempo: a obra e a DATA do lançamento é que decidem
// de onde a hora conta e de onde o diesel é abatido. Por isso o filtro é por
// lançamento e nunca por `vehicles.obraAtualId`, que diz apenas onde a máquina
// está hoje — usá-lo faria a mudança de obra reescrever o passado do contrato
// anterior.
//
// O campo `terceiro_contratos.maquinas` (lista digitada) sobrevive só como LEGADO
// de contratos já encerrados, para que saldo histórico não mude de valor porque o
// modelo mudou. Ver `usaListaLegada`.
//
// Consumidores:
//   1. pages/TerceirizadosPage.js                 (painel terceiro → contrato/obra → máquina)
//   2. components/analise/TerceirizadoObraResumo   (resumo por obra)
//   3. getPendenciasTerceirizados                  (o que NÃO caiu em contrato)
// ============================================================================

// ─── Vigência do contrato ───────────────────────────────────────────────────
// Um contrato conta para dinheiro (valor devido, saldo, custo por obra) enquanto
// não chega a um estado TERMINAL. `assinado` não é terminal — é uma PROMOÇÃO de
// `ativo` (o upload do contrato assinado congela a minuta), então é o estado mais
// firme que existe, não um encerramento.
//
// Espelhado no backend em `controllers/planejamentoController.js`
// (`WHERE status NOT IN (...)`) e em `utils/terceirosCusto.js`. As duas
// implementações precisam usar a MESMA lista: foi a divergência de escopo entre
// elas que fez o Panorama e esta página mostrarem saldos diferentes.
export const STATUS_ENCERRADOS = ['cancelado', 'concluido'];

export const isContratoVigente = (c) =>
    !STATUS_ENCERRADOS.includes(String(c?.status || 'ativo').toLowerCase());

/** Só os contratos que ainda representam dinheiro. Use em QUALQUER soma de R$. */
export const filtrarContratosVigentes = (lista) =>
    (Array.isArray(lista) ? lista : []).filter(isContratoVigente);

const COMBOIO_FUEL_KEY = {
    dieselS10: 'Diesel S10',
    dieselComum: 'Diesel S500',
};

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

const toDate = (input) => {
    if (!input) return null;
    if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
    let s = String(input);
    if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T');
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
};

const recordDate = (rec) => toDate(rec?.date ?? rec?.data);

const inPeriod = (d, inicio, fim) => {
    if (!d) return false;
    if (inicio && d < inicio) return false;
    if (fim && d > fim) return false;
    return true;
};

/** Normaliza { inicio, fim } (strings/Date) para Date com limites de dia. */
export const normalizePeriod = (period = {}) => {
    const { inicio, fim } = period;
    const start = inicio ? toDate(inicio) : null;
    const end = fim ? toDate(fim) : null;
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);
    return { inicio: start, fim: end };
};

/** É um veículo terceirizado/locado? */
export const isVehicleTerceirizado = (vehicle) => !!vehicle?.isOutsourced;

// ─── Status: o que já aconteceu ─────────────────────────────────────────────
// O sistema grava as DUAS grafias de concluída (com e sem acento) — o backend tem o
// helper canônico `isConcluida` em services/comboioEstoqueService.js exatamente por
// isso. Comparar com a string acentuada crua descartava em silêncio todo abastecimento
// gravado sem acento: não abatia do contrato e nem aparecia como pendência.
/** Abastecimento efetivamente consumado (aceita as duas grafias gravadas). */
export const isRefuelingConcluida = (status) =>
    !status || status === 'Concluída' || status === 'Concluida';

// Saída de comboio bloqueada (leitura/orçamento) é PENDENTE, não consumada: abatê-la
// cobraria do terceiro um diesel que ainda não saiu do tanque. Espelha STATUS_BLOQUEADOS.
const COMBOIO_STATUS_BLOQUEADOS = ['BloqueadoLeitura', 'BloqueadoOrcamento'];
/** Saída de comboio que de fato entregou combustível. */
export const isSaidaEfetivada = (t) =>
    t?.type === 'saida' && !COMBOIO_STATUS_BLOQUEADOS.includes(t?.status);

/** Valor (R$) de um abastecimento comum, usando preço real e fallback do posto. */
export const getRefuelingFuelValue = (refueling, partners = []) => {
    const litros = num(refueling?.litrosAbastecidos);
    if (litros <= 0) return 0;
    let preco = num(refueling?.pricePerLiter);
    if (preco <= 0) {
        const partner = partners.find((p) => p.id === refueling?.partnerId);
        preco = num(partner?.fuel_prices?.[refueling?.fuelType]);
    }
    return litros * preco;
};

/** Valor (R$) de uma saída de comboio: usa o pricePerLiter da última entrada
 *  do mesmo comboio+combustível anterior à saída; fallback fuel_prices do posto. */
export const getComboioSaidaFuelValue = (saida, comboioTransactions = [], partners = []) => {
    const litros = num(saida?.liters);
    if (litros <= 0) return 0;

    const saidaDate = recordDate(saida);
    const entradas = comboioTransactions
        .filter((t) =>
            t?.type === 'entrada' &&
            t.comboioVehicleId === saida?.comboioVehicleId &&
            t.fuelType === saida?.fuelType)
        .map((t) => ({ t, d: recordDate(t) }))
        .filter((x) => x.d && (!saidaDate || x.d <= saidaDate))
        .sort((a, b) => b.d - a.d);

    const lastEntrada = entradas[0]?.t;
    let preco = num(lastEntrada?.pricePerLiter);
    if (preco <= 0 && lastEntrada) {
        const partner = partners.find((p) => p.id === lastEntrada.partnerId);
        const key = COMBOIO_FUEL_KEY[saida?.fuelType] || saida?.fuelType;
        preco = num(partner?.fuel_prices?.[key]);
    }
    return litros * preco;
};

/** Normaliza o campo `maquinas` do contrato (JSON array de vehicleId). */
export const contratoMaquinaIds = (contrato) => {
    const m = contrato?.maquinas;
    if (Array.isArray(m)) return m.filter(Boolean);
    if (typeof m === 'string') {
        try { const p = JSON.parse(m); return Array.isArray(p) ? p.filter(Boolean) : []; } catch { return []; }
    }
    return [];
};

// ─── Pertencimento de um lançamento a um contrato ───────────────────────────
// A máquina NÃO é digitada no contrato. Ela é consequência de três chaves que já
// existem no lançamento (apontamento de hora, abastecimento, saída de comboio):
//
//      veículo é do terceiro (isOutsourced + locadorId)
//    E o lançamento é na OBRA do contrato
//    E o subgrupo do veículo está entre os contratados
//    E a data do lançamento cai na vigência (com aditivo de prazo)
//
// Por que por LANÇAMENTO e não pelo cadastro do veículo: `vehicles.obraAtualId`
// diz onde a máquina está HOJE; o contrato apura um PERÍODO. Derivar pelo estado
// atual faria a máquina sumir do contrato da obra anterior no dia em que ela se
// mudasse, levando junto horas e diesel já apurados — o saldo de um contrato
// encerrado mudaria sozinho. A mesma máquina pode oscilar entre duas obras com
// contratos vigentes simultâneos: a data e a obra do lançamento é que dizem de
// qual contrato aquela hora e aquele litro saem.

/** Subgrupos contratados. Vazio = contrato sem plano por subgrupo (aceita todos). */
export const contratoSubgrupos = (contrato) => {
    let itens = contrato?.vigente?.itensContratados ?? contrato?.itensContratados;
    if (typeof itens === 'string') { try { itens = JSON.parse(itens); } catch { itens = []; } }
    if (!Array.isArray(itens)) return [];
    return [...new Set(itens.map((i) => String(i?.type || '').trim()).filter(Boolean))];
};

// `itensContratados[].type` é um SUBGRUPO quando o tipo tem subgrupos cadastrados,
// e o próprio TIPO quando não tem (mesma expansão do ObraModal). Por isso o casamento
// olha os dois campos do veículo.
const casaSubgrupo = (vehicle, type) => {
    const t = String(type || '').trim();
    if (!t) return false;
    const sub = String(vehicle?.sub_tipo || '').trim();
    if (sub) return sub === t;
    return String(vehicle?.tipo || '').trim() === t;
};

/**
 * O veículo é elegível a um contrato pelo CADASTRO (terceiro + subgrupo)?
 * Não olha obra nem data — isso é do lançamento.
 */
export const veiculoElegivelAoContrato = (vehicle, contrato) => {
    if (!vehicle || !contrato) return false;
    if (!isVehicleTerceirizado(vehicle)) return false;
    if (!vehicle.locadorId || String(vehicle.locadorId) !== String(contrato.locadorId)) return false;
    const subs = contratoSubgrupos(contrato);
    if (subs.length === 0) return true;      // contrato sem plano por subgrupo
    return subs.some((t) => casaSubgrupo(vehicle, t));
};

// Contrato ENCERRADO (concluído/cancelado) que já tem a lista digitada continua
// lendo a lista: saldo histórico não muda de valor porque o modelo mudou. Contrato
// vigente sempre deriva — é justamente para ele que a derivação existe.
const usaListaLegada = (contrato) =>
    !isContratoVigente(contrato) && contratoMaquinaIds(contrato).length > 0;

/**
 * Predicado de pertencimento: o lançamento `rec` (com obraId e data) feito pelo
 * veículo `vehicleId` conta para este contrato?
 * `vById` é um Map(id → vehicle); `inicio`/`fim` já normalizados.
 */
const fazParteDoContrato = (contrato, vehicleId, recObraId, recDate, vById, inicio, fim, idsLegado) => {
    if (!vehicleId) return false;
    if (!inPeriod(recDate, inicio, fim)) return false;
    // Lançamento sem obra (abastecimento de estoque, lançamento sem obra informada)
    // não tem contrato a que pertencer — vira pendência, não some no rateio.
    if (!recObraId || String(recObraId) !== String(contrato?.obraId)) return false;
    if (idsLegado) return idsLegado.has(vehicleId);
    return veiculoElegivelAoContrato(vById.get(vehicleId), contrato);
};

/**
 * Esteve na obra do contrato em algum momento da vigência?
 * Usa `obra.historicoVeiculos` (entrada/saída datadas) e cai no `obraAtualId`
 * quando a obra não traz histórico carregado. Serve só para LISTAR a máquina:
 * o que conta horas e diesel é sempre o lançamento.
 */
const passouPelaObra = (vehicle, contrato, obras, inicio, fim) => {
    if (String(vehicle?.obraAtualId || '') === String(contrato?.obraId || '')) return true;
    const obra = obras.find((o) => String(o.id) === String(contrato?.obraId));
    const hist = Array.isArray(obra?.historicoVeiculos) ? obra.historicoVeiculos : [];
    return hist.some((h) => {
        if (String(h?.veiculoId) !== String(vehicle?.id)) return false;
        const ent = toDate(h?.dataEntrada);
        const sai = toDate(h?.dataSaida);          // null = ainda na obra
        if (fim && ent && ent > fim) return false;
        if (inicio && sai && sai < inicio) return false;
        return true;
    });
};

/**
 * Máquinas de um contrato: DERIVADAS. Entram as elegíveis (terceiro + subgrupo)
 * que estiveram na obra do contrato dentro da vigência — inclusive as que ainda
 * não lançaram nada (aparecem zeradas). Quem já lançou é acrescentado em
 * `computeContrato`, porque o lançamento é prova mais forte que a alocação.
 */
export const getContratoMachines = (contrato, obras = [], vehicles = []) => {
    if (usaListaLegada(contrato)) {
        const ids = new Set(contratoMaquinaIds(contrato));
        return vehicles.filter((v) => ids.has(v.id));
    }
    const vig = contrato?.vigente || contrato || {};
    const { inicio, fim } = normalizePeriod({
        inicio: contrato?.vigenciaInicio,
        fim: vig.vigenciaFim ?? contrato?.vigenciaFim,
    });
    return vehicles.filter((v) =>
        veiculoElegivelAoContrato(v, contrato) && passouPelaObra(v, contrato, obras, inicio, fim));
};


/**
 * Calcula os números de UM contrato.
 * @param {object} contrato
 * @param {object} ctx { vehicles, obras, dailyWorkLogs, refuelings, comboioTransactions, partners, pagamentos }
 * @returns números do contrato + equipamentos detalhados
 */
export const computeContrato = (contrato, ctx = {}) => {
    const {
        vehicles = [], obras = [], dailyWorkLogs = [], refuelings = [],
        comboioTransactions = [], partners = [], pagamentos = [],
    } = ctx;

    // Valores VIGENTES = contrato original + termos aditivos ASSINADOS. O backend
    // manda esse bloco pronto (utils/contratoAditivos.js); a linha do contrato segue
    // sendo o original (usado para exibir "original R$ X" e gerar a minuta).
    // Contrato sem aditivo: `vigente` espelha a base, então o cálculo não muda.
    const vig = contrato?.vigente || contrato || {};

    const obra = obras.find((o) => o.id === contrato?.obraId) || null;
    // Aditivo de prazo estende a janela de apuração de horas e diesel.
    const { inicio, fim } = normalizePeriod({ inicio: contrato?.vigenciaInicio, fim: vig.vigenciaFim ?? contrato?.vigenciaFim });

    const machines = getContratoMachines(contrato, obras, vehicles);
    const vById = new Map(vehicles.map((v) => [v.id, v]));
    const idsLegado = usaListaLegada(contrato) ? new Set(contratoMaquinaIds(contrato)) : null;
    const pertence = (vehicleId, recObraId, recDate) =>
        fazParteDoContrato(contrato, vehicleId, recObraId, recDate, vById, inicio, fim, idsLegado);

    // Horas executadas — apenas acompanhamento físico.
    // O apontamento já traz obra e data: são eles que dizem a qual contrato a hora
    // pertence. A mesma máquina pode apontar na obra A na segunda e na obra B na
    // quarta, com dois contratos vigentes; cada dia cai no contrato certo.
    let horasExecutadas = 0;
    const horasPorMaquina = new Map();
    dailyWorkLogs.forEach((log) => {
        if (!pertence(log?.vehicleId, log?.obraId, recordDate(log))) return;
        if (log?.justificativaTipo) return;
        const h = num(log.totalHours);
        horasExecutadas += h;
        horasPorMaquina.set(log.vehicleId, (horasPorMaquina.get(log.vehicleId) || 0) + h);
    });

    // Diesel abatido — por máquina
    const porMaquina = new Map();
    const bump = (id, litros, valor) => {
        const cur = porMaquina.get(id) || { litros: 0, valor: 0 };
        cur.litros += litros; cur.valor += valor;
        porMaquina.set(id, cur);
    };
    let litros = 0;
    let diesel = 0;

    refuelings.forEach((r) => {
        if (!isRefuelingConcluida(r?.status)) return;
        if (!pertence(r?.vehicleId, r?.obraId, recordDate(r))) return;
        const v = getRefuelingFuelValue(r, partners);
        const l = num(r.litrosAbastecidos);
        litros += l; diesel += v;
        bump(r.vehicleId, l, v);
    });
    comboioTransactions.forEach((t) => {
        if (!isSaidaEfetivada(t)) return;
        if (!pertence(t?.receivingVehicleId, t?.obraId, recordDate(t))) return;
        const v = getComboioSaidaFuelValue(t, comboioTransactions, partners);
        const l = num(t.liters);
        litros += l; diesel += v;
        bump(t.receivingVehicleId, l, v);
    });

    // Adiantamentos vinculados ao contrato
    const adiantamentos = pagamentos.reduce(
        (acc, p) => (p?.contratoId === contrato?.id ? acc + num(p.valor) : acc), 0);

    const valorTotal = num(vig.valorTotal);
    const valorOriginal = num(contrato?.valorTotal);
    const saldo = valorTotal - diesel - adiantamentos;
    const horasContratadas = num(vig.horasContratadas);
    const progresso = horasContratadas > 0 ? horasExecutadas / horasContratadas : 0;

    // A lista final é a união de quem esteve alocado na obra com quem efetivamente
    // lançou hora ou diesel no contrato. A segunda parte cobre a máquina que passou
    // pela obra sem alocação formal registrada: ela apontou, logo ela executou.
    const idsComLancamento = new Set([...porMaquina.keys(), ...horasPorMaquina.keys()]);
    const todas = [...machines];
    idsComLancamento.forEach((id) => {
        if (todas.some((v) => v.id === id)) return;
        const v = vById.get(id);
        if (v) todas.push(v);
    });

    const equipamentos = todas.map((v) => {
        const m = porMaquina.get(v.id) || { litros: 0, valor: 0 };
        return { vehicle: v, litros: m.litros, diesel: m.valor, horas: horasPorMaquina.get(v.id) || 0 };
    });

    // Plano contratado por subgrupo (itensContratados), normalizado — já consolidado
    // com os aditivos assinados quando o backend manda o bloco `vigente`.
    let itens = vig.itensContratados;
    if (typeof itens === 'string') { try { itens = JSON.parse(itens); } catch { itens = []; } }
    const itensContratados = Array.isArray(itens)
        ? itens.filter((i) => i && i.type).map((i) => ({ type: i.type, horas: num(i.hours), valorHora: num(i.price), subtotal: num(i.hours) * num(i.price) }))
        : [];

    // Aditivos assinados do contrato (linha do tempo e rótulo "original R$ X").
    const aditivos = Array.isArray(contrato?.aditivos) ? contrato.aditivos : [];
    const aditivosAssinados = aditivos.filter((a) => a?.status === 'assinado');

    return {
        contrato, obra, machines: todas, equipamentos, itensContratados,
        numMaquinas: todas.length,
        horasExecutadas, horasContratadas, progresso,
        valorTotal, litros, diesel, adiantamentos, saldo,
        // Aditivos: valorOriginal ≠ valorTotal quando há aditivo assinado.
        valorOriginal, aditivos, aditivosAssinados,
        temAditivos: aditivosAssinados.length > 0,
        vigenciaFim: vig.vigenciaFim ?? contrato?.vigenciaFim,
    };
};

/**
 * Lista os abastecimentos (registros individuais) que abatem de UM contrato:
 * refuelings comuns + saídas de comboio das máquinas do contrato, dentro da vigência.
 * Retorna [{ date, vehicle, litros, valor, fonte }] ordenado do mais recente.
 */
export const getContratoAbastecimentos = (contrato, ctx = {}) => {
    const {
        vehicles = [], refuelings = [], comboioTransactions = [], partners = [],
    } = ctx;
    const vig = contrato?.vigente || contrato || {};
    const { inicio, fim } = normalizePeriod({
        inicio: contrato?.vigenciaInicio, fim: vig.vigenciaFim ?? contrato?.vigenciaFim });
    const vById = new Map(vehicles.map((v) => [v.id, v]));
    const idsLegado = usaListaLegada(contrato) ? new Set(contratoMaquinaIds(contrato)) : null;
    const pertence = (vehicleId, recObraId, recDate) =>
        fazParteDoContrato(contrato, vehicleId, recObraId, recDate, vById, inicio, fim, idsLegado);
    const out = [];

    refuelings.forEach((r) => {
        if (!isRefuelingConcluida(r?.status)) return;
        const d = recordDate(r);
        if (!pertence(r?.vehicleId, r?.obraId, d)) return;
        out.push({
            date: d, vehicle: vById.get(r.vehicleId) || null,
            litros: num(r.litrosAbastecidos), valor: getRefuelingFuelValue(r, partners), fonte: 'posto',
        });
    });
    comboioTransactions.forEach((t) => {
        if (!isSaidaEfetivada(t)) return;
        const d = recordDate(t);
        if (!pertence(t?.receivingVehicleId, t?.obraId, d)) return;
        out.push({
            date: d, vehicle: vById.get(t.receivingVehicleId) || null,
            litros: num(t.liters), valor: getComboioSaidaFuelValue(t, comboioTransactions, partners), fonte: 'comboio',
        });
    });

    return out.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
};

/**
 * Apontamentos (daily_work_logs) que compõem as horas de UM contrato: os logs das
 * máquinas vinculadas, na obra do contrato e dentro da vigência. Inclui os dias com justificativa
 * (`horas: 0`) — eles NÃO somam no progresso, mas explicam os dias parados.
 * Retorna [{ date, vehicle, horas, justificativaTipo, employeeName, observation, obraId }]
 * do mais recente para o mais antigo.
 */
export const getContratoApontamentos = (contrato, ctx = {}) => {
    const { vehicles = [], dailyWorkLogs = [] } = ctx;
    const vig = contrato?.vigente || contrato || {};
    const { inicio, fim } = normalizePeriod({
        inicio: contrato?.vigenciaInicio, fim: vig.vigenciaFim ?? contrato?.vigenciaFim });
    const vById = new Map(vehicles.map((v) => [v.id, v]));
    const idsLegado = usaListaLegada(contrato) ? new Set(contratoMaquinaIds(contrato)) : null;

    return dailyWorkLogs
        .filter((log) => fazParteDoContrato(
            contrato, log?.vehicleId, log?.obraId, recordDate(log), vById, inicio, fim, idsLegado))
        .map((log) => ({
            date: recordDate(log),
            vehicle: vById.get(log.vehicleId) || null,
            horas: log.justificativaTipo ? 0 : num(log.totalHours),
            justificativaTipo: log.justificativaTipo || null,
            employeeName: log.employeeName || null,
            observation: log.observation || null,
            obraId: log.obraId,
        }))
        .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
};

/**
 * Agrega apontamentos por mês (AAAA-MM), do mais antigo para o mais recente.
 * @returns [{ mes: '2026-03', label: 'mar/26', horas, dias, diasParados }]
 */
export const agruparApontamentosPorMes = (apontamentos = []) => {
    const acc = new Map();
    apontamentos.forEach((a) => {
        if (!a.date) return;
        const mes = `${a.date.getFullYear()}-${String(a.date.getMonth() + 1).padStart(2, '0')}`;
        const cur = acc.get(mes) || { mes, label: a.date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), horas: 0, dias: 0, diasParados: 0 };
        if (a.justificativaTipo) cur.diasParados += 1;
        else { cur.horas += a.horas; cur.dias += 1; }
        acc.set(mes, cur);
    });
    return [...acc.values()].sort((a, b) => a.mes.localeCompare(b.mes));
};

/** Agrega todos os contratos de um terceiro (locador). */
export const computeContratosPorTerceiro = (locadorId, contratos = [], ctx = {}) => {
    const list = contratos
        .filter((c) => c.locadorId === locadorId)
        .map((c) => computeContrato(c, ctx));

    const obraIds = [...new Set(list.map((r) => r.contrato.obraId).filter(Boolean))];
    const machineIds = new Set();
    list.forEach((r) => r.machines.forEach((m) => machineIds.add(m.id)));

    // Contratos vigentes (não cancelados/concluídos) sem o PDF assinado anexado.
    const semAssinatura = list.filter((r) =>
        isContratoVigente(r.contrato) && !r.contrato?.contratoAssinadoUrl).length;

    const totais = list.reduce((a, r) => ({
        valorTotal: a.valorTotal + r.valorTotal,
        diesel: a.diesel + r.diesel,
        adiantamentos: a.adiantamentos + r.adiantamentos,
        saldo: a.saldo + r.saldo,
        litros: a.litros + r.litros,
    }), { valorTotal: 0, diesel: 0, adiantamentos: 0, saldo: 0, litros: 0 });

    return {
        contratos: list, obraIds, numObras: obraIds.length,
        numMaquinas: machineIds.size, semAssinatura, ...totais,
    };
};

/**
 * Resumo por OBRA (usado em TerceirizadoObraResumo). Soma os contratos daquela
 * obra. Mantém shape compatível: { equipamentos, devido, combustivelAbatido, saldo }.
 * ctx precisa conter `contratos` (além de vehicles/obras/…).
 */
export const computeTerceirizadoPorObra = (obraId, obras = [], vehicles = [], ctx = {}) => {
    const { contratos = [] } = ctx;
    // Cancelado/concluído não é dinheiro devido — filtro aplicado AQUI para que
    // todo consumidor deste agregador herde a mesma regra.
    const doObra = filtrarContratosVigentes(contratos).filter((c) => c.obraId === obraId);
    if (doObra.length === 0) return { equipamentos: [], devido: 0, combustivelAbatido: 0, saldo: 0 };

    const fullCtx = { ...ctx, vehicles, obras };
    const results = doObra.map((c) => computeContrato(c, fullCtx));

    const equipMap = new Map();
    results.forEach((r) => r.equipamentos.forEach((e) => equipMap.set(e.vehicle.id, e)));

    return {
        equipamentos: [...equipMap.values()],
        devido: results.reduce((a, r) => a + r.valorTotal, 0),
        combustivelAbatido: results.reduce((a, r) => a + r.diesel, 0),
        saldo: results.reduce((a, r) => a + r.saldo, 0),
    };
};

// ============================================================================
// Plano de trabalho da OBRA × contratos de terceiros
// ============================================================================
//
// O plano original da obra (horasContratadasPorSubTipo) é o teto. Cada contrato
// de terceiro consome horas desse plano por SUBGRUPO. O saldo disponível para um
// novo contrato é:
//
//      saldo(subgrupo) = horas do plano da obra
//                      − horas já contratadas por OUTROS contratos de terceiro
//
// A execução física (dailyWorkLogs) NÃO entra nessa conta: ela mede progresso,
// não compromisso contratual. Vale para os dois tipos de contrato (por horas e
// valor fechado) — no fechado as horas também saem do mesmo saldo, só não têm
// valor/hora individual.
// ============================================================================

/** Itens contratados (base + aditivos, quando houver) de um contrato, normalizados. */
export const contratoItensVigentes = (contrato) => {
    const raw = contrato?.vigente?.itensContratados ?? contrato?.itensContratados;
    let arr = raw;
    if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { arr = []; } }
    if (!Array.isArray(arr)) return [];
    return arr.filter((i) => i && i.type)
        .map((i) => ({ type: String(i.type), hours: num(i.hours), price: num(i.price) }));
};

/** Horas por subgrupo já comprometidas com terceiros numa obra, exceto um contrato. */
export const horasTerceirizadasPorSubTipo = (obraId, contratos = [], exceptContratoId = null) => {
    const out = {};
    contratos.forEach((c) => {
        if (!c || c.obraId !== obraId) return;
        if (exceptContratoId && c.id === exceptContratoId) return;
        if (c.status === 'cancelado') return;
        contratoItensVigentes(c).forEach((i) => {
            out[i.type] = (out[i.type] || 0) + i.hours;
        });
    });
    return out;
};

/**
 * Plano de trabalho da obra com o saldo disponível para um contrato de terceiro.
 * @returns {Array<{type, horasPlano, valorHoraPlano, horasOutros, saldo, foraDoPlano}>}
 *          Os subgrupos fora do plano da obra (contratos legados) vêm ao final
 *          com `foraDoPlano: true` e horasPlano 0.
 */
export const planoTrabalhoDisponivel = ({ obra, contratos = [], exceptContratoId = null, incluirTypes = [] } = {}) => {
    const parse = (v) => {
        if (!v) return {};
        if (typeof v === 'string') { try { return JSON.parse(v) || {}; } catch { return {}; } }
        return v;
    };
    const horasPlano = parse(obra?.horasContratadasPorSubTipo);
    const valoresPlano = parse(obra?.valoresPorSubTipo);
    const outros = horasTerceirizadasPorSubTipo(obra?.id, contratos, exceptContratoId);

    const types = [...new Set([...Object.keys(horasPlano), ...incluirTypes.filter(Boolean)])];
    return types
        .map((type) => {
            const hPlano = num(horasPlano[type]);
            const hOutros = num(outros[type]);
            return {
                type,
                horasPlano: hPlano,
                valorHoraPlano: num(valoresPlano[type]),
                horasOutros: hOutros,
                saldo: hPlano - hOutros,
                foraDoPlano: !(type in horasPlano),
            };
        })
        .sort((a, b) => (a.foraDoPlano === b.foraDoPlano
            ? a.type.localeCompare(b.type)
            : (a.foraDoPlano ? 1 : -1)));
};

// ============================================================================
// Pendências — diesel e horas de terceiro que não caem em contrato nenhum
// ============================================================================
//
// Com a máquina digitada, esquecer de vincular um veículo era invisível: o diesel
// dele não abatia do contrato (saldo a pagar MAIOR, sempre a favor do terceiro) e
// ao mesmo tempo continuava virando despesa da obra em `expenses`. O mesmo litro
// entrava na conta duas vezes e nada aparecia na tela.
//
// Derivando, a superfície encolhe, mas não zera: lançamento sem obra, terceiro sem
// contrato naquela obra/data, subgrupo não contratado, cadastro incompleto. Nenhum
// desses pode sumir em silêncio — é dinheiro sem dono.

const MOTIVOS = {
    semObra: 'Lançamento sem obra informada',
    semLocador: 'Veículo de terceiro sem locador no cadastro',
    semSubgrupo: 'Veículo sem subgrupo (tipo/sub_tipo) no cadastro',
    semContrato: 'Terceiro sem contrato vigente nesta obra na data',
    subgrupoNaoContratado: 'Subgrupo do veículo não está no contrato da obra',
};

/**
 * Lançamentos de veículos de terceiros que não pertencem a nenhum contrato.
 * @returns [{ vehicle, vehicleId, motivo, obraId, litros, valor, horas, ocorrencias, ultimaData }]
 *          ordenado pelo valor em R$ parado, do maior para o menor.
 */
export const getPendenciasTerceirizados = (contratos = [], ctx = {}) => {
    const {
        vehicles = [], dailyWorkLogs = [], refuelings = [],
        comboioTransactions = [], partners = [],
    } = ctx;

    const vById = new Map(vehicles.map((v) => [v.id, v]));
    const vigentes = filtrarContratosVigentes(contratos);
    const acc = new Map();

    const registrar = (vehicle, motivo, obraId, date, { litros = 0, valor = 0, horas = 0 }) => {
        const k = `${vehicle.id}|${motivo}|${obraId || '—'}`;
        const cur = acc.get(k) || {
            vehicle, vehicleId: vehicle.id, motivo, obraId: obraId || null,
            litros: 0, valor: 0, horas: 0, ocorrencias: 0, ultimaData: null,
        };
        cur.litros += litros; cur.valor += valor; cur.horas += horas;
        cur.ocorrencias += 1;
        if (date && (!cur.ultimaData || date > cur.ultimaData)) cur.ultimaData = date;
        acc.set(k, cur);
    };

    // Por que ESTE lançamento ficou sem contrato? A resposta tem que ser acionável:
    // "cadastre o subgrupo" e "o terceiro não tem contrato aqui" pedem coisas
    // diferentes de quem lê a tela.
    const diagnosticar = (vehicle, obraId, date) => {
        if (!obraId) return MOTIVOS.semObra;
        if (!vehicle.locadorId) return MOTIVOS.semLocador;
        const doTerceiroNaObra = vigentes.filter((c) =>
            String(c.locadorId) === String(vehicle.locadorId) &&
            String(c.obraId) === String(obraId));
        if (doTerceiroNaObra.length === 0) return MOTIVOS.semContrato;
        // Existe contrato na obra, mas a data ou o subgrupo não casam.
        const naData = doTerceiroNaObra.filter((c) => {
            const vig = c.vigente || c;
            const { inicio, fim } = normalizePeriod({
                inicio: c.vigenciaInicio, fim: vig.vigenciaFim ?? c.vigenciaFim });
            return inPeriod(date, inicio, fim);
        });
        if (naData.length === 0) return MOTIVOS.semContrato;
        if (!vehicle.sub_tipo && !vehicle.tipo) return MOTIVOS.semSubgrupo;
        return MOTIVOS.subgrupoNaoContratado;
    };

    // Um lançamento pertence a ALGUM contrato vigente?
    const temDono = (vehicleId, obraId, date) => vigentes.some((c) => {
        const vig = c.vigente || c;
        const { inicio, fim } = normalizePeriod({
            inicio: c.vigenciaInicio, fim: vig.vigenciaFim ?? c.vigenciaFim });
        const idsLegado = usaListaLegada(c) ? new Set(contratoMaquinaIds(c)) : null;
        return fazParteDoContrato(c, vehicleId, obraId, date, vById, inicio, fim, idsLegado);
    });

    const avaliar = (vehicleId, obraId, date, valores) => {
        const vehicle = vById.get(vehicleId);
        if (!vehicle || !isVehicleTerceirizado(vehicle)) return;
        if (temDono(vehicleId, obraId, date)) return;
        registrar(vehicle, diagnosticar(vehicle, obraId, date), obraId, date, valores);
    };

    refuelings.forEach((r) => {
        if (!isRefuelingConcluida(r?.status)) return;
        avaliar(r?.vehicleId, r?.obraId, recordDate(r), {
            litros: num(r.litrosAbastecidos), valor: getRefuelingFuelValue(r, partners),
        });
    });
    comboioTransactions.forEach((t) => {
        if (!isSaidaEfetivada(t)) return;
        avaliar(t?.receivingVehicleId, t?.obraId, recordDate(t), {
            litros: num(t.liters), valor: getComboioSaidaFuelValue(t, comboioTransactions, partners),
        });
    });
    dailyWorkLogs.forEach((log) => {
        if (log?.justificativaTipo) return;
        avaliar(log?.vehicleId, log?.obraId, recordDate(log), { horas: num(log.totalHours) });
    });

    return [...acc.values()].sort((a, b) => b.valor - a.valor || b.horas - a.horas);
};

export const PENDENCIA_MOTIVOS = MOTIVOS;
