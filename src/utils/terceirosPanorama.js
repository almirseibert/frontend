// src/utils/terceirosPanorama.js
// ============================================================================
// Panorama dos terceirizados — visão de DIREÇÃO (todos os contratos de uma vez).
// ============================================================================
//
// Responde "qual é o panorama dos terceirizados?" em quatro recortes, todos
// derivados dos MESMOS cálculos da tela (computeContrato), sem número novo:
//   1. Totais (contratado vigente, diesel abatido, adiantamentos, saldo devedor)
//   2. Ranking por terceiro (quem concentra a exposição)
//   3. Exposição por obra (onde o dinheiro está comprometido)
//   4. Alertas (o que a direção precisa decidir: assinatura, prazo, estouro)
//
// Consumidores: components/terceirizados/RelatorioPanorama.jsx e
// utils/terceirosPanoramaPdf.js — a tela e o PDF mostram exatamente o mesmo.
// ============================================================================

import { computeContrato } from './terceirizados';
import { getPartnerDisplayName } from './partners';

const toDate = (v) => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(String(v).includes('T') ? v : `${String(v).split(' ')[0]}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
};

const DIA = 86400000;

/** Contrato "em aberto": ainda gera obrigação (não cancelado nem concluído). */
const isVigente = (contrato) => {
    const st = contrato?.status || 'ativo';
    return st !== 'cancelado' && st !== 'concluido';
};

/**
 * Monta o panorama completo.
 * @param {array}  contratos  terceiroContratos (com bloco `vigente` do backend)
 * @param {object} ctx        mesmo contexto passado a computeContrato (+ pagamentos)
 * @param {object} opts       { partners, obras, hoje }
 */
export const buildPanorama = (contratos = [], ctx = {}, opts = {}) => {
    const { partners = [], obras = [], hoje = new Date() } = opts;
    const hojeMs = hoje.getTime();
    const partnerById = new Map(partners.map((p) => [p.id, p]));
    const obraById = new Map(obras.map((o) => [o.id, o]));

    // ── Linha por contrato (base de tudo) ─────────────────────────────────────
    const linhas = contratos.map((c) => {
        const r = computeContrato(c, ctx);
        const fim = toDate(r.vigenciaFim);
        const diasRestantes = fim ? Math.ceil((fim.getTime() - hojeMs) / DIA) : null;
        const terceiro = partnerById.get(c.locadorId) || null;
        return {
            r,
            contrato: c,
            terceiroId: c.locadorId,
            terceiroNome: getPartnerDisplayName(terceiro) || '—',
            terceiroRazao: terceiro?.razaoSocial || '—',
            obraId: c.obraId,
            obraNome: obraById.get(c.obraId)?.nome || '—',
            status: c.status || 'ativo',
            vigente: isVigente(c),
            assinado: !!c.contratoAssinadoUrl,
            inicio: toDate(c.vigenciaInicio),
            fim,
            diasRestantes,
            vencido: diasRestantes !== null && diasRestantes < 0,
        };
    });

    // Só os contratos em aberto entram nos totais financeiros: cancelado não é
    // obrigação e concluído já foi acertado — somá-los inflaria o saldo devedor.
    const abertos = linhas.filter((l) => l.vigente);

    const soma = (list, pick) => list.reduce((a, l) => a + pick(l), 0);

    const kpis = {
        numTerceiros: new Set(abertos.map((l) => l.terceiroId)).size,
        numContratos: abertos.length,
        numContratosTotal: linhas.length,
        numObras: new Set(abertos.map((l) => l.obraId).filter(Boolean)).size,
        numMaquinas: new Set(abertos.flatMap((l) => l.r.machines.map((m) => m.id))).size,
        valorTotal: soma(abertos, (l) => l.r.valorTotal),
        valorOriginal: soma(abertos, (l) => l.r.valorOriginal),
        diesel: soma(abertos, (l) => l.r.diesel),
        litros: soma(abertos, (l) => l.r.litros),
        adiantamentos: soma(abertos, (l) => l.r.adiantamentos),
        saldo: soma(abertos, (l) => l.r.saldo),
        horasContratadas: soma(abertos, (l) => l.r.horasContratadas),
        horasExecutadas: soma(abertos, (l) => l.r.horasExecutadas),
    };
    kpis.aditivado = kpis.valorTotal - kpis.valorOriginal;
    kpis.progresso = kpis.horasContratadas > 0 ? kpis.horasExecutadas / kpis.horasContratadas : 0;
    // Quanto do contratado já foi liquidado (diesel abatido + adiantamentos).
    kpis.liquidado = kpis.valorTotal > 0 ? (kpis.diesel + kpis.adiantamentos) / kpis.valorTotal : 0;

    // ── Ranking por terceiro ──────────────────────────────────────────────────
    const porTerceiroMap = new Map();
    abertos.forEach((l) => {
        const cur = porTerceiroMap.get(l.terceiroId) || {
            id: l.terceiroId, nome: l.terceiroNome, razaoSocial: l.terceiroRazao,
            cnpj: partnerById.get(l.terceiroId)?.cnpj || '',
            linhas: [], obraIds: new Set(), maquinaIds: new Set(),
            valorTotal: 0, diesel: 0, adiantamentos: 0, saldo: 0,
            horasContratadas: 0, horasExecutadas: 0, semAssinatura: 0, vencidos: 0,
        };
        cur.linhas.push(l);
        if (l.obraId) cur.obraIds.add(l.obraId);
        l.r.machines.forEach((m) => cur.maquinaIds.add(m.id));
        cur.valorTotal += l.r.valorTotal;
        cur.diesel += l.r.diesel;
        cur.adiantamentos += l.r.adiantamentos;
        cur.saldo += l.r.saldo;
        cur.horasContratadas += l.r.horasContratadas;
        cur.horasExecutadas += l.r.horasExecutadas;
        if (!l.assinado) cur.semAssinatura += 1;
        if (l.vencido) cur.vencidos += 1;
        porTerceiroMap.set(l.terceiroId, cur);
    });

    const porTerceiro = [...porTerceiroMap.values()]
        .map((t) => ({
            ...t,
            numContratos: t.linhas.length,
            numObras: t.obraIds.size,
            numMaquinas: t.maquinaIds.size,
            progresso: t.horasContratadas > 0 ? t.horasExecutadas / t.horasContratadas : 0,
            // Fatia do saldo devedor total — mede dependência de um único fornecedor.
            participacao: kpis.saldo !== 0 ? t.saldo / kpis.saldo : 0,
        }))
        .sort((a, b) => b.saldo - a.saldo);

    // ── Exposição por obra ────────────────────────────────────────────────────
    const porObraMap = new Map();
    abertos.forEach((l) => {
        const key = l.obraId || 'sem-obra';
        const cur = porObraMap.get(key) || {
            id: l.obraId, nome: l.obraNome,
            localizacao: obraById.get(l.obraId)?.localizacao || '',
            terceiroIds: new Set(), maquinaIds: new Set(),
            numContratos: 0, valorTotal: 0, diesel: 0, adiantamentos: 0, saldo: 0,
        };
        cur.numContratos += 1;
        cur.terceiroIds.add(l.terceiroId);
        l.r.machines.forEach((m) => cur.maquinaIds.add(m.id));
        cur.valorTotal += l.r.valorTotal;
        cur.diesel += l.r.diesel;
        cur.adiantamentos += l.r.adiantamentos;
        cur.saldo += l.r.saldo;
        porObraMap.set(key, cur);
    });

    const porObra = [...porObraMap.values()]
        .map((o) => ({ ...o, numTerceiros: o.terceiroIds.size, numMaquinas: o.maquinaIds.size }))
        .sort((a, b) => b.saldo - a.saldo);

    // ── Alertas (o que exige decisão) ─────────────────────────────────────────
    const alertas = [];
    const push = (tipo, severidade, titulo, itens, descricao) => {
        if (itens.length > 0) alertas.push({ tipo, severidade, titulo, descricao, itens });
    };

    push('sem-assinatura', 'alta', 'Contratos sem via assinada anexada',
        abertos.filter((l) => !l.assinado),
        'Obrigação em execução sem documento assinado no sistema — risco jurídico se houver divergência.');

    push('vencido', 'alta', 'Vigência vencida com saldo em aberto',
        abertos.filter((l) => l.vencido && l.r.saldo > 0.01),
        'O prazo terminou e ainda há valor a pagar: exige acerto final ou termo aditivo de prazo.');

    push('vencendo', 'media', 'Vigência terminando em até 30 dias',
        abertos.filter((l) => l.diasRestantes !== null && l.diasRestantes >= 0 && l.diasRestantes <= 30),
        'Decidir renovação, aditivo ou encerramento antes do vencimento.');

    push('estouro-horas', 'media', 'Horas executadas acima do contratado',
        abertos.filter((l) => l.r.horasContratadas > 0 && l.r.progresso > 1.001),
        'A obra consumiu mais horas do que o plano contratado — sem aditivo, a hora extra não tem cobertura.');

    push('sem-maquina', 'media', 'Contratos sem equipamento vinculado',
        abertos.filter((l) => l.r.numMaquinas === 0),
        'Sem máquina vinculada não há como apurar horas nem abater diesel — o saldo fica igual ao valor cheio.');

    push('saldo-negativo', 'baixa', 'Pago além do contratado',
        abertos.filter((l) => l.r.saldo < -0.01),
        'Diesel abatido + adiantamentos ultrapassam o valor do contrato: crédito a compensar.');

    return { linhas, abertos, kpis, porTerceiro, porObra, alertas };
};

export const STATUS_LABEL = {
    ativo: 'Ativo', assinado: 'Assinado', concluido: 'Concluído', cancelado: 'Cancelado',
};
