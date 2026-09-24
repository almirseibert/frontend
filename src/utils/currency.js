// Formatação de dinheiro — ponto único do sistema.
//
// Regra do projeto: TODO valor monetário exibido usa máscara de moeda
// brasileira com DUAS casas decimais. Sem exceção para "número redondo",
// sem `toFixed(2)` solto (que devolve "1234.56", sem separador de milhar e
// com ponto no lugar da vírgula).
//
// Antes disto havia 29 formatadores locais espalhados pelo código, cada um
// com sua própria ideia de quantas casas mostrar. Importe daqui.

const FORMATADOR = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

/**
 * "R$ 1.234,56". Trata null/undefined/NaN como zero.
 */
export const fmtBRL = (valor) => FORMATADOR.format(Number(valor) || 0);

/**
 * Igual a fmtBRL, mas devolve um travessão quando não há valor — para
 * células de tabela e fichas onde "R$ 0,00" mentiria sobre um dado ausente.
 */
export const fmtBRLouTraco = (valor, traco = '—') =>
    valor === null || valor === undefined || valor === '' || Number.isNaN(Number(valor))
        ? traco
        : FORMATADOR.format(Number(valor));

/**
 * Preço unitário de combustível: o setor trabalha com três casas
 * (R$ 5,489/L) e a terceira casa muda o total da nota. Só para preço por
 * litro — qualquer total continua em fmtBRL.
 */
export const fmtBRLLitro = (valor) =>
    `${(Number(valor) || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
    })}`;

/**
 * Forma abreviada para eixo de gráfico e cartão estreito, onde o valor cheio
 * não cabe. Mantém duas casas na mantissa: "R$ 1,25 mi", "R$ 350,40 mil".
 * Abaixo de mil devolve o valor cheio, com máscara normal.
 */
export const fmtBRLCompacto = (valor) => {
    const n = Number(valor) || 0;
    const abs = Math.abs(n);
    const sinal = n < 0 ? '-' : '';
    const casas2 = (x) => x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (abs >= 1e6) return `${sinal}R$ ${casas2(abs / 1e6)} mi`;
    if (abs >= 1e3) return `${sinal}R$ ${casas2(abs / 1e3)} mil`;
    return FORMATADOR.format(n);
};

export default fmtBRL;
