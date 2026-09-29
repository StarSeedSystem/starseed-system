'use client';

// ════════════════════════════════════════════════════════════════
// InternetRadarWidget — Radar de Internet / Red Sináptica (Ola 0929 · D)
// ----------------------------------------------------------------
// «¿Por dónde viaja ahora mi conexión y quién hay cerca?». Todo es del
// subsistema de malla REAL (useMeshState · useNearbyBeacons ·
// useDeliveryReceipts): bandas y antenas en uso con sus métricas y la
// configuración rápida de la LoRa, neuronas cercanas por faro y los
// recibos de cada transmisión (por qué nodos/servidores pasó).
// Honestidad: el rumbo de una señal sin GPS es su sector de antena
// (anillo de precisión grande) — se dice bajo el radar.
// Tráfico: este widget no sondea nada. Los faros los lee el bucle común
// de la malla; «Buscar cerca» pide una lectura (con su propio límite de
// 2 min) solo cuando la persona pulsa.
//
// micro = el anillo de bandas con las neuronas cercanas · s = + la última
// transmisión · m = anillo + bandas · l = radar de señales + bandas con
// configuración rápida · xl = radar + bandas + cercanas + actividad ·
// panorámico = las tres zonas en fila. Estados: cargando (orbe mientras se
// resuelve la sesión local), vacío honesto con acción en «Cerca» y en
// «Actividad»; sin lectura de red propia no hay error que mostrar.
// ════════════════════════════════════════════════════════════════

