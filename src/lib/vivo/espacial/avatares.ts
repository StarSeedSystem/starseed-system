/**
 * Escena 3D compartida · AVATARES (L5 · 2026-09-28).
 * ============================================================================
 * Cada persona dentro de la escena es un avatar ligero (cápsula/orbe de color con su nombre)
 * cuya posición y orientación viajan en vivo por broadcast, en el canal de la escena.
 *
 * Presupuesto de tráfico (Supabase gratuito): la pose se emite
 *   · a 10 Hz como MÁXIMO (≥ 100 ms entre envíos), y menos cuando hay mucha gente
 *     (4–7 personas más: ~6,7 Hz; 8 o más: 4 Hz);
 *   · SOLO si te has movido de verdad (> 1 cm o > ~1°), con un envío final de cola para que los
 *     demás vean dónde te quedaste;
 *   · NUNCA si no hay nadie más dentro (nadie que la reciba) ni con la pestaña oculta.
 * Quien entra después pide una pose puntual a los presentes (`forzar`), así que nadie tiene que
 * emitir latidos para «existir».
 *
 * Módulo PURO (el reloj y los temporizadores se inyectan).
 */

import { textoLimpio, type Vec3 } from "./modelo";

export type Quat = [number, number, number, number];

export interface Pose {
    p: Vec3;
    q: Quat;
}

export type ModoAvatar = "3d" | "vr" | "ar";

export interface MetaAvatar {
    /** Clave de presencia (única por pestaña). */
    clave: string;
    uid: string | null;
    nombre: string;
    color: string;
    modo: ModoAvatar;
    /** ¿Declara poder editar? (solo informativo: quien decide es el servidor). */
    editor: boolean;
    /** ms de entrada. */
    desde: number;
}

export const PALETA_AVATARES = ["#7C5CFF", "#007FFF", "#10B981", "#FFBF00", "#DC143C", "#14B8A6", "#F97316", "#EC4899", "#39FF14"] as const;

/** Color estable para una clave (misma persona/pestaña → mismo color en todas las pantallas). */
export function colorDeClave(clave: string): string {
    let h = 2166136261;
    for (let i = 0; i < clave.length; i++) {
        h ^= clave.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return PALETA_AVATARES[(h >>> 0) % PALETA_AVATARES.length];
}

function finito(v: unknown, min: number, max: number): number | null {
    return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;
}

/** Pose de fuera → pose válida (o null). Normaliza el cuaternión. */
export function sanearPose(v: unknown): Pose | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (!Array.isArray(o.p) || o.p.length !== 3 || !Array.isArray(o.q) || o.q.length !== 4) return null;
    const p = o.p.map((x) => finito(x, -1000, 1000));
    const q = o.q.map((x) => finito(x, -1, 1));
    if (p.some((x) => x === null) || q.some((x) => x === null)) return null;
    const [x, y, z, w] = q as number[];
    const n = Math.hypot(x, y, z, w);
    if (n < 1e-6) return { p: p as Vec3, q: [0, 0, 0, 1] };
    return { p: p as Vec3, q: [x / n, y / n, z / n, w / n] };
}

export function sanearMetaAvatar(v: unknown, clave: string): MetaAvatar | null {
    if (!v || typeof v !== "object" || !clave) return null;
    const o = v as Record<string, unknown>;
    const modo: ModoAvatar = o.modo === "vr" || o.modo === "ar" ? o.modo : "3d";
    const color = typeof o.color === "string" && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : colorDeClave(clave);
    return {
        clave,
        uid: typeof o.uid === "string" && /^[0-9a-f-]{36}$/i.test(o.uid) ? o.uid : null,
        nombre: textoLimpio(o.nombre, 40) || "Persona",
        color,
        modo,
        editor: o.editor === true,
        desde: typeof o.desde === "number" && Number.isFinite(o.desde) ? o.desde : 0,
    };
}

/**
 * Presencia de Supabase (`{ clave: [meta, …] }`) → lista de avatares ordenada y sin mí.
 * Si una clave publicó varias metas (reconexiones), vale la última.
 */
export function avataresDePresencia(estado: Record<string, unknown>, miClave: string): MetaAvatar[] {
    const lista: MetaAvatar[] = [];
    for (const [clave, metas] of Object.entries(estado ?? {})) {
        if (clave === miClave || !Array.isArray(metas) || metas.length === 0) continue;
        const m = sanearMetaAvatar(metas[metas.length - 1], clave);
        if (m) lista.push(m);
    }
    return lista.sort((a, b) => a.desde - b.desde || (a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0));
}

/** ¿Son iguales dos listas de avatares? (para no cambiar el snapshot si nada cambió). */
export function mismosAvatares(a: readonly MetaAvatar[], b: readonly MetaAvatar[]): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        if (x.clave !== y.clave || x.nombre !== y.nombre || x.color !== y.color || x.modo !== y.modo || x.editor !== y.editor || x.uid !== y.uid) {
            return false;
        }
    }
    return true;
}

// ───────────────────────────── Emisor de pose con estrangulador ─────────────────────────────

export const INTERVALO_MIN_MS = 100; // 10 Hz como máximo
export const UMBRAL_POSICION = 0.01; // 1 cm
export const UMBRAL_GIRO = 0.0175; // ~1°

/** Intervalo entre envíos según cuánta gente hay (0 = no emitir: no hay nadie). */
export function intervaloPara(otros: number): number {
    if (otros <= 0) return 0;
    if (otros <= 3) return INTERVALO_MIN_MS;
    if (otros <= 7) return 150;
    return 250;
}

