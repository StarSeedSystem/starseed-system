'use client';

// ════════════════════════════════════════════════════════════════
// ImmersiveWidget — la puerta a lo inmersivo (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// Un portal (anillos que giran con los mundos en órbita) que abre el Espacio Inmersivo,
// y los cuatro sitios 3D/XR REALES del OS con su ruta: Espacio Inmersivo, Salas XR,
// Escenas 3D y el Mundo de los avatares (del catálogo de apps).
// Honesto con el dispositivo: pregunta al navegador (WebXR) si hay VR o AR — sin
// montar ningún motor 3D — y lo dice; sin visor, todo se abre en 3D en pantalla.
// Composición: micro = el portal · s = portal + qué soporta este dispositivo · m = +
// entrar · l = + los portales con su descripción · xl = portales en dos columnas ·
// panorámico = portal + portales en fila · torre = columna.
// Estados: cargando (comprobando WebXR), vacío (sin visor: se dice y se abre en
// pantalla), error (el navegador no responde a la consulta: se trata como sin visor).
// ════════════════════════════════════════════════════════════════

import Link from 'next/link';
import { useEffect, useId, useMemo, useState } from 'react';
import { Orbit, Headset, ScanEye, Monitor, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { getApp } from '../apps/app-catalog';
import type { StarseedApp } from '../apps/launcher-types';
import { useLienzoE, px, type LienzoE } from './paquete-e/lienzo';
import { EncabezadoE, EnlaceE, RaizE, SelloE, estilosE } from './paquete-e/piezas';

const PORTALES = ['immersive', 'sala-xr', 'escena', 'mundo-avatares'] as const;
type SoporteXR = { comprobando: boolean; vr: boolean; ar: boolean };

function useSoporteXR(): SoporteXR {
    const [s, setS] = useState<SoporteXR>({ comprobando: true, vr: false, ar: false });
    useEffect(() => {
        let vivo = true;
        const xr = typeof navigator !== 'undefined' ? (navigator as Navigator & { xr?: { isSessionSupported?: (m: string) => Promise<boolean> } }).xr : undefined;
        if (!xr?.isSessionSupported) { setS({ comprobando: false, vr: false, ar: false }); return; }
        Promise.allSettled([xr.isSessionSupported('immersive-vr'), xr.isSessionSupported('immersive-ar')]).then(([vr, ar]) => {
            if (vivo) setS({ comprobando: false, vr: vr.status === 'fulfilled' && vr.value === true, ar: ar.status === 'fulfilled' && ar.value === true });
        });
        return () => { vivo = false; };
    }, []);
    return s;
}

/** El portal: dos anillos en contragiro y los mundos (sus colores) en órbita. */
function Portal({ lado, apps, lienzo }: { lado: number; apps: StarseedApp[]; lienzo: LienzoE }) {
    const r = lado / 2;
    const gid = useId().replace(/:/g, '');
    return (
        <svg width={lado} height={lado} viewBox={`${-r} ${-r} ${lado} ${lado}`} aria-hidden className="overflow-visible">
            <defs>
                <radialGradient id={`pt-${gid}`}>
                    <stop offset="0%" stopColor="#ffffff" stopOpacity={0.9} />
                    <stop offset="25%" stopColor={lienzo.acento} stopOpacity={0.7} />
                    <stop offset="70%" stopColor={lienzo.acento2} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={lienzo.acento2} stopOpacity={0} />
                </radialGradient>
            </defs>
            <circle r={r * 0.62} fill={`url(#pt-${gid})`} className={lienzo.animar ? 'ss-respirar' : undefined} style={{ transformBox: 'fill-box', transformOrigin: 'center', ['--ss-dur' as string]: '7s' } as React.CSSProperties} />
            <g className={lienzo.animar ? 'ss-girar' : undefined} style={{ ['--ss-dur' as string]: '30s', transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties}>
                <circle r={r * 0.82} fill="none" stroke={conAlfa(lienzo.acento, 0.5)} strokeWidth={1.4} strokeDasharray={`${r * 0.3} ${r * 0.12}`} />
                {apps.map((a, i) => {
                    const ang = (i / apps.length) * Math.PI * 2;
                    return <circle key={a.id} cx={Math.cos(ang) * r * 0.82} cy={Math.sin(ang) * r * 0.82} r={Math.max(3, r * 0.08)} fill={a.accent} style={{ filter: `drop-shadow(0 0 5px ${a.accent})` }} />;
                })}
            </g>
            <g className={lienzo.animar ? 'ss-contragirar' : undefined} style={{ ['--ss-dur' as string]: '46s', transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties}>
                <ellipse rx={r * 0.96} ry={r * 0.36} fill="none" stroke={conAlfa(lienzo.acento2, 0.45)} strokeWidth={1} />
                <ellipse rx={r * 0.36} ry={r * 0.96} fill="none" stroke={conAlfa(lienzo.acento, 0.3)} strokeWidth={1} />
            </g>
        </svg>
    );
}

export function ImmersiveWidget() {
    const { ref, lienzo } = useLienzoE({ acento: '#a855f7' });
    const xr = useSoporteXR();
    const portales = useMemo(() => PORTALES.map(getApp).filter((a): a is StarseedApp => !!a), []);
    const { base, clase, horizontal } = lienzo;
    const textoXR = xr.comprobando ? 'Comprobando tu visor…' : xr.vr && xr.ar ? 'VR y AR disponibles aquí' : xr.vr ? 'VR disponible aquí' : xr.ar ? 'AR disponible aquí' : 'Sin visor XR: se abre en 3D en pantalla';
    const raiz = { lienzo, refRaiz: ref, etiqueta: `Espacio inmersivo: ${textoXR}`, tipo: 'IMMERSIVE' } as const;

    const portal = (lado: number) => (
        <Link href="/immersive" aria-label="Entrar al espacio inmersivo" title="Entrar al espacio inmersivo" className="ss-redondo shrink-0 cursor-pointer rounded-full outline-none transition-transform duration-200 hover:scale-105 focus-visible:ring-2" style={{ ['--tw-ring-color' as string]: lienzo.acento } as React.CSSProperties}>
            <Portal lado={lado} apps={portales} lienzo={lienzo} />
        </Link>
    );
    const chipsXR = (
        <div role="status" className="flex flex-wrap items-center justify-center gap-1.5">
            {xr.comprobando ? <SelloE color="#94a3b8">comprobando</SelloE> : <>
                {xr.vr && <SelloE color="#a855f7"><Headset aria-hidden className="size-3" /> VR</SelloE>}
                {xr.ar && <SelloE color="#22d3ee"><ScanEye aria-hidden className="size-3" /> AR</SelloE>}
                {!xr.vr && !xr.ar && <SelloE color="#94a3b8"><Monitor aria-hidden className="size-3" /> en pantalla</SelloE>}
            </>}
        </div>
    );
    const lista = (dos = false) => (
        <ul className={cn('grid min-h-0 gap-1', dos ? 'grid-cols-2' : 'grid-cols-1', estilosE.desliza)} aria-label="Lugares inmersivos">
            {portales.map((a) => {
                const Ic = a.icon;
                return (
                    <li key={a.id}>
                        <Link href={a.open.route ?? '/immersive'} className="group flex min-h-11 cursor-pointer items-center gap-2.5 rounded-2xl px-2 py-1.5 outline-none transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.08]">
                            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full" style={{ background: conAlfa(a.accent, 0.2), boxShadow: `0 0 12px -2px ${conAlfa(a.accent, 0.7)}` }}><Ic className="size-4" style={{ color: a.accent }} /></span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold text-white/90" style={{ fontSize: px(lienzo, 13) }}>{a.name}</span>
                                <span className="line-clamp-1 text-[11px] text-white/50">{a.description}</span>
                            </span>
                            <ArrowUpRight aria-hidden className="size-4 shrink-0 text-white/30 group-hover:text-white/80" />
                        </Link>
                    </li>
                );
            })}
        </ul>
    );

    if (base === 'micro') return <RaizE {...raiz}><div className="m-auto">{portal(Math.max(48, Math.min(lienzo.ancho || 80, lienzo.alto || 80) * 0.88))}</div></RaizE>;
    if (base === 's') return <RaizE {...raiz}><div className="flex h-full flex-col items-center justify-center gap-1.5">{portal(Math.max(64, Math.min(96, (lienzo.alto || 150) * 0.6)))}{chipsXR}</div></RaizE>;

    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 items-center gap-3 px-1">
                    {portal(Math.max(56, Math.min(100, (lienzo.alto || 110) - 12)))}
                    <div className="flex w-40 shrink-0 flex-col gap-1.5"><p className="text-[12px] text-white/70">{textoXR}</p><EnlaceE lienzo={lienzo} href="/immersive" variante="primario" compacto>Entrar</EnlaceE></div>
                    <div className="min-w-0 flex-1">{lista(true)}</div>
                </div>
            </RaizE>
        );
    }

    const grande = base === 'l' || base === 'xl' || clase === 'torre';
    return (
        <RaizE {...raiz}>
            <div className="flex h-full min-h-0 flex-col items-center gap-2 p-1">
                {grande && <EncabezadoE lienzo={lienzo} icono={Orbit} titulo="Espacio inmersivo" detalle={textoXR} className="w-full" />}
                {portal(base === 'xl' ? 150 : grande ? 116 : Math.max(76, Math.min(120, (lienzo.alto || 240) * 0.46)))}
                {!grande && <p className="text-center text-[12px] text-white/65">{textoXR}</p>}
                {chipsXR}
                <EnlaceE lienzo={lienzo} href="/immersive" variante="primario">Entrar al espacio</EnlaceE>
                {grande && <div className="min-h-0 w-full flex-1">{lista(base === 'xl')}</div>}
            </div>
        </RaizE>
    );
}

export default ImmersiveWidget;
