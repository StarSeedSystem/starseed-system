"use client";

/**
 * Abrir «Dónde se guarda y se procesa» desde CUALQUIER sitio del OS (menú contextual del
 * Explorador, una memoria, un modelo…) sin montar el diálogo allí: se lanza el evento global
 * `starseed:abrir-selector-medio` y `SelectorMedioGlobal` (montado donde vive el Explorador) lo
 * abre. El diálogo se carga a demanda la primera vez, así no pesa en el paquete de quien lo pide.
 */

import { Suspense, createElement, lazy, useEffect, useState } from "react";

import type { ElementoRef } from "@/lib/recursos-ia/tipos";

export const EVENTO_ABRIR_SELECTOR_MEDIO = "starseed:abrir-selector-medio";

export interface DetalleAbrirSelectorMedio {
    elemento: ElementoRef;
    /** Carpetas que lo contienen, de la más cercana a la raíz. */
    padres?: ElementoRef[];
}

function esElemento(x: unknown): x is ElementoRef {
    const e = x as ElementoRef | null;
    return !!e && typeof e === "object" && typeof e.id === "string" && typeof e.tipo === "string" && typeof e.nombre === "string";
}

/** Acepta `{ elemento, padres }` o un `ElementoRef` a secas. */
export function leerDetalle(detalle: unknown): DetalleAbrirSelectorMedio | null {
    if (esElemento(detalle)) return { elemento: detalle };
    const d = detalle as DetalleAbrirSelectorMedio | null;
    if (d && esElemento(d.elemento)) return { elemento: d.elemento, padres: Array.isArray(d.padres) ? d.padres.filter(esElemento) : undefined };
    return null;
}

export function abrirSelectorMedio(elemento: ElementoRef, padres?: ElementoRef[]): void {
    try {
        window.dispatchEvent(new CustomEvent<DetalleAbrirSelectorMedio>(EVENTO_ABRIR_SELECTOR_MEDIO, { detail: { elemento, padres } }));
    } catch {
        // sin ventana (SSR): nada que abrir
    }
}

/**
 * El `ElementoRef` de un ítem o una carpeta de la Biblioteca/Explorador y la cadena de carpetas que
 * lo contienen (de la más cercana a la raíz), para heredar el medio. Pura.
 */
export function refDeBiblioteca(
    kind: "item" | "folder",
    id: string,
    items: readonly { id: string; title: string; folderId?: string | null }[],
    carpetas: readonly { id: string; name: string; parentId: string | null }[],
): DetalleAbrirSelectorMedio | null {
    const porId = new Map(carpetas.map((c) => [c.id, c]));
    const cadena = (desde?: string | null): ElementoRef[] => {
        const out: ElementoRef[] = [];
        const vistos = new Set<string>();
        let c = desde ? porId.get(desde) : undefined;
        while (c && !vistos.has(c.id) && out.length < 64) {
            vistos.add(c.id);
            out.push({ tipo: "carpeta", id: c.id, nombre: c.name, padreId: c.parentId ?? undefined });
            c = c.parentId ? porId.get(c.parentId) : undefined;
        }
        return out;
    };
    if (kind === "item") {
        const it = items.find((x) => x.id === id);
        if (!it) return null;
        return { elemento: { tipo: "archivo", id: it.id, nombre: it.title, padreId: it.folderId ?? undefined }, padres: cadena(it.folderId) };
    }
    const c = porId.get(id);
    if (!c) return null;
    return { elemento: { tipo: "carpeta", id: c.id, nombre: c.name, padreId: c.parentId ?? undefined }, padres: cadena(c.parentId) };
}

/** Instancias montadas: solo la primera viva atiende el evento (nunca dos diálogos a la vez). */
const montados = new Set<symbol>();

const SelectorMedioDialogPerezoso = lazy(() => import("./selector-medio").then((m) => ({ default: m.SelectorMedioDialog })));

/** Escucha el evento y abre el diálogo. Móntalo una vez donde viva el Explorador. */
export function SelectorMedioGlobal() {
    const [detalle, setDetalle] = useState<DetalleAbrirSelectorMedio | null>(null);
    const [abierto, setAbierto] = useState(false);
    useEffect(() => {
        const yo = Symbol("selector-medio");
        montados.add(yo);
        const abrir = (ev: Event) => {
            if (montados.values().next().value !== yo) return;
            const d = leerDetalle((ev as CustomEvent).detail);
            if (!d) return;
            setDetalle(d);
            setAbierto(true);
        };
        window.addEventListener(EVENTO_ABRIR_SELECTOR_MEDIO, abrir);
        return () => {
            montados.delete(yo);
            window.removeEventListener(EVENTO_ABRIR_SELECTOR_MEDIO, abrir);
        };
    }, []);
    if (!detalle) return null;
    return createElement(
        Suspense,
        { fallback: null },
        createElement(SelectorMedioDialogPerezoso, {
            elemento: detalle.elemento,
            padres: detalle.padres,
            abierto,
            alCerrar: () => setAbierto(false),
        }),
    );
}
