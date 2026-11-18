/**
 * CTL1117H · ajustes NATIVOS del aparato controlado (solo locales, por aparato). El envoltorio de los comandos
 * `control_ajustes_leer` y `control_ajustes_poner`. En escritorio y web (sin Tauri) devuelven los valores por defecto sin fallar.
 * Ninguna orden remota puede cambiarlos: solo esta página, en este aparato.
 */

export type IndicadorControl = "punto" | "oculto";
export interface AjustesControl {
    /** El punto de la esquina; la notificación siempre está. */
    indicador: IndicadorControl;
    /** La onda del color del controlador en cada toque remoto. */
    ver_toques: boolean;
    /**
     * CTL1117J · S2: hasta dónde llega el control de otra neurona en ESTE aparato. «total» (de fábrica; un valor que falta o es raro
     * se lee «total»): ninguna ventana ni app queda fuera, ni ajustes ni permisos. «protegido»: la regla G de siempre.
     */
    alcance: AlcanceAparato;
}
export type AlcanceAparato = "total" | "protegido";

export const AJUSTES_CONTROL_DEFECTO: AjustesControl = { indicador: "punto", ver_toques: true, alcance: "total" };

type Invocar = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function invocador(): Invocar | null {
    const t = (globalThis as { __TAURI__?: { core?: { invoke?: Invocar } } }).__TAURI__;
    return typeof t?.core?.invoke === "function" ? t.core.invoke : null;
}

function limpiar(x: unknown): AjustesControl {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    return {
        indicador: o.indicador === "oculto" ? "oculto" : "punto",
        ver_toques: typeof o.ver_toques === "boolean" ? o.ver_toques : true,
        alcance: o.alcance === "protegido" ? "protegido" : "total",
    };
}

export async function leerAjustesControl(): Promise<AjustesControl> {
    const inv = invocador();
    if (!inv) return { ...AJUSTES_CONTROL_DEFECTO };
    try {
        return limpiar(await inv("control_ajustes_leer"));
    } catch {
        return { ...AJUSTES_CONTROL_DEFECTO };
    }
}

/** Cambia solo lo que vaya en `parcial`. Sin Tauri o ante un fallo devuelve lo que había (o los de fábrica): nunca lanza. */
export async function ponerAjustesControl(parcial: Partial<AjustesControl>): Promise<AjustesControl> {
    const inv = invocador();
    if (!inv) return { ...AJUSTES_CONTROL_DEFECTO, ...limpiar(parcial) };
    try {
        return limpiar(await inv("control_ajustes_poner", { parcial }));
    } catch {
        return leerAjustesControl();
    }
}
