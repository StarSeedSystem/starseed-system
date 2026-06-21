'use client';

// ════════════════════════════════════════════════════════════════
// ImmersiveWidget — preview/CTA del Espacio Inmersivo VR/AR (WebXR)
// ----------------------------------------------------------------
// Tarjeta del dashboard que invita a entrar al espacio inmersivo del OS
// (/immersive): muestra los portales de apps disponibles, el estado de
// soporte VR/AR del dispositivo (feature-detect ligero, SIN montar WebGL)
// y un CTA principal. Adaptativo (WidgetShell) + estética cristal con
// acento violeta/cian (Ciberdelia).
//
// No carga Three.js: solo comprueba `navigator.xr.isSessionSupported` para
// pintar el estado. El render 3D vive en la ruta /immersive.
// ════════════════════════════════════════════════════════════════

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Orbit, Headset, ScanEye, ArrowRight, Sparkle } from 'lucide-react';
import { WidgetShell, Chip } from '../kit';
import { getApp } from '../apps/app-catalog';
import type { StarseedApp } from '../apps/launcher-types';

const ACCENT = '#A855F7';

// Mismos portales que la escena inmersiva (apps clave + vrCapable).
const PORTAL_IDS = ['audiomorphic', 'omnifrecuencias', 'nexus', 'cafe'] as const;

type XRSupport = { vr: boolean | null; ar: boolean | null };

/** Feature-detect ligero de WebXR (sin renderer). */
function useXRSupport(): XRSupport {
    const [support, setSupport] = useState<XRSupport>({ vr: null, ar: null });
    useEffect(() => {
        let cancelled = false;
        const xr = typeof navigator !== 'undefined' ? navigator.xr : undefined;
        if (!xr || typeof xr.isSessionSupported !== 'function') {
            setSupport({ vr: false, ar: false });
            return;
        }
        Promise.allSettled([
            xr.isSessionSupported('immersive-vr'),
            xr.isSessionSupported('immersive-ar'),
        ]).then(([vr, ar]) => {
            if (cancelled) return;
            setSupport({
                vr: vr.status === 'fulfilled' ? vr.value : false,
                ar: ar.status === 'fulfilled' ? ar.value : false,
            });
        });
        return () => { cancelled = true; };
    }, []);
    return support;
}

export function ImmersiveWidget() {
    const support = useXRSupport();
    const portals = useMemo<StarseedApp[]>(
        () => PORTAL_IDS.map(getApp).filter((a): a is StarseedApp => Boolean(a)),
        []
    );

    const checking = support.vr === null || support.ar === null;
    const xrReady = support.vr === true || support.ar === true;

    return (
        <WidgetShell
            title="Espacio Inmersivo"
            subtitle="VR / AR · WebXR"
            icon={Orbit}
            accent={ACCENT}
            designMode="original"
            expandHref="/immersive"
            connections={[
                { label: 'Audiomorphic', href: '/immersive', color: '#A855F7' },
                { label: 'Omnifrecuencias', href: '/omnifrecuencias', color: '#22D3EE' },
                { label: 'Nexus', href: '/nexus', color: '#39FF14' },
            ]}
        >
            {(size) => {
                const micro = size.tier === 'micro' || size.vTier === 'micro';
                return (
                    <div className="flex h-full flex-col gap-2.5 pt-1">
                        {/* CTA principal */}
                        <Link
                            href="/immersive"
                            className="group relative shrink-0 overflow-hidden rounded-2xl border border-white/10 px-3 py-3 transition-transform hover:-translate-y-px cursor-pointer"
                            style={{
                                background:
                                    'linear-gradient(135deg, color-mix(in srgb, #A855F7 24%, transparent), color-mix(in srgb, #22D3EE 18%, transparent))',
                            }}
                        >
                            <div className="flex items-center gap-2.5">
                                <span
                                    className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/20"
                                    style={{ background: 'linear-gradient(135deg, #A855F7, #6366F1)' }}
                                >
                                    <Sparkle className="size-4 text-white" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-black leading-tight">Entrar al espacio inmersivo</p>
                                    <p className="truncate text-[11px] text-white/60">Geometría sagrada · portales de apps</p>
                                </div>
                                <ArrowRight className="size-4 shrink-0 text-white/70 transition-transform group-hover:translate-x-0.5" />
                            </div>
                        </Link>

                        {/* Estado de soporte VR/AR */}
                        {!micro && (
                            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60">
                                    Dispositivo
                                </span>
                                {checking ? (
                                    <Chip color="#64748b">Comprobando…</Chip>
                                ) : xrReady ? (
                                    <>
                                        {support.vr && (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-[10px] font-bold text-violet-300">
                                                <Headset className="size-3" /> VR
                                            </span>
                                        )}
                                        {support.ar && (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                                                <ScanEye className="size-3" /> AR
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    <Chip color="#94a3b8">VR/AR no disponible aquí</Chip>
                                )}
                            </div>
                        )}

                        {/* Lista de portales */}
                        {!micro && (
                            <div className="min-h-0 flex-1">
                                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40">
                                    Portales
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {portals.slice(0, size.vTier === 'expanded' ? 4 : 2).map((app) => (
                                        <Link
                                            key={app.id}
                                            href="/immersive"
                                            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-1.5 transition-colors hover:border-white/25 cursor-pointer"
                                            title={`Abrir ${app.name} en el espacio inmersivo`}
                                        >
                                            <span
                                                className="size-2 shrink-0 rounded-full"
                                                style={{ background: app.accent, boxShadow: `0 0 8px ${app.accent}` }}
                                            />
                                            <span className="truncate text-[11px] font-semibold">{app.short ?? app.name}</span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}

export default ImmersiveWidget;
