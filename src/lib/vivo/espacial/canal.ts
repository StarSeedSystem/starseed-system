"use client";

/**
 * Escena 3D compartida · CANAL EN VIVO (L5 · 2026-09-28).
 * ============================================================================
 * UN canal de Supabase Realtime por escena abierta (`escena3d:<id>`, o
 * `escena3d:llamada:<sesionId>` para la sala de una llamada), que lleva las tres cosas:
 *
 *   · Presencia — quién está dentro (nombre, color, modo 3D/VR/AR).
 *   · Broadcast — poses de avatares (≤ 10 Hz), cambios de objetos, vista previa de arrastres
 *     y el intercambio de estado de las salas efímeras.
 *   · postgres_changes — SOLO la fila de esta escena en `os_spaces` (filtro por id), para
 *     confirmar lo que otras personas guardaron de verdad.
 *
 * Nunca una tabla entera sin filtro. El canal no es privado: su protección es el id imposible de
 * adivinar (igual que las llamadas); por eso los cambios que llegan por broadcast de una escena
 * guardada se muestran como «sin confirmar» y no se guardan hasta que la base los confirma
 * (ver `./sesion`).
 *
 * ⚠️ supabase-js devuelve el MISMO objeto de canal para el mismo tema y `removeChannel` es
 * asíncrono: abrir la misma escena justo después de cerrarla (StrictMode, volver atrás) daría un
 * canal a medio cerrar («subscribe multiple times»). Se espera al cierre pendiente del tema.
 *
 * Nunca lanza: sin Supabase o sin red devuelve null / avisa por `onSuscrito(false)`.
 */

import { createClient } from "@/utils/supabase/client";

export type EventoEscena = "pose" | "cambios" | "arrastre" | "pedir-estado" | "estado";
export const EVENTOS_ESCENA: readonly EventoEscena[] = ["pose", "cambios", "arrastre", "pedir-estado", "estado"];

export interface FilaCambiada {
    rev: number;
    doc: unknown;
    titulo: string | null;
    acceso: string | null;
}

export interface ConexionEscena {
    readonly tema: string;
    suscrito(): boolean;
    enviar(evento: EventoEscena, payload: Record<string, unknown>): void;
    publicarPresencia(meta: Record<string, unknown>): void;
    onPresencia(cb: (estado: Record<string, unknown>) => void): () => void;
    onMensaje(cb: (evento: EventoEscena, payload: unknown) => void): () => void;
    onFila(cb: (fila: FilaCambiada) => void): () => void;
    onSuscrito(cb: (ok: boolean) => void): () => void;
    cerrar(): void;
}

type Cliente = ReturnType<typeof createClient>;
type Canal = ReturnType<Cliente["channel"]>;

const cierres = new Map<string, Promise<unknown>>();

function emitir<A extends unknown[]>(oyentes: Set<(...a: A) => void>, ...args: A) {
    for (const cb of Array.from(oyentes)) {
        try {
            cb(...args);
        } catch {
            /* un oyente roto no tumba a los demás */
        }
    }
}

export function temaEscena(id: string): string {
    return `escena3d:${id}`;
}

export function temaSalaLlamada(sesionId: string): string {
    return `escena3d:llamada:${sesionId}`;
}

/**
 * Abre el canal de una escena. `filaId`: id de la fila de `os_spaces` a vigilar (null en salas
 * efímeras de llamada, que no tienen fila).
 */
