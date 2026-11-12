/**
 * «Ronda de aparatos» · lectura y vista (RON1112C) · PURO: sin disco, sin red, sin reloj propio.
 * ─────────────────────────────────────────────────────────────────────────────
 * Mientras dura una ronda de aparatos (las llamadas de prueba con la tableta, el móvil...), nada pesado EMPIEZA en la
 * Mac. El archivo `ronda-aparatos.json` lo escribe solo el director de pruebas (`scripts/puente/ronda.py`, contrato §12
 * de `architecture/centro-versiones-1105.md`); aquí solo se lee y se explica.
 *
 * Reglas que esta vista respeta, las mismas que el servicio:
 *  · Manda la HORA, no la bandera `activa`: una ronda cuyo `hasta` ya pasó está acabada aunque el director esté parado.
 *  · Nunca más de 90 min desde que empezó: un `hasta` más lejano en el archivo no alarga nada.
 *  · Lo que no se puede leer significa «sin ronda» y se dice; no se inventa una ronda ni una calma.
 *  · «La Mac está tranquila» sólo se afirma si la medición es reciente; si es vieja se dice que es vieja.
 */

import { duracionCorta, limpiarTexto } from "./carril-claude";

export const RONDA_MINUTOS_DEF = 30;
export const RONDA_MINUTOS_MAX = 90;

export interface PesadoRonda {
    /** «las pruebas de TypeScript (tsc)», ya en palabras. */
    que: string;
    llevaS: number | null;
    sueleS: number | null;
    faltanS: number | null;
}

export interface SilencioRonda {
    medidoMs: number | null;
    /** true = tranquila · false = algo trabaja · null = no se pudo saber. */
    tranquila: boolean | null;
    linea: string;
    carga1: number | null;
    pesados: PesadoRonda[];
}

export interface RondaLeida {
    quien: string;
    motivo: string;
    desdeMs: number;
    /** El fin efectivo: el `hasta` escrito, nunca pasado el tope de 90 min desde `desdeMs`. */
    hastaMs: number;
    renovaciones: number;
    /** Si se terminó a mano: cuándo y quién. */
    finMs: number | null;
    finPor: string | null;
}

export interface RondaArchivo {
    medidoMs: number | null;
    cadaS: number;
    ronda: RondaLeida | null;
    silencio: SilencioRonda | null;
}

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const ms = (v: unknown): number | null => {
    const t = typeof v === "string" ? Date.parse(v) : NaN;
    return Number.isFinite(t) ? t : null;
};
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** PURA. Del JSON del disco a lo que se usa; `null` si no es un archivo de ronda (se trata como «sin ronda»). */
export function leerRonda(crudo: unknown): RondaArchivo | null {
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return null;
    const o = objeto(crudo);
    const r = objeto(o.ronda);
    const desde = ms(r.desde);
    const hasta = ms(r.hasta);
    let ronda: RondaLeida | null = null;
    if (desde !== null && hasta !== null) {
        ronda = {
            quien: limpiarTexto(r.quien, 40) || "?",
            motivo: limpiarTexto(r.motivo, 200),
            desdeMs: desde,
            hastaMs: Math.min(hasta, desde + RONDA_MINUTOS_MAX * 60_000),
            renovaciones: typeof r.renovaciones === "number" && Number.isInteger(r.renovaciones) && r.renovaciones >= 0 ? r.renovaciones : 0,
            finMs: ms(r.fin),
            finPor: r.fin_por ? limpiarTexto(r.fin_por, 40) || null : null,
        };
    }
    const s = objeto(o.silencio);
    const silencio: SilencioRonda | null =
        Object.keys(s).length === 0
            ? null
            : {
                  medidoMs: ms(s.t),
                  tranquila: s.tranquila === true ? true : s.tranquila === false ? false : null,
                  linea: limpiarTexto(s.linea, 300),
                  carga1: num(s.carga1),
                  pesados: (Array.isArray(s.pesados) ? s.pesados : []).slice(0, 8).map((p) => {
                      const x = objeto(p);
                      return { que: limpiarTexto(x.que ?? x.tipo, 80) || "un trabajo pesado", llevaS: num(x.lleva_s), sueleS: num(x.suele_s), faltanS: num(x.faltan_s) };
                  }),
              };
    return { medidoMs: ms(o.t), cadaS: num(o.cada_s) && (o.cada_s as number) > 0 ? (o.cada_s as number) : 60, ronda, silencio };
}

export type EstadoRonda = "activa" | "libre" | "sin-archivo" | "ilegible";

export interface VistaRonda {
    estado: EstadoRonda;
    /** Hay una ronda en vigor a esta hora: lo único que decide si algo pesado espera. */
    activa: boolean;
    quien: string | null;
    motivo: string | null;
    desdeMs: number | null;
    hastaMs: number | null;
    quedaS: number;
    /** «quedan 18 min» · «termina enseguida» · «» si no hay ronda. */
    quedaTexto: string;
    /** El máximo al que se puede renovar ya (90 min desde el inicio). */
    enSuTope: boolean;
    titulo: string;
    texto: string;
    silencio: { estado: "tranquila" | "ocupada" | "no-se" | "sin-medir"; texto: string; viejo: boolean } | null;
}

function quedaEnTexto(s: number): string {
    if (s <= 0) return "";
    if (s < 90) return "quedan menos de 2 min";
    return `quedan ${duracionCorta(Math.round(s / 60))}`;
}

