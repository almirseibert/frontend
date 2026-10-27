import React, { useMemo, useState } from 'react';
import { X, Loader, CheckCircle2, AlertTriangle } from 'lucide-react';
import CurrencyInput from '../ui/CurrencyInput';
import { calcularApuradoConclusao } from '../../utils/terceirizados';
import { fmtBRL } from '../../utils/currency';

const fmtH = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h';
const fmtPct = (n) => `${((Number(n) || 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const hojeStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ymd = (v) => (v ? String(v).slice(0, 10) : '');

/** Opção de valor final (radio em cartão). */
const Opcao = ({ id, titulo, valor, children, disabled, modoAtual, onEscolher }) => {
    const ativo = modoAtual === id;
    return (
        <label className={`block rounded-lg border-2 p-3 transition ${disabled ? 'opacity-50 cursor-not-allowed border-gray-100'
            : ativo ? 'border-purple-500 bg-purple-50/60 cursor-pointer' : 'border-gray-200 hover:border-gray-300 cursor-pointer'}`}>
            <div className="flex items-center gap-2">
                <input type="radio" name="modoConclusao" checked={ativo} disabled={disabled}
                    onChange={() => onEscolher(id)} className="accent-purple-600" />
                <span className="text-sm font-bold text-gray-800 flex-1">{titulo}</span>
                {valor != null && <span className="text-sm font-extrabold text-gray-900">{fmtBRL(valor)}</span>}
            </div>
            {children && <div className="ml-6 mt-1">{children}</div>}
        </label>
    );
};

/**
 * Conclusão do contrato de terceiro: registra que o serviço encerrou e qual é o
 * VALOR FINAL — o serviço pode terminar antes de bater 100% das horas.
 *
 *  - original:      o valor contratado (base + aditivos)
 *  - apurado:       o que as horas executadas até a data valem pelo contrato
 *                   (utils/terceirizados.calcularApuradoConclusao)
 *  - personalizado: valor livre, com justificativa obrigatória
 *
 * O valor escolhido passa a ser o valor do contrato no saldo a pagar; horas e
 * diesel depois da data de conclusão deixam de contar para ele.
 */
const ConclusaoContratoModal = ({ contrato, ctx, apiClient, setAlertMessage, onClose, onSaved }) => {
    const inicio = ymd(contrato?.vigenciaInicio);
    const [data, setData] = useState(hojeStr());
    const [modo, setModo] = useState('apurado');
    const [valorPersonalizado, setValorPersonalizado] = useState('');
    const [observacao, setObservacao] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const previa = useMemo(() => calcularApuradoConclusao(contrato, ctx, data || null), [contrato, ctx, data]);
    const { r, valorContratado, valorApurado, base, linhas } = previa;
    const semApurado = valorApurado == null;
    const modoEfetivo = semApurado && modo === 'apurado' ? 'original' : modo;

    const valorFinal = modoEfetivo === 'original' ? valorContratado
        : modoEfetivo === 'apurado' ? valorApurado
        : (valorPersonalizado === '' ? null : Number(valorPersonalizado));
    const saldoFinal = valorFinal == null ? null : valorFinal - r.diesel - r.adiantamentos;

    const erroData = !data ? 'Informe a data de conclusão.'
        : data > hojeStr() ? 'A data de conclusão não pode ser futura.'
        : inicio && data < inicio ? 'A data é anterior à vigência início do contrato.' : null;
    const erroValor = modoEfetivo === 'personalizado' && (valorFinal == null || valorFinal < 0) ? 'Informe o valor final.'
        : modoEfetivo === 'personalizado' && !observacao.trim() ? 'Valor personalizado exige justificativa.' : null;
    const podeSalvar = !erroData && !erroValor && !isSaving;

    const salvar = async () => {
        if (!podeSalvar) return;
        setIsSaving(true);
        try {
            await apiClient.concluirTerceiroContrato(contrato.id, {
                data,
                modo: modoEfetivo,
                valorApurado: valorApurado,
                valor: modoEfetivo === 'personalizado' ? valorFinal : undefined,
                horasExecutadas: r.horasExecutadas,
                observacao: observacao.trim() || undefined,
            });
            setAlertMessage?.(`Contrato ${contrato.numero} concluído.`);
            onSaved?.();
            onClose();
        } catch (err) {
            setAlertMessage?.(err.message || 'Erro ao concluir contrato.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-purple-500" /> Concluir contrato {contrato?.numero}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100" disabled={isSaving}><X size={18} /></button>
                </div>

                <div className="p-4 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Data de conclusão</label>
                        <input type="date" value={data} max={hojeStr()} min={inicio || undefined}
                            onChange={(e) => setData(e.target.value)}
                            className="p-2 border rounded-lg bg-white text-sm" />
                        <p className="text-[11px] text-gray-400 mt-1">
                            Horas e diesel lançados depois desta data deixam de contar para o contrato.
                        </p>
                        {erroData && <p className="text-[11px] text-red-600 mt-1">{erroData}</p>}
                    </div>

                    <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                        <div className="flex items-baseline justify-between">
                            <span className="text-[10px] uppercase font-bold text-gray-400">Executado até a data</span>
                            <span className="text-sm font-bold text-gray-800">
                                {fmtH(r.horasExecutadas)} <span className="text-gray-400 font-medium">de {fmtH(r.horasContratadas)}</span>
                            </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden mt-1.5">
                            <div className="h-full bg-purple-500" style={{ width: `${Math.min(1, r.progresso || 0) * 100}%` }} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-gray-600 uppercase">Valor final do contrato</label>

                        <Opcao modoAtual={modoEfetivo} onEscolher={setModo} id="original" titulo="Valor original do contrato" valor={valorContratado}>
                            <p className="text-[11px] text-gray-500">Paga o contratado integral{r.temAditivos ? ', com os aditivos' : ''}, independente das horas executadas.</p>
                        </Opcao>

                        <Opcao modoAtual={modoEfetivo} onEscolher={setModo} id="apurado" titulo="Valor apurado até o momento" valor={valorApurado} disabled={semApurado}>
                            {semApurado ? (
                                <p className="text-[11px] text-gray-500">Contrato sem horas contratadas — não há base para apurar.</p>
                            ) : base === 'proporcional' ? (
                                <p className="text-[11px] text-gray-500">
                                    Valor fechado × {fmtPct(previa.fator)} das horas executadas ({fmtH(r.horasExecutadas)} de {fmtH(r.horasContratadas)}).
                                </p>
                            ) : (
                                <ul className="text-[11px] text-gray-500 space-y-0.5">
                                    {linhas.map((l) => (
                                        <li key={l.type} className="flex justify-between gap-2">
                                            <span>{l.type}: {fmtH(Math.min(l.horasExecutadas, l.horasContratadas))} × {fmtBRL(l.valorHora)}/h
                                                {l.horasExecutadas > l.horasContratadas && <span className="text-amber-700"> (limitado às {fmtH(l.horasContratadas)} contratadas)</span>}
                                            </span>
                                            <span className="font-semibold text-gray-600 whitespace-nowrap">{fmtBRL(l.valor)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Opcao>

                        <Opcao modoAtual={modoEfetivo} onEscolher={setModo} id="personalizado" titulo="Valor personalizado">
                            {modoEfetivo === 'personalizado' ? (
                                <CurrencyInput value={valorPersonalizado} onChange={(e) => setValorPersonalizado(e.target.value)}
                                    className="w-full p-2 border rounded-lg bg-white text-sm mt-1" placeholder="0,00" autoFocus />
                            ) : (
                                <p className="text-[11px] text-gray-500">Valor acertado com o terceiro, com justificativa.</p>
                            )}
                        </Opcao>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">
                            {modoEfetivo === 'personalizado' ? 'Justificativa' : 'Observação (opcional)'}
                        </label>
                        <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={2000}
                            placeholder={modoEfetivo === 'personalizado' ? 'Por que este valor? Ex.: acordo de encerramento com o terceiro.' : ''}
                            className="w-full p-2 border rounded-lg bg-white text-sm" />
                    </div>

                    {saldoFinal != null && (
                        <div className="rounded-lg border border-gray-200 p-3 text-xs space-y-1">
                            <div className="flex justify-between"><span className="text-gray-500">Valor final</span><span className="font-semibold">{fmtBRL(valorFinal)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">− Diesel abatido até a data</span><span>{fmtBRL(r.diesel)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">− Pagamentos</span><span>{fmtBRL(r.adiantamentos)}</span></div>
                            <div className="flex justify-between border-t border-gray-100 pt-1 text-sm">
                                <span className="font-bold text-gray-700">Saldo a pagar</span>
                                <span className={`font-extrabold ${saldoFinal > 0.005 ? 'text-red-700' : saldoFinal < -0.005 ? 'text-blue-700' : 'text-green-700'}`}>{fmtBRL(saldoFinal)}</span>
                            </div>
                            {saldoFinal < -0.005 && (
                                <p className="flex items-start gap-1 text-blue-700 pt-1">
                                    <AlertTriangle size={12} className="mt-px shrink-0" /> Diesel + pagamentos passam do valor final: o terceiro fica devendo {fmtBRL(-saldoFinal)} à MAK.
                                </p>
                            )}
                            <p className="text-gray-400 pt-1">
                                Com saldo diferente de zero, o contrato concluído segue em Terceirizados até ser acertado.
                            </p>
                        </div>
                    )}
                    {erroValor && <p className="text-[11px] text-red-600">{erroValor}</p>}
                </div>

                <div className="flex justify-end gap-2 p-4 border-t sticky bottom-0 bg-white">
                    <button onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium hover:bg-gray-300">Cancelar</button>
                    <button onClick={salvar} disabled={!podeSalvar}
                        className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">
                        {isSaving ? <Loader size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Concluir contrato
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConclusaoContratoModal;
