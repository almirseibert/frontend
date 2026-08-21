import React, { useMemo } from 'react';

/**
 * CurrencyInput — campo de valor monetário com máscara BRL.
 *
 * Comportamento estilo "calculadora": o usuário digita apenas dígitos e os dois
 * últimos são tratados como centavos. Exibe formatado (ex: "1.234,56") mas
 * DEVOLVE o valor cru no onChange, para manter compatibilidade com os forms
 * existentes (que salvam número e mandam pro backend).
 *
 * Drop-in para <input type="number">:
 *   <CurrencyInput name="valor" value={form.valor} onChange={handleChange} />
 *
 * O onChange recebe um evento sintético { target: { name, value } } onde
 * `value` é a string numérica ("1234.56") ou "" quando vazio — igual ao que um
 * input numérico entregaria. Assim funciona tanto com handleChange genérico
 * quanto com onChange={(e) => update(e.target.value)}.
 *
 * Props:
 *  value      number|string  — valor cru atual (ex: 1234.56, "1234.56", "")
 *  onChange   fn(event)      — recebe evento sintético com value numérico cru
 *  name       string         — repassado no target do evento
 *  prefix     bool|string    — prefixo exibido (default "R$ "); false remove
 *  decimals   number         — casas decimais (default 2; use 3 p/ preço/litro)
 *  ...rest    demais props do input (className, placeholder, disabled, etc.)
 */

// Converte o valor cru (number|string) em uma string formatada "1.234,56".
// Retorna '' para vazio/inválido, para exibir o placeholder.
const formatFromRaw = (raw, decimals) => {
    if (raw === '' || raw === null || raw === undefined) return '';
    const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
    if (!Number.isFinite(num)) return '';
    return num.toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
};

const CurrencyInput = ({ value, onChange, name, prefix = 'R$ ', decimals = 2, className = '', ...rest }) => {
    const display = useMemo(() => formatFromRaw(value, decimals), [value, decimals]);

    const handleChange = (e) => {
        // Mantém apenas dígitos; os N últimos viram a parte decimal.
        const digits = e.target.value.replace(/\D/g, '');
        let rawValue;
        if (digits === '') {
            rawValue = '';
        } else {
            rawValue = (parseInt(digits, 10) / Math.pow(10, decimals)).toFixed(decimals);
        }
        onChange({ target: { name, value: rawValue } });
    };

    const prefixText = prefix === false ? '' : prefix;

    return (
        <div className="relative">
            {prefixText && (
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                    {prefixText}
                </span>
            )}
            <input
                type="text"
                inputMode="decimal"
                name={name}
                value={display}
                onChange={handleChange}
                className={`${prefixText ? 'pl-9' : ''} ${className}`}
                {...rest}
            />
        </div>
    );
};

export default CurrencyInput;
