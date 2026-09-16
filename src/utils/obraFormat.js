// src/utils/obraFormat.js
//
// Formatação unificada do nome da obra exibido em todo o sistema:
// "Nome da Obra (ÓRGÃO CONTRATANTE)" — ex. "Estrela (SEDUR)".
// Quando a obra não tem órgão contratante, exibe apenas o nome.
import { haversineKm } from './geo';

/**
 * Retorna o rótulo da obra com o órgão contratante entre parênteses.
 * @param {object} obra - objeto obra (com `nome` e `orgao_contratante`/`orgaoContratante`)
 * @returns {string}
 */
export const formatObraNome = (obra) => {
    if (!obra) return '';
    const nome = obra.nome || obra.nomeObra || '';
    const orgao = obra.orgao_contratante || obra.orgaoContratante;
    const orgaoLimpo = orgao && String(orgao).trim();
    return orgaoLimpo ? `${nome} (${orgaoLimpo})` : nome;
};

// Regiões (filiais) da operação — mesmos valores do ENUM obras.regiao.
// Fonte única para os seletores de região: cadastro de feriados municipais,
// filial do relator no relato de ocorrência, etc.
export const REGIOES = ['Lajeado', 'Santa Maria'];

/**
 * Regiões disponíveis para seleção: as canônicas do ENUM mais qualquer valor
 * que já apareça nas obras cadastradas.
 *
 * A união é proposital — hoje a maioria das obras está com `regiao` nula, então
 * derivar só dos dados devolveria uma lista quase vazia; e listar só o ENUM
 * esconderia uma região nova cadastrada direto no banco.
 *
 * @param {Array} obras
 * @returns {string[]} ordenadas alfabeticamente
 */
export const getRegioes = (obras = []) => {
    const encontradas = (obras || [])
        .map(o => (o?.regiao || '').trim())
        .filter(Boolean);
    return [...new Set([...REGIOES, ...encontradas])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
};

/**
 * Igual a formatObraNome, mas resolve a obra a partir do id e de uma lista.
 * Útil em telas que só têm o `obraId`.
 * @param {Array} obras - lista de obras
 * @param {string|number} id - id da obra
 * @returns {string}
 */
export const formatObraNomeById = (obras, id) => {
    if (!id) return '';
    const obra = (obras || []).find(o => String(o.id) === String(id));
    return obra ? formatObraNome(obra) : '';
};

// --- REGIÃO (FILIAL) A PARTIR DA GEOGRAFIA -----------------------------------
//
// A região de uma obra é, na prática, a base que a atende — e quase sempre é a
// base mais próxima. Em vez de exigir que o usuário redigite algo que a cidade
// já determina, derivamos por distância e deixamos o seletor editável para a
// exceção (obra na faixa central do estado atendida pela outra filial).
//
// Coordenadas das bases (centro dos municípios-sede).
const BASES_REGIAO = [
    { regiao: 'Lajeado',     lat: -29.4669, lng: -51.9611 },
    { regiao: 'Santa Maria', lat: -29.6842, lng: -53.8069 },
];

/**
 * Região (filial) mais próxima de um ponto.
 *
 * Devolve sempre um dos valores de REGIOES — ou seja, do ENUM `obras.regiao` —
 * então o retorno é seguro para gravar direto no payload.
 *
 * @param {number|string} lat
 * @param {number|string} lng
 * @returns {string|null} nome da região, ou null se o ponto for inválido
 */
export const regiaoPorCoordenada = (lat, lng) => {
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;

    let melhor = null;
    let menor = Infinity;
    BASES_REGIAO.forEach(base => {
        const d = haversineKm({ lat: la, lng: ln }, { lat: base.lat, lng: base.lng });
        if (d < menor) {
            menor = d;
            melhor = base.regiao;
        }
    });
    return melhor;
};

/**
 * Região sugerida para uma cidade do catálogo IBGE (objeto com lat/lng).
 * @param {{lat:number, lng:number}|null} cidade
 * @returns {string|null}
 */
export const regiaoPorCidade = (cidade) => (
    cidade ? regiaoPorCoordenada(cidade.lat, cidade.lng) : null
);
