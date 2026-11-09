/**
 * Atajos de teclado de la llamada en escritorio (LLA1108G) — PURO. M micrófono, V cámara, S compartir pantalla,
 * F pantalla completa. No se disparan al escribir en un campo, con Ctrl/Alt/Cmd pulsados ni sin llamada viva
 * (así no estorban al chat ni a los atajos del sistema).
 */
export type AccionAtajo = "micro" | "camara" | "pantalla" | "completa";

export interface EventoTecla {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  /** Tipo de elemento donde se pulsó (`INPUT`, `TEXTAREA`, `SELECT`…) y si es editable. */
  etiqueta?: string;
  editable?: boolean;
}

const POR_TECLA: Record<string, AccionAtajo> = { m: "micro", v: "camara", s: "pantalla", f: "completa" };

export function accionDeTecla(e: EventoTecla, viva: boolean): AccionAtajo | null {
  if (!viva || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  const et = (e.etiqueta ?? "").toUpperCase();
  if (e.editable || et === "INPUT" || et === "TEXTAREA" || et === "SELECT") return null;
  return POR_TECLA[e.key.toLowerCase()] ?? null;
}

export const AYUDA_ATAJOS = "Atajos: M micrófono · V cámara · S compartir pantalla · F pantalla completa · Esc salir de pantalla completa";
