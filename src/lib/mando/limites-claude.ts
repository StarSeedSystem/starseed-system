/***
 * LÍMITES DEL PLAN DE CLAUDE (Ola 1004L · LC1004Bc) — módulo PURO
 * ─────────────────────────────────────────────────────────────────────────────
 * Resume lo que queda de las ventanas de uso del plan de Claude (sesión de
 * ~5 h y semanal, más la semanal de un modelo concreto si claude.ai la enseña),
 * leídas a mano desde claude.ai → Ajustes → Uso y guardadas con
 * `scripts/puente/limites_claude.py declarar …` en `~/.starseed/limites-claude.json`.
 * Sin `node:*` y sin `Date.now()`: el instante actual entra como `ahora` (ms).
 */

export const ENLACE_USO_CLAUDE = "https://claude.ai/settings/usage";

export interface LecturaLimites {
    t: string;
    sesion_pct: number;
    sesion_reinicio: string;
    semana_pct: number;
    semana_reinicio: string;
    modelo_nombre: string | null;
    modelo_pct: number | null;
    modelo_reinicio: string | null;
    fuente: string;
}

export interface ProgramadaClaude {
    nombre: string;
    proxima: string;
    cada_min: number | null;
}

/** Forma del archivo `~/.starseed/limites-claude.json`. */
export interface ConfigLimitesClaude {
    lecturas: LecturaLimites[];
    programadas: { t: string; lista: ProgramadaClaude[] };
    umbral_pct: number;
}

export type TonoLimites = "ok" | "aviso" | "peligro";

export interface VentanaClaude {
    pct: number;
    queda: number;
    reinicio: string;
    minutosParaReinicio: number;
    coste: number | null;
    proyeccion: number | null;
    reiniciada: boolean;
    tono: TonoLimites;
}

export interface EstadoLimitesClaude {
    sesion: VentanaClaude | null;
    semana: VentanaClaude | null;
    modelo: VentanaClaude | null;
    modeloNombre: string | null;
    lecturaEn: string | null;
    lecturaHaceMin: number | null;
    desactualizada: boolean;
    programadasEnSesion: number;
    programadasEnSemana: number;
    recomendacion: string | null;
    tono: TonoLimites;
}

export type CampoVentana = "sesion" | "semana" | "modelo";

type ClavePct = "sesion_pct" | "semana_pct" | "modelo_pct";
type ClaveReinicio = "sesion_reinicio" | "semana_reinicio" | "modelo_reinicio";

