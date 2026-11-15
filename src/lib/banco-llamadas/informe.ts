/** Banco de llamadas · el informe que la app de la Mac publica de sí misma (BAN1115D). Puro. */

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const palabra = (x: unknown): string | null => (typeof x === "string" && /^[a-z0-9-]{1,40}$/.test(x) ? x : null);

/**
 * BAN1115D: forma estricta de lo que la app informa de sí misma (clave propia, tableta elegida, si la aceptó, armada hasta
 * cuándo). Nada más pasa: ni texto libre ni claves. `t` en segundos de Python, `hasta` en milisegundos.
 */
export function sanearInforme(x: unknown, ahoraMs: number): Record<string, unknown> | null {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    if (o.v !== 1) return null;
    const ses = o.sesion && typeof o.sesion === "object" ? (o.sesion as Record<string, unknown>) : null;
    const arm = o.armada && typeof o.armada === "object" ? (o.armada as Record<string, unknown>) : null;
    const hasta = arm ? num(arm.hasta) : null;
    const restantes = arm ? num(arm.restantes) : null;
    const con = arm && typeof arm.con === "string" && RE_UUID.test(arm.con) ? arm.con.toLowerCase() : null;
    return {
        t: ahoraMs / 1000, // la hora la pone el servidor: la app no puede adelantarla
        llave: typeof o.llave === "boolean" ? o.llave : null,
        objetivo: typeof o.objetivo === "string" && RE_UUID.test(o.objetivo) ? o.objetivo.toLowerCase() : null,
        codigo: typeof o.codigo === "string" && /^[A-Za-z0-9 -]{1,40}$/.test(o.codigo) ? o.codigo : null,
        sesion: ses && (ses.estado === "aceptada" || ses.estado === "rechazada") ? { estado: ses.estado, motivo: palabra(ses.motivo), t: (num(ses.t) ?? ahoraMs) / 1000 } : null,
        armada: con && hasta !== null && restantes !== null ? { con, hasta, restantes } : null,
    };
}

