"use client";
/**
 * Piezas del paquete «Inicio» (ola 0929 · F): lo que comparten los ocho widgets libres de la
 * pestaña de inicio y que no está en `comun.tsx` (que es de todos y no se toca aquí).
 *
 * - `useEnPantalla`: la pestaña a la vista Y el widget en pantalla → los relojes y sondeos se
 *   paran cuando nadie mira (regla de consumo y de batería).
 * - `useAhoraVivo`: la hora que late al ritmo pedido, alineada al segundo/minuto y en pausa fuera
 *   de pantalla.
 * - `useDispositivo`: móvil / tablet / escritorio / TV, para tipografía, objetivos de 44 px y
 *   anillos de foco (en TV no hay «hover»).
 * - `useClaseForzada`: si un MarcoUnificado envuelve al widget, manda SU clase de tamaño.
 * - `useJSONLocal`: un valor JSON en localStorage compartido entre instancias (misma pestaña y
 *   otras pestañas), que nunca lanza.
 * - `Accion`: la pastilla de acción con etiqueta completa, icono y foco visible.
 * - `Anillo`: el anillo de progreso con degradado del acento (datos, no decoración).
 */
import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { useMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import { dispositivoActual, type ClaseDispositivo, type ClaseTamano } from "@/lib/widgets/forma/tamanos";

// ── Visibilidad ─────────────────────────────────────────────────────────────────────────────

function pestanaVisible(): boolean {
    return typeof document === "undefined" || document.visibilityState !== "hidden";
}

/** `[ref, visible]`: visible = pestaña a la vista y el elemento dentro de la pantalla. */
export function useEnPantalla<T extends Element = HTMLDivElement>(): [(el: T | null) => void, boolean] {
    const [el, setEl] = React.useState<T | null>(null);
    const [doc, setDoc] = React.useState(true);
    const [cruza, setCruza] = React.useState(true);
    React.useEffect(() => {
        const cambio = () => setDoc(pestanaVisible());
        cambio();
        document.addEventListener("visibilitychange", cambio);
        return () => document.removeEventListener("visibilitychange", cambio);
    }, []);
    React.useEffect(() => {
        if (!el || typeof IntersectionObserver === "undefined") return;
        const io = new IntersectionObserver((e) => setCruza(e.some((x) => x.isIntersecting)), { rootMargin: "64px" });
        io.observe(el);
        return () => io.disconnect();
    }, [el]);
    return [setEl, doc && cruza];
}

/**
 * La hora viva (`null` hasta montar, para no romper la hidratación). Late cada `intervaloMs`,
 * alineada al borde (al segundo o al minuto) y se para mientras `activo` sea false; al volver,
 * se pone al día al instante.
 */
export function useAhoraVivo(intervaloMs = 60_000, activo = true): Date | null {
    const [ahora, setAhora] = React.useState<Date | null>(null);
    React.useEffect(() => {
        setAhora(new Date());
        if (!activo) return;
        let intervalo: number | undefined;
        const espera = intervaloMs - (Date.now() % intervaloMs) + 15;
        const t = window.setTimeout(() => {
            setAhora(new Date());
            intervalo = window.setInterval(() => setAhora(new Date()), intervaloMs);
        }, espera);
        return () => { window.clearTimeout(t); if (intervalo) window.clearInterval(intervalo); };
    }, [intervaloMs, activo]);
    return ahora;
}

// ── Dispositivo y tamaño ────────────────────────────────────────────────────────────────────

/** Clase del dispositivo (escritorio hasta montar); se recalcula al girar o redimensionar. */
export function useDispositivo(): ClaseDispositivo {
    const [d, setD] = React.useState<ClaseDispositivo>("escritorio");
    React.useEffect(() => {
        let t: number | undefined;
        const medir = () => setD(dispositivoActual());
        const diferido = () => { window.clearTimeout(t); t = window.setTimeout(medir, 250); };
        medir();
        window.addEventListener("resize", diferido);
        return () => { window.clearTimeout(t); window.removeEventListener("resize", diferido); };
    }, []);
    return d;
}

/** Táctil o TV: objetivos de 44 px y acciones siempre visibles (sin depender del cursor). */
export const esTactil = (d: ClaseDispositivo) => d === "movil" || d === "tablet" || d === "tv" || d === "xr";
/** Multiplicador tipográfico: la TV se mira de lejos. */
export const escalaTipo = (d: ClaseDispositivo) => (d === "tv" ? 1.25 : d === "xr" ? 1.15 : 1);

/** La clase del MarcoUnificado que nos envuelve, si lo hay (manda sobre la medida propia). */
export function useClaseForzada(): ClaseTamano | null {
    return useMarcoUnificado()?.clase ?? null;
}

// ── Almacén local compartido ────────────────────────────────────────────────────────────────

const EVENTO_ALMACEN = "starseed:inicio-almacen";

export function leerJSON<T>(clave: string, defecto: T): T {
    if (typeof window === "undefined") return defecto;
    try {
        const crudo = window.localStorage.getItem(clave);
        return crudo ? (JSON.parse(crudo) as T) : defecto;
    } catch {
        return defecto;
    }
}

export function escribirJSON<T>(clave: string, valor: T): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(clave, JSON.stringify(valor));
        window.dispatchEvent(new CustomEvent(EVENTO_ALMACEN, { detail: clave }));
    } catch { /* cuota llena o almacén bloqueado: seguimos sin guardar */ }
}

