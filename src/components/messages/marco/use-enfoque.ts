"use client";

/**
 * Modo enfoque de Mensajería (2026-09-28): la lista se recoge y el chat o el correo abierto usa
 * todo el ancho. Se alterna con el botón de la barra o desde el propio chat, y se sale con Esc.
 * La elección se recuerda en este navegador (conveniencia personal; si el almacenamiento falla,
 * simplemente empieza sin enfoque).
 */

import { useCallback, useEffect, useState } from "react";

export const LS_ENFOQUE = "starseed.mensajeria.enfoque.v1";

function leer(): boolean {
    try {
        return window.localStorage.getItem(LS_ENFOQUE) === "1";
    } catch {
        return false;
    }
}

function guardar(v: boolean): void {
    try {
        window.localStorage.setItem(LS_ENFOQUE, v ? "1" : "0");
    } catch {
        /* navegación privada o almacenamiento bloqueado: no pasa nada */
    }
}

/** ¿Hay un diálogo o un menú abierto? Entonces Esc es suyo, no del enfoque. */
function hayCapaAbierta(): boolean {
    if (typeof document === "undefined") return false;
    return !!document.querySelector("[role='dialog'], [role='alertdialog'], [role='menu'], [data-ss-modal-content]");
}

export interface EnfoqueApi {
    enfocado: boolean;
    alternar: () => void;
    fijar: (v: boolean) => void;
}

export function useEnfoque(): EnfoqueApi {
    // Siempre `false` en el primer render (igual que el servidor) y luego lo recordado.
    const [enfocado, setEnfocado] = useState(false);

    useEffect(() => {
        setEnfocado(leer());
    }, []);

    const fijar = useCallback((v: boolean) => {
        setEnfocado(v);
        guardar(v);
    }, []);

    const alternar = useCallback(() => {
        setEnfocado((prev) => {
            const v = !prev;
            guardar(v);
            return v;
        });
    }, []);

    useEffect(() => {
        if (!enfocado) return;
        const alTeclado = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented) return;
            if (hayCapaAbierta()) return;
            fijar(false);
        };
        window.addEventListener("keydown", alTeclado);
        return () => window.removeEventListener("keydown", alTeclado);
    }, [enfocado, fijar]);

    return { enfocado, alternar, fijar };
}
