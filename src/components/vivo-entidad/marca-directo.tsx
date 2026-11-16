"use client";

/**
 * Marca «EN VIVO» con contador de presencia (SES1116 · P1-C). Módulo pequeño y puro: solo pinta.
 * - `directo: true` → punto rojo y «EN VIVO · N».
 * - `directo: false` sin personas → nada; con personas → contador solo.
 * - `directo: null` (no se sabe) → punto gris con «sin datos», jamás «EN VIVO».
 * Con `prefers-reduced-motion` el punto no parpadea.
 */

import { useEffect, useState, type CSSProperties } from "react";

export interface MarcaDirectoProps {
    /** ¿Hay emisión en directo? `null` = no se sabe todavía. */
    directo: boolean | null;
    /** Personas dentro por presencia; `null` = sin dato. */
    personas: number | null;
    /** Versión compacta para pestañas y tarjetas pequeñas. */
    compacto?: boolean;
}

const CRIMSON = "#DC143C";

const contenedor = (compacto: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: compacto ? 5 : 8,
    fontSize: compacto ? "0.618rem" : "0.8rem",
    letterSpacing: "0.08em",
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: "nowrap",
});

export function MarcaDirecto({ directo, personas, compacto = false }: MarcaDirectoProps) {
    const [reducir, setReducir] = useState(false);
    useEffect(() => {
        if (typeof window.matchMedia !== "function") return;
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        setReducir(mq.matches);
        const alCambiar = (e: MediaQueryListEvent) => setReducir(e.matches);
        mq.addEventListener("change", alCambiar);
        return () => mq.removeEventListener("change", alCambiar);
    }, []);

    if (directo === null) return <SinDatos compacto={compacto} />;
    if (directo === false) return personas ? <Contador personas={personas} compacto={compacto} /> : null;
    const hayContador = personas !== null && personas > 0;
    return (
        <span
            role="status"
            aria-label={hayContador ? `En directo, ${personas} personas` : "En directo"}
            title={hayContador ? `En directo, ${personas} personas` : "En directo"}
            className={reducir ? "" : "animate-pulse"}
            style={contenedor(compacto)}
            data-en-directo="true"
        >
            <span
                aria-hidden="true"
                style={{
                    width: compacto ? 8 : 10,
                    height: compacto ? 8 : 10,
                    borderRadius: "50%",
                    background: CRIMSON,
                    boxShadow: `0 0 8px ${CRIMSON}99`,
                    display: "inline-block",
                }}
            />
            <span>EN VIVO{hayContador ? ` · ${personas}` : ""}</span>
        </span>
    );
}

function SinDatos({ compacto }: { compacto: boolean }) {
    return (
        <span
            role="status"
            aria-label="Presencia sin datos"
            title="Sin datos de presencia"
            style={{ ...contenedor(compacto), opacity: 0.7 }}
            data-sin-datos="true"
        >
            <span
                aria-hidden="true"
                style={{
                    width: compacto ? 8 : 10,
                    height: compacto ? 8 : 10,
                    borderRadius: "50%",
                    background: "rgba(148, 163, 184, 0.9)",
                    display: "inline-block",
                }}
            />
            <span>sin datos</span>
        </span>
    );
}

function Contador({ personas, compacto }: { personas: number; compacto: boolean }) {
    const etiqueta = personas === 1 ? "1 persona" : `${personas} personas`;
    return (
        <span role="status" aria-label={etiqueta} title={etiqueta} style={contenedor(compacto)} data-contador="true">
            <span aria-hidden="true" style={{ width: compacto ? 8 : 10, height: compacto ? 8 : 10, borderRadius: "50%", background: "rgba(148, 163, 184, 0.9)", display: "inline-block" }} />
            <span>{etiqueta}</span>
        </span>
    );
}
