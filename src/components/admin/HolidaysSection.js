// Cadastro de feriados (admin_holidays), compartilhado entre as duas telas de
// configuração — AdminPage > Configurações e AdminSistemaPage > Sistema.
//
// Antes cada tela tinha a própria cópia com um array fixo em useState: o que o
// admin cadastrava sumia ao trocar de aba, e os feriados nunca chegavam ao
// backend. Agora a lista vem de /admin/holidays e é a mesma consumida por
// utils/businessDays no cálculo de prazos em dias úteis.
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Download, Loader2 } from 'lucide-react';
import apiClient from '../../services/apiClient';
import { nationalHolidays } from '../../utils/businessDays';

// Mesmos valores de obras.regiao. Vazio = feriado nacional (vale para todas).
const HOLIDAY_REGIOES = ['Lajeado', 'Santa Maria'];

const HolidaysSection = ({ active = true }) => {
    const [holidays, setHolidays] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [novo, setNovo] = useState({ name: '', date: '', regiao: '' });

    const ano = new Date().getFullYear();

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setHolidays(await apiClient.adminGetHolidays());
        } catch (e) {
            setError(e.message || 'Erro ao carregar feriados.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Só busca quando a seção está aberta — a aba inteira não precisa pagar isso.
    useEffect(() => {
        if (active) load();
    }, [active, load]);

    const adicionar = async () => {
        if (!novo.name || !novo.date || busy) return;
        setBusy(true);
        setError('');
        try {
            await apiClient.adminCreateHoliday({
                name: novo.name,
                date: novo.date,
                regiao: novo.regiao || null,
            });
            setNovo({ name: '', date: '', regiao: '' });
            await load();
        } catch (e) {
            setError(e.message || 'Erro ao adicionar feriado.');
        } finally {
            setBusy(false);
        }
    };

    const remover = async (id) => {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            await apiClient.adminDeleteHoliday(id);
            await load();
        } catch (e) {
            setError(e.message || 'Erro ao remover feriado.');
        } finally {
            setBusy(false);
        }
    };

    // Pré-preenchimento: feriados nacionais do ano, com os móveis calculados a
    // partir da Páscoa. Datas já cadastradas voltam 409 e são ignoradas.
    const importarNacionais = async () => {
        if (busy) return;
        setBusy(true);
        setError('');
        let criados = 0;
        let ignorados = 0;
        try {
            for (const h of nationalHolidays(ano)) {
                try {
                    await apiClient.adminCreateHoliday({ name: h.name, date: h.date, regiao: null });
                    criados++;
                } catch {
                    ignorados++;
                }
            }
            await load();
            if (criados === 0) {
                setError(`Nenhum feriado novo — os ${ignorados} de ${ano} já estavam cadastrados.`);
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="p-5 border-t space-y-4">
            <p className="text-sm text-gray-500">
                Feriados são desprezados no cálculo de prazos em dias úteis (relatos de ocorrência,
                ordens de manutenção) e nos relatórios de aproveitamento. Deixe a região em branco
                para feriado nacional; preencha para feriado municipal, que só vale naquela filial.
            </p>

            {error && (
                <div className="p-2.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg text-xs font-bold">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                    <Loader2 size={14} className="animate-spin" /> Carregando feriados...
                </div>
            ) : holidays.length === 0 ? (
                <div className="text-sm text-gray-400 py-4">
                    Nenhum feriado cadastrado — sem eles, os prazos só pulam sábado e domingo.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                    {holidays.map(h => (
                        <div key={h.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                            <div className="min-w-0">
                                <span className="text-sm font-medium text-gray-800">{h.name}</span>
                                <span className="text-xs text-gray-400 ml-2">
                                    {new Date(h.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                </span>
                                {h.regiao && (
                                    <span className="ml-2 text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                        {h.regiao}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => remover(h.id)}
                                disabled={busy}
                                className="p-1 rounded hover:bg-red-50 text-red-400 transition-colors disabled:opacity-40"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap gap-3 border-t pt-3">
                <input
                    value={novo.name}
                    onChange={e => setNovo(p => ({ ...p, name: e.target.value }))}
                    placeholder="Nome do feriado"
                    className="flex-1 min-w-[160px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                />
                <input
                    type="date"
                    value={novo.date}
                    onChange={e => setNovo(p => ({ ...p, date: e.target.value }))}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                />
                <select
                    value={novo.regiao}
                    onChange={e => setNovo(p => ({ ...p, regiao: e.target.value }))}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-yellow-400 outline-none"
                >
                    <option value="">Nacional</option>
                    {HOLIDAY_REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <button
                    onClick={adicionar}
                    disabled={busy || !novo.name || !novo.date}
                    className="flex items-center gap-1 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-lg text-sm transition-colors disabled:opacity-40"
                >
                    <Plus size={14} /> Adicionar
                </button>
                <button
                    onClick={importarNacionais}
                    disabled={busy}
                    title={`Cadastra os feriados nacionais de ${ano}, incluindo os móveis (Carnaval, Sexta-feira Santa, Corpus Christi)`}
                    className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-sm transition-colors disabled:opacity-40"
                >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Importar nacionais de {ano}
                </button>
            </div>
        </div>
    );
};

export default HolidaysSection;
