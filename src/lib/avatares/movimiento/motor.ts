"use client";

/**
 * MOTOR ÚNICO DE MOVIMIENTO «VIDA STARSEED» (Ola 229 · M1 · 2/2)
 * ─────────────────────────────────────────────────────────────────────────────
 * UN solo punto de entrada para mover avatares. La regla es la misma que en
 * el motor de voz: el CARÁCTER del gesto es la identidad y NO cambia al
 * cambiar de nivel; el NIVEL solo decide QUÉ backend lo genera:
 *
 *   vivo   · Kimodo local por el demonio (frase → rotaciones SOMA de 30
 *            articulaciones + traslación de raíz), vía `/api/movimiento/generar`
 *   fluido · Kimodo con lote precalculado + mezcla de clips (misma API)
 *   ligero · clips procedurales en el navegador (seno/ruido suave):
 *            respiración, balanceo, énfasis — generados aquí mismo
 *   quieto · micro-movimiento CSS (respiración); este módulo devuelve `null`
 *
 * Si un nivel falla, se baja al siguiente SIN cambiar el carácter del gesto
 * y se avisa por `alDegradar`. Nunca se lanza una excepción a la interfaz.
 */

import {
    detectarCapacidades,
    capacidadesEnCache,
    type Capacidades,
} from "@/lib/aurora/voz-starseed/capacidades";
import {
    nivelMovimientoPara,
    siguienteNivelMovimiento,
    type NivelMovimiento,
} from "./niveles";

/** Identificador público del motor único, para registros y paneles. */
export const MOVIMIENTO_STARSEED_ID = "starseed.movimiento-unico.v1";

/** Esqueletos que puede devolver el backend (SMPL-X 22, SOMA 30, Unitree G1 34). */
export type EsqueletoMovimiento = "smplx22" | "soma30" | "g1-34";

/** Un clip de movimiento listo para reproducir en un avatar. */
export interface MovimientoClip {
    esqueleto: EsqueletoMovimiento;
    fps: number;
    duracionMs: number;
    /** Rotaciones locales por fotograma y articulación. */
    rotaciones: number[][];
    /** Traslación de raíz por fotograma (opcional). */
    raiz?: number[][];
    origen: "kimodo" | "procedural";
}

/** Petición de gesto en lenguaje natural. */
export interface Gesto {
    prompt: string;
    emocion?: string;
    /** 0–1; modula amplitud y ritmo de la generación. */
    energia?: number;
    duracionMs?: number;
    bucle?: boolean;
}

export interface OpcionesMover {
    personalidadId?: string;
    /** Fuerza un nivel concreto; si falta, se resuelve solo. */
    nivel?: NivelMovimiento;
    /** Aviso cuando se ha tenido que bajar de nivel (con el mismo gesto). */
    alDegradar?: (de: NivelMovimiento, a: NivelMovimiento) => void;
}

/** Clave donde se guarda el nivel elegido por el usuario; "auto" = decidir por hardware. */
const CLAVE_NIVEL = "starseed.movimiento.nivel";
export type PreferenciaNivelMovimiento = NivelMovimiento | "auto";

const NIVELES_VALIDOS: PreferenciaNivelMovimiento[] = ["auto", "vivo", "fluido", "ligero", "quieto"];

/** Nivel que pidió el usuario, o "auto" si no ha elegido (valor por defecto). */
export function nivelMovimientoPreferido(): PreferenciaNivelMovimiento {
    if (typeof window === "undefined") return "auto";
    try {
        const crudo = window.localStorage.getItem(CLAVE_NIVEL);
        return NIVELES_VALIDOS.includes(crudo as PreferenciaNivelMovimiento)
            ? (crudo as PreferenciaNivelMovimiento)
            : "auto";
    } catch {
        return "auto";
    }
}

