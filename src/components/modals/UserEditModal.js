import React, { useState } from 'react';
import { X, User, SlidersHorizontal } from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import { PAGES, PAGE_SECTIONS, getRolePages } from '../../utils/permissions';

const ROLES = [
  { value: 'admin',         label: 'Administrador' },
  { value: 'gerencia',      label: 'Gerência' },
  { value: 'editor',        label: 'Editor' },
  { value: 'rh',            label: 'RH' },
  { value: 'faturamento',   label: 'Faturamento' },
  { value: 'abastecimento', label: 'Abastecimento' },
  { value: 'oficina',       label: 'Oficina' },
  { value: 'operador',      label: 'Operador' },
  { value: 'viewer',        label: 'Visualizador' },
];

const UserEditModal = ({ user, groups = [], onClose, onSave }) => {
  const isNew = !user;
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    user_type: user?.user_type || 'viewer',
    group_id: user?.group_id || '',
    podeAcessarAbastecimento: user?.podeAcessarAbastecimento || false,
    active: user?.active !== false && user?.status !== 'inativo',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Override individual de páginas. null/[] no usuário = usa o padrão da função.
  const initialPages = Array.isArray(user?.page_permissions) && user.page_permissions.length > 0
    ? user.page_permissions
    : null;
  const [customize, setCustomize] = useState(!!initialPages);
  const [pages, setPages] = useState(
    initialPages ? [...initialPages] : [...getRolePages(user?.user_type || 'viewer')]
  );

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  // Ao ligar a personalização, semeia com o padrão da função selecionada no momento.
  const toggleCustomize = (on) => {
    if (on) setPages([...getRolePages(form.user_type)]);
    setCustomize(on);
  };

  const togglePage = (id) =>
    setPages(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const isAdminRole = form.user_type === 'admin';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const data = { ...form };
      if (!isNew && !data.password) delete data.password;
      // Só envia lista quando personalizado e não-admin; senão null = volta ao padrão da função.
      data.page_permissions = (customize && !isAdminRole) ? pages : null;
      await onSave(data, user?.id);
    } catch (err) {
      setError(err.message || 'Erro ao salvar usuário.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mak-modal-backdrop ">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <h2 className="mak-modal-title">
            <User size={18} className="text-yellow-500" />
            {isNew ? 'Novo Usuário' : 'Editar Usuário'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              required
              placeholder="Nome completo"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              required
              placeholder="email@empresa.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isNew ? 'Senha inicial' : 'Nova senha (deixe em branco para manter)'}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              required={isNew}
              placeholder={isNew ? 'Senha inicial' : 'Deixe em branco para não alterar'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Função</label>
              <select
                value={form.user_type}
                onChange={e => set('user_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none text-sm bg-white"
              >
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grupo de Acesso</label>
              <SearchableSelect
                items={groups.map(g => ({ ...g, _label: g.name }))}
                value={form.group_id}
                onChange={(item) => set('group_id', item?.id || '')}
                getLabel={(g) => g.name}
                placeholder="Nenhum"
              />
            </div>
          </div>

          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.podeAcessarAbastecimento}
                onChange={e => set('podeAcessarAbastecimento', e.target.checked)}
                className="h-4 w-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
              />
              <span className="text-sm text-gray-700">Acessa Abastecimento</span>
            </label>
            {!isNew && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={e => set('active', e.target.checked)}
                  className="h-4 w-4 text-green-500 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Ativo</span>
              </label>
            )}
          </div>

          {/* Personalização individual de acesso (override sobre o padrão da função) */}
          {!isAdminRole && (
            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/60">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={customize}
                  onChange={e => toggleCustomize(e.target.checked)}
                  className="h-4 w-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                />
                <SlidersHorizontal size={15} className="text-yellow-500" />
                <span className="text-sm font-medium text-gray-700">Personalizar acesso deste usuário</span>
              </label>

              {!customize ? (
                <p className="text-xs text-gray-400 mt-1.5">
                  Usa o acesso padrão da função <b>{form.user_type}</b>. Ative para liberar ou
                  remover páginas só para este usuário, sem afetar os demais da mesma função.
                </p>
              ) : (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">
                      {pages.length} página(s) selecionada(s)
                    </span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setPages([...getRolePages(form.user_type)])} className="text-xs text-blue-600 hover:underline">Padrão da função</button>
                      <span className="text-gray-300">|</span>
                      <button type="button" onClick={() => setPages(PAGES.map(p => p.id))} className="text-xs text-blue-600 hover:underline">Todas</button>
                      <span className="text-gray-300">|</span>
                      <button type="button" onClick={() => setPages([])} className="text-xs text-red-500 hover:underline">Limpar</button>
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-3">
                    {PAGE_SECTIONS.map(sec => (
                      <div key={sec.section}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">{sec.section}</p>
                        {sec.note && <p className="text-[10px] text-gray-400 italic mb-1">{sec.note}</p>}
                        <div className="grid grid-cols-2 gap-1.5">
                          {sec.pages.map(p => (
                            <label key={p.id} className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={pages.includes(p.id)}
                                onChange={() => togglePage(p.id)}
                                className="h-4 w-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
                              />
                              <span className="text-sm text-gray-700">{p.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {form.user_type === 'operador' && (
                    <p className="text-xs text-amber-600 mt-1.5">
                      Atenção: operador tem fluxo próprio (redirecionado para a tela de solicitação).
                      Personalizar páginas aqui pode não ter efeito no app dele.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          </div>

          <div className="flex gap-3 p-5 border-t border-gray-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 bg-yellow-400 hover:bg-[#fdf8f0]0 text-gray-900 font-bold rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserEditModal;




