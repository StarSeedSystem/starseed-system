"use client";
/**
 * Tamaño y dispositivo de los widgets del paquete D (Ola 0929).
 *
 * Cada tamaño es un DISEÑO: la clase sale del marco unificado que envuelve al widget
 * (`useMarcoUnificado`) y, fuera de él (Genesis, Estudio, «marco clásico»), de la medida
 * del propio widget. El dispositivo decide la ergonomía: táctil = dianas de 44 px; TV = letra
 * mayor, anillos de foco y nada que solo aparezca al pasar el ratón.
 */
import * as React from "react";
import { useMarcoUnificado, type BaseTamano } from "@/components/dashboard/kit/contexto-marco";
import { claseDesdePx, dispositivoActual, type ClaseDispositivo, type ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { disenoDe } from "@/components/widgets-libres/familias/comun";

export interface TamanoSocial {
    clase: ClaseTamano;
    base: BaseTamano;
    horizontal: boolean;
    /** Medida del CUERPO del widget (px), para decidir cuántas filas caben. */
    ancho: number;
    alto: number;
    acento: string;
    acento2: string;
    dispositivo: ClaseDispositivo;
    tactil: boolean;
    tv: boolean;
    enMarco: boolean;
}

/** Dispositivo actual, reactivo al cambio de tamaño de la ventana (con respiro de 250 ms). */
export function useDispositivo(): { dispositivo: ClaseDispositivo; tactil: boolean } {
    const [estado, setEstado] = React.useState<{ dispositivo: ClaseDispositivo; tactil: boolean }>({ dispositivo: "escritorio", tactil: false });
    React.useEffect(() => {
        let t: ReturnType<typeof setTimeout> | null = null;
        const leer = () => {
            let grueso = false;
            try { grueso = window.matchMedia("(pointer: coarse)").matches; } catch { /* sin matchMedia */ }
            const dispositivo = dispositivoActual();
            setEstado((p) => (p.dispositivo === dispositivo && p.tactil === grueso ? p : { dispositivo, tactil: grueso || dispositivo === "movil" }));
        };
        leer();
        const alCambiar = () => {
            if (t) clearTimeout(t);
            t = setTimeout(leer, 250);
        };
        window.addEventListener("resize", alCambiar);
        return () => {
            window.removeEventListener("resize", alCambiar);
            if (t) clearTimeout(t);
        };
    }, []);
    return estado;
}

/**
 * Clase de tamaño + medida del cuerpo + dispositivo. `ancho`/`alto` son los del elemento al que
 * se ata `ref` (el cuerpo del widget).
 */
export function useTamanoSocial<E extends HTMLElement = HTMLDivElement>(acentoPorDefecto: string, acento2PorDefecto = "#23d5ab") {
    const marco = useMarcoUnificado();
    const ref = React.useRef<E | null>(null);
    const [medida, setMedida] = React.useState({ ancho: 0, alto: 0 });
    const { dispositivo, tactil } = useDispositivo();

    React.useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const poner = (w: number, h: number) =>
            setMedida((p) => (Math.abs(p.ancho - w) < 1 && Math.abs(p.alto - h) < 1 ? p : { ancho: Math.round(w), alto: Math.round(h) }));
        poner(el.clientWidth, el.clientHeight);
        if (typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver((es) => {
            for (const e of es) poner(e.contentRect.width, e.contentRect.height);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Sin marco (o sin medir todavía, como en jsdom): la clase sale de la propia medida; sin
    // medida, «m» — el diseño central, que nunca se desborda.
    const propia: ClaseTamano = medida.ancho > 0 && medida.alto > 0 ? claseDesdePx(medida.ancho, medida.alto + 44) : "m";
    // El marco mide en un efecto de maquetación (antes del primer pintado): su clase es la buena.
    const clase: ClaseTamano = marco ? marco.clase : propia;
    const { base, horizontal } = disenoDe(clase);

    const tamano: TamanoSocial = {
        clase,
        base,
        horizontal,
        ancho: medida.ancho,
        alto: medida.alto,
        acento: marco?.acento ?? acentoPorDefecto,
        acento2: marco?.acento2 ?? acento2PorDefecto,
        dispositivo,
        tactil,
        tv: dispositivo === "tv",
        enMarco: !!marco,
    };
    return { ref, tamano };
}

/** Cuántas filas de `altoFila` px caben en `alto` (mínimo `min`, máximo `max`). */
export function filasQueCaben(alto: number, altoFila: number, min = 1, max = 12): number {
    if (!(alto > 0)) return min;
    return Math.max(min, Math.min(max, Math.floor(alto / altoFila)));
}

/** Cuántas columnas de `anchoMin` px caben en `ancho`. */
export function columnasQueCaben(ancho: number, anchoMin: number, min = 1, max = 6): number {
    if (!(ancho > 0)) return min;
    return Math.max(min, Math.min(max, Math.floor(ancho / anchoMin)));
}