/** Fija el nivel elegido por el usuario ("auto" devuelve la decisión al hardware). */
export function fijarNivelMovimiento(n: PreferenciaNivelMovimiento): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(CLAVE_NIVEL, NIVELES_VALIDOS.includes(n) ? n : "auto");
    } catch { /* sin almacenamiento */ }
}

/** Nivel en el que se está moviendo AHORA el avatar (lo fija `moverAvatar`). */
let nivelEnUso: NivelMovimiento | null = null;

/** Último nivel que usó el motor, o `null` si aún no ha generado en esta sesión. */
export function nivelMovimientoActual(): NivelMovimiento | null {
    return nivelEnUso;
}

/** Lee la preferencia de accesibilidad del sistema (prefers-reduced-motion). */
function prefiereReducirMovimiento(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
        return false;
    }
}

/**
 * Resuelve el nivel concreto a usar: el que pidió el usuario si es válido
 * para este equipo; si no, el mejor que el hardware pueda sostener. La
 * accesibilidad (prefers-reduced-motion) manda sobre todo: fuerza «quieto».
 */
async function resolverNivel(explicito?: NivelMovimiento): Promise<NivelMovimiento> {
    const caps: Capacidades = await detectarCapacidades();
    const auto = nivelMovimientoPara(caps, prefiereReducirMovimiento());
    if (explicito) return explicito;
    const preferencia = nivelMovimientoPreferido();
    return preferencia === "auto" ? auto : preferencia;
}

/* ─────────────── Freno de la vía Kimodo (2026-10-26) ───────────────
 * Medido en localhost:9002: el mundo de los avatares (18 habitantes que cambian de gesto en cada tick) hizo más
 * de 43.000 POST a `/api/movimiento/generar`; la ruta respondía 429 (30 cada 10 min por persona) y cada avatar
 * volvía a pedir en el siguiente gesto. Ahora: el mismo gesto se pide UNA vez (caché y peticiones compartidas),
 * como mucho 2 a la vez, y un 429/5xx o un fallo de red pausa la vía (respetando `Retry-After`) mientras el
 * avatar sigue moviéndose con el clip procedural («ligero»). Nada de esto cambia el carácter del gesto. */
const MAX_CACHE_CLIPS = 64;
const MAX_EN_VUELO = 2;
const PAUSA_BASE_MS = 30_000;
const PAUSA_MAX_MS = 10 * 60_000;
const cacheClips = new Map<string, MovimientoClip>();
const enVuelo = new Map<string, Promise<MovimientoClip | null>>();
let kimodoPausadoHasta = 0;
let fallosSeguidos = 0;

const claveGesto = (g: Gesto, nivel: NivelMovimiento): string =>
    JSON.stringify([nivel, g.prompt, g.emocion ?? null, g.energia ?? null, g.duracionMs ?? null, g.bucle ?? null]);

/** Hasta cuándo está en pausa la vía Kimodo (ms desde 1970; 0 = abierta). Para paneles y pruebas. */
export function kimodoEnPausaHasta(): number {
    return kimodoPausadoHasta > Date.now() ? kimodoPausadoHasta : 0;
}

/** Solo para pruebas: olvida la caché, las peticiones en vuelo y la pausa. */
export function reiniciarFrenoKimodo(): void {
    cacheClips.clear();
    enVuelo.clear();
    kimodoPausadoHasta = 0;
    fallosSeguidos = 0;
}

function pausarKimodo(retryAfterS?: number | null): void {
    fallosSeguidos += 1;
    const escalonada = Math.min(PAUSA_MAX_MS, PAUSA_BASE_MS * 2 ** (fallosSeguidos - 1));
    const pedida = retryAfterS && retryAfterS > 0 ? Math.min(PAUSA_MAX_MS * 3, retryAfterS * 1000) : 0;
    kimodoPausadoHasta = Date.now() + Math.max(escalonada, pedida);
}

function guardarEnCache(clave: string, clip: MovimientoClip): void {
    if (cacheClips.size >= MAX_CACHE_CLIPS) {
        const primera = cacheClips.keys().next().value;
        if (primera !== undefined) cacheClips.delete(primera);
    }
    cacheClips.set(clave, clip);
}

