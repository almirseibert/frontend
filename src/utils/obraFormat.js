// src/utils/obraFormat.js
//
// Formatação unificada do nome da obra exibido em todo o sistema:
// "Nome da Obra (ÓRGÃO CONTRATANTE)" — ex. "Estrela (SEDUR)".
// Quando a obra não tem órgão contratante, exibe apenas o nome.

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
