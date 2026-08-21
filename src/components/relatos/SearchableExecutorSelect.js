import React, { useMemo } from 'react';
import SearchableSelect from '../SearchableSelect';
import { getPartnerDisplayName } from '../../utils/partners';

// Quem executa o serviço de um item do relato.
//
// Lista, nesta ordem: a oficina própria da MAK (partner-espelho fixo, sempre no
// topo — é o caso mais comum), depois os fornecedores marcados como oficina, e
// por fim os demais fornecedores. Peça e mão de obra podem vir do mesmo
// fornecedor, então não faz sentido esconder quem não está marcado como oficina.
//
// Modelado no SearchableSupplierSelect da OrdersPage, mas usando o
// SearchableSelect genérico em vez de repetir a implementação de dropdown.

export const OFICINA_INTERNA_PARTNER_ID = 'mak-oficina-interna';

const SearchableExecutorSelect = ({ partners = [], value = '', onChange, disabled = false }) => {
    const opcoes = useMemo(() => {
        const elegiveis = partners.filter(p =>
            p.tipo_parceiro === 'fornecedor' || p.is_oficina || p.is_interno
        );

        const peso = (p) => {
            if (p.is_interno) return 0;   // oficina própria primeiro
            if (p.is_oficina) return 1;   // oficinas externas
            return 2;                     // demais fornecedores
        };

        return elegiveis.sort((a, b) => {
            const d = peso(a) - peso(b);
            if (d !== 0) return d;
            return getPartnerDisplayName(a).localeCompare(getPartnerDisplayName(b), 'pt-BR');
        });
    }, [partners]);

    return (
        <SearchableSelect
            items={opcoes}
            value={value}
            onChange={item => onChange?.(item)}
            getLabel={p => getPartnerDisplayName(p)}
            getSubLabel={p => (p.is_interno ? 'Oficina própria da MAK' : (p.cidade || p.cnpj || ''))}
            getBadge={p => {
                if (p.is_interno) return { text: 'MAK', color: 'bg-slate-200 text-slate-700' };
                if (p.is_oficina) return { text: 'OFICINA', color: 'bg-blue-100 text-blue-700' };
                return null;
            }}
            placeholder="Quem vai executar..."
            disabled={disabled}
        />
    );
};

export default SearchableExecutorSelect;
