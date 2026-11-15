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

export interface RespuestaNativa {
    ok: boolean;
    token?: string;
    motivo?: string;
}

export interface PuenteNativoControl {
    /** ¿Hay app nativa con su lado de control? (sin ella, nada se acepta). */
    disponible(): boolean;
    abrir(de: string, nombre: string, nivel: string): Promise<RespuestaNativa>;
    /** Permiso de Rust para ejecutar UNA orden de la sesión `token`. */
    orden(token: string, nombre: string): Promise<RespuestaNativa>;
    /** Apunta en el registro encadenado una orden que la puerta rechazó (no concede nada). */
    anotar(nombre: string, de: string, resultado: string): void;
    parar(motivo: string): Promise<void>;
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

function motivoDe(e: unknown): string {
    const m = typeof e === "string" ? e : e instanceof Error ? e.message : "";
    return /^[a-z-]{1,32}$/.test(m) ? m : "nativo-fallo";
}

/** Puente real (Tauri). `indicadorPosible` lo dice Rust al arrancar (`control_neuronas_estado`). */
export function crearPuenteTauri(_indicadorPosible?: boolean): PuenteNativoControl {
    // ORD1114T: Rust decide en cada «abrir» (el indicador puede pasar a posible tras el diálogo nativo).
    const inv = invocador();
    if (!inv) return SIN_NATIVO;
    return {
        disponible: () => true,
        abrir: async (de, nombre, nivel) => {
            try {
                const token = await inv("control_neuronas_abrir", { de, nombre, nivel });
                return typeof token === "string" ? { ok: true, token } : { ok: false, motivo: "nativo-fallo" };
            } catch (e) {
                return { ok: false, motivo: motivoDe(e) };
            }
        },
        orden: async (token, nombre) => {
            try {
                await inv("control_neuronas_orden", { token, nombre });
                return { ok: true };
            } catch (e) {
                return { ok: false, motivo: motivoDe(e) };
            }
        },
        anotar: (nombre, de, resultado) => {
            void inv("control_neuronas_anotar", { nombre, de, resultado }).catch(() => undefined);
        },
        parar: async (motivo) => {
            await inv("control_neuronas_parar", { motivo }).catch(() => undefined);
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
export async function prepararIndicadorNativo(): Promise<{ indicadorPosible: boolean; falta: string[] } | null> {
    const inv = invocador();
    if (!inv) return null;
    try {
        const e = (await inv("control_neuronas_preparar")) as { indicador_posible?: boolean; falta?: unknown } | null;
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