/** Valor JSON en localStorage, reactivo entre instancias y pestañas. `defecto` hasta montar. */
export function useJSONLocal<T>(clave: string, defecto: T): [T, (siguiente: T | ((previo: T) => T)) => void] {
    const defectoRef = React.useRef(defecto);
    const [valor, setValor] = React.useState<T>(defecto);
    React.useEffect(() => {
        const leer = () => setValor(leerJSON(clave, defectoRef.current));
        const propio = (e: Event) => { if ((e as CustomEvent<string>).detail === clave) leer(); };
        const otro = (e: StorageEvent) => { if (e.key === clave) leer(); };
        leer();
        window.addEventListener(EVENTO_ALMACEN, propio);
        window.addEventListener("storage", otro);
        return () => { window.removeEventListener(EVENTO_ALMACEN, propio); window.removeEventListener("storage", otro); };
    }, [clave]);
    const guardar = React.useCallback((siguiente: T | ((previo: T) => T)) => {
        const previo = leerJSON(clave, defectoRef.current);
        const nuevo = typeof siguiente === "function" ? (siguiente as (p: T) => T)(previo) : siguiente;
        setValor(nuevo);
        escribirJSON(clave, nuevo);
    }, [clave]);
    return [valor, guardar];
}

// ── Pastilla de acción ──────────────────────────────────────────────────────────────────────

export interface AccionProps {
    children: React.ReactNode;
    icono?: LucideIcon;
    color?: string;
    href?: string;
    onClick?: (e: React.MouseEvent) => void;
    /** Objetivo táctil de 44 px (móvil, tablet, TV). */
    grande?: boolean;
    /** Relleno más intenso: la acción principal del widget. */
    principal?: boolean;
    disabled?: boolean;
    title?: string;
    "aria-label"?: string;
    className?: string;
}

/** Acción con su etiqueta completa: nunca un botón recortado ni un icono mudo. */
export function Accion({ children, icono: Icono, color = "#7c5cff", href, onClick, grande, principal, disabled, className = "", ...resto }: AccionProps) {
    const clases = `ss-redondo inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold text-white transition-[transform,background-color] duration-200 hover:scale-[1.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${grande ? "min-h-11 px-4 text-[14px]" : "min-h-7 px-3 text-[12px]"} ${className}`;
    const estilo: React.CSSProperties = {
        background: principal ? `linear-gradient(135deg, ${color}66, ${color}33)` : `${color}1f`,
        boxShadow: `inset 0 0 0 1px ${color}${principal ? "99" : "59"}${principal ? `, 0 6px 18px -8px ${color}aa` : ""}`,
        outlineColor: color,
    };
    const contenido = <>{Icono && <Icono aria-hidden className={`shrink-0 ${grande ? "size-4" : "size-3.5"}`} />}<span>{children}</span></>;
    if (href && !disabled) {
        return <Link href={href} className={clases} style={estilo} onClick={onClick} {...resto}>{contenido}</Link>;
    }
    return <button type="button" className={clases} style={estilo} onClick={onClick} disabled={disabled} {...resto}>{contenido}</button>;
}

// ── Anillo de progreso ──────────────────────────────────────────────────────────────────────

export interface AnilloProps {
    /** 0-1 (se recorta). */
    valor: number;
    tam: number;
    grosor?: number;
    color: string;
    color2?: string;
    /** Opacidad de la pista. */
    pista?: number;
    children?: React.ReactNode;
    etiqueta?: string;
}

/** Anillo de progreso con degradado del acento y la punta encendida. */
export function Anillo({ valor, tam, grosor = Math.max(3, tam * 0.08), color, color2 = color, pista = 0.14, children, etiqueta }: AnilloProps) {
    const id = React.useId().replace(/:/g, "");
    const v = Math.max(0, Math.min(1, Number.isFinite(valor) ? valor : 0));
    const r = Math.max(0.5, (tam - grosor) / 2), c = 2 * Math.PI * r;
    const fin = { x: tam / 2 + r * Math.sin(v * 2 * Math.PI), y: tam / 2 - r * Math.cos(v * 2 * Math.PI) };
    return (
        <div className="relative grid shrink-0 place-items-center" style={{ width: tam, height: tam }}
            role={etiqueta ? "img" : undefined} aria-label={etiqueta}>
            <svg aria-hidden width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} className="absolute inset-0 overflow-visible">
                <defs>
                    <linearGradient id={`an-${id}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={color2} />
                        <stop offset="100%" stopColor={color} />
                    </linearGradient>
                </defs>
                <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="#ffffff" strokeOpacity={pista} strokeWidth={grosor} />
                {v > 0 && (
                    <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={`url(#an-${id})`} strokeWidth={grosor} strokeLinecap="round"
                        strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${tam / 2} ${tam / 2})`}
                        style={{ transition: "stroke-dasharray .6s cubic-bezier(.22,1,.36,1)" }} />
                )}
                {v > 0 && v < 1 && tam > grosor * 2 && <circle cx={fin.x} cy={fin.y} r={grosor * 0.62} fill="#ffffff" opacity={0.9} />}
            </svg>
            <div className="relative flex flex-col items-center justify-center text-center">{children}</div>
        </div>
    );
}

/** «hace 5 min», «hace 3 h», «ayer», «el 2 oct»: tiempo relativo corto y humano. */
export function haceCuanto(ts: number, ahora = Date.now()): string {
    const s = Math.max(0, Math.round((ahora - ts) / 1000));
    if (s < 60) return "ahora";
    const m = Math.round(s / 60);
    if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    if (d === 1) return "ayer";
    if (d < 7) return `hace ${d} días`;
    return `el ${new Date(ts).toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "")}`;
}

/** «14:32» en la hora local del dispositivo (o «—» sin dato). */
export const horaCorta = (d: Date | null | undefined) => (d ? d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "—");
