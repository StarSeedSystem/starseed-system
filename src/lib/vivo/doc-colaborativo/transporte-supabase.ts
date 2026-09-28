"use client";

/**
 * Transporte real del motor colaborativo sobre Supabase (2026-09-28).
 *
 *   · Datos: la fila del espacio en `os_spaces` (RLS ya auditada: leer = público/invitado/dueño,
 *     escribir = dueño/editor/grupo). Se escribe con compare-and-swap sobre `rev` (el trigger
 *     `os_spaces_touch` la sube en cada UPDATE): `update … where id = ? and rev = ?`.
 *     Si no vuelve fila: o alguien guardó antes (rev distinta → conflicto) o la RLS no nos deja
 *     (rev igual → sin permiso). Se distingue releyendo, y esa relectura sirve para fusionar.
 *   · Tiempo real: UN canal `doc-colab:<espacio>` con difusión (broadcast) y presencia. Nada de
 *     `postgres_changes` sobre la tabla: el aviso «guardado» basta y ahorra tráfico.
 */

import { createClient } from "@/utils/supabase/client";
import { deviceId } from "@/lib/sync/entity-state";
import type { CanalColab, LecturaServidor, OyentesCanal, ResultadoEscritura, TransporteColab } from "./motor";

function esErrorDeRed(e: unknown): boolean {
    const m = String((e as { message?: unknown } | null)?.message ?? e ?? "").toLowerCase();
    return m.includes("fetch") || m.includes("network") || m.includes("timeout") || m.includes("offline") || m.includes("load failed");
}

function esErrorDePermiso(e: unknown): boolean {
    const o = (e ?? {}) as { code?: unknown; message?: unknown };
    const m = String(o.message ?? "").toLowerCase();
    return o.code === "42501" || m.includes("permission") || m.includes("row-level security") || m.includes("policy");
}

function revDe(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
    return null;
}

export function transporteEspacio(espacioId: string): TransporteColab {
    const cliente = () => createClient();

    const leer = async (): Promise<LecturaServidor | "sin-acceso" | null> => {
        try {
            const { data, error } = await cliente().from("os_spaces").select("doc, rev").eq("id", espacioId).maybeSingle();
            if (error) return esErrorDePermiso(error) ? "sin-acceso" : null;
            if (!data) return "sin-acceso";
            const fila = data as { doc?: unknown; rev?: unknown };
            return { doc: fila.doc ?? {}, rev: revDe(fila.rev) ?? 0 };
        } catch {
            return null;
        }
    };

    const leerRev = async (): Promise<number | null> => {
        try {
            const { data, error } = await cliente().from("os_spaces").select("rev").eq("id", espacioId).maybeSingle();
            if (error || !data) return null;
            return revDe((data as { rev?: unknown }).rev);
        } catch {
            return null;
        }
    };

    const escribir = async (doc: Record<string, unknown>, revEsperada: number): Promise<ResultadoEscritura> => {
        try {
            const { data, error } = await cliente()
                .from("os_spaces")
                .update({ doc, device_id: deviceId() })
                .eq("id", espacioId)
                .eq("rev", revEsperada)
                .select("rev")
                .maybeSingle();
            if (error) {
                if (esErrorDePermiso(error)) return { tipo: "sin-permiso" };
                return { tipo: "error", red: esErrorDeRed(error), mensaje: error.message };
            }
            const rev = revDe((data as { rev?: unknown } | null)?.rev);
            if (rev !== null) return { tipo: "ok", rev };
            // Sin fila: ¿carrera o permiso? Lo dice la revisión actual.
            const actual = await leer();
            if (actual === "sin-acceso") return { tipo: "sin-permiso" };
            if (!actual) return { tipo: "error", red: true };
            if (actual.rev === revEsperada) return { tipo: "sin-permiso" };
            return { tipo: "conflicto", lectura: actual };
        } catch {
            // Una excepción aquí es casi siempre la red (sin conexión, corte): se reintenta sola.
            return { tipo: "error", red: true };
        }
    };

    const abrirCanal = (claveTab: string, oyentes: OyentesCanal): CanalColab => {
        const sb = cliente();
        const canal = sb.channel(`doc-colab:${espacioId}`, {
            config: { broadcast: { self: false, ack: false }, presence: { key: claveTab } },
        });
        canal.on("broadcast", { event: "*" }, (mensaje: { event?: string; payload?: unknown }) => {
            const carga = mensaje?.payload;
            if (typeof mensaje?.event !== "string" || !carga || typeof carga !== "object") return;
            oyentes.alEvento(mensaje.event, carga as Record<string, unknown>);
        });
        canal.on("presence", { event: "sync" }, () => {
            try {
                oyentes.alPresencia(canal.presenceState() as Record<string, unknown[]>);
            } catch {
                /* noop */
            }
        });
        canal.subscribe((estado: string) => {
            oyentes.alEstado(estado === "SUBSCRIBED");
        });
        return {
            enviar: (evento, carga) => {
                void canal.send({ type: "broadcast", event: evento, payload: carga }).catch(() => {});
            },
            anunciar: (estado) => {
                void canal.track(estado).catch(() => {});
            },
            cerrar: () => {
                try {
                    void canal.untrack().catch(() => {});
                    void sb.removeChannel(canal);
                } catch {
                    /* noop */
                }
            },
        };
    };

    return { leer, leerRev, escribir, abrirCanal };
}
