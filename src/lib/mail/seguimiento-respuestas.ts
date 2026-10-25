/*
 * StarSeed OS · Correos inteligentes (INV1025I) — «Reply Zero» propio.
 * Patrón de Inbox Zero reescrito desde cero (solo lo que describe su README
 * público; no se copia código ni textos). Clasifica un hilo de correo del OS
 * POR-RESPONDER (el último mensaje es de otro y ya pasaron más de N horas sin
 * respuesta mía), ESPERANDO (el último es mío y pasaron más de D días sin
 * respuesta de la otra parte; 14 por defecto para el alcance, R2: el
 * recordatorio nunca lo envía este módulo, solo marca el estado) o RESUELTO.
 * Sirve a los borradores desde la dirección pública y a Mensajes. Puro: el
 * reloj entra inyectado (`ahora`) y nada lanza.
 */

/** Estado de seguimiento de un hilo de correo. */
export type EstadoSeguimiento = "por-responder" | "esperando" | "resuelto";

/** Mensaje mínimo de un hilo: quién lo escribió y cuándo (ISO). */
export interface MensajeLite { de: string; creadoEl: string; }

/** Hilo mínimo para seguimiento, sin importar `os-mail.ts`. */
export interface HiloLite { id: string; mensajes: MensajeLite[]; }

/** Umbrales del alcance: N horas por responder y D días esperando. */
export interface CfgSeguimiento { horasPorResponder: number; diasEsperando: number; }

/** 14 días por defecto para el alcance (contrato INV1025I). */
export const CFG_SEGUIMIENTO_DEFECTO: CfgSeguimiento = { horasPorResponder: 24, diasEsperando: 14 };

/** Resumen para un widget o panel («Por responder» / «Esperando»). */
export interface ResumenSeguimiento {
    porResponder: number; esperando: number; resuelto: number;
    idsPorResponder: string[]; idsEsperando: string[];
}

/** Horas transcurridas entre un ISO y `ahora` (ms); fecha inválida = 0. */
function horasDesde(creadoEl: string, ahora: number): number {
    const t = typeof creadoEl === "string" ? Date.parse(creadoEl) : NaN;
    if (!Number.isFinite(t) || t > ahora) return 0;
    return Math.max(0, (ahora - t) / 3600000);
}

/** Configuración saneada: valores no finitos o negativos caen al defecto. */
export function cfgNormalizada(cfg?: Partial<CfgSeguimiento> | null): CfgSeguimiento {
    const r = { ...CFG_SEGUIMIENTO_DEFECTO, ...(cfg || {}) };
    const h = Math.ceil(r.horasPorResponder);
    const d = Math.ceil(r.diasEsperando);
    return {
        horasPorResponder: Number.isFinite(h) && h > 0 ? h : CFG_SEGUIMIENTO_DEFECTO.horasPorResponder,
        diasEsperando: Number.isFinite(d) && d > 0 ? d : CFG_SEGUIMIENTO_DEFECTO.diasEsperando,
    };
}

/**
 * Clasifica UN hilo con reloj inyectado. El último mensaje es el de fecha más
 * reciente (las inválidas van al final). Sin mensajes o fechas ilegibles:
 * «resuelto» (jamás una marca de trabajo pendiente por un dato imposible).
 */
export function clasificarHilo(
    hilo: HiloLite | null | undefined,
    yo: string,
    ahora: number,
    cfg?: Partial<CfgSeguimiento> | null,
): EstadoSeguimiento {
    const c = cfgNormalizada(cfg);
    const mensajes = (hilo && Array.isArray(hilo.mensajes) ? hilo.mensajes : []).filter(
        (m) => m && typeof m === "object" && typeof m.creadoEl === "string",
    );
    if (!mensajes.length || !yo) return "resuelto";
    const ultimo = [...mensajes].sort((a, b) => {
        const ta = Date.parse(a.creadoEl) || 0;
        const tb = Date.parse(b.creadoEl) || 0;
        return ta - tb;
    })[mensajes.length - 1];
    const horas = horasDesde(ultimo.creadoEl, ahora);
    const esMio = typeof ultimo.de === "string" && ultimo.de.trim() === yo.trim();
    if (!esMio) return horas > c.horasPorResponder ? "por-responder" : "resuelto";
    return horas / 24 > c.diasEsperando ? "esperando" : "resuelto";
}

/**
 * Resumen de una bandeja completa: debe servir al panel «Por responder» y al
 * recordatorio único de los 14 días (quien lo envíe es otro módulo y exige
 * aprobación humana; aquí solo se cuenta y se lista).
 */
export function resumenSeguimiento(
    hilos: HiloLite[],
    yo: string,
    ahora: number,
    cfg?: Partial<CfgSeguimiento> | null,
): ResumenSeguimiento {
    const r: ResumenSeguimiento = { porResponder: 0, esperando: 0, resuelto: 0, idsPorResponder: [], idsEsperando: [] };
    for (const h of Array.isArray(hilos) ? hilos : []) {
        if (!h || typeof h !== "object") continue;
        const estado = clasificarHilo(h, yo, ahora, cfg);
        if (estado === "por-responder") {
            r.porResponder += 1;
            r.idsPorResponder.push(h.id);
        } else if (estado === "esperando") {
            r.esperando += 1;
            r.idsEsperando.push(h.id);
        } else {
            r.resuelto += 1;
        }
    }
    return r;
}
