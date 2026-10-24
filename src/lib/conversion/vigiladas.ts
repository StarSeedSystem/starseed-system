// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Conversión · carpetas vigiladas (módulo PURO)
// Reglas «carpeta de la Biblioteca → formato» (`starseed.conversion.vigiladas.v1`)
// y qué archivos nuevos convertir: sin repetir y sin bucles, porque una salida
// de conversión nunca se vuelve a convertir. Sin red, disco ni `node:*`.
// Contrato: `architecture/conversion-archivos.md`.
// ════════════════════════════════════════════════════════════════════════════

import { formatoDe, nombreDeSalida } from "./formatos";

export const CLAVE_VIGILADAS = "starseed.conversion.vigiladas.v1";
export const CLAVE_ESTADO_VIGILADAS = "starseed.conversion.vigiladas.estado.v1";
const MAX_SALIDAS = 500;

/** Lo que entra en `carpeta` (y sus subcarpetas) pasa a `a`. */
export type ReglaVigilada = { id: string; carpeta: string; a: string; calidad?: number; activa: boolean; subcarpetas: boolean };
export type ArchivoVigilado = { ruta: string; mtime?: number; tamano?: number };
export type EstadoVigiladas = { vistos: Record<string, string>; salidas: string[] };
export type ConversionPendiente = { reglaId: string; ruta: string; nombre: string; a: string; calidad?: number; salida: string };
export type DecisionVigiladas = { pendientes: ConversionPendiente[]; estado: EstadoVigiladas };

/** «C:\Fotos\..\Fotos\a.jpg» → «/Fotos/a.jpg»; sin control ni `..`. */
export function normalizarRuta(ruta: string): string {
    const crudo = String(ruta ?? "").replace(/\\/g, "/").replace(/^[A-Za-z]:/, "").replace(/[\u0000-\u001f]/g, "").trim();
    if (!crudo) return "";
    const partes: string[] = [];
    for (const p of crudo.split("/")) {
        if (!p || p === ".") continue;
        if (p === "..") partes.pop(); else partes.push(p);
    }
    return `/${partes.join("/")}`;
}

function carpetaDe(ruta: string): string {
    const i = ruta.lastIndexOf("/");
    return i <= 0 ? "/" : ruta.slice(0, i);
}

/** ¿La ruta está dentro de la carpeta? La carpeta misma no es un archivo. */
export function estaEnCarpeta(ruta: string, carpeta: string, subcarpetas = true): boolean {
    const r = normalizarRuta(ruta).toLowerCase(), c = normalizarRuta(carpeta).toLowerCase();
    if (!r || !c || r === c) return false;
    if (!subcarpetas) return carpetaDe(r) === c;
    return c === "/" ? r.startsWith("/") : r.startsWith(`${c}/`);
}

/** Limpia, valida y deduplica: una carpeta = una regla; el orden manda. */
function reglasValidas(lista: unknown): ReglaVigilada[] {
    if (!Array.isArray(lista)) return [];
    const out: ReglaVigilada[] = [], carpetas = new Set<string>(), ids = new Set<string>();
    for (const item of lista) {
        if (!item || typeof item !== "object") continue;
        const r = item as Record<string, unknown>;
        const carpeta = normalizarRuta(typeof r.carpeta === "string" ? r.carpeta : "");
        const a = formatoDe(typeof r.a === "string" ? r.a : "");
        const id = (typeof r.id === "string" && r.id.trim()) || carpeta;
        if (!carpeta || !a || carpetas.has(carpeta.toLowerCase()) || ids.has(id)) continue;
        const calidad = Number(r.calidad);
        carpetas.add(carpeta.toLowerCase());
        ids.add(id);
        out.push({
            id, carpeta, a,
            ...(Number.isInteger(calidad) && calidad >= 1 && calidad <= 100 ? { calidad } : {}),
            activa: r.activa !== false,
            subcarpetas: r.subcarpetas !== false,
        });
    }
    return out;
}