/** Ángulo (rad) entre dos orientaciones. */
export function anguloEntre(a: Quat, b: Quat): number {
    const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    return 2 * Math.acos(Math.min(1, d));
}

export function sehaMovido(a: Pose, b: Pose, umbralPos = UMBRAL_POSICION, umbralGiro = UMBRAL_GIRO): boolean {
    const dp = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]);
    return dp > umbralPos || anguloEntre(a.q, b.q) > umbralGiro;
}

export interface OpcionesEmisor {
    enviar: (pose: Pose) => void;
    ahora?: () => number;
    programar?: (fn: () => void, ms: number) => unknown;
    cancelar?: (id: unknown) => void;
}

export interface EmisorPose {
    /** Llamar en cada fotograma con la pose actual de la cámara. */
    actualizar(pose: Pose): void;
    /** Cuánta gente más hay dentro (0 → no se emite nada). */
    fijarOtros(n: number): void;
    /** Pestaña oculta / visible. */
    pausar(): void;
    reanudar(): void;
    /** Envía ya la última pose (para quien acaba de entrar), respetando el intervalo mínimo. */
    forzar(): void;
    /** Envíos hechos (diagnóstico y pruebas). */
    enviados(): number;
    destruir(): void;
}

function copiar(p: Pose): Pose {
    return { p: [p.p[0], p.p[1], p.p[2]], q: [p.q[0], p.q[1], p.q[2], p.q[3]] };
}

export function crearEmisorPose(o: OpcionesEmisor): EmisorPose {
    const ahora = o.ahora ?? (() => Date.now());
    const programar = o.programar ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
    const cancelar = o.cancelar ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
    let ultimaEnviada: Pose | null = null;
    let actual: Pose | null = null;
    let tUltimo = -Infinity;
    let otros = 0;
    let pausado = false;
    let cola: unknown = null;
    let total = 0;
    let vivo = true;

    const puedeEmitir = () => vivo && !pausado && otros > 0 && actual !== null;

    const enviarYa = () => {
        if (!puedeEmitir() || !actual) return;
        ultimaEnviada = copiar(actual);
        tUltimo = ahora();
        total += 1;
        try {
            o.enviar(copiar(actual));
        } catch {
            /* el canal decide; aquí no se reintenta */
        }
    };

    const limpiarCola = () => {
        if (cola !== null) {
            cancelar(cola);
            cola = null;
        }
    };

    const programarCola = () => {
        if (cola !== null) return;
        const espera = Math.max(0, intervaloPara(otros) - (ahora() - tUltimo));
        cola = programar(() => {
            cola = null;
            if (puedeEmitir() && actual && (!ultimaEnviada || sehaMovido(actual, ultimaEnviada))) enviarYa();
        }, espera);
    };

    const forzar = () => {
        if (!puedeEmitir()) return;
        ultimaEnviada = null; // obliga a enviar aunque no haya movimiento
        if (ahora() - tUltimo >= intervaloPara(otros)) {
            limpiarCola();
            enviarYa();
        } else {
            programarCola();
        }
    };

    return {
        actualizar(pose) {
            actual = copiar(pose);
            if (!puedeEmitir()) return;
            if (ultimaEnviada && !sehaMovido(pose, ultimaEnviada)) return;
            if (ahora() - tUltimo >= intervaloPara(otros)) {
                limpiarCola();
                enviarYa();
            } else {
                programarCola();
            }
        },
        fijarOtros(n) {
            const antes = otros;
            otros = Math.max(0, Math.floor(n));
            if (otros === 0) limpiarCola();
            // Alguien entró: que vea dónde estoy aunque no me mueva.
            if (otros > antes && otros > 0) forzar();
        },
        pausar() {
            pausado = true;
            limpiarCola();
        },
        reanudar() {
            pausado = false;
        },
        forzar,
        enviados: () => total,
        destruir() {
            vivo = false;
            limpiarCola();
        },
    };
}

// ───────────────────────────── Estrangulador genérico (arrastres) ─────────────────────────────

/**
 * Estrangulador «primero + cola»: el primer valor sale ya, los siguientes como mucho cada
 * `intervaloMs`, y el último siempre llega. Para la vista previa de un objeto que se arrastra.
 */
export function crearEstrangulador<T>(
    enviar: (v: T) => void,
    intervaloMs: number,
    reloj: Pick<OpcionesEmisor, "ahora" | "programar" | "cancelar"> = {},
): { empujar(v: T): void; vaciar(): void; cancelar(): void } {
    const ahora = reloj.ahora ?? (() => Date.now());
    const programar = reloj.programar ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
    const cancelarT = reloj.cancelar ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
    let t = -Infinity;
    let pendiente: { v: T } | null = null;
    let id: unknown = null;
    const salir = () => {
        id = null;
        if (!pendiente) return;
        const { v } = pendiente;
        pendiente = null;
        t = ahora();
        enviar(v);
    };
    return {
        empujar(v) {
            if (ahora() - t >= intervaloMs && id === null) {
                t = ahora();
                enviar(v);
                return;
            }
            pendiente = { v };
            if (id === null) id = programar(salir, Math.max(0, intervaloMs - (ahora() - t)));
        },
        vaciar() {
            if (id !== null) cancelarT(id);
            salir();
        },
        cancelar() {
            if (id !== null) cancelarT(id);
            id = null;
            pendiente = null;
        },
    };
}
