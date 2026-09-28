/**
 * Las implementaciones REALES del transporte y el guardado del controlador, sobre Supabase:
 *
 *   · Transporte  → un canal de difusión + presencia por sala (`juego:<id>` / `programa:<id>`).
 *     Sin sondeo. El canal no está autenticado por mensaje: su protección es el id imposible de
 *     adivinar, y la autoridad es el diario guardado (ver `controlador.ts`).
 *   · Persistencia → `os_spaces.doc` con lectura-fusión-escritura y compare-and-swap por `rev`
 *     (la RLS de `os_spaces` decide quién puede escribir); los cambios de otras personas llegan
 *     por la suscripción filtrada por id que ya usa el resto del OS (`subscribeSpace`).
 *
 * Todo degrada con mensajes en español y sin reintentos en bucle.
 */
import { createClient } from "@/utils/supabase/client";
import { deviceId } from "@/lib/sync/entity-state";
import { acceptInvite, subscribeSpace } from "@/lib/spaces/spaces";
import { fetchMyProfile } from "@/lib/social/os-profiles";
import { Controlador, type EstadoConexion, type Persistencia, type Transporte } from "./controlador";
import { sanearDoc, type BuscarMotor } from "./registro";
import type { DocSala, Presente } from "./tipos";

// ───────────────────────────── Transporte ─────────────────────────────

const claveTab: string = (() => {
    try {
        return globalThis.crypto?.randomUUID?.() ?? `tab-${Math.random().toString(36).slice(2)}`;
    } catch {
        return `tab-${Math.random().toString(36).slice(2)}`;
    }
})();

function presentesDe(estado: Record<string, unknown[]>): Presente[] {
    const porUid = new Map<string, Presente>();
    for (const metas of Object.values(estado ?? {})) {
        const m = Array.isArray(metas) ? (metas[0] as { uid?: unknown; nombre?: unknown } | undefined) : undefined;
        if (!m || typeof m.uid !== "string" || !m.uid) continue;
        if (!porUid.has(m.uid)) porUid.set(m.uid, { uid: m.uid, nombre: typeof m.nombre === "string" ? m.nombre.slice(0, 40) : "" });
    }
    return [...porUid.values()];
}

export function crearTransporteSupabase(nombreCanal: string): Transporte {
    let canal: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    let cliente: ReturnType<typeof createClient> | null = null;
    let suscrito = false;
    let meta: Presente | null = null;
    let anunciado = false;
    let alPresentesCb: ((l: Presente[]) => void) | null = null;

    const anunciar = () => {
        if (!canal || !suscrito || !meta || anunciado) return;
        anunciado = true;
        void canal.track(meta).catch(() => {
            anunciado = false;
        });
    };

    return {
        enviar(evento, carga) {
            if (!canal || !suscrito) return;
            void canal.send({ type: "broadcast", event: evento, payload: carga }).catch(() => {});
        },
        suscribir(alRecibir, alEstado) {
            try {
                cliente = createClient();
                canal = cliente.channel(nombreCanal, {
                    config: { broadcast: { self: false, ack: false }, presence: { key: claveTab } },
                });
                canal.on("broadcast", { event: "*" }, (mensaje: { event: string; payload: unknown }) => {
                    alRecibir(mensaje.event, mensaje.payload);
                });
                canal.on("presence", { event: "sync" }, () => {
                    try {
                        alPresentesCb?.(presentesDe(canal?.presenceState() as Record<string, unknown[]>));
                    } catch {
                        /* noop */
                    }
                });
                canal.subscribe((estado: string) => {
                    if (estado === "SUBSCRIBED") {
                        suscrito = true;
                        alEstado("en-vivo");
                        anunciar();
                    } else if (estado === "CLOSED" || estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") {
                        suscrito = false;
                        anunciado = false;
                        alEstado("caido" as EstadoConexion);
                    }
                });
            } catch {
                alEstado("caido");
            }
            return () => {
                suscrito = false;
                try {
                    if (canal && cliente) void cliente.removeChannel(canal);
                } catch {
                    /* noop */
                }
                canal = null;
            };
        },
        anunciar(yo) {
            meta = yo;
            anunciado = false;
            anunciar();
        },
        alPresentes(cb) {
            alPresentesCb = cb;
            return () => {
                alPresentesCb = null;
            };
        },
    };
}

// ───────────────────────────── Persistencia ─────────────────────────────

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esIdEspacio(v: unknown): v is string {
    return typeof v === "string" && RE_UUID.test(v);
}

async function uidActual(): Promise<string | null> {
    try {
        const { data } = await createClient().auth.getSession();
        return data?.session?.user?.id ?? null;
    } catch {
        return null;
    }
}

