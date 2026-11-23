/**
 * Control entre mis neuronas · el puente con el lado NATIVO del aparato controlado (ORD1114Q · contrato
 * `control-remoto-entre-neuronas.md` §1 caso H y §2.4).
 *
 * La sesión, el indicador, la parada y el registro encadenado viven en Rust (`control_neuronas.rs`): la
 * página pide abrir la sesión (Rust pone el indicador o se niega), pide permiso antes de CADA orden y
 * Rust la anota. Si la persona pulsa «Terminar el control ahora» en el indicador, Rust cierra la sesión
 * aunque esta página esté colgada: la orden siguiente ya no tiene sesión.
 *
 * Fuera de la app nativa (navegador) no hay puente y la puerta lo rechaza todo con «sin-indicador-nativo».
 * (ORD1114T) Dentro de la app el puente siempre llama a Rust, que es quien decide: macOS y Android enseñan
 * el indicador completo de §2.4 (en Android, Kotlin); Windows, Linux e iOS se niegan. Así, en Android, la
 * primera petición de sesión (o encender el permiso aquí) hace que Kotlin enseñe su diálogo NATIVO del
 * interruptor y, con su «Sí», pida los permisos del sistema; la siguiente sesión ya entra.
 */

import { FALTA_WEBRTC_LINUX, esLinuxEscritorio, faltaWebrtcLinux, lineaWebrtcLinux, type EstadoWebrtcLinux } from "./webrtc-linux";

export interface RespuestaNativa {
    ok: boolean;
    token?: string;
    motivo?: string;
    /** (IND1115F) Con «sin-indicador-nativo»: lo que falta y el paso en que quedó (`falta`, `paso`, `error`, `tras`, `motivo`).
     * (CTL1117C) Con «parada-nativa»: `motivo` = por qué paró DE VERDAD lo nativo (`caducada`, `sin-indicador`, `la-persona-desde-…`). */
    detalle?: Record<string, string>;
}

export interface PuenteNativoControl {
    /** ¿Hay app nativa con su lado de control? (sin ella, nada se acepta). */
    disponible(): boolean;
    /** FSG1116 · A2: `sobre` = la orden firmada `abrir-sesion` tal como llegó. En Android lo nativo la comprueba y saca
     * de su lista aceptada el controlador y el NOMBRE del indicador; `de` y `nombre` de la página no cuentan allí. */
    abrir(de: string, nombre: string, nivel: string, sobre?: unknown): Promise<RespuestaNativa>;
    /** Permiso de Rust para ejecutar UNA orden de la sesión `token`. */
    orden(token: string, nombre: string): Promise<RespuestaNativa>;
    /** Apunta en el registro encadenado una orden que la puerta rechazó (no concede nada). */
    anotar(nombre: string, de: string, resultado: string): void;
    parar(motivo: string, token?: string): Promise<void>;
}

/** Sin app nativa: nada disponible (la puerta rechaza «sin-indicador-nativo»). */
export const SIN_NATIVO: PuenteNativoControl = {
    disponible: () => false,
    abrir: async () => ({ ok: false, motivo: "sin-indicador-nativo" }),
    orden: async () => ({ ok: false, motivo: "sin-indicador-nativo" }),
    anotar: () => undefined,
    parar: async () => undefined,
};

type Invocar = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function invocador(): Invocar | null {
    const t = (globalThis as { __TAURI__?: { core?: { invoke?: Invocar } } }).__TAURI__;
    return typeof t?.core?.invoke === "function" ? t.core.invoke : null;
}

const RE_ERROR_NATIVO = /^([a-z-]{1,32})((?: [a-z]{1,12}=[a-z0-9:_.,-]{0,80}){0,6})$/;

/** (IND1115F) «sin-indicador-nativo falta=a,b paso=x tras=40» → el código y sus pares `clave=valor`. */
export function partirErrorNativo(e: unknown): { motivo: string; detalle?: Record<string, string> } {
    const m = typeof e === "string" ? e : e instanceof Error ? e.message : "";
    const r = RE_ERROR_NATIVO.exec(m);
    if (!r) return { motivo: "nativo-fallo" };
    const detalle: Record<string, string> = {};
    for (const par of r[2].trim().split(" ")) {
        const i = par.indexOf("=");
        if (i > 0) detalle[par.slice(0, i)] = par.slice(i + 1);
    }
    return Object.keys(detalle).length ? { motivo: r[1], detalle } : { motivo: r[1] };
}

