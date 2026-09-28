/**
 * Bloqueo (Ola 382 · BLQ4): configuración POR NEURONA y cuándo bloquear. El bloqueo protege el
 * dispositivo, no la cuenta: cada neurona elige su método. Solo se guardan hashes PBKDF2 y la
 * clave pública de la passkey; nunca el PIN, la contraseña ni la biometría.
 */
import type { SecretoGuardado } from "./secreto-local";
import type { PasskeyGuardada } from "./passkey-registro";

export type MetodoBloqueo = "ninguno" | "pin" | "contrasena" | "biometria";
export interface ConfigBloqueo {
    metodo: MetodoBloqueo;
    alAbrir: boolean;
    /** 0 = nunca por inactividad. */
    minutosInactividad: number;
    secreto?: SecretoGuardado;
    passkey?: PasskeyGuardada;
    /** PIN de respaldo cuando falla la biometría. */
    respaldo?: SecretoGuardado;
    v: 1;
}

export const CLAVE_BLOQUEO = "starseed.bloqueo.v1";
export const CLAVE_SESION_BLOQUEO = "starseed.bloqueo.sesion.v1";
export const EVENTO_CONFIG_BLOQUEO = "starseed:bloqueo-config";
export const SIN_BLOQUEO: ConfigBloqueo = { metodo: "ninguno", alAbrir: false, minutosInactividad: 0, v: 1 };

function leerTodo(): Record<string, ConfigBloqueo> {
    try {
        const j = JSON.parse(globalThis.localStorage?.getItem(CLAVE_BLOQUEO) || "{}");
        return j && typeof j === "object" ? j : {};
    } catch {
        return {};
    }
}

/** Comprueba que la configuración se puede usar para desbloquear; lanza con un motivo claro si no. */
export function validarConfig(cfg: ConfigBloqueo): void {
    if (cfg.metodo === "pin" || cfg.metodo === "contrasena") {
        if (!cfg.secreto || cfg.secreto.metodo !== cfg.metodo) throw new Error(`Falta ${cfg.metodo === "pin" ? "el PIN" : "la contraseña"} para este bloqueo.`);
    }
    if (cfg.metodo === "biometria") {
        if (!cfg.passkey) throw new Error("Falta registrar la huella o el rostro.");
        if (!cfg.respaldo || cfg.respaldo.metodo !== "pin") throw new Error("La biometría necesita un PIN de respaldo por si falla.");
    }
    if (!(cfg.minutosInactividad >= 0)) throw new Error("Los minutos de inactividad no son válidos.");
}

export function leerConfigBloqueo(neuronaId: string): ConfigBloqueo {
    const c = leerTodo()[neuronaId];
    if (!c || c.v !== 1) return { ...SIN_BLOQUEO };
    try { validarConfig(c); return c; } catch { return { ...SIN_BLOQUEO }; }
}

export function guardarConfigBloqueo(neuronaId: string, cfg: ConfigBloqueo): void {
    validarConfig(cfg);
    const todo = leerTodo();
    todo[neuronaId] = { ...cfg, v: 1 };
    globalThis.localStorage?.setItem(CLAVE_BLOQUEO, JSON.stringify(todo));
    try { globalThis.dispatchEvent?.(new Event(EVENTO_CONFIG_BLOQUEO)); } catch { /* sin ventana */ }
}

/** Momento del último desbloqueo en ESTA pestaña (sessionStorage): recargar no vuelve a pedirlo. */
export function leerDesbloqueoSesion(): number | null {
    try { const v = Number(globalThis.sessionStorage?.getItem(CLAVE_SESION_BLOQUEO)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
}
export function marcarDesbloqueoSesion(t: number | null): void {
    try {
        if (t === null) globalThis.sessionStorage?.removeItem(CLAVE_SESION_BLOQUEO);
        else globalThis.sessionStorage?.setItem(CLAVE_SESION_BLOQUEO, String(t));
    } catch { /* sin almacén */ }
}

export interface MomentoBloqueo {
    cfg: ConfigBloqueo;
    desbloqueadoEn: number | null;
    ultimaActividad: number;
    ocultaDesde: number | null;
    ahora: number;
    recienAbierta: boolean;
}

export function debeBloquear(m: MomentoBloqueo): boolean {
    if (m.cfg.metodo === "ninguno") return false;
    const plazo = m.cfg.minutosInactividad * 60_000;
    if (m.recienAbierta && m.cfg.alAbrir && m.desbloqueadoEn === null) return true;
    if (plazo > 0) {
        const ultimo = Math.max(m.ultimaActividad, m.desbloqueadoEn ?? 0);
        if (m.ahora - ultimo >= plazo) return true;
        if (m.ocultaDesde !== null && m.ahora - m.ocultaDesde >= plazo) return true;
    }
    return false;
}
