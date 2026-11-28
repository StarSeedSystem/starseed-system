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
    CANDIDATOS_MOTOR_LOCAL,
    esAppNativaLocal,
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
          desde: "tunel" | "esta-pagina" | "motor-local" | "entorno-alterno";
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
    /** Puerto de la página (`location.port`): el servidor local de la app de escritorio no es la Mac. */
    puerto?: string;
    origenPagina: string;
    hostsExtra: string[];
    /** Motores externos / Oracle / entornos alternos configurados para intentar si falla la Mac. */
    motoresAlternativos?: readonly { base: string; maquina?: string | null }[];
    token: (forzar?: boolean) => Promise<string | null>;
    acceso: () => Promise<{ miembro: boolean } | null>;
    leerMotor: () => Promise<LecturaMotor>;
    sondear: (base: string, token: string | null) => Promise<SondaMotor>;
    ahora: () => number;
}

export async function comprobarConexion(d: DepsConexion): Promise<FaseConexion> {
    if (abiertoEnLaMac(d.hostname, d.puerto)) return { fase: "local" };

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

    // Si es la app nativa en su servidor local (127.0.0.1:47610..47619 o tauri.localhost),
    // sondeamos directamente el motor local de la misma máquina (:9002) antes del túnel.
    let rechazoLocal: number | undefined;
    if (esAppNativaLocal(d.hostname, d.puerto)) {
        for (const cand of CANDIDATOS_MOTOR_LOCAL) {
            if (cand === d.origenPagina) continue;
            const sLocal = await d.sondear(cand, token);
            if (sLocal.ok) {
                return {
                    fase: "conectado",
                    base: cand,
                    desde: "motor-local",
                    maquina: "esta máquina (local :9002)",
                    comprobadoEn: d.ahora(),
                };
            }
            if (sLocal.tipo === "rechazado" && rechazoLocal === undefined) rechazoLocal = sLocal.estado;
        }
    }

    const lectura = await d.leerMotor();
    if (!lectura.ok && !d.motoresAlternativos?.length) {
        if (rechazoLocal !== undefined) return { fase: "rechazado", estado: rechazoLocal };
        return lectura.sinTabla ? { fase: "sin-tabla", motivo: lectura.motivo } : { fase: "error", motivo: lectura.motivo };
    }

    const fila = lectura.ok ? lectura.fila : null;
    const resumen = leerFilaMotor(fila, d.ahora(), d.hostsExtra);
    const base = fila?.encendido ? motorUrlValida(fila.url, { hostsExtra: d.hostsExtra }) : null;
    const maquina = fila?.maquina?.trim() || null;

    if (base) {
        const sonda = await d.sondear(base, token);
        if (sonda.ok) {
            return { fase: "conectado", base, desde: "tunel", maquina, comprobadoEn: d.ahora() };
        }
        if (sonda.tipo === "rechazado") return { fase: "rechazado", estado: sonda.estado };
    }

    if (d.motoresAlternativos?.length) {
        for (const m of d.motoresAlternativos) {
            const valida = motorUrlValida(m.base, { hostsExtra: d.hostsExtra, origenPagina: d.origenPagina, permitirLocal: true });
            if (!valida || valida === base || valida === d.origenPagina) continue;
            const sAlt = await d.sondear(valida, token);
            if (sAlt.ok) {
                return {
                    fase: "conectado",
                    base: valida,
                    desde: "entorno-alterno",
                    maquina: m.maquina ?? null,
                    comprobadoEn: d.ahora(),
                };
            }
            if (sAlt.tipo === "rechazado") return { fase: "rechazado", estado: sAlt.estado };
        }
    }

    if (rechazoLocal !== undefined) return { fase: "rechazado", estado: rechazoLocal };
    if (!lectura.ok) {
        return lectura.sinTabla ? { fase: "sin-tabla", motivo: lectura.motivo } : { fase: "error", motivo: lectura.motivo };
    }
    if (!base) return { fase: "mac-apagada", latidoHaceMs: resumen.latidoHaceMs, motivo: resumen.motivo, maquina };

    return {
        fase: "mac-apagada",
        latidoHaceMs: resumen.latidoHaceMs,
        motivo: resumen.motivo || "El túnel de la Mac no contesta.",
        maquina,
    };
}
