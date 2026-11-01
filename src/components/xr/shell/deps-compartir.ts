"use client";

/**
 * StarSeed XR · dependencias REALES del ejecutor de compartir (XR1010S las define y este módulo
 * las INYECTA: es lo que faltaba para que la tarjeta de XR1010Q aplique lo confirmado, §3 f).
 * Solo componentes ya existentes del OS: espacios (`src/lib/spaces`), escenas (`src/lib/vivo/escena3d`),
 * miembros (`./resolver-miembros`), mensajería (`src/lib/messages/dm`), biblioteca
 * (`src/lib/library/entity-library`) y publicaciones (`src/lib/os-social`). Nada se inventa: sin
 * escena o sin sesión el ejecutor recibe la verdad y lo dice. Publicar a un grupo va al muro del
 * grupo (la tarjeta de voz lo aplica); un destino de comunidad «para todo el mundo» no existe aún
 * desde el visor: se niega de forma honesta y lo cableará la tarea de flujo.
 */
import { getSpace, listSpaceEditors, type Space, type SpaceEditor } from "@/lib/spaces/spaces";
import { concederAccesoEscena } from "@/lib/vivo/escena3d";
import { rutaSalaXr } from "@/lib/vivo/xr";
import { createDm, sendMessage, type DmAttachment } from "@/lib/messages/dm";
import { saveItem } from "@/lib/library/entity-library";
import { createPost, getCurrentUserId } from "@/lib/os-social";
import { saleDeLaCuenta } from "@/lib/xr/intenciones-voz";
import type { RolSala, Sala } from "@/lib/salas/sala";
import type { PasoVoz } from "@/lib/xr/intenciones-tipos";
import { ejecutarCompartir, type DepsCompartir } from "./ejecutor-compartir";
import { miembrosDeGrupo } from "./resolver-miembros";

export type { RolSala };

/** La Sala con su matriz de roles reales: dueño de `os_spaces` + editores activos de `os_space_editors`. */
export function salaDeEspacio(fila: Space, editores: SpaceEditor[]): Sala {
    const miembros: Record<string, RolSala> = { [fila.ownerAccount]: "dueno" };
    for (const e of editores) if (e.status === "member") miembros[e.account] = e.role === "editor" ? "editor" : "observador";
    return {
        id: fila.id, tipo: "escena3d", titulo: fila.title,
        visibilidad: fila.access === "public" ? "publica" : fila.groupSlug ? "grupo" : "privada",
        grupoId: fila.groupSlug ?? undefined, transporte: "servidor-privado",
        miembros, creadaEn: Date.parse(fila.createdAt) || 0,
    };
}

/** Mensajería real: un hilo por persona, con el adjunto de invitación si lo lleva. */
async function enviarMensajeReal(ids: string[], texto: string, adjunto?: object): Promise<number> {
    const adj = adjunto == null ? undefined : (adjunto as DmAttachment);
    const hechas = await Promise.all(ids.map(async (id) => {
        const hilo = await createDm(id);
        if (!hilo.ok || !hilo.thread) return 0;
        const m = await sendMessage(hilo.thread.id, { body: texto, ...(adj ? { attachments: [adj] } : {}) });
        return m ? 1 : 0;
    }));
    return hechas.reduce<number>((a, b) => a + b, 0);
}

/** Deps del ejecutor a partir de UNA escena real; `null` si la escena o la cuenta no se leen. */
export async function depsDeEscena(refId: string): Promise<DepsCompartir | null> {
    const [uid, fila, editores] = await Promise.all([getCurrentUserId(), getSpace(refId), listSpaceEditors(refId)]);
    if (!uid || !fila) return null;
    const sala = salaDeEspacio(fila, editores);
    return {
        sala,
        miembrosDeGrupo,
        concederAcceso: concederAccesoEscena,
        enviarMensaje: enviarMensajeReal,
        guardarBiblioteca: async (titulo) => {
            const r = await saveItem({ kind: "other", id: refId }, { type: "route", route: rutaSalaXr(refId), title: titulo, tags: ["xr"] });
            return { ok: r.ok, id: r.ok ? r.id : undefined, error: r.ok ? undefined : "No se pudo guardar en la biblioteca." };
        },
        subirEstacion: async () => ({ ok: false, error: "Subir el mundo a una estación desde el visor llega con la integración de las estaciones XR; todavía no puedo." }),
        publicar: async (d) => {
            if (d.visibilidad !== "grupo" || !d.grupoId)
                return { ok: false, error: "Un destino de comunidad «para todo el mundo» o «solo para ti» no está cableado aquí todavía; repite en la web o di el grupo." };
            const r = await createPost({ entityType: "group", entitySlug: d.grupoId, body: `«${sala.titulo}»: /escena/${refId}` });
            return { ok: r.ok, error: r.ok ? undefined : (r.error ?? "No se pudo publicar en el grupo.") };
        },
    };
}

export interface CaminoConfirmado { logros: string[]; avisos: string[] }

/** Aplica SOLO los pasos que salen de la cuenta, ya confirmados por la tarjeta; aviso honesto al resto. */
export async function aplicarConfirmadas(pasos: readonly PasoVoz[], refId: string | null): Promise<CaminoConfirmado> {
    const salida: CaminoConfirmado = { logros: [], avisos: [] };
    const pendientes = pasos.filter((p) => saleDeLaCuenta(p.intencion));
    if (!pendientes.length) return salida;
    const rid = refId ?? "";
    const uid = await getCurrentUserId();
    if (!uid) { salida.avisos.push("Necesitas tener la sesión abierta para confirmar esto."); return salida; }
    const deps = rid ? await depsDeEscena(rid) : null;
    if (!deps) { salida.avisos.push("No tengo la escena abierta desde la que aplicarlo: ábrela y repite."); return salida; }
    for (const paso of pendientes) {
        const r = await ejecutarCompartir(paso, { refId: rid, usuario: uid, ahora: Date.now(), consentimientos: [], confirmado: true, deps });
        (r.ok ? salida.logros : salida.avisos).push(r.ok ? r.resumen : r.motivo);
    }
    return salida;
}
