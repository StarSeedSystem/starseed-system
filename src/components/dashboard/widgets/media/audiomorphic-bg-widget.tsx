'use client';

// ════════════════════════════════════════════════════════════════
// AudiomorphicBgWidget — la capa Audiomorphic del fondo (Ola 0929 · paquete E, medios)
// ----------------------------------------------------------------
// Audiomorphic es una CAPA del fondo (config.background.layers), no el fondo: se
// enciende y se apaga sin tocar nunca el fondo base de la persona (Adenda 68 · D).
// Qué hace: encender/apagar la visualización con un interruptor, ajustar cuánto se
// ve (opacidad de la capa), abrir su configuración (modos, micrófono, cámara) y
// abrir la app nativa. La flor de la vida de la portada gira solo con la capa
// encendida, movimiento permitido y el widget a la vista.
// Composición: micro = la flor, que es el interruptor · s = flor + estado · m = flor
// + interruptor + opacidad · l/xl = + configurar, abrir la app y la nota ·
// panorámico = fila · torre = columna.
// ════════════════════════════════════════════════════════════════

import React from 'react';
import Link from 'next/link';
import { AudioWaveform, Settings2, ExternalLink } from 'lucide-react';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { useAppearance } from '@/context/appearance-context';
import { audiomorphicLayer, normalizeLayers, patchLayer, setAudiomorphicEnabled } from '@/lib/appearance/background-layers';
import { useLienzoE, px, type LienzoE } from '../paquete-e/lienzo';
import { BotonE, EncabezadoE, RaizE, RangoE, tintaE } from '../paquete-e/piezas';

const RUTA = '/audiomorphic';

/** Flor de la vida: siete círculos y su anillo, con el acento de la familia. */
function Flor({ lado, activa, lienzo }: { lado: number; activa: boolean; lienzo: LienzoE }) {
    const r = lado / 2;
    const k = r * 0.3;
    const centros = [[0, 0], ...Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3) * k, Math.sin((i * Math.PI) / 3) * k])];
    const gid = React.useId().replace(/:/g, '');
    return (
        <svg width={lado} height={lado} viewBox={`${-r} ${-r} ${lado} ${lado}`} aria-hidden className="shrink-0 overflow-visible" style={{ filter: activa ? `drop-shadow(0 0 14px ${conAlfa(lienzo.acento, 0.6)})` : undefined }}>
            <defs>
                <radialGradient id={`fl-${gid}`}>
                    <stop offset="0%" stopColor={lienzo.acento} stopOpacity={activa ? 0.45 : 0.15} />
                    <stop offset="100%" stopColor={lienzo.acento2} stopOpacity={0} />
                </radialGradient>
            </defs>
            <circle r={r * 0.98} fill={`url(#fl-${gid})`} />
            <g className={activa && lienzo.animar ? 'ss-girar' : undefined} style={{ ['--ss-dur' as string]: '48s', transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties}>
                <circle r={r * 0.9} fill="none" stroke={activa ? '#d4af37' : 'rgba(255,255,255,.3)'} strokeOpacity={0.7} strokeWidth={1.2} />
                {centros.map(([x, y], i) => (
                    <circle key={i} cx={x} cy={y} r={k} fill="none" stroke={activa ? lienzo.acento : 'rgba(255,255,255,.45)'} strokeOpacity={activa ? 0.9 : 0.6} strokeWidth={1.2} />
                ))}
                {Array.from({ length: 6 }, (_, i) => {
                    const a = (i * Math.PI) / 3 + Math.PI / 6;
                    return <circle key={`p${i}`} cx={Math.cos(a) * k * 1.73} cy={Math.sin(a) * k * 1.73} r={Math.max(1.2, lado * 0.012)} fill={activa ? '#fff' : 'rgba(255,255,255,.4)'} />;
                })}
            </g>
        </svg>
    );
}

function Interruptor({ activo, onCambio, acento, etiqueta }: { activo: boolean; onCambio: () => void; acento: string; etiqueta: string }) {
    return (
        <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} onClick={onCambio}
            className="ss-redondo relative h-7 w-12 shrink-0 cursor-pointer rounded-full outline-none transition-colors duration-200 focus-visible:ring-2"
            style={{ background: activo ? conAlfa(acento, 0.65) : 'rgba(255,255,255,.14)', ['--tw-ring-color' as string]: acento } as React.CSSProperties}>
            <span aria-hidden className="absolute top-1 size-5 rounded-full bg-white shadow transition-transform duration-200" style={{ transform: `translateX(${activo ? 24 : 4}px)` }} />
        </button>
    );
}

