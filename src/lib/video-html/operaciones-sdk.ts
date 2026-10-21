import type { Operacion } from "@/lib/protomolecula/tipos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";

export type SdkOrder =
  | { type: "setText"; target: string; value: string }
  | { type: "setStyle"; target: string; styles: Record<string, string> }
  | { type: "setTiming"; target: string; start: number; duration: number }
  | { type: "setAttribute"; target: string; name: string; value: string }
  | { type: "setVariableValue"; id: string; value: ValorParametro };

export type SdkOrderOrNull = SdkOrder | null;

export function operacionASdkOrder(operacion: Operacion): SdkOrderOrNull {
  const { objetivo, accion } = operacion;
  const [elementoId, propiedadPath] = objetivo.parametroId.split("::");

  if (!elementoId || !propiedadPath) {
    throw new Error(`Invalid parametroId format: ${objetivo.parametroId}`);
  }

  // Reject GSAP-related properties
  if (/gsap/i.test(propiedadPath)) {
    return null;
  }

  // Reject non-allowed properties: on* and src with javascript:
  if (/^on/.test(propiedadPath)) {
    return null;
  }
  if (propiedadPath === "src" && typeof accion === "object" && accion.tipo === "exacta" && typeof accion.valor === "string" && accion.valor.startsWith("javascript:")) {
    return null;
  }

  // Only support exacta actions for now
  if (accion.tipo !== "exacta") {
    return null;
  }

  const value = accion.valor;

  // Map propiedadPath to SDK order
  if (propiedadPath === "textContent") {
    return { type: "setText", target: elementoId, value: String(value) };
  }

  if (propiedadPath.startsWith("style.")) {
    const styleProp = propiedadPath.slice(6); // remove "style."
    return { type: "setStyle", target: elementoId, styles: { [styleProp]: String(value) } };
  }

  if (propiedadPath.startsWith("vars.")) {
    const variableId = propiedadPath.slice(5); // remove "vars."
    return { type: "setVariableValue", id: variableId, value: value };
  }

  // Assume it's an attribute
  return { type: "setAttribute", target: elementoId, name: propiedadPath, value: String(value) };
}