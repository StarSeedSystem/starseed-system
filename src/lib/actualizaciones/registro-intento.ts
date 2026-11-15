/**
 * ════════════════════════════════════════════════════════════════════════════
 * (ACT1115H · 2026-11-15) Cada intento de actualizar deja UNA línea en el registro que cada aparato ya copia
 * (el Registro del enlace → ~/Library/Logs/app.starseed.os/enlaces.log, vía el hito «web-version»):
 *
 *   actualizacion canal=pruebas instalada=0.5.1-prueba.44 ofrecida=0.5.1-prueba.45 paso=buscar resultado=ofrecida motivo=…
 *
 * Se lee con  grep 'actualizacion canal=' ~/Library/Logs/app.starseed.os/enlaces.log
 * Antes el 15-11 tres aparatos no se actualizaron y los registros no decían nada de por qué. Nunca lanza y
 * no escribe nada sensible: solo versiones, el paso y el motivo en palabras.
 * ════════════════════════════════════════════════════════════════════════════
 */

export type PasoActualizacion = "buscar" | "descargar" | "verificar" | "instalar";

export interface IntentoActualizacion {
  canal: "oficial" | "pruebas";
  instalada: string | null;
  ofrecida: string | null;
  paso: PasoActualizacion;
  /** «ofrecida», «al-dia», «ya-vista», «preparando», «error», «ok»… */
  resultado: string;
  motivo: string;
}

const limpio = (v: string | null | undefined, max: number): string =>
  String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** La línea del intento. Pura. */
export function lineaIntento(i: IntentoActualizacion): string {
  const v = (x: string | null) => limpio(x, 60).replace(/\s/g, "_") || "-";
  return `actualizacion canal=${i.canal} instalada=${v(i.instalada)} ofrecida=${v(i.ofrecida)} paso=${i.paso} resultado=${limpio(i.resultado, 30).replace(/\s/g, "-") || "-"} motivo=${limpio(i.motivo, 160) || "-"}`;
}

/** Sumidero de pruebas: recibe cada línea además del registro. */
let sumidero: ((linea: string) => void) | null = null;
export function fijarSumideroIntentos(f: ((linea: string) => void) | null): void {
  sumidero = f;
}

/** Anota el intento en el registro del aparato. Nunca lanza. */
export function anotarIntento(i: IntentoActualizacion): string {
  const linea = lineaIntento(i);
  try {
    sumidero?.(linea);
  } catch {
    /* el sumidero de prueba no tumba nada */
  }
  if (typeof window === "undefined") return linea;
  void import("@/lib/llamadas/voz-datos/diagnostico")
    .then((m) => m.anotarLlamada("web-version", null, linea))
    .catch(() => undefined);
  return linea;
}