export function AudiomorphicBgWidget() {
    const { ref, lienzo } = useLienzoE();
    const { config, updateConfig } = useAppearance();
    const capas = normalizeLayers(config.background?.layers);
    const capa = audiomorphicLayer(capas);
    const activa = !!capa;
    const opacidad = capa?.opacity ?? 0.9;

    const alternar = () => updateConfig({ background: { layers: setAudiomorphicEnabled(capas, !activa) } } as never);
    const cambiarOpacidad = (v: number) => { if (capa) updateConfig({ background: { layers: patchLayer(capas, capa.id, { opacity: v }) } } as never); };
    const configurar = () => { try { window.dispatchEvent(new CustomEvent('starseed:open-audiomorphic-config')); } catch { /* sin eventos */ } };

    const { base, clase, horizontal } = lienzo;
    const raiz = { lienzo, refRaiz: ref, etiqueta: `Audiomorphic en el fondo: ${activa ? 'encendido' : 'apagado'}`, tipo: 'AUDIOMORPHIC_BG' } as const;
    const estado = (
        <div className="min-w-0" aria-live="polite">
            <p className="truncate font-semibold text-white" style={{ fontSize: px(lienzo, 14) }}>{activa ? 'Visualización encendida' : 'Visualización apagada'}</p>
            <p className="truncate text-white/55" style={{ fontSize: px(lienzo, 12) }}>{activa ? `Capa del fondo al ${Math.round(opacidad * 100)} %` : 'Añádela como capa del fondo'}</p>
        </div>
    );
    const interruptor = <Interruptor activo={activa} onCambio={alternar} acento={lienzo.acento} etiqueta="Visualización Audiomorphic en el fondo" />;
    const opacidadEl = activa ? (
        <label className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[11px] text-white/55">Opacidad</span>
            <RangoE lienzo={lienzo} valor={opacidad} onCambio={cambiarOpacidad} etiqueta="Opacidad de la capa Audiomorphic" textoValor={`${Math.round(opacidad * 100)} por ciento`} />
            <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/60">{Math.round(opacidad * 100)} %</span>
        </label>
    ) : null;
    const acciones = (
        <div className="flex flex-wrap items-center gap-1.5">
            <BotonE lienzo={lienzo} variante="suave" compacto icono={Settings2} onClick={configurar}>Configurar</BotonE>
            <Link href={RUTA} className="ss-redondo inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold text-white/85 transition-colors hover:bg-white/10">
                <ExternalLink aria-hidden className="size-3.5" /> Abrir la app
            </Link>
        </div>
    );

    if (base === 'micro') {
        const lado = Math.max(48, Math.min(lienzo.ancho || 80, lienzo.alto || 80) * 0.84);
        return (
            <RaizE {...raiz}>
                <button type="button" role="switch" aria-checked={activa} aria-label="Visualización Audiomorphic en el fondo" onClick={alternar}
                    className="ss-redondo m-auto cursor-pointer rounded-full outline-none focus-visible:ring-2" style={{ ['--tw-ring-color' as string]: lienzo.acento } as React.CSSProperties}>
                    <Flor lado={lado} activa={activa} lienzo={lienzo} />
                </button>
            </RaizE>
        );
    }

    if (base === 's') {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    <Flor lado={Math.max(56, Math.min(90, (lienzo.alto || 150) * 0.5))} activa={activa} lienzo={lienzo} />
                    {interruptor}
                </div>
            </RaizE>
        );
    }

    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 items-center gap-3 px-1">
                    <Flor lado={Math.max(48, Math.min(96, (lienzo.alto || 110) - 12))} activa={activa} lienzo={lienzo} />
                    <div className="min-w-0 flex-1">{estado}</div>
                    {(lienzo.ancho || 0) > 560 && <div className="w-44 shrink-0">{opacidadEl}</div>}
                    {interruptor}
                </div>
            </RaizE>
        );
    }

    const grande = base === 'l' || base === 'xl' || clase === 'torre';
    return (
        <RaizE {...raiz}>
            <div className="flex h-full min-h-0 flex-col gap-2.5 p-1">
                {grande && <EncabezadoE lienzo={lienzo} icono={AudioWaveform} titulo="Audiomorphic" vivo={activa} detalle="Fondo del sistema" />}
                <div className={grande && clase !== 'torre' ? 'flex min-w-0 items-center gap-4' : 'flex min-w-0 items-center gap-3'}>
                    <Flor lado={base === 'xl' ? 150 : grande ? 112 : Math.max(64, Math.min(96, (lienzo.alto || 240) * 0.36))} activa={activa} lienzo={lienzo} />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">{estado}<div className="flex items-center gap-2">{interruptor}<span className="text-[12px] text-white/60">{activa ? 'Encendida' : 'Apagada'}</span></div></div>
                </div>
                {opacidadEl}
                {grande ? acciones : <div className="mt-auto">{acciones}</div>}
                {grande && <p className="mt-auto text-[11px] leading-snug text-white/50" style={{ color: conAlfa(tintaE(lienzo.acento), 0.75) }}>Es una capa encima de tu fondo: apagarla no cambia el fondo que elegiste. Responde al micrófono solo si tú lo activas en su configuración.</p>}
            </div>
        </RaizE>
    );
}
