/**
 * ¿Cómo se conecta ESTA página de /metagenesis al motor? (2026-10-10)
 * ─────────────────────────────────────────────────────────────────────────────
 * Puro (todo lo de fuera entra por `deps`), para probarlo sin navegador ni Supabase. Orden:
 *   1. Abierta en la propia Mac (localhost) → «local»: no cambia nada.
 *   2. Sin sesión → «sin-sesion». No miembro → «no-miembro» (explicación y su Genesis).
 *   3. ¿La propia página la sirve la Mac (Wi‑Fi de casa, túnel viejo de Genesis)? Se sondea el
 *      mismo origen con el token: si contesta, «conectado» sin túnel nuevo.
 *   4. Si no, se lee la fila `metagenesis_motor` y se SONDEA la URL publicada con el token
 *      (aunque el latido sea viejo: manda lo medido). 200 → «conectado»; 401/403 →
 *      «rechazado»; sin respuesta → «mac-apagada» con el último latido.
 * SOP: architecture/metagenesis-remoto-tunel.md
 */

import {
    abiertoEnLaMac,
    leerFilaMotor,
    motorUrlValida,
    type LecturaMotor,
    type SondaMotor,
} from "@/lib/metagenesis/remoto";

export type FaseConexion =
    | { fase: "local" }
    | { fase: "sin-sesion" }
    | { fase: "no-miembro" }
    | {
          fase: "conectado";
          base: string;
          desde: "tunel" | "esta-pagina";
          maquina: string | null;
          /** Momento (ms) de la última sonda que contestó: la prueba de vida que se enseña. */
          comprobadoEn: number;
      }
    | { fase: "mac-apagada"; latidoHaceMs: number | null; motivo: string; maquina: string | null }
    | { fase: "rechazado"; estado?: number }
    | { fase: "sin-tabla"; motivo: string }
    | { fase: "error"; motivo: string };

export interface DepsConexion {
    hostname: string;
    origenPagina: string;
    hostsExtra: string[];
    token: (forzar?: boolean) => Promise<string | null>;
    acceso: () => Promise<{ miembro: boolean } | null>;
    leerMotor: () => Promise<LecturaMotor>;
    sondear: (base: string, token: string | null) => Promise<SondaMotor>;
    ahora: () => number;
}

export async function comprobarConexion(d: DepsConexion): Promise<FaseConexion> {
    if (abiertoEnLaMac(d.hostname)) return { fase: "local" };

    const token = await d.token(false);
    if (!token) return { fase: "sin-sesion" };
    const acceso = await d.acceso();
    if (!acceso) return { fase: "error", motivo: "No se pudo comprobar tu acceso a MetaGenesis (sin red o sin la tabla de accesos)." };
    if (!acceso.miembro) return { fase: "no-miembro" };

    // ¿Esta página la sirve la propia Mac? Entonces basta con mandar el token al mismo origen.
    const aqui = await d.sondear(d.origenPagina, token);
    if (aqui.ok) {
        return { fase: "conectado", base: d.origenPagina, desde: "esta-pagina", maquina: null, comprobadoEn: d.ahora() };
    }

    const lectura = await d.leerMotor();
    if (!lectura.ok) return lectura.sinTabla ? { fase: "sin-tabla", motivo: lectura.motivo } : { fase: "error", motivo: lectura.motivo };
    const fila = lectura.fila;
    const resumen = leerFilaMotor(fila, d.ahora(), d.hostsExtra);
    const base = fila?.encendido ? motorUrlValida(fila.url, { hostsExtra: d.hostsExtra }) : null;
    const maquina = fila?.maquina?.trim() || null;
    if (!base) return { fase: "mac-apagada", latidoHaceMs: resumen.latidoHaceMs, motivo: resumen.motivo, maquina };

    const sonda = await d.sondear(base, token);
    if (sonda.ok) {
        return { fase: "conectado", base, desde: "tunel", maquina, comprobadoEn: d.ahora() };
    }
    if (sonda.tipo === "rechazado") return { fase: "rechazado", estado: sonda.estado };
    return {
        fase: "mac-apagada",
        latidoHaceMs: resumen.latidoHaceMs,
        motivo: resumen.motivo || "El túnel de la Mac no contesta.",
        maquina,
    };
}
