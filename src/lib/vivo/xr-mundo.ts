"use client";

/**
 * StarSeed XR · capa `mundo` de la entidad viva (contrato §2.2 y §3 g).
 * Una sala XR es UNA fila de `os_spaces`: `doc` sigue siendo el `DocEscena` que el 2D
 * entiende y `mundo` guarda el `MundoSpec` declarativo, validado antes de escribir.
 * La columna `mundo` la añade la migración de persistencia XR; sin ella, guardar lo dice.
 */

import { createClient } from "@/utils/supabase/client";
import { validarMundo, type ProblemaMundo } from "@/lib/xr/mundo-spec";
import { TERRENOS, type CieloMundo, type MundoSpec, type ObjetoMundo } from "@/lib/xr/mundo-tipos";

export type { ProblemaMundo } from "@/lib/xr/mundo-spec";

export const problemasLegibles = (ps: ProblemaMundo[]): string[] =>
    ps.filter((p) => p.gravedad === "error").map((p) => `${p.ruta}: ${p.mensaje} ${p.arreglo}`);

/** Guarda el mundo en la MISMA fila de la sala. Valida primero y se niega con los problemas. */
export async function guardarMundo(refId: string, mundo: MundoSpec): Promise<void> {
    const r = validarMundo(mundo);
    if (!r.ok || !r.mundo) throw new Error(`El mundo no es válido: ${problemasLegibles(r.problemas).join(" · ")}`);
    try {
        const fila: Record<string, unknown> = { mundo: r.mundo };
        const { error } = await createClient().from("os_spaces").update(fila).eq("id", refId);
        if (error) throw new Error(error.message);
    } catch (e) {
        throw new Error(`No pude guardar el mundo: ${e instanceof Error ? e.message : "sin conexión con el servidor"}.`);
    }
}

/** Lee la capa `mundo` de una sala; `null` si no hay, no es válida o no se puede leer. */
export async function leerMundo(refId: string): Promise<MundoSpec | null> {
    if (!/^[0-9a-f-]{36}$/i.test(refId)) return null;
    try {
        const { data, error } = await createClient().from("os_spaces").select("*").eq("id", refId).maybeSingle();
        if (error || !data) return null;
        const r = validarMundo((data as Record<string, unknown>).mundo);
        return r.ok ? r.mundo : null;
    } catch {
        return null;
    }
}

const normalizar = (v: string): string => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const CIELOS: [RegExp, CieloMundo][] = [
    [/\b(?:sin cielo|ningun cielo|passthrough)\b/, "ninguno"],
    [/\b(?:nebulosa|galaxia|espacio|estrellas)\b/, "nebulosa"],
    [/\b(?:amanecer|alba|madrugada)\b/, "amanecer"],
    [/\b(?:mediodia|de dia|soleado)\b/, "mediodia"],
    [/\b(?:atardecer|ocaso)\b/, "atardecer"],
    [/\b(?:noche|nocturno)\b/, "noche"],
    [/\b(?:estudio|neutro|fondo blanco)\b/, "estudio"],
];

/** Mundo base determinista para la ruta «reflejo»: solo vocabulario cerrado, sin red. */
export function mundoDesdePlantilla(descripcion: string, caracteristicas: string[] = []): MundoSpec {
    const texto = normalizar([descripcion, ...caracteristicas].join(" "));
    const cielo = CIELOS.find(([r]) => r.test(texto))?.[1] ?? "nebulosa";
    const cero = /\b(?:gravedad cero|sin gravedad|flotando|ingravido|flotante)\b/.test(texto);
    const gravedad = cero ? 0 : /\b(?:gravedad (?:de la )?luna|lunar)\b/.test(texto) ? -1.62 : -9.81;
    const terreno = TERRENOS.find((t) => t !== "plano" && texto.includes(t)) ?? (texto.includes("mar") ? "agua" : "plano");
    const modo = /\b(?:en ar|realidad aumentada|passthrough|en mi (?:cuarto|habitacion|casa|salon))\b/.test(texto) ? "ar" : /\b(?:en vr|realidad virtual|inmersivo)\b/.test(texto) ? "vr" : "ambos";
    const objetos: ObjetoMundo[] = /\bmesas?\b/.test(texto)
        ? [0, 1, 2].map((i): ObjetoMundo => ({
            id: `mesa-${i + 1}`, nombre: `Mesa flotante ${i + 1}`, fuente: { tipo: "primitiva", forma: "caja" },
            pos: [i * 1.4 - 1.4, 1.2, -2.2], rot: [0, 0, 0], esc: [1, 0.08, 0.6], color: "#7c5cff", prioridad: 1,
            cuerpo: { tipo: cero ? "dinamico" : "fijo", forma: "caja", masa: 4, rebote: 0.1, friccion: 0.5, agarrable: true },
        }))
        : [];
    const nombre = (descripcion.trim() || "Mundo XR").slice(0, 60);
    return {
        version: 1, tipo: "mundo-xr", nombre, ...(descripcion.trim() ? { descripcion: descripcion.trim().slice(0, 280) } : {}),
        modo, entorno: { cielo, terreno, tamano: 40, colorSuelo: "#1c1b2e", semilla: 1, alturaMax: 2 },
        fisica: { gravedad, suelo: true }, interaccion: { tocar: "observador", agarrar: "editor" }, maxJugadores: 8,
        spawns: [{ id: "entrada", pos: [0, 0, 0], yaw: 0 }],
        luces: [{ id: "luz", clase: "ambiente", pos: [0, 3, 0], color: "#ffffff", intensidad: 1, alcance: 0 }],
        objetos, portales: [], zonas: [], pizarras: [], pantallas: [], reglas: [],
    };
}
