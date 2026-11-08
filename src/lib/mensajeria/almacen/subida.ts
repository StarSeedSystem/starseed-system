/**
 * Subida idempotente de los mensajes de la malla a la cuenta (MSJ1108C · F1, contrato §6 «La nube como réplica»).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Al volver internet, lo que solo viajó por la malla sube al servidor con su propio id (ver `fusion.ts`):
 *   · subir dos veces, o desde dos aparatos de la cuenta, no duplica (el servidor responde «existia»);
 *   · se sube en orden de reloj, para que una cita (`reply_to`) encuentre ya a su mensaje padre;
 *   · lo borrado antes de subir no sube nunca (borrar domina); ediciones y borrados posteriores
 *     se aplican en el servidor con las operaciones de siempre (`editMessage`, `softDeleteMessage`);
 *   · solo sube cada cuenta lo suyo (el servidor exige que el remitente sea quien sube).
 * Las dependencias se inyectan: la prueba lo hace con un servidor falso en memoria.
 */

import type { MensajeMalla } from "@/lib/mensajeria/neuronas/bandeja";
import { compararHlc, hlcDeMs } from "./reloj-hibrido";
import { idServidorDe, pendientesDeSubida } from "./fusion";

export interface DepsSubida {
    subir(hiloId: string, m: { id: string; body: string; createdAt: string; replyTo: string | null; formato: unknown }): Promise<"subido" | "existia" | "fallo">;
    editar(id: string, body: string): Promise<boolean>;
    borrar(id: string): Promise<boolean>;
}

export interface ResultadoSubida {
    subidos: number;
    existian: number;
    fallos: number;
    /** Ediciones o borrados aplicados en el servidor sobre mensajes ya subidos. */
    operaciones: number;
}

export type MarcarSubida = (clave: string, id: string, cambio: Partial<MensajeMalla>) => void;

const porOrden = (a: MensajeMalla, b: MensajeMalla) => compararHlc(a.hlc ?? hlcDeMs(a.at, "local"), b.hlc ?? hlcDeMs(b.at, "local")) || a.at - b.at;

export async function subirPendientes(
    locales: readonly MensajeMalla[],
    miUid: string | null,
    idsEnServidor: ReadonlySet<string>,
    deps: DepsSubida,
    marcar: MarcarSubida,
): Promise<ResultadoSubida> {
    const res: ResultadoSubida = { subidos: 0, existian: 0, fallos: 0, operaciones: 0 };
    if (!miUid) return res;
    const enServidor = new Set(idsEnServidor);
    for (const m of locales) if (m.subido) enServidor.add(idServidorDe(m.id));

    for (const m of [...pendientesDeSubida(locales, miUid), ...locales.filter((x) => x.borrado && !x.subido && x.clave.startsWith("dm:"))].sort(porOrden)) {
        if (m.subido) continue;
        const hiloId = m.clave.slice(3);
        if (m.borrado) {
            // Borrado antes de subir: no hay nada que subir. Se da por resuelto.
            marcar(m.clave, m.id, { subido: Date.now(), subidoOp: m.borradoHlc });
            continue;
        }
        const sid = idServidorDe(m.id);
        const padre = m.respuestaA ? idServidorDe(m.respuestaA.id) : null;
        const r = await deps.subir(hiloId, {
            id: sid,
            body: m.texto,
            createdAt: new Date(m.at).toISOString(),
            replyTo: padre && enServidor.has(padre) ? padre : null,
            formato: m.formato ?? null,
        });
        if (r === "fallo") {
            res.fallos += 1;
            continue;
        }
        if (r === "subido") res.subidos += 1;
        else res.existian += 1;
        enServidor.add(sid);
        marcar(m.clave, m.id, { subido: Date.now() });
        if (m.opHlc && (await deps.editar(sid, m.texto))) {
            res.operaciones += 1;
            marcar(m.clave, m.id, { subidoOp: m.opHlc });
        }
    }

    // Operaciones posteriores sobre mensajes que ya estaban en el servidor.
    for (const m of locales) {
        if (!m.subido || !m.clave.startsWith("dm:")) continue;
        const sid = idServidorDe(m.id);
        if (m.borrado && m.subidoOp !== m.borradoHlc) {
            if (await deps.borrar(sid)) {
                res.operaciones += 1;
                marcar(m.clave, m.id, { subidoOp: m.borradoHlc });
            }
        } else if (!m.borrado && m.opHlc && m.subidoOp !== m.opHlc && (m.dir === "sale" || m.deUid === miUid)) {
            if (await deps.editar(sid, m.texto)) {
                res.operaciones += 1;
                marcar(m.clave, m.id, { subidoOp: m.opHlc });
            }
        }
    }
    return res;
}
