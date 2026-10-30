/**
 * StarSeed XR · Zonas (calculadas). Módulo PURO: sin React, sin disco, sin red, sin DOM, sin `node:*`.
 * Funciones puras para zonas de mundo (caja o esfera) y efectos activos.
 * Debe calcularse dentro de `src/lib/xr/zonas.ts`.
 * Contracto (XR1010X §3 g,h): `dentroDeZona`, `cambiosDeZona`, `efectosActivos`, `destinoDePortal`.
 */

import type { ZonaMundo, PortalMundo, DestinoPortal } from "./mundo-tipos";
import type { Vec3 } from "./tipos";

/** Vec3 helper */
export const sumarVec3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const restarVec3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const escalarVec3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const magnitudVec3 = (a: Vec3): number => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);

/** Comprueba si un punto está dentro de una zona (caja alineada u esfera). La esfera ignora la escala del mundo. */
export const dentroDeZona = (z: ZonaMundo, p: Vec3): boolean => {
    const [px, py, pz] = p;
    const [zx, zy, zz] = z.pos;
    const mitad = escalarVec3(z.tam, 0.5);

    if (z.forma === "esfera") {
        const dx = px - zx;
        const dy = py - zy;
        const dz = pz - zz;
        return dx * dx + dy * dy + dz * dz <= mitad[0] * mitad[0];
    }

    const halfX = mitad[0];
    const halfY = mitad[1];
    const halfZ = mitad[2];
    return px >= zx - halfX && px <= zx + halfX &&
           py >= zy - halfY && py <= zy + halfY &&
           pz >= zz - halfZ && pz <= zz + halfZ;
};

/** Calcula zonas a las que se está entrando o saliendo (histéresis 5 cm) y el conjunto actual. */
export const cambiosDeZona = (
    zonas: ZonaMundo[],
    previas: Set<string>,
    p: Vec3
): { entra: string[]; sale: string[]; ahora: Set<string> } => {
    const ahoraSet = new Set<string>();
    const entra: string[] = [];
    const sale: string[] = [];

    zonas.forEach(z => {
        if (dentroDeZona(z, p)) {
            ahoraSet.add(z.id);
            if (!previas.has(z.id)) {
                entra.push(z.id);
            }
        }
    });

    previas.forEach(id => {
        if (!ahoraSet.has(id)) {
            sale.push(id);
        }
    });

    return { entra, sale, ahora: ahoraSet };
};

/** Efectos activos dados las zonas actuales (EFECTOS_ZONA → claves de efectosActivos). */
export const efectosActivos = (
    zonas: ZonaMundo[],
    ahora: Set<string>
): { silencio: boolean; audioPrivado: string | null; gravedadCero: boolean; zonaSegura: boolean; escenario: string | null } => {
    const activos = {
        silencio: false,
        audioPrivado: null as string | null,
        gravedadCero: false,
        zonaSegura: false,
        escenario: null as string | null,
    };

    ahora.forEach(id => {
        const z = zonas.find(z => z.id === id);
        if (!z) return;
        const efecto = z.efecto;

        if (efecto === "silencio") activos.silencio = true;
        else if (efecto === "audio-privado") activos.audioPrivado = z.nombre;
        else if (efecto === "gravedad-cero") activos.gravedadCero = true;
        else if (efecto === "zona-segura") activos.zonaSegura = true;
        else if (efecto === "escenario") activos.escenario = z.nombre;
    });

    return activos;
};

/** Normaliza un destino de portal: ruta de destino, público/índice del panel. */
export const destinoDePortal = (p: PortalMundo): { tipo: "punto"; spawn: string; } | { tipo: "ruta"; ruta: string; privado: boolean; } => {
    const destino = p.destino;

    if (destino.tipo === "punto") {
        return { tipo: "punto", spawn: destino.spawn };
    }

    switch (destino.tipo) {
        case "sala": {
            const ruta = `/salas/${destino.id}`;
            const privado = destino.id.startsWith(".priv") || destino.id.includes(".interno");
            return { tipo: "ruta", ruta, privado };
        }
        case "estacion": {
            const ruta = `/estaciones/${destino.id}`;
            const privado = destino.id.startsWith(".priv") || destino.id.includes(".interno");
            return { tipo: "ruta", ruta, privado };
        }
        case "servidor": {
            const ruta = `/servidores`;
            const privado = destino.id.startsWith(".priv") || destino.id.includes(".interno");
            return { tipo: "ruta", ruta, privado };
        }
        case "mundo": {
            const ruta = `/mundos/${destino.id}`;
            const privado = destino.id.startsWith(".priv") || destino.id.includes(".interno");
            return { tipo: "ruta", ruta, privado };
        }
        default:
            return { tipo: "ruta", ruta: "", privado: true };
    }
};