/**
 * Pide un clip al backend Kimodo (`/api/movimiento/generar`, Ola M2).
 * Sirve a los niveles «vivo» y «fluido». Devuelve `null` si la vía falla, está en pausa o ya hay
 * demasiadas peticiones en vuelo (el motor baja entonces al clip procedural).
 */
async function generarPorKimodo(g: Gesto, nivel: NivelMovimiento): Promise<MovimientoClip | null> {
    if (typeof window === "undefined") return null;
    const clave = claveGesto(g, nivel);
    const guardado = cacheClips.get(clave);
    if (guardado) return guardado;
    const compartida = enVuelo.get(clave);
    if (compartida) return compartida;
    if (Date.now() < kimodoPausadoHasta || enVuelo.size >= MAX_EN_VUELO) return null;
    const peticion = pedirAKimodo(g).then((clip) => {
        if (clip) guardarEnCache(clave, clip);
        return clip;
    }).finally(() => { enVuelo.delete(clave); });
    enVuelo.set(clave, peticion);
    return peticion;
}

async function pedirAKimodo(g: Gesto): Promise<MovimientoClip | null> {
    try {
        // Cuerpo del contrato de POST /api/movimiento/generar (Ola 229 · M2):
        // prompt saneado de hasta 300 caracteres, esqueleto admitido, segundos
        // de 0,5 a 10 y la semilla entera derivada del prompt (la misma del
        // clip procedural), para que el gesto cuadre con la caché del servidor.
        const prompt = g.prompt.trim().slice(0, 300);
        const segundos = Number(Math.min(10, Math.max(0.5, (g.duracionMs ?? 2400) / 1000)).toFixed(2));
        const resp = await fetch("/api/movimiento/generar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, esqueleto: "smplx22", segundos, semilla: semillaDePrompt(prompt) }),
            cache: "no-store",
        });
        if (!resp.ok) {
            // 429 (cupo), 5xx (servidor) o 401/404 (sin sesión o sin vía): la vía descansa; el avatar sigue con «ligero».
            const ra = Number(resp.headers?.get?.("Retry-After"));
            pausarKimodo(Number.isFinite(ra) ? ra : null);
            return null;
        }
        const clip = (await resp.json()) as MovimientoClip;
        if (!clip || !Array.isArray(clip.rotaciones)) return null;
        fallosSeguidos = 0;
        return clip;
    } catch {
        pausarKimodo(null);
        return null;
    }
}

/**
 * Semilla determinista a partir de la frase del gesto: el mismo texto da la
 * misma semilla entería, así que el mismo gesto suena igual en la vía Kimodo
 * y en el clip procedural. Función pura compartida por ambos generadores.
 */
export function semillaDePrompt(prompt: string): number {
    let semilla = 0;
    for (let i = 0; i < prompt.length; i++) semilla = (semilla * 31 + prompt.charCodeAt(i)) >>> 0;
    return semilla;
}

/**
 * Genera un clip procedural (nivel «ligero»): respiración, balanceo suave y
 * énfasis sobre un esqueleto SMPL-X de 22 articulaciones, con seno y ruido
 * filtrado. Funciona también sin ventana (SSR/pruebas).
 */
