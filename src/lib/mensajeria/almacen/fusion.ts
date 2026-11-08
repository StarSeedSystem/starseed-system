/**
 * Fusión del historial de la malla con el de la cuenta (MSJ1108C · F1, contrato §6 y §7.1).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * PURO. Dos tareas:
 *   1. `unificarHistorial`: una lista ordenada con lo del servidor y lo que solo viajó por la malla; si un
 *      mensaje está en los dos sitios sale UNA vez (la copia del servidor) con la vía real que guardó la malla.
 *   2. `idServidorDe` / `pendientesDeSubida`: la subida de lo que solo está en local es idempotente porque el
 *      servidor guarda el mensaje con ESE id (los ids de la malla son UUID; si no lo fuera, un UUID derivado
 *      y estable). No hace falta columna nueva en `os_dm_messages`: se usan `id`, `created_at`, `body`,
 *      `reply_to`, `attachments` y `formato`, que ya existen.
 */

import type { DmMessage } from "@/lib/messages/dm";
import type { MensajeMalla } from "@/lib/mensajeria/neuronas/bandeja";
import { compararHlc, hlcDeMs } from "./reloj-hibrido";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fnv(texto: string, semilla: number): number {
    let h = semilla >>> 0;
    for (let i = 0; i < texto.length; i++) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

/** Id con el que el servidor guarda un mensaje de la malla: el mismo si ya es UUID; si no, uno derivado estable. */
export function idServidorDe(idMalla: string): string {
    if (UUID.test(idMalla)) return idMalla.toLowerCase();
    const hex = [0x811c9dc5, 0x9747b28c, 0x2f0b5ad1, 0xc2b2ae35]
        .map((s) => fnv(idMalla, s).toString(16).padStart(8, "0"))
        .join("");
    const v = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${v}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface MensajeUnificado {
    /** Id que usa la interfaz: el del servidor si lo hay; si no, `malla:<id>`. */
    id: string;
    mensaje: DmMessage;
    /** La copia local (con la vía medida y el estado de envío) si el mensaje pasó por la malla. */
    local?: MensajeMalla;
    origen: "servidor" | "malla" | "ambos";
    orden: string;
}

function textoDe(m: MensajeMalla, describirLlamada?: (m: MensajeMalla) => string): string {
    if (m.borrado) return "";
    return m.texto || (m.adjunto ? `Archivo por la malla: ${m.adjunto.nombre}` : m.llamada ? describirLlamada?.(m) ?? "" : "");
}

/** Id con el que la interfaz conoce un mensaje por id de malla (para las citas). */
export function idVisible(idMalla: string, idsServidor: ReadonlySet<string>): string {
    const sid = idServidorDe(idMalla);
    return idsServidor.has(sid) ? sid : `malla:${idMalla}`;
}

export interface OpcionesUnificar {
    hiloId: string;
    miUid: string | null;
    miembros: ReadonlySet<string>;
    describirLlamada?: (m: MensajeMalla) => string;
}

export function mensajeDeMalla(m: MensajeMalla, o: OpcionesUnificar, idsServidor: ReadonlySet<string>): DmMessage {
    return {
        id: `malla:${m.id}`,
        threadId: o.hiloId,
        sender: m.dir === "sale" ? o.miUid : m.deUid ?? null,
        body: textoDe(m, o.describirLlamada),
        attachments: [],
        replyTo: m.respuestaA && !m.borrado ? idVisible(m.respuestaA.id, idsServidor) : null,
        kind: "user",
        editedAt: m.editadoEn ? new Date(m.editadoEn).toISOString() : null,
        deleted: !!m.borrado,
        createdAt: new Date(m.at).toISOString(),
        formato: m.borrado ? null : ((m.formato ?? null) as DmMessage["formato"]),
    };
}

/**
 * Une el historial del servidor con la bandeja local de ese hilo. Orden: hora de creación y, a igualdad,
 * reloj híbrido y id (estable). Los entrantes solo cuentan si los manda alguien del chat.
 */
export function unificarHistorial(servidor: readonly DmMessage[], locales: readonly MensajeMalla[] | undefined, o: OpcionesUnificar): MensajeUnificado[] {
    const idsServidor = new Set(servidor.map((s) => s.id));
    const localPorSid = new Map<string, MensajeMalla>();
    const soloLocales: MensajeMalla[] = [];
    for (const m of locales ?? []) {
        if (!(m.dir === "sale" || (!!m.deUid && o.miembros.has(m.deUid)))) continue;
        const sid = idServidorDe(m.id);
        if (idsServidor.has(sid)) localPorSid.set(sid, m);
        else soloLocales.push(m);
    }
    const lista: MensajeUnificado[] = servidor.map((s) => {
        const local = localPorSid.get(s.id);
        // Una edición o un borrado firmados por la malla que el servidor aún no tiene se ven ya.
        const mensaje: DmMessage = local && local.borrado && !s.deleted ? { ...s, deleted: true, body: "" } : local?.editadoEn && !s.editedAt && !s.deleted && local.texto && local.texto !== s.body
            ? { ...s, body: local.texto, editedAt: new Date(local.editadoEn).toISOString() }
            : s;
        return {
            id: s.id,
            mensaje,
            ...(local ? { local } : {}),
            origen: local ? ("ambos" as const) : ("servidor" as const),
            orden: local?.hlc ?? hlcDeMs(Date.parse(s.createdAt) || 0),
        };
    });
    for (const m of soloLocales) {
        lista.push({ id: `malla:${m.id}`, mensaje: mensajeDeMalla(m, o, idsServidor), local: m, origen: "malla", orden: m.hlc ?? hlcDeMs(m.at, "local") });
    }
    return lista.sort((a, b) => {
        const ta = Date.parse(a.mensaje.createdAt) || 0;
        const tb = Date.parse(b.mensaje.createdAt) || 0;
        // El HLC del autor manda cuando las horas están a menos de 2 minutos (relojes que no coinciden);
        // lejos una de otra, la hora de creación.
        if (Math.abs(ta - tb) <= 120_000) {
            const c = compararHlc(a.orden, b.orden);
            if (c !== 0) return c;
        }
        return ta - tb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
}

/** Mensajes de la malla que el servidor de la cuenta aún no tiene y que esta cuenta puede subir (los suyos). */
export function pendientesDeSubida(locales: readonly MensajeMalla[], miUid: string | null): MensajeMalla[] {
    if (!miUid) return [];
    return locales.filter(
        (m) =>
            m.clave.startsWith("dm:") &&
            !m.subido &&
            (m.dir === "sale" || m.deUid === miUid) &&
            (m.estado === "enviado" || m.estado === "confirmado" || m.estado === "recibido") &&
            !m.llamada &&
            !m.flujo &&
            !!m.texto.trim(),
    );
}
