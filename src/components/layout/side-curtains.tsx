"use client";

/**
 * Cortinas laterales Trinity: Horizon (izquierda · verde · Centro de Creación)
 * y Logic (derecha · ámbar · Centro de Control).
 * ─────────────────────────────────────────────────────────────────────────────
 * Todo el comportamiento (arrastre con ratón/dedo/lápiz, fondo que se
 * oscurece, tirador, X común, Escape y foco) vive en `PanelCortina`; aquí solo
 * se decide qué cortina está abierta, su tamaño según la pantalla y su contenido.
 *
 * Tamaño adaptativo:
 *   · Pantalla estrecha (móvil en vertical): casi todo el ancho, dejando una
 *     franja del fondo a la vista — tocarla cierra y deja claro que es un panel.
 *   · md en adelante (tableta, móvil apaisado, escritorio): ancho fijo cómodo,
 *     centrado en vertical y siempre dentro del viewport y de las zonas seguras.
 */

import React, { useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { usePerimeter } from "@/context/perimeter-context";
import { useBoardSystem } from "@/context/board-context";
import UniversalBoardViewer from "@/components/control-panel/board/universal-board-viewer";
import { Button } from "@/components/ui/button";
import { BotonCerrar } from "@/components/ui/boton-cerrar";
import { cn } from "@/lib/utils";
import { useRitoActivo } from "@/lib/ui/rito-activo";
import { ControlCenter } from "./trinity/control-center";
import { ContenidoHorizon } from "./trinity/contenido-horizon";
import { PanelCortina, usePanelCortina } from "./trinity/panel-cortina";

const VERDE = "#10b981";
const AMBAR = "#f59e0b";

export function SideCurtains() {
    const { activeEdge, setActiveEdge } = usePerimeter();
    const router = useRouter();
    const { boards, activeBoardId } = useBoardSystem();
    // (Ola 228 · R1F) Mientras haya un rito en primer plano, ninguna cortina sale.
    const rito = useRitoActivo();

    const cerrar = useCallback(() => setActiveEdge(null), [setActiveEdge]);
    // Navegar cerrando la cortina primero (Adenda 63): la salida se anima sola.
    const ir = useCallback((href: string) => {
        setActiveEdge(null);
        router.push(href);
    }, [router, setActiveEdge]);
    const abrirEditor = useCallback(() => {
        setActiveEdge(null);
        window.dispatchEvent(new CustomEvent("starseed:open-editor"));
    }, [setActiveEdge]);

    const pizarra = activeBoardId ? boards.find((b) => b.id === activeBoardId) : undefined;

    if (rito) return null;

    return (
        <AnimatePresence>
            {activeEdge === "horizon" && (
                <PanelCortina
                    key="horizon"
                    borde="horizon"
                    lado="izquierda"
                    etiqueta="Centro de Creación"
                    acento={VERDE}
                    onCerrar={cerrar}
                    testId="horizon-curtain-container"
                    id="trinity-cortina-horizon"
                    className={cn(
                        "fixed z-[90] overflow-hidden box-border shadow-2xl border-r border-emerald-500/30",
                        // Estrecha: casi todo el ancho, pegada al borde, a toda altura.
                        "top-0 bottom-0 left-0 h-[100dvh] w-[calc(100vw-1rem)] max-w-[28rem] rounded-r-[1.75rem]",
                        // <640px: 100vw-1rem se queda en ~96vw en un smartphone — se
                        // topa a 92vw (regla del área) para que el fondo oscurecido se
                        // note como panel, no como pantalla completa. ≥640px no cambia.
                        "max-sm:w-[92vw] max-sm:max-w-[92vw]",
                        // md+: panel cómodo, centrado con my-auto (sin transform: el transform es del gesto).
                        "md:h-[min(46rem,92dvh)] md:my-auto md:rounded-[2rem] md:border",
                        "md:left-[max(1rem,env(safe-area-inset-left))] md:w-[clamp(22rem,42vw,32rem)] md:max-w-[calc(100vw-2rem)]",
                    )}
                >
                    <ContenidoHorizon ir={ir} abrirEditor={abrirEditor} />
                </PanelCortina>
            )}

            {activeEdge === "logic" && (
                <PanelCortina
                    key="logic"
                    borde="logic"
                    lado="derecha"
                    etiqueta={pizarra ? `Pizarra ${pizarra.name}` : "Centro de Control"}
                    acento={AMBAR}
                    onCerrar={cerrar}
                    testId="logic-curtain-container"
                    id="trinity-cortina-logic"
                    // El Centro de Control y el visor de pizarra colocan la X en su propia
                    // cabecera, alineada con sus otros controles (antes flotaba fuera del panel).
                    botonCerrar="ninguno"
                    className={cn(
                        "fixed z-[90] overflow-hidden box-border shadow-2xl",
                        "top-0 bottom-0 right-0 h-[100dvh] w-[calc(100vw-1rem)] rounded-l-[1.75rem]",
                        // <640px: mismo tope de 92vw que Horizon; la pizarra (más ancha
                        // por naturaleza) queda excluida, se necesita todo el sitio
                        // posible para dibujar. ≥640px no cambia.
                        !pizarra && "max-sm:w-[92vw] max-sm:max-w-[92vw]",
                        "md:my-auto md:right-[max(1rem,env(safe-area-inset-right))] md:rounded-[2rem] md:max-w-[calc(100vw-2rem)]",
                        pizarra
                            ? "max-w-[100vw] bg-black/80 backdrop-blur-xl border border-amber-500/30 md:w-[min(85vw,72rem)] md:h-[calc(100dvh-2rem)]"
                            : "max-w-[30rem] md:w-[420px] md:h-[min(600px,calc(100dvh-2rem))] lg:w-[460px] lg:h-[min(640px,calc(100dvh-2rem))]",
                    )}
                >
                    {pizarra ? <VisorPizarra /> : <ControlCenter />}
                </PanelCortina>
            )}
        </AnimatePresence>
    );
}

/** Pizarra abierta dentro de Logic: «Volver» a la lista y X común. */
function VisorPizarra() {
    const { setActiveBoard } = useBoardSystem();
    const panel = usePanelCortina();
    return (
        <div className="h-full w-full relative">
            <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-4 z-50 flex items-center gap-2">
                <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => setActiveBoard(null)}
                    className="gap-2 backdrop-blur-md bg-background/50 rounded-full h-11 min-h-[44px] cursor-pointer"
                >
                    <ArrowLeft className="w-4 h-4 mr-1" /> Volver
                </Button>
                <BotonCerrar etiqueta="Cerrar la pizarra" acento={AMBAR} atajo="Esc" onClick={() => panel?.cerrar()} />
            </div>
            <UniversalBoardViewer />
        </div>
    );
}
