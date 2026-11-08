/**
 * Por qué no hay micrófono, cámara o pantalla, y qué hacer (MIC1108A · 2026-11-08) — PURO.
 * Contrato: architecture/apps-autonomas-sin-internet.md §13.
 *
 * Antes todo salía como «Este navegador no deja usar el micrófono». Ahora se distingue:
 *  · app-sin-permiso: la app nativa instalada es anterior a MIC1108A (no responde `medios_estado`)
 *    o su instalación no declara el micrófono: ni WebKit ni Android dejan siquiera preguntar. Solo lo
 *    arregla instalar la versión nueva de la app;
 *  · denegado: la persona o el sistema dijeron que no → dónde se activa en ESTE sistema (y el botón
 *    «Abrir ajustes» si la app sabe abrirlos);
 *  · sin-dispositivo: no hay micrófono ni cámara conectados;
 *  · ocupado, cancelado (pantalla), no-soportado (el motor web no lo trae), otro.
 * En el navegador (fuera de la app) los textos son los de siempre (`mensajeErrorMedios`).
 */
import { mensajeErrorMedios } from "@/lib/llamadas/errores";
import type { EstadoMediosNativo } from "@/lib/nativa/medios-nativos";

export type PlataformaMedios = "macos" | "windows" | "linux" | "android" | "ios" | "otra";
export type AjustesMedios = "microfono" | "camara" | "pantalla";
export type CausaFalloMedios = "app-sin-permiso" | "denegado" | "sin-dispositivo" | "ocupado" | "cancelado" | "no-soportado" | "otro";

export interface PedidoMedios {
    audio: boolean;
    video: boolean;
    pantalla?: boolean;
}

export interface EntornoMedios {
    /** Corre dentro de la app nativa (Tauri). */
    nativa: boolean;
    plataforma: PlataformaMedios;
    /** Lo que dijo `medios_estado`; null en la web o si la app es anterior a MIC1108A. */
    estado: EstadoMediosNativo | null;
}

export interface DiagnosticoMedios {
    causa: CausaFalloMedios;
    mensaje: string;
    /** Qué ajustes del sistema abre «Abrir ajustes» (null: sin botón). */
    ajustes: AjustesMedios | null;
}

/** Nombre del error de getUserMedia/getDisplayMedia («NoMediaDevices» cuando ni existe la función). */
export function nombreErrorMedios(err: unknown): string {
    if (err && typeof err === "object" && "name" in err && typeof (err as { name: unknown }).name === "string") {
        return (err as { name: string }).name;
    }
    return "";
}

/** Plataforma por el agente del navegador (cuando la app no lo dice). */
export function plataformaDeAgente(agente: string): PlataformaMedios {
    const a = agente || "";
    if (/android/i.test(a)) return "android";
    if (/iphone|ipad|ipod/i.test(a)) return "ios";
    if (/mac os x|macintosh/i.test(a)) return "macos";
    if (/windows/i.test(a)) return "windows";
    if (/linux|x11|cros/i.test(a)) return "linux";
    return "otra";
}

/** Plataforma por lo que dice la app (`std::env::consts::OS`). */
export function plataformaDeTexto(t: string): PlataformaMedios {
    const p = (t || "").trim().toLowerCase();
    return p === "macos" || p === "windows" || p === "linux" || p === "android" || p === "ios" ? p : "otra";
}

const NEGADO = new Set(["NotAllowedError", "SecurityError", "PermissionDeniedError"]);
const SIN_DISPOSITIVO = new Set(["NotFoundError", "DevicesNotFoundError", "OverconstrainedError"]);
const OCUPADO = new Set(["NotReadableError", "TrackStartError", "AbortError"]);
const SIN_API = new Set(["NoMediaDevices", "TypeError", "NotSupportedError"]);

function clasificar(nombre: string, pedido: PedidoMedios): CausaFalloMedios {
    if (SIN_API.has(nombre)) return "no-soportado";
    if (NEGADO.has(nombre)) return pedido.pantalla ? "cancelado" : "denegado";
    if (SIN_DISPOSITIVO.has(nombre)) return "sin-dispositivo";
    if (OCUPADO.has(nombre)) return "ocupado";
    return "otro";
}

function queSePide(p: PedidoMedios): string {
    if (p.pantalla) return "compartir la pantalla";
    if (p.audio && p.video) return "el micrófono y la cámara";
    return p.video ? "la cámara" : "el micrófono";
}

/** El ajuste del sistema que hay que tocar (en una videollamada manda el micrófono). */
function ajusteDe(p: PedidoMedios): AjustesMedios {
    if (p.pantalla) return "pantalla";
    return p.audio ? "microfono" : "camara";
}

