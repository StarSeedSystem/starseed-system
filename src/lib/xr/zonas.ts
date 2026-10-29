/**
 * StarSeed XR · ZONAS Y PORTALES (XR1010X · contrato §3 g y h).
 * Módulo PURO: sin React, sin red, sin DOM ni `node:*`. Decide si una persona está dentro de una zona
 * (caja alineada o esfera), qué cambia al entrar o salir con 5 cm de histéresis, qué efectos están
 * activos y a qué ruta real lleva cada portal. Ninguna ruta se inventa: si no existe, se dice.
 */
import type { Vec3 } from "./tipos";
import type { DestinoPortal, PortalMundo, ZonaMundo } from "./mundo-tipos";

/** Margen de histéresis en metros: evita parpadear justo en el borde de una zona. */
export const HISTERESIS_M = 0.05;

export interface EfectosZona {
    silencio: boolean;
    audioPrivado: string | null;
    gravedadCero: boolean;
    zonaSegura: boolean;
    escenario: string | null;
}

export type DestinoResuelto =
    | { tipo: "punto"; spawn: string }
    | { tipo: "ruta"; ruta: string; privado: boolean }
    | { tipo: "no-disponible"; motivo: string };

export interface CambioZonas {
    entra: string[];
    sale: string[];
    ahora: Set<string>;
}

function radioEsfera(z: ZonaMundo): number {
    return Math.max(z.tam[0], z.tam[1], z.tam[2]) / 2;
}

function dentroConMargen(z: ZonaMundo, p: Vec3, margen: number): boolean {
    const dx = Math.abs(p[0] - z.pos[0]);
    const dy = Math.abs(p[1] - z.pos[1]);
    const dz = Math.abs(p[2] - z.pos[2]);
    if (z.forma === "esfera") {
        const r = radioEsfera(z) + margen;
        return dx * dx + dy * dy + dz * dz <= r * r;
    }
    return dx <= z.tam[0] / 2 + margen && dy <= z.tam[1] / 2 + margen && dz <= z.tam[2] / 2 + margen;
}

/** ¿El punto está dentro de la zona? La caja usa `tam` como tamaño completo; la esfera, su mayor lado como diámetro. */
export function dentroDeZona(z: ZonaMundo, p: Vec3): boolean {
    return dentroConMargen(z, p, 0);
}

/** Entra y sale de cada zona con histéresis: quien ya estaba dentro aguanta 5 cm más allá del borde. */
export function cambiosDeZona(zonas: readonly ZonaMundo[], previas: ReadonlySet<string>, p: Vec3): CambioZonas {
    const ahora = new Set<string>();
    for (const z of zonas) {
        const margen = previas.has(z.id) ? HISTERESIS_M : 0;
        if (dentroConMargen(z, p, margen)) ahora.add(z.id);
    }
    const entra: string[] = [];
    const sale: string[] = [];
    for (const id of ahora) if (!previas.has(id)) entra.push(id);
    for (const id of previas) if (!ahora.has(id)) sale.push(id);
    return { entra, sale, ahora };
}

export function efectosActivos(zonas: readonly ZonaMundo[], ahora: ReadonlySet<string>): EfectosZona {
    const activas = zonas.filter((z) => ahora.has(z.id));
    const con = (efecto: ZonaMundo["efecto"]): string | null => activas.find((z) => z.efecto === efecto)?.id ?? null;
    return {
        silencio: activas.some((z) => z.efecto === "silencio"),
        audioPrivado: con("audio-privado"),
        gravedadCero: activas.some((z) => z.efecto === "gravedad-cero"),
        zonaSegura: activas.some((z) => z.efecto === "zona-segura"),
        escenario: con("escenario"),
    };
}

/** El único efecto que no cambia nada pero se anuncia al entrar: el punto de reunión. */
export function anuncioDeEntrada(z: ZonaMundo | undefined): string | null {
    if (!z || z.efecto !== "punto-reunion") return null;
    return `Punto de reunión: ${z.nombre}`;
}

function privadoDe(p: PortalMundo): boolean {
    const conMarca = p as PortalMundo & { privado?: unknown };
    const enDestino = p.destino as DestinoPortal & { privado?: unknown };
    return conMarca.privado === true || enDestino.privado === true;
}

function ruta(base: string, privado: boolean): DestinoResuelto {
    return { tipo: "ruta", ruta: base, privado };
}

/** Ruta real del destino de un portal. Un id vacío o un tipo sin página devuelve `no-disponible`. */
export function destinoDePortal(p: PortalMundo): DestinoResuelto {
    const d = p.destino;
    if (!d) return { tipo: "no-disponible", motivo: "El portal no declara a dónde lleva." };
    if (d.tipo === "punto") {
        return typeof d.spawn === "string" && d.spawn.trim()
            ? { tipo: "punto", spawn: d.spawn }
            : { tipo: "no-disponible", motivo: "El punto de entrada del portal no tiene id." };
    }
    const id = typeof d.id === "string" ? d.id.trim() : "";
    if (!id) return { tipo: "no-disponible", motivo: `El portal no dice a qué ${d.tipo} lleva.` };
    const cod = encodeURIComponent(id);
    switch (d.tipo) {
        case "mundo":
        case "sala":
            return ruta(`/sala-xr/${cod}`, privadoDe(p));
        case "estacion":
            return ruta(`/estaciones/${cod}`, privadoDe(p));
        case "servidor":
            return ruta("/servidores", privadoDe(p));
        default:
            return { tipo: "no-disponible", motivo: "Ese tipo de destino todavía no tiene ruta en el OS." };
    }
}