/** Puente real (Tauri). `indicadorPosible` lo dice Rust al arrancar (`control_neuronas_estado`). */
export function crearPuenteTauri(_indicadorPosible?: boolean): PuenteNativoControl {
    // ORD1114T: Rust decide en cada «abrir» (el indicador puede pasar a posible tras el diálogo nativo).
    const inv = invocador();
    if (!inv) return SIN_NATIVO;
    return {
        disponible: () => true,
        abrir: async (de, nombre, nivel, sobre) => {
            try {
                const token = await inv("control_neuronas_abrir", { de, nombre, nivel, sobre: sobre ?? null });
                return typeof token === "string" ? { ok: true, token } : { ok: false, motivo: "nativo-fallo" };
            } catch (e) {
                return { ok: false, ...partirErrorNativo(e) };
            }
        },
        orden: async (token, nombre) => {
            try {
                await inv("control_neuronas_orden", { token, nombre });
                return { ok: true };
            } catch (e) {
                const { motivo, detalle } = partirErrorNativo(e);
                return detalle ? { ok: false, motivo, detalle } : { ok: false, motivo };
            }
        },
        anotar: (nombre, de, resultado) => {
            void inv("control_neuronas_anotar", { nombre, de, resultado }).catch(() => undefined);
        },
        parar: async (motivo, token) => {
            await inv("control_neuronas_parar", token ? { motivo, token } : { motivo }).catch(() => undefined);
        },
    };
}

/** Lee en Rust si este aparato puede enseñar el indicador y monta el puente. Nunca lanza. */
export async function puenteNativoControl(): Promise<PuenteNativoControl> {
    const inv = invocador();
    if (!inv) return SIN_NATIVO;
    try {
        const e = (await inv("control_neuronas_estado")) as { indicador_posible?: boolean } | null;
        return crearPuenteTauri(e?.indicador_posible === true);
    } catch {
        return SIN_NATIVO;
    }
}

/** Escucha la parada que hace Rust (indicador, caducidad, indicador perdido). Devuelve cómo dejar de escuchar. */
export async function alPararNativo(cb: (motivo: string) => void): Promise<() => void> {
    const t = (globalThis as { __TAURI__?: { event?: { listen?: (ev: string, f: (e: { payload?: { motivo?: string } }) => void) => Promise<() => void> } } }).__TAURI__;
    if (typeof t?.event?.listen !== "function") return () => undefined;
    try {
        return await t.event.listen("control-neuronas:parada", (e) => cb(typeof e.payload?.motivo === "string" ? e.payload.motivo : "parada"));
    } catch {
        return () => undefined;
    }
}

/**
 * (ORD1114T) La persona encendió «dejar que me controlen» en ESTE aparato. En Android, Rust pide a Kotlin su
 * diálogo nativo (y, con su «Sí», los permisos con los diálogos del sistema); en el resto no hace nada.
 * Nunca enciende nada por sí mismo. Nunca lanza.
 */
export async function prepararIndicadorNativo(que?: string): Promise<{ indicadorPosible: boolean; falta: string[] } | null> {
    const inv = invocador();
    if (!inv) return null;
    try {
        const e = (await inv("control_neuronas_preparar", que ? { que } : undefined)) as { indicador_posible?: boolean; falta?: unknown } | null;
        const falta = Array.isArray(e?.falta) ? e.falta.filter((x): x is string => typeof x === "string") : [];
        return { indicadorPosible: e?.indicador_posible === true, falta };
    } catch {
        return null;
    }
}

/** (ORD1114V) Apaga el interruptor nativo de este aparato (Rust no pide nada para apagar). Nunca lanza. */
export async function apagarInterruptorNativo(): Promise<void> {
    const inv = invocador();
    if (!inv) return;
    await inv("control_neuronas_parar", { motivo: "apagado-por-el-dueno" }).catch(() => undefined);
}

/** (IND1115F) Lo que falta para el indicador de ESTE aparato y por qué se negó la última sesión (null fuera de la app). */
export interface EstadoIndicador {
    indicadorPosible: boolean;
    falta: string[];
    ultimoRechazo: { haceMs: number; falta: string[]; paso: string; error: string; trasMs: number } | null;
}

function textos(x: unknown): string[] {
    return Array.isArray(x) ? x.filter((v): v is string => typeof v === "string").slice(0, 8) : [];
}