export function crearPersistenciaSupabase(spaceId: string): Persistencia {
    return {
        async leer() {
            if (!esIdEspacio(spaceId)) return { ok: false, error: "Este enlace no es válido." };
            try {
                const sb = createClient();
                const uid = await uidActual();
                if (uid) await acceptInvite(spaceId); // invitado → miembro al abrir (mejor esfuerzo)
                const { data, error } = await sb
                    .from("os_spaces")
                    .select("id, title, doc, owner_account, access")
                    .eq("id", spaceId)
                    .maybeSingle();
                if (error) return { ok: false, error: "No se pudo abrir. Comprueba tu conexión e inténtalo de nuevo." };
                if (!data) return { ok: false, error: "No encuentras esta sala o no tienes acceso a ella." };
                const fila = data as { title?: string; doc?: unknown; owner_account?: string; access?: string };

                let soloLectura = !uid;
                if (uid && fila.owner_account !== uid) {
                    const { data: ed } = await sb
                        .from("os_space_editors")
                        .select("role, status")
                        .eq("space_id", spaceId)
                        .eq("account", uid)
                        .maybeSingle();
                    const e = ed as { role?: string; status?: string } | null;
                    if (e) soloLectura = e.role === "viewer" || e.status === "pending";
                    else soloLectura = fila.access === "public"; // un enlace público es de solo lectura (RLS)
                }
                return { ok: true, doc: fila.doc ?? {}, soloLectura, titulo: typeof fila.title === "string" ? fila.title : null };
            } catch {
                return { ok: false, error: "No se pudo abrir. Comprueba tu conexión e inténtalo de nuevo." };
            }
        },

        async escribir(fn) {
            try {
                const sb = createClient();
                for (let intento = 0; intento < 5; intento++) {
                    const { data, error } = await sb.from("os_spaces").select("doc, rev").eq("id", spaceId).maybeSingle();
                    if (error || !data) return { ok: false, error: "No se pudo guardar." };
                    const fila = data as { doc: unknown; rev: number };
                    const actual = sanearDoc(fila.doc);
                    const nuevo = fn(actual);
                    if (!nuevo) return { ok: true, doc: fila.doc };
                    if (actual && JSON.stringify(nuevo) === JSON.stringify(actual)) return { ok: true, doc: fila.doc };

                    const { data: filas, error: e2 } = await sb
                        .from("os_spaces")
                        .update({ doc: nuevo as unknown as Record<string, unknown>, device_id: deviceId() })
                        .eq("id", spaceId)
                        .eq("rev", fila.rev)
                        .select("doc, rev");
                    if (e2) {
                        const codigo = (e2 as { code?: string }).code;
                        if (codigo === "42501") return { ok: false, error: "Sin permiso para escribir.", denegado: true };
                        return { ok: false, error: "No se pudo guardar." };
                    }
                    if (Array.isArray(filas) && filas.length > 0) return { ok: true, doc: (filas[0] as { doc: unknown }).doc };

                    // 0 filas: o alguien escribió entre medias (la `rev` cambió) o la RLS no me deja.
                    const { data: relectura } = await sb.from("os_spaces").select("rev").eq("id", spaceId).maybeSingle();
                    if ((relectura as { rev?: number } | null)?.rev === fila.rev) {
                        return { ok: false, error: "Sin permiso para escribir.", denegado: true };
                    }
                }
                return { ok: false, error: "Demasiada actividad a la vez." };
            } catch {
                return { ok: false, error: "No se pudo guardar." };
            }
        },

        alCambiar(cb) {
            try {
                return subscribeSpace(spaceId, (space) => cb(space.doc));
            } catch {
                return () => {};
            }
        },
    };
}

// ───────────────────────────── Fábrica ─────────────────────────────

export interface OpcionesFabrica {
    spaceId: string;
    tipoDoc: "juego" | "programa";
    buscarMotor: BuscarMotor;
}

/** Nombre a mostrar de la cuenta actual (perfil, o el principio del correo, o «Jugador»). */
export async function nombreDeMiCuenta(): Promise<string> {
    try {
        const perfil = await fetchMyProfile();
        if (perfil?.displayName) return perfil.displayName;
        const { data } = await createClient().auth.getSession();
        const correo = data?.session?.user?.email;
        if (correo) return correo.split("@")[0];
    } catch {
        /* noop */
    }
    return "Jugador";
}

/** Crea el controlador real de una sala (aún sin iniciar: llama a `iniciar()`). */
export async function crearControladorSupabase(o: OpcionesFabrica): Promise<Controlador> {
    const uid = await uidActual();
    const nombre = uid ? await nombreDeMiCuenta() : "";
    return new Controlador({
        tipoDoc: o.tipoDoc,
        yo: { uid, nombre },
        transporte: crearTransporteSupabase(`${o.tipoDoc}:${o.spaceId}`),
        persistencia: crearPersistenciaSupabase(o.spaceId),
        buscarMotor: o.buscarMotor,
    });
}

export type { DocSala };
