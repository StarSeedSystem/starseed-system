"use client";
/**
 * Lienzo del catálogo ampliado (gen4 + gen5 · Ola 0929-C).
 *
 * Los 21 widgets de este paquete viven dentro del `MarcoUnificado` (el vidrio lo pinta el
 * marco). Aquí está lo que todos comparten para que cada tamaño sea un DISEÑO y no una escala:
 *
 * - `useLienzo()`: la clase de tamaño del marco (o, fuera de él, la medida propia), el
 *   dispositivo (móvil/tablet/escritorio/TV, puntero táctil), el nivel de render y si el
 *   widget está a la vista (pestaña visible + en pantalla). `animar` solo es true cuando
 *   todo eso lo permite: nada gira en «eco», con movimiento reducido o fuera de la vista.
 * - `Lienzo`: la raíz con la cabecera común del marco (icono + rótulo + pastillas) y un
 *   cuerpo que nunca desborda.
 *
 * Nada de red aquí: solo DOM y `matchMedia`.
 */
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useElementSize } from "@/components/dashboard/kit/use-element-size";
import { useMarcoUnificado, type BaseTamano, type EspaciadoMarco } from "@/components/dashboard/kit/contexto-marco";
import { CabeceraMarco, espaciadoDe } from "@/components/widgets-libres/marco-unificado";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import { claseDesdePx, dispositivoActual, type ClaseDispositivo, type ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { useNivelRender, type NivelRender } from "@/lib/widgets/forma/nivel-dispositivo";

// ── Visibilidad: pestaña visible y widget en pantalla ─────────────────────

/** true mientras la pestaña está visible Y el elemento cruza el viewport. Sin API → true. */
export function useAVista(ref: React.RefObject<HTMLElement | null>): boolean {
    const [pestana, setPestana] = React.useState(true);
    const [enPantalla, setEnPantalla] = React.useState(true);
    React.useEffect(() => {
        if (typeof document === "undefined") return;
        const leer = () => setPestana(document.visibilityState !== "hidden");
        leer();
        document.addEventListener("visibilitychange", leer);
        return () => document.removeEventListener("visibilitychange", leer);
    }, []);
    React.useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === "undefined") return;
        const io = new IntersectionObserver((entradas) => {
            for (const e of entradas) setEnPantalla(e.isIntersecting);
        }, { rootMargin: "80px" });
        io.observe(el);
        return () => io.disconnect();
    }, [ref]);
    return pestana && enPantalla;
}

/** `prefers-reduced-motion`, reactivo. */
export function useMovimientoReducido(): boolean {
    const [reducido, setReducido] = React.useState(false);
    React.useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        let mq: MediaQueryList;
        try { mq = window.matchMedia("(prefers-reduced-motion: reduce)"); } catch { return; }
        const leer = () => setReducido(!!mq.matches);
        leer();
        mq.addEventListener?.("change", leer);
        return () => mq.removeEventListener?.("change", leer);
    }, []);
    return reducido;
}

/** Dispositivo actual y si el puntero es táctil (se relee al girar o redimensionar). */
export function useDispositivo(): { dispositivo: ClaseDispositivo; tactil: boolean } {
    const [estado, setEstado] = React.useState<{ dispositivo: ClaseDispositivo; tactil: boolean }>({ dispositivo: "escritorio", tactil: false });
    React.useEffect(() => {
        if (typeof window === "undefined") return;
        let t: number | undefined;
        const leer = () => {
            let tactil = false;
            try { tactil = window.matchMedia("(pointer: coarse)").matches; } catch { /* sin matchMedia */ }
            const dispositivo = dispositivoActual();
            setEstado((prev) => (prev.dispositivo === dispositivo && prev.tactil === tactil ? prev : { dispositivo, tactil }));
        };
        const diferido = () => { window.clearTimeout(t); t = window.setTimeout(leer, 200); };
        leer();
        window.addEventListener("resize", diferido);
        return () => { window.clearTimeout(t); window.removeEventListener("resize", diferido); };
    }, []);
    return estado;
}

// ── useLienzo ─────────────────────────────────────────────────────────────

