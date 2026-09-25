"use client";

/**
 * usePerfilDispositivo — qué punteros hay y qué forma tiene la pantalla, en vivo.
 * ─────────────────────────────────────────────────────────────────────────────
 * Conectar un ratón a una tableta, girar el móvil o redimensionar la ventana
 * cambia el perfil sin recargar: las guías explican el gesto adecuado y las
 * cortinas ajustan su tamaño al momento. En el servidor devuelve «ratón /
 * amplio» (lo que pinta el HTML) y la hidratación lo corrige sin desajustes.
 */

import { useSyncExternalStore } from "react";
import {
    formatoPantalla,
    perfilDeEntrada,
    type Formato,
    type PerfilEntrada,
} from "@/lib/gestos/dispositivo";

export interface PerfilDispositivo extends Formato {
    entrada: PerfilEntrada;
}

const CONSULTAS = ["(any-pointer: coarse)", "(any-pointer: fine)", "(any-hover: hover)"] as const;
const EN_SERVIDOR: PerfilDispositivo = { entrada: "raton", formato: "amplio", orientacion: "horizontal", proporcion: 16 / 9 };

let cache: PerfilDispositivo = EN_SERVIDOR;
let clave = "";

function coincide(q: string): boolean {
    try {
        return window.matchMedia(q).matches;
    } catch {
        return false;
    }
}

function leer(): PerfilDispositivo {
    if (typeof window === "undefined") return EN_SERVIDOR;
    const entrada = perfilDeEntrada({
        punteroGrueso: coincide(CONSULTAS[0]),
        punteroFino: coincide(CONSULTAS[1]),
        algunHover: coincide(CONSULTAS[2]),
    });
    const f = formatoPantalla(window.innerWidth, window.innerHeight);
    // Misma instancia mientras nada relevante cambie: useSyncExternalStore
    // compara por referencia y así no re-renderiza en cada `resize`.
    const nueva = `${entrada}|${f.formato}|${f.orientacion}`;
    if (nueva !== clave) {
        clave = nueva;
        cache = { entrada, ...f };
    }
    return cache;
}

function suscribir(avisar: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    const listas: MediaQueryList[] = [];
    for (const q of CONSULTAS) {
        try {
            const mq = window.matchMedia(q);
            mq.addEventListener?.("change", avisar);
            listas.push(mq);
        } catch {
            /* sin matchMedia: se queda el perfil inicial */
        }
    }
    window.addEventListener("resize", avisar, { passive: true });
    window.addEventListener("orientationchange", avisar);
    return () => {
        listas.forEach((mq) => {
            try {
                mq.removeEventListener?.("change", avisar);
            } catch {
                /* noop */
            }
        });
        window.removeEventListener("resize", avisar);
        window.removeEventListener("orientationchange", avisar);
    };
}

export function usePerfilDispositivo(): PerfilDispositivo {
    return useSyncExternalStore(suscribir, leer, () => EN_SERVIDOR);
}