const CLAVES: Record<CampoVentana, { pct: ClavePct; reinicio: ClaveReinicio }> = {
    sesion: { pct: "sesion_pct", reinicio: "sesion_reinicio" },
    semana: { pct: "semana_pct", reinicio: "semana_reinicio" },
    modelo: { pct: "modelo_pct", reinicio: "modelo_reinicio" },
};

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
function numero(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function texto(v: unknown): string | null {
    return typeof v === "string" && v.length > 0 ? v : null;
}
function msDe(iso: string): number | null {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
}
function mediana(xs: number[]): number | null {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Lectura saneada o null si le falta algo imprescindible. */
function leerLectura(v: unknown): LecturaLimites | null {
    if (!esObjeto(v)) return null;
    const t = texto(v.t);
    const sr = texto(v.sesion_reinicio);
    const wr = texto(v.semana_reinicio);
    const sp = numero(v.sesion_pct);
    const wp = numero(v.semana_pct);
    if (!t || !sr || !wr || sp === null || wp === null) return null;
    return {
        t, sesion_pct: sp, sesion_reinicio: sr, semana_pct: wp, semana_reinicio: wr,
        modelo_nombre: texto(v.modelo_nombre),
        modelo_pct: numero(v.modelo_pct),
        modelo_reinicio: texto(v.modelo_reinicio),
        fuente: texto(v.fuente) ?? "desconocida",
    };
}

function leerProgramada(v: unknown): ProgramadaClaude | null {
    if (!esObjeto(v)) return null;
    const nombre = texto(v.nombre);
    const proxima = texto(v.proxima);
    if (!nombre || !proxima) return null;
    return { nombre, proxima, cada_min: numero(v.cada_min) };
}

/**
 * Coste por revisión: mediana de los aumentos positivos de `*_pct` entre
 * lecturas CONSECUTIVAS de la misma ventana (mismo `*_reinicio`).
 * Null si no hay dos lecturas así.
 */
export function costePorRevision(lecturas: LecturaLimites[], campo: CampoVentana): number | null {
    const k = CLAVES[campo];
    const deltas: number[] = [];
    for (let i = 1; i < lecturas.length; i++) {
        const a = lecturas[i - 1];
        const b = lecturas[i];
        if (a[k.reinicio] === null || a[k.reinicio] !== b[k.reinicio]) continue;
        const pa = a[k.pct];
        const pb = b[k.pct];;
        if (pa === null || pb === null) continue;
        const d = pb - pa;
        if (d > 0) deltas.push(d);
    }
    return mediana(deltas);
}

/**
 * Disparos de tareas programadas antes de `hasta` (ms): 1 por cada
 * `proxima` ∈ (ahora, hasta], más floor((hasta − proxima)/cada_min) cuando
 * `cada_min` > 0.
 */
export function disparosAntes(lista: ProgramadaClaude[], ahora: number, hasta: number): number {
    let n = 0;
    if (hasta <= ahora) return n;
    for (const p of lista) {
        const px = msDe(p.proxima);
        if (px === null || px <= ahora || px > hasta) continue;
        n += 1;
        if (typeof p.cada_min === "number" && p.cada_min > 0) {
            n += Math.floor((hasta - px) / (p.cada_min * 60000));
        }
    }
    return n;
}

function tonoVentana(pct: number, proyeccion: number | null, umbral: number): TonoLimites {
    if (pct >= umbral || (proyeccion !== null && proyeccion > 100)) return "peligro";
    if (pct >= 60 || (proyeccion !== null && proyeccion >= umbral)) return "aviso";
    return "ok";
}

function construirVentana(
    pct: number,
    reinicioIso: string,
    ahora: number,
    umbral: number,
    coste: number | null,
    disparos: number,
): VentanaClaude {
    const rMs = msDe(reinicioIso);
    const reiniciada = rMs !== null && rMs <= ahora;
    const efec = reiniciada ? 0 : pct;
    const proyeccion = coste === null ? null : efec + disparos * coste;
    return {
        pct: efec,
        queda: Math.max(0, 100 - efec),
        reinicio: reinicioIso,
        minutosParaReinicio: rMs === null ? 0 : Math.max(0, Math.round((rMs - ahora) / 60000)),
        coste,
        proyeccion,
        reiniciada,
        tono: tonoVentana(efec, proyeccion, umbral),
    };
}

function peorTono(tonos: TonoLimites[]): TonoLimites {
    if (tonos.includes("peligro")) return "peligro";
    if (tonos.includes("aviso")) return "aviso";
    return "ok";
}

const SIN_LECTURA = "Sin lectura todavía: la dirección la toma en su próxima revisión";

/** Estado completo; `cfg` es el JSON crudo del archivo y `ahora` va en ms. */
export function estadoLimitesClaude(cfg: unknown, ahora: number): EstadoLimitesClaude {
    const vacio: EstadoLimitesClaude = {
        sesion: null, semana: null, modelo: null, modeloNombre: null,
        lecturaEn: null, lecturaHaceMin: null, desactualizada: false,
        programadasEnSesion: 0, programadasEnSemana: 0,
        recomendacion: SIN_LECTURA, tono: "aviso",
    };
    if (!esObjeto(cfg)) return vacio;
    const lecturasRaw = Array.isArray(cfg.lecturas) ? cfg.lecturas : [];
    const lecturas = lecturasRaw
        .map(leerLectura)
        .filter((l): l is LecturaLimites => l !== null);
    if (lecturas.length === 0) return vacio;

    const ultima = lecturas[lecturas.length - 1];
    const umbral = numero(cfg.umbral_pct) ?? 90;
    const prog = esObjeto(cfg.programadas) && Array.isArray(cfg.programadas.lista)
        ? cfg.programadas.lista.map(leerProgramada).filter((p): p is ProgramadaClaude => p !== null)
        : [];

    const tMs = msDe(ultima.t);
    const lecturaHaceMin = tMs === null ? null : Math.round((ahora - tMs) / 60000);
    const desactualizada = lecturaHaceMin !== null && lecturaHaceMin > 120;

    const rSesionMs = msDe(ultima.sesion_reinicio);
    const rSemanaMs = msDe(ultima.semana_reinicio);
    const dispSesion = rSesionMs === null ? 0 : disparosAntes(prog, ahora, rSesionMs);
    const dispSemana = rSemanaMs === null ? 0 : disparosAntes(prog, ahora, rSemanaMs);

    const sesion = construirVentana(
        ultima.sesion_pct, ultima.sesion_reinicio, ahora, umbral,
        costePorRevision(lecturas, "sesion"), dispSesion,
    );
    const semana = construirVentana(
        ultima.semana_pct, ultima.semana_reinicio, ahora, umbral,
        costePorRevision(lecturas, "semana"), dispSemana,
    );
    let modelo: VentanaClaude | null = null;
    if (ultima.modelo_nombre !== null && ultima.modelo_pct !== null && ultima.modelo_reinicio !== null) {
        const rModeloMs = msDe(ultima.modelo_reinicio);
        const dispModelo = rModeloMs === null ? 0 : disparosAntes(prog, ahora, rModeloMs);
        modelo = construirVentana(
            ultima.modelo_pct, ultima.modelo_reinicio, ahora, umbral,
            costePorRevision(lecturas, "modelo"), dispModelo,
        );
    }

    let recomendacion: string | null = null;
    const candidatas: Array<[string, VentanaClaude]> = [["sesión", sesion], ["semana", semana]];
    for (const [nombre, v] of candidatas) {
        if (v.proyeccion !== null && v.proyeccion > umbral && v.coste !== null && v.coste > 0) {
            const n = Math.max(0, Math.floor((umbral - v.pct) / v.coste));
            recomendacion = `Espacia las revisiones: caben ${n} hasta el reinicio de ${nombre}`;
            break;
        }
    }

    let tono = peorTono([sesion.tono, semana.tono, ...(modelo ? [modelo.tono] : [])]);
    if (desactualizada && tono === "ok") tono = "aviso";

    return {
        sesion, semana, modelo,
        modeloNombre: ultima.modelo_nombre,
        lecturaEn: ultima.t,
        lecturaHaceMin,
        desactualizada,
        programadasEnSesion: dispSesion,
        programadasEnSemana: dispSemana,
        recomendacion,
        tono,
    };
}

function fmtDuracion(minutos: number): string {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    if (h > 0) return `${h} h ${m} min`;
    return `${m} min`;
}

/** «sesión 34 % · semana 61 % · reinicia en 2 h 10 min · proyección 72 %» o «sin lectura». */
export function resumenLimitesClaude(e: EstadoLimitesClaude): string {
    if (!e.sesion && !e.semana) return "sin lectura";
    const partes: string[] = [];
    if (e.sesion) partes.push(`sesión ${Math.round(e.sesion.pct)} %`);
    if (e.semana) partes.push(`semana ${Math.round(e.semana.pct)} %`);
    const v = e.sesion ?? e.semana;
    if (v) {
        partes.push(v.reiniciada ? "reiniciada" : `reinicia en ${fmtDuracion(v.minutosParaReinicio)}`);
        if (v.proyeccion !== null) partes.push(`proyección ${Math.round(v.proyeccion)} %`);
    }
    return partes.join(" · ");
}