export function abrirCanalEscena(tema: string, clave: string, filaId: string | null): ConexionEscena | null {
    if (typeof window === "undefined" || !tema || !clave) return null;
    let cliente: Cliente;
    try {
        cliente = createClient();
    } catch {
        return null;
    }
    const oyPresencia = new Set<(e: Record<string, unknown>) => void>();
    const oyMensaje = new Set<(ev: EventoEscena, p: unknown) => void>();
    const oyFila = new Set<(f: FilaCambiada) => void>();
    const oySuscrito = new Set<(ok: boolean) => void>();
    let canal: Canal | null = null;
    let suscrito = false;
    let cerrado = false;
    let meta: Record<string, unknown> | null = null;
    const cola: { evento: EventoEscena; payload: Record<string, unknown> }[] = [];

    const enviarAhora = (evento: EventoEscena, payload: Record<string, unknown>) => {
        if (!canal || !suscrito) return false;
        try {
            void canal.send({ type: "broadcast", event: evento, payload });
            return true;
        } catch {
            return false;
        }
    };

    const crear = (intento = 0) => {
        if (cerrado) return;
        try {
            const viejo = cliente.getChannels?.().find((c) => c.topic === `realtime:${tema}`);
            if (viejo && intento < 40) {
                setTimeout(() => crear(intento + 1), 250);
                return;
            }
            const c = cliente.channel(tema, {
                config: { presence: { key: clave }, broadcast: { self: false, ack: false } },
            });
            canal = c;
            c.on("presence", { event: "sync" }, () => {
                if (canal !== c) return;
                try {
                    emitir(oyPresencia, c.presenceState() as Record<string, unknown>);
                } catch {
                    emitir(oyPresencia, {});
                }
            });
            for (const evento of EVENTOS_ESCENA) {
                c.on("broadcast", { event: evento }, (m: { payload?: unknown }) => {
                    if (canal !== c) return;
                    emitir(oyMensaje, evento, m?.payload);
                });
            }
            if (filaId) {
                c.on(
                    "postgres_changes",
                    { event: "UPDATE", schema: "public", table: "os_spaces", filter: `id=eq.${filaId}` },
                    (p: { new?: Record<string, unknown> }) => {
                        if (canal !== c) return;
                        const row = p?.new;
                        if (!row || typeof row.rev !== "number") return;
                        emitir(oyFila, {
                            rev: row.rev,
                            doc: row.doc,
                            titulo: typeof row.title === "string" ? row.title : null,
                            acceso: typeof row.access === "string" ? row.access : null,
                        });
                    },
                );
            }
            c.subscribe((estado: string) => {
                if (canal !== c) return;
                if (estado === "SUBSCRIBED") {
                    suscrito = true;
                    if (meta) {
                        try {
                            void c.track(meta);
                        } catch {
                            /* se reintenta en la próxima reconexión */
                        }
                    }
                    for (const m of cola.splice(0)) enviarAhora(m.evento, m.payload);
                    emitir(oySuscrito, true);
                } else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED") {
                    suscrito = false;
                    emitir(oySuscrito, false);
                }
            });
        } catch {
            canal = null;
            emitir(oySuscrito, false);
        }
    };

    const pendiente = cierres.get(tema);
    if (pendiente) void pendiente.then(() => crear());
    else crear();

    return {
        tema,
        suscrito: () => suscrito,
        enviar(evento, payload) {
            if (cerrado) return;
            if (enviarAhora(evento, payload)) return;
            // Solo se encolan los mensajes que importan (cambios y estado); una pose vieja no sirve.
            if (evento === "cambios" || evento === "estado" || evento === "pedir-estado") {
                cola.push({ evento, payload });
                if (cola.length > 50) cola.shift();
            }
        },
        publicarPresencia(m) {
            meta = m;
            if (canal && suscrito) {
                try {
                    void canal.track(m);
                } catch {
                    /* se republica al reconectar */
                }
            }
        },
        onPresencia(cb) {
            oyPresencia.add(cb);
            return () => oyPresencia.delete(cb);
        },
        onMensaje(cb) {
            oyMensaje.add(cb);
            return () => oyMensaje.delete(cb);
        },
        onFila(cb) {
            oyFila.add(cb);
            return () => oyFila.delete(cb);
        },
        onSuscrito(cb) {
            oySuscrito.add(cb);
            return () => oySuscrito.delete(cb);
        },
        cerrar() {
            if (cerrado) return;
            cerrado = true;
            suscrito = false;
            oyPresencia.clear();
            oyMensaje.clear();
            oyFila.clear();
            oySuscrito.clear();
            const c = canal;
            canal = null;
            if (!c) return;
            try {
                void c.untrack();
            } catch {
                /* best-effort */
            }
            try {
                const p = Promise.resolve(cliente.removeChannel(c)).catch(() => undefined);
                const conTope = Promise.race([p, new Promise((ok) => setTimeout(ok, 4000))]);
                cierres.set(tema, conTope);
                void conTope.then(() => {
                    if (cierres.get(tema) === conTope) cierres.delete(tema);
                });
            } catch {
                /* best-effort */
            }
        },
    };
}
