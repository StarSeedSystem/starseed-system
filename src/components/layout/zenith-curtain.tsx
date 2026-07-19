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

import React, { useEffect, useCallback, useRef } from "react";
import {
    motion, AnimatePresence, useReducedMotion, useMotionValue, animate,
    type MotionValue,
} from "framer-motion";
import { usePerimeter } from "@/context/perimeter-context";
import curtain from "@/components/layout/trinity-curtains.module.css";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import { ensureAuroraChatLogRecorder } from "@/lib/aurora/aurora-chat-log";
import { Globe, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuroraChatSection } from "@/components/exocortex/aurora-chat-section";

// ── Swipe-to-close (centro de control) ──────────────────────────────
// Gesto de arrastre que sigue al dedo y cierra al superar el umbral hacia
// el borde de origen de la cortina. Devuelve el MotionValue del eje activo
// (para enlazarlo al `style` del contenedor) + handlers de pointer.
//   dir = 'up' (Zenith) | 'left' (Horizon) | 'right' (Logic)
const SWIPE_THRESHOLD = 80; // px para confirmar el cierre
type SwipeDir = "up" | "left" | "right";

function useSwipeToClose(dir: SwipeDir, onClose: () => void) {
    const reduceMotion = useReducedMotion();
    // `signed` guarda el desplazamiento VISUAL con signo (el que va al style):
    //   arriba => valores negativos en y · izquierda => negativos en x · derecha => positivos en x.
    const signed = useMotionValue(0);
    const axis: "x" | "y" = dir === "up" ? "y" : "x";
    // Signo hacia el borde de cierre: arriba(-y), izquierda(-x), derecha(+x).
    const sign = dir === "right" ? 1 : -1;

    const start = useRef<{ x: number; y: number } | null>(null);
    const dragging = useRef(false);
    // Magnitud (>=0) del avance hacia el borde de cierre; para el umbral.
    const progress = useRef(0);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        start.current = { x: e.clientX, y: e.clientY };
        dragging.current = true;
        progress.current = 0;
        try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* noop */ }
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragging.current || !start.current) return;
        const delta = axis === "y" ? e.clientY - start.current.y : e.clientX - start.current.x;
        // Solo permitimos movimiento HACIA el borde de cierre (delta*sign > 0).
        const toward = Math.max(0, delta * sign);
        // Resistencia elástica suave para que se sienta líquido.
        const mag = reduceMotion ? toward : toward * (toward > 120 ? 0.85 : 1);
        progress.current = mag;
        signed.set(mag * sign);
    }, [axis, sign, signed, reduceMotion]);

    const finish = useCallback(() => {
        if (!dragging.current) return;
        dragging.current = false;
        start.current = null;
        if (progress.current >= SWIPE_THRESHOLD) {
            onClose();
            signed.set(0); // reset para la próxima apertura
        } else if (reduceMotion) {
            signed.set(0);
        } else {
            animate(signed, 0, { type: "spring", stiffness: 500, damping: 40 });
        }
        progress.current = 0;
    }, [signed, onClose, reduceMotion]);

    const style: { x?: MotionValue<number>; y?: MotionValue<number> } =
        axis === "y" ? { y: signed } : { x: signed };

    return {
        motionStyle: style,
        handlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp: finish,
            onPointerCancel: finish,
        },
    };
}

// Botón de cierre cristalino reutilizable (X, área táctil >= 44px).
function CurtainCloseButton({ onClose, accent }: { onClose: () => void; accent: string }) {
    return (
        <button
            type="button"
            aria-label="Cerrar"
            title="Cerrar"
            onClick={onClose}
            className={cn(curtain.closeBtn, curtain.closeTopRight)}
            style={{ ["--cc" as string]: accent }}
        >
            <X className={curtain.closeIcon} />
        </button>
    );
}

export function ZenithCurtain() {
    const { activeEdge, setActiveEdge } = usePerimeter();
    const isActive = activeEdge === 'zenith';
    const closeCurtain = useCallback(() => setActiveEdge(null), [setActiveEdge]);
    const swipe = useSwipeToClose("up", closeCurtain);

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
                        // Anclado dentro del viewport + safe-area (nunca se sale). 100dvh en vez de vh
                        // para que la barra de URL de Android no lo recorte ni desborde.
                        "top-[max(0.75rem,env(safe-area-inset-top))] w-[min(98vw,1600px)] max-w-[100vw]",
                        "h-[min(92dvh,calc(100dvh-1.5rem))]"
                    )}
                >
                  {/* Capa de arrastre: sigue al dedo (swipe hacia arriba cierra). */}
                  <motion.div className="absolute inset-0" style={swipe.motionStyle}>
                    {/* Background — cristal líquido profundo teñido Zenith */}
                    <div className="absolute inset-0 rounded-3xl bg-black/85 backdrop-blur-2xl ss-crystal ss-crystal--deep ss-tone--zenith" />
                    <div className="absolute inset-0 bg-gradient-to-b from-cyan-950/50 via-transparent to-cyan-950/20 pointer-events-none" />

                    {/* Tirador de swipe (Zenith cierra hacia ARRIBA) + botón de cierre */}
                    <div
                        className={curtain.grabberTop}
                        style={{ ["--cc" as string]: "#22d3ee" }}
                        {...swipe.handlers}
                        role="presentation"
                    />
                    <CurtainCloseButton onClose={closeCurtain} accent="#22d3ee" />

                    <div className="relative z-10 w-full h-full flex flex-col text-cyan-50">

                        {/* Header — sólo el título de la ventana (deja hueco arriba para el tirador). */}
                        <div className="flex items-center gap-3 px-5 md:px-8 pt-8 md:pt-9 pb-3 shrink-0 border-b border-cyan-500/15 bg-black/20 min-w-0">
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
                                <AuroraChatSection />
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
