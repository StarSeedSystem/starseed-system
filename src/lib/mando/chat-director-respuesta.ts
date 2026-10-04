/**
 * Chat Director del Mando · historial para el modelo y validación del POST (PURO · Ola 1004)
 * ─────────────────────────────────────────────────────────────────────────────
 * Nada de disco ni red: `historialParaModelo` reduce el feed a turnos
 * user/assistant y `pedidoDeAccion` valida el cuerpo del POST de
 * `/api/mando/director-chat`. La ruta decide y publica.
 */

import {
    CANALES,
    MODELO_DIRECTOR_DEFECTO,
    type CanalId,
    type MensajeDirector,
} from "./chat-director-tipos";

/** Límite del cuerpo de un mensaje del chat (contrato: ≤ 20000 caracteres). */
export const MAX_TEXTO_DIRECTOR = 20000;

/** Un turno para el historial del modelo: Alex habla como «user», la dirección como «assistant». */
export interface TurnoModelo {
    rol: "user" | "assistant";
    texto: string;
}

export type PedidoChatDirector =
    | { accion: "decir"; texto: string; modelo: string; canales: CanalId[] }
    | { accion: "responder"; respondeA: string; modelo: string }
    | { accion: "reenviar"; reenviar: string; canales: CanalId[] }
    | { error: string };

/**
 * Los últimos `max` mensajes de rol «alex» o «director» escritos en chat.jsonl
 * (id «md-»), como turnos user/assistant para el modelo.
 */
export function historialParaModelo(
    mensajes: readonly MensajeDirector[],
    max = 12,
): TurnoModelo[] {
    const tope = typeof max === "number" && max > 0 ? Math.floor(max) : 12;
    const elegibles = mensajes.filter((m) =>
        !!m
        && typeof m.id === "string" && m.id.startsWith("md-")
        && (m.rol === "alex" || m.rol === "director")
        && typeof m.texto === "string" && m.texto.trim() !== "",
    );
    return elegibles.slice(-tope).map((m) => ({
        rol: m.rol === "alex" ? "user" : "assistant",
        texto: m.texto,
    }));
}

function esCanal(v: unknown): v is CanalId {
    return typeof v === "string" && CANALES.some((c) => c.id === v);
}

/** Lista de canales válidos y sin repetir; null si llega algo que no es CanalId. */
function canalesDe(v: unknown): CanalId[] | null {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) return null;
    const salida: CanalId[] = [];
    for (const c of v) {
        if (!esCanal(c)) return null;
        if (!salida.includes(c)) salida.push(c);
    }
    return salida;
}

function modeloDe(v: unknown): string {
    return typeof v === "string" && v.trim() !== "" ? v.trim() : MODELO_DIRECTOR_DEFECTO;
}

function textoDe(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t === "" || t.length > MAX_TEXTO_DIRECTOR ? null : t;
}

function idDe(v: unknown): string | null {
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Valida el cuerpo del POST y lo reduce a una de las tres acciones del chat. */
export function pedidoDeAccion(cuerpo: unknown): PedidoChatDirector {
    if (typeof cuerpo !== "object" || cuerpo === null) return { error: "Cuerpo JSON inválido." };
    const c = cuerpo as Record<string, unknown>;
    const accion = typeof c.accion === "string" ? c.accion : "";
    if (accion === "decir") {
        const texto = textoDe(c.texto);
        if (texto === null) return { error: "Falta el texto o pasa de 20000 caracteres." };
        const canales = canalesDe(c.canales);
        if (canales === null) return { error: "Alguno de los canales pedidos no existe." };
        return { accion: "decir", texto, modelo: modeloDe(c.modelo), canales };
    }
    if (accion === "responder") {
        const respondeA = idDe(c.respondeA);
        if (!respondeA) return { error: "Falta el mensaje al que responder." };
        return { accion: "responder", respondeA, modelo: modeloDe(c.modelo) };
    }
    if (accion === "reenviar") {
        const reenviar = idDe(c.reenviar);
        if (!reenviar) return { error: "Falta el mensaje a reenviar." };
        const canales = canalesDe(c.canales);
        if (canales === null || canales.length === 0) {
            return { error: "Indica al menos un canal válido." };
        }
        return { accion: "reenviar", reenviar, canales };
    }
    return { error: "Acción desconocida: usa «decir», «responder» o «reenviar»." };
}
