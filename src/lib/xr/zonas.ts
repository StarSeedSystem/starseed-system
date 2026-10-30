/**
 * StarSeed XR · ZONAS Y PORTALES (XR1010X · contrato §3 g y h).
 * Decide si una persona está dentro de una zona (caja alineada o esfera), qué
 * cambia al entrar o salir (con 5 cm de histéresis), qué efectos están activos
 * y a dónde lleva cada portal. Las rutas son las que existen de verdad.
 * Módulo PURO: sin React, red, DOM ni `node:*`.
 */
import type { Vec3 } from "./tipos";
import type { DestinoPortal, PortalMundo, ZonaMundo } from "./mundo-tipos";
import { COLORES_NODO, type NodoCardinal } from "./tokens-3d";

/** Margen de histéresis en metros: 5 cm a cada lado del borde. */
export const HISTERESIS_M = 0.05;
export interface EfectosZona { silencio: boolean; audioPrivado: string | null; gravedadCero: boolean; zonaSegura: boolean; escenario: string | null }
export const SIN_EFECTOS: EfectosZona = { silencio: false, audioPrivado: null, gravedadCero: false, zonaSegura: false, escenario: null };
export interface CambioZonas { entra: string[]; sale: string[]; ahora: Set<string> }
export type ResultadoPortal = { tipo: "punto"; spawn: string } | { tipo: "ruta"; ruta: string; privado: boolean } | { tipo: "no-disponible"; motivo: string };
/** Un destino que la app conoce ahora mismo (mundo, estación, servidor o sala). */
export interface DestinoRegistrado { tipo: "mundo" | "estacion" | "servidor" | "sala"; id: string; ruta?: string; publico?: boolean }

/** ¿La posición cae dentro de la zona? `margen` amplía el borde (histéresis). */
export function dentroDeZona(z: ZonaMundo, p: Vec3, margen = 0): boolean {
    const dx = p[0] - z.pos[0], dy = p[1] - z.pos[1], dz = p[2] - z.pos[2];
    const extra = Number.isFinite(margen) ? Math.max(0, margen) : 0;
    if (z.forma === "esfera") {
        const radio = Math.min(z.tam[0], z.tam[1], z.tam[2]) / 2 + extra;
        return radio >= 0 && dx * dx + dy * dy + dz * dz <= radio * radio;
    }
    return Math.abs(dx) <= Math.max(0, z.tam[0]) / 2 + extra
        && Math.abs(dy) <= Math.max(0, z.tam[1]) / 2 + extra
        && Math.abs(dz) <= Math.max(0, z.tam[2]) / 2 + extra;
}

/** Zonas que se cruzan entre dos posiciones, con 5 cm de histéresis. */
export function cambiosDeZona(zonas: readonly ZonaMundo[], previas: ReadonlySet<string>, p: Vec3): CambioZonas {
    const entra: string[] = [], sale: string[] = [], ahora = new Set<string>();
    const vigentes = new Set(zonas.map((z) => z.id));
    for (const z of zonas) {
        const estaba = previas.has(z.id);
        if (!estaba && dentroDeZona(z, p)) { ahora.add(z.id); entra.push(z.id); }
        else if (estaba && !dentroDeZona(z, p, HISTERESIS_M)) sale.push(z.id);
        else if (estaba) ahora.add(z.id);
    }
    for (const id of previas) if (!vigentes.has(id)) sale.push(id);
    return { entra, sale, ahora };
}

/** Efectos que imponen las zonas activas; `punto-reunion` no impone ninguno. */
export function efectosActivos(zonas: readonly ZonaMundo[], ahora: ReadonlySet<string>): EfectosZona {
    const e: EfectosZona = { ...SIN_EFECTOS };
    for (const z of zonas) {
        if (!ahora.has(z.id)) continue;
        if (z.efecto === "silencio") e.silencio = true;
        else if (z.efecto === "audio-privado" && e.audioPrivado === null) e.audioPrivado = z.id;
        else if (z.efecto === "gravedad-cero") e.gravedadCero = true;
        else if (z.efecto === "zona-segura") e.zonaSegura = true;
        else if (z.efecto === "escenario" && e.escenario === null) e.escenario = z.id;
    }
    return e;
}

/** Ruta real de cada tipo de destino; `null` si el tipo no tiene ninguna. */
function rutaDe(tipo: string, id: string): string | null {
    if (tipo === "mundo" || tipo === "sala") return `/sala-xr/${encodeURIComponent(id)}`;
    if (tipo === "estacion") return `/estaciones/${encodeURIComponent(id)}`;
    if (tipo === "servidor") return "/servidores";
    return null;
}
const noDisponible = (motivo: string): ResultadoPortal => ({ tipo: "no-disponible", motivo });

/** A dónde lleva un portal. Con `conocidos`, un destino ausente deja de existir. */
export function destinoDePortal(p: PortalMundo, conocidos?: readonly DestinoRegistrado[]): ResultadoPortal {
    const d: DestinoPortal | undefined = p?.destino;
    if (!d || typeof d !== "object" || typeof d.tipo !== "string") return noDisponible("Este portal no tiene destino.");
    if (d.tipo === "punto") {
        return typeof d.spawn === "string" && d.spawn.length > 0
            ? { tipo: "punto", spawn: d.spawn }
            : noDisponible("Este portal apunta a un punto de entrada que ya no existe.");
    }
    const id = "id" in d && typeof d.id === "string" ? d.id : "";
    if (!id) return noDisponible("El destino del portal no tiene identificador.");
    const registrado = conocidos?.find((c) => c.tipo === d.tipo && c.id === id);
    if (conocidos && !registrado) return noDisponible(`El destino «${id}» ya no existe o no tienes acceso.`);
    const ruta = registrado?.ruta ?? rutaDe(d.tipo, id);
    if (!ruta) return noDisponible("Este tipo de destino aún no tiene una ruta en el OS.");
    return { tipo: "ruta", ruta, privado: registrado?.publico !== true };
}

/** ¿La persona ha cruzado el anillo del portal? */
export function dentroDePortal(p: PortalMundo, pos: Vec3): boolean {
    const radio = Number.isFinite(p.radio) ? Math.max(0, p.radio) : 0;
    const dx = pos[0] - p.pos[0], dy = pos[1] - p.pos[1], dz = pos[2] - p.pos[2];
    return dx * dx + dy * dy + dz * dz <= radio * radio;
}
export interface CrucesPortal { entran: PortalMundo[]; ahora: Set<string> }

/** Portales cuyo anillo se cruza al pasar de `previos` a `pos` (entrada, no estancia). */
export function portalesCruzados(portales: readonly PortalMundo[], previos: ReadonlySet<string>, pos: Vec3): CrucesPortal {
    const entran: PortalMundo[] = [], ahora = new Set<string>();
    for (const portal of portales) {
        if (!dentroDePortal(portal, pos)) continue;
        ahora.add(portal.id);
        if (!previos.has(portal.id)) entran.push(portal);
    }
    return { entran, ahora };
}

const NODO_POR_DESTINO: Record<DestinoPortal["tipo"], NodoCardinal> = { mundo: "zenith", estacion: "horizon", servidor: "logic", sala: "anchor", punto: "zenith" };

/** Color de acento del destino, tomado de los tokens (nunca escrito a mano). */
export function colorDeDestino(destino: DestinoPortal): string {
    return COLORES_NODO[NODO_POR_DESTINO[destino?.tipo] ?? "zenith"].vivo;
}
