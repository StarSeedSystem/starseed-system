/**
 * Estado del aparato para la cabecera del Centro de Control (puro).
 * ─────────────────────────────────────────────────────────────────────────────
 * Solo se muestra lo que el navegador DA: la batería existe únicamente en Chromium (Battery Status
 * API) y el tipo de red en Chromium (Network Information API). Lo que no hay, no se pinta ni se
 * inventa. «Neurona» es el aparato y el medio es cómo se abre el OS en él (ver CLAUDE.md §11).
 */

export interface Bateria {
  /** 0–1 */
  nivel: number;
  cargando: boolean;
}

export interface Red {
  enLinea: boolean;
  /** «4G», «3G», «2G» o «Lenta»; null si el navegador no lo dice. */
  tipo: string | null;
  ahorroDatos: boolean;
}

export interface EstadoAparato {
  bateria: Bateria | null;
  red: Red;
  /** Etiqueta del medio («Chrome 154 · app instalada»); null mientras no se conoce. */
  medio: string | null;
  /** null = aún comprobando. */
  sesion: boolean | null;
}

export type TonoChip = "ok" | "aviso" | "alerta" | "neutro";

export type IdChip = "bateria" | "red" | "neurona" | "sesion";

export interface ChipEstado {
  id: IdChip;
  texto: string;
  /** Frase completa para el tooltip y los lectores de pantalla. */
  descripcion: string;
  tono: TonoChip;
  /** Solo la batería: qué icono pintar. */
  variante?: "cargando" | "baja" | "normal";
}

export function porcentajeBateria(b: Bateria): number {
  return Math.min(100, Math.max(0, Math.round((Number.isFinite(b.nivel) ? b.nivel : 0) * 100)));
}

export function tonoBateria(b: Bateria): TonoChip {
  if (b.cargando) return "ok";
  const p = porcentajeBateria(b);
  if (p <= 15) return "alerta";
  if (p <= 30) return "aviso";
  return "ok";
}

export function etiquetaTipoRed(effectiveType: string | null | undefined): string | null {
  switch ((effectiveType ?? "").toLowerCase()) {
    case "4g":
      return "4G";
    case "3g":
      return "3G";
    case "2g":
      return "2G";
    case "slow-2g":
      return "Lenta";
    default:
      return null;
  }
}

/** Lo que el navegador declara de la red (todo opcional). */
export interface NavegadorRed {
  onLine?: boolean;
  connection?: { effectiveType?: string; saveData?: boolean } | null;
}

export function redDesdeNavegador(nav: NavegadorRed | null | undefined): Red {
  const c = nav?.connection ?? null;
  return {
    enLinea: nav?.onLine !== false,
    tipo: etiquetaTipoRed(c?.effectiveType),
    ahorroDatos: c?.saveData === true,
  };
}

export function construirChips(e: EstadoAparato): ChipEstado[] {
  const chips: ChipEstado[] = [];

  if (e.bateria) {
    const p = porcentajeBateria(e.bateria);
    chips.push({
      id: "bateria",
      texto: `${p} %`,
      descripcion: `Batería al ${p} %${e.bateria.cargando ? ", cargando" : ""}`,
      tono: tonoBateria(e.bateria),
      variante: e.bateria.cargando ? "cargando" : p <= 15 ? "baja" : "normal",
    });
  }

  chips.push(
    e.red.enLinea
      ? {
          id: "red",
          texto: e.red.tipo ? `En línea · ${e.red.tipo}` : "En línea",
          descripcion: `Con conexión${e.red.tipo ? ` (${e.red.tipo})` : ""}${e.red.ahorroDatos ? ", ahorro de datos activado" : ""}`,
          tono: e.red.tipo === "2G" || e.red.tipo === "Lenta" ? "aviso" : "ok",
        }
      : {
          id: "red",
          texto: "Sin conexión",
          descripcion: "Sin conexión a internet: el OS sigue funcionando con lo guardado en este aparato",
          tono: "alerta",
        },
  );

  chips.push({
    id: "neurona",
    texto: "Esta neurona",
    descripcion: e.medio ? `Esta neurona · abierta en ${e.medio}` : "Esta neurona",
    tono: "neutro",
  });

  chips.push(
    e.sesion === null
      ? { id: "sesion", texto: "Comprobando…", descripcion: "Comprobando la sesión StarSeed", tono: "neutro" }
      : e.sesion
        ? { id: "sesion", texto: "Sesión activa", descripcion: "Sesión StarSeed activa: tus ajustes viajan con la cuenta", tono: "ok" }
        : { id: "sesion", texto: "Sin sesión", descripcion: "Sin sesión: tus ajustes solo se guardan en este aparato", tono: "aviso" },
  );

  return chips;
}

/** Clases por tono (estáticas: Tailwind solo ve las que están escritas enteras). */
export const CLASES_TONO: Record<TonoChip, string> = {
  ok: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  aviso: "border-amber-300/40 bg-amber-400/15 text-amber-200",
  alerta: "border-red-400/40 bg-red-500/15 text-red-200",
  neutro: "border-white/15 bg-white/[0.06] text-amber-50/80",
};
