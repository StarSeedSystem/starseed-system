"use client";
/**
 * Lienzo del paquete E (Ola 0929 · medios, apps y utilidades).
 *
 * Un solo hook reúne todo lo que un widget necesita saber para decidir su composición:
 *  · la clase de tamaño (del MarcoUnificado si lo hay; si no, medida con useElementSize),
 *  · el acento de su familia,
 *  · el dispositivo (móvil/tablet/escritorio/TV) y si el puntero es táctil,
 *  · el presupuesto de render (ligero/normal/pleno, que ya incluye «eco» y movimiento reducido),
 *  · y si está a la vista (pestaña visible y dentro de la pantalla) para pausar bucles.
 *
 * Nada de red ni de azar: solo señales del navegador, con guardas SSR.
 */
import * as React from "react";
import { useMarcoUnificado, type BaseTamano } from "@/components/dashboard/kit/contexto-marco";
import { useElementSize } from "@/components/dashboard/kit/use-element-size";
import { claseDesdePx, dispositivoActual, type ClaseDispositivo, type ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { useNivelRender, type NivelRender } from "@/lib/widgets/forma/nivel-dispositivo";
import { disenoDe } from "@/components/widgets-libres/familias/comun";

export interface LienzoE {
    clase: ClaseTamano;
    base: BaseTamano;
    horizontal: boolean;
    /** true en torre (más alto que ancho). */
    vertical: boolean;
    acento: string;
    acento2: string;
    ancho: number;
    alto: number;
    dispositivo: ClaseDispositivo;
    tv: boolean;
    /** Puntero grueso (dedo): objetivos de 44 px. */
    tactil: boolean;
    nivel: NivelRender;
    /** Movimiento permitido: nivel no ligero y widget a la vista. */
    animar: boolean;
    /** Pestaña visible y widget dentro de la pantalla. */
    visible: boolean;
    enMarco: boolean;
}

/** Orden de tamaños para preguntar «¿llego a…?». Panorámico y torre cuentan como «m». */
const ORDEN: Record<BaseTamano, number> = { micro: 0, s: 1, m: 2, l: 3, xl: 4 };

export function alMenosE(l: Pick<LienzoE, "base">, minima: BaseTamano): boolean {
    return ORDEN[l.base] >= ORDEN[minima];
}

/** Dispositivo del navegador, re-medido al redimensionar (con respiro de 250 ms). */
export function useDispositivoE(): { dispositivo: ClaseDispositivo; tactil: boolean } {
    const [estado, setEstado] = React.useState<{ dispositivo: ClaseDispositivo; tactil: boolean }>({ dispositivo: "escritorio", tactil: false });
    React.useEffect(() => {
        if (typeof window === "undefined") return;
        let t: number | undefined;
        const medir = () => {
            let tactil = false;
            try { tactil = window.matchMedia("(pointer: coarse)").matches; } catch { /* sin matchMedia */ }
            const dispositivo = dispositivoActual();
            setEstado((prev) => (prev.dispositivo === dispositivo && prev.tactil === tactil ? prev : { dispositivo, tactil }));
        };
        medir();
        const alCambiar = () => { window.clearTimeout(t); t = window.setTimeout(medir, 250); };
        window.addEventListener("resize", alCambiar);
        return () => { window.clearTimeout(t); window.removeEventListener("resize", alCambiar); };
    }, []);
    return estado;
}

/** Pestaña visible (document.visibilityState). */
export function usePestanaVisibleE(): boolean {
    const [visible, setVisible] = React.useState(true);
    React.useEffect(() => {
        if (typeof document === "undefined") return;
        const leer = () => setVisible(document.visibilityState !== "hidden");
        leer();
        document.addEventListener("visibilitychange", leer);
        return () => document.removeEventListener("visibilitychange", leer);
    }, []);
    return visible;
}

/** El elemento está dentro de la pantalla (sin IntersectionObserver se asume que sí). */
export function useEnPantallaE(ref: React.RefObject<Element | null>): boolean {
    const [dentro, setDentro] = React.useState(true);
    React.useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === "undefined") return;
        const io = new IntersectionObserver((entradas) => {
            for (const e of entradas) setDentro(e.isIntersecting);
        }, { rootMargin: "64px" });
        io.observe(el);
        return () => io.disconnect();
    }, [ref]);
    return dentro;
}

/** Movimiento reducido pedido por la persona. */
export function useMovimientoReducidoE(): boolean {
    const [reducido, setReducido] = React.useState(false);
    React.useEffect(() => {
        if (typeof window === "undefined") return;
        let mq: MediaQueryList | null = null;
        try { mq = window.matchMedia("(prefers-reduced-motion: reduce)"); } catch { return; }
        const leer = () => setReducido(!!mq?.matches);
        leer();
        mq.addEventListener?.("change", leer);
        return () => mq?.removeEventListener?.("change", leer);
    }, []);
    return reducido;
}

const ACENTO_E = "#d946ef";
const ACENTO2_E = "#23d5ab";

/**
 * Todo lo que el widget necesita para componerse. Devuelve el `ref` que hay que poner en la raíz
 * (mide fuera del marco y decide si está en pantalla).
 */
export function useLienzoE(propio?: { acento?: string; acento2?: string }) {
    const marco = useMarcoUnificado();
    const { ref, size } = useElementSize<HTMLDivElement>();
    const { dispositivo, tactil } = useDispositivoE();
    const nivel = useNivelRender();
    const pestana = usePestanaVisibleE();
    const enPantalla = useEnPantallaE(ref);
    const reducido = useMovimientoReducidoE();

    const clase: ClaseTamano = marco?.clase ?? claseDesdePx(Math.round(size.width), Math.round(size.height));
    const { base, horizontal } = disenoDe(clase);
    const visible = pestana && enPantalla;
    const lienzo: LienzoE = {
        clase,
        base,
        horizontal,
        vertical: clase === "torre",
        acento: marco?.acento ?? propio?.acento ?? ACENTO_E,
        acento2: marco?.acento2 ?? propio?.acento2 ?? ACENTO2_E,
        ancho: size.width,
        alto: size.height,
        dispositivo,
        tv: dispositivo === "tv",
        tactil: tactil || dispositivo === "movil",
        nivel,
        animar: nivel !== "ligero" && !reducido && visible,
        visible,
        enMarco: !!marco,
    };
    return { ref, lienzo } as const;
}

/** Escala tipográfica: la TV lee de lejos (x1.25); el móvil nunca baja de 12 px. */
export function px(l: Pick<LienzoE, "tv" | "dispositivo">, base: number): number {
    const v = l.tv ? base * 1.25 : base;
    return l.dispositivo === "movil" ? Math.max(12, v) : v;
}