/** Lee las reglas guardadas; un JSON roto o viejo devuelve [] sin lanzar. */
export function leerVigiladas(crudo: string | null | undefined): ReglaVigilada[] {
    if (!crudo) return [];
    try {
        const datos: unknown = JSON.parse(crudo);
        const lista = Array.isArray(datos) ? datos : (datos && typeof datos === "object" ? (datos as { reglas?: unknown }).reglas : undefined);
        return reglasValidas(lista);
    } catch {
        return [];
    }
}

/** Serializa solo reglas válidas para `CLAVE_VIGILADAS`. */
export function serializarVigiladas(reglas: ReglaVigilada[]): string {
    return JSON.stringify({ v: 1, reglas: reglasValidas(reglas) });
}

function mejorRegla(ruta: string, reglas: ReglaVigilada[]): ReglaVigilada | null {
    let mejor: ReglaVigilada | null = null;
    for (const regla of reglas) {
        if (!regla.activa || !estaEnCarpeta(ruta, regla.carpeta, regla.subcarpetas)) continue;
        if (!mejor || regla.carpeta.length > mejor.carpeta.length) mejor = regla;
    }
    return mejor;
}

/** La regla que gobierna un archivo: gana la carpeta más concreta. */
export function reglaPara(ruta: string, reglas: ReglaVigilada[]): ReglaVigilada | null {
    return mejorRegla(normalizarRuta(ruta), reglasValidas(reglas));
}

/**
 * Qué convertir ahora. Nunca repite una firma ya vista, ni convierte un archivo
 * que ya está en el formato destino, ni una salida de conversión, ni pisa una
 * salida existente. El estado devuelto se guarda en `CLAVE_ESTADO_VIGILADAS`.
 */
export function decidirConversiones(
    reglas: ReglaVigilada[],
    archivos: ArchivoVigilado[],
    estado?: EstadoVigiladas | null,
): DecisionVigiladas {
    const validas = reglasValidas(reglas);
    const previo: EstadoVigiladas = estado && typeof estado === "object"
        ? { vistos: estado.vistos ?? {}, salidas: Array.isArray(estado.salidas) ? estado.salidas : [] }
        : { vistos: {}, salidas: [] };
    const lista = archivos
        .map((archivo) => ({ archivo, ruta: normalizarRuta(archivo.ruta) }))
        .filter((x) => Boolean(x.ruta))
        .sort((a, b) => a.ruta.localeCompare(b.ruta));
    const rutas = new Set(lista.map((x) => x.ruta));
    const salidas = new Set(previo.salidas);
    const vistos: Record<string, string> = {};
    const pendientes: ConversionPendiente[] = [];
    const salidasNuevas = new Set<string>();
    for (const { archivo, ruta } of lista) {
        const firma = `${Number.isFinite(archivo.mtime) ? archivo.mtime : "-"}:${Number.isFinite(archivo.tamano) ? archivo.tamano : "-"}`;
        vistos[ruta] = firma;
        if (salidas.has(ruta) || previo.vistos[ruta] === firma) continue;
        const regla = mejorRegla(ruta, validas);
        if (!regla) continue;
        const origen = formatoDe(ruta);
        if (!origen || origen === regla.a) continue;
        const carpeta = carpetaDe(ruta);
        const nombre = ruta.slice(ruta.lastIndexOf("/") + 1);
        const salida = `${carpeta === "/" ? "" : carpeta}/${nombreDeSalida(nombre, regla.a)}`;
        if (rutas.has(salida) || salidasNuevas.has(salida)) continue;
        salidasNuevas.add(salida);
        pendientes.push({
            reglaId: regla.id, ruta, nombre, a: regla.a,
            ...(regla.calidad ? { calidad: regla.calidad } : {}), salida,
        });
    }
    const recordadas = [...salidas, ...salidasNuevas].slice(-MAX_SALIDAS);
    return { pendientes, estado: { vistos, salidas: recordadas } };
}
