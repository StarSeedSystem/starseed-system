"use client";

/**
 * CTL1117I · los dos colores de una ventana de control: el de la neurona que se controla (el anunciado en su presencia, o el de
 * sus ajustes, o el de su id) y el MÍO (el que firmo al abrir y con el que se pintan mis clics). Nunca lanza: si algo falla, el
 * de cada id.
 */

import { useEffect, useState } from "react";
import { colorDe, colorValido } from "@/lib/neurons/color-publico";

export interface ColoresControl {
    /** La neurona controlada. */
    otro: string;
    /** Esta neurona (la que controla). */
    mio: string;
}

export function usarColoresControl(neurona: string): ColoresControl {
    const [c, setC] = useState<ColoresControl>(() => ({ otro: colorDe(neurona), mio: colorDe("") }));
    useEffect(() => {
        let vivo = true;
        const leer = async () => {
            try {
                const ajuste = await import("@/lib/neurons/color-publico-ajuste");
                let anunciado: unknown;
                try {
                    const pres = await import("@/lib/neurons/presencia");
                    const m = pres.presenciaActual().medios.find((x) => x.n === neurona && colorValido(x.col));
                    anunciado = m?.col;
                } catch {
                    anunciado = undefined;
                }
                if (vivo) setC({ otro: ajuste.colorPublicoDeNeurona(neurona, anunciado), mio: ajuste.colorPublicoPropio() });
            } catch {
                /* se queda con los de cada id */
            }
        };
        void leer();
        if (typeof window === "undefined" || typeof window.addEventListener !== "function") return () => void (vivo = false);
        window.addEventListener("starseed:neurons", leer);
        const t = setInterval(leer, 20_000);
        return () => {
            vivo = false;
            window.removeEventListener("starseed:neurons", leer);
            clearInterval(t);
        };
    }, [neurona]);
    return c;
}
