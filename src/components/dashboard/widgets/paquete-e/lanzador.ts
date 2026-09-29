"use client";
/**
 * Lanzador de apps (paquete E) — lógica PURA + almacén local de fijadas y recientes.
 *
 * Buscar mientras escribes (sin acentos, por nombre, nombre corto, descripción y categoría), ordenar
 * con lo fijado primero y lo reciente después, y calcular cuántas teselas caben en la caja. Las
 * fijadas y recientes viven en localStorage y se comparten entre TODOS los lanzadores del tablero
 * (el dock de cada pestaña es otro lanzador): fijar en uno se ve en todos al instante.
 */
import { useSyncExternalStore } from "react";

export interface AppBuscable {
    id: string;
    name: string;
    short?: string;
    description: string;
    category: string;
}

/** minúsculas y sin diacríticos: «Café» y «cafe» son lo mismo. */
export function normalizarE(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const NOMBRE_CATEGORIA: Record<string, string> = {
    starseed: "StarSeed", sistema: "Sistema", media: "Medios", utilidad: "Utilidades", creacion: "Creación",
};

export function nombreCategoria(c: string): string {
    return NOMBRE_CATEGORIA[c] ?? c.charAt(0).toUpperCase() + c.slice(1);
}

/** Puntuación de una app para una consulta (0 = no casa). */
export function puntuarApp(app: AppBuscable, consulta: string): number {
    const q = normalizarE(consulta);
    if (!q) return 1;
    const nombre = normalizarE(app.name);
    const corto = normalizarE(app.short ?? "");
    if (nombre === q || corto === q) return 100;
    if (nombre.startsWith(q) || corto.startsWith(q)) return 80;
    const palabras = `${nombre} ${corto}`.split(/[\s\-·/]+/);
    if (palabras.some((p) => p.startsWith(q))) return 60;
    if (nombre.includes(q) || corto.includes(q)) return 40;
    if (normalizarE(nombreCategoria(app.category)).startsWith(q) || normalizarE(app.category).startsWith(q)) return 25;
    // Todas las palabras de la consulta en la descripción (búsqueda por intención: «mensajes», «musica»).
    const desc = normalizarE(app.description);
    const trozos = q.split(/\s+/).filter(Boolean);
    if (trozos.length && trozos.every((t) => desc.includes(t))) return 15;
    return 0;
}

/** Apps que casan, de más a menos relevante (estable: a igual puntuación, el orden de entrada). */
export function buscarApps<T extends AppBuscable>(apps: readonly T[], consulta: string): T[] {
    if (!normalizarE(consulta)) return [...apps];
    return apps
        .map((a, i) => ({ a, i, p: puntuarApp(a, consulta) }))
        .filter((x) => x.p > 0)
        .sort((x, y) => y.p - x.p || x.i - y.i)
        .map((x) => x.a);
}

export interface Reciente { id: string; t: number }

/** Añade (o sube) una app a recientes; como mucho `max`. */
export function registrarReciente(lista: readonly Reciente[], id: string, ahora: number, max = 12): Reciente[] {
    return [{ id, t: ahora }, ...lista.filter((r) => r.id !== id)].slice(0, max);
}

export function alternarFijada(lista: readonly string[], id: string): string[] {
    return lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
}

/** Fijadas primero (en su orden), luego recientes (lo último antes), luego el resto como venía. */
export function ordenarParaLanzador<T extends { id: string }>(apps: readonly T[], fijadas: readonly string[], recientes: readonly Reciente[]): T[] {
    const porId = new Map(apps.map((a) => [a.id, a]));
    const vistos = new Set<string>();
    const fuera: T[] = [];
    const meter = (id: string) => {
        const a = porId.get(id);
        if (a && !vistos.has(id)) { vistos.add(id); fuera.push(a); }
    };
    fijadas.forEach(meter);
    [...recientes].sort((a, b) => b.t - a.t).forEach((r) => meter(r.id));
    apps.forEach((a) => meter(a.id));
    return fuera;
}

/** Cuántas columnas y filas de teselas caben (con un mínimo sensato si aún no hay medida). */
export function rejillaPara(ancho: number, alto: number, tesela: number, hueco: number, porDefecto = { columnas: 4, filas: 2 }) {
    if (!(ancho > 0) || !(alto > 0)) return porDefecto;
    const columnas = Math.max(1, Math.floor((ancho + hueco) / (tesela + hueco)));
    const filas = Math.max(1, Math.floor((alto + hueco) / (tesela + hueco)));
    return { columnas, filas };
}

/** Índice destino al mover con flechas en una rejilla de `columnas` (sin salirse). */
export function moverEnRejilla(indice: number, tecla: string, columnas: number, total: number): number {
    if (total <= 0) return 0;
    const c = Math.max(1, columnas);
    let j = indice;
    if (tecla === "ArrowRight") j = indice + 1;
    else if (tecla === "ArrowLeft") j = indice - 1;
    else if (tecla === "ArrowDown") j = indice + c;
    else if (tecla === "ArrowUp") j = indice - c;
    else if (tecla === "Home") j = 0;
    else if (tecla === "End") j = total - 1;
    return Math.max(0, Math.min(total - 1, j));
}

// ── Almacén local compartido ─────────────────────────────────────────

export const CLAVE_FIJADAS = "starseed.lanzador.fijadas.v1";
export const CLAVE_RECIENTES = "starseed.lanzador.recientes.v1";
const EVENTO = "starseed:lanzador";

interface EstadoLanzador { fijadas: string[]; recientes: Reciente[] }
const VACIO: EstadoLanzador = { fijadas: [], recientes: [] };
let cache: EstadoLanzador | null = null;

function leer(): EstadoLanzador {
    if (typeof window === "undefined") return VACIO;
    if (cache) return cache;
    try {
        const f = JSON.parse(window.localStorage.getItem(CLAVE_FIJADAS) ?? "[]");
        const r = JSON.parse(window.localStorage.getItem(CLAVE_RECIENTES) ?? "[]");
        cache = {
            fijadas: Array.isArray(f) ? f.filter((x): x is string => typeof x === "string") : [],
            recientes: Array.isArray(r) ? r.filter((x): x is Reciente => !!x && typeof x.id === "string" && typeof x.t === "number") : [],
        };
    } catch {
        cache = { fijadas: [], recientes: [] };
    }
    return cache;
}

function escribir(siguiente: EstadoLanzador) {
    cache = siguiente;
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(CLAVE_FIJADAS, JSON.stringify(siguiente.fijadas));
        window.localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(siguiente.recientes));
    } catch { /* almacenamiento lleno o bloqueado: queda en memoria */ }
    try { window.dispatchEvent(new CustomEvent(EVENTO)); } catch { /* sin eventos */ }
}

function suscribir(cb: () => void) {
    if (typeof window === "undefined") return () => undefined;
    const alCambiar = () => { cache = null; cb(); };
    const alAlmacen = (e: StorageEvent) => { if (e.key === CLAVE_FIJADAS || e.key === CLAVE_RECIENTES) alCambiar(); };
    window.addEventListener(EVENTO, cb);
    window.addEventListener("storage", alAlmacen);
    return () => { window.removeEventListener(EVENTO, cb); window.removeEventListener("storage", alAlmacen); };
}

export function useLanzadorLocal() {
    const estado = useSyncExternalStore(suscribir, leer, () => VACIO);
    return {
        fijadas: estado.fijadas,
        recientes: estado.recientes,
        fijar: (id: string) => escribir({ ...leer(), fijadas: alternarFijada(leer().fijadas, id) }),
        anotarReciente: (id: string) => escribir({ ...leer(), recientes: registrarReciente(leer().recientes, id, Date.now()) }),
        olvidarReciente: (id: string) => escribir({ ...leer(), recientes: leer().recientes.filter((r) => r.id !== id) }),
    };
}

/** Solo para pruebas. */
export function _reiniciarLanzadorLocal() { cache = null; }