import * as React from 'react';
import Link from 'next/link';
import {
    AlertTriangle, Antenna, Bluetooth, CheckCircle2, Clock, Gauge, Globe, Lock, Radar, Radio, Route, Search, Send, Wifi, XCircle,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { uidActual } from '@/lib/consumo/usuario';
import { SignalsRadar } from '@/components/mesh/signals-radar';
import {
    useMeshState, useNearbyBeacons, useDeliveryReceipts,
    describeBands, hasRelayKey, applyModemPreset, recommendPreset, getActiveModemPreset,
    refreshNearbyNow, transmit,
    type BandStatus, type RelayBeacon, type DeliveryReceipt, type DeliveryStatus,
} from '@/ai/astraura/mesh';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { MarcoSocial } from './_social-d/marco-social';
import { Pastilla, Punto, Segmentos, Tiempo, estilosSocial as estilos, tintaDe } from './_social-d/piezas';
import { filasQueCaben, type TamanoSocial } from './_social-d/tamano';
import { recortar } from './_social-d/formato';

const ACENTO = '#38bdf8';

const BANDA: Record<string, { icono: LucideIcon; color: string; corto: string }> = {
    lora: { icono: Radio, color: '#34d399', corto: 'LoRa' },
    server: { icono: Globe, color: '#60a5fa', corto: 'Nube' },
    relay: { icono: Lock, color: '#a78bfa', corto: 'Relé' },
    ble: { icono: Bluetooth, color: '#38bdf8', corto: 'BLE' },
    wifi: { icono: Wifi, color: '#22d3ee', corto: 'Wi-Fi' },
};
const bandaDe = (id: string) => BANDA[id] ?? { icono: Antenna, color: ACENTO, corto: id };

const ESTADO_ENVIO: Record<DeliveryStatus, { icono: LucideIcon; color: string; etiqueta: string }> = {
    delivered: { icono: CheckCircle2, color: '#10b981', etiqueta: 'Entregado' },
    sent: { icono: Send, color: '#818cf8', etiqueta: 'Enviado' },
    partial: { icono: AlertTriangle, color: '#f59e0b', etiqueta: 'Parcial' },
    queued: { icono: Clock, color: '#38bdf8', etiqueta: 'En cola' },
    failed: { icono: XCircle, color: '#ef4444', etiqueta: 'Falló' },
};

type Vista = 'bandas' | 'cerca' | 'actividad';

export function InternetRadarWidget() {
    const mesh = useMeshState();
    const cercanas = useNearbyBeacons();
    const envios = useDeliveryReceipts();
    const [conCuenta, setConCuenta] = React.useState(false);
    const [claveRele, setClaveRele] = React.useState(false);
    const [preset, setPreset] = React.useState('UNSET');
    const [aplicando, setAplicando] = React.useState(false);
    const [emitiendo, setEmitiendo] = React.useState(false);
    const [buscando, setBuscando] = React.useState(false);
    const [vista, setVista] = React.useState<Vista>('bandas');
    const [listo, setListo] = React.useState(false);

    // Señales locales (sin red): sesión en caché, clave de relé y preset del módem.
    React.useEffect(() => {
        let vivo = true;
        void uidActual().then((id) => { if (vivo) { setConCuenta(!!id); setListo(true); } }).catch(() => { if (vivo) setListo(true); });
        setClaveRele(hasRelayKey());
        setPreset(getActiveModemPreset());
        return () => { vivo = false; };
    }, [mesh.region, mesh.status]);

    const vecinos = React.useMemo(() => mesh.nodes.filter((n) => !n.isSelf && n.presence === 'online').length, [mesh.nodes]);
    const bandas = React.useMemo(
        () => describeBands(mesh, { wifiHealthy: mesh.wifiHealth.score >= 0.55, hasAccount: conCuenta, nearbyCount: cercanas.length, activePreset: preset, relayKey: claveRele }),
        [mesh, conCuenta, cercanas.length, preset, claveRele],
    );
    const activas = bandas.filter((b) => b.active).length;
    const ultimo = envios[0] ?? null;

    const emitir = async () => {
        if (emitiendo) return;
        setEmitiendo(true);
        try {
            await transmit({
                scope: 'local-group', type: 'presence', cls: 'P1', target: 'broadcast', distance: 'local',
                body: { h: mesh.self?.id ?? 'neurona', n: mesh.self?.shortName ?? mesh.self?.longName ?? 'Neurona', b: mesh.self?.batteryLevel ?? null },
            });
            setVista('actividad');
        } finally {
            setEmitiendo(false);
        }
    };
    const aplicarObjetivo = async (objetivo: 'auto' | 'distancia' | 'velocidad') => {
        if (aplicando) return;
        setAplicando(true);
        try {
            const snrs = mesh.nodes.filter((n) => !n.isSelf && typeof n.snr === 'number').map((n) => n.snr as number);
            const reco = recommendPreset(objetivo, {
                avgSnr: snrs.length ? snrs.reduce((a, b) => a + b, 0) / snrs.length : null,
                onlineNodes: vecinos, channelUtilPct: mesh.self?.channelUtilization ?? null, region: mesh.region,
            }, preset === 'UNSET' ? null : preset);
            if (await applyModemPreset(reco.presetKey)) setPreset(reco.presetKey);
        } finally {
            setAplicando(false);
        }
    };
    const buscar = () => {
        setBuscando(true);
        refreshNearbyNow();
        window.setTimeout(() => setBuscando(false), 1500);
    };

    const resumen = `${activas} de ${bandas.length} bandas activas · ${cercanas.length} ${cercanas.length === 1 ? 'neurona cercana' : 'neuronas cercanas'} · ${vecinos} en la malla`;

    return (
        <MarcoSocial
            titulo="Radar de Internet"
            subtitulo={() => `${activas}/${bandas.length} bandas · ${cercanas.length} cerca`}
            icono={Radar}
            categoria="red"
            acento={ACENTO}
            estado={listo ? 'listo' : 'cargando'}
            esqueleto="orbe"
            vivo={activas > 0}
            acciones={(t) => (
                <Pastilla acento={t.acento} icono={Search} onClick={buscar} disabled={buscando} tactil={t.tactil} title="Pedir ahora los faros de las neuronas cercanas">
                    {buscando ? 'Buscando…' : 'Buscar cerca'}
                </Pastilla>
            )}
            pie={(t) => (t.base === 'xl' || (t.clase === 'panoramico' && t.alto >= 200)) ? (
                <div className="flex items-center justify-between gap-2 text-[11px] text-white/55">
                    <span>El rumbo de una señal sin GPS es el sector de su antena: su anillo dice cuánta duda hay.</span>
                    <Link href="/red-mesh" className="shrink-0 cursor-pointer font-semibold hover:text-white" style={{ color: tintaDe(t.acento) }}>Abrir la red mesh</Link>
                </div>
            ) : null}
        >
            {(t) => {
                if (t.base === 'micro') {
                    return (
                        <Link href="/red-mesh" aria-label={resumen} className="flex h-full cursor-pointer items-center justify-center">
                            <AnilloBandas t={t} bandas={bandas} cercanas={cercanas.length} lado={Math.max(48, Math.min(t.ancho, t.alto))} />
                        </Link>
                    );
                }
                if (t.base === 's') {
                    return (
                        <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2" aria-label={resumen}>
                            <AnilloBandas t={t} bandas={bandas} cercanas={cercanas.length} lado={Math.max(64, Math.min(t.ancho, t.alto - 34))} />
                            {ultimo ? <FilaEnvio r={ultimo} denso /> : <span className="text-[11px] text-white/55">{activas}/{bandas.length} bandas activas</span>}
                        </div>
                    );
                }
                if (t.clase === 'panoramico') {
                    const radarAlto = Math.max(90, t.alto - 8);
                    return (
                        <div className="flex h-full min-h-0 gap-4" aria-label={resumen}>
                            <div className="shrink-0" style={{ width: Math.min(radarAlto, t.ancho * 0.3) }}>
                                {t.alto >= 180
                                    ? <SignalsRadar height={Math.min(radarAlto, t.ancho * 0.3)} compact showLegend={false} />
                                    : <AnilloBandas t={t} bandas={bandas} cercanas={cercanas.length} lado={Math.min(radarAlto, t.ancho * 0.3)} />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <MosaicoBandas t={t} bandas={bandas} aplicando={aplicando} onObjetivo={aplicarObjetivo} />
                            </div>
                            {t.ancho > 760 && (
                                <div className="flex w-[30%] min-w-0 shrink-0 flex-col gap-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/55">Transmisiones</span>
                                        <Pastilla acento={t.acento} icono={Send} onClick={() => void emitir()} disabled={emitiendo} tactil={t.tactil} title="Emitir la presencia de esta neurona por la red sináptica">
                                            {emitiendo ? 'Emitiendo…' : 'Emitir presencia'}
                                        </Pastilla>
                                    </div>
                                    <Envios envios={envios} max={filasQueCaben(t.alto - 40, 46, 1, 5)} />
                                </div>
                            )}
                        </div>
                    );
                }
                if (t.base === 'm') {
                    return (
                        <div className="flex h-full min-h-0 items-center gap-3" aria-label={resumen}>
                            <AnilloBandas t={t} bandas={bandas} cercanas={cercanas.length} lado={Math.max(80, Math.min(t.alto, t.ancho * 0.45))} />
                            <ul className="flex min-w-0 flex-1 flex-col gap-1.5" aria-label="Bandas">
                                {bandas.map((b) => {
                                    const m = bandaDe(b.id);
                                    return (
                                        <li key={b.id} className="flex items-center gap-2 text-[12px]" title={b.detail}>
                                            <m.icono className="size-3.5 shrink-0" style={{ color: b.active ? m.color : 'rgba(255,255,255,.35)' }} aria-hidden />
                                            <span className={cn('min-w-0 flex-1 truncate', b.active ? 'text-white' : 'text-white/50')}>{m.corto}</span>
                                            <span className="shrink-0 text-[10.5px] font-semibold" style={{ color: b.active ? m.color : 'rgba(255,255,255,.4)' }}>{b.active ? 'activa' : 'en espera'}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                }
                // l y xl
                const grande = t.base === 'xl';
                const alturaRadar = Math.max(120, Math.min(grande ? 300 : 210, t.alto - (grande ? 20 : 40)));
                return (
                    <div className={cn('grid h-full min-h-0 gap-4', grande ? 'grid-cols-[minmax(0,5fr)_minmax(0,6fr)]' : 'grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]')} aria-label={resumen}>
                        <div className="flex min-h-0 flex-col items-center justify-center gap-1">
                            <SignalsRadar height={alturaRadar} compact showLegend={false} />
                        </div>
                        <div className="flex min-h-0 flex-col gap-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <Segmentos<Vista> etiqueta="Qué ver" acento={t.acento} tactil={t.tactil} valor={vista} onCambio={setVista}
                                    opciones={[
                                        { id: 'bandas', etiqueta: 'Bandas', n: activas },
                                        { id: 'cerca', etiqueta: 'Cerca', n: cercanas.length },
                                        { id: 'actividad', etiqueta: 'Actividad', n: envios.length },
                                    ]} />
                                {vista === 'actividad' && (
                                    <Pastilla acento={t.acento} icono={Send} onClick={() => void emitir()} disabled={emitiendo} tactil={t.tactil} title="Emitir la presencia de esta neurona por la red sináptica">
                                        {emitiendo ? 'Emitiendo…' : 'Emitir presencia'}
                                    </Pastilla>
                                )}
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto pr-0.5 ss-scroll">
                                {vista === 'bandas' && <ListaBandas t={t} bandas={bandas} aplicando={aplicando} onObjetivo={aplicarObjetivo} />}
                                {vista === 'cerca' && <Cercanas t={t} cercanas={cercanas} onBuscar={buscar} buscando={buscando} />}
                                {vista === 'actividad' && <Envios envios={envios} max={12} />}
                            </div>
                        </div>
                    </div>
                );
            }}
        </MarcoSocial>
    );
}

// ── El anillo de bandas (SVG, ligero) ───────────────────────────────

function AnilloBandas({ t, bandas, cercanas, lado }: { t: TamanoSocial; bandas: BandStatus[]; cercanas: number; lado: number }) {
    const id = React.useId().replace(/:/g, '');
    const n = Math.max(1, bandas.length);
    const r = 40, grosor = 7, hueco = 0.12;
    const arcos = bandas.map((b, i) => {
        const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 + hueco / 2;
        const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2 - hueco / 2;
        const p = (a: number) => `${(50 + Math.cos(a) * r).toFixed(2)} ${(50 + Math.sin(a) * r).toFixed(2)}`;
        return { b, d: `M${p(a0)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}` };
    });
    const activas = bandas.filter((b) => b.active).length;
    return (
        <svg width={lado} height={lado} viewBox="0 0 100 100" role="img" aria-label={`${activas} de ${bandas.length} bandas activas y ${cercanas} neuronas cercanas`} className="shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`fondo-${id}`}>
                    <stop offset="0%" stopColor={t.acento} stopOpacity={0.28} />
                    <stop offset="70%" stopColor={t.acento} stopOpacity={0.04} />
                    <stop offset="100%" stopColor={t.acento} stopOpacity={0} />
                </radialGradient>
                <linearGradient id={`haz-${id}`} x1="50%" y1="50%" x2="50%" y2="0%">
                    <stop offset="0%" stopColor={t.acento} stopOpacity={0} />
                    <stop offset="100%" stopColor={t.acento} stopOpacity={0.5} />
                </linearGradient>
            </defs>
            <circle cx={50} cy={50} r={34} fill={`url(#fondo-${id})`} />
            {[14, 24].map((rr) => <circle key={rr} cx={50} cy={50} r={rr} fill="none" stroke="#fff" strokeOpacity={0.08} />)}
            {t.base !== 'micro' && activas > 0 && <path className={estilos.barrido} d="M50 50L50 16A34 34 0 0 1 70 22.5Z" fill={`url(#haz-${id})`} />}
            {arcos.map(({ b, d }) => {
                const m = bandaDe(b.id);
                return (
                    <path key={b.id} d={d} fill="none" strokeLinecap="round" strokeWidth={grosor}
                        stroke={b.active ? m.color : 'rgba(255,255,255,.12)'} style={b.active ? { filter: `drop-shadow(0 0 3px ${m.color})` } : undefined}>
                        <title>{`${b.label}: ${b.active ? 'activa' : 'en espera'}`}</title>
                    </path>
                );
            })}
            <text x={50} y={cercanas > 99 ? 53 : 55} textAnchor="middle" fill="#fff" fontSize={cercanas > 99 ? 16 : 20} fontWeight={300} style={{ fontVariantNumeric: 'tabular-nums' }}>{cercanas}</text>
            {t.base !== 'micro' && <text x={50} y={66} textAnchor="middle" fill="#fff" fillOpacity={0.6} fontSize={6.5} fontWeight={600} letterSpacing={0.6}>CERCA</text>}
        </svg>
    );
}

// ── Bandas ──────────────────────────────────────────────────────────

function ControlLoRa({ t, aplicando, onObjetivo }: { t: TamanoSocial; aplicando: boolean; onObjetivo: (o: 'auto' | 'distancia' | 'velocidad') => void }) {
    return (
        <div className="mt-1.5 flex flex-wrap items-center gap-1" role="group" aria-label="Configuración rápida de la LoRa">
            {([['auto', 'Auto'], ['distancia', 'Más alcance'], ['velocidad', 'Más velocidad']] as const).map(([o, e]) => (
                <Pastilla key={o} acento={bandaDe('lora').color} icono={Gauge} onClick={() => onObjetivo(o)} disabled={aplicando} tactil={t.tactil}>{e}</Pastilla>
            ))}
        </div>
    );
}

function ListaBandas({ t, bandas, aplicando, onObjetivo }: { t: TamanoSocial; bandas: BandStatus[]; aplicando: boolean; onObjetivo: (o: 'auto' | 'distancia' | 'velocidad') => void }) {
    return (
        <ul className="flex flex-col gap-1" aria-label="Bandas y antenas">
            {bandas.map((b) => {
                const m = bandaDe(b.id);
                return (
                    <li key={b.id} className={cn(estilos.fila, 'px-2 py-1.5')} style={b.active ? { background: conAlfa(m.color, 0.07) } : undefined}>
                        <div className="flex items-center gap-2">
                            <m.icono className="size-4 shrink-0" style={{ color: b.active ? m.color : 'rgba(255,255,255,.4)' }} aria-hidden />
                            <span className={cn('min-w-0 flex-1 truncate text-[12.5px] font-semibold', b.active ? 'text-white' : 'text-white/60')}>{b.label}</span>
                            <span className="inline-flex shrink-0 items-center gap-1.5 text-[10.5px] font-semibold" style={{ color: b.active ? m.color : 'rgba(255,255,255,.45)' }}>
                                <Punto color={b.active ? m.color : 'rgba(255,255,255,.3)'} tam={6} />{b.active ? 'activa' : 'en espera'}
                            </span>
                        </div>
                        <p className="mt-0.5 text-[11.5px] leading-snug text-white/60">{b.detail}</p>
                        {b.metrics.length > 0 && (
                            <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                                {b.metrics.map((mm) => (
                                    <div key={mm.key} className="flex gap-1"><dt className="text-white/45">{mm.key}</dt><dd className="font-semibold tabular-nums text-white/85">{mm.value}</dd></div>
                                ))}
                            </dl>
                        )}
                        {b.id === 'lora' && b.active && <ControlLoRa t={t} aplicando={aplicando} onObjetivo={onObjetivo} />}
                    </li>
                );
            })}
        </ul>
    );
}

/** Panorámico: las bandas como un mosaico de antenas (una columna cada una). */
function MosaicoBandas({ t, bandas, aplicando, onObjetivo }: { t: TamanoSocial; bandas: BandStatus[]; aplicando: boolean; onObjetivo: (o: 'auto' | 'distancia' | 'velocidad') => void }) {
    const bajo = t.alto < 160;
    return (
        <ul className="grid h-full min-h-0 gap-2" style={{ gridTemplateColumns: `repeat(${bandas.length}, minmax(0,1fr))` }} aria-label="Bandas y antenas">
            {bandas.map((b) => {
                const m = bandaDe(b.id);
                return (
                    <li key={b.id} className="flex min-w-0 flex-col gap-1 rounded-[16px] p-2" title={b.detail}
                        style={{ background: b.active ? `linear-gradient(180deg, ${conAlfa(m.color, 0.16)}, ${conAlfa(m.color, 0.02)})` : 'rgba(255,255,255,.025)' }}>
                        <span className="flex items-center gap-1.5">
                            <m.icono className="size-4 shrink-0" style={{ color: b.active ? m.color : 'rgba(255,255,255,.4)' }} aria-hidden />
                            <span className={cn('truncate text-[12px] font-semibold', b.active ? 'text-white' : 'text-white/55')}>{m.corto}</span>
                        </span>
                        <span className="text-[10.5px] font-semibold" style={{ color: b.active ? m.color : 'rgba(255,255,255,.45)' }}>{b.active ? 'activa' : 'en espera'}</span>
                        {!bajo && <span className="line-clamp-3 text-[11px] leading-snug text-white/55">{recortar(b.detail, 90)}</span>}
                        {!bajo && b.metrics[0] && <span className="mt-auto truncate text-[10.5px] tabular-nums text-white/70" title={`${b.metrics[0].key}: ${b.metrics[0].value}`}>{b.metrics[0].value}</span>}
                        {!bajo && b.id === 'lora' && b.active && t.alto > 230 && <ControlLoRa t={t} aplicando={aplicando} onObjetivo={onObjetivo} />}
                    </li>
                );
            })}
        </ul>
    );
}

// ── Neuronas cercanas y transmisiones ───────────────────────────────

function Cercanas({ t, cercanas, onBuscar, buscando }: { t: TamanoSocial; cercanas: RelayBeacon[]; onBuscar: () => void; buscando: boolean }) {
    if (cercanas.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-4 text-center" role="status">
                <p className="text-[12.5px] text-white/70">Ningún faro cercano por ahora.</p>
                <p className="max-w-[28ch] text-[11.5px] text-white/50">Las neuronas que comparten presencia aparecen aquí con su región y sus conexiones.</p>
                <Pastilla acento={t.acento} icono={Search} onClick={onBuscar} disabled={buscando} tactil={t.tactil}>Buscar ahora</Pastilla>
            </div>
        );
    }
    return (
        <ul className="flex flex-col gap-1" aria-label="Neuronas cercanas">
            {[...cercanas].sort((a, b) => b.at - a.at).slice(0, 10).map((c) => (
                <li key={c.deviceId} className={cn(estilos.fila, 'flex items-center gap-2 px-2 py-1.5')}>
                    <Punto color={c.own ? '#10b981' : t.acento} latir={Date.now() - c.at < 120_000} />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold text-white">{c.label || 'Neurona sin nombre'}</span>
                        <span className="block truncate text-[11px] text-white/55">
                            {c.own ? 'tuya' : 'de la red'}{c.region ? ` · ${c.region}` : ''}{c.onlineCount ? ` · ${c.onlineCount} en su malla` : ''}{c.offersPublic ? ' · ofrece internet' : ''}
                        </span>
                    </span>
                    <Tiempo ms={c.at} corto className="text-[10.5px]" />
                </li>
            ))}
        </ul>
    );
}

function Envios({ envios, max }: { envios: DeliveryReceipt[]; max: number }) {
    if (!envios.length) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 py-3 text-center" role="status">
                <Route className="size-5 text-white/40" aria-hidden />
                <span className="text-[11.5px] text-white/55">Sin transmisiones aún. Aquí verás por qué nodos o servidores viaja cada envío.</span>
            </div>
        );
    }
    return <ul className="flex flex-col gap-1" aria-label="Transmisiones recientes">{envios.slice(0, max).map((r) => <li key={r.id}><FilaEnvio r={r} /></li>)}</ul>;
}

function FilaEnvio({ r, denso = false }: { r: DeliveryReceipt; denso?: boolean }) {
    const m = ESTADO_ENVIO[r.status];
    return (
        <div className={cn('min-w-0', denso ? 'flex items-center gap-1.5' : cn(estilos.fila, 'px-2 py-1.5'))}>
            <div className="flex min-w-0 items-center gap-1.5">
                <m.icono className="size-3.5 shrink-0" style={{ color: m.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-white" title={r.summary}>{r.summary}</span>
                <span className="shrink-0 text-[10.5px] font-semibold" style={{ color: m.color }}>{m.etiqueta}</span>
            </div>
            {!denso && (
                <div className="mt-1 flex flex-wrap gap-1">
                    {r.hops.filter((h) => h.status !== 'skipped').map((h, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full ss-redondo bg-white/[0.05] px-2 py-0.5 text-[10.5px] text-white/70" title={h.detail}>
                            <Punto tam={5} color={h.status === 'confirmed' ? '#34d399' : h.status === 'sent' ? '#38bdf8' : h.status === 'queued' ? '#fbbf24' : '#f87171'} />
                            {h.label}{h.through ? ` · ${h.through}` : ''}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

export default InternetRadarWidget;
