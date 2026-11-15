/**
 * Control entre mis neuronas · el puente con el lado NATIVO del aparato controlado (ORD1114Q · contrato
 * `control-remoto-entre-neuronas.md` §1 caso H y §2.4).
 *
 * La sesión, el indicador, la parada y el registro encadenado viven en Rust (`control_neuronas.rs`): la
 * página pide abrir la sesión (Rust pone el indicador o se niega), pide permiso antes de CADA orden y
 * Rust la anota. Si la persona pulsa «Terminar el control ahora» en el indicador, Rust cierra la sesión
 * aunque esta página esté colgada: la orden siguiente ya no tiene sesión.
 *
 * Fuera de la app nativa (navegador) o donde Rust no puede enseñar el indicador (hoy Android/iOS) no hay
 * puente disponible y la puerta lo rechaza todo con «sin-indicador-nativo»: sin indicador no hay control.
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
export function crearPuenteTauri(indicadorPosible: boolean): PuenteNativoControl {
    const inv = invocador();
    if (!inv || !indicadorPosible) return SIN_NATIVO;
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
