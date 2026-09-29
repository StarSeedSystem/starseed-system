/**
 * Multiverso · piezas PURAS (Ola 0929-C).
 *
 * Los «mundos» son tus espacios REALES de tipo escena 3D y sala de juegos (`os_spaces`, ver
 * `gen5/_catalogo/espacios.ts`); los portales son las rutas inmersivas que ya existen en el OS.
 */
import type { Espacio } from "../gen5/_catalogo/espacios";

export type ClavePortal = "avatares" | "red3d" | "xr" | "sala";

export interface Portal { clave: ClavePortal; nombre: string; detalle: string; ruta: string; color: string }

export const PORTALES: Portal[] = [
    { clave: "avatares", nombre: "Mundo de avatares", detalle: "Los habitantes de la red en 3D", ruta: "/mundo-avatares", color: "#22d3ee" },
    { clave: "red3d", nombre: "Red 3D", detalle: "Tu red y sus conexiones en el espacio", ruta: "/red-3d", color: "#a78bfa" },
    { clave: "xr", nombre: "Hub XR", detalle: "Todo tu mundo en VR y AR", ruta: "/xr", color: "#DC143C" },
    { clave: "sala", nombre: "Sala VR/AR", detalle: "Crea o abre una sala compartida", ruta: "/sala-xr", color: "#F97316" },
];

export const COLOR_MUNDO = { escena: "#F97316", juego: "#a855f7" } as const;

export function mundosDe(espacios: Espacio[] | null | undefined): Espacio[] {
    return (espacios ?? []).filter((e) => e.tipo === "escena" || e.tipo === "juego");
}

/**
 * Dónde se sienta cada mundo en las dos órbitas: las escenas en la exterior y las salas de
 * juego en la interior, repartidas a partes iguales (con un desfase para que no se alineen).
 * Devuelve el ángulo (radianes) y la órbita (0 interior, 1 exterior). Máximo 12 por órbita.
 */
export function asientos(mundos: Pick<Espacio, "tipo">[]): { angulo: number; orbita: 0 | 1 }[] {
    const ext = mundos.filter((m) => m.tipo !== "juego").length;
    const int = mundos.length - ext;
    let ie = 0, ii = 0;
    return mundos.map((m) => {
        if (m.tipo === "juego") {
            const n = Math.min(int, 12);
            return { angulo: ((ii++ % 12) / Math.max(1, n)) * Math.PI * 2 + Math.PI / 5, orbita: 0 as const };
        }
        const n = Math.min(ext, 12);
        return { angulo: ((ie++ % 12) / Math.max(1, n)) * Math.PI * 2 + Math.PI / 2.6, orbita: 1 as const };
    });
}

export interface SoporteXR { api: boolean; vr: boolean; ar: boolean }

let sondeoXR: Promise<SoporteXR> | null = null;

/** Qué sabe hacer ESTE dispositivo (WebXR). Se pregunta una vez por pestaña. */
export function detectarXR(): Promise<SoporteXR> {
    sondeoXR ??= (async () => {
        const xr = typeof navigator !== "undefined" ? (navigator as Navigator & { xr?: { isSessionSupported?: (m: string) => Promise<boolean> } }).xr : undefined;
        if (!xr?.isSessionSupported) return { api: false, vr: false, ar: false };
        const pedir = (m: string) => xr.isSessionSupported!(m).catch(() => false);
        const [vr, ar] = await Promise.all([pedir("immersive-vr"), pedir("immersive-ar")]);
        return { api: true, vr, ar };
    })();
    return sondeoXR;
}

/** Solo para pruebas. */
export function _olvidarXR() { sondeoXR = null; }
