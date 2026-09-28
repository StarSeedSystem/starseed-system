/**
 * Mensajes de error de las llamadas, en claro y con qué hacer — PURO.
 */
import type { SesionViva } from "@/lib/mensajeria/formato-tipos";

function nombreError(err: unknown): string {
    if (err && typeof err === "object" && "name" in err && typeof (err as { name: unknown }).name === "string") {
        return (err as { name: string }).name;
    }
    return "";
}

/** Traduce un fallo de getUserMedia/getDisplayMedia a una frase útil. */
export function mensajeErrorMedios(err: unknown, pedido: { audio: boolean; video: boolean; pantalla?: boolean }): string {
    const que = pedido.pantalla
        ? "compartir la pantalla"
        : pedido.video && pedido.audio
          ? "el micrófono y la cámara"
          : pedido.video
            ? "la cámara"
            : "el micrófono";
    switch (nombreError(err)) {
        case "NotAllowedError":
        case "SecurityError":
        case "PermissionDeniedError":
            return pedido.pantalla
                ? "Se canceló compartir la pantalla (o el navegador no lo permite)."
                : `El navegador no dio permiso para usar ${que}. Actívalo en el candado de la barra de direcciones y vuelve a probar.`;
        case "NotFoundError":
        case "DevicesNotFoundError":
        case "OverconstrainedError":
            return `No encontramos ${pedido.video && !pedido.audio ? "ninguna cámara" : pedido.audio && !pedido.video ? "ningún micrófono" : "micrófono ni cámara"} en este dispositivo.`;
        case "NotReadableError":
        case "TrackStartError":
        case "AbortError":
            return `Otra aplicación está usando ${que}. Ciérrala y vuelve a probar.`;
        case "NoMediaDevices":
        case "TypeError":
            return "Este navegador no permite llamadas aquí: hace falta una conexión segura (https) y un navegador actual.";
        default:
            return `No se pudo usar ${que}. Vuelve a probar en un momento.`;
    }
}

export type ClaseErrorSesion = "ok" | "no-desplegada" | "prohibida" | "no-encontrada" | "terminada" | "otro";

/** Clasifica el resultado de `obtenerSesion` para enseñar el mensaje adecuado. */
export function clasificarErrorSesion(
    error: string | null | undefined,
    sesion: Pick<SesionViva, "estado" | "caduca"> | null,
    ahora: Date = new Date(),
): ClaseErrorSesion {
    const e = (error ?? "").toLowerCase();
    if (e) {
        if (/jwt|permission|permiso|denied|401|403|42501|no tienes|prohibid|forbidden|rls|inicia sesi/.test(e)) return "prohibida";
        if (/does not exist|42p01|42883|pgrst20[25]|schema cache|could not find|no est[aá] desplegad|a[uú]n no est|migraci/.test(e)) return "no-desplegada";
        if (/not found|no encontrad|no encuentro|no existe|0 rows|pgrst116|no es v[aá]lido|inv[aá]lid/.test(e)) return "no-encontrada";
        if (/terminad|caducad|expired/.test(e)) return "terminada";
        return "otro";
    }
    if (!sesion) return "no-encontrada";
    if (sesion.estado === "terminada") return "terminada";
    if (sesion.caduca && new Date(sesion.caduca).getTime() <= ahora.getTime()) return "terminada";
    return "ok";
}

export const MENSAJE_SESION: Record<Exclude<ClaseErrorSesion, "ok">, { titulo: string; detalle: string }> = {
    "no-desplegada": {
        titulo: "Las llamadas aún no están activas en este servidor",
        detalle: "Falta aplicar la actualización de la base de datos que las habilita. Cuando esté, este enlace funcionará tal cual.",
    },
    prohibida: {
        titulo: "No tienes acceso a esta llamada",
        detalle: "Es una llamada privada del chat. Pide a quien la creó que te invite o que comparta un enlace público.",
    },
    "no-encontrada": {
        titulo: "No encontramos esta llamada",
        detalle: "Puede que el enlace esté incompleto o revocado, que ya no exista, o que sea una llamada privada de un chat del que no formas parte.",
    },
    terminada: {
        titulo: "Esta llamada ya terminó",
        detalle: "Quien la creó la cerró. Si queréis seguir hablando, empezad una nueva desde el chat.",
    },
    otro: {
        titulo: "No se pudo abrir la llamada",
        detalle: "Algo falló al consultarla. Revisa tu conexión y vuelve a intentarlo.",
    },
};