export async function estadoIndicadorNativo(): Promise<EstadoIndicador | null> {
    const inv = invocador();
    if (!inv) return null;
    try {
        const e = (await inv("control_neuronas_estado")) as {
            indicador_posible?: boolean;
            falta?: unknown;
            ultimo_rechazo?: { hace_ms?: number; falta?: unknown; paso?: string; error?: string; tras_ms?: number } | null;
        } | null;
        const r = e?.ultimo_rechazo;
        return {
            indicadorPosible: e?.indicador_posible === true,
            falta: textos(e?.falta),
            ultimoRechazo: r
                ? { haceMs: Number(r.hace_ms) || 0, falta: textos(r.falta), paso: String(r.paso ?? "").slice(0, 40), error: String(r.error ?? "").slice(0, 80), trasMs: Number(r.tras_ms) || 0 }
                : null,
        };
    } catch {
        return null;
    }
}

/** (IND1115F) Lo que se puede pedir con un botón: abre YA el diálogo o la pantalla de Ajustes de esa cosa. */
export type CosaQueFalta = "interruptor" | "notificaciones" | "superposicion";
export const COSAS_QUE_FALTAN: readonly CosaQueFalta[] = ["interruptor", "notificaciones", "superposicion"];

// ── UNI1115M · pantalla y entrada: lo que el panel de ESTE aparato pide a lo nativo (seam 1) ─────────────────────

/** Lo que dice `control_capacidades` (null fuera de la app nativa o si el aparato no lo soporta). */
export interface CapacidadesNativas {
    pantalla: { accesibilidad: boolean; proyeccion: boolean; sinPreguntar: boolean };
    entrada: { gestos: boolean; maxDedos: number; teclas: string[]; volumen: boolean; brillo: boolean; texto: boolean };
    falta: string[];
}

export const AJUSTES_QUE_FALTAN = ["servicio-accesibilidad", "ajustes-restringidos", "consentimiento-pantalla", "escribir-ajustes", "grabacion-pantalla", "accesibilidad-mac", "wayland", "sin-pantalla-x11", "entrada-x11", "webrtc-linux"] as const; // CTL1117M: los dos del Mac · CTL1118L: los tres de Linux (sin botón: es la sesión, no un permiso)
export type AjusteQueFalta = (typeof AJUSTES_QUE_FALTAN)[number];

export async function capacidadesNativas(): Promise<CapacidadesNativas | null> {
    const inv = invocador();
    if (!inv) return null;
    try {
        const r = (await inv("control_capacidades")) as { ok?: boolean; pantalla?: Record<string, unknown>; entrada?: Record<string, unknown>; falta?: unknown } | null;
        if (!r || r.ok === false || !r.pantalla || !r.entrada) return null;
        const e = r.entrada;
        return {
            pantalla: { accesibilidad: r.pantalla.accesibilidad === true, proyeccion: r.pantalla.proyeccion === true, sinPreguntar: r.pantalla.sin_preguntar === true },
            entrada: {
                gestos: e.gestos === true,
                maxDedos: Number.isFinite(Number(e.max_dedos)) ? Math.max(0, Math.min(10, Math.floor(Number(e.max_dedos)))) : 0,
                teclas: Array.isArray(e.teclas) ? e.teclas.filter((t): t is string => typeof t === "string").slice(0, 16) : [],
                volumen: e.volumen === true,
                brillo: e.brillo === true,
                texto: e.texto === true,
            },
            falta: await conFaltaWebrtc(textos(r.falta), inv),
        };
    } catch {
        return null;
    }
}

let webrtcAnotado = "";
/** CTL1118M: en Linux, si no hay WebRTC utilizable (o faltan elementos de GStreamer) se dice en «falta» y en enlaces.log (una vez por cambio). */
async function conFaltaWebrtc(falta: string[], inv: NonNullable<ReturnType<typeof invocador>>): Promise<string[]> {
    try {
        const linux = esLinuxEscritorio(typeof navigator === "undefined" ? undefined : navigator.userAgent);
        if (!linux) return falta;
        const hayPeer = typeof RTCPeerConnection === "function";
        const n = (await inv("webrtc_linux_estado").catch(() => null)) as (Partial<EstadoWebrtcLinux> & { faltan?: unknown }) | null;
        const nativo: EstadoWebrtcLinux | null = n && n.linux === true ? { linux: true, sabido: n.sabido === true, faltan: textos(n.faltan) } : null;
        if (!faltaWebrtcLinux({ linux, hayPeer, nativo })) return falta;
        const linea = lineaWebrtcLinux({ hayPeer, nativo });
        if (linea !== webrtcAnotado) {
            webrtcAnotado = linea;
            void inv("ble_registro_anexar", { lineas: [linea] }).catch(() => undefined);
        }
        return falta.includes(FALTA_WEBRTC_LINUX) ? falta : [...falta, FALTA_WEBRTC_LINUX];
    } catch {
        return falta;
    }
}

