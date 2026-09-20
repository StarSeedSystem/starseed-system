"use client";

/**
 * StarSeed OS — Ventana Zenith «Exocortex» (Adenda 71-ter · I3)
 * ----------------------------------------------------------------------------
 * VENTANA ÚNICA. Se retiraron TODOS los botones superiores de la cabecera
 * (Cerebro 3D, Astraura IA, Sentidos IA, Editor, Pantalla, Asistente, Espacios)
 * y el buscador/panel de sentidos MOCK. La ventana es ahora sólo el Exocórtex
 * completo (`AuroraChatSection`), renombrado a «Exocortex». Sus funciones útiles
 * NO se pierden: se reubicaron —
 *   · Sentidos → pestaña interna real del Exocórtex (senses-panel/senses.ts).
 *   · Opciones → menú interno del Exocórtex (chat-header-options, convId real).
 *   · Cerebro  → selector de cerebros del menú interno (selectBrainForContext).
 *   · Editor   → menú de creación IZQUIERDO de Trinity ('starseed:open-editor').
 *   · Pantalla · Espacios · Cerebro 3D → iconos compactos del menú interno.
 *   · Botón flotante / Aurora activa → Ajustes de Aurora / el propio orbe.
 *
 * Móvil/Android: la ventana usa 100dvh + safe-area-inset y max-w/overflow para
 * no desbordar; el scroll interno vive en el cuerpo (el chat gestiona el suyo).
 */

import React, { useEffect, useCallback, useRef, RefObject } from "react";
import {
    motion, AnimatePresence, useReducedMotion, useMotionValue, animate,
    type MotionValue,
} from "framer-motion";
import { usePerimeter } from "@/context/perimeter-context";
import curtain from "@/components/layout/trinity-curtains.module.css";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import { ensureAuroraChatLogRecorder } from "@/lib/aurora/aurora-chat-log";
import { calculateSwipeOutcome, type SwipeDirection } from "@/lib/layout/swipe-utils";
import { Globe, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuroraChatSection } from "@/components/exocortex/aurora-chat-section";
import { ExocortexErrorBoundary } from "@/components/exocortex/exocortex-error-boundary";

// ── Swipe-to-close (centro de control) ──────────────────────────────
// Gesto de arrastre que sigue al dedo y cierra al superar el umbral hacia
// el borde de origen de la cortina. Devuelve el MotionValue del eje activo
// (para enlazarlo al `style` del contenedor) + handlers de pointer.
//   dir = 'up' (Zenith) | 'left' (Horizon) | 'right' (right)
const SWIPE_THRESHOLD_PCT = 0.3; // 30% del alto/anchura para confirmar el cierre
const MIN_VELOCITY_PX_PER_MS = 0.3; // Umbral de velocidad para cierre rápido
type SwipeDir = SwipeDirection;

function useSwipeToClose(dir: SwipeDir, onClose: () => void, containerRef: RefObject<HTMLElement | null>) {
    const reduceMotion = useReducedMotion();
    const signed = useMotionValue(0);
    const axis: "x" | "y" = dir === "up" ? "y" : "x";

    const start = useRef<{ x: number; y: number; time: number } | null>(null);
    const dragging = useRef(false);
    const progress = useRef(0);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        if (e.button !== undefined && e.button !== 0) return;
        start.current = { x: e.clientX, y: e.clientY, time: performance.now() };
        dragging.current = true;
        progress.current = 0;
        try {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } catch {
            /* noop */
        }
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragging.current || !start.current || !containerRef.current) return;

        const containerSize = axis === "y" 
            ? containerRef.current.clientHeight 
            : containerRef.current.clientWidth;

        const currentPos = { x: e.clientX, y: e.clientY, time: performance.now() };
        const outcome = calculateSwipeOutcome({
            direction: dir,
            startPos: start.current,
            currentPos,
            containerSize,
        });

        progress.current = outcome.toward;
        const mag = reduceMotion ? outcome.toward : outcome.toward * (outcome.toward > 120 ? 0.85 : 1);
        
        if (dir === "up" || dir === "left") {
            signed.set(-mag);
        } else {
            signed.set(mag);
        }
    }, [axis, dir, signed, reduceMotion, containerRef]);

    const finish = useCallback((e?: React.PointerEvent) => {
        if (!dragging.current || !start.current || !containerRef.current) return;
        dragging.current = false;

        const containerSize = axis === "y" 
            ? containerRef.current.clientHeight 
            : containerRef.current.clientWidth;

        const currentPos = e 
            ? { x: e.clientX, y: e.clientY, time: performance.now() }
            : { x: start.current.x, y: start.current.y, time: performance.now() };

        const outcome = calculateSwipeOutcome({
            direction: dir,
            startPos: start.current,
            currentPos,
            containerSize,
        });

        start.current = null;

        if (outcome.shouldClose) {
            onClose();
            signed.set(0);
        } else if (reduceMotion) {
            signed.set(0);
        } else {
            animate(signed, 0, { type: "spring", stiffness: 500, damping: 40 });
        }
        progress.current = 0;
    }, [axis, dir, signed, onClose, reduceMotion, containerRef]);

    const cancel = useCallback(() => {
        if (!dragging.current) return;
        dragging.current = false;
        start.current = null;
        progress.current = 0;
        if (reduceMotion) {
            signed.set(0);
        } else {
            animate(signed, 0, { type: "spring", stiffness: 500, damping: 40 });
        }
    }, [signed, reduceMotion]);

    const style: { x?: MotionValue<number>; y?: MotionValue<number> } =
        axis === "y" ? { y: signed } : { x: signed };

    return {
        motionStyle: style,
        handlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp: finish,
            onPointerCancel: cancel,
        },
    };
}

