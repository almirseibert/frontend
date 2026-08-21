// src/utils/partners.js
// ============================================================================
// Nome de exibição de fornecedores/postos/locadores (partners).
// ============================================================================
//
// Regra do negócio (ver PartnersPage.js):
//   - razaoSocial  → nome legal, "vai por extenso no contrato".
//   - nomeFantasia → "exibição no sistema". Quando preenchido, é ELE quem
//                    deve aparecer nas telas/documentos operacionais.
//
// Use estes helpers em TODA exibição de nome de fornecedor para garantir a
// preferência por Nome Fantasia de forma consistente. Documentos legais
// (contratos, extratos) continuam usando razaoSocial explicitamente.
// ============================================================================

/** Nome de exibição de um partner: Nome Fantasia quando houver, senão Razão Social. */
export const getPartnerDisplayName = (partner) => {
    if (!partner) return '';
    const fantasia = (partner.nomeFantasia || '').trim();
    if (fantasia) return fantasia;
    return (partner.razaoSocial || partner.nome || '').trim();
};

/**
 * Resolve o nome de exibição de um posto/fornecedor de uma ordem.
 * Prioriza o partner "vivo" (para pegar o Nome Fantasia atual) e só cai no
 * snapshot `partnerName` gravado na ordem quando o partner não existe mais.
 */
export const resolveOrderPartnerName = (partner, snapshotName, fallback = 'N/A') => {
    return getPartnerDisplayName(partner) || (snapshotName || '').trim() || fallback;
};

/**
 * Nome do terceiro (locador) dono de um veículo terceirizado.
 * Retorna '' quando o veículo não é terceirizado ou não tem locador vinculado.
 */
export const getVehicleTerceiroName = (vehicle, partners = []) => {
    if (!vehicle?.isOutsourced || !vehicle?.locadorId) return '';
    const locador = partners.find((p) => p.id === vehicle.locadorId);
    return getPartnerDisplayName(locador);
};