export function generarClipProcedural(g: Gesto): MovimientoClip {
    const fps = 30;
    const duracionMs = Math.max(200, g.duracionMs ?? 2400);
    const fotogramas = Math.max(2, Math.round((duracionMs / 1000) * fps));
    const articulaciones = 22;
    const energia = Math.min(1, Math.max(0, g.energia ?? 0.5));
    const amplitud = 0.02 + energia * 0.1;

    const rotaciones: number[][] = [];
    const raiz: number[][] = [];
    const semilla = semillaDePrompt(g.prompt);

    for (let f = 0; f < fotogramas; f++) {
        const t = f / fps;
        const fila: number[] = [];
        for (let j = 0; j < articulaciones; j++) {
            const fase = semilla * 0.001 + j * 0.7;
            // Respiración lenta + balanceo + ruido suave de baja amplitud.
            const onda =
                Math.sin(t * Math.PI * 0.5 + fase) * amplitud +
                Math.sin(t * Math.PI * 2.3 + fase * 2) * amplitud * 0.3 +
                Math.sin(t * 11.7 + fase * 5 + semilla % 97) * amplitud * 0.08;
            fila.push(Number(onda.toFixed(5)));
        }
        rotaciones.push(fila);
        // Traslación de raíz: solo balanceo vertical de respiración.
        raiz.push([0, Number((Math.sin(t * Math.PI * 0.5) * amplitud * 0.5).toFixed(5)), 0]);
    }

    return {
        esqueleto: "smplx22",
        fps,
        duracionMs,
        rotaciones,
        raiz,
        origen: "procedural",
    };
}

/** Genera por la vía del nivel dado. «quieto» no produce clip. Nunca lanza. */
async function generar(nivel: NivelMovimiento, g: Gesto): Promise<MovimientoClip | null> {
    if (nivel === "vivo" || nivel === "fluido") return generarPorKimodo(g, nivel);
    if (nivel === "ligero") {
        try {
            return generarClipProcedural(g);
        } catch {
            return null;
        }
    }
    return null;
}

export interface ResultadoMovimiento {
    nivel: NivelMovimiento;
    clip: MovimientoClip | null;
}

/**
 * MUEVE un avatar — entrada única del OS.
 *
 * Resuelve el nivel, genera el clip por el backend de ese nivel y, si falla,
 * baja al `siguienteNivelMovimiento` SIN cambiar el carácter del gesto (la
 * identidad del movimiento es intocable; solo cambia la precisión del motor).
 * Devuelve `clip: null` solo cuando se ha llegado al nivel «quieto». Nunca lanza.
 */
export async function moverAvatar(g: Gesto, op: OpcionesMover = {}): Promise<ResultadoMovimiento> {
    let nivel: NivelMovimiento;
    try {
        nivel = await resolverNivel(op.nivel);
    } catch {
        nivel = "quieto"; // red de seguridad absoluta
    }

    // Cadena de degradación: mismo gesto, niveles cada vez más ligeros.
    let actual: NivelMovimiento | null = nivel;
    while (actual) {
        let clip: MovimientoClip | null = null;
        try {
            clip = await generar(actual, g);
        } catch { /* esta vía falló: se baja de nivel */ }
        if (clip || actual === "quieto") {
            nivelEnUso = actual;
            return { nivel: actual, clip };
        }
        const siguiente: NivelMovimiento | null = siguienteNivelMovimiento(actual);
        if (!siguiente) break;
        try { op.alDegradar?.(actual, siguiente); } catch { /* el aviso no puede romper */ }
        actual = siguiente;
    }
    nivelEnUso = "quieto";
    return { nivel: "quieto", clip: null };
}

/**
 * Precalienta el motor de movimiento en segundo plano: mide el hardware,
 * decide el nivel y deja constancia de él para paneles. El precalentado real
 * del backend Kimodo se cableará en la Ola M2 junto con `/api/movimiento/generar`.
 * Nunca lanza ni bloquea la interfaz.
 */
export async function precalentarMovimiento(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
        nivelEnUso = await resolverNivel();
    } catch { /* precalentar nunca rompe la interfaz */ }
}

/** Etiqueta legible del nivel actual, para paneles («Vivo», «Ligero»…). */
export function nombreNivelMovimientoActual(): string {
    const caps = capacidadesEnCache();
    const nivel = nivelEnUso ?? (caps ? nivelMovimientoPara(caps, prefiereReducirMovimiento()) : null);
    return nivel ? nivel.charAt(0).toUpperCase() + nivel.slice(1) : "Sin determinar";
}
