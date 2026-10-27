// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Resumen de versiones upstream (Ola 1025R)
// ------------------------------------------------------------------------------
// Módulo PURO (sin node:*, sin red, sin reloj): traduce la respuesta de
// /api/library/actualizaciones a un resumen que una tarjeta de versión puede
// mostrar. La comparación automática de la ruta solo entiende SHA de commit;
// aquí etiquetas y releases también se comparan normalizando versiones
// («v0.10.0» ≡ «0.10.0», «@paquete@1.2.3» ≡ «1.2.3»), sin inventar ninguna.
// ════════════════════════════════════════════════════════════════════════════

import type { EstadoActualizacion } from "@/lib/library/actualizaciones";

/** Copia estructural de `FuenteActualizacion` (sin importar la ruta de Next). */
export interface FuenteVersion {
    id: string;
    instalada: string;
    remota: string | null;
    estado: EstadoActualizacion;
    fecha: string | null;
    upstream: string;
    aviso: string | null;
}

export type TonoVersion = "al-dia" | "novedad" | "sin-comprobar";

export interface ResumenVersion {
    id: string;
    tono: TonoVersion;
    texto: string;
    instalada: string;
    remota: string | null;
    fecha: string | null;
    upstream: string;
}

/* ───────────────────── Normalización de versiones ───────────────────── */

export function normalizarVersion(v: string): string {
    let s = v.toLowerCase().replace(/\s+/g, "");
    // «@cloudflare/computer@0.7.0» y «0.7.0» son la misma versión.
    const arroba = s.lastIndexOf("@");
    if (arroba >= 0) s = s.slice(arroba + 1);
    // Una «v» inicial seguida de dígito es prefijo de etiqueta, no versión.
    s = s.replace(/^v(\d)/, "$1");
    // Un SHA de 7 a 40 hexadecimales se queda con sus 7 primeros caracteres.
    if (/^[0-9a-f]{7,40}$/.test(s)) s = s.slice(0, 7);
    return s;
}

/* ───────────────────── Resumen de las fuentes ───────────────────── */

function tonoDe(f: FuenteVersion): TonoVersion {
    if (!f.remota) return "sin-comprobar";
    if (f.estado === "igual") return "al-dia";
    const instalada = normalizarVersion(f.instalada);
    const remota = normalizarVersion(f.remota);
    if (instalada && remota) return instalada === remota ? "al-dia" : "novedad";
    // Sin versión comparable se respeta el estado de la ruta (nunca se inventa).
    return f.estado === "hay-actualizacion" ? "novedad" : "sin-comprobar";
}

function textoDe(f: FuenteVersion, tono: TonoVersion): string {
    const fecha = f.fecha ? ` (${f.fecha})` : "";
    if (tono === "novedad" && f.remota) {
        return `Versión nueva publicada: ${f.remota} (la ficha tiene ${f.instalada})${fecha}`;
    }
    if (tono === "al-dia") {
        return `Al día (${f.instalada})${fecha}`;
    }
    return `No se pudo comprobar ahora${fecha}`;
}

export function resumirVersiones(
    fuentes: FuenteVersion[],
    idsInstalados: ReadonlySet<string>,
): ResumenVersion[] {
    return fuentes
        .filter((f) => idsInstalados.has(f.id))
        .map((f): ResumenVersion => {
            const tono = tonoDe(f);
            return {
                id: f.id,
                tono,
                texto: textoDe(f, tono),
                instalada: f.instalada,
                remota: f.remota,
                fecha: f.fecha,
                upstream: f.upstream,
            };
        });
}

export function contarNovedades(resumen: ResumenVersion[]): number {
    return resumen.filter((r) => r.tono === "novedad").length;
}
