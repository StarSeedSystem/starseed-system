/**
 * Pantalla de inicio sencilla (Ola 381 · INI2): los widgets básicos por defecto y su lista
 * editable, guardada POR PERFIL. PURO salvo el almacén (localStorage con guardas).
 * Solo acepta tipos que existan en WIDGET_MANIFEST: un tipo desconocido se descarta.
 */
import { WIDGET_MANIFEST } from "@/components/dashboard/widget-manifest";
import type { ClaseDispositivo } from "@/lib/widgets/forma/tamanos";

export const WIDGETS_INICIO_POR_DEFECTO = [
    "CLOCK_DATE", "WEATHER_BASIC", "NOTIFICATIONS", "MY_EVENTS",
    "QUICK_ACCESS", "SYSTEM_STATUS", "AURORA_LAST", "TASKS_QUICK",
] as const;

export type TamanoInicio = "micro" | "s" | "m" | "l" | "xl";
export interface ItemInicio { id: string; tipo: string; tamano: TamanoInicio }

export const CLAVE_WIDGETS_INICIO = "starseed.inicio.widgets.v1";
export const EVENTO_WIDGETS_INICIO = "starseed:inicio-widgets";
const ORDEN: TamanoInicio[] = ["micro", "s", "m", "l", "xl"];

export function tipoValido(tipo: string): boolean {
    return Object.prototype.hasOwnProperty.call(WIDGET_MANIFEST, tipo);
}

function mayor(t: TamanoInicio): TamanoInicio {
    return ORDEN[Math.min(ORDEN.length - 1, ORDEN.indexOf(t) + 1)];
}

/** Tamaño de fábrica de cada básico según el dispositivo. */
export function porDefecto(dispositivo: ClaseDispositivo): ItemInicio[] {
    const reloj: TamanoInicio = dispositivo === "movil" ? "l" : dispositivo === "tablet" ? "l" : "xl";
    const medianos = new Set(["WEATHER_BASIC", "NOTIFICATIONS", "AURORA_LAST"]);
    return WIDGETS_INICIO_POR_DEFECTO.map((tipo) => {
        let tamano: TamanoInicio = tipo === "CLOCK_DATE" ? reloj : medianos.has(tipo) ? "m" : "s";
        if (dispositivo === "tv" && tipo !== "CLOCK_DATE") tamano = mayor(tamano);
        return { id: `${tipo}-1`, tipo, tamano };
    });
}

function siguienteId(lista: ItemInicio[], tipo: string): string {
    let n = 1;
    const ids = new Set(lista.map((i) => i.id));
    while (ids.has(`${tipo}-${n}`)) n++;
    return `${tipo}-${n}`;
}

export function agregar(lista: ItemInicio[], tipo: string, tamano: TamanoInicio = "m"): ItemInicio[] {
    if (!tipoValido(tipo)) return lista;
    return [...lista, { id: siguienteId(lista, tipo), tipo, tamano }];
}

export function quitar(lista: ItemInicio[], id: string): ItemInicio[] {
    return lista.filter((i) => i.id !== id);
}

export function mover(lista: ItemInicio[], id: string, delta: number): ItemInicio[] {
    const i = lista.findIndex((x) => x.id === id);
    if (i < 0) return lista;
    const j = Math.max(0, Math.min(lista.length - 1, i + delta));
    if (i === j) return lista;
    const copia = [...lista];
    const [item] = copia.splice(i, 1);
    copia.splice(j, 0, item);
    return copia;
}

export function cambiarTamano(lista: ItemInicio[], id: string, tamano: TamanoInicio): ItemInicio[] {
    return lista.map((i) => (i.id === id ? { ...i, tamano } : i));
}

function sanear(lista: unknown): ItemInicio[] {
    if (!Array.isArray(lista)) return [];
    return lista.filter((i): i is ItemInicio =>
        !!i && typeof i.id === "string" && typeof i.tipo === "string" && tipoValido(i.tipo) && ORDEN.includes(i.tamano));
}

function leerAlmacen(): { v: 1; perfiles: Record<string, ItemInicio[]> } {
    try {
        if (typeof window === "undefined") return { v: 1, perfiles: {} };
        const j = JSON.parse(window.localStorage.getItem(CLAVE_WIDGETS_INICIO) || "null");
        return j && j.v === 1 && j.perfiles && typeof j.perfiles === "object" ? j : { v: 1, perfiles: {} };
    } catch {
        return { v: 1, perfiles: {} };
    }
}

/** La lista del perfil; si nunca la editó, los básicos de fábrica para este dispositivo. */
export function leerWidgetsInicio(perfilId: string, dispositivo: ClaseDispositivo): ItemInicio[] {
    const guardada = leerAlmacen().perfiles[perfilId];
    return guardada ? sanear(guardada) : porDefecto(dispositivo);
}

export function guardarWidgetsInicio(perfilId: string, lista: ItemInicio[]): void {
    try {
        if (typeof window === "undefined") return;
        const a = leerAlmacen();
        a.perfiles[perfilId] = sanear(lista);
        window.localStorage.setItem(CLAVE_WIDGETS_INICIO, JSON.stringify(a));
        window.dispatchEvent(new Event(EVENTO_WIDGETS_INICIO));
    } catch { /* almacenamiento bloqueado: la pantalla sigue con lo que tiene en memoria */ }
}
