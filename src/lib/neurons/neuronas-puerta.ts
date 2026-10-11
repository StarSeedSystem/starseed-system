/**
 * neuronas-puerta.ts — las neuronas por la PUERTA de datos del A1 (PDA1012 · fase 2).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Lo medido el 2026-10-10 (architecture/puerta-datos-a1.md §1): `neuron_devices` era el tercer
 * consumidor de Supabase (3.809 peticiones/día), casi todo el sondeo «¿quién sigue vivo?» y el
 * latido ligero que solo mueve `last_seen_at`. Ese tráfico es justo lo que el contrato manda al A1:
 *
 *   · El LATIDO ligero (cada 5 min) va a `POST /v1/neuronas/latido` de la puerta. La ficha completa
 *     (nombre, capacidades, medios: el REGISTRO) sigue subiendo a Supabase al abrir y cada 30 min,
 *     así que la fila nunca deja de existir; la puerta replica `last_seen_at` por lotes.
 *   · La LISTA lee el registro de Supabase (al abrir y cada 30 min con la puerta sana; cada 5 min
 *     sin ella, como antes) y la VIDA de cada neurona de `GET /v1/neuronas` (solo las de ESTA cuenta,
 *     la misma regla de la RLS), que no cuesta ninguna petición a Supabase.
 *
 * Si la puerta no está configurada, está apagada en esta neurona o no responde, todo va a Supabase
 * como hasta hoy (el adaptador `puerta-a1.ts` elige solo y cuenta cada vía). Sin `node:*`.
 */

import { puertaA1, type NeuronaViva, type PuertaA1, type Resultado } from "@/lib/datos/puerta-a1";

/** Con la puerta sana, el REGISTRO (nombre, capacidades) se relee de Supabase cada 30 min. */
export const LISTA_REGISTRO_CON_PUERTA_MS = 30 * 60_000;

export type ViaLatido = "puerta" | "supabase" | "cola" | "rechazo";

/**
 * Un latido ligero de ESTA neurona. Por la puerta si responde; si no, `respaldo` (la actualización
 * de `last_seen_at` en Supabase de siempre). Devuelve por dónde fue y lo que devolvió el respaldo.
 */
export async function latirNeuronaPorPuerta<T>(
    datos: { neurona: string; medio?: string; senales?: unknown },
    respaldo: () => Promise<T>,
    puerta: Pick<PuertaA1, "latirNeurona"> = puertaA1(),
): Promise<{ via: ViaLatido; respaldo: T | null }> {
    const limpio = {
        neurona: String(datos.neurona || "").slice(0, 80),
        ...(datos.medio ? { medio: String(datos.medio).slice(0, 40) } : {}),
        ...(datos.senales !== undefined ? { senales: datos.senales } : {}),
    };
    const r = (await puerta.latirNeurona(limpio, respaldo as () => Promise<unknown>)) as Resultado<unknown>;
    return { via: r.via, respaldo: r.via === "supabase" ? ((r.datos as T) ?? null) : null };
}

/**
 * La vida de las neuronas de esta cuenta según la puerta: `{id → visto (ISO)}`, o `null` si la
 * puerta no está o no respondió (entonces manda `last_seen_at` de Supabase, como antes).
 */
export async function vivasDeLaPuerta(puerta: Pick<PuertaA1, "neuronas"> = puertaA1()): Promise<Map<string, string> | null> {
    try {
        const r = await puerta.neuronas();
        if (r.via !== "puerta" || !r.datos || !Array.isArray(r.datos.neuronas)) return null;
        const vivas = new Map<string, string>();
        for (const n of r.datos.neuronas as NeuronaViva[]) {
            if (n && typeof n.neurona === "string" && typeof n.visto === "string" && Number.isFinite(Date.parse(n.visto))) {
                vivas.set(n.neurona, n.visto);
            }
        }
        return vivas;
    } catch {
        return null;
    }
}

/**
 * PURA. Funde la vida que dice la puerta con las filas del registro: `last_seen_at` = la más nueva
 * de las dos (la puerta va por delante entre réplica y réplica; Supabase manda si la puerta no la
 * conoce todavía). No crea filas: una neurona que solo está en la puerta no se inventa en la lista.
 */
export function fundirVivas<F extends { id?: unknown; last_seen_at?: unknown }>(
    filas: readonly F[],
    vivas: ReadonlyMap<string, string> | null,
): F[] {
    if (!vivas || vivas.size === 0) return [...filas];
    return filas.map((f) => {
        const visto = vivas.get(String(f.id ?? ""));
        if (!visto) return f;
        const actual = typeof f.last_seen_at === "string" ? Date.parse(f.last_seen_at) : NaN;
        if (Number.isFinite(actual) && actual >= Date.parse(visto)) return f;
        return { ...f, last_seen_at: visto };
    });
}
