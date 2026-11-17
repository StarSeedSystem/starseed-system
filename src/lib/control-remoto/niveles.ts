/**
 * Control entre mis neuronas · niveles y vocabulario CERRADO de órdenes (ORD1114P · contrato
 * `architecture/control-remoto-entre-neuronas.md` §2.1 y §2.3, fase 1 de §8).
 *
 * Puro, sin `node:*`, nunca lanza. Fase 1 = solo órdenes dirigidas a la propia app (llamadas, rutas,
 * estado). Ninguna cadena de una orden llega al motor, a un shell ni al DOM como código: cada acción
 * tiene sus argumentos tipados y validados aquí; una acción que no está en la lista se rechaza, nunca
 * se adivina.
 */

import { RE_NEG, MAX_PARTES, leerParte } from "./senal-partes";

export type Nivel = "ver" | "controlar" | "modificar" | "administrar";
export const NIVELES: readonly Nivel[] = ["ver", "controlar", "modificar", "administrar"];

/**
 * Techo de la fase 1: el dueño solo puede conceder «ver» o «controlar». «modificar» (archivos, ajustes,
 * procesos) exige «Acceso al equipo» dado en el aparato y «administrar» exige ser dueño: llegan en
 * fases posteriores y aquí se rechazan siempre.
 */
export const NIVELES_CONCEDIBLES_FASE1: readonly Nivel[] = ["ver", "controlar"];

export function rangoNivel(n: unknown): number {
    return typeof n === "string" ? NIVELES.indexOf(n as Nivel) : -1;
}

export function esNivel(n: unknown): n is Nivel {
    return rangoNivel(n) >= 0;
}

/** El menor de dos niveles (el nivel efectivo de una sesión, §2.3). */
export function nivelMinimo(a: Nivel, b: Nivel): Nivel {
    return rangoNivel(a) <= rangoNivel(b) ? a : b;
}

export type Args = Record<string, unknown>;
type Validador = (a: Args) => Args | null;

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_ID_BANCO = /^[a-z0-9][a-z0-9-]{2,39}$/;
/** Ruta interna de la app: empieza por «/», solo minúsculas, cifras, «-», «_» y «/»; sin «//» ni «..». */
const RE_RUTA = /^\/[a-z0-9_\-/]{0,120}$/;

function soloClaves(a: Args, permitidas: string[]): boolean {
    return Object.keys(a).every((k) => permitidas.includes(k));
}

function sinArgs(a: Args): Args | null {
    return Object.keys(a).length === 0 ? {} : null;
}

function interruptor(a: Args): Args | null {
    return soloClaves(a, ["activo"]) && typeof a.activo === "boolean" ? { activo: a.activo } : null;
}

/** La marca del banco que acompaña a «contestar» (contrato de la ronda §9.2). Opcional. */
function marcaBanco(x: unknown): { esc: string; serie: string; n: number } | null | undefined {
    if (x === undefined) return undefined;
    if (!x || typeof x !== "object" || Array.isArray(x)) return null;
    const b = x as Args;
    if (!soloClaves(b, ["esc", "serie", "n"])) return null;
    if (typeof b.esc !== "string" || !RE_ID_BANCO.test(b.esc)) return null;
    if (typeof b.serie !== "string" || !RE_ID_BANCO.test(b.serie)) return null;
    if (typeof b.n !== "number" || !Number.isInteger(b.n) || b.n < 1 || b.n > 999) return null;
    return { esc: b.esc, serie: b.serie, n: b.n };
}

export interface DefAccion {
    nivel: Nivel;
    validar: Validador;
    /** Cambia el estado de la app sin parecerse a la realidad: la línea del registro lo dice («SIMULACIÓN»). */
    simulacion?: boolean;
    /** No necesita sesión abierta (solo abrir una). */
    sinSesion?: boolean;
    /** (PAN1115J) Orden de entrada (toque, tecla, volumen, brillo, texto): va al lado nativo con su sobre intacto y tiene su propio tope. */
    entrada?: boolean;
    /** (SEN1116A) Señalización de vídeo: varias órdenes seguidas; cuenta en el tope de entrada (60/s), no en el de órdenes de app. */
    senal?: boolean;
    que: string;
}

// ── PAN1115J · pantalla y entrada (contrato §12) ─────────────────────────────────────────────

