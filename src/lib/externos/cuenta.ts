// ══════════════════════════════════════════════════════════════
// Vista global de vínculos (cuenta) — lógica PURA (2026-09-08, Ola 281 · E6A)
// ──────────────────────────────────────────────────────────────
// Funciones sin red, disco ni procesos para que `ExternosCuenta` (componente
// de cliente) y sus tests compartan la misma lógica de agrupación, estado y
// avisos de caducidad. No importa `node:crypto` ni Supabase.
// ══════════════════════════════════════════════════════════════
import type { AmbitoTipo, Vinculo } from "@/lib/externos/tipos";

/** Estado visible de un vínculo según su caducidad y revocación. */
export type EstadoVinculo = "activo" | "caducado" | "revocado";

export const HORAS_24 = 24 * 60 * 60 * 1000;

/** Etiquetas legibles de cada ámbito (para las tarjetas de resumen). */
export const ETIQUETAS_AMBITO: Record<AmbitoTipo, string> = {
  cuenta: "Toda la cuenta",
  chat: "Chats",
  personalidad: "Personalidades",
  agente: "Agentes",
  cerebro: "Cerebros",
  carpeta: "Carpetas",
  memoria: "Memoria",
  perfil: "Perfiles",
};

/** Clasifica un vínculo: revocado manda por encima de la caducidad. */
export function estadoVinculo(v: Pick<Vinculo, "revocado_en" | "expira_en">, ahora = Date.now()): EstadoVinculo {
  if (v.revocado_en) return "revocado";
  if (v.expira_en && new Date(v.expira_en).getTime() <= ahora) return "caducado";
  return "activo";
}

/** Verdadero si el vínculo caduca en menos de `ms` milisegundos (y aún no caduca). */
export function caducaEnMenosDeMs(
  v: Pick<Vinculo, "revocado_en" | "expira_en">,
  ms: number,
  ahora = Date.now(),
): boolean {
  if (v.revocado_en || !v.expira_en) return false;
  const t = new Date(v.expira_en).getTime();
  return t > ahora && t - ahora < ms;
}

/** Agrupa los vínculos por ámbito; devuelve el número de activos en cada uno. */
export function activosPorAmbito(vinculos: Vinculo[]): Record<AmbitoTipo, number> {
  const contador = {} as Record<AmbitoTipo, number>;
  for (const a of Object.keys(ETIQUETAS_AMBITO) as AmbitoTipo[]) contador[a] = 0;
  for (const v of vinculos) {
    if (estadoVinculo(v) === "activo") contador[v.ambito_tipo] += 1;
  }
  return contador;
}