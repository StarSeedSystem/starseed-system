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
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BotonCerrar } from "@/components/ui/boton-cerrar";
import { geometriaVentana, type GeometriaVentanaReturn } from "@/lib/design/composicion";

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

const useLayoutEffectSeguro = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function OSWindow({
    title, subtitle, icon: Icon, accent, onClose, actions, toolbar, children,
    sizeClass = "w-[min(94vw,1100px)] h-[min(86vh,760px)]", bare = true,
}: OSWindowProps) {
    const [offset, setOffset] = useState({ dx: 0, dy: 0 });
    const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

    // ── Posición inicial con geometriaVentana (DSN1019B) ──
    // Escritorio: ventana centrada en la pantalla. Teléfono (<430 px): hoja centrada
    // que sube desde abajo (entrada cardinal sur). El arrastre sigue intacto: vive
    // en el transform del marco exterior, la geometría solo fija left/top.
    const contenidoRef = useRef<HTMLDivElement>(null);
    const [geo, setGeo] = useState<GeometriaVentanaReturn | null>(null);
    const movReducido = useReducedMotion() ?? false;
    // En el primer render aún no hay medidas: se decide el tipo por el viewport real,
    // de modo que la ENTRADA (hoja desde abajo o centrado) ya es la correcta al montar.
    const anchoViewportInicio = typeof window === "undefined" ? 1280 : window.innerWidth;
    const hojaSur = anchoViewportInicio < 430;
    useLayoutEffectSeguro(() => {
        const medir = () => {
            const el = contenidoRef.current;
            if (!el) return;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            setGeo(geometriaVentana({ ancho: vw, alto: vh }, {
                tipo: vw < 430 ? "hoja" : "ventana",
                ancho: el.offsetWidth,
                alto: el.offsetHeight,
            }));
        };
        medir();
        window.addEventListener("resize", medir);
        return () => window.removeEventListener("resize", medir);
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

    const entrada = movReducido
        ? { opacity: 0 }
        : hojaSur
            ? { opacity: 0, y: "100%" }
            : { opacity: 0, scale: 0.96 };
    const estable = movReducido
        ? { opacity: 1 }
        : hojaSur
            ? { opacity: 1, y: 0 }
            : { opacity: 1, scale: 1 };

    return (
        <div ref={raizRef} className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label={title}>
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

            {/* Posición inicial dada por geometriaVentana (no por el flex): centrada
                en escritorio; en teléfono, hoja apoyada en el borde inferior. El
                transform de arrastre se suma a esa posición sin pisarla. Antes de
                medir (solo el primer fotograma, resuelto en useLayoutEffect) y en
                SSR queda en su sitio con left/top nulos → top-left invisibilizado
                por la animación; nunca se deja al usuario en otra posición. */}
            <div
                className="absolute max-w-full max-h-full"
                style={{
                    left: geo ? Math.max(geo.x, 0) : hojaSur ? undefined : "50%",
                    top: geo ? Math.max(geo.y, 0) : hojaSur ? undefined : "50%",
                    translate: geo || hojaSur ? undefined : "-50% -50%",
                    transform: `translate(${offset.dx}px, ${offset.dy}px)`,
                }}
            >
                <motion.div
                    ref={contenidoRef}
                    initial={entrada}
                    animate={estable}
                    transition={movReducido ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 26 }}
                    className={cn(
                        "flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 backdrop-blur-2xl shadow-2xl",
                        sizeClass,
                    )}
                    style={hojaSur ? { borderRadius: "1rem 1rem 0 0" } : undefined}
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