// Botón de cierre cristalino reutilizable (X, área táctil >= 44px).
function CurtainCloseButton({ 
  onClose, 
  accent, 
  style,
  className 
}: { 
  onClose: () => void; 
  accent: string; 
  style?: React.CSSProperties;
  className?: string; 
}) {
    return (
        <button
            type="button"
            aria-label="Cerrar"
            title="Cerrar"
            onClick={onClose}
            className={cn(curtain.closeBtn, curtain.closeTopRight, className)}
            style={{ ...style, ["--cc" as string]: accent }}
        >
            <X className={curtain.closeIcon} />
        </button>
    );
}

export function ZenithCurtain() {
    const { activeEdge, setActiveEdge } = usePerimeter();
    const isActive = activeEdge === 'zenith';
    const closeCurtain = useCallback(() => setActiveEdge(null), [setActiveEdge]);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const swipe = useSwipeToClose("up", closeCurtain, containerRef);

    // Apertura remota: el orbe/widget de Aurora (o cualquier superficie del OS)
    // dispara `starseed:open-aurora-exocortex` → abrimos la cortina Zenith.
    // Además arrancamos aquí el registrador del historial de Aurora
    // (localStorage) porque la cortina vive SIEMPRE montada en el layout raíz:
    // así el "Registro" captura la conversación aunque la cortina esté cerrada.
    useEffect(() => {
        if (typeof window === "undefined") return;
        ensureAuroraChatLogRecorder();
        const onOpenAurora = () => {
            try { setActiveEdge("zenith"); } catch { /* defensivo */ }
        };
        window.addEventListener(AURORA_EXOCORTEX_OPEN_EVENT, onOpenAurora);
        return () => window.removeEventListener(AURORA_EXOCORTEX_OPEN_EVENT, onOpenAurora);
    }, [setActiveEdge]);

    return (
        <AnimatePresence>
            {isActive && (
                <motion.div
                    ref={containerRef}
                    role="region"
                    aria-label="Cortina Zenith Exocortex"
                    data-testid="zenith-curtain-container"
                    initial={{ y: "-100%", x: "-50%", opacity: 0, scale: 0.96 }}
                    animate={{ y: 0, x: "-50%", opacity: 1, scale: 1 }}
                    exit={{ y: "-100%", x: "-50%", opacity: 0, scale: 0.96 }}
                    transition={{ type: "spring", damping: 30, stiffness: 200 }}
                    className={cn(
                        curtain.curtainContainer,
                        "fixed left-1/2 -translate-x-1/2 z-[90] pointer-events-auto rounded-3xl overflow-hidden box-border",
                        "shadow-[0_20px_50px_rgba(6,182,212,0.3)] border border-cyan-500/30 text-cyan-50",
                        // Material StarSeed: aro neón Zenith que respira suave (azul #007FFF)
                        "ss-neon ss-neon--zenith",
                        // Anclado dentro del viewport + safe-area (nunca se sale).
                        // `svh` (small viewport height) mantiene la ventana ESTABLE en
                        // Android: no crece/encoge cuando la barra de URL aparece/
                        // desaparece ni cuando abre el teclado → el chat no salta ni
                        // parpadea. El scroll vive DENTRO (cuerpo overflow-y-auto) y el
                        // teclado sólo ajusta el padding del composer (visualViewport).
                        "top-[max(0.75rem,env(safe-area-inset-top))] w-[min(98vw,1600px)] max-w-[100vw]",
                        "h-[min(92svh,calc(100svh-1.5rem))]"
                    )}
                >
                    {/* Capa de arrastre: sigue al dedo (swipe hacia arriba cierra). */}
                    <motion.div 
                        className="absolute inset-0 touch-pan-x" 
                        style={swipe.motionStyle}
                        data-testid="zenith-curtain-swipe-layer"
                        {...swipe.handlers}
                    >
                        {/* Background — cristal líquido profundo teñido Zenith */}
                        <div className="absolute inset-0 rounded-3xl bg-black/85 backdrop-blur-2xl ss-crystal ss-crystal--deep ss-tone--zenith" />
                        <div className="absolute inset-0 bg-gradient-to-b from-cyan-950/50 via-transparent to-cyan-950/20 pointer-events-none" />

                        {/* Tirador de swipe (Zenith cierra hacia ARRIBA) + botón de cierre */}
                        <div
                            className={curtain.grabberTop}
                            style={{ ["--cc" as string]: "#22d3ee" }}
                            {...swipe.handlers}
                            role="presentation"
                            data-testid="zenith-curtain-grabber"
                        />
                        {/* Botón de cierre posicionado relativo al contenedor con safe area */}
                        <CurtainCloseButton 
                            onClose={closeCurtain} 
                            accent="#22d3ee"
                        />

                        <div className="relative z-10 w-full h-full flex flex-col text-cyan-50">

                            {/* Header — sólo el título de la ventana (deja hueco arriba para el tirador y a la derecha para el botón de cierre). */}
                            <div className="flex items-center gap-3 px-5 pr-16 md:px-8 md:pr-16 pt-8 md:pt-9 pb-3 shrink-0 border-b border-cyan-500/15 bg-black/20 min-w-0">
                                <span className="ss-icon-3d ss-tone--zenith ss-float shrink-0">
                                    <Globe className="w-5 h-5 md:w-6 md:h-6" />
                                </span>
                                <div className="min-w-0">
                                    <h2 className="text-lg md:text-2xl font-light tracking-widest uppercase font-headline truncate">
                                        Exocortex
                                    </h2>
                                    <p className="text-[11px] text-cyan-300/60 font-mono hidden md:block truncate">
                                        Astraura IA
                                    </p>
                                </div>
                            </div>

                            {/* Cuerpo — Exocórtex completo (chat + menú interno). Scroll propio
                                (100dvh + safe-area en el contenedor; el contenido fluye y no se
                                recorta, y el teclado del móvil puede empujar el input a la vista). */}
                            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain custom-scrollbar">
                                <div className="mx-auto w-full max-w-5xl px-3 sm:px-5 md:px-8 lg:px-12 py-4 md:py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                                    {/* Límite de error: una excepción del Exocórtex NO tira la
                                        cortina; ofrece «Reintentar» que re-monta sólo el contenido. */}
                                    <ExocortexErrorBoundary label="ventana Exocortex">
                                        <AuroraChatSection />
                                    </ExocortexErrorBoundary>
                                </div>
                            </div>
                        </div>

                        {/* Light Rays Decoration */}
                        <div className="absolute inset-0 z-0 opacity-30 pointer-events-none mix-blend-screen">
                            <div className="absolute top-0 left-[20%] w-[1px] h-full bg-gradient-to-b from-cyan-400 to-transparent blur-[2px]" />
                            <div className="absolute top-0 right-[20%] w-[1px] h-full bg-gradient-to-b from-cyan-400 to-transparent blur-[2px]" />
                            <div className="absolute top-0 left-1/2 w-[600px] h-full -translate-x-1/2 bg-gradient-to-b from-cyan-500/10 to-transparent blur-[60px]" />
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}