function silencioDe(a: RondaArchivo, ahora: number): VistaRonda["silencio"] {
    const s = a.silencio;
    if (!s) return { estado: "sin-medir", texto: "El director aún no ha medido si la Mac está tranquila.", viejo: false };
    const medido = s.medidoMs ?? a.medidoMs;
    const haceS = medido === null ? null : Math.max(0, Math.round((ahora - medido) / 1000));
    const viejo = haceS === null || haceS > 3 * a.cadaS;
    if (viejo) {
        const cuando = haceS === null ? "sin hora" : `de hace ${duracionCorta(Math.round(haceS / 60))}`;
        return { estado: "sin-medir", texto: `La última medición de la Mac es ${cuando} y el director no la ha renovado: no sé si está tranquila ahora.`, viejo: true };
    }
    const linea = s.linea || (s.tranquila ? "La Mac está tranquila." : s.tranquila === false ? "La Mac no está tranquila." : "No sé si la Mac está tranquila.");
    const mayus = linea.charAt(0).toUpperCase() + linea.slice(1);
    return { estado: s.tranquila === true ? "tranquila" : s.tranquila === false ? "ocupada" : "no-se", texto: mayus.endsWith(".") ? mayus : `${mayus}.`, viejo: false };
}

/** PURA. Lo que se pinta, a la hora de `ahora`. `null` = no hay archivo; "ilegible" = hay y no se pudo leer. */
export function vistaRonda(a: RondaArchivo | "ilegible" | null | undefined, ahora: number): VistaRonda {
    const base = { quien: null, motivo: null, desdeMs: null, hastaMs: null, quedaS: 0, quedaTexto: "", enSuTope: false, silencio: null };
    if (a === "ilegible") {
        return { ...base, estado: "ilegible", activa: false, titulo: "Sin ronda", texto: "No pude leer el archivo de la ronda de aparatos: se trata como sin ronda (lo ilegible no frena la fábrica)." };
    }
    if (!a) return { ...base, estado: "sin-archivo", activa: false, titulo: "Sin ronda", texto: "No hay ronda de aparatos. Nada pesado espera por ella." };
    const r = a.ronda;
    const vigente = !!r && r.finMs === null && ahora < r.hastaMs;
    if (!r || !vigente) {
        const fin = r?.finMs ? (r.finPor === "caducó" ? " La última caducó sola." : ` La última la terminó ${r.finPor || "alguien"}.`) : r ? " La última ya venció." : "";
        return { ...base, estado: "libre", activa: false, titulo: "Sin ronda", texto: `No hay ronda de aparatos activa.${fin}`, quien: r?.quien ?? null, motivo: r?.motivo ?? null };
    }
    const quedaS = Math.max(0, Math.round((r.hastaMs - ahora) / 1000));
    const enSuTope = r.hastaMs >= r.desdeMs + RONDA_MINUTOS_MAX * 60_000 - 500;
    const hora = new Date(r.hastaMs).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return {
        estado: "activa",
        activa: true,
        quien: r.quien,
        motivo: r.motivo || null,
        desdeMs: r.desdeMs,
        hastaMs: r.hastaMs,
        quedaS,
        quedaTexto: quedaEnTexto(quedaS),
        enSuTope,
        titulo: "Ronda de aparatos activa",
        texto: `${r.quien} la pidió${r.motivo ? ` para «${r.motivo}»` : ""}. Termina a las ${hora}; mientras tanto no empieza nada pesado en la Mac (lo que ya corría sigue).`,
        silencio: silencioDe(a, ahora),
    };
}

/** Lo que viaja a las otras neuronas: sólo quién, para qué y cuándo. */
export interface RondaParaEnviar {
    quien: string;
    motivo: string;
    desdeMs: number;
    hastaMs: number;
}

/** PURA. De la lectura a lo que viaja; `null` si no hay una ronda en vigor a esta hora (no se manda una vencida). */
export function rondaParaEnviar(a: RondaArchivo | "ilegible" | null | undefined, ahora: number): RondaParaEnviar | null {
    if (!a || a === "ilegible" || !a.ronda || a.ronda.finMs !== null || ahora >= a.ronda.hastaMs) return null;
    return { quien: a.ronda.quien, motivo: a.ronda.motivo, desdeMs: a.ronda.desdeMs, hastaMs: a.ronda.hastaMs };
}

/** PURA. Lo que llega de otra neurona, por la lista blanca. */
export function sanearRonda(crudo: unknown): RondaParaEnviar | null {
    const o = objeto(crudo);
    const desde = num(o.desdeMs);
    const hasta = num(o.hastaMs);
    if (desde === null || hasta === null || desde <= 0 || hasta <= desde) return null;
    return { quien: limpiarTexto(o.quien, 40) || "?", motivo: limpiarTexto(o.motivo, 200), desdeMs: desde, hastaMs: Math.min(hasta, desde + RONDA_MINUTOS_MAX * 60_000) };
}

/** PURA. Para «Qué corre ahora»: la línea de la ronda en vigor a la hora de `ahora`, o null. */
export function vistaRondaEnviada(r: RondaParaEnviar | null | undefined, ahora: number): { activa: true; quedaS: number; texto: string } | null {
    if (!r || ahora >= r.hastaMs) return null;
    const quedaS = Math.round((r.hastaMs - ahora) / 1000);
    return { activa: true, quedaS, texto: `Ronda de aparatos activa (${r.quien}${r.motivo ? `: ${r.motivo}` : ""}): nada pesado empieza; ${quedaEnTexto(quedaS) || "termina enseguida"}.` };
}