export const MAX_DEDOS = 10;
export const MAX_PUNTOS_DEDO = 64;
export const MAX_TEXTO = 512;
export const MAX_CANDIDATOS = 8;
export const MAX_CANDIDATO = 400;
export const MAX_DT_MS = 10_000;
/** Teclas del sistema que se pueden mandar (lista cerrada). */
export const TECLAS: readonly string[] = ["atras", "inicio", "recientes", "notificaciones", "ajustes-rapidos", "bloquear", "captura", "volumen-subir", "volumen-bajar", "silencio", "menu-energia"];
export const FLUJOS_VOLUMEN: readonly string[] = ["multimedia", "llamada", "timbre", "alarma"];

function entero(x: unknown, min: number, max: number): x is number {
    return typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;
}
function unidad(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
}
const redondear = (x: number): number => Math.round(x * 10_000) / 10_000;

function validarPantallaIniciar(a: Args): Args | null {
    if (!soloClaves(a, ["lado", "calidad", "fuente"])) return null;
    const r: Args = {};
    if (a.fuente !== undefined) {
        // RST1116A: la persona pide «proyeccion» (pantalla fluida) o deja «auto»; cualquier otra cosa rechaza la orden.
        if (a.fuente !== "auto" && a.fuente !== "proyeccion") return null;
        r.fuente = a.fuente;
    }
    if (a.lado !== undefined) {
        if (!entero(a.lado, 240, 2048)) return null;
        r.lado = a.lado;
    }
    if (a.calidad !== undefined) {
        if (!entero(a.calidad, 1, 100)) return null; // UNI1115M · costura b: entero 1..100 en la web y en lo nativo
        r.calidad = a.calidad;
    }
    return r;
}

function validarSenal(a: Args): Args | null {
    // SEN1116A: oferta y respuesta viajan en partes numeradas (`senal-partes.ts`); los candidatos, sueltos y cortos.
    if (a.candidatos !== undefined) {
        if (!soloClaves(a, ["candidatos"]) || !Array.isArray(a.candidatos) || a.candidatos.length < 1 || a.candidatos.length > MAX_CANDIDATOS) return null;
        for (const c of a.candidatos) if (typeof c !== "string" || c.length > MAX_CANDIDATO || !/^(candidate:[\x21-\x7e ]+)?$/.test(c)) return null;
        return { candidatos: a.candidatos };
    }
    // Pedir la parte `i` de la respuesta del aparato.
    if (a.pide !== undefined) {
        if (!soloClaves(a, ["neg", "pide"]) || typeof a.neg !== "string" || !RE_NEG.test(a.neg) || !entero(a.pide, 0, MAX_PARTES - 1)) return null;
        return { neg: a.neg, pide: a.pide };
    }
    return leerParte(a) as Args | null;
}

function validarGesto(a: Args): Args | null {
    if (!soloClaves(a, ["dedos", "sigue"]) || typeof a.sigue !== "boolean") return null;
    if (!Array.isArray(a.dedos) || a.dedos.length < 1 || a.dedos.length > MAX_DEDOS) return null;
    const ids = new Set<number>();
    const dedos: { id: number; puntos: [number, number, number][] }[] = [];
    for (const d of a.dedos) {
        if (!d || typeof d !== "object" || Array.isArray(d)) return null;
        const o = d as Args;
        if (!soloClaves(o, ["id", "puntos"]) || !entero(o.id, 0, MAX_DEDOS - 1) || ids.has(o.id)) return null;
        ids.add(o.id);
        if (!Array.isArray(o.puntos) || o.puntos.length < 1 || o.puntos.length > MAX_PUNTOS_DEDO) return null;
        const puntos: [number, number, number][] = [];
        for (const p of o.puntos) {
            if (!Array.isArray(p) || p.length !== 3 || !unidad(p[0]) || !unidad(p[1]) || !entero(p[2], 0, MAX_DT_MS)) return null;
            puntos.push([redondear(p[0]), redondear(p[1]), p[2]]);
        }
        dedos.push({ id: o.id, puntos });
    }
    return { dedos, sigue: a.sigue };
}

function validarTexto(a: Args): Args | null {
    if (!soloClaves(a, ["texto"]) || typeof a.texto !== "string") return null;
    const n = [...a.texto].length;
    // Sin caracteres de control salvo salto de línea y tabulación (nada que se parezca a una orden).
    if (n < 1 || n > MAX_TEXTO || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(a.texto)) return null;
    return { texto: a.texto };
}