/** Dónde se activa en cada sistema (sin «Abrir ajustes», para que se pueda hacer a mano). */
function dondeSeActiva(plataforma: PlataformaMedios, p: PedidoMedios): string {
    const seccionMac = p.pantalla ? "Grabación de pantalla" : p.audio && p.video ? "Micrófono y Cámara" : p.video ? "Cámara" : "Micrófono";
    const seccionWin = p.audio && p.video ? "Micrófono y Cámara" : p.video ? "Cámara" : "Micrófono";
    switch (plataforma) {
        case "macos":
            return `Actívalo en Ajustes del Sistema › Privacidad y seguridad › ${seccionMac} (StarSeed) y vuelve a probar.`;
        case "windows":
            return `Actívalo en Configuración › Privacidad y seguridad › ${seccionWin} («Permitir que las aplicaciones de escritorio accedan») y vuelve a probar.`;
        case "android":
            return "Actívalo en Ajustes › Aplicaciones › StarSeed › Permisos y vuelve a probar.";
        case "ios":
            return "Actívalo en Ajustes › StarSeed y vuelve a probar.";
        case "linux":
            return "Revisa los permisos de micrófono y cámara de tu escritorio (Ajustes › Privacidad) y vuelve a probar.";
        default:
            return "Revisa los permisos de privacidad del sistema y vuelve a probar.";
    }
}

const NOMBRE_SISTEMA: Record<PlataformaMedios, string> = {
    macos: "macOS",
    windows: "Windows",
    linux: "El sistema",
    android: "Android",
    ios: "iOS",
    otra: "El sistema",
};

/**
 * Qué pasó y qué decir. `err`: lo que lanzó getUserMedia/getDisplayMedia, o `{ name: "NoMediaDevices" }`
 * si la función ni existe. Pura.
 */
export function diagnosticarMedios(err: unknown, pedido: PedidoMedios, entorno: EntornoMedios): DiagnosticoMedios {
    const nombre = nombreErrorMedios(err);
    const causa = clasificar(nombre, pedido);
    const que = queSePide(pedido);
    if (!entorno.nativa) {
        if (pedido.pantalla && causa === "no-soportado") return { causa, mensaje: "Este dispositivo no permite compartir la pantalla desde el navegador.", ajustes: null };
        return { causa, mensaje: mensajeErrorMedios(err, pedido), ajustes: null };
    }

    const conBoton = !!entorno.estado?.abrir_ajustes;
    const viejaOSinDeclarar = !entorno.estado || !entorno.estado.declarados;

    // Compartir pantalla que el motor web no trae (Android WebView, macOS antiguos…).
    if (pedido.pantalla && causa === "no-soportado") {
        const detalle =
            entorno.plataforma === "android"
                ? "Android no deja compartir la pantalla desde una app web: compártela desde un ordenador."
                : entorno.plataforma === "macos"
                  ? "Este macOS no deja compartir la pantalla dentro de la app (puede hacer falta un macOS más reciente). Mientras, puedes hacerlo desde el navegador."
                  : "Este sistema no deja compartir la pantalla dentro de la app. Mientras, puedes hacerlo desde el navegador.";
        return { causa: "no-soportado", mensaje: detalle, ajustes: null };
    }

    // La app instalada no tiene permiso del sistema (anterior a MIC1108A o sin declararlo). En Windows
    // las apps anteriores sí preguntaban (WebView2): allí un «no» es de la persona, no de la app.
    const sinPermisoDeLaApp = causa === "no-soportado" || (causa === "denegado" && entorno.plataforma !== "windows");
    if (!pedido.pantalla && viejaOSinDeclarar && sinPermisoDeLaApp) {
        return {
            causa: "app-sin-permiso",
            mensaje: `Esta instalación de la app no tiene permiso del sistema para usar ${que}: es de antes de que la app lo pidiera. Instala la versión nueva (Ajustes › Esta neurona › Buscar actualización) y vuelve a probar.`,
            ajustes: null,
        };
    }

    switch (causa) {
        case "no-soportado":
            return {
                causa,
                mensaje:
                    entorno.plataforma === "linux"
                        ? `El motor web de este Linux no da acceso a ${que} (hace falta WebKitGTK con MediaStream y WebRTC). Mientras, puedes llamar desde el navegador.`
                        : `Este sistema no deja usar ${que} dentro de la app. Mientras, puedes llamar desde el navegador.`,
                ajustes: null,
            };
        case "cancelado": {
            const mac = entorno.plataforma === "macos";
            return {
                causa,
                mensaje: `No se compartió la pantalla: se canceló o el sistema no lo permite.${mac ? ` Si no te dejó elegir, ${dondeSeActiva("macos", pedido).replace(/^A/, "a")}` : ""}`,
                ajustes: mac && conBoton ? "pantalla" : null,
            };
        }
        case "denegado":
            return {
                causa,
                mensaje: `${NOMBRE_SISTEMA[entorno.plataforma]} no deja a StarSeed usar ${que}. ${dondeSeActiva(entorno.plataforma, pedido)}`,
                ajustes: conBoton ? ajusteDe(pedido) : null,
            };
        case "sin-dispositivo":
        case "ocupado":
        default:
            return { causa, mensaje: mensajeErrorMedios(err, pedido), ajustes: null };
    }
}
