'use client';

// ════════════════════════════════════════════════════════════════
// OSWindow — chrome reutilizable de ventana flotante del OS
// ----------------------------------------------------------------
// Ventana arrastrable por la cabecera, con acento StarSeed, backdrop,
// cierre por Escape, acciones de cabecera y opcional barra inferior.
// La usan AppWindow (launcher) y ContentWindow (abridor universal).
// Render: el llamador la porta a document.body (vía createPortal).
// Escape: con varias apiladas cierra SOLO la de arriba (pila compartida, abajo).
// SOP: architecture/dashboard-launcher-apps-y-archivos.md
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BotonCerrar } from "@/components/ui/boton-cerrar";
import { geometriaVentana } from "@/lib/design/composicion";
import type { GeometriaVentanaReturn, Viewport } from "@/lib/design/composicion";

/* ── Pila de ventanas: Escape cierra SOLO la de arriba (OPF1024H) ──
   Cada OSWindow se apunta al montar y un ÚNICO oyente de `keydown` en `window` elige, en el momento de la
   pulsación, la de arriba: la última en el orden del documento, que es la que se pinta encima (todas son
   `fixed z-[120]`) y la que un anfitrión trae al frente al reordenar su lista. Con un oyente por ventana,
   Escape las cerraba todas a la vez. Si alguien dentro ya atendió el Escape (`preventDefault`, como un
   desplegable o un diálogo de Radix), no se cierra ninguna. */
interface VentanaApilada {
    raiz: React.RefObject<HTMLDivElement | null>;
    cerrar: React.MutableRefObject<() => void>;
}

const pilaVentanas: VentanaApilada[] = [];

function ventanaDeArriba(): VentanaApilada | undefined {
    let arriba: VentanaApilada | undefined;
    for (const v of pilaVentanas) {
        const el = v.raiz.current;
        if (!el || !el.isConnected) continue;
        const actual = arriba?.raiz.current;
        // FOLLOWING también vale para una ventana anidada dentro de otra: la interior queda arriba.
        if (!actual || actual.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) arriba = v;
    }
    return arriba;
}

function alPulsarEscape(e: KeyboardEvent) {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    ventanaDeArriba()?.cerrar.current();
}

function apuntarVentana(v: VentanaApilada): () => void {
    if (pilaVentanas.length === 0) window.addEventListener("keydown", alPulsarEscape);
    pilaVentanas.push(v);
    return () => {
        const i = pilaVentanas.indexOf(v);
        if (i >= 0) pilaVentanas.splice(i, 1);
        if (pilaVentanas.length === 0) window.removeEventListener("keydown", alPulsarEscape);
    };
}

/* ── Posición inicial por geometría centrada (DSN1019B) ──
   En escritorio la ventana sigue abriendo centrada por el flex del padre, como siempre.
   En teléfono (< 430 px, el umbral de composicion.ts) la ventana es una HOJA centrada:
   `geometriaVentana` fija su posición inicial (ancho completo menos márgenes de 16 px,
   anclada abajo) y su entrada es cardinal sur: sube desde el borde inferior.
   El arrastre no cambia: la capa de arrastre añade su translate sobre esa base. */
const UMBRAL_HOJA_TELEFONO = 430;

function viewportActual(): Viewport {
    return { ancho: window.innerWidth, alto: window.innerHeight };
}

function esTelefono(v: Viewport): boolean {
    return v.ancho < UMBRAL_HOJA_TELEFONO;
}

/** Hoja de teléfono: el alto mantiene el espíritu del sizeClass por defecto
    (86 % de la pantalla, tope 760 px); el ancho y la posición los da geometríaVentana. */
function geometriaHojaTelefono(v: Viewport): GeometriaVentanaReturn {
    return geometriaVentana(v, { tipo: "hoja", alto: Math.min(v.alto * 0.86, 760) });
}

