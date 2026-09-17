// components/comboio/ComboioTankStrip.js
//
// Faixa com todos os comboios e o nível de cada tanque. Clicar num card
// seleciona o comboio da página (substitui o antigo combo de busca, que
// escondia o estoque dos demais).
//
// Medidor (dataviz): a cor do preenchimento carrega a severidade e a trilha é um
// tom claro da mesma rampa. Severidade nunca vai só na cor — sempre com ícone e
// texto. Sem capacidade cadastrada não inventamos porcentagem (a tela antiga
// assumia 2000 L).
import React from 'react';
import { AlertTriangle, MapPin, Truck } from 'lucide-react';
import { getComboioTanks } from '../../utils/fuelTypes';
import { formatObraNome } from '../../utils/obraFormat';

export const TANQUE_BAIXO_PCT = 20;

const RAMPAS = {
    normal:  { fill: '#9E7A42', track: '#efe4d2' },
    baixo:   { fill: '#fab219', track: '#fdefc8' },
    acima:   { fill: '#ec835a', track: '#fbe0d5' },
    semCap:  { fill: '#b0a090', track: '#f0ebe3' },
};

export const nivelDoTanque = (t) => {
    if (t.pct == null) return 'semCap';
    if (t.pct > 100.5) return 'acima';
    if (t.pct <= TANQUE_BAIXO_PCT) return 'baixo';
    return 'normal';
};

const fmtL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export const TankMeter = ({ tanque, compact = false }) => {
    const nivel = nivelDoTanque(tanque);
    const rampa = RAMPAS[nivel];
    const largura = tanque.pct == null ? 0 : Math.min(Math.max(tanque.pct, 0), 100);
    return (
        <div>
            <div className="flex justify-between items-baseline gap-2" style={{ fontSize: compact ? 10 : 11 }}>
                <span style={{ fontWeight: 700, color: '#3d3528' }}>{tanque.short}</span>
                <span style={{ color: '#1e1a14', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtL(tanque.litros)} L
                    {tanque.pct != null && <span style={{ color: '#9a8a78', fontWeight: 400 }}> · {Math.round(tanque.pct)}%</span>}
                </span>
            </div>
            <div
                className="w-full rounded-full overflow-hidden mt-1"
                style={{ height: compact ? 5 : 6, background: rampa.track }}
                role="meter"
                aria-label={`Tanque ${tanque.label}`}
                aria-valuemin={0}
                aria-valuemax={tanque.capacidade || undefined}
                aria-valuenow={Math.round(tanque.litros)}
            >
                <div style={{ width: `${largura}%`, height: '100%', background: rampa.fill, borderRadius: 9999, transition: 'width 0.5s ease' }} />
            </div>
            {(nivel === 'baixo' || nivel === 'acima') && (
                <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: 10, color: '#6a5e4e' }}>
                    <AlertTriangle size={10} style={{ color: rampa.fill }} />
                    {nivel === 'baixo' ? 'Nível baixo' : 'Acima da capacidade cadastrada'}
                </div>
            )}
        </div>
    );
};

const ComboioTankStrip = ({ comboios = [], obras = [], selectedId, onSelect, pendenciasPorComboio = {} }) => {
    if (comboios.length === 0) {
        return (
            <p style={{ fontSize: 12, color: '#9a8a78' }} className="italic">
                Nenhum comboio cadastrado. Marque um veículo como "Comboio" no cadastro de veículos para ele aparecer aqui.
            </p>
        );
    }

    return (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
            {comboios.map(c => {
                const ativo = c.id === selectedId;
                const tanques = getComboioTanks(c);
                const obra = obras.find(o => o.id === c.obraAtualId);
                const pend = pendenciasPorComboio[c.id] || 0;
                return (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => onSelect(c.id)}
                        aria-pressed={ativo}
                        className="text-left rounded-xl p-3 transition hover:shadow-sm"
                        style={{
                            background: ativo ? '#fdf8f0' : '#ffffff',
                            border: `1px solid ${ativo ? '#9E7A42' : '#f0ebe3'}`,
                            boxShadow: ativo ? '0 0 0 3px rgba(158,122,66,0.15)' : 'none',
                        }}
                    >
                        <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5" style={{ fontSize: 14, fontWeight: 700, color: '#1e1a14' }}>
                                    <Truck size={14} style={{ color: '#9E7A42' }} /> {c.registroInterno}
                                </div>
                                <div className="truncate" style={{ fontSize: 11, color: '#9a8a78' }}>
                                    {[c.placa, c.modelo].filter(Boolean).join(' · ')}
                                </div>
                            </div>
                            {pend > 0 && (
                                <span title="Pendências (ordens aguardando baixa ou saídas bloqueadas)"
                                    style={{ background: '#fdf0ec', color: '#b03828', border: '1px solid #e8c8bc', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 9999, whiteSpace: 'nowrap' }}>
                                    {pend} pend.
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1 mt-1 truncate" style={{ fontSize: 11, color: obra ? '#2d5a8a' : '#b0a090' }}>
                            <MapPin size={11} className="flex-shrink-0" />
                            <span className="truncate">{obra ? formatObraNome(obra) : 'Sem obra atual'}</span>
                        </div>
                        <div className="space-y-2 mt-2.5">
                            {tanques.map(t => <TankMeter key={t.key} tanque={t} compact />)}
                        </div>
                        {!c.fuelCapacity && (
                            <div style={{ fontSize: 10, color: '#b0a090', marginTop: 6 }}>Capacidade não cadastrada</div>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default ComboioTankStrip;
