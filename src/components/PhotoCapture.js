// src/components/PhotoCapture.js
// -----------------------------------------------------------------------------
// Captura de foto (câmera ou galeria) — extraído de ComboioDistribuicaoModal
// (Fase 3, §1). Diferença crítica: `compressImage` agora tem onerror (§3.9).
// HEIC de iPhone faz canvas.drawImage falhar; sem onerror a perda era SILENCIOSA
// e o operador achava que mandou. Em falha, entregamos os BYTES ORIGINAIS para a
// fila enfileirar e o servidor transcodificar (sharp decodifica HEIC — Fase 0).
// -----------------------------------------------------------------------------
import React, { useRef } from 'react';
import { Camera, Image as ImageIcon, CheckCircle, Trash2, AlertTriangle } from 'lucide-react';

// onOk(blob, previewUrl, { comprimido }) | onFail(file, previewUrl) com bytes originais.
export const compressImage = (file, onOk, onFail) => {
    const cair = () => {
        try {
            const url = URL.createObjectURL(file);
            onFail ? onFail(file, url) : onOk(file, url, { comprimido: false });
        } catch {
            onFail ? onFail(file, null) : onOk(file, null, { comprimido: false });
        }
    };
    let reader;
    try { reader = new FileReader(); } catch { return cair(); }
    reader.onerror = cair;               // ← faltava: leitura falhou
    reader.onload = (event) => {
        const img = new Image();
        img.onerror = cair;              // ← faltava: HEIC/decodificação falhou
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1280;
                let { width, height } = img;
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (!blob) return cair();
                    onOk(blob, URL.createObjectURL(blob), { comprimido: true });
                }, 'image/jpeg', 0.7);
            } catch { cair(); }
        };
        img.src = event.target.result;
    };
    try { reader.readAsDataURL(file); } catch { cair(); }
};

// `fonte`: 'ambas' (padrão histórico) | 'camera' | 'galeria'.
// Evidência do dia é 'camera': a foto tem que ser tirada no dia, e a fila offline
// já cobre quem está sem sinal. Anexo retroativo é 'galeria': `capture` não faz
// sentido para um dia passado.
const PhotoCapture = ({ label, hint, photo, onPick, onClear, disabled, fonte = 'ambas' }) => {
    const camRef = useRef(null);
    const galRef = useRef(null);
    const mostraCam = fonte !== 'galeria';
    const mostraGal = fonte !== 'camera';

    const handle = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        compressImage(
            file,
            (blob, preview, info) => onPick(blob, preview, info),
            (orig, preview) => onPick(orig, preview, { comprimido: false, original: true }),
        );
        e.target.value = '';
    };

    return (
        <div className="space-y-1">
            {label && (
                <label className="text-xs font-bold text-gray-600 uppercase ml-0.5 flex items-center gap-1">
                    {label} <span className="text-red-500">*</span>
                </label>
            )}
            {hint && <p className="text-[11px] text-gray-400 -mt-0.5">{hint}</p>}
            <div className={`border-2 border-dashed rounded-xl p-2 flex items-center justify-center h-44 relative overflow-hidden ${photo ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50'} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
                {photo ? (
                    <div onClick={onClear} className="w-full h-full relative cursor-pointer">
                        <img src={photo.preview} alt={label || 'foto'} className="absolute inset-0 w-full h-full object-cover rounded-lg" />
                        <div className="absolute bottom-1.5 left-0 right-0 flex justify-center">
                            <span className="bg-white px-2 py-0.5 rounded-full shadow text-[11px] font-bold text-green-700 inline-flex items-center gap-1">
                                <CheckCircle size={11} /> OK <span className="text-gray-300">|</span> <Trash2 size={10} className="text-red-500" /> Trocar
                            </span>
                        </div>
                        {photo.original && (
                            <div className="absolute top-1.5 left-1.5">
                                <span className="bg-amber-500 text-white px-1.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1">
                                    <AlertTriangle size={10} /> original
                                </span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex gap-3 w-full h-full items-center justify-center">
                        {mostraCam && (
                            <div onClick={() => camRef.current?.click()} className="flex-1 h-full flex flex-col items-center justify-center bg-white rounded-lg cursor-pointer hover:bg-yellow-50 active:bg-yellow-100 transition border border-gray-200 shadow-sm">
                                <Camera size={30} className="text-gray-700 mb-1" />
                                <span className="text-sm font-bold text-gray-700">{mostraGal ? 'Câmera' : 'Tirar foto'}</span>
                            </div>
                        )}
                        {mostraGal && (
                            <div onClick={() => galRef.current?.click()} className="flex-1 h-full flex flex-col items-center justify-center bg-white rounded-lg cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition border border-gray-200 shadow-sm">
                                <ImageIcon size={30} className="text-gray-700 mb-1" />
                                <span className="text-sm font-bold text-gray-700">{mostraCam ? 'Galeria' : 'Escolher do arquivo'}</span>
                            </div>
                        )}
                    </div>
                )}
                <input type="file" ref={camRef} className="hidden" accept="image/*" capture="environment" onChange={handle} />
                <input type="file" ref={galRef} className="hidden" accept="image/*" onChange={handle} />
            </div>
        </div>
    );
};

export default PhotoCapture;
