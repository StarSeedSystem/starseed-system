"use client";

/**
 * PanelCortina — el armazón común de las cortinas Trinity.
 * ─────────────────────────────────────────────────────────────────────────────
 * Zenith (arriba), Horizon (izquierda) y Logic (derecha) comparten aquí TODO
 * su comportamiento, para que abrir y cerrar se sienta igual en cualquier
 * dispositivo:
 *
 *   · Arrastre 1:1 con ratón, dedo o lápiz (useArrastrePanel): hacia su borde
 *     para cerrar, con goma elástica y latigazo; y apertura siguiendo al dedo
 *     cuando el gesto nace en el borde de la pantalla.
 *   · Fondo que se oscurece en proporción a lo abierto; tocarlo cierra.
 *   · Tirador visible en el canto interior (se arrastra o se toca).
 *   · Botón de cierre común (BotonCerrar) en una esquina segura, o donde el
 *     contenido lo coloque usando `usePanelCortina().cerrar`.
 *   · Teclado: Escape cierra, Tab queda dentro del panel y el foco vuelve a
 *     donde estaba al cerrar. `role="dialog"` con nombre accesible.
 *   · Inclinación 3D sutil al entrar/salir (solo con movimiento completo).
 *
 * Debe ser hijo (directo o no) de <AnimatePresence>: la salida la gestiona
 * `usePresence` dentro del hook.
 */

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BotonCerrar } from "@/components/ui/boton-cerrar";
import { useArrastrePanel } from "@/hooks/use-arrastre-panel";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import type { BordeTrinity, Lado } from "@/lib/gestos";
import estilos from "./panel-cortina.module.css";

interface ContextoPanelCortina {
    /** Cierre animado: el panel vuelve a su borde y luego se desmonta. */
    cerrar: () => void;
}

const PanelCortinaContext = createContext<ContextoPanelCortina | null>(null);

/** Para el contenido de una cortina: cerrar con la misma animación que la X o el gesto. */
export function usePanelCortina(): ContextoPanelCortina | null {
    return useContext(PanelCortinaContext);
}

export interface PanelCortinaProps {
    borde: BordeTrinity;
    lado: Lado;
    /** Nombre accesible del panel («Centro de Creación»). */
    etiqueta: string;
    /** Color del nodo Trinity (tirador, X y brillo). */
    acento: string;
    onCerrar: () => void;
    /** Posición y tamaño del panel (clases `fixed …`). */
    className?: string;
    children: ReactNode;
    /** Cortina superior: el arrastre solo nace en `data-agarre-panel` para no robar el scroll. */
    soloAgarres?: boolean;
    /** «esquina» = X en la esquina interior; «ninguno» = el contenido pone la suya. */
    botonCerrar?: "esquina" | "ninguno";
    /** Clases extra para la X de esquina (p. ej. otra altura). */
    claseBotonCerrar?: string;
    /** Rueda / trackpad horizontal (escritorio). Por defecto en los laterales. */
    rueda?: boolean;
    testId?: string;
    id?: string;
}

export function PanelCortina({
    borde,
    lado,
    etiqueta,
    acento,
    onCerrar,
    className,
    children,
    soloAgarres = false,
    botonCerrar = "esquina",
    claseBotonCerrar,
    rueda,
    testId,
    id,
}: PanelCortinaProps) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const lateral = lado === "izquierda" || lado === "derecha";
    const arrastre = useArrastrePanel({
        lado,
        borde,
        panelRef,
        onCerrar,
        soloAgarres,
        rueda: rueda ?? lateral,
    });
    const { cerrar } = arrastre;

    useModalA11y({ open: true, onClose: cerrar, containerRef: panelRef, initialFocus: "container" });

    // Valor estable: el contenido no se re-renderiza por nada del gesto.
    const contexto = useMemo(() => ({ cerrar }), [cerrar]);

    // La X va en la esquina que mira al centro de la pantalla: a mano y lejos del borde del sistema.
    const esquina = lado === "derecha" ? "arriba-izquierda" : "arriba-derecha";

    return (
        <PanelCortinaContext.Provider value={contexto}>
            <motion.div
                aria-hidden="true"
                data-trinity-curtain-fondo={borde}
                className={cn("fixed inset-0 z-[89]", estilos.fondo)}
                style={{ opacity: arrastre.fraccion }}
                onClick={cerrar}
            />
            <motion.div
                ref={panelRef}
                id={id}
                role="dialog"
                aria-modal="true"
                aria-label={etiqueta}
                data-trinity-curtain={borde}
                data-testid={testId}
                data-lado={lado}
                className={cn("outline-none", estilos.panel, estilos[`lado_${lado}`], className)}
                style={{ transform: arrastre.transform, transformOrigin: arrastre.origen }}
                {...arrastre.manejadores}
            >
                {children}

                <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    data-agarre-panel=""
                    data-tirador-cortina={borde}
                    data-testid={testId ? `${testId}-tirador` : undefined}
                    // En los laterales el tirador vive en el margen y tocarlo cierra. En la
                    // cortina superior queda sobre el final del chat: ahí solo se arrastra,
                    // para que un toque que busca el cuadro de texto nunca cierre el Exocórtex.
                    onClick={lateral ? cerrar : undefined}
                    className={cn(
                        estilos.tirador,
                        lateral ? estilos.tiradorVertical : estilos.tiradorHorizontal,
                        lado === "izquierda" && estilos.tiradorDerecha,
                        lado === "derecha" && estilos.tiradorIzquierda,
                    )}
                    style={{ ["--cc" as string]: acento }}
                >
                    <span className={estilos.pildora} />
                </button>

                {botonCerrar === "esquina" && (
                    <BotonCerrar
                        etiqueta={`Cerrar ${etiqueta}`}
                        acento={acento}
                        atajo="Esc"
                        posicion={esquina}
                        className={claseBotonCerrar}
                        onClick={cerrar}
                    />
                )}
            </motion.div>
        </PanelCortinaContext.Provider>
    );
}

export default PanelCortina;
