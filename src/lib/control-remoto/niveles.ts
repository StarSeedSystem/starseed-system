/**
 * Control entre mis neuronas · niveles y vocabulario CERRADO de órdenes (ORD1114P · contrato
 * `architecture/control-remoto-entre-neuronas.md` §2.1 y §2.3, fase 1 de §8).
 *
 * Puro, sin `node:*`, nunca lanza. Fase 1 = solo órdenes dirigidas a la propia app (llamadas, rutas,
 * estado). Ninguna cadena de una orden llega al motor, a un shell ni al DOM como código: cada acción
 * tiene sus argumentos tipados y validados aquí; una acción que no está en la lista se rechaza, nunca
 * se adivina.
 */

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
    que: string;
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
