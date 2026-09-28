/**
 * estilos — material, acentos y pequeñas utilidades visuales compartidas por toda la app de
 * Contactos (panel de cristal oscuro, pastillas fantasma, resorte de los paneles, paleta de
 * colores para categorías y listas). Sin JSX: lo importan componentes y pruebas por igual.
 */

import { useEffect, useState, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";

import { RELACIONES, TIPOS_NOTA, type RelacionInfo, type TipoNota, type TipoRelacion } from "@/lib/contactos/tipos";

/** Acento de la app (teal). */
export const ACENTO = "#14B8A6";

/** Panel de cristal oscuro del OS (radio 22 px). */
export const CLASE_PANEL =
    "rounded-[22px] border border-white/[0.08] bg-[rgba(12,14,34,0.55)] backdrop-blur-[20px] backdrop-saturate-[1.4] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";

/** Tarjeta interior (sección de la ficha, fila destacada). */
export const CLASE_TARJETA =
    "rounded-2xl border border-white/[0.07] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";

/** Rótulo de sección: 11 px, versalitas, tracking .14em, ~55 % blanco. */
export const CLASE_ROTULO = "text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55";

/** Anillo de foco accesible con el acento. */
export const CLASE_FOCO =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6]/70 focus-visible:ring-offset-0";

/** Campo de texto de cristal. */
export const CLASE_CAMPO =
    "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[14px] text-white placeholder:text-white/35 transition-colors duration-200 hover:border-white/20 focus:border-[#14B8A6]/70 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/30";

/** Botón secundario de cristal (texto completo, nunca truncado). */
export const CLASE_BOTON =
    "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-[13px] font-medium text-white/85 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.09] hover:text-white disabled:cursor-not-allowed disabled:opacity-45 " +
    CLASE_FOCO;

/** Botón principal (acento teal). */
export const CLASE_BOTON_PRINCIPAL =
    "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#14B8A6]/60 bg-[#14B8A6]/20 px-4 py-2 text-[13px] font-semibold text-white shadow-[0_0_24px_-6px_rgba(20,184,166,0.65)] transition-all duration-200 hover:bg-[#14B8A6]/30 hover:shadow-[0_0_28px_-4px_rgba(20,184,166,0.8)] disabled:cursor-not-allowed disabled:opacity-45 " +
    CLASE_FOCO;

/** Botón de icono redondo (lleva `ss-redondo` por la regla global de radios). */
export const CLASE_BOTON_ICONO =
    "ss-redondo inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/70 transition-all duration-200 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 " +
    CLASE_FOCO;

/** Menú desplegable de cristal (por encima del OmniDock). */
export const CLASE_MENU =
    "z-[95] min-w-[14rem] rounded-2xl border border-white/10 bg-[rgba(12,14,34,0.92)] p-1.5 text-white shadow-2xl backdrop-blur-xl";

export const CLASE_ITEM_MENU =
    "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] text-white/85 outline-none transition-colors focus:bg-white/10 focus:text-white data-[state=open]:bg-white/10 data-[state=open]:text-white data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40";

/** Pastilla fantasma de un color. */
export function pildora(color: string): CSSProperties {
    return { background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66` };
}

/** Paleta para categorías y listas. */
export const PALETA = [
    "#14B8A6",
    "#7C5CFF",
    "#007FFF",
    "#10B981",
    "#39FF14",
    "#FFBF00",
    "#F59E0B",
    "#F43F5E",
    "#EC4899",
    "#A78BFA",
    "#38BDF8",
    "#94A3B8",
];

/** Color siguiente de la paleta según cuántos elementos haya ya. */
export function colorSiguiente(n: number): string {
    return PALETA[((n % PALETA.length) + PALETA.length) % PALETA.length];
}

/** Resorte de los paneles y hojas. */
export const RESORTE = { type: "spring", stiffness: 380, damping: 32 } as const;

export function infoRelacion(id: TipoRelacion | undefined | null): RelacionInfo {
    return RELACIONES.find((r) => r.id === id) ?? RELACIONES[RELACIONES.length - 1];
}

export function infoNota(tipo: TipoNota | undefined | null): (typeof TIPOS_NOTA)[number] {
    return TIPOS_NOTA.find((t) => t.id === tipo) ?? TIPOS_NOTA[0];
}

/**
 * Movimiento reducido: la preferencia del sistema o el modo eco del OS
 * (`html[data-perf="eco"]`). Con cualquiera de los dos, nada de bucles ni desplazamientos.
 */
export function useMovimientoReducido(): boolean {
    const sistema = useReducedMotion();
    const [eco, setEco] = useState(false);
    useEffect(() => {
        if (typeof document === "undefined") return;
        const raiz = document.documentElement;
        const leer = () => setEco(raiz.getAttribute("data-perf") === "eco");
        leer();
        if (typeof MutationObserver === "undefined") return;
        const obs = new MutationObserver(leer);
        obs.observe(raiz, { attributes: true, attributeFilter: ["data-perf"] });
        return () => obs.disconnect();
    }, []);
    return Boolean(sistema) || eco;
}

export type Disposicion = "escritorio" | "tableta" | "movil";

/** Tres paneles en escritorio (≥1024 px), dos en tableta (≥768 px), pantallas apiladas en móvil. */
export function useDisposicion(): Disposicion {
    const [d, setD] = useState<Disposicion>("escritorio");
    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        const lg = window.matchMedia("(min-width: 1024px)");
        const md = window.matchMedia("(min-width: 768px)");
        const calcular = () => setD(lg.matches ? "escritorio" : md.matches ? "tableta" : "movil");
        calcular();
        lg.addEventListener?.("change", calcular);
        md.addEventListener?.("change", calcular);
        return () => {
            lg.removeEventListener?.("change", calcular);
            md.removeEventListener?.("change", calcular);
        };
    }, []);
    return d;
}
