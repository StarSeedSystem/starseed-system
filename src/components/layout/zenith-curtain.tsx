"use client";

/**
 * StarSeed OS — Ventana Zenith «Exocortex» (Adenda 71-ter · I3)
 * ----------------------------------------------------------------------------
 * VENTANA ÚNICA: el Exocórtex completo (`AuroraChatSection`). Sus funciones
 * útiles viven en su menú interno (sentidos, opciones, cerebros, pantalla…).
 *
 * Gestos (2026-09-25, `PanelCortina`): la cortina baja desde arriba siguiendo
 * el dedo o el ratón cuando el gesto nace en el borde superior, y se cierra
 * arrastrando HACIA ARRIBA su cabecera o el tirador de abajo, tocando fuera,
 * con la X o con Escape. El cuerpo del chat NO arrastra el panel: ahí el
 * dedo desplaza la conversación (antes una capa `touch-pan-x` que capturaba
 * cada toque competía con el scroll y le robaba los clics a los botones).
 *
 * Móvil/Android: `svh` mantiene la ventana estable cuando la barra del
 * navegador aparece o se esconde; el scroll vive dentro del cuerpo.
 */

import React, { useCallback, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Globe } from "lucide-react";
import { usePerimeter } from "@/context/perimeter-context";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import { ensureAuroraChatLogRecorder } from "@/lib/aurora/aurora-chat-log";
import { cn } from "@/lib/utils";
import { AuroraChatSection } from "@/components/exocortex/aurora-chat-section";
import { ExocortexErrorBoundary } from "@/components/exocortex/exocortex-error-boundary";
import { BotonCerrar } from "@/components/ui/boton-cerrar";
import { PanelCortina, usePanelCortina } from "./trinity/panel-cortina";
import estilos from "./trinity/panel-cortina.module.css";

const CIAN = "#22d3ee";

export function ZenithCurtain() {
    const { activeEdge, setActiveEdge } = usePerimeter();
    const cerrar = useCallback(() => setActiveEdge(null), [setActiveEdge]);

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
            {activeEdge === "zenith" && (
                <PanelCortina
                    key="zenith"
                    borde="zenith"
                    lado="arriba"
                    etiqueta="Exocortex"
                    acento={CIAN}
                    onCerrar={cerrar}
                    soloAgarres
                    botonCerrar="ninguno"
                    testId="zenith-curtain-container"
                    id="trinity-cortina-zenith"
                    className={cn(
                        "fixed inset-x-0 mx-auto z-[90] rounded-3xl overflow-hidden box-border",
                        "shadow-[0_20px_50px_rgba(6,182,212,0.3)] border border-cyan-500/30 text-cyan-50",
                        // Material StarSeed: aro neón Zenith que respira suave (azul #007FFF)
                        "ss-neon ss-neon--zenith",
                        // Anclado dentro del viewport + zona segura; centrado con mx-auto
                        // (sin transform: el transform es del gesto).
                        "top-[max(0.75rem,env(safe-area-inset-top))] w-[min(98vw,1600px)] max-w-[100vw]",
                        "h-[min(92svh,calc(100svh-1.5rem))]",
                    )}
                >
                    <ContenidoZenith />
                </PanelCortina>
            )}
        </AnimatePresence>
    );
}

function ContenidoZenith() {
    const panel = usePanelCortina();
    return (
        <div className="absolute inset-0" data-testid="zenith-curtain-swipe-layer">
            {/* Fondo — cristal líquido profundo teñido Zenith */}
            <div className="absolute inset-0 rounded-3xl bg-black/85 backdrop-blur-2xl ss-crystal ss-crystal--deep ss-tone--zenith" />
            <div className="absolute inset-0 bg-gradient-to-b from-cyan-950/50 via-transparent to-cyan-950/20 pointer-events-none" />

            <div className="relative z-10 w-full h-full flex flex-col text-cyan-50">
                {/* Cabecera: es AGARRE (arrastrar hacia arriba cierra) y lleva la X
                    alineada con el título, dentro del panel y lejos de la muesca. */}
                <div
                    data-agarre-panel=""
                    className={cn(
                        "flex items-center gap-3 px-5 md:px-8 pt-5 md:pt-6 pb-3 shrink-0 border-b border-cyan-500/15 bg-black/20 min-w-0 select-none",
                        estilos.agarre,
                    )}
                >
                    <span data-ss-coreo="logo" className="ss-icon-3d ss-tone--zenith ss-float shrink-0">
                        <Globe className="w-5 h-5 md:w-6 md:h-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg md:text-2xl font-light tracking-widest uppercase font-headline truncate">Exocortex</h2>
                        <p className="text-[11px] text-cyan-300/60 font-mono hidden md:block truncate">Astraura IA</p>
                    </div>
                    <BotonCerrar etiqueta="Cerrar Exocortex" acento={CIAN} atajo="Esc" onClick={() => panel?.cerrar()} />
                </div>

                {/* Cuerpo — Exocórtex completo (chat + menú interno), con scroll propio. */}
                <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain custom-scrollbar">
                    <div className="mx-auto w-full max-w-5xl px-3 sm:px-5 md:px-8 lg:px-12 py-4 md:py-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
                        {/* Límite de error: una excepción del Exocórtex NO tira la
                            cortina; ofrece «Reintentar» que re-monta sólo el contenido. */}
                        <ExocortexErrorBoundary label="ventana Exocortex">
                            <AuroraChatSection />
                        </ExocortexErrorBoundary>
                    </div>
                </div>
            </div>

            {/* Rayos de luz decorativos */}
            <div className="absolute inset-0 z-0 opacity-30 pointer-events-none mix-blend-screen">
                <div className="absolute top-0 left-[20%] w-[1px] h-full bg-gradient-to-b from-cyan-400 to-transparent blur-[2px]" />
                <div className="absolute top-0 right-[20%] w-[1px] h-full bg-gradient-to-b from-cyan-400 to-transparent blur-[2px]" />
                <div className="absolute top-0 left-1/2 w-[600px] h-full -translate-x-1/2 bg-gradient-to-b from-cyan-500/10 to-transparent blur-[60px]" />
            </div>
        </div>
    );
}
