"use client";

/**
 * Contexto y piezas pequeñas del panel «Pruebas» (PRB1111V): los datos de la última lectura, el estado del director
 * y la función que escribe una petición, para que cada bloque (build, control, aparatos, comprobaciones) las use sin
 * volver a pedirlas. Aquí también viven los átomos de la pantalla: sección, chip y las frases de «hace X».
 */

import { createContext, useContext, type ReactNode } from "react";

import type { PeticionVista, RespuestaVivo, VistaDirector } from "@/lib/mando/pruebas-vivas-tipos";

export interface Seguimiento {
    id: string;
    accion: string;
    /** Frase de lo que se pidió, para mostrarla aunque el director aún no la haya leído. */
    etiqueta: string;
    tPedida: number;
    prueba?: number | null;
    comprobacion?: string | null;
    plataforma?: string | null;
}

export interface ResultadoPedir {
    ok: boolean;
    id?: string;
    error?: string;
}

export interface ValorPruebas {
    datos: RespuestaVivo;
    ahora: number;
    director: VistaDirector;
    /** Se puede pedir al director: la Genesis local y un director que lee. */
    puedePedir: boolean;
    /** Por qué no, en una frase (vacío si se puede). */
    motivo: string;
    pedir: (cuerpo: Record<string, unknown>, etiqueta: string) => Promise<ResultadoPedir>;
    recargar: () => Promise<void>;
    seguimiento: Seguimiento[];
}

const Ctx = createContext<ValorPruebas | null>(null);

export function ProveedorPruebas({ valor, children }: { valor: ValorPruebas; children: ReactNode }) {
    return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function usePruebas(): ValorPruebas | null {
    return useContext(Ctx);
}

/** «hace 5 min» / «hace 2 h 10 min» / «hace 3 d» a partir de una fecha ISO; null si no hay fecha válida. */
export function haceTexto(iso: string | null | undefined, ahora: number): string | null {
    const t = iso ? Date.parse(iso) : NaN;
    if (!Number.isFinite(t)) return null;
    const m = Math.max(0, Math.round((ahora - t) / 60_000));
    if (m < 1) return "hace menos de 1 min";
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 48) return `hace ${h} h ${m % 60} min`;
    return `hace ${Math.floor(h / 24)} d`;
}

export function fechaCorta(iso: string | null | undefined): string {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(t) ? new Date(t).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "fecha desconocida";
}

/** Una cifra del banco: null = «no lo trae» (nunca 0). */
export function cifra(v: number | null | undefined, unidad = ""): string {
    return v === null || v === undefined ? "no lo trae" : `${v}${unidad}`;
}

export function Seccion({ titulo, id, children, pie }: { titulo: string; id: string; children: ReactNode; pie?: ReactNode }) {
    return (
        <section aria-label={titulo} data-testid={`pruebas-${id}`} className="min-w-0 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-white/50">{titulo}</h4>
            {children}
            {pie}
        </section>
    );
}

const COLOR: Record<string, string> = {
    ok: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    aviso: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    mal: "border-red-500/30 bg-red-500/15 text-red-300",
    info: "border-sky-500/30 bg-sky-500/15 text-sky-200",
    quieto: "border-zinc-500/30 bg-zinc-500/15 text-zinc-300",
};

export function Chip({ tono, children, ...resto }: { tono: keyof typeof COLOR; children: ReactNode } & React.HTMLAttributes<HTMLSpanElement>) {
    return (
        <span {...resto} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${COLOR[tono]}`}>
            {children}
        </span>
    );
}

export function estadoDePeticionTexto(p: Pick<PeticionVista, "estado" | "resultado"> | null, tPedida?: number, ahora?: number): { tono: keyof typeof COLOR; texto: string } {
    if (!p) {
        const hace = tPedida && ahora ? Math.max(0, Math.round((ahora - tPedida) / 1000)) : null;
        return { tono: "aviso", texto: `escrita${hace !== null ? ` hace ${hace < 90 ? `${hace} s` : `${Math.round(hace / 60)} min`}` : ""}; el director aún no la ha leído` };
    }
    if (p.estado === "hecha") return { tono: "ok", texto: `hecha${p.resultado ? `: ${p.resultado}` : ""}` };
    if (p.estado === "rechazada") return { tono: "mal", texto: `rechazada por el director${p.resultado ? `: ${p.resultado}` : " (sin motivo anotado)"}` };
    return { tono: "aviso", texto: p.estado === "escrita" ? "escrita; el director aún no la ha leído" : "el director la tiene; aún no la ha atendido" };
}

export function duracionDeLlamada(s: number | null | undefined): string {
    if (s === null || s === undefined) return "duración: no consta";
    return s < 90 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}
