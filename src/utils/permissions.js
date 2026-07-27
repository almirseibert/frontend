// ─────────────────────────────────────────────────────────────────────────────
// ATENÇÃO: a AUTORIDADE de acesso é o BACKEND. Em runtime, o app usa
// `user.effectivePages` calculado pelo servidor (via /auth/me). Este mapa é
// apenas: (1) rede de segurança de bootstrap se effectivePages faltar, e
// (2) semente do editor de usuário (getRolePages). Mantê-lo igual ao backend
// (frotasmak/utils/permissions.js) evita surpresas — mas ele NÃO decide acesso.
// ─────────────────────────────────────────────────────────────────────────────
export const ROLE_PAGE_ACCESS = {
  admin:         ['*'],
  gerencia:      ['dashboard','obras','planejamento','expenses','operacional','billing','terceirizados','reports','refueling','saldo_postos','comboio','admin_solicitacoes','orders','revisions','tires','vehicles','employees','partners','inventory','fines','sigasul','supervisor_dashboard','analise_gerencial'],
  rh:            ['dashboard','obras','billing','reports','vehicles','employees','fines'],
  faturamento:   ['dashboard','obras','operacional','billing','terceirizados','reports','vehicles'],
  abastecimento: ['dashboard','obras','expenses','reports','refueling','saldo_postos','comboio','admin_solicitacoes','orders','vehicles','partners','inventory'],
  oficina:       ['dashboard','obras','reports','revisions','tires','orders','vehicles','inventory','employees'],
  editor:        ['dashboard','obras','expenses','operacional','billing','terceirizados','reports','refueling','saldo_postos','comboio','admin_solicitacoes','orders','revisions','tires','vehicles','employees','partners','inventory','fines'],
  supervisor:    ['dashboard','obras','supervisor_dashboard','expenses','operacional','billing','reports','revisions','tires','orders','vehicles'],
  operador:      ['admin_solicitacoes_app'],
  viewer:        ['dashboard','reports'],
  visualizador:  ['dashboard','reports'],
};

export const VEHICLE_ACTION_BUTTONS = {
  admin:         ['edit','checklist','fines','history','documents','delete','block'],
  gerencia:      ['edit','checklist','fines','history','documents','block'],
  rh:            ['checklist','fines','history'],
  faturamento:   ['checklist','history'],
  abastecimento: ['checklist','history'],
  oficina:       ['checklist','history'],
  editor:        ['edit','checklist','fines','history','documents'],
  supervisor:    ['checklist','history'],
  viewer:        [],
  visualizador:  [],
};

export const ROLES_NO_DELETE = ['gerencia','rh','faturamento','abastecimento','oficina','viewer','visualizador'];

export const ROLES_NO_PASSWORD_RELEASE = ['gerencia','rh','faturamento','abastecimento','oficina','viewer','visualizador','editor'];

// Catálogo de páginas personalizáveis, AGRUPADO e ORDENADO igual ao menu (Sidebar).
// Padrão único: seção do menu → páginas gerenciáveis dentro dela.
// Os `id` batem com ROLE_PAGE_ACCESS / renderPage. (Não confundir com MODULES.)
export const PAGE_SECTIONS = [
  { section: 'Principal',         pages: [{ id: 'dashboard', label: 'Painel Geral' }] },
  { section: 'Obras',             pages: [
      { id: 'obras',        label: 'Obras' },
      { id: 'planejamento', label: 'Planejamento' },
      { id: 'expenses',     label: 'Despesas' },
  ] },
  { section: 'Faturamento',       pages: [
      { id: 'operacional',   label: 'Central Operacional' },
      { id: 'billing',       label: 'Relatório de Horas' },
      { id: 'terceirizados', label: 'Terceirizados' },
  ] },
  { section: 'Relatórios',        pages: [{ id: 'reports', label: 'Relatórios' }] },
  { section: 'Análise Gerencial', note: 'Chave única: libera a seção inteira (Divergências, Mapa Operacional, Projeção de Obra).', pages: [
      { id: 'analise_gerencial',    label: 'Análise Gerencial (seção)' },
      { id: 'supervisor_dashboard', label: 'Dados de Supervisão (Gestão de Obras / Aproveitamento)' },
  ] },
  { section: 'Operações',         pages: [
      { id: 'refueling',          label: 'Abastecimento' },
      { id: 'saldo_postos',       label: 'Saldo em Postos' },
      { id: 'comboio',            label: 'Comboio' },
      { id: 'admin_solicitacoes', label: 'Solicitações (App)' },
  ] },
  { section: 'Oficina',           pages: [
      { id: 'revisions', label: 'Revisões & Manutenções' },
      { id: 'tires',     label: 'Gestão de Pneus' },
      { id: 'orders',    label: 'Ordens (C/S)' },
  ] },
  { section: 'Cadastros',         pages: [
      { id: 'vehicles',  label: 'Veículos' },
      { id: 'employees', label: 'Funcionários' },
      { id: 'partners',  label: 'Fornecedores' },
      { id: 'inventory', label: 'Estoque / Peças' },
      { id: 'fines',     label: 'Multas' },
  ] },
  { section: 'Rastreamento',      pages: [{ id: 'sigasul', label: 'SigaSul GPS' }] },
  { section: 'Administração',     note: 'Chave única: libera a seção inteira (Usuários & Acesso, Frota, Comunicação, Sistema).', pages: [{ id: 'admin', label: 'Administração (acesso total)' }] },
];

// Lista achatada (todas as páginas gerenciáveis), derivada das seções.
export const PAGES = PAGE_SECTIONS.flatMap(s => s.pages);

// Páginas padrão de um role, como array simples.
export function getRolePages(role) {
  return ROLE_PAGE_ACCESS[role?.toLowerCase()] || ROLE_PAGE_ACCESS['viewer'];
}

// Páginas EFETIVAS de um usuário.
// AUTORIDADE: `user.effectivePages` calculado pelo backend (/auth/me). Se presente,
// é o que vale. O cálculo local abaixo é só fallback de bootstrap/token legado —
// mesma regra do servidor: override individual vence o role; admin ('*') nunca é reduzido.
export function getEffectivePages(user) {
  if (Array.isArray(user?.effectivePages) && user.effectivePages.length > 0) {
    return user.effectivePages;
  }
  const role = (user?.roleNormalized || user?.user_type || 'viewer').toLowerCase();
  const rolePages = getRolePages(role);
  if (rolePages.includes('*')) return rolePages;
  const custom = user?.page_permissions;
  if (Array.isArray(custom) && custom.length > 0) return custom;
  return rolePages;
}

export function canAccessPage(role, pageId) {
  const pages = ROLE_PAGE_ACCESS[role?.toLowerCase()] || ROLE_PAGE_ACCESS['viewer'];
  return pages.includes('*') || pages.includes(pageId);
}

// Versão ciente do override individual — use esta quando tiver o objeto `user`.
export function canUserAccessPage(user, pageId) {
  const pages = getEffectivePages(user);
  return pages.includes('*') || pages.includes(pageId);
}

// Resolve acesso à Análise Gerencial considerando role + flag por-usuário.
// Sócio/gerente pode ter `canAccessAnaliseGerencial = 1` no banco sem ser admin.
export function canAccessAnaliseGerencial(user) {
  if (!user) return false;
  if (canUserAccessPage(user, 'analise_gerencial')) return true;
  return Boolean(user.canAccessAnaliseGerencial);
}

export function getVehicleButtons(role) {
  return VEHICLE_ACTION_BUTTONS[role?.toLowerCase()] || [];
}