function movimientoReducido(): boolean {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export interface OSWindowProps {
    title: string;
    subtitle?: string;
    icon: LucideIcon;
    accent: string;
    onClose: () => void;
    /** Botones extra de cabecera (a la izquierda del cierre). */
    actions?: React.ReactNode;
    /** Barra inferior opcional (acciones universales del contenido). */
    toolbar?: React.ReactNode;
    children: React.ReactNode;
    /** Anchura/altura del marco (clases Tailwind). */
    sizeClass?: string;
    /** El cuerpo no recibe padding (visores a sangre). Default: true. */
    bare?: boolean;
}

export function OSWindow({
    title, subtitle, icon: Icon, accent, onClose, actions, toolbar, children,
    sizeClass = "w-[min(94vw,1100px)] h-[min(86vh,760px)]", bare = true,
}: OSWindowProps) {
    const [offset, setOffset] = useState({ dx: 0, dy: 0 });
    const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
    const [hojaTelefono, setHojaTelefono] = useState(false);
    const [reduceMovimiento, setReduceMovimiento] = useState(false);
    const [geoHoja, setGeoHoja] = useState<GeometriaVentanaReturn | null>(null);

    useLayoutEffect(() => {
        // Se resuelve con useLayoutEffect para fijar la hoja ANTES del primer
        // pintado: sin destello de la ventana de escritorio en el teléfono.
        const resolver = () => {
            const vp = viewportActual();
            const telefono = esTelefono(vp);
            setHojaTelefono(telefono);
            setReduceMovimiento(movimientoReducido());
            setGeoHoja(telefono ? geometriaHojaTelefono(vp) : null);
        };
        resolver();
        window.addEventListener("resize", resolver);
        return () => window.removeEventListener("resize", resolver);
    }, []);

    const raizRef = useRef<HTMLDivElement>(null);
    const cerrarRef = useRef(onClose);
    useEffect(() => { cerrarRef.current = onClose; }, [onClose]);
    useEffect(() => apuntarVentana({ raiz: raizRef, cerrar: cerrarRef }), []);

    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const d = dragRef.current;
            if (!d) return;
            setOffset({ dx: d.ox + (e.clientX - d.x), dy: d.oy + (e.clientY - d.y) });
        };
        const onUp = () => { dragRef.current = null; };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
    }, []);

    const startDrag = (e: React.PointerEvent) => {
        // Los botones de la cabecera (la X, acciones) no arrastran la ventana.
        if ((e.target as Element).closest("button, a, input, [data-sin-arrastre]")) return;
        dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.dx, oy: offset.dy };
    };

    return (
        <div ref={raizRef} className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

            {/* Capa de arrastre centrada por el flex padre. El transform de arrastre va
                aquí (div plano), NO en el hijo animado → la animación de Framer ya no pisa
                el centrado y la ventana SIEMPRE abre centrada. */}
            <div
                data-hoja={hojaTelefono ? "true" : undefined}
                className="relative max-w-full max-h-full"
                style={
                    hojaTelefono && geoHoja
                        ? {
                              position: "absolute",
                              left: geoHoja.x,
                              top: geoHoja.y,
                              width: geoHoja.ancho,
                              height: geoHoja.alto,
                              transform: `translate(${offset.dx}px, ${offset.dy}px)`,
                          }
                        : { transform: `translate(${offset.dx}px, ${offset.dy}px)` }
                }
            >
                <motion.div
                    initial={hojaTelefono
                        ? (reduceMovimiento ? { opacity: 0 } : { opacity: 0, y: "100%" })
                        : { opacity: 0, scale: 0.96 }}
                    animate={hojaTelefono
                        ? (reduceMovimiento ? { opacity: 1 } : { opacity: 1, y: 0 })
                        : { opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 26 }}
                    className={cn(
                        "flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 backdrop-blur-2xl shadow-2xl",
                        sizeClass,
                    )}
                >
                <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] z-20 opacity-80"
                    style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

                <header
                    onPointerDown={startDrag}
                    className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-border/40 cursor-grab active:cursor-grabbing select-none"
                >
                    <span className="grid place-items-center size-8 rounded-xl border border-white/15 shadow"
                        style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 40%, transparent))` }}>
                        <Icon className="size-4 text-white drop-shadow" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-black tracking-tight truncate leading-tight">{title}</h3>
                        {subtitle && (
                            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 truncate font-semibold">
                                {subtitle}
                            </p>
                        )}
                    </div>
                    {actions}
                    {/* X común del OS: disco de cristal con el acento de la ventana y
                        área táctil de 44 px; el arrastre de la cabecera no la toca. */}
                    <BotonCerrar etiqueta="Cerrar ventana" acento={accent} atajo="Esc" tamano="sm" onClick={onClose} />
                </header>

                <div className={cn("relative flex-1 min-h-0 bg-black/20", !bare && "overflow-auto p-4")}>
                    {children}
                </div>

                {toolbar && (
                    <footer className="shrink-0 flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-border/40 bg-card/60">
                        {toolbar}
                    </footer>
                )}
                </motion.div>
            </div>
        </div>
    );
}
