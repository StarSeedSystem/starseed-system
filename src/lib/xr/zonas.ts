/**
 * StarSeed XR · ZONAS Y PORTALES (XR1010X · contrato `architecture/starseed-xr.md` §3 g y h).
 * Módulo PURO: sin React, red, DOM, reloj ni `node:*`. Responde a: ¿estoy dentro de una zona?,
 * ¿qué zonas he ganado o perdido (histéresis de 5 cm para no parpadear en el borde)?, ¿qué efectos
 * están activos? y ¿a qué ruta REAL lleva un portal? Rutas espejo de `rutaSalaXr` y de páginas que
 * ya existen: `/sala-xr/<id>`, `/estaciones/<id>` y `/servidores`. Nada inventado.
 */
import type { Vec3 } from "./tipos";
import type { DestinoPortal, PortalMundo, ZonaMundo } from "./mundo-tipos";
import { COLORES_NODO, CRISTAL, type NodoCardinal } from "./tokens-3d";
/** Margen del borde, en metros: entrar exige 5 cm dentro y salir, 5 cm fuera. */
export const HISTERESIS_M = 0.05;
/** Radio de una zona esférica: la esfera que envuelve la caja declarada en `tam`. */
export function radioDeZona(z: ZonaMundo): number {
    return Math.max(z.tam[0], z.tam[1], z.tam[2]) / 2;
}
function dentroConMargen(z: ZonaMundo, p: Vec3, margen: number): boolean {
    const dx = Math.abs(p[0] - z.pos[0]), dy = Math.abs(p[1] - z.pos[1]), dz = Math.abs(p[2] - z.pos[2]);
    if (z.forma === "esfera") {
        const r = Math.max(0, radioDeZona(z) + margen);
        return dx * dx + dy * dy + dz * dz <= r * r;
    }
    return dx <= Math.max(0, z.tam[0] / 2 + margen)
        && dy <= Math.max(0, z.tam[1] / 2 + margen)
        && dz <= Math.max(0, z.tam[2] / 2 + margen);
}
export const dentroDeZona = (z: ZonaMundo, p: Vec3): boolean => dentroConMargen(z, p, 0);
export interface CambiosZona { entra: string[]; sale: string[]; ahora: Set<string> }
/** Histéresis: quien ya estaba dentro sale 5 cm fuera; quien entra debe estar 5 cm dentro. */
export function cambiosDeZona(zonas: readonly ZonaMundo[], previas: ReadonlySet<string>, p: Vec3): CambiosZona {
    const ahora = new Set<string>();
    for (const z of zonas) if (dentroConMargen(z, p, previas.has(z.id) ? HISTERESIS_M : -HISTERESIS_M)) ahora.add(z.id);
    return { entra: [...ahora].filter((id) => !previas.has(id)), sale: [...previas].filter((id) => !ahora.has(id)), ahora };
}

export interface EfectosZona {
    silencio: boolean; audioPrivado: string | null; gravedadCero: boolean; zonaSegura: boolean; escenario: string | null;
}

/** Los efectos de todas las zonas activas se suman; dos zonas pueden pedir cosas a la vez. */
export function efectosActivos(zonas: readonly ZonaMundo[], ahora: ReadonlySet<string>): EfectosZona {
    const efectos: EfectosZona = { silencio: false, audioPrivado: null, gravedadCero: false, zonaSegura: false, escenario: null };
    for (const z of zonas) {
        if (!ahora.has(z.id)) continue;
        if (z.efecto === "silencio") efectos.silencio = true;
        else if (z.efecto === "audio-privado") efectos.audioPrivado ??= z.id;
        else if (z.efecto === "gravedad-cero") efectos.gravedadCero = true;
        else if (z.efecto === "zona-segura") efectos.zonaSegura = true;
        else if (z.efecto === "escenario") efectos.escenario ??= z.id;
    }
    return efectos;
}

/** Los puntos de reunión no cambian nada: sólo se anuncian al entrar. */
export function anuncioDeZona(z: ZonaMundo): string | null {
    return z.efecto === "punto-reunion" ? `Estás en el punto de reunión «${z.nombre}».` : null;
}

export interface EventoZona { tipo: "entra-zona" | "sale-zona"; zona: string }

/** Cambios de zona como disparadores del motor de reglas (`al-entrar`/`al-salir`). */
export function eventosDeZona(cambios: Pick<CambiosZona, "entra" | "sale">): EventoZona[] {
    return [...cambios.entra.map((zona): EventoZona => ({ tipo: "entra-zona", zona })),
        ...cambios.sale.map((zona): EventoZona => ({ tipo: "sale-zona", zona }))];
}

export type DestinoResuelto =
    | { tipo: "punto"; spawn: string }
    | { tipo: "ruta"; ruta: string; privado: boolean }
    | { tipo: "no-disponible"; motivo: string };

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const rutaSala = (id: string): string => `/sala-xr/${encodeURIComponent(id)}`; // espeja rutaSalaXr
const rutaEstacion = (id: string): string => `/estaciones/${encodeURIComponent(id)}`;

/** Un portal es privado sólo si lo declara (`privado: true`); si no lo dice, se trata como público. */
export function privadoDePortal(p: PortalMundo): boolean {
    return (p as PortalMundo & { privado?: unknown }).privado === true;
}

/** Destino real; sin id válido no se inventa una ruta, se dice que no está disponible. */
export function destinoDePortal(p: PortalMundo): DestinoResuelto {
    const d: DestinoPortal = p.destino;
    if (d.tipo === "punto") {
        const spawn = texto(d.spawn);
        return spawn ? { tipo: "punto", spawn } : { tipo: "no-disponible", motivo: "El portal no señala un punto de entrada válido." };
    }
    const id = texto(d.id);
    if (!id) return { tipo: "no-disponible", motivo: "El portal no indica a qué destino entrar." };
    const privado = privadoDePortal(p);
    if (d.tipo === "estacion") return { tipo: "ruta", ruta: rutaEstacion(id), privado };
    if (d.tipo === "servidor") return { tipo: "ruta", ruta: "/servidores", privado };
    return { tipo: "ruta", ruta: rutaSala(id), privado };
}

/** Confirmar sólo al entrar a un servidor o una sala PÚBLICA; mundo y estación van directo. */
export function requiereConfirmacion(portal: PortalMundo, destino: DestinoResuelto): destino is Extract<DestinoResuelto, { tipo: "ruta" }> {
    return destino.tipo === "ruta" && !destino.privado && (portal.destino.tipo === "servidor" || portal.destino.tipo === "sala");
}

/** Cardinal cuyo color de acento identifica el destino del portal en la escena. */
export function nodoDeDestino(d: DestinoPortal): NodoCardinal {
    if (d.tipo === "punto") return "zenith";
    if (d.tipo === "estacion") return "horizon";
    if (d.tipo === "servidor") return "logic";
    return "anchor";
}

export const acentoDeDestino = (d: DestinoPortal): string => COLORES_NODO[nodoDeDestino(d)].vivo;
/** Color honesto para un portal sin ruta: no finge un destino que no existe. */
export const ACENTO_SIN_DESTINO: string = CRISTAL.textoSecundario;

const distancia = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Portales cuyo radio contiene el punto (el cruce se confirma con `< radio`). */
export function portalesAlcanzados(portales: readonly PortalMundo[], p: Vec3): PortalMundo[] {
    return portales.filter((portal) => distancia(portal.pos, p) < portal.radio);
}
