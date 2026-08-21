// Legenda de gravidade e vocabulário de status do Relato de Ocorrência
// (ficha FRM-MAN-001). Os textos são os mesmos impressos no formulário.
//
// Os prazos (SLA em dias úteis) NÃO ficam aqui — vêm de relato_sla_config, via
// GET /relatos/config/sla, porque o admin pode ajustá-los. O que está abaixo é
// só o que é fixo: rótulo, descrição, cor e ordem de prioridade.

export const GRAVIDADES = ['A', 'B', 'C', 'D'];

export const GRAVIDADE_LEGENDA = {
    A: {
        label: 'IMPOSSIBILITA TRABALHAR',
        descricao: 'Veículo parado / uso proibido. Risco iminente ou falha total.',
        prioridade: 1,
        bloqueiaOperacao: true,
        // Vermelho, laranja, amarelo e cinza: a leitura de urgência é imediata
        // e casa com o padrão de status do resto do sistema.
        chip: 'bg-red-600 text-white',
        texto: 'text-red-700',
        borda: 'border-red-500',
        fundo: 'bg-red-50',
    },
    B: {
        label: 'PODE QUEBRAR EM BREVE',
        descricao: 'Uso restrito, reparo urgente. Falha provável a curto prazo.',
        prioridade: 2,
        bloqueiaOperacao: false,
        chip: 'bg-orange-500 text-white',
        texto: 'text-orange-700',
        borda: 'border-orange-400',
        fundo: 'bg-orange-50',
    },
    C: {
        label: 'PODE TRABALHAR ASSIM',
        descricao: 'Operação normal, agendar reparo. Não compromete a segurança.',
        prioridade: 3,
        bloqueiaOperacao: false,
        chip: 'bg-yellow-500 text-white',
        texto: 'text-yellow-700',
        borda: 'border-yellow-400',
        fundo: 'bg-yellow-50',
    },
    D: {
        label: 'EMBELEZAMENTO / ESTÉTICA',
        descricao: 'Sem urgência, corrigir quando possível. Aparência, conforto, acabamento.',
        prioridade: 4,
        bloqueiaOperacao: false,
        chip: 'bg-slate-400 text-white',
        texto: 'text-slate-600',
        borda: 'border-slate-300',
        fundo: 'bg-slate-50',
    },
};

export const getGravidade = (g) => GRAVIDADE_LEGENDA[String(g || '').toUpperCase()] || null;

/** 'A' é a pior. Retorna a gravidade mais crítica de uma lista de itens. */
export const gravidadeMaisCritica = (itens = []) => {
    const presentes = itens
        .map(i => String(i?.gravidade || '').toUpperCase())
        .filter(g => GRAVIDADES.includes(g));
    if (presentes.length === 0) return null;
    return presentes.sort()[0];
};

/** Algum item impede o equipamento de trabalhar (gravidade A)? */
export const temItemBloqueante = (itens = []) =>
    itens.some(i => getGravidade(i?.gravidade)?.bloqueiaOperacao);

// --- Status ------------------------------------------------------------------

// Rascunho → Digitado → Em Execução → Concluído (+ Cancelado)
export const RELATO_STATUS = ['Rascunho', 'Digitado', 'Em Execução', 'Concluído', 'Cancelado'];
export const RELATO_EDITAVEL = ['Rascunho', 'Digitado'];

export const RELATO_STATUS_ESTILO = {
    'Rascunho':    'bg-gray-100 text-gray-600 border-gray-200',
    'Digitado':    'bg-blue-50 text-blue-700 border-blue-200',
    'Em Execução': 'bg-yellow-50 text-yellow-800 border-yellow-300',
    'Concluído':   'bg-green-50 text-green-700 border-green-200',
    'Cancelado':   'bg-red-50 text-red-700 border-red-200',
};

// Os quatro do quadro "USO EXCLUSIVO DA MANUTENÇÃO / OFICINA" da ficha, mais
// 'Cancelado' (não existe no papel, mas a oficina precisa poder descartar item).
export const ITEM_STATUS = ['Em Análise', 'Aguardando Peça', 'Em Execução', 'Concluído', 'Cancelado'];
export const ITEM_STATUS_TERMINAL = ['Concluído', 'Cancelado'];

export const ITEM_STATUS_ESTILO = {
    'Em Análise':      'bg-gray-100 text-gray-700 border-gray-200',
    'Aguardando Peça': 'bg-orange-50 text-orange-700 border-orange-200',
    'Em Execução':     'bg-blue-50 text-blue-700 border-blue-200',
    'Concluído':       'bg-green-50 text-green-700 border-green-200',
    'Cancelado':       'bg-red-50 text-red-700 border-red-200',
};

export const EXECUTOR_TIPOS = [
    { value: 'interno', label: 'MAK Serviços (oficina própria)' },
    { value: 'externo', label: 'Oficina / fornecedor externo' },
];
