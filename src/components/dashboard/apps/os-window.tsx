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

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { TargetAndTransition, Transition } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BotonCerrar } from "@/components/ui/boton-cerrar";
import { geometriaVentana } from "@/lib/design/composicion";

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

/* ── Composición centrada por aparato (DSN1019B) ─────────────────────
   La posición inicial sale de `geometriaVentana` (src/lib/design/composicion.ts):
   · escritorio/tableta: ventana centrada — el flex padre ya la da (§7b) y no
     se toca nada del centrado de siempre.
   · teléfono (menos de 430 px, el umbral de composicion.ts): HOJA centrada que
     sube desde abajo, anclada con el left/top que devuelve la geometría, con
     entrada cardinal (24 px de recorrido, curva --ease-glide, fundamentos §5).
   Con `prefers-reduced-motion` la hoja solo funde, sin recorrido. El arrastre
   de siempre no cambia: su transform convive con el anclaje left/top. */
const UMBRAL_TELEFONO = 430;
const RECORRIDO_HOJA_PX = 24;

interface Colocacion {
    esHoja: boolean;
    pocoMovimiento: boolean;
    left?: number;
    top?: number;
}

function leerColocacion(marco?: HTMLElement | null): Colocacion {
    if (typeof window === "undefined") return { esHoja: false, pocoMovimiento: false };
    const viewport = { ancho: window.innerWidth, alto: window.innerHeight };
    const esHoja = viewport.ancho < UMBRAL_TELEFONO;
    const pocoMovimiento =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!esHoja) return { esHoja, pocoMovimiento };
    // El tamaño real lo da `sizeClass` del llamador: se mide el marco ya renderizado
    // y geometriaVentana acota el anclaje al espacio libre de cada aparato.
    const ancho = marco && marco.offsetWidth > 0 ? marco.offsetWidth : undefined;
    const alto = marco && marco.offsetHeight > 0 ? marco.offsetHeight : undefined;
    const geo = geometriaVentana(viewport, { tipo: "hoja", ancho, alto });
    return { esHoja, pocoMovimiento, left: geo.x, top: geo.y };
}

const ENTRA_VENTANA: { initial: TargetAndTransition; animate: TargetAndTransition; transition: Transition } = {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    transition: { type: "spring", stiffness: 260, damping: 26 },
};
const ENTRA_HOJA: { initial: TargetAndTransition; animate: TargetAndTransition; transition: Transition } = {
    initial: { opacity: 0, y: RECORRIDO_HOJA_PX },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] }, // --ease-glide
};
const ENTRA_HOJA_QUIETA: { initial: TargetAndTransition; animate: TargetAndTransition; transition: Transition } = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.2 },
};

export function OSWindow({
    title, subtitle, icon: Icon, accent, onClose, actions, toolbar, children,
    sizeClass = "w-[min(94vw,1100px)] h-[min(86vh,760px)]", bare = true,
}: OSWindowProps) {
    const [offset, setOffset] = useState({ dx: 0, dy: 0 });
    const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

    // Colocación por aparato: se decide en el primer render (el viewport ya se conoce)
    // para que la entrada de Framer nazca con el recorrido correcto, y se mide de nuevo
    // montado el marco y ante cambios de viewport o de movimiento.
    const [colocacion, setColocacion] = useState<Colocacion>(() => leerColocacion());
    const marcoRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const reencuadrar = () => {
            if (dragRef.current) return; // arrastrándose a mitad: no se reencuadra
            setColocacion(leerColocacion(marcoRef.current));
        };
        reencuadrar();
        window.addEventListener("resize", reencuadrar);
        const mq =
            typeof window.matchMedia === "function"
                ? window.matchMedia("(prefers-reduced-motion: reduce)")
                : null;
        mq?.addEventListener("change", reencuadrar);
        return () => {
            window.removeEventListener("resize", reencuadrar);
            mq?.removeEventListener("change", reencuadrar);
        };
    }, []);
    const entrada = colocacion.esHoja
        ? colocacion.pocoMovimiento
            ? ENTRA_HOJA_QUIETA
            : ENTRA_HOJA
        : ENTRA_VENTANA;

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
                el centrado y la ventana SIEMPRE abre centrada. En teléfono la hoja es
                absoluta y el anclaje (left/top) lo pone geometriaVentana. */}
            <div
                className={cn("max-w-full max-h-full", colocacion.esHoja ? "absolute" : "relative")}
                style={{
                    transform: `translate(${offset.dx}px, ${offset.dy}px)`,
                    ...(colocacion.esHoja ? { left: colocacion.left, top: colocacion.top } : {}),
                }}
            >
                <motion.div
                    ref={marcoRef}
                    {...entrada}
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
