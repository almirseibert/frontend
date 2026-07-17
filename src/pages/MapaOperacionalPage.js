import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    MapContainer, TileLayer, Marker, Popup, GeoJSON, Polyline, useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
    MapPin, Truck, Users, Building2, Search, RefreshCw, Loader,
    Star, Zap, ZapOff, Layers, Crosshair, Wrench,
} from 'lucide-react';
import { vehicleGroups } from '../utils/vehicleRules';
import { haversineKm } from '../utils/geo';
import {
    resolveEmployeePoint, resolveObraPoint, aptidoes, isOperador,
    rankOperatorsForObra, composeTeam, demandaEquipamentos,
} from '../utils/geoSuggest';

// ── Fix ícones Leaflet ────────────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const coloredIcon = (color) => new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

// Cor do marcador da obra por fase.
const OBRA_STATUS_COLORS = {
    radar: 'grey', planejada: 'blue', mobilizacao: 'orange',
    ativa: 'green', finalizada: 'violet',
};
const obraIconCache = {};
const obraIcon = (status) => {
    const color = OBRA_STATUS_COLORS[status] || 'blue';
    if (!obraIconCache[color]) obraIconCache[color] = coloredIcon(color);
    return obraIconCache[color];
};

// ── Grupos de veículo (para ícone + filtro) ───────────────────────────────────
const VEHICLE_TYPE_GROUPS = {
    leve:     ['Automóvel', 'Camionete', 'Utilitários', 'Moto'],
    caminhao: ['Bitruck', 'Caminhão Pipa', 'Caminhão Tanque', 'Caminhão Carroceria', 'Cavalo',
               'Caçamba Bitruck', 'Caçamba Toco', 'Caçamba Traçado', 'Caçamba Truckado', 'Caminhão', 'Caçamba'],
    trecho:   ['Caminhão Prancha', 'Semirreboques'],
    maquina:  ['Motoniveladora', 'Pá Carregadeira', 'Retroescavadeira', 'Rolo', 'Trator',
               'Escavadeira', 'Escavadeira + Rompedor', 'Fresadora', 'Trator Esteira'],
};
const GROUP_CONFIG = {
    leve:         { emoji: '🚗', label: 'Veículo Leve' },
    caminhao:     { emoji: '🚛', label: 'Caminhão' },
    trecho:       { emoji: '🚚', label: 'Caminhão de Trecho' },
    maquina:      { emoji: '🚜', label: 'Máquina Pesada' },
    desconhecido: { emoji: '📍', label: 'Não cadastrado' },
};
const vehicleTypeGroup = (tipo) => {
    if (!tipo) return 'desconhecido';
    for (const [group, types] of Object.entries(VEHICLE_TYPE_GROUPS)) {
        if (types.includes(tipo)) return group;
    }
    return 'desconhecido';
};
const vehicleIcon = (tipo, ignicao) => {
    const { emoji } = GROUP_CONFIG[vehicleTypeGroup(tipo)];
    const border = ignicao ? '#22c55e' : '#9ca3af';
    const bg = ignicao ? '#f0fdf4' : '#f9fafb';
    return L.divIcon({
        className: '',
        html: `<div style="width:30px;height:30px;border-radius:50%;background:${bg};border:2.5px solid ${border};display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 1px 4px rgba(0,0,0,.25)">${emoji}</div>`,
        iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -16],
    });
};
const employeeIcon = (isLider) => {
    const border = isLider ? '#eab308' : '#3b82f6';
    const bg = isLider ? '#fefce8' : '#eff6ff';
    return L.divIcon({
        className: '',
        html: `<div style="width:26px;height:26px;border-radius:50%;background:${bg};border:2.5px solid ${border};display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 1px 3px rgba(0,0,0,.25)">${isLider ? '⭐' : '👷'}</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14],
    });
};

const RS_CENTER = [-29.6914, -53.8008];
const OBRA_STATUSES = ['radar', 'planejada', 'mobilizacao', 'ativa', 'finalizada'];
const OP_STATUSES = [{ v: 'ativo', l: 'Ativos' }, { v: 'inativo', l: 'Inativos' }, { v: 'afastado', l: 'Afastados' }];

const statusEmpEfetivo = (emp) => {
    if (emp?.statusAfastamentoTipo) return 'afastado';
    return String(emp?.status || 'ativo').toLowerCase() === 'ativo' ? 'ativo' : 'inativo';
};

// Recentraliza o mapa quando uma obra é focada.
const FlyTo = ({ point }) => {
    const map = useMap();
    useEffect(() => {
        if (point) map.flyTo([point.lat, point.lng], 9, { duration: 0.6 });
    }, [point, map]);
    return null;
};

// Pequeno offset determinístico para separar vários colaboradores na mesma cidade.
const spread = (lat, lng, i) => {
    if (!i) return [lat, lng];
    const ang = (i * 137.5) * (Math.PI / 180);
    const r = 0.02 * Math.ceil(i / 8);
    return [lat + r * Math.sin(ang), lng + r * Math.cos(ang)];
};

const Chip = ({ active, onClick, children }) => (
    <button
        type="button"
        onClick={onClick}
        className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition ${
            active ? 'bg-[#9E7A42] text-white border-[#9E7A42]' : 'bg-white text-gray-600 border-gray-300 hover:border-[#9E7A42]'
        }`}
    >
        {children}
    </button>
);

const Section = ({ icon: Icon, title, count, children, color = '#9E7A42' }) => (
    <div className="mb-3 border border-[#e8e0d4] rounded-lg overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-2" style={{ background: '#faf9f7' }}>
            <Icon size={14} style={{ color }} />
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6a5e4e' }}>{title}</span>
            {count != null && (
                <span className="ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#efe9df', color: '#6a5e4e' }}>
                    {count}
                </span>
            )}
        </div>
        <div className="p-3 space-y-2">{children}</div>
    </div>
);

const MapaOperacionalPage = ({ apiClient, obras = [], vehicles = [], employees = [] }) => {
    // ── Camadas ──
    const [layers, setLayers] = useState({ obras: true, veiculos: true, colaboradores: true, cercas: true });
    const toggleLayer = (k) => setLayers((p) => ({ ...p, [k]: !p[k] }));

    // ── Posições ao vivo (SigaSul) ──
    const [positions, setPositions] = useState([]);
    const [loadingPos, setLoadingPos] = useState(false);
    const [posNotConfigured, setPosNotConfigured] = useState(false);
    const [lastFetch, setLastFetch] = useState(null);

    const loadPositions = useCallback(async (force = false) => {
        setLoadingPos(true);
        setPosNotConfigured(false);
        try {
            const res = await apiClient.sigasulGetPositions(force);
            setPositions(Array.isArray(res) ? res : []);
            setLastFetch(new Date());
        } catch (e) {
            if (e.message?.includes('404') || e.message?.includes('not found') || e.message?.includes('não encontrado')) {
                setPosNotConfigured(true);
            }
        } finally {
            setLoadingPos(false);
        }
    }, [apiClient]);

    useEffect(() => { loadPositions(false); }, [loadPositions]);

    // ── Malha municipal (cercas virtuais) — carregada sob demanda de /public ──
    const [geojson, setGeojson] = useState(null);
    useEffect(() => {
        let alive = true;
        fetch(`${process.env.PUBLIC_URL || ''}/data/rs-municipios.geojson`)
            .then((r) => r.json())
            .then((j) => { if (alive) setGeojson(j); })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    // ── Filtros ──
    const [obraStatus, setObraStatus] = useState(new Set(['radar', 'planejada', 'mobilizacao', 'ativa']));
    const [obraSoComCoord, setObraSoComCoord] = useState(false);

    const [vehGroups, setVehGroups] = useState(new Set()); // vazio = todos
    const [vehIgnicao, setVehIgnicao] = useState('todos'); // todos|ligado|desligado
    const [vehSearch, setVehSearch] = useState('');

    const [opStatus, setOpStatus] = useState(new Set(['ativo']));
    const [opEquip, setOpEquip] = useState(new Set()); // vazio = qualquer
    const [opSoLideres, setOpSoLideres] = useState(false);
    const [opSearch, setOpSearch] = useState('');
    const [raioKm, setRaioKm] = useState(0); // 0 = sem raio

    const [selectedObraId, setSelectedObraId] = useState('');

    const toggleSet = (setter) => (val) => setter((prev) => {
        const n = new Set(prev);
        n.has(val) ? n.delete(val) : n.add(val);
        return n;
    });

    const equipamentoOptions = useMemo(() => {
        const s = new Set();
        Object.values(vehicleGroups || {}).forEach((arr) => (arr || []).forEach((t) => s.add(t)));
        return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, []);

    // ── Obra selecionada + ponto (para raio e sugestão) ──
    const selectedObra = useMemo(
        () => obras.find((o) => o.id === selectedObraId) || null,
        [obras, selectedObraId]
    );
    const obraPoint = useMemo(() => resolveObraPoint(selectedObra), [selectedObra]);

    // ── Obras filtradas ──
    const obrasFiltradas = useMemo(() => {
        return obras.filter((o) => {
            const st = o.status && o.status !== 'finalizada' ? o.status : (o.status || 'ativa');
            if (!obraStatus.has(st)) return false;
            const p = resolveObraPoint(o);
            if (!p) return false;
            if (obraSoComCoord && !(o.latitude && o.longitude)) return false;
            return true;
        }).map((o) => ({ obra: o, ponto: resolveObraPoint(o) }));
    }, [obras, obraStatus, obraSoComCoord]);

    // ── Veículos (posições) filtrados ──
    const veiculoTipoByPlaca = useMemo(() => {
        const m = new Map();
        vehicles.forEach((v) => { if (v.placa) m.set(String(v.placa).replace(/[^A-Z0-9]/gi, '').toUpperCase(), v); });
        return m;
    }, [vehicles]);

    const posFiltradas = useMemo(() => {
        const q = vehSearch.trim().toLowerCase();
        return positions.filter((p) => {
            if (!p.pos_latitude || !p.pos_longitude) return false;
            const tipo = p.veiculo_tipo;
            if (vehGroups.size > 0 && !vehGroups.has(vehicleTypeGroup(tipo))) return false;
            if (vehIgnicao === 'ligado' && !p.pos_ignicao) return false;
            if (vehIgnicao === 'desligado' && p.pos_ignicao) return false;
            if (q) {
                const placa = (p.pos_placa || '').toLowerCase();
                const key = String(p.pos_placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
                const reg = veiculoTipoByPlaca.get(key)?.registroInterno || '';
                if (!placa.includes(q) && !String(reg).toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [positions, vehGroups, vehIgnicao, vehSearch, veiculoTipoByPlaca]);

    // ── Colaboradores filtrados (com ponto) ──
    const operadoresFiltrados = useMemo(() => {
        const q = opSearch.trim().toLowerCase();
        const out = [];
        for (const emp of employees) {
            if (!isOperador(emp)) continue;
            if (opSoLideres && !emp.is_lider_obra) continue;
            if (!opStatus.has(statusEmpEfetivo(emp))) continue;
            if (opEquip.size > 0 && !aptidoes(emp).some((t) => opEquip.has(t))) continue;
            const p = resolveEmployeePoint(emp);
            if (!p) continue;
            if (q && !(`${emp.nome} ${emp.vulgo || ''}`.toLowerCase().includes(q))) continue;
            let dist = null;
            if (obraPoint) {
                dist = haversineKm(obraPoint, p);
                if (raioKm > 0 && dist > raioKm) continue;
            }
            out.push({ emp, ponto: p, dist });
        }
        if (obraPoint) out.sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
        // Índice por cidade para espalhar marcadores coincidentes (mesma cidade).
        const counter = new Map();
        out.forEach((it) => {
            const cod = it.ponto.codigo_ibge || '?';
            const idx = counter.get(cod) || 0;
            it.cityIdx = idx;
            counter.set(cod, idx + 1);
        });
        return out;
    }, [employees, opStatus, opEquip, opSoLideres, opSearch, obraPoint, raioKm]);

    // ── Cidades com obra (destaque das cercas) ──
    const cidadesComObra = useMemo(() => {
        const s = new Set();
        obrasFiltradas.forEach(({ obra }) => { if (obra.cidade_ibge) s.add(String(obra.cidade_ibge)); });
        return s;
    }, [obrasFiltradas]);
    // Assinatura estável para forçar o re-mount do GeoJSON quando o conjunto muda.
    const cercaKey = useMemo(() => [...cidadesComObra].sort().join(','), [cidadesComObra]);

    // ── Sugestão de equipe (obra selecionada) ──
    const equipe = useMemo(
        () => (selectedObra ? composeTeam(selectedObra, employees, { incluirInativos: false }) : null),
        [selectedObra, employees]
    );
    const rankSel = useMemo(
        () => (selectedObra ? rankOperatorsForObra(selectedObra, employees, { incluirInativos: false }).slice(0, 10) : []),
        [selectedObra, employees]
    );
    const demandaSel = useMemo(() => (selectedObra ? demandaEquipamentos(selectedObra) : []), [selectedObra]);

    const geoStyle = useCallback((feature) => {
        const cod = String(feature.properties.codigo_ibge);
        const temObra = cidadesComObra.has(cod);
        return {
            color: temObra ? '#9E7A42' : '#c9bda8',
            weight: temObra ? 1.6 : 0.5,
            fillColor: temObra ? '#9E7A42' : '#000',
            fillOpacity: temObra ? 0.18 : 0.03,
        };
    }, [cidadesComObra]);

    const onEachCity = useCallback((feature, layer) => {
        const cod = String(feature.properties.codigo_ibge);
        const nObras = obrasFiltradas.filter(({ obra }) => String(obra.cidade_ibge) === cod).length;
        layer.bindPopup(`<strong>${feature.properties.nome}</strong><br/>${nObras} obra(s)`);
    }, [obrasFiltradas]);

    const [suggestTab, setSuggestTab] = useState('proximos');

    return (
        <div className="flex h-full" style={{ background: '#f5f3ef' }}>
            {/* Painel de filtros */}
            <aside className="shrink-0 overflow-y-auto mak-scrollbar" style={{ width: 320, background: '#fff', borderRight: '1px solid #e5e0d8' }}>
                <div className="p-4">
                    <h2 className="text-base font-bold flex items-center gap-2 mb-1" style={{ color: '#9E7A42' }}>
                        <MapPin size={18} /> Mapa Operacional
                    </h2>
                    <p className="text-[11px] text-gray-400 mb-3">
                        Frota, obras e colaboradores do RS + sugestão de equipe.
                    </p>

                    {/* Camadas */}
                    <Section icon={Layers} title="Camadas">
                        <div className="grid grid-cols-2 gap-1.5">
                            {[
                                ['obras', 'Obras', Building2],
                                ['veiculos', 'Veículos', Truck],
                                ['colaboradores', 'Operadores', Users],
                                ['cercas', 'Cercas (cidades)', MapPin],
                            ].map(([k, label, Icon]) => (
                                <button
                                    key={k}
                                    onClick={() => toggleLayer(k)}
                                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium border transition ${
                                        layers[k] ? 'bg-[#fdf8f0] border-[#9E7A42] text-[#9E7A42]' : 'bg-white border-gray-200 text-gray-400'
                                    }`}
                                >
                                    <Icon size={13} /> {label}
                                </button>
                            ))}
                        </div>
                    </Section>

                    {/* Contexto: obra selecionada */}
                    <Section icon={Crosshair} title="Obra em foco">
                        <select
                            value={selectedObraId}
                            onChange={(e) => setSelectedObraId(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                        >
                            <option value="">Nenhuma</option>
                            {obras
                                .filter((o) => resolveObraPoint(o))
                                .slice()
                                .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
                                .map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                        </select>
                        {selectedObra && (
                            <div>
                                <label className="text-[11px] text-gray-500 flex justify-between">
                                    <span>Raio de busca</span>
                                    <span className="font-bold">{raioKm > 0 ? `${raioKm} km` : 'sem limite'}</span>
                                </label>
                                <input
                                    type="range" min="0" max="500" step="10"
                                    value={raioKm}
                                    onChange={(e) => setRaioKm(Number(e.target.value))}
                                    className="w-full"
                                />
                            </div>
                        )}
                    </Section>

                    {/* Obras */}
                    {layers.obras && (
                        <Section icon={Building2} title="Obras" count={obrasFiltradas.length}>
                            <div className="flex flex-wrap gap-1">
                                {OBRA_STATUSES.map((s) => (
                                    <Chip key={s} active={obraStatus.has(s)} onClick={() => toggleSet(setObraStatus)(s)}>{s}</Chip>
                                ))}
                            </div>
                            <label className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                                <input type="checkbox" checked={obraSoComCoord} onChange={(e) => setObraSoComCoord(e.target.checked)} />
                                Só com coordenada própria
                            </label>
                        </Section>
                    )}

                    {/* Veículos */}
                    {layers.veiculos && (
                        <Section icon={Truck} title="Veículos" count={posFiltradas.length}>
                            <div className="flex flex-wrap gap-1">
                                {Object.entries(GROUP_CONFIG).filter(([k]) => k !== 'desconhecido').map(([k, cfg]) => (
                                    <Chip key={k} active={vehGroups.has(k)} onClick={() => toggleSet(setVehGroups)(k)}>{cfg.emoji} {cfg.label}</Chip>
                                ))}
                            </div>
                            <div className="flex gap-1">
                                {['todos', 'ligado', 'desligado'].map((v) => (
                                    <Chip key={v} active={vehIgnicao === v} onClick={() => setVehIgnicao(v)}>
                                        {v === 'ligado' ? '🟢 ligado' : v === 'desligado' ? '⚪ desligado' : 'todos'}
                                    </Chip>
                                ))}
                            </div>
                            <div className="relative">
                                <Search size={13} className="absolute left-2 top-2.5 text-gray-400" />
                                <input
                                    value={vehSearch}
                                    onChange={(e) => setVehSearch(e.target.value)}
                                    placeholder="Placa ou registro..."
                                    className="w-full pl-7 pr-2 py-1.5 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-yellow-400"
                                />
                            </div>
                            {posNotConfigured && (
                                <p className="text-[11px] text-amber-600">Integração SigaSul não configurada.</p>
                            )}
                        </Section>
                    )}

                    {/* Operadores */}
                    {layers.colaboradores && (
                        <Section icon={Users} title="Operadores" count={operadoresFiltrados.length}>
                            <div className="flex flex-wrap gap-1">
                                {OP_STATUSES.map((s) => (
                                    <Chip key={s.v} active={opStatus.has(s.v)} onClick={() => toggleSet(setOpStatus)(s.v)}>{s.l}</Chip>
                                ))}
                                <Chip active={opSoLideres} onClick={() => setOpSoLideres((v) => !v)}>⭐ Só líderes</Chip>
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1 flex items-center gap-1">
                                    <Wrench size={11} /> Aptidão de equipamento
                                </p>
                                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto mak-scrollbar">
                                    {equipamentoOptions.map((t) => (
                                        <Chip key={t} active={opEquip.has(t)} onClick={() => toggleSet(setOpEquip)(t)}>{t}</Chip>
                                    ))}
                                </div>
                            </div>
                            <div className="relative">
                                <Search size={13} className="absolute left-2 top-2.5 text-gray-400" />
                                <input
                                    value={opSearch}
                                    onChange={(e) => setOpSearch(e.target.value)}
                                    placeholder="Nome ou apelido..."
                                    className="w-full pl-7 pr-2 py-1.5 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-yellow-400"
                                />
                            </div>
                        </Section>
                    )}

                    {/* Sugestão */}
                    {selectedObra && (
                        <Section icon={Star} title="Sugestão de equipe" color="#eab308">
                            <div className="flex gap-1 mb-1">
                                <Chip active={suggestTab === 'proximos'} onClick={() => setSuggestTab('proximos')}>Próximos</Chip>
                                <Chip active={suggestTab === 'equipe'} onClick={() => setSuggestTab('equipe')}>Equipe</Chip>
                            </div>
                            {suggestTab === 'proximos' ? (
                                <ul className="space-y-1">
                                    {rankSel.length === 0 && <li className="text-xs text-gray-400 italic">Nenhum operador apto encontrado.</li>}
                                    {rankSel.map(({ employee, distanciaKm, isLider, cidade }) => (
                                        <li key={employee.id} className="flex items-center gap-1.5 text-xs">
                                            {isLider ? <Star size={12} className="text-yellow-500" /> : <span className="w-3" />}
                                            <span className="font-medium text-gray-800 truncate">{employee.nome}</span>
                                            <span className="text-gray-400 truncate">{cidade}</span>
                                            <span className="ml-auto font-semibold text-gray-500">{distanciaKm.toFixed(0)}km</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="space-y-1.5 text-xs">
                                    <div className="flex items-center gap-1.5">
                                        <Star size={12} className="text-yellow-500" />
                                        <span className="font-bold text-gray-600">Líder:</span>
                                        {equipe?.lider
                                            ? <span className="text-gray-800">{equipe.lider.employee.nome} · {equipe.lider.distanciaKm.toFixed(0)}km</span>
                                            : <span className="text-red-500 italic">nenhum líder apto</span>}
                                    </div>
                                    {demandaSel.length === 0 && (
                                        <p className="text-gray-400 italic">Obra sem equipamentos contratados — defina o contrato de horas para montar a equipe.</p>
                                    )}
                                    {equipe?.operadoresPorTipo.map(({ tipo, employee, distanciaKm }) => (
                                        <div key={tipo} className="flex items-center gap-1.5">
                                            <Wrench size={11} className="text-gray-400" />
                                            <span className="font-semibold text-gray-500 truncate">{tipo}:</span>
                                            <span className="text-gray-800 truncate">{employee.nome}</span>
                                            <span className="ml-auto text-gray-500">{distanciaKm.toFixed(0)}km</span>
                                        </div>
                                    ))}
                                    {equipe?.faltantes.map((t) => (
                                        <div key={t} className="flex items-center gap-1.5 text-red-500">
                                            <Wrench size={11} />
                                            <span className="truncate">{t}: sem operador apto</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Section>
                    )}
                </div>
            </aside>

            {/* Mapa */}
            <main className="flex-1 relative">
                <div className="absolute top-3 right-3 z-[500] flex items-center gap-2">
                    {lastFetch && (
                        <span className="text-[11px] bg-white/90 px-2 py-1 rounded shadow text-gray-500">
                            Frota: {lastFetch.toLocaleTimeString('pt-BR')}
                        </span>
                    )}
                    <button
                        onClick={() => loadPositions(true)}
                        disabled={loadingPos}
                        className="flex items-center gap-1.5 bg-[#9E7A42] text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow hover:opacity-90 disabled:opacity-60"
                    >
                        {loadingPos ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />} Atualizar frota
                    </button>
                </div>

                <MapContainer center={RS_CENTER} zoom={7} style={{ height: '100%', width: '100%' }}>
                    <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <FlyTo point={obraPoint} />

                    {/* Cercas virtuais (cidades) */}
                    {layers.cercas && geojson && (
                        <GeoJSON key={cercaKey} data={geojson} style={geoStyle} onEachFeature={onEachCity} />
                    )}

                    {/* Obras */}
                    {layers.obras && obrasFiltradas.map(({ obra, ponto }) => (
                        <Marker key={obra.id} position={[ponto.lat, ponto.lng]} icon={obraIcon(obra.status)}>
                            <Popup>
                                <strong>{obra.nome}</strong><br />
                                <span className="text-xs">Fase: {obra.status || '—'}</span>
                                {obra.regiao && <><br /><span className="text-xs">Região: {obra.regiao}</span></>}
                                <br />
                                <button
                                    className="mt-1 text-xs text-[#9E7A42] underline"
                                    onClick={() => setSelectedObraId(obra.id)}
                                >
                                    Focar e sugerir equipe
                                </button>
                            </Popup>
                        </Marker>
                    ))}

                    {/* Colaboradores */}
                    {layers.colaboradores && operadoresFiltrados.map(({ emp, ponto, dist, cityIdx }) => {
                        const [lat, lng] = spread(ponto.lat, ponto.lng, cityIdx || 0);
                        return (
                            <Marker key={emp.id} position={[lat, lng]} icon={employeeIcon(!!emp.is_lider_obra)}>
                                <Popup>
                                    <strong>{emp.nome}{emp.vulgo ? ` (${emp.vulgo})` : ''}</strong><br />
                                    <span className="text-xs">{emp.funcao || '—'} · {ponto.cidade}</span><br />
                                    <span className="text-xs">Apto: {aptidoes(emp).join(', ') || '—'}</span>
                                    {emp.is_lider_obra ? <><br /><span className="text-xs text-yellow-600">⭐ Líder de obra</span></> : null}
                                    {dist != null && <><br /><span className="text-xs">Distância: {dist.toFixed(0)} km</span></>}
                                </Popup>
                            </Marker>
                        );
                    })}

                    {/* Veículos ao vivo */}
                    {layers.veiculos && posFiltradas.map((p, i) => {
                        const key = String(p.pos_placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
                        const veic = veiculoTipoByPlaca.get(key);
                        return (
                            <Marker key={`${p.pos_placa}-${i}`} position={[p.pos_latitude, p.pos_longitude]} icon={vehicleIcon(p.veiculo_tipo, p.pos_ignicao)}>
                                <Popup>
                                    <strong>{p.pos_placa}</strong>{veic?.registroInterno ? ` · ${veic.registroInterno}` : ''}<br />
                                    <span className="text-xs">{p.veiculo_tipo || 'Tipo N/A'}</span><br />
                                    <span className="text-xs flex items-center gap-1">
                                        {p.pos_ignicao ? <Zap size={11} className="text-green-600" /> : <ZapOff size={11} className="text-gray-400" />}
                                        {p.pos_ignicao ? 'Ligado' : 'Desligado'} · {p.pos_velocidade || 0} km/h
                                    </span>
                                    {p.pos_nome_motorista && <><br /><span className="text-xs">{p.pos_nome_motorista}</span></>}
                                </Popup>
                            </Marker>
                        );
                    })}

                    {/* Polylines obra → operadores sugeridos */}
                    {obraPoint && rankSel.slice(0, 5).map(({ employee, ponto }) => (
                        <Polyline
                            key={`line-${employee.id}`}
                            positions={[[obraPoint.lat, obraPoint.lng], [ponto.lat, ponto.lng]]}
                            pathOptions={{ color: employee.is_lider_obra ? '#eab308' : '#9E7A42', weight: 1.5, dashArray: '5,6', opacity: 0.7 }}
                        />
                    ))}
                </MapContainer>
            </main>
        </div>
    );
};

export default MapaOperacionalPage;
