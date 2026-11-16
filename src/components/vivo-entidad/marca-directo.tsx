"use client";

import { useEffect, useState } from "react";
import styles from "./marca-directo.module.css";

export interface MarcaDirectoProps {
    directo: boolean | null;
    personas: number | null;
    compacto?: boolean;
}

export function MarcaDirecto({ directo, personas, compacto = false }: MarcaDirectoProps) {
    const [reducedMotion, setReducedMotion] = useState(false);

    useEffect(() => {
        const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
        setReducedMotion(mql.matches);
        const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
        mql.addEventListener("change", handler);
        return () => mql.removeEventListener("change", handler);
    }, []);

    if (directo === false) return null;

    if (directo === null) {
        return (
            <span
                className={`${styles.marca} ${styles.desconocido} ${compacto ? styles.compacto : ""}`}
                role="status"
                aria-label="Sin datos de directo"
                title="Sin datos de directo"
            >
                <span className={styles.punto} data-punto="desconocido" aria-hidden="true" />
                <span className={styles.texto}>sin datos</span>
            </span>
        );
    }

    const personasTexto = personas ?? 0;
    return (
        <span
            className={`${styles.marca} ${styles.vivo} ${compacto ? styles.compacto : ""} ${reducedMotion ? styles.sinAnimacion : ""}`}
            role="status"
            aria-label={`En directo, ${personasTexto} ${personasTexto === 1 ? "persona" : "personas"}`}
            title={`En directo, ${personasTexto} ${personasTexto === 1 ? "persona" : "personas"}`}
        >
            <span className={styles.punto} data-punto="vivo" aria-hidden="true" />
            <span className={styles.texto}>EN VIVO · {personasTexto}</span>
        </span>
    );
}