export interface EstadoLienzo {
    ref: React.RefObject<HTMLDivElement | null>;
    clase: ClaseTamano;
    base: BaseTamano;
    /** Panorámico: mucho más ancho que alto. */
    horizontal: boolean;
    /** Torre: mucho más alto que ancho. */
    torre: boolean;
    ancho: number;
    alto: number;
    /** El lado corto medido (px). */
    lado: number;
    acento: string;
    acento2: string;
    esp: EspaciadoMarco;
    dispositivo: ClaseDispositivo;
    tactil: boolean;
    tv: boolean;
    /** Multiplicador tipográfico: TV lee de lejos. */
    escala: number;
    /** Alto mínimo de un control pulsable (44 px en táctil y TV). */
    toque: number;
    nivel: NivelRender;
    visible: boolean;
    reducido: boolean;
    /** Se puede animar: a la vista, sin movimiento reducido y fuera de «ligero»/«eco». */
    animar: boolean;
}

const ACENTO_DEFECTO = "#7c5cff";
const ACENTO2_DEFECTO = "#23d5ab";

export function useLienzo(acentoPropio?: string, acento2Propio?: string): EstadoLienzo {
    const marco = useMarcoUnificado();
    const { ref, size } = useElementSize<HTMLDivElement>();
    const nivel = useNivelRender();
    const visible = useAVista(ref);
    const reducido = useMovimientoReducido();
    const { dispositivo, tactil } = useDispositivo();

    const ancho = Math.max(0, Math.round(size.width));
    const alto = Math.max(0, Math.round(size.height));
    const clase = marco?.clase ?? claseDesdePx(ancho, alto);
    const { base, horizontal } = disenoDe(clase);
    const esp = marco?.espaciado ?? espaciadoDe(clase);
    const tv = dispositivo === "tv";
    return {
        ref,
        clase,
        base,
        horizontal,
        torre: clase === "torre",
        ancho,
        alto,
        lado: Math.min(ancho, alto),
        acento: marco?.acento ?? acentoPropio ?? ACENTO_DEFECTO,
        acento2: marco?.acento2 ?? acento2Propio ?? ACENTO2_DEFECTO,
        esp,
        dispositivo,
        tactil,
        tv,
        escala: tv ? 1.25 : 1,
        toque: tactil || tv ? 44 : 30,
        nivel,
        visible,
        reducido,
        animar: visible && !reducido && nivel !== "ligero",
    };
}

// ── Lienzo (raíz + cabecera común) ────────────────────────────────────────

export interface LienzoProps {
    l: EstadoLienzo;
    titulo: string;
    subtitulo?: string;
    icono?: LucideIcon;
    /** Pastillas de la cabecera (se ocultan en micro). */
    acciones?: React.ReactNode;
    vivo?: boolean;
    /** Sin cabecera en esta composición (micro y glifos a sangre). */
    sinCabecera?: boolean;
    /** Nombre accesible del widget entero (resumen de su estado). */
    etiqueta?: string;
    className?: string;
    cuerpoClassName?: string;
    children: React.ReactNode;
}

export function Lienzo({ l, titulo, subtitulo, icono, acciones, vivo, sinCabecera, etiqueta, className, cuerpoClassName, children }: LienzoProps) {
    const conCabecera = !sinCabecera && l.base !== "micro";
    return (
        <div
            ref={l.ref}
            role="region"
            aria-label={etiqueta ?? titulo}
            data-lienzo-c=""
            data-tamano={l.clase}
            data-dispositivo={l.dispositivo}
            data-animar={l.animar ? "si" : "no"}
            className={cn("relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden text-white", className)}
            style={{ fontSize: l.tv ? "1.12em" : undefined }}
        >
            {conCabecera && (
                <CabeceraMarco
                    titulo={titulo}
                    subtitulo={subtitulo}
                    icono={icono}
                    acciones={acciones}
                    vivo={vivo}
                    acento={l.acento}
                    base={l.base}
                    horizontal={l.horizontal}
                    espaciado={l.esp}
                />
            )}
            <div className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col", l.esp.cuerpo, !conCabecera && (l.base === "micro" ? "p-2" : "pt-3"), cuerpoClassName)}>
                {children}
            </div>
        </div>
    );
}

/** Id estable para `<defs>` de SVG (sin dos puntos, válido en `url(#…)`). */
export function useIdSvg(prefijo: string): string {
    return `${prefijo}-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
