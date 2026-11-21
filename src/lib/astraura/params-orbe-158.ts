/**
 * Canal `params` de la orbe — lo que publica Astraura 1.58-bit.
 * ----------------------------------------------------------------------------
 * El bus (`quantum-orb-bus.ts`) y su canal `params` ya existen, y el
 * troceador local de cláusulas publica una heurística de respaldo
 * (`vector-por-clausula.ts`). Faltaba el camino REAL: que el backend 1.58-bit
 * emita su propio vector visual por cláusula mientras genera y que el OS lo
 * reenvíe tal cual al bus, para que Nexus/Exocortex lo consuman.
 *
 * Contrato del backend (SSE `/api/chat/stream`, WS `/ws/chat` o JSON):
 *   `data: {"type":"params","params":{"turbulence":0.7,...}}`
 *   `data: {"type":"params","turbulence":0.7,...}`          (forma plana)
 *   `{"response":"…","params":{"turbulence":0.7,...}}`      (sin stream)
 *
 * Aquí no se inventan valores: solo se validan (cinco claves, números
 * finitos, 0..1). Un vector vacío o inválido no se emite. Sin `any`, sin DOM
 * y sin lanzar: la publicación nunca puede romper un turno.
 */
import { emitQuantumOrbParams } from "@/lib/aurora/quantum-orb-bus";
import type { QuantumOrbParams } from "@/lib/aurora/quantum-orb-theme";

const CLAVES = ["turbulence", "spikiness", "symmetry", "hueShift", "breath"] as const;
type ClaveVector = (typeof CLAVES)[number];

const acotar = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Vector recibido del 1.58b → `Partial<QuantumOrbParams>` seguro. Se queda
 * SOLO con las cinco claves conocidas, descarta lo que no sea número finito y
 * recorta a 0..1 (redondeo a milésimas). Pura y determinista.
 */
export function vectorDeParams158(valor: unknown): Partial<QuantumOrbParams> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  const origen = valor as Record<string, unknown>;
  const vector: Partial<Record<ClaveVector, number>> = {};
  for (const clave of CLAVES) {
    const n = origen[clave];
    if (typeof n === "number" && Number.isFinite(n)) {
      vector[clave] = Math.round(acotar(n) * 1000) / 1000;
    }
  }
  return vector;
}

/**
 * Publica en el canal `params` lo que manda el 1.58b. Acepta la forma anidada
 * (`{ params: {…} }`) y la plana (`{ turbulence: … }`). Devuelve `true` solo
 * si había al menos un parámetro válido. Nunca lanza.
 */
export function publicarParamsDeOrbe158(valor: unknown): boolean {
  try {
    const bruto =
      valor && typeof valor === "object" && !Array.isArray(valor) &&
      "params" in (valor as Record<string, unknown>)
        ? (valor as Record<string, unknown>).params
        : valor;
    const vector = vectorDeParams158(bruto);
    if (Object.keys(vector).length === 0) return false;
    emitQuantumOrbParams(vector);
    return true;
  } catch {
    return false;
  }
}
