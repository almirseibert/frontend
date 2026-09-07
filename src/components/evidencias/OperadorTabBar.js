// src/components/evidencias/OperadorTabBar.js
// Barra inferior fixa do operador — Evidências de Campo, Fase 3 (§10.1).
// Unifica as funções da tela do operador: Abastecimento · Evidências · Fila.
// O badge de pendências aparece em TODAS as abas (§3.8): quem foi para
// abastecimento precisa continuar sabendo que há fotos presas.
import React from 'react';
import { Fuel, Camera, UploadCloud } from 'lucide-react';

const Item = ({ ativo, onClick, Icon, texto, badge }) => (
    <button
        onClick={onClick}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative"
        style={{ color: ativo ? '#9E7A42' : '#8a8577' }}
    >
        <div className="relative">
            <Icon size={24} strokeWidth={ativo ? 2.4 : 1.8} />
            {badge > 0 && (
                <span
                    className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                    style={{ background: '#dc2626', color: '#fff' }}
                >
                    {badge > 99 ? '99+' : badge}
                </span>
            )}
        </div>
        <span className="text-[11px] font-bold">{texto}</span>
        {ativo && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full" style={{ background: '#9E7A42' }} />}
    </button>
);

const OperadorTabBar = ({ aba, onAba, pendencias = 0 }) => (
    <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
        style={{
            background: '#1c1a17', borderTop: '1px solid #2c2925',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
    >
        <Item ativo={aba === 'abastecimento'} onClick={() => onAba('abastecimento')} Icon={Fuel} texto="Abastecimento" />
        <Item ativo={aba === 'evidencias'} onClick={() => onAba('evidencias')} Icon={Camera} texto="Evidências" />
        <Item ativo={aba === 'fila'} onClick={() => onAba('fila')} Icon={UploadCloud} texto="Fila" badge={pendencias} />
    </nav>
);

export default OperadorTabBar;
