"use client";

/**
 * DockDeslizable — el contenedor del OmniDock (Trinity Anchor, abajo) con gestos.
 * ─────────────────────────────────────────────────────────────────────────────
 * Mismo motor que las cortinas: el dock sube siguiendo al dedo cuando el gesto
 * nace en el borde inferior, y se cierra arrastrándolo hacia abajo desde su
 * agarre (la píldora y la barra de iconos), con latigazo y goma elástica, o con
 * Escape. El carril de iconos sigue desplazándose en horizontal con el dedo:
 * solo el movimiento vertical es del dock (`touch-action: pan-x` en el carril).
 *
 * Con «siempre visible» (Ajustes → Trinity) no hay gestos: el dock no se cierra.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useArrastrePanel } from "@/hooks/use-arrastre-panel";

export function DockDeslizable({
    gestos,
    onCerrar,
    className,
    children,
}: {
    /** false = dock fijo (siempre visible): sin arrastre ni Escape. */
    gestos: boolean;
    onCerrar: () => void;
    className?: string;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDivElement | null>(null);
    const arrastre = useArrastrePanel({
        lado: "abajo",
        borde: gestos ? "anchor" : undefined,
        panelRef: ref,
        onCerrar,
        soloAgarres: true,
        habilitado: gestos,
        margenPx: 24,
    });
    const { cerrar } = arrastre;

    // Escape cierra el dock si el foco está en él o en ningún sitio concreto
    // (no roba el Escape de un campo de texto ni de otro panel).
    useEffect(() => {
        if (!gestos) return;
        const alTeclear = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented) return;
            const activo = document.activeElement;
            if (activo && activo !== document.body && !ref.current?.contains(activo)) return;
            cerrar();
        };
        window.addEventListener("keydown", alTeclear);
        return () => window.removeEventListener("keydown", alTeclear);
    }, [cerrar, gestos]);

    return (
        <motion.div
            ref={ref}
            data-omnidock="1"
            // `data-arrastrando` lo pone el hook directamente en el DOM mientras dura el gesto.
            className={cn(className, "data-[arrastrando]:select-none")}
            style={{ transform: arrastre.transform, transformOrigin: arrastre.origen, opacity: arrastre.fraccion }}
            {...arrastre.manejadores}
        >
            {children}
        </motion.div>
    );
}

export default DockDeslizable;