/** Abre YA la pantalla de Ajustes (o el diálogo nativo) donde la PERSONA arregla una cosa que falta. No concede nada. */
export async function abrirAjusteNativo(cual: AjusteQueFalta): Promise<{ ok: boolean; motivo?: string }> {
    const inv = invocador();
    if (!inv) return { ok: false, motivo: "sin-soporte" };
    try {
        const r = (await inv("control_abrir_ajuste", { cual })) as { ok?: boolean; motivo?: string } | null;
        return { ok: r?.ok === true, motivo: typeof r?.motivo === "string" ? r.motivo : undefined };
    } catch {
        return { ok: false, motivo: "nativo-fallo" };
    }
}

/**
 * Pide el diálogo NATIVO que enseña el código del controlador. No acepta nada: lo acepta la persona con el «Sí»
 * de ese diálogo. Sin app nativa, o fuera de Android, devuelve «sin-soporte».
 */
export async function aceptarControladorNativo(spki: string, cuenta: string, nombre: string): Promise<{ ok: boolean; pendiente?: boolean; codigo?: string; motivo?: string }> {
    const inv = invocador();
    if (!inv) return { ok: false, motivo: "sin-soporte" };
    try {
        const r = (await inv("control_entrada_aceptar", { spki, cuenta, nombre })) as { ok?: boolean; pendiente?: boolean; codigo?: string; motivo?: string } | null;
        return { ok: r?.ok === true, pendiente: r?.pendiente === true, codigo: typeof r?.codigo === "string" ? r.codigo : undefined, motivo: typeof r?.motivo === "string" ? r.motivo : undefined };
    } catch {
        return { ok: false, motivo: "nativo-fallo" };
    }
}

/**
 * (PENB3) Pide a Kotlin que QUITE un controlador de la lista aceptada del aparato (la lista solo la escribe Kotlin).
 * Sin app nativa o fuera de Android: «sin-soporte». Si lo nativo no contesta o rechaza la llamada: «sin-servicio».
 * La huella viaja entera, sin recortar.
 */
export async function quitarControladorNativo(huella: string): Promise<{ ok: boolean; quitados?: number; motivo?: string }> {
    const inv = invocador();
    if (!inv) return { ok: false, motivo: "sin-soporte" };
    try {
        const r = (await inv("control_entrada_quitar", { huella })) as { ok?: boolean; quitados?: number; motivo?: string } | null;
        if (r?.ok === true) return { ok: true, quitados: typeof r.quitados === "number" ? r.quitados : 0 };
        return { ok: false, motivo: typeof r?.motivo === "string" ? r.motivo : "sin-servicio" };
    } catch {
        return { ok: false, motivo: "sin-servicio" };
    }
}

/** Los controladores que la persona aceptó EN este aparato para la entrada (solo huella corta, nombre y código). */
export async function controladoresAceptadosNativos(): Promise<{ huella: string; nombre: string; codigo: string }[] | null> {
    const inv = invocador();
    if (!inv) return null;
    try {
        const r = (await inv("control_entrada_aceptados")) as { ok?: boolean; controladores?: unknown } | null;
        if (!r || r.ok === false || !Array.isArray(r.controladores)) return null;
        return r.controladores
            .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
            .map((c) => ({ huella: String(c.huella ?? "").slice(0, 8), nombre: String(c.nombre ?? "").slice(0, 40), codigo: String(c.codigo ?? "").slice(0, 12) }))
            .slice(0, 16);
    } catch {
        return null;
    }
}

/** (CTL1117C · FALLO 1) Una línea `control-fondo …` en el registro de enlaces; Rust le suma lo que sabe Kotlin. Nunca lanza. */
export function notaFondo(detalle: string): void {
    const inv = invocador();
    if (!inv) return;
    void Promise.resolve(inv("control_fondo_nota", { detalle })).catch(() => undefined);
}