export const ACCIONES: Readonly<Record<string, DefAccion>> = {
    "abrir-sesion": { nivel: "ver", sinSesion: true, validar: sinArgs, que: "abre una sesión; el destino dice su nivel y sus capacidades" },
    "cerrar-sesion": { nivel: "ver", validar: sinArgs, que: "cierra la sesión" },
    "leer-estado": { nivel: "ver", validar: sinArgs, que: "ruta, llamada y sus números, enlaces y su medio, versión y build" },
    llamar: {
        nivel: "controlar",
        validar: (a) =>
            soloClaves(a, ["neurona", "tipo"]) && typeof a.neurona === "string" && RE_UUID.test(a.neurona) && (a.tipo === "audio" || a.tipo === "video")
                ? { neurona: a.neurona.toLowerCase(), tipo: a.tipo }
                : null,
        que: "llama (voz o vídeo) a una neurona de la cuenta",
    },
    contestar: {
        nivel: "controlar",
        validar: (a) => {
            if (!soloClaves(a, ["camara", "banco"]) || typeof a.camara !== "boolean") return null;
            const b = marcaBanco(a.banco);
            if (b === null) return null;
            return b ? { camara: a.camara, banco: b } : { camara: a.camara };
        },
        que: "contesta el timbre que está sonando",
    },
    colgar: { nivel: "controlar", validar: sinArgs, que: "cuelga la llamada en curso" },
    micro: { nivel: "controlar", validar: interruptor, que: "enciende o apaga el micrófono de la llamada" },
    camara: { nivel: "controlar", validar: interruptor, que: "enciende o apaga la cámara de la llamada" },
    "abrir-ruta": {
        nivel: "controlar",
        validar: (a) =>
            soloClaves(a, ["ruta"]) && typeof a.ruta === "string" && RE_RUTA.test(a.ruta) && !a.ruta.includes("//") && !a.ruta.includes("..")
                ? { ruta: a.ruta }
                : null,
        que: "abre una ruta de la propia app (nunca una URL externa)",
    },
    "simular-corte-ip": {
        nivel: "controlar",
        simulacion: true,
        validar: sinArgs,
        que: "SIMULACIÓN: la llamada se comporta como si no hubiera ruta IP (fuerza voz y vídeo al Bluetooth); nunca cuenta como la prueba real",
    },
    // PAN1115J · pantalla y entrada (contrato §12). Los de entrada los ejecuta el lado nativo (`control_entrada`).
    "pantalla-iniciar": { nivel: "ver", validar: validarPantallaIniciar, que: "empieza a mandar la pantalla de este aparato (la fuente la elige la persona en él)" },
    "pantalla-parar": { nivel: "ver", validar: sinArgs, que: "deja de mandar la pantalla" },
    "pantalla-senal": { nivel: "ver", senal: true, validar: validarSenal, que: "negocia la conexión de vídeo (oferta y candidatos); la respuesta lleva la contestación" },
    "leer-aparato": { nivel: "ver", validar: sinArgs, que: "volumen, brillo, batería, red y pantalla del aparato" },
    gesto: { nivel: "controlar", entrada: true, validar: validarGesto, que: "toque, deslizamiento o multitáctil (hasta 10 dedos)" },
    tecla: {
        nivel: "controlar",
        entrada: true,
        validar: (a) => (soloClaves(a, ["cual"]) && typeof a.cual === "string" && TECLAS.includes(a.cual) ? { cual: a.cual } : null),
        que: "una tecla del sistema (atrás, inicio, recientes, volumen…)",
    },
    volumen: {
        nivel: "controlar",
        entrada: true,
        validar: (a) => (soloClaves(a, ["flujo", "nivel"]) && typeof a.flujo === "string" && FLUJOS_VOLUMEN.includes(a.flujo) && unidad(a.nivel) ? { flujo: a.flujo, nivel: redondear(a.nivel) } : null),
        que: "pone un volumen del aparato (0 a 1)",
    },
    brillo: { nivel: "controlar", entrada: true, validar: (a) => (soloClaves(a, ["nivel"]) && unidad(a.nivel) ? { nivel: redondear(a.nivel) } : null), que: "pone el brillo del aparato (0 a 1)" },
    texto: { nivel: "controlar", entrada: true, validar: validarTexto, que: "escribe un texto (hasta 512 caracteres) en el campo con foco" },
    "simular-vuelve-ip": { nivel: "controlar", simulacion: true, validar: sinArgs, que: "SIMULACIÓN: deshace «simular-corte-ip»" },
};

export function definicion(nombre: unknown): DefAccion | null {
    return typeof nombre === "string" && Object.prototype.hasOwnProperty.call(ACCIONES, nombre) ? ACCIONES[nombre] : null;
}

/** Las acciones que admite una sesión de nivel `n` (la «lista de capacidades» que emite el destino, §2.1). */
export function capacidadesDeNivel(n: Nivel): string[] {
    return Object.entries(ACCIONES)
        .filter(([, d]) => rangoNivel(d.nivel) <= rangoNivel(n))
        .map(([k]) => k);
}
