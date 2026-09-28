// src/utils/periodosObra.js
//
// Espelho de frotasmak/utils/periodosObra.js: um veículo não pode estar em duas
// obras no mesmo dia. O backend é quem bloqueia; aqui é só para avisar antes.
// Mesmo critério de dia (dia UTC do instante — acerta tanto 00:00 BRT quanto o
// 21:00 BRT da véspera gravado por `new Date('AAAA-MM-DD')`) e troca no mesmo
// dia permitida.

const FIM_ABERTO = '9999-12-31';

/** Dia civil 'AAAA-MM-DD' de uma data vinda da API ou de um <input type="date">. */
export const diaCivil = (valor) => {
    if (valor === null || valor === undefined || valor === '') return null;
    if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
    const d = valor instanceof Date ? valor : new Date(valor);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
};

/** 'AAAA-MM-DD' → 'DD/MM/AAAA'. */
export const diaBR = (dia) => (dia ? dia.split('-').reverse().join('/') : '');

/** Dois períodos {inicio, fim} (fim null = em aberto) têm dia em comum além da troca? */
export const sobrepoe = (a, b) => a.inicio < (b.fim || FIM_ABERTO) && b.inicio < (a.fim || FIM_ABERTO);

/**
 * Estadias do veículo em todas as obras (a partir de obras[].historicoVeiculos),
 * mais recentes primeiro, já com os dias normalizados.
 */
export const estadiasDoVeiculo = (obras, veiculoId) =>
    (obras || [])
        .flatMap(o => (Array.isArray(o.historicoVeiculos) ? o.historicoVeiculos : [])
            .filter(h => String(h.veiculoId) === String(veiculoId))
            .map(h => ({ ...h, obra: o, inicio: diaCivil(h.dataEntrada), fim: diaCivil(h.dataSaida) })))
        .filter(h => h.inicio)
        .sort((a, b) => b.inicio.localeCompare(a.inicio));

/**
 * Pares de estadias do mesmo veículo com dia em comum, na frota inteira.
 * Mais recentes primeiro. Mesma saída de listarSobreposicoes no backend
 * (scripts/auditar-sobreposicoes-obra.js), calculada sobre as obras já
 * carregadas para a lista se atualizar assim que uma data é corrigida.
 */
export const listarSobreposicoes = (obras, vehicles = []) => {
    const veiculoPorId = new Map((vehicles || []).map(v => [String(v.id), v]));
    const porVeiculo = new Map();
    (obras || []).forEach(o => (Array.isArray(o.historicoVeiculos) ? o.historicoVeiculos : []).forEach(h => {
        const inicio = diaCivil(h.dataEntrada);
        if (!inicio) return;
        const k = String(h.veiculoId);
        if (!porVeiculo.has(k)) porVeiculo.set(k, []);
        porVeiculo.get(k).push({ ...h, obra: o, inicio, fim: diaCivil(h.dataSaida) });
    }));

    const hoje = diaCivil(new Date());
    const dias = (ini, fim) => Math.max(Math.round((Date.parse(fim) - Date.parse(ini)) / 86400000), 0);
    const pares = [];
    porVeiculo.forEach((estadias, veiculoId) => {
        estadias.sort((a, b) => a.inicio.localeCompare(b.inicio));
        for (let i = 0; i < estadias.length; i++) {
            for (let j = i + 1; j < estadias.length; j++) {
                const a = estadias[i];
                const b = estadias[j];
                if (!sobrepoe(a, b)) continue;
                const ini = a.inicio > b.inicio ? a.inicio : b.inicio;
                const fimA = a.fim || hoje;
                const fimB = b.fim || hoje;
                const v = veiculoPorId.get(veiculoId);
                pares.push({
                    veiculoId,
                    placa: v?.placa || a.placa || '',
                    registroInterno: v?.registroInterno || a.registroInterno || '',
                    a,
                    b,
                    diasEmComum: dias(ini, fimA < fimB ? fimA : fimB),
                });
            }
        }
    });
    return pares.sort((x, y) => y.b.inicio.localeCompare(x.b.inicio));
};
