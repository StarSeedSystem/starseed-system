/**
 * Avatares 3D · CALIDAD AUTOMÁTICA (AV1011). Contrato: architecture/astraura-avatares-3d.md §6.
 *
 * El MISMO ADN se ve en un móvil, en unas Quest o en un PC potente: cambia cuánto se dibuja, no quién
 * eres. Cada nivel de avatar de StarSeed XR (`AvatarCalidad`) tiene un presupuesto, y `adnParaCalidad`
 * recorta el ADN por prioridad (primero lo que más te identifica). PURO.
 */
import type { AvatarCalidad } from "@/lib/xr/calidad-perfiles";
import type { AdnAvatar, Expresion, SlotPieza } from "./adn";

export interface PresupuestoAvatar {
  forma: "orbe" | "malla";
  triangulos: number;
  texturaPx: number;
  expresiones: number;
  piezas: number;
  fisicaPelo: boolean;
}

export const PRESUPUESTO_POR_CALIDAD: Record<AvatarCalidad, PresupuestoAvatar> = {
  "orbe-manos": { forma: "orbe", triangulos: 2_000, texturaPx: 0, expresiones: 0, piezas: 0, fisicaPelo: false },
  "cabeza-manos": { forma: "malla", triangulos: 10_000, texturaPx: 512, expresiones: 6, piezas: 3, fisicaPelo: false },
  "vrm-ligero": { forma: "malla", triangulos: 25_000, texturaPx: 1024, expresiones: 10, piezas: 6, fisicaPelo: false },
  vrm: { forma: "malla", triangulos: 60_000, texturaPx: 2048, expresiones: 18, piezas: 11, fisicaPelo: true },
  "vrm-completo": { forma: "malla", triangulos: 120_000, texturaPx: 4096, expresiones: 18, piezas: 11, fisicaPelo: true },
};

/** Primero lo que hace que hables y parpadees (visemas, parpadeo), luego emociones y mirada. */
export const PRIORIDAD_EXPRESIONES: readonly Expresion[] = [
  "aa", "blink", "happy", "ih", "ou", "ee", "oh", "sad", "angry", "surprised",
  "relaxed", "neutral", "blinkLeft", "blinkRight", "lookUp", "lookDown", "lookLeft", "lookRight",
];
/** Primero lo que más se ve de lejos. */
export const PRIORIDAD_PIEZAS: readonly SlotPieza[] = [
  "cabeza", "cabello", "torso", "piernas", "cara", "pies", "manos", "accesorio-1", "espalda", "accesorio-2", "mascota",
];

/** ADN recortado para un nivel. Si el nivel es «orbe», el avatar se ve como su orbe con el aura del ADN. */
export function adnParaCalidad(adn: AdnAvatar, calidad: AvatarCalidad): { adn: AdnAvatar; presupuesto: PresupuestoAvatar } {
  const presupuesto = PRESUPUESTO_POR_CALIDAD[calidad];
  if (presupuesto.forma === "orbe" || adn.base.tipo === "orbe") {
    return { adn: { ...adn, base: { tipo: "orbe" }, piezas: [], expresionBase: {} }, presupuesto };
  }
  const exps = new Set(PRIORIDAD_EXPRESIONES.slice(0, presupuesto.expresiones));
  const slots = new Set(PRIORIDAD_PIEZAS.slice(0, presupuesto.piezas));
  const expresionBase: AdnAvatar["expresionBase"] = {};
  for (const [k, v] of Object.entries(adn.expresionBase) as [Expresion, number][]) if (exps.has(k)) expresionBase[k] = v;
  return { adn: { ...adn, piezas: adn.piezas.filter((p) => slots.has(p.slot)), expresionBase }, presupuesto };
}
