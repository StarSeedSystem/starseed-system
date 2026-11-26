/**
 * Control entre mis neuronas · terminal entre neuronas (TRM1125A · contrato
 * `architecture/terminal-entre-neuronas.md` y `control-remoto-entre-neuronas.md`).
 *
 * Puro, sin `node:*`, nunca lanza. Dos niveles: usuario (terminal de la cuenta, sin privilegios)
 * y administrador (órdenes tipadas con ayudante privilegiado). Contraseñas nunca viajan.
 */

import { type Args, type Nivel, esNivel, rangoNivel } from "./niveles";
import { sellarOrden, abrirOrden, sellarRespuesta, abrirRespuesta, type OrdenSellada, type RespuestaSellada } from "./sellado";
import { leerOrden, type CargaOrden, type RespuestaOrden } from "./orden";

export type NivelTerminal = "usuario" | "administrador";

export const NIVELES_TERMINAL: readonly NivelTerminal[] = ["usuario", "administrador"];

export type ModoAdmin = "tipado" | "completo";

export interface SesionTerminal {
    token: string;
    de: string;
    nombre: string;
    nivel: NivelTerminal;
    modo: ModoAdmin;
    inicio: number;
    ultima: number;
    fin?: number | null;
    color?: string;
}

export interface ComandoTerminal {
    nombre: string;
    args: Args;
    descripcion: string;
    requiereAdminCompleto: boolean;
    sistemas: readonly string[];
}

export const COMANDOS_TERMINAL: readonly ComandoTerminal[] = [
    { nombre: "almacen-estado", args: {}, descripcion: "Estado de los almacenes", requiereAdminCompleto: false, sistemas: ["linux", "macos", "windows"] },
    { nombre: "almacen-salud", args: { disco: "" }, descripcion: "Salud de un disco (por serie)", requiereAdminCompleto: false, sistemas: ["linux", "macos", "windows"] },
    { nombre: "almacen-formatear", args: { disco: "", confirmar: false }, descripcion: "Formatea solo discos autorizados por su serie", requiereAdminCompleto: true, sistemas: ["linux", "macos", "windows"] },
    { nombre: "almacen-montar", args: { disco: "", punto: "" }, descripcion: "Monta un disco autorizado", requiereAdminCompleto: true, sistemas: ["linux", "macos", "windows"] },
    { nombre: "almacen-desmontar", args: { disco: "" }, descripcion: "Desmonta un disco", requiereAdminCompleto: true, sistemas: ["linux", "macos", "windows"] },
    { nombre: "servicio-estado", args: { nombre: "" }, descripcion: "Estado de un servicio StarSeed", requiereAdminCompleto: false, sistemas: ["linux", "macos", "windows"] },
    { nombre: "servicio-reiniciar", args: { nombre: "", confirmar: false }, descripcion: "Reinicia un servicio StarSeed", requiereAdminCompleto: true, sistemas: ["linux", "macos", "windows"] },
    { nombre: "actualizar", args: { canal: "", confirmar: false }, descripcion: "Actualiza el sistema (canal: stable/beta/nightly)", requiereAdminCompleto: true, sistemas: ["linux", "macos", "windows"] },
    { nombre: "registros", args: { servicio: "", lineas: 100 }, descripcion: "Lee registros de un servicio", requiereAdminCompleto: false, sistemas: ["linux", "macos", "windows"] },
    { nombre: "reiniciar-app", args: { confirmar: false }, descripcion: "Reinicia la app StarSeed", requiereAdminCompleto: true, sistemas: ["linux", "macos", "windows"] },
];

export function esNivelTerminal(n: unknown): n is NivelTerminal {
    return typeof n === "string" && NIVELES_TERMINAL.includes(n as NivelTerminal);
}

export function nivelTerminalMinimo(a: NivelTerminal, b: NivelTerminal): NivelTerminal {
    const i = NIVELES_TERMINAL.indexOf(a);
    const j = NIVELES_TERMINAL.indexOf(b);
    return i <= j ? a : b;
}

export function comandoTerminal(nombre: string): ComandoTerminal | null {
    return COMANDOS_TERMINAL.find((c) => c.nombre === nombre) ?? null;
}

export function validarComandoTerminal(nombre: string, args: Args): Args | null {
    const cmd = comandoTerminal(nombre);
    if (!cmd) return null;
    if (!cmd.sistemas.includes(typeof navigator !== "undefined" ? (navigator.platform.toLowerCase().includes("win") ? "windows" : navigator.platform.toLowerCase().includes("mac") ? "macos" : "linux") : "linux")) {
        return null;
    }
    const permitidas = Object.keys(cmd.args);
    if (!Object.keys(args).every((k) => permitidas.includes(k))) return null;
    const salida: Args = {};
    for (const [k, v] of Object.entries(cmd.args)) {
        if (k in args) {
            if (typeof v === "boolean" && typeof args[k] !== "boolean") return null;
            if (typeof v === "number" && typeof args[k] !== "number") return null;
            if (typeof v === "string" && typeof args[k] !== "string") return null;
            salida[k] = args[k];
        } else {
            salida[k] = v;
        }
    }
    return salida;
}

export async function ejecutarComandoTerminal(
    nombre: string,
    args: Args,
    ctx: { sesion: SesionTerminal; ayudanteDisponible: boolean }
): Promise<{ ok: boolean; salida: string; error?: string }> {
    const cmd = comandoTerminal(nombre);
    if (!cmd) return { ok: false, salida: "", error: "comando-desconocido" };
    if (cmd.requiereAdminCompleto && ctx.sesion.modo !== "completo") {
        return { ok: false, salida: "", error: "requiere-admin-completo" };
    }
    if (!ctx.ayudanteDisponible && cmd.requiereAdminCompleto) {
        return { ok: false, salida: "", error: "ayudante-no-disponible" };
    }
    const validados = validarComandoTerminal(nombre, args);
    if (!validados) return { ok: false, salida: "", error: "argumentos" };
    return { ok: true, salida: `[SIMULACIÓN] ${nombre} ejecutado con ${JSON.stringify(validados)}`, error: undefined };
}

export interface RegistroTerminal {
    id: string;
    token: string;
    de: string;
    nombre: string;
    nivel: NivelTerminal;
    modo: ModoAdmin;
    comando: string;
    args: Args;
    inicio: number;
    fin: number;
    ok: boolean;
    salidaResumida: string;
}

const REGISTRO_MAX = 500;
let registroMemoria: RegistroTerminal[] = [];

export function registrarTerminal(e: RegistroTerminal): void {
    registroMemoria.unshift(e);
    if (registroMemoria.length > REGISTRO_MAX) registroMemoria.pop();
}

export function leerRegistroTerminal(filtro?: { de?: string; desde?: number; hasta?: number }): RegistroTerminal[] {
    let r = [...registroMemoria];
    if (filtro?.de) r = r.filter((e) => e.de === filtro.de);
    if (filtro?.desde) r = r.filter((e) => e.inicio >= filtro.desde!);
    if (filtro?.hasta) r = r.filter((e) => e.inicio <= filtro.hasta!);
    return r;
}

export function limpiarRegistroTerminal(): void {
    registroMemoria = [];
}